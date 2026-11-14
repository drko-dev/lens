/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import randomColor from "randomcolor";
import type { CatalogEntity } from "../../../common/catalog";

export interface NavigatorClusterRowProps {
  entity: CatalogEntity;
  onRun: (entity: CatalogEntity) => void;
}

/** One non-active cluster row of the NovaKube Navigator (cluster frame and root frame). */
export const NavigatorClusterRow = ({ entity, onRun }: NavigatorClusterRowProps) => {
  const name = entity.getName();
  const pinColor = entity.spec.icon?.background
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
};
