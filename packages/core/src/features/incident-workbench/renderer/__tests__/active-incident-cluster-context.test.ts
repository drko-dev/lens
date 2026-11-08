/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import queryParametersInjectable from "../../../../renderer/routes/query-parameters.injectable";
import activeEntityInternalClusterInjectable from "../../../../renderer/api/catalog/entity/get-active-cluster-entity.injectable";
import hostedClusterIdInjectable from "../../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import activeIncidentClusterContextInjectable from "../active-incident-cluster-context.injectable";
import incidentStoreInjectable from "../incident-store.injectable";
import { computed, observable, runInAction, type IComputedValue } from "mobx";
import type { ParsedQuery } from "query-string";

describe("ActiveIncidentClusterContext & IncidentStore Dynamic Reaction (H8.8-05-R4 / P0-A)", () => {
  let di: ReturnType<typeof getDiForUnitTesting>;
  let rawQueryParameters: ReturnType<typeof observable.box<ParsedQuery<string>>>;
  let mockQueryParameters: IComputedValue<ParsedQuery<string>>;
  let rawActiveCluster: ReturnType<typeof observable.box<any>>;
  let mockActiveCluster: IComputedValue<any>;
  let mockHostedClusterId: string | undefined;

  beforeEach(() => {
    di = getDiForUnitTesting();

    rawQueryParameters = observable.box<ParsedQuery<string>>({});
    mockQueryParameters = computed(() => rawQueryParameters.get() ?? {});

    rawActiveCluster = observable.box<any>(undefined);
    mockActiveCluster = computed(() => rawActiveCluster.get());

    mockHostedClusterId = undefined;

    di.override(queryParametersInjectable, () => mockQueryParameters);
    di.override(activeEntityInternalClusterInjectable, () => mockActiveCluster);
    di.override(hostedClusterIdInjectable, () => mockHostedClusterId);
  });

  describe("1. Window Context vs URL Parameter Authority", () => {
    it("never infers cluster identity from URL parameters alone when window context is missing (fail-closed)", () => {
      runInAction(() => {
        rawQueryParameters.set({ clusterId: "cluster-spoofed" });
        rawActiveCluster.set(undefined);
      });

      const context = di.inject(activeIncidentClusterContextInjectable);
      expect(context.get()).toEqual({
        clusterId: undefined,
        namespace: undefined,
      });
    });

    it("rejects discrepancy fail-closed when URL clusterId differs from active window cluster", () => {
      runInAction(() => {
        rawActiveCluster.set({ id: "cluster-alpha" });
        rawQueryParameters.set({ clusterId: "cluster-beta" });
      });

      const context = di.inject(activeIncidentClusterContextInjectable);
      expect(context.get()).toEqual({
        clusterId: undefined,
        namespace: undefined,
      });
    });

    it("rejects discrepancy fail-closed when hostedClusterId and active cluster entity mismatch", () => {
      di.override(hostedClusterIdInjectable, () => "cluster-alpha");
      runInAction(() => {
        rawActiveCluster.set({ id: "cluster-beta" });
        rawQueryParameters.set({});
      });

      const context = di.inject(activeIncidentClusterContextInjectable);
      expect(context.get()).toEqual({
        clusterId: undefined,
        namespace: undefined,
      });
    });

    it("authorizes cluster context strictly from trusted window entity", () => {
      runInAction(() => {
        rawActiveCluster.set({ id: "cluster-alpha" });
        rawQueryParameters.set({});
      });

      const context = di.inject(activeIncidentClusterContextInjectable);
      expect(context.get()).toEqual({
        clusterId: "cluster-alpha",
        namespace: undefined,
      });
    });

    it("permits matching URL parameter that confirms the authentic window context", () => {
      runInAction(() => {
        rawActiveCluster.set({ id: "cluster-alpha" });
        rawQueryParameters.set({ clusterId: "cluster-alpha" });
      });

      const context = di.inject(activeIncidentClusterContextInjectable);
      expect(context.get()).toEqual({
        clusterId: "cluster-alpha",
        namespace: undefined,
      });
    });
  });

  describe("2. Namespace Scope & Discrepancy Checks", () => {
    it("rejects query namespace when outside cluster's accessibleNamespaces", () => {
      runInAction(() => {
        rawActiveCluster.set({
          id: "cluster-alpha",
          accessibleNamespaces: ["kube-system", "production"],
        });
        rawQueryParameters.set({ namespace: "restricted-secret-ns" });
      });

      const context = di.inject(activeIncidentClusterContextInjectable);
      expect(context.get().namespace).toBeUndefined();
    });

    it("authorizes namespace when within cluster's accessibleNamespaces", () => {
      runInAction(() => {
        rawActiveCluster.set({
          id: "cluster-alpha",
          accessibleNamespaces: ["kube-system", "production"],
        });
        rawQueryParameters.set({ namespace: "production" });
      });

      const context = di.inject(activeIncidentClusterContextInjectable);
      expect(context.get()).toEqual({
        clusterId: "cluster-alpha",
        namespace: "production",
      });
    });
  });

  describe("3. Dynamic MobX Reaction in IncidentStore", () => {
    it("dynamically follows cluster context changes, purges previous state and advances scopeGeneration", () => {
      runInAction(() => {
        rawActiveCluster.set({ id: "cluster-alpha" });
      });

      const store = di.inject(incidentStoreInjectable);
      expect(store.activeClusterId).toBe("cluster-alpha");
      const initialScope = store.scopeGeneration;

      // Populate some fake cached state for alpha
      store.incidents = [
        {
          id: "INC-ALPHA-1",
          clusterId: "cluster-alpha",
          namespace: "default",
          workloadKind: "Pod",
          workloadName: "test-pod",
          title: "Test",
          severity: "high",
          status: "DETECTADO",
          isPinned: false,
          createdAt: "2026-11-08T00:00:00Z",
          updatedAt: "2026-11-08T00:00:00Z",
        },
      ];
      store.activeIncidentId = "INC-ALPHA-1";

      // Dynamically switch window cluster context to cluster-beta
      runInAction(() => {
        rawActiveCluster.set({ id: "cluster-beta" });
      });

      // The MobX reaction in incidentStoreInjectable must have reacted immediately
      expect(store.activeClusterId).toBe("cluster-beta");
      expect(store.incidents).toHaveLength(0);
      expect(store.activeIncidentId).toBeNull();
      expect(store.scopeGeneration).toBeGreaterThan(initialScope);

      // Clean up via store disposal
      store.dispose();
      expect(store.incidents).toHaveLength(0);
    });
  });
});
