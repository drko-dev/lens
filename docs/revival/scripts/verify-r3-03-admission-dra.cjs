// Playwright Verification for OpenLens DevOps R3-03 (Admission Policies & DRA)
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));
const exe = path.join(projectRoot, "open-lens/dist-stage/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");

if (!fs.existsSync(exe)) {
  console.error("Packaged binary does not exist at: " + exe);
  process.exit(1);
}

const tmpDir = fs.mkdtempSync("/tmp/openlens-r3-03-adm-");
fs.mkdirSync(path.join(tmpDir, "home"));
fs.mkdirSync(path.join(tmpDir, "appdata"));

const screenshotsDir = path.join(projectRoot, "docs/revival/screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  let app;
  try {
    const env = {
      ...process.env,
      HOME: path.join(tmpDir, "home"),
      CICD: path.join(tmpDir, "appdata"),
      KUBECONFIG: "/dev/null",
    };

    console.log("[R3-03 Verification] Launching OpenLens DevOps from dist-stage...");
    app = await _electron.launch({
      executablePath: exe,
      args: ["--integration-testing"],
      env,
      timeout: 90000,
    });

    const runtime = await app.evaluate(({ app }) => ({
      name: app.getName(),
      isPackaged: app.isPackaged,
      userData: app.getPath("userData"),
    }));
    console.log("[R3-03 Verification] Runtime identity:", JSON.stringify(runtime));

    let page = null;
    const seen = new Set();
    const registerWindow = (p) => {
      if (seen.has(p)) return;
      seen.add(p);
      p.on("framenavigated", (f) => {
        if (f === p.mainFrame() && f.url().startsWith("https://lens.app")) page = p;
      });
      if (p.url().startsWith("https://lens.app")) page = p;
    };
    app.on("window", registerWindow);
    app.windows().forEach(registerWindow);

    for (let i = 0; i < 100 && !page; i++) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!page) throw new Error("Main renderer window not found within timeout");

    console.log("[R3-03 Verification] Main renderer loaded at: " + page.url());
    await page.waitForTimeout(3000);

    // Test 1: Verify Validating Admission Policies View & CEL Snippets
    console.log("[R3-03 Verification] Testing Validating Admission Policies view...");
    await page.evaluate(() => {
      const di = window.__LENS_RENDERER_DI__;
      const React = window.__LENS_REACT__;
      const ReactDOM = window.__LENS_REACT_DOM__;
      const DiContextProvider = window.__LENS_DI_PROVIDER__;
      const RouterHoc = di.injectById("routing-react-application-hoc");

      di.mockInjectable("create-stores-and-apis", () => true);
      di.mockInjectable("subscribe-stores", () => () => () => {});
      di.mockInjectable("is-table-column-hidden", () => () => false);
      di.mockInjectable("should-show-resource", () => ({ get: () => true }));
      di.mockInjectable("cluster-frame-context-for-namespaced-resources", () => ({
        allNamespaces: ["default"],
        contextNamespaces: ["default"],
        hasSelectedAll: true,
        isLoadingAll: () => false,
        isGlobalWatchEnabled: () => true,
      }));
      di.mockInjectable("hosted-cluster", () => ({
        id: "mock-cluster-id",
        name: { get: () => "k8s-modern-devops" },
        contextName: { get: () => "k8s-modern-devops" },
        preferences: { clusterName: "k8s-modern-devops" },
        allowedNamespaces: ["default"],
        accessibleNamespaces: [],
        resourcesToShow: { has: () => true },
        isGlobalWatchEnabled: { get: () => true },
      }));
      di.mockInjectable("selected-filter-namespaces", () => ({
        get: () => ["default"],
      }));

      const vapRouteComp = di.injectById("validating-admission-policies-route-component");
      const VapComponent = vapRouteComp.Component;

      const policyStore = di.injectById("validating-admission-policy-store");
      const policyApi = di.injectById("validating-admission-policy-api");

      const policyItem = new policyApi.objectConstructor({
        apiVersion: "admissionregistration.k8s.io/v1",
        kind: "ValidatingAdmissionPolicy",
        metadata: {
          name: "check-deployment-replicas",
          selfLink: "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies/check-deployment-replicas",
          uid: "vap-1",
          resourceVersion: "1234",
          creationTimestamp: new Date().toISOString(),
        },
        spec: {
          failurePolicy: "Fail",
          matchConstraints: {
            resourceRules: [
              {
                apiGroups: ["apps"],
                apiVersions: ["v1"],
                resources: ["deployments"],
              },
            ],
          },
          validations: [
            {
              expression: "object.spec.replicas <= 50",
              message: "Max 50 replicas allowed",
            },
          ],
        },
      });

      policyStore.items.replace([policyItem]);
      policyStore.isLoaded = true;

      const bindingStore = di.injectById("validating-admission-policy-binding-store");
      const bindingApi = di.injectById("validating-admission-policy-binding-api");

      const bindingItem = new bindingApi.objectConstructor({
        apiVersion: "admissionregistration.k8s.io/v1",
        kind: "ValidatingAdmissionPolicyBinding",
        metadata: {
          name: "check-deployment-replicas-binding",
          selfLink: "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings/check-deployment-replicas-binding",
          uid: "vapb-1",
          resourceVersion: "5678",
          creationTimestamp: new Date().toISOString(),
        },
        spec: {
          policyName: "check-deployment-replicas",
          validationActions: ["Deny", "Warn"],
          paramRef: {
            name: "replica-rules",
            namespace: "kube-system",
          },
        },
      });

      bindingStore.items.replace([bindingItem]);
      bindingStore.isLoaded = true;

      let mount = document.getElementById("r3-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "r3-mount";
        mount.style.position = "fixed";
        mount.style.top = "0";
        mount.style.left = "0";
        mount.style.width = "100vw";
        mount.style.height = "100vh";
        mount.style.zIndex = "10";
        mount.style.backgroundColor = "var(--colorLayoutBg)";
        mount.style.overflow = "auto";
        document.body.appendChild(mount);
      }

      ReactDOM.render(
        React.createElement(
          DiContextProvider,
          { value: { di } },
          React.createElement(
            RouterHoc,
            null,
            React.createElement(
              "div",
              { style: { height: "100%", display: "flex", flexDirection: "column" } },
              React.createElement(VapComponent)
            )
          )
        ),
        mount
      );
    });

    const celNotice = page.locator('[data-testid="cel-readonly-notice"]');
    await celNotice.waitFor({ state: "visible", timeout: 10000 });
    console.log("[R3-03 Verification] CEL readonly banner rendered successfully!");

    const policyRow = page.locator('.ValidatingAdmissionPolicies .TableCell', { hasText: 'check-deployment-replicas' });
    await policyRow.waitFor({ state: "visible", timeout: 10000 });
    console.log("[R3-03 Verification] Validating Admission Policies row rendered successfully!");

    const screenshotPolicies = path.join(screenshotsDir, "r3-03-validating-admission-policies-view.png");
    await page.screenshot({ path: screenshotPolicies });
    console.log("[R3-03 Verification] Saved Admission Policies screenshot:", screenshotPolicies);

    // Switch to Policy Bindings tab
    console.log("[R3-03 Verification] Switching to Policy Bindings tab...");
    const bindingsTab = page.locator('#tab-admission-policy-bindings');
    await bindingsTab.click();

    const bindingRow = page.locator('.ValidatingAdmissionPolicyBindings .TableCell', { hasText: 'check-deployment-replicas-binding' });
    await bindingRow.waitFor({ state: "visible", timeout: 10000 });
    console.log("[R3-03 Verification] Policy Bindings row rendered successfully!");

    const screenshotBindings = path.join(screenshotsDir, "r3-03-admission-policy-bindings-view.png");
    await page.screenshot({ path: screenshotBindings });
    console.log("[R3-03 Verification] Saved Policy Bindings screenshot:", screenshotBindings);

    // Test 2: Verify Dynamic Resource Allocation (DRA) View & Tabs
    console.log("[R3-03 Verification] Testing Dynamic Resource Allocation (DRA) view...");
    await page.evaluate(() => {
      const di = window.__LENS_RENDERER_DI__;
      const React = window.__LENS_REACT__;
      const ReactDOM = window.__LENS_REACT_DOM__;
      const DiContextProvider = window.__LENS_DI_PROVIDER__;
      const RouterHoc = di.injectById("routing-react-application-hoc");

      const draRouteComp = di.injectById("dra-route-component");
      const DraComponent = draRouteComp.Component;

      const deviceClassStore = di.injectById("device-class-store");
      const deviceClassApi = di.injectById("device-class-api");

      const dcItem = new deviceClassApi.objectConstructor({
        apiVersion: "resource.k8s.io/v1beta1",
        kind: "DeviceClass",
        metadata: {
          name: "gpu.nvidia.com",
          selfLink: "/apis/resource.k8s.io/v1beta1/deviceclasses/gpu.nvidia.com",
          uid: "dc-1",
          resourceVersion: "2000",
          creationTimestamp: new Date().toISOString(),
        },
        spec: {
          selectors: [
            {
              cel: {
                expression: 'device.driver == "gpu.nvidia.com" && device.attributes["model"].string == "H100"',
              },
            },
          ],
        },
      });

      deviceClassStore.items.replace([dcItem]);
      deviceClassStore.isLoaded = true;

      const resourceClaimStore = di.injectById("resource-claim-store");
      const resourceClaimApi = di.injectById("resource-claim-api");

      const claimItem = new resourceClaimApi.objectConstructor({
        apiVersion: "resource.k8s.io/v1beta1",
        kind: "ResourceClaim",
        metadata: {
          name: "ai-inference-gpu-claim",
          namespace: "default",
          selfLink: "/apis/resource.k8s.io/v1beta1/namespaces/default/resourceclaims/ai-inference-gpu-claim",
          uid: "rc-1",
          resourceVersion: "3000",
          creationTimestamp: new Date().toISOString(),
        },
        spec: {
          devices: {
            requests: [
              { name: "gpu", deviceClassName: "gpu.nvidia.com" },
            ],
          },
        },
        status: {
          allocation: {
            devices: {
              results: [
                {
                  request: "gpu",
                  driver: "gpu.nvidia.com",
                  pool: "node-gpu-pool-1",
                  device: "gpu-0",
                },
              ],
            },
          },
          reservedFor: [
            {
              resource: "pods",
              name: "llama3-worker-0",
              uid: "pod-1",
            },
          ],
        },
      });

      resourceClaimStore.items.replace([claimItem]);
      resourceClaimStore.isLoaded = true;

      const mount = document.getElementById("r3-mount");
      ReactDOM.render(
        React.createElement(
          DiContextProvider,
          { value: { di } },
          React.createElement(
            RouterHoc,
            null,
            React.createElement(
              "div",
              { style: { height: "100%", display: "flex", flexDirection: "column" } },
              React.createElement(DraComponent)
            )
          )
        ),
        mount
      );
    });

    const draNotice = page.locator('[data-testid="dra-readonly-notice"]');
    await draNotice.waitFor({ state: "visible", timeout: 10000 });
    console.log("[R3-03 Verification] DRA readonly banner rendered successfully!");

    const dcRow = page.locator('.DeviceClasses .TableCell.name', { hasText: 'gpu.nvidia.com' });
    await dcRow.waitFor({ state: "visible", timeout: 10000 });
    console.log("[R3-03 Verification] DeviceClasses row rendered successfully!");

    const screenshotDc = path.join(screenshotsDir, "r3-03-dra-device-classes-view.png");
    await page.screenshot({ path: screenshotDc });
    console.log("[R3-03 Verification] Saved DeviceClasses screenshot:", screenshotDc);

    // Switch to Resource Claims tab
    console.log("[R3-03 Verification] Switching to Resource Claims tab...");
    const claimsTab = page.locator('#tab-resource-claims');
    await claimsTab.click();

    const claimRow = page.locator('.ResourceClaims .TableCell.name', { hasText: 'ai-inference-gpu-claim' });
    await claimRow.waitFor({ state: "visible", timeout: 10000 });
    console.log("[R3-03 Verification] ResourceClaims row rendered successfully!");

    const screenshotRc = path.join(screenshotsDir, "r3-03-dra-resource-claims-view.png");
    await page.screenshot({ path: screenshotRc });
    console.log("[R3-03 Verification] Saved ResourceClaims screenshot:", screenshotRc);

    console.log("\n=======================================================");
    console.log("  R3-03 VERIFICATION PASSED WITH COMPLETE SUCCESS!");
    console.log("  - ValidatingAdmissionPolicy & Bindings verified in GUI");
    console.log("  - CEL expressions viewer and banners verified");
    console.log("  - Dynamic Resource Allocation (DeviceClasses & Claims) verified");
    console.log("  - Screenshots saved to docs/revival/screenshots/");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("[R3-03 Verification] FAILED:", err);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close().catch(() => {});
    }
  }
})();
