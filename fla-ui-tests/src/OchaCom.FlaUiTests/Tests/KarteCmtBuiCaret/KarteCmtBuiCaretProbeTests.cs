using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteCmtBuiCaret;

/// <summary>
/// PROBE — dò hành vi THẬT của <c>frm203012.btnF1_Click</c>, <b>KHÔNG assert</b>, không
/// bao giờ ném. <c>[Explicit]</c> nên lượt chạy đủ không gọi tới.
///
/// <para>Đúng luật <c>PROBE-GUIDELINE.md</c>: chưa biết app hành xử ra sao thì chụp ảnh →
/// đọc → rồi mới viết assert. Ở đây có <b>bảy</b> thứ chưa ai đo, và cái nào đoán sai
/// cũng làm hỏng kết luận:</para>
/// <list type="number">
/// <item><b>Ghi được vào ô テキスト không.</b> Cả luồng dựng trạng thái bằng
///   <c>ValuePattern.SetValue</c> để né phím Enter (Enter có thể là 確定 + ghi DB). Control
///   là <c>CustomTextBox</c> — không ai biết nó có nhận SetValue, và có nhận <c>\r\n</c>.</item>
/// <item><b>Đặt được caret ở đúng chỗ không.</b> Ctrl+Home rồi → ×3 phải cho caret = 3,
///   tức NGAY TRƯỚC <c>\r\n</c>. Sai chỗ này thì nhánh đang đo không bao giờ chạy và mọi
///   testcase sau đó xanh vì lý do khác.</item>
/// <item><b>省略表示 thật của từng preset.</b> Đây là rủi ro LỚN NHẤT của cả việc so sánh:
///   spec Playwright giả định chuỗi WinForm và chuỗi web GIỐNG NHAU, nhưng bên web lấy từ
///   <c>GET /tenant/bui/omit-disp</c> còn bên này từ <c>buiData.getBui</c> đọc thẳng
///   SQL Server. Khác nhau thì cả phép so lẫn quyết định port đều mất chỗ đứng.</item>
/// <item><b>部位選択 có nhớ lựa chọn giữa hai lần mở không.</b> Quyết định 全消去 có bắt
///   buộc hay không. Bản Playwright đo được là CÓ nhớ; WinForm chưa ai đo.</item>
/// <item><b>Lần chèn đầu tiên rơi vào nhánh nào.</b> Nếu text sau đó là
///   <c>ARMED + BUI</c> thì đúng là nhánh 「nhảy qua newline」; nếu là
///   <c>BASE + BUI + CRLF</c> thì app đã đi nhánh <c>else</c> và toàn bộ báo cáo #3b sai
///   tiền đề.</item>
/// <item><b>Caret sau lần chèn nằm ở đâu</b> — lộ ra qua ký tự gõ tiếp và qua lần bấm F1
///   thứ hai. Đây là câu hỏi chính.</item>
/// <item><b>Enter trong ô テキスト làm gì.</b> <c>AcceptButton = btnDummy</c> (chèn xuống
///   dòng) và <c>txtValue_KeyDown</c> (gọi <c>fixProc</c> = 確定 + ghi
///   <c>mst_cmt2.use_cnt</c>) cùng nghe một phím. Nằm sau <c>karteCmt.allowConfirm</c>.</item>
/// </list>
///
/// <para>Chạy: <c>.\run-insert-bui-into-karte-cmt.ps1 -Diagnostics</c>.
/// Đáp án nằm ở các dòng <c>=== KQ-n ===</c>, runner lọc sẵn ra
/// <c>insert-bui-into-karte-cmt-KQ.txt</c>.</para>
/// </summary>
[TestFixture]
[Category("karte-cmt-bui-caret")]
[Explicit("PROBE — chạy tay, không assert")]
public sealed class KarteCmtBuiCaretProbeTests : UiTestBase
{
    [Test]
    [Description("PROBE — btnF1_Click chèn 部位 ở nhánh nhảy-qua-newline ra chuỗi gì")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();
        var flow = new KarteCmtBuiFlow(App, Screen);

        Window? groupGrid = null;
        Window? cmtList = null;

        // ── KQ-1: mở được frm203011 chưa, và có những nút group nào ──────────
        Say(() =>
        {
            groupGrid = flow.OpenGroupGrid(out var why, trace);
            if (groupGrid is null) { Kq(1, "KHÔNG mở được frm203011 — " + why); return; }

            var names = new List<string>();
            for (var no = 1; no <= 30; no++)
            {
                var b = Uia.ById(groupGrid, KarteCmtDialog.GroupButtonId(no));
                if (b is not null) names.Add($"{KarteCmtDialog.GroupButtonId(no)}=「{Txt.N(Uia.NameOf(b))}」");
            }
            Kq(1, $"frm203011 mở được; {names.Count} nút group hiện hữu: " +
                  (names.Count == 0 ? "KHÔNG NÚT NÀO (mst_cmt2_grp rỗng?)" : string.Join(" · ", names)));
            trace.Shot("kq1-luoi-nut-group");
        });

        // ── KQ-2: mở frm203012 và soi ô テキスト ─────────────────────────────
        Say(() =>
        {
            if (groupGrid is null) { Kq(2, "bỏ qua: chưa có frm203011"); return; }

            var no = Settings.KarteCmt.GroupNo;
            cmtList = flow.OpenCmtList(groupGrid, no, out var why, trace);
            if (cmtList is null) { Kq(2, $"KHÔNG mở được frm203012 từ nút group {no} — " + why); return; }

            var box = Uia.ById(cmtList, KarteCmtDialog.TextBoxId);
            Kq(2, box is null
                ? $"frm203012 mở được nhưng KHÔNG thấy 「{KarteCmtDialog.TextBoxId}」 — " +
                  "đổ cây UIA ở artifacts rồi sửa hằng số"
                : $"frm203012 mở được; txtValue có ValuePattern = " +
                  $"{box.Patterns.Value.IsSupported} · LegacyIAccessible = {box.Patterns.LegacyIAccessible.IsSupported}");
            trace.Shot("kq2-frm203012");

            var dump = Path.Combine(ShotDir(), "frm203012.uia.txt");
            try { File.WriteAllText(dump, Uia.DumpTree(cmtList)); Kq(2, "cây UIA của frm203012: " + dump); }
            catch (Exception e) { Kq(2, "không đổ được cây UIA: " + e.Message); }
        });

        // ── KQ-3: SetValue có ăn không, kể cả với \r\n ───────────────────────
        Say(() =>
        {
            if (cmtList is null) { Kq(3, "bỏ qua: chưa có frm203012"); return; }

            var okEmpty = flow.TrySetText(cmtList, "", trace);
            var okArmed = flow.TrySetText(cmtList, KarteCmtBuiFlow.ArmedText, trace);
            var read = okArmed ? flow.ReadText(cmtList) : "";
            Kq(3, $"SetValue(\"\") = {okEmpty} · SetValue({Txt.Vis(KarteCmtBuiFlow.ArmedText)}) = {okArmed} " +
                  $"⇒ đọc lại {Txt.Vis(read)}");
            Kq(3, okArmed
                ? "⇒ dựng được trạng thái mà KHÔNG cần bấm Enter (Enter có thể là 確定 + ghi DB)"
                : "⇒ KHÔNG dựng được bằng SetValue. Đừng lấy Enter làm đường thay thế: " +
                  "txtValue_KeyDown gọi fixProc → fixCmt2 ghi mst_cmt2.use_cnt (frm203012.cs:339-342, :1370)");
        });

        // ── KQ-4: Ctrl+Home + → có đặt caret đúng chỗ không ──────────────────
        // Gõ một ký tự rồi đọc chuỗi — cách duy nhất không phụ thuộc TextPattern.
        Say(() =>
        {
            if (cmtList is null) { Kq(4, "bỏ qua: chưa có frm203012"); return; }

            if (!flow.TryArmBeforeNewLine(cmtList, trace)) { Kq(4, "không dựng được trạng thái"); return; }
            var typed = flow.VerifyCaretByTyping(cmtList, "Z", trace);

            var atNewLine = KarteCmtBuiFlow.BaseText + "Z\r\n";   // caret 3 — TRƯỚC \r\n  ⇒ nhánh đang đo
            var atEnd = KarteCmtBuiFlow.ArmedText + "Z";           // caret 5 — dòng trống ⇒ nhánh else
            Kq(4, $"gõ 「Z」 sau khi Ctrl+Home + → ×{KarteCmtBuiFlow.BaseText.Length} ⇒ {Txt.Vis(typed)}");
            Kq(4, typed == atNewLine
                ? "⇒ ĐÚNG: caret ngay TRƯỚC \\r\\n — điều kiện idx == Text.Length - 2 thoả, nhánh đang đo sẽ chạy"
                : typed == atEnd
                    ? "⇒ SAI: caret đang ở DÒNG TRỐNG (cuối chuỗi) — nhánh else, KHÔNG tái hiện được lỗi"
                    : $"⇒ KHÔNG khớp cả hai mốc (chờ {Txt.Vis(atNewLine)} hoặc {Txt.Vis(atEnd)})");
            trace.Shot("kq4-caret");
        });

        // ── KQ-5: 省略表示 thật của hai preset, đo trong ô text RỖNG ─────────
        var bui1 = "";
        var bui2 = "";
        Say(() =>
        {
            if (cmtList is null) { Kq(5, "bỏ qua: chưa có frm203012"); return; }

            foreach (var (preset, label) in new[]
                     {
                         (KarteCmtBuiFlow.BuiPreset.Incisors, "F3 ３～３"),
                         (KarteCmtBuiFlow.BuiPreset.WholeArch, "F7 全顎"),
                     })
            {
                if (!flow.TrySetText(cmtList, "", trace)) { Kq(5, "không xoá được ô text"); return; }
                var r = flow.PickBui(cmtList, preset, trace);
                if (!r.Ok) { Kq(5, $"{label}: KHÔNG đo được — {r.Reason}"); continue; }

                if (preset == KarteCmtBuiFlow.BuiPreset.Incisors) bui1 = r.TextAfter; else bui2 = r.TextAfter;
                Kq(5, $"{label} ⇒ 省略表示 = {Txt.Vis(r.TextAfter)} ({r.TextAfter.Length} ký tự)");
            }

            Kq(5, bui1.Length < KarteCmtDialog.NewLineLength
                ? $"⚠️ 省略表示 của ３～３ chỉ dài {bui1.Length} — phải ≥ {KarteCmtDialog.NewLineLength} thì " +
                  "công thức 「lùi đúng 2」 mới xác định được. Đổi bệnh nhân test."
                : "⇒ đủ dài để phân biệt hai công thức");
            Kq(5, bui1 == bui2
                ? "⚠️ HAI PRESET RA CÙNG MỘT CHUỖI ⇒ phép đo F1 lần hai mất khả năng phân biệt"
                : "⇒ hai preset ra hai chuỗi khác nhau, phân biệt được");
            Kq(5, "ĐỐI CHIẾU TAY: hai chuỗi trên phải TRÙNG với 省略表示 mà bản web đo được " +
                  "(spec bui-caret-newline-branch.spec.ts in ra ở dòng [#3b] 省略表示 …). " +
                  "Khác nhau ⇒ hai bên không so được, và câu hỏi 「có port bug không」 chưa đặt ra được.");
        });

        // ── KQ-6: 部位選択 có nhớ lựa chọn của lần trước không ───────────────
        Say(() =>
        {
            if (cmtList is null) { Kq(6, "bỏ qua: chưa có frm203012"); return; }

            var (ok, why, marked) = flow.MeasureToothDialogRemembers(cmtList, trace);
            Kq(6, !ok
                ? "không đo được — " + why
                : marked > 0
                    ? $"mở lại 部位選択 thấy {marked} răng CÒN đánh dấu ⇒ form dùng lại Instance, " +
                      "全消去 là BẮT BUỘC trước mỗi preset (giống bẫy 3 của bản Playwright)"
                    : "mở lại 部位選択 thấy 0 răng đánh dấu ⇒ form dựng lại sạch mỗi lần");
        });

        // ── KQ-7: lần chèn ĐẦU TIÊN rơi vào nhánh nào ───────────────────────
        Say(() =>
        {
            if (cmtList is null || bui1 == "") { Kq(7, "bỏ qua: thiếu 省略表示"); return; }

            if (!flow.TryArmBeforeNewLine(cmtList, trace)) { Kq(7, "không dựng được trạng thái"); return; }
            var r = flow.PickBui(cmtList, KarteCmtBuiFlow.BuiPreset.Incisors, trace);
            if (!r.Ok) { Kq(7, "không chèn được — " + r.Reason); return; }

            var jumped = KarteCmtBuiFlow.ArmedText + bui1;                    // nhánh newline: chèn SAU \r\n
            var plain = KarteCmtBuiFlow.BaseText + bui1 + "\r\n";             // nhánh else   : chèn TẠI caret
            Kq(7, $"sau lần chèn đầu: {Txt.Vis(r.TextAfter)}");
            Kq(7, r.TextAfter == jumped
                ? "⇒ NHÁNH 「nhảy qua newline」 (chèn SAU \\r\\n) — đúng tiền đề của báo cáo #3b"
                : r.TextAfter == plain
                    ? "⇒ NHÁNH else (chèn TẠI caret) — TIỀN ĐỀ #3b SAI, không có gì để port"
                    : $"⇒ không khớp cả hai (chờ {Txt.Vis(jumped)} hoặc {Txt.Vis(plain)})");
            Kq(7, "web ở bước này ra ĐÚNG chuỗi như nhánh 「nhảy qua newline」 ⇒ nhìn ô text " +
                  "sau bước này KHÔNG phát hiện được lỗi. Khác biệt chỉ lộ ở KQ-8 / KQ-9.");
            trace.Shot("kq7-sau-lan-chen-dau");
        });

        // ── KQ-8: gõ thêm một ký tự — caret lộ ra ───────────────────────────
        Say(() =>
        {
            if (cmtList is null || bui1.Length < KarteCmtDialog.NewLineLength) { Kq(8, "bỏ qua: thiếu 省略表示"); return; }

            var actual = flow.TypeAtCaret(cmtList, "X", trace);
            ReportVerdict(8, "gõ 「X」 ngay sau lần chèn 部位", actual,
                KarteCmtBuiFlow.ExpectAfterTyping(KarteCmtBuiFlow.ArmedText, bui1, "X", winFormFormula: false),
                KarteCmtBuiFlow.ExpectAfterTyping(KarteCmtBuiFlow.ArmedText, bui1, "X", winFormFormula: true));
            trace.Shot("kq8-go-them-mot-ky-tu");
        });

        // ── KQ-9: bấm F1 部位 lần thứ hai ───────────────────────────────────
        Say(() =>
        {
            if (cmtList is null || bui1.Length < KarteCmtDialog.NewLineLength || bui2 == "")
            { Kq(9, "bỏ qua: thiếu 省略表示"); return; }

            if (!flow.TryArmBeforeNewLine(cmtList, trace)) { Kq(9, "không dựng được trạng thái"); return; }
            var first = flow.PickBui(cmtList, KarteCmtBuiFlow.BuiPreset.Incisors, trace);
            if (!first.Ok) { Kq(9, "lần chèn đầu hỏng — " + first.Reason); return; }

            var second = flow.PickBui(cmtList, KarteCmtBuiFlow.BuiPreset.WholeArch, trace);
            if (!second.Ok) { Kq(9, "lần chèn hai hỏng — " + second.Reason); return; }

            ReportVerdict(9, "bấm F1 部位 lần thứ hai", second.TextAfter,
                KarteCmtBuiFlow.ExpectAfterSecondBui(KarteCmtBuiFlow.ArmedText, bui1, bui2, winFormFormula: false),
                KarteCmtBuiFlow.ExpectAfterSecondBui(KarteCmtBuiFlow.ArmedText, bui1, bui2, winFormFormula: true));
            trace.Shot("kq9-f1-lan-hai");
        });

        // ── KQ-10: ĐỐI CHỨNG — caret ở dòng trống thì hai bên phải giống nhau ─
        Say(() =>
        {
            if (cmtList is null || bui1 == "") { Kq(10, "bỏ qua: thiếu 省略表示"); return; }

            if (!flow.TryArmAtBlankLine(cmtList, trace)) { Kq(10, "không dựng được trạng thái"); return; }
            var r = flow.PickBui(cmtList, KarteCmtBuiFlow.BuiPreset.Incisors, trace);
            if (!r.Ok) { Kq(10, "không chèn được — " + r.Reason); return; }

            var actual = flow.TypeAtCaret(cmtList, "X", trace);
            var expected = KarteCmtBuiFlow.ArmedText + bui1 + "X";
            Kq(10, $"caret ở DÒNG TRỐNG (nhánh else) ⇒ {Txt.Vis(actual)}");
            Kq(10, actual == expected
                ? "⇒ ĐÚNG như chờ đợi: ở nhánh else công thức caret của WinForm không sai, " +
                  "nên KQ-8/KQ-9 lệch (nếu có) là do NHÁNH chứ không phải do cách chèn nói chung"
                : $"⇒ KHÔNG khớp mốc đối chứng {Txt.Vis(expected)} — mọi kết luận ở KQ-8/KQ-9 phải treo lại: " +
                  "app đang chèn khác với cả hai giả thuyết ngay ở nhánh THƯỜNG");
            trace.Shot("kq10-doi-chung");
        });

        // ── KQ-11: Enter trong ô テキスト làm gì (sau cờ, vì GHI DB) ──────────
        Say(() =>
        {
            if (cmtList is null) { Kq(11, "bỏ qua: chưa có frm203012"); return; }
            if (!Settings.KarteCmt.AllowConfirm)
            {
                Kq(11, "BỎ QUA: chưa bật karteCmt.allowConfirm. Enter trong txtValue có thể rơi vào " +
                       "txtValue_KeyDown → fixProc → fixCmt2 GHI mst_cmt2.use_cnt rồi đóng form " +
                       "(frm203012.cs:339-342, :1370); cũng có thể rơi vào AcceptButton = btnDummy " +
                       "và chỉ chèn xuống dòng (:369-377, :399). Đọc source không phân xử được — " +
                       "bật cờ mới đo.");
                return;
            }

            if (!flow.TrySetText(cmtList, KarteCmtBuiFlow.BaseText, trace)) { Kq(11, "không dựng được"); return; }
            var before = flow.ReadText(cmtList);

            // PHẢI focus chính ô text: txtValue_KeyDown chỉ chạy khi ô đó giữ tiêu điểm.
            // Cửa sổ active mà tiêu điểm ở lưới thì Enter đi đường khác và phép đo vô nghĩa.
            flow.FocusTextBox(cmtList);
            Uia.SendKey(Vk.Return);
            Thread.Sleep(800);

            // Đọc lại TRƯỚC khi kết luận: form đóng rồi thì txtValue không còn để đọc.
            var reopened = flow.CmtList();
            var after = reopened is null ? "(form đã đóng)" : Txt.Vis(flow.ReadText(reopened));
            Kq(11, reopened is not null
                ? $"Enter: form CÒN mở, ô text {after} (trước: {Txt.Vis(before)}) " +
                  "⇒ AcceptButton = btnDummy thắng, Enter CHỈ chèn xuống dòng"
                : "Enter: form ĐÃ ĐÓNG ⇒ txtValue_KeyDown thắng, Enter = 確定 và fixCmt2 vừa ghi " +
                  "mst_cmt2.use_cnt. Ghi lại điều này vào README của luồng.");
            trace.Shot("kq11-enter");
        });

        Say(() => flow.CloseAll(trace));
    }

    private string ShotDir()
    {
        var dir = Settings.Run.ScreenshotDir;
        return Path.IsPathRooted(dir) ? dir : Path.Combine(AppContext.BaseDirectory, dir);
    }

    /// <summary>
    /// In kết quả một phép đo dưới dạng 「khớp công thức nào」 — đây là dạng câu trả lời mà
    /// quyết định port cần, chứ không phải 「xanh / đỏ」.
    /// </summary>
    private static void ReportVerdict(int no, string what, string actual, string web, string winForm)
    {
        Kq(no, $"{what} ⇒ {Txt.Vis(actual)}");
        Kq(no, $"     kỳ vọng WEB     = {Txt.Vis(web)}");
        Kq(no, $"     kỳ vọng WinForm = {Txt.Vis(winForm)}");

        if (web == winForm)
        {
            Kq(no, "⚠️ hai kỳ vọng TRÙNG NHAU ⇒ phép đo này không phân biệt được gì. " +
                   "省略表示 quá ngắn, hoặc hai preset ra cùng một chuỗi.");
            return;
        }

        Kq(no, actual == winForm
            ? "⇒ KHỚP CÔNG THỨC WINFORM: khác biệt là THẬT và nó là khác biệt OUTPUT, không phải mỹ phẩm. " +
              "Đây là căn cứ cho đề xuất A (port nguyên bug sang web)."
            : actual == web
                ? "⇒ KHỚP CÔNG THỨC WEB: WinForm hành xử GIỐNG bản web ⇒ báo cáo #3b sai, KHÔNG port gì cả."
                : "⇒ KHÔNG KHỚP CẢ HAI. Mô hình đang dùng để suy luận sai ở đâu đó — đừng port, " +
                  "mở ảnh trong artifacts\\screenshots ra đọc trước.");
    }

    internal static void Say(Action step)
    {
        try { step(); }
        catch (Exception e) { TestContext.Out.WriteLine($"        !! bước probe ném: {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>Dòng kết quả — runner lọc theo tiền tố này ra file <c>*-KQ.txt</c>.</summary>
    internal static void Kq(int no, string what) => TestContext.Out.WriteLine($"=== KQ-{no} === {what}");
}
