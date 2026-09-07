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

// ═════════════════════════════════════════════════════════════════════════════

/// <summary>
/// <b>Nhánh NGOẠI LỆ — đúng hộp E00100 mà spec Playwright mô phỏng.</b>
///
/// <para>Khác hẳn <see cref="BuiPriceE00100SeedTests"/>: nhánh 福祉医療設定 không ném nên
/// số trên màn hình không đổi. Nhánh này ném thật, ở buiPrice.cs:334 — TRƯỚC
/// <c>_rtnData.insPayDatas = payDatas</c> (:649) — nên <c>buiPriceData2</c> trả về giữ
/// nguyên giá trị khởi tạo <b>toàn 0</b>. Đó mới là cảnh 「màn hình sống với số 0」.</para>
///
/// <para>Đường tới nó là một <b>lỗi thật của WinForm</b>: buiPrice.cs:997-998 kiểm
/// <c>PublicExpenseNumber.Length == 8</c> rồi gọi <c>BeneficiaryNumber.Substring(0, 2)</c>
/// — hai field khác nhau. Stack trace đọc được lúc chạy chốt đúng dòng đó.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐIỂM LỆCH LỚN NHẤT CỦA CẢ LUỒNG: F8 会計 KHÔNG SANG 窓口精算
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>LetAccData2</c> bọc cả thân trong một <c>try/catch</c> và nhánh catch chỉ hiện
/// <b>E99999 「システムエラーです。」</b> (modAcc.cs:789-791). Ngoại lệ xảy ra TRƯỚC
/// <c>functionReturnValue = true</c> (:783) nên hàm trả <b>false</b>, và
/// <c>IDM_Acc_Click</c> có <c>if (AccRet == false) { }</c> — <b>khối RỖNG</b>
/// (frm203002.cs:7727-7729). Màn hình đứng im.
///
/// <para>Đo được 2026-09-07, ba lượt chạy tách bạch:</para>
/// <code>
///                        E00100  日計          F8 hộp [3]      F8 hộp [4]        窓口精算
/// dữ liệu sạch             0     339/70/272   既に…作成       …計上しますか      ✓
/// ĐỐI CHỨNG ins_kbn 2/4    0     339/70/272   既に…作成       …計上しますか      ✓
/// nhánh NGOẠI LỆ           1     0/0/0        E00100          システムエラーです  ✗
/// </code>
/// Lượt ĐỐI CHỨNG đổi ĐÚNG hai cột 保険 mà seed này buộc phải đổi nhưng KHÔNG chèn 公費,
/// nên nó loại trừ giả thuyết 「system error là do <c>INS_KBN</c>」.
///
/// <para><b>Bản web đang làm ngược:</b> <c>announceBuiPriceWarnings(...)</c> rồi
/// <c>return true</c> ⇒ VẪN sang 窓口精算. Chú thích của
/// <c>bui-price-e00100-parity.spec.ts</c> (TC-E00100-5) viết 「WinForm thì đi tiếp」 —
/// đo thật thì KHÔNG.</para>
///
/// <para>⚠️ GHI DB, ba chỗ, đều khôi phục theo ảnh chụp: <c>INSURANCE</c>
/// (PUBEXPINF_NO + INS_KBN + OLD_FLG), một dòng <c>PUBEXPINF</c>, và <c>UNPAID</c> của
/// ngày test. Chạy: <c>.\run-calc-bui-price.ps1 -Exception</c></para>
/// </summary>
[TestFixture]
[Category("bui-price-e00100")]
public sealed class BuiPriceE00100ExceptionTests : UiTestBase
{
    private BuiPriceE00100Db? _db;
    private BuiPriceE00100Db.Snapshot? _snapshot;
    private BuiPriceE00100Db.Seed? _seed;
    private string _prefix = "";

    protected override string[] NuisanceDialogPatterns => [];
    protected override bool NavigatesToTreatmentEntry => false;

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.BuiPrice.AllowSeed)
            return "chưa bật buiPrice.allowSeed. Nhóm này SỬA ĐĂNG KÝ BỆNH NHÂN " +
                   "(INSURANCE.PUBEXPINF_NO + INS_KBN + OLD_FLG, và một dòng PUBEXPINF). " +
                   "Chạy: .\\run-calc-bui-price.ps1 -Exception";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString";

        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        _db = BuiPriceE00100Db.CreateOrNull(Settings);
        if (_db is null) return;

        _snapshot = _db.TakeSnapshot(PatNo, TrtDate);
        _seed = _db.SeedBrokenPubexp(BuiPriceE00100Db.SeedMode.CalcException, PatNo,
                                     Settings.BuiPrice.MissingLflg,
                                     Settings.BuiPrice.SeedPubexpinfNo, TrtDate);
        TestContext.Out.WriteLine(_seed.Blocker is null
            ? $"ĐÃ SEED (CalcException): 枝番 {_seed.PatBr}, ins_kbn→2, old_flg→4, 受給者番号 RỖNG"
            : $"KHÔNG SEED ĐƯỢC: {_seed.Blocker}");
    }

    [OneTimeSetUp]
    public void ExceptionSetUp()
    {
        if (_seed?.Blocker is null && _seed is not null)
            _prefix = BuiPriceE00100Db.CalcFailedPrefix(PatNo, _seed.PatBr, TrtDate)
                                      .Replace("\r\n", "\n");
    }

    [OneTimeTearDown]
    public void RestoreEverything()
    {
        if (_db is null || _snapshot is null) return;

        try { TestContext.Out.WriteLine("ĐÃ TRẢ LẠI — " + _db.Restore(_snapshot)); }
        catch (Exception e)
        {
            TestContext.Error.WriteLine($"!! KHÔNG TRẢ LẠI ĐƯỢC INSURANCE/PUBEXPINF: {e.Message}");
            foreach (var i in _snapshot.Insurance)
                TestContext.Error.WriteLine(
                    $"   UPDATE INSURANCE SET PUBEXPINF_NO = {i.PubexpinfNo}, INS_KBN = {i.InsKbn}, " +
                    $"OLD_FLG = {i.OldFlg} WHERE PAT_NO = {PatNo} AND PAT_BR = {i.PatBr};");
        }

        try { TestContext.Out.WriteLine("ĐÃ TRẢ LẠI — " + _db.RestoreUnpaidForDay(PatNo, TrtDate, _snapshot.Unpaid)); }
        catch (Exception e) { TestContext.Error.WriteLine($"!! KHÔNG TRẢ LẠI ĐƯỢC UNPAID: {e.Message}"); }
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("TC-E00100-4 — 当日来患: E00100 kèm 内容[]/場所[], dòng Ở LẠI với 保険点数 = 0")]
    public void TcE001004_TodayViewKeepsRowWithZeroScore()
    {
        RequireSeed();
        using var trace = TestTrace.Begin();

        var flow = new BuiPriceE00100Flow(App);
        var patSelect = AppNavigator.OpenPatientSelect(App, Settings);
        AppNavigator.SetTreatmentDate(patSelect, TrtDate);

        var expectedRows = _db!.TodayViewKeys(TrtDate);
        if (expectedRows.Count == 0) IgnoreWithReason($"ngày {TrtDate:yyyy-MM-dd} không có 当日来患");

        flow.PressF4(patSelect, trace);
        var boxes = flow.Drain(TimeSpan.FromSeconds(60), rounds: 12, trace);

        Assert.That(boxes, Has.Count.EqualTo(expectedRows.Count),
            $"「1 件 1 ダイアログ」: {expectedRows.Count} dòng 当日来患 phải ra {expectedRows.Count} hộp, " +
            $"đang ra {boxes.Count}");

        var first = boxes[0];
        // So RAW chứ không phải Txt.N — xem chú thích của Box.Raw.
        Assert.That(first.Raw, Does.StartWith(_prefix),
            "hai dòng đầu của E00100 lệch so với buiPrice.cs:197-201. Dấu cách đầu dòng 2 " +
            "là 全角 U+3000, và 診療年月 dùng khuôn 「gggy年M月」 nên KHÔNG đệm 0.");

        // ĐIỂM LỆCH ĐÃ CHỐT với bản web: WinForm in CẢ ex.Message lẫn ex.StackTrace ra
        // hộp thoại. Bản web giữ 内容[] sau cờ ApiErrorOptions.VerboseMessages nhưng CỐ Ý
        // bỏ hẳn 場所[] — stack trace không được gửi ra trình duyệt (parity-notes mục
        // 「意図的に WinForm と変えた点」 §1). Testcase này khoá phía WinForm để điểm lệch
        // đó luôn là một quyết định, không phải một chỗ port sót.
        Assert.That(first.Raw, Does.Contain("内容["),
            "WinForm PHẢI in 内容[ex.Message] (buiPrice.cs:200)");
        Assert.That(first.Raw, Does.Contain("場所["),
            "WinForm PHẢI in 場所[ex.StackTrace] (buiPrice.cs:200) — đây là điểm mà bản web " +
            "CỐ Ý bỏ. Không còn nghĩa là ai đó đã 'dọn dẹp' WinForm, và khi đó điểm lệch " +
            "không còn là quyết định nữa.");

        var rows = flow.TodayRows(patSelect);
        trace.Shot("tc-e00100-4-luoi-当日来患");
        Assert.That(rows, Has.Count.EqualTo(expectedRows.Count),
            "dòng bị LOẠI khỏi 当日来患 sau E00100. frm203001.cs:921-932 GÁN price2.insScore " +
            "vào chính dòng đó rồi cộng vào 合計 ⇒ dòng Ở LẠI. frm204008 来患一覧 mới là chỗ " +
            "loại dòng — đừng port chung một xử lý cho hai màn.");

        // Cột 5 (0-based 4) của _patInfoViewItem là ins_score (frm203001.cs:939).
        // Ngoại lệ ném TRƯỚC :649 nên insPayDatas rỗng ⇒ insScore = 0.
        Assert.That(rows[0].Cells.Count, Is.GreaterThan(4),
            $"dòng 当日来患 chỉ đọc được {rows[0].Cells.Count} ô: {rows[0]}");
        Assert.That(Txt.Int(rows[0].Cells[4]), Is.EqualTo(0),
            $"保険点数 của dòng hỏng phải là 0 (getBuiPrice2 trả buiPriceData2 khởi tạo, " +
            $"buiPrice.cs:161-165), đang là 「{rows[0].Cells[4]}」. Đọc được cả dòng: {rows[0]}");
    }

    [Test, Order(2)]
    [Description("TC-E00100-1 — 診療入力 VẪN SỐNG sau E00100, và 日計 về 0")]
    public void TcE001001_TreatmentEntrySurvivesWithZeroTotals()
    {
        RequireSeed();
        using var trace = TestTrace.Begin();

        var flow = new BuiPriceE00100Flow(App);
        var patSelect = App.Windows().First(w => Txt.Same(Uia.AutomationIdOf(w), "frm203001"));

        var combo = Waits.For(() => Uia.ById(patSelect, TestSettings.Current.Locator("patSelPatNo")),
                              "ô 患者番号 「cboPatNo」");
        Uia.SetText(Uia.EditInside(combo), Settings.Patient.PatNo);
        Waits.Step();
        trace.Step($"bam F8 閲覧/変更 cho benh nhan {Settings.Patient.PatNo}");
        Keyboard.Press(VirtualKeyShort.F8);

        var boxes = flow.Drain(TimeSpan.FromSeconds(60), rounds: 12, trace);
        Assert.That(boxes, Is.Not.Empty, "mở 診療入力 với dữ liệu hỏng mà không có E00100 nào");
        Assert.That(boxes[0].Raw, Does.StartWith(_prefix), "E00100 ở 診療入力 phải cùng thân với ở 当日来患");
        Assert.That(boxes[0].Buttons, Is.EqualTo(new[] { "OK" }),
            "MsgDialog.ShowErrorMsg dùng MessageBoxButtons.OK (MsgDialog.cs:35)");

        var window = Waits.TryFor(() => App.Window("frm203002"), TimeSpan.FromSeconds(60));
        Assert.That(window, Is.Not.Null,
            "E00100 xong mà 診療入力 KHÔNG mở. getBuiPrice2 chỉ hiện hộp thoại rồi trả quyền " +
            "điều khiển cho nơi gọi (buiPrice.cs:196-203) — KHÔNG nơi nào bỏ dở màn hình.");

        var screen = new TreatmentEntryScreen(window!, App.Automation);
        screen.WaitUntilReady();
        var grid = new TreatmentGridOps(screen);
        trace.Shot("tc-e00100-1-luoi-sau-hop-thoai");

        Assert.That(grid.RowCount(), Is.GreaterThan(0), "lưới 処置 rỗng — màn hình mở nhưng không dựng được dữ liệu");

        // ĐÂY là vế mà nhánh 福祉医療設定 KHÔNG đo được: ngoại lệ ném ở buiPrice.cs:334,
        // TRƯỚC _rtnData.insPayDatas = payDatas (:649), nên DispDayPoint không tìm thấy
        // payData nào và vẽ 「[負担金 0円]  [日計 0点]」 cho MỌI ngày (modAcc.cs:190-198).
        var totals = new AccountingDayFlow(App, screen).DailyTotals();
        Assert.That(totals, Is.Not.Empty, "lưới không có dòng 【日計】 nào");
        Assert.That(totals.Select(t => t.Point), Is.All.EqualTo(0),
            "日計 phải về 0 ở MỌI ngày sau ngoại lệ — đọc được: " + string.Join(" · ", totals) +
            ". Còn số thật nghĩa là ngoại lệ không xảy ra (seed không tới được app) hoặc " +
            "nó ném ở chỗ khác, SAU khi insPayDatas đã được gán (buiPrice.cs:649).");
        Assert.That(Txt.Int(grid.Days()), Is.EqualTo(0),
            $"実日数 phải là 0 (Calc_MDPoint cộng insDays của _buiPriceData2s, modAcc.cs:106-118); " +
            $"đọc được 「{grid.Days()}」");
    }

    [Test, Order(3)]
    [Description("TC-E00100-5 — LỆCH: F8 chết ở E99999 và KHÔNG sang 窓口精算 (bản web thì sang)")]
    public void TcE001005_AccountingDiesWithSystemErrorAndStaysPut()
    {
        RequireSeed();
        if (!Settings.Parity.AllowSave)
            IgnoreWithReason(
                "cần parity.allowSave: chuỗi F8 đi qua UnPaid.deleteTrtDtUnPaid (modAcc.cs:427), " +
                "chạy TRƯỚC mọi cổng hộp thoại nên dòng 未精算 của ngày test bay bất kể sau đó " +
                "trả lời gì. Fixture chụp ảnh UNPAID và đặt lại, nhưng đó là đường lui chứ " +
                "không phải giấy phép.");

        using var trace = TestTrace.Begin();
        var window = App.Window("frm203002");
        if (window is null) Assert.Fail("chưa ở màn 診療入力 — TC-E00100-1 phải chạy trước (Order)");

        var screen = new TreatmentEntryScreen(window!, App.Automation);
        var day = new AccountingDayFlow(App, screen);

        // F8 会計 chạy theo ngày của DÒNG CON TRỎ (modAcc.cs:415), không theo ngày mở màn
        // hình — bẫy đã ghi ở README chung mục 8b.
        var row = day.RowForDay(TrtDate.Day);
        if (row is null)
            IgnoreWithReason($"lưới không có dòng 日 = {TrtDate.Day}; đọc được: " +
                             string.Join(", ", day.DaysOnGrid()));
        day.FocusRow(row!, trace);

        var walk = new BuiPriceE00100Flow(App).PressF8AndWalk(App, screen.Window, rounds: 10, trace);
        TestContext.Out.WriteLine($"=== KQ-F8 === chuỗi ({walk.Trail.Count} hộp thoại), " +
                                  $"E00100 = {walk.E00100Count}, 窓口精算 = {walk.ReachedCounterPayment}");
        foreach (var a in walk.Trail) TestContext.Out.WriteLine("        " + a);

        Assert.That(walk.E00100Count, Is.GreaterThan(0),
            "chuỗi F8 không hiện E00100 nào. LetAccData2 gọi Calc_BuiPriceData2s ở " +
            "modAcc.cs:403 nên nó PHẢI bật lại. Chuỗi đọc được ở trên.");

        Assert.That(walk.Trail.Any(a => Txt.Has(a.Text, "システムエラー")), Is.True,
            "chuỗi F8 không kết thúc bằng 「システムエラーです。」. Đo được 2026-09-07: sau E00100, " +
            "một ngoại lệ nữa rơi vào catch-all của LetAccData2 (modAcc.cs:789-791) — nhánh đó " +
            "chỉ hiện E99999 và KHÔNG đặt functionReturnValue = true (:783). Chuỗi đọc được ở trên.");

        // ĐIỂM LỆCH với bản web. IDM_Acc_Click: `if (AccRet == false) { }` — khối RỖNG
        // (frm203002.cs:7727-7729) ⇒ màn hình đứng im. Bản web thì
        // announceBuiPriceWarnings(...) rồi return true ⇒ VẪN sang 窓口精算.
        Assert.That(walk.ReachedCounterPayment, Is.False,
            "F8 SANG ĐƯỢC 窓口精算 sau khi 一部負担金 ném — trái với đo thật 2026-09-07. " +
            "Nếu đây là hành vi mới thì điểm lệch đã ghi ở README mục 2 không còn đúng, " +
            "và phải sửa README + báo lại cho bên port trước khi sửa testcase.");
        Assert.That(App.Window("frm203002"), Is.Not.Null,
            "診療入力 phải VẪN MỞ: LetAccData2 trả false và nhánh false của IDM_Acc_Click là " +
            "khối rỗng (frm203002.cs:7727-7729)");
        trace.Shot("tc-e00100-5-sau-chuoi-f8");
    }

    // ─────────────────────────────────────────────────────────────────────────

    private void RequireSeed()
    {
        if (_db is null) IgnoreWithReason($"không đọc được DB — {DbUnavailableReason}");
        if (_seed?.Blocker is not null) IgnoreWithReason("không seed được: " + _seed.Blocker);
    }
}
