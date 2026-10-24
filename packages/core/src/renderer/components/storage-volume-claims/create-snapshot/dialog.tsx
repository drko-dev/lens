/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./create-snapshot-dialog.scss";

import React, { Component } from "react";
import type { IObservableValue, IComputedValue } from "mobx";
import { makeObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { cssNames } from "@openlens/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { DialogProps } from "../../dialog";
import { Dialog } from "../../dialog";
import { Icon } from "../../icon";
import { Spinner } from "../../spinner";
import { Checkbox } from "../../checkbox";
import { Input } from "../../input";
import type { PersistentVolumeClaim } from "@openlens/kube-object";
import type { Cluster } from "../../../../common/cluster/cluster";
import type { PersistentVolumeClaimApi, VolumeSnapshotApi } from "../../../../common/k8s-api/endpoints";
import volumeSnapshotApiInjectable from "../../../../common/k8s-api/endpoints/volume-snapshot.api.injectable";
import pvcApiInjectable from "../../../../common/k8s-api/endpoints/persistent-volume-claim.api.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { assertToolActionClusterContext } from "../../../../common/workspace/tool-context";
import { classifyDryRunFailure } from "../../dock/edit-resource/edit-resource-model/dry-run-validation";
import createVolumeSnapshotDialogStateInjectable, { type CreateVolumeSnapshotRequest } from "./state.injectable";
import type { VolumeSnapshotClassStore } from "../../storage-volume-snapshot-classes/store";
import volumeSnapshotClassStoreInjectable from "../../storage-volume-snapshot-classes/store.injectable";
import {
  buildVolumeSnapshotManifest,
  classifySnapshotPhase,
  validateSnapshotName,
} from "./create-snapshot";

export interface CreateVolumeSnapshotDialogProps extends Partial<DialogProps> {}

interface Dependencies {
  state: IObservableValue<CreateVolumeSnapshotRequest | undefined>;
  pvcApi: PersistentVolumeClaimApi;
  volumeSnapshotApi: VolumeSnapshotApi;
  volumeSnapshotClassStore: VolumeSnapshotClassStore;
  isProduction: IComputedValue<boolean>;
  hostedCluster: Cluster | undefined;
}

type DryRunState = "idle" | "running" | "passed" | "failed";
type Step = "input" | "confirm" | "executing" | "result";

const SNAPSHOT_OBSERVATION_INTERVAL_MS = 2000;
const SNAPSHOT_OBSERVATION_TIMEOUT_MS = 120000;

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
};

@observer
class NonInjectedCreateVolumeSnapshotDialog extends Component<CreateVolumeSnapshotDialogProps & Dependencies> {
  @observable step: Step = "input";
  @observable snapshotNameInput = "";
  @observable selectedClassName = "";
  @observable loading = false;
  @observable freshPvc?: PersistentVolumeClaim;
  @observable validationError?: string;
  @observable dryRunState: DryRunState = "idle";
  @observable dryRunError?: { message: string; statusCode?: number };
  @observable acknowledged = false;
  @observable confirmationText = "";
  @observable executeError?: string;
  @observable resultPhase?: "Pending" | "Ready" | "Error" | "Unknown";
  @observable resultMessage = "";
  @observable clusterError?: string;
  @observable isSubmitting = false;
  @observable approvedFingerprint?: string;

  private activeRequest?: CreateVolumeSnapshotRequest;
  private activeClusterId?: string;
  private operationGeneration = 0;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private pollTimeoutTimer?: ReturnType<typeof setTimeout>;

  constructor(props: CreateVolumeSnapshotDialogProps & Dependencies) {
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

    if (request !== this.activeRequest || (request && clusterId !== this.activeClusterId)) {
      this.stopPolling();
      this.operationGeneration++;
      this.activeRequest = request;
      this.activeClusterId = clusterId;
      this.resetState();

      if (request) {
        void this.onOpen(request);
      }
    }
  }

  componentWillUnmount() {
    this.stopPolling();
    this.operationGeneration++;
    this.activeRequest = undefined;
  }

  private currentClusterId(): string {
    return this.props.hostedCluster?.id ?? "unknown";
  }

  private resetState() {
    this.step = "input";
    this.snapshotNameInput = "";
    this.selectedClassName = "";
    this.loading = false;
    this.freshPvc = undefined;
    this.validationError = undefined;
    this.dryRunState = "idle";
    this.dryRunError = undefined;
    this.acknowledged = false;
    this.confirmationText = "";
    this.executeError = undefined;
    this.resultPhase = undefined;
    this.resultMessage = "";
    this.clusterError = undefined;
    this.isSubmitting = false;
    this.approvedFingerprint = undefined;
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.pollTimeoutTimer) {
      clearTimeout(this.pollTimeoutTimer);
      this.pollTimeoutTimer = undefined;
    }
  }

  private isCurrentOperation(generation: number, request: CreateVolumeSnapshotRequest, expectedStep?: Step): boolean {
    return generation === this.operationGeneration
      && this.props.state.get() === request
      && this.activeRequest === request
      && this.currentClusterId() === request.clusterId
      && (expectedStep === undefined || this.step === expectedStep);
  }

  private checkClusterContext(request?: CreateVolumeSnapshotRequest): boolean {
    const req = request ?? this.props.state.get();

    if (!req) {
      return false;
    }

    try {
      assertToolActionClusterContext(req.clusterId, this.currentClusterId(), "create-volume-snapshot");
      this.clusterError = undefined;

      return true;
    } catch (err) {
      this.clusterError = (err as Error).message;

      return false;
    }
  }

  private onOpen = async (request: CreateVolumeSnapshotRequest) => {
    const generation = ++this.operationGeneration;

    this.loading = true;

    if (!this.checkClusterContext(request)) {
      this.loading = false;

      return;
    }

    try {
      const [fresh] = await Promise.all([
        this.props.pvcApi.get({
          name: request.pvc.getName(),
          namespace: request.pvc.getNs(),
        }),
        this.props.volumeSnapshotClassStore.reloadAll({ force: true }),
      ]);

      if (!this.isCurrentOperation(generation, request)) {
        return;
      }

      if (!fresh) {
        this.validationError = "The PVC no longer exists.";

        return;
      }

      if (fresh.metadata.uid !== request.pvc.metadata.uid) {
        this.validationError = "The PVC identity changed. Refresh it before creating a snapshot.";

        return;
      }

      runInAction(() => {
        this.freshPvc = fresh;
      });
    } catch (err) {
      if (!this.isCurrentOperation(generation, request)) {
        return;
      }

      this.validationError = "Failed to load PVC or snapshot classes. Check cluster connectivity and try again.";
    } finally {
      if (generation === this.operationGeneration) {
        this.loading = false;
      }
    }
  };

  private close = () => {
    this.stopPolling();
    this.operationGeneration++;
    this.props.state.set(undefined);
  };

  private runDryRun = async () => {
    const request = this.props.state.get();
    const pvc = this.freshPvc;

    if (!request || !pvc || this.step !== "input" || this.dryRunState === "running") {
      return;
    }

    const nameValidation = validateSnapshotName(this.snapshotNameInput);

    if (!nameValidation.valid) {
      this.validationError = nameValidation.error;

      return;
    }

    if (!this.checkClusterContext(request)) {
      return;
    }

    const generation = ++this.operationGeneration;

    this.dryRunState = "running";
    this.dryRunError = undefined;
    this.validationError = undefined;

    try {
      const manifest = buildVolumeSnapshotManifest(pvc, this.snapshotNameInput, this.selectedClassName || undefined);

      await this.props.volumeSnapshotApi.create(
        { name: this.snapshotNameInput.trim(), namespace: pvc.getNs() },
        manifest,
        { dryRun: "All" },
      );

      if (!this.isCurrentOperation(generation, request, "input")) {
        return;
      }

      this.approvedFingerprint = JSON.stringify(manifest);
      this.dryRunState = "passed";
    } catch (err) {
      if (!this.isCurrentOperation(generation, request, "input")) {
        return;
      }

      const classified = classifyDryRunFailure(err, errorMessage(err));

      this.dryRunState = "failed";
      this.dryRunError = {
        message: classified.message ?? classified.reason ?? "Dry-run failed.",
        statusCode: classified.statusCode,
      };
    }
  };

  private goToConfirm = () => {
    if (this.step !== "input" || this.dryRunState !== "passed" || !this.approvedFingerprint) {
      return;
    }

    this.operationGeneration++;
    this.acknowledged = false;
    this.confirmationText = "";
    this.executeError = undefined;
    this.step = "confirm";
  };

  private execute = async () => {
    const request = this.props.state.get();
    const pvc = this.freshPvc;

    if (!request || !pvc || this.step !== "confirm" || this.isSubmitting || !this.canExecute()) {
      return;
    }

    if (!this.checkClusterContext(request)) {
      return;
    }

    this.isSubmitting = true;
    this.step = "executing";
    this.executeError = undefined;
    const generation = ++this.operationGeneration;

    try {
      const revalidatedPvc = await this.props.pvcApi.get({
        name: pvc.getName(),
        namespace: pvc.getNs(),
      });

      if (!this.isCurrentOperation(generation, request, "executing")) {
        return;
      }

      if (!revalidatedPvc) {
        this.executeError = "The PVC no longer exists.";
        this.step = "input";
        this.dryRunState = "idle";
        this.approvedFingerprint = undefined;

        return;
      }

      if (revalidatedPvc.metadata.uid !== pvc.metadata.uid) {
        this.executeError = "The PVC changed while the dialog was open. Cancel and start over with a fresh dry-run.";
        this.step = "input";
        this.dryRunState = "idle";
        this.approvedFingerprint = undefined;

        return;
      }

      const manifest = buildVolumeSnapshotManifest(revalidatedPvc, this.snapshotNameInput, this.selectedClassName || undefined);

      if (JSON.stringify(manifest) !== this.approvedFingerprint) {
        this.executeError = "The configuration changed after the dry-run. Run the dry-run again before creating the snapshot.";
        this.step = "input";
        this.dryRunState = "idle";
        this.approvedFingerprint = undefined;

        return;
      }

      await this.props.volumeSnapshotApi.create(
        { name: this.snapshotNameInput.trim(), namespace: revalidatedPvc.getNs() },
        manifest,
      );

      if (!this.isCurrentOperation(generation, request, "executing")) {
        return;
      }

      runInAction(() => {
        this.resultPhase = "Pending";
        this.resultMessage = "VolumeSnapshot created. Waiting for the snapshot controller to report status…";
        this.step = "result";
      });

      this.startPolling(request);
    } catch (err) {
      if (!this.isCurrentOperation(generation, request, "executing")) {
        return;
      }

      this.executeError = errorMessage(err);
      this.step = "confirm";
    } finally {
      if (generation === this.operationGeneration) {
        this.isSubmitting = false;
      }
    }
  };

  private startPolling(request: CreateVolumeSnapshotRequest) {
    this.stopPolling();

    const generation = this.operationGeneration;
    const name = this.snapshotNameInput.trim();
    const namespace = request.pvc.getNs();
    const deadline = Date.now() + SNAPSHOT_OBSERVATION_TIMEOUT_MS;
    const isActive = () => (
      generation === this.operationGeneration
      && this.step === "result"
      && this.props.state.get() === request
      && this.activeRequest === request
    );
    const contextIsCurrent = () => this.currentClusterId() === request.clusterId;

    this.pollTimeoutTimer = setTimeout(() => {
      if (!isActive()) {
        return;
      }

      runInAction(() => {
        this.resultPhase = "Unknown";
        this.resultMessage = "Observation timed out. The VolumeSnapshot may still become ready; check its status in the cluster.";
      });
    }, SNAPSHOT_OBSERVATION_TIMEOUT_MS);

    const observe = async () => {
      if (!isActive() || !contextIsCurrent()) {
        this.stopPolling();

        return;
      }

      if (Date.now() >= deadline) {
        return;
      }

      try {
        const snapshot = await this.props.volumeSnapshotApi.get({ name, namespace });

        if (!isActive() || !contextIsCurrent()) {
          this.stopPolling();

          return;
        }

        if (snapshot) {
          const phase = classifySnapshotPhase(snapshot);

          runInAction(() => {
            this.resultPhase = phase;

            if (phase === "Ready") {
              this.resultMessage = "VolumeSnapshot is ready to use.";
              this.stopPolling();
            } else if (phase === "Error") {
              this.resultMessage = snapshot.getErrorMessage() || "The snapshot controller reported an error.";
              this.stopPolling();
            } else {
              this.resultMessage = "VolumeSnapshot created. Waiting for the snapshot controller to report status…";
            }
          });

          if (phase === "Ready" || phase === "Error") {
            return;
          }
        }
      } catch {
        // ignore transient errors and keep polling
      }

      if (isActive() && contextIsCurrent()) {
        this.pollTimer = setTimeout(() => { void observe(); }, SNAPSHOT_OBSERVATION_INTERVAL_MS);
      }
    };

    void observe();
  }

  private get isProduction(): boolean {
    return this.props.isProduction.get();
  }

  private canExecute(): boolean {
    if (!this.acknowledged || this.dryRunState !== "passed") {
      return false;
    }

    if (this.isProduction && this.confirmationText.trim() !== (this.freshPvc?.getName() ?? "")) {
      return false;
    }

    return true;
  }

  private renderInputStep() {
    const pvc = this.freshPvc;

    if (!pvc) {
      return null;
    }

    const classes = this.props.volumeSnapshotClassStore.items;

    return (
      <div data-testid="create-snapshot-input-step">
        <div className="snapshot-identity">
          <div className="identity-row">
            <span className="label">Source PVC</span>
            <span className="value">
              {pvc.getName()}
              {" "}
              {"/"}
              {" "}
              {pvc.getNs()}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">Cluster</span>
            <span className="value">{this.props.state.get()?.clusterName}</span>
          </div>
          <div className="identity-row">
            <span className="label">Current Size</span>
            <span className="value">{pvc.spec.resources?.requests?.storage ?? "-"}</span>
          </div>
        </div>
        <label className="snapshot-field">
          <span>Snapshot name</span>
          <Input
            value={this.snapshotNameInput}
            onChange={value => {
              this.snapshotNameInput = value;
              this.validationError = undefined;

              if (this.dryRunState === "passed") {
                this.dryRunState = "idle";
                this.approvedFingerprint = undefined;
              }
            }}
            data-testid="create-snapshot-name-input"
          />
        </label>
        <label className="snapshot-field">
          <span>VolumeSnapshotClass</span>
          <select
            className="snapshot-class-select"
            value={this.selectedClassName}
            onChange={e => {
              this.selectedClassName = e.target.value;

              if (this.dryRunState === "passed") {
                this.dryRunState = "idle";
                this.approvedFingerprint = undefined;
              }
            }}
            data-testid="create-snapshot-class-select"
          >
            <option value="">Default / cluster-defined</option>
            {classes.map(snapshotClass => (
              <option key={snapshotClass.getId()} value={snapshotClass.getName()}>
                {snapshotClass.getName()}
                {snapshotClass.isDefault() ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        {this.validationError && (
          <div className="snapshot-error" data-testid="create-snapshot-validation-error">
            <Icon material="error_outline" small/>
            <span>{this.validationError}</span>
          </div>
        )}
        {this.executeError && (
          <div className="snapshot-error" data-testid="create-snapshot-execution-error">
            <Icon material="error_outline" small/>
            <span>{this.executeError}</span>
          </div>
        )}
        {this.dryRunState === "failed" && this.dryRunError && (
          <div className="snapshot-error" data-testid="create-snapshot-dry-run-error">
            <Icon material="error_outline" small/>
            <div>
              <strong>
                Dry-run failed
                {this.dryRunError.statusCode ? ` (HTTP ${this.dryRunError.statusCode})` : ""}
              </strong>
              <p>{this.dryRunError.message}</p>
            </div>
          </div>
        )}
        {this.dryRunState === "passed" && (
          <div className="snapshot-success" data-testid="create-snapshot-dry-run-passed">
            <Icon material="check_circle" small/>
            <span>Dry-run passed. No cluster resources were changed.</span>
          </div>
        )}
        <button
          className="snapshot-primary-button"
          data-testid="create-snapshot-run-dry-run"
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
    const pvc = this.freshPvc;

    return (
      <div data-testid="create-snapshot-confirm-step">
        <div className="snapshot-identity">
          <div className="identity-row">
            <span className="label">Source PVC</span>
            <span className="value">
              {pvc?.getName()}
              {" "}
              {"/"}
              {" "}
              {pvc?.getNs()}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">Snapshot Name</span>
            <span className="value">{this.snapshotNameInput}</span>
          </div>
          <div className="identity-row">
            <span className="label">Snapshot Class</span>
            <span className="value">{this.selectedClassName || "Default / cluster-defined"}</span>
          </div>
          <div className="identity-row">
            <span className="label">Cluster</span>
            <span className="value">{this.props.state.get()?.clusterName}</span>
          </div>
        </div>
        {this.isProduction && (
          <div className="production-banner" data-testid="create-snapshot-production-warning">
            <Icon material="warning" small/>
            <span>PRODUCTION CLUSTER — creating a snapshot consumes storage and may incur provider costs.</span>
          </div>
        )}
        <p className="snapshot-cost-warning">
          Snapshots consume backend storage. Verify retention and cost policies before proceeding.
        </p>
        <Checkbox
          label="I understand this will create a new VolumeSnapshot from the selected PVC."
          value={this.acknowledged}
          onChange={value => this.acknowledged = value}
          data-testid="create-snapshot-acknowledge"
        />
        {this.isProduction && (
          <label className="production-confirmation">
            <span>
              Type
              <b>{pvc?.getName()}</b>
              {" "}
              to confirm the production snapshot creation
            </span>
            <Input
              value={this.confirmationText}
              onChange={value => this.confirmationText = value}
              data-testid="create-snapshot-production-confirmation"
            />
          </label>
        )}
        {this.executeError && (
          <div className="snapshot-error" data-testid="create-snapshot-execution-error">
            <Icon material="error_outline" small/>
            <span>{this.executeError}</span>
          </div>
        )}
      </div>
    );
  }

  private renderResultStep() {
    const phase = this.resultPhase ?? "Unknown";
    const success = phase === "Ready";
    const error = phase === "Error";

    return (
      <div data-testid="create-snapshot-result-step">
        <div className={cssNames("snapshot-result", { success, error })}>
          {phase === "Pending" && <Spinner/>}
          {success && <Icon material="check_circle" small/>}
          {error && <Icon material="error_outline" small/>}
          <span>{this.resultMessage}</span>
        </div>
      </div>
    );
  }

  private renderStep() {
    switch (this.step) {
      case "input":
        return this.renderInputStep();
      case "confirm":
        return this.renderConfirmStep();
      case "executing":
        return (
          <div className="snapshot-loading" data-testid="create-snapshot-executing">
            <Spinner center/>
            <p>Creating VolumeSnapshot…</p>
          </div>
        );
      case "result":
        return this.renderResultStep();
    }
  }

  render() {
    const { className, state, ...dialogProps } = this.props;
    const request = state.get();

    return (
      <Dialog
        {...dialogProps}
        isOpen={Boolean(request)}
        className={cssNames("CreateVolumeSnapshotDialog", className)}
        close={this.close}
      >
        <h5>
          Create VolumeSnapshot
          {request && <span className="dialog-object-name">{request.pvc.getName()}</span>}
        </h5>
        {this.clusterError && (
          <div className="snapshot-error" data-testid="create-snapshot-cluster-mismatch">
            <Icon material="error_outline" small/>
            <span>{this.clusterError}</span>
          </div>
        )}
        {this.loading ? (
          <div className="snapshot-loading"><Spinner center/></div>
        ) : (
          request && this.renderStep()
        )}
        {request && this.step !== "executing" && this.step !== "result" && (
          <div className="snapshot-footer">
            <button className="snapshot-secondary-button" onClick={this.close}>Cancel</button>
            {this.step === "input" && (
              <button
                className="snapshot-primary-button"
                data-testid="create-snapshot-continue-to-confirm"
                disabled={this.dryRunState !== "passed"}
                onClick={this.goToConfirm}
              >
                Continue
              </button>
            )}
            {this.step === "confirm" && (
              <button
                className="snapshot-danger-button"
                data-testid="create-snapshot-execute"
                disabled={!this.canExecute()}
                onClick={this.execute}
              >
                Create Snapshot
              </button>
            )}
          </div>
        )}
        {this.step === "result" && (
          <div className="snapshot-footer">
            <button className="snapshot-secondary-button" onClick={this.close}>Close</button>
          </div>
        )}
      </Dialog>
    );
  }
}

export const CreateVolumeSnapshotDialog = withInjectables<Dependencies, CreateVolumeSnapshotDialogProps>(NonInjectedCreateVolumeSnapshotDialog, {
  getProps: (di, props) => ({
    ...props,
    state: di.inject(createVolumeSnapshotDialogStateInjectable),
    pvcApi: di.inject(pvcApiInjectable),
    volumeSnapshotApi: di.inject(volumeSnapshotApiInjectable),
    volumeSnapshotClassStore: di.inject(volumeSnapshotClassStoreInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
});
