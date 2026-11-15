/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { topBarItemOnRightSideInjectionToken } from "../top-bar-item-injection-token";
import { Icon } from "../../../../icon";
import activeEntityInjectable from "../../../../../api/catalog/entity/active.injectable";
import broadcastMessageInjectable from "../../../../../../common/ipc/broadcast-message.injectable";
import { IpcRendererNavigationEvents } from "../../../../../../common/ipc/navigation-events";
import navigateToPreferencesInjectable from "../../../../../../features/preferences/common/navigate-to-preferences.injectable";
import type { IComputedValue } from "mobx";
import type { CatalogEntity } from "../../../../../api/catalog-entity";

interface QuickActionDeps {
  activeEntity: IComputedValue<CatalogEntity | undefined>;
  broadcastMessage: (channel: string, ...args: unknown[]) => void;
  openPreferences: () => void;
}

const AiWorkbenchButton = withInjectables<QuickActionDeps>(
  observer(({ activeEntity, broadcastMessage, openPreferences }: QuickActionDeps) => (
    <button
      type="button"
      className="novakube-topbar-action novakube-topbar-ai"
      data-testid="topbar-ai-button"
      title="AI Diagnostics & Incident Workbench"
      aria-label="Open AI Diagnostics Workbench"
      onClick={() => {
        if (activeEntity.get()) {
          broadcastMessage(IpcRendererNavigationEvents.NAVIGATE_IN_CLUSTER, "/incidents");
        } else {
          openPreferences();
        }
      }}
    >
      <Icon material="smart_toy" smallest />
      <span>AI</span>
    </button>
  )),
  {
    getProps: (di) => ({
      activeEntity: di.inject(activeEntityInjectable),
      broadcastMessage: di.inject(broadcastMessageInjectable),
      openPreferences: di.inject(navigateToPreferencesInjectable),
    }),
  },
);

const NotificationsButton = withInjectables<QuickActionDeps>(
  observer(({ activeEntity, broadcastMessage, openPreferences }: QuickActionDeps) => (
    <button
      type="button"
      className="novakube-topbar-action novakube-topbar-notifications"
      data-testid="topbar-notifications-button"
      title="Cluster Incidents & Notifications"
      aria-label="Open Cluster Incidents"
      onClick={() => {
        if (activeEntity.get()) {
          broadcastMessage(IpcRendererNavigationEvents.NAVIGATE_IN_CLUSTER, "/incidents");
        } else {
          openPreferences();
        }
      }}
    >
      <Icon material="notifications_none" smallest />
    </button>
  )),
  {
    getProps: (di) => ({
      activeEntity: di.inject(activeEntityInjectable),
      broadcastMessage: di.inject(broadcastMessageInjectable),
      openPreferences: di.inject(navigateToPreferencesInjectable),
    }),
  },
);

export const aiWorkbenchTopBarItemInjectable = getInjectable({
  id: "novakube-ai-workbench-top-bar-item",
  instantiate: () => ({
    id: "novakube-ai-workbench",
    isShown: computed(() => true),
    orderNumber: 20,
    Component: AiWorkbenchButton,
  }),
  injectionToken: topBarItemOnRightSideInjectionToken,
});

export const notificationsTopBarItemInjectable = getInjectable({
  id: "novakube-notifications-top-bar-item",
  instantiate: () => ({
    id: "novakube-notifications",
    isShown: computed(() => true),
    orderNumber: 30,
    Component: NotificationsButton,
  }),
  injectionToken: topBarItemOnRightSideInjectionToken,
});
