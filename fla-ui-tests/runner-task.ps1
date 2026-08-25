# runner-task.ps1
# Scheduled-Task entrypoint. Invoked by 'schtasks /run'.
# Arg $args[0] = filename of a run-*.ps1 in the same directory.
# Logs user / SessionId / desktop screenshot to logs/runner.log with line-buffered writes.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string] $ScriptName,

    # Tran thoi gian cho MOT lan chay. Het gio thi kill chu khong treo.
    [int] $TimeoutMinutes = 6
)

$ErrorActionPreference = 'Continue'

# App va bo test in ra tieng Nhat (UTF-8). PowerShell 5.1 giai ma stdout cua tien
# trinh con theo CONSOLE CODEPAGE (932/1252), khong phai UTF-8 => moi dong log
# tieng Nhat thanh rac va KHONG khoi phuc duoc. Ep ca hai chieu ve UTF-8.
# Da vap that 2026-08-25: "診療入力" ra thanh "診療�E劁E".
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    chcp 65001 | Out-Null
} catch { }
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$logs   = Join-Path $here 'logs'
if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }
$logFile = Join-Path $logs 'runner.log'

# --- Lenh chay den tu file, thay vi hard-code trong Scheduled Task ---------
# `schtasks /run` KHONG truyen duoc tham so, nen mot task chi chay duoc dung
# mot runner. Thay vao do: ghi mot dong vao logs\command.txt (vd
# "run-edit-treatment-rows.ps1 -Diagnostics") roi trigger task -> mot task
# chay duoc MOI runner voi MOI co. Khong co file thi dung tham so truyen vao.
$extraArgs = @()
$cmdFile = Join-Path $logs 'command.txt'
if (Test-Path $cmdFile) {
    $line = (Get-Content $cmdFile -TotalCount 1)
    if ($null -ne $line) { $line = $line.Trim() }
    if ($line) {
        $parts = $line -split '\s+'
        $ScriptName = $parts[0]
        if ($parts.Count -gt 1) { $extraArgs = $parts[1..($parts.Count - 1)] }
    }
}

# Force line-buffered output: write directly, flush after every line.
function Write-LogLine {
    param([string]$Line)
    $stamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffzzz')
    $msg = "[$stamp] $Line"
    $msg | Out-File -FilePath $logFile -Append -Encoding utf8
    [Console]::Out.WriteLine($msg)
    [Console]::Out.Flush()
}


# --- Don app WinForm con sot lai -------------------------------------------
# PHAI kill CA TRUOC LAN SAU moi lan chay, vi hai ly do KHAC NHAU:
#
#  TRUOC: testsettings co app.attachIfRunning = true, nen neu con MENU.exe cu
#         thi lan chay sau BAM VAO app dang o trang thai lech (dang mo dialog,
#         dang o man khac) thay vi mo moi => do oan, rat kho doan ra.
#
#  SAU:   MENU.exe do test mo ra KE THUA handle stdout cua wrapper. App con song
#         thi pipeline `Invoke-Expression | Out-String -Stream | ForEach-Object`
#         KHONG BAO GIO dong, task treo o trang thai Running vinh vien du test da
#         Passed tu lau. Da vap that 2026-08-25: log dung o "Results File", task
#         Running mai, kill MENU xong la END hien ra ngay.
#
# Kill SAU khi test xong nen khong mat artifact: anh chup + cay UIA da ghi ra dia
# tu truoc do roi.
function Stop-OchaApp {
    param([string]$When)
    $procs = @(Get-Process MENU -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
        Write-LogLine ("cleanup({0})  = khong co MENU.exe nao dang chay" -f $When)
        return
    }
    foreach ($p in $procs) {
        try {
            Stop-Process -Id $p.Id -Force -ErrorAction Stop
            Write-LogLine ("cleanup({0})  = da kill MENU.exe pid={1}" -f $When, $p.Id)
        } catch {
            Write-LogLine ("cleanup({0})  = KHONG kill duoc pid={1}: {2}" -f $When, $p.Id, $_.Exception.Message)
        }
    }
    Start-Sleep -Seconds 2
}

try {
    Write-LogLine "=== runner-task START script=$ScriptName ==="
    Write-LogLine ("user            = {0}" -f $env:USERNAME)
    Write-LogLine ("userdomain      = {0}" -f $env:USERDOMAIN)
    Write-LogLine ("sessionname     = {0}" -f $env:SESSIONNAME)
    $proc = Get-Process -Id $PID
    Write-LogLine ("pid             = {0}  parentPid={1}" -f $proc.Id, $proc.Parent.Id)
    # Session ID of THIS process
    $procInfo = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID")
    Write-LogLine ("SessionId(proc) = {0}" -f $procInfo.SessionId)
    # Console session (usually 1)
    try {
        $console = (qwinsta | Select-String 'console').ToString() -replace '\s+', ' '
        Write-LogLine ("qwinsta console = {0}" -f $console)
    } catch {
        Write-LogLine ("qwinsta         = (error: {0})" -f $_.Exception.Message)
    }

    # Screenshot proof the task is on the real interactive desktop
    try {
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        Write-LogLine ("screen bounds   = {0}x{1}" -f $bounds.Width, $bounds.Height)
        $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $shotPath = Join-Path $logs ('shot-' + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.png')
        $bmp.Save($shotPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
        $size = (Get-Item $shotPath).Length
        Write-LogLine ("screenshot      = {0}  ({1} bytes)" -f $shotPath, $size)
    } catch {
        Write-LogLine ("screenshot      = FAILED: {0}" -f $_.Exception.Message)
    }

    if (-not $ScriptName) {
        Write-LogLine "ERROR: chua biet chay script nao. Ghi mot dong vao $cmdFile."
        exit 3
    }
    Write-LogLine ("args            = {0}" -f ($extraArgs -join ' '))

    $target = Join-Path $here $ScriptName
    if (-not (Test-Path $target)) {
        Write-LogLine "ERROR: target script not found: $target"
        exit 2
    }

    Write-LogLine ("exec            = {0}" -f $target)

    # Re-launch the target in-process so its stdout/stderr land in our log via 2>&1.
    #
    # Dung Invoke-Expression chu KHONG splat mang (`& $target @extraArgs`): splat MANG
    # chi truyen duoc tham so VI TRI, chuoi "-Diagnostics" se bi nhet vao tham so vi tri
    # dau tien thay vi duoc hieu la switch. Da vap that: filter ra
    # "FullyQualifiedName~-Diagnostics" => khop 0 test ma van bao rc = 0.
    # command.txt do chinh minh ghi (local, khong phai dau vao tu ngoai) nen an toan.
    Stop-OchaApp -When 'truoc'

    # ── Chay runner trong TIEN TRINH CON, KHONG qua pipeline ─────────────────
    #
    # Ban dau dung `Invoke-Expression | ForEach-Object` de log truc tiep. Sai:
    # pipeline doc stdout cua tien trinh con phai doi EOF, ma EOF chi den khi MOI
    # process giu handle do dong lai — KE CA MENU.exe do test mo ra. App con song
    # la task treo o Running VINH VIEN du test da Passed tu lau.
    #
    # Va khong the "kill app sau khi chay xong" de chua: buoc kill nam SAU pipeline,
    # ma pipeline thi dang doi chinh cai app do => deadlock. Da vap that 2026-08-25,
    # hai lan lien tiep.
    #
    # Start-Process + WaitForExit doi DUNG tien trinh con truc tiep, khong quan tam
    # chau chat con song hay khong => cau truc nay khong the treo vi app nua.
    $outFile = Join-Path $logs 'run-stdout.log'
    $errFile = Join-Path $logs 'run-stderr.log'
    foreach ($f in @($outFile, $errFile)) { if (Test-Path $f) { Remove-Item $f -Force } }

    $psArgs = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $target) + $extraArgs
    Write-LogLine ("invocation      = powershell {0}" -f ($psArgs -join ' '))
    Write-LogLine ("stdout truc tiep= {0}" -f $outFile)

    $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $psArgs `
                          -WorkingDirectory $here -NoNewWindow -PassThru `
                          -RedirectStandardOutput $outFile -RedirectStandardError $errFile

    # Timeout CUNG: het gio thi kill, KHONG bao gio de task treo vo han.
    $timeoutMs = $TimeoutMinutes * 60 * 1000
    if (-not $proc.WaitForExit($timeoutMs)) {
        Write-LogLine ("TIMEOUT         = qua {0} phut, dang kill tien trinh test" -f $TimeoutMinutes)
        try { $proc.Kill($true) } catch { try { $proc.Kill() } catch { } }
        $rc = 124
    } else {
        $rc = $proc.ExitCode
    }

    Stop-OchaApp -When 'sau  '

    # Do stdout cua runner vao log chung de xem lai ca hai o mot cho.
    foreach ($f in @($outFile, $errFile)) {
        if (-not (Test-Path $f)) { continue }
        $tag = if ($f -eq $errFile) { 'ERR> ' } else { 'OUT> ' }
        Get-Content $f -Encoding utf8 -ErrorAction SilentlyContinue | ForEach-Object {
            Write-LogLine ($tag + $_)
        }
    }
    Write-LogLine ("exec rc         = {0}" -f $rc)
    Write-LogLine "=== runner-task END ==="
    exit $rc
}
catch {
    Write-LogLine ("FATAL: " + $_.Exception.Message)
    Write-LogLine $_.ScriptStackTrace
    exit 99
}

