import assert from "node:assert/strict";

const origin = process.env.DEV_SERVER_URL ?? "http://127.0.0.1:3000";
const healthResponse = await fetch(new URL("/healthz", origin));
assert.equal(healthResponse.status, 200, "مسار الصحة لم يستجب بحالة 200");
const health = await healthResponse.json();
assert.equal(health.status, "ok", "صحة خدمة التطوير ليست ok");

const appResponse = await fetch(new URL("/", origin));
assert.equal(appResponse.status, 200, "الصفحة الرئيسية لم تستجب بحالة 200");
const contentType = appResponse.headers.get("content-type") ?? "";
assert.match(contentType, /text\/html/i, "الصفحة الرئيسية لم تعد HTML");

console.log("DEV_SERVER_SMOKE_OK", JSON.stringify({ service: health.service, pid: health.pid, uptimeSeconds: health.uptimeSeconds, origin }));
