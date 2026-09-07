using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteCmtBuiCaret;

/// <summary>
/// <c>frm203012.btnF1_Click</c> — chèn 省略表示 部位 vào ô テキスト của カルテ記載選択,
/// ở nhánh 「caret đứng ngay trước dấu xuống dòng cuối」.
///
/// <para>Nửa WinForm của
/// <c>../web-tenant-tests/tests/dialogs-selection/bui-caret-newline-branch.spec.ts</c>
/// (báo cáo #3b). Câu hỏi mà luồng này trả lời gọn trong một dòng:
/// <b>「WinForm có thật sự ra chuỗi khác bản web ở đây không?」</b> — vì đó là thứ quyết
/// định có port cái lệch đó sang web hay không.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO FIXTURE NÀY KHÔNG ASSERT MỘT CHUỖI CỨNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// Chưa ai đo hành vi này trên app thật. Viết <c>Assert.That(text, Is.EqualTo(&lt;chuỗi
/// WinForm suy ra từ C#&gt;))</c> lúc này chính là 「viết assert theo phỏng đoán rồi chạy cả
/// fixture để xem nó đỏ ở đâu」 — đúng cái <c>PROBE-GUIDELINE.md</c> cấm.
///
/// <para>Nên hai testcase then chốt (<see cref="Tc4_TypeAfterInsert"/>,
/// <see cref="Tc5_SecondBui"/>) assert một mệnh đề <b>yếu hơn nhưng chắc chắn</b>: chuỗi
/// đo được phải khớp <b>một trong hai</b> công thức đang tranh nhau — rồi <b>ghi lại khớp
/// cái nào</b>. Cách này không thể xanh giả: nó chỉ xanh khi mô hình suy luận đúng, và
/// khớp phía nào thì đó là câu trả lời cho việc port. Đỏ ⇒ mô hình sai ở đâu đó và không
/// được port gì cả.</para>
///
/// <para>Những mệnh đề THẬT SỰ suy ra được thì vẫn assert cứng: điều kiện của nhánh
/// (<see cref="Tc1_ArmTriggerState"/>), lần chèn đầu nhảy qua CRLF
/// (<see cref="Tc3_FirstInsertJumpsNewLine"/> — cả hai phía cùng một kết quả), và mốc đối
/// chứng ở nhánh <c>else</c> (<see cref="Tc6_ControlAtBlankLine"/>).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB — VÀ ĐÓ LÀ KẾT QUẢ CỦA VIỆC TRÁNH BỐN PHÍM
/// ═══════════════════════════════════════════════════════════════════════════════
/// F9 / End / Escape / Enter đều dẫn tới <c>fixProc</c> → <c>fixCmt2()</c> ghi
/// <c>mst_cmt2.use_cnt</c>. Fixture này dựng trạng thái bằng <c>ValuePattern.SetValue</c>,
/// di chuyển caret bằng Ctrl+Home + mũi tên, và đóng màn bằng F10 戻る. Xem
/// <see cref="KarteCmtDialog"/> để biết bốn đường đó nằm ở dòng nào.
///
/// <para>Chạy: <c>.\run-insert-bui-into-karte-cmt.ps1</c>. Chưa đo bao giờ thì chạy
/// <c>-Diagnostics</c> trước — probe in ra đủ 11 câu hỏi, fixture này chỉ chốt 6 cái.</para>
/// </summary>
[TestFixture]
[Category("karte-cmt-bui-caret")]
public sealed class KarteCmtBuiCaretTests : UiTestBase
{
    private KarteCmtBuiFlow _flow = null!;
    private Window? _cmtList;

    /// <summary>
    /// 省略表示 thật của hai preset — đo MỘT lần ở TC-2 rồi dùng lại.
    ///
    /// <para>Trường THỰC THỂ chứ không static: NUnit dựng đúng một đối tượng fixture cho cả
    /// lượt chạy (mặc định <c>FixtureLifeCycle.SingleInstance</c>) nên trường thực thể sống
    /// đủ lâu, mà lại không rò trạng thái sang lượt chạy sau như static.</para>
    /// </summary>
    private string _bui1 = "";
    private string _bui2 = "";

    /// <summary>Lý do mọi TC sau phải bỏ qua (dựng trạng thái hỏng thì mọi phép đo vô nghĩa).</summary>
    private string? _blocked;

    /// <summary>Khớp công thức nào — gom lại để in một dòng kết luận ở cuối.</summary>
    private readonly List<string> _verdicts = [];

    [SetUp]
    public void OpenDialogs()
    {
        _flow = new KarteCmtBuiFlow(App, Screen);
        if (_blocked is not null) IgnoreWithReason(_blocked);

        _cmtList = _flow.CmtList();
        if (_cmtList is not null) return;

        using var trace = TestTrace.Begin(TestContext.CurrentContext.Test.Name + "_mo-man");

        var group = _flow.OpenGroupGrid(out var groupWhy, trace);
        if (group is null)
            IgnoreWithReason($"không mở được frm203011 bằng F6 コメント — {groupWhy}. " +
                             "Con trỏ phải đang đứng trên một dòng của grdRegi (frm203002.cs:4719).");

        _cmtList = _flow.OpenCmtList(group!, Settings.KarteCmt.GroupNo, out var cmtWhy, trace);
        if (_cmtList is null)
            IgnoreWithReason($"không mở được frm203012 — {cmtWhy}");
    }

    [OneTimeTearDown]
    public void CloseDialogs()
    {
        try { new KarteCmtBuiFlow(App, Screen).CloseAll(); }
        catch (Exception e) { TestContext.Out.WriteLine("không đóng được dialog: " + e.Message); }

        if (_verdicts.Count > 0)
            TestContext.Out.WriteLine("=== KQ-VERDICT === " + string.Join(" | ", _verdicts));
    }

    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-1 dựng được trạng thái kích hoạt: ô text 「ABC␍␊」, caret NGAY TRƯỚC ␍␊")]
    public void Tc1_ArmTriggerState()
    {
        using var trace = TestTrace.Begin();

        // Không dùng Enter để xuống dòng: txtValue_KeyDown gặp Enter mà chuỗi hết dấu *
        // thì gọi fixProc — tức 確定 + ghi mst_cmt2.use_cnt + đóng form (frm203012.cs:339-342).
        if (!_flow.TryArmBeforeNewLine(_cmtList!, trace))
        {
            _blocked = "ValuePattern.SetValue không ghi được vào txtValue nên KHÔNG dựng được trạng " +
                       "thái. Đường thay thế duy nhất là gõ Enter, mà Enter ở màn này có thể là 確定 " +
                       "(fixProc → fixCmt2 ghi mst_cmt2.use_cnt, frm203012.cs:339-342 và :1370) — " +
                       "nên fixture dừng ở đây thay vì mạo hiểm. Chạy probe Tc0 (KQ-3) để xem cụ thể.";
            IgnoreWithReason(_blocked);
        }

        var armed = KarteCmtBuiFlow.ArmedText;
        Assert.That(_flow.ReadText(_cmtList!), Is.EqualTo(armed),
            $"ô テキスト phải bằng {Txt.Vis(armed)} sau khi SetValue");

        // Caret đọc bằng cách GÕ MỘT KÝ TỰ — không có đường nào khác đáng tin (xem
        // doc-comment của KarteCmtBuiFlow, mục 「ĐO OUTPUT, KHÔNG ĐO CARET」).
        var typed = _flow.VerifyCaretByTyping(_cmtList!, "Z", trace);
        var atNewLine = KarteCmtBuiFlow.BaseText + "Z\r\n";
        var atBlankLine = armed + "Z";

        Assert.That(typed, Is.EqualTo(atNewLine),
            $"gõ 「Z」 phải ra {Txt.Vis(atNewLine)} — tức caret ở {KarteCmtBuiFlow.BaseText.Length}, " +
            $"NGAY TRƯỚC \\r\\n, đúng điều kiện `idx == Text.Length - 2` của nhánh đang đo " +
            $"(frm203012.cs:201).\n" +
            $"    Ra {Txt.Vis(atBlankLine)} nghĩa là caret đang ở DÒNG TRỐNG ⇒ nhánh else ⇒ " +
            $"KHÔNG tái hiện được lỗi.\n" +
            $"    Thấy: {Txt.Vis(typed)}");
    }

    [Test, Order(2)]
    [Description("TC-2 省略表示 thật của hai preset — mốc để dựng mọi kỳ vọng sau, và để đối chiếu với web")]
    public void Tc2_MeasureOmitDisp()
    {
        using var trace = TestTrace.Begin();

        _bui1 = MeasurePreset(KarteCmtBuiFlow.BuiPreset.Incisors, "F3 ３～３", trace);
        _bui2 = MeasurePreset(KarteCmtBuiFlow.BuiPreset.WholeArch, "F7 全顎", trace);

        // Hai công thức chỉ khác nhau khi cụm 部位 dài hơn phần bị lùi.
        Assert.That(_bui1.Length, Is.GreaterThanOrEqualTo(KarteCmtDialog.NewLineLength),
            $"省略表示 của ３～３ = {Txt.Vis(_bui1)} chỉ dài {_bui1.Length} ký tự; phải ≥ " +
            $"{KarteCmtDialog.NewLineLength} thì công thức 「caret lùi đúng 2」 mới xác định được. " +
            "Đổi bệnh nhân test sang người còn đủ răng cửa.");

        Assert.That(_bui2, Is.Not.EqualTo(_bui1),
            "hai preset ra CÙNG một 省略表示 ⇒ TC-5 (F1 lần hai) mất khả năng phân biệt. " +
            "歯牙情報 của bệnh nhân test nhiều khả năng đã loại gần hết răng.");
    }

    [Test, Order(3)]
    [Description("TC-3 lần chèn ĐẦU rơi vào nhánh nhảy-qua-newline — hai phía ra CÙNG một chuỗi")]
    public void Tc3_FirstInsertJumpsNewLine()
    {
        using var trace = TestTrace.Begin();
        RequirePresets();

        Arm(trace);
        var r = _flow.PickBui(_cmtList!, KarteCmtBuiFlow.BuiPreset.Incisors, trace);
        RequireInsert(r);

        var armed = KarteCmtBuiFlow.ArmedText;
        var jumped = armed + _bui1;                                    // chèn SAU \r\n  — nhánh :202
        var plain = KarteCmtBuiFlow.BaseText + _bui1 + "\r\n";         // chèn TẠI caret — nhánh else :205

        // Đây là mệnh đề DUY NHẤT ở TC-3 mà cả hai phía đồng ý, nên assert cứng được. Nó
        // cũng là tiền đề của cả báo cáo #3b: không vào nhánh này thì không có bug nào.
        Assert.That(r.TextAfter, Is.EqualTo(jumped),
            $"ở nhánh 「nhảy qua newline」 app phải chèn 部位 SAU dấu xuống dòng " +
            $"(frm203012.cs:202: `msg.Substring(0, idx + 2) + strBui1 + …`).\n" +
            $"    chờ  : {Txt.Vis(jumped)}\n" +
            $"    thấy : {Txt.Vis(r.TextAfter)}\n" +
            $"    nếu ra {Txt.Vis(plain)} thì app đã đi nhánh else ⇒ TIỀN ĐỀ CỦA #3b SAI, " +
            "không có khác biệt nào để port.");

        TestContext.Out.WriteLine(
            $"TC-3: text sau lần chèn đầu = {Txt.Vis(r.TextAfter)} — bản web ra ĐÚNG chuỗi này, " +
            "nên nhìn ô text ở bước này KHÔNG phát hiện được gì. Khác biệt (nếu có) ở TC-4/TC-5.");
    }

    [Test, Order(4)]
    [Description("TC-4 gõ thêm 1 ký tự — caret của lần chèn trước lộ ra thành TEXT")]
    public void Tc4_TypeAfterInsert()
    {
        using var trace = TestTrace.Begin();
        RequirePresets();

        Arm(trace);
        RequireInsert(_flow.PickBui(_cmtList!, KarteCmtBuiFlow.BuiPreset.Incisors, trace));

        // btnF1_Click kết thúc bằng txtValue.Focus() (frm203012.cs:209) ⇒ ký tự gõ tiếp đi
        // thẳng vào chỗ caret đang đứng. Không click, không bấm mũi tên trước.
        var actual = _flow.TypeAtCaret(_cmtList!, "X", trace);

        AssertMatchesOneFormula(
            "TC-4 gõ 「X」 sau khi chèn 部位",
            actual,
            web: KarteCmtBuiFlow.ExpectAfterTyping(KarteCmtBuiFlow.ArmedText, _bui1, "X", winFormFormula: false),
            winForm: KarteCmtBuiFlow.ExpectAfterTyping(KarteCmtBuiFlow.ArmedText, _bui1, "X", winFormFormula: true),
            why: $"cụm 部位 dài {_bui1.Length} ký tự. WEB đặt caret ở CUỐI cụm ⇒ X nằm sau cùng. " +
                 $"WinForm đặt caret ở `idx + strBui1.Length` mà KHÔNG bù 2 ký tự CRLF " +
                 $"(frm203012.cs:211) ⇒ X chen vào GIỮA cụm, sau ký tự thứ {_bui1.Length - 2}.");
    }

    [Test, Order(5)]
    [Description("TC-5 bấm F1 部位 lần thứ hai — chỗ khác biệt caret biến thành khác biệt TEXT")]
    public void Tc5_SecondBui()
    {
        using var trace = TestTrace.Begin();
        RequirePresets();

        Arm(trace);
        RequireInsert(_flow.PickBui(_cmtList!, KarteCmtBuiFlow.BuiPreset.Incisors, trace));

        var second = _flow.PickBui(_cmtList!, KarteCmtBuiFlow.BuiPreset.WholeArch, trace);
        RequireInsert(second);

        AssertMatchesOneFormula(
            "TC-5 F1 部位 lần thứ hai",
            second.TextAfter,
            web: KarteCmtBuiFlow.ExpectAfterSecondBui(KarteCmtBuiFlow.ArmedText, _bui1, _bui2, winFormFormula: false),
            winForm: KarteCmtBuiFlow.ExpectAfterSecondBui(KarteCmtBuiFlow.ArmedText, _bui1, _bui2, winFormFormula: true),
            why: "WEB nối chuỗi 2 vào đuôi chuỗi 1. WinForm xuất phát từ caret mà lần đầu để lại: " +
                 "vế `idx == Text.Length - 2` VẪN đúng, chỉ có phép so `Substring(idx, 2) == NewLine` " +
                 "đẩy nó xuống nhánh else (frm203012.cs:201) — nên chuỗi 2 chen vào GIỮA chuỗi 1, đẩy " +
                 $"2 ký tự cuối {Txt.Vis(_bui1.Length >= 2 ? _bui1[^2..] : _bui1)} ra sau.");
    }

    [Test, Order(6)]
    [Description("TC-6 ĐỐI CHỨNG — caret ở DÒNG TRỐNG (nhánh else) thì hai phía phải giống nhau")]
    public void Tc6_ControlAtBlankLine()
    {
        using var trace = TestTrace.Begin();
        RequirePresets();

        // Cùng ô text 「ABC\r\n」, chỉ khác caret. Không có mốc này thì TC-4/TC-5 không kết
        // luận được: 「app chèn kiểu đó ở MỌI trường hợp」 vẫn là một giả thuyết sống.
        if (!_flow.TryArmAtBlankLine(_cmtList!, trace))
            IgnoreWithReason("không dựng được trạng thái đối chứng (SetValue hỏng)");

        var r = _flow.PickBui(_cmtList!, KarteCmtBuiFlow.BuiPreset.Incisors, trace);
        RequireInsert(r);
        var actual = _flow.TypeAtCaret(_cmtList!, "X", trace);

        var expected = KarteCmtBuiFlow.ArmedText + _bui1 + "X";
        Assert.That(actual, Is.EqualTo(expected),
            "ở nhánh else (`idx` không bằng `Text.Length - 2`) công thức " +
            "`SelectionStart = idx + strBui1.Length` là ĐÚNG, nên cả WinForm lẫn web đều đặt caret " +
            "ngay sau chuỗi 部位 và X phải nằm cuối.\n" +
            $"    chờ  : {Txt.Vis(expected)}\n" +
            $"    thấy : {Txt.Vis(actual)}\n" +
            "    Đỏ ở đây ⇒ app chèn khác cả hai giả thuyết ngay ở nhánh THƯỜNG ⇒ mọi kết luận " +
            "của TC-4/TC-5 phải treo lại, và tuyệt đối chưa port gì.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Trợ giúp
    // ═════════════════════════════════════════════════════════════════════════

    private void Arm(TestTrace trace)
    {
        if (!_flow.TryArmBeforeNewLine(_cmtList!, trace))
            IgnoreWithReason("không dựng được trạng thái kích hoạt (SetValue hỏng) — xem TC-1");
    }

    private string MeasurePreset(KarteCmtBuiFlow.BuiPreset preset, string label, TestTrace trace)
    {
        if (!_flow.TrySetText(_cmtList!, "", trace))
            IgnoreWithReason("không xoá được ô テキスト bằng SetValue — xem TC-1");

        // Đo trong ô RỖNG: ở đó `idx == 0` và `Text.Length - 2 == -2` nên chắc chắn đi
        // nhánh else, tức chuỗi đọc được đúng bằng strBui1, không dính gì tới nhánh đang đo.
        var r = _flow.PickBui(_cmtList!, preset, trace);
        RequireInsert(r);

        TestContext.Out.WriteLine(
            $"TC-2 {label} ⇒ 省略表示 = {Txt.Vis(r.TextAfter)} ({r.TextAfter.Length} ký tự). " +
            "ĐỐI CHIẾU TAY với dòng 「[#3b] 省略表示 …」 của spec Playwright: hai bên phải ra CÙNG " +
            "một chuỗi thì mới so được kết quả với nhau.");
        return r.TextAfter;
    }

    private void RequirePresets()
    {
        if (_bui1.Length < KarteCmtDialog.NewLineLength || _bui2 == "")
            IgnoreWithReason("chưa đo được 省略表示 của hai preset — xem TC-2");
    }

    private void RequireInsert(KarteCmtBuiFlow.BuiInsert r)
    {
        if (!r.Ok)
            IgnoreWithReason(
                $"không chèn được 部位: {r.Reason}. Đây là chuyện DỮ LIỆU của máy (歯牙情報 của " +
                "bệnh nhân test), không phải app sai — nên Ignore chứ không đỏ.");
    }

    /// <summary>
    /// Chuỗi đo được phải khớp <b>một trong hai</b> công thức, và ghi lại khớp cái nào.
    ///
    /// <para>Đây là dạng khẳng định mạnh nhất viết được khi chưa từng đo: nó xanh chỉ khi
    /// mô hình suy luận đúng, và giá trị nó trả về (khớp phía nào) chính là câu trả lời
    /// cho việc port. Assert cứng một phía lúc này chỉ là chép lại phỏng đoán.</para>
    /// </summary>
    private void AssertMatchesOneFormula(string what, string actual, string web, string winForm, string why)
    {
        Assert.That(winForm, Is.Not.EqualTo(web),
            $"{what}: hai kỳ vọng TRÙNG NHAU ⇒ phép đo không phân biệt được gì. {why}");

        var matchesWinForm = actual == winForm;
        var matchesWeb = actual == web;

        TestContext.Out.WriteLine(
            $"{what}\n" +
            $"    đo được         = {Txt.Vis(actual)}\n" +
            $"    kỳ vọng WEB     = {Txt.Vis(web)}\n" +
            $"    kỳ vọng WinForm = {Txt.Vis(winForm)}");

        var verdict = matchesWinForm ? $"{what}: WINFORM" : matchesWeb ? $"{what}: WEB" : $"{what}: KHÔNG KHỚP";
        _verdicts.Add(verdict);

        TestContext.Out.WriteLine("=== KQ-VERDICT === " + verdict + (
            matchesWinForm
                ? " ⇒ khác biệt là THẬT và là khác biệt OUTPUT. Đây là căn cứ cho đề xuất A (port bug)."
                : matchesWeb
                    ? " ⇒ WinForm hành xử GIỐNG bản web ⇒ báo cáo #3b sai tiền đề, KHÔNG port."
                    : " ⇒ mô hình suy luận sai ở đâu đó, chưa port gì cả."));

        Assert.That(matchesWinForm || matchesWeb, Is.True,
            $"{what}: chuỗi đo được không khớp CẢ HAI công thức đang tranh nhau.\n" +
            $"    đo được         : {Txt.Vis(actual)}\n" +
            $"    kỳ vọng WEB     : {Txt.Vis(web)}\n" +
            $"    kỳ vọng WinForm : {Txt.Vis(winForm)}\n" +
            $"    {why}\n" +
            "    Đỏ ở đây KHÔNG có nghĩa app sai — nó có nghĩa cách suy luận về btnF1_Click " +
            "(frm203012.cs:196-215) đang sai ở đâu đó. Mở ảnh trong artifacts\\screenshots và " +
            "_trace.log của testcase này ra đọc TRƯỚC khi sửa bất cứ dòng nào.");
    }
}
