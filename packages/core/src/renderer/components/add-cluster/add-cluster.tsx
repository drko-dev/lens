/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./add-cluster.module.scss";

import type { KubeConfig } from "@kubernetes/client-node";
import fse from "fs-extra";
import path from "path";
import { debounce } from "lodash";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import * as uuid from "uuid";
import { loadConfigFromString, splitConfig } from "../../../common/kube-helpers";
import { isValidKubeconfigForFileImport } from "../../../common/kube-helpers/validate-file-import";
import { docsUrl } from "../../../common/vars";
import { isDefined, iter } from "@openlens/utilities";
import { Button } from "@openlens/button";
import type { ShowNotification } from "../notifications";
import { SettingLayout } from "../layout/setting-layout";
import { MonacoEditor } from "../monaco-editor";
import { PathPicker } from "../path-picker/path-picker";
import { withInjectables } from "@ogre-tools/injectable-react";
import getCustomKubeConfigFilePathInjectable from "../../../common/app-paths/get-custom-kube-config-directory/get-custom-kube-config-directory.injectable";
import type { NavigateToCatalog } from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import navigateToCatalogInjectable from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import type { EmitAppEvent } from "../../../common/app-event-bus/emit-event.injectable";
import emitAppEventInjectable from "../../../common/app-event-bus/emit-event.injectable";
import type { GetDirnameOfPath } from "../../../common/path/get-dirname.injectable";
import getDirnameOfPathInjectable from "../../../common/path/get-dirname.injectable";
import showSuccessNotificationInjectable from "../notifications/show-success-notification.injectable";
import showErrorNotificationInjectable from "../notifications/show-error-notification.injectable";
import addSyncEntriesInjectable from "../../initializers/add-sync-entries.injectable";
import ensureKubeconfigSyncActiveInjectable from "./ensure-sync-active.injectable";

interface Option {
  config: KubeConfig;
  error?: string;
}

interface Dependencies {
  getCustomKubeConfigDirectory: (directoryName: string) => string;
  navigateToCatalog: NavigateToCatalog;
  getDirnameOfPath: GetDirnameOfPath;
  emitAppEvent: EmitAppEvent;
  showSuccessNotification: ShowNotification;
  showErrorNotification: ShowNotification;
  addSyncEntries: (paths: string[]) => Promise<void>;
  ensureKubeconfigSyncActive: (filePath: string) => Promise<void>;
}

function getContexts(config: KubeConfig): Map<string, Option> {
  return new Map(
    splitConfig(config)
      .map(({ config, validationResult }) => [config.currentContext, {
        config,
        error: validationResult.error?.toString(),
      }]),
  );
}

@observer
class NonInjectedAddCluster extends React.Component<Dependencies> {
  @observable kubeContexts = observable.map<string, Option>();
  @observable customConfig = "";
  @observable selectedKubeconfigPath = "";
  @observable isWaiting = false;
  @observable isImportingFile = false;
  @observable errors: string[] = [];

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    this.props.emitAppEvent({ name: "cluster-add", action: "start" });
  }

  @computed get allErrors(): string[] {
    return [
      ...this.errors,
      ...iter.map(this.kubeContexts.values(), ({ error }) => error),
    ].filter(isDefined);
  }

  readonly refreshContexts = debounce(action(() => {
    const value = this.customConfig.trim();

    this.errors.length = 0;

    if (value.startsWith("/") && !value.includes("\n")) {
      this.kubeContexts.clear();
      this.errors.push("This looks like a file path. Use Import kubeconfig file instead of pasting the path into the YAML editor.");

      return;
    }

    const { config, error } = loadConfigFromString(value || "{}");

    this.kubeContexts.replace(getContexts(config));

    if (error) {
      this.errors.push(error.toString());
    }

    if (config.contexts.length === 0) {
      this.errors.push('No contexts defined, either missing the "contexts" field, or it is empty.');
    }
  }), 500);

  // Import a kubeconfig from its original path. Keep certificate/key data
  // out of the Monaco editor and avoid copying secrets into another file.
  // The existing kubeconfig sync manager owns watching and catalog discovery.
  importKubeconfigFile = action(async (paths: string[]) => {
    if (this.isImportingFile || paths.length !== 1) {
      return;
    }

    this.isImportingFile = true;

    try {
      const filePath = paths[0].trim();

      if (!path.isAbsolute(filePath)) {
        this.props.showErrorNotification("Enter an absolute kubeconfig file path.");

        return;
      }

      const content = await fse.readFile(filePath, { encoding: "utf8" });

      if (!isValidKubeconfigForFileImport(content)) {
        this.props.showErrorNotification("Selected kubeconfig has no valid Kubernetes contexts.");

        return;
      }

      await this.props.ensureKubeconfigSyncActive(filePath);
      await this.props.addSyncEntries([filePath]);
      this.props.navigateToCatalog();
    } catch {
      // Do not propagate file contents, private keys, or parser details into
      // user-visible notifications or application logs.
      this.props.showErrorNotification("Could not read or import the selected kubeconfig file.");
    } finally {
      runInAction(() => {
        this.isImportingFile = false;
      });
    }
  });

  addClusters = action(async () => {
    this.isWaiting = true;
    this.props.emitAppEvent({ name: "cluster-add", action: "click" });

    try {
      const absPath = this.props.getCustomKubeConfigDirectory(uuid.v4());

      await fse.ensureDir(this.props.getDirnameOfPath(absPath));
      await fse.writeFile(absPath, this.customConfig.trim(), { encoding: "utf-8", mode: 0o600 });

      this.props.showSuccessNotification(`Successfully added ${this.kubeContexts.size} new cluster(s)`);

      return this.props.navigateToCatalog();
    } catch (error) {
      this.props.showErrorNotification(`Failed to add clusters: ${error}`);
    }
  });

  render() {
    return (
      <SettingLayout className={styles.AddClusters} data-testid="add-cluster-page">
        <h2>Add Clusters from Kubeconfig</h2>
        <p>
          {"Clusters added here are  "}
          <b>not</b>
          {" merged into the "}
          <code>~/.kube/config</code>
          {" file. "}
          <a
            href={`${docsUrl}/getting-started/add-cluster/`}
            rel="noreferrer"
            target="_blank"
          >
            Read more about adding clusters.
          </a>
        </p>
        <div className={styles.fileImport}>
          <p>Import a kubeconfig file directly, or paste its YAML contents below. Selecting a file keeps it at its original location and watches for updates.</p>
          <label htmlFor="add-cluster-kubeconfig-path">Kubeconfig file path</label>
          <div className={styles.filePathActions}>
            <input
              id="add-cluster-kubeconfig-path"
              data-testid="add-cluster-file-path"
              type="text"
              value={this.selectedKubeconfigPath}
              placeholder="/Users/you/.kube/cluster.yaml"
              onChange={event => this.selectedKubeconfigPath = event.target.value}
              disabled={this.isImportingFile}
              spellCheck={false}
            />
            <Button
              label="Import path"
              data-testid="add-cluster-import-path"
              disabled={!this.selectedKubeconfigPath.trim() || this.isImportingFile}
              waiting={this.isImportingFile}
              onClick={() => void this.importKubeconfigFile([this.selectedKubeconfigPath])}
            />
          </div>
          <PathPicker
            message="Import kubeconfig file..."
            buttonLabel="Import"
            properties={["openFile", "showHiddenFiles"]}
            onPick={this.importKubeconfigFile}
            disabled={this.isImportingFile || this.isWaiting}
          />
        </div>
        <div className="flex column">
          <MonacoEditor
            autoFocus
            className={styles.editor}
            value={this.customConfig}
            onChange={value => {
              this.customConfig = value;
              this.errors.length = 0;
              this.refreshContexts();
            }}
          />
        </div>
        {this.allErrors.length > 0 && (
          <>
            <h3>KubeConfig Yaml Validation Errors:</h3>
            {this.allErrors.map(error => <div key={error} className="error">{error}</div>)}
          </>
        )}
        <div className="actions-panel">
          <Button
            primary
            disabled={this.kubeContexts.size === 0}
            label={this.kubeContexts.size === 1 ? "Add cluster" : "Add clusters"}
            onClick={this.addClusters}
            waiting={this.isWaiting}
            tooltip={this.kubeContexts.size === 0 || "Paste in at least one cluster to add."}
            tooltipOverrideDisabled
          />
        </div>
      </SettingLayout>
    );
  }
}

export const AddCluster = withInjectables<Dependencies>(NonInjectedAddCluster, {
  getProps: (di) => ({
    getCustomKubeConfigDirectory: di.inject(getCustomKubeConfigFilePathInjectable),
    navigateToCatalog: di.inject(navigateToCatalogInjectable),
    getDirnameOfPath: di.inject(getDirnameOfPathInjectable),
    emitAppEvent: di.inject(emitAppEventInjectable),
    showSuccessNotification: di.inject(showSuccessNotificationInjectable),
    showErrorNotification: di.inject(showErrorNotificationInjectable),
    addSyncEntries: di.inject(addSyncEntriesInjectable),
    ensureKubeconfigSyncActive: di.inject(ensureKubeconfigSyncActiveInjectable),
  }),
});
