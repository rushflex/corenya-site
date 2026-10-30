#Requires -RunAsAdministrator
<#
  Corenya Vanilla - Windows HTTPS kurulumu (Caddy + NSSM)
  -------------------------------------------------------
  Caddy'yi "CorenyaCaddy" servisi olarak kurar; 80/443'u dinler,
  sertifikayi (Let's Encrypt) otomatik alir ve yeniler,
  gelen istekleri 127.0.0.1:3000 uzerindeki Node uygulamasina aktarir.

  ON KOSULLAR
    - install-service.ps1 calistirilmis olmali (Node servisi ayakta)
    - Alan adinin A kaydi bu sunucunun IP'sini gostermeli
    - 80 ve 443 portlari saglayici panelinde acik olmali

  Kullanim:
    cd C:\corenya\deploy\windows
    powershell -ExecutionPolicy Bypass -File .\install-caddy.ps1 -Domain corenyavanilla.com
#>
[CmdletBinding()]
param(
  [string]$Domain = 'corenyavanilla.com',
  [string]$AppDir = 'C:\corenya',
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "  $m" -ForegroundColor Gray }
function Ok($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [UYARI] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  [HATA] $m" -ForegroundColor Red; exit 1 }

$caddyService = 'CorenyaCaddy'
$appDir = (Resolve-Path $AppDir).Path
$tools  = Join-Path $appDir 'tools'
$nssm   = Join-Path $tools 'nssm.exe'
$caddy  = Join-Path $tools 'caddy.exe'

Write-Host ''
Write-Host '  Corenya Vanilla - HTTPS kurulumu (Caddy)' -ForegroundColor Magenta
Write-Host '  ----------------------------------------' -ForegroundColor DarkMagenta

# 1) Node servisi ayakta mi?
$nodeSvc = Get-Service -Name 'CorenyaSite' -ErrorAction SilentlyContinue
if (-not $nodeSvc) { Warn 'CorenyaSite servisi bulunamadi. Once install-service.ps1 calistir.' }
elseif ($nodeSvc.Status -ne 'Running') { Warn "CorenyaSite servisi '$($nodeSvc.Status)' durumunda." }
else { Ok 'CorenyaSite servisi calisiyor' }

# 2) NSSM
if (-not (Test-Path $nssm)) { Die "nssm.exe bulunamadi ($nssm). Once install-service.ps1 calistir." }

function Nssm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NssmArgs)
  $quoted = $NssmArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
  Start-Process -FilePath $nssm -ArgumentList ($quoted -join ' ') -Wait -NoNewWindow -ErrorAction SilentlyContinue | Out-Null
}

# 3) Caddy indir
if (-not (Test-Path $caddy)) {
  Info 'Caddy indiriliyor (~19 MB)...'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile $caddy -UseBasicParsing
    Unblock-File $caddy
    Ok "Caddy hazir: $caddy"
  } catch {
    Die "Caddy indirilemedi ($($_.Exception.Message)). Elle indir: https://caddyserver.com/download -> caddy.exe dosyasini $tools icine koy."
  }
} else {
  Ok "Caddy mevcut: $caddy"
}
Ok "Caddy surumu: $(& $caddy version)"

# 4) 80/443 bosta mi? (IIS / http.sys cakismasi)
$busy = Get-NetTCPConnection -LocalPort 80, 443 -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -ne 0 }
if ($busy) {
  $owners = $busy | ForEach-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } | Sort-Object -Unique
  if ($owners -match 'System|w3wp|httpd') {
    Warn "80/443 baska bir servis tarafindan kullaniliyor ($($owners -join ', '))."
    Warn 'IIS varsa:  Stop-Service W3SVC ; Set-Service W3SVC -StartupType Disabled'
  } else {
    Warn "80/443 kullanan surec: $($owners -join ', ') - Caddy baslamazsa bunu kapat."
  }
}

# 5) Caddyfile yaz
$caddyfile = Join-Path $appDir 'deploy\windows\Caddyfile'
$www = if ($Domain -like 'www.*') { $Domain } else { "www.$Domain" }
$content = @"
# Corenya Vanilla - Caddy ters proxy (otomatik HTTPS)
# Bu dosya install-caddy.ps1 tarafindan olusturuldu.
# Elle calistirmak icin: tools\caddy.exe run --config deploy\windows\Caddyfile

$Domain, $www {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$Port
}
"@
Set-Content -Path $caddyfile -Value $content -Encoding UTF8
Ok "Caddyfile yazildi: $caddyfile  ($Domain, $www -> 127.0.0.1:$Port)"

# 6) Yapilandirmayi dogrula
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$validate = & $caddy validate --config $caddyfile --adapter caddyfile 2>&1 | Out-String
$validateCode = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($validateCode -ne 0) {
  Write-Host $validate
  Die 'Caddyfile gecersiz.'
}
Ok 'Caddyfile dogrulandi'

# 7) Eski servisi kaldir
if (Get-Service -Name $caddyService -ErrorAction SilentlyContinue) {
  Info 'Eski Caddy servisi kaldiriliyor...'
  Nssm stop $caddyService
  Nssm remove $caddyService confirm
  Start-Sleep -Seconds 2
}

# 8) Servisi kur
$certStore = Join-Path $appDir 'caddy-data'
New-Item -ItemType Directory -Force -Path $certStore | Out-Null
$logs = Join-Path $appDir 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$installArgs = 'install "{0}" "{1}" run --config "{2}" --adapter caddyfile' -f $caddyService, $caddy, $caddyfile
Start-Process -FilePath $nssm -ArgumentList $installArgs -Wait -NoNewWindow | Out-Null
Nssm set $caddyService AppDirectory $appDir
Nssm set $caddyService DisplayName 'Corenya Vanilla HTTPS (Caddy)'
Nssm set $caddyService Description 'Corenya Vanilla icin TLS sonlandiran ters proxy'
Nssm set $caddyService Start SERVICE_AUTO_START
Nssm set $caddyService AppStdout (Join-Path $logs 'caddy.log')
Nssm set $caddyService AppStderr (Join-Path $logs 'caddy-error.log')
Nssm set $caddyService AppRotateFiles 1
Nssm set $caddyService AppRotateBytes 1048576
Nssm set $caddyService AppEnvironmentExtra "APPDATA=$certStore" "LOCALAPPDATA=$certStore"
Nssm set $caddyService AppExit Default Restart
Nssm set $caddyService AppRestartDelay 3000
Ok "Servis kuruldu: $caddyService"

# 9) Baslat
Nssm start $caddyService
Start-Sleep -Seconds 8
if ((Get-Service -Name $caddyService).Status -ne 'Running') {
  Die "Caddy servisi baslamadi. Log: $logs\caddy-error.log (genelde 80/443 cakismasi veya DNS hatasi)"
}
Ok 'Caddy calisiyor'

# 10) Sertifika kontrolu
Info 'Sertifika aliniyor olabilir, 15 sn bekleniyor...'
Start-Sleep -Seconds 15
try {
  $r = Invoke-WebRequest "https://$Domain/api/health" -UseBasicParsing -TimeoutSec 20
  Ok "HTTPS calisiyor: https://$Domain  (HTTP $($r.StatusCode))"
} catch {
  Warn "https://$Domain henuz yanit vermedi."
  Warn ("DNS yayilmamis veya 80/443 kapali olabilir. Log: " + (Join-Path $logs 'caddy.log'))
}

Write-Host ''
Write-Host "  Site  : https://$Domain" -ForegroundColor Cyan
Write-Host "  Admin : https://$Domain/admin.html  (admin / corenya123 -> HEMEN DEGISTIR)" -ForegroundColor Cyan
Write-Host "  Loglar: $logs" -ForegroundColor Cyan
Write-Host ''
