const esbuild = require("/Users/gustavomarcon/Documents/lens/lens/node_modules/esbuild");
const path = require("path");
const fs = require("fs");
const sass = require("/Users/gustavomarcon/Documents/lens/lens/node_modules/sass");

const projectRoot = path.resolve(__dirname, "../../../..");

const polyfillPlugin = {
  name: "node-polyfills",
  setup(build) {
    build.onResolve({ filter: /^(node:)?(assert|util|path|crypto|buffer|stream(\/web)?|events|fs|zlib|os|child_process|http|https|url|querystring|timers|tar|electron|net|process|worker_threads)$/ }, (args) => {
      const cleanName = args.path.replace(/^node:/, "").replace(/\//g, "_");
      return {
        path: path.join(__dirname, "shims", `${cleanName}.js`),
      };
    });
    build.onResolve({ filter: /\.svg$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path),
      namespace: "svg-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "svg-stub" }, () => ({
      contents: "export default '';",
      loader: "js",
    }));
    build.onResolve({ filter: /\.scss$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path),
      namespace: "scss-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "scss-stub" }, () => ({
      contents: "",
      loader: "js",
    }));
  },
};

(async () => {
  const shimsDir = path.join(__dirname, "shims");
  if (!fs.existsSync(shimsDir)) {
    fs.mkdirSync(shimsDir, { recursive: true });
  }

  const stubModules = [
    "assert", "util", "path", "crypto", "buffer", "stream", "stream_web",
    "events", "fs", "zlib", "os", "child_process", "http", "https",
    "url", "querystring", "timers", "tar", "electron", "net", "process", "worker_threads"
  ];
  for (const mod of stubModules) {
    let content = "module.exports = {};";
    if (mod === "assert") {
      content = "function assert(c, m) { if (!c) console.warn(m); }; assert.ok = assert; module.exports = assert;";
    } else if (mod === "util") {
      content = "const inherits = (c, s) => { if (s) { c.super_ = s; Object.setPrototypeOf(c.prototype, s.prototype); } }; const inspect = String; const promisify = (fn) => (...a) => Promise.resolve(); const deprecate = (fn) => fn; module.exports = { inherits, inspect, promisify, deprecate, types: {} };";
    } else if (mod === "path") {
      content = "const pObj = { join: (...p) => p.join('/'), resolve: (...p) => p.join('/'), basename: (p) => p.split('/').pop(), dirname: (p) => p.split('/').slice(0, -1).join('/') || '.', isAbsolute: (p) => p.startsWith('/') || /^[a-zA-Z]:/.test(p), normalize: (p) => p, sep: '/' }; pObj.win32 = pObj; pObj.posix = pObj; module.exports = pObj;";
    } else if (mod === "crypto") {
      content = "const randomUUID = () => 'test-uuid'; module.exports = { randomUUID };";
    } else if (mod === "buffer") {
      content = "function Buffer() {}; Buffer.isBuffer = () => false; Buffer.from = () => []; Buffer.alloc = () => new Uint8Array(); Buffer.allocUnsafe = Buffer.alloc; Buffer.byteLength = () => 0; Buffer.prototype = {}; module.exports = { Buffer };";
    } else if (mod === "fs") {
      content = "module.exports = { promises: { stat: () => Promise.resolve({ isDirectory: () => false, isFile: () => false }), readFile: () => Promise.resolve(''), writeFile: () => Promise.resolve() }, statSync: () => ({ isDirectory: () => false, isFile: () => false }), readFileSync: () => '', existsSync: () => false };";
    } else if (mod === "events" || mod === "stream") {
      content = "function EventEmitter() {}; EventEmitter.prototype.on = function() { return this; }; EventEmitter.prototype.once = function() { return this; }; EventEmitter.prototype.emit = function() { return true; }; EventEmitter.prototype.removeListener = function() { return this; }; EventEmitter.prototype.pipe = function() { return this; }; EventEmitter.EventEmitter = EventEmitter; EventEmitter.Stream = EventEmitter; EventEmitter.Readable = EventEmitter; EventEmitter.Writable = EventEmitter; module.exports = EventEmitter;";
    } else if (mod === "stream_web") {
      content = "module.exports = { ReadableStream: globalThis.ReadableStream, WritableStream: globalThis.WritableStream, TransformStream: globalThis.TransformStream };";
    } else if (mod === "http" || mod === "https") {
      content = "class Agent {}; module.exports = { Agent, request: () => ({ on: () => {}, end: () => {} }) };";
    } else if (mod === "querystring") {
      content = "const stringify = (obj) => new URLSearchParams(obj).toString(); const parse = (str) => Object.fromEntries(new URLSearchParams(str)); module.exports = { stringify, parse };";
    } else if (mod === "timers") {
      content = "module.exports = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };";
    } else if (mod === "electron") {
      content = "module.exports = { ipcRenderer: { on: () => {}, removeListener: () => {}, send: () => {}, invoke: () => Promise.resolve() }, shell: { openExternal: () => {} }, clipboard: { writeText: () => {} } };";
    } else if (mod === "net") {
      content = "module.exports = { isIP: () => 0, isIPv4: () => false, isIPv6: () => false, Socket: class {}, createConnection: () => ({ on: () => {}, once: () => {}, end: () => {} }) };";
    } else if (mod === "process") {
      content = "module.exports = globalThis.process || { env: {}, platform: 'darwin', nextTick: (fn) => setTimeout(fn, 0) };";
    } else if (mod === "worker_threads") {
      content = "module.exports = { isMainThread: true, Worker: class {} };";
    }
    fs.writeFileSync(path.join(shimsDir, `${mod}.js`), content);
  }

  const outdir = path.join(__dirname, "dist");
  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  // Compile real SCSS to CSS
  console.log("Compiling SCSS stylesheets with sass...");
  const scssFiles = [
    path.resolve(projectRoot, "packages/core/src/renderer/components/workloads-pods/debug-container/attach-debug-container-dialog.scss"),
    path.resolve(projectRoot, "packages/core/src/renderer/components/dock/logs/list.scss"),
    path.resolve(projectRoot, "packages/core/src/renderer/components/config-resource-quotas/headroom/resource-quota-headroom.scss"),
  ];

  let combinedCss = `
    :root {
      --textColorPrimary: #c9d1d9;
      --textColorSecondary: #8b949e;
      --layoutTabsBackground: #161b22;
      --borderFocusColor: #30363d;
      --mainBackground: #0d1117;
      --font-monospace: SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace;
      --logsForeground: #c9d1d9;
      --logsBackground: #0d1117;
      --dockInfoBackground: #161b22;
      --logRowHoverBackground: rgba(255, 255, 255, 0.05);
    }
    body {
      margin: 0;
      padding: 20px;
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
  `;

  for (const file of scssFiles) {
    if (fs.existsSync(file)) {
      try {
        combinedCss += "\n" + sass.compile(file).css;
      } catch (err) {
        console.warn("Could not compile SCSS file:", file, err.message);
      }
    }
  }

  fs.writeFileSync(path.join(outdir, "styles.css"), combinedCss);

  // Write index.html
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OpenLens R7-08 Harness</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="root"></div>
  <script src="bundle.js"></script>
</body>
</html>`;
  fs.writeFileSync(path.join(outdir, "index.html"), htmlContent);

  try {
    console.log("Compiling harness bundle with esbuild...");
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, "harness.tsx")],
      bundle: true,
      outfile: path.join(outdir, "bundle.js"),
      platform: "browser",
      plugins: [polyfillPlugin],
      loader: {
        ".tsx": "tsx",
        ".ts": "ts",
        ".jsx": "jsx",
        ".js": "js",
      },
      define: {
        "process.env.NODE_ENV": '"development"',
        "process.platform": '"darwin"',
        "global": "window",
        "__dirname": '"/"',
        "__filename": '"/bundle.js"',
      },
      banner: {
        js: 'var process = globalThis.process || { env: { NODE_ENV: "development" }, platform: "darwin", nextTick: function(fn) { setTimeout(fn, 0); }, argv: [] }; globalThis.process = process; globalThis.global = globalThis;',
      },
      logLevel: "info",
    });

    console.log("Build completed successfully:", result);
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
})();
