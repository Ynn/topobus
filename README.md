# TopoBus

<p align="left">
  <img src="frontend/topobus-logo.svg" alt="TopoBus logo" width="140">
</p>

TopoBus is a KNX project visualizer for ETS `.knxproj` files. It renders topology and group address views to help understand KNX project structure quickly.

## Workspace layout

- `crates/topobus-core`: KNX parsing + graph generation (shared by server and WASM)
- `crates/topobus-server`: local web server + embedded frontend
- `crates/topobus-wasm`: WASM bindings for client-side parsing

## Quick start (local server)

- `cargo run -p topobus-server`
- Open `http://127.0.0.1:8080`
- Drop a `.knxproj` file in the UI

## WASM build (static frontend)

The frontend will use WASM parsing when available and fall back to the server otherwise.

```bash
cd crates/topobus-wasm
wasm-pack build --target web --out-dir ../../frontend/wasm
```

Serve the `frontend/` directory as a static site (e.g., GitHub Pages).

## Exports

- Export full-graph SVG and PNG from the toolbar.
