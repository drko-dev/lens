/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./welcome.scss";
import React from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import type { CarouselProps } from "react-material-ui-carousel";
import LegacyCarousel from "react-material-ui-carousel";
import { Icon } from "../icon";
import OpenLensDevOpsApprovedMark from "../icon/openlens-devops-approved.png";
import { forumsUrl } from "../../../common/vars";
import { withInjectables } from "@ogre-tools/injectable-react";
import welcomeMenuItemsInjectable from "./welcome-menu-items/welcome-menu-items.injectable";
import type { WelcomeMenuRegistration } from "./welcome-menu-items/welcome-menu-registration";
import welcomeBannerItemsInjectable from "./welcome-banner-items/welcome-banner-items.injectable";
import type { WelcomeBannerRegistration } from "./welcome-banner-items/welcome-banner-registration";
import productNameInjectable from "../../../common/vars/product-name.injectable";
import catalogEntityRegistryInjectable from "../../api/catalog/entity/registry.injectable";
import type { CatalogEntityRegistry } from "../../api/catalog/entity/registry";
import activeHotbarInjectable from "../../../features/hotbar/storage/common/active.injectable";
import type { Hotbar } from "../../../features/hotbar/storage/common/hotbar";
import navigateToCatalogInjectable from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import navigateToAddClusterInjectable from "../../../common/front-end-routing/routes/add-cluster/navigate-to-add-cluster.injectable";
import navigateToClusterViewInjectable from "../../../common/front-end-routing/routes/cluster-view/navigate-to-cluster-view.injectable";
import type { NavigateToClusterView } from "../../../common/front-end-routing/routes/cluster-view/navigate-to-cluster-view.injectable";
import startDemoClusterInjectable from "../../demo-cluster/start-demo-cluster.injectable";
import type { StartDemoCluster } from "../../demo-cluster/start-demo-cluster.injectable";
import resolveEntityEnvironmentInjectable from "../catalog/resolve-entity-environment.injectable";
import type { ResolveEntityEnvironment } from "../catalog/resolve-entity-environment.injectable";
import { EnvironmentBadge } from "../environment-badge";
import type { ClusterEnvironmentConfig } from "../../../common/cluster/environment-types";
import { isKubernetesCluster } from "../../../common/catalog-entities/kubernetes-cluster";

export const defaultWidth = 320;

// This is to fix some react 18 type errors
const Carousel = LegacyCarousel as React.ComponentType<CarouselProps>;

interface Dependencies {
  welcomeMenuItems: IComputedValue<WelcomeMenuRegistration[]>;
  welcomeBannerItems: IComputedValue<WelcomeBannerRegistration[]>;
  productName: string;
  catalogEntityRegistry: CatalogEntityRegistry;
  activeHotbar: IComputedValue<Hotbar | undefined>;
  navigateToCatalog: () => void;
  navigateToAddCluster: () => void;
  resolveEntityEnvironment: ResolveEntityEnvironment;
  startDemoCluster: StartDemoCluster;
  navigateToClusterView: NavigateToClusterView;
}

const NonInjectedWelcome = observer(({
  welcomeMenuItems,
  welcomeBannerItems,
  productName,
  catalogEntityRegistry,
  activeHotbar,
  navigateToCatalog,
  navigateToAddCluster,
  resolveEntityEnvironment,
  startDemoCluster,
  navigateToClusterView,
}: Dependencies) => {
  const welcomeBanners = welcomeBannerItems.get();

  const SingleBanner = welcomeBanners.length === 1 ? welcomeBanners[0].Banner : undefined;

  // R5-08: read-only local workspace summary; never connects to a cluster
  const clusters = catalogEntityRegistry.items.get().filter(isKubernetesCluster);
  const pinnedCount = activeHotbar.get()?.items.filter(item => item != null).length ?? 0;
  const environmentCounts = new Map<ClusterEnvironmentConfig, number>();

  for (const cluster of clusters) {
    const environment = resolveEntityEnvironment(cluster);

    if (environment && environment.id !== "none") {
      environmentCounts.set(environment, (environmentCounts.get(environment) ?? 0) + 1);
    }
  }

  // if there is banner with specified width, use it to calculate the width of the container
  const maxWidth = Math.max(
    ...welcomeBanners.map(banner => banner.width ?? 0),
    defaultWidth,
  );

  return (
    <div className="flex justify-center Welcome align-center" data-testid="welcome-page">
      <div
        style={{ width: `${maxWidth}px` }}
        data-testid="welcome-banner-container"
      >
        {welcomeBanners.length > 1 ? (
          <Carousel
            stopAutoPlayOnHover={true}
            indicators={true}
            autoPlay={true}
            navButtonsAlwaysInvisible={true}
            indicatorIconButtonProps={{
              style: {
                color: "var(--iconActiveBackground)",
              },
            }}
            activeIndicatorIconButtonProps={{
              style: {
                color: "var(--iconActiveColor)",
              },
            }}
            interval={8000}
          >
            {welcomeBanners.map((item, index) => (
              <item.Banner key={index} />
            ))}
          </Carousel>
        ) : SingleBanner ? (
          <SingleBanner />
        ) : (
          <img
            src={OpenLensDevOpsApprovedMark}
            className="logo devops-brand"
            alt="OpenLens DevOps"
            data-testid="openlens-devops-brand-icon"
            draggable={false}
          />
        )}

        <div className="flex justify-center">
          <div
            style={{ width: `${defaultWidth}px` }}
            data-testid="welcome-text-container"
          >
            <h2>{productName}</h2>
            <p className="purpose">
              Your local workspace for Kubernetes clusters. Nothing connects until you open a cluster.
            </p>

            <div className="actions">
              <button
                className="primary"
                data-testid="welcome-launch-demo-cluster"
                onClick={async () => {
                  const status = await startDemoCluster();

                  if (status.clusterId) {
                    // The catalog watcher publishes the demo asynchronously; avoid navigating before it exists.
                    for (let attempt = 0; attempt < 40; attempt++) {
                      if (catalogEntityRegistry.getById(status.clusterId)) {
                        navigateToClusterView(status.clusterId);

                        return;
                      }
                      await new Promise(resolve => setTimeout(resolve, 150));
                    }
                    navigateToCatalog();
                  }
                }}
              >
                Launch demo cluster
              </button>
              <button
                data-testid="welcome-open-catalog"
                onClick={() => navigateToCatalog()}
              >
                Open catalog
              </button>
              <button
                data-testid="welcome-add-cluster"
                onClick={() => navigateToAddCluster()}
              >
                Add cluster
              </button>
            </div>

            <div className="summary" data-testid="welcome-workspace-summary">
              <span>{`${clusters.length} ${clusters.length === 1 ? "cluster" : "clusters"}`}</span>
              <span>{`${pinnedCount} pinned`}</span>
              {[...environmentCounts].map(([environment, count]) => (
                <span key={environment.id} className="env-count">
                  <EnvironmentBadge environment={environment} />
                  {count}
                </span>
              ))}
            </div>

            <ul
              className="block"
              style={{ width: `${defaultWidth}px` }}
              data-testid="welcome-menu-container"
            >
              {welcomeMenuItems.get().map((item, index) => (
                <li
                  key={index}
                  className="flex grid-12"
                  onClick={() => item.click()}
                >
                  <Icon material={item.icon} className="box col-1" />
                  <a className="box col-10">
                    {typeof item.title === "string"
                      ? item.title
                      : item.title()}
                  </a>
                  <Icon material="navigate_next" className="box col-1" />
                </li>
              ))}
            </ul>

            <p className="footer">
              {"Questions or feedback? Join the "}
              <a
                href={forumsUrl}
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Lens Forums
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

export const Welcome = withInjectables<Dependencies>(NonInjectedWelcome, {
  getProps: (di) => ({
    welcomeMenuItems: di.inject(welcomeMenuItemsInjectable),
    welcomeBannerItems: di.inject(welcomeBannerItemsInjectable),
    productName: di.inject(productNameInjectable),
    catalogEntityRegistry: di.inject(catalogEntityRegistryInjectable),
    activeHotbar: di.inject(activeHotbarInjectable),
    navigateToCatalog: di.inject(navigateToCatalogInjectable),
    navigateToAddCluster: di.inject(navigateToAddClusterInjectable),
    resolveEntityEnvironment: di.inject(resolveEntityEnvironmentInjectable),
    startDemoCluster: di.inject(startDemoClusterInjectable),
    navigateToClusterView: di.inject(navigateToClusterViewInjectable),
  }),
});
