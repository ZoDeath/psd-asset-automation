import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { CommandQueue } from "./commandQueue.js";
import type { DocumentSnapshot, PhotoshopCommandResult } from "./types.js";
import { VisionClient } from "./visionClient.js";

function isDocumentSnapshot(value: unknown): value is DocumentSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<DocumentSnapshot>;
  return snapshot.type === "documentSnapshot" && typeof snapshot.capturedAt === "string" && "document" in snapshot;
}

export class PhotoshopBridge {
  latestSnapshot: DocumentSnapshot | null = null;
  private server: Server | null = null;
  private socketClients = 0;
  private lastPluginSeenAt = 0;

  constructor(
    readonly port: number,
    private readonly commands: CommandQueue,
    private readonly vision: VisionClient,
  ) {}

  get pluginConnected(): boolean {
    return this.socketClients > 0 || Date.now() - this.lastPluginSeenAt < 5_000;
  }

  private markPluginSeen(): void {
    this.lastPluginSeenAt = Date.now();
  }

  start(): void {
    if (this.server) return;
    this.server = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
      if (request.method === "GET" && request.url === "/snapshot") {
        response.setHeader("Content-Type", "application/json");
        response.writeHead(200).end(JSON.stringify(this.latestSnapshot));
        return;
      }
      if (request.method === "GET" && request.url === "/commands/next") {
        this.markPluginSeen();
        response.setHeader("Content-Type", "application/json");
        response.writeHead(200).end(JSON.stringify(this.commands.next()));
        return;
      }
      if (request.method !== "POST" || !["/snapshot", "/analyze-face", "/commands/result"].includes(request.url ?? "")) {
        response.writeHead(404).end();
        return;
      }
      let body = "";
      let bodyRejected = false;
      request.on("data", (chunk: Buffer) => {
        if (bodyRejected) return;
        body += chunk;
        if (body.length > 10_000_000) {
          bodyRejected = true;
          response.writeHead(413).end();
        }
      });
      request.on("end", () => {
        if (!bodyRejected) void this.handlePost(request.url || "", body, response);
      });
    });
    const sockets = new WebSocketServer({ server: this.server });
    sockets.on("connection", (socket: WebSocket) => {
      this.socketClients += 1;
      this.markPluginSeen();
      socket.on("message", (message) => {
        this.markPluginSeen();
        try {
          const parsed: unknown = JSON.parse(message.toString());
          if (isDocumentSnapshot(parsed)) this.latestSnapshot = parsed;
        } catch { /* Ignore malformed input. */ }
      });
      socket.on("close", () => { this.socketClients = Math.max(0, this.socketClients - 1); });
    });
    this.server.on("error", (error) => console.error(`Photoshop bridge error: ${error.message}`));
    this.server.listen(this.port, "127.0.0.1");
  }

  private async handlePost(url: string, body: string, response: import("node:http").ServerResponse): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(body);
      if (url === "/snapshot") {
        if (!isDocumentSnapshot(parsed)) throw new Error("Invalid snapshot");
        this.latestSnapshot = parsed;
        this.markPluginSeen();
        response.writeHead(204).end();
        return;
      }
      if (url === "/commands/result") {
        const result = parsed as Partial<PhotoshopCommandResult>;
        if (typeof result.id !== "string" || typeof result.ok !== "boolean") throw new Error("Invalid command result");
        this.commands.complete(result as PhotoshopCommandResult);
        this.markPluginSeen();
        response.writeHead(204).end();
        return;
      }
      const imagePath = parsed && typeof parsed === "object" ? (parsed as { path?: unknown }).path : null;
      if (typeof imagePath !== "string" || !imagePath.trim()) throw new Error("Invalid image analysis request");
      const analysis = await this.vision.analyze(imagePath);
      response.setHeader("Content-Type", "application/json");
      response.writeHead(200).end(JSON.stringify(analysis));
    } catch (error) {
      console.error(`Photoshop bridge error: ${error instanceof Error ? error.message : String(error)}`);
      response.writeHead(400).end();
    }
  }
}
