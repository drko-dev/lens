/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { computed } from "mobx";
import { PersistentVolumeClaim } from "@openlens/kube-object";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import pvcApiInjectable from "../../../common/k8s-api/endpoints/persistent-volume-claim.api.injectable";
import isProductionClusterInjectable from "../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { shouldShowResourceInjectionToken } from "../../../features/cluster/showing-kube-resources/common/allowed-resources-injection-token";
import { VolumeClaimMenu } from "./volume-claim-menu";
import type { PvcExpansionCapability, PvcExpansionCapabilityResolver } from "./pvc-expansion-capability.injectable";
import pvcExpansionCapabilityInjectable from "./pvc-expansion-capability.injectable";
import { MenuContext } from "../menu/menu";
import type { OpenPvcExpandDialog } from "./expand-pvc/open.injectable";
import openPvcExpandDialogInjectable from "./expand-pvc/open.injectable";
import type { OpenCreateVolumeSnapshotDialog } from "./create-snapshot/open.injectable";
import openCreateVolumeSnapshotDialogInjectable from "./create-snapshot/open.injectable";

const makePvc = (options: { phase?: string; storageClassName?: string } = {}) => new PersistentVolumeClaim({
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
    storageClassName: options.storageClassName ?? "standard",
  },
  status: { phase: options.phase ?? "Bound" },
} as never);

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => { resolvePromise = resolve; });

  return {
    promise,
    resolve: (value: T) => {
      if (!resolvePromise) {
        throw new Error("Deferred promise was not initialized.");
      }

      resolvePromise(value);
    },
  };
}

describe("VolumeClaimMenu", () => {
  let di: DiContainer;
  let openExpand: jest.Mock;
  let openSnapshot: jest.Mock;
  let expansionCapability: jest.Mock<Promise<PvcExpansionCapability>>;
  let volumesnapshotsShown: boolean;
  let cluster: { id: string; name: { get: () => string }};

  beforeEach(() => {
    openExpand = jest.fn();
    openSnapshot = jest.fn();
    expansionCapability = jest.fn(async () => "allowed" as PvcExpansionCapability);
    volumesnapshotsShown = true;
    cluster = { id: "cluster-1", name: { get: () => "test" }};

    di = getDiForUnitTesting();
    di.override(pvcApiInjectable, () => ({ get: jest.fn() }) as never);
    di.override(openPvcExpandDialogInjectable, () => openExpand as OpenPvcExpandDialog);
    di.override(openCreateVolumeSnapshotDialogInjectable, () => openSnapshot as OpenCreateVolumeSnapshotDialog);
    di.override(isProductionClusterInjectable, () => computed(() => false));
    di.override(hostedClusterInjectable, () => cluster as never);
    di.override(shouldShowResourceInjectionToken, (di2, param) => {
      void di2;
      const visible = (param as { apiName: string }).apiName === "volumesnapshots"
        ? volumesnapshotsShown
        : true;

      return computed(() => visible);
    });
    di.override(pvcExpansionCapabilityInjectable, () => expansionCapability as PvcExpansionCapabilityResolver);
  });

  const renderMenu = (pvc: PersistentVolumeClaim) => renderFor(di)(
    <MenuContext.Provider
      value={{
        props: { open: jest.fn(), close: jest.fn(), closeOnClickItem: false },
        close: jest.fn(),
      }}
    >
      <VolumeClaimMenu object={pvc} toolbar={false}/>
    </MenuContext.Provider>,
  );

  it("shows the Create VolumeSnapshot action when the cluster exposes the volumesnapshots API", () => {
    const { getByTestId } = renderMenu(makePvc());

    expect(getByTestId("volume-claim-menu-create-snapshot")).toBeInTheDocument();
  });

  it("hides the Create VolumeSnapshot action when the cluster does not expose the volumesnapshots API", () => {
    volumesnapshotsShown = false;

    const { queryByTestId } = renderMenu(makePvc());

    expect(queryByTestId("volume-claim-menu-create-snapshot")).not.toBeInTheDocument();
    expect(openSnapshot).not.toHaveBeenCalled();
  });

  it("opens the expand dialog once the StorageClass capability is confirmed expandable", async () => {
    const pvc = makePvc();
    const { getByTestId } = renderMenu(pvc);

    await waitFor(() => expect(getByTestId("volume-claim-menu-expand")).not.toHaveClass("disabled"));

    fireEvent.click(getByTestId("volume-claim-menu-expand"));

    expect(openExpand).toHaveBeenCalledWith({ pvc });
  });

  it("resolves the capability with the cluster id of the active cluster", () => {
    renderMenu(makePvc());

    expect(expansionCapability).toHaveBeenCalledWith("cluster-1", "standard");
  });

  it("disables Expand PVC while the StorageClass capability is not confirmed yet", () => {
    const deferred = createDeferred<PvcExpansionCapability>();

    expansionCapability.mockReturnValue(deferred.promise);

    const { getByTestId } = renderMenu(makePvc());

    expect(getByTestId("volume-claim-menu-expand")).toHaveClass("disabled");
    expect(getByTestId("volume-claim-menu-expand")).toHaveAttribute("title", expect.stringContaining("Waiting for confirmation"));

    fireEvent.click(getByTestId("volume-claim-menu-expand"));
    expect(openExpand).not.toHaveBeenCalled();
  });

  it("disables Expand PVC when the StorageClass does not allow expansion", async () => {
    expansionCapability.mockResolvedValue("denied");
    const { getByTestId } = renderMenu(makePvc());

    await waitFor(() => expect(getByTestId("volume-claim-menu-expand")).toHaveClass("disabled"));
    expect(getByTestId("volume-claim-menu-expand")).toHaveAttribute("title", expect.stringContaining("does not allow volume expansion"));

    fireEvent.click(getByTestId("volume-claim-menu-expand"));
    expect(openExpand).not.toHaveBeenCalled();
  });

  it("disables Expand PVC when reading the StorageClass is forbidden", async () => {
    expansionCapability.mockResolvedValue("forbidden");
    const { getByTestId } = renderMenu(makePvc());

    await waitFor(() => expect(getByTestId("volume-claim-menu-expand")).toHaveClass("disabled"));
    expect(getByTestId("volume-claim-menu-expand")).toHaveAttribute("title", expect.stringContaining("403"));
  });

  it("disables Expand PVC when a PVC is not bound yet", async () => {
    const { getByTestId } = renderMenu(makePvc({ phase: "Pending" }));

    await waitFor(() => expect(getByTestId("volume-claim-menu-expand")).toHaveClass("disabled"));
    expect(getByTestId("volume-claim-menu-expand")).toHaveAttribute("title", expect.stringContaining("not bound"));
    expect(openExpand).not.toHaveBeenCalled();
  });

  it("disables Expand PVC when the PVC phase is missing — unknown is not Bound", async () => {
    expansionCapability.mockResolvedValue("allowed");
    const { getByTestId } = renderMenu(new PersistentVolumeClaim({
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
        resources: { requests: { storage: "10Gi" }},
        storageClassName: "standard",
      },
    } as never));

    await waitFor(() => expect(getByTestId("volume-claim-menu-expand")).toHaveClass("disabled"));
    expect(getByTestId("volume-claim-menu-expand")).toHaveAttribute("title", expect.stringContaining("not bound"));
    expect(openExpand).not.toHaveBeenCalled();
  });

  it("disables Expand PVC for phase Lost even when the StorageClass allows expansion", async () => {
    expansionCapability.mockResolvedValue("allowed");
    const { getByTestId } = renderMenu(makePvc({ phase: "Lost" }));

    await waitFor(() => expect(getByTestId("volume-claim-menu-expand")).toHaveClass("disabled"));
    expect(getByTestId("volume-claim-menu-expand")).toHaveAttribute("title", expect.stringContaining("not bound"));
    expect(openExpand).not.toHaveBeenCalled();
  });
});
