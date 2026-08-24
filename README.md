# nextRDP Web

A browser interface for the source-faithful, WASM-compatible RDP implementation in
[`nextRDP-core`](https://github.com/MurrellGroup/nextRDP-core). The current interface
runs only the RDP method and keeps alignment data inside the browser.

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
