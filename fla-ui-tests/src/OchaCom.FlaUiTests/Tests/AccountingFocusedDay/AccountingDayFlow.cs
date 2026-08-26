using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AccountingFocusedDay;

/// <summary>
/// F8 会計 — <b>đo xem WinForm lấy NGÀY từ đâu</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════
/// Tester báo: 「chị focus ngày 25, nhưng nó vẫn lấy dữ liệu ngày 26 thanh toán」.
/// Luồng này đo <b>đáp án WinForm</b> cho câu đó, để bản web có mốc mà khớp.
///
/// ─── FACT lấy từ source ─────────────────────────────────────────────────────
/// <code>
/// frm203002.cs:7719   int intRo = hFG1.CurrentCellAddress.Y;      ← DÒNG con trỏ
///                     bool AccRet = modAcc.LetAccData2(con, intRo);
///                     ↑ truyền DÒNG, KHÔNG truyền ngày của màn hình
///
/// modAcc.cs:377       strDate = pstrADYear + "/" + pstrMonth + "/" + hFG1[0, intRow].Value
///                     ↑ 年月 của màn hình + NGÀY của DÒNG ĐANG FOCUS
///
/// modAcc.cs:379       TryParse hỏng → MsgBox 「会計処理を行う日の行にカーソルを
///                     合わせてください。」 → return FALSE
///
/// modAcc.cs:386       dtTgtDate != Today → MsgBox 「会計処理を行う日が本日で
///                     ありません。よろしいですか。」 (OkCancel)
///                     Cancel → return TRUE, KHÔNG ghi gì
///
/// frm203002.cs:7740   raiin_cnt = getRaiinCnt(hFG1.CurrentCellAddress.Y)
/// frm203002.cs:7741   formParam.TrtDt = getTrtDt(hFG1[0, CurrentCellAddress.Y].Value)
///                     ↑ bàn giao sang 窓口精算 CŨNG theo dòng focus
/// </code>
///
/// ⇒ Ngày quyết định mọi thứ (<c>deleteTrtDtUnPaid</c>, 日計, 一部負担金) là ngày của
/// <b>DÒNG ĐANG FOCUS</b>, không phải ngày mở màn hình.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO ĐO ĐƯỢC MÀ KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Cổng ngày ở modAcc.cs:379/386 nằm <b>TRƯỚC</b> mọi thao tác ghi — dòng ghi đầu tiên
/// là <c>UnPaid.deleteTrtDtUnPaid</c> (modAcc.cs:~430), sau cổng. Và
/// <c>modAcc.cs</c> <b>không có transaction nào</b> (grep: không có
/// <c>BeginTransaction</c>/<c>Commit</c>/<c>Rollback</c>) — ghi là commit ngay, không
/// lui được. Nên luật của luồng này là: <b>chạm tới cổng ngày rồi DỪNG</b>.
///
/// <list type="bullet">
/// <item>Gặp 「本日でありません」 → bấm <b>キャンセル</b>: LetAccData2 trả true và thoát
///       ngay, chưa chạm dòng ghi nào.</item>
/// <item>Gặp 「カーソルを合わせてください」 → bấm OK: trả false, cũng chưa ghi gì.</item>
/// <item>Gặp hộp thoại LẠ → trả lời phủ định rồi <b>DỪNG</b>. Đi sâu hơn cổng ngày là
///       bước vào sổ tiền, mà luồng này không có việc gì ở đó.</item>
/// <item>KHÔNG gặp hộp thoại nào → báo động: nghĩa là cổng ngày đã bị vượt qua và
///       LetAccData2 đang chạy phần ghi.</item>
/// </list>
///
/// <para>⚠️ Cancel ở cổng ngày trả <b>true</b>, mà nhánh true của handler F8 lại
/// <c>showForm(ID204002); this.Close();</c> (frm203002.cs:7742-7743) — tức là 診療入力
/// ĐÓNG LẠI và 窓口精算 mở ra. Không ghi gì, nhưng testcase sau mất cửa sổ. Dùng
/// <see cref="AccountingFlow.LeaveCounterPayment"/> để lui về.</para>
/// </summary>
public sealed class AccountingDayFlow
{
    /// <summary>Dòng focus không có ô 日 đọc được — modAcc.cs:379-382. F8 trả FALSE.</summary>
    public const string CursorOnDayRowMsg = "カーソルを合わせてください";

    /// <summary>Ngày của dòng focus KHÁC hôm nay — modAcc.cs:386. OkCancel.</summary>
    public const string NotTodayMsg = "本日でありません";

    /// <summary>処置 chưa lưu — ExitWithoutSaving hỏi TRƯỚC LetAccData2 (frm203002.cs:7716).</summary>
    public const string SaveQuestionMsg = "保存しますか";

    /// <summary>会計前チェック (pInpOpt[10]) — chạy TRƯỚC cây quyết định 会計.</summary>
    public const string PreCheckMsg = "続けますか";

    /// <summary>Cổng ngày đã ra kết quả gì.</summary>
    public enum DayGate
    {
        /// <summary>「本日でありません」 — F8 ĐÃ đọc ngày của dòng focus, và ngày đó ≠ hôm nay.</summary>
        AskedNotToday,

        /// <summary>「カーソルを合わせてください」 — dòng focus không có ô 日 hợp lệ.</summary>
        AskedNoDayOnRow,

        /// <summary>Không hộp thoại nào — cổng ngày đã bị vượt qua. XEM CẢNH BÁO.</summary>
        PassedSilently,

        /// <summary>Dừng ở một hộp thoại không nằm trong luật.</summary>
        StoppedAtUnknown,
    }

    /// <summary>Một hộp thoại đã gặp trên đường đi.</summary>
    public sealed record Seen(string Text, string Answered, IReadOnlyList<string> Buttons)
    {
        public override string ToString() =>
            $"「{Text}」 nút [{string.Join(", ", Buttons)}] → bấm 「{Answered}」";
    }

    /// <param name="Gate">Cổng ngày ra kết quả gì.</param>
    /// <param name="Trail">Mọi hộp thoại đã gặp, theo thứ tự — đây là chuỗi THẬT.</param>
    /// <param name="ScreenClosed">診療入力 có bị đóng không (Cancel ở cổng ngày ⇒ có).</param>
    public sealed record Result(
        DayGate Gate, IReadOnlyList<Seen> Trail, bool ScreenClosed, string Explain);

    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly TreatmentGridOps _grid;

    public AccountingDayFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _grid = new TreatmentGridOps(screen);
    }

    public TreatmentGridOps Grid => _grid;

    // ── Đọc lưới ─────────────────────────────────────────────────────────────

    /// <summary>Các ngày (ô 日) đang có trên lưới, theo thứ tự xuất hiện, không trùng.</summary>
    public IReadOnlyList<int> DaysOnGrid() =>
        _grid.Snapshot()
             .Select(r => Txt.Int(r.Day))
             .Where(d => d is not null)
             .Select(d => d!.Value)
             .Distinct()
             .ToList();

    /// <summary>Dòng ĐẦU TIÊN mang ô 日 = <paramref name="day"/>; null nếu không có.</summary>
    public RegiRow? RowForDay(int day) =>
        _grid.Snapshot().FirstOrDefault(r => Txt.Int(r.Day) == day);

    /// <summary>
    /// Dòng KHÔNG có ô 日 — để đo nhánh 「カーソルを合わせてください」.
    ///
    /// <para>Trên lưới có sẵn hai loại: dòng 加算 nằm dưới dòng 初診料 (ô 日 trống vì
    /// cùng ngày với dòng trên), và dòng 【日計】. Lấy dòng 加算 thì an toàn hơn — dòng
    /// 日計 mang <c>linekbn</c> riêng và có thể rẽ nhánh khác.</para>
    /// </summary>
    public RegiRow? RowWithoutDay() =>
        _grid.Snapshot().FirstOrDefault(
            r => Txt.Int(r.Day) is null
                 && r.Ryo.Length > 0
                 && !Txt.Has(r.Ryo, "日計")
                 && !Txt.Has(r.Ryo, "合計"));

    /// <summary>Dòng 日計 của một ngày: 【負担金 N円】【日計 M点】.</summary>
    /// <param name="Day">Ngày mà dòng 日計 này tổng kết.</param>
    /// <param name="Hutan">一部負担金 — số tiền bệnh nhân trả cho NGÀY đó.</param>
    /// <param name="Point">日計点数 — tổng điểm của NGÀY đó.</param>
    public sealed record DailyTotal(int Day, int? Hutan, int? Point, string Raw)
    {
        public override string ToString() =>
            $"ngày {Day,2}: 負担金 {(Hutan?.ToString() ?? "?"),6}円 · 日計 {(Point?.ToString() ?? "?"),5}点";
    }

    /// <summary>
    /// Đọc dòng 【日計】 của từng ngày, ngay trên lưới.
    ///
    /// <para>Đây là <b>hai con số mà tester nhìn thấy</b> — 1.040円 của ngày 25 so với
    /// 220円 của ngày 26 — nên là mốc tự nhiên để bộ test đối chiếu sau này khẳng định
    /// 「F8 đã lấy ngày nào」: số tiền rơi vào 未精算 phải là 負担金 của ĐÚNG ngày dòng
    /// đang focus.</para>
    ///
    /// <para>Dòng 日計 KHÔNG mang ô 日 của riêng nó, nên ngày được suy ra từ dòng có ô 日
    /// gần nhất PHÍA TRÊN — đúng cách người đọc lưới hiểu nó.</para>
    /// </summary>
    public IReadOnlyList<DailyTotal> DailyTotals()
    {
        var result = new List<DailyTotal>();
        var currentDay = -1;

        foreach (var row in _grid.Snapshot())
        {
            if (Txt.Int(row.Day) is { } d) currentDay = d;

            if (!Txt.Has(row.Ryo, "日計")) continue;
            if (currentDay < 0) continue;

            result.Add(new DailyTotal(
                currentDay,
                NumberAfter(row.Ryo, "負担金"),
                NumberAfter(row.Ryo, "日計"),
                row.Ryo.Trim()));
        }
        return result;
    }

    /// <summary>Số đứng ngay sau một nhãn trong chuỗi 「【負担金 1,040円】【日計 346点】」.</summary>
    private static int? NumberAfter(string text, string label)
    {
        var at = text.IndexOf(label, StringComparison.Ordinal);
        if (at < 0) return null;

        var digits = new string(text[(at + label.Length)..]
            .TakeWhile(c => char.IsDigit(c) || c is ',' or ' ' or '　')
            .Where(char.IsDigit)
            .ToArray());
        return int.TryParse(digits, out var v) ? v : null;
    }

    /// <summary>Đặt con trỏ vào một dòng bằng CLICK CHUỘT VẬT LÝ vào ô 日 của nó.</summary>
    public void FocusRow(RegiRow row, TestTrace? trace = null)
    {
        trace?.Do($"dat con tro vao dong [{row.Index}] 日={row.Day} 「{row.Ryo.Trim()}」",
                  () => _grid.FocusCell(row, RegiGrid.Col.Day));
        Waits.Step();
    }

    // ── Bấm F8 rồi DỪNG ở cổng ngày ──────────────────────────────────────────

    /// <summary>
    /// Bấm F8 và đi tới cổng ngày rồi dừng. KHÔNG BAO GIỜ đi sâu hơn — xem chú thích
    /// đầu lớp.
    /// </summary>
    public Result PressF8AndStopAtDayGate(TestTrace? trace = null)
    {
        trace?.Step("bam F8 会計");
        AccountingFlow.TriggerAccounting(_screen.Window, trace);
        Waits.Step();
        return WalkToDayGate(trace);
    }

    /// <summary>AutomationId của mục menu 「＆3 会計データ作成」 (frm203002.Designer.cs:2727).</summary>
    public const string AccDataOnlyMenuId = "IDM_AccDataOnly";

    /// <summary>Chữ trên mục menu đó (frm203002.Designer.cs:2729, đã bỏ ký tự tắt 「＆」).</summary>
    public const string AccDataOnlyMenuText = "会計データ作成";

    /// <summary>
    /// F11 → 「3 会計データ作成」 (<c>IDM_AccDataOnly_Click</c>, frm203002.cs:7749) rồi
    /// dừng ở cổng ngày.
    ///
    /// <para>Lối vào này gọi CHÍNH <c>LetAccData2</c> nên đi qua ĐÚNG cổng ngày như F8.
    /// Khác biệt nằm ở phần SAU: <c>IDM_AccDataOnly_Click</c> <b>không có</b>
    /// <c>showForm(ID204002)</c> lẫn <c>this.Close()</c> ⇒ 診療入力 Ở LẠI. Đó chính là
    /// thứ phân biệt hai lối vào, và là điều testcase đối chiếu đo.</para>
    /// </summary>
    public Result PressAccDataOnlyAndStopAtDayGate(TestTrace? trace = null)
    {
        var opened = InpP1Dialogs.InpP1MenuFlow.ClickTopLevelItem(
            _app, _screen.Window, AccDataOnlyMenuId, AccDataOnlyMenuText, trace);

        if (!opened)
            return new Result(DayGate.StoppedAtUnknown, [], false,
                $"không mở được menu F11 hoặc không thấy mục 「{AccDataOnlyMenuText}」 " +
                $"({AccDataOnlyMenuId}).");

        Waits.Step();
        return WalkToDayGate(trace);
    }

    private Result WalkToDayGate(TestTrace? trace)
    {
        var trail = new List<Seen>();

        // Trần 6 vòng: trước cổng ngày nhiều nhất là 保存しますか + 処置チェック.
        // Chạm trần nghĩa là gặp vòng lặp, và bỏ chạy còn hơn bấm mãi vào sổ tiền.
        for (var i = 0; i < 6; i++)
        {
            // Truyền thẳng cửa sổ, KHÔNG hỏi 「còn sống không」 trước: đọc thuộc tính
            // của cửa sổ đang bị modal chặn thì hoặc ném hoặc TREO (xem đầu
            // ModalDialogs). ModalDialogs.All đi đường 1 là `owner.ModalWindows`,
            // API dành đúng cho tình huống này.
            var dialog = Waits.TryFor(
                () => ModalDialogs.All(_app, _screen.Window).FirstOrDefault(),
                TimeSpan.FromSeconds(i == 0 ? 25 : 6));

            if (dialog is null)
            {
                return new Result(DayGate.PassedSilently, trail, !TreatmentScreenAlive(),
                    trail.Count == 0
                        ? "F8 KHÔNG mở hộp thoại nào. Với dòng focus có ngày = HÔM NAY thì " +
                          "đúng là không hỏi gì (modAcc.cs:386 chỉ hỏi khi khác hôm nay) — " +
                          "nhưng khi đó LetAccData2 đã đi tiếp vào phần GHI. Đừng dùng dòng " +
                          "hôm nay cho luồng chỉ-đọc này."
                        : "Chuỗi F8 kết thúc mà không chạm cổng ngày. Xem hộp thoại cuối " +
                          "trong danh sách để biết đã rẽ đi đâu.");
            }

            var text = Txt.N(Dialogs.TextOf(dialog));
            var buttons = ButtonsOf(dialog);
            trace?.Note($"hop thoai [{trail.Count + 1}]: 「{text}」 nut=[{string.Join(", ", buttons)}]");
            trace?.Shot($"hop-thoai-{trail.Count + 1}");

            // ── ĐÍCH 1: cổng ngày đã hỏi vì ngày ≠ hôm nay ────────────────────
            if (Txt.Has(text, NotTodayMsg))
            {
                // キャンセル: LetAccData2 trả true và THOÁT NGAY (modAcc.cs:387-390),
                // chưa chạm dòng ghi nào. Đây là chỗ duy nhất lui được an toàn.
                var clicked = ClickAny(dialog, "キャンセル", "Cancel");
                trail.Add(new Seen(text, clicked ? "キャンセル" : "(KHONG BAM DUOC)", buttons));
                Waits.Step();
                return new Result(DayGate.AskedNotToday, trail, WaitScreenClosed(),
                    "F8 ĐÃ đọc ngày từ DÒNG ĐANG FOCUS và thấy nó khác hôm nay " +
                    "(modAcc.cs:386). Đây chính là bằng chứng ngày đến từ dòng focus " +
                    "chứ không phải từ ngày mở màn hình.");
            }

            // ── ĐÍCH 2: dòng focus không có ô 日 ──────────────────────────────
            if (Txt.Has(text, CursorOnDayRowMsg))
            {
                var clicked = ClickAny(dialog, "OK", "はい", "Yes");
                trail.Add(new Seen(text, clicked ? "OK" : "(KHONG BAM DUOC)", buttons));
                Waits.Step();
                return new Result(DayGate.AskedNoDayOnRow, trail, WaitScreenClosed(),
                    "Dòng focus không có ô 日 đọc được ⇒ TryParse hỏng ⇒ LetAccData2 trả " +
                    "FALSE và 診療入力 ở nguyên (modAcc.cs:379-382).");
            }

            // ── Trung gian: cho đi tiếp, nhưng KHÔNG ghi gì ───────────────────
            if (Txt.Has(text, SaveQuestionMsg))
            {
                // いいえ = RestoreData (nạp lại lưới từ DB), KHÔNG ghi TRNTRN.
                var clicked = ClickAny(dialog, "いいえ", "No");
                trail.Add(new Seen(text, clicked ? "いいえ" : "(KHONG BAM DUOC)", buttons));
                Waits.Step();
                continue;
            }

            if (Txt.Has(text, PreCheckMsg))
            {
                // 「…続けますか？」 — phủ định ở đây là BỎ CUỘC, không phải an toàn.
                var clicked = ClickAny(dialog, "OK", "はい", "Yes");
                trail.Add(new Seen(text, clicked ? "OK" : "(KHONG BAM DUOC)", buttons));
                Waits.Step();
                continue;
            }

            // ── Hộp thoại LẠ: trả lời phủ định rồi DỪNG ───────────────────────
            var backed = ClickAny(dialog, "キャンセル", "Cancel", "いいえ", "No", "OK");
            trail.Add(new Seen(text, backed ? "(phu dinh)" : "(KHONG BAM DUOC)", buttons));
            return new Result(DayGate.StoppedAtUnknown, trail, WaitScreenClosed(),
                $"Gặp hộp thoại không nằm trong luật: 「{text}」. Luồng này DỪNG ở đây có " +
                "chủ ý — qua khỏi cổng ngày là bước vào phần ghi sổ tiền của LetAccData2, " +
                "mà modAcc.cs không có transaction nào để lui.");
        }

        return new Result(DayGate.StoppedAtUnknown, trail, WaitScreenClosed(),
            "Chạm trần 6 hộp thoại — nghi vòng lặp, dừng lại.");
    }

    /// <summary>Lui khỏi 窓口精算 nếu F8 đã mở nó (Cancel ở cổng ngày ⇒ có).</summary>
    public bool LeaveCounterPaymentIfOpen(TestTrace? trace = null) =>
        AccountingFlow.LeaveCounterPayment(_app, trace);

    // ── Tiện ích ─────────────────────────────────────────────────────────────

    public bool TreatmentScreenAlive()
    {
        try { return Uia.IsOnScreen(_screen.Window); }
        catch { return false; }
    }

    private bool WaitScreenClosed()
    {
        // Cancel ở cổng ngày ⇒ LetAccData2 trả true ⇒ handler đóng 診療入力 và mở
        // 窓口精算. Chờ một nhịp rồi mới đọc, đóng màn không tức thời.
        Waits.TryUntil(() => !TreatmentScreenAlive(), TimeSpan.FromSeconds(6));
        return !TreatmentScreenAlive();
    }

    private static bool ClickAny(Window dialog, params string[] names) =>
        Dialogs.ClickButton(dialog, names);

    public static IReadOnlyList<string> ButtonsOf(Window dialog)
    {
        try
        {
            return dialog.FindAllDescendants(cf =>
                       cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button))
                   .Select(b => Txt.N(Uia.NameOf(b)).Replace("&", ""))
                   .Where(n => n.Length > 0)
                   .ToList();
        }
        catch { return []; }
    }
}
