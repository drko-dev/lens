/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

(async () => {
  const api = window.incidentConfirmationApi;
  if (!api) {
    console.error("Critical: incidentConfirmationApi not available in window context.");
    return;
  }

  const $ = (id) => document.getElementById(id);
  const text = (id, val) => {
    const el = $(id);
    if (el) el.textContent = val;
  };

  try {
    const details = await api.getDetails();
    if (!details) return;

    const actionLabel =
      details.toStatus === "APROBACIÓN HUMANA" ? "Aprobar Solución Propuesta" : "Cierre Definitivo del Incidente";

    text("modal-title", actionLabel);
    text("incident-target", `${details.incidentTitle} (${details.incidentId})`);
    text("transition-target", `${details.fromStatus} ➔ ${details.toStatus}`);
    text("justification-text", `"${details.justification}"`);

    const cancelBtn = $("btn-cancel");
    const confirmBtn = $("btn-confirm");

    cancelBtn.addEventListener("click", async () => {
      cancelBtn.disabled = true;
      confirmBtn.disabled = true;
      await api.respond("REJECTED");
    });

    confirmBtn.addEventListener("click", async () => {
      cancelBtn.disabled = true;
      confirmBtn.disabled = true;
      await api.respond("APPROVED");
    });
  } catch (err) {
    console.error("Error loading confirmation details:", err);
  }
})();
