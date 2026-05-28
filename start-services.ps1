# ============================================================
# MIDAGRI Juridica - Script de arranque de servicios
# Inicia: whisper-server, VibeVoice TTS, NestJS backend, Angular frontend
# ============================================================

$projectRoot = "D:\Minagri Chatbt\midagri-juridica-web"
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Green
Write-Host "  MIDAGRI Juridica - Iniciando servicios" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# --- 1. Whisper Server (Speech-to-Text) ---
$whisperExe = "$projectRoot\services\whisper-cpp\build\bin\Release\whisper-server.exe"
$whisperModel = "$projectRoot\services\whisper-cpp\models\ggml-large-v3.bin"

if (Test-Path -LiteralPath $whisperExe) {
    Write-Host "[1/4] Iniciando whisper-server en puerto 8089..." -ForegroundColor Cyan
    Start-Process -FilePath $whisperExe -ArgumentList "--model `"$whisperModel`" --host 127.0.0.1 --port 8089 --language auto --no-timestamps" -WindowStyle Minimized
    Write-Host "       whisper-server iniciado." -ForegroundColor Green
} else {
    Write-Host "[1/4] whisper-server.exe NO encontrado. Compila primero con CMake." -ForegroundColor Red
}

# --- 2. VibeVoice TTS Server ---
$ttsDir = "$projectRoot\services\vibevoice-tts"
$ttsScript = "$ttsDir\start.ps1"

if (Test-Path -LiteralPath $ttsScript) {
    Write-Host "[2/4] Iniciando VibeVoice TTS en puerto 8099..." -ForegroundColor Cyan
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit -File `"$ttsScript`"" -WindowStyle Minimized
    Write-Host "       VibeVoice TTS iniciado." -ForegroundColor Green
} else {
    Write-Host "[2/4] VibeVoice TTS NO encontrado. Verifica services/vibevoice-tts/" -ForegroundColor Red
}

# --- 3. NestJS Backend ---
$serverDir = "$projectRoot\apps\server"

if (Test-Path -LiteralPath "$serverDir\package.json") {
    Write-Host "[3/4] Iniciando NestJS backend en puerto 3000..." -ForegroundColor Cyan
    Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$serverDir`" && npm run start:dev" -WindowStyle Minimized
    Write-Host "       NestJS backend iniciado." -ForegroundColor Green
} else {
    Write-Host "[3/4] NestJS backend NO encontrado." -ForegroundColor Red
}

# --- 4. Angular Frontend ---
$clientDir = "$projectRoot\apps\client"

if (Test-Path -LiteralPath "$clientDir\package.json") {
    Write-Host "[4/4] Iniciando Angular frontend en puerto 4200..." -ForegroundColor Cyan
    Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$clientDir`" && npm start" -WindowStyle Minimized
    Write-Host "       Angular frontend iniciado." -ForegroundColor Green
} else {
    Write-Host "[4/4] Angular frontend NO encontrado." -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Servicios iniciados:" -ForegroundColor Green
Write-Host "  - whisper-server : http://127.0.0.1:8089" -ForegroundColor White
Write-Host "  - VibeVoice TTS  : http://127.0.0.1:8099" -ForegroundColor White
Write-Host "  - NestJS API     : http://localhost:3000/api" -ForegroundColor White
Write-Host "  - Angular App    : http://localhost:4200" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Nota: El modelo VibeVoice tarda ~30-60s en cargar en GPU." -ForegroundColor Yellow
Write-Host "      Espera a que el servidor TTS muestre 'Model loaded successfully.'" -ForegroundColor Yellow
Write-Host ""

Read-Host "Presiona Enter para cerrar esta ventana (los servicios siguen ejecutandose)"
