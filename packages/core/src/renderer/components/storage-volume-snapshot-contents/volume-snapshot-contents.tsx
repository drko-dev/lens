/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./volume-snapshot-contents.scss";

import React from "react";
import { observer } from "mobx-react";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import type { VolumeSnapshotContentStore } from "./store";
import { withInjectables } from "@ogre-tools/injectable-react";
import volumeSnapshotContentStoreInjectable from "./store.injectable";

enum columnId {
  name = "name",
  driver = "driver",
  snapshotClass = "snapshot-class",
  status = "status",
  age = "age",
}

interface Dependencies {
  volumeSnapshotContentStore: VolumeSnapshotContentStore;
}

@observer
class NonInjectedVolumeSnapshotContents extends React.Component<Dependencies> {
  render() {
    return (
      <SiblingsInTabLayout>
        <KubeObjectListLayout
          isConfigurable
          tableId="storage_volume_snapshot_contents"
          className="VolumeSnapshotContents"
          store={this.props.volumeSnapshotContentStore}
          sortingCallbacks={{
            [columnId.name]: sc => sc.getName(),
            [columnId.driver]: sc => sc.getDriver(),
            [columnId.snapshotClass]: sc => sc.getSnapshotClassName(),
            [columnId.status]: sc => sc.getSnapshotPhase(),
            [columnId.age]: sc => -sc.getCreationTimestamp(),
          }}
          searchFilters={[
            sc => sc.getSearchFields(),
            sc => sc.getDriver(),
          ]}
          renderHeaderTitle="Volume Snapshot Contents"
          renderTableHeader={[
            { title: "Name", className: "name", sortBy: columnId.name, id: columnId.name },
            { className: "warning", showWithColumn: columnId.name },
            { title: "Driver", className: "driver", sortBy: columnId.driver, id: columnId.driver },
            { title: "Snapshot Class", className: "snapshot-class", sortBy: columnId.snapshotClass, id: columnId.snapshotClass },
            { title: "Status", className: "status", sortBy: columnId.status, id: columnId.status },
            { title: "Age", className: "age", sortBy: columnId.age, id: columnId.age },
          ]}
          renderTableContents={content => {
            const phase = content.getSnapshotPhase();

            return [
              content.getName(),
              <KubeObjectStatusIcon key="icon" object={content} />,
              content.getDriver(),
              content.getSnapshotClassName(),
              { title: phase, className: phase.toLowerCase() },
              <KubeObjectAge key="age" object={content} />,
            ];
          }}
        />
      </SiblingsInTabLayout>
    );
  }
}

export const VolumeSnapshotContents = withInjectables<Dependencies>(NonInjectedVolumeSnapshotContents, {
  getProps: (di, props) => ({
    ...props,
    volumeSnapshotContentStore: di.inject(volumeSnapshotContentStoreInjectable),
  }),
});
