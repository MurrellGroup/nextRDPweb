import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Atom,
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  Play,
  ShieldCheck,
} from "lucide-react";

import type { AnalysisResult, EngineState } from "./lib/types";
import { CoreWorkerClient } from "./lib/wasmClient";

const DEFAULT_P_VALUE = 0.05;
const DEFAULT_WINDOW = 30;

function formatProbability(value: number): string {
  return value === 0 ? "0" : value.toExponential(6);
}

function safeStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-") || "nextRDP";
}

function downloadCsv(result: AnalysisResult, filename: string): void {
  const header = [
    "row",
    "slot",
    "daughter",
    "minor_parent",
    "major_parent",
    "beginning",
    "ending",
    "p_value",
    "program",
  ].join(",");
  const rows = result.events.map((event) => [
    event.row,
    event.slot,
    event.daughter,
    event.minorParent,
    event.majorParent,
    event.beginning,
    event.ending,
    event.probability,
    event.program,
  ].join(","));
  const blob = new Blob([[header, ...rows].join("\n") + "\n"], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeStem(filename)}-rdp-events.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const client = useRef<CoreWorkerClient | null>(null);
  const [engine, setEngine] = useState<EngineState>({ status: "loading", message: "Loading RDP core…" });
  const [file, setFile] = useState<File | null>(null);
  const [circular, setCircular] = useState(true);
  const [pValue, setPValue] = useState(DEFAULT_P_VALUE);
  const [windowSites, setWindowSites] = useState(DEFAULT_WINDOW);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const workerClient = new CoreWorkerClient();
    client.current = workerClient;
    workerClient.init(new URL("./", document.baseURI).href)
      .then((version) => setEngine({ status: "ready", message: version }))
      .catch((caught: unknown) => {
        setEngine({ status: "error", message: caught instanceof Error ? caught.message : String(caught) });
      });
    return () => {
      workerClient.dispose();
      client.current = null;
    };
  }, []);

  const tripletDescription = useMemo(() => {
    if (!result) return "—";
    return result.tripletCount.toLocaleString();
  }, [result]);

  const selectFile = (selected: File | null) => {
    setFile(selected);
    setResult(null);
    setElapsedMs(null);
    setError("");
  };

  const runAnalysis = async () => {
    if (!file || !client.current || engine.status !== "ready") return;
    if (!(pValue > 0 && pValue <= 1)) {
      setError("The p-value cutoff must be greater than 0 and no greater than 1.");
      return;
    }
    if (!Number.isInteger(windowSites) || windowSites < 1) {
      setError("The RDP window must be a positive whole number.");
      return;
    }
    setRunning(true);
    setError("");
    setResult(null);
    const started = performance.now();
    try {
      const bytes = await file.arrayBuffer();
      const nextResult = await client.current.analyze(bytes, { circular, pValue, windowSites });
      setElapsedMs(performance.now() - started);
      setResult(nextResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="window-titlebar">
          <span className="brand-mark"><Atom size={15} strokeWidth={2.6} /></span>
          <strong>nextRDP Web - Recombination Detection Program</strong>
          <div className="window-controls" aria-hidden="true">
            <span>_</span><span>□</span><span>×</span>
          </div>
        </div>
        <div className="window-menubar">
          <nav aria-label="Application menu">
            <span><u>F</u>ile</span><span><u>A</u>nalysis</span><span><u>V</u>iew</span><span><u>H</u>elp</span>
          </nav>
          <span className={`engine-state engine-${engine.status}`} title={engine.message}>
            <Cpu size={13} /> {engine.status === "ready" ? "WASM ready" : engine.status === "loading" ? "Starting engine" : "Engine error"}
          </span>
        </div>
      </header>

      <main className="desktop">
        <section className="window workspace-window" aria-labelledby="workspace-title">
          <div className="panel-title" id="workspace-title"><FileText size={14} /> RDP analysis</div>
          <div className="panel-body">
            <p className="intro">
              Run the source-faithful RDP method locally in your browser. Sequence data never leave this tab.
            </p>

            <fieldset>
              <legend>1. Alignment file</legend>
              <label className="file-picker">
                <FolderOpen size={17} />
                <span>{file ? file.name : "Choose an aligned FASTA file…"}</span>
                <input
                  type="file"
                  accept=".fa,.fas,.fasta,.fna,.aln,text/plain"
                  onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <div className="file-detail">
                {file ? `${(file.size / 1024).toFixed(1)} KB selected` : "FASTA input with aligned nucleotide sequences"}
              </div>
            </fieldset>

            <fieldset>
              <legend>2. RDP settings</legend>
              <div className="settings-grid">
                <label className="method-row">
                  <input type="checkbox" checked readOnly />
                  <span><strong>RDP</strong><small>Only the RDP method is enabled</small></span>
                </label>
                <label>
                  P-value cutoff
                  <input
                    type="number"
                    min="0.0000000001"
                    max="1"
                    step="0.01"
                    value={pValue}
                    onChange={(event) => setPValue(event.target.valueAsNumber)}
                  />
                </label>
                <label>
                  Window (informative sites)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={windowSites}
                    onChange={(event) => setWindowSites(event.target.valueAsNumber)}
                  />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={circular} onChange={(event) => setCircular(event.target.checked)} />
                  Circular sequences
                </label>
              </div>
            </fieldset>

            {error ? (
              <div className="message error-message" role="alert"><AlertTriangle size={16} /><span>{error}</span></div>
            ) : null}

            <div className="action-row">
              <button className="primary-button" type="button" disabled={!file || running || engine.status !== "ready"} onClick={runAnalysis}>
                <Play size={15} fill="currentColor" /> {running ? "Running RDP…" : "Run RDP"}
              </button>
              <span className="action-hint">
                {engine.status === "error" ? engine.message : engine.status === "loading" ? engine.message : file ? "Ready to analyse" : "Select an alignment to begin"}
              </span>
            </div>
          </div>
        </section>

        <section className="window results-window" aria-labelledby="results-title">
          <div className="panel-title" id="results-title"><CheckCircle2 size={14} /> Results</div>
          <div className="panel-body results-body">
            {!result ? (
              <div className="empty-state">
                <Atom size={38} />
                <strong>{running ? "RDP scan in progress…" : "No results yet"}</strong>
                <span>{running ? "The analysis runs in a dedicated Web Worker." : "Select a FASTA alignment and run RDP."}</span>
              </div>
            ) : (
              <>
                <div className="metrics">
                  <div><span>Sequences</span><strong>{result.sequenceCount.toLocaleString()}</strong></div>
                  <div><span>Alignment</span><strong>{result.sequenceLength.toLocaleString()} nt</strong></div>
                  <div><span>Triplets</span><strong>{tripletDescription}</strong></div>
                  <div><span>Scanned</span><strong>{result.scannedTriplets.toLocaleString()}</strong></div>
                  <div><span>RDP events</span><strong>{result.events.length.toLocaleString()}</strong></div>
                  <div><span>Runtime</span><strong>{elapsedMs === null ? "—" : `${(elapsedMs / 1000).toFixed(2)} s`}</strong></div>
                </div>

                <div className="results-toolbar">
                  <span>{result.significantIntervals.toLocaleString()} significant intervals stored</span>
                  <button type="button" onClick={() => downloadCsv(result, file?.name ?? "nextRDP")}><Download size={14} /> Export CSV</button>
                </div>

                <div className="table-frame">
                  <table>
                    <thead><tr><th>#</th><th>Daughter</th><th>Minor parent</th><th>Major parent</th><th>Beginning</th><th>Ending</th><th>P-value</th></tr></thead>
                    <tbody>
                      {result.events.map((event, index) => (
                        <tr key={`${event.row}-${event.slot}-${index}`}>
                          <td>{index + 1}</td><td>{event.daughter}</td><td>{event.minorParent}</td><td>{event.majorParent}</td>
                          <td>{event.beginning}</td><td>{event.ending}</td><td>{formatProbability(event.probability)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span><ShieldCheck size={13} /> Local-only analysis</span>
        <span>{engine.message}</span>
        <span>RDP method</span>
      </footer>
    </div>
  );
}
