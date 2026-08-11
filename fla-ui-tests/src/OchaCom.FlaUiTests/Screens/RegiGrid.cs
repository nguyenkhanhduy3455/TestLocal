using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Screens;

/// <summary>
/// Lưới đăng ký của 診療入力 — control <c>grdRegi</c>, trong code cũ là biến static
/// <c>hFG1</c> (frm203002.cs:48, :343).
///
/// Lưới bind DataTable nên có hàng chục cột, nhưng chỉ 5 cột đầu hiện ra (và ra tới
/// UIA): <see cref="Col"/>. Những cột quyết định nghiệp vụ như <c>[6] 処置コード</c>,
/// <c>[51] 行区分</c>, <c>[78] 処置日</c> là cột ẩn — không đọc được từ giao diện.
/// </summary>
public sealed class RegiGrid
{
    private readonly WinFormsGrid _grid;
    private readonly AutomationBase _automation;

    public RegiGrid(AutomationElement gridElement, AutomationBase automation)
    {
        _grid = new WinFormsGrid(gridElement);
        _automation = automation;
    }

    /// <summary>Chỉ số 5 cột hiển thị (frm203002.Designer.cs, RegiDay…RegiKai).</summary>
    public static class Col
    {
        public const int Day = 0;   // 日
        public const int Bui = 1;   // 部位
        public const int Ryo = 2;   // 療法・処置
        public const int Ten = 3;   // 点
        public const int Kai = 4;   // 回
    }

    public WinFormsGrid Grid => _grid;

    /// <summary>Đọc DUY NHẤT một cột của mọi dòng — rẻ hơn nhiều so với đọc cả lưới.</summary>
    public IReadOnlyList<string> Column(int columnIndex, int limit = 500)
    {
        var values = new List<string>();
        foreach (var rowElement in _grid.RowElements(limit))
        {
            var cells = Uia.Children(rowElement).ToList();
            values.Add(columnIndex < cells.Count ? Txt.N(Uia.ValueOf(cells[columnIndex])) : "");
        }
        return values;
    }

    /// <summary>Số dòng có 療法・処置 chứa MỘT TRONG các chuỗi cho trước.</summary>
    public int CountRyoContaining(params string[] anyOf) =>
        Column(Col.Ryo).Count(text => anyOf.Any(w => Txt.Has(text, w)));

    /// <summary>
    /// Dòng đang có con trỏ. Ngay sau khi 個別 chèn một 処置, app đặt
    /// <c>grdRegi.CurrentCell = grdRegi[4, y]</c> rồi <c>BeginEdit</c>
    /// (frm203002.cs:6919-6925) ⇒ đây chính là dòng vừa thêm, khỏi quét cả lưới.
    /// </summary>
    public DgvRow? CurrentRow() => _grid.FocusedRow(_automation);

    /// <summary>Dòng CUỐI CÙNG có 療法・処置 khớp — đường dự phòng khi không lấy được focus.</summary>
    public DgvRow? LastRowMatching(params string[] anyOf)
    {
        DgvRow? found = null;
        foreach (var rowElement in _grid.RowElements())
        {
            var cells = Uia.Children(rowElement).ToList();
            if (Col.Ryo >= cells.Count) continue;
            var text = Txt.N(Uia.ValueOf(cells[Col.Ryo]));
            if (anyOf.Any(w => Txt.Has(text, w))) found = new DgvRow(rowElement);
        }
        return found;
    }
}
