/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps — Cursor Team (default theme).
// Near-monochrome charcoal + a single blue accent.
import { getInjectable } from "@ogre-tools/injectable";
import lensDarkThemeInjectable from "./lens-dark.injectable";
import lensOfficialDarkThemeInjectable from "./lens-official-dark.injectable";
import { lensThemeDeclarationInjectionToken } from "./declaration";

export const cursorMonoThemeName = "Cursor Team";

const cursorColors = {
  // Muted Cursor charcoal — softer contrast, no bright whites
  grey100: "#121212",
  grey80: "#161616",
  grey70: "#1A1A1A",
  grey60: "#2A2A2A",
  grey40: "#1E1E1E",
  grey30: "#262626",
  grey25: "#383838",
  grey20: "#8A8A8A",
  grey10: "#D0D0D0",
  grey80Alpha85: "#161616d9",

  primary: "#0078D4",
  primaryHover: "#1A8AE8",
  primaryMuted: "#0078D433",
  success: "#3FA266",
  notice: "#8A8A8A",
  warning: "#D2943E",
  critical: "#F85149",
  code: "#0078D4",
};

const cursorMonoThemeInjectable = getInjectable({
  id: "openlens-devops-cursor-mono-theme",
  instantiate: (di) => {
    const classic = di.inject(lensDarkThemeInjectable);
    const official = di.inject(lensOfficialDarkThemeInjectable);

    return {
      ...classic,
      name: cursorMonoThemeName,
      description: "Cursor Team — mono dark UI, charcoal surfaces, single blue accent",
      author: "Gustavo Marcon",
      isDefault: true,
      colors: {
        ...official.colors,
        ...classic.colors,
        blue: cursorColors.primary,
        primary: cursorColors.primary,
        magenta: "#8A8A8A",
        golden: cursorColors.notice,
        halfGray: "#6E6E6E80",

        textColorPrimary: "#B8B8B8",
        textColorSecondary: cursorColors.grey20,
        textColorTertiary: "#757575",
        textColorAccent: cursorColors.grey10,
        textColorDimmed: "#5C5C5C",

        borderColor: cursorColors.grey60,
        borderFaintColor: "#FFFFFF14",
        mainBackground: cursorColors.grey100,
        secondaryBackground: cursorColors.grey80,
        backgroundPrimary: cursorColors.grey80,
        backgroundSecondary: cursorColors.grey100,
        contentColor: cursorColors.grey70,
        layoutBackground: cursorColors.grey80,
        layoutTabsBackground: cursorColors.grey80,
        layoutTabsActiveColor: cursorColors.grey10,
        layoutTabsLineColor: cursorColors.grey60,

        sidebarBackground: cursorColors.grey80,
        sidebarLogoBackground: cursorColors.grey80,
        sidebarActiveColor: cursorColors.grey10,
        sidebarSubmenuActiveColor: cursorColors.primary,
        sidebarItemHoverBackground: "#222222",

        badgeBackgroundColor: cursorColors.grey25,
        buttonPrimaryBackground: cursorColors.primary,
        buttonDefaultBackground: cursorColors.grey30,
        buttonLightBackground: "#f1f1f1",
        buttonAccentBackground: "#C45B66",
        buttonDisabledBackground: "#5A5A5A",

        tableBgcStripe: "#171717",
        tableBgcSelected: "#163B5C",
        tableHeaderBackground: cursorColors.grey40,
        tableHeaderColor: "#B0B0B0",
        tableSelectedRowColor: cursorColors.grey10,

        colorSuccess: cursorColors.success,
        colorOk: cursorColors.success,
        colorInfo: cursorColors.primary,
        colorError: cursorColors.critical,
        colorSoftError: "#F17A7F",
        colorWarning: cursorColors.warning,
        colorVague: cursorColors.grey30,
        colorTerminated: "#6E6E6E",

        dockHeadBackground: cursorColors.grey80,
        dockInfoBackground: cursorColors.grey80,
        dockInfoBorderColor: cursorColors.grey60,
        dockEditorBackground: cursorColors.grey100,
        dockEditorTag: "#B0B0B0",
        dockEditorKeyword: cursorColors.grey10,
        dockEditorComment: "#6E6E6E",
        dockEditorActiveLineBackground: "#252525",
        dockBadgeBackground: "#163B5C",
        dockTabBorderColor: cursorColors.grey60,
        dockTabActiveBackground: cursorColors.grey30,
        logsBackground: cursorColors.grey100,
        logsForeground: "#B8B8B8",
        logRowHoverBackground: "#222222",

        dialogTextColor: "#B8B8B8",
        dialogBackground: cursorColors.grey70,
        dialogHeaderBackground: cursorColors.grey40,
        dialogFooterBackground: cursorColors.grey70,
        drawerTogglerBackground: "#252525",
        drawerTitleText: cursorColors.grey10,
        drawerSubtitleBackground: "#252525",
        drawerItemNameColor: cursorColors.grey20,
        drawerItemValueColor: "#B8B8B8",

        clusterMenuBackground: cursorColors.grey70,
        clusterMenuBorderColor: cursorColors.grey60,
        clusterMenuCellBackground: cursorColors.grey40,
        clusterSettingsBackground: cursorColors.grey70,
        addClusterIconColor: cursorColors.primary,
        boxShadow: "#00000066",
        iconActiveColor: cursorColors.grey10,
        iconActiveBackground: cursorColors.primaryMuted,
        filterAreaBackground: cursorColors.grey80,

        chartLiveBarBackground: "#14141480",
        chartStripesColor: "#FFFFFF09",
        chartCapacityColor: cursorColors.grey25,
        pieChartDefaultColor: cursorColors.grey30,

        inputOptionHoverColor: "#B8B8B8",
        inputOptionSelectedColor: "#163B5C",
        inputControlBackground: "#2A2A2A",
        inputControlBorder: "#383838",
        inputControlHoverBorder: cursorColors.primary,

        lineProgressBackground: cursorColors.grey30,
        radioActiveBackground: cursorColors.grey30,
        menuActiveBackground: "#163B5C",
        menuSelectedOptionBgc: "#222222",
        canvasBackground: cursorColors.grey100,
        scrollBarColor: "#383838",
        scrollBarHoverColor: "#555555",
        settingsBackground: cursorColors.grey70,
        settingsColor: cursorColors.grey20,
        navSelectedBackground: "#222222",
        navHoverColor: cursorColors.grey10,
        hrColor: "#FFFFFF12",
        tooltipBackground: "#262626",
        linkColor: cursorColors.primary,
        linkHoverColor: cursorColors.primaryHover,

        itemListToolbarBackground: cursorColors.grey80,
        itemListBackground: cursorColors.grey100,
        modalHeaderBg: cursorColors.grey80,
        modalContentBg: cursorColors.grey70,
        modalFooterBg: cursorColors.grey80,
        modalDividerColor: cursorColors.grey60,
        modalTextColor: "#B8B8B8",
        columnResizerColor: "#FFFFFF18",

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

        surfaceGradient: "linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(20, 20, 20, 0) 40%)",
        successTint: "rgba(63, 162, 102, 0.14)",
        warningTint: "rgba(210, 148, 62, 0.14)",
        criticalTint: "rgba(248, 81, 73, 0.14)",

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
        background: cursorColors.grey100,
        foreground: "#B8B8B8",
        cursor: cursorColors.primary,
        cursorAccent: cursorColors.grey100,
        selection: "#0078D440",
        black: "#121212",
        red: "#F85149",
        green: cursorColors.success,
        yellow: cursorColors.warning,
        blue: cursorColors.primary,
        magenta: "#8A8A8A",
        cyan: "#8A8A8A",
        white: "#B8B8B8",
        brightBlack: "#6E6E6E",
        brightRed: "#FF7B72",
        brightGreen: "#56D364",
        brightYellow: "#E3B341",
        brightBlue: cursorColors.primaryHover,
        brightMagenta: "#A0A0A0",
        brightCyan: "#A0A0A0",
        brightWhite: cursorColors.grey10,
      },
    };
  },
  injectionToken: lensThemeDeclarationInjectionToken,
});

export default cursorMonoThemeInjectable;
