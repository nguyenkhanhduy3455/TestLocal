using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Screens;

/// <summary>
/// Tab 「個別」 của frm203002 (tab thứ 4 của <c>SSTab1</c>, page <c>tabPageKobe</c>).
///
/// ─── Lưới hfgKobetu ──────────────────────────────────────────────────────────
/// modKobetu.myHFG_set() (modKobetu.cs:86-135) DỰNG LẠI lưới lúc chạy: <c>Columns.Clear()</c>
/// + <c>ColumnCount = 30</c>, rồi chỉ bật 6 cột 2/3/4/5/12/13. Vì thế:
///   · Header 「老人」 trong Designer (frm203002.Designer.cs, cột <c>KobeRou</c>) là markup
///     CHẾT — bị Columns.Clear() xoá trước khi form hiện. Header thật của cột giữa là
///     「50/100」.
///   · Chỉ 6 cột đó ra tới UIA, theo thứ tự <see cref="Col"/>.
/// Nguồn dữ liệu ba cột điểm (modKobetu.cs:203-207):
///     一般 = score1 · 50/100 = score2 · 訪問 = score3.
///
/// ─── Khối 検索 ───────────────────────────────────────────────────────────────
/// <c>btnKobeSearch_Click</c> (frm203002.cs:2177) làm HAI bước:
///   1. <c>InputCheckKobe</c> (:2194) — ｺｰﾄﾞ và 点数 mỗi ô phải <c>int.TryParse</c>; sai thì
///      E00002 + <c>.Focus()</c> về ô đó và HUỶ search. Kiểm ｺｰﾄﾞ TRƯỚC, 点数 SAU.
///   2. <c>GetWhereKobeNyuryokuInfo</c> (:2046) — dựng WHERE: ｺｰﾄﾞ → <c>TRT_CD = x</c>,
///      名称 → <c>TRT_NM LIKE '%x%' OR CCT_NM LIKE '%x%'</c>,
///      点数 → <c>SCORE1 = x OR SCORE2 = x OR SCORE3 = x</c>.
/// Enter trong 3 ô KHÔNG search, chỉ đẩy focus ｺｰﾄﾞ→名称→点数→nút 検索 (:2564/2576/2588).
///
/// ⚠️ Ô ｺｰﾄﾞ CHỈ ăn số nguyên. 「174-0」 ra E00002 và huỷ search: comment ở :2054 nói
///    tách 「101-2」 thành TRT_CD+TRT_SB, nhưng InputCheckKobe chạy TRƯỚC nên nhánh đó
///    không bao giờ tới ⇒ muốn lọc 枝番 thì tìm theo mã rồi đọc ô 枝番 trên từng dòng.
/// </summary>
public sealed class KobetuTab
{
    private readonly Window _window;

    public KobetuTab(Window window) => _window = window;

    /// <summary>Chỉ số cột trong lưới 個別, theo thứ tự 6 cột đang Visible.</summary>
    public static class Col
    {
        public const int Name = 0;    // 処置名称 (cct_nm hay trt_nm tuỳ inp_config.tre_inp_flg)
        public const int Ippan = 1;   // 一般   = score1
        public const int Gojuu = 2;   // 50/100 = score2
        public const int Houmon = 3;  // 訪問   = score3
        public const int Code = 4;    // ｺｰﾄﾞ  (nửa chiều rộng trong WinForm)
        public const int Sub = 5;     // 枝番
    }

    /// <summary>Header của 6 cột đó — modKobetu.cs:96-108 + Columns[..].Visible.</summary>
    public static readonly string[] ExpectedHeaders = ["処置名称", "一般", "50/100", "訪問", "ｺｰﾄﾞ", "枝番"];

    public AutomationElement CodeBox => Uia.RequireById(_window, Loc("kobetuSearchCode"));
    public AutomationElement NameBox => Uia.RequireById(_window, Loc("kobetuSearchName"));
    public AutomationElement TensBox => Uia.RequireById(_window, Loc("kobetuSearchTens"));
    public AutomationElement SelNoBox => Uia.RequireById(_window, Loc("kobetuSelNo"));

    public AutomationElement SearchButton =>
        Uia.RequireByIdOrName(_window, Loc("kobetuSearchButton"), "検索", ControlType.Button);

    public WinFormsGrid Grid => new(Uia.RequireById(_window, Loc("kobetuGrid")));

    /// <summary>Chọn tab 個別 và chờ lưới sẵn sàng.</summary>
    public KobetuTab Open()
    {
        var tab = Waits.For(
            () => _window.FindFirstDescendant(cf =>
                      cf.ByControlType(ControlType.TabItem).And(cf.ByName(Loc("kobetuTabItem")))),
            "tab 「個別」");

        var selection = tab.Patterns.SelectionItem.PatternOrDefault;
        if (selection is not null && !selection.IsSelected.ValueOrDefault) selection.Select();
        else if (selection is null) Uia.MouseClick(tab);

        // Lưới được nạp NGAY LÚC MỞ MÀN (frm203002.cs:465-466 gọi pSetKobetu với WHERE rỗng),
        // không phải khi chọn tab — nên tới đây là đã có sẵn cả master.
        Waits.Until(() => Uia.ById(_window, Loc("kobetuGrid")) is not null, "lưới 個別 xuất hiện",
                   TestSettings.Current.Run.GridLoadTimeout);
        Waits.Step();
        return this;
    }

    /// <summary>Xoá cả 3 ô tìm kiếm (KHÔNG bấm 検索).</summary>
    public void ResetSearchBoxes()
    {
        Uia.Clear(CodeBox);
        Uia.Clear(NameBox);
        Uia.Clear(TensBox);
    }

    /// <summary>Bấm nút 検索.</summary>
    public void ClickSearch()
    {
        Uia.Click(SearchButton);
        Waits.Step();
    }

    /// <summary>
    /// 検索 theo 処置コード rồi trả về các dòng kết quả.
    ///
    /// LUÔN lọc trước khi đọc: chưa lọc thì lưới có cả master (~1.7k dòng) và cầu MSAA
    /// dựng phần tử cho từng dòng một.
    /// </summary>
    public IReadOnlyList<DgvRow> SearchByCode(int trtCd, int expectAtLeast = 1)
    {
        Uia.SetText(CodeBox, trtCd.ToString());
        ClickSearch();

        var rows = Waits.Poll(
            () => DataRows(limit: 200),
            r => r.Count >= expectAtLeast,
            $"tìm ｺｰﾄﾞ {trtCd} ra ít nhất {expectAtLeast} dòng");

        return rows;
    }

    /// <summary>
    /// Các dòng CÓ DỮ LIỆU của lưới 個別.
    ///
    /// <c>GetTrt</c> đổ dữ liệu từ dòng 1 rồi giấu dòng 0 đi
    /// (<c>hfgKobetu.Rows[0].Visible = false</c>, modKobetu.cs:230) — dòng 0 là di sản của
    /// VB6, nơi dòng đầu là dòng tiêu đề. Nó không nên ra tới UIA, nhưng nếu bản Windows
    /// nào đó vẫn phơi ra thì đây là chỗ chặn: dòng rỗng trơn không phải dữ liệu.
    /// </summary>
    public IReadOnlyList<DgvRow> DataRows(int limit = 200) =>
        Grid.Rows(limit).Where(r => !r.IsEmpty).ToList();

    /// <summary>Dòng đúng (処置コード, 枝番); không có thì ném kèm danh sách đã thấy.</summary>
    public DgvRow RequireRow(int trtCd, int trtSb)
    {
        var rows = SearchByCode(trtCd);
        var row = rows.FirstOrDefault(r =>
            Txt.Int(r.At(Col.Code)) == trtCd && Txt.Int(r.At(Col.Sub)) == trtSb);

        if (row is not null) return row;

        var seen = string.Join(", ", rows.Select(r => $"{r.At(Col.Code)}-{r.At(Col.Sub)}"));
        throw new InvalidOperationException(
            $"tìm ｺｰﾄﾞ {trtCd} ra {rows.Count} dòng nhưng không có 枝番 {trtSb} (thấy: {seen})");
    }

    /// <summary>Tập ｺｰﾄﾞ đang hiển thị — dùng để chứng minh "search KHÔNG chạy".</summary>
    public IReadOnlyList<string> VisibleCodes(int limit = 200) =>
        DataRows(limit).Select(r => r.At(Col.Code)).Where(c => c.Length > 0).Distinct().ToList();

    /// <summary>Số dòng có dữ liệu đang hiển thị.</summary>
    public int DataRowCount(int limit = 200) => DataRows(limit).Count;

    /// <summary>
    /// Chọn một dòng ⇒ app đẩy 処置 xuống lưới đăng ký.
    ///
    /// Một cú click chuột là đủ: <c>hfgKobetu_Click</c> (frm203002.cs:6928) chuyển focus
    /// sang <c>txtKobetuSel</c> rồi tự gọi <c>grdKobe_KeyDown(Enter)</c> →
    /// <c>hfgKobetu_CellDoubleClick</c> → <c>pKobetu_Let_Trt_Data</c>. Không cần double-click.
    /// </summary>
    public void SelectRow(DgvRow row)
    {
        Uia.MouseClick(row.Element);
        Waits.Step();
    }

    private static string Loc(string key) => TestSettings.Current.Locator(key);
}
