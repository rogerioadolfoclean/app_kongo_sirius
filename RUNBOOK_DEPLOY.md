Runbook — commit, push, CI secrets, and quick verification

This runbook lists the exact steps to commit the current hardening changes, push to the remote, configure GitHub Actions secrets, and verify CI. Run these locally on your machine (PowerShell on Windows).

1) Prerequisites
- Install Git if not already installed: https://git-scm.com/download/win
  Or via winget:

  winget install --id Git.Git -e --source winget

- Ensure you have network access to your remote (GitHub) and that you can authenticate (SSH key or HTTPS + PAT / Git Credential Manager).

2) Recommended local checks
```powershell
# run from repository root
npm ci
npm run lint   # optional but recommended
npm test       # verify tests locally
node scripts/audit_secrets.js  # should print: No obvious default secrets found. Good.
```

3) Commit & push
```powershell
# Verify git and branch
git --version
$branch = git branch --show-current
if (-not $branch) {
  git branch
  Write-Error "Checkout the branch you want to push, e.g. 'git checkout main'"
  exit 1
}
Write-Host "Current branch: $branch"

# Stage and commit
git add .
git commit -m "Hardening: central config, env safety, remove audit placeholders, security middleware"

# Push (set upstream if needed)
try {
  git push
} catch {
  Write-Host "Attempting to set upstream to origin/$branch"
  git push -u origin $branch
}

# If push fails due to branch protection, create a feature branch and push
if ($LASTEXITCODE -ne 0) {
  $newBranch = "hardening/central-config"
  git checkout -b $newBranch
  git push -u origin $newBranch
  Write-Host "Pushed to $newBranch — open a PR from it to protected branch."
}
```

4) Add GitHub Actions secrets (in GitHub > Settings > Secrets > Actions)
- DB_PASSWORD: password used by CI to initialize the test DB
- SESSION_SECRET: a long, random secret used in production
- TEST_ADMIN_PASSWORD (optional): override admin password used by tests

5) Trigger CI
- After pushing, open the repository on GitHub and check the Actions tab. CI will run automatically on the pushed branch.

6) Troubleshooting common CI errors
- DB connection failures: ensure your CI workflow sets DB_PASSWORD and the `scripts/ci_init_db.js` completed successfully.
- Failing tests about progression/duplicate keys: ensure the DB was freshly initialized or that `scripts/ci_init_db.js` was run; tests expect idempotent init.
- Lint errors: run `npm run lint` locally and fix; otherwise inspect Actions log for file + line markers.

7) Post-merge / production
- Rotate secrets in your secret manager when going to production (SESSION_SECRET, DB_PASSWORD).
- Add monitoring, backups, and migrations as a next step.

Verification steps after CI passes
```powershell
# Optional: run a lightweight smoke test against a deployed dev instance
# set env vars locally for testing
$env:DB_PASSWORD = "<local_db_password>"
$env:SESSION_SECRET = "<test_secret_long_enough>"
node app.js
# open http://localhost:3000 and walk through login/inscription/admin pages
```

Notes
- The repo now avoids embedding default secrets. CI must supply secrets through Actions secrets or the runs will fail.
- If you want me to open a draft PR body/message for you to paste, I can produce it now.
