#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_dir="${NEXT_RDP_CORE_DIR:-${project_dir}/vendor/nextRDP-core}"
build_dir="${core_dir}/build/web"
output_dir="${project_dir}/public/wasm"

if [[ ! -f "${core_dir}/CMakeLists.txt" ]]; then
  echo "nextRDP-core is missing. Initialize submodules with: git submodule update --init --recursive" >&2
  exit 1
fi

if ! command -v emcmake >/dev/null 2>&1; then
  local_emsdk="${project_dir}/../software/emsdk/emsdk_env.sh"
  if [[ -f "${local_emsdk}" ]]; then
    # shellcheck disable=SC1090
    source "${local_emsdk}" >/dev/null
  fi
fi

if ! command -v emcmake >/dev/null 2>&1; then
  echo "Emscripten is required to build nextRDP-core for the browser." >&2
  exit 1
fi

local_cmake_bin="${project_dir}/../software/cmake/usr/bin"
local_cmake_lib="${project_dir}/../software/cmake/usr/lib/x86_64-linux-gnu"
if [[ -x "${local_cmake_bin}/cmake" ]]; then
  export PATH="${local_cmake_bin}:${PATH}"
  export LD_LIBRARY_PATH="${local_cmake_lib}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
fi

mkdir -p "${output_dir}"
emcmake cmake -S "${core_dir}" -B "${build_dir}" -DCMAKE_BUILD_TYPE=Release \
  -DNEXT_RDP_ENABLE_OPENMP=OFF -DNEXT_RDP_ENABLE_MANUAL_THREADS=ON
cmake --build "${build_dir}" --target next-rdp-core-web --parallel
cmake -E copy_if_different "${build_dir}/next-rdp-core-web.mjs" "${output_dir}/next-rdp-core-web.mjs"
cmake -E copy_if_different "${build_dir}/next-rdp-core-web.wasm" "${output_dir}/next-rdp-core-web.wasm"
