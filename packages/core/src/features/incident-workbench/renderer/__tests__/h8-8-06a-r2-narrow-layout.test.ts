/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import path from "path";

const scss = fs.readFileSync(path.resolve(__dirname, "../incident-list-view.module.scss"), "utf-8");
const narrow = scss.slice(scss.indexOf("@media (max-width: 900px)"));

describe("H8.8-06a-R2b narrow layout (DEMO OFFLINE badge must stay reachable)", () => {
  it("has a narrow-window media query that does not touch wide layout", () => {
    expect(scss).toContain("@media (max-width: 900px), (max-height: 700px)");
  });

  it("stops the inline split row from collapsing to 0 height and stacks the panes", () => {
    expect(narrow).toMatch(/min-height\"\]\s*\{[\s\S]*flex:\s*0 0 auto !important/);
    expect(narrow).toMatch(/min-height:\s*auto !important/);
    expect(narrow).toMatch(/flex-direction:\s*column/);
  });

  it("gives the workbench pane an explicit height so it is reachable by scrolling", () => {
    expect(narrow).toMatch(/nth-child\(2\)\s*\{\s*height:\s*\d+px !important/);
  });

  it("lets header actions wrap (no horizontal page overflow at 700px)", () => {
    expect(scss).toMatch(/\.actions\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it("the inline split row selector still matches the component's inline style", () => {
    const tsx = fs.readFileSync(path.resolve(__dirname, "../incident-list-view.tsx"), "utf-8");

    expect(tsx).toMatch(/style=\{\{ display: "flex", gap: 16, flex: 1, minHeight: 0 \}\}/);
  });
});
