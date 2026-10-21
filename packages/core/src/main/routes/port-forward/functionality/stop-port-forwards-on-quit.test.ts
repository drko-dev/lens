/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import stopPortForwardsOnQuitInjectable from "./stop-port-forwards-on-quit.injectable";
import { PortForward } from "./port-forward";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("stopPortForwardsOnQuitInjectable", () => {
  beforeEach(() => {
    PortForward.portForwards = [];
  });

  afterEach(() => {
    PortForward.portForwards = [];
  });

  it("stops all active port forwards when the backend quits", async () => {
    const di = getDiForUnitTesting();
    const stopMock1 = jest.fn().mockResolvedValue(undefined);
    const stopMock2 = jest.fn().mockResolvedValue(undefined);

    const mockPf1 = { stop: stopMock1, clusterId: "cluster-1" } as unknown as PortForward;
    const mockPf2 = { stop: stopMock2, clusterId: "cluster-2" } as unknown as PortForward;

    PortForward.portForwards.push(mockPf1, mockPf2);

    const runnable = di.inject(stopPortForwardsOnQuitInjectable);

    await runnable.run();

    expect(stopMock1).toHaveBeenCalledTimes(1);
    expect(stopMock2).toHaveBeenCalledTimes(1);
  });

  it("resolves only after every stop() promise has resolved", async () => {
    const di = getDiForUnitTesting();
    const resolvers: (() => void)[] = [];
    const makeStop = () => jest.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)));

    PortForward.portForwards.push(
      { stop: makeStop() } as unknown as PortForward,
      { stop: makeStop() } as unknown as PortForward,
    );

    const onDone = jest.fn();

    di.inject(stopPortForwardsOnQuitInjectable).run().then(onDone);

    resolvers[0]();
    await tick();
    expect(onDone).not.toHaveBeenCalled();

    resolvers[1]();
    await tick();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("still stops the other port-forwards when one stop() rejects", async () => {
    const di = getDiForUnitTesting();
    const failingStop = jest.fn().mockRejectedValue(new Error("boom"));
    const okStop = jest.fn().mockResolvedValue(undefined);

    PortForward.portForwards.push(
      { stop: failingStop } as unknown as PortForward,
      { stop: okStop } as unknown as PortForward,
    );

    await expect(di.inject(stopPortForwardsOnQuitInjectable).run()).resolves.toBeUndefined();

    expect(okStop).toHaveBeenCalledTimes(1);
  });

  it("does not skip port-forwards when stop() removes itself from the registry", async () => {
    const di = getDiForUnitTesting();
    const second = { stop: jest.fn().mockResolvedValue(undefined) } as unknown as PortForward;
    const first = {
      stop: jest.fn(async () => {
        PortForward.portForwards.splice(PortForward.portForwards.indexOf(first), 1);
      }),
    } as unknown as PortForward;

    PortForward.portForwards.push(first, second);

    await di.inject(stopPortForwardsOnQuitInjectable).run();

    expect(second.stop).toHaveBeenCalledTimes(1);
  });
});
