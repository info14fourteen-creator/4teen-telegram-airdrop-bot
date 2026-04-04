require('dotenv').config()

const crypto = require('crypto')
const express = require('express')
const { Telegraf, Markup } = require('telegraf')
const TronWeb = require('tronweb')

const config = require('./config')
const {
  initDb,
  hasUserClaimed,
  hasWalletClaimed,
  saveClaim
} = require('./db')

const app = express()
const bot = new Telegraf(process.env.BOT_TOKEN)

// -------------------------
// TRON connection
// -------------------------
const tronOptions = {
  fullHost: config.TRON_FULL_NODE,
  privateKey: process.env.TRON_PRIVATE_KEY || ''
}

if (process.env.TRONGRID_API_KEY) {
  tronOptions.headers = {
    'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY
  }
}

const tronWeb = new TronWeb(tronOptions)

// -------------------------
const verifiedUsers = new Set()
const slotMessages = new Map()

let airdropQueue = Promise.resolve()

const REQUIRED_ENERGY_PER_AIRDROP = config.REQUIRED_ENERGY_PER_AIRDROP || 65000
const REQUIRED_BANDWIDTH_PER_AIRDROP = config.REQUIRED_BANDWIDTH_PER_AIRDROP || 450

const MIN_ENERGY_FLOOR = Number(
  config.MIN_ENERGY_FLOOR ?? config.MIN_ENERGY_RESERVE ?? 0
)
const MIN_BANDWIDTH_FLOOR = Number(
  config.MIN_BANDWIDTH_FLOOR ?? config.MIN_BANDWIDTH_RESERVE ?? 0
)

const TX_GAP_MS = 1800

const MAX_AIRDROP_RETRIES = 3
const RETRY_DELAYS_MS = [2500, 5000, 8000]

// -------------------------
// Helpers
// -------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAxios429(error) {
  return (
    error &&
    error.response &&
    Number(error.response.status) === 429
  )
}

function isValidTronAddress(address) {
  try {
    return tronWeb.isAddress(address)
  } catch {
    return false
  }
}

function isAllowedMemberStatus(status) {
  return (
    status === 'member' ||
    status === 'administrator' ||
    status === 'creator'
  )
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString('en-US')
}

function formatReward(value) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6
  })
}

function getRandomReward() {
  const minRaw = Math.round(Number(config.MIN_REWARD) * 10 ** config.TOKEN_DECIMALS)
  const maxRaw = Math.round(Number(config.MAX_REWARD) * 10 ** config.TOKEN_DECIMALS)

  const rewardRaw =
    Math.floor(Math.random() * (maxRaw - minRaw + 1)) + minRaw

  return rewardRaw / 10 ** config.TOKEN_DECIMALS
}

function toRawAmount(amount) {
  return Math.round(Number(amount) * 10 ** config.TOKEN_DECIMALS)
}

function hashValue(value) {
  const salt = process.env.HASH_SALT || ''

  return crypto
    .createHash('sha256')
    .update(`${salt}:${value}`)
    .digest('hex')
}

function getOperatorAddress() {
  return tronWeb.address.fromPrivateKey(process.env.TRON_PRIVATE_KEY)
}

async function getOperatorResources() {
  const operatorAddress = getOperatorAddress()
  const resources = await tronWeb.trx.getAccountResources(operatorAddress)

  const energyLimit = resources.EnergyLimit || 0
  const energyUsed = resources.EnergyUsed || 0
  const energyAvailable = Math.max(0, energyLimit - energyUsed)

  const freeNetLimit = resources.freeNetLimit || 0
  const freeNetUsed = resources.freeNetUsed || 0
  const freeBandwidth = Math.max(0, freeNetLimit - freeNetUsed)

  const netLimit = resources.NetLimit || 0
  const netUsed = resources.NetUsed || 0
  const stakedBandwidth = Math.max(0, netLimit - netUsed)

  const bandwidthAvailable = freeBandwidth + stakedBandwidth

  return {
    energyAvailable,
    bandwidthAvailable
  }
}

async function checkResourcesForAirdrop() {
  const info = await getOperatorResources()

  const energyAfterNextAirdrop = info.energyAvailable - REQUIRED_ENERGY_PER_AIRDROP
  const bandwidthAfterNextAirdrop = info.bandwidthAvailable - REQUIRED_BANDWIDTH_PER_AIRDROP

  const energyAboveFloorNow = Math.max(0, info.energyAvailable - MIN_ENERGY_FLOOR)
  const bandwidthAboveFloorNow = Math.max(0, info.bandwidthAvailable - MIN_BANDWIDTH_FLOOR)

  const hasEnoughEnergy = energyAfterNextAirdrop >= MIN_ENERGY_FLOOR
  const hasEnoughBandwidth = bandwidthAfterNextAirdrop >= MIN_BANDWIDTH_FLOOR

  const approxClaimsLeftByEnergy = Math.floor(energyAboveFloorNow / REQUIRED_ENERGY_PER_AIRDROP)
  const approxClaimsLeftByBandwidth = Math.floor(bandwidthAboveFloorNow / REQUIRED_BANDWIDTH_PER_AIRDROP)

  return {
    ...info,
    energyAfterNextAirdrop,
    bandwidthAfterNextAirdrop,
    energyAboveFloorNow,
    bandwidthAboveFloorNow,
    minEnergyFloor: MIN_ENERGY_FLOOR,
    minBandwidthFloor: MIN_BANDWIDTH_FLOOR,
    hasEnoughResources: hasEnoughEnergy && hasEnoughBandwidth,
    approxClaimsLeft: Math.max(0, Math.min(approxClaimsLeftByEnergy, approxClaimsLeftByBandwidth))
  }
}

function buildAvailableSlotMessage(resourceCheck) {
  return `✅ Airdrop slot available!

Energy: ${formatInteger(resourceCheck.energyAvailable)}
Bandwidth: ${formatInteger(resourceCheck.bandwidthAvailable)}
Approx claims available: ${formatInteger(resourceCheck.approxClaimsLeft)}

Press VERIFY and send your TRON wallet address.`
}

function buildNoCapacityMessage(resourceCheck, includeRetryLine = false) {
  const retryLine = includeRetryLine
    ? '\n\nPress CHECK AIRDROP SLOT and try again later.'
    : ''

  return `⚠️ Airdrop capacity is temporarily full.

Energy: ${formatInteger(resourceCheck.energyAvailable)}
Bandwidth: ${formatInteger(resourceCheck.bandwidthAvailable)}
Approx claims available: ${formatInteger(resourceCheck.approxClaimsLeft)}

Resources refill gradually during the day.${retryLine}`
}

async function ctxSafeGetChatMember(chatId, userId) {
  return bot.telegram.getChatMember(chatId, userId)
}

async function isMemberOfGroupOrChannel(userId) {
  let groupMember = false
  let channelMember = false

  try {
    const group = await ctxSafeGetChatMember(config.GROUP_ID, userId)
    if (group && isAllowedMemberStatus(group.status)) groupMember = true
  } catch {}

  try {
    const channel = await ctxSafeGetChatMember(config.CHANNEL_ID, userId)
    if (channel && isAllowedMemberStatus(channel.status)) channelMember = true
  } catch {}

  return groupMember || channelMember
}

async function sendOrUpdateSlotMessage(ctx, text) {
  const userId = ctx.from.id
  const existingMessageId = slotMessages.get(userId)

  try {
    if (existingMessageId) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        existingMessageId,
        null,
        text
      )
    } else {
      const msg = await ctx.reply(text)
      slotMessages.set(userId, msg.message_id)
    }
  } catch {
    const msg = await ctx.reply(text)
    slotMessages.set(userId, msg.message_id)
  }
}

async function sendAirdrop(walletAddress, rewardAmount) {
  const rewardRaw = toRawAmount(rewardAmount)

  const contract = await tronWeb.contract().at(config.AIRDROP_CONTRACT)

  const tx = await contract
    .airdrop(walletAddress, rewardRaw, config.TELEGRAM_PLATFORM_BIT)
    .send()

  return tx
}

async function sendAirdropWithRetry(walletAddress, rewardAmount) {
  let lastError = null

  for (let attempt = 0; attempt < MAX_AIRDROP_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]
        await sleep(delay)
      }

      return await sendAirdrop(walletAddress, rewardAmount)
    } catch (error) {
      lastError = error

      if (!isAxios429(error)) {
        throw error
      }
    }
  }

  throw lastError
}

function enqueueAirdrop(jobFn) {
  const run = airdropQueue.then(jobFn)
  airdropQueue = run.catch(() => {})
  return run
}

// -------------------------
// BOT UI
// -------------------------
bot.start(async (ctx) => {
  await ctx.reply(
`Welcome to ${config.BOT_NAME}

To receive a random reward (1.000001–4.999999 4TEEN):

1️⃣ Join our Telegram community OR channel
2️⃣ Press VERIFY
3️⃣ Send your TRON wallet address

Energy refills gradually during the day.`,
    Markup.inlineKeyboard([
      [
        Markup.button.url('Join Community', 'https://t.me/+wsIZ1b1LtPExNjMx'),
        Markup.button.url('Join Channel', 'https://t.me/fourteentoken')
      ],
      [
        Markup.button.callback('VERIFY', 'verify_membership')
      ],
      [
        Markup.button.callback('CHECK AIRDROP SLOT', 'check_slot')
      ]
    ])
  )
})

// -------------------------
// CHECK SLOT
// -------------------------
bot.action('check_slot', async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}

  try {
    const resourceCheck = await checkResourcesForAirdrop()

    if (!resourceCheck.hasEnoughResources) {
      await sendOrUpdateSlotMessage(ctx, buildNoCapacityMessage(resourceCheck))
      return
    }

    await sendOrUpdateSlotMessage(ctx, buildAvailableSlotMessage(resourceCheck))
  } catch {
    await sendOrUpdateSlotMessage(ctx, '❌ Failed to check resources.')
  }
})

// -------------------------
bot.action('verify_membership', async (ctx) => {
  const userId = ctx.from.id

  try { await ctx.answerCbQuery() } catch {}

  const membershipOk = await isMemberOfGroupOrChannel(userId)

  if (!membershipOk) {
    await ctx.reply('❌ Join the community or channel first.')
    return
  }

  const resourceCheck = await checkResourcesForAirdrop()

  if (!resourceCheck.hasEnoughResources) {
    await ctx.reply(buildNoCapacityMessage(resourceCheck, true))
    return
  }

  verifiedUsers.add(userId)

  await ctx.reply('✅ Membership confirmed. Send your TRON wallet address.')
})

// -------------------------
bot.on('text', async (ctx) => {
  const userId = ctx.from.id
  const text = ctx.message.text.trim()

  if (text.startsWith('/start')) return

  if (!verifiedUsers.has(userId)) {
    await ctx.reply('⚠️ Press VERIFY first.')
    return
  }

  if (!isValidTronAddress(text)) {
    await ctx.reply('❌ Invalid TRON address.')
    return
  }

  const walletAddress = text

  const userHash = hashValue(String(userId))
  const walletHash = hashValue(walletAddress)

  if (await hasUserClaimed(userHash)) {
    verifiedUsers.delete(userId)
    await ctx.reply('⚠️ This Telegram account already claimed.')
    return
  }

  if (await hasWalletClaimed(walletHash)) {
    verifiedUsers.delete(userId)
    await ctx.reply('⚠️ This wallet already received a reward.')
    return
  }

  await ctx.reply('⏳ Processing your claim...')

  enqueueAirdrop(async () => {
    try {
      const resourceCheck = await checkResourcesForAirdrop()

      if (!resourceCheck.hasEnoughResources) {
        verifiedUsers.delete(userId)
        await ctx.reply(buildNoCapacityMessage(resourceCheck))
        return
      }

      const rewardAmount = getRandomReward()

      await sleep(TX_GAP_MS)

      const txid = await sendAirdropWithRetry(walletAddress, rewardAmount)

      await saveClaim({
        userHash,
        walletHash,
        txid,
        rewardAmount: rewardAmount.toFixed(6)
      })

      verifiedUsers.delete(userId)

      await ctx.reply(
`✅ Airdrop sent!

Reward: ${formatReward(rewardAmount)} 4TEEN
Tx: ${txid}`)
    } catch {
      verifiedUsers.delete(userId)
      await ctx.reply('❌ Airdrop failed. Try again later.')
    }
  })
})

// -------------------------
app.get('/', (req, res) => {
  res.send('4TEEN bot running')
})

const PORT = process.env.PORT || 3000

async function boot() {
  await initDb()

  try {
    await bot.telegram.deleteWebhook()
  } catch {}

  await bot.launch()
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  boot()
})
