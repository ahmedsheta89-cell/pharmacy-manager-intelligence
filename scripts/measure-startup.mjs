import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000/";
const runCount = Math.max(1, Number(process.env.PERF_RUNS ?? 3));
const viewport = process.env.PERF_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1050 };
const outputPath = process.env.PERF_OUTPUT ?? "/home/ubuntu/pharmacy-manager-intelligence/docs/startup-performance.json";

const median = (values) => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
const samples = [];

try {
  for (let index = 0; index < runCount; index += 1) {
    const context = await browser.newContext({ viewport, locale: "ar-EG" });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(
      () => (document.querySelector("#root")?.textContent?.trim().length ?? 0) > 40,
      undefined,
      { timeout: 10_000 },
    );

    const metric = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const paints = performance.getEntriesByType("paint");
      const firstContentfulPaint = paints.find((entry) => entry.name === "first-contentful-paint");
      const resources = performance.getEntriesByType("resource");
      const scripts = resources.filter((entry) => entry.initiatorType === "script");
      return {
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd - navigation.startTime),
        loadMs: Math.round(navigation.loadEventEnd - navigation.startTime),
        firstContentfulPaintMs: firstContentfulPaint ? Math.round(firstContentfulPaint.startTime) : null,
        initialScriptTransferBytes: scripts.reduce((total, entry) => total + entry.transferSize, 0),
        initialScriptEncodedBytes: scripts.reduce((total, entry) => total + entry.encodedBodySize, 0),
        initialScriptRequests: scripts.length,
        totalResourceTransferBytes: resources.reduce((total, entry) => total + entry.transferSize, 0),
      };
    });
    samples.push(metric);
    await context.close();
  }
} finally {
  await browser.close();
}

const summary = {
  measuredAt: new Date().toISOString(),
  baseUrl,
  runs: runCount,
  viewport,
  cache: "disabled",
  samples,
  median: {
    domContentLoadedMs: median(samples.map((sample) => sample.domContentLoadedMs)),
    loadMs: median(samples.map((sample) => sample.loadMs)),
    firstContentfulPaintMs: median(samples.map((sample) => sample.firstContentfulPaintMs ?? 0)) || null,
    initialScriptTransferBytes: median(samples.map((sample) => sample.initialScriptTransferBytes)),
    initialScriptEncodedBytes: median(samples.map((sample) => sample.initialScriptEncodedBytes)),
    initialScriptRequests: median(samples.map((sample) => sample.initialScriptRequests)),
    totalResourceTransferBytes: median(samples.map((sample) => sample.totalResourceTransferBytes)),
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
