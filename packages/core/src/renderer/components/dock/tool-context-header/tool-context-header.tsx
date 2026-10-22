/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./tool-context-header.module.scss";
import React from "react";
import type { ClusterEnvironmentConfig } from "../../../../common/cluster/environment-types";
import { EnvironmentBadge } from "../../environment-badge";

export interface ToolContextHeaderProps {
  clusterName: string;
  namespace?: string;
  environment?: ClusterEnvironmentConfig;
  session?: "active" | "paused" | "disconnected" | "connecting";
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
  children?: React.ReactNode;
}

export const ToolContextHeader: React.FC<ToolContextHeaderProps> = ({
  clusterName, namespace, environment, session, title, actions, className, children, "data-testid": testId,
}) => {
  const isProd = environment?.id === "production";

  return (
    <div
      className={[styles.header, isProd && styles.prod, className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      <div className={styles.row}>
        {environment && environment.id !== "none" && <EnvironmentBadge environment={environment} />}
        <span className={styles.cluster} title={clusterName}>{clusterName}</span>
        {namespace && <span className={styles.chip} title={namespace}>{namespace}</span>}
        {title && <span className={styles.title}>{title}</span>}
        <span className={styles.spacer} />
        {session && (
          <span className={`${styles.session} ${styles[session]}`} data-session={session}>
            <span className={styles.dot} aria-hidden="true" />
            {session}
          </span>
        )}
        {actions && <span className={styles.actions}>{actions}</span>}
      </div>
      {children}
    </div>
  );
};
