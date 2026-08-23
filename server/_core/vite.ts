import fs from "fs";
import type { Express } from "express";
import express from "express";
import type { Server } from "http";
import { randomUUID } from "node:crypto";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({ ...viteConfig, configFile: false, server: { middlewareMode: true, hmr: { server }, allowedHosts: true }, appType: "custom" });
  app.use(vite.middlewares);
  app.use("/{*splat}", async (req, res, next) => {
    try {
      const templatePath = path.resolve(import.meta.dirname, "../..", "client", "index.html");
      const template = (await fs.promises.readFile(templatePath, "utf-8")).replace('src="/src/main.tsx"', `src="/src/main.tsx?v=${randomUUID()}"`);
      res.status(200).set({ "Content-Type": "text/html" }).end(await vite.transformIndexHtml(req.originalUrl, template));
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "..", "dist", "public");
  app.use(express.static(distPath));
  app.use("/{*splat}", (_req, res) => res.sendFile(path.resolve(distPath, "index.html")));
}
