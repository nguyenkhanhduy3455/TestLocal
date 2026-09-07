using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.BuiPriceE00100;

/// <summary>
/// <b>Dữ liệu SẠCH thì KHÔNG được có E00100 nào.</b>
///
/// <para>Nửa WinForm của TC-CLEAN-1/TC-CLEAN-2 trong
/// <c>../web-tenant-tests/tests/accounting-unpaid/bui-price-e00100-parity.spec.ts</c>.
/// Bên kia kiểm 「response CÓ field <c>warnings</c> và nó rỗng」; bên này không có field
/// nào để soi nên mốc là 「không hộp thoại nào」 CỘNG 「日計 ra đúng số của DB」 — thiếu vế
/// sau thì một màn hình chết cứng cũng pass.</para>
///
/// <para>Không ghi gì, không cần cờ nào. Chạy: <c>.\run-calc-bui-price.ps1</c></para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// THỨ TỰ CHẠY NGƯỢC VỚI SỐ HIỆU TC — CÓ CHỦ Ý
/// ═══════════════════════════════════════════════════════════════════════════
/// Số hiệu giữ nguyên theo spec Playwright (TC-CLEAN-1 = 診療入力, TC-CLEAN-2 = F4
/// 当日来患) để hai bên đối chiếu được. Nhưng <c>[Order]</c> cho <b>F4 chạy TRƯỚC</b>,
/// vì đường đi của app một chiều: <c>frm203001</c> chỉ bị <c>Hide()</c> khi sang
/// <c>frm203002</c> (frm203001.cs:1061), mà <c>OchaApp.Windows</c> lọc theo
/// <c>IsOffscreen</c> nên cửa sổ ẩn không tìm lại được.
///
/// <para>Đã vấp thật 2026-09-07: bản đầu chạy 診療入力 trước rồi mới định lui về, và
/// TC-CLEAN-2 đỏ với 「không thấy cửa sổ 患者選択 … App đang mở: frm203002」. Cách lui
/// duy nhất là F10 戻る, mà F10 có thể bung 「処置データは、変更されています。保存しますか？」
/// và trả lời nhầm là GHI THẬT xuống <c>trn_trn</c> (PROBE-GUIDELINE 3.3) — không đáng
/// đổi lấy việc giữ thứ tự đọc cho đẹp.</para>
/// </summary>
[TestFixture]
[Category("bui-price-e00100")]
public sealed class BuiPriceE00100CleanTests : UiTestBase
{
    private BuiPriceE00100Db? _db;

    /// <summary>
    /// Tắt watcher — fixture này đang ĐO CHÍNH việc 「có hộp thoại nào không」. Để watcher
    /// bấm hộ thì TC-CLEAN-1 xanh SAI: nó kết luận 「app không hỏi」 trong khi app có hỏi.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>Đứng lại ở 患者選択 để TC-CLEAN-2 bấm được F4 — xem khối chú thích của lớp.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    [OneTimeSetUp]
    public void CleanSetUp()
    {
        _db = BuiPriceE00100Db.CreateOrNull(Settings);

        // Seed của fixture kia có thể còn sót lại nếu một lượt chạy trước chết giữa
        // chừng. Nói thẳng ra ở đây, vì nếu không thì TC-CLEAN-1 đỏ với thông điệp
        // 「dữ liệu thật đang hỏng」 — đúng chữ, sai nguyên nhân.
        if (_db is null) return;
        var stale = _db.ReadPubexp(PatNo)
                       .Where(p => p.PubexpinfNo == Settings.BuiPrice.SeedPubexpinfNo)
                       .ToList();
        if (stale.Count > 0)
            TestContext.Error.WriteLine(
                $"CẢNH BÁO: bệnh nhân {PatNo} còn {stale.Count} dòng PUBEXPINF mang " +
                $"pubexpinf_no = {Settings.BuiPrice.SeedPubexpinfNo} — RẤT có thể là seed sót lại " +
                "của BuiPriceE00100SeedTests. Gỡ nó trước khi tin kết quả nhóm CLEAN.");
    }

    [Test, Order(1)]
    [Description("TC-CLEAN-2 — F4 当日来患: không E00100 nào, và lưới có đủ dòng của ngày")]
    public void TcClean2_TodayViewHasNoDialog()
    {
        if (_db is null) IgnoreWithReason($"cần DB để biết ngày test có mấy dòng — {DbUnavailableReason}");

        using var trace = TestTrace.Begin();
        var flow = new BuiPriceE00100Flow(App);
        var expected = _db!.TodayViewKeys(TrtDate);

        if (expected.Count == 0)
            IgnoreWithReason(
                $"ngày {TrtDate:yyyy-MM-dd} không có dòng 当日来患 nào (Trntrn.cs:2132-2140) — " +
                "trỏ patient.trtDate vào ngày CÓ 処置 thì testcase này mới đo được gì");

        var patSelect = AppNavigator.OpenPatientSelect(App, Settings);
        AppNavigator.SetTreatmentDate(patSelect, TrtDate);
        trace.Shot("tc-clean-2-da-dat-ngay");
        flow.PressF4(patSelect, trace);
        Waits.Step();

        var boxes = flow.Drain(TimeSpan.FromSeconds(10), rounds: 6, trace);
        Assert.That(boxes, Is.Empty,
            "F4 当日来患 với dữ liệu THẬT mà bật E00100: " +
            string.Join(" | ", boxes.Select(b => b.ToString())));

        var rows = flow.TodayRows(patSelect);
        trace.Shot("tc-clean-2-luoi-当日来患");
        Assert.That(rows, Has.Count.EqualTo(expected.Count),
            $"lưới 当日来患 có {rows.Count} dòng nhưng truy vấn của app (Trntrn.cs:2132-2140) " +
            $"trả {expected.Count} cặp (患者番号,枝番): " +
            string.Join(", ", expected.Select(k => $"{k.PatNo}/{k.PatBr}")) +
            ". Đọc được: " + string.Join(" ⏎ ", rows.Select(r => r.ToString())));
    }

    [Test, Order(2)]
    [Description("TC-CLEAN-1 — mở 診療入力: không E00100 nào, và 日計 khớp TRNTRN")]
    public void TcClean1_TreatmentEntryHasNoDialogAndRealDailyTotals()
    {
        using var trace = TestTrace.Begin();
        var flow = new BuiPriceE00100Flow(App);

        var window = OpenTreatmentEntry(trace);
        var screen = new TreatmentEntryScreen(window, App.Automation);
        screen.WaitUntilReady();

        // Tới đây app đã đi qua ModSave.GetTrnRs → Calc_BuiPriceData2s (modSave.cs:2467).
        // Còn hộp nào tức là dữ liệu thật đang hỏng.
        var open = flow.OpenDialogs();
        Assert.That(open, Is.Empty,
            "mở 診療入力 với dữ liệu THẬT mà vẫn có MessageBox: " +
            string.Join(" | ", open.Select(d => d.ToString())) +
            ". Nếu là E00100 thì đây là lỗi DỮ LIỆU (hoặc seed sót lại), không phải lỗi spec.");
        trace.Shot("tc-clean-1-khong-hop-thoai");

        AssertDailyTotalsMatchOracle(new AccountingDayFlow(App, screen), "TC-CLEAN-1");
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// 日計 của app phải khớp <see cref="BuiPriceE00100Db.DayPointOracle"/>.
    ///
    /// <para>Dùng chung với fixture có seed: cùng một phép đo, chỉ khác bối cảnh — và đó
    /// chính là điều đang so.</para>
    /// </summary>
    internal static void AssertDailyTotalsMatchOracle(AccountingDayFlow day, string tc)
    {
        var db = BuiPriceE00100Db.CreateOrNull(TestSettings.Current);
        if (db is null) return;

        var patNo = int.Parse(TestSettings.Current.Patient.PatNo);
        var month = TestSettings.Current.Patient.ResolvedTrtDate;
        var oracle = db.DayPointOracle(patNo, month);
        var totals = day.DailyTotals();

        Assert.That(totals, Is.Not.Empty,
            $"{tc}: lưới không có dòng 【日計】 nào cho tháng {month:yyyy-MM} — " +
            $"ORACLE nói có {oracle.Count} ngày: " +
            string.Join(", ", oracle.Select(kv => $"ngày {kv.Key} = {kv.Value}点")));

        foreach (var t in totals)
        {
            if (!oracle.TryGetValue(t.Day, out var want)) continue;
            Assert.That(t.Point, Is.EqualTo(want),
                $"{tc}: 日計 ngày {t.Day} của app = {t.Point}点 nhưng ORACLE cộng ra {want}点. " +
                "ORACLE = Σ (trt_pt × 回数) trên dòng jihi_flg = 0 của ngày " +
                "(buiPrice.cs:286-291 → modAcc.cs:190-192). Lệch ⇒ tháng test có dòng mà " +
                "oracle chưa tính đúng (自費? 介護?), sửa oracle TRƯỚC khi đổ cho app.");
        }
    }

    /// <summary>
    /// Gõ 患者番号 rồi F8 閲覧/変更 và chờ frm203002.
    ///
    /// <para>Không dùng <c>AppNavigator.OpenTreatmentEntry</c>: hàm đó tự gọi
    /// <c>OpenPatientSelect</c> lại từ đầu, mà TC-CLEAN-2 đã đưa màn hình vào chế độ
    /// 当日来患 và đặt 診療日 rồi — mở lại là bỏ đi trạng thái đó.</para>
    /// </summary>
    private Window OpenTreatmentEntry(TestTrace trace)
    {
        var patSelect = App.Windows()
            .FirstOrDefault(w => Txt.Same(Uia.AutomationIdOf(w), "frm203001"));
        if (patSelect is null)
            Assert.Fail(
                "không thấy cửa sổ 患者選択 (frm203001). App đang mở: " +
                string.Join(" | ", App.Windows().Select(w => Uia.AutomationIdOf(w))));

        AppNavigator.SetTreatmentDate(patSelect!, TrtDate);

        var combo = Waits.For(() => Uia.ById(patSelect!, TestSettings.Current.Locator("patSelPatNo")),
                              "ô 患者番号 「cboPatNo」");
        Uia.SetText(Uia.EditInside(combo), Settings.Patient.PatNo);
        Waits.Step();
        trace.Step($"bam F8 閲覧/変更 cho benh nhan {Settings.Patient.PatNo}");
        Keyboard.Press(VirtualKeyShort.F8);

        var window = Waits.TryFor(() => App.Window("frm203002"),
                                  TimeSpan.FromSeconds(Settings.App.LaunchTimeoutSeconds));
        if (window is null)
            Assert.Fail(
                $"bấm F8 cho bệnh nhân {Settings.Patient.PatNo} mà 診療入力 không mở. " +
                "MessageBox đang chắn: " +
                string.Join(" | ", new BuiPriceE00100Flow(App).OpenDialogs().Select(d => d.ToString())));
        return window!;
    }
}

// ═════════════════════════════════════════════════════════════════════════════

/// <summary>
/// <b>Dữ liệu 公費 hỏng: E00100 nổ, rồi app CHẠY TIẾP.</b>
///
/// <para>Nửa WinForm của TC-E00100-1/2/4 bên Playwright. Ba khẳng định chính, và cả ba
/// đều là thứ mà lỗi 500 của bản web đã phá:</para>
/// <list type="number">
/// <item>E00100 ra ĐÚNG văn bản, ĐÚNG một nút OK, 「1 件 1 ダイアログ」.</item>
/// <item>Dòng bệnh nhân hỏng VẪN CÒN trên 当日来患 và vẫn được cộng vào 合計 —
///   <c>frm203001</c> GIỮ dòng (frm203001.cs:921-932), khác hẳn <c>frm204008</c>.</item>
/// <item>診療入力 VẪN MỞ và 日計 vẫn ra đúng số của DB.</item>
/// </list>
///
/// <para><b>Nhánh đang đo là 「福祉医療設定データが存在しません」 (buiPrice.cs:1734), KHÔNG
/// phải nhánh ngoại lệ.</b> Khác nhau ở chỗ quan trọng: nhánh này không ném, app vá
/// <c>localFlg</c> bằng mặc định (buiPrice.cs:1866-1872) rồi <b>tính tiếp bình thường</b> —
/// nên số trên màn hình KHÔNG về 0. Nhánh ngoại lệ mới là nhánh trả <c>buiPriceData2</c>
/// toàn 0; xem README mục 6.1 để biết vì sao chưa đo được nó.</para>
///
/// <para>⚠️ GHI DB: <c>INSURANCE.PUBEXPINF_NO</c> + một dòng <c>PUBEXPINF</c> của bệnh
/// nhân test, chụp ảnh và trả lại ở <c>OneTimeTearDown</c>. Nằm sau
/// <c>buiPrice.allowSeed</c>. Chạy: <c>.\run-calc-bui-price.ps1 -Seed</c></para>
/// </summary>
[TestFixture]
[Category("bui-price-e00100")]
public sealed class BuiPriceE00100SeedTests : UiTestBase
{
    private BuiPriceE00100Db? _db;
    private BuiPriceE00100Db.Snapshot? _snapshot;
    private BuiPriceE00100Db.Seed? _seed;
    private string _expectedBody = "";

    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>
    /// Nền chung KHÔNG được tự mở 診療入力.
    ///
    /// <para><c>ModSave.GetTrnRs</c> gọi <c>Calc_BuiPriceData2s</c> ngay trong
    /// <c>frmInpMain_Load_Method</c> (frm203002.cs:423 → modSave.cs:2467) nên với dữ liệu
    /// đã seed thì E00100 bung ra GIỮA lúc màn hình đang mở. <c>MessageBox.Show</c> là
    /// đồng bộ ⇒ luồng UI của app đứng lại, <c>AppNavigator.WaitForTreatmentWindow</c> chờ
    /// hết 180 giây rồi ném. Fixture tự điều hướng và vét hộp thoại TRONG lúc chờ.</para>
    /// </summary>
    protected override bool NavigatesToTreatmentEntry => false;

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.BuiPrice.AllowSeed)
            return "chưa bật buiPrice.allowSeed. Nhóm này SỬA ĐĂNG KÝ BỆNH NHÂN " +
                   "(INSURANCE.PUBEXPINF_NO + một dòng PUBEXPINF) để 一部負担金 tính hỏng. " +
                   "Nó khôi phục theo ảnh chụp, nhưng đó là đường lui chứ không phải giấy phép — " +
                   "trỏ patient.patNo vào bệnh nhân TEST. Chạy: .\\run-calc-bui-price.ps1 -Seed";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString: ca 公費 hỏng không dựng được từ giao diện";

        return null;
    }

    /// <summary>
    /// Seed TRƯỚC khi app mở — <c>CommonInp.getCommonPatInfo</c> nạp <c>_patInfoList</c> ở
    /// màn CHỌN BỆNH NHÂN (frm203001.cs:739) rồi chỉ đọc lại mảng trong RAM.
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        _db = BuiPriceE00100Db.CreateOrNull(Settings);
        if (_db is null) return;

        _snapshot = _db.TakeSnapshot(PatNo, TrtDate);
        _seed = _db.SeedBrokenPubexp(BuiPriceE00100Db.SeedMode.LocalFlgMissing, PatNo,
                                     Settings.BuiPrice.MissingLflg,
                                     Settings.BuiPrice.SeedPubexpinfNo, TrtDate);
        TestContext.Out.WriteLine(_seed.Blocker is null
            ? $"ĐÃ SEED: 枝番 {_seed.PatBr}, pubexpinf_no {_seed.PubexpinfNo}, lflg 「{_seed.Lflg}」"
            : $"KHÔNG SEED ĐƯỢC: {_seed.Blocker}");
    }

    [OneTimeSetUp]
    public void SeedSetUp()
    {
        if (_seed?.Blocker is null && _db is not null)
            _expectedBody = BuiPriceE00100Db.ApplyTemplate(
                _db.MessageTemplate(),
                BuiPriceE00100Db.LocalFlgMissingBody(PatNo, _seed!.PatBr, TrtDate, _seed.Lflg));
    }

    [OneTimeTearDown]
    public void RestoreEverything()
    {
        if (_db is null || _snapshot is null) return;
        try { TestContext.Out.WriteLine("ĐÃ TRẢ LẠI — " + _db.Restore(_snapshot)); }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG TRẢ LẠI ĐƯỢC đăng ký bệnh nhân: {e.Message}. Gỡ tay:\n" +
                $"   DELETE FROM PUBEXPINF WHERE PAT_NO = {PatNo} AND PUBEXPINF_NO = {Settings.BuiPrice.SeedPubexpinfNo};");
            foreach (var i in _snapshot.Insurance)
                TestContext.Error.WriteLine(
                    $"   UPDATE INSURANCE SET PUBEXPINF_NO = {i.PubexpinfNo} " +
                    $"WHERE PAT_NO = {PatNo} AND PAT_BR = {i.PatBr};");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("TC-E00100-1 — F4 当日来患: E00100 ĐÚNG nguyên văn, ĐÚNG một nút OK, 1 件 1 ダイアログ")]
    public void TcE001001_TodayViewRaisesExactDialogPerRow()
    {
        RequireSeed();
        using var trace = TestTrace.Begin();

        var flow = new BuiPriceE00100Flow(App);
        var patSelect = OpenPatientSelectAtTestDate(trace);
        var expectedRows = _db!.TodayViewKeys(TrtDate);

        if (expectedRows.Count == 0)
            IgnoreWithReason($"ngày {TrtDate:yyyy-MM-dd} không có dòng 当日来患 nào để đo");

        flow.PressF4(patSelect, trace);
        var boxes = flow.Drain(TimeSpan.FromSeconds(60), rounds: 12, trace);

        // 「1 件 1 ダイアログ」: getTodayViewData gọi getBuiPrice2 cho TỪNG dòng
        // (frm203001.cs:921) và mỗi lượt hỏng là một MessageBox.Show. Gộp lại thì mất
        // luôn 患者番号/枝番 — đó là lý do bản web cũng giữ đúng độ hạt này.
        Assert.That(boxes, Has.Count.EqualTo(expectedRows.Count),
            $"ngày {TrtDate:yyyy-MM-dd} có {expectedRows.Count} dòng 当日来患 " +
            $"({string.Join(", ", expectedRows.Select(k => $"{k.PatNo}/{k.PatBr}"))}) " +
            $"nhưng thấy {boxes.Count} hộp E00100. Ít hơn là bị gộp, nhiều hơn là bị phát lại. " +
            "Đọc được: " + string.Join(" ⏎ ", boxes.Select(b => b.ToString())));

        var first = boxes[0];
        // So bằng RAW, KHÔNG phải Txt.N: Txt.N chạy NFKC (biến 全角スペース U+3000 thành
        // space thường) và đổi xuống dòng thành space, nên nó chỉ chứng minh 「các chữ
        // đúng thứ tự」. Hai chi tiết dễ mất nhất khi port lại đúng là hai thứ nó xoá.
        Assert.That(first.Raw, Is.EqualTo(_expectedBody.Replace("\r\n", "\n")),
            "thân E00100 lệch so với buiPrice.cs:1734-1737 ghép qua MsgDialog.getMsg " +
            "(MsgDialog.cs:184-213). Hai chi tiết dễ mất: dấu cách đầu dòng 2 là 全角 U+3000 " +
            "(không phải space thường), và 診療年月 dùng khuôn 「gggy年M月」 nên KHÔNG đệm 0.");

        // MessageBoxButtons.OK (MsgDialog.cs:35) — đúng MỘT nút, và nó giữ con trỏ.
        Assert.That(first.Buttons, Has.Count.EqualTo(1),
            $"E00100 phải có ĐÚNG một nút; đọc được [{string.Join(", ", first.Buttons)}]");
        Assert.That(first.Buttons[0], Is.EqualTo("OK"),
            "MsgDialog.ShowErrorMsg dùng MessageBoxButtons.OK (MsgDialog.cs:35)");
        Assert.That(first.DefaultButton, Is.EqualTo("OK"),
            "nút OK phải là nút MẶC ĐỊNH — bấm Enter theo phản xạ không được rơi vào đâu khác");

        Assert.That(flow.OpenDialogs(), Is.Empty,
            "vét xong mà vẫn còn MessageBox đang chắn: " +
            string.Join(" | ", flow.OpenDialogs().Select(d => d.ToString())));
    }

    [Test, Order(2)]
    [Description("TC-E00100-2 — 当日来患 GIỮ dòng bệnh nhân hỏng và vẫn cộng vào 合計 (khác 来患一覧)")]
    public void TcE001002_TodayViewKeepsTheFailingRow()
    {
        RequireSeed();
        using var trace = TestTrace.Begin();

        var flow = new BuiPriceE00100Flow(App);
        var patSelect = App.Windows().First(w => Txt.Same(Uia.AutomationIdOf(w), "frm203001"));
        var expectedRows = _db!.TodayViewKeys(TrtDate);

        if (expectedRows.Count == 0) IgnoreWithReason($"ngày {TrtDate:yyyy-MM-dd} không có 当日来患");

        var rows = flow.TodayRows(patSelect);
        trace.Shot("tc-e00100-2-luoi-当日来患");

        // ĐÂY là quyết định parity: frm203001.getTodayViewData GÁN price2.insScore /
        // insCopayment vào chính dòng đó rồi cộng vào total (frm203001.cs:921-932) —
        // dòng Ở LẠI. frm204008 (来患一覧) mới là chỗ LOẠI dòng (frm204008.cs:711-733).
        Assert.That(rows, Has.Count.EqualTo(expectedRows.Count),
            $"dòng bị LOẠI khỏi 当日来患 sau E00100: còn {rows.Count}/{expectedRows.Count}. " +
            "WinForm giữ dòng và ghi số vào đó (frm203001.cs:921-932) — đừng nhầm với " +
            "frm204008 来患一覧 vốn loại dòng.");

        var total = flow.TodayTotalRow(patSelect);
        Assert.That(total, Is.Not.Empty,
            "không đọc được lưới 合計 (dgvTotal) — nó chỉ Visible ở chế độ 当日来患 " +
            "(frm203001.cs:948-960), nên rỗng nghĩa là F4 chưa chạy hoặc đã rời chế độ");

        var joined = string.Join(" | ", total);
        Assert.That(joined, Does.Contain($"{expectedRows.Count}人"),
            $"dòng 合計 phải đếm đủ {expectedRows.Count} người kể cả dòng tính hỏng " +
            $"(frm203001.cs:928-931 cộng total[0]/total[1] cho MỌI dòng). Đọc được: {joined}");
    }

    [Test, Order(3)]
    [Description("TC-E00100-3 — mở 診療入力: E00100 rồi màn hình VẪN SỐNG, 日計 vẫn đúng")]
    public void TcE001003_TreatmentEntrySurvivesTheDialog()
    {
        RequireSeed();
        using var trace = TestTrace.Begin();

        var flow = new BuiPriceE00100Flow(App);
        var patSelect = App.Windows().First(w => Txt.Same(Uia.AutomationIdOf(w), "frm203001"));

        ConfirmPatient(patSelect, trace);

        // Vét TRONG lúc chờ cửa sổ: cửa sổ chỉ hiện ra sau khi hộp thoại được bấm.
        var boxes = flow.Drain(TimeSpan.FromSeconds(60), rounds: 12, trace);

        // Calc_BuiPriceData2s lặp theo 枝番 (modAcc.cs:77) ⇒ mỗi 枝番 có 処置 trong tháng
        // là một lượt getBuiPrice2, tức một hộp thoại.
        var branches = _db!.ReadInsurance(PatNo).Count;
        Assert.That(boxes, Is.Not.Empty,
            "mở 診療入力 với 公費 hỏng mà KHÔNG có E00100 nào. Thường là seed không tới " +
            $"được app: kiểm INSURANCE.PUBEXPINF_NO của bệnh nhân {PatNo} (PatInfoList.cs:678).");
        Assert.That(boxes, Has.Count.LessThanOrEqualTo(branches),
            $"thấy {boxes.Count} hộp E00100 nhưng bệnh nhân chỉ có {branches} 枝番 — " +
            "Calc_BuiPriceData2s chạy MỘT lượt getBuiPrice2 cho mỗi 枝番 (modAcc.cs:77-95). " +
            "Nhiều hơn nghĩa là màn hình gọi lại nhiều lần.");
        Assert.That(boxes[0].Raw, Is.EqualTo(_expectedBody.Replace("\r\n", "\n")),
            "thân E00100 ở màn 診療入力 phải giống hệt ở 当日来患 — cùng một chỗ sinh ra " +
            "(buiPrice.cs:1734)");

        // Cái mà lỗi 500 của bản web đã phá: WinForm chỉ bật hộp thoại rồi vẽ tiếp.
        var window = Waits.TryFor(() => App.Window("frm203002"), TimeSpan.FromSeconds(60));
        Assert.That(window, Is.Not.Null,
            "E00100 xong mà 診療入力 KHÔNG mở. getBuiPrice2 chỉ hiện hộp thoại rồi trả " +
            "quyền điều khiển cho nơi gọi (buiPrice.cs:196-203) — không nơi nào bỏ dở màn hình. " +
            "Cửa sổ đang mở: " + string.Join(" | ", App.Windows().Select(w => Uia.AutomationIdOf(w))));

        var screen = new TreatmentEntryScreen(window!, App.Automation);
        screen.WaitUntilReady();
        trace.Shot("tc-e00100-3-luoi-sau-hop-thoai");

        Assert.That(new TreatmentGridOps(screen).RowCount(), Is.GreaterThan(0),
            "lưới 処置 rỗng sau E00100 — màn hình mở nhưng không dựng được dữ liệu");

        // Nhánh 福祉医療設定 KHÔNG ném: app vá localFlg mặc định (buiPrice.cs:1866-1872)
        // rồi TÍNH TIẾP BÌNH THƯỜNG. Nên 日計 vẫn phải khớp oracle — số KHÔNG về 0.
        // (Nhánh ngoại lệ mới là nhánh trả buiPriceData2 toàn 0; xem README mục 6.1.)
        BuiPriceE00100CleanTests.AssertDailyTotalsMatchOracle(
            new AccountingDayFlow(App, screen), "TC-E00100-3");
    }

    // ─────────────────────────────────────────────────────────────────────────

    private void RequireSeed()
    {
        if (_db is null) IgnoreWithReason($"không đọc được DB — {DbUnavailableReason}");
        if (_seed?.Blocker is not null) IgnoreWithReason("không seed được: " + _seed.Blocker);
    }

    private Window OpenPatientSelectAtTestDate(TestTrace trace)
    {
        var patSelect = AppNavigator.OpenPatientSelect(App, Settings);
        AppNavigator.SetTreatmentDate(patSelect, TrtDate);
        trace.Shot("da-dat-ngay-dieu-tri");
        return patSelect;
    }

    /// <summary>
    /// Gõ 患者番号 rồi F8 閲覧/変更 — bản sao của <c>AppNavigator.EnterPatient</c> (private ở đó).
    ///
    /// <para>F8 chứ không Enter: <c>openMode = update</c> ít hộp thoại hơn hẳn nhánh
    /// 初再診入力, và fixture này đang đo E00100 chứ không đo 患者確定.</para>
    /// </summary>
    private void ConfirmPatient(Window patSelect, TestTrace trace)
    {
        var combo = Waits.For(() => Uia.ById(patSelect, TestSettings.Current.Locator("patSelPatNo")),
                              "ô 患者番号 「cboPatNo」");
        Uia.SetText(Uia.EditInside(combo), Settings.Patient.PatNo);
        Waits.Step();
        trace.Step($"bam F8 閲覧/変更 cho benh nhan {Settings.Patient.PatNo}");
        Keyboard.Press(VirtualKeyShort.F8);
        Waits.Step();
    }
}
