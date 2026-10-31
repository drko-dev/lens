/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps — Midnight Graphite (refined).
// Cool graphite depth, steel-blue accent, crisp hierarchy, low-glare surfaces.
import { getInjectable } from "@ogre-tools/injectable";
import lensDarkThemeInjectable from "./lens-dark.injectable";
import lensOfficialDarkThemeInjectable from "./lens-official-dark.injectable";
import { lensThemeDeclarationInjectionToken } from "./declaration";

export const midnightGraphiteThemeName = "Midnight Graphite";

/**
 * Refined graphite scale: deeper blacks, clearer mid-tones, brighter ink.
 * Cool blue undertone throughout — never purple, never warm cream.
 */
const midnightColors = {
  grey100: "#0A0E14",
  grey80: "#10161F",
  grey70: "#141B26",
  grey60: "#2C3848",
  grey40: "#182231",
  grey30: "#222D3C",
  grey25: "#3A4A5E",
  grey20: "#A8B4C6",
  grey10: "#F3F6FB",
  grey80Alpha85: "#10161Fd9",

  primary: "#7BA3E3",
  primaryHover: "#9BBCF0",
  primaryMuted: "#7BA3E333",
  success: "#4FD39A",
  notice: "#D8B878",
  warning: "#E0AE62",
  critical: "#F05353",
  code: "#7BA3E3",
};

const midnightGraphiteThemeInjectable = getInjectable({
  id: "openlens-devops-midnight-graphite-theme",
  instantiate: (di) => {
    const classic = di.inject(lensDarkThemeInjectable);
    const official = di.inject(lensOfficialDarkThemeInjectable);

    return {
      ...classic,
      name: midnightGraphiteThemeName,
      description: "Refined dark graphite UI — dense, low-glare, steel-blue accent",
      author: "Gustavo Marcon",
      isDefault: false,
      colors: {
        ...official.colors,
        ...classic.colors,
        blue: midnightColors.primary,
        primary: midnightColors.primary,
        magenta: "#A39CD6",
        golden: midnightColors.notice,
        halfGray: "#8795A580",

        textColorPrimary: "#E4EBF4",
        textColorSecondary: midnightColors.grey20,
        textColorTertiary: "#8B98AB",
        textColorAccent: midnightColors.grey10,
        textColorDimmed: "#6F7D91",

        borderColor: midnightColors.grey60,
        borderFaintColor: "#1E2836",
        mainBackground: midnightColors.grey100,
        secondaryBackground: midnightColors.grey80,
        backgroundPrimary: midnightColors.grey80,
        backgroundSecondary: midnightColors.grey100,
        contentColor: midnightColors.grey70,
        layoutBackground: "#0E141D",
        layoutTabsBackground: midnightColors.grey80,
        layoutTabsActiveColor: midnightColors.grey10,
        layoutTabsLineColor: midnightColors.grey60,

        sidebarBackground: midnightColors.grey80,
        sidebarLogoBackground: midnightColors.grey80,
        sidebarActiveColor: midnightColors.grey10,
        sidebarSubmenuActiveColor: midnightColors.primary,
        sidebarItemHoverBackground: "#1A2433",

        badgeBackgroundColor: midnightColors.notice,
        buttonPrimaryBackground: "#5F8AD4",
        buttonDefaultBackground: midnightColors.grey30,
        buttonLightBackground: "#f1f1f1",
        buttonAccentBackground: "#C45B66",
        buttonDisabledBackground: "#5A6575",

        tableBgcStripe: "#0E141D",
        tableBgcSelected: "#1C2E44",
        tableHeaderBackground: midnightColors.grey40,
        tableHeaderColor: "#C9D6E8",
        tableSelectedRowColor: midnightColors.grey10,

        colorSuccess: midnightColors.success,
        colorOk: midnightColors.success,
        colorInfo: midnightColors.primary,
        colorError: midnightColors.critical,
        colorSoftError: "#F17A7F",
        colorWarning: midnightColors.warning,
        colorVague: midnightColors.grey30,
        colorTerminated: "#6F7D91",

        dockHeadBackground: "#121925",
        dockInfoBackground: midnightColors.grey80,
        dockInfoBorderColor: "#273445",
        dockEditorBackground: midnightColors.grey100,
        dockEditorTag: "#B4C5DA",
        dockEditorKeyword: midnightColors.grey10,
        dockEditorComment: "#8B98AB",
        dockEditorActiveLineBackground: "#162233",
        dockBadgeBackground: "#1C2E44",
        dockTabBorderColor: midnightColors.grey60,
        dockTabActiveBackground: "#1A2A3C",
        logsBackground: midnightColors.grey100,
        logsForeground: "#E4EBF4",
        logRowHoverBackground: "#162233",

        dialogTextColor: "#E4EBF4",
        dialogBackground: midnightColors.grey70,
        dialogHeaderBackground: "#161E2A",
        dialogFooterBackground: midnightColors.grey70,
        drawerTogglerBackground: "#1A2433",
        drawerTitleText: midnightColors.grey10,
        drawerSubtitleBackground: "#1A2433",
        drawerItemNameColor: midnightColors.grey20,
        drawerItemValueColor: "#E4EBF4",

        clusterMenuBackground: midnightColors.grey70,
        clusterMenuBorderColor: midnightColors.grey60,
        clusterMenuCellBackground: "#161E2A",
        clusterSettingsBackground: midnightColors.grey70,
        addClusterIconColor: midnightColors.primary,
        boxShadow: "#00000055",
        iconActiveColor: midnightColors.grey10,
        iconActiveBackground: midnightColors.primaryMuted,
        filterAreaBackground: "#121925",

        chartLiveBarBackground: "#0A0E1480",
        chartStripesColor: "#FFFFFF09",
        chartCapacityColor: "#3A4A5E",
        pieChartDefaultColor: midnightColors.grey30,

        inputOptionHoverColor: "#E4EBF4",
        inputOptionSelectedColor: "#1A2A3C",
        inputControlBackground: "#0C121A",
        inputControlBorder: midnightColors.grey60,
        inputControlHoverBorder: midnightColors.primary,

        lineProgressBackground: midnightColors.grey30,
        radioActiveBackground: midnightColors.grey30,
        menuActiveBackground: "#2A4163",
        menuSelectedOptionBgc: "#1A2A3C",
        canvasBackground: midnightColors.grey100,
        scrollBarColor: "#3A4A5E",
        scrollBarHoverColor: "#53657C",
        settingsBackground: midnightColors.grey70,
        settingsColor: midnightColors.grey20,
        navSelectedBackground: "#1A2A3C",
        navHoverColor: midnightColors.grey10,
        hrColor: "#FFFFFF14",
        tooltipBackground: "#1A222E",
        linkColor: midnightColors.primary,
        linkHoverColor: midnightColors.primaryHover,

        itemListToolbarBackground: midnightColors.grey80,
        itemListBackground: midnightColors.grey100,
        modalHeaderBg: midnightColors.grey80,
        modalContentBg: midnightColors.grey70,
        modalFooterBg: midnightColors.grey80,
        modalDividerColor: midnightColors.grey60,
        modalTextColor: "#E4EBF4",
        columnResizerColor: midnightColors.grey60,

        grey100: midnightColors.grey100,
        grey80: midnightColors.grey80,
        grey70: midnightColors.grey70,
        grey60: midnightColors.grey60,
        grey40: midnightColors.grey40,
        grey30: midnightColors.grey30,
        grey25: midnightColors.grey25,
        grey20: midnightColors.grey20,
        grey10: midnightColors.grey10,
        grey80Alpha85: midnightColors.grey80Alpha85,

        surfaceGradient: "linear-gradient(180deg, rgba(123, 163, 227, 0.10) 0%, rgba(10, 14, 20, 0) 42%)",
        successTint: "rgba(79, 211, 154, 0.14)",
        warningTint: "rgba(224, 174, 98, 0.14)",
        criticalTint: "rgba(240, 83, 83, 0.14)",

        envProduction: "#EF4444",
        envProductionSoft: "rgba(239, 68, 68, 0.16)",
        envStaging: "#F59E0B",
        envStagingSoft: "rgba(245, 158, 11, 0.16)",
        envDevelopment: "#10B981",
        envDevelopmentSoft: "rgba(16, 185, 129, 0.16)",
        envTesting: "#8B5CF6",
        envTestingSoft: "rgba(139, 92, 246, 0.16)",
        envLocal: "#06B6D4",
        envLocalSoft: "rgba(6, 182, 212, 0.16)",
        envCustom: "#3B82F6",
        envCustomSoft: "rgba(59, 130, 246, 0.16)",
        envNone: "#64748B",
        envNoneSoft: "rgba(100, 116, 139, 0.16)",
      },
      terminalColors: {
        ...official.terminalColors,
        ...classic.terminalColors,
        background: midnightColors.grey100,
        foreground: "#E4EBF4",
        cursor: midnightColors.primary,
        cursorAccent: midnightColors.grey100,
        selection: "#7BA3E340",
        black: "#0A0E14",
        red: "#F07178",
        green: midnightColors.success,
        yellow: midnightColors.warning,
        blue: midnightColors.primary,
        magenta: "#B4AEE0",
        cyan: "#5BC4C6",
        white: "#E4EBF4",
        brightBlack: "#6F7D91",
        brightRed: "#FF8B90",
        brightGreen: "#6EE7B0",
        brightYellow: "#F0C674",
        brightBlue: midnightColors.primaryHover,
        brightMagenta: "#C9C3F0",
        brightCyan: "#7DD8DA",
        brightWhite: midnightColors.grey10,
      },
    };
  },
  injectionToken: lensThemeDeclarationInjectionToken,
});

export default midnightGraphiteThemeInjectable;
