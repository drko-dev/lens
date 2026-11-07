/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { createContainer } from "@ogre-tools/injectable";
import { DiContextProvider, registerInjectableReact } from "@ogre-tools/injectable-react";
import { NonInjectedIncidentRetentionPreference } from "../incident-retention-preference";
import { IncidentStore } from "../../../../features/incident-workbench/renderer/incident-store";
import { loggerInjectionToken } from "@openlens/logger";
import { getInjectable } from "@ogre-tools/injectable";

describe("IncidentRetentionPreference (H8-009)", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;
  let di: ReturnType<typeof createContainer>;

  beforeEach(() => {
    di = createContainer("test-di");
    registerInjectableReact(di);
    di.register(
      getInjectable({
        id: "logger",
        instantiate: () => ({ warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, silly: () => {} }),
        injectionToken: loggerInjectionToken,
      }),
    );

    mockIpc = {
      invoke: jest.fn(async (channel: string, ...args: any[]) => {
        if (channel === "openlens:incident:get-retention-policy") {
          return {
            id: "default",
            enabled: false,
            strategy: "manual",
            retentionDays: 90,
            protectPinned: true,
            purgeClosedOnly: true,
            evidenceRetentionDays: null,
            lastEvaluatedAt: null,
            updatedAt: "2026-11-05T10:00:00Z",
          };
        }
        if (channel === "openlens:incident:preview-purge") {
          return {
            policy: {
              id: "default",
              enabled: false,
              strategy: "manual",
              retentionDays: 90,
              protectPinned: true,
              purgeClosedOnly: true,
              updatedAt: "2026-11-05T10:00:00Z",
            },
            candidateIncidentCount: 2,
            protectedIncidentCount: 1,
            candidateEvidenceCount: 3,
            candidateReclaimableBytes: 8192,
            candidateIncidentIds: ["inc-1", "inc-2"],
            candidateEvidenceIds: [],
          };
        }
        if (channel === "openlens:incident:set-retention-policy") {
          return {
            id: "default",
            ...args[0],
            updatedAt: "2026-11-05T10:05:00Z",
          };
        }
        if (channel === "openlens:incident:execute-purge" || channel === "openlens:incident:execute-manual-purge") {
          return {
            success: true,
            deletedIncidentCount: 2,
            deletedTimelineCount: 2,
            deletedEvidenceCount: 3,
            reclaimedBytes: 8192,
            executedAt: "2026-11-05T10:06:00Z",
          };
        }
        if (channel === "openlens:incident:list") {
          return [];
        }
        return null;
      }),
    };

    store = new IncidentStore(mockIpc);
  });

  const renderComponent = () => {
    return render(
      <DiContextProvider value={{ di }}>
        <NonInjectedIncidentRetentionPreference store={store} />
      </DiContextProvider>,
    );
  };

  it("renders with initial policy (disabled by default) and displays metrics", async () => {
    renderComponent();

    expect(screen.getByText("Conservación y Purga de Incidentes Locales (H8-009)")).toBeInTheDocument();
    expect(screen.getByText("Purga Automática Deshabilitada")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("stat-candidate-incidents")).toHaveTextContent("2");
      expect(screen.getByTestId("stat-protected-incidents")).toHaveTextContent("1");
      expect(screen.getByTestId("stat-candidate-evidences")).toHaveTextContent("3");
      expect(screen.getByTestId("stat-reclaimable-bytes")).toHaveTextContent("8.0 KiB");
    });
  });

  it("allows selecting a retention period and saves policy to SQLite over IPC", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("retention-opt-30")).toBeInTheDocument();
    });

    // Select 30 days
    fireEvent.click(screen.getByTestId("retention-opt-30"));

    // Enable auto-purge
    const toggle = screen.getByTestId("enable-purge-toggle");
    fireEvent.click(toggle);

    // Save policy
    fireEvent.click(screen.getByTestId("save-retention-policy-btn"));

    await waitFor(() => {
      expect(mockIpc.invoke).toHaveBeenCalledWith(
        "openlens:incident:set-retention-policy",
        expect.objectContaining({
          strategy: "days",
          retentionDays: 30,
          enabled: true,
          protectPinned: true,
          purgeClosedOnly: true,
        }),
      );
      expect(screen.getByTestId("save-success-msg")).toHaveTextContent("Política de retención guardada correctamente.");
    });
  });

  it("opens confirmation modal before executing manual purge and calls executePurge", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("execute-purge-btn")).toBeInTheDocument();
    });

    // Click manual purge button
    fireEvent.click(screen.getByTestId("execute-purge-btn"));

    // Confirm modal opens
    expect(screen.getByTestId("confirm-purge-modal")).toBeInTheDocument();
    expect(screen.getByText("¿Confirmar eliminación permanente?")).toBeInTheDocument();

    // Confirm execution
    fireEvent.click(screen.getByTestId("confirm-execute-purge-btn"));

    await waitFor(() => {
      expect(mockIpc.invoke).toHaveBeenCalledWith("openlens:incident:execute-manual-purge", {
        confirmedCandidateIds: ["inc-1", "inc-2"],
      });
      expect(screen.queryByTestId("confirm-purge-modal")).not.toBeInTheDocument();
    });
  });
});
