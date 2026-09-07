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
    /// <param name="Text">Nguyên văn thân hộp thoại, đã chuẩn hoá xuống dòng về <c>\n</c>.</param>
    /// <param name="Title">Tiêu đề — <c>Application.ProductName</c> (MsgDialog.cs:35).</param>
    /// <param name="Buttons">Nhãn mọi nút; E00100 phải ra ĐÚNG một nút OK.</param>
    /// <param name="DefaultButton">Nút giữ con trỏ lúc hộp VỪA mở, đọc TRƯỚC khi bấm.</param>
    public sealed record Box(string Text, string Title, IReadOnlyList<string> Buttons, string DefaultButton)
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
            var box = new Box(Txt.N(found.Text).Replace("\r\n", "\n"),
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
                    return now is null || Txt.N(now.Text).Replace("\r\n", "\n") != box.Text
                                       || now.Hwnd != found.Hwnd;
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

            var cells = Uia.Children(row)
                           .Select(c => Txt.N(Uia.LegacyNameOf(c)))
                           .Where(t => t.Length > 0)
                           .ToList();
            if (cells.Count == 0) continue;
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
                           .Select(c => Txt.N(Uia.LegacyNameOf(c)))
                           .Where(t => t.Length > 0)
                           .ToList();
            if (cells.Count > 0) return cells;
        }
        return [];
    }
}
