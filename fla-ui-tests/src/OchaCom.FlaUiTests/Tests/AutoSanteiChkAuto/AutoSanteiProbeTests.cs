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
/// <para><b>CHẠY TỪNG CASE MỘT.</b> Một vòng chốt 処置 tốn 2-3 phút trên máy thật, mà
/// wrapper cắt ở 15 phút (F7).</para>
///
/// <code>
///   -Case Tc0   chỉ hỏi DB: chkauto / CMTAUTO / master có gì. RẺ, chạy trước tiên.
///   -Case Tc1   chốt 179/2 trên 部位病名行 đã seed — đúng đường của TC1..TC4
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
    private const string DisMark = "Ｃ";

    /// <summary>
    /// Dựng trạng thái xuất phát GIỐNG fixture assert: răng 現存 + một 部位病名行 đã seed,
    /// cả hai TRƯỚC KHI APP MỞ. Chỉ chạy khi <c>autoSantei.allowSave</c> bật — tắt cờ thì
    /// probe vẫn chạy được phần đọc, nó chỉ ghi lại sự thật chứ không assert.
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        var siga = SigaKonDb.CreateOrNull(Settings, Settings.AutoSantei.AllowSave);
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (siga is null || !siga.CanWrite || siga.ProbeError() is not null) return;
        if (chk is null || !chk.CanWrite) return;

        siga.EnsureSigaRow(PatNo);
        _sigaBefore = siga.ReadSiga(PatNo);
        Log($"nguyên trạng SIGA (chụp TRƯỚC khi đặt mốc): {_sigaBefore}");
        siga.ResetSigaToVital(PatNo);

        chk.SeedBuiDisRow(PatNo, TrtDate, BuiSlot, Settings.AutoSantei.BuiVal,
                          Settings.AutoSantei.DisCd, Settings.AutoSantei.DisSb,
                          dspBui: ToothSelectDialog.DescribeSlot(BuiSlot), dspDis: DisMark);
        Log($"seed 部位病名行 ô {BuiSlot} ({ToothSelectDialog.DescribeSlot(BuiSlot)}) + 病名 " +
            $"{Settings.AutoSantei.DisCd}/{Settings.AutoSantei.DisSb}, ngày {TrtDate:yyyy-MM-dd}.");
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
        try
        {
            if (_chk is not null && _chk.CanWrite)
            {
                _chk.DeleteSeededRows(PatNo, TrtDate);
                if (Settings.AutoSantei.AllowRowCleanup)
                    _chk.DeleteCompanionRows(PatNo, TrtDate, TrtCd, TrtSb);
                Log("dọn: đã xoá vùng seed + dòng đi kèm của ngày test.");
            }
            if (_siga is not null && _siga.CanWrite && _sigaBefore is not null)
            {
                _siga.RestoreSiga(PatNo, _sigaBefore);
                Log("dọn: SIGA trả về nguyên trạng.");
            }
        }
        catch (Exception e) { Log($"dọn HỎNG: {e.Message} — dựng tay theo dòng 「nguyên trạng SIGA」."); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — chỉ hỏi DB. Rẻ, chạy trước tiên.
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("Tc0 — chkauto / CMTAUTO / master có gì cho mã đem thử")]
    public void Tc0_Read_Master_Tables()
    {
        Log($"=== KQ-1 === chkauto có {_chk.CountRows()} dòng, " +
            $"{_chk.CountRowsWithSecondCode()} dòng có ≥2 mã đi kèm.");
        foreach (var line in _chk.Describe()) Log($"=== KQ-1 ===   {line}");

        var row = _chk.ReadChkAuto(TrtCd, TrtSb);
        Log($"=== KQ-2 === {row?.ToString() ?? $"chkauto({TrtCd},{TrtSb}) KHÔNG có dòng nào"}");
        if (row is not null)
        {
            Log($"=== KQ-2 ===   ô nhánh 処置 : [{string.Join(", ", row.TreatmentPairs.Select(p => $"{p.Cd}/{p.Sb}"))}]");
            Log($"=== KQ-2 ===   ô nhánh 摘要 : [{string.Join(", ", row.CommentPairs.Select(p => $"{p.Cd}/{p.Sb}"))}]");
        }

        var table = _siga.ActiveTrtTable(TrtDate);
        Log($"=== KQ-3 === master áp dụng cho {TrtDate:yyyy-MM-dd} = {table}");
        Log($"=== KQ-3 ===   {TrtCd}/{TrtSb} = " +
            (_siga.FindMasterRow(TrtDate, TrtCd, TrtSb)?.ToString() ?? "(KHÔNG có)"));
        foreach (var (cd, sb) in row?.TreatmentPairs ?? [])
            Log($"=== KQ-3 ===   {cd}/{sb} = " + (_siga.FindMasterRow(TrtDate, cd, sb)?.ToString() ?? "(KHÔNG có)"));

        // CMTAUTO — và ĐỐI CHIẾU tên với MST_CMT2, vì hai cột này đã lệch trên DB dev.
        var cmts = _chk.FindCmtAutos(TrtCd, TrtSb);
        Log($"=== KQ-4 === CMTAUTO({TrtCd},{TrtSb}): {cmts.Count} dòng");
        foreach (var c in cmts)
        {
            var shown = _chk.ResolveCmtName(c.CmtCd, c.CmtSb);
            Log($"=== KQ-4 ===   {c}");
            Log($"=== KQ-4 ===     MST_CMT2 (thứ LƯỚI in) = 「{shown ?? "(KHÔNG có)"}」" +
                (shown is not null && AutoSanteiOps.Norm(shown) != AutoSanteiOps.Norm(c.CmtNm)
                    ? "   ⚠️ LỆCH với CMTAUTO.CMT_NM"
                    : ""));
        }

        var control = _chk.ReadChkAuto(Settings.AutoSantei.ControlTrtCd, Settings.AutoSantei.ControlTrtSb);
        Log($"=== KQ-5 === ĐỐI CHỨNG {Settings.AutoSantei.ControlTrtCd}/{Settings.AutoSantei.ControlTrtSb}: " +
            (control is null ? "KHÔNG có trong chkauto (đúng thứ cần)" : $"CÓ — {control} ⇒ đổi mã đối chứng"));

        Log("=== KQ-6 === dòng 処置 của ngày test:");
        foreach (var line in _chk.DescribeDayRows(PatNo, TrtDate)) Log($"=== KQ-6 ===   {line}");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — chốt 179/2 trên 部位病名行 đã seed
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — chốt 処置 trên 部位病名行 đã seed và ghi lại app tự chèn thêm những gì")]
    public void Tc1_Commit_And_Watch_Follow_Up_Rows()
    {
        using var trace = TestTrace.Begin();
        try
        {
            var row = _chk.ReadChkAuto(TrtCd, TrtSb);
            Log($"=== KQ-7 === {row?.ToString() ?? $"chkauto({TrtCd},{TrtSb}) KHÔNG có dòng nào"}");

            var seeded = _ops.SeededBuiRow(TrtDate.Day, ToothSelectDialog.DescribeSlot(BuiSlot), DisMark);
            Log($"=== KQ-8 === 部位病名行 seed tren luoi: {seeded?.ToString() ?? "KHÔNG THẤY"}");
            if (seeded is null)
            {
                Log("=== KQ-8 ===   lưới: " + string.Join(" | ", _flow.DescribeGrid(40)));
                return;
            }

            var measure = _ops.CommitOnSeededRow(seeded, TrtCd, TrtSb, trace);
            if (measure is null)
            {
                Log("=== KQ-9 === KHÔNG chốt được — xem _trace.log và ảnh chụp bước cuối.");
                return;
            }

            Log($"=== KQ-9 === {measure}");
            Log("=== KQ-10 === các dòng app TỰ CHÈN (kể cả dòng vừa chốt):");
            foreach (var added in measure.AddedRows) Log($"=== KQ-10 ===   + {added}");
            Log($"=== KQ-11 === 月計点数 {measure.PointBefore} → {measure.PointAfter} " +
                $"(Δ {measure.PointDelta?.ToString() ?? "?"})");

            foreach (var (cd, sb) in row?.TreatmentPairs ?? [])
            {
                var master = _siga.FindMasterRow(TrtDate, cd, sb);
                var found = master is null ? null : AutoSanteiOps.RowOf(measure.AddedRows, master);
                Log($"=== KQ-12 === mã đi kèm {cd}/{sb} ({master?.ToString() ?? "KHÔNG có trong master"}) → " +
                    (found is null ? "KHÔNG thấy dòng nào trên lưới" : $"THẤY 「{found}」"));
            }

            foreach (var c in _chk.FindCmtAutos(TrtCd, TrtSb))
            {
                var shown = _chk.ResolveCmtName(c.CmtCd, c.CmtSb) ?? c.CmtNm;
                var found = AutoSanteiOps.RowByName(measure.AddedRows, shown);
                Log($"=== KQ-13 === CMTAUTO {c.CmtCd}/{c.CmtSb} 「{shown}」 (disp_no {c.DispNo}) → " +
                    (found is null ? "KHÔNG thấy" : $"THẤY 「{found}」"));
            }

            var all = _ops.DataRows();
            Log("=== KQ-14 === THỨ TỰ lưới sau khi chốt:");
            foreach (var r in all) Log($"=== KQ-14 ===   {r}");
        }
        catch (Exception e)
        {
            Log($"=== KQ-9 === NÉM: {e.GetType().Name}: {e.Message}");
            trace.Note($"probe nem: {e}");
            trace.Shot("probe-nem");
        }
    }
}
