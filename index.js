require('dotenv').config()

const express = require('express')
const { Telegraf, Markup } = require('telegraf')

const config = require('./config')

const app = express()

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start((ctx) => {

ctx.reply(
`Welcome to ${config.BOT_NAME}

To receive a random reward (1–5 4TEEN):

1️⃣ Join our Telegram community OR channel  
2️⃣ Press VERIFY  
3️⃣ Send your TRON wallet

`,
Markup.inlineKeyboard([
[
Markup.button.url("Join Community","https://t.me/The4teenToken"),
Markup.button.url("Join Channel","https://t.me/fourteentoken")
],
[
Markup.button.callback("VERIFY","verify_membership")
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

if(
group.status === "member" ||
group.status === "administrator" ||
group.status === "creator"
){
groupMember = true
}

}catch(e){}

try {

const channel = await ctx.telegram.getChatMember(config.CHANNEL_ID, userId)

if(
channel.status === "member" ||
channel.status === "administrator" ||
channel.status === "creator"
){
channelMember = true
}

}catch(e){}

if(groupMember || channelMember){

ctx.reply("✅ Membership confirmed.\n\nSend your TRON wallet address.")

}else{

ctx.reply("❌ You must join the community or channel first.")

}

})

const PORT = process.env.PORT || 3000

app.get('/', (req,res)=>{
res.send("4TEEN bot running")
})

bot.launch()

app.listen(PORT, ()=>{
console.log("Bot running")
})
