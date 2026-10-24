/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { KubeObject } from "../kube-object";
import type { ClusterScopedMetadata, KubeJsonApiData, KubeObjectMetadata, KubeObjectScope } from "../api-types";

export interface VolumeSnapshotClassData
  extends KubeJsonApiData<KubeObjectMetadata<KubeObjectScope.Cluster>, void, void> {
  driver: string;
  deletionPolicy?: string;
  parameters?: Partial<Record<string, string>>;
}

export class VolumeSnapshotClass extends KubeObject<ClusterScopedMetadata, void, void> {
  static readonly kind = "VolumeSnapshotClass";

  static readonly namespaced = false;

  static readonly apiBase = "/apis/snapshot.storage.k8s.io/v1/volumesnapshotclasses";

  driver: string;

  deletionPolicy: string;

  parameters: Partial<Record<string, string>>;

  constructor({ driver, deletionPolicy = "Delete", parameters = {}, ...rest }: VolumeSnapshotClassData) {
    super(rest);
    autoBind(this);
    this.driver = driver;
    this.deletionPolicy = deletionPolicy;
    this.parameters = parameters;
  }

  isDefault(): boolean {
    const annotations = this.metadata.annotations || {};

    return annotations["snapshot.storage.kubernetes.io/is-default-class"] === "true";
  }

  getDriver(): string {
    return this.driver;
  }

  getDeletionPolicy(): string {
    return this.deletionPolicy || "-";
  }
}
