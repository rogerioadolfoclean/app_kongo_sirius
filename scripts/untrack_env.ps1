# Safely untrack .env from git index while keeping the file on disk.
# Usage: run in repo root: .\scripts\untrack_env.ps1

if (-not (Test-Path .env)) {
  Write-Host ".env does not exist in working directory. Nothing to untrack."; exit 0
}

Write-Host "Adding .env to .gitignore (if not present)..."
if (-not (Select-String -Path .gitignore -Pattern "^\.env" -SimpleMatch -Quiet)) {
  Add-Content -Path .gitignore -Value "`n.env"
  Write-Host "Added .env to .gitignore"
} else {
  Write-Host ".env already in .gitignore"
}

Write-Host "Removing .env from git index (keeps the file on disk)..."
git rm --cached .env 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host ".env removed from git index. Commit the change to complete removal from repo history referencing." } else { Write-Host "Failed to remove .env from index or it was not tracked." }

Write-Host "Important: If .env has been pushed to remote, rotate any secrets exposed (DB_PASSWORD, SESSION_SECRET)."