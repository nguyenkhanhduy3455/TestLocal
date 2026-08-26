using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

namespace OchaCom.FlaUiTests.Tests.AccountingFocusedDay;

/// <summary>
/// <b>会計対象日 phải lấy theo DÒNG ĐANG CÓ CON TRỎ</b> — nửa WinForm của
/// <c>../web-tenant-tests/tests/accounting-target-date.spec.ts</c>, cùng số hiệu TC.
///
/// Bug tester báo (2026-08-26): màn 診療入力 mở ở ngày HÔM NAY, rê con trỏ về dòng
/// ngày cũ rồi bấm F8 会計 — bản web vẫn thanh toán dữ liệu của ngày trên URL.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐÂY LÀ BÊN ĐO ĐÁP ÁN
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// frm203002.cs:7719  intRo = hFG1.CurrentCellAddress.Y
///                    modAcc.LetAccData2(con, intRo)          ← truyền DÒNG
/// modAcc.cs:377      strDate = 年月(màn hình) + hFG1[0, intRow]
/// modAcc.cs:386      ≠ hôm nay → MsgBox 「本日でありません」 (OkCancel)
/// modAcc.cs:389      Cancel → functionReturnValue = TRUE, return NGAY
/// frm203002.cs:7742  nhánh TRUE → showForm(ID204002) + this.Close()
/// frm203002.cs:7749  IDM_AccDataOnly_Click gọi CHÍNH LetAccData2, nhưng KHÔNG có
///                    showForm/Close ⇒ 診療入力 ở lại
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB — và đó là thiết kế, không phải may
/// ═══════════════════════════════════════════════════════════════════════════
/// Cổng ngày nằm TRƯỚC mọi dòng ghi (dòng ghi đầu tiên là
/// <c>UnPaid.deleteTrtDtUnPaid</c>), và <c>modAcc.cs</c> không có transaction nào —
/// ghi là commit ngay. Nên mọi testcase ở đây <b>trả lời キャンセル ở cổng ngày</b>,
/// tức <c>LetAccData2</c> thoát trước khi chạm dòng ghi nào. TC-DATE-2 còn đọc
/// <c>未精算</c> trước/sau để chứng minh điều đó bằng số, chứ không chỉ bằng lập luận.
///
/// <para><b>Vì sao không có TC-DATE-1.</b> Bên web, TC-DATE-1 đọc URL của
/// <c>precheck</c>/<c>insert-unpaid</c> để biết FE gửi ngày nào — WinForm không có
/// đường tương đương mà không ghi DB: muốn biết nó CHỌN ngày nào thì phải để nó chạy
/// tiếp và tạo 未精算 thật. Cái WinForm chứng minh được ở chế độ chỉ-đọc là <b>cổng
/// ngày mở theo dòng con trỏ</b> — TC-DATE-2 làm đúng việc đó khi màn hình mở ở HÔM NAY.
/// Phần còn lại (TC-DATE-1 「ngày nào được chọn」 và TC-DATE-3 「dòng hôm nay ⇒ không
/// hỏi」) buộc phải để F8 ghi, nên nằm ở <see cref="AccountingTargetDayWriteTests"/>.</para>
///
/// <para>Chạy: <c>.\run-accounting-focused-day.ps1</c></para>
/// </summary>
[TestFixture]
[Category("accounting-focused-day")]
public sealed class AccountingTargetDayTests : UiTestBase
{
    private AccountingDayFlow _flow = null!;
    private OchaDbAccounting? _accDb;

    /// <summary>
    /// Tắt hẳn watcher.
    ///
    /// <para>Chuỗi F8 toàn hộp thoại 「…続けますか？」/「…よろしいですか。」 mà với chúng
    /// phủ định = BỎ CUỘC. Watcher bấm 「いいえ」 hộ sẽ huỷ chuỗi trước khi testcase kịp
    /// thấy cổng ngày, và log sẽ nói 「F8 không hỏi gì」 — kết luận ngược hẳn sự thật.</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason() =>
        Settings.Parity.AllowSave
            ? null
            : "chưa bật parity.allowSave. F8 会計 là cửa vào sổ tiền. Bộ này được thiết kế " +
              "để DỪNG ở cổng ngày và không ghi gì, nhưng vẫn đòi cờ để người chạy biết " +
              "mình đang đứng trên đường nào. Chạy: .\\run-accounting-focused-day.ps1";

    [OneTimeSetUp]
    public void TargetDayOneTimeSetUp()
    {
        _flow = new AccountingDayFlow(App, Screen);
        _accDb = OchaDbAccounting.CreateOrNull(Settings);
    }

    /// <summary>Ngày trên lưới KHÁC hôm nay — tình huống của bug.</summary>
    private RegiRowOfDay RequireOtherDayRow()
    {
        EnsureEntryScreen();

        var today = DateTime.Today.Day;
        var day = _flow.DaysOnGrid().FirstOrDefault(d => d != today);
        if (day == 0)
            IgnoreWithReason(
                $"lưới không có ngày nào khác hôm nay ({today}) — không dựng được tình huống " +
                "「con trỏ ở ngày khác ngày mở màn hình」. Đổi patient.trtDate sang tháng có " +
                "nhiều ngày 処置.");

        var row = _flow.RowForDay(day);
        if (row is null) IgnoreWithReason($"không thấy dòng nào có 日 = {day}");
        return new RegiRowOfDay(day, row!);
    }

    private sealed record RegiRowOfDay(int Day, TreatmentGrid.RegiRow Row);

    /// <summary>Mở lại 診療入力 nếu lượt trước đã đóng nó (Cancel ở cổng ngày ⇒ đóng).</summary>
    private void EnsureEntryScreen()
    {
        _flow.LeaveCounterPaymentIfOpen();
        if (_flow.TreatmentScreenAlive()) return;

        ReopenTreatmentScreen();
        _flow = new AccountingDayFlow(App, Screen);
    }

    [TearDown]
    public void BackToEntryScreen()
    {
        try { EnsureEntryScreen(); }
        catch (Exception e) { TestContext.Out.WriteLine($"không mở lại được 診療入力: {e.Message}"); }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-DATE-2 — ⇔ web TC-DATE-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC-DATE-2 — Cancel ở cổng ngày: KHÔNG tạo 未精算 nhưng VẪN sang 窓口精算")]
    public void TcDate2_CancelSkipsUnpaidButStillOpensCounterPayment()
    {
        using var trace = TestTrace.Begin();
        var target = RequireOtherDayRow();

        var targetDate = new DateTime(TrtDate.Year, TrtDate.Month, target.Day);
        var before = _accDb?.ReadUnpaidKeys(PatNo, targetDate).Count;

        TestContext.Out.WriteLine(
            $"màn hình mở ở 年月 「{Screen.YearMonth()}」, đặt con trỏ vào dòng 日 = {target.Day} " +
            $"(hôm nay là {DateTime.Today.Day}); 未精算 của {targetDate:yyyy-MM-dd} trước khi bấm: " +
            $"{before?.ToString() ?? "(không đọc được DB)"}");

        _flow.FocusRow(target.Row, trace);
        var result = _flow.PressF8AndStopAtDayGate(trace);

        TestContext.Out.WriteLine($"=== KQ-DATE-2 === chuỗi hộp thoại ({result.Trail.Count}):");
        foreach (var s in result.Trail) TestContext.Out.WriteLine("        " + s);

        // ⚠️ Sức chứng minh của assert này phụ thuộc NGÀY MỞ MÀN HÌNH.
        //
        // Runner mặc định mở màn ở HÔM NAY (xem run-accounting-focused-day.ps1), và
        // chỉ khi đó phép đo mới phân biệt được hai giả thuyết:
        //     lấy theo DÒNG CON TRỎ  → ngày 3 ≠ hôm nay → CÓ hỏi
        //     lấy theo NGÀY MÀN HÌNH → = hôm nay        → KHÔNG hỏi
        // Mở màn ở một ngày cũ thì cả hai đều dự đoán 「có hỏi」, testcase vẫn xanh
        // nhưng không còn chứng minh được gì — nên nói rõ trong thông điệp.
        var screenIsToday = TrtDate.Date == DateTime.Today;
        Assert.That(result.Gate, Is.EqualTo(AccountingDayFlow.DayGate.AskedNotToday),
            $"con trỏ ở dòng 日 = {target.Day} (khác hôm nay) thì F8 PHẢI hỏi " +
            $"「{AccountingDayFlow.NotTodayMsg}」 (modAcc.cs:386). Kết quả: {result.Gate} — " +
            $"{result.Explain}" +
            (screenIsToday
                ? " Màn hình đang mở ở HÔM NAY, nên không hỏi ⇒ 会計対象日 đang lấy theo NGÀY " +
                  "MÀN HÌNH thay vì theo dòng con trỏ — đúng triệu chứng tester báo."
                : $" (Màn hình mở ở {TrtDate:yyyy-MM-dd}, KHÔNG phải hôm nay ⇒ testcase này " +
                  "đang mất khả năng phân biệt; chạy qua run-accounting-focused-day.ps1 để " +
                  "nó tự đặt ngày mở màn = hôm nay.)"));

        if (screenIsToday)
            TestContext.Out.WriteLine(
                $"=== KQ-DATE-2 === màn hình mở ở HÔM NAY ({TrtDate:yyyy-MM-dd}) mà con trỏ ở " +
                $"dòng ngày {target.Day} vẫn làm cổng ngày bung ra ⇒ 会計対象日 lấy theo DÒNG " +
                "CON TRỎ, không phải theo ngày mở màn hình.");
        else
            TestContext.Out.WriteLine(
                $"CẢNH BÁO — màn hình mở ở {TrtDate:yyyy-MM-dd} chứ không phải hôm nay, nên " +
                "testcase này chỉ kiểm được 「có hỏi」 chứ chưa phân biệt được ngày đến từ đâu.");

        // modAcc.cs:389 — Cancel đặt functionReturnValue = TRUE, nên IDM_Acc_Click vẫn
        // chạy showForm(ID204002) + this.Close(). Đây là PARITY, không phải bug mới.
        Assert.That(result.ScreenClosed, Is.True,
            "Cancel ở cổng ngày phải VẪN sang 窓口精算: modAcc.cs:389 trả TRUE, và nhánh TRUE " +
            "của IDM_Acc_Click là showForm(ID204002) + this.Close() (frm203002.cs:7742-7743). " +
            "診療入力 còn mở nghĩa là LetAccData2 đã trả FALSE — sai nhánh.");

        if (_accDb is not null && before is not null)
        {
            var after = _accDb.ReadUnpaidKeys(PatNo, targetDate).Count;
            Assert.That(after, Is.EqualTo(before),
                $"Cancel mà 未精算 của {targetDate:yyyy-MM-dd} đổi từ {before} sang {after} — " +
                "LetAccData2 phải return TRƯỚC bước tạo dữ liệu (modAcc.cs:389, còn " +
                "deleteTrtDtUnPaid nằm sau đó).");
            TestContext.Out.WriteLine($"=== KQ-DATE-2 === 未精算 trước/sau = {before}/{after} (không đổi)");
        }
        else
        {
            TestContext.Out.WriteLine(
                "CẢNH BÁO — không đọc được DB nên chỉ kiểm được cổng ngày và việc chuyển màn, " +
                "chưa chứng minh được 「không tạo 未精算」 bằng số.");
        }
    }

    // TC-DATE-3 đã CHUYỂN sang AccountingTargetDayWriteTests.
    //
    // Nó đo 「cổng ngày IM LẶNG」, mà im lặng nghĩa là LetAccData2 chạy tiếp thẳng vào
    // deleteTrtDtUnPaid + insert. Không có cách nào quan sát 「không hỏi」 mà lại chặn
    // được nó đi tiếp — nên nó phá vỡ đúng nguyên tắc 「dừng ở cổng ngày, không ghi gì」
    // của fixture này. TC-DATE-1 cũng vậy: cổng ngày chỉ nói 「khác hôm nay」 chứ không
    // nói NGÀY NÀO, muốn biết ngày thật thì phải đọc dòng UNPAID nó ghi ra.

    // ═══════════════════════════════════════════════════════════════════════
    // TC-DATE-4 — ⇔ web TC-DATE-4
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC-DATE-4 — F11「3 会計データ作成」 cũng qua cổng ngày, nhưng Ở LẠI 診療入力")]
    public void TcDate4_AccDataOnlyAlsoHitsDayGateButStaysOnEntryScreen()
    {
        using var trace = TestTrace.Begin();
        var target = RequireOtherDayRow();

        TestContext.Out.WriteLine(
            $"đặt con trỏ vào dòng 日 = {target.Day} rồi F11 → 「3 {AccountingDayFlow.AccDataOnlyMenuText}」");

        _flow.FocusRow(target.Row, trace);
        var result = _flow.PressAccDataOnlyAndStopAtDayGate(trace);

        TestContext.Out.WriteLine($"=== KQ-DATE-4 === chuỗi hộp thoại ({result.Trail.Count}):");
        foreach (var s in result.Trail) TestContext.Out.WriteLine("        " + s);

        Assert.That(result.Gate, Is.EqualTo(AccountingDayFlow.DayGate.AskedNotToday),
            "「3 会計データ作成」 gọi CHÍNH LetAccData2 (frm203002.cs:7749) nên PHẢI đi qua cổng " +
            $"ngày y như F8. Kết quả: {result.Gate} — {result.Explain}");

        // IDM_AccDataOnly_Click KHÔNG có showForm(ID204002) lẫn this.Close() — đây là
        // điểm DUY NHẤT phân biệt nó với IDM_Acc_Click.
        Assert.That(result.ScreenClosed, Is.False,
            "「3 会計データ作成」 làm đóng 診療入力 / nhảy sang 窓口精算 — đó là việc của 「2 会計」 " +
            "(IDM_Acc_Click, frm203002.cs:7742-7743). IDM_AccDataOnly_Click không có hai lệnh đó.");

        TestContext.Out.WriteLine(
            "=== KQ-DATE-4 === cùng cổng ngày, khác phần sau: F8 sang 窓口精算, " +
            "「3 会計データ作成」 ở lại 診療入力.");
    }
}
