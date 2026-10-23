/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { ControllerRevision } from "./controller-revision";

describe("ControllerRevision", () => {
  it("reads root revision and a DaemonSet strategic-merge history payload", () => {
    const response = {
      apiVersion: "apps/v1",
      kind: "ControllerRevision",
      metadata: {
        name: "agent-7",
        namespace: "system",
        uid: "controller-revision-uid",
        resourceVersion: "12",
        selfLink: "/apis/apps/v1/namespaces/system/controllerrevisions/agent-7",
        ownerReferences: [
          {
            apiVersion: "apps/v1",
            kind: "DaemonSet",
            name: "agent",
            uid: "daemonset-uid",
            controller: true,
          },
        ],
      },
      revision: 7,
      data: {
        spec: {
          template: {
            metadata: { labels: { app: "agent" }, $patch: "replace" },
            spec: { containers: [{ name: "agent", image: "agent:7" }] },
          },
          selector: { matchLabels: { app: "agent" } },
        },
      },
    };
    const controllerRevision = new ControllerRevision(response);

    expect(controllerRevision.getRevision()).toBe(7);
    expect(controllerRevision.getImages()).toEqual(["agent:7"]);
  });

  it("does not infer templates from an unsupported controller-owned payload", () => {
    const controllerRevision = new ControllerRevision({
      apiVersion: "apps/v1",
      kind: "ControllerRevision",
      metadata: {
        name: "agent-legacy",
        namespace: "system",
        selfLink: "/apis/apps/v1/namespaces/system/controllerrevisions/agent-legacy",
      },
      revision: 4,
      data: { opaqueHistoricalData: { image: "not-an-image" } },
    });

    expect(controllerRevision.getRevision()).toBe(4);
    expect(controllerRevision.getTemplate()).toBeUndefined();
    expect(controllerRevision.getImages()).toEqual([]);
  });
});
