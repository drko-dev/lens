/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { observable } from "mobx";
import { Deployment, Pod, ReplicaSet } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import directoryForKubeConfigsInjectable from "../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { Cluster } from "../../../common/cluster/cluster";
import podStoreInjectable from "../workloads-pods/store.injectable";
import replicaSetStoreInjectable from "../workloads-replicasets/store.injectable";
import deploymentStoreInjectable from "./store.injectable";

const labels = { app: "web" };
const meta = (name: string, uid: string, namespace = "ns", ownerReferences?: any[]) => ({
  name, uid, namespace, resourceVersion: "1", selfLink: `/x/${name}`, labels, ownerReferences,
});
const owner = (kind: string, name: string, uid: string) => ({ apiVersion: "apps/v1", kind, name, uid, controller: true, blockOwnerDeletion: true });

const deployment = new Deployment({
  apiVersion: "apps/v1", kind: "Deployment", metadata: meta("web", "d1"),
  spec: { replicas: 1, selector: { matchLabels: labels }, template: { metadata: { labels }, spec: {}}, strategy: {}},
} as any);
const rs = (name: string, uid: string, ownerUid = "d1", ns = "ns") => new ReplicaSet({
  apiVersion: "apps/v1", kind: "ReplicaSet", metadata: meta(name, uid, ns, [owner("Deployment", "web", ownerUid)]),
} as any);
const pod = (name: string, ownerRefs?: any[], ns = "ns") => new Pod({
  apiVersion: "v1", kind: "Pod", metadata: meta(name, `uid-${name}`, ns, ownerRefs),
} as any);

describe("R4-07 DeploymentStore.getChildPods", () => {
  it("returns only pods owned via the deployment's ReplicaSets", () => {
    const di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(hostedClusterInjectable, () => new Cluster({
      contextName: "c", id: "id", kubeConfigPath: "/p",
    }));

    di.inject(replicaSetStoreInjectable).items = observable.array([
      rs("rs-new", "rs1"),
      rs("rs-old", "rs2"),
      rs("rs-other-deploy", "rs3", "d-other"),
    ]);
    di.inject(podStoreInjectable).items = observable.array([
      pod("current", [owner("ReplicaSet", "rs-new", "rs1")]),
      pod("old", [owner("ReplicaSet", "rs-old", "rs2")]),
      pod("other-controller", [owner("ReplicaSet", "rs-other-deploy", "rs3")]),
      pod("daemon", [owner("DaemonSet", "ds", "ds1")]),
      pod("no-owner"),
      pod("other-ns", [owner("ReplicaSet", "rs-new", "rs1")], "other"),
    ]);

    const names = di.inject(deploymentStoreInjectable).getChildPods(deployment).map(p => p.getName());

    expect(names.sort()).toEqual(["current", "old"]);
  });
});
