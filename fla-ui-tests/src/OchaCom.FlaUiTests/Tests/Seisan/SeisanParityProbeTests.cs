using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>PROBE — các mục web ↔ WinForm còn nghi sau khi viết spec web (2026-10-27). KHÔNG assert.</b>
///
/// <code>
///  KQ-1  204001: chữ tiêu đề lưới 未精算患者一覧 (web 「≪…≫」)
///  KQ-2  204002 vừa mở, chưa sửa: F12 có hỏi Q00004 không (web mở menu luôn)
///  KQ-3  204002: xoá ô 日 của 入金日 rồi F9 ⇒ hộp gì (web: chữ đỏ dưới ô)
///  KQ-4  204003 → F1 204009: thứ tự dòng cùng ngày, dòng 数量 0, định dạng 日付; click dòng + CLICK nút F9
///  KQ-5  204004 List (F2 từ 204001): tiêu đề cột, F8 chưa tick, tick + F8 ⇒ nguyên văn Q00016 (Cancel)
///  KQ-6  204004 Update (F8 từ 204002): tiêu đề cột
///  KQ-7  204008: ESC có chạy 集計 không
/// </code>
///
/// <para>Ghi DB: chỉ bệnh nhân test 990000+ (UNPAID nền + ACCDAT km 40/50 hôm nay + km 59 lịch sử),
/// base xoá sạch cuối lượt. Không F9 thật trên 204002; mọi hộp xác nhận đều trả Cancel/いいえ.</para>
/// <para>Chạy: <c>.\run-seisan.ps1 -Case SeisanParityProbe</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("seisan")]
public sealed class SeisanParityProbeTests : SeisanTestBase
{
    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(int n, string line) => Log($"=== KQ-{n} === {line}");

    private void Snapshot(string label)
    {
        try
        {
            var dir = Settings.Run.ScreenshotDir;
            var root = Path.IsPathRooted(dir) ? dir : Path.Combine(AppContext.BaseDirectory, dir);
            var path = ScreenCapture.CaptureToFile(root, $"seisan-parity_{label}_{DateTime.Now:HHmmss}");
            TestContext.AddTestAttachment(path, label);
            Log($"=== ANH === {label}: {path}");
        }
        catch (Exception e) { Log($"khong chup duoc man hinh ({label}): {e.Message}"); }
    }

    /// <summary>Chờ hộp thoại đầu tiên, chụp ảnh khi nó còn mở, ghi nguyên văn + nút, rồi trả lời theo luật an toàn.</summary>
    private void CaptureDialog(int kq, string label, TimeSpan wait, string? click = null)
    {
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), wait);
        if (box is null) { Kq(kq, $"{label}: KHÔNG có hộp thoại trong {wait.TotalSeconds:0}s"); return; }
        Kq(kq, $"{label}: hộp 「{box.Text.Replace("\r", "\\r").Replace("\n", "\\n")}」 nút [{string.Join("|", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]");
        Snapshot(label);
        if (click is not null)
        {
            Kq(kq, $"{label}: bấm {click} = {MsgBoxWin32.ClickButton(box.Hwnd, click)}");
            Thread.Sleep(400);
        }
        foreach (var a in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(4))) Kq(kq, $"{label}: trả lời {a}");
    }

    /// <summary>Đứng ở 204001; app đã về MainMenu (ca trước hỏng) thì mở lại.</summary>
    private Window Counter()
    {
        if (SeisanNav.Form(App, SeisanNav.Counter) is null && SeisanNav.Form(App, SeisanNav.Seisan) is null)
        {
            Current = SeisanNav.OpenCounter(App, Settings);
            SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3));
        }
        LeaveSeisan();
        return Wait(SeisanNav.Counter, TimeSpan.FromSeconds(15));
    }

    private Window OpenSeisanFresh()
    {
        var c = Counter();
        SeisanNav.EnterPatient(c, TestPatNo);
        SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3));
        return Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(20));
    }

    private void SeedAccDat()
    {
        // TRT_DT 1900-01-01 cho dòng 物品 giống dữ liệu thật (ACCDAT km 59 có sẵn trong DB).
        const string insert = """
            INSERT INTO ACCDAT (ACC_DT, ACC_CNT, TRT_DT, TRT_CNT, PAT_NO, KM_CD, SCORE, CLAIM_AMT, DISCOUNT, TAX,
                ACCR_AMT, ACCR_TAX, APPR_AMT, APPR_TAX, RECE_AMT, RECE_TAX, RECE_KBN, PFLG, SFLG, GDS_CD, GDS_CNT,
                ATT_DR, ACC_TM, MEDS, TFLG, NTE, SCORE_D1, SCORE_D2, SCORE_D3, SCORE_D4, SCORE_D5, SCORE_D6, SCORE_D7,
                SCORE_D8, SCORE_D9, SCORE_D10, SCORE_D11, SCORE_D12, SCORE_D13, SCORE_D14, PAT_BR, LFLG, DEL_FLG, GDS_SB)
            VALUES ({0}, {1}, {2}, 1, @p, {3}, {4}, {5}, 0, {6}, 0, 0, 0, 0, {5}, {6}, 1, 1, 0, {7}, {8},
                1, GETDATE(), 0, 0, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0)
            """;
        var today = "CONVERT(date, GETDATE())";
        var trt = $"'{TrtDate:yyyy-MM-dd}'";
        foreach (var (acc, cnt, trtDt, km, score, amt, tax, gds, qty) in new[]
                 {
                     (today, 1, trt, 40, 300, 900, 0, 0, 0),
                     (today, 1, trt, 50, 0, 5000, 500, 0, 0),
                     ("'2026-10-01'", 1, "'1900-01-01'", 59, 0, 2000, 200, 803, 1),
                     ("'2026-10-01'", 2, "'1900-01-01'", 59, 0, 1636, 164, 800, 2),
                     ("'2026-09-15'", 1, "'1900-01-01'", 59, 0, 200, 10, 0, 0),
                 })
            Db2.Rows(string.Format(insert, acc, cnt, trtDt, km, score, amt, tax, gds, qty), TestPatNo);
        foreach (var r in Db2.Rows("SELECT ACC_DT, ACC_CNT, KM_CD, GDS_CD, GDS_CNT, RECE_AMT FROM ACCDAT WHERE PAT_NO = @p ORDER BY ACC_DT, ACC_CNT, KM_CD", TestPatNo))
            Log("seed ACCDAT: " + r);
    }

    private void DumpGrid(int kq, string label, Window w, string gridId = "dgvView")
    {
        var gridEl = Uia.ById(w, gridId);
        if (gridEl is null) { Kq(kq, $"{label}: không có {gridId}"); return; }
        var grid = new WinFormsGrid(gridEl);
        Kq(kq, $"{label}: cột = {string.Join(" | ", grid.Headers().Select(h => $"「{h}」"))}");
        foreach (var row in grid.Rows(30)) Kq(kq, $"{label}: dòng {row}");
    }

    [Test, Order(1)]
    public void Kq1_TieuDe204001()
    {
        using var trace = TestTrace.Begin("SeisanParity_Kq1");
        try
        {
            SeedAccDat();
            Current = SeisanNav.OpenCounter(App, Settings);
            SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3));
            var c = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(30));
            foreach (var t in c.FindAllDescendants().Where(e => Txt.Has(Uia.NameOf(e), "未精算") || Txt.Has(Uia.ValueOf(e), "未精算")))
                Kq(1, $"chữ: {Uia.ControlTypeOf(t)} id={Uia.AutomationIdOf(t)} name=「{Uia.NameOf(t)}」 value=「{Uia.ValueOf(t)}」");
            Snapshot("kq1-204001");
        }
        catch (Exception e) { trace.Fail("Kq1", e); Kq(1, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(2)]
    public void Kq2_F12ChuaSua()
    {
        using var trace = TestTrace.Begin("SeisanParity_Kq2");
        try
        {
            var s = OpenSeisanFresh();
            SeisanNav.Press(s, Vk.F12);
            CaptureDialog(2, "kq2-f12", TimeSpan.FromSeconds(5), click: "Cancel");
            Kq(2, "sau khi trả lời: " + SeisanNav.DescribeForms(App));
        }
        catch (Exception e) { trace.Fail("Kq2", e); Kq(2, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(3)]
    public void Kq3_NgayNhapTienThieuNgay()
    {
        using var trace = TestTrace.Begin("SeisanParity_Kq3");
        try
        {
            var s = OpenSeisanFresh();
            var dt = Uia.RequireById(s, "dtRece");
            var day = Uia.RequireById(dt, "txtDay");
            Kq(3, $"日 trước khi xoá: 「{RawValue(day)}」");
            SeisanNav.ClearByKeys(day);
            Kq(3, $"日 sau khi xoá: 「{RawValue(day)}」");
            SeisanNav.Press(s, Vk.F9);
            CaptureDialog(3, "kq3-f9", TimeSpan.FromSeconds(5));
            var rest = SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3));
            foreach (var a in rest) Kq(3, "hộp kế tiếp: " + a);
            Kq(3, "ACCDAT km 40/50 hôm nay sau F9 (phải vẫn 2): " +
                  Db2.Scalar($"SELECT COUNT(*) FROM ACCDAT WHERE PAT_NO = {TestPatNo} AND KM_CD IN (40, 50)"));
            Kq(3, "UNPAID sau F9 (phải vẫn 2): " + Db2.Scalar($"SELECT COUNT(*) FROM UNPAID WHERE PAT_NO = {TestPatNo}"));
        }
        catch (Exception e) { trace.Fail("Kq3", e); Kq(3, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(4)]
    public void Kq4_LichSuBanHang()
    {
        using var trace = TestTrace.Begin("SeisanParity_Kq4");
        try
        {
            OpenSeisanFresh();
            var goods = Go(Vk.F2, SeisanNav.Goods);
            var hist = Go(Vk.F1, SeisanNav.GoodsHistory);
            Thread.Sleep(800);
            DumpGrid(4, "204009", hist);
            Kq(4, "hộp thoại khi mở 204009: " + SeisanNav.DescribeDialogs(App));
            Snapshot("kq4-204009");

            var grid = new WinFormsGrid(Uia.RequireById(hist, "dgvView"));
            var row803 = grid.RowElements(30).FirstOrDefault(r => grid.Row(r).Cells.Any(x => x.Trim() == "803-0"));
            if (row803 is null) { Kq(4, "BỎ QUA chọn: không thấy dòng 803-0"); return; }
            Uia.MouseClick(Uia.Children(row803).Skip(1).First());
            Thread.Sleep(500);
            Uia.MouseClick(Uia.RequireById(hist, "btnF9"));
            Kq(4, "sau CLICK nút F9 選択: 204009 còn mở = " +
                  (Waits.TryFor(() => SeisanNav.Form(App, SeisanNav.GoodsHistory), TimeSpan.FromSeconds(3)) is not null));
            var g = Wait(SeisanNav.Goods, TimeSpan.FromSeconds(10));
            DumpGrid(4, "204003 sau chọn", g);
            Snapshot("kq4-204003-after-select");
            Go(Vk.F10, SeisanNav.Seisan);
        }
        catch (Exception e) { trace.Fail("Kq4", e); Kq(4, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(5)]
    public void Kq5_NhapLietKe204004()
    {
        using var trace = TestTrace.Begin("SeisanParity_Kq5");
        try
        {
            Counter();
            var list = Go(Vk.F2, SeisanNav.ReceiptList, TimeSpan.FromSeconds(20));
            Thread.Sleep(800);
            DumpGrid(5, "204004 List", list);
            Snapshot("kq5-list");

            SeisanNav.Press(list, Vk.F8);
            CaptureDialog(5, "kq5-f8-chua-tick", TimeSpan.FromSeconds(5));

            var grid = new WinFormsGrid(Uia.RequireById(list, "dgvView"));
            var mine = grid.RowElements(50).FirstOrDefault(r => grid.Row(r).Cells.Any(x => x.Trim() == TestPatNo.ToString()));
            if (mine is null) { Kq(5, "BỎ QUA tick: không thấy dòng bệnh nhân test"); }
            else
            {
                var flg = Uia.Children(mine).First();
                Uia.MouseClick(flg);
                Waits.TryUntil(() => Uia.ValueOf(flg) == "True", TimeSpan.FromSeconds(3));
                Kq(5, $"ô tick sau click: 「{Uia.ValueOf(flg)}」");
                SeisanNav.Press(list, Vk.F8);
                CaptureDialog(5, "kq5-f8-q00016", TimeSpan.FromSeconds(5));
                Kq(5, "ACCDAT hôm nay sau Cancel (phải vẫn 2): " +
                      Db2.Scalar($"SELECT COUNT(*) FROM ACCDAT WHERE PAT_NO = {TestPatNo} AND KM_CD IN (40, 50)"));
            }
            Go(Vk.F10, SeisanNav.Counter);
        }
        catch (Exception e) { trace.Fail("Kq5", e); Kq(5, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(6)]
    public void Kq6_TieuDeCotUpdate()
    {
        using var trace = TestTrace.Begin("SeisanParity_Kq6");
        try
        {
            OpenSeisanFresh();
            var upd = Go(Vk.F8, SeisanNav.ReceiptList, TimeSpan.FromSeconds(20));
            Thread.Sleep(800);
            DumpGrid(6, "204004 Update", upd);
            Snapshot("kq6-update");
            Go(Vk.F10, SeisanNav.Seisan);
            LeaveSeisan();
        }
        catch (Exception e) { trace.Fail("Kq6", e); Kq(6, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(7)]
    public void Kq7_EscTaiLaiHoanBenhNhan()
    {
        using var trace = TestTrace.Begin("SeisanParity_Kq7");
        try
        {
            Counter();
            var v = Go(Vk.F3, SeisanNav.VisitList, TimeSpan.FromSeconds(20));
            Thread.Sleep(1500);
            Kq(7, "hộp ngay khi mở: " + SeisanNav.DescribeDialogs(App));
            SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3));
            var before = Uia.ById(v, "dgvViewS") is { } g0 ? new WinFormsGrid(g0).RowCount() : -1;
            Kq(7, $"số dòng trước ESC: {before}");
            Snapshot("kq7-before-esc");

            // 204008 ESC = btnEndEsc_Click ⇒ searchProc (frm204008.cs:366-370) — chỉ đọc, gửi thẳng.
            Uia.ForceForeground(v.Properties.NativeWindowHandle);
            Uia.SendKey(Vk.Escape);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(30));
            if (box is not null) CaptureDialog(7, "kq7-esc", TimeSpan.FromSeconds(1));
            else Kq(7, "ESC: không có hộp thoại trong 30s");
            Thread.Sleep(1000);
            var after = Uia.ById(v, "dgvViewS") is { } g1 ? new WinFormsGrid(g1).RowCount() : -1;
            Kq(7, $"số dòng sau ESC: {after}; form còn: {SeisanNav.DescribeForms(App)}");
            Snapshot("kq7-after-esc");
            if (SeisanNav.Form(App, SeisanNav.VisitList) is { } still) { Current = still; Go(Vk.F10, SeisanNav.Counter); }
        }
        catch (Exception e) { trace.Fail("Kq7", e); Kq(7, "NGOẠI LỆ: " + e.Message); }
    }
}
