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
import { Applications } from "./applications";
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

describe("Applications View (R8-05 Kube Applications Multi-Tab & Workload Expansion)", () => {
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

  it("renders all 3 applications tabs and default logical applications view", () => {
    const result = render(<Applications />);

    expect(result.getByTestId("applications-view")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-logical-applications")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-trivy-reports")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-container-images")).toBeInTheDocument();
  });

  it("allows switching tabs between Logical Applications, Vulnerability Reports, and Container Images", () => {
    const result = render(<Applications />);

    // Switch to Container Images
    const imagesTab = result.container.querySelector("#tab-container-images") as HTMLElement;

    expect(imagesTab).toBeInTheDocument();
    fireEvent.click(imagesTab);

    expect(result.container.querySelector(".ContainerImages")).toBeInTheDocument();

    // Switch to Trivy Reports
    const trivyTab = result.container.querySelector("#tab-trivy-reports") as HTMLElement;

    expect(trivyTab).toBeInTheDocument();
    fireEvent.click(trivyTab);

    // Switch back to Logical Applications
    const appsTab = result.container.querySelector("#tab-logical-applications") as HTMLElement;

    expect(appsTab).toBeInTheDocument();
    fireEvent.click(appsTab);

    expect(result.container.querySelector(".LogicalApplications")).toBeInTheDocument();
  });
});
