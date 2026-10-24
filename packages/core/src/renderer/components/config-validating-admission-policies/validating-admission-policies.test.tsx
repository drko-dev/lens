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
import { ValidatingAdmissionPolicies } from "./validating-admission-policies";
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

describe("ValidatingAdmissionPolicies View (R8-03 CEL Multi-Tab)", () => {
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

  it("renders all 4 CEL Admission Policy tabs and in-tree notice", () => {
    const result = render(<ValidatingAdmissionPolicies />);

    expect(result.getByTestId("validating-admission-policies-view")).toBeInTheDocument();
    expect(result.getByTestId("cel-readonly-notice")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-admission-policies")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-admission-policy-bindings")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-mutating-admission-policies")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-mutating-admission-policy-bindings")).toBeInTheDocument();
  });

  it("allows switching through all 4 tabs and renders expected table headers", () => {
    const result = render(<ValidatingAdmissionPolicies />);

    // Default tab: Validating Policies
    expect(result.getByText("Validations (CEL)")).toBeInTheDocument();
    expect(result.getByText("Failure Policy")).toBeInTheDocument();

    // Switch to Validating Bindings
    const valBindTab = result.container.querySelector("#tab-admission-policy-bindings");

    expect(valBindTab).toBeInTheDocument();
    fireEvent.click(valBindTab as Element);
    expect(result.getByText("Actions")).toBeInTheDocument();
    expect(result.getByText("Param Ref")).toBeInTheDocument();

    // Switch to Mutating Policies
    const mutPolTab = result.container.querySelector("#tab-mutating-admission-policies");

    expect(mutPolTab).toBeInTheDocument();
    fireEvent.click(mutPolTab as Element);
    expect(result.getByText("Mutations (CEL)")).toBeInTheDocument();

    // Switch to Mutating Bindings
    const mutBindTab = result.container.querySelector("#tab-mutating-admission-policy-bindings");

    expect(mutBindTab).toBeInTheDocument();
    fireEvent.click(mutBindTab as Element);
    expect(result.getByText("Policy")).toBeInTheDocument();
  });
});
