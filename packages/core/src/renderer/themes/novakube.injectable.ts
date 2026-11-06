/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps — NovaKube Theme.
// Official dark graphite palette (Concept A) with steel-blue accents and low-glare surfaces.
import { getInjectable } from "@ogre-tools/injectable";
import midnightGraphiteThemeInjectable from "./midnight-graphite.injectable";
import { lensThemeDeclarationInjectionToken } from "./declaration";

export const novakubeThemeName = "NovaKube";

/**
 * NovaKube Brand Tokens (Concept A — Pod / Contenedores).
 * Values mapped directly from tokens/brand-tokens.json.
 */
export const novakubeBrandColors = {
  background: "#12161B",
  app: "#161C23",
  surface: "#242A31",
  surfaceRaised: "#2C343D",
  surfaceHover: "#303943",
  border: "#373D44",
  textPrimary: "#D7DCE2",
  textSecondary: "#A8B2BF",
  textMuted: "#8C939B",
  accent: "#7792AC",
  accentFocus: "#6E9CC6",
  success: "#65B996",
  warning: "#D2A65E",
  danger: "#D17B7F",
  info: "#7792AC",
};

const novakubeThemeInjectable = getInjectable({
  id: "openlens-devops-novakube-theme",
  instantiate: (di) => {
    const baseTheme = di.inject(midnightGraphiteThemeInjectable);

    return {
      ...baseTheme,
      name: novakubeThemeName,
      description: "NovaKube — official dark graphite palette (Concept A) with steel-blue accents",
      author: "OpenLens DevOps",
      isDefault: false,
      colors: {
        ...baseTheme.colors,

        // Core Brand Accents
        blue: novakubeBrandColors.accent,
        primary: novakubeBrandColors.accent,
        primaryHover: novakubeBrandColors.accentFocus,
        primaryMuted: "rgba(119, 146, 172, 0.20)",
        magenta: "#A39CD6",
        golden: novakubeBrandColors.warning,
        halfGray: "rgba(140, 147, 155, 0.50)",

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
        sidebarSubmenuActiveColor: novakubeBrandColors.accent,
        sidebarItemHoverBackground: novakubeBrandColors.surface,

        // Buttons & Actions
        badgeBackgroundColor: novakubeBrandColors.warning,
        buttonPrimaryBackground: novakubeBrandColors.accent,
        buttonPrimaryForeground: "#12161B",
        buttonDefaultBackground: novakubeBrandColors.surface,
        buttonLightBackground: "#F3F5F7",
        buttonAccentBackground: novakubeBrandColors.danger,
        buttonDisabledBackground: novakubeBrandColors.surfaceRaised,

        // Tables
        tableBgcStripe: novakubeBrandColors.background,
        tableBgcSelected: novakubeBrandColors.surface,
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
        dockEditorTag: novakubeBrandColors.accent,
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
        addClusterIconColor: novakubeBrandColors.accent,
        boxShadow: "rgba(0, 0, 0, 0.45)",
        iconActiveColor: novakubeBrandColors.textPrimary,
        iconActiveBackground: "rgba(119, 146, 172, 0.20)",
        filterAreaBackground: novakubeBrandColors.background,

        // Charts
        chartLiveBarBackground: "rgba(18, 22, 27, 0.50)",
        chartStripesColor: "rgba(255, 255, 255, 0.05)",
        chartCapacityColor: novakubeBrandColors.border,
        pieChartDefaultColor: novakubeBrandColors.surfaceRaised,

        // Form Controls
        inputOptionHoverColor: novakubeBrandColors.textPrimary,
        inputOptionSelectedColor: novakubeBrandColors.surface,
        inputControlBackground: novakubeBrandColors.app,
        inputControlBorder: novakubeBrandColors.border,
        inputControlHoverBorder: novakubeBrandColors.accentFocus,

        // Navigation & Scroll
        lineProgressBackground: novakubeBrandColors.surfaceRaised,
        radioActiveBackground: novakubeBrandColors.surfaceRaised,
        menuActiveBackground: novakubeBrandColors.surfaceHover,
        menuSelectedOptionBgc: novakubeBrandColors.surface,
        canvasBackground: novakubeBrandColors.background,
        scrollBarColor: novakubeBrandColors.border,
        scrollBarHoverColor: novakubeBrandColors.accent,
        settingsBackground: novakubeBrandColors.surface,
        settingsColor: novakubeBrandColors.textSecondary,
        navSelectedBackground: novakubeBrandColors.surface,
        navHoverColor: novakubeBrandColors.textPrimary,
        hrColor: "rgba(255, 255, 255, 0.08)",
        tooltipBackground: novakubeBrandColors.surfaceRaised,
        linkColor: novakubeBrandColors.accent,
        linkHoverColor: novakubeBrandColors.accentFocus,

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
        surfaceGradient: "linear-gradient(180deg, rgba(119, 146, 172, 0.10) 0%, rgba(18, 22, 27, 0) 42%)",
        successTint: "rgba(101, 185, 150, 0.16)",
        warningTint: "rgba(210, 166, 94, 0.14)",
        criticalTint: "rgba(209, 123, 127, 0.14)",

        // H1-H6 Central Semantic Design Tokens (NovaKube)
        surface: novakubeBrandColors.background,
        surfaceRaised: novakubeBrandColors.surface,
        surfaceElevated: novakubeBrandColors.surfaceRaised,
        surfaceHover: novakubeBrandColors.surfaceHover,
        surfaceActive: novakubeBrandColors.surfaceRaised,

        textPrimary: novakubeBrandColors.textPrimary,
        textSecondary: novakubeBrandColors.textSecondary,
        textMuted: novakubeBrandColors.textMuted,

        borderDefault: novakubeBrandColors.border,
        borderSubtle: novakubeBrandColors.surface,
        borderStrong: novakubeBrandColors.accent,

        actionPrimary: novakubeBrandColors.accent,
        actionPrimaryHover: novakubeBrandColors.accentFocus,
        actionPrimaryForeground: "#12161B",
        actionSecondary: novakubeBrandColors.surface,
        actionSecondaryHover: novakubeBrandColors.surfaceHover,
        actionDanger: novakubeBrandColors.danger,
        actionDangerHover: "#E28B8F",
        actionDisabled: novakubeBrandColors.surfaceRaised,

        focusRing: novakubeBrandColors.accentFocus,
        focusRingSoft: "rgba(110, 156, 198, 0.35)",

        statusSuccess: novakubeBrandColors.success,
        statusWarning: novakubeBrandColors.warning,
        statusError: novakubeBrandColors.danger,
        statusInfo: novakubeBrandColors.info,

        // Retrocompatible graphite aliases for components
        graphiteBorder: novakubeBrandColors.border,
        graphiteAccent: novakubeBrandColors.accent,
        graphiteSurface: novakubeBrandColors.app,
        graphiteSurfaceRaised: novakubeBrandColors.surface,
      },
      terminalColors: {
        ...baseTheme.terminalColors,
        background: novakubeBrandColors.background,
        foreground: novakubeBrandColors.textPrimary,
        cursor: novakubeBrandColors.accentFocus,
        cursorAccent: novakubeBrandColors.background,
        selection: "rgba(119, 146, 172, 0.35)",
        black: novakubeBrandColors.background,
        red: novakubeBrandColors.danger,
        green: novakubeBrandColors.success,
        yellow: novakubeBrandColors.warning,
        blue: novakubeBrandColors.accent,
        magenta: "#A39CD6",
        cyan: novakubeBrandColors.accentFocus,
        white: novakubeBrandColors.textPrimary,
        brightBlack: novakubeBrandColors.textMuted,
        brightRed: "#E28B8F",
        brightGreen: "#7FD0AD",
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
