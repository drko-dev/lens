/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { KubeObject } from "../kube-object";
import type { NamespaceScopedMetadata } from "../api-types";

export interface VolumeSnapshotSource {
  persistentVolumeClaimName?: string;
  volumeSnapshotContentName?: string;
}

export interface VolumeSnapshotError {
  message?: string;
  time?: string;
}

export interface VolumeSnapshotSpec {
  source: VolumeSnapshotSource;
  volumeSnapshotClassName?: string;
}

export interface VolumeSnapshotStatus {
  boundVolumeSnapshotContentName?: string;
  creationTime?: string;
  readyToUse?: boolean;
  restoreSize?: string;
  error?: VolumeSnapshotError;
}

export class VolumeSnapshot extends KubeObject<NamespaceScopedMetadata, VolumeSnapshotStatus, VolumeSnapshotSpec> {
  static readonly kind = "VolumeSnapshot";

  static readonly namespaced = true;

  static readonly apiBase = "/apis/snapshot.storage.k8s.io/v1/volumesnapshots";

  getSourceName(): string {
    return this.spec.source.persistentVolumeClaimName || this.spec.source.volumeSnapshotContentName || "-";
  }

  getSourceKind(): "PersistentVolumeClaim" | "VolumeSnapshotContent" | "-" {
    if (this.spec.source.persistentVolumeClaimName) {
      return "PersistentVolumeClaim";
    }

    if (this.spec.source.volumeSnapshotContentName) {
      return "VolumeSnapshotContent";
    }

    return "-";
  }

  getSnapshotClassName(): string {
    return this.spec.volumeSnapshotClassName ?? "-";
  }

  getStatusPhase(): "Ready" | "Pending" | "Error" | "Unknown" {
    if (this.status?.error?.message) {
      return "Error";
    }

    if (this.status?.readyToUse) {
      return "Ready";
    }

    if (this.status?.boundVolumeSnapshotContentName) {
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

  getErrorMessage(): string {
    return this.status?.error?.message ?? "";
  }
}
