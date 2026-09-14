using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// 診療入力 — <b>TẦNG THỨ HAI</b> của cái đuôi một cú chốt 処置, và bốn nhánh mà bản đánh
/// giá parity 「web thiếu port <c>runChkAuto</c>」 nêu ra.
///
/// <para>Luồng <see cref="AutoSanteiChkAutoTests"/> đo tầng MỘT: chốt 処置 → <c>chkauto</c>
/// kéo mã đi kèm xuống lưới. Luồng này đo cái đến SAU đó, và đo bằng cách hỏi thẳng
/// WinForm chứ không đọc code web.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐANG KIỂM LẠI ĐIỀU GÌ
/// ═══════════════════════════════════════════════════════════════════════════════
/// Bản đánh giá parity khẳng định năm điều về WinForm. Mỗi điều được quy về một câu
/// hỏi mà một cú chốt trên máy thật trả lời được:
/// <code>
///   §1  Chk_CmtAuto chạy CẢ HAI nửa, và chạy LẠI cho mã mà chk_auto vừa chèn
///       (modMain.cs:1033)                                            → TCC1 + TCC3
///   §2  dòng chk_auto nằm DƯỚI comment khi CMTAUTO.disp_no > 0
///       (frm203002.cs:10164 kéo con trỏ xuống sau comment)           → TCC2
///   §5a vòng lặp INTERLEAVE: chèn ô i rồi Chk_CmtAuto cho chính nó,
///       xong mới sang ô i+1                                          → TCC3
///   §5b/5c/5d nhánh case 202 / case 549 / case 179 / 面入力 của
///       Chk_ChkAuto                                                  → TCC0 (hỏi DB)
///   §3  fixProc cắt 300 byte + frm203048 cho mỗi dấu *               → TCC0 (hỏi DB)
///   (ngoài danh sách) Chk_ChkAuto_soutyaku 装着料                     → TCC4 + TCC5
/// </code>
///
/// <para><b>Vì sao §5b/5c/5d và §3 chỉ hỏi DB.</b> Chúng là câu hỏi 「nhánh X có chạy
/// không」, mà nhánh X chỉ chạy khi master có dữ liệu rơi vào đó. Không có dòng nào rơi
/// vào ⇒ nhánh là <b>code chết</b>, và một vòng giao diện 2-3 phút cũng không tạo ra được
/// dữ liệu để chạm tới nó (F7: đừng tiêu một vòng UI cho câu hỏi mà một câu SQL trả lời
/// xong). TCC0 in ra con số + ví dụ để người đọc tự kết luận, và assert đúng cái phần
/// KHÔNG đổi theo tenant.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHỮ KÝ BỐN DÒNG — kỳ vọng của TCC1..TCC3, TÍNH TỪ MASTER chứ không hardcode
/// ═══════════════════════════════════════════════════════════════════════════════
/// Chốt <c>204/0</c> 暫間固定(簡単) trên 部位病名行 đã seed thì WinForm phải dựng ĐÚNG bốn
/// dòng, theo ĐÚNG thứ tự này:
/// <code>
///   暫間固定(TFix)set(簡単)              230点   ← mã gõ vào
///   0.3mm結紮線＋ｽｰﾊﾟｰﾎﾞﾝﾄﾞ                0点   ← Chk_CmtAuto(204,0) · CMTAUTO 7551/0
///                                                  disp_no = 2 (> 0) ⇒ DƯỚI 処置
///   装着材料料 (接着性ﾚｼﾞﾝｾﾒﾝﾄ・標準型)     17点   ← Chk_ChkAuto · chkauto(204,0) = 264/3
///                                                  ⇒ nằm DƯỚI comment  ★ §2
///   ルーティングセメント                    0点   ← Chk_CmtAuto(264,3) · CMTAUTO 7510/4
///                                                  ⇒ TẦNG HAI có chạy    ★ §1 + §5a
///   月計 tăng đúng 230 + 17 = 247
/// </code>
///
/// <para>Bốn dòng ấy đến từ BA lần gọi khác nhau trong cùng một cú Enter ô 回
/// (frm203002.cs:5738-5752), nên mỗi dòng thiếu chỉ ra đúng MỘT lần gọi hỏng — đó là lý do
/// fixture tách TCC1/TCC2/TCC3 thay vì assert một cục.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG bấm F9 ⇒ <c>TRNTRN</c> chỉ bị đụng ở vùng seed <c>disp_no &gt;= 9000</c> của đúng
/// ngày test, dọn ở <c>OneTimeTearDown</c>. <b>KHÔNG</b> đụng <c>SIGA</c>: cả 204 lẫn 254
/// đều KHÔNG nằm trong switch của <c>frm203016.IregCodChk</c> (frm203016.cs:1015-1100) —
/// khác hẳn 179 抜歯 của luồng <see cref="AutoSanteiChkAutoTests"/>.
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class ChkAutoCascadeTests : UiTestBase
{
    private ChkAutoDb _chk = null!;
    private ChkAutoCascadeDb _cas = null!;
    private SigaKonDb _mst = null!;
    private SigaToothFlow _flow = null!;
    private AutoSanteiOps _ops = null!;

    /// <summary>処置 đem chốt + mã đi kèm + hai カルテコメント — tra từ master ở OneTimeSetUp.</summary>
    private MstTrtRow? _trigger;
    private ChkAutoRow? _chkRow;
    private IReadOnlyList<CmtAutoRow> _triggerCmts = [];

    /// <summary>Ô <c>chkauto</c> ĐẦU TIÊN dẫn tới một 処置 — tầng hai treo vào chính nó.</summary>
    private (int Cd, int Sb)? _companion;
    private MstTrtRow? _companionMaster;
    private IReadOnlyList<CmtAutoRow> _companionCmts = [];

    /// <summary>Tên mà LƯỚI in ra cho từng カルテコメント (MST_CMT2), khoá 「cmt_cd/cmt_sb」.</summary>
    private readonly Dictionary<string, string> _cmtNames = [];

    private SoutyakuRow? _triggerSet;
    private SoutyakuRow? _soutyakuSet;
    private MstTrtRow? _soutyakuTrigger;

    /// <summary>Lưới NGAY SAU cú chốt của TCC1 — TCC2/TCC3/TCC4 đọc lại đúng ảnh chụp này.</summary>
    private IReadOnlyList<RegiRow> _afterCommit = [];
    private AutoSanteiOps.EntryMeasure? _measure;
    private bool _committed;

    private int TrtCd => Settings.ChkAutoCascade.TrtCd;
    private int TrtSb => Settings.ChkAutoCascade.TrtSb;

    // 部位/病名 dùng CHUNG với luồng AutoSanteiChkAuto — hai luồng seed cùng một 部位病名行.
    private int BuiSlot => Settings.AutoSantei.BuiSlot;
    private int DisCd => Settings.AutoSantei.DisCd;
    private int DisSb => Settings.AutoSantei.DisSb;
    private const string DisMark = "Ｃ";

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        Settings.ChkAutoCascade.AllowSave
            ? null
            : "Cần chkAutoCascade.allowSave = true (hoặc OCHA_CHK_AUTO_CASCADE_ALLOW_SAVE=1). " +
              $"Fixture seed 部位病名行 vào TRNTRN (vùng disp_no >= {ChkAutoDb.SeedDispBase} của ĐÚNG " +
              $"ngày test) rồi chốt {Settings.ChkAutoCascade.TrtCd}/{Settings.ChkAutoCascade.TrtSb}. " +
              "KHÔNG bấm F9 và KHÔNG đụng SIGA — mã đem chốt không nằm trong switch của IregCodChk.";

    /// <summary>
    /// Seed 部位病名行 TRƯỚC KHI APP MỞ — lưới chỉ đọc <c>TRNTRN</c> đúng một lần lúc mở
    /// 診療入力, seed sau đó là seed vào hư không.
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (chk is null || !Settings.ChkAutoCascade.AllowSave) return;
        if (chk.ProbeError() is not null) return;

        // F20 — chụp nguyên trạng, IN RA, rồi mới đặt mốc.
        Log("nguyên trạng dòng 処置 của ngày test:\n  " +
            string.Join("\n  ", chk.DescribeDayRows(PatNo, TrtDate)));

        // ChkAutoDb.SeedBuiDisRow đứng sau cờ autoSantei.allowSave, mà luồng này có cờ
        // riêng ⇒ mượn ChkAutoDb với cờ của luồng này.
        var seeder = ChkAutoDb.CreateOrNull(WithSeedPermission());
        var n = seeder!.SeedBuiDisRow(PatNo, TrtDate, BuiSlot, Settings.AutoSantei.BuiVal,
                                      DisCd, DisSb,
                                      dspBui: ToothSelectDialog.DescribeSlot(BuiSlot),
                                      dspDis: DisMark);
        Log($"seed 部位病名行: {n} dòng — 部位 ô {BuiSlot} ({ToothSelectDialog.DescribeSlot(BuiSlot)}), " +
            $"病名 {DisCd}/{DisSb} 「{DisMark}」, disp_no {ChkAutoDb.SeedDispBase + 1}, " +
            $"ngày {TrtDate:yyyy-MM-dd}.");
    }

    /// <summary>
    /// Bản sao cấu hình với <c>autoSantei.allowSave</c> bật theo cờ của luồng NÀY.
    ///
    /// <para><see cref="ChkAutoDb"/> gác mọi lệnh ghi sau <c>autoSantei.allowSave</c>. Luồng
    /// này cố ý KHÔNG dùng chung cờ đó (cờ kia còn mở cả đường ghi <c>SIGA</c> cho 抜歯),
    /// nên mượn lại helper bằng cách dựng một bản cấu hình chỉ khác đúng ô ấy. Rẻ hơn và
    /// ít rủi ro hơn là thêm một tham số cờ vào chữ ký của <c>ChkAutoDb</c>.</para>
    /// </summary>
    private TestSettings WithSeedPermission()
    {
        var clone = new TestSettings { Db = Settings.Db };
        clone.AutoSantei.AllowSave = Settings.ChkAutoCascade.AllowSave;
        return clone;
    }

    [OneTimeSetUp]
    public void CascadeOneTimeSetUp()
    {
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (chk is null) IgnoreWithReason("Cần DB để đọc chkauto/CMTAUTO — " + (DbUnavailableReason ?? "db.enabled = false"));
        if (chk!.ProbeError() is { } err) IgnoreWithReason($"không kết nối được SQL Server: {err}");
        _chk = chk;
        _cas = ChkAutoCascadeDb.CreateOrNull(Settings)!;
        _mst = SigaKonDb.CreateOrNull(Settings, allowWrite: false)!;

        _trigger = _mst.FindMasterRow(TrtDate, TrtCd, TrtSb);
        _chkRow = _chk.ReadChkAuto(TrtCd, TrtSb);
        _triggerCmts = _chk.FindCmtAutos(TrtCd, TrtSb);

        _companion = _chkRow?.TreatmentPairs.FirstOrDefault();
        if (_companion is { } c && c.Cd > 0)
        {
            _companionMaster = _mst.FindMasterRow(TrtDate, c.Cd, c.Sb);
            _companionCmts = _chk.FindCmtAutos(c.Cd, c.Sb);
        }
        else _companion = null;

        foreach (var cmt in _triggerCmts.Concat(_companionCmts))
        {
            var nm = _chk.ResolveCmtName(cmt.CmtCd, cmt.CmtSb);
            if (!string.IsNullOrWhiteSpace(nm)) _cmtNames[$"{cmt.CmtCd}/{cmt.CmtSb}"] = nm!;
        }

        _triggerSet = _cas.ReadSoutyaku(TrtDate, TrtCd, TrtSb);
        _soutyakuTrigger = _mst.FindMasterRow(TrtDate, Settings.ChkAutoCascade.SoutyakuTrtCd,
                                              Settings.ChkAutoCascade.SoutyakuTrtSb);
        _soutyakuSet = _cas.ReadSoutyaku(TrtDate, Settings.ChkAutoCascade.SoutyakuTrtCd,
                                         Settings.ChkAutoCascade.SoutyakuTrtSb);

        Log("╔══ CHỮ KÝ KỲ VỌNG (tính từ master, KHÔNG hardcode) ══");
        Log($"║ tầng 0  処置 gõ vào : {_trigger?.ToString() ?? "(master KHÔNG có)"}");
        foreach (var cmt in _triggerCmts) Log($"║ tầng 1a comment     : {Describe(cmt)}");
        Log($"║ tầng 1b mã đi kèm   : {_companionMaster?.ToString() ?? "(chkauto KHÔNG có ô 処置 nào)"}");
        foreach (var cmt in _companionCmts) Log($"║ tầng 2  comment     : {Describe(cmt)}  ★ chỗ §1 đang hỏi");
        Log($"║ 装着料 của mã gõ vào: {_triggerSet?.ToString() ?? "(không có dòng ⇒ soutyaku thoát sớm)"}");
        Log($"║ 装着料 của mã đối chứng {Settings.ChkAutoCascade.SoutyakuTrtCd}/" +
            $"{Settings.ChkAutoCascade.SoutyakuTrtSb}: {_soutyakuSet?.ToString() ?? "(không có dòng)"}");
        Log("╚════════════════════════════════════════════════════");
    }

    private string Describe(CmtAutoRow c) =>
        $"{c} — lưới sẽ in 「{_cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", "(MST_CMT2 KHÔNG có)")}」";

    [SetUp]
    public void CascadeSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new AutoSanteiOps(_flow);
    }

    [OneTimeTearDown]
    public void CascadeOneTimeTearDown()
    {
        if (!Settings.ChkAutoCascade.AllowSave) return;
        try
        {
            var cleaner = ChkAutoDb.CreateOrNull(WithSeedPermission())!;
            Log("dọn: " + cleaner.DeleteSeededRows(PatNo, TrtDate) + " dòng vùng seed.");
            if (Settings.ChkAutoCascade.AllowRowCleanup)
            {
                Log("dọn: " + cleaner.DeleteCompanionRows(PatNo, TrtDate, TrtCd, TrtSb) +
                    " dòng mang mã đem chốt + mã đi kèm.");
                Log("dọn: " + cleaner.DeleteCompanionRows(PatNo, TrtDate,
                        Settings.ChkAutoCascade.SoutyakuTrtCd, Settings.ChkAutoCascade.SoutyakuTrtSb) +
                    " dòng của mã đối chứng 装着料.");
            }
        }
        catch (Exception e) { Log($"dọn TRNTRN HỎNG: {e.Message}"); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC0 — chỉ hỏi DB. Trả lời §3, §5b, §5c, §5d và dựng tiền đề cho TCC1..TCC5
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TCC0 (chỉ DB) — master có gì để đo tầng hai, và bốn nhánh 「web thiếu」 có BAO GIỜ chạy không")]
    public void TCC0_Master_Decides_Which_Branches_Are_Reachable()
    {
        var companions = _cas.ScanCompanions();
        Log($"chkauto: {_chk.CountRows()} dòng, {companions.Count} ô đi kèm khác 0, " +
            $"{companions.Select(s => s.Key).Distinct().Count()} mã đi kèm PHÂN BIỆT.");

        // ── Tiền đề của TCC1..TCC3 ───────────────────────────────────────────
        Assert.Multiple(() =>
        {
            Assert.That(_trigger, Is.Not.Null,
                $"Master {TrtDate:yyyy-MM} không có {TrtCd}/{TrtSb} ⇒ không gõ được mã. " +
                "HARNESS/DATA, không phải app: đổi chkAutoCascade.trtCd hoặc patient.trtDate.");

            Assert.That(_companion, Is.Not.Null,
                $"chkauto({TrtCd},{TrtSb}) không có ô nào dẫn tới 処置 ⇒ không có TẦNG HAI để đo. " +
                "Đổi chkAutoCascade.trtCd sang một mã có mã đi kèm mà chính mã đi kèm đó có CMTAUTO.");

            Assert.That(_companionMaster, Is.Not.Null,
                $"Mã đi kèm {_companion?.Cd}/{_companion?.Sb} không có trong master {TrtDate:yyyy-MM}. " +
                "Chk_ChkAuto tra chính bảng đó (modMain.cs:942-948) và bỏ qua khi không thấy.");

            Assert.That(_companionCmts.Where(c => c.MakesOwnRow).ToList(), Is.Not.Empty,
                $"CMTAUTO({_companion?.Cd},{_companion?.Sb}) không có dòng nào sinh dòng riêng ⇒ " +
                "cú gọi Chk_CmtAuto ở modMain.cs:1033 KHÔNG để lại dấu vết nào trên lưới, và §1 " +
                "không quan sát được. Đổi chkAutoCascade.trtCd.");

            // §2 chỉ đo được khi comment của chính mã gõ vào nằm DƯỚI nó.
            Assert.That(_triggerCmts.Any(c => c.DispNo > 0), Is.True,
                $"CMTAUTO({TrtCd},{TrtSb}) không có dòng nào disp_no > 0 ⇒ không dựng được cảnh " +
                "「comment nằm dưới 処置」 và TCC2 chẳng đo được thứ tự nào. " +
                "Các dòng đang có: [" + string.Join(" / ", _triggerCmts.Select(c => c.ToString())) + "]");
        });

        // ── §5b/§5c/§5d — nhánh riêng của Chk_ChkAuto có dữ liệu chạm tới không ─
        var special = companions.Where(s => ChkAutoCascadeDb.SpecialCaseCodes.Contains(s.Cd)).ToList();
        Log($"=== ô đi kèm rơi vào nhánh RIÊNG (case 202/549/179/333, modMain.cs:995-1026): " +
            $"{special.Count} ô ===");
        foreach (var s in special) Log("  " + s);

        var trtTable = _mst.ActiveTrtTable(TrtDate);
        var needMen = _cas.CompanionsNeedingMen(TrtDate, trtTable);
        Log($"=== ô đi kèm mà master đặt men <> 0 (⇒ frm203035 / frm902003, frm203016.cs:1563): " +
            $"{needMen.Count} ô ===");
        foreach (var (slot, men) in needMen) Log($"  {slot} men={men}");

        var receiptSlots = companions.Where(s => s.Cd is >= ChkAutoRow.ReceiptCodeMin
                                                     and <= ChkAutoRow.ReceiptCodeMax).ToList();
        Log($"=== ô đi kèm rơi vào dải 摘要 {ChkAutoRow.ReceiptCodeMin}..{ChkAutoRow.ReceiptCodeMax} " +
            $"(nhánh modMain.cs:864-908): {receiptSlots.Count} ô ===");
        foreach (var s in receiptSlots) Log("  " + s);

        // ── §3 — fixProc cắt 300 byte, và frm203048 cho dấu * ────────────────
        var maxLen = _cas.MaxCmt2ByteLength();
        var colSize = _cas.Cmt2ColumnSize();
        var starCount = _cas.CountCmtAutoWithAsterisk();
        Log($"=== MST_CMT2.cmt_nm: cột varchar({colSize}), chuỗi dài nhất đang có {maxLen} byte " +
            $"(ngưỡng cắt của fixProc = {ChkAutoCascadeDb.ColumnLengthDspTrt}) ===");
        Log($"=== CMTAUTO còn dấu * (⇒ frm203048): {starCount} dòng ===");
        foreach (var line in _cas.CmtAutoRowsWithAsterisk()) Log("  " + line);

        // ── §5b, vế 549: master không có dòng nào ⇒ switch không bao giờ chạy tới ──
        var has549 = _mst.FindMasterRows(TrtDate, 549).Count;
        Log($"=== master {TrtDate:yyyy-MM} có {has549} dòng mã 549 ===");

        // ⛔ ĐỪNG đổi các assert dưới đây thành 「phải có」. Chúng CỐ Ý khẳng định
        //    「trên master này KHÔNG có dữ liệu nào chạm tới nhánh đó」 — đó chính là câu
        //    trả lời cho §5b/§5c/§5d. Đỏ ở đây KHÔNG phải app hỏng: nó nghĩa là master vừa
        //    đổi và bốn nhánh kia đã trở nên quan sát được ⇒ phải viết thêm testcase UI cho
        //    chúng, và kết luận 「web thiếu port nhưng không ai chạm tới」 hết hiệu lực.
        Assert.Multiple(() =>
        {
            Assert.That(special, Is.Empty,
                "MASTER ĐÃ ĐỔI: giờ đã có ô chkauto dẫn tới 202 / 549 / 179 / 333, tức các nhánh " +
                "RIÊNG của Chk_ChkAuto (modMain.cs:995-1026) đã chạy được ở runtime.\n" +
                "  Trước đây không ô nào chạm tới ⇒ 「web thiếu port case 202/549」 là lệch KHÔNG " +
                "quan sát được, còn 「case 179 so nhầm cột」 (modMain.cs:1013 so Rows[0][2] = trt_nm " +
                "với \"5\", trong khi 枝番 nằm ở Rows[0][1] — CommonInp.cs:210-218) là bug CHẾT HAI LẦN.\n" +
                "  Ô mới: [" + string.Join(" / ", special.Select(s => s.ToString())) + "]");

            Assert.That(needMen, Is.Empty,
                "MASTER ĐÃ ĐỔI: giờ đã có mã đi kèm mang men <> 0 ⇒ đường chèn tự động sẽ mở tiếp " +
                "面入力 frm203035 (men = 1) hoặc 部位入力 frm902003 (men = 2), frm203016.cs:1563/:1588. " +
                "Trước đây không mã nào như vậy ⇒ 「web thiếu 面入力 trên đường chk_auto」 là lệch " +
                "không quan sát được. Ô mới: [" +
                string.Join(" / ", needMen.Select(t => $"{t.Slot} men={t.Men}")) + "]");

            // Mốc MẠNH: không phải 「dữ liệu hôm nay ngắn」 mà 「cột không chứa nổi」.
            Assert.That(colSize, Is.InRange(1, ChkAutoCascadeDb.ColumnLengthDspTrt),
                $"LƯỢC ĐỒ ĐÃ ĐỔI: MST_CMT2.cmt_nm giờ là varchar({colSize}), đủ chứa chuỗi vượt " +
                $"ngưỡng {ChkAutoCascadeDb.ColumnLengthDspTrt} byte mà fixProc cắt (frm203012.cs:1360).\n" +
                "  Trước đây cột chỉ varchar(60) ⇒ trên đường 自動適用 nhánh cắt + dòng dư " +
                "trt_cd 7999 / disp_no 1 (frm203012.cs:1367-1376) là code CHẾT: chữ mà frm203012 đem " +
                "cắt lấy CHÍNH TỪ cột này (CmtAuto.getCmtAuto trả b.cmt_nm qua INNER JOIN MST_CMT2, " +
                "COMMON/DBAccess/CmtAuto.cs:79-84 → frm203012.cs:535-546).\n" +
                "  ⇒ 「web không có hằng số COLUMN_LENGTH_DSP_TRT」 là lệch THẬT nhưng chỉ trên đường " +
                "GÕ TAY trong frm203012, không phải trên đường chk_auto.");

            Assert.That(has549, Is.Zero,
                $"MASTER ĐÃ ĐỔI: {TrtDate:yyyy-MM} giờ có {has549} dòng mã 549. Trước đây không có " +
                "dòng nào, mà Chk_ChkAuto tra master TRƯỚC rồi mới vào switch (modMain.cs:948-958): " +
                "`tblTrt.Rows.Count == 0` ⇒ nhánh rỗng, `case 549` không bao giờ chạy tới. " +
                "Giờ có dòng thì nhánh ấy quan sát được ⇒ viết thêm ca UI trong " +
                "ChkAutoSeededBranchTests.");
        });

        // Dấu * thì NGƯỢC LẠI: có dữ liệu thật, nên nhánh frm203048 là nhánh SỐNG.
        Assert.That(starCount, Is.GreaterThan(0),
            "Không còn dòng CMTAUTO nào chứa dấu * ⇒ nhánh frmCmt3_PrmChk → frm203048 " +
            "(frm203002.cs:10052-10071) trở thành code chết, và câu 「web thiếu パラメータダイアログ」 " +
            "không còn quan sát được. Nếu master thật sự đã bỏ hết dấu * thì xoá assert này.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC1 — §1: tầng hai có chạy không
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCC1 — chốt 処置: mã đi kèm phải kéo theo カルテコメント CỦA CHÍNH NÓ (modMain.cs:1033)")]
    public void TCC1_Companion_Brings_Its_Own_KarteComment()
    {
        using var trace = TestTrace.Begin();
        RequireMasterData();

        var seeded = _ops.SeededBuiRow(TrtDate.Day, ToothSelectDialog.DescribeSlot(BuiSlot), DisMark);
        Assert.That(seeded, Is.Not.Null,
            $"Không thấy 部位病名行 vừa seed (病名 「{DisMark}」, ngày {TrtDate:yyyy-MM-dd}) ⇒ HARNESS " +
            "hỏng, sửa trước. Lưới đang có:\n  " + string.Join("\n  ", _flow.DescribeGrid(40)));

        var measure = _ops.CommitOnSeededRow(seeded!, TrtCd, TrtSb, trace);
        Assert.That(measure, Is.Not.Null,
            "Không dựng được chỗ để gõ mã ⇒ HARNESS hỏng. Đọc _trace.log và ảnh bước cuối.");
        Assert.That(measure!.Enter.Committed, Is.True,
            $"Không chốt được 枝番 {TrtSb} của mã {TrtCd} trong 処置選択. {measure.Enter}");

        _measure = measure;
        _afterCommit = measure.After.Where(AutoSanteiOps.EntryMeasure.IsData).ToList();
        _committed = true;

        Log($"đo được: {measure}");
        foreach (var r in measure.AddedRows) Log($"  + {r}");

        Assert.That(AutoSanteiOps.RowOf(measure.AddedRows, _trigger!), Is.Not.Null,
            $"Chính dòng vừa chốt ({_trigger}) cũng không có trên lưới ⇒ HARNESS hỏng, đừng đọc tiếp. " +
            "Các dòng thêm được: [" + string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");

        var companionRow = AutoSanteiOps.RowOf(measure.AddedRows, _companionMaster!);
        Assert.That(companionRow, Is.Not.Null,
            $"Tầng MỘT đã hỏng: chốt {TrtCd}/{TrtSb} mà lưới không có 「{_companionMaster!.CctNm}」 " +
            $"({_companion!.Value.Cd}/{_companion.Value.Sb}). Sửa chỗ này trước khi nói gì về tầng hai — " +
            "xem AutoSanteiChkAutoTests.TC1 và mục 「診療チェック có thể loại mã đi kèm」 của README.\n" +
            "  lưới: [" + string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");

        // ── §1 — đây là chỗ đang hỏi ─────────────────────────────────────────
        Assert.Multiple(() =>
        {
            foreach (var c in _companionCmts.Where(c => c.MakesOwnRow))
            {
                var shown = _cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", c.CmtNm);
                Assert.That(AutoSanteiOps.RowByName(measure.AddedRows, shown), Is.Not.Null,
                    $"§1 SAI (hoặc app đổi): lưới thiếu カルテコメント 「{shown}」 ({c.CmtCd}/{c.CmtSb}) " +
                    $"của mã ĐI KÈM {_companion!.Value.Cd}/{_companion.Value.Sb}.\n" +
                    "  WinForm: Chk_ChkAuto chèn mã đi kèm xong gọi LẠI Chk_CmtAuto cho chính mã đó " +
                    "(modMain.cs:1033), và Chk_CmtAuto chạy CẢ HAI nửa — prgCmtAuto (摘要) rồi tra " +
                    "CMTAUTO ⇒ frm203012 (カルテ, modMain.cs:779-806).\n" +
                    "  ĐỎ Ở ĐÂY nghĩa là gì: (a) WinForm THẬT SỰ không làm tầng hai ⇒ bản đánh giá " +
                    "parity §1 sai, và bản web đang ĐÚNG; (b) hoặc batch CMTAUTO này cần người chọn " +
                    $"(số dòng = {_companionCmts.Count}, no_chk nhỏ nhất = " +
                    $"{_companionCmts.Min(x => x.NoChk)}) ⇒ nó đi đường カルテ記載選択 chứ không tự áp " +
                    "dụng (frm203012.cs:536) — đọc ảnh chụp xem có hộp thoại nào đang mở.\n" +
                    "  lưới: [" + string.Join(" / ", measure.AddedRows.Select(r => r.Ryo)) + "]");
            }
        });

        // ── Mốc NGOÀI lưới (F12) ─────────────────────────────────────────────
        var expectedDelta = _trigger!.Score1 + _companionMaster!.Score1;
        Assert.That(measure.PointDelta, Is.EqualTo(expectedDelta),
            $"月計点数 phải tăng {_trigger.Score1} (mã chốt) + {_companionMaster.Score1} (mã đi kèm) = " +
            $"{expectedDelta}, đang tăng {measure.PointDelta?.ToString() ?? "?"}. Hai dòng カルテコメント " +
            "là 0 点 nên KHÔNG vào tổng — lệch ở đây nghĩa là có dòng lạ được chèn " +
            $"(tổng 点×回 các dòng vừa thêm = {measure.AddedPointSum}).");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC2 — §2: dòng chk_auto nằm TRÊN hay DƯỚI comment
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCC2 — §2: CMTAUTO.disp_no > 0 ⇒ comment nằm dưới 処置, và dòng chk_auto nằm DƯỚI comment")]
    public void TCC2_ChkAuto_Row_Sits_Below_The_Comment()
    {
        RequireCommitted();

        var below = _triggerCmts.Where(c => c.DispNo > 0).ToList();
        if (below.Count == 0)
            Assert.Ignore($"CMTAUTO({TrtCd},{TrtSb}) không có dòng disp_no > 0 — TCC0 đã nói rõ.");

        var trtIdx = AutoSanteiOps.IndexOf(_afterCommit, _trigger!);
        var compIdx = AutoSanteiOps.IndexOf(_afterCommit, _companionMaster!);
        Assert.That(trtIdx, Is.GreaterThanOrEqualTo(0), $"Không thấy dòng 処置 「{_trigger!.CctNm}」.");
        Assert.That(compIdx, Is.GreaterThanOrEqualTo(0),
            $"Không thấy dòng mã đi kèm 「{_companionMaster!.CctNm}」 — TCC1 phải xanh trước.");

        Log("thứ tự lưới quanh cú chốt:");
        foreach (var (r, i) in _afterCommit.Select((r, i) => (r, i)).Where(t => t.i >= trtIdx - 1))
            Log($"  [{i}] {r}");

        Assert.Multiple(() =>
        {
            foreach (var c in below)
            {
                var shown = _cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", c.CmtNm);
                var idx = AutoSanteiOps.IndexByName(_afterCommit, shown);
                Assert.That(idx, Is.GreaterThanOrEqualTo(0),
                    $"Không thấy カルテコメント 「{shown}」 ({c.CmtCd}/{c.CmtSb}) trên lưới ⇒ nhánh " +
                    "Chk_CmtAuto của CHÍNH mã gõ vào đã hỏng; TCC2 không kết luận được gì.");
                if (idx < 0) continue;

                Assert.That(idx, Is.GreaterThan(trtIdx),
                    $"CMTAUTO.disp_no = {c.DispNo} (> 0) ⇒ 「{shown}」 phải nằm DƯỚI " +
                    $"「{_trigger!.CctNm}」 (frm203002.cs:10108 AddRow tại con trỏ), đang ở trên.");

                // ★ §2 — câu hỏi chính của testcase này.
                Assert.That(compIdx, Is.GreaterThan(idx),
                    $"§2 SAI (hoặc app đổi): dòng chk_auto 「{_companionMaster!.CctNm}」 (index {compIdx}) " +
                    $"phải nằm DƯỚI カルテコメント 「{shown}」 (index {idx}), nhưng đang nằm TRÊN.\n" +
                    "  WinForm: frmCmt3_Set_Data2 chèn comment rồi kéo con trỏ xuống " +
                    "hFG1[X, intTempRow + 1] — tức DƯỚI comment vừa chèn (frm203002.cs:10164). " +
                    "Chk_ChkAuto chạy SAU đó (frm203002.cs:5752) và AddRow tại đúng con trỏ ấy.\n" +
                    "  ĐỎ Ở ĐÂY nghĩa là gì: bản đánh giá parity §2 nói WinForm đặt hàng chk_auto " +
                    "DƯỚI comment còn web đặt TRÊN. Nếu WinForm cũng đặt TRÊN thì hai bên vốn đã " +
                    "khớp và §2 sai — nhưng kiểm ảnh chụp trước: comment 0 点 dễ bị đọc nhầm dòng.\n" +
                    "  lưới: [" + string.Join(" / ", _afterCommit.Select(r => r.Ryo)) + "]");
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC3 — §5a: interleave — comment của tầng hai bám ngay dưới mã đi kèm
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCC3 — §5a: mỗi mã đi kèm được Chk_CmtAuto NGAY sau khi chèn, nên comment bám liền nó")]
    public void TCC3_Cascade_Comment_Sticks_To_Its_Own_Companion()
    {
        RequireCommitted();

        var own = _companionCmts.Where(c => c.MakesOwnRow).ToList();
        if (own.Count == 0) Assert.Ignore("mã đi kèm không có CMTAUTO sinh dòng riêng — TCC0 đã nói rõ.");

        var compIdx = AutoSanteiOps.IndexOf(_afterCommit, _companionMaster!);
        Assert.That(compIdx, Is.GreaterThanOrEqualTo(0),
            $"Không thấy dòng mã đi kèm 「{_companionMaster!.CctNm}」 — TCC1 phải xanh trước.");

        Assert.Multiple(() =>
        {
            foreach (var c in own)
            {
                var shown = _cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", c.CmtNm);
                var idx = AutoSanteiOps.IndexByName(_afterCommit, shown);
                Assert.That(idx, Is.GreaterThanOrEqualTo(0), $"Không thấy 「{shown}」 — xem TCC1.");
                if (idx < 0) continue;

                if (c.DispNo > 0)
                    Assert.That(idx, Is.EqualTo(compIdx + 1),
                        $"§5a SAI (hoặc app đổi): 「{shown}」 (disp_no {c.DispNo} > 0) phải nằm LIỀN " +
                        $"DƯỚI 「{_companionMaster!.CctNm}」 — index {compIdx + 1}, đang ở {idx}.\n" +
                        "  WinForm INTERLEAVE: chèn ô i xong là gọi Chk_CmtAuto cho chính ô ấy ngay " +
                        "(modMain.cs:1033) rồi mới sang ô i+1, nên comment không thể trôi khỏi mã của " +
                        "nó. Web gom mọi ô rồi mới chạy cascade một lượt ⇒ thứ tự khác.\n" +
                        "  lưới: [" + string.Join(" / ", _afterCommit.Select(r => r.Ryo)) + "]");
                else
                    Assert.That(idx, Is.EqualTo(compIdx - 1),
                        $"§5a: 「{shown}」 (disp_no {c.DispNo} < 0) phải nằm LIỀN TRÊN " +
                        $"「{_companionMaster!.CctNm}」 — index {compIdx - 1}, đang ở {idx}.");
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC4 — 装着料: mflg = 1 ⇒ KHÔNG có dòng nào
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TCC4 — Chk_ChkAuto_soutyaku: mflg = 1 ⇒ thoát sớm, cú chốt KHÔNG để lại dòng 装着料")]
    public void TCC4_Soutyaku_Skips_When_Mflg_Is_One()
    {
        RequireCommitted();

        if (_triggerSet is null)
            Assert.Ignore($"{_cas.ActiveSetTable(TrtDate)} không có dòng ({TrtCd},{TrtSb}) ⇒ " +
                          "Chk_ChkAuto_soutyaku thoát ở modMain.cs:1091, không đo được cờ mflg.");
        if (_triggerSet!.InsertsRow)
            Assert.Ignore($"{_triggerSet} — mã đem chốt lại là mã CÓ chèn 装着料; ô này chỉ đo nhánh " +
                          "thoát sớm. Đổi chkAutoCascade.trtCd hoặc chuyển kỳ vọng sang TCC5.");

        var names = _afterCommit.Select(r => AutoSanteiOps.Norm(r.Ryo)).ToList();
        Assert.That(names.Any(n => n.Contains("装着料")), Is.False,
            $"{_triggerSet} nhưng lưới VẪN có dòng 「装着料」.\n" +
            "  WinForm: Chk_ChkAuto_soutyaku thoát ngay ở `if (mflg == 1) return` (modMain.cs:1121), " +
            "TRƯỚC cả frmInpMain.AddRow (:1125) ⇒ không dòng nào được chèn.\n" +
            "  Đỏ ở đây nghĩa là app KHÔNG đọc mflg từ bảng mà SET_SEL chỉ tới — kiểm " +
            $"ModCommon.Get_strSet cho ngày {TrtDate:yyyy-MM-dd} (đang là {_triggerSet.Table}).\n" +
            "  lưới: [" + string.Join(" / ", _afterCommit.Select(r => r.Ryo)) + "]");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCC5 — 装着料: ĐỐI CHỨNG mflg = 0 ⇒ CÓ dòng
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TCC5 — ĐỐI CHỨNG: cùng đường nhập nhưng mflg = 0 ⇒ phải có dòng 装着料 tự chèn")]
    public void TCC5_Soutyaku_Inserts_When_Mflg_Is_Zero()
    {
        using var trace = TestTrace.Begin();
        RequireCommitted();

        if (_soutyakuSet is null || !_soutyakuSet.InsertsRow)
            Assert.Ignore($"Mã đối chứng {Settings.ChkAutoCascade.SoutyakuTrtCd}/" +
                          $"{Settings.ChkAutoCascade.SoutyakuTrtSb}: {_soutyakuSet?.ToString() ?? "không có dòng 装着料"} " +
                          "⇒ không đối chứng được. Đổi chkAutoCascade.soutyakuTrtCd sang một mã mflg = 0.");
        if (_soutyakuTrigger is null)
            Assert.Ignore($"Master {TrtDate:yyyy-MM} không có {Settings.ChkAutoCascade.SoutyakuTrtCd}/" +
                          $"{Settings.ChkAutoCascade.SoutyakuTrtSb}.");

        var seeded = _ops.SeededBuiRow(TrtDate.Day, ToothSelectDialog.DescribeSlot(BuiSlot), DisMark);
        Assert.That(seeded, Is.Not.Null, "Không còn thấy 部位病名行 seed ⇒ HARNESS hỏng.");

        var measure = _ops.CommitOnSeededRow(seeded!, Settings.ChkAutoCascade.SoutyakuTrtCd,
                                             Settings.ChkAutoCascade.SoutyakuTrtSb, trace);
        if (measure is null || !measure.Enter.Committed)
            Assert.Ignore($"Không chốt được mã đối chứng {_soutyakuTrigger} ({measure?.Enter.ToString() ?? "không gõ được"}). " +
                          "補綴 thường đòi tiền đề riêng (形成 cùng răng, 病名 phù hợp) — đây là DỮ LIỆU, " +
                          "không phải app. TCC4 vẫn đứng một mình được, chỉ mất vế đối chứng.");

        Log($"đo được (đối chứng): {measure}");
        foreach (var r in measure.AddedRows) Log($"  + {r}");

        var soutyaku = measure.AddedRows
            .FirstOrDefault(r => AutoSanteiOps.Norm(r.Ryo).Contains("装着料"));
        Assert.That(soutyaku, Is.Not.Null,
            $"{_soutyakuSet} nhưng lưới KHÔNG có dòng 「装着料」 nào sau cú chốt.\n" +
            "  WinForm: Chk_ChkAuto_soutyaku đi qua `if (mflg == 1) return` (modMain.cs:1121) rồi " +
            "AddRow + đặt tên cứng 「装着料」 (modMain.cs:1125, :1173) và chèn bằng " +
            $"frm203016_Hide_Let_Trt_Data — mã chèn là {_soutyakuSet!.InsertedTrtCd}/0 " +
            $"(score1 = {_soutyakuSet.Score1}, modMain.cs:1147-1156).\n" +
            "  ĐỎ Ở ĐÂY nghĩa là gì: (a) nhánh 装着料自動算定 không chạy — đúng như bản đánh giá nói " +
            "về phía web, và giờ đo được ở phía WinForm; (b) hoặc 部位 không phải răng thuộc " +
            $"unit của {_soutyakuTrigger} nên 回 = 0 và cả ba lệnh gọi bị đóng cửa " +
            "(frm203002.cs:5745) — kiểm ô 回 của dòng vừa chốt trong _trace.log.\n" +
            "  lưới: [" + string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");
    }

    // ── Nội bộ ───────────────────────────────────────────────────────────────

    private void RequireMasterData()
    {
        if (_trigger is null || _companion is null || _companionMaster is null)
            Assert.Ignore("Master/chkauto thiếu dữ liệu để đo tầng hai — TCC0 nói rõ thiếu gì.");
    }

    /// <summary>
    /// TCC2..TCC5 đọc lại chính lưới của cú chốt trong TCC1 (TCC5 còn chốt thêm một mã nữa
    /// TRÊN lưới đó). Một cú chốt tốn 2-3 phút giao diện, mà bốn câu hỏi này đều trả lời
    /// được từ cùng một cú — chạy riêng chúng là vô nghĩa.
    /// </summary>
    private void RequireCommitted()
    {
        if (!_committed || _afterCommit.Count == 0)
            Assert.Ignore("TCC1 chưa chốt được 処置 — các TC sau đọc lại chính lưới của cú chốt đó. " +
                          "Sửa TCC1 trước.");
    }
}
