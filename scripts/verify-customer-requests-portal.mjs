import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:3000/";
const viewport = process.env.VERIFICATION_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1050 };
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport, locale: "ar-EG" });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.getByRole("button", { name: "طلبات العملاء وفريق التواصل" }).click();
  await page.getByRole("heading", { name: "تسجيل طلب عميل" }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "تسجيل الدخول الآمن" }).waitFor({ timeout: 15_000 });
  await page.getByText("سجّل الدخول للوصول إلى شاشة التسجيل الآمنة فقط.").waitFor({ timeout: 15_000 });
  if (process.env.CAPTURE_CUSTOMER_REQUESTS_SCREEN === "1") await page.screenshot({ path: "/home/ubuntu/pharmacy-manager-customer-requests.png", fullPage: true });
  console.log("VERIFY_CUSTOMER_REQUESTS_PORTAL_OK");
} finally {
  await browser.close();
}
