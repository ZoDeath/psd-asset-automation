import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PhotoshopBridge } from "./bridge.js";
import { CommandQueue } from "./commandQueue.js";
import { VisionClient } from "./visionClient.js";

const bridgePort = Number(process.env.PHOTOSHOP_BRIDGE_PORT ?? 61234);
const visionPort = Number(process.env.RHV_VISION_PORT ?? 61235);
const commands = new CommandQueue();
const vision = new VisionClient(visionPort);
const bridge = new PhotoshopBridge(bridgePort, commands, vision);

const commandNames = [
  "batch_place_rm", "batch_place_members", "place_member_photo", "inspect_member", "refresh_snapshot", "inspect_rm",
  "apply_rhv_names", "list_documents", "select_document", "inspect_documents", "close_document",
  "save_document", "set_layer_visibility", "delete_layer", "transform_layer",
] as const;

const server = new McpServer({ name: "photoshop-ai-mcp-server", version: "0.2.0" });

server.registerTool("get_status", {
  title: "Photoshop AI MCP 상태 확인",
  description: "Photoshop AI MCP 서버와 UXP 플러그인의 연결 상태를 확인합니다.",
  inputSchema: {},
}, async () => ({
  content: [{ type: "text", text: JSON.stringify({
    connected: true,
    pluginConnected: bridge.pluginConnected,
    bridgePort,
    visionPort,
    pendingCommands: commands.size,
    message: bridge.pluginConnected ? "Photoshop UXP connected" : "Waiting for Photoshop UXP",
  }, null, 2) }],
}));

server.registerTool("get_active_document", {
  title: "현재 PSD 정보 보기",
  description: "Photoshop에서 열린 문서와 레이어 구조를 읽기 전용으로 반환합니다.",
  inputSchema: {},
}, async () => ({
  content: [{ type: "text", text: JSON.stringify(bridge.latestSnapshot ?? {
    connected: bridge.pluginConnected,
    bridgePort,
    message: "No Photoshop snapshot has been received yet.",
  }, null, 2) }],
}));

server.registerTool("run_photoshop_command", {
  title: "Photoshop 작업 실행",
  description: "연결된 RHV UXP 플러그인에 작업을 전달하고 완료 결과를 기다립니다.",
  inputSchema: {
    command: z.enum(commandNames),
    args: z.record(z.unknown()).optional(),
  },
}, async ({ command, args }) => ({
  content: [{ type: "text", text: JSON.stringify(await commands.enqueue(command, args ?? {}), null, 2) }],
}));

vision.start();
bridge.start();
process.once("exit", () => vision.stop());
process.once("SIGINT", () => { vision.stop(); process.exit(0); });
process.once("SIGTERM", () => { vision.stop(); process.exit(0); });

await server.connect(new StdioServerTransport());
