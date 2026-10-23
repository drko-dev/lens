/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./controller-revisions.scss";

import React from "react";
import { makeObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { ControllerRevision, DaemonSet, StatefulSet } from "@openlens/kube-object";
import controllerRevisionApiInjectable from "../../../../common/k8s-api/endpoints/controller-revision.api.injectable";
import type { ControllerRevisionApi } from "../../../../common/k8s-api/endpoints";
import { DrawerTitle } from "../../drawer";
import { Icon } from "../../icon";
import { Spinner } from "../../spinner";
import { Table, TableCell, TableHead, TableRow } from "../../table";
import { getHttpStatusCodeForRolloutError } from "./errors";

export interface ControllerRevisionHistoryProps {
  workload: DaemonSet | StatefulSet;
}

interface Dependencies {
  controllerRevisionApi: ControllerRevisionApi;
}

interface ControllerRevisionRow {
  name: string;
  revision: number;
  createdAt?: string;
  changeCause?: string;
  images: string[];
  templateAvailable: boolean;
  isCurrent: boolean;
  isUpdateTarget: boolean;
}

@observer
class NonInjectedControllerRevisionHistory extends React.Component<ControllerRevisionHistoryProps & Dependencies> {
  @observable loading = true;
  @observable error?: string;
  @observable revisions: ControllerRevisionRow[] = [];
  private lastResourceVersion?: string;

  constructor(props: ControllerRevisionHistoryProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    void this.load();
  }

  componentDidUpdate(prevProps: ControllerRevisionHistoryProps) {
    const resourceVersion = this.props.workload.metadata.resourceVersion;

    if (
      prevProps.workload.getId() !== this.props.workload.getId()
      || (resourceVersion !== undefined && resourceVersion !== this.lastResourceVersion)
    ) {
      void this.load();
    }
  }

  private async load() {
    const workload = this.props.workload;

    this.lastResourceVersion = workload.metadata.resourceVersion;
    this.loading = true;
    this.error = undefined;

    try {
      const revisions = await this.props.controllerRevisionApi.list({ namespace: workload.getNs() });
      const uid = workload.metadata.uid;
      const currentRevision = (workload.status as { currentRevision?: string } | undefined)?.currentRevision;
      const updateRevision = (workload.status as { updateRevision?: string } | undefined)?.updateRevision;
      const owned = (revisions ?? []).filter(revision => (
        uid
        && revision.getNs() === workload.getNs()
        && (revision.metadata.ownerReferences ?? []).some(reference => (
          reference.uid === uid && reference.kind === workload.kind && reference.controller === true
        ))
      ));

      runInAction(() => {
        this.revisions = owned
          .map((revision: ControllerRevision) => {
            const templateAvailable = revision.getTemplate() !== undefined;

            return {
              name: revision.getName(),
              revision: revision.getRevision(),
              createdAt: revision.metadata.creationTimestamp,
              changeCause: revision.getChangeCause(),
              images: revision.getImages(),
              templateAvailable,
              isCurrent: Boolean(currentRevision) && revision.getName() === currentRevision,
              isUpdateTarget: Boolean(updateRevision) && revision.getName() === updateRevision,
            };
          })
          .sort((a, b) => b.revision - a.revision);
      });
    } catch (err) {
      runInAction(() => {
        this.error = getHttpStatusCodeForRolloutError(err) === 403
          ? `You do not have permission to list ControllerRevisions for this ${workload.kind} (RBAC 403).`
          : `Failed to load ControllerRevision history: ${(err as Error)?.message ?? String(err)}`;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  render() {
    const { workload } = this.props;
    const kind = workload.kind;

    return (
      <div
        className="ControllerRevisions"
        data-testid={`controller-revision-history-${kind.toLowerCase()}`}
        data-resource-version={workload.metadata.resourceVersion}
      >
        <DrawerTitle>Revision History</DrawerTitle>
        <div className="read-only-note">
          <Icon material="lock" small/>
          <span>
            {kind}
            {" "}
            ControllerRevision history is read-only. Rollback is currently supported for Deployments only.
          </span>
        </div>
        {this.loading && <div className="history-loading"><Spinner center/></div>}
        {!this.loading && this.error && (
          <div className="history-error" data-testid="controller-revision-error">
            <Icon material="error_outline" small/>
            <span>{this.error}</span>
          </div>
        )}
        {!this.loading && !this.error && this.revisions.length === 0 && (
          <div className="history-empty" data-testid="controller-revision-empty">
            No ControllerRevisions were found for this
            {" "}
            {kind}
            .
          </div>
        )}
        {!this.loading && !this.error && this.revisions.length > 0 && (
          <Table
            tableId={`controller-revisions-${kind.toLowerCase()}`}
            scrollable={false}
            sortable={{ revision: (row: ControllerRevisionRow) => row.revision }}
            sortByDefault={{ sortBy: "revision", orderBy: "desc" }}
            sortSyncWithUrl={false}
          >
            <TableHead flat sticky={false}>
              <TableCell className="revision" sortBy="revision">Revision</TableCell>
              <TableCell className="status">Status</TableCell>
              <TableCell className="created">Created</TableCell>
              <TableCell className="images">Images</TableCell>
              <TableCell className="change-cause">Change Cause</TableCell>
            </TableHead>
            {this.revisions.map(row => (
              <TableRow
                key={row.name}
                sortItem={row}
                nowrap>
                <TableCell className="revision">{row.revision}</TableCell>
                <TableCell className="status">
                  {row.isCurrent
                    ? <span className="revision-status current">Current</span>
                    : row.isUpdateTarget
                      ? <span className="revision-status active">Update target</span>
                      : <span className="revision-status historical">Historical</span>}
                </TableCell>
                <TableCell className="created">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="images">
                  {row.images.join(", ") || (row.templateAvailable ? "No images" : "Not available")}
                </TableCell>
                <TableCell className="change-cause">{row.changeCause ?? "—"}</TableCell>
              </TableRow>
            ))}
          </Table>
        )}
      </div>
    );
  }
}

export const ControllerRevisionHistory = withInjectables<Dependencies, ControllerRevisionHistoryProps>(NonInjectedControllerRevisionHistory, {
  getProps: (di, props) => ({
    ...props,
    controllerRevisionApi: di.inject(controllerRevisionApiInjectable),
  }),
});
