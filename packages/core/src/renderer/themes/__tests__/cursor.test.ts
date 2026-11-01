/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import cursorThemeInjectable, { cursorThemeName } from "../cursor.injectable";
import cursorMonoThemeInjectable, { cursorMonoThemeName } from "../cursor-mono.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("Cursor theme", () => {
  it("registers as the default theme and keeps Cursor Team selectable", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorThemeInjectable);
    const defaultTheme = di.inject(defaultLensThemeInjectable);
    const themes = di.injectMany(lensThemeDeclarationInjectionToken);

    expect(cursor.name).toBe(cursorThemeName);
    expect(cursor.isDefault).toBe(true);
    expect(cursor.type).toBe("dark");
    expect(defaultTheme.name).toBe(cursorThemeName);
    expect(themes.filter(theme => theme.isDefault)).toHaveLength(1);
    expect(themes.map(theme => theme.name)).toContain(cursorThemeName);
  });

  it("uses near-black surfaces, muted secondary text, and one accent", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorThemeInjectable);

    expect(cursor.colors.mainBackground).toBe("#141414");
    expect(cursor.colors.sidebarBackground).toBe("#141414");
    expect(cursor.colors.layoutBackground).toBe("#141414");
    expect(cursor.colors.dialogBackground).toBe("#1C1C1C");
    expect(cursor.colors.tooltipBackground).toBe("#1C1C1C");
    expect(cursor.colors.menuSelectedOptionBgc).toBe("#1C1C1C");
    expect(cursor.colors.textColorPrimary).toBe("#C8C8C8");
    expect(cursor.colors.textColorSecondary).toBe("#989898");
    expect(cursor.colors.primary).toBe("#E8E8E8");
    expect(cursor.colors.blue).toBe("#E8E8E8");
    expect(cursor.colors.navSelectedBackground).toBe("#F0F0F01E");
    expect(cursor.colors.hrColor).toBe("#F0F0F013");
    expect(cursor.colors.envLocal).toBe("#989898");
    expect(cursor.colors.helmStableRepo).toBe("#989898");
    expect(cursor.terminalColors.background).toBe("#141414");
    expect(cursor.terminalColors.foreground).toBe("#C8C8C8");
    expect(cursor.terminalColors.blue).toBe("#E8B84A");
    expect(cursor.terminalColors.yellow).toBe("#FFD166");
    expect(cursor.colors.sidebarItemHoverBackground).toBe("#242424");
    expect(cursor.colors.colorWarning).toBe("#242424");
    expect(cursor.colors.magenta).toBe("#242424");
    expect(cursor.colors.helmIncubatorRepo).toBe("#242424");
    expect(cursor.terminalColors.magenta).toBe("#F071C0");
    expect(cursor.terminalColors.cyan).toBe("#3DDC97");
    expect(cursor.terminalColors.brightMagenta).toBe("#FF8AD4");
    expect(cursor.terminalColors.brightRed).toBe("#F07178");
    expect(cursor.terminalColors.brightCyan).toBe("#5EEAAD");
    expect(cursor.terminalColors.red).toBe("#F07178");
    expect(cursor.terminalColors.brightBlack).toBe("#989898");
    expect(cursor.colors.tableBgcStripe).toBe("#1C1C1C");
    expect(cursor.terminalColors.green).toBe("#7DDE92");
  });

  it("applies and clears the theme-cursor body class", () => {
    const di = getDiForUnitTesting();

    di.override(applyLensThemeInjectable, (inner) => applyLensThemeInjectable.instantiate(inner));

    const apply = di.inject(applyLensThemeInjectable);
    const cursor = di.inject(cursorThemeInjectable);
    const cursorTeam = di.inject(cursorMonoThemeInjectable);
    const state = di.inject(userPreferencesStateInjectable);
    const activeTheme = di.inject(activeThemeInjectable);

    document.body.className = "";
    apply(cursor);
    expect(document.body.classList.contains("theme-cursor")).toBe(true);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#141414");

    state.colorTheme = cursorThemeName;
    expect(activeTheme.get().name).toBe(cursorThemeName);

    apply(cursorTeam);
    expect(document.body.classList.contains("theme-cursor")).toBe(false);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(true);
  });
});
