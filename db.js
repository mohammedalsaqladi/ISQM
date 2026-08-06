require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL غير معرّف — أضفه في ملف .env أو في إعدادات Render.');
}

// Render Postgres يتطلب SSL؛ محلياً نعطّله
const isRemote = /render\.com|amazonaws|supabase|neon\.tech/i.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemote || process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => console.error('PG pool error:', err.message));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  async tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};
