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
/// BỐN DÒNG SEED — ĐÚNG BẰNG vế Playwright
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>treatment-grid/drug-row-rebuild-on-load.spec.ts</c> seed đúng bốn dòng này.
/// <code>
///   患者 10 · 診療日 2026-08-10 · disp_no 9001–9004 · 回数 7
///   点 771  602/0  freewd ""      dsp_trt ｽﾃｰﾙ…1   ← path A, master nguyên bản
///   点 772  602/0  freewd &lt;khác&gt;  dsp_trt ｽﾃｰﾙ…2   ← path A, freewd khác mặc định
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
public sealed class DrugRowReloadProbeTests : DrugRowReloadFixture
{
    // Seed / dọn / mốc dò dòng nằm ở DrugRowReloadFixture — chung với fixture assert,
    // để con số probe in ra và con số assert đo đúng trên cùng một bộ dữ liệu.

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — CHỈ ĐỌC DB.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE dữ liệu — seed đã vào TRNTRN chưa, master của mã đem thử ra sao")]
    [CancelAfter(180_000)]
    public void Tc0_ProbeSeededData()
    {
        if (Db2 is null) { Kq(0, "không đọc được DB — mọi câu sau đều rỗng."); return; }

        Say(() =>
        {
            Kq(1, "SEED MASTER — " + (MasterSeed?.ToString() ?? "(chưa seed)"));
            Kq(1, "SEED TRNTRN — " + (Seed?.ToString() ?? "(chưa seed)"));
            var rows = Db2.ReadDay(PatNo, TrtDate);
            Kq(1, $"TRNTRN ngày {TrtDate:yyyy-MM-dd} sau seed: {rows.Count} dòng");
            foreach (var r in rows.Where(r => SeedDispNos.Contains(r.DispNo)))
                Kq(1, "        SEED " + r);
        });

        Say(() =>
        {
            if (Master is null) { Kq(1, "không đọc được master của mã đem thử."); return; }
            Kq(1, $"MASTER {Cfg.TrtCd}/{Cfg.TrtSb}: {Master}");
            Kq(1, $"        使用量 MẶC ĐỊNH của master = 「{Master.DefaultCnt}」, " +
                  $"freewd đem thử = 「{FreeWd}」 ⇒ hai số này KHÁC nhau thì mới phân biệt " +
                  "được app đọc cái nào.");
            Kq(1, $"        単位 「{Master.UnitNm}」 in ra lưới là 「{Master.ShortUnit}」 " +
                  "(editDrugUnitToShortUnit).");
            Kq(1, $"        path A = {Master.HasRx} ⇒ nhánh khoá ô " +
                  "(drugRxData != null, modSave.cs:2635) " +
                  (Master.HasRx ? "SẼ chạy." : "KHÔNG chạy — ô đáng lẽ vẫn sửa được."));
        });

        Say(() =>
        {
            var pb = Db2.Master(TrtDate, Cfg.PathBTrtCd, Cfg.TrtSb);
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

        var r = Flow.Read(TrtDate.Day, PtPlain, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(2, $"KHÔNG thấy dòng 点 = {PtPlain} trên lưới. Dòng của ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", Flow.DescribeDay(TrtDate.Day)));
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
            if (Master is not null)
            {
                Kq(2, $"        薬剤名 master 「{Master.DgNm}」 có trong ô không: " +
                      (Txt.Has(flat, Master.DgNm) ? "CÓ" : "KHÔNG"));
                Kq(2, $"        用法 master 「{Master.UsageNm}」 có trong ô không: " +
                      (Txt.Has(flat, Master.UsageNm) ? "CÓ" : "KHÔNG"));
            }
        });

        Say(() =>
        {
            if (Master is null || r.Row is null) return;
            var amounts = DrugRowReloadFlow.AmountsIn(r.RawRyo, Master.UnitNm);
            Kq(3, $"数量 đọc ra từ ô freewd-RỖNG (đơn vị 「{Master.UnitNm}」→" +
                  $"「{Master.ShortUnit}」): [{string.Join(",", amounts)}]");
            Kq(3, $"        使用量 mặc định master = 「{Master.DefaultCnt}」 ⇒ " +
                  (amounts.Contains(Master.DefaultCnt)
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
                      ? $"CÓ (med_kbn = 「{Master?.MedKbn}」, 回数 đã lưu = {Cfg.TrtCnt})"
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

        var plain = Flow.Read(TrtDate.Day, PtPlain, probeReadOnly: false, trace);
        var freed = Flow.Read(TrtDate.Day, PtFreeWd, probeReadOnly: false, trace);

        Say(() =>
        {
            if (plain.Row is null || freed.Row is null)
            {
                Kq(3, $"thiếu dòng: 点 {PtPlain} = {(plain.Row is null ? "KHÔNG THẤY" : "ok")}, " +
                      $"点 {PtFreeWd} = {(freed.Row is null ? "KHÔNG THẤY" : "ok")}. Dòng ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", Flow.DescribeDay(TrtDate.Day)));
                return;
            }

            Kq(3, $"freewd RỖNG  (点 {PtPlain}): 「{Txt.Vis(plain.RawRyo)}」");
            Kq(3, $"freewd 「{FreeWd}」 (点 {PtFreeWd}): 「{Txt.Vis(freed.RawRyo)}」");

            var same = Txt.N(plain.RawRyo) == Txt.N(freed.RawRyo);
            Kq(3, "        hai ô GIỐNG HỆT nhau: " + (same ? "CÓ" : "KHÔNG"));
            Kq(3, same
                ? "        ⇒ freewd KHÔNG được đọc lúc dựng lại. Bất ngờ — đọc lại " +
                  "EditControl.cs:1050-1055."
                : "        ⇒ freewd CÓ được đưa vào lúc dựng lại (EditControl.cs:1050-1055).");

            if (Master is null) return;
            var a = DrugRowReloadFlow.AmountsIn(plain.RawRyo, Master.UnitNm);
            var b = DrugRowReloadFlow.AmountsIn(freed.RawRyo, Master.UnitNm);
            Kq(3, $"        数量: rỗng → [{string.Join(",", a)}] · có freewd → [{string.Join(",", b)}]");
            Kq(3, $"        mong đợi dòng có freewd mang 「{FreeWd}」: " +
                  (b.Contains(FreeWd) ? "ĐÚNG" : "KHÔNG THẤY"));

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
        if (MasterSeed?.Blocker is not null)
        {
            Kq(8, "không seed được mã path B: " + MasterSeed.Blocker);
            return;
        }

        var r = Flow.Read(TrtDate.Day, PtPathB, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(8, $"KHÔNG thấy dòng path B 点 = {PtPathB}. Dòng của ngày {TrtDate.Day}: " +
                      string.Join(" | ", Flow.DescribeDay(TrtDate.Day)));
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

        var r = Flow.Read(TrtDate.Day, PtControl, probeReadOnly: true, trace);

        Say(() =>
        {
            if (r.Row is null)
            {
                Kq(6, $"KHÔNG thấy dòng đối chứng 点 = {PtControl}. Dòng của ngày " +
                      $"{TrtDate.Day}: " + string.Join(" | ", Flow.DescribeDay(TrtDate.Day)));
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
        if (SeedBlocker is { } why) { Kq(kq, why + " — bỏ qua."); return false; }
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
