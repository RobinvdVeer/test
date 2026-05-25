const { Pool } = require('pg');
const { getConfig } = require('../config');

const config = getConfig();

// Pool is created once per process. It will lazily connect when first used.
const pool = new Pool({
  connectionString:
    config.DATABASE_URL || 'postgresql://todouser:todopass@localhost:5432/tododb',
});

module.exports = {
  pool,
};
