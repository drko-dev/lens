/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { HelmReleaseRevision } from "../../../../../../common/k8s-api/endpoints/helm-releases.api/request-history.injectable";

type HelmRevisionType = HelmReleaseRevision;
import { RevisionHistoryModel, sortRevisions } from "../revision-history-model.injectable";

function revision(revisionNumber: number, overrides: Partial<HelmReleaseRevision> = {}): HelmReleaseRevision {
  return {
    revision: revisionNumber,
    updated: `2026-01-0${revisionNumber}T10:00:00Z`,
    status: "deployed",
    chart: `my-chart-${revisionNumber}.0.0`,
    app_version: `1.0.${revisionNumber}`,
    description: `Revision ${revisionNumber}`,
    ...overrides,
  };
}

function createModel(overrides: {
  request?: (name: string, namespace: string) => Promise<HelmReleaseRevision[]>;
  clusterId?: string;
  getCurrentClusterId?: () => string | undefined;
  isClusterDisconnected?: () => boolean;
} = {}) {
  const requests: { name: string; namespace: string }[] = [];

  const model = new RevisionHistoryModel({
    targetRelease: { name: "my-release", namespace: "default" },
    clusterId: overrides.clusterId ?? "cluster-a",
    requestHelmReleaseHistory: async (name, namespace) => {
      requests.push({ name, namespace });

      return overrides.request ? overrides.request(name, namespace) : [];
    },
    getCurrentClusterId: overrides.getCurrentClusterId ?? (() => overrides.clusterId ?? "cluster-a"),
    isClusterDisconnected: overrides.isClusterDisconnected ?? (() => false),
  });

  return { model, requests };
}

describe("RevisionHistoryModel", () => {
  describe("sortRevisions", () => {
    it("orders the revisions from the newest to the oldest one", () => {
      const sorted = sortRevisions([revision(1), revision(3), revision(2)]);

      expect(sorted.map(item => item.revision)).toEqual([3, 2, 1]);
    });

    it("does not mutate the given list", () => {
      const revisions = [revision(1), revision(2)];

      sortRevisions(revisions);

      expect(revisions.map(item => item.revision)).toEqual([1, 2]);
    });
  });

  describe("loading", () => {
    it("loads the history of the requested release", async () => {
      const { model, requests } = createModel({
        request: async () => [revision(1), revision(2)],
      });

      await model.load();

      expect(requests).toEqual([{ name: "my-release", namespace: "default" }]);
      expect(model.revisions.get().map(item => item.revision)).toEqual([2, 1]);
      expect(model.isLoading.get()).toBe(false);
      expect(model.error.get()).toBeUndefined();
    });

    it("reports an empty history", async () => {
      const { model } = createModel();

      await model.load();

      expect(model.hasRevisions).toBe(false);
      expect(model.error.get()).toBeUndefined();
    });

    it("reports a permission denied error when the API answers with a 403", async () => {
      const { model } = createModel({
        request: async () => {
          throw Object.assign(new Error("forbidden"), { statusCode: 403 });
        },
      });

      await model.load();

      expect(model.errorKind.get()).toBe("permission-denied");
      expect(model.error.get()).toContain("forbidden");
      expect(model.isLoading.get()).toBe(false);
    });

    it("reports a generic error for any other failure", async () => {
      const { model } = createModel({
        request: async () => {
          throw new Error("boom");
        },
      });

      await model.load();

      expect(model.errorKind.get()).toBe("error");
      expect(model.error.get()).toBe("boom");
    });

    it("discards a response that belongs to a superseded request", async () => {
      let resolveFirst: (value: HelmRevisionType[]) => void = () => undefined;
      let callCount = 0;

      const first = new Promise<HelmRevisionType[]>(resolve => {
        resolveFirst = resolve;
      });

      const { model } = createModel({
        request: async () => {
          callCount += 1;

          if (callCount === 1) {
            return first;
          }

          return [revision(2)];
        },
      });

      const pending = model.load();

      await model.load();

      resolveFirst([revision(1)]);
      await pending;

      // The first (stale) response must not overwrite the state of the newer request
      expect(model.revisions.get().map(item => item.revision)).toEqual([2]);
    });

    it("discards a response that arrives after the cluster changed", async () => {
      let resolveRequest: (value: HelmReleaseRevision[]) => void = () => undefined;
      let currentClusterId = "cluster-a";

      const { model } = createModel({
        request: async () => new Promise<HelmReleaseRevision[]>(resolve => {
          resolveRequest = resolve;
        }),
        getCurrentClusterId: () => currentClusterId,
      });

      const pending = model.load();

      currentClusterId = "cluster-b";
      resolveRequest([revision(1)]);
      await pending;

      expect(model.revisions.get()).toEqual([]);
    });
  });

  describe("selection", () => {
    it("selects two different revisions", async () => {
      const { model } = createModel({ request: async () => [revision(1), revision(2)] });

      await model.load();

      model.selectRevisionA(2);
      model.selectRevisionB(1);

      expect(model.selectedRevisionA.get()).toBe(2);
      expect(model.selectedRevisionB.get()).toBe(1);
      expect(model.canCompare).toBe(true);
    });

    it("does not allow the same revision on both sides", async () => {
      const { model } = createModel({ request: async () => [revision(1)] });

      await model.load();

      model.selectRevisionA(1);
      model.selectRevisionB(1);

      expect(model.selectedRevisionA.get()).toBeUndefined();
      expect(model.selectedRevisionB.get()).toBe(1);
      expect(model.canCompare).toBe(false);
    });

    it("cannot compare without two different revisions", async () => {
      const { model } = createModel({ request: async () => [revision(1), revision(2)] });

      await model.load();

      expect(model.canCompare).toBe(false);

      model.selectRevisionA(1);

      expect(model.canCompare).toBe(false);
    });

    it("clears the selection", async () => {
      const { model } = createModel({ request: async () => [revision(1), revision(2)] });

      await model.load();

      model.selectRevisionA(1);
      model.selectRevisionB(2);
      model.clearSelection();

      expect(model.selectedRevisionA.get()).toBeUndefined();
      expect(model.selectedRevisionB.get()).toBeUndefined();
    });
  });

  describe("connectivity", () => {
    it("reports the cluster as disconnected", () => {
      const { model } = createModel({ isClusterDisconnected: () => true });

      expect(model.isDisconnected).toBe(true);
    });

    it("reports a connected cluster", () => {
      const { model } = createModel();

      expect(model.isDisconnected).toBe(false);
    });
  });
});
