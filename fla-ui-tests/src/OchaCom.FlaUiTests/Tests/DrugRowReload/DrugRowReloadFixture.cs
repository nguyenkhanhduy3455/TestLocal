using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.DrugPathB;

namespace OchaCom.FlaUiTests.Tests.DrugRowReload;

/// <summary>
/// Nền chung của <b>G3 — dựng lại dòng thuốc khi LOAD lưới</b>: seed dữ liệu, dọn dữ
/// liệu, và các mốc dò dòng. <see cref="DrugRowReloadProbeTests"/> (đo) và
/// <see cref="DrugRowReloadTests"/> (assert) dùng CHUNG lớp này.
///
/// <para>Vì sao chung: hai fixture phải seed <b>y hệt nhau</b>, nếu không thì con số
/// probe in ra không còn nói gì về con số assert đo. Chép đôi là chỗ chắc chắn sẽ lệch
/// sau vài lần sửa.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BỐN DÒNG SEED — ba dòng đầu ĐÚNG BẰNG vế Playwright
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>treatment-grid/drug-row-rebuild-on-load.spec.ts:214-218</c> seed đúng ba dòng;
/// ở đây seed y hệt rồi thêm một dòng ĐỐI CHỨNG mà vế web chưa có.
/// <code>
///   点 771  602/0  freewd ""      dsp_trt ｽﾃｰﾙ…1   ← path A, master nguyên bản
///   点 772  602/0  freewd "1"     dsp_trt ｽﾃｰﾙ…2   ← path A, freewd khác mặc định
///   点 773  694/0  freewd ""      dsp_trt ｽﾃｰﾙ…3   ← path B (mã seed, không có RX)
///   点 774  110/0  freewd ""      dsp_trt ｽﾃｰﾙ…4   ← ĐỐI CHỨNG, ngoài dải 600–699
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÁC HẲN G1/G2: LUỒNG NÀY KHÔNG NHẬP GÌ
/// ═══════════════════════════════════════════════════════════════════════════
/// Seed phải xong TRƯỚC <c>OchaApp.LaunchOrAttach</c> — tức trong
/// <see cref="PrepareDataBeforeApp"/>. <c>ModSave.GetTrnRs</c> đọc <c>TRNTRN</c> đúng
/// một lần trong <c>frmInpMain_Load_Method</c>; chèn sau khi 診療入力 đã mở thì app
/// không bao giờ thấy (cùng họ với bẫy F21, chỉ khác là thứ nạp một lần ở đây là cả
/// cái lưới).
/// </summary>
public abstract class DrugRowReloadFixture : UiTestBase
{
    protected DrugRowReloadDb? Db2;
    protected DrugPathBDb? MasterDb;
    protected DrugRowReloadDb.SeedResult? Seed;
    protected DrugPathBDb.SeedResult? MasterSeed;
    protected DrugRowReloadDb.DrugMaster? Master;
    protected DrugRowReloadFlow Flow = null!;

    /// <summary>使用量 ghi vào <c>freewd</c> của dòng thứ hai — cố ý KHÁC master.</summary>
    protected string FreeWd = "";

    protected TestSettings.DrugRowReloadSection Cfg => Settings.DrugRowReload;

    // Bốn dòng: 0 = path A freewd rỗng · 1 = path A có freewd · 2 = path B · 3 = đối chứng.
    protected int PtPlain => Cfg.MarkerPoint;
    protected int PtFreeWd => Cfg.MarkerPoint + 1;
    protected int PtPathB => Cfg.MarkerPoint + 2;
    protected int PtControl => Cfg.MarkerPoint + 3;

    protected IReadOnlyList<int> SeedDispNos =>
        [Cfg.DispNo, Cfg.DispNo + 1, Cfg.DispNo + 2, Cfg.DispNo + 3];

    protected IReadOnlyList<(int, int)> SeedMasterKeys => [(Cfg.PathBTrtCd, Cfg.TrtSb)];

    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.DrugRowReload.AllowSeed)
            return "drugRowReload.allowSeed = false. Luồng này đo ĐƯỜNG LOAD nên dữ liệu " +
                   "phải nằm sẵn trong TRNTRN trước khi màn hình mở — không seed thì không " +
                   "có gì để đọc. ⚠️ Bật cờ nghĩa là CHÈN dòng vào TRNTRN (処置行 thật của " +
                   "bệnh nhân) và một mã master mới; lượt chạy chỉ CHÈN rồi XOÁ.";
        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        Db2 = DrugRowReloadDb.CreateOrNull(Settings);
        MasterDb = DrugPathBDb.CreateOrNull(Settings);
        if (Db2 is null || MasterDb is null)
        {
            TestContext.Out.WriteLine("KHÔNG seed được: db.enabled = false hoặc thiếu chuỗi kết nối.");
            Db2 = null;
            return;
        }

        if (Db2.ProbeError() is { } err)
        {
            TestContext.Out.WriteLine($"KHÔNG seed được: không kết nối được SQL Server — {err}");
            Db2 = null;
            return;
        }

        var before = Db2.ReadDay(PatNo, TrtDate);
        TestContext.Out.WriteLine(
            $"TRNTRN của bệnh nhân {PatNo} ngày {TrtDate:yyyy-MM-dd} TRƯỚC khi seed " +
            $"({before.Count} dòng):");
        foreach (var r in before) TestContext.Out.WriteLine("    " + r);

        // Dọn trước: lượt chạy trước chết giữa chừng thì hàng rào sẽ chặn, mà chặn xong
        // fixture cũng không đo được gì.
        TestContext.Out.WriteLine("DỌN TRƯỚC (TRNTRN) — " + Db2.Cleanup(PatNo, TrtDate, SeedDispNos));
        try { TestContext.Out.WriteLine("DỌN TRƯỚC (master) — " + MasterDb.Cleanup(TrtDate, SeedMasterKeys)); }
        catch (Exception e) { TestContext.Out.WriteLine("DỌN TRƯỚC (master) ném: " + e.Message); }

        Master = Db2.Master(TrtDate, Cfg.TrtCd, Cfg.TrtSb);
        TestContext.Out.WriteLine($"MASTER {Cfg.TrtCd}/{Cfg.TrtSb} = " +
                                  (Master?.ToString() ?? "KHÔNG TÌM RA"));

        // 使用量 seed phải KHÁC mặc định của master, nếu không phép đo freewd không phân
        // biệt được 「có đọc freewd」 với 「chỉ dựng theo master」. Đúng công thức của vế
        // Playwright (drug-row-rebuild-on-load.spec.ts:192).
        FreeWd = Master is not null && Master.DefaultCnt == "1" ? "2" : "1";
        TestContext.Out.WriteLine(
            $"freewd đem thử = 「{FreeWd}」 (master cnt1 = 「{Master?.DefaultCnt}」)");

        // Mã path B: CLONE từ chính mã path A ⇒ mọi cột khác (F2, grp, 単位…) giống dữ
        // liệu thật, và mã mới thì đương nhiên không có MST_DRUG_RX ⇒ rơi thẳng path B.
        MasterSeed = MasterDb.SeedCodes(TrtDate, (Cfg.TrtCd, Cfg.TrtSb),
        [
            new DrugPathBDb.SeedSpec(Cfg.PathBTrtCd, Cfg.TrtSb, Cfg.PathBTrtNm, Cfg.PathBUsage),
        ]);
        TestContext.Out.WriteLine("SEED MASTER — " + MasterSeed);

        Seed = Db2.Seed(PatNo, TrtDate,
        [
            new DrugRowReloadDb.SeedRow(Cfg.DispNo, Cfg.TrtCd, Cfg.TrtSb, Cfg.TrtCnt,
                                        PtPlain, "", Cfg.Stale + "1"),
            new DrugRowReloadDb.SeedRow(Cfg.DispNo + 1, Cfg.TrtCd, Cfg.TrtSb, Cfg.TrtCnt,
                                        PtFreeWd, FreeWd, Cfg.Stale + "2"),
            new DrugRowReloadDb.SeedRow(Cfg.DispNo + 2, Cfg.PathBTrtCd, Cfg.TrtSb, Cfg.TrtCnt,
                                        PtPathB, "", Cfg.Stale + "3"),
            new DrugRowReloadDb.SeedRow(Cfg.DispNo + 3, Cfg.ControlTrtCd, Cfg.ControlTrtSb,
                                        Cfg.TrtCnt, PtControl, "", Cfg.Stale + "4"),
        ]);
        TestContext.Out.WriteLine("SEED TRNTRN — " + Seed);
    }

    [OneTimeTearDown]
    public void CleanupSeed()
    {
        if (Db2 is not null)
        {
            try { TestContext.Out.WriteLine("ĐÃ DỌN (TRNTRN) — " + Db2.Cleanup(PatNo, TrtDate, SeedDispNos)); }
            catch (Exception e)
            {
                TestContext.Error.WriteLine(
                    $"!! KHÔNG DỌN ĐƯỢC dòng seed: {e.Message}. SỬA TAY: DELETE FROM TRNTRN " +
                    $"WHERE PAT_NO = {PatNo} AND TRT_DT = '{TrtDate:yyyy-MM-dd}' AND DISP_NO IN " +
                    $"({string.Join(",", SeedDispNos)});");
            }
        }

        if (MasterDb is not null)
        {
            try { TestContext.Out.WriteLine("ĐÃ DỌN (master) — " + MasterDb.Cleanup(TrtDate, SeedMasterKeys)); }
            catch (Exception e)
            {
                TestContext.Error.WriteLine(
                    $"!! KHÔNG DỌN ĐƯỢC mã master seed: {e.Message}. SỬA TAY: DELETE FROM " +
                    $"<bảng master của ngày> WHERE TRT_CD = {Cfg.PathBTrtCd}; DELETE FROM " +
                    $"MST_MED WHERE TRT_CD = {Cfg.PathBTrtCd};");
            }
        }
    }

    [SetUp]
    public void DrugRowReloadSetUp() => Flow = new DrugRowReloadFlow(App, Screen);

    [TearDown]
    public void DrugRowReloadTearDown()
    {
        try { Flow?.Base.DismissAll(); } catch { /* app có thể đã chết */ }
    }

    /// <summary>Seed hỏng thì mọi phép đo sau đó vô nghĩa — nói lý do rồi Ignore.</summary>
    protected string? SeedBlocker =>
        Db2 is null ? "không đọc được DB (db.enabled / chuỗi kết nối)."
        : Seed is null ? "chưa chạy seed."
        : Seed.Blocker is not null ? "seed TRNTRN hỏng: " + Seed.Blocker
        : MasterSeed?.Blocker is not null ? "seed master path B hỏng: " + MasterSeed.Blocker
        : null;
}
