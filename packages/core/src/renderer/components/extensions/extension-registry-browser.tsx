/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Button } from "@openlens/button";
import { Input } from "../input";
import { SubTitle } from "../layout/sub-title";
import getBaseRegistryUrlInjectable from "./get-base-registry-url/get-base-registry-url.injectable";
import type { AttemptInstallByInfo } from "./attempt-install-by-info.injectable";
import attemptInstallByInfoInjectable from "./attempt-install-by-info.injectable";
import downloadJsonInjectable from "../../../common/fetch/download-json/normal.injectable";
import type { DownloadJson } from "../../../common/fetch/download-json/normal.injectable";
import type { ExtensionInstallationStateStore } from "../../../extensions/extension-installation-state-store/extension-installation-state-store";
import extensionInstallationStateStoreInjectable from "../../../extensions/extension-installation-state-store/extension-installation-state-store.injectable";

interface RegistrySearchObject {
  package: {
    name: string;
    version: string;
    description?: string;
    publisher?: { username?: string };
  };
}

interface RegistrySearchResponse {
  objects?: RegistrySearchObject[];
}

interface Dependencies {
  getBaseRegistryUrl: () => Promise<string>;
  attemptInstallByInfo: AttemptInstallByInfo;
  downloadJson: DownloadJson;
  installState: ExtensionInstallationStateStore;
}

const NonInjectedExtensionRegistryBrowser = observer(({
  getBaseRegistryUrl,
  attemptInstallByInfo,
  downloadJson,
  installState,
}: Dependencies) => {
  const [query, setQuery] = useState("lens-extension");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RegistrySearchObject[] | null>(null);

  const handleSearch = async () => {
    const trimmed = query.trim();

    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const baseUrl = (await getBaseRegistryUrl()).replace(/\/$/, "");
      const searchUrl = `${baseUrl}/-/v1/search?text=${encodeURIComponent(trimmed)}&size=15`;
      const response = await downloadJson(searchUrl);

      if (!response.callWasSuccessful) {
        setError(response.error ?? "Failed to query extension registry");
        setResults([]);
      } else {
        const data = response.response as RegistrySearchResponse;

        setResults(Array.isArray(data?.objects) ? data.objects : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section data-testid="extension-registry-browser" style={{ marginTop: "16px" }}>
      <SubTitle title="Extension Registry Browser" />
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
        <Input
          theme="round-black"
          value={query}
          onChange={setQuery}
          onKeyDown={(evt) => {
            if (evt.key === "Enter") {
              handleSearch().catch(() => {});
            }
          }}
          placeholder="Search extensions in configured npm registry..."
          data-testid="extension-registry-search-input"
        />
        <Button
          primary
          label={loading ? "Searching..." : "Browse Registry"}
          disabled={loading || !query.trim()}
          onClick={() => {
            handleSearch().catch(() => {});
          }}
          data-testid="extension-registry-search-btn"
        />
      </div>
      {error && (
        <div role="alert" style={{ color: "var(--colorError)", fontSize: "12px", marginBottom: "8px" }}>
          {error}
        </div>
      )}
      {results && results.length === 0 && !loading && !error && (
        <div className="hint" data-testid="extension-registry-empty">
          No extensions matched "{query}".
        </div>
      )}
      {results && results.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            maxHeight: "260px",
            overflowY: "auto",
            border: "1px solid var(--borderColor)",
            borderRadius: "4px",
            padding: "8px",
          }}
          data-testid="extension-registry-results"
        >
          {results.map(({ package: pkg }) => (
            <div
              key={pkg.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                padding: "6px 8px",
                borderBottom: "1px solid var(--borderFaintColor)",
              }}
              data-testid={`registry-pkg-${pkg.name}`}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>
                  {pkg.name}
                  {" "}
                  <span style={{ fontWeight: 400, opacity: 0.7 }}>v{pkg.version}</span>
                </div>
                {pkg.description && (
                  <div style={{ fontSize: "12px", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pkg.description}
                  </div>
                )}
              </div>
              <Button
                primary
                label="Install"
                disabled={installState.anyInstalling}
                onClick={() => {
                  attemptInstallByInfo({ name: pkg.name, version: pkg.version, requireConfirmation: true }).catch(() => {});
                }}
                data-testid={`registry-install-${pkg.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
});

export const ExtensionRegistryBrowser = withInjectables<Dependencies>(NonInjectedExtensionRegistryBrowser, {
  getProps: (di) => ({
    getBaseRegistryUrl: di.inject(getBaseRegistryUrlInjectable),
    attemptInstallByInfo: di.inject(attemptInstallByInfoInjectable),
    downloadJson: di.inject(downloadJsonInjectable),
    installState: di.inject(extensionInstallationStateStoreInjectable),
  }),
});
