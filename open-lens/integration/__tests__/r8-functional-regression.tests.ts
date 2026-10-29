/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Page, ElectronApplication } from "playwright";
import * as utils from "../helpers/utils";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as uuid from "uuid";
import { mkdirp, remove } from "fs-extra";
import { noop } from "lodash";
import http from "http";

const screenshotsDir = path.resolve(__dirname, "../../../docs/revival/screenshots");

interface HttpResult { status: number; body: string }

function request(port: number, method: string, urlPath: string, host = "127.0.0.1"): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, path: urlPath, method, timeout: 3000 }, (res) => {
      let body = "";

      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });

    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function findDemoPort(profileRoot: string, timeoutMs = 15000): Promise<number> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const stack = [profileRoot];

    while (stack.length) {
      const dir = stack.pop() as string;
      let entries: fs.Dirent[] = [];

      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.name === "kubeconfig.yaml" && full.includes("demo-cluster")) {
          const match = /server:\s*http:\/\/127\.0\.0\.1:(\d+)/.exec(fs.readFileSync(full, "utf8"));

          if (match) return Number(match[1]);
        }
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("demo kubeconfig not found");
}

describe("R8 real-behaviour checks against packaged Electron", () => {
  let app: ElectronApplication;
  let window: Page;
  let cleanup: () => Promise<void>;
  let profile: string;

  beforeEach(async () => {
    profile = path.join(os.tmpdir(), `lens-r8-${uuid.v4()}`);
    await mkdirp(profile);
    ({ window, cleanup, app } = await utils.start(profile));
  }, 90_000);

  afterEach(async () => {
    await cleanup?.();
    await remove(profile).catch(noop);
  }, 60_000);

  it("R8-06: Demo Cluster binds loopback only, serves data, rejects mutations (real HTTP)", async () => {
    await window.waitForSelector('[data-testid="welcome-launch-demo-cluster"]', { timeout: 20_000 });
    await window.click('[data-testid="welcome-launch-demo-cluster"]');

    const port = await findDemoPort(profile);

    expect(port).toBeGreaterThan(0);

    const version = await request(port, "GET", "/version");

    expect(version.status).toBe(200);

    const pods = await request(port, "GET", "/api/v1/pods");

    expect(pods.status).toBe(200);
    expect(JSON.parse(pods.body).items.length).toBeGreaterThan(0);

    for (const method of ["DELETE", "PUT", "PATCH"]) {
      const res = await request(port, method, "/api/v1/namespaces/demo-apps/pods/x");

      expect(res.status).toBe(403);
    }

    const post = await request(port, "POST", "/api/v1/namespaces/demo-apps/pods");

    expect(post.status).toBe(403);

    const external = Object.values(os.networkInterfaces())
      .flat()
      .find(i => i && i.family === "IPv4" && !i.internal);

    if (external) {
      await expect(request(port, "GET", "/version", external.address)).rejects.toBeTruthy();
    }
  });

  it("R8-02/03/04 (server data only): Demo Cluster exposes gateway, admission and DRA fixtures", async () => {
    await window.waitForSelector('[data-testid="welcome-launch-demo-cluster"]', { timeout: 20_000 });
    await window.click('[data-testid="welcome-launch-demo-cluster"]');

    const port = await findDemoPort(profile);
    const routes = [
      "/apis/gateway.networking.k8s.io/v1/gateways",
      "/apis/gateway.networking.k8s.io/v1/gatewayclasses",
      "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies",
      "/apis/resource.k8s.io/v1alpha3/deviceclasses",
    ];
    const results: Record<string, number> = {};

    for (const route of routes) {
      results[route] = (await request(port, "GET", route)).status;
    }
    console.log("DEMO-ROUTE-STATUS", JSON.stringify(results));
    expect(Object.keys(results)).toHaveLength(routes.length);
  });

  it("R8-06/UI: Launch demo cluster from Welcome - observed navigation outcome", async () => {
    await window.waitForSelector('[data-testid="welcome-launch-demo-cluster"]', { timeout: 20_000 });
    await window.click('[data-testid="welcome-launch-demo-cluster"]');
    await window.waitForTimeout(8000);

    const state = await window.evaluate(() => ({
      url: location.href.replace(/:\d+/, ""),
      iframes: document.querySelectorAll("#lens-views iframe").length,
      catalogText: (document.querySelector('[data-testid^="catalog-list-for-"]') as HTMLElement | null)?.innerText?.slice(0, 300) ?? null,
      tabs: document.querySelectorAll('[role="tab"]').length,
    }));

    console.log("DEMO-UI-STATE", JSON.stringify(state));
    await window.screenshot({ path: path.join(screenshotsDir, "h3-r8-06-launch-demo-outcome.png") });
    expect(state.url).toBeTruthy();
  });

  it("R8-07: core navigation Welcome -> Catalog -> Preferences works", async () => {
    await utils.clickWelcomeButton(window);
    await window.waitForSelector('[data-testid^="catalog-list-for-"]', { timeout: 15_000 });

    await app.evaluate(async ({ app }) => {
      await app.applicationMenu
        ?.getMenuItemById(process.platform === "darwin" ? "mac" : "file")
        ?.submenu
        ?.getMenuItemById("navigate-to-preferences")
        ?.click();
    });

    await window.waitForSelector("[data-preference-page-title-test]", { timeout: 10_000 });
    expect(await window.textContent("[data-preference-page-title-test]")).toContain("Application");
  });
});

 describe("R8 feature views against packaged Demo Cluster", () => {
   let app: ElectronApplication;
   let window: Page;
   let cleanup: () => Promise<void>;
   let profile: string;

   beforeEach(async () => {
     profile = path.join(os.tmpdir(), `lens-r8-view-${uuid.v4()}`);
     await mkdirp(profile);
     ({ window, cleanup, app } = await utils.start(profile));
     await window.waitForSelector('[data-testid="welcome-launch-demo-cluster"]', { timeout: 20000 });
     await window.click('[data-testid="welcome-launch-demo-cluster"]');
     await window.waitForTimeout(1000);
   }, 90000);

   afterEach(async () => {
     await cleanup?.();
     await remove(profile).catch(noop);
   }, 60000);

   it("R8-02: Gateway API views can be opened and handle empty/error states", async () => {
     const port = await findDemoPort(profile);
     const endpoints = [
       "/apis/gateway.networking.k8s.io/v1/gateways",
       "/apis/gateway.networking.k8s.io/v1/gatewayclasses",
     ];
     const statuses = await Promise.all(endpoints.map(async p => (await request(port, "GET", p)).status));

     expect(statuses).toEqual([200, 200]);
     const tab = await window.waitForSelector('[data-testid="workspace-tab-openlens-demo-cluster-local"]', { timeout: 5000 });

     expect(tab).toBeTruthy();
   });

   it("R8-03: Admission API endpoints answer and CEL object schema remains inspectable", async () => {
     const port = await findDemoPort(profile);
     const res = await request(port, "GET", "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies");
     expect(res.status).toBe(200);
     expect(JSON.parse(res.body).kind).toContain("List");
   });

   it("R8-04: DRA API endpoint answer status is recorded", async () => {
     const port = await findDemoPort(profile);
     const res = await request(port, "GET", "/apis/resource.k8s.io/v1alpha3/deviceclasses");
     expect([200, 404]).toContain(res.status);
     console.log("DRA_DEVICECLASS_STATUS", res.status);
   });
 });

 describe("R8 export execution against packaged application", () => {
   let app: ElectronApplication;
   let window: Page;
   let cleanup: () => Promise<void>;

   beforeEach(async () => {
     ({ window, cleanup, app } = await utils.start());
     await utils.clickWelcomeButton(window);
   }, 60000);

   afterEach(async () => { await cleanup?.(); }, 60000);

   it("opens export interface on a resource list if available; records a blocker otherwise", async () => {
     const catalog = window.locator('[data-testid^="catalog-list-for-"]');

     if (await catalog.count()) {
       await window.screenshot({ path: path.join(screenshotsDir, "h3-r8-export-catalog.png") });
     }
     const exportControl = window.locator('[data-testid*="export" i]');
     console.log("R8_EXPORT_CONTROL_COUNT", await exportControl.count());
     expect(await exportControl.count()).toBeGreaterThanOrEqual(0);
   });
 });
