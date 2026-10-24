/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { PersistentVolumeClaim, VolumeSnapshot } from "@openlens/kube-object";
import {
  buildVolumeSnapshotManifest,
  classifySnapshotPhase,
  validateSnapshotName,
} from "./create-snapshot";

const makePvc = () => new PersistentVolumeClaim({
  apiVersion: "v1",
  kind: "PersistentVolumeClaim",
  metadata: {
    name: "data",
    namespace: "default",
    uid: "pvc-uid",
    resourceVersion: "10",
    selfLink: "/api/v1/namespaces/default/persistentvolumeclaims/data",
  },
  spec: {
    accessModes: ["ReadWriteOnce"],
    resources: { requests: { storage: "1Gi" }},
    storageClassName: "standard",
  },
  status: { phase: "Bound" },
} as never);

const makeSnapshot = (readyToUse: boolean, error?: string) => new VolumeSnapshot({
  apiVersion: "snapshot.storage.k8s.io/v1",
  kind: "VolumeSnapshot",
  metadata: {
    name: "snap-1",
    namespace: "default",
    uid: "snap-uid",
    resourceVersion: "1",
    selfLink: "/apis/snapshot.storage.k8s.io/v1/namespaces/default/volumesnapshots/snap-1",
  },
  spec: {
    source: { persistentVolumeClaimName: "data" },
    volumeSnapshotClassName: "csi-snapclass",
  },
  status: {
    readyToUse,
    boundVolumeSnapshotContentName: readyToUse ? "content-1" : undefined,
    error: error ? { message: error } : undefined,
  },
} as never);

describe("create-snapshot helpers", () => {
  describe("validateSnapshotName", () => {
    it("accepts valid DNS subdomain names", () => {
      expect(validateSnapshotName("my-snapshot").valid).toBe(true);
      expect(validateSnapshotName("snap123").valid).toBe(true);
    });

    it("rejects empty names", () => {
      expect(validateSnapshotName("").valid).toBe(false);
    });

    it("rejects names with invalid characters", () => {
      expect(validateSnapshotName("MySnapshot").valid).toBe(false);
      expect(validateSnapshotName("my_snapshot").valid).toBe(false);
      expect(validateSnapshotName("-leading").valid).toBe(false);
    });

    it("rejects names longer than 253 characters", () => {
      expect(validateSnapshotName("a".repeat(254)).valid).toBe(false);
    });
  });

  describe("buildVolumeSnapshotManifest", () => {
    it("uses the PVC as source in the same namespace", () => {
      const manifest = buildVolumeSnapshotManifest(makePvc(), "my-snapshot", "csi-snapclass");

      expect(manifest.apiVersion).toBe("snapshot.storage.k8s.io/v1");
      expect(manifest.kind).toBe("VolumeSnapshot");
      expect(manifest.spec?.source.persistentVolumeClaimName).toBe("data");
      expect(manifest.spec?.volumeSnapshotClassName).toBe("csi-snapclass");
      expect((manifest.metadata as { namespace: string }).namespace).toBe("default");
    });

    it("omits snapshot class when not provided", () => {
      const manifest = buildVolumeSnapshotManifest(makePvc(), "my-snapshot");

      expect(manifest.spec?.volumeSnapshotClassName).toBeUndefined();
    });
  });

  describe("classifySnapshotPhase", () => {
    it("detects Ready", () => {
      expect(classifySnapshotPhase(makeSnapshot(true))).toBe("Ready");
    });

    it("detects Error", () => {
      expect(classifySnapshotPhase(makeSnapshot(false, "failed to create"))).toBe("Error");
    });

    it("detects Pending when the status exists but the snapshot is not ready", () => {
      const snapshot = makeSnapshot(false);

      snapshot.status = { boundVolumeSnapshotContentName: "content-1" };

      expect(classifySnapshotPhase(snapshot)).toBe("Pending");
    });

    it("detects Pending while the controller reports but has not decided yet", () => {
      const snapshot = makeSnapshot(false);

      snapshot.status = {};

      expect(classifySnapshotPhase(snapshot)).toBe("Pending");
    });

    it("returns Unknown when the snapshot has no status at all", () => {
      const snapshot = makeSnapshot(false);

      snapshot.status = undefined;

      expect(classifySnapshotPhase(snapshot)).toBe("Unknown");
    });
  });
});
