/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./service-details.scss";

import React from "react";
import { disposeOnUnmount, observer } from "mobx-react";
import { DrawerItem, DrawerTitle } from "../drawer";
import { Badge } from "../badge";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { Service } from "@openlens/kube-object";
import { ServicePortComponent } from "./service-port-component";
import type { EndpointsStore } from "../network-endpoints/store";
import { ServiceDetailsEndpoint } from "./service-details-endpoint";
import type { EndpointSliceStore } from "../network-endpoint-slices/store";
import endpointSliceStoreInjectable from "../network-endpoint-slices/store.injectable";
import { shouldShowResourceInjectionToken } from "../../../features/cluster/showing-kube-resources/common/allowed-resources-injection-token";
import type { IComputedValue } from "mobx";
import type { PortForwardStore } from "../../port-forward";
import type { Logger } from "@openlens/logger";
import { withInjectables } from "@ogre-tools/injectable-react";
import portForwardStoreInjectable from "../../port-forward/port-forward-store/port-forward-store.injectable";
import type { SubscribeStores } from "../../kube-watch-api/kube-watch-api";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import endpointsStoreInjectable from "../network-endpoints/store.injectable";
import { loggerInjectionToken } from "@openlens/logger";

export interface ServiceDetailsProps extends KubeObjectDetailsProps<Service> {
}

interface Dependencies {
  subscribeStores: SubscribeStores;
  portForwardStore: PortForwardStore;
  endpointsStore: EndpointsStore;
  endpointSliceStore: EndpointSliceStore;
  endpointSlicesAreAllowed: IComputedValue<boolean>;
  logger: Logger;
}

@observer
class NonInjectedServiceDetails extends React.Component<ServiceDetailsProps & Dependencies> {
  componentDidMount() {
    const {
      object: service,
      subscribeStores,
      endpointsStore,
      endpointSliceStore,
      endpointSlicesAreAllowed,
      portForwardStore,
    } = this.props;

    const storesToSubscribe = [
      endpointsStore,
      ...(endpointSlicesAreAllowed.get() ? [endpointSliceStore] : []),
    ];

    disposeOnUnmount(this, [
      subscribeStores(storesToSubscribe, {
        namespaces: [service.getNs()],
      }),
      portForwardStore.watch(),
    ]);
  }

  render() {
    const { object: service, endpointsStore, endpointSliceStore, endpointSlicesAreAllowed } = this.props;

    if (!service) {
      return null;
    }

    if (!(service instanceof Service)) {
      this.props.logger.error("[ServiceDetails]: passed object that is not an instanceof Service", service);

      return null;
    }

    const { spec } = service;
    const endpoints = endpointsStore.getByName(service.getName(), service.getNs());
    const endpointSlices = endpointSlicesAreAllowed.get()
      ? endpointSliceStore.getByService(service.getName(), service.getNs())
      : [];
    const externalIps = service.getExternalIps();

    if (externalIps.length === 0 && spec?.externalName) {
      externalIps.push(spec.externalName);
    }

    return (
      <div className="ServicesDetails">
        <DrawerItem name="Selector" labelsOnly>
          {service.getSelector().map(selector => <Badge key={selector} label={selector}/>)}
        </DrawerItem>

        <DrawerItem name="Type">
          {spec.type}
        </DrawerItem>

        <DrawerItem name="Session Affinity">
          {spec.sessionAffinity}
        </DrawerItem>

        <DrawerTitle>Connection</DrawerTitle>

        <DrawerItem name="Cluster IP">
          {spec.clusterIP}
        </DrawerItem>

        <DrawerItem
          name="Cluster IPs"
          hidden={!service.getClusterIps().length}
          labelsOnly
        >
          {
            service.getClusterIps().map(label => (
              <Badge key={label} label={label}/>
            ))
          }
        </DrawerItem>

        <DrawerItem name="IP families" hidden={!service.getIpFamilies().length}>
          {service.getIpFamilies().join(", ")}
        </DrawerItem>

        <DrawerItem name="IP family policy" hidden={!service.getIpFamilyPolicy()}>
          {service.getIpFamilyPolicy()}
        </DrawerItem>

        {externalIps.length > 0 && (
          <DrawerItem name="External IPs">
            {externalIps.map(ip => <div key={ip}>{ip}</div>)}
          </DrawerItem>
        )}

        <DrawerItem name="Ports">
          <div>
            {
              service.getPorts().map((port) => (
                <ServicePortComponent
                  service={service}
                  port={port}
                  key={port.toString()}
                />
              ))
            }
          </div>
        </DrawerItem>

        {spec.type === "LoadBalancer" && spec.loadBalancerIP && (
          <DrawerItem name="Load Balancer IP">
            {spec.loadBalancerIP}
          </DrawerItem>
        )}

        {endpoints && (
          <>
            <DrawerTitle>Endpoint</DrawerTitle>
            <ServiceDetailsEndpoint endpoints={endpoints}/>
          </>
        )}

        {endpointSlices.length > 0 && (
          <>
            <DrawerTitle>Endpoint Slices</DrawerTitle>
            <div className="ServiceDetailsEndpointSlices" data-testid="service-endpoint-slices">
              {endpointSlices.map(slice => (
                <DrawerItem key={slice.getId()} name={slice.getName()}>
                  <div className="flex gaps align-center">
                    <Badge label={slice.getAddressType()} />
                    <span className="slice-endpoints-count">{slice.getEndpointsSummary()}</span>
                  </div>
                  <div className="text-secondary" style={{ marginTop: 4, fontSize: "12px" }}>
                    Ports:
                    {" "}
                    {slice.getPortsSummary()}
                  </div>
                </DrawerItem>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
}

export const ServiceDetails = withInjectables<Dependencies, ServiceDetailsProps>(NonInjectedServiceDetails, {
  getProps: (di, props) => ({
    ...props,
    subscribeStores: di.inject(subscribeStoresInjectable),
    portForwardStore: di.inject(portForwardStoreInjectable),
    endpointsStore: di.inject(endpointsStoreInjectable),
    endpointSliceStore: di.inject(endpointSliceStoreInjectable),
    endpointSlicesAreAllowed: di.inject(shouldShowResourceInjectionToken, {
      apiName: "endpointslices",
      group: "discovery.k8s.io",
    }),
    logger: di.inject(loggerInjectionToken),
  }),
});
