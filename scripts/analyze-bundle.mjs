import fs from "node:fs";
import path from "node:path";

const reportPath = process.argv[2] ?? "/home/ubuntu/bundle-stats.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const entry = report.tree.children.find((node) => /^assets\/index-[^/]+\.js$/.test(node.name));

if (!entry) throw new Error("تعذر العثور على حزمة البداية داخل تقرير التحليل.");

const modulePaths = new Map();
function collect(node, parents = []) {
  const nextParents = node.name ? [...parents, node.name] : parents;
  if (node.uid) modulePaths.set(node.uid, nextParents.join("/"));
  for (const child of node.children ?? []) collect(child, nextParents);
}
collect(entry);

const modules = Object.entries(report.nodeParts)
  .filter(([uid]) => modulePaths.has(uid))
  .map(([uid, part]) => ({
    module: modulePaths.get(uid),
    rendered: part.renderedLength ?? 0,
    gzip: part.gzipLength ?? 0,
    brotli: part.brotliLength ?? 0,
  }))
  .sort((first, second) => second.rendered - first.rendered);

console.table(modules.slice(0, 30).map((item) => ({
  module: item.module,
  renderedKB: (item.rendered / 1024).toFixed(1),
  gzipKB: (item.gzip / 1024).toFixed(1),
  brotliKB: (item.brotli / 1024).toFixed(1),
})));
