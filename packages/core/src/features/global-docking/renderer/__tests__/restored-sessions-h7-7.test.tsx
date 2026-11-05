/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent } from "@testing-library/react";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import hostedClusterIdInjectable from "../../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import logTabStoreInjectable from "../../../../renderer/components/dock/logs/tab-store.injectable";
import editResourceTabStoreInjectable from "../../../../renderer/components/dock/edit-resource/store.injectable";
import selectedNamespacesStorageInjectable from "../../../namespace-filtering/renderer/storage.injectable";
import editResourceModelInjectable from "../../../../renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable";
import globalPanelStoreInjectable from "../global-panel-store.injectable";
import terminalStoreInjectable from "../../../../renderer/components/dock/terminal/store.injectable";
import { createGlobalPanelStore, openLogsPanel, openEditorPanel, openTerminalPanel, openKubetailPanel } from "../global-panel-store";
import { BoundPodLogs } from "../bound-pod-logs";
import { BoundEditor } from "../bound-editor";
import { BoundTerminal } from "../bound-terminal";
import { BoundKubetail } from "../bound-kubetail";
import restoredSessionGateInjectable from "../restored-session-gate.injectable";

const mounts = { logs: 0, editor: 0, terminal: 0, kubetail: 0 };

jest.mock("../../../../renderer/components/dock/logs/view", () => ({
  LogsDockTab: () => { mounts.logs++; return <div data-testid="real-logs" />; },
}));
jest.mock("../../../../renderer/components/dock/edit-resource/view", () => ({
  EditResource: () => { mounts.editor++; return <div data-testid="real-editor" />; },
}));
jest.mock("../../../../renderer/components/dock/terminal/view", () => ({
  TerminalWindow: () => { mounts.terminal++; return <div data-testid="real-terminal" />; },
}));
jest.mock("../../../../renderer/components/kubetail/kubetail-page", () => ({
  KubetailPage: () => { mounts.kubetail++; return <div data-testid="real-kubetail" />; },
}));

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const setup = () => {
  const di = getDiForUnitTesting();

  di.override(hostedClusterIdInjectable, () => "c1");
  di.override(selectedNamespacesStorageInjectable, () => ({ get: () => [], set: () => undefined, value: [] }) as any);

  // Fakes: the real stores need a cluster frame; only their session starters matter here.
  const terminalStore = { connect: jest.fn(), getTerminal: () => undefined, isCleanExit: () => false, isConnected: () => false };

  const editData = new Map<string, unknown>();

  di.override(globalPanelStoreInjectable, () => ({ requestClosePanel: jest.fn() }) as any);
  di.override(editResourceTabStoreInjectable, () => ({ getData: (id: string) => editData.get(id), setData: (id: string, v: unknown) => editData.set(id, v) }) as any);
  di.override(terminalStoreInjectable, () => terminalStore as any);
  di.override(editResourceModelInjectable, (async () => ({ editingResource: { firstDraft: "x" }, load: jest.fn() })) as any);

  return { di, terminalStore, render: renderFor(di), gate: di.inject(restoredSessionGateInjectable) };
};

const bindingOf = (store: ReturnType<typeof createGlobalPanelStore>, id: string) => store.allActiveLeaves.find((l) => l.id === id)!.resourceBinding!;

interface Kind {
  name: string;
  real: string;
  mountKey: keyof typeof mounts;
  build: () => { leafId: string; element: (leafId: string) => React.ReactElement; sessionStarted: (di: ReturnType<typeof getDiForUnitTesting>) => boolean };
}

const kinds: Kind[] = [
  {
    name: "pod-logs",
    real: "real-logs",
    mountKey: "logs",
    build: () => {
      const store = createGlobalPanelStore("c1");
      const id = openLogsPanel(store, { podId: "uid", podName: "p", namespace: "ns", container: "main" });
      const binding = bindingOf(store, id);

      return {
        leafId: id,
        element: (leafId) => <BoundPodLogs binding={binding} leafId={leafId} />,
        sessionStarted: (di) => Boolean(di.inject(logTabStoreInjectable).getData(binding.tabId!)),
      };
    },
  },
  {
    name: "resource-editor",
    real: "real-editor",
    mountKey: "editor",
    build: () => {
      const store = createGlobalPanelStore("c1");
      const id = openEditorPanel(store, { apiVersion: "v1", kind: "ConfigMap", name: "cm", namespace: "ns", selfLink: "/api/v1/namespaces/ns/configmaps/cm" } as any);
      const binding = bindingOf(store, id);

      return {
        leafId: id,
        element: (leafId) => <BoundEditor binding={binding} leafId={leafId} />,
        sessionStarted: (di) => Boolean(di.inject(editResourceTabStoreInjectable).getData(binding.tabId!)),
      };
    },
  },
  {
    name: "terminal",
    real: "real-terminal",
    mountKey: "terminal",
    build: () => {
      const store = createGlobalPanelStore("c1");
      const id = openTerminalPanel(store, "u-a");
      const binding = bindingOf(store, id);

      return { leafId: id, element: (leafId) => <BoundTerminal binding={binding} leafId={leafId} />, sessionStarted: (di) => di.inject(terminalStoreInjectable).isConnected(binding.tabId!) };
    },
  },
  {
    name: "kubetail",
    real: "real-kubetail",
    mountKey: "kubetail",
    build: () => {
      const store = createGlobalPanelStore("c1");
      const id = openKubetailPanel(store);
      const binding = bindingOf(store, id);

      return { leafId: id, element: (leafId) => <BoundKubetail binding={binding} leafId={leafId} />, sessionStarted: () => false };
    },
  },
];

describe("H7.7 restored sessions come back inert", () => {
  beforeEach(() => {
    Object.keys(mounts).forEach((k) => ((mounts as any)[k] = 0));
  });

  describe.each(kinds)("$name", (kind) => {
    it("an inert leaf renders the placeholder and starts no session", async () => {
      const { di, terminalStore, render, gate } = setup();
      const { leafId, element, sessionStarted } = kind.build();

      gate.markInert([leafId]);
      const result = render(element(leafId));

      await flush();
      expect(result.getByTestId("restored-session-placeholder").getAttribute("data-panel-kind")).toBe(kind.name);
      expect(result.queryByTestId(kind.real)).toBeNull();
      expect(mounts[kind.mountKey]).toBe(0);
      expect(sessionStarted(di)).toBe(false);
      expect(terminalStore.connect).not.toHaveBeenCalled();
    });

    it("does not resume by itself on re-render or remount", async () => {
      const { render, gate } = setup();
      const { leafId, element } = kind.build();

      gate.markInert([leafId]);
      const first = render(element(leafId));

      first.rerender(element(leafId));
      first.unmount();
      const second = render(element(leafId));

      await flush();
      expect(second.getByTestId("restored-session-placeholder")).toBeTruthy();
      expect(gate.isInert(leafId)).toBe(true);
      expect(mounts[kind.mountKey]).toBe(0);
    });

    it("Resume releases the gate and mounts the real component exactly once", async () => {
      const { di, render, gate } = setup();
      const { leafId, element, sessionStarted } = kind.build();

      gate.markInert([leafId]);
      const result = render(element(leafId));

      fireEvent.click(result.getByTestId("restored-session-resume"));
      expect(await result.findByTestId(kind.real)).toBeTruthy();
      expect(gate.isInert(leafId)).toBe(false);
      expect(result.queryByTestId("restored-session-placeholder")).toBeNull();
      expect(mounts[kind.mountKey]).toBe(1);

      if (kind.name !== "kubetail") {
        expect(sessionStarted(di) || kind.name === "terminal").toBe(true);
      }
    });

    it("a leaf that is not in the gate renders the real component immediately", async () => {
      const { render, gate } = setup();
      const { leafId, element } = kind.build();
      const result = render(element(leafId));

      expect(await result.findByTestId(kind.real)).toBeTruthy();
      expect(result.queryByTestId("restored-session-placeholder")).toBeNull();
      expect(gate.isInert(leafId)).toBe(false);
    });
  });

  it("the terminal placeholder labels the action as a new session and the others as Resume", () => {
    const { render, gate } = setup();
    const terminal = kinds[2].build();
    const logs = kinds[0].build();

    gate.markInert([terminal.leafId, logs.leafId]);
    const first = render(terminal.element(terminal.leafId));

    expect(first.getByTestId("restored-session-resume").textContent).toBe("Start new session");
    first.unmount();
    expect(render(logs.element(logs.leafId)).getByTestId("restored-session-resume").textContent).toBe("Resume");
  });
});
