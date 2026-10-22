/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import { CLUSTER_ENVIRONMENTS } from "../../../../common/cluster/environment-types";
import { EnvironmentBadge } from "../environment-badge";

describe("<EnvironmentBadge />", () => {
  const render = renderFor(getDiForUnitTesting());

  it("renders PROD text with accessible label", () => {
    const { getByTestId } = render(<EnvironmentBadge environment={CLUSTER_ENVIRONMENTS.production} data-testid="b" />);
    const el = getByTestId("b");

    expect(el).toHaveTextContent("PROD");
    expect(el).toHaveAttribute("aria-label", "Environment: Production");
    expect(el).toHaveAttribute("data-env", "production");
  });

  it("renders null for none unless showNone", () => {
    const a = render(<EnvironmentBadge environment={CLUSTER_ENVIRONMENTS.none} data-testid="b" />);

    expect(a.queryByTestId("b")).toBeNull();
    a.unmount();
    expect(render(<EnvironmentBadge
      environment={CLUSTER_ENVIRONMENTS.none}
      showNone
      data-testid="b" />).queryByTestId("b")).not.toBeNull();
  });

  it("applies size class and default title", () => {
    const { getByTestId } = render(<EnvironmentBadge
      environment={CLUSTER_ENVIRONMENTS.staging}
      size="md"
      data-testid="b" />);

    expect(getByTestId("b")).toHaveClass("env-staging", "size-md");
    expect(getByTestId("b")).toHaveAttribute("title", "Staging");
  });
});
