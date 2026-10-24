/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./volume-snapshot-classes.scss";

import React from "react";
import { observer } from "mobx-react";
import startCase from "lodash/startCase";
import { DrawerItem, DrawerTitle } from "../drawer";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { VolumeSnapshotClass } from "@openlens/kube-object";
import type { Logger } from "@openlens/logger";
import { withInjectables } from "@ogre-tools/injectable-react";
import { loggerInjectionToken } from "@openlens/logger";

export interface VolumeSnapshotClassDetailsProps extends KubeObjectDetailsProps<VolumeSnapshotClass> {}

interface Dependencies {
  logger: Logger;
}

@observer
class NonInjectedVolumeSnapshotClassDetails extends React.Component<VolumeSnapshotClassDetailsProps & Dependencies> {
  render() {
    const { object: snapshotClass, logger } = this.props;

    if (!snapshotClass) {
      return null;
    }

    if (!(snapshotClass instanceof VolumeSnapshotClass)) {
      logger.error("[VolumeSnapshotClassDetails]: passed object that is not an instanceof VolumeSnapshotClass", snapshotClass);

      return null;
    }

    const { parameters } = snapshotClass;

    return (
      <div className="VolumeSnapshotClassDetails">
        <DrawerItem name="Driver">
          {snapshotClass.getDriver()}
        </DrawerItem>
        <DrawerItem name="Deletion Policy">
          {snapshotClass.getDeletionPolicy()}
        </DrawerItem>
        <DrawerItem name="Default">
          {snapshotClass.isDefault() ? "Yes" : "No"}
        </DrawerItem>
        {parameters && Object.keys(parameters).length > 0 && (
          <>
            <DrawerTitle>Parameters</DrawerTitle>
            {Object.entries(parameters).map(([name, value]) => (
              <DrawerItem key={name + value} name={startCase(name)}>
                {value}
              </DrawerItem>
            ))}
          </>
        )}
      </div>
    );
  }
}

export const VolumeSnapshotClassDetails = withInjectables<Dependencies, VolumeSnapshotClassDetailsProps>(NonInjectedVolumeSnapshotClassDetails, {
  getProps: (di, props) => ({
    ...props,
    logger: di.inject(loggerInjectionToken),
  }),
});
