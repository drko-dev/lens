/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps — NovaKube Theme.
// High-contrast runtime refresh of Concept A; original H9 brand assets remain unchanged.
import { getInjectable } from "@ogre-tools/injectable";
import midnightGraphiteThemeInjectable from "./midnight-graphite.injectable";
import lensOfficialDarkThemeInjectable from "./lens-official-dark.injectable";
import { lensThemeDeclarationInjectionToken } from "./declaration";

export const novakubeThemeName = "NovaKube";

/**
 * NovaKube Brand Tokens (Concept A — Pod / Contenedores).
 * Runtime palette for the existing NovaKube theme; original Brand Kit V1 stays intact.
 */
export const novakubeBrandColors = {
  background: "#0B0D10",
  app: "#111316",
  surface: "#191C20",
  surfaceRaised: "#22262B",
  surfaceHover: "#292E34",
  border: "#363B42",
  textPrimary: "#E9ECEF", // subtle low-glare primary text, unchanged hierarchy
  textSecondary: "#C0C8D2",
  textMuted: "#A3ADBA",
  accent: "#3B69BA",  // less saturated blue on primary actions
  accentFocus: "#8EAFD1",  // softer focus/secondary blue
  accentHover: "#30579D",
  linkText: "#A3BED8",  // legible muted blue for text, distinct from action fill
  selectionBackground: "#1C3A62",
  success: "#00B86B",  // saturated emerald, no pastel/gray wash
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#38BDF8",
};

const novakubeThemeInjectable = getInjectable({
  id: "openlens-devops-novakube-theme",
  instantiate: (di) => {
    const baseTheme = di.inject(midnightGraphiteThemeInjectable);
    const lensDark = di.inject(lensOfficialDarkThemeInjectable);
    const lensDarkParityColors = {
      // Lens 2026.10 visual parity: use the already-registered Lens Dark
      // declaration as the single runtime source, matching the scoped SCSS.
      // Keep NovaKube's brand assets, incident safety colors, env markers,
      // window/docking logic and all credential/network protections intact.
      mainBackground: lensDark.colors.mainBackground,
      secondaryBackground: lensDark.colors.secondaryBackground,
      backgroundPrimary: lensDark.colors.backgroundPrimary,
      backgroundSecondary: lensDark.colors.backgroundSecondary,
      contentColor: lensDark.colors.contentColor,
      layoutBackground: lensDark.colors.layoutBackground,
      layoutTabsBackground: lensDark.colors.layoutTabsBackground,
      layoutTabsActiveColor: lensDark.colors.layoutTabsActiveColor,
      layoutTabsLineColor: lensDark.colors.layoutTabsLineColor,
      sidebarBackground: lensDark.colors.sidebarBackground,
      sidebarLogoBackground: lensDark.colors.sidebarLogoBackground,
      sidebarActiveColor: lensDark.colors.sidebarActiveColor,
      sidebarSubmenuActiveColor: lensDark.colors.sidebarSubmenuActiveColor,
      sidebarItemHoverBackground: lensDark.colors.sidebarItemHoverBackground,
      textColorPrimary: lensDark.colors.textColorPrimary,
      textColorSecondary: lensDark.colors.textColorSecondary,
      textColorTertiary: lensDark.colors.textColorTertiary,
      textColorAccent: lensDark.colors.textColorAccent,
      textColorDimmed: lensDark.colors.textColorDimmed,
      textPrimary: lensDark.colors.textColorPrimary,
      textSecondary: lensDark.colors.textColorSecondary,
      textMuted: lensDark.colors.textColorDimmed,
      borderColor: lensDark.colors.borderColor,
      borderFaintColor: lensDark.colors.borderFaintColor,
      borderDefault: lensDark.colors.borderColor,
      borderSubtle: lensDark.colors.borderFaintColor,
      tableHeaderBackground: lensDark.colors.tableHeaderBackground,
      tableHeaderColor: lensDark.colors.tableHeaderColor,
      tableBgcStripe: lensDark.colors.tableBgcStripe,
      tableBgcSelected: lensDark.colors.tableBgcSelected,
      tableSelectedRowColor: lensDark.colors.tableSelectedRowColor,
      primary: lensDark.colors.primary,
      blue: lensDark.colors.blue,
      actionPrimary: lensDark.colors.buttonPrimaryBackground,
      buttonPrimaryBackground: lensDark.colors.buttonPrimaryBackground,
      buttonDefaultBackground: lensDark.colors.buttonDefaultBackground,
      buttonLightBackground: lensDark.colors.buttonLightBackground,
      buttonAccentBackground: lensDark.colors.buttonAccentBackground,
      buttonDisabledBackground: lensDark.colors.buttonDisabledBackground,
      actionSecondary: lensDark.colors.buttonDefaultBackground,
      actionSecondaryHover: lensDark.colors.sidebarItemHoverBackground,
      dialogTextColor: lensDark.colors.dialogTextColor,
      dialogBackground: lensDark.colors.dialogBackground,
      dialogHeaderBackground: lensDark.colors.dialogHeaderBackground,
      dialogFooterBackground: lensDark.colors.dialogFooterBackground,
      drawerTitleText: lensDark.colors.drawerTitleText,
      drawerSubtitleBackground: lensDark.colors.drawerSubtitleBackground,
      drawerItemValueColor: lensDark.colors.drawerItemValueColor,
      dockHeadBackground: lensDark.colors.dockHeadBackground,
      dockInfoBackground: lensDark.colors.dockInfoBackground,
      dockEditorBackground: lensDark.colors.dockEditorBackground,
      dockTabBorderColor: lensDark.colors.dockTabBorderColor,
      logsBackground: lensDark.colors.logsBackground,
      logsForeground: lensDark.colors.logsForeground,
      itemListToolbarBackground: lensDark.colors.backgroundPrimary,
      itemListBackground: lensDark.colors.mainBackground,
      clusterMenuBackground: lensDark.colors.clusterMenuBackground,
      clusterMenuCellBackground: lensDark.colors.clusterMenuCellBackground,
      inputControlBackground: lensDark.colors.inputControlBackground,
      inputControlBorder: lensDark.colors.inputControlBorder,
      inputControlHoverBorder: lensDark.colors.inputControlHoverBorder,
      menuActiveBackground: lensDark.colors.menuActiveBackground,
      menuSelectedOptionBgc: lensDark.colors.menuSelectedOptionBgc,
      navSelectedBackground: lensDark.colors.navSelectedBackground,
      settingsBackground: lensDark.colors.settingsBackground,
      tooltipBackground: lensDark.colors.tooltipBackground,
      scrollBarColor: lensDark.colors.scrollBarColor,
      surface: lensDark.colors.mainBackground,
      surfaceRaised: lensDark.colors.sidebarBackground,
      surfaceElevated: lensDark.colors.sidebarLogoBackground,
      surfaceHover: lensDark.colors.sidebarItemHoverBackground,
      surfaceActive: lensDark.colors.tableBgcSelected,
      graphiteSurface: lensDark.colors.mainBackground,
      graphiteSurfaceRaised: lensDark.colors.sidebarBackground,
      graphiteBorder: lensDark.colors.borderColor,
      // Interactive states must use the same colors as NovaKube's scoped
      // Lens 2026.10 CSS, including React components that read theme tokens.
      primaryHover: "#337DB5",
      actionPrimaryHover: "#337DB5",
      primaryMuted: "rgba(61, 144, 206, 0.16)",
      focusRing: lensDark.colors.primary,
      focusRingSoft: "rgba(61, 144, 206, 0.30)",
      linkColor: lensDark.colors.primary,
      linkHoverColor: "#75BEFF",
      iconActiveBackground: lensDark.colors.iconActiveBackground,
      magenta: lensDark.colors.magenta,
      // Lens 2026.10 secondary surface/control tokens, explicitly separate
      // from NovaKube's incident, production and terminal safety palette.
      boxShadow: lensDark.colors.boxShadow,
      canvasBackground: lensDark.colors.canvasBackground,
      chartCapacityColor: lensDark.colors.chartCapacityColor,
      chartLiveBarBackground: lensDark.colors.chartLiveBarBackground,
      chartStripesColor: lensDark.colors.chartStripesColor,
      clusterMenuBorderColor: lensDark.colors.clusterMenuBorderColor,
      clusterSettingsBackground: lensDark.colors.clusterSettingsBackground,
      dockBadgeBackground: lensDark.colors.dockBadgeBackground,
      dockEditorActiveLineBackground: lensDark.colors.dockEditorActiveLineBackground,
      dockEditorComment: lensDark.colors.dockEditorComment,
      dockEditorKeyword: lensDark.colors.dockEditorKeyword,
      dockInfoBorderColor: lensDark.colors.dockInfoBorderColor,
      dockTabActiveBackground: lensDark.colors.dockTabActiveBackground,
      drawerItemNameColor: lensDark.colors.drawerItemNameColor,
      drawerTogglerBackground: lensDark.colors.drawerTogglerBackground,
      filterAreaBackground: lensDark.colors.filterAreaBackground,
      grey10: lensDark.colors.grey10,
      grey100: lensDark.colors.grey100,
      grey20: lensDark.colors.grey20,
      grey25: lensDark.colors.grey25,
      grey30: lensDark.colors.grey30,
      grey40: lensDark.colors.grey40,
      grey60: lensDark.colors.grey60,
      grey70: lensDark.colors.grey70,
      grey80: lensDark.colors.grey80,
      hrColor: lensDark.colors.hrColor,
      iconActiveColor: lensDark.colors.iconActiveColor,
      inputOptionHoverColor: lensDark.colors.inputOptionHoverColor,
      lineProgressBackground: lensDark.colors.lineProgressBackground,
      logRowHoverBackground: lensDark.colors.logRowHoverBackground,
      navHoverColor: lensDark.colors.navHoverColor,
      pieChartDefaultColor: lensDark.colors.pieChartDefaultColor,
      radioActiveBackground: lensDark.colors.radioActiveBackground,
      settingsColor: lensDark.colors.settingsColor,
      // Cluster environment colors and incident severity stay NovaKube-specific.
    };


    return {
      ...baseTheme,
      name: novakubeThemeName,
      description: "NovaKube — high-contrast graphite (Concept A), clear text and blue accents",
      author: "OpenLens DevOps",
      isDefault: false,
      // Layered assignment preserves the original NovaKube palette and then
      // applies Lens visual parity without conflicting duplicate declarations.
      colors: Object.assign({}, baseTheme.colors, {
        // Core Brand Accents
        blue: novakubeBrandColors.accent,
        primary: novakubeBrandColors.accent,
        primaryHover: novakubeBrandColors.accentHover,
        primaryMuted: "rgba(59, 105, 186, 0.16)",
        magenta: "#A855F7",
        golden: novakubeBrandColors.warning,
        halfGray: "rgba(163, 173, 186, 0.50)",

        // Typography Hierarchy (no pure white)
        textColorPrimary: novakubeBrandColors.textPrimary,
        textColorSecondary: novakubeBrandColors.textSecondary,
        textColorTertiary: novakubeBrandColors.textMuted,
        textColorAccent: novakubeBrandColors.textPrimary,
        textColorDimmed: novakubeBrandColors.textMuted,

        // Surfaces & Backgrounds
        borderColor: novakubeBrandColors.border,
        borderFaintColor: novakubeBrandColors.surface,
        mainBackground: novakubeBrandColors.background,
        secondaryBackground: novakubeBrandColors.app,
        backgroundPrimary: novakubeBrandColors.app,
        backgroundSecondary: novakubeBrandColors.background,
        contentColor: novakubeBrandColors.app,
        layoutBackground: novakubeBrandColors.background,
        layoutTabsBackground: novakubeBrandColors.app,
        layoutTabsActiveColor: novakubeBrandColors.textPrimary,
        layoutTabsLineColor: novakubeBrandColors.border,

        // Sidebar
        sidebarBackground: novakubeBrandColors.app,
        sidebarLogoBackground: novakubeBrandColors.app,
        sidebarActiveColor: novakubeBrandColors.textPrimary,
        sidebarSubmenuActiveColor: novakubeBrandColors.linkText,
        sidebarItemHoverBackground: novakubeBrandColors.surface,

        // Buttons & Actions
        badgeBackgroundColor: novakubeBrandColors.warning,
        buttonPrimaryBackground: novakubeBrandColors.accent,
        buttonPrimaryForeground: "#FFFFFF",
        buttonDefaultBackground: novakubeBrandColors.surface,
        buttonLightBackground: "#F3F5F7",
        buttonAccentBackground: novakubeBrandColors.danger,
        buttonDisabledBackground: novakubeBrandColors.surfaceRaised,

        // Tables
        tableBgcStripe: novakubeBrandColors.background,
        tableBgcSelected: novakubeBrandColors.selectionBackground,
        tableHeaderBackground: novakubeBrandColors.app,
        tableHeaderColor: novakubeBrandColors.textPrimary,
        tableSelectedRowColor: novakubeBrandColors.textPrimary,

        // Semantics (Do not use brand blue for critical status)
        colorSuccess: novakubeBrandColors.success,
        colorOk: novakubeBrandColors.success,
        colorInfo: novakubeBrandColors.info,
        colorError: novakubeBrandColors.danger,
        colorSoftError: novakubeBrandColors.danger,
        colorWarning: novakubeBrandColors.warning,
        colorVague: novakubeBrandColors.surfaceRaised,
        colorTerminated: novakubeBrandColors.textMuted,

        // Dock & Editor
        dockHeadBackground: novakubeBrandColors.app,
        dockInfoBackground: novakubeBrandColors.app,
        dockInfoBorderColor: novakubeBrandColors.border,
        dockEditorBackground: novakubeBrandColors.background,
        dockEditorTag: novakubeBrandColors.accentFocus,
        dockEditorKeyword: novakubeBrandColors.textPrimary,
        dockEditorComment: novakubeBrandColors.textMuted,
        dockEditorActiveLineBackground: novakubeBrandColors.surface,
        dockBadgeBackground: novakubeBrandColors.surface,
        dockTabBorderColor: novakubeBrandColors.border,
        dockTabActiveBackground: novakubeBrandColors.surface,
        logsBackground: novakubeBrandColors.background,
        logsForeground: novakubeBrandColors.textPrimary,
        logRowHoverBackground: novakubeBrandColors.surface,

        // Dialogs, Drawers & Overlays
        dialogTextColor: novakubeBrandColors.textPrimary,
        dialogBackground: novakubeBrandColors.surface,
        dialogHeaderBackground: novakubeBrandColors.app,
        dialogFooterBackground: novakubeBrandColors.surface,
        drawerTogglerBackground: novakubeBrandColors.surface,
        drawerTitleText: novakubeBrandColors.textPrimary,
        drawerSubtitleBackground: novakubeBrandColors.surface,
        drawerItemNameColor: novakubeBrandColors.textSecondary,
        drawerItemValueColor: novakubeBrandColors.textPrimary,

        // Cluster & Settings Menu
        clusterMenuBackground: novakubeBrandColors.surface,
        clusterMenuBorderColor: novakubeBrandColors.border,
        clusterMenuCellBackground: novakubeBrandColors.app,
        clusterSettingsBackground: novakubeBrandColors.surface,
        addClusterIconColor: novakubeBrandColors.accentFocus,
        boxShadow: "rgba(0, 0, 0, 0.45)",
        iconActiveColor: novakubeBrandColors.textPrimary,
        iconActiveBackground: "rgba(59, 105, 186, 0.16)",
        filterAreaBackground: novakubeBrandColors.background,

        // Charts
        chartLiveBarBackground: "rgba(18, 22, 27, 0.50)",
        chartStripesColor: "rgba(255, 255, 255, 0.05)",
        chartCapacityColor: novakubeBrandColors.border,
        pieChartDefaultColor: novakubeBrandColors.surfaceRaised,

        // Form Controls
        inputOptionHoverColor: novakubeBrandColors.textPrimary,
        inputOptionSelectedColor: novakubeBrandColors.selectionBackground,
        inputControlBackground: novakubeBrandColors.app,
        inputControlBorder: novakubeBrandColors.border,
        inputControlHoverBorder: novakubeBrandColors.accentFocus,

        // Navigation & Scroll
        lineProgressBackground: novakubeBrandColors.surfaceRaised,
        radioActiveBackground: novakubeBrandColors.surfaceRaised,
        menuActiveBackground: novakubeBrandColors.selectionBackground,
        menuSelectedOptionBgc: novakubeBrandColors.selectionBackground,
        canvasBackground: novakubeBrandColors.background,
        scrollBarColor: novakubeBrandColors.border,
        scrollBarHoverColor: novakubeBrandColors.accent,
        settingsBackground: novakubeBrandColors.surface,
        settingsColor: novakubeBrandColors.textSecondary,
        navSelectedBackground: novakubeBrandColors.selectionBackground,
        navHoverColor: novakubeBrandColors.textPrimary,
        hrColor: "rgba(255, 255, 255, 0.08)",
        tooltipBackground: novakubeBrandColors.surfaceRaised,
        linkColor: novakubeBrandColors.linkText,  // text-first: high contrast, muted chroma
        linkHoverColor: "#C5D6E7",

        // Item List & Modals
        itemListToolbarBackground: novakubeBrandColors.app,
        itemListBackground: novakubeBrandColors.background,
        modalHeaderBg: novakubeBrandColors.app,
        modalContentBg: novakubeBrandColors.surface,
        modalFooterBg: novakubeBrandColors.app,
        modalDividerColor: novakubeBrandColors.border,
        modalTextColor: novakubeBrandColors.textPrimary,
        columnResizerColor: novakubeBrandColors.border,

        // Semantic Tints
        surfaceGradient: "linear-gradient(180deg, rgba(59, 105, 186, 0.035) 0%, rgba(11, 13, 16, 0) 42%)",
        successTint: "rgba(0, 184, 107, 0.14)",
        warningTint: "rgba(245, 158, 11, 0.14)",
        criticalTint: "rgba(239, 68, 68, 0.14)",

        // H1-H6 Central Semantic Design Tokens (NovaKube)
        surface: novakubeBrandColors.background,
        surfaceRaised: novakubeBrandColors.surface,
        surfaceElevated: novakubeBrandColors.surfaceRaised,
        surfaceHover: novakubeBrandColors.surfaceHover,
        surfaceActive: novakubeBrandColors.selectionBackground,

        textPrimary: novakubeBrandColors.textPrimary,
        textSecondary: novakubeBrandColors.textSecondary,
        textMuted: novakubeBrandColors.textMuted,

        borderDefault: novakubeBrandColors.border,
        borderSubtle: novakubeBrandColors.surface,
        borderStrong: novakubeBrandColors.accent,

        actionPrimary: novakubeBrandColors.accent,
        actionPrimaryHover: novakubeBrandColors.accentHover,
        actionPrimaryForeground: "#FFFFFF",
        actionSecondary: novakubeBrandColors.surface,
        actionSecondaryHover: novakubeBrandColors.surfaceHover,
        actionDanger: novakubeBrandColors.danger,
        actionDangerHover: "#E28B8F",
        actionDisabled: novakubeBrandColors.surfaceRaised,

        focusRing: novakubeBrandColors.accentFocus,
        focusRingSoft: "rgba(142, 175, 209, 0.30)",

        statusSuccess: novakubeBrandColors.success,
        statusWarning: novakubeBrandColors.warning,
        statusError: novakubeBrandColors.danger,
        statusInfo: novakubeBrandColors.info,

        // Retrocompatible graphite aliases for components
        graphiteBorder: novakubeBrandColors.border,
        graphiteAccent: novakubeBrandColors.accent,
        graphiteSurface: novakubeBrandColors.app,
        graphiteSurfaceRaised: novakubeBrandColors.surface,
      }, lensDarkParityColors),
      terminalColors: {
        ...baseTheme.terminalColors,
        background: novakubeBrandColors.background,
        foreground: novakubeBrandColors.textPrimary,
        cursor: novakubeBrandColors.accentFocus,
        cursorAccent: novakubeBrandColors.background,
        selection: "rgba(59, 105, 186, 0.28)",
        black: novakubeBrandColors.background,
        red: novakubeBrandColors.danger,
        green: novakubeBrandColors.success,
        yellow: novakubeBrandColors.warning,
        blue: novakubeBrandColors.accent,
        magenta: "#A855F7",
        cyan: novakubeBrandColors.accentFocus,
        white: novakubeBrandColors.textPrimary,
        brightBlack: novakubeBrandColors.textMuted,
        brightRed: "#E28B8F",
        brightGreen: "#00D784",  // vivid terminal green, not mint/pastel
        brightYellow: "#E0B774",
        brightBlue: novakubeBrandColors.accentFocus,
        brightMagenta: "#BDB7E5",
        brightCyan: "#8AB5DD",
        brightWhite: "#F3F5F7",
      },
    };
  },
  injectionToken: lensThemeDeclarationInjectionToken,
});

export default novakubeThemeInjectable;
