/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./controls.scss";

import { observer } from "mobx-react";
import React, { useState } from "react";

import { Icon } from "../../icon";
import { DownloadLogsDropdown } from "./download-logs-dropdown";
import type { LogTabViewModel } from "./logs-view-model";
import type { SelectOption } from "../../select";
import { Select } from "../../select";
import type { SingleValue } from "react-select";

export interface LogControlsProps {
  model: LogTabViewModel;
}

const sinceOptions: SelectOption<number | undefined>[] = [
  { label: "15m", value: 900 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "24h", value: 86400 },
  { label: "All", value: undefined },
];

export const TAIL_ALL = 0;

const tailOptions: SelectOption<number | undefined>[] = [
  { label: "100", value: 100 },
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "All", value: TAIL_ALL },
];

interface ToggleButtonProps {
  icon: string;
  label: string;
  pressed?: boolean;
  testId: string;
  onClick: () => void;
  className?: string;
}

const ToggleButton = ({ icon, label, pressed, testId, onClick, className }: ToggleButtonProps) => (
  <button
    type="button"
    className={`log-icon-btn ${className ?? ""} ${pressed ? "active" : ""}`}
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    data-testid={testId}
    onClick={onClick}
  >
    <Icon material={icon} small />
  </button>
);

export const LogControls = observer(({ model }: LogControlsProps) => {
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const tabData = model.logTabData.get();
  const pod = model.pod.get();

  if (!tabData || !pod) {
    return null;
  }

  const logs = model.timestampSplitLogs.get();
  const { showTimestamps, showPrevious: previous, wordWrap = false } = tabData;
  const isPaused = model.isPaused.get();
  const pendingCount = model.pendingCount.get();

  const toggleTimestamps = () => {
    model.updateLogTabData({ showTimestamps: !showTimestamps });
  };

  const toggleWordWrap = () => {
    model.updateLogTabData({ wordWrap: !wordWrap });
  };

  const togglePrevious = () => {
    model.updateLogTabData({ showPrevious: !previous });
    model.reloadLogs();
  };

  const selectedSince = tabData.sinceSeconds;
  const selectedTail = tabData.tailLines;

  const onSinceChange = (option: SingleValue<SelectOption<number | undefined>>) => {
    model.updateLogTabData({ sinceSeconds: option?.value });
    model.reloadLogs();
  };

  const onTailChange = (option: SingleValue<SelectOption<number | undefined>>) => {
    model.updateLogTabData({ tailLines: option?.value });
    model.reloadLogs();
  };

  const isJson = tabData.logFormat === "json";
  const toggleJsonFormat = () => {
    model.updateLogTabData({ logFormat: isJson ? "raw" : "json" });
  };

  const pauseLabel = isPaused
    ? `Resume${pendingCount > 0 ? ` (+${pendingCount})` : ""}`
    : "Pause";

  return (
    <div className="LogControls" data-testid="log-controls">
      <ToggleButton
        icon="timer"
        label="Show timestamps"
        pressed={showTimestamps}
        testId="log-show-timestamps-checkbox"
        onClick={toggleTimestamps}
      />
      <ToggleButton
        icon="history"
        label="Show previous terminated container"
        pressed={previous}
        testId="log-show-previous-checkbox"
        onClick={togglePrevious}
      />
      <ToggleButton
        icon="wrap_text"
        label="Word wrap"
        pressed={wordWrap}
        testId="log-word-wrap-checkbox"
        onClick={toggleWordWrap}
      />
      <DownloadLogsDropdown
        disabled={logs.length === 0}
        downloadVisibleLogs={model.downloadLogs}
        downloadAllLogs={model.downloadAllLogs}
      />

      <span className="spacer" />

      {/* Pause / Resume */}
      <ToggleButton
        icon={isPaused ? "play_arrow" : "pause"}
        label={pauseLabel}
        pressed={isPaused}
        testId={isPaused ? "log-resume-btn" : "log-pause-btn"}
        onClick={isPaused ? model.resume : model.pause}
        className={isPaused ? "resume" : ""}
      />

      {/* Raw | JSON Format Toggle */}
      <ToggleButton
        icon="data_object"
        label="Toggle Raw / JSON structured logs"
        pressed={isJson}
        testId="log-format-toggle"
        onClick={toggleJsonFormat}
      />

      {/* Since / Tail */}
      <div className="time-range">
        <ToggleButton
          icon="calendar_today"
          label="Since and tail"
          pressed={timeMenuOpen}
          testId="log-time-range-toggle"
          onClick={() => setTimeMenuOpen(!timeMenuOpen)}
        />
        {timeMenuOpen && (
          <div className="time-range-popover" data-testid="log-time-range-popover">
            <label>
              <span>Since</span>
              <Select<number | undefined, SelectOption<number | undefined>, false>
                id="log-since-select"
                data-testid="log-since-select"
                menuPortalTarget={null}
                options={sinceOptions}
                value={selectedSince}
                onChange={onSinceChange}
              />
            </label>
            <label>
              <span>Tail</span>
              <Select<number | undefined, SelectOption<number | undefined>, false>
                id="log-tail-select"
                data-testid="log-tail-select"
                menuPortalTarget={null}
                options={tailOptions}
                value={selectedTail}
                onChange={onTailChange}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
});
