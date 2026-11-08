/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
const { execSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[sign-adhoc] Performing deep ad-hoc code signing on ${appPath}...`);
  try {
    // Deep ad-hoc sign all frameworks, dylibs, helpers and main app bundle
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });

    console.log(`[sign-adhoc] Verifying strict integrity of ${appPath}...`);
    execSync(`codesign --verify --deep --strict --verbose=4 "${appPath}"`, { stdio: "inherit" });
    console.log(`[sign-adhoc] Signature successfully verified!`);
  } catch (err) {
    console.error(`[sign-adhoc] Failed to sign/verify app bundle:`, err);
    throw err;
  }
};
