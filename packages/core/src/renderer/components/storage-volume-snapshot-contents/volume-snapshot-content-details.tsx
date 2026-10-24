/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./volume-snapshot-contents.scss";

import React from "react";
import { observer } from "mobx-react";
import { DrawerItem, DrawerTitle } from "../drawer";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { VolumeSnapshotContent } from "@openlens/kube-object";
import type { Logger } from "@openlens/logger";
import { withInjectables } from "@ogre-tools/injectable-react";
import { loggerInjectionToken } from "@openlens/logger";

export interface VolumeSnapshotContentDetailsProps extends KubeObjectDetailsProps<VolumeSnapshotContent> {}

interface Dependencies {
  logger: Logger;
}

@observer
class NonInjectedVolumeSnapshotContentDetails extends React.Component<VolumeSnapshotContentDetailsProps & Dependencies> {
  render() {
    const { object: content, logger } = this.props;

    if (!content) {
      return null;
    }

    if (!(content instanceof VolumeSnapshotContent)) {
      logger.error("[VolumeSnapshotContentDetails]: passed object that is not an instanceof VolumeSnapshotContent", content);

      return null;
    }

    const phase = content.getSnapshotPhase();
    const volumeSnapshotRef = content.spec?.volumeSnapshotRef;
    const errorMessage = content.status?.error?.message;

    return (
      <div className="VolumeSnapshotContentDetails">
        <DrawerItem name="Driver">
          {content.getDriver()}
        </DrawerItem>
        <DrawerItem name="Snapshot Class">
          {content.getSnapshotClassName()}
        </DrawerItem>
        <DrawerItem name="Deletion Policy">
          {content.getDeletionPolicy()}
        </DrawerItem>
        <DrawerItem name="Provisioned From">
          {content.getSourceType() === "-" ? "Unknown" : content.getSourceType()}
        </DrawerItem>
        <DrawerItem name="Status">
          <span className={phase.toLowerCase()}>{phase}</span>
        </DrawerItem>
        <DrawerItem name="Ready to Use">
          {content.isReadyToUse() ? "Yes" : "No"}
        </DrawerItem>
        <DrawerItem name="Restore Size">
          {content.getRestoreSize()}
        </DrawerItem>
        {volumeSnapshotRef && (
          <>
            <DrawerTitle>Volume Snapshot Reference</DrawerTitle>
            <DrawerItem name="Name">
              {volumeSnapshotRef.name ?? "-"}
            </DrawerItem>
            <DrawerItem name="Namespace">
              {volumeSnapshotRef.namespace ?? "-"}
            </DrawerItem>
          </>
        )}
        {errorMessage && (
          <>
            <DrawerTitle>Error</DrawerTitle>
            <DrawerItem name="Message">
              {errorMessage}
            </DrawerItem>
            {content.status?.error?.time && (
              <DrawerItem name="Time">
                {content.status.error.time}
              </DrawerItem>
            )}
          </>
        )}
      </div>
    );
  }
}

export const VolumeSnapshotContentDetails = withInjectables<Dependencies, VolumeSnapshotContentDetailsProps>(NonInjectedVolumeSnapshotContentDetails, {
  getProps: (di, props) => ({
    ...props,
    logger: di.inject(loggerInjectionToken),
  }),
});
