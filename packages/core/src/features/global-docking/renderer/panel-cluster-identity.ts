/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Cluster } from "../../../common/cluster/cluster";
import { getConfiguredClusterColor, resolveClusterEnvironment } from "../../../common/cluster/environment-types";
import type { PanelAccent } from "../../../renderer/components/split-panel/panel-container";

// Theme's tertiary text color: visible on the graphite surfaces without suggesting an environment.
export const NEUTRAL_PANEL_ACCENT = "var(--textColorTertiary, #6F7D91)";

/**
 * Visual identity of the cluster that owns the global docking panels (H7.4).
 * Read-only view over the cluster preferences edited in Settings and in the
 * hotbar appearance dialog: there is no second copy of color or environment.
 */
export function resolvePanelClusterIdentity(clusterId: string, cluster: Cluster | undefined): PanelAccent {
  const preferences = cluster?.preferences;
  const environment = resolveClusterEnvironment({ preferences });
  const accent = getConfiguredClusterColor(preferences)
    ?? (environment.id !== "none" ? `var(${environment.cssVar}, ${environment.defaultColor})` : NEUTRAL_PANEL_ACCENT);

  return {
    clusterId,
    name: preferences?.clusterAlias || preferences?.clusterName || cluster?.contextName.get() || clusterId,
    accent,
    environment,
  };
}
