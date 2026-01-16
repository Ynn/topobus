#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
wasm_out="${repo_root}/frontend/wasm"
port="${PORT:-8080}"
host="${HOST:-127.0.0.1}"

if ! command -v wasm-pack >/dev/null 2>&1; then
    echo "wasm-pack is required: https://rustwasm.github.io/wasm-pack/installer/" >&2
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to serve the static app." >&2
    exit 1
fi

echo "Building WASM into ${wasm_out}..."
(
    cd "${repo_root}/crates/topobus-wasm"
    wasm-pack build --target web --out-dir "${wasm_out}"
)

echo "Serving static app at http://${host}:${port}"
echo "Press Ctrl+C to stop."
(
    cd "${repo_root}/frontend"
    python3 -m http.server "${port}" --bind "${host}"
)
