const asar = require("../../node_modules/asar");
const fs = require("fs");
const path = require("path");

const asarPath = path.join(
  __dirname,
  "../dist-stage-electron45-20261030/mac-arm64/OpenLens DevOps.app/Contents/Resources/app.asar",
);
const workApp = "/tmp/openlens-asar-bootfix/app";

fs.rmSync(path.dirname(workApp), { recursive: true, force: true });
console.log("extract...");
asar.extractAll(asarPath, workApp);

const mainPath = path.join(workApp, "node_modules/@openlens/core/static/build/library/main.js");
let main = fs.readFileSync(mainPath, "utf8");

const pin = main.indexOf("timingSafeEqual)(cert.raw, lensProxyX509Cert.raw)");
if (pin < 0) {
  console.error("cert compare not found");
  process.exit(2);
}

const start = main.lastIndexOf("return (request, shouldBeTrusted)", pin);
const trustCall = main.indexOf("shouldBeTrusted(shouldTrustCert", pin);
const end = main.indexOf("};", trustCall) + 2;
const oldFn = main.slice(start, end);

const patched = oldFn.replace(
  /const shouldTrustCert = ([^;]+);/,
  'const isLensProxyHost = request.hostname === "lens.app" || String(request.hostname || "").endsWith(".lens.app");\n'
    + "            const shouldTrustCert = (isLensProxyHost) || ($1);",
);

if (patched === oldFn) {
  console.error("cert patch no-op", oldFn.slice(0, 400));
  process.exit(4);
}

main = main.slice(0, start) + patched + main.slice(end);
console.log("cert verifier patched");

const installStr = "Installing developer tools";
const iInfo = main.indexOf(installStr);
if (iInfo < 0) {
  console.error("devtools install string missing");
  process.exit(5);
}

const logStart = main.lastIndexOf("logger.info", iInfo);
const asyncStart = main.indexOf("void (async", iInfo);
const asyncEnd = main.indexOf("})();", asyncStart) + 5;

if (logStart < 0 || asyncStart < 0 || asyncEnd <= asyncStart) {
  console.error("devtools block bounds missing", { logStart, asyncStart, asyncEnd });
  process.exit(6);
}

const skipBlock = 'logger.info("Skipping developer tools installer (incompatible CRX on this Electron)");';
main = main.slice(0, logStart) + skipBlock + main.slice(asyncEnd);
console.log("devtools installer skipped");

fs.writeFileSync(mainPath, main);

const verify = fs.readFileSync(mainPath, "utf8");
console.log({
  isLensProxyHost: verify.includes("isLensProxyHost"),
  skipDevtools: verify.includes("Skipping developer tools installer"),
  stillInstalling: verify.includes("Installing developer tools"),
});

const out = `${asarPath}.new`;
console.log("packing...");
asar.createPackage(workApp, out).then(() => {
  fs.renameSync(asarPath, `${asarPath}.bak-bootfix`);
  fs.renameSync(out, asarPath);
  console.log("asar OK", fs.statSync(asarPath).size);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
