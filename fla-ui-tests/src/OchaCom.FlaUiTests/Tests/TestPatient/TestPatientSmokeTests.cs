using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.TestPatient;

/// <summary>
/// Smoke test của <see cref="TestPatientDb"/> — <b>KHÔNG mở app</b>, chỉ hỏi và ghi DB.
///
/// <para>Vế SQL Server của smoke test đã chạy cho <c>tests/_shared/test-patient.ts</c>
/// bên web (2026-09-14: dựng bệnh nhân 990000 clone từ bệnh nhân 1 — 153 dòng trên 11
/// bảng — rồi xoá sạch, <c>describeRemaining</c> trả 「(sạch)」).</para>
///
/// <para><b>Vì sao phải có smoke riêng thay vì tin vào tính đối xứng:</b> hai vế cùng ý
/// tưởng nhưng khác hệ CSDL, khác tên bảng, khác cách sinh khoá chính (<c>IDENTITY</c> ↔
/// <c>uuidv7()</c>). Một vế xanh KHÔNG chứng minh vế kia xanh — đúng tinh thần F3: đo,
/// đừng suy.</para>
///
/// <para>Fixture này CỐ Ý không kế thừa <c>UiTestBase</c>: nó không cần màn hình, nên
/// chạy được cả khi app không mở được, và chạy hết trong vài giây.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// Ghi và xoá TRONG VÙNG TEST (<c>PAT_NO &gt;= <see cref="TestPatientDb.TestPatNoBase"/></c>).
/// <see cref="TestPatientDb"/> ném ngay nếu bị gọi với số ngoài vùng, nên không có
/// đường nào chạm vào bệnh nhân thật. Vẫn đứng sau cờ RIÊNG
/// <c>testPatient.allowSeed</c> để một lượt chạy vô tình không ghi gì.
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(300_000)]
public sealed class TestPatientSmokeTests
{
    private TestSettings _settings = null!;
    private TestPatientDb _db = null!;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    [OneTimeSetUp]
    public void SmokeOneTimeSetUp()
    {
        _settings = TestSettings.Current;

        if (!_settings.TestPatient.AllowSeed)
            Assert.Ignore("Cần testPatient.allowSeed = true (hoặc OCHA_TEST_PATIENT_ALLOW_SEED=1) — " +
                          $"fixture dựng/xoá bệnh nhân trong vùng PAT_NO >= {TestPatientDb.TestPatNoBase}.");

        var db = TestPatientDb.CreateOrNull(_settings, allowWrite: true);
        if (db is null) Assert.Ignore("db.enabled = false hoặc thiếu chuỗi kết nối.");
        if (db!.ProbeError() is { } err) Assert.Ignore($"không kết nối được SQL Server: {err}");
        _db = db;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCS1 — dựng, kiểm, xoá, kiểm sạch
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCS1 — dựng bệnh nhân test mới, kiểm hồ sơ đủ, xoá, kiểm SẠCH tuyệt đối")]
    public void TCS1_Create_Then_Drop_Leaves_Nothing_Behind()
    {
        // Dọn sót ở ĐẦU lượt, không phải cuối: lượt song song sẽ bị giật mất bệnh nhân
        // nếu dọn ở cuối.
        var leftovers = _db.DropLeftovers();
        Log($"dọn sót trước lượt chạy: {(leftovers.Count == 0 ? "(không có)" : string.Join(",", leftovers))}");

        var template = _db.FindTemplatePatNo();
        Assert.That(template, Is.Not.Null,
            "Không tìm được bệnh nhân MẪU để clone (PERSON + INSURANCE). DB rỗng, hay " +
            "db.connectionString trỏ sai Initial Catalog?");
        Log($"bệnh nhân MẪU: {template}");

        var patNo = _db.NextPatNo();
        Assert.That(patNo, Is.GreaterThanOrEqualTo(TestPatientDb.TestPatNoBase),
            "NextPatNo cấp số NGOÀI vùng test — hàng rào hỏng, dừng ngay.");

        var created = _db.Create(patNo, template!.Value, _settings.Patient.ResolvedTrtDate);
        Log($"đã dựng: {created}");

        Assert.Multiple(() =>
        {
            Assert.That(_db.Exists(patNo), Is.True,
                $"Dựng xong mà PERSON không có PAT_NO {patNo} — clone hỏng.");

            Assert.That(created.RowsPerTable.GetValueOrDefault("PERSON"), Is.EqualTo(1),
                "Phải clone ĐÚNG một dòng PERSON. Số khác nghĩa là bệnh nhân mẫu có nhiều " +
                "dòng PERSON (không nên có) hoặc câu INSERT…SELECT sai điều kiện.");

            Assert.That(created.RowsPerTable.GetValueOrDefault("INSURANCE"), Is.GreaterThan(0),
                "Bệnh nhân mới KHÔNG có dòng INSURANCE nào ⇒ màn 診療入力 sẽ từ chối mở. " +
                "Bệnh nhân mẫu có bảo hiểm không?");

            // 処置 và tiền phải TRỐNG — đó chính là thứ khiến bệnh nhân mới đáng dùng.
            Assert.That(created.RowsPerTable.ContainsKey("TRNTRN"), Is.False,
                "TRNTRN bị clone — bệnh nhân mới phải bắt đầu với lịch sử 処置 TRỐNG, nếu không " +
                "thì mọi kỳ vọng lại phụ thuộc lịch sử của người mẫu (đúng cái lớp này sinh ra để bỏ).");
        });

        Log($"còn lại sau khi dựng: {_db.DescribeRemaining(patNo)}");

        // ── Dọn và kiểm SẠCH ─────────────────────────────────────────────────
        var deleted = _db.Drop(patNo);
        Log($"đã xoá: {string.Join(", ", deleted.Select(kv => $"{kv.Key}:{kv.Value}"))}");

        var remaining = _db.DescribeRemaining(patNo);
        Assert.Multiple(() =>
        {
            Assert.That(_db.Exists(patNo), Is.False,
                $"Xoá xong mà PERSON vẫn còn PAT_NO {patNo}.");
            Assert.That(remaining, Is.EqualTo("(sạch)"),
                $"Bệnh nhân test {patNo} còn sót bản ghi sau khi Drop: {remaining}.\n" +
                "  ⇒ có bảng mang PAT_NO chưa nằm trong ProfileTables/GeneratedTables. " +
                "Thêm nó vào danh sách, đừng xoá tay.");
        });

        Log($"=== KQ-TCS1 === dựng {patNo} (clone {template}) rồi xoá ⇒ {remaining}");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCS2 — hàng rào vùng số
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCS2 — hàng rào: mọi thao tác trên PAT_NO ngoài vùng test phải bị CHẶN")]
    public void TCS2_Operations_Outside_Test_Range_Are_Refused()
    {
        // ⛔ Đây là assert quan trọng nhất của cả lớp: nó là thứ duy nhất đứng giữa một
        //    lỗi đánh máy và việc xoá mất bệnh nhân THẬT của phòng khám.
        var real = TestPatientDb.TestPatNoBase - 1;

        Assert.Multiple(() =>
        {
            Assert.That(() => _db.Drop(real), Throws.InvalidOperationException,
                $"Drop({real}) — số NGOÀI vùng test — phải bị chặn mà lại chạy được. " +
                "Hàng rào RequireTestRange hỏng: sửa NGAY trước khi chạy bất cứ luồng nào khác.");

            Assert.That(() => _db.Create(real, real, DateTime.Today), Throws.InvalidOperationException,
                $"Create({real}, …) phải bị chặn.");

            Assert.That(() => _db.Drop(10), Throws.InvalidOperationException,
                "Drop(10) — bệnh nhân test CŨ, dữ liệu thật — phải bị chặn.");
        });

        // Và bệnh nhân thật vẫn còn nguyên sau khi bị từ chối.
        Assert.That(_db.Exists(TestPatientDb.TestPatNoBase), Is.False,
            "Vùng test phải trống sau TCS1 — nếu còn thì TCS1 chưa dọn xong.");

        Log("=== KQ-TCS2 === hàng rào vùng số chặn đúng cả ba đường (Drop/Create/Drop số thật).");
    }
}
