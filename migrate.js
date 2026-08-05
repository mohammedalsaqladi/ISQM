// تشغيل مخطط قاعدة البيانات — node migrate.js  [--fresh]
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const FRESH = process.argv.includes('--fresh');

const DROP = `
DROP VIEW  IF EXISTS v_unread_by_item, v_unread_by_component, v_component_stats CASCADE;
DROP TABLE IF EXISTS activity_log, chat_reads, chat_messages, attachments,
                     results, tests, responses, risks, objectives, components, users, firms,
                     registration_attempts CASCADE;
DROP TYPE  IF EXISTS severity_level, risk_status, response_status, response_type,
                     result_status, test_status, user_role, item_kind CASCADE;
DROP FUNCTION IF EXISTS set_updated_at CASCADE;
`;

(async () => {
  try {
    if (FRESH) {
      console.log('… حذف الجداول القديمة');
      await pool.query(DROP);
    }
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('… تنفيذ schema.sql');
    await pool.query(sql);
    console.log('✔ تم إنشاء الجداول والعروض بنجاح');
  } catch (e) {
    console.error('✖ فشلت الهجرة:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
