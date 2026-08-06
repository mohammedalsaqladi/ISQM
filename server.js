require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { query, tx, pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-me-in-production';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------- helpers
const person = (ar, en) => ({ ar: ar || '', en: en || ar || '' });
const fullName = (first, last) => [first, last].filter(Boolean).join(' ');
const dpart = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
const tpart = (ts) => (ts ? new Date(ts).toISOString().slice(11, 16) : '');

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, SECRET);   // { uid, fid, username }
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

// معالج الأخطاء: يحوّل أخطاء PostgreSQL الشائعة إلى رسائل واضحة تدل على السبب
// بدل رسالة "server_error" العامة التي لا تفيد في التشخيص.
const PG_HINTS = {
  '42P01': 'جدول مفقود بقاعدة البيانات — لم يتم تشغيل schema.sql بعد، أو أنك تشغّل نسخة قديمة منه. شغّل ملف schema.sql كاملاً بمحرر قاعدة البيانات ثم أعد المحاولة.',
  '42703': 'عمود مفقود بقاعدة البيانات — بنية الجداول لديك قديمة ولا تطابق الكود. شغّل ملف schema.sql كاملاً (يحذف الجداول القديمة ويعيد إنشاءها) ثم أعد المحاولة.',
  '42883': 'دالة أو نوع مفقود بقاعدة البيانات — شغّل ملف schema.sql كاملاً ثم أعد المحاولة.',
  '3D000': 'قاعدة البيانات المحددة في DATABASE_URL غير موجودة.',
  '28P01': 'بيانات الاتصال بقاعدة البيانات غير صحيحة (اسم المستخدم أو كلمة المرور في DATABASE_URL).',
  '23505': 'القيمة موجودة مسبقاً (تكرار في حقل فريد).',
  '23503': 'مرجع غير صالح — السجل المرتبط غير موجود.'
};

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(`[${req.method} ${req.path}]`, e.code || '', e.message);
    const hint = PG_HINTS[e.code];
    res.status(500).json({
      error: 'server_error',
      detail: e.message,
      pgCode: e.code || null,
      hint: hint || null
    });
  });

// فحص تشخيصي: يخبرك بالضبط ما إذا كانت بنية قاعدة البيانات مكتملة أم لا.
// افتحه من المتصفح مباشرة على /api/diag
app.get('/api/diag', wrap(async (_req, res) => {
  const expected = {
    roles: ['id', 'slug', 'is_admin'],
    companies: ['id', 'code', 'name_ar', 'logo_url', 'letterhead_url', 'report_settings', 'signer_name'],
    branches: ['id', 'company_id'],
    users: ['id', 'company_id', 'role_id', 'first_name_ar', 'last_name_ar', 'username', 'password_hash'],
    registration_attempts: ['idempotency_key', 'company_id', 'user_id', 'company_code'],
    components: ['id', 'company_id', 'slug'],
    objectives: ['id', 'company_id', 'component_id', 'code'],
    risks: ['id', 'company_id', 'objective_id'],
    responses: ['id', 'company_id', 'risk_id'],
    tests: ['id', 'company_id', 'response_id'],
    results: ['id', 'company_id', 'test_id'],
    chat_messages: ['id', 'company_id'],
    activity_log: ['id', 'company_id']
  };
  const r = await query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`);
  const actual = {};
  r.rows.forEach((row) => {
    (actual[row.table_name] = actual[row.table_name] || []).push(row.column_name);
  });

  const problems = [];
  for (const [tbl, cols] of Object.entries(expected)) {
    if (!actual[tbl]) { problems.push(`الجدول "${tbl}" غير موجود`); continue; }
    const missing = cols.filter((c) => !actual[tbl].includes(c));
    if (missing.length) problems.push(`الجدول "${tbl}" ينقصه: ${missing.join(', ')}`);
  }
  const legacy = ['firms'].filter((t) => actual[t]);
  if (legacy.length) problems.push(`جداول قديمة ما زالت موجودة: ${legacy.join(', ')} — شغّل schema.sql لحذفها`);

  let rolesCount = null;
  if (actual.roles) {
    const rc = await query('SELECT COUNT(*)::int AS n FROM roles');
    rolesCount = rc.rows[0].n;
    if (!rolesCount) problems.push('جدول roles فارغ — شغّل schema.sql كاملاً ليضيف الأدوار الستة');
  }

  res.json({
    schemaOk: problems.length === 0,
    problems,
    rolesCount,
    tablesFound: Object.keys(actual).sort(),
    fix: problems.length ? 'شغّل ملف schema.sql كاملاً بمحرر قاعدة البيانات ثم أعد المحاولة.' : null
  });
}));

// يسمح فقط لمالك المكتب أو المشرف بعمليات حساسة (إدارة المستخدمين، بيانات الشركة، الاستيراد)
function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'forbidden' });
  next();
}

async function nextCode(c, table, prefix, fid) {
  const n = await c.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE company_id=$1`, [fid]);
  return prefix + String(n.rows[0].n + 1).padStart(2, '0');
}

// ================================================================= AUTH
app.post('/api/auth/login', wrap(async (req, res) => {
  const { firmCode, username, password } = req.body || {};
  if (!firmCode || !username || !password) return res.status(400).json({ error: 'missing_fields' });
  const r = await query(
    `SELECT u.id, u.company_id, u.username, u.password_hash, u.is_active,
            u.first_name_ar, u.last_name_ar, u.first_name_en, u.last_name_en,
            u.role_id, ro.slug AS role_slug, ro.is_admin
       FROM users u
       JOIN companies f ON f.id = u.company_id
       JOIN roles ro ON ro.id = u.role_id
      WHERE f.code = $1 AND u.username = $2`,
    [String(firmCode).trim().toUpperCase(), String(username).trim()]);
  const u = r.rows[0];
  if (!u || !u.is_active || !bcrypt.compareSync(password, u.password_hash))
    return res.status(401).json({ error: 'bad_credentials' });

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  const token = jwt.sign(
    { uid: u.id, fid: u.company_id, username: u.username, role: u.role_slug, isAdmin: u.is_admin },
    SECRET, { expiresIn: '12h' });
  res.json({
    token,
    user: {
      id: u.id,
      name: person(fullName(u.first_name_ar, u.last_name_ar), fullName(u.first_name_en, u.last_name_en)),
      username: u.username
    }
  });
}));

// إنشاء حساب شركة جديدة + المكوّنات الثمانية
const BASE_COMPONENTS = [
  ['gov', 1, 'الحوكمة والقيادة', 'Governance and Leadership'],
  ['ethics', 2, 'المتطلبات الأخلاقية ذات الصلة', 'Relevant Ethical Requirements'],
  ['accept', 3, 'قبول واستمرار العلاقات مع العملاء والارتباطات', 'Acceptance and Continuance'],
  ['perf', 4, 'أداء الارتباط', 'Engagement Performance'],
  ['res', 5, 'الموارد', 'Resources'],
  ['info', 6, 'المعلومات والاتصال', 'Information and Communication'],
  ['mon', 7, 'المراقبة والمعالجة', 'Monitoring and Remediation'],
  ['ra', 8, 'عملية تقييم المخاطر', 'Risk Assessment Process']
];

app.post('/api/auth/register', wrap(async (req, res) => {
  const { firmName, firmCode, cr, city, adminName, email, username, password, idemKey } = req.body || {};
  if (!firmName || !adminName || !username || !password || !firmCode)
    return res.status(400).json({ error: 'missing_fields' });

  const code = String(firmCode).trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(code))
    return res.status(400).json({ error: 'invalid_code' }); // 2-20 حرف/رقم إنجليزي، بدون مسافات

  // ---- منع التكرار: نقرة مزدوجة / إعادة إرسال لنفس الطلب لا تُنشئ شركة ثانية.
  // نقفل مفتاح idemKey أولاً داخل نفس المعاملة (transaction)؛ لو كان محجوزاً
  // سابقاً (طلب متزامن آخر لنفس النقرة) نتوقف فوراً بدل إنشاء شركة جديدة.
  if (idemKey) {
    const existing = await query(
      'SELECT company_id, user_id, company_code FROM registration_attempts WHERE idempotency_key=$1',
      [idemKey]);
    if (existing.rowCount && existing.rows[0].company_id) {
      const row = existing.rows[0];
      const token = jwt.sign({ uid: row.user_id, fid: row.company_id, username, role: 'owner', isAdmin: true }, SECRET, { expiresIn: '12h' });
      return res.json({ token, firmCode: row.company_code, reused: true });
    }
  }

  let out;
  try {
    out = await tx(async (c) => {
      if (idemKey) {
        const lock = await c.query(
          `INSERT INTO registration_attempts (idempotency_key) VALUES ($1)
           ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`, [idemKey]);
        if (!lock.rowCount) { const e = new Error('duplicate_submission'); e.code = 'DUP_SUBMIT'; throw e; }
      }

      const dup = await c.query('SELECT 1 FROM companies WHERE code=$1', [code]);
      if (dup.rowCount) { const e = new Error('code_taken'); e.code = 'CODE_TAKEN'; throw e; }

      const f = await c.query(
        `INSERT INTO companies (code,name_ar,name_en,cr_number,city,email,
                                period_start,period_end)
         VALUES ($1,$2,$2,$3,$4,$5,date_trunc('year',now()),
                 date_trunc('year',now())+interval '1 year' - interval '1 day') RETURNING id`,
        [code, firmName, cr || null, city || null, email || null]);
      const firmId = f.rows[0].id;

      // اسم المسؤول يُقسّم إلى اسم أول/أخير ليطابق بنية جدول users
      const nameParts = String(adminName).trim().split(/\s+/);
      const firstAr = nameParts.shift();
      const lastAr = nameParts.join(' ') || null;

      const u = await c.query(
        `INSERT INTO users (company_id,username,password_hash,first_name_ar,last_name_ar,email,role_id)
         VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING id`,
        [firmId, String(username).trim(), bcrypt.hashSync(password, 10), firstAr, lastAr, email || null]);
      await c.query('UPDATE companies SET ultimate_resp_user=$1, operational_resp_user=$1 WHERE id=$2',
        [u.rows[0].id, firmId]);

      for (const [slug, seq, ar, en] of BASE_COMPONENTS) {
        await c.query('INSERT INTO components (company_id,slug,seq,name_ar,name_en) VALUES ($1,$2,$3,$4,$5)',
          [firmId, slug, seq, ar, en]);
      }

      if (idemKey) {
        await c.query(
          `UPDATE registration_attempts SET company_id=$1, user_id=$2, company_code=$3 WHERE idempotency_key=$4`,
          [firmId, u.rows[0].id, code, idemKey]);
      }
      return { code, firmId, uid: u.rows[0].id };
    });
  } catch (e) {
    if (e.code === 'CODE_TAKEN') return res.status(409).json({ error: 'code_taken' });
    if (e.code === 'DUP_SUBMIT') {
      const prev = await query(
        'SELECT company_id, user_id, company_code FROM registration_attempts WHERE idempotency_key=$1', [idemKey]);
      const row = prev.rows[0];
      if (row && row.company_id) {
        const token = jwt.sign({ uid: row.user_id, fid: row.company_id, username, role: 'owner', isAdmin: true }, SECRET, { expiresIn: '12h' });
        return res.json({ token, firmCode: row.company_code, reused: true });
      }
      return res.status(409).json({ error: 'registration_in_progress' });
    }
    throw e;
  }

  const token = jwt.sign({ uid: out.uid, fid: out.firmId, username, role: 'owner', isAdmin: true }, SECRET, { expiresIn: '12h' });
  res.json({ token, firmCode: out.code });
}));

// ================================================================= TREE
app.get('/api/tree', auth, wrap(async (req, res) => {
  const fid = req.user.fid;
  const [comps, objs, risks, resps, tests, results] = await Promise.all([
    query(`SELECT id,slug,seq,name_ar,name_en FROM components WHERE company_id=$1 ORDER BY seq`, [fid]),
    query(`SELECT o.*, concat_ws(' ',ow.first_name_ar,ow.last_name_ar) ow_ar, concat_ws(' ',ow.first_name_en,ow.last_name_en) ow_en,
                  concat_ws(' ',cb.first_name_ar,cb.last_name_ar) cb_ar, concat_ws(' ',cb.first_name_en,cb.last_name_en) cb_en
             FROM objectives o
             LEFT JOIN users ow ON ow.id=o.owner_id LEFT JOIN users cb ON cb.id=o.created_by
            WHERE o.company_id=$1 ORDER BY o.sort_order, o.code`, [fid]),
    query(`SELECT r.*, concat_ws(' ',ow.first_name_ar,ow.last_name_ar) ow_ar, concat_ws(' ',ow.first_name_en,ow.last_name_en) ow_en,
                  concat_ws(' ',cb.first_name_ar,cb.last_name_ar) cb_ar, concat_ws(' ',cb.first_name_en,cb.last_name_en) cb_en
             FROM risks r
             LEFT JOIN users ow ON ow.id=r.owner_id LEFT JOIN users cb ON cb.id=r.created_by
            WHERE r.company_id=$1 ORDER BY r.sort_order, r.code`, [fid]),
    query(`SELECT p.*, concat_ws(' ',ow.first_name_ar,ow.last_name_ar) ow_ar, concat_ws(' ',ow.first_name_en,ow.last_name_en) ow_en,
                  concat_ws(' ',cb.first_name_ar,cb.last_name_ar) cb_ar, concat_ws(' ',cb.first_name_en,cb.last_name_en) cb_en
             FROM responses p
             LEFT JOIN users ow ON ow.id=p.assigned_to LEFT JOIN users cb ON cb.id=p.created_by
            WHERE p.company_id=$1 ORDER BY p.sort_order, p.code`, [fid]),
    query(`SELECT tt.*, concat_ws(' ',ow.first_name_ar,ow.last_name_ar) ow_ar, concat_ws(' ',ow.first_name_en,ow.last_name_en) ow_en,
                  concat_ws(' ',cb.first_name_ar,cb.last_name_ar) cb_ar, concat_ws(' ',cb.first_name_en,cb.last_name_en) cb_en
             FROM tests tt
             LEFT JOIN users ow ON ow.id=tt.assigned_to LEFT JOIN users cb ON cb.id=tt.created_by
            WHERE tt.company_id=$1 ORDER BY tt.sort_order, tt.code`, [fid]),
    query(`SELECT x.*, concat_ws(' ',cb.first_name_ar,cb.last_name_ar) cb_ar, concat_ws(' ',cb.first_name_en,cb.last_name_en) cb_en
             FROM results x LEFT JOIN users cb ON cb.id=x.created_by
            WHERE x.company_id=$1 ORDER BY x.code`, [fid])
  ]);

  const byId = {};
  const tree = comps.rows.map((c) => ({
    id: c.slug, dbId: c.id, num: String(c.seq).padStart(2, '0'),
    ar: c.name_ar, en: c.name_en, objectives: []
  }));
  tree.forEach((c) => { byId[c.dbId] = c; });

  const oMap = {}, rMap = {}, sMap = {}, tMap = {};
  objs.rows.forEach((o) => {
    const n = {
      kind: 'objective', dbId: o.id, code: o.code, ref: o.standard_ref || '',
      t: person(o.title_ar, o.title_en), d: person(o.desc_ar, o.desc_en),
      to: person(o.ow_ar, o.ow_en), by: person(o.cb_ar, o.cb_en),
      date: dpart(o.created_at), time: tpart(o.created_at), kids: []
    };
    oMap[o.id] = n;
    if (byId[o.component_id]) byId[o.component_id].objectives.push(n);
  });
  risks.rows.forEach((r) => {
    const n = {
      kind: 'risk', dbId: r.id, code: r.code, sev: r.severity, status: r.status,
      t: person(r.title_ar, r.title_en), d: person(r.desc_ar, r.desc_en),
      to: person(r.ow_ar, r.ow_en), by: person(r.cb_ar, r.cb_en),
      date: dpart(r.created_at), time: tpart(r.created_at), kids: []
    };
    rMap[r.id] = n;
    if (oMap[r.objective_id]) oMap[r.objective_id].kids.push(n);
  });
  resps.rows.forEach((p) => {
    const n = {
      kind: 'response', dbId: p.id, code: p.code, type: p.resp_type, status: p.status,
      t: person(p.title_ar, p.title_en), d: person(p.desc_ar, p.desc_en),
      to: person(p.ow_ar, p.ow_en), by: person(p.cb_ar, p.cb_en),
      date: dpart(p.created_at), time: tpart(p.created_at), kids: []
    };
    sMap[p.id] = n;
    if (rMap[p.risk_id]) rMap[p.risk_id].kids.push(n);
  });
  tests.rows.forEach((tt) => {
    const n = {
      kind: 'test', dbId: tt.id, code: tt.code, status: tt.status,
      t: person(tt.title_ar, tt.title_en), d: person(tt.desc_ar, tt.desc_en),
      to: person(tt.ow_ar, tt.ow_en), by: person(tt.cb_ar, tt.cb_en),
      date: dpart(tt.created_at), time: tpart(tt.created_at), kids: []
    };
    tMap[tt.id] = n;
    if (sMap[tt.response_id]) sMap[tt.response_id].kids.push(n);
  });
  results.rows.forEach((x) => {
    const n = {
      kind: 'result', dbId: x.id, code: x.code, status: x.status,
      t: person(x.title_ar, x.title_en), d: person(x.desc_ar, x.desc_en),
      by: person(x.cb_ar, x.cb_en), to: person(x.cb_ar, x.cb_en),
      date: dpart(x.tested_at || x.created_at), time: tpart(x.tested_at || x.created_at), kids: []
    };
    if (tMap[x.test_id]) tMap[x.test_id].kids.push(n);
  });

  res.json(tree);
}));

// ================================================================= COMPONENTS
app.post('/api/components', auth, requireAdmin, wrap(async (req, res) => {
  const { slug, nameAr, nameEn, descAr, descEn, seq } = req.body || {};
  if (!slug || !nameAr) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[a-z0-9_-]{2,30}$/.test(slug)) return res.status(400).json({ error: 'invalid_slug' });
  const dup = await query('SELECT 1 FROM components WHERE company_id=$1 AND slug=$2', [req.user.fid, slug]);
  if (dup.rowCount) return res.status(409).json({ error: 'slug_taken' });
  const n = await query('SELECT COALESCE(MAX(seq),0)::int AS m FROM components WHERE company_id=$1', [req.user.fid]);
  const r = await query(
    `INSERT INTO components (company_id,slug,seq,name_ar,name_en,desc_ar,desc_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [req.user.fid, slug, seq || (n.rows[0].m + 1), nameAr, nameEn || nameAr, descAr || null, descEn || null]);
  res.json({ ok: true, id: r.rows[0].id });
}));

app.patch('/api/components/:id', auth, requireAdmin, wrap(async (req, res) => {
  const { nameAr, nameEn, descAr, descEn, seq } = req.body || {};
  const r = await query(
    `UPDATE components SET name_ar=COALESCE($1,name_ar), name_en=COALESCE($2,name_en),
            desc_ar=COALESCE($3,desc_ar), desc_en=COALESCE($4,desc_en), seq=COALESCE($5,seq)
      WHERE id=$6 AND company_id=$7 RETURNING id`,
    [nameAr || null, nameEn || null, descAr || null, descEn || null, seq || null, req.params.id, req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// ================================================================= COMPANY / USERS
// حقول بيانات الشركة القابلة للتعديل، مجمّعة كما تُعرض بالواجهة.
const COMPANY_FIELDS = [
  'name_ar','name_en','license_no','city','signer_name','signer_title',
  'logo_url','letterhead_url','stamp_url','signature_url',
  'report_footer_ar','public_base_url',
  'email','website','phone','fax','street','postal_code',
  'cr_number','tax_number','subscription_start','subscription_end',
  'scope_ar','scope_en','period_start','period_end',
  'partners_count','staff_count','engagements_count'
];

app.get('/api/firm', auth, wrap(async (req, res) => {
  const r = await query(
    `SELECT f.*, concat_ws(' ',ru.first_name_ar,ru.last_name_ar) ru_ar, concat_ws(' ',ru.first_name_en,ru.last_name_en) ru_en,
            concat_ws(' ',ou.first_name_ar,ou.last_name_ar) ou_ar, concat_ws(' ',ou.first_name_en,ou.last_name_en) ou_en
       FROM companies f
       LEFT JOIN users ru ON ru.id = f.ultimate_resp_user
       LEFT JOIN users ou ON ou.id = f.operational_resp_user
      WHERE f.id = $1`, [req.user.fid]);
  const f = r.rows[0];
  if (!f) return res.status(404).json({ error: 'not_found' });
  const raw = {};
  COMPANY_FIELDS.forEach((k) => { raw[k] = f[k]; });
  if (raw.subscription_start) raw.subscription_start = dpart(raw.subscription_start);
  if (raw.subscription_end) raw.subscription_end = dpart(raw.subscription_end);
  if (raw.period_start) raw.period_start = dpart(raw.period_start);
  if (raw.period_end) raw.period_end = dpart(raw.period_end);
  res.json({
    code: f.code,
    name: person(f.name_ar, f.name_en),
    license: f.license_no || '—',
    cr: f.cr_number || '—',
    tax: f.tax_number || '—',
    city: person(f.city, f.city),
    phone: f.phone || '—',
    email: f.email || '—',
    website: f.website || '—',
    street: f.street || '—',
    signer: f.signer_name || '—',
    signerTitle: f.signer_title || '—',
    partners: f.partners_count, staff: f.staff_count, engagements: f.engagements_count,
    scope: person(f.scope_ar, f.scope_en),
    period: person(
      `${dpart(f.period_start)} — ${dpart(f.period_end)}`,
      `${dpart(f.period_start)} — ${dpart(f.period_end)}`),
    respName: person(f.ru_ar, f.ru_en), opRespName: person(f.ou_ar, f.ou_en),
    // أصول ووإعدادات الطباعة — تُستخدم لتطبيق الورق الرسمي والخط والهوامش
    print: {
      logo: f.logo_url || null,
      letterhead: f.letterhead_url || null,
      stamp: f.stamp_url || null,
      signature: f.signature_url || null,
      footer: f.report_footer_ar || null,
      settings: f.report_settings || {}
    },
    raw
  });
}));

app.patch('/api/firm', auth, requireAdmin, wrap(async (req, res) => {
  const body = req.body || {};
  const sets = [];
  const vals = [];
  const numeric = ['partners_count', 'staff_count', 'engagements_count'];
  const dates = ['subscription_start', 'subscription_end', 'period_start', 'period_end'];
  for (const key of COMPANY_FIELDS) {
    if (!(key in body)) continue;
    let v = body[key];
    if (v === '') v = null;
    if (numeric.includes(key)) v = (v === null ? null : Number(v) || 0);
    if (dates.includes(key) && v === null) v = null;
    vals.push(v);
    sets.push(`${key}=$${vals.length}`);
  }
  if (body.report_settings && typeof body.report_settings === 'object') {
    vals.push(JSON.stringify(body.report_settings));
    sets.push(`report_settings=$${vals.length}::jsonb`);
  }
  if (!sets.length) return res.json({ ok: true });
  vals.push(req.user.fid);
  const r = await query(
    `UPDATE companies SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING id`, vals);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

app.get('/api/users', auth, wrap(async (req, res) => {
  const r = await query(
    `SELECT u.id, u.username, u.first_name_ar, u.last_name_ar, u.first_name_en, u.last_name_en,
            u.email, u.phone, u.gender, u.employment_type, u.qualifications,
            u.job_title_ar, u.job_title_en, u.is_active, u.last_login_at,
            u.role_id, ro.slug AS role_slug, ro.name_ar AS role_ar, ro.name_en AS role_en
       FROM users u JOIN roles ro ON ro.id = u.role_id
      WHERE u.company_id=$1 ORDER BY u.created_at`, [req.user.fid]);
  res.json(r.rows.map((u) => ({
    id: u.id, username: u.username,
    name: person(fullName(u.first_name_ar, u.last_name_ar), fullName(u.first_name_en, u.last_name_en)),
    firstNameAr: u.first_name_ar, lastNameAr: u.last_name_ar,
    firstNameEn: u.first_name_en, lastNameEn: u.last_name_en,
    email: u.email || '—', phone: u.phone || '—',
    gender: u.gender, employmentType: u.employment_type, qualifications: u.qualifications,
    jobTitle: person(u.job_title_ar, u.job_title_en),
    role: person(u.job_title_ar || u.role_ar, u.job_title_en || u.role_en),
    roleName: person(u.role_ar, u.role_en),
    roleId: u.role_id, roleSlug: u.role_slug,
    active: u.is_active,
    last: u.last_login_at ? `${dpart(u.last_login_at)} ${tpart(u.last_login_at)}` : '—',
    me: u.id === req.user.uid
  })));
}));

app.get('/api/roles', auth, wrap(async (_req, res) => {
  const r = await query('SELECT id, slug, name_ar, name_en FROM roles ORDER BY id');
  res.json(r.rows.map((x) => ({ id: x.id, slug: x.slug, name: person(x.name_ar, x.name_en) })));
}));

app.post('/api/users', auth, requireAdmin, wrap(async (req, res) => {
  const { username, password, firstNameAr, lastNameAr, firstNameEn, lastNameEn,
          email, phone, roleId, jobTitleAr, jobTitleEn, gender, employmentType, qualifications } = req.body || {};
  if (!username || !password || !firstNameAr) return res.status(400).json({ error: 'missing_fields' });
  const dup = await query('SELECT 1 FROM users WHERE company_id=$1 AND username=$2', [req.user.fid, username]);
  if (dup.rowCount) return res.status(409).json({ error: 'username_taken' });
  const r = await query(
    `INSERT INTO users (company_id,username,password_hash,first_name_ar,last_name_ar,
                        first_name_en,last_name_en,email,phone,role_id,
                        job_title_ar,job_title_en,gender,employment_type,qualifications)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [req.user.fid, String(username).trim(), bcrypt.hashSync(password, 10),
     firstNameAr, lastNameAr || null, firstNameEn || null, lastNameEn || null,
     email || null, phone || null, roleId || 5,
     jobTitleAr || null, jobTitleEn || null, gender || null, employmentType || null, qualifications || null]);
  res.json({ ok: true, id: r.rows[0].id });
}));

app.patch('/api/users/:id', auth, wrap(async (req, res) => {
  const editingSelf = req.params.id === req.user.uid;
  if (!editingSelf && !req.user.isAdmin) return res.status(403).json({ error: 'forbidden' });
  const b = req.body || {};
  const canManage = !!req.user.isAdmin;   // فقط المالك/المشرف يغيّر الدور أو حالة التفعيل
  const r = await query(
    `UPDATE users SET
        first_name_ar=COALESCE($1,first_name_ar), last_name_ar=COALESCE($2,last_name_ar),
        first_name_en=COALESCE($3,first_name_en), last_name_en=COALESCE($4,last_name_en),
        email=COALESCE($5,email), phone=COALESCE($6,phone),
        job_title_ar=COALESCE($7,job_title_ar), job_title_en=COALESCE($8,job_title_en),
        gender=COALESCE($9,gender), employment_type=COALESCE($10,employment_type),
        qualifications=COALESCE($11,qualifications),
        role_id=CASE WHEN $12 AND $13::int IS NOT NULL THEN $13 ELSE role_id END,
        is_active=CASE WHEN $12 AND $14::boolean IS NOT NULL THEN $14 ELSE is_active END,
        password_hash=COALESCE($15,password_hash)
      WHERE id=$16 AND company_id=$17 RETURNING id`,
    [b.firstNameAr || null, b.lastNameAr || null, b.firstNameEn || null, b.lastNameEn || null,
     b.email || null, b.phone || null, b.jobTitleAr || null, b.jobTitleEn || null,
     b.gender || null, b.employmentType || null, b.qualifications || null,
     canManage, b.roleId || null,
     typeof b.isActive === 'boolean' ? b.isActive : null,
     b.password ? bcrypt.hashSync(b.password, 10) : null,
     req.params.id, req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// ================================================================= OBJECTIVES
app.post('/api/objectives', auth, wrap(async (req, res) => {
  const { componentId, title, desc, ownerId, standardRef } = req.body || {};
  if (!componentId || !title) return res.status(400).json({ error: 'missing_fields' });
  const out = await tx(async (c) => {
    const code = 'O-' + await nextCode(c, 'objectives', '', req.user.fid);
    const r = await c.query(
      `INSERT INTO objectives (company_id,component_id,code,standard_ref,title_ar,title_en,desc_ar,desc_en,
                                is_additional,owner_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$6,TRUE,$7,$8) RETURNING id,code,created_at`,
      [req.user.fid, componentId, code, standardRef || null, title, desc || title,
       ownerId || req.user.uid, req.user.uid]);
    await c.query(
      `INSERT INTO activity_log (company_id,user_id,action,item_kind,item_id,new_value)
       VALUES ($1,$2,'created','objective',$3,$4)`, [req.user.fid, req.user.uid, r.rows[0].id, JSON.stringify({ title })]);
    return r.rows[0];
  });
  res.json({ ok: true, code: out.code, id: out.id });
}));

app.patch('/api/objectives/:id', auth, wrap(async (req, res) => {
  const { title, desc, ownerId, standardRef } = req.body || {};
  const r = await query(
    `UPDATE objectives SET title_ar=COALESCE($1,title_ar), title_en=COALESCE($1,title_en),
            desc_ar=COALESCE($2,desc_ar), desc_en=COALESCE($2,desc_en),
            owner_id=COALESCE($3,owner_id), standard_ref=COALESCE($4,standard_ref)
      WHERE id=$5 AND company_id=$6 RETURNING id`,
    [title || null, desc || null, ownerId || null, standardRef || null, req.params.id, req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// ================================================================= RISKS
app.post('/api/risks', auth, wrap(async (req, res) => {
  const { objectiveId, title, desc, ownerId, severity, likelihood, impact, status, dueDate } = req.body || {};
  if (!objectiveId || !title) return res.status(400).json({ error: 'missing_fields' });
  const out = await tx(async (c) => {
    const code = 'RI-' + await nextCode(c, 'risks', '', req.user.fid);
    const r = await c.query(
      `INSERT INTO risks (company_id,objective_id,code,title_ar,title_en,desc_ar,desc_en,
                           severity,likelihood,impact,status,owner_id,created_by,due_date)
       VALUES ($1,$2,$3,$4,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,code,created_at`,
      [req.user.fid, objectiveId, code, title, desc || title, severity || 'medium',
       likelihood || null, impact || null, status || 'open', ownerId || req.user.uid,
       req.user.uid, dueDate || null]);
    await c.query(
      `INSERT INTO activity_log (company_id,user_id,action,item_kind,item_id,new_value)
       VALUES ($1,$2,'created','risk',$3,$4)`, [req.user.fid, req.user.uid, r.rows[0].id, JSON.stringify({ title })]);
    return r.rows[0];
  });
  res.json({ ok: true, code: out.code, id: out.id });
}));

app.patch('/api/risks/:id', auth, wrap(async (req, res) => {
  const { title, desc, ownerId, severity, likelihood, impact, status, dueDate } = req.body || {};
  const r = await query(
    `UPDATE risks SET title_ar=COALESCE($1,title_ar), title_en=COALESCE($1,title_en),
            desc_ar=COALESCE($2,desc_ar), desc_en=COALESCE($2,desc_en),
            owner_id=COALESCE($3,owner_id), severity=COALESCE($4,severity),
            likelihood=COALESCE($5,likelihood), impact=COALESCE($6,impact),
            status=COALESCE($7,status), due_date=COALESCE($8,due_date)
      WHERE id=$9 AND company_id=$10 RETURNING id`,
    [title || null, desc || null, ownerId || null, severity || null, likelihood || null,
     impact || null, status || null, dueDate || null, req.params.id, req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// ================================================================= RESPONSES
app.post('/api/responses', auth, wrap(async (req, res) => {
  const { riskId, title, desc, assignedTo, type, status } = req.body || {};
  if (!riskId || !title) return res.status(400).json({ error: 'missing_fields' });
  const out = await tx(async (c) => {
    const code = 'RS-' + await nextCode(c, 'responses', '', req.user.fid);
    const r = await c.query(
      `INSERT INTO responses (company_id,risk_id,code,title_ar,title_en,desc_ar,desc_en,
                              resp_type,status,assigned_to,created_by)
       VALUES ($1,$2,$3,$4,$4,$5,$5,$6,$7,$8,$9) RETURNING id,code,created_at`,
      [req.user.fid, riskId, code, title, desc || title,
       type || 'prev', status || 'inprog', assignedTo || req.user.uid, req.user.uid]);
    await c.query(
      `INSERT INTO activity_log (company_id,user_id,action,item_kind,item_id,new_value)
       VALUES ($1,$2,'created','response',$3,$4)`,
      [req.user.fid, req.user.uid, r.rows[0].id, JSON.stringify({ title, status })]);
    return r.rows[0];
  });
  res.json({ ok: true, code: out.code, id: out.id });
}));

app.patch('/api/responses/:id', auth, wrap(async (req, res) => {
  const { title, desc, assignedTo, type, status } = req.body || {};
  const r = await query(
    `UPDATE responses SET title_ar=COALESCE($1,title_ar), title_en=COALESCE($1,title_en),
            desc_ar=COALESCE($2,desc_ar), desc_en=COALESCE($2,desc_en),
            assigned_to=COALESCE($3,assigned_to), resp_type=COALESCE($4,resp_type),
            status=COALESCE($5,status),
            completed_at=CASE WHEN $5='done' THEN now() ELSE completed_at END
      WHERE id=$6 AND company_id=$7 RETURNING id`,
    [title || null, desc || null, assignedTo || null, type || null, status || null,
     req.params.id, req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// ================================================================= TESTS
app.post('/api/tests', auth, wrap(async (req, res) => {
  const { responseId, title, desc, assignedTo, status, dueDate } = req.body || {};
  if (!responseId || !title) return res.status(400).json({ error: 'missing_fields' });
  const out = await tx(async (c) => {
    const code = 'TS-' + await nextCode(c, 'tests', '', req.user.fid);
    const r = await c.query(
      `INSERT INTO tests (company_id,response_id,code,title_ar,title_en,desc_ar,desc_en,
                           status,assigned_to,created_by,due_date)
       VALUES ($1,$2,$3,$4,$4,$5,$5,$6,$7,$8,$9) RETURNING id,code,created_at`,
      [req.user.fid, responseId, code, title, desc || title,
       status || 'planned', assignedTo || req.user.uid, req.user.uid, dueDate || null]);
    await c.query(
      `INSERT INTO activity_log (company_id,user_id,action,item_kind,item_id,new_value)
       VALUES ($1,$2,'created','test',$3,$4)`,
      [req.user.fid, req.user.uid, r.rows[0].id, JSON.stringify({ title, status })]);
    return r.rows[0];
  });
  res.json({ ok: true, code: out.code, id: out.id });
}));

app.patch('/api/tests/:id', auth, wrap(async (req, res) => {
  const { title, desc, assignedTo, status, dueDate } = req.body || {};
  const r = await query(
    `UPDATE tests SET title_ar=COALESCE($1,title_ar), title_en=COALESCE($1,title_en),
            desc_ar=COALESCE($2,desc_ar), desc_en=COALESCE($2,desc_en),
            assigned_to=COALESCE($3,assigned_to), status=COALESCE($4,status),
            due_date=COALESCE($5,due_date)
      WHERE id=$6 AND company_id=$7 RETURNING id`,
    [title || null, desc || null, assignedTo || null, status || null, dueDate || null,
     req.params.id, req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// ================================================================= RESULTS
app.post('/api/results', auth, wrap(async (req, res) => {
  const { testId, title, desc, status, testedBy } = req.body || {};
  if (!testId || !title) return res.status(400).json({ error: 'missing_fields' });
  const out = await tx(async (c) => {
    const code = 'OC-' + await nextCode(c, 'results', '', req.user.fid);
    const r = await c.query(
      `INSERT INTO results (company_id,test_id,code,title_ar,title_en,desc_ar,desc_en,
                             status,tested_by,created_by,tested_at)
       VALUES ($1,$2,$3,$4,$4,$5,$5,$6,$7,$8,now()) RETURNING id,code,created_at`,
      [req.user.fid, testId, code, title, desc || title, status || 'effective',
       testedBy || req.user.uid, req.user.uid]);
    await c.query(
      `INSERT INTO activity_log (company_id,user_id,action,item_kind,item_id,new_value)
       VALUES ($1,$2,'created','result',$3,$4)`, [req.user.fid, req.user.uid, r.rows[0].id, JSON.stringify({ title })]);
    return r.rows[0];
  });
  res.json({ ok: true, code: out.code, id: out.id });
}));

app.patch('/api/results/:id', auth, wrap(async (req, res) => {
  const { title, desc, status } = req.body || {};
  const r = await query(
    `UPDATE results SET title_ar=COALESCE($1,title_ar), title_en=COALESCE($1,title_en),
            desc_ar=COALESCE($2,desc_ar), desc_en=COALESCE($2,desc_en), status=COALESCE($3,status)
      WHERE id=$4 AND company_id=$5 RETURNING id`,
    [title || null, desc || null, status || null, req.params.id, req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// ================================================================= CHAT
const KIND_MAP = { objective: 'objective', risk: 'risk', response: 'response', test: 'test', result: 'result' };

app.get('/api/chat', auth, wrap(async (req, res) => {
  const r = await query(
    `SELECT m.id, m.body, m.item_kind, m.item_id, m.created_at, m.sender_id,
            c.slug AS comp_slug,
            concat_ws(' ',u.first_name_ar,u.last_name_ar) full_name_ar, concat_ws(' ',u.first_name_en,u.last_name_en) full_name_en,
            (rd.message_id IS NULL AND m.sender_id <> $2) AS unread,
            COALESCE(o.code, k.code, p.code, x.code) AS item_code
       FROM chat_messages m
       JOIN components c ON c.id = m.component_id
       JOIN users u      ON u.id = m.sender_id
       LEFT JOIN chat_reads rd ON rd.message_id = m.id AND rd.user_id = $2
       LEFT JOIN objectives o ON m.item_kind='objective' AND o.id = m.item_id
       LEFT JOIN risks      k ON m.item_kind='risk'      AND k.id = m.item_id
       LEFT JOIN responses  p ON m.item_kind='response'  AND p.id = m.item_id
       LEFT JOIN results    x ON m.item_kind='result'    AND x.id = m.item_id
      WHERE m.company_id = $1 AND m.deleted_at IS NULL
      ORDER BY m.created_at`, [req.user.fid, req.user.uid]);

  res.json(r.rows.map((m) => ({
    id: Number(m.id), txt: m.body, comp: m.comp_slug, code: m.item_code || null,
    kind: m.item_kind || null, byId: m.sender_id, mine: m.sender_id === req.user.uid,
    byName: person(m.full_name_ar, m.full_name_en), unread: m.unread,
    date: dpart(m.created_at), time: tpart(m.created_at)
  })));
}));

app.post('/api/chat', auth, wrap(async (req, res) => {
  const { compSlug, itemKind, itemId, body } = req.body || {};
  if (!compSlug || !body || !String(body).trim()) return res.status(400).json({ error: 'missing_fields' });
  const c = await query('SELECT id FROM components WHERE company_id=$1 AND slug=$2', [req.user.fid, compSlug]);
  if (!c.rowCount) return res.status(404).json({ error: 'component_not_found' });

  const kind = KIND_MAP[itemKind] || null;
  const r = await query(
    `INSERT INTO chat_messages (company_id,component_id,item_kind,item_id,sender_id,body)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
    [req.user.fid, c.rows[0].id, kind, kind ? itemId : null, req.user.uid, String(body).trim()]);
  await query('INSERT INTO chat_reads (message_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [r.rows[0].id, req.user.uid]);
  res.json({ ok: true, id: Number(r.rows[0].id), date: dpart(r.rows[0].created_at), time: tpart(r.rows[0].created_at) });
}));

// تعليم رسائل كمقروءة
app.post('/api/chat/read', auth, wrap(async (req, res) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, marked: 0 });
  const r = await query(
    `INSERT INTO chat_reads (message_id,user_id)
     SELECT m.id, $2 FROM chat_messages m
      WHERE m.company_id = $1 AND m.id = ANY($3::bigint[])
     ON CONFLICT DO NOTHING`,
    [req.user.fid, req.user.uid, ids]);
  res.json({ ok: true, marked: r.rowCount });
}));

// إعادة ربط رسالة ببند آخر
app.patch('/api/chat/:id/link', auth, wrap(async (req, res) => {
  const { compSlug, itemKind, itemId } = req.body || {};
  const c = await query('SELECT id FROM components WHERE company_id=$1 AND slug=$2', [req.user.fid, compSlug]);
  if (!c.rowCount) return res.status(404).json({ error: 'component_not_found' });
  const kind = KIND_MAP[itemKind] || null;
  const r = await query(
    `UPDATE chat_messages SET component_id=$1, item_kind=$2, item_id=$3
      WHERE id=$4 AND company_id=$5 RETURNING id`,
    [c.rows[0].id, kind, kind ? itemId : null, Number(req.params.id), req.user.fid]);
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
}));

// عدّادات غير المقروء (اختياري للاستقصاء الدوري)
app.get('/api/chat/unread', auth, wrap(async (req, res) => {
  const r = await query(
    `SELECT c.slug, COUNT(*)::int AS n
       FROM chat_messages m
       JOIN components c ON c.id = m.component_id
       LEFT JOIN chat_reads rd ON rd.message_id = m.id AND rd.user_id = $2
      WHERE m.company_id=$1 AND rd.message_id IS NULL AND m.sender_id <> $2 AND m.deleted_at IS NULL
      GROUP BY c.slug`, [req.user.fid, req.user.uid]);
  res.json(Object.fromEntries(r.rows.map((x) => [x.slug, x.n])));
}));

// ================================================================= EXPORT / IMPORT
// نسخة كاملة قابلة للتنزيل والاستيراد لاحقاً — تُستخدم مفاتيح طبيعية (slug/code)
// بدل UUID الخام حتى تُستورد بأمان في أي قاعدة بيانات أخرى لنفس النظام.
app.get('/api/export', auth, requireAdmin, wrap(async (req, res) => {
  const fid = req.user.fid;
  const [firm, users, comps, objs, risks, resps, tests, results] = await Promise.all([
    query('SELECT * FROM companies WHERE id=$1', [fid]),
    query(`SELECT username, first_name_ar, last_name_ar, first_name_en, last_name_en,
                  email, role_id, job_title_ar, job_title_en, is_active
             FROM users WHERE company_id=$1`, [fid]),
    query('SELECT slug, seq, name_ar, name_en, desc_ar, desc_en FROM components WHERE company_id=$1', [fid]),
    query(`SELECT o.code, c.slug AS component_slug, o.standard_ref, o.title_ar, o.title_en, o.desc_ar, o.desc_en,
                  o.is_additional, ow.username AS owner_username
             FROM objectives o JOIN components c ON c.id=o.component_id
             LEFT JOIN users ow ON ow.id=o.owner_id WHERE o.company_id=$1`, [fid]),
    query(`SELECT k.code, o.code AS objective_code, k.title_ar, k.title_en, k.desc_ar, k.desc_en,
                  k.severity, k.likelihood, k.impact, k.status, ow.username AS owner_username, k.due_date
             FROM risks k JOIN objectives o ON o.id=k.objective_id
             LEFT JOIN users ow ON ow.id=k.owner_id WHERE k.company_id=$1`, [fid]),
    query(`SELECT p.code, k.code AS risk_code, p.title_ar, p.title_en, p.desc_ar, p.desc_en,
                  p.resp_type, p.status, au.username AS assigned_username, p.due_date
             FROM responses p JOIN risks k ON k.id=p.risk_id
             LEFT JOIN users au ON au.id=p.assigned_to WHERE p.company_id=$1`, [fid]),
    query(`SELECT tt.code, p.code AS response_code, tt.title_ar, tt.title_en, tt.desc_ar, tt.desc_en,
                  tt.status, au.username AS assigned_username, tt.due_date
             FROM tests tt JOIN responses p ON p.id=tt.response_id
             LEFT JOIN users au ON au.id=tt.assigned_to WHERE tt.company_id=$1`, [fid]),
    query(`SELECT x.code, tt.code AS test_code, x.title_ar, x.title_en, x.desc_ar, x.desc_en,
                  x.status, tu.username AS tested_username, x.tested_at
             FROM results x JOIN tests tt ON tt.id=x.test_id
             LEFT JOIN users tu ON tu.id=x.tested_by WHERE x.company_id=$1`, [fid])
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="isqm-backup-${dpart(new Date())}.json"`);
  res.json({
    meta: { exportedAt: new Date().toISOString(), firmCode: firm.rows[0]?.code, version: 2 },
    firm: firm.rows[0], users: users.rows, components: comps.rows,
    objectives: objs.rows, risks: risks.rows, responses: resps.rows, tests: tests.rows, results: results.rows
  });
}));

// قالب استيراد احترافي بصيغة Excel — يحتوي البيانات الحالية للتعديل عليها،
// مع قوائم منسدلة حقيقية لأعمدة الربط (تشمل تلقائياً أي صف جديد تضيفه بنفس العمود المصدر).
app.get('/api/import/template', auth, requireAdmin, wrap(async (req, res) => {
  const fid = req.user.fid;
  const [users, comps, objs, risks, resps, tests, results] = await Promise.all([
    query(`SELECT username, concat_ws(' ',first_name_ar,last_name_ar) AS full_name_ar,
                  (SELECT name_ar FROM roles WHERE id=users.role_id) AS role
             FROM users WHERE company_id=$1 ORDER BY username`, [fid]),
    query('SELECT slug, seq, name_ar, name_en, desc_ar, desc_en FROM components WHERE company_id=$1 ORDER BY seq', [fid]),
    query(`SELECT o.code, c.slug AS component_slug, o.standard_ref, o.title_ar, o.title_en, o.desc_ar, o.desc_en,
                  o.is_additional, ow.username AS owner_username
             FROM objectives o JOIN components c ON c.id=o.component_id
             LEFT JOIN users ow ON ow.id=o.owner_id WHERE o.company_id=$1 ORDER BY o.code`, [fid]),
    query(`SELECT k.code, o.code AS objective_code, k.title_ar, k.title_en, k.desc_ar, k.desc_en,
                  k.severity, k.likelihood, k.impact, k.status, ow.username AS owner_username, k.due_date
             FROM risks k JOIN objectives o ON o.id=k.objective_id
             LEFT JOIN users ow ON ow.id=k.owner_id WHERE k.company_id=$1 ORDER BY k.code`, [fid]),
    query(`SELECT p.code, k.code AS risk_code, p.title_ar, p.title_en, p.desc_ar, p.desc_en,
                  p.resp_type, p.status, au.username AS assigned_username, p.due_date
             FROM responses p JOIN risks k ON k.id=p.risk_id
             LEFT JOIN users au ON au.id=p.assigned_to WHERE p.company_id=$1 ORDER BY p.code`, [fid]),
    query(`SELECT tt.code, p.code AS response_code, tt.title_ar, tt.title_en, tt.desc_ar, tt.desc_en,
                  tt.status, au.username AS assigned_username, tt.due_date
             FROM tests tt JOIN responses p ON p.id=tt.response_id
             LEFT JOIN users au ON au.id=tt.assigned_to WHERE tt.company_id=$1 ORDER BY tt.code`, [fid]),
    query(`SELECT x.code, tt.code AS test_code, x.title_ar, x.title_en, x.desc_ar, x.desc_en,
                  x.status, tu.username AS tested_username, x.tested_at
             FROM results x JOIN tests tt ON tt.id=x.test_id
             LEFT JOIN users tu ON tu.id=x.tested_by WHERE x.company_id=$1 ORDER BY x.code`, [fid])
  ]);

  const MAXROW = 500; // مدى الصفوف الذي تغطيه القوائم المنسدلة — يشمل أي صف جديد تضيفه بالإكسل
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ISQM 1';

  const shInstr = wb.addWorksheet('تعليمات');
  shInstr.views = [{ rightToLeft: true }];
  shInstr.getColumn(1).width = 110;
  [
    'قالب استيراد بيانات نظام ISQM 1',
    '',
    'الصفحات التالية تعرض بياناتك الحالية بالنظام — عدّل عليها مباشرة، أو أضف صفوفاً جديدة أسفل آخر صف بأي صفحة.',
    '',
    'أعمدة الربط (component_slug / objective_code / risk_code / response_code / test_code / أعمدة المستخدمين) قوائم منسدلة: انقر الخلية ثم السهم لاختيار القيمة.',
    '',
    'القوائم المنسدلة تشمل تلقائياً أي صف جديد تضيفه بالصفحة المصدر. مثال: أضف هدفاً جديداً بصفحة "الأهداف" بكود O-99، ثم اذهب لصفحة "المخاطر" وستجد O-99 ضمن قائمة objective_code مباشرة — دون تنزيل قالب جديد.',
    '',
    'لإضافة عنصر جديد: أضف صفاً بصفحته الصحيحة، اكتب له كوداً غير مكرر بعمود code، ثم اختره من القائمة المنسدلة بعمود الربط بالصفحة التالية.',
    '',
    'بعد التعديل احفظ الملف وارفعه من زر الاستيراد بصفحة إدارة الجودة. تنبيه: الاستيراد يستبدل كامل شجرة الأهداف↓النتائج الحالية بمحتوى الملف، ولا يمسّ المستخدمين ولا بيانات الشركة.'
  ].forEach((line) => shInstr.addRow([line]));

  const enumVal = (values) => ({ type: 'list', allowBlank: true, formulae: [`"${values.join(',')}"`] });
  const nameVal = (definedName) => ({ type: 'list', allowBlank: true, formulae: [definedName] });
  const colLetter = (i) => {
    let s = '', n = i + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };

  // ورقة تُبنى أولاً ثم تُسجَّل كنطاق مُسمّى (defined name) ليُستخدم في القوائم المنسدلة.
  // استخدام الأسماء المعرّفة بدل الإشارة المباشرة للأوراق يتفادى مشاكل توافق الإكسل مع أسماء الأوراق العربية.
  function addSheet(name, headers, rows) {
    const sh = wb.addWorksheet(name);
    sh.views = [{ rightToLeft: true }];
    const hr = sh.addRow(headers);
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7C6B' } }; });
    headers.forEach((_, i) => { sh.getColumn(i + 1).width = 22; });
    rows.forEach((r) => sh.addRow(headers.map((h) => (r[h] == null ? '' : r[h]))));
    sh.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
    sh.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    return sh;
  }
  // يضيف تحقق قائمة على عمود كامل بنداء واحد — مهم: نداء واحد لكل عمود يمنع تكرار
  // النطاقات المتداخلة الذي يجعل الإكسل يتجاهل القوائم المنسدلة بالكامل.
  const applyCol = (sheet, headers, header, validation) => {
    const idx = headers.indexOf(header);
    if (idx < 0) return;
    const c = colLetter(idx);
    sheet.dataValidations.add(`${c}2:${c}${MAXROW}`, validation);
  };
  const defineList = (sheetName, headers, header, listName) => {
    const c = colLetter(headers.indexOf(header));
    wb.definedNames.add(`'${sheetName}'!$${c}$2:$${c}$${MAXROW}`, listName);
  };

  const userHeaders = ['username', 'full_name_ar', 'role'];
  addSheet('المستخدمون', userHeaders, users.rows);
  defineList('المستخدمون', userHeaders, 'username', 'LIST_USERS');

  const compHeaders = ['slug', 'seq', 'name_ar', 'name_en', 'desc_ar', 'desc_en'];
  addSheet('المكونات', compHeaders, comps.rows);
  defineList('المكونات', compHeaders, 'slug', 'LIST_COMPONENTS');

  const objHeaders = ['code', 'component_slug', 'standard_ref', 'title_ar', 'title_en', 'desc_ar', 'desc_en', 'is_additional', 'owner_username'];
  const shObj = addSheet('الأهداف', objHeaders, objs.rows);
  defineList('الأهداف', objHeaders, 'code', 'LIST_OBJECTIVES');
  applyCol(shObj, objHeaders, 'component_slug', nameVal('LIST_COMPONENTS'));
  applyCol(shObj, objHeaders, 'is_additional', enumVal(['TRUE', 'FALSE']));
  applyCol(shObj, objHeaders, 'owner_username', nameVal('LIST_USERS'));

  const riskHeaders = ['code', 'objective_code', 'title_ar', 'title_en', 'desc_ar', 'desc_en', 'severity', 'likelihood', 'impact', 'status', 'owner_username', 'due_date'];
  const shRisk = addSheet('المخاطر', riskHeaders, risks.rows);
  defineList('المخاطر', riskHeaders, 'code', 'LIST_RISKS');
  applyCol(shRisk, riskHeaders, 'objective_code', nameVal('LIST_OBJECTIVES'));
  applyCol(shRisk, riskHeaders, 'severity', enumVal(['high', 'medium', 'low']));
  applyCol(shRisk, riskHeaders, 'status', enumVal(['open', 'monitored', 'closed']));
  applyCol(shRisk, riskHeaders, 'owner_username', nameVal('LIST_USERS'));

  const respHeaders = ['code', 'risk_code', 'title_ar', 'title_en', 'desc_ar', 'desc_en', 'resp_type', 'status', 'assigned_username', 'due_date'];
  const shResp = addSheet('الإجراءات', respHeaders, resps.rows);
  defineList('الإجراءات', respHeaders, 'code', 'LIST_RESPONSES');
  applyCol(shResp, respHeaders, 'risk_code', nameVal('LIST_RISKS'));
  applyCol(shResp, respHeaders, 'resp_type', enumVal(['prev', 'det', 'mon']));
  applyCol(shResp, respHeaders, 'status', enumVal(['inprog', 'done', 'late']));
  applyCol(shResp, respHeaders, 'assigned_username', nameVal('LIST_USERS'));

  const testHeaders = ['code', 'response_code', 'title_ar', 'title_en', 'desc_ar', 'desc_en', 'status', 'assigned_username', 'due_date'];
  const shTest = addSheet('الاختبارات', testHeaders, tests.rows);
  defineList('الاختبارات', testHeaders, 'code', 'LIST_TESTS');
  applyCol(shTest, testHeaders, 'response_code', nameVal('LIST_RESPONSES'));
  applyCol(shTest, testHeaders, 'status', enumVal(['planned', 'inprogress', 'completed']));
  applyCol(shTest, testHeaders, 'assigned_username', nameVal('LIST_USERS'));

  const resHeaders = ['code', 'test_code', 'title_ar', 'title_en', 'desc_ar', 'desc_en', 'status', 'tested_username', 'tested_at'];
  const shRes = addSheet('النتائج', resHeaders, results.rows);
  applyCol(shRes, resHeaders, 'test_code', nameVal('LIST_TESTS'));
  applyCol(shRes, resHeaders, 'status', enumVal(['effective', 'partial', 'ineffective']));
  applyCol(shRes, resHeaders, 'tested_username', nameVal('LIST_USERS'));

  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="isqm-import-template.xlsx"');
  res.send(Buffer.from(buf));
}));

// استيراد: يستبدل شجرة الجودة الكاملة (مكوّنات→أهداف→مخاطر→استجابات→اختبارات→نتائج) لنفس
// الشركة المسجَّل بها المستخدم الحالي فقط. لا يمسّ المستخدمين ولا هوية الشركة نفسها
// حتى لا يفقد أحد صلاحية الدخول بسبب استيراد خاطئ.
app.post('/api/import', auth, requireAdmin, wrap(async (req, res) => {
  const data = req.body?.data;
  if (!data || !Array.isArray(data.components)) return res.status(400).json({ error: 'invalid_file' });
  const fid = req.user.fid;

  const stats = await tx(async (c) => {
    const users = await c.query('SELECT id, username FROM users WHERE company_id=$1', [fid]);
    const uMap = Object.fromEntries(users.rows.map((u) => [u.username, u.id]));

    // مكوّنات: تحديث أو إضافة بدون حذف — لا نغيّر التقسيم الثمانية الأساسي
    const cMap = {};
    for (const comp of data.components) {
      const r = await c.query(
        `INSERT INTO components (company_id,slug,seq,name_ar,name_en,desc_ar,desc_en) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (company_id,slug) DO UPDATE SET seq=EXCLUDED.seq, name_ar=EXCLUDED.name_ar,
           name_en=EXCLUDED.name_en, desc_ar=EXCLUDED.desc_ar, desc_en=EXCLUDED.desc_en RETURNING id, slug`,
        [fid, comp.slug, comp.seq, comp.name_ar, comp.name_en || comp.name_ar, comp.desc_ar || null, comp.desc_en || null]);
      cMap[r.rows[0].slug] = r.rows[0].id;
    }

    // حذف الشجرة القديمة (أهداف→مخاطر→استجابات→اختبارات→نتائج) ثم إعادة بنائها من الملف المستورد
    await c.query('DELETE FROM objectives WHERE company_id=$1', [fid]);

    const oMap = {};
    for (const o of (data.objectives || [])) {
      const compId = cMap[o.component_slug];
      if (!compId) continue;
      const r = await c.query(
        `INSERT INTO objectives (company_id,component_id,code,standard_ref,title_ar,title_en,desc_ar,desc_en,
                                  is_additional,owner_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, code`,
        [fid, compId, o.code, o.standard_ref || null, o.title_ar, o.title_en || o.title_ar,
         o.desc_ar || o.title_ar, o.desc_en || null, !!o.is_additional,
         uMap[o.owner_username] || null, req.user.uid]);
      oMap[r.rows[0].code] = r.rows[0].id;
    }

    const rMap = {};
    for (const k of (data.risks || [])) {
      const objId = oMap[k.objective_code];
      if (!objId) continue;
      const r = await c.query(
        `INSERT INTO risks (company_id,objective_id,code,title_ar,title_en,desc_ar,desc_en,severity,
                             likelihood,impact,status,owner_id,created_by,due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, code`,
        [fid, objId, k.code, k.title_ar, k.title_en || k.title_ar, k.desc_ar || k.title_ar, k.desc_en || null,
         k.severity || 'medium', k.likelihood || null, k.impact || null, k.status || 'open',
         uMap[k.owner_username] || null, req.user.uid, k.due_date || null]);
      rMap[r.rows[0].code] = r.rows[0].id;
    }

    const pMap = {};
    for (const p of (data.responses || [])) {
      const riskId = rMap[p.risk_code];
      if (!riskId) continue;
      const r = await c.query(
        `INSERT INTO responses (company_id,risk_id,code,title_ar,title_en,desc_ar,desc_en,resp_type,status,
                                 assigned_to,created_by,due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, code`,
        [fid, riskId, p.code, p.title_ar, p.title_en || p.title_ar, p.desc_ar || p.title_ar, p.desc_en || null,
         p.resp_type || 'prev', p.status || 'inprog', uMap[p.assigned_username] || req.user.uid,
         req.user.uid, p.due_date || null]);
      pMap[r.rows[0].code] = r.rows[0].id;
    }

    const tMap = {};
    for (const tt of (data.tests || [])) {
      const respId = pMap[tt.response_code];
      if (!respId) continue;
      const r = await c.query(
        `INSERT INTO tests (company_id,response_id,code,title_ar,title_en,desc_ar,desc_en,status,
                             assigned_to,created_by,due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, code`,
        [fid, respId, tt.code, tt.title_ar, tt.title_en || tt.title_ar, tt.desc_ar || tt.title_ar, tt.desc_en || null,
         tt.status || 'planned', uMap[tt.assigned_username] || req.user.uid, req.user.uid, tt.due_date || null]);
      tMap[r.rows[0].code] = r.rows[0].id;
    }

    let resultCount = 0;
    for (const x of (data.results || [])) {
      const testId = tMap[x.test_code];
      if (!testId) continue;
      await c.query(
        `INSERT INTO results (company_id,test_id,code,title_ar,title_en,desc_ar,desc_en,status,
                               tested_by,created_by,tested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,now()))`,
        [fid, testId, x.code, x.title_ar, x.title_en || x.title_ar, x.desc_ar || x.title_ar, x.desc_en || null,
         x.status || 'effective', uMap[x.tested_username] || null, req.user.uid, x.tested_at || null]);
      resultCount++;
    }

    return {
      components: Object.keys(cMap).length, objectives: Object.keys(oMap).length,
      risks: Object.keys(rMap).length, responses: Object.keys(pMap).length,
      tests: Object.keys(tMap).length, results: resultCount
    };
  });

  res.json({ ok: true, imported: stats });
}));

// ================================================================= MISC
app.get('/api/health', wrap(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, time: new Date().toISOString() });
}));

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = app.listen(PORT, () => console.log(`▶ ISQM server on :${PORT}`));
process.on('SIGTERM', () => server.close(() => pool.end()));
