/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Synthetic Playwright check for the real ValuesDiff React component.
 * MonacoDiffEditor, icons, spinner, and DI are stubbed; this is not packaged-app or Kubernetes E2E.
 * Run with: node docs/revival/scripts/verify-r7-07-playwright.cjs
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(root, "node_modules/playwright"));
const electronPath = require(path.join(root, "node_modules/electron"));

async function main() {
  const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), "r7-07-playwright-"));
  let app;

  try {
    const entryPath = path.join(harnessDir, "entry.tsx");
    fs.writeFileSync(entryPath, `
      import React from "react";
      import ReactDOM from "react-dom";
      import { observable } from "mobx";
      import { ValuesDiff } from ${JSON.stringify(path.join(root, "packages/core/src/renderer/components/helm-releases/release-details/values-diff/values-diff.tsx"))};

      const mode = observable.box("user-supplied");
      const model = {
        isLoading: observable.box(false),
        error: observable.box(undefined),
        valuesA: observable.box("deploymentAlias: private-password-alpha\\n"),
        valuesB: observable.box("deploymentAlias: private-password-beta\\n"),
        mode,
        hasSelection: true,
        revisionA: 2,
        revisionB: 1,
        load: async () => undefined,
        clear: () => undefined,
        setMode: value => mode.set(value),
      };

      ReactDOM.render(
        <ValuesDiff model={model} targetRelease={{ name: "release", namespace: "default" }} />,
        document.getElementById("root"),
      );
    `);

    const plugin = {
      name: "r7-07-values-diff-harness-stubs",
      setup(build) {
        build.onResolve({ filter: /^@ogre-tools\/injectable-react$/ }, () => ({ path: "di", namespace: "r7-harness" }));
        build.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/icon$/ }, () => ({ path: "icon", namespace: "r7-harness" }));
        build.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/monaco-editor$/ }, () => ({ path: "monaco", namespace: "r7-harness" }));
        build.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/spinner$/ }, () => ({ path: "spinner", namespace: "r7-harness" }));
        build.onResolve({ filter: /values-diff-model\.injectable$/ }, () => ({ path: "model-injectable", namespace: "r7-harness" }));
        build.onResolve({ filter: /\.scss$/ }, () => ({ path: "style", namespace: "r7-harness" }));
        build.onLoad({ filter: /.*/, namespace: "r7-harness" }, ({ path: modulePath }) => {
          const modules = {
            di: 'export const withInjectables = Component => Component;',
            icon: 'export const Icon = ({ material }) => <span aria-hidden="true">{material}</span>;',
            spinner: 'export const Spinner = () => <span role="status">Loading</span>;',
            monaco: 'export const MonacoDiffEditor = ({ original, modified, originalTitle, modifiedTitle }) => <div data-testid="monaco-diff"><h3>{originalTitle}</h3><pre data-testid="monaco-original">{original}</pre><h3>{modifiedTitle}</h3><pre data-testid="monaco-modified">{modified}</pre></div>;',
            "model-injectable": 'export default {};',
            style: '',
          };
          return {
            contents: modules[modulePath],
            loader: modulePath === "style" ? "js" : "tsx",
            resolveDir: path.join(root, "node_modules"),
          };
        });
      },
    };

    await esbuild.build({
      absWorkingDir: root,
      entryPoints: [entryPath],
      outfile: path.join(harnessDir, "bundle.js"),
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "chrome110",
      jsx: "automatic",
      nodePaths: [path.join(root, "node_modules")],
      plugins: [plugin],
    });

    fs.writeFileSync(path.join(harnessDir, "index.html"), '<!doctype html><html><body><div id="root"></div><script src="bundle.js"></script></body></html>');
    fs.writeFileSync(path.join(harnessDir, "main.cjs"), `
      const { app, BrowserWindow } = require("electron");
      app.whenReady().then(() => {
        const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
        window.loadFile(${JSON.stringify(path.join(harnessDir, "index.html"))});
      });
      app.on("window-all-closed", () => app.quit());
    `);
    fs.writeFileSync(path.join(harnessDir, "package.json"), JSON.stringify({ name: "r7-07-values-diff-harness", version: "1.0.0", main: "main.cjs" }));

    app = await _electron.launch({ executablePath: electronPath, args: [harnessDir, "--no-sandbox"] });
    const page = await app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.waitForSelector("[data-testid=helm-values-diff-hidden]");
    const hiddenText = await page.locator("body").innerText();
    assert(!hiddenText.includes("private-password-alpha"), "values leaked before explicit reveal");
    assert(!hiddenText.includes("private-password-beta"), "values leaked before explicit reveal");

    await page.locator("[data-testid=helm-values-diff-reveal-toggle]").click();
    assert((await page.locator("[data-testid=monaco-original]").innerText()).includes("private-password-alpha"));

    await page.locator("[data-testid=helm-values-diff-mode-with-defaults]").click();
    await page.waitForSelector("[data-testid=helm-values-diff-hidden]");
    const hiddenAfterModeChange = await page.locator("body").innerText();
    assert(!hiddenAfterModeChange.includes("private-password-alpha"), "values stayed revealed after comparison mode changed");
    assert.deepStrictEqual(pageErrors, [], `browser errors: ${pageErrors.join("; ")}`);

    console.log("R7-07 Playwright synthetic component harness: PASS (real ValuesDiff; Monaco/DI mocked; no packaged app or cluster)");
  } finally {
    if (app) {
      await app.close();
    }

    fs.rmSync(harnessDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
