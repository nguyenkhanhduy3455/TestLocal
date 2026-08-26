using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientSelectAssign;

/// <summary>
/// Màn 診療入力（患者選択） <c>frm203001</c> — screen object đầu tiên cho màn này.
///
/// ─── Control ────────────────────────────────────────────────────────────────
/// <code>
///   cboPatNo    患者番号     COMMON/Forms/frm901001.Designer.cs:217  (lớp CHA)
///   dgvView     lưới danh sách frm901001.Designer.cs:153             (lớp CHA)
///   cboUserNm   Ｄｒ．        INP/Forms/frm203001.Designer.cs:122
///   cboStaffNm  衛生士       INP/Forms/frm203001.Designer.cs:140
///   lblStaffNm  nhãn 衛生士  — Visible tắt khi DispEiseisi == 0 (frm203001.cs:542)
///   dtTrtDt     診療日       đặt Name trong code, KHÔNG ở Designer (frm203001.cs:203)
/// </code>
///
/// <para><b>Ô 患者番号 là ComboBox chứ không phải TextBox.</b> Nó là
/// <c>CustomComboBox</c> mang lịch sử bệnh nhân, nên phải gõ vào phần Edit BÊN
/// TRONG (<see cref="Uia.EditInside"/>) — giống hệt cái bẫy Rule 12.5 của bản
/// Playwright, nơi cùng ô này cũng có role <c>combobox</c>.</para>
///
/// <para><b>Dòng đầu của combo Ｄｒ．/衛生士 là dòng TRỐNG.</b>
/// <c>EditControl.makeIinMstCombo(..., COMBO_SPC_ON)</c> chèn một dòng
/// <c>USER_NO = 0</c> ở index 0 (EditControl.cs:660-676) — và đó chính là lý do
/// <c>defData</c> kiểm <c>SelectedIndex &gt; 0</c> chứ không kiểm chuỗi rỗng
/// (frm203001.cs:678, :713).</para>
/// </summary>
public sealed class PatientSelectScreen
{
    private readonly Window _window;
    private readonly AutomationBase _automation;

    public PatientSelectScreen(Window window, AutomationBase automation)
    {
        _window = window;
        _automation = automation;
    }

    public Window Window => _window;

    private static string Loc(string key) => TestSettings.Current.Locator(key);

    // ── Control ──────────────────────────────────────────────────────────────

    public AutomationElement PatNoCombo => Uia.RequireById(_window, Loc("patSelPatNo"));
    public AutomationElement DrCombo => Uia.RequireById(_window, Loc("patSelDr"));
    public AutomationElement StaffCombo => Uia.RequireById(_window, Loc("patSelStaff"));
    public AutomationElement ViewGrid => Uia.RequireById(_window, Loc("patSelGrid"));

    /// <summary>Nhãn 衛生士 — có thể KHÔNG tồn tại/ẩn khi <c>DispEiseisi == 0</c>.</summary>
    public AutomationElement? StaffLabel => Uia.ById(_window, Loc("patSelStaffLabel"));

    /// <summary>Hàng 衛生士 có đang hiện không — cách duy nhất đọc <c>DispEiseisi == 0</c> từ UI.</summary>
    public bool HygienistRowVisible()
    {
        var label = StaffLabel;
        if (label is null) return false;
        try { return Uia.IsOnScreen(label); }
        catch { return false; }
    }

    // ── 患者番号 ─────────────────────────────────────────────────────────────

    public string PatNoText() => Txt.N(Uia.ValueOf(PatNoCombo));

    public void TypePatNo(string value)
    {
        var edit = Uia.EditInside(PatNoCombo);
        Uia.SetText(edit, value);
        Waits.Step();
    }

    public void ClearPatNo()
    {
        var edit = Uia.EditInside(PatNoCombo);
        Uia.SetText(edit, "");
        Waits.Step();
    }

    // ── Ｄｒ． / 衛生士 ──────────────────────────────────────────────────────

    public string DrText() => Txt.N(Uia.ValueOf(DrCombo));

    public string StaffText() => Txt.N(Uia.ValueOf(StaffCombo));

    /// <summary>
    /// Chọn Ｄｒ．theo <b>CHỈ SỐ</b> trong combo, bằng BÀN PHÍM.
    ///
    /// <para><b>Đo được 2026-08-26 (PROBE KQ-3): combo này phơi ra ĐÚNG 0 mục qua UIA.</b>
    /// <c>CustomComboBox</c> là DropDownList của WinForms — cầu MSAA→UIA không dựng
    /// <c>ListItem</c> nào cho tới khi danh sách bung ra thành cửa sổ popup riêng, nên
    /// mọi cách bám theo TÊN (<c>ComboBox.Select(string)</c>, tìm <c>ListItem</c>) đều
    /// hỏng. Bản đầu tiên của luồng này viết theo tên và chết đúng chỗ đó.</para>
    ///
    /// <para>Cách chạy được: combo ĐANG ĐÓNG vẫn đổi lựa chọn theo phím —
    /// <c>Home</c> về mục 0, mỗi <c>Down</c> xuống một mục. Chỉ số suy ra từ DB:
    /// <c>makeIinMstCombo</c> đổ vào combo bằng <c>ORDER BY user_no</c> kèm một dòng
    /// TRỐNG chèn ở đầu (EditControl.cs:660-676), mà <see cref="PatientSelectAssignDb.Staff"/>
    /// cũng <c>ORDER BY user_no</c> — nên Ｄｒ．thứ <c>i</c> (0-based) của DB nằm ở
    /// combo index <c>i + 1</c>.</para>
    ///
    /// <para><paramref name="expectText"/> khác null thì khẳng định luôn nhãn combo sau
    /// khi chọn — không có nó thì một phím rơi mất là test đo nhầm Ｄｒ．mà vẫn xanh.</para>
    /// </summary>
    public void SelectDoctorByIndex(int comboIndex, string? expectText = null)
        => SelectByIndex(DrCombo, "Ｄｒ．", comboIndex, expectText);

    /// <summary>
    /// Trả combo Ｄｒ．về dòng TRỐNG ⇒ <c>SelectedIndex == 0</c>.
    ///
    /// <para>Dòng trống là chuỗi rỗng nên <see cref="SelectDoctorByOpening"/> tìm nó
    /// như mọi mục khác; phải MỞ dropdown vì combo đóng không nhận phím (KQ-3b).
    /// Đang trống sẵn thì không làm gì — tránh mở/đóng dropdown vô ích.</para>
    /// </summary>
    public void ClearDoctor()
    {
        if (Txt.N(Uia.ValueOf(DrCombo)).Length == 0) return;
        SelectDoctorByOpening("");
    }

    public void SelectHygienistByIndex(int comboIndex, string? expectText = null)
        => SelectByIndex(StaffCombo, "衛生士", comboIndex, expectText);

    public void ClearHygienist() => SelectByIndex(StaffCombo, "衛生士", 0, "");

    private void SelectByIndex(AutomationElement element, string what, int comboIndex, string? expectText)
    {
        if (comboIndex < 0) throw new ArgumentOutOfRangeException(nameof(comboIndex));

        Focus(element);
        Keyboard.Press(VirtualKeyShort.HOME);
        for (var i = 0; i < comboIndex; i++) Keyboard.Press(VirtualKeyShort.DOWN);
        Waits.Step();

        if (expectText is null) return;

        var actual = Txt.N(Uia.ValueOf(element));
        if (actual == Txt.N(expectText)) return;

        throw new InvalidOperationException(
            $"Chọn combo {what} về index {comboIndex} nhưng nhãn đang là 「{actual}」, " +
            $"kỳ vọng 「{Txt.N(expectText)}」. Thứ tự combo phải khớp IINMST2 ORDER BY user_no " +
            "với một dòng trống ở index 0 (EditControl.cs:660-676) — lệch nghĩa là giả định đó sai.");
    }

    private static void Focus(AutomationElement element)
    {
        try { element.Focus(); }
        catch { /* vài control WinForms không nhận SetFocus qua UIA */ }
        Waits.Step();
    }

    /// <summary>Nhãn combo Ｄｒ．đang hiện — dùng để đối chiếu sau khi chọn.</summary>
    public string DoctorLabel() => DrText();

    /// <summary>
    /// Danh sách Ｄｒ．đọc từ IINMST2 (<c>ORDER BY user_no</c>) — nguồn để suy CHỈ SỐ
    /// combo từ TÊN. Fixture gán một lần sau khi dò DB.
    ///
    /// <para>Phải đi qua đây vì combo không phơi mục nào ra UIA (PROBE KQ-3), nên
    /// không thể hỏi chính combo xem 「副」 nằm ở đâu.</para>
    /// </summary>
    public IReadOnlyList<StaffMember> DoctorRoster { get; set; } = [];

    /// <summary>
    /// Chọn Ｄｒ．theo TÊN hiển thị, quy ra chỉ số bằng <see cref="DoctorRoster"/>.
    ///
    /// <para>Dòng trống ở index 0 nên Ｄｒ．thứ <c>i</c> (0-based) của roster nằm ở
    /// combo index <c>i + 1</c>.</para>
    /// </summary>
    public void SelectDoctor(string userNm) => SelectByWalking(DrCombo, "Ｄｒ．", userNm);

    /// <summary>
    /// Chọn theo TÊN bằng cách <b>đi từng bước và ĐỌC nhãn</b>: Home về đầu, rồi mỗi
    /// <c>Down</c> đọc lại nhãn cho tới khi khớp.
    ///
    /// <para><b>Vì sao không tính chỉ số từ DB.</b> Source nói combo được đổ bằng
    /// <c>WHERE USER_KBN=@kbn ORDER BY USER_NO</c> kèm dòng trống chèn ở index 0
    /// (Iinmst2.getComboData + EditControl.makeIinMstCombo:660-676), nên chỉ số ĐÁNG LẼ
    /// suy được. Đo thật 2026-08-26 thì KHÔNG: index 1 ra 「丹野 友紀子」 (user_no=18)
    /// chứ không phải 「副」 (user_no=1). Chưa rõ vì sao, và PROBE-GUIDELINE mục 2 nói
    /// rõ chưa biết thì đừng đoán — nên cách chọn ở đây tự sửa sai: nó KHÔNG giả định
    /// thứ tự nào cả, chỉ đọc nhãn thật cho tới khi trúng.</para>
    ///
    /// <para>Vòng lặp dừng khi nhãn không đổi nữa (đã chạm đáy) hoặc quá
    /// <c>maxSteps</c> — không có vòng vô hạn.</para>
    /// </summary>
    private void SelectByWalking(AutomationElement element, string what, string userNm)
    {
        var wanted = Txt.N(userNm);
        var seen = new List<string>();

        Focus(element);
        Keyboard.Press(VirtualKeyShort.HOME);
        Waits.Step();

        var maxSteps = Math.Max(DoctorRoster.Count, 1) + 4;
        for (var i = 0; i <= maxSteps; i++)
        {
            var label = Txt.N(Uia.ValueOf(element));
            if (label == wanted) return;

            // Nhãn lặp lại = đã chạm cuối danh sách, bấm nữa cũng vô ích.
            if (seen.Count > 0 && seen[^1] == label) break;
            seen.Add(label);

            Keyboard.Press(VirtualKeyShort.DOWN);
            Waits.Step();
        }

        throw new InvalidOperationException(
            $"Không chọn được 「{wanted}」 trong combo {what}. Nhãn đi qua theo thứ tự THẬT: " +
            string.Join(" → ", seen.Select(x => $"「{x}」")) +
            $". Roster đọc từ IINMST2: {string.Join(" / ", DoctorRoster.Select(d => d.ToString()))}.");
    }

    /// <summary>
    /// Chọn Ｄｒ．bằng cách <b>MỞ dropdown rồi mới đi phím</b>.
    ///
    /// <para>Đo 2026-08-26: combo ĐANG ĐÓNG không nhận phím (KQ-3b: Home/Down không đổi
    /// nhãn), và UIA cũng không phơi mục nào khi đóng (KQ-3). Dropdown của WinForms
    /// ComboBox là một <b>cửa sổ popup riêng</b> chứ không phải con của combo — đó là
    /// lý do mọi phép tìm <c>ListItem</c> trong hậu duệ của combo đều ra rỗng.</para>
    ///
    /// <para>Nên: click để bung dropdown, rồi <c>Down</c> từng bước và đọc lại nhãn cho
    /// tới khi khớp, cuối cùng <c>Enter</c> để chốt. Không giả định thứ tự nào.</para>
    /// </summary>
    public IReadOnlyList<string> SelectDoctorByOpening(string userNm, int maxSteps = 30)
    {
        var wanted = Txt.N(userNm);
        var seen = new List<string>();

        Uia.Click(DrCombo);           // bung dropdown
        Waits.Step();

        for (var i = 0; i < maxSteps; i++)
        {
            var label = Txt.N(Uia.ValueOf(DrCombo));
            if (seen.Count == 0 || seen[^1] != label) seen.Add(label);

            if (label == wanted)
            {
                Keyboard.Press(VirtualKeyShort.ENTER);
                Waits.Step();
                return seen;
            }

            Keyboard.Press(VirtualKeyShort.DOWN);
            Waits.Step();
        }

        Keyboard.Press(VirtualKeyShort.ESCAPE);
        Waits.Step();
        throw new InvalidOperationException(
            $"Mở dropdown rồi đi {maxSteps} bước vẫn không tới 「{wanted}」. Nhãn đi qua: " +
            string.Join(" → ", seen.Select(x => x.Length == 0 ? "「」" : $"「{x}」")));
    }

    /// <summary>
    /// Đi hết combo và trả về thứ tự nhãn THẬT — dành cho PROBE ghi lại, vì UIA không
    /// phơi mục nào ra (KQ-3) nên đây là cách duy nhất biết combo đang xếp thế nào.
    /// </summary>
    public IReadOnlyList<string> WalkDoctorLabels(int maxSteps = 30)
    {
        var seen = new List<string>();

        // PHẢI bung dropdown trước: combo đóng không nhận phím (đo 2026-08-26, KQ-3b).
        Uia.Click(DrCombo);
        Waits.Step();

        for (var i = 0; i < maxSteps; i++)
        {
            var label = Txt.N(Uia.ValueOf(DrCombo));
            if (seen.Count > 0 && seen[^1] == label) break;
            seen.Add(label);
            Keyboard.Press(VirtualKeyShort.DOWN);
            Waits.Step();
        }

        Keyboard.Press(VirtualKeyShort.ESCAPE);   // đóng lại, KHÔNG chốt lựa chọn
        Waits.Step();
        return seen;
    }

    /// <summary>
    /// Tên các mục combo ĐỌC ĐƯỢC qua UIA — chỉ để PROBE ghi lại con số.
    ///
    /// <para>Đo 2026-08-26: trả về RỖNG cho combo Ｄｒ．(PROBE KQ-3). Đừng dựa vào nó
    /// để chọn — dùng <see cref="SelectDoctor"/> / <see cref="SelectDoctorByIndex"/>.</para>
    /// </summary>
    public IReadOnlyList<string> ItemNames(AutomationElement element)
        => ExpandAndList(element).Select(e => Txt.N(Uia.NameOf(e))).ToList();

    /// <summary>
    /// Bung combo rồi gom mọi <c>ListItem</c> đọc được. Trả rỗng là KẾT QUẢ HỢP LỆ ở
    /// app này — xem ghi chú của <see cref="ItemNames"/>.
    /// </summary>
    private IReadOnlyList<AutomationElement> ExpandAndList(AutomationElement element)
    {
        try { element.Patterns.ExpandCollapse.PatternOrDefault?.Expand(); }
        catch { /* DropDownList của WinForms có thể không có pattern này */ }
        Waits.Step();

        var items = element.FindAllDescendants(cf => cf.ByControlType(ControlType.ListItem));
        var found = items.Length > 0
            ? items.ToList()
            : Uia.Descendants(element, 4).Where(e => Uia.ControlTypeOf(e) == ControlType.ListItem).ToList();

        try { element.Patterns.ExpandCollapse.PatternOrDefault?.Collapse(); }
        catch { /* bỏ qua */ }
        Waits.Step();

        return found;
    }

    public IReadOnlyList<string> DoctorItemNames() => ItemNames(DrCombo);

    // ── 患者確定 ─────────────────────────────────────────────────────────────

    /// <summary>
    /// 患者確定 bằng <b>End</b> — <c>BaseForm</c> map cả <c>End</c> lẫn <c>Escape</c> về
    /// <c>btnEndEsc_Click</c> (BaseForm.cs:616-627), và frm203001 override nó thành
    /// 「ô 患者番号 trước, dòng lưới sau」, LUÔN ở chế độ Insert (frm203001.cs:487-506).
    ///
    /// <para>Đây đúng là phím mà bản web gắn cho <c>confirmPatient()</c>, nên hai bên
    /// so được với nhau.</para>
    /// </summary>
    public void ConfirmWithEnd()
    {
        FocusWindow();
        Keyboard.Press(VirtualKeyShort.END);
        Waits.Step();
    }

    /// <summary>患者確定 bằng <b>F9</b> 初/再診入力 (Insert) — frm203001.cs:459-470.</summary>
    public void ConfirmWithF9()
    {
        FocusWindow();
        Keyboard.Press(VirtualKeyShort.F9);
        Waits.Step();
    }

    /// <summary>
    /// 患者確定 từ DÒNG lưới bằng <b>Enter</b> — <c>dgvView_KeyDown</c> gọi
    /// <c>defData(inpKbn.selRow, …)</c> (frm203001.cs:287-296).
    ///
    /// <para><b>KHÔNG dùng double-click.</b> <c>dgvView_CellDoubleClick</c> có câu
    /// <c>defData</c> BỊ COMMENT (frm203001.cs:303-309) nên double-click là no-op —
    /// đây là chỗ WinForm khác bản web, xem README mục 3.</para>
    /// </summary>
    public void ConfirmSelectedRowWithEnter()
    {
        Uia.Click(ViewGrid);
        Waits.Step();
        Keyboard.Press(VirtualKeyShort.ENTER);
        Waits.Step();
    }

    /// <summary>Chọn dòng lưới theo 患者番号; trả về false khi lưới không có dòng đó.</summary>
    public bool SelectGridRowByPatNo(int patNo)
    {
        var grid = new WinFormsGrid(ViewGrid);
        var rows = grid.RowElements();
        foreach (var rowElement in rows)
        {
            var row = grid.Row(rowElement);
            if (row.IsEmpty) continue;
            if (row.Cells.Any(c => int.TryParse(Digits(c), out var n) && n == patNo))
            {
                Uia.Click(rowElement);
                Waits.Step();
                return true;
            }
        }
        return false;
    }

    private static string Digits(string s) => new(s.Where(char.IsDigit).ToArray());

    private void FocusWindow()
    {
        try { Uia.ForceForeground(_window.Properties.NativeWindowHandle.ValueOrDefault); }
        catch { /* không lấy được handle thì bỏ qua, phím vẫn đi vào cửa sổ đang focus */ }
    }

    /// <summary>Cửa sổ 患者選択 còn đang hiện không — sang frm203002 thì nó bị <c>Hide()</c>.</summary>
    public bool IsShowing()
    {
        try { return Uia.IsOnScreen(_window); }
        catch { return false; }
    }
}
