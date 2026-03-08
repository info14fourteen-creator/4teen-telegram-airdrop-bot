require('dotenv').config()

const express = require('express')
const { Telegraf, Markup } = require('telegraf')
const TronWeb = require('tronweb')

const config = require('./config')

const app = express()
const bot = new Telegraf(process.env.BOT_TOKEN)

// Храним пользователей, которые прошли проверку membership
// Пока это временно в памяти. Позже вынесем в базу / файл.
const verifiedUsers = new Set()

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

  if (!isValidTronAddress(text)) {
    await ctx.reply(
      '❌ This does not look like a valid TRON wallet address.\n\nPlease send a correct address that starts with T.'
    )
    return
  }

  await ctx.reply(
    `✅ Wallet accepted: ${text}\n\nNext step: reward calculation and airdrop transaction.`
  )
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
