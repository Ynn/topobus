# TopoBus

<p align="center">
  <img src="frontend/topobus-logo.svg" alt="TopoBus logo" width="140">
</p>

TopoBus is a small KNX project viewer for ETS `.knxproj` files. It helps you quickly see the topology and group addresses without trying to replace ETS.

<p align="center">
  <img src="images/topobus_screenshot.png" alt="TopoBus logo">
</p>

## What it does

- Visualize physical topology and group address views.
- Export the graph as SVG or PNG.

## Get the latest release

Open the GitHub Releases page for this repo, download the archive for your OS, unzip it, and run:

```bash
./topobus
# On Windows: topobus.exe
```

Then open `http://127.0.0.1:8080` and drop your `.knxproj` file.

## Online mode (GitHub Pages)

Open the GitHub Pages site for this repo and drop your `.knxproj` file in the page.

Important: the online mode runs fully in your browser (WASM). The file stays on your computer; nothing is executed or uploaded on the server.

If the online mode fails to load, try a modern browser and the local release.
