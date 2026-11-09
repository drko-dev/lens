/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import path from "path";

/**
 * H8.8-06a-R2: every `styles.<name>` / `styles["<name>"]` used by a component must exist
 * in the .module.scss that component imports. Parses the files directly instead of relying on
 * identity-obj-proxy (which resolves any name, hiding undefined classes).
 */
const rendererDir = path.resolve(__dirname, "..");

const read = (file: string) => fs.readFileSync(path.join(rendererDir, file), "utf-8");

const scssClassNames = (file: string): Set<string> => {
  const source = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  return new Set(Array.from(source.matchAll(/\.([A-Za-z_][\w-]*)/g), m => m[1]));
};

const usedStyleNames = (source: string, binding: string): string[] => {
  const names = new Set<string>();

  for (const m of source.matchAll(new RegExp(`\\b${binding}\\.([A-Za-z_][\\w]*)`, "g"))) names.add(m[1]);
  for (const m of source.matchAll(new RegExp(`\\b${binding}\\[\\s*["'\`]([^"'\`]+)["'\`]\\s*\\]`, "g"))) names.add(m[1]);

  return Array.from(names);
};

const missingClasses = (tsxFile: string): string[] => {
  const source = read(tsxFile);
  const importMatch = source.match(/import\s+(\w+)\s+from\s+["']\.\/([\w.-]+\.module\.scss)["']/);

  if (!importMatch) return [`${tsxFile}: no .module.scss import found`];

  const [, binding, scssFile] = importMatch;
  const defined = scssClassNames(scssFile);

  return usedStyleNames(source, binding)
    .filter(name => !defined.has(name))
    .map(name => `${tsxFile} -> ${scssFile}: ${name}`);
};

describe("H8.8-06a-R2 CSS module class references", () => {
  it.each([
    "ai-provider-config-dialog.tsx",
    "incident-list-view.tsx",
    "incident-workbench-panel.tsx",
  ])("%s only uses classes that exist in its own imported module", file => {
    expect(missingClasses(file)).toEqual([]);
  });

  it("the dialog owns its own module (not the workbench or list-view module)", () => {
    expect(read("ai-provider-config-dialog.tsx")).toMatch(/from "\.\/ai-provider-config-dialog\.module\.scss"/);
  });

  it("the dialog module defines a fixed, centered, scrollable modal", () => {
    const scss = read("ai-provider-config-dialog.module.scss");
    const block = (name: string) => scss.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`))?.[0] ?? "";

    expect(block("modalBackdrop")).toMatch(/position:\s*fixed/);
    expect(block("modalBackdrop")).toMatch(/inset:\s*0/);
    expect(block("modalBackdrop")).toMatch(/z-index:\s*\d+/);
    expect(block("modalBackdrop")).toMatch(/justify-content:\s*center/);
    expect(block("modalBackdrop")).toMatch(/align-items:\s*center/);
    expect(block("modalContent")).toMatch(/overflow-y:\s*auto/);
    expect(block("modalContent")).toMatch(/max-height:\s*90vh/);
    expect(block("modalContent")).toMatch(/max-width:\s*100%/);
  });

  it("detector sanity: flags a class that does not exist", () => {
    const defined = scssClassNames("incident-workbench-panel.module.scss");

    expect(defined.has("transitionBtn")).toBe(true);
    expect(defined.has("definitelyNotAClass")).toBe(false);
    expect(usedStyleNames("styles.a styles[\"b-c\"] styles['d']", "styles").sort()).toEqual(["a", "b-c", "d"]);
  });
});
