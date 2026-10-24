/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable, lifecycleEnum } from "@ogre-tools/injectable";
import { action, computed, observable, runInAction } from "mobx";
import type { RequestHelmReleaseConfiguration } from "../../../../../common/k8s-api/endpoints/helm-releases.api/request-configuration.injectable";
import requestHelmReleaseConfigurationInjectable from "../../../../../common/k8s-api/endpoints/helm-releases.api/request-configuration.injectable";
import type { TargetHelmRelease } from "../target-helm-release.injectable";
import hostedClusterIdInjectable from "../../../../cluster-frame-context/hosted-cluster-id.injectable";
import hostedClusterInjectable from "../../../../cluster-frame-context/hosted-cluster.injectable";
import type { RevisionHistoryModel } from "../revision-history/revision-history-model.injectable";
import revisionHistoryModelInjectable from "../revision-history/revision-history-model.injectable";
import assert from "assert";

/**
 * Which flavour of the values is being compared.
 *
 * - "user-supplied": only the values the operator wrote (helm get values).
 * - "with-defaults": the values including the ones computed from the chart defaults
 *   (helm get values --all).
 */
export type ValuesDiffMode = "user-supplied" | "with-defaults";

interface Dependencies {
  readonly targetRelease: TargetHelmRelease;
  readonly clusterId: string;
  readonly requestHelmReleaseConfiguration: RequestHelmReleaseConfiguration;
  readonly revisionHistory: RevisionHistoryModel;
  readonly getCurrentClusterId: () => string | undefined;
  readonly isClusterDisconnected: () => boolean;
}

const valuesDiffModelInjectable = getInjectable({
  id: "values-diff-model",

  instantiate: (di, targetRelease: TargetHelmRelease): ValuesDiffModel => {
    const clusterId = di.inject(hostedClusterIdInjectable);

    assert(clusterId, "Cluster id is required");

    const cluster = di.inject(hostedClusterInjectable);

    return new ValuesDiffModel({
      targetRelease,
      clusterId,
      requestHelmReleaseConfiguration: di.inject(requestHelmReleaseConfigurationInjectable),
      revisionHistory: di.inject(revisionHistoryModelInjectable, targetRelease),
      getCurrentClusterId: () => di.inject(hostedClusterIdInjectable),
      isClusterDisconnected: () => cluster?.disconnected.get() ?? false,
    });
  },

  lifecycle: lifecycleEnum.keyedSingleton({
    getInstanceKey: (di, release: TargetHelmRelease) => `${release.namespace}/${release.name}`,
  }),
});

export default valuesDiffModelInjectable;

/**
 * Model of the comparison of the values of two revisions of a Helm release.
 *
 * Every request carries the revision it asks for, and the responses are only accepted when they
 * belong to the selection that is still current and to the cluster that is still on screen. A late
 * response of a previous selection is discarded instead of overwriting the current one.
 */
export class ValuesDiffModel {
  readonly isLoading = observable.box(false);
  readonly error = observable.box<string | undefined>(undefined);
  readonly valuesA = observable.box<string | undefined>(undefined);
  readonly valuesB = observable.box<string | undefined>(undefined);
  readonly mode = observable.box<ValuesDiffMode>("user-supplied");

  private requestToken = 0;

  constructor(protected readonly dependencies: Dependencies) {}

  @computed get hasSelection(): boolean {
    return this.dependencies.revisionHistory.canCompare;
  }

  @computed get revisionA(): number | undefined {
    return this.dependencies.revisionHistory.selectedRevisionA.get();
  }

  @computed get revisionB(): number | undefined {
    return this.dependencies.revisionHistory.selectedRevisionB.get();
  }

  @computed get isReady(): boolean {
    return !this.isLoading.get()
      && this.error.get() === undefined
      && this.valuesA.get() !== undefined
      && this.valuesB.get() !== undefined;
  }

  setMode = action((mode: ValuesDiffMode) => {
    if (this.mode.get() === mode) {
      return;
    }

    this.mode.set(mode);
  });

  clear = action(() => {
    this.requestToken++;
    this.isLoading.set(false);
    this.error.set(undefined);
    this.valuesA.set(undefined);
    this.valuesB.set(undefined);
  });

  load = async (): Promise<void> => {
    const revisionA = this.dependencies.revisionHistory.selectedRevisionA.get();
    const revisionB = this.dependencies.revisionHistory.selectedRevisionB.get();

    if (revisionA === undefined || revisionB === undefined || revisionA === revisionB) {
      runInAction(() => {
        this.valuesA.set(undefined);
        this.valuesB.set(undefined);
        this.error.set(undefined);
        this.isLoading.set(false);
      });

      return;
    }

    const token = ++this.requestToken;
    const all = this.mode.get() === "with-defaults";
    const { name, namespace } = this.dependencies.targetRelease;

    runInAction(() => {
      this.isLoading.set(true);
      this.error.set(undefined);
      // The values of the previous selection must not stay on screen under the new revision
      // labels while the new ones are being fetched.
      this.valuesA.set(undefined);
      this.valuesB.set(undefined);
    });

    try {
      const [valuesA, valuesB] = await Promise.all([
        this.dependencies.requestHelmReleaseConfiguration(name, namespace, all, revisionA),
        this.dependencies.requestHelmReleaseConfiguration(name, namespace, all, revisionB),
      ]);

      if (!this.isCurrentRequest(token, revisionA, revisionB)) {
        return;
      }

      runInAction(() => {
        this.valuesA.set(valuesA);
        this.valuesB.set(valuesB);
        this.isLoading.set(false);
      });
    } catch (error) {
      if (!this.isCurrentRequest(token, revisionA, revisionB)) {
        return;
      }

      runInAction(() => {
        this.isLoading.set(false);
        this.error.set(error instanceof Error ? error.message : String(error));
      });
    }
  };

  /**
   * A response is only accepted when it belongs to the request that is still current, when the
   * selected revisions did not change and when the cluster did not change either.
   */
  private isCurrentRequest(token: number, revisionA: number, revisionB: number): boolean {
    if (token !== this.requestToken) {
      return false;
    }

    if (this.dependencies.getCurrentClusterId() !== this.dependencies.clusterId) {
      return false;
    }

    const currentA = this.dependencies.revisionHistory.selectedRevisionA.get();
    const currentB = this.dependencies.revisionHistory.selectedRevisionB.get();

    return currentA === revisionA && currentB === revisionB;
  }
}
