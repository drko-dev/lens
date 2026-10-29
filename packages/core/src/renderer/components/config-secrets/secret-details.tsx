/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./secret-details.scss";

import React from "react";
import { action, autorun, observable, makeObservable, runInAction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import { DrawerItem, DrawerTitle } from "../drawer";
import { Input } from "../input";
import { Button } from "@openlens/button";
import type { ShowNotification } from "../notifications";
import { base64, toggle } from "@openlens/utilities";
import { Icon } from "../icon";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { Secret } from "@openlens/kube-object";
import type { Logger } from "@openlens/logger";
import type { SecretStore } from "./store";
import { withInjectables } from "@ogre-tools/injectable-react";
import { loggerInjectionToken } from "@openlens/logger";
import secretStoreInjectable from "./store.injectable";
import showSuccessNotificationInjectable from "../notifications/show-success-notification.injectable";
import type { ShowCheckedErrorNotification } from "../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import showErrorNotificationInjectable from "../notifications/show-error-notification.injectable";
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
  normalizeSecretData,
  redactSecretValues,
} from "../kube-object-details/inline-resource-save-helper";

export interface SecretDetailsProps extends KubeObjectDetailsProps<Secret> {
}

interface Dependencies {
  secretStore: SecretStore;
  logger: Logger;
  showSuccessNotification: ShowNotification;
  showErrorNotification: ShowNotification;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
}

type SecretWithStringData = Secret & {
  stringData?: Partial<Record<string, string>>;
};

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
class NonInjectedSecretDetails extends React.Component<SecretDetailsProps & Dependencies> {
  @observable isSaving = false;
  @observable data: Partial<Record<string, string>> = {};
  @observable revealSecret = observable.set<string>();
  @observable.ref conflict: KeyValueConflictSummary | undefined = undefined;

  private baseUid: string | undefined = undefined;
  private baseResourceVersion: string | undefined = undefined;
  private baseData: Record<string, string | undefined> = {};
  private latestClusterSecret: Secret | undefined = undefined;

  constructor(props: SecretDetailsProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  private extractNormalizedData(secret: Secret): Record<string, string | undefined> {
    return normalizeSecretData(
      secret.data,
      (secret as SecretWithStringData).stringData,
    );
  }

  @action
  private applyBaselineFromSecret(secret: Secret, preserveReveal = false) {
    const normalized = this.extractNormalizedData(secret);

    this.baseUid = secret.getId();
    this.baseResourceVersion = secret.getResourceVersion();
    this.baseData = { ...normalized };
    this.data = { ...normalized };
    this.latestClusterSecret = secret;
    this.conflict = undefined;

    if (!preserveReveal) {
      this.revealSecret.clear();
    }
  }

  componentDidMount() {
    disposeOnUnmount(this, [
      autorun(() => {
        const { object: secret } = this.props;

        if (!secret || !(secret instanceof Secret)) {
          return;
        }

        // Touch observable fields so MobX tracks store updates on this resource
        const incomingUid = secret.getId();
        const incomingResourceVersion = secret.getResourceVersion();
        const incomingData = this.extractNormalizedData(secret);

        this.latestClusterSecret = secret;

        const isDifferentResource = this.baseUid !== incomingUid;

        if (isDifferentResource) {
          this.applyBaselineFromSecret(secret, false);

          return;
        }

        const isDirty = hasUnsavedKeyChanges(this.baseData, this.data);

        // Never overwrite unsaved user edits or an active conflict state when watch events arrive
        if (isDirty || this.conflict) {
          return;
        }

        if (
          incomingResourceVersion !== this.baseResourceVersion
          || hasUnsavedKeyChanges(this.baseData, incomingData)
        ) {
          this.applyBaselineFromSecret(secret, true);
        }
      }),
    ]);
  }

  private sanitizeMessage(rawMessage: string, extraData?: Record<string, string | undefined>): string {
    return redactSecretValues(rawMessage, [
      this.baseData,
      this.data,
      this.latestClusterSecret?.data,
      extraData,
    ]);
  }

  private async fetchLatestRemoteSecret(secret: Secret): Promise<{
    secret?: Secret;
    deleted?: boolean;
    error?: string;
  }> {
    const api = this.props.secretStore.api;

    if (api?.get) {
      try {
        const remote = await api.get({
          name: secret.getName(),
          namespace: secret.getNs(),
        });

        if (!remote) {
          return { deleted: true };
        }

        return { secret: remote };
      } catch (error) {
        if (isNotFoundError(error)) {
          return { deleted: true };
        }

        if (!isUnoverriddenTestDependencyError(error)) {
          return {
            error: this.sanitizeMessage(getErrorMessage(error)),
          };
        }
      }
    }

    const fromStore = this.props.secretStore.getByName?.(secret.getName(), secret.getNs())
      ?? this.latestClusterSecret
      ?? this.props.object;

    if (fromStore && fromStore.getResourceVersion() !== this.baseResourceVersion) {
      return { secret: fromStore };
    }

    return {};
  }

  private async verifyPersistedSecret(
    secret: Secret,
    updatedFromPut: Secret | undefined,
  ): Promise<{ persisted?: Secret; readError?: string }> {
    const api = this.props.secretStore.api;

    if (api?.get) {
      try {
        const readBack = await api.get({
          name: secret.getName(),
          namespace: secret.getNs(),
        });

        if (!readBack) {
          return { readError: "Resource could not be found after saving" };
        }

        return { persisted: readBack };
      } catch (error) {
        if (isUnoverriddenTestDependencyError(error)) {
          if (updatedFromPut instanceof Secret) {
            return { persisted: updatedFromPut };
          }
        }

        return {
          readError: this.sanitizeMessage(getErrorMessage(error)),
        };
      }
    }

    if (updatedFromPut instanceof Secret) {
      return { persisted: updatedFromPut };
    }

    return { readError: "No persisted Secret returned by store" };
  }

  private async handleConflict(secret: Secret, draftSnapshot: Record<string, string | undefined>) {
    const remoteResult = await this.fetchLatestRemoteSecret(secret);
    const remoteSecret = remoteResult.secret;
    const remoteData = remoteSecret ? this.extractNormalizedData(remoteSecret) : undefined;
    const uidChanged = Boolean(
      remoteSecret && this.baseUid && remoteSecret.getId() !== this.baseUid,
    );

    if (remoteSecret) {
      this.latestClusterSecret = remoteSecret;
    }

    runInAction(() => {
      this.conflict = describeKeyValueConflict(
        this.baseData,
        draftSnapshot,
        remoteData,
        {
          remoteResourceVersion: remoteSecret?.getResourceVersion(),
          remoteDeleted: remoteResult.deleted,
          uidChanged,
        },
      );
    });

    this.props.showErrorNotification(
      `Secret "${secret.getName()}" was modified in the cluster after you started editing. Nothing was saved and your draft was kept.`,
    );
  }

  reloadClusterVersion = async () => {
    const { object: secret } = this.props;

    if (!secret) {
      return;
    }

    const remoteResult = await this.fetchLatestRemoteSecret(secret);
    const targetSecret = remoteResult.secret ?? (
      this.latestClusterSecret && this.latestClusterSecret.getResourceVersion() !== this.baseResourceVersion
        ? this.latestClusterSecret
        : undefined
    );

    if (!targetSecret) {
      this.props.showErrorNotification(
        `Could not reload the current cluster version of Secret "${secret.getName()}"${remoteResult.error ? `: ${remoteResult.error}` : ""}. Your local draft was kept.`,
      );

      return;
    }

    this.applyBaselineFromSecret(targetSecret, false);
  };

  reapplyOnClusterVersion = async () => {
    const { object: secret } = this.props;

    if (!secret) {
      return;
    }

    const draftSnapshot = { ...this.data };
    const remoteResult = await this.fetchLatestRemoteSecret(secret);
    const targetSecret = remoteResult.secret ?? (
      this.latestClusterSecret && this.latestClusterSecret.getResourceVersion() !== this.baseResourceVersion
        ? this.latestClusterSecret
        : undefined
    );

    if (!targetSecret) {
      this.props.showErrorNotification(
        `Could not read the current cluster version of Secret "${secret.getName()}"${remoteResult.error ? `: ${remoteResult.error}` : ""}. Your local draft was kept.`,
      );

      return;
    }

    if (this.baseUid && targetSecret.getId() !== this.baseUid) {
      this.props.showErrorNotification(
        `Cannot re-apply changes automatically because Secret "${secret.getName()}" was deleted and recreated with a different UID. Your local draft was kept.`,
      );

      return;
    }

    const remoteData = this.extractNormalizedData(targetSecret);
    const mergedData = mergeDraftKeysOntoRemote(this.baseData, draftSnapshot, remoteData);

    runInAction(() => {
      this.baseUid = targetSecret.getId();
      this.baseResourceVersion = targetSecret.getResourceVersion();
      this.baseData = { ...remoteData };
      this.data = { ...mergedData };
      this.latestClusterSecret = targetSecret;
      this.conflict = undefined;
    });
  };

  saveSecret = () => {
    const { object: secret } = this.props;

    if (!secret) {
      return;
    }

    void (async () => {
      if (!this.baseResourceVersion) {
        this.props.showErrorNotification(
          `Cannot save Secret "${secret.getName()}": the originally loaded resourceVersion is unknown. Reload the Secret and try again.`,
        );

        return;
      }

      const draftSnapshot: Record<string, string | undefined> = { ...this.data };
      const changedKeys = getChangedKeys(this.baseData, draftSnapshot);

      runInAction(() => {
        this.isSaving = true;
      });

      try {
        const payload = {
          ...secret,
          metadata: {
            ...secret.metadata,
            resourceVersion: this.baseResourceVersion,
            ...(this.baseUid ? { uid: this.baseUid } : {}),
          },
          data: draftSnapshot,
          stringData: undefined,
        };

        const updated = await this.props.secretStore.update(secret, payload);
        const verification = await this.verifyPersistedSecret(secret, updated);

        if (!verification.persisted) {
          this.props.showErrorNotification(
            `Secret "${secret.getName()}" was accepted by the API server, but reading back the persisted state failed${verification.readError ? `: ${verification.readError}` : ""}. Your draft was kept; reload before editing again.`,
          );

          return;
        }

        const persistedSecret = verification.persisted;
        const persistedData = this.extractNormalizedData(persistedSecret);
        const unpersistedKeys = findUnpersistedKeys(draftSnapshot, persistedData, changedKeys);

        runInAction(() => {
          this.baseUid = persistedSecret.getId();
          this.baseResourceVersion = persistedSecret.getResourceVersion();
          this.baseData = { ...persistedData };
          this.data = { ...persistedData };
          this.latestClusterSecret = persistedSecret;
          this.conflict = undefined;
        });

        if (unpersistedKeys.length > 0) {
          this.props.showErrorNotification(
            `Secret "${secret.getName()}" was saved, but some keys differed in the persisted cluster state: ${unpersistedKeys.join(", ")}. Showing persisted version.`,
          );

          return;
        }

        this.props.showSuccessNotification("Secret successfully updated.");
      } catch (err) {
        if (isSaveConflictError(err)) {
          await this.handleConflict(secret, draftSnapshot);
        } else if (isForbiddenError(err)) {
          this.props.showErrorNotification(
            `Permission denied (403 Forbidden) while updating Secret "${secret.getName()}". Your local changes were kept.`,
          );
        } else if (isNotFoundError(err)) {
          runInAction(() => {
            this.conflict = describeKeyValueConflict(this.baseData, draftSnapshot, undefined, {
              remoteDeleted: true,
            });
          });
          this.props.showErrorNotification(
            `Secret "${secret.getName()}" no longer exists in the cluster (404 Not Found). Your local draft was kept.`,
          );
        } else {
          const sanitizedMessage = this.sanitizeMessage(getErrorMessage(err), draftSnapshot);

          this.props.showCheckedErrorNotification(
            sanitizedMessage,
            "Unknown error occurred while updating the secret",
          );
        }
      } finally {
        runInAction(() => {
          this.isSaving = false;
        });
      }
    })();
  };

  @action
    editData = (name: string, value: string, encoded: boolean) => {
      this.data[name] = encoded ? value : base64.encode(value);
    };

  renderConflictNotice() {
    const { conflict } = this;

    if (!conflict) {
      return null;
    }

    return (
      <div
        className="conflict-notice flex column gaps"
        data-testid="secret-conflict-notice"
      >
        <b>
          {conflict.remoteDeleted
            ? "Conflict: this Secret was deleted in the cluster. Nothing was saved and your draft was kept."
            : "Conflict: this Secret changed in the cluster while you were editing. Nothing was saved and your draft was kept."}
        </b>
        {conflict.uidChanged && (
          <span data-testid="secret-conflict-uid-warning">
            Warning: the Secret in the cluster has a different UID (it was deleted and recreated).
          </span>
        )}
        <span data-testid="secret-conflict-remote-keys">
          {`Keys changed in cluster: ${formatKeyList(conflict.remoteChangedKeys)}`}
        </span>
        <span data-testid="secret-conflict-local-keys">
          {`Keys changed by you: ${formatKeyList(conflict.localChangedKeys)}`}
        </span>
        {conflict.overlappingKeys.length > 0 && (
          <span data-testid="secret-conflict-overlapping-keys">
            {`Conflicting keys (modified in both): ${formatKeyList(conflict.overlappingKeys)}`}
          </span>
        )}
        {conflict.keyDetails.length > 0 && (
          <div className="conflict-key-list" data-testid="secret-conflict-key-details">
            {conflict.keyDetails.map(({ key, status }) => (
              <div
                key={key}
                data-testid={`secret-conflict-key-status-${key}`}
              >
                {`${key}: ${formatKeyStatus(status)}`}
              </div>
            ))}
          </div>
        )}
        <small>
          Secret values are hidden for security; only key names and modification states are shown.
        </small>
        <div className="flex gaps">
          <Button
            outlined
            label="Reload cluster version"
            data-testid="reload-remote-secret"
            onClick={() => void this.reloadClusterVersion()}
          />
          {!conflict.remoteDeleted && (
            <Button
              primary
              label="Re-apply my changes on cluster version"
              data-testid="reapply-changes-secret"
              onClick={() => void this.reapplyOnClusterVersion()}
            />
          )}
        </div>
      </div>
    );
  }

  renderSecret = ([name, value]: [string, string | undefined]) => {
    let decodedVal: string | undefined;

    try {
      decodedVal = value ? base64.decode(value) : undefined;
    } catch {
      /**
       * The value failed to be decoded, so don't show the visibility
       * toggle until the value is saved
       */
      this.revealSecret.delete(name);
    }

    const revealSecret = this.revealSecret.has(name);

    if (revealSecret && typeof decodedVal === "string") {
      value = decodedVal;
    }

    return (
      <div
        key={name}
        className="data"
        data-testid={`${name}-secret-entry`}
      >
        <div className="name">{name}</div>
        <div className="flex gaps align-center">
          <Input
            multiLine
            theme="round-black"
            className="box grow"
            value={value || ""}
            onChange={value => this.editData(name, value, !revealSecret)}
          />
          {typeof decodedVal === "string" && (
            <Icon
              material={revealSecret ? "visibility" : "visibility_off"}
              tooltip={revealSecret ? "Hide" : "Show"}
              onClick={() => toggle(this.revealSecret, name)}
            />
          )}
        </div>
      </div>
    );
  };

  renderData() {
    const secrets = Object.entries(this.data);

    if (secrets.length === 0) {
      return null;
    }

    return (
      <>
        <DrawerTitle>Data</DrawerTitle>
        {this.renderConflictNotice()}
        {secrets.map(this.renderSecret)}
        <Button
          primary
          label="Save"
          waiting={this.isSaving}
          className="save-btn"
          data-testid="save-secret-button"
          onClick={this.saveSecret}
        />
      </>
    );
  }

  render() {
    const { object: secret, logger } = this.props;

    if (!secret) {
      return null;
    }

    if (!(secret instanceof Secret)) {
      logger.error("[SecretDetails]: passed object that is not an instanceof Secret");

      return null;
    }

    return (
      <div className="SecretDetails">
        <DrawerItem name="Type">
          {secret.type}
        </DrawerItem>
        {this.renderData()}
      </div>
    );
  }
}

export const SecretDetails = withInjectables<Dependencies, SecretDetailsProps>(NonInjectedSecretDetails, {
  getProps: (di, props) => ({
    ...props,
    logger: di.inject(loggerInjectionToken),
    secretStore: di.inject(secretStoreInjectable),
    showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
    showErrorNotification: di.inject(showErrorNotificationInjectable),
    showSuccessNotification: di.inject(showSuccessNotificationInjectable),
  }),
});
