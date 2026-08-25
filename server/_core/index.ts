import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { serveStatic, setupVite } from "./vite";

let activeServer: ReturnType<typeof createServer> | undefined;
let isShuttingDown = false;

function reportProcessEvent(event: string, detail?: unknown) {
  const memory = process.memoryUsage();
  console.error("[Runtime]", JSON.stringify({
    event,
    at: new Date().toISOString(),
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    rssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    detail: detail instanceof Error ? { name: detail.name, message: detail.message, stack: detail.stack } : detail,
  }));
}

// يستخدم monitor حتى يسجل السياق من دون اعتراض سلوك Node الافتراضي عند العطل القاتل.
process.on("uncaughtExceptionMonitor", (error) => reportProcessEvent("uncaught_exception", error));
process.on("warning", (warning) => reportProcessEvent("node_warning", warning));
function shutdown(signal: "SIGTERM" | "SIGINT") {
  reportProcessEvent(`${signal.toLowerCase()}_received`);
  if (isShuttingDown) return;
  isShuttingDown = true;
  const exit = () => process.exit(0);
  if (!activeServer) return exit();
  const forceExit = setTimeout(exit, 4_000);
  forceExit.unref();
  activeServer.close(() => {
    clearTimeout(forceExit);
    exit();
  });
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

async function startServer() {
  const app = express();
  const server = createServer(app);
  activeServer = server;
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  app.get("/healthz", (_req, res) => res.status(200).json({ service: "pharmacy-manager-intelligence", status: "ok", pid: process.pid, uptimeSeconds: Math.floor(process.uptime()) }));
  registerOAuthRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);
  server.on("error", (error) => reportProcessEvent("http_server_error", error));
  server.listen(process.env.PORT ? Number(process.env.PORT) : 3000, "0.0.0.0", () => console.log("Pharmacy Manager Intelligence server started", JSON.stringify({ pid: process.pid, node: process.version, environment: process.env.NODE_ENV ?? "development" })));
}

void startServer().catch((error) => {
  reportProcessEvent("server_start_failed", error);
  process.exitCode = 1;
});
