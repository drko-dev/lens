/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { observable } from "mobx";
import "@testing-library/jest-dom";
import { EditResourceModel } from "../edit-resource/edit-resource-model/edit-resource-model.injectable";
import { ClusterContextMismatchError } from "../../../../common/workspace/tool-context";
import { LogStore } from "../logs/store";
import { TerminalWindow } from "../terminal/view";
import { DockTab } from "../dock-tab";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import workspaceTabsFeatureFlagInjectable from "../../../../features/workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import terminalStoreInjectable from "../terminal/store.injectable";
import callForLogsInjectable from "../logs/call-for-logs.injectable";
import { TabKind } from "../dock/store";

describe("OpenLens DevOps R4-04: Workspace Tools Context & Security Suite", () => {
  describe("EditResourceModel: Cluster Context Guard & Cross-Cluster Prevention", () => {
    const createMockCluster = (id: string, name: string, env: string) => ({
      id,
      name,
      preferences: {
        clusterAlias: name,
        clusterEnvironment: env,
      },
    } as any);

    it("binds authoritative cluster context from hosted cluster", () => {
      const devCluster = createMockCluster("cluster-dev-123", "minikube-dev", "dev");
      const model = new EditResourceModel({
        requestKubeResource: jest.fn(),
        requestPatchKubeResource: jest.fn(),
        requestReplaceKubeResource: jest.fn(),
        showSuccessNotification: jest.fn(),
        showErrorNotification: jest.fn(),
        store: { getData: () => observable.box(undefined) } as any,
        tabId: "tab-edit-1",
        waitForEditingResource: (async () => undefined) as any,
        hostedCluster: devCluster,
      });

      expect(model.clusterId).toBe("cluster-dev-123");
      expect(model.clusterName).toBe("minikube-dev");
      expect(model.environment).toBe("development");
      expect(model.isProduction).toBe(false);
    });

    it("correctly flags production cluster and hazard styling identity", () => {
      const prodCluster = createMockCluster("cluster-prod-999", "aws-prod-eks", "prod");
      const model = new EditResourceModel({
        requestKubeResource: jest.fn(),
        requestPatchKubeResource: jest.fn(),
        requestReplaceKubeResource: jest.fn(),
        showSuccessNotification: jest.fn(),
        showErrorNotification: jest.fn(),
        store: { getData: () => observable.box(undefined) } as any,
        tabId: "tab-edit-prod",
        waitForEditingResource: (async () => undefined) as any,
        hostedCluster: prodCluster,
      });

      expect(model.clusterId).toBe("cluster-prod-999");
      expect(model.environment).toBe("production");
      expect(model.isProduction).toBe(true);
    });

    it("aborts save fail-closed if actual hosted cluster mismatches bound cluster identity", async () => {
      const boundCluster = createMockCluster("cluster-dev-123", "minikube-dev", "dev");
      const hijackedCluster = createMockCluster("cluster-prod-999", "aws-prod-eks", "prod");

      const mockDeps: any = {
        requestKubeResource: jest.fn(),
        requestPatchKubeResource: jest.fn(),
        requestReplaceKubeResource: jest.fn(),
        showSuccessNotification: jest.fn(),
        showErrorNotification: jest.fn(),
        store: { getData: () => observable.box(undefined) },
        tabId: "tab-edit-1",
        waitForEditingResource: async () => undefined,
        hostedCluster: boundCluster,
      };

      const model = new EditResourceModel(mockDeps);

      // Simulate a context hijacking / race condition where underlying cluster changes before save
      mockDeps.hostedCluster = hijackedCluster;

      await expect(model.save()).rejects.toThrow(ClusterContextMismatchError);
      expect(mockDeps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(mockDeps.requestPatchKubeResource).not.toHaveBeenCalled();
    });

    it("aborts save fail-closed if hostedCluster is undefined", async () => {
      const boundCluster = createMockCluster("cluster-dev-123", "minikube-dev", "dev");
      const mockDeps: any = {
        requestKubeResource: jest.fn(),
        requestPatchKubeResource: jest.fn(),
        requestReplaceKubeResource: jest.fn(),
        showSuccessNotification: jest.fn(),
        showErrorNotification: jest.fn(),
        store: { getData: () => observable.box(undefined) },
        tabId: "tab-edit-undef",
        waitForEditingResource: async () => undefined,
        hostedCluster: boundCluster,
      };

      const model = new EditResourceModel(mockDeps);

      // Remove hostedCluster before save
      mockDeps.hostedCluster = undefined;

      await expect(model.save()).rejects.toThrow(ClusterContextMismatchError);
      expect(mockDeps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(mockDeps.requestPatchKubeResource).not.toHaveBeenCalled();
    });

    it("aborts save fail-closed if clusterId is unknown or unbound", async () => {
      const mockDeps: any = {
        requestKubeResource: jest.fn(),
        requestPatchKubeResource: jest.fn(),
        requestReplaceKubeResource: jest.fn(),
        showSuccessNotification: jest.fn(),
        showErrorNotification: jest.fn(),
        store: { getData: () => observable.box(undefined) },
        tabId: "tab-edit-unknown",
        waitForEditingResource: async () => undefined,
        hostedCluster: undefined,
      };

      const model = new EditResourceModel(mockDeps);

      expect(model.clusterId).toBe("unknown");

      await expect(model.save()).rejects.toThrow(ClusterContextMismatchError);
      expect(mockDeps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(mockDeps.requestPatchKubeResource).not.toHaveBeenCalled();
    });
  });

  describe("LogStore: Memory Control & Buffer Disposal", () => {
    it("stops refreshers and deletes running timer references on stopLoadingLogs", () => {
      const logStore = new LogStore({ callForLogs: jest.fn() });
      const tabId = "tab-log-1";

      (logStore as any).refreshers.set(tabId, { stop: jest.fn() });
      (logStore as any).inFlightRequests.add(tabId);

      logStore.stopLoadingLogs(tabId);

      expect((logStore as any).refreshers.has(tabId)).toBe(false);
      expect((logStore as any).inFlightRequests.has(tabId)).toBe(false);
    });

    it("completely flushes logs, pending buffer, status, and error maps on clearLogs", () => {
      const logStore = new LogStore({ callForLogs: jest.fn() });
      const tabId = "tab-log-flush";

      (logStore as any).podLogs.set(tabId, ["line 1", "line 2"]);
      (logStore as any).pendingLogs.set(tabId, ["pending line"]);
      (logStore as any).tabStatus.set(tabId, "LIVE");
      (logStore as any).tabErrors.set(tabId, "Some error");
      (logStore as any).truncatedCounts.set(tabId, 50);

      logStore.clearLogs(tabId);

      expect((logStore as any).podLogs.has(tabId)).toBe(false);
      expect((logStore as any).pendingLogs.has(tabId)).toBe(false);
      expect((logStore as any).tabStatus.has(tabId)).toBe(false);
      expect((logStore as any).tabErrors.has(tabId)).toBe(false);
      expect((logStore as any).truncatedCounts.has(tabId)).toBe(false);
    });
  });

  describe("TerminalWindow: Production Confirmation Gate", () => {
    let di: ReturnType<typeof getDiForUnitTesting>;
    let diRender: DiRender;
    let mockConnect: jest.Mock;
    let mockTerminal: any;

    beforeEach(() => {
      di = getDiForUnitTesting();
      diRender = renderFor(di);

      di.override(callForLogsInjectable, () => () => Promise.resolve("some-logs"));

      mockConnect = jest.fn();
      mockTerminal = {
        setOnSearchOpen: jest.fn(),
        attachTo: jest.fn(),
        detach: jest.fn(),
        onResize: jest.fn(),
      };

      di.override(terminalStoreInjectable, () => ({
        connect: mockConnect,
        getTerminal: jest.fn().mockReturnValue(mockTerminal),
        isDisconnected: jest.fn().mockReturnValue(false),
        reconnect: jest.fn(),
      } as any));
    });

    it("connects immediately without gate in non-production environment", () => {
      const devCluster = {
        id: "cluster-dev-1",
        name: "dev-cluster",
        preferences: { clusterAlias: "dev-cluster", clusterEnvironment: "dev" },
      } as any;

      di.override(hostedClusterInjectable, () => devCluster);

      const tab = {
        id: "term-tab-dev",
        title: "Terminal",
        kind: TabKind.TERMINAL,
        pinned: false,
      };

      diRender(<TerminalWindow tab={tab} />);

      expect(mockConnect).toHaveBeenCalledWith(tab);
      expect(screen.queryByTestId("terminal-prod-gate-term-tab-dev")).toBeNull();
      expect(screen.getByTestId("terminal-context-header-term-tab-dev")).toBeInTheDocument();
      expect(screen.getByText("DEV")).toBeInTheDocument();
    });

    it("holds connection fail-closed in production until user confirms gate", () => {
      const prodCluster = {
        id: "cluster-prod-1",
        name: "production-k8s",
        preferences: { clusterAlias: "production-k8s", clusterEnvironment: "prod" },
      } as any;

      di.override(hostedClusterInjectable, () => prodCluster);

      const tab = {
        id: "term-tab-prod",
        title: "Terminal",
        kind: TabKind.TERMINAL,
        pinned: false,
      };

      diRender(<TerminalWindow tab={tab} />);

      // Connection MUST NOT be made prior to explicit user confirmation
      expect(mockConnect).not.toHaveBeenCalled();
      expect(screen.getByTestId("terminal-prod-gate-term-tab-prod")).toBeInTheDocument();
      expect(screen.getByText(/Production Terminal Confirmation Required/i)).toBeInTheDocument();
      expect(screen.getByTestId("terminal-prod-hazard")).toBeInTheDocument();

      // User confirms through gate button
      const confirmBtn = screen.getByTestId("terminal-prod-confirm-btn-term-tab-prod");

      fireEvent.click(confirmBtn);

      // Now connection is allowed
      expect(mockConnect).toHaveBeenCalledWith(tab);
      expect(screen.queryByTestId("terminal-prod-gate-term-tab-prod")).toBeNull();
    });
  });

  describe("DockTab: Cluster Environment Badges & Classic Fallback", () => {
    let di: ReturnType<typeof getDiForUnitTesting>;
    let diRender: DiRender;

    beforeEach(() => {
      di = getDiForUnitTesting();
      diRender = renderFor(di);
      di.override(callForLogsInjectable, () => () => Promise.resolve("some-logs"));
    });

    it("displays environment badge when workspace-tabs flag is enabled", () => {
      const devCluster = {
        id: "cluster-dev-1",
        name: "staging-cluster",
        preferences: { clusterAlias: "staging-cluster", clusterEnvironment: "staging" },
      } as any;

      di.override(hostedClusterInjectable, () => devCluster);

      const featureFlag = di.inject(workspaceTabsFeatureFlagInjectable);

      featureFlag.setEnabled(true);

      const tabValue = {
        id: "dock-tab-test",
        title: "Pod Logs",
        kind: TabKind.POD_LOGS,
        pinned: false,
      };

      diRender(<DockTab value={tabValue} />);

      expect(screen.getByTestId("dock-tab-env-badge-dock-tab-test")).toBeInTheDocument();
      expect(screen.getByText("STG")).toBeInTheDocument();
    });

    it("omits environment badge when workspace-tabs flag is disabled (classic fallback)", () => {
      const devCluster = {
        id: "cluster-dev-1",
        name: "staging-cluster",
        preferences: { clusterAlias: "staging-cluster", clusterEnvironment: "staging" },
      } as any;

      di.override(hostedClusterInjectable, () => devCluster);

      const featureFlag = di.inject(workspaceTabsFeatureFlagInjectable);

      featureFlag.setEnabled(false);

      const tabValue = {
        id: "dock-tab-classic",
        title: "Terminal 1",
        kind: TabKind.TERMINAL,
        pinned: false,
      };

      diRender(<DockTab value={tabValue} />);

      expect(screen.queryByTestId("dock-tab-env-badge-dock-tab-classic")).toBeNull();
      expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    });
  });
});
