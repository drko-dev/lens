/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import cursorThemeInjectable, { cursorThemeName } from "../cursor.injectable";
import cursorMonoThemeInjectable from "../cursor-mono.injectable";
import midnightGraphiteThemeInjectable from "../midnight-graphite.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("Cursor — Kubetail design as default", () => {
  it("registers Cursor as the only default, leaving other themes selectable", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorThemeInjectable);
    const themes = di.injectMany(lensThemeDeclarationInjectionToken);
    expect(cursor.name).toBe(cursorThemeName);
    expect(cursor.isDefault).toBe(true);
    expect(cursor.type).toBe("dark");
    expect(di.inject(defaultLensThemeInjectable).name).toBe(cursorThemeName);
    expect(themes.filter(t => t.isDefault)).toHaveLength(1);
    expect(themes.map(t => t.name)).toContain("Midnight Graphite");
    expect(themes.map(t => t.name)).toContain("Cursor Team");
  });

  it("uses graphite as primary chrome and action palette, retaining safety colors", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorThemeInjectable);
    const kubetailTheme = di.inject(midnightGraphiteThemeInjectable);
    expect(cursor.colors).not.toEqual(kubetailTheme.colors);
    expect(cursor.terminalColors.background).toBe("#151719");
    expect(cursor.colors.mainBackground).toBe("#151719");
    expect(cursor.colors.surfaceRaised).toBe("#202225");
    expect(cursor.colors.primary).toBe("#C5C9CE");
    expect(cursor.colors.actionPrimary).toBe("#41464C");
    expect(cursor.colors.colorWarning).toBe("#E0AE62");
    expect(cursor.colors.colorError).toBe("#F05353");
    expect(cursor.colors.envProduction).toBe("#EF4444");
  });

  it("toggles the Cursor body selector without leaving previous theme classes", () => {
    const di = getDiForUnitTesting();
    di.override(applyLensThemeInjectable, inner => applyLensThemeInjectable.instantiate(inner));
    const apply = di.inject(applyLensThemeInjectable);
    const cursor = di.inject(cursorThemeInjectable);
    const cursorTeam = di.inject(cursorMonoThemeInjectable);
    const state = di.inject(userPreferencesStateInjectable);
    const activeTheme = di.inject(activeThemeInjectable);

    document.body.className = "";
    apply(cursor);
    expect(document.body.classList.contains("theme-cursor")).toBe(true);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#151719");
    state.colorTheme = cursorThemeName;
    expect(activeTheme.get().name).toBe(cursorThemeName);

    apply(cursorTeam);
    expect(document.body.classList.contains("theme-cursor")).toBe(false);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(true);
  });
});
