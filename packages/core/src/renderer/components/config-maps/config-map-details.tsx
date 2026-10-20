/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./config-map-details.scss";

import React from "react";
import { action, autorun, makeObservable, observable, runInAction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import { DrawerTitle } from "../drawer";
import type { ShowNotification } from "../notifications";
import { Button } from "@openlens/button";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { ConfigMap } from "@openlens/kube-object";
import type { Logger } from "@openlens/logger";
import type { ConfigMapStore } from "./store";
import { withInjectables } from "@ogre-tools/injectable-react";
import configMapStoreInjectable from "./store.injectable";
import showSuccessNotificationInjectable from "../notifications/show-success-notification.injectable";
import showErrorNotificationInjectable from "../notifications/show-error-notification.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import { MonacoEditor } from "../monaco-editor";
import { getErrorMessage } from "../../../common/utils/get-error-message";
import type { KeyModificationStatus, KeyValueConflictSummary } from "../kube-object-details/inline-resource-save-helper";
import {
  describeKeyValueConflict,
  findUnpersistedKeys,
  getChangedKeys,
  hasUnsavedKeyChanges,
  isForbiddenError,
  isNotFoundError,
  isSaveConflictError,
  isUnoverriddenTestDependencyError,
  mergeDraftKeysOntoRemote,
  normalizeConfigMapData,
} from "../kube-object-details/inline-resource-save-helper";

export interface ConfigMapDetailsProps extends KubeObjectDetailsProps<ConfigMap> {
}

interface Dependencies {
  configMapStore: ConfigMapStore;
  logger: Logger;
  showSuccessNotification: ShowNotification;
  showErrorNotification: ShowNotification;
}

const formatKeyList = (keys: string[] | undefined) => (
  keys === undefined
    ? "unknown (could not read cluster version)"
    : keys.join(", ") || "none"
);

const formatKeyStatus = (status: KeyModificationStatus): string => {
  switch (status) {
    case "conflict-both-modified":
      return "conflict (modified in both)";
    case "modified-remotely":
      return "modified in cluster";
    case "modified-locally":
      return "modified locally";
  }
};

@observer
class NonInjectedConfigMapDetails extends React.Component<ConfigMapDetailsProps & Dependencies> {
  @observable isSaving = false;
  @observable data = observable.map<string, string | undefined>();
  @observable.ref conflict: KeyValueConflictSummary | undefined = undefined;

  private baseUid: string | undefined = undefined;
  private baseResourceVersion: string | undefined = undefined;
  private baseData: Record<string, string | undefined> = {};
  private latestClusterConfigMap: ConfigMap | undefined = undefined;

  constructor(props: ConfigMapDetailsProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  private getDraftRecord(): Record<string, string | undefined> {
    return Object.fromEntries(this.data);
  }

  @action
  private applyBaselineFromConfigMap(configMap: ConfigMap) {
    const normalized = normalizeConfigMapData(configMap.data);

    this.baseUid = configMap.getId();
    this.baseResourceVersion = configMap.getResourceVersion();
    this.baseData = { ...normalized };
    this.data.replace(normalized);
    this.latestClusterConfigMap = configMap;
    this.conflict = undefined;
  }

  componentDidMount() {
    disposeOnUnmount(this, [
      autorun(() => {
        const { object: configMap } = this.props;

        if (!configMap || !(configMap instanceof ConfigMap)) {
          return;
        }

        const incomingUid = configMap.getId();
        const incomingResourceVersion = configMap.getResourceVersion();
        const incomingData = normalizeConfigMapData(configMap.data);

        this.latestClusterConfigMap = configMap;

        const isDifferentResource = this.baseUid !== incomingUid;

        if (isDifferentResource) {
          this.applyBaselineFromConfigMap(configMap);

          return;
        }

        const currentDraft = this.getDraftRecord();
        const isDirty = hasUnsavedKeyChanges(this.baseData, currentDraft);

        // Preserve unsaved user edits and active conflict state when store updates arrive
        if (isDirty || this.conflict) {
          return;
        }

        if (
          incomingResourceVersion !== this.baseResourceVersion
          || hasUnsavedKeyChanges(this.baseData, incomingData)
        ) {
          this.applyBaselineFromConfigMap(configMap);
        }
      }),
    ]);
  }

  private async fetchLatestRemoteConfigMap(configMap: ConfigMap): Promise<{
    configMap?: ConfigMap;
    deleted?: boolean;
    error?: string;
  }> {
    const api = this.props.configMapStore.api;

    if (api?.get) {
      try {
        const remote = await api.get({
          name: configMap.getName(),
          namespace: configMap.getNs(),
        });

        if (!remote) {
          return { deleted: true };
        }

        return { configMap: remote };
      } catch (error) {
        if (isNotFoundError(error)) {
          return { deleted: true };
        }

        if (!isUnoverriddenTestDependencyError(error)) {
          return {
            error: getErrorMessage(error),
          };
        }
      }
    }

    const fromStore = this.props.configMapStore.getByName?.(configMap.getName(), configMap.getNs())
      ?? this.latestClusterConfigMap
      ?? this.props.object;

    if (fromStore && fromStore.getResourceVersion() !== this.baseResourceVersion) {
      return { configMap: fromStore };
    }

    return {};
  }

  private async verifyPersistedConfigMap(
    configMap: ConfigMap,
    updatedFromPut: ConfigMap | undefined,
  ): Promise<{ persisted?: ConfigMap; readError?: string }> {
    const api = this.props.configMapStore.api;

    if (api?.get) {
      try {
        const readBack = await api.get({
          name: configMap.getName(),
          namespace: configMap.getNs(),
        });

        if (!readBack) {
          return { readError: "Resource could not be found after saving" };
        }

        return { persisted: readBack };
      } catch (error) {
        if (isUnoverriddenTestDependencyError(error)) {
          if (updatedFromPut instanceof ConfigMap) {
            return { persisted: updatedFromPut };
          }
        }

        return {
          readError: getErrorMessage(error),
        };
      }
    }

    if (updatedFromPut instanceof ConfigMap) {
      return { persisted: updatedFromPut };
    }

    return { readError: "No persisted ConfigMap returned by store" };
  }

  private async handleConflict(configMap: ConfigMap, draftSnapshot: Record<string, string | undefined>) {
    const remoteResult = await this.fetchLatestRemoteConfigMap(configMap);
    const remoteConfigMap = remoteResult.configMap;
    const remoteData = remoteConfigMap ? normalizeConfigMapData(remoteConfigMap.data) : undefined;
    const uidChanged = Boolean(
      remoteConfigMap && this.baseUid && remoteConfigMap.getId() !== this.baseUid,
    );

    if (remoteConfigMap) {
      this.latestClusterConfigMap = remoteConfigMap;
    }

    runInAction(() => {
      this.conflict = describeKeyValueConflict(
        this.baseData,
        draftSnapshot,
        remoteData,
        {
          remoteResourceVersion: remoteConfigMap?.getResourceVersion(),
          remoteDeleted: remoteResult.deleted,
          uidChanged,
        },
      );
    });

    this.props.showErrorNotification(
      `ConfigMap "${configMap.getName()}" was modified in the cluster after you started editing. Nothing was saved and your draft was kept.`,
    );
  }

  reloadClusterVersion = async () => {
    const { object: configMap } = this.props;

    if (!configMap) {
      return;
    }

    const remoteResult = await this.fetchLatestRemoteConfigMap(configMap);
    const targetConfigMap = remoteResult.configMap ?? (
      this.latestClusterConfigMap && this.latestClusterConfigMap.getResourceVersion() !== this.baseResourceVersion
        ? this.latestClusterConfigMap
        : undefined
    );

    if (!targetConfigMap) {
      this.props.showErrorNotification(
        `Could not reload the current cluster version of ConfigMap "${configMap.getName()}"${remoteResult.error ? `: ${remoteResult.error}` : ""}. Your local draft was kept.`,
      );

      return;
    }

    this.applyBaselineFromConfigMap(targetConfigMap);
  };

  reapplyOnClusterVersion = async () => {
    const { object: configMap } = this.props;

    if (!configMap) {
      return;
    }

    const draftSnapshot = this.getDraftRecord();
    const remoteResult = await this.fetchLatestRemoteConfigMap(configMap);
    const targetConfigMap = remoteResult.configMap ?? (
      this.latestClusterConfigMap && this.latestClusterConfigMap.getResourceVersion() !== this.baseResourceVersion
        ? this.latestClusterConfigMap
        : undefined
    );

    if (!targetConfigMap) {
      this.props.showErrorNotification(
        `Could not read the current cluster version of ConfigMap "${configMap.getName()}"${remoteResult.error ? `: ${remoteResult.error}` : ""}. Your local draft was kept.`,
      );

      return;
    }

    if (this.baseUid && targetConfigMap.getId() !== this.baseUid) {
      this.props.showErrorNotification(
        `Cannot re-apply changes automatically because ConfigMap "${configMap.getName()}" was deleted and recreated with a different UID. Your local draft was kept.`,
      );

      return;
    }

    const remoteData = normalizeConfigMapData(targetConfigMap.data);
    const mergedData = mergeDraftKeysOntoRemote(this.baseData, draftSnapshot, remoteData);

    runInAction(() => {
      this.baseUid = targetConfigMap.getId();
      this.baseResourceVersion = targetConfigMap.getResourceVersion();
      this.baseData = { ...remoteData };
      this.data.replace(mergedData);
      this.latestClusterConfigMap = targetConfigMap;
      this.conflict = undefined;
    });
  };

  save = () => {
    const { object: configMap, configMapStore } = this.props;

    if (!configMap) {
      return;
    }

    void (async () => {
      if (!this.baseResourceVersion) {
        this.props.showErrorNotification(
          `Cannot save ConfigMap "${configMap.getName()}": the originally loaded resourceVersion is unknown. Reload the ConfigMap and try again.`,
        );

        return;
      }

      const draftSnapshot = this.getDraftRecord();
      const changedKeys = getChangedKeys(this.baseData, draftSnapshot);

      try {
        runInAction(() => {
          this.isSaving = true;
        });

        const updated = await configMapStore.update(configMap, {
          ...configMap,
          metadata: {
            ...configMap.metadata,
            resourceVersion: this.baseResourceVersion,
            ...(this.baseUid ? { uid: this.baseUid } : {}),
          },
          data: draftSnapshot,
        });

        const verification = await this.verifyPersistedConfigMap(configMap, updated);

        if (!verification.persisted) {
          this.props.showErrorNotification(
            `ConfigMap "${configMap.getName()}" was accepted by the API server, but reading back the persisted state failed${verification.readError ? `: ${verification.readError}` : ""}. Your draft was kept; reload before editing again.`,
          );

          return;
        }

        const persistedConfigMap = verification.persisted;
        const persistedData = normalizeConfigMapData(persistedConfigMap.data);
        const unpersistedKeys = findUnpersistedKeys(draftSnapshot, persistedData, changedKeys);

        runInAction(() => {
          this.baseUid = persistedConfigMap.getId();
          this.baseResourceVersion = persistedConfigMap.getResourceVersion();
          this.baseData = { ...persistedData };
          this.data.replace(persistedData);
          this.latestClusterConfigMap = persistedConfigMap;
          this.conflict = undefined;
        });

        if (unpersistedKeys.length > 0) {
          this.props.showErrorNotification(
            `ConfigMap "${configMap.getName()}" was saved, but some keys differed in the persisted cluster state: ${unpersistedKeys.join(", ")}. Showing persisted version.`,
          );

          return;
        }

        this.props.showSuccessNotification((
          <p>
            {"ConfigMap "}
            <b>{configMap.getName()}</b>
            {" successfully updated."}
          </p>
        ));
      } catch (error) {
        if (isSaveConflictError(error)) {
          await this.handleConflict(configMap, draftSnapshot);
        } else if (isForbiddenError(error)) {
          this.props.showErrorNotification(
            `Permission denied (403 Forbidden) while updating ConfigMap "${configMap.getName()}". Your local changes were kept.`,
          );
        } else if (isNotFoundError(error)) {
          runInAction(() => {
            this.conflict = describeKeyValueConflict(this.baseData, draftSnapshot, undefined, {
              remoteDeleted: true,
            });
          });
          this.props.showErrorNotification(
            `ConfigMap "${configMap.getName()}" no longer exists in the cluster (404 Not Found). Your local draft was kept.`,
          );
        } else {
          this.props.showErrorNotification(`Failed to save config map: ${getErrorMessage(error)}`);
        }
      } finally {
        runInAction(() => {
          this.isSaving = false;
        });
      }
    })();
  };

  renderConflictNotice() {
    const { conflict } = this;

    if (!conflict) {
      return null;
    }

    return (
      <div
        className="conflict-notice flex column gaps"
        data-testid="config-map-conflict-notice"
      >
        <b>
          {conflict.remoteDeleted
            ? "Conflict: this ConfigMap was deleted in the cluster. Nothing was saved and your draft was kept."
            : "Conflict: this ConfigMap changed in the cluster while you were editing. Nothing was saved and your draft was kept."}
        </b>
        {conflict.uidChanged && (
          <span data-testid="config-map-conflict-uid-warning">
            Warning: the ConfigMap in the cluster has a different UID (it was deleted and recreated).
          </span>
        )}
        <span data-testid="config-map-conflict-remote-keys">
          {`Keys changed in cluster: ${formatKeyList(conflict.remoteChangedKeys)}`}
        </span>
        <span data-testid="config-map-conflict-local-keys">
          {`Keys changed by you: ${formatKeyList(conflict.localChangedKeys)}`}
        </span>
        {conflict.overlappingKeys.length > 0 && (
          <span data-testid="config-map-conflict-overlapping-keys">
            {`Conflicting keys (modified in both): ${formatKeyList(conflict.overlappingKeys)}`}
          </span>
        )}
        {conflict.keyDetails.length > 0 && (
          <div className="conflict-key-list" data-testid="config-map-conflict-key-details">
            {conflict.keyDetails.map(({ key, status }) => (
              <div
                key={key}
                data-testid={`config-map-conflict-key-status-${key}`}
              >
                {`${key}: ${formatKeyStatus(status)}`}
              </div>
            ))}
          </div>
        )}
        <div className="flex gaps">
          <Button
            outlined
            label="Reload cluster version"
            data-testid="reload-remote-config-map"
            onClick={() => void this.reloadClusterVersion()}
          />
          {!conflict.remoteDeleted && (
            <Button
              primary
              label="Re-apply my changes on cluster version"
              data-testid="reapply-changes-config-map"
              onClick={() => void this.reapplyOnClusterVersion()}
            />
          )}
        </div>
      </div>
    );
  }

  render() {
    const { object: configMap, logger } = this.props;

    if (!configMap) {
      return null;
    }

    if (!(configMap instanceof ConfigMap)) {
      logger.error("[ConfigMapDetails]: passed object that is not an instanceof ConfigMap", configMap);

      return null;
    }

    const data = Array.from(this.data.entries());

    return (
      <div className="ConfigMapDetails">
        {
          data.length > 0 && (
            <>
              <DrawerTitle>Data</DrawerTitle>
              {this.renderConflictNotice()}
              {
                data.map(([name, value = ""]) => (
                  <div
                    key={name}
                    className="data"
                    data-testid={`${name}-config-map-entry`}
                  >
                    <div className="name">{name}</div>
                    <MonacoEditor
                      id={`config-map-data-${name}`}
                      style={{
                        resize: "vertical",
                        overflow: "hidden",
                        border: "1px solid var(--borderFaintColor)",
                        borderRadius: "4px",
                      }}
                      value={value}
                      onChange={v => this.data.set(name, v)}
                      setInitialHeight
                      options={{
                        scrollbar: {
                          alwaysConsumeMouseWheel: false,
                        },
                      }}
                    />
                  </div>
                ))
              }
              <Button
                primary
                label="Save"
                waiting={this.isSaving}
                className="save-btn"
                data-testid="save-config-map-button"
                onClick={this.save}
              />
            </>
          )
        }
      </div>
    );
  }
}

export const ConfigMapDetails = withInjectables<Dependencies, ConfigMapDetailsProps>(NonInjectedConfigMapDetails, {
  getProps: (di, props) => ({
    ...props,
    configMapStore: di.inject(configMapStoreInjectable),
    showSuccessNotification: di.inject(showSuccessNotificationInjectable),
    showErrorNotification: di.inject(showErrorNotificationInjectable),
    logger: di.inject(loggerInjectionToken),
  }),
});
