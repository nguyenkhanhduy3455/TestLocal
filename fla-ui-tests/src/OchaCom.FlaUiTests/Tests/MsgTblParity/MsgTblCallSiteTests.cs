using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
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
/// THỨ TỰ CHẠY CÓ Ý NGHĨA
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>TCC3</c>/<c>TCC4</c> (gõ 患者番号) chạy TRƯỚC <c>TCC1</c>/<c>TCC2</c>.
///
/// <para>Vì <c>TCC2</c> bấm 「F3 当月来患」 để mở 来患集計, và cú đó đổi luôn CHẾ ĐỘ XEM của
/// 患者選択 sang danh sách 受付患者: lưới có dòng, một dòng được chọn, và ô 患者番号 bị
/// RÀNG BUỘC vào dòng đó — gõ gì vào cũng bị đẩy về số của dòng. Đo 2026-09-15: TCC3 chạy
/// sau TCC2 thì ô giữ nguyên 「3」 qua cả BackSpace lẫn gõ từng ký tự, và ảnh chụp lúc đỏ
/// cho thấy dòng 患者番号 3 đang sáng xanh trong lưới.</para>
///
/// <para>Cùng một nguyên nhân với ca <c>Tc2</c> đang đỏ của <c>PatientSelectAssign</c>
/// (「còn 「3」 sau 5 lượt BackSpace」) — không phải lỗi gõ phím.</para>
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

    /// <summary>Số bệnh nhân KHÔNG tồn tại — nằm trong vùng test nên không đụng dữ liệu thật.</summary>
    private const string UnknownPatNo = "990001";

    private MsgTblOracle _msg = null!;
    private PatientProbeDb? _db;
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
    public void CallSiteOneTimeSetUp()
    {
        _db = PatientProbeDb.CreateOrNull(Settings);
        _patSelect = AppNavigator.OpenPatientSelect(App, Settings);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC1 — Q00049 (F7 会計作成)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCC1 — Q00049: WinForm cảnh báo GHI ĐÈ và mặc định Cancel; bản web bỏ cả hai")]
    public void TCC1_Q00049_BulkAccounting_WarnsAboutOverwrite()
    {
        var template = _msg.Template("Q00049")
                       ?? throw new InvalidOperationException("MSGTBL không có row Q00049.");
        var webTemplate = WebMsgSnapshot.Template("Q00049")!;

        DrainDialogs("trước TCC1");
        ClickBarButton(_patSelect, "btnF7", "会計作成");

        var box = RequireDialog("Q00049 sau khi bấm 「F7 会計作成」",
                                "Q00049 frm203001 F7 kaikei-sakusei");
        var buttons = MsgBoxWin32.ButtonCaptions(box.Hwnd);
        var defaultButton = FocusedName();

        LogKq(1, $"WinForm hiện: {Txt.Vis(box.Raw)}");
        Log($"   row MSGTBL    : {Txt.Vis(template)}");
        Log($"   literal web   : {Txt.Vis(webTemplate)}");
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

                // Trước ce245472d bản web cắt mất 「一括」 và trọn câu cảnh báo ghi đè.
                // Nay phải trùng khít với cùng tham số.
                Assert.That(box.Raw, Is.EqualTo(WebMsgSnapshot.Render("Q00049", box.Raw[..^suffix.Length])),
                    $"chữ WinForm và literal web phải TRÙNG KHÍT ({WebMsgSnapshot.SourceFile}). " +
                    "Lệch lại ⇒ hồi quy của bản sửa ce245472d.");

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

    [Test, Order(4)]
    [Description("TCC2 — Q00039: WinForm nói 「プリンタに」 và CÓ nhận tham số; bản web bỏ cả hai")]
    public void TCC2_Q00039_PrintPrompt_NamesThePrinter()
    {
        var template = _msg.Template("Q00039")
                       ?? throw new InvalidOperationException("MSGTBL không có row Q00039.");
        var web = WebMsgSnapshot.Render("Q00039", PrinterParam);
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

                    // Trước ce245472d web khai 0 tham số và cắt cụm 「プリンタに」.
                    Assert.That(box.Raw, Is.EqualTo(web),
                        $"chữ WinForm và literal web (render với cùng tham số 「{PrinterParam}」) phải " +
                        $"TRÙNG KHÍT ({WebMsgSnapshot.SourceFile}). Lệch lại ⇒ hồi quy.");

                    Assert.That(WebMsgSnapshot.Matching.First(m => m.Code == "Q00039").Arity,
                        Is.GreaterThan(0),
                        "row Q00039 CÓ {0} ⇒ chữ ký bên web phải nhận tham số — xem TCM4.");

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
    // TCC3 — E00005 (患者番号 không tồn tại)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCC3 — E00005: 患者確定 với số bệnh nhân không tồn tại (không chạm DB)")]
    public void TCC3_E00005_UnknownPatientNumber()
    {
        var expected = _msg.Render("E00005", "患者情報");
        var web = WebMsgSnapshot.Render("E00005", "患者情報");

        DrainDialogs("trước TCC3");

        // ĐỔI VỀ CHẾ ĐỘ 患者検索 TRƯỚC KHI GÕ.
        //
        // Ở chế độ 受付一覧 / 当月来患, ô 患者番号 bị RÀNG BUỘC vào dòng đang chọn của lưới:
        // gõ gì vào cũng bị đẩy về số của dòng. Ảnh lúc đỏ (16:45) cho thấy ô giữ 「3」 và
        // dòng 患者番号 3 đang sáng xanh trong lưới 受付患者一覧. Cùng nguyên nhân với ca
        // Tc2 đang đỏ của PatientSelectAssign.
        //
        // App dùng chung một phiên giữa các lượt chạy (attachIfRunning), nên chế độ xem là
        // thứ lượt TRƯỚC để lại — không thể dựa vào thứ tự testcase trong fixture.
        ClickBarButton(_patSelect, "btnF1", "患者検索");
        Waits.Step();

        SetPatNo(UnknownPatNo);
        Uia.SendKey(Vk.End);          // 患者確定 (frm203001 — End hoặc F9)

        var box = RequireDialog($"E00005 sau khi 患者確定 với số {UnknownPatNo}",
                                "E00005 frm203001 patno-khong-ton-tai");
        LogKq(3, $"WinForm: {Txt.Vis(box.Raw)}");
        Log($"   MSGTBL: {Txt.Vis(expected)}   |   web: {Txt.Vis(web)}");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(box.Raw, Is.EqualTo(expected),
                    "getLastPatInfo trả null ⇒ ShowWarningMsg(\"E00005\", \"患者情報\") " +
                    "(frm203001.cs:672).");
                Assert.That(box.Raw, Is.EqualTo(web),
                    $"…và phải TRÙNG KHÍT literal bản web ({WebMsgSnapshot.SourceFile}).");
            });
        }
        finally
        {
            DismissOk(box);
            SetPatNo(Settings.Patient.PatNo);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC4 — E00027 (không nguồn nào cho 担当医)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCC4 — E00027: bệnh nhân không có att_dr và combo Ｄｒ．trống")]
    public void TCC4_E00027_NoDoctorSource()
    {
        var patNo = _db?.FindPatientWithoutDoctor();
        if (patNo is null)
            Assert.Ignore("dataset không có bệnh nhân nào att_dr ≤ 0 — không dựng được nhánh này.");

        var expected = _msg.Render("E00027", "ドクター");
        var web = WebMsgSnapshot.Render("E00027", "ドクター");

        DrainDialogs("trước TCC4");
        ClearDoctorCombo();
        SetPatNo(patNo!.Value.ToString());
        Uia.SendKey(Vk.End);

        var box = RequireDialog($"E00027 sau khi 患者確定 với bệnh nhân {patNo} (att_dr ≤ 0)",
                                "E00027 frm203001 khong-co-tan-dr");
        LogKq(4, $"WinForm: {Txt.Vis(box.Raw)}");
        Log($"   MSGTBL: {Txt.Vis(expected)}   |   web: {Txt.Vis(web)}");

        try
        {
            Assert.Multiple(() =>
            {
                // Lưu ý nhãn là 「ドクター」 chứ KHÔNG phải 「Ｄｒ．」 (frm203001.cs:707).
                Assert.That(box.Raw, Is.EqualTo(expected),
                    "UserNo ≤ 0 ⇒ ShowWarningMsg(\"E00027\", \"ドクター\") (frm203001.cs:707). " +
                    "Row E00027 có {0} XUẤT HIỆN HAI LẦN nên câu nhắc 「ドクター」 hai lượt.");
                Assert.That(box.Raw, Is.EqualTo(web),
                    $"…và phải TRÙNG KHÍT literal bản web ({WebMsgSnapshot.SourceFile}).");
            });
        }
        finally
        {
            DismissOk(box);
            SetPatNo(Settings.Patient.PatNo);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng nhỏ dùng chung
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Đặt 患者番号 — click vật lý vào ô Edit BÊN TRONG combo rồi gõ TỪNG KÝ TỰ.
    ///
    /// <para>Không dùng <c>Uia.SetText</c> (nó mở đầu bằng <c>Focus()</c>, treo trên combo)
    /// và không gõ cả chuỗi một phát (autocomplete nuốt phím sau ký tự đầu). Hai bài học
    /// này trả giá ở TCR4 ngày 2026-09-15; fixture <c>PatientSelectAssign</c> chưa có
    /// chúng nên <c>Tc2</c> của nó đỏ với 「còn 「3」 sau 5 lượt BackSpace」.</para>
    /// </summary>
    private void SetPatNo(string value)
    {
        var combo = Uia.RequireById(_patSelect, Settings.Locator("patSelPatNo"));
        var edit = Uia.EditInside(combo);
        var (x, y) = Uia.Center(edit);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();

        Keyboard.Press(VirtualKeyShort.END);
        for (var i = 0; i < 20; i++) Keyboard.Press(VirtualKeyShort.BACK);
        Waits.Step();

        foreach (var ch in value)
        {
            Keyboard.Type(ch.ToString());
            Thread.Sleep(70);
        }
        Waits.Step();

        // ĐỌC CẢ HAI, vì hai loại combo của app trả lời ngược nhau:
        //  · 発行済呼出し (frm203053): ComboBox.Value đúng, ô Edit bên trong trả về NHÃN
        //  · 患者番号 (frm203001):     ComboBox.Value trả về MỤC ĐANG CHỌN (vd 「3」),
        //                              chữ vừa gõ nằm ở ô Edit bên trong
        //
        // defData đọc cboPatNo.Text (frm203001.cs:645) — tức phần EDIT. Nên chỉ cần một
        // trong hai khớp là chữ đã tới đúng chỗ app sẽ đọc.
        var fromEdit = Txt.N(Uia.ValueOf(edit));
        var fromCombo = Txt.N(Uia.ValueOf(combo));
        var want = Txt.N(value);

        if (fromEdit == want || fromCombo == want) return;

        throw new InvalidOperationException(
            $"gõ 患者番号 「{value}」 nhưng ô Edit đang giữ 「{fromEdit}」 và combo giữ " +
            $"「{fromCombo}」. Dừng lại thay vì 患者確定: số sai thì mã bung ra cũng sai.");
    }

    /// <summary>Đưa combo Ｄｒ．về mục rỗng (index 0) để ép nhánh UserNo ≤ 0.</summary>
    private void ClearDoctorCombo()
    {
        var combo = Uia.ById(_patSelect, Settings.Locator("patSelDr"));
        if (combo is null) return;

        var (x, y) = Uia.Center(combo);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
        Keyboard.TypeSimultaneously(VirtualKeyShort.ALT, VirtualKeyShort.DOWN);
        Thread.Sleep(300);
        Keyboard.Press(VirtualKeyShort.HOME);
        Thread.Sleep(150);
        Keyboard.Press(VirtualKeyShort.ENTER);
        Waits.Step();
        Log($"   combo Ｄｒ．nay là 「{Txt.N(Uia.ValueOf(combo))}」");
    }

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
            var shot = MsgEvidence.Capture(box, evidenceLabel, _msg.Template(code), FocusedName());
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
    /// <summary>Đóng hộp thoại CHỈ CÓ nút OK (E00005 / E00027) và đợi nó biến mất.</summary>
    private void DismissOk(MsgBoxWin32.Found box)
    {
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes"))
            throw new InvalidOperationException(
                $"không bấm được nút nào trên {box}. Nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)));

        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
    }

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
