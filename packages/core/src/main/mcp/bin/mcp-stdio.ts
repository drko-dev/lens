#!/usr/bin/env node
/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { OpenLensMcpServer } from "../mcp-server";

// Start standalone stdio MCP server
const server = new OpenLensMcpServer();
server.startStdio(process.stdin, process.stdout);
