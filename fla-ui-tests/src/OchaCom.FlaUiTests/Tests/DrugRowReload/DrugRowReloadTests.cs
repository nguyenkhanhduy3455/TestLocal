using System.Text.RegularExpressions;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugRowReload;

/// <summary>
/// ASSERT — <b>G3: dựng lại dòng thuốc khi LOAD lưới 診療入力</b>.
///
/// <para>Vế WinForm của <c>web-tenant-tests/tests/treatment-grid/drug-row-rebuild-on-load.spec.ts</c>.
/// Bốn dòng seed và cách dựng kỳ vọng giống hệt vế web (xem
/// <see cref="DrugRowReloadFixture"/>), nên số đo hai bên so thẳng được.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BÁM WINFORM
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// INP/Lib/modSave.cs:2626-2638   GetTrnRs — lưới THÁNG ĐANG MỞ
///     if (isCodeRange(drug, trt_cd)) {
///         drugInfStr = getDrugName(con, null, raiin_cnt, trt_cd, trt_sb,
///                                  trt_cnt, trt_dt, dsp_trt, freewd, true);
///         hFG1[2] = drugInfStr.combineDrugNmsStr;      ← dsp_trt BỊ BỎ QUA
///         hFG1[2].Tag = drugInfStr.drugRxData;
///         if (drugInfStr.drugRxData != null)
///             hFG1[2].ReadOnly = true;                 ← CHỈ path A
///     } else {
///         hFG1[2] = REGIRYO_PADLEFT + dsp_trt;         ← mã khác: NGUYÊN VĂN
///     }
///
/// COMMON/Lib/EditControl.cs:1050-1055   free_wd tách theo ',' rồi ghi đè cnt[i]
/// COMMON/Lib/EditControl.cs:1119-1149   用量 「n日分」/「n回分」 chỉ có ở nhánh A
/// </code>
///
/// <para>KHÔNG có testcase nào ở đây bấm <b>F9 登録</b> ⇒ không dòng nào bị ghi đè.
/// Cả fixture chỉ MỘT vòng giao diện: không nhập gì, chỉ đọc lưới đã nạp sẵn.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// SỐ ĐO ĐÃ CÓ (probe 2026-09-09, 患者 10, 診療日 2026-08-10)
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// KQ-2  chuỗi bịa ｽﾃｰﾙ保存文字列ZZZ1 KHÔNG hiện; ô = 「ﾒｲｱｸﾄMS錠100mg 4T」 ⏎
///                                        「１日４回朝昼夕食後と就寝前　服用  7日分」
/// KQ-3  freewd rỗng → 4T · freewd 「1」 → 1T ⇒ hai ô KHÁC nhau
/// KQ-4  path A ReadOnly = CÓ · path B ReadOnly = KHÔNG
/// KQ-6  đối chứng 110/0 hiện NGUYÊN VĂN 「ｽﾃｰﾙ保存文字列ZZZ4」
/// KQ-8  path B → đúng 2 dòng 「ﾃｽﾄ読込薬PB」 ⏎ 「ﾃｽﾄ用法　就寝前　服用」, KHÔNG 用量
/// </code>
/// </summary>
[TestFixture]
[Category("drug-row-reload")]
[NonParallelizable]
public sealed class DrugRowReloadTests : DrugRowReloadFixture
{
    private void RequireSeed()
    {
        if (SeedBlocker is { } why) Assert.Ignore("Không đo được: " + why);
    }

    /// <summary>Ô 療法・処置 của dòng mang đúng 点 đó — không thấy thì đỏ kèm cả lưới.</summary>
    private DrugRowReloadFlow.LoadedRow Row(int trtPt, string what, bool probeReadOnly,
                                            TestTrace trace)
    {
        var r = Flow.Read(TrtDate.Day, trtPt, probeReadOnly, trace);
        Assert.That(r.Row, Is.Not.Null,
            $"Không thấy dòng seed {what} (点 = {trtPt}) trên lưới ngày {TrtDate.Day}. " +
            "Dòng seed là dòng trn_trn THẬT nên nó phải có mặt — không thấy nghĩa là seed " +
            "chưa vào, hoặc màn hình đang mở tháng khác. Lưới đang có: " +
            string.Join(" | ", Flow.DescribeDay(TrtDate.Day)));
        return r;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC-1 — dsp_trt đã lưu KHÔNG được in ra; ô dựng lại từ master.
    //        Cặp web: drug-row-rebuild-on-load.spec.ts TC-1
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("TC-1 — dsp_trt đã lưu KHÔNG được in ra; ô dựng lại từ master (modSave.cs:2626-2638)")]
    [CancelAfter(600_000)]
    public void TcG3_1_SavedDspTrtIsNotPrinted()
    {
        using var trace = TestTrace.Begin();
        RequireSeed();

        Assert.That(Master, Is.Not.Null,
            $"Không đọc được master của {Cfg.TrtCd}/{Cfg.TrtSb} cho ngày {TrtDate:yyyy-MM-dd}.");
        if (!Master!.HasRx || Master.UsageNm.Length == 0 || Master.DgNm.Length == 0)
            Assert.Ignore($"Mã {Cfg.TrtCd}/{Cfg.TrtSb} không có mst_drug_rx kèm 用法/薬剤名 " +
                          $"cho ngày {TrtDate:yyyy-MM-dd} — đặt drugRowReload.trtCd sang mã khác.");

        var r = Row(PtPlain, $"path A {Cfg.TrtCd}/{Cfg.TrtSb} (freewd rỗng)", true, trace);
        var flat = Txt.N(r.RawRyo);

        // (1) CỐT LÕI của G3: chuỗi đã lưu không được lọt ra lưới.
        Assert.That(Txt.Has(flat, Cfg.Stale), Is.False,
            $"Lưới vẫn in chuỗi 「{Cfg.Stale}」 đã lưu ở dsp_trt ⇒ đường LOAD KHÔNG dựng lại " +
            $"dòng 薬剤. modSave.cs:2630-2634 phải gọi getDrugName và gán combineDrugNmsStr, " +
            $"không dùng dsp_trt. Ô đang là: {Txt.Vis(r.RawRyo)}");

        // (2) Ô là combineDrugNms: 薬剤名 (mst_drug) + dòng 用法 (mst_drug_rx).
        Assert.That(r.Lines.Count, Is.GreaterThanOrEqualTo(2),
            $"Ô path A phải NHIỀU DÒNG (薬剤名 ⏎ 用法) — EditControl.cs:1119-1135 nối 用法 " +
            $"bằng xuống dòng. Ô đang là: {Txt.Vis(r.RawRyo)}");
        Assert.That(Txt.Has(flat, Master.DgNm), Is.True,
            $"Không thấy 薬剤名 của master 「{Master.DgNm}」 (mst_drug.dg_nm) trong ô. " +
            $"Ô đang là: {Txt.Vis(r.RawRyo)}");
        Assert.That(Txt.Has(flat, Master.UsageNm), Is.True,
            $"Không thấy 用法 của master 「{Master.UsageNm}」 (mst_drug_rx.usage_nm) trong ô. " +
            $"Ô đang là: {Txt.Vis(r.RawRyo)}");

        // (3) 用量 nối theo 回数 CỦA DÒNG (trn_trn.trt_cnt), KHÔNG phải g_cnt của master.
        var unit = Master.MedKbn switch { "21" => "日分", "22" => "回分", _ => "" };
        if (unit.Length > 0)
        {
            Assert.That(flat, Does.Contain($"{Cfg.TrtCnt}{unit}"),
                $"用量 phải bám 回数 của dòng ĐÃ LƯU ({Cfg.TrtCnt}{unit}), không phải g_cnt " +
                $"của master ({Master.GCnt}). med_kbn = 「{Master.MedKbn}」, " +
                $"EditControl.cs:1119-1135. Ô đang là: {Txt.Vis(r.RawRyo)}");
        }

        // (4) WinForm-ONLY: ô bị KHOÁ vì drugRxData != null (modSave.cs:2635).
        //     Vế Playwright chưa đo ReadOnly — xem README §7.
        Assert.That(r.ReadOnly, Is.True,
            "Ô 療法・処置 của dòng path A phải bị KHOÁ: drugRxData != null nên " +
            "modSave.cs:2635 đặt hFG1[2].ReadOnly = true. Đo bằng cách thử mở editor " +
            "(F14: đóng bằng Enter, không bằng Escape).");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC-2 — freewd của dòng đã lưu đổi 使用量 trong ô dựng lại.
    //        Cặp web: TC-2
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("TC-2 — freewd của dòng đã lưu đổi 使用量 trong ô dựng lại (EditControl.cs:1050-1055)")]
    [CancelAfter(600_000)]
    public void TcG3_2_FreeWdOverridesAmount()
    {
        using var trace = TestTrace.Begin();
        RequireSeed();

        Assert.That(Master, Is.Not.Null, "Không đọc được master của mã đem thử.");
        if (Master!.DefaultCnt.Length == 0)
            Assert.Ignore($"Mã {Cfg.TrtCd}/{Cfg.TrtSb} không có cnt1 trong mst_drug_rx — " +
                          "không đo được freewd.");

        var plain = Row(PtPlain, "path A freewd RỖNG", false, trace);
        var freed = Row(PtFreeWd, $"path A freewd 「{FreeWd}」", false, trace);

        // Hai dòng CÙNG mã, cùng ngày, cùng 回数 — chỉ khác freewd. App bỏ qua freewd thì
        // hai ô giống hệt nhau; đó chính là phép so ở đây, và nó KHÔNG phải chép bảng viết
        // tắt 単位 (錠→T…) vào test.
        Assert.That(Txt.N(freed.RawRyo), Is.Not.EqualTo(Txt.N(plain.RawRyo)),
            $"Hai dòng cùng mã {Cfg.TrtCd}/{Cfg.TrtSb} chỉ khác freewd (\"\" vs \"{FreeWd}\", " +
            $"master cnt1 = {Master.DefaultCnt}) mà ô GIỐNG HỆT nhau ⇒ freewd chưa được đưa " +
            $"vào lúc dựng lại (EditControl.cs:1050-1055). Cả hai đang là: " +
            $"{Txt.Vis(plain.RawRyo)}");

        // Dòng KHÔNG có freewd dùng 使用量 mặc định của master.
        var amountsPlain = DrugRowReloadFlow.AmountsIn(plain.RawRyo, Master.UnitNm);
        Assert.That(amountsPlain, Does.Contain(Master.DefaultCnt),
            $"Dòng KHÔNG có freewd phải mang 使用量 mặc định của master " +
            $"「{Master.DefaultCnt}{Master.ShortUnit}」. Đọc ra: [{string.Join(",", amountsPlain)}] " +
            $"từ {Txt.Vis(plain.RawRyo)}");

        // Dòng CÓ freewd mang đúng con số đó ở cuối dòng thành phần đầu —「1T」/「2Ct」,
        // 単位 rút gọn 0-2 chữ ASCII (EditControl.cs:1160-1190).
        // ⚠️ TÁCH DÒNG TRƯỚC rồi mới chuẩn hoá: Txt.N biến '\n' thành dấu cách, nên chuẩn
        // hoá trước là mất ranh giới dòng (F23).
        var firstLine = freed.Lines.Count > 0 ? Txt.N(freed.Lines[0]) : "";
        Assert.That(Regex.IsMatch(firstLine, $@"\s{Regex.Escape(FreeWd)}[A-Za-z]{{0,2}}$"), Is.True,
            $"Dòng thành phần ĐẦU của ô có freewd phải kết thúc bằng 使用量 = {FreeWd} kèm " +
            $"単位 rút gọn (master cnt1 = {Master.DefaultCnt}). Dòng đầu đang là 「{firstLine}」, " +
            $"cả ô: {Txt.Vis(freed.RawRyo)}");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC-3 — dòng đã lưu KHÔNG có mst_drug_rx đi path B: 処置名称 + 用法.
    //        Cặp web: TC-3
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("TC-3 — dòng path B khi LOAD: 処置名称 + 用法, không hậu tố 用量")]
    [CancelAfter(600_000)]
    public void TcG3_3_PathBRowOnLoad()
    {
        using var trace = TestTrace.Begin();
        RequireSeed();

        var r = Row(PtPathB, $"path B {Cfg.PathBTrtCd}/{Cfg.TrtSb} 「{Cfg.PathBTrtNm}」", true, trace);
        var flat = Txt.N(r.RawRyo);

        Assert.That(Txt.Has(flat, Cfg.Stale), Is.False,
            $"Dòng path B vẫn in chuỗi 「{Cfg.Stale}」 đã lưu ở dsp_trt ⇒ đường LOAD chưa " +
            $"dựng lại. Ô đang là: {Txt.Vis(r.RawRyo)}");

        var lines = r.Lines.Where(l => Txt.N(l).Length > 0).ToList();
        Assert.That(lines.Count, Is.EqualTo(2),
            $"Path B khi load phải ra ĐÚNG 2 dòng 処置名称 + 用法 (EditControl.cs:1136-1149). " +
            $"Ô đang là: {Txt.Vis(r.RawRyo)}");
        Assert.That(Txt.Has(lines[0], Cfg.PathBTrtNm), Is.True,
            $"Dòng [0] phải là 処置名称 「{Cfg.PathBTrtNm}」 (getMstTrtDataYaku). " +
            $"Đang là 「{lines[0]}」");
        Assert.That(Txt.Has(lines[1], Cfg.PathBUsage), Is.True,
            $"Dòng [1] phải là 用法 「{Cfg.PathBUsage}」 (getMstMed → MST_MED.usage). " +
            $"Đang là 「{lines[1]}」");

        // KHÔNG có hậu tố 用量: med_kbn chỉ có ở mst_drug_rx, mà EditControl.cs:1119-1135
        // nằm trong nhánh A — nên dù dòng đã lưu mang 回数 7 cũng không được thấy 「7日分」.
        Assert.That(Regex.IsMatch(flat, @"\d+\s*(日分|回分)"), Is.False,
            $"Path B KHÔNG được gắn hậu tố 用量 — med_kbn chỉ có ở mst_drug_rx và " +
            $"EditControl.cs:1119-1135 nằm trong nhánh A. Ô đang là: {Txt.Vis(r.RawRyo)}");

        // WinForm-ONLY: drugRxData == null nên modSave.cs:2635 KHÔNG chạy ⇒ ô vẫn sửa được.
        Assert.That(r.ReadOnly, Is.False,
            "Ô path B KHÔNG được khoá: drugRxData == null nên modSave.cs:2635 không chạy. " +
            "Nếu ô bị khoá thì hoặc mã seed đã có mst_drug_rx (không còn là path B), hoặc " +
            "màn hình đang là lưới QUÁ KHỨ (GetTrnRsOld, modSave.cs:4966 khoá vô điều kiện).");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC-4 — ĐỐI CHỨNG: mã ngoài dải 600–699 hiện NGUYÊN VĂN dsp_trt.
    //        Vế Playwright CHƯA có testcase này.
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("TC-4 đối chứng — mã ngoài dải 600–699 hiện NGUYÊN VĂN dsp_trt (modSave.cs:2639)")]
    [CancelAfter(600_000)]
    public void TcG3_4_NonDrugRowShowsSavedDspTrt()
    {
        using var trace = TestTrace.Begin();
        RequireSeed();

        var expected = Cfg.Stale + "4";
        var r = Row(PtControl, $"đối chứng {Cfg.ControlTrtCd}/{Cfg.ControlTrtSb}", true, trace);

        // Không có câu này thì 「chuỗi bịa biến mất ở dòng 薬剤」 (TC-1) chưa loại được khả
        // năng 「app không bao giờ hiện dsp_trt」.
        Assert.That(Txt.Has(r.RawRyo, expected), Is.True,
            $"Dòng ngoài dải 薬剤 phải hiện NGUYÊN VĂN dsp_trt 「{expected}」 — nhánh else " +
            $"modSave.cs:2639 gán REGIRYO_PADLEFT + dsp_trt. Ô đang là: {Txt.Vis(r.RawRyo)}. " +
            "Nếu câu này đỏ thì TC-1 chưa chứng minh được gì về dải 600–699.");

        Assert.That(r.ReadOnly, Is.False,
            "Ô của dòng ngoài dải 薬剤 KHÔNG được khoá — nhánh else không đụng ReadOnly.");
    }
}
