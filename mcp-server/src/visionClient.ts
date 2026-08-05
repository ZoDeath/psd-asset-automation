import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

function bundledPythonPath(): string {
  return process.env.USERPROFILE
    ? join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
    : "";
}

export class VisionClient {
  private process: ChildProcess | null = null;

  constructor(private readonly port: number) {}

  start(): void {
    if (this.process && !this.process.killed) return;
    const serverPath = fileURLToPath(new URL("../vision/server.py", import.meta.url));
    const bundled = bundledPythonPath();
    const executable = process.env.RHV_PYTHON || (bundled && existsSync(bundled) ? bundled : "python");
    this.process = spawn(executable, [serverPath, String(this.port)], { stdio: "ignore", windowsHide: true });
    this.process.once("exit", () => { this.process = null; });
  }

  stop(): void {
    if (this.process && !this.process.killed) this.process.kill();
    this.process = null;
  }

  private async request(imagePath: string): Promise<unknown> {
    const response = await fetch(`http://127.0.0.1:${this.port}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: imagePath }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Vision service HTTP ${response.status}`);
    return response.json();
  }

  async analyze(imagePath: string): Promise<unknown> {
    try {
      return await this.request(imagePath);
    } catch {
      this.start();
      await new Promise((resolve) => setTimeout(resolve, 150));
      try { return await this.request(imagePath); }
      catch { return this.analyzeWithOneShotProcess(imagePath); }
    }
  }

  private async analyzeWithOneShotProcess(imagePath: string): Promise<unknown> {
    const scriptPath = fileURLToPath(new URL("../vision/analyze_face.py", import.meta.url));
    const bundled = bundledPythonPath();
    const executables = Array.from(new Set([process.env.RHV_PYTHON, bundled, "python", "py"].filter((value): value is string => Boolean(value))));
    let lastError: unknown = new Error("No Python runtime found");
    for (const executable of executables) {
      if (executable !== "python" && executable !== "py" && !existsSync(executable)) continue;
      try {
        const result = await execFileAsync(executable, [scriptPath, imagePath], { timeout: 30_000, maxBuffer: 2_000_000 });
        return JSON.parse(result.stdout.trim());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
