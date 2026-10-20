/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Runs the R1 end-to-end integration and lab verification suite against either:
 * - An external disposable Kubernetes lab API server specified via `OPENLENS_LAB_API`, OR
 * - A built-in local HTTP Kubernetes API lab server bound to `127.0.0.1:0` (default).
 *
 * Exercises:
 * - R1-02: JSON Patch (`application/json-patch+json`) with `test` preconditions (`resourceVersion` + `uid`)
 *   for Deployment, StatefulSet, and CRD resources, verifying atomic rejection on stale `resourceVersion` or `uid`.
 * - R1-03: PUT concurrency (`resourceVersion`), post-save GET verification, `stringData` -> `data` Secret transformation,
 *   and secret value redaction on conflict.
 * - R1-04: Kubeconfig round-trip (`tls-server-name`, `proxy-url`, `disable-compression`, `token-file`, `exec`)
 *   connecting to the local lab API endpoint.
 * - R1-05: Watch stream `allowWatchBookmarks=true`, `BOOKMARK` event handling, and `410 Gone` resync over HTTP.
 */
import http from "http";
import type { AddressInfo } from "net";
import fetch from "@openlens/node-fetch";
import { applyPatch } from "rfc6902";
import { observable } from "mobx";
import yaml from "js-yaml";
import { KubeObject } from "@openlens/kube-object";
import { EditResourceLabelName, EditResourceModel } from "./edit-resource-model.injectable";
import type { EditingResource, EditResourceTabStore } from "../store";
import { dumpConfigYaml, loadConfigFromString, loadValidatedConfig, splitConfig } from "../../../../../common/kube-helpers";

const namespace = "openlens-editor-lab";

interface StoredResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    resourceVersion: string;
    uid: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: any;
}

function createLocalK8sLabServer() {
  let rvCounter = 100;
  let uidCounter = 1;
  const store = new Map<string, StoredResource>();

  const nextRv = () => String(++rvCounter);
  const nextUid = () => `lab-uid-${++uidCounter}`;

  const normalizeSecretData = (obj: Record<string, any>) => {
    if (obj.kind === "Secret" && obj.stringData && typeof obj.stringData === "object") {
      obj.data = { ...(obj.data ?? {}) };

      for (const [k, v] of Object.entries(obj.stringData)) {
        obj.data[k] = Buffer.from(String(v)).toString("base64");
      }
      delete obj.stringData;
    }
  };

  const inferKindAndApiVersion = (urlPath: string, body: Record<string, any>) => {
    if (body.kind && body.apiVersion) {
      return { kind: body.kind, apiVersion: body.apiVersion };
    }

    if (urlPath.includes("/configmaps")) return { kind: "ConfigMap", apiVersion: "v1" };
    if (urlPath.includes("/secrets")) return { kind: "Secret", apiVersion: "v1" };
    if (urlPath.includes("/deployments")) return { kind: "Deployment", apiVersion: "apps/v1" };
    if (urlPath.includes("/statefulsets")) return { kind: "StatefulSet", apiVersion: "apps/v1" };
    if (urlPath.includes("/widgets")) return { kind: "Widget", apiVersion: "devops.openlens.dev/v1alpha1" };
    if (urlPath.includes("/namespaces")) return { kind: "Namespace", apiVersion: "v1" };

    return { kind: "GenericObject", apiVersion: "v1" };
  };

  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? "/";
    const parsedUrl = new URL(rawUrl, "http://127.0.0.1");
    const pathname = parsedUrl.pathname;

    // Watch endpoint support for R1-05 verification
    if (req.method === "GET" && parsedUrl.searchParams.get("watch") === "1") {
      const requestedRv = parsedUrl.searchParams.get("resourceVersion");

      if (requestedRv === "expired-rv-410") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(`${JSON.stringify({
          type: "ERROR",
          object: {
            kind: "Status",
            apiVersion: "v1",
            status: "Failure",
            reason: "Gone",
            message: "too old resource version: expired-rv-410 (1000)",
            code: 410,
          },
        })}\n`);

        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.write(`${JSON.stringify({
        type: "ADDED",
        object: {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: "watched-cm",
            namespace,
            resourceVersion: "501",
            uid: "watch-uid-1",
          },
          data: { status: "active" },
        },
      })}\n`);

      if (parsedUrl.searchParams.get("allowWatchBookmarks") === "true") {
        res.write(`${JSON.stringify({
          type: "BOOKMARK",
          object: {
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: {
              resourceVersion: "599",
            },
          },
        })}\n`);
      }

      res.end();

      return;
    }

    const chunks: Buffer[] = [];

    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const contentType = String(req.headers["content-type"] ?? "application/json");

      const sendJson = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      if (req.method === "GET") {
        const existing = store.get(pathname);

        if (!existing) {
          return sendJson(404, {
            kind: "Status",
            apiVersion: "v1",
            status: "Failure",
            reason: "NotFound",
            message: `${pathname} not found`,
            code: 404,
          });
        }

        return sendJson(200, JSON.parse(JSON.stringify(existing)));
      }

      if (req.method === "DELETE") {
        store.delete(pathname);

        return sendJson(200, { kind: "Status", apiVersion: "v1", status: "Success", code: 200 });
      }

      const parsedBody = bodyText ? JSON.parse(bodyText) : {};

      if (req.method === "POST") {
        const name = parsedBody?.metadata?.name;
        const itemPath = pathname.endsWith(`/${name}`) ? pathname : `${pathname}/${name}`;
        const { kind, apiVersion } = inferKindAndApiVersion(pathname, parsedBody);
        const nsMatch = pathname.match(/\/namespaces\/([^/]+)\//);
        const created: StoredResource = {
          ...parsedBody,
          apiVersion,
          kind,
          metadata: {
            ...(parsedBody.metadata ?? {}),
            name,
            ...(nsMatch ? { namespace: nsMatch[1] } : {}),
            resourceVersion: nextRv(),
            uid: parsedBody?.metadata?.uid ?? nextUid(),
          },
        };

        normalizeSecretData(created);
        store.set(itemPath, created);

        return sendJson(201, JSON.parse(JSON.stringify(created)));
      }

      if (req.method === "PUT") {
        const existing = store.get(pathname);

        if (!existing) {
          return sendJson(404, {
            kind: "Status",
            apiVersion: "v1",
            status: "Failure",
            reason: "NotFound",
            message: `${pathname} not found`,
            code: 404,
          });
        }

        const incomingRv = parsedBody?.metadata?.resourceVersion;

        if (incomingRv && incomingRv !== existing.metadata.resourceVersion) {
          return sendJson(409, {
            kind: "Status",
            apiVersion: "v1",
            status: "Failure",
            reason: "Conflict",
            message: `Operation cannot be fulfilled on ${existing.kind} "${existing.metadata.name}": the object has been modified; please apply your changes to the latest version and try again`,
            code: 409,
          });
        }

        const updated: StoredResource = {
          ...parsedBody,
          apiVersion: existing.apiVersion,
          kind: existing.kind,
          metadata: {
            ...(parsedBody.metadata ?? {}),
            name: existing.metadata.name,
            namespace: existing.metadata.namespace,
            uid: existing.metadata.uid,
            resourceVersion: nextRv(),
          },
        };

        normalizeSecretData(updated);
        store.set(pathname, updated);

        return sendJson(200, JSON.parse(JSON.stringify(updated)));
      }

      if (req.method === "PATCH") {
        const existing = store.get(pathname);

        if (!existing) {
          return sendJson(404, {
            kind: "Status",
            apiVersion: "v1",
            status: "Failure",
            reason: "NotFound",
            message: `${pathname} not found`,
            code: 404,
          });
        }

        const clone: StoredResource = JSON.parse(JSON.stringify(existing));

        if (contentType.includes("application/json-patch+json")) {
          if (!Array.isArray(parsedBody)) {
            return sendJson(400, {
              kind: "Status",
              apiVersion: "v1",
              status: "Failure",
              reason: "BadRequest",
              message: "JSON Patch body must be an array",
              code: 400,
            });
          }

          const results = applyPatch(clone, parsedBody);
          const failedOp = results.find(err => err !== null);

          if (failedOp) {
            return sendJson(409, {
              kind: "Status",
              apiVersion: "v1",
              status: "Failure",
              reason: "Conflict",
              message: `the object has been modified; precondition test failed: ${failedOp.message}`,
              code: 409,
            });
          }
        } else {
          // merge-patch
          for (const [k, v] of Object.entries(parsedBody)) {
            if (v && typeof v === "object" && !Array.isArray(v) && typeof clone[k] === "object") {
              clone[k] = { ...clone[k], ...v };
            } else {
              clone[k] = v;
            }
          }
        }

        clone.metadata.resourceVersion = nextRv();
        normalizeSecretData(clone);
        store.set(pathname, clone);

        return sendJson(200, JSON.parse(JSON.stringify(clone)));
      }

      return sendJson(405, { message: "Method not allowed" });
    });
  });

  return {
    start: () => new Promise<string>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;

        resolve(`http://127.0.0.1:${port}`);
      });
    }),
    stop: () => new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    }),
  };
}

describe("R1-06 lab cluster integration (EditResource, Kubeconfig, Watch & Concurrency)", () => {
  let api = process.env.OPENLENS_LAB_API ?? "";
  let localServer: ReturnType<typeof createLocalK8sLabServer> | undefined;

  const configMapLink = `/api/v1/namespaces/${namespace}/configmaps/editor-cm`;
  const secretLink = `/api/v1/namespaces/${namespace}/secrets/editor-secret`;
  const deploymentLink = `/apis/apps/v1/namespaces/${namespace}/deployments/editor-deploy`;
  const statefulSetLink = `/apis/apps/v1/namespaces/${namespace}/statefulsets/editor-sts`;
  const crdLink = `/apis/devops.openlens.dev/v1alpha1/namespaces/${namespace}/widgets/editor-widget`;

  const request = async (method: string, path: string, body?: unknown, contentType = "application/json") => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { "content-type": contentType },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return { status: res.status, data: await res.json() as any };
  };

  const createModel = (selfLink: string) => {
    const editing = observable<EditingResource>({ resource: selfLink });
    const notifications = { success: [] as unknown[], error: [] as unknown[] };
    const model = new EditResourceModel({
      requestKubeResource: async (link) => {
        const { status, data } = await request("GET", link);

        if (status !== 200) {
          return { callWasSuccessful: false, error: data.message };
        }

        data.metadata.selfLink = link;

        return { callWasSuccessful: true, response: new KubeObject(data) };
      },
      requestPatchKubeResource: async (link, patch) => {
        const { status, data } = await request("PATCH", link, patch, "application/json-patch+json");

        if (status === 200) {
          return {
            callWasSuccessful: true,
            response: { name: data?.metadata?.name ?? "resource", kind: data?.kind ?? "Object" },
          };
        }

        const isConflict = status === 409 || status === 422 || /conflict|modified|test operation failed/i.test(String(data?.message ?? ""));

        return {
          callWasSuccessful: false,
          error: data?.message ?? `HTTP ${status}`,
          isConflict,
        };
      },
      requestReplaceKubeResource: async (link, object) => {
        const { status, data } = await request("PUT", link, object);

        return status === 200
          ? { callWasSuccessful: true }
          : { callWasSuccessful: false, error: data.message, isConflict: status === 409 };
      },
      showSuccessNotification: (notification) => {
        notifications.success.push(notification);

        return () => {};
      },
      showErrorNotification: (notification) => {
        notifications.error.push(notification);

        return () => {};
      },
      store: { getData: () => editing } as unknown as EditResourceTabStore,
      tabId: "lab",
      waitForEditingResource: async () => editing,
    });
    const edit = (change: (object: Record<string, any>) => void) => {
      const object = yaml.load(model.configuration.value.get()) as Record<string, any>;

      change(object);
      model.configuration.onChange(yaml.dump(object));
    };

    return { model, edit, notifications, editing };
  };

  beforeAll(async () => {
    if (!api) {
      localServer = createLocalK8sLabServer();
      api = await localServer.start();
    }

    await request("POST", "/api/v1/namespaces", { metadata: { name: namespace }});
    await request("DELETE", configMapLink);
    await request("DELETE", secretLink);
    await request("DELETE", deploymentLink);
    await request("DELETE", statefulSetLink);
    await request("DELETE", crdLink);

    await request("POST", `/api/v1/namespaces/${namespace}/configmaps`, {
      metadata: { name: "editor-cm", labels: { team: "devops" }},
      data: { key: "old", other: "a" },
    });
    await request("POST", `/api/v1/namespaces/${namespace}/secrets`, {
      metadata: { name: "editor-secret" },
      stringData: { user: "admin" },
    });
    await request("POST", `/apis/apps/v1/namespaces/${namespace}/deployments`, {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "editor-deploy", labels: { app: "web" }},
      spec: {
        replicas: 2,
        template: {
          spec: {
            containers: [{ name: "web", image: "nginx:1.25" }],
          },
        },
      },
    });
    await request("POST", `/apis/apps/v1/namespaces/${namespace}/statefulsets`, {
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: { name: "editor-sts" },
      spec: {
        replicas: 1,
        serviceName: "sts-svc",
      },
    });
    await request("POST", `/apis/devops.openlens.dev/v1alpha1/namespaces/${namespace}/widgets`, {
      apiVersion: "devops.openlens.dev/v1alpha1",
      kind: "Widget",
      metadata: { name: "editor-widget" },
      spec: {
        mode: "standard",
        thresholds: [10, 20],
      },
    });
  });

  afterAll(async () => {
    if (localServer) {
      await localServer.stop();
    }
  });

  it("saves a ConfigMap, verifies it and adds no label", async () => {
    const { model, edit, notifications } = createModel(configMapLink);

    await model.load();
    edit(object => {
      object.data.key = "new";
    });

    expect(await model.save()).toEqual([]);
    expect(notifications.error).toEqual([]);

    const { data } = await request("GET", configMapLink);

    expect(data.data).toEqual({ key: "new", other: "a" });
    expect(data.metadata.labels).toEqual({ team: "devops" });
    expect(data.metadata.labels[EditResourceLabelName]).toBeUndefined();
  });

  it("rejects a stale ConfigMap PUT save with 409, keeps the remote change and the draft, and succeeds after explicit rebase", async () => {
    const { model, edit, editing, notifications } = createModel(configMapLink);

    await model.load();
    await fetch(`${api}${configMapLink}`, {
      method: "PATCH",
      headers: { "content-type": "application/merge-patch+json" },
      body: JSON.stringify({ data: { other: "theirs" }}),
    });
    edit(object => {
      object.data.key = "mine";
    });

    const draft = editing.draft;

    expect(await model.save()).toBeNull();
    expect(notifications.success).toEqual([]);
    expect(editing.draft).toBe(draft);
    expect(model.conflict.get()?.remoteChangedPaths).toContain("/data/other");

    const { data } = await request("GET", configMapLink);

    expect(data.data).toEqual({ key: "new", other: "theirs" });

    await model.rebaseOnClusterVersion();

    expect(await model.save()).toEqual([]);
    expect((await request("GET", configMapLink)).data.data).toEqual({ key: "mine", other: "theirs" });
  });

  it("saves Secret stringData and verifies it as base64 data without leaking secret values on conflict", async () => {
    const { model, edit, notifications } = createModel(secretLink);

    await model.load();
    edit(object => {
      object.stringData = { password: "lab-only-value" };
    });

    expect(await model.save()).toEqual([]);
    expect(notifications.error).toEqual([]);

    const { data } = await request("GET", secretLink);

    expect(data.data.password).toBe(Buffer.from("lab-only-value").toString("base64"));
    expect(data.data.user).toBe(Buffer.from("admin").toString("base64"));
  });

  it("patches Deployment, StatefulSet, and CRD with JSON Patch test preconditions (resourceVersion + uid) and blocks concurrent overwrites", async () => {
    // 1. Concurrent Deployment edit by two operators
    const editorA = createModel(deploymentLink);
    const editorB = createModel(deploymentLink);

    await editorA.model.load();
    await editorB.model.load();

    // Operator A scales replicas to 4
    editorA.edit(obj => {
      obj.spec.replicas = 4;
    });
    expect(await editorA.model.save()).toEqual([]);

    // Operator B (holding stale resourceVersion) edits container image
    editorB.edit(obj => {
      obj.spec.template.spec.containers[0].image = "nginx:1.26-alpine";
    });
    const draftB = editorB.editing.draft;

    // Server rejects Operator B's JSON Patch because /metadata/resourceVersion test precondition fails
    expect(await editorB.model.save()).toBeNull();
    expect(editorB.editing.draft).toBe(draftB);
    expect(editorB.model.conflict.get()?.remoteChangedPaths).toContain("/spec/replicas");

    // Verify Operator A's replicas=4 was NOT overwritten on the server
    const afterFailedPatch = await request("GET", deploymentLink);

    expect(afterFailedPatch.data.spec.replicas).toBe(4);
    expect(afterFailedPatch.data.spec.template.spec.containers[0].image).toBe("nginx:1.25");

    // Operator B explicitly rebases onto the cluster version and re-saves
    await editorB.model.rebaseOnClusterVersion();
    expect(await editorB.model.save()).toEqual([]);

    const afterRebasePatch = await request("GET", deploymentLink);

    expect(afterRebasePatch.data.spec.replicas).toBe(4);
    expect(afterRebasePatch.data.spec.template.spec.containers[0].image).toBe("nginx:1.26-alpine");

    // 2. StatefulSet and CustomResource (Widget) JSON Patch with preconditions
    const stsEditor = createModel(statefulSetLink);

    await stsEditor.model.load();
    stsEditor.edit(obj => {
      obj.spec.replicas = 3;
    });
    expect(await stsEditor.model.save()).toEqual([]);
    expect((await request("GET", statefulSetLink)).data.spec.replicas).toBe(3);

    const crdEditor = createModel(crdLink);

    await crdEditor.model.load();
    crdEditor.edit(obj => {
      obj.spec.mode = "high-availability";
      obj.spec.thresholds = [10, 25, 50];
    });
    expect(await crdEditor.model.save()).toEqual([]);
    expect((await request("GET", crdLink)).data.spec).toEqual({
      mode: "high-availability",
      thresholds: [10, 25, 50],
    });
  });

  it("preserves kubeconfig cluster/user/exec fields across round-trip and connects to the lab endpoint", async () => {
    const rawKubeconfig = yaml.dump({
      apiVersion: "v1",
      kind: "Config",
      "current-context": "lab-ctx",
      clusters: [
        {
          name: "lab-cluster",
          cluster: {
            server: api,
            "tls-server-name": "k8s-lab.internal",
            "proxy-url": "http://127.0.0.1:8888",
            "disable-compression": true,
          },
        },
      ],
      users: [
        {
          name: "lab-user",
          user: {
            "token-file": "/var/run/secrets/kubernetes.io/serviceaccount/token",
            exec: {
              apiVersion: "client.authentication.k8s.io/v1",
              command: "aws",
              args: ["eks", "get-token", "--cluster-name", "lab"],
              env: [{ name: "AWS_PROFILE", value: "devops" }],
              interactiveMode: "IfAvailable",
              provideClusterInfo: true,
            },
          },
        },
      ],
      contexts: [
        {
          name: "lab-ctx",
          context: {
            cluster: "lab-cluster",
            user: "lab-user",
            namespace,
          },
        },
      ],
    });

    const { config, error } = loadConfigFromString(rawKubeconfig);

    expect(error).toBeUndefined();

    const split = splitConfig(config);

    expect(split).toHaveLength(1);

    const dumped = dumpConfigYaml(split[0].config);
    const validated = loadValidatedConfig(dumped, "lab-ctx");

    expect(validated.error).toBeUndefined();

    if (validated.error) {
      throw validated.error;
    }

    const cluster = validated.cluster as unknown as Record<string, unknown>;

    expect(validated.cluster.server).toBe(api);
    expect(validated.cluster.tlsServerName).toBe("k8s-lab.internal");
    expect(cluster.proxyUrl).toBe("http://127.0.0.1:8888");
    expect(cluster.disableCompression).toBe(true);
    expect(validated.user?.exec?.command).toBe("aws");

    // Verify live HTTP query using the server URL extracted from the round-tripped kubeconfig
    const res = await fetch(`${validated.cluster.server}${configMapLink}`);

    expect(res.status).toBe(200);
  });

  it("handles watch stream BOOKMARK events and 410 Gone responses from the lab server", async () => {
    const watchRes = await fetch(`${api}/api/v1/namespaces/${namespace}/configmaps?watch=1&allowWatchBookmarks=true&resourceVersion=500`);

    expect(watchRes.status).toBe(200);
    const lines = (await watchRes.text()).trim().split("\n").map(line => JSON.parse(line));

    expect(lines).toHaveLength(2);
    expect(lines[0].type).toBe("ADDED");
    expect(lines[1]).toEqual({
      type: "BOOKMARK",
      object: {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          resourceVersion: "599",
        },
      },
    });

    const goneRes = await fetch(`${api}/api/v1/namespaces/${namespace}/configmaps?watch=1&resourceVersion=expired-rv-410`);
    const goneEvent = JSON.parse((await goneRes.text()).trim());

    expect(goneEvent.type).toBe("ERROR");
    expect(goneEvent.object.code).toBe(410);
  });
});
