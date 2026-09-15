using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// Vế WinForm của <c>web-tenant-tests/tests/dialogs-management/referral-letter-msgtbl-parity.spec.ts</c>
/// — màn <b>紹介状</b> (<c>frm203053</c>, Shift+F3 từ 診療入力).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐỌC SOURCE XONG THÌ CÂU HỎI ĐẢO NGƯỢC
/// ═══════════════════════════════════════════════════════════════════════════════
/// Spec bên web phủ 5 mã: <c>Q00002</c> → <c>I00001</c> (lưu), <c>Q00003</c> →
/// <c>I00003</c> (xoá), và <c>E00001</c>. Nhưng <c>frm203053</c> chỉ phát <b>bốn</b> mã,
/// và <b>không</b> có bốn mã kia:
///
/// <code>
///   E00001  :157 / :177   ShowErrorMsg("E00001", "発行済呼出し")   — combo rỗng khi F2/F3
///   E00022  :663..:699    ShowErrorMsg("E00022", &lt;tên trường&gt;)   — 7 chỗ, trong chkInputData
///   Q00019  :192          ShowOKCancelMsg("Q00019")               — xác nhận IN
///   E00026  :556          ShowErrorMsg("E00026", "印刷")           — in hỏng
///
///   F2 登録 :148-155      insertTemplatedata → makeTemplateCombo   — KHÔNG hỏi, KHÔNG báo
///   F3 削除 :168-174      deleteTemplatedata → makeTemplateCombo   — KHÔNG hỏi, KHÔNG báo
/// </code>
///
/// <para>Nghĩa là <c>Q00002/I00001/Q00003/I00003</c> ở bản web không phải 「bốn hộp thoại
/// sai chữ」 mà là <b>bốn hộp thoại WinForm không có</b>. Cuộc điều tra I00002→I00003 vì
/// thế trả lời đúng câu hỏi nhỏ (mã nào hợp với nhánh xoá) nhưng bỏ lỡ câu lớn: ở chính
/// màn này, WinForm im lặng.</para>
///
/// <para>「Không có hộp thoại」 là một khẳng định PHỦ ĐỊNH — phải nhìn mới tin, nên
/// <c>TCR4</c> lưu thật rồi xoá thật và quan sát sự im lặng đó.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// TCR1–TCR3 <b>không ghi gì</b>:
/// <list type="bullet">
///   <item><description>E00001 dừng trước khi chạm DB;</description></item>
///   <item><description>E00022 bung từ <c>chkInputData</c>, hàm này chạy TRƯỚC
///     <c>insertTemplatedata</c> (:148) và trước cả <c>Q00019</c> (:190);</description></item>
///   <item><description>Q00019 trả lời 「キャンセル」 ⇒ <c>printProc()</c> không chạy.</description></item>
/// </list>
///
/// <para>TCR4 GHI THẬT, nên nó đứng sau cờ riêng <c>referral.allowSave</c> và dọn hai
/// tầng (F22): xoá bằng chính F3 của app (đó là thứ đang đo), rồi
/// <c>OneTimeTearDown</c> vét lại bằng SQL theo TÊN — vì ca này đỏ đúng vào lúc F3 không
/// xoá được.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ 200 LÀ BYTE, KHÔNG PHẢI KÝ TỰ
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>textBox3</c> có <c>MaxLength = 200</c> <b>ký tự</b>, còn <c>chkInputData</c> so
/// <c>ComLibrary.LenB &gt; 200</c> <b>byte</b>. Nhồi 201 chữ <c>'A'</c> thì bị cắt còn
/// đúng 200 ⇒ kiểm tra QUA ⇒ app GHI THẬT (đã mất một dòng như vậy ngày 2026-09-15).
/// 101 chữ 「あ」 mới đúng: 101 ký tự lọt MaxLength, 202 byte vượt trần.
/// </summary>
[TestFixture]
[NonParallelizable]
[Category("msgtbl-parity")]
[CancelAfter(900_000)]
public sealed class MsgTblReferralTests : UiTestBase
{
    private const string ReferralId = "frm203053";
    private const string ReferralTitle = "紹介状";
    private const string ShiftToggleId = "btnShift";

    /// <summary>発行済呼出し — tên template (frm203053.cs:146).</summary>
    private const string TemplateComboId = "comboBox2";

    /// <summary>宛名, trần 200 BYTE (frm203053.cs:661).</summary>
    private const string AtenaBoxId = "textBox3";

    /// <summary>101 chữ toàn giác = 202 byte CP932 — xem ghi chú ở doc-comment lớp.</summary>
    private static readonly string TooLongAtena = new('あ', 101);

    private MsgTblOracle _msg = null!;
    private ReferralTemplateDb? _db;
    private Window _referral = null!;

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
    public void ReferralOneTimeSetUp()
    {
        _db = ReferralTemplateDb.CreateOrNull(Settings, Settings.Referral.AllowSave);

        DrainBlockingDialogs("trước khi mở 紹介状");
        _referral = OpenReferral();
    }

    /// <summary>
    /// Hàng rào thứ hai (F22): vét dòng test bằng SQL, KHÔNG nhờ giao diện.
    ///
    /// <para>TCR4 đo chính cú F3 削除, nên nó không được coi F3 là đường dọn — ca đó đỏ
    /// đúng vào lúc F3 hỏng, và khi ấy dòng rác nằm lại vĩnh viễn.</para>
    /// </summary>
    [OneTimeTearDown]
    public void ReferralOneTimeTearDown()
    {
        if (_db is null || !Settings.Referral.AllowSave) return;
        try
        {
            var dropped = _db.DropTestRows();
            Log($"dọn SHOUKAI_TMP: xoá {dropped} dòng 「{ReferralTemplateDb.TestTemplateName}」; " +
                $"còn lại {_db.CountAllRows()} dòng của người khác (không đụng tới).");
        }
        catch (Exception e) { Log($"⚠ KHÔNG dọn được SHOUKAI_TMP: {e.Message}"); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCR1 — E00001
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCR1 — E00001: F3 削除 với ô 発行済呼出し rỗng (không chạm DB)")]
    public void TCR1_E00001_EmptyTemplateName_BlocksDelete()
    {
        var expected = _msg.Render("E00001", "発行済呼出し");

        ClearTemplateName();
        ClickBarButton(_referral, "btnF3", "削除");

        var box = RequireDialog("E00001 sau khi bấm F3 với ô 発行済呼出し rỗng",
                                "E00001 frm203053 F3 combo-rong");
        LogKq("E00001", $"WinForm: {Txt.Vis(box.Raw)}  |  MSGTBL: {Txt.Vis(expected)}");

        try
        {
            Assert.That(box.Raw, Is.EqualTo(expected),
                "F3 với ô 発行済呼出し rỗng phải bung E00001 đã render với nhãn 「発行済呼出し」 " +
                "(frm203053.cs:177). Lệch ⇒ hoặc mã khác, hoặc nhãn khác.");
        }
        finally { DismissOk(box); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCR2 — E00022 (mã ĐANG LỆCH so với bản web)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCR2 — E00022: 宛名 vượt 200 BYTE. WinForm nói 文字数が越えています, web nói 桁数が長すぎます")]
    public void TCR2_E00022_AtenaOverByteLimit_DiffersFromWeb()
    {
        var expected = _msg.Render("E00022", "宛名");
        var web = WebMsgSnapshot.Diverging.Single(d => d.Code == "E00022")
                                .WebTemplate.Replace("{0}", "宛名", StringComparison.Ordinal);

        var atena = Uia.RequireById(_referral, AtenaBoxId);
        var before = Uia.ValueOf(atena);
        Uia.SetText(atena, TooLongAtena);

        // F9 chứ không F2: F9 gọi chkInputData TRƯỚC mọi thứ (frm203053.cs:190) nên kiểm
        // tra hỏng là dừng hẳn — không chạm DB, không chạm máy in. F2 thì ngược lại, kiểm
        // tra QUA là ghi ngay.
        ClickBarButton(_referral, "btnF9", "印刷");

        var box = RequireDialog("E00022 sau khi đặt 宛名 dài 202 byte rồi F9",
                                "E00022 frm203053 atena 202byte");
        LogKq("E00022", $"WinForm: {Txt.Vis(box.Raw)}");
        Log($"   MSGTBL render: {Txt.Vis(expected)}");
        Log($"   literal web  : {Txt.Vis(web)}");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(box.Raw, Is.EqualTo(expected),
                    "WinForm phải hiện E00022 đã render với nhãn 「宛名」 (frm203053.cs:663).");

                Assert.That(box.Raw, Does.Contain("文字数が越えています"),
                    "WinForm dùng 「文字数が越えています」 — đây là vế mà bản web viết lại thành " +
                    "「桁数が長すぎます」.");

                Assert.That(box.Raw, Is.Not.EqualTo(web),
                    "hai vế phải còn khác nhau — bằng nhau ⇒ web đã sửa xong, chuyển E00022 sang " +
                    $"WebMsgSnapshot.Matching ({WebMsgSnapshot.SourceFile}).");
            });
        }
        finally
        {
            DismissOk(box);
            Uia.SetText(atena, before);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCR3 — Q00019
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCR3 — Q00019: F9 印刷 với dữ liệu hợp lệ thì hỏi trước khi in (trả lời HUỶ)")]
    public void TCR3_Q00019_PrintConfirm_MatchesTable()
    {
        var expected = _msg.Render("Q00019");

        ClickBarButton(_referral, "btnF9", "印刷");

        var box = RequireDialog("Q00019 sau khi bấm F9 印刷", "Q00019 frm203053 F9 insatsu");
        var buttons = MsgBoxWin32.ButtonCaptions(box.Hwnd);
        LogKq("Q00019", $"WinForm: {Txt.Vis(box.Raw)}  nút: {string.Join(" / ", buttons)}");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(box.Raw, Is.EqualTo(expected),
                    "Q00019 không nhận tham số (frm203053.cs:192) nên câu phải đúng bằng row MSGTBL.");
                Assert.That(buttons, Is.EquivalentTo(new[] { "OK", "Cancel" }),
                    "ShowOKCancelMsg ⇒ hai nút; nhãn theo NGÔN NGỮ WINDOWS (F16).");
            });
        }
        finally
        {
            // KHÔNG dùng OK làm fallback: ở đây OK = IN THẬT.
            CancelDialog(box);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCR4 — WinForm IM LẶNG khi lưu và khi xoá (GHI DB)
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Ca này GHI THẬT, và đường đi tới lúc nó xanh để lại ba bài học đã nằm trong code:
    ///
    /// <list type="number">
    ///   <item><description><b>Gõ vào combo phải gõ TỪNG KÝ TỰ.</b>
    ///     <c>Keyboard.Type("ZZ-PARITY-TEST")</c> một phát chỉ vào được chữ 「Z」 đầu —
    ///     autocomplete bung danh sách và nuốt các phím sau. Guard đọc-lại trong
    ///     <see cref="SetTemplateName"/> chặn được cú F2 hỏng đó, nên không có dòng rác
    ///     nào bị ghi.</description></item>
    ///   <item><description><b>Chọn item phải chọn BẰNG PHÍM.</b> <c>item.Select()</c>
    ///     của UIA đổi chữ trên combo nhưng KHÔNG đổi <c>SelectedValue</c> — mà F3 xoá
    ///     theo đúng <c>SelectedValue</c> (frm203053.cs:172). Lượt 14:24: F3 chạy, không
    ///     báo lỗi, và xoá TRẮNG 0 dòng. May là xoá trượt chứ không xoá nhầm.</description></item>
    ///   <item><description><b>Treo thì đừng đọc <c>TestContext.Out</c>.</b> NUnit chỉ
    ///     xả stdout khi testcase KẾT THÚC, nên hai lượt treo đầu mù hoàn toàn. Ca này
    ///     dùng <see cref="TestTrace"/> — ghi thẳng ra <c>_trace.log</c> từng dòng, và
    ///     chính nó chỉ ra bước nào đang đứng.</description></item>
    /// </list>
    /// </summary>
    [Test, Order(4)]
    [Description("TCR4 — F2 登録 rồi F3 削除: WinForm KHÔNG hỏi và KHÔNG báo gì (GHI DB)")]
    public void TCR4_SaveThenDelete_ShowsNoDialogAtAll()
    {
        if (!Settings.Referral.AllowSave)
            Assert.Ignore("Cần referral.allowSave = true (hoặc OCHA_REFERRAL_ALLOW_SAVE=1) — " +
                          "ca này GHI THẬT một dòng SHOUKAI_TMP rồi xoá đi.");
        if (_db is null) Assert.Ignore("không tạo được ReferralTemplateDb.");

        using var trace = TestTrace.Begin();

        var before = trace.Do("dem dong truoc khi ghi", () => _db!.CountAllRows());
        Assert.That(_db.CountTestRows(), Is.Zero,
            $"phải sạch trước khi chạy: còn dòng 「{ReferralTemplateDb.TestTemplateName}」 " +
            "nghĩa là lượt trước chết giữa chừng và chưa được vét.");

        // ── Lưu ───────────────────────────────────────────────────────────────
        trace.Do("go ten template vao o 発行済呼出し",
                 () => SetTemplateName(ReferralTemplateDb.TestTemplateName, trace));
        trace.Do("bam F2 登録", () => ClickBarButton(_referral, "btnF2", "登録"));

        var afterSave = trace.Do("cho 3s xem co hop thoai nao khong",
                                 () => WaitForNoDialog("sau khi bấm F2 登録"));
        var savedRows = trace.Do("dem dong test sau khi luu", () => _db.CountTestRows());
        LogKq("F2", $"hộp thoại sau khi lưu: {afterSave}; SHOUKAI_TMP có {savedRows} dòng test");

        Assert.Multiple(() =>
        {
            Assert.That(savedRows, Is.EqualTo(1),
                "F2 phải ghi đúng một dòng — không ghi được thì phần còn lại của ca vô nghĩa.");
            Assert.That(afterSave, Is.Empty,
                "WinForm KHÔNG hỏi Q00002 và KHÔNG báo I00001 sau khi lưu: btnF2_Click gọi thẳng " +
                "insertTemplatedata rồi dựng lại combo (frm203053.cs:148-155). Bản web thêm cả hai " +
                "hộp thoại đó — đây là phần chênh KHÔNG phải chuyện câu chữ.");
        });

        // ── Xoá ───────────────────────────────────────────────────────────────
        trace.Do("chon template vua tao trong danh sach",
                 () => SelectTemplateName(ReferralTemplateDb.TestTemplateName, trace));
        trace.Do("bam F3 削除", () => ClickBarButton(_referral, "btnF3", "削除"));

        var afterDelete = trace.Do("cho 3s xem co hop thoai nao khong",
                                   () => WaitForNoDialog("sau khi bấm F3 削除"));
        var leftRows = trace.Do("dem dong test sau khi xoa", () => _db.CountTestRows());
        LogKq("F3", $"hộp thoại sau khi xoá: {afterDelete}; còn {leftRows} dòng test");

        Assert.Multiple(() =>
        {
            Assert.That(leftRows, Is.Zero, "F3 phải xoá đúng dòng vừa tạo.");
            Assert.That(afterDelete, Is.Empty,
                "WinForm KHÔNG hỏi Q00003 và KHÔNG báo I00003 sau khi xoá (frm203053.cs:168-174). " +
                "Chính vì màn này im lặng nên cuộc tranh luận I00002-hay-I00003 ở bản web không có " +
                "đối chứng WinForm nào để dựa vào.");
            Assert.That(_db.CountAllRows(), Is.EqualTo(before),
                "và không đụng vào dòng nào của người khác.");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Mở 紹介状 bằng DẢI PHÍM SHIFT, không bằng tổ hợp Shift+F3.
    ///
    /// <para><c>ShiftFlg</c> chỉ được đặt trong <c>BaseForm.editButtonPanel</c>, nên bấm
    /// <c>btnShift</c> rồi bấm nút mang chữ 「紹介状」 là đường không có chỗ cho nhầm lẫn —
    /// cùng cách mà <c>DrugPathBFlow</c> mở 薬剤選択.</para>
    /// </summary>
    private Window OpenReferral()
    {
        var already = App.Window(ReferralId)
                      ?? KarteAutoCalcDialog.FindDialogWindow(App, ReferralId, ReferralTitle, Screen.Window);
        if (already is not null) return already;

        var toggle = Uia.RequireById(Screen.Window, ShiftToggleId);
        if (!Txt.Has(Txt.N(Uia.NameOf(toggle)), "ON"))
        {
            Uia.MouseClick(toggle);
            Thread.Sleep(600);
        }

        var button = Uia.Descendants(Screen.Window).FirstOrDefault(
                         e => Uia.ControlTypeOf(e) == FlaUI.Core.Definitions.ControlType.Button &&
                              Txt.Has(Uia.NameOf(e), ReferralTitle))
                     ?? throw new InvalidOperationException(
                            "không thấy nút 「紹介状」 trên dải Shift của 診療入力.");

        Uia.MouseClick(button);

        return Waits.TryFor(
                   () => App.Window(ReferralId)
                         ?? KarteAutoCalcDialog.FindDialogWindow(App, ReferralId, ReferralTitle, Screen.Window),
                   TimeSpan.FromSeconds(15))
               ?? throw new TimeoutException(
                      "bấm 「紹介状」 rồi nhưng frm203053 không mở sau 15s. MỞ ẢNH trong " +
                      "artifacts/screenshots ra xem trước khi chạy lại (F1/F2).");
    }

    /// <summary>
    /// Gõ tên template vào ô EDIT bên trong combo, bằng BÀN PHÍM (F13), rồi ĐỌC LẠI.
    ///
    /// <para>Đọc lại trên chính <c>ComboBox</c> chứ không trên ô Edit: đo 2026-09-15,
    /// <c>Uia.ValueOf</c> trên ô Edit bên trong trả về NHÃN 「発行済呼出し」 chứ không phải
    /// chữ đang gõ, còn trên ComboBox thì đúng.</para>
    ///
    /// <para>Ném khi chữ không vào được — <b>quan trọng hơn nó nghe</b>: nếu ô rỗng mà cứ
    /// bấm F2 thì app rẽ sang nhánh E00001 và ca test báo 「không có hộp thoại nào」 sai
    /// hoàn toàn.</para>
    /// </summary>
    private void SetTemplateName(string value, TestTrace trace)
    {
        trace.Note($"tim combo 「{TemplateComboId}」");
        var combo = Uia.RequireById(_referral, TemplateComboId);

        // ⚠️ KHÔNG dùng Uia.SetText trên chính ComboBox.
        //
        // SetText mở đầu bằng `e.Focus()` (Uia.cs:139) — lời gọi UIA ĐỒNG BỘ vào tiến
        // trình app. Trên combo này nó KHÔNG BAO GIỜ TRẢ VỀ: lượt 13:37 đứng im 6 phút
        // rưỡi ở đúng dòng đó, log dừng ngay sau TCR3 và phải kill. Cùng họ với cái bẫy
        // F18 nói về InvokePattern.
        //
        // Đường an toàn: click CHUỘT VẬT LÝ vào ô Edit bên trong (không đi qua Focus),
        // rồi gõ TỪNG KÝ TỰ có nghỉ.
        //
        // Đo 2026-09-15: `Keyboard.Type("ZZ-PARITY-TEST")` chỉ vào được đúng chữ 「Z」 đầu.
        // Combo 発行済呼出し là DropDown có autocomplete — ký tự đầu bung danh sách gợi ý
        // và các phím sau bị danh sách đó nuốt. Gõ chậm từng ký tự thì mỗi phím rơi vào ô
        // text chứ không vào list.
        // Đo 2026-09-15: `Keyboard.Type("ZZ-PARITY-TEST")` một phát chỉ vào được chữ 「Z」
        // đầu — combo có autocomplete, ký tự đầu bung danh sách gợi ý và các phím sau bị
        // danh sách đó nuốt. Gõ chậm từng ký tự thì mỗi phím rơi vào ô text.
        trace.Note("tim o Edit ben trong combo");
        var edit = Uia.EditInside(combo);
        var (x, y) = Uia.Center(edit);
        trace.Note($"o 発行済呼出し o ({x},{y}) — click vat ly roi go tung ky tu");
        Uia.LeftClickPhysical(x, y);
        Waits.Step();

        Keyboard.Press(VirtualKeyShort.END);
        for (var i = 0; i < 60; i++) Keyboard.Press(VirtualKeyShort.BACK);
        Waits.Step();

        foreach (var ch in value)
        {
            Keyboard.Type(ch.ToString());
            Thread.Sleep(80);
        }
        Waits.Step();
        trace.Note($"go xong, combo dang giu 「{Txt.N(Uia.ValueOf(combo))}」");

        var actual = Txt.N(Uia.ValueOf(combo));
        if (actual == Txt.N(value)) return;

        // Ném chứ KHÔNG đi tiếp — quan trọng hơn nó nghe: ô rỗng thì F2 rẽ sang nhánh
        // E00001 và ca test kết luận NGƯỢC (「WinForm có báo」 trong khi nó đang báo
        // chuyện khác). Lần 13:34 chính guard này chặn được một cú F2 hỏng.
        throw new InvalidOperationException(
            $"gõ 「{value}」 vào ô 発行済呼出し nhưng combo đang giữ 「{actual}」. Dừng ở đây thay vì " +
            "bấm F2: ô rỗng thì F2 rẽ sang E00001 và ca test sẽ kết luận NGƯỢC.");
    }

    private void ClearTemplateName()
    {
        var combo = Uia.RequireById(_referral, TemplateComboId);
        var edit = Uia.EditInside(combo);
        var (x, y) = Uia.Center(edit);
        Uia.LeftClickPhysical(x, y);
        Keyboard.Press(VirtualKeyShort.END);
        for (var i = 0; i < 60; i++) Keyboard.Press(VirtualKeyShort.BACK);
        Waits.Step();
    }

    /// <summary>
    /// Chọn template theo TÊN trong danh sách thả xuống.
    ///
    /// <para>F3 xoá theo <c>comboBox2.SelectedValue</c> (frm203053.cs:172) chứ không theo
    /// chữ đang hiện — gõ tay thì <c>SelectedValue</c> vẫn là dòng cũ và app xoá NHẦM
    /// template của người khác. Phải chọn từ danh sách.</para>
    /// </summary>
    private void SelectTemplateName(string value, TestTrace trace)
    {
        var combo = Uia.RequireById(_referral, TemplateComboId);

        // ═══════════════════════════════════════════════════════════════════
        // CHỌN BẰNG BÀN PHÍM, KHÔNG BẰNG UIA SelectionItem
        // ═══════════════════════════════════════════════════════════════════
        // F3 xoá theo `comboBox2.SelectedValue` (frm203053.cs:172), KHÔNG theo chữ đang
        // hiện. Lượt 14:24 gọi `item.Select()` của UIA: chữ trên combo đổi đúng, F3 chạy
        // (không ra E00001, tức Text khác rỗng) — nhưng XOÁ TRẮNG 0 dòng. Nghĩa là
        // `SelectedValue` không hề đổi theo: UIA đặt selection ở tầng accessibility mà
        // không đi qua đường binding của WinForms.
        //
        // May là nó xoá trượt chứ không xoá NHẦM: tổng số dòng giữ nguyên 4 (3 của người
        // khác + 1 của test). Nếu SelectedValue tình cờ trỏ vào ID có thật thì lượt đó đã
        // xoá mất template của người khác.
        //
        // Đường đúng là mở danh sách rồi đi bằng phím mũi tên — hệt luật F13 của bộ này:
        // gõ phím thì mới qua cùng đường mà người dùng đi.
        trace.Note($"mo danh sach 発行済呼出し de chon 「{value}」");

        var edit = Uia.EditInside(combo);
        var (x, y) = Uia.Center(edit);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();

        Keyboard.TypeSimultaneously(VirtualKeyShort.ALT, VirtualKeyShort.DOWN);
        Thread.Sleep(300);

        // Đi từ đầu danh sách xuống, dừng khi chữ trên combo khớp. Trần 30 là hàng rào
        // chống lặp vô hạn, KHÔNG phải số mục thật.
        Keyboard.Press(VirtualKeyShort.HOME);
        Thread.Sleep(150);

        var found = false;
        for (var i = 0; i < 30; i++)
        {
            var now = Txt.N(Uia.ValueOf(combo));
            if (now == Txt.N(value)) { found = true; break; }
            Keyboard.Press(VirtualKeyShort.DOWN);
            Thread.Sleep(120);
        }

        if (!found)
        {
            Keyboard.Press(VirtualKeyShort.ESCAPE);
            throw new InvalidOperationException(
                $"không dò được 「{value}」 trong danh sách 発行済呼出し sau 30 nhịp mũi tên. " +
                $"Combo đang giữ 「{Txt.N(Uia.ValueOf(combo))}」. Dừng ở đây thay vì bấm F3: " +
                "F3 xoá theo SelectedValue, chọn sai là xoá NHẦM template của người khác.");
        }

        // ENTER chốt lựa chọn ⇒ WinForms mới bắn SelectedIndexChanged và cập nhật
        // SelectedValue. Thiếu bước này là lặp lại đúng lỗi của lượt 14:24.
        Keyboard.Press(VirtualKeyShort.ENTER);
        Waits.Step();
        trace.Note($"da chon, combo dang giu 「{Txt.N(Uia.ValueOf(combo))}」");
    }

    private MsgBoxWin32.Found RequireDialog(string what, string evidenceLabel)
    {
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
        if (box is not null)
        {
            var code = System.Text.RegularExpressions.Regex.Match(evidenceLabel, @"[EQI]\d{5}").Value;
            var shot = MsgEvidence.Capture(box, evidenceLabel, _msg.Template(code));
            Log($"   ảnh hộp thoại: {shot ?? "(không chụp được)"}");
            return box;
        }

        throw new TimeoutException(
            $"không thấy {what} sau 8s. Ảnh từng bước đã có trong artifacts/screenshots — MỞ RA XEM " +
            "trước khi chạy lại (F1/F2).");
    }

    /// <summary>
    /// Khẳng định KHÔNG có hộp thoại nào — và chờ đủ lâu để lời khẳng định đó có nghĩa.
    ///
    /// <para>Deadline cố ý NGẮN (F2): đang đo thứ mình tin là KHÔNG tồn tại. 3 giây đủ cho
    /// một MessageBox bung ra trong cùng handler; dài hơn chỉ đổi 3 giây thành 30.</para>
    /// </summary>
    private string WaitForNoDialog(string when)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        var seen = new List<string>();

        while (DateTime.UtcNow < deadline)
        {
            foreach (var d in MsgBoxWin32.All(App.ProcessId))
            {
                seen.Add(Txt.Vis(d.Raw));
                MsgEvidence.Capture(d, $"_UNEXPECTED frm203053 {when}");
                MsgBoxWin32.ClickButton(d.Hwnd, "OK", "はい", "Yes", "キャンセル", "Cancel");
            }
            Thread.Sleep(200);
        }

        return string.Join(" + ", seen.Distinct());
    }

    private void DismissOk(MsgBoxWin32.Found box)
    {
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes"))
            throw new InvalidOperationException(
                $"không bấm được nút nào trên {box}. Nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)));
        WaitClosed(box);
    }

    private void CancelDialog(MsgBoxWin32.Found box)
    {
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "キャンセル", "Cancel", "いいえ", "No"))
            throw new InvalidOperationException(
                $"KHÔNG bấm được nút huỷ trên {box}. Nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)) +
                ". Dừng lại thay vì bấm bừa — nút còn lại là IN THẬT.");
        WaitClosed(box);
    }

    private void WaitClosed(MsgBoxWin32.Found box) =>
        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));

    /// <summary>
    /// Dẹp hộp thoại đang chắn lúc vừa vào màn 診療入力 — thường là
    /// 「歯科初診料を算定しますか？」. Trả lời 「いいえ」: trả lời CÓ là app chèn dòng 処置 thật.
    /// </summary>
    private void DrainBlockingDialogs(string when)
    {
        for (var i = 0; i < 5; i++)
        {
            var box = MsgBoxWin32.First(App.ProcessId);
            if (box is null) return;

            Log($"dọn hộp thoại {when}: {Txt.Vis(box.Raw)}");
            if (!MsgBoxWin32.ClickButton(box.Hwnd, "いいえ", "No", "キャンセル", "Cancel"))
            {
                Log("   ⚠ không có nút từ chối; nút thật: " +
                    string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)));
                return;
            }
            WaitClosed(box);
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
