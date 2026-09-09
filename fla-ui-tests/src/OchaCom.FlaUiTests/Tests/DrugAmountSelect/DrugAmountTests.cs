using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.DrugAmountSelect;

/// <summary>
/// <b>G1 — 薬剤使用量選択 (frm203020)</b>, nửa WinForm của cặp parity.
///
/// Cặp Playwright: <c>../web-tenant-tests/tests/dialogs-selection/drug-qty-selection-dialog.spec.ts</c>.
///
/// <code>
/// WinForm (file này)                    | Playwright (cùng thứ tự trong spec kia)
/// ------------------------------------- | ---------------------------------------------------
/// TcG1_DialogShowsMasterComponents      | 「bung ra với đúng thành phần…」
/// TcG2_ClickRowIncrementsQty            | 「click vào dòng làm 使用量 +1…」
/// TcG3_FixedCostRowIgnoresClick         | 「dòng 薬価固定 (cost_type 3) không đổi khi click」
/// TcG4_EscapeIsConfirm                  | 「Escape là 確定 — dòng nhận 点数 vừa tính…」
/// TcG5_ControlCodeDoesNotOpenDialog     | 「mã đối chứng (f2 = 0) KHÔNG mở dialog…」
/// TcG6_BackKeepsMasterScore             | 「F10 戻る giữ nguyên 点数 mặc định…」
/// TcG7_TypedQtyRecalculates             | 「gõ thẳng 使用量 vào ô…」          ← thêm theo vế này
/// TcG8_FreeWdRebuildsRowText            | 「ô 療法・処置 in ra 数量 MỚI…」    ← thêm theo vế này
/// </code>
///
/// <para>Hai vế <b>cố ý đo cùng một mã</b> (mặc định 605/0, đối chứng 606/0) để số đo so
/// thẳng được với nhau. Bảng đối chiếu kết quả nằm ở §9 của <c>README.md</c> cùng thư mục.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KỲ VỌNG KHÔNG HARDCODE
/// ═══════════════════════════════════════════════════════════════════════════
/// Mọi con số lấy từ <see cref="DrugAmountDb"/> — bản chép nguyên văn
/// <c>frm203020.getPoint</c> / <c>setTable</c> / <c>getSum</c>, chạy trên chính master
/// của ngày test. Đổi mã đem đo hay đổi master thì kỳ vọng tự đổi theo. <b>Không</b>
/// import hàm nào của app: cái đang đo chính là hàm đó (Rule chung với spec bên kia).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// GHI DB — và vì sao KHÔNG có cách nào tránh
/// ═══════════════════════════════════════════════════════════════════════════
/// Master dev có <b>0</b> dòng <c>mst_trt.F2 = 1</c>, mà đó là cửa duy nhất mở hộp thoại
/// (frm203016.cs:1426). Fixture mượn tạm cờ đó: chụp — in ra — trả lại (F20), nằm sau
/// <c>drugAmount.allowSeed</c> (mặc định tắt ⇒ tự Ignore TRƯỚC khi mở app).
/// <b>KHÔNG bấm F9 登録</b> ⇒ <c>TRNTRN</c> không bị đụng.
///
/// <para>Chạy: <c>.\run-select-drug-amount.ps1 -Seed</c> · từng testcase một bằng
/// <c>-Case</c> (F7). Nhánh 薬価固定 phải chạy riêng với
/// <c>-TrtCd 690</c> — xem <see cref="TcG3_FixedCostRowIgnoresClick"/>.</para>
/// </summary>
[TestFixture]
[Category("drug-amount-select")]
[NonParallelizable]
public sealed class DrugAmountTests : UiTestBase
{
    private DrugAmountDb? _db;
    private DrugAmountDb.F2Snapshot? _f2Before;
    private DrugAmountDb.DrugCandidate? _subject;
    private DrugAmountDb.DrugCandidate? _control;
    private DrugAmountFlow _flow = null!;

    private TestSettings.DrugAmountSection Cfg => Settings.DrugAmount;

    /// <summary>
    /// Tắt watcher. Nó tự bấm 「いいえ」 cho những câu khai trong <c>run.nuisanceDialogs</c>;
    /// fixture này tự trả lời hộp thoại của riêng nó và cần thấy nguyên văn từng câu.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.DrugAmount.AllowSeed)
            return "drugAmount.allowSeed = false. Master dev có 0 dòng mst_trt.F2 = 1 nên " +
                   "薬剤使用量選択 KHÔNG BAO GIỜ mở — chạy mà không seed thì mọi testcase đều " +
                   "xanh vì chẳng đo gì. Bật cờ (hoặc OCHA_DRUG_AMOUNT_ALLOW_SEED=1).";
        return null;
    }

    /// <inheritdoc cref="DrugAmountProbeTests.PrepareDataBeforeApp"/>
    protected override void PrepareDataBeforeApp()
    {
        _db = DrugAmountDb.CreateOrNull(Settings);
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

        var table = _db.ActiveTrtTable(TrtDate);
        TestContext.Out.WriteLine(
            $"HÀNG RÀO — {table} đang có {_db.CountF2Enabled(table)} dòng F2 = 1 trước khi seed.");

        _subject = Cfg.TrtCd > 0
            ? _db.Candidate(TrtDate, Cfg.TrtCd, Cfg.TrtSb)
            : _db.DefaultCandidate(TrtDate);
        _control = _db.Candidate(TrtDate, Cfg.ControlTrtCd, Cfg.ControlTrtSb);

        if (_subject is null)
        {
            TestContext.Out.WriteLine(
                $"KHÔNG seed được: {Cfg.TrtCd}/{Cfg.TrtSb} không có mst_drug_rx phủ ngày {TrtDate:yyyy-MM-dd}.");
            return;
        }

        // ⚠️ CHỤP TRƯỚC KHI GHI (F20).
        var keys = _control is null
            ? new[] { (_subject.TrtCd, _subject.TrtSb) }
            : [(_subject.TrtCd, _subject.TrtSb), (_control.TrtCd, _control.TrtSb)];
        _f2Before = _db.TakeF2Snapshot(TrtDate, keys);
        TestContext.Out.WriteLine("ẢNH CHỤP F2 (chép lại nếu lượt chạy chết giữa chừng): " + _f2Before);

        _db.SetF2(_f2Before.Table, _subject.TrtCd, _subject.TrtSb, 1);
        TestContext.Out.WriteLine(
            $"SEED — {_f2Before.Table}.F2 = 1 cho {_subject.TrtCd}/{_subject.TrtSb}. " +
            $"ĐỐI CHỨNG {_control?.TrtCd.ToString() ?? "(không có)"}/{_control?.TrtSb} giữ F2 = 0.");
    }

    [OneTimeTearDown]
    public void RestoreF2()
    {
        if (_db is null || _f2Before is null) return;
        try { TestContext.Out.WriteLine("ĐÃ TRẢ LẠI — " + _db.RestoreF2(_f2Before)); }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG TRẢ LẠI ĐƯỢC F2: {e.Message}. SỬA TAY theo ảnh chụp: {_f2Before}");
        }
    }

    [SetUp]
    public void TestSetUp() => _flow = new DrugAmountFlow(App, Screen);

    [TearDown]
    public void TestTearDown()
    {
        // Testcase đỏ giữa chừng hay để lại hộp thoại đang mở; testcase sau sẽ đỏ oan
        // với 「không gõ được mã」. Dọn sạch bằng 戻る (⛔ KHÔNG Escape — Escape là 確定).
        try { _flow?.CancelAll(); } catch { /* app có thể đã chết */ }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG1 ↔ 「bung ra với đúng thành phần của 処置変換テーブル và tổng khớp master」
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Hộp thoại bung ra với đúng thành phần của 処置変換テーブル, và 薬価合計/点数 khớp master")]
    [CancelAfter(600_000)]
    public void TcG1_DialogShowsMasterComponents()
    {
        using var trace = TestTrace.Begin();
        var subject = RequireSubject();

        var dlg = RequireDialog(subject, trace);

        var rows = dlg.Rows();
        Assert.That(rows, Has.Count.EqualTo(subject.RowCount),
            $"Số dòng của 薬剤使用量選択 phải bằng số slot dg_cd khác rỗng của mst_drug_rx " +
            $"(frm203020.cs:438-449). Master nói {subject.RowCount}, hộp thoại vẽ {rows.Count}. " +
            $"Đỏ ở đây = getViewData bỏ sót/thêm thành phần. Hộp thoại: {dlg.Describe()}");

        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            var slot = subject.Components[i];

            Assert.That(Norm(row.Name), Is.EqualTo(Norm(slot.DgNm)),
                $"dòng {i}: 薬剤名称 phải là dg_nm của mst_drug (frm203020.cs:443). " +
                "So sau khi NFKC vì lưới in 半角 còn master giữ 全角.");

            Assert.That(Num(row.Cost), Is.EqualTo((double)slot.Cost).Within(0.01),
                $"dòng {i}: 薬価 phải là mst_drug.cost (:444). Đọc ra 「{row.Cost}」.");

            Assert.That(Txt.N(row.Count), Is.EqualTo(Txt.N(slot.Cnt)),
                $"dòng {i}: 使用量 lúc vừa mở phải là cnt của mst_drug_rx (:445) — " +
                "chưa ai click vào đâu cả.");

            Assert.That(Norm(row.Unit), Is.EqualTo(Norm(slot.UnitNm)),
                $"dòng {i}: 単位 phải là unit_nm của mst_drug (:446).");

            Assert.That(Num(row.Sum), Is.EqualTo(DrugAmountDb.RowCost(slot, slot.CntF)).Within(0.01),
                $"dòng {i}: 薬価計. cost_type = 「{slot.CostType}」 ⇒ " +
                (slot.Fixed ? "LẤY NGUYÊN 薬価, KHÔNG nhân 使用量" : "薬価 × 使用量") +
                " (frm203020.cs:409-414).");
        }

        var expectedSum = DrugAmountDb.CostSum(subject);
        Assert.That(Num(dlg.CostSumText()), Is.EqualTo((double)expectedSum).Within(0.01),
            $"薬価合計 = tổng cột 薬価計 (getSum, frm203020.cs:529-551). " +
            $"Đọc ra 「{dlg.CostSumText()}」, oracle nói {expectedSum:0.00}.");

        var expectedPoint = DrugAmountDb.ExpectedPoint(subject);
        Assert.That(dlg.PointSum(), Is.EqualTo(expectedPoint).Within(0.001f),
            $"点数 = getPoint(薬価合計, 1) (:555 → :492-518). Đọc ra 「{dlg.PointSumText()}」.");

        // Kiểm tréo mạnh nhất có được — và cũng là TIỀN ĐỀ của cả cặp parity: ở 使用量
        // MẶC ĐỊNH, 点数 tính từ 薬価 phải TRÙNG mst_trt.score1. Trùng ⇒ hai vế xuất
        // phát từ cùng một số, nên mọi lệch quan sát được sau đó là do 数量.
        Assert.That(expectedPoint, Is.EqualTo((float)subject.Score1).Within(0.001f),
            $"getPoint({expectedSum:0.00}円) ra {expectedPoint:0.##} nhưng " +
            $"{_f2Before?.Table}.SCORE1 = {subject.Score1}. Đỏ ở đây nghĩa là công thức " +
            "15円/10円 chép sai, HOẶC master của mã này vốn đã không tự nhất quán — " +
            "kiểm bằng Tc0_ProbeMasterData (KQ-2) trước khi sửa bất cứ gì.");

        dlg.Cancel(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG2 ↔ 「click vào dòng làm 使用量 +1 và tổng/点数 tính lại (CellClick)」
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Click vào ô 薬剤名称 làm 使用量 +1, 薬価計/薬価合計/点数 tính lại")]
    [CancelAfter(600_000)]
    public void TcG2_ClickRowIncrementsQty()
    {
        using var trace = TestTrace.Begin();
        var subject = RequireSubject();
        var idx = ScalableIndex(subject);

        var dlg = RequireDialog(subject, trace);
        var change = _flow.ClickTimes(dlg, idx, Cfg.ClickTimes, trace);

        var expected = BumpedCounts(subject, idx, Cfg.ClickTimes);

        Assert.That(change.After.Counts[idx], Is.EqualTo(expected[idx]).Within(0.001f),
            $"CellClick cộng 使用量 thêm 1 mỗi lần click, với BẤT KỲ ô nào của dòng " +
            $"(frm203020.cs:303-330). Click {Cfg.ClickTimes} lần trên dòng {idx}: " +
            $"{change}");

        Assert.That(Num(change.After.CostSum), Is.EqualTo((double)DrugAmountDb.CostSum(subject, expected)).Within(0.01),
            $"薬価合計 sau khi click. {change}");

        Assert.That(change.After.Point, Is.EqualTo(DrugAmountDb.ExpectedPoint(subject, expected)).Within(0.001f),
            $"点数 phải được tính LẠI từ 薬価合計 mới, không giữ số cũ (:328 gọi getSum). {change}");

        dlg.Cancel(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG3 ↔ 「dòng 薬価固定 (cost_type 3) không đổi khi click」
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Dòng cost_type '3' (薬価固定): click KHÔNG đổi 使用量, và 薬価計 = 薬価")]
    [CancelAfter(600_000)]
    public void TcG3_FixedCostRowIgnoresClick()
    {
        using var trace = TestTrace.Begin();
        var subject = RequireSubject();

        var idx = subject.Components.ToList().FindIndex(c => c.Fixed);
        if (idx < 0)
            IgnoreWithReason(
                $"{subject.TrtCd}/{subject.TrtSb} không có thành phần cost_type '3'. " +
                "Nhánh 薬価固定 chạy riêng bằng: .\\run-select-drug-amount.ps1 -Seed " +
                "-TrtCd 690 -Case TcG3_FixedCostRowIgnoresClick " +
                "(690/0 「OA(1~2歯) &ｽｷｬﾝﾄﾞﾈｽﾄｶｰﾄﾘｯｼﾞ3%」 — mã 600–699 DUY NHẤT của master " +
                "dev có 2 thành phần, gồm một dòng 薬価固定 và một dòng nhân theo 使用量). " +
                "Cùng lý do và cùng mã với spec Playwright.");

        var slot = subject.Components[idx];
        var dlg = RequireDialog(subject, trace);
        var change = _flow.ClickTimes(dlg, idx, Math.Max(Cfg.ClickTimes, 1), trace);

        Assert.That(change.After.Counts[idx], Is.EqualTo(change.Before.Counts[idx]).Within(0.001f),
            $"CellClick bỏ qua dòng cost_type '3' (frm203020.cs:321 `!= \"3\"`). " +
            $"Dòng {idx} 「{slot.DgNm}」 đáng lẽ đứng yên. {change}");

        var costCell = dlg.Rows()[idx].Sum;
        Assert.That(Num(costCell), Is.EqualTo((double)slot.Cost).Within(0.01),
            $"薬価計 của dòng 薬価固定 = 薬価, KHÔNG nhân 使用量 (:409-411). " +
            $"Đọc ra 「{costCell}」, 薬価 master = {slot.Cost}.");

        dlg.Cancel(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG4 ↔ 「Escape là 確定 — dòng nhận 点数 vừa tính, KHÔNG phải score1」
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Escape = 確定 (KHÔNG phải huỷ): dòng nhận 点数 vừa tính chứ không phải score1")]
    [CancelAfter(600_000)]
    public void TcG4_EscapeIsConfirm()
    {
        using var trace = TestTrace.Begin();
        var subject = RequireSubject();
        var idx = ScalableIndex(subject);

        var dlg = RequireDialog(subject, trace);
        _flow.ClickTimes(dlg, idx, Cfg.ClickTimes, trace);

        var expected = BumpedCounts(subject, idx, Cfg.ClickTimes);
        var expectedPoint = DrugAmountDb.ExpectedPoint(subject, expected);

        // Không phân biệt được thì testcase vô nghĩa — nói thẳng thay vì xanh giả.
        Assert.That(expectedPoint, Is.Not.EqualTo((float)subject.Score1).Within(0.001f),
            $"Sau khi +{Cfg.ClickTimes} mà 点数 vẫn bằng score1 ({subject.Score1}) thì testcase " +
            "này không phân biệt được 「lấy từ hộp thoại」 với 「lấy từ master」. Đổi " +
            "drugAmount.trtCd sang mã có 薬価 lớn hơn.");

        var closed = dlg.ConfirmByEscape(trace);
        Assert.That(closed, Is.True,
            "Escape phải đóng hộp thoại qua btnF9_Click (frm203020.cs:153-155). " +
            "False ở đây thường là HARNESS: phím rơi nhầm form (xem ghi chú dirty gate " +
            "trong ConfirmByEscape), chứ không phải app từ chối Escape.");

        var row = _flow.WaitForDrugRow(FirstDrugName(subject));
        Assert.That(row, Is.Not.Null,
            "Sau 確定, dòng 薬剤 phải rơi xuống lưới. Lưới:\n  " +
            string.Join("\n  ", _flow.Base.DescribeGrid()));

        Assert.That(Txt.Int(row!.Ten), Is.EqualTo((int)expectedPoint),
            $"点 của dòng = data.score của hộp thoại (frm203020.cs:474 → frm203016.cs:1450), " +
            $"KHÔNG phải mst_trt.score1 ({subject.Score1}). Dòng đọc ra: 「{row}」. " +
            "Đỏ với giá trị đúng bằng score1 nghĩa là nhánh ghi đè không chạy.");

        _flow.Base.DismissAll(trace: trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG5 ↔ 「mã đối chứng (f2 = 0) KHÔNG mở dialog — cổng f2 đúng là cổng」
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Mã ĐỐI CHỨNG F2 = 0: hộp thoại KHÔNG mở, và dòng mang đúng score1 của master")]
    [CancelAfter(600_000)]
    public void TcG5_ControlCodeDoesNotOpenDialog()
    {
        using var trace = TestTrace.Begin();
        RequireSubject();

        if (_control is null)
            IgnoreWithReason(
                $"Không tìm ra mã đối chứng {Cfg.ControlTrtCd}/{Cfg.ControlTrtSb} trong master " +
                $"ngày {TrtDate:yyyy-MM-dd} — đặt drugAmount.controlTrtCd sang 薬剤 khác.");

        var control = _control!;
        Assert.That(control.F2, Is.EqualTo(0),
            $"Mã đối chứng phải có F2 = 0 mới làm đối chứng được; {control.TrtCd}/{control.TrtSb} " +
            $"đang là {control.F2}. Đỏ ở đây = chọn nhầm mã, không phải app sai.");

        var row = OpenAndExpectNoDialog(control, trace);

        Assert.That(Txt.Int(row.Ten), Is.EqualTo(control.Score1),
            $"Không qua hộp thoại ⇒ 点 giữ nguyên score1 của master ({control.Score1}) — " +
            $"selRec.intPoint không bị ghi đè (frm203016.cs:1450 nằm trong nhánh F2 == 1). " +
            $"Dòng đọc ra: 「{row}」");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG6 ↔ 「F10 戻る giữ nguyên 点数 mặc định của master (ComParam null)」
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("F10 戻る: thay đổi 使用量 bị VỨT, dòng mang score1 của master")]
    [CancelAfter(600_000)]
    public void TcG6_BackKeepsMasterScore()
    {
        using var trace = TestTrace.Begin();
        var subject = RequireSubject();
        var idx = ScalableIndex(subject);

        var dlg = RequireDialog(subject, trace);

        // Bấm +1 rồi bỏ đi — 戻る phải VỨT thay đổi này.
        _flow.ClickTimes(dlg, idx, Cfg.ClickTimes, trace);

        var pointBefore = _flow.Grid.AllPointValue();
        Assert.That(dlg.Cancel(trace), Is.True,
            "「F10 戻る」 phải đóng hộp thoại (frm203020 btnF10 = 戻る của BaseDialog).");

        var row = _flow.WaitForDrugRow(FirstDrugName(subject));
        Assert.That(row, Is.Not.Null,
            "戻る vẫn để dòng 薬剤 rơi xuống lưới — nó chỉ bỏ phần ghi đè 点数/free_wd. " +
            "Lưới:\n  " + string.Join("\n  ", _flow.Base.DescribeGrid()));

        Assert.That(Txt.Int(row!.Ten), Is.EqualTo(subject.Score1),
            $"戻る ⇒ setPacData KHÔNG chạy (frm203020.cs:179-186 chỉ ở nhánh 確定) ⇒ " +
            $"ComParam vẫn null ⇒ frm203016.cs:1444 không ghi đè ⇒ 点 = score1 = " +
            $"{subject.Score1}. Dòng đọc ra: 「{row}」. Đỏ với đúng con số của hộp thoại " +
            "nghĩa là 戻る đang hành xử như 確定.");

        var pointAfter = _flow.Grid.AllPointValue();
        trace.Note($"月計点数 {pointBefore?.ToString() ?? "?"} → {pointAfter?.ToString() ?? "?"}");

        _flow.Base.DismissAll(trace: trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG7 — gõ thẳng 使用量 (CellValidating). THÊM so với spec Playwright ban đầu.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Gõ thẳng 使用量 vào ô rồi rời ô: CellValidating tính lại 薬価計/合計/点数")]
    [CancelAfter(600_000)]
    public void TcG7_TypedQtyRecalculates()
    {
        using var trace = TestTrace.Begin();
        var subject = RequireSubject();
        var idx = ScalableIndex(subject);

        var typed = Txt.N(Cfg.TypedCount);
        if (typed.Length == 0)
            IgnoreWithReason("drugAmount.typedCount để trống ⇒ không có giá trị nào để gõ.");
        if (!float.TryParse(typed, out var typedF))
            IgnoreWithReason($"drugAmount.typedCount = 「{typed}」 không phải số — " +
                             "ô 使用量 chỉ nhận chữ số và dấu chấm (ComLibrary.NumAndPeriod_KeyPress).");

        var dlg = RequireDialog(subject, trace);
        var change = _flow.TypeCount(dlg, idx, typed, trace);

        var expected = subject.BaseCounts.ToList();
        expected[idx] = typedF;

        Assert.That(change.After.Counts[idx], Is.EqualTo(typedF).Within(0.001f),
            $"Gõ chữ số vào ô 使用量 phải GHI ĐÈ giá trị cũ (DataGridView EditOnKeystrokeOrF2), " +
            $"rồi Tab để rời ô cho CellValidating chạy (frm203020.cs:269-301). {change}\n" +
            "⚠️ Đỏ ở đây kiểm HARNESS trước: ↓ không rời được ô khi lưới chỉ MỘT dòng, và " +
            "F2 bị formBase_KeyDown nuốt (:138-140) — cả hai đã trả giá 2026-09-09.");

        Assert.That(Num(change.After.CostSum), Is.EqualTo((double)DrugAmountDb.CostSum(subject, expected)).Within(0.01),
            $"薬価合計 sau khi gõ 使用量 = 「{typed}」. CellValidating đặt lại ô 薬価計 " +
            $"(:296) rồi gọi getSum (:297). {change}");

        Assert.That(change.After.Point, Is.EqualTo(DrugAmountDb.ExpectedPoint(subject, expected)).Within(0.001f),
            $"点数 tính lại từ 薬価合計 mới. {change}");

        dlg.Cancel(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcG8 — free_wd quay lại ô 療法・処置. THÊM so với spec Playwright ban đầu.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("確定 ⇒ free_wd dựng lại ô 療法・処置 với 数量 MỚI và 単位 rút gọn")]
    [CancelAfter(600_000)]
    public void TcG8_FreeWdRebuildsRowText()
    {
        using var trace = TestTrace.Begin();
        var subject = RequireSubject();
        var idx = ScalableIndex(subject);

        var typed = Txt.N(Cfg.TypedCount);
        if (!float.TryParse(typed, out var typedF))
            IgnoreWithReason($"drugAmount.typedCount = 「{typed}」 phải là một con số để đo " +
                             "được vòng free_wd.");

        var dlg = RequireDialog(subject, trace);
        _flow.TypeCount(dlg, idx, typed, trace);

        var expected = subject.BaseCounts.ToList();
        expected[idx] = typedF;
        var expectedPoint = DrugAmountDb.ExpectedPoint(subject, expected);

        var commit = _flow.Confirm(dlg, FirstDrugName(subject), trace);
        Assert.That(commit.Confirmed, Is.True, "「F9 確定」 phải đóng hộp thoại.");
        Assert.That(commit.Row, Is.Not.Null,
            "Sau 確定, dòng 薬剤 phải rơi xuống lưới. Lưới:\n  " +
            string.Join("\n  ", _flow.Base.DescribeGrid()));

        var row = commit.Row!;
        var unit = subject.Components[idx].UnitNm;
        var amounts = DrugAmountFlow.AmountsInRowText(row.Ryo, unit);

        Assert.That(amounts, Does.Contain(DrugAmountDb.Fmt(typedF)),
            $"Ô 療法・処置 phải in ra 数量 MỚI. free_wd đi vào ô ẩn cột 72 " +
            $"(frm203016.cs:1451) rồi ModSave.getDrugName dựng lại tên thuốc từ chính nó " +
            $"(:1462 → EditControl.cs:1049-1055). Đọc ra 「{Txt.Vis(row.Ryo)}」, " +
            $"tìm 数量 [{string.Join(",", amounts)}], mong đợi có 「{DrugAmountDb.Fmt(typedF)}」.\n" +
            $"⚠️ 単位 trên lưới bị RÚT GỌN: 「{unit}」 in ra là 「{DrugAmountFlow.ShortUnit(unit)}」 " +
            "(editDrugUnitToShortUnit, EditControl.cs:1160-1190) — dò bằng 単位 gốc là trượt.");

        Assert.That(amounts, Does.Not.Contain(DrugAmountDb.Fmt(subject.Components[idx].CntF)),
            $"Ô 療法・処置 KHÔNG được còn 数量 GỐC của master " +
            $"(「{DrugAmountDb.Fmt(subject.Components[idx].CntF)}」) — còn nghĩa là free_wd " +
            "chưa tới editDrugName. Đọc ra 「" + Txt.Vis(row.Ryo) + "」");

        Assert.That(Txt.Int(row.Ten), Is.EqualTo((int)expectedPoint),
            $"点 của dòng = 点数 của hộp thoại lúc 確定 ({expectedPoint:0.##}), không phải " +
            $"score1 ({subject.Score1}). Dòng: 「{row}」");

        Assert.That(Txt.Int(row.Kai), Is.EqualTo(subject.GCnt),
            $"回 giữ nguyên g_cnt của master ({subject.GCnt}) — 数量 và 回数 là HAI thứ " +
            $"khác nhau, hộp thoại chỉ đụng 数量 (modMain.cs:410-413). Dòng: 「{row}」");

        // Mốc NGOÀI lưới (F12): 月計点数 phải nhích đúng 点 × 回.
        var delta = commit.PointDelta;
        if (delta is not null)
            Assert.That(delta, Is.EqualTo((int)expectedPoint * subject.GCnt),
                $"月計点数 phải tăng đúng 点 × 回 = {expectedPoint:0.##} × {subject.GCnt}. " +
                $"{commit}. Mốc này nằm NGOÀI lưới nên không trôi theo cuộn (F12).");
        else
            trace.Note("khong doc duoc lbAllPoint — bo qua moc 月計点数");

        _flow.Base.DismissAll(trace: trace);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dùng chung
    // ─────────────────────────────────────────────────────────────────────────

    private DrugAmountDb.DrugCandidate RequireSubject()
    {
        if (_db is null)
            IgnoreWithReason($"Không đọc được SQL Server — kỳ vọng của fixture này tính từ " +
                             $"master nên không có DB thì không assert được gì.");
        if (_subject is null)
            IgnoreWithReason($"{Cfg.TrtCd}/{Cfg.TrtSb} không có mst_drug_rx phủ ngày " +
                             $"{TrtDate:yyyy-MM-dd} ⇒ hộp thoại sẽ mở rỗng rồi tự đóng kèm " +
                             $"「{DrugAmountDialog.NoRowsFragment}」 (frm203020.cs:119-123).");
        if (_subject!.RowCount == 0)
            IgnoreWithReason($"{_subject.TrtCd}/{_subject.TrtSb} không có thành phần 薬剤 nào — " +
                             "đặt drugAmount.trtCd sang mã khác.");
        return _subject;
    }

    /// <summary>Chỉ số dòng ĐẦU TIÊN nhân theo 使用量 (không phải 薬価固定).</summary>
    private int ScalableIndex(DrugAmountDb.DrugCandidate c)
    {
        var idx = c.Components.ToList().FindIndex(x => !x.Fixed);
        if (idx < 0)
            IgnoreWithReason($"{c.TrtCd}/{c.TrtSb} chỉ có dòng cost_type '3' — không có gì để " +
                             "đổi 使用量. Đặt drugAmount.trtCd sang mã khác.");
        return idx;
    }

    private static IReadOnlyList<float> BumpedCounts(DrugAmountDb.DrugCandidate c, int idx, int times) =>
        c.BaseCounts.Select((v, i) => i == idx ? v + times : v).ToList();

    /// <summary>Mở hộp thoại trên một dòng trống của ngày test; không mở được thì đỏ ngay.</summary>
    private DrugAmountDialog RequireDialog(DrugAmountDb.DrugCandidate c, TestTrace trace)
    {
        var row = _flow.BlankRowOn(TrtDate.Day, trace);
        Assert.That(row, Is.Not.Null,
            $"Không có dòng trống nào của ngày {TrtDate.Day} để gõ mã — HARNESS hỏng, sửa " +
            "trước khi đọc bất cứ kết luận nào về app. Lưới:\n  " +
            string.Join("\n  ", _flow.Base.DescribeGrid()));

        var open = _flow.OpenDialog(row!, c.TrtCd, c.TrtSb, trace);
        Assert.That(open.DialogOpened, Is.True,
            $"薬剤使用量選択 phải bung ra cho {c.TrtCd}/{c.TrtSb} vì fixture đã bật " +
            $"mst_trt.F2 = 1 (cửa duy nhất, frm203016.cs:1426). {open}\n" +
            "Kiểm theo thứ tự: (1) seed có chạy không — xem dòng 「SEED —」 ở đầu log; " +
            "(2) có hộp thoại lạ nào chắn không — xem ảnh 「khong-mo-203020」; " +
            "(3) dataLineSource của singleton frm203016 có dính ID210002 không (README §5.5).");
        return open.Dialog!;
    }

    /// <summary>Gõ mã và khẳng định hộp thoại KHÔNG mở; trả về dòng đã rơi xuống lưới.</summary>
    private RegiRow OpenAndExpectNoDialog(DrugAmountDb.DrugCandidate c, TestTrace trace)
    {
        var blank = _flow.BlankRowOn(TrtDate.Day, trace);
        Assert.That(blank, Is.Not.Null, "Không có dòng trống nào để gõ mã — HARNESS hỏng.");

        var open = _flow.OpenDialog(blank!, c.TrtCd, c.TrtSb, trace);
        Assert.That(open.DialogOpened, Is.False,
            $"薬剤使用量選択 KHÔNG được mở cho mã có F2 = 0 ({c.TrtCd}/{c.TrtSb}). Mở ra " +
            "nghĩa là cửa mở hộp thoại KHÔNG phải F2 — và khi đó mọi testcase khác của " +
            $"fixture này xanh mà chẳng chứng minh được gì. {open}");

        var row = _flow.WaitForDrugRow(FirstDrugName(c));
        Assert.That(row, Is.Not.Null,
            $"Mã {c.TrtCd} phải rơi thẳng xuống lưới, không qua hộp thoại nào. Lưới:\n  " +
            string.Join("\n  ", _flow.Base.DescribeGrid()));
        return row!;
    }

    private static string FirstDrugName(DrugAmountDb.DrugCandidate c) =>
        c.Components.Count > 0 ? c.Components[0].DgNm : c.TrtNm;

    /// <summary>NFKC + gộp khoảng trắng — lưới in 半角 còn master giữ 全角 (F23).</summary>
    private static string Norm(string? s) => AutoSanteiChkAuto.AutoSanteiOps.Norm(s);

    /// <summary>Số từ một ô đã qua CellFormatting (nó chen dấu cách vào mọi ô, :195-207).</summary>
    private static double Num(string? cell) =>
        double.TryParse(Txt.N(cell), out var d) ? d : double.NaN;
}
