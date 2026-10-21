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
          maxLength: 200,
          pattern: "^[A-Za-z0-9._:-]+$",
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
          maxLength: 200,
          pattern: "^[A-Za-z0-9._:-]+$",
        },
        resourceKind: {
          type: "string",
          description: "Resource kind e.g. 'pods', 'deployments', 'services', 'vulnerabilityreports'.",
          maxLength: 100,
          pattern: "^[A-Za-z][A-Za-z0-9.-]*$",
        },
        namespace: {
          type: "string",
          description: "Namespace to filter (optional for cluster-scoped or all namespaces).",
          maxLength: 253,
          pattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$",
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return (capped at 50 to prevent memory exhaustion).",
          minimum: 1,
          maximum: 10000,
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
          maxLength: 200,
          pattern: "^[A-Za-z0-9._:-]+$",
        },
        resourceKind: {
          type: "string",
          description: "Resource kind (e.g. 'Deployment', 'Pod', 'Service').",
          maxLength: 100,
          pattern: "^[A-Za-z][A-Za-z0-9.-]*$",
        },
        name: {
          type: "string",
          description: "Resource metadata.name.",
          maxLength: 253,
          pattern: "^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$",
        },
        namespace: {
          type: "string",
          description: "Resource metadata.namespace.",
          maxLength: 253,
          pattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$",
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
          maxLength: 200,
          pattern: "^[A-Za-z0-9._:-]+$",
        },
        podName: {
          type: "string",
          description: "Pod name.",
          maxLength: 253,
          pattern: "^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$",
        },
        namespace: {
          type: "string",
          description: "Pod namespace.",
          maxLength: 253,
          pattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$",
        },
        container: {
          type: "string",
          description: "Container name (optional if Pod has single container).",
          maxLength: 253,
          pattern: "^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$",
        },
        tailLines: {
          type: "number",
          description: "Number of tail lines to retrieve (default 50, maximum 100).",
          minimum: 1,
          maximum: 10000,
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
          maxLength: 200,
          pattern: "^[A-Za-z0-9._:-]+$",
        },
        namespace: {
          type: "string",
          description: "Namespace to filter events (optional).",
          maxLength: 253,
          pattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$",
        },
        limit: {
          type: "number",
          description: "Max events to return (capped at 50).",
          minimum: 1,
          maximum: 10000,
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
          maxLength: 200,
          pattern: "^[A-Za-z0-9._:-]+$",
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
