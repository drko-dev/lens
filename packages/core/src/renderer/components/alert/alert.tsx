/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./alert.scss";
import React from "react";
import { Icon } from "../icon";

export interface AlertProps {
  type?: "info" | "warning" | "danger";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

const icons = { info: "info", warning: "warning", danger: "error" } as const;

export const Alert: React.FC<AlertProps> = ({ type = "info", title, children, className, "data-testid": testId }) => (
  <div
    className={["Alert", `type-${type}`, className].filter(Boolean).join(" ")}
    role={type === "info" ? "status" : "alert"}
    data-testid={testId}
  >
    <Icon material={icons[type]} />
    <div className="content">
      {title && <div className="title">{title}</div>}
      {children}
    </div>
  </div>
);
