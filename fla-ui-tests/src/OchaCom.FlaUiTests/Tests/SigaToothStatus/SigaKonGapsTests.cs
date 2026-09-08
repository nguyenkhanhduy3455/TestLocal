using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.ParitySaveData;

namespace OchaCom.FlaUiTests.Tests.SigaToothStatus;

/// <summary>
/// Bốn gap của 自歯状況変更 / 根数変更 — nửa WinForm của
/// <c>../web-tenant-tests/tests/siga-kon-remaining-gaps.spec.ts</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///  TcGAP1  ←  TC-1    master của tháng có đủ 179 / 122-3 / 185
///  TcGAP2  ←  TC-2    抜歯 179 ghi 欠損歯 — mốc/đối chứng lớn
///  TcGAP3  ←  TC-3    ＥＭＲ(４根) 122/3 ghi 根数 4 vào KON
///  TcGAP4  ←  TC-4    185 + 「はい」  → 欠損歯
///  TcGAP5  ←  TC-4b   185 + 「いいえ」 → 歯式 KHÔNG đổi
///  TcGAP6  ←  TC-5    「いいえ」 ở dirty gate KHÔNG lùi cái DelExtRec vừa ghi
///  TcGAP7  ←  TC-5b   「いいえ」 ở dirty gate PHẢI lùi cái SigaChg vừa ghi
///  TcGAP8  ←  TC-6    thiếu dòng SIGA thì app phải TẠO, không được im lặng bỏ qua
///  TcGAP9  ←  TC-3(c) ĐỐI CHỨNG: ＥＭＲ(１根) 122/0 KHÔNG được ghi 根数
///  TcGAP10 ←  TC-4    NỬA F9: SigaChg_Save case 185 dựng LẠI 欠損歯 từ cờ 抜歯同時
///  TcGAP11 ←  TC-4b   NỬA F9: cờ = 0 ⇒ F9 KHÔNG đụng 歯式
///  TcGAP12 ←  TC-3(b) ＥＭＲ(４根) trên RĂNG SỮA → nkon (đo cả cú ném của đường nhập)
///  TcGAP13 ←  TC-6(c) dòng SIGA app vừa tạo phải NHẬN được lệnh ghi
/// </code>
///
/// <para><b>TcGAP9-13 thêm 2026-09-08</b> để đóng năm chỗ bản WinForm chưa đo mà spec
/// Playwright có khoá. Chỗ quan trọng nhất là TcGAP10/11: TcGAP4/TcGAP5 chỉ đo đường
/// NHẬP (<c>frm203016.SigaChg</c>), trong khi bản web KHÔNG có đường đó — mọi thứ bên
/// kia dồn vào <c>bulk-save</c>, tức đối ứng của <c>modSave.SigaChg_Save</c>. Không đo
/// nửa F9 thì phần WinForm mà bản web phải khớp vẫn chưa hề được đo.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HAI NỬA BẤT ĐỐI XỨNG — ĐỌC KỸ TRƯỚC KHI SỬA TcGAP6 / TcGAP7
/// ═══════════════════════════════════════════════════════════════════════════════
/// Cái van của <c>Restore_SK</c> là cờ <c>pSiga_chg</c> / <c>pKon_chg</c>
/// (modSave.cs:4684/:4689), và <b>chỉ <c>SigaChg</c> bật cờ đó</b>
/// (frm203016.cs:1282/:1295). Hai đường ghi kia thì không:
/// <list type="bullet">
///   <item><b>TcGAP7</b> — phiên có NHẬP 処置 ⇒ cờ BẬT ⇒ 「いいえ」 <b>lùi</b> 歯式 về
///     snapshot lúc mở màn. Đây là vế DUY NHẤT chứng minh <c>Restore_SK</c> thật sự chạy.</item>
///   <item><b>TcGAP6</b> — phiên CHỈ XOÁ dòng 抜歯 (<c>DelExtRec</c>) ⇒ cờ KHÔNG bật ⇒
///     「いいえ」 <b>KHÔNG lùi</b>. Kết quả là trạng thái TỰ MÂU THUẪN mà WinForm chấp nhận:
///     răng đã về 健全歯 trong khi dòng 抜歯 vẫn còn nguyên trong <c>TRNTRN</c>.</item>
/// </list>
/// ⛔ ĐỪNG "sửa" TcGAP6 thành 「sau 「いいえ」 thì SIGA phải y nguyên」. Đó là bug CỦA
/// WINFORM, được port có chủ ý — hồ sơ <c>userapp/inp-p0-open-issues.md</c> ISSUE-15.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ MỘT ĐIỂM LỆCH LỚN VỚI SPEC PLAYWRIGHT: KHÔNG SEED DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// Spec bên kia seed thẳng dòng 処置 vào <c>trn_trn</c> rồi mở màn. Ở đây KHÔNG làm thế,
/// và không phải vì ngại: <c>SigaChg</c> đọc <c>ModCommon.pbui</c> — trạng thái trong BỘ NHỚ
/// của phiên chạy, nạp từ dòng đang có con trỏ (CommonInp.cs:594). Dòng seed thẳng vào DB
/// KHÔNG BAO GIỜ đi qua <c>IregCodChk</c>, nên không có 歯式 nào được ghi lúc nhập và cả
/// nhánh này biến mất. Chính spec bên kia cũng đã vấp: bản đầu của TC-4 seed DB rồi đòi
/// 欠損歯 và ĐỎ OAN (xem khối 「VÌ SAO 185 PHẢI NHẬP QUA UI」 của spec đó).
/// Mọi dòng ở đây vì thế đi trọn đường giao diện: Insert → 部位選択 → 病名選択 → gõ mã.
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class SigaKonGapsTests : UiTestBase
{
    private SigaKonDb _db = null!;
    private SigaToothFlow _flow = null!;

    private SigaSnapshot? _sigaBefore;
    private KonSnapshot? _konBefore;
    private int _preexistingTestRows;

    /// <summary>
    /// 歯式 lúc màn 診療入力 MỞ RA — tức chính là <c>pSiga_old</c> mà <c>Restore_SK</c> lùi về.
    /// Đặt bằng <see cref="PrepareDataBeforeApp"/>, đọc lại ở <c>OneTimeSetUp</c>.
    /// </summary>
    private SigaSnapshot? _sigaAtScreenOpen;

    /// <summary>
    /// 「Dòng nào vốn đã có」 của tháng test. Dọn theo ảnh chụp này thay vì theo danh sách
    /// mã: một lượt nhập 抜歯 làm app TỰ CHÈN thêm dòng 麻酔 và 部位病名行, những thứ đó ở
    /// lại sau F9 và dồn dần cho tới khi lưới dài ra và harness bắt đầu hụt.
    /// </summary>
    private HashSet<string> _monthRowsBefore = [];

    private int PermSlot => Settings.SigaTooth.PermBuiSlot;
    private int ControlSlot => Settings.SigaTooth.ControlBuiSlot;
    private int MilkSlot => Settings.SigaTooth.MilkBuiSlot;
    private int PermSeCol => PermSlot + 1;
    private int PermEkonCol => PermSlot + 1;
    private int CtrlSeCol => ControlSlot + 1;
    private int CtrlEkonCol => ControlSlot + 1;

    /// <summary>Ô 部位 (0-based) → cột <c>sn{n}</c> / <c>nkon{n}</c> — modSave.cs:995 (i&lt;16 ⇒ i-2, else i-8).</summary>
    private int MilkSnCol => MilkSlot < 16 ? MilkSlot - 2 : MilkSlot - 8;
    private int MilkNkonCol => MilkSnCol;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        Settings.SigaTooth.AllowSave
            ? null
            : "Cần sigaTooth.allowSave = true — luồng này nhập 処置 qua giao diện, và mỗi lượt " +
              "chốt là một 「update Siga/Kon」 thật (frm203016.cs:1275-1295). TcGAP8 còn XOÁ hẳn " +
              "dòng SIGA của bệnh nhân rồi dựng lại.";

    /// <summary>
    /// ⚠️ ĐẶT MỐC 歯式 TRƯỚC KHI APP MỞ — đây là chỗ DUY NHẤT làm được việc đó.
    ///
    /// <para><c>pSiga_old</c> / <c>pKon_old</c> — ảnh chụp mà <c>Restore_SK</c> lùi về — được
    /// <c>modKonSiga.pGet_SIGA</c> nạp ĐÚNG MỘT LẦN lúc mở 診療入力 (modKonSiga.cs:70-84) và
    /// giữ trong bộ nhớ suốt phiên. Mọi lệnh ghi thẳng vào bảng <c>SIGA</c> SAU thời điểm đó
    /// app KHÔNG BAO GIỜ thấy.</para>
    ///
    /// <para>Đo được 2026-09-03: TcGAP7 đặt mốc ở <c>OneTimeSetUp</c> — chạy SAU khi nền
    /// chung đã mở màn hình — nên <c>pSiga_old</c> giữ giá trị CŨ (se11 = 4 còn lại từ lượt
    /// trước). 「いいえ」 lùi đúng về cái ảnh chụp đó, tức vẫn là 4, và testcase đỏ như thể
    /// <c>Restore_SK</c> không chạy. Nó CÓ chạy — chỉ là lùi về một mốc khác mốc mình tưởng.</para>
    ///
    /// <para><see cref="UiTestBase.PrepareDataBeforeApp"/> sinh ra đúng cho loại bẫy này.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        var db = SigaKonDb.CreateOrNull(Settings);
        if (db is null || !db.CanWrite || db.ProbeError() is not null) return;

        db.EnsureSigaRow(PatNo);

        // ⚠️ CHỤP NGUYÊN TRẠNG Ở ĐÂY, TRƯỚC KHI ĐẶT MỐC.
        // `OneTimeSetUp` chạy SAU hàm này, nên chụp ở đó là chụp phải chính cái mốc mình
        // vừa ghi đè lên — và `OneTimeTearDown` sẽ 「khôi phục」 về mốc chứ không về nguyên
        // trạng. Đã trả giá 2026-09-03: bệnh nhân test mất ba ô 欠損 có sẵn (se4/5/6 = 4)
        // và hai ô 根数 (ekon11, nkon4 = 1), phải dựng lại bằng tay.
        _sigaBefore = db.ReadSiga(PatNo);
        Log($"nguyên trạng SIGA (chụp TRƯỚC khi đặt mốc): {_sigaBefore}");
        _konBefore = db.ReadKon(PatNo);
        Log($"nguyên trạng KON : {_konBefore}");

        db.ResetSigaToVital(PatNo);
        // ⚠️ CHỈ reset ô 根数 ĐEM THỬ. Ô ĐỐI CHỨNG thì KHÔNG — theo đúng nghĩa của nó:
        // ô không được đụng tới. Bản đầu reset luôn `ekon19` (ô 18 = 右下6) và làm mất giá
        // trị thật của bệnh nhân test; phải suy lại từ láng giềng (右下8/7 = 3) và đối xứng
        // (左下6 = 3) mới dựng lại được. Không testcase nào assert cột đó, nên việc reset
        // chẳng mua được gì mà chỉ có mất.
        db.ResetKonToNull(PatNo, [PermEkonCol], []);
        Log($"đặt mốc TRƯỚC khi mở app: mọi se* = {SigaKonDb.SeVital}, sn* = {SigaKonDb.SnVital}, " +
            "ekon ô thử = NULL ⇒ pSiga_old lúc mở màn chính là mốc này.");
    }

    [OneTimeSetUp]
    public void GapsOneTimeSetUp()
    {
        var db = SigaKonDb.CreateOrNull(Settings);
        if (db is null) IgnoreWithReason("Cần DB để đọc/khôi phục SIGA + KON — " + (DbUnavailableReason ?? "db.enabled = false"));
        var error = db!.ProbeError();
        if (error is not null) IgnoreWithReason($"không kết nối được SQL Server: {error}");
        _db = db;

        // _sigaBefore / _konBefore đã chụp ở PrepareDataBeforeApp — KHÔNG chụp lại ở đây.
        _preexistingTestRows = _db.CountTrnRowsWithTrtCd(PatNo, TrtDate, SigaKonDb.TestTrtCds);
        _monthRowsBefore = _db.SnapshotMonthRowKeys(PatNo, TrtDate);

        Log("╔══ NGUYÊN TRẠNG TRƯỚC LƯỢT CHẠY (chép lại nếu cần dựng tay) ══");
        Log($"║ SIGA: {_sigaBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ KON : {_konBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ tháng {TrtDate:yyyy-MM}: {_preexistingTestRows} dòng có sẵn mang trt_cd ∈ " +
            $"[{string.Join(",", SigaKonDb.TestTrtCds)}]");
        Log("╚══════════════════════════════════════════════════════════════");

        // Giá trị app đã chốt vào pSiga_old lúc mở màn = đúng thứ PrepareDataBeforeApp vừa đặt.
        _sigaAtScreenOpen = _db.ReadSiga(PatNo);
        Log($"pSiga_old (suy ra) = {_sigaAtScreenOpen}");
    }

    [SetUp]
    public void GapsSetUp() => _flow = new SigaToothFlow(App, Screen);

    [OneTimeTearDown]
    public void GapsOneTimeTearDown()
    {
        if (_db is null || !_db.CanWrite) return;
        try
        {
            // TcGAP8 xoá dòng SIGA — bảo đảm có dòng để mà khôi phục.
            _db.EnsureSigaRow(PatNo);
            if (_sigaBefore is not null) { _db.RestoreSiga(PatNo, _sigaBefore); Log("dọn: SIGA trả về nguyên trạng."); }
            if (_konBefore is not null) { _db.RestoreKon(PatNo, _konBefore); Log("dọn: KON trả về nguyên trạng."); }
            if (Settings.SigaTooth.AllowRowCleanup)
            {
                Log("dọn: " + _db.CleanupTestRows(PatNo, TrtDate, _preexistingTestRows));
                Log("dọn: " + _db.CleanupRowsNotIn(PatNo, TrtDate, _monthRowsBefore));
            }
        }
        catch (Exception e) { Log($"dọn HỎNG: {e.Message} — dựng tay theo khối 「NGUYÊN TRẠNG」 ở trên."); }
    }

    // ── Tiện ích dùng chung ──────────────────────────────────────────────────

    private SigaSnapshot ReadSiga(string when)
    {
        var s = _db.ReadSiga(PatNo);
        Assert.That(s, Is.Not.Null, $"Bệnh nhân {PatNo} KHÔNG còn dòng SIGA nào ({when}).");
        Log($"SIGA {when}: se{PermSeCol}={s!.SeCol(PermSeCol)} se{CtrlSeCol}={s.SeCol(CtrlSeCol)}");
        return s;
    }

    private KonSnapshot ReadKon(string when)
    {
        var k = _db.ReadKon(PatNo);
        Assert.That(k, Is.Not.Null, $"Bệnh nhân {PatNo} KHÔNG có dòng KON nào ({when}).");
        Log($"KON {when}: ekon{PermEkonCol}={KonSnapshot.S(k!.EkonCol(PermEkonCol))}");
        return k;
    }

    /// <summary>
    /// Dựng một dòng 処置 lên đúng MỘT răng, đi trọn đường giao diện.
    /// <paramref name="answerYes"/> chỉ có nghĩa với mã 185 (hộp thoại 抜歯同時).
    /// </summary>
    private SigaToothFlow.EnterResult EnterOnTooth(int trtCd, int trtSb, int slot, bool? answerYes,
                                                   TestTrace trace, bool milk = false,
                                                   bool requireCommitted = true)
    {
        Assert.That(_flow.EnsureCodeMode(), Is.True,
            $"Không đưa được ô 点 về コードモード (đang là 「{_flow.InpMode()}」).");

        var seat = _flow.InputRow();
        Assert.That(seat, Is.Not.Null,
            "Lưới không có dòng 処置 nào của tháng đang mở. Lưới hiện tại:\n  " +
            string.Join("\n  ", _flow.DescribeGrid()));

        var blank = _flow.InsertBlankRow(seat!, trace);
        Assert.That(blank, Is.Not.Null,
            "Insert không chèn được dòng trống (AddRow từ chối khi linekbn = 99). Lưới:\n  " +
            string.Join("\n  ", _flow.DescribeGrid()));

        var set = _flow.SetBuiOnRow(blank!, slot, milk, disCd: null, trace);
        Assert.That(set.ToothDialogOpened, Is.True, $"không mở được 部位選択. {set}");
        Assert.That(set.MarkedSlots, Is.EqualTo(new[] { slot }),
            $"部位選択 phải sáng ĐÚNG ô {slot} ({ToothSelectDialog.DescribeSlot(slot)}). {set}");

        var enter = _flow.EnterTreatmentAtCursor(trtCd, trtSb, answerYes, trace);
        Assert.That(enter.PickerOpened, Is.True,
            $"Gõ 「{trtCd}」 ở コードモード phải mở 処置選択. {enter}");
        // requireCommitted = false CHỈ dùng cho TcGAP12: nhánh 乳歯 của case 122 làm app ném
        // ngoại lệ ngay giữa lúc chốt, và cái CẦN ĐO ở đó chính là cú ném đó.
        if (requireCommitted)
            Assert.That(enter.Committed, Is.True, $"không chốt được 枝番 {trtSb}. {enter}");
        return enter;
    }

    /// <summary>
    /// F9 登録 → trả lời 「はい」 → mở lại màn hình nếu app đóng nó.
    ///
    /// <para>In ra <c>OverwriteAsked</c> vì nó đổi hẳn ý nghĩa của mọi assert phía sau: nếu
    /// 「上書きしますか？」 có bung và mình trả lời 「いいえ」 thì <c>Save_Data</c> DỪNG — 歯式
    /// không đổi là vì KHÔNG LƯU, chứ không phải vì app thiếu chức năng.</para>
    /// </summary>
    private SaveFlow.Result SaveF9(TestTrace trace)
    {
        var save = SaveFlow.PressF9(App, Screen.Window, SaveFlow.SaveAnswer.Yes,
                                    SaveFlow.OverwriteAnswer.No, trace);
        Log($"F9: 「{save.SaveQuestionText}」 · 上書き hỏi? {save.OverwriteAsked} · " +
            $"màn hình đóng? {save.ScreenClosedAfterwards}");
        Assert.That(save.OverwriteAsked, Is.False,
            "Bung 「上書きしますか？」 nghĩa là CompareTrntrnData thấy dữ liệu đã bị đổi bởi một " +
            "phiên khác, và lượt trả lời 「いいえ」 ở đây làm Save_Data DỪNG GIỮA CHỪNG " +
            "(modSave.cs:262-296). Mọi assert 歯式 phía sau khi đó chỉ nói 「không lưu」 chứ " +
            "không nói gì về app. Chạy lại một mình, đừng đọc kết quả này.");
        ReopenIfClosed();
        return save;
    }

    /// <summary>
    /// 部位 mà dòng <paramref name="trtCd"/> ĐÃ LƯU thực sự mang — đối chiếu trước khi kết
    /// luận về 歯式 (xem <see cref="SigaKonDb.ReadTrnBui"/>).
    /// </summary>
    private TrnBuiRow? LastSavedRow(int trtCd)
    {
        var rows = _db.ReadTrnBui(PatNo, TrtDate, trtCd);
        Log($"dòng {trtCd} đã lưu: " + (rows.Count == 0 ? "(không có)" : string.Join(" | ", rows)));
        return rows.Count == 0 ? null : rows[^1];
    }

    private void ReopenIfClosed()
    {
        if (TreatmentScreenAlive()) return;
        ReopenTreatmentScreen();
        _flow = new SigaToothFlow(App, Screen);
        Log("đã mở lại màn 診療入力.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP1 ← TC-1 (mốc) — chỉ hỏi DB, không đụng giao diện
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TcGAP1 (mốc) ← TC-1 — master của tháng có đủ 179 / 122-3 / 185")]
    public void TcGAP1_Master_Has_All_Three_Codes()
    {
        var table = _db.ActiveTrtTable(TrtDate);
        Log($"master áp dụng cho {TrtDate:yyyy-MM-dd} = {table}");

        var ext = _db.FindMasterRow(TrtDate, SigaToothFlow.ExtractionTrtCd, 1);
        var emr = _db.FindMasterRow(TrtDate, SigaToothFlow.EmrTrtCd, SigaToothFlow.EmrFourRootSb);
        var cyst = _db.FindMasterRow(TrtDate, SigaToothFlow.CystTrtCd, 0);
        foreach (var r in new[] { ext, emr, cyst }) Log("  " + (r?.ToString() ?? "(KHÔNG có)"));

        Assert.Multiple(() =>
        {
            Assert.That(ext, Is.Not.Null,
                $"{table} không có 179/1 (抜歯). Ba mã này là hằng số HARD-CODE trong WinForm " +
                "(frm203016.cs:1024/:1033/:1045), thiếu chúng thì không testcase nào sau đây chạy được.");
            Assert.That(emr, Is.Not.Null,
                $"{table} không có 122/{SigaToothFlow.EmrFourRootSb} (ＥＭＲ４根) — 枝番 3 là điều kiện " +
                "duy nhất mở nhánh ghi 根数 (modSave.cs:772 `intN == 3`).");
            Assert.That(cyst, Is.Not.Null,
                $"{table} không có 185/0 (歯根嚢胞摘出手術).");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP2 ← TC-2 (đối chứng lớn)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TcGAP2 (đối chứng lớn) ← TC-2 — 抜歯 179 ghi 欠損歯 vào SIGA")]
    public void TcGAP2_Extraction_Writes_Missing_Tooth()
    {
        using var trace = TestTrace.Begin();

        var before = ReadSiga("trước khi nhập 179/1");
        Assert.That(before.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital), "mốc xuất phát phải là 生活歯");

        EnterOnTooth(SigaToothFlow.ExtractionTrtCd, 1, PermSlot, null, trace);

        var after = ReadSiga("sau khi chốt 179/1");
        Assert.That(after.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            $"179 (枝番 ∉ {{5}}) phải ghi se{PermSeCol} = {SigaKonDb.SeMissing} (欠損歯) — " +
            "frm203016.cs:1243-1252. Đây là đường ĐÃ PORT ĐẦY ĐỦ, dùng làm đối chứng cho ba gap " +
            "còn lại: nó đỏ thì đừng đi tìm gap, harness đang hỏng.");

        // Dọn để testcase sau xuất phát sạch.
        var row = _flow.LastRowMatching("抜歯");
        if (row is not null) _flow.DeleteRow(row, trace);
        _db.ResetSigaToVital(PatNo);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP3 ← TC-3 — GAP A: ＥＭＲ(４根) → KON
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TcGAP3 ← TC-3 — ＥＭＲ(４根) 122/3 ghi 根数 4 vào bảng KON")]
    public void TcGAP3_Emr_FourRoot_Writes_RootCount()
    {
        using var trace = TestTrace.Begin();

        _db.ResetKonToNull(PatNo, [PermEkonCol], []);
        var before = ReadKon("trước khi nhập 122/3");
        Assert.That(before.EkonCol(PermEkonCol), Is.Null,
            $"Mốc xuất phát của ekon{PermEkonCol} phải là NULL — cột KON là nullable, và phân biệt " +
            "được NULL với 0 chính là thứ làm gap này nhìn thấy được.");

        EnterOnTooth(SigaToothFlow.EmrTrtCd, SigaToothFlow.EmrFourRootSb, PermSlot, null, trace);

        var after = ReadKon("sau khi chốt 122/3");
        Assert.That(after.EkonCol(PermEkonCol), Is.EqualTo(SigaKonDb.EmrRootCount),
            $"ＥＭＲ(４根) phải ghi ekon{PermEkonCol} = {SigaKonDb.EmrRootCount} — hằng số 「4」 nằm " +
            "thẳng trong chuỗi SQL của WinForm (frm203016.cs:1150 lúc nhập, modSave.cs:790 lúc F9). " +
            $"Đang là {KonSnapshot.S(after.EkonCol(PermEkonCol))}.\n" +
            "NULL nghĩa là cả nhánh 根数 chưa bao giờ chạy — đúng triệu chứng GAP A của bản web " +
            "(ToothStatusChangeCalculator.ApplyKon chặn cứng trên 179/5).");

        var row = _flow.LastRowMatching("ＥＭＲ", "EMR");
        if (row is not null) _flow.DeleteRow(row, trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP4 / TcGAP5 ← TC-4 / TC-4b — GAP B: 歯根嚢胞摘出手術 185
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TcGAP4 ← TC-4 — 185 + 「はい」 gọi SigaChg(179,0) ⇒ 欠損歯")]
    public void TcGAP4_Cyst_Yes_Marks_Missing()
    {
        using var trace = TestTrace.Begin();

        _db.ResetSigaToVital(PatNo);
        var before = ReadSiga("trước khi nhập 185");

        var enter = EnterOnTooth(SigaToothFlow.CystTrtCd, 0, PermSlot, answerYes: true, trace);
        Log("hộp thoại gặp: " + string.Join(" / ", enter.Dialogs));

        Assert.That(enter.Dialogs.Any(d => Txt.Has(d, SigaToothFlow.CystConfirmFragment)), Is.True,
            "Chốt 185 phải bung Q00200 「歯根嚢胞摘出手術と同時に抜歯手術を行いましたか？」 " +
            $"(frm203016.cs:1047). Không bung ⇒ cả nhánh 185 không tồn tại. Đã gặp: " +
            $"[{string.Join(" / ", enter.Dialogs)}]");

        var after = ReadSiga("sau 185 + はい");
        Assert.That(after.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            $"「はい」 gọi thẳng SigaChg(179, 0) (frm203016.cs:1049) nên se{PermSeCol} phải = " +
            $"{SigaKonDb.SeMissing}, y hệt một ca 抜歯 thật. Đang là {after.SeCol(PermSeCol)}. " +
            $"Trước khi nhập là {before.SeCol(PermSeCol)}.");

        var row = _flow.LastRowMatching("嚢胞");
        if (row is not null) _flow.DeleteRow(row, trace);
    }

    [Test, Order(5)]
    [Description("TcGAP5 (đối chứng) ← TC-4b — 185 + 「いいえ」 KHÔNG đụng 歯式")]
    public void TcGAP5_Cyst_No_Leaves_Teeth_Alone()
    {
        using var trace = TestTrace.Begin();

        _db.ResetSigaToVital(PatNo);
        var before = ReadSiga("trước khi nhập 185 (lượt 「いいえ」)");

        var enter = EnterOnTooth(SigaToothFlow.CystTrtCd, 0, PermSlot, answerYes: false, trace);
        Log("hộp thoại gặp: " + string.Join(" / ", enter.Dialogs));

        var after = ReadSiga("sau 185 + いいえ");
        Assert.That(after.DiffFrom(before), Is.Empty,
            "「いいえ」 chỉ đặt cờ grid col 74 = 0 và KHÔNG gọi SigaChg (frm203016.cs:1055-1057), nên " +
            "SIGA phải Y NGUYÊN. Có cột đổi ⇒ nhánh 185 đang ghi 歯式 vô điều kiện — nghĩa là mọi ca " +
            "歯根嚢胞摘出 KHÔNG kèm 抜歯 cũng bị đánh dấu mất răng.");

        var row = _flow.LastRowMatching("嚢胞");
        if (row is not null) _flow.DeleteRow(row, trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP6 / TcGAP7 ← TC-5 / TC-5b — GAP C: hai nửa BẤT ĐỐI XỨNG của Restore_SK
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("TcGAP6 ← TC-5 — 「いいえ」 KHÔNG lùi cái DelExtRec vừa ghi (pSiga_chg không bật)")]
    public void TcGAP6_Discard_Does_Not_Undo_DelExtRec()
    {
        using var trace = TestTrace.Begin();

        // Mốc: một răng ĐÃ 欠損 và đã LƯU. Không có mốc đã lưu thì nhánh discard không
        // chứng minh được gì.
        _db.WriteSiga(PatNo, se: new Dictionary<int, int> { [PermSeCol] = SigaKonDb.SeMissing });
        var atOpen = ReadSiga("mốc: răng đang 欠損");
        Assert.That(atOpen.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing), "harness: chưa dựng được mốc");

        // Dựng dòng 抜歯 rồi XOÁ nó — phiên này CHỈ XOÁ, không nhập gì cả về mặt 歯式:
        // SigaChg của lượt nhập có bật cờ, nên phải bấm F9 để chốt lại mốc trước đã.
        EnterOnTooth(SigaToothFlow.ExtractionTrtCd, 1, PermSlot, null, trace);
        var save = SaveFlow.PressF9(App, Screen.Window, SaveFlow.SaveAnswer.Yes,
                                    SaveFlow.OverwriteAnswer.No, trace);
        Log($"F9 chốt mốc: 「{save.SaveQuestionText}」, màn hình đóng? {save.ScreenClosedAfterwards}");
        ReopenIfClosed();
        _flow = new SigaToothFlow(App, Screen);

        var afterSave = ReadSiga("sau F9 (mốc đã lưu)");
        Assert.That(afterSave.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            $"Sau F9, se{PermSeCol} phải là {SigaKonDb.SeMissing}: tập 処置 đã lưu có một dòng 179 trên " +
            "răng đó nên SigaChg_Save dựng lại đúng thế (modSave.cs:975-1030). Đỏ ở đây là hỏng " +
            "harness, KHÔNG phải gap Restore_SK.");

        // Bây giờ mới là phiên CHỈ XOÁ.
        var row = _flow.LastRowMatching("抜歯");
        Assert.That(row, Is.Not.Null, "không thấy dòng 抜歯 đã lưu sau khi mở lại màn hình");
        var del = _flow.DeleteRow(row!, trace);
        Log($"xoá dòng 抜歯: {del}");

        var afterDelete = ReadSiga("sau khi xoá (DelExtRec), CHƯA lưu");
        Assert.That(afterDelete.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"DelExtRec phải trả se{PermSeCol} về {SigaKonDb.SeVital} ngay lúc xoá (frm203002.cs:6185).");

        // 「いいえ」 ở dirty gate.
        var back = _flow.PressBack("いいえ", trace);
        Log("F10 戻る: " + back);
        Assert.That(back.Answered, Is.True,
            $"KHÔNG bấm trúng nút 「いいえ」 của dirty gate — nút thật sự có: [{string.Join(",", back.Buttons)}]. " +
            "Không trả lời được thì mọi khẳng định phía sau vô nghĩa: 「歯式 không đổi」 khi đó chỉ " +
            "nghĩa là chưa ai trả lời câu hỏi.");
        Assert.That(back.GateAsked, Is.True,
            "Xoá một dòng rồi F10 戻る phải bung 「処置データは変更されています。保存しますか？」 " +
            "(modSave.cs:154-226). Không bung ⇒ app không coi việc xoá là 「đã sửa」.");

        var afterDiscard = ReadSiga("sau 「いいえ」");
        Assert.That(afterDiscard.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"DelExtRec CỐ Ý không bật pSiga_chg (nó phát một 「update Siga」 trần, frm203002.cs:6185-6190), " +
            $"nên Restore_SK bỏ qua nó (modSave.cs:4684) và răng PHẢI Ở LẠI {SigaKonDb.SeVital} sau " +
            $"「いいえ」. Ra {SigaKonDb.SeMissing} nghĩa là DelExtRec đang bị arm cờ nhầm — khi đó một " +
            "thao tác xoá rồi huỷ sẽ khôi phục cả những 欠損 mà người dùng thật sự muốn bỏ.\n" +
            "⛔ ĐÂY LÀ BUG CỦA WINFORM, port có chủ ý — ISSUE-15. Đừng 「sửa」 assert này.");

        ReopenIfClosed();

        // ── Vế thứ hai: 「いいえ」 = KHÔNG lưu ⇒ dòng 抜歯 vẫn còn nguyên trong TRNTRN ──
        //
        // ⚠️ HỎI DB, ĐỪNG HỎI LƯỚI. Đo được 2026-09-03: trả lời 「いいえ」 ở F10 戻る
        // KHÔNG đóng màn hình (đo ra `đóng? False`), nên lưới vẫn đang hiển thị trạng thái
        // TRONG BỘ NHỚ — tức là trạng thái đã xoá. Bản đầu của testcase này đọc lưới rồi
        // kết luận 「dòng đã mất khỏi DB」 và đỏ oan, trong khi DB hoàn toàn nguyên vẹn.
        // Bên Playwright né được vì nó `openTreatmentScreen()` nạp lại; ở đây hỏi thẳng DB
        // vừa chắc chắn hơn vừa nói đúng điều cần khoá.
        var rowsLeft = _db.CountTrnRowsWithTrtCd(PatNo, TrtDate, SigaToothFlow.ExtractionTrtCd);
        Log($"số dòng 179 còn trong TRNTRN sau discard: {rowsLeft}");

        Assert.That(rowsLeft, Is.GreaterThan(0),
            "「いいえ」 = KHÔNG lưu ⇒ dòng 抜歯 (đã được F9 ở trên ghi xuống) chưa bao giờ bị xoá khỏi " +
            "TRNTRN: RestoreData chỉ lùi 歯式/根数, không đụng bảng 処置 (modSave.cs:453-462).\n" +
            "Đây chính là trạng thái TỰ MÂU THUẪN mà WinForm chấp nhận và bản web phải khớp: " +
            $"răng đã về 生活歯 = {SigaKonDb.SeVital} trong khi dòng 抜歯 vẫn nằm nguyên trong DB.\n" +
            "Bằng 0 nghĩa là 「いいえ」 đang xoá cả dữ liệu đã lưu — nguy hiểm hơn hẳn cái bug đang đo.");

        // Và màn hình thì vẫn đang vẽ trạng thái ĐÃ VỨT BỎ — ghi lại để người đọc log thấy
        // rõ hai thứ đang lệch nhau, chứ không assert (đó là hành vi của app, không phải lỗi).
        Log("lưới sau discard (KHÔNG nạp lại, nên vẫn là trạng thái trong bộ nhớ):\n  " +
            string.Join("\n  ", _flow.DescribeGrid().TakeLast(6)));
    }

    [Test, Order(7)]
    [Description("TcGAP7 ← TC-5b — 「いいえ」 PHẢI lùi cái SigaChg vừa ghi (Restore_SK thật sự chạy)")]
    public void TcGAP7_Discard_Undoes_SigaChg()
    {
        using var trace = TestTrace.Begin();

        // ⚠️ KHÔNG reset 歯式 ở đây rồi ReopenTreatmentScreen(): pSiga_old đã chốt từ lúc màn
        // hình mở ra, và ReopenTreatmentScreen là NO-OP khi frm203002 còn đang mở
        // (AppNavigator.OpenTreatmentEntry trả về cửa sổ có sẵn). Mốc được đặt ở
        // PrepareDataBeforeApp — xem chú thích của hàm đó.
        var atOpen = _sigaAtScreenOpen;
        Assert.That(atOpen, Is.Not.Null, "không đọc được mốc lúc mở màn");
        Assert.That(atOpen!.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"Mốc lúc MỞ MÀN phải là 生活歯 = {SigaKonDb.SeVital}, đang là {atOpen.SeCol(PermSeCol)}. " +
            "Khác đi thì pSiga_old cũng mang giá trị đó, và 「いいえ」 lùi về đúng nó — testcase sẽ " +
            "không phân biệt được 「Restore_SK chạy」 với 「Restore_SK không chạy」.\n" +
            "⚠️ TcGAP7 phải chạy trong LƯỢT RIÊNG (-Filter TcGAP7): các TC trước ghi SIGA sau khi " +
            "màn hình đã mở, mà những lệnh ghi đó pSiga_old không hề thấy.");

        var current = ReadSiga("hiện tại (phải khớp mốc lúc mở màn)");
        Assert.That(current.DiffFrom(atOpen), Is.Empty,
            "SIGA đã bị đổi SAU khi màn hình mở ⇒ pSiga_old không còn khớp trạng thái hiện tại, " +
            "và phép so cuối testcase mất nghĩa. Chạy TcGAP7 một mình.");

        EnterOnTooth(SigaToothFlow.ExtractionTrtCd, 1, PermSlot, null, trace);

        var afterEntry = ReadSiga("sau khi chốt 179/1 (CHƯA F9)");
        Assert.That(afterEntry.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            "SigaChg ghi 歯式 NGAY lúc chốt 処置, trước 登録. Vẫn là 生活歯 nghĩa là đường ghi lúc nhập " +
            "không chạy ⇒ cờ pSiga_chg cũng chưa bao giờ bật và TC này không kiểm được gì.");

        var back = _flow.PressBack("いいえ", trace);
        Log("F10 戻る: " + back);
        Assert.That(back.GateAsked, Is.True, "F10 戻る sau khi nhập 処置 phải bung dirty gate.");
        Assert.That(back.Answered, Is.True,
            $"KHÔNG bấm trúng nút 「いいえ」 — nút thật sự có: [{string.Join(",", back.Buttons)}]. " +
            "Chưa trả lời được thì không thể kết luận gì về Restore_SK.");
        // KHÔNG assert GateClosed: 「いいえ」 đóng luôn màn 診療入力, và khi cửa sổ chủ biến
        // mất thì phần tử MessageBox đã cache không còn đọc được đáng tin. `Answered` +
        // `ScreenClosed` mới là hai mốc chắc.

        var afterDiscard = ReadSiga("sau 「いいえ」");
        Assert.That(afterDiscard.DiffFrom(atOpen), Is.Empty,
            "SigaChg BẬT pSiga_chg (frm203016.cs:1282) ⇒ 「いいえ」 chạy RestoreData → Restore_SK → " +
            "Restore_Siga, ghi lại ĐỦ 52 cột từ snapshot lúc mở màn (modSave.cs:455-463 → :4700-4729). " +
            "SIGA vì thế phải Y HỆT lúc mở màn.\n" +
            "Còn chênh lệch nghĩa là 欠損 do một 処置 CHƯA ĐƯỢC LƯU nằm lại DB vĩnh viễn: răng đó biến " +
            "mất khỏi 部位選択 mà không có dòng 処置 nào giải thích.\n" +
            "⚠️ Đây là vế DUY NHẤT chứng minh Restore_SK có chạy. Thiếu nó thì một bản port 「không " +
            "ghi gì trước F9」 cũng làm TcGAP6 xanh y hệt.");

        ReopenIfClosed();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP8 ← TC-6 — GAP D: thiếu dòng SIGA
    //         XẾP CUỐI vì đây là testcase phá trạng thái nặng nhất.
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(8)]
    [Description("TcGAP8 ← TC-6 — bệnh nhân KHÔNG có dòng SIGA: app phải TẠO, không im lặng bỏ qua")]
    public void TcGAP8_Missing_Siga_Row_Is_Created()
    {
        using var trace = TestTrace.Begin();

        // ⚠️ PHẢI ĐÓNG MÀN HÌNH THẬT TRƯỚC, rồi mới xoá dòng SIGA.
        //
        // `pGet_SIGA` — chỗ WinForm tạo dòng khi thiếu — chạy trong `modPat.Get_PatRs`, mà
        // hàm đó chỉ được gọi từ 患者確定 ở frm203001 (frm203001.cs:1047). Mở lại màn hình
        // khi frm203002 CÒN ĐANG MỞ là no-op: `AppNavigator.OpenTreatmentEntry` trả về cửa
        // sổ có sẵn, không đi qua 患者選択, nên `pGet_SIGA` không chạy lần nào.
        //
        // Đo được 2026-09-03: bản đầu của testcase này đỏ sau 3 giây với 「app không tạo
        // dòng」 — trong khi app chưa hề có cơ hội chạy đường tạo dòng.
        var back = _flow.PressBack("いいえ", trace);
        Log("đóng màn hình trước khi xoá dòng SIGA: " + back);
        Assert.That(TreatmentScreenAlive(), Is.False,
            "Không đóng được màn 診療入力 nên lượt mở lại sẽ là no-op và app không bao giờ chạy " +
            $"pGet_SIGA. {back}");

        var deleted = _db.DeleteSigaRow(PatNo);
        Log($"đã xoá {deleted} dòng SIGA của bệnh nhân {PatNo} — mở lại 診療入力 để xem app làm gì.");
        Assert.That(_db.HasSigaRow(PatNo), Is.False, "harness: dòng SIGA chưa bị xoá thật");

        try
        {
            // WinForm tạo dòng NGAY LÚC 患者確定, không đợi F9: modKonSiga.pGet_SIGA
            // 「レコードがない場合作成する」 (modKonSiga.cs:70-84) và Siga.getSigaData cũng
            // tự chèn mặc định khi không tìm thấy (Siga.cs:113 → insertDefaultSiga).
            ReopenTreatmentScreen();
            _flow = new SigaToothFlow(App, Screen);
            trace.Shot("sau-khi-mo-lai-man");

            Assert.That(_db.HasSigaRow(PatNo), Is.True,
                "Mở màn 診療入力 cho một bệnh nhân KHÔNG có dòng SIGA phải TẠO dòng đó " +
                "(modKonSiga.cs:70-84 「レコードがない場合作成する」). Không tạo ⇒ mọi " +
                "「update Siga … where pat_no = …」 sau này là UPDATE trúng 0 dòng: 歯式 mất ÂM THẦM, " +
                "không lỗi, không log.\n" +
                "⚠️ Đây cũng là điểm LỆCH về THỜI ĐIỂM với bản web: bên đó chỗ duy nhất tạo dòng " +
                "`siga` là màn 患者登録, còn handler lưu thì chỉ `if (siga is not null)` rồi bỏ qua.");

            var created = ReadSiga("dòng SIGA app vừa tạo");
            Assert.Multiple(() =>
            {
                Assert.That(created.SeCol(1), Is.EqualTo(SigaKonDb.SeVital),
                    $"Dòng mới phải mang DEFAULT của cột: se* = {SigaKonDb.SeVital} (生活歯).");
                Assert.That(created.SnCol(1), Is.EqualTo(SigaKonDb.SnVital),
                    $"và sn* = {SigaKonDb.SnVital} — 「健全歯」 của 乳歯 là 5, KHÔNG phải 0 " +
                    "(schema: sn_* DEFAULT 5).");
            });
        }
        finally
        {
            // Dù thế nào cũng phải có dòng để OneTimeTearDown còn khôi phục được.
            if (_db.EnsureSigaRow(PatNo)) Log("teardown: đã tạo lại dòng SIGA (app không tạo).");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP9 ← TC-3 vế (c) — ĐỐI CHỨNG của GAP A
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(9)]
    [Description("TcGAP9 (đối chứng) ← TC-3(c) — ＥＭＲ(１根) 122/0 KHÔNG được ghi 根数")]
    public void TcGAP9_Emr_OneRoot_Writes_No_RootCount()
    {
        using var trace = TestTrace.Begin();

        // Vế ngược của TcGAP3, và là vế duy nhất phân biệt 「ghi đúng điều kiện」 với
        // 「ghi cho mọi ca ＥＭＲ」. Thiếu nó thì một bản port quét quá tay vẫn xanh.
        _db.ResetKonToNull(PatNo, [CtrlEkonCol], []);
        var before = ReadKon("trước khi nhập 122/0 lên răng đối chứng");
        Assert.That(before.EkonCol(CtrlEkonCol), Is.Null,
            $"Mốc xuất phát của ekon{CtrlEkonCol} phải là NULL — không phân biệt được NULL với 0 " +
            "thì testcase này không kết luận được gì.");

        EnterOnTooth(SigaToothFlow.EmrTrtCd, SigaToothFlow.EmrOneRootSb, ControlSlot, null, trace);

        var after = ReadKon("sau khi chốt 122/0");
        Log($"ekon{CtrlEkonCol} (ô đối chứng {ControlSlot}) = {KonSnapshot.S(after.EkonCol(CtrlEkonCol))}");

        Assert.That(after.EkonCol(CtrlEkonCol), Is.Null,
            $"WinForm chỉ ghi 根数 khi 枝番 == 3 (frm203016.cs:1024 「IregCodChk case 122」 → " +
            $"SigaChg(122, 3); modSave.cs:772 「if (intN == 3)」). ＥＭＲ(１根) 122/{SigaToothFlow.EmrOneRootSb} " +
            $"vì thế phải để ekon{CtrlEkonCol} nguyên NULL, đang là " +
            $"{KonSnapshot.S(after.EkonCol(CtrlEkonCol))}.\n" +
            "Có số nghĩa là đường ghi 根数 quét quá tay — mọi ca ＥＭＲ đều bị gán 4 根, kể cả răng " +
            "một chân. Đây KHÔNG phải gap đang soi ở TcGAP3, mà là lỗi ngược lại.");

        // Ô ĐEM THỬ của TcGAP3 không được dính chưởng.
        Assert.That(after.DiffFrom(before), Is.Empty,
            $"122/{SigaToothFlow.EmrOneRootSb} không được đụng BẤT KỲ ô 根数 nào. Đã lệch: " +
            $"[{string.Join(", ", after.DiffFrom(before))}]");

        var row = _flow.LastRowMatching("ＥＭＲ", "EMR");
        if (row is not null) _flow.DeleteRow(row, trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP10 / TcGAP11 ← TC-4 / TC-4b, NỬA F9 — GAP B ở đường SigaChg_Save
    //
    // TcGAP4/TcGAP5 đo đường NHẬP (frm203016.SigaChg, chạy ngay lúc chốt 処置).
    // Hai testcase này đo đường F9 (modSave.SigaChg_Save case 185, :1031-1085) —
    // và đó mới là đường DUY NHẤT bản web có: bên đó không ghi gì lúc nhập, mọi
    // thứ dồn vào POST /tenant/treatment/bulk-save. Không đo nửa này thì phần
    // WinForm mà bản web phải khớp vẫn chưa hề được đo.
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(10)]
    [Description("TcGAP10 ← TC-4 nửa F9 — SigaChg_Save case 185 dựng LẠI 欠損歯 từ cờ 抜歯同時")]
    public void TcGAP10_Cyst_Yes_Rewritten_By_F9()
    {
        using var trace = TestTrace.Begin();

        _db.ResetSigaToVital(PatNo);
        var enter = EnterOnTooth(SigaToothFlow.CystTrtCd, 0, PermSlot, answerYes: true, trace);
        Assert.That(enter.Dialogs.Any(d => Txt.Has(d, SigaToothFlow.CystConfirmFragment)), Is.True,
            $"Chốt 185 phải bung Q00200 (frm203016.cs:1047) — không bung thì 「はい」 chưa bao giờ " +
            $"được trả lời và cờ col 74 vẫn là 0. Đã gặp: [{string.Join(" / ", enter.Dialogs)}]");

        var afterEntry = ReadSiga("sau khi chốt 185 + はい (CHƯA F9)");
        Assert.That(afterEntry.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            "đường NHẬP phải ghi 欠損歯 trước đã — đó là tiền đề của TcGAP4, đỏ ở đây thì sửa TcGAP4.");

        // ⚠️ XOÁ DẤU VẾT CỦA ĐƯỜNG NHẬP, SAU LƯNG APP.
        // Không có bước này thì se = 4 sau F9 có HAI cách giải thích — 「F9 ghi lại」 và
        // 「giá trị cũ của đường nhập còn nằm đó」 — và testcase không phân biệt được.
        // Ghi thẳng DB thì app không thấy: pSiga_old đã chốt từ lúc mở màn.
        _db.WriteSiga(PatNo, se: new Dictionary<int, int> { [PermSeCol] = SigaKonDb.SeVital });
        var wiped = ReadSiga("đã xoá dấu vết đường nhập, ngay TRƯỚC F9");
        Assert.That(wiped.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital), "harness: chưa xoá được dấu vết");

        SaveF9(trace);

        // Mốc chẩn đoán TRƯỚC khi kết luận (giống savedCystBui() của spec Playwright).
        var saved = LastSavedRow(SigaToothFlow.CystTrtCd);
        Assert.That(saved, Is.Not.Null,
            "Sau F9 phải có một dòng 185 trong TRNTRN. Không có ⇒ dòng chưa từng được lưu và " +
            "mọi khẳng định về 歯式 bên dưới là vô nghĩa (harness hỏng, không phải app).");
        Assert.That(saved!.Slot(PermSlot), Is.Not.Zero,
            $"Dòng 185 đã lưu phải mang 部位 ở ô {PermSlot} ({ToothSelectDialog.DescribeSlot(PermSlot)}), " +
            $"đang là: {saved.MarkedSlots()}.\n" +
            "bui toàn 0 ⇒ SigaChg_Save duyệt qua mà không thấy răng nào, và 「歯式 không đổi」 chỉ " +
            "nói rằng harness không dựng nổi dữ liệu — HARNESS hỏng, sửa nó trước.");

        var after = ReadSiga("sau F9");
        Assert.That(after.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            $"F9 phải ghi LẠI se{PermSeCol} = {SigaKonDb.SeMissing} từ ĐẦU: Save_Data gọi Restore_SK " +
            "(modSave.cs:583, lùi về pSiga_old = toàn 生活歯) rồi SigaChg_Save dựng lại từ TẬP 処置, " +
            "và case 185 ghi 欠損歯 khi cờ 抜歯同時 khác 0 (modSave.cs:1031-1085).\n" +
            $"Đang là {after.SeCol(PermSeCol)} — tức chỉ đường NHẬP có ghi, còn F9 thì không. Bản web " +
            "KHÔNG có đường nhập, nên nếu WinForm cũng không ghi ở F9 thì mã 185 không có đường nào " +
            "sống sót qua một lượt 登録, và cả TC-4 bên kia phải đọc lại.");

        var row = _flow.LastRowMatching("嚢胞");
        if (row is not null) _flow.DeleteRow(row, trace);
        SaveF9(trace);
    }

    [Test, Order(11)]
    [Description("TcGAP11 (đối chứng) ← TC-4b nửa F9 — 「いいえ」 ⇒ F9 KHÔNG đụng 歯式")]
    public void TcGAP11_Cyst_No_Not_Rewritten_By_F9()
    {
        using var trace = TestTrace.Begin();

        _db.ResetSigaToVital(PatNo);
        var before = ReadSiga("mốc trước khi nhập 185 + いいえ");

        EnterOnTooth(SigaToothFlow.CystTrtCd, 0, PermSlot, answerYes: false, trace);
        var afterEntry = ReadSiga("sau khi chốt 185 + いいえ (CHƯA F9)");
        Assert.That(afterEntry.DiffFrom(before), Is.Empty,
            "đường NHẬP không được đụng 歯式 khi trả lời 「いいえ」 — tiền đề của TcGAP5.");

        SaveF9(trace);

        var saved = LastSavedRow(SigaToothFlow.CystTrtCd);
        Assert.That(saved, Is.Not.Null, "sau F9 phải có dòng 185 trong TRNTRN");
        Assert.That(saved!.Slot(PermSlot), Is.Not.Zero,
            $"Dòng 185 phải mang 部位 ô {PermSlot} thì phép so mới có nghĩa — bui = 0 thì 「歯式 không " +
            $"đổi」 là chuyện đương nhiên. Đang là: {saved.MarkedSlots()}");

        var after = ReadSiga("sau F9");
        Assert.That(after.DiffFrom(before), Is.Empty,
            "Cờ 抜歯同時 (lưới col 74) = 0 ⇒ SigaChg_Save bỏ qua CẢ case 185 " +
            "(modSave.cs:1033 「if (CInt(hFG1[74, j]) != 0)」) ⇒ SIGA phải Y NGUYÊN sau F9.\n" +
            $"Đã lệch: [{string.Join(", ", after.DiffFrom(before))}].\n" +
            "Có cột đổi nghĩa là mọi ca 歯根嚢胞摘出 KHÔNG kèm 抜歯 vẫn bị đánh dấu mất răng — và " +
            "vì cờ đó KHÔNG có cột nào trong TRNTRN, người dùng không có cách nào sửa lại.");

        var row = _flow.LastRowMatching("嚢胞");
        if (row is not null) _flow.DeleteRow(row, trace);
        SaveF9(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP12 ← TC-3 vế (b) — GAP A trên RĂNG SỮA
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(12)]
    [Description("TcGAP12 ← TC-3(b) — ＥＭＲ(４根) trên RĂNG SỮA: đo cả cú ném của đường nhập")]
    public void TcGAP12_Emr_FourRoot_On_MilkTooth()
    {
        using var trace = TestTrace.Begin();

        // ⚠️ ĐỌC TRƯỚC KHI SỬA TESTCASE NÀY.
        // Spec Playwright TC-3 vế (b) đòi `nkon_4 = 4` cho ＥＭＲ(４根) trên răng sữa. Ở WinForm
        // đường NHẬP không làm nổi việc đó: `SigaChg` case 122 nhánh 乳歯 gọi
        // `makeSql("NKon", …, ref strSiga)` (frm203016.cs:1155-1160) — nhét tên cột của bảng
        // KON vào câu `update SIGA` ⇒ SQL Server trả 「Invalid column name 'NKon…'」 và app bung
        // hộp thoại .NET Continue/Quit (đo được 2026-09-04, probe Tc1e).
        // Nhánh save-time thì ĐÚNG (`ref strKon`, modSave.cs:800/804).
        // Vì thế testcase này KHÔNG đòi 「nhập xong là có nkon」 — nó đo và GHIM lại:
        //   ① đường nhập ném (bug thật của WinForm, đã có hồ sơ);
        //   ② F9 có dựng được 根数 cho răng sữa hay không — đây mới là đường bản web port.
        _db.ResetKonToNull(PatNo, [], [MilkNkonCol]);
        var before = ReadKon("trước khi nhập 122/3 lên răng sữa");
        Log($"nkon{MilkNkonCol} trước = {KonSnapshot.S(before.NkonCol(MilkNkonCol))}");

        var enter = EnterOnTooth(SigaToothFlow.EmrTrtCd, SigaToothFlow.EmrFourRootSb, MilkSlot,
                                 null, trace, milk: true, requireCommitted: false);
        var crashed = enter.Dialogs.Any(d => Txt.Has(d, SigaToothFlow.CrashDialogFragment));
        Log($"chốt 122/3 trên răng sữa: {enter}");
        Log($"→ app ném ngoại lệ? {crashed}");
        trace.Shot("sau-khi-chot-122-3-rang-sua");

        var afterEntry = _db.ReadKon(PatNo);
        Log($"nkon{MilkNkonCol} sau khi nhập = {KonSnapshot.S(afterEntry?.NkonCol(MilkNkonCol))}");

        // ① Cú ném là HÀNH VI ĐÃ ĐO của WinForm, không phải điều kiện tiên quyết — nên chỉ
        //    ghi lại. Nó BIẾN MẤT thì cũng tốt (ai đó đã sửa `ref strSiga` → `ref strKon`),
        //    và lúc đó dòng log này là chỗ để biết mốc đã đổi.
        if (!crashed)
            Log("⚠️ KHÔNG thấy hộp thoại 「Unhandled exception」 — khác lần đo 2026-09-04. " +
                "Hoặc frm203016.cs:1155 đã được sửa, hoặc lượt nhập chưa tới được nhánh 乳歯. " +
                $"Hộp thoại đã gặp: [{string.Join(" / ", enter.Dialogs)}]");

        if (!enter.Committed)
        {
            // Không chốt được dòng thì không có gì để F9 dựng lại — dừng ở đây, và nói rõ
            // rằng vế F9 CHƯA ĐO ĐƯỢC (khác hẳn 「đo được và app không ghi」).
            Assert.That(crashed, Is.True,
                $"Không chốt được 122/{SigaToothFlow.EmrFourRootSb} trên răng sữa mà cũng KHÔNG " +
                $"thấy hộp thoại ném — tức hỏng vì lý do khác. {enter}");
            Assert.Warn(
                $"Đường NHẬP của ＥＭＲ(４根) trên răng sữa làm app NÉM (frm203016.cs:1155 dùng " +
                "`ref strSiga` cho tên cột NKon), nên dòng 処置 không chốt được và vế F9 " +
                $"(nkon{MilkNkonCol} = {SigaKonDb.EmrRootCount} theo modSave.cs:800/804) CHƯA ĐO ĐƯỢC " +
                "từ giao diện.\n" +
                "⇒ Với bản web: TC-3 vế 乳歯 đang đòi một hành vi mà WinForm KHÔNG chạy nổi qua " +
                "giao diện. Cần khách quyết chép theo bên nào — hồ sơ chung với điểm lệch " +
                "DelExtRec 乳歯 (README mục 「2026-09-04」).");
            return;
        }

        SaveF9(trace);
        var afterSave = ReadKon("sau F9");
        Log($"nkon{MilkNkonCol} sau F9 = {KonSnapshot.S(afterSave.NkonCol(MilkNkonCol))}");

        Assert.That(afterSave.NkonCol(MilkNkonCol), Is.EqualTo(SigaKonDb.EmrRootCount),
            $"SigaChg_Save case 122/3 nhánh 乳歯 ghi 「NKon{{i-2}} = 4」 vào bảng KON " +
            $"(modSave.cs:800/804 — nhánh này dùng `ref strKon`, ĐÚNG, khác hẳn đường nhập). " +
            $"Ô 部位 {MilkSlot} ⇒ nkon{MilkNkonCol} phải là {SigaKonDb.EmrRootCount}, đang là " +
            $"{KonSnapshot.S(afterSave.NkonCol(MilkNkonCol))}.");

        var row = _flow.LastRowMatching("ＥＭＲ", "EMR");
        if (row is not null) _flow.DeleteRow(row, trace);
        SaveF9(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcGAP13 ← TC-6 vế (c) — GAP D, nửa 「ghi được vào dòng vừa tạo」
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(13)]
    [Description("TcGAP13 ← TC-6(c) — dòng SIGA app vừa tạo phải NHẬN được 欠損歯 của 抜歯")]
    public void TcGAP13_Recreated_Siga_Row_Accepts_Writes()
    {
        using var trace = TestTrace.Begin();

        // TcGAP8 dừng ở 「app có tạo dòng không」. Vế còn thiếu — và là vế spec Playwright
        // TC-6(c) khoá — là dòng vừa tạo có THẬT SỰ nhận được lệnh ghi hay không: một dòng
        // tạo SAU khi handler đã bỏ qua thì cũng vô dụng y như không có dòng nào.
        Assert.That(_db.HasSigaRow(PatNo), Is.True,
            "Tiền đề: bệnh nhân phải có dòng SIGA (TcGAP8 chạy trước đã dựng lại). Không có ⇒ " +
            "chạy TcGAP8 trước, đừng đọc testcase này.");
        _db.ResetSigaToVital(PatNo);

        EnterOnTooth(SigaToothFlow.ExtractionTrtCd, 1, PermSlot, null, trace);
        var afterEntry = ReadSiga("sau khi chốt 179/1 trên dòng SIGA vừa dựng lại");
        Assert.That(afterEntry.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            $"「update SIGA … where pat_no = {PatNo}」 phải TRÚNG dòng vừa tạo và ghi se{PermSeCol} = " +
            $"{SigaKonDb.SeMissing}. Đang là {afterEntry.SeCol(PermSeCol)} — UPDATE trúng 0 dòng, " +
            "tức 歯式 mất ÂM THẦM: không lỗi, không log, người dùng không biết gì.");

        SaveF9(trace);
        var afterSave = ReadSiga("sau F9");
        Assert.That(afterSave.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            $"Và F9 phải giữ nguyên: tập 処置 đã lưu có dòng 179 trên răng đó nên SigaChg_Save dựng " +
            $"lại đúng thế (modSave.cs:975-1030). Đang là {afterSave.SeCol(PermSeCol)}.");

        var row = _flow.LastRowMatching("抜歯");
        if (row is not null) _flow.DeleteRow(row, trace);
        SaveF9(trace);
    }
}
