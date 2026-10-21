#!/usr/bin/env node
/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { McpServerContext } from "../mcp-server";
import { OpenLensMcpServer } from "../mcp-server";

export function startMcpStdio(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
  context?: McpServerContext,
): () => void {
  return new OpenLensMcpServer(context).startStdio(input, output);
}

if (require.main === module) {
  startMcpStdio();
}
