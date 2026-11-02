/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DockPosition } from "../../../renderer/components/split-panel/split-panel-store";

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

// Outer quarter of each side docks to that side; the inner area groups as a tab.
const EDGE_FRACTION = 0.25;

export function getDockPosition(box: Box, x: number, y: number): DockPosition {
  const fx = box.width > 0 ? (x - box.left) / box.width : 0.5;
  const fy = box.height > 0 ? (y - box.top) / box.height : 0.5;
  const distances: [DockPosition, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ];
  const [nearest, distance] = distances.reduce((best, entry) => (entry[1] < best[1] ? entry : best));

  return distance < EDGE_FRACTION ? nearest : "center";
}

/** Area that the drop would occupy, used for the single preview overlay. */
export function getDropPreviewBox(box: Box, position: DockPosition): Box {
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;

  switch (position) {
    case "left": return { ...box, width: halfWidth };
    case "right": return { ...box, left: box.left + halfWidth, width: halfWidth };
    case "top": return { ...box, height: halfHeight };
    case "bottom": return { ...box, top: box.top + halfHeight, height: halfHeight };
    default: return box;
  }
}
