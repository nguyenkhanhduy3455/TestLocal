using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

namespace OchaCom.FlaUiTests.Tests.SyohoPaper;

/// <summary>
/// <b>PROBE — 診療入力 Shift+F5 「処方箋」 → frm503002 (paper). KHÔNG assert, KHÔNG in.</b>
///
/// Đo cái WinForm THẬT hiện ra khi mở 処方箋 từ 診療入力 với hai dòng thuốc (600/601) của đúng
/// ngày đó, để đối chiếu với web (<c>prescription-paper.spec.ts</c>):
/// <list type="bullet">
///   <item>màn nào mở (<c>frm503002</c> = giấy, <c>frm210002</c> = điện tử khi <c>RXScreenUse</c> bật);</item>
///   <item>các dòng ở lưới 選択済み薬剤 (tên + 用法) — thứ tự <c>DISP_NO</c>;</item>
///   <item>các ô tiêu đề (ngày cấp, bác sĩ, bảo hiểm…) và nhãn F-key (qua cây UIA);</item>
///   <item>ảnh chụp màn hình.</item>
/// </list>
///
/// <para>⛔ KHÔNG bấm F5 (in): WinForm in qua Crystal/máy in Windows, hộp thoại ngoài app treo suite.
/// Tờ in được đối chiếu ở tầng dữ liệu (datasource) bên web, không ở đây.</para>
///
/// <para>Seed: hai dòng thuốc vào dải <c>disp_no</c> 9100..9199 của bệnh nhân cấu hình, tháng
/// hiện tại (WinForm chặn thao tác ngoài tháng hiện tại), sau khi đã chụp nguyên trạng; dọn ở
/// <c>OneTimeTearDown</c>. Cần <c>cmtPack.allowSeed = true</c>.</para>
///
/// Chạy: <c>run-syoho-paper.ps1</c>.
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("syoho-paper")]
public sealed class SyohoPaperProbeTests : CmtPackUiTestBase
{
    /// <summary>Hai thuốc có thật ở master (600/601, TRT_SB 0) — tên khớp master web.</summary>
    protected override IReadOnlyList<SeedRow> SeedRows =>
    [
        new(Settings.Patient.ResolvedTrtDate.Day, 600, 0, 0, "ﾎﾞﾙﾀﾚﾝ錠25mg２T"),
        new(Settings.Patient.ResolvedTrtDate.Day, 601, 0, 0, "ﾎﾞﾙﾀﾚﾝ錠25ｍｇ１T"),
    ];

    private static string ArtifactDir()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts", "syoho-paper");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void Kq(string line)
    {
        TestContext.Out.WriteLine("=== KQ-1 === " + line);
        try { TestContext.Progress.WriteLine("=== KQ-1 === " + line); } catch { /* không có console */ }
    }

    [Test, Order(1)]
    public void Tc0a_MoSyohosenTuShiftF5()
    {
        try
        {
            Kq($"診療入力 bệnh nhân {Settings.Patient.PatNo} ngày {TrtDate:yyyy-MM-dd}");
            ScreenCapture.CaptureToFile(ArtifactDir(), $"01_treatment-entry_{TrtDate:MMdd}");

            Uia.ForceForeground(Screen.Window.Properties.NativeWindowHandle);
            // Shift+F5 = 処方箋 (frm203002.cs:131; chữ 「処方」 khi RXScreenUse bật).
            Keyboard.TypeSimultaneously(VirtualKeyShort.SHIFT, VirtualKeyShort.F5);
            Waits.Step(); Waits.Step();

            // Poll BOTH ids in one loop: a sequential wait on frm503002 burns its whole timeout when the
            // machine runs RXScreenUse = true (frm210002 opens instead and was missed on the first run).
            // A form opened with showDialog is a CHILD of 診療入力 in the UIA tree, not a top-level window.
            AutomationElement? Find(string id) => App.Window(id) ?? Uia.ById(Screen.Window, id);
            var dlg = Waits.TryFor(() => Find("frm503002") ?? Find("frm210002"), TimeSpan.FromSeconds(30));
            var paper = dlg is not null && Uia.AutomationIdOf(dlg) == "frm503002" ? dlg : null;
            if (dlg is null)
            {
                var dialogs = Dialogs.Open(App.Automation, App.ProcessId).Select(d => Txt.N(Dialogs.TextOf(d))).ToList();
                Kq("Shift+F5 xong mà KHÔNG có frm503002/frm210002. Hộp thoại: " +
                   string.Join(" / ", dialogs.Select(t => $"「{t}」")));
                ScreenCapture.CaptureToFile(ArtifactDir(), $"02_no-window_{TrtDate:MMdd}");
                File.WriteAllText(Path.Combine(ArtifactDir(), "no-window.uia.txt"),
                    string.Join("\n", App.Windows().Select(w => $"{Uia.AutomationIdOf(w)} | {Uia.NameOf(w)} | offscreen={!Uia.IsOnScreen(w)}")) +
                    "\n----\n" + string.Join("\n----\n", App.Windows().Select(w => Uia.DumpTree(w, 8, 200))) +
                    "\n==== desktop children of this process ====\n" +
                    string.Join("\n", App.Automation.GetDesktop().FindAllChildren()
                        .Where(c => c.Properties.ProcessId.ValueOrDefault == App.ProcessId)
                        .Select(c => $"{Uia.AutomationIdOf(c)} | {Uia.NameOf(c)} | {c.ControlType}")));
                return;
            }

            Waits.Step(); Waits.Step();
            Kq(paper is not null ? "mở frm503002 (処方箋 giấy)" : "mở frm210002 (処方 điện tử — RXScreenUse BẬT, không phải màn giấy)");
            ScreenCapture.CaptureToFile(ArtifactDir(), $"02_{(paper is not null ? "frm503002" : "frm210002")}_{TrtDate:MMdd}");
            File.WriteAllText(Path.Combine(ArtifactDir(), "syoho.uia.txt"), Uia.DumpTree(dlg, 12, 120));

            foreach (var id in new[] { "dgvView", "dgvView2" })
            {
                var grid = Uia.ById(dlg, id);
                if (grid is null) { Kq($"{id}: không thấy trong cây UIA"); continue; }
                var rows = new WinFormsGrid(grid).Rows(60).Where(r => !r.IsEmpty).ToList();
                Kq($"{id}: {rows.Count} dòng");
                foreach (var r in rows.Take(12)) Kq($"    {r}");
            }
        }
        catch (Exception e) { Kq("NGOẠI LỆ: " + e.Message); }
    }
}
