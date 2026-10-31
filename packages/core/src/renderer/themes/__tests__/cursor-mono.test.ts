/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import cursorMonoThemeInjectable, { cursorMonoThemeName } from "../cursor-mono.injectable";
import midnightGraphiteThemeInjectable, { midnightGraphiteThemeName } from "../midnight-graphite.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("Cursor Team theme", () => {
  it("registers as a selectable non-default theme alongside Midnight Graphite", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorMonoThemeInjectable);
    const midnight = di.inject(midnightGraphiteThemeInjectable);
    const defaultTheme = di.inject(defaultLensThemeInjectable);
    const themes = di.injectMany(lensThemeDeclarationInjectionToken);

    expect(cursor.name).toBe(cursorMonoThemeName);
    expect(cursor.isDefault).toBe(false);
    expect(cursor.type).toBe("dark");
    expect(midnight.isDefault).toBe(true);
    expect(defaultTheme.name).toBe(midnightGraphiteThemeName);
    expect(themes.map(t => t.name)).toContain(cursorMonoThemeName);
  });

  it("uses muted Cursor-like charcoal palette with single blue accent", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorMonoThemeInjectable);

    expect(cursor.colors.mainBackground).toBe("#121212");
    expect(cursor.colors.primary).toBe("#0078D4");
    expect(cursor.colors.textColorPrimary).toBe("#B8B8B8");
    expect(cursor.colors.grey100).toBe("#121212");
    expect(cursor.colors.grey80).toBe("#161616");
  });

  it("applies and clears theme-cursor-mono body class", () => {
    const di = getDiForUnitTesting();

    di.override(applyLensThemeInjectable, (di) => applyLensThemeInjectable.instantiate(di));

    const apply = di.inject(applyLensThemeInjectable);
    const cursor = di.inject(cursorMonoThemeInjectable);
    const midnight = di.inject(midnightGraphiteThemeInjectable);
    const state = di.inject(userPreferencesStateInjectable);
    const activeTheme = di.inject(activeThemeInjectable);

    document.body.className = "";
    apply(cursor);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(true);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(false);

    state.colorTheme = cursorMonoThemeName;
    expect(activeTheme.get().name).toBe(cursorMonoThemeName);

    apply(midnight);
    expect(document.body.classList.contains("theme-cursor-mono")).toBe(false);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(true);
  });
});
