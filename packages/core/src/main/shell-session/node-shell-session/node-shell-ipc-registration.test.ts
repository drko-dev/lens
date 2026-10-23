/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainer } from "@ogre-tools/injectable";
import directoryForTempInjectable from "../../../common/app-paths/directory-for-temp/directory-for-temp.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import { buildVersionStateInjectable } from "../../../features/vars/build-version/main/init.injectable";
import createKubeApiInjectable from "../../../common/k8s-api/create-kube-api.injectable";
import createKubeJsonApiForClusterInjectable from "../../../common/k8s-api/create-kube-json-api-for-cluster.injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import openNodeShellSessionInjectable from "./open.injectable";
import { NODE_SHELL_AUTHORIZATION_CHANNEL } from "../../../common/node-shell-channels";

const mockHandlers = new Map<string, unknown>();

jest.mock("../../../common/ipc", () => ({
  ...jest.requireActual("../../../common/ipc"),
  ipcMainHandle: (channel: string, handler: unknown) => mockHandlers.set(channel, handler),
}));

describe("Node Shell authorization IPC registration", () => {
  let di: DiContainer;

  beforeEach(() => {
    mockHandlers.clear();
    di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-directory-for-user-data");
    di.override(directoryForTempInjectable, () => "/some-directory-for-tmp");
    di.override(buildVersionStateInjectable, () => "1.1.1");
    di.override(createKubeJsonApiForClusterInjectable, () => () => ({}) as never);
    di.override(createKubeApiInjectable, () => () => ({ get: jest.fn() }) as never);
  });

  it("registers the authorization handler as soon as the Node Shell session factory is instantiated", () => {
    // The session factory is instantiated during app startup (LensProxy -> shell request handler).
    // If the registry were injected lazily inside the async open call, the renderer would ask for a
    // PROD authorization before any handler existed and Node Shell would be permanently unusable.
    di.inject(openNodeShellSessionInjectable);

    expect(mockHandlers.has(NODE_SHELL_AUTHORIZATION_CHANNEL)).toBe(true);
  });
});
