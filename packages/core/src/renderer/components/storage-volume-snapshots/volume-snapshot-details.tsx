/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./volume-snapshot-details.scss";

import React from "react";
import { observer } from "mobx-react";
import { DrawerItem, DrawerTitle } from "../drawer";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { VolumeSnapshot } from "@openlens/kube-object";
import type { Logger } from "@openlens/logger";
import { withInjectables } from "@ogre-tools/injectable-react";
import { loggerInjectionToken } from "@openlens/logger";

export interface VolumeSnapshotDetailsProps extends KubeObjectDetailsProps<VolumeSnapshot> {}

interface Dependencies {
  logger: Logger;
}

@observer
class NonInjectedVolumeSnapshotDetails extends React.Component<VolumeSnapshotDetailsProps & Dependencies> {
  render() {
    const { object: snapshot, logger } = this.props;

    if (!snapshot) {
      return null;
    }

    if (!(snapshot instanceof VolumeSnapshot)) {
      logger.error("[VolumeSnapshotDetails]: passed object that is not an instanceof VolumeSnapshot", snapshot);

      return null;
    }

    const phase = snapshot.getStatusPhase();
    const errorMessage = snapshot.getErrorMessage();

    return (
      <div className="VolumeSnapshotDetails">
        <DrawerItem name="Source PVC">
          {snapshot.spec.source.persistentVolumeClaimName ?? "-"}
        </DrawerItem>
        <DrawerItem name="Snapshot Class">
          {snapshot.getSnapshotClassName()}
        </DrawerItem>
        <DrawerItem name="Status">
          <span className={phase.toLowerCase()}>{phase}</span>
        </DrawerItem>
        <DrawerItem name="Ready to Use">
          {snapshot.isReadyToUse() ? "Yes" : "No"}
        </DrawerItem>
        <DrawerItem name="Restore Size">
          {snapshot.getRestoreSize()}
        </DrawerItem>
        {snapshot.status?.boundVolumeSnapshotContentName && (
          <DrawerItem name="Bound Content">
            {snapshot.status.boundVolumeSnapshotContentName}
          </DrawerItem>
        )}
        {snapshot.status?.creationTime && (
          <DrawerItem name="Creation Time">
            {snapshot.status.creationTime}
          </DrawerItem>
        )}
        {errorMessage && (
          <>
            <DrawerTitle>Error</DrawerTitle>
            <DrawerItem name="Message">
              {errorMessage}
            </DrawerItem>
            {snapshot.status?.error?.time && (
              <DrawerItem name="Time">
                {snapshot.status.error.time}
              </DrawerItem>
            )}
          </>
        )}
      </div>
    );
  }
}

export const VolumeSnapshotDetails = withInjectables<Dependencies, VolumeSnapshotDetailsProps>(NonInjectedVolumeSnapshotDetails, {
  getProps: (di, props) => ({
    ...props,
    logger: di.inject(loggerInjectionToken),
  }),
});
