/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { computed } from "mobx";
import { fireEvent, waitFor } from "@testing-library/react";
import { PersistentVolumeClaim } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";
import persistentVolumeClaimApiInjectable from "../../../../common/k8s-api/endpoints/persistent-volume-claim.api.injectable";
import volumeSnapshotApiInjectable from "../../../../common/k8s-api/endpoints/volume-snapshot.api.injectable";
import volumeSnapshotClassStoreInjectable from "../../storage-volume-snapshot-classes/store.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import type { PersistentVolumeClaimApi, VolumeSnapshotApi } from "../../../../common/k8s-api/endpoints";
import type { Cluster } from "../../../../common/cluster/cluster";
import { CreateVolumeSnapshotDialog } from "./dialog";
import type { OpenCreateVolumeSnapshotDialog } from "./open.injectable";
import openCreateVolumeSnapshotDialogInjectable from "./open.injectable";

const makePvc = (options: { uid?: string; resourceVersion?: string } = {}) => new PersistentVolumeClaim({
  apiVersion: "v1",
  kind: "PersistentVolumeClaim",
  metadata: {
    name: "data",
    namespace: "default",
    uid: options.uid ?? "pvc-uid",
    resourceVersion: options.resourceVersion ?? "10",
    selfLink: "/api/v1/namespaces/default/persistentvolumeclaims/data",
  },
  spec: {
    accessModes: ["ReadWriteOnce"],
    resources: { requests: { storage: "10Gi" }},
  },
  status: { phase: "Bound" },
} as never);

describe("<CreateVolumeSnapshotDialog />", () => {
  let render: DiRender;
  let open: OpenCreateVolumeSnapshotDialog;
  let pvcApi: {
    get: jest.Mock;
  };
  let volumeSnapshotApi: {
    create: jest.Mock;
    get: jest.Mock;
  };
  let volumeSnapshotClassStore: {
    items: unknown[];
    reloadAll: jest.Mock;
  };
  let cluster: { id: string; name: { get: () => string }};
  let production: boolean;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    pvcApi = {
      get: jest.fn(async () => makePvc()),
    };
    volumeSnapshotApi = {
      create: jest.fn(async () => ({})),
      get: jest.fn(async () => undefined),
    };
    volumeSnapshotClassStore = {
      items: [],
      reloadAll: jest.fn(async () => {}),
    };
    cluster = { id: "cluster-1", name: { get: () => "test-cluster" }};
    production = false;

    di.override(persistentVolumeClaimApiInjectable, () => pvcApi as unknown as PersistentVolumeClaimApi);
    di.override(volumeSnapshotApiInjectable, () => volumeSnapshotApi as unknown as VolumeSnapshotApi);
    di.override(volumeSnapshotClassStoreInjectable, () => volumeSnapshotClassStore as never);
    di.override(hostedClusterInjectable, () => cluster as unknown as Cluster);
    di.override(isProductionClusterInjectable, () => computed(() => production));

    render = renderFor(di);
    open = di.inject(openCreateVolumeSnapshotDialogInjectable);
  });

  const openDialog = () => open({ pvc: makePvc() });

  const walkToDryRun = async (view: ReturnType<DiRender>) => {
    await view.findByTestId("create-snapshot-input-step");
    fireEvent.change(view.getByTestId("create-snapshot-name-input"), { target: { value: "snap-1" }});
    fireEvent.click(view.getByTestId("create-snapshot-run-dry-run"));
    await view.findByTestId("create-snapshot-dry-run-passed");
  };

  const walkToConfirm = async (view: ReturnType<DiRender>) => {
    await walkToDryRun(view);
    fireEvent.click(view.getByTestId("create-snapshot-continue-to-confirm"));
    await view.findByTestId("create-snapshot-confirm-step");
    fireEvent.click(view.getByTestId("create-snapshot-acknowledge"));
    await waitFor(() => expect(view.getByTestId("create-snapshot-execute")).not.toBeDisabled());
  };

  it("runs the server-side dry-run without a real create and stores nothing", async () => {
    const view = render(<CreateVolumeSnapshotDialog />);

    openDialog();
    await walkToDryRun(view);

    expect(volumeSnapshotApi.create).toHaveBeenCalledTimes(1);
    expect(volumeSnapshotApi.create.mock.calls[0][2]).toEqual({ dryRun: "All" });
    expect(view.getByTestId("create-snapshot-continue-to-confirm")).not.toBeDisabled();
  });

  it("discards the dry-run approval when the form changes after passing", async () => {
    const view = render(<CreateVolumeSnapshotDialog />);

    openDialog();
    await walkToDryRun(view);
    expect(view.getByTestId("create-snapshot-continue-to-confirm")).not.toBeDisabled();

    fireEvent.change(view.getByTestId("create-snapshot-name-input"), { target: { value: "snap-2" }});

    expect(view.queryByTestId("create-snapshot-dry-run-passed")).not.toBeInTheDocument();
    await waitFor(() => expect(view.getByTestId("create-snapshot-continue-to-confirm")).toBeDisabled());

    fireEvent.click(view.getByTestId("create-snapshot-continue-to-confirm"));
    expect(view.queryByTestId("create-snapshot-confirm-step")).not.toBeInTheDocument();
    expect(volumeSnapshotApi.create).toHaveBeenCalledTimes(1);
  });

  it("does not post the snapshot when the PVC identity changed after the dry-run", async () => {
    pvcApi.get
      .mockResolvedValueOnce(makePvc())
      .mockResolvedValueOnce(makePvc({ uid: "pvc-uid-recreated" }));

    const view = render(<CreateVolumeSnapshotDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("create-snapshot-execute"));

    await view.findByTestId("create-snapshot-execution-error");
    expect(view.getByTestId("create-snapshot-execution-error")).toHaveTextContent("PVC changed");
    expect(volumeSnapshotApi.create).toHaveBeenCalledTimes(1);
  });

  it("revalidates the source against the latest cluster state and posts only afterwards", async () => {
    pvcApi.get
      .mockResolvedValueOnce(makePvc({ resourceVersion: "10" }))
      .mockResolvedValueOnce(makePvc({ resourceVersion: "120" }));

    const view = render(<CreateVolumeSnapshotDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("create-snapshot-execute"));

    await view.findByTestId("create-snapshot-result-step");
    expect(pvcApi.get).toHaveBeenCalledTimes(2);
    expect(volumeSnapshotApi.create).toHaveBeenCalledTimes(2);

    const [executeArgs, executeManifest] = volumeSnapshotApi.create.mock.calls[1];

    expect(executeArgs.name).toBe("snap-1");
    expect(executeArgs.namespace).toBe("default");
    expect(executeManifest.spec.source.persistentVolumeClaimName).toBe("data");
  });
});
