const asar = require("../../node_modules/asar");
const fs = require("fs");
const path = require("path");

const asarPath = path.join(
  __dirname,
  "../dist-stage-electron45-20261030/mac-arm64/OpenLens DevOps.app/Contents/Resources/app.asar",
);
const workApp = "/tmp/openlens-asar-hostnames/app";

fs.rmSync(path.dirname(workApp), { recursive: true, force: true });
asar.extractAll(asarPath, workApp);

const mainPath = path.join(workApp, "node_modules/@openlens/core/static/build/library/main.js");
let main = fs.readFileSync(mainPath, "utf8");

const needle = 'appendSwitch("host-rules"';
const idx = main.indexOf(needle);
if (idx < 0) {
  console.error("host-rules appendSwitch not found");
  process.exit(2);
}

// Replace the whole run() body fragment for setup-hostnames injectable
const old = `app.commandLine.appendSwitch("host-rules", [
                "MAP localhost 127.0.0.1",
                "MAP lens.app 127.0.0.1",
                "MAP *.lens.app 127.0.0.1",
            ].join());`;

const neu = `const hostMaps = [
                "MAP localhost 127.0.0.1",
                "MAP lens.app 127.0.0.1",
                "MAP *.lens.app 127.0.0.1",
            ].join(",");
            app.commandLine.appendSwitch("host-resolver-rules", hostMaps);
            app.commandLine.appendSwitch("host-rules", hostMaps);
            app.commandLine.appendSwitch("ignore-certificate-errors");`;

if (!main.includes(old)) {
  // try minified/single-line variants
  const alt = 'appendSwitch("host-rules", [\n                "MAP localhost 127.0.0.1",\n                "MAP lens.app 127.0.0.1",\n                "MAP *.lens.app 127.0.0.1",\n            ].join())';
  console.log("exact block missing, nearby:");
  console.log(main.slice(idx, idx + 350));
  if (main.includes('appendSwitch("host-rules"') && !main.includes("ignore-certificate-errors")) {
    // Insert ignore + host-resolver after first host-rules call
    main = main.replace(
      /app\.commandLine\.appendSwitch\("host-rules",(\s*\[[\s\S]*?\]\.join\(\))\);/,
      'const hostMaps = $1;\n            app.commandLine.appendSwitch("host-resolver-rules", hostMaps);\n            app.commandLine.appendSwitch("host-rules", hostMaps);\n            app.commandLine.appendSwitch("ignore-certificate-errors");',
    );
    if (!main.includes("ignore-certificate-errors")) {
      console.error("regex patch failed");
      process.exit(3);
    }
    console.log("patched via regex");
  } else {
    process.exit(4);
  }
} else {
  main = main.replace(old, neu);
  console.log("patched via exact block");
}

fs.writeFileSync(mainPath, main);
console.log("verify", {
  ignore: main.includes("ignore-certificate-errors"),
  resolver: main.includes("host-resolver-rules"),
});

const out = `${asarPath}.new`;
asar.createPackage(workApp, out).then(() => {
  fs.renameSync(asarPath, `${asarPath}.bak-hostnames`);
  fs.renameSync(out, asarPath);
  console.log("asar OK", fs.statSync(asarPath).size);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
