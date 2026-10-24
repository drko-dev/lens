/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";

import type { KubeObjectMenuProps } from "../../kube-object-menu";
import type { ServiceAccount } from "@openlens/kube-object";
import { MenuItem } from "../../menu";
import { Icon } from "../../icon";
import type { OpenServiceAccountKubeConfigDialog } from "../../kubeconfig-dialog/open-service-account-kube-config-dialog.injectable";
import { withInjectables } from "@ogre-tools/injectable-react";
import openServiceAccountKubeConfigDialogInjectable from "../../kubeconfig-dialog/open-service-account-kube-config-dialog.injectable";
import navigateToRbacInspectorInjectable from "../../../../common/front-end-routing/routes/cluster/user-management/rbac-inspector/navigate-to-rbac-inspector.injectable";
import type { NavigateToRbacInspector } from "../../../../common/front-end-routing/routes/cluster/user-management/rbac-inspector/navigate-to-rbac-inspector.injectable";

interface Dependencies {
  openServiceAccountKubeConfigDialog: OpenServiceAccountKubeConfigDialog;
  navigateToRbacInspector: NavigateToRbacInspector;
}

function NonInjectedServiceAccountMenu(props: KubeObjectMenuProps<ServiceAccount> & Dependencies) {
  const { object, toolbar, openServiceAccountKubeConfigDialog, navigateToRbacInspector } = props;

  return (
    <>
      <MenuItem onClick={() => openServiceAccountKubeConfigDialog(object)}>
        <Icon
          material="insert_drive_file"
          tooltip="Kubeconfig File"
          interactive={toolbar}
        />
        <span className="title">Kubeconfig</span>
      </MenuItem>
      <MenuItem
        onClick={() => navigateToRbacInspector({
          query: {
            identity: "service-account",
            namespace: object.getNs(),
            serviceAccount: object.getName(),
          },
        })}
      >
        <Icon
          material="security"
          tooltip="Inspect Permissions (can-i)"
          interactive={toolbar}
        />
        <span className="title">Inspect Permissions</span>
      </MenuItem>
    </>
  );
}

export const ServiceAccountMenu = withInjectables<Dependencies, KubeObjectMenuProps<ServiceAccount>>(NonInjectedServiceAccountMenu, {
  getProps: (di, props) => ({
    ...props,
    openServiceAccountKubeConfigDialog: di.inject(openServiceAccountKubeConfigDialogInjectable),
    navigateToRbacInspector: di.inject(navigateToRbacInspectorInjectable),
  }),
});
