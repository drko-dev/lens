/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useState } from "react";
import { Button } from "@openlens/button";
import { SubTitle } from "../../../../../renderer/components/layout/sub-title";
import { Switch } from "../../../../../renderer/components/switch";
import { globalDockingStorageKey, isGlobalDockingEnabled } from "../../../../global-docking/renderer/global-docking-feature-flag";
import {
  EXPERIMENT_THEME_TWEAKER_KEY,
  EXPERIMENT_URL_NAV_KEY,
  EXPERIMENTS_CHANGED_EVENT,
  isExperimentInstalled,
} from "./experiment-overlays";

interface LabExperiment {
  id: string;
  storageKey: string;
  name: string;
  version: string;
  description: string;
}

const LAB_EXPERIMENTS: LabExperiment[] = [
  {
    id: "theme-tweaker",
    storageKey: EXPERIMENT_THEME_TWEAKER_KEY,
    name: "Theme Tweaker",
    version: "0.1.0",
    description: "Live-edit every Lens theme color, save your own themes, and pick from curated presets.",
  },
  {
    id: "url-navigation",
    storageKey: EXPERIMENT_URL_NAV_KEY,
    name: "URL Navigation & Sharing",
    version: "0.1.0",
    description: "Show where you are in Lens as a browser-style location bar, navigate by typing, and share direct links to any Kubernetes resource.",
  },
];

export const ExperimentalSettings = () => {
  const [globalDocking, setGlobalDocking] = useState<boolean>(() =>
    isGlobalDockingEnabled(typeof window !== "undefined" ? window.localStorage : undefined),
  );
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>(() => ({
    "theme-tweaker": isExperimentInstalled(EXPERIMENT_THEME_TWEAKER_KEY),
    "url-navigation": isExperimentInstalled(EXPERIMENT_URL_NAV_KEY),
  }));

  const toggleGlobalDocking = (checked: boolean) => {
    try {
      window.localStorage.setItem(globalDockingStorageKey, checked ? "true" : "false");
    } catch {
      // Ignore storage errors in restricted contexts
    }
    setGlobalDocking(checked);
  };

  const toggleExperiment = (exp: LabExperiment) => {
    const next = !installedMap[exp.id];
    try {
      if (next) {
        window.localStorage.setItem(exp.storageKey, "installed");
      } else {
        window.localStorage.removeItem(exp.storageKey);
      }
      window.dispatchEvent(new CustomEvent(EXPERIMENTS_CHANGED_EVENT));
    } catch {
      // Ignore storage errors
    }
    setInstalledMap((prev) => ({ ...prev, [exp.id]: next }));
  };

  return (
    <section id="experimental" data-testid="experimental-preferences-section">
      <SubTitle title="Experimental Features" />
      <div className="notice" style={{ marginBottom: 16 }}>
        Experimental features let you try out new functionality that is still in development. These features may be unstable, change without notice, or be removed entirely.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 72px 96px 100px",
          gap: "12px 16px",
          alignItems: "center",
          borderBottom: "1px solid var(--borderFaintColor, #333)",
          paddingBottom: 8,
          marginBottom: 8,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--textColorSecondary)",
        }}
      >
        <span>Name</span>
        <span>Version</span>
        <span>Status</span>
        <span />
      </div>
      {LAB_EXPERIMENTS.map((exp) => {
        const installed = installedMap[exp.id];

        return (
          <div
            key={exp.id}
            data-testid={`experiment-row-${exp.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 72px 96px 100px",
              gap: "12px 16px",
              alignItems: "center",
              padding: "12px 0",
              borderBottom: "1px solid var(--borderFaintColor, #2d2f33)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{exp.name}</div>
              <div className="hint">{exp.description}</div>
            </div>
            <span style={{ fontSize: 13 }}>{exp.version}</span>
            <span data-testid={`experiment-status-${exp.id}`} style={{ fontSize: 13 }}>
              {installed ? "Installed" : "Not installed"}
            </span>
            <Button
              primary={!installed}
              plain={installed}
              label={installed ? "Uninstall" : "Install"}
              data-testid={`experiment-action-${exp.id}`}
              onClick={() => toggleExperiment(exp)}
            />
          </div>
        );
      })}
      <div className="flex gaps align-center justify-between" style={{ padding: "16px 0 8px" }}>
        <div>
          <div style={{ fontWeight: 500 }}>Universal Global Docking Host</div>
          <div className="hint">
            Enable the split-panel universal docking host across cluster views (takes effect on next reload).
          </div>
        </div>
        <Switch
          checked={globalDocking}
          onChange={toggleGlobalDocking}
          data-testid="experimental-global-docking-switch"
        />
      </div>
    </section>
  );
};
