/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useEffect, useState } from "react";
import type { KubeObjectMenuProps } from "../kube-object-menu";
import type { PersistentVolumeClaim } from "@openlens/kube-object";
import type { IComputedValue } from "mobx";
import { MenuItem } from "../menu";
import { Icon } from "../icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { Cluster } from "../../../common/cluster/cluster";
import { shouldShowResourceInjectionToken } from "../../../features/cluster/showing-kube-resources/common/allowed-resources-injection-token";
import type { OpenPvcExpandDialog } from "./expand-pvc/open.injectable";
import openPvcExpandDialogInjectable from "./expand-pvc/open.injectable";
import type { OpenCreateVolumeSnapshotDialog } from "./create-snapshot/open.injectable";
import openCreateVolumeSnapshotDialogInjectable from "./create-snapshot/open.injectable";
import type { PvcExpansionCapability, PvcExpansionCapabilityResolver } from "./pvc-expansion-capability.injectable";
import pvcExpansionCapabilityInjectable from "./pvc-expansion-capability.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";

export interface VolumeClaimMenuProps extends KubeObjectMenuProps<PersistentVolumeClaim> {}

interface Dependencies {
  openPvcExpandDialog: OpenPvcExpandDialog;
  openCreateVolumeSnapshotDialog: OpenCreateVolumeSnapshotDialog;
  snapshotsAreAllowed: IComputedValue<boolean>;
  expansionCapability: PvcExpansionCapabilityResolver;
  hostedCluster: Cluster | undefined;
}

const expansionDisabledReason = {
  denied: "The PVC's StorageClass does not allow volume expansion.",
  unknown: "Waiting for confirmation that this cluster's StorageClass allows volume expansion.",
  forbidden: "Reading the PVC's StorageClass is forbidden (RBAC 403).",
  unreachable: "The cluster is unreachable. Reconnect before expanding PVCs.",
} as const;

const NonInjectedVolumeClaimMenu = ({
  object,
  toolbar,
  openPvcExpandDialog,
  openCreateVolumeSnapshotDialog,
  snapshotsAreAllowed,
  expansionCapability,
  hostedCluster,
}: Dependencies & VolumeClaimMenuProps) => {
  const clusterId = hostedCluster?.id ?? "unknown";
  // Strictly Bound: an absent/unknown phase (Pending, Lost, Terminating with
  // no phase…) must never be treated as Bound. Without a bound volume there is
  // nothing to expand through the storage driver.
  const isBound = object.status?.phase === "Bound";
  const expansionLeavesPendingPhase = object.status?.phase === "Pending";
  const [expansionCapabilityState, setExpansionCapabilityState] = useState<PvcExpansionCapability>("unknown");

  useEffect(() => {
    let current = true;

    void expansionCapability(clusterId, object.spec.storageClassName).then(capability => {
      if (current) {
        setExpansionCapabilityState(capability);
      }
    });

    return () => {
      current = false;
    };
    // The PVC identity bounds the re-check: menu instances are per-object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.getId(), clusterId]);

  const expandDisabled = !isBound
    || expansionLeavesPendingPhase
    || expansionCapabilityState !== "allowed";

  return (
    <>
      {snapshotsAreAllowed.get() && (
        <MenuItem
          data-testid="volume-claim-menu-create-snapshot"
          onClick={() => openCreateVolumeSnapshotDialog({ pvc: object })}
        >
          <Icon
            material="photo_camera"
            tooltip="Create VolumeSnapshot"
            interactive={toolbar}
          />
          <span className="title">Create VolumeSnapshot…</span>
        </MenuItem>
      )}
      <MenuItem
        data-testid="volume-claim-menu-expand"
        disabled={expandDisabled}
        title={expandDisabled
          ? (!isBound || expansionLeavesPendingPhase
            ? "The PVC is not bound yet."
            : (expansionDisabledReason as Record<PvcExpansionCapability, string>)[expansionCapabilityState])
          : undefined}
        onClick={() => {
          if (!expandDisabled) {
            openPvcExpandDialog({ pvc: object });
          }
        }}
      >
        <Icon
          material="open_in_full"
          tooltip={expandDisabled ? "Expand PVC unavailable" : "Expand PVC"}
          interactive={toolbar}
        />
        <span className="title">Expand PVC…</span>
      </MenuItem>
    </>
  );
};

export const VolumeClaimMenu = withInjectables<Dependencies, VolumeClaimMenuProps>(NonInjectedVolumeClaimMenu, {
  getProps: (di, props) => ({
    ...props,
    openPvcExpandDialog: di.inject(openPvcExpandDialogInjectable),
    openCreateVolumeSnapshotDialog: di.inject(openCreateVolumeSnapshotDialogInjectable),
    snapshotsAreAllowed: di.inject(shouldShowResourceInjectionToken, {
      apiName: "volumesnapshots",
      group: "snapshot.storage.k8s.io",
    }),
    expansionCapability: di.inject(pvcExpansionCapabilityInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
});
