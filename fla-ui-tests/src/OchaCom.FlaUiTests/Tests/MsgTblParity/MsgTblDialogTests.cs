using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// Nửa GIAO DIỆN của bộ MSGTBL: bung hộp thoại THẬT trên WinForm rồi đọc NGUYÊN VĂN.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// LỖ HỔNG MÀ FIXTURE NÀY BỊT
/// ═══════════════════════════════════════════════════════════════════════════════
/// <see cref="MsgTblParityTests"/> chứng minh 「row DB khác literal bên web」. Nhưng một
/// người hoài nghi có quyền hỏi tiếp: <b>row DB có thật sự là câu người dùng nhìn thấy
/// không?</b> Giữa row và màn hình còn <c>MsgDialog.getMsg</c> với ba nhánh của nó, và
/// còn khả năng app đọc bảng khác / cache chỗ khác.
///
/// <para>Ca ở đây trả lời bằng quan sát: mở app thật, ép nó bung đúng mã đó, đọc chữ
/// bằng Win32, so với <c>Render()</c> dựng từ row. Khớp ⇒ <b>row DB CHÍNH LÀ câu người
/// dùng thấy</b>, và từ đó mọi kết luận của fixture kia đứng trên quan sát chứ không
/// trên suy luận.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HAI CA, VÀ VÌ SAO PHẢI ĐỦ CẢ HAI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TCM5  ĐỐI CHỨNG — E00002, một mã web đang KHỚP
///         個別 tab, ô ｺｰﾄﾞ = 「174-0」 → InputCheckKobe chặn (frm203002.cs:2194)
///         kỳ vọng: hộp thoại == row DB == literal web   ⇒ phương pháp đo là công bằng
///
///   TCM6  CA DƯƠNG — E00003, một mã web đang LỆCH
///         frm203042 カルテ自動算定一覧, 検索 với 処置名 không tồn tại (getViewData
///         0 件, frm203042.cs:225)
///         kỳ vọng: hộp thoại == row DB 「該当データがありません。」
///                  và KHÁC literal web 「該当するデータがありません。」
/// </code>
///
/// <para>Chỉ có TCM6 thì mọi lệch đều có thể đổ cho 「cách đọc hộp thoại của test sai」.
/// TCM5 là seed đối chứng: cùng một cách đọc, cùng một cách render, nhưng ra KHỚP. Sau đó
/// con số của TCM6 mới có nghĩa.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB — KHÔNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// TCM5 bị <c>InputCheckKobe</c> chặn TRƯỚC khi search nên không đụng gì. TCM6 chỉ mở
/// một màn 一覧 và bấm 検索 (<c>SELECT</c> thuần), đóng bằng F10 戻る, KHÔNG bấm F9 登録.
/// Không testcase nào chạm <c>trn_trn</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ ĐỌC HỘP THOẠI BẰNG Win32 VÀ SO TRÊN BẢN RAW
/// ═══════════════════════════════════════════════════════════════════════════════
/// · F17 — <c>Dialogs.Open</c> (đường UIA) có lúc mù hẳn ⇒ dùng
///   <see cref="MsgBoxWin32"/> (<c>EnumWindows</c> theo lớp <c>#32770</c>).
/// · So trên <c>Found.Raw</c> chứ không phải <c>Found.Text</c>: <c>Text</c> đã LÀM PHẲNG
///   <c>\r\n</c> thành space. Với câu một dòng thì hai bản như nhau, nhưng ngày có ai
///   thêm ca Q00012/Q00049 (câu DÀI, MessageBox tự xuống dòng) thì bản phẳng sẽ nuốt mất
///   đúng chỗ cần đo — và assert 「nguyên văn」 trên bản đã phẳng là XANH GIẢ.
/// · F18 — bấm nút bằng <c>PostMessage</c>, không bằng <c>InvokePattern</c>.
/// · F16 — nhãn nút theo NGÔN NGỮ WINDOWS: truyền đủ bộ <c>OK / はい / Yes</c>.
/// </summary>
[TestFixture]
[NonParallelizable]
[Category("msgtbl-parity")]
[CancelAfter(600_000)]
public sealed class MsgTblDialogTests : UiTestBase
{
    /// <summary>Nhãn E00002 mà <c>InputCheckKobe</c> truyền vào (frm203002.cs:2205 / :2215).</summary>
    private const string LabelKobeCode = "個別入力のコード";

    /// <summary>Chuỗi ép ô ｺｰﾄﾞ trượt <c>int.TryParse</c> — dấu gạch ngang (frm203002.cs:2194).</summary>
    private const string NonIntegerCode = "174-0";

    /// <summary>
    /// 処置名 chắc chắn không khớp dòng nào: <c>trt_nm LIKE '%…%'</c> (MstTrt.cs:2250).
    ///
    /// <para>Cố ý KHÔNG dùng 処置コード: ô đó <c>MaxLength = 3</c> nên mọi mã gõ được đều
    /// nằm trong dải master thật, và 「mã nào đang trống」 thì đổi theo từng máy. Chuỗi
    /// Latin thì không bao giờ nằm trong tên 処置 tiếng Nhật.</para>
    /// </summary>
    private const string NoSuchTreatmentName = "ZZZZZZZZ";

    private MsgTblOracle _msg = null!;

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    /// <summary>Không có DB thì không có 「đáp án」 để so — bỏ qua TRƯỚC khi mở app.</summary>
    protected override string? FixturePreflightSkipReason()
    {
        var db = MsgTblOracle.CreateOrNull(TestSettings.Current);
        if (db is null) return "db.enabled = false hoặc thiếu chuỗi kết nối — không đọc được MSGTBL.";
        if (db.ProbeError() is { } err) return $"không kết nối được SQL Server: {err}";
        _msg = db;
        return null;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCM5 — ĐỐI CHỨNG: E00002, mã web đang khớp
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCM5 — ĐỐI CHỨNG: hộp thoại E00002 trên WinForm == row MSGTBL == literal web")]
    public void TCM5_Control_Dialog_Matches_Both_Table_And_Web()
    {
        var expected = _msg.Render("E00002", LabelKobeCode);
        var web = WebMsgSnapshot.Matching.Single(m => m.Code == "E00002")
                                .Template.Replace("{0}", LabelKobeCode, StringComparison.Ordinal);

        var kobetu = Screen.Kobetu.Open();
        kobetu.ResetSearchBoxes();
        DrainDialogs("trước TCM5");

        Uia.SetText(kobetu.CodeBox, NonIntegerCode);
        ClickPhysically(kobetu.SearchButton, "nút 検索 của tab 個別");

        var box = RequireDialog($"E00002 sau khi gõ 「{NonIntegerCode}」 vào ô ｺｰﾄﾞ");
        LogKq(5, $"WinForm hiện: {Txt.Vis(box.Raw)}");
        Log($"   row MSGTBL render: {Txt.Vis(expected)}");
        Log($"   literal web      : {Txt.Vis(web)}");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(box.Raw, Is.EqualTo(expected),
                    "hộp thoại WinForm phải TRÙNG KHÍT row MSGTBL đã render. Lệch ⇒ app không lấy chữ " +
                    "từ bảng này (trỏ DB khác? có lớp cache?) và MỌI kết luận của MsgTblParityTests " +
                    "mất chỗ dựa — sửa chỗ này trước.");

                Assert.That(web, Is.EqualTo(expected),
                    "…và literal web cũng phải trùng. Đây là mã ĐỐI CHỨNG: nó chứng minh cách so " +
                    "「chữ trên WinForm ↔ literal web」 là công bằng, nên ca TCM6 lệch là lệch THẬT.");
            });
        }
        finally
        {
            Dismiss(box);
            Uia.Clear(kobetu.CodeBox);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCM6 — CA DƯƠNG: E00003, mã web đang lệch
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCM6 — E00003: chữ trên WinForm là 「該当データがありません。」, web đang hiện câu khác")]
    public void TCM6_E00003_Dialog_Differs_From_Web_Literal()
    {
        var expected = _msg.Render("E00003");
        var web = WebMsgSnapshot.Diverging.Single(d => d.Code == "E00003").WebTemplate;

        using var trace = TestTrace.Begin();
        DrainDialogs("trước TCM6");

        var list = trace.Do("mo frm203042 コメント自動入力登録 bang ban phim",
            () => OpenCmtAutoListByKeyboard(trace));

        try
        {
            var nameBox = KarteAutoCalcDialog.FindChrome(
                list, KarteAutoCalcDialog.ListTrtNmBoxId, KarteAutoCalcDialog.ListGridId);
            Assert.That(nameBox, Is.Not.Null,
                $"không thấy ô 処置名 「{KarteAutoCalcDialog.ListTrtNmBoxId}」 trên frm203042 — " +
                "locator đổi thì sửa ở KarteAutoCalcDialog, đừng sửa ở đây.");

            var codeBox = KarteAutoCalcDialog.FindChrome(
                list, KarteAutoCalcDialog.ListTrtCdBoxId, KarteAutoCalcDialog.ListGridId);
            if (codeBox is not null) Uia.SetText(codeBox, "");
            Uia.SetText(nameBox!, NoSuchTreatmentName);
            trace.Step($"go 処置名 = {NoSuchTreatmentName}");

            var search = KarteAutoCalcDialog.FindChrome(
                list, KarteAutoCalcDialog.ListSearchButtonId, KarteAutoCalcDialog.ListGridId);
            Assert.That(search, Is.Not.Null, "không thấy nút 検索 của frm203042.");

            // 検索 bung MessageBox MODAL ⇒ InvokePattern có thể không bao giờ trả về (F18).
            KarteAutoCalcDialog.ClickModalOpener(search!, trace);
            trace.Step("bam 検索");

            var box = RequireDialog("E00003 sau khi 検索 ra 0 件");
            LogKq(6, $"WinForm hiện: {Txt.Vis(box.Raw)}");
            Log($"   row MSGTBL   : {Txt.Vis(expected)}");
            Log($"   literal web  : {Txt.Vis(web)}");
            Log($"   nút của hộp  : {string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}");

            try
            {
                Assert.Multiple(() =>
                {
                    Assert.That(box.Raw, Is.EqualTo(expected),
                        "chữ WinForm hiện phải TRÙNG KHÍT row MSGTBL E00003 — đây là bằng chứng trực " +
                        "tiếp cho 「câu người dùng thấy」, không qua suy luận nào.");

                    Assert.That(box.Raw, Is.Not.EqualTo(web),
                        $"…và KHÁC câu bản web đang hiện ({WebMsgSnapshot.SourceFile}:" +
                        $"{WebMsgSnapshot.Diverging.Single(d => d.Code == "E00003").Line}). " +
                        "Bằng nhau ⇒ web đã sửa xong: chuyển E00003 sang WebMsgSnapshot.Matching.");
                });
            }
            finally
            {
                Dismiss(box);
            }
        }
        finally
        {
            try { KarteAutoCalcDialog.Close(App, list); }
            catch (Exception e) { Log($"không đóng được frm203042: {e.Message}"); }
            DrainDialogs("sau TCM6");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng nhỏ dùng chung
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Mở <c>frm203042</c> bằng ĐƯỜNG BÀN PHÍM: <c>F11</c> → <c>9</c> → <c>6</c>.
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// VÌ SAO KHÔNG DÙNG <c>KarteAutoCalcDialog.OpenList</c>
    /// ═══════════════════════════════════════════════════════════════════════
    /// Hàm đó bấm <c>btnF11</c> rồi đi TÌM cửa sổ popup qua UIA. Đo ngày 2026-09-15:
    /// nó ném 「bam btnF11 xong nhung khong thay cua so popup menu nao trong 5s」 —
    /// trong khi <b>ảnh chụp lúc đỏ cho thấy popup đang mở rành rành</b> giữa màn hình
    /// (artifacts/screenshots/02_TCM6_..._Failed_103451.png). Tức là cú bấm ĐÚNG, chỉ có
    /// phần DÒ popup của UIA là mù — cùng loại bệnh mà F17 nói về <c>Dialogs.Open</c>.
    ///
    /// <para>Đường bàn phím không cần dò gì cả. Mọi mục của
    /// <c>contextMenuStripSentaku</c> đều khai phím tắt bằng <c>&amp;</c> trong designer:</para>
    ///
    /// <code>
    ///   IDM_Option.Text  = "&amp;9 オプション"              (frm203002.Designer.cs:2838)
    ///     └─ IDM_AutoCmt.Text = "&amp;6 コメント自動入力登録" (frm203002.Designer.cs:2879)
    ///          → IDM_AutoCmt_Click (frm203002.cs:7997) → showForm(ID203042)
    /// </code>
    ///
    /// <para>⚠️ Tên hằng của mục này là <c>IDM_AutoCmt</c>, KHÔNG phải <c>IDM_CmtAuto</c>
    /// như <c>KarteAutoCalcDialog.MenuItemId</c> đang ghi — thêm một lý do đường UIA ở đó
    /// không bao giờ khớp theo AutomationId.</para>
    /// </summary>
    private Window OpenCmtAutoListByKeyboard(TestTrace trace)
    {
        var already = KarteAutoCalcDialog.FindDialogWindow(
            App, KarteAutoCalcDialog.ListId, KarteAutoCalcDialog.ListTitleFragment);
        if (already is not null)
        {
            trace.Note("frm203042 da mo san — dung lai");
            return already;
        }

        // Phím F rơi vào NHẦM FORM khi có gì đó chồng lên (F15) ⇒ kéo 診療入力 lên trước.
        var hwnd = Screen.Window.Properties.NativeWindowHandle.ValueOrDefault;
        if (hwnd != IntPtr.Zero) Uia.ForceForeground(hwnd);
        try { Screen.Window.Focus(); } catch { /* foreground đã đủ */ }
        Waits.Step();

        Uia.SendKey(Vk.F11);
        Thread.Sleep(400);
        Uia.SendKey(Vk.Digit(9));
        Thread.Sleep(400);
        Uia.SendKey(Vk.Digit(6));
        trace.Step("F11 → 9 (オプション) → 6 (コメント自動入力登録)");

        var list = Waits.TryFor(
            () => KarteAutoCalcDialog.FindDialogWindow(
                      App, KarteAutoCalcDialog.ListId, KarteAutoCalcDialog.ListTitleFragment),
            TimeSpan.FromSeconds(12));

        if (list is not null) return list;

        throw new TimeoutException(
            "F11 → 9 → 6 không mở được frm203042 sau 12s. MỞ ẢNH trong artifacts\\screenshots ra " +
            "xem TRƯỚC khi chạy lại (F1/F2): popup có bung không, đang dừng ở mục nào, có hộp " +
            "thoại nào chắn không. Hộp thoại đang mở lúc này: " +
            (MsgBoxWin32.TextOfAll(App.ProcessId) is { Length: > 0 } t ? t : "(không có)"));
    }

    /// <summary>
    /// Chờ hộp thoại với deadline NGẮN (F2).
    ///
    /// <para>8 giây: hộp thoại này bung ngay trong handler của cú bấm, không có I/O dài
    /// nào ở giữa. Chờ lâu hơn không mua thêm thông tin — nó chỉ đổi 「biết sau 8 giây」
    /// thành 「biết sau vài phút」.</para>
    /// </summary>
    private MsgBoxWin32.Found RequireDialog(string what)
    {
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
        if (box is not null) return box;

        throw new TimeoutException(
            $"không thấy {what} sau 8s. Ảnh chụp từng bước đã có sẵn trong artifacts\\screenshots — " +
            "MỞ ẢNH RA XEM trước khi chạy lại (F1/F2). Thường gặp: hộp thoại khác đang chắn, " +
            "hoặc cú bấm rơi vào form khác.");
    }

    /// <summary>Đóng hộp thoại và ĐỢI nó biến mất — <c>PostMessage</c> trả về ngay, không đồng nghĩa đã đóng.</summary>
    private void Dismiss(MsgBoxWin32.Found box)
    {
        // F16 — nhãn theo ngôn ngữ Windows, không theo ngôn ngữ app.
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes"))
            throw new InvalidOperationException(
                $"không bấm được nút nào trên {box}. Nút thật: " +
                string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)));

        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
    }

    /// <summary>
    /// Dẹp hộp thoại còn sót lại của ca TRƯỚC, và NÓI RA đã dẹp cái gì.
    ///
    /// <para>Không có bước này thì ca sau có thể đọc trúng hộp thoại của ca trước và báo
    /// cáo nội dung của nó — lỗi đã xảy ra thật ở luồng 患者選択 (PatientSelectFlow).</para>
    /// </summary>
    private void DrainDialogs(string when)
    {
        foreach (var d in MsgBoxWin32.All(App.ProcessId))
        {
            Log($"   dọn hộp thoại sót {when}: {Txt.Vis(d.Raw)}");
            MsgBoxWin32.ClickButton(d.Hwnd, "OK", "はい", "Yes", "キャンセル", "Cancel", "いいえ", "No");
        }
    }

    /// <summary>
    /// Bấm bằng CHUỘT VẬT LÝ. <c>Uia.Click</c> gọi <c>InvokePattern::Invoke</c> — đồng bộ —
    /// nên cú bấm nào mở MessageBox modal đều có thể không bao giờ trả về (F18).
    /// </summary>
    private static void ClickPhysically(AutomationElement element, string what)
    {
        var (x, y) = Uia.Center(element);
        if (x <= 0 && y <= 0)
            throw new InvalidOperationException($"{what} không có toạ độ màn hình — bị che hoặc chưa vẽ.");
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }
}
