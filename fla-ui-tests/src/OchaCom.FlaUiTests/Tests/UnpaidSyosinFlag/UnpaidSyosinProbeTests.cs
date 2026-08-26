using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;
using OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

namespace OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

/// <summary>
/// <b>PROBE — <c>UNPAID.SFLG</c> (初診フラグ) mà F8 会計 ghi ra. KHÔNG assert.</b>
///
/// Bước 2 của <c>fla-ui-tests/PROBE-GUIDELINE.md</c>: chưa biết app thật hành xử ra sao
/// thì đo trước, đừng viết assert theo phỏng đoán.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BUG ĐANG ĐIỀU TRA
/// ═══════════════════════════════════════════════════════════════════════════
/// Tester: 「hệ thống cũ 2 field này 2 ngày có giá trị khác nhau là 2 và 3, nhưng web
/// ra 2 và 2」. Ảnh chụp UNPAID của hệ cũ: bệnh nhân 100 — ngày 25 → SFLG <b>3</b>,
/// ngày 26 → SFLG <b>2</b>; bệnh nhân 1863 ngày 25 → SFLG <b>1</b>.
///
/// Luồng này đo <b>đáp án WinForm</b>: F8 chạy TRỌN VẸN trên một ngày rồi đọc
/// <c>UNPAID.SFLG</c>, và so với ORACLE tính lại từ DB theo đúng modAcc.cs:465-476.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ LUỒNG NÀY GHI DB — khác hẳn AccountingFocusedDay
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>AccountingFocusedDay</c> DỪNG ở cổng ngày nên không ghi gì. Ở đây thì ngược lại:
/// muốn đọc được <c>UNPAID.SFLG</c> thì phải để <c>LetAccData2</c> chạy qua
/// <c>deleteTrtDtUnPaid</c> và insert — tức là <b>ghi thật</b>, và <c>modAcc.cs</c>
/// không có transaction nào để lui.
///
/// <para>Nên fixture: chụp ảnh UNPAID của bệnh nhân TRƯỚC, chạy, đọc, rồi
/// <see cref="UnpaidSyosinDb.RestoreUnpaid"/> trả về nguyên trạng ở
/// <c>[OneTimeTearDown]</c> — chạy kể cả khi probe hỏng giữa chừng.</para>
///
/// <para><b>Trỏ <c>patient.patNo</c> vào bệnh nhân TEST.</b> Khôi phục chỉ dựng lại
/// các cột luồng này đọc; đủ cho bệnh nhân test, KHÔNG đủ cho dữ liệu thật.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// NĂM CÂU HỎI CẦN ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  KQ-1  Bệnh nhân có những ngày 処置 nào, ngày nào có 初診?
///  KQ-2  ORACLE: sflg kỳ vọng cho từng ngày (1 / 2 / 3)?
///  KQ-3  UNPAID đang có gì TRƯỚC khi chạy?
///  KQ-4  Chuỗi hộp thoại ĐẦY ĐỦ của F8 khi đi HẾT (không dừng ở cổng ngày)?
///  KQ-5  Sau khi chạy, UNPAID.SFLG ra bao nhiêu — có khớp oracle không?
///        ATT_DR ra bao nhiêu (báo cáo nói web hardcode 0)?
/// </code>
///
/// <para>Chạy: <c>.\run-unpaid-syosin-flag.ps1 -Diagnostics</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, và nó GHI DB")]
[Category("unpaid-syosin-flag")]
public sealed class UnpaidSyosinProbeTests : UiTestBase
{
    private AccountingDayFlow _flow = null!;
    private UnpaidSyosinDb? _db;
    private IReadOnlyList<UnpaidSyosinDb.UnpaidRow>? _snapshot;

    /// <summary>Tắt watcher — chuỗi F8 toàn 「…続けますか？」 mà phủ định = BỎ CUỘC.</summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.Parity.AllowSave)
            return "chưa bật parity.allowSave. Luồng này để F8 chạy TRỌN VẸN nên GHI THẬT " +
                   "vào UNPAID (modAcc.cs không có transaction). Nó tự khôi phục theo ảnh chụp, " +
                   "nhưng đó là đường lui chứ không phải giấy phép — trỏ patient.patNo vào bệnh " +
                   "nhân TEST trước. Chạy: .\\run-unpaid-syosin-flag.ps1 -Diagnostics";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString để đọc ORACLE và để khôi phục UNPAID";

        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        _db = UnpaidSyosinDb.CreateOrNull(Settings);
        _snapshot = _db?.ReadUnpaid(PatNo);
        TestContext.Out.WriteLine(
            $"ảnh chụp UNPAID của bệnh nhân {PatNo} trước khi chạy: " +
            $"{_snapshot?.Count.ToString() ?? "(không đọc được)"} dòng");
    }

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp() => _flow = new AccountingDayFlow(App, Screen);

    [OneTimeTearDown]
    public void RestoreUnpaid()
    {
        if (_db is null || _snapshot is null) return;
        try
        {
            _db.RestoreUnpaid(PatNo, _snapshot);
            var now = _db.ReadUnpaid(PatNo);
            TestContext.Out.WriteLine(
                $"ĐÃ TRẢ LẠI UNPAID cho bệnh nhân {PatNo}: {now.Count} dòng " +
                $"(ảnh chụp có {_snapshot.Count})");
            foreach (var r in now) TestContext.Out.WriteLine("        " + r);
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG TRẢ LẠI ĐƯỢC UNPAID cho bệnh nhân {PatNo}: {e.Message}. " +
                $"Ảnh chụp cần khôi phục ({_snapshot.Count} dòng):");
            foreach (var r in _snapshot) TestContext.Error.WriteLine("        " + r);
        }
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    [Test, Order(0)]
    [Description("Tc0 — PROBE: F8 ghi UNPAID.SFLG ra bao nhiêu, có khớp oracle không?")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ PROBE UNPAID.SFLG (初診フラグ) — F8 会計 ghi ra gì?              ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
        Log($"bệnh nhân {PatNo} · màn hình mở ở {TrtDate:yyyy-MM-dd} · " +
            $"年月 「{Screen.YearMonth()}」 · HÔM NAY {DateTime.Today:yyyy-MM-dd}");
        trace.Shot("00-man-hinh-ban-dau");

        var oracles = ProbeOracle();
        ProbeExistingUnpaid();
        ProbeRunF8(trace, oracles);

        Log("");
        Log("=== KQ-END === Gửi lại: mọi dòng '=== KQ-' + thư mục artifacts\\screenshots");
        Assert.Pass("PROBE xong — đọc các dòng KQ, không có assert nào ở đây");
    }

    // ── KQ-1 / KQ-2 ──────────────────────────────────────────────────────────

    private IReadOnlyList<UnpaidSyosinDb.DayOracle> ProbeOracle()
    {
        Log("");
        IReadOnlyList<UnpaidSyosinDb.DayOracle> oracles = [];

        if (_db is null) { Kq("1", $"không đọc được DB ({DbUnavailableReason})"); return oracles; }

        Safe("tính oracle", () =>
        {
            Kq("1", $"các ngày 日 trên lưới: [{string.Join(", ", _flow.DaysOnGrid())}]");

            oracles = _db!.DayOracles(PatNo, TrtDate);
            Kq("2", $"ORACLE theo modAcc.cs:465-476 ({oracles.Count} ngày):");
            foreach (var o in oracles) Log("        " + o);

            var distinct = oracles.Select(o => o.ExpectedSflg).Distinct().ToList();
            Kq("2", distinct.Count >= 2
                ? $"có {distinct.Count} giá trị sflg khác nhau [{string.Join(",", distinct)}] ⇒ " +
                  "phân biệt được, bộ đối chiếu dùng được bệnh nhân này."
                : $"MỌI ngày đều ra sflg = {distinct.FirstOrDefault()} ⇒ chưa phân biệt được. " +
                  "Bộ đối chiếu cần bệnh nhân có ít nhất hai ngày ra hai giá trị khác nhau.");

            if (!oracles.Any(o => o.ExpectedSflg == UnpaidSyosinDb.SyosinReFirstVisit))
                Kq("2", "⚠️ KHÔNG ngày nào ra 3 (再初診) — cần một ngày CÓ 初診 và bệnh nhân ĐÃ " +
                        "từng 初診 TRƯỚC tháng này. Đó chính là giá trị mà bug của tester nói tới, " +
                        "nên muốn phủ nó thì phải seed dữ liệu.");
        });

        return oracles;
    }

    // ── KQ-3 ─────────────────────────────────────────────────────────────────

    private void ProbeExistingUnpaid()
    {
        Log("");
        if (_db is null) return;

        Safe("đọc UNPAID hiện có", () =>
        {
            var rows = _db!.ReadUnpaid(PatNo);
            Kq("3", $"UNPAID của bệnh nhân {PatNo} TRƯỚC khi chạy: {rows.Count} dòng");
            foreach (var r in rows) Log("        " + r);
        });
    }

    // ── KQ-4 / KQ-5 ──────────────────────────────────────────────────────────

    private void ProbeRunF8(TestTrace trace, IReadOnlyList<UnpaidSyosinDb.DayOracle> oracles)
    {
        Log("");
        Safe("chạy F8 trọn vẹn", () =>
        {
            // Chọn ngày: ưu tiên ngày mà oracle nói KHÁC 2, để đo được nhánh 初診.
            var pick = oracles.FirstOrDefault(o => o.ExpectedSflg != UnpaidSyosinDb.SyosinRevisit)
                       ?? oracles.FirstOrDefault();
            if (pick is null) { Kq("4", "không có ngày 処置 nào để chạy."); return; }

            var row = _flow.RowForDay(pick.Day);
            if (row is null) { Kq("4", $"lưới không có dòng nào 日 = {pick.Day}."); return; }

            Kq("4", $"chạy F8 trên ngày {pick.Date:yyyy-MM-dd} — oracle nói sflg phải = " +
                    $"{pick.ExpectedSflg} ({pick.Why})");
            _flow.FocusRow(row, trace);

            // ĐI HẾT chuỗi và luôn chọn nhánh TẠO 未精算.
            //
            // KHÔNG dùng AccountingFlow.WalkToChgAccData: bộ luật của lớp đó trả lời
            // 「いいえ」 cho 「…未清算データ…作成してよろしいですか?」 — đúng cho mục tiêu
            // của nó (会計データ修正) nhưng ngược hẳn mục tiêu ở đây. Đo 2026-08-26:
            // chuỗi đi trọn 3 hộp thoại, tới 会計データ修正, mà UNPAID vẫn 0 dòng.
            var walk = UnpaidCreationFlow.PressF8AndCreateUnpaid(App, Screen.Window, trace);

            Kq("4", $"chuỗi hộp thoại ĐẦY ĐỦ ({walk.Trail.Count} cái); có gặp câu " +
                    $"「作成してよろしいですか」 không: {walk.SawCreateUnpaid}");
            for (var i = 0; i < walk.Trail.Count; i++)
                Log($"        [{i + 1}] {walk.Trail[i]}");
            Log("        chẩn đoán: " + walk.Explain);

            trace.Shot("01-sau-chuoi-f8");

            _flow.LeaveCounterPaymentIfOpen(trace);
            Thread.Sleep(800);

            if (_db is null) return;

            var after = _db!.ReadUnpaid(PatNo);
            Kq("5", $"UNPAID SAU khi chạy: {after.Count} dòng");
            foreach (var r in after) Log("        " + r);

            var forDay = after.Where(r => r.TrtDt.Date == pick.Date.Date).ToList();
            if (forDay.Count == 0)
            {
                Kq("5", $"KHÔNG có dòng UNPAID nào cho {pick.Date:yyyy-MM-dd} ⇒ chuỗi F8 chưa " +
                        "chạy tới bước tạo 未精算. Xem chuỗi hộp thoại ở KQ-4 để biết nó rẽ đâu.");
                return;
            }

            foreach (var r in forDay)
            {
                var ok = r.Sflg == pick.ExpectedSflg;
                Kq("5", $"{r}  ⇒ sflg đo được {r.Sflg} / oracle {pick.ExpectedSflg} — " +
                        (ok ? "KHỚP" : "LỆCH"));
            }

            Kq("5", $"ATT_DR đo được: [{string.Join(", ", forDay.Select(r => r.AttDr))}] " +
                    "— WinForm ghi ModCommon.pintDrNo (担当医, modAcc.cs:640). Báo cáo điều tra " +
                    "nói bản web đang hardcode 0; đây là con số để đối chiếu.");
        });
    }
}
