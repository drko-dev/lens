/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import randomColor from "randomcolor";
import type { CatalogEntity } from "../../../common/catalog";
import { isKubernetesCluster } from "../../../common/catalog-entities/kubernetes-cluster";
import type { Cluster } from "../../../common/cluster/cluster";
import { getConfiguredClusterColor, resolveClusterEnvironment } from "../../../common/cluster/environment-types";

export interface NavigatorClusterRowProps {
  entity: CatalogEntity;
  cluster?: Cluster;
  fallbackColor?: string;
  onRun: (entity: CatalogEntity) => void;
}

function getClusterContextOrName(cluster: Cluster): string | undefined {
  const ctx = typeof cluster.contextName?.get === "function" ? cluster.contextName.get() : undefined;

  return cluster.preferences?.clusterName || ctx;
}

/** Resolves a configured cluster color across matching cluster records (e.g. duplicate kubeconfig contexts) and catalog entities. */
export function resolveConfiguredClusterFallbackColor(
  entity: CatalogEntity,
  clusters: readonly Cluster[],
  allEntities: readonly CatalogEntity[] = [],
): string | undefined {
  const entityName = entity.getName();
  const matchingClusters = clusters.filter(
    candidate => candidate.id === entity.getId() || getClusterContextOrName(candidate) === entityName,
  );

  for (const candidate of matchingClusters) {
    const configuredColor = getConfiguredClusterColor(candidate.preferences);

    if (configuredColor) {
      return configuredColor;
    }
  }

  for (const candidate of matchingClusters) {
    const envConfig = resolveClusterEnvironment({ preferences: candidate.preferences });

    if (envConfig.id !== "none") {
      return `var(${envConfig.cssVar}, ${envConfig.defaultColor})`;
    }
  }

  for (const candidate of allEntities) {
    if (candidate.getName() !== entityName) continue;
    if (candidate.spec.icon?.background) {
      return candidate.spec.icon.background;
    }

    if (isKubernetesCluster(candidate)) {
      const envConfig = resolveClusterEnvironment({
        spec: {
          environment: candidate.spec.environment,
          customEnvironmentName: candidate.spec.customEnvironmentName,
        },
      });

      if (envConfig.id !== "none") {
        return `var(${envConfig.cssVar}, ${envConfig.defaultColor})`;
      }
    }
  }

  return undefined;
}

/** One non-active cluster row of the NovaKube Navigator (cluster frame and root frame). */
export const NavigatorClusterRow = observer(({ entity, cluster, fallbackColor, onRun }: NavigatorClusterRowProps) => {
  const name = cluster?.preferences.clusterAlias
    || cluster?.preferences.clusterName
    || entity.getName();
  const envConfig = resolveClusterEnvironment({
    preferences: cluster?.preferences,
    spec: isKubernetesCluster(entity)
      ? {
        environment: entity.spec.environment,
        customEnvironmentName: entity.spec.customEnvironmentName,
      }
      : undefined,
  });
  const envColor = envConfig.id !== "none" ? `var(${envConfig.cssVar}, ${envConfig.defaultColor})` : undefined;
  const pinColor = getConfiguredClusterColor(cluster?.preferences)
    || entity.spec.icon?.background
    || fallbackColor
    || envColor
    || randomColor({
      seed: entity.metadata.source ? `${name}-${entity.metadata.source}` : name,
      luminosity: "dark",
    });

  return (
    <button
      type="button"
      className="navigator-cluster-root navigator-cluster-other"
      data-testid="navigator-cluster-other"
      aria-label={`Open ${name}`}
      onClick={() => onRun(entity)}
      style={{ "--nv-active-cluster-color": pinColor } as React.CSSProperties}
    >
      <span className="navigator-cluster-pin" aria-hidden="true" />
      <span className="navigator-cluster-label" title={name}>{name}</span>
    </button>
  );
});
