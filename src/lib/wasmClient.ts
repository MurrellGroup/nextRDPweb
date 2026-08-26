import type {
  DatasetSummary,
  EngineRuntimeInfo,
  EventAlignmentView,
  EventTreeView,
  EventPhylproView,
  EventEdit,
  ImportedProject,
  ReviewState,
  ScanOptions,
  PhylproGapMode,
  ScanProgress,
  ScanResults,
  SignalPlot,
  WorkerEvent,
  WorkerRequest,
  WorkerRequestPayload,
  WorkerResponse,
} from "./types";
import packageMetadata from "../../package.json";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

export class RdpWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private requestId = 0;
  private progressListeners = new Set<(progress: ScanProgress) => void>();
  private liveProgressTimer: number | null = null;
  private latestNativeProgress: ScanProgress | null = null;
  private scanStartedAt = 0;

  constructor() {
    this.worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), {
      type: "module",
      name: "rdp-analysis",
    });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse | WorkerEvent>) => {
      const message = event.data;
      if ("type" in message) {
        if (message.type === "progress") {
          this.latestNativeProgress = message.progress;
          this.progressListeners.forEach((listener) => listener(message.progress));
        } else if (message.type === "native-progress") {
          const native = this.latestNativeProgress;
          if (!native) return;
          const progress: ScanProgress = {
            ...native,
            state: "running",
            phase: message.phase,
            scanRound: message.scanRound,
            processedTriplets: message.processedTriplets,
            totalTriplets: message.totalTriplets,
            correctionTests: native.correctionTests || message.totalTriplets,
            cumulativeTriplets: message.processedTriplets,
            tripletKernelEvaluations: message.processedTriplets,
            eventCount: message.eventCount,
          };
          this.latestNativeProgress = progress;
          this.progressListeners.forEach((listener) => listener(progress));
        }
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(new Error(message.error));
    });
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "The RDP analysis worker stopped unexpectedly.");
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
    });
  }

  onProgress(listener: (progress: ScanProgress) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  init(): Promise<EngineRuntimeInfo> {
    const wasmBaseUrl = new URL("wasm/", document.baseURI).href;
    return this.send({
      type: "init",
      wasmBaseUrl,
      assetVersion: packageMetadata.version,
    }) as Promise<EngineRuntimeInfo>;
  }

  async load(file: File): Promise<DatasetSummary> {
    const bytes = await file.arrayBuffer();
    return this.send({ type: "load", name: file.name, bytes }, [bytes]) as Promise<DatasetSummary>;
  }

  async importProject(file: File): Promise<ImportedProject> {
    const bytes = await file.arrayBuffer();
    return this.send(
      { type: "import-project", name: file.name, bytes },
      [bytes],
    ) as Promise<ImportedProject>;
  }

  scan(options: ScanOptions): Promise<ScanResults> {
    this.stopLiveProgress();
    this.latestNativeProgress = null;
    this.scanStartedAt = performance.now();
    this.liveProgressTimer = window.setInterval(() => this.emitLiveProgress(), 100);
    const pending = this.send({ type: "scan", options }) as Promise<ScanResults>;
    return pending.finally(() => this.stopLiveProgress());
  }

  cancel(): Promise<void> {
    return this.send({ type: "cancel" }) as Promise<void>;
  }

  plot(signalId: number): Promise<SignalPlot> {
    return this.send({ type: "plot", signalId }) as Promise<SignalPlot>;
  }

  eventAlignment(eventId: number, flankSites = 30, rowLimit = 28): Promise<EventAlignmentView> {
    return this.send({
      type: "event-alignment",
      eventId,
      flankSites,
      rowLimit,
    }) as Promise<EventAlignmentView>;
  }

  eventTrees(eventId: number): Promise<EventTreeView> {
    return this.send({ type: "event-trees", eventId }) as Promise<EventTreeView>;
  }

  eventPhylpro(
    eventId: number,
    windowSites = 60,
    gapMode: PhylproGapMode = "ignore-missing-pairwise",
    includeSelf = false,
  ): Promise<EventPhylproView> {
    return this.send({
      type: "event-phylpro",
      eventId,
      windowSites,
      gapMode,
      includeSelf,
    }) as Promise<EventPhylproView>;
  }

  setReviewState(signalId: number, state: ReviewState): Promise<void> {
    return this.send({ type: "set-review-state", signalId, state }) as Promise<void>;
  }

  setEventReviewState(eventId: number, state: ReviewState): Promise<ScanResults> {
    return this.send({ type: "set-event-review-state", eventId, state }) as Promise<ScanResults>;
  }

  updateEvent(eventId: number, edit: EventEdit): Promise<ScanResults> {
    return this.send({ type: "update-event", eventId, edit }) as Promise<ScanResults>;
  }

  updateEventGroup(
    eventId: number,
    sequenceIndices: number[],
    manualOverride = true,
  ): Promise<ScanResults> {
    return this.send({ type: "update-event-group", eventId, sequenceIndices, manualOverride }) as Promise<ScanResults>;
  }

  reconcileAfter(eventId: number, cpuThreads: number): Promise<ScanResults> {
    return this.send({ type: "reconcile-after", eventId, cpuThreads }) as Promise<ScanResults>;
  }

  exportCsv(): Promise<string> {
    return this.send({ type: "export-csv" }) as Promise<string>;
  }

  exportEnabledSequences(
    maskedSequenceIndices: number[],
    disabledSequenceIndices: number[],
  ): Promise<string> {
    return this.send({
      type: "export-enabled-sequences",
      maskedSequenceIndices,
      disabledSequenceIndices,
    }) as Promise<string>;
  }

  exportMaskedOrDisabledSequences(
    maskedSequenceIndices: number[],
    disabledSequenceIndices: number[],
  ): Promise<string> {
    return this.send({
      type: "export-masked-or-disabled-sequences",
      maskedSequenceIndices,
      disabledSequenceIndices,
    }) as Promise<string>;
  }

  exportRecombinantSequencesRemoved(): Promise<string> {
    return this.send({ type: "export-recombinant-sequences-removed" }) as Promise<string>;
  }

  exportRecombinantColumnsRemoved(): Promise<string> {
    return this.send({ type: "export-recombinant-columns-removed" }) as Promise<string>;
  }

  exportRecombinationFree(): Promise<string> {
    return this.send({ type: "export-recombination-free" }) as Promise<string>;
  }

  exportFragmented(): Promise<string> {
    return this.send({ type: "export-fragmented" }) as Promise<string>;
  }

  exportProject(): Promise<string> {
    return this.send({ type: "export-project" }) as Promise<string>;
  }

  dispose(): void {
    this.stopLiveProgress();
    this.worker.terminate();
    this.pending.clear();
    this.progressListeners.clear();
  }

  private send(
    request: WorkerRequestPayload,
    transfer: Transferable[] = [],
  ): Promise<unknown> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id } as WorkerRequest, transfer);
    });
  }

  /**
   * The source-faithful core currently completes a full scan in one native
   * call. That means the analysis worker cannot service its JavaScript queue
   * until that call returns, even though the scan is still doing useful work.
   * Keep the monitor live from the UI side in that interval: native counters
   * remain untouched, while elapsed timing and the active state continue to
   * advance honestly. Native progress messages replace this heartbeat as soon
   * as the engine yields a batch.
  */
  private emitLiveProgress(): void {
    const native = this.latestNativeProgress;
    if (!native || native.state !== "running") return;
    const elapsed = Math.max(0, performance.now() - this.scanStartedAt);
    const baseTiming = native.timing;
    if (!baseTiming) return;
    const extra = Math.max(0, elapsed - baseTiming.totalMs);
    const timing = {
      ...baseTiming,
      totalMs: Math.max(baseTiming.totalMs, elapsed),
      primaryMs: native.phase === "primary" ? baseTiming.primaryMs + extra : baseTiming.primaryMs,
      cyclicRescanMs: native.phase === "cyclic-rescan" ? baseTiming.cyclicRescanMs + extra : baseTiming.cyclicRescanMs,
      reconciliationMs: native.phase === "reconciliation" ? baseTiming.reconciliationMs + extra : baseTiming.reconciliationMs,
      currentRoundMs: native.phase === "primary" || native.phase === "cyclic-rescan"
        ? baseTiming.currentRoundMs + extra
        : baseTiming.currentRoundMs,
    };
    const progress = { ...native, timing };
    this.progressListeners.forEach((listener) => listener(progress));
  }

  private stopLiveProgress(): void {
    if (this.liveProgressTimer !== null) {
      window.clearInterval(this.liveProgressTimer);
      this.liveProgressTimer = null;
    }
  }
}
