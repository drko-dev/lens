/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import { runInAction } from "mobx";
import { Button } from "@openlens/button";
import { Icon } from "../icon";
import { Avatar } from "../avatar";
import { cssNames } from "@openlens/utilities";
import type { Cluster } from "../../../common/cluster/cluster";
import type { KubernetesCluster } from "../../../common/catalog-entities";
import type { ClusterEnvironment } from "../../../common/cluster/environment-types";
import {
  CLUSTER_ENVIRONMENTS,
  getClusterEnvironmentConfig,
  isProductionEnvironment,
  getConfiguredClusterColor,
} from "../../../common/cluster/environment-types";
import styles from "./cluster-appearance-picker.module.scss";

export interface ClusterAppearancePickerProps {
  cluster: Cluster;
  entity?: KubernetesCluster;
  onClose?: () => void;
  onChange?: () => void;
}

export const CLUSTER_COLOR_PRESETS = [
  { label: "Production (Red)", value: "#EF4444" },
  { label: "Orange", value: "#F97316" },
  { label: "Staging (Amber)", value: "#F59E0B" },
  { label: "Development (Green)", value: "#10B981" },
  { label: "Teal", value: "#14B8A6" },
  { label: "Cyan", value: "#06B6D4" },
  { label: "Blue", value: "#3B82F6" },
  { label: "Indigo", value: "#6366F1" },
  { label: "Testing / QA (Purple)", value: "#8B5CF6" },
  { label: "Pink", value: "#EC4899" },
  { label: "Slate", value: "#64748B" },
  { label: "Dark Slate", value: "#334155" },
];

export const CLUSTER_ICON_PRESETS = [
  { label: "Initials", value: "", isText: true },
  { label: "Cloud", value: "cloud" },
  { label: "Hub", value: "hub" },
  { label: "Server", value: "dns" },
  { label: "Memory", value: "memory" },
  { label: "Storage", value: "storage" },
  { label: "Security / Shield", value: "shield" },
  { label: "Rocket", value: "rocket_launch" },
  { label: "Terminal", value: "terminal" },
  { label: "Public", value: "public" },
  { label: "Star", value: "star" },
  { label: "Warning / Safety", value: "warning" },
  { label: "Layers", value: "layers" },
  { label: "Code", value: "code" },
  { label: "Workstation", value: "laptop_chromebook" },
  { label: "Speed", value: "speed" },
  { label: "Production", value: "factory" },
  { label: "Development", value: "build" },
  { label: "Staging", value: "fact_check" },
  { label: "Testing", value: "bug_report" },
  { label: "Local", value: "computer" },
  { label: "Datacenter / On-premises", value: "apartment" },
  { label: "Generic cluster", value: "lan" },
];

export const ClusterAppearancePicker = observer(({
  cluster,
  entity,
  onClose,
  onChange,
}: ClusterAppearancePickerProps) => {
  const currentEnv = cluster.preferences.clusterEnvironment || "none";
  const customEnvName = cluster.preferences.customEnvironmentName || "";
  const currentAlias = cluster.preferences.clusterAlias || cluster.preferences.clusterName || "";
  const envConfig = getClusterEnvironmentConfig(cluster.preferences);
  const isProd = isProductionEnvironment(cluster.preferences);

  const currentColor = getConfiguredClusterColor(cluster.preferences)
    || entity?.spec.icon?.background
    || (currentEnv !== "none" ? envConfig.defaultColor : undefined);

  const currentMaterial = cluster.preferences.clusterIcon
    || (cluster.preferences.icon?.startsWith("material:") ? cluster.preferences.icon.replace(/^material:/, "") : undefined)
    || entity?.spec.icon?.material;

  const displayName = currentAlias || entity?.getName() || cluster.preferences.clusterName || cluster.contextName.get();

  const setEnvironment = (env: ClusterEnvironment) => {
    runInAction(() => {
      cluster.preferences.clusterEnvironment = env;

      if (entity) {
        entity.spec.environment = env;
        entity.metadata.labels ??= {};

        if (env === "none") {
          delete entity.spec.environment;
          delete entity.metadata.labels["devops.openlens.dev/environment"];
          delete entity.metadata.labels["devops.openlens.dev/production"];
        } else {
          entity.metadata.labels["devops.openlens.dev/environment"] = env;

          if (env === "production") {
            entity.metadata.labels["devops.openlens.dev/production"] = "true";
          } else {
            delete entity.metadata.labels["devops.openlens.dev/production"];
          }
        }
      }

      if (env !== "none" && !cluster.preferences.clusterColor) {
        cluster.preferences.clusterColor = CLUSTER_ENVIRONMENTS[env].defaultColor;
        cluster.preferences.icon = CLUSTER_ENVIRONMENTS[env].defaultColor;

        if (entity) {
          entity.spec.icon ??= {};
          entity.spec.icon.background = CLUSTER_ENVIRONMENTS[env].defaultColor;
        }
      }
    });
    onChange?.();
  };

  const setCustomEnvName = (name: string) => {
    runInAction(() => {
      cluster.preferences.customEnvironmentName = name;

      if (cluster.preferences.clusterEnvironment === "custom" && entity) {
        entity.spec.customEnvironmentName = name;
      }
    });
    onChange?.();
  };

  const setAlias = (alias: string) => {
    runInAction(() => {
      const trimmed = alias.trim();

      cluster.preferences.clusterAlias = trimmed || undefined;
      cluster.preferences.clusterName = trimmed || undefined;

      if (entity) {
        if (trimmed) {
          entity.metadata.name = trimmed;
        } else {
          entity.metadata.name = cluster.contextName.get();
        }
      }
    });
    onChange?.();
  };

  const setColor = (color: string) => {
    runInAction(() => {
      cluster.preferences.clusterColor = color || null;
      cluster.preferences.icon = color || null;

      if (entity) {
        entity.spec.icon ??= {};
        entity.spec.icon.background = color || undefined;
      }
    });
    onChange?.();
  };

  const setMaterialIcon = (iconName: string) => {
    runInAction(() => {
      cluster.preferences.clusterIcon = iconName || null;

      if (entity) {
        entity.spec.icon ??= {};
        entity.spec.icon.material = iconName || undefined;
      }
    });
    onChange?.();
  };

  const resetToDefault = () => {
    runInAction(() => {
      cluster.preferences.icon = null;
      cluster.preferences.clusterColor = null;
      cluster.preferences.clusterIcon = null;
      cluster.preferences.clusterEnvironment = "none";
      cluster.preferences.customEnvironmentName = undefined;
      cluster.preferences.clusterAlias = undefined;
      cluster.preferences.clusterName = undefined;

      if (entity) {
        entity.metadata.name = cluster.contextName.get();

        if (entity.metadata.labels) {
          delete entity.metadata.labels["devops.openlens.dev/environment"];
          delete entity.metadata.labels["devops.openlens.dev/production"];
        }

        if (entity.spec.icon) {
          entity.spec.icon.background = undefined;
          entity.spec.icon.material = undefined;
          entity.spec.icon.src = undefined;
        }

        delete entity.spec.environment;
        delete entity.spec.customEnvironmentName;
      }
    });
    onChange?.();
  };

  return (
    <div className={styles.appearancePicker}>
      {/* Live Preview */}
      <div className={cssNames(styles.previewContainer, { [styles.isProductionPreview]: isProd })}>
        <div className={styles.avatarWrapper}>
          <Avatar
            colorHash={`${displayName}-${entity?.metadata.source ?? "local"}`}
            title={displayName}
            src={entity?.spec.icon?.src}
            size={48}
            background={currentColor}
          >
            {currentMaterial ? <Icon material={currentMaterial} /> : undefined}
          </Avatar>
        </div>
        <div className={styles.previewInfo}>
          <div className={styles.previewTitleRow}>
            <span className={styles.previewTitle}>{displayName}</span>
            {isProd ? (
              <span className={styles.productionWarningBadge}>
                <Icon material="warning" className={styles.warningIcon} />
                PRODUCTION
              </span>
            ) : currentEnv !== "none" ? (
              <span
                className={styles.environmentBadge}
                style={{ backgroundColor: envConfig.defaultColor }}
              >
                <Icon material={envConfig.icon} className={styles.envIcon} />
                {envConfig.label}
              </span>
            ) : null}
          </div>
          <div className={styles.previewSubtitle}>
            Context:
            {" "}
            {cluster.contextName.get()}
            {currentColor ? ` • Color: ${currentColor}` : ""}
            {currentMaterial ? ` • Icon: ${currentMaterial}` : ""}
          </div>
        </div>
      </div>

      {/* Environment Selector */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Environment Classification</div>
        <div className={styles.sectionDescription}>
          Tag this cluster by operational tier to activate security warnings and visual distinction.
        </div>
        <div className={styles.environmentGrid}>
          {(Object.keys(CLUSTER_ENVIRONMENTS) as ClusterEnvironment[]).map((envKey) => {
            const config = CLUSTER_ENVIRONMENTS[envKey];
            const isSelected = currentEnv === envKey;

            return (
              <button
                key={envKey}
                type="button"
                className={cssNames(styles.envButton, {
                  [styles.active]: isSelected,
                  [styles.envButtonProduction]: config.isProduction,
                })}
                onClick={() => setEnvironment(envKey)}
                title={config.description}
              >
                <span className={styles.envDot} style={{ backgroundColor: config.defaultColor }} />
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>

        {currentEnv === "custom" && (
          <div className={styles.customEnvInputWrapper}>
            <input
              type="text"
              placeholder="Enter custom environment name (e.g. Sandbox, DR)..."
              value={customEnvName}
              onChange={(e) => setCustomEnvName(e.target.value)}
              className={styles.aliasInputWrapper}
              style={{ maxWidth: "300px", padding: "4px 8px" }}
            />
          </div>
        )}
      </div>

      {/* Cluster Display Name / Alias */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Cluster Display Name / Visual Alias</div>
        <div className={styles.sectionDescription}>
          Friendly label displayed in Hotbar and workspace (does not alter kubeconfig context).
        </div>
        <div className={styles.aliasInputWrapper}>
          <input
            type="text"
            placeholder={cluster.contextName.get()}
            value={currentAlias}
            onChange={(e) => setAlias(e.target.value)}
          />
        </div>
      </div>

      {/* Pin Color */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Pin Color</div>
        <div className={styles.colorGrid}>
          {CLUSTER_COLOR_PRESETS.map((preset) => {
            const isSelected = currentColor?.toLowerCase() === preset.value.toLowerCase();

            return (
              <button
                key={preset.value}
                type="button"
                className={cssNames(styles.colorSwatch, { [styles.active]: isSelected })}
                style={{ backgroundColor: preset.value }}
                title={preset.label}
                onClick={() => setColor(preset.value)}
              >
                {isSelected && <Icon material="check" className={styles.checkIcon} />}
              </button>
            );
          })}
          <div className={styles.customColorWrapper} title="Custom color picker">
            <input
              type="color"
              value={currentColor?.startsWith("#") ? currentColor : "#3b82f6"}
              onChange={(e) => setColor(e.target.value)}
            />
            <span className={styles.customColorLabel}>Custom</span>
          </div>
        </div>
      </div>

      {/* Pin Icon */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Pin Icon</div>
        <div className={styles.iconGrid}>
          {CLUSTER_ICON_PRESETS.map((preset) => {
            const isSelected = (!currentMaterial && preset.value === "")
              || (currentMaterial === preset.value);

            return (
              <button
                key={preset.value}
                type="button"
                className={cssNames(styles.iconButton, { [styles.active]: isSelected })}
                title={preset.label}
                onClick={() => setMaterialIcon(preset.value)}
              >
                {preset.isText ? (
                  <span>{displayName.slice(0, 2).toUpperCase()}</span>
                ) : (
                  <Icon material={preset.value} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <Button
          plain
          onClick={resetToDefault}
          label="Reset to Default"
        />
        {onClose && (
          <Button
            primary
            onClick={onClose}
            label="Done"
          />
        )}
      </div>
    </div>
  );
});
