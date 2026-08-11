using NUnit.Framework;
using OchaCom.FlaUiTests.Data;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests;

/// <summary>
/// Tab 「個別」 của 診療入力 (frm203002) — BA CỘT ĐIỂM 一般 / 50・100 / 訪問 và điểm được
/// đưa vào lưới đăng ký khi chọn một dòng.
///
/// Bản FlaUI của ba testcase đầu trong
/// <c>web-tenant-tests/tests/kobetu-sidepanel-score.spec.ts</c>. Cùng một yêu cầu nghiệp
/// vụ, khác chỗ đo: bên kia đo bản web port, ở đây đo CHÍNH WinForm — tức là đo cái
/// "đáp án" mà bản web phải khớp.
///
/// ─── Nguồn WinForm ───────────────────────────────────────────────────────────
///  · INP/Lib/modKobetu.cs:86-135 — lưới 個別 (<c>hfgKobetu</c>) dựng LÚC CHẠY:
///    <c>Columns.Clear()</c> + <c>ColumnCount = 30</c>, chỉ 6 cột hiện: 2 処置名称, 3 一般,
///    4 50/100, 5 訪問, 12 ｺｰﾄﾞ, 13 枝番.
///      ⚠️ Header 「老人」 chỉ có trong Designer (cột <c>KobeRou</c>) — markup CHẾT, bị
///         <c>Columns.Clear()</c> xoá trước khi form hiện. Header thật của cột giữa là 「50/100」.
///  · INP/Lib/modKobetu.cs:203-207 — nguồn ba cột: score1 / score2 / score3.
///  · INP/Lib/modKobetu.cs:255-265 — <c>pKobetu_Let_Trt_Data</c>: chọn một dòng thì điểm ghi
///    vào lưới đăng ký KHÔNG phải score1 mà là
///    <c>getTensu(処置日, score1, score2, score3, acc_unit, f1)</c>.
///  · INP/Lib/CommonChk.cs:83-175 — getTensu rẽ theo BỆNH NHÂN và NGÀY; nhánh mà TC-2 đo:
///    ngày 訪問診療 + acc_unit 9..12 + f1 = 0 + không 乳幼児/困難者 → score3.
///  · INP/Forms/frm203002.cs:2177/2194 — nút 検索 = InputCheckKobe (ｺｰﾄﾞ và 点数 phải
///    <c>int.TryParse</c>, sai thì E00002 + huỷ search) rồi mới GetWhereKobeNyuryokuInfo.
///
/// ─── Dữ liệu ─────────────────────────────────────────────────────────────────
///  · 処置 đem test KHÔNG hard-code: hỏi thẳng bản master ĐANG ÁP DỤNG (bảng lấy từ
///    TRT_SEL, đúng bảng app đọc) để tìm dòng có score1/2/3 khác nhau ĐÔI MỘT, f1 = 0,
///    acc_unit 9..12. Ba điểm khác nhau đôi một là điều kiện cần để phân biệt được cột
///    nào đang lấy nhầm cột nào.
///  · Tuổi + dis_flg đọc từ DB chứ không giả định — getTensu rẽ theo đúng hai giá trị đó.
///  · KHÔNG seed DB. Tiền đề 「ngày 訪問診療」 của TC-2 dựng bằng chính giao diện: chọn
///    歯科訪問診療 (mã 333) ở tab 個別 làm <c>ModCommon.pHoumon[ngày] = true</c>
///    (modKobetu.cs:337-338). Khác bản Playwright (bên đó seed thẳng dòng 333 vào DB) vì
///    ở WinForm cờ này nằm trong BỘ NHỚ của phiên chạy, ghi DB không tự bật nó lên.
///  · TUYỆT ĐỐI không bấm F9 登録 ⇒ không có gì rơi xuống DB ⇒ không phải dọn.
///
/// ─── BẪY ─────────────────────────────────────────────────────────────────────
///  1. Lưới 個別 nạp CẢ MASTER (~1.7k dòng) ngay lúc mở màn (frm203002.cs:465-466) và
///     cầu MSAA dựng phần tử cho từng dòng. Luôn 検索 theo コード rồi mới đọc ô.
///  2. Ô ｺｰﾄﾞ CHỈ ăn số nguyên. 「174-0」 ra E00002 và HUỶ search — đó là TC-3.
///  3. Tên hiện trên lưới là <c>cct_nm</c> hay <c>trt_nm</c> tuỳ <c>ModCommon.pCultTrt</c>
///     ⇒ dò dòng vừa thêm phải chấp nhận CẢ HAI tên.
///  4. Một cú CLICK vào dòng 個別 là đã chèn xuống lưới đăng ký (<c>hfgKobetu_Click</c> →
///     Enter → <c>CellDoubleClick</c>, frm203002.cs:6928) — không cần double-click, và
///     cũng có nghĩa là KHÔNG được click dòng khi chỉ muốn đọc (TC-1 chỉ đọc).
/// </summary>
[TestFixture]
public sealed class KobetuSidePanelScoreTests : UiTestBase
{
    /// <summary>歯科訪問診療 — mã bật cờ pHoumon của ngày (modKobetu.cs:337).</summary>
    private const int HoumonTrtCd = 333;

    /// <summary>Nhãn E00002 mà InputCheckKobe truyền vào (frm203002.cs:2205 / :2215).</summary>
    private const string LabelKobeCode = "個別入力のコード";

    private MstTrtCandidate? _candidate;
    private PatientScoreContext? _patient;

    [OneTimeSetUp]
    public void ResolveTestData()
    {
        if (Db is null) return;

        _candidate = Db.FindScoreCandidate(TrtDate);
        _patient = Db.GetPatientContext(PatNo, TrtDate);

        TestContext.Out.WriteLine(_candidate is null
            ? "Master đang áp dụng KHÔNG có 処置 nào score1/2/3 khác nhau đôi một (f1 0, acc_unit 9..12)."
            : $"処置 đem test: {_candidate}");
        TestContext.Out.WriteLine(_patient is null
            ? $"Không đọc được ngày sinh / dis_flg của bệnh nhân {PatNo}."
            : $"Bệnh nhân {PatNo}: sinh {_patient.Birth:yyyy-MM-dd}, tuổi {_patient.Age} tại ngày test, dis_flg {_patient.DisFlg}.");
    }

    private MstTrtCandidate RequireCandidate()
    {
        RequireDb();
        if (_candidate is null)
            IgnoreWithReason(
                "master đang áp dụng không có 処置 nào score1/2/3 khác nhau đôi một (f1 0, acc_unit 9..12) — " +
                "không có dòng như vậy thì lấy nhầm cột vẫn ra đúng, testcase mất tác dụng");
        return _candidate!;
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("TC-1 — cột 「50/100」 = score2 và cột 「訪問」 = score3 (modKobetu.cs:203-207)")]
    public void Tc1_ThreeScoreColumns_MapToScore1Score2Score3()
    {
        var c = RequireCandidate();

        var kobetu = Screen.Kobetu.Open();
        kobetu.ResetSearchBoxes();
        var row = kobetu.RequireRow(c.TrtCd, c.TrtSb);

        Assert.That(row.Cells, Has.Count.EqualTo(KobetuTab.ExpectedHeaders.Length),
            $"một dòng 個別 phải có đúng {KobetuTab.ExpectedHeaders.Length} ô như hfgKobetu " +
            $"(Columns[2,3,4,5,12,13] Visible). Đang đọc được: {row}");

        // Ba cột điểm gộp vào một Multiple: hồi quy kiểu bind nhầm cột thường lệch CẢ CỤM,
        // assert cứng từng cái chỉ cho thấy cột đầu tiên rồi dừng.
        Assert.Multiple(() =>
        {
            Assert.That(row.IntAt(KobetuTab.Col.Ippan), Is.EqualTo(c.Score1),
                $"cột 「一般」 phải là score1 (={c.Score1}), đang nhận 「{row.At(KobetuTab.Col.Ippan)}」");

            Assert.That(row.IntAt(KobetuTab.Col.Gojuu), Is.EqualTo(c.Score2),
                $"cột 「50/100」 phải là score2 (={c.Score2}), đang nhận 「{row.At(KobetuTab.Col.Gojuu)}」. " +
                $"Ra {c.Score3} tức là đang bind score3; ra 「老人」 ở header tức là port theo Designer " +
                "thay vì theo modKobetu.");

            Assert.That(row.IntAt(KobetuTab.Col.Houmon), Is.EqualTo(c.Score3),
                $"cột 「訪問」 phải là score3 (={c.Score3}), đang nhận 「{row.At(KobetuTab.Col.Houmon)}」. " +
                $"Ra {c.F1} tức là đang bind f1 — f1 là cờ phân loại, KHÔNG phải điểm.");

            Assert.That(row.IntAt(KobetuTab.Col.Code), Is.EqualTo(c.TrtCd), "cột 「ｺｰﾄﾞ」");
            Assert.That(row.IntAt(KobetuTab.Col.Sub), Is.EqualTo(c.TrtSb), "cột 「枝番」");
        });
    }

    [Test, Order(2)]
    [Description("TC-2 — ngày 訪問診療: chọn dòng 個別 phải ghi điểm getTensu (score3), không phải score1")]
    public void Tc2_HomeVisitDay_UsesGetTensuScore_NotScore1()
    {
        var c = RequireCandidate();
        var db = RequireDb();

        if (_patient is null)
            IgnoreWithReason(
                $"không đọc được ngày sinh / dis_flg của bệnh nhân {PatNo} để suy ra nhánh getTensu");
        var patient = _patient!;

        if (patient.DisFlg == TensuOracle.DisFlgHighNeeds)
            IgnoreWithReason(
                $"bệnh nhân {PatNo} có dis_flg 3 (歯科診療特別対応) — nhánh getTensu này còn phụ thuộc " +
                "加算 đã tính trong ngày (chkHighNeedsAdd), không chốt được kỳ vọng tĩnh");

        var (expected, branch) = TensuOracle.HomeVisitScore(c, patient, TrtDate);
        var kobetu = Screen.Kobetu.Open();

        // ── Tiền đề: biến ngày đang đứng thành NGÀY 訪問診療 ──────────────────────
        // Chọn 歯科訪問診療 (333) ở tab 個別 → pKobetu_Let_Trt_Data rẽ vào case "333" và đặt
        // ModCommon.pHoumon[ngày của dòng hiện tại] = true (modKobetu.cs:336-339). Cả hai
        // lần chèn (333 rồi 処置 đem test) đều rơi vào cùng dòng ngày đó, nên tiền đề và
        // phép đo luôn nói về CÙNG một ngày kể cả khi con trỏ lưới không đứng đúng
        // patient.trtDate.
        var houmonNames = NamesOf(db, HoumonTrtCd, fallback: "歯科訪問診療");
        var houmonBefore = Screen.Regi.CountRyoContaining(houmonNames);

        kobetu.ResetSearchBoxes();
        // Bất kỳ 枝番 nào của 333 cũng bật cờ: pKobetu_Let_Trt_Data rẽ theo MỖI trt_cd
        // (modKobetu.cs:307 switch trên Rows[0][0]), không xét 枝番.
        kobetu.SelectRow(kobetu.SearchByCode(HoumonTrtCd)[0]);

        Waits.Until(() => Screen.Regi.CountRyoContaining(houmonNames) > houmonBefore,
            $"dòng 歯科訪問診療 (mã {HoumonTrtCd}) lên lưới đăng ký — không có nó thì ngày test " +
            "KHÔNG phải 訪問診療日 và testcase mất tiền đề");

        // ── Phép đo ────────────────────────────────────────────────────────────
        var names = c.DisplayNames;
        var before = Screen.Regi.CountRyoContaining(names);

        kobetu.Open();
        kobetu.ResetSearchBoxes();
        kobetu.SelectRow(kobetu.RequireRow(c.TrtCd, c.TrtSb));

        Waits.Until(() => Screen.Regi.CountRyoContaining(names) > before,
            $"chọn dòng 個別 「{c.TrtNm}」 mà lưới đăng ký không thêm dòng nào");

        var added = Screen.Regi.LastRowMatching(names)
                    ?? throw new InvalidOperationException(
                        $"lưới đăng ký báo có thêm dòng nhưng không đọc lại được dòng 「{c.TrtNm}」");

        var actual = added.IntAt(RegiGrid.Col.Ten);

        Assert.That(actual, Is.EqualTo(expected),
            $"点 của 処置 vừa chọn phải là {expected} ({branch}; score1={c.Score1} score2={c.Score2} " +
            $"score3={c.Score3}, acc_unit={c.AccUnit} f1={c.F1}). Đang nhận 「{added.At(RegiGrid.Col.Ten)}」. " +
            $"Nếu ra {c.Score1} tức là đã lấy thẳng 一般, bỏ qua getTensu " +
            $"(modKobetu.cs:265 → CommonChk.cs:83). Cả dòng: {added}");
    }

    [Test, Order(3)]
    [Description("TC-3 — ô ｺｰﾄﾞ chỉ ăn số nguyên: 「174-0」 ra E00002 và KHÔNG search")]
    public void Tc3_CodeBox_RejectsNonInteger_AndCancelsSearch()
    {
        // InputCheckKobe (frm203002.cs:2194) chặn TRƯỚC khi tới GetWhereKobeNyuryokuInfo, nên
        // cú pháp "cd-sb" mà comment ở :2054 mô tả chưa bao giờ chạy được. Chốt lại để không
        // ai "sửa" bằng cách mở nhánh tách dấu gạch ngang — đó là thêm tính năng, không phải
        // giữ nguyên hành vi.
        var kobetu = Screen.Kobetu.Open();
        kobetu.ResetSearchBoxes();

        // 検索 hợp lệ trước để lưới ở trạng thái ĐÃ BIẾT: khẳng định "không search" chỉ có
        // nghĩa khi biết trước đó lưới đang là gì. Dùng 処置 đem test nếu có, không thì mã
        // 333 (歯科訪問診療) — mã này luôn tồn tại nên TC-3 chạy được cả khi không có DB.
        var knownCode = _candidate?.TrtCd ?? HoumonTrtCd;
        kobetu.SearchByCode(knownCode);
        var codesBefore = kobetu.VisibleCodes();
        var rowsBefore = kobetu.DataRowCount();

        Assert.That(codesBefore, Is.EqualTo(new[] { knownCode.ToString() }),
            $"sau khi bấm 検索 với ｺｰﾄﾞ {knownCode}, lưới phải chỉ còn mã đó");

        Uia.SetText(kobetu.CodeBox, "174-0");
        kobetu.ClickSearch();

        var expectedMessage = Db?.ExpectedMessage("E00002", LabelKobeCode)
                              ?? LabelKobeCode + "が間違っています。";

        var dialog = Dialogs.WaitFor(App.Automation, App.ProcessId, expectedMessage);
        Assert.That(Txt.N(Dialogs.TextOf(dialog)), Does.Contain(Txt.N(expectedMessage)),
            $"gõ 「174-0」 phải bung E00002 「{expectedMessage}」 (int.TryParse thất bại vì dấu gạch ngang)");

        Dialogs.DismissOk(dialog);

        Assert.Multiple(() =>
        {
            Assert.That(kobetu.DataRowCount(), Is.EqualTo(rowsBefore),
                "search bị huỷ thì lưới phải giữ nguyên số dòng — đổi tức là mã hỏng vẫn được " +
                "đem đi lọc, hoặc bị âm thầm bỏ qua rồi kéo về cả master");

            Assert.That(kobetu.VisibleCodes(), Is.EqualTo(codesBefore),
                "…và giữ nguyên đúng những mã cũ");
        });

        // Trả ô về trạng thái sạch: cả fixture dùng chung một phiên app.
        Uia.Clear(kobetu.CodeBox);
    }

    /// <summary>Tên có thể hiển thị của một 処置 (cct_nm / trt_nm), hỏi DB nếu có.</summary>
    private static string[] NamesOf(OchaDb? db, int trtCd, string fallback)
    {
        var fromDb = db?.FindTrtName(TestSettings.Current.Patient.ResolvedTrtDate, trtCd);
        if (fromDb is null) return [fallback];

        var names = new[] { fromDb.Value.TrtNm, fromDb.Value.CctNm }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .ToArray();
        return names.Length > 0 ? names : [fallback];
    }
}
