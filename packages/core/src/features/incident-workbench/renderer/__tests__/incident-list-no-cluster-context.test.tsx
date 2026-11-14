/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { NonInjectedIncidentListView } from "../incident-list-view";
import { IncidentStore } from "../incident-store";
import { incidentIpcChannels } from "../../../../common/incident/incident-ipc";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";

/**
 * Loading the synthetic OOM case without an authorized cluster context must fail closed
 * inside the view (visible alert) instead of escaping as an unhandled rejection.
 */
describe("incident list without cluster context", () => {
  it("shows the fail-closed reason as an alert and does not leak the rejection", async () => {
    const mockIpc = {
      invoke: jest.fn(async (channel: string) => (channel === incidentIpcChannels.list ? [] : null)),
    };
    const store = new IncidentStore(mockIpc as any);

    store.incidents = [];

    const unhandled = jest.fn();

    process.on("unhandledRejection", unhandled);

    try {
      renderFor(getDiForUnitTesting())(<NonInjectedIncidentListView store={store} />);
      fireEvent.click(screen.getByTestId("create-synthetic-btn"));

      const alert = await screen.findByTestId("incident-list-error");

      expect(alert).toHaveTextContent(/No authorized cluster context/);
      expect(alert).toHaveAttribute("role", "alert");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(mockIpc.invoke).not.toHaveBeenCalledWith(incidentIpcChannels.create, expect.anything());
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  }, 30_000);
});
