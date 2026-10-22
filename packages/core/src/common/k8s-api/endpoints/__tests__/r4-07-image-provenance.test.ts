/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describeContainerImage } from "../container-image";

const A = `sha256:${"a".repeat(64)}`;
const B = `sha256:${"b".repeat(64)}`;

describe("describeContainerImage", () => {
  it("tag + resolved", () => {
    const r = describeContainerImage("nginx:1.25", `docker-pullable://nginx@${A}`);

    expect(r.declaredKind).toBe("tag");
    expect(r.declared.repository).toBe("nginx");
    expect(r.runtimeDigest).toBe(A);
    expect(r.runtimeStatus).toBe("resolved");
    expect(r.mismatch).toBe(false);
    expect(r.registryMetadataVerified).toBe(false);
  });

  it("implicit latest", () => {
    expect(describeContainerImage("nginx").declaredKind).toBe("untagged");
  });

  it("digest-pinned match", () => {
    const r = describeContainerImage(`nginx@${A}`, `containerd://${A}`);

    expect(r.declaredKind).toBe("digest-pinned");
    expect(r.mismatch).toBe(false);
  });

  it("digest-pinned mismatch", () => {
    const r = describeContainerImage(`nginx:1.25@${A}`, `cri-o://nginx@${B}`);

    expect(r.declaredKind).toBe("digest-pinned");
    expect(r.runtimeDigest).toBe(B);
    expect(r.mismatch).toBe(true);
  });

  it.each([
    `docker-pullable://repo/img@${A}`,
    `docker://${A}`,
    `containerd://${A}`,
    `cri-o://repo/img@${A}`,
    `repo/img@${A}`,
    A,
  ])("parses imageID %s", (id) => {
    const r = describeContainerImage("repo/img:1", id);

    expect(r.runtimeDigest).toBe(A);
    expect(r.runtimeStatus).toBe("resolved");
  });

  it.each([undefined, "", "  "])("unresolved for %p", (id) => {
    const r = describeContainerImage(`nginx@${A}`, id);

    expect(r.runtimeStatus).toBe("unresolved");
    expect(r.runtimeDigest).toBeUndefined();
    expect(r.mismatch).toBe(false);
  });

  it("garbage imageID is unparseable and raw is kept", () => {
    const r = describeContainerImage(`nginx@${A}`, "docker://garbage");

    expect(r.runtimeStatus).toBe("unparseable");
    expect(r.runtimeImageId).toBe("docker://garbage");
    expect(r.mismatch).toBe(false);
  });

  it("registry with port is not mistaken for a tag", () => {
    const r = describeContainerImage("localhost:5000/team/app");

    expect(r.declared.registry).toBe("localhost:5000");
    expect(r.declaredKind).toBe("untagged");
    expect(describeContainerImage("reg.io:5000/app:v1").declaredKind).toBe("tag");
  });

  it.each([
    "sha256:abc",
    `sha256:${"A".repeat(64)}`,
    `sha512:${"a".repeat(64)}`,
    `sha256:${"a".repeat(63)}`,
  ])("rejects invalid runtime digest %s", (d) => {
    expect(describeContainerImage("nginx:1", `docker://nginx@${d}`).runtimeStatus).toBe("unparseable");
  });

  it("invalid declared digest is not digest-pinned", () => {
    expect(describeContainerImage("nginx@sha256:abc", A).declaredKind).toBe("untagged");
    expect(describeContainerImage("nginx:1@sha256:abc", A).declaredKind).toBe("tag");
  });
});
