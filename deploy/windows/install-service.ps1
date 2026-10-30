#Requires -RunAsAdministrator
<#
  Corenya Vanilla - Windows servis kurulumu (NSSM)
  -------------------------------------------------
  Node.js uygulamasini "CorenyaSite" adinda bir Windows servisi olarak kurar.
  Boylece sunucu yeniden baslasa da site kendiliginden ayaga kalkar.

  Kullanim (PowerShell'i yonetici olarak ac):
    cd C:\corenya\deploy\windows
    powershell -ExecutionPolicy Bypass -File .\install-service.ps1

  Farkli klasor/port icin:
    .\install-service.ps1 -AppDir "D:\corenya" -Port 3000
#>
[CmdletBinding()]
param(
  [string]$AppDir = 'C:\corenya',
  [string]$ServiceName = 'CorenyaSite',
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "  $m" -ForegroundColor Gray }
function Ok($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [UYARI] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  [HATA] $m" -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '  Corenya Vanilla - Windows servis kurulumu' -ForegroundColor Magenta
Write-Host '  -----------------------------------------' -ForegroundColor DarkMagenta

# 1) Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Die 'Node.js bulunamadi. https://nodejs.org adresinden LTS surumu kurup betigi tekrar calistir.' }
$nodeExe = $nodeCmd.Source
Ok "Node.js $(& $nodeExe -v)  ->  $nodeExe"

# 2) Uygulama klasoru
if (-not (Test-Path $AppDir)) { Die "Klasor bulunamadi: $AppDir  (proje dosyalarini once buraya kopyala)" }
$appDir = (Resolve-Path $AppDir).Path
if (-not (Test-Path (Join-Path $appDir 'server.js'))) { Die "$appDir icinde server.js yok." }
Ok "Uygulama klasoru: $appDir"

# 3) NSSM (servis sarmalayici)
$tools = Join-Path $appDir 'tools'
$nssm  = Join-Path $tools 'nssm.exe'
if (-not (Test-Path $nssm)) {
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'x86') { 'win32' } else { 'win64' }
  $zip  = Join-Path $env:TEMP 'nssm.zip'
  Info 'NSSM indiriliyor...'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tools -Force
    Copy-Item (Join-Path $tools "nssm-2.24\$arch\nssm.exe") $nssm -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Ok "NSSM hazir: $nssm"
  } catch {
    Die "NSSM indirilemedi ($($_.Exception.Message)). Elle indir: https://nssm.cc/download -> nssm.exe dosyasini $tools icine kopyala ve betigi tekrar calistir."
  }
} else {
  Ok "NSSM mevcut: $nssm"
}

# NSSM cagrilari (bosluklu yollari dogru quote eder)
function Nssm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NssmArgs)
  $quoted = $NssmArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
  Start-Process -FilePath $nssm -ArgumentList ($quoted -join ' ') -Wait -NoNewWindow -ErrorAction SilentlyContinue | Out-Null
}

# 4) Varsa eski servisi kaldir (guncelleme icin guvenli)
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Info 'Eski servis kaldiriliyor...'
  Nssm stop $ServiceName
  Nssm remove $ServiceName confirm
  Start-Sleep -Seconds 2
}

# 5) Servisi kur
$logs = Join-Path $appDir 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

Nssm install $ServiceName $nodeExe server.js
Nssm set $ServiceName AppDirectory $appDir
Nssm set $ServiceName DisplayName 'Corenya Vanilla Site'
Nssm set $ServiceName Description 'Corenya Vanilla web sitesi, magaza ve yonetim paneli (Node.js)'
Nssm set $ServiceName Start SERVICE_AUTO_START
Nssm set $ServiceName AppStdout (Join-Path $logs 'site.log')
Nssm set $ServiceName AppStderr (Join-Path $logs 'site-error.log')
Nssm set $ServiceName AppRotateFiles 1
Nssm set $ServiceName AppRotateBytes 1048576
Nssm set $ServiceName AppEnvironmentExtra "HOST=127.0.0.1" "PORT=$Port" "NODE_ENV=production"
Nssm set $ServiceName AppExit Default Restart
Nssm set $ServiceName AppRestartDelay 3000
Nssm set $ServiceName AppStopMethodConsole 5000
Ok "Servis kuruldu: $ServiceName  (port $Port, sadece 127.0.0.1)"

# 6) Baslat
Nssm start $ServiceName
Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName
if ($svc.Status -ne 'Running') { Die "Servis baslatilamadi. Log: $logs\site-error.log" }
Ok 'Servis calisiyor ve otomatik baslangica ayarli'

# 7) Yerel saglik kontrolu
try {
  $r = Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 10
  Ok "API cevap veriyor (HTTP $($r.StatusCode))"
} catch {
  Warn "API yanit vermedi. Log kontrol: $logs\site-error.log"
}

# 8) Guvenlik duvari: sadece 80/443
foreach ($p in 80, 443) {
  $ruleName = "Corenya Web TCP $p"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow -Profile Any | Out-Null
    Ok "Guvenlik duvari: $p acildi"
  } else {
    Ok "Guvenlik duvari: $p zaten acik"
  }
}

Write-Host ''
Write-Host "  Yerel test : http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "  Admin      : http://127.0.0.1:$Port/admin.html  (admin / corenya123)" -ForegroundColor Cyan
Write-Host "  Loglar     : $logs" -ForegroundColor Cyan
Write-Host ''
Write-Host '  Sonraki adim: HTTPS icin install-caddy.ps1 (bkz. DEPLOY-WINDOWS.md)' -ForegroundColor Yellow
Write-Host ''
