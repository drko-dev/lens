/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./deployment-replicasets.scss";

import React from "react";
import { disposeOnUnmount, observer } from "mobx-react";
import { observable, makeObservable, runInAction } from "mobx";
import type { Deployment, ReplicaSet } from "@openlens/kube-object";
import { Spinner } from "../spinner";
import { prevDefault, stopPropagation } from "@openlens/utilities";
import { DrawerTitle } from "../drawer";
import { Table, TableCell, TableHead, TableRow } from "../table";
import { Icon } from "../icon";
import type { ShowDetails } from "../kube-detail-params/show-details.injectable";
import { withInjectables } from "@ogre-tools/injectable-react";
import showDetailsInjectable from "../kube-detail-params/show-details.injectable";
import type { DeploymentApi, ReplicaSetApi } from "../../../common/k8s-api/endpoints";
import deploymentApiInjectable from "../../../common/k8s-api/endpoints/deployment.api.injectable";
import replicaSetApiInjectable from "../../../common/k8s-api/endpoints/replica-set.api.injectable";
import type { OpenRolloutRollbackDialog } from "./rollout/open.injectable";
import openRolloutRollbackDialogInjectable from "./rollout/open.injectable";
import type { OpenRevisionDiffDialog } from "./rollout/diff-open.injectable";
import openRevisionDiffDialogInjectable from "./rollout/diff-open.injectable";
import type {
  DeploymentRevision,
  DeploymentRevisionHistory,
} from "./rollout/revisions";
import { buildDeploymentRevisionHistory } from "./rollout/revisions";
import { getHttpStatusCodeForRolloutError } from "./rollout/errors";

export interface DeploymentReplicaSetsProps {
  deployment: Deployment;
}

interface Dependencies {
  deploymentApi: DeploymentApi;
  replicaSetApi: ReplicaSetApi;
  showDetails: ShowDetails;
  openRolloutRollbackDialog: OpenRolloutRollbackDialog;
  openRevisionDiffDialog: OpenRevisionDiffDialog;
}

type LoadState = "loading" | "ready" | "error";

@observer
class NonInjectedDeploymentReplicaSets extends React.Component<DeploymentReplicaSetsProps & Dependencies> {
  @observable history?: DeploymentRevisionHistory;
  @observable loadState: LoadState = "loading";
  @observable errorMessage = "";
  @observable errorKind: "forbidden" | "not-found" | "unknown" = "unknown";
  private loadGeneration = 0;
  private lastResourceVersion?: string;

  constructor(props: DeploymentReplicaSetsProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    disposeOnUnmount(this, []);
    this.loadHistory();
  }

  componentDidUpdate(prevProps: DeploymentReplicaSetsProps) {
    const resourceVersion = this.props.deployment.metadata.resourceVersion;

    if (
      prevProps.deployment.getId() !== this.props.deployment.getId()
      || (resourceVersion !== undefined && resourceVersion !== this.lastResourceVersion)
    ) {
      this.loadHistory();
    }
  }

  componentWillUnmount() {
    this.loadGeneration++;
  }

  private async loadHistory() {
    const generation = ++this.loadGeneration;
    const deployment = this.props.deployment;

    this.lastResourceVersion = deployment.metadata.resourceVersion;

    runInAction(() => {
      this.loadState = "loading";
      this.errorMessage = "";
      this.history = undefined;
    });

    try {
      const fresh = await this.props.deploymentApi.get({
        name: deployment.getName(),
        namespace: deployment.getNs(),
      });

      if (generation !== this.loadGeneration) {
        return;
      }

      if (!fresh) {
        runInAction(() => {
          this.loadState = "error";
          this.errorKind = "not-found";
          this.errorMessage = "The Deployment no longer exists. Rollout history is unavailable.";
        });

        return;
      }

      const replicaSets = await this.props.replicaSetApi.list({
        namespace: deployment.getNs(),
      });

      if (generation !== this.loadGeneration) {
        return;
      }

      const history = buildDeploymentRevisionHistory(fresh, (replicaSets ?? []) as ReplicaSet[]);

      runInAction(() => {
        this.history = history;
        this.loadState = "ready";
      });
    } catch (err) {
      if (generation !== this.loadGeneration) {
        return;
      }

      const statusCode = getHttpStatusCodeForRolloutError(err);

      runInAction(() => {
        this.loadState = "error";
        this.errorKind = statusCode === 403 ? "forbidden" : statusCode === 404 ? "not-found" : "unknown";
        this.errorMessage = this.errorKind === "forbidden"
          ? "You do not have permission to read this Deployment or its ReplicaSets (RBAC 403)."
          : this.errorKind === "not-found"
            ? "The Deployment or its ReplicaSets were not found (404)."
            : `Failed to load rollout history: ${(err as Error)?.message ?? String(err)}`;
      });
    }
  }

  private openDiff = (revision: DeploymentRevision) => {
    const { deployment } = this.props;

    this.props.openRevisionDiffDialog({
      deployment,
      revision,
    });
  };

  private openRollback = (revision: DeploymentRevision) => {
    const { deployment } = this.props;

    this.props.openRolloutRollbackDialog({
      deployment,
      preferredRevision: revision.revision ?? undefined,
    });
  };

  private renderImages(revision: DeploymentRevision) {
    if (revision.images.length === 0) {
      return <span className="muted">—</span>;
    }

    const visible = revision.images.slice(0, 2);
    const hidden = revision.images.length - visible.length;

    return (
      <div className="image-list">
        {visible.map(image => (
          <span key={`${image.init ? "init" : "app"}-${image.container}-${image.image}`} className="image-chip">
            {image.init && <span className="init-label">init</span>}
            <span className="image-name">{image.image}</span>
          </span>
        ))}
        {hidden > 0 && (
          <span
            className="image-chip more"
            title={revision.images.slice(2).map(image => image.image).join("\n")}
          >
            +
            {hidden}
          </span>
        )}
      </div>
    );
  }

  private renderStatus(revision: DeploymentRevision) {
    if (!revision.valid) {
      return <span className="revision-status invalid" title={revision.invalidReason}>Invalid</span>;
    }

    if (revision.availability === "current") {
      return <span className="revision-status current">Current</span>;
    }

    if (revision.availability === "active") {
      return <span className="revision-status active">Active</span>;
    }

    return <span className="revision-status historical">Historical</span>;
  }

  private renderWarnings(history: DeploymentRevisionHistory) {
    const warnings: string[] = [];

    if (history.fatalReason) {
      return <div className="history-warning danger">{history.fatalReason}</div>;
    }

    if (history.historyIncomplete) {
      warnings.push(
        history.revisionHistoryLimitIsDefault
          ? `Revision history is incomplete; older revisions were removed (revisionHistoryLimit defaults to ${history.revisionHistoryLimit}).`
          : `Revision history is incomplete; older revisions were removed (revisionHistoryLimit=${history.revisionHistoryLimit}).`,
      );
    }

    if (history.currentRevisionSource === "inferred") {
      warnings.push("The current revision could not be confirmed from the Deployment annotation; it was inferred from the highest valid revision.");
    }

    if (history.duplicateRevisions.length > 0) {
      warnings.push(`Duplicate revision numbers detected: ${history.duplicateRevisions.map(number => `#${number}`).join(", ")}. Those entries are disabled.`);
    }

    if (history.invalidReplicaSets > 0) {
      warnings.push(`${history.invalidReplicaSets} ReplicaSet(s) have an invalid revision or template and are disabled.`);
    }

    if (history.foreignReplicaSets > 0) {
      warnings.push(`${history.foreignReplicaSets} ReplicaSet(s) belong to another owner and were excluded.`);
    }

    if (history.orphanReplicaSets > 0) {
      warnings.push(`${history.orphanReplicaSets} orphan ReplicaSet(s) without an owner were excluded.`);
    }

    if (warnings.length === 0) {
      return null;
    }

    return (
      <div className="history-warnings">
        {warnings.map(warning => (
          <div key={warning} className="history-warning">
            <Icon material="warning" small/>
            <span>{warning}</span>
          </div>
        ))}
      </div>
    );
  }

  render() {
    const { deployment, showDetails } = this.props;
    const { history, loadState } = this;
    const configuredReplicas = deployment.spec?.replicas ?? 0;
    const paused = Boolean(deployment.spec?.paused);

    if (loadState === "loading") {
      return (
        <div className="ReplicaSets">
          <DrawerTitle>Deploy Revisions</DrawerTitle>
          <div className="history-loading" data-testid="rollout-history-loading"><Spinner center/></div>
        </div>
      );
    }

    if (loadState === "error") {
      return (
        <div className="ReplicaSets">
          <DrawerTitle>Deploy Revisions</DrawerTitle>
          <div className="history-error" data-testid="rollout-history-error">
            <Icon material="error_outline" small/>
            <span>{this.errorMessage}</span>
            <button className="refresh-button" onClick={() => this.loadHistory()}>Retry</button>
          </div>
        </div>
      );
    }

    if (!history) {
      return null;
    }

    const revisions = history.revisions;

    return (
      <div
        className="ReplicaSets flex column"
        data-testid="deployment-revisions"
        data-resource-version={deployment.metadata.resourceVersion}
      >
        <DrawerTitle>
          Deploy Revisions
          <button
            className="refresh-button"
            data-testid="rollout-history-refresh"
            title="Refresh rollout history"
            onClick={() => this.loadHistory()}
          >
            <Icon material="refresh" small/>
          </button>
        </DrawerTitle>
        {paused && (
          <div className="history-warning paused" data-testid="rollout-paused-warning">
            <Icon material="pause_circle_outline" small/>
            <span>The Deployment is paused. Resume the rollout before starting a rollback.</span>
          </div>
        )}
        {this.renderWarnings(history)}
        {revisions.length === 0 ? (
          <div className="history-empty" data-testid="rollout-history-empty">
            No revision ReplicaSets were found. They may have been pruned by revisionHistoryLimit.
          </div>
        ) : (
          <Table
            selectable
            tableId="deployment_replica_sets_view"
            scrollable={false}
            sortable={{
              revision: (revision: DeploymentRevision) => revision.revision ?? 0,
            }}
            sortByDefault={{ sortBy: "revision", orderBy: "desc" }}
            sortSyncWithUrl={false}
            className="box grow"
          >
            <TableHead flat sticky={false}>
              <TableCell className="revision" sortBy="revision">Revision</TableCell>
              <TableCell className="status">Status</TableCell>
              <TableCell className="created">Created</TableCell>
              <TableCell className="images">Images</TableCell>
              <TableCell className="change-cause">Change Cause</TableCell>
              <TableCell className="replicas">Replicas</TableCell>
              <TableCell className="actions"/>
            </TableHead>
            {revisions.map(revision => {
              const rolloutAllowed = revision.valid
                && revision.revision !== null
                && revision.revision !== history.currentRevision
                && !paused;

              return (
                <TableRow
                  key={revision.uid || `${revision.revision}-${revision.name}`}
                  sortItem={revision}
                  nowrap
                  className={revision.valid ? "" : "invalid-revision"}
                  onClick={prevDefault(() => {
                    const selfLink = revision.raw.metadata.selfLink;

                    if (selfLink) {
                      showDetails(selfLink, false);
                    }
                  })}
                >
                  <TableCell className="revision">
                    <span className="revision-number">{revision.revisionLabel}</span>
                    {revision.uid === "" && (
                      <Icon
                        material="error_outline"
                        small
                        tooltip="Missing ReplicaSet UID"/>
                    )}
                  </TableCell>
                  <TableCell className="status">{this.renderStatus(revision)}</TableCell>
                  <TableCell className="created">
                    {revision.createdAt ? new Date(revision.createdAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="images">{this.renderImages(revision)}</TableCell>
                  <TableCell className="change-cause">
                    {revision.changeCause ?? <span className="muted">—</span>}
                  </TableCell>
                  <TableCell className="replicas">
                    {`${revision.replicas} / ${configuredReplicas}`}
                  </TableCell>
                  <TableCell className="actions" onClick={stopPropagation}>
                    <button
                      className="action-button"
                      data-testid={`revision-diff-${revision.revision ?? "unknown"}`}
                      title="View differences between the current template and this revision"
                      onClick={() => this.openDiff(revision)}
                    >
                      <Icon material="difference" small/>
                      <span>Diff</span>
                    </button>
                    <button
                      className="action-button"
                      data-testid={`revision-rollback-${revision.revision ?? "unknown"}`}
                      title={paused
                        ? "Resume the rollout before rolling back"
                        : !rolloutAllowed
                          ? revision.invalidReason ?? "Rollback is not available for this revision"
                          : `Roll back to revision ${revision.revisionLabel}`}
                      disabled={!rolloutAllowed}
                      onClick={() => this.openRollback(revision)}
                    >
                      <Icon material="history" small/>
                      <span>Rollback</span>
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        )}
      </div>
    );
  }
}

export const DeploymentReplicaSets = withInjectables<Dependencies, DeploymentReplicaSetsProps>(NonInjectedDeploymentReplicaSets, {
  getProps: (di, props) => ({
    ...props,
    deploymentApi: di.inject(deploymentApiInjectable),
    replicaSetApi: di.inject(replicaSetApiInjectable),
    showDetails: di.inject(showDetailsInjectable),
    openRolloutRollbackDialog: di.inject(openRolloutRollbackDialogInjectable),
    openRevisionDiffDialog: di.inject(openRevisionDiffDialogInjectable),
  }),
});
