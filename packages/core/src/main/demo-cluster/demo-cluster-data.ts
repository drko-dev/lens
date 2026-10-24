/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export const DEMO_CLUSTER_ID = "openlens-demo-cluster-local";
export const DEMO_CONTEXT_NAME = "openlens-demo-cluster";
export const DEMO_CLUSTER_NAME = "OpenLens Demo Cluster";

export function getDemoVersionInfo() {
  return {
    major: "1",
    minor: "30",
    gitVersion: "v1.30.0-openlens-demo",
    gitCommit: "b5f0000000000000000000000000000000000000",
    gitTreeState: "clean",
    buildDate: "2026-01-01T00:00:00Z",
    goVersion: "go1.22.2",
    compiler: "gc",
    platform: "linux/arm64",
  };
}

export function getDemoApiVersions() {
  return {
    kind: "APIVersions",
    versions: ["v1"],
    serverAddressByClientCIDRs: [
      {
        clientCIDR: "0.0.0.0/0",
        serverAddress: "127.0.0.1",
      },
    ],
  };
}

export function getDemoApisGroupList() {
  return {
    kind: "APIGroupList",
    apiVersion: "v1",
    groups: [
      {
        name: "apps",
        versions: [{ groupVersion: "apps/v1", version: "v1" }],
        preferredVersion: { groupVersion: "apps/v1", version: "v1" },
      },
      {
        name: "batch",
        versions: [{ groupVersion: "batch/v1", version: "v1" }],
        preferredVersion: { groupVersion: "batch/v1", version: "v1" },
      },
      {
        name: "networking.k8s.io",
        versions: [{ groupVersion: "networking.k8s.io/v1", version: "v1" }],
        preferredVersion: { groupVersion: "networking.k8s.io/v1", version: "v1" },
      },
      {
        name: "gateway.networking.k8s.io",
        versions: [{ groupVersion: "gateway.networking.k8s.io/v1", version: "v1" }],
        preferredVersion: { groupVersion: "gateway.networking.k8s.io/v1", version: "v1" },
      },
      {
        name: "admissionregistration.k8s.io",
        versions: [{ groupVersion: "admissionregistration.k8s.io/v1", version: "v1" }],
        preferredVersion: { groupVersion: "admissionregistration.k8s.io/v1", version: "v1" },
      },
      {
        name: "resource.k8s.io",
        versions: [{ groupVersion: "resource.k8s.io/v1alpha2", version: "v1alpha2" }],
        preferredVersion: { groupVersion: "resource.k8s.io/v1alpha2", version: "v1alpha2" },
      },
      {
        name: "authorization.k8s.io",
        versions: [{ groupVersion: "authorization.k8s.io/v1", version: "v1" }],
        preferredVersion: { groupVersion: "authorization.k8s.io/v1", version: "v1" },
      },
      {
        name: "rbac.authorization.k8s.io",
        versions: [{ groupVersion: "rbac.authorization.k8s.io/v1", version: "v1" }],
        preferredVersion: { groupVersion: "rbac.authorization.k8s.io/v1", version: "v1" },
      },
    ],
  };
}

export function getDemoNamespaces() {
  return {
    kind: "NamespaceList",
    apiVersion: "v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: "default",
          uid: "demo-ns-default-uid",
          resourceVersion: "101",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: { "kubernetes.io/metadata.name": "default" },
        },
        status: { phase: "Active" },
      },
      {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: "kube-system",
          uid: "demo-ns-kube-system-uid",
          resourceVersion: "102",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: { "kubernetes.io/metadata.name": "kube-system" },
        },
        status: { phase: "Active" },
      },
      {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: "demo-apps",
          uid: "demo-ns-demo-apps-uid",
          resourceVersion: "103",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: {
            "kubernetes.io/metadata.name": "demo-apps",
            "openlens.devops/environment": "demo",
          },
        },
        status: { phase: "Active" },
      },
    ],
  };
}

export function getDemoNodes() {
  return {
    kind: "NodeList",
    apiVersion: "v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "v1",
        kind: "Node",
        metadata: {
          name: "demo-control-plane",
          uid: "demo-node-cp-uid",
          resourceVersion: "110",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: {
            "kubernetes.io/hostname": "demo-control-plane",
            "kubernetes.io/os": "linux",
            "kubernetes.io/arch": "arm64",
            "node-role.kubernetes.io/control-plane": "",
          },
        },
        status: {
          capacity: { cpu: "8", memory: "32Gi", pods: "110" },
          allocatable: { cpu: "7800m", memory: "30Gi", pods: "110" },
          conditions: [
            { type: "Ready", status: "True", reason: "KubeletReady", message: "kubelet is posting ready status" },
          ],
          nodeInfo: {
            kubeletVersion: "v1.30.0",
            osImage: "OpenLens Demo Linux",
            operatingSystem: "linux",
            architecture: "arm64",
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Node",
        metadata: {
          name: "demo-worker-1",
          uid: "demo-node-worker-uid",
          resourceVersion: "111",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: {
            "kubernetes.io/hostname": "demo-worker-1",
            "kubernetes.io/os": "linux",
            "kubernetes.io/arch": "arm64",
            "node-role.kubernetes.io/worker": "",
            "gpu.nvidia.com/model": "A100",
          },
        },
        status: {
          capacity: { cpu: "16", memory: "64Gi", pods: "110" },
          allocatable: { cpu: "15800m", memory: "62Gi", pods: "110" },
          conditions: [
            { type: "Ready", status: "True", reason: "KubeletReady", message: "kubelet is posting ready status" },
          ],
          nodeInfo: {
            kubeletVersion: "v1.30.0",
            osImage: "OpenLens Demo Linux",
            operatingSystem: "linux",
            architecture: "arm64",
          },
        },
      },
    ],
  };
}

export function getDemoPods() {
  return {
    kind: "PodList",
    apiVersion: "v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "demo-web-7bc6f86c8d-k92lx",
          namespace: "demo-apps",
          uid: "demo-pod-web-uid",
          resourceVersion: "120",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: {
            "app.kubernetes.io/name": "demo-store",
            "app.kubernetes.io/instance": "store-prod",
            "app.kubernetes.io/version": "1.4.2",
            "app.kubernetes.io/component": "frontend",
            "app.kubernetes.io/part-of": "demo-store",
            "app.kubernetes.io/managed-by": "helm",
          },
        },
        spec: {
          nodeName: "demo-worker-1",
          containers: [
            {
              name: "web-ui",
              image: "nginx:1.25.4-alpine",
              ports: [{ containerPort: 80, protocol: "TCP" }],
            },
          ],
        },
        status: {
          phase: "Running",
          hostIP: "10.244.0.5",
          podIP: "10.244.1.20",
          containerStatuses: [
            {
              name: "web-ui",
              ready: true,
              restartCount: 0,
              image: "nginx:1.25.4-alpine",
              state: { running: { startedAt: "2026-01-01T00:00:00Z" }},
            },
          ],
        },
      },
      {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "demo-api-5c49488d55-p42xz",
          namespace: "demo-apps",
          uid: "demo-pod-api-uid",
          resourceVersion: "121",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: {
            "app.kubernetes.io/name": "demo-store",
            "app.kubernetes.io/instance": "store-prod",
            "app.kubernetes.io/version": "1.4.2",
            "app.kubernetes.io/component": "backend",
            "app.kubernetes.io/part-of": "demo-store",
            "app.kubernetes.io/managed-by": "helm",
          },
        },
        spec: {
          nodeName: "demo-worker-1",
          containers: [
            {
              name: "api-server",
              image: "quay.io/openlens/demo-api:v1.4.2",
              ports: [{ containerPort: 8080, protocol: "TCP" }],
            },
          ],
        },
        status: {
          phase: "Running",
          hostIP: "10.244.0.5",
          podIP: "10.244.1.21",
          containerStatuses: [
            {
              name: "api-server",
              ready: true,
              restartCount: 0,
              image: "quay.io/openlens/demo-api:v1.4.2",
              state: { running: { startedAt: "2026-01-01T00:00:00Z" }},
            },
          ],
        },
      },
    ],
  };
}

export function getDemoDeployments() {
  return {
    kind: "DeploymentList",
    apiVersion: "apps/v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "demo-web",
          namespace: "demo-apps",
          uid: "demo-deploy-web-uid",
          resourceVersion: "130",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: {
            "app.kubernetes.io/name": "demo-store",
            "app.kubernetes.io/instance": "store-prod",
            "app.kubernetes.io/version": "1.4.2",
            "app.kubernetes.io/component": "frontend",
            "app.kubernetes.io/part-of": "demo-store",
            "app.kubernetes.io/managed-by": "helm",
          },
        },
        spec: {
          replicas: 1,
          template: {
            spec: {
              containers: [{ name: "web-ui", image: "nginx:1.25.4-alpine" }],
            },
          },
        },
        status: {
          replicas: 1,
          readyReplicas: 1,
          availableReplicas: 1,
        },
      },
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "demo-api",
          namespace: "demo-apps",
          uid: "demo-deploy-api-uid",
          resourceVersion: "131",
          creationTimestamp: "2026-01-01T00:00:00Z",
          labels: {
            "app.kubernetes.io/name": "demo-store",
            "app.kubernetes.io/instance": "store-prod",
            "app.kubernetes.io/version": "1.4.2",
            "app.kubernetes.io/component": "backend",
            "app.kubernetes.io/part-of": "demo-store",
            "app.kubernetes.io/managed-by": "helm",
          },
        },
        spec: {
          replicas: 1,
          template: {
            spec: {
              containers: [{ name: "api-server", image: "quay.io/openlens/demo-api:v1.4.2" }],
            },
          },
        },
        status: {
          replicas: 1,
          readyReplicas: 1,
          availableReplicas: 1,
        },
      },
    ],
  };
}

export function getDemoServices() {
  return {
    kind: "ServiceList",
    apiVersion: "v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "demo-web-service",
          namespace: "demo-apps",
          uid: "demo-svc-web-uid",
          resourceVersion: "140",
          labels: { "app.kubernetes.io/name": "demo-store" },
        },
        spec: {
          type: "ClusterIP",
          clusterIP: "10.96.100.10",
          ports: [{ name: "http", port: 80, targetPort: 80 }],
        },
        status: {},
      },
    ],
  };
}

export function getDemoGateways() {
  return {
    kind: "GatewayList",
    apiVersion: "gateway.networking.k8s.io/v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: {
          name: "demo-edge-gateway",
          namespace: "demo-apps",
          uid: "demo-gw-uid",
          resourceVersion: "150",
          labels: { "app.kubernetes.io/part-of": "demo-store" },
        },
        spec: {
          gatewayClassName: "openlens-demo-class",
          listeners: [
            { name: "http", port: 80, protocol: "HTTP" },
            { name: "https", port: 443, protocol: "HTTPS" },
          ],
        },
        status: {
          addresses: [{ type: "IPAddress", value: "192.168.1.100" }],
          conditions: [
            { type: "Programmed", status: "True", reason: "Programmed", message: "Gateway configured" },
          ],
        },
      },
    ],
  };
}

export function getDemoGatewayClasses() {
  return {
    kind: "GatewayClassList",
    apiVersion: "gateway.networking.k8s.io/v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "GatewayClass",
        metadata: {
          name: "openlens-demo-class",
          uid: "demo-gc-uid",
          resourceVersion: "151",
        },
        spec: {
          controllerName: "openlens.devops/demo-gateway-controller",
        },
        status: {
          conditions: [
            { type: "Accepted", status: "True", reason: "Accepted", message: "GatewayClass is accepted" },
          ],
        },
      },
    ],
  };
}

export function getDemoAdmissionPolicies() {
  return {
    kind: "ValidatingAdmissionPolicyList",
    apiVersion: "admissionregistration.k8s.io/v1",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "admissionregistration.k8s.io/v1",
        kind: "ValidatingAdmissionPolicy",
        metadata: {
          name: "demo-disallow-root-containers",
          uid: "demo-vap-uid",
          resourceVersion: "160",
        },
        spec: {
          failurePolicy: "Fail",
          matchConstraints: {
            resourceRules: [
              {
                apiGroups: [""],
                apiVersions: ["v1"],
                operations: ["CREATE", "UPDATE"],
                resources: ["pods"],
              },
            ],
          },
          validations: [
            {
              expression: "!object.spec.containers.exists(c, c.securityContext.runAsNonRoot == false)",
              message: "Running containers as root is disallowed by CEL security policy",
            },
          ],
        },
      },
    ],
  };
}

export function getDemoDeviceClasses() {
  return {
    kind: "DeviceClassList",
    apiVersion: "resource.k8s.io/v1alpha2",
    metadata: { resourceVersion: "100" },
    items: [
      {
        apiVersion: "resource.k8s.io/v1alpha2",
        kind: "DeviceClass",
        metadata: {
          name: "demo-nvidia-gpu",
          uid: "demo-dc-uid",
          resourceVersion: "170",
        },
        spec: {
          selectors: [
            {
              cel: {
                expression: "device.driver == 'nvidia.com/gpu'",
              },
            },
          ],
        },
      },
    ],
  };
}
