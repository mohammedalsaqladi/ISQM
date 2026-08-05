-- =====================================================================
--  ISQM 1 Quality Management System — Database Schema (PostgreSQL 14+)
--  نظام إدارة الجودة وفق المعيار الدولي ISQM 1 — مخطط قاعدة البيانات
--  Encoding: UTF-8   |   All text columns support Arabic + English
-- =====================================================================

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
CREATE TYPE user_role        AS ENUM ('owner','admin','quality_lead','manager','staff','viewer');
CREATE TYPE item_kind        AS ENUM ('component','objective','risk','response','result');

-- ---------------------------------------------------------------------
-- 1. FIRMS  (الشركات / المكاتب)  — multi-tenant root
-- ---------------------------------------------------------------------
CREATE TABLE firms (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_code           VARCHAR(20)  NOT NULL UNIQUE,          -- كود الشركة عند تسجيل الدخول
    name_ar             VARCHAR(255) NOT NULL,
    name_en             VARCHAR(255),
    license_no          VARCHAR(50),
    cr_no               VARCHAR(50),
    city_ar             VARCHAR(100),
    city_en             VARCHAR(100),
    country_ar          VARCHAR(100),
    country_en          VARCHAR(100),
    phone               VARCHAR(30),
    email               VARCHAR(255),
    partners_count      INTEGER DEFAULT 0,
    staff_count         INTEGER DEFAULT 0,
    engagements_count   INTEGER DEFAULT 0,
    scope_ar            TEXT,
    scope_en            TEXT,
    period_start        DATE,
    period_end          DATE,
    ultimate_resp_user  UUID,      -- FK added after users (المسؤول النهائي)
    operational_resp_user UUID,    -- FK added after users (المسؤول التشغيلي)
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. USERS  (المستخدمون)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    username        VARCHAR(60)  NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,          -- bcrypt / argon2 — never plain text
    full_name_ar    VARCHAR(150) NOT NULL,
    full_name_en    VARCHAR(150),
    email           VARCHAR(255),
    phone           VARCHAR(30),
    role            user_role NOT NULL DEFAULT 'staff',
    job_title_ar    VARCHAR(150),
    job_title_en    VARCHAR(150),
    avatar_url      TEXT,
    lang            CHAR(2) NOT NULL DEFAULT 'ar',  -- ar | en
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (firm_id, username)
);
CREATE INDEX idx_users_firm ON users(firm_id);

ALTER TABLE firms
    ADD CONSTRAINT fk_firms_ultimate FOREIGN KEY (ultimate_resp_user) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_firms_operational FOREIGN KEY (operational_resp_user) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3. COMPONENTS  (المكوّنات الثمانية)
-- ---------------------------------------------------------------------
CREATE TABLE components (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    slug        VARCHAR(30) NOT NULL,          -- gov, ethics, accept, perf, res, info, mon, ra
    seq         SMALLINT    NOT NULL,          -- 1..8
    name_ar     VARCHAR(255) NOT NULL,
    name_en     VARCHAR(255) NOT NULL,
    desc_ar     TEXT,
    desc_en     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (firm_id, slug)
);
CREATE INDEX idx_components_firm ON components(firm_id);

-- ---------------------------------------------------------------------
-- 4. OBJECTIVES  (أهداف الجودة)
-- ---------------------------------------------------------------------
CREATE TABLE objectives (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    component_id  UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- O-01
    standard_ref  VARCHAR(30),                   -- [1.28]
    title_ar      VARCHAR(300) NOT NULL,         -- العنوان المختصر (يظهر في الشجرة)
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,                 -- النص الكامل (يظهر في التفاصيل)
    desc_en       TEXT,
    is_additional BOOLEAN NOT NULL DEFAULT FALSE,-- هدف إضافي خاص بالمكتب
    owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,   -- موجّه إلى
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,   -- منشئ العملية
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (firm_id, code)
);
CREATE INDEX idx_objectives_component ON objectives(component_id);

-- ---------------------------------------------------------------------
-- 5. RISKS  (مخاطر الجودة)
-- ---------------------------------------------------------------------
CREATE TABLE risks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    objective_id  UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- RI-1
    title_ar      VARCHAR(300) NOT NULL,
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,
    desc_en       TEXT,
    severity      severity_level NOT NULL DEFAULT 'medium',
    likelihood    SMALLINT CHECK (likelihood BETWEEN 1 AND 5),
    impact        SMALLINT CHECK (impact     BETWEEN 1 AND 5),
    status        risk_status NOT NULL DEFAULT 'open',
    owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date      DATE,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (firm_id, code)
);
CREATE INDEX idx_risks_objective ON risks(objective_id);
CREATE INDEX idx_risks_owner     ON risks(owner_id);
CREATE INDEX idx_risks_severity  ON risks(firm_id, severity);

-- ---------------------------------------------------------------------
-- 6. RESPONSES  (الاستجابات)
-- ---------------------------------------------------------------------
CREATE TABLE responses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    risk_id       UUID NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,          -- RS-01
    title_ar      VARCHAR(300) NOT NULL,
    title_en      VARCHAR(300),
    desc_ar       TEXT NOT NULL,
    desc_en       TEXT,
    resp_type     response_type   NOT NULL DEFAULT 'prev',
    status        response_status NOT NULL DEFAULT 'inprog',
    assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date      DATE,
    completed_at  TIMESTAMPTZ,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (firm_id, code)
);
CREATE INDEX idx_responses_risk   ON responses(risk_id);
CREATE INDEX idx_responses_status ON responses(firm_id, status);

-- ---------------------------------------------------------------------
-- 7. RESULTS  (نتائج / اختبارات فاعلية الاستجابة)
-- ---------------------------------------------------------------------
CREATE TABLE results (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    response_id   UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
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
    UNIQUE (firm_id, code)
);
CREATE INDEX idx_results_response ON results(response_id);

-- ---------------------------------------------------------------------
-- 7.5 REGISTRATION ATTEMPTS  (منع تكرار إنشاء الحساب عند تعدد النقر/إعادة الإرسال)
--     مفتاح idempotency يُنشئه المتصفح مرة واحدة لكل محاولة تسجيل، فيمنع
--     إنشاء أكثر من شركة/مستخدم واحد لنفس الطلب حتى مع الضغط عدة مرات.
-- ---------------------------------------------------------------------
CREATE TABLE registration_attempts (
    idempotency_key VARCHAR(80) PRIMARY KEY,
    firm_id         UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    firm_code       VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. ATTACHMENTS  (المرفقات — أدلة الجودة)
-- ---------------------------------------------------------------------
CREATE TABLE attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    item_kind    item_kind NOT NULL,
    item_id      UUID NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    file_path    TEXT NOT NULL,
    mime_type    VARCHAR(100),
    size_bytes   BIGINT,
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attach_item ON attachments(firm_id, item_kind, item_id);

-- ---------------------------------------------------------------------
-- 9. CHAT MESSAGES  (الدردشة المرتبطة بالبنود)
--    كل رسالة مرتبطة بمكوّن، واختيارياً ببند داخله (هدف/خطر/استجابة/نتيجة)
--    item_id = NULL  →  دردشة عامة على مستوى المكوّن
-- ---------------------------------------------------------------------
CREATE TABLE chat_messages (
    id            BIGSERIAL PRIMARY KEY,
    firm_id       UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    component_id  UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    item_kind     item_kind,                       -- NULL = component-level
    item_id       UUID,
    sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    reply_to_id   BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
    attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
    edited_at     TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((item_kind IS NULL AND item_id IS NULL) OR (item_kind IS NOT NULL AND item_id IS NOT NULL))
);
CREATE INDEX idx_chat_component ON chat_messages(firm_id, component_id, created_at DESC);
CREATE INDEX idx_chat_item      ON chat_messages(firm_id, item_kind, item_id, created_at DESC);
CREATE INDEX idx_chat_sender    ON chat_messages(sender_id);

-- ---------------------------------------------------------------------
-- 10. CHAT READS  (سجل القراءة — الرسائل غير المقروءة)
--     صف واحد لكل (رسالة، مستخدم) عند فتحها.
--     الرسالة غير مقروءة للمستخدم إذا لم يوجد صف مطابق.
-- ---------------------------------------------------------------------
CREATE TABLE chat_reads (
    message_id  BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id     UUID   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);
CREATE INDEX idx_reads_user ON chat_reads(user_id);

-- ---------------------------------------------------------------------
-- 11. ACTIVITY LOG  (سجل العمليات — من أنشأ/عدّل ومتى)
-- ---------------------------------------------------------------------
CREATE TABLE activity_log (
    id          BIGSERIAL PRIMARY KEY,
    firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(40) NOT NULL,             -- created | updated | deleted | status_changed
    item_kind   item_kind NOT NULL,
    item_id     UUID NOT NULL,
    old_value   JSONB,
    new_value   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_log_item ON activity_log(firm_id, item_kind, item_id, created_at DESC);

-- =====================================================================
--  VIEWS  (تُستخدم مباشرة في الشاشات)
-- =====================================================================

-- عدد الرسائل غير المقروءة لكل مستخدم على مستوى المكوّن
CREATE OR REPLACE VIEW v_unread_by_component AS
SELECT u.id            AS user_id,
       m.firm_id,
       m.component_id,
       COUNT(*)        AS unread_count
FROM   chat_messages m
JOIN   users u        ON u.firm_id = m.firm_id
LEFT   JOIN chat_reads r ON r.message_id = m.id AND r.user_id = u.id
WHERE  r.message_id IS NULL
  AND  m.sender_id <> u.id
  AND  m.deleted_at IS NULL
GROUP  BY u.id, m.firm_id, m.component_id;

-- عدد الرسائل غير المقروءة لكل بند (خطر/هدف/استجابة/نتيجة)
CREATE OR REPLACE VIEW v_unread_by_item AS
SELECT u.id AS user_id, m.firm_id, m.component_id, m.item_kind, m.item_id,
       COUNT(*) AS unread_count
FROM   chat_messages m
JOIN   users u ON u.firm_id = m.firm_id
LEFT   JOIN chat_reads r ON r.message_id = m.id AND r.user_id = u.id
WHERE  r.message_id IS NULL
  AND  m.sender_id <> u.id
  AND  m.deleted_at IS NULL
  AND  m.item_id IS NOT NULL
GROUP  BY u.id, m.firm_id, m.component_id, m.item_kind, m.item_id;

-- إحصائيات كل مكوّن (بطاقات الشاشة الرئيسية وشاشة المكوّن)
CREATE OR REPLACE VIEW v_component_stats AS
SELECT c.id AS component_id, c.firm_id, c.slug, c.seq, c.name_ar, c.name_en,
       COUNT(DISTINCT o.id)                                              AS objectives_count,
       COUNT(DISTINCT k.id)                                              AS risks_count,
       COUNT(DISTINCT k.id) FILTER (WHERE k.severity = 'high')           AS risks_high,
       COUNT(DISTINCT k.id) FILTER (WHERE k.severity = 'medium')         AS risks_medium,
       COUNT(DISTINCT k.id) FILTER (WHERE k.severity = 'low')            AS risks_low,
       COUNT(DISTINCT p.id)                                              AS responses_count,
       COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'late')             AS responses_late,
       COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'done')             AS responses_done,
       COUNT(DISTINCT x.id)                                              AS results_count
FROM       components c
LEFT JOIN  objectives o ON o.component_id = c.id
LEFT JOIN  risks      k ON k.objective_id = o.id
LEFT JOIN  responses  p ON p.risk_id      = k.id
LEFT JOIN  results    x ON x.response_id  = p.id
GROUP BY   c.id;

-- =====================================================================
--  TRIGGERS  (تحديث updated_at تلقائياً)
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['firms','users','objectives','risks','responses','results'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at();', tbl);
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
--  SEED — المكوّنات الثمانية لكل شركة جديدة
--  استبدل :firm_id بمعرّف الشركة بعد إنشائها
-- =====================================================================
-- INSERT INTO components (firm_id, slug, seq, name_ar, name_en) VALUES
--  (:firm_id,'gov',    1,'الحوكمة والقيادة',                         'Governance and Leadership'),
--  (:firm_id,'ethics', 2,'المتطلبات الأخلاقية ذات الصلة',            'Relevant Ethical Requirements'),
--  (:firm_id,'accept', 3,'قبول واستمرار العلاقات مع العملاء والارتباطات','Acceptance and Continuance'),
--  (:firm_id,'perf',   4,'أداء الارتباط',                            'Engagement Performance'),
--  (:firm_id,'res',    5,'الموارد',                                  'Resources'),
--  (:firm_id,'info',   6,'المعلومات والاتصال',                        'Information and Communication'),
--  (:firm_id,'mon',    7,'المراقبة والمعالجة',                        'Monitoring and Remediation'),
--  (:firm_id,'ra',     8,'عملية تقييم المخاطر',                      'Risk Assessment Process');

-- =====================================================================
--  QUERIES المستخدمة في الواجهة
-- =====================================================================

-- (1) شجرة مكوّن كامل + عدد غير المقروء لكل بند
-- SELECT o.code, o.title_ar, k.code, k.title_ar, k.severity,
--        COALESCE(ui.unread_count,0) AS unread
-- FROM objectives o
-- LEFT JOIN risks k ON k.objective_id = o.id
-- LEFT JOIN v_unread_by_item ui
--        ON ui.item_kind='risk' AND ui.item_id = k.id AND ui.user_id = :me
-- WHERE o.component_id = :component_id
-- ORDER BY o.sort_order, k.sort_order;

-- (2) رسائل بند محدد (شامل الأبناء يتم تجميعه في طبقة التطبيق)
-- SELECT m.*, u.full_name_ar, (r.message_id IS NULL AND m.sender_id <> :me) AS is_unread
-- FROM chat_messages m
-- JOIN users u ON u.id = m.sender_id
-- LEFT JOIN chat_reads r ON r.message_id = m.id AND r.user_id = :me
-- WHERE m.firm_id = :firm_id AND m.item_kind = :kind AND m.item_id = :item_id
--   AND m.deleted_at IS NULL
-- ORDER BY m.created_at;

-- (3) تعليم الرسائل المعروضة كمقروءة
-- INSERT INTO chat_reads (message_id, user_id)
-- SELECT id, :me FROM chat_messages
-- WHERE firm_id = :firm_id AND component_id = :component_id AND sender_id <> :me
-- ON CONFLICT DO NOTHING;

-- (4) تعديل ربط رسالة ببند آخر
-- UPDATE chat_messages
--    SET component_id = :new_component, item_kind = :new_kind, item_id = :new_item
--  WHERE id = :message_id AND firm_id = :firm_id;
