using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
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

    /// <summary>Nhãn nút chuyển tab, nguyên văn từ Designer (:290, :325, :359, :393).</summary>
    public static string TabButtonCaption(int grp) => grp switch
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
    /// Chuyển sang tab của <paramref name="grp"/> bằng cách <b>bấm nút</b>, không gõ phím F.
    ///
    /// <para>F1–F4 ở đây là nút của CHÍNH form này, nhưng phím F rơi vào form đang giữ
    /// tiêu điểm (F15) — mà 診療入力 phía dưới cũng có F1「病検」/F3「チェック」. Bấm nút
    /// thì không có chỗ cho nhầm lẫn.</para>
    /// </summary>
    public bool SelectTab(int grp, TestTrace? trace = null)
    {
        var caption = TabButtonCaption(grp);
        var btn = Buttons().FirstOrDefault(b => Txt.Has(Uia.NameOf(b), caption));
        if (btn is null)
        {
            trace?.Note($"KHONG thay nut tab 「{caption}」. Nut doc duoc: [{string.Join(", ", ButtonNames())}]");
            return false;
        }

        // GradientButton là nút tự vẽ — không có InvokePattern, phải click chuột thật (F13).
        trace?.Do($"chuyen sang tab 「{caption}」 (grp {grp})", () => Uia.MouseClick(btn));
        Thread.Sleep(600);
        return true;
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
