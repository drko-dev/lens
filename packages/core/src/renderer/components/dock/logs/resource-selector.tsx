/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./resource-selector.scss";

import React from "react";
import { observer } from "mobx-react";

import { Badge } from "../../badge";
import type { SelectOption } from "../../select";
import { Select } from "../../select";
import type { LogTabViewModel } from "./logs-view-model";
import type { Container, Pod } from "@openlens/kube-object";
import type { SingleValue } from "react-select";

export interface LogResourceSelectorProps {
  model: LogTabViewModel;
}

export const LogResourceSelector = observer(({ model }: LogResourceSelectorProps) => {
  const tabData = model.logTabData.get();

  if (!tabData) {
    return null;
  }

  const { selectedContainer, owner } = tabData;
  const pods = model.pods.get();
  const pod = model.pod.get();

  if (!pod) {
    return null;
  }

  const podOptions = pods.map(pod => ({
    value: pod,
    label: pod.getName(),
  }));
  const allContainers = pod.getAllContainers();
  const container = allContainers.find(container => container.name === selectedContainer) ?? null;
  const onContainerChange = (option: SingleValue<SelectOption<Container>>) => {
    if (!option) {
      return;
    }

    model.updateLogTabData({
      selectedContainer: option.value.name,
    });
    model.reloadLogs();
  };

  const onPodChange = (option: SingleValue<SelectOption<Pod>>) => {
    if (!option) {
      return;
    }

    model.updateLogTabData({
      selectedPodId: option.value.getId(),
      selectedContainer: option.value.getAllContainers()[0]?.name,
    });
    model.renameTab(`Pod ${option.value.getName()}`);
    model.reloadLogs();
  };

  const containerSelectOptions = [
    {
      label: "Containers",
      options: pod.getContainers().map(container => ({
        value: container,
        label: container.name,
      })),
    },
    {
      label: "Init Containers",
      options: pod.getInitContainers().map(container => ({
        value: container,
        label: container.name,
      })),
    },
  ];

  return (
    <div className="LogResourceSelector flex gaps align-center">
      {/* Cluster Context Badge (R4-04) */}
      <div
        data-testid={`logs-cluster-context-${tabData.selectedPodId || "logs"}`}
        className="flex gaps align-center"
        style={{
          padding: "2px 8px",
          borderRadius: "4px",
          backgroundColor: model.isProduction ? "rgba(235, 87, 87, 0.15)" : "var(--boxBackground)",
          border: `1px solid ${model.isProduction ? "#eb5757" : model.accentColor || "var(--border)"}`,
          marginRight: "4px",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "11px", color: model.accentColor }}>
          {model.clusterName || "Cluster"}
        </span>
        {model.environment && model.environment !== "none" && (
          <Badge
            label={model.environment.toUpperCase()}
            style={{
              fontSize: "10px",
              padding: "1px 4px",
              backgroundColor: model.isProduction ? "#eb5757" : model.accentColor,
              color: "#fff",
              fontWeight: 700,
            }}
          />
        )}
        {model.isProduction && (
          <Badge
            label="⚠️ PROD"
            data-testid="logs-prod-hazard"
            style={{
              fontSize: "10px",
              padding: "1px 4px",
              backgroundColor: "#eb5757",
              color: "#fff",
              fontWeight: 700,
            }}
          />
        )}
      </div>

      <span>Namespace</span>
      {" "}
      <Badge data-testid="namespace-badge" label={pod.getNs()} />
      {
        owner && (
          <>
            <span>Owner</span>
            {" "}
            <Badge data-testid="namespace-badge" label={`${owner.kind} ${owner.name}`} />
          </>
        )
      }
      {model.podUid.get() && (
        <Badge
          data-testid="pod-uid-badge"
          label={`UID: ${model.podUid.get()?.slice(0, 8)}`}
          title={model.podUid.get()}
          style={{ opacity: 0.7, fontSize: "10px" }}
        />
      )}
      <span>Pod</span>
      <Select
        options={podOptions}
        value={pod}
        isClearable={false}
        onChange={onPodChange}
        className="pod-selector"
        menuClass="pod-selector-menu"
      />
      <span>Container</span>
      <Select<Container, SelectOption<Container>, false>
        id="container-selector-input"
        options={containerSelectOptions}
        value={container}
        onChange={onContainerChange}
        className="container-selector"
        menuClass="container-selector-menu"
        controlShouldRenderValue
      />
    </div>
  );
});

