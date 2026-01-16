# TopoBus

<p align="center">
  <img src="frontend/topobus-logo.svg" alt="TopoBus logo" width="140">
</p>



TopoBus is a KNX project visualizer for ETS `.knxproj` files. It renders topology and group address views to help understand KNX project structure quickly.

<p align="center">
  <img src="images/topobus_screenshot.png" alt="TopoBus logo">
</p>

## Workspace layout

- `crates/topobus-core`: KNX parsing + graph generation (shared by server and WASM)
- `crates/topobus-server`: local web server + embedded frontend
- `crates/topobus-wasm`: WASM bindings for client-side parsing

## Quick start (local server)

- `cargo run -p topobus-server`
- Open `http://127.0.0.1:8080`
- Drop a `.knxproj` file in the UI

## Install local binary

Build and install the CLI locally (binary name is `topobus`):

```bash
cargo install --path crates/topobus-server
topobus
```

Or build a release binary without installing:

```bash
cargo build --release -p topobus-server
./target/release/topobus
```

## WASM build (static frontend)

The frontend will use WASM parsing when available and fall back to the server otherwise.

```bash
cd crates/topobus-wasm
wasm-pack build --target web --out-dir ../../frontend/wasm
```

Serve the `frontend/` directory as a static site (e.g., GitHub Pages).

## Exports

- Export full-graph SVG and PNG from the toolbar.

## GitHub Actions releases

Tagging a new version publishes native binaries and a static WASM site:

```bash
git tag v0.1.0
git push origin v0.1.0
```

- Release artifacts (Linux/macOS/Windows) are attached to the GitHub Release.
- GitHub Pages publishes the WASM build under `/<version>/` (e.g. `/v0.1.0/`).
- The root page redirects to the latest version.

To enable Pages, set the repo source to GitHub Actions (Settings → Pages → Source).
