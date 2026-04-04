4TEEN Telegram Airdrop Bot

Telegram bot for automated 4TEEN token airdrop distribution with
membership verification and on-chain reward delivery.

The bot verifies that a user is a member of the 4TEEN Telegram community
or channel, requests a TRON wallet address, and sends a random reward
using the AirdropVault smart contract.

------------------------------------------------------------------------

Features

- Telegram membership verification
- Accepts TRON wallet address
- Random decimal reward generation (1.000001–4.999999 4TEEN)
- Calls smart contract airdrop() function
- Prevents duplicate claims per Telegram account and wallet
- Simple deployment on Heroku

------------------------------------------------------------------------

How the Bot Works

1. User starts the bot with /start
2. Bot asks the user to join the community or channel
3. User presses VERIFY
4. Bot checks membership in:
   - Telegram group
   - Telegram channel
5. If verified, user sends a TRON wallet address
6. Bot sends a random reward between 1.000001 and 4.999999 4TEEN
7. The reward is sent through the AirdropVault contract

------------------------------------------------------------------------

Smart Contracts

4TEEN Token

TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A

Airdrop Vault

TV6eXKWCsZ15c3Svz39mRQWtBsqvNNBwpQ

The bot calls the function:

    airdrop(address recipient, uint256 amount, uint8 platformBit)

For Telegram claims the bot uses:

    platformBit = 4

------------------------------------------------------------------------

Telegram Communities

Group

https://t.me/The4teenToken

Channel

https://t.me/fourteentoken

Users must join either the group or the channel to qualify.

------------------------------------------------------------------------

Reward Logic

The reward is randomly generated between:

1.000001 — 4.999999 4TEEN

Token decimals:

6

The bot converts the amount to raw units before calling the contract.

Example:

3.482761 4TEEN -> 3482761 raw units

------------------------------------------------------------------------

Project Structure

    4teen-telegram-airdrop-bot

    config.js
    index.js
    package.json
    .env.example
    README.md

config.js

Contains:

- Telegram group ID
- Telegram channel ID
- reward settings
- token configuration
- smart contract addresses
- TRON network endpoints

------------------------------------------------------------------------

Environment Variables

The bot uses environment variables for sensitive data.

Example .env file:

    BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
    TRON_PRIVATE_KEY=YOUR_OPERATOR_PRIVATE_KEY
    PORT=3000

Never commit .env to the repository.

------------------------------------------------------------------------

Installation

Clone the repository:

    git clone https://github.com/info14fourteen-creator/4teen-telegram-airdrop-bot.git
    cd 4teen-telegram-airdrop-bot

Install dependencies:

    npm install

Run the bot:

    npm start

------------------------------------------------------------------------

Deployment

The bot can be deployed on:

- Heroku
- Render
- VPS
- Docker

Heroku deployment is recommended for simplicity.

------------------------------------------------------------------------

Security Notes

This bot currently prevents duplicate claims using:

- Telegram user ID
- Wallet address

Future versions may include:

- persistent database storage
- rate limiting
- anti-bot protection
- advanced claim validation

------------------------------------------------------------------------

License

This project is open source and provided for transparency of the 4TEEN
ecosystem infrastructure.

------------------------------------------------------------------------

4TEEN Ecosystem

More resources:

Website
https://4teen.me

Whitepaper
https://4teen.me/wp

Liquidity controller
https://4teen.me/lc

Ultimate token logic
https://4teen.me/ult

Smart contracts
https://github.com/info14fourteen-creator/4teen-smart-contracts

Automation infrastructure
https://github.com/info14fourteen-creator/liquidity-bootstrapper-cron
