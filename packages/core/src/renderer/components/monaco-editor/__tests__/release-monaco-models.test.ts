/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// H7.6.3C: Monaco model lifetime. Monaco is mocked globally, so a small model registry stands in for it.
const models = new Map<string, { uri: { toString(): string }; dispose: jest.Mock }>();
let liveEditors: Array<{ getModel: () => { uri: { toString(): string } } | null }> = [];
let liveDiffEditors: Array<{ getModel: () => { original: { uri: { toString(): string } }; modified: { uri: { toString(): string } } } | null }> = [];

jest.mock("monaco-editor", () => ({
  Uri: { file: (path: string) => ({ toString: () => `file://${path}`, path }) },
  MarkerSeverity: {},
  editor: {
    getModel: (uri: { toString(): string }) => models.get(uri.toString()) ?? null,
    getEditors: () => liveEditors,
    getDiffEditors: () => liveDiffEditors,
  },
}));

import { releaseMonacoModels, flushMonacoRelease, isMonacoReleasePending } from "../release-monaco-models";

const addModel = (id: string) => {
  const uri = { toString: () => `file:///monaco-editor/${id}` };
  const model = { uri, dispose: jest.fn() };

  models.set(uri.toString(), model);

  return model;
};

describe("releaseMonacoModels (H7.6.3C)", () => {
  beforeEach(() => {
    models.clear();
    liveEditors = [];
    liveDiffEditors = [];
  });

  it("disposes the model and the diff-original model when no editor uses them", () => {
    const main = addModel("docked-edit:a:/x");
    const original = addModel("docked-edit:a:/x-diff-original");

    expect(releaseMonacoModels("docked-edit:a:/x")).toBe(true);
    expect(main.dispose).toHaveBeenCalledTimes(1);
    expect(original.dispose).toHaveBeenCalledTimes(1);
  });

  it("defers the dispose while a live editor still shows the model, and runs it on flush", () => {
    const main = addModel("docked-edit:a:/x");

    liveEditors = [{ getModel: () => main }];

    expect(releaseMonacoModels("docked-edit:a:/x")).toBe(false);
    expect(main.dispose).not.toHaveBeenCalled();
    expect(isMonacoReleasePending("docked-edit:a:/x")).toBe(true);

    liveEditors = []; // the editor unmounted
    expect(flushMonacoRelease("docked-edit:a:/x")).toBe(true);
    expect(main.dispose).toHaveBeenCalledTimes(1);
    expect(isMonacoReleasePending("docked-edit:a:/x")).toBe(false);
  });

  it("treats a diff editor on the modified model as a legitimate consumer", () => {
    const main = addModel("docked-edit:a:/x");
    const original = addModel("docked-edit:a:/x-diff-original");

    liveDiffEditors = [{ getModel: () => ({ original, modified: main }) }];

    expect(releaseMonacoModels("docked-edit:a:/x")).toBe(false);
    expect(main.dispose).not.toHaveBeenCalled();
    expect(original.dispose).not.toHaveBeenCalled();
  });

  it("never touches the model of another document or cluster", () => {
    const mine = addModel("docked-edit:a:/x");
    const other = addModel("docked-edit:b:/x");

    releaseMonacoModels("docked-edit:a:/x");

    expect(mine.dispose).toHaveBeenCalledTimes(1);
    expect(other.dispose).not.toHaveBeenCalled();
  });

  it("flush without a pending release does nothing", () => {
    const main = addModel("docked-edit:a:/x");

    expect(flushMonacoRelease("docked-edit:a:/x")).toBe(false);
    expect(main.dispose).not.toHaveBeenCalled();
  });
});
