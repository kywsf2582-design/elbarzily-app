# Cloudflare Workers API — Staging

## الحالة الحالية

Worker Staging الحالي يستجيب على `https://elbarzily-api-staging.a62165368.workers.dev`، مع Hyperdrive الخاص بقاعدة Staging. اختبارات smoke السابقة على النسخة المنشورة نجحت للصحة العامة واتصال Neon وCORS وtRPC وقراءة `pitches.list` ورفض الاستعلامات المحمية دون جلسة.

حدّثت نسخة المصدر محليًا لإرسال البريد من Worker عبر Brevo HTTPS، وأضفت متغيرات إعداد عامة إلى `wrangler.jsonc`. **هذه التغييرات لم تُنشر إلى Worker البعيد بعد.** إعدادات Cloudflare التي تحققنا منها ما زالت تحتوي `APP_SESSION_SECRET` فقط ولا تحتوي `BREVO_API_KEY`. لا ترسل OTP فعليًا قبل نشر النسخة المحدّثة وإضافة سر Brevo الجديد.

Pages الحالي `elbarzily-neon-staging.pages.dev` لم يتغير، وما زالت واجهته غير موجهة إلى Worker. أكد المستخدم أنه يريد متابعة مسار Production وأفاد بوجود قاعدة Production، لكنه لم يرسل بعد معرّف Hyperdrive واسم المشروع/الفرع للتحقق. لن يُنشأ أو يُنشر Production Worker ولن يُستخدم Hyperdrive Staging للإنتاج قبل التحقق من معرّف قاعدة Production.

## إعداد البريد في النسخة المحدّثة

يستخدم Worker `MAIL_TRANSPORT=brevo-api` و`POST https://api.brevo.com/v3/smtp/email` مع سر `BREVO_API_KEY`. إعدادات المرسل `BREVO_FROM` و`BREVO_SENDER_NAME` و`ADMIN_EMAIL` ورابط `APP_PUBLIC_URL` متغيرات غير سرية. أما مسار Node فيُبقي SMTP/Nodemailer الحالي.

المفتاح الذي أُرسل في المحادثة هو SMTP credential وليس Brevo API key، ويجب اعتباره مكشوفًا وإلغاؤه/تدويره. لم يُحفظ في الملفات أو Cloudflare ولم يُستخدم. أنشئ مفتاح Brevo API جديدًا، ثم ضعه في Cloudflare Worker Secrets باسم `BREVO_API_KEY` فقط؛ لا تضعه في الشيفرة أو الواجهة أو Git أو المحادثة. عنوان المرسل يجب أن يكون موثّقًا في Brevo قبل الإرسال. تفاصيل التوثيق في [دليل Brevo للبريد transactional](./brevo-workers-email.md).

## التحقق المحلي

نجح بعد تعديل البريد: `pnpm check`، و`pnpm test` (73 اختبارًا)، و`pnpm build`، و`pnpm build:static`، و`pnpm build:worker` dry-run، و`pnpm test:worker` المحلي، و`node --check scripts/worker-remote-smoke.mjs`. اختبارات Brevo تستخدم مفتاحًا وهميًا و`fetch` مزيفًا ولا تتصل بمزود البريد. لم يُختبر الإرسال الحقيقي بعد.

لإعادة الفحوص:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm build:static
pnpm build:worker
pnpm test:worker
```

بعد تأكيد Hyperdrive الإنتاجي، يجب نشر نسخة Worker Production منفصلة وعدم استبدال Staging. أمّا في Staging، بعد إضافة مفتاح Brevo الجديد ونشر bundle المحدّث إلى Worker Staging الحالي، يمكن إرسال OTP واحد إلى صندوق الاختبار الذي حدده المستخدم، ثم اختبار التحقق والتسجيل باستخدام بيانات اختبار. لا تختبر إنشاء حجز حقيقي دون تحديد سجل/موعد اختبار مناسب.

## حدود باقي الميزات

OAuth الخاص بـ Manus معطّل في Worker. رفع الملفات يحتاج R2، والتذكيرات تحتاج Cron، وبعض ميزات القسائم تستخدم `MANUS_JWT_SECRET`. هذه الأجزاء ليست مختبرة على Worker. لا توجّه Pages إلى Worker ولا ترفع إلى Production حتى تنجح اختبارات Auth وOTP والحجز على Staging ويُتحقق من قاعدة Production المستقلة.

Workers Free وHyperdrive Free يخضعان لحصص واستخدام، ولا يقدمان ضمان توفر دائم. نجاح smoke الآن لا يعني استخدامًا غير محدود.
