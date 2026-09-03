using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.SigaToothStatus;

/// <summary>
/// Ｐ変更 → đánh dấu 欠損歯 tự động (<c>Chk_PModeKesson</c>).
/// Nửa WinForm của <c>../web-tenant-tests/tests/p-mode-kesson-siga.spec.ts</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⛔ ĐỌC TRƯỚC: FIXTURE NÀY KHOÁ MỘT HÀNH VI PHÁ DỮ LIỆU
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>Chk_PModeKesson</c> KHÔNG đánh dấu 「những răng bị bỏ khỏi Ｐ」. Nó đánh dấu
/// <b>PHẦN BÙ</b> của tập Ｐ mới: MỌI ô 部位 mang giá trị 0 (trừ 4 răng khôn) đều bị ghi
/// <c>SE = 4</c> (欠損歯) — kể cả răng lành chưa bao giờ dính tới Ｐ.
///
/// <code>
///   Bệnh nhân 歯周炎 ở 1 răng → Ｐ変更 → はい ⇒ 27 răng còn lại thành "răng mất".
///   Không hỏi lại, không log: catch { trn.Rollback(); }   (frm203002.cs:7489)
/// </code>
///
/// <b>TcPM3 XANH nghĩa là WinForm đang cư xử đúng như mô tả trên</b> — đây là ĐÁP ÁN mà
/// bản web phải khớp, không phải lời khen dành cho hành vi này. Hồ sơ báo khách:
/// <c>userapp/inp-p0-open-issues.md</c> ISSUE-14 (có 3 phương án A/B/C). Nếu một ngày
/// khách chốt phương án B (chỉ đánh dấu răng bị bỏ khỏi Ｐ) thì TcPM3 PHẢI được viết lại
/// — đừng "sửa" nó trước khi có quyết định.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///  TcPM1  ←  TC-1    dựng được 部位病名行 mang 病名 Ｐ(103) trên đúng một răng
///  TcPM2  ←  TC-2    Ｐ変更 mở 部位選択 seed đúng tập Ｐ cũ; F11 → F3 → End → End
///  TcPM3  ←  TC-3    Q00100 → はい ⇒ 欠損 ghi cho PHẦN BÙ của tập Ｐ mới
///  TcPM4  ←  TC-4    4 răng khôn KHÔNG bao giờ bị đánh dấu
///  TcPM5  ←  TC-5    乳歯 (sn_*) KHÔNG bị đụng
///  TcPM6  ←  TC-6    「いいえ」 lúc thoát KHÔNG hoàn tác dấu 欠損 vừa ghi
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="bullet">
///   <item>frm203002.cs:6362-6384 <c>cmdByokenP_Click</c> — <c>MonthP()</c> gom 部位 của MỌI
///     部位病名行 trong tháng có <c>dis_cd1 = 103</c> (Ｐ), không có thì <c>104</c> (Ｇ), thành
///     MỘT tập; rồi chạy đúng luồng sửa 部位/病名 ở chế độ P-mode.
///     <b>Không gom được gì thì nó IM LẶNG</b> — cả khối nằm trong một <c>if</c>, không có
///     <c>else</c>. Bản web bung alert 「当月にＰ／Ｇの病名がありません。」; đó là một điểm LỆCH.</item>
///   <item>frm203002.cs:7237-7250 <c>ChkBuiDisChg</c> — hỏi Q00100 「変更を適用しますか？」.
///     はい ⇒ <c>ChgBuiDis()</c> → <c>ChgBuiForP(con)</c> → <b><c>Chk_PModeKesson(con)</c></b>,
///     ĐÚNG thứ tự đó. いいえ ⇒ <c>BY_Undo()</c>.</item>
///   <item>frm203002.cs:7446-7495 <c>Chk_PModeKesson</c> — ba chi tiết trông như sơ suất
///     nhưng CÓ THẬT, phải giữ:
///     <list type="number">
///       <item>4 răng khôn (ô 0/15/16/31) bị bỏ qua ở CẢ HAI vòng (:7460 và :7472);</item>
///       <item>乳歯 KHÔNG bao giờ bị đụng — <c>setSigaData</c>/<c>getSigaData</c> chỉ map
///         <c>1..32 → se1..se32</c>, không có nhánh <c>sn</c> nào (:7495-7570);</item>
///       <item>so sánh với CHUỖI <c>"0"</c> nên KHÔNG bóc mốc 100 và KHÔNG tách 永久歯/乳歯:
///         ô mang <c>111</c> hay mã răng sữa <c>12</c> chỉ là "khác 0" và được để yên.</item>
///     </list></item>
///   <item>So sánh nội bộ WinForm: hàm 欠損 KIA — <c>ModMain.ChkKesson</c> (modMain.cs:2842) —
///     CÓ hộp thoại xác nhận (frm203034 欠損指定) và CÓ cổng option <c>pInpOpt[27]</c>.
///     <c>Chk_PModeKesson</c> không có gì cả. Đó là lý do tin rằng đây là bug chứ không
///     phải thiết kế.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KỲ VỌNG SUY TỪ CHÍNH TẬP Ｐ ĐỌC ĐƯỢC, KHÔNG HARD-CODE THEO PHÍM
/// ═══════════════════════════════════════════════════════════════════════════════
/// TcPM3 đọc <b>các ô đang sáng trong 部位選択 ngay trước khi bấm End</b> và lấy đó làm
/// tập Ｐ mới. Các phím F2..F6 của 部位選択 phụ thuộc <c>buiInfo1.getPos()</c> (vùng đang
/// chọn) nên hard-code 「F3 chọn ra ô nào」 là giòn; đọc sơ đồ răng thì đúng dù dialog
/// chọn ra tập nào. Đây là bản WinForm của mẹo 「suy kỳ vọng từ body request」 mà spec
/// Playwright dùng.
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class PModeKessonTests : UiTestBase
{
    private SigaKonDb _db = null!;
    private SigaToothFlow _flow = null!;

    private SigaSnapshot? _sigaBefore;
    private int _preexistingTestRows;

    /// <summary>
    /// 「Dòng nào vốn đã có」 của tháng test. Dọn theo ảnh chụp này thay vì theo danh sách
    /// mã: một lượt nhập 抜歯 làm app TỰ CHÈN thêm dòng 麻酔 và 部位病名行, những thứ đó ở
    /// lại sau F9 và dồn dần cho tới khi lưới dài ra và harness bắt đầu hụt.
    /// </summary>
    private HashSet<string> _monthRowsBefore = [];

    /// <summary>Tập Ｐ MỚI — các ô đang sáng trong 部位選択 ngay trước khi bấm End (TcPM2).</summary>
    private IReadOnlyList<int> _newPSet = [];

    /// <summary>SIGA đọc được ngay trước khi trả lời Q00100 (TcPM3 so với nó).</summary>
    private SigaSnapshot? _beforeApply;

    private int PermSlot => Settings.SigaTooth.PermBuiSlot;
    private int PermSeCol => PermSlot + 1;

    /// <summary>歯周炎 Ｐ — mã mà <c>MonthP</c> ưu tiên gom (frm203002.cs:7358).</summary>
    private const int DisCdP = 103;

    /// <summary>Bốn ô 智歯 WinForm luôn bỏ qua (frm203002.cs:7460 / :7472) — 0-based.</summary>
    private static readonly int[] WisdomSlots = [0, 15, 16, 31];

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        Settings.SigaTooth.AllowSave
            ? null
            : "Cần sigaTooth.allowSave = true — Chk_PModeKesson tự nó là một lệnh GHI DB thật vào " +
              "bảng SIGA (frm203002.cs:7480-7491), chạy trong transaction riêng và commit ngay.";

    /// <summary>
    /// Đặt mốc 歯式 TRƯỚC khi app mở — xem chú thích cùng tên ở <see cref="SigaKonGapsTests"/>.
    /// <c>pSiga_old</c> chốt lúc 患者確定, mọi lệnh ghi sau đó app không thấy.
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        var db = SigaKonDb.CreateOrNull(Settings);
        if (db is null || !db.CanWrite || db.ProbeError() is not null) return;
        db.EnsureSigaRow(PatNo);
        db.ResetSigaToVital(PatNo);
        Log($"đặt mốc TRƯỚC khi mở app: mọi se* = {SigaKonDb.SeVital}, sn* = {SigaKonDb.SnVital}.");
    }

    [OneTimeSetUp]
    public void PModeOneTimeSetUp()
    {
        var db = SigaKonDb.CreateOrNull(Settings);
        if (db is null) IgnoreWithReason("Cần DB để đọc/khôi phục SIGA — " + (DbUnavailableReason ?? "db.enabled = false"));
        var error = db!.ProbeError();
        if (error is not null) IgnoreWithReason($"không kết nối được SQL Server: {error}");
        _db = db;

        _sigaBefore = _db.ReadSiga(PatNo);
        _preexistingTestRows = _db.CountTrnRowsWithTrtCd(PatNo, TrtDate, SigaKonDb.TestTrtCds);
        _monthRowsBefore = _db.SnapshotMonthRowKeys(PatNo, TrtDate);

        Log("╔══ NGUYÊN TRẠNG TRƯỚC LƯỢT CHẠY (chép lại nếu cần dựng tay) ══");
        Log($"║ SIGA: {_sigaBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log("╚══════════════════════════════════════════════════════════════");

        // Mốc: TOÀN BỘ 永久歯 là 生活歯 ⇒ mọi ô = 4 sau này đều do chính testcase gây ra.
        _db.ResetSigaToVital(PatNo);
    }

    [SetUp]
    public void PModeSetUp() => _flow = new SigaToothFlow(App, Screen);

    [OneTimeTearDown]
    public void PModeOneTimeTearDown()
    {
        if (_db is null || !_db.CanWrite) return;
        try
        {
            if (_sigaBefore is not null) { _db.RestoreSiga(PatNo, _sigaBefore); Log("dọn: SIGA trả về nguyên trạng."); }
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
        Assert.That(s, Is.Not.Null, $"Bệnh nhân {PatNo} KHÔNG còn dòng SIGA nào ({when}).");
        var missing = Enumerable.Range(1, 32).Where(c => s!.SeCol(c) == SigaKonDb.SeMissing).ToList();
        Log($"SIGA {when}: {missing.Count} ô 欠損 (se: {string.Join(",", missing)})");
        return s!;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcPM1 ← TC-1 (mốc) — dựng 部位病名行 mang 病名 Ｐ
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TcPM1 (mốc) ← TC-1 — dựng 部位病名行 病名 Ｐ(103) trên ĐÚNG một răng")]
    public void TcPM1_Build_P_Disease_Row()
    {
        using var trace = TestTrace.Begin();

        var mark = ReadSiga("mốc xuất phát");
        Assert.That(Enumerable.Range(1, 32).All(c => mark.SeCol(c) == SigaKonDb.SeVital), Is.True,
            "Mốc xuất phát phải là TOÀN BỘ 永久歯 = 生活歯. Khác đi thì không phân biệt được ô nào " +
            "do Chk_PModeKesson đánh dấu với ô vốn đã 欠損 từ trước.");

        var seat = _flow.InputRow();
        Assert.That(seat, Is.Not.Null,
            "Lưới không có dòng 処置 nào của tháng đang mở. Lưới:\n  " +
            string.Join("\n  ", _flow.DescribeGrid()));

        var blank = _flow.InsertBlankRow(seat!, trace);
        Assert.That(blank, Is.Not.Null, "Insert không chèn được dòng trống (AddRow từ chối linekbn = 99).");

        var set = _flow.SetBuiOnRow(blank!, PermSlot, milk: false, DisCdP, trace);
        Log($"đặt 部位 + 病名 Ｐ: {set}");

        Assert.That(set.ToothDialogOpened, Is.True, $"không mở được 部位選択. {set}");
        Assert.That(set.MarkedSlots, Is.EqualTo(new[] { PermSlot }),
            $"部位選択 phải sáng ĐÚNG ô {PermSlot} ({ToothSelectDialog.DescribeSlot(PermSlot)}) và chỉ ô đó. " +
            "Nhiều răng hơn thì vế 「răng CHƯA BAO GIỜ nằm trong Ｐ」 của TcPM3 mất nghĩa.");
        Assert.That(set.DiseaseDialogOpened, Is.True, $"確定 ở 部位選択 phải mở tiếp 病名選択. {set}");

        Log("lưới sau khi dựng:\n  " + string.Join("\n  ", _flow.DescribeGrid()));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcPM2 ← TC-2 — Ｐ変更 mở 部位選択, sửa tập Ｐ rồi 確定
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TcPM2 ← TC-2 — Ｐ変更 mở 部位選択 seed đúng tập Ｐ cũ, F11 → F3 → End → End")]
    public void TcPM2_PChange_Opens_ToothDialog_And_Confirms()
    {
        using var trace = TestTrace.Begin();

        Assert.That(_flow.OpenByoukenTab(trace), Is.True,
            $"Không mở được tab 「{SigaToothFlow.ByoukenTabText}」 hoặc không thấy nút Ｐ変更 " +
            $"(AutomationId {SigaToothFlow.PChangeButtonId}, frm203002.Designer.cs:1327).");
        Log("lưới 病検:\n  " + string.Join("\n  ", _flow.ByoukenRows()));

        var result = _flow.PressPChange(trace);
        Assert.That(result.ButtonFound, Is.True, "không thấy nút Ｐ変更 sau khi mở tab 病検");

        Assert.That(result.ToothDialogOpened, Is.True,
            "Ｐ変更 phải mở 部位選択. KHÔNG mở nghĩa là MonthP không gom được dòng 部位病名行 nào " +
            $"mang dis_cd1 = {DisCdP} (Ｐ) hay 104 (Ｇ) trong tháng — cả khối cmdByokenP_Click nằm " +
            "trong một `if`, không có `else`, nên nó IM LẶNG chứ không báo gì " +
            "(frm203002.cs:6362-6384).\n" +
            "⚠️ Đây là một điểm LỆCH đã biết: bản web bung alert 「当月にＰ／Ｇの病名がありません。」 " +
            "trong khi WinForm không có câu đó.\n" +
            $"Hộp thoại gặp: [{string.Join(" / ", result.Dialogs)}]\n" +
            "lưới 病検:\n  " + string.Join("\n  ", _flow.ByoukenRows()));

        var tooth = result.ToothDialog!;

        // Tập Ｐ CŨ mà 部位選択 được seed = `agg.union` của MonthP. Đếm để chắc chắn nó đúng
        // bằng dòng vừa dựng — tháng có sẵn 部位病名行 Ｐ/Ｇ thật thì tập này rộng hơn và vế
        // 「răng chưa bao giờ trong Ｐ」 của TcPM3 mất nghĩa.
        var oldSet = ToothSelectDialog.MarkedSlots(tooth);
        Log($"部位選択 mở ra với {oldSet.Count} răng đang sáng (= tập Ｐ cũ): [{string.Join(",", oldSet)}]");
        Assert.That(oldSet, Is.EqualTo(new[] { PermSlot }),
            $"Tập Ｐ mà MonthP gom được phải đúng 1 răng — ô {PermSlot} của dòng vừa dựng ở TcPM1. " +
            "Nhiều hơn ⇒ tháng test có 部位病名行 Ｐ/Ｇ THẬT; chọn patient.trtDate vào tháng trống rồi " +
            "chạy lại, nếu không vế 「răng chưa bao giờ nằm trong Ｐ」 của TcPM3 không chứng minh " +
            "được gì.");

        // Phải ĐỔI tập Ｐ thì Q00100 mới bung (ChkBuiDisChg so với BuffData). F11 全消去 rồi
        // F3 ３～３ để tập MỚI vẫn CÒN răng — nhờ vậy TcPM3 phân biệt được "phần bù" với
        // "cả hàm".
        ToothSelectDialog.ClearAll(tooth, trace);
        ToothSelectDialog.SelectIncisors(tooth, trace);

        _newPSet = ToothSelectDialog.MarkedSlots(tooth);
        Log($"tập Ｐ MỚI (đọc từ sơ đồ răng, KHÔNG hard-code theo phím): [{string.Join(",", _newPSet)}]");
        Assert.That(_newPSet, Is.Not.Empty,
            "Sau F11 全消去 + F3 ３～３ phải còn ÍT NHẤT một răng. Rỗng ⇒ F3 không ăn, và khi đó " +
            "tập Ｐ mới là TOÀN BỘ hàm — không phân biệt được 「phần bù」 với 「cả hàm」 nữa.");
        Assert.That(_newPSet, Is.Not.EqualTo(oldSet),
            "Tập Ｐ mới phải KHÁC tập cũ, nếu không Q00100 sẽ không bung (ChkBuiDisChg chỉ hỏi khi " +
            "部位 hoặc 病名 thực sự đổi so với BuffData, frm203002.cs:7239).");

        _beforeApply = ReadSiga("ngay trước khi 確定");

        ToothSelectDialog.Confirm(tooth, trace);

        var disease = Waits.TryFor(_flow.DiseaseDialog, TimeSpan.FromSeconds(15));
        Assert.That(disease, Is.Not.Null,
            "確定 ở 部位選択 phải mở tiếp 病名選択 (ByokenChg, frm203002.cs:6297). Không mở ⇒ End bị " +
            "hiểu thành phím khác, hoặc 部位選択 đã đóng bằng 戻る.");
        _flow.ConfirmDiseaseDialog(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcPM3 ← TC-3 — luật "phần bù" (ISSUE-14)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TcPM3 ← TC-3 — Q00100 → はい: 欠損 ghi cho PHẦN BÙ của tập Ｐ mới")]
    public void TcPM3_Yes_Marks_Complement_As_Missing()
    {
        using var trace = TestTrace.Begin();

        if (_newPSet.Count == 0)
            IgnoreWithReason("TcPM2 chưa chốt được tập Ｐ mới nên testcase này không có kỳ vọng để so. " +
                             "Chạy CẢ fixture thay vì lọc một TC lẻ.");

        var gate = _flow.WaitForDialog(SigaToothFlow.ApplyChangeFragment, TimeSpan.FromSeconds(25));
        Assert.That(gate, Is.Not.Null,
            "Sửa 部位 xong phải bung Q00100 「変更を適用しますか？」 (ChkBuiDisChg, frm203002.cs:7241). " +
            "Không bung ⇒ 部位 chưa thực sự đổi so với ảnh chụp BuffData — F11/F3 ở TcPM2 không ăn.\n" +
            $"Hộp thoại đang mở: {_flow.DescribeDialogs()}");

        Log($"Q00100: 「{Txt.N(Dialogs.TextOf(gate!))}」 — nút mặc định 「{_flow.FocusedButtonName()}」");
        trace.Shot("q00100");
        Assert.That(_flow.Answer(gate!, "はい", "Yes"), Is.True,
            "không bấm được 「はい」 trên Q00100 — nút của hộp thoại: " + _flow.DescribeDialogs());

        // Chk_PModeKesson chạy trong transaction riêng và commit ngay; cho nó một nhịp.
        Waits.TryUntil(() =>
        {
            var s = _db.ReadSiga(PatNo);
            return s is not null && Enumerable.Range(1, 32).Any(c => s.SeCol(c) == SigaKonDb.SeMissing);
        }, TimeSpan.FromSeconds(20));

        var after = ReadSiga("sau Q00100 → はい (Chk_PModeKesson)");

        // ── Luật suy TRỰC TIẾP từ :7472-7476, dùng chính tập Ｐ mới đọc được ở TcPM2 ──
        var wrong = new List<string>();
        for (var slot = 0; slot < 32; slot++)
        {
            if (WisdomSlots.Contains(slot)) continue;
            var expected = _newPSet.Contains(slot) ? SigaKonDb.SeVital : SigaKonDb.SeMissing;
            var actual = after.SeCol(slot + 1);
            if (actual != expected) wrong.Add($"se{slot + 1} (ô {slot}): {actual} (phải {expected})");
        }

        Assert.That(wrong, Is.Empty,
            $"Luật (frm203002.cs:7472-7476): với MỌI ô ngoài 4 răng khôn, ô 部位 của tập Ｐ MỚI bằng 0 " +
            $"⇒ se = {SigaKonDb.SeMissing} (欠損歯); khác 0 ⇒ để nguyên. KHÔNG phải 「răng bị bỏ khỏi Ｐ」 " +
            "mà là PHẦN BÙ.\n" +
            $"Tập Ｐ mới đọc được từ 部位選択: [{string.Join(",", _newPSet)}]\n" +
            "Xem ISSUE-14.");

        // ── Vế headline: có răng CHƯA BAO GIỜ nằm trong Ｐ mà vẫn bị đánh 欠損 ──
        var neverInP = Enumerable.Range(0, 32)
            .Where(slot => !WisdomSlots.Contains(slot)
                           && slot != PermSlot
                           && !_newPSet.Contains(slot)
                           && after.SeCol(slot + 1) == SigaKonDb.SeMissing)
            .ToList();
        Log($"số răng CHƯA BAO GIỜ trong Ｐ mà bị đánh 欠損: {neverInP.Count} (ô: {string.Join(",", neverInP)})");

        Assert.That(neverInP, Is.Not.Empty,
            $"Dòng Ｐ ở TcPM1 chỉ có ĐÚNG một răng (ô {PermSlot}), nên mọi ô khác chưa bao giờ nằm " +
            "trong Ｐ. WinForm vẫn đánh 欠損 cho chúng — đó chính là ISSUE-14. Rỗng nghĩa là WinForm " +
            "trên máy này đang chạy luật 「hiệu」 (phương án B), khác hẳn source đã đọc: khi đó phải " +
            "đo lại chứ đừng nới assert.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcPM4 / TcPM5 ← TC-4 / TC-5 — hai vế đối chứng
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TcPM4 (đối chứng) ← TC-4 — 4 răng khôn KHÔNG bao giờ bị đánh dấu")]
    public void TcPM4_Wisdom_Teeth_Never_Marked()
    {
        var s = ReadSiga("kiểm 4 răng khôn");
        var touched = WisdomSlots
            .Where(slot => s.SeCol(slot + 1) != SigaKonDb.SeVital)
            .Select(slot => $"se{slot + 1} (ô {slot}) = {s.SeCol(slot + 1)}")
            .ToList();

        Assert.That(touched, Is.Empty,
            "Bốn ô 智歯 (0/15/16/31 → se1/se16/se17/se32) bị loại ở CẢ HAI vòng của Chk_PModeKesson " +
            "(frm203002.cs:7460 vòng dò và :7472 vòng ghi). Có ô nào đổi ⇒ hằng số 4-răng-khôn không " +
            "được áp dụng ở một trong hai vòng — và đó đúng là loại lỗi chỉ lộ ra khi tập Ｐ mới " +
            "không chứa răng khôn, tức là gần như mọi lần.");
    }

    [Test, Order(5)]
    [Description("TcPM5 (đối chứng) ← TC-5 — 乳歯 (sn_*) KHÔNG bị đụng")]
    public void TcPM5_MilkTeeth_Untouched()
    {
        Assert.That(_sigaBefore, Is.Not.Null, "không chụp được nguyên trạng SIGA ở OneTimeSetUp");
        var s = ReadSiga("kiểm 乳歯");

        var drift = Enumerable.Range(1, 20)
            .Where(c => s.SnCol(c) != SigaKonDb.SnVital)
            .Select(c => $"sn{c} = {s.SnCol(c)}")
            .ToList();

        Assert.That(drift, Is.Empty,
            $"Chk_PModeKesson KHÔNG có nhánh 乳歯: setSigaData/getSigaData của frm203002 chỉ map " +
            "1..32 → se1..se32 (:7495-7570), nên 乳歯 nằm ngoài phạm vi THEO CẤU TRÚC. " +
            $"OneTimeSetUp đã đặt mọi sn* = {SigaKonDb.SnVital}; có cột lệch ⇒ bản đang chạy đã tự ý " +
            "mở rộng sang răng sữa, và răng sữa sẽ biến mất khỏi 部位選択 mà WinForm không hề làm thế.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcPM6 ← TC-6 — 「いいえ」 KHÔNG hoàn tác
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("TcPM6 ← TC-6 — 「いいえ」 lúc thoát KHÔNG hoàn tác dấu 欠損 vừa ghi")]
    public void TcPM6_Discard_Does_Not_Undo_PModeMarks()
    {
        using var trace = TestTrace.Begin();

        var before = ReadSiga("trước khi F10 戻る");
        Assert.That(Enumerable.Range(1, 32).Any(c => before.SeCol(c) == SigaKonDb.SeMissing), Is.True,
            "Chưa có ô 欠損 nào để mà kiểm việc hoàn tác — TcPM3 chưa chạy hoặc đã đỏ.");

        _flow.DismissAll();
        var back = _flow.PressBack("いいえ", trace);
        Log("F10 戻る: " + back);

        var after = ReadSiga("sau 「いいえ」");
        Assert.That(after.DiffFrom(before), Is.Empty,
            "Chk_PModeKesson commit ngay trong transaction RIÊNG và KHÔNG bật pSiga_chg " +
            "(frm203002.cs:7480-7491), nên Restore_SK bỏ qua nó (modSave.cs:4684) và 「いいえ」 không có " +
            "gì để lùi — dấu 欠損 phải ở lại y nguyên.\n" +
            "Có cột quay về 生活歯 nghĩa là đường Ｐ変更 đang arm cờ nhầm; khi đó một thao tác Ｐ変更 " +
            "rồi huỷ sẽ khôi phục cả những 欠損 mà người dùng thật sự muốn giữ.\n" +
            "⛔ Cùng bản chất với DelExtRec — xem ISSUE-15. Đây là hành vi CỦA WINFORM, không phải " +
            "chỗ để 「sửa cho hợp lý」.");

        if (!TreatmentScreenAlive())
        {
            ReopenTreatmentScreen();
            _flow = new SigaToothFlow(App, Screen);
            Log("đã mở lại màn 診療入力.");
        }
    }
}
