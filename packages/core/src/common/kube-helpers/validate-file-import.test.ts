/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { isValidKubeconfigForFileImport } from "./validate-file-import";

const valid = `
apiVersion: v1
kind: Config
clusters:
- name: example
  cluster:
    server: https://127.0.0.1:6443
users:
- name: example
  user:
    token: fake-token-for-tests-only
contexts:
- name: example
  context:
    cluster: example
    user: example
current-context: example
`;

describe("Kubeconfig file import validation", () => {
  it("accepts a kubeconfig with a valid context", () => {
    expect(isValidKubeconfigForFileImport(valid)).toBe(true);
  });

  it("rejects a file path pasted as YAML", () => {
    expect(isValidKubeconfigForFileImport("/Users/example/.kube/config")).toBe(false);
  });

  it("rejects empty or malformed YAML without leaking parser errors", () => {
    expect(isValidKubeconfigForFileImport("")).toBe(false);
    expect(isValidKubeconfigForFileImport("contexts: [not-valid")).toBe(false);
  });

  it("rejects missing or broken contexts", () => {
    expect(isValidKubeconfigForFileImport("apiVersion: v1\nkind: Config\ncontexts: []")).toBe(false);
    expect(isValidKubeconfigForFileImport(valid.replace("cluster: example", "cluster: missing"))).toBe(false);
  });
});
