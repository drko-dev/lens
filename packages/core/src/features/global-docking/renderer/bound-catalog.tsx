/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { rootViewBoxStyle } from "./bound-settings";

const Catalog = React.lazy(async () => ({ default: (await import("../../../renderer/components/catalog/catalog")).Catalog }));

/**
 * H7.6.4: the real Cluster Catalog inside a panel. Category selection keeps using the existing
 * catalog route params / persisted previous tab; the singleton catalog entity store is shared, not duplicated.
 */
export const BoundCatalog = () => (
  <div
    className="BoundCatalog"
    style={rootViewBoxStyle}
    data-testid="bound-catalog">
    <React.Suspense fallback={null}>
      <Catalog />
    </React.Suspense>
  </div>
);
