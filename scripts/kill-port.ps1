param([int]$Port = 3000)
$procs = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($procs) {
  foreach ($p in $procs) {
    try { Stop-Process -Id $p -Force -ErrorAction Stop; Write-Host "Killed PID $p" } catch { Write-Host "Failed to kill $p : $_" }
  }
} else {
  Write-Host "No listener on port $Port"
}
