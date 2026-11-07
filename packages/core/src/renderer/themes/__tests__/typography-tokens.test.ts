/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import path from "path";
import { defaultMuiBaseTheme } from "../../mui-base-theme";

describe("Lens Typography & Size Hierarchy", () => {
  const componentsDir = path.resolve(__dirname, "../../components");
  const fontsDir = path.resolve(__dirname, "../../fonts");

  it("verifies Open Sans variable font files exist and have valid OpenType/TrueType headers", () => {
    const regularFont = path.join(fontsDir, "OpenSans-VariableFont.ttf");
    const italicFont = path.join(fontsDir, "OpenSans-Italic-VariableFont.ttf");

    expect(fs.existsSync(regularFont)).toBe(true);
    expect(fs.existsSync(italicFont)).toBe(true);

    const regularBuf = fs.readFileSync(regularFont);
    const italicBuf = fs.readFileSync(italicFont);

    expect(regularBuf.length).toBeGreaterThan(500000);
    expect(italicBuf.length).toBeGreaterThan(500000);

    // TrueType header magic 0x00010000
    expect(regularBuf[0]).toBe(0x00);
    expect(regularBuf[1]).toBe(0x01);
    expect(regularBuf[2]).toBe(0x00);
    expect(regularBuf[3]).toBe(0x00);
  });

  it("declares Open Sans variable @font-face rules with full weight range (1-999)", () => {
    const fontsScss = fs.readFileSync(path.join(componentsDir, "fonts.scss"), "utf-8");

    expect(fontsScss).toContain('font-family: "Open Sans"');
    expect(fontsScss).toContain('src: url("../fonts/OpenSans-VariableFont.ttf")');
    expect(fontsScss).toContain('src: url("../fonts/OpenSans-Italic-VariableFont.ttf")');
    expect(fontsScss).toContain("font-weight: 1 999");
    expect(fontsScss).toContain("font-stretch: 75% 125%");
  });

  it("defines exact Lens typography CSS custom properties in :root", () => {
    const appScss = fs.readFileSync(path.join(componentsDir, "app.scss"), "utf-8");

    // Font families (Inter with system fallback, or Open Sans)
    expect(appScss).toMatch(/--font-primary:\s*(?:"Inter"|"Open Sans")/);
    expect(appScss).toContain("--font-main: var(--font-primary);");

    // 9-tier Font size scale (exact unit-multipliers from Lens official element-components)
    expect(appScss).toContain("--font-size-xxs: calc(1.25 * var(--unit));"); // 10px
    expect(appScss).toContain("--font-size-small: calc(1.5 * var(--unit));"); // 12px
    expect(appScss).toContain("--font-size: calc(1.75 * var(--unit));"); // 14px
    expect(appScss).toContain("--font-size-big: calc(2 * var(--unit));"); // 16px
    expect(appScss).toContain("--font-size-l: calc(2.25 * var(--unit));"); // 18px
    expect(appScss).toContain("--font-size-xl: calc(2.5 * var(--unit));"); // 20px
    expect(appScss).toContain("--font-size-xxl: calc(2.75 * var(--unit));"); // 22px
    expect(appScss).toContain("--font-size-3xl: calc(3 * var(--unit));"); // 24px
    expect(appScss).toContain("--font-size-4xl: calc(4 * var(--unit));"); // 32px

    // Font weights
    expect(appScss).toContain("--font-weight-thin: 300;");
    expect(appScss).toContain("--font-weight-normal: 400;");
    expect(appScss).toContain("--font-weight-medium: 500;");
    expect(appScss).toContain("--font-weight-bold: 500;");
    expect(appScss).toContain("--font-weight-semibold: 600;");
    expect(appScss).toContain("--font-weight-heavy: 700;");

    // Line heights
    expect(appScss).toContain("--line-height-none: 1;");
    expect(appScss).toContain("--line-height-tight: 1.2;");
    expect(appScss).toContain("--line-height-normal: 1.5;");
    expect(appScss).toContain("--line-height-loose: 2;");
  });

  it("configures body base styling to use --font-primary and official weight 500", () => {
    const appScss = fs.readFileSync(path.join(componentsDir, "app.scss"), "utf-8");

    expect(appScss).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-primary\);[^}]*font-weight:\s*500;/);
  });

  it("exposes Lens typography sizing variables to SCSS vars and design tokens", () => {
    const varsScss = fs.readFileSync(path.join(componentsDir, "vars.scss"), "utf-8");
    const tokensScss = fs.readFileSync(path.join(componentsDir, "tokens.scss"), "utf-8");

    expect(varsScss).toContain("$font-primary: var(--font-primary);");
    expect(varsScss).toContain("$font-size-xxs: var(--font-size-xxs);");
    expect(varsScss).toContain("$font-size-l: var(--font-size-l);");
    expect(varsScss).toContain("$font-size-xxl: var(--font-size-xxl);");
    expect(varsScss).toContain("$font-weight-semibold: var(--font-weight-semibold);");

    expect(tokensScss).toContain("--fs-xxs: var(--font-size-xxs, 10px);");
    expect(tokensScss).toContain("--fs-base: var(--font-size, 14px);");
    expect(tokensScss).toContain("--fs-2xl: var(--font-size-xxl, 22px);");
  });

  it("defines Lens element-components typography utility classes in app.scss", () => {
    const appScss = fs.readFileSync(path.join(componentsDir, "app.scss"), "utf-8");

    expect(appScss).toContain(".font__size--xxs");
    expect(appScss).toContain(".font__size--s");
    expect(appScss).toContain(".font__size--4xl");
    expect(appScss).toContain(".font__line-height--tight");
    expect(appScss).toContain(".font--weight-600");
    expect(appScss).toContain(".font--text-overflow--ellipsis");
  });

  it("configures Material-UI default theme with Open Sans and --font-primary token", () => {
    expect(defaultMuiBaseTheme.typography.fontFamily).toContain("Open Sans");
    expect(defaultMuiBaseTheme.typography.fontFamily).toContain("var(--font-primary");
    expect(defaultMuiBaseTheme.typography.fontWeightMedium).toBe(500);
  });
});
