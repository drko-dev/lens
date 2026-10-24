/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./controls.module.scss";

import { observer } from "mobx-react";
import React from "react";

import { Checkbox } from "../../checkbox";
import { DownloadLogsDropdown } from "./download-logs-dropdown";
import type { LogTabViewModel } from "./logs-view-model";
import { Badge } from "../../badge";
import { Button } from "@openlens/button";
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

export const LogControls = observer(({ model }: LogControlsProps) => {
  const tabData = model.logTabData.get();
  const pod = model.pod.get();

  if (!tabData || !pod) {
    return null;
  }

  const logs = model.timestampSplitLogs.get();
  const { showTimestamps, showPrevious: previous, wordWrap = false } = tabData;
  const since = logs.length ? logs[0][0] : null;

  const isPaused = model.isPaused.get();
  const pendingCount = model.pendingCount.get();
  const status = model.status.get();
  const error = model.error.get();
  const isTruncated = model.isTruncated.get();
  const truncatedCount = model.truncatedCount.get();

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

  return (
    <div className={styles.controls} data-testid="log-controls">
      <div className="flex gaps align-center">
        {/* Status indicator */}
        {status === "LIVE" && (
          <Badge
            label="LIVE"
            data-testid="log-status-live"
            style={{ backgroundColor: "var(--colorSuccess)", color: "#fff", fontWeight: 700 }}
          />
        )}
        {status === "PAUSED" && (
          <Badge
            label={`PAUSED${pendingCount > 0 ? ` (+${pendingCount})` : ""}`}
            data-testid="log-status-paused"
            style={{ backgroundColor: "var(--colorWarning)", color: "#111", fontWeight: 700 }}
          />
        )}
        {status === "RECONNECTING" && (
          <Badge
            label="RECONNECTING"
            data-testid="log-status-reconnecting"
            style={{ backgroundColor: "var(--colorWarning)", color: "#111", fontWeight: 700 }}
          />
        )}
        {status === "ERROR" && (
          <Badge
            label="ERROR"
            tooltip={error}
            data-testid="log-status-error"
            style={{ backgroundColor: "var(--colorError)", color: "#fff", fontWeight: 700 }}
          />
        )}

        {/* Truncated indicator */}
        {isTruncated && (
          <Badge
            label={`TRUNCATED (-${truncatedCount})`}
            tooltip="Buffer limit reached. Oldest lines were dropped to protect memory."
            data-testid="log-status-truncated"
            style={{ opacity: 0.8 }}
          />
        )}

        {since && (
          <span>
            Logs from
            {" "}
            <b>{new Date(since).toLocaleString()}</b>
          </span>
        )}
      </div>

      <div className="flex gaps align-center">
        {/* Pause / Resume Button */}
        {isPaused ? (
          <Button
            primary
            label={`Resume${pendingCount > 0 ? ` (+${pendingCount})` : ""}`}
            data-testid="log-resume-btn"
            onClick={model.resume}
          />
        ) : (
          <Button
            plain
            label="Pause"
            data-testid="log-pause-btn"
            onClick={model.pause}
          />
        )}

        <Checkbox
          label="Word wrap"
          value={wordWrap}
          onChange={toggleWordWrap}
          className="word-wrap"
          data-testid="log-word-wrap-checkbox"
        />

        <Checkbox
          label="Show timestamps"
          value={showTimestamps}
          onChange={toggleTimestamps}
          className="show-timestamps"
          data-testid="log-show-timestamps-checkbox"
        />

        <Checkbox
          label="Show previous terminated container"
          value={previous}
          onChange={togglePrevious}
          className="show-previous"
          data-testid="log-show-previous-checkbox"
        />

        {/* Since Selector */}
        <div className="flex gaps align-center" style={{ minWidth: 90 }}>
          <span style={{ fontSize: 11, color: "var(--textColorSecondary)" }}>Since:</span>
          <Select<number | undefined, SelectOption<number | undefined>, false>
            id="log-since-select"
            data-testid="log-since-select"
            menuPortalTarget={null}
            options={sinceOptions}
            value={selectedSince}
            onChange={onSinceChange}
          />
        </div>

        {/* Tail Selector */}
        <div className="flex gaps align-center" style={{ minWidth: 90 }}>
          <span style={{ fontSize: 11, color: "var(--textColorSecondary)" }}>Tail:</span>
          <Select<number | undefined, SelectOption<number | undefined>, false>
            id="log-tail-select"
            data-testid="log-tail-select"
            menuPortalTarget={null}
            options={tailOptions}
            value={selectedTail}
            onChange={onTailChange}
          />
        </div>

        {/* Raw | JSON Format Toggle */}
        <Button
          plain={!isJson}
          primary={isJson}
          label={isJson ? "JSON" : "Raw"}
          tooltip="Toggle Raw / JSON structured logs"
          data-testid="log-format-toggle"
          onClick={toggleJsonFormat}
        />

        <DownloadLogsDropdown
          disabled={logs.length === 0}
          downloadVisibleLogs={model.downloadLogs}
          downloadAllLogs={model.downloadAllLogs}
        />
      </div>
    </div>
  );
});
