using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.ParitySaveData;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.SigaToothStatus;

/// <summary>
/// 抜歯 → 歯式, và xoá dòng 抜歯 → trả về 健全歯.
/// Nửa WinForm của <c>../web-tenant-tests/tests/tooth-extraction-siga-restore.spec.ts</c>.
///
/// <para>Mọi con số dưới đây ĐO ĐƯỢC trên máy thật ngày 2026-09-03 (bệnh nhân 10,
/// 診療月 2026-08) bằng <see cref="SigaToothProbeTests"/> — không cái nào suy đoán.
/// Xem README mục 7.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG VỚI SPEC PLAYWRIGHT
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///  TcDEL1  ←  TC-1     dòng 抜歯 dựng được và mang ĐÚNG một răng
///  TcDEL2  ←  TC-2     抜歯 ghi 欠損歯 (SE = 4)          ⚠️ LỆCH: WinForm ghi NGAY LÚC NHẬP
///  TcDEL3  ←  TC-3     xoá dòng 抜歯 ⇒ 健全歯 NGAY, trước F9
///  TcDEL4  ←  TC-4     SE về đúng 生活歯 = 0
///  TcDEL5  ←  TC-5     răng NGOÀI 部位 không bị đụng
///  TcDEL6  ←  TC-6     乳歯 về 生活歯 = 5, KHÔNG phải 0
///  TcDEL7  ←  TC-3b    F9 sau khi xoá KHÔNG ghi đè 健全歯
/// </code>
///
/// ⚠️ <b>TcDEL2 là điểm LỆCH đáng ghi nhất của cặp này.</b> Spec Playwright seed thẳng
/// dòng 抜歯 vào DB rồi bấm F9, nên bên đó 欠損歯 chỉ xuất hiện SAU khi lưu
/// (<c>SigaChg_Save</c>). Ở WinForm, nhập 抜歯 qua giao diện làm <c>IregCodChk</c> gọi
/// <c>SigaChg</c> và <b>phát <c>update Siga</c> ngay tại chỗ</b> — người dùng chưa hề bấm
/// 登録 mà 歯式 đã đổi trong DB. Hai con đường, hai thời điểm; bản web phải khớp cả hai.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="bullet">
///   <item>frm203016.cs:1033-1042 — <c>IregCodChk</c> case 179, 枝番 ∉ {5} ⇒ <c>SigaChg</c>.</item>
///   <item>frm203016.cs:1243-1265 — nhánh 抜歯 của <c>SigaChg</c>: 永久歯 <c>SE{i+1} = 4</c>,
///     乳歯 <c>SN{i-2} = 9</c> / <c>SN{i-8} = 9</c>; rồi <c>update Siga</c> + bật
///     <c>pSiga_chg</c> (:1281-1283).</item>
///   <item>frm203002.cs:3944-3951 — trong <c>DeleteRow</c>: dòng bị xoá có
///     <c>trt_cd == 179</c> và <c>trt_sb ∉ {5, 6}</c> ⇒ <c>DelExtRec(con)</c>.</item>
///   <item>frm203002.cs:6120-6191 — <c>DelExtRec</c>「抜歯行削除時、健全歯に戻す」:
///     永久歯 <c>SE{i+1} = 0</c>, 乳歯 <c>SN{…} = 5</c>, một <c>update Siga</c> chạy NGAY,
///     NGOÀI transaction save và KHÔNG bật cờ nào.</item>
///   <item>CommonChk.cs:497-580 — miền giá trị: 永久歯 0/1-3/4, 乳歯 5/6-8/9.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÁC TESTCASE NỐI TIẾP NHAU — CHẠY CẢ FIXTURE
/// ═══════════════════════════════════════════════════════════════════════════════
/// TcDEL1 dựng dòng 抜歯 mà TcDEL2 đo, TcDEL3 xoá chính dòng đó, TcDEL4/5 đọc kết quả
/// của TcDEL3. Lọc một TC lẻ thì các TC sau tự <c>Ignore</c> kèm lý do
/// (<c>run.stopOnFirstFailure</c> = bản sao <c>mode:'serial'</c> bên Playwright).
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class DelExtRecTests : UiTestBase
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
    private int MilkSlot => Settings.SigaTooth.MilkBuiSlot;
    private int ControlSlot => Settings.SigaTooth.ControlBuiSlot;

    private int PermSeCol => PermSlot + 1;
    private int CtrlSeCol => ControlSlot + 1;
    private int MilkSnCol => MilkSlot < 16 ? MilkSlot - 2 : MilkSlot - 8;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.SigaTooth.AllowSave)
            return "Cần sigaTooth.allowSave = true. Nhập một dòng 抜歯 qua giao diện là " +
                   "SigaChg phát 「update Siga」 ngay tại chỗ (frm203016.cs:1281) — không có cách " +
                   "nào 「chỉ nhìn」 luồng này. Cờ cho phép fixture chụp 歯式 trước và trả lại sau.";
        return null;
    }

    /// <summary>
    /// Watcher mặc định tự bấm 「いいえ」 cho 「…を算定しますか？」. Giữ nguyên là ĐÚNG ở đây:
    /// luồng này KHÔNG đo câu hỏi đó, và để nó nằm lại thì nó chắn mọi thao tác sau.
    /// </summary>
    [OneTimeSetUp]
    public void SigaOneTimeSetUp()
    {
        var db = SigaKonDb.CreateOrNull(Settings);
        if (db is null) IgnoreWithReason("Cần DB để đọc/khôi phục SIGA — " + (DbUnavailableReason ?? "db.enabled = false"));
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

        // Mốc xuất phát sạch: mọi ô = 4 sau đó đều do CHÍNH testcase gây ra.
        _db.ResetSigaToVital(PatNo);
    }

    [SetUp]
    public void SigaSetUp() => _flow = new SigaToothFlow(App, Screen);

    [OneTimeTearDown]
    public void SigaOneTimeTearDown()
    {
        if (_db is null || !_db.CanWrite) return;
        try
        {
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

    private SigaSnapshot ReadSiga(string when)
    {
        var s = _db.ReadSiga(PatNo);
        Assert.That(s, Is.Not.Null,
            $"Bệnh nhân {PatNo} KHÔNG còn dòng SIGA nào ({when}). Mọi 「update Siga」 của WinForm là " +
            "UPDATE trần, không có dòng thì nó ghi vào hư không mà không báo lỗi.");
        Log($"SIGA {when}: se{PermSeCol}={s!.SeCol(PermSeCol)} sn{MilkSnCol}={s.SnCol(MilkSnCol)} " +
            $"se{CtrlSeCol}={s.SeCol(CtrlSeCol)} (đối chứng)");
        return s;
    }

    /// <summary>
    /// Dựng một dòng 抜歯 lên đúng MỘT răng: Insert 行追加 → 部位選択 → 病名選択 → gõ mã.
    /// Trả về mô tả để testcase in vào thông điệp assert.
    /// </summary>
    private string EnterExtraction(int slot, bool milk, int trtSb, TestTrace trace)
    {
        Assert.That(_flow.EnsureCodeMode(), Is.True,
            $"Không đưa được ô 点 về コードモード (đang là 「{_flow.InpMode()}」). Ở 点数モード thì " +
            "con số gõ vào được hiểu là SỐ ĐIỂM chứ không phải mã 処置 (frm203002.cs:7126).");

        var seat = _flow.InputRow();
        Assert.That(seat, Is.Not.Null,
            "Lưới không có dòng 処置 nào của tháng đang mở để đứng lên. Lưới hiện tại:\n  " +
            string.Join("\n  ", _flow.DescribeGrid()));

        var blank = _flow.InsertBlankRow(seat!, trace);
        Assert.That(blank, Is.Not.Null,
            "Insert không chèn được dòng trống (frm203002.cs:3570 → AddRow :3703). AddRow từ chối " +
            "khi linekbn = 99, tức con trỏ đang ở dòng của THÁNG KHÁC. Lưới hiện tại:\n  " +
            string.Join("\n  ", _flow.DescribeGrid()));

        var set = _flow.SetBuiOnRow(blank!, slot, milk, disCd: null, trace);
        Assert.That(set.ToothDialogOpened, Is.True,
            "Click ô 部位 phải mở 部位選択 (frm203002.cs:1686-1697). Không mở ⇒ dòng mang " +
            $"BuiDispFlg = 99. Hộp thoại gặp: [{string.Join(" / ", set.Dialogs)}]");
        Assert.That(set.MarkedSlots, Is.EqualTo(new[] { slot }),
            $"部位選択 phải sáng ĐÚNG ô {slot} ({ToothSelectDialog.DescribeSlot(slot)}) và chỉ ô đó — " +
            "mỗi răng thừa là một cột se/sn thừa bị ghi, và assert của testcase sau sẽ đổ oan.");
        Assert.That(set.DiseaseDialogOpened, Is.True,
            "確定 ở 部位選択 phải mở tiếp 病名選択 (frm203002.cs:1838). Không mở ⇒ End bị hiểu " +
            "thành phím khác, hoặc 部位選択 đã bị đóng bằng 戻る.");

        var enter = _flow.EnterTreatmentAtCursor(SigaToothFlow.ExtractionTrtCd, trtSb, trace: trace);
        Assert.That(enter.PickerOpened, Is.True,
            $"Gõ 「{SigaToothFlow.ExtractionTrtCd}」 vào ô 点 ở コードモード phải mở 処置選択 " +
            $"(frm203016). {enter}");
        Assert.That(enter.Committed, Is.True,
            $"Không chốt được 枝番 {trtSb} trong 処置選択. {enter}");

        var row = _flow.LastRowMatching("抜歯");
        Assert.That(row, Is.Not.Null,
            "Chốt xong phải có một dòng 抜歯 trên lưới. Lưới hiện tại:\n  " +
            string.Join("\n  ", _flow.DescribeGrid()));
        return row!.ToString();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcDEL1 ← TC-1 (mốc)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TcDEL1 (mốc) ← TC-1 — dựng được dòng 抜歯 mang ĐÚNG một răng 永久歯")]
    public void TcDEL1_Extraction_Row_Is_Built_On_Exactly_One_Tooth()
    {
        using var trace = TestTrace.Begin();
        var mark = ReadSiga("mốc xuất phát");

        Assert.That(mark.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"Mốc xuất phát phải là 生活歯: se{PermSeCol} = {SigaKonDb.SeVital}. Khác đi nghĩa là " +
            "ResetSigaToVital ở OneTimeSetUp không chạy, và mọi so sánh sau đều vô nghĩa.");

        var row = EnterExtraction(PermSlot, milk: false, trtSb: 1, trace);
        Log($"dòng 抜歯 vừa dựng: {row}");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcDEL2 ← TC-2 — ⚠️ điểm LỆCH: WinForm ghi NGAY LÚC NHẬP
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TcDEL2 ← TC-2 — SigaChg ghi 欠損歯 NGAY lúc nhập, KHÔNG đợi F9")]
    public void TcDEL2_SigaChg_Writes_Missing_Tooth_At_Input_Time()
    {
        var after = ReadSiga("sau khi chốt 179/1");

        Assert.That(after.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeMissing),
            $"Chốt một 処置 179 (枝番 ∉ {{5}}) phải làm se{PermSeCol} = {SigaKonDb.SeMissing} (欠損歯) " +
            "NGAY TẠI CHỖ: IregCodChk gọi SigaChg (frm203016.cs:1039) và SigaChg phát " +
            "「update Siga」 rồi commit trước khi trả quyền về màn hình (:1275-1283). " +
            $"Đang là {after.SeCol(PermSeCol)}.\n" +
            "⚠️ Đây là chỗ LỆCH với spec Playwright: bên đó seed dòng vào DB rồi mới F9, nên " +
            "欠損歯 chỉ xuất hiện sau khi lưu. Bản web phải khớp CẢ HAI thời điểm.");

        Assert.That(after.SeCol(CtrlSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"Răng đối chứng se{CtrlSeCol} (ô {ControlSlot} = {ToothSelectDialog.DescribeSlot(ControlSlot)}) " +
            "KHÔNG nằm trong 部位 của dòng vừa nhập nên phải đứng yên ở 生活歯. Đổi ⇒ SigaChg đang " +
            "duyệt quá phạm vi pbui.");

    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcDEL3 ← TC-3 — DelExtRec chạy NGAY lúc xoá
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TcDEL3 ← TC-3 — xoá dòng 抜歯 trả 健全歯 NGAY, trước khi bấm F9")]
    public void TcDEL3_DelExtRec_Restores_Healthy_Tooth_Immediately()
    {
        using var trace = TestTrace.Begin();

        var row = _flow.LastRowMatching("抜歯");
        if (row is null)
            IgnoreWithReason("Không còn dòng 抜歯 nào trên lưới — TcDEL1 chưa chạy hoặc đã đỏ. " +
                             "Fixture này nối tiếp nhau, chạy CẢ FIXTURE chứ đừng lọc một TC lẻ.");

        var before = ReadSiga("ngay trước khi xoá");
        var del = _flow.DeleteRow(row!, trace);
        Log($"kết quả xoá: {del}");

        Assert.That(del.RowGone, Is.True,
            $"Bấm Delete trên dòng 抜歯 phải xoá nó khỏi lưới (frm203002.cs:3574 → DeleteRow). {del}\n" +
            "Lưới hiện tại:\n  " + string.Join("\n  ", _flow.DescribeGrid()));

        // Đo được 2026-09-03: dòng 処置 thường KHÔNG hỏi câu này; chỉ 部位病名行 (linekbn = 1)
        // mới hỏi (frm203002.cs:3853-3862). Khoá lại để không ai "thêm confirm cho chắc".
        Assert.That(del.ConfirmAsked, Is.False,
            "Xoá một dòng 処置 thường KHÔNG được hỏi 「同一部位の処置を全て削除します」 — câu đó chỉ " +
            "dành cho 部位病名行 (frm203002.cs:3853). Bung ra ⇒ dòng bị xoá là 部位病名行, và khi đó " +
            "app xoá CẢ CỤM chứ không phải một dòng.");

        var after = ReadSiga("ngay sau khi xoá, CHƯA bấm F9");
        Assert.That(after.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"DelExtRec phải trả se{PermSeCol} về {SigaKonDb.SeVital} (生活歯) NGAY LÚC XOÁ: " +
            "câu 「update Siga set SE… = 0」 chạy thẳng, ngoài transaction save và không đợi F9 " +
            $"(frm203002.cs:6146-6191). Trước khi xoá là {before.SeCol(PermSeCol)}, " +
            $"sau khi xoá là {after.SeCol(PermSeCol)}.");

    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcDEL4 ← TC-4 / TcDEL5 ← TC-5 — hai vế đối chứng của cùng một phép đo
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TcDEL4 ← TC-4 — 健全歯 Ở LẠI: đọc lại lần nữa vẫn là 生活歯")]
    public void TcDEL4_Healthy_Tooth_Stays()
    {
        var s = ReadSiga("đọc lại sau TcDEL3");
        Assert.That(s.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"se{PermSeCol} phải Ở LẠI {SigaKonDb.SeVital}. Đổi giữa hai lần đọc mà test không thao " +
            "tác gì ⇒ có đường ghi khác đang chạy nền (máy thứ hai, hoặc chính app tự ghi lại lúc " +
            "vẽ lại lưới).");
    }

    [Test, Order(5)]
    [Description("TcDEL5 ← TC-5 — DelExtRec KHÔNG đụng răng nằm ngoài 部位 của dòng bị xoá")]
    public void TcDEL5_Other_Teeth_Untouched()
    {
        var s = ReadSiga("kiểm răng ngoài 部位");

        Assert.That(s.SeCol(CtrlSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"Răng đối chứng se{CtrlSeCol} chưa bao giờ nằm trong 部位 nào của lượt chạy này nên " +
            "phải giữ nguyên 生活歯.");

        // DelExtRec chỉ ghi những ô 部位 khác 0 của DÒNG BỊ XOÁ. Ô nào cũng về 0 nghĩa là
        // nó đang quét cả hàm — chính là loại lỗi mà spec Playwright TC-5 khoá.
        var milkDrift = _sigaBefore is null
            ? []
            : Enumerable.Range(1, 20).Where(c => s.SnCol(c) != SigaKonDb.SnVital)
                        .Select(c => $"sn{c} = {s.SnCol(c)}").ToList();
        Assert.That(milkDrift, Is.Empty,
            "Lượt chạy này chưa đụng răng sữa nào (dòng 抜歯 đặt trên 永久歯), nên MỌI cột sn* phải " +
            $"còn là {SigaKonDb.SnVital} (生活歯 của 乳歯). Có cột lệch ⇒ nhánh 乳歯 của SigaChg/" +
            "DelExtRec đang chạy cho một ô 永久歯 — hai nhánh phân biệt nhau CHỈ bằng giá trị ô " +
            "(1..9 vs 11..19), rất dễ port lệch.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcDEL6 ← TC-6 — 乳歯: 健全 là 5, KHÔNG phải 0
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("TcDEL6 ← TC-6 — 乳歯: 抜歯 ghi SN = 9, xoá trả về SN = 5 (KHÔNG phải 0)")]
    public void TcDEL6_MilkTooth_Returns_To_Five_Not_Zero()
    {
        using var trace = TestTrace.Begin();

        var before = ReadSiga("trước khi nhập 抜歯 trên răng sữa");
        Assert.That(before.SnCol(MilkSnCol), Is.EqualTo(SigaKonDb.SnVital),
            $"Mốc xuất phát của 乳歯 phải là {SigaKonDb.SnVital} (生活歯), không phải 0.");

        var row = EnterExtraction(MilkSlot, milk: true, trtSb: 0, trace);
        Log($"dòng 抜歯 (乳歯) vừa dựng: {row}");

        var afterEnter = ReadSiga("sau khi chốt 179/0 trên răng sữa");
        Assert.That(afterEnter.SnCol(MilkSnCol), Is.EqualTo(SigaKonDb.SnMissing),
            $"抜歯 trên một ô 部位 mang giá trị 11..19 (乳歯) phải ghi sn{MilkSnCol} = " +
            $"{SigaKonDb.SnMissing} (乳歯 欠損歯), KHÔNG phải 4 (frm203016.cs:1253-1262). " +
            $"Đang là {afterEnter.SnCol(MilkSnCol)}.\n" +
            "Ra 4 nghĩa là ô 部位 được gõ bằng PHÍM SỐ chứ không phải A..E — khi đó nó là 永久歯 " +
            "và cả nhánh 乳歯 không bao giờ chạy (BuiInfo.cs:420-427).");

        var extRow = _flow.LastRowMatching("抜歯");
        Assert.That(extRow, Is.Not.Null, "không tìm lại được dòng 抜歯 vừa dựng để xoá");
        var del = _flow.DeleteRow(extRow!, trace);
        Log($"kết quả xoá: {del}");

        var afterDelete = ReadSiga("sau khi xoá dòng 抜歯 (乳歯)");
        Assert.That(afterDelete.SnCol(MilkSnCol), Is.EqualTo(SigaKonDb.SnVital),
            $"DelExtRec phải trả sn{MilkSnCol} về {SigaKonDb.SnVital} — 「健全歯」 của 乳歯 là 5, " +
            "KHÔNG phải 0 (CommonChk.cs:497-580; cột sn* DEFAULT 5). Đang là " +
            $"{afterDelete.SnCol(MilkSnCol)}.\n" +
            "⚠️ Ra 0 là hồi quy KHÔNG NHÌN RA BẰNG MẮT: selSigaColorNo(5) và selSigaColorNo(0) " +
            "cùng cho White, nên chart 口腔内情報 trông y hệt. Chỉ soi DB mới thấy.\n" +
            "⚠️ Và nhánh 乳歯 của DelExtRec đọc ModCommon.pbui[i] chứ KHÔNG đọc arrBui[i] của dòng " +
            "bị xoá (frm203002.cs:6158) — khác hẳn nhánh 永久歯 ngay bên trên (:6146). Đỏ ở đây " +
            "trước hết phải hỏi: pbui lúc bấm Delete đang giữ 部位 của dòng nào?");

        Assert.That(afterDelete.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"Xoá dòng 抜歯 của RĂNG SỮA không được đụng tới se{PermSeCol} (永久歯 của testcase " +
            "trước, đã về 生活歯 ở TcDEL3).");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcDEL7 ← TC-3b — F9 KHÔNG ghi đè 健全歯
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(7)]
    [Description("TcDEL7 ← TC-3b — F9 登録 sau khi xoá KHÔNG ghi đè lại 欠損歯")]
    public void TcDEL7_Save_Does_Not_Overwrite_Healthy_Tooth()
    {
        using var trace = TestTrace.Begin();

        var before = ReadSiga("trước F9");
        var result = SaveFlow.PressF9(App, Screen.Window, SaveFlow.SaveAnswer.Yes,
                                      SaveFlow.OverwriteAnswer.No, trace);
        Log($"F9: 「{result.SaveQuestionText}」 · 上書き? {result.OverwriteAsked} · " +
            $"màn hình đóng? {result.ScreenClosedAfterwards}");

        var after = ReadSiga("sau F9");

        Assert.That(after.SeCol(PermSeCol), Is.EqualTo(SigaKonDb.SeVital),
            $"Dòng 抜歯 đã bị xoá khỏi lưới nên tập 処置 đem lưu KHÔNG còn 179 nào cho răng đó ⇒ " +
            $"SigaChg_Save không có gì để ghi và se{PermSeCol} phải Ở LẠI {SigaKonDb.SeVital} " +
            $"(modSave.cs:742-1107). Đang là {after.SeCol(PermSeCol)} — nghĩa là F9 dựng lại 歯式 " +
            "từ một tập 処置 vẫn còn dòng 抜歯, tức là xoá trên lưới chưa tới được payload lưu.");

        Assert.That(after.SnCol(MilkSnCol), Is.EqualTo(SigaKonDb.SnVital),
            $"Cùng lý do cho răng sữa: sn{MilkSnCol} phải ở lại {SigaKonDb.SnVital}. " +
            $"Trước F9 là {before.SnCol(MilkSnCol)}.");

        // Màn hình đóng sau khi lưu — mở lại để OneTimeTearDown và người xem còn thấy app.
        if (!TreatmentScreenAlive())
        {
            ReopenTreatmentScreen();
            _flow = new SigaToothFlow(App, Screen);
            Log("đã mở lại màn 診療入力 sau khi F9 đóng nó.");
        }
    }
}
