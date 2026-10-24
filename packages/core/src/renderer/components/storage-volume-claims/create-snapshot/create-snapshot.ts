/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { PersistentVolumeClaim, VolumeSnapshot } from "@openlens/kube-object";

const dnsSubdomainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export interface SnapshotNameValidation {
  valid: boolean;
  error?: string;
}

export const validateSnapshotName = (name: string): SnapshotNameValidation => {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: "Enter a snapshot name." };
  }

  if (trimmed.length > 253) {
    return { valid: false, error: "Snapshot name must be 253 characters or fewer." };
  }

  if (!dnsSubdomainRegex.test(trimmed)) {
    return { valid: false, error: "Snapshot name must be a valid DNS subdomain (lowercase letters, numbers, '-')." };
  }

  return { valid: true };
};

export const buildVolumeSnapshotManifest = (
  pvc: PersistentVolumeClaim,
  name: string,
  snapshotClassName?: string,
): Partial<VolumeSnapshot> => ({
  apiVersion: "snapshot.storage.k8s.io/v1",
  kind: "VolumeSnapshot",
  metadata: {
    name: name.trim(),
    namespace: pvc.getNs(),
  } as unknown as VolumeSnapshot["metadata"],
  spec: {
    source: {
      persistentVolumeClaimName: pvc.getName(),
    },
    volumeSnapshotClassName: snapshotClassName || undefined,
  },
});

export type SnapshotPhase = "Pending" | "Ready" | "Error" | "Unknown";

/**
 * A status object that exists means the snapshot controller is actively
 * reporting: that is Pending until Ready or Error. No status at all is
 * Unknown — the observation layer never gets to guess a cluster's intent.
 */
export const classifySnapshotPhase = (snapshot: VolumeSnapshot): SnapshotPhase => {
  if (snapshot.status === undefined) {
    return "Unknown";
  }

  if (snapshot.status.error?.message) {
    return "Error";
  }

  if (snapshot.status.readyToUse) {
    return "Ready";
  }

  return "Pending";
};
