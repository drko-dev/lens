/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import "@testing-library/jest-dom/extend-expect";
import type { RenderResult } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { SidebarCluster } from "../sidebar-cluster";
import { KubernetesCluster } from "../../../../common/catalog-entities";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";

describe("<SidebarCluster/>", () => {
  let result: RenderResult;

  beforeEach(() => {
    const di = getDiForUnitTesting();
    const render = renderFor(di);

    const clusterEntity = new KubernetesCluster({
      metadata: {
        uid: "test-uid",
        name: "test-cluster",
        source: "local",
        labels: {},
      },
      spec: {
        kubeconfigPath: "",
        kubeconfigContext: "",
      },
      status: {
        phase: "connected",
      },
    });

    result = render(<SidebarCluster clusterEntity={clusterEntity}/>);
  });

  it("renders w/o errors", () => {
    expect(result.container).toMatchSnapshot();
  });

  it("renders cluster avatar and name", () => {
    expect(result.getByText("tc")).toBeInTheDocument();

    const v = result.getAllByText("test-cluster");

    expect(v.length).toBeGreaterThan(0);

    for (const e of v) {
      expect(e).toBeInTheDocument();
    }
  });

  it("renders cluster menu", () => {
    fireEvent.click(result.getByTestId("sidebar-cluster-dropdown"));
    expect(result.getByText("Add to Hotbar")).toBeInTheDocument();
  });

  it("renders production hazard badge when cluster is marked as production", () => {
    const di = getDiForUnitTesting();
    const render = renderFor(di);

    const prodClusterEntity = new KubernetesCluster({
      metadata: {
        uid: "prod-cluster-uid",
        name: "production-eu-central",
        source: "local",
        labels: {
          "devops.openlens.dev/production": "true",
        },
      },
      spec: {
        kubeconfigPath: "",
        kubeconfigContext: "",
        environment: "production",
      },
      status: {
        phase: "connected",
      },
    });

    const prodResult = render(<SidebarCluster clusterEntity={prodClusterEntity} />);

    expect(prodResult.getByText("PROD")).toBeInTheDocument();
  });

  it("renders custom alias instead of raw cluster context when configured", () => {
    const di = getDiForUnitTesting();
    const render = renderFor(di);

    const clusterEntity = new KubernetesCluster({
      metadata: {
        uid: "aliased-uid",
        name: "My Custom Production",
        source: "local",
        labels: {},
      },
      spec: {
        kubeconfigPath: "",
        kubeconfigContext: "arn:aws:eks:eu-central-1:123456789:cluster/prod-k8s",
      },
      status: {
        phase: "connected",
      },
    });

    const aliasedResult = render(<SidebarCluster clusterEntity={clusterEntity} />);

    expect(aliasedResult.getAllByText("My Custom Production").length).toBeGreaterThan(0);
  });
});

