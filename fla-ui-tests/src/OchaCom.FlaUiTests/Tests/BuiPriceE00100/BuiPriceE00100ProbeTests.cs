using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;

namespace OchaCom.FlaUiTests.Tests.BuiPriceE00100;

/// <summary>
/// PROBE — dò hành vi THẬT của E00100, <b>KHÔNG assert</b>, không bao giờ ném.
/// <c>[Explicit]</c> nên lượt chạy đủ không gọi tới.
///
/// <para>Đúng luật <c>PROBE-GUIDELINE.md</c>: chưa biết app hành xử ra sao thì chụp ảnh →
/// đọc → rồi mới viết assert. Ở đây có ĐÚNG bốn thứ chưa ai đo, và cả bốn đều làm hỏng
/// testcase nếu đoán sai:</para>
/// <list type="number">
/// <item><b>Nguyên văn hộp thoại.</b> <c>MsgDialog.getMsg</c> ghép khuôn từ bảng
///   <c>MSGTBL</c> rồi mới <c>MessageBox.Show</c> (MsgDialog.cs:184-213). Khuôn đo được
///   trên DB demo đúng bằng <c>{0}</c> ⇒ thân đi qua nguyên vẹn — nhưng đó là DỮ LIỆU,
///   máy khác có thể khác, nên phải đọc chứ không viết cứng.</item>
/// <item><b>Bao nhiêu hộp cho một lần mở màn.</b> <c>ModSave.GetTrnRs</c> gọi
///   <c>Calc_BuiPriceData2s</c> (modSave.cs:2467) vốn lặp theo 枝番 (modAcc.cs:77);
///   nhưng không rõ một lần mở 診療入力 chạy qua đó mấy lượt.</item>
/// <item><b>Màn hình có sống tiếp không.</b> Đây là chính điều mà lỗi 500 của bản web đã
///   phá. WinForm chỉ bật hộp thoại rồi trả <c>buiPriceData2</c> toàn 0
///   (buiPrice.cs:196-203) — cần thấy tận mắt lưới + 日計 sau khi bấm OK.</item>
/// <item><b>当日来患 giữ hay loại dòng hỏng.</b> <c>frm203001.getTodayViewData</c> GÁN
///   <c>price2.insScore</c> vào chính dòng đó rồi cộng vào 合計 (frm203001.cs:921-932) —
///   tức là GIỮ dòng với số 0, ngược hẳn <c>frm204008</c> vốn loại dòng. Chưa ai nhìn
///   thấy điều đó chạy thật.</item>
/// </list>
///
/// <para>Chạy: <c>.\run-calc-bui-price.ps1 -Diagnostics</c> (sạch) ·
/// <c>.\run-calc-bui-price.ps1 -Diagnostics -Seed</c> (có seed).</para>
/// </summary>
[TestFixture]
[Category("bui-price-e00100")]
[Explicit("PROBE — chạy tay, không assert")]
public sealed class BuiPriceE00100CleanProbeTests : UiTestBase
{
    private BuiPriceE00100Db? _db;

    /// <summary>
    /// Tắt watcher. Nó tự bấm 「いいえ」 cho những câu khai trong <c>run.nuisanceDialogs</c>,
    /// và probe này đang ĐO CHÍNH các hộp thoại — để watcher trả lời hộ thì probe kết luận
    /// 「app không hỏi」 trong khi app có hỏi (bẫy ghi ở đầu <see cref="UiTestBase"/>).
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void CleanProbeSetUp() => _db = BuiPriceE00100Db.CreateOrNull(Settings);

    [Test]
    [Description("PROBE SẠCH — dữ liệu thật có sinh E00100 không, và 日計 đang ra số gì")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();
        var flow = new BuiPriceE00100Flow(App);
        var day = new AccountingDayFlow(App, Screen);

        // ── KQ-1: khuôn câu trong MSGTBL ─────────────────────────────────────
        // MsgDialog.getMsg: khuôn có {0} thì THAY, không có thì NỐI vào sau, không có
        // dòng nào thì trả nguyên thân (MsgDialog.cs:184-213). Ba nhánh, ba kết quả khác
        // nhau — đọc ra rồi mới dựng được kỳ vọng.
        Say(() =>
        {
            var tpl = _db?.MessageTemplate();
            Kq(1, tpl is null
                ? "MSGTBL không có dòng E00100 (hoặc không đọc được DB) ⇒ getMsg trả nguyên thân"
                : $"MSGTBL['E00100'] = 「{tpl}」 " +
                  (tpl.Contains("{0}", StringComparison.Ordinal)
                      ? "(có {0} ⇒ thân thay vào, KHÔNG có tiền tố)"
                      : "(KHÔNG có {0} ⇒ thân bị NỐI vào SAU khuôn)"));
        });

        // ── KQ-2: bối cảnh bệnh nhân — quyết định seed có tác dụng hay không ─
        Say(() =>
        {
            if (_db is null) { Kq(2, $"không đọc được DB — {DbUnavailableReason}"); return; }

            var ins = _db.ReadInsurance(PatNo);
            var pub = _db.ReadPubexp(PatNo);
            Kq(2, $"bệnh nhân {PatNo}: {ins.Count} dòng INSURANCE, {pub.Count} dòng PUBEXPINF");
            foreach (var i in ins) Kq(2, "        INSURANCE  " + i);
            foreach (var p in pub) Kq(2, "        PUBEXPINF  " + p);
            Kq(2, ins.All(i => i.PubexpinfNo == 0)
                ? "        ⇒ MỌI 枝番 để pubexpinf_no = 0: PatInfoList.cs:678 BỎ HẲN dòng 公費, " +
                  "nên seed BẮT BUỘC phải UPDATE cột này, không chỉ INSERT PUBEXPINF"
                : "        ⇒ đã có 枝番 mang pubexpinf_no khác 0");
        });

        // ── KQ-3: mã 福祉医療 định seed có thật sự vắng mặt không ────────────
        Say(() =>
        {
            if (_db is null) return;
            var lflg = Settings.BuiPrice.MissingLflg;
            var n = _db.CountLocalFlg(lflg);
            Kq(3, $"LOCALFLG có {n} dòng mang insurer_no = 「{lflg}」 — " +
                  (n == 0 ? "OK, getLocalFlg sẽ trả null ⇒ E00100 bật"
                          : "MÃ NÀY CÓ THẬT ⇒ seed sẽ KHÔNG bật E00100, đổi buiPrice.missingLflg"));
        });

        // ── KQ-4: ngày test có mấy bệnh nhân (= mấy lượt getBuiPrice2 ở F4) ──
        Say(() =>
        {
            if (_db is null) return;
            var pats = _db.PatientsTreatedOn(TrtDate);
            Kq(4, $"ngày {TrtDate:yyyy-MM-dd} có {pats.Count} bệnh nhân có 処置: " +
                  string.Join(", ", pats.Select(p => $"{p.PatNo}({p.Rows} dòng)")) +
                  " — frm203001.getTodayViewData gọi getBuiPrice2 cho TỪNG dòng (frm203001.cs:921)");
        });

        // ── KQ-5: dữ liệu THẬT có bật E00100 nào không ───────────────────────
        // Màn 診療入力 đã mở xong ở OneTimeSetUp, tức là đã đi qua ModSave.GetTrnRs →
        // Calc_BuiPriceData2s (modSave.cs:2467). Còn hộp nào đang mở nghĩa là dữ liệu
        // thật ĐANG hỏng — và khi đó mọi mốc 「sạch」 bên dưới đều vô nghĩa.
        Say(() =>
        {
            var open = flow.OpenDialogs();
            Kq(5, open.Count == 0
                ? "sau khi mở 診療入力: KHÔNG có MessageBox nào ⇒ dữ liệu thật SẠCH"
                : $"sau khi mở 診療入力 còn {open.Count} MessageBox: " +
                  string.Join(" | ", open.Select(d => d.ToString())));
            trace.Shot("kq5-sau-khi-mo-man-hinh");
        });

        // ── KQ-6: 日計 và 合計 lúc SẠCH — mốc để so với lượt có seed ─────────
        Say(() =>
        {
            var totals = day.DailyTotals();
            Kq(6, $"日計 đọc được ({totals.Count} dòng): " +
                  (totals.Count == 0 ? "KHÔNG CÓ DÒNG NÀO" : string.Join(" · ", totals)));
            Kq(6, $"合計点数 lbAllPoint = 「{new TreatmentGrid.TreatmentGridOps(Screen).AllPoint()}」 " +
                  $"実日数 lbDays = 「{new TreatmentGrid.TreatmentGridOps(Screen).Days()}」");
            trace.Shot("kq6-nhat-ke-luoi-sach");
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Chạy một bước probe và NUỐT mọi ngoại lệ — một lượt phải ra đủ bức tranh.</summary>
    internal static void Say(Action step)
    {
        try { step(); }
        catch (Exception e) { TestContext.Out.WriteLine($"        !! bước probe ném: {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>Dòng kết quả — runner lọc theo tiền tố này ra file <c>*-KQ.txt</c>.</summary>
    internal static void Kq(int no, string what) => TestContext.Out.WriteLine($"=== KQ-{no} === {what}");
}

/// <summary>
/// PROBE CÓ SEED — dựng một ca 公費 hỏng rồi nhìn WinForm xử sự.
///
/// <para>⚠️ GHI DB: <c>INSURANCE.PUBEXPINF_NO</c> + một dòng <c>PUBEXPINF</c> của bệnh
/// nhân test. Chụp ảnh ở <c>PrepareDataBeforeApp</c>, trả lại ở <c>OneTimeTearDown</c>.
/// Nằm sau <c>buiPrice.allowSeed</c>. Xem <see cref="BuiPriceE00100Db"/> để biết vì sao
/// PHẢI seed (ba đường phá dữ liệu khác đều chết vì kiểu cột).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG ĐỂ NỀN CHUNG TỰ MỞ 診療入力
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>ModSave.GetTrnRs</c> gọi <c>Calc_BuiPriceData2s</c> ngay trong
/// <c>frmInpMain_Load_Method</c> (frm203002.cs:423 → modSave.cs:2467), nên với dữ liệu đã
/// seed thì <b>E00100 bung ra GIỮA lúc màn hình đang mở</b>. <c>MessageBox.Show</c> là
/// đồng bộ ⇒ luồng UI của app đứng lại ở đó, <c>AppNavigator.WaitForTreatmentWindow</c>
/// chờ hết 180 giây rồi ném. Vì thế fixture này tự điều hướng
/// (<c>NavigatesToTreatmentEntry = false</c>) và vét hộp thoại TRONG lúc chờ cửa sổ.
///
/// <para>Và tuyệt đối KHÔNG nhét câu E00100 vào <c>run.nuisanceDialogs</c> để watcher bấm
/// hộ: hộp thoại chính là thứ đang đo, bị trả lời mất thì probe không thấy gì mà cũng
/// không đỏ.</para>
/// </summary>
[TestFixture]
[Category("bui-price-e00100")]
[Explicit("PROBE + GHI DB — chạy tay")]
public sealed class BuiPriceE00100SeedProbeTests : UiTestBase
{
    private BuiPriceE00100Db? _db;
    private BuiPriceE00100Db.Snapshot? _snapshot;
    private BuiPriceE00100Db.Seed? _seed;

    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>Fixture này đứng ở 患者選択 và tự đi tiếp — xem khối chú thích của lớp.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.BuiPrice.AllowSeed)
            return "chưa bật buiPrice.allowSeed. Probe này SỬA ĐĂNG KÝ BỆNH NHÂN " +
                   "(INSURANCE.PUBEXPINF_NO + một dòng PUBEXPINF) để 一部負担金 tính hỏng. " +
                   "Nó khôi phục theo ảnh chụp, nhưng đó là đường lui chứ không phải giấy phép — " +
                   "trỏ patient.patNo vào bệnh nhân TEST. Chạy: .\\run-calc-bui-price.ps1 -Diagnostics -Seed";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString: ca 公費 hỏng không dựng được từ giao diện, " +
                   "màn 患者登録 không cho nhập 福祉医療番号 không tồn tại";

        return null;
    }

    /// <summary>
    /// Seed TRƯỚC khi app mở.
    ///
    /// <para><c>CommonInp.getCommonPatInfo</c> nạp <c>_patInfoList</c> ở màn CHỌN BỆNH
    /// NHÂN (frm203001.cs:739) và từ đó chỉ đọc lại mảng trong RAM — vá DB sau khi app đã
    /// qua bước đó thì app không bao giờ thấy (bẫy đã ghi ở
    /// <c>UiTestBase.PrepareDataBeforeApp</c>).</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        _db = BuiPriceE00100Db.CreateOrNull(Settings);
        if (_db is null) return;

        _snapshot = _db.TakeSnapshot(PatNo, TrtDate);
        TestContext.Out.WriteLine(
            $"ảnh chụp bệnh nhân {PatNo}: {_snapshot.Insurance.Count} dòng INSURANCE, " +
            $"{_snapshot.Pubexp.Count} dòng PUBEXPINF");
        foreach (var i in _snapshot.Insurance) TestContext.Out.WriteLine("        " + i);
        foreach (var p in _snapshot.Pubexp) TestContext.Out.WriteLine("        " + p);

        _seed = _db.SeedBrokenPubexp(BuiPriceE00100Db.SeedMode.LocalFlgMissing, PatNo,
                                     Settings.BuiPrice.MissingLflg,
                                     Settings.BuiPrice.SeedPubexpinfNo,
                                     TrtDate);
        TestContext.Out.WriteLine(_seed.Blocker is null
            ? $"ĐÃ SEED: 枝番 {_seed.PatBr}, pubexpinf_no {_seed.PubexpinfNo}, lflg 「{_seed.Lflg}」, " +
              $"hiệu lực {_seed.Qualification:yyyy-MM-dd} → {_seed.Expiry:yyyy-MM-dd}"
            : $"KHÔNG SEED ĐƯỢC: {_seed.Blocker}");
    }

    [OneTimeTearDown]
    public void RestoreEverything()
    {
        if (_db is null || _snapshot is null) return;
        try
        {
            TestContext.Out.WriteLine("ĐÃ TRẢ LẠI — " + _db.Restore(_snapshot));
        }
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

    [Test]
    [Description("PROBE SEED — E00100 nguyên văn, 当日来患 giữ dòng chứ, 診療入力 sống chứ")]
    public void Tc0_Probe()
    {
        if (_seed?.Blocker is not null)
        {
            BuiPriceE00100CleanProbeTests.Kq(10, "KHÔNG SEED ĐƯỢC ⇒ probe vô nghĩa: " + _seed.Blocker);
            Assert.Ignore(_seed.Blocker);
        }

        using var trace = TestTrace.Begin();
        var flow = new BuiPriceE00100Flow(App);
        var expected = BuiPriceE00100Db.ApplyTemplate(
            _db?.MessageTemplate(),
            BuiPriceE00100Db.LocalFlgMissingBody(PatNo, _seed!.PatBr, TrtDate, _seed.Lflg));

        BuiPriceE00100CleanProbeTests.Kq(10,
            "ORACLE — thân hộp thoại theo buiPrice.cs:1734 + MsgDialog.getMsg:\n        「" +
            expected.Replace("\r\n", "\n").Replace("\n", "\n         ") + "」");

        // ── Giai đoạn 1: F4 当日来患 trên frm203001 ──────────────────────────
        var patSelect = OpenPatientSelectOrNull(trace);
        if (patSelect is null) return;

        BuiPriceE00100CleanProbeTests.Say(() =>
        {
            AppNavigator.SetTreatmentDate(patSelect, TrtDate);
            trace.Shot("da-dat-ngay-dieu-tri");

            flow.PressF4(patSelect, trace);

            // getTodayViewData chạy TRONG handler F4 và bung E00100 giữa chừng; lưới chỉ
            // điền xong sau khi bấm OK, nên phải vét TRƯỚC rồi mới đọc.
            var boxes = flow.Drain(TimeSpan.FromSeconds(45), rounds: 12, trace);
            BuiPriceE00100CleanProbeTests.Kq(11,
                $"F4 当日来患 bật {boxes.Count} hộp E00100 (ngày {TrtDate:yyyy-MM-dd})");
            for (var i = 0; i < boxes.Count; i++)
                BuiPriceE00100CleanProbeTests.Kq(11, $"        [{i + 1}] {boxes[i]}");
            if (boxes.Count > 0)
                BuiPriceE00100CleanProbeTests.Kq(11,
                    "        khớp ORACLE? " +
                    (Txt.N(boxes[0].Text) == Txt.N(expected).Replace("\r\n", "\n")
                        ? "KHỚP NGUYÊN VĂN"
                        : "LỆCH — so từng ký tự ở hai dòng trên"));

            var leftovers = flow.OpenDialogs();
            if (leftovers.Count > 0)
                BuiPriceE00100CleanProbeTests.Kq(11,
                    "        CÒN hộp thoại KHÁC đang chắn: " +
                    string.Join(" | ", leftovers.Select(d => d.ToString())));
        });

        BuiPriceE00100CleanProbeTests.Say(() =>
        {
            var rows = flow.TodayRows(patSelect);
            BuiPriceE00100CleanProbeTests.Kq(12,
                $"lưới 当日来患 còn {rows.Count} dòng sau E00100 " +
                "(frm203001.cs:921-932 GÁN 0 vào dòng rồi cộng vào 合計 ⇒ phải GIỮ dòng, " +
                "khác frm204008 vốn LOẠI dòng)");
            foreach (var r in rows) BuiPriceE00100CleanProbeTests.Kq(12, "        " + r);

            var total = flow.TodayTotalRow(patSelect);
            BuiPriceE00100CleanProbeTests.Kq(13,
                total.Count == 0
                    ? "KHÔNG đọc được lưới 合計 dgvTotal"
                    : "dòng 合計 (dgvTotal): " + string.Join(" | ", total));
            trace.Shot("kq12-luoi-当日来患");
        });

        // ── Giai đoạn 2: 患者確定 → 診療入力 ─────────────────────────────────
        BuiPriceE00100CleanProbeTests.Say(() =>
        {
            ConfirmPatient(patSelect, trace);

            // Vét TRONG lúc chờ: GetTrnRs → Calc_BuiPriceData2s chạy ngay trong
            // frmInpMain_Load_Method, nên cửa sổ chỉ hiện ra sau khi hộp thoại được bấm.
            var boxes = flow.Drain(TimeSpan.FromSeconds(60), rounds: 12, trace);
            BuiPriceE00100CleanProbeTests.Kq(14,
                $"mở 診療入力 bật {boxes.Count} hộp E00100 " +
                "(ModSave.GetTrnRs → Calc_BuiPriceData2s, modSave.cs:2467; vòng lặp theo 枝番, modAcc.cs:77)");
            for (var i = 0; i < boxes.Count; i++)
                BuiPriceE00100CleanProbeTests.Kq(14, $"        [{i + 1}] {boxes[i]}");
        });

        BuiPriceE00100CleanProbeTests.Say(() =>
        {
            var window = Waits.TryFor(() => App.Window("frm203002"), TimeSpan.FromSeconds(60));
            if (window is null)
            {
                BuiPriceE00100CleanProbeTests.Kq(15,
                    "KHÔNG mở được 診療入力 sau E00100 — cửa sổ đang mở: " +
                    string.Join(" | ", App.Windows().Select(w => Uia.AutomationIdOf(w))) +
                    "; MessageBox còn lại: " +
                    string.Join(" | ", flow.OpenDialogs().Select(d => d.ToString())));
                trace.Shot("kq15-khong-mo-duoc-man-hinh");
                return;
            }

            var screen = new TreatmentEntryScreen(window, App.Automation);
            screen.WaitUntilReady();
            var grid = new TreatmentGrid.TreatmentGridOps(screen);
            var day = new AccountingDayFlow(App, screen);

            BuiPriceE00100CleanProbeTests.Kq(15,
                $"診療入力 VẪN MỞ sau E00100 — 患者番号 「{screen.PatientNo()}」 年月 「{screen.YearMonth()}」, " +
                $"lưới đọc được {grid.RowCount()} dòng");

            var totals = day.DailyTotals();
            BuiPriceE00100CleanProbeTests.Kq(16,
                $"日計 sau E00100 ({totals.Count} dòng): " +
                (totals.Count == 0 ? "KHÔNG CÓ DÒNG NÀO" : string.Join(" · ", totals)) +
                " — WinForm vẽ 「[負担金 N円]  [日計 M点]」 từ _buiPriceData2s toàn 0 (modAcc.cs:196-198)");
            BuiPriceE00100CleanProbeTests.Kq(17,
                $"合計点数 lbAllPoint = 「{grid.AllPoint()}」 実日数 lbDays = 「{grid.Days()}」 " +
                "(modAcc.Calc_MDPoint cộng insScore/insDays của _buiPriceData2s, modAcc.cs:106-118)");
            trace.Shot("kq16-nhat-ke-luoi-sau-e00100");
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    private Window? OpenPatientSelectOrNull(TestTrace trace)
    {
        try
        {
            var w = AppNavigator.OpenPatientSelect(App, Settings);
            trace.Note("da mo frm203001 患者選択");
            return w;
        }
        catch (Exception e)
        {
            BuiPriceE00100CleanProbeTests.Kq(10, "không mở được 患者選択: " + e.Message);
            return null;
        }
    }

    /// <summary>
    /// Gõ 患者番号 rồi F8 閲覧/変更 — bản sao của <c>AppNavigator.EnterPatient</c> (private ở đó).
    ///
    /// <para>F8 chứ không Enter: <c>openMode = update</c> ít hộp thoại hơn hẳn nhánh
    /// 初再診入力, và probe này chỉ muốn tới lưới chứ không muốn đo 患者確定.</para>
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
/// PROBE nhánh <b>NGOẠI LỆ</b> — đúng hộp E00100 mà spec Playwright mô phỏng, cộng chuỗi
/// F8 会計.
///
/// <para>Khác hẳn <see cref="BuiPriceE00100SeedProbeTests"/>: nhánh kia
/// (福祉医療設定データが存在しません) KHÔNG ném, app vá <c>localFlg</c> mặc định rồi tính
/// tiếp nên số trên màn hình không đổi. Nhánh này <b>ném thật</b>, và ném ở
/// buiPrice.cs:334 — TRƯỚC <c>_rtnData.insPayDatas = payDatas</c> (:649) — nên
/// <c>buiPriceData2</c> trả về giữ nguyên giá trị khởi tạo <b>toàn 0</b>. Đó mới là cảnh
/// 「màn hình sống với số 0」 mà TC-E00100-1 bên web dựng.</para>
///
/// <para>Chỗ ném là một <b>lỗi thật của WinForm</b>: buiPrice.cs:997-998 kiểm
/// <c>PublicExpenseNumber.Length == 8</c> rồi gọi <c>BeneficiaryNumber.Substring(0, 2)</c>
/// — hai field khác nhau. 受給者番号 rỗng ⇒ <c>ArgumentOutOfRangeException</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BỐN CÂU HỎI CHƯA AI ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="number">
/// <item>Thân hộp thoại có đúng khuôn buiPrice.cs:197-201 không, và <c>内容[]</c> /
///   <c>場所[]</c> thực sự in ra cái gì.</item>
/// <item>日計 / 合計 có về 0 thật không.</item>
/// <item>当日来患 có còn giữ dòng khi <c>insScore</c> = 0 không.</item>
/// <item>Chuỗi F8 会計 gồm những hộp nào, và E00100 xong có VẪN sang 窓口精算 không.</item>
/// </list>
///
/// <para>⚠️ GHI DB, ba chỗ — đều của RIÊNG bệnh nhân test, đều khôi phục theo ảnh chụp:
/// <c>INSURANCE</c> (PUBEXPINF_NO + <b>INS_KBN → 2</b> + <b>OLD_FLG → 4</b>),
/// một dòng <c>PUBEXPINF</c>, và <c>UNPAID</c> của ngày test —
/// <c>UnPaid.deleteTrtDtUnPaid</c> chạy ở modAcc.cs:427, TRƯỚC mọi cổng hộp thoại.</para>
///
/// <para>Chạy: <c>.\run-calc-bui-price.ps1 -Diagnostics -Exception</c></para>
/// </summary>
[TestFixture]
[Category("bui-price-e00100")]
[Explicit("PROBE + GHI DB — chạy tay")]
public sealed class BuiPriceE00100ExceptionProbeTests : UiTestBase
{
    private BuiPriceE00100Db? _db;
    private BuiPriceE00100Db.Snapshot? _snapshot;
    private BuiPriceE00100Db.Seed? _seed;

    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>Tự điều hướng — E00100 bung ra giữa lúc 診療入力 đang mở, xem lớp seed probe.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.BuiPrice.AllowSeed)
            return "chưa bật buiPrice.allowSeed. Probe này SỬA ĐĂNG KÝ BỆNH NHÂN " +
                   "(INSURANCE.PUBEXPINF_NO + INS_KBN + OLD_FLG, và một dòng PUBEXPINF) rồi " +
                   "chạy CHUỖI F8 (đụng UNPAID của ngày test). " +
                   "Chạy: .\\run-calc-bui-price.ps1 -Diagnostics -Exception";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString";

        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        _db = BuiPriceE00100Db.CreateOrNull(Settings);
        if (_db is null) return;

        _snapshot = _db.TakeSnapshot(PatNo, TrtDate);
        TestContext.Out.WriteLine(
            $"ảnh chụp bệnh nhân {PatNo}: {_snapshot.Insurance.Count} INSURANCE, " +
            $"{_snapshot.Pubexp.Count} PUBEXPINF, {_snapshot.Unpaid.Count} UNPAID ngày test");
        foreach (var i in _snapshot.Insurance) TestContext.Out.WriteLine("        " + i);
        foreach (var u in _snapshot.Unpaid) TestContext.Out.WriteLine("        UNPAID " + u);

        _seed = _db.SeedBrokenPubexp(BuiPriceE00100Db.SeedMode.CalcException, PatNo,
                                     Settings.BuiPrice.MissingLflg,
                                     Settings.BuiPrice.SeedPubexpinfNo, TrtDate);
        TestContext.Out.WriteLine(_seed.Blocker is null
            ? $"ĐÃ SEED (CalcException): 枝番 {_seed.PatBr}, ins_kbn→2, old_flg→4, " +
              $"負担者番号 8 ký tự + 受給者番号 RỖNG"
            : $"KHÔNG SEED ĐƯỢC: {_seed.Blocker}");
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

    [Test]
    [Description("PROBE NGOẠI LỆ — 患者登録データ E00100, số có về 0 không, và F8 rẽ đi đâu")]
    public void Tc0_Probe()
    {
        if (_seed?.Blocker is not null)
        {
            BuiPriceE00100CleanProbeTests.Kq(20, "KHÔNG SEED ĐƯỢC ⇒ probe vô nghĩa: " + _seed.Blocker);
            Assert.Ignore(_seed.Blocker);
        }

        using var trace = TestTrace.Begin();
        var flow = new BuiPriceE00100Flow(App);
        var prefix = BuiPriceE00100Db.CalcFailedPrefix(PatNo, _seed!.PatBr, TrtDate)
                                     .Replace("\r\n", "\n");

        BuiPriceE00100CleanProbeTests.Kq(20,
            "ORACLE — phần đoán trước được của thân (buiPrice.cs:197-201):\n        「" +
            prefix.Replace("\n", "\n         ") + "」  + \\n\\n内容[…]\\n場所[…]");

        // ── F4 当日来患 ──────────────────────────────────────────────────────
        Window? patSelect = null;
        BuiPriceE00100CleanProbeTests.Say(() =>
        {
            patSelect = AppNavigator.OpenPatientSelect(App, Settings);
            AppNavigator.SetTreatmentDate(patSelect, TrtDate);
            flow.PressF4(patSelect, trace);

            var boxes = flow.Drain(TimeSpan.FromSeconds(45), rounds: 12, trace);
            BuiPriceE00100CleanProbeTests.Kq(21, $"F4 当日来患 bật {boxes.Count} hộp E00100");
            foreach (var b in boxes)
            {
                BuiPriceE00100CleanProbeTests.Kq(21, "        " + b);
                BuiPriceE00100CleanProbeTests.Kq(21,
                    "        RAW bắt đầu đúng ORACLE? " + (b.Raw.StartsWith(prefix, StringComparison.Ordinal) ? "CÓ" : "KHÔNG") +
                    " · có 内容[? " + (b.Raw.Contains("内容[", StringComparison.Ordinal) ? "CÓ" : "KHÔNG") +
                    " · có 場所[? " + (b.Raw.Contains("場所[", StringComparison.Ordinal) ? "CÓ" : "KHÔNG") +
                    " · dòng 2 mở đầu bằng 全角 U+3000? " +
                    (b.Raw.Contains("\n\u3000患者番号[", StringComparison.Ordinal) ? "CÓ" : "KHÔNG"));
            }

            var rows = flow.TodayRows(patSelect!);
            BuiPriceE00100CleanProbeTests.Kq(22, $"lưới 当日来患 còn {rows.Count} dòng");
            foreach (var r in rows) BuiPriceE00100CleanProbeTests.Kq(22, "        " + r);
            BuiPriceE00100CleanProbeTests.Kq(22,
                "        合計: " + string.Join(" | ", flow.TodayTotalRow(patSelect!)));
            trace.Shot("kq22-luoi-当日来患");
        });

        // ── 患者確定 → 診療入力 ─────────────────────────────────────────────
        TreatmentEntryScreen? screen = null;
        BuiPriceE00100CleanProbeTests.Say(() =>
        {
            if (patSelect is null) return;
            var combo = Waits.For(() => Uia.ById(patSelect, TestSettings.Current.Locator("patSelPatNo")),
                                  "ô 患者番号 「cboPatNo」");
            Uia.SetText(Uia.EditInside(combo), Settings.Patient.PatNo);
            Waits.Step();
            trace.Step($"bam F8 閲覧/変更 cho benh nhan {Settings.Patient.PatNo}");
            Keyboard.Press(VirtualKeyShort.F8);

            var boxes = flow.Drain(TimeSpan.FromSeconds(60), rounds: 12, trace);
            BuiPriceE00100CleanProbeTests.Kq(23, $"mở 診療入力 bật {boxes.Count} hộp E00100");
            foreach (var b in boxes) BuiPriceE00100CleanProbeTests.Kq(23, "        " + b);

            var window = Waits.TryFor(() => App.Window("frm203002"), TimeSpan.FromSeconds(60));
            if (window is null)
            {
                BuiPriceE00100CleanProbeTests.Kq(24, "KHÔNG mở được 診療入力. Cửa sổ: " +
                    string.Join(" | ", App.Windows().Select(w => Uia.AutomationIdOf(w))));
                trace.Shot("kq24-khong-mo-duoc");
                return;
            }

            screen = new TreatmentEntryScreen(window, App.Automation);
            screen.WaitUntilReady();
            var grid = new TreatmentGrid.TreatmentGridOps(screen);
            var day = new AccountingDayFlow(App, screen);

            BuiPriceE00100CleanProbeTests.Kq(24,
                $"診療入力 VẪN MỞ — 患者番号 「{screen.PatientNo()}」 年月 「{screen.YearMonth()}」, " +
                $"lưới {grid.RowCount()} dòng");
            BuiPriceE00100CleanProbeTests.Kq(25,
                "日計: " + string.Join(" · ", day.DailyTotals()) +
                $"  ·  合計点数 「{grid.AllPoint()}」 実日数 「{grid.Days()}」 " +
                "— NGOẠI LỆ ném ở buiPrice.cs:334, TRƯỚC :649 nên insPayDatas rỗng ⇒ KỲ VỌNG toàn 0");
            trace.Shot("kq25-nhat-ke-luoi");
        });

        // ── Chuỗi F8 会計 ───────────────────────────────────────────────────
        BuiPriceE00100CleanProbeTests.Say(() =>
        {
            if (screen is null) { BuiPriceE00100CleanProbeTests.Kq(26, "bỏ qua F8: chưa mở được 診療入力"); return; }

            var before = _db!.ReadUnpaid(PatNo, TrtDate);
            BuiPriceE00100CleanProbeTests.Kq(26, $"UNPAID ngày {TrtDate:yyyy-MM-dd} TRƯỚC F8: {before.Count} dòng");

            // Đặt con trỏ vào dòng của NGÀY TEST: F8 会計 chạy theo ngày của DÒNG CON TRỎ
            // (modAcc.cs:415), không theo ngày mở màn hình — bẫy đã ghi ở README mục 8b.
            var day = new AccountingDayFlow(App, screen);
            var row = day.RowForDay(TrtDate.Day);
            if (row is null)
            {
                BuiPriceE00100CleanProbeTests.Kq(26,
                    $"lưới không có dòng 日 = {TrtDate.Day}; các ngày đọc được: " +
                    string.Join(", ", day.DaysOnGrid()));
                return;
            }
            day.FocusRow(row, trace);

            var walk = flow.PressF8AndWalk(App, screen.Window, rounds: 10, trace);
            BuiPriceE00100CleanProbeTests.Kq(26,
                $"chuỗi F8 ({walk.Trail.Count} hộp thoại), E00100 = {walk.E00100Count}, " +
                $"sang 窓口精算 = {walk.ReachedCounterPayment}");
            foreach (var a in walk.Trail) BuiPriceE00100CleanProbeTests.Kq(26, "        " + a);
            BuiPriceE00100CleanProbeTests.Kq(26, "        chẩn đoán: " + walk.Explain);

            var after = _db.ReadUnpaid(PatNo, TrtDate);
            BuiPriceE00100CleanProbeTests.Kq(27,
                $"UNPAID SAU F8: {after.Count} dòng (trước {before.Count}) — " +
                "deleteTrtDtUnPaid chạy ở modAcc.cs:427, TRƯỚC mọi cổng");
            foreach (var u in after) BuiPriceE00100CleanProbeTests.Kq(27, "        " + u);
            trace.Shot("kq26-sau-chuoi-f8");
        });
    }
}
