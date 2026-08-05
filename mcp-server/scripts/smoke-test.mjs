import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  env: { ...process.env, PHOTOSHOP_BRIDGE_PORT: process.env.PHOTOSHOP_BRIDGE_PORT ?? "61234" },
});
const bridgePort = process.env.PHOTOSHOP_BRIDGE_PORT ?? "61234";

const client = new Client({
  name: "photoshop-ai-mcp-smoke-test",
  version: "0.1.0",
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const snapshot = {
    type: "documentSnapshot",
    capturedAt: "2026-08-04T00:00:00.000Z",
    document: {
      name: "sample.psd",
      width: 1920,
      height: 1080,
      resolution: 72,
      layers: [{ id: 1, name: "Hero", kind: "pixel", visible: true, opacity: 100 }],
    },
  };
  const response = await fetch(`http://127.0.0.1:${bridgePort}/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`Snapshot relay failed: ${response.status}`);
  const result = await client.callTool({
    name: "get_active_document",
    arguments: {},
  });

  console.log(JSON.stringify({ tools: tools.tools.map((tool) => tool.name), result }, null, 2));
} finally {
  await client.close();
}
