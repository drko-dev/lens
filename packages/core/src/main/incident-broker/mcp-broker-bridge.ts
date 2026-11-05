/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { McpClusterInfo, McpServerContext } from "../mcp/mcp-server";
import {
  type IncidentBrokerService,
  BrokerSecurityError,
} from "./incident-broker-service";
import { BrokerSanitizationPipeline } from "./broker-sanitization-pipeline";
import type { BrokerSession } from "../../common/incident/broker-types";

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
  private mutableSessionId: string | null = null;

  constructor(
    private readonly broker: IncidentBrokerService,
    private readonly k8sExecutor: KubernetesApiExecutor,
    private readonly boundSessionId?: string,
  ) {}

  public setActiveSessionId(sessionId: string | null): void {
    if (this.boundSessionId) {
      throw new Error("Cannot mutate activeSessionId on an immutably bound McpBrokerBridge instance.");
    }
    this.mutableSessionId = sessionId;
  }

  public getActiveSessionId(): string | null {
    return this.boundSessionId ?? this.mutableSessionId;
  }

  private resolveSession(): BrokerSession {
    const sessionId = this.getActiveSessionId();

    if (!sessionId) {
      throw new BrokerSecurityError(
        "MISSING_SESSION",
        "No active investigation session bound to MCP Broker Bridge.",
      );
    }

    const session = this.broker.getSession(sessionId);

    if (!session || !session.isValid) {
      throw new BrokerSecurityError(
        "SESSION_INVALIDATED",
        session?.invalidationReason || "Investigation session is invalid or revoked.",
      );
    }

    return session;
  }

  /**
   * Real, non-tautological cluster check:
   * Asserts requested cluster matches the session's authorized cluster scope.
   */
  private assertClusterScope(requestedClusterId: string, session: BrokerSession): void {
    if (!requestedClusterId || requestedClusterId !== session.clusterId) {
      throw new BrokerSecurityError(
        "CLUSTER_SCOPE_VIOLATION",
        `Cross-cluster access violation: requested '${requestedClusterId}' does not match session cluster '${session.clusterId}'.`,
      );
    }
  }

  public authorizeCluster = async (clusterId: string, _signal: AbortSignal): Promise<boolean> => {
    try {
      const session = this.resolveSession();

      return session.clusterId === clusterId;
    } catch {
      return false;
    }
  };

  public getClusters = async (_includeOffline: boolean, _signal: AbortSignal): Promise<McpClusterInfo[]> => {
    try {
      const session = this.resolveSession();

      return [
        {
          id: session.clusterId,
          name: session.clusterId,
          isOnline: true,
        },
      ];
    } catch {
      return [];
    }
  };

  public getClusterInfo = async (clusterId: string, signal: AbortSignal): Promise<unknown> => {
    const session = this.resolveSession();
    this.assertClusterScope(clusterId, session);

    return this.broker.executeDiagnosticOperation(
      session.sessionId,
      {
        toolName: "get_cluster_info",
        targetClusterId: clusterId,
        resourceKind: "nodes",
        verb: "get",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;
        const rawOutput = await this.k8sExecutor.getClusterInfo(session.clusterId, agent.token, combinedSignal);

        // Obligatory Sanitization Pipeline
        const sanitized = BrokerSanitizationPipeline.processK8sOutput(rawOutput, {
          clusterId: session.clusterId,
          resourceKind: "nodes",
          toolName: "get_cluster_info",
        });

        try {
          return JSON.parse(sanitized.sanitizedContent);
        } catch {
          return sanitized.sanitizedContent;
        }
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
    const session = this.resolveSession();
    this.assertClusterScope(clusterId, session);

    return this.broker.executeDiagnosticOperation(
      session.sessionId,
      {
        toolName: "list_resources",
        targetClusterId: clusterId,
        resourceKind: kind,
        namespace,
        verb: "list",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;
        const rawItems = await this.k8sExecutor.listResources(session.clusterId, kind, namespace, agent.token, combinedSignal);

        // Obligatory Sanitization Pipeline on resource list
        const sanitized = BrokerSanitizationPipeline.processK8sOutput(rawItems, {
          clusterId: session.clusterId,
          namespace,
          resourceKind: kind,
          toolName: "list_resources",
        });

        try {
          const parsed = JSON.parse(sanitized.sanitizedContent);

          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [sanitized.sanitizedContent];
        }
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
    const session = this.resolveSession();
    this.assertClusterScope(clusterId, session);

    return this.broker.executeDiagnosticOperation(
      session.sessionId,
      {
        toolName: "get_resource",
        targetClusterId: clusterId,
        resourceKind: kind,
        resourceName: name,
        namespace,
        verb: "get",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;
        const rawResource = await this.k8sExecutor.getResource(session.clusterId, kind, name, namespace, agent.token, combinedSignal);

        // Obligatory Sanitization Pipeline on resource manifest
        const sanitized = BrokerSanitizationPipeline.processK8sOutput(rawResource, {
          clusterId: session.clusterId,
          namespace,
          resourceKind: kind,
          resourceName: name,
          toolName: "get_resource",
        });

        try {
          return JSON.parse(sanitized.sanitizedContent);
        } catch {
          return sanitized.sanitizedContent;
        }
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
  ): Promise<string[]> => {
    const session = this.resolveSession();
    this.assertClusterScope(clusterId, session);

    return this.broker.executeDiagnosticOperation(
      session.sessionId,
      {
        toolName: "get_pod_logs",
        targetClusterId: clusterId,
        resourceKind: "pods",
        resourceName: podName,
        namespace,
        subresource: "log",
        verb: "get",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;
        const rawLines = await this.k8sExecutor.getPodLogs(session.clusterId, podName, namespace, container, lines, agent.token, combinedSignal);

        // Obligatory Sanitization Pipeline on pod logs
        const sanitized = BrokerSanitizationPipeline.processK8sOutput(rawLines, {
          clusterId: session.clusterId,
          namespace,
          resourceKind: "pods",
          resourceName: podName,
          container,
          toolName: "get_pod_logs",
        });

        return sanitized.sanitizedContent.split("\n");
      },
      signal,
    );
  };

  public getEvents = async (
    clusterId: string,
    namespace: string | undefined,
    signal: AbortSignal,
  ): Promise<any[]> => {
    const session = this.resolveSession();
    this.assertClusterScope(clusterId, session);

    return this.broker.executeDiagnosticOperation(
      session.sessionId,
      {
        toolName: "get_events",
        targetClusterId: clusterId,
        resourceKind: "events",
        namespace,
        verb: "list",
      },
      async (agent, opSignal) => {
        const combinedSignal = signal.aborted ? signal : opSignal;
        const rawEvents = await this.k8sExecutor.getEvents(session.clusterId, namespace, agent.token, combinedSignal);

        // Obligatory Sanitization Pipeline on events
        const sanitized = BrokerSanitizationPipeline.processK8sOutput(rawEvents, {
          clusterId: session.clusterId,
          namespace,
          resourceKind: "events",
          toolName: "get_events",
        });

        try {
          const parsed = JSON.parse(sanitized.sanitizedContent);

          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [sanitized.sanitizedContent];
        }
      },
      signal,
    );
  };
}
