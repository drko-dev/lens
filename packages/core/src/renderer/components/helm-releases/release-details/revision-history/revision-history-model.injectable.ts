/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable, lifecycleEnum } from "@ogre-tools/injectable";
import { action, computed, observable, runInAction } from "mobx";
import type { IObservableValue } from "mobx";
import type { HelmReleaseRevision, RequestHelmReleaseHistory } from "../../../../../common/k8s-api/endpoints/helm-releases.api/request-history.injectable";
import requestHelmReleaseHistoryInjectable from "../../../../../common/k8s-api/endpoints/helm-releases.api/request-history.injectable";
import type { TargetHelmRelease } from "../target-helm-release.injectable";
import hostedClusterIdInjectable from "../../../../cluster-frame-context/hosted-cluster-id.injectable";
import hostedClusterInjectable from "../../../../cluster-frame-context/hosted-cluster.injectable";
import assert from "assert";

export type RevisionHistoryErrorKind = "permission-denied" | "error";

export interface RevisionHistoryState {
  readonly revisions: IObservableValue<HelmReleaseRevision[]>;
  readonly isLoading: IObservableValue<boolean>;
  readonly error: IObservableValue<string | undefined>;
  readonly errorKind: IObservableValue<RevisionHistoryErrorKind | undefined>;
  readonly selectedRevisionA: IObservableValue<number | undefined>;
  readonly selectedRevisionB: IObservableValue<number | undefined>;
}

interface Dependencies {
  readonly targetRelease: TargetHelmRelease;
  readonly clusterId: string;
  readonly requestHelmReleaseHistory: RequestHelmReleaseHistory;
  readonly getCurrentClusterId: () => string | undefined;
  readonly isClusterDisconnected: () => boolean;
}

const revisionHistoryModelInjectable = getInjectable({
  id: "revision-history-model",

  instantiate: (di, targetRelease: TargetHelmRelease): RevisionHistoryModel => {
    const clusterId = di.inject(hostedClusterIdInjectable);

    assert(clusterId, "Cluster id is required");

    const cluster = di.inject(hostedClusterInjectable);

    return new RevisionHistoryModel({
      targetRelease,
      clusterId,
      requestHelmReleaseHistory: di.inject(requestHelmReleaseHistoryInjectable),
      getCurrentClusterId: () => di.inject(hostedClusterIdInjectable),
      isClusterDisconnected: () => cluster?.disconnected.get() ?? false,
    });
  },

  lifecycle: lifecycleEnum.keyedSingleton({
    getInstanceKey: (di, release: TargetHelmRelease) => `${release.namespace}/${release.name}`,
  }),
});

export default revisionHistoryModelInjectable;

/**
 * Model of the revision history of a single Helm release.
 *
 * Every load is tagged with a monotonically increasing token and with the identity of the
 * cluster, namespace and release it was requested for. A response that does not match the
 * current request is discarded, so results of different clusters, namespaces or releases can
 * never be mixed.
 */
export class RevisionHistoryModel {
  readonly revisions = observable.box<HelmReleaseRevision[]>([]);
  readonly isLoading = observable.box(false);
  readonly error = observable.box<string | undefined>(undefined);
  readonly errorKind = observable.box<RevisionHistoryErrorKind | undefined>(undefined);
  readonly selectedRevisionA = observable.box<number | undefined>(undefined);
  readonly selectedRevisionB = observable.box<number | undefined>(undefined);

  private requestToken = 0;

  constructor(protected readonly dependencies: Dependencies) {}

  @computed get isDisconnected(): boolean {
    return this.dependencies.isClusterDisconnected();
  }

  @computed get hasRevisions(): boolean {
    return this.revisions.get().length > 0;
  }

  @computed get canCompare(): boolean {
    const a = this.selectedRevisionA.get();
    const b = this.selectedRevisionB.get();

    return a !== undefined && b !== undefined && a !== b;
  }

  load = async (): Promise<void> => {
    const token = ++this.requestToken;
    const { name, namespace } = this.dependencies.targetRelease;

    runInAction(() => {
      this.isLoading.set(true);
      this.error.set(undefined);
      this.errorKind.set(undefined);
    });

    try {
      const revisions = await this.dependencies.requestHelmReleaseHistory(name, namespace);

      if (!this.isCurrentRequest(token)) {
        return;
      }

      runInAction(() => {
        this.revisions.set(sortRevisions(revisions));
        this.isLoading.set(false);
      });
    } catch (error) {
      if (!this.isCurrentRequest(token)) {
        return;
      }

      const message = getErrorMessage(error);
      const isPermissionDenied = getErrorStatusCode(error) === 403;

      runInAction(() => {
        this.isLoading.set(false);
        this.error.set(message);
        this.errorKind.set(isPermissionDenied ? "permission-denied" : "error");
      });
    }
  };

  selectRevisionA = action((revision: number) => {
    this.selectedRevisionA.set(revision);

    if (this.selectedRevisionB.get() === revision) {
      this.selectedRevisionB.set(undefined);
    }
  });

  selectRevisionB = action((revision: number) => {
    this.selectedRevisionB.set(revision);

    if (this.selectedRevisionA.get() === revision) {
      this.selectedRevisionA.set(undefined);
    }
  });

  clearSelection = action(() => {
    this.selectedRevisionA.set(undefined);
    this.selectedRevisionB.set(undefined);
  });

  /**
   * A response is only accepted when it belongs to the request that is still current and when
   * the cluster, namespace and release it was asked for are still the ones on screen.
   */
  private isCurrentRequest(token: number): boolean {
    if (token !== this.requestToken) {
      return false;
    }

    if (this.dependencies.getCurrentClusterId() !== this.dependencies.clusterId) {
      return false;
    }

    return true;
  }
}

/**
 * Sorts the revisions from the newest to the oldest one, so the most recent revision is the
 * first row of the table.
 */
export function sortRevisions(revisions: HelmReleaseRevision[]): HelmReleaseRevision[] {
  return [...revisions].sort((a, b) => b.revision - a.revision);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error while loading the revision history";
}

export function getErrorStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    const status = (error as { status?: unknown }).status;

    if (typeof statusCode === "number") {
      return statusCode;
    }

    if (typeof status === "number") {
      return status;
    }
  }

  return undefined;
}
