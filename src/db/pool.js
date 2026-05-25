const { Pool } = require('pg');
const { getConfig } = require('../config');

const config = getConfig();

if (!config.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Pool is created once per process. It will lazily connect when first used.
const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

module.exports = {
  pool,
};
