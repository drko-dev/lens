/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./dock-tabs.module.scss";

import React, { Fragment, useEffect, useRef, useState } from "react";
import { Tabs } from "../tabs/tabs";
import { DockTab } from "./dock-tab";
import type { DockTab as DockTabModel } from "./dock/store";
import { TabKind } from "./dock/store";
import { TerminalTab } from "./terminal/dock-tab";
import { cssVar } from "@openlens/utilities";
import { useResizeObserver } from "../../hooks";
import { Icon } from "../icon";
import { Menu, MenuItem } from "../menu";

export interface DockTabsProps {
  tabs: DockTabModel[];
  autoFocus: boolean;
  selectedTab: DockTabModel | undefined;
  onChangeTab: (tab: DockTabModel) => void;
}

export const DockTabs = ({ tabs, autoFocus, selectedTab, onChangeTab }: DockTabsProps) => {
  const elem = useRef<HTMLDivElement | null>(null);
  const minTabSize = useRef<number>(0);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const getTabElements = (): HTMLDivElement[] => {
    return Array.from(elem.current?.querySelectorAll(".Tabs .Tab") ?? []);
  };

  const renderTab = (tab?: DockTabModel) => {
    if (!tab) {
      return null;
    }

    switch (tab.kind) {
      case TabKind.CREATE_RESOURCE:
      case TabKind.EDIT_RESOURCE:
        return <DockTab value={tab} icon="edit" />;
      case TabKind.INSTALL_CHART:
      case TabKind.UPGRADE_CHART:
        return <DockTab value={tab} icon="install_desktop" />;
      case TabKind.POD_LOGS:
        return <DockTab value={tab} icon="subject" />;
      case TabKind.TERMINAL:
        return <TerminalTab value={tab} />;
    }
  };

  const scrollActiveTabIntoView = () => {
    const tab = elem.current?.querySelector(".Tab.active");

    tab?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  };

  const getScroller = () => elem.current?.children[0] as HTMLElement | undefined;

  const updateOverflow = () => {
    const scroller = getScroller();

    setOverflowing(Boolean(scroller && scroller.scrollWidth > scroller.clientWidth));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

    if (!step) return;

    const tabEls = getTabElements();
    const index = tabEls.findIndex(el => el === document.activeElement);

    if (index < 0) return;

    event.preventDefault();
    tabEls[(index + step + tabEls.length) % tabEls.length]?.focus();
  };

  const updateScrollbarVisibility = () => {
    const allTabsShrunk = getTabElements().every(tab => tab.offsetWidth == minTabSize.current);

    setShowScrollbar(allTabsShrunk);
  };

  const scrollTabsWithMouseWheel = (left: number) => {
    elem.current?.children[0]?.scrollBy({ left });
  };

  const onMouseWheel = (event: React.WheelEvent) => {
    scrollTabsWithMouseWheel(event.deltaY);
  };

  useEffect(() => {
    if (elem.current) {
      const cssVars = cssVar(elem.current);

      minTabSize.current = cssVars.get("--min-tab-width").valueOf();
    }
  });

  useResizeObserver(elem.current, () => {
    scrollActiveTabIntoView();
    updateScrollbarVisibility();
    updateOverflow();
  });

  useEffect(() => {
    scrollActiveTabIntoView();
    updateOverflow();
  }, [selectedTab?.id, tabs.length]);

  return (
    <div
      className={styles.dockTabs}
      ref={elem}
      role="tablist"
      onKeyDown={onKeyDown}
    >
      <Tabs
        autoFocus={autoFocus}
        value={selectedTab}
        onChange={onChangeTab}
        onWheel={onMouseWheel}
        scrollable={showScrollbar}
        className={styles.tabs}
      >
        {tabs.map(tab => <Fragment key={tab.id}>{renderTab(tab)}</Fragment>)}
      </Tabs>
      {overflowing && (
        <div className={styles.overflowControls}>
          <button
            type="button"
            className={styles.overflowButton}
            aria-label="Scroll tabs left"
            onClick={() => scrollTabsWithMouseWheel(-200)}
          >
            <Icon small material="chevron_left" />
          </button>
          <button
            type="button"
            className={styles.overflowButton}
            aria-label="Scroll tabs right"
            onClick={() => scrollTabsWithMouseWheel(200)}
          >
            <Icon small material="chevron_right" />
          </button>
          <button
            type="button"
            id="dock-tabs-all-menu"
            className={styles.overflowButton}
            aria-label="All dock tabs"
            aria-haspopup="menu"
          >
            <Icon small material="arrow_drop_down" />
          </button>
          <Menu
            usePortal
            htmlFor="dock-tabs-all-menu"
            isOpen={menuOpen}
            open={() => setMenuOpen(true)}
            close={() => setMenuOpen(false)}
          >
            {tabs.map(tab => (
              <MenuItem
                key={tab.id}
                active={tab.id === selectedTab?.id}
                onClick={() => onChangeTab(tab)}
              >
                {tab.title}
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}
    </div>
  );
};
