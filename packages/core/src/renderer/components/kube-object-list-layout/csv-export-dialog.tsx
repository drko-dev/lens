/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useState } from "react";
import { Dialog } from "../dialog";
import { Button } from "@openlens/button";
import { Icon } from "../icon";
import { Radio, RadioGroup } from "../radio";
import type { KubeObject } from "@openlens/kube-object";
import type { ColumnExportMeta } from "./kube-csv-extractor";
import { buildCsv, buildJson, copyToClipboard, downloadCsv, downloadJson, generateExportFilename } from "../../utils/csv/csv-builder";
import styles from "./csv-export-dialog.module.scss";

export interface CsvExportDialogProps<K extends KubeObject> {
  isOpen: boolean;
  close: () => void;
  clusterName?: string;
  resourceKind: string;
  filteredItems: K[];
  selectedItems: K[];
  columns: ColumnExportMeta<K>[];
  isSecret?: boolean;
}

export function CsvExportDialog<K extends KubeObject>({
  isOpen,
  close,
  clusterName,
  resourceKind,
  filteredItems,
  selectedItems,
  columns,
  isSecret = false,
}: CsvExportDialogProps<K>) {
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [exportScope, setExportScope] = useState<"filtered" | "selected">("filtered");
  const [copied, setCopied] = useState<boolean>(false);
  const hasSelection = selectedItems.length > 0;

  const getExportData = () => {
    const itemsToExport = (hasSelection && exportScope === "selected")
      ? selectedItems
      : filteredItems;

    const headers = columns.map(c => c.header);
    const rows = itemsToExport.map(item => (
      columns.map(col => col.extractValue(item))
    ));

    return { headers, rows };
  };

  const getExportContent = () => {
    const { headers, rows } = getExportData();

    if (exportFormat === "json") {
      return buildJson(headers, rows);
    }

    return buildCsv(headers, rows);
  };

  const onConfirmExport = () => {
    const content = getExportContent();
    const filename = generateExportFilename(clusterName, resourceKind, exportFormat);

    if (exportFormat === "json") {
      downloadJson(content, filename);
    } else {
      downloadCsv(content, filename);
    }

    close();
  };

  const onCopyToClipboard = async () => {
    const content = getExportContent();
    const success = await copyToClipboard(content);

    if (success) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      close={close}
      animated={false}
      className={styles.dialog}
      data-testid="csv-export-dialog"
    >
      <div className={styles.header}>
        <Icon material="file_download" />
        <span>{`Export ${resourceKind}`}</span>
      </div>

      <div className={styles.content}>
        <div className={styles.infoGrid}>
          <div className={styles.label}>Cluster:</div>
          <div className={styles.value} data-testid="csv-export-cluster-name">
            {clusterName || "Current Cluster"}
          </div>

          <div className={styles.label}>Resource:</div>
          <div className={styles.value}>{resourceKind}</div>

          <div className={styles.label}>Visible Columns:</div>
          <div className={styles.value}>
            <div className={styles.columnsList} data-testid="csv-export-columns">
              {columns.map(col => (
                <span key={col.id} className={styles.columnBadge}>
                  {col.header}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.label}>Total Filtered:</div>
          <div className={styles.value} data-testid="csv-export-filtered-count">
            {filteredItems.length}
            {" "}
            items
          </div>
        </div>

        <div className={styles.radioGroup}>
          <div className={styles.label}>Format:</div>
          <RadioGroup
            value={exportFormat}
            onChange={val => setExportFormat(val as "csv" | "json")}
          >
            <Radio
              value="csv"
              label="CSV (Comma-separated values for spreadsheets)"
              data-testid="table-export-format-csv"
            />
            <Radio
              value="json"
              label="JSON (Structured data for scripts & tools)"
              data-testid="table-export-format-json"
            />
          </RadioGroup>
        </div>

        {hasSelection && (
          <div className={styles.radioGroup}>
            <div className={styles.label}>Export Scope:</div>
            <RadioGroup
              value={exportScope}
              onChange={val => setExportScope(val as "filtered" | "selected")}
            >
              <Radio
                value="filtered"
                label={`All filtered rows (${filteredItems.length})`}
                data-testid="csv-export-scope-filtered"
              />
              <Radio
                value="selected"
                label={`Selected rows only (${selectedItems.length})`}
                data-testid="csv-export-scope-selected"
              />
            </RadioGroup>
          </div>
        )}

        <div className={styles.securityNote}>
          <strong>Security Policy:</strong>
          {" "}
          Values starting with formula characters (=, +, -, @) are sanitized with leading apostrophes in CSV to protect spreadsheet users.
          {isSecret && (
            <div style={{ marginTop: 4, color: "var(--colorWarning)" }}>
              Strict Secret Protection active: secret data, tokens, and sensitive values are excluded from the export.
            </div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          plain
          onClick={close}
          data-testid="csv-export-cancel-btn"
        >
          Cancel
        </Button>
        <Button
          outlined
          onClick={onCopyToClipboard}
          data-testid="table-export-copy-btn"
        >
          <Icon
            material={copied ? "check" : "content_copy"}
            small
            style={{ marginRight: 6 }} />
          {copied ? "Copied!" : "Copy to Clipboard"}
        </Button>
        <Button
          primary
          onClick={onConfirmExport}
          data-testid="csv-export-confirm-btn"
        >
          <Icon
            material="download"
            small
            style={{ marginRight: 6 }} />
          {`Download ${exportFormat.toUpperCase()}`}
        </Button>
      </div>
    </Dialog>
  );
}
