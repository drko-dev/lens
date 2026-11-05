/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import splitPanelStyles from "../../../renderer/components/split-panel/split-panel.module.scss";
import React, { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { reaction } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../renderer/components/icon";
import type { PanelResourceBinding } from "../../../renderer/components/split-panel/split-panel-types";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import { TerminalWindow } from "../../../renderer/components/dock/terminal/view";
import terminalStoreInjectable from "../../../renderer/components/dock/terminal/store.injectable";
import type { TerminalStore } from "../../../renderer/components/dock/terminal/store";
import { TabKind } from "../../../renderer/components/dock/dock/store";
import globalPanelStoreInjectable from "./global-panel-store.injectable";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";

import { RestoredSessionGuard } from "./restored-session-placeholder";

export interface BoundTerminalProps {
  readonly binding: PanelResourceBinding;
  readonly leafId: string;
}

interface Dependencies {
  hostedClusterId: string | undefined;
  terminalStore: TerminalStore;
  panelStore: SplitPanelStore;
}

/**
 * H7.6.3D: the original Lens TerminalWindow inside a docked panel. The PTY session is keyed by the
 * stable `docked-terminal:<cluster>:<uuid>` tab id, so moving, collapsing or switching tabs remounts
 * the view onto the same TerminalStore entry (same websocket, same xterm buffer, same PTY in main).
 */
const NonInjectedBoundTerminal = observer(({ binding, leafId, hostedClusterId, terminalStore, panelStore }: BoundTerminalProps & Dependencies) => {
  const sameCluster = !binding.clusterId || binding.clusterId === hostedClusterId;
  const tabId = binding.tabId;
  const bodyRef = useRef<HTMLDivElement>(null);

  // Refit when the panel is resized by a splitter or restored; a collapsed (0-size) host is ignored by Terminal.fit.
  useEffect(() => {
    const body = bodyRef.current;

    if (!sameCluster || !tabId || !body || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => terminalStore.getTerminal(tabId)?.fitLazy());

    observer.observe(body);

    return () => observer.disconnect();
  }, [sameCluster, tabId, terminalStore]);

  // A clean shell exit closes the panel the same way the classic Dock closes its tab.
  useEffect(() => {
    if (!sameCluster || !tabId) {
      return;
    }

    return reaction(
      () => terminalStore.isCleanExit(tabId),
      (isClean) => {
        if (isClean) {
          void panelStore.requestClosePanel(leafId);
        }
      },
    );
  }, [sameCluster, tabId, terminalStore, panelStore, leafId]);

  if (!sameCluster || !tabId) {
    return (
      <div className={splitPanelStyles.emptyDetailsState} data-testid="bound-terminal-unavailable" data-cluster-id={binding.clusterId}>
        <Icon material="info" className={splitPanelStyles.emptyIcon} />
        <span className={splitPanelStyles.emptyTitle}>Terminal</span>
        <span className={splitPanelStyles.emptyDescription}>
          This terminal session belongs to another cluster.
        </span>
      </div>
    );
  }

  const tab = { id: tabId, kind: TabKind.TERMINAL, title: binding.name, pinned: false };

  return (
    <div
      ref={bodyRef}
      className="BoundTerminal flex column box grow"
      style={{ height: "100%", minHeight: 0, overflow: "hidden" }}
      data-testid="bound-terminal"
      data-tab-id={tabId}
      data-cluster-id={binding.clusterId}
    >
      <TerminalWindow tab={tab} />
    </div>
  );
});

const InnerBoundTerminal = withInjectables<Dependencies, BoundTerminalProps>(NonInjectedBoundTerminal, {
  getProps: (di, props) => ({
    ...props,
    hostedClusterId: di.inject(hostedClusterIdInjectable) ?? undefined,
    terminalStore: di.inject(terminalStoreInjectable),
    panelStore: di.inject(globalPanelStoreInjectable),
  }),
});

export const BoundTerminal = (props: BoundTerminalProps) => (
  <RestoredSessionGuard kind="terminal" leafId={props.leafId}>
    <InnerBoundTerminal {...props} />
  </RestoredSessionGuard>
);
