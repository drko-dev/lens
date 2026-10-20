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
import { buildCsv, downloadCsv, generateCsvFilename } from "../../utils/csv/csv-builder";
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
  const [exportScope, setExportScope] = useState<"filtered" | "selected">("filtered");
  const hasSelection = selectedItems.length > 0;

  const onConfirmExport = () => {
    const itemsToExport = (hasSelection && exportScope === "selected")
      ? selectedItems
      : filteredItems;

    const headers = columns.map(c => c.header);
    const rows = itemsToExport.map(item => (
      columns.map(col => col.extractValue(item))
    ));

    const csvContent = buildCsv(headers, rows);
    const filename = generateCsvFilename(clusterName, resourceKind);

    downloadCsv(csvContent, filename);
    close();
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
        <span>Export {resourceKind} to CSV</span>
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
            {filteredItems.length} items
          </div>
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
          <strong>Security Policy:</strong> Values starting with formula characters (=, +, -, @) are sanitized with leading apostrophes to protect spreadsheet users.
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
          primary
          onClick={onConfirmExport}
          data-testid="csv-export-confirm-btn"
        >
          <Icon material="download" small style={{ marginRight: 6 }} />
          Download CSV
        </Button>
      </div>
    </Dialog>
  );
}
