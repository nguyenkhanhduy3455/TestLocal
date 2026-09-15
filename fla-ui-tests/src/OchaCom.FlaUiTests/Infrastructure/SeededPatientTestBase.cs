using NUnit.Framework;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Base cho mọi luồng chạy trên <b>bệnh nhân test dựng mới</b> thay vì bệnh nhân có sẵn.
///
/// <para>Nó làm đúng ba việc, và làm TRƯỚC KHI APP MỞ:</para>
/// <list type="number">
///   <item>dọn bệnh nhân còn sót của những lượt bị cắt giữa chừng;</item>
///   <item>dựng một bệnh nhân mới (clone từ một bệnh nhân thật đủ hồ sơ), bảo hiểm
///     được kéo dài để bao <c>patient.trtDate</c>;</item>
///   <item>ghi đè <c>Settings.Patient.PatNo</c> ⇒ <c>UiTestBase</c> mở app với chính
///     bệnh nhân vừa dựng.</item>
/// </list>
///
/// <para>Cuối lượt: xoá sạch và KIỂM LẠI bằng <see cref="TestPatientDb.DescribeRemaining"/>
/// — dọn mà không kiểm thì lần sau mới biết là sót.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO ĐÁNG ĐỔI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   bệnh nhân CÓ SẴN                     bệnh nhân DỰNG MỚI
///   ─────────────────────────────        ─────────────────────────────
///   kỳ vọng phụ thuộc lịch sử            lịch sử 処置 TRỐNG, test tự seed
///   (「月計 413」 đúng tới khi ai đó
///    thêm một dòng 処置)
///   dọn dẹp phải né dữ liệu thật         xoá cả bệnh nhân, không né ai
///   (khoá thêm TRT_DT chỉ vì một
///    dòng 再初診 cố định ở ngày khác)
///   ca biên dựng không nổi               muốn 歯式 nào cũng đặt được
///   hai luồng giẫm chân nhau             mỗi lượt một PAT_NO riêng
/// </code>
///
/// <para><b>Lớp con vẫn được override <see cref="PrepareDataBeforeApp"/></b> để seed
/// 処置/歯式 của riêng nó — nhớ gọi <c>base.PrepareDataBeforeApp()</c> TRƯỚC, vì bệnh
/// nhân phải tồn tại rồi mới seed được gì cho nó.</para>
/// </summary>
public abstract class SeededPatientTestBase : UiTestBase
{
    private TestPatientDb? _patients;

    /// <summary>Bệnh nhân vừa dựng; null khi cờ tắt hoặc DB không sẵn.</summary>
    protected TestPatientDb.Created? SeededPatient { get; private set; }

    /// <summary>
    /// Lý do bỏ qua RIÊNG của lớp con (cờ ghi của luồng…). Trả null nếu không có.
    ///
    /// <para>Lớp con override cái này thay vì <c>FixturePreflightSkipReason</c>: base
    /// phải giữ chỗ đó để kiểm cờ <c>testPatient.allowSeed</c> trước đã.</para>
    /// </summary>
    protected virtual string? SeededFixtureSkipReason() => null;

    protected sealed override string? FixturePreflightSkipReason()
    {
        if (!Settings.TestPatient.AllowSeed)
            return "Cần testPatient.allowSeed = true (hoặc OCHA_TEST_PATIENT_ALLOW_SEED=1) — " +
                   "luồng này dựng một BỆNH NHÂN TEST MỚI " +
                   $"(PAT_NO >= {TestPatientDb.TestPatNoBase}) rồi xoá sạch sau lượt chạy, " +
                   "thay vì bám vào bệnh nhân có sẵn.";
        return SeededFixtureSkipReason();
    }

    /// <summary>
    /// Dựng bệnh nhân rồi TRỎ CẤU HÌNH sang nó — chạy trước khi app mở.
    ///
    /// <para>⚠️ Lớp con override thì phải gọi <c>base.PrepareDataBeforeApp()</c> ở dòng
    /// ĐẦU: mọi thứ seed sau đó (部位病名行, 歯式…) đều cần <c>PatNo</c> đã trỏ đúng.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        if (!Settings.TestPatient.AllowSeed) return;

        var db = TestPatientDb.CreateOrNull(Settings, allowWrite: true);
        if (db is null)
        {
            Log("KHÔNG dựng được bệnh nhân test: db.enabled = false hoặc thiếu chuỗi kết nối.");
            return;
        }
        if (db.ProbeError() is { } err)
        {
            Log($"KHÔNG dựng được bệnh nhân test: {err}");
            return;
        }
        _patients = db;

        // Dọn sót ở ĐẦU lượt, không phải cuối: một lượt chạy song song sẽ bị giật mất
        // bệnh nhân của nó nếu ta dọn cả vùng ở cuối.
        var leftovers = db.DropLeftovers();
        if (leftovers.Count > 0)
            Log($"dọn bệnh nhân test còn sót của lượt trước: {string.Join(", ", leftovers)}");

        var template = Settings.TestPatient.TemplatePatNo > 0
            ? Settings.TestPatient.TemplatePatNo
            : db.FindTemplatePatNo() ?? 0;
        if (template <= 0)
        {
            Log("KHÔNG tìm được bệnh nhân MẪU để clone (PERSON + INSURANCE) — bỏ qua việc dựng.");
            return;
        }

        var patNo = db.NextPatNo();
        SeededPatient = db.Create(patNo, template, TrtDate);
        Log($"╔══ BỆNH NHÂN TEST ══  {SeededPatient}");
        Log($"║ 診療日 {TrtDate:yyyy-MM-dd} · bảo hiểm đã kéo dài để bao ngày này");
        Log($"║ lịch sử 処置: TRỐNG (TRNTRN không clone) ⇒ mọi kỳ vọng do chính test dựng");
        Log("╚═════════════════════════════════════════════");

        // Từ đây UiTestBase mở app với bệnh nhân vừa dựng.
        Settings.Patient.PatNo = patNo.ToString();
    }

    /// <summary>
    /// Xoá bệnh nhân test và KIỂM LẠI đã sạch.
    ///
    /// <para>NUnit chạy <c>OneTimeTearDown</c> của lớp CON trước lớp cha, nên lớp con cứ
    /// dọn dữ liệu riêng của nó bình thường; tới lượt đây thì cả bệnh nhân biến mất.</para>
    /// </summary>
    [OneTimeTearDown]
    public void SeededPatientOneTimeTearDown()
    {
        if (_patients is null || SeededPatient is null) return;

        try
        {
            var deleted = _patients.Drop(SeededPatient.PatNo);
            var remaining = _patients.DescribeRemaining(SeededPatient.PatNo);
            Log($"dọn bệnh nhân test {SeededPatient.PatNo}: " +
                string.Join(", ", deleted.Select(kv => $"{kv.Key}:{kv.Value}")));
            Log($"kiểm lại: {remaining}");

            if (remaining != "(sạch)")
                Log($"⚠ CÒN SÓT: {remaining} — có bảng mang PAT_NO chưa nằm trong " +
                    "TestPatientDb.ProfileTables/GeneratedTables. Thêm vào danh sách, đừng xoá tay.");
        }
        catch (Exception e)
        {
            Log($"dọn bệnh nhân test HỎNG: {e.Message}\n" +
                $"  Dọn tay: DELETE mọi bảng có PAT_NO = {SeededPatient.PatNo} " +
                $"(vùng test >= {TestPatientDb.TestPatNoBase}, an toàn để xoá).");
        }
    }

    private static void Log(string line) => TestContext.Out.WriteLine(line);
}
