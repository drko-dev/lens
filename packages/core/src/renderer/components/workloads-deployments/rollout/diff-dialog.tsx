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
import { cssNames } from "@openlens/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import deploymentApiInjectable from "../../../../common/k8s-api/endpoints/deployment.api.injectable";
import replicaSetApiInjectable from "../../../../common/k8s-api/endpoints/replica-set.api.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import type { DeploymentApi, ReplicaSetApi } from "../../../../common/k8s-api/endpoints";
import type { Cluster } from "../../../../common/cluster/cluster";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { assertToolActionClusterContext } from "../../../../common/workspace/tool-context";
import type { RevisionDiffRequest } from "./diff-state.injectable";
import revisionDiffDialogStateInjectable from "./diff-state.injectable";
import type { PreparedRollback, RollbackPreparationError } from "./prepare-rollback";
import { prepareRollback } from "./prepare-rollback";
import { sanitizeRollbackTemplateForDiff } from "./template-patch";
import type { TemplateChangeCategory } from "./template-patch";
import { MonacoDiffEditor } from "../../monaco-editor/monaco-diff-editor";

export interface RevisionDiffDialogProps extends Partial<DialogProps> {
}

interface Dependencies {
  state: IObservableValue<RevisionDiffRequest | undefined>;
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

@observer
class NonInjectedRevisionDiffDialog extends Component<RevisionDiffDialogProps & Dependencies> {
  @observable loading = false;
  @observable preparation?: PreparedRollback;
  @observable error?: RollbackPreparationError;
  private operationGeneration = 0;
  private activeRequest?: RevisionDiffRequest;
  private activeClusterId?: string;

  constructor(props: RevisionDiffDialogProps & Dependencies) {
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
      if (request) {
        void this.onOpen(request);
      } else {
        this.operationGeneration++;
        this.activeRequest = undefined;
        this.preparation = undefined;
        this.error = undefined;
        this.loading = false;
      }
    } else if (clusterId !== this.activeClusterId && request) {
      this.operationGeneration++;
      this.activeClusterId = clusterId;
      this.preparation = undefined;
      this.loading = false;
      this.error = { kind: "precondition", message: "Cluster context changed. Close and reopen this comparison." };
    }
  }

  componentWillUnmount() {
    this.operationGeneration++;
  }

  private currentClusterId(): string {
    return this.props.hostedCluster?.id ?? "unknown";
  }

  private checkClusterContext(request: RevisionDiffRequest): boolean {
    try {
      assertToolActionClusterContext(request.clusterId, this.currentClusterId(), "compare-deployment-revision");

      return true;
    } catch {
      runInAction(() => {
        this.error = { kind: "precondition", message: "Cluster context changed. Close and reopen this comparison." };
      });

      return false;
    }
  }

  close = () => {
    this.operationGeneration++;
    this.activeRequest = undefined;
    this.loading = false;
    this.props.state.set(undefined);
  };

  onOpen = async (request: RevisionDiffRequest) => {
    const clusterId = this.currentClusterId();

    if (this.activeRequest === request && this.activeClusterId === clusterId) {
      return;
    }

    this.activeRequest = request;
    this.activeClusterId = clusterId;
    const generation = ++this.operationGeneration;

    runInAction(() => {
      this.loading = true;
      this.preparation = undefined;
      this.error = undefined;
    });

    if (!this.checkClusterContext(request)) {
      runInAction(() => { this.loading = false; });

      return;
    }

    let result: Awaited<ReturnType<typeof prepareRollback>>;

    try {
      result = await prepareRollback(request, {
        deploymentApi: this.props.deploymentApi,
        replicaSetApi: this.props.replicaSetApi,
      });
    } catch {
      result = {
        status: "error",
        error: { kind: "unknown", message: "Unable to compare revisions from fresh cluster state." },
      };
    }

    if (
      generation !== this.operationGeneration
      || this.props.state.get() !== request
      || this.activeRequest !== request
    ) {
      return;
    }

    if (!this.checkClusterContext(request)) {
      runInAction(() => { this.loading = false; });

      return;
    }

    runInAction(() => {
      this.loading = false;

      if (result.status === "ready") {
        this.preparation = result.preparation;
      } else {
        this.error = result.error;
      }
    });
  };

  renderContents() {
    if (this.loading) {
      return (
        <div className="rollout-dialog-loading" data-testid="revision-diff-loading">
          <Spinner center/>
        </div>
      );
    }

    if (this.error) {
      return (
        <div className="rollout-dialog-error" data-testid="revision-diff-error">
          <Icon material="error_outline"/>
          <div>
            <strong>Unable to compare revisions</strong>
            <p>{this.error.message}</p>
          </div>
        </div>
      );
    }

    const preparation = this.preparation;

    if (!preparation) {
      return null;
    }

    const { deployment, toRevision, fromRevision, targetUid, targetName, createdAt, changeCause } = preparation;
    const currentYaml = toYaml(sanitizeRollbackTemplateForDiff(
      deployment.spec?.template,
      preparation.targetReplicaSet.spec?.template,
    ));
    const targetYaml = toYaml(sanitizeRollbackTemplateForDiff(
      preparation.targetReplicaSet.spec?.template,
      deployment.spec?.template,
    ));

    return (
      <div className="rollout-dialog-content" data-testid="revision-diff">
        <div className="rollout-identity">
          <div className="identity-row">
            <span className="label">Deployment</span>
            <span className="value">{deployment.getName()}</span>
          </div>
          <div className="identity-row">
            <span className="label">Namespace</span>
            <span className="value">{deployment.getNs()}</span>
          </div>
          <div className="identity-row">
            <span className="label">Revisions</span>
            <span className="value">
              {fromRevision === null ? "unknown" : `#${fromRevision}`}
              {" "}
              → #
              {toRevision}
            </span>
          </div>
          <div className="identity-row">
            <span className="label">ReplicaSet</span>
            <span className="value">
              {targetName}
              {" "}
              <code>{targetUid.slice(0, 8)}</code>
            </span>
          </div>
          {createdAt && (
            <div className="identity-row">
              <span className="label">Created</span>
              <span className="value">{new Date(createdAt).toLocaleString()}</span>
            </div>
          )}
          {changeCause && (
            <div className="identity-row">
              <span className="label">Change cause</span>
              <span className="value">{changeCause}</span>
            </div>
          )}
        </div>

        {this.props.isProduction.get() && (
          <div className="production-banner" data-testid="revision-diff-production">
            <Icon material="warning" small/>
            <span>PRODUCTION CLUSTER — this comparison is read-only.</span>
          </div>
        )}

        {preparation.sameTemplate ? (
          <div className="rollout-notice" data-testid="revision-diff-same-template">
            This revision has the same Pod template as the current revision. A rollback would not change anything.
          </div>
        ) : (
          <div className="change-categories" data-testid="revision-diff-categories">
            <span className="label">Detected changes</span>
            {preparation.changes.map(category => (
              <span key={category} className="change-chip">{CATEGORY_LABELS[category]}</span>
            ))}
          </div>
        )}

        <MonacoDiffEditor
          className="revision-diff-editor"
          original={targetYaml}
          modified={currentYaml}
          originalTitle={`Revision #${toRevision} (selected)`}
          modifiedTitle="Current revision"
          readOnlyOriginal
          readOnlyModified
          language="yaml"
          style={{ height: "460px" }}
          options={{ renderSideBySide: true }}
        />
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
        className={cssNames("RevisionDiffDialog", className)}
        onOpen={request && (() => this.onOpen(request))}
        close={this.close}
      >
        <h5>Compare Deploy revisions</h5>
        {request && this.renderContents()}
      </Dialog>
    );
  }
}

export const RevisionDiffDialog = withInjectables<Dependencies, RevisionDiffDialogProps>(NonInjectedRevisionDiffDialog, {
  getProps: (di, props) => ({
    ...props,
    state: di.inject(revisionDiffDialogStateInjectable),
    deploymentApi: di.inject(deploymentApiInjectable),
    replicaSetApi: di.inject(replicaSetApiInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
});
