/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  PanelCatalogItem,
  PanelKind,
  SplitLayoutBranch,
  SplitLayoutGroup,
  SplitLayoutLeaf,
  SplitLayoutNode,
  WorkspaceTemplate,
  WorkspaceTemplateId,
} from "./split-panel-types";

/**
 * Registry of all components that can be placed in a dynamic split panel layout.
 */
export const PANEL_CATALOG: readonly PanelCatalogItem[] = [
  {
    kind: "kubetail",
    name: "Kubetail Multi-Pod Logs",
    description: "Multi-pod live log streaming with auto-scroll, regex filtering, and timestamp correlation.",
    icon: "subject",
    category: "observability",
    available: true,
    defaultTitle: "Kubetail Multi-Pod Logs",
  },
  {
    kind: "resource-details",
    name: "Resource Details",
    description: "Live inspector showing metadata, status, spec, and child pods of the selected resource.",
    icon: "view_quilt",
    category: "details",
    available: true,
    defaultTitle: "Resource Details",
  },
  {
    kind: "pods",
    name: "Workloads / Pods",
    description: "Interactive Pods table with phase badges, restarts, container counts, and quick actions.",
    icon: "view_list",
    category: "workloads",
    available: true,
    defaultTitle: "Pods Overview",
  },
  {
    kind: "deployments",
    name: "Workloads / Deployments",
    description: "Deployments overview displaying replica sets, ready status, conditions, and rollout progress.",
    icon: "layers",
    category: "workloads",
    available: true,
    defaultTitle: "Deployments",
  },
  {
    kind: "statefulsets",
    name: "Workloads / StatefulSets",
    description: "StatefulSets list with ready pods, replicas and age.",
    icon: "view_list",
    category: "workloads",
    available: true,
    defaultTitle: "StatefulSets",
    policyOnly: true,
  },
  {
    kind: "daemonsets",
    name: "Workloads / DaemonSets",
    description: "DaemonSets list with desired, ready and node selector details.",
    icon: "view_list",
    category: "workloads",
    available: true,
    defaultTitle: "DaemonSets",
    policyOnly: true,
  },
  {
    kind: "replicasets",
    name: "Workloads / ReplicaSets",
    description: "ReplicaSets list with desired, current and ready replicas.",
    icon: "view_list",
    category: "workloads",
    available: true,
    defaultTitle: "ReplicaSets",
    policyOnly: true,
  },
  {
    kind: "jobs",
    name: "Workloads / Jobs",
    description: "Jobs list with completions, conditions and age.",
    icon: "view_list",
    category: "workloads",
    available: true,
    defaultTitle: "Jobs",
    policyOnly: true,
  },
  {
    kind: "cronjobs",
    name: "Workloads / CronJobs",
    description: "CronJobs list with schedule, suspend state and last run.",
    icon: "view_list",
    category: "workloads",
    available: true,
    defaultTitle: "CronJobs",
    policyOnly: true,
  },
  {
    kind: "events",
    name: "Cluster Events",
    description: "Cluster warning and normal event stream for rapid root-cause diagnosis.",
    icon: "notifications",
    category: "observability",
    available: true,
    defaultTitle: "Cluster Events",
  },
  {
    kind: "terminal",
    name: "Cluster Terminal",
    description: "Terminal integrada acoplable. En desarrollo para H3 (requiere arquitectura PTY multiventana desacoplada del Dock).",
    icon: "terminal",
    category: "tools",
    available: false,
    unavailableReason: "Próximamente en H3 (requiere PTY multiventana)",
    defaultTitle: "Terminal Console",
  },
  {
    kind: "resource-editor",
    name: "Live Resource YAML Editor",
    description: "In-line Monaco YAML editor with schema validation and dry-run apply capabilities.",
    icon: "edit_note",
    category: "details",
    available: false,
    unavailableReason: "Diferido para H3 / edición interactiva en preparación",
    defaultTitle: "Resource YAML",
  },
];

export function getCatalogItem(kind: PanelKind): PanelCatalogItem | undefined {
  return PANEL_CATALOG.find(item => item.kind === kind);
}

export function createLeafNode(kind: PanelKind, title?: string): SplitLayoutLeaf {
  const item = getCatalogItem(kind);
  const id = `leaf-${kind}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  return {
    type: "leaf",
    id,
    panelKind: kind,
    title: title || item?.defaultTitle || kind,
  };
}

export function createGroupNode(
  panels: SplitLayoutLeaf[],
  activePanelId?: string,
): SplitLayoutGroup {
  const id = `group-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const active = activePanelId || (panels[0] ? panels[0].id : "");

  return {
    type: "group",
    id,
    panels,
    activePanelId: active,
  };
}

export function createBranchNode(
  orientation: "horizontal" | "vertical",
  ratio: number,
  first: SplitLayoutNode,
  second: SplitLayoutNode,
): SplitLayoutBranch {
  const id = `branch-${orientation}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  return {
    type: "branch",
    id,
    orientation,
    ratio: Math.max(0.15, Math.min(0.85, ratio)),
    first,
    second,
  };
}

/**
 * Built-in workspace composition templates.
 */
export const WORKSPACE_TEMPLATES: Record<WorkspaceTemplateId, WorkspaceTemplate> = {
  "h1-default": {
    id: "h1-default",
    name: "H1 Clásico (Kubetail + Details)",
    description: "Distribución tradicional 58/42 de H1: Kubetail a la izquierda y Detalles a la derecha.",
    icon: "splitscreen",
    layout: createBranchNode(
      "horizontal",
      0.58,
      createLeafNode("kubetail", "Kubetail Multi-Pod Logs"),
      createLeafNode("resource-details", "Resource Details"),
    ),
  },

  "operation": {
    id: "operation",
    name: "Operación (Pods + Deployments + Kubetail)",
    description: "Monitoreo operativo: Pods a la izquierda, Deployments y streaming de Kubetail apilados a la derecha.",
    icon: "dashboard",
    layout: createBranchNode(
      "horizontal",
      0.45,
      createLeafNode("pods", "Pods"),
      createBranchNode(
        "vertical",
        0.45,
        createLeafNode("deployments", "Deployments"),
        createLeafNode("kubetail", "Kubetail Logs"),
      ),
    ),
  },

  "incidents": {
    id: "incidents",
    name: "Incidentes (Kubetail + Eventos + Detalles)",
    description: "Investigación de fallos: Logs a la izquierda, Eventos del clúster y Detalles técnicos a la derecha.",
    icon: "warning",
    layout: createBranchNode(
      "horizontal",
      0.55,
      createLeafNode("kubetail", "Kubetail Logs"),
      createBranchNode(
        "vertical",
        0.45,
        createLeafNode("events", "Eventos del Clúster"),
        createLeafNode("resource-details", "Resource Details"),
      ),
    ),
  },

  "development": {
    id: "development",
    name: "Desarrollo (Pods + Deployments + Detalles)",
    description: "Ciclo de desarrollo: Pods a la izquierda, Deployments y Detalles a la derecha.",
    icon: "code",
    layout: createBranchNode(
      "horizontal",
      0.45,
      createLeafNode("pods", "Pods"),
      createBranchNode(
        "vertical",
        0.50,
        createLeafNode("deployments", "Deployments"),
        createLeafNode("resource-details", "Resource Details"),
      ),
    ),
  },

  "custom": {
    id: "custom",
    name: "Personalizado",
    description: "Composición definida y guardada por el usuario.",
    icon: "tune",
    layout: createBranchNode(
      "horizontal",
      0.58,
      createLeafNode("kubetail", "Kubetail Multi-Pod Logs"),
      createLeafNode("resource-details", "Resource Details"),
    ),
  },
};
