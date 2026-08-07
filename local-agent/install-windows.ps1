$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js não encontrado. Instale Node.js LTS antes de continuar.' -ForegroundColor Red
  exit 1
}

npm install
npx playwright install chromium

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Arquivo .env criado. Preencha token, empresa e endpoint antes de iniciar.' -ForegroundColor Yellow
}

$taskName = 'HospedaMais Local Agent'
$node = (Get-Command node).Source
$script = Join-Path $PSScriptRoot 'src\index.mjs'
$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + $script + '"') -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'HospedaMais: monitora Booking usando sessão local autenticada.' -Force | Out-Null

Write-Host 'Agente instalado. Após preencher o .env, execute: npm start' -ForegroundColor Green
