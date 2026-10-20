/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import { Dialog } from "../dialog";
import { ClusterAppearancePicker } from "./cluster-appearance-picker";
import type { Cluster } from "../../../common/cluster/cluster";
import type { KubernetesCluster } from "../../../common/catalog-entities";

export interface ClusterAppearanceDialogProps {
  cluster: Cluster;
  entity: KubernetesCluster;
  isOpen: boolean;
  close: () => void;
}

export const ClusterAppearanceDialog = observer(({
  cluster,
  entity,
  isOpen,
  close,
}: ClusterAppearanceDialogProps) => (
  <Dialog
    isOpen={isOpen}
    close={close}
    modal
    className="ClusterAppearanceDialog"
  >
    <div style={{ padding: "8px 0", minWidth: "440px", maxWidth: "520px" }}>
      <h2 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: 600 }}>
        Customize Cluster & Pin Appearance
      </h2>
      <ClusterAppearancePicker
        cluster={cluster}
        entity={entity}
        onClose={close}
      />
    </div>
  </Dialog>
));
