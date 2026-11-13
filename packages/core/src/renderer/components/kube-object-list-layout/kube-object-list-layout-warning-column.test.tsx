/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainer } from "@ogre-tools/injectable";
import "@testing-library/jest-dom/extend-expect";
import React from "react";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import kubeSelectedUrlParamInjectable from "../kube-detail-params/kube-selected-url.injectable";
import toggleKubeDetailsPaneInjectable from "../kube-detail-params/toggle-details.injectable";
import { renderFor } from "../test-utils/renderFor";
import { KubeObjectListLayout } from "./index";
import appPathsStateInjectable from "../../../common/app-paths/app-paths-state.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import directoryForKubeConfigsInjectable from "../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { Cluster } from "../../../common/cluster/cluster";
import isTableColumnHiddenInjectable from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import { Pod } from "@openlens/kube-object";

describe("kube-object-list-layout warning column", () => {
  let di: DiContainer;
  let render: ReturnType<typeof renderFor>;

  const renderList = (headers: { title?: string; className: string; id?: string; showWithColumn?: string }[]) => {
    const podStore = di.inject(podStoreInjectable);

    const pod = new Pod({
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name: "some-pod", namespace: "default", uid: "some-uid", resourceVersion: "1", selfLink: "/api/v1/namespaces/default/pods/some-pod" },
    });

    return render(
      <KubeObjectListLayout
        className="Things"
        store={podStore}
        items={[pod]}
        tableId="some-table"
        virtual={false}
        renderHeaderTitle="Things"
        renderTableHeader={headers}
        renderTableContents={pod => headers.map(h => <span key={h.className} className={`cell-${h.className}`}>{h.className === "name" ? pod.getName() : ""}</span>)}
      />,
    );
  };

  beforeEach(() => {
    di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(isTableColumnHiddenInjectable, () => () => false);
    di.override(hostedClusterInjectable, () => new Cluster({
      contextName: "some-context-name",
      id: "some-cluster-id",
      kubeConfigPath: "/some-path-to-a-kubeconfig",
    }));
    di.override(subscribeStoresInjectable, () => jest.fn().mockImplementation(() => jest.fn()));
    di.override(kubeSelectedUrlParamInjectable, () => ({ get: () => "path" }));
    di.override(toggleKubeDetailsPaneInjectable, () => null);
    di.override(appPathsStateInjectable, () => ({ get: () => ({}) }));

    render = renderFor(di);
  });

  it("adds a warning header right after name and a status icon cell per row", () => {
    const { baseElement } = renderList([
      { title: "Name", className: "name", id: "name" },
      { title: "Age", className: "age", id: "age" },
    ]);

    const headerClasses = Array.from(baseElement.querySelectorAll(".TableHead .TableCell")).map(e => e.className);
    const nameIndex = headerClasses.findIndex(c => c.includes("name"));

    expect(headerClasses[nameIndex + 1]).toContain("warning");
    expect(headerClasses.filter(c => c.includes("warning"))).toHaveLength(1);

    const rowCells = Array.from(baseElement.querySelectorAll(".TableRow .TableCell"));

    expect(rowCells.some(c => c.className.includes("warning"))).toBe(true);
  });

  it("does not add a second warning column when the list already declares one", () => {
    const { baseElement } = renderList([
      { title: "Name", className: "name", id: "name" },
      { className: "warning", showWithColumn: "name" },
      { title: "Age", className: "age", id: "age" },
    ]);

    const headerClasses = Array.from(baseElement.querySelectorAll(".TableHead .TableCell")).map(e => e.className);

    expect(headerClasses.filter(c => c.includes("warning"))).toHaveLength(1);
  });

  it("does not add a warning column when the list has no name column", () => {
    const { baseElement } = renderList([{ title: "Age", className: "age", id: "age" }]);

    expect(baseElement.querySelectorAll(".TableHead .warning")).toHaveLength(0);
  });
});
