-- =====================================================================
-- ترقية إضافية لقاعدة بيانات موجودة مسبقاً (لا تحذف أي بيانات)
-- شغّلها مرة واحدة إن كانت قاعدة البيانات منشأة قبل هذا الإصلاح:
--   psql "$DATABASE_URL" -f migrate-2-fix-duplicates.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS registration_attempts (
    idempotency_key VARCHAR(80) PRIMARY KEY,
    firm_id         UUID REFERENCES firms(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    firm_code       VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
