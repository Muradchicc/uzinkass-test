#Requires -RunAsAdministrator
# Serverdagi kodni GitHub'dagi oxirgi versiyaga yangilaydi va qayta ishga tushiradi.
# Administrator PowerShell'da:
#   [Net.ServicePointManager]::SecurityProtocol = 'Tls12'; irm https://raw.githubusercontent.com/Muradchicc/uzinkass-test/main/update-server.ps1 | iex

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$zipUrl = 'https://github.com/Muradchicc/uzinkass-test/archive/refs/heads/main.zip'

# O'rnatilgan papka: ishlab turgan vazifadan, bo'lmasa skript turgan joy yoki C:\uzinkass-test
$root = $null
$task = Get-ScheduledTask -TaskName 'Uzinkass test' -ErrorAction SilentlyContinue
if ($task) { $root = $task.Actions[0].WorkingDirectory }
if (-not $root -and $PSScriptRoot) { $root = $PSScriptRoot }
if (-not $root) { $root = 'C:\uzinkass-test' }
Write-Host "Papka: $root"

$tmp = Join-Path $env:TEMP ("uzinkass-update-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    Write-Host "Oxirgi versiya yuklanmoqda..."
    Invoke-WebRequest -Uri $zipUrl -OutFile (Join-Path $tmp 'main.zip') -UseBasicParsing
    Expand-Archive -Path (Join-Path $tmp 'main.zip') -DestinationPath $tmp
    # Arxiv ichida "uzinkass-test-main" papkasi bor - aynan uning ichidagilar ko'chiriladi
    $source = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Copy-Item -Path (Join-Path $source.FullName '*') -Destination $root -Recurse -Force
} finally {
    Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'install-server.ps1')
