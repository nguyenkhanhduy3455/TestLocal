using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.PackDialog;

/// <summary>
/// Tab <b>パック</b> của side panel 診療入力 — mở tab, tìm dòng pack, chốt nó.
///
/// <para>Tab thứ 3 của <c>SSTab1</c> (<c>tabPagePack</c>, TabIndex 3 —
/// frm203002.Designer.cs:1638). Lưới <c>grdPack</c>, ô số chọn <c>txtPackSentakuNo</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BA ĐƯỜNG CHỐT — cùng đổ về MỘT handler
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   double-click dòng          → grdPack_CellDoubleClick          (frm203002.cs:6771)
///   Enter trên lưới / ô số     → grdPack_KeyDown → CellDoubleClick (:6844)
///   click dòng (khi ô số hiện) → grdPack_Click   → KeyDown(Enter)  (:6825)
/// </code>
///
/// <para><b>Chốt xong app tự dọn:</b> <c>txtPackSentakuNo.Text = ""</c> rồi
/// <c>grdRegi.Focus()</c> (:6819-6821) — nên sau một lượt, tiêu điểm KHÔNG còn ở tab パック.
/// Lượt sau phải mở lại tab.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ SỐ THỨ TỰ DÒNG KHÔNG ỔN ĐỊNH
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>getInpPackNyuryokuData</c> sắp lưới theo <c>USE_CNT DESC, PAC_CD</c> khi
/// <c>Ocha.xml</c> bật <c>IntelliPac</c>, ngược lại <c>PAC_SB, PAC_CD</c>
/// (INP/DBAccess/InpDBAccess.cs:570-584). <c>USE_CNT</c> tăng mỗi lần dùng ⇒ <b>cùng một
/// pack đổi số thứ tự giữa hai lượt chạy</b>. Vì thế <see cref="FindPackRow"/> tìm theo
/// TÊN và cột mã, không bao giờ theo số dòng.
/// </summary>
public sealed class PackTabFlow
{
    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly TestSettings _settings;

    public PackTabFlow(OchaApp app, TreatmentEntryScreen screen, TestSettings settings)
    {
        _app = app;
        _screen = screen;
        _settings = settings;
    }

    private Window Window => _screen.Window;

    private string Loc(string key, string fallback) =>
        _settings.Locators.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : fallback;

    private string TabName => Loc("packTabItem", "パック");
    private string GridId => Loc("packGrid", "grdPack");
    private string SelNoId => Loc("packSelNo", "txtPackSentakuNo");

    /// <summary>Phần tử lưới <c>grdPack</c>; null khi tab chưa mở.</summary>
    public AutomationElement? GridElement => Uia.ById(Window, GridId);

    /// <summary>Ô 選択№ của tab パック.</summary>
    public AutomationElement? SelNoElement => Uia.ById(Window, SelNoId);

    /// <summary>Tab đã mở chưa — mốc là lưới có mặt trong cây UIA.</summary>
    public bool TabOpen() => GridElement is not null;

    /// <summary>
    /// Mở tab パック bằng <c>SelectionItem</c> của TabItem, lui về click chuột thật nếu
    /// pattern không có.
    ///
    /// <para>⚠️ App GIỮ NGUYÊN tab đang chọn giữa hai lượt, nên đừng coi 「tab đang mở」 là
    /// bằng chứng 「đường mở này ăn」 — cùng cái bẫy mà GuideTabFlow đã trả giá 2026-08-27.</para>
    /// </summary>
    public bool OpenTab()
    {
        var tab = Waits.TryFor(
            () => Window.FindFirstDescendant(cf =>
                      cf.ByControlType(ControlType.TabItem).And(cf.ByName(TabName))),
            TimeSpan.FromSeconds(4));
        if (tab is null) return false;

        var selection = tab.Patterns.SelectionItem.PatternOrDefault;
        if (selection is not null) selection.Select();
        else
        {
            var rect = Uia.RectOf(tab);
            if (rect is null || rect.Value.Width <= 0) return false;
            var (x, y) = Uia.Center(tab);
            Uia.LeftClickPhysical(x, y);
        }

        return Waits.TryUntil(TabOpen, TimeSpan.FromSeconds(8));
    }

    /// <summary>Một dòng của lưới <c>grdPack</c>: số thứ tự · mã pack · tên pack.</summary>
    public sealed record PackGridRow(int Index, AutomationElement Element, string Num, string Cod, string Nam)
    {
        public int? CodNum => Txt.Int(Cod);
        public override string ToString() => $"[{Index}] №{Num} 「{Nam}」" + (Cod.Length > 0 ? $" cod={Cod}" : "");
    }

    /// <summary>
    /// Nội dung lưới pack.
    ///
    /// <para>⚠️ F10: chỉ đọc được dòng ĐANG NHÌN THẤY. Bảng có 82 pack nhưng lưới cao vài
    /// chục dòng — pack cần tìm có thể đang nằm ngoài tầm nhìn, và khi đó
    /// <see cref="FindPackRow"/> trả null mà KHÔNG có nghĩa 「pack không tồn tại」.</para>
    /// </summary>
    public IReadOnlyList<PackGridRow> Rows(int limit = 120)
    {
        var grid = GridElement;
        if (grid is null) return [];

        var rows = new List<PackGridRow>();
        var index = 0;
        foreach (var row in new WinFormsGrid(grid).Rows(limit))
        {
            var cells = row.Cells;
            string At(int i) => i < cells.Count ? Txt.N(cells[i]) : "";

            // ⚠️ CỘT MÃ (PackCod) BỊ ẨN. frm203002.cs:2691 tắt nó theo cờ mbolHideRowFlg,
            //    nên cầu MSAA chỉ phơi ra HAI cột đọc được: số thứ tự và TÊN.
            //    Đo được 2026-09-14, lưới thật:  [0] №No 名称    [1] №1 ｺｱ+EE+光CR(単)+形成
            //    Bản đầu đọc Cod = cells[1] / Nam = cells[2] ⇒ tên rơi vào ô rỗng và
            //    FindPackRow luôn trượt. Spec web ghi đúng điều này: 「cột No. CHÍNH LÀ số
            //    thứ tự hiển thị, KHÔNG phải pac_cd」 (pack-sidepanel-handler.spec.ts).
            var num = At(0);
            var nam = At(1);

            // ⚠️ F11 — DÒNG TIÊU ĐỀ LỌT VÀO DANH SÁCH. Dòng [0] là header 「№No / 名称」.
            //    Nhận ra bằng: ô số thứ tự KHÔNG phải số.
            if (Txt.Int(num) is null) continue;

            rows.Add(new PackGridRow(index++, row.Element, num, "", nam));
        }
        return rows;
    }

    /// <summary>
    /// Dòng của pack <paramref name="pacCd"/> — tìm theo CỘT MÃ trước, lui về TÊN.
    ///
    /// <para>Không bao giờ tìm theo số thứ tự: xem cảnh báo ở doc-comment của lớp.</para>
    /// </summary>
    public PackGridRow? FindPackRow(int pacCd, string? pacNm = null, int limit = 120)
    {
        var rows = Rows(limit);

        // Cột mã bị ẩn (xem Rows) ⇒ TÊN là đường nhận dạng DUY NHẤT đọc được từ lưới.
        // Tham số pacCd giữ lại cho thông điệp lỗi và cho ngày nào đó cột mã được bật.
        var byCode = rows.FirstOrDefault(r => r.CodNum == pacCd);
        if (byCode is not null) return byCode;

        if (string.IsNullOrWhiteSpace(pacNm)) return null;
        var needle = Txt.N(pacNm);
        return rows.FirstOrDefault(r => Txt.Has(r.Nam, needle))
               ?? rows.FirstOrDefault(r => Txt.N(r.Nam).StartsWith(needle, StringComparison.Ordinal));
    }

    /// <summary>Chốt một pack bằng DOUBLE-CLICK — đường của <c>grdPack_CellDoubleClick</c>.</summary>
    public bool CommitByDoubleClick(PackGridRow row, TestTrace? trace = null)
    {
        trace?.Step($"double-click dong pack 「{row}」");
        var (x, y) = Uia.Center(row.Element);
        Uia.DoubleClickPhysical(x, y);
        return true;
    }

    /// <summary>
    /// Chốt bằng ô 選択№: gõ số thứ tự rồi Enter — đường của <c>txtPackSentakuNo_KeyDown</c>.
    ///
    /// <para>Số phải là SỐ THỨ TỰ TRÊN LƯỚI (<c>PackNum</c>, tức <c>index + 1</c>), KHÔNG
    /// phải <c>PAC_CD</c>: <c>grdPack_RowEnter</c> ghi <c>e.RowIndex + 1</c> vào ô đó
    /// (frm203002.cs:2230).</para>
    /// </summary>
    public bool CommitBySelNo(PackGridRow row, TestTrace? trace = null)
    {
        var box = SelNoElement;
        if (box is null)
        {
            trace?.Note($"khong thay o 選択№ 「{SelNoId}」 — tab パック da mo chua?");
            return false;
        }

        var no = (row.Index + 1).ToString();
        trace?.Step($"go 「{no}」 vao o 選択№ roi Enter (dong 「{row}」)");
        Uia.Click(box);
        Uia.SetText(box, no);
        Uia.SendKey(Vk.Return);
        return true;
    }

    /// <summary>
    /// Click vào ĐẦU CỘT (header) của lưới pack — <c>e.RowIndex &lt; 0</c>, app phải
    /// KHÔNG làm gì (frm203002.cs:6779).
    /// </summary>
    public bool ClickHeader(TestTrace? trace = null)
    {
        var grid = GridElement;
        if (grid is null) return false;

        var header = grid.FindFirstDescendant(cf => cf.ByControlType(ControlType.Header))
                     ?? grid.FindFirstDescendant(cf => cf.ByControlType(ControlType.HeaderItem));
        if (header is null)
        {
            trace?.Note("khong thay header cua grdPack trong cay UIA — bo qua ca nay.");
            return false;
        }

        trace?.Step("click vao header cua grdPack (RowIndex < 0)");
        var (x, y) = Uia.Center(header);
        Uia.DoubleClickPhysical(x, y);
        return true;
    }

    /// <summary>Mô tả lưới pack — LUÔN in ra khi không tìm thấy dòng cần.</summary>
    public string Describe(int limit = 30) =>
        Rows(limit) is { Count: > 0 } rows
            ? string.Join("\n    ", rows.Select(r => r.ToString()))
            : "(lưới pack rỗng hoặc tab chưa mở)";
}
