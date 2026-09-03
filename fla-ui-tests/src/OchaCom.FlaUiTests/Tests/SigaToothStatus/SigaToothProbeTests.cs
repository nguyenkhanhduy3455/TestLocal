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
///   .\run-change-tooth-status.ps1 -Diagnostics            # cả ba probe
///   .\run-change-tooth-status.ps1 -Case Tc0               # chỉ probe 抜歯 / DelExtRec
///   .\run-change-tooth-status.ps1 -Case Tc1               # chỉ probe ＥＭＲ / 歯根嚢胞
///   .\run-change-tooth-status.ps1 -Case Tc2               # chỉ probe Ｐ変更 / dirty gate
/// </code>
/// Tách ba testcase là CÓ Ý: mỗi lượt chạy từ xa bị wrapper cắt ở 15 phút, mà một vòng
/// 「đặt 部位 → gõ mã → 処置選択」 tốn hàng chục giây. Gộp cả ba vào một testcase là bảo
/// đảm bị TIMEOUT trước khi tới câu hỏi cuối.
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
                Log("dọn: " + _db.CleanupTestRows(PatNo, TrtDate, _preexistingTestRows));
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
        _db.ResetKonToNull(PatNo, [SeCol(PermSlot), SeCol(ControlSlot)], [SnCol(MilkSlot)]);
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

            var result = _flow.SetBuiOnRow(target!, PermSlot, milk: false, trace);
            Kq("3", "   " + result);
            Kq("4", $"   病名選択 mở tiếp sau End? {result.DiseaseDialogOpened}");

            foreach (var line in _flow.DescribeGrid(limit: 30)) Kq("5", "   " + line);
            trace.Shot("sau-dat-bui");
        });

        // ── KQ-6 + KQ-7: gõ 179, chốt 枝番 1, đọc SIGA NGAY ──────────────────
        var beforeEnter = _db?.ReadSiga(PatNo);
        Try("6", "gõ mã 179 → 処置選択 → chốt 枝番 1 (抜歯手術(前歯))", () =>
        {
            var onRow = _flow.Grid.Snapshot().FirstOrDefault(r => r.Index == target!.Index) ?? target!;
            Kq("6", "   gõ mã lên dòng: " + onRow);
            var result = _flow.EnterTreatment(onRow, SigaToothFlow.ExtractionTrtCd, trtSb: 1, trace: trace);
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

    [Test]
    [Description("Probe — 乳歯 179/0, ＥＭＲ 122/3 → KON, 185 → hộp thoại 抜歯同時")]
    public void Tc1_Probe_MilkEmrCyst()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        Try("1", "đặt lại mốc 歯式 rồi đọc", () =>
        {
            ResetToothState("1");
            Siga("1", "mốc");
            Kon("1", "mốc");
        });

        var row = _flow.InputRow();
        Kq("2", "   DÒNG 処置 CUỐI = " + (row?.ToString() ?? "KHÔNG có"));
        if (row is null) { Kq("2", "   ⇒ DỪNG."); return; }
        var seat = _flow.InsertBlankRow(row, trace) ?? row;
        Kq("2", "   dòng trống vừa chèn = " + seat);

        // ── KQ-8: răng sữa ───────────────────────────────────────────────────
        var beforeMilk = _db?.ReadSiga(PatNo);
        Try("8", $"乳歯: đặt 部位 = ô {MilkSlot} ({ToothSelectDialog.DescribeSlot(MilkSlot)}) bằng phím A..E rồi 179/0", () =>
        {
            var (pos, idx) = ToothSelectDialog.ToothAtSlot(MilkSlot);
            Kq("8", $"   ô {MilkSlot} ⇒ vùng pos={pos} răng {idx} ⇒ phím 「{(char)('A' + idx - 1)}」; " +
                    $"cột DB = sn{SnCol(MilkSlot)}");

            var set = _flow.SetBuiOnRow(seat, MilkSlot, milk: true, trace);
            Kq("8", "   đặt 部位: " + set);

            var onRow = _flow.Grid.Snapshot().FirstOrDefault(r => r.Index == seat.Index) ?? seat;
            var enter = _flow.EnterTreatment(onRow, SigaToothFlow.ExtractionTrtCd, trtSb: 0, trace: trace);
            Kq("8", "   nhập 179/0: " + enter);

            var s = Siga("8", "sau 179/0 trên răng sữa", beforeMilk);
            var col = SnCol(MilkSlot);
            Kq("8", s is null ? "   ⇒ không đọc được"
                              : $"   ⇒ sn{col} = {s.SnCol(col)} — WinForm ghi 9 (乳歯 欠損歯) nếu ô mang giá trị 11..19.");
        });

        // ── KQ-10b: DelExtRec trên răng sữa — nhánh đọc pbui, không đọc dòng ─
        var beforeMilkDelete = _db?.ReadSiga(PatNo);
        Try("10b", "xoá dòng 抜歯 răng sữa — nhánh 乳歯 của DelExtRec đọc ModCommon.pbui (frm203002.cs:6158)", () =>
        {
            var extRow = _flow.LastRowMatching("抜歯", "抜　歯");
            if (extRow is null) { Kq("10b", "   KHÔNG thấy dòng 抜歯 để xoá"); return; }

            Kq("10b", "   " + _flow.DeleteRow(extRow, trace));
            var s = Siga("10b", "sau khi xoá", beforeMilkDelete);
            var col = SnCol(MilkSlot);
            Kq("10b", s is null ? "   ⇒ không đọc được"
                                : $"   ⇒ sn{col} = {s.SnCol(col)}. 5 = DelExtRec chạy đúng; 9 = KHÔNG chạy " +
                                  "(pbui đã bị đường khác ghi đè) — đây chính là câu hỏi cần đo.");
        });

        // ── KQ-11: ＥＭＲ(４根) → KON ────────────────────────────────────────
        var beforeEmr = _db?.ReadKon(PatNo);
        Try("11", $"ＥＭＲ(４根) 122/{SigaToothFlow.EmrFourRootSb} trên ô {PermSlot} → ekon{SeCol(PermSlot)} = 4?", () =>
        {
            var last = _flow.InputRow();
            if (last is null) { Kq("11", "   không còn dòng nào để thao tác"); return; }
            var target = _flow.InsertBlankRow(last, trace) ?? last;

            var set = _flow.SetBuiOnRow(target, PermSlot, milk: false, trace);
            Kq("11", "   đặt 部位: " + set);

            var onRow = _flow.Grid.Snapshot().FirstOrDefault(r => r.Index == target.Index) ?? target;
            var enter = _flow.EnterTreatment(onRow, SigaToothFlow.EmrTrtCd,
                                             SigaToothFlow.EmrFourRootSb, trace: trace);
            Kq("11", "   nhập 122/3: " + enter);

            var k = Kon("11", "sau 122/3", beforeEmr);
            var col = SeCol(PermSlot);
            Kq("11", k is null ? "   ⇒ không đọc được KON"
                               : $"   ⇒ ekon{col} = {KonSnapshot.S(k.EkonCol(col))} — WinForm ghi 4 " +
                                 "(modSave.cs:790 / frm203016.cs:1150).");
        });

        // ── KQ-12: 185 歯根嚢胞摘出手術 ─────────────────────────────────────
        var beforeCyst = _db?.ReadSiga(PatNo);
        Try("12", "185 歯根嚢胞摘出手術 → có bung 「…同時に抜歯手術…」 không? trả lời はい", () =>
        {
            var last = _flow.InputRow();
            if (last is null) { Kq("12", "   không còn dòng nào để thao tác"); return; }
            var target = _flow.InsertBlankRow(last, trace) ?? last;

            var set = _flow.SetBuiOnRow(target, PermSlot, milk: false, trace);
            Kq("12", "   đặt 部位: " + set);

            var onRow = _flow.Grid.Snapshot().FirstOrDefault(r => r.Index == target.Index) ?? target;
            var enter = _flow.EnterTreatment(onRow, SigaToothFlow.CystTrtCd,
                                             trtSb: 0, answerYes: true, trace: trace);
            Kq("12", "   nhập 185/0 (trả lời はい): " + enter);
            Kq("12", "   hộp thoại có đúng câu Q00200 không? " +
                     enter.Dialogs.Any(d => Txt.Has(d, SigaToothFlow.CystConfirmFragment)));

            var s = Siga("12", "sau 185 + はい", beforeCyst);
            var col = SeCol(PermSlot);
            Kq("12", s is null ? "   ⇒ không đọc được"
                               : $"   ⇒ se{col} = {s.SeCol(col)} — はい gọi SigaChg(179,0) nên phải là 4.");
        });

        Kq("1x", "HẾT Tc1.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — 病検 Ｐ変更 + dirty gate
    //       (nửa WinForm của p-mode-kesson-siga.spec.ts + TC-5/5b của siga-kon)
    // ═════════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe — tab 病検, nút Ｐ変更, và dirty gate của F10 戻る")]
    public void Tc2_Probe_PModeAndDirtyGate()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        Try("1", "đặt lại mốc 歯式 rồi đọc", () =>
        {
            ResetToothState("1");
            Siga("1", "mốc");
        });

        // ── KQ-13: tab 病検 + Ｐ変更 ────────────────────────────────────────
        Try("13", "tab 病検: mở được không, lưới 病検 có gì, nút Ｐ変更 ở đâu", () =>
        {
            var opened = _flow.OpenByoukenTab(trace);
            Kq("13", $"   mở tab 病検? {opened}");
            trace.Shot("tab-byouken");

            var button = _flow.PChangeButton();
            Kq("13", $"   nút Ｐ変更 (id={SigaToothFlow.PChangeButtonId}) = " +
                     (button is null ? "KHÔNG THẤY" : $"「{Txt.N(Uia.NameOf(button))}」 rect={Uia.RectOf(button)}"));

            var rows = _flow.ByoukenRows();
            Kq("13", $"   lưới 病検 có {rows.Count} dòng:");
            foreach (var r in rows.Take(12)) Kq("13", "     " + r);
        });

        var beforeP = _db?.ReadSiga(PatNo);
        Window? toothDialog = null;
        Try("13b", "bấm Ｐ変更 — tháng này CHƯA có 病名 Ｐ/Ｇ nên đây là nhánh 「không gom được gì」", () =>
        {
            var result = _flow.PressPChange(trace);
            toothDialog = result.ToothDialog;
            Kq("13b", $"   nút tồn tại? {result.ButtonFound}   mở 部位選択? {result.ToothDialogOpened}");
            Kq("13b", $"   hộp thoại gặp: [{string.Join(" / ", result.Dialogs)}]");
            Kq("13b", "   ⇒ WinForm KHÔNG có câu 「当月にＰ／Ｇの病名がありません。」 (frm203002.cs:6365-6383 " +
                      "chỉ if/không else). Bản web bung alert — đây là một điểm LỆCH nếu đo được.");
        });

        // ── KQ-13c: nếu 部位選択 mở ra thì đi trọn vòng F11 → F3 → End ───────
        Try("13c", "nếu Ｐ変更 mở được 部位選択: F11 全消去 → F3 ３～３ → End 確定 → 病名選択 → End", () =>
        {
            if (toothDialog is null)
            {
                Kq("13c", "   bỏ qua: Ｐ変更 không mở 部位選択 (chưa có 部位病名行 mang Ｐ/Ｇ trong tháng).");
                return;
            }

            Kq("13c", $"   ô đang sáng lúc mở = [{string.Join(",", ToothSelectDialog.MarkedSlots(toothDialog))}]");
            ToothSelectDialog.ClearAll(toothDialog, trace);
            Kq("13c", $"   sau F11 = [{string.Join(",", ToothSelectDialog.MarkedSlots(toothDialog))}]");
            ToothSelectDialog.SelectIncisors(toothDialog, trace);
            Kq("13c", $"   sau F3 = [{string.Join(",", ToothSelectDialog.MarkedSlots(toothDialog))}] " +
                      "(F3 chỉ tác động lên VÙNG ĐANG CHỌN, mặc định 右上)");
            trace.Shot("pmode-sau-f3");

            ToothSelectDialog.Confirm(toothDialog, trace);
            var disease = Waits.TryFor(_flow.DiseaseDialog, TimeSpan.FromSeconds(12));
            Kq("13c", $"   病名選択 mở tiếp? {disease is not null}");
            if (disease is not null) _flow.ConfirmDiseaseDialog(trace);

            var gate = _flow.WaitForDialog(SigaToothFlow.ApplyChangeFragment, TimeSpan.FromSeconds(15));
            Kq("13c", "   Q00100 「変更を適用しますか」 bung? " + (gate is not null));
            if (gate is not null)
            {
                Kq("13c", $"   nguyên văn: 「{Txt.N(Dialogs.TextOf(gate))}」 nút mặc định 「{_flow.FocusedButtonName()}」");
                trace.Shot("q00100");
                _flow.Answer(gate, "はい", "Yes");
                var s = Siga("13c", "sau Q00100 → はい (Chk_PModeKesson)", beforeP);
                Kq("13c", "   ⇒ luật WinForm: MỌI ô 部位 = 0 ngoài 4 răng khôn (ô 0/15/16/31) đều thành " +
                          "se = 4. Đếm số ô = 4 ở trên để biết luật 「phần bù」 có đúng không.");
            }
            _flow.DismissAll();
        });

        // ── KQ-14: dirty gate của F10 戻る ──────────────────────────────────
        var beforeBack = _db?.ReadSiga(PatNo);
        Try("14", "F10 戻る → dirty gate: nguyên văn, nút MẶC ĐỊNH, trả lời いいえ", () =>
        {
            var back = _flow.PressBack("いいえ", trace);
            Kq("14", $"   gate bung? {back.GateAsked}");
            Kq("14", $"   nguyên văn: 「{back.GateText}」");
            Kq("14", $"   nút MẶC ĐỊNH (con trỏ lúc vừa mở) = 「{back.DefaultButton}」");
            Kq("14", $"   màn hình 診療入力 đóng lại? {back.ScreenClosed}");

            var s = Siga("14", "sau 「いいえ」 (RestoreData → Restore_SK)", beforeBack);
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

        Kq("2x", "HẾT Tc2.");
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
