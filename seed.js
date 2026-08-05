// إدخال بيانات البداية في قاعدة البيانات — node seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, tx } = require('./db');
const { PEOPLE, DATA, CHAT, USERS, FIRM } = require('./seed-data');

const FIRM_CODE = process.env.SEED_FIRM_CODE || 'ISQM-001';
const ADMIN_USER = process.env.SEED_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.SEED_ADMIN_PASS || '123456';

const ROLES = ['owner', 'quality_lead', 'admin', 'manager', 'staff'];

(async () => {
  try {
    const exists = await pool.query('SELECT id FROM firms WHERE firm_code=$1', [FIRM_CODE]);
    if (exists.rowCount && !process.argv.includes('--force')) {
      console.log(`… الشركة ${FIRM_CODE} موجودة مسبقاً. استخدم --force لإعادة الإدخال.`);
      return;
    }
    if (exists.rowCount) await pool.query('DELETE FROM firms WHERE firm_code=$1', [FIRM_CODE]);

    await tx(async (c) => {
      // ---------- firm ----------
      const firm = await c.query(
        `INSERT INTO firms (firm_code,name_ar,name_en,license_no,cr_no,city_ar,city_en,
                            country_ar,country_en,phone,partners_count,staff_count,
                            engagements_count,scope_ar,scope_en,period_start,period_end)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [FIRM_CODE, FIRM.name.ar, FIRM.name.en, FIRM.license, FIRM.cr, FIRM.city.ar, FIRM.city.en,
         FIRM.country.ar, FIRM.country.en, FIRM.phone, FIRM.partners, FIRM.staff,
         FIRM.engagements, FIRM.scope.ar, FIRM.scope.en, '2026-01-01', '2026-12-31']);
      const firmId = firm.rows[0].id;

      // ---------- users ----------
      const hash = bcrypt.hashSync(ADMIN_PASS, 10);
      const userIds = [];
      for (let i = 0; i < PEOPLE.length; i++) {
        const u = USERS[i] || {};
        const username = i === 0 ? ADMIN_USER : (u.email || `user${i}`).split('@')[0];
        const res = await c.query(
          `INSERT INTO users (firm_id,username,password_hash,full_name_ar,full_name_en,email,
                              role,job_title_ar,job_title_en,is_active,last_login_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [firmId, username, hash, PEOPLE[i].ar, PEOPLE[i].en, u.email || null,
           ROLES[i] || 'staff', u.role?.ar || null, u.role?.en || null,
           u.active !== false, u.last || null]);
        userIds.push(res.rows[0].id);
      }
      await c.query('UPDATE firms SET ultimate_resp_user=$1, operational_resp_user=$2 WHERE id=$3',
        [userIds[FIRM.resp], userIds[FIRM.opResp], firmId]);

      const uid = (person) => {
        const idx = PEOPLE.findIndex(p => p.ar === person.ar);
        return userIds[idx >= 0 ? idx : 0];
      };
      const ts = (d, t) => `${d} ${t || '00:00'}:00`;

      // ---------- components + tree ----------
      const compIds = {};
      const nodeIds = {};   // code -> {kind, id}
      for (const comp of DATA) {
        const cr = await c.query(
          `INSERT INTO components (firm_id,slug,seq,name_ar,name_en)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [firmId, comp.id, parseInt(comp.num, 10), comp.ar, comp.en]);
        compIds[comp.id] = cr.rows[0].id;

        let oSort = 0;
        for (const ob of comp.objectives) {
          const or = await c.query(
            `INSERT INTO objectives (firm_id,component_id,code,standard_ref,title_ar,title_en,
                                     desc_ar,desc_en,owner_id,created_by,sort_order,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [firmId, compIds[comp.id], ob.code, ob.ref, ob.t.ar, ob.t.en, ob.d.ar, ob.d.en,
             uid(ob.to), uid(ob.by), oSort++, ts(ob.date, ob.time)]);
          nodeIds[ob.code] = { kind: 'objective', id: or.rows[0].id };

          let rSort = 0;
          for (const rk of ob.kids) {
            const rr = await c.query(
              `INSERT INTO risks (firm_id,objective_id,code,title_ar,title_en,desc_ar,desc_en,
                                  severity,status,owner_id,created_by,sort_order,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
              [firmId, or.rows[0].id, rk.code, rk.t.ar, rk.t.en, rk.d.ar, rk.d.en,
               rk.sev, rk.status, uid(rk.to), uid(rk.by), rSort++, ts(rk.date, rk.time)]);
            nodeIds[rk.code] = { kind: 'risk', id: rr.rows[0].id };

            let sSort = 0;
            for (const rs of rk.kids) {
              const sr = await c.query(
                `INSERT INTO responses (firm_id,risk_id,code,title_ar,title_en,desc_ar,desc_en,
                                        resp_type,status,assigned_to,created_by,sort_order,created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
                [firmId, rr.rows[0].id, rs.code, rs.t.ar, rs.t.en, rs.d.ar, rs.d.en,
                 rs.type, rs.status, uid(rs.to), uid(rs.by), sSort++, ts(rs.date, rs.time)]);
              nodeIds[rs.code] = { kind: 'response', id: sr.rows[0].id };

              for (const xr of rs.kids) {
                const xres = await c.query(
                  `INSERT INTO results (firm_id,response_id,code,title_ar,title_en,desc_ar,desc_en,
                                        status,tested_by,created_by,tested_at,created_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
                  [firmId, sr.rows[0].id, xr.code, xr.t.ar, xr.t.en, xr.d.ar, xr.d.en,
                   xr.status, uid(xr.by), uid(xr.by), ts(xr.date, xr.time), ts(xr.date, xr.time)]);
                nodeIds[xr.code] = { kind: 'result', id: xres.rows[0].id };
              }
            }
          }
        }
      }

      // ---------- chat ----------
      for (const m of CHAT) {
        const link = m.code ? nodeIds[m.code] : null;
        const ins = await c.query(
          `INSERT INTO chat_messages (firm_id,component_id,item_kind,item_id,sender_id,body,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [firmId, compIds[m.comp], link ? link.kind : null, link ? link.id : null,
           userIds[m.by], m.txt, ts(m.date, m.time)]);
        // المرسل يقرأ رسالته دائماً؛ آخر 4 رسائل تبقى غير مقروءة للبقية
        await c.query('INSERT INTO chat_reads (message_id,user_id) VALUES ($1,$2)',
          [ins.rows[0].id, userIds[m.by]]);
      }
      const older = await c.query(
        `SELECT id FROM chat_messages WHERE firm_id=$1 ORDER BY created_at LIMIT $2`,
        [firmId, Math.max(CHAT.length - 4, 0)]);
      for (const row of older.rows) {
        for (const u of userIds) {
          await c.query('INSERT INTO chat_reads (message_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [row.id, u]);
        }
      }
    });

    console.log('✔ تم إدخال البيانات بنجاح');
    console.log(`  كود الشركة: ${FIRM_CODE} · المستخدم: ${ADMIN_USER} · كلمة المرور: ${ADMIN_PASS}`);
  } catch (e) {
    console.error('✖ فشل الإدخال:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
