$ErrorActionPreference = "Stop"

$repo = "Sikyshow/koupaliste-pos"
$branch = "main"
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tempRoot = Join-Path $env:TEMP ("koupaliste-pos-update-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot "update.zip"
$extractDir = Join-Path $tempRoot "extract"
$encodedBranch = [System.Uri]::EscapeDataString($branch)
$downloadUrl = "https://api.github.com/repos/$repo/zipball/$encodedBranch"

function Write-Step($message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Cyan
}

try {
  Write-Step "[1/4] Pripravuju aktualizaci..."
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

  $headers = @{
    "User-Agent" = "koupaliste-pos-updater"
    "Accept" = "application/vnd.github+json"
  }

  Write-Step "[2/4] Stahuju posledni verzi z GitHubu..."
  try {
    Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $zipPath
  } catch {
    Write-Host ""
    Write-Host "[CHYBA] Nepodarilo se stahnout aktualizaci." -ForegroundColor Red
    Write-Host "Zkontroluj pripojeni k internetu a dostupnost GitHubu."
    Write-Host "URL aktualizace:"
    Write-Host $downloadUrl
    throw
  }

  Write-Step "[3/4] Rozbaluju aktualizaci..."
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
  $sourceDir = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
  if (-not $sourceDir) {
    throw "V archivu se nenasla slozka s aplikaci."
  }

  Write-Step "[4/4] Kopiruju novou verzi..."
  $exclude = @("node_modules", "github-token.txt", "koupaliste.db")
  Get-ChildItem -Path $sourceDir.FullName -Force | ForEach-Object {
    if ($exclude -contains $_.Name) {
      return
    }

    $target = Join-Path $appDir $_.Name
    if (Test-Path $target) {
      Remove-Item -Path $target -Recurse -Force
    }
    Copy-Item -Path $_.FullName -Destination $target -Recurse -Force
  }

  $modulesDir = Join-Path $appDir "node_modules"
  if (Test-Path $modulesDir) {
    Remove-Item -Path $modulesDir -Recurse -Force
  }

  Write-Host ""
  Write-Host "Hotovo. Aktualizace je nainstalovana." -ForegroundColor Green
  Write-Host "Ted spust start-windows.cmd. Pri prvnim startu po aktualizaci se znovu nainstaluji moduly."
} finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
