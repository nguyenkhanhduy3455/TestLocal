using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.ParitySaveData;

namespace OchaCom.FlaUiTests.Tests.RxDuplicate;

/// <summary>
/// <b>PROBE GHI DB — 診療入力 登録 → <c>UpdateRx</c> (frm203002.cs:4920, gọi từ modSave.cs:482).</b>
///
/// Đường lưu cục bộ của đơn thuốc: <c>ProcessRxInfData</c> → <c>RxInf.updateManyRxInfDataNotRegistered</c>
/// (RxInf.cs:821) UPDATE RX_INF theo khóa (pat_no, rx_type, trt_dt, seq_no) KHÔNG có DeleteDate, rồi
/// insert/update RX_USAGE + RX_DETAIL.
///
/// Câu hỏi: đơn NHÁP (PrescriptionId rỗng) cùng khóa với đơn đã HUỶ — bấm 登録 có
///   (a) ghi đè dòng RX_INF đã huỷ (PrescriptionId/AccessCode của nó mất)?
///   (b) sinh thêm dòng RX_USAGE / RX_DETAIL sống (dòng thuốc trùng)?
/// Đáp án nằm ở DB, so ảnh chụp SQL trước/sau lượt chạy (script ngoài).
///
/// Chỉ chạy trên DB test; dữ liệu seed ở 2026-10-07 của bệnh nhân 4031. Ghi cả TRNTRN (登録).
/// </summary>
[TestFixture]
[Explicit("PROBE GHI DB — chỉ chạy đích danh trên DB test")]
[Category("rx-duplicate")]
public sealed class RxSaveProbeTests : UiTestBase
{
    protected override string[] NuisanceDialogPatterns => [];

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static string ArtifactDir()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts", "rx-save");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private string DialogsNow() =>
        string.Join(" / ", Dialogs.Open(App.Automation, App.ProcessId).Select(d => $"「{Txt.N(Dialogs.TextOf(d))}」"));

    [Test, Order(1)]
    public void Tc0a_F5_F9kakutei_Touroku()
    {
        using var watchdog = new System.Threading.Timer(_ =>
        {
            Log("=== KQ-1 === QUÁ 60s — chụp màn hình");
            try { ScreenCapture.CaptureToFile(ArtifactDir(), $"x_qua-60s_{DateTime.Now:HHmmss}"); } catch { /* ignore */ }
        }, null, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(60));

        Log($"=== KQ-1 === 診療入力 {Settings.Patient.PatNo} ngày {TrtDate:yyyy-MM-dd}: Shift+F5 → F9 確定 → 登録");
        try
        {
            Uia.ForceForeground(Screen.Window.Properties.NativeWindowHandle);
            FlaUI.Core.Input.Keyboard.TypeSimultaneously(FlaUI.Core.WindowsAPI.VirtualKeyShort.SHIFT, FlaUI.Core.WindowsAPI.VirtualKeyShort.F5);
            Waits.Step(); Waits.Step();
            var dlg = Waits.TryFor(() => App.Window("frm210002"), TimeSpan.FromSeconds(15));
            if (dlg is null) { Log("=== KQ-1 === frm210002 KHÔNG mở. Hộp thoại: " + DialogsNow()); return; }
            ScreenCapture.CaptureToFile(ArtifactDir(), "01_frm210002");

            // F9 確定 trong hộp thoại 処方 → về 診療入力 (chưa ghi RX_*; ViewModel210002 được nạp).
            Uia.ForceForeground(dlg.Properties.NativeWindowHandle);
            Uia.SendKey(Vk.F9); Waits.Step(); Waits.Step();
            Log("=== KQ-1 === sau F9 確定: frm210002 " + (App.Window("frm210002") is null ? "đã đóng" : "VẪN MỞ") + "; hộp thoại: " + DialogsNow());
            ScreenCapture.CaptureToFile(ArtifactDir(), "02_after-kakutei");

            // 登録 = phím End (frm203002.cs btnF9_Click → KeyFunc(Keys.End)). Hộp thoại đọc bằng Win32
            // (MsgBoxWin32) vì UIA hết giờ trên lưới 診療入力 lớn (「Operation timed out」, lượt 10:59).
            Uia.ForceForeground(Screen.Window.Properties.NativeWindowHandle);
            Uia.SendKey(Vk.End);
            for (var round = 1; round <= 4; round++)
            {
                var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(round == 1 ? 20 : 8));
                if (box is null) { Log($"=== KQ-1 === vòng {round}: không còn hộp thoại Win32"); break; }
                Log($"=== KQ-1 === vòng {round}: hộp thoại 「{Txt.N(box.Text)}」 nút={string.Join("/", MsgBoxWin32.ButtonCaptions(box.Hwnd))}");
                ScreenCapture.CaptureToFile(ArtifactDir(), $"03_dialog{round}");
                // 「保存しますか」→ はい; 「上書きしますか」→ はい; thông báo thường → OK
                var ok = MsgBoxWin32.ClickButton(box.Hwnd, "はい(&Y)", "はい", "&Yes", "Yes", "OK");
                Log($"=== KQ-1 === vòng {round}: bấm nút = {ok}");
                Waits.Step(); Waits.Step();
            }
            Log("=== KQ-1 === xong chuỗi hộp thoại; màn 診療入力 " + (App.Window("frm203002") is null ? "đã đóng" : "vẫn mở"));
            ScreenCapture.CaptureToFile(ArtifactDir(), "04_after-save");
        }
        catch (Exception e)
        {
            Log("=== KQ-1 === NGOẠI LỆ: " + e.Message + " | hộp thoại: " + DialogsNow());
            try { ScreenCapture.CaptureToFile(ArtifactDir(), "x_exception"); } catch { /* ignore */ }
        }
    }
}
