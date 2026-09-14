using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// 診療入力 — <b>Phase 2</b> của cặp parity 「thứ tự 自動算定 ↔ カルテコメント」.
///
/// <para><b>Vế WinForm của <c>TC-3</c> / <c>TC-4</c> / <c>TC-5</c> trong
/// <c>../../../../../web-tenant-tests/tests/auto-santei/chk-auto-comment-order.spec.ts</c>.</b>
/// Hai bên đo CÙNG một thao tác, từ CÙNG một trạng thái xuất phát, với CÙNG cách tính kỳ
/// vọng — có vậy thì đỏ/xanh mới quy được cho app chứ không cho harness.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TC0  ←  (không có bên web)  mốc harness: master có đủ dữ liệu Phase 2 chưa
///   TC3  ←  TC-3  カルテコメント còn `*` phải bung frm203048 TRƯỚC khi ghi xuống lưới
///   TC4  ←  TC-4  disp_no vẫn quyết định TRÊN/DƯỚI sau khi đã điền tham số
///   TC5  ←  TC-5  dòng chk_auto nằm dưới cụm カルテコメント disp_no > 0
/// </code>
///
/// Cả ba TC dùng CHUNG một cú chốt (TC3 chốt, TC4/TC5 đọc lại lưới đó) — y như bên kia,
/// nơi <c>ensureCommitted()</c> chỉ chốt một lần rồi ghi nhớ.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HAI BÊN KHỚP NHAU Ở ĐÂU
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   Bệnh nhân        patient.patNo            ↔  PAT_NO            = 10
///   診療日            patient.trtDate          ↔  TRT_DT
///   処置 đem chốt     chkAutoCascade.phase2*   ↔  P2_CD / P2_SB     = 170/0
///   Ô 部位            autoSantei.buiSlot       ↔  BUI_SLOT          = 2 (右上6)
///   病名              autoSantei.disCd/disSb   ↔  DIS_CD_C/DIS_SB_C2= 100/2
///   Vùng seed         TRNTRN.DISP_NO >= 9000   ↔  trn_trn disp_no >= 9000
///   Điền tham số      ParamDialog.ParamFill    ↔  PARAM_FILL        = "9"
///   Gom cụm `*`       ParamDialog.Filled       ↔  filledText()      = /\*+/ → fill
///   Chuẩn hoá chuỗi   AutoSanteiOps.Norm       ↔  norm()            = NFKC
/// </code>
///
/// <para><b>MỘT LỆCH ĐÃ PHÁT HIỆN khi đối chiếu — soi trước khi tin kết quả.</b> Spec
/// Playwright đặt <c>SE_VITAL = 1</c> kèm chú 「1 = 生活歯」. Bên WinForm thì
/// <b><c>se = 0</c> mới là 生活歯</b> (cũng là DEFAULT của cột), còn <b><c>se = 1</c> là
/// 失活歯</b> — chính giá trị mà 抜髄 170/176 GHI RA (frm203016.cs:1177, xem
/// <see cref="SigaKonDb.SeVital"/> / <see cref="SigaKonDb.SeDevital"/>). Đọc thẳng DB của
/// bệnh nhân test: tất cả <c>se*</c> = 0. Nếu Postgres bên web dùng cùng miền giá trị thì
/// vế web đang xuất phát từ răng <b>đã 失活</b>, tức KHÁC trạng thái xuất phát của vế này.
/// Fixture này dùng <c>se = 0</c> vì nguồn chân lý là WinForm (F3).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG bấm F9 ⇒ <c>TRNTRN</c> chỉ bị đụng ở vùng seed. <b>NHƯNG khác Phase 1</b>: mã
/// <c>170</c> đi qua <c>frm203016.IregCodChk</c> case 170 ⇒ <c>SigaChg</c> GHI NÓNG bảng
/// <c>SIGA</c> ngay lúc chốt (frm203016.cs:1032-1041). Vì thế fixture chụp <c>SIGA</c>
/// TRƯỚC khi đặt mốc, IN RA STDOUT, và trả lại ở <c>OneTimeTearDown</c> (F20).
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class ChkAutoOrderPhase2Tests : UiTestBase
{
    private ChkAutoDb _chk = null!;
    private SigaKonDb _siga = null!;
    private SigaToothFlow _flow = null!;
    private AutoSanteiOps _ops = null!;

    private MstTrtRow? _trigger;
    private ChkAutoRow? _chkRow;
    private IReadOnlyList<CmtAutoRow> _cmts = [];

    /// <summary>Tên mà LƯỚI in ra cho từng カルテコメント (MST_CMT2) — KHÔNG phải CMTAUTO.CMT_NM.</summary>
    private readonly Dictionary<string, string> _cmtNames = [];

    /// <summary>Tên 処置 của từng ô <c>chkauto</c> có master hiệu lực.</summary>
    private readonly List<MstTrtRow> _slotMasters = [];

    private SigaSnapshot? _sigaBefore;

    /// <summary>Lưới NGAY SAU cú chốt của TC3 — TC4/TC5 đọc lại đúng ảnh chụp này.</summary>
    private IReadOnlyList<RegiRow> _afterCommit = [];
    private IReadOnlyList<string> _confirmedParams = [];
    private bool _committed;

    private int TrtCd => Settings.ChkAutoCascade.Phase2TrtCd;
    private int TrtSb => Settings.ChkAutoCascade.Phase2TrtSb;
    private int BuiSlot => Settings.AutoSantei.BuiSlot;
    private int DisCd => Settings.AutoSantei.DisCd;
    private int DisSb => Settings.AutoSantei.DisSb;
    private const string DisMark = "Ｃ";

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        Settings.ChkAutoCascade.AllowSave
            ? null
            : "Cần chkAutoCascade.allowSave = true (hoặc OCHA_CHK_AUTO_CASCADE_ALLOW_SAVE=1) — " +
              "đối ứng TEST_ALLOW_SAVE=1 của spec Playwright. Fixture seed 部位病名行 vào TRNTRN " +
              $"và chốt {Settings.ChkAutoCascade.Phase2TrtCd} (抜髄) — mã đó đi qua " +
              "frm203016.SigaChg nên GHI NÓNG bảng SIGA. KHÔNG bấm F9.";

    /// <summary>
    /// Đối ứng của <c>resetPhase()</c> bên Playwright, chạy TRƯỚC KHI APP MỞ.
    ///
    /// <para>Thứ tự BẮT BUỘC — ghi <c>siga</c> rồi seed 部位病名行 rồi mới mở màn:
    /// <c>pSiga_old</c> chỉ nạp đúng một lần lúc mở 診療入力 (modKonSiga.cs:70-84), và lưới
    /// cũng chỉ đọc <c>TRNTRN</c> một lần ở đó.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        if (!Settings.ChkAutoCascade.AllowSave) return;

        var siga = SigaKonDb.CreateOrNull(Settings, allowWrite: true);
        var chk = ChkAutoDb.CreateOrNull(WithSeedPermission());
        if (siga is null || chk is null || chk.ProbeError() is not null) return;

        // F20 — chụp nguyên trạng, IN RA, rồi mới đặt mốc.
        siga.EnsureSigaRow(PatNo);
        _sigaBefore = siga.ReadSiga(PatNo);
        Log($"nguyên trạng SIGA (chụp TRƯỚC khi đặt mốc): {_sigaBefore}");
        Log("nguyên trạng dòng 処置 của ngày test:\n  " +
            string.Join("\n  ", chk.DescribeDayRows(PatNo, TrtDate)));

        // Răng phải 生活歯 (se = 0) thì 抜髄 mới đi qua ChkSiga. ⚠️ Bên web dùng SE_VITAL = 1
        // — xem khối 「MỘT LỆCH ĐÃ PHÁT HIỆN」 ở doc-comment của fixture.
        siga.ResetSigaToVital(PatNo);
        Log($"đặt mốc: mọi se* = {SigaKonDb.SeVital} (生活歯) ⇒ ChkSiga cho 抜髄 đi qua.");

        var n = chk.SeedBuiDisRow(PatNo, TrtDate, BuiSlot, Settings.AutoSantei.BuiVal,
                                  DisCd, DisSb,
                                  dspBui: ToothSelectDialog.DescribeSlot(BuiSlot), dspDis: DisMark);
        Log($"seed 部位病名行: {n} dòng — 部位 ô {BuiSlot} ({ToothSelectDialog.DescribeSlot(BuiSlot)}), " +
            $"病名 {DisCd}/{DisSb} 「{DisMark}」, ngày {TrtDate:yyyy-MM-dd}.");
    }

    /// <summary>Xem <c>ChkAutoCascadeTests.WithSeedPermission</c> — cùng lý do, cùng cách.</summary>
    private TestSettings WithSeedPermission()
    {
        var clone = new TestSettings { Db = Settings.Db };
        clone.AutoSantei.AllowSave = Settings.ChkAutoCascade.AllowSave;
        return clone;
    }

    [OneTimeSetUp]
    public void Phase2OneTimeSetUp()
    {
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (chk is null) IgnoreWithReason("Cần DB — " + (DbUnavailableReason ?? "db.enabled = false"));
        if (chk!.ProbeError() is { } err) IgnoreWithReason($"không kết nối được SQL Server: {err}");
        _chk = chk;
        _siga = SigaKonDb.CreateOrNull(Settings, allowWrite: Settings.ChkAutoCascade.AllowSave)!;

        _trigger = _siga.FindMasterRow(TrtDate, TrtCd, TrtSb);
        _chkRow = _chk.ReadChkAuto(TrtCd, TrtSb);
        _cmts = _chk.FindCmtAutos(TrtCd, TrtSb);

        foreach (var (cd, sb) in _chkRow?.TreatmentPairs ?? [])
            if (_siga.FindMasterRow(TrtDate, cd, sb) is { } m) _slotMasters.Add(m);

        foreach (var c in _cmts)
            if (_chk.ResolveCmtName(c.CmtCd, c.CmtSb) is { Length: > 0 } nm)
                _cmtNames[$"{c.CmtCd}/{c.CmtSb}"] = nm;

        Log("╔══ CHỮ KÝ KỲ VỌNG Phase 2 (tính từ master, KHÔNG hardcode) ══");
        Log($"║ 処置 gõ vào : {_trigger?.ToString() ?? "(master KHÔNG có)"}");
        foreach (var c in _cmts)
            Log($"║ comment     : {c} — lưới in 「{Shown(c)}」" +
                (ParamDialog.HasParam(Shown(c)) ? "  ★ còn `*` ⇒ phải bung frm203048" : ""));
        foreach (var m in _slotMasters) Log($"║ ô chkauto   : {m}");
        Log($"║ SIGA trước  : {_sigaBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log("╚══════════════════════════════════════════════════════════════");
    }

    /// <summary>Chuỗi mà LƯỚI in ra cho một dòng CMTAUTO — lấy từ MST_CMT2 (BẪY 2 bên web).</summary>
    private string Shown(CmtAutoRow c) => _cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", c.CmtNm);

    /// <summary>Chuỗi SAU khi đã điền tham số — cái thật sự rơi xuống lưới.</summary>
    private string Expected(CmtAutoRow c) => ParamDialog.Filled(Shown(c));

    [SetUp]
    public void Phase2SetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new AutoSanteiOps(_flow);
    }

    [OneTimeTearDown]
    public void Phase2OneTimeTearDown()
    {
        if (!Settings.ChkAutoCascade.AllowSave) return;
        try
        {
            var cleaner = ChkAutoDb.CreateOrNull(WithSeedPermission())!;
            Log("dọn: " + cleaner.DeleteSeededRows(PatNo, TrtDate) + " dòng vùng seed.");
            if (Settings.ChkAutoCascade.AllowRowCleanup)
                Log("dọn: " + cleaner.DeleteCompanionRows(PatNo, TrtDate, TrtCd, TrtSb) +
                    " dòng mang mã đem chốt + mã đi kèm + mã comment.");
        }
        catch (Exception e) { Log($"dọn TRNTRN HỎNG: {e.Message}"); }

        try
        {
            if (_siga is { CanWrite: true } && _sigaBefore is not null)
            {
                _siga.EnsureSigaRow(PatNo);
                _siga.RestoreSiga(PatNo, _sigaBefore);
                Log("dọn: SIGA trả về nguyên trạng.");
            }
        }
        catch (Exception e) { Log($"dọn SIGA HỎNG: {e.Message} — dựng tay theo khối 「CHỮ KÝ KỲ VỌNG」."); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC0 (mốc — KHÔNG có bên web): chỉ hỏi DB
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TC0 (mốc, FlaUI-only) — master có đủ dữ liệu Phase 2 để ba TC sau nói được gì")]
    public void TC0_Master_Has_Phase2_Data()
    {
        Assert.Multiple(() =>
        {
            Assert.That(_trigger, Is.Not.Null,
                $"Master {TrtDate:yyyy-MM} không có {TrtCd}/{TrtSb} ⇒ không gõ được mã. " +
                "Đối ứng skipWithReason 「master tháng test không có 処置 P2」 bên web.");

            Assert.That(_cmts, Is.Not.Empty,
                $"CMTAUTO({TrtCd},{TrtSb}) rỗng ⇒ không có カルテコメント nào để đo.");

            var needsPick = _cmts.Count > 1 && _cmts.Any(c => c.NoChk == 0);
            Assert.That(needsPick, Is.False,
                $"Batch CMTAUTO này cần người chọn ({_cmts.Count} dòng, có dòng no_chk = 0) ⇒ đi " +
                "đường カルテ記載選択 chứ không phải nhánh tự áp dụng. Đối ứng skipWithReason bên web.");

            Assert.That(_cmts.Any(c => ParamDialog.HasParam(Shown(c))), Is.True,
                $"Không dòng CMTAUTO nào của {TrtCd}/{TrtSb} còn dấu `*` ⇒ TC3 không đo được " +
                "nhánh frm203048. Đổi chkAutoCascade.phase2TrtCd (master dev: 170/171/172/122/313…).");

            Assert.That(_cmts.Any(c => c.DispNo > 0), Is.True,
                $"Không dòng nào disp_no > 0 ⇒ TC5 không có mốc để so thứ tự.");

            Assert.That(_slotMasters, Is.Not.Empty,
                $"chkauto({TrtCd},{TrtSb}) không có ô nào có master hiệu lực ⇒ TC5 không đo được.");
        });

        // ⚠️ Khác biệt miền giá trị đã phát hiện khi đối chiếu hai vế — in ra mỗi lượt chạy
        //    để người đọc log không phải đi tìm lại.
        Log($"=== KQ-SE === WinForm: se = {SigaKonDb.SeVital} là 生活歯, " +
            $"se = {SigaKonDb.SeDevital} là 失活歯 (frm203016.cs:1177). " +
            "Spec Playwright đang đặt SE_VITAL = 1 — kiểm lại miền giá trị bên Postgres.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC3 ← TC-3 — frm203048 phải bung cho mỗi comment còn `*`
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC3 ← TC-3 — カルテコメント còn `*` phải bung frm203048 TRƯỚC khi ghi xuống lưới")]
    public void TC3_Asterisk_Comment_Opens_Param_Dialog_Before_Writing()
    {
        using var trace = TestTrace.Begin();
        RequireMasterData();

        var withParam = _cmts.Where(c => ParamDialog.HasParam(Shown(c))).ToList();
        if (withParam.Count == 0)
            Assert.Ignore($"không dòng cmt_auto nào của {TrtCd}/{TrtSb} còn `*` — TC0 đã nói rõ.");

        var seeded = _ops.SeededBuiRow(TrtDate.Day, ToothSelectDialog.DescribeSlot(BuiSlot), DisMark);
        Assert.That(seeded, Is.Not.Null,
            $"Không thấy 部位病名行 vừa seed (病名 「{DisMark}」, ngày {TrtDate:yyyy-MM-dd}) ⇒ HARNESS " +
            "hỏng. Lưới đang có:\n  " + string.Join("\n  ", _flow.DescribeGrid(40)));

        var raw = _ops.CommitOnSeededRow(seeded!, TrtCd, TrtSb, trace);
        Assert.That(raw, Is.Not.Null, "Không dựng được chỗ để gõ mã ⇒ HARNESS hỏng.");
        Assert.That(raw!.Enter.Committed, Is.True,
            $"Không chốt được 枝番 {TrtSb} của mã {TrtCd} trong 処置選択. {raw.Enter}");

        // Mỗi comment còn `*` là MỘT lần frm203048 (frmCmt3_PrmChk chạy cho TỪNG outData,
        // frm203002.cs:10036-10038). Đối ứng fillPendingParamDialogs() bên web.
        _confirmedParams = new ParamDialog(App, Screen.Window).AnswerAll(trace);

        // Có thể còn 摘要選択 xếp hàng sau đó — không trả lời thì Chk_ChkAuto không chạy.
        new SummaryPickDialog(App, Screen.Window, _flow).Answer(trace);

        _afterCommit = _ops.Grid.Snapshot().Where(AutoSanteiOps.EntryMeasure.IsData).ToList();
        _committed = true;

        Log($"đã xác nhận {_confirmedParams.Count} hộp thoại frm203048: " +
            string.Join(" / ", _confirmedParams.Select(t => $"「{t}」")));
        foreach (var r in _afterCommit) Log($"  lưới: {r}");

        Assert.That(_confirmedParams.Count, Is.EqualTo(withParam.Count),
            $"Phải bung {withParam.Count} lần frm203048 (mỗi カルテコメント còn `*` một lần, " +
            $"frm203002.cs:10051) nhưng chỉ thấy {_confirmedParams.Count}.\n" +
            "  comment có `*`: [" + string.Join(" / ", withParam.Select(c => $"「{Shown(c)}」")) + "]\n" +
            "  ĐỎ Ở ĐÂY nghĩa là gì: (a) app KHÔNG mở パラメータダイアログ — đúng lỗi (D) mà bản " +
            "đánh giá nêu, nhưng ở đây là đo trên WinForm nên nó có nghĩa ngược lại: WinForm cũng " +
            "không hỏi; (b) hoặc hộp thoại có bung mà harness không thấy — đọc ảnh chụp trước khi " +
            "kết luận.");

        // Không dấu sao nào lọt xuống lưới quanh dòng vừa chốt.
        var trtIdx = GridIndex.LastOf(_afterCommit, _trigger!);
        Assert.That(trtIdx, Is.GreaterThanOrEqualTo(0), $"Không thấy dòng 処置 「{_trigger!.CctNm}」.");

        var lo = Math.Max(0, trtIdx - _cmts.Count - 1);
        var hi = Math.Min(_afterCommit.Count, trtIdx + _cmts.Count + 2);
        var window = _afterCommit.Skip(lo).Take(hi - lo).Select(r => AutoSanteiOps.Norm(r.Ryo)).ToList();
        Assert.That(window.Where(c => c.Contains('*')).ToList(), Is.Empty,
            "Lưới còn dòng chứa `*` quanh 処置 vừa chốt — frmCmt3_PrmChk phải thay HẾT tham số " +
            "TRƯỚC khi frmCmt3_Set_Data2 ghi (frm203002.cs:10036-10038).\n" +
            "  cửa sổ quanh dòng chốt: [" + string.Join(" / ", window) + "]");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC4 ← TC-4 — disp_no vẫn quyết định TRÊN/DƯỚI sau khi điền tham số
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC4 ← TC-4 — disp_no vẫn quyết định TRÊN/DƯỚI sau khi đã điền tham số")]
    public void TC4_DispNo_Still_Decides_Placement_After_Params()
    {
        RequireCommitted();

        var placed = _cmts.Where(c => c.MakesOwnRow).ToList();
        if (placed.Count == 0) Assert.Ignore("không có dòng cmt_auto nào sinh dòng riêng.");

        var trtIdx = GridIndex.LastOf(_afterCommit, _trigger!);
        Assert.That(trtIdx, Is.GreaterThanOrEqualTo(0), $"Không thấy dòng 処置 「{_trigger!.CctNm}」.");

        Assert.Multiple(() =>
        {
            foreach (var c in placed)
            {
                var needle = AutoSanteiOps.Norm(Expected(c));
                var idx = GridIndex.Nearest(_afterCommit, needle, trtIdx);
                Assert.That(idx, Is.GreaterThanOrEqualTo(0),
                    $"Không thấy comment 「{needle}」 trên lưới.\n" +
                    "  lưới: " + GridIndex.Describe(_afterCommit));
                if (idx < 0) continue;

                if (c.DispNo < 0)
                    Assert.That(idx, Is.LessThan(trtIdx),
                        $"disp_no = {c.DispNo} (< 0) ⇒ 「{needle}」 phải nằm TRÊN " +
                        $"「{_trigger.CctNm}」 (frm203002.cs:10086), đang ở dưới.");
                else
                    Assert.That(idx, Is.GreaterThan(trtIdx),
                        $"disp_no = {c.DispNo} (> 0) ⇒ 「{needle}」 phải nằm DƯỚI " +
                        $"「{_trigger.CctNm}」 (frm203002.cs:10108), đang ở trên.");
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC5 ← TC-5 — dòng chk_auto nằm dưới cụm comment disp_no > 0
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC5 ← TC-5 — dòng 自動算定 phải nằm DƯỚI カルテコメント disp_no > 0 cuối cùng")]
    public void TC5_ChkAuto_Row_Sits_Below_The_Last_Below_Comment()
    {
        RequireCommitted();

        var below = _cmts.Where(c => c.DispNo > 0).Select(c => AutoSanteiOps.Norm(Expected(c))).ToList();
        if (below.Count == 0) Assert.Ignore($"{TrtCd}/{TrtSb} không có comment disp_no > 0.");
        if (_slotMasters.Count == 0) Assert.Ignore($"{TrtCd}/{TrtSb} không có ô chkauto khả dụng.");

        var trtIdx = GridIndex.LastOf(_afterCommit, _trigger!);
        Assert.That(trtIdx, Is.GreaterThanOrEqualTo(0), $"Không thấy dòng 処置 「{_trigger!.CctNm}」.");

        var cmtIdxs = below.Select(n => GridIndex.Nearest(_afterCommit, n, trtIdx)).ToList();
        Assert.That(cmtIdxs.Any(i => i >= 0), Is.True,
            "Không thấy カルテコメント disp_no > 0 nào của 処置 gốc ⇒ TC5 không kết luận được gì.\n" +
            "  lưới: " + GridIndex.Describe(_afterCommit));
        var lastCmtIdx = cmtIdxs.Max();

        Assert.Multiple(() =>
        {
            foreach (var slot in _slotMasters)
            {
                var idx = GridIndex.NearestOf(_afterCommit, slot, trtIdx);
                Assert.That(idx, Is.GreaterThan(lastCmtIdx),
                    $"Dòng 自動算定 「{slot.CctNm}」 (index {idx}) phải nằm DƯỚI カルテコメント " +
                    $"disp_no > 0 cuối cùng của 「{_trigger.CctNm}」 (index {lastCmtIdx}).\n" +
                    "  WinForm: frmCmt3_Set_Data2 kết thúc bằng CurrentCell = [X, intTempRow + 1] " +
                    "(frm203002.cs:10164) ⇒ con trỏ đã tụt xuống dưới comment; Chk_ChkAuto AddRow() " +
                    "từ đó (modMain.cs:958).\n" +
                    "  ⚠️ Lúc lưu, disp_no = thứ tự hiển thị ⇒ sai chỗ là sai dữ liệu lưu.\n" +
                    "  lưới: " + GridIndex.Describe(_afterCommit));
            }
        });
    }

    // ── Nội bộ ───────────────────────────────────────────────────────────────

    private void RequireMasterData()
    {
        if (_trigger is null || _cmts.Count == 0)
            Assert.Ignore("Master/CMTAUTO thiếu dữ liệu Phase 2 — TC0 nói rõ thiếu gì.");
    }

    private void RequireCommitted()
    {
        if (!_committed || _afterCommit.Count == 0)
            Assert.Ignore("TC3 chưa chốt được 処置 — TC4/TC5 đọc lại chính lưới của cú chốt đó " +
                          "(y như ensureCommitted bên web). Sửa TC3 trước.");
    }
}
