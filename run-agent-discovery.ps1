$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvActivate = Join-Path $root ".venv\Scripts\Activate.ps1"
$agentDir = Join-Path $root "agent"

if (-not (Test-Path $venvActivate)) {
  throw "No se encontro .venv en $root. Crea el entorno virtual antes de ejecutar este script."
}

if (-not (Test-Path (Join-Path $agentDir "agent.py"))) {
  throw "No se encontro agent\agent.py en $root."
}

& $venvActivate
$env:DISCOVERY_ONLY = "1"
$env:ENABLE_PROJECT_DISCOVERY = "1"
$env:ENABLE_PORTFOLIO_SYNC = "0"
$env:PORTFOLIO_ONLY = "0"

Push-Location $agentDir
try {
  python .\agent.py
}
finally {
  Pop-Location
}
