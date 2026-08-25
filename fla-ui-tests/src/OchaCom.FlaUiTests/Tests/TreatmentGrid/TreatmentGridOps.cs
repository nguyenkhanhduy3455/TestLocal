using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentGrid;

/// <summary>
/// THAO TÁC (không chỉ đọc) trên lưới đăng ký <c>grdRegi</c> của 診療入力.
///
/// <para><see cref="RegiGrid"/> chỉ ĐỌC — nó đủ cho bộ score, nơi lưới chỉ là chỗ
/// nghiệm thu kết quả của tab 個別. Luồng này cần GÕ VÀO lưới (Insert / Delete /
/// Enter / Tab / mũi tên) nên gom phần ghi ở đây, giữ <see cref="RegiGrid"/> nguyên
/// vẹn cho các fixture cũ.</para>
///
/// ─── Vì sao click CHUỘT VẬT LÝ để đặt con trỏ ────────────────────────────────
/// <c>DataGridView</c> chỉ dời <c>CurrentCell</c> khi có sự kiện chuột THẬT.
/// <c>Invoke</c> / <c>LegacyIAccessible.DoDefaultAction</c> trên một ô sẽ "thành
/// công" mà ô vàng không nhúc nhích — xem chú thích của <see cref="Uia.LeftClickPhysical"/>.
/// Mọi testcase ở đây đo theo Ô ĐANG VÀNG nên đặt con trỏ sai là hỏng hết.
///
/// ─── Vì sao gửi phím bằng bàn phím thật ──────────────────────────────────────
/// Toàn bộ nghiệp vụ nằm trong <c>grdRegi_KeyDown</c> (frm203002.cs:3545-3594) và
/// <c>grdRegi_TextBox_KeyPress</c> (:3599-3640) — cả hai chỉ chạy khi có
/// <c>KeyDown</c>/<c>KeyPress</c> thật. Không có API nào "gọi thẳng" chúng.
/// </summary>
public sealed class TreatmentGridOps
{
    /// <summary>
    /// Trần quét lưới. grdRegi bình thường CHỈ giữ tháng đang mở (lịch sử nằm ở lưới
    /// riêng <c>grdHist</c>), nên vài chục dòng là hết. Trần này để chặn trường hợp
    /// 診療入力設定 bật <c>pInpOpt[41] (過去データ１画面表示)</c> — khi đó cả lịch sử đổ
    /// vào lưới chính và mỗi lần quét sẽ ngốn hàng phút.
    /// </summary>
    public const int ScanLimit = 400;

    private readonly TreatmentEntryScreen _screen;

    public TreatmentGridOps(TreatmentEntryScreen screen) => _screen = screen;

    private RegiGrid Regi => _screen.Regi;

    // ── Đọc ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Tiêu đề 5 cột đang hiển thị (frm203002.Designer.cs:1148-1206).
    ///
    /// <para>KHÔNG dùng được <see cref="WinFormsGrid.Headers"/>: lớp đó tìm dòng mà mọi ô
    /// con là <c>HeaderItem</c>, còn cầu MSAA của <c>grdRegi</c> phơi ra kiểu KHÁC — đo
    /// thật ngày 2026-08-25 (artifacts\treatment-grid.uia.txt):</para>
    /// <code>
    /// Table id="grdRegi"
    ///   Unknown  name="Top Row"          ← dòng tiêu đề, kiểu Unknown chứ không phải Header
    ///     Header name="日" / "部位" / "療法・処置" / "点" / "回"   ← Header, KHÔNG phải HeaderItem
    ///   Unknown  name="Row 1"            ← dòng dữ liệu
    ///     DataItem name="日 Row 1" …     ← DataItem, KHÔNG phải Cell
    /// </code>
    /// <para>Hai hệ quả, cả hai đều đã cắn: <c>Headers()</c> trả RỖNG, và 「Top Row」 bị
    /// đếm NHẦM thành một dòng dữ liệu (lần chạy đầu báo 17 dòng trong khi lưới chỉ có
    /// 16). Vì thế luồng này tự lọc lấy, không sửa <see cref="WinFormsGrid"/> — lớp đó
    /// đang phục vụ các fixture khác trên những lưới có hình dạng khác.</para>
    /// </summary>
    public IReadOnlyList<string> Headers()
    {
        foreach (var child in Uia.Children(Regi.Grid.Element))
        {
            if (!IsHeaderRow(child)) continue;
            return Uia.Children(child).Select(c => Txt.N(Uia.NameOf(c))).ToList();
        }
        return Regi.Grid.Headers();
    }

    /// <summary>
    /// Dòng tiêu đề: ô con là <c>Header</c> (grdRegi) hoặc <c>HeaderItem</c> (lưới khác).
    /// Chỉ nhìn 3 ô đầu là đủ và rẻ hơn hẳn đọc cả dòng.
    /// </summary>
    private static bool IsHeaderRow(AutomationElement row)
    {
        var cells = Uia.Children(row).Take(3).ToList();
        if (cells.Count == 0) return false;
        return cells.All(c => Uia.ControlTypeOf(c)
                              is FlaUI.Core.Definitions.ControlType.Header
                              or FlaUI.Core.Definitions.ControlType.HeaderItem);
    }

    /// <summary>
    /// Các dòng DỮ LIỆU — đã loại 「Top Row」 (xem <see cref="Headers"/>) VÀ ô đang sửa.
    ///
    /// <para>Ô đang sửa của <c>DataGridView</c> là một <c>Edit</c> con của CHÍNH LƯỚI,
    /// không phải con của dòng — nên nó lọt vào danh sách "dòng" và làm số dòng đếm
    /// được tăng thêm 1 mỗi khi có editor mở. Đã vấp thật 2026-08-25: TC-6 đọc ra
    /// 「19 → 19」 rồi kết luận oan là Insert không chạy, trong khi thật ra editor của
    /// testcase trước còn mở. Dòng thật có 5 ô con; ô editor không có con nào.</para>
    /// </summary>
    private IReadOnlyList<AutomationElement> DataRowElements(int limit = ScanLimit) =>
        Regi.Grid.RowElements(limit)
            .Where(r => !IsHeaderRow(r))
            .Where(r => Uia.Children(r).Take(2).Count() >= 2)
            .ToList();

    /// <summary>Chụp lại lưới trong MỘT lượt duyệt — rẻ hơn gọi Column() năm lần.</summary>
    public IReadOnlyList<RegiRow> Snapshot(int limit = ScanLimit)
    {
        var rows = new List<RegiRow>();
        var index = 0;
        foreach (var element in DataRowElements(limit))
        {
            var cells = Uia.Children(element).Select(c => Txt.N(Uia.ValueOf(c))).ToList();
            rows.Add(new RegiRow(
                index++,
                element,
                At(cells, RegiGrid.Col.Day),
                At(cells, RegiGrid.Col.Bui),
                At(cells, RegiGrid.Col.Ryo),
                At(cells, RegiGrid.Col.Ten),
                At(cells, RegiGrid.Col.Kai)));
        }
        return rows;

        static string At(IReadOnlyList<string> cells, int i) => i < cells.Count ? cells[i] : "";
    }

    public int RowCount(int limit = ScanLimit) => DataRowElements(limit).Count;

    /// <summary>Dòng CUỐI có 療法・処置 chứa một trong các chuỗi; không có → null.</summary>
    public RegiRow? LastRowMatching(params string[] anyOf) =>
        Snapshot().LastOrDefault(r => anyOf.Any(w => Txt.Has(r.Ryo, w)));

    /// <summary>
    /// Số dòng có 療法・処置 chứa MỘT TRONG các chuỗi cho trước.
    ///
    /// <para>Đây là mốc DUY NHẤT đáng tin để biết "app vừa thêm dòng": UIA của
    /// <c>DataGridView</c> chỉ phơi ra những dòng ĐANG NHÌN THẤY, mà chèn xong app lại
    /// cuộn lưới — nên cả chỉ số dòng lẫn TỔNG số dòng đọc được đều đổi theo vị trí
    /// cuộn, không theo dữ liệu. Đếm theo nội dung thì miễn nhiễm với cuộn.</para>
    ///
    /// <para>Bản sao của <see cref="RegiGrid.CountRyoContaining"/> nhưng đi qua
    /// <see cref="Snapshot"/> nên KHÔNG đếm nhầm dòng tiêu đề 「Top Row」.</para>
    /// </summary>
    public int CountRyoContaining(params string[] anyOf) =>
        Snapshot().Count(r => anyOf.Any(w => Txt.Has(r.Ryo, w)));

    /// <summary>
    /// Dòng ĐẦU TIÊN mà hai lượt chụp khác nhau — tức là dòng vừa được chèn vào.
    ///
    /// <para>Đây là cách nhận ra dòng mới CHẮC CHẮN nhất, và cố ý không dò theo tên:
    /// tên hiện trên lưới là <c>cct_nm</c> hay <c>trt_nm</c> tuỳ <c>ModCommon.pCultTrt</c>,
    /// có thể khác tên đọc được ở tab 個別. Cũng không hỏi được con trỏ: chèn xong app
    /// gọi luôn <c>BeginEdit</c> (frm203002.cs:6919-6925) nên phần tử đang focus là ô
    /// TextBox đang sửa, không phải "dòng".</para>
    /// </summary>
    public static RegiRow? FirstDifference(IReadOnlyList<RegiRow> before, IReadOnlyList<RegiRow> after)
    {
        for (var i = 0; i < after.Count; i++)
        {
            if (i >= before.Count) return after[i];
            if (before[i].Ryo != after[i].Ryo || before[i].Ten != after[i].Ten) return after[i];
        }
        return null;
    }

    /// <summary>
    /// Ô đang có con trỏ, đọc theo MÔ TẢ của <c>DataGridViewCellAccessibleObject</c> —
    /// chuỗi này có kèm TÊN CỘT và SỐ HÀNG (vd 「回 行 12」), nên so hai lần đọc là biết
    /// con trỏ có dời hay không mà không cần quét lại cả lưới.
    ///
    /// <para>Rỗng = không đọc được (ô đang ở chế độ sửa thì phần tử focus là TextBox
    /// con của lưới, không phải ô).</para>
    /// </summary>
    public string FocusedCellName()
    {
        try
        {
            var focused = _screen.Automation.FocusedElement();
            return focused is null ? "" : Txt.N(Uia.LegacyNameOf(focused));
        }
        catch { return ""; }
    }

    /// <summary>Lưới có đang mở editor không — ô đang sửa là một Edit con của CHÍNH LƯỚI.</summary>
    public bool IsEditing()
    {
        try
        {
            var focused = _screen.Automation.FocusedElement();
            if (focused is null) return false;
            return Uia.ControlTypeOf(focused) == FlaUI.Core.Definitions.ControlType.Edit
                   && Uia.Children(focused).Take(1).ToList().Count == 0;
        }
        catch { return false; }
    }

    /// <summary>Nội dung ô đang sửa; không có editor nào đang mở → rỗng.</summary>
    public string EditorText()
    {
        try
        {
            var focused = _screen.Automation.FocusedElement();
            return focused is null ? "" : Txt.N(Uia.ValueOf(focused));
        }
        catch { return ""; }
    }

    /// <summary>合計点数 của tháng — <c>lbAllPoint</c>, do modAcc.Calc_MDPoint tính (frm203002.cs:3963-3966).</summary>
    public string AllPoint() => Read(TestSettings.Current.Locator("regiAllPoint"));

    /// <summary>
    /// Phần SỐ của <see cref="AllPoint"/>.
    ///
    /// <para>Không dùng thẳng <c>Txt.Int</c> được: <c>Calc_MDPoint</c> định dạng chuỗi là
    /// <c>lngMonthPoint.ToString("#,###") + "　点"</c> (modAcc.cs:107-121) — có dấu phẩy
    /// ngăn nghìn VÀ một khoảng trắng ĐỦ CHIỀU RỘNG trước chữ 点, nên
    /// <c>int.TryParse("12,345　点")</c> luôn thất bại. Ở đây gom lấy chữ số.</para>
    /// </summary>
    public int? AllPointValue()
    {
        var digits = new string(AllPoint().Where(char.IsDigit).ToArray());
        return int.TryParse(digits, out var v) ? v : null;
    }

    /// <summary>実日数 — <c>lbDays</c>, cùng chỗ tính với <see cref="AllPoint"/>.</summary>
    public string Days() => Read(TestSettings.Current.Locator("regiDays"));

    private string Read(string automationId)
    {
        var box = Uia.ById(_screen.Window, automationId);
        return box is null ? "" : Txt.N(Uia.ValueOf(box));
    }

    // ── Ghi ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Đặt con trỏ vào một ô bằng CLICK CHUỘT VẬT LÝ.
    ///
    /// <para>Ô phải đang nằm trong khung nhìn — lưới không tự cuộn tới nó. Các
    /// testcase ở đây chỉ chạm dòng vừa chèn (luôn ở gần con trỏ) nên không cần cuộn.</para>
    /// </summary>
    public void FocusCell(RegiRow row, int column)
    {
        var cells = Uia.Children(row.Element).ToList();
        if (column >= cells.Count)
            throw new InvalidOperationException(
                $"dòng lưới chỉ đọc được {cells.Count} ô, không có cột {column}. Cả dòng: {row}");

        var (x, y) = Uia.Center(cells[column]);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    /// <summary>Gửi một phím vào lưới (lưới phải đang giữ focus).</summary>
    public void Press(VirtualKeyShort key)
    {
        Keyboard.Press(key);
        Waits.Step();
    }

    /// <summary>Gõ một chuỗi ký tự — dùng để đo bộ lọc ký tự của ô 点/回.</summary>
    public void Type(string text)
    {
        Keyboard.Type(text);
        Waits.Step();
    }
}

/// <summary>Một dòng của grdRegi đã đọc xong, kèm phần tử UIA để còn click vào được.</summary>
/// <param name="Index">Vị trí trong lượt quét (0-based), KHÔNG phải số hàng của DataGridView.</param>
public sealed record RegiRow(
    int Index,
    AutomationElement Element,
    string Day,
    string Bui,
    string Ryo,
    string Ten,
    string Kai)
{
    public override string ToString() => $"[{Index}] {Day} | {Bui} | {Ryo} | {Ten} | {Kai}";
}
