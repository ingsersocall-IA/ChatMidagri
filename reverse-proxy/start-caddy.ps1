$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$caddyfile = Join-Path $scriptDir "Caddyfile"
$exePath = Join-Path $scriptDir "caddy.exe"

if (-not (Test-Path $exePath)) {
  Write-Host "No se encontró caddy.exe en $scriptDir" -ForegroundColor Yellow
  Write-Host "Instala Caddy y copia caddy.exe aquí, o usa:" -ForegroundColor Yellow
  Write-Host "  winget install CaddyServer.Caddy" -ForegroundColor Cyan
  throw "caddy.exe no disponible."
}

Write-Host "Iniciando Caddy en :8080..." -ForegroundColor Green
& $exePath run --config $caddyfile --adapter caddyfile
