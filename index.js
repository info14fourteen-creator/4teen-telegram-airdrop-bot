require('dotenv').config()

const express = require('express')
const { Telegraf } = require('telegraf')

const config = require('./config')

const app = express()

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start((ctx) => {

ctx.reply(
`Welcome to ${config.BOT_NAME}

Join the community or channel and verify to receive a random 4TEEN reward (1–5 tokens).`
)

})

const PORT = process.env.PORT || 3000

app.get('/', (req,res)=>{
res.send("4TEEN bot running")
})

bot.launch()

app.listen(PORT, ()=>{
console.log("Bot running")
})
