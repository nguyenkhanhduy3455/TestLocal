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
/// ─── 9 câu hỏi ──────────────────────────────────────────────────────────────
/// <list type="number">
/// <item><b>KQ-1</b> Hàng rào: bao nhiêu mã đang ở path B TRƯỚC seed (mong đợi 0);
///   <c>MST_MED</c> có bao nhiêu dòng và bao nhiêu dòng mồ côi.</item>
/// <item><b>KQ-2</b> Ứng viên + oracle: path B <i>lẽ ra</i> in ra mấy dòng, là những dòng nào.</item>
/// <item><b>KQ-3</b> Gõ mã đã seed: có hộp thoại nào bung ra không? Có
///   「該当処置はありません」 không? <b>Dòng có rơi xuống lưới không</b> — đây là câu
///   quyết định của cả cặp parity, vì bản web KHÔNG chèn dòng nào.</item>
/// <item><b>KQ-4</b> Ô 療法・処置 NGUYÊN VĂN: mấy dòng, từng dòng là gì, có dấu đệm
///   <c>REGIRYO_PADLEFT</c> không, có hậu tố 用量 (<c>n日分</c>) không.</item>
/// <item><b>KQ-5</b> 点 và 回 của dòng — có phải <c>score1</c> và <c>g_cnt</c> không.</item>
/// <item><b>KQ-6</b> ĐỐI CHỨNG không có <c>MST_MED</c> ⇒ mất dòng 用法, còn đúng một dòng?</item>
/// <item><b>KQ-7</b> Hai chế độ seed (<c>HideByDate</c> vs <c>BlankDgCd</c>) có cho ra
///   CÙNG một ô 療法・処置 không — nếu khác thì kết luận về path B phụ thuộc cách ta ép
///   nó vào path B, và phải soi tiếp.</item>
/// <item><b>KQ-8</b> ĐỐI CHỨNG của chính phép seed: bỏ seed ⇒ path A ⇒ ô 療法・処置 phải
///   KHÁC HẲN. Không có câu này thì 「thấy hai dòng」 chưa chứng minh được là do path B.</item>
/// <item><b>KQ-9</b> Path B có ghi <c>free_wd</c> hay đụng gì tới ô 回 không (nhánh này
///   không đi qua 薬剤使用量選択).</item>
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
    private DrugPathBDb.RxSnapshot? _rxBefore;
    private DrugPathBDb.PathBCandidate? _subject;
    private DrugPathBDb.PathBCandidate? _control;
    private DrugPathBFlow _flow = null!;

    private TestSettings.DrugPathBSection Cfg => Settings.DrugPathB;

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
    /// CHỤP ảnh <c>MST_DRUG_RX</c> trước khi app mở — và <b>chỉ chụp</b>.
    ///
    /// <para>Khác luồng G1: ở đây seed được đặt/gỡ TRONG từng testcase, vì mỗi câu hỏi
    /// cần một chế độ seed khác nhau (và KQ-8 cần lượt KHÔNG seed). Làm được là vì
    /// <c>frmTrtSel_Let_Trt_Data</c> mở connection MỚI mỗi lượt chốt (frm203016.cs:1459)
    /// nên app đọc lại DB mỗi lần — không dính bẫy F21 (「đường ghi lúc nhập đọc bộ nhớ
    /// phiên chạy」).</para>
    ///
    /// <para>Ảnh chụp vẫn phải lấy Ở ĐÂY, trước mọi lệnh ghi (F20).</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        _db = DrugPathBDb.CreateOrNull(Settings);
        if (_db is null)
        {
            TestContext.Out.WriteLine("KHÔNG chuẩn bị được: db.enabled = false hoặc thiếu chuỗi kết nối.");
            return;
        }

        if (_db.ProbeError() is { } err)
        {
            TestContext.Out.WriteLine($"KHÔNG chuẩn bị được: không kết nối được SQL Server — {err}");
            _db = null;
            return;
        }

        _subject = _db.Candidate(TrtDate, Cfg.TrtCd, Cfg.TrtSb);
        _control = _db.Candidate(TrtDate, Cfg.ControlTrtCd, Cfg.ControlTrtSb);

        if (_subject is null)
        {
            TestContext.Out.WriteLine(
                $"KHÔNG có mã {Cfg.TrtCd}/{Cfg.TrtSb} trong master ngày {TrtDate:yyyy-MM-dd}.");
            return;
        }

        var keys = _control is null
            ? new[] { (_subject.TrtCd, _subject.TrtSb) }
            : [(_subject.TrtCd, _subject.TrtSb), (_control.TrtCd, _control.TrtSb)];
        _rxBefore = _db.TakeSnapshot(keys);

        TestContext.Out.WriteLine("ẢNH CHỤP MST_DRUG_RX (chép lại nếu lượt chạy chết giữa chừng):");
        foreach (var r in _rxBefore.Rows) TestContext.Out.WriteLine("    " + r);
        TestContext.Out.WriteLine($"HÀNG RÀO — {_db.CountPathBCodes(TrtDate)} mã 600–699 đang ở " +
                                  "path B trước khi seed (0 = đúng như dữ liệu dev).");
    }

    [OneTimeTearDown]
    public void RestoreRx()
    {
        if (_db is null || _rxBefore is null) return;
        try { TestContext.Out.WriteLine("ĐÃ TRẢ LẠI — " + _db.Restore(_rxBefore)); }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG TRẢ LẠI ĐƯỢC MST_DRUG_RX: {e.Message}. SỬA TAY theo ảnh chụp ở đầu log.");
        }
    }

    [SetUp]
    public void ProbeSetUp() => _flow = new DrugPathBFlow(App, Screen);

    [TearDown]
    public void ProbeTearDown()
    {
        try { _flow?.CancelAll(); } catch { /* app có thể đã chết */ }
        // Gỡ seed sau MỖI testcase: câu hỏi kế có thể cần chế độ khác, hoặc cần path A.
        if (_db is not null && _rxBefore is not null)
        {
            try { TestContext.Out.WriteLine("  gỡ seed: " + _db.Restore(_rxBefore)); }
            catch (Exception e) { TestContext.Out.WriteLine($"  gỡ seed HỎNG: {e.Message}"); }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — CHỈ ĐỌC DB.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE dữ liệu — hàng rào path B, MST_MED có gì, oracle của hai mã")]
    [CancelAfter(180_000)]
    public void Tc0_ProbeMasterData()
    {
        if (_db is null) { Kq(0, "không đọc được DB — mọi câu sau đều rỗng."); return; }

        Say(() =>
        {
            Kq(1, $"{_db.CountPathBCodes(TrtDate)} mã 600–699 đang ở path B (không có 処置変換 " +
                  $"phủ {TrtDate:yyyy-MM-dd}). MST_MED có {_db.CountMstMed()} dòng.");
            var orphan = _db.OrphanMstMed(TrtDate);
            Kq(1, $"        {orphan.Count} dòng MST_MED MỒ CÔI (có 用法 nhưng master không có 処置): " +
                  string.Join(" · ", orphan));
            Kq(1, "        ⇒ gõ mã mồ côi chỉ ra 「該当処置はありません」 (modMain.cs:487), " +
                  "KHÔNG tới được path B — nên không dùng chúng làm ứng viên.");
        });

        Say(() =>
        {
            Kq(2, "ĐỐI TƯỢNG  = " + (_subject?.ToString() ?? "KHÔNG TÌM RA"));
            Kq(2, "ĐỐI CHỨNG = " + (_control?.ToString() ?? "KHÔNG TÌM RA"));
            if (_subject is null) return;

            foreach (var r in _subject.RxRows)
                Kq(2, $"        rx: {r} · phủ ngày test = {r.Covers(TrtDate)}");

            Kq(2, $"        oracle path B ⇒ {_subject.ExpectedLines.Count} dòng: " +
                  string.Join(" ⏎ ", _subject.ExpectedLines.Select(l => $"「{l}」")));
            Kq(2, $"        (getMstTrtDataYaku trả bản ghi = {_subject.YakuRowVisible}: " +
                  $"active_flg = {_subject.ActiveFlg}, trt_nm kết thúc bằng '!' = " +
                  $"{_subject.TrtNm.EndsWith("!", StringComparison.Ordinal)})");

            if (_control is not null)
                Kq(2, $"        ĐỐI CHỨNG oracle ⇒ {_control.ExpectedLines.Count} dòng: " +
                      string.Join(" ⏎ ", _control.ExpectedLines.Select(l => $"「{l}」")));

            Kq(2, "        ⇒ ĐÂY là điểm parity: WinForm chèn dòng với chừng ấy nội dung, " +
                  "còn bản web dừng ở 「この薬剤コードは現在未対応です。」 và KHÔNG chèn gì " +
                  "(treatment-entry-detail.tsx:5077-5079).");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — MỘT vòng: seed HideByDate rồi gõ mã.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE path B — dòng có rơi xuống lưới không, và ô 療法・処置 nguyên văn là gì")]
    [CancelAfter(600_000)]
    public void Tc1_ProbePathBRow()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(3)) return;

        var seed = _db!.SeedPathB(_subject!, TrtDate, DrugPathBDb.SeedMode.HideByDate);
        Kq(3, "SEED — " + seed);
        if (seed.Blocker is not null) return;

        var r = _flow.EnterCode(_subject!, TrtDate.Day, trace);

        Say(() =>
        {
            Kq(3, $"gõ mã {_subject!.TrtCd} sau khi giấu 処置変換: {r}");
            Kq(3, r.Row is null
                ? "        ⚠️ KHÔNG có dòng nào rơi xuống lưới — nếu đúng vậy thì WinForm " +
                  "cũng từ chối, và điểm parity G2 nhỏ hơn nhiều so với giả định."
                : "        CÓ dòng rơi xuống lưới ⇒ đúng như đọc từ EditControl.cs:1137-1148, " +
                  "và bản web thì không chèn gì.");
        });

        Say(() =>
        {
            Kq(4, $"ô 療法・処置 NGUYÊN VĂN (còn \\r\\n): 「{Txt.Vis(r.RawRyo)}」");
            Kq(4, $"        tách ra {r.Lines.Count} dòng:");
            for (var i = 0; i < r.Lines.Count; i++) Kq(4, $"          [{i}] 「{r.Lines[i]}」");
            Kq(4, $"        oracle nói {_subject!.ExpectedLines.Count} dòng: " +
                  string.Join(" ⏎ ", _subject.ExpectedLines.Select(l => $"「{l}」")));
            Kq(4, "        ⚠️ bản ĐÃ LÀM PHẲNG mà lưới trả qua Txt.N: 「" +
                  Txt.N(r.RawRyo) + "」 — đếm dòng trên bản này là xanh giả (F23).");
        });

        Say(() =>
        {
            Kq(5, $"点 = 「{r.Row?.Ten ?? "?"}」 (score1 của master = {_subject!.Score1}) · " +
                  $"回 = 「{r.Row?.Kai ?? "?"}」 (g_cnt = {_subject.GCnt})");
            Kq(9, "path B KHÔNG đi qua 薬剤使用量選択 nên free_wd phải rỗng — cột 72 là ô ẩn, " +
                  "không đọc được từ giao diện; chỉ khẳng định được sau F9 登録 (chưa bật).");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — MỘT vòng: đối chứng KHÔNG có MST_MED.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE đối chứng — mã KHÔNG có dòng MST_MED thì path B mất dòng 用法")]
    [CancelAfter(600_000)]
    public void Tc2_ProbeControlWithoutUsage()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(6)) return;
        if (_control is null) { Kq(6, "không có mã đối chứng — bỏ qua."); return; }

        if (_control.HasUsage)
            Kq(6, $"⚠️ {_control.TrtCd}/{_control.TrtSb} LẠI CÓ dòng MST_MED 「{_control.Usage}」 — " +
                  "nó không làm đối chứng được. Đặt drugPathB.controlTrtCd sang mã khác " +
                  "(dev có 12 mã 600–699 vắng mặt trong MST_MED).");

        var seed = _db!.SeedPathB(_control, TrtDate, DrugPathBDb.SeedMode.HideByDate);
        Kq(6, "SEED (đối chứng) — " + seed);
        if (seed.Blocker is not null) return;

        var r = _flow.EnterCode(_control, TrtDate.Day, trace);

        Say(() =>
        {
            Kq(6, $"ĐỐI CHỨNG {_control.TrtCd}/{_control.TrtSb} (không có MST_MED): {r}");
            Kq(6, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」 ⇒ {r.Lines.Count} dòng");
            Kq(6, r.Lines.Count == 1
                ? "        đúng như mong đợi: chỉ còn dòng 処置名 ⇒ dòng thứ hai của Tc1 " +
                  "ĐÚNG LÀ đến từ MST_MED."
                : $"        ⚠️ ra {r.Lines.Count} dòng — đọc lại EditControl.cs:1142-1148 trước " +
                  "khi kết luận nguồn của dòng 用法.");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc3 — HAI vòng: chế độ seed thứ hai, rồi lượt KHÔNG seed (path A).
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE — hai chế độ seed có cho cùng kết quả; và bỏ seed thì path A khác hẳn")]
    [CancelAfter(600_000)]
    public void Tc3_ProbeSeedModesAndPathA()
    {
        using var trace = TestTrace.Begin();
        if (!Ready(7)) return;

        // ── KQ-7: BlankDgCd — vào path B bằng cửa thứ hai ───────────────────
        Say(() =>
        {
            var seed = _db!.SeedPathB(_subject!, TrtDate, DrugPathBDb.SeedMode.BlankDgCd);
            Kq(7, "SEED (BlankDgCd) — " + seed);
            if (seed.Blocker is not null) return;

            var r = _flow.EnterCode(_subject!, TrtDate.Day, trace);
            Kq(7, $"chế độ BlankDgCd: {r}");
            Kq(7, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」");
            Kq(7, "        so với Tc1 (HideByDate): giống ⇒ kết luận về path B không phụ thuộc " +
                  "cách ép; khác ⇒ soi nhánh drugInfStr.drugRxData != null (frm203016.cs:1470), " +
                  "chỉ chạy ở chế độ này.");
            _flow.CancelAll(trace);
        });

        // ── KQ-8: ĐỐI CHỨNG của chính phép seed — bỏ seed ⇒ path A ──────────
        Say(() =>
        {
            Kq(8, "gỡ seed: " + _db!.Restore(_rxBefore!));
            var r = _flow.EnterCode(_subject!, TrtDate.Day, trace);
            Kq(8, $"KHÔNG seed (path A): {r}");
            Kq(8, $"        nguyên văn: 「{Txt.Vis(r.RawRyo)}」");
            Kq(8, "        ⇒ khác hẳn hai lượt trên thì phép seed THẬT SỰ đổi nhánh. Giống nhau " +
                  "nghĩa là mọi thứ đo được ở Tc1/Tc2 chẳng chứng minh gì cả.");
            _flow.CancelAll(trace);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    private bool Ready(int kq)
    {
        if (_db is null) { Kq(kq, "không đọc được DB — bỏ qua."); return false; }
        if (_subject is null) { Kq(kq, "không có ứng viên — bỏ qua."); return false; }
        if (_rxBefore is null) { Kq(kq, "chưa chụp được ảnh MST_DRUG_RX — KHÔNG seed."); return false; }
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
