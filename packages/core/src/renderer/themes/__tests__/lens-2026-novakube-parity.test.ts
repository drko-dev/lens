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

  it("presents the Lens-style navigator title tab and compact cluster selector without duplicating headers or hiding safety badges", () => {
    expect(scss).toContain('[data-testid="cluster-sidebar"]::before');
    expect(scss).toContain("content: none !important;");
    expect(scss).toContain(".navigator-title {");
    expect(scss).toContain("width: 82px;");
    expect(scss).toContain('[data-testid="navigator-selector-row"]');
    expect(scss).toContain("height: 45px;");
    expect(scss).toContain('[data-testid="sidebar-cluster-dropdown"]');
    expect(scss).toContain("height: 26px;");
    expect(scss).not.toMatch(/\[class\*="badgeRow"\]\s*\{\s*display:\s*none/);
  });

  it("uses Lens-style left-side expandable controls and compact tree spacing", () => {
    expect(scss).toContain("order: -1;");
    expect(scss).toContain('[data-icon-name="keyboard_arrow_down"] { transform: rotate(-90deg); }');
    expect(scss).toContain('[data-icon-name="keyboard_arrow_up"] { transform: rotate(180deg); }');
    // Lens DOM: level-1 labels at x=113 (leaf rows 23px + icon, group rows 4px + chevron).
    expect(scss).toContain('[class*="navItem"]:not(:has(> [class*="expandIcon"]))');
    expect(scss).toContain("padding-left: 23px !important;");
    expect(scss).toContain("padding-left: 4px !important;");
    expect(scss).toContain(".navigator-cluster-root {");
    expect(scss).toContain(".navigator-cluster-status");
    expect(scss).toContain('[data-connected="true"]');
    expect(scss).toContain('[data-testid="navigator-resource-tree"] {');
    expect(scss).toContain("background: var(--nv-active-cluster-color, var(--magenta));");
    expect(scss).toContain("padding-left: 22px;");
    expect(scss).toContain("padding-left: 10px !important;");
    expect(scss).toContain("min-height: 22px;");
  });

  it("keeps Lens-like Pods toolbar geometry without removing NovaKube tools", () => {
    expect(scss).toContain(".Pods .header {");
    expect(scss).toContain("min-height: 40px;");
    expect(scss).toContain('> [data-testid="namespace-select-filter"]');
    expect(scss).toContain("min-width: 200px;");
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
    expect(sidebarTsx).toContain("onRun={e => entityRegistry.onRun(e)}");
    expect(fs.readFileSync(path.join(componentsDir, "layout/navigator-cluster-row.tsx"), "utf8")).toContain("entity.spec.icon?.background");
  });
  it("opens Preferences as a workspace tab below the tab strip instead of a fullscreen overlay", () => {
    const tabBarTsx = fs.readFileSync(path.resolve(__dirname, "../../../features/workspace-tabs/renderer/workspace-tab-bar.tsx"), "utf8");

    expect(tabBarTsx).toContain('data-testid="workspace-tab-preferences"');
    expect(tabBarTsx).toContain('startsWith("/preferences")');
    expect(tabBarTsx).toContain("closePreferences?.()");
    expect(scss).toMatch(/body\.theme-novakube \.SettingLayout \{\s+top: 85px !important;/);
  });
  it("scrolls the whole Kubernetes Clusters list as one Navigator region", () => {
    const sidebarTsx = fs.readFileSync(path.join(componentsDir, "layout/sidebar.tsx"), "utf8");

    expect(sidebarTsx).toContain('data-testid="navigator-scroll"');
    expect(scss).toMatch(/\[data-testid="navigator-scroll"\] \{\s+flex: 1 1 auto;/);
  });
  it("moves NovaKube-only Pods quick filters behind a toolbar menu to keep a single Lens row", () => {
    const quickFiltersTsx = fs.readFileSync(path.join(componentsDir, "kube-object-list-layout/kube-quick-filters.tsx"), "utf8");

    expect(quickFiltersTsx).toContain('data-testid="quick-filters-menu-trigger"');
    expect(quickFiltersTsx).toContain('data-testid="quick-filters-active-count"');
    expect(quickFiltersTsx).toContain("activeTheme?.get().name === novakubeThemeName");
    expect(scss).toMatch(/\.quick-filters-menu \{\s+position: absolute;/);
  });
  it("distributes Pods columns like Lens while keeping persisted widths and readable enums", () => {
    expect(scss).toContain('&.name:not([style*="width"]) { flex: 1 1 172px; min-width: 140px; }');
    expect(scss).toContain('&.namespace:not([style*="width"]) { flex: 0 1 104px; min-width: 78px; }');
    expect(scss).toContain('&.memory:not([style*="width"]) { flex: 0 1 78px; min-width: 74px; }');
    expect(scss).toContain('&.containers:not([style*="width"]) { flex: 0 1 86px; min-width: 82px; }');
    expect(scss).toContain('&.restarts:not([style*="width"]) { flex: 0 1 74px; min-width: 70px; }');
    expect(scss).toContain('&.status:not([style*="width"]) { flex: 0 1 84px; min-width: 80px; }');
    expect(scss).toContain('&.owners:not([style*="width"]) { flex: 0 1 104px; min-width: 96px; }');
  });
  it("renders functional Lens Aa / .* search modes inside list search", () => {
    const headerTsx = fs.readFileSync(path.join(componentsDir, "item-object-list/header.tsx"), "utf8");

    expect(headerTsx).toContain("iconLeft={<SearchModeToggles />}");
    expect(scss).toContain(".search-mode-toggles {");
  });
  it("lays out Cluster Overview as Lens flat panels and keeps the ResourceQuota block", () => {
    expect(scss).toContain('grid-template-areas: "toolbar toolbar" "barcharts piechars" "issues issues" "quota quota";');
    expect(scss).toContain("> .quota-headroom-overview-block {");
    expect(scss).toContain("contain: size;");
  });
  it("matches the Lens 2026 drawer title and 37px property rows", () => {
    const drawerStorage = fs.readFileSync(path.join(componentsDir, "drawer/drawer-storage/drawer-storage.injectable.ts"), "utf8");

    expect(scss).toContain('[data-testid="details-header-kind"]::after { content: ":"; margin-right: 6px; }');
    expect(scss).toContain("min-height: 37px !important;");
    expect(scss).toContain("flex: 0 0 194px !important;");
    expect(scss).toContain("--drawer-item-title-width: 194px !important;");
    expect(scss).toContain("grid-template-columns: 194px minmax(0, 1fr) !important;");
    expect(scss).toContain(".DrawerSectionTitle,");
    expect(scss).toContain("font-size: 18px !important;");
    expect(scss).toContain("line-height: 27px !important;");
    expect(drawerStorage).toContain("export const defaultDrawerWidth = 725;");
  });
  it("renders Lens flat menus without the base per-item frame", () => {
    expect(scss).toContain("background: #17191A !important;");
    expect(scss).toMatch(/\.MenuItem \{[^}]*border: 0 !important;/);
  });
  it("uses the Lens 44px list toolbar and 47px centered table header on every list", () => {
    expect(scss).toMatch(/\.ItemListLayout \.Table \.TableHead \{\s+height: 47px !important;/);
    expect(scss).not.toMatch(/ItemListLayout:not\(\.Pods\) > \.header \{\s+height: auto !important;\s+min-height: 40px;/);
  });
  it("keeps Lens 2026 Lucida Console 11.67px log typography over List specificity and guards drawer copy clipboard", () => {
    const drawerTsx = fs.readFileSync(path.join(componentsDir, "drawer/drawer.tsx"), "utf8");

    expect(scss).toContain("body.theme-novakube .LogList .VirtualList .list .LogRow");
    expect(scss).toContain("font-size: 11.6667px !important;");
    expect(drawerTsx).toContain("navigator.clipboard?.writeText?.(itemName)");
  });
  it("renders Lens 2026 47x48 hotbar cells, 3px active/inactive borders, heptagon-wheel pin face, and 37x16 code band", () => {
    expect(scss).toContain("$nv-kube-cluster-mask:");
    expect(scss).toContain("border: 3px solid var(--borderColor, #2D2F31);");
    expect(scss).toContain("border: 3px solid transparent;");
    expect(scss).toContain('border-color: var(--textColorAccent, #F1F3F5) !important;');
    expect(scss).toContain(".novakube-cluster-pin-wheel {");
    expect(scss).toContain(".novakube-cluster-pin-code {");
    expect(scss).toContain("height: 16px;");
    expect(scss).toContain("-webkit-mask: $nv-kube-cluster-mask no-repeat center / contain;");
  });
});
