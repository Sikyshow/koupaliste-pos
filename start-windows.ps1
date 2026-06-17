$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[CHYBA] Node.js neni nainstalovany." -ForegroundColor Red
  Write-Host "Nainstaluj Node.js LTS z https://nodejs.org/ a spust tento soubor znovu."
  Read-Host "Enter pro konec"
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[1/3] Instaluju zavislosti..."
  npm install
} else {
  Write-Host "[1/3] Zavislosti uz jsou nainstalovane."
}

Write-Host "[2/3] Oteviram pokladnu v prohlizeci..."
Start-Process "http://localhost:5050"

Write-Host "[3/3] Startuji Koupaliste POS..."
Write-Host ""
Write-Host "PINy:"
Write-Host "- Zmrzlina: 1111"
Write-Host "- Bouda: 3333"
Write-Host "- Truck: 4444"
Write-Host "- Admin: 9999"
Write-Host ""
Write-Host "Pro vypnuti serveru zavri toto okno nebo stiskni Ctrl+C."
Write-Host ""
npm start
