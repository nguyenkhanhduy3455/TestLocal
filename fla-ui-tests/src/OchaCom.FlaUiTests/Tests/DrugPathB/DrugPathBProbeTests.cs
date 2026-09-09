using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugPathB;

/// <summary>
/// PROBE — dò hành vi THẬT của <b>path B</b> (<c>EditControl.editDrugName</c> nhánh
/// <c>else</c>). <b>KHÔNG assert</b>, không bao giờ ném. <c>[Explicit]</c>.
///
/// <para>Luật F1: dữ liệu dev không có ca nào rơi vào path B (63/63 mã 600–699 đều có
/// 処置変換 phủ ngày test), nên <b>chưa ai nhìn thấy nhánh này chạy</b>. Mọi assert viết
/// bây giờ đều là phỏng đoán.</para>
///
/// ─── 8 câu hỏi ──────────────────────────────────────────────────────────────
/// <list type="number">
/// <item><b>KQ-1</b> Hàng rào: bao nhiêu mã đang ở path B TRƯỚC seed (mong đợi 0);
///   <c>MST_MED</c> có gì; mã seed có đụng mã thật nào không.</item>
/// <item><b>KQ-2</b> Oracle: path B <i>lẽ ra</i> in ra mấy dòng, là những dòng nào.</item>
/// <item><b>KQ-3</b> Gõ mã seed CÓ 用法: <b>dòng có rơi xuống lưới không</b> — câu quyết
///   định của cả cặp parity, vì bản web dừng ở alert và KHÔNG chèn gì.</item>
/// <item><b>KQ-4</b> Ô 療法・処置 NGUYÊN VĂN: mấy dòng, từng dòng là gì, có dấu đệm
///   <c>REGIRYO_PADLEFT</c> không, có hậu tố 用量 (<c>n日分</c>) không.</item>
/// <item><b>KQ-5</b> 点 và 回 của dòng — có phải <c>score1</c>/<c>g_cnt</c> chép từ dòng
///   nguồn clone không.</item>
/// <item><b>KQ-6</b> Mã seed KHÔNG có <c>MST_MED</c> ⇒ mất dòng 用法, còn đúng một dòng?</item>
/// <item><b>KQ-7</b> ĐỐI CHỨNG của chính phép seed: gõ <b>dòng nguồn clone</b> (vẫn có
///   <c>MST_DRUG_RX</c>) ⇒ path A ⇒ ô 療法・処置 phải KHÁC HẲN. Không có câu này thì
///   「thấy hai dòng」 chưa chứng minh được là do path B.</item>
/// <item><b>KQ-8</b> Có hộp thoại nào bung ra trên đường không — nhất là
///   「該当処置はありません」, thứ KHÁC HẲN với 「path B ra rỗng」.</item>
/// </list>
///
/// <para>Chạy: <c>.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc0_ProbeMasterData</c>
/// … từng <c>-Case</c> một (F7).</para>
/// </summary>
[TestFixture]
[Category("drug-path-b")]
[Explicit("PROBE — chạy tay, không assert")]
[NonParallelizable]
public sealed class DrugPathBProbeTests : UiTestBase
{
    private DrugPathBDb? _db;
    private DrugPathBDb.SeedResult? _seed;
    private DrugPathBDb.PathBCandidate? _withUsage;
    private DrugPathBDb.PathBCandidate? _noUsage;
    private DrugPathBDb.PathBCandidate? _cloneSource;
    private DrugPathBFlow _flow = null!;

    private TestSettings.DrugPathBSection Cfg => Settings.DrugPathB;

    private IReadOnlyList<(int TrtCd, int TrtSb)> SeedKeys =>
        [(Cfg.PathBTrtCd, Cfg.TrtSb), (Cfg.NoMedTrtCd, Cfg.TrtSb)];

    /// <summary>
    /// Tắt watcher: probe này ĐO CHÍNH các hộp thoại quanh lượt nhập. Để watcher trả lời
    /// hộ thì probe kết luận 「app không hỏi」 trong khi app có hỏi.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.DrugPathB.AllowSeed)
            return "drugPathB.allowSeed = false. Cả 63/63 mã 600–699 của dev đều có " +
                   "MST_DRUG_RX phủ ngày test nên path B KHÔNG BAO GIỜ chạy — không seed " +
                   "thì mọi câu KQ đều rỗng. Bật cờ (hoặc OCHA_DRUG_PATH_B_ALLOW_SEED=1).";
        return null;
    }

    /// <summary>
    /// Dựng hai mã seed TRƯỚC khi app mở.
    ///
    /// <para>Phải là ở đây chứ không phải trong testcase: <c>GetTrtmasCod</c> tra master
    /// ngay ở cú gõ mã đầu tiên, và ta muốn mã tra được ngay lần gõ đầu — y như vế
    /// Playwright seed trong <c>beforeAll</c>.</para>
    ///
    /// <para>Lượt chạy <b>chỉ THÊM dòng</b>: mã mới thì đương nhiên không có
    /// <c>MST_DRUG_RX</c> ⇒ rơi thẳng vào path B, không phải sửa dòng nào có sẵn. Dọn là
    /// <c>DELETE</c> theo đúng khoá vừa tạo.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        _db = DrugPathBDb.CreateOrNull(Settings);
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

        // Dọn trước: một lượt chạy trước chết giữa chừng thì hàng rào của SeedCodes sẽ
        // chặn, mà chặn xong fixture cũng không chạy được gì. Dọn cho sạch rồi seed lại.
        TestContext.Out.WriteLine("DỌN TRƯỚC — " + _db.Cleanup(TrtDate, SeedKeys));

        _seed = _db.SeedCodes(TrtDate, (Cfg.CloneTrtCd, Cfg.CloneTrtSb),
        [
            new DrugPathBDb.SeedSpec(Cfg.PathBTrtCd, Cfg.TrtSb, Cfg.PathBTrtNm, Cfg.PathBUsage),
            new DrugPathBDb.SeedSpec(Cfg.NoMedTrtCd, Cfg.TrtSb, Cfg.NoMedTrtNm, ""),
        ]);
        TestContext.Out.WriteLine("SEED — " + _seed);
        if (_seed.Blocker is not null) return;

        _withUsage = _db.Candidate(TrtDate, Cfg.PathBTrtCd, Cfg.TrtSb);
        _noUsage = _db.Candidate(TrtDate, Cfg.NoMedTrtCd, Cfg.TrtSb);
        _cloneSource = _db.Candidate(TrtDate, Cfg.CloneTrtCd, Cfg.CloneTrtSb);
    }

    [OneTimeTearDown]
    public void CleanupSeed()
    {
        if (_db is null) return;
        try { TestContext.Out.WriteLine("ĐÃ DỌN — " + _db.Cleanup(TrtDate, SeedKeys)); }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG DỌN ĐƯỢC mã seed: {e.Message}. SỬA TAY: xoá TRT_CD IN " +
                $"({Cfg.PathBTrtCd},{Cfg.NoMedTrtCd}) khỏi bảng master và MST_MED.");
        }
    }

    [SetUp]
    public void ProbeSetUp() => _flow = new DrugPathBFlow(App, Screen);

    [TearDown]
    public void ProbeTearDown()
    {
        try { _flow?.CancelAll(); } catch { /* app có thể đã chết */ }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — CHỈ ĐỌC DB.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE dữ liệu — hàng rào path B, MST_MED có gì, oracle của hai mã seed")]
    [CancelAfter(180_000)]
    public void Tc0_ProbeMasterData()
    {
        if (_db is null) { Kq(0, "không đọc được DB — mọi câu sau đều rỗng."); return; }

        Say(() =>
        {
            Kq(1, $"{_db.CountPathBCodes(TrtDate)} mã 600–699 đang ở path B (không có 処置変換 " +
                  $"phủ {TrtDate:yyyy-MM-dd}) — đã tính cả hai mã seed. MST_MED có " +
                  $"{_db.CountMstMed()} dòng.");
            var orphan = _db.OrphanMstMed(TrtDate);
            Kq(1, $"        {orphan.Count} dòng MST_MED MỒ CÔI: " + string.Join(" · ", orphan));
            Kq(1, "        ⇒ mã mồ côi KHÔNG dùng làm ứng viên được: gõ nó chỉ ra " +
                  "「該当処置はありません」 (modMain.cs:487), chưa tới được editDrugName.");
            Kq(1, "SEED — " + (_seed?.ToString() ?? "(chưa seed)"));
        });

        Say(() =>
        {
            Kq(2, "MÃ CÓ 用法      = " + (_withUsage?.ToString() ?? "KHÔNG TÌM RA"));
            Kq(2, "MÃ KHÔNG 用法  = " + (_noUsage?.ToString() ?? "KHÔNG TÌM RA"));
            Kq(2, "NGUỒN CLONE    = " + (_cloneSource?.ToString() ?? "KHÔNG TÌM RA"));

            foreach (var c in new[] { _withUsage, _noUsage })
            {
                if (c is null) continue;
                Kq(2, $"        {c.TrtCd}/{c.TrtSb}: {c.RxRows.Count} dòng mst_drug_rx " +
                      $"(0 = đúng, mã mới thì không có) · oracle ⇒ {c.ExpectedLines.Count} dòng: " +
                      string.Join(" ⏎ ", c.ExpectedLines.Select(l => $"「{l}」")));
                Kq(2, $"          getMstTrtDataYaku trả bản ghi = {c.YakuRowVisible} " +
                      $"(active_flg = {c.ActiveFlg})");
            }

            if (_cloneSource is not null)
                Kq(2, $"        NGUỒN CLONE {_cloneSource.TrtCd}/{_cloneSource.TrtSb} vẫn có " +
                      $"{_cloneSource.RxRows.Count} dòng rx ⇒ nó ở path A, dùng làm đối chứng (KQ-7).");

            Kq(2, "        ⇒ ĐÂY là điểm parity: WinForm chèn dòng với chừng ấy nội dung, " +
                  "còn bản web dừng ở 「この薬剤コードは現在未対応です。」 và KHÔNG chèn gì " +
                  "(treatment-entry-detail.tsx:5077-5079).");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — MỘT vòng: mã seed CÓ 用法.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE path B — dòng có rơi xuống lưới không, và ô 療法・処置 nguyên văn là gì")]
    [CancelAfter(600_000)]
    public void Tc1_ProbePathBRow()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(3, _withUsage)) return;

        var r = _flow.EnterCode(_withUsage!, TrtDate.Day, trace);

        Say(() =>
        {
            Kq(3, $"gõ mã seed {_withUsage!.TrtCd} (không có 処置変換): {r}");
            Kq(3, r.Row is null
                ? "        ⚠️ KHÔNG có dòng nào rơi xuống lưới — nếu đúng vậy thì WinForm " +
                  "cũng từ chối, và điểm parity G2 nhỏ hơn nhiều so với giả định: bản web " +
                  "chỉ còn thiếu CÂU THÔNG BÁO chứ không thiếu DÒNG DỮ LIỆU."
                : "        CÓ dòng rơi xuống lưới ⇒ đúng như đọc từ EditControl.cs:1137-1148, " +
                  "và bản web thì không chèn gì.");
            Kq(8, r.Dialogs.Count == 0
                ? "không hộp thoại nào bung ra trên đường."
                : "hộp thoại gặp phải (NGUYÊN VĂN): " + string.Join(" / ", r.Dialogs.Select(d => $"「{d}」")));
        });

        Say(() =>
        {
            Kq(4, $"ô 療法・処置 NGUYÊN VĂN (còn \\r\\n): 「{Txt.Vis(r.RawRyo)}」");
            Kq(4, $"        tách ra {r.Lines.Count} dòng:");
            for (var i = 0; i < r.Lines.Count; i++) Kq(4, $"          [{i}] 「{r.Lines[i]}」");
            Kq(4, $"        oracle nói {_withUsage!.ExpectedLines.Count} dòng: " +
                  string.Join(" ⏎ ", _withUsage.ExpectedLines.Select(l => $"「{l}」")));
            Kq(4, "        ⚠️ bản ĐÃ LÀM PHẲNG mà lưới trả qua Txt.N: 「" + Txt.N(r.RawRyo) +
                  "」 — đếm dòng trên bản này là xanh giả (F23).");
            Kq(4, "        hậu tố 用量: " +
                  (Txt.N(r.RawRyo).Contains("日分") || Txt.N(r.RawRyo).Contains("回分")
                      ? "CÓ — bất ngờ, cụm sinh 「n日分」 nằm trong nhánh A (EditControl.cs:1118-1133)"
                      : "KHÔNG — đúng như đọc từ source"));
        });

        Say(() => Kq(5, $"点 = 「{r.Row?.Ten ?? "?"}」 (score1 chép từ dòng clone = {_withUsage!.Score1}) · " +
                        $"回 = 「{r.Row?.Kai ?? "?"}」 (g_cnt = {_withUsage.GCnt})"));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — MỘT vòng: mã seed KHÔNG có MST_MED.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE — mã KHÔNG có dòng MST_MED thì path B mất dòng 用法")]
    [CancelAfter(600_000)]
    public void Tc2_ProbeWithoutUsage()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(6, _noUsage)) return;

        if (_noUsage!.HasUsage)
            Kq(6, $"⚠️ {_noUsage.TrtCd}/{_noUsage.TrtSb} LẠI CÓ dòng MST_MED 「{_noUsage.Usage}」 — " +
                  "seed sai, nó không làm đối chứng được.");

        var r = _flow.EnterCode(_noUsage, TrtDate.Day, trace);

        Say(() =>
        {
            Kq(6, $"mã KHÔNG có MST_MED {_noUsage.TrtCd}/{_noUsage.TrtSb}: {r}");
            Kq(6, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」 ⇒ {r.Lines.Count} dòng");
            Kq(6, r.Lines.Count == 1
                ? "        đúng như mong đợi: chỉ còn dòng 処置名 ⇒ dòng thứ hai của Tc1 " +
                  "ĐÚNG LÀ đến từ MST_MED (SyoPac.cs:242-266)."
                : $"        ⚠️ ra {r.Lines.Count} dòng — đọc lại EditControl.cs:1142-1148 trước " +
                  "khi kết luận nguồn của dòng 用法.");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc3 — MỘT vòng: đối chứng của chính phép seed (dòng nguồn clone → path A).
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE đối chứng — dòng NGUỒN CLONE vẫn ở path A, ô 療法・処置 phải khác hẳn")]
    [CancelAfter(600_000)]
    public void Tc3_ProbeCloneSourceIsPathA()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(7, _cloneSource)) return;

        // Không có câu này thì 「thấy hai dòng ở Tc1」 chưa chứng minh được là DO path B:
        // biết đâu mọi mã thuốc đều in ra hai dòng như vậy. Dòng nguồn clone có ĐỦ
        // 処置変換 nên nó phải đi path A và ra một chuỗi khác hẳn.
        var r = _flow.EnterCode(_cloneSource!, TrtDate.Day, trace);

        Say(() =>
        {
            Kq(7, $"NGUỒN CLONE {_cloneSource!.TrtCd}/{_cloneSource.TrtSb} " +
                  $"({_cloneSource.RxRows.Count} dòng rx ⇒ path A): {r}");
            Kq(7, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」 ⇒ {r.Lines.Count} dòng");
            Kq(7, "        ⇒ khác hẳn Tc1 thì phép seed THẬT SỰ đổi nhánh. Giống nhau nghĩa là " +
                  "mọi thứ đo được ở Tc1/Tc2 chẳng chứng minh gì cả.");
            Kq(7, "        (path A dựng tên từ mst_drug + 数量 + 単位 + 用法 + 用量 — " +
                  "EditControl.cs:1048-1135; path B chỉ có trt_nm + MST_MED.usage)");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc4–Tc6 — LỐI VÀO THỨ HAI: 薬剤選択 (Shift+F6). Mỗi testcase MỘT vòng.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE 薬剤選択 path A — chọn mã CÒN mst_drug_rx rồi 確定 (đối chứng)")]
    [CancelAfter(600_000)]
    public void Tc4_ProbeMedicineSelectPathA()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(10, _cloneSource)) return;

        var r = _flow.PickViaMedicineSelect(_cloneSource!, Grp(_cloneSource!), trace);

        Say(() =>
        {
            Kq(10, $"薬剤選択 · path A ({_cloneSource!.TrtCd}/{_cloneSource.TrtSb}, " +
                   $"{_cloneSource.RxRows.Count} dòng rx): {r}");
            Kq(10, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」 ⇒ {r.Lines.Count} dòng");
            Kq(10, "        (path A dựng tên từ mst_drug + 数量 + 単位 + 用法 + 用量 — " +
                   "EditControl.cs:1048-1135)");
            Kq(10, r.Opened
                ? "        Shift+F6 mở được 薬剤選択."
                : "        ⚠️ KHÔNG mở được 薬剤選択 — kiểm nút btnShift và nút 「薬剤」 " +
                  "trên dải phím Shift TRƯỚC khi đổ cho app.");
        });
    }

    [Test]
    [Description("PROBE 薬剤選択 path B — mã seed CÓ mst_med: 処置名称 + 用法")]
    [CancelAfter(600_000)]
    public void Tc5_ProbeMedicineSelectPathB()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(11, _withUsage)) return;

        var r = _flow.PickViaMedicineSelect(_withUsage!, Grp(_withUsage!), trace);

        Say(() =>
        {
            Kq(11, $"薬剤選択 · path B ({_withUsage!.TrtCd}/{_withUsage.TrtSb}): {r}");
            Kq(11, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」 ⇒ {r.Lines.Count} dòng");
            for (var i = 0; i < r.Lines.Count; i++) Kq(11, $"          [{i}] 「{r.Lines[i]}」");
            Kq(11, $"        oracle nói {_withUsage.ExpectedLines.Count} dòng: " +
                   string.Join(" ⏎ ", _withUsage.ExpectedLines.Select(l => $"「{l}」")));
            Kq(11, "        ⇒ giống Tc1 (lối gõ mã) nghĩa là HAI LỐI VÀO cho cùng một ô " +
                   "療法・処置 — đúng như đọc từ frm203002.cs:8791 (frmMed_LetData đi chung " +
                   "đường chốt của 処置選択).");
        });
    }

    [Test]
    [Description("PROBE 薬剤選択 — mã seed KHÔNG có mst_med: chỉ còn dòng 処置名称")]
    [CancelAfter(600_000)]
    public void Tc6_ProbeMedicineSelectNoUsage()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(12, _noUsage)) return;

        var r = _flow.PickViaMedicineSelect(_noUsage!, Grp(_noUsage!), trace);

        Say(() =>
        {
            Kq(12, $"薬剤選択 · path B không 用法 ({_noUsage!.TrtCd}/{_noUsage.TrtSb}): {r}");
            Kq(12, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」 ⇒ {r.Lines.Count} dòng");
            Kq(12, r.Lines.Count == 1
                ? "        đúng như mong đợi: chỉ còn dòng 処置名 ⇒ dòng thứ hai của Tc5 " +
                  "ĐÚNG LÀ đến từ MST_MED."
                : $"        ⚠️ ra {r.Lines.Count} dòng — đọc lại EditControl.cs:1142-1148.");
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// <c>grp</c> của mã — quyết định 薬剤選択 mở ở tab nào (1 内服 · 2 屯服 · 3 外用).
    ///
    /// <para>Mã seed thừa hưởng <c>grp</c> của dòng nguồn clone, và cấu hình mặc định
    /// clone từ 600/0 (<c>grp = 2</c>) nên cả ba mã đều nằm ở tab 屯服.</para>
    /// </summary>
    private int Grp(DrugPathBDb.PathBCandidate c) =>
        _db?.GrpOf(TrtDate, c.TrtCd, c.TrtSb) ?? 2;

    private bool Ready(int kq, DrugPathBDb.PathBCandidate? c)
    {
        if (_db is null) { Kq(kq, "không đọc được DB — bỏ qua."); return false; }
        if (_seed?.Blocker is not null) { Kq(kq, "seed hỏng: " + _seed.Blocker); return false; }
        if (c is null) { Kq(kq, "không tìm ra mã cần dùng trong master — bỏ qua."); return false; }
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
