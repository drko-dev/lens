/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { KubeObject } from "@openlens/kube-object";
import type { Cluster } from "../../../common/cluster/cluster";
import type { DetachedToolWindowsFeatureFlag } from "../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import detachedToolWindowsFeatureFlagInjectable from "../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import type { DetachToolRequest } from "../../../common/detached-tools/detached-tool-channels";
import { detachedToolFrameChannels } from "../../../common/detached-tools/detached-tool-channels";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../utils/channel/ipc-renderer.injectable";
import type { ShowCheckedErrorNotification } from "../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import { Icon } from "../icon";
import { MenuItem } from "../menu";

export interface DetachInspectorMenuItemProps {
  object: KubeObject;
  toolbar?: boolean;
}

interface Dependencies {
  flag: DetachedToolWindowsFeatureFlag;
  hostedCluster: Cluster | undefined;
  invoke: (channel: string, payload: unknown) => Promise<unknown>;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
}

const NonInjectedDetachInspectorMenuItem = observer(({ object, toolbar, flag, hostedCluster, invoke, showCheckedErrorNotification }: DetachInspectorMenuItemProps & Dependencies) => {
  const uid = object?.metadata?.uid;

  if (!flag.isEnabled || !hostedCluster || !uid || !object.apiVersion) {
    return null;
  }

  const detach = async () => {
    const request: DetachToolRequest = {
      clusterId: hostedCluster.id,
      workspaceId: "default",
      tabId: `inspect-${uid}`,
      toolKind: "inspector",
      resource: {
        apiVersion: object.apiVersion,
        kind: object.kind,
        name: object.getName(),
        uid,
        ...(object.getNs() ? { namespace: object.getNs() } : {}),
      },
    };

    try {
      await invoke(detachedToolFrameChannels.requestDetach, request);
    } catch (error) {
      showCheckedErrorNotification(error, "Could not open the detached inspector");
    }
  };

  return (
    <MenuItem onClick={detach} data-testid="detach-inspector-btn">
      <Icon
        material="open_in_new"
        tooltip="Inspect in a detached window (read-only)"
        interactive={toolbar} />
      <span className="title">Inspect (detached)</span>
    </MenuItem>
  );
});

export const DetachInspectorMenuItem = withInjectables<Dependencies, DetachInspectorMenuItemProps>(NonInjectedDetachInspectorMenuItem, {
  getProps: (di, props) => ({
    ...props,
    flag: di.inject(detachedToolWindowsFeatureFlagInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
    invoke: (channel, payload) => di.inject(ipcRendererInjectable).invoke(channel, payload),
    showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
  }),
});
