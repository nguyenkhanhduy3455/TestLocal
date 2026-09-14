using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Ép <c>ModMain.Chk_ChkAuto</c> đi vào những nhánh mà dữ liệu thật KHÔNG BAO GIỜ chạm
/// tới, để đo xem WinForm ở đó thật sự làm gì.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI SEED
/// ═══════════════════════════════════════════════════════════════════════════════
/// <see cref="ChkAutoCascadeTests.TCC0_Master_Decides_Which_Branches_Are_Reachable"/> hỏi
/// thẳng DB và trả lời: trên master này KHÔNG có ô <c>chkauto</c> nào dẫn tới
/// <c>202</c> / <c>549</c> / <c>179</c>, và không mã đi kèm nào mang <c>men &lt;&gt; 0</c>.
/// Bốn nhánh riêng của <c>Chk_ChkAuto</c> vì thế là <b>code chết</b> với dữ liệu thật.
///
/// <para>Bản đánh giá parity nói web 「thiếu port」 chúng. Câu đó chỉ kiểm được nếu biết
/// WinForm làm gì khi nhánh ấy CHẠY — mà muốn nó chạy thì phải tạm trỏ một ô
/// <c>chkauto</c> vào mã cần đo. Đó là toàn bộ việc của fixture này.</para>
///
/// <para>Làm được vì <c>chkauto</c> KHÔNG cache: <c>ChkAuto.getChkAutoData</c> chạy một câu
/// <c>select</c> mới ở MỖI lần Enter ô 回 (COMMON/DBAccess/ChkAuto.cs:24-66). Một phiên app
/// chạy được cả bốn ca, mỗi ca một lần vá + một cú chốt.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BỐN CA
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TCB1  chkauto(chủ nhà) → 179/5 分割抜歯
///         KỲ VỌNG: 処置選択 KHÔNG mở, dòng vẫn rơi xuống lưới.
///         Vì `case 179` so Rows[0][2] (= trt_nm) với "5" — 枝番 nằm ở Rows[0][1].
///         ⇒ điều kiện LUÔN false ⇒ 分割抜歯 chưa bao giờ được hỏi.   (§5c)
///
///   TCB2  chkauto(chủ nhà) → 202/0 ＩＳ
///         KỲ VỌNG: 処置選択 CÓ mở. `case 202` đọc Rows[0][1] — ĐÚNG cột.
///         Cặp đối chứng của TCB1: hai nhánh cạnh nhau, khác đúng một chỉ số cột. (§5b)
///
///   TCB3  MST_CMT2 của カルテコメント ← chuỗi có dấu *
///         KỲ VỌNG: frm203048 パラメータダイアログ mở.                  (§3b)
///
///   TCB4  chkauto(chủ nhà) → mã có men = 1
///         KỲ VỌNG: frm203035 面入力 mở.                               (§5d)
/// </code>
///
/// <para><b>549 KHÔNG có ca UI.</b> Master của tháng test không có dòng <c>549</c> nào, mà
/// <c>Chk_ChkAuto</c> tra master TRƯỚC rồi mới vào <c>switch</c> (modMain.cs:948-958):
/// <c>tblTrt.Rows.Count == 0</c> ⇒ nhánh rỗng, <c>switch</c> không bao giờ chạy tới. Trỏ
/// <c>chkauto</c> sang <c>549</c> cũng chỉ dựng lại đúng cái không-xảy-ra ấy. TCC0 khẳng
/// định điều này ở tầng DB.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB — cờ RIÊNG <c>chkAutoCascade.allowBranchSeed</c>
/// ═══════════════════════════════════════════════════════════════════════════════
/// Fixture này sửa <b>master dùng chung cả phòng khám</b> (<c>CHKAUTO</c>,
/// <c>MST_CMT2</c>), không phải dữ liệu bệnh nhân. Vì thế:
/// <list type="bullet">
///   <item>cờ RIÊNG, mặc định tắt ⇒ tự Ignore TRƯỚC khi mở app;</item>
///   <item><c>OneTimeSetUp</c> chụp nguyên trạng và IN RA STDOUT trong khối
///     「NGUYÊN TRẠNG」 — Ctrl+C giữa chừng thì dựng lại bằng tay theo khối đó;</item>
///   <item>mỗi ca tự trả lại ngay trong <c>finally</c>, KHÔNG đợi tới
///     <c>OneTimeTearDown</c>: ca sau vá đè lên ca trước thì ảnh chụp gốc mất luôn.</item>
/// </list>
///
/// <para>Một tác dụng phụ KHÔNG khôi phục: <c>frmTrtSel_Let_Trt_Data</c> tăng
/// <c>use_cnt</c> của dòng master vừa dùng (frm203016.cs:1621). Đó là bộ đếm học thói quen
/// dùng, không ảnh hưởng điểm số hay hoá đơn — ghi ra đây để người sau khỏi đi tìm.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class ChkAutoSeededBranchTests : UiTestBase
{
    private ChkAutoDb _chk = null!;
    private ChkAutoBranchDb _seed = null!;
    private SigaKonDb _mst = null!;
    private SigaToothFlow _flow = null!;
    private AutoSanteiOps _ops = null!;

    private ChkAutoBranchDb.ChkAutoSnapshot? _chkAutoBefore;
    private (int Cd, int Sb)? _hostCmt;
    private string? _cmt2Before;

    /// <summary>処置 CHỦ NHÀ — ô <c>chkauto</c> của nó là chỗ để trỏ sang mã cần đo.</summary>
    private int HostCd => Settings.ChkAutoCascade.TrtCd;
    private int HostSb => Settings.ChkAutoCascade.TrtSb;

    private int BuiSlot => Settings.AutoSantei.BuiSlot;
    private int DisCd => Settings.AutoSantei.DisCd;
    private int DisSb => Settings.AutoSantei.DisSb;
    private const string DisMark = "Ｃ";

    /// <summary>AutomationId của các form mà bốn ca đang hỏi 「có mở không」.</summary>
    private const string PickerForm = "frm203016";   // 処置選択
    private const string MenForm = "frm203035";      // 面入力
    private const string ParamForm = "frm203048";    // パラメータダイアログ

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        !Settings.ChkAutoCascade.AllowBranchSeed
            ? "Cần chkAutoCascade.allowBranchSeed = true (hoặc OCHA_CHK_AUTO_BRANCH_SEED=1). " +
              "Fixture SỬA TẠM master dùng chung cả phòng khám (CHKAUTO, MST_CMT2) để ép " +
              "Chk_ChkAuto vào các nhánh mà dữ liệu thật không chạm tới, rồi trả lại nguyên trạng."
            : !Settings.ChkAutoCascade.AllowSave
                ? "Cần cả chkAutoCascade.allowSave = true — fixture còn seed 部位病名行 vào TRNTRN " +
                  "để có chỗ đứng gõ mã."
                : null;

    protected override void PrepareDataBeforeApp()
    {
        var chk = ChkAutoDb.CreateOrNull(WithSeedPermission());
        if (chk is null || !Settings.ChkAutoCascade.AllowSave || !Settings.ChkAutoCascade.AllowBranchSeed) return;
        if (chk.ProbeError() is not null) return;

        Log("nguyên trạng dòng 処置 của ngày test:\n  " +
            string.Join("\n  ", chk.DescribeDayRows(PatNo, TrtDate)));

        var n = chk.SeedBuiDisRow(PatNo, TrtDate, BuiSlot, Settings.AutoSantei.BuiVal,
                                  DisCd, DisSb,
                                  dspBui: ToothSelectDialog.DescribeSlot(BuiSlot), dspDis: DisMark);
        Log($"seed 部位病名行: {n} dòng — 部位 ô {BuiSlot} ({ToothSelectDialog.DescribeSlot(BuiSlot)}), " +
            $"病名 {DisCd}/{DisSb}, ngày {TrtDate:yyyy-MM-dd}.");
    }

    /// <summary>Xem <c>ChkAutoCascadeTests.WithSeedPermission</c> — cùng lý do, cùng cách.</summary>
    private TestSettings WithSeedPermission()
    {
        var clone = new TestSettings { Db = Settings.Db };
        clone.AutoSantei.AllowSave = Settings.ChkAutoCascade.AllowSave;
        return clone;
    }

    [OneTimeSetUp]
    public void BranchOneTimeSetUp()
    {
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (chk is null) IgnoreWithReason("Cần DB — " + (DbUnavailableReason ?? "db.enabled = false"));
        if (chk!.ProbeError() is { } err) IgnoreWithReason($"không kết nối được SQL Server: {err}");
        _chk = chk;
        _seed = ChkAutoBranchDb.CreateOrNull(Settings)!;
        _mst = SigaKonDb.CreateOrNull(Settings, allowWrite: false)!;

        _chkAutoBefore = _seed.CaptureChkAuto(HostCd, HostSb);
        if (_chkAutoBefore is null)
            IgnoreWithReason($"chkauto không có dòng ({HostCd},{HostSb}) để mượn làm ô trỏ. " +
                             "Đổi chkAutoCascade.trtCd sang một mã CÓ dòng chkauto.");

        // カルテコメント của chính 処置 chủ nhà — TCB3 ghi đè chuỗi của nó.
        var cmt = _chk.FindCmtAutos(HostCd, HostSb).FirstOrDefault(c => c.MakesOwnRow);
        if (cmt is not null)
        {
            _hostCmt = (cmt.CmtCd, cmt.CmtSb);
            _cmt2Before = _seed.CaptureCmt2(cmt.CmtCd, cmt.CmtSb);
        }

        Log("╔══ NGUYÊN TRẠNG MASTER (chép lại nếu lượt chạy bị cắt giữa chừng) ══");
        Log($"║ {_chkAutoBefore}");
        Log($"║ MST_CMT2({_hostCmt?.Cd.ToString() ?? "-"},{_hostCmt?.Sb.ToString() ?? "-"}).cmt_nm = " +
            $"「{_cmt2Before ?? "(không có dòng)"}」");
        Log("╚═══════════════════════════════════════════════════════════════════");
    }

    [SetUp]
    public void BranchSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new AutoSanteiOps(_flow);
    }

    [OneTimeTearDown]
    public void BranchOneTimeTearDown()
    {
        if (!Settings.ChkAutoCascade.AllowBranchSeed) return;

        try
        {
            if (_chkAutoBefore is not null) { _seed.RestoreChkAuto(_chkAutoBefore); Log("dọn: CHKAUTO trả về nguyên trạng."); }
            if (_hostCmt is { } c && _cmt2Before is not null)
            {
                _seed.PatchCmt2(c.Cd, c.Sb, _cmt2Before);
                Log("dọn: MST_CMT2 trả về nguyên trạng.");
            }
        }
        catch (Exception e) { Log($"dọn MASTER HỎNG: {e.Message} — dựng tay theo khối 「NGUYÊN TRẠNG」."); }

        try
        {
            if (!Settings.ChkAutoCascade.AllowSave) return;
            var cleaner = ChkAutoDb.CreateOrNull(WithSeedPermission())!;
            Log("dọn: " + cleaner.DeleteSeededRows(PatNo, TrtDate) + " dòng vùng seed.");
            if (Settings.ChkAutoCascade.AllowRowCleanup)
                foreach (var (cd, sb) in BranchCodes())
                    Log($"dọn {cd}/{sb}: " + cleaner.DeleteCompanionRows(PatNo, TrtDate, cd, sb) + " dòng.");
        }
        catch (Exception e) { Log($"dọn TRNTRN HỎNG: {e.Message}"); }
    }

    private IEnumerable<(int Cd, int Sb)> BranchCodes()
    {
        var s = Settings.ChkAutoCascade;
        yield return (s.TrtCd, s.TrtSb);
        yield return (s.DeadBranchTrtCd, s.DeadBranchTrtSb);
        yield return (s.DialogBranchTrtCd, s.DialogBranchTrtSb);
        yield return (s.MenBranchTrtCd, s.MenBranchTrtSb);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCB1 ← §5c — case 179 so NHẦM CỘT nên 分割抜歯 không bao giờ được hỏi
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCB1 ← §5c — trỏ chkauto sang 179/5 分割抜歯: 処置選択 KHÔNG được mở (so nhầm cột)")]
    public void TCB1_Case179_Never_Opens_Picker_Because_It_Compares_The_Name_Column()
    {
        var cd = Settings.ChkAutoCascade.DeadBranchTrtCd;
        var sb = Settings.ChkAutoCascade.DeadBranchTrtSb;
        var master = _mst.FindMasterRow(TrtDate, cd, sb);
        if (master is null) Assert.Ignore($"Master {TrtDate:yyyy-MM} không có {cd}/{sb}.");

        // ⛔ Điều kiện của nhánh: `Rows[0][2] == "5"`. Ô [2] là trt_nm. Nếu master đổi tên
        //    thành đúng chuỗi "5" thì nhánh sẽ chạy và kỳ vọng dưới đây đảo chiều.
        Assert.That(master!.TrtNm, Is.Not.EqualTo("5"),
            $"Master đổi: trt_nm của {cd}/{sb} giờ đúng bằng \"5\" ⇒ điều kiện " +
            "`tblTrtSel.Rows[0][2].ToString() == \"5\"` (modMain.cs:1013) thành TRUE và nhánh " +
            "showDialog sẽ chạy. Cả testcase này phải viết lại.");

        var (measure, recorder) = CommitWithCompanion(cd, sb);
        if (measure is null) Assert.Ignore("không chốt được 処置 chủ nhà — xem _trace.log.");

        Log($"cửa sổ nhìn thấy trong lúc chốt:\n    {recorder.Describe()}");

        var row = AutoSanteiOps.RowOf(measure!.AddedRows, master);
        Assert.That(row, Is.Not.Null,
            $"Dòng 「{master.CctNm}」 ({cd}/{sb}) KHÔNG rơi xuống lưới ⇒ nhánh chưa chạy tới cuối, " +
            "và câu 「có mở 処置選択 không」 chưa trả lời được. Nguyên nhân hay gặp: 診療チェック " +
            "loại mã (modMain.cs:936-940), hoặc 回 của dòng chủ nhà vẫn là 0.\n" +
            "  lưới: [" + string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");

        // ★ §5c — dòng ĐÃ rơi xuống lưới (mốc thứ hai) mà KHÔNG cửa sổ 処置選択 nào xuất hiện
        //   ⇒ app đi đường frm203016_Hide_Let_Trt_Data, tức nhánh `else`.
        Assert.That(recorder.Saw(PickerForm), Is.False,
            $"§5c SAI (hoặc app đã sửa): app CÓ mở {PickerForm} 処置選択 cho mã đi kèm {cd}/{sb}.\n" +
            "  Bản đánh giá parity nói nhánh `case 179: if (Rows[0][2] == \"5\")` (modMain.cs:1011-1020) " +
            "là điều kiện CHẾT vì ô [2] của CommonInp.makeTable() là trt_nm chứ không phải 枝番 " +
            "(CommonInp.cs:210-218) — ở 《VB6》 cột 2 mới là 枝番. Nếu app thật sự mở hộp thoại thì " +
            "kết luận đó sai, và bản web KHÔNG còn 「đúng nhờ tình cờ」 nữa.\n" +
            "  cửa sổ đã thấy:\n    " + recorder.Describe());

        Log($"=== KQ-TCB1 === 179/5 rơi xuống lưới 「{row!.Ryo}」 mà KHÔNG có {PickerForm} ⇒ " +
            "điều kiện 分割抜歯 đúng là code chết.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCB2 ← §5b — case 202 đọc ĐÚNG cột nên 処置選択 có mở thật
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCB2 ← §5b — trỏ chkauto sang 202/0 ＩＳ: 処置選択 PHẢI mở (nhánh đọc đúng cột trt_sb)")]
    public void TCB2_Case202_Does_Open_The_Picker()
    {
        var cd = Settings.ChkAutoCascade.DialogBranchTrtCd;
        var sb = Settings.ChkAutoCascade.DialogBranchTrtSb;
        var master = _mst.FindMasterRow(TrtDate, cd, sb);
        if (master is null) Assert.Ignore($"Master {TrtDate:yyyy-MM} không có {cd}/{sb}.");
        if (sb is not (0 or 5))
            Assert.Ignore($"Nhánh case 202 chỉ mở hộp thoại khi 枝番 là 0 hoặc 5 (modMain.cs:998); " +
                          $"đang cấu hình 枝番 = {sb}.");

        var (measure, recorder) = CommitWithCompanion(cd, sb);
        if (measure is null) Assert.Ignore("không chốt được 処置 chủ nhà — xem _trace.log.");

        Log($"cửa sổ nhìn thấy trong lúc chốt:\n    {recorder.Describe()}");

        // ★ §5b — nhánh này là nhánh SỐNG, và nó khác TCB1 đúng ở một chỉ số cột.
        Assert.That(recorder.Saw(PickerForm), Is.True,
            $"§5b SAI (hoặc app đã sửa): app KHÔNG mở {PickerForm} 処置選択 cho mã đi kèm {cd}/{sb}, " +
            "trong khi `case 202` gọi thẳng formControl.showDialog khi 枝番 = 0 hoặc 5 " +
            "(modMain.cs:995-1003) — điều kiện ở đó đọc Rows[0][1], tức ĐÚNG cột trt_sb.\n" +
            "  Đây là vế ĐỐI CHỨNG của TCB1: hai nhánh nằm cạnh nhau trong cùng switch, chỉ khác " +
            "nhau ở chỉ số cột. TCB1 xanh mà TCB2 đỏ nghĩa là recorder không bắt được cửa sổ chứ " +
            "không phải app khác — kiểm nhịp poll của WindowRecorder trước khi kết luận.\n" +
            "  cửa sổ đã thấy:\n    " + recorder.Describe());

        Log($"=== KQ-TCB2 === {PickerForm} CÓ mở cho 202/{sb} ⇒ nhánh case 202 là nhánh sống, " +
            "và web thiếu nó là lệch THẬT (chỉ chưa ai chạm tới vì không ô chkauto nào trỏ vào 202).");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCB3 ← §3b — dấu * mở パラメータダイアログ frm203048
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCB3 ← §3b — カルテコメント còn dấu * thì frmCmt3_PrmChk phải mở frm203048")]
    public void TCB3_Asterisk_In_Comment_Opens_Parameter_Dialog()
    {
        if (_hostCmt is null || _cmt2Before is null)
            Assert.Ignore($"処置 {HostCd}/{HostSb} không có CMTAUTO sinh dòng riêng, hoặc MST_CMT2 " +
                          "không có dòng tương ứng ⇒ không có chuỗi nào để cài dấu *.");
        var cmt = _hostCmt!.Value;

        var text = Settings.ChkAutoCascade.AsteriskCmtText;
        Assert.That(text, Does.Contain("*"),
            "chkAutoCascade.asteriskCmtText phải chứa ít nhất một dấu * — điều kiện của " +
            "frmCmt3_PrmChk là `outData[i].IndexOf(\"*\") >= 0` (frm203002.cs:10054).");

        using var recorder = new WindowRecorder(App.ProcessId);
        try
        {
            _seed.PatchCmt2(cmt.Cd, cmt.Sb, text);
            Log($"vá MST_CMT2({cmt.Cd},{cmt.Sb}): 「{_cmt2Before}」 → 「{text}」");

            recorder.Start();
            var measure = CommitHost();
            if (measure is null) Assert.Ignore("không chốt được 処置 chủ nhà — xem _trace.log.");
        }
        finally
        {
            recorder.Dispose();
            _seed.PatchCmt2(cmt.Cd, cmt.Sb, _cmt2Before!);
            Log($"trả MST_CMT2({cmt.Cd},{cmt.Sb}) về 「{_cmt2Before}」");
        }

        Log($"cửa sổ nhìn thấy trong lúc chốt:\n    {recorder.Describe()}");

        // ★ §3b
        Assert.That(recorder.Saw(ParamForm), Is.True,
            $"§3b SAI (hoặc app đã sửa): カルテコメント 「{text}」 còn dấu * mà app KHÔNG mở " +
            $"{ParamForm} パラメータダイアログ.\n" +
            "  WinForm: Chk_CmtAuto mở frm203012 (gType.Auto); một dòng + no_chk = 1 ⇒ frm203012 tự " +
            "gọi fixProc (frm203012.cs:535-546), rồi frmCmt3_Cmt3_SetData gọi frmCmt3_PrmChk TRƯỚC " +
            "frmCmt3_Set_Data2 (frm203002.cs:10036-10038) và chính PrmChk mở frm203048.\n" +
            "  Chuỗi đem so là cột MST_CMT2.cmt_nm, không phải CMTAUTO.cmt_nm: CmtAuto.getCmtAuto " +
            "trả b.cmt_nm qua INNER JOIN MST_CMT2 (COMMON/DBAccess/CmtAuto.cs:79-84). Vá nhầm bảng " +
            "là một cách rất dễ để testcase này đỏ oan.\n" +
            "  cửa sổ đã thấy:\n    " + recorder.Describe());

        Log($"=== KQ-TCB3 === {ParamForm} CÓ mở ⇒ nhánh パラメータダイアログ là nhánh sống trên " +
            "đường 自動適用.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCB4 ← §5d — men = 1 mở 面入力 frm203035
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TCB4 ← §5d — mã đi kèm có men = 1 thì đường chèn tự động phải mở 面入力 frm203035")]
    public void TCB4_Companion_With_Men_Opens_Surface_Input()
    {
        var cd = Settings.ChkAutoCascade.MenBranchTrtCd;
        var sb = Settings.ChkAutoCascade.MenBranchTrtSb;
        var master = _mst.FindMasterRow(TrtDate, cd, sb);
        if (master is null) Assert.Ignore($"Master {TrtDate:yyyy-MM} không có {cd}/{sb}.");

        var (measure, recorder) = CommitWithCompanion(cd, sb);
        if (measure is null) Assert.Ignore("không chốt được 処置 chủ nhà — xem _trace.log.");

        Log($"cửa sổ nhìn thấy trong lúc chốt:\n    {recorder.Describe()}");

        // ★ §5d — 面入力 nằm TRONG frmTrtSel_Let_Trt_Data, tức nó chạy CẢ trên đường
        //   Hide_Let_Trt_Data (không hiện 処置選択), đúng như bản đánh giá mô tả.
        Assert.That(recorder.Saw(MenForm), Is.True,
            $"§5d SAI (hoặc app đã sửa): mã đi kèm {cd}/{sb} có men = 1 mà app KHÔNG mở {MenForm} " +
            "面入力.\n" +
            "  WinForm: điều kiện `vieTrtSel[i][\"men\"] == \"1\"` nằm trong frmTrtSel_Let_Trt_Data " +
            "(frm203016.cs:1563), và Chk_ChkAuto đã đặt men vào ô [6] của tblTrtSel " +
            "(modMain.cs:979) — cùng ô mà CommonInp.makeTable() đặt tên \"men\" (CommonInp.cs:217). " +
            "Hàm đó chạy CẢ trên nhánh Hide_Let_Trt_Data (frm203016.cs:124 → initProc → defData), " +
            "nên 面入力 không cần 処置選択 hiện ra mới mở được.\n" +
            "  cửa sổ đã thấy:\n    " + recorder.Describe());

        Log($"=== KQ-TCB4 === {MenForm} CÓ mở cho {cd}/{sb} ⇒ 面入力 là nhánh sống trên đường " +
            "chk_auto, và contract BE của web (ChkAutoPickResult) chưa mang nổi cờ men.");
    }

    // ── Nội bộ ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Vá ô <c>chkauto</c> của 処置 chủ nhà sang <paramref name="cd"/>/<paramref name="sb"/>,
    /// chốt 処置 chủ nhà, rồi TRẢ LẠI ngay — không đợi <c>OneTimeTearDown</c>.
    ///
    /// <para>Recorder chạy trọn cú chốt và được trả về để testcase hỏi 「đã thấy form nào」.
    /// Nó đã <c>Dispose</c> khi hàm trả về; danh sách cửa sổ vẫn đọc được.</para>
    /// </summary>
    private (AutoSanteiOps.EntryMeasure? Measure, WindowRecorder Recorder) CommitWithCompanion(int cd, int sb)
    {
        var recorder = new WindowRecorder(App.ProcessId);
        AutoSanteiOps.EntryMeasure? measure = null;
        try
        {
            _seed.PatchCompanion(HostCd, HostSb, cd, sb);
            Log($"vá chkauto({HostCd},{HostSb}) → chỉ còn ô cd1 = {cd}/{sb}");

            recorder.Start();
            measure = CommitHost();
        }
        finally
        {
            recorder.Dispose();
            if (_chkAutoBefore is not null)
            {
                _seed.RestoreChkAuto(_chkAutoBefore);
                Log($"trả chkauto({HostCd},{HostSb}) về nguyên trạng: {_chkAutoBefore}");
            }
        }
        return (measure, recorder);
    }

    /// <summary>
    /// Một cú chốt 処置 chủ nhà trên 部位病名行 đã seed. Trả null khi chưa gõ được mã —
    /// testcase tự quyết định Ignore, vì 「không chốt được」 là HARNESS/DATA chứ không phải
    /// câu trả lời cho nhánh đang đo.
    ///
    /// <para>Mỗi ca chốt một lần nữa trên CÙNG 部位病名行: <c>CommitOnSeededRow</c> chèn một
    /// dòng trống ngay dưới nó, nên các cụm của ca trước bị đẩy xuống mà không đổi thứ tự
    /// nội bộ.</para>
    /// </summary>
    private AutoSanteiOps.EntryMeasure? CommitHost()
    {
        using var trace = TestTrace.Begin();
        var seeded = _ops.SeededBuiRow(TrtDate.Day, ToothSelectDialog.DescribeSlot(BuiSlot), DisMark);
        if (seeded is null)
        {
            Log("KHONG thay 部位病名行 seed — HARNESS hong. Luoi:\n  " +
                string.Join("\n  ", _flow.DescribeGrid(40)));
            return null;
        }

        var measure = _ops.CommitOnSeededRow(seeded, HostCd, HostSb, trace);
        if (measure is null || !measure.Enter.Committed)
        {
            Log($"khong chot duoc {HostCd}/{HostSb}: {measure?.Enter.ToString() ?? "khong go duoc ma"}");
            return null;
        }

        Log($"đo được: {measure}");
        foreach (var r in measure.AddedRows) Log($"  + {r}");
        return measure;
    }
}
