# Sobe o servidor do Preview, destacado, na porta 3000.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File output/qa/subir-preview.ps1
#
# Duas coisas que custaram uma tentativa cada e ficam registradas aqui:
#   1. `Start-Process` não resolve atalho de shell (`npm`), então o executável vai
#      com o nome completo (`node.exe`);
#   2. sem `PORT` no ambiente o servidor sobe em `PORT=0` — porta efêmera — e o
#      Preview fica sem endereço. `$env:PORT` no processo pai é herdado pelo filho.
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$log = Join-Path $raiz '.freebuff\preview-502ccf63-855a-4b82-95a6-d2ff73542eef.log'
$err = "$log.err"

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*src/server/start.mjs*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$env:PORT = '3000'
$p = Start-Process -FilePath 'node.exe' -ArgumentList 'src/server/start.mjs' `
  -WorkingDirectory $raiz -RedirectStandardOutput $log -RedirectStandardError $err `
  -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 4
$vivo = $null -ne (Get-Process -Id $p.Id -ErrorAction SilentlyContinue)
Write-Output ("pid: {0} | vivo depois de 4s: {1}" -f $p.Id, $vivo)
