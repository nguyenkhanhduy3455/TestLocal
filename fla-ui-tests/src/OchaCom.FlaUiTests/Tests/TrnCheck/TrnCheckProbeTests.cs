using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.TrnCheck;

/// <summary>
/// <b>PROBE — dò hành vi 診療チェック, KHÔNG assert.</b>
///
/// Bước 2 của vòng làm việc bắt buộc trong <c>fla-ui-tests/PROBE-GUIDELINE.md</c>:
/// chưa biết app thật hành xử ra sao thì <b>chụp màn hình → đọc ảnh → rồi mới viết
/// assert</b>. Fixture này đi từng bước, <b>không bao giờ ném</b>, và một lượt chạy
/// phải trả lời hết những câu mà đọc source không kết luận được.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN PROBE Ở ĐÂY
/// ═══════════════════════════════════════════════════════════════════════════
/// Bên Playwright, <c>trn-chk-sweep.spec.ts</c> dựng tình huống bằng
/// <c>seedTreatmentRows</c> — ghi thẳng <c>trn_trn</c> rồi tải lại trang. WinForm
/// KHÔNG có đường đó: <c>TrnChk</c> đọc <c>tblRegiInp = (DataTable)grdRegi.DataSource</c>
/// (frm203002.cs:5184), tức là <b>lưới đang mở trong RAM</b>, cộng với
/// <c>ModSave.trtDataList</c> đã nạp lúc mở màn. Seed DB xong mà không mở lại màn hình
/// thì check không thấy gì.
///
/// Nên nửa WinForm phải dựng tình huống <b>bằng chính giao diện</b> — chèn 165-1
/// スケーリング qua tab 個別. Và đó là chỗ chưa ai đo:
/// <list type="bullet">
///   <item><description>master tháng này có 165-1 không, hay chỉ có 枝番 khác;</description></item>
///   <item><description>chèn xong 行単位チェック bung mấy hộp thoại W00100 (chúng chắn màn hình
///   và mọi thao tác sau đó rơi vào hộp thoại chứ không vào lưới — PROBE-GUIDELINE 3.4);</description></item>
///   <item><description>dữ liệu NỀN của bệnh nhân test đã bắn sẵn câu 月次 nào chưa — nếu rồi
///   thì mốc không sạch và mọi testcase sau sẽ xanh vì lý do sai.</description></item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHÍN CÂU HỎI CẦN ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  KQ-1  Trạng thái đầu: PnlChek/grdChek/lbChk có đọc được bằng AutomationId không?
///  KQ-2  Bấm F3 → panel mở, hay bung I00100 (không lỗi nào)? Nội dung nguyên văn.
///  KQ-3  Đọc được bao nhiêu dòng lỗi, và có khớp con số ở lbChk không?
///        (lệch = lưới cuộn, phải sửa cách đọc chứ không phải app sai)
///  KQ-4  Dữ liệu NỀN đã có sẵn câu 月次 nào chưa? — quyết định mốc của TC-BASE.
///  KQ-5  Bấm F3 lần hai có đóng panel không (frm203002.cs:4681)?
///  KQ-6  ＋/－ (PGDN/PGUP) cuộn được lưới lỗi không (customLabel29 hứa như vậy)?
///  KQ-7  Chèn 165-1 qua tab 個別 được không? Chèn xong bung mấy câu W00100?
///  KQ-8  Đặt 回数 = 2 cho dòng vừa chèn → bung thêm mấy câu W00100?
///  KQ-9  Có ĐỦ 3 dòng スケーリング × 回数 2 rồi thì F3 có ra 「1初診内でｽｹｰﾘﾝｸﾞ…」 không,
///        và ra MẤY câu? (1 = per-month đúng như :1269; ≥2 = per-row)
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Probe chèn dòng vào lưới nhưng <b>KHÔNG bấm F9 登録</b>. <c>TrnChk</c> chỉ đọc
/// <c>grdRegi.DataSource</c> nên không cần lưu; đóng màn hình mà không lưu là sạch.
/// Cùng đúng một tính chất với spec web («Spec KHÔNG bấm F9 nên KHÔNG cần
/// TEST_ALLOW_SAVE»).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-trn-check.ps1 -Diagnostics
/// </code>
/// Runner lọc sẵn mọi dòng <c>=== KQ-</c> ra <c>trn-check-KQ.txt</c>.
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, không nằm trong lượt chạy đủ")]
[Category("trn-check")]
public sealed class TrnCheckProbeTests : UiTestBase
{
    private TrnCheckFlow _flow = null!;

    /// <summary>
    /// TẮT HẲN watcher hộp thoại nhiễu.
    ///
    /// <para>Thứ probe đang đo là <b>số lượng</b> hộp thoại W00100 mà 行単位チェック bung
    /// ra. Watcher chạy nền và bấm 「いいえ」/OK hộ sẽ làm mọi phép đếm ra 0, và log sẽ
    /// nói 「app không cảnh báo gì」 — kết luận ngược hẳn sự thật, đúng cái bẫy
    /// PROBE-GUIDELINE 3.4 mô tả. Probe tự dẹp bằng
    /// <see cref="TrnCheckFlow.DrainW00100"/> ở chỗ nào cần.</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp() => _flow = new TrnCheckFlow(App, Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>Chạy một bước, nuốt mọi ngoại lệ, ghi lại rồi đi tiếp.</summary>
    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    [Test, Order(0)]
    [Description("Tc0 — PROBE: đo hết chín câu hỏi của 診療チェック trong một lượt chạy")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ PROBE 診療チェック (一括 F3 + 行単位 W00100) — KHÔNG assert       ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
        Log($"bệnh nhân {PatNo}, ngày {TrtDate:yyyy-MM-dd}");
        trace.Shot("00-man-hinh-ban-dau");

        // ── KQ-1 ────────────────────────────────────────────────────────────
        Safe("KQ-1 doc control cua panel", () =>
        {
            var panel = Uia.ById(Screen.Window, "PnlChek");
            var grid = Uia.ById(Screen.Window, "grdChek");
            var count = Uia.ById(Screen.Window, "lbChk");
            Kq("1", $"PnlChek={(panel is null ? "KHÔNG THẤY" : Uia.IsOnScreen(panel) ? "thấy, ĐANG HIỆN" : "thấy, đang ẩn")} · " +
                    $"grdChek={(grid is null ? "KHÔNG THẤY" : "thấy")} · " +
                    $"lbChk={(count is null ? "KHÔNG THẤY" : $"thấy 「{Txt.N(Uia.ValueOf(count))}」")}");

            if (panel is null || grid is null)
                Log("    ⚠ Thiếu control ⇒ sửa mục locators trong testsettings.json, KHÔNG sửa code. " +
                    "Cây UIA đầy đủ nằm ở artifacts\\screenshots\\*.uia.txt khi testcase đỏ.");
        });

        // ── KQ-2 + KQ-3 + KQ-4 ─────────────────────────────────────────────
        IReadOnlyList<string> baseMsgs = [];
        Safe("KQ-2 bam F3", () =>
        {
            var r = _flow.PressF3(trace);
            trace.Shot("01-sau-khi-bam-F3");
            Kq("2", $"panelOpened={r.PanelOpened} · I00100={(r.NoErrorDialog is null ? "không" : "CÓ")} · {r.Note}");

            if (r.NoErrorDialog is not null)
            {
                Log($"    nguyên văn I00100: 「{Txt.N(Dialogs.TextOf(r.NoErrorDialog))}」");
                Dialogs.ClickButton(r.NoErrorDialog, "OK", "はい", "Yes");
            }
        });

        Safe("KQ-3 doc noi dung panel", () =>
        {
            baseMsgs = _flow.PanelMessages();
            Kq("3", $"lbChk=「{_flow.PanelCountText()}」 (số = {_flow.PanelCount()?.ToString() ?? "?"}) · " +
                    $"đọc được {baseMsgs.Count} dòng từ grdChek");
            for (var i = 0; i < baseMsgs.Count; i++) Log($"    [{i + 1}] {baseMsgs[i]}");

            if (_flow.PanelCount() is { } n && n != baseMsgs.Count)
                Log($"    ⚠ LỆCH: lbChk nói {n}, đọc được {baseMsgs.Count}. Đây là lỗi ĐỌC (lưới cuộn — " +
                    "PROBE-GUIDELINE 3.1), KHÔNG phải app sai. Mọi assert phải mốc vào lbChk.");
        });

        Safe("KQ-4 doc nen co san cau 月次 nao", () =>
        {
            var hits = TrnCheckFlow.MonthlyMessages
                .Select(m => (Msg: m, N: _flow.CountContaining(baseMsgs, m)))
                .Where(x => x.N > 0)
                .ToList();

            Kq("4", hits.Count == 0
                ? "mốc SẠCH — dữ liệu nền chưa bắn câu 月次 nào. TC-BASE dùng được bệnh nhân/ngày này."
                : "mốc BẨN — nền đã có sẵn: " + string.Join(" · ", hits.Select(h => $"「{h.Msg}」×{h.N}")));

            if (hits.Any(h => h.Msg == TrnCheckFlow.MsgBuidis))
                Log("    ⚠ 当月部位病名 đã bắn ở tháng này ⇒ Check.cs:1246 return NGAY, 4 luật sau bị cắt. " +
                    "TC-ROL999 sẽ không bao giờ thấy câu rol999. Đổi patient.trtDate sang tháng có 病名, " +
                    "hoặc đổi patient.patNo.");
        });

        // ── KQ-5 + KQ-6 ────────────────────────────────────────────────────
        Safe("KQ-5 bam F3 lan hai", () =>
        {
            var wasOpen = _flow.PanelVisible();
            var closed = _flow.ClosePanel();
            Kq("5", $"trước khi bấm panel {(wasOpen ? "ĐANG MỞ" : "đang đóng")} → sau F3 lần hai " +
                    $"{(closed ? "ĐÃ ĐÓNG" : "VẪN MỞ")}. (frm203002.cs:4681 hứa là đóng + trả focus về hFG1)");
            trace.Shot("02-sau-khi-bam-F3-lan-hai");
        });

        Safe("KQ-6 PGDN cuon luoi loi", () =>
        {
            var r = _flow.PressF3(trace);
            if (!r.PanelOpened)
            {
                Kq("6", "bỏ qua — panel không mở lại được (tháng sạch hoặc F3 hụt). " + r.Note);
                return;
            }

            var read = _flow.PanelMessages();
            Kq("6", $"sau một vòng cuộn PGDN đọc được {read.Count} dòng " +
                    $"(lbChk nói {_flow.PanelCount()?.ToString() ?? "?"}). " +
                    (read.Count >= (_flow.PanelCount() ?? 0)
                        ? "⇒ cuộn ĂN, đọc được hết."
                        : "⇒ cuộn CHƯA đủ; đừng assert theo danh sách này, chỉ mốc vào lbChk."));
            trace.Shot("03-panel-sau-khi-cuon");
            _flow.ClosePanel();
        });

        // ── KQ-7 ───────────────────────────────────────────────────────────
        RegiRow? scalingRow = null;
        Safe("KQ-7 chen 165-1 スケーリング", () =>
        {
            var before = _flow.Grid.AllPointValue();
            var beforeRows = _flow.CountScalingRows();
            Log($"    trước khi chèn: 合計={before?.ToString() ?? "?"} điểm · {beforeRows} dòng スケーリング");

            var r = _flow.InsertFromKobetu(trace, TrnCheckFlow.ScalingCd, TrnCheckFlow.ScalingSb, "ｽｹｰﾘﾝｸﾞ", "スケーリング");
            trace.Shot("04-sau-khi-chen-165");

            Kq("7", $"inserted={r.Inserted} · W00100 bung {r.Warnings.Count} câu · {r.Note}");
            for (var i = 0; i < r.Warnings.Count; i++) Log($"    W00100 [{i + 1}] {r.Warnings[i]}");

            var after = _flow.Grid.AllPointValue();
            Log($"    sau khi chèn: 合計={after?.ToString() ?? "?"} điểm · {_flow.CountScalingRows()} dòng スケーリング " +
                $"(mốc NGOÀI lưới, miễn nhiễm với cuộn — PROBE-GUIDELINE 3.1)");

            scalingRow = _flow.Grid.LastRowMatching("ｽｹｰﾘﾝｸﾞ", "スケーリング");
            Log($"    dòng vừa chèn: {(scalingRow is null ? "KHÔNG dò ra trên lưới" : scalingRow.ToString())}");
        });

        // ── KQ-8 ───────────────────────────────────────────────────────────
        Safe("KQ-8 dat 回数 = 2", () =>
        {
            if (scalingRow is null)
            {
                Kq("8", "bỏ qua — KQ-7 chưa chèn được dòng スケーリング nào.");
                return;
            }

            var r = _flow.SetCount(trace, scalingRow, 2);
            trace.Shot("05-sau-khi-dat-so-lan-2");
            Kq("8", $"W00100 bung {r.Warnings.Count} câu sau khi chốt ô 回数 " +
                    "(frm203002.cs:5678 → new SingleChk(…, curRow, 1))");
            for (var i = 0; i < r.Warnings.Count; i++) Log($"    W00100 [{i + 1}] {r.Warnings[i]}");
        });

        // ── KQ-9 ───────────────────────────────────────────────────────────
        Safe("KQ-9 chen du 3 dong roi bam F3", () =>
        {
            for (var i = _flow.CountScalingRows(); i < 3; i++)
            {
                var r = _flow.InsertFromKobetu(trace, TrnCheckFlow.ScalingCd, TrnCheckFlow.ScalingSb, "ｽｹｰﾘﾝｸﾞ", "スケーリング");
                Log($"    chèn thêm dòng スケーリング #{i + 1}: inserted={r.Inserted}, " +
                    $"W00100 {r.Warnings.Count} câu — {r.Note}");
                if (!r.Inserted) break;

                var row = _flow.Grid.LastRowMatching("ｽｹｰﾘﾝｸﾞ", "スケーリング");
                if (row is not null) _flow.SetCount(trace, row, 2);
            }

            var rows = _flow.CountScalingRows();
            var sweep = _flow.PressF3(trace);
            trace.Shot("06-F3-sau-khi-du-3-dong");

            if (!sweep.PanelOpened)
            {
                Kq("9", $"{rows} dòng スケーリング nhưng F3 KHÔNG mở panel — {sweep.Note}");
                return;
            }

            var msgs = _flow.PanelMessages();
            var rol999 = _flow.CountContaining(msgs, TrnCheckFlow.MsgRol999);
            var buidis = _flow.CountContaining(msgs, TrnCheckFlow.MsgBuidis);

            Kq("9", $"{rows} dòng スケーリング → lbChk=「{_flow.PanelCountText()}」 · " +
                    $"「{TrnCheckFlow.MsgRol999}」 ×{rol999} · 「{TrnCheckFlow.MsgBuidis}」 ×{buidis}");
            for (var i = 0; i < msgs.Count; i++) Log($"    [{i + 1}] {msgs[i]}");

            Log(rol999 switch
            {
                0 when buidis > 0 =>
                    "    ⇒ rol999 = 0 vì 当月部位病名 đã CẮT chuỗi (Check.cs:1246). Đây chính là tình " +
                    "huống của TC-BUIDIS, nhưng nó làm TC-ROL999 không đo được ở tháng này.",
                0 => "    ⇒ rol999 = 0 mà 当月部位病名 KHÔNG bắn ⇒ ngưỡng chưa vượt. Cần thêm dòng " +
                     "スケーリング hoặc tăng 回数 (ngưỡng = số ブロック của 部位 đã算定).",
                1 => "    ⇒ ĐÚNG 1 câu cho cả tháng — khớp Check.cs:1269 (月次, không có dòng hiện hành). " +
                     "Đây là con số mà TC-ROL999 sẽ khoá.",
                _ => $"    ⇒ {rol999} câu giống nhau ⇒ WinForm đang chạy per-row?! Trái với đọc source " +
                     "(:1269 nằm NGOÀI vòng lặp dòng). Xem lại ảnh trước khi tin con số này.",
            });

            _flow.ClosePanel();
        });

        Safe("don dep hop thoai con lai", () => _flow.Entry.DismissAll());
        trace.Shot("07-ket-thuc");

        Log("");
        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ HẾT PROBE — KHÔNG bấm F9, lưới bẩn nhưng DB nguyên vẹn           ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
    }
}
