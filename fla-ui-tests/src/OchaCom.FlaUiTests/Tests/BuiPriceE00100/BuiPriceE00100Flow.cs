using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.BuiPriceE00100;

/// <summary>
/// Vét hàng đợi hộp thoại <b>E00100</b> và đọc màn 当日来患 của <c>frm203001</c>.
/// KHÔNG assert — chỉ lái và trả về cái đo được, đúng quy ước của các Flow khác.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO BẮT HỘP THOẠI BẰNG WIN32 CHỨ KHÔNG PHẢI UIA
/// ═══════════════════════════════════════════════════════════════════════════
/// E00100 là <c>MessageBox.Show(..., MessageBoxButtons.OK, MessageBoxIcon.Error)</c>
/// (MsgDialog.cs:35) — một cửa sổ lớp <c>#32770</c>, KHÔNG thuộc cây UIA của form. Ngoài
/// ra <c>Dialogs.Open</c> quét cả desktop và đã treo hơn 20 phút một lần (xem chú thích
/// đầu <see cref="MsgBoxWin32"/>). <c>EnumWindows</c> đọc bảng cửa sổ của USER32, vài
/// mili-giây và không bao giờ chặn.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÉT CẠN, VÀ ĐỪNG CHỜ 「SỐ HỘP VỀ 0」 GIỮA HAI VÒNG
/// ═══════════════════════════════════════════════════════════════════════════
/// WinForm hiện 「1 件 1 ダイアログ」 nối tiếp: <c>Calc_BuiPriceData2s</c> lặp theo 枝番
/// (modAcc.cs:77) và <c>getTodayViewData</c> lặp theo dòng bệnh nhân (frm203001.cs:908),
/// mỗi lượt gọi <c>getBuiPrice2</c> ⇒ mỗi lượt một <c>MessageBox.Show</c>. Vì
/// <c>MessageBox.Show</c> là ĐỒNG BỘ, hộp kế tiếp mở gần như ngay khi hộp này đóng —
/// mốc phải chờ là 「khác hộp vừa đóng」 chứ không phải 「hết hộp」. Đây đúng là cái bẫy
/// mà spec Playwright đã ghi lại ở <c>drainE00100</c>.
///
/// <para>Và phải vét CẠN kể cả khi testcase chỉ cần một hộp: bỏ sót một hộp thì nó chắn
/// mọi thao tác của testcase sau, và log sẽ đổ oan cho app (PROBE-GUIDELINE 3.4).</para>
/// </summary>
public sealed class BuiPriceE00100Flow
{
    /// <summary>Đầu thân CHUNG của cả hai nhánh E00100 (buiPrice.cs:198 và :1735).</summary>
    public const string FailedHead = "一部負担金計算に失敗しました";

    /// <summary>Nhánh 福祉医療設定 — buiPrice.cs:1735.</summary>
    public const string LocalFlgMissingMark = "福祉医療設定データが存在しません";

    /// <summary>Nhánh NGOẠI LỆ (catch) — buiPrice.cs:198, cái mà spec web mô phỏng.</summary>
    public const string CalcFailedMark = "患者登録データを確認してください";

    private readonly OchaApp _app;

    public BuiPriceE00100Flow(OchaApp app) => _app = app;

    /// <summary>Một lần hộp E00100 hiện ra.</summary>
    /// <param name="Raw">
    /// Thân hộp thoại <b>Y NGUYÊN</b> như Win32 trả về, chỉ đổi <c>\r\n</c> → <c>\n</c>.
    ///
    /// <para>Đây là thứ DUY NHẤT dùng được để so nguyên văn. <see cref="Txt.N"/> chạy NFKC
    /// nên biến 全角スペース U+3000 thành space thường, và nó còn đổi xuống dòng thành
    /// space — so bằng <see cref="Text"/> là mất luôn hai chi tiết mà cả hai bản đều phải
    /// giữ. Bản đầu của bộ test này so bằng <c>Text</c> và XANH, nhưng nó chỉ chứng minh
    /// 「các chữ đúng thứ tự」 chứ không chứng minh gì về khoảng trắng.</para>
    /// </param>
    /// <param name="Text">Bản đã chuẩn hoá — dùng để LOG và để <c>Txt.Has</c> tìm mẫu.</param>
    /// <param name="Title">Tiêu đề — <c>Application.ProductName</c> (MsgDialog.cs:35).</param>
    /// <param name="Buttons">Nhãn mọi nút; E00100 phải ra ĐÚNG một nút OK.</param>
    /// <param name="DefaultButton">Nút giữ con trỏ lúc hộp VỪA mở, đọc TRƯỚC khi bấm.</param>
    public sealed record Box(string Raw, string Text, string Title,
                             IReadOnlyList<string> Buttons, string DefaultButton)
    {
        public override string ToString() =>
            $"「{Text.Replace("\n", " ⏎ ")}」 tiêu đề「{Title}」 " +
            $"nút=[{string.Join(", ", Buttons)}] mặc định「{DefaultButton}」";
    }

    /// <summary>Mọi MessageBox đang mở của app, kể cả cái không phải E00100.</summary>
    public IReadOnlyList<MsgBoxWin32.Found> OpenDialogs() => MsgBoxWin32.All(_app.ProcessId);

    /// <summary>Hộp E00100 đầu tiên đang mở; không có thì null.</summary>
    public MsgBoxWin32.Found? FirstE00100() =>
        MsgBoxWin32.All(_app.ProcessId).FirstOrDefault(d => Txt.Has(d.Text, FailedHead));

    /// <summary>
    /// Vét SẠCH hàng đợi E00100 và trả về từng hộp theo đúng thứ tự hiện ra.
    ///
    /// <para>Hộp KHÔNG phải E00100 thì DỪNG và để nguyên — trả lời hộ một câu hỏi mình
    /// chưa đọc là cách nhanh nhất để ghi nhầm vào DB. Gọi <see cref="OpenDialogs"/> sau
    /// đó để biết còn gì đang chắn.</para>
    ///
    /// <param name="firstWait">Chờ hộp ĐẦU lâu hơn (vừa điều hướng/vừa bấm phím xong).</param>
    /// <param name="rounds">
    /// Trần số hộp. Chạm trần = nghi vòng lặp vô hạn; bỏ chạy còn hơn bấm mãi.
    /// </param>
    /// </summary>
    public IReadOnlyList<Box> Drain(TimeSpan firstWait, int rounds = 12, TestTrace? trace = null)
    {
        var seen = new List<Box>();

        for (var i = 0; i < rounds; i++)
        {
            var wait = i == 0 ? firstWait : TimeSpan.FromSeconds(6);
            var found = Waits.TryFor(FirstE00100, wait);
            if (found is null) break;

            // ĐỌC TRƯỚC KHI BẤM: cú bấm dời con trỏ sang nút vừa bấm, hỏi sau là đo lại
            // chính lựa chọn của mình chứ không phải mặc định của WinForm
            // (bài học của AccountingFlow).
            var box = new Box((found.Text ?? "").Replace("\r\n", "\n"),
                              Txt.N(found.Text),
                              Txt.N(found.Title),
                              MsgBoxWin32.ButtonCaptions(found.Hwnd),
                              AccountingFocusedButton());
            seen.Add(box);
            trace?.Note($"E00100 [{seen.Count}]: {box}");
            trace?.Shot($"e00100-{seen.Count}");

            if (!MsgBoxWin32.ClickButton(found.Hwnd, "OK", "はい", "Yes"))
            {
                trace?.Note($"KHONG bam duoc nut nao — nhan doc duoc: [{string.Join(", ", box.Buttons)}]");
                break;
            }

            // Chờ 「khác hộp vừa đóng」, KHÔNG chờ 「hết hộp」: hộp kế tiếp mở ngay.
            var closed = Waits.TryUntil(
                () =>
                {
                    var now = FirstE00100();
                    return now is null || now.Hwnd != found.Hwnd;
                },
                TimeSpan.FromSeconds(15));
            if (!closed) trace?.Note("hop E00100 khong dong sau khi bam OK — dung vet");
            if (!closed) break;
        }

        return seen;
    }

    /// <summary>Nút đang giữ con trỏ, nếu nó là Button. Rỗng khi không đọc được.</summary>
    private string AccountingFocusedButton()
    {
        try
        {
            var focused = _app.Automation.FocusedElement();
            if (focused is null) return "";
            if (Uia.ControlTypeOf(focused) != FlaUI.Core.Definitions.ControlType.Button) return "";
            return Txt.N(Uia.NameOf(focused)).Replace("&", "");
        }
        catch { return ""; }
    }

    // ── Chuỗi F8 会計 (frm203002 → modAcc.LetAccData2) ───────────────────────

    /// <summary>Một hộp thoại của chuỗi F8 và câu trả lời đã bấm.</summary>
    public sealed record Answered(string Text, string Button, string Why)
    {
        public override string ToString() =>
            $"「{Text.Replace("\n", " ⏎ ")}」 → bấm 「{Button}」 ({Why})";
    }

    /// <param name="Trail">Mọi hộp thoại đã gặp, theo thứ tự — đây là chuỗi THẬT.</param>
    /// <param name="E00100Count">Số lần E00100 bung ra trong chuỗi.</param>
    /// <param name="ReachedCounterPayment">Có sang được 窓口精算 (frm204002) không.</param>
    /// <param name="Explain">Khi không tới đích: vì sao, nói bằng ngôn ngữ của modAcc.</param>
    public sealed record F8Walk(IReadOnlyList<Answered> Trail, int E00100Count,
                                bool ReachedCounterPayment, string Explain);

    /// <summary>「会計処理を行う日が本日でありません。よろしいですか。」 — modAcc.cs:383.</summary>
    public const string DateGateMsg = "本日でありません";

    /// <summary>「処置データチェックでエラーがありました…このまま続けますか?」 — frm203002.cs:7713.</summary>
    public const string PreCheckMsg = "続けますか";

    /// <summary>「処置データは、変更されています。保存しますか？」 — ModSave.ExitWithoutSaving.</summary>
    public const string SaveQuestionMsg = "保存しますか";

    /// <summary>「既に、¥N の会計処理がされていますが、未清算データ（¥M）を作成してよろしいですか？」 — modAcc.cs:558.</summary>
    public const string CreateUnpaidMsg = "未清算データ";

    /// <summary>「会計処理後、請求金額が増えています。差額分の未精算データ…を作成しますか？」 — modAcc.cs:578.</summary>
    public const string DiffUnpaidMsg = "差額分";

    /// <summary>「…に計上しますか？」 — cây quyết định ChgAccData, modAcc.cs:956. GHI SỔ TIỀN ở nhánh はい.</summary>
    public const string ChgAccDataMsg = "計上しますか";

    /// <summary>
    /// Bấm <b>F8 会計</b> rồi đi hết chuỗi hộp thoại, đếm E00100 và xem có sang 窓口精算 không.
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// LÁI BẰNG WIN32, KHÔNG PHẢI UIA — VÀ VÌ SAO KHÁC <c>UnpaidCreationFlow</c>
    /// ═══════════════════════════════════════════════════════════════════════
    /// Chuỗi này trộn hai loại hộp thoại: E00100 (một nút OK) và các cổng Yes/No. Cả hai
    /// đều là <c>#32770</c>, nên một vòng lặp <see cref="MsgBoxWin32"/> đọc được tuốt —
    /// trong khi <c>ModalDialogs</c> đi ba đường UIA và đường cuối quét cả desktop.
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// LUẬT TRẢ LỜI: ĐI TIẾP, NHƯNG KHÔNG GHI SỔ TIỀN
    /// ═══════════════════════════════════════════════════════════════════════
    /// Mục tiêu là 「E00100 xong có VẪN sang 窓口精算 không」, chứ KHÔNG phải tạo 未精算.
    /// Nên luật ngược hẳn <c>UnpaidCreationFlow</c>: nó trả lời <b>はい</b> cho
    /// 「…未清算データ…作成してよろしいですか?」 để ghi cho được; ở đây <b>いいえ</b>, vì
    /// <c>modAcc.cs:571-574</c> cho biết khi số tiền hiện tại BẰNG số đã chốt thì nhánh
    /// いいえ <c>return true</c> ngay — đúng cái cần, mà không chèn dòng nào.
    ///
    /// <para>⚠️ Điều KHÔNG tránh được: <c>UnPaid.deleteTrtDtUnPaid</c> nằm ở
    /// <b>modAcc.cs:427</b>, tức TRƯỚC mọi cổng trên. Qua được cổng ngày là dòng 未精算 của
    /// ngày đó BAY. Fixture gọi hàm này BẮT BUỘC phải chụp ảnh <c>UNPAID</c> và trả lại.</para>
    ///
    /// <para>「…計上しますか？」 luôn trả lời <b>いいえ</b>: <c>ChgAccData</c> chỉ ghi
    /// <c>ACCDAT</c>/<c>PERSON_EXP</c> ở nhánh はい (modAcc.cs:956) — đó là SỔ TIỀN của
    /// phòng khám, ngoài phạm vi luồng này.</para>
    /// </summary>
    public F8Walk PressF8AndWalk(OchaApp app, Window screen, int rounds = 10, TestTrace? trace = null)
    {
        var trail = new List<Answered>();
        var e00100 = 0;

        trace?.Step("bam F8 会計");
        try { screen.SetForeground(); } catch { /* vẫn thử gõ */ }
        try { screen.Focus(); } catch { /* nt */ }
        Waits.Step();
        Keyboard.Press(VirtualKeyShort.F8);

        for (var i = 0; i < rounds; i++)
        {
            var found = Waits.TryFor(() => MsgBoxWin32.First(app.ProcessId),
                                     TimeSpan.FromSeconds(i == 0 ? 30 : 6));
            if (found is null) break;

            var text = Txt.N(found.Text).Replace("\r\n", "\n");
            var buttons = MsgBoxWin32.ButtonCaptions(found.Hwnd);
            var (names, why) = RuleFor(text);

            trace?.Note($"hop thoai [{trail.Count + 1}]: 「{text}」 nut=[{string.Join(", ", buttons)}]");
            trace?.Shot($"f8-hop-thoai-{trail.Count + 1}");

            if (Txt.Has(text, FailedHead)) e00100++;

            if (!MsgBoxWin32.ClickButton(found.Hwnd, names))
            {
                trail.Add(new Answered(text, "(KHONG BAM DUOC)", why));
                return new F8Walk(trail, e00100, false,
                    $"không có nút nào trong [{string.Join(", ", names)}] trên hộp thoại cuối " +
                    $"(đọc được [{string.Join(", ", buttons)}]).");
            }
            trail.Add(new Answered(text, names[0], why));

            // CHỜ CHÍNH HWND NÀY BIẾN MẤT trước khi đi tìm hộp kế tiếp.
            //
            // MsgBoxWin32.ClickButton dùng PostMessage — nó bỏ thư vào hàng đợi rồi trả
            // về NGAY. Bản đầu đi thẳng sang vòng sau và tóm lại ĐÚNG hộp vừa bấm, rồi
            // ClickButton lần hai chạy khi cửa sổ đang đóng dở nên không tìm thấy nút
            // nào. Log 2026-09-07 đọc rất giống lỗi app: hộp 「本日でありません」 hiện HAI
            // lần liền, lần sau báo 「không có nút nào trong [OK, はい, Yes]」 trong khi
            // nút đọc được lại là [OK, Cancel] — mâu thuẫn, vì OK có trong cả hai.
            var gone = Waits.TryUntil(
                () => MsgBoxWin32.All(app.ProcessId).All(d => d.Hwnd != found.Hwnd),
                TimeSpan.FromSeconds(15));
            if (!gone)
                trace?.Note($"hop thoai [{trail.Count}] khong dong sau khi bam 「{names[0]}」");
            Waits.Step();
        }

        // IDM_Acc_Click: nhánh AccRet == true là showForm(ID204002) + this.Close()
        // (frm203002.cs:7742-7746). Nên mốc 「đã sang 窓口精算」 là frm204002 XUẤT HIỆN,
        // chứ không phải 「frm203002 biến mất」 — cửa sổ cũ chỉ Close() sau đó.
        var seisan = Waits.TryFor(() => app.Window("frm204002"), TimeSpan.FromSeconds(30));
        return new F8Walk(trail, e00100, seisan is not null,
            seisan is not null
                ? "đã sang 窓口精算 (frm204002)."
                : "chuỗi F8 kết thúc mà KHÔNG sang 窓口精算. Cửa sổ đang mở: " +
                  string.Join(" | ", app.Windows().Select(w => Uia.AutomationIdOf(w))));
    }

    /// <summary>
    /// Luật trả lời. <b>Thứ tự là một phần của luật — cụ thể trước, chung chung sau.</b>
    ///
    /// <para>Câu 「既に…未清算データ(…)を作成してよろしいですか?」 chứa CẢ 「よろしいですか」
    /// lẫn 「されています」; để luật chung đứng trước là nó bị nuốt và trả lời sai — đúng cái
    /// bẫy mà <c>AccountingFlow</c> và <c>UnpaidCreationFlow</c> đều đã ghi lại.</para>
    /// </summary>
    private static (string[] Names, string Why) RuleFor(string text)
    {
        if (Txt.Has(text, FailedHead))
            return (["OK"], "E00100 chỉ có một nút OK (MsgDialog.cs:35)");

        if (Txt.Has(text, ChgAccDataMsg))
            return (["いいえ", "No"], "いいえ ⇒ ChgAccData KHÔNG ghi sổ tiền (modAcc.cs:956)");

        if (Txt.Has(text, DiffUnpaidMsg))
            return (["いいえ", "No"], "いいえ ⇒ không tạo 未精算 phần chênh (modAcc.cs:578)");

        if (Txt.Has(text, CreateUnpaidMsg))
            return (["いいえ", "No"],
                    "いいえ ⇒ số hiện tại bằng số đã chốt thì return true ngay, " +
                    "không chèn dòng nào (modAcc.cs:571-574)");

        if (Txt.Has(text, SaveQuestionMsg))
            return (["いいえ", "No"], "いいえ ⇒ RestoreData, không ghi TRNTRN");

        if (Txt.Has(text, DateGateMsg))
            return (["OK", "はい", "Yes"], "OK ⇒ đi tiếp qua cổng ngày (Cancel là bỏ cuộc)");

        if (Txt.Has(text, PreCheckMsg))
            return (["OK", "はい", "Yes"], "OK ⇒ bỏ qua cảnh báo 処置データチェック");

        // Lạ: phủ định cho an toàn. Hộp kiểu 「…続けますか」 phải có luật RIÊNG ở trên —
        // với chúng, phủ định là BỎ CUỘC chứ không phải an toàn.
        return (["いいえ", "No", "キャンセル", "Cancel", "OK"],
                "KHÔNG khớp luật nào — trả lời phủ định");
    }

    // ── 当日来患 (frm203001, F4) ──────────────────────────────────────────────

    /// <summary>Một dòng của lưới <c>dgvView</c> ở chế độ 当日来患.</summary>
    public sealed record TodayRow(int Index, IReadOnlyList<string> Cells)
    {
        public override string ToString() => $"[{Index}] {string.Join(" | ", Cells)}";
    }

    /// <summary>
    /// Bấm <b>F4 当日来患</b> trên frm203001 (<c>btnF4_Click → chgViewType(today)</c>,
    /// frm203001.cs:388).
    ///
    /// <para>Bấm PHÍM chứ không click nút: <c>BaseForm</c> bật <c>KeyPreview</c> và định
    /// tuyến F4 về đúng <c>btnF4_Click</c> (BaseForm.cs:551-554), còn <c>btnF4</c> là
    /// <c>GradientButton</c> tự vẽ mà app này KHÔNG nhận <c>InvokePattern</c> ở bất kỳ
    /// control nào (README mục 8b).</para>
    ///
    /// <para>KHÔNG chờ hộp thoại ở đây: <c>getTodayViewData</c> gọi <c>getBuiPrice2</c>
    /// cho từng dòng NGAY trong handler, nên E00100 có thể bung ra giữa chừng và
    /// <c>dgvView</c> chỉ điền xong sau khi người ta bấm OK. Người gọi phải
    /// <see cref="Drain"/> trước rồi mới đọc lưới.</para>
    /// </summary>
    public void PressF4(Window patSelect, TestTrace? trace = null)
    {
        trace?.Step("bam F4 当日来患 tren frm203001");
        try { patSelect.SetForeground(); } catch { /* chưa nhận foreground vẫn thử gõ */ }
        try { patSelect.Focus(); } catch { /* như trên */ }
        Waits.Step();
        Keyboard.Press(VirtualKeyShort.F4);
        Waits.Step();
    }

    /// <summary>
    /// Đọc lưới 当日来患 (<c>dgvView</c> — control của LỚP CHA frm901001, locator
    /// <c>patSelGrid</c>).
    ///
    /// <para>⚠️ UIA chỉ phơi ra dòng ĐANG NHÌN THẤY của <c>DataGridView</c>
    /// (PROBE-GUIDELINE 3.1). Với 当日来患 của một ngày cụ thể thì thường vài dòng nên đủ
    /// nhìn, nhưng mốc chắc chắn hơn là dòng 合計 ở <see cref="TodayTotalRow"/> — nó nằm
    /// ở lưới KHÁC (<c>dgvTotal</c>) và không trôi theo vị trí cuộn.</para>
    /// </summary>
    public IReadOnlyList<TodayRow> TodayRows(Window patSelect, int limit = 60)
    {
        var grid = Uia.ById(patSelect, TestSettings.Current.Locator("patSelGrid"));
        if (grid is null) return [];

        var rows = new List<TodayRow>();
        var index = 0;
        foreach (var row in Uia.Children(grid).Take(limit))
        {
            // 「Top Row」 là dòng TIÊU ĐỀ và cũng lọt vào danh sách con (PROBE-GUIDELINE 3.2).
            if (Txt.Has(Uia.NameOf(row), "Top Row")) continue;

            // GIÁ TRỊ ô nằm ở LegacyIAccessible.VALUE. LegacyIAccessible.Name của ô lưới
            // WinForms là chuỗi MÔ TẢ kèm tên cột (「患者番号 Row 0」) — lượt probe đầu
            // đọc nhầm sang đó và in ra một hàng toàn tên cột (README mục 7).
            var cells = Uia.Children(row)
                           .Select(c => Txt.N(Uia.ValueOf(c)))
                           .ToList();
            if (cells.All(t => t.Length == 0)) continue;
            rows.Add(new TodayRow(index++, cells));
        }
        return rows;
    }

    /// <summary>
    /// Dòng 合計 của 当日来患 — lưới RIÊNG <c>dgvTotal</c>, chỉ hiện ở chế độ này
    /// (frm203001.cs:948-960, <c>dgvTotal.Visible</c> tắt ở hai chế độ kia).
    ///
    /// <para>Đây là mốc tốt nhất cho câu hỏi 「dòng bệnh nhân hỏng còn được cộng vào tổng
    /// không」: <c>total[2] += price2.insScore</c> chạy cho MỌI dòng, kể cả dòng vừa
    /// E00100 (khi đó cộng 0) — khác hẳn frm204008 vốn LOẠI dòng.</para>
    /// </summary>
    public IReadOnlyList<string> TodayTotalRow(Window patSelect)
    {
        var grid = Uia.ById(patSelect, "dgvTotal");
        if (grid is null) return [];

        foreach (var row in Uia.Children(grid))
        {
            if (Txt.Has(Uia.NameOf(row), "Top Row")) continue;
            var cells = Uia.Children(row)
                           .Select(c => Txt.N(Uia.ValueOf(c)))
                           .ToList();
            if (cells.Any(t => t.Length > 0)) return cells;
        }
        return [];
    }
}
