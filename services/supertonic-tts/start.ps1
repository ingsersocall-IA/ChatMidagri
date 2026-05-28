# Start Supertonic TTS Server
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $scriptDir

if (-not (Test-Path -LiteralPath ".venv\Scripts\python.exe")) {
    Write-Host "Creando entorno virtual..."
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1 -Scope Process
    Write-Host "Instalando dependencias (supertonic + ONNX Runtime)..."
    pip install -r requirements.txt
} else {
    .\.venv\Scripts\Activate.ps1 -Scope Process
}

$pythonExe = ".\.venv\Scripts\python.exe"
$depsOk = & $pythonExe -c "import importlib; ok = importlib.util.find_spec('supertonic') is not None; print(ok)" 2>$null
if ($LASTEXITCODE -ne 0 -or $depsOk.Trim().ToLower() -ne "true") {
    Write-Host "Instalando dependencias de Supertonic..."
    pip install -r requirements.txt
}

Write-Host "Iniciando Supertonic TTS Server en puerto 8099..."
Write-Host "(DirectML GPU + ONNX Runtime - primera ejecucion descarga ~100 MB)"
python server.py
