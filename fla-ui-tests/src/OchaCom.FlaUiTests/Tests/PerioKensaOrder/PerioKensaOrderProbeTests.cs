using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PerioKensaOrder;

/// <summary>
/// PROBE — <b>dò hành vi, KHÔNG assert</b> (PROBE-GUIDELINE mục 2).
///
/// <para>Chạy cái này TRƯỚC khi đi sửa một testcase đỏ của
/// <see cref="PerioKensaOrderTests"/>. Nó đi trọn một vòng, chụp ảnh sau mỗi bước, bắt hết
/// ngoại lệ rồi đi tiếp, và in đáp án ra các dòng <c>=== KQ-n ===</c> (runner lọc sẵn ra
/// <c>perio-kensa-KQ.txt</c>).</para>
///
/// <code>
///   .\run-move-perio-exam-cursor.ps1 -Diagnostics
/// </code>
///
/// Chín câu hỏi nó trả lời — mỗi câu là một chỗ mà đọc source KHÔNG kết luận được:
/// <list type="number">
///   <item>Combo 「基本･精密検査」 có những mục nào, đang chọn mục nào (chữ THẬT trong
///     <c>mst_cod</c> cd_type 68 — code chỉ biết cd_val 1/2).</item>
///   <item>F7 全顎 có làm sáng đủ 32 ô 部位 không, và sau End thì lưới ra dòng thế nào.</item>
///   <item>F6 có mở được <c>frm203011</c> không, và nhãn F1/F2 của nó là gì.</item>
///   <item><b>Con trỏ rơi vào ô nào</b> khi 歯周基本検査 vừa mở — đây là mốc DUY NHẤT
///     đáng tin để biết app đang chạy nhánh nào (combo có thể nói dối, xem
///     <see cref="PerioKensaTestBase"/>).</item>
///   <item>AutomationId đọc ra có đúng dạng <c>txtEpp16</c> không, hay bản Windows này để
///     trống và phải lui về <c>Name</c>.</item>
///   <item><b>Enter thực sự đi đâu.</b> <c>BaseDialog</c> ánh xạ Enter sang
///     <c>ProcessTabKey</c> mà không đặt <c>e.Handled</c> (BaseDialog.cs:325), trong khi ô
///     nhập xử lý Enter ở <c>KeyPress</c>. Hai đường cùng chạy — chỉ đo mới biết đường nào
///     là kết cục.</item>
///   <item>→ và ← đi đâu từ ô đang đứng.</item>
///   <item>歯周精密検査 mở ra ở chế độ 4点法 hay 6点法 (<c>pInpOpt[32]</c>, cố định cả phiên).</item>
///   <item>Chuỗi Enter trong 精密検査 — 3 điểm 口蓋 rồi sang 頬側 hay ngược lại.</item>
/// </list>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy tay bằng .\\run-move-perio-exam-cursor.ps1 -Diagnostics")]
public sealed class PerioKensaOrderProbeTests : PerioKensaTestBase
{
    private static void Kq(string id, string text) =>
        TestContext.Out.WriteLine($"=== KQ-{id} === {text}");

    [Test]
    [Description("Tc0 — một vòng đủ: 設定 → 部位 全顎 → F6 → 基本検査 → 精密検査, không assert")]
    public void Tc0_DoHanhVi()
    {
        using var trace = TestTrace.Begin();

        // ── KQ-1: combo 検査順 ────────────────────────────────────────────────
        Kq("1", $"combo 「基本･精密検査」 đang hiện 「{OriginalOrderLabel}」; mục: " +
                (OrderComboItems.Count == 0 ? "(đọc không ra)" : string.Join(" / ", OrderComboItems)) +
                $"  ·  vì sao: {OrderReadReason}" +
                $"  ·  perioKensa.allowSettingChange = {CanChangeSetting}");

        // ── KQ-2: 部位病名行 đủ 32 răng ───────────────────────────────────────
        var arch = Try(trace, "dung 部位病名行 全顎",
                       () => Flow.BuildWholeArchRow(Settings.PerioKensa.DisCd, trace));
        Kq("2", arch is null ? "dựng 部位病名行 NÉM lỗi — xem _trace.log" : arch.ToString());

        var row = Flow.WholeArchRow();
        Kq("2b", row is null
            ? "KHÔNG tìm lại được dòng 部位 「全顎」 trong lưới ⇒ F6 sẽ lấy bui toàn 0 và MỌI ô bị khoá ／"
            : $"dòng sẽ đứng lên để bấm F6: {row}");
        if (row is null) { trace.Note("dung o day — khong co dong nao de bam F6"); return; }

        // ── KQ-3: F6 → frm203011 ─────────────────────────────────────────────
        var karte = Try(trace, "F6 → カルテ記載選択", () => Flow.OpenKarteSelect(row, out var why, trace) is { } w
            ? w
            : throw new InvalidOperationException(why));
        Kq("3", karte is null
            ? "F6 KHÔNG mở được frm203011 — xem ảnh bước trước, có hộp thoại nào đang chắn không?"
            : "frm203011 đã mở. Nút: " + string.Join(" / ", SigaToothStatus.SigaToothFlow.ButtonNames(karte)));
        if (karte is null) return;

        // ── KQ-4/5/6/7: 歯周基本検査 ─────────────────────────────────────────
        var kihon = Try<Window>(trace, "F1 基本検査", () => Flow.OpenKihon(karte, trace));
        if (kihon is null) { Kq("4", "F1 KHÔNG mở được frm203028"); return; }

        var first = Txt.N(Flow.FocusedId());
        // So với răng mà TỪNG nhánh sẽ chọn trên tập răng CÒN THẬT — không so số cứng 0/15.
        // 全顎 chỉ bật răng còn tồn tại, và bệnh nhân test mất đúng cả hai răng đó.
        var presentK = PerioNav.PresentFromKihon(kihon);
        var expRight = PerioNav.FirstTooth(presentK, leftFirst: false);
        var expLeft = PerioNav.FirstTooth(presentK, leftFirst: true);
        Kq("4", $"con trỏ lúc 歯周基本検査 vừa mở: 「{first}」 = {PerioExamDialog.Describe(first)}. " +
                $"{PerioNav.Describe(presentK)}; 右上⇒răng {expRight}, 左上⇒răng {expLeft}  ⇒ " +
                (expRight >= 0 && Txt.Same(first, PerioExamDialog.Epp(expRight)) ? "nhánh 右上から" :
                 expLeft >= 0 && Txt.Same(first, PerioExamDialog.Epp(expLeft)) ? "nhánh 左上から"
                 : "KHÔNG khớp nhánh nào"));
        trace.Shot("kihon-vua-mo");

        Kq("5", DescribeIds(kihon,
                 PerioExamDialog.Epp(0), PerioExamDialog.Epp(15), PerioExamDialog.Douyo(15)));

        var enterChain = new List<string>();
        for (var i = 0; i < 3; i++)
        {
            PerioExamDialog.PressEnter();
            Thread.Sleep(250);
            enterChain.Add(Txt.N(Flow.FocusedId()));
        }
        Kq("6", $"Enter ×3 từ 「{first}」 ⇒ " + string.Join(" → ", enterChain.Select(Nice)));

        PerioExamDialog.PressRight();
        Thread.Sleep(250);
        var afterRight = Txt.N(Flow.FocusedId());
        PerioExamDialog.PressLeft();
        Thread.Sleep(250);
        var afterLeft = Txt.N(Flow.FocusedId());
        Kq("7", $"→ ⇒ {Nice(afterRight)} ; rồi ← ⇒ {Nice(afterLeft)}");
        trace.Shot("kihon-sau-phim");

        Try(trace, "F10 dong 基本検査 + frm203011", () => { Flow.CloseBackToTreatment(trace); return "ok"; });

        // ── KQ-8/9: 歯周精密検査 ─────────────────────────────────────────────
        var karte2 = Try(trace, "F6 → カルテ記載選択 (lan 2)",
                         () => Flow.OpenKarteSelect(row, out var why2, trace) is { } w
                             ? w
                             : throw new InvalidOperationException(why2));
        if (karte2 is null) { Kq("8", "lần 2 F6 không mở được frm203011"); return; }

        var seimitu = Try<Window>(trace, "F2 精密検査", () => Flow.OpenSeimitu(karte2, trace));
        if (seimitu is null) { Kq("8", "F2 KHÔNG mở được frm203029"); return; }

        var presentS = PerioNav.PresentFromSeimitu(seimitu);
        var mode = PerioKensaOrderFlow.MeasureSeimituMode(seimitu, presentS);
        var firstS = Txt.N(Flow.FocusedId());
        var anchor = PerioNav.FirstTooth(presentS, leftFirst: false);
        Kq("8", $"chế độ đo được: {PerioKensaOrderFlow.ModeName(mode)} (đo ở răng CÒN THẬT {anchor}: " +
                $"kou{anchor * 3 + 1:D2} khoá={PerioExamDialog.IsCellDisabled(seimitu, PerioExamDialog.Kou(anchor * 3))}, " +
                $"kou{anchor * 3 + 3:D2} khoá={PerioExamDialog.IsCellDisabled(seimitu, PerioExamDialog.Kou(anchor * 3 + 2))})" +
                $"  ·  {PerioNav.Describe(presentS)}  ·  con trỏ lúc vừa mở: {Nice(firstS)}");
        trace.Shot("seimitu-vua-mo");

        var chain = new List<string>();
        for (var i = 0; i < 6; i++)
        {
            PerioExamDialog.PressEnter();
            Thread.Sleep(250);
            chain.Add(Txt.N(Flow.FocusedId()));
        }
        Kq("9", $"Enter ×6 từ {Nice(firstS)} ⇒ " + string.Join(" → ", chain.Select(Nice)));
        trace.Shot("seimitu-sau-6-enter");

        Try(trace, "F10 dong het", () => { Flow.CloseBackToTreatment(trace); return "ok"; });
    }

    private static string Nice(string id) => $"「{id}」({PerioExamDialog.Describe(id)})";

    /// <summary>Trạng thái vài ô cụ thể — để biết AutomationId có ra đúng dạng không.</summary>
    private static string DescribeIds(Window dialog, params string[] ids) =>
        string.Join(" · ", ids.Select(id =>
            $"{id}: text=「{PerioExamDialog.CellText(dialog, id)}」 " +
            $"khoá={PerioExamDialog.IsCellDisabled(dialog, id)?.ToString() ?? "(không thấy control)"}"));

    /// <summary>Chạy một bước, NUỐT lỗi và ghi lại — probe phải đi hết một vòng trong một lượt.</summary>
    private static T? Try<T>(TestTrace trace, string what, Func<T?> action) where T : class
    {
        try { return trace.Do(what, action); }
        catch (Exception e)
        {
            trace.Note($"BO QUA loi o buoc 「{what}」: {e.GetType().Name}: {e.Message}");
            return null;
        }
    }
}
