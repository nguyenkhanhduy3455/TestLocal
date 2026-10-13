using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.RxDuplicate;

/// <summary>
/// <b>PROBE — 診療入力 F5 「処方」 → frm210002. KHÔNG assert, không bao giờ ném, KHÔNG ghi DB.</b>
///
/// Luồng "tạo đơn" thật của WinForm: <c>frm203002</c> F5 (frm203002.cs:4205) gọi
/// <c>CommonFunction.getAndPassRxInfUsageDetailData</c> → <c>RxInf.getRxInf</c> → join
/// <c>RxUsage.getListRxUsage</c> (thiếu DeleteDate ở RX_DETAIL) rồi mở hộp thoại 処方.
///
/// Câu hỏi: bệnh nhân 4031 ngày 2025-10-08 (đơn đã huỷ + đơn sống cùng khóa) — hộp thoại 処方 mở
/// từ 診療入力 có hiện dòng thuốc nhân đôi không? (Màn 処方箋 一覧 → chi tiết đã đo: 1 dòng.)
///
/// Chạy: <c>run-rx-from-treatment.ps1</c> (đặt OCHA_PAT_NO / OCHA_TRT_DT rồi chạy fixture này).
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("rx-duplicate")]
public sealed class RxFromTreatmentProbeTests : UiTestBase
{
    protected override string[] NuisanceDialogPatterns => [];

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static string ArtifactDir()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts", "rx-from-treatment");
        Directory.CreateDirectory(dir);
        return dir;
    }

    [Test, Order(1)]
    public void Tc0a_MoDonTuF5()
    {
        Log($"=== KQ-1 === 診療入力 bệnh nhân {Settings.Patient.PatNo} ngày {TrtDate:yyyy-MM-dd}");
        // Đồng hồ canh: mỗi 60s chụp màn hình nếu test còn chạy (FLA-UI-GUIDELINE F2) — lượt 10:38 đứng
        // im ở bước đọc lưới 療法・処置 mà không có ảnh nào để xem.
        using var watchdog = new System.Threading.Timer(_ =>
        {
            Log("=== KQ-1 === QUÁ 60s — chụp màn hình");
            try { ScreenCapture.CaptureToFile(ArtifactDir(), $"x_qua-60s_{DateTime.Now:HHmmss}"); } catch { /* ignore */ }
        }, null, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(60));
        try
        {
            ScreenCapture.CaptureToFile(ArtifactDir(), $"01_treatment-entry_{TrtDate:MMdd}");

            Uia.ForceForeground(Screen.Window.Properties.NativeWindowHandle);
            // 処方 = Shift+F5 (frm203002.cs:131/_ShiftFunction F5; F5 thường là パック). Chỉ mở được trong THÁNG HIỆN TẠI
            // (「当月以外の操作はできません」), nên dữ liệu seed nằm ở 2026-10. Con trỏ giữ nguyên như lúc mở.
            FlaUI.Core.Input.Keyboard.TypeSimultaneously(FlaUI.Core.WindowsAPI.VirtualKeyShort.SHIFT, FlaUI.Core.WindowsAPI.VirtualKeyShort.F5);
            Waits.Step(); Waits.Step();

            var dlg = Waits.TryFor(() => App.Window("frm210002"), TimeSpan.FromSeconds(15));
            if (dlg is null)
            {
                var dialogs = Dialogs.Open(App.Automation, App.ProcessId).Select(d => Txt.N(Dialogs.TextOf(d))).ToList();
                Log("=== KQ-1 === F5 xong mà frm210002 KHÔNG mở. Hộp thoại: " + string.Join(" / ", dialogs.Select(t => $"「{t}」")));
                ScreenCapture.CaptureToFile(ArtifactDir(), $"02_after-f5-no-dialog_{TrtDate:MMdd}");
                return;
            }
            Waits.Step(); Waits.Step();
            ScreenCapture.CaptureToFile(ArtifactDir(), $"02_frm210002_{TrtDate:MMdd}");
            File.WriteAllText(Path.Combine(ArtifactDir(), "frm210002.uia.txt"), Uia.DumpTree(dlg, 12, 80));
            var rows = new WinFormsGrid(Uia.ById(dlg, "dgvView")!).Rows(40).Where(r => !r.IsEmpty && r.At(0) != "剤形").ToList();
            Log($"=== KQ-1 === [{TrtDate:yyyy-MM-dd}] frm210002 (từ Shift+F5) hiện {rows.Count} dòng thuốc trên lưới 薬剤");
            foreach (var r in rows) Log($"=== KQ-1 ===     {r}");
        }
        catch (Exception e) { Log("=== KQ-1 === NGOẠI LỆ: " + e.Message); }
    }

}
