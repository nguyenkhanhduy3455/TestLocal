using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;

namespace OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

/// <summary>
/// 診療入力 F8 → 会計データ修正 — nửa WinForm của
/// <c>../web-tenant-tests/tests/chg-acc-data-parity.spec.ts</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÁC GÌ <see cref="ChgAccDataTests"/> ĐÃ CÓ
/// ═══════════════════════════════════════════════════════════════════════════
/// Fixture kia đo <b>phép ghi</b> của <c>ChgAccData</c> (ACCDAT + PERSON_EXP, ISSUE-1).
/// Fixture này đo ba thứ mà spec Playwright đo và bên đây <b>chưa ai đo</b> — cả ba
/// đều nằm ở tầng màn hình, không phải ở phép tính:
///
/// <list type="number">
///   <item><b>Nút MẶC ĐỊNH của từng hộp thoại.</b> WinForm cố ý để hai hộp đầu
///     <c>Button2 = いいえ</c> (modAcc.cs:562, :581) nhưng hộp 会計データ修正
///     <c>Button1 = はい</c> (modAcc.cs:956). Bấm Enter theo phản xạ với mặc định はい
///     cho cả ba là chồng thêm một 未精算 ĐỦ TIỀN lên ngày đã thu — <b>thu tiền hai
///     lần</b>. Bản web trước đây để mặc định はい cả ba.</item>
///   <item><b><c>deleteTrtDtUnPaid</c> chạy VÔ ĐIỀU KIỆN</b> ở modAcc.cs:428 — ngay sau
///     cổng ngày, TRƯỚC mọi hộp thoại và TRƯỚC cả chỗ rẽ nhánh. Bản web từng chôn bước
///     xoá đó bên trong <c>insert-unpaid</c>, nên nhánh KHÔNG insert thì không xoá gì
///     (ISSUE-13-a).</item>
///   <item><b>Nhánh G chỉ SỬA sổ, KHÔNG tạo 未精算 mới.</b></item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI SỔ TIỀN
/// ═══════════════════════════════════════════════════════════════════════════
/// Fixture này trả lời <b>いいえ</b> cho hộp 会計データ修正 — <c>ChgAccData</c> chỉ ghi
/// trong nhánh <c>DialogResult.Yes</c> (modAcc.cs:956), nên ACCDAT và PERSON_EXP không
/// bị đụng. Phần ghi đã do <c>Tc8_2</c> của <see cref="ChgAccDataTests"/> đo rồi; làm
/// lại chỉ là sửa sổ tiền thêm một lần nữa cho cùng một đáp án.
///
/// <para>Hai thứ nó CÓ ghi, và cả hai đều tự dọn: dòng 会計 mốc do
/// <see cref="AccountingPreconditions"/> seed (teardown xoá), và dòng 未精算 mốc của
/// <see cref="TcCHG3_DeleteRunsEvenWithoutInsert"/> (teardown xoá cứng).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  WinForm (đây)                             Playwright (chg-acc-data-parity.spec.ts)
///  ────────────────────────────────────      ──────────────────────────────────────────
///  TcCHG0  tiền đề + seed 未精算 mốc          (beforeAll + seedMarkerUnpaid)
///  TcCHG1  nút mặc định 既存会計 / 修正        TC-CHG-1
///  TcCHG2  nhánh G, KHÔNG tạo 未精算 mới      TC-CHG-2 (nửa không ghi tiền)
///  TcCHG3  DELETE chạy dù KHÔNG insert       TC-CHG-3
///  TcCHG4  nút mặc định hộp 差額              TC-CHG-1 (hộp thứ hai)
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ HAI CHỖ BÊN NÀY ĐO ĐƯỢC ÍT HƠN — vì DỮ LIỆU, không phải vì app
/// ═══════════════════════════════════════════════════════════════════════════
/// Spec Playwright <b>giả lập</b> <c>precheck</c> nên dựng được mọi tổ hợp cờ. Ở đây
/// không giả lập được gì: <c>LetAccData2</c> tự tính từ 処置 + ACCDAT thật.
///
/// <para>Bệnh nhân test là <b>公費単独</b> ⇒ <c>cur.insPrice</c> luôn <b>0</b>, còn dòng
/// 会計 seed là ¥1.020. Nên với dữ liệu này:</para>
/// <list type="bullet">
///   <item><c>cur == past</c> (金額同一, modAcc.cs:571) — <b>không dựng được</b> ⇒ nhánh
///     mà spec dùng cho TC-CHG-3 không tới được. <see cref="TcCHG3_DeleteRunsEvenWithoutInsert"/>
///     chứng minh CÙNG một điều bằng nhánh G: nhánh đó cũng KHÔNG insert 未精算 nào, nên
///     dòng mốc biến mất thì chỉ có thể do modAcc.cs:428.</item>
///   <item><c>cur &gt;= past</c> (hộp 差額, modAcc.cs:578) — <b>không dựng được</b> ⇒
///     <see cref="TcCHG4_DiffDialogDefaultsToNo"/> tự <c>Ignore</c> kèm lý do. Chạy trên
///     bệnh nhân có 保険 tự trả khác 0 là nó bắt đầu khẳng định.</item>
/// </list>
///
/// <para>Cách chạy: <c>.\run-fix-accounting-data.ps1</c> (cần <c>parity.allowSave</c>).</para>
/// </summary>
[TestFixture]
[Category("parity")]
public sealed class ChgAccDataParityTests : UiTestBase
{
    private OchaDbAccounting? _db;
    private AccountingDayFlow? _dayFlow;
    private OchaDbAccounting.AccSnapshot? _snapshot;
    private bool _seededAccounting;
    private IReadOnlyCollection<OchaDbAccounting.UnpaidKey> _unpaidBefore = [];

    /// <summary>Tiền đề đã đủ chưa — TcCHG1 chỉ bấm F8 khi TcCHG0 xanh.</summary>
    private static bool _ready;

    /// <summary>Chuỗi hộp thoại của lượt F8 DUY NHẤT — TcCHG2/3/4 đọc lại từ đây.</summary>
    private static AccountingFlow.Walk? _walk;

    /// <summary>未精算 đọc được NGAY SAU lượt F8 — chốt tại chỗ để không ai đọc nhầm lúc khác.</summary>
    private static IReadOnlyList<OchaDbAccounting.UnpaidKey> _unpaidAfter = [];

    /// <summary>Dòng 未精算 mốc còn sống không, đo NGAY SAU lượt F8.</summary>
    private static bool _markerAliveAfter = true;

    /// <summary>ACCDAT đọc lại sau lượt F8 — trả lời いいえ thì phải y nguyên.</summary>
    private static List<OchaDbAccounting.AccRow> _accAfter = [];

    private static List<OchaDbAccounting.AccRow> _accBefore = [];

    protected override string? FixturePreflightSkipReason()
    {
        var s = TestSettings.Current;

        if (!s.Parity.AllowSave)
            return "CHUA CHAY — chưa bật parity.allowSave.\n\n  " + TestSettings.LocalFileHint() +
                   "\n\n  Fixture này KHÔNG ghi sổ tiền (trả lời いいえ cho 会計データ修正), nhưng nó " +
                   "seed một dòng 会計 và một dòng 未精算 mốc, và dùng chung helper có quyền ghi " +
                   "với ChgAccDataTests — nên đi cùng một công tắc.";

        if (!s.Db.Enabled || string.IsNullOrWhiteSpace(s.Db.ConnectionString))
            return "parity.allowSave đã bật nhưng thiếu db.connectionString — mọi khẳng định về " +
                   "UNPAID / ACCDAT đều soi thẳng SQL Server.\n\n  " + TestSettings.LocalFileHint();

        return null;
    }

    [OneTimeSetUp]
    public void ParitySetUp()
    {
        _db = OchaDbAccounting.CreateOrNull(Settings);
        _dayFlow = new AccountingDayFlow(App, Screen);
        _snapshot = _db?.Snapshot(PatNo, TrtDate);
        if (_snapshot is not null)
            TestContext.Progress.WriteLine(
                $"Anh chup dau lo: {_snapshot.Rows.Count} dong ACCDAT | " +
                $"dep_due={_snapshot.DepDue} ins_due_bal={_snapshot.InsDueBal}");
    }

    [OneTimeTearDown]
    public void ParityTearDown()
    {
        if (_db is null || _snapshot is null) return;
        try
        {
            // Dòng mốc xoá CỨNG và xoá TRƯỚC — kể cả khi testcase đỏ giữa chừng và nó
            // còn sống. Để lại thì nó hiện lên 未精算患者一覧 của 窓口精算 như một bệnh
            // nhân thật đang chờ thu tiền.
            var m = _db.DeleteMarkerUnpaid(PatNo, TrtDate);
            if (m > 0) TestContext.Progress.WriteLine($"Don: xoa {m} dong UNPAID moc (km_cd={OchaDbAccounting.MarkerKmCd})");

            var u = _db.DeleteUnpaidNotIn(PatNo, TrtDate, _unpaidBefore);
            if (u > 0) TestContext.Progress.WriteLine($"Don: xoa {u} dong UNPAID phat sinh trong lo test");

            if (_seededAccounting)
            {
                var d = _db.DeleteAccDat(PatNo, TrtDate);
                _db.SetBalances(PatNo, _snapshot.DepDue, _snapshot.InsDueBal);
                TestContext.Progress.WriteLine($"Don: xoa {d} dong ACCDAT do lo test tao + tra so du ve cu");
                return;
            }

            var n = _db.Restore(PatNo, TrtDate, _snapshot);
            TestContext.Progress.WriteLine($"Don: khoi phuc ACCDAT + PERSON_EXP ({n} dong bi cham)");
        }
        catch (Exception e)
        {
            TestContext.Progress.WriteLine(
                $"⚠️ KHONG don duoc ({e.Message}). Kiem tay:\n" +
                $"  SELECT * FROM UNPAID WHERE pat_no = {PatNo} AND trt_dt = '{TrtDate:yyyy-MM-dd}';\n" +
                $"  SELECT * FROM ACCDAT WHERE pat_no = {PatNo} AND trt_dt = '{TrtDate:yyyy-MM-dd}';");
        }
    }

    // ── TcCHG0 ───────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("TcCHG0 (mốc) — tiền đề nhánh G + seed dòng 未精算 mốc cho TcCHG3")]
    public void TcCHG0_Preconditions()
    {
        using var trace = TestTrace.Begin();

        var pre = AccountingPreconditions.Ensure(_db!, PatNo, TrtDate, trace);
        _seededAccounting = pre.SeededAccounting;
        _unpaidBefore = pre.UnpaidBefore;

        if (!pre.Ok) IgnoreWithReason(pre.Blocker!);

        _accBefore = trace.Do("chup ACCDAT truoc luot F8", () => _db!.ReadAccDat(PatNo, TrtDate));
        foreach (var r in _accBefore)
            trace.Note($"  km_cd={r.KmCd} lflg={r.Lflg} score={r.Score} claim={r.ClaimAmt} rece={r.ReceAmt}");

        // 当日来院回数 phải khớp: deleteTrtDtUnPaid lọc `trt_cnt % 100 = @trt_cnt`
        // (UnPaid.cs:357). Seed sai con số này thì DELETE không chạm dòng mốc và
        // TcCHG3 đỏ oan, đổ lỗi cho WinForm.
        var raiin = trace.Do("doc RAIIN_CNT cua ngay test", () => _db!.ReadRaiinCnt(PatNo, TrtDate));
        trace.Note($"  RAIIN_CNT = {raiin} => dong 未精算 moc se mang trt_cnt = {raiin}");

        trace.Do($"seed dong 未精算 MOC (km_cd={OchaDbAccounting.MarkerKmCd}, nte={OchaDbAccounting.MarkerNte})",
                 () => _db!.InsertMarkerUnpaid(PatNo, TrtDate, raiin));

        Assert.That(_db!.MarkerUnpaidExists(PatNo, TrtDate), Is.True,
            "seed dòng 未精算 mốc không thành — không có nó thì TcCHG3 không đo được gì.");

        _ready = true;
    }

    private void RequireReady()
    {
        if (!_ready)
            IgnoreWithReason("TcCHG0 chưa dựng được tiền đề nên KHÔNG bấm F8 — đọc lý do ở TcCHG0.");
    }

    private void RequireWalk()
    {
        if (_walk is null)
            IgnoreWithReason("TcCHG1 chưa chạy được lượt F8 — testcase này đọc lại kết quả của nó.");
    }

    // ── TcCHG1 ───────────────────────────────────────────────────────────────

    [Test, Order(2)]
    [Description("TcCHG1 — 既存会計 mặc định 「いいえ」 (Button2), 会計データ修正 mặc định 「はい」 (Button1)")]
    public void TcCHG1_DefaultButtons()
    {
        using var trace = TestTrace.Begin();
        RequireReady();
        EnsureTreatmentScreen(trace);
        FocusRowOfTestDay(trace);

        // ⚠️ LƯỢT F8 DUY NHẤT của cả fixture. Mỗi lượt tốn vài phút và để lại trạng thái
        // (F8 đóng 診療入力, mở 窓口精算), nên TcCHG2/3/4 đọc lại kết quả chốt ở đây thay
        // vì bấm F8 thêm ba lần cho cùng một chuỗi.
        var walk = AccountingFlow.WalkToChgAccData(App, Screen.Window, trace);
        _walk = walk;

        TestContext.Out.WriteLine($"chuỗi hộp thoại thật ({walk.Trail.Count} cái trung gian):");
        foreach (var s in walk.Trail) TestContext.Out.WriteLine("        " + s);
        TestContext.Out.WriteLine($"hộp đích 「{AccountingFlow.ChgAccDataFragment}」 " +
                                  $"mặc định = 「{walk.TargetDefaultButton}」");

        Assert.That(walk.Reached, Is.True,
            "Chuỗi F8 không tới được hộp thoại 会計データ修正.\n\n" + (walk.Diagnosis ?? ""));

        // ── Hộp 1: 既に…会計処理…されていますが (modAcc.cs:562, Button2) ────────
        var existing = walk.SeenWith("既に");
        Assert.That(existing, Is.Not.Null,
            "precheck báo 既存会計あり mà không gặp hộp 「既に、¥N の会計処理がされていますが…」. " +
            $"Chuỗi đã gặp: {string.Join(" | ", walk.Trail.Select(s => s.Text))}");
        Assert.That(existing!.DefaultButton, Is.Not.Empty,
            "không đọc được nút giữ con trỏ của hộp 既存会計 — không kết luận được về mặc định. " +
            $"Các nút của nó: {string.Join("/", existing.Buttons)}");
        Assert.That(AccountingFlow.IsNegativeButton(existing.DefaultButton), Is.True,
            $"hộp 既存会計 đang mặc định 「{existing.DefaultButton}」. WinForm để " +
            "MessageBoxDefaultButton.Button2 (modAcc.cs:562) — tức いいえ. Mặc định はい thì " +
            "người dùng bấm Enter theo phản xạ sẽ chồng thêm một 未精算 ĐỦ TIỀN lên ngày đã " +
            "thu (nhánh :566 đặt past_billing_amount = 0), tức THU TIỀN HAI LẦN.");

        // ── Hộp đích: 処置点数が…計上しますか？ (modAcc.cs:956, Button1) ─────────
        Assert.That(walk.TargetDefaultButton, Is.Not.Empty,
            "không đọc được nút giữ con trỏ của hộp 会計データ修正.");
        Assert.That(AccountingFlow.IsAffirmativeButton(walk.TargetDefaultButton), Is.True,
            $"hộp 会計データ修正 đang mặc định 「{walk.TargetDefaultButton}」. WinForm để " +
            "MessageBoxDefaultButton.Button1 (modAcc.cs:956) — tức はい, NGƯỢC với hai hộp " +
            "phía trên. Đừng gạt mặc định của cả ba hộp về một phía cho gọn.");

        // Trả lời いいえ: ChgAccData chỉ ghi trong nhánh Yes, nên sổ tiền không bị đụng.
        var text = AccountingFlow.Answer(walk.Target!, yes: false, trace);
        TestContext.Out.WriteLine($"nguyên văn hộp đích: 「{text}」");

        // Chốt trạng thái DB NGAY SAU lượt F8 — TcCHG2/3 đọc lại từ đây.
        Waits.TryUntil(() => App.Window("frm204002") is not null, TimeSpan.FromSeconds(30));
        _unpaidAfter = _db!.ReadUnpaidKeys(PatNo, TrtDate);
        _markerAliveAfter = _db.MarkerUnpaidExists(PatNo, TrtDate);
        _accAfter = _db.ReadAccDat(PatNo, TrtDate);

        trace.Note($"sau F8: UNPAID {_unpaidAfter.Count} dong, dong moc con song = {_markerAliveAfter}, " +
                   $"ACCDAT {_accAfter.Count} dong");
        trace.Shot("TcCHG1-sau-khi-tra-loi");
    }

    // ── TcCHG2 ───────────────────────────────────────────────────────────────

    [Test, Order(3)]
    [Description("TcCHG2 — nhánh 会計データ修正 chỉ SỬA sổ, KHÔNG tạo 未精算 mới; và F8 vẫn sang 窓口精算")]
    public void TcCHG2_BranchGCreatesNoUnpaid()
    {
        RequireWalk();

        TestContext.Out.WriteLine(
            $"UNPAID sau F8: {(_unpaidAfter.Count == 0 ? "(rỗng)" : string.Join(" | ", _unpaidAfter))}");

        // Nhánh F (modAcc.cs:640…) là chỗ DUY NHẤT gọi UnPaid.insertUnPaid. Đi nhánh G mà
        // vẫn thấy dòng mới ⇒ hoặc đã đi nhầm nhánh, hoặc có producer thứ hai.
        var created = _unpaidAfter.Where(k => k.KmCd != OchaDbAccounting.MarkerKmCd)
                                  .Where(k => !_unpaidBefore.Contains(k))
                                  .ToList();
        Assert.That(created, Is.Empty,
            "nhánh 会計データ修正 mà vẫn sinh ra 未精算データ — WinForm chỉ sửa ACCDAT/PERSON_EXP ở " +
            $"nhánh này (modAcc.cs:778). Dòng mới: {string.Join(" | ", created)}. " +
            "Thấy dòng mới thường nghĩa là chuỗi đã rẽ sang nhánh F (入金指定) chứ không phải G.");

        // Trả lời いいえ ⇒ ChgAccData không vào nhánh ghi (modAcc.cs:956) ⇒ sổ y nguyên.
        Assert.That(_accAfter.Count, Is.EqualTo(_accBefore.Count),
            $"trả lời いいえ mà số dòng ACCDAT đổi ({_accBefore.Count} → {_accAfter.Count}) — " +
            "ChgAccData chỉ được ghi trong nhánh DialogResult.Yes.");
        foreach (var before in _accBefore)
        {
            var after = _accAfter.FirstOrDefault(r => r.AccCnt == before.AccCnt && r.KmCd == before.KmCd);
            Assert.That(after, Is.Not.Null,
                $"dòng ACCDAT acc_cnt={before.AccCnt} km_cd={before.KmCd} biến mất sau khi trả lời いいえ");
            Assert.That((after!.Score, after.ClaimAmt, after.ReceAmt),
                Is.EqualTo((before.Score, before.ClaimAmt, before.ReceAmt)),
                $"trả lời いいえ mà dòng ACCDAT km_cd={before.KmCd} bị sửa: " +
                $"score {before.Score}→{after.Score}, claim {before.ClaimAmt}→{after.ClaimAmt}, " +
                $"rece {before.ReceAmt}→{after.ReceAmt}");
        }

        // Bản web: `await expect(page).toHaveURL(/\/counter-payments\//)`. Bên này là cửa sổ.
        // frm203002.cs:7741-7742 — LetAccData2 trả true ⇒ showForm(ID204002) rồi Close().
        Assert.That(App.Window("frm204002"), Is.Not.Null,
            "F8 phải sang 窓口精算 (frm204002) sau khi LetAccData2 trả true — kể cả khi trả lời " +
            "いいえ cho 会計データ修正, vì ChgAccData trả void và modAcc.cs:783 vẫn đặt " +
            "functionReturnValue = true.");
    }

    // ── TcCHG3 ───────────────────────────────────────────────────────────────

    [Test, Order(4)]
    [Description("TcCHG3 — deleteTrtDtUnPaid chạy VÔ ĐIỀU KIỆN: dòng 未精算 mốc mất dù nhánh này KHÔNG insert")]
    public void TcCHG3_DeleteRunsEvenWithoutInsert()
    {
        RequireWalk();

        TestContext.Out.WriteLine(
            $"dòng mốc (km_cd={OchaDbAccounting.MarkerKmCd}) còn sống sau F8 = {_markerAliveAfter}");

        // Vì sao đây là bằng chứng: nhánh G (会計データ修正) KHÔNG gọi UnPaid.insertUnPaid
        // ở bất kỳ đâu — TcCHG2 vừa chốt là không có dòng 未精算 nào được tạo. Nên nếu dòng
        // mốc biến mất thì chỉ còn một chỗ có thể xoá nó: modAcc.cs:428, chạy ngay sau cổng
        // ngày và TRƯỚC cả chỗ rẽ nhánh ở :598.
        //
        // Đây đúng là điều mà TC-CHG-3 bên Playwright chứng minh, chỉ khác đường tới: bên
        // đó dựng được nhánh 金額同一 (modAcc.cs:571 return sớm) nhờ giả lập precheck; bên
        // này bệnh nhân 公費単独 nên cur.insPrice luôn 0 và không bao giờ bằng past ¥1.020.
        Assert.That(_markerAliveAfter, Is.False,
            $"dòng 未精算 mốc (km_cd={OchaDbAccounting.MarkerKmCd}, nte={OchaDbAccounting.MarkerNte}) " +
            "VẪN CÒN sau lượt F8. UnPaid.deleteTrtDtUnPaid phải chạy vô điều kiện ở " +
            "modAcc.cs:428 — trước mọi hộp thoại, trước cả chỗ rẽ nhánh. Còn sót nghĩa là " +
            "窓口精算 sẽ thu chồng lên số vừa sửa (đúng lỗi ISSUE-13-a mà bản web mắc phải " +
            "khi chôn bước xoá bên trong insert-unpaid).\n" +
            "Nếu WinForm thật sự có xoá mà testcase vẫn đỏ: kiểm RAIIN_CNT — DELETE lọc " +
            "`trt_cnt % 100 = @trt_cnt` (UnPaid.cs:357), seed sai con số đó là không trúng dòng.");
    }

    // ── TcCHG4 ───────────────────────────────────────────────────────────────

    [Test, Order(5)]
    [Description("TcCHG4 — hộp 差額 cũng mặc định 「いいえ」 (Button2); dữ liệu không dựng được thì Ignore")]
    public void TcCHG4_DiffDialogDefaultsToNo()
    {
        RequireWalk();

        var diff = _walk!.SeenWith("増えています");
        if (diff is null)
            IgnoreWithReason(
                "Chuỗi F8 của lượt này KHÔNG đi qua hộp 「会計処理後、請求金額が増えています。" +
                "差額分の未精算データ…作成しますか？」 (modAcc.cs:578-581).\n\n" +
                "  Đây là DỮ LIỆU, không phải lỗi app. Hộp đó chỉ mở khi " +
                "`cur >= past` ở CẢ BA vế (医療保険 / 介護保険 / 自費). Bệnh nhân test là " +
                $"公費単独 nên cur.insPrice = 0, còn dòng 会計 seed là " +
                $"¥{AccountingPreconditions.SeedClaimAmt} ⇒ không bao giờ `cur >= past`.\n\n" +
                "  Muốn đo: trỏ patient.patNo sang hồ sơ có 保険 tự trả khác 0, hoặc hạ " +
                "AccountingPreconditions.SeedClaimAmt xuống dưới 請求金額 hiện tại của ngày.\n\n" +
                $"  Chuỗi đã gặp: {string.Join(" | ", _walk.Trail.Select(s => s.Text))}");

        TestContext.Out.WriteLine($"hộp 差額: 「{diff!.Text}」 mặc định = 「{diff.DefaultButton}」");

        Assert.That(diff.DefaultButton, Is.Not.Empty,
            "không đọc được nút giữ con trỏ của hộp 差額.");
        Assert.That(AccountingFlow.IsNegativeButton(diff.DefaultButton), Is.True,
            $"hộp 差額 đang mặc định 「{diff.DefaultButton}」. WinForm để " +
            "MessageBoxDefaultButton.Button2 (modAcc.cs:581) — tức いいえ, vì chính いいえ mới " +
            "là đường dẫn sang 会計データ修正; はい tạo một dòng 未精算 chênh lệch rồi rẽ hẳn " +
            "sang nhánh F.");
    }

    /// <summary>
    /// Đặt con trỏ vào một dòng của ĐÚNG <c>patient.trtDate</c> trước khi bấm F8.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO BẮT BUỘC — đo được 2026-09-03, lượt chạy đầu tiên ĐỎ vì thiếu nó
    /// ═══════════════════════════════════════════════════════════════════════════
    /// <c>LetAccData2</c> tính <c>dtTgtDate</c> từ ô 日 của <b>DÒNG CON TRỎ</b>, không
    /// phải từ ngày mở màn hình — đó chính là bug mà
    /// <c>../web-tenant-tests/tests/accounting-target-date.spec.ts</c> khoá lại. Rồi
    /// <c>past_billing_amount</c> lấy từ <c>ACCDAT</c> của <b>ngày đó</b>
    /// (<c>GetAccData</c> → <c>AccDat.getInpAccDat</c>, lọc <c>trt_dt</c> + <c>del_flg = 0</c>).
    ///
    /// <para>Tiền đề chỉ seed 会計 cho MỘT ngày (<c>patient.trtDate</c>). Con trỏ nằm ở
    /// ngày khác ⇒ <c>past_billing_amount = 0</c> ⇒ modAcc.cs:598 rẽ sang <b>nhánh F</b>,
    /// mở 入金指定 và <b>ghi một dòng 未精算 vào ngày đó</b>. Lượt 14:50 ngày 2026-09-03
    /// đúng như vậy: lưới của bệnh nhân test nay có ba ngày (3, 14, 25), con trỏ rơi vào
    /// 25, và chuỗi để lại rác <c>UNPAID</c> ở 2026-08-25 — một ngày mà teardown của
    /// fixture này (chỉ dọn <c>TrtDate</c>) không hề biết tới.</para>
    ///
    /// <para>⚠️ <see cref="ChgAccDataTests"/> cũng KHÔNG đặt con trỏ. Hồi 2026-08-11 nó
    /// vẫn xanh vì lưới lúc đó chỉ có một ngày; giờ thì không còn đúng nữa.</para>
    /// </summary>
    private void FocusRowOfTestDay(TestTrace trace)
    {
        var days = _dayFlow!.DaysOnGrid();
        trace.Note($"cac ngay tren luoi: {string.Join(", ", days)}; can dat con tro vao {TrtDate.Day}");

        var row = _dayFlow.RowForDay(TrtDate.Day);
        if (row is null)
            IgnoreWithReason(
                $"lưới không có dòng 処置 nào của ngày {TrtDate:yyyy-MM-dd} (日 = {TrtDate.Day}), " +
                $"mà tiền đề chỉ seed 会計 cho đúng ngày đó. Các ngày đang có: " +
                $"{string.Join(", ", days)}.\n\n" +
                "  Bấm F8 lúc này thì con trỏ ở ngày khác ⇒ past_billing_amount = 0 ⇒ " +
                "modAcc.cs:598 rẽ sang nhánh F và GHI một dòng 未精算 vào ngày đó. " +
                "Đổi patient.trtDate sang ngày có 処置.");

        _dayFlow.FocusRow(row!, trace);
    }

    /// <summary>
    /// Đưa app về màn 診療入力. Chép cách làm của <see cref="ChgAccDataTests"/> — F8 ĐÓNG
    /// 診療入力 rồi mở 窓口精算 khi <c>LetAccData2</c> trả true (frm203002.cs:7741-7742),
    /// và phải CHỜ app ổn định rồi mới hỏi nó đang ở đâu (hỏi một lần về một trạng thái
    /// đang chuyển tiếp là cái bẫy đã làm treo Tc8-2 ba lượt liền).
    /// </summary>
    private void EnsureTreatmentScreen(TestTrace trace)
    {
        var settled = Waits.TryUntil(
            () => App.Window("frm203002") is not null || App.Window("frm204002") is not null,
            TimeSpan.FromSeconds(20));

        trace.Note(settled
            ? $"app dang o: {(App.Window("frm203002") is not null ? "診療入力" : "窓口精算")}"
            : "CANH BAO — sau 20s app khong o 診療入力 lan 窓口精算; van thu mo lai");

        var closed = AccountingFlow.LeaveCounterPayment(App, trace);
        if (!closed && TreatmentScreenAlive()) return;

        trace.Do("mo lai man 診療入力", ReopenTreatmentScreen);
    }
}
