/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import { ResourceDetailsPanelContent } from "../resource-details-panel-content";
import { SplitPanelStore } from "../split-panel-store";
import splitPanelStoreInjectable from "../split-panel-store.injectable";
import deploymentStoreInjectable from "../../workloads-deployments/store.injectable";
import currentKubeObjectInDetailsInjectable from "../../kube-object-details/current-kube-object-in-details.injectable";
import kubeObjectDetailItemsInjectable from "../../kube-object-details/kube-object-detail-items/kube-object-detail-items.injectable";
import storesAndApisCanBeCreatedInjectable from "../../../stores-apis-can-be-created.injectable";
import { computed } from "mobx";
import type { DiContainer } from "@ogre-tools/injectable";

jest.mock("../../kube-object-menu", () => ({
  KubeObjectMenu: () => <div data-testid="mock-kube-object-menu" />,
}));

describe("ResourceDetailsPanelContent", () => {
  let di: DiContainer;
  let store: SplitPanelStore;
  let render: ReturnType<typeof renderFor>;

  beforeEach(() => {
    di = getDiForUnitTesting();
    store = new SplitPanelStore();
    di.override(splitPanelStoreInjectable, () => store);
    di.override(storesAndApisCanBeCreatedInjectable, () => true);

    // Mock empty URL details object by default
    di.override(currentKubeObjectInDetailsInjectable, () => ({
      value: computed(() => undefined),
      pending: computed(() => false),
    } as any));

    di.override(kubeObjectDetailItemsInjectable, () => computed(() => [
      ({ object }: any) => <div data-testid="mock-detail-component">Detail: {object.getName()}</div>,
    ]) as any);

    render = renderFor(di);
  });

  it("renders empty state placeholder when no resource is selected", () => {
    render(<ResourceDetailsPanelContent />);

    expect(screen.getByTestId("resource-details-empty")).toBeInTheDocument();
    expect(screen.getByText("No Resource Selected")).toBeInTheDocument();
  });

  it("renders loading state when resource resolution is pending", () => {
    di.override(currentKubeObjectInDetailsInjectable, () => ({
      value: computed(() => undefined),
      pending: computed(() => true),
    } as any));

    render = renderFor(di);
    render(<ResourceDetailsPanelContent />);

    expect(screen.getByTestId("resource-details-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading resource details...")).toBeInTheDocument();
  });

  it("renders deployment details and detail components when a deployment is bound", () => {
    const mockDeployment: any = {
      kind: "Deployment",
      getName: () => "order-service",
      getNs: () => "default",
      getAge: () => "2d",
      metadata: { uid: "uid-order-service" },
    };

    di.override(deploymentStoreInjectable, () => ({
      getByName: jest.fn((name) => (name === "order-service" ? mockDeployment : undefined)),
    } as any));

    store.setResourceBinding({
      kind: "Deployment",
      name: "order-service",
      namespace: "default",
    });

    render = renderFor(di);
    render(<ResourceDetailsPanelContent />);

    expect(screen.getByTestId("resource-details-content")).toBeInTheDocument();
    expect(screen.getByTestId("mock-detail-component")).toHaveTextContent("Detail: order-service");
  });
});
