/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const { contextBridge, ipcRenderer } = require("electron");

// R5-07: inline copy of DETACHED_THEME_TOKENS / isSafeColorValue (sandboxed preload cannot import TS). Keep in sync with detached-theme.ts.
const THEME_TOKENS = new Set(["mainBackground", "secondaryBackground", "contentColor", "textColorPrimary", "textColorSecondary", "textColorTertiary", "textColorAccent", "textColorDimmed", "borderColor", "borderFaintColor", "primary", "colorSuccess", "colorOk", "colorWarning", "colorError", "colorSoftError", "colorInfo", "colorTerminated", "colorVague", "layoutBackground", "layoutTabsBackground", "badgeBackgroundColor", "dockHeadBackground", "dockInfoBackground", "dockInfoBorderColor", "dockTabBorderColor", "dockTabActiveBackground", "logsBackground", "logsForeground", "logRowHoverBackground", "tableHeaderBackground", "tableHeaderColor", "buttonDefaultBackground", "buttonPrimaryBackground", "buttonAccentBackground", "buttonDisabledBackground", "envProduction", "envProductionSoft", "envStaging", "envStagingSoft", "envDevelopment", "envDevelopmentSoft", "envTesting", "envTestingSoft", "envLocal", "envLocalSoft", "envCustom", "envCustomSoft", "envNone", "envNoneSoft", "terminalBackground", "terminalForeground", "terminalCursor", "terminalCursorAccent", "terminalSelection", "terminalSelectionForeground", "terminalBlack", "terminalRed", "terminalGreen", "terminalYellow", "terminalBlue", "terminalMagenta", "terminalCyan", "terminalWhite", "terminalBrightBlack", "terminalBrightRed", "terminalBrightGreen", "terminalBrightYellow", "terminalBrightBlue", "terminalBrightMagenta", "terminalBrightCyan", "terminalBrightWhite"]);
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CH = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const RGB = new RegExp(`^rgb\\(\\s*${CH}\\s*,\\s*${CH}\\s*,\\s*${CH}\\s*\\)$`, "i");
const RGBA = new RegExp(`^rgba\\(\\s*${CH}\\s*,\\s*${CH}\\s*,\\s*${CH}\\s*,\\s*(?:0|1|0?\\.\\d+|1\\.0+)\\s*\\)$`, "i");
const isSafeColorValue = (v) => typeof v === "string" && v.length <= 32
  && (HEX.test(v) || RGB.test(v) || RGBA.test(v) || v.toLowerCase() === "transparent");
const sanitizeTheme = (input) => {
  if (!input || typeof input !== "object" || (input.type !== "dark" && input.type !== "light")) {
    return undefined;
  }

  const colors = {};
  const src = input.colors && typeof input.colors === "object" ? input.colors : {};

  for (const name of Object.keys(src)) {
    if (THEME_TOKENS.has(name) && isSafeColorValue(src[name])) {
      colors[name] = src[name];
    }
  }

  return { type: input.type, colors };
};

// R4-06B: fixed channel allowlist. The page never names a cluster, tab or PTY: Main uses the registered identity.
contextBridge.exposeInMainWorld("lensDetachedTerminal", Object.freeze({
  getContext: () => ipcRenderer.invoke("detached-terminal:get-context"),
  start: () => ipcRenderer.invoke("detached-terminal:start"),
  input: (data) => ipcRenderer.invoke("detached-terminal:input", String(data)),
  resize: (cols, rows) => ipcRenderer.invoke("detached-terminal:resize", { cols: Number(cols), rows: Number(rows) }),
  requestRedock: () => ipcRenderer.invoke("detached-terminal:redock"),
  getTheme: async () => sanitizeTheme(await ipcRenderer.invoke("detached-theme:get")),
  onThemeChanged: (callback) => {
    ipcRenderer.on("detached-theme:changed", (_event, payload) => {
      const theme = sanitizeTheme(payload);

      if (theme) {
        callback(theme);
      }
    });
  },
  // Only Main can send on this channel; the IPC event object is never exposed to the page.
  onEvent: (callback) => {
    ipcRenderer.on("detached-terminal:event", (_event, payload) => callback(payload));
  },
}));
