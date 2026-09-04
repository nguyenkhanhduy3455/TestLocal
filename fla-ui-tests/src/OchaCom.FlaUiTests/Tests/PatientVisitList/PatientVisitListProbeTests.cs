using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientVisitList;

/// <summary>
/// <b>PROBE — 来患一覧 (frm204008). KHÔNG assert, không bao giờ ném.</b>
///
/// Bước 2 của <c>fla-ui-tests/PROBE-GUIDELINE.md</c>: chưa biết app thật hành xử ra sao
/// thì đo trước, đừng viết assert theo phỏng đoán rồi chạy cả fixture để xem nó đỏ ở đâu.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÂU HỎI ĐANG ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// Nửa WinForm của <c>web-tenant-tests/tests/patient-visit-list-rcp-type.spec.ts</c>.
/// Bản web bị báo 「レセプト種別 luôn null」, và khi soát lại lộ ra bug khác ở đúng cột đó:
/// <c>buiPrice.getReceiptType</c> ghi <c>単独</c> NGƯỢC vào <c>patInfoData.ins.combi_kbn</c>
/// (buiPrice.cs:1563). WinForm lấy lại <c>patInfo</c> cho TỪNG dòng (frm204008.cs:711) nên
/// ghi đè không lan; bản web dùng lại một instance <c>Insurance</c> xuyên các ngày.
/// Luồng này đo <b>đáp án WinForm</b> để bản web có mốc mà khớp.
///
/// <code>
///  KQ-1  Tháng nào có dữ liệu, tháng test có bao nhiêu dòng, oracle ra 種別 gì?
///  KQ-2  Đường vào 窓口精算 → F3 có tới frm204008 không? 3 checkbox mặc định ra sao?
///        cboEra có những 元号 nào?
///  KQ-3  Một lượt 検索 mất bao lâu? Có hộp thoại nào bung ra không (E00100 / E00003)?
///  KQ-4  Lưới có ĐÚNG 12 cột, ĐÚNG nhãn, ĐÚNG thứ tự _viewItem không?
///  KQ-5  Dòng đọc được từ lưới trông ra sao — ô nào bị IsTheSameCellValue bỏ trắng?
///        (đây là câu quan trọng nhất: chưa biết UIA trả GIÁ TRỊ GỐC hay giá trị đã
///         qua CellFormatting, mà cả TC banding đứng hay ngã ở đúng chỗ đó)
///  KQ-6  Cuộn xuống đáy có thấy dòng 合計 không, 氏名 của nó là chuỗi gì?
///  KQ-7  F4 CSV出力 có lái được không? File ra bao nhiêu dòng, header thế nào?
///  KQ-8  レセプト種別 trong CSV có khớp oracle dựng từ insurance/medinsinf không?
///  KQ-9  Bấm tiêu đề cột có sort không? (nghi LỆCH: web khoá sort mọi cột trừ
///        患者番号/氏名, còn WinForm để SortMode.Automatic cho 10 cột kia — và ngược lại
///        handler sort 患者番号 của WinForm dò tên cột 「dsp_pat_no」 trong khi cột tên
///        「pat_no」, tức là NÓ KHÔNG BAO GIỜ CHẠY, frm204008.cs:241)
/// </code>
///
/// <para><b>CHỈ ĐỌC.</b> Luồng này không seed, không bấm F9, không đụng DB. Thứ duy nhất
/// nó ghi ra đĩa là file CSV trong thư mục artifacts của chính bộ test.</para>
///
/// <para>Chạy: <c>.\run-patient-visit-list.ps1 -Diagnostics</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("patient-visit-list")]
public sealed class PatientVisitListProbeTests : UiTestBase
{
    private VisitListDb? _db;
    private VisitListScreen? _screen;
    private string _ym = "";
    private IReadOnlyList<ExpectedVisit> _expected = [];
    private IReadOnlyDictionary<(int, int), VisitInsurance> _insurance =
        new Dictionary<(int, int), VisitInsurance>();

    /// <summary>Màn này KHÔNG phải 診療入力 — nền chung đừng mở hộ.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    protected override AutomationElement? UiaDumpRoot => _screen?.Window;

    /// <summary>
    /// Tắt watcher. Hộp thoại của luồng này (E00100 / E00003 / I00005) chính là thứ đang
    /// đo — để watcher bấm hộ thì probe kết luận 「app không báo gì」 trong khi app có báo
    /// và đã bị trả lời mất.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString: レセプト種別 ghép từ insurance/medinsinf và " +
                   "KHÔNG trường nào trong số đó hiện trên màn hình — không có DB thì probe " +
                   "chỉ so ô này với ô kia.";
        return null;
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _db = VisitListDb.CreateOrNull(Settings);
    }

    // ── KQ-1 ─────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    public void Tc0a_ChonThangVaDungOracle()
    {
        Log("=== KQ-1 === chọn 診療年月 + oracle レセプト種別");
        if (_db is null) { Log("=== KQ-1 === BỎ QUA: không tạo được VisitListDb"); return; }

        try
        {
            var months = _db.MonthsWithData(Settings.VisitList.MaxPatients);
            Log($"=== KQ-1 === {months.Count} tháng có <= {Settings.VisitList.MaxPatients} bệnh nhân; " +
                "10 tháng nhiều dữ liệu nhất trong ngưỡng đó:");
            foreach (var (ym, pats) in months.Take(10)) Log($"=== KQ-1 ===   {ym}: {pats} bệnh nhân");

            _ym = Settings.VisitList.SinryoYm.Trim();
            if (_ym.Length == 0)
            {
                _ym = months.FirstOrDefault().Ym ?? "";
                Log($"=== KQ-1 === visitList.sinryoYm để trống ⇒ tự chọn 「{_ym}」");
            }
            if (_ym.Length == 0) { Log("=== KQ-1 === KHÔNG có tháng nào dùng được"); return; }

            var monthPats = _db.PatientsForMonth(_ym);
            _expected = _db.ExpectedVisits(_ym);
            _insurance = _db.InsuranceFor(_ym);

            Log($"=== KQ-1 === tháng test 「{_ym}」: {monthPats.Count} bệnh nhân (trn_status), " +
                $"{_expected.Count} dòng (bệnh nhân × ngày × 枝番), {_insurance.Count} bản 保険");

            var kinds = new Dictionary<string, int>(StringComparer.Ordinal);
            var unknown = 0;
            foreach (var v in _expected)
            {
                var want = ReceiptTypeOracle.Expected(
                    _insurance.TryGetValue((v.PatNo, v.PatBr), out var ins) ? ins : null, v.TrtDt);
                if (want is null) { unknown++; continue; }
                kinds[want] = kinds.GetValueOrDefault(want) + 1;
            }
            Log($"=== KQ-1 === oracle dựng được {_expected.Count - unknown}/{_expected.Count} dòng " +
                $"({unknown} dòng không suy ra được: 併用 hoặc thiếu 保険/生年月日)");
            foreach (var kv in kinds.OrderByDescending(k => k.Value))
                Log($"=== KQ-1 ===   「{kv.Key}」 × {kv.Value}");

            // Một bệnh nhân mà oracle ra NHIỀU 種別 trong cùng tháng là dấu hiệu dữ liệu
            // đủ để bắt bug combi_kbn — bản web sẽ lệch ở đúng những bệnh nhân này.
            var byPat = _expected
                .GroupBy(v => v.PatNo)
                .Select(g => (PatNo: g.Key, Kinds: g
                    .Select(v => ReceiptTypeOracle.Expected(
                        _insurance.TryGetValue((v.PatNo, v.PatBr), out var i) ? i : null, v.TrtDt) ?? "?")
                    .Distinct(StringComparer.Ordinal).ToList()))
                .Where(x => x.Kinds.Count > 1)
                .ToList();
            Log($"=== KQ-1 === {byPat.Count} bệnh nhân có >1 種別 trong tháng " +
                "(0 ⇒ bất biến TC-RCP-3 của bản web không bị dữ liệu tháng này thách thức)");
            foreach (var x in byPat.Take(5))
                Log($"=== KQ-1 ===   患者{x.PatNo}: {string.Join(" / ", x.Kinds)}");
        }
        catch (Exception e)
        {
            Log("=== KQ-1 === NGOẠI LỆ: " + e.Message);
        }
    }

    // ── KQ-2 … KQ-6 ──────────────────────────────────────────────────────────

    [Test, Order(2)]
    public void Tc0b_MoManHinhVaChayTotal()
    {
        using var trace = TestTrace.Begin("Tc0b_VisitList");

        try
        {
            trace.Step("mở 来患一覧 qua 窓口精算 + F3");
            _screen = VisitListScreen.Open(App, Settings);
            Log("=== KQ-2 === đã mở frm204008");
        }
        catch (Exception e)
        {
            Log("=== KQ-2 === KHÔNG MỞ ĐƯỢC frm204008: " + e.Message);
            return;
        }

        var screen = _screen!;

        try
        {
            var (sy, sa, ho) = screen.CheckboxStates();
            Log($"=== KQ-2 === checkbox mặc định: 初診={Show(sy)} 再診={Show(sa)} 訪問診療={Show(ho)} " +
                "(Designer đặt cả ba Checked)");
        }
        catch (Exception e) { Log("=== KQ-2 === không đọc được checkbox: " + e.Message); }

        try { Log("=== KQ-2 === 元号 trong cboEra: " + string.Join(" / ", screen.EraItems().Select(i => $"「{i}」"))); }
        catch (Exception e) { Log("=== KQ-2 === không đọc được cboEra: " + e.Message); }

        if (_ym.Length == 0) { Log("=== KQ-3 === BỎ QUA: KQ-1 chưa chọn được tháng"); return; }

        SearchRunResult? run = null;
        try
        {
            var (y, m) = VisitListDb.ParseYm(_ym);
            var era = VisitListScreen.EraOf(y, m);
            trace.Step($"đặt 診療年月 = {_ym} ({era.Name}{y - era.StartYear}年{m}月)");
            screen.SetSinryoYm(_ym);

            trace.Step("bấm 検索 và chờ");
            run = screen.RunSearch(TimeSpan.FromMinutes(Settings.VisitList.SearchTimeoutMinutes), trace);
            Log($"=== KQ-3 === 検索 xong sau {run.Elapsed.TotalSeconds:0.0}s " +
                $"(thanh tiến trình {(run.ProgressDialogSeen ? "CÓ" : "KHÔNG")} hiện, " +
                $"{(run.TimedOut ? "HẾT GIỜ" : "kết thúc bình thường")}), {run.Dialogs.Count} hộp thoại");
            foreach (var d in run.Dialogs.Take(10))
                Log("=== KQ-3 ===   「" + VisitListScreen.OneLine(d) + "」");
            Log($"=== KQ-3 === trong đó {run.BuiPriceFailures.Count} hộp E00100 一部負担金計算に失敗");
        }
        catch (Exception e)
        {
            Log("=== KQ-3 === NGOẠI LỆ khi 検索: " + e.Message);
        }

        try
        {
            var headers = screen.HeaderRow();
            Log($"=== KQ-4 === {headers.Count} nhãn cột đọc được: " +
                string.Join(" | ", headers.Select(h => $"「{h}」")));
            Log("=== KQ-4 === _viewItem mong đợi: " +
                string.Join(" | ", VisitListScreen.HeaderLabels.Select(h => $"「{h}」")));
        }
        catch (Exception e) { Log("=== KQ-4 === không đọc được nhãn cột: " + e.Message); }

        try
        {
            // MỘT lượt đọc cho cả KQ-5 lẫn KQ-6: 88 dòng × 12 ô ≈ 50 giây.
            trace.Step("đọc lưới");
            var rows = screen.AllRows();
            Log($"=== KQ-5 === {rows.Count} phần tử dòng đọc được (kể cả dòng tiêu đề và dòng 合計)");
            foreach (var r in rows.Take(12)) Log("=== KQ-5 ===   " + r);

            var blankPatNo = rows.Count(r => r.PatNo == VisitListScreen.AccNullValue);
            var blankRcp = rows.Count(r => r.RcpType == VisitListScreen.AccNullValue);
            Log($"=== KQ-5 === {blankPatNo} dòng có 患者番号 = 「{VisitListScreen.AccNullValue}」, " +
                $"{blankRcp} dòng có レセプト種別 như vậy ⇒ banding " +
                (blankPatNo > 0 ? "ĐỌC ĐƯỢC từ UI" : "KHÔNG đọc được từ UI — TC banding phải đổi mốc"));

            Log("=== KQ-6 === 6 dòng cuối:");
            foreach (var r in rows.TakeLast(6)) Log("=== KQ-6 ===   " + r);
            var total = rows.LastOrDefault(r => r.IsTotalRow);
            Log(total is null
                ? "=== KQ-6 === KHÔNG thấy dòng 合計 ở đáy"
                : $"=== KQ-6 === dòng 合計: 氏名=「{total.PatNm}」 合計金額=「{total.PriceTotal}」 " +
                  $"(nằm ở vị trí {rows.ToList().FindLastIndex(r => r.IsTotalRow)}/{rows.Count - 1})");
        }
        catch (Exception e) { Log("=== KQ-5/6 === không đọc được lưới: " + e.Message); }
    }

    // ── KQ-7, KQ-8 ───────────────────────────────────────────────────────────

    [Test, Order(3)]
    public void Tc0c_XuatCsvVaDoiChieuOracle()
    {
        // Chạy lẻ được: bám vào app đang mở sẵn ở frm204008 (app.attachIfRunning) thay vì
        // 検索 lại — một lượt 検索 tốn hàng phút và wrapper cắt ở 15 phút.
        EnsureMonth();
        if (!EnsureScreen()) { Log("=== KQ-7 === BỎ QUA: chưa mở được màn hình"); return; }

        IReadOnlyList<string> lines;
        var path = Path.Combine(ArtifactDir(), $"visit-list-{_ym}.csv");
        try
        {
            using var trace = TestTrace.Begin("Tc0c_VisitListCsv");
            trace.Step("F4 CSV出力");
            lines = _screen!.ExportCsv(path, trace);
            Log($"=== KQ-7 === CSV ghi ra 「{path}」: {lines.Count} dòng (1 header + dữ liệu + 合計)");
            foreach (var l in lines.Take(8)) Log("=== KQ-7 ===   " + l);
            if (lines.Count > 0) Log("=== KQ-7 === dòng cuối: " + lines[^1]);
        }
        catch (Exception e)
        {
            Log("=== KQ-7 === KHÔNG xuất được CSV: " + e.Message);
            return;
        }

        try
        {
            var rows = ParseCsv(lines);
            Log($"=== KQ-8 === {rows.Count} dòng khám trong CSV (đã bỏ header và dòng 合計)");

            var blank = rows.Count(r => r.RcpType.Length == 0);
            Log($"=== KQ-8 === {blank} dòng có レセプト種別 RỖNG " +
                "(bản web bị báo 「luôn null」 — con số này là câu trả lời của WinForm)");

            var mismatch = 0;
            var compared = 0;
            var noOracle = 0;
            foreach (var r in rows)
            {
                var visit = _expected.FirstOrDefault(v => v.PatNo == r.PatNo && v.Day == r.Day);
                if (visit is null) { noOracle++; continue; }
                var want = ReceiptTypeOracle.Expected(
                    _insurance.TryGetValue((visit.PatNo, visit.PatBr), out var ins) ? ins : null, visit.TrtDt);
                if (want is null) { noOracle++; continue; }
                compared++;
                if (r.RcpType == want) continue;
                mismatch++;
                if (mismatch <= 10)
                    Log($"=== KQ-8 === LỆCH 患者{r.PatNo} ngày {r.Day}: " +
                        $"WinForm=「{r.RcpType}」 oracle=「{want}」");
            }
            Log($"=== KQ-8 === đối chiếu {compared} dòng, {mismatch} lệch, " +
                $"{noOracle} dòng oracle không dựng được");

            var kinds = rows.Select(r => r.RcpType).Distinct(StringComparer.Ordinal).ToList();
            Log($"=== KQ-8 === {kinds.Count} loại 種別 xuất hiện: " +
                string.Join(" | ", kinds.Select(k => $"「{k}」")));
        }
        catch (Exception e) { Log("=== KQ-8 === không đối chiếu được: " + e.Message); }
    }

    // ── KQ-9 ─────────────────────────────────────────────────────────────────

    [Test, Order(4)]
    public void Tc0d_BamTieuDeCotCoSortKhong()
    {
        if (!EnsureScreen()) { Log("=== KQ-9 === BỎ QUA: chưa mở được màn hình"); return; }

        try
        {
            using var trace = TestTrace.Begin("Tc0d_VisitListSort");
            // Dẹp mọi hộp thoại còn sót TRƯỚC khi click: một MessageBox modal nuốt trọn
            // click và testcase sẽ kết luận 「bấm tiêu đề không sort」 (đã vấp 2026-09-04).
            foreach (var t in VisitListScreen.DrainDialogs(App))
                Log("=== KQ-9 === dẹp hộp thoại còn sót: " + VisitListScreen.OneLine(t));

            var grid = new WinFormsGrid(_screen!.Grid);
            var headerCells = HeaderCells(grid);
            Log($"=== KQ-9 === {headerCells.Count} ô tiêu đề click được");

            foreach (var (label, index) in new[] { ("患者番号", 0), ("氏　　名", 1), ("レセプト種別", 2) })
            {
                if (index >= headerCells.Count) { Log($"=== KQ-9 === không thấy tiêu đề 「{label}」"); continue; }

                // Đọc 8 dòng đầu thôi: một lượt đọc CẢ lưới tốn ~50s (88 dòng × 12 ô).
                var before = Fingerprint(_screen);
                trace.Step($"click tiêu đề 「{label}」");
                Uia.MouseClick(headerCells[index]);
                Thread.Sleep(800);
                var after = Fingerprint(_screen);

                Log($"=== KQ-9 === 「{label}」: {(before == after ? "KHÔNG ĐỔI" : "ĐÃ SORT")}");
                Log($"=== KQ-9 ===   trước: {before}");
                Log($"=== KQ-9 ===   sau  : {after}");
            }
        }
        catch (Exception e) { Log("=== KQ-9 === không đo được sort: " + e.Message); }
    }

    // ── Tiện ích ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Bám vào (hoặc mở) màn 来患一覧. Trả false + ghi lý do thay vì ném — probe không
    /// bao giờ được phép chết giữa chừng.
    /// </summary>
    private bool EnsureScreen()
    {
        if (_screen is not null) return true;
        try
        {
            _screen = VisitListScreen.Open(App, Settings);
            return true;
        }
        catch (Exception e)
        {
            Log("KHÔNG mở/bám được frm204008: " + e.Message);
            return false;
        }
    }

    /// <summary>Dựng lại tháng test + oracle khi testcase chạy lẻ (Tc0a không chạy cùng).</summary>
    private void EnsureMonth()
    {
        if (_ym.Length > 0 || _db is null) return;
        try
        {
            _ym = Settings.VisitList.SinryoYm.Trim();
            if (_ym.Length == 0) _ym = _db.MonthsWithData(Settings.VisitList.MaxPatients).FirstOrDefault().Ym ?? "";
            if (_ym.Length == 0) return;
            _expected = _db.ExpectedVisits(_ym);
            _insurance = _db.InsuranceFor(_ym);
        }
        catch (Exception e) { Log("KHÔNG dựng lại được oracle: " + e.Message); }
    }


    /// <summary>8 dòng đầu (bỏ dòng tiêu đề) — đủ để biết lưới có sắp lại hay không.</summary>
    private static string Fingerprint(VisitListScreen screen) =>
        string.Join(",", screen.AllRows(9).Skip(1).Select(r => r.PatNo + "/" + r.Day));

    private static IReadOnlyList<AutomationElement> HeaderCells(WinFormsGrid grid)
    {
        foreach (var child in Uia.Children(grid.Element))
        {
            var cells = Uia.Children(child).ToList();
            if (cells.Count == 0) continue;
            if (cells.All(c => Uia.ControlTypeOf(c) == FlaUI.Core.Definitions.ControlType.HeaderItem)
                || Txt.N(Uia.NameOf(cells[0])).Contains("患者番号", StringComparison.Ordinal))
                return cells;
        }
        return [];
    }

    /// <summary>Một dòng của CSV do F4 ghi ra (thứ tự cột = editCsvHeader, frm204008.cs:1004).</summary>
    private sealed record CsvRow(int PatNo, string PatNm, string RcpType, int Day);

    private static IReadOnlyList<CsvRow> ParseCsv(IReadOnlyList<string> lines)
    {
        var rows = new List<CsvRow>();
        foreach (var line in lines.Skip(1))
        {
            var f = line.Split(',');
            if (f.Length < 4) continue;
            // Dòng 合計 có pat_no rỗng (frm204008.cs:765 chỉ đặt pat_nm).
            if (!int.TryParse(f[0].Trim(), out var patNo)) continue;
            if (!int.TryParse(f[3].Trim(), out var day)) continue;
            rows.Add(new CsvRow(patNo, f[1].Trim(), f[2].Trim(), day));
        }
        return rows;
    }

    private static string ArtifactDir()
    {
        var root = TestSettings.Current.Run.ScreenshotDir;
        var dir = Path.IsPathRooted(root) ? root : Path.Combine(AppContext.BaseDirectory, root);
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string Show(bool? b) => b is null ? "?" : b.Value ? "✓" : "✗";
}
