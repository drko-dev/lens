/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useEffect, useState } from "react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import currentPathInjectable from "../../../../../renderer/routes/current-path.injectable";
import navigateInjectable from "../../../../../renderer/navigation/navigate.injectable";
import type { Navigate } from "../../../../../renderer/navigation/navigate.injectable";
import { Icon } from "../../../../../renderer/components/icon";

export const EXPERIMENT_THEME_TWEAKER_KEY = "novakube:experiment:theme-tweaker";
export const EXPERIMENT_URL_NAV_KEY = "novakube:experiment:url-navigation";
export const EXPERIMENT_THEME_VARS_KEY = "novakube:experiment:theme-tweaker-vars";
export const EXPERIMENTS_CHANGED_EVENT = "novakube:experiments-changed";

export function isExperimentInstalled(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "installed";
  } catch {
    return false;
  }
}

const THEME_PRESETS: Record<string, Record<string, string>> = {
  Default: {},
  Midnight: {
    "--mainBackground": "#141619",
    "--sidebarBackground": "#101214",
    "--textColorAccent": "#ffffff",
  },
  Oceanic: {
    "--mainBackground": "#16202a",
    "--sidebarBackground": "#111922",
    "--primary": "#38bdf8",
  },
};

function applySavedThemeVars(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v) document.documentElement.style.setProperty(k, v);
    else document.documentElement.style.removeProperty(k);
  }
}

interface Dependencies {
  currentPath: IComputedValue<string>;
  navigate: Navigate;
}

const NonInjectedExperimentOverlays = observer(({ currentPath, navigate }: Dependencies) => {
  const [themeTweakerOn, setThemeTweakerOn] = useState(() => isExperimentInstalled(EXPERIMENT_THEME_TWEAKER_KEY));
  const [urlNavOn, setUrlNavOn] = useState(() => isExperimentInstalled(EXPERIMENT_URL_NAV_KEY));
  const [urlInput, setUrlInput] = useState(() => currentPath.get());
  const [copied, setCopied] = useState(false);
  const [tweakerOpen, setTweakerOpen] = useState(true);
  const [themeVars, setThemeVars] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(EXPERIMENT_THEME_VARS_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const activePath = currentPath.get();

  useEffect(() => {
    setUrlInput(activePath);
  }, [activePath]);

  useEffect(() => {
    const sync = () => {
      setThemeTweakerOn(isExperimentInstalled(EXPERIMENT_THEME_TWEAKER_KEY));
      setUrlNavOn(isExperimentInstalled(EXPERIMENT_URL_NAV_KEY));
    };

    window.addEventListener(EXPERIMENTS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    if (themeTweakerOn) applySavedThemeVars(themeVars);

    return () => {
      window.removeEventListener(EXPERIMENTS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [themeTweakerOn, themeVars]);

  const updateVar = (token: string, value: string) => {
    const next = { ...themeVars, [token]: value };
    setThemeVars(next);
    applySavedThemeVars(next);
    try {
      window.localStorage.setItem(EXPERIMENT_THEME_VARS_KEY, JSON.stringify(next));
    } catch {}
  };

  const applyPreset = (name: string) => {
    const preset = THEME_PRESETS[name] ?? {};
    for (const key of ["--mainBackground", "--sidebarBackground", "--textColorAccent", "--primary"]) {
      document.documentElement.style.removeProperty(key);
    }
    setThemeVars(preset);
    applySavedThemeVars(preset);
    try {
      window.localStorage.setItem(EXPERIMENT_THEME_VARS_KEY, JSON.stringify(preset));
    } catch {}
  };

  return (
    <>
      {urlNavOn && (
        <div
          data-testid="experiment-url-bar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px",
            background: "var(--secondaryBackground, #212326)",
            borderBottom: "1px solid var(--borderColor, #333)",
            fontSize: 12,
          }}
        >
          <Icon material="link" smallest />
          <input
            type="text"
            aria-label="Lens location bar"
            data-testid="experiment-url-input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlInput.trim()) {
                navigate(urlInput.trim());
              }
            }}
            style={{
              flex: 1,
              height: 24,
              padding: "0 8px",
              borderRadius: 4,
              background: "var(--inputControlBackground, #181a1c)",
              color: "var(--textColorPrimary, #f1f3f5)",
              border: "1px solid var(--borderColor, #3a3d42)",
              fontSize: 12,
            }}
          />
          <button
            type="button"
            data-testid="experiment-url-copy-btn"
            onClick={() => {
              navigator.clipboard?.writeText(`lens://app${activePath}`).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            style={{
              height: 24,
              padding: "0 10px",
              borderRadius: 4,
              border: "1px solid var(--borderColor, #3a3d42)",
              background: "transparent",
              color: "var(--textColorPrimary, #f1f3f5)",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {copied ? "Copied!" : "Share Link"}
          </button>
        </div>
      )}
      {themeTweakerOn && tweakerOpen && (
        <div
          data-testid="experiment-theme-tweaker-panel"
          style={{
            position: "fixed",
            right: 16,
            bottom: 32,
            zIndex: 50,
            width: 260,
            padding: 12,
            borderRadius: 6,
            background: "var(--dialogBackground, #25272b)",
            border: "1px solid var(--borderColor, #3e4147)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>Theme Tweaker (0.1.0)</strong>
            <button
              type="button"
              aria-label="Close Theme Tweaker"
              onClick={() => setTweakerOpen(false)}
              style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer" }}
            >
              <Icon material="close" smallest />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {Object.keys(THEME_PRESETS).map((preset) => (
              <button
                key={preset}
                type="button"
                data-testid={`theme-tweaker-preset-${preset.toLowerCase()}`}
                onClick={() => applyPreset(preset)}
                style={{
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: "1px solid var(--borderColor, #3e4147)",
                  background: "var(--secondaryBackground, #1e2023)",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span>Main Background</span>
            <input
              type="color"
              value={themeVars["--mainBackground"] || "#1e2022"}
              onChange={(e) => updateVar("--mainBackground", e.target.value)}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Accent Color</span>
            <input
              type="color"
              value={themeVars["--primary"] || "#3d90ce"}
              onChange={(e) => updateVar("--primary", e.target.value)}
            />
          </label>
        </div>
      )}
    </>
  );
});

export const ExperimentOverlays = withInjectables<Dependencies>(NonInjectedExperimentOverlays, {
  getProps: (di) => ({
    currentPath: di.inject(currentPathInjectable),
    navigate: di.inject(navigateInjectable),
  }),
});
