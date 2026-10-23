/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Conservative mapping of a JSON pointer (as returned by the Kubernetes API
 * server in `details.causes[].field`) to a line in the block-style YAML shown
 * in the editor.
 *
 * The scanner only claims a line when the YAML is plain block style. It gives
 * up (returns `undefined`) for anything it cannot map reliably — flow
 * containers, block scalars, anchors, aliases, tags or multi-document files.
 * No marker is ever invented.
 */

export interface YamlLineLocation {
  line: number;
  column: number;
}

interface ScanContext {
  indent: number;
  path: string;
}

const decodePointerToken = (token: string) => token.replace(/~1/g, "/").replace(/~0/g, "~");

const KEY_PATTERN = /^(\s*)(["']?)([^:"'\s][^:]*)\2\s*:(?:\s+(.*))?$/;
const SEQUENCE_ITEM_PATTERN = /^(\s*)-\s+(.*)$/;

const isCommentOrBlank = (line: string) => line.trim() === "" || line.trimStart().startsWith("#");

const valueIsBlockScalar = (value: string | undefined) => value !== undefined && /^[|>][+-]?\d*\s*(#.*)?$/.test(value.trim());

const flowBalance = (value: string): number => {
  let balance = 0;

  for (const char of value) {
    if (char === "{" || char === "[") balance++;
    else if (char === "}" || char === "]") balance--;
  }

  return balance;
};

const stripQuotes = (key: string) => {
  if (key.length >= 2 && ((key.startsWith("\"") && key.endsWith("\"")) || (key.startsWith("'") && key.endsWith("'")))) {
    return key.slice(1, -1);
  }

  return key;
};

const sanitizeKey = (key: string): string | undefined => {
  const stripped = stripQuotes(key);

  // Give up on keys that could confuse a line-based scanner.
  if (/[{}[\]|>&*!]/.test(stripped)) {
    return undefined;
  }

  return stripped;
};

export const mapJsonPointerToYamlLine = (yamlText: string, jsonPointer: string): YamlLineLocation | undefined => {
  if (!jsonPointer.startsWith("/") || yamlText.includes("\n---") || yamlText.startsWith("---")) {
    return undefined;
  }

  const tokens = jsonPointer
    .split("/")
    .slice(1)
    .map(decodePointerToken);

  if (tokens.length === 0 || tokens.some(token => token === "")) {
    return undefined;
  }

  const lines = yamlText.split("\n");
  const linesByPath = new Map<string, YamlLineLocation>();
  const flowContainerPaths = new Set<string>();
  const stack: ScanContext[] = [{ indent: -1, path: "" }];
  const sequenceCounters = new Map<string, number>();
  // When set, lines indented deeper than `skipDeeperThan` belong to a block
  // scalar or multi-line flow value and must not be scanned.
  let skipDeeperThan: number | undefined;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (isCommentOrBlank(line)) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

    if (skipDeeperThan !== undefined && indent > skipDeeperThan) {
      continue;
    }

    skipDeeperThan = undefined;

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    const sequenceMatch = SEQUENCE_ITEM_PATTERN.exec(line);

    if (sequenceMatch && sequenceMatch[1].length === indent) {
      const counterKey = parent.path;
      const nextIndex = sequenceCounters.get(counterKey) ?? 0;

      sequenceCounters.set(counterKey, nextIndex + 1);

      const itemPath = `${parent.path}/${nextIndex}`;
      const location = { line: index + 1, column: indent + 1 };

      linesByPath.set(itemPath, location);
      stack.push({ indent, path: itemPath });

      const inlineContent = sequenceMatch[2];
      const inlineKeyMatch = KEY_PATTERN.exec(` ${inlineContent}`);

      if (inlineKeyMatch) {
        const key = sanitizeKey(inlineKeyMatch[3]);

        if (key === undefined) {
          return undefined;
        }

        const entryPath = `${itemPath}/${key}`;

        linesByPath.set(entryPath, location);

        const value = inlineKeyMatch[4];

        if (valueIsBlockScalar(value)) {
          skipDeeperThan = indent;
        } else if (value !== undefined && value.includes("{")) {
          flowContainerPaths.add(entryPath);

          if (flowBalance(value) > 0) {
            skipDeeperThan = indent;
          }
        }
      } else if (inlineContent !== "" && !inlineContent.startsWith("- ") && inlineContent !== "-") {
        // Scalar sequence item: nothing nested can point into it.
        continue;
      }

      continue;
    }

    const keyMatch = KEY_PATTERN.exec(line);

    if (!keyMatch || keyMatch[1].length !== indent) {
      // Not a plain block mapping entry: refuse to guess.
      return undefined;
    }

    const key = sanitizeKey(keyMatch[3]);

    if (key === undefined) {
      return undefined;
    }

    const path = `${parent.path}/${key}`;
    const location = { line: index + 1, column: indent + 1 };

    linesByPath.set(path, location);
    stack.push({ indent, path });

    const value = keyMatch[4];

    if (valueIsBlockScalar(value)) {
      skipDeeperThan = indent;
    } else if (value !== undefined && value.includes("{")) {
      flowContainerPaths.add(path);

      if (flowBalance(value) > 0) {
        skipDeeperThan = indent;
      }
    }
  }

  // Walk the pointer: every prefix must exist and none may pass through a
  // flow container.
  let prefix = "";

  for (const token of tokens) {
    prefix = `${prefix}/${token}`;

    if (flowContainerPaths.has(prefix) || !linesByPath.has(prefix)) {
      return undefined;
    }
  }

  return linesByPath.get(prefix);
};
