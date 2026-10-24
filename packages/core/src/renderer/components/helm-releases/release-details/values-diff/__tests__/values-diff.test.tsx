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
import { ValuesDiff } from "../values-diff";
import valuesDiffModelInjectable from "../values-diff-model.injectable";

jest.mock("../../../../monaco-editor/monaco-diff-editor", () => require("../../../../monaco-editor/__mocks__/monaco-editor"));

function createFakeModel(options: {
  revisionA?: number;
  revisionB?: number;
  valuesA?: string;
  valuesB?: string;
  error?: string;
  isLoading?: boolean;
} = {}) {
  const mode = observable.box<"user-supplied" | "with-defaults">("user-supplied");
  const valuesA = observable.box<string | undefined>(options.valuesA);
  const valuesB = observable.box<string | undefined>(options.valuesB);
  const isLoading = observable.box(Boolean(options.isLoading));
  const error = observable.box<string | undefined>(options.error);

  const hasSelection = options.revisionA !== undefined && options.revisionB !== undefined;

  return {
    isLoading,
    error,
    valuesA,
    valuesB,
    mode,
    get isReady() {
      return !isLoading.get() && error.get() === undefined && valuesA.get() !== undefined;
    },
    get hasSelection() {
      return hasSelection;
    },
    get revisionA() {
      return options.revisionA;
    },
    get revisionB() {
      return options.revisionB;
    },
    setMode: (value: "user-supplied" | "with-defaults") => mode.set(value),
    load: async () => undefined,
    clear: () => undefined,
  };
}

describe("ValuesDiff component", () => {
  let render: DiRender;

  const renderWith = (model: ReturnType<typeof createFakeModel>) => {
    const di = getDiForUnitTesting();

    di.override(valuesDiffModelInjectable, () => model as never);

    render = renderFor(di);

    return render(
      <ValuesDiff targetRelease={{ name: "my-release", namespace: "default" }} />,
    );
  };

  it("loads the values of the selection on mount", () => {
    const model = createFakeModel({ revisionA: 2, revisionB: 1 });
    const load = jest.spyOn(model, "load");

    renderWith(model);

    expect(load).toHaveBeenCalled();
  });

  it("clears values when the release drawer closes", () => {
    const model = createFakeModel({ revisionA: 2, revisionB: 1 });
    const clear = jest.spyOn(model, "clear");

    const { unmount } = renderWith(model);

    unmount();

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("loads the values again and hides sensitive ones when the comparison changes", () => {
    const model = createFakeModel({
      revisionA: 2,
      revisionB: 1,
      valuesA: "token: abc\n",
      valuesB: "token: def\n",
    });
    const load = jest.spyOn(model, "load");

    renderWith(model);

    const callsAfterMount = load.mock.calls.length;

    fireEvent.click(screen.getByTestId("helm-values-diff-reveal-toggle"));
    expect(screen.getByTestId("helm-values-diff-reveal-toggle")).toHaveTextContent("Hide values");

    fireEvent.click(screen.getByTestId("helm-values-diff-mode-with-defaults"));

    // Changing the comparison hides the sensitive values again
    expect(screen.getByTestId("helm-values-diff-reveal-toggle")).toHaveTextContent("Reveal values");
    expect(load.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("asks for two revisions before comparing anything", () => {
    renderWith(createFakeModel());

    expect(screen.getByTestId("helm-values-diff-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("helm-values-diff")).not.toBeInTheDocument();
  });

  it("shows both revisions side by side with their revision number", () => {
    const fakeModel = createFakeModel({
      revisionA: 3,
      revisionB: 1,
      valuesA: "replicaCount: 1\n",
      valuesB: "replicaCount: 2\n",
    });

    renderWith(fakeModel);

    expect(screen.getByTestId("helm-values-diff")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("helm-values-diff-reveal-toggle"));
    expect(screen.getByTestId("diff-original-title")).toHaveTextContent("Revision 3");
    expect(screen.getByTestId("diff-modified-title")).toHaveTextContent("Revision 1");
    expect(screen.getByTestId("monaco-diff-original-for-helm-values-diff-default-my-release")).toHaveValue("replicaCount: 1\n");
    expect(screen.getByTestId("monaco-diff-modified-for-helm-values-diff-default-my-release")).toHaveValue("replicaCount: 2\n");
  });

  it("states explicitly which flavour of the values is being compared", () => {
    renderWith(createFakeModel({
      revisionA: 2,
      revisionB: 1,
      valuesA: "a: 1\n",
      valuesB: "a: 2\n",
    }));

    expect(screen.getByTestId("helm-values-diff-mode-hint")).toHaveTextContent("values supplied by the operator");

    fireEvent.click(screen.getByTestId("helm-values-diff-mode-with-defaults"));

    expect(screen.getByTestId("helm-values-diff-mode-hint")).toHaveTextContent("computed from the chart defaults");
  });

  it("hides all values by default and reveals raw values only on demand", () => {
    renderWith(createFakeModel({
      revisionA: 2,
      revisionB: 1,
      valuesA: "deploymentAlias: hunter2\n",
      valuesB: "deploymentAlias: corrected-horse\n",
    }));

    expect(screen.getByTestId("helm-values-diff-sensitive")).toHaveTextContent("cannot be detected reliably");
    expect(screen.getByTestId("helm-values-diff-hidden")).toBeInTheDocument();
    expect(screen.queryByTestId("monaco-diff-original-for-helm-values-diff-default-my-release")).not.toBeInTheDocument();
    expect(screen.queryByText(/hunter2|corrected-horse/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("helm-values-diff-reveal-toggle"));

    expect(screen.getByTestId("monaco-diff-original-for-helm-values-diff-default-my-release")).toHaveValue("deploymentAlias: hunter2\n");
    expect(screen.getByTestId("helm-values-diff-reveal-toggle")).toHaveTextContent("Hide values");
  });

  it("keeps all values hidden even when the key looks harmless", () => {
    renderWith(createFakeModel({
      revisionA: 2,
      revisionB: 1,
      valuesA: "replicaCount: 1\n",
      valuesB: "replicaCount: 2\n",
    }));

    expect(screen.getByTestId("helm-values-diff-hidden")).toBeInTheDocument();
    expect(screen.queryByText(/replicaCount/)).not.toBeInTheDocument();
  });

  it("reports an error when the values cannot be loaded", () => {
    renderWith(createFakeModel({
      revisionA: 2,
      revisionB: 1,
      error: "release: not found",
    }));

    expect(screen.getByTestId("helm-values-diff-error")).toHaveTextContent("release: not found");
  });
});
