/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { Node } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import loadPodsFromAllNamespacesInjectable from "../workloads-pods/load-pods-from-all-namespaces.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import type { PodStore } from "../workloads-pods/store";
import { NodeDetails } from "./details";

describe("NodeDetails addresses", () => {
  it("renders every address when a node reports two addresses of the same type, without duplicate React keys", () => {
    const di = getDiForUnitTesting();

    di.override(podStoreInjectable, () => ({ getPodsByNode: () => [], loadKubeMetrics: () => Promise.resolve() }) as unknown as PodStore);
    di.override(subscribeStoresInjectable, () => () => () => {});
    di.override(loadPodsFromAllNamespacesInjectable, () => () => Promise.resolve());

    const node = new Node({
      apiVersion: "v1",
      kind: "Node",
      metadata: {
        name: "node-1",
        uid: "node-1-uid",
        resourceVersion: "1",
        selfLink: "/api/v1/nodes/node-1",
      },
      spec: {},
      status: {
        addresses: [
          { type: "InternalIP", address: "10.0.0.5" },
          { type: "InternalIP", address: "10.13.13.1" },
          { type: "Hostname", address: "node-1" },
        ],
      },
    });

    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = renderFor(di)(<NodeDetails object={node} />);

    expect(getByText("InternalIP: 10.0.0.5")).toBeInTheDocument();
    expect(getByText("InternalIP: 10.13.13.1")).toBeInTheDocument();
    expect(consoleError.mock.calls.filter(([msg]) => String(msg).includes("same key"))).toEqual([]);

    consoleError.mockRestore();
  });
});
