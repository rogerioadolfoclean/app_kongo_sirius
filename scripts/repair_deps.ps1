# Repair dependencies on Windows: remove node_modules and package-lock.json and reinstall
# Usage: Open PowerShell in repo root and run: .\scripts\repair_deps.ps1

Write-Host "Removing node_modules and package-lock.json (if present)..."
if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules; Write-Host "Removed node_modules" } else { Write-Host "node_modules not present" }
if (Test-Path package-lock.json) { Remove-Item -Force package-lock.json; Write-Host "Removed package-lock.json" } else { Write-Host "package-lock.json not present" }

Write-Host "Installing dependencies (npm install)..."
# Use npm ci if you have a lockfile and want deterministic install; fallback to npm install when lockfile was removed.
npm install

if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE } else { Write-Host "Dependencies installed successfully." }
