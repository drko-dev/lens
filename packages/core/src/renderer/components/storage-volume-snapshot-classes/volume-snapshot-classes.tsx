/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./volume-snapshot-classes.scss";

import React from "react";
import { observer } from "mobx-react";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import type { VolumeSnapshotClassStore } from "./store";
import { withInjectables } from "@ogre-tools/injectable-react";
import volumeSnapshotClassStoreInjectable from "./store.injectable";

enum columnId {
  name = "name",
  driver = "driver",
  deletionPolicy = "deletion-policy",
  default = "default",
  age = "age",
}

interface Dependencies {
  volumeSnapshotClassStore: VolumeSnapshotClassStore;
}

@observer
class NonInjectedVolumeSnapshotClasses extends React.Component<Dependencies> {
  render() {
    return (
      <SiblingsInTabLayout>
        <KubeObjectListLayout
          isConfigurable
          tableId="storage_volume_snapshot_classes"
          className="VolumeSnapshotClasses"
          store={this.props.volumeSnapshotClassStore}
          sortingCallbacks={{
            [columnId.name]: sc => sc.getName(),
            [columnId.driver]: sc => sc.getDriver(),
            [columnId.deletionPolicy]: sc => sc.getDeletionPolicy(),
            [columnId.default]: sc => (sc.isDefault() ? 1 : 0),
            [columnId.age]: sc => -sc.getCreationTimestamp(),
          }}
          searchFilters={[
            sc => sc.getSearchFields(),
            sc => sc.getDriver(),
          ]}
          renderHeaderTitle="Volume Snapshot Classes"
          renderTableHeader={[
            { title: "Name", className: "name", sortBy: columnId.name, id: columnId.name },
            { className: "warning", showWithColumn: columnId.name },
            { title: "Driver", className: "driver", sortBy: columnId.driver, id: columnId.driver },
            { title: "Deletion Policy", className: "deletion-policy", sortBy: columnId.deletionPolicy, id: columnId.deletionPolicy },
            { title: "Default", className: "is-default", sortBy: columnId.default, id: columnId.default },
            { title: "Age", className: "age", sortBy: columnId.age, id: columnId.age },
          ]}
          renderTableContents={snapshotClass => [
            snapshotClass.getName(),
            <KubeObjectStatusIcon key="icon" object={snapshotClass} />,
            snapshotClass.getDriver(),
            snapshotClass.getDeletionPolicy(),
            snapshotClass.isDefault() ? "Yes" : null,
            <KubeObjectAge key="age" object={snapshotClass} />,
          ]}
        />
      </SiblingsInTabLayout>
    );
  }
}

export const VolumeSnapshotClasses = withInjectables<Dependencies>(NonInjectedVolumeSnapshotClasses, {
  getProps: (di, props) => ({
    ...props,
    volumeSnapshotClassStore: di.inject(volumeSnapshotClassStoreInjectable),
  }),
});
