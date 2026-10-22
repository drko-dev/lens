/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { Pod, ReplicaSet } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import type { DiRender } from "../test-utils/renderFor";
import { renderFor } from "../test-utils/renderFor";
import apiManagerInjectable from "../../../common/k8s-api/api-manager/manager.injectable";
import getDetailsUrlInjectable from "../kube-detail-params/get-details-url.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { KubeObjectMeta } from "./kube-object-meta";

const rs = (uid: string, name = "rs") => new ReplicaSet({
  apiVersion: "apps/v1",
  kind: "ReplicaSet",
  metadata: { name, uid, namespace: "ns", resourceVersion: "1", selfLink: `/apis/apps/v1/namespaces/ns/replicasets/${name}` },
} as any);

const ownedPod = (...owners: { uid: string; name: string }[]) => new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "pod",
    uid: "pod-uid",
    namespace: "ns",
    resourceVersion: "1",
    selfLink: "/api/v1/namespaces/ns/pods/pod",
    ownerReferences: owners.map(o => ({ apiVersion: "apps/v1", kind: "ReplicaSet", controller: true, blockOwnerDeletion: true, ...o })),
  },
} as any);

describe("R4-07 KubeObjectMeta Controlled By", () => {
  let render: DiRender;
  let items: ReplicaSet[];

  beforeEach(() => {
    const di = getDiForUnitTesting();

    items = [];
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(getDetailsUrlInjectable, () => (link: string) => `/details?${link}`);
    di.override(apiManagerInjectable, () => ({
      lookupApiLink: (ref: { kind: string; name: string }) => (ref.kind === "ReplicaSet" ? `/apis/apps/v1/namespaces/ns/replicasets/${ref.name}` : ""),
      getStore: (link: string) => (link ? { items } : undefined),
    }) as any);
    const doRender = renderFor(di);

    render = ui => doRender(<MemoryRouter>{ui}</MemoryRouter>);
  });

  it("links only a uid-verified owner", () => {
    items = [rs("u1")];
    const { getByTestId } = render(<KubeObjectMeta object={ownedPod({ uid: "u1", name: "rs" })} />);
    const el = getByTestId("owner-ref-u1");

    expect(el.getAttribute("data-owner-state")).toBe("verified");
    expect(el.querySelector("a")).not.toBeNull();
  });

  it("marks a recreated owner as stale without a link", () => {
    items = [rs("u2")];
    const { getByTestId } = render(<KubeObjectMeta object={ownedPod({ uid: "u1", name: "rs" })} />);
    const el = getByTestId("owner-ref-u1");

    expect(el.getAttribute("data-owner-state")).toBe("stale");
    expect(el.querySelector("a")).toBeNull();
    expect(el.textContent).toContain("stale reference (owner recreated, uid mismatch)");
  });

  it("renders plain text for missing owners, including kinds without an api", () => {
    const { getByTestId } = render(<KubeObjectMeta object={ownedPod({ uid: "u1", name: "rs" }, { uid: "u3", name: "x" })} />);
    const el = getByTestId("owner-ref-u1");

    expect(el.getAttribute("data-owner-state")).toBe("missing");
    expect(el.querySelector("a")).toBeNull();
    expect(el.textContent).toBe("ReplicaSet rs (not loaded)");
    expect(getByTestId("owner-ref-u3").getAttribute("data-owner-state")).toBe("missing");
  });
});
