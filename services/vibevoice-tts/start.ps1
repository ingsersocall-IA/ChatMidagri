# Start Supertonic TTS Server
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $scriptDir

if (-not (Test-Path -LiteralPath ".venv\Scripts\python.exe")) {
    Write-Host "Creating virtual environment..."
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1 -Scope Process
    Write-Host "Installing dependencies..."
    pip install -r requirements.txt
} else {
    .\.venv\Scripts\Activate.ps1 -Scope Process
}

$pythonExe = ".\.venv\Scripts\python.exe"
$depsOk = & $pythonExe -c "import importlib; ok = importlib.util.find_spec('supertonic') is not None; print(ok)" 2>$null
if ($LASTEXITCODE -ne 0 -or $depsOk.Trim().ToLower() -ne "true") {
    Write-Host "Installing Supertonic dependencies..."
    pip install -r requirements.txt
}

Write-Host "Starting Supertonic TTS Server on port 8099..."
python server.py
