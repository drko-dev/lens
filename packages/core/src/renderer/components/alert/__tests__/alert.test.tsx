/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import { Alert } from "../alert";

describe("<Alert />", () => {
  const render = renderFor(getDiForUnitTesting());

  it("info uses status role and shows title and children", () => {
    const { getByRole } = render(<Alert title="T">body</Alert>);

    expect(getByRole("status")).toHaveTextContent("Tbody");
  });

  it("danger and warning use alert role and type class", () => {
    const { getByTestId } = render(<Alert type="danger" data-testid="a">x</Alert>);

    expect(getByTestId("a")).toHaveAttribute("role", "alert");
    expect(getByTestId("a")).toHaveClass("type-danger");
  });
});
