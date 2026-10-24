/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { fireEvent } from "@testing-library/react";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import { DynamicResourceAllocation } from "./dra";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import directoryForKubeConfigsInjectable from "../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import isTableColumnHiddenInjectable from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { Cluster } from "../../../common/cluster/cluster";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import kubeSelectedUrlParamInjectable from "../kube-detail-params/kube-selected-url.injectable";
import toggleKubeDetailsPaneInjectable from "../kube-detail-params/toggle-details.injectable";
import appPathsStateInjectable from "../../../common/app-paths/app-paths-state.injectable";
import currentlyInClusterFrameInjectable from "../../routes/currently-in-cluster-frame.injectable";

describe("DynamicResourceAllocation View (R8-04 DRA Multi-Tab)", () => {
  let di: DiContainer;
  let render: ReturnType<typeof renderFor>;

  beforeEach(() => {
    di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(isTableColumnHiddenInjectable, () => () => false);

    di.override(hostedClusterInjectable, () => new Cluster({
      contextName: "some-context-name",
      id: "some-cluster-id",
      kubeConfigPath: "/some-path-to-a-kubeconfig",
    }));

    di.override(subscribeStoresInjectable, () => jest.fn().mockImplementation(() => jest.fn()));
    di.override(kubeSelectedUrlParamInjectable, () => ({
      get: () => "path",
    }));
    di.override(toggleKubeDetailsPaneInjectable, () => null);
    di.override(appPathsStateInjectable, () => ({
      get: () => ({}),
    }));
    di.override(currentlyInClusterFrameInjectable, () => true);

    render = renderFor(di);
  });

  it("renders all 4 DRA tabs and in-tree notice", () => {
    const result = render(<DynamicResourceAllocation />);

    expect(result.getByTestId("dra-view")).toBeInTheDocument();
    expect(result.getByTestId("dra-readonly-notice")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-device-classes")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-resource-claims")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-claim-templates")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-resource-slices")).toBeInTheDocument();
  });

  it("allows switching through all 4 tabs and renders expected table headers", () => {
    const result = render(<DynamicResourceAllocation />);

    // Default tab: Device Classes
    expect(result.getByText("Selectors (CEL)")).toBeInTheDocument();

    // Switch to Resource Claims
    const claimsTab = result.container.querySelector("#tab-resource-claims");

    expect(claimsTab).toBeInTheDocument();
    fireEvent.click(claimsTab as Element);
    expect(result.getByText("Requested Class")).toBeInTheDocument();
    expect(result.getByText("Allocation")).toBeInTheDocument();

    // Switch to Claim Templates
    const templatesTab = result.container.querySelector("#tab-claim-templates");

    expect(templatesTab).toBeInTheDocument();
    fireEvent.click(templatesTab as Element);
    expect(result.getByText("Requested Class")).toBeInTheDocument();

    // Switch to Resource Slices
    const slicesTab = result.container.querySelector("#tab-resource-slices");

    expect(slicesTab).toBeInTheDocument();
    fireEvent.click(slicesTab as Element);
    expect(result.getByText("Driver")).toBeInTheDocument();
    expect(result.getByText("Pool")).toBeInTheDocument();
  });
});
