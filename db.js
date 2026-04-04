const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
})

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS claims (
      id SERIAL PRIMARY KEY,
      telegram_user_id_hash TEXT UNIQUE NOT NULL,
      wallet_hash TEXT UNIQUE NOT NULL,
      txid TEXT,
      reward_amount NUMERIC(18,6) NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    ALTER TABLE claims
    ALTER COLUMN reward_amount TYPE NUMERIC(18,6)
    USING reward_amount::NUMERIC(18,6)
  `)
}

async function hasUserClaimed(userHash) {
  const result = await pool.query(
    'SELECT 1 FROM claims WHERE telegram_user_id_hash = $1 LIMIT 1',
    [userHash]
  )

  return result.rowCount > 0
}

async function hasWalletClaimed(walletHash) {
  const result = await pool.query(
    'SELECT 1 FROM claims WHERE wallet_hash = $1 LIMIT 1',
    [walletHash]
  )

  return result.rowCount > 0
}

async function saveClaim({ userHash, walletHash, txid, rewardAmount }) {
  await pool.query(
    `
    INSERT INTO claims (
      telegram_user_id_hash,
      wallet_hash,
      txid,
      reward_amount
    )
    VALUES ($1, $2, $3, $4)
    `,
    [userHash, walletHash, txid, rewardAmount]
  )
}

module.exports = {
  pool,
  initDb,
  hasUserClaimed,
  hasWalletClaimed,
  saveClaim
}
