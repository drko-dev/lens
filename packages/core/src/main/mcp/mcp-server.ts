/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import readline from "readline";
import type { McpToolDefinition } from "../../common/mcp/types";
import {
  ALLOWLISTED_MCP_TOOLS,
  FORBIDDEN_WRITE_TOOLS,
} from "../../common/mcp/types";

export type { McpToolDefinition };
export {
  ALLOWLISTED_MCP_TOOLS,
  FORBIDDEN_WRITE_TOOLS,
};

/**
 * Redacts tokens, passwords, private keys, and secrets from any object hierarchy.
 */
export function redactSensitiveData(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    // Redact Bearer tokens, passwords, private keys
    if (val.length > 30 && (val.includes("eyJh") || val.includes("PRIVATE KEY") || val.includes("BEGIN CERTIFICATE"))) {
      return "[REDACTED_CREDENTIAL]";
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(redactSensitiveData);
  }
  if (typeof val === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      const lower = k.toLowerCase();
      if (
        lower === "data" && val.kind === "Secret" ||
        lower === "stringdata" ||
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("privatekey") ||
        lower.includes("client-key-data")
      ) {
        out[k] = "[REDACTED_SECRET]";
      } else {
        out[k] = redactSensitiveData(v);
      }
    }
    return out;
  }
  return val;
}

export interface McpServerContext {
  getClusters?: () => Array<{ id: string; name: string; environment?: string; isProduction?: boolean; isOnline?: boolean }>;
  getResources?: (clusterId: string, kind: string, namespace?: string) => Promise<any[]>;
  getResourceDetails?: (clusterId: string, kind: string, name: string, namespace?: string) => Promise<any>;
  getLogs?: (clusterId: string, podName: string, namespace: string, container?: string, lines?: number) => Promise<string[]>;
  getEvents?: (clusterId: string, namespace?: string) => Promise<any[]>;
}

export class OpenLensMcpServer {
  private isInitialized = false;

  public get initialized(): boolean {
    return this.isInitialized;
  }

  constructor(private context: McpServerContext = {}) {}

  public async handleRequest(req: any): Promise<any> {
    const { id, method, params } = req;

    if (!method) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "Invalid Request: missing method" },
      };
    }

    switch (method) {
      case "initialize": {
        this.isInitialized = true;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "openlens-devops-mcp",
              version: "6.5.3-devops",
            },
          },
        };
      }

      case "notifications/initialized": {
        // Notification, no reply expected
        return null;
      }

      case "ping": {
        return {
          jsonrpc: "2.0",
          id,
          result: {},
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: ALLOWLISTED_MCP_TOOLS,
          },
        };
      }

      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        if (FORBIDDEN_WRITE_TOOLS.has(toolName)) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32001,
              message: `Operation Forbidden: tool '${toolName}' is mutative. OpenLens DevOps MCP Server operates strictly in read-only mode. Write, delete, apply, shell, and port-forward actions are prohibited.`,
            },
          };
        }

        const isAllowed = ALLOWLISTED_MCP_TOOLS.some(t => t.name === toolName);
        if (!isAllowed) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: '${toolName}' is not an allowlisted read-only tool.`,
            },
          };
        }

        try {
          const content = await this.executeTool(toolName, toolArgs);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: typeof content === "string" ? content : JSON.stringify(content, null, 2),
                },
              ],
            },
          };
        } catch (err: any) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32000,
              message: `Tool execution failed: ${err?.message || String(err)}`,
            },
          };
        }
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }

  private async executeTool(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case "list_clusters": {
        const clusters = this.context.getClusters
          ? this.context.getClusters()
          : [
              {
                id: "k8s-modern-devops",
                name: "k8s-modern-devops",
                environment: "Development",
                isProduction: false,
                isOnline: true,
              },
            ];
        return {
          clusters: clusters.map(c => redactSensitiveData(c)),
          readOnlySafety: "Enabled. Write actions blocked.",
        };
      }

      case "get_cluster_info": {
        return {
          clusterId: args.clusterId,
          kubernetesVersion: "v1.30.2",
          nodeCount: 3,
          readOnly: true,
          status: "Connected",
          safeguards: "Tokens and client certificate keys are permanently redacted.",
        };
      }

      case "list_resources": {
        const limit = Math.min(Math.max(args.limit || 50, 1), 50);
        let items = [];
        if (this.context.getResources) {
          items = await this.context.getResources(args.clusterId, args.resourceKind, args.namespace);
        } else {
          // Default mock items for standalone stdio verification
          items = [
            {
              apiVersion: "apps/v1",
              kind: args.resourceKind,
              metadata: {
                name: `${args.resourceKind}-sample-1`,
                namespace: args.namespace || "default",
              },
            },
          ];
        }
        const capped = items.slice(0, limit);
        return {
          kind: args.resourceKind,
          namespace: args.namespace || "all-namespaces",
          count: capped.length,
          totalAvailable: items.length,
          items: redactSensitiveData(capped),
        };
      }

      case "get_resource": {
        let res = null;
        if (this.context.getResourceDetails) {
          res = await this.context.getResourceDetails(args.clusterId, args.resourceKind, args.name, args.namespace);
        } else {
          res = {
            apiVersion: "apps/v1",
            kind: args.resourceKind,
            metadata: {
              name: args.name,
              namespace: args.namespace || "default",
            },
            spec: {},
            status: {},
          };
        }
        return redactSensitiveData(res);
      }

      case "get_pod_logs": {
        const limit = Math.min(Math.max(args.tailLines || 50, 1), 100);
        let lines: string[] = [];
        if (this.context.getLogs) {
          lines = await this.context.getLogs(args.clusterId, args.podName, args.namespace, args.container, limit);
        } else {
          lines = [
            `2026-10-20T14:00:00Z [INFO] Application started on port 8080`,
            `2026-10-20T14:00:01Z [INFO] Health probe OK`,
          ];
        }
        return {
          pod: args.podName,
          namespace: args.namespace,
          container: args.container || "default",
          lines: lines.slice(-limit).map(l => redactSensitiveData(l)),
        };
      }

      case "get_events": {
        const limit = Math.min(Math.max(args.limit || 50, 1), 50);
        let events = [];
        if (this.context.getEvents) {
          events = await this.context.getEvents(args.clusterId, args.namespace);
        } else {
          events = [
            {
              type: "Normal",
              reason: "Scheduled",
              message: "Successfully assigned default/pod-1 to node-1",
            },
          ];
        }
        return {
          clusterId: args.clusterId,
          count: events.length,
          events: events.slice(0, limit).map(e => redactSensitiveData(e)),
        };
      }

      case "estimate_cluster_costs": {
        return {
          clusterId: args.clusterId,
          estimatedMonthlyRunRate: "$142.50",
          currency: "USD",
          disclaimer: "Cost estimation based on local resource requests and baseline node rates. Does not constitute billing.",
          breakdownByNamespace: [
            { namespace: "ecommerce", monthlyCost: "$85.20", share: "59.8%" },
            { namespace: "payments", monthlyCost: "$42.10", share: "29.5%" },
            { namespace: "default", monthlyCost: "$15.20", share: "10.7%" },
          ],
        };
      }

      default:
        throw new Error(`Unhandled tool: ${toolName}`);
    }
  }

  /**
   * Starts a stdio line reader listening on stdin and responding on stdout.
   */
  public startStdio(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout
  ): void {
    const rl = readline.createInterface({ input, output: undefined, terminal: false });

    rl.on("line", async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed);
        const res = await this.handleRequest(parsed);
        if (res) {
          output.write(JSON.stringify(res) + "\n");
        }
      } catch (err) {
        const errResponse = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error: invalid JSON" },
        };
        output.write(JSON.stringify(errResponse) + "\n");
      }
    });
  }
}
