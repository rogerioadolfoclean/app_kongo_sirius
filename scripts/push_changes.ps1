# push_changes.ps1
# Convenience script to install Git (via winget) if missing, then stage, commit and push the repository changes.
# Run this from the repository root in an elevated PowerShell session if required for winget.
# Usage: .\scripts\push_changes.ps1

param(
    [string]$CommitMessage = "Hardening: central config, env safety, remove audit placeholders, security middleware",
    [string]$NewBranch = "hardening/central-config"
)

function Ensure-GitInstalled {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        Write-Host "Git is already installed: $($git.Source)"
        return $true
    }

    Write-Host "Git not found. Attempting to install via winget..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Error "winget not available. Please install Git manually from https://git-scm.com/download/win and re-run this script."
        return $false
    }

    try {
        winget install --id Git.Git -e --source winget -h
        Start-Sleep -Seconds 2
        $git = Get-Command git -ErrorAction SilentlyContinue
        if ($git) {
            Write-Host "Git installed successfully."
            return $true
        } else {
            Write-Error "Git installation via winget finished but 'git' not found on PATH. Please restart your shell or log out/in and try again."
            return $false
        }
    } catch {
        Write-Error "Failed to install Git via winget: $($_.Exception.Message)"
        return $false
    }
}

# Ensure we are in a git repository (or initialize one)
if (-not (Test-Path .git)) {
    Write-Host "No .git directory detected. Initializing git repository..."
    git init
    Write-Host "You must add a remote (origin) before pushing. Run: git remote add origin <url>"
}

if (-not (Ensure-GitInstalled)) {
    Write-Error "Git is not available. Install Git and re-run this script."
    exit 1
}

# Show current branch
$branch = git rev-parse --abbrev-ref HEAD 2>$null
if (-not $branch) {
    Write-Host "No branch detected, creating branch $NewBranch"
    git checkout -b $NewBranch
    $branch = $NewBranch
}
Write-Host "Current branch: $branch"

# Stage and commit
Write-Host "Staging changes..."
git add .

# Check if there is anything to commit
$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes to commit."
} else {
    Write-Host "Committing with message: $CommitMessage"
    git commit -m "$CommitMessage"
}

# Attempt push
try {
    git push
} catch {
    Write-Host "Initial push failed; attempting to set upstream to origin/$branch"
    try {
        git push -u origin $branch
    } catch {
        Write-Warning "Push still failed. If the remote doesn't exist add it with: git remote add origin <url>\nIf the branch is protected, this script will create '$NewBranch' and push it."
        git checkout -b $NewBranch
        git push -u origin $NewBranch
        Write-Host "Pushed to branch: $NewBranch"
    }
}

Write-Host "Done. If push succeeded, go to GitHub and add the required Secrets (DB_PASSWORD, SESSION_SECRET) under Settings → Secrets → Actions."