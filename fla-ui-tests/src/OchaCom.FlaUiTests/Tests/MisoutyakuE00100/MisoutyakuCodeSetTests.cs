using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.MisoutyakuE00100;

/// <summary>
/// §B4 — <b>định nghĩa 「dòng 印象」</b>: mã nào được <c>Misoutyaku</c> nhận, mã nào không.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÁCH ĐO
/// ═══════════════════════════════════════════════════════════════════════════════
/// Bệnh nhân <b>chưa từng</b> có 印象 (nên E00100 vốn sẽ bung). Seed <b>MỘT</b> dòng mang mã
/// đem thử vào ngày test, mở app, rồi gõ 999:
/// <list type="bullet">
///   <item>mã <b>ĐƯỢC</b> coi là 印象 ⇒ vòng quét bắt được ⇒ <b>KHÔNG</b> ra E00100;</item>
///   <item>mã <b>KHÔNG</b> ⇒ cả hai bước trượt ⇒ <b>CÓ</b> E00100.</item>
/// </list>
///
/// <para><b>Mỗi lượt chạy đúng MỘT mã</b> (<c>misoutyaku.seedTrtCd</c>/<c>seedTrtSb</c>) —
/// seed nhiều mã cùng lúc thì chỉ cần MỘT mã được nhận là cả lượt ra 「không E00100」, và
/// ca đo không chỉ được mã nào.</para>
///
/// <para>⚠️ Mong đợi tính từ <see cref="MisoutyakuDb.IsImpressionCode"/>, tức từ chính phép
/// so ở <c>modMain.cs:1807-1810</c> — không hard-code từng ca.</para>
///
/// <para><b>GHI DB</b>: một dòng, dải <c>disp_no</c> 9300..9399, sau cờ riêng
/// <c>misoutyaku.allowSeed</c>, dọn ở <c>OneTimeTearDown</c>. Không bấm F9 登録.</para>
/// </summary>
[TestFixture]
[CancelAfter(900_000)]
public sealed class MisoutyakuCodeSetTests : UiTestBase
{
    /// <summary>Nhãn ghi vào <c>DSP_TRT</c> của dòng seed, để tìm lại trên lưới.</summary>
    public const string SeedTag = "TESTIMP";

    private MisoutyakuDb? _db;
    private MisoutyakuOps _ops = null!;
    private int _seedTrtCd;
    private int _seedTrtSb;

    private static void Log(string l) => TestContext.Out.WriteLine(l);

    /// <summary>Ca này ĐANG ĐO hộp thoại — không để watcher trả lời hộ (F19).</summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        var m = Settings.Misoutyaku;
        if (!m.AllowSeed)
            return "Fixture này seed MỘT dòng 処置 vào TRNTRN (dải disp_no 9300..9399) — bật " +
                   "misoutyaku.allowSeed = true trong testsettings.local.json.";
        if (m.SeedTrtCd <= 0)
            return "Chưa chọn mã đem thử — đặt misoutyaku.seedTrtCd (và seedTrtSb). Mỗi lượt " +
                   "chạy ĐÚNG MỘT mã: seed nhiều mã thì chỉ cần một mã được nhận là cả lượt ra " +
                   "「không E00100」 và ca đo không chỉ được mã nào.";
        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        _db = MisoutyakuDb.CreateOrNull(Settings);
        if (_db is null) Assert.Ignore("Cần db.enabled = true + connectionString để seed.");
        if (_db!.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} (cổng 1434 còn chạy không?)");

        _seedTrtCd = Settings.Misoutyaku.SeedTrtCd;
        _seedTrtSb = Settings.Misoutyaku.SeedTrtSb;

        // ── ① TIỀN ĐỀ: bệnh nhân CHƯA có 印象 nào — kiểm TRƯỚC khi seed ─────
        var before = _db.ImpressionRows(PatNo, TrtDate);
        Log($"=== NGUYÊN TRẠNG === bệnh nhân {PatNo}, 印象 tới cuối tháng {TrtDate:yyyy-MM}: " +
            $"{before.Count} dòng");
        foreach (var r in before) Log("   " + r);

        if (before.Count > 0)
            Assert.Ignore(
                $"Bệnh nhân {PatNo} đã có {before.Count} dòng 印象 sẵn ⇒ E00100 sẽ KHÔNG bao giờ " +
                "bung, và ca đối chứng (mã KHÔNG phải 印象 ⇒ phải ra E00100) mất nghĩa. " +
                "Chọn bệnh nhân chưa từng có 印象.");

        var leftover = _db.CountSeeded(PatNo);
        if (leftover > 0)
        {
            Log($"⚠️ còn {leftover} dòng SÓT trong dải seed từ lượt trước — dọn trước.");
            _db.DeleteSeeded(PatNo);
        }

        // ── ② seed, TRƯỚC KHI APP MỞ ────────────────────────────────────────
        var disp = _db.SeedTreatmentRow(PatNo, TrtDate, _seedTrtCd, _seedTrtSb, SeedTag);
        var isImp = MisoutyakuDb.IsImpressionCode(_seedTrtCd, _seedTrtSb);
        Log($"=== SEED === disp {disp} · {_seedTrtCd}/{_seedTrtSb} 「{SeedTag}」 " +
            $"⇒ theo modMain.cs:1807-1810 đây {(isImp ? "LÀ" : "KHÔNG phải")} dòng 印象 " +
            $"⇒ mong đợi {(isImp ? "KHÔNG" : "CÓ")} E00100.");
    }

    [OneTimeTearDown]
    public void CleanUp()
    {
        if (_db is null) return;
        try
        {
            var deleted = _db.DeleteSeeded(PatNo);
            var left = _db.CountSeeded(PatNo);
            Log($"=== DỌN === xoá {deleted} dòng seed; còn lại trong dải " +
                $"{MisoutyakuDb.SeedDispBase}..{MisoutyakuDb.SeedDispMax}: {left}");
            if (left > 0)
                Log($"⛔ CÒN SÓT {left} dòng — dọn tay: DELETE FROM TRNTRN WHERE PAT_NO = {PatNo} " +
                    $"AND DISP_NO BETWEEN {MisoutyakuDb.SeedDispBase} AND {MisoutyakuDb.SeedDispMax}");
        }
        catch (Exception e)
        {
            Log($"⛔ DỌN HỎNG: {e.Message} — dọn tay theo câu DELETE ở trên TRƯỚC lượt sau.");
        }
    }

    [SetUp]
    public void Init() => _ops = new MisoutyakuOps(App, new SigaToothFlow(App, Screen));

    [Test]
    [Description("TCM_20 ← §B4 — mã seed có được coi là 印象 không (đo bằng có/không E00100)")]
    public void TCM_20_Impression_Code_Set()
    {
        using var trace = TestTrace.Begin();

        var isImp = MisoutyakuDb.IsImpressionCode(_seedTrtCd, _seedTrtSb);
        Log($"=== ĐANG ĐO === mã {_seedTrtCd}/{_seedTrtSb} · mong đợi " +
            $"{(isImp ? "KHÔNG có" : "CÓ")} E00100");

        // ── dòng seed phải THẬT SỰ lên được lưới ───────────────────────────
        var day = TrtDate.Day;
        var grid = _ops.Flow.Grid.Snapshot(200).ToList();
        var seeded = grid.LastOrDefault(r => Txt.Has(r.Ryo, SeedTag));
        Assert.That(seeded, Is.Not.Null,
            $"Không thấy dòng seed 「{SeedTag}」 trên lưới ⇒ seed không tới được app.\n" +
            "  Kiểm: (1) seed có chạy TRƯỚC khi app mở không; (2) app có đọc ĐÚNG DB không " +
            "(cổng 1434, xem C:\\NEW_SIM2000\\Ocha.xml).\n  Lưới:\n  " +
            string.Join("\n  ", _ops.Flow.DescribeGrid(60)));
        Log($"dòng seed trên lưới: 「{seeded}」");

        // ── gõ 999 lên một dòng đã có 点数 ──────────────────────────────────
        var target = _ops.PickScoredRow(day, trace);
        Assert.That(target, Is.Not.Null,
            $"Ngày {day} không có dòng nào mang 点数 > 0 để gõ đè 999.");

        Assert.That(_ops.Flow.EnsureCodeMode(), Is.True,
            $"Không đưa được ô 点 về コードモード — đang là 「{_ops.Flow.InpMode()}」 ⇒ HARNESS hỏng.");

        _ops.Enter999(target!, trace);

        // Deadline NGẮN có chủ ý (F2): nửa số ca ở đây đang đo 「hộp thoại KHÔNG tồn tại」.
        var found = _ops.CaptureDialog(TimeSpan.FromSeconds(8));
        trace.Shot("sau-khi-go-999");

        var got = found is not null &&
                  Txt.Has(found.Text, MisoutyakuMasterTests.E00100Text);
        Log($"=== KQ-B4 === mã {_seedTrtCd}/{_seedTrtSb} ⇒ E00100 {(got ? "CÓ" : "KHÔNG")} bung" +
            (found is not null ? $" · hộp thoại: 「{found.Title}」 「{found.Text}」" : ""));

        if (found is not null) _ops.CloseDialog(found);

        Assert.That(got, Is.EqualTo(!isImp),
            $"§B4 — mã {_seedTrtCd}/{_seedTrtSb}: mong đợi E00100 {(!isImp ? "CÓ" : "KHÔNG")} bung, " +
            $"thực tế {(got ? "CÓ" : "KHÔNG")}.\n" +
            $"  Mong đợi tính từ modMain.cs:1807-1810 — 240/247 khớp BẤT KỂ 枝番, 325 chỉ 枝番 " +
            "5/8, 530 chỉ 枝番 2.\n" +
            "  Đỏ ở đây = bộ mã 印象 thật KHÁC với bộ trong source ⇒ sửa isImpressionTrt(...) " +
            "trong treatment-entry-detail.tsx của vế web cho khớp.\n" +
            (found is not null ? $"  Hộp thoại gặp: 「{found.Title}」 / 「{found.Text}」" : "  Không có hộp thoại nào."));
    }
}
