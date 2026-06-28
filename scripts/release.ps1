#!/usr/bin/env pwsh
<#
  Verified release for Noteview.

  Runs the gate (type-check + frontend build + cargo check). ONLY if it all
  passes does it bump the SemVer version in lockstep across package.json /
  Cargo.toml / tauri.conf.json, commit, tag vX.Y.Z, and push to GitHub.
  If anything fails, nothing is committed.

  Usage:
    pwsh scripts/release.ps1 patch "fix: correct strikethrough output"
    pwsh scripts/release.ps1 minor "feat: add export to RTF"
    pwsh scripts/release.ps1 major "redesign the settings model"

  patch = bug fixes | minor = new features (compatible) | major = big/breaking
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('patch', 'minor', 'major')][string]$Bump,
  [Parameter(Mandatory = $true)][string]$Message
)
$ErrorActionPreference = 'Stop'

$root  = Split-Path -Parent $PSScriptRoot
$app   = Join-Path $root 'app'
$pkg   = Join-Path $app 'package.json'
$cargo = Join-Path $app 'src-tauri/Cargo.toml'
$conf  = Join-Path $app 'src-tauri/tauri.conf.json'
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# 1) Verification gate -----------------------------------------------------
Write-Host '==> Verifying: npm run build (tsc && vite build) ...' -ForegroundColor Cyan
Push-Location $app
try { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend type-check/build FAILED - nothing committed.' } }
finally { Pop-Location }

Write-Host '==> Verifying: cargo check ...' -ForegroundColor Cyan
Push-Location (Join-Path $app 'src-tauri')
try { cargo check; if ($LASTEXITCODE -ne 0) { throw 'cargo check FAILED - nothing committed.' } }
finally { Pop-Location }

# 2) Bump the version (exact old-string replace is safe; deps use other strings)
$old = (Get-Content $pkg -Raw | ConvertFrom-Json).version
$parts = $old.Split('.'); [int]$MA = $parts[0]; [int]$MI = $parts[1]; [int]$PA = $parts[2]
switch ($Bump) {
  'major' { $MA++; $MI = 0; $PA = 0 }
  'minor' { $MI++; $PA = 0 }
  'patch' { $PA++ }
}
$new = "$MA.$MI.$PA"
Write-Host "==> Bumping version $old -> $new" -ForegroundColor Cyan

foreach ($f in @($pkg, $conf)) {
  (Get-Content $f -Raw) -replace ('"version": "' + [regex]::Escape($old) + '"'), ('"version": "' + $new + '"') | Set-Content $f -NoNewline
}
(Get-Content $cargo -Raw) -replace ('version = "' + [regex]::Escape($old) + '"'), ('version = "' + $new + '"') | Set-Content $cargo -NoNewline

# 3) Commit, tag, push -----------------------------------------------------
Write-Host '==> Committing, tagging v' "$new" ', pushing ...' -ForegroundColor Cyan
git -C $root add -A
git -C $root commit -m "$Message (v$new)"
git -C $root tag "v$new"
git -C $root push
git -C $root push --tags
Write-Host "==> Released v$new" -ForegroundColor Green
