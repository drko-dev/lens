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
  it("registers as a selectable option and leaves Cursor Team as the only default", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorThemeInjectable);
    const defaultTheme = di.inject(defaultLensThemeInjectable);
    const themes = di.injectMany(lensThemeDeclarationInjectionToken);

    expect(cursor.name).toBe(cursorThemeName);
    expect(cursor.isDefault).toBe(false);
    expect(cursor.type).toBe("dark");
    expect(defaultTheme.name).toBe(cursorMonoThemeName);
    expect(themes.filter(theme => theme.isDefault)).toHaveLength(1);
    expect(themes.map(theme => theme.name)).toContain(cursorThemeName);
  });

  it("uses near-black surfaces, muted secondary text, and one accent", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorThemeInjectable);

    expect(cursor.colors.mainBackground).toBe("#1A1A1A");
    expect(cursor.colors.sidebarBackground).toBe("#202020");
    expect(cursor.colors.layoutBackground).toBe("#202020");
    expect(cursor.colors.textColorPrimary).toBe("#C8C8C8");
    expect(cursor.colors.textColorSecondary).toBe("#8E8E8E");
    expect(cursor.colors.primary).toBe("#D4D4D4");
    expect(cursor.colors.blue).toBe("#D4D4D4");
    expect(cursor.colors.envLocal).toBe("#8E8E8E");
    expect(cursor.colors.helmStableRepo).toBe("#8E8E8E");
    expect(cursor.terminalColors.background).toBe("#1A1A1A");
    expect(cursor.terminalColors.foreground).toBe("#C8C8C8");
    expect(cursor.terminalColors.blue).toBe("#D4B483");
    expect(cursor.terminalColors.green).toBe("#8FBF7F");
    expect(cursor.terminalColors.red).toBe("#E07A7A");
    expect(cursor.colors.hrColor).toBe("#FFFFFF14");
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
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#1A1A1A");

    state.colorTheme = cursorThemeName;
    expect(activeTheme.get().name).toBe(cursorThemeName);

    apply(cursorTeam);
    expect(document.body.classList.contains("theme-cursor")).toBe(false);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(true);
  });
});
