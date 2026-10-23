/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Cluster } from "../../../common/cluster/cluster";
import { makeObservable, observable, runInAction } from "mobx";
import { SubTitle } from "../layout/sub-title";
import React from "react";
import { Input } from "../input/input";
import { Checkbox } from "../checkbox";
import { observer } from "mobx-react";
import { Icon } from "../icon/icon";
import { initialNodeShellImage } from "../../../common/cluster-types";
import { isProductionEnvironment } from "../../../common/cluster/environment-types";
import Gutter from "../gutter/gutter";

export interface ClusterNodeShellSettingProps {
  cluster: Cluster;
}

@observer
export class ClusterNodeShellSetting extends React.Component<ClusterNodeShellSettingProps> {
  @observable nodeShellEnabled = Boolean(this.props.cluster.preferences?.nodeShellEnabled);
  @observable nodeShellImage = this.props.cluster.preferences?.nodeShellImage || "";
  @observable imagePullSecret = this.props.cluster.preferences?.imagePullSecret || "";

  constructor(props: ClusterNodeShellSettingProps) {
    super(props);
    makeObservable(this);
  }

  componentWillUnmount() {
    runInAction(() => {
      this.props.cluster.preferences.nodeShellEnabled = this.nodeShellEnabled;
      this.props.cluster.preferences.nodeShellImage = this.nodeShellImage || undefined;
      this.props.cluster.preferences.imagePullSecret = this.imagePullSecret || undefined;
    });
  }

  render() {
    const isProd = isProductionEnvironment(this.props.cluster.preferences);

    return (
      <>
        <section>
          <SubTitle title="Node shell permissions" id="node-shell-permissions"/>
          <Checkbox
            label="Enable Privileged Node Shell (Host root access)"
            value={this.nodeShellEnabled}
            onChange={value => {
              this.nodeShellEnabled = value;
              this.props.cluster.preferences.nodeShellEnabled = value;
            }}
          />
          <small className="hint">
            Disabled by default for operational security. Launches a privileged pod in kube-system with hostPID, hostIPC and hostNetwork running nsenter to enter PID 1 on the host.
          </small>
          {isProd && this.nodeShellEnabled && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid #ef4444",
                borderRadius: 4,
                color: "#ef4444",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
              <Icon material="warning" style={{ color: "#ef4444" }} />
              <span>
                CRITICAL: You have enabled Node Shell on a PRODUCTION cluster. Shell sessions operate with host root privileges and bypass standard container boundaries.
              </span>
            </div>
          )}
        </section>
        <Gutter />
        <section>
          <SubTitle title="Node shell image" id="node-shell-image"/>
          <Input
            theme="round-black"
            placeholder={`Default image: ${initialNodeShellImage}`}
            value={this.nodeShellImage}
            onChange={value => this.nodeShellImage = value}
            iconRight={
              this.nodeShellImage
                ? (
                  <Icon
                    smallest
                    material="close"
                    onClick={() => this.nodeShellImage = ""}
                    tooltip="Reset"
                  />
                )
                : undefined
            }
          />
          <small className="hint">
            Node shell image. Used for creating node shell pod.
          </small>
        </section>
        <Gutter />
        <section>
          <SubTitle title="Image pull secret" id="image-pull-secret"/>
          <Input
            placeholder="Specify a secret name..."
            theme="round-black"
            value={this.imagePullSecret}
            onChange={value => this.imagePullSecret = value}
            iconRight={
              this.imagePullSecret
                ? (
                  <Icon
                    smallest
                    material="close"
                    onClick={() => this.imagePullSecret = ""}
                    tooltip="Clear"
                  />
                )
                : undefined
            }
          />
          <small className="hint">
            Name of a pre-existing secret in the kube-system namespace. An optional setting. Used for pulling image from a private registry.
          </small>
        </section>
      </>
    );
  }
}
