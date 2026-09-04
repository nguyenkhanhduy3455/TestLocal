using System.Text.RegularExpressions;
using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientVisitList;

/// <summary>
/// 来患一覧 <c>frm204008</c> — <b>đáp án WinForm</b> cho cột レセプト種別.
///
/// Nửa WinForm của <c>web-tenant-tests/tests/patient-visit-list-rcp-type.spec.ts</c>.
/// Bảng tương ứng từng testcase nằm ở <c>README.md</c> cạnh file này.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐO GÌ
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web bị báo 「レセプト種別 luôn null」. Soát lại thì lộ ra bug KHÁC ở đúng cột đó:
/// <c>buiPrice.getReceiptType</c> ghi <c>単独</c> NGƯỢC vào <c>patInfoData.ins.combi_kbn</c>
/// (buiPrice.cs:1563) — WinForm lấy lại <c>patInfo</c> cho TỪNG dòng (frm204008.cs:711)
/// nên ghi đè không lan, còn bản web dùng lại một instance <c>Insurance</c> xuyên các ngày.
///
/// Fixture này KHÔNG so bản web với WinForm trực tiếp (hai bên chạy hai máy, hai DB
/// khác nhau). Nó chốt <b>đáp án WinForm</b> bằng một oracle độc lập dựng thẳng từ
/// <c>insurance</c>/<c>medinsinf</c> (<see cref="ReceiptTypeOracle"/>) — và spec Playwright
/// có ĐÚNG hàm oracle đó. Hai bên cùng khớp oracle của mình thì hai bên khớp nhau; bên
/// nào lệch thì lệch một mình, và log chỉ ra ngay dòng nào.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MỘT LẦN 検索 CHO CẢ FIXTURE
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>OneTimeSetUp</c> mở màn hình, gõ 診療年月, bấm 検索 MỘT lần, rồi đọc lưới MỘT lần và
/// xuất CSV MỘT lần. Cả ba đều đắt: đọc 88 dòng × 12 ô qua UIA đo được ~50 giây
/// (2026-09-04), và một lượt 検索 gọi <c>getBuiPrice2</c> cho từng bệnh nhân × ngày.
///
/// Hai nguồn dữ liệu, mỗi nguồn trả lời một loại câu hỏi:
/// <list type="bullet">
/// <item><b>CSV (F4)</b> — giá trị THÔ của <c>DataTable</c> nguồn: dùng cho mọi khẳng
///       định về NỘI DUNG (種別, số dòng, dòng 合計).</item>
/// <item><b>Lưới</b> — giá trị đã qua <c>CellFormatting</c>: dùng cho thứ CHỈ có ở lưới,
///       tức nhãn/thứ tự cột và banding <c>IsTheSameCellValue</c>.</item>
/// </list>
///
/// <para><b>CHỈ ĐỌC.</b> Không seed, không F9, không ghi DB. Thứ duy nhất ghi ra đĩa là
/// file CSV trong thư mục artifacts của chính bộ test.</para>
///
/// <para>Chạy: <c>.\run-patient-visit-list.ps1</c></para>
/// </summary>
[TestFixture]
[Category("patient-visit-list")]
public sealed class PatientVisitListTests : UiTestBase
{
    /// <summary>
    /// Hình dạng レセプト識別 hợp lệ theo buiPrice.cs:1523-1602:
    /// <c>&lt;保険種別&gt;・&lt;単独 | N併&gt;・&lt;六外 | 本外 | 家外 | 高外７ | 高外－&gt;</c>,
    /// cộng hai nhánh trả về SỚM chỉ có nhãn: 労災 / 自費.
    ///
    /// <para>Con số của vế 併 là 全角 vì <c>editHanToZen</c> (buiPrice.cs:1560) — nên đừng
    /// NFKC chuỗi trước khi khớp, NFKC biến 「２併」 thành 「2併」 và phá luôn nhánh đó.</para>
    /// </summary>
    private static readonly Regex RcpTypeShape =
        new(@"^(労災|自費|(公費|社|国|退職|後期)・(単独|[０-９]+併)・(六外|本外|家外|高外７|高外－))$",
            RegexOptions.Compiled);

    private VisitListDb _db = null!;
    private VisitListScreen _screen = null!;
    private string _ym = "";

    private SearchRunResult _run = null!;
    private IReadOnlyList<VisitGridRow> _gridRows = [];
    private IReadOnlyList<CsvRow> _csvRows = [];
    private IReadOnlyList<string> _csvLines = [];
    private CsvRow? _csvTotal;

    private IReadOnlyList<ExpectedVisit> _expected = [];
    private IReadOnlyDictionary<(int, int), VisitInsurance> _insurance =
        new Dictionary<(int, int), VisitInsurance>();

    protected override bool NavigatesToTreatmentEntry => false;

    protected override AutomationElement? UiaDumpRoot => _screen?.Window;

    /// <summary>
    /// Tắt watcher: E00100 / E00003 chính là thứ TC-WARN-1 đang đo. Để watcher trả lời
    /// hộ thì testcase xanh sai — nó kết luận 「app không báo gì」 trong khi app có báo.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString: レセプト種別 ghép từ 6 trường của insurance/medinsinf " +
                   "và KHÔNG trường nào hiện trên màn hình — không có DB thì fixture chỉ so ô này " +
                   "với ô kia, tức chẳng kiểm được gì (Rule 18).";
        return null;
    }

    [OneTimeSetUp]
    public void OpenAndSearch()
    {
        _db = VisitListDb.CreateOrNull(Settings)
              ?? throw new InvalidOperationException("db.enabled = true mà VisitListDb vẫn null?");

        _ym = Settings.VisitList.SinryoYm.Trim();
        if (_ym.Length == 0)
        {
            _ym = _db.MonthsWithData(Settings.VisitList.MaxPatients).FirstOrDefault().Ym ?? "";
            if (_ym.Length == 0)
                throw new InvalidOperationException(
                    $"trn_status không có tháng nào <= {Settings.VisitList.MaxPatients} bệnh nhân — " +
                    "đặt visitList.sinryoYm đích danh.");
            TestContext.Out.WriteLine($"visitList.sinryoYm để trống ⇒ tự chọn 「{_ym}」");
        }

        _expected = _db.ExpectedVisits(_ym);
        _insurance = _db.InsuranceFor(_ym);
        TestContext.Out.WriteLine(
            $"診療年月 {_ym}: DB có {_expected.Count} dòng (bệnh nhân × ngày × 枝番), " +
            $"{_expected.Select(v => v.PatNo).Distinct().Count()} bệnh nhân");

        _screen = VisitListScreen.Open(App, Settings);
        _screen.SetSinryoYm(_ym);
        _run = _screen.RunSearch(TimeSpan.FromMinutes(Settings.VisitList.SearchTimeoutMinutes));
        TestContext.Out.WriteLine(
            $"検索 xong sau {_run.Elapsed.TotalSeconds:0.0}s, {_run.Dialogs.Count} hộp thoại");

        // Đọc lưới và xuất CSV MỘT lần cho cả fixture — xem khối 「MỘT LẦN 検索」.
        _gridRows = _screen.AllRows();
        var path = Path.Combine(ArtifactDir(), $"visit-list-{_ym}.csv");
        _csvLines = _screen.ExportCsv(path);
        var parsed = CsvRow.Parse(_csvLines);
        _csvRows = parsed.Visits;
        _csvTotal = parsed.Total;
        TestContext.Out.WriteLine(
            $"lưới {_gridRows.Count} phần tử dòng; CSV {_csvLines.Count} dòng " +
            $"({_csvRows.Count} dòng khám + {(_csvTotal is null ? 0 : 1)} dòng 合計) — 「{path}」");
    }

    // ── Mở màn + điều kiện tìm kiếm ──────────────────────────────────────────

    [Test, Order(1)]
    public void TC_OPEN_1_BaCoMacDinhVaSearchChayXong()
    {
        var (syosin, saisin, houmon) = _screen.CheckboxStates();
        Assert.Multiple(() =>
        {
            Assert.That(syosin, Is.True, "初診 phải tick sẵn (chkSyosin.Checked = true, Designer:74)");
            Assert.That(saisin, Is.True, "再診 phải tick sẵn (chkSaisin.Checked = true)");
            Assert.That(houmon, Is.True, "訪問診療 phải tick sẵn (chkHoumon.Checked = true, Designer:64)");
        });

        Assert.That(_run.TimedOut, Is.False,
            $"検索 chưa xong sau {Settings.VisitList.SearchTimeoutMinutes} phút — " +
            "tháng đang đo có bao nhiêu bệnh nhân? Mỗi (bệnh nhân × ngày) là một lượt getBuiPrice2.");

        // Dữ liệu demo không có ca 一部負担金 hỏng, nên E00100 bung ra là báo động thật —
        // và mỗi hộp CHẶN luồng nền của thanh tiến trình cho tới khi có người bấm OK.
        Assert.That(_run.BuiPriceFailures, Is.Empty,
            "có hộp E00100 一部負担金計算に失敗 — xem log để biết bệnh nhân/ngày nào " +
            "(buiPrice.cs:196-203). Đây là lỗi DỮ LIỆU hoặc lỗi tính, không phải lỗi test.");

        Assert.That(_run.Dialogs, Is.Empty,
            "検索 không được bung hộp thoại nào khi tháng có dữ liệu; " +
            "E00003 該当データなし nghĩa là tháng test rỗng — đổi visitList.sinryoYm.");
    }

    [Test, Order(2)]
    public void TC_OPEN_2_MuoiHaiCotDungNhanDungThuTu()
    {
        var headers = _screen.HeaderRow();

        Assert.That(headers, Has.Count.EqualTo(VisitListScreen.HeaderLabels.Length),
            "số cột khác _viewItem của frm204008 (frm204008.cs:62-77). Đọc được: " +
            string.Join(" | ", headers.Select(h => $"「{h}」")));

        // NFKC hai vế: 「氏　　名」 dùng khoảng trắng 全角 còn 「　 合計金額」 có cả 全角 lẫn
        // 半角 ở đầu — so thô thì lệch vì chuyện trình bày chứ không phải vì cột sai.
        for (var i = 0; i < VisitListScreen.HeaderLabels.Length; i++)
            Assert.That(Txt.N(headers[i]), Is.EqualTo(Txt.N(VisitListScreen.HeaderLabels[i])),
                $"cột thứ {i} sai nhãn/sai vị trí so với _viewItem");
    }

    // ── レセプト種別 ─────────────────────────────────────────────────────────

    [Test, Order(3)]
    public void TC_RCP_1_MoiDongDeuCoReceiptType()
    {
        Assert.That(_csvRows, Is.Not.Empty,
            $"{_ym} không có dòng khám nào — đổi visitList.sinryoYm sang tháng có dữ liệu");

        // Đây chính là bug được báo bên web: 「レセプト種別 luôn null」.
        var blank = _csvRows.Where(r => r.RcpType.Trim().Length == 0).ToList();
        Assert.That(blank, Is.Empty,
            $"{blank.Count}/{_csvRows.Count} dòng có レセプト種別 rỗng: " +
            string.Join(" / ", blank.Take(5).Select(r => $"患者{r.PatNo} ngày {r.Day}")) +
            " — getReceiptType không chạy, hoặc insurance thiếu Birthdate/ins_kbn.");
    }

    [Test, Order(4)]
    public void TC_RCP_2_DungHinhDangCuaBuiPrice()
    {
        var bad = _csvRows
            .Where(r => !RcpTypeShape.IsMatch(r.RcpType))
            .Select(r => $"患者{r.PatNo}/ngày{r.Day}=「{r.RcpType}」")
            .ToList();

        Assert.That(bad, Is.Empty,
            $"{bad.Count} dòng có レセプト種別 sai hình dạng 保険種別・単独|N併・区分 " +
            "(buiPrice.cs:1523-1602)");

        var kinds = _csvRows.Select(r => r.RcpType).Distinct(StringComparer.Ordinal).ToList();
        TestContext.Out.WriteLine(
            $"レセプト種別 xuất hiện ({kinds.Count} loại): " + string.Join(" | ", kinds));
    }

    [Test, Order(5)]
    public void TC_RCP_3_MotBenhNhanChiMotLoaiTrongThang()
    {
        // Bug bên web: ngày không có 公費 ghi 単独 ngược vào Insurance dùng chung, kéo mọi
        // ngày SAU đó xuống 単独 ⇒ một bệnh nhân có 2 種別 trong cùng tháng. WinForm lấy
        // lại patInfo cho từng dòng nên KHÔNG được phép có chuyện đó.
        var multi = _csvRows
            .GroupBy(r => r.PatNo)
            .Where(g => g.Select(r => r.RcpType).Distinct(StringComparer.Ordinal).Count() > 1)
            .Select(g => $"患者{g.Key}: {string.Join(" → ", g.Select(r => r.RcpType).Distinct())}")
            .ToList();

        Assert.That(multi, Is.Empty,
            "một bệnh nhân có nhiều レセプト種別 trong cùng tháng — nghi getReceiptType ghi " +
            "combi_kbn ngược vào patInfo dùng chung (buiPrice.cs:1563)");

        var multiDay = _csvRows.GroupBy(r => r.PatNo).Count(g => g.Count() > 1);
        // Bất biến chỉ có nghĩa khi CÓ bệnh nhân nhiều ngày — nói thẳng ra thay vì để một
        // lần chạy rỗng trông giống một lần pass thật (Rule 18).
        TestContext.Out.WriteLine(multiDay == 0
            ? $"{_ym}: không bệnh nhân nào có >1 ngày khám → TC-RCP-3 KHÔNG kiểm được gì"
            : $"TC-RCP-3: {multiDay} bệnh nhân có nhiều ngày khám, tất cả nhất quán");
    }

    [Test, Order(6)]
    public void TC_DB_1_KhopOracleDungTuInsurance()
    {
        var mismatches = new List<string>();
        var compared = 0;
        var noOracle = 0;

        foreach (var row in _csvRows)
        {
            // Khoá theo (患者番号, NGÀY): cột 診療日 của lưới là row2["day"] = trtStDt.Day
            // (frm204008.cs:744), không phải ngày đầy đủ.
            var visit = _expected.FirstOrDefault(v => v.PatNo == row.PatNo && v.Day == row.Day);
            var ins = visit is null
                ? null
                : _insurance.TryGetValue((visit.PatNo, visit.PatBr), out var found) ? found : null;

            var want = ReceiptTypeOracle.Expected(ins, visit?.TrtDt ?? default);
            if (visit is null || want is null) { noOracle++; continue; }

            compared++;
            if (row.RcpType == want) continue;
            mismatches.Add(
                $"患者{row.PatNo} ngày {row.Day}: WinForm=「{row.RcpType}」 oracle=「{want}」 " +
                $"(枝番={visit.PatBr} ins_kbn={ins?.InsKbn} combi={ins?.CombiKbn} old={ins?.OldFlg} " +
                $"bur={ins?.BurRate} fm={ins?.FmType} birth={ins?.Birthdate:yyyy-MM-dd})");
        }

        TestContext.Out.WriteLine(
            $"TC-DB-1: đối chiếu {compared} dòng; bỏ qua {noOracle} " +
            "(併用 — cần master 福祉医療 mới suy được, hoặc thiếu 保険/生年月日)");

        Assert.That(mismatches.Take(10), Is.Empty,
            $"{mismatches.Count} dòng lệch luật buiPrice.getReceiptType");
        Assert.That(compared, Is.GreaterThan(0),
            "không đối chiếu được dòng nào — tháng test toàn 併用? Đổi visitList.sinryoYm.");
    }

    // ── Banding (IsTheSameCellValue) ─────────────────────────────────────────

    [Test, Order(7)]
    public void TC_BAND_1_DongLapLaiBiBoTrang()
    {
        // Phần tử dòng đầu là DÒNG TIÊU ĐỀ (xem VisitListScreen.HeaderRow), bỏ ra.
        var rows = _gridRows.Skip(1).Where(r => !r.IsTotalRow).ToList();
        Assert.That(rows, Is.Not.Empty, "không đọc được dòng dữ liệu nào từ lưới");

        var groupHeads = 0;
        var banded = 0;
        var problems = new List<string>();
        var prev = "";

        foreach (var row in rows)
        {
            if (!VisitListScreen.IsBlanked(row.PatNo))
            {
                // Ô 患者番号 có chữ ⇒ dòng MỞ ĐẦU nhóm ⇒ 種別 bắt buộc hiện.
                if (VisitListScreen.IsBlanked(row.RcpType))
                    problems.Add($"dòng mở nhóm 患者{row.PatNo} ngày {row.Day} để trống レセプト種別");
                groupHeads++;
                prev = row.PatNo;
            }
            else
            {
                // 患者番号 trắng ⇒ lặp lại bệnh nhân dòng trên. IsTheSameCellValue so từ
                // cột 0 tới cột đang xét (frm204008.cs:209-220) nên レセプト種別 chỉ HIỆN
                // LẠI khi nó thật sự đổi — mà nó không được đổi (TC-RCP-3).
                if (!VisitListScreen.IsBlanked(row.RcpType))
                    problems.Add(
                        $"dòng ngày {row.Day} lặp lại 患者番号+氏名 (bệnh nhân {prev}) nhưng " +
                        $"レセプト種別 vẫn hiện 「{row.RcpType}」 — 種別 đã đổi giữa hai ngày");
                else banded++;
            }
        }

        Assert.That(problems.Take(5), Is.Empty, $"{problems.Count} dòng sai luật banding");
        Assert.That(groupHeads, Is.GreaterThan(0), "không có dòng mở đầu nhóm nào để kiểm");
        TestContext.Out.WriteLine(
            $"TC-BAND-1: {groupHeads} dòng mở nhóm có 種別, {banded} dòng lặp lại được bỏ trắng đúng");
    }

    [Test, Order(8)]
    public void TC_BAND_2_DongTongNamCuoiVaDungCongThuc()
    {
        Assert.That(_csvTotal, Is.Not.Null,
            "có dòng khám mà CSV thiếu dòng 合計 (frm204008.cs:761 chỉ thêm khi Rows.Count > 0)");

        // frm204008.cs:768 — CHÍNH XÁC tới từng khoảng trắng, kể cả 全角 sau 「名」.
        var patients = _csvRows.Select(r => r.PatNo).Distinct().Count();
        var expected = "合計" + patients.ToString().PadLeft(5, ' ') +
                       "名　（" + _csvRows.Count.ToString().PadLeft(4, ' ') + "件）";
        Assert.That(_csvTotal!.PatNm, Is.EqualTo(expected),
            "nhãn dòng 合計 khác công thức của frm204008.cs:768 " +
            "(\"合計\" + 人数.PadLeft(5) + \"名　（\" + 件数.PadLeft(4) + \"件）\")");

        // Dòng 合計 phải là dòng CUỐI của cả CSV lẫn lưới.
        Assert.That(_csvLines[^1].StartsWith(",", StringComparison.Ordinal), Is.True,
            "dòng cuối CSV không phải dòng 合計 (dòng 合計 bỏ trống 患者番号)");
        Assert.That(_gridRows[^1].IsTotalRow, Is.True,
            "dòng cuối lưới không phải dòng 合計");

        Assert.That(_csvTotal.PriceTotal, Is.EqualTo(_csvRows.Sum(r => r.PriceTotal)),
            "合計金額 của dòng 合計 không bằng tổng các dòng khám (frm204008.cs:769-777)");
    }

    // ── CSV + số dòng ────────────────────────────────────────────────────────

    [Test, Order(9)]
    public void TC_CSV_1_CsvDungHeaderVaKhongBiBanding()
    {
        Assert.That(_csvLines, Is.Not.Empty, "CSV rỗng");
        Assert.That(_csvLines[0], Is.EqualTo(string.Join(",", VisitListScreen.CsvHeaderLabels)),
            "header CSV khác editCsvHeader (frm204008.cs:1004-1032). Lưu ý cột cuối: CSV ghi " +
            "「合計金額」 còn lưới hiện 「　 合計金額」 — hai chuỗi đến từ hai đoạn code khác nhau.");

        // CSV ghi thẳng DataTable nên KHÔNG bị banding — cùng một bệnh nhân, mọi dòng đều
        // mang đủ 患者番号/氏名/レセプト種別. Đây là điểm khác lưới, và là lý do mọi khẳng
        // định về nội dung đều dựa vào CSV.
        Assert.That(_csvRows.All(r => r.PatNm.Length > 0), Is.True,
            "có dòng CSV trống 氏名 — CSV lẽ ra ghi giá trị THÔ, không qua CellFormatting");

        // Lưới = 1 tiêu đề + N dòng khám + 1 合計; CSV = 1 header + N + 1.
        Assert.That(_gridRows.Count, Is.EqualTo(_csvLines.Count),
            $"lưới có {_gridRows.Count} phần tử dòng còn CSV có {_csvLines.Count} dòng — " +
            "một trong hai đang thiếu dòng");
    }

    [Test, Order(10)]
    public void TC_ROW_1_MoiDongDeuCoGocTrongTrntrn()
    {
        var known = _expected.Select(v => (v.PatNo, v.Day)).ToHashSet();
        var orphan = _csvRows
            .Where(r => !known.Contains((r.PatNo, r.Day)))
            .Select(r => $"患者{r.PatNo}/ngày{r.Day}")
            .ToList();

        Assert.That(orphan.Take(5), Is.Empty,
            $"{orphan.Count} dòng trên màn hình không có (trt_dt, pat_br) tương ứng trong trntrn — " +
            "khác hẳn vòng lặp của setViewData (frm204008.cs:707-711)");

        // Ngược lại KHÔNG được assert bằng nhau: frm204008 chỉ thêm dòng khi
        // insScore/careScore/jihiPrice != 0 và còn lọc theo 3 cờ 初診/再診/訪問診療.
        Assert.That(_csvRows.Count, Is.LessThanOrEqualTo(_expected.Count),
            $"màn hình có {_csvRows.Count} dòng trong khi trntrn chỉ có {_expected.Count} " +
            "cặp (ngày × 枝番) — không thể nhiều hơn");
        TestContext.Out.WriteLine(
            $"TC-ROW-1: {_csvRows.Count}/{_expected.Count} cặp (bệnh nhân × ngày) lên được màn hình " +
            "(phần còn lại bị loại vì cả ba loại điểm đều = 0, hoặc bị 3 cờ lọc ra)");
    }

    // ── Sort theo tiêu đề cột ────────────────────────────────────────────────

    /// <summary>
    /// Chốt hành vi sort THẬT của WinForm — hai điểm lệch so với bản web, cả hai đã đo
    /// trên máy thật ngày 2026-09-04 (xem README §6).
    ///
    /// <para>Chạy CUỐI CÙNG vì nó sắp lại lưới. Các testcase trước dùng <c>_gridRows</c>
    /// và <c>_csvRows</c> chụp từ <c>OneTimeSetUp</c> nên không bị ảnh hưởng.</para>
    /// </summary>
    [Test, Order(11)]
    public void TC_SORT_1_BamTieuDeCot()
    {
        var headers = _screen.HeaderCells();
        Assert.That(headers, Has.Count.EqualTo(VisitListScreen.HeaderLabels.Length),
            "không lấy được 12 ô tiêu đề để click");

        // 患者番号 — dgvView_CellMouseClick dò tên cột 「dsp_pat_no」 (frm204008.cs:241)
        // trong khi _viewItem đặt tên cột là 「pat_no」 ⇒ nhánh đó KHÔNG BAO GIỜ chạy, và
        // SortMode đã bị hạ xuống Programmatic (:397) nên DataGridView cũng không tự sort.
        // Bản web thì 患者番号 sort được — đây là điểm LỆCH, và testcase này là chỗ ghi lại.
        var before = _screen.Fingerprint();
        Uia.MouseClick(headers[0]);
        Thread.Sleep(800);
        Assert.That(_screen.Fingerprint(), Is.EqualTo(before),
            "bấm tiêu đề 患者番号 đã sắp lại lưới — nghĩa là ai đó vừa sửa tên cột ở " +
            "frm204008.cs:241 (「dsp_pat_no」 → 「pat_no」). Tin tốt, nhưng bản web và " +
            "testcase này phải cập nhật cùng lúc.");

        // 氏名 — Programmatic, nhưng handler khớp đúng tên cột nên ComLibrary.kanaSort chạy.
        before = _screen.Fingerprint();
        Uia.MouseClick(headers[1]);
        Thread.Sleep(800);
        Assert.That(_screen.Fingerprint(), Is.Not.EqualTo(before),
            "bấm tiêu đề 氏名 KHÔNG sắp lại lưới — ComLibrary.kanaSort (frm204008.cs:261) " +
            "lẽ ra phải chạy. Kiểm xem có hộp thoại nào đang che lưới không (README §7.2).");

        // レセプト種別 — InitViewItem để SortMode.Automatic cho MỌI cột TextBox
        // (GradientDataGridView.cs:441) và frm204008.init chỉ hạ riêng pat_no/pat_nm, nên
        // 10 cột còn lại sort được. Bản web đặt enableSorting: false cho đúng 10 cột đó.
        before = _screen.Fingerprint();
        Uia.MouseClick(headers[VisitListScreen.RcpTypeColumn]);
        Thread.Sleep(800);
        Assert.That(_screen.Fingerprint(), Is.Not.EqualTo(before),
            "bấm tiêu đề レセプト種別 KHÔNG sắp lại lưới — trái với SortMode.Automatic mà " +
            "InitViewItem đặt cho mọi cột TextBox (GradientDataGridView.cs:441).");
    }

    // ── Tiện ích ─────────────────────────────────────────────────────────────

    private static string ArtifactDir()
    {
        var root = TestSettings.Current.Run.ScreenshotDir;
        var dir = Path.IsPathRooted(root) ? root : Path.Combine(AppContext.BaseDirectory, root);
        Directory.CreateDirectory(dir);
        return dir;
    }
}

/// <summary>
/// Một dòng của CSV do F4 ghi ra. Thứ tự cột đúng <c>editCsvData</c> (frm204008.cs:1038).
///
/// <para>Không dùng thư viện CSV: <c>editCsvData</c> nối chuỗi bằng dấu phẩy và KHÔNG
/// bọc nháy, nên tách theo dấu phẩy là đúng cách app ghi. (Hệ quả: 氏名 có dấu phẩy sẽ
/// làm lệch cột — dữ liệu demo không có, và đó là lỗi của app chứ không phải của parser.)</para>
/// </summary>
public sealed record CsvRow(
    int PatNo, string PatNm, string RcpType, int Day, string SyosinFlg, int PriceTotal)
{
    public static (IReadOnlyList<CsvRow> Visits, CsvRow? Total) Parse(IReadOnlyList<string> lines)
    {
        var visits = new List<CsvRow>();
        CsvRow? total = null;

        foreach (var line in lines.Skip(1))
        {
            var f = line.Split(',');
            if (f.Length < 12) continue;

            var priceTotal = int.TryParse(f[11].Trim(), out var p) ? p : 0;

            // Dòng 合計 bỏ trống 患者番号 và 診療日 (frm204008.cs:764-777).
            if (!int.TryParse(f[0].Trim(), out var patNo))
            {
                if (f[1].StartsWith("合計", StringComparison.Ordinal))
                    total = new CsvRow(0, f[1], f[2], 0, f[4], priceTotal);
                continue;
            }

            var day = int.TryParse(f[3].Trim(), out var d) ? d : 0;
            visits.Add(new CsvRow(patNo, f[1], f[2], day, f[4], priceTotal));
        }

        return (visits, total);
    }
}
