@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [CHYBA] Node.js neni nainstalovany.
  echo Nainstaluj Node.js LTS z https://nodejs.org/ a spust tento soubor znovu.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/3] Instaluju zavislosti...
  call npm install
  if errorlevel 1 (
    echo [CHYBA] npm install selhal.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Zavislosti uz jsou nainstalovane.
)

echo [2/3] Oteviram pokladnu v prohlizeci...
start "" "http://localhost:5050"

echo [3/3] Startuji Koupaliste POS...
echo.
echo PINy:
echo - Zmrzlina: 1111
echo - Bouda: 3333
echo - Truck: 4444
echo - Admin: 9999
echo.
echo Pro vypnuti serveru zavri toto okno nebo stiskni Ctrl+C.
echo.
npm start

pause
