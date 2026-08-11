using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

/// <summary>
/// 会計データ修正 (<c>modAcc.ChgAccData</c>) — xác minh lô 8 trên WinForm thật.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MỤC ĐÍCH
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web (<c>ApplyAccountingCorrectionHandler</c>) port hàm này, <b>kèm cả bug
/// ISSUE-1</b> theo quyết định 2026-08-10 phương án A. Tới giờ kết luận chỉ dựa trên
/// đọc source. Luồng này chạy WinForm thật để trả lời hai câu:
/// <list type="number">
///   <item>Phép ghi <c>ACCDAT</c> có đúng như tôi mô tả không (4 điểm ở §5b của
///     <c>userapp/winform-parity-verification-guide.md</c>)?</item>
///   <item>Nhánh giữa của <c>PERSON_EXP</c> có thật sự GÁN (mất số dư) không?</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ LUỒNG NÀY GHI VÀO SỔ TIỀN
/// ═══════════════════════════════════════════════════════════════════════════
/// Nó sửa <c>ACCDAT</c> (会計 đã chốt) và <c>PERSON_EXP</c> (預り金/未収金). Nặng hơn
/// luồng ParitySaveData — cái kia chỉ ghi lại 処置行.
///
/// <para>Teardown khôi phục theo ảnh chụp đầu lô. Nhưng khôi phục là <b>đường lui,
/// không phải giấy phép</b>: hãy trỏ <c>patient.patNo</c> vào bệnh nhân TEST.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// TEST TỰ DỰNG TIỀN ĐỀ
/// ═══════════════════════════════════════════════════════════════════════════
/// Nhánh G chỉ tới được khi thoả CẢ HAI điều kiện của modAcc.cs:598 — xem
/// <see cref="AccountingPreconditions"/>. Test <b>tự dựng</b> thay vì bắt người chạy
/// đi 窓口精算 bằng tay: đây là auto test.
///
/// <para>Không phải đường tắt: đã tra DB, <b>toàn bộ SIM2000 không có dòng ACCDAT
/// nào trong tháng test</b> (mới nhất 2026-07-31). Bệnh nhân đã 窓口精算 đều ở tháng
/// 1/2026, mà 診療入力 chỉ sửa được 処置月 hiện hành. Nên seed là cách duy nhất.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BA THỨ F8 ĐỂ LẠI
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><c>ACCDAT</c> + <c>PERSON_EXP</c> — khôi phục theo ảnh chụp đầu lô.</item>
///   <item><c>UNPAID</c> — nhánh F ghi vào đây; teardown xoá phần vượt ảnh chụp.</item>
///   <item><c>TRNTRN</c> — F8 LƯU lưới trước khi tính 会計 (frm203002.cs:7716), nên
///     処置 thêm vào để tạo chênh lệch nằm lại thật. Chỉ <b>báo lệch</b>, không xoá:
///     xem <see cref="ReportTreatmentDrift"/>.</item>
/// </list>
///
/// <para>Và F8 còn <b>đóng</b> 診療入力 rồi mở 窓口精算 (frm203002.cs:7741-7742) —
/// nên mỗi testcase gọi <see cref="EnsureTreatmentScreen"/> ở đầu.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG ĐỤNG VÀO LƯỚI 処置
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản đầu có <c>AddTreatmentToCreateDelta</c>: mở tab 個別, chèn một 処置, rồi mới bấm
/// F8 — vì tôi cho rằng không có chênh lệch thì chuỗi kết thúc sớm. <b>Sai.</b>
///
/// <para>Chênh lệch đã có sẵn từ tiền đề: bệnh nhân test là <b>公費単独</b> nên
/// <c>cur.insPrice = 0</c>, trong khi 会計 seed là ¥1.020 ⇒ <c>diffPrice = −1.020</c>.
/// Lượt chẩn đoán 11:44 <b>không đụng gì vào lưới</b> mà vẫn tới thẳng
/// 「…預り金に計上しますか?」.</para>
///
/// <para>Còn thêm 処置 thì phải trả giá: lưới thành "đã sửa" ⇒ F8 hỏi
/// 「処置データは変更されています。保存しますか？」 (modSave.cs:179). Trả はい là ghi thẳng
/// vào TRNTRN; trả いいえ là <c>RestoreData</c> vứt bỏ đúng cái 処置 vừa thêm — tức công
/// đoạn đó vô nghĩa ở cả hai nhánh. Lượt 11:54 đi đúng vào cảnh thứ hai, và còn làm
/// 点数 tính ra lệch hẳn (「280点削除」) so với lượt không đụng lưới.</para>
///
/// <para>Cần chênh lệch theo 点数 chứ không chỉ theo tiền thì đổi
/// <c>AccountingPreconditions.SeedScore</c> — sửa dữ liệu seed rẻ và sạch hơn nhiều
/// so với gõ vào giao diện.</para>
/// </summary>
[TestFixture]
[Category("parity")]
public sealed class ChgAccDataTests : UiTestBase
{
    private OchaDbAccounting? _db;
    private OchaDbAccounting.AccSnapshot? _snapshot;

    /// <summary>true = dòng 会計 do lô test tạo ⇒ teardown xoá hẳn.</summary>
    private bool _seededAccounting;

    /// <summary>
    /// Tc8-0 đã xác nhận nhánh G tới được chưa.
    ///
    /// <para>Cần cờ riêng vì <c>Assert.Ignore</c> KHÔNG phải Failed, nên
    /// <c>run.stopOnFirstFailure</c> không chặn các testcase sau. Chạy Tc8-1/Tc8-2 khi
    /// tiền đề chưa dựng được chỉ sinh ra một chuỗi F8 đi nhầm nhánh — mà nhánh đó
    /// GHI 未精算データ vào DB thật.</para>
    /// </summary>
    private bool _branchGReachable;

    /// <summary>未精算 đã có trước lô — teardown chỉ xoá phần vượt ra ngoài.</summary>
    private IReadOnlyCollection<OchaDbAccounting.UnpaidKey> _unpaidBefore = [];

    /// <summary>Số dòng 処置 trước lô — F8 tự lưu lưới nên số này sẽ tăng. Chỉ để BÁO.</summary>
    private int _treatmentsBefore = -1;

    protected override string? FixturePreflightSkipReason()
    {
        var s = TestSettings.Current;

        if (!s.Parity.AllowSave)
            return "CHUA CHAY — chưa bật parity.allowSave.\n\n  " + TestSettings.LocalFileHint() +
                   "\n\n  ⚠️ Luồng này GHI VÀO SỔ TIỀN (acc_dat + person_exp), nặng hơn " +
                   "ParitySaveData. Chỉ bật khi patNo đang trỏ vào bệnh nhân TEST.";

        if (!s.Db.Enabled || string.IsNullOrWhiteSpace(s.Db.ConnectionString))
            return "parity.allowSave đã bật nhưng thiếu db.connectionString — mọi khẳng định " +
                   "của luồng này đều soi thẳng ACCDAT / PERSON_EXP.\n\n  " +
                   TestSettings.LocalFileHint();

        return null;
    }

    [OneTimeSetUp]
    public void AccountingSetUp()
    {
        _db = OchaDbAccounting.CreateOrNull(Settings);
        _snapshot = _db?.Snapshot(PatNo, TrtDate);
        _treatmentsBefore = _db?.CountTreatments(PatNo, TrtDate) ?? -1;
        if (_snapshot is not null)
            TestContext.Out.WriteLine(
                $"Anh chup dau lo: {_snapshot.Rows.Count} dong ACCDAT | " +
                $"dep_due={_snapshot.DepDue} ins_due_bal={_snapshot.InsDueBal} | " +
                $"{_treatmentsBefore} dong TRNTRN");
    }

    [OneTimeTearDown]
    public void AccountingTearDown()
    {
        if (_db is null || _snapshot is null) return;
        try
        {
            // 未精算データ (UNPAID) — nhánh F ghi vào đây, và bảng này KHÔNG nằm trong
            // ảnh chụp ACCDAT nên phải dọn riêng, dọn trước cả hai đường bên dưới.
            var u = _db.DeleteUnpaidNotIn(PatNo, TrtDate, _unpaidBefore);
            if (u > 0) TestContext.Out.WriteLine($"Don: xoa {u} dong UNPAID phat sinh trong lo test");

            if (_seededAccounting)
            {
                // Ảnh chụp đầu lô KHÔNG có dòng 会計 nào ⇒ xoá sạch là đúng nguyên trạng.
                var d = _db.DeleteAccDat(PatNo, TrtDate);
                _db.SetBalances(PatNo, _snapshot.DepDue, _snapshot.InsDueBal);
                TestContext.Out.WriteLine($"Don: xoa {d} dong ACCDAT do lo test tao + tra so du ve cu");
                return;
            }

            var n = _db.Restore(PatNo, TrtDate, _snapshot);
            TestContext.Out.WriteLine($"Don: khoi phuc ACCDAT + PERSON_EXP ({n} dong bi cham)");
        }
        catch (Exception e)
        {
            TestContext.Out.WriteLine(
                $"⚠️ KHONG khoi phuc duoc so tien ({e.Message}). Kiem tay:\n" +
                $"  SELECT * FROM ACCDAT WHERE pat_no = {PatNo} AND trt_dt = '{TrtDate:yyyy-MM-dd}';\n" +
                $"  SELECT * FROM UNPAID WHERE pat_no = {PatNo} AND trt_dt = '{TrtDate:yyyy-MM-dd}';\n" +
                $"  UPDATE PERSON_EXP SET dep_due = {_snapshot.DepDue}, " +
                $"ins_due_bal = {_snapshot.InsDueBal} WHERE pat_no = {PatNo};");
        }
        finally
        {
            ReportTreatmentDrift();
        }
    }

    /// <summary>
    /// Báo phần 処置 mà lô test để lại — <b>báo thôi, không xoá</b>.
    ///
    /// <para>F8 gọi <c>ExitWithoutSaving(DialogResult.Yes, …)</c> trước
    /// <c>LetAccData2</c> (frm203002.cs:7716), nên 処置 mà testcase thêm để tạo chênh
    /// lệch được LƯU THẬT vào TRNTRN. Không tự xoá vì luồng ParitySaveData đã học bài
    /// đó bằng cách mất dữ liệu: F9 xoá rồi chèn lại cả tháng với <c>seq</c> mới, nên
    /// "xoá dòng thêm vào" theo ảnh chụp hoá ra xoá sạch cả 8 dòng gốc.</para>
    /// </summary>
    private void ReportTreatmentDrift()
    {
        if (_db is null || _treatmentsBefore < 0) return;
        try
        {
            var after = _db.CountTreatments(PatNo, TrtDate);
            if (after == _treatmentsBefore) return;

            TestContext.Out.WriteLine(
                $"LECH TRNTRN: {_treatmentsBefore} -> {after} dong. F8 luu luoi truoc khi tinh 会計 " +
                "nen 処置 lo test them vao da nam lai trong DB. KHONG tu xoa (xem doc). Soi tay:\n" +
                $"  SELECT * FROM TRNTRN WHERE pat_no = {PatNo} AND trt_dt = '{TrtDate:yyyy-MM-dd}' " +
                "AND del_flg = 0 ORDER BY disp_no;");
        }
        catch (Exception e)
        {
            TestContext.Out.WriteLine($"Khong doc duoc so dong TRNTRN de bao lech: {e.Message}");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("Tc8-0 (mốc) — tiền đề: 会計 đã chốt + 処置会計連動 bật")]
    public void Tc8_0_BranchGIsReachable()
    {
        using var trace = TestTrace.Begin();

        // Hai điều kiện của modAcc.cs:598, dựng chung một chỗ với công cụ chẩn đoán —
        // testcase và công cụ chẩn đoán phải đứng CÙNG một điểm xuất phát, nếu không
        // bản đồ cái này vẽ ra không dùng được cho cái kia.
        var pre = AccountingPreconditions.Ensure(_db!, PatNo, TrtDate, trace);
        _seededAccounting = pre.SeededAccounting;
        _unpaidBefore = pre.UnpaidBefore;

        // Không Fail: thiếu tiền đề không phải bug của bản port, mà là môi trường chưa
        // sẵn sàng (điển hình: tre_acc_link vừa bật, phải khởi động lại app).
        if (!pre.Ok) IgnoreWithReason(pre.Blocker!);

        _branchGReachable = true;
    }

    /// <summary>Tc8-1/Tc8-2 chỉ được bấm F8 khi Tc8-0 đã xanh — xem <see cref="_branchGReachable"/>.</summary>
    private void RequireBranchG()
    {
        if (!_branchGReachable)
            IgnoreWithReason("Tc8-0 chưa dựng được tiền đề nên KHÔNG bấm F8 — đọc lý do ở Tc8-0.");
    }

    /// <summary>
    /// Đưa app về màn 診療入力 trước khi testcase thao tác.
    ///
    /// <para>Cần vì F8 <b>đóng</b> 診療入力 rồi mở 窓口精算 khi <c>LetAccData2</c> trả
    /// true (frm203002.cs:7741-7742). Testcase trước bấm F8 xong thì testcase sau không
    /// còn cửa sổ nào — mà lỗi báo ra sẽ là 「không thấy tab 個別」, chỉ người đọc đi sửa
    /// locator, hoàn toàn sai địa chỉ.</para>
    ///
    /// <para>Đặt ở ĐẦU testcase chứ không ở cuối testcase trước: testcase trước có thể
    /// đã ném lỗi giữa chừng, và dọn ở đầu thì trạng thái nào cũng về được.</para>
    /// </summary>
    private void EnsureTreatmentScreen(TestTrace trace)
    {
        var closed = AccountingFlow.LeaveCounterPayment(App, trace);
        if (!closed && TreatmentScreenAlive()) return;

        trace.Do("mo lai man 診療入力", ReopenTreatmentScreen);
    }

    [Test, Order(2)]
    [Description("Tc8-1 — chuỗi hộp thoại F8 có dẫn tới 会計データ修正 không (ghi lại chuỗi thật)")]
    public void Tc8_1_F8ChainReachesChgAccData()
    {
        using var trace = TestTrace.Begin();
        RequireBranchG();
        EnsureTreatmentScreen(trace);

        var walk = AccountingFlow.WalkToChgAccData(App, Screen.Window, trace);

        trace.Note($"chuoi thuc te: {walk.Trail.Count} hop thoai trung gian");
        foreach (var s in walk.Trail)
            trace.Note($"  「{s.Text}」 nut={string.Join("/", s.Buttons)} -> da bam 「{s.Answered}」");

        if (!walk.Reached)
        {
            // Không tới đích KHÔNG chắc là lỗi của bản port: cây quyết định rẽ theo dữ
            // liệu. walk.Diagnosis nói bằng ngôn ngữ của modAcc chứ không phải
            // "không thấy nút", nên đọc là biết đi sửa ở đâu.
            Assert.Inconclusive(
                "Chuỗi F8 không dẫn tới 「…計上しますか？」.\n\n" +
                (walk.Diagnosis ?? "(khong co chan doan)"));
        }

        // Không bấm はい ở testcase này — chỉ xác nhận đường đi. Đóng lại để Tc8-2
        // bắt đầu từ trạng thái sạch.
        AccountingFlow.Answer(walk.Target!, yes: false, trace);
    }

    [Test, Order(3)]
    [Description("Tc8-2 — 🐛 ISSUE-1: nhánh giữa GÁN, số dư kia bị xoá sạch")]
    public void Tc8_2_MiddleBranch_WipesTheOtherBalance()
    {
        using var trace = TestTrace.Begin();
        RequireBranchG();
        EnsureTreatmentScreen(trace);
        var db = _db!;

        // Dựng đúng tổ hợp làm nhánh GIỮA chạy: có CẢ HAI số dư, và số dư bị trừ
        // NHỎ HƠN mức chênh. Sai tổ hợp thì đi nhánh ngoài (cộng dồn đúng) và
        // testcase không chứng minh được gì.
        const int depDue = 10_000;
        const int insDue = 300;
        trace.Do($"dung so du: dep_due={depDue} ins_due_bal={insDue}",
            () => db.SetBalances(PatNo, depDue, insDue));

        var accBefore = trace.Do("chup ACCDAT truoc", () => db.ReadAccDat(PatNo, TrtDate));

        var walk = AccountingFlow.WalkToChgAccData(App, Screen.Window, trace);
        if (!walk.Reached)
            Assert.Inconclusive("Không tới được 会計データ修正.\n\n" +
                                (walk.Diagnosis ?? "(khong co chan doan)"));

        var text = AccountingFlow.Answer(walk.Target!, yes: true, trace);
        trace.Note($"nguyen van hop thoai: 「{text}」");

        Waits.Step();
        var after = trace.Do("doc lai so du", () => db.ReadBalances(PatNo));
        var accAfter = trace.Do("doc lai ACCDAT", () => db.ReadAccDat(PatNo, TrtDate));

        Assert.That(after, Is.Not.Null);
        trace.Note($"so du: dep_due {depDue} -> {after!.Value.DepDue} | " +
                   $"ins_due_bal {insDue} -> {after.Value.InsDueBal}");
        foreach (var r in accAfter)
            trace.Note($"  ACCDAT km_cd={r.KmCd} score={r.Score} claim={r.ClaimAmt} rece={r.ReceAmt}");

        Assert.Multiple(() =>
        {
            // Chỉ khẳng định hướng GIẢM (dep_due được cấn). Hướng TĂNG cần dựng dữ
            // liệu ngược lại — để dành, đừng đoán mò ở đây.
            Assert.That(after.Value.InsDueBal, Is.Zero,
                "Nhánh giữa phải đưa 未収金 về 0 (modAcc.cs:1022).");

            // ── ĐÂY LÀ BUG ────────────────────────────────────────────────────
            // Đúng nghiệp vụ : dep_due = 10.000 + (diff − 300)
            // WinForm (parity): dep_due =            diff − 300
            Assert.That(after.Value.DepDue, Is.LessThan(depDue),
                $"🐛 ISSUE-1: dep_due phải BỊ GHI ĐÈ (nhỏ hơn {depDue}), không phải cộng dồn. " +
                "Nếu vế này ĐỎ tức là WinForm cộng dồn đúng — nghĩa là tôi đọc sai source, " +
                "và bản web đang tái tạo một bug KHÔNG TỒN TẠI. Phải gỡ phần port đó ra " +
                "(kèm AccountingBalanceAllocatorTests đang khoá nó). Đây là kết quả quan " +
                "trọng nhất của cả luồng — đừng bỏ qua.");

            Assert.That(accAfter, Is.Not.EqualTo(accBefore),
                "ACCDAT phải đổi — không đổi nghĩa là 会計データ修正 chưa ghi gì.");
        });
    }
}
