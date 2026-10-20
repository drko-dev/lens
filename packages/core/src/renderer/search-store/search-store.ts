/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, computed, observable, makeObservable } from "mobx";
import autoBind from "auto-bind";
import { stripAnsiCodes } from "../components/dock/logs/log-buffer-utils";

export type LogSearchMode = "search" | "filter";

export interface RegexBuildResult {
  regex: RegExp | null;
  error?: string;
}

export class SearchStore {
  /**
   * Utility method escaping user string to safely pass it into new RegExp(variable)
   */
  public static escapeRegex(value?: string): string {
    return value ? value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") : "";
  }

  /**
   * Builds and validates a regular expression safely.
   * Protects against pathological regex patterns (max 100 chars, try/catch).
   */
  public static buildRegex(query?: string, useRegex = false, matchCase = false): RegexBuildResult {
    if (!query || !query.trim()) {
      return { regex: null };
    }

    const flags = matchCase ? "g" : "gi";

    if (!useRegex) {
      const escaped = SearchStore.escapeRegex(query);

      return { regex: new RegExp(escaped, flags) };
    }

    if (query.length > 100) {
      return {
        regex: null,
        error: "Regular expression pattern exceeds 100 characters",
      };
    }

    try {
      const regex = new RegExp(query, flags);

      return { regex };
    } catch (error: any) {
      return {
        regex: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  constructor() {
    makeObservable(this);
    autoBind(this);
  }

  /**
   * Text in the search input
   */
  @observable searchQuery = "";

  /**
   * Current search mode: 'search' (highlight occurrences) or 'filter' (hide non-matching lines)
   */
  @observable searchMode: LogSearchMode = "search";

  /**
   * Whether to treat search query as a regular expression
   */
  @observable useRegex = false;

  /**
   * Whether search is case-sensitive
   */
  @observable matchCase = false;

  /**
   * Non-intrusive validation error message when regex is malformed
   */
  @observable regexError?: string = undefined;

  /**
   * Array with line numbers where matches occur, e.g. [0, 0, 10, 21, 21, 40...]
   */
  @observable occurrences: number[] = [];

  /**
   * Line indices that match the search query (used by filter mode)
   */
  @observable filteredIndices: number[] = [];

  /**
   * Index within the occurrences array showing where activeOverlay is currently located
   */
  @observable activeOverlayIndex = -1;

  @action
  public setSearchMode(mode: LogSearchMode, text?: string[] | null): void {
    this.searchMode = mode;
    this.onSearch(text, this.searchQuery);
  }

  @action
  public setUseRegex(useRegex: boolean, text?: string[] | null): void {
    this.useRegex = useRegex;
    this.onSearch(text, this.searchQuery);
  }

  @action
  public setMatchCase(matchCase: boolean, text?: string[] | null): void {
    this.matchCase = matchCase;
    this.onSearch(text, this.searchQuery);
  }

  /**
   * Returns the currently active RegExp or null
   */
  public getCurrentRegex(): RegExp | null {
    const { regex } = SearchStore.buildRegex(this.searchQuery, this.useRegex, this.matchCase);

    return regex;
  }

  /**
   * Performs search / filtering over lines of text
   */
  @action
  public onSearch(text?: string[] | null, query = this.searchQuery): void {
    this.searchQuery = query;

    if (!query) {
      return this.reset();
    }

    const { regex, error } = SearchStore.buildRegex(query, this.useRegex, this.matchCase);

    if (error) {
      this.regexError = error;
      this.occurrences = [];
      this.filteredIndices = [];
      this.activeOverlayIndex = -1;

      return;
    }

    this.regexError = undefined;

    if (!regex) {
      this.occurrences = [];
      this.filteredIndices = [];
      this.activeOverlayIndex = -1;

      return;
    }

    const occurrences: number[] = [];
    const filteredIndices: number[] = [];

    const lines = text ?? [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const plain = stripAnsiCodes(line);

      regex.lastIndex = 0;
      const matches = Array.from(plain.matchAll(regex));

      if (matches.length > 0) {
        filteredIndices.push(index);

        for (let i = 0; i < matches.length; i++) {
          occurrences.push(index);
        }
      }
    }

    this.occurrences = occurrences;
    this.filteredIndices = filteredIndices;

    if (!this.occurrences.length) {
      this.activeOverlayIndex = -1;

      return;
    }

    // If active overlay is out of range, reset to first match
    if (this.occurrences[this.activeOverlayIndex] === undefined) {
      this.activeOverlayIndex = 0;
    }
  }

  /**
   * Getting next overlay index within the occurrences array
   */
  private getNextOverlay(loopOver = false): number {
    const next = this.activeOverlayIndex + 1;

    if (next > this.occurrences.length - 1) {
      return loopOver ? 0 : this.activeOverlayIndex;
    }

    return next;
  }

  /**
   * Getting previous overlay index within the occurrences array
   */
  private getPrevOverlay(loopOver = false): number {
    const prev = this.activeOverlayIndex - 1;

    if (prev < 0) {
      return loopOver ? this.occurrences.length - 1 : this.activeOverlayIndex;
    }

    return prev;
  }

  @action
  public setNextOverlayActive(): void {
    if (!this.occurrences.length) return;
    this.activeOverlayIndex = this.getNextOverlay(true);
  }

  @action
  public setPrevOverlayActive(): void {
    if (!this.occurrences.length) return;
    this.activeOverlayIndex = this.getPrevOverlay(true);
  }

  /**
   * Gets line index of where active overlay is located
   */
  @computed get activeOverlayLine(): number {
    return this.occurrences[this.activeOverlayIndex];
  }

  @computed get activeFind(): number {
    return this.activeOverlayIndex >= 0 ? this.activeOverlayIndex + 1 : 0;
  }

  @computed get totalFinds(): number {
    return this.occurrences.length;
  }

  @computed get filteredCount(): number {
    return this.filteredIndices.length;
  }

  /**
   * Checks if overlay is active
   */
  public isActiveOverlay(line: number, occurrence: number): boolean {
    const firstLineIndex = this.occurrences.findIndex(item => item === line);

    return firstLineIndex + occurrence === this.activeOverlayIndex;
  }

  @action
  public reset(): void {
    this.searchQuery = "";
    this.regexError = undefined;
    this.occurrences = [];
    this.filteredIndices = [];
    this.activeOverlayIndex = -1;
  }
}
