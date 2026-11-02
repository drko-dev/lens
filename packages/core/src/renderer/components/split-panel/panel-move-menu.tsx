/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Icon } from "../icon";
import type { DockPosition, SplitPanelStore } from "./split-panel-store";
import { dockLeafInTree } from "./split-panel-store";
import { getCatalogItem } from "./panel-catalog";
import type { SplitLayoutLeaf } from "./split-panel-types";

const positions: readonly { position: DockPosition; label: (title: string) => string }[] = [
  { position: "left", label: (t) => `Left of ${t}` },
  { position: "right", label: (t) => `Right of ${t}` },
  { position: "top", label: (t) => `Above ${t}` },
  { position: "bottom", label: (t) => `Below ${t}` },
  { position: "center", label: (t) => `Group with ${t}` },
];

const titleOf = (leaf: SplitLayoutLeaf) => leaf.title || getCatalogItem(leaf.panelKind)?.defaultTitle || leaf.panelKind;

export interface PanelMoveMenuProps {
  readonly leaf: SplitLayoutLeaf;
  readonly splitPanelStore: SplitPanelStore;
}

/**
 * Keyboard alternative to dragging a panel header (H7.3). Each option is a
 * dockPanel() call, so it follows the same rules as drag and drop; moves that
 * dockLeafInTree rejects are not offered.
 */
export const PanelMoveMenu = observer(({ leaf, splitPanelStore }: PanelMoveMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const options = isOpen
    ? splitPanelStore.allActiveLeaves
      .filter((target) => target.id !== leaf.id && !splitPanelStore.isLeafCollapsed(target.id))
      .flatMap((target) => positions
        .filter(({ position }) => dockLeafInTree(splitPanelStore.rootNode, leaf.id, target.id, position))
        .map(({ position, label }) => ({ key: `${position}-${target.id}`, target, position, label: label(titleOf(target)) })))
    : [];

  useEffect(() => {
    if (isOpen) {
      menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]")[activeIndex]?.focus();
    }
  }, [isOpen, activeIndex]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const select = (index: number) => {
    const option = options[index];

    setIsOpen(false);

    if (option && splitPanelStore.dockPanel(leaf.id, option.target.id, option.position, splitPanelStore.clusterId)) {
      // The moved panel re-mounts in its new place; keep focus on it.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="panel-move-button-${leaf.id}"]`)?.focus());
    } else {
      triggerRef.current?.focus();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActiveIndex((activeIndex + 1) % options.length),
      ArrowUp: () => setActiveIndex((activeIndex - 1 + options.length) % options.length),
      Home: () => setActiveIndex(0),
      End: () => setActiveIndex(options.length - 1),
      Enter: () => select(activeIndex),
      " ": () => select(activeIndex),
      Escape: close,
      Tab: close,
    };

    if (!options.length && event.key !== "Escape" && event.key !== "Tab") {
      return;
    }

    if (keys[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      keys[event.key]();
    }
  };

  return (
    <div className={styles.moveMenuContainer}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.leafActionBtn}
        aria-label={`Move ${titleOf(leaf)} panel`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Move panel"
        onClick={() => {
          setActiveIndex(0);
          setIsOpen(!isOpen);
        }}
        data-testid={`panel-move-button-${leaf.id}`}
      >
        <Icon material="open_with" small />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Move ${titleOf(leaf)} panel`}
          className={styles.moveDropdown}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!menuRef.current?.contains(event.relatedTarget as Node | null)) {
              setIsOpen(false);
            }
          }}
          data-testid={`panel-move-menu-${leaf.id}`}
        >
          {options.length === 0 && <div className={styles.moveMenuHeader}>No other panel to move next to</div>}
          {options.map((option, index) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              className={styles.moveMenuItem}
              onClick={() => select(index)}
              data-testid={`panel-move-option-${option.position}-${option.target.id}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
