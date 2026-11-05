/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { editor } from "monaco-editor";
import { createMonacoUri } from "./monaco-uri";

/**
 * H7.6.3C: releases the Monaco models of one editor document (the text, undo history and markers
 * live in the model, so they are only freed by `dispose()`).
 *
 * A model is never disposed while a live editor (normal or diff) still shows it: the release is
 * remembered as pending and completed by `flushMonacoRelease` when that editor unmounts.
 */
const pendingReleases = new Set<string>();

const uriKeys = (id: string) => [createMonacoUri(id), createMonacoUri(`${id}-diff-original`)];

const isShownByLiveEditor = (uriKey: string) => (
  editor.getEditors().some((e) => e.getModel()?.uri.toString() === uriKey)
  || editor.getDiffEditors().some((d) => {
    const pair = d.getModel();

    return pair?.original.uri.toString() === uriKey || pair?.modified.uri.toString() === uriKey;
  })
);

export const isMonacoReleasePending = (id: string) => pendingReleases.has(id);

/** Completes a pending release if no live editor uses the models any more. */
export function flushMonacoRelease(id: string): boolean {
  if (!pendingReleases.has(id)) {
    return false;
  }

  const uris = uriKeys(id);

  if (uris.some((uri) => isShownByLiveEditor(uri.toString()))) {
    return false;
  }

  uris.forEach((uri) => editor.getModel(uri)?.dispose());
  pendingReleases.delete(id);

  return true;
}

/** Marks the document as released and disposes its models now, or as soon as the last editor unmounts. */
export function releaseMonacoModels(id: string): boolean {
  pendingReleases.add(id);

  return flushMonacoRelease(id);
}
