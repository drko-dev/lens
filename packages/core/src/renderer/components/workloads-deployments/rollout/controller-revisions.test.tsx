/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { DaemonSet, ControllerRevision, StatefulSet } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import controllerRevisionApiInjectable from "../../../../common/k8s-api/endpoints/controller-revision.api.injectable";
import { ControllerRevisionHistory } from "./controller-revisions";

const makeDaemonSet = () => new DaemonSet({
  apiVersion: "apps/v1",
  kind: "DaemonSet",
  metadata: {
    name: "agent",
    namespace: "default",
    uid: "daemonset-uid",
    resourceVersion: "5",
    selfLink: "/apis/apps/v1/namespaces/default/daemonsets/agent",
  },
  spec: {
    selector: { matchLabels: { app: "agent" }},
    template: {
      metadata: { labels: { app: "agent" }},
      spec: { containers: [{ name: "agent", image: "agent:2" }] },
    },
  },
  status: {
    currentRevision: "agent-1",
    updateRevision: "agent-2",
  },
} as never);

const makeStatefulSet = () => new StatefulSet({
  apiVersion: "apps/v1",
  kind: "StatefulSet",
  metadata: {
    name: "db",
    namespace: "default",
    uid: "statefulset-uid",
    resourceVersion: "5",
    selfLink: "/apis/apps/v1/namespaces/default/statefulsets/db",
  },
  spec: {
    serviceName: "db",
    selector: { matchLabels: { app: "db" }},
    template: {
      metadata: { labels: { app: "db" }},
      spec: { containers: [{ name: "db", image: "postgres:16" }] },
    },
  },
  status: {},
} as never);

const makeControllerRevision = (
  name: string,
  revision: number,
  ownerUid: string,
  kind: string,
  data: unknown = {
    spec: {
      template: {
        metadata: { labels: { app: "agent" }, "$patch": "replace" },
        spec: { containers: [{ name: "agent", image: `agent:${revision}` }] },
      },
      selector: { matchLabels: { app: "agent" }},
    },
  },
) => new ControllerRevision({
  apiVersion: "apps/v1",
  kind: "ControllerRevision",
  metadata: {
    name,
    namespace: "default",
    uid: `${name}-uid`,
    resourceVersion: "1",
    selfLink: `/apis/apps/v1/namespaces/default/controllerrevisions/${name}`,
    creationTimestamp: "2024-01-01T00:00:00Z",
    annotations: { "kubernetes.io/change-cause": `change ${revision}` },
    ownerReferences: [{
      apiVersion: "apps/v1",
      kind,
      name: "owner",
      uid: ownerUid,
      controller: true,
    }],
  },
  revision,
  data,
} as never);

describe("ControllerRevisionHistory", () => {
  const renderWith = (list: jest.Mock) => {
    const di = getDiForUnitTesting();

    di.override(controllerRevisionApiInjectable, () => ({ list }) as never);

    return renderFor(di);
  };

  it("shows read-only DaemonSet revisions with current and update markers", async () => {
    const daemonSet = makeDaemonSet();
    const list = jest.fn(async () => [
      makeControllerRevision("agent-1", 1, "daemonset-uid", "DaemonSet"),
      makeControllerRevision("agent-2", 2, "daemonset-uid", "DaemonSet"),
    ]);
    const view = renderWith(list)(<ControllerRevisionHistory workload={daemonSet}/>);

    await view.findByText("agent:2");
    expect(view.getByText("2")).toBeInTheDocument();
    expect(view.getByTestId("controller-revision-history-daemonset")).toBeInTheDocument();
    expect(view.getByText(/read-only/)).toHaveTextContent("read-only");
    expect(view.getByText("Current")).toBeInTheDocument();
    expect(view.getByText("Update target")).toBeInTheDocument();
    expect(view.getByText("change 2")).toBeInTheDocument();
  });

  it("shows unavailable image data for an unsupported historical payload shape", async () => {
    const list = jest.fn(async () => [
      makeControllerRevision("agent-2", 2, "daemonset-uid", "DaemonSet", { patch: "unsupported" }),
    ]);
    const view = renderWith(list)(<ControllerRevisionHistory workload={makeDaemonSet()}/>);

    await view.findByText("Not available");
    expect(view.getByText("2")).toBeInTheDocument();
  });

  it("excludes ControllerRevisions owned by other workloads", async () => {
    const statefulSet = makeStatefulSet();
    const list = jest.fn(async () => [
      makeControllerRevision("db-1", 1, "statefulset-uid", "StatefulSet"),
      makeControllerRevision("other-1", 9, "other-uid", "StatefulSet"),
    ]);
    const view = renderWith(list)(<ControllerRevisionHistory workload={statefulSet}/>);

    await view.findByText("change 1");
    expect(view.queryByText("other-1")).not.toBeInTheDocument();
    expect(view.getByText("Historical")).toBeInTheDocument();
  });

  it("shows an RBAC message on 403", async () => {
    const list = jest.fn(async () => {
      throw { error: { code: 403 }};
    });
    const view = renderWith(list)(<ControllerRevisionHistory workload={makeDaemonSet()}/>);

    await view.findByTestId("controller-revision-error");
    expect(view.getByTestId("controller-revision-error")).toHaveTextContent("RBAC 403");
  });

  it("shows an empty state when no revisions exist", async () => {
    const list = jest.fn(async () => []);
    const view = renderWith(list)(<ControllerRevisionHistory workload={makeDaemonSet()}/>);

    await view.findByTestId("controller-revision-empty");
    expect(view.getByTestId("controller-revision-empty")).toHaveTextContent("No ControllerRevisions");
  });
});
