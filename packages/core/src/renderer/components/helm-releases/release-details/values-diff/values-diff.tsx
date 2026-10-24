/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./values-diff.scss";

import React, { useEffect, useLayoutEffect, useState } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../icon";
import { MonacoDiffEditor } from "../../../monaco-editor";
import { Spinner } from "../../../spinner";
import type { TargetHelmRelease } from "../target-helm-release.injectable";
import type { ValuesDiffModel } from "./values-diff-model.injectable";
import valuesDiffModelInjectable from "./values-diff-model.injectable";

export interface ValuesDiffProps {
  targetRelease: TargetHelmRelease;
}

interface Dependencies {
  model: ValuesDiffModel;
}

const NonInjectedValuesDiff = observer(({ model, targetRelease }: Dependencies & ValuesDiffProps) => {
  const isLoading = model.isLoading.get();
  const error = model.error.get();
  const valuesA = model.valuesA.get();
  const valuesB = model.valuesB.get();
  const mode = model.mode.get();
  const revisionA = model.revisionA;
  const revisionB = model.revisionB;
  const comparisonKey = `${targetRelease.namespace}/${targetRelease.name}/${revisionA}/${revisionB}/${mode}`;
  const [revealedComparison, setRevealedComparison] = useState<{ model: ValuesDiffModel; key: string }>();
  const revealValues = revealedComparison?.model === model && revealedComparison.key === comparisonKey;

  // The values are re-read whenever the selection or the mode changes.
  useEffect(() => {
    model.load();

    return () => model.clear();
  }, [model, revisionA, revisionB, mode]);

  // Hide synchronously before the next paint so a prior reveal cannot flash under new labels.
  useLayoutEffect(() => {
    setRevealedComparison(undefined);
  }, [model, comparisonKey]);

  if (!model.hasSelection) {
    return (
      <div className="values-diff values-diff-empty" data-testid="helm-values-diff-empty">
        Select two different revisions in the revision history to compare their values.
      </div>
    );
  }

  return (
    <div className="values-diff" data-testid="helm-values-diff">
      <div className="flex gaps align-center values-diff-header">
        <span>Values comparison</span>

        <div className="values-diff-modes">
          <button
            type="button"
            className={`values-diff-mode ${mode === "user-supplied" ? "selected" : ""}`}
            onClick={() => model.setMode("user-supplied")}
            aria-pressed={mode === "user-supplied"}
            data-testid="helm-values-diff-mode-user-supplied"
          >
            User-supplied
          </button>

          <button
            type="button"
            className={`values-diff-mode ${mode === "with-defaults" ? "selected" : ""}`}
            onClick={() => model.setMode("with-defaults")}
            aria-pressed={mode === "with-defaults"}
            data-testid="helm-values-diff-mode-with-defaults"
          >
            With defaults
          </button>
        </div>

        {isLoading && <Spinner />}
      </div>

      <div className="values-diff-mode-hint" data-testid="helm-values-diff-mode-hint">
        <Icon material="info" small />

        <span>
          {mode === "user-supplied"
            ? "Comparing the values supplied by the operator (helm get values)."
            : "Comparing the values including the ones computed from the chart defaults (helm get values --all)."}
        </span>
      </div>

      {!error && valuesA !== undefined && valuesB !== undefined && (
        <SensitiveValuesNotice
          reveal={revealValues}
          onToggleReveal={() => setRevealedComparison(revealValues ? undefined : { model, key: comparisonKey })}
        />
      )}

      {error && (
        <div
          className="values-diff-error"
          role="alert"
          data-testid="helm-values-diff-error">
          <Icon material="error" small />

          <span>
            The values of the selected revisions could not be loaded:
            {error}
          </span>
        </div>
      )}

      {!error && valuesA !== undefined && valuesB !== undefined && (
        revealValues
          ? (
            <MonacoDiffEditor
              id={`helm-values-diff-${targetRelease.namespace}-${targetRelease.name}`}
              original={valuesA}
              modified={valuesB}
              originalTitle={`Revision ${model.revisionA}`}
              modifiedTitle={`Revision ${model.revisionB}`}
              readOnlyOriginal
              readOnlyModified
              language="yaml"
              style={{ height: "400px" }}
              options={{ renderSideBySide: true }}
            />
          )
          : (
            <div
              className="values-diff-hidden"
              role="status"
              data-testid="helm-values-diff-hidden"
            >
              Values are hidden. Reveal them to compare; value-only changes are not shown while hidden.
            </div>
          )
      )}
    </div>
  );
});

interface SensitiveValuesNoticeProps {
  reveal: boolean;
  onToggleReveal: () => void;
}

/**
 * Helm values have no universal secret marker. Keep the whole diff hidden until the operator
 * explicitly reveals it rather than trusting key-name heuristics.
 */
const SensitiveValuesNotice = ({ reveal, onToggleReveal }: SensitiveValuesNoticeProps) => {
  return (
    <div className="values-diff-sensitive" data-testid="helm-values-diff-sensitive">
      <Icon material={reveal ? "visibility_off" : "visibility"} small />

      <span>
        {reveal
          ? "All Helm values are visible, including values that may contain credentials."
          : "All Helm values are hidden by default because credential names cannot be detected reliably."}
      </span>

      <button
        type="button"
        className="values-diff-reveal"
        onClick={onToggleReveal}
        aria-pressed={reveal}
        data-testid="helm-values-diff-reveal-toggle"
      >
        {reveal ? "Hide values" : "Reveal values"}
      </button>
    </div>
  );
};

export const ValuesDiff = withInjectables<Dependencies, ValuesDiffProps>(
  NonInjectedValuesDiff,
  {
    getProps: (di, props) => ({
      model: di.inject(valuesDiffModelInjectable, props.targetRelease),
      ...props,
    }),
  },
);
