/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import stopPortForwardsOnQuitInjectable from "./stop-port-forwards-on-quit.injectable";
import { PortForward } from "./port-forward";

describe("stopPortForwardsOnQuitInjectable", () => {
  beforeEach(() => {
    PortForward.portForwards = [];
  });

  afterEach(() => {
    PortForward.portForwards = [];
  });

  it("stops all active port forwards when the backend quits", () => {
    const di = getDiForUnitTesting();
    const stopMock1 = jest.fn();
    const stopMock2 = jest.fn();

    const mockPf1 = { stop: stopMock1, clusterId: "cluster-1" } as unknown as PortForward;
    const mockPf2 = { stop: stopMock2, clusterId: "cluster-2" } as unknown as PortForward;

    PortForward.portForwards.push(mockPf1, mockPf2);

    const runnable = di.inject(stopPortForwardsOnQuitInjectable);

    runnable.run();

    expect(stopMock1).toHaveBeenCalledTimes(1);
    expect(stopMock2).toHaveBeenCalledTimes(1);
  });
});
