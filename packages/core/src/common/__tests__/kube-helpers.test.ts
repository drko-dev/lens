/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { KubeConfig } from "@kubernetes/client-node";
import { ExecAuth } from "@kubernetes/client-node/dist/exec_auth";
import yaml from "js-yaml";
import type { ExtendedCluster, ExtendedUser } from "../kube-helpers";
import {
  dumpConfigYaml,
  loadConfigFromString,
  loadValidatedConfig,
  sanitizeKubeConfigValidationDetails,
  splitConfig,
  validateKubeConfig,
} from "../kube-helpers";

const kubeconfig = `
apiVersion: v1
clusters:
- cluster:
    server: https://localhost
  name: test
contexts:
- context:
    cluster: test
    user: test
  name: valid
- context:
    cluster: test
  name: validNoUser
- context:
    cluster: test2
    user: test
  name: invalidCluster
- context:
    cluster: test
    user: test2
  name: invalidUser
- context:
    cluster: test
    user: invalidExec
  name: invalidExec
current-context: test
kind: Config
preferences: {}
users:
- name: test
  user:
    exec:
      command: echo
- name: invalidExec
  user:
    exec:
      command: foo
`;

interface Kubeconfig {
  apiVersion: string;
  clusters: [{
    name: string;
    cluster: {
      server: string;
    };
  }];
  contexts: [{
    context: {
      cluster: string;
      user: string;
    };
    name: string;
  }];
  users: [{
    name: string;
  }];
  kind: string;
  "current-context": string;
  preferences: {};
}

let mockKubeConfig: Kubeconfig;

describe("kube helpers", () => {
  describe("validateKubeconfig", () => {
    const kc = new KubeConfig();

    beforeAll(() => {
      kc.loadFromString(kubeconfig);
    });
    describe("with default validation options", () => {
      describe("with valid kubeconfig", () => {
        it("does not return an error", () => {
          expect(validateKubeConfig(kc, "valid")).toBeDefined();
        });
        it("does not return an error for context without user", () => {
          const res = validateKubeConfig(kc, "validNoUser");
          expect(res.error).toBeUndefined();
          if (!res.error) {
            expect(res.cluster).toBeDefined();
          }
        });
      });
      describe("with invalid context object", () => {
        it("returns an error", () => {
          expect(validateKubeConfig(kc, "invalid").error?.toString()).toEqual(
            expect.stringContaining("No valid context object provided in kubeconfig for context 'invalid'"),
          );
        });
      });

      describe("with invalid cluster object", () => {
        it("returns an error", () => {
          expect(validateKubeConfig(kc, "invalidCluster").error?.toString()).toEqual(
            expect.stringContaining("No valid cluster object provided in kubeconfig for context 'invalidCluster'"),
          );
        });
      });

      describe("with invalid user object", () => {
        it("returns an error", () => {
          expect(validateKubeConfig(kc, "invalidUser").error?.toString()).toEqual(
            expect.stringContaining("No valid user object provided in kubeconfig for context 'invalidUser'"),
          );
        });
      });
    });
  });

  describe("pre-validate context object in kubeconfig tests", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe("Check logger.error() output", () => {
      it("invalid yaml string", () => {
        const invalidYAMLString = "fancy foo config";

        expect(loadConfigFromString(invalidYAMLString).error).toBeInstanceOf(Error);
      });
      it("empty contexts", () => {
        const emptyContexts = `apiVersion: v1\ncontexts: []`;

        expect(loadConfigFromString(emptyContexts).error).toBeUndefined();
      });
    });

    describe("Check valid kubeconfigs", () => {
      beforeEach(() => {
        mockKubeConfig = {
          apiVersion: "v1",
          clusters: [{
            name: "minikube",
            cluster: {
              server: "https://192.168.64.3:8443",
            },
          }],
          contexts: [{
            context: {
              cluster: "minikube",
              user: "minikube",
            },
            name: "minikube",
          }],
          users: [{
            name: "minikube",
          }],
          kind: "Config",
          "current-context": "minikube",
          preferences: {},
        };
      });

      it("single context is ok", async () => {
        const { config } = loadConfigFromString(JSON.stringify(mockKubeConfig));

        expect(config.getCurrentContext()).toBe("minikube");
      });

      it("multiple context is ok", async () => {
        mockKubeConfig.contexts.push({ context: { cluster: "cluster-2", user: "cluster-2" }, name: "cluster-2" });
        const { config } = loadConfigFromString(JSON.stringify(mockKubeConfig));

        expect(config.getCurrentContext()).toBe("minikube");
        expect(config.contexts.length).toBe(2);
      });
    });

    describe("Check invalid kubeconfigs", () => {
      beforeEach(() => {
        mockKubeConfig = {
          apiVersion: "v1",
          clusters: [{
            name: "minikube",
            cluster: {
              server: "https://192.168.64.3:8443",
            },
          }],
          contexts: [{
            context: {
              cluster: "minikube",
              user: "minikube",
            },
            name: "minikube",
          }],
          users: [{
            name: "minikube",
          }],
          kind: "Config",
          "current-context": "minikube",
          preferences: {},
        };
      });

      it("empty name in context causes it to be removed", async () => {
        mockKubeConfig.contexts.push({ context: { cluster: "cluster-2", user: "cluster-2" }, name: "" });
        expect(mockKubeConfig.contexts.length).toBe(2);
        const { config } = loadConfigFromString(JSON.stringify(mockKubeConfig));

        expect(config.getCurrentContext()).toBe("minikube");
        expect(config.contexts.length).toBe(1);
      });

      it("empty cluster in context causes it to be removed", async () => {
        mockKubeConfig.contexts.push({ context: { cluster: "", user: "cluster-2" }, name: "cluster-2" });
        expect(mockKubeConfig.contexts.length).toBe(2);
        const { config } = loadConfigFromString(JSON.stringify(mockKubeConfig));

        expect(config.getCurrentContext()).toBe("minikube");
        expect(config.contexts.length).toBe(1);
      });

      it("empty user in context causes it to be removed", async () => {
        mockKubeConfig.contexts.push({ context: { cluster: "cluster-2", user: "" }, name: "cluster-2" });
        expect(mockKubeConfig.contexts.length).toBe(2);
        const { config } = loadConfigFromString(JSON.stringify(mockKubeConfig));

        expect(config.getCurrentContext()).toBe("minikube");
        expect(config.contexts.length).toBe(1);
      });

      it("invalid context in between valid contexts is removed", async () => {
        mockKubeConfig.contexts.push({ context: { cluster: "cluster-2", user: "" }, name: "cluster-2" });
        mockKubeConfig.contexts.push({ context: { cluster: "cluster-3", user: "cluster-3" }, name: "cluster-3" });
        expect(mockKubeConfig.contexts.length).toBe(3);
        const { config } = loadConfigFromString(JSON.stringify(mockKubeConfig));

        expect(config.getCurrentContext()).toBe("minikube");
        expect(config.contexts.length).toBe(2);
        expect(config.contexts[0].name).toBe("minikube");
        expect(config.contexts[1].name).toBe("cluster-3");
      });
    });
  });

  describe("R1-04 kubeconfig round-trip fidelity, isolated validation, and exec matrix", () => {
    it("preserves tls-server-name, proxy-url, disable-compression, token-file, and full exec fields across load -> split -> dump -> load", () => {
      const sourceYaml = `
apiVersion: v1
kind: Config
current-context: eks-prod
clusters:
  - name: eks-prod-cluster
    cluster:
      server: https://10.20.30.40:6443
      certificate-authority-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t
      tls-server-name: api.eks-prod.internal
      proxy-url: socks5://127.0.0.1:1080
      disable-compression: true
users:
  - name: eks-exec-user
    user:
      token-file: /nonexistent/projected/serviceaccount/token
      as: system:admin
      as-uid: uid-999
      as-groups:
        - system:masters
      exec:
        apiVersion: client.authentication.k8s.io/v1
        command: aws
        args:
          - --region
          - us-east-1
          - eks
          - get-token
          - --cluster-name
          - eks-prod-cluster
        env:
          - name: AWS_PROFILE
            value: prod-devops
          - name: AWS_STS_REGIONAL_ENDPOINTS
            value: regional
        interactiveMode: IfAvailable
        provideClusterInfo: true
        installHint: Install AWS CLI v2 to authenticate with EKS
contexts:
  - name: eks-prod
    context:
      cluster: eks-prod-cluster
      user: eks-exec-user
      namespace: kube-system
`;

      const { config, error } = loadConfigFromString(sourceYaml);
      expect(error).toBeUndefined();

      const splitEntries = splitConfig(config);
      expect(splitEntries).toHaveLength(1);
      expect(splitEntries[0].validationResult.error).toBeUndefined();

      const dumpedYaml = dumpConfigYaml(splitEntries[0].config);
      const reparsedRaw = yaml.load(dumpedYaml) as Record<string, any>;

      expect(reparsedRaw.clusters[0].cluster).toMatchObject({
        server: "https://10.20.30.40:6443",
        "certificate-authority-data": "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t",
        "tls-server-name": "api.eks-prod.internal",
        "proxy-url": "socks5://127.0.0.1:1080",
        "disable-compression": true,
      });

      expect(reparsedRaw.users[0].user).toMatchObject({
        "token-file": "/nonexistent/projected/serviceaccount/token",
        as: "system:admin",
        "as-uid": "uid-999",
        "as-groups": ["system:masters"],
        exec: {
          apiVersion: "client.authentication.k8s.io/v1",
          command: "aws",
          args: ["--region", "us-east-1", "eks", "get-token", "--cluster-name", "eks-prod-cluster"],
          env: [
            { name: "AWS_PROFILE", value: "prod-devops" },
            { name: "AWS_STS_REGIONAL_ENDPOINTS", value: "regional" },
          ],
          interactiveMode: "IfAvailable",
          provideClusterInfo: true,
          installHint: "Install AWS CLI v2 to authenticate with EKS",
        },
      });
      expect(reparsedRaw.users[0].user.token).toBeUndefined();

      // Reload the dumped YAML to verify full round-trip into KubeConfig
      const reloaded = loadConfigFromString(dumpedYaml);
      expect(reloaded.error).toBeUndefined();

      const reloadedCluster = reloaded.config.getCluster("eks-prod-cluster") as ExtendedCluster;
      expect(reloadedCluster).toMatchObject({
        name: "eks-prod-cluster",
        server: "https://10.20.30.40:6443",
        tlsServerName: "api.eks-prod.internal",
        proxyUrl: "socks5://127.0.0.1:1080",
        disableCompression: true,
      });

      const reloadedUser = reloaded.config.getUser("eks-exec-user") as ExtendedUser;
      expect(reloadedUser.tokenFile).toBe("/nonexistent/projected/serviceaccount/token");
      expect(reloadedUser.exec).toEqual({
        apiVersion: "client.authentication.k8s.io/v1",
        command: "aws",
        args: ["--region", "us-east-1", "eks", "get-token", "--cluster-name", "eks-prod-cluster"],
        env: [
          { name: "AWS_PROFILE", value: "prod-devops" },
          { name: "AWS_STS_REGIONAL_ENDPOINTS", value: "regional" },
        ],
        interactiveMode: "IfAvailable",
        provideClusterInfo: true,
        installHint: "Install AWS CLI v2 to authenticate with EKS",
      });
    });

    it("isolates malformed clusters, users, and contexts without blocking valid contexts in loadValidatedConfig", () => {
      const mixedYaml = `
apiVersion: v1
kind: Config
current-context: valid-ctx
clusters:
  - name: valid-cluster
    cluster:
      server: https://valid.k8s.local:6443
      proxy-url: http://proxy.k8s.local:8080
  - name: broken-cluster-no-server
    cluster: {}
users:
  - name: valid-user
    user:
      token: top-secret-valid-token-value
  - name: ""
    user:
      token: leaked-broken-user-secret-token
      password: super-secret-password-value
      client-key-data: LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQ==
contexts:
  - name: valid-ctx
    context:
      cluster: valid-cluster
      user: valid-user
  - name: broken-ctx
    context:
      cluster: broken-cluster-no-server
      user: valid-user
`;

      const { config, error } = loadConfigFromString(mixedYaml);
      expect(error).toBeDefined();

      // Ensure no secret value is leaked in error, error._original, or sanitized details
      const serializedError = JSON.stringify({
        message: error?.message,
        original: error?._original,
        details: error?.details,
        sanitized: sanitizeKubeConfigValidationDetails(error),
      });
      expect(serializedError).not.toContain("top-secret-valid-token-value");
      expect(serializedError).not.toContain("leaked-broken-user-secret-token");
      expect(serializedError).not.toContain("super-secret-password-value");
      expect(serializedError).not.toContain("LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQ==");

      // Valid context still passes loadValidatedConfig even though sibling entries had schema errors
      const validResult = loadValidatedConfig(mixedYaml, "valid-ctx");
      expect(validResult.error).toBeUndefined();
      if (!validResult.error) {
        expect(validResult.cluster.server).toBe("https://valid.k8s.local:6443");
        expect((validResult.cluster as ExtendedCluster).proxyUrl).toBe("http://proxy.k8s.local:8080");
      }

      // Broken context fails cleanly
      const brokenResult = loadValidatedConfig(mixedYaml, "broken-ctx");
      expect(brokenResult.error).toBeDefined();

      // splitConfig keeps both contexts and marks only broken-ctx with validationResult.error
      const split = splitConfig(config);
      const validSplit = split.find((s) => s.config.currentContext === "valid-ctx");
      const brokenSplit = split.find((s) => s.config.currentContext === "broken-ctx");
      expect(validSplit?.validationResult.error).toBeUndefined();
      expect(brokenSplit?.validationResult.error?.message).toContain("No valid cluster object");
    });

    it("validates exec fields and proxy-url per context in validateKubeConfig", () => {
      const yamlWithInvalidExecAndProxy = `
apiVersion: v1
kind: Config
clusters:
  - name: valid-cluster
    cluster:
      server: https://127.0.0.1:6443
  - name: bad-proxy-cluster
    cluster:
      server: https://127.0.0.1:6443
      proxy-url: ftp://unsupported-proxy:21
users:
  - name: empty-command-user
    user:
      exec:
        command: "   "
  - name: bad-env-user
    user:
      exec:
        command: kubelogin
        env:
          - name: ""
            value: foo
  - name: bad-interactive-user
    user:
      exec:
        command: kubelogin
        interactiveMode: InvalidMode
contexts:
  - name: ctx-empty-cmd
    context:
      cluster: valid-cluster
      user: empty-command-user
  - name: ctx-bad-env
    context:
      cluster: valid-cluster
      user: bad-env-user
  - name: ctx-bad-interactive
    context:
      cluster: valid-cluster
      user: bad-interactive-user
  - name: ctx-bad-proxy
    context:
      cluster: bad-proxy-cluster
`;

      const { config } = loadConfigFromString(yamlWithInvalidExecAndProxy);

      expect(validateKubeConfig(config, "ctx-empty-cmd").error?.message).toContain(
        "'command' must be a non-empty string",
      );
      expect(validateKubeConfig(config, "ctx-bad-env").error?.message).toContain(
        "'env' must be an array of { name, value } string pairs",
      );
      expect(validateKubeConfig(config, "ctx-bad-interactive").error?.message).toContain(
        "'interactiveMode' must be Never, IfAvailable, or Always",
      );
      expect(validateKubeConfig(config, "ctx-bad-proxy").error?.message).toContain(
        "Invalid proxy-url protocol",
      );
    });

    it("executes synthetic exec auth matrix: env propagation, expired credential refresh, and missing plugin handling", async () => {
      const kubeconfigWithExec = `
apiVersion: v1
kind: Config
current-context: synthetic-exec-ctx
clusters:
  - name: synthetic-cluster
    cluster:
      server: https://synthetic.k8s.local:6443
      tls-server-name: sni.synthetic.k8s.local
      proxy-url: http://127.0.0.1:8888
users:
  - name: synthetic-exec-user
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1
        command: mock-oidc-plugin
        args:
          - get-token
          - --audience=k8s
        env:
          - name: CUSTOM_PLUGIN_ENV
            value: expected-env-val
        interactiveMode: Never
        provideClusterInfo: true
contexts:
  - name: synthetic-exec-ctx
    context:
      cluster: synthetic-cluster
      user: synthetic-exec-user
`;

      const { config } = loadConfigFromString(kubeconfigWithExec);
      const user = config.getUser("synthetic-exec-user")!;
      const execAuth = new ExecAuth();
      const execSpy = jest.fn();
      (execAuth as any).execFn = execSpy;

      // 1. Valid token with short expiration + env propagation check
      const expiredTimestamp = new Date(Date.now() - 5_000).toISOString();
      const validTimestamp = new Date(Date.now() + 600_000).toISOString();

      execSpy.mockReturnValueOnce({
        status: 0,
        stdout: Buffer.from(JSON.stringify({
          apiVersion: "client.authentication.k8s.io/v1",
          kind: "ExecCredential",
          status: {
            token: "ephemeral-token-1",
            expirationTimestamp: expiredTimestamp,
          },
        })),
        stderr: Buffer.alloc(0),
      });

      const firstOpts: Record<string, any> = { headers: {} };
      await execAuth.applyAuthentication(user, firstOpts as any);

      expect(execSpy).toHaveBeenCalledTimes(1);
      expect(execSpy.mock.calls[0][0]).toBe("mock-oidc-plugin");
      expect(execSpy.mock.calls[0][1]).toEqual(["get-token", "--audience=k8s"]);
      expect(execSpy.mock.calls[0][2].env.CUSTOM_PLUGIN_ENV).toBe("expected-env-val");
      expect(firstOpts.headers.Authorization).toBe("Bearer ephemeral-token-1");

      // 2. Expired token triggers fresh execution on next request
      execSpy.mockReturnValueOnce({
        status: 0,
        stdout: Buffer.from(JSON.stringify({
          apiVersion: "client.authentication.k8s.io/v1",
          kind: "ExecCredential",
          status: {
            token: "ephemeral-token-2",
            expirationTimestamp: validTimestamp,
          },
        })),
        stderr: Buffer.alloc(0),
      });

      const secondOpts: Record<string, any> = { headers: {} };
      await execAuth.applyAuthentication(user, secondOpts as any);

      expect(execSpy).toHaveBeenCalledTimes(2);
      expect(secondOpts.headers.Authorization).toBe("Bearer ephemeral-token-2");

      // 3. Cached valid token is reused without re-spawning plugin
      const thirdOpts: Record<string, any> = { headers: {} };
      await execAuth.applyAuthentication(user, thirdOpts as any);
      expect(execSpy).toHaveBeenCalledTimes(2);
      expect(thirdOpts.headers.Authorization).toBe("Bearer ephemeral-token-2");

      // 4. Missing plugin / non-zero exit surfaces error cleanly
      const missingUser = {
        name: "missing-plugin-user",
        exec: {
          command: "nonexistent-auth-plugin-binary",
          args: [],
        },
      };
      execSpy.mockReturnValueOnce({
        status: 127,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("nonexistent-auth-plugin-binary: command not found"),
      });

      await expect(execAuth.applyAuthentication(missingUser as any, { headers: {} } as any)).rejects.toThrow(
        "nonexistent-auth-plugin-binary: command not found",
      );
    });
  });
});
