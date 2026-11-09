/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import path from "path";

const scss = fs.readFileSync(path.resolve(__dirname, "../incident-list-view.module.scss"), "utf-8");
const tsx = fs.readFileSync(path.resolve(__dirname, "../incident-list-view.tsx"), "utf-8");
const workbench = fs.readFileSync(path.resolve(__dirname, "../incident-workbench-panel.tsx"), "utf-8");

describe("H8.8-06a-R2c responsive Incident Center", () => {
  it("uses named CSS module classes for all three split layout elements, not inline-style selectors", () => {
    expect(tsx).toContain('className={styles.splitRow}');
    expect(tsx).toContain("styles.tableWithWorkbench");
    expect(tsx).toContain('className={styles.inlineWorkbenchPane}');
    expect(scss).toMatch(/\.splitRow\s*\{[^}]*display:\s*flex/);
    expect(scss).toMatch(/\.inlineWorkbenchPane\s*\{[^}]*height:\s*100%/);
    expect(scss).not.toMatch(/\[style\*=/);
    expect(tsx).not.toMatch(/style=\{\{ display: "flex", gap: 16, flex: 1, minHeight: 0/);
  });

  it("only stacks on narrow widths, not all windows below 700px high", () => {
    expect(scss).toContain("@media (max-width: 900px)");
    expect(scss).toContain("@media (min-width: 901px) and (max-height: 700px)");
    expect(scss).not.toContain("@media (max-width: 900px), (max-height: 700px)");
    const narrow = scss.split("@media (max-width: 900px)")[1].split("@media (min-width: 901px)")[0];
    expect(narrow).toMatch(/\.splitRow\s*\{[^}]*flex-direction:\s*column/);
    expect(narrow).toMatch(/\.inlineWorkbenchPane\s*\{[^}]*height:\s*560px/);
    expect(narrow).toMatch(/\.tableWithWorkbench\s*\{[^}]*flex:\s*0 0 auto/);
    expect(narrow).toMatch(/overflow-x:\s*auto/);
  });

  it("short and wide windows preserve horizontal split without collapsing", () => {
    const short = scss.split("@media (min-width: 901px) and (max-height: 700px)")[1];
    expect(short).toMatch(/\.splitRow\s*\{[^}]*flex:\s*1 0 320px/);
    expect(short).not.toContain("flex-direction: column");
  });

  it("reveals the synthetic result on narrow windows without bypassing AI consent", () => {
    expect(workbench).toContain('ref={demoBadgeRef}');
    expect(workbench).toContain('if (activeDiagnosis?.provider !== "mock" || activeTab !== "diagnostic") return;');
    expect(workbench).toContain('badge.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" })');
    expect(workbench).toContain('new ResizeObserver(onResize)');
    expect(workbench).toContain('observer?.disconnect()');
    expect(workbench).toContain('window.addEventListener("resize", onResize)');
    expect(workbench).toContain('window.removeEventListener("resize", onResize)');
  });

  it("keeps header actions wrapping and wide split percentages within gap budget", () => {
    expect(scss).toMatch(/\.actions\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(scss).toMatch(/\.inlineWorkbenchPane\s*\{[^}]*flex:\s*0 0 calc\(45% - 8px\)/);
    expect(scss).toMatch(/\.tableWithWorkbench\s*\{[^}]*flex:\s*0 0 calc\(55% - 8px\)/);
  });
});
