export interface RdpEvent {
  row: number;
  slot: number;
  daughter: number;
  minorParent: number;
  majorParent: number;
  beginning: number;
  ending: number;
  probability: number;
  program: number;
}

export interface AnalysisResult {
  sequenceCount: number;
  sequenceLength: number;
  tripletCount: number;
  scannedTriplets: number;
  significantIntervals: number;
  events: RdpEvent[];
}

export interface AnalysisOptions {
  circular: boolean;
  pValue: number;
  windowSites: number;
}

export type EngineState =
  | { status: "loading"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

export type WorkerRequest =
  | { id: number; type: "init"; baseUrl: string }
  | { id: number; type: "analyze"; bytes: ArrayBuffer; options: AnalysisOptions };

export type WorkerResponse =
  | { id: number; ok: true; type: "ready"; version: string }
  | { id: number; ok: true; type: "result"; result: AnalysisResult }
  | { id: number; ok: false; error: string };
