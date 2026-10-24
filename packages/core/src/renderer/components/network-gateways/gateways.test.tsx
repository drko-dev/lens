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
import { Gateways } from "./gateways";
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

describe("Gateways View (R8-02 Multi-Tab)", () => {
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

  it("renders all 6 Gateway API tabs", () => {
    const result = render(<Gateways />);

    expect(result.getByTestId("gateways-view")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-gateways")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-gateway-classes")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-http-routes")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-grpc-routes")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-tls-routes")).toBeInTheDocument();
    expect(result.container.querySelector("#tab-reference-grants")).toBeInTheDocument();
  });

  it("allows switching through tabs to display respective resource headers", () => {
    const result = render(<Gateways />);

    // Default tab is Gateways
    expect(result.getByText("Listeners")).toBeInTheDocument();
    expect(result.getByText("Addresses")).toBeInTheDocument();

    // Switch to Gateway Classes
    const gcTab = result.container.querySelector("#tab-gateway-classes");

    expect(gcTab).toBeInTheDocument();
    fireEvent.click(gcTab as Element);
    expect(result.getByText("Controller")).toBeInTheDocument();
    expect(result.getByText("Description")).toBeInTheDocument();

    // Switch to HTTP Routes
    const httpTab = result.container.querySelector("#tab-http-routes");

    expect(httpTab).toBeInTheDocument();
    fireEvent.click(httpTab as Element);
    expect(result.getByText("Rules / Paths")).toBeInTheDocument();

    // Switch to gRPC Routes
    const grpcTab = result.container.querySelector("#tab-grpc-routes");

    expect(grpcTab).toBeInTheDocument();
    fireEvent.click(grpcTab as Element);
    expect(result.getByText("Services / Methods")).toBeInTheDocument();

    // Switch to TLS Routes
    const tlsTab = result.container.querySelector("#tab-tls-routes");

    expect(tlsTab).toBeInTheDocument();
    fireEvent.click(tlsTab as Element);
    expect(result.getByText("Backends")).toBeInTheDocument();

    // Switch to Reference Grants
    const rgTab = result.container.querySelector("#tab-reference-grants");

    expect(rgTab).toBeInTheDocument();
    fireEvent.click(rgTab as Element);
    expect(result.getByText("From (Allowed References)")).toBeInTheDocument();
    expect(result.getByText("To (Target Resources)")).toBeInTheDocument();
  });
});
