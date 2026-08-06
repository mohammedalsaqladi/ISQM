-- =====================================================================
--  ISQM 1 Quality Management System — Database Schema (PostgreSQL 14+)
--  نظام إدارة الجودة وفق المعيار الدولي ISQM 1 — مخطط قاعدة البيانات
--  جداول companies و users مطابقة لبنية الأعمدة المعتمدة لديك.
-- =====================================================================

-- تنظيف أي بقايا من تشغيل سابق — يجعل الملف آمناً للتشغيل في أي وقت.
DROP VIEW  IF EXISTS v_unread_by_item, v_unread_by_component, v_component_stats CASCADE;
DROP TABLE IF EXISTS activity_log, chat_reads, chat_messages, attachments,
                     results, tests, responses, risks, objectives, components,
                     users, branches, companies, roles, firms,
                     registration_attempts CASCADE;
DROP TYPE  IF EXISTS severity_level, risk_status, response_status, response_type,
                     result_status, test_status, user_role, item_kind CASCADE;
DROP FUNCTION IF EXISTS set_updated_at CASCADE;

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE severity_level   AS ENUM ('high','medium','low');
CREATE TYPE risk_status      AS ENUM ('open','monitored','closed');
CREATE TYPE response_status  AS ENUM ('inprog','done','late');
CREATE TYPE response_type    AS ENUM ('prev','det','mon');      -- وقائية / كاشفة / رقابية
CREATE TYPE result_status    AS ENUM ('effective','partial','ineffective');
CREATE TYPE test_status      AS ENUM ('planned','inprogress','completed');
CREATE TYPE item_kind        AS ENUM ('component','objective','risk','response','test','result');

-- ---------------------------------------------------------------------
-- 1. ROLES  (الأدوار — جدول مرجعي يرتبط به users.role_id)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id        INTEGER PRIMARY KEY,
    slug      VARCHAR(30) NOT NULL UNIQUE,
    name_ar   VARCHAR(60) NOT NULL,
    name_en   VARCHAR(60) NOT NULL,
    is_admin  BOOLEAN NOT NULL DEFAULT FALSE   -- صلاحية إدارة المستخدمين وبيانات الشركة
);
INSERT INTO roles (id, slug, name_ar, name_en, is_admin) VALUES
 (1,'owner',        'مالك',           'Owner',        TRUE),
 (2,'admin',        'مشرف',           'Admin',        TRUE),
 (3,'quality_lead', 'مسؤول الجودة',   'Quality lead', FALSE),
 (4,'manager',      'مدير',           'Manager',      FALSE),
 (5,'staff',        'موظف',           'Staff',        FALSE),
 (6,'viewer',       'مُطّلع فقط',      'Viewer',       FALSE);

-- ---------------------------------------------------------------------
-- 2. COMPANIES  (الشركات / المكاتب)
-- ---------------------------------------------------------------------
CREATE TABLE companies (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code               VARCHAR(20)  NOT NULL UNIQUE,   -- كود الشركة عند تسجيل الدخول
    name_ar            VARCHAR(200) NOT NULL,
    name_en            VARCHAR(200),
    logo_url           TEXT,            -- شعار المكتب (رابط أو data:image base64)
    letterhead_url     TEXT,            -- الورق الرسمي A4 المستخدم كخلفية عند الطباعة
    license_no         VARCHAR(60),     -- رخصة مزاولة المهنة
    cr_number          VARCHAR(60),     -- السجل التجاري
    tax_number         VARCHAR(60),     -- الرقم الضريبي
    email              VARCHAR(160),
    website            VARCHAR(200),
    phone              VARCHAR(60),
    fax                VARCHAR(60),
    street             VARCHAR(200),
    city               VARCHAR(120),
    postal_code        VARCHAR(20),
    subscription_start DATE,
    subscription_end   DATE,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    stamp_url          TEXT,            -- ختم المكتب
    signature_url      TEXT,            -- توقيع معتمد التقرير
    report_footer_ar   TEXT,
    public_base_url    VARCHAR(200),
    report_settings    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- الخط/الهوامش/المقاسات عند الطباعة
    signer_name        VARCHAR(160),    -- اسم معتمد التقرير (الشريك الموقّع)
    signer_title       VARCHAR(200),    -- صفة الموقّع
    -- حقول خاصة بنطاق ISQM 1
    scope_ar           TEXT,
    scope_en           TEXT,
    period_start       DATE,
    period_end         DATE,
    partners_count     INTEGER DEFAULT 0,
    staff_count        INTEGER DEFAULT 0,
    engagements_count  INTEGER DEFAULT 0
);
CREATE INDEX idx_companies_code ON companies(code);

-- ---------------------------------------------------------------------
-- 3. BRANCHES  (الفروع — اختياري، يرتبط به users.branch_id)
-- ---------------------------------------------------------------------
CREATE TABLE branches (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name_ar    VARCHAR(160) NOT NULL,
    name_en    VARCHAR(160),
    city       VARCHAR(120),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_branches_company ON branches(company_id);

-- ---------------------------------------------------------------------
-- 4. USERS  (المستخدمون)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    role_id         INTEGER NOT NULL DEFAULT 5 REFERENCES roles(id),
    first_name_ar   VARCHAR(100) NOT NULL,
    last_name_ar    VARCHAR(100),
    first_name_en   VARCHAR(100),
    last_name_en    VARCHAR(100),
    gender          VARCHAR(10),
    phone           VARCHAR(60),
    job_title_ar    VARCHAR(160),
    job_title_en    VARCHAR(160),
    employment_type VARCHAR(60),
    is_sales_agent  BOOLEAN NOT NULL DEFAULT FALSE,
    username        VARCHAR(60)  NOT NULL,
    email           VARCHAR(160),
    password_hash   TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    qualifications  TEXT,
    UNIQUE (company_id, username)
);
CREATE INDEX idx_users_company ON users(company_id);

-- المسؤول الأعلى والمسؤول التشغيلي عن نظام الجودة (يُضافان بعد users لتفادي دورة مراجع)
ALTER TABLE companies
  ADD COLUMN ultimate_resp_user    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN operational_resp_user UUID REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 5. REGISTRATION ATTEMPTS  (منع تكرار إنشاء الحساب عند تعدد النقر)
-- ---------------------------------------------------------------------
CREATE TABLE registration_attempts (
    idempotency_key VARCHAR(80) PRIMARY KEY,
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    company_code    VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. COMPONENTS  (مكوّنات نظام إدارة الجودة الثمانية)
-- ---------------------------------------------------------------------
CREATE TABLE components (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    slug       VARCHAR(40) NOT NULL,
    seq        INTEGER NOT NULL,
    name_ar    VARCHAR(200) NOT NULL,
    name_en    VARCHAR(200),
    desc_ar    TEXT,
    desc_en    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, slug)
);
CREATE INDEX idx_components_company ON components(company_id);

-- ---------------------------------------------------------------------
-- 7. OBJECTIVES  (أهداف الجودة)
-- ---------------------------------------------------------------------
CREATE TABLE objectives (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    component_id  UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- O-01
    standard_ref  VARCHAR(40),                   -- [1.28]
    title_ar      VARCHAR(300) NOT NULL,
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,
    desc_en       TEXT,
    is_additional BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_objectives_component ON objectives(component_id);

-- ---------------------------------------------------------------------
-- 8. RISKS  (مخاطر الجودة)
-- ---------------------------------------------------------------------
CREATE TABLE risks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    objective_id  UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- RI-01
    title_ar      VARCHAR(300) NOT NULL,
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,
    desc_en       TEXT,
    severity      severity_level NOT NULL DEFAULT 'medium',
    likelihood    SMALLINT CHECK (likelihood BETWEEN 1 AND 5),
    impact        SMALLINT CHECK (impact BETWEEN 1 AND 5),
    status        risk_status NOT NULL DEFAULT 'open',
    owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date      DATE,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_risks_objective ON risks(objective_id);

-- ---------------------------------------------------------------------
-- 9. RESPONSES  (الإجراءات / الاستجابات)
-- ---------------------------------------------------------------------
CREATE TABLE responses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    risk_id       UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- RS-01
    title_ar      VARCHAR(300) NOT NULL,
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,
    desc_en       TEXT,
    resp_type     response_type NOT NULL DEFAULT 'prev',
    status        response_status NOT NULL DEFAULT 'inprog',
    assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date      DATE,
    completed_at  TIMESTAMPTZ,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_responses_risk ON responses(risk_id);

-- ---------------------------------------------------------------------
-- 10. TESTS  (اختبارات فاعلية الإجراء — بين الإجراء والنتيجة)
-- ---------------------------------------------------------------------
CREATE TABLE tests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    response_id   UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- TS-01
    title_ar      VARCHAR(300) NOT NULL,
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,
    desc_en       TEXT,
    status        test_status NOT NULL DEFAULT 'planned',
    assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date      DATE,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_tests_response ON tests(response_id);

-- ---------------------------------------------------------------------
-- 11. RESULTS  (نتائج تنفيذ الاختبار)
-- ---------------------------------------------------------------------
CREATE TABLE results (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    test_id       UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- OC-01
    title_ar      VARCHAR(300) NOT NULL,
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,
    desc_en       TEXT,
    status        result_status NOT NULL DEFAULT 'effective',
    tested_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    tested_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_results_test ON results(test_id);

-- ---------------------------------------------------------------------
-- 12. ATTACHMENTS  (المرفقات — أدلة الجودة)
-- ---------------------------------------------------------------------
CREATE TABLE attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_kind    item_kind NOT NULL,
    item_id      UUID NOT NULL,
    file_name    VARCHAR(300) NOT NULL,
    file_url     TEXT NOT NULL,
    mime_type    VARCHAR(120),
    size_bytes   BIGINT,
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_item ON attachments(item_kind, item_id);

-- ---------------------------------------------------------------------
-- 13. CHAT MESSAGES  (الدردشة المرتبطة بالبنود)
-- ---------------------------------------------------------------------
CREATE TABLE chat_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    component_id  UUID REFERENCES components(id) ON DELETE CASCADE,
    item_kind     item_kind,
    item_id       UUID,
    item_code     VARCHAR(20),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    body          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_company ON chat_messages(company_id, created_at);

CREATE TABLE chat_reads (
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id   UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    read_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, message_id)
);

-- ---------------------------------------------------------------------
-- 14. ACTIVITY LOG  (سجل النشاط)
-- ---------------------------------------------------------------------
CREATE TABLE activity_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(40) NOT NULL,
    item_kind   item_kind,
    item_id     UUID,
    old_value   JSONB,
    new_value   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_company ON activity_log(company_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 15. VIEWS
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_component_stats AS
SELECT c.id AS component_id, c.company_id, c.slug, c.seq, c.name_ar, c.name_en,
       COUNT(DISTINCT o.id)                                              AS objectives_count,
       COUNT(DISTINCT k.id)                                              AS risks_count,
       COUNT(DISTINCT k.id) FILTER (WHERE k.severity = 'high')           AS risks_high,
       COUNT(DISTINCT k.id) FILTER (WHERE k.severity = 'medium')         AS risks_medium,
       COUNT(DISTINCT k.id) FILTER (WHERE k.severity = 'low')            AS risks_low,
       COUNT(DISTINCT p.id)                                              AS responses_count,
       COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'late')             AS responses_late,
       COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'done')             AS responses_done,
       COUNT(DISTINCT t.id)                                              AS tests_count,
       COUNT(DISTINCT x.id)                                              AS results_count
FROM       components c
LEFT JOIN  objectives o ON o.component_id = c.id
LEFT JOIN  risks      k ON k.objective_id = o.id
LEFT JOIN  responses  p ON p.risk_id      = k.id
LEFT JOIN  tests      t ON t.response_id  = p.id
LEFT JOIN  results    x ON x.test_id      = t.id
GROUP BY   c.id;

CREATE OR REPLACE VIEW v_unread_by_component AS
SELECT u.id AS user_id, m.component_id, COUNT(*) AS unread
FROM   users u
JOIN   chat_messages m ON m.company_id = u.company_id AND m.user_id <> u.id
LEFT   JOIN chat_reads r ON r.message_id = m.id AND r.user_id = u.id
WHERE  r.message_id IS NULL
GROUP BY u.id, m.component_id;

CREATE OR REPLACE VIEW v_unread_by_item AS
SELECT u.id AS user_id, m.component_id, m.item_code, COUNT(*) AS unread
FROM   users u
JOIN   chat_messages m ON m.company_id = u.company_id AND m.user_id <> u.id
LEFT   JOIN chat_reads r ON r.message_id = m.id AND r.user_id = u.id
WHERE  r.message_id IS NULL
GROUP BY u.id, m.component_id, m.item_code;

-- ---------------------------------------------------------------------
-- 16. TRIGGER  (تحديث updated_at تلقائياً)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['companies','users','components','objectives','risks',
                             'responses','tests','results'] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl, tbl);
  END LOOP;
END $$;

COMMIT;
