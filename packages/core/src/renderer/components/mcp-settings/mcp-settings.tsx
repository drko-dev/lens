/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./mcp-settings.scss";

import React from "react";
import { observer } from "mobx-react";
import { Badge } from "../badge";
import { ALLOWLISTED_MCP_TOOLS, McpToolDefinition } from "../../../common/mcp/types";

@observer
export class McpSettings extends React.Component {
  render() {
    return (
      <div className="McpSettingsView" data-testid="mcp-settings-view">
        <div className="status-banner" data-testid="mcp-server-status-banner">
          <div className="banner-title">
            <span className="dot" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
            OpenLens DevOps MCP Server: Ready (Local stdio)
          </div>
          <div className="banner-desc">
            Local, vendor-independent Model Context Protocol (MCP) server providing strictly read-only access to cluster resources over standard input/output. No cloud account or external SaaS connection required.
          </div>
        </div>

        <div className="section-card">
          <h3>Connection Command</h3>
          <p>Configure this command in your AI assistant or local MCP client (Claude Desktop, Antigravity, OpenCode):</p>
          <div className="command-box">
            node /Users/gustavomarcon/Documents/lens/lens/packages/core/dist/main/mcp/bin/mcp-stdio.js
          </div>
        </div>

        <div className="section-card">
          <h3>Allowlisted Read-Only Tools ({ALLOWLISTED_MCP_TOOLS.length})</h3>
          <p>These tools are exposed to connected clients with strict response limits and data sanitization:</p>
          <div className="tools-list">
            {ALLOWLISTED_MCP_TOOLS.map((tool: McpToolDefinition) => (
              <div key={tool.name} className="tool-item">
                <div className="tool-info">
                  <span className="tool-name">{tool.name}</span>
                  <span className="tool-desc">{tool.description}</span>
                </div>
                <Badge label="Read-Only" style={{ background: "#10b981", color: "#fff" }} />
              </div>
            ))}
          </div>
        </div>

        <div className="safeguards-box">
          <h4>Active Security Safeguards</h4>
          <ul>
            <li><strong>Zero Write Operations:</strong> Methods `create`, `apply`, `delete`, `patch`, and `scale` are blocked at protocol level with code -32001.</li>
            <li><strong>No Arbitrary Execution:</strong> Interactive shells, `pod_exec`, and `port_forward` are strictly disabled.</li>
            <li><strong>Automatic Redaction:</strong> Bearer tokens, private keys, certificates, and Secret payloads are sanitized before output.</li>
            <li><strong>Resource Caps:</strong> Queries are capped to a maximum of 50 items and 100 log lines to prevent memory exhaustion.</li>
          </ul>
        </div>
      </div>
    );
  }
}
