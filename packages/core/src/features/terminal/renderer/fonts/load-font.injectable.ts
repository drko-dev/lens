/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { TerminalFont } from "./token";

export type LoadTerminalFont = (font: TerminalFont) => Promise<void>;

const loadTerminalFontInjectable = getInjectable({
  id: "load-terminal-font",
  instantiate: (): LoadTerminalFont => async (font) => {
    // Do NOT trust document.fonts.check() alone. On macOS it returns true for a
    // system/fallback face that merely matches the family name "RobotoMono",
    // which skips our packed TTF. That fallback has a much wider advance
    // (~11.3px vs ~7.2px at 12px) and makes xterm look letter-spaced.
    const fontFace = new FontFace(font.name, `url(${font.url})`);

    document.fonts.add(fontFace);
    await fontFace.load();
  },
  causesSideEffects: true,
});

export default loadTerminalFontInjectable;
