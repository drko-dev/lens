// Standalone MCP stdio Client Verification for OpenLens DevOps R3-07
const { PassThrough } = require("stream");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const { OpenLensMcpServer } = require(path.join(projectRoot, "packages/core/src/main/mcp/mcp-server"));

(async () => {
  console.log("[R3-07 MCP Stdio Client] Starting MCP Server stdio integration test...");

  const server = new OpenLensMcpServer({
    getClusters: () => [
      {
        id: "prod-cluster-1",
        name: "production-eu-west",
        environment: "Production",
        isProduction: true,
        isOnline: true,
      },
    ],
  });

  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();

  server.startStdio(clientToServer, serverToClient);

  let currentResolver = null;
  serverToClient.on("data", (chunk) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      if (currentResolver) {
        const resolve = currentResolver;
        currentResolver = null;
        resolve(parsed);
      }
    }
  });

  const send = (req) => {
    return new Promise((resolve) => {
      currentResolver = resolve;
      clientToServer.write(JSON.stringify(req) + "\n");
    });
  };

  try {
    // 1. Initialize
    console.log("[R3-07 MCP Stdio Client] Sending initialize...");
    const initRes = await send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "test-stdio-client", version: "1.0.0" },
      },
    });
    console.log("[R3-07 MCP Stdio Client] Initialize response:", JSON.stringify(initRes.result.serverInfo));
    if (initRes.result.serverInfo.name !== "openlens-devops-mcp") {
      throw new Error("Unexpected server name: " + initRes.result.serverInfo.name);
    }

    // 2. tools/list
    console.log("[R3-07 MCP Stdio Client] Listing tools...");
    const listRes = await send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    const tools = listRes.result.tools.map(t => t.name);
    console.log(`[R3-07 MCP Stdio Client] Found ${tools.length} allowlisted tools:`, tools.join(", "));
    if (!tools.includes("list_clusters") || !tools.includes("estimate_cluster_costs")) {
      throw new Error("Missing expected read-only tools");
    }

    // 3. tools/call: list_clusters
    console.log("[R3-07 MCP Stdio Client] Calling list_clusters...");
    const clustersRes = await send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_clusters", arguments: {} },
    });
    const clusters = JSON.parse(clustersRes.result.content[0].text);
    console.log("[R3-07 MCP Stdio Client] Discovered clusters:", clusters.clusters.length);

    // 4. tools/call: estimate_cluster_costs
    console.log("[R3-07 MCP Stdio Client] Calling estimate_cluster_costs...");
    const costRes = await send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "estimate_cluster_costs", arguments: { clusterId: "prod-cluster-1" } },
    });
    const costs = JSON.parse(costRes.result.content[0].text);
    console.log("[R3-07 MCP Stdio Client] Cost run-rate:", costs.estimatedMonthlyRunRate);

    // 5. Test Forbidden write operation: delete_resource
    console.log("[R3-07 MCP Stdio Client] Testing forbidden tool delete_resource...");
    const deleteRes = await send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "delete_resource", arguments: { clusterId: "prod-cluster-1" } },
    });
    if (!deleteRes.error || deleteRes.error.code !== -32001) {
      throw new Error("delete_resource was NOT blocked with code -32001!");
    }
    console.log("[R3-07 MCP Stdio Client] Successfully blocked delete_resource: " + deleteRes.error.message);

    // 6. Test Forbidden shell operation: pod_exec
    console.log("[R3-07 MCP Stdio Client] Testing forbidden tool pod_exec...");
    const execRes = await send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "pod_exec", arguments: { command: "sh" } },
    });
    if (!execRes.error || execRes.error.code !== -32001) {
      throw new Error("pod_exec was NOT blocked with code -32001!");
    }
    console.log("[R3-07 MCP Stdio Client] Successfully blocked pod_exec: " + execRes.error.message);

    console.log("\n=======================================================");
    console.log("  R3-07 MCP STDIO CLIENT PROTOCOL PASSED FULLY!");
    console.log("  - JSON-RPC 2.0 handshake verified");
    console.log("  - Read-only tools discovered & invoked");
    console.log("  - Write/exec operations strictly rejected (-32001)");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("[R3-07 MCP Stdio Client] FAILED:", err);
    process.exit(1);
  }
})();
