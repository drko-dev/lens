/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { runInAction } from "mobx";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { Cluster } from "../../../common/cluster/cluster";
import clustersStateInjectable from "../../../features/cluster/storage/common/state.injectable";
import proxyAuthTokensInjectable from "../proxy-auth-tokens.injectable";
import revokeProxyTokensOfRemovedClustersInjectable from "../revoke-proxy-tokens-of-removed-clusters.injectable";

const makeCluster = (id: string) => new Cluster({ id, contextName: id, kubeConfigPath: "/x/config" });

describe("R4-09 token revocation for removed clusters", () => {
  it("revokes the token of a cluster removed by sync replace, keeps the others", () => {
    const di = getDiForUnitTesting();
    const state = di.inject(clustersStateInjectable);
    const tokens = di.inject(proxyAuthTokensInjectable);

    runInAction(() => {
      state.set("a", makeCluster("a"));
      state.set("b", makeCluster("b"));
    });
    di.inject(revokeProxyTokensOfRemovedClustersInjectable).run();

    const tokenA = tokens.get("a");
    const tokenB = tokens.get("b");

    // what the kubeconfig/store sync does: replace the whole map without "a"
    runInAction(() => state.replace(new Map([["b", state.get("b") as Cluster]])));

    expect(tokens.verify("a", tokenA)).toBe(false);
    expect(tokens.verify("b", tokenB)).toBe(true);
  });
});
