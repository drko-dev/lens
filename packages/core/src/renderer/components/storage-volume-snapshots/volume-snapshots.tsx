/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./volume-snapshots.scss";

import React from "react";
import { observer } from "mobx-react";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { unitsToBytes } from "@openlens/utilities";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import type { VolumeSnapshotStore } from "./store";
import type { VolumeSnapshotClassStore } from "../storage-volume-snapshot-classes/store";
import { withInjectables } from "@ogre-tools/injectable-react";
import volumeSnapshotStoreInjectable from "./store.injectable";
import volumeSnapshotClassStoreInjectable from "../storage-volume-snapshot-classes/store.injectable";
import { NamespaceSelectBadge } from "../namespaces/namespace-select-badge";

enum columnId {
  name = "name",
  namespace = "namespace",
  source = "source",
  snapshotClass = "snapshot-class",
  status = "status",
  restoreSize = "restore-size",
  age = "age",
}

interface Dependencies {
  volumeSnapshotStore: VolumeSnapshotStore;
  volumeSnapshotClassStore: VolumeSnapshotClassStore;
}

@observer
class NonInjectedVolumeSnapshots extends React.Component<Dependencies> {
  render() {
    const { volumeSnapshotStore, volumeSnapshotClassStore } = this.props;

    return (
      <SiblingsInTabLayout>
        <KubeObjectListLayout
          isConfigurable
          tableId="storage_volume_snapshots"
          className="VolumeSnapshots"
          store={volumeSnapshotStore}
          dependentStores={[volumeSnapshotClassStore]}
          sortingCallbacks={{
            [columnId.name]: snapshot => snapshot.getName(),
            [columnId.namespace]: snapshot => snapshot.getNs(),
            [columnId.source]: snapshot => snapshot.getSourceName(),
            [columnId.snapshotClass]: snapshot => snapshot.getSnapshotClassName(),
            [columnId.status]: snapshot => snapshot.getStatusPhase(),
            [columnId.restoreSize]: snapshot => unitsToBytes(snapshot.getRestoreSize()),
            [columnId.age]: snapshot => -snapshot.getCreationTimestamp(),
          }}
          searchFilters={[
            snapshot => snapshot.getSearchFields(),
            snapshot => snapshot.getSourceName(),
            snapshot => snapshot.getSnapshotClassName(),
          ]}
          renderHeaderTitle="Volume Snapshots"
          renderTableHeader={[
            { title: "Name", className: "name", sortBy: columnId.name, id: columnId.name },
            { className: "warning", showWithColumn: columnId.name },
            { title: "Namespace", className: "namespace", sortBy: columnId.namespace, id: columnId.namespace },
            { title: "Source", className: "source", sortBy: columnId.source, id: columnId.source },
            { title: "Snapshot Class", className: "snapshot-class", sortBy: columnId.snapshotClass, id: columnId.snapshotClass },
            { title: "Status", className: "status", sortBy: columnId.status, id: columnId.status },
            { title: "Restore Size", className: "restore-size", sortBy: columnId.restoreSize, id: columnId.restoreSize },
            { title: "Age", className: "age", sortBy: columnId.age, id: columnId.age },
          ]}
          renderTableContents={snapshot => {
            const phase = snapshot.getStatusPhase();

            return [
              snapshot.getName(),
              <KubeObjectStatusIcon key="icon" object={snapshot} />,
              <NamespaceSelectBadge key="namespace" namespace={snapshot.getNs()} />,
              snapshot.getSourceName(),
              snapshot.getSnapshotClassName(),
              { title: phase, className: phase.toLowerCase() },
              snapshot.getRestoreSize(),
              <KubeObjectAge key="age" object={snapshot} />,
            ];
          }}
        />
      </SiblingsInTabLayout>
    );
  }
}

export const VolumeSnapshots = withInjectables<Dependencies>(NonInjectedVolumeSnapshots, {
  getProps: (di, props) => ({
    ...props,
    volumeSnapshotStore: di.inject(volumeSnapshotStoreInjectable),
    volumeSnapshotClassStore: di.inject(volumeSnapshotClassStoreInjectable),
  }),
});
