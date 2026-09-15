using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// Vế WinForm của <c>web-tenant-tests/tests/patient-select/msgtbl-register-f9-parity.spec.ts</c>
/// — màn <b>患者登録</b> (<c>frm201001</c>), chuỗi kiểm tra của <b>F9 登録</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// LÔ NÀY CHỈ LÀM HAI MÃ, VÀ ĐÓ LÀ CHỦ Ý
/// ═══════════════════════════════════════════════════════════════════════════════
/// Spec bên web phủ 8 mã ở màn này. Chúng chia làm hai nhóm rất khác nhau về giá:
///
/// <code>
///   KHÔNG cần dữ liệu — chỉ gõ vào ô rồi bấm F9:
///     E00010  氏名（漢字） không có dấu cách ngăn họ/tên   (frm201001.cs:2141)
///     E00012  氏名（漢字） quá 100 BYTE                     (frm201001.cs:2161)
///
///   CẦN dựng bệnh nhân riêng (tuổi / 保険種別 / 有効期限):
///     E00016 E00017  dưới 16 tuổi + 社保・本人 / 退職者・本人  (:2410 / :2416)
///     Q00012         từ 75 tuổi, chưa có 保険者番号 後期高齢者  (:2433)
///     Q00013         70–74 tuổi, chưa chỉ định 高齢者          (:2463)
///     Q00014         有効期限 đã hết                           (:2786)
/// </code>
///
/// <para>Nhóm đầu làm được ngay, không đụng DB. Nhóm sau cần
/// <see cref="SeededPatientTestBase"/> và mỗi mã một tiền đề riêng — để lô sau.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG CÓ ĐƯỜNG NÀO GHI ĐƯỢC
/// ═══════════════════════════════════════════════════════════════════════════════
/// F9 trên màn này CÓ ghi thật nếu kiểm tra qua hết. Cả hai ca ở đây cố ý làm hỏng
/// <c>氏名（漢字）</c> nên <c>chkInputDataMain</c> dừng tại chỗ và trả <c>false</c> —
/// <b>không câu lệnh ghi nào chạy</b>. Thêm hai lớp nữa:
///
/// <list type="number">
///   <item><description>Chụp giá trị <c>txtName</c> trước, trả lại sau MỖI ca.</description></item>
///   <item><description>F9 mà KHÔNG bung hộp thoại nào ⇒ coi như đã ghi: ca đỏ ngay với
///     câu nói thẳng chuyện đó, thay vì đi tiếp và để lại một bệnh nhân hỏng tên.</description></item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HAI MÃ WINFORM CÓ MÀ BẢN WEB KHÔNG CÓ
/// ═══════════════════════════════════════════════════════════════════════════════
/// Ngay giữa E00010 và E00012, WinForm còn hai cổng nữa mà <c>ja-msgtbl.ts</c> không
/// hề định nghĩa:
///
/// <code>
///   E00011  :2147  全角半角混在チェック — tên lẫn nửa giác với toàn giác
///   Q00008  :2153  ShiftJisチェック     — tên có ký tự ngoài Shift-JIS
/// </code>
///
/// <para>Đó là lý do <see cref="TooLongName"/> dùng TOÀN chữ 全角: lẫn nửa giác vào là
/// rơi vào E00011 chứ không tới được E00012, và ca test sẽ đo nhầm mã.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[Category("msgtbl-parity")]
[CancelAfter(900_000)]
public sealed class MsgTblPatientEntryTests : UiTestBase
{
    /// <summary>Fixture đứng ở 患者選択 — 患者登録 mở từ đó bằng 「F2 患者情報」 (frm203001.cs:331).</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    private const string PatEntryId = "frm201001";

    /// <summary>氏名（漢字） trong user-control <c>InsurerInfo</c> (InsurerInfo.cs:648).</summary>
    private const string NameBoxId = "txtName";

    /// <summary>Tên KHÔNG có dấu cách ⇒ E00010. Toàn giác để không chạm E00011.</summary>
    private const string NoSpaceName = "テストカンジナマエ";

    /// <summary>
    /// 51 chữ toàn giác = 102 byte CP932 ⇒ vượt trần 100 của E00012.
    ///
    /// <para>CÓ dấu cách 全角 ở giữa để qua được E00010 (cổng đứng TRƯỚC), và TOÀN chữ
    /// 全角 để không rơi vào E00011 (全角半角混在).</para>
    /// </summary>
    private static readonly string TooLongName = new string('ア', 25) + "　" + new string('イ', 25);

    private MsgTblOracle _msg = null!;
    private Window _patSelect = null!;
    private Window _patEntry = null!;
    private string _nameBefore = "";

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(string code, string line) => Log($"=== KQ-{code} === {line}");

    protected override string? FixturePreflightSkipReason()
    {
        var db = MsgTblOracle.CreateOrNull(TestSettings.Current);
        if (db is null) return "db.enabled = false hoặc thiếu chuỗi kết nối — không đọc được MSGTBL.";
        if (db.ProbeError() is { } err) return $"không kết nối được SQL Server: {err}";
        _msg = db;
        return null;
    }

    [OneTimeSetUp]
    public void PatientEntryOneTimeSetUp()
    {
        _patSelect = AppNavigator.OpenPatientSelect(App, Settings);
        DrainDialogs("trước khi mở 患者登録");
        _patEntry = OpenPatientEntry();

        _nameBefore = Txt.N(Uia.ValueOf(Uia.RequireById(_patEntry, NameBoxId)));
        Log($"氏名（漢字） nguyên trạng: 「{_nameBefore}」 — sẽ trả lại sau mỗi ca.");
    }

    /// <summary>Trả ô 氏名 về nguyên trạng, bất kể ca xanh hay đỏ.</summary>
    [OneTimeTearDown]
    public void PatientEntryOneTimeTearDown()
    {
        try
        {
            if (_patEntry is null || _nameBefore.Length == 0) return;
            var box = Uia.ById(_patEntry, NameBoxId);
            if (box is null) return;
            Uia.SetText(box, _nameBefore);
            Log($"đã trả 氏名（漢字） về 「{Txt.N(Uia.ValueOf(box))}」 (KHÔNG bấm F9 ⇒ không ghi gì).");
        }
        catch (Exception e) { Log($"⚠ không trả lại được 氏名: {e.Message}"); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCE1 — E00010
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCE1 — E00010: 氏名（漢字） không có dấu cách ngăn họ/tên")]
    public void TCE1_E00010_NameWithoutSeparator()
    {
        var expected = _msg.Render("E00010");
        var web = WebMsgSnapshot.Render("E00010");

        var box = SetName(NoSpaceName);
        var dialog = PressF9AndRequireDialog("E00010 sau khi bỏ dấu cách khỏi 氏名（漢字）",
                                             "E00010 frm201001 F9 ten-khong-dau-cach");

        LogKq("E00010", $"WinForm: {Txt.Vis(dialog.Raw)}");
        Log($"   MSGTBL: {Txt.Vis(expected)}   |   web: {Txt.Vis(web)}");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(dialog.Raw, Is.EqualTo(expected),
                    "E00010 không nhận tham số (frm201001.cs:2141) nên câu phải đúng bằng row MSGTBL.");
                Assert.That(dialog.Raw, Is.EqualTo(web),
                    $"…và phải TRÙNG KHÍT literal bản web ({WebMsgSnapshot.SourceFile}).");
            });
        }
        finally
        {
            DismissOk(dialog);
            Uia.SetText(box, _nameBefore);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCE2 — E00012
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCE2 — E00012: 氏名（漢字） 102 byte (51 chữ toàn giác)")]
    public void TCE2_E00012_NameOverByteLimit()
    {
        var expected = _msg.Render("E00012");
        var web = WebMsgSnapshot.Render("E00012");

        var box = SetName(TooLongName);
        var dialog = PressF9AndRequireDialog("E00012 sau khi đặt 氏名（漢字） dài 102 byte",
                                             "E00012 frm201001 F9 ten-102byte");

        LogKq("E00012", $"WinForm: {Txt.Vis(dialog.Raw)}");
        Log($"   MSGTBL: {Txt.Vis(expected)}   |   web: {Txt.Vis(web)}");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(dialog.Raw, Is.Not.EqualTo(_msg.Render("E00010")),
                    "bung E00010 nghĩa là tên thiếu dấu cách — cổng đó đứng TRƯỚC E00012 " +
                    "(frm201001.cs:2141 vs :2161), sửa dữ liệu test chứ đừng sửa assert.");

                Assert.That(dialog.Raw, Is.Not.EqualTo(_msg.Render("E00011")),
                    "bung E00011 nghĩa là tên lẫn nửa giác với toàn giác (:2147) — cũng là cổng " +
                    "đứng trước. Dùng TOÀN chữ 全角.");

                Assert.That(dialog.Raw, Is.EqualTo(expected),
                    "WinForm phải hiện E00012 với đủ cả vế giới hạn cụ thể " +
                    "「全角で20文字、半角で40文字までです。」 (row MSGTBL).");

                Assert.That(dialog.Raw, Is.EqualTo(web),
                    $"…và phải TRÙNG KHÍT literal bản web ({WebMsgSnapshot.SourceFile}).");
            });
        }
        finally
        {
            DismissOk(dialog);
            Uia.SetText(box, _nameBefore);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng
    // ═════════════════════════════════════════════════════════════════════════

    private Window OpenPatientEntry()
    {
        var already = App.Window(PatEntryId);
        if (already is not null) return already;

        var patNoBox = Uia.ById(_patSelect, Settings.Locator("patSelPatNo"))
                       ?? throw new InvalidOperationException("không thấy ô 患者番号 trên 患者選択.");
        Uia.SetText(patNoBox, PatNo.ToString());

        ClickBarButton(_patSelect, "btnF2", "患者情報");

        return Waits.TryFor(() => App.Window(PatEntryId), TimeSpan.FromSeconds(20))
               ?? throw new TimeoutException(
                      $"bấm 「F2 患者情報」 rồi nhưng {PatEntryId} không mở sau 20s. MỞ ẢNH trong " +
                      "artifacts/screenshots ra xem trước khi chạy lại (F1/F2).");
    }

    private AutomationElement SetName(string value)
    {
        var box = Uia.RequireById(_patEntry, NameBoxId);
        Uia.SetText(box, value);
        Waits.Step();

        var actual = Txt.N(Uia.ValueOf(box));
        if (actual != Txt.N(value))
            Log($"   ⚠ ô 氏名 đang giữ 「{actual}」 chứ không phải cái vừa đặt — " +
                "có thể MaxLength cắt bớt; đọc kỹ mã bung ra trước khi tin kết quả.");
        return box;
    }

    /// <summary>
    /// Bấm F9 và ĐÒI phải có hộp thoại.
    ///
    /// <para>Không có hộp thoại nào là tín hiệu NGUY: <c>chkInputDataMain</c> đã qua hết
    /// và F9 ghi thật. Ném ngay tại đây để ca đỏ nói đúng chuyện đó, thay vì đi tiếp và
    /// để lại một bệnh nhân mang tên hỏng.</para>
    /// </summary>
    private MsgBoxWin32.Found PressF9AndRequireDialog(string what, string evidenceLabel)
    {
        ClickBarButton(_patEntry, "btnF9", "登録");

        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(10));
        if (box is null)
            throw new InvalidOperationException(
                $"F9 KHÔNG bung hộp thoại nào cho {what}. Nghĩa là chuỗi kiểm tra đã QUA và " +
                "F9 có thể VỪA GHI THẬT bệnh nhân với dữ liệu test. Kiểm bảng INSURANCE của " +
                $"bệnh nhân {PatNo} ngay, và trả 氏名（漢字） về 「{_nameBefore}」.");

        var code = System.Text.RegularExpressions.Regex.Match(evidenceLabel, @"[EQI]\d{5}").Value;
        var shot = MsgEvidence.Capture(box, evidenceLabel, _msg.Template(code),
                                       Txt.N(App.Automation.FocusedElement()?.Name));
        Log($"   ảnh hộp thoại: {shot ?? "(không chụp được)"}");
        return box;
    }

    private void DismissOk(MsgBoxWin32.Found box)
    {
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes"))
            throw new InvalidOperationException(
                $"không bấm được nút nào trên {box}. Nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)));

        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
    }

    private void DrainDialogs(string when)
    {
        for (var i = 0; i < 5; i++)
        {
            var box = MsgBoxWin32.First(App.ProcessId);
            if (box is null) return;
            Log($"dọn hộp thoại {when}: {Txt.Vis(box.Raw)}");
            if (!MsgBoxWin32.ClickButton(box.Hwnd, "いいえ", "No", "キャンセル", "Cancel", "OK"))
                return;
            Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
                "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
        }
    }

    private static void ClickBarButton(AutomationElement form, string automationId, string caption)
    {
        var button = Uia.ByIdOrName(form, automationId, caption)
                     ?? throw new InvalidOperationException(
                            $"không thấy nút 「{caption}」 ({automationId})");
        var (x, y) = Uia.Center(button);
        if (x <= 0 && y <= 0) throw new InvalidOperationException($"nút 「{caption}」 không có toạ độ");
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }
}
