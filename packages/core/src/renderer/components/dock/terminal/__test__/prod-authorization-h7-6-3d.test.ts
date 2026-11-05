/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { TerminalProdAuthorization } from "../prod-authorization";
import { TerminalStore } from "../store";

describe("H7.6.3D: terminal PROD authorization", () => {
  it("is bound to the cluster and tab pair", () => {
    const auth = new TerminalProdAuthorization();

    auth.authorize("c1", "t1");
    expect(auth.isAuthorized("c1", "t1")).toBe(true);
    expect(auth.isAuthorized("c1", "t2")).toBe(false);
    expect(auth.isAuthorized("c2", "t1")).toBe(false);
  });

  it("revoke drops the tab; revokeCluster drops the cluster; keepOnlyCluster drops foreign ones", () => {
    const auth = new TerminalProdAuthorization();

    auth.authorize("c1", "t1");
    auth.authorize("c1", "t2");
    auth.authorize("c2", "t3");
    auth.revoke("t1");
    expect(auth.isAuthorized("c1", "t1")).toBe(false);
    expect(auth.isAuthorized("c1", "t2")).toBe(true);
    auth.keepOnlyCluster("c1");
    expect(auth.isAuthorized("c2", "t3")).toBe(false);
    auth.revokeCluster("c1");
    expect(auth.isAuthorized("c1", "t2")).toBe(false);
  });

  describe("TerminalStore.connect gate", () => {
    const makeStore = (allowed: boolean) => {
      const api = { connect: jest.fn(), destroy: jest.fn() };
      const createTerminalApi = jest.fn().mockReturnValue(api);
      const createTerminal = jest.fn().mockReturnValue({ destroy: jest.fn() });
      const store = new TerminalStore({
        createTerminal,
        createTerminalApi,
        isConnectAllowed: () => allowed,
      } as any);

      return { store, createTerminalApi, api };
    };

    it("refuses an unauthorized session without creating a PTY connection", () => {
      const { store, createTerminalApi, api } = makeStore(false);

      store.connect({ id: "t1", title: "T", kind: "terminal" as any, pinned: false });
      expect(createTerminalApi).not.toHaveBeenCalled();
      expect(api.connect).not.toHaveBeenCalled();
      expect(store.isConnected("t1")).toBe(false);
    });

    it("connects an allowed session once (idempotent)", () => {
      const { store, createTerminalApi, api } = makeStore(true);
      const tab = { id: "t1", title: "T", kind: "terminal" as any, pinned: false };

      store.connect(tab);
      store.connect(tab);
      expect(createTerminalApi).toHaveBeenCalledTimes(1);
      expect(api.connect).toHaveBeenCalledTimes(1);
    });
  });
});
