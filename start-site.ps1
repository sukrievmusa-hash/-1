param(
    [int]$Port = 8080,
    [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Run PowerShell as Administrator.' -ForegroundColor Yellow
    Write-Host 'Open Start menu, find PowerShell, choose Run as Administrator, then run this script again.'
    exit 1
}

$ruleName = "Allow local web server on port $Port"

try {
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction Stop | Out-Null
}
catch {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)' } | Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $ip) { $ip = '127.0.0.1' }

$python = "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
if (-not (Test-Path $python)) {
    $python = 'python'
}

Write-Host "Server is available at:" -ForegroundColor Green
Write-Host ('http://' + $ip + ':' + $Port + '/') -ForegroundColor Green
Write-Host ('http://127.0.0.1:' + $Port + '/') -ForegroundColor Green

Push-Location $Root
try {
    & $python -m http.server $Port --bind 0.0.0.0
}
finally {
    Pop-Location
}
