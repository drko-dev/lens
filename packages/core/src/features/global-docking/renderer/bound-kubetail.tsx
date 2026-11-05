/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import splitPanelStyles from "../../../renderer/components/split-panel/split-panel.module.scss";
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../renderer/components/icon";
import type { PanelResourceBinding } from "../../../renderer/components/split-panel/split-panel-types";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
// Lazy on purpose: kubetail-page imports the panel registry that panel-content-resolver (our importer) initialises.
const KubetailPage = React.lazy(async () => ({ default: (await import("../../../renderer/components/kubetail/kubetail-page")).KubetailPage }));

import { RestoredSessionGuard } from "./restored-session-placeholder";

export interface BoundKubetailProps {
  readonly binding: PanelResourceBinding;
  /** H7.7: lets the restored-session gate keep the view inert after a restart. */
  readonly leafId?: string;
}

interface Dependencies {
  hostedClusterId: string | undefined;
}

/**
 * H7.6.3E: the original Kubetail page as a single-instance view of the frame's KubetailStore.
 * The store owns the streams, the selection and the history; this panel never creates any of them,
 * so moving, grouping or collapsing remounts the view onto the same state. It must not write the
 * selection into the classic split-panel store (skipSplitBinding) and keeps streams on unmount.
 */
const NonInjectedBoundKubetail = observer(({ binding, hostedClusterId }: BoundKubetailProps & Dependencies) => {
  if (binding.clusterId && binding.clusterId !== hostedClusterId) {
    return (
      <div className={splitPanelStyles.emptyDetailsState} data-testid="bound-kubetail-unavailable" data-cluster-id={binding.clusterId}>
        <Icon material="info" className={splitPanelStyles.emptyIcon} />
        <span className={splitPanelStyles.emptyTitle}>Kubetail</span>
        <span className={splitPanelStyles.emptyDescription}>This Kubetail session belongs to another cluster.</span>
      </div>
    );
  }

  return (
    <div
      className="BoundKubetail flex column box grow"
      style={{ height: "100%", minHeight: 0, overflow: "hidden" }}
      data-testid="bound-kubetail"
      data-tab-id={binding.tabId}
      data-cluster-id={binding.clusterId}
    >
      <React.Suspense fallback={null}>
        <KubetailPage isNestedInSplit preserveStreamsOnUnmount skipSplitBinding />
      </React.Suspense>
    </div>
  );
});

const InnerBoundKubetail = withInjectables<Dependencies, BoundKubetailProps>(NonInjectedBoundKubetail, {
  getProps: (di, props) => ({
    ...props,
    hostedClusterId: di.inject(hostedClusterIdInjectable) ?? undefined,
  }),
});

export const BoundKubetail = (props: BoundKubetailProps) => (
  <RestoredSessionGuard kind="kubetail" leafId={props.leafId}>
    <InnerBoundKubetail {...props} />
  </RestoredSessionGuard>
);
