using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;
using MouseButton = FlaUI.Core.Input.MouseButton;

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
/// VIỆC CÒN DỞ — ĐỌC TRƯỚC KHI CHẠY
/// ═══════════════════════════════════════════════════════════════════════════════
/// <b>E00010 và E00012 ĐÃ chụp được</b> (ảnh trong <c>msgtbl-evidence/win/</c>, lượt
/// 2026-09-15 16:xx) khi fixture còn chạy trên bệnh nhân của <c>testsettings</c>. Sau khi
/// chuyển sang bệnh nhân SEED thì <b>gõ chữ không vào được ô 氏名（漢字）</b> nữa: F9 bung
/// 「患者データは、変更されていません。保存しますか？」 — tức app thấy form KHÔNG đổi gì.
///
/// <para><b>Nghi can</b>: 患者登録 có MỘT tab cho mỗi 枝番 (<c>tabMain</c>, mỗi tab một
/// user-control <c>InsurerInfo</c> riêng ⇒ NHIỀU control cùng tên <c>txtName</c>).
/// <c>Uia.RequireById</c> trả về cái ĐẦU TIÊN tìm thấy, rất có thể là tab đang ẩn. Bước
/// tiếp theo: chọn tab đang hiển thị trước, hoặc tìm <c>txtName</c> BÊN TRONG tab đang
/// chọn, rồi bỏ <c>[Explicit]</c>.</para>
///
/// <para>Cũng đừng tin <c>Uia.ValueOf</c> trên ô này: nó trả về NHÃN chứ không phải chữ
/// đang gõ (báo 「院長 休診」 kể cả sau 240 nhịp BackSpace). Bằng chứng đáng tin là HỘP
/// THOẠI bung ra.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY TRÊN BỆNH NHÂN SEED, KHÔNG PHẢI BỆNH NHÂN THẬT
/// ═══════════════════════════════════════════════════════════════════════════════
/// Fixture kế thừa <see cref="SeededPatientTestBase"/>: nó dựng một bệnh nhân MỚI
/// (<c>PAT_NO ≥ 990000</c>, clone từ một hồ sơ thật), trỏ <c>patient.patNo</c> sang đó,
/// và xoá sạch ở <c>OneTimeTearDown</c>.
///
/// <para>⚠️ <b>Đây là bài học trả giá bằng dữ liệu thật.</b> Bản đầu chạy thẳng trên bệnh
/// nhân của <c>testsettings</c>. Ngày 2026-09-15, một cú F9 rơi vào form đang mở sẵn của
/// bệnh nhân KHÁC (số 3) với 氏名 đã bị nối chuỗi — chuỗi đó tình cờ hợp lệ (có dấu cách,
/// dưới 100 byte) nên <c>chkInputDataMain</c> QUA và app GHI THẬT:
/// <c>INSURANCE.PAT_NM</c> thành 「院長　休テストカンジナマエ」 và <c>PAT_KN</c> bị chắp
/// thêm rác. Phải sửa tay bằng SQL. Với bệnh nhân seed thì cùng lỗi ấy chỉ làm bẩn một
/// hồ sơ dùng-một-lần, và nó bị xoá ngay sau lượt chạy.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÀ VẪN KHÔNG ĐỂ ĐƯỜNG NÀO GHI ĐƯỢC
/// ═══════════════════════════════════════════════════════════════════════════════
/// F9 trên màn này CÓ ghi thật nếu kiểm tra qua hết. Mọi ca ở đây cố ý làm hỏng đúng một
/// trường nên <c>chkInputDataMain</c> dừng tại chỗ và trả <c>false</c>. Thêm hai lớp nữa:
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
[Explicit("CHƯA chạy xanh trên bệnh nhân seed — xem 「VIỆC CÒN DỞ」 ở doc-comment")]
[Category("msgtbl-parity")]
[CancelAfter(900_000)]
public sealed class MsgTblPatientEntryTests : SeededPatientTestBase
{
    /// <summary>Fixture đứng ở 患者選択 — 患者登録 mở từ đó bằng 「F2 患者情報」 (frm203001.cs:331).</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    private const string PatEntryId = "frm201001";

    /// <summary>氏名（漢字） trong user-control <c>InsurerInfo</c> (InsurerInfo.cs:648).</summary>
    private const string NameBoxId = "txtName";

    /// <summary>診療開始日 (InsurerInfo.cs: errorItem.med_start_dt → dtMedStart).</summary>
    private const string MedStartDateId = "dtMedStart";

    /// <summary>患者情報有効日 (errorItem.br_dt → dtBr).</summary>
    private const string BranchDateId = "dtBr";

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

    /// <summary>
    /// Base đã lo cờ <c>testPatient.allowSeed</c>; ở đây chỉ kiểm thêm MSGTBL.
    /// </summary>
    protected override string? SeededFixtureSkipReason()
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
            SetName(_nameBefore);
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
            SetName(_nameBefore);
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
            SetName(_nameBefore);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCE3 — Q00009 (診療開始日 trống)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCE3 — Q00009「診療開始日」: ô trống thì F9 hỏi có lấy ngày hôm nay không")]
    public void TCE3_Q00009_EmptyTreatmentStartDate()
    {
        var expected = _msg.Render("Q00009", "診療開始日");
        var web = WebMsgSnapshot.Render("Q00009", "診療開始日");

        DrainDialogs("trước TCE3");
        var saved = ClearDate(MedStartDateId, "診療開始日");
        try
        {
            var box = PressF9AndRequireDialog("Q00009 sau khi xoá 診療開始日",
                                              "Q00009 frm201001 F9 med-start-trong");
            LogKq("Q00009", $"WinForm: {Txt.Vis(box.Raw)}");
            Log($"   MSGTBL: {Txt.Vis(expected)}   |   web: {Txt.Vis(web)}");

            try
            {
                Assert.Multiple(() =>
                {
                    Assert.That(box.Raw, Is.EqualTo(expected),
                        "med_st_dt rỗng ⇒ ShowOKCancelMsg(\"Q00009\", \"診療開始日\") " +
                        "(frm201001.cs:2324).");
                    Assert.That(box.Raw, Is.EqualTo(web),
                        $"…và phải TRÙNG KHÍT literal bản web ({WebMsgSnapshot.SourceFile}).");
                    Assert.That(MsgBoxWin32.ButtonCaptions(box.Hwnd),
                        Is.EquivalentTo(new[] { "OK", "Cancel" }),
                        "ShowOKCancelMsg ⇒ hai nút (F16: nhãn theo ngôn ngữ Windows).");
                });
            }
            finally
            {
                // HUỶ: trả lời OK là app TỰ ĐIỀN ngày hôm nay vào ô rồi đi tiếp chuỗi kiểm
                // tra — và nếu qua hết thì F9 GHI THẬT (frm201001.cs:2326).
                CancelDialog(box);

                // Sau Cancel, app bung tiếp E00001「診療開始日」 rồi return false — dẹp nốt.
                DrainDialogs("sau khi huỷ Q00009");
            }
        }
        finally
        {
            RestoreDate(MedStartDateId, saved, "診療開始日");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCE4 — Q00010 (患者情報有効日 trống)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TCE4 — Q00010「患者情報有効日」: ô trống thì F9 hỏi có lấy 診療開始日 không")]
    public void TCE4_Q00010_EmptyPatientInfoValidDate()
    {
        var expected = _msg.Render("Q00010", "患者情報有効日");
        var web = WebMsgSnapshot.Render("Q00010", "患者情報有効日");

        // CHỈ xoá 患者情報有効日, GIỮ 診療開始日 — cổng Q00009「診療開始日」 đứng TRƯỚC
        // (frm201001.cs:2322 vs :2337), xoá cả hai thì không bao giờ tới được Q00010.
        DrainDialogs("trước TCE4");
        var saved = ClearDate(BranchDateId, "患者情報有効日");
        try
        {
            var box = PressF9AndRequireDialog("Q00010 sau khi xoá 患者情報有効日",
                                              "Q00010 frm201001 F9 br-dt-trong");
            LogKq("Q00010", $"WinForm: {Txt.Vis(box.Raw)}");
            Log($"   MSGTBL: {Txt.Vis(expected)}   |   web: {Txt.Vis(web)}");

            try
            {
                Assert.Multiple(() =>
                {
                    Assert.That(box.Raw, Is.Not.EqualTo(_msg.Render("Q00009", "診療開始日")),
                        "bung Q00009「診療開始日」 nghĩa là ô 診療開始日 cũng đang trống — cổng đó " +
                        "đứng TRƯỚC, sửa dữ liệu test chứ đừng sửa assert.");

                    Assert.That(box.Raw, Is.EqualTo(expected),
                        "br_dt rỗng ⇒ ShowOKCancelMsg(\"Q00010\", \"患者情報有効日\") " +
                        "(frm201001.cs:2339).");
                    Assert.That(box.Raw, Is.EqualTo(web),
                        $"…và phải TRÙNG KHÍT literal bản web ({WebMsgSnapshot.SourceFile}).");
                });
            }
            finally
            {
                // HUỶ ⇒ app hỏi tiếp Q00009「患者情報有効日」 (frm201001.cs:2349) — chụp luôn,
                // đây là chỗ DUY NHẤT mã Q00009 xuất hiện với nhãn 「患者情報有効日」.
                CancelDialog(box);

                var second = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
                if (second is not null)
                {
                    var shot = MsgEvidence.Capture(second, "Q00009 frm201001 F9 br-dt-trong-lan2",
                                                   _msg.Template("Q00009"),
                                                   Txt.N(App.Automation.FocusedElement()?.Name));
                    LogKq("Q00009#2", $"WinForm: {Txt.Vis(second.Raw)}  (ảnh: {shot ?? "—"})");

                    Assert.That(second.Raw, Is.EqualTo(_msg.Render("Q00009", "患者情報有効日")),
                        "huỷ Q00010 ⇒ app hỏi tiếp Q00009 với nhãn 「患者情報有効日」 " +
                        "(frm201001.cs:2349).");

                    CancelDialog(second);
                }

                DrainDialogs("sau khi huỷ Q00010/Q00009");
            }
        }
        finally
        {
            RestoreDate(BranchDateId, saved, "患者情報有効日");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Ba ô của một <c>CustomDate</c>: 年 / 月 / 日.</summary>
    private sealed record DateParts(string Year, string Month, string Day);

    /// <summary>
    /// Xoá rỗng một ô ngày <c>CustomDate</c> và trả lại giá trị CŨ để khôi phục.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// XOÁ XONG PHẢI DỜI FOCUS
    /// ═══════════════════════════════════════════════════════════════════════════
    /// <c>CustomDate</c> chỉ dựng lại <c>SelDate</c> trong <c>CustomDate_Leave</c>
    /// (CustomDate.cs:692-710). Ba ô con trên màn hình trống ngay sau khi xoá, nhưng
    /// <c>ins.med_st_dt</c> mà <c>chkInputDataMain</c> đọc vẫn là ngày CŨ cho tới khi
    /// control mất focus — F9 khi ấy sẽ KHÔNG hỏi gì và ca test kết luận ngược.
    /// </summary>
    private DateParts ClearDate(string dateControlId, string what)
    {
        var date = KarteAutoCalcDialog.FindChromeIdOrName(_patEntry, dateControlId, what)
                   ?? throw new InvalidOperationException(
                          $"không thấy ô ngày 「{what}」 ({dateControlId}) trên 患者登録.");

        var saved = new DateParts(ReadPart(date, "txtYear"), ReadPart(date, "txtMonth"), ReadPart(date, "txtDay"));
        Log($"   {what} nguyên trạng: {saved.Year}/{saved.Month}/{saved.Day}");

        foreach (var part in new[] { "txtYear", "txtMonth", "txtDay" }) WritePart(date, part, "");

        // Dời focus để CustomDate_Leave chạy.
        Keyboard.Press(VirtualKeyShort.TAB);
        Waits.Step();
        return saved;
    }

    private void RestoreDate(string dateControlId, DateParts saved, string what)
    {
        try
        {
            var date = KarteAutoCalcDialog.FindChromeIdOrName(_patEntry, dateControlId, what);
            if (date is null) { Log($"   ⚠ không tìm lại được ô 「{what}」 để khôi phục."); return; }

            WritePart(date, "txtYear", saved.Year);
            WritePart(date, "txtMonth", saved.Month);
            WritePart(date, "txtDay", saved.Day);
            Keyboard.Press(VirtualKeyShort.TAB);
            Waits.Step();
            Log($"   đã trả {what} về {saved.Year}/{saved.Month}/{saved.Day} (KHÔNG bấm F9 ⇒ không ghi).");
        }
        catch (Exception e) { Log($"   ⚠ không khôi phục được 「{what}」: {e.Message}"); }
    }

    private static string ReadPart(AutomationElement date, string id)
    {
        var box = KarteAutoCalcDialog.FindChromeIdOrName(date, id, id);
        return box is null ? "" : Txt.N(Uia.ValueOf(box));
    }

    /// <summary>Ghi một ô con của CustomDate: double-click bôi đen rồi gõ đè (hoặc Delete nếu rỗng).</summary>
    private static void WritePart(AutomationElement date, string id, string value)
    {
        var box = KarteAutoCalcDialog.FindChromeIdOrName(date, id, id);
        if (box is null) return;

        var (x, y) = Uia.Center(box);
        if (x <= 0 && y <= 0) return;

        Mouse.MoveTo(x, y);
        Mouse.DoubleClick(MouseButton.Left);
        Waits.Step();

        if (value.Length == 0) Keyboard.Press(VirtualKeyShort.DELETE);
        else Keyboard.Type(value);
    }

    private void CancelDialog(MsgBoxWin32.Found box)
    {
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "キャンセル", "Cancel", "いいえ", "No"))
            throw new InvalidOperationException(
                $"KHÔNG bấm được nút huỷ trên {box}. Nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)) +
                ". Dừng lại thay vì bấm bừa — OK ở đây là app tự điền ngày rồi đi tiếp.");

        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
    }

    private Window OpenPatientEntry()
    {
        // KHÔNG dùng lại cửa sổ đang mở sẵn.
        //
        // App dùng chung một phiên giữa các lượt chạy (attachIfRunning), nên frm201001 có
        // thể đang mở cho một bệnh nhân KHÁC — lượt 17:47 nó đang là 「院長 休診」 (bệnh
        // nhân 3) trong khi fixture tưởng mình đang ở bệnh nhân của testsettings. Hệ quả:
        // 氏名 nguyên trạng đọc ra sai, ca test sửa nhầm hồ sơ người khác, và F9 bung
        // 「患者データは、変更されています。保存しますか？」 thay vì mã đang đo.
        //
        // Đóng rồi mở lại từ 患者選択 thì luôn đúng bệnh nhân. Trả lời 「いいえ」 cho câu hỏi
        // lưu — KHÔNG lưu thứ gì mà lượt trước để lại dở.
        var already = App.Window(PatEntryId);
        if (already is not null)
        {
            Log("frm201001 đang mở sẵn (có thể của bệnh nhân khác) — đóng rồi mở lại.");
            ClickBarButton(already, "btnF10", "戻る");
            Waits.Step();
            DrainDialogs("khi đóng 患者登録 cũ");
            Waits.TryUntil(() => App.Window(PatEntryId) is null, TimeSpan.FromSeconds(10));
        }

        var patNoBox = Uia.ById(_patSelect, Settings.Locator("patSelPatNo"))
                       ?? throw new InvalidOperationException("không thấy ô 患者番号 trên 患者選択.");
        Uia.SetText(patNoBox, PatNo.ToString());

        ClickBarButton(_patSelect, "btnF2", "患者情報");

        return Waits.TryFor(() => App.Window(PatEntryId), TimeSpan.FromSeconds(20))
               ?? throw new TimeoutException(
                      $"bấm 「F2 患者情報」 rồi nhưng {PatEntryId} không mở sau 20s. MỞ ẢNH trong " +
                      "artifacts/screenshots ra xem trước khi chạy lại (F1/F2).");
    }

    /// <summary>
    /// Đặt 氏名（漢字）: XOÁ SẠCH bằng END + BackSpace rồi mới gõ.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO KHÔNG DÙNG Uia.SetText
    /// ═══════════════════════════════════════════════════════════════════════════
    /// <c>Uia.SetText</c> chọn-rồi-xoá bằng <c>Ctrl+A</c> + <c>Delete</c>, mà WinForms
    /// TextBox KHÔNG nhận Ctrl+A làm 全選択 (quirk cũ — <c>PatientSelectScreen</c> đã ghi
    /// lại từ 2026-08-27). Hệ quả: chữ mới NỐI vào chữ cũ.
    ///
    /// <para>TCE1/TCE2 vẫn xanh với nó, nhưng xanh NHỜ MAY: chuỗi nối vẫn thiếu dấu cách
    /// (E00010) và vẫn quá 100 byte (E00012). Cái giá trả ở ca SAU — ô để lại nửa giác lẫn
    /// toàn giác, và F9 của TCE3 bung <b>E00011</b>「全角／半角文字が混在しています」, một
    /// hộp thoại chỉ có nút OK nên không huỷ được (đo 17:47 và 17:52).</para>
    ///
    /// <para>Double-click cũng sai ở ô này: nó chỉ chọn MỘT TỪ, nên tên có dấu cách
    /// 「院長 休診」 chỉ bị thay chữ cuối.</para>
    /// </summary>
    private AutomationElement SetName(string value)
    {
        var box = Uia.RequireById(_patEntry, NameBoxId);

        // Focus() chứ KHÔNG click vật lý.
        //
        // Uia.SetText (vốn dùng Focus) đưa được phím tới ô này — TCE1/TCE2 từng xanh nhờ
        // nó. Click vật lý thì KHÔNG: lượt 18:0x, 4 lượt × 60 BackSpace mà ô vẫn nguyên
        // 「院長 休診」, tức không một phím nào tới nơi. Giữ Focus của SetText, chỉ thay
        // phần XOÁ (Ctrl+A không ăn trên WinForms TextBox).
        box.Focus();
        Thread.Sleep(80);

        // ⚠️ KHÔNG gate vào việc đọc lại ô này.
        //
        // Uia.ValueOf trên control này trả về NHÃN chứ không phải chữ đang gõ: nó báo
        // 「院長 休診」 kể cả sau 240 nhịp BackSpace, trong khi chính lượt đó E00010 vẫn bung
        // đúng — tức chữ CÓ vào. Bản trước dựng guard 「xoá tới khi đọc ra rỗng」 và guard
        // ấy chặn nhầm một thao tác đang chạy đúng, làm đỏ cả bốn ca (18:0x).
        //
        // Bằng chứng thật là HỘP THOẠI bung ra: mỗi ca đã có assert rằng mã hiện lên đúng
        // là mã nó đo, và TCE2 còn chặn riêng E00010/E00011 — sai trạng thái ô là đỏ ở đó,
        // không cần đoán qua một phép đọc không đáng tin.
        Keyboard.Press(VirtualKeyShort.END);
        for (var i = 0; i < 80; i++) Keyboard.Press(VirtualKeyShort.BACK);
        Waits.Step();

        if (value.Length > 0)
        {
            Keyboard.Type(value);
            Waits.Step();
        }

        Log($"   氏名 sau khi đặt: ô đọc ra 「{Txt.N(Uia.ValueOf(box))}」 " +
            "(phép đọc này KHÔNG đáng tin — xem doc-comment)");
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
            // 「いいえ」/「キャンセル」 TRƯỚC, OK là đường cuối: câu hay gặp ở đây là
            // 「患者データは、変更されています。保存しますか？」 — trả lời OK/はい là GHI THẬT.
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
