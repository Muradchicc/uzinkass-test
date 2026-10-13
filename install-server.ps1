#Requires -RunAsAdministrator
# Serverni shu kompyuterga o'rnatadi: Node.js, kutubxonalar, firewall va avtomatik ishga tushish.
# Ishga tushirish (administrator PowerShell'da, loyiha papkasida):
#   powershell -ExecutionPolicy Bypass -File .\install-server.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$taskName = 'Uzinkass test'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js o'rnatilmoqda..."
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --disable-interactivity
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js o'rnatilmadi. Uni nodejs.org dan qo'lda o'rnatib, skriptni qayta ishga tushiring."
    }
}

$envFile = Join-Path $root 'server\.env'
$port = 80
if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^PORT=(\d+)' } | Select-Object -First 1
    if ($line) { $port = [int]($line -replace '^PORT=', '') }
} else {
    Write-Warning "server\.env topilmadi - server sinov (fake) savollari bilan ishlaydi. Eski kompyuterdagi server\.env faylini ko'chiring."
}

$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($busy -and -not $existing) {
    $owner = (Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    throw "$port-port band (jarayon: $owner). Uni bo'shating yoki server\.env da boshqa PORT yozing."
}
if ($existing) { Stop-ScheduledTask -TaskName $taskName }

Write-Host "Kutubxonalar o'rnatilmoqda va frontend yig'ilmoqda..."
Push-Location $root
try {
    cmd /c "npm run setup"
    if ($LASTEXITCODE -ne 0) { throw "npm run setup xato bilan tugadi." }
} finally {
    Pop-Location
}

# 443 - https:// so'rovlarini http:// ga yo'naltirish uchun
Get-NetFirewallRule -DisplayName $taskName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $taskName -Direction Inbound -Protocol TCP -LocalPort $port, 443 -Action Allow | Out-Null

# Kompyuter yonganda server o'zi ishga tushadi (hech kim tizimga kirmagan bo'lsa ham)
$action = New-ScheduledTaskAction -Execute (Get-Command node).Source -Argument 'server\src\index.js' -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

$status = $null
foreach ($i in 1..20) {
    Start-Sleep -Seconds 1
    try { $status = Invoke-RestMethod "http://localhost:$port/api/status" -TimeoutSec 3; break } catch {}
}
if (-not $status) { throw "Server javob bermayapti. Tekshirish uchun qo'lda ishga tushiring: npm start" }

Write-Host ""
Write-Host "Server ishlayapti. Rejim: $($status.mode), savollar: $($status.totalQuestions)"
if ($status.lastSyncError) { Write-Warning "Google Sheets: $($status.lastSyncError)" }
$suffix = if ($port -eq 80) { '' } else { ":$port" }
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { Write-Host "Lokal tarmoqda: http://$($_.IPAddress)$suffix" }
