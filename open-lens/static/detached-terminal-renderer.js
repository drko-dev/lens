/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

(async () => {
  const INPUT_CHUNK = 16384;
  const api = window.lensDetachedTerminal;
  const $ = (testId) => document.querySelector(`[data-testid="${testId}"]`);
  const text = (testId, value) => {
    $(testId).textContent = value;
  };
  const { descriptor } = await api.getContext();
  const badge = $("detached-terminal-environment-badge");
  const status = $("detached-terminal-status");
  let ended = false;

  document.title = `${descriptor.isProduction ? "[PRODUCTION] " : ""}${descriptor.title}`;
  $("detached-terminal-production-banner").hidden = !descriptor.isProduction;
  badge.textContent = descriptor.isProduction ? "PROD" : descriptor.environment.toUpperCase();
  badge.classList.toggle("production", descriptor.isProduction);
  text("detached-terminal-title", `terminal: ${descriptor.title}`);
  text("detached-terminal-cluster", descriptor.title.split(" · ")[0]);
  text("detached-terminal-tab", `${descriptor.workspaceId} / ${descriptor.tabId}`);

  $("detached-terminal-redock").addEventListener("click", () => {
    api.requestRedock();
  });

  const term = new window.Terminal({
    cursorBlink: true,
    scrollback: 5000,
    fontSize: 13,
    fontFamily: "Menlo, Monaco, Consolas, monospace",
    theme: { background: "#181a1b" },
  });
  const fit = new window.FitAddon.FitAddon();

  term.loadAddon(fit);
  term.open($("detached-terminal-xterm"));
  fit.fit();

  // Shell output is only ever written through xterm (never as HTML).
  api.onEvent((event) => {
    if (event?.type === "output" && typeof event.data === "string") {
      term.write(event.data);
    } else if (event?.type === "exit") {
      ended = true;
      status.textContent = "session ended";
      term.write("\r\n\x1b[31m[session ended]\x1b[0m\r\n");
    }
  });

  term.onData((data) => {
    if (ended) {
      return;
    }

    for (let offset = 0; offset < data.length; offset += INPUT_CHUNK) {
      api.input(data.slice(offset, offset + INPUT_CHUNK)).catch(() => {});
    }
  });
  term.onResize(({ cols, rows }) => {
    if (!ended) {
      api.resize(cols, rows).catch(() => {});
    }
  });
  window.addEventListener("resize", () => fit.fit());

  await api.start();
  if (!ended) {
    status.textContent = "connected";
  }
  await api.resize(term.cols, term.rows).catch(() => {});
  term.focus();
})().catch((error) => {
  const status = document.querySelector('[data-testid="detached-terminal-status"]');

  if (status) {
    status.textContent = `error: ${error?.message ?? error}`;
  }
});
