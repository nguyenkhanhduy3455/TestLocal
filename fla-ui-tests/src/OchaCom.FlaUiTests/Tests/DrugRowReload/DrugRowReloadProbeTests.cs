using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugRowReload;

/// <summary>
/// PROBE — dò hành vi THẬT của <b>đường LOAD</b> lưới 診療入力 với dòng 薬剤.
/// <b>KHÔNG assert</b>, không bao giờ ném. <c>[Explicit]</c>.
///
/// <para>Luật F1: đọc source thì thấy rõ <c>GetTrnRs</c> dựng lại chuỗi thay vì hiện
/// <c>dsp_trt</c> — nhưng chưa ai <b>nhìn thấy</b> điều đó, và cũng chưa ai biết ô có
/// thật sự bị khoá không. Probe trả lời trước, testcase viết sau.</para>
///
/// ─── 7 câu hỏi ──────────────────────────────────────────────────────────────
/// <list type="number">
/// <item><b>KQ-1</b> Hàng rào + bối cảnh: ngày test đang có những dòng nào, master của
///   mã đem thử ra sao, seed đã vào chưa.</item>
/// <item><b>KQ-2</b> <b>Chuỗi bịa trong <c>dsp_trt</c> có hiện ra không?</b> — câu quyết
///   định. Hiện ⇒ app đọc <c>dsp_trt</c> (giống web). Biến mất ⇒ app dựng lại.</item>
/// <item><b>KQ-3</b> Nếu dựng lại: lưới đang hiện 数量 nào — <c>freewd</c> đã lưu
///   (「7」) hay 使用量 mặc định của master (「1」)?</item>
/// <item><b>KQ-4</b> Ô 療法・処置 có <b>khoá</b> không (thử mở editor, không đọc thuộc tính).</item>
/// <item><b>KQ-5</b> 点 và 回 hiện ra có đúng bằng giá trị đã lưu không (app KHÔNG tính lại).</item>
/// <item><b>KQ-6</b> ĐỐI CHỨNG — dòng KHÔNG thuộc 600–699 mang cùng chuỗi bịa: phải hiện
///   NGUYÊN VĂN và <b>không</b> bị khoá. Không có câu này thì 「chuỗi bịa biến mất」 chưa
///   loại được khả năng 「app không bao giờ hiện dsp_trt」.</item>
/// <item><b>KQ-7</b> Ô 療法・処置 nguyên văn có mấy dòng (薬剤名 + 用法), có hậu tố 用量 không.</item>
/// </list>
///
/// <para>Chạy: <c>.\run-reload-drug-row.ps1 -Probe -Seed</c> — cả fixture chỉ MỘT vòng
/// giao diện (không nhập gì, chỉ đọc), nên rẻ.</para>
/// </summary>
[TestFixture]
[Category("drug-row-reload")]
[Explicit("PROBE — chạy tay, không assert")]
[NonParallelizable]
public sealed class DrugRowReloadProbeTests : UiTestBase
{
    private DrugRowReloadDb? _db;
    private DrugRowReloadDb.SeedResult? _seed;
    private DrugRowReloadDb.DrugMaster? _master;
    private DrugRowReloadFlow _flow = null!;

    private TestSettings.DrugRowReloadSection Cfg => Settings.DrugRowReload;

    private IReadOnlyList<int> SeedDispNos => [Cfg.DispNo, Cfg.DispNo + 1];

    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.DrugRowReload.AllowSeed)
            return "drugRowReload.allowSeed = false. Luồng này đo ĐƯỜNG LOAD nên dữ liệu " +
                   "phải nằm sẵn trong TRNTRN trước khi màn hình mở — không seed thì không " +
                   "có gì để đọc. ⚠️ Bật cờ nghĩa là CHÈN dòng vào TRNTRN (処置行 thật của " +
                   "bệnh nhân); lượt chạy chỉ chèn dòng mang DISP_NO riêng rồi xoá.";
        return null;
    }

    /// <summary>
    /// Chèn hai dòng seed TRƯỚC khi app mở.
    ///
    /// <para><b>Phải là ở đây, không có lựa chọn nào khác.</b> <c>ModSave.GetTrnRs</c>
    /// đọc <c>TRNTRN</c> một lần trong <c>frmInpMain_Load_Method</c>; chèn sau khi màn
    /// hình đã mở thì app không bao giờ thấy — cùng họ với bẫy F21, chỉ khác là thứ nạp
    /// một lần ở đây là cả cái lưới.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        _db = DrugRowReloadDb.CreateOrNull(Settings);
        if (_db is null)
        {
            TestContext.Out.WriteLine("KHÔNG seed được: db.enabled = false hoặc thiếu chuỗi kết nối.");
            return;
        }

        if (_db.ProbeError() is { } err)
        {
            TestContext.Out.WriteLine($"KHÔNG seed được: không kết nối được SQL Server — {err}");
            _db = null;
            return;
        }

        var before = _db.ReadDay(PatNo, TrtDate);
        TestContext.Out.WriteLine(
            $"TRNTRN của bệnh nhân {PatNo} ngày {TrtDate:yyyy-MM-dd} TRƯỚC khi seed " +
            $"({before.Count} dòng):");
        foreach (var r in before) TestContext.Out.WriteLine("    " + r);

        // Dọn trước: lượt chạy trước chết giữa chừng thì hàng rào sẽ chặn, mà chặn xong
        // fixture cũng không đo được gì.
        TestContext.Out.WriteLine("DỌN TRƯỚC — " + _db.Cleanup(PatNo, TrtDate, SeedDispNos));

        _master = _db.Master(TrtDate, Cfg.TrtCd, Cfg.TrtSb);
        TestContext.Out.WriteLine($"MASTER {Cfg.TrtCd}/{Cfg.TrtSb} = " +
                                  (_master?.ToString() ?? "KHÔNG TÌM RA"));

        _seed = _db.Seed(PatNo, TrtDate,
        [
            // Dòng 薬剤: dsp_trt là chuỗi BỊA, freewd khác mặc định.
            new DrugRowReloadDb.SeedRow(Cfg.DispNo, Cfg.TrtCd, Cfg.TrtSb, Cfg.TrtCnt,
                                        Cfg.MarkerPoint, Cfg.FreeWd, Cfg.MarkerDspTrt),
            // Dòng ĐỐI CHỨNG: KHÔNG thuộc 600–699, cùng chuỗi bịa, freewd rỗng.
            new DrugRowReloadDb.SeedRow(Cfg.DispNo + 1, Cfg.ControlTrtCd, Cfg.ControlTrtSb,
                                        Cfg.TrtCnt, Cfg.ControlPoint, "", Cfg.MarkerDspTrt),
        ]);
        TestContext.Out.WriteLine("SEED — " + _seed);
    }

    [OneTimeTearDown]
    public void CleanupSeed()
    {
        if (_db is null) return;
        try { TestContext.Out.WriteLine("ĐÃ DỌN — " + _db.Cleanup(PatNo, TrtDate, SeedDispNos)); }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG DỌN ĐƯỢC dòng seed: {e.Message}. SỬA TAY: DELETE FROM TRNTRN " +
                $"WHERE PAT_NO = {PatNo} AND TRT_DT = '{TrtDate:yyyy-MM-dd}' AND DISP_NO IN " +
                $"({string.Join(",", SeedDispNos)});");
        }
    }

    [SetUp]
    public void ProbeSetUp() => _flow = new DrugRowReloadFlow(App, Screen);

    [TearDown]
    public void ProbeTearDown()
    {
        try { _flow?.Base.DismissAll(); } catch { /* app có thể đã chết */ }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — CHỈ ĐỌC DB.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE dữ liệu — seed đã vào TRNTRN chưa, master của mã đem thử ra sao")]
    [CancelAfter(180_000)]
    public void Tc0_ProbeSeededData()
    {
        if (_db is null) { Kq(0, "không đọc được DB — mọi câu sau đều rỗng."); return; }

        Say(() =>
        {
            Kq(1, "SEED — " + (_seed?.ToString() ?? "(chưa seed)"));
            var rows = _db.ReadDay(PatNo, TrtDate);
            Kq(1, $"TRNTRN ngày {TrtDate:yyyy-MM-dd} sau seed: {rows.Count} dòng");
            foreach (var r in rows.Where(r => SeedDispNos.Contains(r.DispNo)))
                Kq(1, "        SEED " + r);
        });

        Say(() =>
        {
            if (_master is null) { Kq(1, "không đọc được master của mã đem thử."); return; }
            Kq(1, $"MASTER {Cfg.TrtCd}/{Cfg.TrtSb}: {_master}");
            Kq(1, $"        使用量 MẶC ĐỊNH của master = 「{_master.DefaultCnt}」, " +
                  $"freewd đã lưu = 「{Cfg.FreeWd}」 ⇒ hai số này KHÁC nhau thì mới phân biệt " +
                  "được app đọc cái nào.");
            Kq(1, $"        単位 「{_master.UnitNm}」 in ra lưới là 「{_master.ShortUnit}」 " +
                  "(editDrugUnitToShortUnit).");
            Kq(1, $"        path A = {_master.HasRx} ⇒ nhánh khoá ô " +
                  "(drugRxData != null, modSave.cs:2635) " +
                  (_master.HasRx ? "SẼ chạy." : "KHÔNG chạy — ô đáng lẽ vẫn sửa được."));
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — MỘT vòng: chỉ ĐỌC lưới đã nạp sẵn. Không nhập gì.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE load — lưới hiện dsp_trt đã lưu hay chuỗi dựng lại từ master + freewd")]
    [CancelAfter(600_000)]
    public void Tc1_ProbeDrugRowOnLoad()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(2)) return;

        var r = _flow.Read(TrtDate.Day, Cfg.MarkerPoint, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(2, $"KHÔNG thấy dòng 点 = {Cfg.MarkerPoint} trên lưới. Dòng của ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", _flow.DescribeDay(TrtDate.Day)));
                return;
            }

            var flat = Txt.N(r.RawRyo);
            var hasMarker = Txt.Has(flat, Cfg.MarkerDspTrt);
            Kq(2, $"dòng 薬剤 đã lưu (disp_no {Cfg.DispNo}): {r}");
            Kq(2, $"        chuỗi BỊA 「{Cfg.MarkerDspTrt}」 có trên lưới không: " +
                  (hasMarker ? "CÓ" : "KHÔNG"));
            Kq(2, hasMarker
                ? "        ⇒ app đang HIỆN dsp_trt đã lưu — giống bản web, và như vậy điểm " +
                  "parity G3 KHÔNG tồn tại. Đọc lại modSave.cs:2627 trước khi kết luận."
                : "        ⇒ app DỰNG LẠI chuỗi, bỏ qua dsp_trt đã lưu — đúng như đọc từ " +
                  "modSave.cs:2627-2637, và bản web thì đọc thẳng dspTrt " +
                  "(treatment-table-mapper.ts:160,234).");
        });

        Say(() =>
        {
            if (_master is null || r.Row is null) return;
            var amounts = DrugRowReloadFlow.AmountsIn(r.RawRyo, _master.UnitNm);
            Kq(3, $"数量 đọc ra từ ô (đơn vị 「{_master.UnitNm}」→「{_master.ShortUnit}」): " +
                  $"[{string.Join(",", amounts)}]");
            Kq(3, $"        freewd đã lưu = 「{Cfg.FreeWd}」 · 使用量 mặc định master = " +
                  $"「{_master.DefaultCnt}」");
            Kq(3, amounts.Contains(Cfg.FreeWd)
                ? "        ⇒ lưới hiện 数量 của FREEWD ⇒ phép dựng lại CÓ đọc freewd."
                : amounts.Contains(_master.DefaultCnt)
                    ? "        ⇒ lưới hiện 数量 MẶC ĐỊNH của master ⇒ freewd KHÔNG được đọc " +
                      "ở đường load. Bất ngờ — đọc lại EditControl.cs:1049-1055."
                    : "        ⇒ không khớp cả hai — đọc kỹ chuỗi nguyên văn ở KQ-7.");
        });

        Say(() =>
        {
            Kq(4, $"ô 療法・処置 ReadOnly = " +
                  (r.ReadOnly is null ? "chưa đo được" : r.ReadOnly.Value ? "CÓ" : "KHÔNG"));
            Kq(4, "        (đo bằng cách THỬ MỞ EDITOR chứ không đọc thuộc tính UIA — " +
                  "modSave.cs:2635 chỉ khoá khi drugRxData != null, tức chỉ path A)");
        });

        Say(() =>
        {
            if (r.Row is null) return;
            Kq(5, $"点 = 「{r.Row.Ten}」 (đã lưu {Cfg.MarkerPoint}) · " +
                  $"回 = 「{r.Row.Kai}」 (đã lưu {Cfg.TrtCnt})");
            Kq(5, "        app KHÔNG tính lại hai số này khi load — chúng lấy thẳng từ " +
                  "trn_trn.trt_pt / trt_cnt (modSave.cs:2641-2657).");
        });

        Say(() =>
        {
            Kq(7, $"ô 療法・処置 NGUYÊN VĂN: 「{Txt.Vis(r.RawRyo)}」");
            Kq(7, $"        tách ra {r.Lines.Count} dòng:");
            for (var i = 0; i < r.Lines.Count; i++) Kq(7, $"          [{i}] 「{r.Lines[i]}」");
            var flat = Txt.N(r.RawRyo);
            Kq(7, "        hậu tố 用量: " +
                  (flat.Contains("日分") || flat.Contains("回分")
                      ? $"CÓ (med_kbn = 「{_master?.MedKbn}」)"
                      : "KHÔNG"));
            Kq(7, "        ⚠️ bản đã LÀM PHẲNG qua Txt.N: 「" + flat +
                  "」 — đếm dòng trên bản này là xanh giả (F23).");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — ĐỐI CHỨNG: dòng KHÔNG phải 薬剤, cùng chuỗi bịa.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE đối chứng — dòng ngoài dải 600–699 phải hiện NGUYÊN VĂN dsp_trt")]
    [CancelAfter(600_000)]
    public void Tc2_ProbeNonDrugRowShowsDspTrt()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(6)) return;

        var r = _flow.Read(TrtDate.Day, Cfg.ControlPoint, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(6, $"KHÔNG thấy dòng đối chứng 点 = {Cfg.ControlPoint}. Dòng của ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", _flow.DescribeDay(TrtDate.Day)));
                return;
            }

            var hasMarker = Txt.Has(Txt.N(r.RawRyo), Cfg.MarkerDspTrt);
            Kq(6, $"ĐỐI CHỨNG {Cfg.ControlTrtCd}/{Cfg.ControlTrtSb} (ngoài dải 薬剤): {r}");
            Kq(6, $"        chuỗi BỊA có trên lưới không: {(hasMarker ? "CÓ" : "KHÔNG")}");
            Kq(6, hasMarker
                ? "        đúng như mong đợi: nhánh else của modSave.cs:2639 hiện NGUYÊN VĂN " +
                  "dsp_trt ⇒ việc chuỗi bịa BIẾN MẤT ở dòng 薬剤 (KQ-2) đúng là hành vi " +
                  "RIÊNG của dải 600–699, không phải app bỏ qua dsp_trt nói chung."
                : "        ⚠️ dòng đối chứng CŨNG không hiện chuỗi bịa — khi đó KQ-2 chưa " +
                  "chứng minh được gì về dải 薬剤. Kiểm lại seed trước khi kết luận.");
            Kq(6, $"        ReadOnly = " +
                  (r.ReadOnly is null ? "chưa đo được" : r.ReadOnly.Value ? "CÓ" : "KHÔNG") +
                  " (mong đợi KHÔNG — nhánh else không khoá ô)");
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    private bool Ready(int kq)
    {
        if (_db is null) { Kq(kq, "không đọc được DB — bỏ qua."); return false; }
        if (_seed is null) { Kq(kq, "chưa chạy seed — bỏ qua."); return false; }
        if (_seed.Blocker is not null) { Kq(kq, "seed hỏng: " + _seed.Blocker); return false; }
        return true;
    }

    private static void Say(Action step)
    {
        try { step(); }
        catch (Exception e) { TestContext.Out.WriteLine($"        !! bước probe ném: {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>Dòng kết quả — runner lọc theo tiền tố này ra file <c>*-KQ.txt</c>.</summary>
    private static void Kq(int no, string what) => TestContext.Out.WriteLine($"=== KQ-{no} === {what}");
}
