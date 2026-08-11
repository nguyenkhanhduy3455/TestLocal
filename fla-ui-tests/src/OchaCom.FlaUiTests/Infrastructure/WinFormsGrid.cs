using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Đọc một <c>DataGridView</c> của WinForms qua UIAutomation.
///
/// ─── Cây UIA của DataGridView (.NET Framework, qua cầu MSAA) ─────────────────
///   Table (chính là control)
///     ├─ Row  ← DÒNG TIÊU ĐỀ CỘT, chỉ có khi ColumnHeadersVisible = true
///     │    └─ HeaderItem × n   (Name = HeaderText)
///     ├─ Row  ← dòng dữ liệu thứ nhất
///     │    └─ Cell × n         (Name = "&lt;tiêu đề cột&gt; hàng &lt;i&gt;", Value = giá trị ô)
///     └─ …
///
/// Hai điều đáng nhớ:
///   1. GIÁ TRỊ ô nằm ở <c>LegacyIAccessible.Value</c>, KHÔNG phải Name — Name của ô là
///      chuỗi mô tả dành cho trình đọc màn hình, có kèm tiêu đề cột và số hàng.
///   2. Chỉ cột/dòng đang <c>Visible</c> mới có mặt trong cây. Với hfgKobetu nghĩa là
///      đúng 6 cột 処置名称/一般/50・100/訪問/ｺｰﾄﾞ/枝番 (modKobetu.cs:126-131) — 24 cột
///      còn lại (kể cả acc_unit và f1) KHÔNG đọc được từ UI. Muốn biết chúng thì phải
///      hỏi DB, đó là lý do bộ test có lớp <see cref="Data.OchaDb"/>.
///
/// ⚠️ Lưới 個別 lúc chưa lọc có ~1.7k dòng và cầu MSAA dựng phần tử cho MỌI dòng
///    (không ảo hoá như web). Luôn 検索 theo コード để rút danh sách xuống vài dòng
///    RỒI mới đọc — quét cả lưới vừa lâu vừa dễ hết giờ.
/// </summary>
public sealed class WinFormsGrid
{
    private readonly AutomationElement _grid;

    public WinFormsGrid(AutomationElement grid) => _grid = grid;

    public AutomationElement Element => _grid;

    /// <summary>Các phần tử con là "dòng" (đã loại thanh cuộn và dòng tiêu đề).</summary>
    public IReadOnlyList<AutomationElement> RowElements(int limit = int.MaxValue)
    {
        var rows = new List<AutomationElement>();
        foreach (var child in Uia.Children(_grid))
        {
            var type = Uia.ControlTypeOf(child);
            if (type is ControlType.ScrollBar or ControlType.Header) continue;
            if (IsHeaderRow(child)) continue;
            rows.Add(child);
            if (rows.Count >= limit) break;
        }
        return rows;
    }

    public int RowCount() => RowElements().Count;

    /// <summary>Đọc cả dòng thành mảng chuỗi theo đúng thứ tự cột đang hiển thị.</summary>
    public DgvRow Row(AutomationElement rowElement) => new(rowElement);

    public IReadOnlyList<DgvRow> Rows(int limit = int.MaxValue) =>
        RowElements(limit).Select(r => new DgvRow(r)).ToList();

    /// <summary>Tiêu đề các cột đang hiển thị; không đọc được thì trả mảng rỗng.</summary>
    public IReadOnlyList<string> Headers()
    {
        foreach (var child in Uia.Children(_grid))
        {
            if (!IsHeaderRow(child)) continue;
            return Uia.Children(child).Select(c => Txt.N(Uia.NameOf(c))).ToList();
        }
        return [];
    }

    /// <summary>
    /// Dòng đang có con trỏ. Sau khi 個別 chèn một 処置, app đặt CurrentCell sang cột 回
    /// của dòng vừa thêm rồi BeginEdit (frm203002.cs:6919-6925) — nên phần tử đang focus
    /// nằm ĐÚNG trong dòng đó, khỏi phải quét cả lưới đi tìm.
    /// </summary>
    public DgvRow? FocusedRow(AutomationBase automation)
    {
        AutomationElement? el;
        try { el = automation.FocusedElement(); }
        catch { return null; }

        // Đi ngược lên tới khi cha là chính lưới ⇒ đang đứng ở phần tử "dòng".
        for (var i = 0; i < 6 && el is not null; i++)
        {
            AutomationElement? parent;
            try { parent = el.Parent; }
            catch { return null; }

            if (parent is null) return null;
            if (parent.Equals(_grid))
            {
                // Cẩn thận: ô đang sửa của DataGridView là một TextBox con của CHÍNH LƯỚI,
                // không phải con của dòng — nó cũng thoả "cha là lưới". Dòng thật thì có
                // nhiều ô con, ô đang sửa thì không có con nào.
                return Uia.Children(el).Take(2).Count() >= 2 ? new DgvRow(el) : null;
            }
            el = parent;
        }
        return null;
    }

    /// <summary>Dòng tiêu đề = dòng mà các ô con là HeaderItem (hoặc không có giá trị nào).</summary>
    private static bool IsHeaderRow(AutomationElement row)
    {
        var cells = Uia.Children(row).Take(3).ToList();
        if (cells.Count == 0) return false;
        return cells.All(c => Uia.ControlTypeOf(c) == ControlType.HeaderItem);
    }
}

/// <summary>Một dòng lưới đã đọc xong; các ô theo thứ tự cột hiển thị trái→phải.</summary>
public sealed class DgvRow
{
    private readonly Lazy<IReadOnlyList<string>> _cells;
    private readonly Lazy<IReadOnlyList<string>> _cellHeaders;

    public DgvRow(AutomationElement element)
    {
        Element = element;
        var cellElements = new Lazy<IReadOnlyList<AutomationElement>>(() => Uia.Children(element).ToList());
        _cells = new Lazy<IReadOnlyList<string>>(
            () => cellElements.Value.Select(c => Txt.N(Uia.ValueOf(c))).ToList());
        _cellHeaders = new Lazy<IReadOnlyList<string>>(
            () => cellElements.Value.Select(c => Txt.N(Uia.LegacyNameOf(c))).ToList());
    }

    public AutomationElement Element { get; }

    /// <summary>Giá trị các ô, đã NFKC + trim.</summary>
    public IReadOnlyList<string> Cells => _cells.Value;

    /// <summary>
    /// Chuỗi mô tả của từng ô (Name của DataGridViewCellAccessibleObject). Có chứa TÊN
    /// CỘT nên dùng để dò cột theo tiêu đề khi cần chắc ăn hơn là đếm chỉ số.
    /// </summary>
    public IReadOnlyList<string> CellDescriptions => _cellHeaders.Value;

    public string At(int index) => index >= 0 && index < Cells.Count ? Cells[index] : "";

    public int? IntAt(int index) => Txt.Int(At(index));

    /// <summary>Ô đầu tiên mà mô tả có chứa tiêu đề cột cần tìm; không thấy → null.</summary>
    public string? ByHeader(string header)
    {
        for (var i = 0; i < CellDescriptions.Count; i++)
            if (Txt.Has(CellDescriptions[i], header))
                return At(i);
        return null;
    }

    public bool IsEmpty => Cells.All(string.IsNullOrEmpty);

    public override string ToString() => string.Join(" | ", Cells);
}
