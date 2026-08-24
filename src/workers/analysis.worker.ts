/// <reference lib="webworker" />

import type { AnalysisResult, WorkerRequest, WorkerResponse } from "../lib/types";

interface CoreModule {
  HEAPU8: Uint8Array;
  UTF8ToString(pointer: number): string;
  _malloc(length: number): number;
  _free(pointer: number): void;
  _next_rdp_analyze(pointer: number, length: number, circular: number, pValue: number, windowSites: number): number;
  _next_rdp_result_json(): number;
  _next_rdp_error(): number;
  _next_rdp_version(): number;
}

type CoreFactory = (options: { locateFile: (path: string) => string }) => Promise<CoreModule>;

let core: CoreModule | null = null;
let initialization: Promise<CoreModule> | null = null;

async function loadCore(baseUrl: string): Promise<CoreModule> {
  if (core) return core;
  if (!initialization) {
    const moduleUrl = new URL("wasm/next-rdp-core-web.mjs", baseUrl).href;
    initialization = import(/* @vite-ignore */ moduleUrl)
      .then((loaded: { default: CoreFactory }) => loaded.default({
        locateFile: (path) => new URL(path, moduleUrl).href,
      }))
      .then((loadedCore) => {
        core = loadedCore;
        return loadedCore;
      });
  }
  return initialization;
}

function post(response: WorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      const loaded = await loadCore(request.baseUrl);
      post({ id: request.id, ok: true, type: "ready", version: loaded.UTF8ToString(loaded._next_rdp_version()) });
      return;
    }

    if (!core) throw new Error("The RDP core has not finished loading");
    const bytes = new Uint8Array(request.bytes);
    const pointer = core._malloc(bytes.byteLength);
    if (!pointer) throw new Error("The RDP core could not allocate input memory");
    try {
      core.HEAPU8.set(bytes, pointer);
      const ok = core._next_rdp_analyze(
        pointer,
        bytes.byteLength,
        request.options.circular ? 1 : 0,
        request.options.pValue,
        request.options.windowSites,
      );
      if (!ok) throw new Error(core.UTF8ToString(core._next_rdp_error()) || "RDP analysis failed");
      const result = JSON.parse(core.UTF8ToString(core._next_rdp_result_json())) as AnalysisResult;
      post({ id: request.id, ok: true, type: "result", result });
    } finally {
      core._free(pointer);
    }
  } catch (caught) {
    post({ id: request.id, ok: false, error: caught instanceof Error ? caught.message : String(caught) });
  }
};

export {};
