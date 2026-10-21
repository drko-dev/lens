/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import directoryForUserDataInjectable from "../../../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import podApiInjectable from "../../../../../common/k8s-api/endpoints/pod.api.injectable";
import type { PodApi } from "../../../../../common/k8s-api/endpoints/pod.api";
import hostedClusterIdInjectable from "../../../../cluster-frame-context/hosted-cluster-id.injectable";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import dockStoreInjectable from "../../dock/store.injectable";
import callForLogsInjectable from "../call-for-logs.injectable";
import clearLogTabDataInjectable from "../clear-log-tab-data.injectable";
import logStoreInjectable from "../store.injectable";
import logTabStoreInjectable from "../tab-store.injectable";

describe("R4-04: log tab cleanup outside cluster frame", () => {
  describe("in root frame (no hosted cluster)", () => {
    let di: ReturnType<typeof getDiForUnitTesting>;

    beforeEach(() => {
      di = getDiForUnitTesting();
      di.override(directoryForUserDataInjectable, () => "some-directory-for-user-data");
    });

    it("instantiates DockStore without resolving podApi", () => {
      expect(() => di.inject(dockStoreInjectable)).not.toThrow();
    });

    it("clears both log store and log tab data", () => {
      const logStore = di.inject(logStoreInjectable);
      const logTabStore = di.inject(logTabStoreInjectable);
      const clearLogs = jest.spyOn(logStore, "clearLogs");
      const clearData = jest.spyOn(logTabStore, "clearData");

      di.inject(clearLogTabDataInjectable)("some-tab-id");

      expect(clearLogs).toHaveBeenCalledWith("some-tab-id");
      expect(clearData).toHaveBeenCalledWith("some-tab-id");
    });

    it("does not fetch logs through a cluster context that is not mounted", () => {
      const callForLogs = di.inject(callForLogsInjectable);

      expect(() => callForLogs({ name: "some-pod", namespace: "default" })).toThrow(
        "podApi is only available in certain environments",
      );
    });
  });

  describe("in cluster frame", () => {
    it("resolves podApi on first fetch and delegates to getLogs", async () => {
      const di = getDiForUnitTesting();
      const getLogs = jest.fn().mockResolvedValue("some-logs");
      const createPodApi = jest.fn(() => ({ getLogs }) as unknown as PodApi);

      di.override(hostedClusterIdInjectable, () => "some-cluster-id");
      di.override(podApiInjectable, createPodApi);

      const callForLogs = di.inject(callForLogsInjectable);

      expect(createPodApi).not.toHaveBeenCalled();

      await expect(callForLogs({ name: "some-pod", namespace: "default" }, { tailLines: 10 })).resolves.toBe("some-logs");
      expect(createPodApi).toHaveBeenCalledTimes(1);
      expect(getLogs).toHaveBeenCalledWith({ name: "some-pod", namespace: "default" }, { tailLines: 10 });
    });
  });
});
