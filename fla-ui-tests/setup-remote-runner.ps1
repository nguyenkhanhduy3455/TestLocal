<#
.SYNOPSIS
    Đăng ký Scheduled Task 「FlaUI-Tests-Run」 — cửa để chạy bộ test FlaUI TỪ XA
    (SSH từ máy khác) mà vẫn chạy trong PHIÊN DESKTOP TƯƠNG TÁC.

.DESCRIPTION
    ⚠️ THIẾT LẬP QUAN TRỌNG NHẤT LÀ `-LogonType Interactive`.

    Phiên SSH trên Windows nằm ở SESSION 0, còn desktop thật ở session của người
    đang đăng nhập. UIAutomation chạy ở session 0 thì:
      · phím/chuột do test gửi rơi vào một desktop vô hình;
      · ScreenCapture chụp ra ảnh ĐEN;
      · attachIfRunning không thấy MENU.exe đang mở ở console session.
    Tệ nhất là test VẪN CHẠY và VẪN BÁO XANH, nên rất dễ tưởng ổn.

    Chọn nhầm 「Run whether or not user is logged on」 (tức ServiceAccount /
    S4U) là rơi đúng vào bẫy đó. Interactive thì task chạy trong session của
    người đang đăng nhập — đúng chỗ cần.

    Máy chạy cũng phải: đang ĐĂNG NHẬP, KHÔNG khoá màn hình, tắt sleep và tắt
    timeout tắt màn hình.

.PARAMETER UserId
    Tài khoản Windows đang đăng nhập trên máy. Mặc định là người đang chạy script.
    Lấy đúng phần SAU dấu `\` của `whoami`.

.PARAMETER TaskName
    Tên task. Đổi thì phải đổi theo ở mọi chỗ gọi `schtasks /run /tn ...`.

.EXAMPLE
    .\setup-remote-runner.ps1
    .\setup-remote-runner.ps1 -UserId 'HOANGSONPC'

.NOTES
    Chạy test sau khi đăng ký (từ máy khác qua SSH):
        Set-Content fla-ui-tests\logs\command.txt "run-edit-treatment-rows.ps1 -Diagnostics"
        schtasks /run /tn "FlaUI-Tests-Run"
    `schtasks` KHÔNG truyền được tham số, nên lệnh đi qua file command.txt —
    xem runner-task.ps1 cùng thư mục.
#>
[CmdletBinding()]
param(
    [string] $UserId = $env:USERNAME,
    [string] $TaskName = 'FlaUI-Tests-Run'
)

$ErrorActionPreference = 'Stop'

$here    = $PSScriptRoot
$wrapper = Join-Path $here 'runner-task.ps1'
if (-not (Test-Path $wrapper)) {
    throw "Khong thay $wrapper — script nay phai nam cung thu muc voi runner-task.ps1."
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Task '$TaskName' da ton tai — dang dang ky lai." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
    -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
    -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$wrapper`"" `
    -WorkingDirectory $here

# Interactive = chay trong session cua nguoi DANG DANG NHAP. Xem .DESCRIPTION.
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Highest

# Khong co trigger: chi chay on-demand qua `schtasks /run`.
# ExecutionTimeLimit 0 = khong gioi han; tran thoi gian that nam trong runner-task.ps1
# (-TimeoutMinutes), noi con biet kill dung tien trinh con va con ghi duoc log.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Settings $settings | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host ""
Write-Host "Da dang ky '$TaskName'" -ForegroundColor Green
Write-Host ("  UserId    = {0}" -f $t.Principal.UserId)
Write-Host ("  LogonType = {0}   <- PHAI la Interactive" -f $t.Principal.LogonType)
Write-Host ("  Exec      = {0}" -f $wrapper)
Write-Host ""
Write-Host "Kiem chung (bat buoc): chay thu roi doi chieu SessionId voi console." -ForegroundColor Yellow
Write-Host '  Set-Content fla-ui-tests\logs\command.txt "run-edit-treatment-rows.ps1 -Diagnostics"'
Write-Host "  schtasks /run /tn `"$TaskName`""
Write-Host "  qwinsta            # SessionId trong log phai TRUNG voi dong 'console'"
