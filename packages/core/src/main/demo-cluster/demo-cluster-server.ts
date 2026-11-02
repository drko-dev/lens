/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import http from "http";
import type { Socket, AddressInfo } from "net";
import {
  getDemoVersionInfo,
  getDemoApiVersions,
  getDemoApisGroupList,
  getDemoNamespaces,
  getDemoNodes,
  getDemoPods,
  getDemoDeployments,
  getDemoReplicaSets,
  getDemoServices,
  getDemoGateways,
  getDemoGatewayClasses,
  getDemoAdmissionPolicies,
  getDemoDeviceClasses,
} from "./demo-cluster-data";

export class DemoClusterServer {
  private server: http.Server | undefined;
  private sockets = new Set<Socket>();
  private activePort: number | undefined;

  public isRunning(): boolean {
    return Boolean(this.server && this.server.listening);
  }

  public getPort(): number | undefined {
    return this.activePort;
  }

  public async start(requestedPort = 0): Promise<number> {
    if (this.isRunning() && this.activePort) {
      return this.activePort;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      server.on("connection", (socket) => {
        this.sockets.add(socket);
        socket.on("close", () => {
          this.sockets.delete(socket);
        });
      });

      server.on("error", (err) => {
        reject(err);
      });

      // Bind strictly to loopback IPv4
      server.listen(requestedPort, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;

        this.activePort = address.port;
        this.server = server;
        resolve(this.activePort);
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    return new Promise((resolve, reject) => {
      this.server?.close((err) => {
        this.server = undefined;
        this.activePort = undefined;

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const rawUrl = req.url ?? "/";
    const parsedUrl = new URL(rawUrl, "http://127.0.0.1");
    const pathname = parsedUrl.pathname;
    const isWatch = parsedUrl.searchParams.get("watch") === "1" || parsedUrl.searchParams.get("watch") === "true";

    const sendJson = (statusCode: number, payload: unknown) => {
      res.writeHead(statusCode, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify(payload));
    };

    // Strict mutation guard: reject any write attempt with 403 Forbidden
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "OPTIONS") {
      sendJson(403, {
        kind: "Status",
        apiVersion: "v1",
        status: "Failure",
        message: "OpenLens Demo Cluster is simulated in-memory and strictly read-only.",
        reason: "Forbidden",
        code: 403,
      });

      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      });
      res.end();

      return;
    }

    // Access review endpoints for client RBAC checking
    if (req.method === "POST") {
      if (pathname.includes("/selfsubjectaccessreviews")) {
        sendJson(201, {
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          status: {
            allowed: true,
            reason: "Demo cluster simulated read access",
          },
        });

        return;
      }

      if (pathname.includes("/selfsubjectrulesreviews")) {
        sendJson(201, {
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectRulesReview",
          status: {
            resourceRules: [
              {
                verbs: ["get", "list", "watch"],
                apiGroups: ["*"],
                resources: ["*"],
              },
            ],
            nonResourceRules: [
              {
                verbs: ["get"],
                nonResourceURLs: ["*"],
              },
            ],
            incomplete: false,
          },
        });

        return;
      }

      // Any other POST is rejected
      sendJson(403, {
        kind: "Status",
        apiVersion: "v1",
        status: "Failure",
        message: "OpenLens Demo Cluster is simulated in-memory and strictly read-only.",
        reason: "Forbidden",
        code: 403,
      });

      return;
    }

    // Handle watch requests with line-delimited ADDED events
    const handleWatchOrList = (listFn: () => { items: any[]; [key: string]: any }) => {
      const data = listFn();

      if (!isWatch) {
        sendJson(200, data);

        return;
      }

      res.writeHead(200, {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
      });

      for (const item of data.items) {
        res.write(`${JSON.stringify({ type: "ADDED", object: item })}\n`);
      }

      if (parsedUrl.searchParams.get("allowWatchBookmarks") === "true") {
        res.write(`${JSON.stringify({
          type: "BOOKMARK",
          object: {
            apiVersion: "v1",
            kind: data.kind.replace("List", ""),
            metadata: { resourceVersion: "200" },
          },
        })}\n`);
      }

      // Keep watch stream open
    };

    // Route matching
    if (pathname === "/version") {
      sendJson(200, getDemoVersionInfo());

      return;
    }

    if (pathname === "/api") {
      sendJson(200, getDemoApiVersions());

      return;
    }

    if (pathname === "/apis") {
      sendJson(200, getDemoApisGroupList());

      return;
    }

    if (pathname === "/api/v1" || /^\/apis\/[^/]+\/[^/]+$/.test(pathname)) {
      const groupVersion = pathname === "/api/v1" ? "v1" : pathname.slice("/apis/".length);
      const groups = getDemoApisGroupList().groups;
      const known = groupVersion === "v1" || groups.some(group => group.versions.some(version => version.groupVersion === groupVersion));

      if (known) {
        const named = (name: string, kind: string, namespaced: boolean) => ({
          name, singularName: "", namespaced, kind, verbs: ["get", "list", "watch"],
        });
        const resources: Record<string, ReturnType<typeof named>[]> = {
          "v1": [named("namespaces", "Namespace", false), named("nodes", "Node", false), named("pods", "Pod", true), named("services", "Service", true)],
          "apps/v1": [named("deployments", "Deployment", true), named("replicasets", "ReplicaSet", true)],
          "gateway.networking.k8s.io/v1": [named("gateways", "Gateway", true), named("gatewayclasses", "GatewayClass", false)],
          "admissionregistration.k8s.io/v1": [named("validatingadmissionpolicies", "ValidatingAdmissionPolicy", false)],
          "resource.k8s.io/v1alpha2": [named("deviceclasses", "DeviceClass", false)],
        };

        sendJson(200, { kind: "APIResourceList", apiVersion: "v1", groupVersion, resources: resources[groupVersion] ?? [] });

        return;
      }
    }

    if (/^\/apis\/[^/]+$/.test(pathname)) {
      const name = pathname.slice("/apis/".length);
      const group = getDemoApisGroupList().groups.find(item => item.name === name);

      if (group) {
        sendJson(200, { kind: "APIGroup", apiVersion: "v1", ...group });

        return;
      }
    }

    if (pathname.endsWith("/namespaces") || pathname === "/api/v1/namespaces") {
      handleWatchOrList(getDemoNamespaces);

      return;
    }

    if (pathname.endsWith("/nodes") || pathname === "/api/v1/nodes") {
      handleWatchOrList(getDemoNodes);

      return;
    }

    if (pathname.endsWith("/log")) {
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      const now = new Date().toISOString();
      res.write(`${now} 2026-11-01T18:00:00.000Z [info] Demo application started on port 8080\n`);
      res.write(`${now} 2026-11-01T18:00:01.000Z [info] Serving HTTP traffic on demo-apps/demo-frontend\n`);
      res.write(`${now} 2026-11-01T18:00:02.000Z [info] Health check probe succeeded: 200 OK\n`);
      res.end();

      return;
    }

    if (pathname.endsWith("/pods") || pathname.includes("/pods")) {
      handleWatchOrList(getDemoPods);

      return;
    }

    if (pathname.endsWith("/deployments") || pathname.includes("/deployments")) {
      handleWatchOrList(getDemoDeployments);

      return;
    }

    if (pathname.endsWith("/replicasets") || pathname.includes("/replicasets")) {
      handleWatchOrList(getDemoReplicaSets);

      return;
    }

    if (pathname.endsWith("/services") || pathname.includes("/services")) {
      handleWatchOrList(getDemoServices);

      return;
    }

    if (pathname.endsWith("/gateways") || pathname.includes("/gateways")) {
      handleWatchOrList(getDemoGateways);

      return;
    }

    if (pathname.endsWith("/gatewayclasses") || pathname.includes("/gatewayclasses")) {
      handleWatchOrList(getDemoGatewayClasses);

      return;
    }

    if (pathname.endsWith("/validatingadmissionpolicies") || pathname.includes("/validatingadmissionpolicies")) {
      handleWatchOrList(getDemoAdmissionPolicies);

      return;
    }

    if (pathname.endsWith("/deviceclasses") || pathname.includes("/deviceclasses")) {
      handleWatchOrList(getDemoDeviceClasses);

      return;
    }

    // Default 404 for unknown mock path
    sendJson(404, {
      kind: "Status",
      apiVersion: "v1",
      status: "Failure",
      message: `Path ${pathname} not found in OpenLens Demo Cluster`,
      reason: "NotFound",
      code: 404,
    });
  }
}
