/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import styles from "./kube-object-menu.module.scss";
import { cssNames } from "@openlens/utilities";
import type { KubeObject } from "@openlens/kube-object";
import type { MenuActionsProps } from "../menu";
import { MenuItem, MenuActions } from "../menu";
import identity from "lodash/identity";
import type { ApiManager } from "../../../common/k8s-api/api-manager";
import { withInjectables } from "@ogre-tools/injectable-react";
import clusterNameInjectable from "./cluster-name.injectable";
import createEditResourceTabInjectable from "../dock/edit-resource/edit-resource-tab.injectable";
import kubeObjectMenuItemsInjectable from "./kube-object-menu-items.injectable";
import apiManagerInjectable from "../../../common/k8s-api/api-manager/manager.injectable";
import type { HideDetails } from "../kube-detail-params/hide-details.injectable";
import hideDetailsInjectable from "../kube-detail-params/hide-details.injectable";
import type { OnKubeObjectContextMenuOpen } from "./on-context-menu-open.injectable";
import onKubeObjectContextMenuOpenInjectable from "./on-context-menu-open.injectable";
import type { KubeObjectContextMenuItem } from "../../kube-object/handler";
import type { IComputedValue } from "mobx";
import { observable, runInAction } from "mobx";
import type { WithConfirmation } from "../confirm-dialog/with-confirm.injectable";
import type { Navigate } from "../../navigation/navigate.injectable";
import { Icon } from "../icon";
import navigateInjectable from "../../navigation/navigate.injectable";
import withConfirmationInjectable from "../confirm-dialog/with-confirm.injectable";
import isProductionClusterInjectable from "./is-production-cluster.injectable";
import { observer } from "mobx-react";

export interface KubeObjectMenuProps<TKubeObject extends KubeObject> extends MenuActionsProps {
  object: TKubeObject;
  editable?: boolean;
  removable?: boolean;
}

interface Dependencies {
  apiManager: ApiManager;
  kubeObjectMenuItems: IComputedValue<React.ElementType[]>;
  clusterName: IComputedValue<string | undefined>;
  isProduction: IComputedValue<boolean>;
  hideDetails: HideDetails;
  createEditResourceTab: (kubeObject: KubeObject) => void;
  onContextMenuOpen: OnKubeObjectContextMenuOpen;
  withConfirmation: WithConfirmation;
  navigate: Navigate;
}

@observer
class NonInjectedKubeObjectMenu<Kube extends KubeObject> extends React.Component<KubeObjectMenuProps<Kube> & Dependencies> {
  private menuItems = observable.array<KubeObjectContextMenuItem>();

  componentDidUpdate(prevProps: Readonly<KubeObjectMenuProps<Kube> & Dependencies>): void {
    if (prevProps.object !== this.props.object && this.props.object) {
      this.emitOnContextMenuOpen(this.props.object);
    }
  }

  private renderRemoveMessage(object: KubeObject) {
    const breadcrumbParts = [object.getNs(), object.getName()];
    const breadcrumb = breadcrumbParts.filter(identity).join("/");
    const isProd = this.props.isProduction.get();

    const message = (
      <p>
        {`Remove ${object.kind} `}
        <b>{breadcrumb}</b>
        {" from "}
        <b>{this.props.clusterName.get()}</b>
        ?
      </p>
    );

    if (!isProd) {
      return message;
    }

    return (
      <div>
        <div className={styles.productionHazardBanner}>
          <Icon material="warning" className={styles.hazardIcon} />
          <span>CAUTION: You are about to delete a resource in a PRODUCTION cluster!</span>
        </div>
        {message}
      </div>
    );
  }

  private renderForceDeleteMessage(object: KubeObject) {
    const breadcrumbParts = [object.getNs(), object.getName()];
    const breadcrumb = breadcrumbParts.filter(identity).join("/");
    const isProd = this.props.isProduction.get();

    return (
      <div>
        {isProd && (
          <div className={styles.productionHazardBanner}>
            <Icon material="warning" className={styles.hazardIcon} />
            <span>CRITICAL: Force deleting in a PRODUCTION cluster may cause severe downtime!</span>
          </div>
        )}
        <p>
          {`Force delete ${object.kind} `}
          <b>{breadcrumb}</b>
          {" from "}
          <b>{this.props.clusterName.get()}</b>
          ?
        </p>
        <p>
          Warning: Immediate deletion (--grace-period=0 --force) bypasses graceful shutdown and forces removal from the cluster. Use only for stuck or unresponsive pods.
        </p>
      </div>
    );
  }

  private renderEvictMessage(object: KubeObject) {
    const breadcrumbParts = [object.getNs(), object.getName()];
    const breadcrumb = breadcrumbParts.filter(identity).join("/");
    const isProd = this.props.isProduction.get();

    return (
      <div>
        {isProd && (
          <div className={styles.productionHazardBanner}>
            <Icon material="warning" className={styles.hazardIcon} />
            <span>CAUTION: You are about to evict a pod in a PRODUCTION cluster!</span>
          </div>
        )}
        <p>
          {`Evict ${object.kind} `}
          <b>{breadcrumb}</b>
          {" from "}
          <b>{this.props.clusterName.get()}</b>
          ?
        </p>
        <p>
          Eviction requests pod termination via the Kubernetes Eviction API, respecting PodDisruptionBudgets.
        </p>
      </div>
    );
  }

  private renderMenuItems() {
    const { object, toolbar } = this.props;

    return this.props.kubeObjectMenuItems.get().map((MenuItem, index) => (
      <MenuItem
        object={object}
        toolbar={toolbar}
        key={`menu-item-${index}`}
      />
    ));
  }

  private emitOnContextMenuOpen(object: KubeObject) {
    const {
      apiManager,
      editable,
      removable,
      hideDetails,
      createEditResourceTab,
      withConfirmation,
      removeAction,
      onContextMenuOpen,
      navigate,
      updateAction,
    } = this.props;

    const store = apiManager.getStore(object.selfLink);
    const isEditable = editable ?? (Boolean(store?.patch) || Boolean(updateAction));
    const isRemovable = removable ?? (Boolean(store?.remove) || Boolean(removeAction));

    runInAction(() => {
      this.menuItems.clear();

      if (isRemovable) {
        if (object.kind === "Pod") {
          this.menuItems.push({
            id: "force-delete-kube-object",
            title: "Force Delete",
            icon: "delete_forever",
            onClick: () => withConfirmation({
              message: this.renderForceDeleteMessage(object),
              labelOk: "Force Delete",
              okButtonProps: { accent: true },
              ok: async () => {
                hideDetails();
                const podApi = apiManager.getApi(object.selfLink);

                if (podApi) {
                  await podApi.delete({
                    name: object.getName(),
                    namespace: object.getNs(),
                    gracePeriodSeconds: 0,
                  });

                  const finalizers = object.getFinalizers();

                  if (finalizers && finalizers.length > 0) {
                    try {
                      await podApi.patch(
                        { name: object.getName(), namespace: object.getNs() },
                        [{ op: "remove", path: "/metadata/finalizers" }],
                        "json",
                      );
                    } catch {
                      // Finalizer removal attempt; ignore if already removed
                    }
                  }
                } else if (store?.remove) {
                  await store.remove(object);
                }
              },
            })(),
          });
        }

        this.menuItems.push({
          id: "delete-kube-object",
          title: "Delete",
          icon: "delete",
          onClick: () => withConfirmation({
            message: this.renderRemoveMessage(object),
            labelOk: "Remove",
            ok: async () => {
              hideDetails();

              if (removeAction) {
                await removeAction();
              } else if (object.kind === "Pod") {
                const podApi = apiManager.getApi(object.selfLink);

                if (podApi) {
                  await podApi.delete({
                    name: object.getName(),
                    namespace: object.getNs(),
                  });
                } else if (store?.remove) {
                  await store.remove(object);
                }
              } else if (store?.remove) {
                await store.remove(object);
              }
            },
          })(),
        });

        if (object.kind === "Pod") {
          this.menuItems.push({
            id: "evict-kube-object",
            title: "Evict",
            icon: "delete_sweep",
            onClick: () => withConfirmation({
              message: this.renderEvictMessage(object),
              labelOk: "Evict",
              ok: async () => {
                hideDetails();
                const podApi = apiManager.getApi(object.selfLink) as any;

                if (podApi?.evict) {
                  await podApi.evict({
                    name: object.getName(),
                    namespace: object.getNs(),
                  });
                }
              },
            })(),
          });
        }
      }

      if (isEditable) {
        this.menuItems.push({
          id: "edit-kube-object",
          title: "Edit",
          icon: "edit",
          onClick: async () => {
            hideDetails();

            if (updateAction) {
              await updateAction();
            } else {
              createEditResourceTab(object);
            }
          },
        });
      }
    });

    onContextMenuOpen(object, {
      menuItems: this.menuItems,
      navigate,
    });
  }

  private renderContextMenuItems = (object: KubeObject) => (
    [...this.menuItems]
      .reverse() // This is done because the order that we "grow" is right->left
      .map(({ icon, ...rest }) => ({
        ...rest,
        icon: typeof icon === "string"
          ? { material: icon }
          : icon,
      }))
      .map((item, index) => (
        <MenuItem
          key={`context-menu-item-${index}`}
          onClick={() => item.onClick(object)}
          data-testid={`menu-action-${item.title.toLowerCase().replace(/\s+/, "-")}-for-${object.selfLink}`}
        >
          <Icon
            {...item.icon}
            interactive={this.props.toolbar}
            tooltip={item.title}
          />
          <span className="title">
            {item.title}
          </span>
        </MenuItem>
      ))
  );

  render() {
    const {
      className,
      editable,
      removable,
      object,
      removeAction, // This is here so we don't pass it down to `<MenuAction>`
      removeConfirmationMessage, // This is here so we don't pass it down to `<MenuAction>`
      updateAction, // This is here so we don't pass it down to `<MenuAction>`
      ...menuProps
    } = this.props;

    return (
      <MenuActions
        id={`menu-actions-for-kube-object-menu-for-${object?.getId()}`}
        data-testid={`menu-actions-for-kube-object-menu-for-${object?.getId()}`}
        className={cssNames("KubeObjectMenu", className)}
        onOpen={object ? () => this.emitOnContextMenuOpen(object) : undefined}
        {...menuProps}
      >
        {this.renderMenuItems()}
        {object && this.renderContextMenuItems(object)}
      </MenuActions>
    );
  }
}

export const KubeObjectMenu = withInjectables<Dependencies, KubeObjectMenuProps<KubeObject>>(NonInjectedKubeObjectMenu, {
  getProps: (di, props) => ({
    ...props,
    clusterName: di.inject(clusterNameInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    apiManager: di.inject(apiManagerInjectable),
    createEditResourceTab: di.inject(createEditResourceTabInjectable),
    hideDetails: di.inject(hideDetailsInjectable),
    kubeObjectMenuItems: di.inject(kubeObjectMenuItemsInjectable, props.object),
    onContextMenuOpen: di.inject(onKubeObjectContextMenuOpenInjectable),
    navigate: di.inject(navigateInjectable),
    withConfirmation: di.inject(withConfirmationInjectable),
  }),
}) as <T extends KubeObject>(props: KubeObjectMenuProps<T>) => React.ReactElement;
