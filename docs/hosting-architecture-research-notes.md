# ملاحظات بحث الاستضافة والبنية — 25 أغسطس 2026

## مصادر رسمية

| المصدر | النتيجة ذات الصلة | الرابط |
|---|---|---|
| Firebase Hosting | مناسب للواجهة الثابتة وPWA، لكن الخلفية الديناميكية تحتاج Cloud Functions أو Cloud Run. | https://firebase.google.com/docs/hosting |
| Cloud Run pricing | يدعم خدمة حاوية Node/Express مستقلة مع حصة مجانية استخدامية، لكن الاستخدام فوقها يصبح مدفوعًا ويتطلب حساب فوترة وإدارة إعدادات Google Cloud. | https://cloud.google.com/run/pricing |
| Vercel Hobby | الخطة المجانية للاستخدام الشخصي غير التجاري فقط؛ لا تناسب منتج صيدلية تشغيلي متعدد الموظفين. | https://vercel.com/docs/plans/hobby |
| Render Free | الوثائق تنص صراحة على عدم استخدامه للإنتاج؛ الخدمة تتوقف بعد 15 دقيقة خمول، وقد تتوقف أو تعاد تشغيلها، وقاعدة PostgreSQL المجانية تنتهي بعد 30 يومًا. | https://render.com/docs/free |

## دلالة على التطبيق الحالي

يستخدم التطبيق React/Vite في الواجهة، وExpress+tRPC في الخادم، وDrizzle/MySQL/TiDB لبيانات مساحات العمل وطلبات العملاء، مع OAuth وصلاحيات مبنية على الخادم. لذلك Firebase Hosting بمفرده لا يمكنه استضافة المسار الحالي. نقله إلى Firebase يحتاج فصل الواجهة إلى Hosting ونقل Express إلى Cloud Run أو Functions، وإعادة بناء OAuth والأسرار وإعدادات قاعدة البيانات واختبارات النشر.

## استنتاج أولي

أفضل مسار «احترافي بتكلفة أولية منخفضة» عند الحاجة للخروج من الاستضافة المدمجة هو: Cloudflare أو Firebase Hosting للواجهة الثابتة + Cloud Run لخادم Express الحاوي + قاعدة بيانات MySQL/TiDB مدارة مع نسخ احتياطية وتنبيهات. لا يعني هذا أن البنية الحالية ضعيفة؛ هي مناسبة للمرحلة التشغيلية الحالية، لكن الحل المقترح يفصل طبقات النشر ويمنح مرونة أكبر في الهوية والمراقبة والمورد السحابي.

## ملاحظات إضافية عن البدائل

| الخيار | الميزة | القرار للتطبيق الحالي |
|---|---|---|
| Supabase | PostgreSQL كامل المدار ونسخ احتياطية ضمن منصة واحدة. | جيد إن قُرر انتقال مقصود من MySQL/TiDB إلى PostgreSQL؛ ليس ترقية فورية لأن النقل يستلزم تحويل المخطط وطبقة Drizzle والاختبارات. |
| Neon | PostgreSQL خادمي مع بيئات/فروع قواعد بيانات. | مناسب لبيئات الاختبار عند تبني PostgreSQL، لا سبب للهجرة إليه الآن فقط من أجل الاستضافة. |
| Cloudflare Workers | توجد خطة مجانية، لكن بيئة Node متوافقة مع جزء من واجهات Node فقط ولديها حدود منصة. | لا يوصى به لنقل Express الحالي كما هو؛ يحتاج إعادة تصميم الـ runtime وطبقة البيانات. |

المصادر: https://supabase.com/docs/guides/platform/backups، https://supabase.com/docs/guides/database/overview، https://developers.cloudflare.com/workers/platform/limits/، https://developers.cloudflare.com/workers/runtime-apis/nodejs/
