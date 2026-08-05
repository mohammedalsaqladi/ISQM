# ISQM 1 — نظام إدارة الجودة | Quality Management System

نظام إدارة جودة للمكاتب المهنية وفق المعيار الدولي **ISQM 1** — ثنائي اللغة (عربي RTL / إنجليزي LTR)، مبني على **Node.js + Express + PostgreSQL**، وجاهز للنشر على **Render**.

---

## المزايا

- **تسجيل دخول حقيقي**: كود الشركة + اسم المستخدم + كلمة المرور (bcrypt + JWT)
- **إنشاء حساب شركة جديدة** يُنشئ الشركة والمستخدم المالك والمكوّنات الثمانية تلقائياً
- **المكوّنات الثمانية** في لوحة جانبية مستقلة + خيار «جميع المكوّنات»
- **شجرة هرمية**: ◎ هدف ← ⚠ خطر ← ➜ استجابة ← ✔ نتيجة، بعناوين مختصرة ومنشئ العملية والتاريخ والوقت
- **دردشة فريق** مرتبطة بكل بند، مع **عدّاد رسائل غير مقروءة** لكل مكوّن وكل عنصر، وإعادة ربط أي رسالة ببند آخر
- **إحصائيات** عامة ومفلترة لكل مكوّن + **طباعة احترافية** لكل شاشة
- عزل كامل بين الشركات (multi-tenant) — كل استعلام مقيّد بـ `firm_id`

---

## التشغيل محلياً

```bash
git clone https://github.com/<username>/isqm-system.git
cd isqm-system
npm install

cp .env.example .env          # ثم عدّل DATABASE_URL و JWT_SECRET
createdb isqm

npm run migrate               # إنشاء الجداول والعروض
npm run seed                  # إدخال بيانات البداية
npm start                     # http://localhost:3000
```

**بيانات الدخول بعد البذور:**
```
كود الشركة : ISQM-001
المستخدم   : admin
كلمة المرور: 123456
```

أوامر إضافية:
```bash
node migrate.js --fresh       # حذف كل الجداول وإعادة إنشائها
node seed.js --force          # إعادة إدخال بيانات الشركة التجريبية
```

---

## النشر على Render

### الطريقة الأولى — Blueprint (تلقائي بالكامل)
1. ارفع المستودع على GitHub.
2. في Render: **New → Blueprint** واختر المستودع.
3. Render يقرأ `render.yaml` فيُنشئ قاعدة PostgreSQL وخدمة الويب ويربطهما، ثم ينفّذ الهجرة والبذور تلقائياً أثناء البناء.
4. ضع قيمة `SEED_ADMIN_PASS` في لوحة التحكم (Environment) قبل أول بناء.

### الطريقة الثانية — يدوي
1. **New → PostgreSQL** → أنشئ قاعدة وانسخ **Internal Database URL**.
2. **New → Web Service** → اربط المستودع بالإعدادات:
   - Build Command: `npm install && npm run migrate && npm run seed`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
3. متغيرات البيئة:
   | المفتاح | القيمة |
   |---|---|
   | `DATABASE_URL` | رابط قاعدة البيانات الداخلي |
   | `JWT_SECRET` | سلسلة عشوائية طويلة |
   | `SEED_ADMIN_PASS` | كلمة مرور المدير |

> بعد أول نشر ناجح، غيّر Build Command إلى `npm install` فقط حتى لا تُعاد البذور مع كل نشرة.

---

## واجهة API

| الطريقة | المسار | الوظيفة |
|---|---|---|
| POST | `/api/auth/login` | تسجيل الدخول → JWT |
| POST | `/api/auth/register` | إنشاء شركة جديدة + المكوّنات الثمانية |
| GET | `/api/tree` | الشجرة الكاملة (مكوّنات ← أهداف ← مخاطر ← استجابات ← نتائج) |
| GET | `/api/firm` | بيانات الشركة |
| GET | `/api/users` | مستخدمو الشركة |
| POST | `/api/responses` | إضافة استجابة لخطر |
| GET | `/api/chat` | كل الرسائل مع حالة القراءة لكل رسالة |
| POST | `/api/chat` | إرسال رسالة مرتبطة بمكوّن/بند |
| POST | `/api/chat/read` | تعليم رسائل كمقروءة |
| PATCH | `/api/chat/:id/link` | إعادة ربط رسالة ببند آخر |
| GET | `/api/chat/unread` | عدّادات غير المقروء لكل مكوّن |
| GET | `/api/health` | فحص صحة الخدمة وقاعدة البيانات |

كل المسارات عدا `auth` و `health` تتطلب ترويسة `Authorization: Bearer <token>`.

---

## قاعدة البيانات

**الجداول:** `firms` · `users` · `components` · `objectives` · `risks` · `responses` · `results` · `attachments` · `chat_messages` · `chat_reads` · `activity_log`

**العروض:** `v_component_stats` · `v_unread_by_component` · `v_unread_by_item`

**آلية غير المقروء:** الرسالة غير مقروءة للمستخدم إذا لم يوجد صف `(message_id, user_id)` في `chat_reads`. عند فتح المحادثة ترسل الواجهة `POST /api/chat/read` بمعرفات الرسائل المعروضة.

**ربط الرسالة بالبند:** `component_id` إلزامي، و`(item_kind, item_id)` اختياريان — إن كانا `NULL` فالرسالة على مستوى المكوّن كاملاً.

---

## بنية المستودع

```
├── server.js          # Express API + خدمة الملفات الثابتة
├── db.js              # اتصال PostgreSQL (SSL تلقائي على Render)
├── migrate.js         # تنفيذ schema.sql
├── seed.js            # إدخال بيانات البداية
├── seed-data.js       # بيانات ISQM 1 الجاهزة (8 مكوّنات، 9 أهداف، 22 خطراً، 26 استجابة، 10 نتائج)
├── schema.sql         # مخطط قاعدة البيانات + العروض + الاستعلامات
├── public/index.html  # الواجهة (تستهلك الـ API)
├── render.yaml        # Blueprint للنشر
└── .env.example
```

---

## خارطة الطريق

- [ ] تعديل وحذف عناصر الشجرة من الواجهة (الآن الإضافة للاستجابات فقط)
- [ ] دردشة لحظية عبر WebSocket بدل إعادة التحميل
- [ ] رفع المرفقات كأدلة (جدول `attachments` جاهز)
- [ ] تصدير التقارير PDF / Excel
- [ ] وحدة ISQM 2 (فحص جودة الارتباط)

## الترخيص
MIT
