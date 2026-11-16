/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useState } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { SubTitle } from "../../../../../renderer/components/layout/sub-title";
import { Switch } from "../../../../../renderer/components/switch";
import { Input } from "../../../../../renderer/components/input";
import { Select } from "../../../../../renderer/components/select";
import type { UserPreferencesState } from "../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../user-preferences/common/state.injectable";

export const aiToolSelectionKey = "novakube:external-tools:ai-tool";
export const aiAllowUiAccessKey = "novakube:external-tools:allow-ai-ui";
export const aiOpenExternallyKey = "novakube:external-tools:open-externally";
export const aiExternalTerminalCmdKey = "novakube:external-tools:external-command";

const aiToolOptions = [
  { value: "claude-code", label: "Claude Code (claude)" },
  { value: "copilot-cli", label: "GitHub Copilot CLI" },
  { value: "gemini-cli", label: "Gemini CLI (gemini)" },
  { value: "codex-cli", label: "Codex CLI (codex)" },
  { value: "custom", label: "Custom Command" },
];

function readStr(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const val = window.localStorage.getItem(key);
    return val === null ? fallback : val === "true";
  } catch {
    return fallback;
  }
}

interface Dependencies {
  state: UserPreferencesState;
}

const NonInjectedExternalToolsSettings = observer(({ state }: Dependencies) => {
  const [aiTool, setAiTool] = useState(() => readStr(aiToolSelectionKey, "claude-code"));
  const [allowAiUi, setAllowAiUi] = useState(() => readBool(aiAllowUiAccessKey, false));
  const [openExternally, setOpenExternally] = useState(() => readBool(aiOpenExternallyKey, false));
  const [externalCmd, setExternalCmd] = useState(() => readStr(aiExternalTerminalCmdKey, ""));

  const saveStr = (key: string, val: string, setter: (v: string) => void) => {
    setter(val);
    try { window.localStorage.setItem(key, val); } catch {}
  };
  const saveBool = (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val);
    try { window.localStorage.setItem(key, String(val)); } catch {}
  };

  return (
    <div data-testid="external-tools-preferences-section">
      <section id="external-tools-ai-tools">
        <SubTitle title="AI Tools" />
        <Select
          id="external-tools-ai-select"
          options={aiToolOptions}
          value={aiTool}
          onChange={(opt) => opt && saveStr(aiToolSelectionKey, opt.value, setAiTool)}
        />
        <div className="hint" style={{ marginTop: 6, marginBottom: 12 }}>
          Select your preferred AI coding CLI launched from Lens or terminal tabs.
        </div>
        <Switch
          checked={allowAiUi}
          onChange={(checked) => saveBool(aiAllowUiAccessKey, checked, setAllowAiUi)}
          data-testid="external-tools-allow-ai-ui-switch"
        >
          Allow AI to access UI by default
        </Switch>
        <div style={{ height: 10 }} />
        <Switch
          checked={openExternally}
          onChange={(checked) => saveBool(aiOpenExternallyKey, checked, setOpenExternally)}
          data-testid="external-tools-open-externally-switch"
        >
          Open AI tools in an external terminal
        </Switch>
        <div style={{ marginTop: 12 }}>
          <SubTitle title="External terminal command" />
          <Input
            theme="round-black"
            value={externalCmd}
            onChange={(val) => saveStr(aiExternalTerminalCmdKey, val, setExternalCmd)}
            placeholder="{command}"
            data-testid="external-tools-command-input"
          />
          <div className="hint">
            Supports placeholders <code>{"{command}"}</code>, <code>{"{directory}"}</code>, and <code>{"{title}"}</code>. Leave empty for system default.
          </div>
        </div>
      </section>
      <hr className="small" />
    <section id="external-tools-kubectl">
      <SubTitle title="Kubectl Binary Management" />
      <Switch
        checked={state.downloadKubectlBinaries ?? true}
        onChange={() => (state.downloadKubectlBinaries = !(state.downloadKubectlBinaries ?? true))}
        data-testid="external-tools-download-kubectl-switch"
      >
        Automatically download matching kubectl binaries
      </Switch>
      <div className="hint" style={{ marginBottom: "12px" }}>
        Download and manage version-matched kubectl binaries for connected clusters.
      </div>
      <SubTitle title="Path to kubectl Binary" />
      <Input
        theme="round-black"
        value={state.kubectlBinariesPath ?? ""}
        onChange={(value) => (state.kubectlBinariesPath = value || undefined)}
        placeholder="Default managed kubectl binary"
        data-testid="external-tools-kubectl-path-input"
      />
    </section>
    <hr className="small" />
    <section id="external-tools-binaries-dir">
      <SubTitle title="Binaries Download Directory" />
      <Input
        theme="round-black"
        value={state.downloadBinariesPath ?? ""}
        onChange={(value) => (state.downloadBinariesPath = value || undefined)}
        placeholder="Default application binaries folder"
        data-testid="external-tools-binaries-dir-input"
      />
    </section>
    <hr className="small" />
    <section id="external-tools-shell">
      <SubTitle title="Default Terminal Shell" />
      <Input
        theme="round-black"
        value={state.shell ?? ""}
        onChange={(value) => (state.shell = value || undefined)}
        placeholder="System default (/bin/zsh)"
        data-testid="external-tools-shell-input"
      />
    </section>
  </div>
  );
});

export const ExternalToolsSettings = withInjectables<Dependencies>(NonInjectedExternalToolsSettings, {
  getProps: (di) => ({
    state: di.inject(userPreferencesStateInjectable),
  }),
});
