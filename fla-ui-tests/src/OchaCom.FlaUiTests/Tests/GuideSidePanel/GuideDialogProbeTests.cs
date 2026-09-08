using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// <b>PROBE</b> cho dialog 「ガイド処置選択」 <c>frm203017</c> — dò ĐỊNH DẠNG và HÀNH VI,
/// KHÔNG assert.
///
/// <para>Bước 2 của <c>PROBE-GUIDELINE.md</c> / luật <b>F1</b>: chưa biết app thật hành xử
/// ra sao thì <b>chụp ảnh → đọc ảnh → rồi mới viết assert</b>. Fixture này KHÔNG BAO GIỜ
/// ném: mỗi bước bắt hết ngoại lệ, ghi lại rồi đi tiếp, để MỘT lượt chạy ra đủ bức
/// tranh.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MƯỜI SÁU CÂU HỎI — đối chiếu với spec Playwright
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>../web-tenant-tests/tests/side-panel/guide-selection-dialog-format.spec.ts</c>
///
/// <b>TcD0 — ĐỊNH DẠNG (một lần mở dialog)</b>
///  D1  Tiêu đề cửa sổ đọc ra nguyên văn là gì? Kích thước cửa sổ bao nhiêu px?
///  D2  Cụm header: nhãn 「ガイド番号」 + <c>txtGuidNo</c> + <c>txtGuidNm</c> nguyên văn?
///  D3  Header lưới nguyên văn — 「 ｺｰﾄﾞ」 CÓ dấu cách đứng trước và NỬA chiều rộng?
///      Bề rộng THẬT từng cột (px) so với 65/40/370/70/70 khai trong <c>_viewItem</c>?
///  D4  Mỗi ô có bị <c>CellFormatting</c> chèn dấu cách không (「 名称」 / 「11 」)?
///  D5  Bao nhiêu dòng? Có thanh cuộn không (UIA chỉ phơi dòng đang nhìn thấy — F10)?
///  D6  Vừa mở: con trỏ nằm ở ô nào? (<c>getViewData</c> đặt Rows[0].Cells["cnt"])
///  D7  Dialog có những nút F nào?
///  D8  Nền các dòng đổi màu theo NHÓM (<c>acc_unit &gt;&gt; 4</c>) hay theo chẵn/lẻ?
///  D9  Chữ cột 処置名称 của dòng コメント có đúng magenta/xanh dương không?
///  D10 Khối 窩洞形態 (<c>tabGuide</c>) có hiện với ガイド này không?
///
/// <b>TcD1 — HÀNH VI (mở lại dialog)</b>
///  D11 CLICK ĐƠN lên một dòng có làm 回数 +1 không? (<c>dgvView_CellClick</c>)
///  D12 Click tiếp có quay về 0 khi vượt trần <c>CalcCnt</c> không?
///  D13 Click tiêu đề 「処置名称」 có sắp xếp lưới không? Bấm lần hai có đảo chiều?
///  D14 Click tiêu đề 「回数」 — <c>SortMode = NotSortable</c> ⇒ KHÔNG được sắp xếp?
///  D15 Ở ô 回数 bấm ←: con trỏ có sang được cột 点数 không? (chỉ khi 点数=0 và 自費)
///  D16 Đóng bằng 戻る rồi mở LẠI cùng dòng: 回数 đã sửa có bị xoá không?
///
/// <para>Mỗi câu in ra các dòng <c>=== KQ-n ===</c>; runner tự lọc ra
/// <c>open-guide-dialog-KQ.txt</c>. Dòng bắt đầu bằng <c>DUMP|</c> là dữ liệu để đối chiếu
/// máy-với-máy với bản web. Ảnh từng bước ở <c>artifacts\screenshots\&lt;tên testcase&gt;\</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// AN TOÀN — KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item>KHÔNG Escape khi frm203017 đang mở — Escape = <c>btnF9_Click</c> = 確定
///     (frm203017.cs:180). Luôn đóng bằng nút 「Ｆ１０ 戻る」.</item>
///   <item>KHÔNG bấm F9 của frm203017 (đẩy 処置 vào lưới) và KHÔNG bấm F9 登録 của
///     frm203002 (ghi DB).</item>
///   <item>Sửa 回数 trong dialog rồi ĐÓNG BẰNG 戻る thì không có gì rơi xuống đâu cả —
///     <c>setPacData</c> chỉ chạy ở nhánh F9.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-open-guide-dialog.ps1 -Probe
///   .\run-open-guide-dialog.ps1 -Probe -Case TcD1_ProbeDialogBehaviour
/// </summary>
[TestFixture]
[Category("guide-dialog")]
[Explicit]
[CancelAfter(900_000)]
public sealed class GuideDialogProbeTests : UiTestBase
{
    private GuideTabFlow _guide = null!;
    private GuideDialogFlow _dlg = null!;
    private TestTrace _trace = null!;

    /// <summary>Số dòng ガイド tối đa sẽ thử click để tìm một dòng mở được dialog.</summary>
    private const int ScanLimit = 5;

    /// <summary>Số dòng 処置 tối đa đọc ra từ lưới dialog (đọc từng ô qua cầu MSAA rất chậm).</summary>
    private const int RowLimit = 30;

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _guide = new GuideTabFlow(App, Screen);
        _dlg = new GuideDialogFlow(_guide, App);
        try
        {
            // Lượt trước có thể để lại tab 個別 (lưới master ~1.7k dòng) ⇒ mọi
            // FindFirstDescendant sau đó timeout. Phím không đi qua cây UIA nên không dính.
            _guide.FocusScreen();
            var sent = GuideTabFlow.SendKey(GuideTabFlow.Vk.F4);
            Thread.Sleep(1500);
            Log($"khởi động: F4 để mở tab ガイド ({(sent ? "phím đã gửi" : "⚠ SendInput KHÔNG gửi được")})");
        }
        catch (Exception e) { Log("khởi động: " + e.Message); }
    }

    [TearDown]
    public void ProbeTearDown()
    {
        try
        {
            if (_guide.DialogOpen()) _guide.CloseDialogWithF10();
            _dlg.DismissMsgBoxes();
        }
        catch (Exception e) { Log("dọn cuối testcase KHÔNG xong: " + e.Message); }
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void LogKq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>Dòng dữ liệu đối chiếu máy-với-máy với bản web.</summary>
    private static void LogDump(string line) => Log($"=== KQ-DUMP === DUMP|{line}");

    /// <summary>Mở tab ガイド chế độ 通常 rồi mở dialog ở dòng đầu tiên mở được.</summary>
    private Window? OpenDialog(string tag)
    {
        if (!_guide.TabOpen())
        {
            _guide.OpenRegular();
            Thread.Sleep(800);
        }
        LogKq(tag, $"tab ガイド: {(_guide.TabOpen() ? "mở" : "KHÔNG mở được")} · " +
                   $"dòng(thô)={_guide.RawRowCount()} · №=「{_guide.SelNo()}」");

        var row = _dlg.OpenFirstPickableRow(ScanLimit, l => LogKq(tag, l));
        if (row < 0)
        {
            LogKq(tag, $"KHÔNG dòng nào trong {ScanLimit} dòng đầu mở được dialog — " +
                       "mọi ガイド đều rỗng 処置 (frm203017.cs:1001). Không đo được gì thêm.");
            return null;
        }
        LogKq(tag, $"đo trên ガイド ở dòng {row} (index 0-based)");
        return _guide.Dialog();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TcD0 — ĐỊNH DẠNG
    // ═══════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe D1-D10 — định dạng dialog frm203017: tiêu đề, header, cột, ô, màu, con trỏ")]
    public void TcD0_ProbeDialogFormat()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        var dialog = OpenDialog("D0");
        if (dialog is null) { Assert.Pass("PROBE — không mở được dialog, đọc dòng KQ."); return; }
        trace.Shot("D0-dialog-vua-mo");

        // ── D6 phải đo TRƯỚC mọi thao tác đọc khác: mỗi phép đọc UIA đều có thể
        //     làm dời con trỏ nếu vô tình chạm vào control.
        try
        {
            LogKq("D6", "CÂU HỎI: vừa mở dialog thì con trỏ nằm ở ô nào? " +
                        "(getViewData: dgvView.Focus() + Rows[0].Cells[\"cnt\"].Selected, frm203017.cs:1063-1067)");
            LogKq("D6", "   focus = " + _dlg.FocusedCell());
        }
        catch (Exception e) { LogKq("D6", "NÉM: " + e.Message); }

        // ── D1: cửa sổ ─────────────────────────────────────────────────────
        try
        {
            var rect = Uia.RectOf(dialog);
            LogKq("D1", $"tiêu đề cửa sổ = {Txt.Vis(Uia.NameOf(dialog))} · " +
                        $"AutomationId=「{Uia.AutomationIdOf(dialog)}」");
            LogKq("D1", rect is null
                ? "   không đọc được kích thước"
                : $"   kích thước = {rect.Value.Width}×{rect.Value.Height} px " +
                  "(DialogSize = Size3, frm203017.cs:133; web đặt width=650 height=620)");
            LogDump($"win|dialog|w={rect?.Width}|h={rect?.Height}|title={Txt.N(Uia.NameOf(dialog))}");
        }
        catch (Exception e) { LogKq("D1", "NÉM: " + e.Message); }

        // ── D2: cụm header ガイド番号 ───────────────────────────────────────
        try
        {
            var label = _guide.DialogNameLabel(dialog);
            var no = _guide.DialogGuidNo(dialog);
            var nm = _guide.DialogGuidNm(dialog);
            LogKq("D2", $"lblName={Txt.Vis(label)} · txtGuidNo={Txt.Vis(no)} · txtGuidNm={Txt.Vis(nm)}");
            LogDump($"win|header|no={Txt.N(no)}|nm={Txt.N(nm)}|label={Txt.N(label)}");
        }
        catch (Exception e) { LogKq("D2", "NÉM: " + e.Message); }

        // ── D3: header lưới + bề rộng cột ──────────────────────────────────
        try
        {
            var raw = _dlg.RawHeaderTexts(dialog);
            var widths = _dlg.ColumnWidths(dialog);
            LogKq("D3", $"header ({raw.Count} cột) = {string.Join(" ", raw.Select(Txt.Vis))}");
            LogKq("D3", $"   khai trong _viewItem: {string.Join(" ", GuideDialogFlow.RawHeaders.Select(Txt.Vis))}");
            LogKq("D3", $"   bề rộng THẬT (px) = [{string.Join(", ", widths)}] · " +
                        $"khai báo = [{string.Join(", ", GuideDialogFlow.DeclaredWidths)}]");
            for (var i = 0; i < raw.Count; i++)
                LogDump($"win|col|{i}|text={Txt.N(raw[i])}|raw={Txt.Vis(raw[i])}|w={widths.ElementAtOrDefault(i)}");
        }
        catch (Exception e) { LogKq("D3", "NÉM: " + e.Message); }

        // ── D4 + D5: dòng dữ liệu ──────────────────────────────────────────
        IReadOnlyList<AutomationElement> rows = [];
        try
        {
            rows = _dlg.RowElements(dialog);
            var grid = _dlg.GridElement(dialog);
            var scrollbars = grid is null
                ? 0
                : Uia.Children(grid).Count(c => Uia.ControlTypeOf(c) == FlaUI.Core.Definitions.ControlType.ScrollBar);
            LogKq("D5", $"số dòng UIA đọc được = {rows.Count} · thanh cuộn = {scrollbars} " +
                        "(F10: UIA chỉ phơi dòng ĐANG NHÌN THẤY — có thanh cuộn nghĩa là còn dòng chưa đọc)");

            LogKq("D4", "CÂU HỎI: CellFormatting có chèn dấu cách vào mọi ô không? " +
                        "(cột canh trái 「 {0}」, canh phải 「{0} 」 — frm203017.cs:221-232)");
            var take = Math.Min(rows.Count, RowLimit);
            for (var i = 0; i < take; i++)
            {
                var raw = _dlg.RawCells(rows[i]);
                if (i < 3) LogKq("D4", $"   dòng {i} NGUYÊN VĂN = {string.Join(" ", raw.Select(Txt.Vis))}");
                LogDump($"win|row|{i}|" + string.Join("|", raw.Select(c => Txt.N(c))));
            }
            if (rows.Count > take) LogKq("D4", $"   (còn {rows.Count - take} dòng không in)");
        }
        catch (Exception e) { LogKq("D4", "NÉM: " + e.Message); }

        // ── D7: nút F ──────────────────────────────────────────────────────
        try
        {
            var btns = _dlg.FKeyButtons(dialog);
            LogKq("D7", $"nút F trên dialog = {(btns.Count == 0 ? "(không thấy)" : string.Join(" · ", btns))} " +
                        "(_btnInfo chỉ bật F9 「確定」 + F10 「戻る」, frm203017.cs:78-92)");
            LogDump("win|fkeys|" + string.Join(",", btns));
        }
        catch (Exception e) { LogKq("D7", "NÉM: " + e.Message); }

        // ── D8 + D9: màu nền theo nhóm & màu chữ コメント ───────────────────
        try
        {
            LogKq("D8", "CÂU HỎI: nền đổi màu theo NHÓM (acc_unit >> 4) hay theo chẵn/lẻ? " +
                        "(frm203017.cs:1038-1050)");
            LogKq("D9", "CÂU HỎI: chữ cột 処置名称 — magenta(255,0,255)=レセプト印字, " +
                        "xanh dương=カルテ印字, đen=処置 thường?");
            var take = Math.Min(rows.Count, 12);
            for (var i = 0; i < take; i++)
            {
                var cells = _dlg.Cells(rows[i]);
                if (cells.Count <= GuideDialogFlow.ColNm) continue;
                var bg = GuideDialogFlow.BackColorOf(cells[GuideDialogFlow.ColCd]);
                var ink = GuideDialogFlow.InkColorOf(cells[GuideDialogFlow.ColNm]);
                var cd = Txt.N(Uia.ValueOf(cells[GuideDialogFlow.ColCd]));
                var nm = Txt.N(Uia.ValueOf(cells[GuideDialogFlow.ColNm]));
                LogKq("D8", $"   dòng {i} cd={cd} nền={PixelProbe.Describe(bg)} chữ={PixelProbe.Describe(ink)} 「{nm}」");
                LogDump($"win|color|{i}|cd={cd}|bg={PixelProbe.Describe(bg)}|ink={PixelProbe.Describe(ink)}");
            }
        }
        catch (Exception e) { LogKq("D8", "NÉM: " + e.Message); }

        // ── D10: khối 窩洞形態 ──────────────────────────────────────────────
        try
        {
            var tab = Uia.ById(dialog, "tabGuide");
            var shown = tab is not null && Uia.IsOnScreen(tab);
            LogKq("D10", $"tabGuide (窩洞形態) = {(tab is null ? "KHÔNG có trong cây UIA" : shown ? "HIỆN" : "ẩn")} " +
                         "(chỉ hiện khi ガイド trộn 複雑+単純, frm203017.cs:445-452)");
            LogDump($"win|cavity|shown={shown}");
        }
        catch (Exception e) { LogKq("D10", "NÉM: " + e.Message); }

        trace.Shot("D0-da-doc-xong");
        _guide.CloseDialogWithF10();
        Assert.Pass("PROBE — đọc các dòng KQ + thư mục ảnh, không assert gì.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TcD1 — HÀNH VI
    // ═══════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe D11-D16 — click đổi 回数, sắp xếp theo tiêu đề, ←/→, mở lại dialog")]
    public void TcD1_ProbeDialogBehaviour()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        var dialog = OpenDialog("D1x");
        if (dialog is null) { Assert.Pass("PROBE — không mở được dialog, đọc dòng KQ."); return; }
        trace.Shot("D1-dialog-vua-mo");

        var rows = _dlg.RowElements(dialog);
        if (rows.Count == 0) { Assert.Pass("PROBE — lưới dialog rỗng."); return; }

        // ── D11 + D12: click đơn làm 回数 +1, vượt trần thì về 0 ────────────
        try
        {
            LogKq("D11", "CÂU HỎI: CLICK ĐƠN lên một dòng có làm 回数 +1 không? " +
                         "(dgvView_CellClick, frm203017.cs:363-388 — KHÔNG phải double-click)");
            var cells = _dlg.Cells(rows[0]);
            var before = Txt.N(Uia.ValueOf(cells[GuideDialogFlow.ColCnt]));
            // Click vào ô 処置名称 (không phải ô 回数) — CellClick bắt mọi cột.
            GuideDialogFlow.ClickElement(cells[GuideDialogFlow.ColNm]);
            var after1 = Txt.N(Uia.ValueOf(_dlg.Cells(_dlg.RowElements(dialog)[0])[GuideDialogFlow.ColCnt]));
            LogKq("D11", $"   回数 dòng 0: 「{before}」 → click 1 lần → 「{after1}」");
            LogDump($"win|cycle|start={before}|after1={after1}");

            for (var k = 2; k <= 4; k++)
            {
                GuideDialogFlow.ClickElement(_dlg.Cells(_dlg.RowElements(dialog)[0])[GuideDialogFlow.ColNm]);
                var v = Txt.N(Uia.ValueOf(_dlg.Cells(_dlg.RowElements(dialog)[0])[GuideDialogFlow.ColCnt]));
                LogKq("D12", $"   click lần {k} → 回数 = 「{v}」");
                LogDump($"win|cycle|after{k}={v}");
            }
            trace.Shot("D1-sau-khi-click-cnt");
        }
        catch (Exception e) { LogKq("D11", "NÉM: " + e.Message); }

        // ── D13 + D14: sắp xếp theo tiêu đề cột ────────────────────────────
        try
        {
            LogKq("D13", "CÂU HỎI: click tiêu đề 「処置名称」 có sắp xếp không? Lần hai có đảo chiều?");
            var before = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
            LogKq("D13", $"   ｺｰﾄﾞ trước sort = [{string.Join(", ", before.Take(8))}]");

            _dlg.ClickHeader(dialog, GuideDialogFlow.ColNm);
            var after1 = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
            LogKq("D13", $"   sau click 「処置名称」 = [{string.Join(", ", after1.Take(8))}] " +
                         $"({(before.SequenceEqual(after1) ? "KHÔNG đổi" : "ĐÃ đổi thứ tự")})");

            _dlg.ClickHeader(dialog, GuideDialogFlow.ColNm);
            var after2 = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
            LogKq("D13", $"   click lần 2 = [{string.Join(", ", after2.Take(8))}] " +
                         $"({(after1.SequenceEqual(after2) ? "KHÔNG đổi" : "ĐÃ đảo chiều")})");
            LogDump($"win|sort|nm|changed1={!before.SequenceEqual(after1)}|changed2={!after1.SequenceEqual(after2)}");

            LogKq("D14", "CÂU HỎI: cột 「回数」 có sắp xếp được không? " +
                         "(initProc: Columns[4].SortMode = NotSortable, frm203017.cs:418)");
            var beforeCnt = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
            _dlg.ClickHeader(dialog, GuideDialogFlow.ColCnt);
            var afterCnt = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
            LogKq("D14", $"   sau click 「回数」 = {(beforeCnt.SequenceEqual(afterCnt) ? "KHÔNG đổi (đúng NotSortable)" : "ĐÃ ĐỔI ⇒ vẫn sort được?!")}");
            LogDump($"win|sort|cnt|changed={!beforeCnt.SequenceEqual(afterCnt)}");
            trace.Shot("D1-sau-khi-sort");
        }
        catch (Exception e) { LogKq("D13", "NÉM: " + e.Message); }

        // ── D15: ←/→ trong lưới ────────────────────────────────────────────
        try
        {
            LogKq("D15", "CÂU HỎI: đứng ở ô 回数 bấm ← thì con trỏ có sang cột 点数 không? " +
                         "(dgvView_KeyDown chặn ← trừ khi 点数=0 và 自費, frm203017.cs:240-258)");
            var cells = _dlg.Cells(_dlg.RowElements(dialog)[0]);
            GuideDialogFlow.ClickElement(cells[GuideDialogFlow.ColCnt]);
            LogKq("D15", "   focus trước ← = " + _dlg.FocusedCell());
            Uia.SendKey(Vk.Left);
            Thread.Sleep(400);
            LogKq("D15", "   focus sau  ← = " + _dlg.FocusedCell());
            Uia.SendKey(Vk.Right);
            Thread.Sleep(400);
            LogKq("D15", "   focus sau  → = " + _dlg.FocusedCell());
        }
        catch (Exception e) { LogKq("D15", "NÉM: " + e.Message); }

        // ── D16: đóng bằng 戻る rồi mở lại ─────────────────────────────────
        try
        {
            LogKq("D16", "CÂU HỎI: đóng bằng 戻る rồi mở LẠI cùng ガイド thì 回数 vừa sửa còn không? " +
                         "(frm203017.Instance dựng form MỚI khi bản cũ đã Dispose, :113-124)");
            var cntBefore = Txt.N(Uia.ValueOf(_dlg.Cells(_dlg.RowElements(dialog)[0])[GuideDialogFlow.ColCnt]));
            var closed = _guide.CloseDialogWithF10();
            LogKq("D16", $"   đóng bằng nút 戻る = {closed} · 回数 lúc đóng = 「{cntBefore}」");

            var again = OpenDialog("D16");
            if (again is null) LogKq("D16", "   mở lại KHÔNG được — không kết luận được gì");
            else
            {
                var rows2 = _dlg.RowElements(again);
                var cntAfter = rows2.Count == 0
                    ? "(lưới rỗng)"
                    : Txt.N(Uia.ValueOf(_dlg.Cells(rows2[0])[GuideDialogFlow.ColCnt]));
                LogKq("D16", $"   mở lại: 回数 dòng 0 = 「{cntAfter}」 " +
                             $"({(cntAfter == cntBefore ? "GIỮ NGUYÊN giá trị vừa sửa" : "đã reset")})");
                LogKq("D16", "   header sau khi mở lại: " +
                             string.Join(" ", _dlg.RawHeaderTexts(again).Select(Txt.Vis)));
                LogDump($"win|reopen|closed={cntBefore}|reopened={cntAfter}");
                trace.Shot("D16-mo-lai");
                _guide.CloseDialogWithF10();
            }
        }
        catch (Exception e) { LogKq("D16", "NÉM: " + e.Message); }

        Assert.Pass("PROBE — đọc các dòng KQ + thư mục ảnh, không assert gì.");
    }
}
