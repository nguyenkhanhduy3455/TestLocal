using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugPathB;

/// <summary>
/// Hộp thoại <b>薬剤選択</b> — <c>frm203013</c>, mở bằng <b>Shift+F6</b> từ 診療入力.
/// Đây là <b>lối vào THỨ HAI</b> của <c>editDrugName</c>, bên cạnh lối gõ mã ở ô 点.
///
/// ─── Vì sao lối này cũng đi qua editDrugName ────────────────────────────────
/// <c>frm203013.setData</c> trả về <c>outList</c> mang <c>trt_nm</c> (và <c>cct_nm</c>
/// khi <c>tre_inp_flg = 1</c>) — nhưng đó chỉ là GIÁ TRỊ TRUNG GIAN.
/// <c>frm203002.frmMed_LetData</c> (:8791) không tự ghi dòng: nó dựng
/// <c>tblTrtSel</c> rồi gọi <c>frm203016.Instance.frm203016_Hide_Let_Trt_Data(0)</c>,
/// tức đi CHUNG đường chốt của 処置選択 ⇒ giá trị đọng lại trên lưới là kết quả
/// <c>ModSave.getDrugName</c>, KHÔNG phải <c>trt_nm</c> mà form này đưa sang.
///
/// ─── Hình dạng ──────────────────────────────────────────────────────────────
/// <code>
/// tabMain   内服（F1) → dgvNai   屯服（F2) → dgvTon
///           外用（F3) → dgvGai   その他（F4) → dgvOther     ← lưới TRÁI (nguồn)
/// dgvSelect                                                 ← lưới PHẢI (đã chọn)
/// </code>
/// Lưới trái (<c>_viewItem</c>, frm203013.cs:61-70) có 5 cột ra tới UIA — phần còn lại
/// khai <c>Width = 0</c> nên <c>InitViewItem</c> đặt <c>Visible = false</c>:
/// <code>
/// UIA  0 番号 · 1 ｺｰﾄﾞ · 2 枝番 · 3 名称 · 4 点数
/// </code>
/// Lưới phải dùng <c>_viewItem2</c> (:72-81): 名称 · 点数 · 回数 (trt_cd/trt_sb ẩn).
///
/// ─── ⛔ Escape VÀ End đều là 確定 ────────────────────────────────────────────
/// <c>formBase_KeyDown</c> của form này ánh xạ cả hai vào <c>btnF9_Click</c>
/// (frm203013.cs:166-174) — cùng họ với frm203017/frm203020. Huỷ thì bấm 「F10 戻る」.
/// </summary>
public sealed class MedicineSelectDialog
{
    public const string DialogId = "frm203013";
    public const string SelectedGridId = "dgvSelect";

    /// <summary>Lưới trái theo <c>grp</c> — 1 内服 · 2 屯服 · 3 外用 · khác = その他.</summary>
    public static string SourceGridId(int grp) => grp switch
    {
        1 => "dgvNai",
        2 => "dgvTon",
        3 => "dgvGai",
        _ => "dgvOther",
    };

    /// <summary>
    /// Nhãn tab, nguyên văn từ Designer (:290, :325, :359, :393) —
    /// 「内服（F1)」「屯服（F2)」「外用（F3)」「その他（F4)」. Ở đây chỉ lấy phần chữ đầu để dò.
    /// </summary>
    public static string TabCaption(int grp) => grp switch
    {
        1 => "内服",
        2 => "屯服",
        3 => "外用",
        _ => "その他",
    };

    private readonly OchaApp _app;
    private readonly Window _window;

    private MedicineSelectDialog(OchaApp app, Window window)
    {
        _app = app;
        _window = window;
    }

    public Window Window => _window;

    /// <summary>
    /// Hộp thoại đang mở, hay null.
    ///
    /// <para>Nhận diện theo <c>dgvSelect</c> — lưới 「đã chọn」 chỉ form này có. Dò theo
    /// <c>dgvView</c> là lẫn với 処置選択/薬剤使用量選択 (cả hai đều có lưới tên đó).</para>
    /// </summary>
    public static MedicineSelectDialog? Find(OchaApp app, Window? owner)
    {
        var byId = app.Window(DialogId);
        if (byId is not null && Looks(byId)) return new MedicineSelectDialog(app, byId);

        foreach (var w in ModalDialogs.All(app, owner))
            if (Looks(w))
                return new MedicineSelectDialog(app, w);
        return null;

        static bool Looks(Window w)
        {
            try { return Uia.ById(w, SelectedGridId) is not null; }
            catch { return false; }
        }
    }

    public static MedicineSelectDialog? WaitFor(OchaApp app, Window? owner, TimeSpan timeout) =>
        Waits.TryFor(() => Find(app, owner), timeout);

    public bool IsOpen()
    {
        try { return Uia.IsOnScreen(_window); }
        catch { return false; }
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một dòng của lưới TRÁI.</summary>
    public sealed record SourceRow(int Index, AutomationElement Element,
                                   string No, string Code, string Sub, string Name, string Score)
    {
        public override string ToString() => $"[{Index}] {Code}/{Sub} 「{Name}」 {Score}点";
    }

    /// <summary>
    /// Nội dung lưới trái của tab <paramref name="grp"/>, đã loại dòng tiêu đề (F11).
    ///
    /// <para>Lọc theo NỘI DUNG ô ｺｰﾄﾞ: dòng tiêu đề lọt vào danh sách dữ liệu và ô đầu
    /// của nó mang chính chuỗi 「番号」.</para>
    /// </summary>
    public IReadOnlyList<SourceRow> SourceRows(int grp, int limit = 200)
    {
        var grid = Uia.ById(_window, SourceGridId(grp));
        if (grid is null) return [];

        var rows = new List<SourceRow>();
        var index = 0;
        foreach (var element in new WinFormsGrid(grid).RowElements(limit))
        {
            var row = new DgvRow(element);
            if (row.Cells.Count < 4) continue;

            var code = Cell(row.At(1));
            if (Txt.Int(code) is null) continue;   // dòng tiêu đề

            rows.Add(new SourceRow(index++, element, Cell(row.At(0)), code, Cell(row.At(2)),
                                   Cell(row.At(3)), Cell(row.At(4))));
        }
        return rows;
    }

    /// <summary>Nội dung lưới PHẢI (đã chọn) — 名称 · 点数 · 回数.</summary>
    public IReadOnlyList<string> SelectedRows(int limit = 50)
    {
        var grid = Uia.ById(_window, SelectedGridId);
        if (grid is null) return [];

        var rows = new List<string>();
        foreach (var element in new WinFormsGrid(grid).RowElements(limit))
        {
            var row = new DgvRow(element);
            if (row.Cells.Count == 0) continue;
            var text = string.Join(" | ", row.Cells.Select(Cell));
            if (Txt.N(text).Length > 0) rows.Add(text);
        }
        return rows;
    }

    /// <summary>
    /// Chuyển sang tab của <paramref name="grp"/> bằng cách <b>click TAB HEADER</b>.
    ///
    /// <para>Không có nút F1–F4 để bấm: <c>_btnInfo</c> của form này khai cả bốn là
    /// <c>OCHA_OFF</c> (frm203013.cs:44-48), chỉ 「F9 確定」/「F10 戻る」 hiện ra. Đường lui
    /// là gõ phím F — <c>formBase_KeyDown</c> vẫn ánh xạ chúng sang
    /// <c>btnF1..F4_Click</c> dù nút vô hình (:149-162 → :199-220).</para>
    ///
    /// <para>Sau khi chuyển, <b>chờ đúng cái lưới của tab đó xuất hiện</b>: WinForms chỉ
    /// tạo handle cho control của một <c>TabPage</c> khi trang ấy hiện lần đầu, nên
    /// trước đó UIA không thấy gì bên trong. Đo được 2026-09-09 (Tc5): đọc
    /// <c>dgvTon</c> khi chưa chuyển tab trả về <b>0 dòng</b>.</para>
    /// </summary>
    public bool SelectTab(int grp, TestTrace? trace = null)
    {
        var caption = TabCaption(grp);

        // ⚠️ KHÔNG có nút F1–F4 để bấm: `_btnInfo` của form này khai cả bốn là
        // `OCHA_OFF` (frm203013.cs:44-48) — chỉ 「F9 確定」/「F10 戻る」 hiện ra. Chuyển tab
        // là click chính TAB HEADER. Đo được 2026-09-09 (Tc5): nút đọc được trên hộp
        // thoại chỉ có [<, >, Line up, Page down, Line down, F9 確定, F10 戻る].
        var tab = Uia.Descendants(_window).FirstOrDefault(
            e => Uia.ControlTypeOf(e) == ControlType.TabItem && Txt.Has(Uia.NameOf(e), caption));

        if (tab is not null)
        {
            trace?.Do($"click tab 「{Txt.N(Uia.NameOf(tab))}」 (grp {grp})", () => Uia.MouseClick(tab));
        }
        else
        {
            // Đường lui: phím F. `formBase_KeyDown` vẫn ánh xạ F1–F4 sang btnF1..F4_Click
            // dù nút vô hình (frm203013.cs:149-162 → :199-220 đặt tabMain.SelectedIndex).
            var key = grp switch { 1 => VirtualKeyShort.F1, 2 => VirtualKeyShort.F2,
                                   3 => VirtualKeyShort.F3, _ => VirtualKeyShort.F4 };
            trace?.Note($"khong thay TabItem 「{caption}」 — lui ve go phim {key}. " +
                        $"Tab doc duoc: [{string.Join(", ", TabNames())}]");
            trace?.Do($"go phim {key} de chuyen tab", () => Keyboard.Press(key));
        }

        // Lưới của một TabPage CHƯA từng hiện thì WinForms chưa tạo handle cho nó ⇒ UIA
        // không thấy control nào bên trong. Chờ đúng cái lưới của tab này xuất hiện chứ
        // đừng ngủ một khoảng đoán chừng.
        var id = SourceGridId(grp);
        var ok = Waits.TryUntil(() => Uia.ById(_window, id) is not null, TimeSpan.FromSeconds(8));
        if (!ok) trace?.Note($"sau khi chuyen tab van KHONG thay luoi 「{id}」");
        Thread.Sleep(400);
        return ok;
    }

    /// <summary>Nhãn các tab đọc được — in ra khi không dò được tab cần tới.</summary>
    public IReadOnlyList<string> TabNames()
    {
        try
        {
            return Uia.Descendants(_window)
                      .Where(e => Uia.ControlTypeOf(e) == ControlType.TabItem)
                      .Select(e => Txt.N(Uia.NameOf(e)))
                      .Where(n => n.Length > 0)
                      .ToList();
        }
        catch { return []; }
    }

    /// <summary>
    /// Double-click một dòng của lưới trái ⇒ <c>dgvView_CellDoubleClick</c> → <c>moveData</c>
    /// đẩy nó sang lưới phải (frm203013.cs:293-300, :238).
    /// </summary>
    public bool Pick(SourceRow row, TestTrace? trace = null)
    {
        var cells = Uia.Children(row.Element).ToList();
        if (cells.Count < 4) return false;

        var (x, y) = Uia.Center(cells[3]);   // ô 名称 — rộng nhất, khó trượt nhất
        trace?.Do($"double-click dong 「{row.Name}」 ({row.Code}/{row.Sub}) o luoi trai",
                  () => Uia.DoubleClickPhysical(x, y));
        Thread.Sleep(800);
        return true;
    }

    /// <summary>Dòng mang đúng <paramref name="trtCd"/>/<paramref name="trtSb"/>; null nếu không có.</summary>
    public SourceRow? FindRow(int grp, int trtCd, int trtSb) =>
        SourceRows(grp).FirstOrDefault(r => Txt.Int(r.Code) == trtCd && Txt.Int(r.Sub) == trtSb);

    /// <summary>
    /// 確定 — bấm nút <b>「F9 確定」</b> của CHÍNH hộp thoại này (F15), rồi chờ nó đóng.
    ///
    /// <para>Sau đó <c>frmMed_LetData</c> chạy vòng theo từng dòng đã chọn, và mỗi vòng
    /// đi qua <c>frm203016_Hide_Let_Trt_Data</c> ⇒ có thể bung 診療チェック. Đó là việc
    /// của flow, không phải của hàm này.</para>
    /// </summary>
    public bool Confirm(TestTrace? trace = null) => PressFButton("確定", trace);

    /// <summary>戻る — huỷ. ⛔ ĐỪNG dùng Escape: nó là 確定 (frm203013.cs:172-174).</summary>
    public bool Cancel(TestTrace? trace = null) => PressFButton("戻る", trace);

    public IReadOnlyList<string> ButtonNames() =>
        Buttons().Select(b => Txt.N(Uia.NameOf(b))).Where(n => n.Length > 0).ToList();

    private IReadOnlyList<AutomationElement> Buttons()
    {
        try
        {
            return _window.FindAllDescendants(cf => cf.ByControlType(ControlType.Button));
        }
        catch { return []; }
    }

    private bool PressFButton(string caption, TestTrace? trace)
    {
        var btn = Buttons().FirstOrDefault(b => Txt.Has(Uia.NameOf(b), caption));
        if (btn is null)
        {
            trace?.Note($"KHONG thay nut 「{caption}」 tren 薬剤選択. Nut doc duoc: " +
                        string.Join(",", ButtonNames()));
            return false;
        }
        trace?.Do($"bam nut 「{caption}」 cua 薬剤選択", () => Uia.MouseClick(btn));
        return Waits.TryUntil(() => !IsOpen(), TimeSpan.FromSeconds(15));
    }

    /// <summary>Giá trị một ô, đã quy 「(null)」 về chuỗi rỗng (xem <c>DrugAmountDialog.Cell</c>).</summary>
    private static string Cell(string? raw) => Txt.N(raw) is "(null)" ? "" : Txt.N(raw);
}
