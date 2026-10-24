/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { computed } from "mobx";
import { fireEvent, waitFor } from "@testing-library/react";
import { PersistentVolumeClaim, StorageClass } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";
import persistentVolumeClaimApiInjectable from "../../../../common/k8s-api/endpoints/persistent-volume-claim.api.injectable";
import storageClassApiInjectable from "../../../../common/k8s-api/endpoints/storage-class.api.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import type { PersistentVolumeClaimApi, StorageClassApi } from "../../../../common/k8s-api/endpoints";
import type { Cluster } from "../../../../common/cluster/cluster";
import { PvcExpandDialog } from "./dialog";
import type { OpenPvcExpandDialog } from "./open.injectable";
import openPvcExpandDialogInjectable from "./open.injectable";

const makePvc = (options: { size?: string; uid?: string; resourceVersion?: string } = {}) => new PersistentVolumeClaim({
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
    resources: { requests: { storage: options.size ?? "10Gi" }},
    storageClassName: "standard",
  },
  status: { phase: "Bound" },
} as never);

const makeStorageClass = (options: { allowVolumeExpansion?: boolean } = {}) => new StorageClass({
  apiVersion: "storage.k8s.io/v1",
  kind: "StorageClass",
  metadata: {
    name: "standard",
    uid: "sc-uid",
    resourceVersion: "1",
    selfLink: "/apis/storage.k8s.io/v1/storageclasses/standard",
  },
  provisioner: "csi.test.io",
  allowVolumeExpansion: options.allowVolumeExpansion ?? true,
} as never);

describe("<PvcExpandDialog />", () => {
  let render: DiRender;
  let open: OpenPvcExpandDialog;
  let pvcApi: {
    get: jest.Mock;
    patch: jest.Mock;
  };
  let storageClassApi: {
    get: jest.Mock;
  };
  let cluster: { id: string; name: { get: () => string }};
  let production: boolean;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    pvcApi = {
      get: jest.fn(async () => makePvc()),
      patch: jest.fn(async () => ({})),
    };
    storageClassApi = {
      get: jest.fn(async () => makeStorageClass()),
    };
    cluster = { id: "cluster-1", name: { get: () => "test-cluster" }};
    production = false;

    di.override(persistentVolumeClaimApiInjectable, () => pvcApi as unknown as PersistentVolumeClaimApi);
    di.override(storageClassApiInjectable, () => storageClassApi as unknown as StorageClassApi);
    di.override(hostedClusterInjectable, () => cluster as unknown as Cluster);
    di.override(isProductionClusterInjectable, () => computed(() => production));

    render = renderFor(di);
    open = di.inject(openPvcExpandDialogInjectable);
  });

  const openDialog = () => open({ pvc: makePvc() });

  const walkToDryRun = async (view: ReturnType<DiRender>) => {
    await view.findByTestId("pvc-expand-input-step");
    fireEvent.change(view.getByTestId("pvc-expand-size-input"), { target: { value: "20Gi" }});
    fireEvent.click(view.getByTestId("pvc-expand-run-dry-run"));
    await view.findByTestId("pvc-expand-dry-run-passed");
  };

  const walkToConfirm = async (view: ReturnType<DiRender>) => {
    await walkToDryRun(view);
    fireEvent.click(view.getByTestId("pvc-expand-continue-to-confirm"));
    await view.findByTestId("pvc-expand-confirm-step");
    fireEvent.click(view.getByTestId("pvc-expand-acknowledge"));
    await waitFor(() => expect(view.getByTestId("pvc-expand-execute")).not.toBeDisabled());
  };

  it("patches only while the PVC resourceVersion still matches the approved dry-run", async () => {
    pvcApi.get
      .mockResolvedValueOnce(makePvc({ resourceVersion: "10" }))
      .mockResolvedValueOnce(makePvc({ resourceVersion: "10" }));
    storageClassApi.get
      .mockResolvedValueOnce(makeStorageClass())
      .mockResolvedValueOnce(makeStorageClass());

    const view = render(<PvcExpandDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("pvc-expand-execute"));

    await view.findByTestId("pvc-expand-result-step");
    expect(pvcApi.get).toHaveBeenCalledTimes(3);
    expect(pvcApi.patch).toHaveBeenCalledTimes(2);

    const testOp = (patch: { op?: string; path?: string; value?: string }[], path: string) =>
      patch.find(op => op.op === "test" && op.path === path) as { op: string; path: string; value: string } | undefined;
    const replaceOp = (patch: { op?: string; path?: string; value?: string }[], path: string) =>
      patch.find(op => op.op === "replace" && op.path === path) as { op: string; path: string; value: string } | undefined;

    const [dryRunArgs, dryRunPatch, , dryRunOptions] = pvcApi.patch.mock.calls[0];

    expect(dryRunOptions?.dryRun).toBe("All");
    expect(dryRunArgs.name).toBe("data");
    expect(testOp(dryRunPatch, "/metadata/uid")?.value).toBe("pvc-uid");
    expect(testOp(dryRunPatch, "/metadata/resourceVersion")?.value).toBe("10");
    expect(replaceOp(dryRunPatch, "/spec/resources/requests/storage")?.value).toBe("20Gi");

    const [executeArgs, executePatch, , executeOptions] = pvcApi.patch.mock.calls[1];

    expect(executeOptions?.dryRun).toBeUndefined();
    expect(executeArgs.name).toBe("data");
    expect(testOp(executePatch, "/metadata/resourceVersion")?.value).toBe("10");
    expect(replaceOp(executePatch, "/spec/resources/requests/storage")?.value).toBe("20Gi");
  });

  it("invalidates the approval and demands a new dry-run when the PVC resourceVersion changed after the dry-run", async () => {
    pvcApi.get
      .mockResolvedValueOnce(makePvc({ resourceVersion: "10" }))
      .mockResolvedValueOnce(makePvc({ resourceVersion: "120" }))
      .mockResolvedValueOnce(makePvc({ resourceVersion: "120" }));
    storageClassApi.get.mockResolvedValue(makeStorageClass());

    const view = render(<PvcExpandDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("pvc-expand-execute"));

    await view.findByTestId("pvc-expand-input-step");
    expect(view.getByTestId("pvc-expand-validation-error")).toHaveTextContent("Run the dry-run again");
    expect(pvcApi.get).toHaveBeenCalledTimes(3);
    expect(pvcApi.patch).toHaveBeenCalledTimes(1);
    expect(pvcApi.patch.mock.calls[0][3]?.dryRun).toBe("All");
    expect(view.getByTestId("pvc-expand-continue-to-confirm")).toBeDisabled();

    fireEvent.change(view.getByTestId("pvc-expand-size-input"), { target: { value: "20Gi" }});
    fireEvent.click(view.getByTestId("pvc-expand-run-dry-run"));
    await view.findByTestId("pvc-expand-dry-run-passed");

    const [, realDryRunPatch, , realDryRunOptions] = pvcApi.patch.mock.calls[1];

    expect(realDryRunOptions?.dryRun).toBe("All");
    expect(realDryRunPatch.find((op: { op?: string; path?: string }) => op.op === "test" && op.path === "/metadata/resourceVersion")?.value).toBe("120");

    fireEvent.click(view.getByTestId("pvc-expand-continue-to-confirm"));
    await view.findByTestId("pvc-expand-confirm-step");
    fireEvent.click(view.getByTestId("pvc-expand-acknowledge"));
    await waitFor(() => expect(view.getByTestId("pvc-expand-execute")).not.toBeDisabled());
    expect(pvcApi.patch).toHaveBeenCalledTimes(2);
  });

  it("aborts with no real patch when the active cluster changes while the execution-time StorageClass GET is pending", async () => {
    let releaseStorageClassGet: ((value: unknown) => void) | undefined;

    pvcApi.get
      .mockResolvedValueOnce(makePvc())
      .mockResolvedValueOnce(makePvc());
    storageClassApi.get.mockImplementation(async () =>
      new Promise(resolve => {
        releaseStorageClassGet = resolve;
      }) as never,
    );

    const view = render(<PvcExpandDialog />);

    openDialog();

    await waitFor(() => expect(storageClassApi.get).toHaveBeenCalledTimes(1));
    releaseStorageClassGet?.(makeStorageClass());
    await walkToConfirm(view);

    expect(pvcApi.patch).toHaveBeenCalledTimes(1);

    fireEvent.click(view.getByTestId("pvc-expand-execute"));
    await waitFor(() => expect(pvcApi.patch).toHaveBeenCalledTimes(1));

    cluster.id = "cluster-2";
    releaseStorageClassGet?.(makeStorageClass());

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(storageClassApi.get).toHaveBeenCalledTimes(2);
    expect(pvcApi.patch).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("pvc-expand-result-step")).not.toBeInTheDocument();
  });

  it("aborts with no real patch when the cluster turns into production while the execution-time StorageClass GET is pending", async () => {
    let releaseStorageClassGet: ((value: unknown) => void) | undefined;

    pvcApi.get
      .mockResolvedValueOnce(makePvc())
      .mockResolvedValueOnce(makePvc());
    storageClassApi.get
      .mockResolvedValueOnce(makeStorageClass())
      .mockImplementation(async () =>
        new Promise(resolve => {
          releaseStorageClassGet = resolve;
        }) as never,
      );

    const view = render(<PvcExpandDialog />);

    openDialog();
    await walkToConfirm(view);

    fireEvent.click(view.getByTestId("pvc-expand-execute"));
    await waitFor(() => expect(pvcApi.patch).toHaveBeenCalledTimes(1));

    production = true;
    releaseStorageClassGet?.(makeStorageClass());

    await view.findByTestId("pvc-expand-execution-error");
    expect(view.getByTestId("pvc-expand-execution-error")).toHaveTextContent("The execution context changed");
    expect(pvcApi.patch).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("pvc-expand-result-step")).not.toBeInTheDocument();
  });

  it("discards the dry-run approval when the size changes after passing", async () => {
    const view = render(<PvcExpandDialog />);

    openDialog();
    await walkToDryRun(view);
    expect(view.getByTestId("pvc-expand-continue-to-confirm")).not.toBeDisabled();

    fireEvent.change(view.getByTestId("pvc-expand-size-input"), { target: { value: "25Gi" }});

    expect(view.queryByTestId("pvc-expand-dry-run-passed")).not.toBeInTheDocument();
    await waitFor(() => expect(view.getByTestId("pvc-expand-continue-to-confirm")).toBeDisabled());

    fireEvent.click(view.getByTestId("pvc-expand-continue-to-confirm"));
    expect(view.queryByTestId("pvc-expand-confirm-step")).not.toBeInTheDocument();
    expect(pvcApi.patch).toHaveBeenCalledTimes(1);
  });

  it("does not patch when the PVC is deleted after the dry-run", async () => {
    pvcApi.get
      .mockResolvedValueOnce(makePvc())
      .mockResolvedValueOnce(undefined);
    storageClassApi.get
      .mockResolvedValueOnce(makeStorageClass())
      .mockResolvedValueOnce(makeStorageClass());

    const view = render(<PvcExpandDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("pvc-expand-execute"));

    await view.findByTestId("pvc-expand-execution-error");
    expect(pvcApi.patch).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("pvc-expand-result-step")).not.toBeInTheDocument();
  });

  it("revalidates the StorageClass at execution time and refuses to expand if it stopped allowing it", async () => {
    pvcApi.get
      .mockResolvedValueOnce(makePvc())
      .mockResolvedValueOnce(makePvc());
    storageClassApi.get
      .mockResolvedValueOnce(makeStorageClass())
      .mockResolvedValueOnce(makeStorageClass({ allowVolumeExpansion: false }));

    const view = render(<PvcExpandDialog />);

    openDialog();
    await walkToConfirm(view);
    fireEvent.click(view.getByTestId("pvc-expand-execute"));

    await view.findByTestId("pvc-expand-execution-error");
    expect(view.getByTestId("pvc-expand-execution-error")).toHaveTextContent("does not allow volume expansion");
    expect(pvcApi.patch).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("pvc-expand-result-step")).not.toBeInTheDocument();
  });
});
