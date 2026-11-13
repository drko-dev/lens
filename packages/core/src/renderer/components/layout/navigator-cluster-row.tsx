/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import type { CatalogEntity } from "../../../common/catalog";

export interface NavigatorClusterRowProps {
  entity: CatalogEntity;
  onRun: (entity: CatalogEntity) => void;
}

/** One non-active cluster row of the NovaKube Navigator (cluster frame and root frame). */
export const NavigatorClusterRow = ({ entity, onRun }: NavigatorClusterRowProps) => (
  <button
    type="button"
    className="navigator-cluster-root navigator-cluster-other"
    data-testid="navigator-cluster-other"
    aria-label={`Open ${entity.getName()}`}
    onClick={() => onRun(entity)}
    style={{ "--nv-active-cluster-color": entity.spec.icon?.background } as React.CSSProperties}
  >
    <span className="navigator-cluster-pin" aria-hidden="true" />
    <span className="navigator-cluster-label" title={entity.getName()}>{entity.getName()}</span>
  </button>
);
