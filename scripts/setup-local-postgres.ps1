param(
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin',
  [int]$Port = 55432
)

$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$localPath = Join-Path $workspacePath '.local'
$clusterPath = Join-Path $localPath 'postgres'
$serverEnvPath = Join-Path $workspacePath 'server\.env'
$testEnvPath = Join-Path $workspacePath 'server\.env.test'
$passwordPath = Join-Path $localPath 'initdb-password'

if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Use an unprivileged valid TCP port.' }
foreach ($executable in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin $executable))) {
    throw "PostgreSQL executable not found: $executable. Set -PostgresBin to your installation's bin directory."
  }
}
if ((Test-Path -LiteralPath $clusterPath) -or (Test-Path -LiteralPath $serverEnvPath) -or (Test-Path -LiteralPath $testEnvPath)) {
  throw 'Local cluster or environment files already exist. Use the documented start command; this script does not overwrite them.'
}

New-Item -ItemType Directory -Path $localPath -Force | Out-Null
$randomBytes = New-Object byte[] 48
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($randomBytes)
$databasePassword = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
$generator.GetBytes($randomBytes)
$jwtSecret = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
$generator.Dispose()
Set-Content -LiteralPath $passwordPath -Value $databasePassword -Encoding ASCII
try {
  & (Join-Path $PostgresBin 'initdb.exe') -D $clusterPath -U slotguard --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=$passwordPath
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
} finally {
  Remove-Item -LiteralPath $passwordPath -ErrorAction SilentlyContinue
}

& (Join-Path $PostgresBin 'pg_ctl.exe') -D $clusterPath -l (Join-Path $localPath 'postgres.log') -o "-p $Port -h 127.0.0.1" -w start
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL start failed. Check .local/postgres.log.' }
$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $databasePassword
  foreach ($databaseName in @('slotguard', 'slotguard_test')) {
    & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $Port -U slotguard $databaseName
    if ($LASTEXITCODE -ne 0) { throw "Could not create $databaseName." }
  }
} finally {
  $env:PGPASSWORD = $previousPgPassword
}

Set-Content -LiteralPath $serverEnvPath -Encoding ASCII -Value @(
  'NODE_ENV=development', 'PORT=3000',
  "DATABASE_URL=postgresql://slotguard:${databasePassword}@127.0.0.1:${Port}/slotguard",
  "JWT_SECRET=$jwtSecret", 'CORS_ORIGIN=http://localhost:5173', 'TRUST_PROXY_HOPS=0', 'DB_POOL_MAX=10'
)
Set-Content -LiteralPath $testEnvPath -Encoding ASCII -Value "TEST_DATABASE_URL=postgresql://slotguard:${databasePassword}@127.0.0.1:${Port}/slotguard_test"
Write-Output "Local PostgreSQL is listening on 127.0.0.1:$Port. Environment files were generated and are ignored by Git."
