/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainer } from "@ogre-tools/injectable";
import type WebSocket from "ws";
import directoryForTempInjectable from "../../../common/app-paths/directory-for-temp/directory-for-temp.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import { Cluster } from "../../../common/cluster/cluster";
import pathExistsSyncInjectable from "../../../common/fs/path-exists-sync.injectable";
import pathExistsInjectable from "../../../common/fs/path-exists.injectable";
import readJsonSyncInjectable from "../../../common/fs/read-json-sync.injectable";
import statInjectable from "../../../common/fs/stat.injectable";
import writeJsonSyncInjectable from "../../../common/fs/write-json-sync.injectable";
import { buildVersionStateInjectable } from "../../../features/vars/build-version/main/init.injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import type { KubeconfigManager } from "../../kubeconfig-manager/kubeconfig-manager";
import kubeconfigManagerInjectable from "../../kubeconfig-manager/kubeconfig-manager.injectable";
import createKubectlInjectable from "../../kubectl/create-kubectl.injectable";
import type { Kubectl } from "../../kubectl/kubectl";
import lensProxyPortInjectable from "../../lens-proxy/lens-proxy-port.injectable";
import type { SpawnPty } from "../spawn-pty.injectable";
import spawnPtyInjectable from "../spawn-pty.injectable";
import type { OpenPodShellSession } from "./open.injectable";
import openPodShellSessionInjectable from "./open.injectable";
import openShellSessionInjectable from "../create-shell-session.injectable";

describe("PodShellSession unit tests", () => {
  let di: DiContainer;
  let spawnPtyMock: jest.MockedFunction<SpawnPty>;
  let openPodShellSession: OpenPodShellSession;
  let mockCluster: Cluster;
  let mockWebSocket: WebSocket;

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

    spawnPtyMock = jest.fn().mockReturnValue({
      pid: 12345,
      onData: jest.fn(),
      onExit: jest.fn(),
      resize: jest.fn(),
      write: jest.fn(),
      kill: jest.fn(),
    });
    di.override(spawnPtyInjectable, () => spawnPtyMock);

    di.override(createKubectlInjectable, () => () => ({
      binDir: async () => "/mock-kubectl-bin-dir",
      getPath: async () => "/mock-kubectl-bin-dir/kubectl",
      getBundledPath: () => "/mock-bundled-kubectl",
    }) as Partial<Kubectl> as Kubectl);

    di.override(kubeconfigManagerInjectable, () => ({
      ensurePath: async () => "/path/to/proxy/kubeconfig",
    }) as Partial<KubeconfigManager> as KubeconfigManager);

    openPodShellSession = di.inject(openPodShellSessionInjectable);

    mockCluster = new Cluster({
      id: "cluster-abc",
      contextName: "lab-context",
      kubeConfigPath: "/path/to/original/kubeconfig",
    });

    mockWebSocket = {
      send: jest.fn(),
      on: jest.fn().mockReturnThis(),
      once: jest.fn().mockReturnThis(),
      close: jest.fn(),
      readyState: 1,
    } as unknown as WebSocket;
  });

  it("spawns kubectl exec directly targeted at the pod, namespace, and container", async () => {
    await openPodShellSession({
      websocket: mockWebSocket,
      cluster: mockCluster,
      tabId: "tab-exec-1",
      podName: "nginx-pod",
      namespace: "prod-ns",
      containerName: "nginx-app",
    });

    expect(spawnPtyMock).toHaveBeenCalledTimes(1);
    const [shellPath, args, options] = spawnPtyMock.mock.calls[0];

    expect(shellPath).toBe("/mock-kubectl-bin-dir/kubectl");
    expect(args).toEqual([
      "exec",
      "-i",
      "-t",
      "-n",
      "prod-ns",
      "nginx-pod",
      "-c",
      "nginx-app",
      "--",
      "sh",
      "-c",
      "((clear && bash) || (clear && ash) || (clear && sh))",
    ]);

    // Ensure session operates exclusively on cluster proxy kubeconfig, never host
    expect(options.env?.KUBECONFIG).toBe("/path/to/proxy/kubeconfig");
  });

  it("routes pod session requests through openShellSession when pod arguments are present", async () => {
    const openShellSession = di.inject(openShellSessionInjectable);

    await openShellSession({
      websocket: mockWebSocket,
      cluster: mockCluster,
      tabId: "tab-exec-2",
      podName: "redis-cluster",
      namespace: "database",
      containerName: "redis",
    });

    expect(spawnPtyMock).toHaveBeenCalledWith(
      "/mock-kubectl-bin-dir/kubectl",
      expect.arrayContaining(["redis-cluster", "-c", "redis", "-n", "database"]),
      expect.anything(),
    );
  });
});
