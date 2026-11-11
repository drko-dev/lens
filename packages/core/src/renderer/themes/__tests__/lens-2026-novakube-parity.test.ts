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

  it("presents the Lens-style navigator title and compact cluster selector without hiding safety badges", () => {
    expect(scss).toContain('[data-testid="cluster-sidebar"]::before');
    expect(scss).toContain('content: "Navigator";');
    expect(scss).toContain('flex: 0 0 32px;');
    expect(scss).toContain('[data-testid="sidebar-cluster-dropdown"]');
    expect(scss).toContain('height: 28px;');
    expect(scss).not.toMatch(/\[class\*="badgeRow"\]\s*\{\s*display:\s*none/);
  });

  it("uses Lens-style left-side expandable controls and compact tree spacing", () => {
    expect(scss).toContain('order: -1;');
    expect(scss).toContain('[data-icon-name="keyboard_arrow_down"] { transform: rotate(-90deg); }');
    expect(scss).toContain('[data-icon-name="keyboard_arrow_up"] { transform: rotate(180deg); }');
    expect(scss).toContain('padding-left: 34px;');
    expect(scss).toContain('min-height: 22px;');
  });

  it("keeps Lens-like Pods toolbar geometry without removing NovaKube tools", () => {
    expect(scss).toContain(".Pods .header {");
    expect(scss).toContain("min-height: 40px;");
    expect(scss).toContain('> [data-testid="namespace-select-filter"]');
    expect(scss).toContain("min-width: 220px;");
    expect(scss).toContain("> .Input.SearchInput {");
    expect(scss).toContain('> [data-testid="kube-list-export-csv-btn"]');
    expect(scss).toContain('> [data-testid="kube-quick-filters"]');
    expect(scss).toContain('box-shadow: inset -1px 0 0 var(--borderFaintColor);');
    expect(scss).not.toMatch(/\[data-testid="kube-quick-filters"\]\s*\{\s*display:\s*none/);
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
