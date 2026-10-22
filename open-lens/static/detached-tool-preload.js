/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const { contextBridge, ipcRenderer } = require("electron");

// R5-07: theme tokens. Inline copy of DETACHED_THEME_TOKENS (sandboxed preload cannot import TS); keep in sync.
const THEME_TOKENS = new Set(["mainBackground", "secondaryBackground", "contentColor", "textColorPrimary", "textColorSecondary", "textColorTertiary", "textColorAccent", "textColorDimmed", "borderColor", "borderFaintColor", "primary", "colorSuccess", "colorOk", "colorWarning", "colorError", "colorSoftError", "colorInfo", "colorTerminated", "colorVague", "layoutBackground", "layoutTabsBackground", "badgeBackgroundColor", "dockHeadBackground", "dockInfoBackground", "dockInfoBorderColor", "dockTabBorderColor", "dockTabActiveBackground", "logsBackground", "logsForeground", "logRowHoverBackground", "tableHeaderBackground", "tableHeaderColor", "buttonDefaultBackground", "buttonPrimaryBackground", "buttonAccentBackground", "buttonDisabledBackground", "envProduction", "envProductionSoft", "envStaging", "envStagingSoft", "envDevelopment", "envDevelopmentSoft", "envTesting", "envTestingSoft", "envLocal", "envLocalSoft", "envCustom", "envCustomSoft", "envNone", "envNoneSoft", "terminalBackground", "terminalForeground", "terminalCursor", "terminalCursorAccent", "terminalSelection", "terminalSelectionForeground", "terminalBlack", "terminalRed", "terminalGreen", "terminalYellow", "terminalBlue", "terminalMagenta", "terminalCyan", "terminalWhite", "terminalBrightBlack", "terminalBrightRed", "terminalBrightGreen", "terminalBrightYellow", "terminalBrightBlue", "terminalBrightMagenta", "terminalBrightCyan", "terminalBrightWhite"]);
const SAFE_COLOR = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|transparent|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\))$/i;
const rgbOk = (v) => (v.match(/\d+(?=\s*[,)])/g) || []).slice(0, 3).every((n) => Number(n) <= 255);
const isSafeColor = (v) => typeof v === "string" && v.length <= 32 && SAFE_COLOR.test(v) && (!/^rgba?\(/i.test(v) || rgbOk(v));
const sanitizeTheme = (input) => {
  if (!input || typeof input !== "object" || (input.type !== "dark" && input.type !== "light")) return undefined;
  const colors = {};
  const src = input.colors && typeof input.colors === "object" ? input.colors : {};
  for (const key of Object.keys(src)) if (THEME_TOKENS.has(key) && isSafeColor(src[key])) colors[key] = src[key];
  return { type: input.type, colors };
};

// R4-06: fixed channel allowlist; identity is owned by Electron Main.
contextBridge.exposeInMainWorld("lensDetachedTool", Object.freeze({
  getContext: () => ipcRenderer.invoke("detached-tool:get-context"),
  requestRedock: (identity) => ipcRenderer.invoke("detached-tool:request-redock", {
    workspaceId: String(identity?.workspaceId ?? ""),
    tabId: String(identity?.tabId ?? ""),
    clusterId: String(identity?.clusterId ?? ""),
  }),
  // The window never says WHAT to stream; Main uses the registered identity.
  start: () => ipcRenderer.invoke("detached-tool:start"),
  refresh: () => ipcRenderer.invoke("detached-tool:refresh"),
  // Only Main can send on this channel; the IPC event object is never exposed to the page.
  getTheme: async () => sanitizeTheme(await ipcRenderer.invoke("detached-theme:get")),
  onThemeChanged: (callback) => {
    ipcRenderer.on("detached-theme:changed", (_event, payload) => {
      const theme = sanitizeTheme(payload);

      if (theme) callback(theme);
    });
  },
  onEvent: (callback) => {
    ipcRenderer.on("detached-tool:event", (_event, payload) => callback(payload));
  },
}));
