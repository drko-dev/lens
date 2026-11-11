/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import path from "path";

// Reference: installed Mirantis Lens 2026.10.261408 Dark, inspected locally.
// This verifies the scoped NovaKube preview tokens, not pixel/UX parity.
describe("NovaKube Lens 2026.10 visual token parity", () => {
  const componentsDir = path.resolve(__dirname, "../../components");
  const scss = fs.readFileSync(path.join(componentsDir, "novakube.scss"), "utf8");
  const rendererEntry = fs.readFileSync(path.resolve(__dirname, "../../../../../../open-lens/src/renderer/index.ts"), "utf8");

  it("scopes reference values to NovaKube and enables source SCSS HMR in development", () => {
    expect(scss).toContain("body.theme-novakube {");
    expect(scss).not.toContain("body.theme-cursor {");
    expect(rendererEntry).toContain('import "../../../packages/core/src/renderer/components/novakube.scss";');
  });

  it("matches the Lens 2026 chrome geometry without changing other theme defaults", () => {
    const layoutTsx = fs.readFileSync(path.join(componentsDir, "layout/main-layout.tsx"), "utf8");
    expect(scss).toContain("--hotbar-width: 60px;");
    expect(scss).toContain("--hotbar-to-navigation-gap: 0px;");
    expect(scss).toContain("height: var(--navigator-tabs-height);");
    expect(layoutTsx).toContain("isNovaKube && sidebarWidth === defaultSidebarWidth ? 308 : sidebarWidth");
    expect(layoutTsx).toContain("getCurrentExtent={() => effectiveWidth}");
    expect(layoutTsx).toContain("onDoubleClick={() => this.onSidebarResize(isNovaKube ? 308 : defaultSidebarWidth)}");
  });

  it("pins verified Open Sans and geometry tokens", () => {
    for (const token of [
      '--font-primary: "Open Sans", "Helvetica", "Arial", sans-serif;',
      "--unit: 8px;",
      "--border-radius: 3px;",
      "--main-layout-header: 40px;",
      "--navigator-tabs-height: 36px;",
    ]) {
      expect(scss).toContain(token);
    }
  });

  it("pins Lens Dark reference palette for common UI surfaces and states", () => {
    const colors: Record<string, string> = {
      mainBackground: "#181A1C",
      backgroundPrimary: "#1F2123",
      sidebarBackground: "#26292B",
      sidebarLogoBackground: "#414448",
      layoutTabsBackground: "#252729",
      tableHeaderBackground: "#1F2123",
      textColorPrimary: "#AAACAE",
      textColorSecondary: "#A0A0A0",
      borderColor: "#2D2F31",
      primary: "#3D90CE",
      tableBgcSelected: "#37383E",
    };

    for (const [name, value] of Object.entries(colors)) {
      expect(scss).toContain(`--${name}: ${value};`);
    }
  });
});
