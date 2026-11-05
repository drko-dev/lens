/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { McpClusterInfo, McpServerContext } from "../mcp/mcp-server";
import type { IncidentBrokerService } from "./incident-broker-service";

export interface KubernetesApiExecutor {
  listResources(
    clusterId: string,
    kind: string,
    namespace?: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<any[]>;

  getResource(
    clusterId: string,
    kind: string,
    name: string,
    namespace?: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<any>;

  getPodLogs(
    clusterId: string,
    podName: string,
    namespace: string,
    container?: string,
    lines?: number,
    token?: string,
    signal?: AbortSignal,
  ): Promise<string[]>;

  getEvents(
    clusterId: string,
    namespace?: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<any[]>;

  getClusterInfo(
    clusterId: string,
    token?: string,
    signal?: AbortSignal,
  ): Promise<any>;
}

export class McpBrokerBridge implements McpServerContext {
  private activeSessionId: string | null = null;

  constructor(
    private readonly broker: IncidentBrokerService,
    private readonly k8sExecutor: KubernetesApiExecutor,
  ) {}

  public setActiveSessionId(sessionId: string | null): void {
    this.activeSessionId = sessionId;
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  private requireActiveSession(): string {
    if (!this.activeSessionId) {
      throw new Error("No active investigation session bound to MCP Broker Bridge.");
    }

    return this.activeSessionId;
  }

  public authorizeCluster = async (clusterId: string, _signal: AbortSignal): Promise<boolean> => {
    if (!this.activeSessionId) {
      return false;
    }

    const session = this.broker.getSession(this.activeSessionId);

    if (!session || !session.isValid) {
      return false;
    }

    return session.clusterId === clusterId;
  };

  public getClusters = async (_includeOffline: boolean, _signal: AbortSignal): Promise<McpClusterInfo[]> => {
    if (!this.activeSessionId) {
      return [];
    }

    const session = this.broker.getSession(this.activeSessionId);

    if (!session || !session.isValid) {
      return [];
    }

    return [
      {
        id: session.clusterId,
        name: session.clusterId,
        isOnline: true,
      },
    ];
  };

  public getClusterInfo = async (clusterId: string, signal: AbortSignal): Promise<unknown> => {
    const sessionId = this.requireActiveSession();

    return this.broker.executeDiagnosticOperation(
      sessionId,
      {
        toolName: "get_cluster_info",
        resourceKind: "nodes",
        verb: "get",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;

        return this.k8sExecutor.getClusterInfo(clusterId, agent.token, combinedSignal);
      },
      signal,
    );
  };

  public getResources = async (
    clusterId: string,
    kind: string,
    namespace: string | undefined,
    signal: AbortSignal,
  ): Promise<any[]> => {
    const sessionId = this.requireActiveSession();

    return this.broker.executeDiagnosticOperation(
      sessionId,
      {
        toolName: "list_resources",
        resourceKind: kind,
        namespace,
        verb: "list",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;

        return this.k8sExecutor.listResources(clusterId, kind, namespace, agent.token, combinedSignal);
      },
      signal,
    );
  };

  public getResourceDetails = async (
    clusterId: string,
    kind: string,
    name: string,
    namespace: string | undefined,
    signal: AbortSignal,
  ): Promise<unknown> => {
    const sessionId = this.requireActiveSession();

    return this.broker.executeDiagnosticOperation(
      sessionId,
      {
        toolName: "get_resource",
        resourceKind: kind,
        resourceName: name,
        namespace,
        verb: "get",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;

        return this.k8sExecutor.getResource(clusterId, kind, name, namespace, agent.token, combinedSignal);
      },
      signal,
    );
  };

  public getLogs = async (
    clusterId: string,
    podName: string,
    namespace: string,
    container: string | undefined,
    lines: number,
    signal: AbortSignal,
  ): Promise<string[] | Promise<string[]>> => {
    const sessionId = this.requireActiveSession();

    return this.broker.executeDiagnosticOperation(
      sessionId,
      {
        toolName: "get_pod_logs",
        resourceKind: "pods",
        resourceName: podName,
        namespace,
        subresource: "log",
        verb: "get",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;

        return this.k8sExecutor.getPodLogs(clusterId, podName, namespace, container, lines, agent.token, combinedSignal);
      },
      signal,
    );
  };

  public getEvents = async (
    clusterId: string,
    namespace: string | undefined,
    signal: AbortSignal,
  ): Promise<any[]> => {
    const sessionId = this.requireActiveSession();

    return this.broker.executeDiagnosticOperation(
      sessionId,
      {
        toolName: "get_events",
        resourceKind: "events",
        namespace,
        verb: "list",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;

        return this.k8sExecutor.getEvents(clusterId, namespace, agent.token, combinedSignal);
      },
      signal,
    );
  };
}
