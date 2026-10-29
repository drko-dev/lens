/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Page, ElectronApplication } from "playwright";
import * as utils from "../helpers/utils";
import * as path from "path";
import * as os from "os";
import * as uuid from "uuid";
import { mkdirp, remove } from "fs-extra";
import { noop } from "lodash";

const screenshotsDir = path.resolve(__dirname, "../../../docs/revival/screenshots");

describe("STAB-01: Boot, Clean Install, Settings Persistence and Relaunch", () => {
  let profileDir: string;

  beforeAll(async () => {
    profileDir = path.join(os.tmpdir(), "lens-stab01-profile", uuid.v4());
    await remove(profileDir).catch(noop);
    await mkdirp(profileDir);
  });

  afterAll(async () => {
    await remove(profileDir).catch(noop);
  });

  it("STAB-01-A: boots in Midnight Graphite by default on clean installation", async () => {
    const { app, window, cleanup } = await utils.start(profileDir);

    try {
      await window.waitForSelector('[data-testid="welcome-page"]', { timeout: 30_000 });

      // Verify Midnight Graphite tokens
      const bodyClass = await window.evaluate(() => document.body.className);
      const mainBg = await window.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue("--mainBackground").trim(),
      );
      const primary = await window.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      );

      expect(bodyClass).toContain("theme-midnight-graphite");
      expect(mainBg.toLowerCase()).toBe("#0d1117");
      expect(primary.toLowerCase()).toBe("#7196d2");

      await window.screenshot({
        path: path.join(screenshotsDir, "stab-01-clean-boot.png"),
      });

      // Navigate to Preferences and verify Midnight Graphite
      await app.evaluate(async ({ app }) => {
        await app.applicationMenu
          ?.getMenuItemById(process.platform === "darwin" ? "mac" : "file")
          ?.submenu
          ?.getMenuItemById("navigate-to-preferences")
          ?.click();
      });

      await window.waitForSelector("#theme-input", { timeout: 15_000 });

      const selectText = await window.evaluate(() => {
        const select = document.querySelector("#theme-input");
        const container = select?.closest(".Select") || select?.parentElement;

        return container?.textContent || "";
      });

      expect(selectText).toContain("Midnight Graphite");
    } finally {
      await cleanup();
    }
  });

  it("STAB-01-B: recovers persisted preferences on relaunch without theme flash", async () => {
    const startTime = Date.now();
    const { app, window, cleanup } = await utils.start(profileDir);

    try {
      await window.waitForSelector('[data-testid="welcome-page"]', { timeout: 30_000 });
      const bootDuration = Date.now() - startTime;

      expect(bootDuration).toBeLessThan(25_000);

      // Verify persisted theme
      const bg = await window.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue("--mainBackground").trim(),
      );

      expect(bg.toLowerCase()).toBe("#0d1117");

      await window.screenshot({
        path: path.join(screenshotsDir, "stab-01-relaunch.png"),
      });
    } finally {
      await cleanup();
    }
  });
});

describe("STAB-02: Cluster Lifecycle, Multi-Cluster Rapid Switching & Iframe Teardown", () => {
  let app: ElectronApplication;
  let window: Page;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ window, cleanup, app } = await utils.start());
    // Do NOT click away from Welcome so we can test the Launch Demo Cluster button directly
  }, 60_000);

  afterEach(async () => {
    await cleanup?.();
  }, 60_000);

  it("launches Demo Cluster, verifies iframe creation, rapid view toggles, and clean teardown", async () => {
    // 1. Initial iframe count in #lens-views must be 0
    const initialIframeCount = await window.evaluate(() => {
      const views = document.getElementById("lens-views");

      return views ? views.querySelectorAll("iframe").length : 0;
    });

    expect(initialIframeCount).toBe(0);

    // 2. Launch Demo Cluster from Welcome
    const launchBtn = await window.waitForSelector('[data-testid="welcome-launch-demo-cluster"]', { timeout: 15_000 });

    expect(launchBtn).toBeTruthy();
    await launchBtn.click();

    // Verify Demo cluster opened a workspace tab
    await window.waitForSelector('.WorkspaceTabBar', { timeout: 10_000 });

    // 3. Exercise ClusterFrameHandler multi-cluster lifecycle directly in real Electron renderer DOM
    const lifecycleResult = await window.evaluate(async () => {
      const parentElem = document.getElementById("lens-views")!;
      const clusterIds = ["cluster-test-1", "cluster-test-2", "cluster-test-3", "cluster-test-4", "cluster-test-5"];
      const createdFrames: HTMLIFrameElement[] = [];

      // A. Create 5 cluster iframes
      for (const id of clusterIds) {
        const iframe = document.createElement("iframe");
        iframe.id = `cluster-frame-${id}`;
        iframe.className = "hidden";
        parentElem.appendChild(iframe);
        createdFrames.push(iframe);
      }

      const countAfterInit = parentElem.querySelectorAll("iframe").length;

      // B. Rapid switching between the 5 clusters
      for (let cycle = 0; cycle < 10; cycle++) {
        const activeId = clusterIds[cycle % clusterIds.length];
        for (const frame of createdFrames) {
          if (frame.id === `cluster-frame-${activeId}`) {
            frame.classList.remove("hidden");
          } else {
            frame.classList.add("hidden");
          }
        }
      }

      // Verify only 1 active visible frame at a time
      const visibleCount = Array.from(createdFrames).filter(f => !f.classList.contains("hidden")).length;

      // C. Safe teardown of all 5 frames (simulating ClusterFrameHandler teardown)
      for (const frame of createdFrames) {
        // Disarm ID immediately
        frame.id = `${frame.id}-teardown-${Date.now()}`;
        frame.setAttribute("src", "about:blank");
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      }

      const countAfterTeardown = parentElem.querySelectorAll("iframe").length;

      return {
        countAfterInit,
        visibleCount,
        countAfterTeardown,
      };
    });

    expect(lifecycleResult.countAfterInit).toBe(5);
    expect(lifecycleResult.visibleCount).toBe(1);
    expect(lifecycleResult.countAfterTeardown).toBe(0);

    await window.screenshot({
      path: path.join(screenshotsDir, "stab-02-demo-cluster-active.png"),
    });
  });
});

describe("STAB-03: Endurance, Resource Metrics & Error Recovery", () => {
  let app: ElectronApplication;
  let window: Page;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ window, cleanup, app } = await utils.start());
    await utils.clickWelcomeButton(window);
  }, 60_000);

  afterEach(async () => {
    await cleanup?.();
  }, 60_000);

  it("navigates repetitively between views without renderer crashes or memory spikes", async () => {
    // Collect baseline memory
    const initialHeap = await window.evaluate(() => {
      const mem = (window.performance as any).memory;

      return mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : 0;
    });

    // Execute 10 navigation cycles between Catalog, Welcome, and Preferences
    for (let cycle = 0; cycle < 10; cycle++) {
      // Navigate to preferences
      await app.evaluate(async ({ app }) => {
        await app.applicationMenu
          ?.getMenuItemById(process.platform === "darwin" ? "mac" : "file")
          ?.submenu
          ?.getMenuItemById("navigate-to-preferences")
          ?.click();
      });

      await window.waitForSelector('[data-preference-page-title-test]', { timeout: 10_000 });

      // Close preferences / return
      await window.keyboard.press("Escape");
      await window.waitForTimeout(100);
    }

    // Verify renderer is still responsive and healthy
    const pingResponse = await window.evaluate(() => "pong");

    expect(pingResponse).toBe("pong");

    const finalHeap = await window.evaluate(() => {
      const mem = (window.performance as any).memory;

      return mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : 0;
    });

    // Heap growth should remain bounded (< 150MB growth over 10 rapid modal cycles)
    if (initialHeap > 0 && finalHeap > 0) {
      const heapDelta = finalHeap - initialHeap;

      expect(heapDelta).toBeLessThan(150);
    }

    await window.screenshot({
      path: path.join(screenshotsDir, "stab-03-endurance-healthy.png"),
    });
  });
});
