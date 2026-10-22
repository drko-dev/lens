/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import { renderFor } from "../../../test-utils/renderFor";
import { CLUSTER_ENVIRONMENTS } from "../../../../../common/cluster/environment-types";
import { ToolContextHeader } from "../tool-context-header";

describe("<ToolContextHeader />", () => {
  const render = renderFor(getDiForUnitTesting());

  it("renders cluster, namespace, title, actions and forwards testid", () => {
    const { getByTestId, getByText } = render(
      <ToolContextHeader clusterName="c1" namespace="ns1" title="Pod/web" actions={<button>act</button>} data-testid="h" />,
    );

    expect(getByTestId("h")).toBeInTheDocument();
    expect(getByText("c1")).toBeInTheDocument();
    expect(getByText("ns1")).toBeInTheDocument();
    expect(getByText("Pod/web")).toBeInTheDocument();
    expect(getByText("act")).toBeInTheDocument();
  });

  it("omits optional parts when undefined", () => {
    const { container, queryByText } = render(<ToolContextHeader clusterName="c1" />);

    expect(container.querySelector("[data-env]")).toBeNull();
    expect(container.querySelector("[data-session]")).toBeNull();
    expect(queryByText("ns1")).toBeNull();
  });

  it("omits badge for none, renders exactly one for production", () => {
    const a = render(<ToolContextHeader clusterName="c1" environment={CLUSTER_ENVIRONMENTS.none} />);

    expect(a.container.querySelectorAll("[data-env]")).toHaveLength(0);
    a.unmount();

    const b = render(<ToolContextHeader clusterName="c1" environment={CLUSTER_ENVIRONMENTS.production} />);

    expect(b.container.querySelectorAll("[data-env]")).toHaveLength(1);
  });

  it.each(["active", "paused", "disconnected", "connecting"] as const)("shows %s as text", session => {
    const { getByText } = render(<ToolContextHeader clusterName="c1" session={session} />);

    expect(getByText(session)).toBeInTheDocument();
  });
});
