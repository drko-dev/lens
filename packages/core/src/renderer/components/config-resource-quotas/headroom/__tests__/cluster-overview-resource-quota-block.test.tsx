/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { renderFor } from "../../../test-utils/renderFor";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import type { DiContainer } from "@ogre-tools/injectable";
import { ResourceQuota } from "@openlens/kube-object";
import resourceQuotaStoreInjectable from "../../store.injectable";
import subscribeStoresInjectable from "../../../../kube-watch-api/subscribe-stores.injectable";
import { ClusterOverviewResourceQuotaBlock } from "../cluster-overview-resource-quota-block";

describe("ClusterOverviewResourceQuotaBlock (R7-08 Headroom Integration)", () => {
  let di: DiContainer;
  let mockStore: any;
  let mockSubscribeStores: jest.Mock;

  const createMockQuota = (name: string, namespace: string, cpuHard = "4", cpuUsed = "2"): ResourceQuota => {
    return new ResourceQuota({
      apiVersion: "v1",
      kind: "ResourceQuota",
      metadata: {
        name,
        namespace,
        uid: `uid-${name}`,
        selfLink: `/api/v1/namespaces/${namespace}/resourcequotas/${name}`,
        resourceVersion: "1",
      },
      spec: {
        hard: { "requests.cpu": cpuHard },
      },
      status: {
        hard: { "requests.cpu": cpuHard },
        used: { "requests.cpu": cpuUsed },
      },
    });
  };

  beforeEach(() => {
    di = getDiForUnitTesting();

    mockSubscribeStores = jest.fn().mockReturnValue(() => {});

    mockStore = {
      isLoaded: true,
      isLoading: false,
      items: [],
    };

    di.override(resourceQuotaStoreInjectable, () => mockStore);
    di.override(subscribeStoresInjectable, () => mockSubscribeStores);
  });

  it("subscribes to resourceQuotaStore on mount and unsubscribes on unmount", () => {
    const unsubscribeSpy = jest.fn();

    mockSubscribeStores.mockReturnValueOnce(unsubscribeSpy);

    const { unmount } = renderFor(di)(<ClusterOverviewResourceQuotaBlock />);

    expect(mockSubscribeStores).toHaveBeenCalledWith([mockStore]);
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalled();
  });

  it("renders empty state when no ResourceQuotas exist in cluster", () => {
    mockStore.items = [];

    const { getByTestId, getByText } = renderFor(di)(<ClusterOverviewResourceQuotaBlock />);

    expect(getByTestId("cluster-quotas-empty")).toBeInTheDocument();
    expect(getByText("No ResourceQuotas defined in this cluster.")).toBeInTheDocument();
  });

  it("renders quotas grouped strictly by namespace without cross-namespace aggregation", () => {
    const quotaA1 = createMockQuota("quota-1", "backend", "10", "5");
    const quotaA2 = createMockQuota("quota-2", "backend", "20", "15");
    const quotaB1 = createMockQuota("quota-team", "frontend", "4", "3.8");

    mockStore.items = [quotaA1, quotaA2, quotaB1];

    const { getByTestId, getAllByTestId, getByText } = renderFor(di)(<ClusterOverviewResourceQuotaBlock />);

    expect(getByTestId("cluster-quotas-headroom")).toBeInTheDocument();
    expect(getByText("ResourceQuota Headroom (by Namespace)")).toBeInTheDocument();

    // Verify distinct namespace badges
    expect(getByTestId("quota-namespace-group-backend")).toHaveTextContent("Namespace: backend");
    expect(getByTestId("quota-namespace-group-frontend")).toHaveTextContent("Namespace: frontend");

    // 2 namespace sections, each with their own ResourceQuotaHeadroom component
    const headroomSections = getAllByTestId("resource-quota-headroom");

    expect(headroomSections).toHaveLength(2);
  });
});
