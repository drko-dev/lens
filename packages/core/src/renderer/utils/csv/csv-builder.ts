/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface CsvBuildOptions {
  /**
   * Prepend UTF-8 Byte Order Mark (\uFEFF) to guarantee correct Unicode decoding in Excel/Calc.
   * @default true
   */
  withBom?: boolean;

  /**
   * Field separator.
   * @default ","
   */
  delimiter?: string;

  /**
   * Row separator (RFC 4180 standard is CRLF).
   * @default "\r\n"
   */
  newline?: string;
}

/**
 * Characters that trigger formula evaluation when present at the beginning of a cell in
 * Microsoft Excel, LibreOffice Calc, or Google Sheets.
 */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "|", "%"]);

/**
 * Regex matching leading whitespace and control characters (including tabs, newlines, null bytes).
 */
const LEADING_CONTROL_CHARS_REGEX = /^[\s\x00-\x1F\x7F-\x9F]+/;

/**
 * Mitigates CSV Formula Injection (CWE-1236).
 *
 * If a cell string, after trimming leading whitespace or control characters (such as tab, CR, LF, null byte),
 * starts with '=', '+', '-', '@', '|', or '%', an apostrophe (') is prepended.
 * In spreadsheet processors (Excel, LibreOffice Calc), a leading apostrophe forces the field to be
 * interpreted strictly as text/literal data, disarming formula execution and DDE links.
 */
export function sanitizeFormulaInjection(value: string): string {
  if (!value) {
    return value;
  }

  // Find the first character after any leading whitespace or control characters
  const trimmedLeading = value.replace(LEADING_CONTROL_CHARS_REGEX, "");

  if (trimmedLeading.length > 0 && FORMULA_TRIGGER_CHARS.has(trimmedLeading[0])) {
    return `'${value}`;
  }

  return value;
}

/**
 * Escapes an individual cell value according to RFC 4180 with security sanitization.
 */
export function escapeCsvCell(raw: unknown, delimiter = ","): string {
  if (raw === null || raw === undefined) {
    return "";
  }

  if (raw instanceof Date) {
    return `"${raw.toISOString()}"`;
  }

  if (typeof raw === "boolean" || typeof raw === "number") {
    const numStr = String(raw);
    // Even numbers might have leading '-' which is safe if numeric, but let's check
    if (typeof raw === "number") {
      return numStr;
    }
    return numStr;
  }

  let str = String(raw);

  // Apply formula injection defense
  str = sanitizeFormulaInjection(str);

  // Check if cell needs RFC 4180 quoting
  const needsQuotes = (
    str.includes('"')
    || str.includes(delimiter)
    || str.includes("\r")
    || str.includes("\n")
    || str.startsWith("'")
    || str.startsWith(" ")
    || str.endsWith(" ")
  );

  if (needsQuotes) {
    // RFC 4180: double any internal quotes
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Serializes headers and tabular rows into a secure, standard CSV string.
 */
export function buildCsv(
  headers: (string | unknown)[],
  rows: (unknown[])[],
  options: CsvBuildOptions = {},
): string {
  const {
    withBom = true,
    delimiter = ",",
    newline = "\r\n",
  } = options;

  const headerLine = headers.map(h => escapeCsvCell(h, delimiter)).join(delimiter);

  const rowLines = rows.map(row => (
    row.map(cell => escapeCsvCell(cell, delimiter)).join(delimiter)
  ));

  const allLines = [headerLine, ...rowLines];
  const csvBody = allLines.join(newline);

  return withBom ? `\uFEFF${csvBody}` : csvBody;
}

/**
 * Generates a clean, filesystem-safe filename for exported CSVs.
 * Format: openlens-devops_<cluster-alias>_<kind>_<YYYYMMDD-HHmmss>.csv
 */
export function generateCsvFilename(
  clusterName: string | undefined,
  resourceKind: string,
  date: Date = new Date(),
): string {
  const safeCluster = (clusterName || "cluster")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "cluster";

  const safeKind = resourceKind
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "resources";

  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const timestamp = `${yyyy}${mm}${dd}-${hh}${min}${ss}`;

  return `openlens-devops_${safeCluster}_${safeKind}_${timestamp}.csv`;
}

/**
 * Triggers a secure browser download of CSV content as a Blob.
 * Cleans up the generated object URL to prevent memory leaks.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  if (typeof window === "undefined" || !window.URL || !window.document) {
    return;
  }

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.setAttribute("download", filename);
  link.setAttribute("rel", "noopener noreferrer");
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Allow download trigger before revoking object URL
  setTimeout(() => {
    try {
      window.URL.revokeObjectURL(objectUrl);
    } catch {
      // Ignored if already cleaned up
    }
  }, 1000);
}
