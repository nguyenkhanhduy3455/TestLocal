using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// Vế WinForm của <c>web-tenant-tests/tests/fkey-menu/msgtbl-treatment-list-parity.spec.ts</c>
/// — hai mã <b>Q00049</b> và <b>Q00039</b>, đo tại CHÍNH call-site mà spec bên kia đo.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN VẾ NÀY KHI ĐÃ CÓ MsgTblParityTests
/// ═══════════════════════════════════════════════════════════════════════════════
/// Fixture kia so BẢNG: row MSGTBL ↔ literal web. Nó KHÔNG trả lời được hai câu mà
/// parity hỏng thật sự hay nằm ở đó:
///
/// <list type="number">
///   <item><description><b>Tình huống này bung mã NÀO.</b> Chọn nhầm mã thì chuỗi vẫn
///     "đúng" theo bảng mà người dùng vẫn đọc sai câu — đúng vụ I00002/I00003 của
///     紹介状.</description></item>
///   <item><description><b>WinForm truyền THAM SỐ gì vào <c>{0}</c>.</b> Bảng chỉ có
///     khuôn; câu người dùng thấy là khuôn ĐÃ điền.</description></item>
/// </list>
///
/// <para>Thêm một thứ nữa chỉ đo được ở đây: <b>nút mặc định</b>. UIA không phơi ra,
/// nhưng Win32 giao con trỏ cho nó ngay khi hộp thoại mở (F16).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐO ĐƯỢC 2026-09-15 (probe TCM9, máy ochacom-win)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   Q00049  frm203001 「F7 会計作成」 (frm203001.cs:430)
///     WinForm : 令和08年09月15日の会計データを一括作成します。
///               既に入力済の会計データは全て上書きされます。実行してよろしいですか？
///     nút     : OK / Cancel   — mặc định CANCEL (ShowOKCancelMsg …, Button2)
///     web     : {0}の会計データを作成します。よろしいですか？
///               ⇒ mất 「一括」 và mất TRỌN câu cảnh báo ghi đè
///
///   Q00039  frm203046 来患集計 「F1 印刷」 (frm203046.cs:156)
///     WinForm : 「 プリンタに用紙をセットしてください。」  ← có dấu cách đầu: tham số là " "
///     nút     : OK / Cancel   — mặc định OK
///     web     : 用紙をセットして下さい。
///               ⇒ mất cụm 「プリンタに」, và ください → 下さい
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB — KHÔNG. Cả hai ca đều trả lời 「キャンセル」
/// ═══════════════════════════════════════════════════════════════════════════════
/// Hai hộp thoại này là cổng xác nhận đứng TRƯỚC hành động:
/// <c>Q00049</c> → Cancel ⇒ <c>modBulkAcc.calcAcc</c> không chạy, không dòng kế toán nào
/// được tạo; <c>Q00039</c> → Cancel ⇒ <c>printProc()</c> không chạy, không lệnh in nào.
///
/// <para>⚠️ <b>Tuyệt đối không để "OK" làm fallback khi bấm nút</b> (F16): ở hai ca này
/// trả lời nhầm 「có」 là chạy thật.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[Category("msgtbl-parity")]
[CancelAfter(600_000)]
public sealed class MsgTblCallSiteTests : UiTestBase
{
    /// <summary>Fixture đứng ở 患者選択 — cả hai cửa đều mở từ đó.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    private const string VisitSummaryId = "frm203046";
    private const string VisitSummaryTitle = "来患集計";

    /// <summary>Tham số legacy truyền cho Q00039 — một DẤU CÁCH, không phải chuỗi rỗng (frm203046.cs:156).</summary>
    private const string PrinterParam = " ";

    private MsgTblOracle _msg = null!;
    private Window _patSelect = null!;

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    protected override string? FixturePreflightSkipReason()
    {
        var db = MsgTblOracle.CreateOrNull(TestSettings.Current);
        if (db is null) return "db.enabled = false hoặc thiếu chuỗi kết nối — không đọc được MSGTBL.";
        if (db.ProbeError() is { } err) return $"không kết nối được SQL Server: {err}";
        _msg = db;
        return null;
    }

    [OneTimeSetUp]
    public void CallSiteOneTimeSetUp() => _patSelect = AppNavigator.OpenPatientSelect(App, Settings);

    // ═════════════════════════════════════════════════════════════════════════
    // TCC1 — Q00049 (F7 会計作成)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCC1 — Q00049: WinForm cảnh báo GHI ĐÈ và mặc định Cancel; bản web bỏ cả hai")]
    public void TCC1_Q00049_BulkAccounting_WarnsAboutOverwrite()
    {
        var template = _msg.Template("Q00049")
                       ?? throw new InvalidOperationException("MSGTBL không có row Q00049.");
        var web = WebMsgSnapshot.Diverging.Single(d => d.Code == "Q00049").WebTemplate;

        DrainDialogs("trước TCC1");
        ClickBarButton(_patSelect, "btnF7", "会計作成");

        var box = RequireDialog("Q00049 sau khi bấm 「F7 会計作成」",
                                "Q00049 frm203001 F7 kaikei-sakusei");
        var buttons = MsgBoxWin32.ButtonCaptions(box.Hwnd);
        var defaultButton = FocusedName();

        LogKq(1, $"WinForm hiện: {Txt.Vis(box.Raw)}");
        Log($"   row MSGTBL    : {Txt.Vis(template)}");
        Log($"   literal web   : {Txt.Vis(web)}");
        Log($"   nút           : {string.Join(" / ", buttons)}   (mặc định: 「{defaultButton}」)");

        try
        {
            // Tham số WinForm điền vào {0}: lấy ra bằng cách gỡ phần CỐ ĐỊNH của khuôn.
            // Không hard-code ngày — nó là 診療日 đang chọn, đổi theo ngày chạy.
            var suffix = template[(template.IndexOf("{0}", StringComparison.Ordinal) + 3)..];

            Assert.Multiple(() =>
            {
                Assert.That(box.Raw, Does.EndWith(suffix),
                    "câu WinForm phải kết thúc đúng bằng phần cố định của row Q00049. Lệch ⇒ app " +
                    "không lấy chữ từ MSGTBL, hoặc mã phát ra không phải Q00049.");

                var param = box.Raw[..^suffix.Length];
                Log($"   tham số {{0}} WinForm truyền: 「{param}」 (frm203001.cs:417 _dtTrtDt.getWareki())");

                Assert.That(param, Is.Not.Empty,
                    "Q00049 phải được truyền 診療日; rỗng nghĩa là call-site gọi thiếu tham số.");

                Assert.That(box.Raw, Is.EqualTo(_msg.Render("Q00049", param)),
                    "…và toàn câu phải đúng bằng row đã render với tham số đó.");

                // ── Hai thứ bản web đang thiếu ────────────────────────────────
                Assert.That(box.Raw, Does.Contain("既に入力済の会計データは全て上書きされます"),
                    "WinForm CẢNH BÁO ghi đè. Đây là phần bản web cắt mất — người dùng không còn " +
                    "biết dữ liệu kế toán đã nhập sẽ bị ghi đè toàn bộ.");

                Assert.That(box.Raw, Does.Contain("一括作成"),
                    "WinForm nói 「一括作成」 (tạo cả kỳ), bản web chỉ nói 「作成」.");

                Assert.That(box.Raw, Is.Not.EqualTo(web.Replace("{0}", box.Raw[..^suffix.Length])),
                    $"câu WinForm và câu web phải còn khác nhau — bằng nhau ⇒ web đã sửa xong, " +
                    $"chuyển Q00049 sang WebMsgSnapshot.Matching. ({WebMsgSnapshot.SourceFile})");

                // ── Nút mặc định: thứ chỉ đo được ở giao diện ─────────────────
                Assert.That(buttons, Is.EquivalentTo(new[] { "OK", "Cancel" }),
                    "ShowOKCancelMsg ⇒ đúng hai nút. Nhãn theo NGÔN NGỮ WINDOWS chứ không phải " +
                    "はい/いいえ (F16).");

                Assert.That(defaultButton, Is.EqualTo("Cancel"),
                    "legacy truyền MessageBoxDefaultButton.Button2 (frm203001.cs:430) ⇒ mặc định phải " +
                    "là Cancel. Đây là cách legacy nói 「thao tác này nguy hiểm」, và là thứ bản web " +
                    "cần khớp — Enter vội trên hộp mặc định OK là ghi đè cả kỳ kế toán.");
            });
        }
        finally
        {
            Cancel(box);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC2 — Q00039 (来患集計 F1 印刷)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCC2 — Q00039: WinForm nói 「プリンタに」 và CÓ nhận tham số; bản web bỏ cả hai")]
    public void TCC2_Q00039_PrintPrompt_NamesThePrinter()
    {
        var template = _msg.Template("Q00039")
                       ?? throw new InvalidOperationException("MSGTBL không có row Q00039.");
        var web = WebMsgSnapshot.Diverging.Single(d => d.Code == "Q00039").WebTemplate;
        var expected = _msg.Render("Q00039", PrinterParam);

        DrainDialogs("trước TCC2");
        ClickBarButton(_patSelect, "btnF3", "当月来患");

        // frm203046 KHÔNG phải cửa sổ top-level — nó là form CON nằm trong cây UIA của
        // frm203001 (đo 2026-09-15: App.Window("frm203046") trả null trong khi màn hình
        // đang hiện nó). Phải lục BÊN TRONG cửa sổ cha.
        var summary = Waits.TryFor(
            () => KarteAutoCalcDialog.FindDialogWindow(App, VisitSummaryId, VisitSummaryTitle, _patSelect),
            TimeSpan.FromSeconds(12))
            ?? throw new TimeoutException(
                "không thấy 来患集計 (frm203046) sau khi bấm 「F3 当月来患」, kể cả khi lục trong " +
                "frm203001. MỞ ẢNH trong artifacts/screenshots ra xem trước khi chạy lại (F1/F2).");

        try
        {
            ClickBarButton(summary, "btnF1", "印刷");

            var box = RequireDialog("Q00039 sau khi bấm 「F1 印刷」 trong 来患集計",
                                    "Q00039 frm203046 F1 insatsu");
            var buttons = MsgBoxWin32.ButtonCaptions(box.Hwnd);

            LogKq(2, $"WinForm hiện: {Txt.Vis(box.Raw)}");
            Log($"   row MSGTBL   : {Txt.Vis(template)}");
            Log($"   render với 「{PrinterParam}」: {Txt.Vis(expected)}");
            Log($"   literal web  : {Txt.Vis(web)}");
            Log($"   nút          : {string.Join(" / ", buttons)}   (mặc định: 「{FocusedName()}」)");

            try
            {
                Assert.Multiple(() =>
                {
                    Assert.That(box.Raw, Is.EqualTo(expected),
                        "câu WinForm phải đúng bằng row Q00039 render với tham số 「 」 (một dấu cách) — " +
                        "đúng tham số legacy truyền ở frm203046.cs:156. Dấu cách ĐẦU câu là bằng chứng " +
                        "trực tiếp rằng {0} có được điền, chỉ là điền bằng chuỗi trống nghĩa.");

                    Assert.That(box.Raw, Does.Contain("プリンタに"),
                        "WinForm nói rõ 「(máy in X) プリンタに」. Bản web cắt cụm này nên câu mất chỗ " +
                        "cần đặt giấy — với phòng khám có nhiều máy in thì đó là thông tin chính.");

                    Assert.That(box.Raw, Is.Not.EqualTo(web),
                        "câu WinForm và câu web phải còn khác nhau — bằng nhau ⇒ web đã sửa xong, " +
                        $"chuyển Q00039 sang WebMsgSnapshot.Matching. ({WebMsgSnapshot.SourceFile})");

                    Assert.That(template, Does.Contain("{0}"),
                        "row Q00039 CÓ {0} ⇒ chữ ký bên web phải nhận tham số. Hiện web khai 0 tham số " +
                        "— xem MsgTblParityTests.TCM4.");

                    Assert.That(buttons, Is.EquivalentTo(new[] { "OK", "Cancel" }),
                        "ShowOKCancelMsg ⇒ đúng hai nút (F16: nhãn theo ngôn ngữ Windows).");
                });
            }
            finally
            {
                Cancel(box);
            }
        }
        finally
        {
            try
            {
                ClickBarButton(summary, "btnF10", "戻る");
                Waits.Until(
                    () => KarteAutoCalcDialog.FindDialogWindow(
                              App, VisitSummaryId, VisitSummaryTitle, _patSelect) is null,
                    "来患集計 đóng lại", TimeSpan.FromSeconds(10));
            }
            catch (Exception e) { Log($"không đóng được 来患集計: {e.Message}"); }

            DrainDialogs("sau TCC2");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng nhỏ dùng chung
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Nút đang giữ con trỏ NGAY KHI hộp thoại mở = nút mặc định (F16).</summary>
    private string FocusedName()
    {
        try { return Txt.N(App.Automation.FocusedElement()?.Name); }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    /// <summary>Chờ hộp thoại với deadline NGẮN (F2) — nó bung ngay trong handler của cú bấm.</summary>
    private MsgBoxWin32.Found RequireDialog(string what, string evidenceLabel)
    {
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
        if (box is not null)
        {
            // Chụp RIÊNG hộp thoại, TRƯỚC mọi assert — ảnh phải có kể cả khi assert đỏ.
            var code = System.Text.RegularExpressions.Regex.Match(evidenceLabel, @"[EQI]\d{5}").Value;
            var shot = MsgEvidence.Capture(box, evidenceLabel, _msg.Template(code));
            Log($"   ảnh hộp thoại: {shot ?? "(không chụp được)"}");
            return box;
        }

        throw new TimeoutException(
            $"không thấy {what} sau 8s. Ảnh chụp từng bước đã có trong artifacts/screenshots — " +
            "MỞ ẢNH RA XEM trước khi chạy lại (F1/F2).");
    }

    /// <summary>
    /// Trả lời 「không」. <b>KHÔNG có "OK" trong danh sách</b> — ở hai ca này bấm nhầm là
    /// chạy <c>calcAcc</c> / <c>printProc</c> thật (F16).
    /// </summary>
    private void Cancel(MsgBoxWin32.Found box)
    {
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "キャンセル", "Cancel", "いいえ", "No"))
            throw new InvalidOperationException(
                $"KHÔNG bấm được nút huỷ trên {box}. Nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)) +
                ". Dừng ở đây thay vì bấm bừa — nút còn lại là 「chạy thật」.");

        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
    }

    private void DrainDialogs(string when)
    {
        foreach (var d in MsgBoxWin32.All(App.ProcessId))
        {
            Log($"   dọn hộp thoại sót {when}: {Txt.Vis(d.Raw)}");
            MsgBoxWin32.ClickButton(d.Hwnd, "キャンセル", "Cancel", "いいえ", "No", "OK");
        }
    }

    /// <summary>
    /// Bấm nút trên dải F bằng CHUỘT VẬT LÝ — phím F rơi vào NHẦM FORM khi có form con
    /// chồng lên (F15, mà 来患集計 và 患者選択 đều có bộ F1..F10 riêng), còn
    /// <c>Uia.Click</c> thì đồng bộ nên có thể treo trên nút mở MessageBox (F18).
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
}
