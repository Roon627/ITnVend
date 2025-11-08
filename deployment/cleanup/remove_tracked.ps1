<#
Stops tracking selected local/large files in git but keeps local copies.
Run this from the repo root in PowerShell:

  Set-Location -Path (Resolve-Path .)  # ensure you're at repo root
  ./deployment/cleanup/remove_tracked.ps1

This script uses `git rm --cached` to untrack paths listed below.
Be sure to review and back up any sensitive files before running.
#>
param()

function Abort($msg) {
  Write-Error $msg
  exit 1
}

$gitRoot = git rev-parse --show-toplevel 2>$null
if (-not $gitRoot) { Abort "Not a git repository (run from repo root)." }

Set-Location -Path $gitRoot

$paths = @(
  'POS/Backend/database.db',
  'POS/database.db',
  'POS/Backend/postgres-data',
  'POS/postgres-data',
  'POS/Backend/eng.traineddata',
  'POS/Backend/certs',
  'estore/Backend/certs',
  'POS/Backend/docker-compose.postgres.yml'
)

foreach ($p in $paths) {
  try {
    git ls-files --error-unmatch $p | Out-Null
    Write-Host "Untracking: $p"
    git rm --cached -r -- $p
  } catch {
    Write-Host "Not tracked (skipping): $p"
  }
}

Write-Host "Also attempting to untrack node_modules files if present..."
try {
  $tracked = git ls-files "**/node_modules/*" 2>$null
  if ($tracked) {
    $tracked | ForEach-Object { git rm --cached -r -- $_ };
  }
} catch {
  Write-Host "No node_modules tracked or failed to enumerate."
}

Write-Host "Done. Review 'git status' and commit the changes (git add .gitignore; git commit -m 'chore: stop tracking local artifacts')"
