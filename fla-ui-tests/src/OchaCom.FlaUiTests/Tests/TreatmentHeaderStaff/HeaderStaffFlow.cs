using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentHeaderStaff;

/// <summary>
/// Lái vùng 「Ｄｒ」 trên header <c>frm203002</c> và ĐỌC KẾT QUẢ — không assert.
///
/// ─── BA control cùng một chỗ ────────────────────────────────────────────────
/// <code>
///   lblDrLabel  CustomLabel 「Ｄｒ」  click = 一括変更 CẢ NGÀY   (frm203002.cs:8105-8130)
///   lbDr        TextBox             担当医 CỦA DÒNG con trỏ   (Chg_DrName, modMain.cs:2125)
///   cboDr       ComboBox            担当医 cho DÒNG THÊM MỚI  (Visible=false, :2478)
/// </code>
///
/// Ba cái trả lời ba câu khác nhau và rất dễ bị gộp thành một khi refactor — đó là
/// lý do bản web có riêng một spec khoá cả ba
/// (<c>../web-tenant-tests/tests/treatment-header-staff.spec.ts</c>), và đây là nửa
/// WinForm của nó.
/// </summary>
public sealed class HeaderStaffFlow
{
    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;

    public HeaderStaffFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
    }

    private static string Loc(string key) => TestSettings.Current.Locator(key);

    // ── Ba control ───────────────────────────────────────────────────────────

    public AutomationElement? CaptionElement => Uia.ById(_screen.Window, Loc("detailDrCaption"));
    public AutomationElement? LabelElement => Uia.ById(_screen.Window, Loc("detailDrLabel"));
    public AutomationElement? ComboElement => Uia.ById(_screen.Window, Loc("detailDrCombo"));

    /// <summary>Nhãn <c>lbDr</c> — 担当医 của DÒNG con trỏ đang đứng.</summary>
    public string LabelText()
    {
        var e = LabelElement;
        return e is null ? "" : Txt.N(Uia.ValueOf(e));
    }

    /// <summary>
    /// Combo <c>cboDr</c> có ĐANG HIỆN không.
    ///
    /// <para>Mặc định phải là <b>false</b>: frm203002 đặt <c>cboDr.Visible = false</c>
    /// (:2478) và chỉ bật lên khi click nhãn (<c>lbDr_Click</c>, :8087) hoặc khi click
    /// caption (<c>lblDrLabel_Click</c> đặt <c>Visible = true</c> ngay dòng đầu, :8107).</para>
    /// </summary>
    public bool ComboVisible()
    {
        var e = ComboElement;
        if (e is null) return false;
        try { return Uia.IsOnScreen(e); }
        catch { return false; }
    }

    /// <summary>Giá trị combo <c>cboDr</c> — đọc được cả khi đang ẩn.</summary>
    public string ComboText()
    {
        var e = ComboElement;
        return e is null ? "" : Txt.N(Uia.ValueOf(e));
    }

    /// <summary>Click nhãn <c>lbDr</c> để lộ combo (<c>lbDr_Click</c>, frm203002.cs:8087).</summary>
    public void RevealCombo()
    {
        var e = LabelElement;
        if (e is null) return;
        PhysicalClick(e, "nhãn lbDr");
    }

    /// <summary>
    /// Click bằng CHUỘT THẬT vào tâm phần tử.
    ///
    /// <para><b>Không dùng <see cref="Uia.Click"/> ở luồng này.</b> Đo 2026-08-26: mọi
    /// control vẽ tay của app đều KHÔNG phản ứng với InvokePattern —
    /// <c>Uia.Click(lbDr)</c> không mở combo, <c>Uia.Click(lblDrLabel)</c> không bung
    /// hộp thoại 一括変更, <c>Uia.Click(row)</c> không dời con trỏ lưới. Cùng đúng cái
    /// mà <c>AppNavigator</c> đã ghi cho menu chính: 「Menu chính không có Button nào,
    /// toàn Panel nghe MouseClick ⇒ phải click chuột thật」.</para>
    ///
    /// <para>Rect rỗng thì NÉM: <c>LeftClickPhysical</c> bắn vào toạ độ màn hình nên
    /// <c>(0,0)</c> là click vào góc trái trên DESKTOP, app mất foreground và mọi bước
    /// sau đổ oan cho app (PROBE-GUIDELINE 3.4 ở mức cửa sổ).</para>
    /// </summary>
    private static void PhysicalClick(AutomationElement element, string what)
    {
        var rect = Uia.RectOf(element);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
            throw new InvalidOperationException(
                $"{what} đọc ra rect RỖNG ({rect?.ToString() ?? "null"}) — click vào đó sẽ bắn " +
                "chuột ra (0,0) tức góc trái trên DESKTOP chứ không vào app.");

        var (x, y) = Uia.Center(element);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    // ── Lưới ─────────────────────────────────────────────────────────────────

    /// <summary>Số 日 của dòng con trỏ đang đứng (cột 0).</summary>
    public string CurrentDay()
    {
        var row = _screen.Regi.CurrentRow();
        return row is null ? "" : Txt.N(row.At(RegiGrid.Col.Day));
    }

    /// <summary>
    /// Một dòng DỮ LIỆU của lưới: chỉ số trong tập đọc được + số 日.
    /// </summary>
    public sealed record GridRow(int Index, string Day);

    /// <summary>
    /// Các dòng DỮ LIỆU đang nhìn thấy — đã lọc dòng tiêu đề và dòng trống.
    ///
    /// <para>Cầu MSAA→UIA để 「Top Row」 (dòng tiêu đề) lọt vào danh sách dòng, và ô 日
    /// của nó đọc ra đúng chữ 「日」 — đo được 2026-08-26, đúng bẫy PROBE-GUIDELINE 3.2.
    /// Lọc theo 「ô 日 phải là SỐ」 loại được cả nó lẫn các dòng 部位病名行 / 行追加 để
    /// trống.</para>
    ///
    /// <para>Cũng nhớ PROBE-GUIDELINE 3.1: UIA chỉ phơi ra dòng ĐANG NHÌN THẤY, nên đây
    /// là tập con của lưới thật, và chỉ số là chỉ số TRONG TẬP NÀY.</para>
    /// </summary>
    public IReadOnlyList<GridRow> DataRows()
    {
        var rows = _screen.Regi.Grid.RowElements();
        var found = new List<GridRow>();

        for (var i = 0; i < rows.Count; i++)
        {
            var row = _screen.Regi.Grid.Row(rows[i]);
            if (row.IsEmpty) continue;

            var day = Txt.N(row.At(RegiGrid.Col.Day));
            if (day.Length == 0 || !day.All(char.IsDigit)) continue;

            // Còn phải CLICK ĐƯỢC: UIA phơi ra cả dòng ngoài khung nhìn kèm GIÁ TRỊ,
            // nhưng ô của chúng đọc ra rect {0,0,0,0} (PROBE-GUIDELINE 3.1). Lọc ở đây
            // để nơi gọi luôn nhận về dòng thật sự bấm được — đã vấp thật 2026-08-26:
            // TC-BULK-2 đỏ ở dòng #3 vì chọn phải một dòng như vậy.
            var cells = Uia.Children(rows[i]).ToList();
            if (cells.Count <= RegiGrid.Col.Day) continue;

            var rect = Uia.RectOf(cells[RegiGrid.Col.Day]);
            if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0) continue;

            found.Add(new GridRow(i, day));
        }
        return found;
    }

    /// <summary>
    /// Đặt con trỏ lên một dòng bằng CLICK CHUỘT THẬT vào ô 日 của nó.
    ///
    /// <para><b>Không dùng <c>Uia.Click</c> lên phần tử DÒNG.</b> Đo 2026-08-26: gọi
    /// Invoke/DoDefaultAction trên dòng KHÔNG dời con trỏ của <c>DataGridView</c> —
    /// probe click liên tiếp ba dòng khác nhau mà <c>CurrentCellAddress</c> vẫn đứng
    /// nguyên ở 日=25. Cách chạy được là bắn chuột vào TOẠ ĐỘ của một Ô, đúng như
    /// <c>TreatmentGridOps.FocusCell</c> đã phải làm.</para>
    ///
    /// <para>Rect rỗng thì NÉM chứ không click: <c>LeftClickPhysical</c> bắn vào toạ độ
    /// màn hình, nên <c>(0,0)</c> là click vào góc trái trên DESKTOP và app mất
    /// foreground — mọi bước sau đó sẽ đổ oan cho app.</para>
    ///
    /// <para>Trả về số 日 đọc lại được SAU khi click, để nơi gọi tự khẳng định con trỏ
    /// đã tới đúng dòng.</para>
    /// </summary>
    public string FocusRow(int index)
    {
        var rows = _screen.Regi.Grid.RowElements();
        if (index < 0 || index >= rows.Count)
            throw new ArgumentOutOfRangeException(
                nameof(index), $"lưới chỉ đọc được {rows.Count} dòng, không có dòng #{index}");

        var cells = Uia.Children(rows[index]).ToList();
        if (cells.Count <= RegiGrid.Col.Day)
            throw new InvalidOperationException(
                $"dòng #{index} chỉ đọc được {cells.Count} ô, không có cột 日");

        var cell = cells[RegiGrid.Col.Day];
        var rect = Uia.RectOf(cell);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
            throw new InvalidOperationException(
                $"ô 日 của dòng #{index} đọc ra rect RỖNG ({rect?.ToString() ?? "null"}) — " +
                "click vào đó sẽ bắn chuột ra (0,0) tức góc trái trên DESKTOP chứ không vào app. " +
                "Thường là dòng nằm ngoài khung nhìn hoặc lưới đang bị tab khác che.");

        var (x, y) = Uia.Center(cell);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
        return CurrentDay();
    }

    /// <summary>Số 日 đọc được của từng dòng đang nhìn thấy — gồm cả dòng tiêu đề, để PROBE ghi lại.</summary>
    public IReadOnlyList<string> VisibleDays() => _screen.Regi.Column(RegiGrid.Col.Day);

    // ── 一括変更 ─────────────────────────────────────────────────────────────

    /// <summary>Kết cục của một lần click caption 「Ｄｒ」.</summary>
    public sealed record BulkPrompt(string Text, Window? Dialog)
    {
        public bool Appeared => Dialog is not null;
    }

    /// <summary>
    /// Click caption <c>lblDrLabel</c> và chờ hộp thoại 「ドクター変更」.
    ///
    /// <para>Văn bản do <c>Interaction.MsgBox</c> dựng THẲNG trong source, KHÔNG qua
    /// <c>MSGTBL</c> (frm203002.cs:8115-8117):</para>
    /// <code>
    ///   {日}日診療分の担当ドクターを\r\n{cboDr.Text} に変更します。\r\n\r\nよろしいですか？
    /// </code>
    /// <para>Chú ý có <b>một dấu cách</b> giữa tên Ｄｒ．và 「に変更します。」, và xuống
    /// dòng nằm TRƯỚC tên chứ không phải sau.</para>
    /// </summary>
    public BulkPrompt ClickCaption(TimeSpan? timeout = null)
    {
        var caption = CaptionElement;
        if (caption is null) return new BulkPrompt("", null);

        PhysicalClick(caption, "caption lblDrLabel");

        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(20));
        while (DateTime.UtcNow < deadline)
        {
            var dialog = FirstDialog();
            if (dialog is not null) return new BulkPrompt(Txt.N(Dialogs.TextOf(dialog)), dialog);
            Thread.Sleep(Waits.PollInterval);
        }
        return new BulkPrompt("", null);
    }

    /// <summary>Hộp thoại đang mở của app, nếu có.</summary>
    public Window? FirstDialog()
    {
        var open = Dialogs.Open(_app.Automation, _app.ProcessId);
        if (open.Count > 0) return open[0];

        var modal = ModalDialogs.All(_app, _screen.Window);
        return modal.Count > 0 ? modal[0] : null;
    }

    /// <summary>Trả lời 「はい」 / 「いいえ」 cho hộp thoại 一括変更.</summary>
    public bool Answer(Window dialog, bool yes)
    {
        var names = yes
            ? new[] { "はい", "Yes", "&Yes", "Y" }
            : new[] { "いいえ", "No", "&No", "N" };

        // ClickButtonContaining dùng CHUỘT THẬT nên thử nó TRƯỚC: control của app không
        // nhận InvokePattern (xem PhysicalClick), và ClickButton đi bằng Invoke.
        if (Dialogs.ClickButtonContaining(dialog, names)) return true;
        if (Dialogs.ClickButton(dialog, names)) return true;

        // Đường cuối: bắn chuột vào chính phần tử Button đọc được.
        foreach (var button in dialog.FindAllDescendants()
                     .Where(e => Uia.ControlTypeOf(e) == ControlType.Button))
        {
            var name = Txt.N(Uia.NameOf(e: button));
            if (!names.Any(n => name.Contains(n, StringComparison.OrdinalIgnoreCase))) continue;

            var rect = Uia.RectOf(button);
            if (rect is null || rect.Value.Width <= 0) continue;

            var (x, y) = Uia.Center(button);
            Uia.LeftClickPhysical(x, y);
            Waits.Step();
            return true;
        }
        return false;
    }
}
