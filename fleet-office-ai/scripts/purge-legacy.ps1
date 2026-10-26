<#
.SYNOPSIS
  One-click legacy purge for Windows (PowerShell 5.1 or 7).
.DESCRIPTION
  scripts\purge-legacy.ps1            Dry run: lists what would be removed, changes nothing.
  scripts\purge-legacy.ps1 -Apply     Archive to a .zip -> delete -> verify -> auto-restore if verification fails.
  Options: -Yes (skip the typed confirmation)  -NoVerify (skip post-purge checks; not recommended)
  If PowerShell blocks the script, run:  powershell -ExecutionPolicy Bypass -File scripts\purge-legacy.ps1 -Apply
  The list lives in scripts\legacy-files.txt. .env files, node_modules, .git, data, uploads and databases are never touched.
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Yes, [switch]$NoVerify)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root
foreach ($required in 'package.json', 'src\server.js', 'scripts\legacy-files.txt') {
  if (-not (Test-Path (Join-Path $Root $required))) { throw "Run this from a Super Pro checkout. Missing: $required" }
}
$Protected = '(^|/)(\.env[^/]*|node_modules|\.git|data|uploads)(/|$)|\.(sqlite|sqlite3|db)(-wal|-shm)?$'
$rel = { param($full) $full.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/') }

$found = New-Object System.Collections.Generic.HashSet[string]
foreach ($raw in Get-Content (Join-Path $Root 'scripts\legacy-files.txt')) {
  $line = ($raw -replace '#.*$', '').Trim()
  if (-not $line) { continue }
  if ($line.StartsWith('/') -or $line.Contains('..')) { throw "Refusing unsafe entry in legacy-files.txt: $line" }
  if ($line.StartsWith('glob:')) {
    Get-ChildItem -Path $Root -Recurse -File -Force -Filter $line.Substring(5) -ErrorAction SilentlyContinue |
      ForEach-Object { [void]$found.Add((& $rel $_.FullName)) }
  } elseif ($line.EndsWith('/')) {
    $dir = Join-Path $Root $line.TrimEnd('/')
    if (Test-Path $dir -PathType Container) { Get-ChildItem -Path $dir -Recurse -File -Force | ForEach-Object { [void]$found.Add((& $rel $_.FullName)) } }
  } else {
    $file = Join-Path $Root $line
    if (Test-Path $file -PathType Leaf) { [void]$found.Add($line) }
  }
}
$files = @($found | Where-Object { $_ -notmatch $Protected } | Sort-Object)
if ($files.Count -eq 0) { Write-Host 'Nothing to purge. The repository is already clean.'; return }

Write-Host "Legacy files ($($files.Count)):"
foreach ($f in $files) { '{0,10}  {1}' -f (Get-Item (Join-Path $Root $f)).Length, $f | Write-Host }
if (-not $Apply) { Write-Host "`nDry run only. Nothing was changed. Re-run with -Apply to archive and delete these files."; return }

if (-not $Yes) {
  $answer = Read-Host "`nType PURGE to archive and delete these $($files.Count) files"
  if ($answer -ne 'PURGE') { Write-Host 'Cancelled.'; exit 1 }
}

$archive = Join-Path (Split-Path $Root -Parent) ("{0}-legacy-archive-{1}.zip" -f (Split-Path $Root -Leaf), (Get-Date -Format 'yyyyMMdd-HHmmss'))
$zip = [System.IO.Compression.ZipFile]::Open($archive, 'Create')
try { foreach ($f in $files) { [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $Root $f), $f) } } finally { $zip.Dispose() }
$check = [System.IO.Compression.ZipFile]::OpenRead($archive)
try { $entries = $check.Entries.Count } finally { $check.Dispose() }
if ($entries -ne $files.Count) { Remove-Item $archive -Force; throw 'Archive verification failed. Nothing was deleted.' }
Write-Host "Archived to: $archive"

foreach ($f in $files) {
  Remove-Item -LiteralPath (Join-Path $Root $f) -Force
  $dir = Split-Path (Join-Path $Root $f) -Parent
  while ($dir -ne $Root -and (Test-Path $dir) -and -not (Get-ChildItem $dir -Force | Select-Object -First 1)) { Remove-Item $dir -Force; $dir = Split-Path $dir -Parent }
}
Write-Host "Deleted $($files.Count) files."

if ($NoVerify) { Write-Host "Purge complete (verification skipped). Archive kept at: $archive"; return }
Write-Host 'Verifying the cleaned repository...'
& node scripts/verify-all.mjs --fast
$ok = ($LASTEXITCODE -eq 0)
if ($ok) { & node scripts/validate-release.mjs; $ok = ($LASTEXITCODE -eq 0) }
if ($ok) {
  if ((Test-Path (Join-Path $Root '.git')) -and (Get-Command git -ErrorAction SilentlyContinue)) { & node scripts/update-manifest.mjs }
  Write-Host "Purge complete and verified. Archive kept at: $archive"
} else {
  Write-Warning 'Verification FAILED. Restoring every purged file from the archive.'
  $restore = [System.IO.Compression.ZipFile]::OpenRead($archive)
  try {
    foreach ($entry in $restore.Entries) {
      $target = Join-Path $Root $entry.FullName
      New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  } finally { $restore.Dispose() }
  Write-Warning 'Restored. Nothing was lost. Please send the output above for review.'
  exit 1
}
