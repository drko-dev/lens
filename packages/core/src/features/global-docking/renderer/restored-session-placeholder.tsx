/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import splitPanelStyles from "../../../renderer/components/split-panel/split-panel.module.scss";
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../renderer/components/icon";
import type { RestoredSessionGate } from "./restored-session-gate";
import restoredSessionGateInjectable from "./restored-session-gate.injectable";

export type RestoredSessionKind = "terminal" | "pod-logs" | "resource-editor" | "kubetail";

const messages: Record<RestoredSessionKind, string> = {
  terminal: "This terminal session was not restored. Starting it opens a new session.",
  "pod-logs": "Logs are not streaming until you resume.",
  "resource-editor": "The editor will load the resource when you open it.",
  kubetail: "Kubetail streams start when you resume.",
};

/** H7.7: inert stand-in for a restored session panel. It touches no session store; only the button releases the gate. */
export const RestoredSessionPlaceholder = ({ kind, onResume }: { kind: RestoredSessionKind; onResume: () => void }) => (
  <div className={splitPanelStyles.emptyDetailsState} data-testid="restored-session-placeholder" data-panel-kind={kind}>
    <Icon material="info" className={splitPanelStyles.emptyIcon} />
    <span className={splitPanelStyles.emptyDescription}>{messages[kind]}</span>
    <button
      type="button"
      className={`${splitPanelStyles.redockButton}`}
      data-testid="restored-session-resume"
      onClick={onResume}
    >
      {kind === "terminal" ? "Start new session" : "Resume"}
    </button>
  </div>
);

interface GuardProps {
  readonly kind: RestoredSessionKind;
  readonly leafId?: string;
  readonly children: React.ReactNode;
}

interface GuardDependencies {
  gate: RestoredSessionGate;
}

const NonInjectedRestoredSessionGuard = observer(({ kind, leafId, gate, children }: GuardProps & GuardDependencies) =>
  leafId && gate.isInert(leafId)
    ? <RestoredSessionPlaceholder kind={kind} onResume={() => gate.release(leafId)} />
    : <>{children}</>);

/** Mounts children (the real session view) only while the leaf is not in the restored-session gate. */
export const RestoredSessionGuard = withInjectables<GuardDependencies, GuardProps>(NonInjectedRestoredSessionGuard, {
  getProps: (di, props) => ({ ...props, gate: di.inject(restoredSessionGateInjectable) }),
});
