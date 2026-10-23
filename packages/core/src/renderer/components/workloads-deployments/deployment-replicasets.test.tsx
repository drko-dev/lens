/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { Deployment, ReplicaSet } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import deploymentApiInjectable from "../../../common/k8s-api/endpoints/deployment.api.injectable";
import replicaSetApiInjectable from "../../../common/k8s-api/endpoints/replica-set.api.injectable";
import showDetailsInjectable from "../kube-detail-params/show-details.injectable";
import openRolloutRollbackDialogInjectable from "./rollout/open.injectable";
import openRevisionDiffDialogInjectable from "./rollout/diff-open.injectable";
import type { DeploymentApi, ReplicaSetApi } from "../../../common/k8s-api/endpoints";
import { DeploymentReplicaSets } from "./deployment-replicasets";

const makeDeployment = (paused = false) => new Deployment({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "web",
    namespace: "default",
    uid: "deployment-uid",
    resourceVersion: "100",
    selfLink: "/apis/apps/v1/namespaces/default/deployments/web",
    annotations: { "deployment.kubernetes.io/revision": "2" },
  },
  spec: {
    replicas: 3,
    paused,
    revisionHistoryLimit: 10,
    selector: { matchLabels: { app: "web" }},
    template: {
      metadata: { labels: { app: "web" }},
      spec: { containers: [{ name: "web", image: "nginx:1.29" }] },
    },
  },
} as never);

const makeReplicaSet = (revision: number, uid = `rs-${revision}`) => new ReplicaSet({
  apiVersion: "apps/v1",
  kind: "ReplicaSet",
  metadata: {
    name: `web-${revision}`,
    namespace: "default",
    uid,
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
    replicas: revision === 2 ? 3 : 0,
    template: {
      metadata: { labels: { app: "web" }},
      spec: { containers: [{ name: "web", image: revision === 2 ? "nginx:1.29" : "nginx:1.27" }] },
    },
  },
} as never);

describe("<DeploymentReplicaSets /> rollout history", () => {
  const setup = (replicaSets: ReplicaSet[] | unknown) => {
    const di = getDiForUnitTesting();
    const deploymentApi = {
      get: jest.fn(async () => makeDeployment()),
    };
    const replicaSetApi = {
      list: jest.fn(async () => {
        if (!Array.isArray(replicaSets)) {
          throw replicaSets;
        }

        return replicaSets;
      }),
    };
    const showDetails = jest.fn();
    const openRollback = jest.fn();
    const openDiff = jest.fn();

    di.override(deploymentApiInjectable, () => deploymentApi as unknown as DeploymentApi);
    di.override(replicaSetApiInjectable, () => replicaSetApi as unknown as ReplicaSetApi);
    di.override(showDetailsInjectable, () => showDetails);
    di.override(openRolloutRollbackDialogInjectable, () => openRollback);
    di.override(openRevisionDiffDialogInjectable, () => openDiff);

    return {
      deploymentApi,
      replicaSetApi,
      showDetails,
      openRollback,
      openDiff,
      view: renderFor(di)(<DeploymentReplicaSets deployment={makeDeployment()}/>),
    };
  };

  it("renders revisions and disables rollback to the current revision", async () => {
    const { view, openRollback } = setup([makeReplicaSet(2), makeReplicaSet(1)]);

    await view.findByTestId("deployment-revisions");

    expect(view.getByText("Current")).toBeInTheDocument();
    expect(view.getByTestId("revision-rollback-2")).toBeDisabled();
    expect(view.getByTestId("revision-rollback-1")).not.toBeDisabled();

    fireEvent.click(view.getByTestId("revision-rollback-1"));

    expect(openRollback).toHaveBeenCalledWith({
      deployment: expect.any(Deployment),
      preferredRevision: 1,
    });
  });

  it("opens the read-only diff for any valid revision", async () => {
    const { view, openDiff } = setup([makeReplicaSet(2), makeReplicaSet(1)]);

    await view.findByTestId("deployment-revisions");
    fireEvent.click(view.getByTestId("revision-diff-1"));

    expect(openDiff).toHaveBeenCalledWith({
      deployment: expect.any(Deployment),
      revision: expect.objectContaining({ revision: 1 }),
    });
  });

  it("warns about pruned history and duplicate revisions", async () => {
    const { view } = setup([
      makeReplicaSet(4),
      makeReplicaSet(3),
      makeReplicaSet(3, "rs-3-duplicate"),
    ]);

    await view.findByTestId("deployment-revisions");
    expect(view.getByText(/Revision history is incomplete/)).toBeInTheDocument();
    expect(view.getByText(/Duplicate revision numbers/)).toBeInTheDocument();
  });

  it("shows an RBAC error when ReplicaSets cannot be listed", async () => {
    const { view } = setup({ error: { code: 403 }});

    await view.findByTestId("rollout-history-error");
    expect(view.getByTestId("rollout-history-error")).toHaveTextContent("RBAC 403");
  });

  it("shows an empty state when no revisions remain", async () => {
    const { view } = setup([]);

    await view.findByTestId("rollout-history-empty");
    expect(view.getByTestId("rollout-history-empty")).toHaveTextContent("No revision ReplicaSets");
  });

  it("reloads history when refresh is requested", async () => {
    const { view, replicaSetApi } = setup([makeReplicaSet(2)]);

    await view.findByTestId("deployment-revisions");
    expect(replicaSetApi.list).toHaveBeenCalledTimes(1);

    fireEvent.click(view.getByTestId("rollout-history-refresh"));

    await waitFor(() => expect(replicaSetApi.list).toHaveBeenCalledTimes(2));
  });
});
