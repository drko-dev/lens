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

    expect(cursor.colors.mainBackground).toBe("#181818");
    expect(cursor.colors.sidebarBackground).toBe("#141414");
    expect(cursor.colors.layoutBackground).toBe("#141414");
    expect(cursor.colors.textColorSecondary).toBe("#9A9A9A");
    expect(cursor.colors.primary).toBe("#E8E8E8");
    expect(cursor.colors.blue).toBe("#E8E8E8");
    expect(cursor.colors.buttonPrimaryBackground).toBe("#E8E8E8");
    expect(cursor.colors.linkColor).toBe("#E8E8E8");
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
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#181818");

    state.colorTheme = cursorThemeName;
    expect(activeTheme.get().name).toBe(cursorThemeName);

    apply(cursorTeam);
    expect(document.body.classList.contains("theme-cursor")).toBe(false);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(true);
  });
});
