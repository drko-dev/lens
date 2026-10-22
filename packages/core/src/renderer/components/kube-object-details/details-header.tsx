/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./details-header.module.scss";
import React from "react";
import type { KubeObject } from "@openlens/kube-object";
import { Icon } from "../icon";

type Tone = "ok" | "warn" | "err";

const phaseTone: Record<string, Tone> = {
  Running: "ok", Succeeded: "ok", Active: "ok", Bound: "ok", Ready: "ok",
  Pending: "warn", Terminating: "warn", Released: "warn",
  Failed: "err", Unknown: "err", Lost: "err",
};

/** Derives a status only from data already on the object; undefined when not derivable. */
export function getHeaderStatus(object: KubeObject): { text: string; tone: Tone } | undefined {
  const status = (object as { status?: Record<string, unknown> }).status;
  const spec = (object as { spec?: Record<string, unknown> }).spec;

  if (!status) return undefined;

  if (typeof spec?.replicas === "number") {
    const ready = typeof status.readyReplicas === "number" ? status.readyReplicas : 0;

    return { text: `${ready}/${spec.replicas} ready`, tone: ready === spec.replicas ? "ok" : "warn" };
  }

  const text = typeof status.phase === "string" ? status.phase : undefined;

  if (!text) return undefined;

  return { text, tone: phaseTone[text] ?? "warn" };
}

export function DetailsHeader({ object }: { object: KubeObject }) {
  const namespace = object.getNs();
  const status = getHeaderStatus(object);

  return (
    <div className={styles.DetailsHeader} data-testid="details-header">
      <div className={styles.kind}>
        <Icon material="deployed_code" className={styles.kindIcon} />
        <span data-testid="details-header-kind">{object.kind}</span>
      </div>
      <div className={styles.name} data-testid="details-header-name">{object.getName()}</div>
      <div className={styles.chips}>
        {namespace && <span className={styles.chip} data-testid="details-header-namespace">{namespace}</span>}
        {status && (
          <span className={`${styles.chip} ${styles[status.tone]}`} data-testid="details-header-status">
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}
