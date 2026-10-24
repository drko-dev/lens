/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./details.scss";

import { autorun, observable, runInAction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import React from "react";
import { Link } from "react-router-dom";

import type { Secret, ServiceAccount } from "@openlens/kube-object";
import { DrawerItem, DrawerTitle } from "../../drawer";
import { Icon } from "../../icon";
import type { KubeObjectDetailsProps } from "../../kube-object-details";
import { Spinner } from "../../spinner";
import { Button } from "@openlens/button";
import { ServiceAccountsSecret } from "./secret";
import type { SecretStore } from "../../config-secrets/store";
import type { GetDetailsUrl } from "../../kube-detail-params/get-details-url.injectable";
import { withInjectables } from "@ogre-tools/injectable-react";
import getDetailsUrlInjectable from "../../kube-detail-params/get-details-url.injectable";
import secretStoreInjectable from "../../config-secrets/store.injectable";
import navigateToRbacInspectorInjectable from "../../../../common/front-end-routing/routes/cluster/user-management/rbac-inspector/navigate-to-rbac-inspector.injectable";
import type { NavigateToRbacInspector } from "../../../../common/front-end-routing/routes/cluster/user-management/rbac-inspector/navigate-to-rbac-inspector.injectable";

export interface ServiceAccountsDetailsProps extends KubeObjectDetailsProps<ServiceAccount> {
}

interface Dependencies {
  secretStore: SecretStore;
  getDetailsUrl: GetDetailsUrl;
  navigateToRbacInspector: NavigateToRbacInspector;
}

@observer
class NonInjectedServiceAccountsDetails extends React.Component<ServiceAccountsDetailsProps & Dependencies> {
  readonly secrets = observable.array<Secret | string>();
  readonly imagePullSecrets = observable.array<Secret | string>();

  private defensiveLoadSecretIn = (namespace: string) => (
    ({ name }: { name: string }) => (
      this.props.secretStore.load({ name, namespace })
        .catch(() => name)
    )
  );

  componentDidMount(): void {
    disposeOnUnmount(this, [
      autorun(async () => {
        runInAction(() => {
          this.secrets.clear();
          this.imagePullSecrets.clear();
        });

        const { object: serviceAccount } = this.props;
        const namespace = serviceAccount?.getNs();

        if (!namespace) {
          return;
        }

        const defensiveLoadSecret = this.defensiveLoadSecretIn(namespace);

        const secretLoaders = Promise.all(serviceAccount.getSecrets().map(defensiveLoadSecret));
        const imagePullSecretLoaders = Promise.all(serviceAccount.getImagePullSecrets().map(defensiveLoadSecret));
        const [secrets, imagePullSecrets] = await Promise.all([
          secretLoaders,
          imagePullSecretLoaders,
        ]);

        runInAction(() => {
          this.secrets.replace(secrets);
          this.imagePullSecrets.replace(imagePullSecrets);
        });
      }),
    ]);
  }

  renderSecrets() {
    const { secrets } = this;

    if (!secrets) {
      return <Spinner center/>;
    }

    return secrets.map(secret => (
      <ServiceAccountsSecret
        key={typeof secret === "string" ? secret : secret.getName()}
        secret={secret}
      />
    ));
  }

  renderImagePullSecrets() {
    const { imagePullSecrets } = this;

    if (!imagePullSecrets) {
      return <Spinner center/>;
    }

    return this.renderSecretLinks(imagePullSecrets);
  }

  renderSecretLinks(secrets: (Secret | string)[]) {
    return secrets.map((secret) => {
      if (typeof secret === "string") {
        return (
          <div key={secret}>
            {secret}
            <Icon
              small
              material="warning"
              tooltip="Secret is not found"
            />
          </div>
        );
      }

      return (
        <Link key={secret.getId()} to={this.props.getDetailsUrl(secret.selfLink)}>
          {secret.getName()}
        </Link>
      );
    });
  }

  render() {
    const { object: serviceAccount, secretStore } = this.props;

    if (!serviceAccount) {
      return null;
    }
    const tokens = secretStore.items.filter(secret =>
      secret.getNs() == serviceAccount.getNs() &&
      secret.getAnnotations().some(annot => annot == `kubernetes.io/service-account.name: ${serviceAccount.getName()}`),
    );
    const imagePullSecrets = serviceAccount.getImagePullSecrets();

    return (
      <div className="ServiceAccountsDetails">
        {tokens.length > 0 && (
          <DrawerItem name="Tokens" className="links">
            {this.renderSecretLinks(tokens)}
          </DrawerItem>
        )}
        {imagePullSecrets.length > 0 && (
          <DrawerItem name="ImagePullSecrets" className="links">
            {this.renderImagePullSecrets()}
          </DrawerItem>
        )}

        <DrawerTitle>Permissions</DrawerTitle>
        <div style={{ marginBottom: 16 }}>
          <Button
            primary
            onClick={() => this.props.navigateToRbacInspector({
              query: {
                identity: "service-account",
                namespace: serviceAccount.getNs(),
                serviceAccount: serviceAccount.getName(),
              },
            })}
            data-testid="inspect-sa-permissions-button"
          >
            <Icon
              material="security"
              small
              style={{ marginRight: 6 }} />
            Inspect Permissions (auth can-i)
          </Button>
        </div>

        <DrawerTitle>Mountable secrets</DrawerTitle>
        <div className="secrets">
          {this.renderSecrets()}
        </div>
      </div>
    );
  }
}

export const ServiceAccountsDetails = withInjectables<Dependencies, ServiceAccountsDetailsProps>(NonInjectedServiceAccountsDetails, {
  getProps: (di, props) => ({
    ...props,
    getDetailsUrl: di.inject(getDetailsUrlInjectable),
    secretStore: di.inject(secretStoreInjectable),
    navigateToRbacInspector: di.inject(navigateToRbacInspectorInjectable),
  }),
});
