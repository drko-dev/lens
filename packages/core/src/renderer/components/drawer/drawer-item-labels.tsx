/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useState } from "react";
import type { DrawerItemProps } from "./drawer-item";
import { DrawerItem } from "./drawer-item";
import { Badge } from "../badge";
import { KubeObject } from "@openlens/kube-object";
import { Icon } from "../icon";

export interface DrawerItemLabelsProps extends DrawerItemProps {
  labels: string[] | Partial<Record<string, string>>;
  /**
   * Lens-style collapsed presentation: show "<count> <name>" and let the user
   * expand the badges with the toggle next to the item name.
   */
  collapsible?: boolean;
}

export function DrawerItemLabels(props: DrawerItemLabelsProps) {
  const { labels, collapsible = false, name, ...itemProps } = props;
  const [expanded, setExpanded] = useState(false);

  if (!labels || typeof labels !== "object") {
    return null;
  }

  const labelStrings = Array.isArray(labels)
    ? labels
    : KubeObject.stringifyLabels(labels);

  if (labelStrings.length === 0) {
    return null;
  }

  if (collapsible) {
    const toggleName = (
      <button
        type="button"
        className="drawer-item-labels-toggle"
        aria-expanded={expanded}
        data-testid="drawer-item-labels-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {name}
        <Icon material="unfold_more" small />
      </button>
    );

    if (!expanded) {
      return (
        <DrawerItem {...itemProps} name={toggleName}>
          {`${labelStrings.length} ${name}`}
        </DrawerItem>
      );
    }

    return (
      <DrawerItem {...itemProps} name={toggleName} labelsOnly>
        {labelStrings.map(label => (
          <Badge key={label} label={label} title={label} />
        ))}
      </DrawerItem>
    );
  }

  return (
    <DrawerItem {...itemProps} name={name} labelsOnly>
      {labelStrings.map(label => (
        <Badge
          key={label}
          label={label}
          title={label}
        />
      ))}
    </DrawerItem>
  );
}
