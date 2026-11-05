/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDockPosition, getDropPreviewBox } from "../drop-zones";

const box = { left: 100, top: 50, width: 400, height: 200 };

describe("drop zones", () => {
  it.each([
    [110, 150, "left"],
    [490, 150, "right"],
    [300, 55, "top"],
    [300, 245, "bottom"],
    [300, 150, "center"],
  ] as const)("pointer at (%i, %i) -> %s", (x, y, expected) => {
    expect(getDockPosition(box, x, y)).toBe(expected);
  });

  it("previews half of the target for side drops and the whole target for center", () => {
    expect(getDropPreviewBox(box, "left")).toEqual({ left: 100, top: 50, width: 200, height: 200 });
    expect(getDropPreviewBox(box, "bottom")).toEqual({ left: 100, top: 150, width: 400, height: 100 });
    expect(getDropPreviewBox(box, "center")).toEqual(box);
  });
});
