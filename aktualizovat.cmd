@echo off
setlocal

cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [CHYBA] PowerShell neni dostupny.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0aktualizovat.ps1"

echo.
pause
