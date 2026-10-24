/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./expand-pvc-dialog.scss";

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
import type { PersistentVolumeClaim, StorageClass } from "@openlens/kube-object";
import type { Cluster } from "../../../../common/cluster/cluster";
import type { PersistentVolumeClaimApi, StorageClassApi } from "../../../../common/k8s-api/endpoints";
import pvcApiInjectable from "../../../../common/k8s-api/endpoints/persistent-volume-claim.api.injectable";
import storageClassApiInjectable from "../../../../common/k8s-api/endpoints/storage-class.api.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { assertToolActionClusterContext } from "../../../../common/workspace/tool-context";
import { classifyDryRunFailure } from "../../dock/edit-resource/edit-resource-model/dry-run-validation";
import pvcExpandDialogStateInjectable, { type PvcExpandRequest } from "./state.injectable";
import {
  buildPvcExpansionPatch,
  classifyPvcExpansionPhase,
  validatePvcExpansion,
} from "./expand-pvc";

export interface PvcExpandDialogProps extends Partial<DialogProps> {}

interface Dependencies {
  state: IObservableValue<PvcExpandRequest | undefined>;
  pvcApi: PersistentVolumeClaimApi;
  storageClassApi: StorageClassApi;
  isProduction: IComputedValue<boolean>;
  hostedCluster: Cluster | undefined;
}

type DryRunState = "idle" | "running" | "passed" | "failed";
type Step = "input" | "confirm" | "executing" | "result";

const statusCodeFromError = (err: unknown): number | undefined => {
  if (err && typeof err === "object" && "statusCode" in err) {
    return (err as { statusCode?: number }).statusCode;
  }

  return undefined;
};

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
};

@observer
class NonInjectedPvcExpandDialog extends Component<PvcExpandDialogProps & Dependencies> {
  @observable step: Step = "input";
  @observable sizeInput = "";
  @observable loading = false;
  @observable freshPvc?: PersistentVolumeClaim;
  @observable storageClass?: StorageClass;
  @observable validationError?: string;
  @observable dryRunState: DryRunState = "idle";
  @observable dryRunError?: { message: string; statusCode?: number };
  @observable acknowledged = false;
  @observable confirmationText = "";
  @observable executeError?: string;
  @observable resultPhase?: "requested" | "accepted" | "pending" | "capacityUpdated" | "error";
  @observable clusterError?: string;
  @observable isSubmitting = false;
  @observable approvedFingerprint?: string;

  private activeRequest?: PvcExpandRequest;
  private activeClusterId?: string;
  private operationGeneration = 0;

  constructor(props: PvcExpandDialogProps & Dependencies) {
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
    this.operationGeneration++;
    this.activeRequest = undefined;
  }

  private currentClusterId(): string {
    return this.props.hostedCluster?.id ?? "unknown";
  }

  private resetState() {
    this.step = "input";
    this.sizeInput = "";
    this.loading = false;
    this.freshPvc = undefined;
    this.storageClass = undefined;
    this.validationError = undefined;
    this.dryRunState = "idle";
    this.dryRunError = undefined;
    this.acknowledged = false;
    this.confirmationText = "";
    this.executeError = undefined;
    this.resultPhase = undefined;
    this.clusterError = undefined;
    this.isSubmitting = false;
    this.approvedFingerprint = undefined;
  }

  private isCurrentOperation(generation: number, request: PvcExpandRequest, expectedStep?: Step): boolean {
    return generation === this.operationGeneration
      && this.props.state.get() === request
      && this.activeRequest === request
      && this.currentClusterId() === request.clusterId
      && (expectedStep === undefined || this.step === expectedStep);
  }

  private checkClusterContext(request?: PvcExpandRequest): boolean {
    const req = request ?? this.props.state.get();

    if (!req) {
      return false;
    }

    try {
      assertToolActionClusterContext(req.clusterId, this.currentClusterId(), "expand-pvc");
      this.clusterError = undefined;

      return true;
    } catch (err) {
      this.clusterError = (err as Error).message;

      return false;
    }
  }

  private onOpen = async (request: PvcExpandRequest) => {
    const generation = ++this.operationGeneration;

    this.loading = true;

    if (!this.checkClusterContext(request)) {
      this.loading = false;

      return;
    }

    try {
      const fresh = await this.props.pvcApi.get({
        name: request.pvc.getName(),
        namespace: request.pvc.getNs(),
      });

      if (!this.isCurrentOperation(generation, request)) {
        return;
      }

      if (!fresh) {
        this.validationError = "The PVC no longer exists.";

        return;
      }

      if (fresh.metadata.uid !== request.pvc.metadata.uid) {
        this.validationError = "The PVC identity changed. Refresh it before expanding.";

        return;
      }

      const storageClassName = fresh.spec.storageClassName;
      let storageClass: StorageClass | undefined;

      if (storageClassName) {
        storageClass = (await this.props.storageClassApi.get({ name: storageClassName })) ?? undefined;
      }

      if (!this.isCurrentOperation(generation, request)) {
        return;
      }

      runInAction(() => {
        this.freshPvc = fresh;
        this.storageClass = storageClass;
      });
    } catch (err) {
      if (!this.isCurrentOperation(generation, request)) {
        return;
      }

      this.validationError = statusCodeFromError(err) === 403
        ? "You do not have permission to read this PVC or its StorageClass (RBAC 403)."
        : "Failed to load PVC details. Check cluster connectivity and try again.";
    } finally {
      if (generation === this.operationGeneration) {
        this.loading = false;
      }
    }
  };

  private close = () => {
    this.operationGeneration++;
    this.props.state.set(undefined);
  };

  private runDryRun = async () => {
    const request = this.props.state.get();
    const pvc = this.freshPvc;
    const storageClass = this.storageClass;

    if (!request || !pvc || this.step !== "input" || this.dryRunState === "running") {
      return;
    }

    const validation = validatePvcExpansion(pvc, this.sizeInput, storageClass);

    if (!validation.valid) {
      this.validationError = validation.error;

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
      const patch = buildPvcExpansionPatch(pvc, this.sizeInput);

      await this.props.pvcApi.patch(
        { name: pvc.getName(), namespace: pvc.getNs() },
        patch,
        "json",
        { dryRun: "All" },
      );

      if (!this.isCurrentOperation(generation, request, "input")) {
        return;
      }

      this.approvedFingerprint = JSON.stringify({
        operation: "expand-pvc",
        uid: pvc.metadata.uid,
        resourceVersion: pvc.metadata.resourceVersion,
        size: this.sizeInput,
        storageClassName: pvc.spec.storageClassName ?? null,
      });
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

    if (!request || this.step !== "confirm" || this.isSubmitting || !this.canExecute()) {
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
      const fresh = await this.props.pvcApi.get({
        name: request.pvc.getName(),
        namespace: request.pvc.getNs(),
      });

      if (!this.isCurrentOperation(generation, request, "executing")) {
        return;
      }

      if (!fresh || fresh.metadata.uid !== request.pvc.metadata.uid) {
        throw new Error("The PVC no longer exists or its identity changed.");
      }

      const storageClassName = fresh.spec.storageClassName;
      const storageClass = storageClassName
        ? (await this.props.storageClassApi.get({ name: storageClassName })) ?? undefined
        : undefined;

      // Full revalidation between the StorageClass GET and the real patch:
      // generation/cluster/request/step, approval gate, prod confirmation.
      if (!this.isCurrentOperation(generation, request, "executing")) {
        return;
      }

      if (!this.canExecute()) {
        this.executeError = "The execution context changed before the real request was sent.";
        this.step = "confirm";

        return;
      }

      const validation = validatePvcExpansion(fresh, this.sizeInput, storageClass);

      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // The approval is bound to the exact PVC generation observed at the
      // dry-run: uid + resourceVersion + size + relevant StorageClass + the
      // approved operation. Any change after the dry-run (including an
      // unrelated resourceVersion bump) voids the approval and forces a new
      // dry-run — the real patch must be built on the same version that was
      // approved, not on a newer version under an older authorization.
      const approvedFingerprint = JSON.stringify({
        operation: "expand-pvc",
        uid: fresh.metadata.uid,
        resourceVersion: fresh.metadata.resourceVersion,
        size: this.sizeInput,
        storageClassName: fresh.spec.storageClassName ?? null,
      });

      if (this.approvedFingerprint !== approvedFingerprint) {
        this.dryRunState = "idle";
        this.approvedFingerprint = undefined;
        this.acknowledged = false;
        this.confirmationText = "";
        this.resultPhase = undefined;
        this.executeError = undefined;
        this.isSubmitting = false;
        this.validationError = "The PVC, its StorageClass, or the requested size changed after the dry-run. Run the dry-run again with fresh cluster state.";
        this.step = "input";
        // Reload from the cluster so the next dry-run starts on the current version.
        void this.onOpen(request);

        return;
      }

      const patch = buildPvcExpansionPatch(fresh, this.sizeInput);

      await this.props.pvcApi.patch(
        { name: fresh.getName(), namespace: fresh.getNs() },
        patch,
        "json",
      );

      if (!this.isCurrentOperation(generation, request, "executing")) {
        return;
      }

      const updated = await this.props.pvcApi.get({
        name: fresh.getName(),
        namespace: fresh.getNs(),
      });

      if (!this.isCurrentOperation(generation, request, "executing")) {
        return;
      }

      runInAction(() => {
        this.resultPhase = updated
          ? classifyPvcExpansionPhase(updated, this.sizeInput)
          : "pending";
        this.step = "result";
      });
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

    return (
      <div data-testid="pvc-expand-input-step">
        <div className="pvc-identity">
          <div className="identity-row">
            <span className="label">PVC</span>
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
          <div className="identity-row">
            <span className="label">Storage Class</span>
            <span className="value">{pvc.spec.storageClassName ?? "-"}</span>
          </div>
          <div className="identity-row">
            <span className="label">Expansion Allowed</span>
            <span className="value">{this.storageClass?.allowVolumeExpansion ? "Yes" : "No"}</span>
          </div>
        </div>
        <label className="pvc-expand-field">
          <span>New size (e.g. 20Gi)</span>
          <Input
            value={this.sizeInput}
            onChange={value => {
              this.sizeInput = value;
              this.validationError = undefined;

              if (this.dryRunState === "passed") {
                this.dryRunState = "idle";
                this.approvedFingerprint = undefined;
              }
            }}
            data-testid="pvc-expand-size-input"
          />
        </label>
        {this.validationError && (
          <div className="pvc-expand-error" data-testid="pvc-expand-validation-error">
            <Icon material="error_outline" small/>
            <span>{this.validationError}</span>
          </div>
        )}
        {this.dryRunState === "failed" && this.dryRunError && (
          <div className="pvc-expand-error" data-testid="pvc-expand-dry-run-error">
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
          <div className="pvc-expand-success" data-testid="pvc-expand-dry-run-passed">
            <Icon material="check_circle" small/>
            <span>Dry-run passed. No cluster resources were changed.</span>
          </div>
        )}
        <button
          className="pvc-expand-primary-button"
          data-testid="pvc-expand-run-dry-run"
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
      <div data-testid="pvc-expand-confirm-step">
        <div className="pvc-identity">
          <div className="identity-row">
            <span className="label">PVC</span>
            <span className="value">
              {pvc?.getName()}
              {" "}
              {"/"}
              {" "}
              {pvc?.getNs()}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">Cluster</span>
            <span className="value">{this.props.state.get()?.clusterName}</span>
          </div>
          <div className="identity-row">
            <span className="label">Current Size</span>
            <span className="value">{pvc?.spec.resources?.requests?.storage ?? "-"}</span>
          </div>
          <div className="identity-row">
            <span className="label">New Size</span>
            <span className="value">{this.sizeInput}</span>
          </div>
        </div>
        {this.isProduction && (
          <div className="production-banner" data-testid="pvc-expand-production-warning">
            <Icon material="warning" small/>
            <span>PRODUCTION CLUSTER — expanding a PVC may trigger storage controller operations and cannot be reversed online.</span>
          </div>
        )}
        <Checkbox
          label="I understand this will increase the requested storage for this PVC."
          value={this.acknowledged}
          onChange={value => this.acknowledged = value}
          data-testid="pvc-expand-acknowledge"
        />
        {this.isProduction && (
          <label className="production-confirmation">
            <span>
              Type
              <b>{pvc?.getName()}</b>
              {" "}
              to confirm the production expansion
            </span>
            <Input
              value={this.confirmationText}
              onChange={value => this.confirmationText = value}
              data-testid="pvc-expand-production-confirmation"
            />
          </label>
        )}
        {this.executeError && (
          <div className="pvc-expand-error" data-testid="pvc-expand-execution-error">
            <Icon material="error_outline" small/>
            <span>{this.executeError}</span>
          </div>
        )}
      </div>
    );
  }

  private renderResultStep() {
    const phase = this.resultPhase ?? "pending";
    const success = phase === "capacityUpdated";
    const pending = phase === "pending" || phase === "requested" || phase === "accepted";

    return (
      <div data-testid="pvc-expand-result-step">
        <div className={cssNames("pvc-expand-result", { success, pending })}>
          {pending && <Spinner/>}
          {success && <Icon material="check_circle" small/>}
          <span>
            {phase === "capacityUpdated" && "Expansion accepted and capacity updated."}
            {phase === "pending" && "Expansion requested. The storage controller is processing the resize."}
            {phase === "requested" && "Expansion requested."}
            {phase === "accepted" && "Expansion accepted by the storage controller."}
            {phase === "error" && "Expansion could not be verified. Check the PVC status."}
          </span>
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
          <div className="pvc-expand-loading" data-testid="pvc-expand-executing">
            <Spinner center/>
            <p>Expanding PVC…</p>
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
        className={cssNames("PvcExpandDialog", className)}
        close={this.close}
      >
        <h5>
          Expand PVC
          {request && <span className="dialog-object-name">{request.pvc.getName()}</span>}
        </h5>
        {this.clusterError && (
          <div className="pvc-expand-error" data-testid="pvc-expand-cluster-mismatch">
            <Icon material="error_outline" small/>
            <span>{this.clusterError}</span>
          </div>
        )}
        {this.loading ? (
          <div className="pvc-expand-loading"><Spinner center/></div>
        ) : (
          request && this.renderStep()
        )}
        {request && this.step !== "executing" && this.step !== "result" && (
          <div className="pvc-expand-footer">
            <button className="pvc-expand-secondary-button" onClick={this.close}>Cancel</button>
            {this.step === "input" && (
              <button
                className="pvc-expand-primary-button"
                data-testid="pvc-expand-continue-to-confirm"
                disabled={this.dryRunState !== "passed"}
                onClick={this.goToConfirm}
              >
                Continue
              </button>
            )}
            {this.step === "confirm" && (
              <button
                className="pvc-expand-danger-button"
                data-testid="pvc-expand-execute"
                disabled={!this.canExecute()}
                onClick={this.execute}
              >
                Expand PVC
              </button>
            )}
          </div>
        )}
        {this.step === "result" && (
          <div className="pvc-expand-footer">
            <button className="pvc-expand-secondary-button" onClick={this.close}>Close</button>
          </div>
        )}
      </Dialog>
    );
  }
}

export const PvcExpandDialog = withInjectables<Dependencies, PvcExpandDialogProps>(NonInjectedPvcExpandDialog, {
  getProps: (di, props) => ({
    ...props,
    state: di.inject(pvcExpandDialogStateInjectable),
    pvcApi: di.inject(pvcApiInjectable),
    storageClassApi: di.inject(storageClassApiInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
});
