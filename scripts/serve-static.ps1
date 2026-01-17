$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$wasmOut = Join-Path $repoRoot 'frontend\wasm'
$port = if ([string]::IsNullOrWhiteSpace($env:PORT)) { '8080' } else { $env:PORT }
$bindHost = if ([string]::IsNullOrWhiteSpace($env:HOST)) { '127.0.0.1' } else { $env:HOST }

function Require-Command {
    param(
        [string]$Name,
        [string]$Help
    )
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Error $Help
        exit 1
    }
}

Require-Command -Name 'wasm-pack' -Help 'wasm-pack is required: https://rustwasm.github.io/wasm-pack/installer/'

$python = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' } elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { $null }
if (-not $python) {
    Write-Error 'python3 (or python) is required to serve the static app.'
    exit 1
}

Write-Host "Building WASM into $wasmOut..."
Push-Location (Join-Path $repoRoot 'crates\topobus-wasm')
try {
    & wasm-pack build --target web --out-dir $wasmOut
} finally {
    Pop-Location
}

Write-Host "Serving static app at http://$bindHost`:$port"
Write-Host 'Press Ctrl+C to stop.'
Push-Location (Join-Path $repoRoot 'frontend')
try {
    & $python -m http.server $port --bind $bindHost
} finally {
    Pop-Location
}
