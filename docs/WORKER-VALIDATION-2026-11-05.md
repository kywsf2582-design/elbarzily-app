# تقرير التحقق — El Barzily Workers

التاريخ: 2026-11-05. لم يُنشر أي تغيير إلى Production. النسخة المنشورة التي جرى اختبارها عن بُعد ما زالت Worker Staging السابق.

## حالة Cloudflare والبيانات

- Worker Staging الحالي `elbarzily-api-staging` يستجيب على `https://elbarzily-api-staging.a62165368.workers.dev`، وHyperdrive Staging متصل بقاعدة Neon.
- نجح الاختبار البعيد للنسخة المنشورة في الصحة العامة، و`SELECT 1` عبر Hyperdrive، وCORS، وtRPC، وقراءة `pitches.list`، ورفض الإجراءات المحمية دون جلسة.
- لم تتغير Pages أو قاعدة Neon أو Manus Production. واجهة Pages لا تزال غير موصولة بعنوان Worker.
- أضاف Cloudflare سر `APP_SESSION_SECRET` سابقًا. إعداد Worker الحالي لا يحتوي `BREVO_API_KEY`.
- أفاد المستخدم بوجود قاعدة Production قائمة، وسيُرسل Hyperdrive ID واسم المشروع/الفرع لاحقًا. لم أتحقق بعد من هذه الوجهة ولم أنشر Production؛ يجب إبقاء Staging وProduction منفصلتين.

## تغييرات البريد المحلية

استبدلت خدمة البريد في Worker بمسار Brevo transactional عبر HTTPS: `POST https://api.brevo.com/v3/smtp/email` مع مفتاح API من `BREVO_API_KEY`. يبقى Nodemailer/SMTP لمسار Node. أُضيفت متغيرات غير سرية لـ Worker Staging: `MAIL_TRANSPORT=brevo-api`، `BREVO_FROM`، `BREVO_SENDER_NAME`، `ADMIN_EMAIL` و`APP_PUBLIC_URL`.

لم تُنشر تغييرات البريد إلى Cloudflare بعد ولم يُرسل أي بريد فعلي. اختبار الوحدة يستخدم مفتاحًا وهميًا و`fetch` مزيفًا فقط. بيانات SMTP التي أُرسلت في المحادثة لم تُنسخ إلى أي ملف أو Cloudflare ولم تُستخدم؛ يجب اعتبارها مكشوفة وإلغاؤها أو تدويرها. المطلوب تكامل Workers هو Brevo API key جديد منفصل، محفوظ فقط في Cloudflare Worker Secret باسم `BREVO_API_KEY`، مع التأكد من أن المرسل مسجل وموثّق لدى Brevo.

## نتائج الاختبارات المحلية

نجح `pnpm check`، و`pnpm test` (16 ملفًا و73 اختبارًا)، و`pnpm build:worker` dry-run بحجم 2.30MB تقريبًا، و`pnpm test:worker` المحلي، و`pnpm build`، و`pnpm build:static`، و`node --check scripts/worker-remote-smoke.mjs`. اختبارات Brevo الثلاثة تتحقق من عنوان API وترويسة المفتاح والحمولة، وتفشل بأمان عند غياب المفتاح، ولا تكشف محتوى خطأ المزود.

## ما بقي

1. إلغاء/تدوير SMTP credential الذي ظهر في المحادثة، ثم إنشاء Brevo API key جديد وعدم إرساله داخل المحادثة.
2. استلام Hyperdrive ID الخاص بقاعدة Production والتحقق من المشروع والفرع، دون إظهار connection string.
3. بعد تجهيز مسار Staging الآمن، إدخال المفتاح الجديد في Cloudflare Worker Secrets ثم نشر bundle المحدّث واختبار تسليم OTP لبريد الاختبار المحدد، والتحقق من جلسة Auth.
4. إكمال اختبار حجز باستخدام بيانات وموعد اختبار محددين قبل توجيه واجهة التطبيق أو نشر Worker Production.

OAuth الخاص بـ Manus معطّل في Worker. رفع الملفات يحتاج R2، والتذكيرات تحتاج Cron، وبعض ميزات القسائم تعتمد `MANUS_JWT_SECRET`. هذه الوظائف لم تُختبر أو تُرحّل.

نجاح اختبارات Staging لا يضمن توافرًا دائمًا على خطة Workers/Hyperdrive المجانية، التي تخضع لحصص استخدام.


## تحديث Cloudflare بعد محاولة إدخال Brevo key

في 2026-11-05، أظهر فحص Cloudflare metadata أن binding باسم `BREVO_API_KEY` أُضيف كـ `plain_text` بدل `secret_text`. لم أقرأ قيمته؛ وافق المستخدم على حذف هذا binding وحذفه بنفسه من لوحة Cloudflare. بعد الحذف، أكد Cloudflare API أن قائمة secrets تحتوي `APP_SESSION_SECRET` فقط، وأن bindings المتبقية هي `ALLOWED_ORIGINS` و`APP_ID` و`APP_SESSION_SECRET` و`HYPERDRIVE`؛ لا يوجد `BREVO_API_KEY` الآن. أحدث نشر من لوحة Cloudflare بتاريخ `2026-11-05T17:03:50Z`، لكنه لم ينشر تعديل كود Brevo المحلي.

اعتبر القيمة التي أُدخلت إلى متغير `plain_text` مكشوفة ودوّر/ألغِها في Brevo. لا تُدخل كلمة مرور SMTP. عند إعادة المحاولة، استخدم Brevo API key جديدًا وتحقق بصريًا من نوع `Secret` قبل الحفظ؛ ثم تحقّق عبر Cloudflare أن النوع `secret_text` دون قراءة قيمة المفتاح. لم يتم إرسال بريد OTP.
