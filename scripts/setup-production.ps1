<#
  One-time production setup for Called It on Vercel. Safe to re-run: finished steps are skipped.

    .\scripts\setup-production.ps1

  1. Database: adds a free Turso database to the Vercel project (you accept Turso's terms).
  2. Domain:   opens Cloudflare to add the calledit.rwang.dev DNS record (you click Authorize).
  3. Secrets:  asks you to paste the Google client secret and (optionally) an Anthropic API key.
               Input is hidden and goes straight to Vercel; nothing is written to disk.
  4. Deploy:   ships the last commit to https://calledit.rwang.dev
#>
$ErrorActionPreference = 'Continue'
$Domain = 'calledit.rwang.dev'
$root = Split-Path -Parent $PSScriptRoot
$link = Join-Path $root '.vercel\project.json'
if (-not (Test-Path $link)) { Write-Host "Missing .vercel\project.json. Ask Claude to link the Vercel project first." -ForegroundColor Red; exit 1 }
$proj = Get-Content $link -Raw | ConvertFrom-Json

# A tiny linked folder so vercel commands never touch your repo's .env.local.
$work = Join-Path $env:TEMP 'called-it-link'
New-Item -ItemType Directory -Force -Path (Join-Path $work '.vercel') | Out-Null
Copy-Item $link (Join-Path $work '.vercel\project.json') -Force

function Step([string]$n, [string]$text) { Write-Host ""; Write-Host "[$n/4] $text" -ForegroundColor Cyan }
function Ok([string]$text) { Write-Host "  OK  $text" -ForegroundColor Green }

# Find the Vercel CLI even if this terminal started before it was installed (stale PATH).
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
$Vercel = Join-Path $env:APPDATA 'npm\vercel.cmd'
if (-not (Test-Path $Vercel)) { $Vercel = (Get-Command vercel.cmd -ErrorAction SilentlyContinue).Source }
if (-not $Vercel) {
  Write-Host "Installing the Vercel CLI..."
  & npm.cmd install -g vercel@latest | Out-Null
  $Vercel = Join-Path $env:APPDATA 'npm\vercel.cmd'
  if (-not (Test-Path $Vercel)) { Write-Host "Couldn't install the Vercel CLI. Run: npm install -g vercel" -ForegroundColor Red; exit 1 }
}
function Vc { & $Vercel @args --cwd $work 2>&1 | Where-Object { "$_" -notmatch 'claude-code-hint' } | ForEach-Object { "$_" } }
$null = Vc whoami
if ($LASTEXITCODE -ne 0) {
  Write-Host "Sign in to Vercel: a browser tab opens; approve the request there." -ForegroundColor Cyan
  & $Vercel login
  $null = Vc whoami
  if ($LASTEXITCODE -ne 0) { Write-Host "Still not signed in to Vercel. Re-run this script to try again." -ForegroundColor Red; exit 1 }
}
Ok "Signed in to Vercel as $((Vc whoami | Select-Object -Last 1).Trim())"
function Read-Secret([string]$prompt) {
  $s = Read-Host -AsSecureString $prompt
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function Set-Env([string]$name, [string]$value, [switch]$Secret) {
  $kind = if ($Secret) { '--sensitive' } else { '--no-sensitive' }
  $null = Vc env add $name --environment production --value $value $kind --force
  if ($LASTEXITCODE -ne 0) { Write-Host "  Couldn't save $name to Vercel." -ForegroundColor Red; exit 1 }
  Ok "$name saved to Vercel"
}
$existing = (Vc env ls --environment production) -join "`n"
function Has([string]$name) { return $existing -match "(?m)^\s*$name\s" }

# ---------------------------------------------------------------- 1. Database
Step 1 "Database (Turso, free Starter plan)"
if (Has 'TURSO_DATABASE_URL') { Ok "Turso already connected" }
else {
  Write-Host "  Vercel will show Turso's terms. Accept them to create the free database."
  & $Vercel integration add tursocloud/database --name called-it-db --billing-plan starter --meta region=iad1 -e production --no-env-pull --cwd $work
  if ($LASTEXITCODE -ne 0) { Write-Host "  Turso setup didn't finish. Re-run this script to try again." -ForegroundColor Red; exit 1 }
  Ok "Turso database created and connected"
}

# ---------------------------------------------------------------- 2. Domain
Step 2 "Domain: $Domain"
function DnsOk { $v = (Vc domains verify $Domain) -join "`n"; return ($LASTEXITCODE -eq 0 -and $v -notmatch 'invalid|action_required') }
if (DnsOk) { Ok "DNS already points at Vercel" }
else {
  $apply = "https://vercel.com/api/v9/projects/$($proj.projectId)/domains/$Domain/domain-connect/apply?teamId=$($proj.orgId)"
  Write-Host "  Opening Cloudflare in your browser. Sign in if asked, then click Authorize/Connect"
  Write-Host "  to add the DNS record for $Domain."
  Start-Process $apply
  Read-Host "  Press Enter after you've approved it in Cloudflare" | Out-Null
  if (DnsOk) { Ok "DNS points at Vercel" } else { Write-Host "  Not visible yet. DNS can take a few minutes; continuing." -ForegroundColor Yellow }
}

# ---------------------------------------------------------------- 3. Secrets
Step 3 "Sign-in and Claude keys"
if (Has 'GOOGLE_CLIENT_ID') { Ok "GOOGLE_CLIENT_ID already set" }
else {
  do { $gid = (Read-Host "  Google Client ID (ends in .apps.googleusercontent.com)").Trim() } until ($gid -match '\.apps\.googleusercontent\.com$')
  Set-Env GOOGLE_CLIENT_ID $gid
}
if (Has 'GOOGLE_CLIENT_SECRET') { Ok "GOOGLE_CLIENT_SECRET already set" }
else {
  Write-Host "  Paste the Client secret from the Google 'OAuth client created' dialog (input is hidden)."
  do { $gs = Read-Secret "  Google Client secret" } until ($gs.Length -ge 20)
  Set-Env GOOGLE_CLIENT_SECRET $gs -Secret
  Remove-Variable gs
}
if (Has 'ANTHROPIC_API_KEY') { Ok "ANTHROPIC_API_KEY already set" }
else {
  Write-Host "  Optional: an Anthropic API key lets Claude make picks and call results."
  Write-Host "  Opening console.anthropic.com/settings/keys. Create a key, copy it, paste it here."
  Start-Process 'https://console.anthropic.com/settings/keys'
  $ak = Read-Secret "  Anthropic API key (starts with sk-ant-, or press Enter to skip)"
  if ($ak) { Set-Env ANTHROPIC_API_KEY $ak -Secret } else { Write-Host "  Skipped. Claude stays off until you re-run this and add a key." -ForegroundColor Yellow }
  Remove-Variable ak
}

# ---------------------------------------------------------------- 4. Deploy
Step 4 "Deploying the last commit"
& (Join-Path $PSScriptRoot 'deploy.ps1')
if (-not $?) { exit 1 }
Write-Host ""
Write-Host "Live at https://$Domain  (a new domain's HTTPS certificate can take a few minutes)" -ForegroundColor Green
