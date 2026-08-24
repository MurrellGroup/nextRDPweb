import type { AnalysisOptions, AnalysisResult, WorkerRequest, WorkerResponse } from "./types";

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
}

type RequestPayload = WorkerRequest extends infer Request
  ? Request extends { id: number }
    ? Omit<Request, "id">
    : never
  : never;

export class CoreWorkerClient {
  private readonly worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), { type: "module" });
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      this.pending.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data);
      else request.reject(new Error(event.data.error));
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "The RDP worker stopped unexpectedly");
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    };
  }

  async init(baseUrl: string): Promise<string> {
    const response = await this.request({ type: "init", baseUrl });
    if (response.ok && response.type === "ready") return response.version;
    throw new Error("The RDP core returned an invalid initialization response");
  }

  async analyze(bytes: ArrayBuffer, options: AnalysisOptions): Promise<AnalysisResult> {
    const response = await this.request({ type: "analyze", bytes, options }, [bytes]);
    if (response.ok && response.type === "result") return response.result;
    throw new Error("The RDP core returned an invalid analysis response");
  }

  dispose(): void {
    this.worker.terminate();
    for (const request of this.pending.values()) request.reject(new Error("The RDP worker was closed"));
    this.pending.clear();
  }

  private request(message: RequestPayload, transfer: Transferable[] = []): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id } as WorkerRequest, transfer);
    });
  }
}
