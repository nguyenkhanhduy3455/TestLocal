using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// PROBE của luồng <c>exit_flg</c> — <b>KHÔNG ASSERT</b>, chỉ chụp ảnh và in
/// <c>=== KQ-n ===</c>. Bước 2 của vòng làm việc F1, và là thứ phải chạy TRƯỚC
/// <see cref="CmtPackExitFlgUiTests"/>.
///
/// <para>Ba câu probe này đi tìm, theo thứ tự:</para>
/// <list type="number">
///   <item><b>Hộp thoại 摘要選択 của <c>I017</c> trông ra sao trên máy thật?</b> 12 候補 có
///     nằm trọn trong khung nhìn không — nếu không thì cú click vào 番号 10/11/12 rơi vào hư
///     không (F10) và TCX-7 sẽ 「xanh sai」. Đây là câu <b>quan trọng nhất</b>: nó quyết định
///     ca UI nào dựng được.</item>
///   <item><b>Chuỗi hộp thoại của <c>108/4</c> gồm những gì, theo thứ tự nào?</b></item>
///   <item><b>§C1 — thứ tự dòng 摘要 màu magenta.</b> Source nói dòng 摘要 chèn TRƯỚC dòng
///     カルテ, ảnh chụp của người dùng lại cho thấy nó nằm CUỐI. Gõ 歯清 <c>108/2</c> — mã
///     vừa có <c>CMTAUTO</c> vừa có pack — rồi in NGUYÊN thứ tự dòng trong lưới.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// Probe <b>KHÔNG bấm F9 登録</b>, không seed. Đóng màn hình mà trả lời 「いいえ」 cho
/// 「保存しますか」 là sạch. ⚠️ Đừng bấm 「はい」 — <c>modSave.SaveData</c> xoá sạch rồi chèn
/// lại TOÀN BỘ 処置行 của tháng.
///
/// <para><b>Chạy:</b> <c>.\run-cmt-pack-exit-flg.ps1 -Probe -Case TcXP1</c> — mỗi ca một lô (F7).</para>
/// </summary>
[TestFixture]
[Explicit("Probe — chạy tay khi cần dò lại hành vi; không nằm trong lô hồi quy.")]
[NonParallelizable]
[CancelAfter(720_000)]
public sealed class CmtPackExitFlgProbeTests : UiTestBase
{
    private CmtPackDb? _db;
    private SigaToothFlow _flow = null!;
    private CmtPackCascade _cascade = null!;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>Probe KHÔNG để watcher trả lời hộ — xem F19.</summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _db = CmtPackDb.CreateOrNull(Settings);
        if (_db?.ProbeError() is { } err)
        {
            Log($"⚠️ không đọc được SQL Server ({err}) — probe vẫn chạy, chỉ thiếu phần đối chiếu master.");
            _db = null;
        }
    }

    [SetUp]
    public void ProbeSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _cascade = new CmtPackCascade(App, _flow);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcXP0 — mốc: master + lưới lúc mở màn (KHÔNG gõ gì)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TcXP0 — mốc: master của I017/B014 + lưới lúc mở màn. Không gõ gì.")]
    public void TcXP0_Baseline()
    {
        using var trace = TestTrace.Begin();

        try
        {
            Log($"=== KQ-1 === bệnh nhân {PatNo} · 診療日 {TrtDate:yyyy-MM-dd}");

            if (_db is not null)
            {
                foreach (var (cd, sb) in new[]
                         {
                             (CmtPackExitFlgMasterTests.OralApplianceTrtCd, CmtPackExitFlgMasterTests.OralApplianceTrtSb),
                             (CmtPackExitFlgMasterTests.DischargeGuidanceTrtCd, CmtPackExitFlgMasterTests.DischargeGuidanceTrtSb),
                             (CmtPackExitFlgMasterTests.SiseiTrtCd, CmtPackExitFlgMasterTests.SiseiTrtSb),
                         })
                {
                    Log("");
                    Log($"処置 {cd}/{sb}:");
                    foreach (var p in _db.PacksFor(cd, sb, TrtDate))
                    {
                        Log($"   {p}");
                        foreach (var d in _db.Details(p.PackCd, TrtDate)) Log($"        {d}");
                    }
                }

                Log("");
                Log($"=== KQ-2 === TRNTRN đã lưu của ngày {TrtDate:yyyy-MM-dd}");
                foreach (var r in _db.DayRows(PatNo, TrtDate)) Log($"   {r}");
            }

            Log("");
            Log("=== KQ-3 === lưới lúc mở màn");
            foreach (var line in _flow.DescribeGrid(40)) Log($"   {line}");
            Log($"   月計 = {_flow.Grid.AllPointValue()?.ToString() ?? "?"}");
            trace.Shot("luoi-luc-mo-man");
        }
        catch (Exception e)
        {
            // Probe KHÔNG BAO GIỜ ném — ghi lại rồi đi tiếp (F1).
            trace.Fail("TcXP0", e);
            Log($"⚠️ TcXP0 ném: {e.Message}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcXP1 — hộp thoại 摘要選択 của I017 trông ra sao
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TcXP1 — gõ 195/0, CHỤP hộp thoại 摘要選択 (12 候補), đọc rect từng dòng, rồi HUỶ hết")]
    public void TcXP1_OralAppliance_Dialog_Shape()
    {
        using var trace = TestTrace.Begin();

        try
        {
            var below = new CmtPackOps(_flow).LastRowOfDay(TrtDate.Day, trace);
            if (below is null)
            {
                Log("⚠️ lưới không có dòng nào của ngày test — không gõ được. Đổi patient.trtDate.");
                return;
            }

            // Huỷ mọi hộp thoại: probe này chỉ ĐO HÌNH DẠNG, không chọn gì.
            var m = _cascade.Run(below, CmtPackExitFlgMasterTests.OralApplianceTrtCd,
                                 CmtPackExitFlgMasterTests.OralApplianceTrtSb,
                                 CmtPackCascade.Plan.CancelAll, trace);

            if (m is null) { Log("⚠️ không gõ được mã — xem _trace.log."); return; }

            Log("=== KQ-4 === chuỗi hộp thoại (đã HUỶ hết)");
            foreach (var d in m.Dialogs) Log($"   {d}");

            Log("");
            Log("=== KQ-5 === dòng thêm vào lưới");
            foreach (var r in m.Measure.AddedRows) Log($"   {r}");
            Log($"   月計 Δ = {m.Measure.PointDelta?.ToString() ?? "?"} · " +
                $"có dòng 処置 = {m.InsertedTreatmentRow}");

            var select = m.FirstDialog(PackDialogs.SelectFormId);
            Log("");
            Log("=== KQ-6 === 候補 đọc được trên frm203018 " +
                $"({select?.Rows.Count ?? 0} dòng — master nói 12)");
            foreach (var row in select?.Rows ?? []) Log($"   {row}");
            Log("⚠️ Đọc ẢNH artifacts\\screenshots\\…\\hop-thoai-*-frm203018.png: đếm xem có bao " +
                "nhiêu dòng NHÌN THẤY ĐƯỢC. UIA phơi ra cả dòng ngoài khung nhìn (F10) nên con số " +
                "trên đây KHÔNG trả lời được câu 「番号 10/11/12 có click được không」 — chỉ ảnh mới trả lời.");
        }
        catch (Exception e)
        {
            trace.Fail("TcXP1", e);
            Log($"⚠️ TcXP1 ném: {e.Message}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcXP2 — chuỗi hộp thoại của 108/4
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TcXP2 — gõ 108/4, chụp trọn chuỗi hộp thoại B014-1 → B014-2 → B014-3, HUỶ hết")]
    public void TcXP2_DischargeGuidance_Dialog_Chain()
    {
        using var trace = TestTrace.Begin();

        try
        {
            var below = new CmtPackOps(_flow).LastRowOfDay(TrtDate.Day, trace);
            if (below is null) { Log("⚠️ lưới không có dòng nào của ngày test."); return; }

            var m = _cascade.Run(below, CmtPackExitFlgMasterTests.DischargeGuidanceTrtCd,
                                 CmtPackExitFlgMasterTests.DischargeGuidanceTrtSb,
                                 CmtPackCascade.Plan.CancelAll, trace);

            if (m is null) { Log("⚠️ không gõ được mã — xem _trace.log."); return; }

            Log("=== KQ-7 === chuỗi hộp thoại của 108/4 (đã HUỶ hết)");
            foreach (var d in m.Dialogs) Log($"   {d}");
            Log("");
            Log("=== KQ-8 === dòng thêm vào lưới");
            foreach (var r in m.Measure.AddedRows) Log($"   {r}");
            Log("⚠️ Huỷ B014-1 (frm203019) thì `data` là null ⇒ không có dòng nào của nó; nhưng " +
                "cascade VẪN chạy tiếp. Đó chính là thứ TCX-10 đo.");
        }
        catch (Exception e)
        {
            trace.Fail("TcXP2", e);
            Log($"⚠️ TcXP2 ném: {e.Message}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcXP3 — §C1 thứ tự dòng 摘要 màu magenta
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TcXP3 (§C1) — gõ 歯清 108/2 rồi in NGUYÊN thứ tự dòng: 摘要 trước hay sau カルテ?")]
    public void TcXP3_Magenta_Row_Order()
    {
        using var trace = TestTrace.Begin();

        try
        {
            var before = _flow.Grid.Snapshot();
            var below = new CmtPackOps(_flow).LastRowOfDay(TrtDate.Day, trace);
            if (below is null) { Log("⚠️ lưới không có dòng nào của ngày test."); return; }

            // 歯清 là mã DUY NHẤT đo được ở đây mà vừa có 摘要コメントパック (I030…) vừa kéo theo
            // dòng 自動算定 của Chk_ChkAuto (「ポリッシングブラシ+研磨用ペースト」, đo 2026-09-16).
            var m = _cascade.Run(below, CmtPackExitFlgMasterTests.SiseiTrtCd,
                                 CmtPackExitFlgMasterTests.SiseiTrtSb,
                                 CmtPackCascade.Plan.CancelAll, trace);

            if (m is null) { Log("⚠️ không gõ được mã — xem _trace.log."); return; }

            Log("=== KQ-9 === TOÀN BỘ dòng của ngày test, THEO ĐÚNG THỨ TỰ LƯỚI");
            Log("   (đánh dấu ★ = dòng MỚI so với lúc trước khi gõ)");
            var beforeKeys = before.Select(r => $"{r.Day}|{r.Bui}|{r.Ryo}|{r.Ten}|{r.Kai}").ToList();
            foreach (var r in _flow.Grid.Snapshot())
            {
                if (Txt.Int(r.Day) != TrtDate.Day) continue;
                var key = $"{r.Day}|{r.Bui}|{r.Ryo}|{r.Ten}|{r.Kai}";
                var isNew = !beforeKeys.Remove(key);
                Log($"   {(isNew ? "★" : " ")} {r}");
            }

            Log("");
            Log("=== KQ-10 === chuỗi hộp thoại");
            foreach (var d in m.Dialogs) Log($"   {d}");

            Log("");
            Log("§C1 đọc thế nào: dòng 処置 108/2 歯清 (72点) là mốc. Dòng 摘要コメント (点 = 0, đến " +
                "từ prgCmtAuto) nằm TRƯỚC hay SAU dòng 自動算定 (点 = 0, đến từ Chk_ChkAuto)? " +
                "Ảnh chụp 「sau-khi-chot-108-2」 cho biết màu; lưới ở đây cho biết THỨ TỰ. " +
                "⚠️ Màu 0xff80ff KHÔNG ra tới UIA — đừng cố đọc màu bằng code, đọc ẢNH.");
        }
        catch (Exception e)
        {
            trace.Fail("TcXP3", e);
            Log($"⚠️ TcXP3 ném: {e.Message}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcXP4 — §B4: gõ ＳＰＴ 167/1 có mở 部位選択 không?
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TcXP4 (§B4) — gõ 167/1 ＳＰＴ: có mở 部位選択 không, và rơi xuống lưới những gì")]
    public void TcXP4_Spt_Entry_Shape()
    {
        using var trace = TestTrace.Begin();

        try
        {
            // ⚠️ Câu hỏi CHÍNH của probe này: 167/1-3 có KESSON = 9 trong MST_TRT266, khác hẳn
            //    195/0 · 108/2 · 108/5 (đều = 0). Nếu nó mở 部位選択 thì mọi ca UI cho ＳＰＴ
            //    phải đi trọn vòng Insert → 部位選択 → 病名選択 (2-3 phút, F7) và KHÔNG dùng
            //    được khuôn RunOn của luồng này. Đừng viết assert cho ＳＰＴ trước khi đọc KQ-11.
            var below = new CmtPackOps(_flow).LastRowOfDay(TrtDate.Day, trace);
            if (below is null) { Log("⚠️ lưới không có dòng nào của ngày test."); return; }

            var m = _cascade.Run(below, CmtPackExitFlgMasterTests.SptTrtCd,
                                 CmtPackExitFlgMasterTests.SptTrtSb,
                                 CmtPackCascade.Plan.CancelAll, trace);

            if (m is null) { Log("⚠️ không gõ được mã — xem _trace.log."); return; }

            Log("=== KQ-11 === gõ 167/1 ＳＰＴ");
            Log($"   dòng 処置 vào được lưới = {m.InsertedTreatmentRow} · " +
                $"月計 Δ = {m.Measure.PointDelta?.ToString() ?? "?"}");
            Log("   dòng thêm vào lưới:");
            foreach (var r in m.Measure.AddedRows) Log($"      {r}");
            Log("   chuỗi hộp thoại:");
            foreach (var d in m.Dialogs) Log($"      {d}");

            Log("");
            Log("Đọc thế nào:");
            Log("  · 月計 Δ = 0 và không có dòng 170点 ⇒ app CHẶN cú nhập (rất có thể " +
                "「算定可能な部位がありません」 vì KESSON = 9) ⇒ ca UI cho ＳＰＴ phải dựng 部位 trước.");
            Log("  · Có dòng 170点 + 「初回（ＳＰＴ）」 ⇒ gõ thẳng được, viết ca theo khuôn RunOn.");
            Log("  · Có hộp thoại frm203018 「SPT-３ヶ月以内」 ⇒ 施設基準 1346/1375 KHÔNG được coi là " +
                "届出済 — nhưng IINMST3 trên máy này có 1346 [2017-02-01, 9999-12-31] nên dự đoán " +
                "là KHÔNG mở (CmtAuto.cs:133-151 đặt pack_detail_dsp_flg = false).");
        }
        catch (Exception e)
        {
            trace.Fail("TcXP4", e);
            Log($"⚠️ TcXP4 ném: {e.Message}");
        }
    }
}
