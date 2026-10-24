/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { VolumeSnapshotContent } from "./volume-snapshot-content";

const makeContentData = (overrides: Record<string, unknown> = {}) => ({
  apiVersion: "snapshot.storage.k8s.io/v1",
  kind: "VolumeSnapshotContent",
  metadata: {
    name: "snapcontent-7b4d9c2f-a1b2",
    uid: "content-uid",
    resourceVersion: "42",
    selfLink: "/apis/snapshot.storage.k8s.io/v1/volumesnapshotcontents/snapcontent-7b4d9c2f-a1b2",
  },
  spec: {
    driver: "csi.example.com",
    deletionPolicy: "Retain",
    volumeSnapshotClassName: "csi-snapclass",
    source: { volumeHandle: "vol-0e2f1d3c" },
    volumeSnapshotRef: {
      apiVersion: "snapshot.storage.k8s.io/v1",
      kind: "VolumeSnapshot",
      name: "snap-1",
      namespace: "default",
      uid: "snapshot-uid",
      resourceVersion: "7",
    },
  },
  status: {
    readyToUse: true,
    snapshotHandle: "snapshot-f01f3f9c-e3f5-4b31-a1ef-4d92d0f13c2b",
    creationTime: "2026-10-23T00:00:00Z",
    restoreSize: "5Gi",
  },
  ...overrides,
});

describe("VolumeSnapshotContent", () => {
  it("reads driver, deletionPolicy and volumeSnapshotRef from spec, not from root fields", () => {
    const content = new VolumeSnapshotContent(makeContentData() as never);

    expect(content.getDriver()).toBe("csi.example.com");
    expect(content.getDeletionPolicy()).toBe("Retain");
    expect(content.getSnapshotClassName()).toBe("csi-snapclass");
    expect(content.spec.volumeSnapshotRef?.name).toBe("snap-1");
    expect(content.spec.volumeSnapshotRef?.namespace).toBe("default");
    expect(content.getSourceType()).toBe("VolumeHandle");
  });

  it("does not assume an inherited deletion policy or driver when the spec omits them", () => {
    const data = makeContentData();

    delete (data.spec as { deletionPolicy?: string }).deletionPolicy;
    delete (data.spec as { driver?: string }).driver;

    const content = new VolumeSnapshotContent(data as never);

    expect(content.getDriver()).toBe("-");
    expect(content.getDeletionPolicy()).toBe("-");
  });

  it("derives the phase from status, including pending states", () => {
    const ready = new VolumeSnapshotContent(makeContentData() as never);
    const pending = new VolumeSnapshotContent(
      makeContentData({
        status: { readyToUse: false, snapshotHandle: "snapshot-handle", creationTime: "2026-10-23T00:00:00Z" },
      }) as never,
    );
    const errored = new VolumeSnapshotContent(
      makeContentData({
        status: { readyToUse: false, error: { message: "provisioning failed" } },
      }) as never,
    );
    const unknown = new VolumeSnapshotContent(makeContentData({ status: undefined }) as never);

    expect(ready.getSnapshotPhase()).toBe("Ready");
    expect(pending.getSnapshotPhase()).toBe("Pending");
    expect(errored.getSnapshotPhase()).toBe("Error");
    expect(unknown.getSnapshotPhase()).toBe("Unknown");
  });

  it("accepts a pre-provisioned snapshotHandle source", () => {
    const content = new VolumeSnapshotContent(
      makeContentData({
        spec: {
          driver: "csi.example.com",
          deletionPolicy: "Delete",
          source: { snapshotHandle: "snapshot-handle" },
          volumeSnapshotRef: { name: "snap-static", namespace: "default" },
          volumeSnapshotClassName: "csi-snapclass",
        },
      }) as never,
    );

    expect(content.getSourceType()).toBe("SnapshotHandle");
    expect(content.hasSourceHandle()).toBe(true);
  });

  it("reports status fields without leaking raw handle values", () => {
    const content = new VolumeSnapshotContent(makeContentData() as never);

    expect(content.hasSourceHandle()).toBe(true);
    expect(content.isReadyToUse()).toBe(true);
    expect(content.getRestoreSize()).toBe("5Gi");
    expect(JSON.stringify(content.getSnapshotPhase())).not.toContain("vol-0e2f1d3c");
  });
});
