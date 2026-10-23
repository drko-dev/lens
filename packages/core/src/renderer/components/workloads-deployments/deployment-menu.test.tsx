/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { computed } from "mobx";
import { Deployment } from "@openlens/kube-object";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import deploymentApiInjectable from "../../../common/k8s-api/endpoints/deployment.api.injectable";
import openConfirmDialogInjectable from "../confirm-dialog/open.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import isProductionClusterInjectable from "../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import type { OpenRolloutRollbackDialog } from "./rollout/open.injectable";
import openRolloutRollbackDialogInjectable from "./rollout/open.injectable";
import { DeploymentMenu } from "./deployment-menu";
import { MenuContext } from "../menu/menu";

const makeDeployment = (paused: boolean) => new Deployment({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "web",
    namespace: "default",
    uid: "deployment-uid",
    resourceVersion: "100",
    selfLink: "/apis/apps/v1/namespaces/default/deployments/web",
  },
  spec: {
    replicas: 3,
    paused,
    selector: { matchLabels: { app: "web" }},
    template: {
      metadata: { labels: { app: "web" }},
      spec: { containers: [{ name: "web", image: "nginx:1.29" }] },
    },
  },
  status: {},
} as never);

describe("DeploymentMenu rollout actions", () => {
  let di: DiContainer;
  let setPaused: jest.Mock;
  let getDeployment: jest.Mock;
  let openConfirmDialog: jest.Mock;
  let openRollback: jest.Mock;
  let showError: jest.Mock;
  let production: boolean;
  let cluster: { id: string; name: { get: () => string }};

  beforeEach(() => {
    production = false;
    cluster = { id: "cluster-1", name: { get: () => "test-cluster" }};
    getDeployment = jest.fn(async () => makeDeployment(false));
    setPaused = jest.fn(async (_params, paused: boolean) => makeDeployment(paused));
    openConfirmDialog = jest.fn();
    openRollback = jest.fn();
    showError = jest.fn();

    di = getDiForUnitTesting();
    di.override(deploymentApiInjectable, () => ({
      get: getDeployment,
      setPaused,
      restart: jest.fn(),
    }) as never);
    di.override(openConfirmDialogInjectable, () => openConfirmDialog);
    di.override(openRolloutRollbackDialogInjectable, () => openRollback as OpenRolloutRollbackDialog);
    di.override(showCheckedErrorNotificationInjectable, () => showError);
    di.override(isProductionClusterInjectable, () => computed(() => production));
    di.override(hostedClusterInjectable, () => cluster as never);
  });

  const menuElement = (deployment: Deployment) => (
    <MenuContext.Provider
      value={{
        props: { open: jest.fn(), close: jest.fn(), closeOnClickItem: false },
        close: jest.fn(),
      }}
    >
      <DeploymentMenu object={deployment} toolbar={false}/>
    </MenuContext.Provider>
  );

  const renderMenu = (deployment: Deployment) => renderFor(di)(menuElement(deployment));

  it("pauses a non-production rollout directly without a confirmation dialog", async () => {
    const { getByTestId } = renderMenu(makeDeployment(false));

    fireEvent.click(getByTestId("menu-action-pause-rollout"));

    await waitFor(() => expect(setPaused).toHaveBeenCalledWith(
      { name: "web", namespace: "default" },
      true,
      { uid: "deployment-uid", resourceVersion: "100" },
    ));
    expect(getDeployment).toHaveBeenCalledWith({ name: "web", namespace: "default" });
    expect(openConfirmDialog).not.toHaveBeenCalled();
  });

  it("requires confirmation to resume a production rollout", async () => {
    production = true;
    getDeployment.mockResolvedValue(makeDeployment(true));

    const { getByTestId } = renderMenu(makeDeployment(true));

    fireEvent.click(getByTestId("menu-action-resume-rollout"));

    expect(openConfirmDialog).toHaveBeenCalledTimes(1);
    const confirm = openConfirmDialog.mock.calls[0][0];

    expect(confirm.labelOk).toBe("Resume rollout");
    expect(confirm.message).toBeTruthy();
    expect(setPaused).not.toHaveBeenCalled();

    await confirm.ok();

    expect(setPaused).toHaveBeenCalledWith(
      { name: "web", namespace: "default" },
      false,
      { uid: "deployment-uid", resourceVersion: "100" },
    );
  });

  it("does not pause if the cluster changes while PROD confirmation is open", async () => {
    production = true;
    const deployment = makeDeployment(false);
    const view = renderMenu(deployment);

    fireEvent.click(view.getByTestId("menu-action-pause-rollout"));
    const confirm = openConfirmDialog.mock.calls[0][0];

    cluster.id = "cluster-2";
    view.rerender(menuElement(deployment));

    await confirm.ok();

    expect(getDeployment).not.toHaveBeenCalled();
    expect(setPaused).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining("Cluster context changed"),
    );
  });

  it("does not send the patch if cluster context changes during the fresh read", async () => {
    const deployment = makeDeployment(false);
    let resolveGet: ((value: Deployment | null) => void) | undefined;

    getDeployment.mockReturnValue(new Promise(resolve => { resolveGet = resolve; }));
    const view = renderMenu(deployment);

    fireEvent.click(view.getByTestId("menu-action-pause-rollout"));
    cluster.id = "cluster-2";
    view.rerender(menuElement(deployment));
    resolveGet?.(makeDeployment(false));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining("Cluster context changed"),
    ));
    expect(setPaused).not.toHaveBeenCalled();
  });

  it("uses the fresh state and resourceVersion to reject concurrent pause requests", async () => {
    const deployment = makeDeployment(false);

    setPaused
      .mockResolvedValueOnce(makeDeployment(true))
      .mockRejectedValueOnce({ error: { code: 409 }});
    const view = renderMenu(deployment);
    const pause = view.getByTestId("menu-action-pause-rollout");

    fireEvent.click(pause);
    fireEvent.click(pause);

    await waitFor(() => expect(setPaused).toHaveBeenCalledTimes(2));
    expect(setPaused).toHaveBeenNthCalledWith(1,
      { name: "web", namespace: "default" },
      true,
      { uid: "deployment-uid", resourceVersion: "100" },
    );
    expect(setPaused).toHaveBeenNthCalledWith(2,
      { name: "web", namespace: "default" },
      true,
      { uid: "deployment-uid", resourceVersion: "100" },
    );
    expect(showError).toHaveBeenCalledWith(expect.objectContaining({ error: { code: 409 }}), expect.stringContaining("concurrently"));
    expect(deployment.spec?.paused).toBe(false);
  });

  it("shows the opposite action based on the paused state", () => {
    const running = renderMenu(makeDeployment(false));

    expect(running.queryByTestId("menu-action-pause-rollout")).toBeInTheDocument();
    expect(running.queryByTestId("menu-action-resume-rollout")).toBeNull();

    const paused = renderMenu(makeDeployment(true));
    const pausedView = within(paused.container);

    expect(pausedView.queryByTestId("menu-action-resume-rollout")).toBeInTheDocument();
    expect(pausedView.queryByTestId("menu-action-pause-rollout")).toBeNull();
  });

  it("reports pause errors without throwing", async () => {
    setPaused.mockRejectedValueOnce(new Error("boom"));
    const { getByTestId } = renderMenu(makeDeployment(false));

    fireEvent.click(getByTestId("menu-action-pause-rollout"));

    await waitFor(() => expect(showError).toHaveBeenCalled());
  });

  it("opens the rollback dialog for the selected Deployment", () => {
    const deployment = makeDeployment(false);
    const { getByTestId } = renderMenu(deployment);

    fireEvent.click(getByTestId("deployment-menu-rollback"));

    expect(openRollback).toHaveBeenCalledWith({ deployment });
  });
});
