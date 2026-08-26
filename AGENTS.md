# Development rules

- This repository is the browser shell. The RDP algorithm belongs in the pinned
  `vendor/nextRDP-core` submodule and must not be copied or independently modified here.
- Only expose analysis methods actually implemented by `nextRDP-core`; keep the
  method controls and review views honest about whether a lane is source-shaped or
  fully validated. The current core exposes RDP, GENECONV, MaxChi, CHIMAERA, 3SEQ,
  BootScan, and SISCAN.
- Keep all sequence analysis local to the browser; do not upload user alignments.
- Preserve the Windows 95 visual language unless a redesign is explicitly requested.
- Never add dataset-specific behavior or fixture-derived runtime logic.
- Record newly confirmed original-RDP bugs or quirks in `../nextRDP-core/RDPbugsandquirks.md`.
