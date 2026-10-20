/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export const ALLOWLISTED_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "list_clusters",
    description: "Lists all configured and accessible Kubernetes clusters in OpenLens DevOps catalog.",
    inputSchema: {
      type: "object",
      properties: {
        includeOffline: {
          type: "boolean",
          description: "Whether to include offline or disconnected clusters.",
        },
      },
    },
  },
  {
    name: "get_cluster_info",
    description: "Returns summary metadata and connection state for a cluster with all secrets redacted.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: {
          type: "string",
          description: "Cluster ID or name in catalog.",
        },
      },
      required: ["clusterId"],
    },
  },
  {
    name: "list_resources",
    description: "Lists Kubernetes resources (pods, deployments, services, nodes, etc.) with pagination limit.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: {
          type: "string",
          description: "Target cluster identifier.",
        },
        resourceKind: {
          type: "string",
          description: "Resource kind e.g. 'pods', 'deployments', 'services', 'vulnerabilityreports'.",
        },
        namespace: {
          type: "string",
          description: "Namespace to filter (optional for cluster-scoped or all namespaces).",
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return (capped at 50 to prevent memory exhaustion).",
        },
      },
      required: ["clusterId", "resourceKind"],
    },
  },
  {
    name: "get_resource",
    description: "Retrieves a specific Kubernetes resource manifest by kind, name, and namespace with sensitive secrets redacted.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: {
          type: "string",
          description: "Target cluster identifier.",
        },
        resourceKind: {
          type: "string",
          description: "Resource kind (e.g. 'Deployment', 'Pod', 'Service').",
        },
        name: {
          type: "string",
          description: "Resource metadata.name.",
        },
        namespace: {
          type: "string",
          description: "Resource metadata.namespace.",
        },
      },
      required: ["clusterId", "resourceKind", "name"],
    },
  },
  {
    name: "get_pod_logs",
    description: "Fetches recent tail log lines for a container in a Pod with line capping and credential redaction.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: {
          type: "string",
          description: "Target cluster identifier.",
        },
        podName: {
          type: "string",
          description: "Pod name.",
        },
        namespace: {
          type: "string",
          description: "Pod namespace.",
        },
        container: {
          type: "string",
          description: "Container name (optional if Pod has single container).",
        },
        tailLines: {
          type: "number",
          description: "Number of tail lines to retrieve (default 50, maximum 100).",
        },
      },
      required: ["clusterId", "podName", "namespace"],
    },
  },
  {
    name: "get_events",
    description: "Fetches recent cluster or namespace events.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: {
          type: "string",
          description: "Target cluster identifier.",
        },
        namespace: {
          type: "string",
          description: "Namespace to filter events (optional).",
        },
        limit: {
          type: "number",
          description: "Max events to return (capped at 50).",
        },
      },
      required: ["clusterId"],
    },
  },
  {
    name: "estimate_cluster_costs",
    description: "Returns local cost allocation breakdown by namespace and workload based on resource requests.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: {
          type: "string",
          description: "Target cluster identifier.",
        },
      },
      required: ["clusterId"],
    },
  },
];

export const FORBIDDEN_WRITE_TOOLS = new Set([
  "create_resource",
  "apply_manifest",
  "patch_resource",
  "delete_resource",
  "pod_exec",
  "open_shell",
  "port_forward",
  "scale_workload",
  "restart_workload",
]);
