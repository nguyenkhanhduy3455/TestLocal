using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// Nền chung cho các fixture <b>có seed</b> của luồng <c>exit_flg</c>: chụp/in/dọn lịch sử
/// 算定, và một khung <see cref="RunOn"/> kiểm đủ tiền đề trước khi gõ.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// SEED NẰM SAU CỜ RIÊNG, VÀ ĐI THEO ĐÚNG BA BƯỚC CỦA F20
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>Chụp nguyên trạng TRƯỚC khi seed</b> và <b>IN RA STDOUT</b> — bị Ctrl+C giữa
///     chừng thì còn dựng lại bằng tay. Chụp sau là chụp phải chính cái mốc mình vừa ghi đè.</item>
///   <item><b>Seed TRƯỚC KHI APP MỞ</b> (<c>PrepareDataBeforeApp</c>): <c>ModSave.trtDataList</c>
///     nạp một lần lúc mở 診療入力, ghi sau đó thì app không bao giờ thấy (F20).</item>
///   <item><b>Trả lại ở <c>OneTimeTearDown</c></b>, rồi <b>đếm lại</b> để khẳng định đã sạch.</item>
/// </list>
///
/// <para>Cờ là <c>cmtPack.allowSeed</c> — <b>riêng của luồng</b>, không dùng chung
/// <c>parity.allowSave</c>/<c>autoSantei.allowSave</c> (F20). Tắt ⇒ fixture tự
/// <c>Ignore</c> TRƯỚC khi mở app.</para>
/// </summary>
public abstract class CmtPackUiTestBase : UiTestBase
{
    protected CmtPackSeedDb? Seeder { get; private set; }
    protected CmtPackDb? Master { get; private set; }
    protected SigaToothFlow Flow { get; private set; } = null!;
    protected CmtPackCascade Cascade { get; private set; } = null!;

    /// <summary>Các dòng lịch sử mà fixture cần dựng. Rỗng ⇒ fixture không seed gì.</summary>
    /// <param name="Day">Ngày trong tháng test.</param>
    protected sealed record SeedRow(int Day, int TrtCd, int TrtSb, int TrtPt, string DspTrt)
    {
        public override string ToString() => $"ngày {Day} · {TrtCd}/{TrtSb} {TrtPt}点 「{DspTrt}」";
    }

    /// <summary>Fixture khai ở đây nó cần lịch sử gì. Rỗng = không seed.</summary>
    protected virtual IReadOnlyList<SeedRow> SeedRows => [];

    protected static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>Ca này ĐANG ĐO chuỗi hộp thoại — không để watcher trả lời hộ (F19).</summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (SeedRows.Count == 0) return null;
        return TestSettings.Current.CmtPack.AllowSeed
            ? null
            : "Fixture này cần dựng LỊCH SỬ算定 trong TRNTRN (dải disp_no 9100..9199) — bật " +
              "cmtPack.allowSeed = true trong testsettings.local.json. Không có lịch sử thì các " +
              "handler 口管強/ＳＰＴ im lặng, và 「im lặng vì bị cắt」 không phân biệt được với " +
              "「im lặng vì điều kiện không thoả」.";
    }

    protected override void PrepareDataBeforeApp()
    {
        Seeder = CmtPackSeedDb.CreateOrNull(Settings);
        if (SeedRows.Count == 0) return;

        if (Seeder is null)
            Assert.Ignore("Cần db.enabled = true + connectionString để seed lịch sử 算定.");
        if (Seeder!.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} " +
                          "(container OCHASQLEXPRESS trên máy Mac còn chạy không?)");

        var patNo = int.Parse(Settings.Patient.PatNo);
        var month = Settings.Patient.ResolvedTrtDate;

        // ── ① chụp nguyên trạng, IN RA, TRƯỚC khi đụng vào ──────────────────
        Log($"=== NGUYÊN TRẠNG TRNTRN của bệnh nhân {patNo}, tháng {month:yyyy-MM} " +
            "(chụp TRƯỚC khi seed) ===");
        foreach (var r in Seeder.MonthRows(patNo, month)) Log("   " + r);

        var leftover = Seeder.CountSeeded(patNo);
        if (leftover > 0)
        {
            Log($"⚠️ còn {leftover} dòng SÓT trong dải seed từ lượt trước — dọn trước khi seed mới.");
            Seeder.DeleteSeeded(patNo);
        }

        // ── ② seed, TRƯỚC KHI APP MỞ ────────────────────────────────────────
        Log("=== SEED ===");
        foreach (var row in SeedRows)
        {
            var dt = new DateTime(month.Year, month.Month, row.Day);
            var disp = Seeder.SeedTreatmentRow(patNo, dt, row.TrtCd, row.TrtSb, row.TrtPt, row.DspTrt);
            Log($"   + disp_no {disp} · {row}");
        }
    }

    [OneTimeTearDown]
    public void CmtPackSeedTearDown()
    {
        if (Seeder is null || SeedRows.Count == 0) return;

        try
        {
            var patNo = int.Parse(Settings.Patient.PatNo);
            var deleted = Seeder.DeleteSeeded(patNo);
            var left = Seeder.CountSeeded(patNo);
            Log($"=== DỌN === xoá {deleted} dòng seed; còn lại trong dải 9100..9199: {left}");
            if (left > 0)
                Log($"⛔ CÒN SÓT {left} dòng — dọn tay: " +
                    $"DELETE FROM TRNTRN WHERE PAT_NO = {patNo} AND DISP_NO BETWEEN " +
                    $"{CmtPackSeedDb.SeedDispBase} AND {CmtPackSeedDb.SeedDispMax}");
            Log($"(dòng 再初診 disp_no = {CmtPackSeedDb.ProtectedDispNo} KHÔNG nằm trong dải seed " +
                "nên không bị đụng tới.)");
        }
        catch (Exception e)
        {
            Log($"⛔ DỌN HỎNG: {e.Message} — dọn tay theo câu DELETE ở trên TRƯỚC khi chạy lượt sau.");
        }
    }

    [SetUp]
    public void CmtPackUiSetUp()
    {
        Master ??= CmtPackDb.CreateOrNull(Settings);
        Flow = new SigaToothFlow(App, Screen);
        Cascade = new CmtPackCascade(App, Flow);
    }

    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Gõ <paramref name="trtCd"/>/<paramref name="trtSb"/> vào <b>ngày <paramref name="day"/></b>
    /// của lưới rồi trả lời chuỗi hộp thoại theo <paramref name="plan"/>.
    ///
    /// <para><b>Chọn ngày bằng cách chèn dưới dòng cuối của ngày đó</b> — <c>ModMain.AutoDate</c>
    /// chép ô 日 từ dòng bên trên, nên không cần helper đổi ngày. Đổi lại: ngày đó <b>phải
    /// đã có ít nhất một dòng</b> trong lưới, và ca đo phải nói rõ điều kiện ấy.</para>
    /// </summary>
    protected CmtPackCascade.CascadeMeasure RunOn(int day, int trtCd, int trtSb,
                                                  CmtPackCascade.Plan plan, TestTrace trace)
    {
        var below = ScrollToLastRowOfDay(day, trace);
        Assert.That(below, Is.Not.Null,
            $"Lưới không có dòng nào của ngày {day} để chèn xuống dưới ⇒ HARNESS/DỮ LIỆU hỏng, " +
            "không phải app. Ngày đó phải có sẵn 処置 (đã lưu hoặc vừa gõ) thì AutoDate mới chép " +
            "được ô 日.");

        Assert.That(Txt.Int(below!.Day), Is.EqualTo(day),
            $"Dòng mốc đọc ra ngày 「{below.Day}」 chứ không phải {day} — LastRowOfDay đã lui về " +
            "dòng cuối lưới (xem trace). Gõ tiếp là gõ NHẦM NGÀY và mọi kết luận về cửa sổ ngày " +
            "đều sai.");

        var m = Cascade.Run(below, trtCd, trtSb, plan, trace);
        Assert.That(m, Is.Not.Null,
            "Không đưa được ô 点 về コードモード, hoặc Insert không chèn được dòng trống ⇒ HARNESS " +
            "hỏng (đọc _trace.log), KHÔNG phải app thiếu chức năng.");

        Log($"— gõ {trtCd}/{trtSb} vào ngày {day}: {m}");
        Log("  chuỗi hộp thoại:");
        foreach (var d in m!.Dialogs) Log($"     {d}");
        Log("  dòng comment rơi xuống lưới:");
        foreach (var t in m.CommentTexts) Log($"     「{t}」");

        Assert.That(m.InsertedTreatmentRow, Is.True,
            $"Dòng {trtCd}/{trtSb} KHÔNG vào được lưới ⇒ TIỀN ĐỀ chưa thành, đừng đọc phần hộp " +
            "thoại/comment.\n  Hộp thoại: " + string.Join(" | ", m.Dialogs));

        return m;
    }

    /// <summary>
    /// Dòng CUỐI của ngày <paramref name="day"/>, <b>đã cuộn vào khung nhìn</b>.
    ///
    /// <para>⚠️ <b>Vì sao cần cuộn</b> (F10). UIA của <c>DataGridView</c> chỉ dựng phần tử
    /// cho dòng ĐANG NHÌN THẤY, nhưng nó vẫn phơi ra một số dòng vừa ra khỏi khung với
    /// <c>BoundingRectangle</c> RỖNG — click vào đó là bắn chuột ra <c>(0,0)</c>, tức góc
    /// trái trên DESKTOP (xem <c>TreatmentGridOps.FocusCell</c>).</para>
    ///
    /// <para><b>Đã trả giá 2026-09-17 (TCX-15 lượt đầu):</b> ca đo gõ 歯清 vào ngày 3 trước
    /// (lưới 22 → 26 dòng), rồi định gõ tiếp vào ngày 14 — mà dòng ngày 14 lúc đó đã bị đẩy
    /// xuống dưới đáy khung nhìn. <c>FocusCell</c> ném đúng chỗ và ném đúng lý do, nhưng ca
    /// đo thì mất trắng một lượt chạy. Mọi ca <b>hai ngày</b> phải đi qua hàm này.</para>
    ///
    /// <para>Cuộn bằng <b>Page Down</b> chứ không bằng thanh cuộn: cầu MSAA→UIA của
    /// <c>DataGridView</c> không phơi ra <c>ScrollBar</c> nào để mà kéo.</para>
    /// </summary>
    protected RegiRow? ScrollToLastRowOfDay(int day, TestTrace trace, int maxPageDowns = 8)
    {
        for (var attempt = 0; attempt <= maxPageDowns; attempt++)
        {
            var target = new CmtPackOps(Flow).LastRowOfDay(day, trace);
            if (target is not null && Txt.Int(target.Day) == day && HasRect(target))
            {
                if (attempt > 0) trace.Note($"cuon {attempt} lan thi dong cua ngay {day} vao khung nhin");
                return target;
            }

            // Mốc để bấm Page Down: dòng CUỐI còn rect thật. Không có thì không cuộn được.
            var anchor = Flow.Grid.Snapshot().LastOrDefault(HasRect);
            if (anchor is null)
            {
                trace.Note("⛔ khong con dong nao co rect that de bam Page Down — luoi dang bi che? " +
                           "Doc anh truoc khi ket luan.");
                trace.Shot("khong-cuon-duoc-luoi");
                return target;
            }

            trace.Do($"cuon luoi: Page Down tu dong 「{anchor}」 (lan {attempt + 1})", () =>
            {
                Flow.Grid.FocusCell(anchor, RegiGrid.Col.Day);
                // Click vào ô 日 có thể mở editor; Enter đóng lại mà KHÔNG đổi giá trị.
                // ⛔ Đừng dùng ESC — trên lưới 処置 nó là 戻る và bung dirty gate (F14).
                if (Flow.Grid.IsEditing()) Flow.Grid.Press(VirtualKeyShort.RETURN);
                Flow.Grid.Press(VirtualKeyShort.NEXT);
            });
        }

        trace.Note($"⛔ cuon {maxPageDowns} lan van khong dua duoc dong cua ngay {day} vao khung nhin.");
        trace.Shot($"khong-cuon-toi-ngay-{day}");
        return new CmtPackOps(Flow).LastRowOfDay(day, trace);
    }

    private static bool HasRect(RegiRow row)
    {
        var cells = Uia.Children(row.Element).ToList();
        if (cells.Count == 0) return false;
        var rect = Uia.RectOf(cells[0]);
        return rect is { Width: > 0, Height: > 0 };
    }

    /// <summary>In master của một 処置 ra log — để lượt đỏ sau này biết nó đang đo cái gì.</summary>
    protected void LogMaster(int trtCd, int trtSb)
    {
        if (Master is null) return;
        Log($"master: {trtCd}/{trtSb} ngày {TrtDate:yyyy-MM-dd} kích hoạt:");
        foreach (var p in Master.PacksFor(trtCd, trtSb, TrtDate))
        {
            Log($"   {p}");
            foreach (var d in Master.Details(p.PackCd, TrtDate)) Log($"        {d}");
        }
    }
}
