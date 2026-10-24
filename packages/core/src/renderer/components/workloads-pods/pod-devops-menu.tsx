/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import type { Pod } from "@openlens/kube-object";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { KubeObjectMenuProps } from "../kube-object-menu";
import { Icon } from "../icon";
import { MenuItem, SubMenu } from "../menu";
import { StatusBrick } from "../status-brick";
import { cssNames } from "@openlens/utilities";
import type { CreatePodTerminalTab } from "../dock/terminal/create-pod-terminal-tab.injectable";
import createPodTerminalTabInjectable from "../dock/terminal/create-pod-terminal-tab.injectable";
import type { PodLogsTabData } from "../dock/logs/create-pod-logs-tab.injectable";
import createPodLogsTabInjectable from "../dock/logs/create-pod-logs-tab.injectable";
import type { ShowCheckedErrorNotification } from "../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import type { PortForwardDialogModel } from "../../port-forward/port-forward-dialog-model/port-forward-dialog-model";
import portForwardDialogModelInjectable from "../../port-forward/port-forward-dialog-model/port-forward-dialog-model.injectable";
import type { OpenAttachDebugContainerDialog } from "./debug-container/open-attach-debug-container-dialog.injectable";
import openAttachDebugContainerDialogInjectable from "./debug-container/open-attach-debug-container-dialog.injectable";

type PodDevOpsMenuProps = KubeObjectMenuProps<Pod>;

interface Dependencies {
  createPodTerminalTab: CreatePodTerminalTab;
  createPodLogsTab: (data: PodLogsTabData) => string;
  portForwardDialogModel: PortForwardDialogModel;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
  openAttachDebugContainerDialog: OpenAttachDebugContainerDialog;
}

function getContainerState(pod: Pod, containerName: string): string {
  const statuses = typeof pod.getContainerStatuses === "function" ? pod.getContainerStatuses(true) : [];
  const status = statuses.find(s => s.name === containerName);

  if (!status || !status.state) {
    return "waiting";
  }

  if (status.state.running) {
    return "running";
  }

  if (status.state.terminated) {
    return "terminated";
  }

  return "waiting";
}

function isContainerReady(pod: Pod, containerName: string): boolean {
  const statuses = typeof pod.getContainerStatuses === "function" ? pod.getContainerStatuses(true) : [];
  const status = statuses.find(s => s.name === containerName);

  return status?.ready ?? false;
}

interface DevOpsMenuItemProps {
  icon: string;
  title: string;
  tooltip: string;
  toolbar?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

const DevOpsMenuItem = ({
  icon,
  title,
  tooltip,
  toolbar,
  disabled,
  onClick,
  children,
}: DevOpsMenuItemProps) => {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    const handleOutsideClick = () => setOpen(false);

    document.addEventListener("click", handleOutsideClick);

    return () => document.removeEventListener("click", handleOutsideClick);
  }, [open]);

  return (
    <MenuItem
      className={cssNames({ open })}
      disabled={disabled}
      onClick={(evt: React.MouseEvent) => {
        if (onClick && !children) {
          onClick();
        } else if (children) {
          evt.stopPropagation();
          setOpen(prev => !prev);
        }
      }}
    >
      <Icon
        material={icon}
        tooltip={tooltip}
        interactive={toolbar}
      />
      <span className="title">{title}</span>
      {children && (
        <SubMenu className={cssNames({ visible: open })}>
          {children}
        </SubMenu>
      )}
    </MenuItem>
  );
};

/** Container-specific actions in the Pod details toolbar and context menu. */
const NonInjectedPodDevOpsMenu = ({
  object: pod,
  toolbar,
  createPodTerminalTab,
  createPodLogsTab,
  portForwardDialogModel,
  showCheckedErrorNotification,
  openAttachDebugContainerDialog,
}: PodDevOpsMenuProps & Dependencies) => {
  const containers = typeof pod.getAllContainers === "function"
    ? pod.getAllContainers()
    : typeof pod.getContainers === "function"
      ? pod.getContainers()
      : [];
  const running = new Set(
    typeof pod.getRunningContainers === "function"
      ? pod.getRunningContainers().map(container => container.name)
      : [],
  );
  const isSingleContainer = containers.length === 1;

  if (containers.length === 0) {
    return null;
  }

  const allPorts = containers.flatMap(c =>
    (c.ports || []).map(p => ({
      containerName: c.name,
      port: p.containerPort,
      protocol: p.protocol || "TCP",
      name: p.name,
    })),
  );
  const defaultPort = allPorts[0]?.port || 80;

  const openLogs = (containerName: string) => {
    const target = containers.find(c => c.name === containerName) || containers[0];

    try {
      createPodLogsTab({ selectedPod: pod, selectedContainer: target });
    } catch (error) {
      showCheckedErrorNotification(error, "Could not open pod logs");
    }
  };

  const openTerminal = (containerName: string) => {
    const target = containers.find(c => c.name === containerName) || containers[0];

    try {
      createPodTerminalTab({ selectedPod: pod, selectedContainer: target });
    } catch (error) {
      showCheckedErrorNotification(error, "Could not open pod shell");
    }
  };

  const openPortForward = (portNumber: number) => {
    try {
      portForwardDialogModel.open({
        kind: "pod",
        name: pod.getName(),
        namespace: pod.getNs(),
        port: portNumber,
        forwardPort: 0,
      });
    } catch (error) {
      showCheckedErrorNotification(error, "Could not open port forward dialog");
    }
  };

  return (
    <>
      {/* Terminal / Shell Item */}
      {isSingleContainer ? (
        <MenuItem
          disabled={!running.has(containers[0].name)}
          onClick={() => {
            if (running.has(containers[0].name)) {
              openTerminal(containers[0].name);
            }
          }}
        >
          <Icon
            material="terminal"
            tooltip={running.has(containers[0].name) ? "Terminal" : "Terminal (not running)"}
            interactive={toolbar}
          />
          <span className="title">Terminal</span>
        </MenuItem>
      ) : (
        <DevOpsMenuItem
          icon="terminal"
          title="Terminal"
          tooltip="Terminal"
          toolbar={toolbar}
          disabled={running.size === 0}
        >
          {containers.map(container => {
            const isRunning = running.has(container.name);
            const state = getContainerState(pod, container.name);
            const ready = isContainerReady(pod, container.name);

            return (
              <MenuItem
                key={container.name}
                disabled={!isRunning}
                onClick={(evt: React.MouseEvent) => {
                  evt.stopPropagation();

                  if (isRunning) {
                    openTerminal(container.name);
                  }
                }}
              >
                <StatusBrick className={cssNames(state, { ready })} />
                <span className="title">{container.name}</span>
              </MenuItem>
            );
          })}
        </DevOpsMenuItem>
      )}

      {/* Logs Item */}
      {isSingleContainer ? (
        <MenuItem onClick={() => openLogs(containers[0].name)}>
          <Icon
            material="subject"
            tooltip="Logs"
            interactive={toolbar}
          />
          <span className="title">Logs</span>
        </MenuItem>
      ) : (
        <DevOpsMenuItem
          icon="subject"
          title="Logs"
          tooltip="Logs"
          toolbar={toolbar}
        >
          {containers.map(container => {
            const state = getContainerState(pod, container.name);
            const ready = isContainerReady(pod, container.name);

            return (
              <MenuItem
                key={container.name}
                onClick={(evt: React.MouseEvent) => {
                  evt.stopPropagation();
                  openLogs(container.name);
                }}
              >
                <StatusBrick className={cssNames(state, { ready })} />
                <span className="title">{container.name}</span>
              </MenuItem>
            );
          })}
        </DevOpsMenuItem>
      )}

      {/* Port Forward Item */}
      {allPorts.length <= 1 ? (
        <MenuItem onClick={() => openPortForward(defaultPort)}>
          <Icon
            material="forward"
            tooltip="Port Forward"
            interactive={toolbar}
            disabled={allPorts.length === 0}
          />
          <span className="title">Port Forward</span>
        </MenuItem>
      ) : (
        <DevOpsMenuItem
          icon="forward"
          title="Port Forward"
          tooltip="Port Forward"
          toolbar={toolbar}
        >
          {allPorts.map((p, idx) => (
            <MenuItem
              key={`${p.containerName}-${p.port}-${idx}`}
              onClick={(evt: React.MouseEvent) => {
                evt.stopPropagation();
                openPortForward(p.port);
              }}
            >
              <Icon material="forward" small />
              <span className="title">
                {p.containerName}
                :
                {p.name ? `${p.name} (${p.port}/${p.protocol})` : `${p.port}/${p.protocol}`}
              </span>
            </MenuItem>
          ))}
        </DevOpsMenuItem>
      )}

      {/* Attach Debug Container Item */}
      <MenuItem
        onClick={() => openAttachDebugContainerDialog(pod)}
        data-testid="attach-debug-container-menu-item"
      >
        <Icon
          material="bug_report"
          tooltip="Attach Debug Container (kubectl debug)"
          interactive={toolbar}
        />
        <span className="title">Attach Debug Container</span>
      </MenuItem>
    </>
  );
};

export const PodDevOpsMenu = withInjectables<Dependencies, PodDevOpsMenuProps>(NonInjectedPodDevOpsMenu, {
  getProps: (di, props) => ({
    ...props,
    createPodTerminalTab: di.inject(createPodTerminalTabInjectable),
    createPodLogsTab: di.inject(createPodLogsTabInjectable),
    portForwardDialogModel: di.inject(portForwardDialogModelInjectable),
    showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
    openAttachDebugContainerDialog: di.inject(openAttachDebugContainerDialogInjectable),
  }),
});
