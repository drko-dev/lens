/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./info-line.scss";

import React from "react";
import { observer } from "mobx-react";
import { Badge } from "../../badge";
import type { LogTabViewModel } from "./logs-view-model";

export interface LogInfoLineProps {
  model: LogTabViewModel;
}

export const LogInfoLine = observer(({ model }: LogInfoLineProps) => {
  const tabData = model.logTabData.get();
  const pod = model.pod.get();

  if (!tabData || !pod) {
    return null;
  }

  const { owner } = tabData;
  const logs = model.timestampSplitLogs.get();
  const since = logs.length ? logs[0][0] : null;
  const status = model.status.get();
  const pendingCount = model.pendingCount.get();
  const isTruncated = model.isTruncated.get();
  const truncatedCount = model.truncatedCount.get();
  const podUid = model.podUid.get();

  return (
    <div className="LogInfoLine" data-testid="log-info-line">
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
          tooltip={model.error.get()}
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

      {/* Cluster Context Badge (R4-04) */}
      <span
        data-testid={`logs-cluster-context-${tabData.selectedPodId || "logs"}`}
        className="cluster-context"
        style={{
          backgroundColor: model.isProduction ? "rgba(235, 87, 87, 0.15)" : "var(--boxBackground)",
          border: `1px solid ${model.isProduction ? "#eb5757" : model.accentColor || "var(--border)"}`,
        }}
      >
        <span style={{ fontWeight: 600, color: model.accentColor }}>
          {model.clusterName || "Cluster"}
        </span>
        {model.environment && model.environment !== "none" && (
          <Badge
            label={model.environment.toUpperCase()}
            style={{
              fontSize: "10px",
              padding: "1px 4px",
              backgroundColor: model.isProduction ? "#eb5757" : model.accentColor,
              color: "#fff",
              fontWeight: 700,
            }}
          />
        )}
        {model.isProduction && (
          <Badge
            label="⚠️ PROD"
            data-testid="logs-prod-hazard"
            style={{
              fontSize: "10px",
              padding: "1px 4px",
              backgroundColor: "#eb5757",
              color: "#fff",
              fontWeight: 700,
            }}
          />
        )}
      </span>

      <span className="displaying">
        Displaying logs from Namespace:
        {" "}
        <b data-testid="namespace-badge">{pod.getNs()}</b>
        {owner && (
          <>
            {" "}
            Owner:
            {" "}
            <b data-testid="owner-badge">{`${owner.kind} ${owner.name}`}</b>
          </>
        )}
        {" "}
        for Pod:
        {" "}
        <b data-testid="pod-name" title={podUid ? `UID: ${podUid}` : undefined}>{pod.getName()}</b>
        .
        {since && (
          <>
            {" "}
            Logs from
            {" "}
            <b>{new Date(since).toLocaleString()}</b>
          </>
        )}
      </span>

      {podUid && (
        <Badge
          data-testid="pod-uid-badge"
          label={`UID: ${podUid.slice(0, 8)}`}
          title={podUid}
          style={{ opacity: 0.7, fontSize: "10px" }}
        />
      )}
    </div>
  );
});
