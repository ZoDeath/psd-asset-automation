import type { PhotoshopCommand, PhotoshopCommandResult } from "./types.js";

export class CommandQueue {
  private readonly pending: PhotoshopCommand[] = [];
  private readonly waiters = new Map<string, { resolve: (value: PhotoshopCommandResult) => void; timer: NodeJS.Timeout }>();

  enqueue(command: string, args: Record<string, unknown> = {}, timeoutMs = 45_000): Promise<PhotoshopCommandResult> {
    const item: PhotoshopCommand = {
      id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      command,
      args,
      createdAt: new Date().toISOString(),
    };
    this.pending.push(item);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const pendingIndex = this.pending.findIndex((candidate) => candidate.id === item.id);
        if (pendingIndex >= 0) this.pending.splice(pendingIndex, 1);
        this.waiters.delete(item.id);
        resolve({ id: item.id, ok: false, error: "Photoshop plugin did not respond before the command timeout." });
      }, timeoutMs);
      this.waiters.set(item.id, { resolve, timer });
    });
  }

  next(): PhotoshopCommand | null {
    return this.pending.shift() ?? null;
  }

  complete(result: PhotoshopCommandResult): void {
    const waiter = this.waiters.get(result.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.waiters.delete(result.id);
    waiter.resolve(result);
  }

  get size(): number {
    return this.pending.length;
  }
}
