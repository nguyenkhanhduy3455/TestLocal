using System.Text;
using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.PatientRegistration;

namespace OchaCom.FlaUiTests.Tests.DeviceLinkage;

/// <summary>
/// PROBE — 機器連携 (device linkage) khi F9 登録 ở 患者登録 (<c>frm201001</c>): đo phía WinForm
/// ba hành vi mà web (agent 達人プラス / Kintone) mới chỉ suy ra từ source
/// <c>COMMON/Lib/CoopRoentgen.cs</c>:
///
/// <code>
///   L1 (-Case L1)  達人プラス (PicLink 24): {patNo}.csv ĐÃ CÓ — editData_TatsujinPlusCSV
///                  (:4311) không kiểm File.Exists ⇒ ghi đè KHÔNG hỏi?
///   L2 (-Case L2)  Kintone (MedicalSupportLink 25): upload.csv ĐÃ CÓ — editData_Kintone
///                  (:1356) hỏi Q00100 「…が既に存在します。上書きして」?
///   L3 (-Case L3)  Kintone: KHÔNG có ex.bat — file vẫn ghi, rồi MsgBox
///                  「カルテアプリ(kintone)の起動が出来ませんでした。」 chỉ một nút OK (:1376)?
/// </code>
///
/// <para>Cấu hình máy (<c>C:\NEW_SIM2000\Ocha.xml</c>: PicLink / MedicalSupportLink / NeoInfo /
/// DentalXInfo) do <c>run-device-linkage.ps1</c> đặt TRƯỚC khi app mở và trả lại nguyên byte
/// sau lượt — app chỉ đọc file này lúc khởi động.</para>
///
/// <para>GHI DB: một bệnh nhân test (clone từ <see cref="TemplatePatNo"/>), xoá ở
/// OneTimeTearDown. F9 chỉ lưu lại đúng dữ liệu đang có của bệnh nhân test đó.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("device-linkage")]
[CancelAfter(840_000)]
public sealed class DeviceLinkageProbeTests : SeededPatientTestBase
{
    /// <summary>社保 本人, 30%, một 枝番 hợp lệ hôm nay — giống bộ PatientRegistration.</summary>
    private const int TemplatePatNo = 11515;

    private const string PatEntryId = "frm201001";

    /// <summary>Phải khớp đường dẫn run-device-linkage.ps1 ghi vào Ocha.xml.</summary>
    private static readonly string Root = Environment.GetEnvironmentVariable("OCHA_LINK_ROOT") ?? @"C:\TCG\TestLocal\winform-link";
    private static string TatsujinDir => Path.Combine(Root, "tatsujin");
    private static string KintoneDir => Path.Combine(Root, "kintone");
    private static string Evidence => Path.Combine(Root, "evidence");

    private const string OldMarker = "OLD-CONTENT-BEFORE-F9";

    /// <summary>Đọc file thiết bị (Shift_JIS) cần code page 932, không có sẵn trên .NET 8.</summary>
    static DeviceLinkageProbeTests() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    protected override bool NavigatesToTreatmentEntry => false;

    protected override string[] NuisanceDialogPatterns => [];

    protected override string? SeededFixtureSkipReason() =>
        Settings.TestPatient.TemplatePatNo == TemplatePatNo
            ? null
            : $"Cần OCHA_TEST_PATIENT_TEMPLATE={TemplatePatNo} (run-device-linkage.ps1 đặt sẵn).";

    /// <summary>
    /// Bản clone giữ tên 11515 không có khoảng trắng ⇒ F9 dừng ở E00010 「苗字と名前の間に空白が
    /// 必要です」 trước khi tới bước 連携. Chuẩn hoá giống bộ PatientRegistration.
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
        if (SeededPatient is null) return;
        var db = PatientRegistrationDb.CreateOrNull(Settings, SeededPatient.PatNo);
        db?.Normalize("099-0000-0902");
        Log($"bệnh nhân test sau chuẩn hoá: {db?.Describe()}");
    }

    [OneTimeSetUp]
    public void RequireSeededPatient()
    {
        if (SeededPatient is null || PatNo < TestPatientDb.TestPatNoBase)
            Assert.Fail($"KHÔNG dựng được bệnh nhân test (PatNo hiện là {PatNo}) — dừng, không đụng bệnh nhân thật.");
        Directory.CreateDirectory(TatsujinDir);
        Directory.CreateDirectory(KintoneDir);
        Directory.CreateDirectory(Evidence);
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string no, string line) => Log($"=== KQ-{no} === {line}");

    private string TatsujinFile => Path.Combine(TatsujinDir, PatNo + ".csv");
    private static string UploadCsv => Path.Combine(KintoneDir, "upload.csv");
    private static string ExBat => Path.Combine(KintoneDir, "ex.bat");

    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    public void L1_Tatsujin_FileDaCo() => Probe("L1", "達人プラス: {patNo}.csv đã có trước F9", t =>
    {
        Reset(tatsujinOld: true, uploadOld: false, exBat: true);
        SaveWithF9(t, "L1");
        Kq("L1", "達人プラス: " + Describe(TatsujinFile));
        Kq("L1", "Kintone upload.csv: " + Describe(UploadCsv));
        Keep("L1");
    });

    [Test, Order(2)]
    public void L2_Kintone_UploadDaCo() => Probe("L2", "Kintone: upload.csv đã có trước F9 → trả lời はい", t =>
    {
        Reset(tatsujinOld: false, uploadOld: true, exBat: true);
        SaveWithF9(t, "L2");
        Kq("L2", "Kintone upload.csv: " + Describe(UploadCsv));
        Kq("L2", "達人プラス: " + Describe(TatsujinFile));
        Keep("L2");
    });

    [Test, Order(3)]
    public void L3_Kintone_KhongCoExBat() => Probe("L3", "Kintone: không có ex.bat", t =>
    {
        Reset(tatsujinOld: false, uploadOld: false, exBat: false);
        SaveWithF9(t, "L3");
        Kq("L3", "Kintone upload.csv: " + Describe(UploadCsv));
        Keep("L3");
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng
    // ═════════════════════════════════════════════════════════════════════════

    private void Reset(bool tatsujinOld, bool uploadOld, bool exBat)
    {
        foreach (var f in Directory.GetFiles(TatsujinDir)) File.Delete(f);
        foreach (var f in Directory.GetFiles(KintoneDir)) File.Delete(f);
        if (tatsujinOld) File.WriteAllText(TatsujinFile, OldMarker, Encoding.ASCII);
        if (uploadOld) File.WriteAllText(UploadCsv, OldMarker, Encoding.ASCII);
        if (exBat) File.WriteAllText(ExBat, "@exit /b 0\r\n", Encoding.ASCII);
        Log($"   chuẩn bị: 達人プラス={Describe(TatsujinFile)} · upload.csv={Describe(UploadCsv)} · ex.bat={File.Exists(ExBat)}");
    }

    private static string Describe(string path)
    {
        if (!File.Exists(path)) return "KHÔNG CÓ FILE";
        var bytes = File.ReadAllBytes(path);
        var text = Encoding.GetEncoding(932).GetString(bytes);
        var state = text == OldMarker ? "VẪN LÀ NỘI DUNG CŨ" : "ĐÃ GHI MỚI";
        var first = text.Split('\n')[0].TrimEnd('\r');
        return $"{state} ({bytes.Length} byte, ghi lúc {File.GetLastWriteTime(path):HH:mm:ss}) dòng 1: 「{(first.Length > 120 ? first[..120] + "…" : first)}」";
    }

    /// <summary>Chép file thiết bị ra thư mục bằng chứng để so byte với web sau lượt.</summary>
    private void Keep(string no)
    {
        if (File.Exists(TatsujinFile)) File.Copy(TatsujinFile, Path.Combine(Evidence, $"{no}-tatsujin-{PatNo}.csv"), true);
        if (File.Exists(UploadCsv)) File.Copy(UploadCsv, Path.Combine(Evidence, $"{no}-kintone-{PatNo}.csv"), true);
    }

    private void Probe(string no, string what, Action<TestTrace> body)
    {
        using var trace = TestTrace.Begin($"Link_{no}");
        Kq(no, $"── {what} · bệnh nhân {PatNo}");
        try { body(trace); }
        catch (Exception e)
        {
            trace.Fail(no, e);
            Kq(no, $"NGOẠI LỆ {e.GetType().Name}: {e.Message} · {Where()}");
        }
    }

    /// <summary>
    /// Mở 編集, F9 登録, rồi trả lời từng hộp thoại: câu hỏi lưu / validate ⇒ はい/OK để
    /// đi tiếp; câu hỏi ghi đè của thiết bị ⇒ はい (đo hành vi SAU khi đồng ý).
    /// </summary>
    private void SaveWithF9(TestTrace t, string no)
    {
        var w = OpenEdit(t);
        Click(t, w, "btnF9", "登録");
        var n = Dialogs(no, t, d => ["はい", "Yes", "OK"]);
        Kq(no, $"tổng số hộp thoại sau F9: {n} · {Where()}");
        CloseNoSave(t);
    }

    private int Dialogs(string no, TestTrace t, Func<MsgBoxWin32.Found, string[]> answer, int max = 8)
    {
        var count = 0;
        for (var i = 0; i < max; i++)
        {
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId),
                                   TimeSpan.FromSeconds(i == 0 ? 8 : 6));
            if (box is null) break;
            count++;
            var focused = Txt.N(App.Automation.FocusedElement()?.Name);
            var buttons = MsgBoxWin32.ButtonCaptions(box.Hwnd);
            var shot = MsgEvidence.CaptureAuto(box, $"Link {no} #{count}", focused);
            t.Shot($"{no}_hop{count}");
            var pick = answer(box).FirstOrDefault(p => buttons.Contains(p));
            Kq(no, $"hộp #{count}: 「{Txt.Vis(box.Raw)}」 tiêu đề 「{box.Title}」 nút [{string.Join("/", buttons)}] " +
                   $"mặc định 「{focused}」 → bấm {pick ?? "(không có nút hợp)"} · ảnh {shot ?? "-"}");
            if (pick is null || !MsgBoxWin32.ClickButton(box.Hwnd, pick))
            {
                Kq(no, "⚠ không bấm được nút nào — dừng");
                break;
            }
            Waits.TryUntil(() => MsgBoxWin32.All(App.ProcessId).All(x => x.Hwnd != box.Hwnd),
                           TimeSpan.FromSeconds(10));
            Waits.Step();
        }
        return count;
    }

    private Window? Entry() => App.Window(PatEntryId);

    private string Where()
    {
        try
        {
            var wins = App.Windows().Select(w => $"{Uia.AutomationIdOf(w)}「{Txt.N(w.Title)}」");
            var boxes = MsgBoxWin32.All(App.ProcessId).Select(b => $"#32770「{Txt.Vis(b.Raw)}」");
            return "cửa sổ: " + string.Join(", ", wins.Concat(boxes));
        }
        catch (Exception e) { return $"(không liệt kê được: {e.Message})"; }
    }

    /// <summary>Đóng frm201001 nếu còn mở (F10, không lưu).</summary>
    private void CloseNoSave(TestTrace t)
    {
        for (var i = 0; i < 2 && Entry() is { } w; i++)
        {
            Click(t, w, "btnF10", "戻る");
            Dialogs("dong", t, d => ["いいえ", "No", "OK"]);
            Waits.TryUntil(() => Entry() is null, TimeSpan.FromSeconds(10));
        }
    }

    /// <summary>Mở 編集 từ 患者選択 bằng 「F2 患者情報」 (frm203001.cs:331 — InpKbn = Update).</summary>
    private Window OpenEdit(TestTrace t)
    {
        CloseNoSave(t);
        var sel = AppNavigator.OpenPatientSelect(App, Settings);
        var patNoBox = Uia.ById(sel, Settings.Locator("patSelPatNo"))
                       ?? throw new InvalidOperationException("không thấy ô 患者番号 trên 患者選択.");
        Uia.SetText(patNoBox, PatNo.ToString());
        Click(t, sel, "btnF2", "患者情報");
        var w = Waits.TryFor(Entry, TimeSpan.FromSeconds(20))
                ?? throw new TimeoutException("F2 患者情報 rồi mà frm201001 không mở — " + Where());
        Waits.Step();
        t.Shot("mo_edit");
        return w;
    }

    private static void Click(TestTrace t, AutomationElement form, string id, string caption)
    {
        var b = Uia.ByIdOrName(form, id, caption)
                ?? throw new InvalidOperationException($"không thấy nút 「{caption}」 ({id})");
        var (x, y) = Uia.Center(b);
        if (x <= 0 && y <= 0) throw new InvalidOperationException($"nút 「{caption}」 không có toạ độ");
        t.Step($"bam {caption}");
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }
}
