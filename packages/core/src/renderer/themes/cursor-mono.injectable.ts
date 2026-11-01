/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps — Cursor Team (default theme).
// Calibrated to Cursor.app "Cursor Dark" workbench tokens
// (extensions/theme-cursor/themes/cursor-dark-color-theme.json).
import { getInjectable } from "@ogre-tools/injectable";
import lensDarkThemeInjectable from "./lens-dark.injectable";
import lensOfficialDarkThemeInjectable from "./lens-official-dark.injectable";
import { lensThemeDeclarationInjectionToken } from "./declaration";

export const cursorMonoThemeName = "Cursor Team";

/**
 * Cursor Team chrome with Midnight Graphite softness:
 * pure Cursor Dark (#141414/#181818) read as too black; cool graphite
 * undertones from Midnight Graphite keep hierarchy without the harsh void.
 * Status accents restored to Midnight saturation (Nord pastels looked washed).
 */
const cursorColors = {
  grey100: "#121925", // editor / main — Midnight dockHead (was #181818)
  grey80: "#161E2A", // chrome: sidebar / status (was #141414)
  grey70: "#1A2433", // lifted panels
  grey60: "#2C3848", // separators (Midnight)
  grey40: "#1C2A3A", // cells / header strips
  grey30: "#222D3C", // raised controls
  grey25: "#3A4A5E",
  grey20: "#A8B4C6",
  grey10: "#F3F6FB",
  grey80Alpha85: "#161E2Ad9",

  // Midnight steel / status — richer than Nord #81A1C1 / #A3BE8C pastels
  primary: "#7BA3E3",
  primaryHover: "#9BBCF0",
  primaryMuted: "#7BA3E333",
  badge: "#5F8AD4",
  success: "#3DBF88", // slightly deeper than MG #4FD39A (less washed)
  notice: "#D8B878",
  warning: "#E0AE62",
  critical: "#E05656",
  code: "#7BA3E3",

  hairline: "#FFFFFF14",
  selection: "#1C2E44",
  hover: "#1A2433",
};

const cursorMonoThemeInjectable = getInjectable({
  id: "openlens-devops-cursor-mono-theme",
  instantiate: (di) => {
    const classic = di.inject(lensDarkThemeInjectable);
    const official = di.inject(lensOfficialDarkThemeInjectable);

    return {
      ...classic,
      name: cursorMonoThemeName,
      description: "Cursor Team — Cursor Dark workbench surfaces, hairlines, steel accent",
      author: "Gustavo Marcon",
      isDefault: false,
      colors: {
        ...official.colors,
        ...classic.colors,
        blue: cursorColors.primary,
        primary: cursorColors.primary,
        magenta: "#B48EAD",
        golden: cursorColors.warning,
        halfGray: "#6E6E6E80",

        textColorPrimary: "#E4EBF4",
        textColorSecondary: cursorColors.grey20,
        textColorTertiary: "#8B98AB",
        textColorAccent: cursorColors.grey10,
        textColorDimmed: "#6F7D91",

        borderColor: cursorColors.grey60,
        borderFaintColor: "#1E2836",
        mainBackground: cursorColors.grey100,
        secondaryBackground: cursorColors.grey80,
        backgroundPrimary: cursorColors.grey80,
        backgroundSecondary: cursorColors.grey100,
        contentColor: cursorColors.grey100,
        layoutBackground: cursorColors.grey80,
        layoutTabsBackground: cursorColors.grey80,
        layoutTabsActiveColor: cursorColors.grey10,
        layoutTabsLineColor: cursorColors.hairline,

        sidebarBackground: cursorColors.grey80,
        sidebarLogoBackground: cursorColors.grey80,
        sidebarActiveColor: cursorColors.grey10,
        sidebarSubmenuActiveColor: cursorColors.primary,
        sidebarItemHoverBackground: cursorColors.hover,

        badgeBackgroundColor: cursorColors.badge,
        buttonPrimaryBackground: "#5F8AD4",
        buttonDefaultBackground: cursorColors.grey30,
        buttonLightBackground: "#f1f1f1",
        buttonAccentBackground: cursorColors.critical,
        buttonDisabledBackground: "#5A6575",

        tableBgcStripe: "#0E141D",
        tableBgcSelected: cursorColors.selection,
        tableHeaderBackground: cursorColors.grey40,
        tableHeaderColor: "#C9D6E8",
        tableSelectedRowColor: cursorColors.grey10,

        colorSuccess: cursorColors.success,
        colorOk: cursorColors.success,
        colorInfo: cursorColors.primary,
        colorError: cursorColors.critical,
        colorSoftError: "#D08770",
        colorWarning: cursorColors.warning,
        colorVague: cursorColors.grey30,
        colorTerminated: "#6E6E6E",

        dockHeadBackground: cursorColors.grey80,
        dockInfoBackground: cursorColors.grey80,
        dockInfoBorderColor: cursorColors.hairline,
        dockEditorBackground: cursorColors.grey100,
        dockEditorTag: "#B0B0B0",
        dockEditorKeyword: cursorColors.grey10,
        dockEditorComment: "#6E6E6E",
        dockEditorActiveLineBackground: "#222222",
        dockBadgeBackground: cursorColors.selection,
        dockTabBorderColor: cursorColors.hairline,
        dockTabActiveBackground: cursorColors.grey100,
        logsBackground: cursorColors.grey100,
        logsForeground: "#E8E8E8",
        logRowHoverBackground: cursorColors.hover,

        dialogTextColor: "#E8E8E8",
        dialogBackground: cursorColors.grey70,
        dialogHeaderBackground: cursorColors.grey80,
        dialogFooterBackground: cursorColors.grey70,
        drawerTogglerBackground: cursorColors.grey30,
        drawerTitleText: cursorColors.grey10,
        drawerSubtitleBackground: cursorColors.grey30,
        drawerItemNameColor: cursorColors.grey20,
        drawerItemValueColor: "#E8E8E8",

        clusterMenuBackground: cursorColors.grey80,
        clusterMenuBorderColor: cursorColors.hairline,
        clusterMenuCellBackground: cursorColors.grey40,
        clusterSettingsBackground: cursorColors.grey70,
        addClusterIconColor: cursorColors.primary,
        boxShadow: "#00000000",
        iconActiveColor: cursorColors.grey10,
        iconActiveBackground: cursorColors.primaryMuted,
        filterAreaBackground: cursorColors.grey80,

        chartLiveBarBackground: "#14141480",
        chartStripesColor: "#FFFFFF09",
        chartCapacityColor: cursorColors.grey25,
        pieChartDefaultColor: cursorColors.grey30,

        inputOptionHoverColor: "#E8E8E8",
        inputOptionSelectedColor: cursorColors.selection,
        inputControlBackground: "#F0F0F00A",
        inputControlBorder: cursorColors.hairline,
        inputControlHoverBorder: "#F0F0F026",

        lineProgressBackground: cursorColors.grey30,
        radioActiveBackground: cursorColors.grey30,
        menuActiveBackground: cursorColors.selection,
        menuSelectedOptionBgc: cursorColors.hover,
        canvasBackground: cursorColors.grey100,
        scrollBarColor: "#F0F0F011",
        scrollBarHoverColor: "#F0F0F026",
        settingsBackground: cursorColors.grey80,
        settingsColor: cursorColors.grey20,
        navSelectedBackground: cursorColors.selection,
        navHoverColor: cursorColors.grey10,
        hrColor: cursorColors.hairline,
        tooltipBackground: cursorColors.grey30,
        linkColor: cursorColors.primary,
        linkHoverColor: cursorColors.primaryHover,

        itemListToolbarBackground: cursorColors.grey80,
        itemListBackground: cursorColors.grey100,
        modalHeaderBg: cursorColors.grey80,
        modalContentBg: cursorColors.grey100,
        modalFooterBg: cursorColors.grey80,
        modalDividerColor: cursorColors.hairline,
        modalTextColor: "#E8E8E8",
        columnResizerColor: cursorColors.hairline,

        grey100: cursorColors.grey100,
        grey80: cursorColors.grey80,
        grey70: cursorColors.grey70,
        grey60: cursorColors.grey60,
        grey40: cursorColors.grey40,
        grey30: cursorColors.grey30,
        grey25: cursorColors.grey25,
        grey20: cursorColors.grey20,
        grey10: cursorColors.grey10,
        grey80Alpha85: cursorColors.grey80Alpha85,

        // Flat chrome — no loud sheen
        surfaceGradient: "none",
        successTint: "rgba(61, 191, 136, 0.16)",
        warningTint: "rgba(224, 174, 98, 0.14)",
        criticalTint: "rgba(224, 86, 86, 0.14)",

        envProduction: cursorColors.critical,
        envProductionSoft: "rgba(224, 86, 86, 0.16)",
        envStaging: cursorColors.warning,
        envStagingSoft: "rgba(224, 174, 98, 0.16)",
        envDevelopment: cursorColors.success,
        envDevelopmentSoft: "rgba(61, 191, 136, 0.16)",
        envTesting: "#A39CD6",
        envTestingSoft: "rgba(163, 156, 214, 0.16)",
        envLocal: cursorColors.primary,
        envLocalSoft: "rgba(123, 163, 227, 0.16)",
        envCustom: cursorColors.primary,
        envCustomSoft: "rgba(123, 163, 227, 0.16)",
        envNone: "#6F7D91",
        envNoneSoft: "rgba(111, 125, 145, 0.16)",
      },
      terminalColors: {
        ...official.terminalColors,
        ...classic.terminalColors,
        background: cursorColors.grey100,
        foreground: "#E4EBF4",
        cursor: cursorColors.primary,
        cursorAccent: cursorColors.grey100,
        selection: cursorColors.selection,
        black: "#0E141D",
        red: cursorColors.critical,
        green: cursorColors.success,
        yellow: cursorColors.warning,
        blue: cursorColors.primary,
        magenta: "#A39CD6",
        cyan: cursorColors.badge,
        white: "#E4EBF4",
        brightBlack: "#6F7D91",
        brightRed: "#F17A7F",
        brightGreen: "#4FD39A",
        brightYellow: cursorColors.warning,
        brightBlue: cursorColors.primaryHover,
        brightMagenta: "#A39CD6",
        brightCyan: cursorColors.badge,
        brightWhite: cursorColors.grey10,
      },
    };
  },
  injectionToken: lensThemeDeclarationInjectionToken,
});

export default cursorMonoThemeInjectable;
