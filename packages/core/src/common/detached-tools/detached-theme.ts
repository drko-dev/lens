/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * R5-07: theme payload shared by the app window and detached windows.
 * Only allowlisted colour tokens and the light/dark type ever cross IPC. Both
 * the main process and the static preloads re-validate (preloads keep an inline copy).
 */
export const DETACHED_THEME_TOKENS = [
  "mainBackground", "secondaryBackground", "contentColor",
  "textColorPrimary", "textColorSecondary", "textColorTertiary", "textColorAccent", "textColorDimmed",
  "borderColor", "borderFaintColor",
  "primary", "colorSuccess", "colorOk", "colorWarning", "colorError", "colorSoftError", "colorInfo", "colorTerminated", "colorVague",
  "layoutBackground", "layoutTabsBackground", "badgeBackgroundColor",
  "dockHeadBackground", "dockInfoBackground", "dockInfoBorderColor", "dockTabBorderColor", "dockTabActiveBackground",
  "logsBackground", "logsForeground", "logRowHoverBackground",
  "tableHeaderBackground", "tableHeaderColor",
  "buttonDefaultBackground", "buttonPrimaryBackground", "buttonAccentBackground", "buttonDisabledBackground",
  "envProduction", "envProductionSoft", "envStaging", "envStagingSoft", "envDevelopment", "envDevelopmentSoft",
  "envTesting", "envTestingSoft", "envLocal", "envLocalSoft", "envCustom", "envCustomSoft", "envNone", "envNoneSoft",
  "terminalBackground", "terminalForeground", "terminalCursor", "terminalCursorAccent", "terminalSelection", "terminalSelectionForeground",
  "terminalBlack", "terminalRed", "terminalGreen", "terminalYellow", "terminalBlue", "terminalMagenta", "terminalCyan", "terminalWhite",
  "terminalBrightBlack", "terminalBrightRed", "terminalBrightGreen", "terminalBrightYellow", "terminalBrightBlue", "terminalBrightMagenta",
  "terminalBrightCyan", "terminalBrightWhite",
] as const;

export type DetachedThemeToken = typeof DETACHED_THEME_TOKENS[number];

export interface DetachedThemePayload {
  type: "dark" | "light";
  colors: Partial<Record<DetachedThemeToken, string>>;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const RGBA = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*\.?\d+)\s*\)$/i;

export function isSafeColorValue(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 32) return false;
  if (HEX.test(value) || value === "transparent") return true;

  const match = RGB.exec(value) ?? RGBA.exec(value);

  return !!match && match.slice(1, 4).every(channel => Number(channel) <= 255) && (match[4] === undefined || Number(match[4]) <= 1);
}

const tokens: ReadonlySet<string> = new Set(DETACHED_THEME_TOKENS);

export function sanitizeDetachedTheme(input: unknown): DetachedThemePayload | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;

  const { type, colors } = input as Record<string, unknown>;

  if (type !== "dark" && type !== "light") return undefined;

  const safe: Record<string, string> = {};

  if (colors !== null && typeof colors === "object" && !Array.isArray(colors)) {
    for (const [name, value] of Object.entries(colors)) {
      if (tokens.has(name) && isSafeColorValue(value)) safe[name] = value;
    }
  }

  return { type, colors: safe };
}
