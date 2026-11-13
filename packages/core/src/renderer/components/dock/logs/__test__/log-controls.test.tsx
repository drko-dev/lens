/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { LogControls } from "../controls";
import type { LogTabViewModel } from "../logs-view-model";

// The dropdown needs DI; its behavior is covered by features/pod-logs/download-logs.test.tsx
jest.mock("../download-logs-dropdown", () => ({ DownloadLogsDropdown: () => null }));

jest.mock("../../../select", () => ({ Select: () => null }));

jest.mock("../../../icon", () => ({ Icon: () => null }));

const makeModel = (overrides: Record<string, unknown> = {}) => ({
  logTabData: { get: () => ({ showTimestamps: false, showPrevious: false, wordWrap: false, logFormat: "raw", ...overrides }) },
  pod: { get: () => ({}) },
  timestampSplitLogs: { get: () => [["2020-01-01T00:00:00Z", "line"]] },
  isPaused: { get: () => false },
  pendingCount: { get: () => 0 },
  updateLogTabData: jest.fn(),
  reloadLogs: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  downloadLogs: jest.fn(),
  downloadAllLogs: jest.fn(),
}) as unknown as LogTabViewModel & Record<string, jest.Mock>;

describe("<LogControls />", () => {
  it("renders icon toggles with aria-pressed state", () => {
    const { getByTestId } = render(<LogControls model={makeModel({ wordWrap: true })} />);

    expect(getByTestId("log-word-wrap-checkbox")).toHaveAttribute("aria-pressed", "true");
    expect(getByTestId("log-show-timestamps-checkbox")).toHaveAttribute("aria-pressed", "false");
    expect(getByTestId("log-show-timestamps-checkbox")).toHaveAttribute("title", "Show timestamps");
  });

  it("toggles call the same handlers as before", () => {
    const model = makeModel();
    const { getByTestId } = render(<LogControls model={model} />);

    fireEvent.click(getByTestId("log-show-timestamps-checkbox"));
    expect(model.updateLogTabData).toHaveBeenCalledWith({ showTimestamps: true });

    fireEvent.click(getByTestId("log-show-previous-checkbox"));
    expect(model.updateLogTabData).toHaveBeenCalledWith({ showPrevious: true });
    expect(model.reloadLogs).toHaveBeenCalled();

    fireEvent.click(getByTestId("log-format-toggle"));
    expect(model.updateLogTabData).toHaveBeenCalledWith({ logFormat: "json" });

    fireEvent.click(getByTestId("log-pause-btn"));
    expect(model.pause).toHaveBeenCalled();
  });

  it("keeps since and tail selects reachable behind the time range button", () => {
    const { getByTestId, queryByTestId } = render(<LogControls model={makeModel()} />);

    expect(queryByTestId("log-time-range-popover")).toBeNull();
    fireEvent.click(getByTestId("log-time-range-toggle"));
    expect(getByTestId("log-time-range-popover")).toBeInTheDocument();
  });
});
