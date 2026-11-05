/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { TabId } from "../dock/store";
import editResourceTabStoreInjectable from "./store.injectable";
import { releaseMonacoModels } from "../../monaco-editor/release-monaco-models";

const clearEditResourceTabDataInjectable = getInjectable({
  id: "clear-edit-resource-tab",

  instantiate: (di) => {
    const editResourceTabStore = di.inject(editResourceTabStoreInjectable);

    return (tabId: TabId) => {
      editResourceTabStore.clearData(tabId);
      // H7.6.3C: closing the document frees its Monaco models (text, undo history); deferred while an editor still shows them
      releaseMonacoModels(tabId);
    };
  },
});

export default clearEditResourceTabDataInjectable;
