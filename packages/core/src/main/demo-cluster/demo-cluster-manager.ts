/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import type { ObservableMap } from "mobx";
import type { ClusterId } from "../../common/cluster-types";
import type { Cluster } from "../../common/cluster/cluster";
import type { AddCluster } from "../../features/cluster/storage/common/add.injectable";
import { DemoClusterServer } from "./demo-cluster-server";
import {
  DEMO_CLUSTER_ID,
  DEMO_CONTEXT_NAME,
  DEMO_CLUSTER_NAME,
} from "./demo-cluster-data";
import type { DemoClusterStatus } from "../../common/demo-cluster/demo-cluster-channels";

export function generateDemoKubeconfigYaml(port: number): string {
  const config = {
    apiVersion: "v1",
    kind: "Config",
    preferences: {},
    clusters: [
      {
        cluster: {
          server: `http://127.0.0.1:${port}`,
          "insecure-skip-tls-verify": true,
        },
        name: DEMO_CONTEXT_NAME,
      },
    ],
    contexts: [
      {
        context: {
          cluster: DEMO_CONTEXT_NAME,
          user: "demo-admin",
          namespace: "demo-apps",
        },
        name: DEMO_CONTEXT_NAME,
      },
    ],
    "current-context": DEMO_CONTEXT_NAME,
    users: [
      {
        name: "demo-admin",
        user: {
          token: "demo-simulated-token",
        },
      },
    ],
  };

  return yaml.dump(config);
}

export interface DemoClusterManagerDependencies {
  directoryForKubeConfigs: string;
  addCluster: AddCluster;
  clustersState: ObservableMap<ClusterId, Cluster>;
}

export class DemoClusterManager {
  private server = new DemoClusterServer();
  private kubeconfigFilePath: string | undefined;

  constructor(private dependencies: DemoClusterManagerDependencies) {}

  public getStatus(): DemoClusterStatus {
    const isRunning = this.server.isRunning();
    const port = this.server.getPort();

    return {
      isRunning,
      port,
      clusterId: isRunning ? DEMO_CLUSTER_ID : undefined,
      kubeconfigPath: isRunning ? this.kubeconfigFilePath : undefined,
      serverUrl: isRunning && port ? `http://127.0.0.1:${port}` : undefined,
    };
  }

  public async startDemoCluster(): Promise<DemoClusterStatus> {
    const port = await this.server.start(0);

    // Store it in the directory already watched by the catalog kubeconfig sync.
    const demoDir = this.dependencies.directoryForKubeConfigs;

    await fs.promises.mkdir(demoDir, { recursive: true });

    this.kubeconfigFilePath = path.join(demoDir, "openlens-demo-cluster.yaml");
    const yamlContent = generateDemoKubeconfigYaml(port);

    await fs.promises.writeFile(this.kubeconfigFilePath, yamlContent, "utf8");

    // Check if cluster already exists in clustersState
    const existingCluster = this.dependencies.clustersState.get(DEMO_CLUSTER_ID);

    if (existingCluster) {
      existingCluster.kubeConfigPath.set(this.kubeconfigFilePath);
      existingCluster.contextName.set(DEMO_CONTEXT_NAME);
    } else {
      this.dependencies.addCluster({
        id: DEMO_CLUSTER_ID,
        contextName: DEMO_CONTEXT_NAME,
        kubeConfigPath: this.kubeconfigFilePath,
        preferences: {
          clusterName: DEMO_CLUSTER_NAME,
        },
        labels: {
          "openlens.devops/demo": "true",
          environment: "demo",
        },
      });
    }

    return this.getStatus();
  }

  public async stopDemoCluster(): Promise<void> {
    await this.server.stop();
  }
}
