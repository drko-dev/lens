/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import type { PanelResourceBinding } from "../../../renderer/components/split-panel/split-panel-types";
import { IncidentWorkbenchPanel } from "../../incident-workbench/renderer/incident-workbench-panel";

export interface BoundIncidentWorkbenchProps {
  readonly binding?: PanelResourceBinding;
  readonly leafId?: string;
}

export const BoundIncidentWorkbench = observer(({ binding, leafId }: BoundIncidentWorkbenchProps) => {
  return (
    <div
      className="BoundIncidentWorkbench flex column box grow"
      style={{ height: "100%", minHeight: 0, overflow: "hidden" }}
      data-testid="bound-incident-workbench"
      data-leaf-id={leafId}
      data-cluster-id={binding?.clusterId}
    >
      <IncidentWorkbenchPanel />
    </div>
  );
});
