using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// PROBE — <b>đo, KHÔNG assert.</b> Mang <c>[Explicit]</c> nên lượt chạy đủ bỏ qua nó.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════════
/// Bộ Playwright đã phủ 15 mã bằng 4 spec <c>*msgtbl*</c>. Muốn viết vế WinForm tương
/// ứng thì phải biết TRƯỚC: mỗi câu bung ra ở bước nào, hộp thoại có mấy nút, nút mặc
/// định là nút nào, và tham số WinForm truyền vào trông ra sao. Đúng F1: <b>chụp ảnh →
/// đọc ảnh → rồi mới viết assert.</b> Probe này chỉ làm vế đầu.
///
/// <code>
///   KQ-2  frm203001 F7 会計データ作成 → Q00049   (đối chiếu fkey-menu/msgtbl-treatment-list-parity)
///   KQ-3  frm203001 F3 → 来患集計 frm203046, F1 印刷 → Q00039   (cùng spec đó)
///   KQ-4  frm203001 F2 → 患者登録 frm201001: đổ ô/nút — nền cho 11 ca của
///         patient-select/msgtbl-{date-insurer,register-f9}-parity
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ PROBE NÀY KHÔNG GHI GÌ
/// ═══════════════════════════════════════════════════════════════════════════════
/// Hai hộp thoại nó bung ra đều là cổng XÁC NHẬN đứng TRƯỚC hành động:
///
/// <list type="bullet">
///   <item><description><c>Q00049</c> — frm203001.cs:430. Trả 「キャンセル」 ⇒
///     <c>modBulkAcc.calcAcc</c> KHÔNG chạy ⇒ không dòng kế toán nào được tạo. Chính
///     legacy cũng để mặc định ở Cancel (<c>MessageBoxDefaultButton.Button2</c>).</description></item>
///   <item><description><c>Q00039</c> — frm203046.cs:156. Trả 「キャンセル」 ⇒
///     <c>printProc()</c> KHÔNG chạy ⇒ không có lệnh in nào.</description></item>
/// </list>
///
/// <para>Còn 患者登録 thì probe chỉ MỞ và ĐỌC. Mọi câu của màn đó (E00010, E00012,
/// E00016, E00017, E00022, Q00012, Q00013, Q00014) bung TRONG <c>chkInputData</c>, tức
/// sau khi bấm 登録 — mà nếu dữ liệu tình cờ HỢP LỆ thì cú bấm đó GHI THẬT vào hồ sơ
/// bệnh nhân. Ca thật cho chúng phải chạy trên bệnh nhân seed
/// (<see cref="SeededPatientTestBase"/>, <c>PAT_NO &gt;= 990000</c>), y như bên
/// Playwright tự seed <c>person</c>/<c>insurance</c>/<c>med_ins_inf</c> rồi tự xoá.</para>
///
/// Chạy:
/// <code>
///   .\run-msgtbl-parity.ps1 -Probe
/// </code>
/// </summary>
[TestFixture]
[NonParallelizable]
[Explicit("PROBE — chỉ chạy đích danh; nó mở 患者登録 của bệnh nhân THẬT (chỉ đọc)")]
[Category("msgtbl-parity")]
[CancelAfter(600_000)]
public sealed class MsgTblProbeTests : UiTestBase
{
    /// <summary>Probe đứng ở 患者選択 — mọi cửa nó thử đều mở TỪ đó.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    /// <summary>AutomationId của 患者登録 (formControl.formId.ID201001).</summary>
    private const string PatEntryId = "frm201001";

    /// <summary>AutomationId của 来患集計 (formControl.formId.ID203046).</summary>
    private const string VisitSummaryId = "frm203046";

    /// <summary>Tiêu đề của 来患集計 — đường dò dự phòng khi AutomationId không khớp.</summary>
    private const string VisitSummaryTitle = "来患集計";

    private MsgTblOracle? _msg;

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp() => _msg = MsgTblOracle.CreateOrNull(TestSettings.Current);

    [Test]
    [Description("TCM9 — PROBE: Q00049 / Q00039 nguyên văn, và bản đồ màn 患者登録")]
    public void TCM9_Probe_CallSitesOfWebSpecs()
    {
        using var trace = TestTrace.Begin();

        Window? patSelect = null;
        Step(trace, 1, "mo man 患者選択", () =>
        {
            patSelect = AppNavigator.OpenPatientSelect(App, Settings);
            return $"frm203001 đang mở, tiêu đề 「{patSelect.Title}」";
        });
        if (patSelect is null) return;

        // ── KQ-2: Q00049 ────────────────────────────────────────────────────
        Step(trace, 2, "F7 会計データ作成 → Q00049", () =>
        {
            Uia.SendKey(Vk.F7);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null) return "KHÔNG có hộp thoại nào sau F7 — xem ảnh bước này";

            var report = Describe(box, "Q00049");
            Cancel(box);
            return report;
        });

        // ── KQ-3: Q00039 ────────────────────────────────────────────────────
        Step(trace, 3, "F3 当月来患 → 来患集計 → F1 印刷 → Q00039", () =>
        {
            ClickBarButton(patSelect!, "btnF3", "当月来患");

            // frm203046 KHÔNG phải cửa sổ top-level — ảnh chụp lượt 11:20 cho thấy nó nằm
            // TRONG cây UIA của frm203001 (cùng kiểu form-con như frm203043 nằm trong
            // frm203042). App.Window("frm203046") vì thế trả null trong khi màn hình đang
            // hiện nó rành rành ⇒ phải lục BÊN TRONG cửa sổ cha.
            var summary = Waits.TryFor(
                () => KarteAutoCalc.KarteAutoCalcDialog.FindDialogWindow(
                          App, VisitSummaryId, VisitSummaryTitle, patSelect),
                TimeSpan.FromSeconds(12));

            if (summary is null)
                return "KHÔNG thấy 来患集計 (frm203046) kể cả khi lục trong frm203001 — " +
                       "cửa sổ đang mở: " + DescribeWindows();

            // Bấm NÚT thay vì gửi phím F1: phím F rơi vào NHẦM FORM khi có form con chồng
            // lên (F15), và ở đây cha/con đều có bộ F1..F10 riêng.
            ClickBarButton(summary, "btnF1", "印刷");

            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null) return "来患集計 mở được nhưng 「F1 印刷」 không bung hộp thoại nào";

            var report = Describe(box, "Q00039");
            Cancel(box);

            // Đóng 来患集計 — để lại nó là bước sau bấm vào KHÔNG KHÍ và đổ oan cho app (F19).
            ClickBarButton(summary, "btnF10", "戻る");
            Waits.Until(() => KarteAutoCalc.KarteAutoCalcDialog.FindDialogWindow(
                                  App, VisitSummaryId, VisitSummaryTitle, patSelect) is null,
                "来患集計 đóng lại", TimeSpan.FromSeconds(10));

            return report;
        });

        // ── KQ-4: bản đồ 患者登録 ────────────────────────────────────────────
        Step(trace, 4, "go so benh nhan roi F2 → 患者登録", () =>
        {
            var box = Uia.ById(patSelect!, Settings.Locator("patSelPatNo"));
            if (box is null) return "KHÔNG thấy ô 患者番号 — xem lại locator patSelPatNo";
            Uia.SetText(box, PatNo.ToString());
            ClickBarButton(patSelect!, "btnF2", "患者情報");

            var win = Waits.TryFor(() => App.Window(PatEntryId), TimeSpan.FromSeconds(15));
            return win is null
                ? "KHÔNG mở được frm201001 sau 15s — cửa sổ đang mở: " + DescribeWindows()
                : $"frm201001 đang mở, tiêu đề 「{win.Title}」";
        });

        var patEntry = App.Window(PatEntryId);
        if (patEntry is null)
        {
            LogKq(9, "không mở được 患者登録 — dừng probe, xem ảnh trong artifacts/screenshots.");
            return;
        }

        Step(trace, 5, "liet ke o nhap cua 患者登録", () =>
        {
            var fields = patEntry.FindAllDescendants()
                .Where(e => e.ControlType is ControlType.Edit or ControlType.ComboBox or ControlType.CheckBox)
                .ToList();
            foreach (var e in fields.Take(140))
                Log($"      {e.ControlType,-9} id=「{e.AutomationId}」 name=「{Txt.N(e.Name)}」 " +
                    $"value=「{Txt.N(Uia.ValueOf(e))}」");
            return $"{fields.Count} ô nhập (in tối đa 140)";
        });

        Step(trace, 6, "liet ke nut cua 患者登録", () =>
        {
            var buttons = patEntry.FindAllDescendants()
                .Where(e => e.ControlType == ControlType.Button)
                .ToList();
            foreach (var b in buttons.Take(60))
                Log($"      Button id=「{b.AutomationId}」 name=「{Txt.N(b.Name)}」");
            return $"{buttons.Count} nút — tìm 登録 / F9 trong danh sách này";
        });

        Step(trace, 7, "hop thoai con sot lai", () =>
        {
            var boxes = MsgBoxWin32.All(App.ProcessId);
            foreach (var b in boxes)
                Log($"      {Txt.Vis(b.Raw)}  nút: {string.Join(" / ", MsgBoxWin32.ButtonCaptions(b.Hwnd))}");
            return boxes.Count == 0 ? "không có hộp thoại nào" : $"{boxes.Count} hộp thoại đang mở";
        });

        LogKq(9, "xong. Bước tiếp: dựng bệnh nhân seed rồi mới được bấm 登録 để ép validation " +
                 "bung E00010/E00012/E00016/E00017/E00022/Q00012/Q00013/Q00014.");
    }

    /// <summary>
    /// Ghi lại MỌI thứ cần để viết assert sau này: nguyên văn, nút, và <b>nút mặc định</b>.
    ///
    /// <para>Nút mặc định UIA không phơi ra, nhưng Win32 giao con trỏ cho nó ngay khi hộp
    /// thoại vừa mở ⇒ đọc <c>FocusedElement</c> lúc này là biết (F16). Với Q00049 thì đây
    /// là chi tiết có nghĩa: legacy cố ý để mặc định ở Cancel.</para>
    /// </summary>
    private string Describe(MsgBoxWin32.Found box, string expectedCode)
    {
        var buttons = string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd));

        string focused;
        try { focused = Txt.N(App.Automation.FocusedElement()?.Name) ; }
        catch (Exception e) { focused = $"(không đọc được: {e.Message})"; }

        Log($"      nguyên văn : {Txt.Vis(box.Raw)}");
        Log($"      tiêu đề    : 「{box.Title}」");
        Log($"      nút        : {buttons}");
        Log($"      nút mặc định (đang giữ con trỏ): 「{focused}」");

        var shot = MsgEvidence.Capture(box, $"{expectedCode} probe", _msg?.Template(expectedCode));
        Log($"      ảnh        : {shot ?? "(không chụp được)"}");

        var template = _msg?.Template(expectedCode);
        if (template is not null) Log($"      row MSGTBL {expectedCode} : {Txt.Vis(template)}");

        return $"{expectedCode}: {Txt.Vis(box.Raw)}";
    }

    /// <summary>
    /// Bấm một nút trên dải F của form, bằng CHUỘT VẬT LÝ.
    ///
    /// <para>Hai lý do không gửi phím: (a) phím F rơi vào NHẦM FORM khi có form con chồng
    /// lên (F15) — mà 来患集計 và 患者選択 đều có bộ F1..F10 riêng; (b) <c>Uia.Click</c>
    /// gọi <c>InvokePattern</c> đồng bộ nên cú bấm mở MessageBox modal có thể không bao
    /// giờ trả về (F18).</para>
    /// </summary>
    private static void ClickBarButton(AutomationElement form, string automationId, string caption)
    {
        var button = Uia.ByIdOrName(form, automationId, caption)
                     ?? throw new InvalidOperationException(
                            $"không thấy nút 「{caption}」 ({automationId}) trên form đang mở");

        var (x, y) = Uia.Center(button);
        if (x <= 0 && y <= 0)
            throw new InvalidOperationException($"nút 「{caption}」 không có toạ độ màn hình");

        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    /// <summary>Trả lời 「không」 — mọi hộp thoại probe chạm tới đều là cổng đứng TRƯỚC hành động.</summary>
    private void Cancel(MsgBoxWin32.Found box)
    {
        // F16 — nhãn theo NGÔN NGỮ WINDOWS. Và KHÔNG để "OK" làm fallback: ở đây trả lời
        // nhầm 「có」 là chạy calcAcc / printProc thật.
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "キャンセル", "Cancel", "いいえ", "No"))
            Log($"      ⚠ KHÔNG bấm được nút huỷ — nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)));

        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
    }

    private string DescribeWindows()
    {
        try
        {
            var names = OchaApp.SharedAutomation.GetDesktop().FindAllChildren()
                .Where(w => w.Properties.ProcessId.ValueOrDefault == App.ProcessId)
                .Select(w => $"「{Txt.N(w.Name)}」({w.AutomationId})");
            return string.Join(", ", names);
        }
        catch (Exception e) { return $"(không liệt kê được: {e.Message})"; }
    }

    /// <summary>Một bước probe: chụp ảnh, ghi kết quả, và KHÔNG ném dù có chuyện gì.</summary>
    private static void Step(TestTrace trace, int no, string what, Func<string> action)
    {
        try
        {
            var result = action();
            LogKq(no, $"{what} → {result}");
            trace.Step(what);
        }
        catch (Exception e)
        {
            LogKq(no, $"{what} → NGOẠI LỆ {e.GetType().Name}: {e.Message}");
            trace.Shot($"{no}-loi");
        }
    }
}
