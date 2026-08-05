-- =====================================================================
-- شغّل هذا الملف أولاً (مرة واحدة) عشان يحذف أي بقايا جداول/أنواع (types)
-- قديمة قد تكون موجودة من محاولة سابقة، ثم شغّل schema.sql بعده مباشرة.
-- هذا الأمر آمن حتى لو الجداول أصلاً غير موجودة (IF EXISTS).
-- =====================================================================
BEGIN;

DROP VIEW  IF EXISTS v_unread_by_item, v_unread_by_component, v_component_stats CASCADE;

DROP TABLE IF EXISTS activity_log, chat_reads, chat_messages, attachments,
                     results, tests, responses, risks, objectives, components, users, firms,
                     registration_attempts CASCADE;

DROP TYPE  IF EXISTS severity_level, risk_status, response_status, response_type,
                     result_status, test_status, user_role, item_kind CASCADE;

DROP FUNCTION IF EXISTS set_updated_at CASCADE;

COMMIT;
