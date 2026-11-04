/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainer } from "@ogre-tools/injectable";
import { observable, runInAction } from "mobx";
import type WebSocket from "ws";
import directoryForTempInjectable from "../../common/app-paths/directory-for-temp/directory-for-temp.injectable";
import directoryForUserDataInjectable from "../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import type { Cluster } from "../../common/cluster/cluster";
import pathExistsSyncInjectable from "../../common/fs/path-exists-sync.injectable";
import pathExistsInjectable from "../../common/fs/path-exists.injectable";
import readJsonSyncInjectable from "../../common/fs/read-json-sync.injectable";
import statInjectable from "../../common/fs/stat.injectable";
import writeJsonSyncInjectable from "../../common/fs/write-json-sync.injectable";
import getClusterByIdInjectable from "../../features/cluster/storage/common/get-by-id.injectable";
import { buildVersionStateInjectable } from "../../features/vars/build-version/main/init.injectable";
import { getDiForUnitTesting } from "../getDiForUnitTesting";
import type { KubeconfigManager } from "../kubeconfig-manager/kubeconfig-manager";
import kubeconfigManagerInjectable from "../kubeconfig-manager/kubeconfig-manager.injectable";
import createKubectlInjectable from "../kubectl/create-kubectl.injectable";
import type { Kubectl } from "../kubectl/kubectl";
import lensProxyPortInjectable from "../lens-proxy/lens-proxy-port.injectable";
import confirmProductionTerminalInjectable from "./confirm-production-terminal.injectable";
import openShellSessionInjectable from "./create-shell-session.injectable";
import shellSessionProcessesInjectable from "./processes.injectable";
import { WebSocketCloseEvent } from "./shell-session";
import spawnPtyInjectable from "./spawn-pty.injectable";
import terminalProdAuthorizationInjectable from "./terminal-prod-authorization.injectable";

const makeCluster = (id: string, production: boolean): Cluster => ({
  id,
  name: { get: () => id },
  version: { get: () => "1.30.0" },
  disconnected: observable.box(false),
  preferences: production ? { clusterEnvironment: "production" } : {},
  getMeta: () => ({}),
}) as unknown as Cluster;

const makeSocket = () => ({
  send: jest.fn(),
  on: jest.fn().mockReturnThis(),
  once: jest.fn().mockReturnThis(),
  close: jest.fn(),
  readyState: 1,
  OPEN: 1,
}) as unknown as WebSocket & { close: jest.Mock };

const frameEvent = (clusterId: string) => ({
  senderFrame: { url: `https://${clusterId}.lens.app:1111/`, parent: {}},
}) as any;

describe("H7.6.3E: Main-side PROD authorization for local and pod terminals", () => {
  let di: DiContainer;
  let spawnPty: jest.Mock;
  let clusters: Map<string, Cluster>;
  let confirm: jest.Mock;
  let prod: Cluster;
  let other: Cluster;
  let lab: Cluster;

  const openLocal = (cluster: Cluster, tabId: string) => {
    const websocket = makeSocket();

    return di.inject(openShellSessionInjectable)({ websocket, cluster, tabId }).then(() => websocket);
  };
  const openPod = (cluster: Cluster, tabId: string) => {
    const websocket = makeSocket();

    return di.inject(openShellSessionInjectable)({
      websocket, cluster, tabId, podName: "p", namespace: "ns", containerName: "c",
    }).then(() => websocket);
  };
  const requestGrant = (clusterId: string, tabId: string, event = frameEvent(clusterId)) => (
    di.inject(terminalProdAuthorizationInjectable).handler(event, { clusterId, tabId })
  );

  beforeEach(() => {
    di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-directory-for-user-data");
    di.override(directoryForTempInjectable, () => "/some-directory-for-tmp");
    di.override(buildVersionStateInjectable, () => "1.1.1");
    di.override(pathExistsInjectable, () => async () => false);
    di.override(pathExistsSyncInjectable, () => () => false);
    di.override(readJsonSyncInjectable, () => () => ({}));
    di.override(writeJsonSyncInjectable, () => () => {});
    di.override(statInjectable, () => () => ({ isDirectory: () => true }) as any);
    di.inject(lensProxyPortInjectable).set(1111);

    spawnPty = jest.fn(() => ({ pid: 1, onData: jest.fn(), onExit: jest.fn(), resize: jest.fn(), write: jest.fn(), kill: jest.fn() }));
    di.override(spawnPtyInjectable, () => spawnPty as any);
    di.override(createKubectlInjectable, () => () => ({
      binDir: async () => "/bin",
      getPath: async () => "/bin/kubectl",
      getBundledPath: () => "/bin/kubectl",
    }) as Partial<Kubectl> as Kubectl);
    di.override(kubeconfigManagerInjectable, () => ({ ensurePath: async () => "/kubeconfig" }) as Partial<KubeconfigManager> as KubeconfigManager);

    prod = makeCluster("prod-1", true);
    other = makeCluster("prod-2", true);
    lab = makeCluster("lab-1", false);
    clusters = new Map([prod, other, lab].map(c => [c.id, c]));
    di.override(getClusterByIdInjectable, () => (id: string) => clusters.get(id));

    confirm = jest.fn(async () => true);
    di.override(confirmProductionTerminalInjectable, () => confirm);
  });

  describe.each([
    ["local", openLocal],
    ["pod", openPod],
  ])("%s shell", (_name, open) => {
    it("forged request without a grant never spawns a PTY on a PROD cluster", async () => {
      const websocket = await open(prod, "tab-1");

      expect(spawnPty).not.toHaveBeenCalled();
      expect(websocket.close).toHaveBeenCalledWith(WebSocketCloseEvent.PolicyViolation);
    });

    it("spawns once after a confirmed grant and the grant is single use", async () => {
      await expect(requestGrant(prod.id, "tab-1")).resolves.toEqual({ granted: true });
      await open(prod, "tab-1");

      expect(spawnPty).toHaveBeenCalledTimes(1);

      // PTY closed (killed + removed): a new spawn for the same tab needs a new grant
      di.inject(shellSessionProcessesInjectable).delete("prod-1:tab-1");
      const websocket = await open(prod, "tab-1");

      expect(spawnPty).toHaveBeenCalledTimes(1);
      expect(websocket.close).toHaveBeenCalledWith(WebSocketCloseEvent.PolicyViolation);
    });

    it("rejects a grant issued for another tab", async () => {
      await requestGrant(prod.id, "tab-1");
      await open(prod, "tab-2");

      expect(spawnPty).not.toHaveBeenCalled();
    });

    it("rejects a grant issued for another cluster", async () => {
      await requestGrant(other.id, "tab-1");
      await open(prod, "tab-1");

      expect(spawnPty).not.toHaveBeenCalled();
    });

    it("rejects a grant invalidated by a cluster Disconnect", async () => {
      await requestGrant(prod.id, "tab-1");
      runInAction(() => prod.disconnected.set(true));
      await open(prod, "tab-1");

      expect(spawnPty).not.toHaveBeenCalled();
    });

    it("does not touch non-PROD clusters", async () => {
      await open(lab, "tab-1");

      expect(spawnPty).toHaveBeenCalledTimes(1);
    });
  });

  it("re-attaching to an existing authorized PTY does not need a new grant", async () => {
    await requestGrant(prod.id, "tab-1");
    await openLocal(prod, "tab-1");
    await openLocal(prod, "tab-1");

    expect(spawnPty).toHaveBeenCalledTimes(1);
  });

  it("issues no grant when the native confirmation is denied", async () => {
    confirm.mockResolvedValue(false);

    await expect(requestGrant(prod.id, "tab-1")).resolves.toEqual({ granted: false, reason: "confirmation-denied" });
    await openLocal(prod, "tab-1");

    expect(spawnPty).not.toHaveBeenCalled();
  });

  it("issues no grant to a sender that is not the cluster frame", async () => {
    await expect(requestGrant(prod.id, "tab-1", frameEvent("prod-2"))).resolves.toEqual({ granted: false, reason: "unauthorized-sender" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("rejects malformed requests and renderer-supplied extra arguments", async () => {
    const { handler } = di.inject(terminalProdAuthorizationInjectable);

    await expect(handler(frameEvent(prod.id), { clusterId: prod.id } as any)).resolves.toMatchObject({ granted: false });
    await expect(handler(frameEvent(prod.id), { clusterId: prod.id, tabId: "t" }, "grant-id")).resolves.toMatchObject({ granted: false });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("grants non-PROD clusters without a dialog", async () => {
    await expect(requestGrant(lab.id, "tab-1")).resolves.toEqual({ granted: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  describe("H7.6.4: closing a tab revokes its unused grant", () => {
    const release = (clusterId: string, tabId: string, event = frameEvent(clusterId)) => (
      di.inject(terminalProdAuthorizationInjectable).releaseHandler(event, { clusterId, tabId })
    );

    it("a pending grant dies with its tab: a later spawn for the same tab is refused", async () => {
      await requestGrant(prod.id, "tab-1");
      await expect(release(prod.id, "tab-1")).resolves.toEqual({ released: true });
      await openLocal(prod, "tab-1");

      expect(spawnPty).not.toHaveBeenCalled();
    });

    it("a tab opened after the close/open race does not inherit the old grant", async () => {
      await requestGrant(prod.id, "tab-1");
      await release(prod.id, "tab-1");
      confirm.mockResolvedValueOnce(false);
      await expect(requestGrant(prod.id, "tab-1")).resolves.toMatchObject({ granted: false });
      await openLocal(prod, "tab-1");

      expect(spawnPty).not.toHaveBeenCalled();
    });

    it("releasing one tab keeps the grant of another tab and another cluster", async () => {
      await requestGrant(prod.id, "tab-1");
      await requestGrant(prod.id, "tab-2");
      await requestGrant(other.id, "tab-1");
      await release(prod.id, "tab-1");
      await openLocal(prod, "tab-2");
      await openLocal(other, "tab-1");

      expect(spawnPty).toHaveBeenCalledTimes(2);
    });

    it("a consumed grant cannot be released twice and does not kill the running PTY", async () => {
      await requestGrant(prod.id, "tab-1");
      await openLocal(prod, "tab-1");
      await expect(release(prod.id, "tab-1")).resolves.toEqual({ released: false });

      expect(spawnPty).toHaveBeenCalledTimes(1);
      expect(di.inject(shellSessionProcessesInjectable).has("prod-1:tab-1")).toBe(true);
    });

    it("ignores a release coming from a frame of another cluster", async () => {
      await requestGrant(prod.id, "tab-1");
      await expect(release(prod.id, "tab-1", frameEvent(other.id))).resolves.toEqual({ released: false });
      await openLocal(prod, "tab-1");

      expect(spawnPty).toHaveBeenCalledTimes(1);
    });

    it("rejects malformed release requests", async () => {
      const handler = di.inject(terminalProdAuthorizationInjectable).releaseHandler;

      await expect(handler(frameEvent(prod.id), { clusterId: prod.id } as any)).resolves.toEqual({ released: false });
      await expect(handler(frameEvent(prod.id), undefined)).resolves.toEqual({ released: false });
    });
  });
});
