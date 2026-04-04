module.exports = {
  BOT_NAME: '4TEEN Drop Bot',

  // Telegram IDs
  GROUP_ID: -1003375405784,
  CHANNEL_ID: -1003233193685,

  // Reward settings
  // Random decimal reward in range:
  // 1.000001 — 4.999999
  MIN_REWARD: 1.000001,
  MAX_REWARD: 4.999999,
  REWARD_DECIMALS: 6,

  // Token settings
  TOKEN_DECIMALS: 6,

  // 4TEEN token contract
  TOKEN_ADDRESS: 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A',

  // Airdrop vault contract
  AIRDROP_CONTRACT: 'TV6eXKWCsZ15c3Svz39mRQWtBsqvNNBwpQ',

  // platformBit for Telegram
  TELEGRAM_PLATFORM_BIT: 4,

  // Estimated resources spent by one airdrop transaction
  // Real usage: 378 Bandwidth + 60,302 Energy
  // Set with a safety margin
  REQUIRED_ENERGY_PER_AIRDROP: 65000,
  REQUIRED_BANDWIDTH_PER_AIRDROP: 450,

  // Hard floor that must remain untouched for other contracts / calls
  // Bot will send an airdrop only if these balances stay available AFTER the airdrop
  MIN_ENERGY_FLOOR: 100,
  MIN_BANDWIDTH_FLOOR: 10,

  // Backward-compatible aliases
  MIN_ENERGY_RESERVE: 100,
  MIN_BANDWIDTH_RESERVE: 10,

  // TRON network
  TRON_FULL_NODE: 'https://api.trongrid.io',
  TRON_SOLIDITY_NODE: 'https://api.trongrid.io',
  TRON_EVENT_SERVER: 'https://api.trongrid.io'
}
