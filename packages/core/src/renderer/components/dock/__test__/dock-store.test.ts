/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// H7.6.3C: closing an edit-resource tab releases its Monaco models; the global Monaco mock has no model registry.
jest.mock("../../monaco-editor/release-monaco-models", () => ({ releaseMonacoModels: jest.fn() }));

import directoryForUserDataInjectable from "../../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import hostedClusterIdInjectable from "../../../cluster-frame-context/hosted-cluster-id.injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DockStore, DockTab } from "../dock/store";
import { TabKind } from "../dock/store";
import dockStoreInjectable from "../dock/store.injectable";
import selectDockTabInjectable from "../dock/select-dock-tab.injectable";
import createLogsTabInjectable from "../logs/create-logs-tab.injectable";
import logTabStoreInjectable from "../logs/tab-store.injectable";

const initialTabs: DockTab[] = [
  { id: "terminal", kind: TabKind.TERMINAL, title: "Terminal", pinned: false },
  { id: "create", kind: TabKind.CREATE_RESOURCE, title: "Create resource", pinned: false },
  { id: "edit", kind: TabKind.EDIT_RESOURCE, title: "Edit resource", pinned: false },
  { id: "install", kind: TabKind.INSTALL_CHART, title: "Install chart", pinned: false },
  { id: "logs", kind: TabKind.POD_LOGS, title: "Logs", pinned: false },
];

describe("DockStore", () => {
  let dockStore: DockStore;
  let di: ReturnType<typeof getDiForUnitTesting>;

  beforeEach(() => {
    di = getDiForUnitTesting();

    di.override(hostedClusterIdInjectable, () => "some-cluster-id");
    di.override(directoryForUserDataInjectable, () => "some-directory-for-user-data");

    dockStore = di.inject(dockStoreInjectable);
  });

  it("closes tab and selects one from right", () => {
    dockStore.tabs = initialTabs;
    dockStore.closeTab(dockStore.tabs[0].id);

    expect(dockStore.selectedTabId).toBe("create");

    dockStore.selectTab("edit");
    dockStore.closeTab("edit");

    expect(dockStore.selectedTabId).toBe("install");
  });

  it("closes last tab and selects one from right", () => {
    dockStore.tabs = initialTabs;
    dockStore.selectTab("logs");
    dockStore.closeTab("logs");

    expect(dockStore.selectedTabId).toBe("install");
  });

  it("closes tab and selects the last one", () => {
    dockStore.tabs = [
      { id: "terminal", kind: TabKind.TERMINAL, title: "Terminal", pinned: false },
      { id: "create", kind: TabKind.CREATE_RESOURCE, title: "Create resource", pinned: false },
    ];
    dockStore.closeTab("terminal");

    expect(dockStore.selectedTabId).toBe("create");
  });

  it("closes last tab and selects none", () => {
    dockStore.tabs = [
      { id: "create", kind: TabKind.CREATE_RESOURCE, title: "Create resource", pinned: false },
    ];
    dockStore.closeTab("create");

    expect(dockStore.selectedTabId).toBeUndefined();
  });

  it("doesn't change selected tab if other tab closed", () => {
    dockStore.tabs = initialTabs;
    dockStore.closeTab("install");

    expect(dockStore.selectedTabId).toBe("terminal");
  });

  it("restores minimized dock when re-selecting logs for the same pod/container", () => {
    const createLogsTab = di.inject(createLogsTabInjectable);
    const selectDockTab = di.inject(selectDockTabInjectable);
    const logTabStore = di.inject(logTabStoreInjectable);

    const firstId = createLogsTab("Pod api-0", {
      selectedPodId: "pod-uid-1",
      namespace: "default",
      selectedContainer: "app",
    });

    expect(dockStore.isOpen).toBe(true);
    expect(dockStore.selectedTabId).toBe(firstId);
    expect(logTabStore.getData(firstId)?.selectedPodId).toBe("pod-uid-1");

    dockStore.close();
    expect(dockStore.isOpen).toBe(false);

    const secondId = createLogsTab("Pod api-0", {
      selectedPodId: "pod-uid-1",
      namespace: "default",
      selectedContainer: "app",
    });

    expect(secondId).toBe(firstId);
    expect(dockStore.isOpen).toBe(true);
    expect(dockStore.selectedTabId).toBe(firstId);

    dockStore.close();
    selectDockTab(firstId);
    expect(dockStore.isOpen).toBe(true);
  });
});
