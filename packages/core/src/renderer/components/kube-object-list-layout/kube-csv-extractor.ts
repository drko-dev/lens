/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import type { KubeObject } from "@openlens/kube-object";
import type { TableCellProps } from "@openlens/list-layout";
import type { TableSortCallbacks } from "../table";

export interface ColumnExportMeta<K extends KubeObject = KubeObject> {
  id: string;
  header: string;
  extractValue: (item: K) => string | number | boolean | null | undefined;
}

/**
 * Columns strictly permitted for Secret objects.
 * Never allows exporting `data`, `stringData`, raw tokens, or encoded keys.
 */
const SECRET_ALLOWED_COLUMN_IDS = new Set([
  "name",
  "namespace",
  "labels",
  "keys",
  "type",
  "age",
  "creationtimestamp",
]);

/**
 * Extracts a safe text representation from React children or props if possible.
 */
function extractTextFromReactNode(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractTextFromReactNode).filter(Boolean).join(", ");
  }

  if (React.isValidElement(node)) {
    const props = node.props as Record<string, unknown> | undefined;
    if (props) {
      if (typeof props.title === "string") {
        return props.title;
      }
      if (typeof props.label === "string") {
        return props.label;
      }
      if (props.children) {
        return extractTextFromReactNode(props.children as React.ReactNode);
      }
    }
  }

  return "";
}

/**
 * Resolves safe column metadata and extractors for a table layout.
 */
export function resolveExportColumns<K extends KubeObject>(
  tableId: string | undefined,
  renderTableHeader: (TableCellProps | undefined | null)[] | undefined,
  columns: {
    id: string;
    priority?: number;
    header?: TableCellProps | null;
    content?: (item: K) => unknown;
    sortingCallBack?: (item: K) => unknown;
  }[] | undefined,
  isColumnHidden: ((tableId: string, colId: string, showWithColumn?: string) => boolean) | undefined,
  sortingCallbacks: TableSortCallbacks<K> = {},
  isSecret = false,
): ColumnExportMeta<K>[] {
  const result: ColumnExportMeta<K>[] = [];
  const seenIds = new Set<string>();

  // 1. Process column definitions from props.columns (SpecificKubeListLayoutColumn or General)
  if (columns && columns.length > 0) {
    for (const col of columns) {
      const id = col.id;
      if (!id || seenIds.has(id)) continue;

      if (tableId && isColumnHidden && isColumnHidden(tableId, id, col.header?.showWithColumn)) {
        continue;
      }

      // Check Secret allowlist
      if (isSecret && !SECRET_ALLOWED_COLUMN_IDS.has(id.toLowerCase())) {
        continue;
      }

      const headerTitle = String(
        col.header?.title
        || (typeof col.header?.children === "string" ? col.header.children : undefined)
        || id.charAt(0).toUpperCase() + id.slice(1)
      );

      result.push({
        id,
        header: headerTitle,
        extractValue: (item: K) => extractKubeObjectValue(item, id, col, sortingCallbacks, isSecret),
      });
      seenIds.add(id);
    }
  }

  // 2. Process renderTableHeader cells if not already processed
  if (renderTableHeader && renderTableHeader.length > 0) {
    for (let index = 0; index < renderTableHeader.length; index++) {
      const cellProps = renderTableHeader[index];
      if (!cellProps) continue;

      // Skip menu/checkbox columns
      if (cellProps.checkbox || cellProps.className?.includes("menu") || cellProps.className?.includes("warning")) {
        continue;
      }

      const id = cellProps.id || cellProps.sortBy || cellProps.className || `col_${index}`;
      if (seenIds.has(id)) continue;

      if (tableId && isColumnHidden && isColumnHidden(tableId, id, cellProps.showWithColumn)) {
        continue;
      }

      if (isSecret && !SECRET_ALLOWED_COLUMN_IDS.has(id.toLowerCase())) {
        continue;
      }

      const headerTitle = String(
        cellProps.title
        || (typeof cellProps.children === "string" ? cellProps.children : undefined)
        || id.charAt(0).toUpperCase() + id.slice(1)
      );

      result.push({
        id,
        header: headerTitle,
        extractValue: (item: K) => extractKubeObjectValue(item, id, undefined, sortingCallbacks, isSecret),
      });
      seenIds.add(id);
    }
  }

  return result;
}

/**
 * Extracts a specific column value from a KubeObject using semantic properties.
 */
function extractKubeObjectValue<K extends KubeObject>(
  item: K,
  columnId: string,
  columnDef: {
    content?: (item: K) => unknown;
    sortingCallBack?: (item: K) => unknown;
  } | undefined,
  sortingCallbacks: TableSortCallbacks<K>,
  isSecret = false,
): string | number | boolean | null | undefined {
  const normId = columnId.toLowerCase();

  // Strict Secret protection
  if (isSecret) {
    if (normId === "name") return item.getName();
    if (normId === "namespace") return item.getNs() || "";
    if (normId === "labels") return (item.getLabels?.() || []).join("; ");
    if (normId === "keys") {
      const anyItem = item as unknown as { getKeys?: () => string[] };
      return anyItem.getKeys?.()?.join("; ") ?? "";
    }
    if (normId === "type") {
      const anyItem = item as unknown as { type?: string };
      return anyItem.type ?? "";
    }
    if (normId === "age") return item.getAge?.() ?? "";
    if (normId === "creationtimestamp") return item.metadata?.creationTimestamp ?? "";

    // Any other column on a Secret is rejected
    return "[REDACTED]";
  }

  // General KubeObject extraction
  switch (normId) {
    case "name":
      return item.getName();

    case "namespace":
      return item.getNs() || "";

    case "age":
      return item.getAge?.() ?? "";

    case "status": {
      const anyItem = item as unknown as { getStatusMessage?: () => string; status?: { phase?: string } };
      if (typeof anyItem.getStatusMessage === "function") {
        return anyItem.getStatusMessage();
      }
      return anyItem.status?.phase ?? "";
    }

    case "labels":
      return (item.getLabels?.() || []).join("; ");

    case "node": {
      const anyItem = item as unknown as { getNodeName?: () => string; spec?: { nodeName?: string } };
      if (typeof anyItem.getNodeName === "function") {
        return anyItem.getNodeName();
      }
      return anyItem.spec?.nodeName ?? "";
    }

    case "restarts": {
      const anyItem = item as unknown as { getRestartsCount?: () => number };
      if (typeof anyItem.getRestartsCount === "function") {
        return anyItem.getRestartsCount();
      }
      return 0;
    }

    case "qos": {
      const anyItem = item as unknown as { getQosClass?: () => string; status?: { qosClass?: string } };
      if (typeof anyItem.getQosClass === "function") {
        return anyItem.getQosClass();
      }
      return anyItem.status?.qosClass ?? "";
    }

    case "ip": {
      const anyItem = item as unknown as { status?: { podIP?: string } };
      return anyItem.status?.podIP ?? "";
    }

    default:
      break;
  }

  // Check sorting callback as it often extracts raw values
  const sortCb = columnDef?.sortingCallBack || sortingCallbacks[columnId];
  if (typeof sortCb === "function") {
    try {
      const sortVal = sortCb(item);
      if (sortVal !== null && sortVal !== undefined) {
        if (Array.isArray(sortVal)) {
          return sortVal.join("");
        }
        if (typeof sortVal === "string" || typeof sortVal === "number" || typeof sortVal === "boolean") {
          return sortVal;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // Check column content
  if (columnDef?.content) {
    try {
      const content = columnDef.content(item);
      if (content !== null && content !== undefined) {
        if (typeof content === "string" || typeof content === "number" || typeof content === "boolean") {
          return content;
        }
        if (typeof content === "object" && "title" in (content as Record<string, unknown>)) {
          const title = (content as { title?: unknown }).title;
          if (typeof title === "string" || typeof title === "number") {
            return title;
          }
        }
        const text = extractTextFromReactNode(content as React.ReactNode);
        if (text) {
          return text;
        }
      }
    } catch {
      // Fallback
    }
  }

  return "";
}
