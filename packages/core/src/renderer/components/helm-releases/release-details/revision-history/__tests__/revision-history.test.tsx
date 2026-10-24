/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { observable } from "mobx";
import { getDiForUnitTesting } from "../../../../../getDiForUnitTesting";
import type { DiRender } from "../../../../test-utils/renderFor";
import { renderFor } from "../../../../test-utils/renderFor";
import type { HelmReleaseRevision } from "../../../../../../common/k8s-api/endpoints/helm-releases.api/request-history.injectable";
import { RevisionHistory } from "../revision-history";
import revisionHistoryModelInjectable from "../revision-history-model.injectable";

function revision(revisionNumber: number, overrides: Partial<HelmReleaseRevision> = {}): HelmReleaseRevision {
  return {
    revision: revisionNumber,
    updated: `2026-01-0${revisionNumber}T10:00:00Z`,
    status: "deployed",
    chart: `my-chart-${revisionNumber}.0.0`,
    app_version: `1.0.${revisionNumber}`,
    description: `Revision ${revisionNumber}`,
    ...overrides,
  };
}

function createFakeModel(revisions: HelmReleaseRevision[] = [], overrides: {
  error?: string;
  errorKind?: "permission-denied" | "error";
  isLoading?: boolean;
  isDisconnected?: boolean;
} = {}) {
  const selectedRevisionA = observable.box<number | undefined>(undefined);
  const selectedRevisionB = observable.box<number | undefined>(undefined);

  return {
    revisions: observable.box<HelmReleaseRevision[]>(revisions),
    isLoading: observable.box(Boolean(overrides.isLoading)),
    error: observable.box<string | undefined>(overrides.error),
    errorKind: observable.box<"permission-denied" | "error" | undefined>(overrides.errorKind),
    selectedRevisionA,
    selectedRevisionB,
    isDisconnected: Boolean(overrides.isDisconnected),
    get hasRevisions() {
      return revisions.length > 0;
    },
    get canCompare() {
      const a = selectedRevisionA.get();
      const b = selectedRevisionB.get();

      return a !== undefined && b !== undefined && a !== b;
    },
    load: async () => undefined,
    selectRevisionA: (value: number) => {
      selectedRevisionA.set(value);
    },
    selectRevisionB: (value: number) => {
      selectedRevisionB.set(value);
    },
    clearSelection: () => {
      selectedRevisionA.set(undefined);
      selectedRevisionB.set(undefined);
    },
  };
}

describe("RevisionHistory component", () => {
  let render: DiRender;

  const renderWith = (model: ReturnType<typeof createFakeModel>) => {
    const di = getDiForUnitTesting();

    di.override(revisionHistoryModelInjectable, () => model as never);

    render = renderFor(di);

    return render(
      <RevisionHistory targetRelease={{ name: "my-release", namespace: "default" }} />,
    );
  };

  it("loads the history on mount and starts with an empty selection", () => {
    const model = createFakeModel([revision(1)]);
    const load = jest.spyOn(model, "load");
    const clearSelection = jest.spyOn(model, "clearSelection");

    renderWith(model);

    expect(load).toHaveBeenCalledTimes(1);
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it("clears the comparison when the drawer closes and reloads the history when reopened", () => {
    const model = createFakeModel([revision(1)]);
    const load = jest.spyOn(model, "load");
    const clearSelection = jest.spyOn(model, "clearSelection");

    const { unmount } = renderWith(model);

    expect(load).toHaveBeenCalledTimes(1);
    model.selectRevisionA(1);

    unmount();

    expect(clearSelection).toHaveBeenCalledTimes(2);
    expect(model.selectedRevisionA.get()).toBeUndefined();

    renderWith(model);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("renders one row per revision with its revision, status, chart and app version", () => {
    renderWith(createFakeModel([
      revision(2),
      revision(1, { status: "superseded" }),
    ]));

    expect(screen.getByTestId("helm-revision-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("helm-revision-row-1")).toBeInTheDocument();
    expect(screen.getAllByText("deployed").length).toBe(1);
    expect(screen.getByText("superseded")).toBeInTheDocument();
    expect(screen.getByText("my-chart-2.0.0")).toBeInTheDocument();
    expect(screen.getByText("1.0.2")).toBeInTheDocument();
    expect(screen.getByText("Revision 1")).toBeInTheDocument();
  });

  it("renders the empty state when the release has no history", () => {
    renderWith(createFakeModel([]));

    expect(screen.getByTestId("helm-revision-history-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("helm-revision-row-1")).not.toBeInTheDocument();
  });

  it("renders a permission denied message when the API answers with a 403", () => {
    renderWith(createFakeModel([], {
      error: "helm releases is forbidden",
      errorKind: "permission-denied",
    }));

    expect(screen.getByTestId("helm-revision-history-error")).toBeInTheDocument();
    expect(screen.getByText(/Permission denied while listing the revision history \(RBAC 403\)/)).toBeInTheDocument();
  });

  it("renders a generic error message for any other failure", () => {
    renderWith(createFakeModel([], {
      error: "connection refused",
      errorKind: "error",
    }));

    expect(screen.getByTestId("helm-revision-history-error")).toBeInTheDocument();
    expect(screen.getByText(/The revision history could not be loaded/)).toBeInTheDocument();
  });

  it("shows the disconnected state when the cluster is not reachable", () => {
    renderWith(createFakeModel([revision(1)], { isDisconnected: true }));

    expect(screen.getByTestId("helm-revision-history-disconnected")).toBeInTheDocument();
  });

  it("selects the revisions to compare", () => {
    const model = createFakeModel([revision(2), revision(1)]);

    renderWith(model);

    fireEvent.click(screen.getByTestId("helm-revision-select-a-2"));
    fireEvent.click(screen.getByTestId("helm-revision-select-b-1"));

    expect(model.selectedRevisionA.get()).toBe(2);
    expect(model.selectedRevisionB.get()).toBe(1);
    expect(model.canCompare).toBe(true);
    expect(screen.getByTestId("helm-revision-select-a-2")).toHaveClass("selected");
    expect(screen.getByTestId("helm-revision-select-b-1")).toHaveClass("selected");
  });
});
