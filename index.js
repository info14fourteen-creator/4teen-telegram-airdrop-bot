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

// TRON connection
const tronWeb = new TronWeb({
  fullHost: config.TRON_FULL_NODE,
  privateKey: process.env.TRON_PRIVATE_KEY || ''
})

// Runtime-only state for users who passed membership check
const verifiedUsers = new Set()

// Conservative resource requirements per one airdrop transaction
const REQUIRED_ENERGY_PER_AIRDROP = 76000
const REQUIRED_BANDWIDTH_PER_AIRDROP = 400

function isValidTronAddress(address) {
  try {
    return tronWeb.isAddress(address)
  } catch (error) {
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

function getRandomReward() {
  return Math.floor(
    Math.random() * (config.MAX_REWARD - config.MIN_REWARD + 1)
  ) + config.MIN_REWARD
}

function toRawAmount(amount) {
  return amount * Math.pow(10, config.TOKEN_DECIMALS)
}

function hashValue(value) {
  const salt = process.env.HASH_SALT || ''

  return crypto
    .createHash('sha256')
    .update(`${salt}:${value}`)
    .digest('hex')
}

function getOperatorAddress() {
  if (!process.env.TRON_PRIVATE_KEY) {
    throw new Error('TRON_PRIVATE_KEY is not configured')
  }

  return tronWeb.address.fromPrivateKey(process.env.TRON_PRIVATE_KEY)
}

async function getOperatorResources() {
  const operatorAddress = getOperatorAddress()

  const resources = await tronWeb.trx.getAccountResources(operatorAddress)
  const bandwidthInfo = await tronWeb.trx.getAccount(operatorAddress)

  const energyLimit = resources.EnergyLimit || 0
  const energyUsed = resources.EnergyUsed || 0
  const energyAvailable = Math.max(0, energyLimit - energyUsed)

  const freeNetLimit = bandwidthInfo.free_net_limit || 0
  const freeNetUsed = bandwidthInfo.free_net_used || 0
  const freeBandwidthAvailable = Math.max(0, freeNetLimit - freeNetUsed)

  const netLimit = bandwidthInfo.net_limit || 0
  const netUsed = bandwidthInfo.net_used || 0
  const stakedBandwidthAvailable = Math.max(0, netLimit - netUsed)

  const bandwidthAvailable = freeBandwidthAvailable + stakedBandwidthAvailable

  return {
    operatorAddress,
    energyAvailable,
    bandwidthAvailable,
    energyLimit,
    energyUsed,
    freeNetLimit,
    freeNetUsed,
    netLimit,
    netUsed
  }
}

async function checkResourcesForAirdrop() {
  const info = await getOperatorResources()

  const hasEnoughEnergy = info.energyAvailable >= REQUIRED_ENERGY_PER_AIRDROP
  const hasEnoughBandwidth = info.bandwidthAvailable >= REQUIRED_BANDWIDTH_PER_AIRDROP

  return {
    ...info,
    hasEnoughEnergy,
    hasEnoughBandwidth,
    hasEnoughResources: hasEnoughEnergy && hasEnoughBandwidth
  }
}

async function sendAirdrop(walletAddress, rewardAmount) {
  if (!process.env.TRON_PRIVATE_KEY) {
    throw new Error('TRON_PRIVATE_KEY is not configured')
  }

  const rewardRaw = toRawAmount(rewardAmount)
  const contract = await tronWeb.contract().at(config.AIRDROP_CONTRACT)

  const tx = await contract
    .airdrop(walletAddress, rewardRaw, config.TELEGRAM_PLATFORM_BIT)
    .send()

  return {
    txid: tx,
    rewardRaw
  }
}

bot.start(async (ctx) => {
  await ctx.reply(
    `Welcome to ${config.BOT_NAME}

To receive a random reward (1–5 4TEEN):

1️⃣ Join our Telegram community OR channel
2️⃣ Press VERIFY
3️⃣ If daily resources are available, send your TRON wallet address`,
    Markup.inlineKeyboard([
      [
        Markup.button.url('Join Community', 'https://t.me/fourteentokengroupe'),
        Markup.button.url('Join Channel', 'https://t.me/fourteentoken')
      ],
      [
        Markup.button.callback('VERIFY', 'verify_membership')
      ]
    ])
  )
})

bot.action('verify_membership', async (ctx) => {
  const userId = ctx.from.id

  let groupMember = false
  let channelMember = false

  try {
    const group = await ctx.telegram.getChatMember(config.GROUP_ID, userId)

    if (isAllowedMemberStatus(group.status)) {
      groupMember = true
    }
  } catch (error) {
    console.log('Group membership check error:', error.message)
  }

  try {
    const channel = await ctx.telegram.getChatMember(config.CHANNEL_ID, userId)

    if (isAllowedMemberStatus(channel.status)) {
      channelMember = true
    }
  } catch (error) {
    console.log('Channel membership check error:', error.message)
  }

  try {
    await ctx.answerCbQuery()
  } catch (error) {
    console.log('Callback answer error:', error.message)
  }

  if (!(groupMember || channelMember)) {
    await ctx.reply(
      '❌ You must join the community or channel first, then press VERIFY again.'
    )
    return
  }

  try {
    const resourceCheck = await checkResourcesForAirdrop()

    if (!resourceCheck.hasEnoughResources) {
      await ctx.reply(
        `⚠️ Daily airdrop capacity is currently exhausted.

Available now:
Energy: ${resourceCheck.energyAvailable}
Bandwidth: ${resourceCheck.bandwidthAvailable}

Required for one claim:
Energy: ${REQUIRED_ENERGY_PER_AIRDROP}
Bandwidth: ${REQUIRED_BANDWIDTH_PER_AIRDROP}

Please try again tomorrow.`
      )
      return
    }

    verifiedUsers.add(userId)

    await ctx.reply(
      `✅ Membership confirmed.
✅ Daily resources are available for your claim.

Available now:
Energy: ${resourceCheck.energyAvailable}
Bandwidth: ${resourceCheck.bandwidthAvailable}

Now send your TRON wallet address in the next message.`
    )
  } catch (error) {
    console.error('Resource check error:', error)

    await ctx.reply(
      '❌ Failed to check daily resources. Please try again later.'
    )
  }
})

bot.on('text', async (ctx) => {
  const userId = ctx.from.id
  const text = ctx.message.text.trim()

  if (text.startsWith('/start')) {
    return
  }

  if (!verifiedUsers.has(userId)) {
    await ctx.reply(
      '⚠️ First press VERIFY and pass the membership check.'
    )
    return
  }

  const userHash = hashValue(String(userId))

  try {
    const alreadyClaimedByUser = await hasUserClaimed(userHash)

    if (alreadyClaimedByUser) {
      verifiedUsers.delete(userId)

      await ctx.reply(
        '⚠️ This Telegram account has already claimed the reward.'
      )
      return
    }
  } catch (error) {
    console.error('Database user check error:', error)

    await ctx.reply(
      '❌ Database check failed. Please try again later.'
    )
    return
  }

  if (!isValidTronAddress(text)) {
    await ctx.reply(
      '❌ This does not look like a valid TRON wallet address.\n\nPlease send a correct TRON address that starts with T.'
    )
    return
  }

  const walletAddress = text
  const walletHash = hashValue(walletAddress)

  try {
    const alreadyClaimedByWallet = await hasWalletClaimed(walletHash)

    if (alreadyClaimedByWallet) {
      verifiedUsers.delete(userId)

      await ctx.reply(
        '⚠️ This wallet has already received a reward.'
      )
      return
    }
  } catch (error) {
    console.error('Database wallet check error:', error)

    await ctx.reply(
      '❌ Database check failed. Please try again later.'
    )
    return
  }

  try {
    const resourceCheck = await checkResourcesForAirdrop()

    if (!resourceCheck.hasEnoughResources) {
      verifiedUsers.delete(userId)

      await ctx.reply(
        `⚠️ There are no longer enough resources to process your claim today.

Available now:
Energy: ${resourceCheck.energyAvailable}
Bandwidth: ${resourceCheck.bandwidthAvailable}

Please try again tomorrow.`
      )
      return
    }
  } catch (error) {
    console.error('Resource re-check error:', error)

    await ctx.reply(
      '❌ Failed to re-check daily resources. Please try again later.'
    )
    return
  }

  const rewardAmount = getRandomReward()

  try {
    const result = await sendAirdrop(walletAddress, rewardAmount)

    await saveClaim({
      userHash,
      walletHash,
      txid: result.txid,
      rewardAmount
    })

    verifiedUsers.delete(userId)

    await ctx.reply(
      `✅ Airdrop sent successfully!

Wallet: ${walletAddress}
Reward: ${rewardAmount} 4TEEN
Tx: ${result.txid}`
    )
  } catch (error) {
    console.error('Airdrop error:', error)

    if (error.message === 'TRON_PRIVATE_KEY is not configured') {
      await ctx.reply(
        '⚠️ Bot is not fully configured yet. TRON private key is missing.'
      )
      return
    }

    await ctx.reply(
      '❌ Airdrop transaction failed. Please try again later.'
    )
  }
})

app.get('/', (req, res) => {
  res.send('4TEEN bot running')
})

const PORT = process.env.PORT || 3000

async function boot() {
  try {
    await initDb()
    console.log('Database initialized')
  } catch (error) {
    console.error('Database init error:', error)
  }

  try {
    await bot.telegram.deleteWebhook()
    console.log('Old webhook deleted')
  } catch (error) {
    console.log('Webhook delete skipped:', error.message)
  }

  try {
    await bot.launch()
    console.log('Bot running')
  } catch (error) {
    console.error('Bot launch error:', error)
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  boot()
})
