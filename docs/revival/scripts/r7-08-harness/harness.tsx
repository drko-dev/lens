/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useState } from "react";
import ReactDOM from "react-dom";
import { ResourceQuota, Pod } from "@openlens/kube-object";
import { ResourceQuotaHeadroom } from "../../../../packages/core/src/renderer/components/config-resource-quotas/headroom/resource-quota-headroom";
import { parseJsonLogLine, getLogLevelBadgeStyle } from "../../../../packages/core/src/renderer/components/dock/logs/json-log-formatter";

// Sample pods
const devPod = new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "auth-service-798dfb-x29",
    namespace: "dev-backend",
    uid: "pod-dev-1",
    resourceVersion: "10523",
    selfLink: "/api/v1/namespaces/dev-backend/pods/auth-service-798dfb-x29",
  },
  spec: {
    containers: [
      { name: "auth-api", image: "node:18-alpine" },
      { name: "redis-sidecar", image: "redis:7-alpine" },
    ],
    ephemeralContainers: [],
  },
  status: { phase: "Running" } as any,
});

const prodPod = new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "payments-core-5df98-q9p",
    namespace: "production",
    uid: "pod-prod-1",
    resourceVersion: "98201",
    selfLink: "/api/v1/namespaces/production/pods/payments-core-5df98-q9p",
  },
  spec: {
    containers: [
      { name: "payments-gateway", image: "golang:1.22" },
      { name: "envoy-proxy", image: "envoyproxy/envoy:v1.28.0" },
    ],
    ephemeralContainers: [],
  },
  status: { phase: "Running" } as any,
});

// Sample ResourceQuotas
const sampleQuotas = [
  new ResourceQuota({
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: {
      name: "compute-resources-prod",
      namespace: "production",
      uid: "quota-1",
      resourceVersion: "1",
      selfLink: "/api/v1/namespaces/production/resourcequotas/compute-resources-prod",
    },
    spec: {
      hard: {
        "requests.cpu": "4",
        "limits.cpu": "8",
        "requests.memory": "8Gi",
        "limits.memory": "16Gi",
        "pods": "10",
      },
      scopes: ["NotTerminating"],
    } as any,
    status: {
      hard: {
        "requests.cpu": "4",
        "limits.cpu": "8",
        "requests.memory": "8Gi",
        "limits.memory": "16Gi",
        "pods": "10",
      },
      used: {
        "requests.cpu": "3800m", // 95% -> critical
        "limits.cpu": "6400m",   // 80% -> warning
        "requests.memory": "4Gi",// 50% -> normal
        "limits.memory": "10Gi", // 62.5% -> normal
        "pods": "12",            // 120% -> exceeded unclamped
      },
    },
  }),
  new ResourceQuota({
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: {
      name: "staging-limits",
      namespace: "staging",
      uid: "quota-2",
      resourceVersion: "1",
      selfLink: "/api/v1/namespaces/staging/resourcequotas/staging-limits",
    },
    spec: {
      hard: {
        "requests.cpu": "2",
        "requests.memory": "4Gi",
        "pods": "20",
      },
    } as any,
    status: {
      hard: {
        "requests.cpu": "2",
        "requests.memory": "4Gi",
        "pods": "20",
      },
      used: {
        "requests.cpu": "600m",
        "requests.memory": "1.5Gi",
        "pods": "6",
      },
    },
  }),
  new ResourceQuota({
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: {
      name: "unlimited-sample",
      namespace: "sandbox",
      uid: "quota-3",
      resourceVersion: "1",
      selfLink: "/api/v1/namespaces/sandbox/resourcequotas/unlimited-sample",
    },
    spec: {
      hard: {
        "requests.cpu": "0", // Zero hard limit
      },
    } as any,
    status: {
      hard: {
        "requests.cpu": "0",
      },
      used: {
        "requests.cpu": "100m",
      },
    },
  }),
];

// Sample raw / JSON logs
const sampleLogLines = [
  '2026-10-24T03:00:01.100Z {"level":"info","time":"2026-10-24T03:00:01.100Z","caller":"server.go:102","msg":"HTTP server started on :8080","env":"production"}',
  '2026-10-24T03:00:02.340Z {"level":"debug","time":"2026-10-24T03:00:02.340Z","caller":"db.go:45","msg":"Connection pool initialized","connections":10}',
  '2026-10-24T03:00:03.900Z {"level":"warn","time":"2026-10-24T03:00:03.900Z","caller":"circuit.go:88","msg":"Upstream timeout, circuit breaker half-open","latency":"250ms"}',
  '2026-10-24T03:00:04.120Z {"level":"error","time":"2026-10-24T03:00:04.120Z","caller":"auth.go:210","msg":"Token signature invalid","client_ip":"192.168.1.50"}',
  '2026-10-24T03:00:05.500Z Plain text fallback log: Container memory garbage collection completed in 4.2ms',
  '2026-10-24T03:00:06.000Z {"level":"info","msg":"Sanitized log without HTML injection <script>alert(1)</script>"}',
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"debug" | "logs" | "quotas">("debug");

  // Debug Dialog State
  const [selectedPodType, setSelectedPodType] = useState<"dev" | "prod">("dev");
  const [debugPreset, setDebugPreset] = useState<string>("busybox");
  const [customImage, setCustomImage] = useState<string>("");
  const [containerName, setContainerName] = useState<string>("debugger-r708");
  const [targetContainer, setTargetContainer] = useState<string>("auth-api");
  const [command, setCommand] = useState<string>("sh");
  const [prodConfirmed, setProdConfirmed] = useState<boolean>(false);
  const [prodConfirmationInput, setProdConfirmationInput] = useState<string>("");
  const [attachSuccess, setAttachSuccess] = useState<boolean>(false);
  const [containerStatus, setContainerStatus] = useState<string>("");

  // Logs State
  const [sinceFilter, setSinceFilter] = useState<string>("All");
  const [tailFilter, setTailFilter] = useState<string>("500");
  const [logFormat, setLogFormat] = useState<"raw" | "json">("json");
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const currentPod = selectedPodType === "prod" ? prodPod : devPod;
  const isProd = selectedPodType === "prod";

  const isProdUnlocked = !isProd || (prodConfirmed && prodConfirmationInput.trim() === currentPod.getName());

  const handleAttach = () => {
    if (!isProdUnlocked) return;
    setContainerStatus("Mutation accepted. Waiting for container to start...");
    setTimeout(() => {
      setContainerStatus("Container is Running. Launching terminal...");
      setAttachSuccess(true);
    }, 50);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ borderBottom: "1px solid var(--borderFocusColor)", paddingBottom: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 6px", color: "var(--textColorPrimary)" }}>
          OpenLens DevOps Revival — R7-08 Advanced Pod Diagnostics
        </h2>
        <p style={{ margin: 0, color: "var(--textColorSecondary)", fontSize: 13 }}>
          Interactive Verification: Attach Debug Container, Log Ergonomics & ResourceQuota Headroom
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={() => setActiveTab("debug")}
            data-testid="tab-btn-debug"
            style={{
              padding: "6px 14px",
              background: activeTab === "debug" ? "#1f6feb" : "var(--layoutTabsBackground)",
              color: "#fff",
              border: "1px solid var(--borderFocusColor)",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            1. Debug Container (kubectl debug)
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            data-testid="tab-btn-logs"
            style={{
              padding: "6px 14px",
              background: activeTab === "logs" ? "#1f6feb" : "var(--layoutTabsBackground)",
              color: "#fff",
              border: "1px solid var(--borderFocusColor)",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            2. Log Ergonomics (Since, Tail & JSON)
          </button>
          <button
            onClick={() => setActiveTab("quotas")}
            data-testid="tab-btn-quotas"
            style={{
              padding: "6px 14px",
              background: activeTab === "quotas" ? "#1f6feb" : "var(--layoutTabsBackground)",
              color: "#fff",
              border: "1px solid var(--borderFocusColor)",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            3. ResourceQuota Headroom
          </button>
        </div>
      </header>

      {/* TAB 1: DEBUG CONTAINER */}
      {activeTab === "debug" && (
        <section data-testid="section-debug" style={{ background: "var(--layoutTabsBackground)", padding: 20, borderRadius: 6, border: "1px solid var(--borderFocusColor)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Attach Debug Container Dialog</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setSelectedPodType("dev"); setAttachSuccess(false); setProdConfirmed(false); setProdConfirmationInput(""); }}
                data-testid="switch-dev-pod"
                style={{
                  padding: "4px 10px",
                  background: selectedPodType === "dev" ? "#238636" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  border: "1px solid var(--borderFocusColor)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Target: DEV Cluster
              </button>
              <button
                onClick={() => { setSelectedPodType("prod"); setAttachSuccess(false); setProdConfirmed(false); setProdConfirmationInput(""); }}
                data-testid="switch-prod-pod"
                style={{
                  padding: "4px 10px",
                  background: selectedPodType === "prod" ? "#da3633" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  border: "1px solid var(--borderFocusColor)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Target: PROD Cluster (PROD Guard)
              </button>
            </div>
          </div>

          <div className="AttachDebugContainerDialog" data-testid="attach-debug-container-dialog">
            {/* Target Pod and Cluster Summary */}
            <div className="target-summary">
              <div className="summary-row">
                <span className="summary-label">Cluster:</span>
                <span className="summary-value" data-testid="target-cluster">
                  {isProd ? "production-east-1 (PRODUCTION)" : "dev-minikube (DEVELOPMENT)"}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Namespace:</span>
                <span className="summary-value" data-testid="target-namespace">{currentPod.getNs()}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Pod:</span>
                <span className="summary-value" data-testid="target-pod">{currentPod.getName()}</span>
              </div>
            </div>

            {/* Immutability Warning Banner */}
            <div className="immutable-warning-banner" data-testid="immutable-warning-banner">
              <div>
                <strong>Persistent Pod Modification:</strong> Once attached, ephemeral containers become a permanent part of the Pod spec and cannot be removed like standard containers.
              </div>
            </div>

            {/* PROD Guard Inviolable Banner */}
            {isProd && (
              <div className="prod-guard-banner" data-testid="prod-guard-banner">
                <div>
                  <strong>PRODUCTION CLUSTER:</strong> You are injecting an ephemeral debug container into a production workload. This will consume node resources and persist in cluster audit logs.
                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={prodConfirmed}
                        onChange={e => setProdConfirmed(e.target.checked)}
                        data-testid="prod-confirm-checkbox"
                      />
                      I confirm attaching debug container to {currentPod.getName()} in PRODUCTION
                    </label>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, marginBottom: 4, color: "var(--textColorSecondary)" }}>
                      Type the exact Pod name <strong>{currentPod.getName()}</strong> to unlock:
                    </div>
                    <input
                      type="text"
                      data-testid="prod-confirmation-input"
                      value={prodConfirmationInput}
                      onChange={e => setProdConfirmationInput(e.target.value)}
                      placeholder={currentPod.getName()}
                      style={{ width: "100%", padding: "6px 8px", background: "var(--mainBackground)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 4, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Container status & Success notification */}
            {containerStatus && !attachSuccess && (
              <div
                style={{
                  background: "rgba(59, 130, 246, 0.15)",
                  border: "1px solid #3b82f6",
                  color: "#93c5fd",
                  padding: "10px 14px",
                  borderRadius: 4,
                  marginBottom: 16,
                }}
                data-testid="container-status-banner"
              >
                <strong>Status:</strong> {containerStatus}
              </div>
            )}
            {attachSuccess && (
              <div style={{ background: "rgba(16, 185, 129, 0.2)", border: "1px solid #10b981", color: "#10b981", padding: 12, borderRadius: 4, marginBottom: 16 }} data-testid="success-banner">
                Debug container &quot;{containerName}&quot; attached successfully and is running. Terminal tab launched attached to container.
              </div>
            )}

            {/* Container Name */}
            <div className="form-group">
              <label>Container Name</label>
              <input
                data-testid="debug-container-name-input"
                value={containerName}
                onChange={e => setContainerName(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "var(--mainBackground)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 4, boxSizing: "border-box" }}
              />
              <span className="helper-text">Must be a unique lowercase DNS label (RFC 1123).</span>
            </div>

            {/* Debug Image Presets */}
            <div className="form-group">
              <label>Debug Image</label>
              <div className="image-preset-buttons">
                {["busybox", "alpine", "netshoot", "curl"].map(preset => (
                  <button
                    key={preset}
                    onClick={() => setDebugPreset(preset)}
                    data-testid={`preset-${preset}`}
                    style={{
                      padding: "4px 12px",
                      background: debugPreset === preset ? "#1f6feb" : "var(--mainBackground)",
                      color: "#fff",
                      border: "1px solid var(--borderFocusColor)",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {preset}
                  </button>
                ))}
                <button
                  onClick={() => setDebugPreset("custom")}
                  data-testid="preset-custom"
                  style={{
                    padding: "4px 12px",
                    background: debugPreset === "custom" ? "#1f6feb" : "var(--mainBackground)",
                    color: "#fff",
                    border: "1px solid var(--borderFocusColor)",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  custom
                </button>
              </div>

              {debugPreset === "custom" ? (
                <input
                  data-testid="debug-custom-image-input"
                  value={customImage}
                  onChange={e => setCustomImage(e.target.value)}
                  placeholder="e.g. curlimages/curl:latest"
                  style={{ width: "100%", padding: "6px 8px", background: "var(--mainBackground)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 4, boxSizing: "border-box" }}
                />
              ) : (
                <div style={{ fontSize: 12, color: "var(--textColorSecondary)", fontFamily: "var(--font-monospace)" }}>
                  {debugPreset === "busybox" ? "busybox:latest" : debugPreset === "alpine" ? "alpine:latest" : debugPreset === "netshoot" ? "nicolaka/netshoot:latest" : "curlimages/curl:latest"}
                </div>
              )}
            </div>

            {/* Target Container */}
            <div className="form-group">
              <label>Target Container (Process Namespace Sharing)</label>
              <select
                data-testid="debug-target-container-select"
                value={targetContainer}
                onChange={e => setTargetContainer(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "var(--mainBackground)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 4 }}
              >
                <option value="">None (Pod process namespace)</option>
                {currentPod.getContainers().map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.image})</option>
                ))}
              </select>
            </div>

            {/* Initial Command */}
            <div className="form-group">
              <label>Initial Command</label>
              <input
                data-testid="debug-command-input"
                value={command}
                onChange={e => setCommand(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "var(--mainBackground)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 4, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                disabled={!isProdUnlocked}
                onClick={handleAttach}
                data-testid="attach-submit-btn"
                style={{
                  padding: "8px 18px",
                  background: !isProdUnlocked ? "#484f58" : "#238636",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: !isProdUnlocked ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Attach and Launch
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: LOG ERGONOMICS */}
      {activeTab === "logs" && (
        <section data-testid="section-logs" style={{ background: "var(--layoutTabsBackground)", padding: 20, borderRadius: 6, border: "1px solid var(--borderFocusColor)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Pod Logs: Since, Tail & Structured JSON</h3>
          </div>

          {/* Controls Bar */}
          <div data-testid="log-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--dockInfoBackground)", padding: "8px 12px", borderRadius: 4, border: "1px solid var(--borderFocusColor)", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span
                data-testid={isPaused ? "log-status-paused" : "log-status-live"}
                style={{
                  padding: "2px 8px",
                  borderRadius: 3,
                  fontSize: 11,
                  fontWeight: 700,
                  background: isPaused ? "#f59e0b" : "#238636",
                  color: isPaused ? "#111" : "#fff",
                }}
              >
                {isPaused ? "PAUSED" : "LIVE"}
              </span>

              <button
                onClick={() => setIsPaused(!isPaused)}
                data-testid="log-pause-toggle-btn"
                style={{ padding: "3px 10px", fontSize: 11, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 3, cursor: "pointer" }}
              >
                {isPaused ? "Resume" : "Pause"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {/* Since Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: "var(--textColorSecondary)" }}>Since:</span>
                <select
                  data-testid="log-since-select"
                  value={sinceFilter}
                  onChange={e => setSinceFilter(e.target.value)}
                  style={{ padding: "3px 8px", background: "var(--mainBackground)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 3 }}
                >
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="24h">24h</option>
                  <option value="All">All</option>
                </select>
              </div>

              {/* Tail Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ color: "var(--textColorSecondary)" }}>Tail:</span>
                <select
                  data-testid="log-tail-select"
                  value={tailFilter}
                  onChange={e => setTailFilter(e.target.value)}
                  style={{ padding: "3px 8px", background: "var(--mainBackground)", color: "#fff", border: "1px solid var(--borderFocusColor)", borderRadius: 3 }}
                >
                  <option value="100">100</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                  <option value="All">All</option>
                </select>
              </div>

              {/* Raw | JSON toggle */}
              <button
                data-testid="log-format-toggle"
                onClick={() => setLogFormat(logFormat === "json" ? "raw" : "json")}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: logFormat === "json" ? "#1f6feb" : "rgba(255,255,255,0.08)",
                  color: "#fff",
                  border: "1px solid var(--borderFocusColor)",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                {logFormat === "json" ? "Format: JSON" : "Format: Raw"}
              </button>
            </div>
          </div>

          {/* Logs View Window */}
          <div
            data-testid="log-list-window"
            style={{
              background: "var(--mainBackground)",
              border: "1px solid var(--borderFocusColor)",
              borderRadius: 4,
              padding: "12px 16px",
              fontFamily: "var(--font-monospace)",
              fontSize: 12,
              lineHeight: 1.8,
              minHeight: 220,
            }}
          >
            {sampleLogLines.map((line, idx) => {
              if (logFormat === "raw") {
                return (
                  <div key={idx} data-testid="raw-log-line" style={{ color: "var(--textColorPrimary)" }}>
                    {line}
                  </div>
                );
              }

              // JSON mode
              const parsed = parseJsonLogLine(line);
              if (!parsed.isJson) {
                return (
                  <div key={idx} data-testid="fallback-log-line" style={{ color: "var(--textColorSecondary)", opacity: 0.9 }}>
                    {line}
                  </div>
                );
              }

              const badgeStyle = getLogLevelBadgeStyle(parsed.level);

              return (
                <div key={idx} data-testid="json-log-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                  {parsed.prefix && <span style={{ color: "var(--textColorSecondary)", fontSize: 11 }}>{parsed.prefix}</span>}
                  {parsed.level && (
                    <span
                      data-testid={`level-badge-${parsed.level}`}
                      style={{
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontWeight: 700,
                        fontSize: 10,
                        textTransform: "uppercase",
                        backgroundColor: badgeStyle.backgroundColor,
                        color: badgeStyle.color,
                      }}
                    >
                      {parsed.level}
                    </span>
                  )}
                  {parsed.caller && <span style={{ color: "#79c0ff", fontSize: 11 }}>[{parsed.caller}]</span>}
                  <span style={{ color: "var(--textColorPrimary)", fontWeight: 500 }}>{parsed.message}</span>
                  {parsed.extra && Object.entries(parsed.extra).map(([k, v]) => (
                    <span key={k} style={{ color: "var(--textColorSecondary)", fontSize: 11, marginLeft: 4 }}>
                      <span style={{ color: "#d2a8ff" }}>{k}=</span>
                      <span style={{ color: "#a5d6ff" }}>{String(v)}</span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 3: RESOURCEQUOTA HEADROOM */}
      {activeTab === "quotas" && (
        <section data-testid="section-quotas" style={{ background: "var(--layoutTabsBackground)", padding: 20, borderRadius: 6, border: "1px solid var(--borderFocusColor)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>ResourceQuota Headroom & Multi-Namespace Breakdown</h3>
            <span style={{ fontSize: 12, color: "var(--textColorSecondary)" }}>
              Evaluated via pure k8s Quantity parser & headroom calculator
            </span>
          </div>

          <ResourceQuotaHeadroom
            quotas={sampleQuotas}
            title="Cluster ResourceQuota Headroom"
          />
        </section>
      )}
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
