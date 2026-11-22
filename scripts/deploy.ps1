<#
  Deploys the last commit to production on Vercel.

    npm run deploy

  Only committed code ships: the commit is exported to a temp folder and
  deployed from there, so half-finished local edits never go live.
  Migrations run automatically during the Vercel build.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$link = Join-Path $root '.vercel\project.json'
if (-not (Test-Path $link)) {
  throw "This folder isn't linked to a Vercel project yet (missing .vercel\project.json)."
}

$dirty = git -C $root status --porcelain
if ($dirty) {
  Write-Host "Note: you have uncommitted changes. They will NOT be deployed; only the last commit ships." -ForegroundColor Yellow
}
$commit = git -C $root log -1 --format='%h %s'
Write-Host "Deploying: $commit" -ForegroundColor Cyan

$out = Join-Path $env:TEMP 'called-it-deploy'
$tar = Join-Path $env:TEMP 'called-it-deploy.tar'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path (Join-Path $out '.vercel') -Force | Out-Null
git -C $root archive --format=tar -o $tar HEAD
tar -xf $tar -C $out
Remove-Item $tar
Copy-Item $link (Join-Path $out '.vercel\project.json')

# Find the Vercel CLI even if this terminal started before it was installed (stale PATH).
$vercel = Join-Path $env:APPDATA 'npm\vercel.cmd'
if (-not (Test-Path $vercel)) { $vercel = (Get-Command vercel.cmd -ErrorAction SilentlyContinue).Source }
if (-not $vercel) { throw "Vercel CLI not found. Run: npm install -g vercel" }

& $vercel deploy --prod --yes --cwd $out
if ($LASTEXITCODE -ne 0) { throw "Deploy failed (exit $LASTEXITCODE)." }
