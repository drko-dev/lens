/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import clusterFrameContextForNamespacedResourcesInjectable from "../../../cluster-frame-context/for-namespaced-resources.injectable";
import showErrorNotificationInjectable from "../../notifications/show-error-notification.injectable";
import podStoreInjectable from "../../workloads-pods/store.injectable";
import podDisruptionBudgetStoreInjectable from "../../config-pod-disruption-budgets/store.injectable";
import loadPodsFromAllNamespacesInjectable from "../../workloads-pods/load-pods-from-all-namespaces.injectable";
import loadPdbsFromAllNamespacesInjectable from "./load-pdbs-from-all-namespaces.injectable";
import { ClusterDataLoadError } from "../../../utils/cluster-data-load-error";

interface FakeStoreState {
  isLoaded: boolean;
  isLoading: boolean;
  failedLoading: boolean;
  lastError?: unknown;
}

const createFakeStore = (state: FakeStoreState, onLoad: (callbacks: { onLoadFailure?: (error: unknown) => void }) => unknown) => ({
  get isLoaded() { return state.isLoaded; },
  get isLoading() { return state.isLoading; },
  get failedLoading() { return state.failedLoading; },
  get lastError() { return state.lastError; },
  get items() { return []; },
  loadAll: jest.fn(async (options: { onLoadFailure?: (error: unknown) => void } = {}) => onLoad(options)),
});

describe("cluster-wide loaders", () => {
  let di: DiContainer;
  let podState: FakeStoreState;
  let pdbState: FakeStoreState;

  beforeEach(() => {
    di = getDiForUnitTesting();
    podState = { isLoaded: false, isLoading: false, failedLoading: false };
    pdbState = { isLoaded: false, isLoading: false, failedLoading: false };

    di.override(clusterFrameContextForNamespacedResourcesInjectable, () => ({ allNamespaces: ["default", "finance"] }) as never);
    di.override(showErrorNotificationInjectable, () => jest.fn());
  });

  it("resolves an empty pod result as a complete success (zero pods is not a failure)", async () => {
    di.override(podStoreInjectable, () => createFakeStore(podState, () => {
      podState.isLoaded = true;

      return [];
    }) as never);

    const loadPods = di.inject(loadPodsFromAllNamespacesInjectable);

    await expect(loadPods()).resolves.toEqual([]);
  });

  it("rejects a partial pod load instead of treating it as complete", async () => {
    di.override(podStoreInjectable, () => createFakeStore(podState, ({ onLoadFailure }) => {
      podState.isLoaded = true;
      onLoadFailure?.(new Error("namespace finance: 403"));

      return [];
    }) as never);

    const loadPods = di.inject(loadPodsFromAllNamespacesInjectable);

    await expect(loadPods()).rejects.toMatchObject({
      name: "ClusterDataLoadError",
      resource: "Pods",
      partial: true,
    });
  });

  it("rejects a failed pod load as not complete", async () => {
    di.override(podStoreInjectable, () => createFakeStore(podState, () => {
      podState.failedLoading = true;
      podState.lastError = new Error("cluster unreachable");

      return undefined;
    }) as never);

    const loadPods = di.inject(loadPodsFromAllNamespacesInjectable);

    await expect(loadPods()).rejects.toBeInstanceOf(ClusterDataLoadError);
  });

  it("resolves an empty PDB result as a complete success", async () => {
    di.override(podDisruptionBudgetStoreInjectable, () => createFakeStore(pdbState, () => {
      pdbState.isLoaded = true;

      return [];
    }) as never);

    const loadPdbs = di.inject(loadPdbsFromAllNamespacesInjectable);

    await expect(loadPdbs()).resolves.toEqual([]);
  });

  it("rejects a partial PDB load instead of treating it as complete", async () => {
    di.override(podDisruptionBudgetStoreInjectable, () => createFakeStore(pdbState, ({ onLoadFailure }) => {
      pdbState.isLoaded = true;
      onLoadFailure?.(new Error("namespace finance: 403"));

      return [];
    }) as never);

    const loadPdbs = di.inject(loadPdbsFromAllNamespacesInjectable);

    await expect(loadPdbs()).rejects.toMatchObject({
      name: "ClusterDataLoadError",
      resource: "PodDisruptionBudgets",
      partial: true,
    });
  });

  it("rejects a failed PDB load as not complete", async () => {
    di.override(podDisruptionBudgetStoreInjectable, () => createFakeStore(pdbState, () => {
      pdbState.failedLoading = true;
      pdbState.lastError = new Error("429");

      return undefined;
    }) as never);

    const loadPdbs = di.inject(loadPdbsFromAllNamespacesInjectable);

    await expect(loadPdbs()).rejects.toBeInstanceOf(ClusterDataLoadError);
  });
});
