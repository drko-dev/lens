/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./resource-selector.scss";

import React from "react";
import { observer } from "mobx-react";

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

  const { selectedContainer } = tabData;
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
    <div className="LogResourceSelector" data-testid="log-resource-selector">
      <div className="pod-select-wrapper" title="Pod">
        <Select
          options={podOptions}
          value={pod}
          isClearable={false}
          onChange={onPodChange}
          className="pod-selector"
          menuClass="pod-selector-menu"
        />
      </div>
      <div className="container-select-wrapper" title="Container">
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
    </div>
  );
});
