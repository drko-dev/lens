/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./resource-quota-headroom.scss";
import React from "react";
import { observer } from "mobx-react";
import type { ResourceQuota } from "@openlens/kube-object";
import type { HeadroomMetric, ResourceQuotaHeadroomReport } from "./headroom-calculator";
import { calculateQuotaHeadroom } from "./headroom-calculator";
import { cssNames } from "@openlens/utilities";

export interface ResourceQuotaHeadroomProps {
  quotas: ResourceQuota[];
  title?: string;
  className?: string;
}

export const HeadroomMetricItem: React.FC<{ metric: HeadroomMetric }> = ({ metric }) => {
  const { resourceName, usedFormatted, hardFormatted, percentage, status } = metric;
  const statusClass = status === "N/A" ? "status-na" : `status-${status}`;
  const barWidth = percentage !== undefined ? Math.min(Math.max(percentage, 0), 100) : 0;

  return (
    <div className="metric-item" data-testid={`headroom-metric-${resourceName}`}>
      <div className="metric-label-row">
        <span className="metric-name">{resourceName}</span>
        <span className={cssNames("metric-badge", statusClass)} data-testid={`badge-${resourceName}`}>
          {status}
        </span>
      </div>

      <div className="metric-values">
        <span className="usage-numbers">
          {usedFormatted}
          {" "}
          /
          {hardFormatted}
        </span>
        <span className={cssNames("usage-pct", statusClass)}>
          {percentage !== undefined ? `${percentage.toFixed(1)}%` : "N/A"}
        </span>
      </div>

      <div className="progress-bar-track">
        <div
          className={cssNames("progress-bar-fill", statusClass)}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
};

export const ResourceQuotaHeadroomCard: React.FC<{ report: ResourceQuotaHeadroomReport }> = ({ report }) => {
  const { quotaName, namespace, scopes, metrics } = report;

  return (
    <div className="quota-card" data-testid={`quota-headroom-card-${quotaName}`}>
      <div className="quota-header">
        <div className="quota-title">
          <span>{quotaName}</span>
          <span style={{ opacity: 0.6, fontSize: "11px", marginLeft: "8px" }}>
            (
            {namespace}
            )
          </span>
        </div>
        {scopes && scopes.length > 0 && (
          <div className="quota-scopes">
            Scopes:
            {" "}
            {scopes.join(", ")}
          </div>
        )}
      </div>

      <div className="metric-grid">
        {metrics.map(metric => (
          <HeadroomMetricItem key={metric.resourceName} metric={metric} />
        ))}
      </div>
    </div>
  );
};

export const ResourceQuotaHeadroom: React.FC<ResourceQuotaHeadroomProps> = observer(({
  quotas,
  title,
  className,
}) => {
  if (!quotas || quotas.length === 0) {
    return null;
  }

  const reports = quotas.map(q => calculateQuotaHeadroom(q));

  return (
    <div className={cssNames("ResourceQuotaHeadroom", className)} data-testid="resource-quota-headroom">
      {title && <h4 style={{ margin: "8px 0 12px", fontSize: "13px", fontWeight: 600 }}>{title}</h4>}
      {reports.map(report => (
        <ResourceQuotaHeadroomCard key={`${report.namespace}-${report.quotaName}`} report={report} />
      ))}
    </div>
  );
});
