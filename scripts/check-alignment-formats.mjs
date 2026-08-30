import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = fileURLToPath(
  new URL("../public/wasm/next-rdp-core-web-serial.mjs", import.meta.url),
);
const moduleUrl = pathToFileURL(modulePath).href;
const { default: createCore } = await import(moduleUrl);
const core = await createCore({
  noInitialRun: true,
  locateFile: (path) => new URL(
    path.endsWith(".wasm") ? "next-rdp-core-web-serial.wasm" : path,
    new URL("./", moduleUrl),
  ).href,
});

const formats = new Map([
  ["FASTA", `>A\nACGTACGT\n>B\nACGAACGT\n>C\nTCGTACGA\n`],
  ["GDE", `%A\nACGTACGT\n%B\nACGAACGT\n%C\nTCGTACGA\n`],
  ["CLUSTAL", `CLUSTAL W multiple sequence alignment\n\nA ACGT\nB ACGA\nC TCGT\n\nA ACGT\nB ACGT\nC ACGA\n`],
  ["PHYLIP", `3 8\nA ACGTACGT\nB ACGAACGT\nC TCGTACGA\n`],
  ["NEXUS", `#NEXUS\nBegin data;\nDimensions ntax=3 nchar=8;\nFormat datatype=dna gap=- missing=?;\nMatrix\nA ACGTACGT\nB ACGAACGT\nC TCGTACGA\n;\nEnd;\n`],
  ["MEGA", `#mega\n#title format test;\n#format datatype=dna;\n#A ACGTACGT\n#B ACGAACGT\n#C TCGTACGA\n`],
]);

function load(text) {
  const handle = core._rdp_create();
  const bytes = new TextEncoder().encode(text);
  const pointer = core._malloc(bytes.length);
  core.HEAPU8.set(bytes, pointer);
  const loaded = core._rdp_load_alignment(handle, pointer, bytes.length);
  core._free(pointer);
  if (loaded !== 1) {
    throw new Error(core.UTF8ToString(core._rdp_get_error(handle)) || "alignment load failed");
  }
  return handle;
}

const summaries = [];
for (const [expectedFormat, text] of formats) {
  const handle = load(text);
  const summaryText = core.UTF8ToString(core._rdp_get_summary_json(handle));
  const summary = JSON.parse(summaryText);
  if (summary.format !== expectedFormat || summary.sequenceCount !== 3 ||
      summary.alignmentLength !== 8 ||
      summary.sequences.map((row) => row.name).join(",") !== "A,B,C") {
    throw new Error(`${expectedFormat}: unexpected summary ${summaryText}`);
  }
  summaries.push({
    format: summary.format,
    content: createHash("sha256")
      .update(JSON.stringify({
        length: summary.alignmentLength,
        variable: summary.variableSiteCount,
        informative: summary.informativeSiteCount,
        sequences: summary.sequences.map(({ name, validSites, missingSites }) => ({
          name,
          validSites,
          missingSites,
        })),
      }))
      .digest("hex"),
  });
  core._rdp_destroy(handle);
}
if (new Set(summaries.map(({ content }) => content)).size !== 1) {
  throw new Error(`Equivalent formats produced different alignments: ${JSON.stringify(summaries)}`);
}

const identicalHandle = load(
  `>A\nACGTACGT\n>B\nACGTACGT\n>C\nACGTACGT\n>D\nACGTACGT\n>E\nACGTACGT\n`,
);
const identicalSummary = JSON.parse(
  core.UTF8ToString(core._rdp_get_summary_json(identicalHandle)),
);
const masked = identicalSummary.sequences
  .filter((sequence) => sequence.masked)
  .map((sequence) => sequence.index);
if (identicalSummary.activeSequenceCount !== 3 || masked.join(",") !== "3,4") {
  throw new Error(`Unexpected RDP auto-mask result: ${JSON.stringify(identicalSummary)}`);
}
core._rdp_destroy(identicalHandle);

console.log(
  `alignment formats: ok (${summaries.map(({ format }) => format).join(", ")}); auto-mask: ok`,
);
