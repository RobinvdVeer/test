const { Pool } = require('pg');
const { getConfig } = require('../config');

let pool;

function getPool() {
  if (!pool) {
    const config = getConfig();

    if (!config.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Pool is created once per process. It will lazily connect when first used.
    pool = new Pool({
      connectionString: config.DATABASE_URL,
    });
  }

  return pool;
}

async function closePool() {
  if (!pool) return;

  const currentPool = pool;
  pool = undefined;
  await currentPool.end();
}

module.exports = {
  getPool,
  closePool,
};
