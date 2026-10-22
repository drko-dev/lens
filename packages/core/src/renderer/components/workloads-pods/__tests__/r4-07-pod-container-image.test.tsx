/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { Pod } from "@openlens/kube-object";
import type { Container } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";
import { PodDetailsContainer } from "../pod-details-container";
import { computed } from "mobx";
import configMapStoreInjectable from "../../config-maps/store.injectable";
import secretStoreInjectable from "../../config-secrets/store.injectable";
import portForwardStoreInjectable from "../../../port-forward/port-forward-store/port-forward-store.injectable";
import enabledMetricsInjectable from "../../../api/catalog/entity/metrics-enabled.injectable";
import createPodLogsTabInjectable from "../../dock/logs/create-pod-logs-tab.injectable";
import createPodTerminalTabInjectable from "../../dock/terminal/create-pod-terminal-tab.injectable";

const A = `sha256:${"a".repeat(64)}`;
const B = `sha256:${"b".repeat(64)}`;

const makePod = (image: string, imageID?: string) => new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "my-pod",
    namespace: "default",
    resourceVersion: "1",
    uid: "1234",
    selfLink: "/api/v1/pods/default/my-pod",
  },
  spec: { containers: [{ name: "app", image }] },
  status: imageID === undefined ? undefined : {
    containerStatuses: [{ name: "app", image, imageID, ready: true, restartCount: 0, state: { running: {}}}],
  },
} as never);

describe("<PodDetailsContainer /> image provenance", () => {
  let render: DiRender;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    di.override(portForwardStoreInjectable, () => ({ watch: () => () => {}, portForwards: [] }) as never);
    di.override(configMapStoreInjectable, () => ({}) as never);
    di.override(secretStoreInjectable, () => ({}) as never);
    di.override(enabledMetricsInjectable, () => computed(() => false));
    di.override(createPodLogsTabInjectable, () => () => "tab");
    di.override(createPodTerminalTabInjectable, () => (() => "tab") as never);
    render = renderFor(di);
  });

  const show = (image: string, imageID?: string) => {
    const pod = makePod(image, imageID);

    return render(<PodDetailsContainer pod={pod} container={pod.getContainers()[0] as Container} />);
  };

  it("shows tag + resolved digest, no mismatch", () => {
    const { getByTestId, queryByTestId } = show("nginx:1.25", `docker-pullable://nginx@${A}`);

    expect(getByTestId("container-image-declared-app")).toHaveTextContent("nginx:1.25");
    expect(getByTestId("container-image-kind-app")).toHaveTextContent("tag (mutable)");
    expect(getByTestId("container-image-runtime-app")).toHaveAttribute("title", A);
    expect(getByTestId("container-image-runtime-app")).toHaveTextContent(A.substring(0, 19));
    expect(queryByTestId("container-image-mismatch-app")).toBeNull();
  });

  it("warns on digest-pinned mismatch", () => {
    const { getByTestId } = show(`nginx@${A}`, `docker://nginx@${B}`);

    expect(getByTestId("container-image-kind-app")).toHaveTextContent("digest-pinned");
    expect(getByTestId("container-image-mismatch-app")).toBeInTheDocument();
  });

  it("shows unresolved when there is no status", () => {
    const { getByTestId } = show("nginx");

    expect(getByTestId("container-image-kind-app")).toHaveTextContent("implicit :latest");
    expect(getByTestId("container-image-runtime-app")).toHaveTextContent("not resolved yet");
  });

  it("always shows the registry note", () => {
    const { getByTestId } = show("nginx:1", `docker://${A}`);

    expect(getByTestId("container-image-registry-note-app")).toHaveTextContent("Registry metadata not verified");
  });

  it("is collapsed by default, labels declared vs runtime and expands", () => {
    const { getByTestId } = show(`nginx@${A}`, `docker://nginx@${A}`);
    const details = getByTestId("container-image-app") as HTMLDetailsElement;

    expect(details.open).toBe(false);
    expect(getByTestId("container-image-declared-digest-app")).toHaveTextContent(`declared ${A.substring(0, 19)}…`);
    expect(getByTestId("container-image-runtime-summary-app")).toHaveTextContent(`runtime ${A.substring(0, 19)}…`);

    details.open = true;
    expect(details.open).toBe(true);
  });

  it("does not present unresolved runtime data as a digest", () => {
    const { getByTestId, queryByTestId } = show("nginx:1");

    expect(queryByTestId("container-image-declared-digest-app")).toBeNull();
    expect(getByTestId("container-image-runtime-summary-app")).toHaveTextContent("runtime not resolved yet");
  });
});
