/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import type { Node } from "@openlens/kube-object";
import type { IComputedValue } from "mobx";
import type { Cluster } from "../../../common/cluster/cluster";
import { MenuItem } from "../menu";
import { Icon } from "../icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { KubeObjectMenuProps } from "../kube-object-menu";
import type { NodeApi } from "../../../common/k8s-api/endpoints";
import nodeApiInjectable from "../../../common/k8s-api/endpoints/node.api.injectable";
import type { OpenDrainNodeDialog } from "./drain-dialog/open.injectable";
import openDrainNodeDialogInjectable from "./drain-dialog/open.injectable";
import type { CreateNodeTerminalTab } from "../dock/terminal/create-node-terminal-tab.injectable";
import createNodeTerminalTabInjectable from "../dock/terminal/create-node-terminal-tab.injectable";
import type { OpenConfirmDialog } from "../confirm-dialog/open.injectable";
import openConfirmDialogInjectable from "../confirm-dialog/open.injectable";
import isProductionClusterInjectable from "../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import type { ShowCheckedErrorNotification } from "../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import type { ShowNotification } from "../notifications/notifications";
import showSuccessNotificationInjectable from "../notifications/show-success-notification.injectable";
import type { AuthorizeNodeShell } from "./authorize-node-shell.injectable";
import authorizeNodeShellInjectable from "./authorize-node-shell.injectable";
import styles from "../kube-object-menu/kube-object-menu.module.scss";

export interface NodeMenuProps extends KubeObjectMenuProps<Node> {}

interface Dependencies {
  nodeApi: NodeApi;
  openDrainDialog: OpenDrainNodeDialog;
  createNodeTerminalTab: CreateNodeTerminalTab;
  openConfirmDialog: OpenConfirmDialog;
  authorizeNodeShell: AuthorizeNodeShell;
  isProduction: IComputedValue<boolean>;
  cluster?: Cluster;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
  showSuccessNotification: ShowNotification;
}

const NonInjectedNodeMenu = ({
  object: node,
  toolbar,
  nodeApi,
  openDrainDialog,
  createNodeTerminalTab,
  openConfirmDialog,
  authorizeNodeShell,
  isProduction,
  cluster,
  showCheckedErrorNotification,
  showSuccessNotification,
}: Dependencies & NodeMenuProps) => {
  const isUnschedulable = node.isUnschedulable();
  const isProd = isProduction.get();
  const nodeShellEnabled = Boolean(cluster?.preferences?.nodeShellEnabled);
  const nodeName = node.getName();

  const handleCordon = () => {
    const initialClusterId = cluster?.id;

    openConfirmDialog({
      ok: async () => {
        if (initialClusterId && cluster?.id && cluster.id !== initialClusterId) {
          showCheckedErrorNotification("Cluster context changed", "Cordon cancelled for safety");

          return;
        }

        try {
          await nodeApi.cordon({ name: nodeName });
          showSuccessNotification(`Node ${nodeName} cordoned (unschedulable).`);
        } catch (err: any) {
          const status = err?.statusCode || err?.status || err?.response?.statusCode;
          const prefix = status === 403
            ? `Permission denied (RBAC 403 Forbidden)`
            : status === 409
              ? `Conflict (409)`
              : `Failed`;

          showCheckedErrorNotification(err, `${prefix} to cordon node ${nodeName}`);
        }
      },
      labelOk: "Cordon Node",
      message: (
        <div>
          {isProd && (
            <div className={styles.productionHazardBanner} data-testid="node-cordon-prod-warning">
              <Icon material="warning" className={styles.hazardIcon} />
              <span>CAUTION: You are cordoning a node in a PRODUCTION cluster!</span>
            </div>
          )}
          <p>
            {"Are you sure you want to cordon node "}
            <b>{nodeName}</b>
            {"? No new pods will be scheduled on this node."}
          </p>
        </div>
      ),
    });
  };

  const handleUncordon = async () => {
    const initialClusterId = cluster?.id;

    const executeUncordon = async () => {
      if (initialClusterId && cluster?.id && cluster.id !== initialClusterId) {
        showCheckedErrorNotification("Cluster context changed", "Uncordon cancelled for safety");

        return;
      }

      try {
        await nodeApi.uncordon({ name: nodeName });
        showSuccessNotification(`Node ${nodeName} uncordoned (schedulable).`);
      } catch (err: any) {
        const status = err?.statusCode || err?.status || err?.response?.statusCode;
        const prefix = status === 403
          ? `Permission denied (RBAC 403 Forbidden)`
          : status === 409
            ? `Conflict (409)`
            : `Failed`;

        showCheckedErrorNotification(err, `${prefix} to uncordon node ${nodeName}`);
      }
    };

    if (isProd) {
      openConfirmDialog({
        ok: executeUncordon,
        labelOk: "Uncordon Node",
        message: (
          <div>
            <div className={styles.productionHazardBanner} data-testid="node-uncordon-prod-warning">
              <Icon material="warning" className={styles.hazardIcon} />
              <span>CAUTION: You are uncordoning a node in a PRODUCTION cluster!</span>
            </div>
            <p>
              {"Are you sure you want to uncordon node "}
              <b>{nodeName}</b>
              {"? Kubernetes will immediately resume scheduling workloads to this production node."}
            </p>
          </div>
        ),
      });

      return;
    }

    await executeUncordon();
  };

  const handleNodeShell = async () => {
    if (!nodeShellEnabled) return;
    if (!cluster?.id) return;

    if (isProd) {
      const initialClusterId = cluster.id;

      // Main process owns the approval and the opaque grant/tab id. The renderer cannot register an
      // authorization: it only receives a main-issued tab id after a trusted confirmation.
      const authorization = await authorizeNodeShell({
        clusterId: initialClusterId,
        nodeName,
      });

      if (!authorization.granted || !authorization.tabId) {
        // Operator cancellation is an expected outcome, not an error worth interrupting them with.
        if (authorization.reason !== "confirmation-denied") {
          showCheckedErrorNotification(
            "Node Shell authorization was denied or cancelled. No session was started.",
            "Node Shell denied",
          );
        }

        return;
      }

      // Abort if the cluster context changed while the operator was confirming.
      if (cluster.id !== initialClusterId || !cluster.preferences?.nodeShellEnabled) {
        showCheckedErrorNotification(
          "Cluster context changed before the Node Shell session started. Session cancelled.",
          "Node Shell cancelled",
        );

        return;
      }

      // The tab is created only after Main has registered the single-use grant. Its id is the
      // main-issued grant id, so the subsequent WebSocket session can consume it unambiguously.
      createNodeTerminalTab({ nodeName, tabId: authorization.tabId });
    } else {
      createNodeTerminalTab({ nodeName });
    }
  };

  return (
    <>
      {isUnschedulable ? (
        <MenuItem
          onClick={handleUncordon}
          data-testid="menu-action-uncordon-node"
        >
          <Icon
            material="play_circle_outline"
            tooltip="Uncordon (Mark as Schedulable)"
            interactive={toolbar}
          />
          <span className="title">Uncordon</span>
        </MenuItem>
      ) : (
        <MenuItem
          onClick={handleCordon}
          data-testid="menu-action-cordon-node"
        >
          <Icon
            material="pause_circle_outline"
            tooltip="Cordon (Mark as Unschedulable)"
            interactive={toolbar}
          />
          <span className="title">Cordon</span>
        </MenuItem>
      )}

      <MenuItem
        onClick={() => openDrainDialog(node)}
        data-testid="menu-action-drain-node"
      >
        <Icon
          material="delete_sweep"
          tooltip="Safe Drain Node..."
          interactive={toolbar}
        />
        <span className="title">Drain</span>
      </MenuItem>

      <MenuItem
        onClick={handleNodeShell}
        disabled={!nodeShellEnabled}
        data-testid="menu-action-node-shell"
      >
        <Icon
          material="terminal"
          tooltip={
            nodeShellEnabled
              ? (isProd ? "Open Privileged Node Shell (High Risk)" : "Open Privileged Node Shell")
              : "Node shell is disabled for this cluster. Enable host access in Cluster Settings."
          }
          interactive={toolbar}
        />
        <span className="title">Node Shell</span>
      </MenuItem>
    </>
  );
};

export const NodeMenu = withInjectables<Dependencies, NodeMenuProps>(NonInjectedNodeMenu, {
  getProps: (di, props) => ({
    ...props,
    nodeApi: di.inject(nodeApiInjectable),
    openDrainDialog: di.inject(openDrainNodeDialogInjectable),
    createNodeTerminalTab: di.inject(createNodeTerminalTabInjectable),
    openConfirmDialog: di.inject(openConfirmDialogInjectable),
    authorizeNodeShell: di.inject(authorizeNodeShellInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    cluster: di.inject(hostedClusterInjectable),
    showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
    showSuccessNotification: di.inject(showSuccessNotificationInjectable),
  }),
});
