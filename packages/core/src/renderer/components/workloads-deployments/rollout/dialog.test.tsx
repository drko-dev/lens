/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { computed } from "mobx";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { Deployment, ReplicaSet } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";
import deploymentApiInjectable from "../../../../common/k8s-api/endpoints/deployment.api.injectable";
import replicaSetApiInjectable from "../../../../common/k8s-api/endpoints/replica-set.api.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import type { DeploymentApi, ReplicaSetApi } from "../../../../common/k8s-api/endpoints";
import type { Cluster } from "../../../../common/cluster/cluster";
import { RolloutRollbackDialog } from "./dialog";
import type { OpenRolloutRollbackDialog } from "./open.injectable";
import openRolloutRollbackDialogInjectable from "./open.injectable";

jest.mock("../../monaco-editor/monaco-diff-editor", () => ({
  MonacoDiffEditor: () => <div data-testid="monaco-diff"/>,
}));

const makeDeployment = (options: {
  paused?: boolean;
  generation?: number;
  observedGeneration?: number;
  updatedReplicas?: number;
  image?: string;
} = {}) => new Deployment({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "web",
    namespace: "default",
    uid: "deployment-uid",
    resourceVersion: "100",
    generation: options.generation ?? 2,
    selfLink: "/apis/apps/v1/namespaces/default/deployments/web",
    annotations: { "deployment.kubernetes.io/revision": "2" },
  },
  spec: {
    replicas: 3,
    paused: options.paused,
    selector: { matchLabels: { app: "web" }},
    template: {
      metadata: { labels: { app: "web" }},
      spec: { containers: [{ name: "web", image: options.image ?? "nginx:1.29" }] },
    },
  },
  status: {
    observedGeneration: options.observedGeneration ?? 2,
    updatedReplicas: options.updatedReplicas ?? 3,
    readyReplicas: 3,
    availableReplicas: 3,
    replicas: 3,
    unavailableReplicas: 0,
  },
} as never);

const makeReplicaSet = (revision = 1) => new ReplicaSet({
  apiVersion: "apps/v1",
  kind: "ReplicaSet",
  metadata: {
    name: `web-${revision}`,
    namespace: "default",
    uid: `rs-${revision}`,
    resourceVersion: "10",
    creationTimestamp: "2024-01-01T00:00:00Z",
    selfLink: `/apis/apps/v1/namespaces/default/replicasets/web-${revision}`,
    annotations: { "deployment.kubernetes.io/revision": `${revision}` },
    ownerReferences: [{
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: "web",
      uid: "deployment-uid",
      controller: true,
    }],
  },
  spec: {
    replicas: 3,
    template: {
      metadata: { labels: { app: "web" }},
      spec: { containers: [{ name: "web", image: "nginx:1.27" }] },
    },
  },
} as never);

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => { resolvePromise = resolve; });

  return {
    promise,
    resolve: (value: T) => {
      if (!resolvePromise) {
        throw new Error("Deferred promise was not initialized.");
      }

      resolvePromise(value);
    },
  };
}

describe("<RolloutRollbackDialog />", () => {
  let render: DiRender;
  let open: OpenRolloutRollbackDialog;
  let deploymentApi: {
    get: jest.Mock;
    patch: jest.Mock;
  };
  let replicaSetApi: {
    list: jest.Mock;
    get: jest.Mock;
  };
  let cluster: { id: string; name: { get: () => string }};
  let production: boolean;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    deploymentApi = {
      get: jest.fn(async () => makeDeployment()),
      patch: jest.fn(async () => ({})),
    };
    replicaSetApi = {
      list: jest.fn(async () => [makeReplicaSet(1)]),
      get: jest.fn(async () => makeReplicaSet(1)),
    };
    cluster = { id: "cluster-1", name: { get: () => "test-cluster" }};
    production = false;

    di.override(deploymentApiInjectable, () => deploymentApi as unknown as DeploymentApi);
    di.override(replicaSetApiInjectable, () => replicaSetApi as unknown as ReplicaSetApi);
    di.override(hostedClusterInjectable, () => cluster as unknown as Cluster);
    di.override(isProductionClusterInjectable, () => computed(() => production));

    render = renderFor(di);
    open = di.inject(openRolloutRollbackDialogInjectable);
  });

  const openDialog = (preferredRevision = 1) => open({
    deployment: makeDeployment(),
    preferredRevision,
  });

  const walkToDryRun = async (view: ReturnType<DiRender>) => {
    await view.findByTestId("rollback-continue-to-diff");
    fireEvent.click(view.getByTestId("rollback-continue-to-diff"));
    await view.findByTestId("rollback-diff-step");

    if (view.queryByTestId("rollback-in-progress")) {
      fireEvent.click(view.getByTestId("rollback-in-progress-acknowledge"));
    }

    const continueToValidation = await view.findByTestId("rollback-continue-to-dry-run");

    await waitFor(() => expect(continueToValidation).not.toBeDisabled());
    fireEvent.click(continueToValidation);
    await view.findByTestId("rollback-dry-run-step");
  };

  const walkToConfirm = async (view: ReturnType<DiRender>) => {
    await walkToDryRun(view);
    fireEvent.click(view.getByTestId("rollback-run-dry-run"));
    await view.findByTestId("rollback-dry-run-passed");
    fireEvent.click(view.getByTestId("rollback-continue-to-confirm"));
    await view.findByTestId("rollback-confirm-step");
  };

  it("warns and blocks rollback when the Deployment is paused", async () => {
    deploymentApi.get.mockResolvedValue(makeDeployment({ paused: true }));

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await view.findByTestId("rollback-paused");
    await waitFor(() => expect(view.getByTestId("rollback-continue-to-diff")).toBeDisabled());

    expect(replicaSetApi.get).not.toHaveBeenCalled();
  });

  it("aborts when the cluster context changes between opening and preparing", async () => {
    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await view.findByTestId("rollback-continue-to-diff");
    const callsBefore = deploymentApi.get.mock.calls.length;

    cluster.id = "cluster-2";
    fireEvent.click(view.getByTestId("rollback-continue-to-diff"));

    await view.findByTestId("rollback-cluster-mismatch");
    expect(deploymentApi.get).toHaveBeenCalledTimes(callsBefore);
    expect(replicaSetApi.get).not.toHaveBeenCalled();
  });

  it("requires both acknowledgement and the Deployment name in production", async () => {
    production = true;

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);

    expect(view.getByTestId("rollback-production-warning")).toBeInTheDocument();
    expect(view.getByTestId("rollback-execute")).toBeDisabled();

    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    expect(view.getByTestId("rollback-execute")).toBeDisabled();

    fireEvent.change(view.getByTestId("rollback-production-confirmation"), { target: { value: "wrong" }});
    expect(view.getByTestId("rollback-execute")).toBeDisabled();

    fireEvent.change(view.getByTestId("rollback-production-confirmation"), { target: { value: "web" }});
    expect(view.getByTestId("rollback-execute")).not.toBeDisabled();
  });

  it("shows 409 conflicts and does not poll after a failed execution", async () => {
    deploymentApi.patch
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ error: { code: 409, message: "the object has been modified" }});

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);

    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    fireEvent.click(view.getByTestId("rollback-execute"));

    await view.findByTestId("rollback-execution-error");
    expect(view.getByTestId("rollback-execution-error")).toHaveTextContent("HTTP 409");
    expect(view.queryByTestId("rollback-result-step")).not.toBeInTheDocument();
  });

  it("surfaces 422 validation causes", async () => {
    deploymentApi.patch
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({
        error: {
          code: 422,
          message: "the server rejected the patch",
          details: { causes: [{ field: "spec.template", message: "Invalid template" }] },
        },
      });

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    fireEvent.click(view.getByTestId("rollback-execute"));

    await view.findByTestId("rollback-execution-error");
    expect(view.getByTestId("rollback-execution-error")).toHaveTextContent("HTTP 422");
    expect(view.getByTestId("rollback-execution-error")).toHaveTextContent("Validation failed.");
    expect(view.getByTestId("rollback-execution-error")).not.toHaveTextContent("Invalid template");
  });

  it("ignores a dry-run that resolves after closing and reopening the dialog", async () => {
    const delayedDryRun = createDeferred<unknown>();
    const view = render(<RolloutRollbackDialog />);

    deploymentApi.patch.mockImplementationOnce(() => delayedDryRun.promise);
    openDialog();
    await walkToDryRun(view);
    fireEvent.click(view.getByTestId("rollback-run-dry-run"));
    await waitFor(() => expect(deploymentApi.patch).toHaveBeenCalledTimes(1));

    fireEvent.click(view.getByText("Cancel"));
    openDialog();
    await view.findByTestId("rollback-history-step");
    await act(async () => { delayedDryRun.resolve({}); });

    expect(view.queryByTestId("rollback-dry-run-passed")).not.toBeInTheDocument();
    expect(view.getByTestId("rollback-history-step")).toBeInTheDocument();
  });

  it("does not restore stale preparation after closing and reopening the dialog", async () => {
    const delayedRevision = createDeferred<ReplicaSet | null>();
    const view = render(<RolloutRollbackDialog />);

    replicaSetApi.get.mockReturnValueOnce(delayedRevision.promise);
    openDialog();
    await view.findByTestId("rollback-continue-to-diff");
    fireEvent.click(view.getByTestId("rollback-continue-to-diff"));
    await waitFor(() => expect(replicaSetApi.get).toHaveBeenCalledTimes(1));

    fireEvent.click(view.getByText("Cancel"));
    openDialog();
    await view.findByTestId("rollback-history-step");
    await act(async () => { delayedRevision.resolve(makeReplicaSet(1)); });

    expect(view.getByTestId("rollback-history-step")).toBeInTheDocument();
    expect(view.queryByTestId("rollback-diff-step")).not.toBeInTheDocument();
  });

  it("does not let a dry-run result survive a revision or cluster-context change", async () => {
    const delayedDryRun = createDeferred<unknown>();
    const view = render(<RolloutRollbackDialog />);

    replicaSetApi.list.mockResolvedValue([makeReplicaSet(1), makeReplicaSet(4)]);
    deploymentApi.patch.mockImplementationOnce(() => delayedDryRun.promise);
    openDialog();
    await walkToDryRun(view);
    fireEvent.click(view.getByTestId("rollback-run-dry-run"));
    await waitFor(() => expect(deploymentApi.patch).toHaveBeenCalledTimes(1));

    fireEvent.click(view.getByText("Back"));
    fireEvent.click(view.getByText("Back"));
    fireEvent.click(view.getByTestId("rollback-option-4"));
    cluster.id = "cluster-2";
    view.rerender(<RolloutRollbackDialog/>);
    await act(async () => { delayedDryRun.resolve({}); });
    await view.findByTestId("rollback-cluster-mismatch");

    expect(view.queryByTestId("rollback-dry-run-passed")).not.toBeInTheDocument();
    expect(view.getByTestId("rollback-cluster-mismatch")).toBeInTheDocument();
  });

  it("sends only one execute PATCH when the confirmation is clicked repeatedly", async () => {
    const delayedExecution = createDeferred<unknown>();
    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    deploymentApi.patch.mockImplementationOnce(() => delayedExecution.promise);

    act(() => {
      fireEvent.click(view.getByTestId("rollback-execute"));
      fireEvent.click(view.getByTestId("rollback-execute"));
    });

    await waitFor(() => expect(deploymentApi.patch).toHaveBeenCalledTimes(2));
    await act(async () => { delayedExecution.resolve({}); });

    expect(deploymentApi.patch).toHaveBeenCalledTimes(2);
  });

  it("shows a visible terminal timeout when progress cannot be observed", async () => {
    let reads = 0;
    const delayedObservation = createDeferred<Deployment | null>();

    deploymentApi.get.mockImplementation(async () => {
      reads++;

      return reads === 4 ? delayedObservation.promise : makeDeployment();
    });

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    jest.useFakeTimers();

    try {
      await act(async () => {
        fireEvent.click(view.getByTestId("rollback-execute"));

        for (let count = 0; count < 8; count++) {
          await Promise.resolve();
        }
      });

      expect(view.getByTestId("rollback-result-step")).toBeInTheDocument();
      await act(async () => { jest.advanceTimersByTime(120_000); });

      expect(view.getByTestId("rollback-observation")).toHaveTextContent("timedout");
      expect(view.getByTestId("rollback-result-step")).toHaveTextContent("may still be running");
      await act(async () => { delayedObservation.resolve(makeDeployment()); });
      expect(view.getByTestId("rollback-observation")).toHaveTextContent("timedout");
    } finally {
      jest.useRealTimers();
    }
  });

  it("discards an in-flight observation after close and reopen", async () => {
    let reads = 0;
    const delayedObservation = createDeferred<Deployment | null>();

    deploymentApi.get.mockImplementation(async () => {
      reads++;

      return reads === 4 ? delayedObservation.promise : makeDeployment();
    });

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    fireEvent.click(view.getByTestId("rollback-execute"));
    await view.findByTestId("rollback-result-step");
    await waitFor(() => expect(reads).toBeGreaterThan(3));

    fireEvent.click(view.getByText("Close"));
    openDialog();
    await view.findByTestId("rollback-history-step");
    await act(async () => { delayedObservation.resolve(makeDeployment()); });

    expect(view.getByTestId("rollback-history-step")).toBeInTheDocument();
    expect(view.queryByTestId("rollback-result-step")).not.toBeInTheDocument();
  });

  it("shows persistent polling errors as unverified instead of failing the rollback", async () => {
    let reads = 0;

    deploymentApi.get.mockImplementation(async () => {
      reads++;

      if (reads > 3) {
        throw new Error("connection reset");
      }

      return makeDeployment();
    });

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    fireEvent.click(view.getByTestId("rollback-execute"));
    await view.findByTestId("rollback-result-step");

    await waitFor(() => expect(view.getByTestId("rollback-observation")).toHaveTextContent("unverified"), { timeout: 10_000 });
    expect(view.getByTestId("rollback-result-step")).toHaveTextContent("may have been accepted");
    expect(view.getByTestId("rollback-result-step")).not.toHaveTextContent("Rollback failed");
  });

  it("stops polling after the dialog is closed", async () => {
    deploymentApi.get.mockImplementation(async () => makeDeployment({
      generation: 3,
      observedGeneration: 2,
      updatedReplicas: 1,
    }));

    const view = render(<RolloutRollbackDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("rollback-acknowledge"));
    fireEvent.click(view.getByTestId("rollback-execute"));

    await view.findByTestId("rollback-result-step");
    await view.findByTestId("rollback-observation");
    expect(deploymentApi.get.mock.calls.length).toBeGreaterThanOrEqual(4);

    fireEvent.click(view.getByText("Close"));
    const callsAfterClose = deploymentApi.get.mock.calls.length;

    await new Promise(resolve => setTimeout(resolve, 2300));

    expect(deploymentApi.get).toHaveBeenCalledTimes(callsAfterClose);
  });
});
