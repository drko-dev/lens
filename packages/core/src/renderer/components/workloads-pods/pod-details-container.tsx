/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./pod-details-container.scss";

import React from "react";
import type { Container, PodContainerStatus, Pod } from "@openlens/kube-object";
import { DrawerItem } from "../drawer";
import { cssNames, isDefined } from "@openlens/utilities";
import { StatusBrick } from "../status-brick";
import { Badge } from "../badge";
import { ContainerEnvironment } from "./pod-container-env";
import { PodContainerPort } from "./pod-container-port";
import { LocaleDate } from "../locale-date";
import { ClusterMetricsResourceType } from "../../../common/cluster-types";
import type { PortForwardStore } from "../../port-forward";
import { disposeOnUnmount, observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import portForwardStoreInjectable from "../../port-forward/port-forward-store/port-forward-store.injectable";
import type { IComputedValue } from "mobx";
import enabledMetricsInjectable from "../../api/catalog/entity/metrics-enabled.injectable";
import type { PodDetailsContainerMetricsComponent } from "@openlens/metrics";
import { podDetailsContainerMetricsInjectionToken } from "@openlens/metrics";
import { describeContainerImage } from "../../../common/k8s-api/endpoints/container-image";

import { Icon } from "../icon";
import type { PodLogsTabData } from "../dock/logs/create-pod-logs-tab.injectable";
import createPodLogsTabInjectable from "../dock/logs/create-pod-logs-tab.injectable";
import type { CreatePodTerminalTab } from "../dock/terminal/create-pod-terminal-tab.injectable";
import createPodTerminalTabInjectable from "../dock/terminal/create-pod-terminal-tab.injectable";

// Typed locally: the built @openlens/kube-object typings may predate ephemeral container fields.
const ephemeralStatuses = (pod: Pod) =>
  (pod.status as { ephemeralContainerStatuses?: PodContainerStatus[] } | undefined)?.ephemeralContainerStatuses ?? [];

export interface PodDetailsContainerProps {
  pod: Pod;
  container: Container;
}

interface Dependencies {
  portForwardStore: PortForwardStore;
  containerMetricsVisible: IComputedValue<boolean>;
  containerMetrics: PodDetailsContainerMetricsComponent[];
  createPodLogsTab: (data: PodLogsTabData) => string;
  createPodTerminalTab: CreatePodTerminalTab;
}

@observer
class NonInjectedPodDetailsContainer extends React.Component<PodDetailsContainerProps & Dependencies> {

  componentDidMount() {
    disposeOnUnmount(this, [
      this.props.portForwardStore.watch(),
    ]);
  }

  renderStatus(state: string, status: PodContainerStatus | null | undefined) {
    const { ready = false, state: containerState = {}} = status ?? {};
    const { terminated } = containerState;

    return (
      <span className={cssNames("status", state)}>
        {state}
        {ready ? ", ready" : ""}
        {terminated ? ` - ${terminated.reason} (exit code: ${terminated.exitCode})` : ""}
      </span>
    );
  }

  renderLastState(lastState: string, status: PodContainerStatus | null | undefined) {
    const { lastState: lastContainerState = {}} = status ?? {};
    const { terminated } = lastContainerState;

    if (lastState === "terminated" && terminated) {
      return (
        <span>
          {lastState}
          <br/>
          {`Reason: ${terminated.reason} - exit code: ${terminated.exitCode}`}
          <br/>
          {"Started at: "}
          {<LocaleDate date={terminated.startedAt} />}
          <br/>
          {"Finished at: "}
          {<LocaleDate date={terminated.finishedAt} />}
          <br/>
        </span>
      );
    }

    return null;
  }

  renderImage(name: string, image: string, imageId: string) {
    const info = describeContainerImage(image, imageId);
    const kindLabel = {
      "digest-pinned": "digest-pinned",
      "tag": "tag (mutable)",
      "untagged": "implicit :latest",
    }[info.declaredKind];

    return (
      <div className="container-image">
        <DrawerItem name="Declared">
          <span data-testid={`container-image-declared-${name}`}>{image}</span>
        </DrawerItem>
        <DrawerItem name="Kind">
          <span data-testid={`container-image-kind-${name}`}>{kindLabel}</span>
        </DrawerItem>
        <DrawerItem name="Running digest">
          <span
            data-testid={`container-image-runtime-${name}`}
            title={info.runtimeDigest ?? (info.runtimeImageId || undefined)}
          >
            {info.runtimeStatus === "resolved" && info.runtimeDigest
              ? `${info.runtimeDigest.substring(0, 19)}…`
              : info.runtimeStatus === "unparseable"
                ? "unrecognized image ID"
                : "not resolved yet"}
          </span>
        </DrawerItem>
        {info.mismatch && (
          <div className="image-mismatch" data-testid={`container-image-mismatch-${name}`}>
            Warning: running digest differs from the digest declared in the spec
          </div>
        )}
        <div className="image-registry-note" data-testid={`container-image-registry-note-${name}`}>
          Registry metadata not verified
        </div>
      </div>
    );
  }

  render() {
    const { pod, container, containerMetricsVisible, containerMetrics } = this.props;

    if (!pod || !container) return null;
    const { name, image, imagePullPolicy, ports, volumeMounts, command, args } = container;
    const status = [...pod.getContainerStatuses(), ...ephemeralStatuses(pod)].find(status => status.name === container.name);
    const state = status ? Object.keys(status?.state ?? {})[0] : "";
    const lastState = status ? Object.keys(status?.lastState ?? {})[0] : "";
    const ready = status ? status.ready : "";
    const imageId = status?.imageID ?? "";
    const liveness = pod.getLivenessProbe(container);
    const readiness = pod.getReadinessProbe(container);
    const startup = pod.getStartupProbe(container);
    const isInitContainer = !!pod.getInitContainers().find(c => c.name == name);
    const isMetricVisible = containerMetricsVisible.get();

    return (
      <div className="PodDetailsContainer">
        <div className="pod-container-title flex gaps align-center">
          <StatusBrick className={cssNames(state, { ready })}/>
          <span>{name}</span>
          <Icon
            small
            material="subject"
            tooltip={`Logs: ${name}`}
            interactive
            onClick={() => this.props.createPodLogsTab({ selectedPod: pod, selectedContainer: container })}
          />
          {state === "running" && (
            <Icon
              small
              material="terminal"
              tooltip={`Exec: ${name}`}
              interactive
              onClick={() => this.props.createPodTerminalTab({ selectedPod: pod, selectedContainer: container })}
            />
          )}
        </div>
        {(isMetricVisible && !isInitContainer) && (
          <>
            {containerMetrics.map(ContainerMetrics => (
              <ContainerMetrics.Component
                key={ContainerMetrics.id}
                container={container}
                pod={pod}/>
            ))}
          </>
        )}
        {status && (
          <DrawerItem name="Status">
            {this.renderStatus(state, status)}
          </DrawerItem>
        )}
        {lastState && (
          <DrawerItem name="Last Status">
            {this.renderLastState(lastState, status)}
          </DrawerItem>
        )}
        {this.renderImage(name, image ?? "", imageId)}
        {imagePullPolicy && imagePullPolicy !== "IfNotPresent" && (
          <DrawerItem name="ImagePullPolicy">
            {imagePullPolicy}
          </DrawerItem>
        )}
        {ports && ports.length > 0 && (
          <DrawerItem name="Ports">
            {
              ports
                .filter(isDefined)
                .map((port) => (
                  <PodContainerPort
                    pod={pod}
                    port={port}
                    key={`${container.name}-port-${port.containerPort}-${port.protocol}`}
                  />
                ))
            }
          </DrawerItem>
        )}
        {<ContainerEnvironment container={container} namespace={pod.getNs()}/>}
        {volumeMounts && volumeMounts.length > 0 && (
          <DrawerItem name="Mounts">
            {
              volumeMounts.map(mount => {
                const { name, mountPath, readOnly } = mount;

                return (
                  <React.Fragment key={name + mountPath}>
                    <span className="mount-path">{mountPath}</span>
                    <span className="mount-from">
                      {`from ${name} (${readOnly ? "ro" : "rw"})`}
                    </span>
                  </React.Fragment>
                );
              })
            }
          </DrawerItem>
        )}
        {liveness.length > 0 && (
          <DrawerItem name="Liveness" labelsOnly>
            {
              liveness.map((value, index) => (
                <Badge key={index} label={value}/>
              ))
            }
          </DrawerItem>
        )}
        {readiness.length > 0 && (
          <DrawerItem name="Readiness" labelsOnly>
            {
              readiness.map((value, index) => (
                <Badge key={index} label={value}/>
              ))
            }
          </DrawerItem>
        )}
        {startup.length > 0 && (
          <DrawerItem name="Startup" labelsOnly>
            {
              startup.map((value, index) => (
                <Badge key={index} label={value}/>
              ))
            }
          </DrawerItem>
        )}
        {command && (
          <DrawerItem name="Command">
            {command.join(" ")}
          </DrawerItem>
        )}

        {args && (
          <DrawerItem name="Arguments">
            {args.join(" ")}
          </DrawerItem>
        )}
      </div>
    );
  }
}

export const PodDetailsContainer = withInjectables<Dependencies, PodDetailsContainerProps>(NonInjectedPodDetailsContainer, {
  getProps: (di, props) => ({
    ...props,
    portForwardStore: di.inject(portForwardStoreInjectable),
    containerMetricsVisible: di.inject(enabledMetricsInjectable, ClusterMetricsResourceType.Container),
    containerMetrics: di.injectMany(podDetailsContainerMetricsInjectionToken),
    createPodLogsTab: di.inject(createPodLogsTabInjectable),
    createPodTerminalTab: di.inject(createPodTerminalTabInjectable),
  }),
});
