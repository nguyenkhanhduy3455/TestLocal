using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PackDialog;

/// <summary>
/// パック処置選択 <c>frm203014</c> — hộp thoại bung ra khi chốt một dòng ở tab パック.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BỐN BẪY CỦA MÀN NÀY (đọc trước khi sửa bất cứ assert nào)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>F9 / End / Escape ĐỀU là 確定.</b> <c>formBase_KeyDown</c> ánh xạ cả ba vào
///     <c>btnF9_Click</c> (frm203014.cs:148-156) — <b>không có phím huỷ</b>. Gửi Escape để
///     「đóng cho xong」 là CHỐT dữ liệu xuống lưới 処置. Muốn thoát mà không chốt thì phải
///     đặt 回数 của mọi dòng về 0/rỗng trước, vì <c>setPacData</c> chỉ lấy dòng có 回数
///     khác rỗng và khác 「0」 (:600-615).</item>
///
///   <item><b>Lưới rỗng ⇒ form TỰ ĐÓNG rồi MỚI hiện thông báo.</b> <c>frm203013_Load</c>
///     gọi <c>this.Close()</c> TRƯỚC <c>MsgBox</c> (frm203014.cs:122-124). Nên đi tìm
///     「form còn mở không」 để kết luận là sai đường: lúc thông báo hiện ra thì form đã
///     biến mất. Mốc đúng là <b>chính hộp thoại</b> 「算定可能な処置はありません。」.</item>
///
///   <item><b>Tiêu điểm ban đầu nằm ở ô 回数 của DÒNG ĐẦU</b> (<c>dgvView.Rows[0]
///     .Cells["cnt"].Selected</c>, :584), không phải ô tên. Gõ số ngay sẽ sửa 回数 dòng 1.</item>
///
///   <item><b>Cột 名称 đổi màu theo <c>flag2</c></b> — comment in tím
///     <c>0xff00ff</c> khi 「レセプト印字」, ngược lại xanh dương (:568-578). UIA KHÔNG phơi
///     ra màu chữ; muốn đo phải dùng <see cref="PixelProbe"/>.</item>
/// </list>
/// </summary>
public sealed class PackSelectDialog
{
    /// <summary>AutomationId của form (frm203014.Designer.cs:90).</summary>
    public const string FormId = "frm203014";

    /// <summary>Lưới item (Designer:70).</summary>
    public const string GridId = "dgvView";

    /// <summary>
    /// Ô nhập tham số cho カルテコメント còn <c>*</c> (Designer:51). Chỉ hiện khi
    /// <c>chkPacData</c> bắt được — xem <see cref="PackDialogTests"/> TCP0 về việc nhánh
    /// này có dữ liệu chạm tới hay không.
    /// </summary>
    public const string ValueBoxId = "txtValue";

    /// <summary>Tiêu đề — <c>_title</c> của frm203014.cs.</summary>
    public const string Title = "パック処置選択";

    /// <summary>Thông báo khi lưới rỗng (frm203014.cs:124).</summary>
    public const string EmptyMessage = "算定可能な処置はありません";

    /// <summary>Tiêu đề MsgBox đi kèm <see cref="EmptyMessage"/>.</summary>
    public const string EmptyMessageCaption = "処置パック";

    /// <summary>Cột của <c>dgvView</c> — thứ tự do <c>_viewItem</c> quy định (frm203014.cs:68-75).</summary>
    public static class Col
    {
        public const int TrtCd = 0;
        public const int TrtSb = 1;
        public const int Name = 2;
        public const int Score = 3;
        public const int Cnt = 4;
        public const int JihiFlg = 5;
        public const int Men = 6;
        public const int AccUnit = 7;
    }

    private readonly OchaApp _app;
    private readonly Window _owner;

    public PackSelectDialog(OchaApp app, Window owner)
    {
        _app = app;
        _owner = owner;
    }

    /// <summary>Hộp thoại đang mở; null nếu không.</summary>
    public Window? Open() =>
        ModalDialogs.All(_app, _owner)
                    .FirstOrDefault(w => Txt.Has(Uia.AutomationIdOf(w), FormId) ||
                                         Txt.Has(Uia.NameOf(w), Title));

    /// <summary>Chờ hộp thoại bung ra. Deadline NGẮN (F2) — nó mở ngay hoặc không bao giờ.</summary>
    public Window? WaitOpen(TimeSpan? timeout = null) =>
        Waits.TryFor(Open, timeout ?? TimeSpan.FromSeconds(10));

    /// <summary>Chờ hộp thoại đóng hẳn.</summary>
    public bool WaitClosed(TimeSpan? timeout = null) =>
        Waits.TryUntil(() => Open() is null, timeout ?? TimeSpan.FromSeconds(10));

    /// <summary>Một dòng của lưới item.</summary>
    /// <param name="Index">Chỉ số dòng trên lưới, 0-based.</param>
    public sealed record Item(int Index, string TrtCd, string TrtSb, string Name, string Score, string Cnt)
    {
        public int? CdNum => Txt.Int(TrtCd);
        public int? SbNum => Txt.Int(TrtSb);
        public int? ScoreNum => Txt.Int(Score);
        public int? CntNum => Txt.Int(Cnt);

        public override string ToString() => $"[{Index}] {TrtCd}/{TrtSb} 「{Name}」 {Score}点 ×{Cnt}";
    }

    /// <summary>
    /// Nội dung lưới item.
    ///
    /// <para>Đọc qua <see cref="WinFormsGrid"/> (cầu MSAA→UIA) vì <c>GradientDataGridView</c>
    /// không phơi ô ra UIA theo đường thường. ⚠️ F10: UIA chỉ thấy dòng ĐANG NHÌN THẤY —
    /// pack nhiều item hơn chiều cao lưới thì phần dưới không có trong danh sách này.
    /// Mọi phép đếm phải nói rõ nó đếm 「dòng nhìn thấy」.</para>
    /// </summary>
    public IReadOnlyList<Item> Items(Window dialog, int limit = 40)
    {
        var grid = Uia.ById(dialog, GridId);
        if (grid is null) return [];

        var rows = new List<Item>();
        var index = 0;
        foreach (var row in new WinFormsGrid(grid).Rows(limit))
        {
            var cells = row.Cells;
            string At(int i) => i < cells.Count ? Txt.N(cells[i]) : "";
            rows.Add(new Item(index++, At(Col.TrtCd), At(Col.TrtSb), At(Col.Name), At(Col.Score), At(Col.Cnt)));
        }
        return rows;
    }

    /// <summary>Ô nhập tham số có đang hiện không (nhánh <c>chkPacData</c> bắt dấu <c>*</c>).</summary>
    public bool ValueBoxVisible(Window dialog)
    {
        var box = Uia.ById(dialog, ValueBoxId);
        return box is not null && Uia.IsOnScreen(box);
    }

    /// <summary>
    /// Đóng hộp thoại bằng 「F10 戻る」 nếu có nút đó, ngược lại bấm 「F9 確定」.
    ///
    /// <para>⚠️ Dùng NÚT chứ không gửi phím (F15), và đọc kỹ bẫy 1 ở doc-comment của lớp:
    /// Escape KHÔNG phải huỷ ở màn này.</para>
    /// </summary>
    public bool CloseWithoutCommit(Window dialog, TestTrace? trace = null)
    {
        var buttons = dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button));
        var back = buttons.FirstOrDefault(b => Txt.Has(Uia.NameOf(b), "戻る"));
        if (back is not null)
        {
            trace?.Step($"dong frm203014 bang 「{Uia.NameOf(back)}」");
            Uia.Click(back);
            return WaitClosed();
        }

        trace?.Note("khong thay nut 「戻る」 tren frm203014 — cac nut: [" +
                    string.Join(" / ", buttons.Select(Uia.NameOf)) + "]");
        return false;
    }

    /// <summary>
    /// NFKC + gộp khoảng trắng — BẮT BUỘC áp cho CẢ HAI vế mọi phép so chuỗi.
    ///
    /// <para>Lưới in 半角 (「ｵｰﾗ」) còn master giữ 全角 (「オーラ」); chuẩn hoá một vế thôi là
    /// mọi phép so đều trượt và testcase đỏ oan.</para>
    /// </summary>
    public static string Norm(string? s) =>
        (s ?? "").Normalize(System.Text.NormalizationForm.FormKC).Replace('　', ' ').Trim()
            is var t && t.Length > 0
            ? System.Text.RegularExpressions.Regex.Replace(t, @"\s+", " ")
            : "";

    /// <summary>Mô tả gọn để nhét vào thông điệp assert.</summary>
    public static string Describe(IReadOnlyList<Item> items) =>
        items.Count == 0 ? "(lưới rỗng)" : string.Join("\n    ", items.Select(i => i.ToString()));
}
