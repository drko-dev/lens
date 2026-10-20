/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SearchStore } from "./search-store";
import { getDiForUnitTesting } from "../getDiForUnitTesting";
import directoryForUserDataInjectable from "../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import searchStoreInjectable from "./search-store.injectable";

const logs = [
  "1:M 30 Oct 2020 16:17:41.553 # Connection with replica 172.17.0.12:6379 lost",
  "1:M 30 Oct 2020 16:17:41.623 * Replica 172.17.0.12:6379 asks for synchronization",
  "1:M 30 Oct 2020 16:17:41.623 * Starting Partial resynchronization request from 172.17.0.12:6379 accepted. Sending 0 bytes of backlog starting from offset 14407.",
];

describe("search store tests", () => {
  let searchStore: SearchStore;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-directory-for-user-data");

    searchStore = di.inject(searchStoreInjectable);
  });

  it("does nothing with empty search query", () => {
    searchStore.onSearch([], "");
    expect(searchStore.occurrences).toEqual([]);
  });

  it("doesn't break if no text provided", () => {
    searchStore.onSearch(null, "replica");
    expect(searchStore.occurrences).toEqual([]);

    searchStore.onSearch([], "replica");
    expect(searchStore.occurrences).toEqual([]);
  });

  it("find 3 occurrences across 3 lines", () => {
    searchStore.onSearch(logs, "172");
    expect(searchStore.occurrences).toEqual([0, 1, 2]);
  });

  it("find occurrences within 1 line (case-insensitive)", () => {
    searchStore.onSearch(logs, "Starting");
    expect(searchStore.occurrences).toEqual([2, 2]);
  });

  it("sets overlay index equal to first occurrence", () => {
    searchStore.onSearch(logs, "Replica");
    expect(searchStore.activeOverlayIndex).toBe(0);
  });

  it("set overlay index to next occurrence", () => {
    searchStore.onSearch(logs, "172");
    searchStore.setNextOverlayActive();
    expect(searchStore.activeOverlayIndex).toBe(1);
  });

  it("sets overlay to last occurrence", () => {
    searchStore.onSearch(logs, "172");
    searchStore.setPrevOverlayActive();
    expect(searchStore.activeOverlayIndex).toBe(2);
  });

  it("gets line index where overlay is located", () => {
    searchStore.onSearch(logs, "synchronization");
    expect(searchStore.activeOverlayLine).toBe(1);
  });

  it("escapes string for using in regex", () => {
    const regex = SearchStore.escapeRegex("some.interesting-query\\#?()[]");

    expect(regex).toBe("some\\.interesting\\-query\\\\\\#\\?\\(\\)\\[\\]");
  });

  it("gets active find number", () => {
    searchStore.onSearch(logs, "172");
    searchStore.setNextOverlayActive();
    expect(searchStore.activeFind).toBe(2);
  });

  it("gets total finds number", () => {
    searchStore.onSearch(logs, "Starting");
    expect(searchStore.totalFinds).toBe(2);
  });

  describe("R2-03 Advanced Search & Filter Features", () => {
    it("supports regular expression search", () => {
      searchStore.setUseRegex(true);
      searchStore.onSearch(logs, "replica\\s+[0-9.:]+");

      expect(searchStore.totalFinds).toBe(2);
      expect(searchStore.regexError).toBeUndefined();
    });

    it("catches and reports invalid regex without throwing", () => {
      searchStore.setUseRegex(true);
      searchStore.onSearch(logs, "[unclosed-group");

      expect(searchStore.regexError).toBeDefined();
      expect(searchStore.occurrences).toEqual([]);
    });

    it("enforces 100 character length limit on regular expressions", () => {
      searchStore.setUseRegex(true);
      const longPattern = "a".repeat(101);

      searchStore.onSearch(logs, longPattern);

      expect(searchStore.regexError).toContain("exceeds 100 characters");
      expect(searchStore.occurrences).toEqual([]);
    });

    it("supports case-sensitive search", () => {
      searchStore.setMatchCase(true);
      searchStore.onSearch(logs, "replica"); // lowercase
      expect(searchStore.totalFinds).toBe(1); // only line 0 has lowercase replica

      searchStore.onSearch(logs, "Replica"); // uppercase
      expect(searchStore.totalFinds).toBe(1); // only line 1 has capitalized Replica
    });

    it("computes filteredIndices correctly in filter mode", () => {
      searchStore.setSearchMode("filter");
      searchStore.onSearch(logs, "synchronization");

      expect(searchStore.filteredIndices).toEqual([1, 2]);
      expect(searchStore.filteredCount).toBe(2);
    });

    it("ignores ANSI escape codes when searching", () => {
      const coloredLogs = [
        "\u001b[31mERROR:\u001b[0m Failed to connect to database",
        "\u001b[32mSUCCESS:\u001b[0m Service started",
      ];

      searchStore.onSearch(coloredLogs, "ERROR");

      expect(searchStore.occurrences).toEqual([0]);
      expect(searchStore.filteredIndices).toEqual([0]);
    });
  });
});
