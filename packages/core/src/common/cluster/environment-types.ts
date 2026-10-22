/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ClusterPreferences } from "../cluster-types";

export type ClusterEnvironment =
  | "production"
  | "staging"
  | "development"
  | "testing"
  | "local"
  | "custom"
  | "none";

export interface ClusterEnvironmentConfig {
  id: ClusterEnvironment;
  label: string;
  shortLabel: string;
  defaultColor: string;
  isProduction: boolean;
  icon: string;
  description: string;
  /** Theme CSS variable carrying this environment's color (soft variant: `<cssVar>Soft`) */
  cssVar: string;
}

export const CLUSTER_ENVIRONMENTS: Record<ClusterEnvironment, ClusterEnvironmentConfig> = {
  production: {
    id: "production",
    label: "Production",
    shortLabel: "PROD",
    defaultColor: "#EF4444",
    isProduction: true,
    icon: "warning",
    description: "Live production cluster — destructive operations require explicit attention",
    cssVar: "--envProduction",
  },
  staging: {
    id: "staging",
    label: "Staging",
    shortLabel: "STG",
    defaultColor: "#F59E0B",
    isProduction: false,
    icon: "layers",
    description: "Pre-production verification and staging environment",
    cssVar: "--envStaging",
  },
  development: {
    id: "development",
    label: "Development",
    shortLabel: "DEV",
    defaultColor: "#10B981",
    isProduction: false,
    icon: "code",
    description: "Active development and engineering cluster",
    cssVar: "--envDevelopment",
  },
  testing: {
    id: "testing",
    label: "Testing / QA",
    shortLabel: "TEST",
    defaultColor: "#8B5CF6",
    isProduction: false,
    icon: "fact_check",
    description: "Testing, QA and integration environment",
    cssVar: "--envTesting",
  },
  local: {
    id: "local",
    label: "Local",
    shortLabel: "LOC",
    defaultColor: "#06B6D4",
    isProduction: false,
    icon: "laptop_chromebook",
    description: "Local workstation cluster (kind, minikube, k3d, docker-desktop)",
    cssVar: "--envLocal",
  },
  custom: {
    id: "custom",
    label: "Custom",
    shortLabel: "CST",
    defaultColor: "#3B82F6",
    isProduction: false,
    icon: "tune",
    description: "User-defined custom environment tag",
    cssVar: "--envCustom",
  },
  none: {
    id: "none",
    label: "None",
    shortLabel: "",
    defaultColor: "#64748B",
    isProduction: false,
    icon: "hub",
    description: "Standard cluster without specific environment tag",
    cssVar: "--envNone",
  },
};

function normalizeEnvironmentId(env?: string): ClusterEnvironment | undefined {
  if (!env) return undefined;
  if (env === "prod" || env === "prd") return "production";
  if (env === "dev") return "development";
  if (env === "stg" || env === "stage") return "staging";
  if (env === "qa") return "testing";

  return env as ClusterEnvironment;
}

/**
 * Returns the effective environment configuration for a cluster given its preferences.
 */
export function getClusterEnvironmentConfig(preferences?: ClusterPreferences | null): ClusterEnvironmentConfig {
  const normalized = normalizeEnvironmentId(preferences?.clusterEnvironment);

  if (normalized && Object.prototype.hasOwnProperty.call(CLUSTER_ENVIRONMENTS, normalized)) {
    const base = CLUSTER_ENVIRONMENTS[normalized];

    if (normalized === "custom" && preferences?.customEnvironmentName) {
      const customName = preferences.customEnvironmentName.trim();

      return {
        ...base,
        label: customName || base.label,
        shortLabel: customName.slice(0, 4).toUpperCase() || base.shortLabel,
      };
    }

    return base;
  }

  return CLUSTER_ENVIRONMENTS.none;
}

/**
 * Returns true if the cluster is explicitly classified as a production environment.
 * Note: We never infer production from context name alone.
 */
export function isProductionEnvironment(preferences?: ClusterPreferences | null): boolean {
  const normalized = normalizeEnvironmentId(preferences?.clusterEnvironment);

  return normalized === "production";
}

/**
 * Resolves the environment from the explicit preference only (never from names or labels).
 * `spec` is a fallback because main projects it 1:1 from the preference.
 */
export function resolveClusterEnvironment(source: {
  preferences?: ClusterPreferences | null;
  spec?: { environment?: string | null; customEnvironmentName?: string | null } | null;
}): ClusterEnvironmentConfig {
  const { preferences, spec } = source;

  if (preferences?.clusterEnvironment !== undefined) {
    return getClusterEnvironmentConfig(preferences);
  }

  if (spec?.environment) {
    return getClusterEnvironmentConfig({
      clusterEnvironment: spec.environment,
      customEnvironmentName: spec.customEnvironmentName ?? undefined,
    } as ClusterPreferences);
  }

  return CLUSTER_ENVIRONMENTS.none;
}
