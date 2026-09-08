using System.Drawing;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// Đọc <b>ĐỊNH DẠNG</b> của dialog 「ガイド処置選択」 <c>frm203017</c> — cái mở ra khi click
/// một dòng ở tab ガイド.
///
/// <para><see cref="GuideTabFlow"/> đã lái được tab và mở/đóng dialog; lớp này chỉ thêm
/// phần <b>ĐO</b>: chuỗi NGUYÊN VĂN, bề rộng cột theo pixel, màu nền/màu chữ, ô đang giữ
/// con trỏ. Nửa WinForm của
/// <c>../web-tenant-tests/tests/side-panel/guide-selection-dialog-format.spec.ts</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI ĐỌC NGUYÊN VĂN, KHÔNG QUA <see cref="Txt.N"/>
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>Txt.N</c> chạy NFKC + trim. Trên chính dialog này nó xoá đúng ba bằng chứng cần đo:
/// <list type="number">
///   <item>Header cột 1 khai trong <c>_viewItem</c> là 「<b> ｺｰﾄﾞ</b>」 — NỬA chiều rộng và
///     có MỘT DẤU CÁCH đứng trước (frm203017.cs:97). NFKC biến nó thành 「コード」, tức
///     đúng chuỗi bản web đang hiển thị ⇒ so sau NFKC thì hai bên LUÔN bằng nhau và
///     testcase xanh giả.</item>
///   <item><c>dgvView_CellFormatting</c> (frm203017.cs:221-232) chèn dấu cách vào MỌI ô:
///     cột canh trái thành 「 {0}」, cột canh phải thành 「{0} 」. Trim là mất.</item>
///   <item>Ô 点数/回数 canh phải nên chuỗi thật là 「11 」 chứ không phải 「11」.</item>
/// </list>
/// Vì thế mọi hàm ở đây trả <b>chuỗi thô</b>; in ra log thì bọc <see cref="Txt.Vis"/> để
/// thấy được dấu cách và ký tự nửa chiều rộng.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="bullet">
///   <item><c>_viewItem</c> (frm203017.cs:96-104) — 9 cột, 5 cột đầu có bề rộng
///     65/40/370/70/70, 4 cột sau bề rộng 0 (jihi_flg/men/unit/acc_unit) nên KHÔNG ra
///     tới cây UIA.</item>
///   <item><c>initProc</c> (:411-455) — <c>Title = 「ガイド処置選択」</c>,
///     <c>txtGuidNo = guidCd</c>, <c>txtGuidNm = guidNm</c>,
///     <c>Columns[4].SortMode = NotSortable</c> (回数 KHÔNG sắp xếp được).</item>
///   <item><c>getViewData</c> (:1035-1067) — nền đổi màu theo NHÓM (<c>acc_unit >> 4</c>)
///     chứ không theo dòng chẵn/lẻ; chữ cột 処置名称 của mã コメント đổi màu:
///     <c>acc_unit &amp; 0x0F == 1</c> ⇒ magenta <c>0xff00ff</c> (レセプト印字), còn lại ⇒
///     <c>Color.Blue</c> (カルテ印字). Nạp xong: <c>dgvView.Focus()</c> rồi
///     <c>Rows[0].Cells["cnt"].Selected = true</c>.</item>
///   <item><c>dgvView_CellClick</c> (:363-388) — CLICK ĐƠN lên một dòng làm 回数 tăng 1,
///     vượt <c>maxCnt</c> (CalcCnt) thì về 0.</item>
/// </list>
/// </summary>
public sealed class GuideDialogFlow
{
    private readonly GuideTabFlow _guide;
    private readonly OchaApp _app;

    public GuideDialogFlow(GuideTabFlow guide, OchaApp app)
    {
        _guide = guide;
        _app = app;
    }

    // ── Hằng số lấy thẳng từ _viewItem (frm203017.cs:96-104) ────────────────

    public const int ColCd = 0;
    public const int ColSb = 1;
    public const int ColNm = 2;
    public const int ColScore = 3;
    public const int ColCnt = 4;

    /// <summary>Tiêu đề 5 cột hiển thị — NGUYÊN VĂN, kể cả dấu cách đứng trước 「 ｺｰﾄﾞ」.</summary>
    public static readonly string[] RawHeaders = [" ｺｰﾄﾞ", "枝番", "処置名称", "点数", "回数"];

    /// <summary>Bề rộng khai báo (đơn vị của Designer) — dùng để so TỈ LỆ với bản web.</summary>
    public static readonly int[] DeclaredWidths = [65, 40, 370, 70, 70];

    /// <summary>Cột duy nhất KHÔNG sắp xếp được (<c>SortMode = NotSortable</c>, :418).</summary>
    public const int NotSortableCol = ColCnt;

    // ── Mở / đóng ───────────────────────────────────────────────────────────

    /// <summary>
    /// Click lần lượt từng dòng ガイド cho tới khi có dòng MỞ ĐƯỢC dialog.
    ///
    /// <para>ガイド không có 処置 nào tính được thì <c>getViewData</c> tự <c>Close()</c> kèm
    /// E00024 (frm203017.cs:1001-1024) — đó là hành vi HỢP LỆ, không phải lỗi. Vì vậy
    /// muốn "có một dialog đang mở để đo" thì phải dò, đừng đóng đinh dòng 0.</para>
    /// </summary>
    /// <returns>index dòng đã mở được, hoặc -1.</returns>
    public int OpenFirstPickableRow(int scanLimit, Action<string> log)
    {
        var total = Math.Min(_guide.Rows(scanLimit).Count, scanLimit);
        for (var i = 0; i < total; i++)
        {
            if (!_guide.ClickRow(i)) { log($"   dòng {i}: KHÔNG click được"); continue; }

            var dialog = _guide.WaitDialog(TimeSpan.FromSeconds(10));
            if (dialog is not null)
            {
                log($"   dòng {i}: dialog MỞ (ガイド番号 {Txt.N(_guide.DialogGuidNo(dialog))})");
                return i;
            }

            var boxes = MsgBoxWin32.TextOfAll(_app.ProcessId);
            log($"   dòng {i}: dialog tự đóng — hộp thoại: {(boxes.Length == 0 ? "(không)" : boxes)}");
            DismissMsgBoxes();
        }
        return -1;
    }

    /// <summary>Dẹp mọi MessageBox đang mở; 「リセット」 thì luôn trả lời Cancel (nhánh OK GHI DB).</summary>
    public void DismissMsgBoxes()
    {
        for (var i = 0; i < 4; i++)
        {
            var open = MsgBoxWin32.All(_app.ProcessId);
            if (open.Count == 0) return;
            foreach (var d in open)
                MsgBoxWin32.ClickButton(d.Hwnd, "キャンセル", "Cancel", "いいえ", "No", "OK");
            Thread.Sleep(400);
        }
    }

    // ── Cấu trúc lưới dgvView ───────────────────────────────────────────────

    public AutomationElement? GridElement(Window dialog) =>
        Uia.ById(dialog, TestSettings.Current.Locator("guideDialogGrid"));

    /// <summary>Dòng tiêu đề của <c>dgvView</c> — phần tử con mà mọi ô đều là HeaderItem.</summary>
    public IReadOnlyList<AutomationElement> HeaderCells(Window dialog)
    {
        var grid = GridElement(dialog);
        if (grid is null) return [];
        foreach (var child in Uia.Children(grid))
        {
            var cells = Uia.Children(child).ToList();
            if (cells.Count > 0 && cells.All(c => Uia.ControlTypeOf(c) == ControlType.HeaderItem))
                return cells;
        }
        return [];
    }

    /// <summary>Tiêu đề cột NGUYÊN VĂN (chưa NFKC, chưa trim).</summary>
    public IReadOnlyList<string> RawHeaderTexts(Window dialog) =>
        HeaderCells(dialog).Select(Uia.NameOf).ToList();

    /// <summary>Bề rộng THẬT trên màn hình của từng cột, theo pixel.</summary>
    public IReadOnlyList<int> ColumnWidths(Window dialog) =>
        HeaderCells(dialog).Select(c => (int)(Uia.RectOf(c)?.Width ?? 0)).ToList();

    /// <summary>Các dòng DỮ LIỆU (đã loại dòng tiêu đề và thanh cuộn).</summary>
    public IReadOnlyList<AutomationElement> RowElements(Window dialog)
    {
        var grid = GridElement(dialog);
        if (grid is null) return [];
        var rows = new List<AutomationElement>();
        foreach (var child in Uia.Children(grid))
        {
            var type = Uia.ControlTypeOf(child);
            if (type is ControlType.ScrollBar or ControlType.Header) continue;
            var cells = Uia.Children(child).Take(3).ToList();
            if (cells.Count == 0) continue;
            if (cells.All(c => Uia.ControlTypeOf(c) == ControlType.HeaderItem)) continue;
            rows.Add(child);
        }
        return rows;
    }

    /// <summary>Ô của một dòng, theo thứ tự cột trái→phải.</summary>
    public IReadOnlyList<AutomationElement> Cells(AutomationElement row) => Uia.Children(row).ToList();

    /// <summary>Giá trị NGUYÊN VĂN của cả dòng — giữ nguyên dấu cách của CellFormatting.</summary>
    public IReadOnlyList<string> RawCells(AutomationElement row) =>
        Cells(row).Select(Uia.ValueOf).ToList();

    /// <summary>Một dòng in ra dạng đối chiếu được với bản web: <c>cd|sb|nm|score|cnt</c>.</summary>
    public string DumpRow(AutomationElement row)
    {
        var raw = RawCells(row);
        return string.Join("|", raw.Select(Txt.N));
    }

    // ── Con trỏ ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Mô tả ô đang giữ con trỏ. Với ô của <c>DataGridView</c>, <c>LegacyIAccessible.Name</c>
    /// là chuỗi 「&lt;tiêu đề cột&gt; Row &lt;i&gt;」 ⇒ đọc ra được cả CỘT lẫn DÒNG.
    ///
    /// <para>Đọc ra 「Yes」/「No」/「OK」 nghĩa là có MessageBox chắn, không phải lưới sai (F19).</para>
    /// </summary>
    public string FocusedCell()
    {
        try
        {
            var el = _app.Automation.FocusedElement();
            var legacy = Uia.LegacyNameOf(el);
            var id = Uia.AutomationIdOf(el);
            var type = Uia.ControlTypeOf(el);
            return $"type={type} id=「{id}」 name=「{legacy}」";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    // ── Nút F của dialog ────────────────────────────────────────────────────

    /// <summary>
    /// Nhãn các nút F đang HIỆN trên dialog — <c>_btnInfo</c> chỉ bật F9 「確定」 và
    /// F10 「戻る」 (frm203017.cs:78-92), 10 nút còn lại <c>OCHA_OFF</c>.
    /// </summary>
    public IReadOnlyList<string> FKeyButtons(Window dialog)
    {
        var found = new List<string>();
        foreach (var el in Uia.Descendants(dialog, maxDepth: 4))
        {
            if (Uia.ControlTypeOf(el) != ControlType.Button) continue;
            var id = Uia.AutomationIdOf(el);
            if (!id.StartsWith("btnF", StringComparison.Ordinal)) continue;
            var name = Uia.NameOf(el);
            if (string.IsNullOrWhiteSpace(name)) continue;
            found.Add($"{id}=「{name}」");
        }
        return found;
    }

    // ── Màu ─────────────────────────────────────────────────────────────────

    /// <summary>Màu NỀN của một ô (màu chiếm đa số trong rect).</summary>
    public static Color? BackColorOf(AutomationElement cell) => PixelProbe.DominantColor(cell);

    /// <summary>
    /// Màu CHỮ của một ô — màu xuất hiện nhiều thứ nhì và cách nền đủ xa.
    ///
    /// <para>Nền luôn chiếm đa số nên <see cref="PixelProbe.DominantColor"/> chỉ trả về nền;
    /// muốn phân biệt 「chữ xanh dương (カルテ印字)」 với 「chữ magenta (レセプト印字)」
    /// (frm203017.cs:1053-1059) thì phải lấy màu của NÉT CHỮ.</para>
    /// </summary>
    public static Color? InkColorOf(AutomationElement cell)
    {
        var rect = Uia.RectOf(cell);
        return rect is null ? null : PixelProbe.InkColor(rect.Value);
    }

    // ── Thao tác ────────────────────────────────────────────────────────────

    /// <summary>Click CHUỘT THẬT vào giữa một phần tử (nút tự vẽ không nhận InvokePattern — F13).</summary>
    public static bool ClickElement(AutomationElement? el)
    {
        if (el is null) return false;
        var rect = Uia.RectOf(el);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0) return false;
        var (x, y) = Uia.Center(el);
        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(500);
        return true;
    }

    /// <summary>Click tiêu đề cột <paramref name="col"/> — cú bấm dùng để đo sắp xếp.</summary>
    public bool ClickHeader(Window dialog, int col)
    {
        var headers = HeaderCells(dialog);
        return col < headers.Count && ClickElement(headers[col]);
    }

    /// <summary>Giá trị cột <paramref name="col"/> của mọi dòng đang đọc được — mốc so trước/sau sort.</summary>
    public IReadOnlyList<string> ColumnValues(Window dialog, int col) =>
        RowElements(dialog)
            .Select(r => { var c = Cells(r); return col < c.Count ? Txt.N(Uia.ValueOf(c[col])) : ""; })
            .ToList();
}
