/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import cursorMonoThemeInjectable, { cursorMonoThemeName } from "../cursor-mono.injectable";
import { cursorThemeName } from "../cursor.injectable";
import midnightGraphiteThemeInjectable, { midnightGraphiteThemeName } from "../midnight-graphite.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("Cursor Team theme", () => {
  it("stays selectable while Cursor is the only default", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorMonoThemeInjectable);
    const midnight = di.inject(midnightGraphiteThemeInjectable);
    const defaultTheme = di.inject(defaultLensThemeInjectable);
    const themes = di.injectMany(lensThemeDeclarationInjectionToken);

    expect(cursor.name).toBe(cursorMonoThemeName);
    expect(cursor.isDefault).toBe(false);
    expect(cursor.type).toBe("dark");
    expect(midnight.isDefault).toBe(false);
    expect(defaultTheme.name).toBe(cursorThemeName);
    expect(themes.filter(theme => theme.isDefault)).toHaveLength(1);
    expect(themes.map(t => t.name)).toContain(cursorMonoThemeName);
  });

  it("uses soft Midnight Graphite surfaces with restored status accents", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorMonoThemeInjectable);

    // Soft cool graphite (not pure Cursor #141414/#181818 void)
    expect(cursor.colors.mainBackground).toBe("#121925");
    expect(cursor.colors.sidebarBackground).toBe("#161E2A");
    expect(cursor.colors.layoutBackground).toBe("#161E2A");
    // Status accents: Midnight steel/green — not washed Nord pastels
    expect(cursor.colors.primary).toBe("#7BA3E3");
    expect(cursor.colors.colorSuccess).toBe("#3DBF88");
    expect(cursor.colors.colorInfo).toBe("#7BA3E3");
    expect(cursor.colors.textColorAccent).toBe("#F3F6FB");
    expect(cursor.colors.hrColor).toBe("#FFFFFF14");
    expect(cursor.colors.grey100).toBe("#121925");
    expect(cursor.colors.grey80).toBe("#161E2A");
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
