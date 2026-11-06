/* H8.7 — Compile editable Spanish Markdown into a deterministic offline TypeScript module. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const guideDir = path.join(root, "docs/user-guide/es");
const out = path.join(root, "packages/core/src/renderer/components/documentation/user-guide.generated.ts");
const manifest = JSON.parse(fs.readFileSync(path.join(guideDir, "manifest.json"), "utf8"));

if (manifest.schemaVersion !== 1 || manifest.language !== "es-AR" || !Array.isArray(manifest.articles)) {
  throw new Error("Invalid user-guide manifest metadata");
}

const ids = new Set();
const allowedStatuses = new Set(["Disponible", "Demo sintético", "Disponibilidad limitada"]);
const articles = manifest.articles.map((meta) => {
  if (!/^[a-z0-9-]+$/.test(meta.id) || ids.has(meta.id)) {
    throw new Error("Invalid or duplicate article ID: " + meta.id);
  }
  ids.add(meta.id);

  if (!["title", "summary", "section"].every((key) => typeof meta[key] === "string" && meta[key].trim())) {
    throw new Error("Missing metadata for " + meta.id);
  }
  if (!allowedStatuses.has(meta.status) || !Array.isArray(meta.related)) {
    throw new Error("Invalid status/related for " + meta.id);
  }

  const file = path.join(guideDir, meta.id + ".md");
  const markdown = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

  if (!markdown.startsWith("# ") || markdown.length > 40000 || /<\s*\/?\s*(script|iframe|object|style|html)\b/i.test(markdown)) {
    throw new Error("Invalid Markdown content for " + meta.id);
  }
  return { ...meta, markdown };
});

for (const article of articles) {
  for (const id of article.related) {
    if (!ids.has(id)) throw new Error("Unknown related article " + id + " in " + article.id);
  }
}

const output = [
  "/* AUTO-GENERATED from docs/user-guide/es by packages/core/scripts/generate-user-guide.cjs. */",
  "/* To edit this content, change the Markdown source and run node packages/core/scripts/generate-user-guide.cjs. */",
  "export const packagedUserGuide = " + JSON.stringify(articles, null, 2) + " as const;",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== output) {
    console.error("Offline user-guide bundle is stale. Run generator before committing.");
    process.exit(1);
  }
  console.log("User-guide generated bundle is current (" + articles.length + " articles).");
} else {
  fs.writeFileSync(out, output);
  console.log("Bundled " + articles.length + " offline articles into " + path.relative(root, out));
}
