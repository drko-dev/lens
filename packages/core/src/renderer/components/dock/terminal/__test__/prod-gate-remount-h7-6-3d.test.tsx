/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TerminalWindow } from "../view";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import { renderFor } from "../../../test-utils/renderFor";
import hostedClusterInjectable from "../../../../cluster-frame-context/hosted-cluster.injectable";
import terminalStoreInjectable from "../store.injectable";
import callForLogsInjectable from "../../logs/call-for-logs.injectable";
import terminalProdAuthorizationInjectable from "../prod-authorization.injectable";
import { TabKind } from "../../dock/store";

const tab = (id: string) => ({ id, title: "Terminal", kind: TabKind.TERMINAL, pinned: false });

describe("H7.6.3D: PROD gate survives remount and is per session", () => {
  const setup = () => {
    const di = getDiForUnitTesting();
    const connect = jest.fn();
    const term = { setOnSearchOpen: jest.fn(), attachTo: jest.fn(), detach: jest.fn(), onResize: jest.fn() };

    di.override(callForLogsInjectable, () => () => Promise.resolve(""));
    di.override(hostedClusterInjectable, () => ({ id: "prod-1", name: "p", preferences: { clusterEnvironment: "prod" } }) as any);
    di.override(terminalStoreInjectable, () => ({ connect, getTerminal: () => term, isDisconnected: () => false, reconnect: jest.fn() }) as any);

    return { di, connect, render: renderFor(di) };
  };

  it("does not re-ask after unmount/mount of the same session", () => {
    const { render, connect } = setup();
    const first = render(<TerminalWindow tab={tab("a")} />);

    fireEvent.click(screen.getByTestId("terminal-prod-confirm-btn-a"));
    first.unmount();
    connect.mockClear();
    render(<TerminalWindow tab={tab("a")} />);
    expect(screen.queryByTestId("terminal-prod-gate-a")).toBeNull();
    expect(connect).toHaveBeenCalled();
  });

  it("another session never inherits the authorization", () => {
    const { render } = setup();
    const first = render(<TerminalWindow tab={tab("a")} />);

    fireEvent.click(screen.getByTestId("terminal-prod-confirm-btn-a"));
    first.unmount();
    render(<TerminalWindow tab={tab("b")} />);
    expect(screen.getByTestId("terminal-prod-gate-b")).toBeInTheDocument();
  });

  it("revoking the authorization (close) asks again", () => {
    const { render, di } = setup();
    const first = render(<TerminalWindow tab={tab("a")} />);

    fireEvent.click(screen.getByTestId("terminal-prod-confirm-btn-a"));
    first.unmount();
    di.inject(terminalProdAuthorizationInjectable).revoke("a");
    render(<TerminalWindow tab={tab("a")} />);
    expect(screen.getByTestId("terminal-prod-gate-a")).toBeInTheDocument();
  });
});
