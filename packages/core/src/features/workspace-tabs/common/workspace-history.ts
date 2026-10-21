/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, makeObservable, observable } from "mobx";
import type {
  NavigationHistoryEntry,
  WorkspaceId,
  WorkspaceNavigationHistory,
} from "../../../common/workspace/workspace-types";
import {
  MAX_HISTORY_ENTRIES,
  sanitizeSafePath,
} from "../../../common/workspace/session-snapshot";

export interface RecordNavigationParams {
  workspaceId: WorkspaceId;
  tabId: string;
  clusterId: string;
  path?: string;
}

export class WorkspaceHistoryManager {
  private readonly histories = observable.map<WorkspaceId, NavigationHistoryEntry[]>();
  private readonly indices = observable.map<WorkspaceId, number>();

  constructor() {
    makeObservable(this);
  }

  private getEntries(workspaceId: WorkspaceId): NavigationHistoryEntry[] {
    let entries = this.histories.get(workspaceId);

    if (!entries) {
      this.histories.set(workspaceId, []);
      entries = this.histories.get(workspaceId);
    }

    return entries || [];
  }

  public getCurrentIndex(workspaceId: WorkspaceId): number {
    return this.indices.get(workspaceId) ?? -1;
  }

  public getHistory(workspaceId: WorkspaceId): readonly NavigationHistoryEntry[] {
    return this.getEntries(workspaceId);
  }

  public canGoBack(workspaceId: WorkspaceId): boolean {
    const idx = this.getCurrentIndex(workspaceId);

    return idx > 0;
  }

  public canGoForward(workspaceId: WorkspaceId): boolean {
    const idx = this.getCurrentIndex(workspaceId);
    const entries = this.getEntries(workspaceId);

    return idx >= 0 && idx < entries.length - 1;
  }

  public getCurrentEntry(workspaceId: WorkspaceId): NavigationHistoryEntry | undefined {
    const idx = this.getCurrentIndex(workspaceId);
    const entries = this.getEntries(workspaceId);

    if (idx >= 0 && idx < entries.length) {
      return entries[idx];
    }

    return undefined;
  }

  @action
  public recordNavigation({
    workspaceId,
    tabId,
    clusterId,
    path,
  }: RecordNavigationParams): void {
    if (!workspaceId || !tabId || !clusterId) return;

    const safePath = sanitizeSafePath(path);
    const entries = this.getEntries(workspaceId);
    const currentIndex = this.getCurrentIndex(workspaceId);

    // Loop prevention: if identical to current entry, do not push duplicate
    if (currentIndex >= 0 && currentIndex < entries.length) {
      const current = entries[currentIndex];

      if (current.tabId === tabId && current.clusterId === clusterId && current.path === safePath) {
        return;
      }
    }

    // Truncate forward history if navigating after a back operation
    if (currentIndex >= 0 && currentIndex < entries.length - 1) {
      entries.splice(currentIndex + 1);
    }

    const newEntry: NavigationHistoryEntry = Object.freeze({
      tabId: tabId.slice(0, 100),
      workspaceId: workspaceId.slice(0, 100),
      clusterId: clusterId.slice(0, 100),
      path: safePath,
      timestamp: Date.now(),
    });

    entries.push(newEntry);

    // Bounded history: clamp to MAX_HISTORY_ENTRIES
    if (entries.length > MAX_HISTORY_ENTRIES) {
      entries.splice(0, entries.length - MAX_HISTORY_ENTRIES);
    }

    this.indices.set(workspaceId, entries.length - 1);
  }

  @action
  public goBack(workspaceId: WorkspaceId): NavigationHistoryEntry | undefined {
    if (!this.canGoBack(workspaceId)) return undefined;

    const currentIdx = this.getCurrentIndex(workspaceId);
    const nextIdx = currentIdx - 1;

    this.indices.set(workspaceId, nextIdx);

    return this.getEntries(workspaceId)[nextIdx];
  }

  @action
  public goForward(workspaceId: WorkspaceId): NavigationHistoryEntry | undefined {
    if (!this.canGoForward(workspaceId)) return undefined;

    const currentIdx = this.getCurrentIndex(workspaceId);
    const nextIdx = currentIdx + 1;

    this.indices.set(workspaceId, nextIdx);

    return this.getEntries(workspaceId)[nextIdx];
  }

  @action
  public purgeCluster(clusterId: string): void {
    for (const [wsId, entries] of this.histories.entries()) {
      const filtered = entries.filter((entry) => entry.clusterId !== clusterId);

      this.histories.set(wsId, filtered);

      if (filtered.length === 0) {
        this.indices.set(wsId, -1);
      } else {
        const currentIdx = this.getCurrentIndex(wsId);
        const clampedIdx = Math.max(0, Math.min(currentIdx, filtered.length - 1));

        this.indices.set(wsId, clampedIdx);
      }
    }
  }

  @action
  public purgeTab(tabId: string): void {
    for (const [wsId, entries] of this.histories.entries()) {
      const filtered = entries.filter((entry) => entry.tabId !== tabId);

      this.histories.set(wsId, filtered);

      if (filtered.length === 0) {
        this.indices.set(wsId, -1);
      } else {
        const currentIdx = this.getCurrentIndex(wsId);
        const clampedIdx = Math.max(0, Math.min(currentIdx, filtered.length - 1));

        this.indices.set(wsId, clampedIdx);
      }
    }
  }

  @action
  public clearWorkspace(workspaceId: WorkspaceId): void {
    this.histories.delete(workspaceId);
    this.indices.delete(workspaceId);
  }

  public toSnapshot(workspaceId: WorkspaceId): WorkspaceNavigationHistory {
    const entries = this.getEntries(workspaceId);
    const currentIndex = this.getCurrentIndex(workspaceId);

    return {
      workspaceId,
      entries: entries.slice(0, MAX_HISTORY_ENTRIES),
      currentIndex: Math.max(-1, Math.min(currentIndex, entries.length - 1)),
    };
  }

  @action
  public restoreSnapshot(snapshot?: WorkspaceNavigationHistory): void {
    if (!snapshot || !snapshot.workspaceId || !Array.isArray(snapshot.entries)) {
      return;
    }

    const wsId = snapshot.workspaceId;
    const sanitizedEntries: NavigationHistoryEntry[] = [];

    for (const raw of snapshot.entries) {
      if (!raw || typeof raw !== "object") continue;
      if (sanitizedEntries.length >= MAX_HISTORY_ENTRIES) break;

      if (typeof raw.tabId === "string" && typeof raw.clusterId === "string") {
        sanitizedEntries.push(Object.freeze({
          tabId: raw.tabId.slice(0, 100),
          workspaceId: wsId,
          clusterId: raw.clusterId.slice(0, 100),
          path: sanitizeSafePath(raw.path),
          timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
        }));
      }
    }

    this.histories.set(wsId, sanitizedEntries);

    if (sanitizedEntries.length === 0) {
      this.indices.set(wsId, -1);
    } else {
      const idx = typeof snapshot.currentIndex === "number" ? snapshot.currentIndex : sanitizedEntries.length - 1;

      this.indices.set(wsId, Math.max(0, Math.min(idx, sanitizedEntries.length - 1)));
    }
  }
}
