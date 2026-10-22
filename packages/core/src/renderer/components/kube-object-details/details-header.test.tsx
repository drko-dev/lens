/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import type { KubeObject } from "@openlens/kube-object";
import { Drawer } from "../drawer";
import { DetailsHeader } from "./details-header";

const make = (o: any) => ({ kind: o.kind, getName: () => o.name, getNs: () => o.ns, status: o.status, spec: o.spec }) as unknown as KubeObject;

const render = renderFor(getDiForUnitTesting());

describe("<DetailsHeader />", () => {
  it("renders kind, name, namespace and status for a Pod", () => {
    const { getByTestId } = render(<DetailsHeader object={make({ kind: "Pod", name: "web-1", ns: "prod", status: { phase: "Running" }})} />);

    expect(getByTestId("details-header-kind").textContent).toBe("Pod");
    expect(getByTestId("details-header-name").textContent).toBe("web-1");
    expect(getByTestId("details-header-namespace").textContent).toBe("prod");
    expect(getByTestId("details-header-status").textContent).toBe("Running");
  });

  it("omits namespace and status for cluster-scoped object without status", () => {
    const { queryByTestId, getByTestId } = render(<DetailsHeader object={make({ kind: "ClusterRole", name: "admin" })} />);

    expect(getByTestId("details-header-name").textContent).toBe("admin");
    expect(queryByTestId("details-header-namespace")).toBeNull();
    expect(queryByTestId("details-header-status")).toBeNull();
  });
});

describe("<Drawer /> with header title", () => {
  it("still renders the copy button", () => {
    const { container } = render(
      <Drawer
        open
        title={<DetailsHeader object={make({ kind: "Pod", name: "web-1" })} />}
        copyText="web-1"
        usePortal={false}>
        x
      </Drawer>,
    );

    expect(container.querySelector(".drawer-title-text .Icon")).not.toBeNull();
  });
});
