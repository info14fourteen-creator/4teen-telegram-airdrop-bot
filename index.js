require('dotenv').config()

const express = require('express')
const { Telegraf, Markup } = require('telegraf')
const TronWeb = require('tronweb')

const config = require('./config')

const app = express()
const bot = new Telegraf(process.env.BOT_TOKEN)

// Подключение к TRON
const tronWeb = new TronWeb({
  fullHost: config.TRON_FULL_NODE,
  privateKey: process.env.TRON_PRIVATE_KEY || ''
})

// Храним пользователей, которые прошли проверку membership
// Пока это временно в памяти. Позже вынесем в базу / файл.
const verifiedUsers = new Set()

// Защита от повторных клеймов в рамках одного запуска процесса
const claimedUsers = new Set()
const claimedWallets = new Set()

function isValidTronAddress(address) {
  try {
    return TronWeb.isAddress(address)
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
3️⃣ Send your TRON wallet address`,
    Markup.inlineKeyboard([
      [
        Markup.button.url('Join Community', 'https://t.me/The4teenToken'),
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

  if (groupMember || channelMember) {
    verifiedUsers.add(userId)

    await ctx.reply(
      '✅ Membership confirmed.\n\nNow send your TRON wallet address in the next message.'
    )
  } else {
    await ctx.reply(
      '❌ You must join the community or channel first, then press VERIFY again.'
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

  if (claimedUsers.has(userId)) {
    await ctx.reply(
      '⚠️ This Telegram account has already claimed the reward.'
    )
    return
  }

  if (!isValidTronAddress(text)) {
    await ctx.reply(
      '❌ This does not look like a valid TRON wallet address.\n\nPlease send a correct address that starts with T.'
    )
    return
  }

  const walletAddress = text

  if (claimedWallets.has(walletAddress)) {
    await ctx.reply(
      '⚠️ This wallet has already received a reward.'
    )
    return
  }

  const rewardAmount = getRandomReward()

  try {
    const result = await sendAirdrop(walletAddress, rewardAmount)

    claimedUsers.add(userId)
    claimedWallets.add(walletAddress)
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

bot.launch()
  .then(() => {
    console.log('Bot running')
  })
  .catch((error) => {
    console.error('Bot launch error:', error)
  })

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
