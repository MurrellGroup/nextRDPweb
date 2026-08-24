# Development rules

- This repository is the browser shell. The RDP algorithm belongs in the pinned
  `vendor/nextRDP-core` submodule and must not be copied or independently modified here.
- Only expose analysis methods actually implemented by `nextRDP-core`. The current
  application is deliberately RDP-only.
- Keep all sequence analysis local to the browser; do not upload user alignments.
- Preserve the Windows 95 visual language unless a redesign is explicitly requested.
- Never add dataset-specific behavior or fixture-derived runtime logic.
- Record newly confirmed original-RDP bugs or quirks in the core project's tracking notes.
