/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Uri } from "monaco-editor";

export type MonacoEditorId = string;

export function createMonacoUri(id: MonacoEditorId): Uri {
  return Uri.file(`/monaco-editor/${id}`);
}
