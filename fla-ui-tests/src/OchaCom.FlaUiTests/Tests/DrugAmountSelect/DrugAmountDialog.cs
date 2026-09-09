using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugAmountSelect;

/// <summary>
/// Hộp thoại <b>薬剤使用量選択</b> — <c>frm203020</c>, cái bung ra khi chốt một mã thuốc có
/// <c>mst_trt.F2 = 1</c> (数量変更可, frm203016.cs:1426-1440).
///
/// ─── Hình dạng thật ─────────────────────────────────────────────────────────
/// Lưới <c>dgvView</c> khai 8 cột nhưng <c>InitViewItem</c> đặt <c>Visible = false</c> cho
/// mọi cột <c>Width == 0</c> (GradientDataGridView.cs:438-439), nên chỉ <b>5</b> cột ra tới
/// UIA (frm203020.cs:64-73):
/// <code>
/// UIA  tiêu đề        cột trong code   ReadOnly
///  0   薬　剤　名　称   Cells[1] dg_nm       ✔
///  1   薬　価          Cells[2] dg_cost     ✔
///  2   使用量          Cells[3] med_cnt     ✘  ← ô DUY NHẤT sửa được
///  3   単　位          Cells[4] unit_nm     ✔
///  4   薬　価　計       Cells[5] cost        ✔
/// </code>
/// ⚠️ <b>Chỉ số UIA KHÁC chỉ số <c>Cells[]</c> trong source</b> vì 3 cột ẩn
/// (<c>med_cd</c>, <c>cost_type</c>, <c>med_cnt_base</c>) không ra tới cây. Dò cột theo
/// TIÊU ĐỀ (<see cref="DrugRow"/> dùng <c>DgvRow.ByHeader</c>), chỉ số chỉ là đường lui.
///
/// ─── Hai đường đổi 使用量, và chúng KHÁC nhau ────────────────────────────────
/// <list type="number">
/// <item><b>Click một ô bất kỳ của dòng</b> ⇒ <c>CellClick</c> cộng 使用量 thêm 1, trần 255
///   (:303-330). Không cần gõ, nhưng <b>mọi</b> ô đều kích hoạt — click để "chọn dòng"
///   cũng đã làm số nhảy. Đây là bẫy lớn nhất của hộp thoại này.</item>
/// <item><b>Gõ vào ô 使用量</b> ⇒ <c>CellValidating</c> tính lại 薬価計 khi RỜI ô
///   (:269-301). Chuỗi rỗng bị <c>e.Cancel</c>, và <c>cost_type == 「3」</c> thì
///   <c>CancelEdit</c> — sửa không ăn.</item>
/// </list>
///
/// ─── ⛔ Đóng bằng F10, ĐỪNG bằng Escape ──────────────────────────────────────
/// <c>formBase_KeyDown</c> ánh xạ <b>Escape → btnF9_Click</b> (:153-155), y hệt frm203017.
/// Escape ở đây là <b>確定</b>: nó chạy <c>setPacData</c>, ghi 点数 + <c>free_wd</c> ngược
/// về <c>grdRegi</c>. Muốn huỷ thì bấm nút 「F10 戻る」.
/// <b>Phím <c>End</c> cũng là 確定</b> (:150-152).
/// </summary>
public sealed class DrugAmountDialog
{
    /// <summary>AutomationId của form (WinForms lấy từ <c>Control.Name</c>).</summary>
    public const string DialogId = "frm203020";

    public const string GridId = "dgvView";
    public const string CostSumId = "txtCostSum";
    public const string PointSumId = "txtPointSum";

    /// <summary>Tiêu đề mà <c>frm203020_Load</c> đặt (<c>_title</c>, frm203020.cs:45).</summary>
    public const string TitleText = "薬剤使用量選択";

    /// <summary>Câu app bung ra khi 処置変換 rỗng rồi TỰ ĐÓNG hộp thoại (:119-123).</summary>
    public const string NoRowsFragment = "算定可能な処置はありません";

    // Tiêu đề cột, nguyên văn từ frm203020.cs:65-72 (có 全角空白 chen giữa):
    //   「薬　剤　名　称」 · 「薬　価」 · 「使用量」 · 「単　位」 · 「薬　価　計」
    //
    // ⚠️ BA cột chứa 「薬」 nên KHÔNG dò cột 薬価 bằng một mình chữ đó — phải loại cả
    //    「剤」 (薬剤名称) lẫn 「計」 (薬価計). Đo được 2026-09-09 (Tc1, KQ-4): bản đầu
    //    chỉ loại 「計」 nên ô 薬価 đọc ra chính TÊN THUỐC, và dòng in ra thành
    //    「薬価 オゼックス錠150 150mg × 3錠」 — sai mà trông vẫn hợp lý.
    public const string ColName = "薬";
    public const string HeaderDrugName = "剤";   // chỉ 薬剤名称 có 「剤」
    public const string HeaderCount = "使用量";
    public const string HeaderUnit = "単";
    public const string HeaderCost = "計";       // chỉ 薬価計 có 「計」

    private readonly OchaApp _app;
    private readonly Window _window;

    private DrugAmountDialog(OchaApp app, Window window)
    {
        _app = app;
        _window = window;
    }

    public Window Window => _window;

    /// <summary>
    /// Hộp thoại đang mở, hay null.
    ///
    /// <para>Nhận diện theo <c>txtCostSum</c> + <c>txtPointSum</c> chứ KHÔNG theo lưới
    /// <c>dgvView</c>: <b>frm203016 (処置選択) cũng có một lưới tên <c>dgvView</c></b>, và
    /// hai form này <b>mở chồng lên nhau</b> — <c>showDialog(ID203020)</c> được gọi từ
    /// trong <c>frmTrtSel_Let_Trt_Data</c>, tức lúc frm203016 còn nguyên (frm203016.cs:1439).
    /// Dò theo lưới là lẫn hai cửa sổ, và <c>SigaToothFlow.Picker()</c> — vốn lui về
    /// 「modal nào có dgvView」 — sẽ trả về NHẦM chính hộp thoại này.</para>
    /// </summary>
    public static DrugAmountDialog? Find(OchaApp app, Window? owner)
    {
        var byId = app.Window(DialogId);
        if (byId is not null && Looks(byId)) return new DrugAmountDialog(app, byId);

        foreach (var w in ModalDialogs.All(app, owner))
            if (Looks(w))
                return new DrugAmountDialog(app, w);

        return null;

        static bool Looks(Window w)
        {
            try { return Uia.ById(w, CostSumId) is not null && Uia.ById(w, PointSumId) is not null; }
            catch { return false; }
        }
    }

    /// <summary>Chờ hộp thoại bung ra. <paramref name="timeout"/> NGẮN có chủ ý (F2).</summary>
    public static DrugAmountDialog? WaitFor(OchaApp app, Window? owner, TimeSpan timeout) =>
        Waits.TryFor(() => Find(app, owner), timeout);

    public bool IsOpen()
    {
        try { return Uia.IsOnScreen(_window); }
        catch { return false; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Đọc
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một dòng của lưới — đọc theo TIÊU ĐỀ cột, lui về chỉ số khi không dò được.</summary>
    /// <param name="Raw">Nguyên văn các ô, chưa chuẩn hoá — cần cho câu hỏi về
    /// <c>CellFormatting</c> (nó chen dấu cách vào mọi ô, frm203020.cs:195-207).</param>
    public sealed record DrugRow(int Index, AutomationElement Element,
                                 string Name, string Cost, string Count, string Unit, string Sum,
                                 IReadOnlyList<string> Raw)
    {
        public float CountF => float.TryParse(Txt.N(Count), out var f) ? f : 0f;
        public float SumF => float.TryParse(Txt.N(Sum), out var f) ? f : 0f;

        public override string ToString() =>
            $"[{Index}] 「{Name}」 薬価 {Cost} × {Count}{Unit} = {Sum}";
    }

    private AutomationElement? Grid() => Uia.ById(_window, GridId);

    /// <summary>Nội dung lưới, đã loại dòng tiêu đề (F11 — 「Top Row」 lọt vào danh sách).</summary>
    public IReadOnlyList<DrugRow> Rows(int limit = 12)
    {
        var grid = Grid();
        if (grid is null) return [];

        var rows = new List<DrugRow>();
        var index = 0;
        foreach (var element in new WinFormsGrid(grid).RowElements(limit))
        {
            var row = new DgvRow(element);
            if (row.Cells.Count < 3) continue;

            // Dòng tiêu đề lọt lưới thì mọi ô đều là chính tiêu đề — 使用量 không parse
            // ra số, và ô 薬価 cũng vậy. Lọc theo NỘI DUNG, đúng cách CommitPick làm.
            var count = row.ByHeader(HeaderCount) ?? row.At(2);
            var cost = row.ByHeader(ColName) ?? row.At(1);
            if (!float.TryParse(Txt.N(count), out _) && !float.TryParse(Txt.N(cost), out _))
                continue;

            rows.Add(new DrugRow(
                index++, element,
                row.ByHeader(HeaderDrugName) ?? row.At(0),
                CostCell(row),
                count,
                row.ByHeader(HeaderUnit) ?? row.At(3),
                row.ByHeader(HeaderCost) ?? row.At(4),
                row.Cells));
        }
        return rows;

        // Ba cột chứa 「薬」 — lấy ô KHÔNG chứa 「剤」 và KHÔNG chứa 「計」.
        static string CostCell(DgvRow row)
        {
            for (var i = 0; i < row.CellDescriptions.Count; i++)
            {
                var d = row.CellDescriptions[i];
                if (Txt.Has(d, ColName) && !Txt.Has(d, HeaderDrugName) && !Txt.Has(d, HeaderCost))
                    return row.At(i);
            }
            return row.At(1);
        }
    }

    /// <summary>薬価合計 — <c>txtCostSum</c>, app ghi <c>sum.ToString("0.00")</c> (:551).</summary>
    public string CostSumText() => ReadBox(CostSumId);

    /// <summary>点数 — <c>txtPointSum</c>, app ghi <c>getPoint(sum, 1).ToString()</c> (:555).</summary>
    public string PointSumText() => ReadBox(PointSumId);

    public float? PointSum() => float.TryParse(Txt.N(PointSumText()), out var f) ? f : null;
    public float? CostSum() => float.TryParse(Txt.N(CostSumText()), out var f) ? f : null;

    private string ReadBox(string id)
    {
        var e = Uia.ById(_window, id);
        return e is null ? "" : Txt.N(Uia.ValueOf(e));
    }

    /// <summary>Mô tả cả hộp thoại — LUÔN in ra khi một bước không diễn ra như mong đợi.</summary>
    public string Describe() =>
        $"薬価合計=「{CostSumText()}」 点数=「{PointSumText()}」 · " +
        string.Join(" / ", Rows().Select(r => r.ToString()));

    /// <summary>Tên các nút F đang bật — 確定 (F9) và 戻る (F10) là hai cái duy nhất (:56-57).</summary>
    public IReadOnlyList<string> ButtonNames()
    {
        try
        {
            return _window.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                          .Select(b => Txt.N(Uia.NameOf(b)))
                          .Where(n => n.Length > 0)
                          .ToList();
        }
        catch { return []; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Thao tác
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Click MỘT lần vào ô 薬剤名称 của dòng ⇒ <c>CellClick</c> cộng 使用量 thêm 1
    /// (frm203020.cs:303-330).
    ///
    /// <para>Click vào ô 薬剤名称 chứ không vào ô 使用量 là CÓ CHỦ Ý: ô 使用量 sửa được
    /// nên click vào đó có thể mở luôn editor, trộn hai đường đo vào nhau (F4 — mỗi lượt
    /// đổi đúng một thứ). Về mặt <c>CellClick</c> thì click ô nào cũng như nhau — chính
    /// điều đó là thứ testcase cần khẳng định.</para>
    ///
    /// <para>Hàm này KHÔNG đoán trước kết quả: nó chỉ click. 使用量 có tăng hay không
    /// (dòng <c>cost_type == 「3」</c> thì <c>CellClick</c> bỏ qua, :321) là <b>thứ đem
    /// đo</b>, không phải điều kiện để gọi.</para>
    /// </summary>
    public bool ClickRow(DrugRow row, TestTrace? trace = null)
    {
        var cells = Uia.Children(row.Element).ToList();
        if (cells.Count == 0) return false;

        var (x, y) = Uia.Center(cells[0]);
        trace?.Do($"click o 薬剤名称 cua dong 「{row.Name}」", () => Uia.LeftClickPhysical(x, y));
        Thread.Sleep(300);
        return true;
    }

    /// <summary>
    /// Gõ một 使用量 mới vào ô 使用量 của dòng, rồi <b>rời ô</b> để <c>CellValidating</c>
    /// chạy (frm203020.cs:267-301 — 「セルが入力フォーカスを失う時に発生」).
    ///
    /// <para>Rời ô bằng <b>mũi tên xuống/lên</b>, KHÔNG bằng Enter và tuyệt đối không bằng
    /// Escape: <c>formBase_KeyDown</c> biến Escape thành 確定 (:153). Enter thì tuỳ
    /// <c>ActiveControl</c> — với lưới nó rơi vào nhánh 「không ProcessTabKey」 (:156-168)
    /// nên vô hại, nhưng mũi tên là đường chắc chắn rời ô mà không rời form.</para>
    ///
    /// <para>⚠️ Cú click để đặt con trỏ vào ô <b>đã tự cộng 1</b> (CellClick). Vì thế hàm
    /// GHI ĐÈ giá trị: chọn hết rồi gõ, chứ không gõ thêm vào sau.</para>
    /// </summary>
    public bool TypeCount(DrugRow row, string value, TestTrace? trace = null)
    {
        var cells = Uia.Children(row.Element).ToList();
        var idx = HeaderIndex(row, HeaderCount);
        if (idx < 0 || idx >= cells.Count) return false;

        var (x, y) = Uia.Center(cells[idx]);
        trace?.Step($"go 使用量 = 「{value}」 vao dong 「{row.Name}」 " +
                    "(luu y: chinh cu click nay da +1 qua CellClick, nen gia tri se bi GHI DE)");

        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(250);

        // F2 mở editor của ô đang chọn; Ctrl+A + gõ để GHI ĐÈ chứ không nối thêm.
        Keyboard.Press(VirtualKeyShort.F2);
        Thread.Sleep(200);
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Thread.Sleep(100);
        Keyboard.Type(value);
        Thread.Sleep(200);

        // Rời ô ⇒ CellValidating chạy ⇒ 薬価計 + 合計 được tính lại.
        Keyboard.Press(VirtualKeyShort.DOWN);
        Thread.Sleep(400);
        return true;
    }

    private static int HeaderIndex(DrugRow row, string header)
    {
        var descriptions = new DgvRow(row.Element).CellDescriptions;
        for (var i = 0; i < descriptions.Count; i++)
            if (Txt.Has(descriptions[i], header)) return i;
        return 2;   // đường lui: 使用量 là cột hiển thị thứ 3
    }

    /// <summary>
    /// 確定 — bấm nút <b>「F9 確定」</b> của CHÍNH hộp thoại này.
    ///
    /// <para>Bấm nút chứ không gõ phím F9 (F15): 処置選択 đang mở NGAY DƯỚI và nó cũng có
    /// nút 「F9 確定」 của riêng nó (frm203016.cs:68) — phím F rơi vào form đang giữ tiêu
    /// điểm, mà đó chưa chắc là form mình nhắm.</para>
    ///
    /// <para>確定 chạy <c>setPacData</c> (:179-186) ⇒ 点数 + <c>free_wd</c> đi ngược về
    /// <c>grdRegi</c> cột 72 (frm203016.cs:1450-1451). <b>Vẫn chưa chạm DB</b> — xuống DB
    /// là việc của F9 登録 ở màn 診療入力.</para>
    /// </summary>
    public bool Confirm(TestTrace? trace = null) => PressFButton("確定", trace);

    /// <summary>戻る — huỷ, KHÔNG ghi gì ngược về lưới (<c>setPacData</c> chỉ chạy ở nhánh 確定).</summary>
    public bool Cancel(TestTrace? trace = null) => PressFButton("戻る", trace);

    private bool PressFButton(string caption, TestTrace? trace)
    {
        AutomationElement? btn;
        try
        {
            btn = Uia.Descendants(_window).FirstOrDefault(
                e => Uia.ControlTypeOf(e) == ControlType.Button && Txt.Has(Uia.NameOf(e), caption));
        }
        catch { btn = null; }

        if (btn is null)
        {
            trace?.Note($"KHONG thay nut 「{caption}」 tren 薬剤使用量選択. Nut doc duoc: " +
                        string.Join(",", ButtonNames()));
            return false;
        }

        // GradientButton là nút tự vẽ — không có InvokePattern, phải click chuột thật (F13).
        trace?.Do($"bam nut 「{caption}」 cua 薬剤使用量選択", () => Uia.MouseClick(btn));
        return Waits.TryUntil(() => !IsOpen(), TimeSpan.FromSeconds(10));
    }
}
