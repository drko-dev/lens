/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { computed } from "mobx";
import { Deployment, ReplicaSet } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import deploymentApiInjectable from "../../../../common/k8s-api/endpoints/deployment.api.injectable";
import replicaSetApiInjectable from "../../../../common/k8s-api/endpoints/replica-set.api.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import type { DeploymentApi, ReplicaSetApi } from "../../../../common/k8s-api/endpoints";
import { RevisionDiffDialog } from "./diff-dialog";
import type { OpenRevisionDiffDialog } from "./diff-open.injectable";
import openRevisionDiffDialogInjectable from "./diff-open.injectable";
import { buildDeploymentRevisionHistory } from "./revisions";

jest.mock("../../monaco-editor/monaco-diff-editor", () => ({
  MonacoDiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="monaco-diff">
      {original}
      {modified}
    </div>
  ),
}));

const makeDeployment = (image = "nginx:1.29", password?: string) => new Deployment({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "web",
    namespace: "default",
    uid: "deployment-uid",
    resourceVersion: "100",
    generation: 2,
    selfLink: "/apis/apps/v1/namespaces/default/deployments/web",
    annotations: { "deployment.kubernetes.io/revision": "2" },
  },
  spec: {
    replicas: 3,
    selector: { matchLabels: { app: "web" }},
    template: {
      metadata: { labels: { app: "web" }},
      spec: { containers: [{ name: "web", image, env: password === undefined ? [] : [{ name: "DB_PASSWORD", value: password }] }] },
    },
  },
  status: { observedGeneration: 2, replicas: 3, updatedReplicas: 3 },
} as never);

const makeReplicaSet = (image = "nginx:1.27", password?: string) => new ReplicaSet({
  apiVersion: "apps/v1",
  kind: "ReplicaSet",
  metadata: {
    name: "web-1",
    namespace: "default",
    uid: "rs-1",
    resourceVersion: "10",
    selfLink: "/apis/apps/v1/namespaces/default/replicasets/web-1",
    annotations: { "deployment.kubernetes.io/revision": "1" },
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
      spec: { containers: [{ name: "web", image, env: password === undefined ? [] : [{ name: "DB_PASSWORD", value: password }] }] },
    },
  },
} as never);

describe("<RevisionDiffDialog />", () => {
  let open: OpenRevisionDiffDialog;
  let deploymentApi: { get: jest.Mock; patch: jest.Mock };
  let replicaSetApi: { get: jest.Mock };
  let production: boolean;
  let cluster: { id: string; name: { get: () => string }};

  const setup = () => {
    const di = getDiForUnitTesting();

    deploymentApi = {
      get: jest.fn(async () => makeDeployment()),
      patch: jest.fn(async () => ({})),
    };
    replicaSetApi = { get: jest.fn(async () => makeReplicaSet()) };
    production = false;
    cluster = { id: "cluster-1", name: { get: () => "test-cluster" }};

    di.override(deploymentApiInjectable, () => deploymentApi as unknown as DeploymentApi);
    di.override(replicaSetApiInjectable, () => replicaSetApi as unknown as ReplicaSetApi);
    di.override(isProductionClusterInjectable, () => computed(() => production));
    di.override(hostedClusterInjectable, () => cluster as never);

    open = di.inject(openRevisionDiffDialogInjectable);

    return renderFor(di);
  };

  const request = () => {
    const deployment = makeDeployment();
    const replicaSet = makeReplicaSet();
    const revision = buildDeploymentRevisionHistory(deployment as never, [replicaSet as never]).revisions[0];

    return { deployment, revision };
  };

  it("shows the template diff without mutating anything", async () => {
    const view = setup()(<RevisionDiffDialog />);

    open(request());
    await view.findByTestId("revision-diff");

    expect(view.getByTestId("revision-diff-categories")).toHaveTextContent("Images");
    expect(view.getByTestId("monaco-diff")).toBeInTheDocument();
    expect(deploymentApi.patch).not.toHaveBeenCalled();
  });

  it("redacts literal environment values before passing templates to Monaco", async () => {
    const view = setup()(<RevisionDiffDialog />);

    deploymentApi.get.mockResolvedValue(makeDeployment("nginx:1.29", "current-password"));
    replicaSetApi.get.mockResolvedValue(makeReplicaSet("nginx:1.27", "historical-password"));
    open(request());
    await view.findByTestId("revision-diff");

    expect(view.getByTestId("monaco-diff")).toHaveTextContent("<redacted (changed)>");
    expect(view.queryByText(/current-password|historical-password/)).not.toBeInTheDocument();
  });

  it("warns when the selected template equals the current template", async () => {
    const view = setup()(<RevisionDiffDialog />);
    const base = request();

    replicaSetApi.get.mockResolvedValue(makeReplicaSet("nginx:1.29"));
    open(base);
    await view.findByTestId("revision-diff-same-template");
  });

  it("shows an error when the history cannot be read", async () => {
    const view = setup()(<RevisionDiffDialog />);

    deploymentApi.get.mockResolvedValue(null);
    open(request());
    await view.findByTestId("revision-diff-error");
    expect(view.getByTestId("revision-diff-error")).toHaveTextContent("no longer exists");
  });

  it("marks the comparison as production read-only", async () => {
    const view = setup()(<RevisionDiffDialog />);

    production = true;
    open(request());
    await view.findByTestId("revision-diff-production");
  });
});
