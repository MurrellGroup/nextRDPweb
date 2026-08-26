# nextRDP Web

A browser interface for the source-faithful, WASM-compatible RDP implementation in
[`nextRDP-core`](https://github.com/MurrellGroup/nextRDP-core). The current interface
runs the RDP, GENECONV, MaxChi, CHIMAERA, 3SEQ, BootScan, and SISCAN discovery lanes,
with method-specific evidence plots, breakpoint alignments, regional trees, PHYLPRO
profiles, review controls, and export views. Alignment data stay inside the browser.

The source-faithful core keeps the original RDP cyclic scheduler for RDP-family events.
BootScan and SISCAN use their direct legacy kernels as independent discovery lanes;
their evidence profiles and fixed-bound secondary checks are available in the review
panel. Those optional lanes are source-shaped and explicitly marked unvalidated until
their full cyclic integration is completed.

## Development

Clone with submodules, install the JavaScript dependencies, and build:

```sh
git clone --recurse-submodules git@github.com:MurrellGroup/nextRDPweb.git
cd nextRDPweb
npm ci
npm run build
npm run preview
```

`npm run build` requires Emscripten 5.0.1 and CMake. `npm run dev` can reuse an
already generated `public/wasm/next-rdp-core-web.{mjs,wasm}` pair.

Pushes to `main` build the pinned core and deploy `dist/` through GitHub Pages.
