/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { PortForwardArgs, PortForwardDependencies } from "./port-forward";
import { PortForward } from "./port-forward";
import bundledKubectlInjectable from "../../../kubectl/bundled-kubectl.injectable";
import createKubectlInjectable from "../../../kubectl/create-kubectl.injectable";
import getClusterByIdInjectable from "../../../../features/cluster/storage/common/get-by-id.injectable";
import getPortFromStreamInjectable from "../../../utils/get-port-from-stream.injectable";
import { loggerInjectionToken } from "@openlens/logger";

export type CreatePortForward = (pathToKubeConfig: string, args: PortForwardArgs) => PortForward;

const createPortForwardInjectable = getInjectable({
  id: "create-port-forward",

  instantiate: (di): CreatePortForward => {
    const bundledKubectl = di.inject(bundledKubectlInjectable);
    const createKubectl = di.inject(createKubectlInjectable);
    const getClusterById = di.inject(getClusterByIdInjectable);
    const getPortFromStream = di.inject(getPortFromStreamInjectable);
    const logger = di.inject(loggerInjectionToken);

    return (pathToKubeConfig, args) => {
      const cluster = getClusterById(args.clusterId);
      const kubectl = cluster ? createKubectl(cluster.version.get()) : bundledKubectl;
      const dependencies: PortForwardDependencies = {
        getKubectlBinPath: kubectl.getPath,
        getPortFromStream,
        logger,
      };

      return new PortForward(dependencies, pathToKubeConfig, args);
    };
  },
});

export default createPortForwardInjectable;
