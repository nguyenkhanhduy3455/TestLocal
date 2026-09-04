using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.ParitySaveData;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.SigaToothStatus;

/// <summary>
/// PROBE của luồng 自歯状況 / 根数 — <b>đo, KHÔNG assert</b>.
///
/// <para>PROBE-GUIDELINE mục 2: chưa biết app thật hành xử ra sao thì chụp màn hình →
/// đọc ảnh → RỒI mới viết assert. Fixture này đi trọn từng đường ghi 歯式, chụp ảnh SAU
/// MỖI BƯỚC, bắt hết ngoại lệ rồi đi tiếp, và in mọi con số ra dạng <c>=== KQ-n ===</c>
/// để runner lọc sẵn ra <c>siga-tooth-KQ.txt</c>.</para>
///
/// <para>Mang <c>[Explicit]</c> nên lần chạy đủ KHÔNG gọi tới. Chạy bằng:</para>
/// <code>
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc0    # 179 抜歯 + DelExtRec
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc1a   # 乳歯 179/0
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc1b   # ＥＭＲ 122/3 → KON
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc1c   # 185 歯根嚢胞
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc1d   # DelExtRec lấy 部位 ở đâu
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc1e   # ＥＭＲ trên RĂNG SỮA
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc2    # Ｐ変更 + dirty gate
///   .\run-change-tooth-status.ps1 -Diagnostics -Case Tc3    # F9 登録
/// </code>
/// <b>CHẠY TỪNG CASE MỘT, đừng chạy cả fixture.</b> Wrapper cắt ở 15 phút, mà MỘT vòng
/// 「Insert → 部位選択 → 病名選択 → gõ mã → 処置選択」 tốn 2-3 phút. Ngày 2026-09-03 một
/// probe gộp 4 vòng đã vượt trần: wrapper không kịp ghi cả dòng TIMEOUT, MENU.exe và
/// dotnet ở lại, và máy Windows phải khởi động lại. Mỗi testcase ở đây vì thế chỉ còn
/// TỐI ĐA HAI vòng.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// PROBE NÀY GHI DB — và nó KHÔNG tránh được
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>SigaChg</c> phát <c>update Siga</c> NGAY khi chốt một 処置 抜歯, trước cả khi người
/// dùng kịp nghĩ tới F9. Không có cách nào "chỉ nhìn" đường này. Vì vậy fixture chụp
/// <c>SIGA</c>/<c>KON</c> ở <c>OneTimeSetUp</c>, IN RA STDOUT (để cứu tay được nếu bị
/// Ctrl+C), và trả lại ở <c>OneTimeTearDown</c>.
///
/// <para>Cần <c>sigaTooth.allowSave = true</c>; chưa bật thì cả fixture tự loại mình
/// TRƯỚC khi mở app.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// MƯỜI BỐN CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item>DB xuất phát: có dòng SIGA/KON chưa, giá trị bao nhiêu, master có 179/122/185 không?</item>
///   <item>Lưới 処置 có những dòng nào, dòng nào dùng được làm chỗ gõ mã, InpMode là gì?</item>
///   <item>Click ô 部位 có mở 部位選択 không? Sơ đồ răng đọc ra sao qua UIA?</item>
///   <item>Chọn ô 10 (左上3) rồi End: 病名選択 có mở tiếp không? Đóng nó thế nào?</item>
///   <item>Sau khi đặt 部位, ô 部位 của dòng lưới hiện chữ gì?</item>
///   <item>Gõ 179 → 処置選択 có những 枝番 nào? Chốt 枝番 1 thì hộp thoại nào bung?</item>
///   <item><b>SIGA có đổi NGAY sau khi chốt 抜歯 không</b> (SigaChg, trước F9)?</item>
///   <item>Răng sữa: đặt ô 6 (右上Ｂ) bằng phím B rồi 179/0 — <c>sn4</c> thành mấy?</item>
///   <item>Xoá dòng 抜歯: confirm bung câu gì, và <b>SIGA có về 健全歯 NGAY không</b> (DelExtRec)?</item>
///   <item>Nhánh 乳歯 của DelExtRec đọc <c>ModCommon.pbui</c> chứ không đọc 部位 của dòng
///     (frm203002.cs:6158) — trên máy thật nó có trả <c>sn4</c> về 5 không?</item>
///   <item>122/3 ＥＭＲ(４根) có ghi <c>ekon11 = 4</c> ngay lúc nhập không?</item>
///   <item>185 có bung 「歯根嚢胞摘出手術と同時に抜歯手術を行いましたか？」 không? はい thì SIGA đổi gì?</item>
///   <item>Ｐ変更 khi tháng KHÔNG có 病名 Ｐ/Ｇ: im lặng hay có báo? (bản web báo
///     「当月にＰ／Ｇの病名がありません。」 — WinForm thì không có câu đó)</item>
///   <item>F10 戻る bung dirty gate câu gì, nút MẶC ĐỊNH là cái nào, màn hình có đóng không?</item>
/// </list>
/// </summary>
[TestFixture]
[Explicit]
[CancelAfter(900_000)]
public sealed class SigaToothProbeTests : UiTestBase
{
    private SigaKonDb? _db;
    private SigaToothFlow _flow = null!;
    private TestTrace _trace = null!;

    private SigaSnapshot? _sigaBefore;
    private KonSnapshot? _konBefore;
    private int _preexistingTestRows;

    /// <summary>
    /// 「Dòng nào vốn đã có」 của tháng test. Dọn theo ảnh chụp này thay vì theo danh sách
    /// mã: một lượt nhập 抜歯 làm app TỰ CHÈN thêm dòng 麻酔 và 部位病名行, những thứ đó ở
    /// lại sau F9 và dồn dần cho tới khi lưới dài ra và harness bắt đầu hụt.
    /// </summary>
    private HashSet<string> _monthRowsBefore = [];

    /// <summary>
    /// 病名 「Ｃ」 = <c>dis_cd</c> 100 — ĐO ĐƯỢC từ chính lưới 病名選択 (probe Tc0, ảnh
    /// <c>06x_byoumei-dialog.png</c>): 1=100 Ｃ · 2=103 Ｐ · 3=102 Per · 4=101 Pul ·
    /// 10=104 単Ｇ. Dùng Ｃ cho các luồng không cần Ｐ; Ｐ変更 thì phải là 103/104.
    /// </summary>
    private const int DisCdC = 100;

    /// <summary>歯周炎 Ｐ — mã DUY NHẤT (cùng với 104 Ｇ) mà <c>MonthP</c> gom (frm203002.cs:7358).</summary>
    private const int DisCdP = 103;

    private int PermSlot => Settings.SigaTooth.PermBuiSlot;
    private int MilkSlot => Settings.SigaTooth.MilkBuiSlot;
    private int ControlSlot => Settings.SigaTooth.ControlBuiSlot;

    /// <summary>Ô 部位 (0-based) → cột <c>se{n}</c> / <c>ekon{n}</c> (modSave.cs:788).</summary>
    private static int SeCol(int slot) => slot + 1;

    /// <summary>Ô 部位 (0-based) → cột <c>sn{n}</c> / <c>nkon{n}</c> (modSave.cs:995 — i&lt;16 ⇒ i-2).</summary>
    private static int SnCol(int slot) => slot < 16 ? slot - 2 : slot - 8;

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.SigaTooth.AllowSave)
            return "Cần sigaTooth.allowSave = true. PROBE này đi qua SigaChg/DelExtRec — hai hàm " +
                   "phát 「update Siga」 NGAY lúc nhập, không có cách nào 「chỉ nhìn」. Cờ này là thứ " +
                   "cho phép fixture chụp lại 歯式 trước và trả lại sau.";
        return null;
    }

    /// <summary>
    /// KHÔNG để watcher tự bấm 「いいえ」: probe muốn NHÌN THẤY từng hộp thoại nguyên văn,
    /// kể cả 「…を算定しますか？」. Watcher trả lời hộ thì probe kết luận 「app không hỏi」
    /// trong khi app có hỏi (UiTestBase, chú thích <c>NuisanceDialogPatterns</c>).
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _db = SigaKonDb.CreateOrNull(Settings);
        if (_db is null) { Log("CẢNH BÁO — không có DB, mọi câu hỏi về SIGA/KON sẽ trống."); return; }

        var error = _db.ProbeError();
        if (error is not null) { Log($"CẢNH BÁO — không kết nối được SQL Server: {error}"); _db = null; return; }

        _sigaBefore = _db.ReadSiga(PatNo);
        _konBefore = _db.ReadKon(PatNo);
        _preexistingTestRows = _db.CountTrnRowsWithTrtCd(PatNo, TrtDate, SigaKonDb.TestTrtCds);
        _monthRowsBefore = _db.SnapshotMonthRowKeys(PatNo, TrtDate);

        // In ra stdout để cứu tay được nếu probe bị cắt giữa chừng.
        Log("╔══ NGUYÊN TRẠNG TRƯỚC PROBE (chép lại nếu cần dựng tay) ══");
        Log($"║ SIGA: {_sigaBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ KON : {_konBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ tháng {TrtDate:yyyy-MM} có sẵn {_preexistingTestRows} dòng mang trt_cd ∈ " +
            $"[{string.Join(",", SigaKonDb.TestTrtCds)}]");
        Log("╚══════════════════════════════════════════════════════════");
    }

    [SetUp]
    public void ProbeSetUp() => _flow = new SigaToothFlow(App, Screen);

    [OneTimeTearDown]
    public void ProbeOneTimeTearDown()
    {
        if (_db is null || !_db.CanWrite) return;
        try
        {
            if (_sigaBefore is not null) { _db.RestoreSiga(PatNo, _sigaBefore); Log("dọn: SIGA đã trả về nguyên trạng."); }
            if (_konBefore is not null) { _db.RestoreKon(PatNo, _konBefore); Log("dọn: KON đã trả về nguyên trạng."); }
            if (Settings.SigaTooth.AllowRowCleanup)
            {
                Log("dọn: " + _db.CleanupTestRows(PatNo, TrtDate, _preexistingTestRows));
                Log("dọn: " + _db.CleanupRowsNotIn(PatNo, TrtDate, _monthRowsBefore));
            }
        }
        catch (Exception e) { Log($"dọn HỎNG: {e.Message} — dựng tay theo khối 「NGUYÊN TRẠNG」 ở trên."); }
    }

    /// <summary>Chạy một bước, nuốt mọi ngoại lệ — một lượt chạy phải ra ĐỦ bức tranh.</summary>
    private void Try(string tag, string what, Action action)
    {
        Kq(tag, "── " + what);
        try { action(); }
        catch (Exception e)
        {
            Kq(tag, $"   NÉM: {e.GetType().Name}: {e.Message}");
            try { _trace.Fail(what, e); } catch { /* ảnh hỏng không được làm hỏng probe */ }
        }
    }

    /// <summary>Đọc SIGA và in ra dưới dạng chênh lệch so với mốc — cách duy nhất dễ đọc.</summary>
    private SigaSnapshot? Siga(string tag, string when, SigaSnapshot? baseline = null)
    {
        if (_db is null) return null;
        var s = _db.ReadSiga(PatNo);
        if (s is null) { Kq(tag, $"   SIGA {when}: KHÔNG có dòng nào"); return null; }

        var perm = SeCol(PermSlot);
        var milk = SnCol(MilkSlot);
        var ctrl = SeCol(ControlSlot);
        Kq(tag, $"   SIGA {when}: se{perm}={s.SeCol(perm)} sn{milk}={s.SnCol(milk)} " +
                $"se{ctrl}={s.SeCol(ctrl)} (đối chứng)");
        if (baseline is not null)
        {
            var diff = s.DiffFrom(baseline);
            Kq(tag, "   → đổi so với mốc: " + (diff.Count == 0 ? "KHÔNG CÓ GÌ ĐỔI" : string.Join(", ", diff)));
        }
        return s;
    }

    private KonSnapshot? Kon(string tag, string when, KonSnapshot? baseline = null)
    {
        if (_db is null) return null;
        var k = _db.ReadKon(PatNo);
        if (k is null) { Kq(tag, $"   KON {when}: KHÔNG có dòng nào"); return null; }

        var perm = SeCol(PermSlot);
        var milk = SnCol(MilkSlot);
        Kq(tag, $"   KON {when}: ekon{perm}={KonSnapshot.S(k.EkonCol(perm))} " +
                $"nkon{milk}={KonSnapshot.S(k.NkonCol(milk))}");
        if (baseline is not null)
        {
            var diff = k.DiffFrom(baseline);
            Kq(tag, "   → đổi so với mốc: " + (diff.Count == 0 ? "KHÔNG CÓ GÌ ĐỔI" : string.Join(", ", diff)));
        }
        return k;
    }

    /// <summary>Mốc xuất phát sạch: mọi 永久歯 về 0, mọi 乳歯 về 5, ba ô 根数 về NULL.</summary>
    private void ResetToothState(string tag)
    {
        if (_db is null || !_db.CanWrite) return;
        _db.ResetSigaToVital(PatNo);
        // Chỉ ô đem thử — KHÔNG đụng ô đối chứng (xem chú thích cùng chỗ ở SigaKonGapsTests).
        _db.ResetKonToNull(PatNo, [SeCol(PermSlot)], [SnCol(MilkSlot)]);
        Kq(tag, "   đã đặt mốc: mọi se* = 0, mọi sn* = 5, ekon/nkon của ô thử = NULL");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc0 — 抜歯 179: SigaChg lúc nhập, DelExtRec lúc xoá
    //       (nửa WinForm của tooth-extraction-siga-restore.spec.ts)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — 179 抜歯: SigaChg ghi 欠損歯 lúc nhập, DelExtRec trả 健全歯 lúc xoá")]
    public void Tc0_Probe_Extraction()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        // ── KQ-1: DB xuất phát ───────────────────────────────────────────────
        Try("1", "DB: SIGA/KON hiện có + master 179/122/185 + dòng của tháng", () =>
        {
            if (_db is null) { Kq("1", "   KHÔNG có DB — bỏ qua"); return; }

            Kq("1", $"   bệnh nhân {PatNo}, ngày test {TrtDate:yyyy-MM-dd}");
            Kq("1", $"   có dòng SIGA? {_db.HasSigaRow(PatNo)}   có dòng KON? {_db.HasKonRow(PatNo)}");
            Kq("1", $"   master áp dụng = {_db.ActiveTrtTable(TrtDate)}");
            foreach (var cd in SigaKonDb.TestTrtCds)
            {
                var rows = _db.FindMasterRows(TrtDate, cd);
                Kq("1", $"   trt_cd {cd}: {rows.Count} 枝番 — " +
                        string.Join(" · ", rows.Take(12).Select(r => $"{r.TrtSb}「{r.CctNm}」{r.Score1}点")));
            }
            Kq("1", $"   tháng {TrtDate:yyyy-MM} có {_db.CountTrnRowsInMonth(PatNo, TrtDate)} dòng 処置:");
            foreach (var line in _db.DescribeMonthRows(PatNo, TrtDate)) Kq("1", "     " + line);

            ResetToothState("1");
            Siga("1", "sau khi đặt mốc");
            Kon("1", "sau khi đặt mốc");
        });

        // ── KQ-2: lưới + chế độ nhập ─────────────────────────────────────────
        RegiRow? row = null;
        Try("2", "lưới grdRegi: các dòng, dòng đem gõ mã, InpMode", () =>
        {
            Kq("2", $"   InpMode hiện tại = 「{_flow.InpMode()}」 (cần 「コード」)");
            foreach (var line in _flow.DescribeGrid(limit: 25)) Kq("2", "   " + line);

            row = _flow.InputRow();
            Kq("2", "   DÒNG ĐEM THAO TÁC = " + (row?.ToString() ?? "KHÔNG có dòng nào dùng được"));
            Kq("2", $"   合計点数 = 「{_flow.Grid.AllPoint()}」  実日数 = 「{_flow.Grid.Days()}」");
        });

        if (row is null) { Kq("2", "   ⇒ DỪNG: không có dòng nào để thao tác."); return; }

        // ── KQ-2c: コードモード PHẢI bật TRƯỚC chuỗi 部位選択 ────────────────
        Try("2c", "đưa ô 点 về コードモード (click nhãn lbInpMode) — phải làm TRƯỚC 部位選択", () =>
        {
            var ok = _flow.EnsureCodeMode();
            Kq("2c", $"   EnsureCodeMode → {ok}, InpMode = 「{_flow.InpMode()}」");
            Kq("2c", "   ⇒ làm ở đây vì nó CLICK vào nhãn, tức dời tiêu điểm ra khỏi lưới. " +
                     "Làm sau 病名選択 là mất chỗ con trỏ mà fDis_Move_Cell vừa đặt.");
        });

        // ── KQ-2b: chèn dòng trống để KHÔNG gõ đè lên dữ liệu có sẵn ─────────
        RegiRow? blank = null;
        Try("2b", "Insert 行追加 — chèn dòng trống tại con trỏ", () =>
        {
            blank = _flow.InsertBlankRow(row!, trace);
            Kq("2b", "   dòng trống = " + (blank?.ToString() ?? "KHÔNG chèn được"));
            foreach (var line in _flow.DescribeGrid(limit: 30)) Kq("2b", "   " + line);
            trace.Shot("sau-insert");
        });

        var target = blank ?? row;

        // ── KQ-3 + KQ-4 + KQ-5: đặt 部位 = ô PermSlot (左上3) ─────────────────
        Try("3", $"đặt 部位 của dòng về ĐÚNG ô {PermSlot} = {ToothSelectDialog.DescribeSlot(PermSlot)} (永久歯)", () =>
        {
            var (pos, idx) = ToothSelectDialog.ToothAtSlot(PermSlot);
            Kq("3", $"   ô {PermSlot} ⇒ vùng pos={pos} răng {idx}; cột DB = se{SeCol(PermSlot)}");

            var result = _flow.SetBuiOnRow(target!, PermSlot, milk: false, disCd: null, trace: trace);
            Kq("3", "   " + result);
            Kq("4", $"   病名選択 mở tiếp sau End? {result.DiseaseDialogOpened}");

            foreach (var line in _flow.DescribeGrid(limit: 30)) Kq("5", "   " + line);
            trace.Shot("sau-dat-bui");
        });

        // ── KQ-6 + KQ-7: gõ 179, chốt 枝番 1, đọc SIGA NGAY ──────────────────
        var beforeEnter = _db?.ReadSiga(PatNo);
        Try("6", "gõ mã 179 NGAY TẠI CON TRỎ app vừa đặt → 処置選択 → chốt 枝番 1", () =>
        {
            Kq("6", $"   InpMode = 「{_flow.InpMode()}」, editor đang mở? {_flow.Grid.IsEditing()}, " +
                    $"ô đang giữ con trỏ = 「{_flow.Grid.FocusedCellName()}」");
            var result = _flow.EnterTreatmentAtCursor(SigaToothFlow.ExtractionTrtCd, trtSb: 1, trace: trace);
            Kq("6", "   " + result);
            foreach (var line in _flow.DescribeGrid(limit: 25)) Kq("6", "   " + line);
            trace.Shot("sau-nhap-179");
        });

        Try("7", "SIGA NGAY SAU khi chốt 抜歯 — đây là SigaChg, chưa hề bấm F9", () =>
        {
            var s = Siga("7", "sau khi chốt 179/1", beforeEnter);
            var col = SeCol(PermSlot);
            Kq("7", s is null
                ? "   ⇒ không đọc được SIGA"
                : $"   ⇒ se{col} = {s.SeCol(col)} — WinForm ghi 4 (欠損歯) ngay lúc nhập nếu pbui đúng.");
        });

        // ── KQ-9 + KQ-10: xoá dòng 抜歯 → DelExtRec ─────────────────────────
        var beforeDelete = _db?.ReadSiga(PatNo);
        Try("9", "xoá dòng 抜歯 vừa nhập (Delete trên lưới) → DelExtRec", () =>
        {
            var extRow = _flow.LastRowMatching("抜歯", "抜　歯");
            Kq("9", "   dòng 抜歯 tìm thấy: " + (extRow?.ToString() ?? "KHÔNG THẤY"));
            if (extRow is null)
            {
                Kq("9", "   ⇒ bỏ qua phần xoá. Lưới hiện tại:");
                foreach (var line in _flow.DescribeGrid(limit: 25)) Kq("9", "     " + line);
                return;
            }

            var del = _flow.DeleteRow(extRow, trace);
            Kq("9", "   " + del);
            trace.Shot("sau-xoa-179");
        });

        Try("10", "SIGA NGAY SAU khi xoá — DelExtRec, vẫn chưa bấm F9", () =>
        {
            var s = Siga("10", "sau khi xoá dòng 抜歯", beforeDelete);
            var col = SeCol(PermSlot);
            Kq("10", s is null
                ? "   ⇒ không đọc được SIGA"
                : $"   ⇒ se{col} = {s.SeCol(col)} — DelExtRec đặt 0 (生活歯) nếu nó thật sự chạy.");
        });

        Kq("0", "HẾT Tc0. Đọc _trace.log + ảnh từng bước trước khi viết assert.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — 乳歯 + ＥＭＲ(４根) + 歯根嚢胞摘出手術
    //       (nửa WinForm của siga-kon-remaining-gaps.spec.ts)
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Mốc + chỗ đứng dùng chung cho Tc1a/Tc1b/Tc1c. Trả về dòng trống vừa chèn;
    /// null nghĩa là không dựng được chỗ đứng (đã ghi lý do vào KQ).
    /// </summary>
    private RegiRow? PrepareSeat(string tag, TestTrace trace, bool resetTeeth = true)
    {
        if (resetTeeth) ResetToothState(tag);
        Kq(tag, $"   EnsureCodeMode → {_flow.EnsureCodeMode()}, InpMode = 「{_flow.InpMode()}」");

        var row = _flow.InputRow();
        Kq(tag, "   DÒNG 処置 CUỐI = " + (row?.ToString() ?? "KHÔNG có"));
        if (row is null) return null;

        var seat = _flow.InsertBlankRow(row, trace);
        Kq(tag, "   dòng trống vừa chèn = " + (seat?.ToString() ?? "KHÔNG chèn được"));
        return seat;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1a — 乳歯: SigaChg ghi SN = 9, DelExtRec trả về SN = 5
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — 乳歯 179/0: sn = 9 lúc nhập, sn = 5 lúc xoá")]
    public void Tc1a_Probe_MilkTooth()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        var seat = PrepareSeat("8", trace);
        if (seat is null) { Kq("8", "   ⇒ DỪNG: không dựng được chỗ đứng."); return; }

        var beforeMilk = _db?.ReadSiga(PatNo);
        Try("8", $"乳歯: đặt 部位 = ô {MilkSlot} ({ToothSelectDialog.DescribeSlot(MilkSlot)}) bằng phím A..E rồi 179/0", () =>
        {
            var (pos, idx) = ToothSelectDialog.ToothAtSlot(MilkSlot);
            Kq("8", $"   ô {MilkSlot} ⇒ vùng pos={pos} răng {idx} ⇒ phím 「{(char)('A' + idx - 1)}」; " +
                    $"cột DB = sn{SnCol(MilkSlot)}");

            var set = _flow.SetBuiOnRow(seat, MilkSlot, milk: true, disCd: null, trace: trace);
            Kq("8", "   đặt 部位: " + set);

            var enter = _flow.EnterTreatmentAtCursor(SigaToothFlow.ExtractionTrtCd, trtSb: 0, trace: trace);
            Kq("8", "   nhập 179/0: " + enter);

            var s = Siga("8", "sau 179/0 trên răng sữa", beforeMilk);
            var col = SnCol(MilkSlot);
            Kq("8", s is null ? "   ⇒ không đọc được"
                              : $"   ⇒ sn{col} = {s.SnCol(col)} — WinForm ghi 9 (乳歯 欠損歯) nếu ô mang giá trị 11..19.");
        });

        var beforeMilkDelete = _db?.ReadSiga(PatNo);
        Try("10b", "xoá dòng 抜歯 răng sữa — nhánh 乳歯 của DelExtRec đọc ModCommon.pbui (frm203002.cs:6158)", () =>
        {
            var extRow = _flow.LastRowMatching("抜歯");
            if (extRow is null) { Kq("10b", "   KHÔNG thấy dòng 抜歯 để xoá"); return; }

            Kq("10b", "   " + _flow.DeleteRow(extRow, trace));
            var s = Siga("10b", "sau khi xoá", beforeMilkDelete);
            var col = SnCol(MilkSlot);
            Kq("10b", s is null ? "   ⇒ không đọc được"
                                : $"   ⇒ sn{col} = {s.SnCol(col)}. 5 = DelExtRec chạy đúng; 9 = KHÔNG chạy " +
                                  "(pbui đã bị đường khác ghi đè) — đây chính là câu hỏi cần đo.");
        });

        Kq("1a", "HẾT Tc1a.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1b — ＥＭＲ(４根) 122/3 → KON
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — ＥＭＲ(４根) 122/3 có ghi 根数 4 vào KON không")]
    public void Tc1b_Probe_EmrRootCount()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        var seat = PrepareSeat("11", trace);
        if (seat is null) { Kq("11", "   ⇒ DỪNG: không dựng được chỗ đứng."); return; }

        var beforeEmr = _db?.ReadKon(PatNo);
        Try("11", $"ＥＭＲ(４根) 122/{SigaToothFlow.EmrFourRootSb} trên ô {PermSlot} → ekon{SeCol(PermSlot)} = 4?", () =>
        {
            var set = _flow.SetBuiOnRow(seat, PermSlot, milk: false, disCd: null, trace: trace);
            Kq("11", "   đặt 部位: " + set);

            var enter = _flow.EnterTreatmentAtCursor(SigaToothFlow.EmrTrtCd,
                                                     SigaToothFlow.EmrFourRootSb, trace: trace);
            Kq("11", "   nhập 122/3: " + enter);

            var k = Kon("11", "sau 122/3", beforeEmr);
            var col = SeCol(PermSlot);
            Kq("11", k is null ? "   ⇒ không đọc được KON"
                               : $"   ⇒ ekon{col} = {KonSnapshot.S(k.EkonCol(col))} — WinForm ghi 4 " +
                                 "(modSave.cs:790 / frm203016.cs:1150).");
        });

        Kq("1b", "HẾT Tc1b.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1c — 185 歯根嚢胞摘出手術 → hộp thoại 抜歯同時
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — 185 có bung 「…同時に抜歯手術…」 không? はい thì 歯式 đổi gì")]
    public void Tc1c_Probe_CystExtraction()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        var seat = PrepareSeat("12", trace);
        if (seat is null) { Kq("12", "   ⇒ DỪNG: không dựng được chỗ đứng."); return; }

        var beforeCyst = _db?.ReadSiga(PatNo);
        Try("12", "185 歯根嚢胞摘出手術 → có bung 「…同時に抜歯手術…」 không? trả lời はい", () =>
        {
            var set = _flow.SetBuiOnRow(seat, PermSlot, milk: false, disCd: null, trace: trace);
            Kq("12", "   đặt 部位: " + set);

            var enter = _flow.EnterTreatmentAtCursor(SigaToothFlow.CystTrtCd,
                                                     trtSb: 0, answerYes: true, trace: trace);
            Kq("12", "   nhập 185/0 (trả lời はい): " + enter);
            Kq("12", "   hộp thoại có đúng câu Q00200 không? " +
                     enter.Dialogs.Any(d => Txt.Has(d, SigaToothFlow.CystConfirmFragment)));

            var s = Siga("12", "sau 185 + はい", beforeCyst);
            var col = SeCol(PermSlot);
            Kq("12", s is null ? "   ⇒ không đọc được"
                               : $"   ⇒ se{col} = {s.SeCol(col)} — はい gọi SigaChg(179,0) nên phải là 4.");
        });

        Kq("1c", "HẾT Tc1c.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1d — DelExtRec lấy 部位 Ở ĐÂU: dòng bị xoá, hay ModCommon.pbui?
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Đo điểm nghi lệch nặng nhất còn lại với bản web.
    ///
    /// <para><b>Hai nhánh cạnh nhau của <c>DelExtRec</c> đọc HAI NGUỒN KHÁC NHAU</b>
    /// (frm203002.cs:6135-6180):</para>
    /// <code>
    ///   永久歯: if (arrBui[i] > 0 &amp;&amp; arrBui[i] &lt; 10)          ← 部位 của DÒNG BỊ XOÁ
    ///   乳歯  : else if (ModCommon.pbui[i] > 10 &amp;&amp; &lt; 20)      ← 部位 TOÀN CỤC của phiên
    /// </code>
    /// <c>pbui</c> chỉ được nạp lại khi NHẬP một 処置 (<c>getGridBuiDisInf</c>, gọi từ
    /// modMain.cs:286/605), KHÔNG phải khi dời con trỏ. Nên nếu người dùng nhập 抜歯 lên
    /// răng sữa A, rồi nhập 抜歯 lên răng sữa B, rồi quay lại xoá dòng A thì:
    /// <list type="bullet">
    ///   <item>WinForm (theo source) trả <b>răng B</b> về 健全歯 — vì pbui đang giữ B;</item>
    ///   <item>bản web trả <b>răng A</b> — nó dùng <c>governingBuiOf(dòng bị xoá)</c>
    ///     (treatment-entry-detail.tsx:3152-3159).</item>
    /// </list>
    ///
    /// <para>Mọi testcase hiện có đều xoá ĐÚNG dòng vừa nhập, nên hai nguồn trùng nhau và
    /// phép đo không tách được. Probe này cố ý tách chúng ra.</para>
    /// </summary>
    [Test]
    [Description("Probe — DelExtRec: nhánh 乳歯 đọc dòng bị xoá hay ModCommon.pbui?")]
    public void Tc1d_Probe_DelExtRecBuiSource()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        // Hai răng sữa KHÁC nhau, cùng vùng 右上 để cả hai đều gõ được bằng A..E.
        const int slotA = 6; // 右上Ｂ (idx 2) → sn4
        const int slotB = 5; // 右上Ｃ (idx 3) → sn3
        var colA = SnCol(slotA);
        var colB = SnCol(slotB);

        Kq("16", $"   răng A = ô {slotA} ({ToothSelectDialog.DescribeSlot(slotA)}) → sn{colA}");
        Kq("16", $"   răng B = ô {slotB} ({ToothSelectDialog.DescribeSlot(slotB)}) → sn{colB}");

        var seat = PrepareSeat("16", trace);
        if (seat is null) { Kq("16", "   ⇒ DỪNG: không dựng được chỗ đứng."); return; }

        Try("16", $"nhập 抜歯 răng sữa A (ô {slotA})", () =>
        {
            var set = _flow.SetBuiOnRow(seat, slotA, milk: true, disCd: null, trace: trace);
            Kq("16", "   đặt 部位 A: " + set);
            Kq("16", "   nhập 179/0: " + _flow.EnterTreatmentAtCursor(SigaToothFlow.ExtractionTrtCd,
                                                                     trtSb: 0, trace: trace));
            Siga("16", $"sau 抜歯 A (chờ sn{colA} = 9)");
        });

        Try("17", $"nhập 抜歯 răng sữa B (ô {slotB}) — pbui từ giờ giữ B, KHÔNG còn A", () =>
        {
            var last = _flow.InputRow();
            if (last is null) { Kq("17", "   không còn dòng nào để đứng"); return; }
            var seat2 = _flow.InsertBlankRow(last, trace) ?? last;

            var set = _flow.SetBuiOnRow(seat2, slotB, milk: true, disCd: null, trace: trace);
            Kq("17", "   đặt 部位 B: " + set);
            Kq("17", "   nhập 179/0: " + _flow.EnterTreatmentAtCursor(SigaToothFlow.ExtractionTrtCd,
                                                                     trtSb: 0, trace: trace));
            Siga("17", $"sau 抜歯 B (chờ sn{colA} = 9 VÀ sn{colB} = 9)");
        });

        var before = _db?.ReadSiga(PatNo);
        Try("18", "xoá dòng 抜歯 ĐẦU TIÊN (= răng A) trong khi pbui đang giữ B", () =>
        {
            var rowA = _flow.FirstRowMatching("抜歯");
            Kq("18", "   dòng 抜歯 đầu tiên: " + (rowA?.ToString() ?? "KHÔNG THẤY"));
            if (rowA is null)
            {
                foreach (var l in _flow.DescribeGrid(limit: 30)) Kq("18", "     " + l);
                return;
            }

            Kq("18", "   " + _flow.DeleteRow(rowA, trace));
            var s = Siga("18", "sau khi xoá dòng A", before);
            if (s is null) return;

            Kq("18", $"   ⇒ sn{colA} (răng A, dòng BỊ XOÁ) = {s.SnCol(colA)}");
            Kq("18", $"   ⇒ sn{colB} (răng B, pbui đang giữ)  = {s.SnCol(colB)}");
            Kq("18", "   ĐỌC KẾT QUẢ:");
            Kq("18", $"     · sn{colB} = 5 và sn{colA} = 9  ⇒ WinForm dùng ModCommon.pbui — LỆCH với web.");
            Kq("18", $"     · sn{colA} = 5 và sn{colB} = 9  ⇒ WinForm dùng 部位 của dòng bị xoá — KHỚP web.");
            Kq("18", "     · cả hai = 5                      ⇒ nó ghi cả hai nguồn.");
        });

        Kq("1d", "HẾT Tc1d.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1e — ＥＭＲ(４根) trên RĂNG SỮA: nhánh nhét NKon vào câu update Siga
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// <c>SigaChg</c> case 122 nhánh 乳歯 (frm203016.cs:1153-1161) gọi
    /// <c>makeSql("NKon", …, ref <b>strSiga</b>)</c> — nhét tên cột của bảng <b>KON</b> vào
    /// câu <c>update <b>Siga</b></c>. Nhánh 永久歯 ngay trên thì đúng (<c>ref strKon</c>),
    /// và nhánh save-time (modSave.cs:800/804) cũng đúng.
    ///
    /// <para>Bảng <c>SIGA</c> không có cột <c>NKon*</c> ⇒ câu SQL đó phải hỏng. Probe này
    /// đo xem app THẬT phản ứng thế nào: bung lỗi, im lặng nuốt, hay chết hẳn — và
    /// <c>KON</c> có được ghi gì không. Đó là thứ quyết định bản web nên làm gì: chép y
    /// một cái bug SQL thì vô lý, nhưng phải biết chính xác WinForm để lại trạng thái nào.</para>
    /// </summary>
    [Test]
    [Description("Probe — 122/3 trên RĂNG SỮA: nhánh NKon-vào-update-Siga của WinForm")]
    public void Tc1e_Probe_EmrOnMilkTooth()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        var seat = PrepareSeat("19", trace);
        if (seat is null) { Kq("19", "   ⇒ DỪNG: không dựng được chỗ đứng."); return; }

        var beforeSiga = _db?.ReadSiga(PatNo);
        var beforeKon = _db?.ReadKon(PatNo);

        Try("19", $"ＥＭＲ(４根) 122/3 trên ô {MilkSlot} ({ToothSelectDialog.DescribeSlot(MilkSlot)}) — RĂNG SỮA", () =>
        {
            var set = _flow.SetBuiOnRow(seat, MilkSlot, milk: true, disCd: null, trace: trace);
            Kq("19", "   đặt 部位: " + set);

            var enter = _flow.EnterTreatmentAtCursor(SigaToothFlow.EmrTrtCd,
                                                     SigaToothFlow.EmrFourRootSb, trace: trace);
            Kq("19", "   nhập 122/3: " + enter);
            Kq("19", $"   hộp thoại/lỗi gặp: [{string.Join(" / ", enter.Dialogs)}]");
            Kq("19", "   hộp thoại đang mở ngay lúc này: " + _flow.DescribeDialogs());
            trace.Shot("sau-emr-rang-sua");

            Kq("19", $"   màn 診療入力 còn sống? {TreatmentScreenAlive()}");

            Siga("19", "SIGA sau 122/3 trên răng sữa", beforeSiga);
            var k = Kon("19", "KON sau 122/3 trên răng sữa", beforeKon);
            var col = SnCol(MilkSlot);
            Kq("19", k is null
                ? "   ⇒ không đọc được KON"
                : $"   ⇒ nkon{col} = {KonSnapshot.S(k.NkonCol(col))} — theo modSave.cs:800 thì save-time " +
                  "ghi 4; còn nhánh LÚC NHẬP thì đang gửi 「NKon…」 vào câu update Siga.");
            Kq("19", "   ĐỌC KẾT QUẢ: KON không đổi + SIGA không đổi ⇒ câu SQL hỏng và bị nuốt; " +
                     "có hộp lỗi ⇒ app phơi lỗi ra người dùng; app chết ⇒ nặng nhất.");
        });

        Kq("1e", "HẾT Tc1e.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — 病検 Ｐ変更 + dirty gate
    //       (nửa WinForm của p-mode-kesson-siga.spec.ts + TC-5/5b của siga-kon)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — tab 病検 + Ｐ変更: nhánh KHÔNG có Ｐ, rồi dựng dòng Ｐ và đi trọn vòng")]
    public void Tc2_Probe_PMode()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        Try("1", "đặt lại mốc 歯式 rồi đọc", () =>
        {
            ResetToothState("1");
            Siga("1", "mốc");
        });

        // ── KQ-13: tab 病検 + nút Ｐ変更 ────────────────────────────────────
        Try("13", "tab 病検: mở được không, lưới 病検 có gì, nút Ｐ変更 ở đâu", () =>
        {
            var opened = _flow.OpenByoukenTab(trace);
            Kq("13", $"   mở tab 病検? {opened}");
            trace.Shot("tab-byouken");

            var button = _flow.PChangeButton();
            Kq("13", $"   nút Ｐ変更 (id={SigaToothFlow.PChangeButtonId}) = " +
                     (button is null ? "KHÔNG THẤY" : $"「{Txt.N(Uia.NameOf(button))}」 rect={Uia.RectOf(button)}"));

            foreach (var r in _flow.ByoukenRows().Take(12)) Kq("13", "     " + r);
        });

        // ── KQ-13a: bấm Ｐ変更 khi tháng CHƯA có 病名 Ｐ/Ｇ ──────────────────
        Try("13a", "bấm Ｐ変更 khi tháng CHƯA có Ｐ/Ｇ — WinForm im lặng hay có báo?", () =>
        {
            var result = _flow.PressPChange(trace);
            Kq("13a", $"   nút tồn tại? {result.ButtonFound}   mở 部位選択? {result.ToothDialogOpened}");
            Kq("13a", $"   hộp thoại gặp: [{string.Join(" / ", result.Dialogs)}]");
            Kq("13a", "   ⇒ WinForm KHÔNG có câu 「当月にＰ／Ｇの病名がありません。」 (frm203002.cs:6362-6384 " +
                      "chỉ if/không else). Bản web bung alert — LỆCH nếu đo được 「không mở, không báo」.");

            if (result.ToothDialog is not null)
            {
                Kq("13a", "   ⚠️ dialog LẠI mở ⇒ tháng đã có sẵn 部位病名行 Ｐ/Ｇ. Đóng lại để đi tiếp.");
                ToothSelectDialog.Close(App, result.ToothDialog, trace);
            }
        });

        // ── KQ-13b: dựng một 部位病名行 mang 病名 Ｐ(103) ────────────────────
        Try("13b", $"dựng 部位病名行 mang 病名 Ｐ({DisCdP}) trên ô {PermSlot} để MonthP có cái mà gom", () =>
        {
            var seat = PrepareSeat("13b", trace, resetTeeth: false);
            if (seat is null) { Kq("13b", "   không dựng được chỗ đứng"); return; }

            var set = _flow.SetBuiOnRow(seat, PermSlot, milk: false, disCd: DisCdP, trace: trace);
            Kq("13b", "   " + set);
            foreach (var line in _flow.DescribeGrid(limit: 30).TakeLast(8)) Kq("13b", "   " + line);

            _flow.OpenByoukenTab(trace);
            foreach (var r in _flow.ByoukenRows().Take(12)) Kq("13b", "   病検: " + r);
        });

        // ── KQ-13c: Ｐ変更 lần hai — đi trọn vòng tới Chk_PModeKesson ───────
        var beforeP = _db?.ReadSiga(PatNo);
        Try("13c", "Ｐ変更 lần hai: 部位選択 → F11 全消去 → F3 ３～３ → End → 病名選択 End → Q00100 はい", () =>
        {
            var result = _flow.PressPChange(trace);
            Kq("13c", $"   mở 部位選択? {result.ToothDialogOpened}  hộp thoại: [{string.Join(" / ", result.Dialogs)}]");
            if (result.ToothDialog is null)
            {
                Kq("13c", "   ⇒ DỪNG: Ｐ変更 vẫn không mở 部位選択 dù đã có dòng Ｐ. Kiểm dis_cd1 của " +
                          "dòng vừa dựng — MonthP đòi hFG1[40] = 103/104 VÀ hFG1[41] = 0 (chỉ MỘT 病名).");
                return;
            }

            var tooth = result.ToothDialog;
            var oldSet = ToothSelectDialog.MarkedSlots(tooth);
            Kq("13c", $"   tập Ｐ CŨ (ô đang sáng lúc mở) = [{string.Join(",", oldSet)}] — mong đợi [{PermSlot}]");

            ToothSelectDialog.ClearAll(tooth, trace);
            Kq("13c", $"   sau F11 全消去 = [{string.Join(",", ToothSelectDialog.MarkedSlots(tooth))}]");

            ToothSelectDialog.SelectIncisors(tooth, trace);
            var newSet = ToothSelectDialog.MarkedSlots(tooth);
            Kq("13c", $"   sau F3 ３～３ = [{string.Join(",", newSet)}] (F3 chỉ tác động lên VÙNG ĐANG CHỌN, " +
                      "mặc định 右上 ⇒ ô 5/6/7)");
            trace.Shot("pmode-sau-f3");

            ToothSelectDialog.Confirm(tooth, trace);
            var disease = Waits.TryFor(_flow.DiseaseDialog, TimeSpan.FromSeconds(15));
            Kq("13c", $"   病名選択 mở tiếp? {disease is not null}");
            if (disease is not null) _flow.ConfirmDiseaseDialog(trace);

            var gate = _flow.WaitForDialog(SigaToothFlow.ApplyChangeFragment, TimeSpan.FromSeconds(20));
            Kq("13c", "   Q00100 「変更を適用しますか」 bung? " + (gate is not null));
            if (gate is null)
            {
                Kq("13c", "   hộp thoại đang mở: " + _flow.DescribeDialogs());
                return;
            }

            Kq("13c", $"   nguyên văn: 「{Txt.N(Dialogs.TextOf(gate))}」 — nút mặc định 「{_flow.FocusedButtonName()}」");
            trace.Shot("q00100");
            _flow.Answer(gate, "はい", "Yes");

            Waits.TryUntil(() =>
            {
                var x = _db?.ReadSiga(PatNo);
                return x is not null && Enumerable.Range(1, 32).Any(c => x.SeCol(c) == SigaKonDb.SeMissing);
            }, TimeSpan.FromSeconds(20));

            var s = Siga("13c", "sau Q00100 → はい (Chk_PModeKesson)", beforeP);
            if (s is null) return;

            var missing = Enumerable.Range(0, 32).Where(i => s.SeCol(i + 1) == SigaKonDb.SeMissing).ToList();
            Kq("13c", $"   ô bị đánh 欠損: [{string.Join(",", missing)}] ({missing.Count} ô)");
            Kq("13c", $"   tập Ｐ mới: [{string.Join(",", newSet)}]");
            Kq("13c", "   4 răng khôn (0/15/16/31) có bị đánh không? " +
                      string.Join(",", new[] { 0, 15, 16, 31 }.Select(i => $"{i}={s.SeCol(i + 1)}")));
            Kq("13c", "   ⇒ LUẬT WinForm: mọi ô NGOÀI tập Ｐ mới và ngoài 4 răng khôn phải = 4. " +
                      "Đối chiếu hai danh sách trên là biết luật 「phần bù」 (ISSUE-14) có đúng không.");
        });

        Kq("2x", "HẾT Tc2.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2b — dirty gate của F10 戻る (tách riêng: nó ĐÓNG màn hình)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — F10 戻る: nguyên văn dirty gate, nút MẶC ĐỊNH, 「いいえ」 có lùi 歯式 không")]
    public void Tc2b_Probe_DirtyGate()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        var beforeBack = _db?.ReadSiga(PatNo);
        Try("14", "F10 戻る → dirty gate: nguyên văn, nút MẶC ĐỊNH, trả lời いいえ", () =>
        {
            var back = _flow.PressBack("いいえ", trace);
            Kq("14", $"   gate bung? {back.GateAsked}");
            Kq("14", $"   nguyên văn: 「{back.GateText}」");
            Kq("14", $"   nút MẶC ĐỊNH (con trỏ lúc vừa mở) = 「{back.DefaultButton}」");
            Kq("14", $"   màn hình 診療入力 đóng lại? {back.ScreenClosed}");

            Siga("14", "sau 「いいえ」 (RestoreData → Restore_SK)", beforeBack);
            Kq("14", "   ⇒ Restore_SK chỉ lùi khi cờ pSiga_chg BẬT (modSave.cs:4684). SigaChg bật cờ; " +
                     "DelExtRec và Chk_PModeKesson thì KHÔNG. Chênh lệch ở trên nói cho biết cờ nào đang bật.");
        });

        Try("14b", "mở lại màn 診療入力 để lượt sau còn cửa sổ mà thao tác", () =>
        {
            if (!TreatmentScreenAlive())
            {
                ReopenTreatmentScreen();
                _flow = new SigaToothFlow(App, Screen);
                Kq("14b", "   đã mở lại 診療入力");
            }
            else Kq("14b", "   màn hình vẫn còn mở, không cần mở lại");
        });

        Kq("2b", "HẾT Tc2b.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc3 — F9 登録: SigaChg_Save dựng lại 歯式 từ tập 処置 đã lưu
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — F9 登録: chuỗi hộp thoại, màn hình có đóng không, SIGA sau khi lưu")]
    public void Tc3_Probe_SaveF9()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        var before = _db?.ReadSiga(PatNo);
        Try("15", "F9 登録 (modSave.SaveChangesAndExit) — trả lời はい", () =>
        {
            var result = SaveFlow.PressF9(App, Screen.Window, SaveFlow.SaveAnswer.Yes,
                                          SaveFlow.OverwriteAnswer.No, trace);
            Kq("15", $"   câu hỏi F9: 「{result.SaveQuestionText}」");
            Kq("15", $"   có hỏi 上書き? {result.OverwriteAsked} (nút mặc định 「{result.OverwriteDefaultButton}」)");
            Kq("15", $"   màn hình đóng lại sau khi lưu? {result.ScreenClosedAfterwards}");
            trace.Shot("sau-f9");

            Siga("15", "sau F9 (SigaChg_Save)", before);
            Kon("15", "sau F9", _konBefore);
            if (_db is not null)
            {
                Kq("15", $"   tháng {TrtDate:yyyy-MM} sau khi lưu:");
                foreach (var line in _db.DescribeMonthRows(PatNo, TrtDate)) Kq("15", "     " + line);
            }
        });

        Try("15b", "mở lại màn 診療入力", () =>
        {
            if (!TreatmentScreenAlive())
            {
                ReopenTreatmentScreen();
                _flow = new SigaToothFlow(App, Screen);
                Kq("15b", "   đã mở lại 診療入力");
            }
        });

        Kq("3x", "HẾT Tc3.");
    }
}
