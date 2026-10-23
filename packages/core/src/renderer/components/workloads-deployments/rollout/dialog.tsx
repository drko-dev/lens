/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./rollout-dialog.scss";

import React, { Component } from "react";
import { dump } from "js-yaml";
import type { IObservableValue, IComputedValue } from "mobx";
import { makeObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import type { DialogProps } from "../../dialog";
import { Dialog } from "../../dialog";
import { Icon } from "../../icon";
import { Spinner } from "../../spinner";
import { Checkbox } from "../../checkbox";
import { Input } from "../../input";
import { cssNames } from "@openlens/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { Deployment, ReplicaSet } from "@openlens/kube-object";
import type { Cluster } from "../../../../common/cluster/cluster";
import deploymentApiInjectable from "../../../../common/k8s-api/endpoints/deployment.api.injectable";
import replicaSetApiInjectable from "../../../../common/k8s-api/endpoints/replica-set.api.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import type { DeploymentApi, ReplicaSetApi } from "../../../../common/k8s-api/endpoints";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { assertToolActionClusterContext } from "../../../../common/workspace/tool-context";
import type { RolloutRollbackRequest } from "./state.injectable";
import rolloutRollbackDialogStateInjectable from "./state.injectable";
import type {
  DeploymentRevision,
  DeploymentRevisionHistory,
} from "./revisions";
import { buildDeploymentRevisionHistory } from "./revisions";
import type {
  PreparedRollback,
  RollbackPatchResult,
  RollbackPreparationError,
} from "./prepare-rollback";
import { applyRollbackPatch, prepareRollback } from "./prepare-rollback";
import type { TemplateChangeCategory } from "./template-patch";
import { getTemplateFingerprint, sanitizeRollbackTemplateForDiff } from "./template-patch";
import type { RolloutObservation, RolloutPhase } from "./rollout-progress";
import {
  classifyRollout,
  createRolloutObservationOutcome,
  DEFAULT_ROLLOUT_POLL_INTERVAL_MS,
  DEFAULT_ROLLOUT_TIMEOUT_MS,
  isTerminalRolloutPhase,
  MAX_CONSECUTIVE_ROLLOUT_OBSERVATION_ERRORS,
} from "./rollout-progress";
import { MonacoDiffEditor } from "../../monaco-editor/monaco-diff-editor";
import { getHttpStatusCodeForRolloutError } from "./errors";

export interface RolloutRollbackDialogProps extends Partial<DialogProps> {
}

type DialogStep = "history" | "diff" | "dry-run" | "confirm" | "executing" | "result";

interface Dependencies {
  state: IObservableValue<RolloutRollbackRequest | undefined>;
  deploymentApi: DeploymentApi;
  replicaSetApi: ReplicaSetApi;
  isProduction: IComputedValue<boolean>;
  hostedCluster: Cluster | undefined;
}

const CATEGORY_LABELS: Record<TemplateChangeCategory, string> = {
  images: "Images",
  environment: "Environment",
  command: "Command & args",
  probes: "Probes",
  resources: "Resources",
  volumes: "Volumes",
  metadata: "Pod metadata",
  serviceAccount: "Service account",
  securityContext: "Security context",
  other: "Other Pod spec fields",
};

const toYaml = (value: unknown): string => {
  try {
    return dump(value ?? {});
  } catch {
    return "[unable to serialize Pod template]";
  }
};

const formatRevision = (revision: number | null): string => revision === null ? "unknown" : `#${revision}`;

@observer
class NonInjectedRolloutRollbackDialog extends Component<RolloutRollbackDialogProps & Dependencies> {
  @observable step: DialogStep = "history";
  @observable loadingHistory = false;
  @observable historyError?: string;
  @observable history?: DeploymentRevisionHistory;
  @observable freshDeployment?: Deployment;
  @observable selectedRevision?: DeploymentRevision;
  @observable preparing = false;
  @observable preparation?: PreparedRollback;
  @observable preparationError?: RollbackPreparationError;
  @observable inProgressAcknowledged = false;
  @observable dryRunState: "idle" | "running" | "passed" | "failed" = "idle";
  @observable dryRunResult?: RollbackPatchResult;
  @observable acknowledged = false;
  @observable confirmationText = "";
  @observable clusterError?: string;
  @observable executionError?: RollbackPatchResult;
  @observable observation?: RolloutObservation;
  @observable pollStartedAt = 0;
  @observable resultMessage = "";
  private pollTimer?: ReturnType<typeof setTimeout>;
  private pollTimeoutTimer?: ReturnType<typeof setTimeout>;
  private pollGeneration = 0;
  private operationGeneration = 0;
  private activeRequest?: RolloutRollbackRequest;
  private activeClusterId?: string;
  private executePending = false;
  private consecutivePollErrors = 0;
  private lastObservedDeployment?: Deployment;

  constructor(props: RolloutRollbackDialogProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    const request = this.props.state.get();

    if (request) {
      void this.onOpen(request);
    }
  }

  componentDidUpdate() {
    const request = this.props.state.get();
    const clusterId = this.currentClusterId();

    if (request !== this.activeRequest) {
      this.operationGeneration++;
      this.stopPolling();

      if (request) {
        void this.onOpen(request);
      } else {
        this.activeRequest = undefined;
        this.resetState();
      }
    } else if (request && clusterId !== this.activeClusterId) {
      const rollbackMayHaveBeenAccepted = this.step === "executing" || this.step === "result";

      this.operationGeneration++;
      this.stopPolling();
      this.activeClusterId = clusterId;
      this.resetState();
      this.clusterError = rollbackMayHaveBeenAccepted
        ? "Cluster context changed while rollback was in flight. The request may have been accepted; verify the original cluster before retrying."
        : "Cluster context changed. Close and reopen rollback in the intended cluster.";
    }
  }

  componentWillUnmount() {
    this.operationGeneration++;
    this.activeRequest = undefined;
    this.stopPolling();
  }

  private stopPolling() {
    this.pollGeneration++;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.pollTimeoutTimer) {
      clearTimeout(this.pollTimeoutTimer);
      this.pollTimeoutTimer = undefined;
    }
  }

  close = () => {
    this.operationGeneration++;
    this.activeRequest = undefined;
    this.executePending = false;
    this.stopPolling();
    this.props.state.set(undefined);
  };

  private resetState() {
    this.step = "history";
    this.loadingHistory = false;
    this.historyError = undefined;
    this.history = undefined;
    this.freshDeployment = undefined;
    this.selectedRevision = undefined;
    this.preparing = false;
    this.preparation = undefined;
    this.preparationError = undefined;
    this.inProgressAcknowledged = false;
    this.dryRunState = "idle";
    this.dryRunResult = undefined;
    this.acknowledged = false;
    this.confirmationText = "";
    this.clusterError = undefined;
    this.executionError = undefined;
    this.observation = undefined;
    this.pollStartedAt = 0;
    this.resultMessage = "";
    this.executePending = false;
    this.consecutivePollErrors = 0;
    this.lastObservedDeployment = undefined;
  }

  onOpen = async (request: RolloutRollbackRequest) => {
    const clusterId = this.currentClusterId();

    if (this.activeRequest === request && this.activeClusterId === clusterId) {
      return;
    }

    this.stopPolling();
    this.resetState();

    this.activeRequest = request;
    this.activeClusterId = clusterId;
    const generation = ++this.operationGeneration;

    this.loadingHistory = true;

    if (!this.checkClusterContext()) {
      this.loadingHistory = false;

      return;
    }

    try {
      const fresh = await this.props.deploymentApi.get({
        name: request.deployment.getName(),
        namespace: request.deployment.getNs(),
      });

      if (!this.isCurrentOperation(generation, request, undefined, "history")) {
        this.checkClusterContext();

        return;
      }

      if (!fresh) {
        this.historyError = "The Deployment no longer exists.";

        return;
      }

      if (fresh.metadata.uid !== request.deployment.metadata.uid) {
        this.historyError = "The Deployment identity changed. Refresh the selected resource before continuing.";

        return;
      }

      const replicaSets = await this.props.replicaSetApi.list({ namespace: fresh.getNs() });

      if (!this.isCurrentOperation(generation, request, undefined, "history")) {
        this.checkClusterContext();

        return;
      }

      const history = buildDeploymentRevisionHistory(fresh, (replicaSets ?? []) as ReplicaSet[]);

      runInAction(() => {
        this.history = history;
        this.freshDeployment = fresh;
        this.selectedRevision = history.revisions.find(revision => (
          revision.valid
          && revision.revision !== null
          && revision.revision === request.preferredRevision
        )) ?? undefined;
      });
    } catch (err) {
      if (!this.isCurrentOperation(generation, request, undefined, "history")) {
        return;
      }

      this.historyError = getHttpStatusCodeForRolloutError(err) === 403
        ? "You do not have permission to read this Deployment or its ReplicaSets (RBAC 403)."
        : "Failed to load rollout history. Check cluster connectivity and try again.";
    } finally {
      if (generation === this.operationGeneration && this.props.state.get() === request) {
        this.loadingHistory = false;
      }
    }
  };

  private isCurrentOperation(
    generation: number,
    request: RolloutRollbackRequest,
    revisionUid?: string,
    expectedStep?: DialogStep,
  ): boolean {
    return generation === this.operationGeneration
      && this.props.state.get() === request
      && this.activeRequest === request
      && this.currentClusterId() === request.clusterId
      && (revisionUid === undefined || this.selectedRevision?.uid === revisionUid)
      && (expectedStep === undefined || this.step === expectedStep);
  }

  private selectRevision(revision: DeploymentRevision) {
    if (this.selectedRevision?.uid === revision.uid) {
      return;
    }

    this.operationGeneration++;
    this.selectedRevision = revision;
    this.preparing = false;
    this.preparation = undefined;
    this.preparationError = undefined;
    this.inProgressAcknowledged = false;
    this.dryRunState = "idle";
    this.dryRunResult = undefined;
    this.acknowledged = false;
    this.confirmationText = "";
    this.executionError = undefined;
    this.step = "history";
  }

  private goBack = () => {
    this.operationGeneration++;

    if (this.step === "confirm") {
      this.acknowledged = false;
      this.confirmationText = "";
      this.step = "dry-run";
    } else if (this.step === "dry-run") {
      this.dryRunState = "idle";
      this.dryRunResult = undefined;
      this.step = "diff";
    } else {
      this.preparing = false;
      this.preparation = undefined;
      this.preparationError = undefined;
      this.dryRunState = "idle";
      this.dryRunResult = undefined;
      this.step = "history";
    }
  };

  private currentClusterId(): string {
    return this.props.hostedCluster?.id ?? "unknown";
  }

  private checkClusterContext(): boolean {
    const request = this.props.state.get();

    if (!request) {
      return false;
    }

    try {
      assertToolActionClusterContext(request.clusterId, this.currentClusterId(), "rollback-deployment");
      this.clusterError = undefined;

      return true;
    } catch (err) {
      this.clusterError = (err as Error).message;

      return false;
    }
  }

  private goToDiff = async () => {
    const request = this.props.state.get();
    const revision = this.selectedRevision;

    if (!request || !revision || this.step !== "history" || this.preparing) {
      return;
    }

    if (!this.checkClusterContext()) {
      return;
    }

    this.preparing = true;
    this.preparationError = undefined;
    this.preparation = undefined;
    this.inProgressAcknowledged = false;
    const generation = ++this.operationGeneration;

    let result: Awaited<ReturnType<typeof prepareRollback>>;

    try {
      result = await prepareRollback({ deployment: request.deployment, revision }, {
        deploymentApi: this.props.deploymentApi,
        replicaSetApi: this.props.replicaSetApi,
      });
    } catch {
      result = {
        status: "error",
        error: { kind: "unknown", message: "Unable to prepare rollback from fresh cluster state." },
      };
    }

    if (!this.isCurrentOperation(generation, request, revision.uid, "history")) {
      this.checkClusterContext();

      return;
    }

    runInAction(() => {
      this.preparing = false;

      if (result.status === "ready") {
        this.preparation = result.preparation;
        this.step = "diff";
      } else {
        this.preparationError = result.error;
      }
    });
  };

  private goToDryRun = () => {
    if (
      this.step !== "diff"
      || !this.preparation
      || this.preparationError
      || (this.preparation.inProgress && !this.inProgressAcknowledged)
      || !this.checkClusterContext()
    ) {
      return;
    }

    this.operationGeneration++;
    this.dryRunState = "idle";
    this.dryRunResult = undefined;
    this.executionError = undefined;
    this.step = "dry-run";
  };

  private runDryRun = async () => {
    const preparation = this.preparation;
    const request = this.props.state.get();
    const revisionUid = this.selectedRevision?.uid;

    if (
      !request
      || !preparation
      || !revisionUid
      || this.step !== "dry-run"
      || this.dryRunState === "running"
      || preparation.targetUid !== revisionUid
      || !this.checkClusterContext()
    ) {
      return;
    }

    const generation = ++this.operationGeneration;

    this.dryRunState = "running";
    this.dryRunResult = undefined;

    const result = await applyRollbackPatch(
      { deploymentApi: this.props.deploymentApi },
      preparation.deployment,
      preparation.plan,
      "dry-run",
    );

    if (
      !this.isCurrentOperation(generation, request, revisionUid, "dry-run")
      || this.preparation !== preparation
    ) {
      this.checkClusterContext();

      return;
    }

    runInAction(() => {
      this.dryRunResult = result;
      this.dryRunState = result.ok ? "passed" : "failed";
    });
  };

  private goToConfirm = () => {
    if (
      this.step !== "dry-run"
      || this.dryRunState !== "passed"
      || !this.preparation
      || this.preparation.targetUid !== this.selectedRevision?.uid
      || !this.checkClusterContext()
    ) {
      return;
    }

    this.operationGeneration++;
    this.acknowledged = false;
    this.confirmationText = "";
    this.executionError = undefined;
    this.step = "confirm";
  };

  private execute = async () => {
    const request = this.props.state.get();
    const previous = this.preparation;
    const revision = this.selectedRevision;

    if (
      !request
      || !revision
      || !previous
      || this.step !== "confirm"
      || this.executePending
      || previous.targetUid !== revision.uid
      || previous.toRevision !== revision.revision
      || !this.canExecute()
      || !this.checkClusterContext()
    ) {
      return;
    }

    this.executePending = true;
    this.step = "executing";
    this.executionError = undefined;
    const generation = ++this.operationGeneration;

    try {
      let refreshed: Awaited<ReturnType<typeof prepareRollback>>;

      try {
        refreshed = await prepareRollback({ deployment: request.deployment, revision }, {
          deploymentApi: this.props.deploymentApi,
          replicaSetApi: this.props.replicaSetApi,
        });
      } catch {
        refreshed = {
          status: "error",
          error: { kind: "unknown", message: "Unable to revalidate rollback from fresh cluster state." },
        };
      }

      if (!this.isCurrentOperation(generation, request, revision.uid, "executing")) {
        this.checkClusterContext();

        return;
      }

      if (refreshed.status === "error") {
        const error = refreshed.error;

        runInAction(() => {
          this.preparationError = error;
          this.preparation = undefined;
          this.dryRunState = "idle";
          this.dryRunResult = undefined;
          this.acknowledged = false;
          this.step = "history";
        });

        return;
      }

      const preparation = refreshed.preparation;

      if (
        preparation.targetUid !== previous.targetUid
        || preparation.targetName !== previous.targetName
        || preparation.deployment.metadata.uid !== previous.deployment.metadata.uid
        || preparation.plan.patch.length !== previous.plan.patch.length
        || JSON.stringify(preparation.plan.patch) !== JSON.stringify(previous.plan.patch)
        || getTemplateFingerprint(preparation.deployment.spec?.template) !== getTemplateFingerprint(previous.deployment.spec?.template)
      ) {
        runInAction(() => {
          this.preparation = preparation;
          this.preparationError = {
            kind: "precondition",
            message: "The Deployment or revision changed after the dry-run. Review the new differences and validate again.",
          };
          this.dryRunState = "idle";
          this.dryRunResult = undefined;
          this.inProgressAcknowledged = false;
          this.acknowledged = false;
          this.confirmationText = "";
          this.step = "diff";
        });

        return;
      }

      if (!this.checkClusterContext() || !this.canExecute()) {
        this.step = "confirm";

        return;
      }

      const result = await applyRollbackPatch(
        { deploymentApi: this.props.deploymentApi },
        preparation.deployment,
        preparation.plan,
        "execute",
      );

      if (!this.isCurrentOperation(generation, request, revision.uid, "executing")) {
        this.checkClusterContext();

        return;
      }

      if (!this.checkClusterContext()) {
        this.executionError = {
          ok: false,
          operationCount: result.operationCount,
          message: result.ok
            ? "The rollback may have been accepted, but the cluster context changed before progress could be verified. Check the original cluster before retrying."
            : result.message,
          statusCode: result.statusCode,
        };
        this.step = "confirm";

        return;
      }

      const confirmationsStillValid = this.canExecute();

      if (!result.ok) {
        runInAction(() => {
          this.executionError = result;
          this.step = "confirm";
        });

        return;
      }

      if (!confirmationsStillValid) {
        runInAction(() => {
          this.preparation = preparation;
          this.pollStartedAt = Date.now();
          this.observation = createRolloutObservationOutcome(
            preparation.deployment,
            "unverified",
            0,
            "The rollback was accepted, but its confirmation state changed while waiting for the API response; progress is not being verified.",
          );
          this.step = "result";
          this.resultMessage = this.observation.message;
        });

        return;
      }

      runInAction(() => {
        this.preparation = preparation;
        this.pollStartedAt = Date.now();
        this.step = "result";
        this.resultMessage = "Rollback accepted by the API server. Waiting for the rollout to progress…";
      });

      this.startPolling(preparation, request, revision.uid);
    } finally {
      if (generation === this.operationGeneration) {
        this.executePending = false;
      }
    }
  };

  private startPolling(preparation: PreparedRollback, request: RolloutRollbackRequest, revisionUid: string) {
    this.stopPolling();
    this.consecutivePollErrors = 0;
    this.lastObservedDeployment = preparation.deployment;

    const generation = this.pollGeneration;
    const namespace = preparation.deployment.getNs();
    const name = preparation.deployment.getName();
    const deadline = this.pollStartedAt + DEFAULT_ROLLOUT_TIMEOUT_MS;
    const isActive = () => (
      generation === this.pollGeneration
      && this.step === "result"
      && this.props.state.get() === request
      && this.activeRequest === request
      && this.selectedRevision?.uid === revisionUid
    );
    const contextIsCurrent = () => this.currentClusterId() === request.clusterId;
    const finish = (phase: "timedout" | "unverified", message: string) => {
      if (!isActive()) {
        return;
      }

      runInAction(() => {
        if (!contextIsCurrent()) {
          this.clusterError = "Cluster context changed while observing rollback. The request may have been accepted; verify the original cluster before retrying.";
          phase = "unverified";
          message = this.clusterError;
        }

        this.observation = createRolloutObservationOutcome(
          this.lastObservedDeployment ?? preparation.deployment,
          phase,
          Date.now() - this.pollStartedAt,
          message,
        );
        this.resultMessage = message;
      });
      this.stopPolling();
    };
    const finishTimeout = () => finish(
      "timedout",
      "The API accepted the rollback, but progress could not be verified before the observation timeout. It may still be running; check the Deployment before retrying.",
    );

    this.pollTimeoutTimer = setTimeout(finishTimeout, Math.max(0, deadline - Date.now()));

    const scheduleNext = () => {
      if (!isActive() || !contextIsCurrent()) {
        finish("unverified", "The rollback may have been accepted, but its progress cannot be verified in the current cluster context.");

        return;
      }

      const remaining = deadline - Date.now();

      if (remaining <= 0) {
        finishTimeout();

        return;
      }

      this.pollTimer = setTimeout(() => { void observe(); }, Math.min(DEFAULT_ROLLOUT_POLL_INTERVAL_MS, remaining));
    };

    const observe = async () => {
      if (!isActive()) {
        return;
      }

      if (!contextIsCurrent()) {
        finish("unverified", "The API accepted the rollback, but the cluster changed before progress could be verified. Check the original cluster before retrying.");

        return;
      }

      let fresh: Deployment | null = null;

      try {
        fresh = await this.props.deploymentApi.get({ name, namespace });
      } catch {
        if (!isActive()) {
          return;
        }

        if (!contextIsCurrent()) {
          finish("unverified", "The API accepted the rollback, but the cluster changed before progress could be verified. Check the original cluster before retrying.");

          return;
        }

        this.consecutivePollErrors++;

        if (this.consecutivePollErrors >= MAX_CONSECUTIVE_ROLLOUT_OBSERVATION_ERRORS) {
          finish(
            "unverified",
            "The rollback may have been accepted, but repeated API errors prevented progress verification. Check the Deployment before retrying.",
          );

          return;
        }

        runInAction(() => {
          this.resultMessage = `The rollback may have been accepted; rollout status could not be read (${this.consecutivePollErrors}/${MAX_CONSECUTIVE_ROLLOUT_OBSERVATION_ERRORS} consecutive API errors).`;
        });
        scheduleNext();

        return;
      }

      if (!isActive()) {
        return;
      }

      if (!contextIsCurrent()) {
        finish("unverified", "The API accepted the rollback, but the cluster changed before progress could be verified. Check the original cluster before retrying.");

        return;
      }

      if (!fresh || fresh.metadata.uid !== preparation.deployment.metadata.uid) {
        finish(
          "unverified",
          "The rollback may have been accepted, but the Deployment was removed or replaced before progress could be verified. Check the original cluster before retrying.",
        );

        return;
      }

      this.consecutivePollErrors = 0;
      this.lastObservedDeployment = fresh;
      const elapsed = Date.now() - this.pollStartedAt;
      const observation = classifyRollout(fresh, elapsed, DEFAULT_ROLLOUT_TIMEOUT_MS);

      runInAction(() => {
        this.observation = observation;
        this.resultMessage = this.describeObservation(observation.phase);
      });

      if (isTerminalRolloutPhase(observation.phase)) {
        this.stopPolling();

        return;
      }

      scheduleNext();
    };

    void observe();
  }

  private describeObservation(phase: RolloutPhase): string {
    switch (phase) {
      case "completed":
        return "Rollback completed: the new ReplicaSet is fully available.";
      case "failed":
        return "Rollback failed: the Deployment reported a failure condition.";
      case "degraded":
        return "Rollback did not complete before the progress deadline.";
      case "timedout":
        return "The API accepted the rollback, but its progress was not verified before the observation timeout.";
      case "unverified":
        return "The API may have accepted the rollback, but its progress could not be verified.";
      case "accepted":
        return "The API server accepted the rollback. Waiting for the controller to observe the new generation…";
      case "progressing":
      default:
        return "Rollout in progress: waiting for the rollback to complete…";
    }
  }

  private get isProduction(): boolean {
    return this.props.isProduction.get();
  }

  private canExecute(): boolean {
    if (
      !this.acknowledged
      || this.dryRunState !== "passed"
      || !this.preparation
      || this.preparation.sameTemplate
      || (this.preparation.inProgress && !this.inProgressAcknowledged)
    ) {
      return false;
    }

    if (this.isProduction && this.confirmationText.trim() !== this.preparation.deployment.getName()) {
      return false;
    }

    return true;
  }

  private renderHistoryStep() {
    const request = this.props.state.get();

    if (!request) {
      return null;
    }

    if (this.loadingHistory) {
      return <div className="rollout-dialog-loading"><Spinner center/></div>;
    }

    if (this.historyError) {
      return (
        <div className="rollout-dialog-error">
          <Icon material="error_outline"/>
          <p>{this.historyError}</p>
        </div>
      );
    }

    const history = this.history;

    if (!history) {
      return null;
    }

    const paused = Boolean(this.freshDeployment?.spec?.paused);

    if (history.fatalReason) {
      return (
        <div className="rollout-dialog-error">
          <Icon material="error_outline"/>
          <p>{history.fatalReason}</p>
        </div>
      );
    }

    return (
      <div data-testid="rollback-history-step">
        <p className="rollout-description">
          Select the revision to restore. OpenLens will recompute the Pod template diff from fresh cluster state
          and validate the change with a server-side dry-run before anything is modified.
        </p>
        {paused && (
          <div className="production-banner warning" data-testid="rollback-paused">
            <Icon material="pause_circle_outline" small/>
            <span>The Deployment is paused. Resume the rollout from the Deployment menu before rolling back.</span>
          </div>
        )}
        {history.historyIncomplete && (
          <div className="rollout-notice" data-testid="rollback-history-incomplete">
            Older revisions were pruned (revisionHistoryLimit=
            {history.revisionHistoryLimit}
            ).
          </div>
        )}
        <div className="revision-selector">
          {history.revisions.map(revision => {
            const disabled = !revision.valid
              || revision.revision === null
              || revision.revision === history.currentRevision
              || paused;
            const selected = this.selectedRevision?.uid === revision.uid;

            return (
              <label
                key={revision.uid || `${revision.revision}-${revision.name}`}
                className={cssNames("revision-option", { selected, disabled })}
                data-testid={`rollback-option-${revision.revision ?? "unknown"}`}
              >
                <input
                  type="radio"
                  name="rollback-revision"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => this.selectRevision(revision)}
                />
                <span className="revision-option-number">{revision.revisionLabel}</span>
                <span className="revision-option-status">
                  {revision.valid
                    ? revision.revision === history.currentRevision ? "Current" : "Available"
                    : revision.invalidReason ?? "Invalid"}
                </span>
                <span className="revision-option-images">
                  {revision.images.map(image => image.image).join(", ") || "—"}
                </span>
                <span className="revision-option-cause">{revision.changeCause ?? "—"}</span>
              </label>
            );
          })}
        </div>
        {this.preparationError && (
          <div className="rollout-dialog-error" data-testid="rollback-preparation-error">
            <Icon material="error_outline"/>
            <p>{this.preparationError.message}</p>
          </div>
        )}
      </div>
    );
  }

  private renderDiffStep() {
    const preparation = this.preparation;

    if (!preparation) {
      return null;
    }

    return (
      <div data-testid="rollback-diff-step">
        <div className="rollout-identity">
          <div className="identity-row">
            <span className="label">Deployment</span>
            <span className="value">
              {preparation.deployment.getName()}
              {" "}
              /
              {" "}
              {preparation.deployment.getNs()}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">Revision</span>
            <span className="value">
              {formatRevision(preparation.fromRevision)}
              {" "}
              → #
              {preparation.toRevision}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">ReplicaSet</span>
            <span className="value">
              {preparation.targetName}
              {" "}
              <code>{preparation.targetUid.slice(0, 8)}</code>
            </span>
          </div>
        </div>
        {this.preparationError && (
          <div className="rollout-dialog-error">
            <Icon material="error_outline"/>
            <p>{this.preparationError.message}</p>
          </div>
        )}
        {preparation.sameTemplate ? (
          <div className="rollout-notice danger" data-testid="rollback-same-template">
            This revision has the same Pod template as the current revision. There is nothing to roll back.
          </div>
        ) : (
          <>
            <div className="change-categories">
              <span className="label">Pod template changes</span>
              {preparation.changes.map(category => (
                <span key={category} className="change-chip">{CATEGORY_LABELS[category]}</span>
              ))}
            </div>
            {preparation.inProgress && (
              <div className="production-banner warning" data-testid="rollback-in-progress">
                <Icon material="sync" small/>
                <span>Another rollout appears to be in progress. Rolling back now may race with it.</span>
              </div>
            )}
            {preparation.inProgress && (
              <Checkbox
                label="I understand another rollout is in progress and want to continue"
                value={this.inProgressAcknowledged}
                onChange={value => this.inProgressAcknowledged = value}
                data-testid="rollback-in-progress-acknowledge"
              />
            )}
            <MonacoDiffEditor
              original={toYaml(sanitizeRollbackTemplateForDiff(
                preparation.targetReplicaSet.spec?.template,
                preparation.deployment.spec?.template,
              ))}
              modified={toYaml(sanitizeRollbackTemplateForDiff(
                preparation.deployment.spec?.template,
                preparation.targetReplicaSet.spec?.template,
              ))}
              originalTitle={`Revision #${preparation.toRevision} (rollback target)`}
              modifiedTitle="Current revision"
              readOnlyOriginal
              readOnlyModified
              language="yaml"
              style={{ height: "340px" }}
            />
          </>
        )}
      </div>
    );
  }

  private renderDryRunStep() {
    if (!this.preparation) {
      return null;
    }

    return (
      <div data-testid="rollback-dry-run-step">
        <p className="rollout-description">
          A JSON Patch with UID and resourceVersion preconditions will be sent to the API server with
          <code>dryRun=All</code>
          . The server validates schema, immutability, admission and the preconditions,
          then discards the change. The Deployment is not modified.
        </p>
        <div className="rollout-command-preview">
          <span className="label">Patch operations</span>
          <code>{this.preparation.plan.patch.length}</code>
        </div>
        {this.dryRunState === "passed" && (
          <div className="rollout-result success" data-testid="rollback-dry-run-passed">
            <Icon material="check_circle" small/>
            <span>Dry-run passed. No cluster resources were changed.</span>
          </div>
        )}
        {this.dryRunState === "failed" && this.dryRunResult && (
          <div className="rollout-dialog-error" data-testid="rollback-dry-run-failed">
            <Icon material="error_outline"/>
            <div>
              <strong>
                Dry-run rejected
                {this.dryRunResult.statusCode ? ` (HTTP ${this.dryRunResult.statusCode})` : ""}
              </strong>
              <p>{this.dryRunResult.message}</p>
              {this.dryRunResult.causes?.map(cause => (
                <p key={`${cause.field}-${cause.message}`}>
                  <code>{cause.field ?? "cause"}</code>
                  :
                  {" "}
                  {cause.message}
                </p>
              ))}
            </div>
          </div>
        )}
        <button
          className="rollout-primary-button"
          data-testid="rollback-run-dry-run"
          disabled={this.dryRunState === "running"}
          onClick={this.runDryRun}
        >
          {this.dryRunState === "running" ? <Spinner/> : <Icon material="play_arrow" small/>}
          {this.dryRunState === "passed" ? "Run dry-run again" : "Run server-side dry-run"}
        </button>
      </div>
    );
  }

  private renderConfirmStep() {
    const preparation = this.preparation;

    if (!preparation) {
      return null;
    }

    return (
      <div data-testid="rollback-confirm-step">
        <div className="rollout-identity">
          <div className="identity-row">
            <span className="label">Deployment</span>
            <span className="value">
              {preparation.deployment.getName()}
              {" "}
              /
              {" "}
              {preparation.deployment.getNs()}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">Revision</span>
            <span className="value">
              {formatRevision(preparation.fromRevision)}
              {" "}
              → #
              {preparation.toRevision}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">Cluster</span>
            <span className="value">{this.props.state.get()?.clusterName}</span>
          </div>
        </div>
        {this.isProduction && (
          <div className="production-banner" data-testid="rollback-production-warning">
            <Icon material="warning" small/>
            <span>
              PRODUCTION CLUSTER — rolling back will create a new ReplicaSet and gradually replace the running Pods.
            </span>
          </div>
        )}
        <p className="rollout-description">
          Rolling back restores the selected Pod template. It does not undo changes to the Deployment spec outside
          <code>spec.template</code>
          {" "}
          (for example replicas, strategy or selector).
        </p>
        <Checkbox
          label="I understand this will trigger a new rollout"
          value={this.acknowledged}
          onChange={value => this.acknowledged = value}
          data-testid="rollback-acknowledge"
        />
        {this.isProduction && (
          <label className="production-confirmation">
            <span>
              Type
              <b>{preparation.deployment.getName()}</b>
              {" "}
              to confirm the production rollback
            </span>
            <Input
              value={this.confirmationText}
              onChange={value => this.confirmationText = value}
              data-testid="rollback-production-confirmation"
            />
          </label>
        )}
        {this.executionError && (
          <div className="rollout-dialog-error" data-testid="rollback-execution-error">
            <Icon material="error_outline"/>
            <div>
              <strong>
                Rollback failed
                {this.executionError.statusCode ? ` (HTTP ${this.executionError.statusCode})` : ""}
              </strong>
              <p>{this.executionError.message}</p>
              {this.executionError.statusCode === 409 && (
                <p>
                  The Deployment changed or a precondition failed. Use
                  {" "}
                  <b>Refresh and retry</b>
                  {" "}
                  to recompute the
                  diff against fresh state.
                </p>
              )}
              {this.executionError.causes?.map(cause => (
                <p key={`${cause.field}-${cause.message}`}>
                  <code>{cause.field ?? "cause"}</code>
                  :
                  {" "}
                  {cause.message}
                </p>
              ))}
            </div>
          </div>
        )}
        {this.executionError?.statusCode === 409 && (
          <button
            className="rollout-secondary-button"
            onClick={() => {
              this.executionError = undefined;
              void this.goToDiff();
            }}
          >
            Refresh and retry
          </button>
        )}
      </div>
    );
  }

  private renderResultStep() {
    const observation = this.observation;
    const phase = observation?.phase ?? "accepted";
    const terminal = isTerminalRolloutPhase(phase);
    const success = phase === "completed";
    const failed = phase === "failed" || phase === "degraded";
    const warning = phase === "timedout" || phase === "unverified";

    return (
      <div data-testid="rollback-result-step">
        <div className={cssNames("rollout-result", { success, danger: failed, warning })}>
          {!terminal && <Spinner/>}
          {success && <Icon material="check_circle" small/>}
          {failed && <Icon material="error_outline" small/>}
          {warning && <Icon material="warning" small/>}
          <span>{this.resultMessage}</span>
        </div>
        {observation && (
          <div className="rollout-observation" data-testid="rollback-observation">
            <div className="identity-row">
              <span className="label">Phase</span>
              <span className="value">{observation.phase}</span>
            </div>
            <div className="identity-row">
              <span className="label">Elapsed</span>
              <span className="value">
                {Math.round(observation.elapsedMs / 1000)}
                s
              </span>
            </div>
            <div className="identity-row">
              <span className="label">Updated / desired replicas</span>
              <span className="value">
                {observation.updated}
                {" "}
                /
                {" "}
                {observation.desired}
              </span>
            </div>
            <div className="identity-row">
              <span className="label">Available replicas</span>
              <span className="value">{observation.available}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  private renderStep() {
    switch (this.step) {
      case "history":
        return this.renderHistoryStep();
      case "diff":
        return this.renderDiffStep();
      case "dry-run":
        return this.renderDryRunStep();
      case "confirm":
        return this.renderConfirmStep();
      case "executing":
        return (
          <div className="rollout-dialog-loading" data-testid="rollback-executing">
            <Spinner center/>
            <p>Applying the rollback patch…</p>
          </div>
        );
      case "result":
        return this.renderResultStep();
    }
  }

  private renderFooter() {
    if (this.step === "executing" || this.step === "result") {
      return (
        <div className="rollout-footer">
          <button className="rollout-secondary-button" onClick={this.close}>Close</button>
        </div>
      );
    }

    const preparation = this.preparation;
    const paused = Boolean(this.freshDeployment?.spec?.paused);
    const canContinueDiff = !preparation?.sameTemplate;

    return (
      <div className="rollout-footer">
        <button className="rollout-secondary-button" onClick={this.close}>Cancel</button>
        {this.step !== "history" && (
          <button
            className="rollout-secondary-button"
            onClick={this.goBack}
          >
            Back
          </button>
        )}
        {this.step === "history" && (
          <button
            className="rollout-primary-button"
            data-testid="rollback-continue-to-diff"
            disabled={!this.selectedRevision || paused || this.preparing || Boolean(this.clusterError)}
            onClick={this.goToDiff}
          >
            {this.preparing ? <Spinner/> : <Icon material="arrow_forward" small/>}
            Review differences
          </button>
        )}
        {this.step === "diff" && (
          <button
            className="rollout-primary-button"
            data-testid="rollback-continue-to-dry-run"
            disabled={
              Boolean(this.preparationError)
              || !canContinueDiff
              || (preparation?.inProgress === true && !this.inProgressAcknowledged)
            }
            onClick={this.goToDryRun}
          >
            Continue to validation
          </button>
        )}
        {this.step === "dry-run" && (
          <button
            className="rollout-primary-button"
            data-testid="rollback-continue-to-confirm"
            disabled={this.dryRunState !== "passed"}
            onClick={this.goToConfirm}
          >
            Continue
          </button>
        )}
        {this.step === "confirm" && (
          <button
            className="rollout-danger-button"
            data-testid="rollback-execute"
            disabled={!this.canExecute()}
            onClick={this.execute}
          >
            <Icon material="history" small/>
            Roll back to #
            {preparation?.toRevision}
          </button>
        )}
      </div>
    );
  }

  render() {
    const { className, state, ...dialogProps } = this.props;
    const request = state.get();

    return (
      <Dialog
        {...dialogProps}
        isOpen={Boolean(request)}
        className={cssNames("RolloutRollbackDialog", className)}
        onOpen={request && (() => this.onOpen(request))}
        close={this.close}
      >
        <h5>
          Roll back Deployment
          {request && <span className="dialog-object-name">{request.deployment.getName()}</span>}
        </h5>
        {request && (
          <div className="rollout-step-indicator">
            {(["history", "diff", "dry-run", "confirm", "result"] as DialogStep[]).map((step, index) => (
              <span
                key={step}
                className={cssNames("step", {
                  active: this.step === step || (this.step === "executing" && step === "confirm"),
                })}
              >
                {index + 1}
                .
                {step === "dry-run" ? "Validate" : step.charAt(0).toUpperCase() + step.slice(1)}
              </span>
            ))}
          </div>
        )}
        {this.clusterError && (
          <div className="rollout-dialog-error" data-testid="rollback-cluster-mismatch">
            <Icon material="error_outline"/>
            <p>{this.clusterError}</p>
          </div>
        )}
        {request && this.renderStep()}
        {request && this.renderFooter()}
      </Dialog>
    );
  }
}

export const RolloutRollbackDialog = withInjectables<Dependencies, RolloutRollbackDialogProps>(NonInjectedRolloutRollbackDialog, {
  getProps: (di, props) => ({
    ...props,
    state: di.inject(rolloutRollbackDialogStateInjectable),
    deploymentApi: di.inject(deploymentApiInjectable),
    replicaSetApi: di.inject(replicaSetApiInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
});
