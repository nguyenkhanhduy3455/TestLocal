using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.ParitySaveData;

/// <summary>
/// BUG-2d — từ chối ghi đè khi xung đột, WinForm VẪN đóng màn hình và mất nội dung nhập.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MỤC ĐÍCH
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web đã port NGUYÊN hành vi này cho F9 (xem `SaveTreatmentsHandler` +
/// `treatment-entry-detail.tsx` `saveWithConflictGuard`). Nhưng tới giờ kết luận chỉ
/// dựa trên ĐỌC SOURCE. Nếu đọc sai thì web đang tái tạo một cái sai không tồn tại, và
/// bộ e2e Playwright (TC-9) đang khoá chặt cái sai đó lại.
///
/// Nguyên nhân theo source:
///   `SaveData` trả false khi người dùng chọn 「いいえ」 (modSave.cs:550-556), NHƯNG
///   `SaveChangesAndExit` VỨT giá trị trả về đó (modSave.cs:120) nên `retval` vẫn là
///   true ⇒ 「終了」 ⇒ đóng màn hình.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG CẦN MÁY THỨ HAI
/// ═══════════════════════════════════════════════════════════════════════════
/// `CompareTrntrnData` (modSave.cs:5176) chỉ làm một việc: đọc lại TRNTRN của tháng rồi
/// so với ảnh chụp `trtDataListCur` lấy lúc mở màn. Nó không quan tâm ai gây ra thay đổi.
/// Nên một câu UPDATE thẳng vào DB trong lúc màn hình đang mở là tương đương HOÀN TOÀN
/// với "máy khác vừa bấm F9" — xem <see cref="OchaDbParity.SimulateRemoteSave"/>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ BỘ NÀY GHI THẬT XUỐNG DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Nó bấm F9 登録, mà F9 ghi lại TOÀN BỘ 処置行 của tháng (xoá + chèn lại, disp_no đánh
/// số lại từ 1). Phải bật `parity.allowSave = true` thì mới chạy; mặc định Ignore.
/// **Chọn bệnh nhân test, đừng trỏ vào bệnh nhân thật.**
///
/// ═══════════════════════════════════════════════════════════════════════════
/// LOG CẦN THU
/// ═══════════════════════════════════════════════════════════════════════════
/// Các dòng `SONTEST1 [BUG-2d]` trong C:\OCHACOM_Logs\investigation.log. Cặp quyết định:
///   SaveData RETURN false — KHONG luu gi ca
///   SaveChangesAndExit TRA VE retval=True (true => dong man hinh)
/// </summary>
[TestFixture]
[Category("parity")]
public sealed class Bug2dConcurrentSaveTests : UiTestBase
{
    private OchaDbParity? _write;
    private RemoteSaveSimulation? _simulation;

    /// <summary>Ảnh chụp seq lúc bắt đầu — teardown xoá mọi dòng phát sinh thêm.</summary>
    private HashSet<int>? _seqsAtStart;

    /// <summary>
    /// Chặn TRƯỚC khi app khởi động: thiếu cấu hình thì không có lý do gì mở app rồi mới
    /// bỏ qua. Câu lý do nói rõ phải điền gì, vì đây là fixture DUY NHẤT ghi xuống DB nên
    /// việc nó im lặng không chạy là chuyện dễ bị bỏ sót nhất.
    /// </summary>
    protected override string? FixturePreflightSkipReason()
    {
        var s = TestSettings.Current;

        if (!s.Parity.AllowSave)
            return "CHUA CHAY — chưa bật parity.allowSave, nên app WinForm không được mở " +
                   "và KHÔNG có dòng log SONTEST1 nào được ghi thêm.\n\n" +
                   "  " + TestSettings.LocalFileHint() + "\n\n" +
                   "  Nội dung tối thiểu:\n" +
                   "    {\n" +
                   "      \"db\": { \"enabled\": true, \"connectionString\": \"<copy tu <DbConnectString> trong C:\\NEW_SIM2000\\Ocha.xml>\" },\n" +
                   "      \"parity\": { \"allowSave\": true },\n" +
                   "      \"patient\": { \"patNo\": \"<BENH NHAN TEST>\" }\n" +
                   "    }\n\n" +
                   "  ⚠️ F9 登録 ghi lại TOÀN BỘ 処置行 của tháng (xoá + chèn lại, disp_no " +
                   "đánh số lại từ 1). Chỉ bật khi patNo đang trỏ vào bệnh nhân TEST.";

        if (!s.Db.Enabled || string.IsNullOrWhiteSpace(s.Db.ConnectionString))
            return "parity.allowSave đã bật nhưng db.enabled/db.connectionString chưa có. " +
                   "Mọi khẳng định của bộ này đều soi thẳng SQL Server (TRNTRN / BNOW / PERSON_EXP).\n\n" +
                   "  " + TestSettings.LocalFileHint();

        return null;
    }

    [OneTimeSetUp]
    public void ParitySetUp()
    {
        _write = OchaDbParity.CreateOrNull(Settings);
        _seqsAtStart = _write?.SnapshotSeqs(PatNo, TrtDate);
        if (_seqsAtStart is not null)
            TestContext.Out.WriteLine($"Anh chup dau lo: {_seqsAtStart.Count} dong trong thang test");
    }

    /// <summary>
    /// Đặt lại giả lập cho một testcase mới: hoàn tác cái cũ TRƯỚC.
    ///
    /// <para>Không hoàn tác trước thì mỗi testcase dời thêm một dòng nữa, và cái dời của
    /// testcase trước không bao giờ được trả lại — <c>_simulation</c> chỉ giữ được MỘT
    /// token. Đã vấp thật: Tc2d1 dời một dòng, Tc2d2 ghi đè lên và đóng đinh thứ tự sai.</para>
    /// </summary>
    private RemoteSaveSimulation? ResetSimulation(OchaDbParity db)
    {
        if (_simulation is { } previous)
        {
            try { db.UndoSimulatedRemoteSave(previous); }
            catch { /* lượt lưu có force da xoa dong do roi */ }
            _simulation = null;
        }
        return db.SimulateRemoteSave(PatNo, TrtDate);
    }

    [SetUp]
    public void EnsureScreenOpen()
    {
        // Tới đây thì preflight đã bảo đảm cấu hình đủ; _write chỉ null khi
        // OchaDbParity đổi điều kiện dựng mà quên đồng bộ với preflight.
        if (_write is null)
            IgnoreWithReason("OchaDbParity không dựng được dù preflight đã cho qua — kiểm tra lại cấu hình db.");

        // F9 của testcase trước làm màn hình đóng ⇒ mở lại.
        if (!TreatmentScreenAlive()) ReopenTreatmentScreen();
    }

    [OneTimeTearDown]
    public void ParityTearDown()
    {
        DismissLeftoverDialogs();

        // Xoá dòng do lô test thêm vào, để chạy lại nhiều lần không dồn rác.
        if (_write is not null && _seqsAtStart is not null)
        {
            try
            {
                var drift = _write.DescribeDrift(PatNo, TrtDate, _seqsAtStart);
                TestContext.Out.WriteLine(drift.Length == 0
                    ? "So dong 処置 cua thang khong doi"
                    : "CANH BAO — " + drift);
            }
            catch (Exception e)
            {
                TestContext.Out.WriteLine($"CANH BAO — khong don duoc dong test them: {e.Message}");
            }
        }

        // Hoàn tác kể cả khi testcase đỏ giữa chừng — nếu không, dòng bị dời disp_no
        // nằm lại trong DB và mọi lượt chạy sau đều thấy "xung đột" giả.
        if (_simulation is { } sim && _write is not null)
        {
            try
            {
                _write.UndoSimulatedRemoteSave(sim);
                TestContext.Out.WriteLine(
                    $"Đã hoàn tác giả lập: disp_no {sim.ShiftedDispNo} -> {sim.OriginalDispNo}");
            }
            catch (Exception e)
            {
                TestContext.Out.WriteLine(
                    $"⚠️ KHÔNG hoàn tác được giả lập ({e.Message}). Chạy tay: " +
                    $"UPDATE TRNTRN SET disp_no = {sim.OriginalDispNo} WHERE pat_no = {sim.PatNo} " +
                    $"AND trt_dt = '{sim.TrtDt:yyyy-MM-dd}' AND disp_no = {sim.ShiftedDispNo} " +
                    $"AND seq = {sim.Seq}");
            }
            _simulation = null;
        }
    }

    /// <summary>
    /// Đóng mọi hộp thoại còn sót của app.
    ///
    /// <para>Bắt buộc, không phải cho gọn: một testcase đỏ giữa chuỗi hộp thoại sẽ để
    /// lại MessageBox modal đang mở. App vẫn chạy, và vì <c>app.attachIfRunning</c> mặc
    /// định true nên LƯỢT CHẠY SAU sẽ bám vào đúng cái app đang kẹt đó — mọi thao tác
    /// UIA đều timeout và người đọc lại đi tìm nguyên nhân ở chỗ khác.</para>
    ///
    /// <para>Chọn 「キャンセル/Cancel」 khi có: đó là nút DUY NHẤT không lưu và cũng
    /// không rời màn hình. Không có Cancel thì mới tới 「いいえ/No」.</para>
    /// </summary>
    private void DismissLeftoverDialogs()
    {
        for (var i = 0; i < 5; i++)
        {
            var open = ModalDialogs.All(App, TreatmentScreenAlive() ? Screen.Window : null);
            if (open.Count == 0) return;

            foreach (var d in open)
            {
                var text = Txt.N(Dialogs.TextOf(d));
                TestContext.Out.WriteLine($"Dong hop thoai con sot: 「{text}」");
                if (!Dialogs.ClickButton(d, "キャンセル", "Cancel", "いいえ", "No", "OK", "はい", "Yes"))
                {
                    try { d.Close(); } catch { /* da dong */ }
                }
            }
            Thread.Sleep(500);
        }

        TestContext.Out.WriteLine(
            "CANH BAO — van con hop thoai mo sau 5 lan thu. Dong app thu cong truoc khi chay lai, " +
            "neu khong luot sau se bam vao app dang ket (app.attachIfRunning = true).");
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("Tc2d0 (mốc) — tháng test phải có ít nhất một 処置行 đã lưu")]
    public void Tc2d0_MonthHasAtLeastOneSavedRow()
    {
        using var trace = TestTrace.Begin();
        var db = _write!;

        var count = trace.Do("dem 処置行 da luu cua thang",
            () => db.CountTrnRowsInMonth(PatNo, TrtDate));
        trace.Note($"TRNTRN cua benh nhan {PatNo} thang {TrtDate:yyyy-MM}: {count} dong");

        if (count > 0)
        {
            trace.Note("da co dong - khong can tao them");
            return;
        }

        // Chưa có dòng nào ⇒ tạo một dòng bằng chính giao diện, để CompareTrntrnData có
        // cái mà so. Dùng 処置 KHÔNG cần chọn 部位 (mặc định 再診 110) để khỏi phải lái
        // dialog 部位選択 — cái đó chưa tự động hoá được, xem ParityDiagnosticsTests.
        AddSimpleTreatment(trace);

        var saved = SaveFlow.PressF9(
            App, Screen.Window, SaveFlow.SaveAnswer.Yes, trace: trace);

        Assert.That(saved.OverwriteAsked, Is.False,
            "Lượt lưu đầu tiên không được có xung đột — nếu có, nghĩa là DB đang bị thứ khác sửa song song.");

        trace.Do("mo lai man hinh 診療入力", ReopenTreatmentScreen);

        var after = trace.Do("dem lai 処置行", () => db.CountTrnRowsInMonth(PatNo, TrtDate));
        trace.Note($"sau F9: {after} dong");
        Assert.That(after, Is.GreaterThan(0),
            "F9 xong mà TRNTRN vẫn 0 dòng ⇒ harness hỏng, đừng đọc kết quả các testcase sau.");
    }

    [Test, Order(2)]
    [Description("Tc2d1 — 🐛 chọn 「いいえ」 cho 上書き: không lưu NHƯNG màn hình vẫn đóng")]
    public void Tc2d1_DeclineOverwrite_KeepsDbIntact_ButStillClosesTheScreen()
    {
        using var trace = TestTrace.Begin();
        var db = _write!;
        trace.Shot("truoc-khi-gia-lap");

        // Màn hình đã mở TRƯỚC bước này (SetUp lo), nên ảnh chụp trtDataListCur đã được
        // lấy. Giờ mới giả lập máy khác — thứ tự này là bắt buộc, đảo lại thì app đọc
        // luôn trạng thái mới và không có xung đột nào cả.
        _simulation = trace.Do("gia lap may khac vua luu cung thang (UPDATE disp_no dong CUOI)",
            () => ResetSimulation(db));
        Assert.That(_simulation, Is.Not.Null,
            "Không có dòng nào trong tháng để giả lập máy khác sửa — Tc2d0 phải chạy trước.");
        trace.Note($"disp_no {_simulation!.OriginalDispNo} -> {_simulation.ShiftedDispNo} " +
                   $"(trt_dt {_simulation.TrtDt:yyyy-MM-dd}, seq {_simulation.Seq})");

        var before = trace.Do("chup van tay TRNTRN cua thang",
            () => db.FingerprintMonth(PatNo, TrtDate));
        trace.Note($"van tay truoc: {Short(before)}");

        // Nhập thêm một 処置 để có thứ MẤT ĐI — đây chính là cái người dùng thật sẽ mất.
        AddSimpleTreatment(trace);

        var result = SaveFlow.PressF9(
            App, Screen.Window,
            SaveFlow.SaveAnswer.Yes,
            SaveFlow.OverwriteAnswer.No,
            trace);

        var afterPrint = trace.Do("doc lai van tay TRNTRN", () => db.FingerprintMonth(PatNo, TrtDate));
        trace.Note($"van tay sau  : {Short(afterPrint)}");
        trace.Note($"hoi 上書き = {result.OverwriteAsked} | nut mac dinh = 「{result.OverwriteDefaultButton}」 " +
                   $"| man hinh dong = {result.ScreenClosedAfterwards}");

        Assert.Multiple(() =>
        {
            Assert.That(result.OverwriteAsked, Is.True,
                "Phải hiện 「他の端末で処置データが更新されています。上書きしますか？」. " +
                "Không hiện ⇒ CompareTrntrnData không phát hiện được thay đổi, và cách giả lập " +
                "của test này sai (xem OchaDbParity.SimulateRemoteSave).");

            // MsgBoxStyle.DefaultButton2 (modSave.cs:548). Không phải chi tiết trang trí:
            // người dùng quen Enter, Enter rơi vào はい là cơ chế tự vô hiệu đúng lúc cần nhất.
            //
            // ⚠️ Chấp nhận CẢ HAI ngôn ngữ. MessageBox lấy nhãn nút từ ngôn ngữ giao diện
            // của WINDOWS, không phải của app: máy Nhật ra 「いいえ」, máy Anh ra 「No」.
            // Bó cứng vào tiếng Nhật làm testcase đỏ trên máy Windows tiếng Anh trong khi
            // hành vi hoàn toàn đúng — đã vấp đúng lần đầu chạy thật.
            Assert.That(result.OverwriteDefaultButton, Is.AnyOf("いいえ", "No"),
                "Nút mặc định của hộp thoại 上書き phải là 「いいえ」/「No」 " +
                "(MsgBoxStyle.DefaultButton2). Đọc được: " +
                $"「{result.OverwriteDefaultButton}」");

            Assert.That(afterPrint, Is.EqualTo(before),
                "Chọn 「いいえ」 thì TRNTRN phải KHÔNG đổi một dòng nào.");

            // ── ĐÂY LÀ BUG ────────────────────────────────────────────────────
            Assert.That(result.ScreenClosedAfterwards, Is.True,
                "BUG-2d: WinForm đóng màn hình 診療入力 ngay cả khi từ chối ghi đè, nên nội dung " +
                "đang nhập mất sạch. Nếu vế này ĐỎ tức là màn hình VẪN Ở LẠI — nghĩa là tôi đã " +
                "đọc sai source, và phải gỡ phần port parity này ra khỏi bản web (kèm TC-9 của " +
                "bộ Playwright đang khoá nó).");
        });
    }

    [Test, Order(3)]
    [Description("Tc2d2 (đối chứng) — chọn 「はい」 thì ghi đè được, chứng minh xung đột là thật")]
    public void Tc2d2_AcceptOverwrite_ActuallyWrites()
    {
        using var trace = TestTrace.Begin();
        var db = _write!;

        _simulation = trace.Do("gia lap may khac vua luu", () => ResetSimulation(db));
        Assert.That(_simulation, Is.Not.Null, "Không có dòng nào để giả lập.");

        var before = trace.Do("chup van tay TRNTRN", () => db.FingerprintMonth(PatNo, TrtDate));
        AddSimpleTreatment(trace);

        var result = SaveFlow.PressF9(
            App, Screen.Window,
            SaveFlow.SaveAnswer.Yes,
            SaveFlow.OverwriteAnswer.Yes,
            trace);

        var afterPrint = trace.Do("doc lai van tay TRNTRN", () => db.FingerprintMonth(PatNo, TrtDate));
        trace.Note($"van tay truoc: {Short(before)}");
        trace.Note($"van tay sau  : {Short(afterPrint)}");

        Assert.Multiple(() =>
        {
            Assert.That(result.OverwriteAsked, Is.True, "Vẫn phải hỏi 上書き như testcase trước.");
            Assert.That(afterPrint, Is.Not.EqualTo(before),
                "Chọn 「はい」 phải ghi đè thật. Không đổi ⇒ hộp thoại này vô tác dụng.");
        });

        // F9 đã ghi lại cả tháng ⇒ dòng bị dời disp_no không còn, hoàn tác thành vô nghĩa.
        _simulation = null;
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Chèn một 処置 vào lưới đăng ký qua tab 個別.
    ///
    /// Dùng 処置 KHÔNG cần 部位 (mặc định 再診 110, đổi bằng <c>parity.simpleTrtCd</c>):
    /// những mã cần 部位 sẽ bật dialog 部位選択 (frm902003) mà bộ test chưa lái được.
    /// </summary>
    private void AddSimpleTreatment(TestTrace trace)
    {
        var cd = Settings.Parity.SimpleTrtCd;
        var sb = Settings.Parity.SimpleTrtSb;

        var kobetu = trace.Do("mo tab 個別", () => Screen.Kobetu.Open());
        trace.Do("xoa 3 o tim kiem", kobetu.ResetSearchBoxes);

        var row = trace.Do($"tim 処置 {cd}-{sb} trong master", () => kobetu.RequireRow(cd, sb));
        trace.Note($"dong master khop: {row}");

        trace.Do($"chon 処置 {cd}-{sb} (app day xuong luoi dang ky)", () => kobetu.SelectRow(row));

        // ⚠️ KHÔNG gọi Grid.RowCount() ở đây. Khi 診療入力設定 bật
        // pInpOpt[41] (過去データ１画面表示), GetTrnRsOld đổ TOÀN BỘ lịch sử vào chính
        // lưới này — máy test thật đo được 2864 dòng. RowCount() duyệt không giới hạn
        // qua cầu UIA nên tốn hàng phút cho một dòng log vô thưởng vô phạt.
        // Đếm có chặn trên là đủ để biết "app có chèn được dòng nào không".
        var probe = Screen.Regi.Grid.RowElements(limit: 50).Count;
        trace.Note($"luoi dang ky: doc thu {probe} dong dau (khong dem het - luoi co the vai nghin dong)");
        Waits.Step();
    }

    /// <summary>Cắt vân tay cho vừa một dòng log — bản đầy đủ vẫn nằm trong assert.</summary>
    private static string Short(string fingerprint) =>
        fingerprint.Length <= 200 ? fingerprint : fingerprint[..200] + $"… (+{fingerprint.Length - 200} ký tự)";
}
