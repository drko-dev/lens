/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./terminal-search.scss";

import React, { useState, useEffect, useRef } from "react";
import { cssNames } from "@openlens/utilities";
import { Icon } from "../../icon";
import type { Terminal } from "./terminal";

export interface TerminalSearchProps {
  terminal: Terminal;
  onClose: () => void;
}

export const TerminalSearch: React.FC<TerminalSearchProps> = ({ terminal, onClose }) => {
  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [hasMatches, setHasMatches] = useState<boolean | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const executeSearch = (searchQuery: string, forward = true) => {
    if (!searchQuery.trim()) {
      terminal.clearSearch();
      setHasMatches(null);

      return;
    }

    const options = {
      regex: useRegex,
      caseSensitive: matchCase,
      wholeWord,
      incremental: true,
    };

    const found = forward
      ? terminal.findNext(searchQuery, options)
      : terminal.findPrevious(searchQuery, options);

    setHasMatches(found);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    executeSearch(val, true);
  };

  const handleNext = () => {
    executeSearch(query, true);
  };

  const handlePrev = () => {
    executeSearch(query, false);
  };

  const handleClose = () => {
    terminal.clearSearch();
    onClose();
    terminal.focus();
  };

  const handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (evt.key === "Enter") {
      evt.preventDefault();

      if (evt.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      handleClose();
    }
  };

  const toggleCase = () => {
    const next = !matchCase;

    setMatchCase(next);

    if (query) {
      terminal.findNext(query, { regex: useRegex, caseSensitive: next, wholeWord, incremental: false });
    }
  };

  const toggleRegex = () => {
    const next = !useRegex;

    setUseRegex(next);

    if (query) {
      terminal.findNext(query, { regex: next, caseSensitive: matchCase, wholeWord, incremental: false });
    }
  };

  const toggleWord = () => {
    const next = !wholeWord;

    setWholeWord(next);

    if (query) {
      terminal.findNext(query, { regex: useRegex, caseSensitive: matchCase, wholeWord: next, incremental: false });
    }
  };

  return (
    <div className="TerminalSearch flex gaps align-center" data-testid="terminal-search-bar">
      <div className="search-input-wrapper flex gaps align-center">
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Find in terminal..."
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="terminal-search-input"
        />

        <button
          type="button"
          className={cssNames("search-toggle-btn text-btn", { active: matchCase })}
          onClick={toggleCase}
          title="Match Case (Aa)"
          data-testid="terminal-search-case-toggle"
        >
          Aa
        </button>

        <button
          type="button"
          className={cssNames("search-toggle-btn text-btn", { active: useRegex })}
          onClick={toggleRegex}
          title="Use Regular Expression (.*)"
          data-testid="terminal-search-regex-toggle"
        >
          .*
        </button>

        <button
          type="button"
          className={cssNames("search-toggle-btn text-btn", { active: wholeWord })}
          onClick={toggleWord}
          title="Match Whole Word (\b)"
          data-testid="terminal-search-word-toggle"
        >
          \b
        </button>

        {query && hasMatches !== null && (
          <span
            className={cssNames("search-match-status", { "no-matches": !hasMatches })}
            data-testid="terminal-search-status"
          >
            {hasMatches ? "Match" : "No results"}
          </span>
        )}
      </div>

      <Icon
        material="keyboard_arrow_up"
        className="search-nav-btn"
        title="Previous Match (Shift+Enter)"
        onClick={handlePrev}
        data-testid="terminal-search-prev-btn"
      />

      <Icon
        material="keyboard_arrow_down"
        className="search-nav-btn"
        title="Next Match (Enter)"
        onClick={handleNext}
        data-testid="terminal-search-next-btn"
      />

      <Icon
        material="close"
        className="search-close-btn"
        title="Close (Escape)"
        onClick={handleClose}
        data-testid="terminal-search-close-btn"
      />
    </div>
  );
};
