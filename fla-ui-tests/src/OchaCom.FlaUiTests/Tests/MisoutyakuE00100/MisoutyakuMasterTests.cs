using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MisoutyakuE00100;

/// <summary>
/// Khoá <b>TIỀN ĐỀ</b> của ca UI mã 999 — <b>chỉ hỏi DB, KHÔNG mở app</b>, chạy vài giây.
/// <b>CHẠY CÁI NÀY TRƯỚC.</b>
///
/// <para>Nguồn yêu cầu: <c>fla-ui-todo-inp-legacy-sync-20260921.md</c> §B.
/// Nguồn chân lý: <c>modMain.cs:1800-1830</c> (<c>Misoutyaku</c>),
/// <c>Trntrn.getInpTrnImpDt</c>, <c>frm203002.cs:5589-5618</c>.</para>
/// </summary>
[TestFixture]
[Category("db-only")]
public sealed class MisoutyakuMasterTests
{
    /// <summary>Nguyên văn thân hộp thoại E00100 — modMain.cs:1824.</summary>
    public const string E00100Text = "以前の印象データが見つかりません。コード999は入力できません。";

    private MisoutyakuDb _db = null!;
    private TestSettings _s = null!;

    private static void Log(string l) => TestContext.Out.WriteLine(l);

    [OneTimeSetUp]
    public void SetUp()
    {
        _s = TestSettings.Current;
        _db = MisoutyakuDb.CreateOrNull(_s)
              ?? throw new IgnoreException("Cần db.enabled = true + connectionString.");
        if (_db.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} " +
                          "(container ochacom_sql2022 — CỔNG 1434 — còn chạy không?)");
    }

    [Test, Order(1)]
    [Description("TCM_0 — bệnh nhân test CHƯA TỪNG có 印象 tới cuối tháng ⇒ E00100 PHẢI bung")]
    public void TCM_0_Patient_Has_No_Impression_History()
    {
        var patNo = int.Parse(_s.Patient.PatNo);
        var day = _s.Patient.ResolvedTrtDate;
        var rows = _db.ImpressionRows(patNo, day);
        var impDt = _db.InpTrnImpDt(patNo, day);

        Log($"=== KQ-0 === bệnh nhân {patNo}, tới cuối tháng {day:yyyy-MM}: " +
            $"{rows.Count} dòng 印象; getInpTrnImpDt ⇒ {impDt?.ToString("yyyy-MM-dd") ?? "null"}");
        foreach (var r in rows) Log("   " + r);

        Assert.That(rows, Is.Empty,
            $"Bệnh nhân {patNo} đã có {rows.Count} dòng 印象 tính tới cuối tháng {day:yyyy-MM}. " +
            "Misoutyaku sẽ tìm ra ngày qua getInpTrnImpDt (bước 2) và **KHÔNG** bung E00100 — " +
            "ca UI sẽ đỏ vì TIỀN ĐỀ, không phải vì app sai.\n" +
            "  ⚠️ getInpTrnImpDt quét TOÀN BỘ lịch sử và KHÔNG lọc DEL_FLG, nên cả dòng đã xoá " +
            "mềm cũng chặn E00100.\n" +
            "  Dòng đang có:\n   " + string.Join("\n   ", rows.Select(r => r.ToString())));

        Assert.That(impDt, Is.Null, "getInpTrnImpDt phải trả null thì E00100 mới bung.");
    }

    [Test, Order(2)]
    [Description("TCM_1 — ngày test có 処置 mang 点数 > 0 để gõ đè 999 lên (§B2)")]
    public void TCM_1_Day_Has_A_Scored_Row_To_Overwrite()
    {
        var patNo = int.Parse(_s.Patient.PatNo);
        var day = _s.Patient.ResolvedTrtDate;
        var n = _db.ScoredRowsOnDay(patNo, day);

        Log($"=== KQ-1 === bệnh nhân {patNo} ngày {day:yyyy-MM-dd}: {n} dòng có 点数 > 0");

        Assert.That(n, Is.GreaterThan(0),
            $"Ngày {day:yyyy-MM-dd} không có dòng 処置 nào mang 点数 > 0. §B2 hỏi 「gõ đè 999 lên " +
            "một dòng ĐÃ CÓ 点数 thì ô 点 có bị xoá trắng không」 — không có dòng như thế thì ca " +
            "đo mất đúng cái nó định đo (dòng trống thì hai vế đều trống, không phân biệt được).");
    }

    [Test, Order(3)]
    [Description("TCM_2 — ĐỐI CHỨNG: bệnh nhân CÓ 印象 cũ ⇒ getInpTrnImpDt trả ngày ⇒ KHÔNG E00100")]
    public void TCM_2_Contrast_Patient_Has_Old_Impression()
    {
        const int contrastPatNo = 14788;
        var day = _s.Patient.ResolvedTrtDate;
        var rows = _db.ImpressionRows(contrastPatNo, day);
        var impDt = _db.InpTrnImpDt(contrastPatNo, day);

        Log($"=== KQ-2 === bệnh nhân ĐỐI CHỨNG {contrastPatNo}: {rows.Count} dòng 印象; " +
            $"getInpTrnImpDt ⇒ {impDt?.ToString("yyyy-MM-dd") ?? "null"}");
        foreach (var r in rows) Log("   " + r);

        Assert.That(rows, Is.Not.Empty,
            $"Bệnh nhân đối chứng {contrastPatNo} không còn dòng 印象 nào — mất ca chứng minh " +
            "「không có 印象 trên lưới mà VẪN không ra E00100 vì DB còn dòng cũ」. Tìm bệnh nhân " +
            "khác có 印象 ở một tháng KHÔNG hiển thị trên lưới.");

        Assert.That(impDt, Is.Not.Null,
            "getInpTrnImpDt của bệnh nhân đối chứng phải trả về một ngày.");

        Log($"⇒ Với bệnh nhân {contrastPatNo}, dù lưới không có 印象 nào, app vẫn lấy được ngày " +
            $"{impDt:yyyy-MM-dd} ở bước 2 ⇒ KHÔNG bung E00100. Đây là chỗ ghi chú gốc §B1 " +
            "mô tả thiếu.");
    }
}
