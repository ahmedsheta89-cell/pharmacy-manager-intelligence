# ملاحظة مرجع خارجي: جسر تطبيق Manus الكامل

استُخدم المستودع العام [Wuza0295/nachtblau-crew](https://github.com/Wuza0295/nachtblau-crew) للقراءة فقط باعتباره مثالًا على قالب كامل. يؤكد وجود هيكل `server/_core` و`server/db.ts` و`server/routers.ts` وعميل `client/src/lib/trpc.ts`، وأن نقطة الدخول الكاملة تركب Express وtRPC وVite والجلسات.

أظهر المثال أن عميل المصادقة يستدعي مسارات النظام `ExchangeToken` و`GetUserInfo` على `OAUTH_SERVER_URL` ثم ينشئ جلسة JWT موقعة. لكن مسار callback في المثال لا يطبق حارس nonce الموصى به في مهارة OAuth الحالية، لذلك لا يجوز نسخه كما هو. سيُعاد إدخال الجسر مع حفظ nonce في cookie مضيف فقط ومطابقته قبل تبديل رمز الدخول.
