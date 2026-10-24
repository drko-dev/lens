const esbuild = require("/Users/gustavomarcon/Documents/lens/lens/node_modules/esbuild");
const path = require("path");
const fs = require("fs");
const sass = require("/Users/gustavomarcon/Documents/lens/lens/node_modules/sass");

const projectRoot = path.resolve(__dirname, "../../../..");

const polyfillPlugin = {
  name: "node-polyfills",
  setup(build) {
    build.onResolve({ filter: /^(assert|util|path|crypto|buffer|stream|events|fs|zlib|os|child_process|http|https|url|querystring|timers|tar|electron)$/ }, (args) => ({
      path: path.join(__dirname, "shims", `${args.path}.js`),
    }));
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

  const stubModules = ["assert", "util", "path", "crypto", "buffer", "stream", "events", "fs", "zlib", "os", "child_process", "http", "https", "url", "querystring", "timers", "tar", "electron"];
  for (const mod of stubModules) {
    let content = "module.exports = {};";
    if (mod === "assert") {
      content = "function assert(c, m) { if (!c) console.warn(m); }; assert.ok = assert; module.exports = assert;";
    } else if (mod === "util") {
      content = "const inherits = (c, s) => { if (s) { c.super_ = s; Object.setPrototypeOf(c.prototype, s.prototype); } }; const inspect = String; const promisify = (fn) => (...a) => Promise.resolve(); module.exports = { inherits, inspect, promisify };";
    } else if (mod === "path") {
      content = "const pObj = { join: (...p) => p.join('/'), resolve: (...p) => p.join('/'), basename: (p) => p.split('/').pop(), dirname: (p) => p.split('/').slice(0, -1).join('/') || '.', isAbsolute: (p) => p.startsWith('/') || /^[a-zA-Z]:/.test(p), normalize: (p) => p, sep: '/' }; pObj.win32 = pObj; pObj.posix = pObj; module.exports = pObj;";
    } else if (mod === "crypto") {
      content = "const randomUUID = () => 'test-uuid'; module.exports = { randomUUID };";
    } else if (mod === "buffer") {
      content = "function Buffer() {}; Buffer.isBuffer = () => false; Buffer.from = () => []; Buffer.alloc = () => new Uint8Array(); Buffer.allocUnsafe = Buffer.alloc; Buffer.byteLength = () => 0; Buffer.prototype = {}; module.exports = { Buffer };";
    } else if (mod === "events" || mod === "stream") {
      content = "function EventEmitter() {}; EventEmitter.prototype.on = function() { return this; }; EventEmitter.prototype.once = function() { return this; }; EventEmitter.prototype.emit = function() { return true; }; EventEmitter.prototype.removeListener = function() { return this; }; EventEmitter.prototype.pipe = function() { return this; }; EventEmitter.EventEmitter = EventEmitter; EventEmitter.Stream = EventEmitter; EventEmitter.Readable = EventEmitter; EventEmitter.Writable = EventEmitter; module.exports = EventEmitter;";
    } else if (mod === "querystring") {
      content = "const stringify = (obj) => new URLSearchParams(obj).toString(); const parse = (str) => Object.fromEntries(new URLSearchParams(str)); module.exports = { stringify, parse };";
    } else if (mod === "timers") {
      content = "module.exports = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };";
    } else if (mod === "electron") {
      content = "module.exports = { ipcRenderer: { on: () => {}, removeListener: () => {}, send: () => {}, invoke: () => Promise.resolve() }, shell: { openExternal: () => {} }, clipboard: { writeText: () => {} } };";
    }
    fs.writeFileSync(path.join(shimsDir, `${mod}.js`), content);
  }

  const outdir = path.join(__dirname, "dist");
  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenLens DevOps Revival — R7-05 NetworkPolicy Matrix Harness</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    @font-face {
      font-family: 'Material Icons';
      font-style: normal;
      font-weight: 400;
      src: local('Material Icons'), local('MaterialIcons-Regular');
    }
    .material-icons {
      font-family: 'Material Icons', sans-serif;
      font-weight: normal;
      font-style: normal;
      font-size: 16px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      display: inline-block;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
      -webkit-font-feature-settings: 'liga';
      -webkit-font-smoothing: antialiased;
      vertical-align: middle;
    }
  </style>
  <script>
    window.process = {
      env: { NODE_ENV: 'development' },
      platform: 'darwin',
      argv: [],
      cwd: function() { return '/'; },
      stdout: null,
      stderr: null,
    };
    function Buffer() {}
    Buffer.isBuffer = function() { return false; };
    Buffer.from = function() { return []; };
    Buffer.alloc = function(size) { return new Uint8Array(size); };
    Buffer.allocUnsafe = Buffer.alloc;
    Buffer.byteLength = function(str) { return (str || '').length; };
    Buffer.prototype = {};
    window.Buffer = Buffer;
  </script>
</head>
<body>
  <div id="root"></div>
  <script src="bundle.js"></script>
</body>
</html>`;
  fs.writeFileSync(path.join(outdir, "index.html"), htmlTemplate);

  // Compile real SCSS to CSS
  console.log("Compiling SCSS stylesheets with sass...");
  const matrixScssPath = path.resolve(projectRoot, "packages/core/src/renderer/components/network-policies/matrix/network-policy-matrix.scss");
  const podNetpolScssPath = path.resolve(projectRoot, "packages/core/src/renderer/components/workloads-pods/details/pod-network-policies.scss");

  const matrixCss = sass.compile(matrixScssPath).css;
  const podNetpolCss = sass.compile(podNetpolScssPath).css;
  fs.writeFileSync(path.join(outdir, "styles.css"), `${matrixCss}\n${podNetpolCss}`);

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
      logLevel: "info",
    });
    console.log("esbuild finished successfully!");
  } catch (err) {
    console.error("esbuild compilation error:", err);
    process.exit(1);
  }
})();
