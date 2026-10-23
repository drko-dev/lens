/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { SubTitle } from "../../../../../../renderer/components/layout/sub-title";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import { Button } from "@openlens/button";
import { Icon } from "../../../../../../renderer/components/icon";
import { EnvironmentBadge } from "../../../../../../renderer/components/environment-badge/environment-badge";
import type { ClusterEnvironment } from "../../../../../../common/cluster/environment-types";
import { CLUSTER_ENVIRONMENTS } from "../../../../../../common/cluster/environment-types";
import type { UserPreferencesState } from "../../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../../user-preferences/common/state.injectable";

interface Dependencies {
  state: UserPreferencesState;
}

const ENV_ORDER: ClusterEnvironment[] = [
  "production",
  "staging",
  "development",
  "testing",
  "local",
  "custom",
  "none",
];

const NonInjectedEnvironmentColors = observer(({ state }: Dependencies) => {
  const currentOverrides = state.environmentColors ?? {};
  const hasCustomOverrides = Object.keys(currentOverrides).length > 0;
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

  const handleColorChange = (envId: ClusterEnvironment, color: string) => {
    if (envId === "production") return;

    setDrafts((prev) => {
      const next = { ...prev };

      delete next[envId];

      return next;
    });

    state.environmentColors = {
      ...(state.environmentColors ?? {}),
      [envId]: color,
    };
  };

  const handleTextChange = (envId: ClusterEnvironment, rawValue: string) => {
    if (envId === "production") return;

    setDrafts((prev) => ({ ...prev, [envId]: rawValue }));

    if (HEX_COLOR_REGEX.test(rawValue)) {
      state.environmentColors = {
        ...(state.environmentColors ?? {}),
        [envId]: rawValue,
      };
    }
  };

  const handleTextBlur = (envId: ClusterEnvironment) => {
    setDrafts((prev) => {
      const next = { ...prev };

      delete next[envId];

      return next;
    });
  };

  const handleResetSingle = (envId: ClusterEnvironment) => {
    if (envId === "production") return;

    setDrafts((prev) => {
      const next = { ...prev };

      delete next[envId];

      return next;
    });

    const next = { ...(state.environmentColors ?? {}) };

    delete next[envId];
    state.environmentColors = Object.keys(next).length > 0 ? next : {};
  };

  const handleRestoreAll = () => {
    setDrafts({});
    state.environmentColors = {};
  };

  return (
    <section id="environment-colors-preferences" data-testid="environment-colors-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SubTitle title="Cluster Environment Colors" />
        <Button
          plain
          disabled={!hasCustomOverrides}
          onClick={handleRestoreAll}
          data-testid="restore-default-colors-btn"
          style={{ textDecoration: "underline", cursor: hasCustomOverrides ? "pointer" : "default" }}
        >
          Restore default colors
        </Button>
      </div>
      <p className="text-secondary" style={{ marginBottom: "1.25rem" }}>
        Customize visual tag colors for each environment. Changes apply dynamically across the catalog, workspace tabs, and status badges.
      </p>

      <div
        className="environment-color-rows"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          maxWidth: "680px",
        }}
      >
        {ENV_ORDER.map((envId) => {
          const config = CLUSTER_ENVIRONMENTS[envId];
          const isProduction = envId === "production";
          const currentColor = isProduction
            ? config.defaultColor
            : (currentOverrides[envId] || config.defaultColor);
          const isOverridden = !isProduction && Boolean(currentOverrides[envId]);

          const draft = drafts[envId];
          const inputValue = draft !== undefined ? draft : currentColor;

          // Create a dynamic config for previewing
          const previewConfig = {
            ...config,
            defaultColor: currentColor,
          };

          return (
            <div
              key={envId}
              className={`env-color-row env-${envId}`}
              data-testid={`env-color-row-${envId}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.6rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--surface-2)",
                border: "1px solid var(--border-1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: "160px" }}>
                <EnvironmentBadge
                  environment={previewConfig}
                  size="md"
                  showNone
                />
                <span style={{ fontWeight: 500, fontSize: "var(--fs-sm)" }}>{config.label}</span>
              </div>

              {isProduction ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    color: "var(--text-secondary)",
                    fontSize: "var(--fs-xs)",
                  }}
                  data-testid="prod-locked-indicator"
                >
                  <Icon material="lock" small />
                  <span>Locked (Safety Guard)</span>
                  <code style={{ marginLeft: "0.5rem", opacity: 0.8 }}>#EF4444</code>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => handleColorChange(envId, e.target.value)}
                    aria-label={`Color picker for ${config.label}`}
                    data-testid={`env-color-picker-${envId}`}
                    style={{
                      cursor: "pointer",
                      width: "32px",
                      height: "28px",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "transparent",
                    }}
                  />
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => handleTextChange(envId, e.target.value)}
                    onBlur={() => handleTextBlur(envId)}
                    aria-label={`Color hex for ${config.label}`}
                    data-testid={`env-color-input-${envId}`}
                    maxLength={7}
                    style={{
                      width: "80px",
                      padding: "4px 8px",
                      fontSize: "var(--fs-xs)",
                      fontFamily: "monospace",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-1)",
                      backgroundColor: "var(--surface-1)",
                      color: "var(--text-1)",
                    }}
                  />
                  {isOverridden && (
                    <Button
                      plain
                      onClick={() => handleResetSingle(envId)}
                      data-testid={`env-reset-${envId}`}
                      title="Reset to default color"
                      style={{ padding: "0 4px" }}
                    >
                      <Icon material="refresh" small />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});

export const EnvironmentColors = withInjectables<Dependencies>(NonInjectedEnvironmentColors, {
  getProps: (di) => ({
    state: di.inject(userPreferencesStateInjectable),
  }),
});
