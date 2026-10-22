/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface ParsedContainerImage {
  raw: string;
  registry: string;
  repository: string;
  tag: string;
  digest?: string;
  isDigestPinned: boolean;
  isFloatingTag: boolean;
  isSemver: boolean;
}

const FLOATING_TAGS = new Set(["latest", "edge", "main", "master", "nightly", "dev", "canary"]);
const SEMVER_REGEX = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)(\.(0|[1-9]\d*))?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/**
 * Parses a container image string safely without contacting any registry or exposing secrets.
 */
export function parseContainerImage(raw: string): ParsedContainerImage {
  const trimmed = (raw || "").trim();

  if (!trimmed) {
    return {
      raw: "",
      registry: "",
      repository: "",
      tag: "",
      isDigestPinned: false,
      isFloatingTag: false,
      isSemver: false,
    };
  }

  let imagePart = trimmed;
  let digest: string | undefined = undefined;

  // Check for digest (@sha256:...)
  const atIdx = imagePart.indexOf("@");

  if (atIdx !== -1) {
    digest = imagePart.substring(atIdx + 1);
    imagePart = imagePart.substring(0, atIdx);
  }

  // Separate registry / repository and tag
  let tag = "";
  const lastColonIdx = imagePart.lastIndexOf(":");
  const lastSlashIdx = imagePart.lastIndexOf("/");

  if (lastColonIdx > lastSlashIdx) {
    tag = imagePart.substring(lastColonIdx + 1);
    imagePart = imagePart.substring(0, lastColonIdx);
  }

  let registry = "docker.io";
  let repository = imagePart;

  const slashIdx = imagePart.indexOf("/");

  if (slashIdx !== -1) {
    const firstSegment = imagePart.substring(0, slashIdx);

    if (firstSegment.includes(".") || firstSegment.includes(":") || firstSegment === "localhost") {
      registry = firstSegment;
      repository = imagePart.substring(slashIdx + 1);
    }
  }

  const isDigestPinned = Boolean(digest && digest.startsWith("sha256:"));
  const effectiveTag = tag || (isDigestPinned ? "" : "latest");
  const isFloatingTag = !isDigestPinned && (FLOATING_TAGS.has(effectiveTag.toLowerCase()) || !tag);
  const isSemver = Boolean(tag && SEMVER_REGEX.test(tag));

  return {
    raw: trimmed,
    registry,
    repository,
    tag: effectiveTag,
    digest,
    isDigestPinned,
    isFloatingTag,
    isSemver,
  };
}

export type DeclaredImageKind = "digest-pinned" | "tag" | "untagged";
export type RuntimeImageStatus = "resolved" | "unresolved" | "unparseable";

export interface ContainerImageProvenance {
  declared: ParsedContainerImage;
  declaredKind: DeclaredImageKind;
  /** Digest (sha256:<64hex>) reported by the runtime, when parseable. */
  runtimeDigest?: string;
  /** Raw imageID as reported by the runtime (kept even when unparseable). */
  runtimeImageId: string;
  runtimeStatus: RuntimeImageStatus;
  /** True only when the spec is digest-pinned and the runtime digest differs. */
  mismatch: boolean;
  /** Constant: registries are never contacted, so nothing is verified remotely. */
  registryMetadataVerified: false;
}

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const IMAGE_ID_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;

/**
 * Describes declared (spec) vs runtime (status.imageID) image identity. Pure; no network.
 */
export function describeContainerImage(specImage: string, imageID?: string): ContainerImageProvenance {
  const declared = parseContainerImage(specImage);
  const namePart = declared.raw.split("@")[0];
  const hasTag = namePart.lastIndexOf(":") > namePart.lastIndexOf("/");
  const declaredKind: DeclaredImageKind = declared.digest !== undefined && SHA256_DIGEST.test(declared.digest)
    ? "digest-pinned"
    : hasTag ? "tag" : "untagged";

  const runtimeImageId = (imageID ?? "").trim();
  let runtimeDigest: string | undefined;
  let runtimeStatus: RuntimeImageStatus = "unresolved";

  if (runtimeImageId) {
    const stripped = runtimeImageId.replace(IMAGE_ID_SCHEME, "");
    const candidate = stripped.includes("@") ? stripped.substring(stripped.lastIndexOf("@") + 1) : stripped;

    if (SHA256_DIGEST.test(candidate)) {
      runtimeDigest = candidate;
      runtimeStatus = "resolved";
    } else {
      runtimeStatus = "unparseable";
    }
  }

  const mismatch = declaredKind === "digest-pinned"
    && runtimeDigest !== undefined
    && declared.digest !== runtimeDigest;

  return {
    declared,
    declaredKind,
    runtimeDigest,
    runtimeImageId,
    runtimeStatus,
    mismatch,
    registryMetadataVerified: false,
  };
}
