/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./revision-history.scss";

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Badge } from "../../../badge";
import { Icon } from "../../../icon";
import { Spinner } from "../../../spinner";
import { Table, TableCell, TableHead, TableRow } from "../../../table";
import { kebabCase } from "lodash/fp";
import type { TargetHelmRelease } from "../target-helm-release.injectable";
import type { RevisionHistoryModel } from "./revision-history-model.injectable";
import revisionHistoryModelInjectable from "./revision-history-model.injectable";

export interface RevisionHistoryProps {
  targetRelease: TargetHelmRelease;
}

interface Dependencies {
  model: RevisionHistoryModel;
}

const NonInjectedRevisionHistory = observer(({ model }: Dependencies & RevisionHistoryProps) => {
  // Every time the section is mounted (drawer opened) the history is loaded again and the
  // comparison selection starts empty: the state of a previous session must never leak into it.
  // The load itself invalidates any response that was still in flight.
  useEffect(() => {
    model.clearSelection();
    model.load();

    return () => model.clearSelection();
  }, [model]);

  const revisions = model.revisions.get();
  const isLoading = model.isLoading.get();
  const error = model.error.get();
  const errorKind = model.errorKind.get();
  const selectedA = model.selectedRevisionA.get();
  const selectedB = model.selectedRevisionB.get();

  return (
    <div className="revision-history" data-testid="helm-revision-history">
      <div className="flex gaps align-center revision-history-header">
        <span>Revision history</span>

        {isLoading && <Spinner />}

        {model.isDisconnected && (
          <Badge
            label="Cluster disconnected"
            className="disconnected"
            data-testid="helm-revision-history-disconnected"
          />
        )}
      </div>

      {error && (
        <div
          className="revision-history-error"
          role="alert"
          data-testid="helm-revision-history-error">
          <Icon material={errorKind === "permission-denied" ? "error" : "warning"} small />

          <span>
            {errorKind === "permission-denied"
              ? "Permission denied while listing the revision history (RBAC 403)."
              : "The revision history could not be loaded."}
            {" "}
            {error}
          </span>
        </div>
      )}

      {!error && !isLoading && !model.hasRevisions && (
        <div className="revision-history-empty" data-testid="helm-revision-history-empty">
          This release has no revision history.
        </div>
      )}

      {revisions.length > 0 && (
        <Table className="revision-history-table" scrollable={false}>
          <TableHead sticky={false}>
            <TableCell className="revision">Rev</TableCell>
            <TableCell className="updated">Updated</TableCell>
            <TableCell className="status">Status</TableCell>
            <TableCell className="chart">Chart</TableCell>
            <TableCell className="app-version">App version</TableCell>
            <TableCell className="description">Description</TableCell>
            <TableCell className="compare">Compare</TableCell>
          </TableHead>

          {revisions.map((revision) => (
            <TableRow key={revision.revision} data-testid={`helm-revision-row-${revision.revision}`}>
              <TableCell className="revision">{revision.revision}</TableCell>
              <TableCell className="updated">{revision.updated}</TableCell>
              <TableCell className="status">
                <Badge label={revision.status} className={kebabCase(revision.status)} />
              </TableCell>
              <TableCell className="chart">{revision.chart}</TableCell>
              <TableCell className="app-version">{revision.app_version}</TableCell>
              <TableCell className="description">{revision.description}</TableCell>
              <TableCell className="compare">
                <button
                  type="button"
                  className={`compare-button ${selectedA === revision.revision ? "selected" : ""}`}
                  onClick={() => model.selectRevisionA(revision.revision)}
                  aria-label={`Select revision ${revision.revision} as A`}
                  aria-pressed={selectedA === revision.revision}
                  data-testid={`helm-revision-select-a-${revision.revision}`}
                >
                  A
                </button>

                <button
                  type="button"
                  className={`compare-button ${selectedB === revision.revision ? "selected" : ""}`}
                  onClick={() => model.selectRevisionB(revision.revision)}
                  aria-label={`Select revision ${revision.revision} as B`}
                  aria-pressed={selectedB === revision.revision}
                  data-testid={`helm-revision-select-b-${revision.revision}`}
                >
                  B
                </button>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </div>
  );
});

export const RevisionHistory = withInjectables<Dependencies, RevisionHistoryProps>(
  NonInjectedRevisionHistory,
  {
    getProps: (di, props) => ({
      model: di.inject(revisionHistoryModelInjectable, props.targetRelease),
      ...props,
    }),
  },
);
