/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

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

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_CONCURRENT_TOOL_CALLS = 4;
const MAX_CLUSTER_RESULTS = 50;
const TOOL_TIMEOUT_MS = 5_000;
const REDACTED_SECRET = "[REDACTED_SECRET]";

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "pwd",
  "token",
  "secret",
  "privatekey",
  "privkey",
  "clientkeydata",
  "clientcertificatedata",
  "authorization",
  "proxyauthorization",
  "apikey",
  "credentials",
  "credential",
  "stringdata",
];

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = normalizeSensitiveKey(key);

  return SENSITIVE_KEY_PATTERNS.some(pattern => normalizedKey.includes(pattern));
}

function redactString(value: string): string {
  let sanitized = value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[REDACTED_PRIVATE_KEY]",
    )
    .replace(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
      "[REDACTED_CERTIFICATE]",
    )
    .replace(
      /(?:ssh-rsa|ssh-dss|ssh-ed25519|ecdsa-sha2-[a-z0-9]+)\s+[A-Za-z0-9+/=]{30,}/gi,
      "[REDACTED_SSH_KEY]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, "$1[REDACTED_TOKEN]")
    .replace(/(Basic\s+)[A-Za-z0-9+/]+=*/gi, "$1[REDACTED_TOKEN]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/(https?:\/\/)([^:@\s]+):([^@\s]+)@/gi, "$1$2:[REDACTED_PASSWORD]@");

  sanitized = sanitized.replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, separator: string, key: string) => {
    let normalizedKey = key;

    try {
      normalizedKey = decodeURIComponent(key);
    } catch {
      // Keep malformed URL keys as-is; the normalized comparison below remains conservative.
    }

    return isSensitiveKey(normalizedKey)
      ? `${separator}${key}=[REDACTED_TOKEN]`
      : match;
  });

  return sanitized.replace(
    /(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|secret|token|credential|private[_-]?key)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
    "$1[REDACTED_TOKEN]",
  );
}

/** Redacts sensitive values recursively, including binary and non-JSON object shapes. */
export function redactSensitiveData(val: any, seen: WeakSet<object> = new WeakSet()): any {
  if (val === null || val === undefined || typeof val !== "object") {
    return typeof val === "string" ? redactString(val) : val;
  }

  if (Buffer.isBuffer(val) || ArrayBuffer.isView(val) || val instanceof ArrayBuffer) {
    return "[REDACTED_BINARY_DATA]";
  }

  if (seen.has(val)) {
    return "[CIRCULAR_REFERENCE]";
  }

  seen.add(val);

  try {
    if (val instanceof Error) {
      return {
        name: redactSensitiveData(val.name, seen),
        message: redactSensitiveData(val.message, seen),
      };
    }

    if (Array.isArray(val)) {
      return val.map(item => redactSensitiveData(item, seen));
    }

    if (val instanceof Map) {
      const out: Record<string, any> = {};

      for (const [key, value] of val.entries()) {
        const stringKey = String(key);

        out[stringKey] = isSensitiveKey(stringKey) ? REDACTED_SECRET : redactSensitiveData(value, seen);
      }

      return out;
    }

    if (val instanceof Set) {
      return Array.from(val, item => redactSensitiveData(item, seen));
    }

    if (val instanceof Date) {
      return Number.isNaN(val.getTime()) ? "[INVALID_DATE]" : val.toISOString();
    }

    const isKubernetesSecret =
      (typeof val.kind === "string" && val.kind.toLowerCase() === "secret") ||
      (typeof val.type === "string" && (val.type.toLowerCase().startsWith("kubernetes.io/") || val.type === "Opaque"));
    const out: Record<string, any> = {};

    for (const [key, value] of Object.entries(val)) {
      const normalizedKey = normalizeSensitiveKey(key);

      if (isKubernetesSecret && (normalizedKey === "data" || normalizedKey === "stringdata")) {
        out[key] = REDACTED_SECRET;
      } else {
        out[key] = isSensitiveKey(key) ? REDACTED_SECRET : redactSensitiveData(value, seen);
      }
    }

    return out;
  } finally {
    seen.delete(val);
  }
}

export interface McpClusterInfo {
  id: string;
  name: string;
  environment?: string;
  isProduction?: boolean;
  isOnline?: boolean;
}

/** A backend must provide both cluster-scoped operations and an authorization check. */
export interface McpServerContext {
  authorizeCluster?: (clusterId: string, signal: AbortSignal) => boolean | Promise<boolean>;
  getClusters?: (includeOffline: boolean, signal: AbortSignal) => McpClusterInfo[] | Promise<McpClusterInfo[]>;
  getClusterInfo?: (clusterId: string, signal: AbortSignal) => Promise<unknown>;
  getClusterCosts?: (clusterId: string, signal: AbortSignal) => Promise<unknown>;
  getResources?: (clusterId: string, kind: string, namespace: string | undefined, signal: AbortSignal) => Promise<any[]>;
  getResourceDetails?: (clusterId: string, kind: string, name: string, namespace: string | undefined, signal: AbortSignal) => Promise<unknown>;
  getLogs?: (clusterId: string, podName: string, namespace: string, container: string | undefined, lines: number, signal: AbortSignal) => Promise<string[]>;
  getEvents?: (clusterId: string, namespace: string | undefined, signal: AbortSignal) => Promise<any[]>;
}

class McpServerError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function invalidRequest(id: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid request." }};
}

function invalidParams(id: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32602, message: "Invalid tool arguments." }};
}

function validateString(
  args: Record<string, any>,
  key: string,
  pattern: RegExp,
  maxLength: number,
  required = false,
): boolean {
  const value = args[key];

  if (value === undefined && !required) {
    return true;
  }

  return typeof value === "string" && value.length > 0 && value.length <= maxLength && pattern.test(value);
}

const CLUSTER_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const RESOURCE_KIND_PATTERN = /^[A-Za-z][A-Za-z0-9.-]*$/;
const KUBERNETES_NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
const NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function validateToolArguments(toolName: string, rawArgs: unknown): Record<string, any> | undefined {
  if (!isPlainObject(rawArgs)) {
    return undefined;
  }

  const args = rawArgs;
  const allowed: Record<string, string[]> = {
    list_clusters: ["includeOffline"],
    get_cluster_info: ["clusterId"],
    list_resources: ["clusterId", "resourceKind", "namespace", "limit"],
    get_resource: ["clusterId", "resourceKind", "name", "namespace"],
    get_pod_logs: ["clusterId", "podName", "namespace", "container", "tailLines"],
    get_events: ["clusterId", "namespace", "limit"],
    estimate_cluster_costs: ["clusterId"],
  };

  const allowedKeys = allowed[toolName];

  if (!allowedKeys || Object.keys(args).some(key => !allowedKeys.includes(key))) {
    return undefined;
  }

  const validClusterId = () => validateString(args, "clusterId", CLUSTER_ID_PATTERN, 200, true);
  const validNamespace = (required = false) => validateString(args, "namespace", NAMESPACE_PATTERN, 253, required);
  const validResourceKind = () => validateString(args, "resourceKind", RESOURCE_KIND_PATTERN, 100, true);
  const validName = (key: string, required = true) => validateString(args, key, KUBERNETES_NAME_PATTERN, 253, required);
  const validLimit = (key: string, max = 10_000) => args[key] === undefined || (Number.isSafeInteger(args[key]) && args[key] >= 1 && args[key] <= max);

  switch (toolName) {
    case "list_clusters":
      return args.includeOffline === undefined || typeof args.includeOffline === "boolean" ? args : undefined;
    case "get_cluster_info":
    case "estimate_cluster_costs":
      return validClusterId() ? args : undefined;
    case "list_resources":
      return validClusterId() && validResourceKind() && validNamespace() && validLimit("limit") ? args : undefined;
    case "get_resource":
      return validClusterId() && validResourceKind() && validName("name") && validNamespace() ? args : undefined;
    case "get_pod_logs":
      return validClusterId() && validName("podName") && validNamespace(true) &&
        validateString(args, "container", KUBERNETES_NAME_PATTERN, 253) && validLimit("tailLines") ? args : undefined;
    case "get_events":
      return validClusterId() && validNamespace() && validLimit("limit") ? args : undefined;
    default:
      return undefined;
  }
}

export class OpenLensMcpServer {
  private isInitialized = false;
  private activeToolCalls = 0;

  public get initialized(): boolean {
    return this.isInitialized;
  }

  constructor(private readonly context?: McpServerContext) {}

  public async handleRequest(req: unknown): Promise<any> {
    const id = isPlainObject(req) ? req.id : null;

    if (!isPlainObject(req) || req.jsonrpc !== "2.0" || typeof req.method !== "string" || req.method.length === 0 || req.method.length > 128) {
      return invalidRequest(id);
    }

    let requestBytes: number;

    try {
      requestBytes = Buffer.byteLength(JSON.stringify(req), "utf8");
    } catch {
      return invalidRequest(id);
    }

    if (requestBytes > MAX_REQUEST_BYTES) {
      return invalidRequest(id);
    }

    const hasId = Object.prototype.hasOwnProperty.call(req, "id");
    const validId = req.id === null || typeof req.id === "string" || (typeof req.id === "number" && Number.isFinite(req.id));

    if ((hasId && !validId) || (!hasId && req.method !== "notifications/initialized")) {
      return invalidRequest(id);
    }

    if (req.params !== undefined && !isPlainObject(req.params)) {
      return invalidParams(id);
    }

    const params = req.params || {};

    switch (req.method) {
      case "initialize":
        this.isInitialized = true;

        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}},
            serverInfo: { name: "openlens-devops-mcp", version: "6.5.3-devops" },
          },
        };
      case "notifications/initialized":
        return null;
      case "ping":
        return { jsonrpc: "2.0", id, result: {}};
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: ALLOWLISTED_MCP_TOOLS }};

      case "tools/call": {
        if (!Object.prototype.hasOwnProperty.call(params, "name") || typeof params.name !== "string" || params.name.length === 0 || params.name.length > 128) {
          return invalidParams(id);
        }

        const toolName = params.name;
        const rawArgs = params.arguments === undefined ? {} : params.arguments;

        if (Object.keys(params).some(key => !["name", "arguments", "_meta"].includes(key)) ||
          (params._meta !== undefined && !isPlainObject(params._meta))) {
          return invalidParams(id);
        }

        if (FORBIDDEN_WRITE_TOOLS.has(toolName)) {
          return { jsonrpc: "2.0", id, error: { code: -32001, message: "Operation Forbidden: this MCP server operates strictly in read-only mode." }};
        }

        if (!ALLOWLISTED_MCP_TOOLS.some(tool => tool.name === toolName)) {
          return { jsonrpc: "2.0", id, error: { code: -32601, message: "Tool is not allowlisted." }};
        }

        const args = validateToolArguments(toolName, rawArgs);

        if (!args) {
          return invalidParams(id);
        }

        try {
          const rawResult = await this.executeToolWithLimits(toolName, args);
          const safeResult = redactSensitiveData(rawResult);
          const text = typeof safeResult === "string" ? safeResult : JSON.stringify(safeResult ?? null);

          if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
            throw new McpServerError(-32002, "OUTPUT_LIMIT: Tool response exceeds the configured size limit.");
          }

          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] }};
        } catch (error) {
          if (error instanceof McpServerError) {
            return { jsonrpc: "2.0", id, error: { code: error.code, message: error.message }};
          }

          return { jsonrpc: "2.0", id, error: { code: -32000, message: "Tool execution failed." }};
        }
      }
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found." }};
    }
  }

  private async executeToolWithLimits(toolName: string, args: Record<string, any>): Promise<unknown> {
    if (this.activeToolCalls >= MAX_CONCURRENT_TOOL_CALLS) {
      throw new McpServerError(-32002, "CONCURRENCY_LIMIT: Too many tool calls are already running.");
    }

    this.activeToolCalls += 1;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const execution = Promise.resolve().then(() => this.executeTool(toolName, args, controller.signal));

    void execution.then(
      () => { this.activeToolCalls -= 1; },
      () => { this.activeToolCalls -= 1; },
    );

    try {
      return await Promise.race([
        execution,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new McpServerError(-32002, "TIMEOUT: Tool execution exceeded the configured time limit."));
            controller.abort();
          }, TOOL_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      controller.abort();
    }
  }

  private async assertClusterAuthorized(clusterId: string, signal: AbortSignal): Promise<void> {
    if (!this.context || typeof this.context.authorizeCluster !== "function") {
      throw new McpServerError(-32003, "NOT_CONFIGURED: A cluster authorization backend is not configured.");
    }

    if (!await this.context.authorizeCluster(clusterId, signal)) {
      throw new McpServerError(-32001, "ACCESS_DENIED: Access to the requested cluster is not authorized.");
    }
  }

  private async executeTool(toolName: string, args: Record<string, any>, signal: AbortSignal): Promise<unknown> {
    if (!this.context) {
      throw new McpServerError(-32003, "NOT_CONFIGURED: No Kubernetes backend is configured.");
    }

    switch (toolName) {
      case "list_clusters": {
        if (typeof this.context.getClusters !== "function") {
          throw new McpServerError(-32003, "NOT_CONFIGURED: No Kubernetes cluster catalog backend is configured.");
        }

        const clusters = await this.context.getClusters(args.includeOffline ?? false, signal);
        const scopedClusters = await Promise.all(clusters.slice(0, MAX_CLUSTER_RESULTS).map(async cluster => {
          try {
            await this.assertClusterAuthorized(cluster.id, signal);

            return args.includeOffline || cluster.isOnline !== false ? cluster : null;
          } catch (error) {
            if (error instanceof McpServerError && error.code === -32001) return null;
            throw error;
          }
        }));

        return {
          clusters: scopedClusters.filter(Boolean),
          readOnlySafety: "Enabled. Write actions blocked.",
        };
      }

      case "get_cluster_info": {
        if (typeof this.context.getClusterInfo !== "function") {
          throw new McpServerError(-32003, "NOT_CONFIGURED: No cluster info backend is configured.");
        }
        await this.assertClusterAuthorized(args.clusterId, signal);
        const result = await this.context.getClusterInfo(args.clusterId, signal);

        await this.assertClusterAuthorized(args.clusterId, signal);

        return result;
      }

      case "list_resources": {
        if (typeof this.context.getResources !== "function") {
          throw new McpServerError(-32003, "NOT_CONFIGURED: No Kubernetes resource backend is configured.");
        }
        const limit = Math.min(args.limit ?? 50, 50);

        await this.assertClusterAuthorized(args.clusterId, signal);
        const items = await this.context.getResources(args.clusterId, args.resourceKind, args.namespace, signal);

        await this.assertClusterAuthorized(args.clusterId, signal);
        const capped = items.slice(0, limit);

        return {
          kind: args.resourceKind,
          namespace: args.namespace || "all-namespaces",
          count: capped.length,
          totalAvailable: items.length,
          items: capped,
        };
      }

      case "get_resource": {
        if (typeof this.context.getResourceDetails !== "function") {
          throw new McpServerError(-32003, "NOT_CONFIGURED: No Kubernetes resource detail backend is configured.");
        }
        await this.assertClusterAuthorized(args.clusterId, signal);
        const result = await this.context.getResourceDetails(args.clusterId, args.resourceKind, args.name, args.namespace, signal);

        await this.assertClusterAuthorized(args.clusterId, signal);

        return result;
      }

      case "get_pod_logs": {
        if (typeof this.context.getLogs !== "function") {
          throw new McpServerError(-32003, "NOT_CONFIGURED: No Kubernetes logs backend is configured.");
        }
        const limit = Math.min(args.tailLines ?? 50, 100);

        await this.assertClusterAuthorized(args.clusterId, signal);
        const lines = await this.context.getLogs(args.clusterId, args.podName, args.namespace, args.container, limit, signal);

        await this.assertClusterAuthorized(args.clusterId, signal);

        return {
          pod: args.podName,
          namespace: args.namespace,
          container: args.container || "default",
          lines: lines.slice(-limit),
        };
      }

      case "get_events": {
        if (typeof this.context.getEvents !== "function") {
          throw new McpServerError(-32003, "NOT_CONFIGURED: No Kubernetes events backend is configured.");
        }
        const limit = Math.min(args.limit ?? 50, 50);

        await this.assertClusterAuthorized(args.clusterId, signal);
        const events = await this.context.getEvents(args.clusterId, args.namespace, signal);

        await this.assertClusterAuthorized(args.clusterId, signal);

        return {
          clusterId: args.clusterId,
          count: Math.min(events.length, limit),
          events: events.slice(0, limit),
        };
      }

      case "estimate_cluster_costs": {
        if (typeof this.context.getClusterCosts !== "function") {
          throw new McpServerError(-32003, "NOT_CONFIGURED: No cluster cost backend is configured.");
        }
        await this.assertClusterAuthorized(args.clusterId, signal);
        const result = await this.context.getClusterCosts(args.clusterId, signal);

        await this.assertClusterAuthorized(args.clusterId, signal);

        return result;
      }
      default:
        throw new McpServerError(-32601, "Tool is not allowlisted.");
    }
  }

  /** Starts a bounded stdio JSON-RPC reader. Stdout is reserved for protocol responses. */
  public startStdio(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout,
  ): () => void {
    let line = Buffer.alloc(0);
    let discardingOversizedLine = false;

    const writeInvalidRequest = () => output.write(`${JSON.stringify(invalidRequest(null))}\n`);
    const processLine = (bytes: Buffer) => {
      const text = bytes.toString("utf8").replace(/\r$/, "");

      if (!text.trim()) return;

      void (async () => {
        try {
          const request = JSON.parse(text);
          const response = await this.handleRequest(request);

          if (response) output.write(`${JSON.stringify(response)}\n`);
        } catch {
          output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." }})}\n`);
        }
      })();
    };

    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let offset = 0;

      while (offset < bytes.length) {
        const newline = bytes.indexOf(0x0a, offset);
        const end = newline < 0 ? bytes.length : newline;
        const segment = bytes.subarray(offset, end);

        if (discardingOversizedLine) {
          if (newline >= 0) discardingOversizedLine = false;
        } else if (line.length + segment.length > MAX_REQUEST_BYTES) {
          line = Buffer.alloc(0);
          discardingOversizedLine = newline < 0;
          writeInvalidRequest();
        } else {
          if (segment.length) line = Buffer.concat([line, segment], line.length + segment.length);

          if (newline >= 0) {
            processLine(line);
            line = Buffer.alloc(0);
          }
        }

        if (newline < 0) break;
        offset = newline + 1;
      }
    };
    const onEnd = () => {
      if (!discardingOversizedLine && line.length) processLine(line);
    };

    input.on("data", onData);
    input.once("end", onEnd);

    return () => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
    };
  }
}
