using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>PROBE G0 — 窓口精算 (SEISAN). KHÔNG assert, không bao giờ ném.</b>
///
/// Đi qua 8/9 form của SEISAN (trừ frm204005 cần ACCDAT, frm204007 chỉ bung sau F9 登録)
/// và đổ ra cho MỖI trạng thái:
/// <list type="bullet">
///   <item><c>&lt;nhãn&gt;.controls.tsv</c> — bảng control (id, type, name, value, enabled,
///     offscreen, rect): đầu vào để viết G1 mà không phải đoán AutomationId;</item>
///   <item><c>&lt;nhãn&gt;.uia.txt</c> — cây UIA đầy đủ;</item>
///   <item>một ảnh qua <c>TestTrace</c>.</item>
/// </list>
///
/// <code>
///  KQ-1  ACCCONFIG / YOYAKUCONFIG / thuế CODMST 90x + UNPAID vừa seed + mẫu UNPAID thật
///  KQ-2  frm204001: hai chế độ 未精算患者 ⇄ 患者検索 (F1)
///  KQ-3  frm204008 来患一覧 (F3) — vào và lùi bằng F10
///  KQ-4  frm204004 入力一覧 (F2 từ 204001)
///  KQ-5  frm204002 mở với UNPAID seed: hộp thoại lúc mở (Q00017?), giá trị các ô tổng
///  KQ-6  F7 入金 mode → F3 明細 (frm204006 hay I00004) → F7 về 請求
///  KQ-7  F2 物品 (frm204003) → F1 販売履歴 (frm204009)
///  KQ-8  F6 返金 — ô nào bật/tắt
///  KQ-9  F1 領収書発行 → frm204004 (Print)
///  KQ-10 F8 訂正 → frm204004 (Update)
///  KQ-11 F10 戻る trên frm204002 — Q00004 「登録せずに」 → về frm204001
///  KQ-12 Số dòng UNPAID/ACCDAT/PERSON_EXP/PRT_RCT/YOYAKU + GOODS_STOCK_HISTORY trước = sau
/// </code>
///
/// <para><b>Ghi DB:</b> chỉ dựng bệnh nhân test (990000+) và chèn 2 dòng UNPAID cho nó;
/// cả hai bị <c>SeededPatientTestBase</c> xoá cuối lượt. Probe KHÔNG bấm F9 trên
/// frm204002 và KHÔNG bao giờ gửi ESC/End (= 登録, frm204002.cs:1102).</para>
///
/// <para>Chạy: <c>.\run-seisan.ps1 -Diagnostics</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("seisan")]
public sealed class SeisanProbeTests : SeededPatientTestBase
{
    private SeisanDb? _db;
    private Window? _current;
    private IReadOnlyDictionary<string, int> _countsBefore = new Dictionary<string, int>();
    private int? _goodsBefore;

    protected override bool NavigatesToTreatmentEntry => false;

    protected override AutomationElement? UiaDumpRoot => _current;

    /// <summary>Hộp thoại của SEISAN chính là thứ đang đo — không để watcher trả lời hộ.</summary>
    protected override string[] NuisanceDialogPatterns => [];

    private int TestPatNo => int.Parse(Settings.Patient.PatNo);

    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
        if (SeededPatient is null) return;

        _db = SeisanDb.CreateOrNull(Settings);
        if (_db is null) return;

        var br = _db.FirstPatBr(SeededPatient.PatNo);
        // 医療保険 km_cd 40 + 自費 km_cd 50, cả hai 入金指定なし (rece_amt = -1).
        var n = _db.SeedUnpaid(SeededPatient.PatNo, br,
        [
            new SeisanDb.UnpaidSeed(TrtDate, KmCd: 40, Score: 300, ClaimAmt: 900, ScoreD1: 50, ScoreD9: 250),
            new SeisanDb.UnpaidSeed(TrtDate, KmCd: 50, Score: 0, ClaimAmt: 5000, Tax: 500),
        ]);
        Log($"seed UNPAID: {n} dòng cho bệnh nhân {SeededPatient.PatNo} 枝番 {br} ngày {TrtDate:yyyy-MM-dd}");
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(int n, string line) => Log($"=== KQ-{n} === {line}");

    // ── KQ-1 ─────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    public void Tc0a_CauHinhVaDuLieu()
    {
        if (_db is null || SeededPatient is null)
        {
            Kq(1, "BỎ QUA: không có DB hoặc không dựng được bệnh nhân test");
            return;
        }

        void Dump(string what, string sql, int? pat = null)
        {
            try
            {
                var rows = _db.Rows(sql, pat);
                Kq(1, $"{what}: {rows.Count} dòng");
                foreach (var r in rows) Kq(1, "  " + r);
            }
            catch (Exception e) { Kq(1, $"{what}: NGOẠI LỆ {e.Message}"); }
        }

        Dump("ACCCONFIG", "SELECT * FROM ACCCONFIG");
        Dump("YOYAKUCONFIG", "SELECT * FROM YOYAKUCONFIG");
        Dump("CODMST thuế (CD_TYPE 900-909)",
             "SELECT CD_TYPE, CD_VAL, ANY_VAL2, START_DT, END_DT FROM CODMST WHERE CD_TYPE BETWEEN 900 AND 909");
        Dump("UNPAID bệnh nhân test", "SELECT * FROM UNPAID WHERE PAT_NO = @p", SeededPatient.PatNo);
        Dump("PERSON_EXP bệnh nhân test", "SELECT * FROM PERSON_EXP WHERE PAT_NO = @p", SeededPatient.PatNo);
        Dump("UNPAID thật (mẫu 5 dòng mới nhất, để so hình dạng dòng seed)",
             $"SELECT TOP 5 * FROM UNPAID WHERE PAT_NO < {TestPatientDb.TestPatNoBase} ORDER BY TRT_DT DESC");

        _countsBefore = _db.CountPatientRows(SeededPatient.PatNo);
        _goodsBefore = _db.CountGoodsStockHistory();
        Kq(1, "số dòng TRƯỚC: " + string.Join(", ", _countsBefore.Select(kv => $"{kv.Key}={kv.Value}")) +
              $", GOODS_STOCK_HISTORY={_goodsBefore?.ToString() ?? "?"}");
    }

    // ── KQ-2 ─────────────────────────────────────────────────────────────────

    [Test, Order(2)]
    public void Tc0b_ManChonBenhNhan()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0b_204001");
        try
        {
            trace.Step("mở 窓口精算 từ menu");
            _current = SeisanNav.OpenCounter(App, Settings);
            Answer(2, trace, "sau khi mở frm204001");
            Visit(2, trace, "204001_unpaid", _current);

            var w = Go(2, trace, Vk.F1, SeisanNav.Counter, "F1 → 患者検索一覧");
            if (w is not null) Visit(2, trace, "204001_patinfo", w);
            w = Go(2, trace, Vk.F1, SeisanNav.Counter, "F1 → 未精算患者一覧 (trở lại)");
            if (w is not null) _current = w;
        }
        catch (Exception e) { trace.Fail("Tc0b", e); Kq(2, "NGOẠI LỆ: " + e.Message); }
    }

    // ── KQ-3, KQ-4 ───────────────────────────────────────────────────────────

    [Test, Order(3)]
    public void Tc0c_LaiKanIchiran()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0c_204008");
        RoundTrip(3, trace, Vk.F3, SeisanNav.VisitList, "204008_visitlist", SeisanNav.Counter);
    }

    [Test, Order(4)]
    public void Tc0d_NyuryokuIchiran()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0d_204004List");
        RoundTrip(4, trace, Vk.F2, SeisanNav.ReceiptList, "204004_list", SeisanNav.Counter);
    }

    // ── KQ-5 ─────────────────────────────────────────────────────────────────

    [Test, Order(5)]
    public void Tc0e_MoManSeisan()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0e_204002");
        try
        {
            var counter = App.Window(SeisanNav.Counter);
            if (counter is null) { Kq(5, "BỎ QUA: không đứng ở frm204001 — " + SeisanNav.DescribeDialogs(App)); return; }

            trace.Step($"gõ 患者番号 {TestPatNo} + F9");
            SeisanNav.EnterPatient(counter, TestPatNo);
            Answer(5, trace, "lúc mở frm204002 (Q00017 初診?)");

            var w = Waits.TryFor(() => App.Window(SeisanNav.Seisan), TimeSpan.FromSeconds(20));
            if (w is null) { Kq(5, "frm204002 KHÔNG mở. " + SeisanNav.DescribeDialogs(App)); return; }
            _current = w;
            Answer(5, trace, "sau khi frm204002 hiện");
            Visit(5, trace, "204002_seikyu", w);

            foreach (var id in new[]
                     {
                         "txtScoreTotal", "txtAccRate", "txtAmountTotalH", "txtDiscountH", "txtClaimH",
                         "txtAmountTotalJ", "txtDiscountJ", "txtTaxJ", "txtClaimJ",
                         "txtAmountTotalB", "txtClaimB", "txtClaimTotal", "txtAppr", "txtRece", "lblRece2",
                         "cboReceKbn", "cboReceType", "rdoPrintOff", "rdoPrintOn", "rdoPrintOn2", "dtRece",
                     })
                Kq(5, $"{id} = 「{Read(w, id)}」");
        }
        catch (Exception e) { trace.Fail("Tc0e", e); Kq(5, "NGOẠI LỆ: " + e.Message); }
    }

    // ── KQ-6 ─────────────────────────────────────────────────────────────────

    [Test, Order(6)]
    public void Tc0f_NyukinMode()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0f_Nyukin");
        try
        {
            if (Seisan() is not { } w) return;

            w = Go(6, trace, Vk.F7, SeisanNav.Seisan, "F7 入金/請求 → chế độ 入金");
            if (w is null) return;
            Visit(6, trace, "204002_nyukin", w);

            // F7 tự điền 本日入金 = 請求合計 (changeF7, frm204002.cs:2100) ⇒ F3 báo I00004
            // 「明細入力は不要です」. Gõ 入金 nhỏ hơn 請求 thì F3 mới mở frm204006 (:937).
            trace.Step("gõ 本日入金 = 1000 + Enter");
            SeisanNav.TypeAndEnter(w, "txtRece", "1000");
            foreach (var id in new[] { "txtRece", "txtReceChange", "txtShortageTotal", "lblRece2" })
                Kq(6, $"sau 入金 1000: {id} = 「{Read(w, id)}」");

            var d = Go(6, trace, Vk.F3, SeisanNav.ReceDetail, "F3 明細 (入金 mode)");
            if (d is not null)
            {
                Visit(6, trace, "204006_receDetail", d);
                Go(6, trace, Vk.F10, SeisanNav.Seisan, "F10 trên frm204006");
            }

            w = Go(6, trace, Vk.F7, SeisanNav.Seisan, "F7 lần hai → về chế độ 請求");
            if (w is not null) Visit(6, trace, "204002_seikyu_after_f7x2", w);
        }
        catch (Exception e) { trace.Fail("Tc0f", e); Kq(6, "NGOẠI LỆ: " + e.Message); }
    }

    // ── KQ-7 ─────────────────────────────────────────────────────────────────

    [Test, Order(7)]
    public void Tc0g_Buppin()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0g_Goods");
        try
        {
            if (Seisan() is null) return;

            var g = Go(7, trace, Vk.F2, SeisanNav.Goods, "F2 物品");
            if (g is null) return;
            Visit(7, trace, "204003_goods", g);

            var h = Go(7, trace, Vk.F1, SeisanNav.GoodsHistory, "F1 販売履歴");
            if (h is not null)
            {
                Visit(7, trace, "204009_goodsHistory", h);
                Go(7, trace, Vk.F10, SeisanNav.Goods, "F10 trên frm204009");
            }
            Go(7, trace, Vk.F10, SeisanNav.Seisan, "F10 trên frm204003");
        }
        catch (Exception e) { trace.Fail("Tc0g", e); Kq(7, "NGOẠI LỆ: " + e.Message); }
    }

    // ── KQ-8 ─────────────────────────────────────────────────────────────────

    [Test, Order(8)]
    public void Tc0h_Henkin()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0h_Henkin");
        try
        {
            if (Seisan() is null) return;

            var w = Go(8, trace, Vk.F6, SeisanNav.Seisan, "F6 返金");
            if (w is null) return;
            Visit(8, trace, "204002_henkin", w);

            // F7 bật lại vùng 点数/入金 (frm204002.cs:1032-1054) — nhưng nó cũng đảo
            // _inpMode, nên bấm thêm một lần nữa để về đúng 請求.
            w = Go(8, trace, Vk.F7, SeisanNav.Seisan, "F7 sau 返金");
            if (w is not null) Kq(8, $"sau F7: lblRece2=「{Read(w, "lblRece2")}」");
            w = Go(8, trace, Vk.F7, SeisanNav.Seisan, "F7 lần hai");
            if (w is not null) Visit(8, trace, "204002_after_henkin", w);
        }
        catch (Exception e) { trace.Fail("Tc0h", e); Kq(8, "NGOẠI LỆ: " + e.Message); }
    }

    // ── KQ-9, KQ-10 ──────────────────────────────────────────────────────────

    [Test, Order(9)]
    public void Tc0i_RyoshushoPrint()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0i_204004Print");
        if (Seisan() is null) return;
        RoundTrip(9, trace, Vk.F1, SeisanNav.ReceiptList, "204004_print", SeisanNav.Seisan);
    }

    [Test, Order(10)]
    public void Tc0j_Teisei()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0j_204004Update");
        if (Seisan() is null) return;
        RoundTrip(10, trace, Vk.F8, SeisanNav.ReceiptList, "204004_update", SeisanNav.Seisan);
    }

    // ── KQ-11 ────────────────────────────────────────────────────────────────

    [Test, Order(11)]
    public void Tc0k_Modoru()
    {
        using var trace = TestTrace.Begin("Seisan_Tc0k_F10");
        try
        {
            if (Seisan() is null) return;
            var c = Go(11, trace, Vk.F10, SeisanNav.Counter, "F10 戻る trên frm204002");
            if (c is not null) Visit(11, trace, "204001_after_f10", c);
        }
        catch (Exception e) { trace.Fail("Tc0k", e); Kq(11, "NGOẠI LỆ: " + e.Message); }
    }

    // ── KQ-12 ────────────────────────────────────────────────────────────────

    [Test, Order(12)]
    public void Tc0z_KhongGhiGi()
    {
        if (_db is null || SeededPatient is null) { Kq(12, "BỎ QUA: không có DB"); return; }
        try
        {
            var after = _db.CountPatientRows(SeededPatient.PatNo);
            var goods = _db.CountGoodsStockHistory();
            Kq(12, "số dòng SAU: " + string.Join(", ", after.Select(kv => $"{kv.Key}={kv.Value}")) +
                   $", GOODS_STOCK_HISTORY={goods?.ToString() ?? "?"}");
            var changed = after.Where(kv => _countsBefore.TryGetValue(kv.Key, out var b) && b != kv.Value)
                               .Select(kv => $"{kv.Key} {_countsBefore[kv.Key]}→{kv.Value}").ToList();
            if (goods != _goodsBefore) changed.Add($"GOODS_STOCK_HISTORY {_goodsBefore}→{goods}");
            Kq(12, changed.Count == 0 ? "KHÔNG đổi — probe không ghi gì" : "⚠ ĐÃ ĐỔI: " + string.Join(", ", changed));
        }
        catch (Exception e) { Kq(12, "NGOẠI LỆ: " + e.Message); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bước dùng chung
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>frm204002 đang hiện; không thì ghi KQ và trả null.</summary>
    private Window? Seisan()
    {
        var w = App.Window(SeisanNav.Seisan);
        if (w is null || SeisanNav.ChildForms(w).Count > 0)
        {
            Log($"BỎ QUA bước: frm204002 không đứng trên cùng — [{SeisanNav.DescribeForms(App)}] " +
                SeisanNav.DescribeDialogs(App));
            return null;
        }
        _current = w;
        return w;
    }

    /// <summary>Bấm một phím trên cửa sổ hiện tại, trả lời hộp thoại an toàn, chờ <paramref name="expectId"/>.</summary>
    private Window? Go(int kq, TestTrace trace, ushort vk, string expectId, string what)
    {
        var from = _current ?? throw new InvalidOperationException("chưa có cửa sổ hiện tại");
        trace.Step(what);
        SeisanNav.Press(from, vk);
        Answer(kq, trace, what);

        // Tới đích = form hiện VÀ không còn form modal nào đè lên nó (F10 trên modal
        // phải thật sự đóng modal, không chỉ 「thấy form cha」).
        var w = Waits.TryFor(() => SeisanNav.Form(App, expectId) is { } f && SeisanNav.ChildForms(f).Count == 0 ? f : null,
                             TimeSpan.FromSeconds(10));
        var shown = SeisanNav.DescribeForms(App);
        if (w is null && Uia.ById(from, $"btnF{vk - 0x6F}") is { } button)
        {
            // Đo 2026-10-20: F10 gửi vào frm204003 (sau khi frm204009 đóng) không đóng nó.
            // Click nút để biết là PHÍM không tới, hay chính nút cũng không chạy.
            Kq(kq, $"{what}: phím không đưa tới {expectId} ([{shown}]) — thử click nút btnF{vk - 0x6F}");
            Uia.MouseClick(button);
            Answer(kq, trace, what + " (click)");
            w = Waits.TryFor(() => SeisanNav.Form(App, expectId) is { } f && SeisanNav.ChildForms(f).Count == 0 ? f : null,
                             TimeSpan.FromSeconds(8));
            shown = SeisanNav.DescribeForms(App);
        }
        if (w is null)
        {
            Kq(kq, $"{what}: KHÔNG thấy {expectId}. Cửa sổ đang hiện: [{shown}]. {SeisanNav.DescribeDialogs(App)}");
            trace.Shot($"khong-thay-{expectId}");
            return null;
        }
        Kq(kq, $"{what}: tới {expectId} 「{Uia.NameOf(w)}」. Cửa sổ đang hiện: [{shown}]");
        _current = w;
        return w;
    }

    private void RoundTrip(int kq, TestTrace trace, ushort vk, string targetId, string label, string backId)
    {
        try
        {
            var t = Go(kq, trace, vk, targetId, $"vào {label}");
            if (t is null) return;
            Visit(kq, trace, label, t);
            Go(kq, trace, Vk.F10, backId, $"F10 rời {label}");
        }
        catch (Exception e) { trace.Fail(label, e); Kq(kq, "NGOẠI LỆ: " + e.Message); }
    }

    private void Answer(int kq, TestTrace trace, string when)
    {
        var answered = SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(6));
        foreach (var a in answered) Kq(kq, $"hộp thoại {when}: {a}");
        if (answered.Count > 0) trace.Note($"{answered.Count} hộp thoại {when}");
    }

    /// <summary>Ảnh + cây UIA + bảng control + nhãn phím F của một trạng thái.</summary>
    private void Visit(int kq, TestTrace trace, string label, Window w)
    {
        trace.Shot(label);
        try
        {
            var dir = UiaDir();
            var table = SeisanNav.ControlTable(w);
            File.WriteAllText(Path.Combine(dir, label + ".controls.tsv"), table);
            File.WriteAllText(Path.Combine(dir, label + ".uia.txt"), Uia.DumpTree(w, maxDepth: 10, maxChildrenPerNode: 80));

            var lines = table.Split('\n').Skip(1).Where(l => l.Length > 0).ToList();
            Kq(kq, $"[{label}] 「{Uia.NameOf(w)}」 {lines.Count} control → {label}.controls.tsv");

            // Nhãn phím F — bộ thường (btnFn) và bộ Shift (btnFn_S, panel pnlShiftButton).
            var fkeys = lines.Select(l => l.Split('\t'))
                             .Where(c => c.Length > 4 && c[0].StartsWith("btnF", StringComparison.Ordinal))
                             .Select(c => $"{c[0]}=「{c[2]}」{(c[4] == "1" ? "" : "(tắt)")}")
                             .ToList();
            Kq(kq, $"[{label}] phím F: {string.Join(" ", fkeys)}");
        }
        catch (Exception e) { Kq(kq, $"[{label}] không đổ được control: {e.Message}"); }
    }

    private static string Read(Window w, string id)
    {
        try
        {
            var el = Uia.ById(w, id);
            if (el is null) return "(không có)";
            var v = Uia.ValueOf(el);
            return string.IsNullOrEmpty(v) ? Uia.NameOf(el) : v;
        }
        catch (Exception e) { return "(lỗi " + e.Message + ")"; }
    }

    private string UiaDir()
    {
        var root = Settings.Run.ScreenshotDir;
        var baseDir = Path.IsPathRooted(root) ? root : Path.Combine(AppContext.BaseDirectory, root);
        var dir = Path.Combine(baseDir, "Seisan_uia");
        Directory.CreateDirectory(dir);
        return dir;
    }
}
