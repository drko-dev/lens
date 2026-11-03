/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

(async () => {
  const MAX_LINES = 5000;
  const $ = (testId) => document.querySelector(`[data-testid="${testId}"]`);
  const text = (testId, value) => {
    $(testId).textContent = value;
  };
  const applyTheme = (theme) => {
    // Preload already allowlisted names and validated values; only CSSOM setProperty (CSP-safe).
    if (!theme) return;
    const root = document.documentElement;

    for (const [name, value] of Object.entries(theme.colors)) root.style.setProperty(`--${name}`, value);
    root.dataset.theme = theme.type;
  };

  window.lensDetachedTool.onThemeChanged(applyTheme);
  applyTheme(await window.lensDetachedTool.getTheme());

  const { descriptor } = await window.lensDetachedTool.getContext();
  const resource = descriptor.resource;
  const logLines = $("detached-log-lines");
  const inspector = $("detached-inspector-json");
  const errorBox = $("detached-error");
  const badge = $("detached-environment-badge");
  let lineCount = 0;

  document.title = `${descriptor.isProduction ? "[PRODUCTION] " : ""}${descriptor.title}`;
  $("detached-production-banner").hidden = !descriptor.isProduction;
  badge.textContent = descriptor.isProduction ? "PROD" : descriptor.environment.toUpperCase();
  badge.classList.toggle("production", descriptor.isProduction);
  text("detached-title", `${descriptor.toolKind}: ${descriptor.title}`);
  text("detached-cluster", descriptor.title.split(" · ")[0]);
  text("detached-tab", `${descriptor.workspaceId} / ${descriptor.tabId}`);
  text("detached-resource", resource
    ? `${resource.kind} ${resource.namespace ? `${resource.namespace}/` : ""}${resource.name}${resource.uid ? ` (${resource.uid})` : ""}`
    : "—");
  // H7.5: resource lists are read-only tables; the accent is a validated #rrggbb from Main.
  const isList = descriptor.toolKind === "resource-list";
  const list = $("detached-list");
  const listRows = $("detached-list-rows");
  const listEmpty = $("detached-list-empty");

  // Main already validated it; checked again here as defence in depth before touching CSS.
  if (/^#[0-9a-fA-F]{6}$/.test(descriptor.accent ?? "")) document.documentElement.style.setProperty("--cluster-accent", descriptor.accent);
  document.documentElement.dataset.toolKind = descriptor.toolKind;
  list.hidden = !isList;
  $("detached-readonly-notice").hidden = !isList;
  if (isList && descriptor.list) {
    text("detached-resource", `${descriptor.list.kind === "Pod" ? "Pods" : "Deployments"} · ${descriptor.list.namespace ? `namespace ${descriptor.list.namespace}` : "all namespaces"}`);
    text("detached-title", descriptor.title);
  }
  logLines.hidden = descriptor.toolKind !== "logs";
  inspector.hidden = descriptor.toolKind !== "inspector";
  $("detached-refresh").hidden = descriptor.toolKind !== "inspector";

  // The window takes OS focus when shown; keep initial focus off Redock so stray
  // Enter/Space keystrokes typed elsewhere cannot activate it.
  $("detached-body").focus();

  $("detached-redock").addEventListener("click", () => {
    window.lensDetachedTool.requestRedock(descriptor);
  });
  $("detached-refresh").addEventListener("click", () => {
    window.lensDetachedTool.refresh();
  });

  const appendLines = (lines) => {
    const body = $("detached-body");
    const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 40;

    for (const line of lines) {
      // textContent only: log lines are untrusted data.
      logLines.appendChild(document.createTextNode(`${String(line)}\n`));
      lineCount += 1;
    }

    while (lineCount > MAX_LINES && logLines.firstChild) {
      logLines.removeChild(logLines.firstChild);
      lineCount -= 1;
    }

    if (stick) body.scrollTop = body.scrollHeight;
  };

  window.lensDetachedTool.onEvent((event) => {
    switch (event?.type) {
      case "log-lines":
        if (Array.isArray(event.lines)) appendLines(event.lines);
        break;
      case "status":
        text("detached-status", String(event.status));
        break;
      case "inspector":
        errorBox.hidden = true;
        inspector.textContent = JSON.stringify(event.object, null, 2);
        text("detached-status", "loaded");
        break;
      case "rows": {
        // textContent only: every cell is untrusted cluster data.
        const rows = Array.isArray(event.rows) ? event.rows : [];

        listRows.replaceChildren(...rows.map((row) => {
          const tr = document.createElement("tr");

          for (const value of [row.name, row.namespace ?? "", row.status, row.ready, row.createdAt ?? ""]) {
            const td = document.createElement("td");

            td.textContent = String(value);
            tr.appendChild(td);
          }

          return tr;
        }));
        listEmpty.hidden = rows.length > 0;
        list.dataset.count = String(rows.length);
        break;
      }
      case "error":
        errorBox.hidden = false;
        errorBox.textContent = String(event.message);
        inspector.textContent = "";
        text("detached-status", "error");
        break;
      default:
        break;
    }
  });

  await window.lensDetachedTool.start();
})();
