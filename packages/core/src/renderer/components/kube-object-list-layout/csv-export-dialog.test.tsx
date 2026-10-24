/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { fireEvent, act } from "@testing-library/react";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import { CsvExportDialog } from "./csv-export-dialog";
import type { ColumnExportMeta } from "./kube-csv-extractor";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import directoryForKubeConfigsInjectable from "../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";

describe("csv-export-dialog", () => {
  let di: DiContainer;
  let render: ReturnType<typeof renderFor>;
  let writeTextMock: jest.Mock;
  let createObjectURLMock: jest.Mock;
  let clickAnchorMock: jest.Mock;

  beforeEach(() => {
    di = getDiForUnitTesting();
    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    render = renderFor(di);

    writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    createObjectURLMock = jest.fn(() => "blob:mock-url");
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = jest.fn();

    clickAnchorMock = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickAnchorMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockColumns: ColumnExportMeta<any>[] = [
    { id: "name", header: "Name", extractValue: (item: any) => item.metadata?.name },
    { id: "namespace", header: "Namespace", extractValue: (item: any) => item.metadata?.namespace },
    { id: "status", header: "Status", extractValue: (item: any) => item.status },
  ];

  const mockItems = [
    { metadata: { name: "pod-1", namespace: "default" }, status: "Running" },
    { metadata: { name: "pod-2", namespace: "kube-system" }, status: "CrashLoopBackOff" },
  ];

  it("renders export dialog with cluster name, columns list, and default CSV format", () => {
    const close = jest.fn();
    const result = render((
      <CsvExportDialog
        isOpen={true}
        close={close}
        clusterName="production-cluster"
        resourceKind="Pods"
        filteredItems={mockItems as any}
        selectedItems={[]}
        columns={mockColumns}
      />
    ));

    expect(result.getByTestId("csv-export-dialog")).toBeInTheDocument();
    expect(result.getByTestId("csv-export-cluster-name")).toHaveTextContent("production-cluster");
    expect(result.getByTestId("csv-export-filtered-count")).toHaveTextContent("2 items");
    expect(result.getByText(/CSV \(Comma-separated/i)).toBeInTheDocument();
    expect(result.getByText(/JSON \(Structured/i)).toBeInTheDocument();
    expect(result.getByTestId("csv-export-confirm-btn")).toHaveTextContent("Download CSV");
  });

  it("switches format to JSON and updates confirm button text", () => {
    const close = jest.fn();
    const result = render((
      <CsvExportDialog
        isOpen={true}
        close={close}
        clusterName="production-cluster"
        resourceKind="Pods"
        filteredItems={mockItems as any}
        selectedItems={[]}
        columns={mockColumns}
      />
    ));

    const jsonRadio = result.getByText(/JSON \(Structured/i);

    fireEvent.click(jsonRadio);

    expect(result.getByTestId("csv-export-confirm-btn")).toHaveTextContent("Download JSON");
  });

  it("triggers clipboard writeText with CSV content when format is CSV", async () => {
    const close = jest.fn();
    const result = render((
      <CsvExportDialog
        isOpen={true}
        close={close}
        clusterName="production-cluster"
        resourceKind="Pods"
        filteredItems={mockItems as any}
        selectedItems={[]}
        columns={mockColumns}
      />
    ));

    const copyBtn = result.getByTestId("table-export-copy-btn");

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedText = writeTextMock.mock.calls[0][0];

    expect(copiedText).toContain("Name,Namespace,Status");
    expect(copiedText).toContain("pod-1,default,Running");
    expect(copyBtn).toHaveTextContent("Copied!");
  });

  it("triggers clipboard writeText with JSON content when format is JSON", async () => {
    const close = jest.fn();
    const result = render((
      <CsvExportDialog
        isOpen={true}
        close={close}
        clusterName="production-cluster"
        resourceKind="Pods"
        filteredItems={mockItems as any}
        selectedItems={[]}
        columns={mockColumns}
      />
    ));

    fireEvent.click(result.getByText(/JSON \(Structured/i));

    const copyBtn = result.getByTestId("table-export-copy-btn");

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedText = writeTextMock.mock.calls[0][0];
    const parsed = JSON.parse(copiedText);

    expect(parsed).toEqual([
      { Name: "pod-1", Namespace: "default", Status: "Running" },
      { Name: "pod-2", Namespace: "kube-system", Status: "CrashLoopBackOff" },
    ]);
  });

  it("downloads JSON and closes dialog when confirming JSON export", () => {
    const close = jest.fn();
    const result = render((
      <CsvExportDialog
        isOpen={true}
        close={close}
        clusterName="production-cluster"
        resourceKind="Pods"
        filteredItems={mockItems as any}
        selectedItems={[]}
        columns={mockColumns}
      />
    ));

    fireEvent.click(result.getByText(/JSON \(Structured/i));
    fireEvent.click(result.getByTestId("csv-export-confirm-btn"));

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickAnchorMock).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
