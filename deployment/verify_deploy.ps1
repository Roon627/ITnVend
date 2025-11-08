<#
Simple deployment verification script for ITnVend POS backend.
It runs a few smoke tests:
 - GET /api/products
 - POST /api/login  (requires staff credentials; pass via env or prompt)
 - POST /api/token/refresh (uses cookie set by login)

Usage:
  powershell -File verify_deploy.ps1 -BaseUrl "https://pos.example.com"
  # or
  $env:ITNV_USER='admin'; $env:ITNV_PASS='secret'; powershell -File verify_deploy.ps1 -BaseUrl 'https://pos.example.com'

Exit codes:
  0 = all checks passed
  non-zero = failure
#>
param(
  [string]$BaseUrl = "http://localhost:4000",
  [string]$Username = $env:ITNV_USER,
  [string]$Password = $env:ITNV_PASS
)

Write-Host "Running quick smoke tests against: $BaseUrl"

function Fail($msg, $code=1) {
  Write-Error $msg
  exit $code
}

try {
  Write-Host "1) GET /api/products"
  $prod = Invoke-RestMethod -Uri "$BaseUrl/api/products" -Method Get -ErrorAction Stop
  if (-not $prod) { Fail "GET /api/products returned no data" }
  Write-Host "  OK: products returned: $($prod.Count) items"
} catch {
  Fail "GET /api/products failed: $($_.Exception.Message)", 2
}

if (-not $Username -or -not $Password) {
  Write-Warning "No login credentials provided via parameters or ITNV_USER/ITNV_PASS env vars. Skipping login/refresh checks."
  exit 0
}

# Session to keep cookies
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

try {
  Write-Host "2) POST /api/login (username provided)"
  $body = @{ username = $Username; password = $Password } | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri "$BaseUrl/api/login" -Method Post -Body $body -ContentType 'application/json' -WebSession $session -ErrorAction Stop
  if (-not $resp.token) { Fail "Login did not return token" }
  Write-Host "  OK: received token (length $($resp.token.Length))"
} catch {
  Fail "Login failed: $($_.Exception.Message)", 3
}

try {
  Write-Host "3) POST /api/token/refresh (uses cookie in session)"
  $refreshResp = Invoke-RestMethod -Uri "$BaseUrl/api/token/refresh" -Method Post -WebSession $session -ErrorAction Stop
  if (-not $refreshResp.token) { Fail "Refresh did not return token" }
  Write-Host "  OK: refresh returned token (length $($refreshResp.token.Length))"
} catch {
  Fail "Refresh failed: $($_.Exception.Message)", 4
}

Write-Host "All smoke checks passed."
exit 0
