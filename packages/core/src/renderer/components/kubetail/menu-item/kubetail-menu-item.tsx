/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import type { KubeObject } from "@openlens/kube-object";
import type { KubeObjectMenuProps } from "../../kube-object-menu";
import { MenuItem } from "../../menu";
import { Icon } from "../../icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { Navigate } from "../../../navigation/navigate.injectable";
import navigateInjectable from "../../../navigation/navigate.injectable";
import type { HideDetails } from "../../kube-detail-params/hide-details.injectable";
import hideDetailsInjectable from "../../kube-detail-params/hide-details.injectable";

export interface KubetailMenuItemProps extends KubeObjectMenuProps<KubeObject> {}

interface Dependencies {
  navigate: Navigate;
  hideDetails: HideDetails;
}

const NonInjectedKubetailMenuItem = ({
  object,
  toolbar,
  navigate,
  hideDetails,
}: Dependencies & KubetailMenuItemProps) => {
  if (!object) return null;

  const onViewInKubetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    hideDetails();

    const params = new URLSearchParams({
      kind: object.kind,
      name: object.getName(),
      namespace: object.getNs() || "default",
    });

    if (object.metadata?.uid) {
      params.set("uid", object.metadata.uid);
    }

    navigate(`/kubetail?${params.toString()}`);
  };

  return (
    <MenuItem
      onClick={onViewInKubetail}
      data-testid={`menu-action-view-in-kubetail-for-${object.getName()}`}
    >
      <Icon
        material="subject"
        tooltip="View in Kubetail"
        interactive={toolbar}
      />
      <span className="title">View in Kubetail</span>
    </MenuItem>
  );
};

export const KubetailMenuItem = withInjectables<Dependencies, KubetailMenuItemProps>(
  NonInjectedKubetailMenuItem,
  {
    getProps: (di, props) => ({
      ...props,
      navigate: di.inject(navigateInjectable),
      hideDetails: di.inject(hideDetailsInjectable),
    }),
  },
);
