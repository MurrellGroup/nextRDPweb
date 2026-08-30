import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = fileURLToPath(
  new URL("../public/wasm/next-rdp-core-web.mjs", import.meta.url),
);
const moduleUrl = pathToFileURL(modulePath).href;
const { default: createCore } = await import(moduleUrl);
const core = await createCore({
  noInitialRun: true,
  locateFile: (path) => new URL(path, new URL("./", moduleUrl)).href,
});
const handle = core._rdp_create();
const fasta = new TextEncoder().encode(
  ">A\nACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT\n" +
  ">B\nACGTACGTACGTACGTACGTTCGTACGTACGTACGTACGT\n" +
  ">C\nTCGTACGTACGTACGTACGTACGTACGTACGTACGTACGA\n" +
  ">D\nACGAACGTACGTACGTACGTACGTACGTACGTACGTTCGT\n",
);
const input = core._malloc(fasta.length);
core.HEAPU8.set(fasta, input);
if (core._rdp_load_alignment(handle, input, fasta.length) !== 1) {
  throw new Error(core.UTF8ToString(core._rdp_get_error(handle)) || "alignment load failed");
}
core._free(input);

const count = 4;
const zeros = core._malloc(count);
const groups = core._malloc(count * 4);
core.HEAPU8.fill(0, zeros, zeros + count);
core.HEAPU8.fill(0, groups, groups + count * 4);
const begin = () => core._rdp_scan_begin(
  handle, 1, 0, 0.05, 30,
  1, 0, 70, 0, 60, 0, 1, 1, 0,
  0, 0, 40, 10, 20, 0.7, 3,
  0, 0, 40, 10, 20, 50, 3,
  0, 0, groups, count, zeros, count, zeros, count,
);
if (begin() !== 1) throw new Error("scan begin failed");
const cancelPointer = core._rdp_get_cancel_flag_address(handle);
if (!(core.HEAPU8.buffer instanceof SharedArrayBuffer) || cancelPointer <= 0) {
  throw new Error("threaded core did not expose shared cancellation state");
}
Atomics.store(new Int32Array(core.HEAPU8.buffer, cancelPointer, 1), 0, 1);
if (core._rdp_scan_batch(handle, 512) !== 2) {
  throw new Error("shared cancellation flag did not stop the scan");
}
if (begin() !== 1 || core._rdp_scan_batch(handle, 512) !== 1) {
  throw new Error("a cancelled context could not start a fresh scan");
}
core._free(groups);
core._free(zeros);
core._rdp_destroy(handle);
console.log("shared WASM cancellation and restart: ok");
