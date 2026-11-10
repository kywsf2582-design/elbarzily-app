# ElBarzily Production schema baseline

`0000_production_baseline.sql` هو baseline أولي لقاعدة Neon Production الفارغة، مولّد من `drizzle/schema.pg.ts` بتاريخ 2026-11-09. يتضمن جداول التطبيق الحالية، ومنها جداول الإحالات، والفهارس والقيود المعرفة في المخطط.

هذا الملف يستبعد عمدًا `drizzle/pg-migrations/0001_purge_non_support_chat_staging.sql` لأنه خاص بتنظيف بيانات Staging. لا تطبّق `pnpm db:push` أو `drizzle-kit migrate` الذي يشير إلى مجلد Staging على قاعدة Production. يجب تحضير أي تغيير على فرع Neon مؤقت، وفحصه، ثم أخذ موافقة المستخدم قبل اكتماله على الفرع الرئيسي.

لا يحتوي الملف على بيانات مستخدمين أو مفاتيح أو كلمات مرور. لم يُطبّق هذا الـbaseline بعد على قاعدة Production الرئيسية.
