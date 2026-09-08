using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// PROBE của luồng 自動算定 — đi trọn đường, chụp ảnh từng bước, KHÔNG assert.
///
/// <para>F1: chưa biết app thật hành xử ra sao thì chụp ảnh → đọc ảnh → RỒI mới viết
/// assert. Mọi câu hỏi in ra dưới dạng <c>=== KQ-n ===</c>, runner lọc sẵn vào
/// <c>auto-santei-KQ.txt</c>.</para>
///
/// <para><b>CHẠY TỪNG CASE MỘT.</b> Một vòng 「Insert → 部位選択 → 病名選択 → gõ mã →
/// 処置選択」 tốn 2–3 phút trên máy thật, mà wrapper cắt ở 15 phút (F7).</para>
///
/// <code>
///   -Case Tc0   chỉ hỏi DB: chkauto có gì, master có gì. KHÔNG mở app quá màn chính.
///   -Case Tc1   179/2 抜歯 — ĐÚNG ca trong báo cáo lệch parity (cần allowSave)
///   -Case Tc2   171/0 感根処 — ĐỐI CHỨNG, mã KHÔNG có trong chkauto
///   -Case Tc3   110/0 再診 — ô có HAI mã đi kèm, không cần 部位
/// </code>
/// </summary>
[TestFixture]
[Explicit("PROBE — chạy tay bằng -Diagnostics, không kéo vào lượt chạy thường.")]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class AutoSanteiProbeTests : UiTestBase
{
    private ChkAutoDb _chk = null!;
    private SigaKonDb _siga = null!;
    private SigaToothFlow _flow = null!;
    private AutoSanteiOps _ops = null!;

    private SigaSnapshot? _sigaBefore;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    private int TrtCd => Settings.AutoSantei.TrtCd;
    private int TrtSb => Settings.AutoSantei.TrtSb;
    private int BuiSlot => Settings.AutoSantei.BuiSlot;

    /// <summary>
    /// Đặt răng đem thử về 現存 TRƯỚC KHI APP MỞ — nếu không thì <c>ChkSiga</c> loại thẳng
    /// 抜歯 và probe đo phải một cái không xảy ra.
    ///
    /// <para>Chỉ chạy khi <c>autoSantei.allowSave</c> bật. Tắt cờ thì Tc1 vẫn chạy được
    /// miễn là răng vốn đã 現存 — probe không assert nên nó chỉ ghi lại sự thật.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        var db = SigaKonDb.CreateOrNull(Settings, Settings.AutoSantei.AllowSave);
        if (db is null || !db.CanWrite || db.ProbeError() is not null) return;

        db.EnsureSigaRow(PatNo);
        _sigaBefore = db.ReadSiga(PatNo);
        Log($"nguyên trạng SIGA (chụp TRƯỚC khi đặt mốc): {_sigaBefore}");
        db.ResetSigaToVital(PatNo);
        Log($"đặt mốc: mọi se* = {SigaKonDb.SeVital} (現存) ⇒ ChkSiga cho 抜歯 đi qua.");
    }

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (chk is null) IgnoreWithReason("Cần DB để đọc chkauto — " + (DbUnavailableReason ?? "db.enabled = false"));
        var error = chk!.ProbeError();
        if (error is not null) IgnoreWithReason($"không kết nối được SQL Server: {error}");
        _chk = chk;
        _siga = SigaKonDb.CreateOrNull(Settings, Settings.AutoSantei.AllowSave)!;
    }

    [SetUp]
    public void ProbeSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new AutoSanteiOps(_flow);
    }

    [OneTimeTearDown]
    public void ProbeOneTimeTearDown()
    {
        if (_siga is null || !_siga.CanWrite || _sigaBefore is null) return;
        try { _siga.RestoreSiga(PatNo, _sigaBefore); Log("dọn: SIGA trả về nguyên trạng."); }
        catch (Exception e) { Log($"dọn HỎNG: {e.Message} — dựng tay theo dòng 「nguyên trạng SIGA」 ở trên."); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — chỉ hỏi DB. Rẻ, chạy trước tiên.
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("Tc0 — chkauto có gì cho mã đem thử, và master của tháng có đủ mã đi kèm không")]
    public void Tc0_Read_ChkAuto_Table()
    {
        var total = _chk.CountRows();
        var multi = _chk.CountRowsWithSecondCode();
        Log($"=== KQ-1 === chkauto có {total} dòng, trong đó {multi} dòng có từ 2 mã đi kèm trở lên.");
        foreach (var line in _chk.Describe()) Log($"=== KQ-1 ===   {line}");

        var row = _chk.ReadChkAuto(TrtCd, TrtSb);
        Log($"=== KQ-2 === {row?.ToString() ?? $"chkauto({TrtCd},{TrtSb}) KHÔNG có dòng nào"}");
        if (row is not null)
        {
            Log($"=== KQ-2 ===   ô đi nhánh 処置 : [{string.Join(", ", row.TreatmentPairs.Select(p => $"{p.Cd}/{p.Sb}"))}]");
            Log($"=== KQ-2 ===   ô đi nhánh 摘要 : [{string.Join(", ", row.CommentPairs.Select(p => $"{p.Cd}/{p.Sb}"))}]");
        }

        var table = _siga.ActiveTrtTable(TrtDate);
        Log($"=== KQ-3 === master áp dụng cho {TrtDate:yyyy-MM-dd} = {table}");
        Log($"=== KQ-3 ===   {TrtCd}/{TrtSb} = " +
            (_siga.FindMasterRow(TrtDate, TrtCd, TrtSb)?.ToString() ?? "(KHÔNG có)"));
        foreach (var (cd, sb) in row?.TreatmentPairs ?? [])
            Log($"=== KQ-3 ===   {cd}/{sb} = " + (_siga.FindMasterRow(TrtDate, cd, sb)?.ToString() ?? "(KHÔNG có)"));

        var control = _chk.ReadChkAuto(Settings.AutoSantei.ControlTrtCd, Settings.AutoSantei.ControlTrtSb);
        Log($"=== KQ-4 === ĐỐI CHỨNG {Settings.AutoSantei.ControlTrtCd}/{Settings.AutoSantei.ControlTrtSb}: " +
            (control is null ? "KHÔNG có trong chkauto (đúng thứ cần)" : $"CÓ trong chkauto — {control} ⇒ ĐỔI mã đối chứng đi"));

        var multiRow = _chk.ReadChkAuto(Settings.AutoSantei.MultiTrtCd, Settings.AutoSantei.MultiTrtSb);
        Log($"=== KQ-5 === ô nhiều mã {Settings.AutoSantei.MultiTrtCd}/{Settings.AutoSantei.MultiTrtSb}: " +
            (multiRow?.ToString() ?? "(KHÔNG có)"));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — 179/2 抜歯: ĐÚNG ca trong báo cáo
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — nhập 179/2 抜歯 lên một răng và ghi lại app tự chèn thêm những gì")]
    public void Tc1_Enter_Extraction_And_Watch()
    {
        using var trace = TestTrace.Begin();
        ProbeOne(TrtCd, TrtSb, BuiSlot, "Tc1 抜歯", trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — ĐỐI CHỨNG: mã KHÔNG có trong chkauto
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc2 (đối chứng) — mã KHÔNG có trong chkauto thì lưới chỉ dài thêm ĐÚNG dòng vừa gõ")]
    public void Tc2_Enter_Control_Code_And_Watch()
    {
        using var trace = TestTrace.Begin();
        ProbeOne(Settings.AutoSantei.ControlTrtCd, Settings.AutoSantei.ControlTrtSb, BuiSlot,
                 "Tc2 đối chứng", trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc3 — ô có HAI mã đi kèm, không đi qua 部位選択
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — 110/0 再診: chkauto có cd1 VÀ cd2, đo xem vòng lặp 5 lượt chèn được mấy dòng")]
    public void Tc3_Enter_Multi_Companion_Code_And_Watch()
    {
        using var trace = TestTrace.Begin();
        ProbeOne(Settings.AutoSantei.MultiTrtCd, Settings.AutoSantei.MultiTrtSb, buiSlot: -1,
                 "Tc3 nhiều mã đi kèm", trace);
    }

    // ── Nội bộ ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Một vòng đo, KHÔNG BAO GIỜ NÉM — bắt hết ngoại lệ, ghi lại rồi đi tiếp. Probe mà ném
    /// giữa chừng thì mất luôn phần trả lời của những câu hỏi phía sau.
    /// </summary>
    private void ProbeOne(int trtCd, int trtSb, int buiSlot, string label, TestTrace trace)
    {
        try
        {
            var row = _chk.ReadChkAuto(trtCd, trtSb);
            Log($"=== KQ-6 === [{label}] {row?.ToString() ?? $"chkauto({trtCd},{trtSb}) KHÔNG có dòng nào"}");

            var measure = _ops.EnterAndMeasure(trtCd, trtSb, buiSlot, trace);
            if (measure is null)
            {
                Log($"=== KQ-7 === [{label}] KHÔNG gõ được mã — xem _trace.log và ảnh chụp bước cuối.");
                return;
            }

            Log($"=== KQ-7 === [{label}] {measure}");
            Log($"=== KQ-8 === [{label}] các dòng app TỰ CHÈN (kể cả dòng vừa gõ):");
            foreach (var added in measure.AddedRows) Log($"=== KQ-8 ===   + {added}");
            Log($"=== KQ-9 === [{label}] 月計点数 {measure.PointBefore} → {measure.PointAfter} " +
                $"(Δ {measure.PointDelta?.ToString() ?? "?"})");

            foreach (var (cd, sb) in row?.TreatmentPairs ?? [])
            {
                var master = _siga.FindMasterRow(TrtDate, cd, sb);
                var found = master is null ? null : AutoSanteiOps.RowOf(measure.AddedRows, master);
                Log($"=== KQ-10 === [{label}] mã đi kèm {cd}/{sb} " +
                    $"({master?.ToString() ?? "KHÔNG có trong master"}) → " +
                    (found is null ? "KHÔNG thấy dòng nào trên lưới" : $"THẤY 「{found}」"));
            }

            _ops.DeleteAdded(measure, trace);
        }
        catch (Exception e)
        {
            Log($"=== KQ-7 === [{label}] NÉM: {e.GetType().Name}: {e.Message}");
            trace.Note($"probe nem: {e}");
            trace.Shot("probe-nem");
        }
    }
}
