using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugAmountSelect;

/// <summary>
/// PROBE — dò hành vi THẬT của <b>薬剤使用量選択 (frm203020)</b>. <b>KHÔNG assert</b>,
/// không bao giờ ném. <c>[Explicit]</c> nên lượt chạy đủ không gọi tới.
///
/// <para>Đúng luật F1: chưa ai từng mở được hộp thoại này trên máy thật — dữ liệu dev có
/// <b>0</b> dòng <c>mst_trt.F2 = 1</c> — nên mọi assert viết bây giờ đều là phỏng đoán.
/// Probe trả lời trước, testcase viết sau.</para>
///
/// ─── 11 câu hỏi, và vì sao đoán sai cái nào cũng hỏng testcase ───────────────
/// <list type="number">
/// <item><b>KQ-1</b> Bảng master có sẵn dòng <c>F2 = 1</c> nào không (hàng rào trước seed).</item>
/// <item><b>KQ-2</b> Oracle <c>getPoint</c> có trùng <c>SCORE1</c> ở 数量 mặc định không —
///   nếu KHÔNG thì hai vế parity đã lệch sẵn từ master, mọi so sánh sau đó vô nghĩa.</item>
/// <item><b>KQ-3</b> Gõ mã một 枝番: 処置選択 có hiện không? (source nói KHÔNG —
///   modMain.cs:474 — nhưng đó là suy luận, chưa đo.)</item>
/// <item><b>KQ-4</b> Hộp thoại mở ra hình dạng gì: mấy dòng, mấy ô mỗi dòng, nguyên văn
///   từng ô. <c>CellFormatting</c> chen một dấu cách vào MỌI ô (:195-207) nên chuỗi đọc
///   ra KHÔNG bằng số trong DB — assert 「nguyên văn」 mà không biết điều này là đỏ oan.</item>
/// <item><b>KQ-5</b> 薬価合計 / 点数 lúc vừa mở — có bằng oracle, có bằng <c>score1</c>?</item>
/// <item><b>KQ-6</b> Nút thật trên hộp thoại tên gì (F16/F18 — 「F9 確定」/「F10 戻る」?).</item>
/// <item><b>KQ-7</b> Click MỘT lần vào ô 薬剤名称 có làm 使用量 +1 không (:303-330) —
///   tức là click để 「chọn dòng」 cũng đã đổi dữ liệu.</item>
/// <item><b>KQ-8</b> Gõ thẳng số vào ô 使用量 rồi rời ô — <c>CellValidating</c> ăn không.</item>
/// <item><b>KQ-9</b> 確定 xong, ô 療法・処置 của lưới in ra 数量 MỚI hay 数量 CŨ, và
///   月計点数 nhích bao nhiêu.</item>
/// <item><b>KQ-10</b> Mở lại LẦN HAI trong cùng phiên app — còn mở được không?
///   <c>dataLineSource</c> là field của singleton và KHÔNG có chỗ nào đặt lại
///   (frm203016.cs:55, frm203002.cs:8804).</item>
/// <item><b>KQ-11</b> Mã ĐỐI CHỨNG (<c>F2</c> vẫn 0) — hộp thoại KHÔNG mở, đúng không.</item>
/// </list>
///
/// <para>Chạy: <c>.\run-select-drug-amount.ps1 -Probe</c> (từng <c>-Case</c> một, F7).</para>
/// </summary>
[TestFixture]
[Category("drug-amount-select")]
[Explicit("PROBE — chạy tay, không assert")]
[NonParallelizable]
public sealed class DrugAmountProbeTests : UiTestBase
{
    private DrugAmountDb? _db;
    private DrugAmountDb.F2Snapshot? _f2Before;
    private DrugAmountDb.DrugCandidate? _subject;
    private DrugAmountDb.DrugCandidate? _control;
    private DrugAmountFlow _flow = null!;

    private TestSettings.DrugAmountSection Cfg => Settings.DrugAmount;

    /// <summary>
    /// Tắt watcher. Nó tự bấm 「いいえ」 cho những câu khai trong <c>run.nuisanceDialogs</c>,
    /// và probe này đang ĐO CHÍNH các hộp thoại bung ra quanh lượt nhập 処置 — để watcher
    /// trả lời hộ thì probe kết luận 「app không hỏi」 trong khi app có hỏi.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>
    /// Fixture tự loại mình TRƯỚC khi app được mở khi chưa bật cờ seed — mở app rồi mới
    /// Ignore là mất hàng chục giây cho một fixture không đo gì.
    /// </summary>
    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.DrugAmount.AllowSeed)
            return "drugAmount.allowSeed = false. Dữ liệu dev có 0 dòng mst_trt.F2 = 1 nên " +
                   "薬剤使用量選択 KHÔNG BAO GIỜ mở — chạy mà không seed thì mọi câu KQ đều rỗng. " +
                   "Bật cờ (hoặc OCHA_DRUG_AMOUNT_ALLOW_SEED=1) rồi chạy lại.";
        return null;
    }

    /// <summary>
    /// Bật <c>F2 = 1</c> TRƯỚC khi app mở.
    ///
    /// <para><c>frmTrtSel_Let_Trt_Data</c> đọc <c>MstTrt.getMstTrtData</c> bằng một
    /// connection mở tại chỗ (frm203016.cs:1409-1414) nên về lý seed sau cũng được. Vẫn
    /// seed ở đây vì đó là chỗ DUY NHẤT chắc chắn chạy trước mọi thứ, và vì luật F20 bảo
    /// chụp nguyên trạng trước khi đặt mốc — làm ở đây thì không có cách nào làm ngược.</para>
    /// </summary>
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
        var already = _db.CountF2Enabled(table);
        TestContext.Out.WriteLine($"HÀNG RÀO — {table} đang có {already} dòng F2 = 1 " +
                                  "(0 = đúng như dữ liệu dev đo được 2026-09-09).");

        _subject = Cfg.TrtCd > 0
            ? _db.Candidate(TrtDate, Cfg.TrtCd, Cfg.TrtSb)
            : _db.DefaultCandidate(TrtDate);
        _control = _db.Candidate(TrtDate, Cfg.ControlTrtCd, Cfg.ControlTrtSb);

        if (_subject is null)
        {
            TestContext.Out.WriteLine(
                $"KHÔNG seed được: {Cfg.TrtCd}/{Cfg.TrtSb} không có mst_drug_rx phủ ngày " +
                $"{TrtDate:yyyy-MM-dd} ⇒ hộp thoại sẽ mở ra rỗng rồi tự đóng kèm " +
                $"「{DrugAmountDialog.NoRowsFragment}」 (frm203020.cs:119-123).");
            return;
        }

        // ⚠️ CHỤP TRƯỚC KHI GHI (F20). Chụp sau là chụp phải chính cái mốc mình vừa đặt.
        var keys = _control is null
            ? new[] { (_subject.TrtCd, _subject.TrtSb) }
            : [(_subject.TrtCd, _subject.TrtSb), (_control.TrtCd, _control.TrtSb)];
        _f2Before = _db.TakeF2Snapshot(TrtDate, keys);
        TestContext.Out.WriteLine("ẢNH CHỤP F2 (chép lại nếu lượt chạy chết giữa chừng): " + _f2Before);

        var n = _db.SetF2(_f2Before.Table, _subject.TrtCd, _subject.TrtSb, 1);
        TestContext.Out.WriteLine(
            $"SEED — {_f2Before.Table}.F2 = 1 cho {_subject.TrtCd}/{_subject.TrtSb} ({n} dòng). " +
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
    public void ProbeSetUp() => _flow = new DrugAmountFlow(App, Screen);

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — CHỈ ĐỌC DB, không đụng giao diện. Chạy đầu tiên, rẻ nhất.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE dữ liệu — master có gì, oracle getPoint có khớp SCORE1 không")]
    [CancelAfter(180_000)]
    public void Tc0_ProbeMasterData()
    {
        if (_db is null) { Kq(0, "không đọc được DB — mọi câu sau đều rỗng."); return; }

        // ── KQ-1: hàng rào ───────────────────────────────────────────────────
        Say(() =>
        {
            var table = _db.ActiveTrtTable(TrtDate);
            Kq(1, $"bảng master áp dụng cho {TrtDate:yyyy-MM-dd} là 「{table}」, " +
                  $"đang có {_db.CountF2Enabled(table)} dòng F2 = 1 (đã tính cả dòng probe vừa seed).");
        });

        // ── KQ-2: oracle vs SCORE1 ───────────────────────────────────────────
        // Đây là câu quyết định cả bộ parity. getPoint(薬価合計 mặc định) PHẢI bằng
        // score1, vì bản web trả thẳng score1 (ResolveDrugHandler.cs:33). Trùng ⇒ ở 数量
        // mặc định hai bên nói cùng một số, và mọi lệch quan sát được sau đó là do 数量.
        Say(() =>
        {
            var bad = _db.ScoreOracleMismatches(TrtDate);
            Kq(2, bad.Count == 0
                ? "getPoint(薬価合計 ở 数量 MẶC ĐỊNH) == SCORE1 cho MỌI mã thuốc còn hiệu lực " +
                  "⇒ hai vế parity trùng khít ở điểm xuất phát."
                : $"{bad.Count} mã LỆCH ngay ở 数量 mặc định — parity đã hỏng từ master:");
            foreach (var b in bad) Kq(2, "        " + b);
        });

        // ── KQ-2b: ứng viên đã chọn ──────────────────────────────────────────
        Say(() =>
        {
            Kq(2, "ĐỐI TƯỢNG  = " + (_subject?.ToString() ?? "KHÔNG TÌM RA"));
            Kq(2, "ĐỐI CHỨNG = " + (_control?.ToString() ?? "KHÔNG TÌM RA"));
            if (_subject is null) return;

            foreach (var c in _subject.Components) Kq(2, "        thành phần: " + c);
            var baseCounts = _subject.BaseCounts;
            Kq(2, $"        ở 数量 mặc định [{string.Join(",", baseCounts)}]: " +
                  $"薬価合計 = {DrugAmountDb.ExpectedCostText(_subject)} · " +
                  $"点数 = {DrugAmountDb.ExpectedPoint(_subject):0.####} · " +
                  $"free_wd = 「{DrugAmountDb.ExpectedFreeWd(_subject, baseCounts)}」 · " +
                  $"score1 = {_subject.Score1}");

            var plus = baseCounts.Select((v, i) => i == 0 ? v + Cfg.ClickTimes : v).ToList();
            Kq(2, $"        sau {Cfg.ClickTimes} cú click vào dòng 0 ⇒ [{string.Join(",", plus)}]: " +
                  $"薬価合計 = {DrugAmountDb.ExpectedCostText(_subject, plus)} · " +
                  $"点数 = {DrugAmountDb.ExpectedPoint(_subject, plus):0.####} · " +
                  $"free_wd = 「{DrugAmountDb.ExpectedFreeWd(_subject, plus)}」");
            Kq(2, $"        ⇒ ĐÂY chính là điểm lệch parity: WinForm ra " +
                  $"{DrugAmountDb.ExpectedPoint(_subject, plus):0.####} điểm, " +
                  $"bản web vẫn trả score1 = {_subject.Score1} (ResolveDrugHandler.cs:33).");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — MỘT vòng giao diện: mở hộp thoại, đọc hình dạng, huỷ bằng 戻る.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE hình dạng — 処置選択 có hiện không, hộp thoại trông ra sao, nút tên gì")]
    [CancelAfter(600_000)]
    public void Tc1_ProbeOpenAndShape()
    {
        using var trace = TestTrace.Begin();
        if (_subject is null) { Kq(3, "không có ứng viên — bỏ qua."); return; }

        var open = OpenOnBlankRow(_subject, trace);

        // ── KQ-3: 処置選択 có hiện không ─────────────────────────────────────
        Say(() => Kq(3, $"gõ mã {_subject.TrtCd} (có {_subject.SbCount} 枝番 trong master) ⇒ " +
                        (open.PickerShown
                            ? "処置選択 CÓ hiện (nhánh intRowCnt > 1, modMain.cs:485)"
                            : "処置選択 KHÔNG hiện — đúng như đọc từ modMain.cs:474 " +
                              "(frm203016_Hide_Let_Trt_Data chạy rồi Close mà chưa từng hiện)") +
                        $" · toàn bộ: {open}"));

        if (open.Dialog is not { } dlg)
        {
            Kq(4, "薬剤使用量選択 KHÔNG mở ⇒ mọi câu KQ-4..KQ-9 rỗng. " +
                  "Xem ảnh 「khong-mo-203020」 và dòng Win32 trong trace TRƯỚC khi đổ cho app.");
            _flow.CancelAll(trace);
            return;
        }

        // ── KQ-4: hình dạng lưới, NGUYÊN VĂN từng ô ─────────────────────────
        // CellFormatting chen dấu cách vào mọi ô (:195-207) nên chuỗi đọc ra không bằng
        // số trong DB. In cả bản nguyên văn lẫn bản đã chuẩn hoá để so.
        Say(() =>
        {
            var rows = dlg.Rows();
            Kq(4, $"lưới có {rows.Count} dòng (master nói {_subject.RowCount} thành phần).");
            foreach (var r in rows)
            {
                Kq(4, $"        [{r.Index}] {r}");
                Kq(4, $"              nguyên văn: [{string.Join("] [", r.Raw)}]");
            }
        });

        // ── KQ-5: 薬価合計 / 点数 lúc vừa mở ────────────────────────────────
        Say(() =>
        {
            var state = DrugAmountFlow.Capture(dlg);
            Kq(5, $"vừa mở: {state}");
            Kq(5, $"        oracle nói 薬価合計 = 「{DrugAmountDb.ExpectedCostText(_subject)}」 · " +
                  $"点数 = 「{DrugAmountDb.ExpectedPoint(_subject):0.####}」 · score1 = {_subject.Score1}");
        });

        // ── KQ-6: nút thật tên gì (F16/F18) ─────────────────────────────────
        Say(() => Kq(6, "nút đọc được trên hộp thoại: [" + string.Join(", ", dlg.ButtonNames()) + "]"));

        // ── KQ-11a: 戻る có ghi gì ngược về lưới không ───────────────────────
        Say(() =>
        {
            var before = _flow.Grid.AllPointValue();
            var closed = dlg.Cancel(trace);
            _flow.CancelAll(trace);
            var after = _flow.Grid.AllPointValue();
            Kq(11, $"bấm 「F10 戻る」: hộp thoại đóng = {closed} · 月計点数 {before?.ToString() ?? "?"} → " +
                   $"{after?.ToString() ?? "?"} (setPacData chỉ chạy ở nhánh 確定, :183 ⇒ mong đợi KHÔNG đổi)");
            var row = _flow.FindDrugRow(FirstDrugName(_subject));
            Kq(11, "        dòng thuốc trên lưới sau khi huỷ: " + (row?.ToString() ?? "KHÔNG CÓ"));
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — MỘT vòng: mở, click, gõ, 確定, đọc lại lưới.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE đổi 数量 — click có +1 không, gõ có ăn không, 確定 đẩy gì về lưới")]
    [CancelAfter(600_000)]
    public void Tc2_ProbeChangeAmount()
    {
        using var trace = TestTrace.Begin();
        if (_subject is null) { Kq(7, "không có ứng viên — bỏ qua."); return; }

        var open = OpenOnBlankRow(_subject, trace);
        if (open.Dialog is not { } dlg)
        {
            Kq(7, "薬剤使用量選択 KHÔNG mở ⇒ KQ-7..KQ-9 rỗng. " + open);
            _flow.CancelAll(trace);
            return;
        }

        // ── KQ-7: click MỘT lần có +1 không ─────────────────────────────────
        Say(() =>
        {
            var change = _flow.ClickTimes(dlg, 0, Cfg.ClickTimes, trace);
            Kq(7, $"{Cfg.ClickTimes} cú click vào ô 薬剤名称 dòng 0: {change}");
            Kq(7, $"        Δ使用量 = [{string.Join(",", change.CountDeltas.Select(d => d.ToString("0.####")))}] " +
                  $"(CellClick cộng 1 mỗi lần, trần 255 — frm203020.cs:321-329)");
            var expected = _subject.BaseCounts.Select((v, i) => i == 0 ? v + Cfg.ClickTimes : v).ToList();
            Kq(7, $"        oracle nói lẽ ra 薬価合計 = 「{DrugAmountDb.ExpectedCostText(_subject, expected)}」 · " +
                  $"点数 = 「{DrugAmountDb.ExpectedPoint(_subject, expected):0.####}」");
        });

        // ── KQ-8: gõ thẳng vào ô 使用量 ─────────────────────────────────────
        Say(() =>
        {
            if (Txt.N(Cfg.TypedCount).Length == 0)
            {
                Kq(8, "drugAmount.typedCount để trống ⇒ bỏ qua nhánh CellValidating.");
                return;
            }
            var change = _flow.TypeCount(dlg, 0, Cfg.TypedCount, trace);
            Kq(8, $"gõ 使用量 = 「{Cfg.TypedCount}」 rồi rời ô: {change}");

            var typed = new List<float> { float.TryParse(Cfg.TypedCount, out var f) ? f : 0f };
            typed.AddRange(_subject.BaseCounts.Skip(1));
            Kq(8, $"        oracle nói lẽ ra 薬価合計 = 「{DrugAmountDb.ExpectedCostText(_subject, typed)}」 · " +
                  $"点数 = 「{DrugAmountDb.ExpectedPoint(_subject, typed):0.####}」 · " +
                  $"free_wd = 「{DrugAmountDb.ExpectedFreeWd(_subject, typed)}」");
        });

        // ── KQ-9: 確定 đẩy gì về lưới ────────────────────────────────────────
        Say(() =>
        {
            var final = DrugAmountFlow.Capture(dlg);
            var commit = _flow.Confirm(dlg, FirstDrugName(_subject), trace);
            Kq(9, $"trạng thái hộp thoại lúc bấm 確定: {final}");
            Kq(9, $"sau 確定: {commit}");
            Kq(9, "        ô 療法・処置 của dòng thuốc: 「" + Txt.Vis(commit.Row?.Ryo) + "」");

            var unit = _subject.Components.Count > 0 ? _subject.Components[0].UnitNm : "";
            var amounts = DrugAmountFlow.AmountsInRowText(commit.Row?.Ryo, unit);
            Kq(9, $"        数量 đọc ra từ ô đó (đơn vị 「{unit}」): [{string.Join(",", amounts)}] · " +
                  $"数量 GỐC của master là 「{DrugAmountDb.ExpectedFreeWd(_subject, _subject.BaseCounts)}」 " +
                  "⇒ khác gốc nghĩa là free_wd ĐÃ đi qua editDrugName (EditControl.cs:1049-1055).");
            Kq(9, $"        月計点数 Δ = {commit.PointDelta?.ToString() ?? "?"} " +
                  $"(mong đợi = 点数 hộp thoại × 回数 của dòng)");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc3 — HAI vòng: mở lại lần hai, rồi mã đối chứng. Đúng trần F7.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE bẫy phiên — mở lại lần 2 còn được không, và mã đối chứng F2=0")]
    [CancelAfter(600_000)]
    public void Tc3_ProbeReopenAndControl()
    {
        using var trace = TestTrace.Begin();
        if (_subject is null) { Kq(10, "không có ứng viên — bỏ qua."); return; }

        // ── KQ-10: mở lại LẦN HAI trong cùng phiên app ──────────────────────
        // frm203016.Instance là SINGLETON và dataLineSource không có chỗ nào đặt lại
        // (frm203016.cs:55, chỗ gán duy nhất là frm203002.cs:8804). Nếu instance sống sót
        // qua Close() thì lần thứ hai có thể im lặng không mở. Phải đo, không đoán.
        Say(() =>
        {
            var open = OpenOnBlankRow(_subject, trace);
            Kq(10, $"lượt mở thứ HAI trong cùng phiên app: {open}");
            if (open.Dialog is { } d)
            {
                Kq(10, "        " + d.Describe());
                d.Cancel(trace);
            }
            else
            {
                Kq(10, "        ⚠️ KHÔNG mở lại được. Nghi phạm số một: dataLineSource của " +
                       "singleton frm203016 (frm203016.cs:1427) — nhưng chỉ kết luận được " +
                       "khi lượt ĐẦU trong cùng fixture đã mở được.");
            }
            _flow.CancelAll(trace);
        });

        // ── KQ-11: mã ĐỐI CHỨNG, F2 vẫn 0 ───────────────────────────────────
        // Deadline NGẮN có chủ ý (F2): đang đo xem hộp thoại KHÔNG tồn tại, chờ lâu là
        // mua thời gian bằng không có gì.
        Say(() =>
        {
            if (_control is null) { Kq(11, "không có mã đối chứng — bỏ qua."); return; }

            var open = OpenOnBlankRow(_control, trace);
            Kq(11, $"ĐỐI CHỨNG {_control.TrtCd}/{_control.TrtSb} (F2 = 0): {open}");
            Kq(11, open.DialogOpened
                ? "        ⚠️ hộp thoại VẪN mở với F2 = 0 ⇒ điều kiện mở KHÔNG phải F2, " +
                  "đọc lại frm203016.cs:1426 trước khi viết bất cứ assert nào."
                : "        đúng như mong đợi: F2 = 0 ⇒ không mở ⇒ cửa mở hộp thoại đúng là F2.");
            _flow.CancelAll(trace);
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc4 — HAI vòng: click ở hộp thoại thứ NHẤT, rồi click ở hộp thoại thứ HAI.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("PROBE — CellClick còn ăn ở lượt mở THỨ HAI trong cùng phiên app không")]
    [CancelAfter(600_000)]
    public void Tc4_ProbeClickOnSecondDialog()
    {
        using var trace = TestTrace.Begin();
        if (_subject is null) { Kq(12, "không có ứng viên — bỏ qua."); return; }

        // Câu hỏi này sinh ra từ một lượt chạy THẬT 2026-09-09: DrugAmountTests chạy cả
        // fixture thì TcG2 (click +1) ĐỎ, mà chạy MỘT MÌNH thì XANH. Khác biệt duy nhất
        // là TcG1 đã mở-rồi-đóng một hộp thoại TRƯỚC đó trong cùng phiên app.
        // frm203020 là SINGLETON (_instance, frm203020.cs:81-91) nên lượt thứ hai dùng
        // lại đúng form cũ. Probe này đo thẳng câu đó, KHÔNG assert.
        for (var round = 1; round <= 2; round++)
        {
            var r = round;
            Say(() =>
            {
                var open = OpenOnBlankRow(_subject, trace);
                if (open.Dialog is not { } d)
                {
                    Kq(12, $"lượt {r}: hộp thoại KHÔNG mở — {open}");
                    _flow.CancelAll(trace);
                    return;
                }

                var before = DrugAmountFlow.Capture(d);
                var change = _flow.ClickTimes(d, 0, 1, trace);
                Kq(12, $"lượt {r} (hộp thoại thứ {r} của phiên app): {change}");
                Kq(12, $"        Δ使用量 = [{string.Join(",", change.CountDeltas.Select(x => x.ToString("0.####")))}] " +
                       (change.CountDeltas.Count > 0 && Math.Abs(change.CountDeltas[0]) < 0.001f
                           ? "⇒ CellClick KHÔNG ăn ở lượt này"
                           : "⇒ CellClick ăn bình thường"));
                Kq(12, $"        ô đang giữ con trỏ sau click: 「{_flow.Grid.FocusedCellName()}」");
                d.Cancel(trace);
                _flow.CancelAll(trace);
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Chèn/tìm một dòng trống của ngày test rồi gõ mã lên đó.</summary>
    private DrugAmountFlow.OpenResult OpenOnBlankRow(DrugAmountDb.DrugCandidate c, TestTrace trace)
    {
        var row = _flow.BlankRowOn(TrtDate.Day, trace);
        if (row is null)
        {
            trace.Note("khong co dong trong de go ma. Luoi:\n  " +
                       string.Join("\n  ", _flow.Base.DescribeGrid()));
            return new DrugAmountFlow.OpenResult(false, false, false, null, []);
        }
        return _flow.OpenDialog(row, c.TrtCd, c.TrtSb, trace);
    }

    /// <summary>Tên thuốc của thành phần đầu — mốc dò dòng trên <c>grdRegi</c>.</summary>
    private static string FirstDrugName(DrugAmountDb.DrugCandidate c) =>
        c.Components.Count > 0 ? c.Components[0].DgNm : c.TrtNm;

    private static void Say(Action step)
    {
        try { step(); }
        catch (Exception e) { TestContext.Out.WriteLine($"        !! bước probe ném: {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>Dòng kết quả — runner lọc theo tiền tố này ra file <c>*-KQ.txt</c>.</summary>
    private static void Kq(int no, string what) => TestContext.Out.WriteLine($"=== KQ-{no} === {what}");
}
