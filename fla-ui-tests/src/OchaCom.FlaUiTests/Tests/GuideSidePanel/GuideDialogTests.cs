using System.Drawing;
using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// Dialog 「ガイド処置選択」 <c>frm203017</c> — <b>ĐÁP ÁN</b> mà bản web phải khớp.
///
/// <para>Nửa WinForm của
/// <c>../web-tenant-tests/tests/side-panel/guide-selection-dialog-format.spec.ts</c>.
/// Luồng anh em <see cref="GuideSidePanelTests"/> đo TAB ガイド (list, ô 選択№, ba nút);
/// fixture này đo CHÍNH DIALOG: cửa sổ, 5 cột, từng ô, con trỏ, sắp xếp, 回数, màu.</para>
///
/// <para>Mọi con số dưới đây <b>đã đo trên máy thật 2026-09-08</b> bằng
/// <see cref="GuideDialogProbeTests"/> — không assert nào viết theo phỏng đoán (luật F1).
/// Sửa assert thì chạy lại PROBE trước.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐO ĐƯỢC (bệnh nhân 12138, hôm nay, ガイド dòng 1 = 101 「検査(Br)」)
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="bullet">
///   <item>Cửa sổ 700×740 px, tiêu đề 「ガイド処置選択」, AutomationId <c>frm203017</c>.</item>
///   <item>Header lưới NGUYÊN VĂN: 「 ｺｰﾄﾞ」(có DẤU CÁCH đứng trước, katakana NỬA chiều
///     rộng) 「枝番」「処置名称」「点数」「回数」; bề rộng thật đúng bằng khai báo
///     65/40/370/70/70 px.</item>
///   <item><c>CellFormatting</c> chèn dấu cách: 「135 」「3 」「 パノラマデジタル」「402 」「1 」.</item>
///   <item>12 dòng 処置, không thanh cuộn. Con trỏ vừa mở nằm ở 「回数 Row 0」.</item>
///   <item>Click ĐƠN lên một ô bất kỳ của dòng: 回数 1 → 0 → 1 → 0 (cộng 1, vượt
///     <c>maxCnt</c>=1 thì về 0).</item>
///   <item>Click 「処置名称」 sắp xếp được, lần hai đảo chiều; click 「回数」 KHÔNG đổi gì.</item>
///   <item>←/→ ở ô 回数 KHÔNG dời con trỏ (dòng 0 có 点数=402 ≠ 0 nên nhánh 自費 không mở).</item>
///   <item>Nền dòng: trắng · trắng · xanh nhạt ×4 · trắng · xanh nhạt ×3 · trắng —
///     tức đổi theo NHÓM <c>acc_unit &gt;&gt; 4</c>, KHÔNG phải chẵn/lẻ.</item>
///   <item>Chữ 処置名称 của mã 7321 (カルテコメント) = RGB(0,0,255); mã 処置 thường = đen.</item>
///   <item>Nút F: <c>btnF9</c>「F9 確定」 và <c>btnF10</c>「F10 戻る」 — không nút nào khác.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY TUẦN TỰ, CHUNG MỘT DIALOG
/// ═══════════════════════════════════════════════════════════════════════════
/// Mở frm203017 tốn ~10s nên các testcase DÙNG CHUNG một dialog đang mở
/// (<see cref="EnsureDialog"/> mở lại nếu nó đã đóng). Thứ tự được ghim bằng
/// <c>[Order]</c>; chạy lẻ một testcase ở giữa vẫn được, chỉ tốn thêm thời gian.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG bấm F9 của frm203017 (đẩy 処置 vào lưới) và KHÔNG bấm F9 登録 của frm203002.
/// Sửa 回数 rồi đóng bằng 「Ｆ１０ 戻る」 là vô hại — <c>setPacData</c> chỉ chạy ở nhánh F9.
/// TUYỆT ĐỐI KHÔNG Escape: trên dialog này Escape = <c>btnF9_Click</c> = 確定
/// (frm203017.cs:180-182).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-open-guide-dialog.ps1
///   .\run-open-guide-dialog.ps1 -Case TcD10
/// </summary>
[TestFixture]
[Category("guide-dialog")]
[CancelAfter(900_000)]
public sealed class GuideDialogTests : UiTestBase
{
    private GuideTabFlow _guide = null!;
    private GuideDialogFlow _dlg = null!;

    /// <summary>Số dòng ガイド tối đa sẽ thử click để tìm dòng mở được dialog.</summary>
    private const int ScanLimit = 5;

    /// <summary>Dải mã コメント được tô màu (frm203017.cs:1053, DbLibrary.codeType).</summary>
    private const int ReceiptCodeMin = 700;
    private const int ReceiptCodeMax = 899;
    private const int KarteCodeMin = 7000;
    private const int KarteCodeMax = 8999;

    [OneTimeSetUp]
    public void DialogOneTimeSetUp()
    {
        _guide = new GuideTabFlow(App, Screen);
        _dlg = new GuideDialogFlow(_guide, App);
        try
        {
            // Lượt trước có thể để lại tab 個別 (lưới master ~1.7k dòng) ⇒ mọi
            // FindFirstDescendant sau đó timeout. Phím không đi qua cây UIA.
            _guide.FocusScreen();
            GuideTabFlow.SendKey(GuideTabFlow.Vk.F4);
            Thread.Sleep(1500);
        }
        catch (Exception e) { TestContext.Out.WriteLine("khởi động: " + e.Message); }

    }

    [OneTimeTearDown]
    public void DialogOneTimeTearDown()
    {
        try
        {
            if (_guide.DialogOpen()) _guide.CloseDialogWithF10();
            _dlg.DismissMsgBoxes();
        }
        catch (Exception e) { TestContext.Out.WriteLine("dọn cuối fixture: " + e.Message); }
    }

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>Dòng đối chiếu máy-với-máy với spec Playwright (nó in <c>DUMP|web|…</c>).</summary>
    private static void Dump(string line) => Log($"=== KQ-DUMP === DUMP|win|{line}");

    /// <summary>
    /// Bảo đảm có một frm203017 đang mở; mở lại nếu cần.
    ///
    /// <para>ガイド nào không có 処置 tính được thì <c>getViewData</c> tự đóng kèm E00024
    /// (frm203017.cs:1001-1024) — nên phải DÒ chứ không đóng đinh dòng 0.</para>
    /// </summary>
    private Window EnsureDialog()
    {
        var open = _guide.Dialog();
        if (open is not null && _guide.DialogOpen()) return open;

        if (!_guide.TabOpen())
        {
            _guide.OpenRegular();
            Thread.Sleep(800);
        }
        Assert.That(_guide.TabOpen(), Is.True,
            "không mở được tab ガイド ⇒ HARNESS hỏng, sửa trước khi đọc kết quả bên dưới");

        var row = _dlg.OpenFirstPickableRow(ScanLimit, Log);
        Assert.That(row, Is.GreaterThanOrEqualTo(0),
            $"không ガイド nào trong {ScanLimit} dòng đầu mở được 「ガイド処置選択」. " +
            "Đây là điều kiện DỮ LIỆU của máy đo, không phải lỗi app: mọi ガイド đầu list " +
            "đều không có 処置 nào tính được (frm203017.cs:1001).");

        var dialog = _guide.Dialog();
        Assert.That(dialog, Is.Not.Null, "dialog vừa báo mở mà đọc lại không thấy");
        return dialog!;
    }

    /// <summary>Các dòng dữ liệu, kèm assert 「phải có dòng」.</summary>
    private IReadOnlyList<AutomationElement> RequireRows(Window dialog)
    {
        var rows = _dlg.RowElements(dialog);
        Assert.That(rows, Is.Not.Empty,
            "ガイド đã mở được dialog thì lưới KHÔNG được rỗng — rỗng là tự đóng " +
            "(frm203017.cs:1001), tức HARNESS đọc trượt lưới chứ không phải app sai");
        return rows;
    }

    private string CellRaw(AutomationElement row, int col)
    {
        var cells = _dlg.Cells(row);
        return col < cells.Count ? Uia.ValueOf(cells[col]) : "";
    }

    /// <summary>
    /// In 部位/療法 của dòng đang có con trỏ trên <c>grdRegi</c>.
    ///
    /// <para>Đây là TIỀN ĐỀ của mọi phép so danh sách với bản web: frm203017 nhận 部位/病名
    /// của DÒNG ĐANG CHỌN (<c>hfgGuid1_CellDoubleClick</c> snapshot <c>getFocusBui</c>/
    /// <c>getFocusDis</c>, frm203002.cs:6515), và bản web gửi đúng hai thứ đó lên BE
    /// (dòng <c>DUMP|web|req|…|Bui=…|DisCd=…</c>). Hai danh sách chỉ so được với nhau khi
    /// hai tiền đề bằng nhau — thiếu dòng này thì mọi kết luận 「web thiếu dòng X」 đều
    /// treo lơ lửng.</para>
    ///
    /// <para>⚠️ Phải ĐÓNG dialog trước khi đọc: frm203017 là modal, luồng UI của
    /// frm203002 đang bị chặn nên mọi phép đọc <c>grdRegi</c> sẽ treo tới hết deadline.
    /// Và phải đặt trong TESTCASE chứ không phải <c>OneTimeSetUp</c> — output của
    /// OneTimeSetUp KHÔNG vào <c>.trx</c>, runner lọc KQ từ đó nên dòng in ra biến mất
    /// (đã vấp 2026-09-08).</para>
    /// </summary>
    private void DumpFocusRowContext()
    {
        try
        {
            if (_guide.DialogOpen()) _guide.CloseDialogWithF10();

            // CurrentRow() bám phần tử ĐANG GIỮ CON TRỎ, mà sau F4 con trỏ nằm ở
            // txtGuid1Sel của side panel ⇒ luôn null. Vì thế in cả hai: dòng đang giữ
            // con trỏ (nếu có) VÀ vài dòng đầu của lưới — 部位 mà frm203017 nhận được là
            // của dòng đang chọn LÚC BẤM F4, thực tế gần như luôn là dòng đầu.
            var row = Screen.Regi.CurrentRow();
            Dump(row is null
                ? "ctx|focusRow=(con trỏ không nằm trên grdRegi — sau F4 nó ở txtGuid1Sel)"
                : $"ctx|focusRow|bui={Txt.N(row.At(Screens.RegiGrid.Col.Bui))}|" +
                  $"ryo={Txt.N(row.At(Screens.RegiGrid.Col.Ryo))}");

            var bui = Screen.Regi.Column(Screens.RegiGrid.Col.Bui, limit: 5);
            var ryo = Screen.Regi.Column(Screens.RegiGrid.Col.Ryo, limit: 5);
            for (var i = 0; i < bui.Count; i++)
                Dump($"ctx|regi|{i}|bui={Txt.Vis(bui[i])}|ryo={Txt.N(ryo.ElementAtOrDefault(i) ?? "")}");
        }
        catch (Exception e) { Dump($"ctx|lỗi đọc grdRegi: {e.Message}"); }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-D1 … TC-D3 — cửa sổ và cột
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-D1 — cửa sổ 「ガイド処置選択」: tiêu đề, cụm header ガイド番号 + 番号 + 名称")]
    public void TcD1_DialogTitleAndHeader()
    {
        var dialog = EnsureDialog();

        Assert.Multiple(() =>
        {
            Assert.That(Txt.N(Uia.NameOf(dialog)), Is.EqualTo(GuideTabFlow.DialogTitle),
                "tiêu đề cửa sổ = _title (frm203017.cs:77)");
            Assert.That(Uia.AutomationIdOf(dialog), Is.EqualTo("frm203017"),
                "AutomationId của form — mốc nhận dạng dialog");
            Assert.That(Txt.N(_guide.DialogNameLabel(dialog)), Is.EqualTo("ガイド番号"),
                "nhãn header (frm203017.Designer.cs:110)");
            Assert.That(Txt.Int(_guide.DialogGuidNo(dialog)), Is.Not.Null,
                "txtGuidNo mang guid_cd của dòng vừa chọn (frm203017.cs:428)");
            Assert.That(Txt.N(_guide.DialogGuidNm(dialog)), Is.Not.Empty,
                "txtGuidNm mang guid_nm của dòng vừa chọn (frm203017.cs:429)");
        });

        var rect = Uia.RectOf(dialog);
        Dump($"dialog|w={rect?.Width}|h={rect?.Height}|title={Txt.N(Uia.NameOf(dialog))}");
        Dump($"header|no={Txt.N(_guide.DialogGuidNo(dialog))}|nm={Txt.N(_guide.DialogGuidNm(dialog))}|" +
             $"label={Txt.N(_guide.DialogNameLabel(dialog))}");
    }

    [Test, Order(2)]
    [Description("TC-D2 — 5 cột đúng thứ tự, tiêu đề NGUYÊN VĂN 「 ｺｰﾄﾞ」 nửa chiều rộng + dấu cách")]
    public void TcD2_ColumnHeadersRaw()
    {
        var dialog = EnsureDialog();
        var raw = _dlg.RawHeaderTexts(dialog);

        Assert.That(raw, Has.Count.EqualTo(5),
            "_viewItem khai 9 cột nhưng 4 cột cuối để width = 0 (jihi_flg/men/unit/acc_unit) " +
            $"nên chỉ 5 cột ra tới UIA (frm203017.cs:96-104). Đọc ra: [{string.Join(" | ", raw)}]");

        for (var i = 0; i < raw.Count; i++)
        {
            Dump($"col|{i}|text={Txt.N(raw[i])}|raw={Txt.Vis(raw[i])}");
            Assert.That(raw[i], Is.EqualTo(GuideDialogFlow.RawHeaders[i]),
                $"tiêu đề cột {i} phải NGUYÊN VĂN như _viewItem (frm203017.cs:{97 + i}). " +
                $"Đọc ra {Txt.Vis(raw[i])}, mong đợi {Txt.Vis(GuideDialogFlow.RawHeaders[i])}. " +
                "⚠️ So NGUYÊN VĂN là CỐ Ý: cột đầu là 「 ｺｰﾄﾞ」 — katakana NỬA chiều rộng và " +
                "có một dấu cách đứng trước; đi qua NFKC thì nó thành 「コード」 đúng bằng chuỗi " +
                "bản web hiển thị, và điểm lệch biến mất khỏi test.");
        }
    }

    [Test, Order(3)]
    [Description("TC-D3 — bề rộng cột đúng bằng _viewItem: 65/40/370/70/70 px")]
    public void TcD3_ColumnWidths()
    {
        var dialog = EnsureDialog();
        var widths = _dlg.ColumnWidths(dialog);

        Assert.That(widths, Has.Count.EqualTo(5), "phải đọc được bề rộng cả 5 cột");
        for (var i = 0; i < widths.Count; i++)
            Dump($"colw|{i}|w={widths[i]}|declared={GuideDialogFlow.DeclaredWidths[i]}");

        Assert.Multiple(() =>
        {
            for (var i = 0; i < widths.Count; i++)
                Assert.That(widths[i], Is.EqualTo(GuideDialogFlow.DeclaredWidths[i]).Within(2),
                    $"cột {i} khai {GuideDialogFlow.DeclaredWidths[i]} px trong _viewItem " +
                    "(frm203017.cs:97-101) — DataGridView không tự co giãn nên phải khớp");
        });

        // Quan hệ giữa các cột là thứ bản web PHẢI giữ (nó dùng CSS grid, không dùng px):
        // 処置名称 rộng nhất, 枝番 hẹp nhất, 回数 rộng hơn 枝番.
        Assert.Multiple(() =>
        {
            Assert.That(widths[GuideDialogFlow.ColNm], Is.GreaterThan(widths.Max(w => w == widths[GuideDialogFlow.ColNm] ? 0 : w)),
                "処置名称 (370) phải là cột rộng nhất");
            Assert.That(widths[GuideDialogFlow.ColSb], Is.EqualTo(widths.Min()),
                "枝番 (40) phải là cột HẸP NHẤT");
            Assert.That(widths[GuideDialogFlow.ColCnt], Is.GreaterThan(widths[GuideDialogFlow.ColSb]),
                "回数 (70) phải rộng hơn 枝番 (40)");
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-D4 … TC-D6 — dữ liệu, dấu cách, con trỏ
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC-D4 — danh sách 処置: mọi ô số parse được, 処置名称 không rỗng; in trọn để đối chiếu")]
    public void TcD4_RowsAreWellFormed()
    {
        DumpFocusRowContext();

        var dialog = EnsureDialog();
        var rows = RequireRows(dialog);
        Log($"dialog có {rows.Count} dòng 処置");

        for (var i = 0; i < rows.Count; i++)
        {
            var raw = _dlg.RawCells(rows[i]);
            Dump($"row|{i}|" + string.Join("|", raw.Select(Txt.N)));

            Assert.Multiple(() =>
            {
                Assert.That(Txt.Int(raw.ElementAtOrDefault(GuideDialogFlow.ColCd) ?? ""), Is.Not.Null,
                    $"dòng {i}: ｺｰﾄﾞ phải là số (dspDt.trt_cd là int, frm203017.cs:579)");
                Assert.That(Txt.Int(raw.ElementAtOrDefault(GuideDialogFlow.ColSb) ?? ""), Is.Not.Null,
                    $"dòng {i}: 枝番 phải là số (:580)");
                Assert.That(Txt.Int(raw.ElementAtOrDefault(GuideDialogFlow.ColScore) ?? ""), Is.Not.Null,
                    $"dòng {i}: 点数 phải là số (:582)");
                Assert.That(Txt.Int(raw.ElementAtOrDefault(GuideDialogFlow.ColCnt) ?? ""), Is.Not.Null,
                    $"dòng {i}: 回数 phải là số (:583)");
                Assert.That(Txt.N(raw.ElementAtOrDefault(GuideDialogFlow.ColNm) ?? ""), Is.Not.Empty,
                    $"dòng {i}: 処置名称 rỗng — mst_trt.trt_nm không được trống (:581)");
            });
        }
    }

    [Test, Order(5)]
    [Description("TC-D5 — CellFormatting chèn dấu cách: cột canh trái 「 {0}」, cột canh phải 「{0} 」")]
    public void TcD5_CellFormattingPadsEveryCell()
    {
        var dialog = EnsureDialog();
        var row = RequireRows(dialog)[0];

        var cd = CellRaw(row, GuideDialogFlow.ColCd);
        var nm = CellRaw(row, GuideDialogFlow.ColNm);
        var cnt = CellRaw(row, GuideDialogFlow.ColCnt);
        Dump($"pad|cd={Txt.Vis(cd)}|nm={Txt.Vis(nm)}|cnt={Txt.Vis(cnt)}");

        Assert.Multiple(() =>
        {
            Assert.That(cd, Does.EndWith(" "),
                "cột canh PHẢI được format thành 「{0} 」 (dgvView_CellFormatting, frm203017.cs:228)");
            Assert.That(cnt, Does.EndWith(" "), "回数 cũng canh phải (:101)");
            Assert.That(nm, Does.StartWith(" "),
                "処置名称 canh TRÁI ⇒ format thành 「 {0}」 (:224)");
        });

        Log("Ghi chú parity: bản web không chèn dấu cách vào chuỗi — nó canh lề bằng CSS. " +
            "Đây là LỆCH CỐ Ý, chỉ ghi nhận; đừng bắt bản web nhét dấu cách vào dữ liệu.");
    }

    [Test, Order(6)]
    [Description("TC-D6 — vừa mở: con trỏ nằm ở ô 「回数」 của DÒNG ĐẦU")]
    public void TcD6_InitialFocusIsFirstCntCell()
    {
        // Đóng rồi mở lại: TC trước có thể đã dời con trỏ, mà câu hỏi ở đây là
        // 「VỪA MỞ thì con trỏ ở đâu」 (getViewData :1063-1067).
        if (_guide.DialogOpen()) _guide.CloseDialogWithF10();
        EnsureDialog();

        var focus = _dlg.FocusedCell();
        Dump($"focus|{focus}");
        Assert.That(focus, Does.Contain("回数").And.Contain("Row 0"),
            "getViewData gọi dgvView.Focus() rồi Rows[0].Cells[\"cnt\"].Selected = true " +
            $"(frm203017.cs:1063-1067). Đọc ra: {focus}. " +
            "Đọc ra 「Yes」/「No」/「OK」 nghĩa là có MessageBox chắn, không phải lưới sai (F19).");
    }

    [Test, Order(7)]
    [Description("TC-D7 — ↑/↓ dời con trỏ giữa các ô 回数, clamp ở dòng đầu")]
    public void TcD7_ArrowsMoveBetweenCntCells()
    {
        var dialog = EnsureDialog();
        var rows = RequireRows(dialog);
        if (rows.Count < 2) Assert.Ignore($"dialog chỉ có {rows.Count} dòng — ↑/↓ không đo được");

        GuideDialogFlow.ClickElement(_dlg.Cells(rows[0])[GuideDialogFlow.ColCnt]);
        Assert.That(_dlg.FocusedCell(), Does.Contain("Row 0"), "phải đứng ở dòng 0 trước khi gõ");

        Uia.SendKey(Vk.Down);
        Thread.Sleep(400);
        Assert.That(_dlg.FocusedCell(), Does.Contain("回数").And.Contain("Row 1"),
            "↓ phải xuống ô 回数 dòng kế — dgvView_KeyDown chỉ chặn ←/→ (frm203017.cs:240-268), " +
            "↑/↓ để DataGridView tự xử lý");

        Uia.SendKey(Vk.Up);
        Thread.Sleep(400);
        Assert.That(_dlg.FocusedCell(), Does.Contain("Row 0"), "↑ phải quay về dòng 0");

        Uia.SendKey(Vk.Up);
        Thread.Sleep(400);
        Assert.That(_dlg.FocusedCell(), Does.Contain("Row 0"),
            "↑ ở dòng đầu phải đứng yên, không cuộn vòng xuống cuối");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-D8 … TC-D9 — sắp xếp
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(8)]
    [Description("TC-D8 — click tiêu đề 「処置名称」 đổi thứ tự, click lần hai đảo chiều")]
    public void TcD8_HeaderClickSorts()
    {
        var dialog = EnsureDialog();
        if (RequireRows(dialog).Count < 2) Assert.Ignore("dưới 2 dòng — sắp xếp không kết luận được");

        var before = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
        _dlg.ClickHeader(dialog, GuideDialogFlow.ColNm);
        var asc = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
        _dlg.ClickHeader(dialog, GuideDialogFlow.ColNm);
        var desc = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);

        Dump($"sort|nm|changed1={!before.SequenceEqual(asc)}|changed2={!asc.SequenceEqual(desc)}");
        Assert.Multiple(() =>
        {
            Assert.That(asc, Is.Not.EqualTo(before),
                "4 cột đầu để SortMode mặc định (Automatic) nên click tiêu đề phải sắp xếp " +
                "(initProc chỉ tắt cột 4, frm203017.cs:418)");
            Assert.That(desc, Is.Not.EqualTo(asc), "click lần hai phải đảo chiều");
        });

        // Trả lưới về thứ tự gốc cho testcase sau: mở lại là có DataSource mới.
        _guide.CloseDialogWithF10();
        EnsureDialog();
    }

    [Test, Order(9)]
    [Description("TC-D9 — cột 「回数」 KHÔNG sắp xếp được (Columns[4].SortMode = NotSortable)")]
    public void TcD9_CntColumnIsNotSortable()
    {
        var dialog = EnsureDialog();
        if (RequireRows(dialog).Count < 2) Assert.Ignore("dưới 2 dòng — không kết luận được");

        var before = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);
        _dlg.ClickHeader(dialog, GuideDialogFlow.ColCnt);
        var after = _dlg.ColumnValues(dialog, GuideDialogFlow.ColCd);

        Dump($"sort|cnt|changed={!before.SequenceEqual(after)}");
        Assert.That(after, Is.EqualTo(before),
            "initProc đặt Columns[4].SortMode = NotSortable (frm203017.cs:418) ⇒ click tiêu đề " +
            "「回数」 KHÔNG được đổi thứ tự dòng nào");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-D10 … TC-D12 — 回数, màu, nút F
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(10)]
    [Description("TC-D10 — CLICK ĐƠN lên một dòng làm 回数 +1, vượt trần CalcCnt thì về 0")]
    public void TcD10_SingleClickCyclesCnt()
    {
        var dialog = EnsureDialog();
        var rows = RequireRows(dialog);

        var seen = new List<string> { Txt.N(CellRaw(rows[0], GuideDialogFlow.ColCnt)) };
        for (var k = 0; k < 3; k++)
        {
            // Click vào ô 処置名称, KHÔNG phải ô 回数: dgvView_CellClick bắt MỌI cột, và
            // click vào chính ô 回数 còn mở luôn editor nên đọc ra giá trị đang sửa.
            GuideDialogFlow.ClickElement(_dlg.Cells(_dlg.RowElements(dialog)[0])[GuideDialogFlow.ColNm]);
            seen.Add(Txt.N(CellRaw(_dlg.RowElements(dialog)[0], GuideDialogFlow.ColCnt)));
        }
        Dump($"cycle|{string.Join("|", seen)}");
        Log($"回数 dòng 0 qua 3 cú click đơn: {string.Join(" → ", seen)}");

        Assert.That(seen[1], Is.Not.EqualTo(seen[0]),
            "dgvView_CellClick (frm203017.cs:363-388) là sự kiện CLICK ĐƠN: cnt++ rồi kẹp về 0 " +
            "khi vượt maxCnt (CalcCnt.getCalcCnt). ⚠️ Bản web treo hành vi này vào double-click " +
            "— chỗ lệch đó được đo ở testcase 「WinForm parity D-a」 bên Playwright.");
        Assert.That(seen.Distinct().Count(), Is.GreaterThan(1), "回数 phải thay đổi qua các cú click");
        // Mỗi bước phải là 「+1」 HOẶC 「về 0」 — không đóng đinh trần vì trần là CalcCnt
        // của chính dòng đó (dòng đo được hôm 2026-09-08 có trần 1 nên chạy 1→0→1→0,
        // dòng khác có thể 1→2→3→0).
        for (var k = 1; k < seen.Count; k++)
        {
            var prev = Txt.Int(seen[k - 1]) ?? -1;
            var now = Txt.Int(seen[k]) ?? -1;
            Assert.That(now == prev + 1 || now == 0, Is.True,
                $"bước {k}: 回数 đi từ {prev} sang {now} — chỉ được +1 hoặc quay về 0 khi vượt " +
                "trần CalcCnt (frm203017.cs:383-386)");
        }
    }

    [Test, Order(11)]
    [Description("TC-D11 — chữ 処置名称: mã コメント xanh dương/magenta, mã 処置 thường màu đen")]
    public void TcD11_CommentRowsAreColoured()
    {
        var dialog = EnsureDialog();
        var rows = RequireRows(dialog);

        var coloured = 0;
        for (var i = 0; i < rows.Count; i++)
        {
            var cells = _dlg.Cells(rows[i]);
            if (cells.Count <= GuideDialogFlow.ColNm) continue;

            var cd = Txt.Int(Uia.ValueOf(cells[GuideDialogFlow.ColCd])) ?? -1;
            var ink = GuideDialogFlow.InkColorOf(cells[GuideDialogFlow.ColNm]);
            Dump($"color|{i}|cd={cd}|ink={PixelProbe.Describe(ink)}");
            if (ink is null) continue;

            var c = ink.Value;
            var isMagenta = c.R > 200 && c.G < 90 && c.B > 200;
            var isBlue = c.B - c.R > 60 && c.B - c.G > 60;
            var isComment = (cd >= ReceiptCodeMin && cd <= ReceiptCodeMax)
                            || (cd >= KarteCodeMin && cd <= KarteCodeMax);

            if (isComment)
            {
                coloured++;
                Assert.That(isMagenta || isBlue, Is.True,
                    $"dòng {i} mã {cd} nằm trong dải コメント nên phải magenta (レセプト印字, " +
                    $"acc_unit & 0x0F == 1) hoặc xanh dương (カルテ印字) — frm203017.cs:1053-1059. " +
                    $"Đọc ra {PixelProbe.Describe(ink)}");
            }
            else
            {
                Assert.That(isMagenta || isBlue, Is.False,
                    $"dòng {i} mã {cd} KHÔNG thuộc dải コメント nên WinForm không đụng ForeColor " +
                    $"⇒ phải là chữ đen. Đọc ra {PixelProbe.Describe(ink)}");
            }
        }
        if (coloured == 0) Log("ガイド này không có dòng mã コメント → phần màu chỉ kiểm được nhánh 「đen」");
    }

    [Test, Order(12)]
    [Description("TC-D12 — nền dòng đổi màu theo NHÓM (acc_unit >> 4), KHÔNG theo chẵn/lẻ")]
    public void TcD12_RowBackgroundFollowsGroup()
    {
        var dialog = EnsureDialog();
        var rows = RequireRows(dialog);
        if (rows.Count < 3) Assert.Ignore($"chỉ {rows.Count} dòng — không phân biệt được nhóm với chẵn/lẻ");

        var bgs = new List<Color?>();
        for (var i = 0; i < rows.Count; i++)
        {
            var cells = _dlg.Cells(rows[i]);
            var bg = cells.Count > 0 ? GuideDialogFlow.BackColorOf(cells[GuideDialogFlow.ColCd]) : null;
            bgs.Add(bg);
            Dump($"bg|{i}|{PixelProbe.Describe(bg)}");
        }
        Assert.That(bgs.All(b => b is not null), Is.True,
            "không đọc được pixel ⇒ màn hình đang bị che / máy khoá — HARNESS, không phải app");

        // Mốc phân biệt: tô theo chẵn/lẻ thì KHÔNG BAO GIỜ có hai dòng liền nhau cùng nền.
        var adjacentSame = 0;
        for (var i = 1; i < bgs.Count; i++)
            if (PixelProbe.IsNear(bgs[i], bgs[i - 1]!.Value, 6)) adjacentSame++;
        Log($"số cặp dòng liền nhau CÙNG nền = {adjacentSame}/{rows.Count - 1}");
        Assert.That(adjacentSame, Is.GreaterThan(0),
            "getViewData chỉ lật nền khi (acc_unit >> 4) đổi (frm203017.cs:1038-1050) ⇒ các dòng " +
            "CÙNG nhóm phải CÙNG nền. Không có cặp liền nhau nào cùng màu nghĩa là đang tô theo " +
            "chẵn/lẻ — đó là cách bản web đang làm (VirtualListTable: isEven).");
    }

    [Test, Order(13)]
    [Description("TC-D13 — thanh F: chỉ F9 「確定」 và F10 「戻る」")]
    public void TcD13_OnlyF9AndF10()
    {
        var dialog = EnsureDialog();
        var btns = _dlg.FKeyButtons(dialog);
        Dump($"fkeys|{string.Join(",", btns)}");
        Log("nút F của dialog: " + string.Join(" · ", btns));

        Assert.Multiple(() =>
        {
            Assert.That(btns.Any(b => b.StartsWith("btnF9=") && b.Contains("確定")), Is.True,
                "_btnInfo[8] = OCHA_ON 「確定」 (frm203017.cs:88)");
            Assert.That(btns.Any(b => b.StartsWith("btnF10=") && b.Contains("戻る")), Is.True,
                "_btnInfo[9] = OCHA_ON 「戻る」 (frm203017.cs:89)");
            Assert.That(btns.Count, Is.EqualTo(2),
                $"10 nút còn lại là OCHA_OFF nên không mang nhãn (frm203017.cs:79-91). Đọc ra: " +
                string.Join(" · ", btns));
        });
    }

    [Test, Order(15)]
    [Description("TC-D15 — cùng tiền đề với bản web: chọn dòng CÓ 部位 rồi mới mở ガイド")]
    public void TcD15_ListForRowWithBui()
    {
        // Danh sách 処置 phụ thuộc 部位/病名 của DÒNG ĐANG CHỌN (frm203002.cs:6515 snapshot
        // getFocusBui/getFocusDis vào frm203017.ParamData). So danh sách với bản web mà
        // hai bên đứng ở hai dòng khác nhau là so hai câu hỏi khác nhau — đã vấp đúng thế
        // 2026-09-08: WinForm đang ở dòng 部位 「54321…」 còn web gửi Bui rỗng, và dòng
        // 「186 歯槽骨整形手術」 vắng mặt bên web CHỈ vì tiền đề khác.
        if (_guide.DialogOpen()) _guide.CloseDialogWithF10();

        var rows = Screen.Regi.Grid.Rows(30);
        AutomationElement? target = null;
        for (var i = 0; i < rows.Count; i++)
        {
            var bui = Txt.N(rows[i].At(Screens.RegiGrid.Col.Bui));
            var ryo = Txt.N(rows[i].At(Screens.RegiGrid.Col.Ryo));
            // Dòng tiêu đề đọc ra 「部位」/「療法・処置」, dòng tổng tháng đọc ra 「R 08年…」.
            if (bui.Length == 0 || bui.Contains("部位") || bui.StartsWith("R ") || ryo.Length == 0) continue;
            var cells = Uia.Children(rows[i].Element).ToList();
            if (cells.Count <= Screens.RegiGrid.Col.Ryo) continue;
            Dump($"ctx|pick|{i}|bui={Txt.Vis(rows[i].At(Screens.RegiGrid.Col.Bui))}|ryo={ryo}");
            // Click ô 療法・処置, KHÔNG click ô 部位 — ô 部位 mở 部位選択.
            target = cells[Screens.RegiGrid.Col.Ryo];
            break;
        }
        if (target is null) Assert.Ignore("lưới 処置 không có dòng nào mang 部位 — không dựng được tiền đề");

        GuideDialogFlow.ClickElement(target);
        Thread.Sleep(600);
        _guide.FocusScreen();
        GuideTabFlow.SendKey(GuideTabFlow.Vk.F4);
        Thread.Sleep(1500);

        var dialog = EnsureDialog();
        var trt = RequireRows(dialog);
        Dump($"rowbui|guid={Txt.N(_guide.DialogGuidNo(dialog))}|count={trt.Count}");
        for (var i = 0; i < trt.Count; i++)
            Dump($"rowbui|{i}|" + string.Join("|", _dlg.RawCells(trt[i]).Select(Txt.N)));
        Log($"ガイド {Txt.N(_guide.DialogGuidNo(dialog))} với dòng CÓ 部位: {trt.Count} dòng 処置");
    }

    [Test, Order(14)]
    [Description("TC-D14 — đóng bằng 戻る rồi mở lại: form MỚI, 回数 vừa sửa KHÔNG sống sót")]
    public void TcD14_ReopenResetsCnt()
    {
        // frm203017.Instance dựng form mới khi bản cũ đã Dispose (:113-124) — cùng câu hỏi
        // với Rule 23.4 bên Playwright.
        if (_guide.DialogOpen()) _guide.CloseDialogWithF10();
        var dialog = EnsureDialog();

        var rows = RequireRows(dialog);
        var original = Txt.N(CellRaw(rows[0], GuideDialogFlow.ColCnt));

        // Đổi 回数 sang một giá trị KHÁC mặc định. Một cú click là đủ (TC-D10 đã đo chuỗi
        // tuần hoàn) — và phải khác thật, nếu không testcase so 「mặc định với mặc định」
        // rồi xanh giả.
        GuideDialogFlow.ClickElement(_dlg.Cells(_dlg.RowElements(dialog)[0])[GuideDialogFlow.ColNm]);
        var changed = Txt.N(CellRaw(_dlg.RowElements(dialog)[0], GuideDialogFlow.ColCnt));
        Assert.That(changed, Is.Not.EqualTo(original),
            "cú click không đổi được 回数 ⇒ không đặt được tiền đề cho phép đo (HARNESS)");

        Assert.That(_guide.CloseDialogWithF10(), Is.True, "phải đóng được bằng nút 「Ｆ１０ 戻る」");
        var again = EnsureDialog();
        var reopened = Txt.N(CellRaw(RequireRows(again)[0], GuideDialogFlow.ColCnt));

        Dump($"reopen|default={original}|changed={changed}|reopened={reopened}");
        Assert.That(reopened, Is.EqualTo(original),
            "mở lại phải là form MỚI: 回数 quay về giá trị CalcCnt, không giữ số vừa sửa " +
            "(frm203017.cs:113-124 + getViewData dựng lại DataSource)");
    }
}
