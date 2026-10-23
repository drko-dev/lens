/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { editor, MarkerSeverity } from "monaco-editor";
import { createMonacoUri } from "../../../monaco-editor";
import type { DryRunValidationState } from "./dry-run-validation";
import { mapJsonPointerToYamlLine } from "./yaml-line-mapping";

const DRY_RUN_MARKER_OWNER = "server-dry-run";

/**
 * Reflects the latest dry-run validation result as Monaco markers on the
 * editor model for the given tab. Markers are only added for causes whose
 * JSON pointer maps reliably to a line of the current draft — locations are
 * never guessed. Any other state clears the markers.
 */
export const updateDryRunMarkers = (
  tabId: string,
  draft: string,
  validation: DryRunValidationState,
  editorMode: boolean,
): void => {
  const monacoModel = editor.getModel(createMonacoUri(tabId));

  if (!monacoModel || monacoModel.isDisposed()) {
    return;
  }

  if (!editorMode || validation.status !== "failed") {
    editor.setModelMarkers(monacoModel, DRY_RUN_MARKER_OWNER, []);

    return;
  }

  const markers: editor.IMarkerData[] = [];

  for (const cause of validation.causes ?? []) {
    if (!cause.field) {
      continue;
    }

    const location = mapJsonPointerToYamlLine(draft, cause.field);

    if (!location) {
      // No reliable line correspondence: show the field path in the banner only.
      continue;
    }

    markers.push({
      severity: MarkerSeverity.Error,
      message: cause.message,
      startLineNumber: location.line,
      startColumn: location.column,
      endLineNumber: location.line,
      endColumn: Math.max(location.column + 1, monacoModel.getLineMaxColumn(location.line)),
    });
  }

  editor.setModelMarkers(monacoModel, DRY_RUN_MARKER_OWNER, markers);
};

export const clearDryRunMarkers = (tabId: string): void => {
  const monacoModel = editor.getModel(createMonacoUri(tabId));

  if (monacoModel && !monacoModel.isDisposed()) {
    editor.setModelMarkers(monacoModel, DRY_RUN_MARKER_OWNER, []);
  }
};
