/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { dockerPod } from "./pod.mock";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import type { DiRender } from "../../../test-utils/renderFor";
import { renderFor } from "../../../test-utils/renderFor";
import type { LogTabViewModelDependencies } from "../logs-view-model";
import { LogTabViewModel } from "../logs-view-model";
import type { TabId } from "../../dock/store";
import { LogSearch } from "../search";
import userEvent from "@testing-library/user-event";
import { SearchStore } from "../../../../search-store/search-store";

function mockLogTabViewModel(tabId: TabId, deps: Partial<LogTabViewModelDependencies>): LogTabViewModel {
  return new LogTabViewModel(tabId, {
    getLogs: jest.fn(),
    getLogsWithoutTimestamps: jest.fn(),
    getTimestampSplitLogs: jest.fn(),
    getLogTabData: jest.fn(),
    setLogTabData: jest.fn(),
    loadLogs: jest.fn(),
    reloadLogs: jest.fn(),
    renameTab: jest.fn(),
    stopLoadingLogs: jest.fn(),
    getPodById: jest.fn(),
    getPodsByOwnerId: jest.fn(),
    areLogsPresent: jest.fn(),
    searchStore: new SearchStore(),
    downloadLogs: jest.fn(),
    downloadAllLogs: jest.fn(),
    isPaused: jest.fn(() => false),
    pause: jest.fn(),
    resume: jest.fn(),
    getPendingCount: jest.fn(() => 0),
    getStatus: jest.fn(() => "LIVE" as const),
    getError: jest.fn(() => undefined),
    getTruncatedCount: jest.fn(() => 0),
    ...deps,
  });
}

const getOnePodViewModel = (tabId: TabId, deps: Partial<LogTabViewModelDependencies> = {}): LogTabViewModel => {
  const selectedPod = dockerPod;

  return mockLogTabViewModel(tabId, {
    getLogTabData: () => ({
      selectedPodId: selectedPod.getId(),
      selectedContainer: selectedPod.getContainers()[0].name,
      namespace: selectedPod.getNs(),
      showPrevious: false,
      showTimestamps: false,
    }),
    getPodById: (id) => {
      if (id === selectedPod.getId()) {
        return selectedPod;
      }

      return undefined;
    },
    ...deps,
  });
};

describe("LogSearch tests", () => {
  let render: DiRender;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    render = renderFor(di);
  });

  it("renders w/o errors", () => {
    const model = getOnePodViewModel("foobar");
    const { container } = render(
      <LogSearch
        model={model}
        scrollToOverlay={jest.fn()}
      />,
    );

    expect(container).toBeInstanceOf(HTMLElement);
  });

  it("should scroll to new active overlay when clicking the previous button", async () => {
    const scrollToOverlay = jest.fn();
    const model = getOnePodViewModel("foobar", {
      getLogsWithoutTimestamps: () => [
        "hello",
        "world",
      ],
    });

    render(
      <LogSearch
        model={model}
        scrollToOverlay={scrollToOverlay}
      />,
    );

    userEvent.click(await screen.findByPlaceholderText("Search..."));
    userEvent.keyboard("o");
    userEvent.click(await screen.findByText("keyboard_arrow_up"));
    expect(scrollToOverlay).toBeCalled();
  });

  it("should scroll to new active overlay when clicking the next button", async () => {
    const scrollToOverlay = jest.fn();
    const model = getOnePodViewModel("foobar", {
      getLogsWithoutTimestamps: () => [
        "hello",
        "world",
      ],
    });

    render(
      <LogSearch
        model={model}
        scrollToOverlay={scrollToOverlay}
      />,
    );

    userEvent.click(await screen.findByPlaceholderText("Search..."));
    userEvent.keyboard("o");
    userEvent.click(await screen.findByText("keyboard_arrow_down"));
    expect(scrollToOverlay).toBeCalled();
  });

  it("next and previous should be disabled initially", async () => {
    const scrollToOverlay = jest.fn();
    const model = getOnePodViewModel("foobar", {
      getLogsWithoutTimestamps: () => [
        "hello",
        "world",
      ],
    });

    render(
      <LogSearch
        model={model}
        scrollToOverlay={scrollToOverlay}
      />,
    );

    userEvent.click(await screen.findByText("keyboard_arrow_down"));
    userEvent.click(await screen.findByText("keyboard_arrow_up"));
    expect(scrollToOverlay).not.toBeCalled();
  });

  describe("R2-03 Advanced Search & Filter UI", () => {
    it("toggles between Search and Filter modes when mode button is clicked", async () => {
      const model = getOnePodViewModel("foobar", {
        getLogsWithoutTimestamps: () => [
          "INFO server started",
          "ERROR connection lost",
          "DEBUG test packet",
        ],
      });

      render(
        <LogSearch
          model={model}
          scrollToOverlay={jest.fn()}
        />,
      );

      const modeBtn = await screen.findByTestId("log-search-mode-toggle");

      expect(modeBtn.textContent).toContain("Search");
      expect(model.searchStore.searchMode).toBe("search");
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();

      // Click to toggle to Filter mode
      userEvent.click(modeBtn);
      expect(model.searchStore.searchMode).toBe("filter");
      expect(modeBtn.textContent).toContain("Filter");
      expect(screen.getByPlaceholderText("Filter...")).toBeInTheDocument();
    });

    it("toggles regex and case sensitive search buttons", async () => {
      const model = getOnePodViewModel("foobar");

      render(
        <LogSearch
          model={model}
          scrollToOverlay={jest.fn()}
        />,
      );

      const regexBtn = await screen.findByTestId("log-search-regex-toggle");
      const caseBtn = await screen.findByTestId("log-search-case-toggle");

      expect(model.searchStore.useRegex).toBe(false);
      expect(model.searchStore.matchCase).toBe(false);

      userEvent.click(regexBtn);
      expect(model.searchStore.useRegex).toBe(true);

      userEvent.click(caseBtn);
      expect(model.searchStore.matchCase).toBe(true);
    });

    it("displays non-intrusive error banner when invalid regex is entered", async () => {
      const model = getOnePodViewModel("foobar", {
        getLogsWithoutTimestamps: () => ["error line 1"],
      });

      render(
        <LogSearch
          model={model}
          scrollToOverlay={jest.fn()}
        />,
      );

      // Enable regex
      userEvent.click(await screen.findByTestId("log-search-regex-toggle"));

      // Enter malformed regex pattern
      const input = await screen.findByPlaceholderText("Search...");

      fireEvent.change(input, { target: { value: "(unclosed-group" } });

      const errorBadge = await screen.findByTestId("log-regex-error");

      expect(errorBadge).toBeInTheDocument();
      expect(model.searchStore.regexError).toBeDefined();
    });
  });
});
