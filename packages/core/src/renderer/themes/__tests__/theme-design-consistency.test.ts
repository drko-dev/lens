/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import cursorThemeInjectable from "../cursor.injectable";
import midnightGraphiteThemeInjectable from "../midnight-graphite.injectable";
import lensOfficialLightThemeInjectable from "../lens-official-light.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";

describe("H1-H6 semantic design consistency", () => {
  it("uses Cursor by default and neutral graphite without hiding safety colors", () => {
    const di = getDiForUnitTesting();
    const cursor = di.inject(cursorThemeInjectable);
    const kubetail = di.inject(midnightGraphiteThemeInjectable);
    expect(di.inject(defaultLensThemeInjectable).name).toBe("Cursor");
    expect(cursor.colors.surface).not.toBe(kubetail.colors.surface);
    expect(cursor.colors.surfaceRaised).not.toBe(kubetail.colors.surfaceRaised);
    expect(cursor.colors.actionPrimary).not.toBe(kubetail.colors.actionPrimary);
    expect(cursor.colors.borderDefault).not.toBe(kubetail.colors.borderDefault);
    expect(cursor.colors.statusWarning).toBe(kubetail.colors.statusWarning);
  });

  it("updates design tokens across switches without residual values", () => {
    const di = getDiForUnitTesting();
    di.override(applyLensThemeInjectable, inner => applyLensThemeInjectable.instantiate(inner));
    const apply = di.inject(applyLensThemeInjectable);
    const cursor = di.inject(cursorThemeInjectable);
    const midnight = di.inject(midnightGraphiteThemeInjectable);
    const light = di.inject(lensOfficialLightThemeInjectable);
    const root = document.documentElement.style;

    apply(cursor);
    expect(document.body.classList.contains("theme-cursor")).toBe(true);
    expect(root.getPropertyValue("--surface")).toBe("#151719");
    expect(root.getPropertyValue("--surface-raised")).toBe("#202225");
    expect(root.getPropertyValue("--action-primary")).toBe("#41464C");

    apply(light);
    expect(document.body.classList.contains("theme-cursor")).toBe(false);
    expect(root.getPropertyValue("--surface")).toBe(light.colors.mainBackground);
    expect(root.getPropertyValue("--action-primary")).toBe(light.colors.buttonPrimaryBackground);

    apply(midnight);
    expect(root.getPropertyValue("--surface")).toBe(midnight.colors.surface);
    expect(root.getPropertyValue("--action-primary")).toBe(midnight.colors.actionPrimary);
    expect(root.getPropertyValue("--status-error")).toBe(midnight.colors.statusError);
  });
});
