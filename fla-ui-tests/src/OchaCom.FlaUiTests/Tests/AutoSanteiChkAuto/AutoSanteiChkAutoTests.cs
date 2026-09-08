using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// 診療入力 — cái ĐUÔI của một cú chốt 処置. Nửa WinForm của
/// <c>../web-tenant-tests/tests/auto-santei/chk-auto-after-commit.spec.ts</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG  (đọc cùng bảng ở đầu spec Playwright)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TC0  ←  (không có bên web)  mốc harness: chkauto/CMTAUTO/master có đủ dữ liệu chưa
///   TC1  ←  TC-1  自動算定 — chốt 処置 xong, chkauto phải kéo các 処置 đi kèm xuống lưới
///   TC2  ←  TC-2  コメント自動入力 — CMTAUTO tự áp dụng phải rơi xuống lưới
///   TC3  ←  TC-3  disp_no quyết định comment nằm TRÊN hay DƯỚI dòng 処置
///   TC4  ←  TC-4  các dòng đi kèm nằm ĐÚNG cụm quanh 処置, không trôi xuống cuối ngày
/// </code>
///
/// Cả bốn TC dùng CHUNG một cú chốt (TC1 chốt, TC2-TC4 đọc lại lưới) — y như bên kia,
/// nơi TC-2/3/4 ghi rõ 「TC-1 đã chốt 処置 rồi; lưới hiện tại là kết quả của cùng một cú
/// Enter」. Vì thế fixture chạy <b>serial</b> và TC1 phải xanh trước.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// LỆCH ĐANG ĐO (báo cáo 2026-09-08, ảnh so WinForm ↔ web)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///     WinForm                                        web (SAI)
///     ─────────────────────────────────────────      ─────────────────────
///     OA（ｺｰﾊﾟﾛﾝ）浸麻（歯科用ｵｰﾗ注Ct1.8ml）   0点    (KHÔNG CÓ)
///     抜歯手術(臼歯)                         270点    抜歯手術(臼歯)  270点
///     OA+ｵｰﾗ注歯科用ｶｰﾄﾘｯｼﾞ 料1.8mL           11点    (KHÔNG CÓ)
///     【日計 443点】                                  【日計 432点】
/// </code>
/// Hai dòng thiếu đến từ HAI cơ chế khác nhau — vì thế TC1 và TC2 tách riêng:
/// <list type="bullet">
///   <item><b>(A) <c>ModMain.Chk_ChkAuto</c></b> (modMain.cs:812) — bảng <c>chkauto</c>,
///     tối đa 5 mã đi kèm. <c>chkauto(179,2) → 310/2</c> chính là 11 điểm bị mất.</item>
///   <item><b>(B) <c>ModMain.Chk_CmtAuto</c></b> (modMain.cs:738) — bảng <c>CMTAUTO</c>,
///     chèn dòng カルテコメント quanh 処置 theo <c>disp_no</c>.</item>
/// </list>
/// Cả hai nằm trong ĐUÔI của nhánh 回 Enter (frm203002.cs:5738-5752), thứ tự CỐ ĐỊNH:
/// <code>
///     ModMain.Chk_CmtAuto(...)                ← chạy cả khi 回数 = 0
///     if (trtCnt >= 1) {
///         ModMain.Chk_ChkAuto_soutyaku(...)   装着料自動算定
///         ModMain.Chk_ChkAuto(...)            自動算定
///     }
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HAI BÊN XUẤT PHÁT TỪ CÙNG MỘT TRẠNG THÁI — và vì sao ở đây SEED được
/// ═══════════════════════════════════════════════════════════════════════════════
/// Spec Playwright seed đúng MỘT 部位病名行 (<c>trt_cd = 0</c>, 部位 ô 2 = 右上6, 病名
/// <c>dis_cd 100 / dis_sb 2</c> = 「Ｃ₂」) rồi mở màn. Fixture này seed y hệt vào
/// <c>TRNTRN</c> — cùng ô 部位, cùng 病名, cùng vùng <c>disp_no >= 9000</c>.
///
/// <para>F21 cấm seed khi thứ ĐANG ĐO là đường ghi lúc nhập (<c>SigaChg</c>,
/// <c>DelExtRec</c>) — chúng đọc <c>ModCommon.pbui</c> nên dòng seed không đi qua
/// <c>IregCodChk</c> thì cả nhánh biến mất. Ở đây khác: dòng seed chỉ là TRẠNG THÁI XUẤT
/// PHÁT, còn thứ đang đo (<c>Chk_ChkAuto</c>) vẫn chạy trọn đường giao diện. Xem
/// <see cref="ChkAutoDb.SeedBuiDisRow"/> để biết vì sao bốn lượt chạy đầu (dựng 部位病名行
/// bằng chính 部位選択) đều chết ở <c>AutoBui</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB — cờ riêng <c>autoSantei.allowSave</c>
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG bấm F9 登録 (y như spec bên kia). Nhưng có HAI đường ghi:
/// <list type="number">
///   <item><c>TRNTRN</c> vùng seed <c>disp_no >= 9000</c> của ĐÚNG ngày test — dọn ở
///     <c>OneTimeTearDown</c>;</item>
///   <item><c>SIGA</c>: 抜歯 đi qua <c>frm203016.SigaChg</c> nên ghi NÓNG lúc chốt
///     (frm203016.cs:1032-1035), và răng phải là 現存 thì <c>ChkSiga</c> mới cho đi qua —
///     đúng 「BẪY 1 + 2」 của spec Playwright.</item>
/// </list>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class AutoSanteiChkAutoTests : UiTestBase
{
    private ChkAutoDb _chk = null!;
    private SigaKonDb _siga = null!;
    private SigaToothFlow _flow = null!;
    private AutoSanteiOps _ops = null!;

    private SigaSnapshot? _sigaBefore;

    /// <summary>Master của 処置 đem chốt — đọc một lần ở <c>OneTimeSetUp</c>, y như beforeAll bên kia.</summary>
    private MstTrtRow? _trigger;
    private ChkAutoRow? _chkRow;
    private IReadOnlyList<CmtAutoRow> _cmts = [];
    /// <summary>処置名 + 点数 của từng slot <c>chkauto</c>, tra từ master của tháng test.</summary>
    private readonly Dictionary<string, MstTrtRow> _slotMaster = [];
    /// <summary>Tên カルテコメント mà LƯỚI in ra (MST_CMT2), khoá theo <c>cmt_cd/cmt_sb</c>.</summary>
    private readonly Dictionary<string, string> _cmtNames = [];

    /// <summary>Lưới NGAY SAU cú chốt của TC1 — TC2/TC3/TC4 đọc lại đúng ảnh chụp này.</summary>
    private IReadOnlyList<RegiRow> _afterCommit = [];
    private bool _committed;

    private int TrtCd => Settings.AutoSantei.TrtCd;
    private int TrtSb => Settings.AutoSantei.TrtSb;
    private int BuiSlot => Settings.AutoSantei.BuiSlot;
    private int DisCd => Settings.AutoSantei.DisCd;
    private int DisSb => Settings.AutoSantei.DisSb;

    /// <summary>Nhãn 病名 mà seed ghi vào <c>DSP_DIS</c> — mốc để tìm lại 部位病名行 trên lưới.</summary>
    private const string DisMark = "Ｃ";

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        Settings.AutoSantei.AllowSave
            ? null
            : "Cần autoSantei.allowSave = true (hoặc OCHA_AUTO_SANTEI_ALLOW_SAVE=1) — đối ứng " +
              "TEST_ALLOW_SAVE=1 của spec Playwright. Fixture seed 部位病名行 vào TRNTRN (vùng " +
              $"disp_no >= {ChkAutoDb.SeedDispBase} của ĐÚNG ngày test) và chốt {Settings.AutoSantei.TrtCd} " +
              "(抜歯) — mã đó đi qua frm203016.SigaChg nên ghi NÓNG bảng SIGA. KHÔNG bấm F9.";

    /// <summary>
    /// Đối ứng của <c>resetPhase()</c> bên Playwright, nhưng chạy TRƯỚC KHI APP MỞ.
    ///
    /// <para>Thứ tự BẮT BUỘC (BẪY 2 của spec kia): ghi <c>siga</c> rồi seed 部位病名行 rồi
    /// mới mở màn. <c>pSiga_old</c> chỉ được nạp ĐÚNG MỘT LẦN lúc mở 診療入力
    /// (modKonSiga.cs:70-84), và lưới cũng chỉ đọc <c>TRNTRN</c> một lần ở đó.</para>
    ///
    /// <para>⚠️ CHỤP NGUYÊN TRẠNG TRƯỚC KHI ĐẶT MỐC (F20).</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        var siga = SigaKonDb.CreateOrNull(Settings, Settings.AutoSantei.AllowSave);
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (siga is null || !siga.CanWrite || siga.ProbeError() is not null) return;
        if (chk is null || !chk.CanWrite) return;

        siga.EnsureSigaRow(PatNo);
        _sigaBefore = siga.ReadSiga(PatNo);
        Log($"nguyên trạng SIGA (chụp TRƯỚC khi đặt mốc): {_sigaBefore}");
        Log("nguyên trạng dòng 処置 của ngày test:\n  " +
            string.Join("\n  ", chk.DescribeDayRows(PatNo, TrtDate)));

        // Răng đem thử phải 現存, nếu không ChkSiga loại 抜歯 và cả fixture vô nghĩa.
        siga.ResetSigaToVital(PatNo);
        Log($"đặt mốc: mọi se* = {SigaKonDb.SeVital} (現存) ⇒ ChkSiga cho 抜歯 đi qua.");

        var n = chk.SeedBuiDisRow(PatNo, TrtDate, BuiSlot, Settings.AutoSantei.BuiVal,
                                  DisCd, DisSb,
                                  dspBui: ToothSelectDialog.DescribeSlot(BuiSlot),
                                  dspDis: DisMark);
        Log($"seed 部位病名行: {n} dòng — 部位 ô {BuiSlot} ({ToothSelectDialog.DescribeSlot(BuiSlot)}), " +
            $"病名 {DisCd}/{DisSb} 「{DisMark}」, disp_no {ChkAutoDb.SeedDispBase + 1}, ngày {TrtDate:yyyy-MM-dd}.");
    }

    [OneTimeSetUp]
    public void AutoSanteiOneTimeSetUp()
    {
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (chk is null) IgnoreWithReason("Cần DB để đọc chkauto/CMTAUTO — " + (DbUnavailableReason ?? "db.enabled = false"));
        var error = chk!.ProbeError();
        if (error is not null) IgnoreWithReason($"không kết nối được SQL Server: {error}");
        _chk = chk;
        _siga = SigaKonDb.CreateOrNull(Settings, Settings.AutoSantei.AllowSave)!;

        // ── Master: kỳ vọng TÍNH TỪ ĐÂY, không hardcode 「310/2」「7321/1」 ──────
        _trigger = _siga.FindMasterRow(TrtDate, TrtCd, TrtSb);
        _chkRow = _chk.ReadChkAuto(TrtCd, TrtSb);
        _cmts = _chk.FindCmtAutos(TrtCd, TrtSb);

        foreach (var (cd, sb) in _chkRow?.TreatmentPairs ?? [])
        {
            var m = _siga.FindMasterRow(TrtDate, cd, sb);
            if (m is not null) _slotMaster[$"{cd}/{sb}"] = m;
        }
        foreach (var c in _cmts)
        {
            var nm = _chk.ResolveCmtName(c.CmtCd, c.CmtSb);
            if (!string.IsNullOrWhiteSpace(nm)) _cmtNames[$"{c.CmtCd}/{c.CmtSb}"] = nm!;
        }

        Log($"master: 処置 {TrtCd}/{TrtSb} 「{_trigger?.CctNm}」 — " +
            $"chkauto {_chkRow?.TreatmentPairs.Count ?? 0} slot, CMTAUTO {_cmts.Count} dòng");
        foreach (var kv in _slotMaster) Log($"  slot {kv.Key} = {kv.Value}");
        foreach (var c in _cmts)
            Log($"  cmt  {c} — lưới sẽ in 「{_cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", "(MST_CMT2 KHÔNG có)")}」");

        Log("╔══ NGUYÊN TRẠNG TRƯỚC LƯỢT CHẠY (chép lại nếu cần dựng tay) ══");
        Log($"║ SIGA: {_sigaBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ bệnh nhân {PatNo}, 診療日 {TrtDate:yyyy-MM-dd}");
        Log("╚══════════════════════════════════════════════════════════════");
    }

    [SetUp]
    public void AutoSanteiSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new AutoSanteiOps(_flow);
    }

    /// <summary>Đối ứng của <c>afterAll</c>: dọn vùng seed + dòng đi kèm, trả <c>SIGA</c> về.</summary>
    [OneTimeTearDown]
    public void AutoSanteiOneTimeTearDown()
    {
        try
        {
            if (_chk is not null && _chk.CanWrite)
            {
                Log("dọn: " + _chk.DeleteSeededRows(PatNo, TrtDate) + " dòng vùng seed.");
                if (Settings.AutoSantei.AllowRowCleanup)
                    Log("dọn: " + _chk.DeleteCompanionRows(PatNo, TrtDate, TrtCd, TrtSb) +
                        " dòng mang mã đem thử + mã đi kèm.");
            }
        }
        catch (Exception e) { Log($"dọn TRNTRN HỎNG: {e.Message}"); }

        try
        {
            if (_siga is not null && _siga.CanWrite && _sigaBefore is not null)
            {
                _siga.EnsureSigaRow(PatNo);
                _siga.RestoreSiga(PatNo, _sigaBefore);
                Log("dọn: SIGA trả về nguyên trạng.");
            }
        }
        catch (Exception e) { Log($"dọn SIGA HỎNG: {e.Message} — dựng tay theo khối 「NGUYÊN TRẠNG」."); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC0 (mốc — KHÔNG có bên web) — chỉ hỏi DB, không đụng giao diện
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TC0 (mốc, FlaUI-only) — chkauto/CMTAUTO/master có đủ dữ liệu để ba TC sau nói được gì")]
    public void TC0_Master_Has_Data_To_Measure()
    {
        Log($"chkauto: {_chk.CountRows()} dòng, {_chk.CountRowsWithSecondCode()} dòng có ≥2 mã đi kèm.");
        foreach (var line in _chk.Describe()) Log("  " + line);

        Assert.That(_trigger, Is.Not.Null,
            $"Master của {TrtDate:yyyy-MM} không có {TrtCd}/{TrtSb} — không gõ được mã thì không có " +
            "gì để đo. ⇒ HARNESS/DATA, không phải app: đổi autoSantei.trtCd/trtSb hoặc patient.trtDate.");

        Assert.That(_chkRow, Is.Not.Null,
            $"Bảng chkauto KHÔNG có dòng ({TrtCd},{TrtSb}). Chk_ChkAuto trả về ngay khi " +
            "getChkAutoData = null (modMain.cs:841-844) ⇒ TC1 chẳng đo được gì. " +
            "Đối ứng: spec Playwright skip với 「không có dòng chk_auto trong master」.");

        Assert.That(_chkRow!.TreatmentPairs, Is.Not.Empty,
            $"{_chkRow} không có ô nào rơi vào nhánh 処置 (cd > 100 và ngoài dải 摘要 " +
            $"{ChkAutoRow.ReceiptCodeMin}..{ChkAutoRow.ReceiptCodeMax} — modMain.cs:862/:914). " +
            "Mã này chỉ tự chèn コメント, không đo được lệch điểm số.");

        Assert.Multiple(() =>
        {
            foreach (var (cd, sb) in _chkRow.TreatmentPairs)
                Assert.That(_slotMaster.ContainsKey($"{cd}/{sb}"), Is.True,
                    $"Master của {TrtDate:yyyy-MM} không có mã đi kèm {cd}/{sb}. Chk_ChkAuto tra " +
                    "chính bảng đó (modMain.cs:942-948) và bỏ qua khi không thấy — thiếu nó thì TC1 " +
                    "đỏ vì DỮ LIỆU, không phải vì app.");

            foreach (var c in _cmts)
                Assert.That(_cmtNames.ContainsKey($"{c.CmtCd}/{c.CmtSb}"), Is.True,
                    $"MST_CMT2 không có {c.CmtCd}/{c.CmtSb} — không suy ra được tên mà lưới sẽ in, " +
                    "nên TC2/TC3 sẽ phải so với CMTAUTO.CMT_NM (cột chép phi chuẩn hoá, ĐÃ LỆCH " +
                    "trên DB dev). Xem ChkAutoDb.ResolveCmtName.");
        });

        // Đối chứng: mã KHÔNG có trong chkauto thì cả cơ chế này không tồn tại. Kiểm ở tầng
        // DB cho rẻ — một vòng giao diện tốn 2-3 phút và không nói thêm được gì (F7).
        var control = _chk.ReadChkAuto(Settings.AutoSantei.ControlTrtCd, Settings.AutoSantei.ControlTrtSb);
        Assert.That(control, Is.Null,
            $"Mã ĐỐI CHỨNG {Settings.AutoSantei.ControlTrtCd}/{Settings.AutoSantei.ControlTrtSb} lại CÓ " +
            $"trong chkauto ({control}) — nó không còn đối chứng được nữa. Đổi autoSantei.controlTrtCd.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC1 ← TC-1 — 自動算定
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC1 ← TC-1 自動算定 — chốt 処置 xong, chkauto phải kéo các 処置 đi kèm xuống lưới")]
    public void TC1_ChkAuto_Pulls_Companion_Treatments()
    {
        using var trace = TestTrace.Begin();

        if (_chkRow is null || _chkRow.TreatmentPairs.Count == 0)
            Assert.Ignore($"処置 {TrtCd}/{TrtSb} không có slot chkauto — không có gì để đo " +
                          "(đối ứng skipWithReason của TC-1 bên web).");
        if (_slotMaster.Count == 0)
            Assert.Ignore("các slot chkauto không có dòng master hiệu lực trong tháng test — " +
                          "WinForm cũng bỏ qua chúng, không kết luận được gì.");

        var seeded = _ops.SeededBuiRow(DisMark);
        Assert.That(seeded, Is.Not.Null,
            $"Không thấy 部位病名行 vừa seed (病名 「{DisMark}」, ngày {TrtDate:yyyy-MM-dd}) trên lưới ⇒ " +
            "HARNESS hỏng, sửa trước. Lưới đang có:\n  " + string.Join("\n  ", _flow.DescribeGrid(40)));
        Log($"部位病名行 seed: 「{seeded}」");

        var measure = _ops.CommitOnSeededRow(seeded!, TrtCd, TrtSb, trace);
        Assert.That(measure, Is.Not.Null,
            "Không dựng được chỗ để gõ mã ⇒ HARNESS hỏng. Đọc _trace.log và ảnh chụp bước cuối.");

        Assert.That(measure!.Enter.PickerOpened, Is.True,
            $"Gõ 「{TrtCd}」 ở コードモード phải mở 処置選択 — master tháng này có mã đó không? {measure.Enter}");
        Assert.That(measure.Enter.Committed, Is.True,
            $"Không chốt được 枝番 {TrtSb} của mã {TrtCd} trong 処置選択. {measure.Enter}");

        _afterCommit = measure.After.Where(AutoSanteiOps.EntryMeasure.IsData).ToList();
        _committed = true;

        Log($"đo được: {measure}");
        foreach (var r in measure.AddedRows) Log($"  + {r}");

        var typedRow = AutoSanteiOps.RowOf(measure.AddedRows, _trigger!);
        Assert.That(typedRow, Is.Not.Null,
            $"Chính dòng vừa chốt ({_trigger}) cũng không có trên lưới ⇒ HARNESS hỏng, đừng đọc " +
            "tiếp phần 自動算定. Các dòng thêm được: [" +
            string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");

        // ── Đây là chỗ lệch ──────────────────────────────────────────────────
        Assert.Multiple(() =>
        {
            foreach (var (cd, sb) in _chkRow!.TreatmentPairs)
            {
                if (!_slotMaster.TryGetValue($"{cd}/{sb}", out var master)) continue;
                var auto = AutoSanteiOps.RowOf(measure.AddedRows, master);

                Assert.That(auto, Is.Not.Null,
                    $"⛔ LỆCH: chốt {TrtCd}/{TrtSb} rồi mà lưới không có dòng 「{master.CctNm}」 " +
                    $"({cd}/{sb}) — chkauto({TrtCd},{TrtSb}).cd = {cd}, và ModMain.Chk_ChkAuto chèn nó " +
                    "qua frm203016_Hide_Let_Trt_Data (modMain.cs:812-1010), gọi ngay sau 回 Enter " +
                    "(frm203002.cs:5752).\n" +
                    "  lưới đang có: [" + string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]\n" +
                    "  ĐỎ Ở ĐÂY nghĩa là gì: (a) 診療チェック đã loại mã đi kèm " +
                    "(modMain.cs:936-940 `blCalcPossible == false`) — kiểm ngày test đã có sẵn mã đó " +
                    "chưa; (b) 回 của dòng vừa chốt vẫn là 0 — xem AutoSanteiOps.EnsureTrtCount.");

                if (auto is null) continue;

                // 点数 lấy từ master, không phải 0 — đây chính là 11点 bị mất trong báo cáo.
                Assert.That(Txt.Int(auto.Ten), Is.EqualTo(master.Score1),
                    $"Dòng tự chèn {cd}/{sb} 「{auto.Ryo}」 phải mang {master.Score1} 点 " +
                    $"(score1 của {master.Table}), lưới in 「{auto.Ten}」. Lệch ở đây KHÔNG phải lệch " +
                    "自動算定 mà là lệch getTensu (CommonChk.getTensu chọn score1/2/3 theo acc_unit + " +
                    "f1 + ngày): ngày test có phải ngày 訪問診療 không?");
            }
        });

        // ── Mốc NGOÀI lưới (F12) ─────────────────────────────────────────────
        Assert.That(measure.PointDelta, Is.Not.Null,
            "Không đọc được nhãn lbAllPoint (月計点数) ⇒ HARNESS hỏng — kiểm locators.regiAllPoint.");
        Assert.That(measure.PointDelta, Is.EqualTo(measure.AddedPointSum),
            $"月計点数 tăng {measure.PointDelta} nhưng tổng 点×回 của các dòng vừa thêm là " +
            $"{measure.AddedPointSum}. Hai số do modAcc.Calc_MDPoint tính từ CÙNG một tập dòng " +
            "(frm203002.cs:5768-5772); lệch nghĩa là có dòng được chèn mà KHÔNG vào 月計.");

        var companionPoints = _chkRow!.TreatmentPairs
            .Select(p => _slotMaster.GetValueOrDefault($"{p.Cd}/{p.Sb}")?.Score1 ?? 0).Sum();
        Assert.That(measure.PointDelta, Is.EqualTo(_trigger!.Score1 + companionPoints),
            $"月計点数 phải tăng {_trigger.Score1} (mã chốt) + {companionPoints} (mã tự chèn) = " +
            $"{_trigger.Score1 + companionPoints}, đang tăng {measure.PointDelta}. Đúng bằng số điểm " +
            "mà bản web đang thiếu ở ảnh so sánh 443 / 432.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC2 ← TC-2 — コメント自動入力
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC2 ← TC-2 コメント自動入力 — CMTAUTO tự áp dụng phải rơi xuống lưới, không bị nuốt")]
    public void TC2_CmtAuto_Rows_Land_On_Grid()
    {
        var autoApplied = _cmts.Where(c => c.MakesOwnRow).ToList();
        if (autoApplied.Count == 0)
            Assert.Ignore($"処置 {TrtCd}/{TrtSb} không có dòng CMTAUTO sinh dòng riêng (disp_no ≠ 0).");

        // Batch cần người chọn thì đường đi là カルテ記載選択, không phải nhánh này.
        if (_cmts.Count >= 2 && _cmts.Any(c => c.NoChk == 0))
            Assert.Ignore("batch CMTAUTO này cần người chọn (≥2 dòng và có no_chk = 0) ⇒ đi đường " +
                          "カルテ記載選択, không phải nhánh tự áp dụng.");

        RequireCommitted();

        Assert.Multiple(() =>
        {
            foreach (var c in autoApplied)
            {
                var shown = _cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", c.CmtNm);
                Assert.That(AutoSanteiOps.RowByName(_afterCommit, shown), Is.Not.Null,
                    $"Lưới thiếu カルテコメント 「{shown}」 ({c.CmtCd}/{c.CmtSb}).\n" +
                    "  WinForm: Chk_CmtAuto mở frm203012 gType.Auto rồi frmCmt3_Cmt3_SetData ghi " +
                    "thẳng khi không cần hỏi (frm203002.cs:10034).\n" +
                    "  lưới đang có: [" + string.Join(" / ", _afterCommit.Select(r => r.Ryo)) + "]");
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC3 ← TC-3 — disp_no quyết định chỗ chèn
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC3 ← TC-3 — disp_no quyết định comment nằm TRÊN hay DƯỚI dòng 処置")]
    public void TC3_CmtAuto_DispNo_Decides_Placement()
    {
        var placed = _cmts.Where(c => c.MakesOwnRow).ToList();
        if (placed.Count == 0) Assert.Ignore("không có dòng CMTAUTO nào sinh dòng riêng.");
        if (_cmts.Count >= 2 && _cmts.Any(c => c.NoChk == 0))
            Assert.Ignore("batch cần người chọn — không đi nhánh tự áp dụng.");

        RequireCommitted();

        var trtIdx = AutoSanteiOps.IndexOf(_afterCommit, _trigger!);
        Assert.That(trtIdx, Is.GreaterThanOrEqualTo(0),
            $"Không thấy dòng 処置 「{_trigger!.CctNm}」 trên lưới.");

        Assert.Multiple(() =>
        {
            foreach (var c in placed)
            {
                var shown = _cmtNames.GetValueOrDefault($"{c.CmtCd}/{c.CmtSb}", c.CmtNm);
                var idx = AutoSanteiOps.IndexByName(_afterCommit, shown);
                Assert.That(idx, Is.GreaterThanOrEqualTo(0), $"Không thấy comment 「{shown}」.");
                if (idx < 0) continue;

                if (c.DispNo < 0)
                    Assert.That(idx, Is.LessThan(trtIdx),
                        $"CMTAUTO.disp_no = {c.DispNo} (< 0) ⇒ 「{shown}」 phải nằm TRÊN " +
                        $"「{_trigger.CctNm}」 (frm203002.cs:10086), nhưng đang ở dưới.");
                else
                    Assert.That(idx, Is.GreaterThan(trtIdx),
                        $"CMTAUTO.disp_no = {c.DispNo} (> 0) ⇒ 「{shown}」 phải nằm DƯỚI " +
                        $"「{_trigger.CctNm}」 (frm203002.cs:10108), nhưng đang ở trên.");
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC4 ← TC-4 — các dòng đi kèm nằm ĐÚNG cụm quanh 処置
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC4 ← TC-4 — dòng chkauto phải nằm LIỀN DƯỚI 処置, không trôi xuống cuối ngày")]
    public void TC4_Companion_Rows_Sit_Right_Below_Treatment()
    {
        if (_chkRow is null || _slotMaster.Count == 0)
            Assert.Ignore("không có slot chkauto để đo.");

        RequireCommitted();

        var trtIdx = AutoSanteiOps.IndexOf(_afterCommit, _trigger!);
        Assert.That(trtIdx, Is.GreaterThanOrEqualTo(0), $"Không thấy dòng 処置 「{_trigger!.CctNm}」.");

        // WinForm AddRow chèn NGAY tại con trỏ, mà con trỏ lúc này đứng ngay sau dòng 処置
        // ⇒ các 処置 của chkauto là những dòng BÊN DƯỚI, theo đúng thứ tự slot
        // (modMain.cs:861 vòng `for i < 5`).
        var below = _afterCommit.Skip(trtIdx + 1).ToList();
        Assert.Multiple(() =>
        {
            foreach (var (cd, sb) in _chkRow.TreatmentPairs)
            {
                if (!_slotMaster.TryGetValue($"{cd}/{sb}", out var master)) continue;
                Assert.That(AutoSanteiOps.RowOf(below, master), Is.Not.Null,
                    $"Dòng 「{master.CctNm}」 ({cd}/{sb}) phải nằm DƯỚI 「{_trigger.CctNm}」 " +
                    "(AddRow tại con trỏ, modMain.cs:958).\n" +
                    "  lưới: [" + string.Join(" / ", _afterCommit.Select(r => r.Ryo)) + "]");
            }
        });
    }

    // ── Nội bộ ───────────────────────────────────────────────────────────────

    /// <summary>
    /// TC2/TC3/TC4 đọc lại ảnh chụp lưới của cú chốt trong TC1 — y như spec Playwright
    /// (「TC-1 đã chốt 処置 rồi; lưới hiện tại là kết quả của cùng một cú Enter」).
    /// TC1 chưa chốt được thì ba TC sau không nói lên điều gì.
    /// </summary>
    private void RequireCommitted()
    {
        if (!_committed || _afterCommit.Count == 0)
            Assert.Ignore("TC1 chưa chốt được 処置 — ba TC sau đọc lại chính lưới của cú chốt đó, " +
                          "chạy riêng chúng là vô nghĩa. Sửa TC1 trước.");
    }
}
