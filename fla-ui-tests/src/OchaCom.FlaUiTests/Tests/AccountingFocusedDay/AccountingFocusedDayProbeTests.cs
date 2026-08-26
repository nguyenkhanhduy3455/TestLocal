using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.AccountingFocusedDay;

/// <summary>
/// <b>PROBE — F8 会計 lấy ngày từ đâu. KHÔNG assert.</b>
///
/// Bước 2 của vòng làm việc bắt buộc trong <c>fla-ui-tests/PROBE-GUIDELINE.md</c>:
/// chưa biết app thật hành xử ra sao thì <b>chụp màn hình → đọc ảnh → rồi mới viết
/// assert</b>. Fixture này đi từng bước, <b>không bao giờ ném</b>, và in ra đủ để một
/// lượt chạy trả lời hết các câu hỏi cần cho bộ test đối chiếu win–web sau này.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BUG ĐANG ĐIỀU TRA
/// ═══════════════════════════════════════════════════════════════════════════
/// Tester: 「chị focus ngày 25, nhưng nó vẫn lấy dữ liệu ngày 26 thanh toán」.
///
/// Đọc source thì WinForm lấy ngày từ <b>DÒNG ĐANG FOCUS</b>
/// (frm203002.cs:7719 → modAcc.cs:377), còn bản web lấy từ <c>trtDt</c> trên URL. Probe
/// này ĐO lại phía WinForm để bộ test đối chiếu có mốc thật, chứ không chỉ suy từ đọc
/// code.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// NĂM CÂU HỎI CẦN ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  KQ-1  Lưới đang có những ngày nào? Hôm nay có nằm trong đó không?
///  KQ-2  Focus dòng có ngày ≠ hôm nay → F8 có bung 「本日でありません」 không?
///        ĐÂY LÀ CÂU CHỐT: có ⇒ ngày đến từ DÒNG FOCUS, không phải ngày màn hình.
///  KQ-3  Chuỗi hộp thoại THẬT của F8 trước khi tới cổng ngày là gì?
///  KQ-4  Focus dòng KHÔNG có ô 日 → 「カーソルを合わせてください」?
///  KQ-5  Cancel ở cổng ngày thì 診療入力 có đóng và 窓口精算 có mở không?
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// AN TOÀN — probe này KHÔNG ghi DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Cổng ngày (modAcc.cs:379/386) nằm TRƯỚC mọi dòng ghi, và <c>modAcc.cs</c> không có
/// transaction nào — ghi là commit ngay. Nên luồng chạm cổng ngày rồi DỪNG:
/// 「本日でありません」 → キャンセル, 「カーソルを…」 → OK, hộp thoại lạ → phủ định + dừng.
///
/// <para>Vẫn nằm sau <c>parity.allowSave</c>: F8 là cửa vào sổ tiền, và một probe
/// 「được thiết kế để không ghi」 vẫn là probe chạy trên đường đó. Cờ này là để người
/// chạy biết mình đang đứng ở đâu, không phải vì probe cần quyền ghi.</para>
///
/// <para><b>Cố ý KHÔNG đo dòng có ngày = HÔM NAY.</b> Ở dòng đó cổng ngày im lặng và
/// LetAccData2 đi thẳng vào <c>deleteTrtDtUnPaid</c> — xoá 未精算 thật. Muốn đo nhánh
/// đó thì phải là một fixture khác, có seed và có khôi phục.</para>
///
/// <para>Chạy: <c>.\run-accounting-focused-day.ps1 -Diagnostics</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, không nằm trong lượt chạy đủ")]
[Category("accounting-focused-day")]
public sealed class AccountingFocusedDayProbeTests : UiTestBase
{
    private AccountingDayFlow _flow = null!;

    /// <summary>
    /// Tắt hẳn watcher hộp thoại nhiễu.
    ///
    /// <para>Chuỗi F8 gồm toàn hộp thoại dạng 「…続けますか？」/「…よろしいですか。」 mà
    /// với chúng, phủ định = BỎ CUỘC chứ không phải an toàn. Watcher bấm 「いいえ」 hộ sẽ
    /// huỷ cả chuỗi trước khi probe kịp thấy cổng ngày, và log sẽ nói 「F8 không hỏi gì」
    /// — sai hoàn toàn.</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason() =>
        Settings.Parity.AllowSave
            ? null
            : "chưa bật parity.allowSave. F8 会計 là cửa vào sổ tiền (ACCDAT / PERSON_EXP / " +
              "未精算). Probe này được thiết kế để DỪNG ở cổng ngày và không ghi gì, nhưng " +
              "vẫn đòi cờ để người chạy biết mình đang đứng trên đường nào. " +
              "Chạy: .\\run-accounting-focused-day.ps1 -Diagnostics";

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp() => _flow = new AccountingDayFlow(App, Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    [Test, Order(0)]
    [Description("Tc0 — PROBE: F8 会計 lấy ngày từ dòng focus hay từ ngày màn hình?")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ PROBE F8 会計 — ngày đến từ DÒNG FOCUS hay từ NGÀY MÀN HÌNH?     ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
        Log($"bệnh nhân {PatNo} · ngày mở màn hình {TrtDate:yyyy-MM-dd} · " +
            $"HÔM NAY {DateTime.Today:yyyy-MM-dd} · 年月 trên màn 「{Screen.YearMonth()}」");
        trace.Shot("00-man-hinh-ban-dau");

        var days = ProbeGrid();
        ProbeNonTodayRow(trace, days);
        ProbeRowWithoutDay(trace);

        Log("");
        Log("=== KQ-END === Gửi lại: mọi dòng '=== KQ-' ở trên + thư mục artifacts\\screenshots");
        Assert.Pass("PROBE xong — đọc các dòng KQ, không có assert nào ở đây");
    }

    // ── KQ-1 ─────────────────────────────────────────────────────────────────

    private IReadOnlyList<int> ProbeGrid()
    {
        Log("");
        IReadOnlyList<int> days = [];

        Safe("đọc các ngày trên lưới", () =>
        {
            days = _flow.DaysOnGrid();
            Kq("1", $"lưới có {_flow.Grid.RowCount()} dòng, các ô 日: [{string.Join(", ", days)}]");

            var today = DateTime.Today.Day;
            Kq("1", days.Contains(today)
                ? $"HÔM NAY (ngày {today}) CÓ trên lưới ⇒ đo được cả hai nhánh của cổng ngày."
                : $"HÔM NAY (ngày {today}) KHÔNG có trên lưới ⇒ mọi dòng đều 「khác hôm nay」, " +
                  "nhánh im lặng không đo được ở đây (mà cũng không nên đo — nó ghi DB).");

            var totals = _flow.DailyTotals();
            Kq("1c", $"dòng 【日計】 đọc được ({totals.Count}):");
            foreach (var t in totals) Log("        " + t);
            Log("        ⇒ đây là mốc cho bộ đối chiếu: 未精算 mà F8 tạo ra phải mang " +
                "負担金 của ĐÚNG ngày dòng đang focus. Chính hai con số này là thứ tester " +
                "nhìn thấy khi báo 「focus ngày 25 nhưng lấy dữ liệu ngày 26」.");

            if (totals.Select(x => x.Hutan).Distinct().Count() < 2)
                Log("        ⚠️ các ngày đang có 負担金 GIỐNG NHAU (hoặc chỉ có một ngày) ⇒ " +
                    "chưa phân biệt được ngày nào được chọn. Bộ đối chiếu cần bệnh nhân có " +
                    "ÍT NHẤT HAI ngày 処置 với 負担金 khác nhau, và một trong hai là HÔM NAY.");

            var noDay = _flow.RowWithoutDay();
            Kq("1b", noDay is null
                ? "không tìm được dòng nào KHÔNG có ô 日 ⇒ bỏ qua KQ-4."
                : $"dòng không có ô 日 để thử KQ-4: [{noDay.Index}] 「{noDay.Ryo.Trim()}」");
        });

        return days;
    }

    // ── KQ-2 / KQ-3 / KQ-5 — câu chốt ────────────────────────────────────────

    private void ProbeNonTodayRow(TestTrace trace, IReadOnlyList<int> days)
    {
        Log("");
        var today = DateTime.Today.Day;
        var target = days.FirstOrDefault(d => d != today);

        if (target == 0)
        {
            Kq("2", "lưới không có ngày nào KHÁC hôm nay ⇒ không đo được câu chốt. " +
                    "Đổi patient.trtDate sang tháng có nhiều ngày 処置.");
            return;
        }

        Safe($"focus dòng ngày {target} rồi bấm F8", () =>
        {
            var row = _flow.RowForDay(target);
            if (row is null) { Kq("2", $"không thấy dòng nào có 日 = {target}"); return; }

            Kq("2", $"đặt con trỏ vào dòng 日 = {target} (KHÁC hôm nay {today}), " +
                    $"trong khi màn hình đang mở ở 年月 「{Screen.YearMonth()}」");
            _flow.FocusRow(row, trace);
            Kq("2", $"ô đang giữ con trỏ: 「{_flow.Grid.FocusedCellName()}」");

            var result = _flow.PressF8AndStopAtDayGate(trace);

            Kq("3", $"chuỗi hộp thoại THẬT của F8 ({result.Trail.Count} cái):");
            for (var i = 0; i < result.Trail.Count; i++) Log($"        [{i + 1}] {result.Trail[i]}");

            Kq("2", $"KẾT QUẢ CỔNG NGÀY: {result.Gate}");
            Log("        " + result.Explain);

            switch (result.Gate)
            {
                case AccountingDayFlow.DayGate.AskedNotToday:
                    Kq("2", "⇒ ĐÃ CHỨNG MINH: F8 đọc ngày từ DÒNG ĐANG FOCUS. Nếu nó đọc " +
                            "ngày của MÀN HÌNH thì với màn hình mở ở hôm nay sẽ KHÔNG có " +
                            "hộp thoại nào.");
                    break;
                case AccountingDayFlow.DayGate.PassedSilently:
                    Kq("2", "⇒ KHÔNG hỏi gì. Hoặc ngày màn hình = hôm nay và F8 đọc theo " +
                            "MÀN HÌNH (trái với source), hoặc chuỗi đã rẽ đi chỗ khác. " +
                            "XEM ẢNH — và kiểm 未精算 của bệnh nhân này, có thể đã bị ghi.");
                    break;
                default:
                    Kq("2", "⇒ chưa tới được cổng ngày; xem chuỗi hộp thoại ở trên.");
                    break;
            }

            Kq("5", $"診療入力 có bị đóng không: {result.ScreenClosed}");
            Log("        Cancel ở cổng ngày ⇒ LetAccData2 trả TRUE ⇒ handler F8 " +
                "showForm(ID204002) + this.Close() (frm203002.cs:7742-7743) ⇒ 診療入力 đóng, " +
                "窓口精算 mở. KHÔNG ghi gì, nhưng testcase sau mất cửa sổ.");

            trace.Shot("01-sau-cong-ngay");
            RecoverScreen(trace);
        });
    }

    // ── KQ-4 ─────────────────────────────────────────────────────────────────

    private void ProbeRowWithoutDay(TestTrace trace)
    {
        Log("");
        Safe("focus dòng KHÔNG có ô 日 rồi bấm F8", () =>
        {
            if (!_flow.TreatmentScreenAlive())
            {
                Kq("4", "診療入力 không còn mở ⇒ bỏ qua (xem KQ-5).");
                return;
            }

            var row = _flow.RowWithoutDay();
            if (row is null) { Kq("4", "không có dòng nào thiếu ô 日 ⇒ bỏ qua."); return; }

            Kq("4", $"đặt con trỏ vào dòng [{row.Index}] 「{row.Ryo.Trim()}」 (ô 日 trống)");
            _flow.FocusRow(row, trace);

            var result = _flow.PressF8AndStopAtDayGate(trace);
            Kq("4", $"KẾT QUẢ: {result.Gate} — {result.Explain}");
            for (var i = 0; i < result.Trail.Count; i++) Log($"        [{i + 1}] {result.Trail[i]}");

            if (result.Gate == AccountingDayFlow.DayGate.AskedNoDayOnRow)
                Kq("4", "⇒ đúng modAcc.cs:379-382: TryParse hỏng ⇒ trả FALSE, 診療入力 ở nguyên " +
                        $"(ScreenClosed = {result.ScreenClosed}, kỳ vọng false).");

            trace.Shot("02-dong-khong-co-ngay");
            RecoverScreen(trace);
        });
    }

    // ── Dọn dẹp ──────────────────────────────────────────────────────────────

    /// <summary>Lui khỏi 窓口精算 và mở lại 診療入力 nếu F8 đã đóng nó.</summary>
    private void RecoverScreen(TestTrace trace)
    {
        Safe("lui khoi 窓口精算 va mo lai 診療入力", () =>
        {
            if (_flow.LeaveCounterPaymentIfOpen(trace))
                Log("        đã đóng 窓口精算");

            if (_flow.TreatmentScreenAlive()) return;

            ReopenTreatmentScreen();
            _flow = new AccountingDayFlow(App, Screen);
            Log("        đã mở lại 診療入力");
        });
    }
}
