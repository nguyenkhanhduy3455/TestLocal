using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.CmtPackType10;

/// <summary>
/// PROBE của luồng 摘要コメントパック type 10 — <b>KHÔNG ASSERT</b>, chỉ chụp ảnh và in
/// <c>=== KQ-n ===</c>. Đây là bước 2 của vòng làm việc F1: chưa biết app hành xử ra sao
/// thì đừng viết assert.
///
/// <para>Ba câu hỏi probe này đi tìm, theo đúng thứ tự:</para>
/// <list type="number">
///   <item><b>Gõ 歯清 (108/2) vào lưới thì rơi xuống những dòng nào?</b> Master nói nó kích
///     hoạt 6 pack (TC10-2), trong đó 4 pack type 10 và 1 pack type 90 mở hộp thoại. Ảnh +
///     danh sách dòng thêm sẽ nói pack nào THẬT SỰ xuất ra chữ.</item>
///   <item><b>Hộp thoại nào bung, theo THỨ TỰ nào?</b> Ghi nguyên văn — đó là thứ vế web
///     phải dựng lại, và cũng là thứ làm mọi assert sau này đổ oan nếu bỏ sót.</item>
///   <item><b>Dòng CHƯA F9 có được tính không?</b> (§4.6 của cmt-pack-type10-remaining.md).
///     Gõ 特２(初診) 105/2 rồi gõ 歯清 lần nữa: <c>cmtToku</c> (CmtAuto.cs:3521-3546) tra
///     cửa sổ <c>[算定日, 算定日]</c> — <b>đúng một ngày</b> — nên dòng 105 vừa gõ mà chưa F9
///     là NGUỒN DUY NHẤT có thể làm câu 「歯科診療特別対応加算算定後」 hiện ra. Thấy nó ⇒
///     WinForm đọc cả lưới chưa lưu.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// Probe <b>KHÔNG bấm F9 登録</b> và không seed gì. Mọi dòng nó gõ chỉ nằm trong lưới đang
/// mở; đóng màn hình mà trả lời 「いいえ」 cho 「保存しますか」 là sạch.
///
/// <para>⚠️ Vì thế cũng ĐỪNG bấm 「はい」 ở dirty gate khi dọn tay — <c>modSave.SaveData</c>
/// xoá sạch rồi chèn lại TOÀN BỘ 処置行 của tháng.</para>
///
/// <para><b>Chạy:</b> <c>.\run-cmt-pack-type10.ps1 -Probe -Case TcCP1</c> — mỗi ca một lô,
/// đừng chạy cả fixture (F7).</para>
/// </summary>
[TestFixture]
[Explicit("Probe — chạy tay khi cần dò lại hành vi; không nằm trong lô hồi quy.")]
[NonParallelizable]
[CancelAfter(720_000)]
public sealed class CmtPackProbeTests : UiTestBase
{
    private CmtPackDb? _db;
    private SigaToothFlow _flow = null!;
    private CmtPackOps _ops = null!;

    /// <summary>
    /// 歯科診療特別対応加算２(初診) — phần tử thứ ba của kv <c>cmtToku</c> (CmtAuto.cs:3527).
    ///
    /// <para>Chọn 枝番 <b>2</b> chứ không phải 23 (口管強根Ｃ管) hay 3 (特２再診) vì ba lý do,
    /// theo thứ tự quan trọng:</para>
    /// <list type="number">
    ///   <item><b>枝番 2 nằm trong khung nhìn</b> của 処置選択 (dòng thứ ba). 枝番 lớn nằm
    ///     dưới đáy danh sách thì double-click rơi vào hư không — xem
    ///     <see cref="CmtPackOps.CommitMeasure.InsertedTreatmentRow"/>.</item>
    ///   <item><c>cmtToku</c> tra cửa sổ <c>[算定日, 算定日]</c> — <b>đúng một ngày</b>. Không
    ///     có cách nào để một dòng ĐÃ LƯU của ngày khác lọt vào, nên thấy comment là biết
    ///     chắc nó đến từ dòng vừa gõ.</item>
    ///   <item>Ngày test của bệnh nhân 10 là ngày có <b>初診</b> (100/0), nên 加算(初診) hợp
    ///     ngữ cảnh hơn 加算(再診) — bớt một hộp thoại nghiệp vụ chen ngang.</item>
    /// </list>
    /// </summary>
    public const int TokuTrtCd = 105;
    public const int TokuSyosinSb = 2;

    /// <summary>口腔管理体制強化加算(根Ｃ管) — kv của <c>cmtKouKanKyo_KonC</c> (CmtAuto.cs:3562).</summary>
    /// <remarks>
    /// CHƯA dùng để gõ: 枝番 23 nằm ngoài khung nhìn 処置選択 (đo 2026-09-16, xem README
    /// mục 「Đo được trên máy thật」). Vẫn giữ hằng số để TcCP0 hỏi master và để ca sau —
    /// khi nào có cách cuộn lưới picker — dùng lại.
    /// </remarks>
    public const int KouKanKyoTrtCd = 116;
    public const int KouKanKyoKonCSb = 23;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>
    /// Probe KHÔNG để watcher tự trả lời hộ.
    ///
    /// <para>Mặc định <c>run.nuisanceDialogs</c> tự bấm 「いいえ」 cho 「を算定しますか？」 —
    /// mà 加算 116/23 và 105/3 rất có thể hỏi đúng câu đó. Watcher trả lời hộ thì probe
    /// kết luận 「app không hỏi gì」 và dòng 加算 không bao giờ vào lưới: <b>xanh sai</b>,
    /// không có dấu hiệu nào (F19).</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _db = CmtPackDb.CreateOrNull(Settings);
        if (_db?.ProbeError() is { } err)
        {
            Log($"⚠️ không đọc được SQL Server ({err}) — probe vẫn chạy, chỉ thiếu phần đối chiếu master.");
            _db = null;
        }
    }

    [SetUp]
    public void ProbeSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new CmtPackOps(_flow);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcCP0 — master nói gì, lưới đang có gì (KHÔNG gõ gì)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TcCP0 — mốc: master của cụm 歯清 + lịch sử đã lưu + lưới lúc mở màn")]
    public void TcCP0_Baseline()
    {
        using var trace = TestTrace.Begin();

        try
        {
            if (_db is not null)
            {
                Log("=== KQ-0 === master của các mã đem gõ (算定日 = " + $"{TrtDate:yyyy-MM-dd})");
                foreach (var (cd, sb, what) in new[]
                         {
                             (CmtPackMasterTests.SiseiTrtCd, CmtPackMasterTests.SiseiTrtSb, "歯清"),
                             (TokuTrtCd, TokuSyosinSb, "特２(初診)"),
                             (KouKanKyoTrtCd, KouKanKyoKonCSb, "口管強(根Ｃ管)"),
                         })
                {
                    var packs = _db.PacksFor(cd, sb, TrtDate);
                    Log($"  {cd}/{sb} 「{what}」 → {packs.Count} pack");
                    foreach (var p in packs)
                    {
                        Log($"      {p}");
                        foreach (var d in _db.Details(p.PackCd, TrtDate)) Log($"         → {d}");
                    }
                }

                Log("=== KQ-1 === lịch sử ĐÃ LƯU của bệnh nhân (vế mà getTreatData tra khi lưới không có)");
                var codes = new[] { (KouKanKyoTrtCd, KouKanKyoKonCSb), (KouKanKyoTrtCd, 20),
                                    (TokuTrtCd, 0), (TokuTrtCd, 1), (TokuTrtCd, 2), (TokuTrtCd, 3),
                                    (CmtPackMasterTests.SiseiTrtCd, CmtPackMasterTests.SiseiTrtSb) };
                var saved = _db.SavedRows(PatNo, codes, TrtDate.AddYears(-3), TrtDate);
                Log(saved.Count == 0
                    ? "  (không có dòng nào trong 3 năm gần đây ⇒ mọi nhánh 「đã từng算定」 sẽ KHÔNG chạy)"
                    : "  " + string.Join("\n  ", saved));

                Log("=== KQ-2 === dòng 処置 đã lưu của ĐÚNG ngày test");
                var day = _db.DayRows(PatNo, TrtDate);
                Log(day.Count == 0 ? "  (ngày này chưa có dòng nào)" : "  " + string.Join("\n  ", day));
            }

            Log("=== KQ-3 === lưới lúc mở màn");
            foreach (var r in _ops.DataRows()) Log("  " + r);
            Log($"  月計点数 = {_ops.Grid.AllPointValue()?.ToString() ?? "?"}");
            trace.Shot("luoi-luc-mo-man");

            Log("=== KQ-4 === hộp thoại đang mở: " + _flow.DescribeDialogs());
        }
        catch (Exception e)
        {
            // Probe KHÔNG BAO GIỜ ném — ghi lại rồi đi tiếp (F1).
            trace.Fail("TcCP0", e);
            Log($"=== KQ-LOI === {e.GetType().Name}: {e.Message}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcCP1 — gõ 歯清 một mình (ca ĐỐI CHỨNG)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TcCP1 — gõ 歯清 108/2 khi lưới CHƯA có 105/116: pack nào xuất chữ, hộp thoại nào bung")]
    public void TcCP1_Sisei_Alone()
    {
        using var trace = TestTrace.Begin();

        try
        {
            var below = _ops.LastRowOfDay(TrtDate.Day, trace);
            if (below is null)
            {
                Log("=== KQ-5 === lưới KHÔNG có dòng dữ liệu nào để chèn xuống dưới — dừng, " +
                    "không có chỗ gõ. Đổi patient.trtDate sang ngày CÓ 処置.");
                return;
            }

            trace.Step($"chen dong trong duoi 「{below}」 roi go 歯清 " +
                       $"{CmtPackMasterTests.SiseiTrtCd}/{CmtPackMasterTests.SiseiTrtSb}");
            var m = _ops.Commit(below, CmtPackMasterTests.SiseiTrtCd, CmtPackMasterTests.SiseiTrtSb, trace);

            Log("=== KQ-5 === gõ 歯清 (đối chứng, lưới chưa có 加算 nào)");
            Log("  " + (m?.ToString() ?? "KHÔNG gõ được — đọc _trace.log"));
            if (m is not null)
            {
                Log($"  dòng THÊM ({m.Measure.AddedRows.Count}):");
                foreach (var r in m.Measure.AddedRows) Log("    + " + r);
                Log($"  trong đó dòng comment (点 = 0): {m.CommentRows.Count}");
                foreach (var t in m.CommentTexts) Log($"    「{t}」");
                Log($"  hộp thoại: {(m.DialogsSeen.Count == 0 ? "(không có)" : string.Join(" / ", m.DialogsSeen))}");
            }

            Log("=== KQ-6 === hộp thoại còn lại sau lượt gõ: " + _flow.DescribeDialogs());
        }
        catch (Exception e)
        {
            trace.Fail("TcCP1", e);
            Log($"=== KQ-LOI === {e.GetType().Name}: {e.Message}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcCP2 — 加算 CHƯA LƯU rồi gõ 歯清 lần nữa (§4.6)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TcCP2 — gõ 105/2 (chưa F9) rồi gõ 歯清: WinForm có tính dòng chưa lưu không")]
    public void TcCP2_Unsaved_Row_Counts()
    {
        using var trace = TestTrace.Begin();

        try
        {
            var below = _ops.LastRowOfDay(TrtDate.Day, trace);
            if (below is null) { Log("=== KQ-7 === không có dòng nào để chèn — dừng."); return; }

            trace.Step($"go 特２(初診) {TokuTrtCd}/{TokuSyosinSb} — KHONG bam F9");
            var add = _ops.Commit(below, TokuTrtCd, TokuSyosinSb, trace);
            Log($"=== KQ-7 === gõ {TokuTrtCd}/{TokuSyosinSb} 特２(初診) — TIỀN ĐỀ của KQ-8");
            Log("  " + (add?.ToString() ?? "KHÔNG gõ được — đọc _trace.log"));
            if (add is not null)
                foreach (var r in add.Measure.AddedRows) Log("    + " + r);

            // ⛔ Hàng rào: chưa có dòng 105 trong lưới thì KQ-8 không đo được gì. Không có
            //    dòng này thì 「không thấy comment」 có hai cách giải thích và probe im lặng
            //    chọn cách sai (đã vấp đúng vậy với 116/23, 2026-09-16).
            if (add is null || !add.InsertedTreatmentRow)
            {
                Log("=== KQ-8 === ⛔ DỪNG: dòng 105 KHÔNG vào được lưới ⇒ tiền đề chưa thành, " +
                    "mọi kết luận về 「dòng chưa lưu」 từ đây đều vô nghĩa. " +
                    "Hộp thoại đang mở: " + _flow.DescribeDialogs());
                trace.Shot("tien-de-khong-thanh");
                return;
            }

            var below2 = _ops.LastRowOfDay(TrtDate.Day, trace);
            if (below2 is null) { Log("=== KQ-8 === mất dòng mốc sau lượt 1 — dừng."); return; }

            trace.Step("go 歯清 — luoi DA CO 105/2 cua CUNG NGAY nhung CHUA F9");
            var m = _ops.Commit(below2, CmtPackMasterTests.SiseiTrtCd, CmtPackMasterTests.SiseiTrtSb, trace);

            Log("=== KQ-8 === gõ 歯清 (lưới đã có 105/2 cùng ngày, chưa lưu)");
            Log("  " + (m?.ToString() ?? "KHÔNG gõ được — đọc _trace.log"));
            if (m is not null)
            {
                foreach (var r in m.Measure.AddedRows) Log("    + " + r);
                Log($"  comment 「歯科診療特別対応加算算定後」: {m.CountComments("歯科診療特別対応加算算定後")} dòng");
                Log("  ⇒ >0 : getTreatData ĐỌC CẢ DÒNG CHƯA LƯU (CommonChk.cs:653-753, tham số " +
                    "_tblRegiInp = lưới đang mở) ⇒ vế web PHẢI gửi kèm các dòng chưa lưu, " +
                    "GetLastTrtDtAsync một mình là THIẾU.");
                Log("  ⇒ =0 : chỉ dữ liệu đã F9 mới tính ⇒ GetLastTrtDtAsync hiện tại là đủ.");
                Log($"  (đối chứng: TcCP1 gõ 歯清 khi KHÔNG có 105 nào — kết quả ở KQ-5)");
            }
        }
        catch (Exception e)
        {
            trace.Fail("TcCP2", e);
            Log($"=== KQ-LOI === {e.GetType().Name}: {e.Message}");
        }
    }
}
