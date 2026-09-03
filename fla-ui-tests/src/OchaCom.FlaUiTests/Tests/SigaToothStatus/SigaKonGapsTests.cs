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
/// </code>
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
    /// 「Dòng nào vốn đã có」 của tháng test. Dọn theo ảnh chụp này thay vì theo danh sách
    /// mã: một lượt nhập 抜歯 làm app TỰ CHÈN thêm dòng 麻酔 và 部位病名行, những thứ đó ở
    /// lại sau F9 và dồn dần cho tới khi lưới dài ra và harness bắt đầu hụt.
    /// </summary>
    private HashSet<string> _monthRowsBefore = [];

    private int PermSlot => Settings.SigaTooth.PermBuiSlot;
    private int ControlSlot => Settings.SigaTooth.ControlBuiSlot;
    private int PermSeCol => PermSlot + 1;
    private int PermEkonCol => PermSlot + 1;
    private int CtrlSeCol => ControlSlot + 1;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        Settings.SigaTooth.AllowSave
            ? null
            : "Cần sigaTooth.allowSave = true — luồng này nhập 処置 qua giao diện, và mỗi lượt " +
              "chốt là một 「update Siga/Kon」 thật (frm203016.cs:1275-1295). TcGAP8 còn XOÁ hẳn " +
              "dòng SIGA của bệnh nhân rồi dựng lại.";

    [OneTimeSetUp]
    public void GapsOneTimeSetUp()
    {
        var db = SigaKonDb.CreateOrNull(Settings);
        if (db is null) IgnoreWithReason("Cần DB để đọc/khôi phục SIGA + KON — " + (DbUnavailableReason ?? "db.enabled = false"));
        var error = db!.ProbeError();
        if (error is not null) IgnoreWithReason($"không kết nối được SQL Server: {error}");
        _db = db;

        _sigaBefore = _db.ReadSiga(PatNo);
        _konBefore = _db.ReadKon(PatNo);
        _preexistingTestRows = _db.CountTrnRowsWithTrtCd(PatNo, TrtDate, SigaKonDb.TestTrtCds);
        _monthRowsBefore = _db.SnapshotMonthRowKeys(PatNo, TrtDate);

        Log("╔══ NGUYÊN TRẠNG TRƯỚC LƯỢT CHẠY (chép lại nếu cần dựng tay) ══");
        Log($"║ SIGA: {_sigaBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ KON : {_konBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ tháng {TrtDate:yyyy-MM}: {_preexistingTestRows} dòng có sẵn mang trt_cd ∈ " +
            $"[{string.Join(",", SigaKonDb.TestTrtCds)}]");
        Log("╚══════════════════════════════════════════════════════════════");

        _db.ResetSigaToVital(PatNo);
        _db.ResetKonToNull(PatNo, [PermEkonCol, CtrlSeCol], []);
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
                                                   TestTrace trace)
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

        var set = _flow.SetBuiOnRow(blank!, slot, milk: false, disCd: null, trace);
        Assert.That(set.ToothDialogOpened, Is.True, $"không mở được 部位選択. {set}");
        Assert.That(set.MarkedSlots, Is.EqualTo(new[] { slot }),
            $"部位選択 phải sáng ĐÚNG ô {slot} ({ToothSelectDialog.DescribeSlot(slot)}). {set}");

        var enter = _flow.EnterTreatmentAtCursor(trtCd, trtSb, answerYes, trace);
        Assert.That(enter.PickerOpened, Is.True,
            $"Gõ 「{trtCd}」 ở コードモード phải mở 処置選択. {enter}");
        Assert.That(enter.Committed, Is.True, $"không chốt được 枝番 {trtSb}. {enter}");
        return enter;
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
        Log($"F10 戻る: gate 「{back.GateText}」, nút mặc định 「{back.DefaultButton}」, đóng? {back.ScreenClosed}");
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

        // Vế thứ hai: 「いいえ」 = KHÔNG lưu ⇒ dòng 抜歯 vẫn còn nguyên trong TRNTRN.
        // Trạng thái tự mâu thuẫn: răng đã lành, dòng 抜歯 vẫn đó.
        var stillThere = _flow.LastRowMatching("抜歯");
        Assert.That(stillThere, Is.Not.Null,
            "「いいえ」 = KHÔNG lưu ⇒ dòng 抜歯 chưa bao giờ bị xoá khỏi TRNTRN, nên mở lại tháng phải " +
            "thấy nó y như cũ (RestoreData chỉ lùi 歯式/根数, không đụng TRNTRN). Không thấy dòng ⇒ " +
            "màn hình đang hiển thị trạng thái ĐÃ VỨT BỎ như thể nó là dữ liệu thật.\n" +
            "Lưới hiện tại:\n  " + string.Join("\n  ", _flow.DescribeGrid()));
        Log($"dòng 抜歯 vẫn còn sau discard: {stillThere}");
    }

    [Test, Order(7)]
    [Description("TcGAP7 ← TC-5b — 「いいえ」 PHẢI lùi cái SigaChg vừa ghi (Restore_SK thật sự chạy)")]
    public void TcGAP7_Discard_Undoes_SigaChg()
    {
        using var trace = TestTrace.Begin();

        // Mốc phải được chụp LÚC MỞ MÀN: pSiga_old nạp ở modKonSiga.pGet_SIGA khi frm203002
        // mở ra. Vì thế đặt giá trị TRƯỚC rồi mở lại màn hình, không phải ngược lại.
        _db.ResetSigaToVital(PatNo);
        ReopenTreatmentScreen();
        _flow = new SigaToothFlow(App, Screen);

        var atOpen = ReadSiga("lúc mở màn (= pSiga_old)");
        Assert.That(atOpen.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            "harness: mốc lúc mở màn phải là 生活歯, nếu không cả testcase vô nghĩa.");

        EnterOnTooth(SigaToothFlow.ExtractionTrtCd, 1, PermSlot, null, trace);

        var afterEntry = ReadSiga("sau khi chốt 179/1 (CHƯA F9)");
        Assert.That(afterEntry.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            "SigaChg ghi 歯式 NGAY lúc chốt 処置, trước 登録. Vẫn là 生活歯 nghĩa là đường ghi lúc nhập " +
            "không chạy ⇒ cờ pSiga_chg cũng chưa bao giờ bật và TC này không kiểm được gì.");

        var back = _flow.PressBack("いいえ", trace);
        Log($"F10 戻る: gate 「{back.GateText}」, nút mặc định 「{back.DefaultButton}」");
        Assert.That(back.GateAsked, Is.True, "F10 戻る sau khi nhập 処置 phải bung dirty gate.");

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

        var deleted = _db.DeleteSigaRow(PatNo);
        Log($"đã xoá {deleted} dòng SIGA của bệnh nhân {PatNo} — mở lại màn 診療入力 để xem app làm gì.");
        Assert.That(_db.HasSigaRow(PatNo), Is.False, "harness: dòng SIGA chưa bị xoá thật");

        try
        {
            // WinForm tạo dòng NGAY LÚC MỞ MÀN, không đợi F9: modKonSiga.pGet_SIGA
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
}
