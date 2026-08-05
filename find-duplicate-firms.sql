-- =====================================================================
-- تشخيص: إيجاد الشركات المكرّرة التي أنشأها خطأ النقر المتكرر على "إنشاء الحساب"
-- شغّلها للاطلاع فقط، ثم قرر يدوياً أي الشركات تحذفها بأمان.
-- =====================================================================

-- 1) شركات لها نفس اسم المكتب / نفس السجل التجاري / نفس بريد المسؤول،
--    وأُنشئت خلال نفس الدقيقة تقريباً (علامة قوية على أنها ناتجة عن نقر متكرر)
SELECT f.id, f.firm_code, f.name_ar, f.cr_no, f.email, f.created_at,
       (SELECT username FROM users WHERE firm_id = f.id ORDER BY created_at LIMIT 1) AS admin_username
FROM firms f
WHERE EXISTS (
  SELECT 1 FROM firms f2
  WHERE f2.id <> f.id
    AND f2.name_ar = f.name_ar
    AND COALESCE(f2.cr_no,'') = COALESCE(f.cr_no,'')
    AND abs(extract(epoch FROM f2.created_at - f.created_at)) < 60
)
ORDER BY f.name_ar, f.created_at;

-- 2) بعد تحديد الشركة "الصحيحة" التي تريد الاحتفاظ بها (احتفظ بمعرفها KEEP_ID)،
--    احذف البقية بأمان — الحذف تسلسلي بسبب ON DELETE CASCADE على firm_id:
-- DELETE FROM firms WHERE id = 'PUT-DUPLICATE-FIRM-ID-HERE';
-- (يحذف تلقائياً: users, components, objectives, risks, responses, results,
--  chat_messages, attachments, activity_log التابعة لتلك الشركة فقط)
