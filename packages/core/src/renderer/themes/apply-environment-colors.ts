/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ClusterEnvironment } from "../../common/cluster/environment-types";
import { CLUSTER_ENVIRONMENTS } from "../../common/cluster/environment-types";

export function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace("#", "").trim();

  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return hex;
}

/**
 * Dynamically applies customized environment colors to the document root as CSS variables.
 * Production color is strictly locked to prevent misidentification.
 */
export function applyEnvironmentColors(
  customColors: Record<string, string> | undefined,
  isLight = false,
): void {
  if (typeof document === "undefined") {
    return;
  }

  const rootStyle = document.documentElement.style;
  const envKeys = Object.keys(CLUSTER_ENVIRONMENTS) as ClusterEnvironment[];

  for (const envId of envKeys) {
    // Safety guard: Production is strictly locked and cannot be overridden
    if (envId === "production") {
      continue;
    }

    const config = CLUSTER_ENVIRONMENTS[envId];
    const customColor = customColors?.[envId];

    if (customColor && customColor.trim()) {
      rootStyle.setProperty(config.cssVar, customColor);
      rootStyle.setProperty(
        `${config.cssVar}Soft`,
        hexToRgba(customColor, isLight ? 0.12 : 0.16),
      );
    } else {
      rootStyle.removeProperty(config.cssVar);
      rootStyle.removeProperty(`${config.cssVar}Soft`);
    }
  }
}
