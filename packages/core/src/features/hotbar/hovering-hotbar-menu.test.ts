/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApplicationBuilder } from "../../renderer/components/test-utils/get-application-builder";
import { getApplicationBuilder } from "../../renderer/components/test-utils/get-application-builder";

describe("hovering hotbar menu tests", () => {
  let builder: ApplicationBuilder;
  let result: RenderResult;

  beforeEach(async () => {
    builder = getApplicationBuilder();

    result = await builder.render();
  });

  it("renders", () => {
    expect(result.baseElement).toMatchSnapshot();
  });

  it("shows the expanded favorites rail", () => {
    expect(result.getByTestId("hotbar-rail")).toBeInTheDocument();
    expect(result.queryByTestId("hotbar-expand")).not.toBeInTheDocument();
  });

  describe("when collapsing the favorites bar", () => {
    beforeEach(async () => {
      await userEvent.click(result.getByTestId("hotbar-collapse"));
    });

    it("renders", () => {
      expect(result.baseElement).toMatchSnapshot();
    });

    it("shows the expand control instead of the rail", () => {
      expect(result.getByTestId("hotbar-expand")).toBeInTheDocument();
      expect(result.queryByTestId("hotbar-rail")).not.toBeInTheDocument();
    });
  });
});
