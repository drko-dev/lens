/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useState } from "react";
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { topBarItemOnRightSideInjectionToken } from "../top-bar-item-injection-token";
import { Icon } from "../../../../icon";
import { Menu, MenuItem } from "../../../../menu";
import { Dialog } from "../../../../dialog";
import { Button } from "@openlens/button";
import activeEntityInjectable from "../../../../../api/catalog/entity/active.injectable";
import broadcastMessageInjectable from "../../../../../../common/ipc/broadcast-message.injectable";
import { IpcRendererNavigationEvents } from "../../../../../../common/ipc/navigation-events";
import navigateToPreferencesInjectable from "../../../../../../features/preferences/common/navigate-to-preferences.injectable";
import type { IComputedValue } from "mobx";
import type { CatalogEntity } from "../../../../../api/catalog-entity";

interface QuickActionDeps {
  activeEntity: IComputedValue<CatalogEntity | undefined>;
  broadcastMessage: (channel: string, ...args: unknown[]) => void;
  openPreferences: (tabId?: string) => void;
}

const SendFeedbackButton = observer(() => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  return (
    <>
      <button
        type="button"
        className="novakube-topbar-action novakube-topbar-feedback"
        data-testid="topbar-send-feedback-button"
        title="Send Feedback"
        aria-label="Send Feedback"
        onClick={() => {
          setCopied(false);
          setOpen(true);
        }}
      >
        <Icon material="feedback" smallest />
        <span>Send Feedback</span>
      </button>
      <Dialog isOpen={open} close={() => setOpen(false)} data-testid="send-feedback-dialog">
        <div className="flex column gaps" style={{ padding: 20, minWidth: 420 }}>
          <h3 style={{ margin: 0 }}>Send Feedback</h3>
          <p style={{ margin: 0, opacity: 0.8, fontSize: 13 }}>
            Write feedback or bug details for NovaKube (copied locally, never sent without your action).
          </p>
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe your feedback..."
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              background: "var(--inputControlBackground)",
              color: "var(--textColorPrimary)",
              border: "1px solid var(--borderColor)",
            }}
          />
          <div className="flex gaps justify-flex-end">
            <Button plain label="Cancel" onClick={() => setOpen(false)} />
            <Button
              primary
              disabled={!text.trim()}
              label={copied ? "Copied!" : "Copy Feedback"}
              onClick={() => {
                navigator.clipboard?.writeText(text.trim()).catch(() => {});
                setCopied(true);
                setTimeout(() => setOpen(false), 500);
              }}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
});

const AiWorkbenchButton = withInjectables<QuickActionDeps>(
  observer(({ activeEntity, broadcastMessage, openPreferences }: QuickActionDeps) => {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
      <div className="novakube-topbar-split-ai" data-testid="topbar-ai-split">
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
              openPreferences("external-tools");
            }
          }}
        >
          <Icon material="smart_toy" smallest />
          <span>AI</span>
        </button>
        <button
          type="button"
          id="topbar-ai-menu-trigger"
          className="novakube-topbar-action novakube-topbar-ai-caret"
          data-testid="topbar-ai-menu-toggle"
          aria-label="Select AI Tool"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Icon material="arrow_drop_down" smallest />
        </button>
        <Menu
          htmlFor="topbar-ai-menu-trigger"
          isOpen={menuOpen}
          open={() => setMenuOpen(true)}
          close={() => setMenuOpen(false)}
          usePortal
          data-testid="topbar-ai-dropdown"
        >
          <MenuItem onClick={() => { setMenuOpen(false); openPreferences("external-tools"); }}>
            <Icon material="terminal" small />
            <span>Claude Code</span>
          </MenuItem>
          <MenuItem onClick={() => { setMenuOpen(false); openPreferences("external-tools"); }}>
            <Icon material="terminal" small />
            <span>GitHub Copilot CLI</span>
          </MenuItem>
          <MenuItem onClick={() => { setMenuOpen(false); openPreferences("external-tools"); }}>
            <Icon material="terminal" small />
            <span>Gemini CLI</span>
          </MenuItem>
          <MenuItem onClick={() => { setMenuOpen(false); openPreferences("external-tools"); }}>
            <Icon material="terminal" small />
            <span>Codex CLI</span>
          </MenuItem>
          <MenuItem
            data-testid="topbar-ai-preferences"
            onClick={() => {
              setMenuOpen(false);
              openPreferences("external-tools");
            }}
          >
            <Icon material="settings" small />
            <span>Preferences (External Tools)</span>
          </MenuItem>
        </Menu>
      </div>
    );
  }),
  {
    getProps: (di) => ({
      activeEntity: di.inject(activeEntityInjectable),
      broadcastMessage: di.inject(broadcastMessageInjectable),
      openPreferences: di.inject(navigateToPreferencesInjectable),
    }),
  },
);

const UserAvatarButton = withInjectables<{ openPreferences: (tabId?: string) => void }>(
  observer(({ openPreferences }) => (
    <button
      type="button"
      className="novakube-topbar-avatar"
      data-testid="topbar-avatar-button"
      title="Local Workspace Profile — Open Preferences"
      aria-label="Workspace Profile"
      onClick={() => openPreferences()}
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: "var(--primary, #3d90ce)",
        color: "#fff",
        fontSize: 10,
        fontWeight: 700,
        border: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        marginLeft: 4,
      }}
    >
      NK
    </button>
  )),
  {
    getProps: (di) => ({
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

export const sendFeedbackTopBarItemInjectable = getInjectable({
  id: "novakube-send-feedback-top-bar-item",
  instantiate: () => ({
    id: "novakube-send-feedback",
    isShown: computed(() => true),
    orderNumber: 15,
    Component: SendFeedbackButton,
  }),
  injectionToken: topBarItemOnRightSideInjectionToken,
});

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

export const userAvatarTopBarItemInjectable = getInjectable({
  id: "novakube-user-avatar-top-bar-item",
  instantiate: () => ({
    id: "novakube-user-avatar",
    isShown: computed(() => true),
    orderNumber: 40,
    Component: UserAvatarButton,
  }),
  injectionToken: topBarItemOnRightSideInjectionToken,
});
