/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps — NovaKube Theme.
// High-contrast runtime refresh of Concept A; original H9 brand assets remain unchanged.
import { getInjectable } from "@ogre-tools/injectable";
import midnightGraphiteThemeInjectable from "./midnight-graphite.injectable";
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

    return {
      ...baseTheme,
      name: novakubeThemeName,
      description: "NovaKube — high-contrast graphite (Concept A), clear text and blue accents",
      author: "OpenLens DevOps",
      isDefault: false,
      colors: {
        ...baseTheme.colors,

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
      },
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
