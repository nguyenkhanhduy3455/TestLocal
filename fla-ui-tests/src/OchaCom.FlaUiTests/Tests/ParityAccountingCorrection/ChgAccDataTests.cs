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
/// Nhánh G chỉ tới được khi bệnh nhân ĐÃ có 会計 chốt cho ngày đó. Test <b>tự tạo
/// dòng đó</b> (<c>EnsureSettledAccounting</c>) thay vì bắt người chạy đi 窓口精算
/// bằng tay — đây là auto test.
///
/// <para>Không phải đường tắt: đã tra DB, <b>toàn bộ SIM2000 không có dòng ACCDAT
/// nào trong tháng test</b> (mới nhất 2026-07-31). Bệnh nhân đã 窓口精算 đều ở tháng
/// 1/2026, mà 診療入力 chỉ sửa được 処置月 hiện hành. Nên seed là cách duy nhất.</para>
///
/// <para>Teardown xoá đúng phần đã seed và khôi phục số dư theo ảnh chụp đầu lô.</para>
/// </summary>
[TestFixture]
[Category("parity")]
public sealed class ChgAccDataTests : UiTestBase
{
    private OchaDbAccounting? _db;
    private OchaDbAccounting.AccSnapshot? _snapshot;

    /// <summary>true = dòng 会計 do lô test tạo ⇒ teardown xoá hẳn.</summary>
    private bool _seededAccounting;

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
        if (_snapshot is not null)
            TestContext.Out.WriteLine(
                $"Anh chup dau lo: {_snapshot.Rows.Count} dong ACCDAT | " +
                $"dep_due={_snapshot.DepDue} ins_due_bal={_snapshot.InsDueBal}");
    }

    [OneTimeTearDown]
    public void AccountingTearDown()
    {
        if (_db is null || _snapshot is null) return;
        try
        {
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
                $"  UPDATE PERSON_EXP SET dep_due = {_snapshot.DepDue}, " +
                $"ins_due_bal = {_snapshot.InsDueBal} WHERE pat_no = {PatNo};");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("Tc8-0 (mốc) — tiền đề: ngày test phải có 会計 đã chốt")]
    public void Tc8_0_DayHasSettledAccounting()
    {
        using var trace = TestTrace.Begin();
        var db = _db!;

        // Tự dựng tiền đề. Điểm/tiền lấy xấp xỉ mức 処置 đang có để 会計 seed trông
        // như một lượt 窓口精算 thật, không phải con số bịa.
        var patBr = trace.Do("lay 枝番 tu 処置 cua ngay", () => db.ResolvePatBr(PatNo, TrtDate));
        _seededAccounting = trace.Do(
            "dung tien de: bao dam ngay test co 会計 da chot",
            () => db.EnsureSettledAccounting(PatNo, TrtDate, score: 339, claimAmt: 1_020, patBr: patBr));
        trace.Note(_seededAccounting
            ? "=> VUA TAO dong 会計 (teardown se xoa)"
            : "=> da co san, khong tao them");

        var rows = trace.Do("doc ACCDAT cua ngay test", () => db.ReadAccDat(PatNo, TrtDate));
        foreach (var r in rows)
            trace.Note($"  acc_dt={r.AccDt:yyyy-MM-dd} acc_cnt={r.AccCnt} trt_cnt={r.TrtCnt} " +
                       $"km_cd={r.KmCd} lflg={r.Lflg} score={r.Score} claim={r.ClaimAmt} rece={r.ReceAmt}");

        var target = db.FindTargetRow(PatNo, TrtDate);
        Assert.That(target, Is.Not.Null,
            "Không có dòng 医療保険 (km_cd 40-49 / 57 / 58, lflg = 0). ChgAccData đọc thẳng " +
            "Rows[0] của tập đó nên WinForm sẽ ném IndexOutOfRange — bản web trả " +
            "TREATMENT.ACCOUNTING_ROW_NOT_FOUND. Ghi lại nếu bạn gặp trạng thái này.");

        trace.Note($"dong se bi sua: km_cd={target!.KmCd} score={target.Score} " +
                   $"claim_amt={target.ClaimAmt} rece_amt={target.ReceAmt}");
    }

    [Test, Order(2)]
    [Description("Tc8-1 — chuỗi hộp thoại F8 có dẫn tới 会計データ修正 không (ghi lại chuỗi thật)")]
    public void Tc8_1_F8ChainReachesChgAccData()
    {
        using var trace = TestTrace.Begin();

        // 処置 phải KHÁC với 会計 đã chốt, nếu không precheck trả GIsNothing và
        // chuỗi kết thúc sớm. Thêm một 再診 là đủ tạo chênh lệch.
        AddTreatmentToCreateDelta(trace);

        var walk = AccountingFlow.WalkToChgAccData(App, Screen.Window, trace);

        trace.Note($"chuoi thuc te: {walk.Trail.Count} hop thoai trung gian");
        foreach (var s in walk.Trail)
            trace.Note($"  「{s.Text}」 nut={string.Join("/", s.Buttons)} -> da bam 「{s.Answered}」");

        if (!walk.Reached)
        {
            // Không tới đích KHÔNG chắc là lỗi: có thể tenant tắt tre_acc_link, hoặc
            // dữ liệu không rơi vào nhánh G. Nhật ký ở trên nói rõ đã đi tới đâu.
            Assert.Inconclusive(
                "Chuỗi F8 không dẫn tới 「…計上しますか？」. Đọc danh sách hộp thoại ở trên: " +
                "nếu dừng ở 「請求金額が増えています」 thì dữ liệu đang rơi vào nhánh F (差額), " +
                "không phải G. Cần 会計設定.tre_acc_link = 1 và 処置 phải GIẢM so với 会計 đã chốt.");
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
        var db = _db!;

        // Dựng đúng tổ hợp làm nhánh GIỮA chạy: có CẢ HAI số dư, và số dư bị trừ
        // NHỎ HƠN mức chênh. Sai tổ hợp thì đi nhánh ngoài (cộng dồn đúng) và
        // testcase không chứng minh được gì.
        const int depDue = 10_000;
        const int insDue = 300;
        trace.Do($"dung so du: dep_due={depDue} ins_due_bal={insDue}",
            () => db.SetBalances(PatNo, depDue, insDue));

        var accBefore = trace.Do("chup ACCDAT truoc", () => db.ReadAccDat(PatNo, TrtDate));
        AddTreatmentToCreateDelta(trace);

        var walk = AccountingFlow.WalkToChgAccData(App, Screen.Window, trace);
        if (!walk.Reached)
            Assert.Inconclusive("Không tới được 会計データ修正 — xem Tc8-1 để biết chuỗi dừng ở đâu.");

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

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Thêm một 処置 để 処置 hiện tại khác với 会計 đã chốt.
    ///
    /// <para>Không có chênh lệch thì precheck trả <c>GIsNothing</c> và chuỗi F8 kết
    /// thúc trước khi tới 会計データ修正.</para>
    /// </summary>
    private void AddTreatmentToCreateDelta(TestTrace trace)
    {
        var cd = Settings.Parity.SimpleTrtCd;
        var sb = Settings.Parity.SimpleTrtSb;

        var kobetu = trace.Do("mo tab 個別", () => Screen.Kobetu.Open());
        trace.Do("xoa 3 o tim kiem", kobetu.ResetSearchBoxes);
        var row = trace.Do($"tim 処置 {cd}-{sb}", () => kobetu.RequireRow(cd, sb));
        trace.Do($"chon 処置 {cd}-{sb}", () => kobetu.SelectRow(row));
        Waits.Step();
    }
}
