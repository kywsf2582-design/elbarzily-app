# تشغيل مشروع El Barzily على Windows

هذه الحزمة تحتوي على مصدر المشروع وملفات Drizzle والترحيلات، لكنها لا تحتوي على `node_modules` أو `.git` أو الأسرار أو نسخة قاعدة البيانات أو ملفات توقيع Windows/Android.

## المتطلبات

- Node.js 22 أو أحدث
- pnpm
- Git اختياري

## الأوامر

افتح CMD داخل المجلد بعد فك الضغط:

```cmd
cd elbarzily-cloudflare-staging
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
copy .env.example .env
```

افتح `.env` محليًا وضع القيم الخاصة بك فقط. لا ترفع `.env` إلى GitHub.

## إعداد Neon بأمان

نفّذ من داخل مجلد المشروع:

```cmd
npx neon@latest init
```

أنشئ قاعدة Staging منفصلة أولًا. لا تستخدم رابط قاعدة الإنتاج الحالية، ولا تشغّل ترحيلات MySQL على Neon قبل تحويل المخطط إلى PostgreSQL.

## ملاحظات مهمة

- هذه الحزمة لا تحتوي على بيانات المستخدمين أو الحجوزات أو SQL dump.
- لا تضع `DATABASE_URL` أو مفاتيح Web Push أو مفاتيح البريد داخل الكود.
- لا تحذف قاعدة Manus/MySQL الحالية.
- استخدم هذا المجلد للتجربة فقط، ثم ادفع التغييرات إلى فرع `cloudflare-migration` وليس `main`.
