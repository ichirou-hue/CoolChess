$ErrorActionPreference = "Stop"

# Always launch from the repository root so .env is found there, while Uvicorn
# imports server.py and its sibling packages from backend/.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

python -m uvicorn server:app `
    --app-dir backend `
    --reload `
    --reload-dir backend `
    --port 8080
