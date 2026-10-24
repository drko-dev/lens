/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./attach-debug-container-dialog.scss";

import React, { Component } from "react";
import type { IObservableValue, IComputedValue } from "mobx";
import { observable, makeObservable, runInAction, reaction } from "mobx";
import { observer, disposeOnUnmount } from "mobx-react";
import type { Pod } from "@openlens/kube-object";
import type { Cluster } from "../../../../common/cluster/cluster";
import { Dialog } from "../../dialog";
import { Wizard, WizardStep } from "../../wizard";
import { Input } from "../../input";
import { Checkbox } from "../../checkbox";
import { Button } from "@openlens/button";
import { Icon } from "../../icon";
import { Spinner } from "../../spinner";
import type { SelectOption } from "../../select";
import { Select } from "../../select";
import type { SingleValue } from "react-select";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { PodApi, EphemeralContainerOptions } from "../../../../common/k8s-api/endpoints/pod.api";
import podApiInjectable from "../../../../common/k8s-api/endpoints/pod.api.injectable";
import attachDebugContainerDialogStateInjectable from "./attach-debug-container-dialog-state.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { getClusterEnvironmentConfig, isProductionEnvironment } from "../../../../common/cluster/environment-types";
import type { CreatePodTerminalTab } from "../../dock/terminal/create-pod-terminal-tab.injectable";
import createPodTerminalTabInjectable from "../../dock/terminal/create-pod-terminal-tab.injectable";
import type { ShowCheckedErrorNotification } from "../../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../../notifications/show-checked-error.injectable";
import type { ShowNotification } from "../../notifications/notifications";
import showSuccessNotificationInjectable from "../../notifications/show-success-notification.injectable";

const IMAGE_PRESETS: Record<string, string> = {
  busybox: "busybox:latest",
  alpine: "alpine:latest",
  netshoot: "nicolaka/netshoot:latest",
  curl: "curlimages/curl:latest",
};

function isClusterConnectionHealthy(cluster?: Cluster): boolean {
  if (!cluster) return false;

  if (typeof cluster.available?.get === "function") {
    return cluster.available.get();
  }

  const accessible = typeof (cluster.accessible as any)?.get === "function"
    ? (cluster.accessible as any).get()
    : (cluster.accessible as any) !== false;

  const disconnected = typeof (cluster.disconnected as any)?.get === "function"
    ? (cluster.disconnected as any).get()
    : Boolean(cluster.disconnected);

  return accessible && !disconnected;
}

interface Dependencies {
  state: IObservableValue<Pod | undefined>;
  podApi: PodApi;
  isProduction: IComputedValue<boolean>;
  cluster?: Cluster;
  createPodTerminalTab: CreatePodTerminalTab;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
  showSuccessNotification: ShowNotification;
}

@observer
class NonInjectedAttachDebugContainerDialog extends Component<Dependencies> {
  @observable selectedPreset = "busybox";
  @observable customImage = "";
  @observable containerName = "";
  @observable targetContainer = "";
  @observable command = "sh";
  @observable prodConfirmed = false;
  @observable prodConfirmationInput = "";
  @observable submitting = false;
  @observable waitingForReady = false;
  @observable errorMessage?: string;
  @observable containerStatusText?: string;
  @observable pollingCancelled = false;
  @observable isExecuting = false;

  public pollIntervalMs = 500;
  public maxPollAttempts = 30;
  private currentGeneration = 0;
  private currentAbortController?: AbortController;
  private cancelCurrentWait?: () => void;
  private initialClusterId?: string;
  private initialPodUid?: string;
  private initialPodName?: string;
  private initialPodNamespace?: string;

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  private cancelableDelay(ms: number): Promise<boolean> {
    return new Promise(resolve => {
      let timerId: any = undefined;

      const cleanup = () => {
        if (timerId !== undefined) {
          clearTimeout(timerId);
          timerId = undefined;
        }

        if (this.cancelCurrentWait === cancel) {
          this.cancelCurrentWait = undefined;
        }
      };

      const cancel = () => {
        cleanup();
        resolve(false);
      };

      this.cancelCurrentWait = cancel;

      timerId = setTimeout(() => {
        cleanup();
        resolve(true);
      }, ms);
    });
  }

  componentDidMount() {
    disposeOnUnmount(this, [
      reaction(
        () => this.props.state.get(),
        (pod) => {
          this.currentGeneration++;
          this.pollingCancelled = true;

          if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = undefined;
          }

          if (this.cancelCurrentWait) {
            this.cancelCurrentWait();
            this.cancelCurrentWait = undefined;
          }

          if (pod) {
            runInAction(() => {
              this.selectedPreset = "busybox";
              this.customImage = "";
              this.containerName = `debugger-${Math.random().toString(36).substring(2, 7)}`;
              this.targetContainer = pod.getContainers()[0]?.name ?? "";
              this.command = "sh";
              this.prodConfirmed = false;
              this.prodConfirmationInput = "";
              this.submitting = false;
              this.waitingForReady = false;
              this.isExecuting = false;
              this.errorMessage = undefined;
              this.containerStatusText = undefined;
              this.pollingCancelled = false;
              this.initialClusterId = this.props.cluster?.id;
              this.initialPodUid = pod.getId();
              this.initialPodName = pod.getName();
              this.initialPodNamespace = pod.getNs();
            });
          }
        },
        { fireImmediately: true },
      ),
    ]);
  }

  componentWillUnmount() {
    this.currentGeneration++;
    this.pollingCancelled = true;
    this.isExecuting = false;

    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
    }

    if (this.cancelCurrentWait) {
      this.cancelCurrentWait();
      this.cancelCurrentWait = undefined;
    }
  }

  close = () => {
    this.currentGeneration++;
    this.pollingCancelled = true;
    this.isExecuting = false;

    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
    }

    if (this.cancelCurrentWait) {
      this.cancelCurrentWait();
      this.cancelCurrentWait = undefined;
    }

    runInAction(() => {
      this.props.state.set(undefined);
      this.errorMessage = undefined;
      this.submitting = false;
      this.waitingForReady = false;
      this.containerStatusText = undefined;
      this.prodConfirmed = false;
      this.prodConfirmationInput = "";
    });
  };

  getImage(): string {
    if (this.selectedPreset === "custom") {
      return this.customImage.trim();
    }

    return IMAGE_PRESETS[this.selectedPreset] || "busybox:latest";
  }

  isFormValid(pod: Pod): boolean {
    const name = this.containerName.trim();

    if (!name || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
      return false;
    }

    const image = this.getImage();

    if (!image) {
      return false;
    }

    const existingNames = new Set([
      ...pod.getContainers().map(c => c.name),
      ...pod.getInitContainers().map(c => c.name),
      ...((pod.spec as any)?.ephemeralContainers ?? []).map((c: any) => c.name),
    ]);

    if (existingNames.has(name)) {
      return false;
    }

    const isProd = this.props.isProduction.get() || isProductionEnvironment(this.props.cluster?.preferences);

    if (isProd) {
      if (!this.prodConfirmed) {
        return false;
      }

      if (this.prodConfirmationInput.trim() !== pod.getName()) {
        return false;
      }
    }

    return true;
  }

  async waitForContainerRunning(
    pod: Pod,
    containerName: string,
    initialClusterId: string,
    initialPodUid: string,
    opGeneration: number,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      if (this.currentGeneration !== opGeneration || this.pollingCancelled || !this.props.state.get()) {
        return false;
      }

      // Pre-check cluster consistency
      const currentClusterId = this.props.cluster?.id;

      if (!currentClusterId || currentClusterId !== initialClusterId) {
        if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
          runInAction(() => {
            this.waitingForReady = false;
            this.submitting = false;
            this.containerStatusText = undefined;
            this.errorMessage = "Security Guard: Active cluster changed or lost during container startup. Aborting terminal launch.";
          });
        }

        return false;
      }

      // Pre-check cluster connection status
      if (!isClusterConnectionHealthy(this.props.cluster)) {
        if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
          runInAction(() => {
            this.waitingForReady = false;
            this.submitting = false;
            this.containerStatusText = undefined;
            this.errorMessage = "Security Guard: Cluster disconnected during container startup. Aborting terminal launch.";
          });
        }

        return false;
      }

      // Pre-check target pod identity
      const activePod = this.props.state.get();

      if (!activePod || activePod.getId() !== initialPodUid) {
        if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
          runInAction(() => {
            this.waitingForReady = false;
            this.submitting = false;
            this.containerStatusText = undefined;
            this.errorMessage = "Security Guard: Target pod changed during container startup. Aborting terminal launch.";
          });
        }

        return false;
      }

      try {
        const freshPod = await this.props.podApi.get({
          name: pod.getName(),
          namespace: pod.getNs(),
        });

        // Post-GET checks (Safe polling against late responses and obsolete generations)
        if (this.currentGeneration !== opGeneration || this.pollingCancelled || !this.props.state.get()) {
          return false;
        }

        const clusterAfterGet = this.props.cluster?.id;

        if (!clusterAfterGet || clusterAfterGet !== initialClusterId) {
          if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
            runInAction(() => {
              this.waitingForReady = false;
              this.submitting = false;
              this.containerStatusText = undefined;
              this.errorMessage = "Security Guard: Active cluster changed or lost during container startup. Aborting terminal launch.";
            });
          }

          return false;
        }

        if (!isClusterConnectionHealthy(this.props.cluster)) {
          if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
            runInAction(() => {
              this.waitingForReady = false;
              this.submitting = false;
              this.containerStatusText = undefined;
              this.errorMessage = "Security Guard: Cluster disconnected during container startup. Aborting terminal launch.";
            });
          }

          return false;
        }

        const podAfterGet = this.props.state.get();

        if (!podAfterGet || podAfterGet.getId() !== initialPodUid) {
          if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
            runInAction(() => {
              this.waitingForReady = false;
              this.submitting = false;
              this.containerStatusText = undefined;
              this.errorMessage = "Security Guard: Target pod changed during container startup. Aborting terminal launch.";
            });
          }

          return false;
        }

        if (!freshPod) {
          if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
            runInAction(() => {
              this.waitingForReady = false;
              this.submitting = false;
              this.containerStatusText = undefined;
              this.errorMessage = `Target pod "${pod.getName()}" no longer found.`;
            });
          }

          return false;
        }

        // Validate returned Pod UID equals expected UID (detects deleted and recreated pod)
        if (freshPod.getId() !== initialPodUid) {
          if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
            runInAction(() => {
              this.waitingForReady = false;
              this.submitting = false;
              this.containerStatusText = undefined;
              this.errorMessage = `Security Guard: Target pod "${pod.getName()}" UID mismatch (expected ${initialPodUid}, found ${freshPod.getId()}). Pod was recreated. Aborting terminal launch.`;
            });
          }

          return false;
        }

        const ephemeralStatuses = (freshPod.status as any)?.ephemeralContainerStatuses as Array<any> | undefined;
        const status = ephemeralStatuses?.find(s => s.name === containerName);

        if (status?.state?.running) {
          // Pre-terminal atomic re-check
          const finalClusterId = this.props.cluster?.id;
          const finalPod = this.props.state.get();

          if (
            this.currentGeneration !== opGeneration ||
            this.pollingCancelled ||
            !finalClusterId ||
            finalClusterId !== initialClusterId ||
            !isClusterConnectionHealthy(this.props.cluster) ||
            !finalPod ||
            finalPod.getId() !== initialPodUid ||
            freshPod.getId() !== initialPodUid
          ) {
            return false;
          }

          runInAction(() => {
            this.containerStatusText = "Container is Running. Launching terminal...";
          });

          this.props.showSuccessNotification(`Debug container "${containerName}" is running`);

          try {
            this.props.createPodTerminalTab({
              selectedPod: freshPod,
              selectedContainer: { name: containerName },
            });
          } catch (termErr) {
            this.props.showCheckedErrorNotification(termErr, "Container running, but failed to open terminal automatically");
          }

          this.close();

          return true;
        }

        if (status?.state?.terminated) {
          const term = status.state.terminated;
          const exitCode = term.exitCode ?? 1;
          const reason = term.reason || term.message || "Terminated";

          if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
            runInAction(() => {
              this.waitingForReady = false;
              this.submitting = false;
              this.containerStatusText = undefined;
              this.errorMessage = `Debug container failed or terminated (exit code ${exitCode}: ${reason}). Terminal will not be opened.`;
            });
          }

          return false;
        }

        const waitingReason = status?.state?.waiting?.reason || "ContainerCreating";

        if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
          runInAction(() => {
            this.containerStatusText = `Mutation accepted. Container is pending (${waitingReason})... (attempt ${attempt}/${this.maxPollAttempts})`;
          });
        }
      } catch (err: any) {
        if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
          runInAction(() => {
            this.containerStatusText = `Checking container status... (attempt ${attempt}/${this.maxPollAttempts})`;
          });
        }
      }

      // Cancelable wait: cleanly resolves immediately upon cancellation or unmount
      const completed = await this.cancelableDelay(this.pollIntervalMs);

      if (!completed || this.currentGeneration !== opGeneration || this.pollingCancelled || !this.props.state.get()) {
        return false;
      }
    }

    if (this.currentGeneration === opGeneration && !this.pollingCancelled && this.props.state.get()) {
      runInAction(() => {
        this.waitingForReady = false;
        this.submitting = false;
        this.containerStatusText = undefined;
        this.errorMessage = "Timeout: Debug container did not reach Running state within allowed time. Terminal was not opened.";
      });
    }

    return false;
  }

  attachAndLaunch = async () => {
    // Hallazgo C: Strict internal execution barrier to prevent concurrent or duplicate executions
    if (this.isExecuting || this.submitting || this.waitingForReady) {
      return;
    }

    this.isExecuting = true;

    const pod = this.props.state.get();

    if (!pod) {
      this.isExecuting = false;

      return;
    }

    // Zero-mutation check: validate form before touching API
    if (!this.isFormValid(pod)) {
      this.isExecuting = false;

      return;
    }

    // Multi-cluster & unknown identity protection (Point 5)
    const currentClusterId = this.props.cluster?.id;
    const isAccessible = isClusterConnectionHealthy(this.props.cluster);

    if (!currentClusterId || !this.initialClusterId) {
      runInAction(() => {
        this.errorMessage = "Security Guard: Active cluster identity is unknown. Operation rejected.";
      });
      this.isExecuting = false;

      return;
    }

    if (this.initialClusterId !== currentClusterId) {
      runInAction(() => {
        this.errorMessage = "Security Guard: Active cluster changed while dialog was open. Operation aborted to protect target context.";
      });
      this.isExecuting = false;

      return;
    }

    if (!isAccessible) {
      runInAction(() => {
        this.errorMessage = "Security Guard: Active cluster is disconnected or inaccessible. Operation rejected.";
      });
      this.isExecuting = false;

      return;
    }

    if (pod.getId() !== this.initialPodUid || pod.getName() !== this.initialPodName || pod.getNs() !== this.initialPodNamespace) {
      runInAction(() => {
        this.errorMessage = "Security Guard: Target pod changed. Operation aborted.";
      });
      this.isExecuting = false;

      return;
    }

    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
    }

    const abortController = new AbortController();

    this.currentAbortController = abortController;

    const opGeneration = ++this.currentGeneration;
    const opPodUid = this.initialPodUid || pod.getId();
    const opClusterId = this.initialClusterId;

    runInAction(() => {
      this.submitting = true;
      this.errorMessage = undefined;
      this.containerStatusText = "Submitting debug container patch...";
    });

    const debugContainer: EphemeralContainerOptions = {
      name: this.containerName.trim(),
      image: this.getImage(),
      stdin: true,
      tty: true,
      command: this.command.trim() ? [this.command.trim()] : ["sh"],
      targetContainerName: this.targetContainer.trim() || undefined,
    };

    try {
      await this.props.podApi.attachEphemeralContainer(
        { name: pod.getName(), namespace: pod.getNs() },
        debugContainer,
        {
          resourceVersion: pod.getResourceVersion(),
          signal: abortController.signal,
          isCancelled: () => this.currentGeneration !== opGeneration || this.pollingCancelled,
          generation: opGeneration,
          getCurrentGeneration: () => this.currentGeneration,
          clusterId: opClusterId,
          getCurrentClusterId: () => this.props.cluster?.id,
          isClusterHealthy: () => isClusterConnectionHealthy(this.props.cluster),
          expectedPodUid: opPodUid,
          expectedName: pod.getName(),
          expectedNamespace: pod.getNs(),
          validateContext: (freshPod: Pod) => {
            const currentCluster = this.props.cluster;

            if (!currentCluster || currentCluster.id !== opClusterId) {
              return "Security Guard: Active cluster changed or lost during operation.";
            }

            if (!isClusterConnectionHealthy(currentCluster)) {
              return "Security Guard: Active cluster disconnected during operation.";
            }

            const activePod = this.props.state.get();

            if (!activePod || activePod.getId() !== opPodUid) {
              return "Security Guard: Target pod changed during operation.";
            }

            const isProdNow = this.props.isProduction.get() || isProductionEnvironment(currentCluster.preferences) || getClusterEnvironmentConfig(currentCluster?.preferences).isProduction;

            if (isProdNow) {
              const isConfirmed = this.prodConfirmed && this.prodConfirmationInput.trim() === freshPod.getName();

              if (!isConfirmed) {
                return "Security Guard: Workload is in PRODUCTION but confirmation is invalid or missing.";
              }
            }

            return true;
          },
        },
      );

      // Post-PATCH checks: Was operation cancelled or superseded while PATCH was in flight?
      // Important: Local cancellation does not guarantee cancelling a mutation already accepted by Kubernetes.
      // If cancelled, we abandon tracking and do not proceed to polling or terminal launch.
      if (
        this.currentGeneration !== opGeneration ||
        this.pollingCancelled ||
        !this.props.state.get() ||
        this.props.state.get()?.getId() !== opPodUid ||
        this.props.cluster?.id !== opClusterId ||
        !isClusterConnectionHealthy(this.props.cluster)
      ) {
        return;
      }

      runInAction(() => {
        this.waitingForReady = true;
        this.containerStatusText = "Mutation accepted. Waiting for debug container to reach Running state...";
      });

      // Poll until container is running, or timeout/error occurs (Point 2)
      await this.waitForContainerRunning(pod, debugContainer.name, opClusterId, opPodUid, opGeneration);
    } catch (err: any) {
      // Discard error if operation was aborted, cancelled, or superseded by a newer generation
      if (
        (err?.name === "AbortError" && (err?.statusCode === 499 || err?.code === 499)) ||
        this.currentGeneration !== opGeneration ||
        this.pollingCancelled ||
        !this.props.state.get() ||
        this.props.state.get()?.getId() !== opPodUid ||
        this.props.cluster?.id !== opClusterId
      ) {
        return;
      }

      runInAction(() => {
        this.submitting = false;
        this.waitingForReady = false;
        this.containerStatusText = undefined;

        const code = err?.statusCode || err?.code;

        if (code === 403) {
          this.errorMessage = "Permission Denied (HTTP 403): Your account lacks RBAC permission to update subresource pods/ephemeralcontainers.";
        } else if (code === 404) {
          this.errorMessage = "Not Found (HTTP 404): The Pod or subresource pods/ephemeralcontainers was not found. Verify cluster version is Kubernetes 1.25+.";
        } else if (code === 409) {
          this.errorMessage = "Conflict (HTTP 409): The Pod was modified concurrently. Please close and re-open to fetch the latest resourceVersion.";
        } else if (code === 412) {
          this.errorMessage = `Precondition Failed (HTTP 412): ${err?.message || "Pod context or identity changed before mutation"}.`;
        } else if (code === 422) {
          this.errorMessage = `Unprocessable Entity (HTTP 422): ${err?.message || "Invalid container spec or duplicate container name"}.`;
        } else {
          this.errorMessage = `Failed to attach debug container: ${err?.message || String(err)}`;
        }
      });
    } finally {
      this.isExecuting = false;
    }
  };

  render() {
    const pod = this.props.state.get();

    if (!pod) return null;

    const envConfig = getClusterEnvironmentConfig(this.props.cluster?.preferences);
    const isProd = this.props.isProduction.get() || envConfig.isProduction;
    const clusterName = this.props.cluster?.name || "current cluster";
    const environment = envConfig.label.toUpperCase();
    const existingContainers = pod.getContainers();

    const targetOptions: SelectOption<string>[] = [
      { label: "None (Pod process namespace)", value: "" },
      ...existingContainers.map(c => ({
        label: `${c.name} (${c.image})`,
        value: c.name,
      })),
    ];

    const canSubmit = this.isFormValid(pod) && !this.submitting;

    return (
      <Dialog
        isOpen={Boolean(pod)}
        close={this.close}
        className="AttachDebugContainerDialog"
        data-testid="attach-debug-container-dialog"
      >
        <Wizard
          header={<h5>Attach Debug Container (kubectl debug)</h5>}
          done={this.close}
        >
          <WizardStep
            contentClass="debug-dialog-content"
            nextLabel={this.waitingForReady ? "Waiting for container..." : this.submitting ? "Attaching..." : "Attach and Launch"}
            next={this.attachAndLaunch}
            disabledNext={!canSubmit || this.waitingForReady}
          >
            {/* Target Pod and Cluster Summary */}
            <div className="target-summary">
              <div className="summary-row">
                <span className="summary-label">Cluster:</span>
                <span className="summary-value" data-testid="target-cluster">
                  {clusterName}
                  {" "}
                  (
                  {environment}
                  )
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Namespace:</span>
                <span className="summary-value" data-testid="target-namespace">{pod.getNs()}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Pod:</span>
                <span className="summary-value" data-testid="target-pod">{pod.getName()}</span>
              </div>
            </div>

            {/* Immutability Warning Banner */}
            <div className="immutable-warning-banner" data-testid="immutable-warning-banner">
              <Icon material="warning" className="icon" />
              <div>
                <strong>Persistent Pod Modification:</strong>
                {" "}
                Once attached, ephemeral containers become a permanent part of the Pod spec and cannot be removed like standard containers.
              </div>
            </div>

            {/* PROD Guard Inviolable Banner */}
            {isProd && (
              <div className="prod-guard-banner" data-testid="prod-guard-banner">
                <Icon material="gpp_maybe" className="icon" />
                <div>
                  <strong>PRODUCTION CLUSTER:</strong>
                  {" "}
                  You are injecting an ephemeral debug container into a production workload. This will consume node resources and persist in cluster audit logs.
                  <div style={{ marginTop: 8 }}>
                    <Checkbox
                      label={`I confirm attaching debug container to ${pod.getName()} in PRODUCTION`}
                      value={this.prodConfirmed}
                      onChange={v => runInAction(() => { this.prodConfirmed = v; })}
                      data-testid="prod-confirm-checkbox"
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                      To authorize, type the exact Pod name (
                      <strong>{pod.getName()}</strong>
                      ):
                    </label>
                    <Input
                      data-testid="prod-confirmation-input"
                      value={this.prodConfirmationInput}
                      onChange={v => runInAction(() => { this.prodConfirmationInput = v; })}
                      placeholder={pod.getName()}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Error Message Banner */}
            {this.errorMessage && (
              <div
                className="prod-guard-banner"
                style={{ marginBottom: 16 }}
                data-testid="error-banner">
                <Icon material="error_outline" className="icon" />
                <div>{this.errorMessage}</div>
              </div>
            )}

            {/* Container Startup Status Banner */}
            {this.containerStatusText && (
              <div
                className="container-status-banner"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 4,
                  marginBottom: 16,
                  backgroundColor: "rgba(59, 130, 246, 0.15)",
                  border: "1px solid #3b82f6",
                  color: "#93c5fd",
                }}
                data-testid="container-status-banner"
              >
                <Spinner singleColor />
                <div>
                  <strong>Status:</strong>
                  {" "}
                  {this.containerStatusText}
                </div>
              </div>
            )}

            {/* Container Name */}
            <div className="form-group">
              <label htmlFor="debug-container-name">Container Name</label>
              <Input
                id="debug-container-name"
                data-testid="debug-container-name-input"
                value={this.containerName}
                onChange={v => runInAction(() => { this.containerName = v; })}
                placeholder="debugger-xyz"
              />
              <span className="helper-text">Must be a unique lowercase DNS label (RFC 1123).</span>
            </div>

            {/* Image Presets & Input */}
            <div className="form-group">
              <label>Debug Image</label>
              <div className="image-preset-buttons">
                {Object.keys(IMAGE_PRESETS).map(preset => (
                  <Button
                    key={preset}
                    plain={this.selectedPreset !== preset}
                    primary={this.selectedPreset === preset}
                    label={preset}
                    onClick={() => runInAction(() => { this.selectedPreset = preset; })}
                    data-testid={`preset-${preset}`}
                  />
                ))}
                <Button
                  plain={this.selectedPreset !== "custom"}
                  primary={this.selectedPreset === "custom"}
                  label="custom"
                  onClick={() => runInAction(() => { this.selectedPreset = "custom"; })}
                  data-testid="preset-custom"
                />
              </div>

              {this.selectedPreset === "custom" ? (
                <Input
                  id="debug-custom-image"
                  data-testid="debug-custom-image-input"
                  value={this.customImage}
                  onChange={v => runInAction(() => { this.customImage = v; })}
                  placeholder="e.g. curlimages/curl:latest"
                />
              ) : (
                <div style={{ fontSize: 12, color: "var(--textColorSecondary)", fontFamily: "var(--font-monospace)" }}>
                  {IMAGE_PRESETS[this.selectedPreset]}
                </div>
              )}
            </div>

            {/* Target Container (Process Namespace Sharing) */}
            <div className="form-group">
              <label htmlFor="debug-target-container">Target Container (Process Namespace Sharing)</label>
              <Select<string, SelectOption<string>, false>
                id="debug-target-container"
                data-testid="debug-target-container-select"
                menuPortalTarget={null}
                options={targetOptions}
                value={this.targetContainer}
                onChange={(opt: SingleValue<SelectOption<string>>) => {
                  runInAction(() => {
                    this.targetContainer = opt?.value ?? "";
                  });
                }}
              />
              <span className="helper-text">Optional: shares process namespace with the target container (e.g. for gdb, strace, or inspect).</span>
            </div>

            {/* Command / Shell */}
            <div className="form-group">
              <label htmlFor="debug-command">Initial Command</label>
              <Input
                id="debug-command"
                data-testid="debug-command-input"
                value={this.command}
                onChange={v => runInAction(() => { this.command = v; })}
                placeholder="sh"
              />
            </div>
          </WizardStep>
        </Wizard>
      </Dialog>
    );
  }
}

export const AttachDebugContainerDialog = withInjectables<Dependencies>(
  NonInjectedAttachDebugContainerDialog,
  {
    getProps: (di) => ({
      state: di.inject(attachDebugContainerDialogStateInjectable),
      podApi: di.inject(podApiInjectable),
      isProduction: di.inject(isProductionClusterInjectable),
      cluster: di.inject(hostedClusterInjectable),
      createPodTerminalTab: di.inject(createPodTerminalTabInjectable),
      showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
      showSuccessNotification: di.inject(showSuccessNotificationInjectable),
    }),
  },
);
