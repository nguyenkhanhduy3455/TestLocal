using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.TrnCheck;

/// <summary>
/// <b>一括 診療チェック (F3) — 5 luật 月次</b>. Nửa WinForm của
/// <c>../web-tenant-tests/tests/trn-chk-sweep.spec.ts</c>, cùng số hiệu TC.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐÂY LÀ BÊN ĐO ĐÁP ÁN
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// frm203002.cs:4679   F3 → TrnChk(con)                       (chỉ khi panel đang đóng)
/// frm203002.cs:5184     tblRegiInp = (DataTable)grdRegi.DataSource   ← LƯỚI trong RAM
/// frm203002.cs:5186     Check.getCheckAnswer(…)
/// Check.cs:1235           Chk10_4_Cmn     スケーリング全ブロック終了  → SetErrorMsg(10)
/// Check.cs:1241           Chk_Buidis_Cmn  当月部位病名              → SetErrorMsg(11) + return
/// Check.cs:1253           Chk_6000_Cmn    Ｐ病名Ｇ病名重複           → SetErrorMsg(15)
/// Check.cs:1261           Chk_338_Cmn     欠損病名とＰ病名重複       → SetErrorMsg(16)
/// Check.cs:1269           Chkrol999_Cmn   1初診内スケーリング回数超過 → SetErrorMsg(19)
/// Check.cs:1279           Chk10_5_Cmn     SRP/PCur全歯終了          → SetErrorMsg(27)/(29)
/// frm203002.cs:5210     đổ vào grdChek, lbChk = list.Count + 「件」
/// frm203002.cs:5225     list rỗng → MsgDialog.ShowWarningMsg("I00100"), panel KHÔNG mở
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÁC BÊN WEB Ở CHỖ DỰNG DỮ LIỆU — và đó là bắt buộc
/// ═══════════════════════════════════════════════════════════════════════════
/// Spec web seed thẳng <c>trn_trn</c> bằng <c>seedTreatmentRows</c> rồi tải lại trang.
/// WinForm KHÔNG đi được đường đó: <c>TrnChk</c> đọc <c>grdRegi.DataSource</c> — tức
/// <b>lưới đang mở trong bộ nhớ của phiên chạy</b>. Seed DB xong mà không mở lại màn
/// hình thì check không thấy gì.
///
/// <para>Nên bộ này dựng tình huống <b>bằng chính giao diện</b>, giống hệt cách
/// <c>KobetuSidePanelScoreTests</c> dựng cờ 訪問診療 bằng cách chọn mã 333 thay vì seed
/// DB. Đổi lại: <b>KHÔNG bấm F9 登録</b> nên không dòng nào xuống DB.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MỌI ASSERT MỐC VÀO <c>lbChk</c>, KHÔNG MỐC VÀO SỐ DÒNG ĐỌC ĐƯỢC
/// ═══════════════════════════════════════════════════════════════════════════
/// UIA của <c>DataGridView</c> chỉ dựng phần tử cho dòng ĐANG NHÌN THẤY
/// (PROBE-GUIDELINE 3.1) và panel chỉ cao 43px. <c>lbChk</c> là <c>Label</c> nằm NGOÀI
/// lưới nên miễn nhiễm với cuộn. Danh sách message chỉ dùng để biết <b>nội dung</b>,
/// và khi hai con số lệch nhau thì thông điệp assert phải nói rõ đó là lỗi ĐỌC.
///
/// <para>Chạy: <c>.\run-trn-check.ps1 -Case Sweep</c></para>
/// </summary>
[TestFixture]
[Category("trn-check")]
public sealed class TrnCheckSweepTests : UiTestBase
{
    private TrnCheckFlow _flow = null!;

    /// <summary>
    /// TẮT HẲN watcher hộp thoại nhiễu.
    ///
    /// <para>Dựng tình huống bằng giao diện nghĩa là chèn 処置 thật, và mỗi lần chèn
    /// 行単位チェック lại bung W00100. Watcher bấm OK hộ thì bộ này vẫn chạy được — nhưng
    /// nó cũng bấm 「いいえ」 cho những câu 「…を算定しますか？」 mà việc trả lời sai làm dòng
    /// KHÔNG vào lưới, và khi đó TC-ROL999 đỏ với lý do hoàn toàn sai địa chỉ. Fixture
    /// tự dẹp bằng <see cref="TrnCheckFlow.DrainW00100"/>.</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void SweepOneTimeSetUp() => _flow = new TrnCheckFlow(App, Screen);

    /// <summary>Bấm F3, đòi panel phải mở, trả về danh sách message.</summary>
    private IReadOnlyList<string> Sweep(TestTrace trace)
    {
        var r = _flow.PressF3(trace);

        if (r.NoErrorDialog is not null)
        {
            var text = Txt.N(Dialogs.TextOf(r.NoErrorDialog));
            Dialogs.ClickButton(r.NoErrorDialog, "OK", "はい", "Yes");
            Assert.Fail(
                $"F3 báo KHÔNG có lỗi nào (I00100: 「{text}」) nên không có panel để đọc. " +
                "Với bệnh nhân/ngày đang cấu hình thì đây là bất thường — mọi testcase ở đây " +
                "đều cần ít nhất panel mở được. Kiểm patient.patNo / patient.trtDate.");
        }

        Assert.That(r.PanelOpened, Is.True, r.Note);
        return _flow.PanelMessages();
    }

    /// <summary>
    /// TC-BASE — mốc: panel lấy dữ liệu THẬT từ engine, và chưa câu 月次 nào có mặt.
    ///
    /// <para>⇔ web TC-BASE. Bên đó phải chứng minh 「panel không bị mock」 vì
    /// <c>treatment-table-handler.spec.ts</c> TC-8..11 chặn hẳn endpoint check bằng
    /// <c>page.route</c>. Bên WinForm không có gì để mock — <c>TrnChk</c> gọi thẳng
    /// <c>Check.getCheckAnswer</c> trong cùng tiến trình — nên phần đó hiển nhiên; cái
    /// còn lại thì KHÔNG hiển nhiên và mới là việc của testcase này: <b>chốt mốc</b>.</para>
    ///
    /// <para>Mọi TC sau chỉ thêm ĐÚNG một tình huống, nên câu xuất hiện thêm là do tình
    /// huống đó chứ không phải do dữ liệu nền. Nền bẩn thì các TC sau xanh vì lý do
    /// sai — và đó là loại hỏng đắt nhất, vì nó im lặng.</para>
    /// </summary>
    [Test, Order(1)]
    [Description("TC-BASE — mốc: panel đọc engine thật, chưa có câu 月次 nào")]
    public void TcBase_PanelReadsRealEngine_AndNoMonthlyMessageYet()
    {
        using var trace = TestTrace.Begin();

        var msgs = Sweep(trace);
        var count = _flow.PanelCount();

        TestContext.Out.WriteLine(
            $"TC-BASE: lbChk=「{_flow.PanelCountText()}」 · đọc được {msgs.Count} dòng " +
            $"(dữ liệu nền của bệnh nhân {PatNo}, ngày {TrtDate:yyyy-MM-dd})");
        for (var i = 0; i < msgs.Count; i++) TestContext.Out.WriteLine($"    [{i + 1}] {msgs[i]}");

        // 1. Panel sống và ĐANG in một con số — nếu lbChk trống thì hoặc TrnChk không
        //    chạy tới :5219, hoặc locator lệch. Cả hai đều làm mọi TC sau vô nghĩa.
        Assert.That(count, Is.Not.Null,
            $"lbChk không đọc ra số nào (đọc được 「{_flow.PanelCountText()}」). " +
            "frm203002.cs:5219 ghi list.Count + 「件」 mỗi lần TrnChk tìm ra lỗi. " +
            "Trống ⇒ sửa locators.chkCount trong testsettings.json.");

        // 2. Đọc lưới phải khớp lbChk. Lệch = lỗi ĐỌC (lưới cuộn), không phải app sai —
        //    nói rõ trong thông điệp để người đọc log không đi sửa nhầm chỗ.
        Assert.That(msgs.Count, Is.EqualTo(count!.Value),
            $"lbChk nói {count} lỗi nhưng đọc grdChek ra {msgs.Count} dòng. Đây là lỗi ĐỌC — " +
            "UIA chỉ phơi ra dòng đang nhìn thấy và panel cao 43px (PROBE-GUIDELINE 3.1). " +
            $"Đã đọc: {string.Join(" / ", msgs)}");

        // 3. Mốc sạch: không câu 月次 nào.
        foreach (var m in TrnCheckFlow.MonthlyMessages)
        {
            var n = _flow.CountContaining(msgs, m);
            Assert.That(n, Is.Zero,
                $"dữ liệu nền đã bắn sẵn 「{m}」 — mốc KHÔNG sạch, các TC sau sẽ pass vì lý do sai. " +
                (m == TrnCheckFlow.MsgBuidis
                    ? $"Riêng câu này còn tệ hơn: Check.cs:1246 return NGAY sau nó, nên 4 luật 月次 " +
                      $"phía sau KHÔNG BAO GIỜ chạy và TC-ROL999 sẽ đỏ với lý do sai hoàn toàn. " +
                      $"Tháng {TrtDate:yyyy-MM} của bệnh nhân {PatNo} không còn dòng nào mang 病名; " +
                      $"đổi patient.patNo / patient.trtDate. "
                    : "") +
                $"Panel: {string.Join(" / ", msgs)}");
        }

        _flow.ClosePanel();
    }

    /// <summary>
    /// TC-TOGGLE — F3 là phím BẬT/TẮT, và lần bấm thứ hai KHÔNG chạy lại check.
    ///
    /// <para>KHÔNG có testcase tương ứng trong <c>trn-chk-sweep.spec.ts</c> — nó nằm ở
    /// <c>treatment-table-handler.spec.ts</c> TC-11 bên web. Đưa vào đây vì cùng dùng
    /// một mốc và vì nó là <b>tiền đề của mọi TC còn lại</b>: hàm
    /// <see cref="TrnCheckFlow.PressF3"/> phải tự đóng panel trước khi bấm, nếu không
    /// TC thứ hai trong fixture sẽ chỉ đóng panel của TC thứ nhất rồi kết luận
    /// 「F3 không mở panel」.</para>
    ///
    /// <para>frm203002.cs:4679-4692 — nhánh <c>PnlChek.Visible == true</c> chỉ làm hai
    /// việc: <c>Visible = false</c> và <c>hFG1.Focus()</c>. Không có lời gọi
    /// <c>TrnChk</c> nào, tức là <b>không chạm DB</b>.</para>
    /// </summary>
    [Test, Order(2)]
    [Description("TC-TOGGLE — F3 lần hai đóng panel (⇔ treatment-table-handler TC-11)")]
    public void TcToggle_SecondF3ClosesPanel()
    {
        using var trace = TestTrace.Begin();

        Sweep(trace);
        Assert.That(_flow.PanelVisible(), Is.True, "F3 lần một phải mở panel.");

        var closed = _flow.ClosePanel();
        trace.Shot("sau-F3-lan-hai");

        Assert.That(closed, Is.True,
            "F3 lần hai phải ĐÓNG panel (frm203002.cs:4681: PnlChek.Visible = false; hFG1.Focus()). " +
            $"Trạng thái hiện tại: {_flow.Describe()}");

        // Panel đóng ⇒ control biến hẳn khỏi cây UIA (control WinForms Visible = false
        // không có window handle nên cầu MSAA→UIA không dựng phần tử). Đo được ở
        // PROBE 1 KQ-1, và đây là lý do PanelVisible() kiểm CẢ hai vế.
        Assert.That(Uia.ById(Screen.Window, TestSettings.Current.Locator("chkGrid")), Is.Null,
            "Panel đã đóng thì grdChek phải biến khỏi cây UIA. Còn thấy ⇒ panel chỉ bị che " +
            "chứ chưa ẩn, và mọi phép đọc sau đó sẽ trả về nội dung CŨ.");
    }
}
