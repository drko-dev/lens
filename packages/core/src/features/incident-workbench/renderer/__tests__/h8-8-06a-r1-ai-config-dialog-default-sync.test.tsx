/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { AiProviderConfigDialog } from "../ai-provider-config-dialog";
import { IncidentStore } from "../incident-store";
import { incidentIpcChannels } from "../../../../common/incident/incident-ipc";
import type { AiDefaultProviderStatus } from "../../../../common/incident/ai-profile-types";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { type DiRender, renderFor } from "../../../../renderer/components/test-utils/renderFor";

/**
 * H8.8-06a R1: the dialog selector must follow the backend default (demo profile created,
 * saved, removed, reopened) and Guardar must never clear a just-created default.
 */
describe("H8.8-06a R1 AiProviderConfigDialog: default selector sync", () => {
  const demoProfile = { id: "demo-probe", name: "Demo offline (sintético)", provider: "mock", model: "mock-v1", status: "active" };
  let backend: AiDefaultProviderStatus;
  let profiles: any[];
  let failChannel: string | null;
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;
  let render: DiRender;

  beforeEach(() => {
    backend = { state: "not_configured" } as AiDefaultProviderStatus;
    profiles = [];
    failChannel = null;
    mockIpc = {
      invoke: jest.fn(async (channel: string, arg?: any) => {
        if (channel === failChannel) throw new Error("boom");
        switch (channel) {
          case incidentIpcChannels.aiGetDefaultProvider:
            return backend;
          case incidentIpcChannels.aiListProfiles:
            return profiles;
          case incidentIpcChannels.aiEnsureDemoProfile:
            profiles = [demoProfile];
            backend = { state: "demo_offline", profile: demoProfile } as AiDefaultProviderStatus;
            return backend;
          case incidentIpcChannels.aiSetDefaultProvider:
            backend = arg.profileId
              ? ({ state: "demo_offline", profile: profiles.find(p => p.id === arg.profileId) } as AiDefaultProviderStatus)
              : ({ state: "not_configured" } as AiDefaultProviderStatus);
            return backend;
          default:
            return null;
        }
      }),
    };
    store = new IncidentStore(mockIpc as any);
    render = renderFor(getDiForUnitTesting());
  });

  const select = () => screen.getByTestId("ai-default-provider-select") as HTMLSelectElement;
  const setDefaultCalls = () => mockIpc.invoke.mock.calls.filter(c => c[0] === incidentIpcChannels.aiSetDefaultProvider);
  const openDialog = () => render(<AiProviderConfigDialog store={store} onClose={() => {}} />);

  it("Create Demo then Guardar keeps the profile (selector = demo-probe, never sends null)", async () => {
    openDialog();
    fireEvent.click(screen.getByTestId("create-demo-profile-btn"));
    await waitFor(() => expect(select().value).toBe("demo-probe"));

    fireEvent.click(screen.getByTestId("save-default-provider-btn"));
    await waitFor(() => expect(setDefaultCalls()).toHaveLength(1));

    expect(setDefaultCalls()[0][1]).toEqual({ profileId: "demo-probe" });
    expect(backend.profile?.id).toBe("demo-probe");
    expect(select().value).toBe("demo-probe");
  });

  it("reopening the dialog shows the saved default", async () => {
    profiles = [demoProfile];
    backend = { state: "demo_offline", profile: demoProfile } as AiDefaultProviderStatus;
    const first = openDialog();
    await waitFor(() => expect(select().value).toBe("demo-probe"));
    first.unmount();

    openDialog();
    await waitFor(() => expect(select().value).toBe("demo-probe"));
  });

  it("sends null only on the explicit remove action, and the selector follows", async () => {
    profiles = [demoProfile];
    backend = { state: "demo_offline", profile: demoProfile } as AiDefaultProviderStatus;
    openDialog();
    await waitFor(() => expect(select().value).toBe("demo-probe"));
    expect(setDefaultCalls()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("clear-default-provider-btn"));
    await waitFor(() => expect(setDefaultCalls()).toHaveLength(1));
    expect(setDefaultCalls()[0][1]).toEqual({ profileId: null });
    await waitFor(() => expect(select().value).toBe(""));

    // after remove, Guardar with the empty selection is an explicit null
    fireEvent.click(screen.getByTestId("save-default-provider-btn"));
    await waitFor(() => expect(setDefaultCalls()).toHaveLength(2));
    expect(setDefaultCalls()[1][1]).toEqual({ profileId: null });
  });

  it("does not clobber an unsaved user pick on unrelated re-renders", async () => {
    profiles = [demoProfile, { ...demoProfile, id: "other", name: "Other" }];
    backend = { state: "demo_offline", profile: demoProfile } as AiDefaultProviderStatus;
    openDialog();
    await waitFor(() => expect(select().value).toBe("demo-probe"));

    fireEvent.change(select(), { target: { value: "other" } });
    await store.loadAiProfiles();
    store.error = "unrelated";
    expect(select().value).toBe("other");
  });

  it("set-default failure goes through the store, keeps backend default and re-syncs the selector", async () => {
    profiles = [demoProfile, { ...demoProfile, id: "other", name: "Other" }];
    backend = { state: "demo_offline", profile: demoProfile } as AiDefaultProviderStatus;
    openDialog();
    await waitFor(() => expect(select().value).toBe("demo-probe"));

    fireEvent.change(select(), { target: { value: "other" } });
    failChannel = incidentIpcChannels.aiSetDefaultProvider;
    fireEvent.click(screen.getByTestId("save-default-provider-btn"));

    await waitFor(() => expect(store.error).toBe("boom"));
    await waitFor(() => expect(select().value).toBe("demo-probe"));
    expect(backend.profile?.id).toBe("demo-probe");
  });

  it("ensure-demo failure goes through the store and leaves the selector untouched", async () => {
    openDialog();
    failChannel = incidentIpcChannels.aiEnsureDemoProfile;
    fireEvent.click(screen.getByTestId("create-demo-profile-btn"));

    await waitFor(() => expect(store.error).toBe("boom"));
    expect(select().value).toBe("");
    expect(store.aiDefaultStatus.state).toBe("not_configured");
  });
});
