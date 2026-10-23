/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps Revival visual assets — fork branding by Gustavo Marcon.
// Source of truth: packages/core/src/renderer/components/icon/openlens-devops-logo.svg
// Reproducible locally on macOS with Node 20, Sharp and iconutil.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const sharp = require("../../../packages/generate-tray-icons/node_modules/sharp");

const root = path.resolve(__dirname, "../../..");
const input = path.join(root, "packages/core/src/renderer/components/icon/openlens-devops-logo.svg");
const assetDir = path.join(root, "docs/revival/branding");
const appDir = path.join(root, "open-lens/build");
const coreIconDir = path.join(root, "packages/core/build/icons");
const splashDir = path.join(root, "open-lens/static/branding");
fs.mkdirSync(assetDir, { recursive: true });
fs.mkdirSync(coreIconDir, { recursive: true });
fs.mkdirSync(splashDir, { recursive: true });
fs.mkdirSync(path.join(appDir, "icons"), { recursive: true });

const master = fs.readFileSync(input, "utf8");
const polygons = master.match(/<polygon[^>]*\/>/g);
if (!polygons || polygons.length !== 10) {
  throw new Error("Unexpected source logo geometry — abort rather than producing inconsistent brand assets");
}
const shape = polygons.join("\n");
const outer = polygons.slice(0, 6).join("\n");
const core = polygons.slice(6).join("\n");
const icon = (inner, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<title>OpenLens DevOps</title>
${extra}
${inner}
</svg>`;
const appIcon = icon(
  `<rect x="18" y="18" width="476" height="476" rx="112" fill="#111923" stroke="#314358" stroke-width="2"/><g transform="translate(48 48) scale(0.8125)">${shape}</g>`,
);
const monoSymbol = icon(
  `<g fill="#EAF1FC"><path d="M256 28 440 128 440 376 256 478 72 376 72 128Z M256 143 163 195 163 310 256 363 349 310 349 195Z" fill-rule="evenodd"/><path d="M256 211 298 237 256 264 214 237ZM214 245 256 272 256 320 214 296ZM298 245 256 272 256 320 298 296Z"/></g>`,
);
const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<title>OpenLens DevOps menu bar icon</title>
<path fill="#000000" fill-rule="evenodd" d="M32 3 57 17 57 47 32 61 7 47 7 17Z M32 17 19 24 19 40 32 47 45 40 45 24Z"/>
<path fill="#000000" d="M32 23 41 28 32 33 23 28ZM23 30 31 35 31 43 23 38ZM41 30 33 35 33 43 41 38Z"/>
</svg>`;
const wordmark = (light) => `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="260" viewBox="0 0 1100 260" role="img" aria-label="OpenLens DevOps">
<title>OpenLens DevOps ${light ? "light" : "dark"} wordmark</title>
<g transform="translate(19 12) scale(0.45)">${shape}</g>
<text x="265" y="129" fill="${light ? "#142232" : "#EAF1FC"}" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" font-size="80" font-weight="650" letter-spacing="-2">OpenLens</text>
<text x="705" y="129" fill="${light ? "#356EB5" : "#7196D2"}" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" font-size="80" font-weight="600" letter-spacing="-2">DevOps</text>
<text x="269" y="185" fill="${light ? "#53677D" : "#A2AEC0"}" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" font-size="27" letter-spacing="6">KUBERNETES WORKSPACE</text>
</svg>`;

const out = (name, value) => {
  const dest = path.join(assetDir, name);
  fs.writeFileSync(dest, value, "utf8");
  return dest;
};
out("openlens-devops-app-icon.svg", appIcon);
out("openlens-devops-wordmark-dark.svg", wordmark(false));
out("openlens-devops-wordmark-light.svg", wordmark(true));
out("openlens-devops-symbol-monochrome.svg", monoSymbol);
out("openlens-devops-tray.svg", tray);
fs.copyFileSync(input, path.join(assetDir, "openlens-devops-symbol.svg"));
fs.copyFileSync(input, path.join(splashDir, "openlens-devops-symbol.svg"));
// Packaging uses this as the menu bar source; SVG stays monochrome and readable at 16px.
fs.copyFileSync(path.join(assetDir, "openlens-devops-tray.svg"),
  path.join(root, "packages/core/src/renderer/components/icon/openlens-devops-tray.svg"));

async function main() {
  const source = Buffer.from(appIcon);
  const resolutions = [16, 24, 32, 64, 128, 256, 512, 1024];
  const previews = path.join(assetDir, "previews");
  fs.mkdirSync(previews, { recursive: true });
  for (const size of resolutions) {
    await sharp(source).resize(size, size).png().toFile(path.join(previews, `app-icon-${size}.png`));
  }
  // Standard macOS Electron Builder inputs and core fallback assets.
  for (const dest of [
    path.join(appDir, "icon.png"),
    path.join(appDir, "icons/512x512.png"),
    path.join(coreIconDir, "512x512.png"),
  ]) {
    await sharp(source).resize(512, 512).png().toFile(dest + ".new");
    fs.renameSync(dest + ".new", dest);
  }
  for (const dest of [
    path.join(appDir, "icons/512x512@2x.png"),
    path.join(coreIconDir, "512x512@2x.png"),
  ]) {
    await sharp(source).resize(1024, 1024).png().toFile(dest + ".new");
    fs.renameSync(dest + ".new", dest);
  }
  // Finder/Dock .icns: generate a real iconset, not merely rename PNG to .icns.
  const iconset = path.join(assetDir, "_temp-openlens-devops.iconset");
  fs.mkdirSync(iconset, { recursive: true });
  const pairs = [
    [16, "icon_16x16.png"], [32, "icon_16x16@2x.png"], [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"], [128, "icon_128x128.png"], [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"], [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"], [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, filename] of pairs) {
    await sharp(source).resize(size, size).png().toFile(path.join(iconset, filename));
  }
  const icnsTmp = path.join(assetDir, "openlens-devops.icns");
  execFileSync("/usr/bin/iconutil", ["-c", "icns", "-o", icnsTmp, iconset]);
  fs.copyFileSync(icnsTmp, path.join(appDir, "icon.icns"));
  fs.rmSync(iconset, { recursive: true });
  // Keep the Windows icon consistent, with all standard size layers.
  const python = `from PIL import Image
from pathlib import Path
src=Image.open(r"${path.join(appDir, "icons/512x512@2x.png")}").convert("RGBA")
src.save(r"${path.join(appDir, "icon.ico")}", format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
`;
  execFileSync("python3", ["-c", python]);
  console.log("BRANDING ASSETS GENERATED", { files: resolutions.length + pairs.length + 11, appIcon: appDir });
}
main().catch(err => { console.error(err); process.exitCode=1; });
