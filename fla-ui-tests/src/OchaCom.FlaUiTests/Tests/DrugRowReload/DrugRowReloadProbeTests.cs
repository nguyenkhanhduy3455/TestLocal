using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.DrugPathB;

namespace OchaCom.FlaUiTests.Tests.DrugRowReload;

/// <summary>
/// PROBE — dò hành vi THẬT của <b>đường LOAD</b> lưới 診療入力 với dòng 薬剤 đã lưu.
/// <b>KHÔNG assert</b>, không bao giờ ném. <c>[Explicit]</c>.
///
/// <para>Luật F1: đọc source thì thấy rõ <c>GetTrnRs</c> dựng lại chuỗi thay vì hiện
/// <c>dsp_trt</c> — nhưng chưa ai <b>nhìn thấy</b> điều đó, và cũng chưa ai biết ô có
/// thật sự bị khoá không. Probe trả lời trước, <c>DrugRowReloadTests</c> viết sau.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BỐN DÒNG SEED — ba dòng đầu ĐÚNG BẰNG vế Playwright
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>treatment-grid/drug-row-rebuild-on-load.spec.ts:214-218</c> seed đúng ba dòng;
/// luồng này seed y hệt rồi thêm một dòng ĐỐI CHỨNG mà vế web chưa có.
/// <code>
///   点 771  602/0  freewd ""      dsp_trt ｽﾃｰﾙ…1   ← path A, master nguyên bản
///   点 772  602/0  freewd "2"     dsp_trt ｽﾃｰﾙ…2   ← path A, freewd khác mặc định
///   点 773  694/0  freewd ""      dsp_trt ｽﾃｰﾙ…3   ← path B (mã seed, không có RX)
///   点 774  110/0  freewd ""      dsp_trt ｽﾃｰﾙ…4   ← ĐỐI CHỨNG, ngoài dải 600–699
/// </code>
///
/// ─── 8 câu hỏi ──────────────────────────────────────────────────────────────
/// <list type="number">
/// <item><b>KQ-1</b> Hàng rào + bối cảnh: ngày test đang có những dòng nào, master của
///   mã đem thử ra sao, seed đã vào chưa.</item>
/// <item><b>KQ-2</b> <b>Chuỗi bịa trong <c>dsp_trt</c> có hiện ra không?</b> — câu quyết
///   định (web TC-1). Hiện ⇒ app đọc <c>dsp_trt</c>. Biến mất ⇒ app dựng lại.</item>
/// <item><b>KQ-3</b> Hai dòng CÙNG mã chỉ khác <c>freewd</c> có ra hai chuỗi KHÁC nhau
///   không (web TC-2). Giống hệt nhau ⇒ <c>freewd</c> không được đọc lúc dựng lại.</item>
/// <item><b>KQ-4</b> Ô 療法・処置 có <b>khoá</b> không (thử mở editor, không đọc thuộc tính).</item>
/// <item><b>KQ-5</b> 点 và 回 hiện ra có đúng bằng giá trị đã lưu không (app KHÔNG tính lại).</item>
/// <item><b>KQ-6</b> ĐỐI CHỨNG — dòng KHÔNG thuộc 600–699 mang cùng chuỗi bịa: phải hiện
///   NGUYÊN VĂN và <b>không</b> bị khoá. Không có câu này thì 「chuỗi bịa biến mất」 chưa
///   loại được khả năng 「app không bao giờ hiện dsp_trt」.</item>
/// <item><b>KQ-7</b> Ô 療法・処置 nguyên văn có mấy dòng (薬剤名 + 用法), có hậu tố 用量 không.</item>
/// <item><b>KQ-8</b> Dòng <b>path B khi LOAD</b> (web TC-3): mã 600–699 KHÔNG có
///   <c>mst_drug_rx</c> phải ra ĐÚNG hai dòng 処置名称 + 用法, <b>không</b> hậu tố 用量,
///   và ô <b>không</b> bị khoá (<c>drugRxData == null</c>, modSave.cs:2635).</item>
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
    private DrugPathBDb? _masterDb;
    private DrugRowReloadDb.SeedResult? _seed;
    private DrugPathBDb.SeedResult? _masterSeed;
    private DrugRowReloadDb.DrugMaster? _master;
    private DrugRowReloadFlow _flow = null!;

    /// <summary>使用量 ghi vào <c>freewd</c> của dòng thứ hai — cố ý KHÁC master.</summary>
    private string _freeWd = "";

    private TestSettings.DrugRowReloadSection Cfg => Settings.DrugRowReload;

    // Bốn dòng: 0 = path A freewd rỗng · 1 = path A có freewd · 2 = path B · 3 = đối chứng.
    private int PtPlain => Cfg.MarkerPoint;
    private int PtFreeWd => Cfg.MarkerPoint + 1;
    private int PtPathB => Cfg.MarkerPoint + 2;
    private int PtControl => Cfg.MarkerPoint + 3;

    private IReadOnlyList<int> SeedDispNos =>
        [Cfg.DispNo, Cfg.DispNo + 1, Cfg.DispNo + 2, Cfg.DispNo + 3];

    private IReadOnlyList<(int, int)> SeedMasterKeys => [(Cfg.PathBTrtCd, Cfg.TrtSb)];

    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.DrugRowReload.AllowSeed)
            return "drugRowReload.allowSeed = false. Luồng này đo ĐƯỜNG LOAD nên dữ liệu " +
                   "phải nằm sẵn trong TRNTRN trước khi màn hình mở — không seed thì không " +
                   "có gì để đọc. ⚠️ Bật cờ nghĩa là CHÈN dòng vào TRNTRN (処置行 thật của " +
                   "bệnh nhân) và một mã master mới; lượt chạy chỉ CHÈN rồi XOÁ.";
        return null;
    }

    /// <summary>
    /// Chèn master path B + bốn dòng seed TRƯỚC khi app mở.
    ///
    /// <para><b>Phải là ở đây, không có lựa chọn nào khác.</b> <c>ModSave.GetTrnRs</c>
    /// đọc <c>TRNTRN</c> một lần trong <c>frmInpMain_Load_Method</c>; chèn sau khi màn
    /// hình đã mở thì app không bao giờ thấy — cùng họ với bẫy F21, chỉ khác là thứ nạp
    /// một lần ở đây là cả cái lưới.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        _db = DrugRowReloadDb.CreateOrNull(Settings);
        _masterDb = DrugPathBDb.CreateOrNull(Settings);
        if (_db is null || _masterDb is null)
        {
            TestContext.Out.WriteLine("KHÔNG seed được: db.enabled = false hoặc thiếu chuỗi kết nối.");
            _db = null;
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
        TestContext.Out.WriteLine("DỌN TRƯỚC (TRNTRN) — " + _db.Cleanup(PatNo, TrtDate, SeedDispNos));
        try { TestContext.Out.WriteLine("DỌN TRƯỚC (master) — " + _masterDb.Cleanup(TrtDate, SeedMasterKeys)); }
        catch (Exception e) { TestContext.Out.WriteLine("DỌN TRƯỚC (master) ném: " + e.Message); }

        _master = _db.Master(TrtDate, Cfg.TrtCd, Cfg.TrtSb);
        TestContext.Out.WriteLine($"MASTER {Cfg.TrtCd}/{Cfg.TrtSb} = " +
                                  (_master?.ToString() ?? "KHÔNG TÌM RA"));

        // 使用量 seed phải KHÁC mặc định của master, nếu không KQ-3 không phân biệt được
        // 「có đọc freewd」 với 「chỉ dựng theo master」. Đúng công thức của vế Playwright
        // (drug-row-rebuild-on-load.spec.ts:192).
        _freeWd = _master is not null && _master.DefaultCnt == "1" ? "2" : "1";
        TestContext.Out.WriteLine(
            $"freewd đem thử = 「{_freeWd}」 (master cnt1 = 「{_master?.DefaultCnt}」)");

        // Mã path B: CLONE từ chính mã path A ⇒ mọi cột khác (F2, grp, 単位…) giống dữ
        // liệu thật, và mã mới thì đương nhiên không có MST_DRUG_RX ⇒ rơi thẳng path B.
        _masterSeed = _masterDb.SeedCodes(TrtDate, (Cfg.TrtCd, Cfg.TrtSb),
        [
            new DrugPathBDb.SeedSpec(Cfg.PathBTrtCd, Cfg.TrtSb, Cfg.PathBTrtNm, Cfg.PathBUsage),
        ]);
        TestContext.Out.WriteLine("SEED MASTER — " + _masterSeed);

        _seed = _db.Seed(PatNo, TrtDate,
        [
            // ① path A, freewd RỖNG ⇒ ô phải đúng bằng master nguyên bản.
            new DrugRowReloadDb.SeedRow(Cfg.DispNo, Cfg.TrtCd, Cfg.TrtSb, Cfg.TrtCnt,
                                        PtPlain, "", Cfg.Stale + "1"),
            // ② path A, freewd KHÁC mặc định ⇒ ô phải đổi 使用量 theo nó.
            new DrugRowReloadDb.SeedRow(Cfg.DispNo + 1, Cfg.TrtCd, Cfg.TrtSb, Cfg.TrtCnt,
                                        PtFreeWd, _freeWd, Cfg.Stale + "2"),
            // ③ path B: mã 600–699 KHÔNG có mst_drug_rx ⇒ 処置名称 + 用法, không 用量.
            new DrugRowReloadDb.SeedRow(Cfg.DispNo + 2, Cfg.PathBTrtCd, Cfg.TrtSb, Cfg.TrtCnt,
                                        PtPathB, "", Cfg.Stale + "3"),
            // ④ ĐỐI CHỨNG: ngoài dải 600–699 ⇒ nhánh else, hiện NGUYÊN VĂN dsp_trt.
            //    Vế Playwright CHƯA có testcase này.
            new DrugRowReloadDb.SeedRow(Cfg.DispNo + 3, Cfg.ControlTrtCd, Cfg.ControlTrtSb,
                                        Cfg.TrtCnt, PtControl, "", Cfg.Stale + "4"),
        ]);
        TestContext.Out.WriteLine("SEED TRNTRN — " + _seed);
    }

    [OneTimeTearDown]
    public void CleanupSeed()
    {
        if (_db is not null)
        {
            try { TestContext.Out.WriteLine("ĐÃ DỌN (TRNTRN) — " + _db.Cleanup(PatNo, TrtDate, SeedDispNos)); }
            catch (Exception e)
            {
                TestContext.Error.WriteLine(
                    $"!! KHÔNG DỌN ĐƯỢC dòng seed: {e.Message}. SỬA TAY: DELETE FROM TRNTRN " +
                    $"WHERE PAT_NO = {PatNo} AND TRT_DT = '{TrtDate:yyyy-MM-dd}' AND DISP_NO IN " +
                    $"({string.Join(",", SeedDispNos)});");
            }
        }

        if (_masterDb is not null)
        {
            try { TestContext.Out.WriteLine("ĐÃ DỌN (master) — " + _masterDb.Cleanup(TrtDate, SeedMasterKeys)); }
            catch (Exception e)
            {
                TestContext.Error.WriteLine(
                    $"!! KHÔNG DỌN ĐƯỢC mã master seed: {e.Message}. SỬA TAY: DELETE FROM " +
                    $"<bảng master của ngày> WHERE TRT_CD = {Cfg.PathBTrtCd}; DELETE FROM " +
                    $"MST_MED WHERE TRT_CD = {Cfg.PathBTrtCd};");
            }
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
            Kq(1, "SEED MASTER — " + (_masterSeed?.ToString() ?? "(chưa seed)"));
            Kq(1, "SEED TRNTRN — " + (_seed?.ToString() ?? "(chưa seed)"));
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
                  $"freewd đem thử = 「{_freeWd}」 ⇒ hai số này KHÁC nhau thì mới phân biệt " +
                  "được app đọc cái nào.");
            Kq(1, $"        単位 「{_master.UnitNm}」 in ra lưới là 「{_master.ShortUnit}」 " +
                  "(editDrugUnitToShortUnit).");
            Kq(1, $"        path A = {_master.HasRx} ⇒ nhánh khoá ô " +
                  "(drugRxData != null, modSave.cs:2635) " +
                  (_master.HasRx ? "SẼ chạy." : "KHÔNG chạy — ô đáng lẽ vẫn sửa được."));
        });

        Say(() =>
        {
            var pb = _db.Master(TrtDate, Cfg.PathBTrtCd, Cfg.TrtSb);
            Kq(1, $"MÃ PATH B {Cfg.PathBTrtCd}/{Cfg.TrtSb}: " + (pb?.ToString() ?? "KHÔNG TÌM RA"));
            if (pb is not null)
                Kq(1, "        có mst_drug_rx không: " + (pb.HasRx ? "CÓ — SAI, mã seed phải KHÔNG có" : "KHÔNG ⇒ đúng path B"));
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — dòng path A, freewd RỖNG. (cặp web: TC-1)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE load path A — lưới hiện dsp_trt đã lưu hay chuỗi dựng lại từ master")]
    [CancelAfter(600_000)]
    public void Tc1_ProbeDrugRowOnLoad()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(2)) return;

        var r = _flow.Read(TrtDate.Day, PtPlain, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(2, $"KHÔNG thấy dòng 点 = {PtPlain} trên lưới. Dòng của ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", _flow.DescribeDay(TrtDate.Day)));
                return;
            }

            var flat = Txt.N(r.RawRyo);
            var hasMarker = Txt.Has(flat, Cfg.Stale);
            Kq(2, $"dòng 薬剤 path A (disp_no {Cfg.DispNo}, freewd rỗng): {r}");
            Kq(2, $"        chuỗi BỊA 「{Cfg.Stale}」 có trên lưới không: " +
                  (hasMarker ? "CÓ" : "KHÔNG"));
            Kq(2, hasMarker
                ? "        ⇒ app đang HIỆN dsp_trt đã lưu — giống bản web TRƯỚC khi vá, và " +
                  "như vậy điểm parity G3 không tồn tại. Đọc lại modSave.cs:2627."
                : "        ⇒ app DỰNG LẠI chuỗi, bỏ qua dsp_trt đã lưu — đúng như đọc từ " +
                  "modSave.cs:2627-2637.");
            if (_master is not null)
            {
                Kq(2, $"        薬剤名 master 「{_master.DgNm}」 có trong ô không: " +
                      (Txt.Has(flat, _master.DgNm) ? "CÓ" : "KHÔNG"));
                Kq(2, $"        用法 master 「{_master.UsageNm}」 có trong ô không: " +
                      (Txt.Has(flat, _master.UsageNm) ? "CÓ" : "KHÔNG"));
            }
        });

        Say(() =>
        {
            if (_master is null || r.Row is null) return;
            var amounts = DrugRowReloadFlow.AmountsIn(r.RawRyo, _master.UnitNm);
            Kq(3, $"数量 đọc ra từ ô freewd-RỖNG (đơn vị 「{_master.UnitNm}」→" +
                  $"「{_master.ShortUnit}」): [{string.Join(",", amounts)}]");
            Kq(3, $"        使用量 mặc định master = 「{_master.DefaultCnt}」 ⇒ " +
                  (amounts.Contains(_master.DefaultCnt)
                      ? "khớp, dòng không có freewd dùng master."
                      : "KHÔNG khớp — đọc chuỗi nguyên văn ở KQ-7."));
        });

        Say(() =>
        {
            Kq(4, "ô 療法・処置 (path A) ReadOnly = " +
                  (r.ReadOnly is null ? "chưa đo được" : r.ReadOnly.Value ? "CÓ" : "KHÔNG"));
            Kq(4, "        (đo bằng cách THỬ MỞ EDITOR chứ không đọc thuộc tính UIA — " +
                  "modSave.cs:2635 chỉ khoá khi drugRxData != null, tức chỉ path A)");
        });

        Say(() =>
        {
            if (r.Row is null) return;
            Kq(5, $"点 = 「{r.Row.Ten}」 (đã lưu {PtPlain}) · " +
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
                      ? $"CÓ (med_kbn = 「{_master?.MedKbn}」, 回数 đã lưu = {Cfg.TrtCnt})"
                      : "KHÔNG"));
            Kq(7, "        ⚠️ bản đã LÀM PHẲNG qua Txt.N: 「" + flat +
                  "」 — đếm dòng trên bản này là xanh giả (F23).");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — HAI dòng cùng mã, chỉ khác freewd. (cặp web: TC-2)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE freewd — hai dòng cùng mã khác freewd có ra hai chuỗi khác nhau không")]
    [CancelAfter(600_000)]
    public void Tc2_ProbeFreeWdChangesAmount()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(3)) return;

        var plain = _flow.Read(TrtDate.Day, PtPlain, probeReadOnly: false, trace);
        var freed = _flow.Read(TrtDate.Day, PtFreeWd, probeReadOnly: false, trace);

        Say(() =>
        {
            if (plain.Row is null || freed.Row is null)
            {
                Kq(3, $"thiếu dòng: 点 {PtPlain} = {(plain.Row is null ? "KHÔNG THẤY" : "ok")}, " +
                      $"点 {PtFreeWd} = {(freed.Row is null ? "KHÔNG THẤY" : "ok")}. Dòng ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", _flow.DescribeDay(TrtDate.Day)));
                return;
            }

            Kq(3, $"freewd RỖNG  (点 {PtPlain}): 「{Txt.Vis(plain.RawRyo)}」");
            Kq(3, $"freewd 「{_freeWd}」 (点 {PtFreeWd}): 「{Txt.Vis(freed.RawRyo)}」");

            var same = Txt.N(plain.RawRyo) == Txt.N(freed.RawRyo);
            Kq(3, "        hai ô GIỐNG HỆT nhau: " + (same ? "CÓ" : "KHÔNG"));
            Kq(3, same
                ? "        ⇒ freewd KHÔNG được đọc lúc dựng lại. Bất ngờ — đọc lại " +
                  "EditControl.cs:1050-1055."
                : "        ⇒ freewd CÓ được đưa vào lúc dựng lại (EditControl.cs:1050-1055).");

            if (_master is null) return;
            var a = DrugRowReloadFlow.AmountsIn(plain.RawRyo, _master.UnitNm);
            var b = DrugRowReloadFlow.AmountsIn(freed.RawRyo, _master.UnitNm);
            Kq(3, $"        数量: rỗng → [{string.Join(",", a)}] · có freewd → [{string.Join(",", b)}]");
            Kq(3, $"        mong đợi dòng có freewd mang 「{_freeWd}」: " +
                  (b.Contains(_freeWd) ? "ĐÚNG" : "KHÔNG THẤY"));

            var first = freed.Lines.Count > 0 ? freed.Lines[0] : "";
            Kq(3, $"        dòng thành phần ĐẦU của ô có freewd: 「{first}」 " +
                  "(vế web assert 使用量 nằm cuối dòng này — spec:297-305)");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc3 — dòng PATH B khi LOAD. (cặp web: TC-3)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE path B khi load — mã 600–699 không có mst_drug_rx: 処置名称 + 用法")]
    [CancelAfter(600_000)]
    public void Tc3_ProbePathBRowOnLoad()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(8)) return;
        if (_masterSeed?.Blocker is not null)
        {
            Kq(8, "không seed được mã path B: " + _masterSeed.Blocker);
            return;
        }

        var r = _flow.Read(TrtDate.Day, PtPathB, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(8, $"KHÔNG thấy dòng path B 点 = {PtPathB}. Dòng của ngày {TrtDate.Day}: " +
                      string.Join(" | ", _flow.DescribeDay(TrtDate.Day)));
                return;
            }

            var flat = Txt.N(r.RawRyo);
            Kq(8, $"dòng path B {Cfg.PathBTrtCd}/{Cfg.TrtSb} (disp_no {Cfg.DispNo + 2}): {r}");
            Kq(8, $"        処置名称 「{Cfg.PathBTrtNm}」 có trong ô không: " +
                  (Txt.Has(flat, Cfg.PathBTrtNm) ? "CÓ" : "KHÔNG"));
            Kq(8, $"        用法 「{Cfg.PathBUsage}」 có trong ô không: " +
                  (Txt.Has(flat, Cfg.PathBUsage) ? "CÓ" : "KHÔNG"));
            Kq(8, $"        chuỗi BỊA 「{Cfg.Stale}」 có không: " +
                  (Txt.Has(flat, Cfg.Stale) ? "CÓ — app in dsp_trt đã lưu" : "KHÔNG"));
            Kq(8, $"        tách ra {r.Lines.Count} dòng (vế web đòi ĐÚNG 2):");
            for (var i = 0; i < r.Lines.Count; i++) Kq(8, $"          [{i}] 「{r.Lines[i]}」");
            Kq(8, "        hậu tố 用量 (mong đợi KHÔNG — med_kbn chỉ có ở mst_drug_rx, " +
                  "EditControl.cs:1119-1135 nằm trong nhánh A): " +
                  (System.Text.RegularExpressions.Regex.IsMatch(flat, @"\d+\s*(日分|回分)")
                      ? "CÓ — bất ngờ" : "KHÔNG"));
            Kq(8, "        ReadOnly = " +
                  (r.ReadOnly is null ? "chưa đo được" : r.ReadOnly.Value ? "CÓ" : "KHÔNG") +
                  " (mong đợi KHÔNG: drugRxData == null nên modSave.cs:2635 không chạy)");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc4 — ĐỐI CHỨNG: dòng KHÔNG phải 薬剤, cùng chuỗi bịa. (vế web CHƯA có)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE đối chứng — dòng ngoài dải 600–699 phải hiện NGUYÊN VĂN dsp_trt")]
    [CancelAfter(600_000)]
    public void Tc4_ProbeNonDrugRowShowsDspTrt()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(6)) return;

        var r = _flow.Read(TrtDate.Day, PtControl, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(6, $"KHÔNG thấy dòng đối chứng 点 = {PtControl}. Dòng của ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", _flow.DescribeDay(TrtDate.Day)));
                return;
            }

            var hasMarker = Txt.Has(Txt.N(r.RawRyo), Cfg.Stale);
            Kq(6, $"ĐỐI CHỨNG {Cfg.ControlTrtCd}/{Cfg.ControlTrtSb} (ngoài dải 薬剤): {r}");
            Kq(6, $"        chuỗi BỊA có trên lưới không: {(hasMarker ? "CÓ" : "KHÔNG")}");
            Kq(6, hasMarker
                ? "        đúng như mong đợi: nhánh else của modSave.cs:2639 hiện NGUYÊN VĂN " +
                  "dsp_trt ⇒ việc chuỗi bịa BIẾN MẤT ở dòng 薬剤 (KQ-2) đúng là hành vi " +
                  "RIÊNG của dải 600–699, không phải app bỏ qua dsp_trt nói chung."
                : "        ⚠️ dòng đối chứng CŨNG không hiện chuỗi bịa — khi đó KQ-2 chưa " +
                  "chứng minh được gì về dải 薬剤. Kiểm lại seed trước khi kết luận.");
            Kq(6, "        ReadOnly = " +
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
