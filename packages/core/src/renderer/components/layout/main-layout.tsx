/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./main-layout.module.scss";

import React from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import type { LensTheme } from "../../themes/lens-theme";
import activeThemeInjectable from "../../themes/active.injectable";
import { novakubeThemeName } from "../../themes/novakube.injectable";
import type { StrictReactNode } from "@openlens/utilities";
import { cssNames } from "@openlens/utilities";
import { ErrorBoundary } from "@openlens/error-boundary";
import { ResizeDirection, ResizeGrowthDirection, ResizeSide, ResizingAnchor } from "@openlens/resizing-anchor";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { SidebarStorageState } from "./sidebar-storage/sidebar-storage.injectable";
import sidebarStorageInjectable, { defaultSidebarWidth } from "./sidebar-storage/sidebar-storage.injectable";
import type { StorageLayer } from "../../utils/storage-helper";

export interface MainLayoutProps {
  sidebar: StrictReactNode;
  className?: string;
  footer?: StrictReactNode;
  children?: StrictReactNode;
}

/**
 * Main layout is commonly used as a wrapper for "global pages"
 *
 * @link https://api-docs.k8slens.dev/master/extensions/capabilities/common-capabilities/#global-pages
 */

interface Dependencies {
  sidebarStorage: StorageLayer<SidebarStorageState>;
  activeTheme: IComputedValue<LensTheme>;
}

@observer
class NonInjectedMainLayout extends React.Component<MainLayoutProps & Dependencies> {
  onSidebarResize = (width: number) => {
    this.props.sidebarStorage.merge({ width });
  };

  render() {
    const { className, footer, children, sidebar } = this.props;
    const { width: sidebarWidth } = this.props.sidebarStorage.get();
    const isNovaKube = this.props.activeTheme.get().name === novakubeThemeName;
    // Lens 2026.10 navigator is 308px. Only use it for NovaKube's untouched
    // default width; user-resized sidebars still use their persisted width.
    const effectiveWidth = isNovaKube && sidebarWidth === defaultSidebarWidth ? 308 : sidebarWidth;
    const style = { "--sidebar-width": `${effectiveWidth}px` } as React.CSSProperties;

    return (
      <div className={cssNames(styles.mainLayout, className)} style={style}>
        <div className={styles.sidebar} data-testid="cluster-nav-column">
          {sidebar}
          <ResizingAnchor
            direction={ResizeDirection.HORIZONTAL}
            placement={ResizeSide.TRAILING}
            growthDirection={ResizeGrowthDirection.LEFT_TO_RIGHT}
            getCurrentExtent={() => effectiveWidth}
            onDrag={this.onSidebarResize}
            onDoubleClick={() => this.onSidebarResize(isNovaKube ? 308 : defaultSidebarWidth)}
            minExtent={150}
            maxExtent={400}
          />
        </div>

        <div className={styles.contents} data-testid="cluster-content-column">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>

        <div className={styles.footer}>{footer}</div>
      </div>
    );
  }
}

export const MainLayout = withInjectables<Dependencies, MainLayoutProps>(NonInjectedMainLayout, {
  getProps: (di, props) => ({
    ...props,
    sidebarStorage: di.inject(sidebarStorageInjectable),
    activeTheme: di.inject(activeThemeInjectable),
  }),
});

