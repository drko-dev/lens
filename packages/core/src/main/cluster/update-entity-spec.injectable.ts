/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { KubernetesCluster, KubernetesClusterPrometheusMetrics } from "../../common/catalog-entities";
import type { Cluster } from "../../common/cluster/cluster";

export type UpdateEntitySpec = (entity: KubernetesCluster, cluster: Cluster) => void;

const updateEntitySpecInjectable = getInjectable({
  id: "update-entity-spec",

  instantiate: (): UpdateEntitySpec => {
    return (entity, cluster) => {
      entity.spec.metrics ||= { source: "local" };

      if (entity.spec.metrics.source === "local") {
        const prometheus: KubernetesClusterPrometheusMetrics = entity.spec?.metrics?.prometheus || {};

        prometheus.type = cluster.preferences.prometheusProvider?.type;
        prometheus.address = cluster.preferences.prometheus;
        entity.spec.metrics.prometheus = prometheus;
      }

      if (cluster.preferences.icon) {
        entity.spec.icon ??= {};

        if (cluster.preferences.icon.startsWith("data:")) {
          entity.spec.icon.src = cluster.preferences.icon;
        } else if (cluster.preferences.icon.startsWith("material:")) {
          entity.spec.icon.material = cluster.preferences.icon.replace(/^material:/, "");
        } else {
          entity.spec.icon.background = cluster.preferences.icon;
        }
      } else if (cluster.preferences.icon === null && !cluster.preferences.clusterColor && !cluster.preferences.clusterIcon) {
        /**
         * NOTE: only clear the icon if set to `null` by ClusterIconSettings.
         * We can then also clear that value too
         */
        entity.spec.icon = undefined;
        cluster.preferences.icon = undefined;
      }

      if (cluster.preferences.clusterColor) {
        entity.spec.icon ??= {};
        entity.spec.icon.background = cluster.preferences.clusterColor;
      } else if (cluster.preferences.clusterColor === null) {
        if (entity.spec.icon) {
          entity.spec.icon.background = undefined;
        }
        cluster.preferences.clusterColor = undefined;
      }

      if (cluster.preferences.clusterIcon !== undefined && cluster.preferences.clusterIcon !== null) {
        entity.spec.icon ??= {};
        entity.spec.icon.material = cluster.preferences.clusterIcon || undefined;
      } else if (cluster.preferences.clusterIcon === null) {
        if (entity.spec.icon) {
          entity.spec.icon.material = undefined;
        }
        cluster.preferences.clusterIcon = undefined;
      }

      // Display name / alias propagation
      const effectiveAlias = cluster.preferences.clusterAlias || cluster.preferences.clusterName;

      if (effectiveAlias) {
        entity.metadata.name = effectiveAlias;
      }

      // Environment classification propagation
      entity.metadata.labels ??= {};
      const env = cluster.preferences.clusterEnvironment;

      if (env && env !== "none") {
        entity.spec.environment = env;
        entity.metadata.labels["devops.openlens.dev/environment"] = env;

        if (env === "production") {
          entity.metadata.labels["devops.openlens.dev/production"] = "true";
        } else {
          delete entity.metadata.labels["devops.openlens.dev/production"];
        }

        if (env === "custom" && cluster.preferences.customEnvironmentName) {
          entity.spec.customEnvironmentName = cluster.preferences.customEnvironmentName;
        } else {
          delete entity.spec.customEnvironmentName;
        }
      } else if (env === "none" || env === null) {
        delete entity.spec.environment;
        delete entity.spec.customEnvironmentName;
        delete entity.metadata.labels["devops.openlens.dev/environment"];
        delete entity.metadata.labels["devops.openlens.dev/production"];
      }
    };
  },
});

export default updateEntitySpecInjectable;
