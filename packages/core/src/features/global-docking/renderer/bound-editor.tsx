/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import splitPanelStyles from "../../../renderer/components/split-panel/split-panel.module.scss";
import React, { useLayoutEffect } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../renderer/components/icon";
import type { PanelResourceBinding } from "../../../renderer/components/split-panel/split-panel-types";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import { dockedEditorTabId } from "./global-panel-store";
import { EditResource } from "../../../renderer/components/dock/edit-resource/view";
import editResourceTabStoreInjectable from "../../../renderer/components/dock/edit-resource/store.injectable";
import type { EditResourceTabStore } from "../../../renderer/components/dock/edit-resource/store";
import editResourceModelInjectable from "../../../renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable";
import globalPanelStoreInjectable from "./global-panel-store.injectable";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import type { DiContainerForInjection } from "@ogre-tools/injectable";

import { RestoredSessionGuard } from "./restored-session-placeholder";

export interface BoundEditorProps {
  readonly binding: PanelResourceBinding;
  readonly leafId: string;
}

interface Dependencies {
  hostedClusterId: string | undefined;
  editStore: EditResourceTabStore;
  di: DiContainerForInjection;
  panelStore: SplitPanelStore;
}

/**
 * H7.6.3C: the original Lens editor inside a docked panel. The edit session is keyed by the stable
 * `docked-edit:<cluster>:<selfLink>` id, so moving, collapsing or switching tabs remounts the view
 * onto the same draft, the same EditResourceModel and the same Monaco model.
 */
const NonInjectedBoundEditor = observer(({ binding, leafId, hostedClusterId, editStore, di, panelStore }: BoundEditorProps & Dependencies) => {
  const sameCluster = !binding.clusterId || binding.clusterId === hostedClusterId;
  const tabId = binding.tabId || dockedEditorTabId(binding);

  // Layout effect on purpose: the session data must exist before EditResource (a child) asks for the model.
  useLayoutEffect(() => {
    if (!sameCluster || !binding.selfLink) {
      return;
    }

    if (!editStore.getData(tabId)) {
      editStore.setData(tabId, { resource: binding.selfLink });

      // A model kept alive from a previous (released) session would show an empty document.
      void Promise.resolve(di.inject(editResourceModelInjectable, tabId)).then((model) => {
        if (!model.editingResource.firstDraft) {
          void model.load();
        }
      });
    }
  }, [tabId, binding.selfLink, sameCluster, editStore, di]);

  const identity = {
    "data-kind": binding.kind,
    "data-namespace": binding.namespace ?? "",
    "data-name": binding.name,
    "data-tab-id": tabId,
    "data-cluster-id": binding.clusterId,
  };

  if (!sameCluster) {
    return (
      <div className={splitPanelStyles.emptyDetailsState} data-testid="bound-editor-unavailable" {...identity}>
        <Icon material="info" className={splitPanelStyles.emptyIcon} />
        <span className={splitPanelStyles.emptyTitle}>{`Edit: ${binding.name}`}</span>
        <span className={splitPanelStyles.emptyDescription}>
          This resource belongs to another cluster.
        </span>
      </div>
    );
  }

  return (
    <div className="BoundEditor flex column box grow" style={{ height: "100%", minHeight: 0, overflow: "hidden" }} data-testid="bound-editor" {...identity}>
      <EditResource tabId={tabId} onClose={() => { void panelStore.requestClosePanel(leafId); }} />
    </div>
  );
});

const InnerBoundEditor = withInjectables<Dependencies, BoundEditorProps>(NonInjectedBoundEditor, {
  getProps: (di, props) => ({
    ...props,
    hostedClusterId: di.inject(hostedClusterIdInjectable) ?? undefined,
    editStore: di.inject(editResourceTabStoreInjectable),
    di,
    panelStore: di.inject(globalPanelStoreInjectable),
  }),
});

export const BoundEditor = (props: BoundEditorProps) => (
  <RestoredSessionGuard kind="resource-editor" leafId={props.leafId}>
    <InnerBoundEditor {...props} />
  </RestoredSessionGuard>
);
