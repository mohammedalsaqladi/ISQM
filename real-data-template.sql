-- =====================================================================
--  تعبئة بيانات حقيقية — بدون أي بيانات تجريبية
--  Real data seeding template — NO sample/demo data
-- =====================================================================
--
-- طريقة الاستخدام:
-- 1) أنشئ شركتك أولاً من الواجهة عبر زر "إنشاء حساب شركة جديدة"
--    (هذا ينشئ الشركة + المستخدم المالك + المكوّنات الثمانية تلقائياً)
-- 2) شغّل الاستعلام رقم (0) تحت لتجيب firm_id الخاص بشركتك
-- 3) انسخ قيمة firm_id والصقها بدل :firm_id في كل الاستعلامات التالية
-- 4) عدّل النصوص بين علامتي التنصيص بمحتواك الفعلي، واحذف أي قسم ما تحتاجه
-- 5) نفّذها بالترتيب من فوق لتحت (لأن كل جدول يعتمد على معرّف الجدول قبله)
--
-- التنفيذ: من Render → خدمة قاعدة البيانات → Shell / psql، أو أي عميل SQL
-- متصل بنفس DATABASE_URL المستخدم بالتطبيق.
-- =====================================================================


-- (0) جلب معرّف شركتك ومعرّفات المستخدمين والمكوّنات
-- ------------------------------------------------------------------
SELECT id AS firm_id, firm_code, name_ar FROM firms ORDER BY created_at DESC LIMIT 5;

-- انسخ الـ firm_id من النتيجة أعلاه، ثم:
SELECT id AS user_id, username, full_name_ar FROM users WHERE firm_id = ':firm_id';
SELECT id AS component_id, slug, name_ar FROM components WHERE firm_id = ':firm_id' ORDER BY seq;


-- =====================================================================
-- (1) إضافة مستخدمين إضافيين لفريقك (اختياري)
-- ملاحظة: password_hash لازم يكون bcrypt-hash وليس نص عادي.
-- أسهل طريقة: أنشئ المستخدم عبر تسجيل حساب جديد بنفس الشركة لاحقاً،
-- أو استخدم هذا الأمر بالطرفية لتوليد الهاش (يتطلب Node + bcryptjs مثبتة):
--   node -e "console.log(require('bcryptjs').hashSync('كلمة_المرور_هنا',10))"
-- انسخ الناتج وضعه مكان :password_hash تحت
-- ------------------------------------------------------------------
INSERT INTO users (firm_id, username, password_hash, full_name_ar, full_name_en, email, role, job_title_ar, job_title_en)
VALUES
 (':firm_id', 'اسم_مستخدم_1', ':password_hash', 'الاسم الكامل بالعربي', 'Full Name in English',
  'email@example.com', 'quality_lead', 'مسمى وظيفي عربي', 'Job title in English');
-- كرر السطر أعلاه لكل مستخدم إضافي، وافصل بينهم بفاصلة إذا بنفس الأمر.


-- =====================================================================
-- (2) إضافة هدف جودة (Objective) داخل مكوّن معيّن
-- component_id: خذه من نتيجة الاستعلام (0) — كل مكوّن له slug ثابت:
--   gov · ethics · accept · perf · res · info · mon · ra
-- code: رمز فريد داخل شركتك، مثل O-01, O-02 ...
-- ------------------------------------------------------------------
INSERT INTO objectives
  (firm_id, component_id, code, standard_ref, title_ar, title_en, desc_ar, desc_en, owner_id, created_by)
VALUES
  (':firm_id',
   (SELECT id FROM components WHERE firm_id=':firm_id' AND slug='gov'),   -- غيّر slug حسب المكوّن
   'O-01',                                   -- رمز الهدف
   '[1.28]',                                 -- رقم الفقرة بالمعيار (اختياري)
   'العنوان المختصر بالعربي',                 -- يظهر بالشجرة
   'Short title in English',
   'الوصف الكامل للهدف كما ينطبق فعلياً على شركتك.',   -- يظهر بنافذة التفاصيل
   'Full objective description as it applies to your firm.',
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='اسم_المستخدم_الموجّه_إليه'),  -- owner
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='اسم_المستخدم_المنشئ')          -- created_by
  )
RETURNING id AS objective_id, code;   -- احتفظ بالـ objective_id للخطوة التالية


-- =====================================================================
-- (3) إضافة خطر (Risk) تحت هدف معيّن
-- objective_id: من نتيجة الخطوة (2) أعلاه، أو استعلم عنه:
--   SELECT id, code FROM objectives WHERE firm_id=':firm_id';
-- severity: 'high' | 'medium' | 'low'
-- status:   'open' | 'monitored' | 'closed'
-- ------------------------------------------------------------------
INSERT INTO risks
  (firm_id, objective_id, code, title_ar, title_en, desc_ar, desc_en,
   severity, status, owner_id, created_by, due_date)
VALUES
  (':firm_id',
   (SELECT id FROM objectives WHERE firm_id=':firm_id' AND code='O-01'),
   'RI-01',
   'عنوان مختصر للخطر بالعربي',
   'Short risk title in English',
   'وصف كامل للخطر كما هو واقع فعلياً بشركتك.',
   'Full risk description as it actually occurs in your firm.',
   'high',
   'open',
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='الموجّه_إليه'),
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='المنشئ'),
   '2026-12-31'   -- تاريخ الاستحقاق (اختياري، احذف السطر لو ما تحتاجه)
  )
RETURNING id AS risk_id, code;


-- =====================================================================
-- (4) إضافة استجابة (Response) تحت خطر معيّن
-- ملاحظة: تقدر تسوي هذا أيضاً من داخل الواجهة مباشرة (زر + إضافة استجابة)
-- resp_type: 'prev' وقائية | 'det' كاشفة | 'mon' رقابية
-- status:    'inprog' | 'done' | 'late'
-- ------------------------------------------------------------------
INSERT INTO responses
  (firm_id, risk_id, code, title_ar, title_en, desc_ar, desc_en,
   resp_type, status, assigned_to, created_by, due_date)
VALUES
  (':firm_id',
   (SELECT id FROM risks WHERE firm_id=':firm_id' AND code='RI-01'),
   'RS-01',
   'عنوان الاستجابة بالعربي',
   'Response title in English',
   'وصف الإجراء الفعلي المتخذ لمعالجة الخطر.',
   'Full description of the action taken to address the risk.',
   'prev',
   'inprog',
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='المكلّف_بالتنفيذ'),
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='المنشئ'),
   '2026-10-01'
  )
RETURNING id AS response_id, code;


-- =====================================================================
-- (5) إضافة نتيجة اختبار فاعلية (Result) تحت استجابة معيّنة
-- status: 'effective' فعّالة | 'partial' فعّالة جزئياً | 'ineffective' غير فعّالة
-- ------------------------------------------------------------------
INSERT INTO results
  (firm_id, response_id, code, title_ar, title_en, desc_ar, desc_en,
   status, tested_by, created_by, tested_at)
VALUES
  (':firm_id',
   (SELECT id FROM responses WHERE firm_id=':firm_id' AND code='RS-01'),
   'OC-01',
   'عنوان مختصر للنتيجة',
   'Short result title',
   'وصف نتيجة اختبار فاعلية الاستجابة فعلياً.',
   'Description of the actual effectiveness test result.',
   'effective',
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='من_اختبر'),
   (SELECT id FROM users WHERE firm_id=':firm_id' AND username='المنشئ'),
   now()
  );


-- =====================================================================
-- (6) تحقق سريع من شجرتك الكاملة بعد التعبئة
-- ------------------------------------------------------------------
SELECT c.name_ar AS المكون, o.code AS الهدف, k.code AS الخطر,
       k.severity AS الخطورة, p.code AS الاستجابة, p.status AS حالة_الاستجابة,
       x.code AS النتيجة
FROM components c
LEFT JOIN objectives o ON o.component_id = c.id
LEFT JOIN risks      k ON k.objective_id = o.id
LEFT JOIN responses  p ON p.risk_id      = k.id
LEFT JOIN results    x ON x.response_id  = p.id
WHERE c.firm_id = ':firm_id'
ORDER BY c.seq, o.sort_order, k.sort_order;
