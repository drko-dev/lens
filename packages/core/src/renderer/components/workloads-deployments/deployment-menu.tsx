/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import type { IComputedValue } from "mobx";
import type { KubeObjectMenuProps } from "../kube-object-menu";
import type { Deployment } from "@openlens/kube-object";
import { MenuItem } from "../menu";
import { Icon } from "../icon";
import type { OpenDeploymentScaleDialog } from "./scale/open.injectable";
import { withInjectables } from "@ogre-tools/injectable-react";
import deploymentApiInjectable from "../../../common/k8s-api/endpoints/deployment.api.injectable";
import openDeploymentScaleDialogInjectable from "./scale/open.injectable";
import type { OpenConfirmDialog } from "../confirm-dialog/open.injectable";
import openConfirmDialogInjectable from "../confirm-dialog/open.injectable";
import type { ShowCheckedErrorNotification } from "../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import type { DeploymentApi } from "../../../common/k8s-api/endpoints";
import type { Cluster } from "../../../common/cluster/cluster";
import isProductionClusterInjectable from "../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import type { OpenRolloutRollbackDialog } from "./rollout/open.injectable";
import openRolloutRollbackDialogInjectable from "./rollout/open.injectable";
import { getHttpStatusCodeForRolloutError } from "./rollout/errors";

export interface DeploymentMenuProps extends KubeObjectMenuProps<Deployment> {}

interface Dependencies {
  openDeploymentScaleDialog: OpenDeploymentScaleDialog;
  deploymentApi: DeploymentApi;
  openConfirmDialog: OpenConfirmDialog;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
  openRolloutRollbackDialog: OpenRolloutRollbackDialog;
  isProduction: IComputedValue<boolean>;
  hostedCluster: Cluster | undefined;
}

const NonInjectedDeploymentMenu = ({
  deploymentApi,
  object,
  openDeploymentScaleDialog,
  toolbar,
  openConfirmDialog,
  showCheckedErrorNotification,
  openRolloutRollbackDialog,
  isProduction,
  hostedCluster,
}: Dependencies & DeploymentMenuProps) => {
  const paused = Boolean(object.spec?.paused);
  const production = isProduction.get();
  const clusterName = hostedCluster?.name.get() ?? "unknown";
  const currentContext = React.useRef({
    clusterId: hostedCluster?.id ?? "unknown",
    clusterName,
    production,
  });
  const mounted = React.useRef(true);

  currentContext.current = { clusterId: hostedCluster?.id ?? "unknown", clusterName, production };
  React.useEffect(() => {
    mounted.current = true;

    return () => { mounted.current = false; };
  }, []);

  const togglePaused = () => {
    const requestedContext = { ...currentContext.current };
    const desiredPaused = !paused;
    const params = { namespace: object.getNs(), name: object.getName() };
    const contextIsCurrent = () => (
      mounted.current
      && currentContext.current.clusterId === requestedContext.clusterId
      && currentContext.current.production === requestedContext.production
    );
    const apply = async () => {
      if (!contextIsCurrent()) {
        showCheckedErrorNotification(new Error("Cluster context changed."), "Cluster context changed; reopen the Deployment menu before changing the rollout.");

        return;
      }

      try {
        const fresh = await deploymentApi.get(params);

        if (!contextIsCurrent()) {
          showCheckedErrorNotification(new Error("Cluster context changed."), "Cluster context changed; no rollout change was sent.");

          return;
        }

        if (!fresh) {
          throw new Error("The Deployment no longer exists.");
        }

        if (
          fresh.getName() !== params.name
          || fresh.getNs() !== params.namespace
          || !object.metadata.uid
          || fresh.metadata.uid !== object.metadata.uid
        ) {
          throw new Error("The Deployment identity changed; refresh it before changing the rollout.");
        }

        const uid = fresh.metadata.uid;
        const resourceVersion = fresh.metadata.resourceVersion;

        if (!uid || !resourceVersion) {
          throw new Error("The Deployment has no verifiable UID or resourceVersion.");
        }

        if (Boolean(fresh.spec?.paused) === desiredPaused) {
          return;
        }

        if (!contextIsCurrent()) {
          showCheckedErrorNotification(new Error("Cluster context changed."), "Cluster context changed; no rollout change was sent.");

          return;
        }

        const updated = await deploymentApi.setPaused(params, desiredPaused, { uid, resourceVersion });

        if (!contextIsCurrent()) {
          showCheckedErrorNotification(
            new Error("Cluster context changed while the request was in flight."),
            "Cluster context changed while the request was in flight. The API may have accepted the change; verify the original cluster before retrying.",
          );

          return;
        }

        if (
          !updated
          || updated.getName() !== params.name
          || updated.getNs() !== params.namespace
          || updated.metadata.uid !== uid
          || !updated.metadata.resourceVersion
          || Boolean(updated.spec?.paused) !== desiredPaused
        ) {
          throw new Error("The API response did not verify the requested rollout state.");
        }
      } catch (err) {
        const statusCode = getHttpStatusCodeForRolloutError(err);
        const fallback = statusCode === 403
          ? "You do not have permission to change this Deployment (RBAC 403)."
          : statusCode === 404
            ? "The Deployment no longer exists."
            : statusCode === 409
              ? "The Deployment changed concurrently. Refresh it and retry the rollout action."
              : `Unable to ${desiredPaused ? "pause" : "resume"} the rollout safely.`;

        showCheckedErrorNotification(err, fallback);
      }
    };

    if (!production) {
      void apply();

      return;
    }

    openConfirmDialog({
      ok: apply,
      labelOk: desiredPaused ? "Pause rollout" : "Resume rollout",
      message: (
        <p>
          <b className="production-warning">
            PRODUCTION CLUSTER (
            {requestedContext.clusterName}
            {" · "}
            {requestedContext.clusterId}
            )
          </b>
          <br/>
          Are you sure you want to
          {" "}
          {desiredPaused ? "pause" : "resume"}
          {" "}
          the rollout of
          {" "}
          <b>
            {object.getNs()}
            /
            {object.getName()}
          </b>
          ?
        </p>
      ),
    });
  };

  return (
    <>
      <MenuItem onClick={() => openDeploymentScaleDialog(object)}>
        <Icon
          material="open_with"
          tooltip="Scale"
          interactive={toolbar}
        />
        <span className="title">Scale</span>
      </MenuItem>
      <MenuItem
        onClick={() => openConfirmDialog({
          ok: async () =>
          {
            try {
              await deploymentApi.restart({
                namespace: object.getNs(),
                name: object.getName(),
              });
            } catch (err) {
              showCheckedErrorNotification(err, "Unknown error occurred while restarting deployment");
            }
          },
          labelOk: "Restart",
          message: (
            <p>
              {"Are you sure you want to restart deployment "}
              <b>{object.getName()}</b>
              ?
            </p>
          ),
        })}
      >
        <Icon
          material="autorenew"
          tooltip="Restart"
          interactive={toolbar}
        />
        <span className="title">Restart</span>
      </MenuItem>
      <MenuItem
        data-testid="deployment-menu-rollback"
        onClick={() => openRolloutRollbackDialog({ deployment: object })}
      >
        <Icon
          material="history"
          tooltip="Rollback"
          interactive={toolbar}
        />
        <span className="title">Rollback…</span>
      </MenuItem>
      <MenuItem
        data-testid={paused ? "menu-action-resume-rollout" : "menu-action-pause-rollout"}
        onClick={togglePaused}
      >
        <Icon
          material={paused ? "play_circle_outline" : "pause_circle_outline"}
          tooltip={paused ? "Resume rollout" : "Pause rollout"}
          interactive={toolbar}
        />
        <span className="title">{paused ? "Resume rollout" : "Pause rollout"}</span>
      </MenuItem>
    </>
  );
};

export const DeploymentMenu = withInjectables<Dependencies, DeploymentMenuProps>(NonInjectedDeploymentMenu, {
  getProps: (di, props) => ({
    ...props,
    deploymentApi: di.inject(deploymentApiInjectable),
    openDeploymentScaleDialog: di.inject(openDeploymentScaleDialogInjectable),
    openConfirmDialog: di.inject(openConfirmDialogInjectable),
    showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
    openRolloutRollbackDialog: di.inject(openRolloutRollbackDialogInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
});
