using System.Text;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using Microsoft.Data.SqlClient;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.FunctionSettings;

/// <summary>
/// <b>PROBE — 機能設定 (frm506008), tab 患者登録 + 予約.</b> Đối chiếu bản web
/// (<c>/settings/function</c>) với WinForm THẬT trên hai điều đọc source không chốt được:
///
/// <list type="number">
///   <item><b>KQ-1 (CHỈ ĐỌC)</b> — những gì màn hiện ra: giá trị đã chọn của 6 combo + radio 新患採番方法 +
///     checkbox/radio/combo của 予約, danh sách mục của từng combo (có dòng trống đầu combo リコール月
///     không), so với hai dòng DB <c>PATCONFIG</c> / <c>YOYAKUCONFIG</c>.</item>
///   <item><b>KQ-2 (GHI, sau cờ riêng)</b> — <c>setYoyakuConfigData</c> hard-code <c>time = 2</c>
///     (frm506008.cs). Đặt <c>YOYAKUCONFIG.TIME = 1</c>, mở màn, F9 登録 không đổi gì, đọc lại TIME. Cờ:
///     env <c>OCHA_FUNCTION_SETTINGS_ALLOW_WRITE=1</c>. Chụp — IN RA — trả lại (F20): hai dòng config và
///     <c>Ocha.xml</c> (F9 gọi <c>XmlControl.setOchaXml()</c>) được khôi phục ở finally.</item>
/// </list>
///
/// Chạy: <c>run-function-settings.ps1</c>.
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("function-settings")]
public sealed class FunctionSettingsProbeTests : UiTestBase
{
    private const string MenuId = "frm506001";
    private const string FunctionId = "frm506008";
    private const string OchaXml = @"C:\NEW_SIM2000\Ocha.xml";
    private const string AllowWriteEnv = "OCHA_FUNCTION_SETTINGS_ALLOW_WRITE";

    protected override bool NavigatesToTreatmentEntry => false;
    /// <summary>
    /// 機能設定 opens a modal 「スキャナー名称の取得ができません」 from <c>initScNm</c> on a machine with no
    /// TWAIN source, and <c>init()</c> does not reach <c>getConfigDataToItem</c> until it is answered —
    /// reading the screen while it is up shows the untouched defaults, not the stored settings.
    /// This one dialog is the only one the watcher may answer.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => ["スキャナー名称の取得ができません"];

    private static void Kq(string line)
    {
        // The trx stdout garbles Japanese; the UTF-8 file next to the screenshots does not.
        try { File.AppendAllText(Path.Combine(ArtifactDir(), "kq.txt"), line + Environment.NewLine, Encoding.UTF8); } catch { /* ignore */ }
        TestContext.Out.WriteLine("=== KQ === " + line);
        try { TestContext.Progress.WriteLine("=== KQ === " + line); } catch { /* không có console */ }
    }

    private static string ArtifactDir()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts", "function-settings");
        Directory.CreateDirectory(dir);
        return dir;
    }

    // ── DB ────────────────────────────────────────────────────────────────────
    private SqlConnection OpenDb()
    {
        var con = new SqlConnection(Settings.Db.ConnectionString);
        con.Open();
        return con;
    }

    private string Row(string table)
    {
        using var con = OpenDb();
        using var cmd = new SqlCommand($"SELECT * FROM {table}", con);
        using var r = cmd.ExecuteReader();
        var sb = new StringBuilder();
        while (r.Read())
            sb.Append(string.Join(", ", Enumerable.Range(0, r.FieldCount).Select(i => $"{r.GetName(i)}={r.GetValue(i)}")));
        return sb.ToString();
    }

    private void Exec(string sql)
    {
        using var con = OpenDb();
        using var cmd = new SqlCommand(sql, con);
        cmd.ExecuteNonQuery();
    }

    // ── Điều hướng: MainMenu → その他業務 → 初期設定 → 機能設定 ───────────────────
    private static AutomationElement? FindForm(OchaApp app, string id)
    {
        foreach (var w in app.Windows())
        {
            if (Uia.AutomationIdOf(w) == id) return w;
            var child = Uia.Children(w).FirstOrDefault(c => Uia.AutomationIdOf(c) == id && Uia.IsOnScreen(c));
            if (child is not null) return child;
        }
        return null;
    }

    private static void ClickPane(AutomationElement window, string automationId)
    {
        var pane = Waits.For(() => Uia.ById(window, automationId), $"pane 「{automationId}」");
        Uia.MouseClick(pane);
        Waits.Step();
    }

    private AutomationElement OpenFunctionSettings()
    {
        var timeout = TimeSpan.FromSeconds(Settings.App.LaunchTimeoutSeconds);
        if (App.Window(MenuId) is null)
        {
            var menu = Waits.TryFor(() => App.Window("MainMenu") ?? App.WindowByTitle("メインメニュー"), timeout)
                       ?? throw new TimeoutException("Không thấy メインメニュー.");
            ClickPane(menu, "pnlBtn4");
            ClickPane(menu, "pnlMenu1");
        }
        var init = App.RequireWindow(MenuId, timeout);
        // showDialog modal ⇒ chuột thật, Invoke sẽ không trả về (F18).
        Uia.MouseClick(Waits.For(() => Uia.ById(init, "btnFuncConfig"), "nút 「btnFuncConfig」"));
        Waits.Step();
        return Waits.TryFor(() => FindForm(App, FunctionId), TimeSpan.FromSeconds(20))
               ?? throw new TimeoutException("frm506008 không mở.");
    }

    // ── Đọc màn ───────────────────────────────────────────────────────────────
    /// <summary>
    /// Answers 「スキャナー名称の取得ができません」 (frm506008.initScNm) — this machine has no TWAIN source and the
    /// custom MsgDialog is not a Win32 #32770 box, so the watcher misses it. Logs what it saw.
    /// </summary>
    private void DismissTwainDialog()
    {
        // Two in a row: setting chkScannerSetting.Checked fires initScNm through CheckedChanged, then getItemData
        // calls initScNm itself. Keep answering until none shows for a few polls.
        var answered = 0;
        var quiet = 0;
        for (var i = 0; i < 60 && quiet < 6; i++)
        {
            var box = MsgBoxWin32.All(App.ProcessId).FirstOrDefault(d => Txt.Has(d.Text, "スキャナー名称"));
            if (box is null) { quiet++; Waits.Step(); continue; }
            quiet = 0;
            answered++;
            Kq($"TWAIN | hộp thoại #{answered}: " + Txt.N(box.Text));
            if (!MsgBoxWin32.ClickButton(box.Hwnd, "OK"))
                Kq("TWAIN | không bấm được nút OK; nút có: " + string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd)));
            Waits.Step();
        }
        if (answered == 0) Kq("TWAIN | không có hộp thoại 「スキャナー名称」 (máy có nguồn TWAIN)");
    }

    private static string ComboState(AutomationElement form, string id)
    {
        var el = Uia.ById(form, id);
        if (el is null) return $"{id}: (không thấy)";
        var selected = Uia.ValueOf(el);
        return $"{id}: chọn=「{Txt.N(selected)}」";
    }

    private static string ToggleState(AutomationElement form, string id)
    {
        var el = Uia.ById(form, id);
        if (el is null) return $"{id}: (không thấy)";
        try { return $"{id}: {(el.Patterns.Toggle.IsSupported ? el.Patterns.Toggle.Pattern.ToggleState.Value : el.AsRadioButton().IsChecked)}"; }
        catch { return $"{id}: " + (el.Patterns.SelectionItem.IsSupported ? el.Patterns.SelectionItem.Pattern.IsSelected.Value : "?"); }
    }

    private static void SelectTab(AutomationElement form, string tabName)
    {
        var item = Waits.For(() => Uia.Descendants(form).FirstOrDefault(d =>
            d.ControlType == FlaUI.Core.Definitions.ControlType.TabItem && Txt.N(Uia.NameOf(d)) == tabName), $"tab 「{tabName}」");
        try { item.Patterns.SelectionItem.Pattern.Select(); } catch { Uia.MouseClick(item); }
        Waits.Step(); Waits.Step();
    }

    private void ReadScreen(AutomationElement form)
    {
        SelectTab(form, "患者登録");
        foreach (var id in new[] { "cboFmType", "cboBdEraType", "cboDefAttDr", "cboDefAttSt", "cboRecM1", "cboRecM2" })
            Kq("患者登録 | " + ComboState(form, id));
        foreach (var id in new[] { "rdoPatNoMax", "rdoPatNo" }) Kq("患者登録 | " + ToggleState(form, id));
        Kq("患者登録 | txtPatNo=「" + (Uia.ById(form, "txtPatNo") is { } t ? Uia.ValueOf(t) : "?") + "」");

        SelectTab(form, "予約");
        Kq("予約 | " + ToggleState(form, "chkAppoFlg"));
        foreach (var id in Enumerable.Range(1, 6).Select(n => $"rdoChair{n}")) Kq("予約 | " + ToggleState(form, id));
        Kq("予約 | " + ComboState(form, "cboYoubi"));
        ScreenCapture.CaptureToFile(ArtifactDir(), "02_yoyaku-tab");
        File.WriteAllText(Path.Combine(ArtifactDir(), "yoyaku-tab.uia.txt"), Uia.DumpTree(form, 14, 400));
    }

    [Test, Order(1)]
    [CancelAfter(300_000)]
    public void Tc0_ReadScreen_And_TimeConstant()
    {
        Kq("DB trước | PATCONFIG: " + Row("PATCONFIG"));
        Kq("DB trước | YOYAKUCONFIG: " + Row("YOYAKUCONFIG"));

        var patSnap = Row("PATCONFIG");
        var allowWrite = Environment.GetEnvironmentVariable(AllowWriteEnv) == "1";
        string? ochaXmlBackup = allowWrite && File.Exists(OchaXml) ? Path.Combine(ArtifactDir(), "Ocha.xml.bak") : null;
        if (ochaXmlBackup is not null) File.Copy(OchaXml, ochaXmlBackup, overwrite: true);

        try
        {
            if (allowWrite)
            {
                Exec("UPDATE YOYAKUCONFIG SET TIME = 1");
                Kq("KQ-2 | đã đặt YOYAKUCONFIG.TIME = 1 trước khi mở màn");
            }

            var form = OpenFunctionSettings();
            DismissTwainDialog();
            // init() finishes loading the stored values only after the dialog is answered.
            Waits.Step(); Waits.Step(); Waits.Step(); Waits.Step();
            ScreenCapture.CaptureToFile(ArtifactDir(), "01_frm506008");
            File.WriteAllText(Path.Combine(ArtifactDir(), "frm506008.uia.txt"), Uia.DumpTree(form, 14, 400));
            ReadScreen(form);

            if (!allowWrite)
            {
                Kq($"KQ-2 | bỏ qua: đặt {AllowWriteEnv}=1 để đo hằng số TIME khi F9");
                return;
            }

            Uia.ForceForeground(form.Properties.NativeWindowHandle.ValueOrDefault);
            Keyboard.Type(VirtualKeyShort.F9);
            Waits.Step(); Waits.Step();
            var dialogs = Dialogs.Open(App.Automation, App.ProcessId).Select(d => Txt.N(Dialogs.TextOf(d))).ToList();
            Kq("KQ-2 | hộp thoại sau F9: " + (dialogs.Count == 0 ? "(không)" : string.Join(" / ", dialogs.Select(t => $"「{t}」"))));
            Kq("KQ-2 | form còn mở sau F9: " + (FindForm(App, FunctionId) is not null));
            Kq("DB sau F9 | YOYAKUCONFIG: " + Row("YOYAKUCONFIG"));
            Kq("DB sau F9 | PATCONFIG: " + Row("PATCONFIG") + (Row("PATCONFIG") == patSnap ? "  (KHÔNG ĐỔI)" : "  (ĐÃ ĐỔI)"));
        }
        finally
        {
            if (allowWrite)
            {
                try { Exec("UPDATE YOYAKUCONFIG SET TIME = 2"); Kq("trả lại | YOYAKUCONFIG.TIME = 2 (giá trị gốc)"); }
                catch (Exception e) { Kq("⛔ TRẢ LẠI HỎNG: " + e.Message + " — chạy tay: UPDATE YOYAKUCONFIG SET TIME = 2"); }
                if (ochaXmlBackup is not null)
                {
                    try { File.Copy(ochaXmlBackup, OchaXml, overwrite: true); Kq("trả lại | Ocha.xml từ " + ochaXmlBackup); }
                    catch (Exception e) { Kq("⛔ Ocha.xml chưa trả: " + e.Message); }
                }
            }
        }
    }
}
