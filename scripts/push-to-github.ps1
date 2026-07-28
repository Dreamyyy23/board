# Publish this folder to GitHub.
#
#   .\scripts\push-to-github.ps1 -Repo "https://github.com/<you>/board.git"
#
# The working copy on disk came from a downloaded ZIP, not a clone — there
# is no .git directory in it, so there is nothing for `git push` to push.
# Rather than `git init` over the top of it (which throws away the remote's
# history and forces you into a force-push), this clones the real
# repository into a temporary folder, copies the working files over it,
# and commits there. History is preserved and the push is a fast-forward.
#
# Run it from the board folder. Nothing is pushed until you confirm.

[CmdletBinding()]
param(
  # e.g. https://github.com/vixen/board.git
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Branch = "main",
  [string]$Message = "Obscur v5.3 - sculpted table, on-board decisions, keyboard play, table audio"
)

$ErrorActionPreference = "Stop"
$source = (Get-Location).Path

if (-not (Test-Path (Join-Path $source "package.json"))) {
  throw "Run this from the board folder (the one with package.json), not from $source."
}

# Build artefacts and dependencies never belong in the commit. The repo's
# own .gitignore covers most of it; this list is what gets copied, so
# anything not named here simply never reaches the clone.
$include = @(
  "app", "server", "worker", "scripts", "tests", "docs", "db", "drizzle",
  "github-pages", "public",
  "package.json", "package-lock.json", "tsconfig.json", "next.config.ts",
  "vite.config.ts", "vite.pages.config.ts", "postcss.config.mjs",
  "eslint.config.mjs", ".gitignore", ".env.example", ".nojekyll",
  "README.md", "CHANGELOG.md", "HOW-TO-RUN.md",
  # The built Pages release lives at the repo root and is what the live
  # site actually serves, so it has to go up with the source.
  "index.html", "pages-assets"
)

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("board-push-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))

Write-Host "`n== cloning $Repo" -ForegroundColor Cyan
git clone --depth 1 --branch $Branch $Repo $work
if ($LASTEXITCODE -ne 0) { throw "clone failed - check the URL and that you have access" }

Write-Host "`n== copying working files" -ForegroundColor Cyan
foreach ($item in $include) {
  $from = Join-Path $source $item
  if (-not (Test-Path $from)) {
    Write-Host "   skip   $item (not present)" -ForegroundColor DarkGray
    continue
  }
  $to = Join-Path $work $item
  if (Test-Path $from -PathType Container) {
    # Remove first, so files deleted locally are deleted in the commit too.
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item $from $to -Recurse -Force
  }
  else {
    Copy-Item $from $to -Force
  }
  Write-Host "   copied $item"
}

Push-Location $work
try {
  git add -A
  $staged = git diff --cached --stat
  if (-not $staged) {
    Write-Host "`nNothing changed - the remote already matches this folder." -ForegroundColor Yellow
    return
  }

  Write-Host "`n== what will be committed" -ForegroundColor Cyan
  git diff --cached --stat | Select-Object -Last 40

  $answer = Read-Host "`nPush this to $Branch? (y/N)"
  if ($answer -ne "y") {
    Write-Host "Stopped. The prepared clone is at $work if you want to inspect it." -ForegroundColor Yellow
    return
  }

  git commit -m $Message
  git push origin $Branch
  Write-Host "`nPushed. GitHub Pages usually redeploys within a minute." -ForegroundColor Green
}
finally {
  Pop-Location
}

Write-Host "`nTemporary clone: $work (delete it when you're happy)" -ForegroundColor DarkGray
