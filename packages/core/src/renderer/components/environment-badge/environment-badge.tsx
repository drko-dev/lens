/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./environment-badge.scss";
import React from "react";
import type { ClusterEnvironmentConfig } from "../../../common/cluster/environment-types";
import { Icon } from "../icon";

export interface EnvironmentBadgeProps {
  environment: ClusterEnvironmentConfig;
  size?: "sm" | "md";
  showNone?: boolean;
  className?: string;
  title?: string;
  "data-testid"?: string;
}

export const EnvironmentBadge: React.FC<EnvironmentBadgeProps> = ({
  environment,
  size = "sm",
  showNone = false,
  className,
  title,
  "data-testid": testId,
}) => {
  if (environment.id === "none" && !showNone) return null;

  return (
    <span
      className={["EnvironmentBadge", `env-${environment.id}`, `size-${size}`, className].filter(Boolean).join(" ")}
      data-env={environment.id}
      data-testid={testId}
      title={title ?? environment.label}
      aria-label={`Environment: ${environment.label}`}
    >
      {environment.id === "production" && <Icon material="warning" small />}
      {environment.shortLabel}
    </span>
  );
};
