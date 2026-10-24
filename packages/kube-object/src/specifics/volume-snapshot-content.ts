/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { KubeObject } from "../kube-object";
import type { ClusterScopedMetadata, KubeJsonApiData, KubeObjectMetadata, KubeObjectScope } from "../api-types";

export interface VolumeSnapshotRef {
  apiVersion?: string;
  kind?: string;
  name?: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
}

export interface VolumeSnapshotContentSource {
  volumeHandle?: string;
  snapshotHandle?: string;
}

export interface VolumeSnapshotContentError {
  message?: string;
  time?: string;
}

export interface VolumeSnapshotContentStatus {
  snapshotHandle?: string;
  creationTime?: string;
  readyToUse?: boolean;
  restoreSize?: string;
  error?: VolumeSnapshotContentError;
}

export interface VolumeSnapshotContentSpec {
  driver: string;
  deletionPolicy: string;
  source: VolumeSnapshotContentSource;
  volumeSnapshotClassName?: string;
  volumeSnapshotRef?: VolumeSnapshotRef;
}

export interface VolumeSnapshotContentData
  extends KubeJsonApiData<
    KubeObjectMetadata<KubeObjectScope.Cluster>,
    VolumeSnapshotContentStatus,
    VolumeSnapshotContentSpec
  > {}

export class VolumeSnapshotContent extends KubeObject<
  ClusterScopedMetadata,
  VolumeSnapshotContentStatus,
  VolumeSnapshotContentSpec
> {
  static readonly kind = "VolumeSnapshotContent";

  static readonly namespaced = false;

  static readonly apiBase = "/apis/snapshot.storage.k8s.io/v1/volumesnapshotcontents";

  constructor(data: VolumeSnapshotContentData) {
    super(data);
    autoBind(this);
  }

  /**
   * "-" when the cluster has not reported a driver; never inferred.
   */
  getDriver(): string {
    return this.spec?.driver ?? "-";
  }

  /**
   * "-" when the snapshot controller has not reported a deletion policy;
   * no default policy is assumed (Delete/Retain are cluster decisions).
   */
  getDeletionPolicy(): string {
    return this.spec?.deletionPolicy ?? "-";
  }

  getSnapshotClassName(): string {
    return this.spec?.volumeSnapshotClassName ?? "-";
  }

  getSnapshotPhase(): "Ready" | "Pending" | "Error" | "Unknown" {
    if (this.status?.error?.message) {
      return "Error";
    }

    if (this.status?.readyToUse) {
      return "Ready";
    }

    if (this.status?.snapshotHandle || this.status?.creationTime) {
      return "Pending";
    }

    return "Unknown";
  }

  isReadyToUse(): boolean {
    return this.status?.readyToUse ?? false;
  }

  getRestoreSize(): string {
    return this.status?.restoreSize ?? "-";
  }

  getSourceType(): "VolumeHandle" | "SnapshotHandle" | "-" {
    if (this.spec?.source?.volumeHandle) {
      return "VolumeHandle";
    }

    if (this.spec?.source?.snapshotHandle) {
      return "SnapshotHandle";
    }

    return "-";
  }

  /**
   * Intentionally not exposing raw volume/snapshot handles in the UI.
   */
  hasSourceHandle(): boolean {
    return Boolean(this.spec?.source?.volumeHandle || this.spec?.source?.snapshotHandle);
  }
}
