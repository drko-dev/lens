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

    expect(scss).toContain("--hotbar-width: 64px;");
    expect(scss).toContain("--hotbar-to-navigation-gap: 0px;");
    expect(scss).toContain("height: var(--navigator-tabs-height);");
    expect(layoutTsx).toContain("isNovaKube && sidebarWidth === defaultSidebarWidth ? 300 : sidebarWidth");
    expect(layoutTsx).toContain("getCurrentExtent={() => effectiveWidth}");
    expect(layoutTsx).toContain("onDoubleClick={() => this.onSidebarResize(isNovaKube ? 300 : defaultSidebarWidth)}");
  });

  it("presents the Lens-style navigator title and compact cluster selector without hiding safety badges", () => {
    expect(scss).toContain('[data-testid="cluster-sidebar"]::before');
    expect(scss).toContain('content: "Navigator";');
    expect(scss).toContain("flex: 0 0 32px;");
    expect(scss).toContain('[data-testid="sidebar-cluster-dropdown"]');
    expect(scss).toContain("height: 28px;");
    expect(scss).not.toMatch(/\[class\*="badgeRow"\]\s*\{\s*display:\s*none/);
  });

  it("uses Lens-style left-side expandable controls and compact tree spacing", () => {
    expect(scss).toContain("order: -1;");
    expect(scss).toContain('[data-icon-name="keyboard_arrow_down"] { transform: rotate(-90deg); }');
    expect(scss).toContain('[data-icon-name="keyboard_arrow_up"] { transform: rotate(180deg); }');
    expect(scss).toContain('[data-testid="sidebar-item-link-for-cluster-overview"]');
    expect(scss).toContain("padding-left: 29px;");
    expect(scss).toContain(".navigator-cluster-root {");
    expect(scss).toContain(".navigator-cluster-status");
    expect(scss).toContain('[data-connected="true"]');
    expect(scss).toContain('[data-testid="navigator-resource-tree"] {');
    expect(scss).toContain("background: var(--nv-active-cluster-color, var(--magenta));");
    expect(scss).toContain("padding-left: 34px;");
    expect(scss).toContain("min-height: 22px;");
  });

  it("keeps Lens-like Pods toolbar geometry without removing NovaKube tools", () => {
    expect(scss).toContain(".Pods .header {");
    expect(scss).toContain("min-height: 40px;");
    expect(scss).toContain('> [data-testid="namespace-select-filter"]');
    expect(scss).toContain("min-width: 220px;");
    expect(scss).toContain(".Select__control {");
    expect(scss).toContain("height: 26px;");
    expect(scss).toContain("min-height: 26px;");
    expect(scss).toContain("> .Input.SearchInput {");
    expect(scss).toContain('> [data-testid="kube-list-export-csv-btn"]');
    expect(scss).toContain('> [data-testid="kube-quick-filters"]');
    expect(scss).toContain("background: var(--sidebarBackground);");
    expect(scss).toContain("color: var(--tableHeaderColor);");
    expect(scss).toContain("--nv-pods-row-text: var(--textColorPrimary);");
    expect(scss).toContain(".Pods .Table:not(.striped) .TableRow:not(.selected):not(.isSelected):not(:hover) > .TableCell {");
    expect(scss).toContain("background-color: var(--backgroundPrimary);");
    expect(scss).toContain(".Pods .Table.selectable .TableRow:hover > .TableCell {");
    expect(scss).toContain("background-color: var(--tableBgcSelected) !important;");
    expect(scss).toContain("box-shadow: inset -1px 0 0 var(--borderFaintColor);");
    expect(scss).not.toMatch(/\[data-testid="kube-quick-filters"\]\s*\{\s*display:\s*none/);
  });

  it("extends Lens title-case and compact toolbar styling to other Kubernetes resource tables", () => {
    expect(scss).toContain(".KubeObjectListLayout.ItemListLayout:not(.Pods) > .header {");
    expect(scss).toContain(".KubeObjectListLayout.Table:not(.Pods) {");
    expect(scss).toContain("text-transform: none;");
    expect(scss).toContain("height: 34px;");
    expect(scss).toContain("> .KubeQuickFilters {");
    expect(scss).toContain("@media (max-width: 1100px)");
  });

  it("shows the Lens full-row active Navigator highlight only for leaf resources", () => {
    expect(scss).toContain('[data-testid^="sidebar-item-"]:not([class*="expandable"]):has(');
    expect(scss).toContain("background: rgba(55, 58, 62, 0.5) !important;");
    expect(scss).toContain("border-left-color: transparent;");
  });

  it("matches Lens square workspace tabs and preserves the close controls", () => {
    expect(scss).toContain('[data-testid="workspace-tab-bar"]');
    expect(scss).toContain("height: var(--navigator-tabs-height);");
    expect(scss).toContain(".tabs-scroll-container {");
    expect(scss).toContain("gap: 0;");
    expect(scss).toContain(".WorkspaceTab {");
    expect(scss).toContain("border-radius: 0;");
    expect(scss).toContain("text-transform: none;");
    expect(scss).toContain("&.active:not(.prod-hazard) {");
    expect(scss).toContain("box-shadow: inset 0 -1px 0 var(--layoutTabsLineColor);");
    expect(scss).toContain(".tab-close-btn {");
    expect(scss).not.toContain("text-transform: uppercase; // Lens tab");
  });

  it("matches Lens macOS Back/Forward chrome without removing navigation services", () => {
    expect(scss).toContain('[data-testid="home-button"]');
    expect(scss).toContain("display: none;");
    expect(scss).toContain("padding-left: 16px;");
    // Scope remains body.theme-novakube, other themes retain their Home control.
    expect(scss).toContain("body.theme-novakube {");
  });

  it("keeps Lens Navigator and favorites rail on the deep editor surface", () => {
    expect(scss).toContain("background: var(--mainBackground, #181A1C);");
    expect(scss).toContain(".HotbarMenu {");
    expect(scss).toContain("body.theme-novakube {");
  });

  it("uses Lens 2026 16px scrollbar track and padded 6px thumb", () => {
    expect(scss).toContain("width: var(--scrollbar-width); // 16px in Lens");
    expect(scss).toContain("height: 15px;");
    expect(scss).toContain("border: 5px solid transparent;");
    expect(scss).toContain("min-height: 30px;");
    expect(scss).toContain("background-clip: padding-box;");
  });

  it("matches Lens striped-table parity without forcing a background on every row", () => {
    expect(scss).toContain(".Table .TableRow:nth-child(even):not(:hover):not(.selected):not(.isSelected) {");
    expect(scss).toContain(".Table.striped .TableRow:nth-child(odd) {");
    expect(scss).toContain("background-color: var(--tableBgcStripe);");
    expect(scss).toContain("background: var(--backgroundPrimary, #1F2123);");
    expect(scss).not.toContain("&:nth-child(even) {");
  });

  it("styles Lens terminal tab icon and selected underline without touching session logic", () => {
    expect(scss).toContain(".TerminalWindow > .TerminalSearch {");
    expect(scss).toContain("flex: 0 0 36px;");
    expect(scss).toContain(".Dock .TerminalTab {");
    expect(scss).toContain('.Icon:has([data-icon-name="terminal"]) {');
    expect(scss).toContain("color: #C93DCE;");
    expect(scss).toContain("background-color: #1F2123;");
    expect(scss).toContain("border-bottom: 1px solid var(--layoutTabsLineColor);");
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
  it("lists every catalog cluster under a Kubernetes Clusters heading and keeps per-cluster pin colors", () => {
    const sidebarTsx = fs.readFileSync(path.join(componentsDir, "layout/sidebar.tsx"), "utf8");

    expect(sidebarTsx).toContain('data-testid="navigator-clusters-heading"');
    expect(sidebarTsx).toContain('getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster")');
    expect(sidebarTsx).toContain("onClick={() => entityRegistry.onRun(entity)}");
    expect(sidebarTsx).toContain("entity.spec.icon?.background");
  });
});
