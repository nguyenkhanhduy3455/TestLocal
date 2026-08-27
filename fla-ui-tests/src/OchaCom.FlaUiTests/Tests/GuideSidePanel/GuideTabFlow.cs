using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// Tab 「ガイド」 của <c>frm203002</c> (page <c>tabPageGuid</c>, tab thứ 2 của
/// <c>SSTab1</c>) + dialog 「ガイド処置選択」 <c>frm203017</c>.
///
/// <para>Nửa WinForm của <c>../web-tenant-tests/tests/guide-sidepanel-handler.spec.ts</c>.
/// Lớp này chỉ LÁI và ĐỌC, <b>không assert</b> — assert nằm ở fixture, để cùng một
/// thao tác dùng được cho cả probe (không ném) lẫn testcase (ném).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BỐN CONTROL CỦA TAB (frm203002.Designer.cs:1437-1630)
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="bullet">
///   <item><c>hfgGuid1</c> — lưới 2 cột, HeaderText THẬT là 「№」 / 「名称」
///     (:1614-1630). Web hiển thị 「No.」 / 「名称」 ⇒ điểm đo parity đầu tiên.</item>
///   <item><c>txtGuid1Sel</c> — ô 選択№ (:1493). Nhãn quanh nó là hai label rời
///     「選択」 (customLabel23) + 「№」 (customLabel22), KHÔNG phải một chuỗi.</item>
///   <item><c>cmdGuidAll</c> 「全て表示」 · <c>cmdGuidPrv</c> 「前回」 ·
///     <c>cmdGuidReset</c> 「リセット」 (:1482/:1510/:1539). Hai nút sau bị
///     <c>getGuidNyuryokuInfo2</c> bật/tắt <c>Visible</c> theo chế độ.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// F4 VÀ 「SHIFT+F4」 — KHÁC HẲN BẢN WEB
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web nghe đúng tổ hợp phím <c>Shift+F4</c>. WinForm thì KHÔNG: phím F4 luôn rơi
/// vào <c>BaseForm.formBase_KeyDown</c> → <c>btnF4_Click</c>
/// (BaseForm.cs:673), và <c>frm203002.btnF4_Click</c> (:775) rẽ nhánh theo
/// <b>trạng thái LỚP PHÍM</b> <c>ShiftFlg</c> chứ không theo phím bổ trợ của lần bấm đó:
/// <code>
///   ShiftFlg == false → KeyFunc(F4)      → getGuidNyuryokuInfo2(bolStepPass: true)   // 通常
///   ShiftFlg == true  → KeyFunc(F4, 1)   → getGuidNyuryokuInfo2(bolStepPass: false)  // STEP
/// </code>
/// (và <c>ModCommon.pInpOpt[39] == 2</c> ĐẢO hai nhánh — 診療入力設定 「ｶﾞｲﾄﾞﾓｰﾄﾞ」.)
///
/// <para><c>ShiftFlg</c> chỉ đổi ở <c>editButtonPanel</c> (BaseForm.cs:498): giữ phím
/// Shift (KeyDown ShiftKey → true, KeyUp → false) hoặc bấm nút <c>btnShift</c> để lật
/// lớp. Vì thế ở đây có HAI đường vào STEP và probe đo cả hai:
/// <see cref="OpenStepByShiftButton"/> (lật lớp rồi bấm <c>btnF4_S</c> — chắc chắn) và
/// <see cref="OpenStepByShiftChord"/> (giữ Shift rồi gõ F4 — giống người dùng).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// AN TOÀN
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>ĐÓNG frm203017 BẰNG F10.</b> Escape trên dialog đó gọi
///     <c>btnF9_Click</c> — tức 確定 (frm203017.cs:180-182). Escape = chốt 処置, không
///     phải huỷ.</item>
///   <item><b>KHÔNG bấm F9 登録 của frm203002.</b> F9 確定 của frm203017 chỉ đẩy 処置
///     vào lưới trong bộ nhớ; chỉ 登録 mới ghi DB.</item>
///   <item><b>「リセット」 GHI DB THẬT</b> (<c>StepReset</c> → <c>updateTrtState</c>,
///     frm203002.cs:6649). Chỉ được bấm để ĐỌC câu hỏi Q00100 rồi trả lời
///     キャンセル/いいえ.</item>
/// </list>
/// </summary>
public sealed class GuideTabFlow
{
    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;

    public GuideTabFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
    }

    /// <summary>Winuser.h — chỉ những mã luồng này gửi.</summary>
    public static class Vk
    {
        public const ushort F4 = 0x73;
        public const ushort F9 = 0x78;
        public const ushort F10 = 0x79;
        public const ushort Enter = 0x0D;
        public const ushort Up = 0x26;
        public const ushort Down = 0x28;
        public const ushort Shift = 0x10;
    }

    /// <summary>Chỉ số cột của <c>hfgGuid1</c> — chỉ 2 cột, frm203002.Designer.cs:1592.</summary>
    public static class Col
    {
        public const int No = 0;
        public const int Name = 1;
    }

    /// <summary>Header THẬT của lưới ガイド (Designer :1618/:1626).</summary>
    public static readonly string[] ExpectedGridHeaders = ["№", "名称"];

    /// <summary>Header 5 cột hiển thị của <c>dgvView</c> trên frm203017 (frm203017.cs:96-104).</summary>
    public static readonly string[] ExpectedDialogHeaders = ["ｺｰﾄﾞ", "枝番", "処置名称", "点数", "回数"];

    public Window Window => _screen.Window;

    // ── Control của tab ──────────────────────────────────────────────────────

    public AutomationElement? GridElement => Uia.ById(Window, Loc("guideGrid"));
    public WinFormsGrid Grid => new(Uia.RequireById(Window, Loc("guideGrid")));
    public AutomationElement SelNoBox => Uia.RequireById(Window, Loc("guideSelNo"));
    public AutomationElement? SelNoBoxOrNull => Uia.ById(Window, Loc("guideSelNo"));

    public AutomationElement? AllButton => Uia.ById(Window, Loc("guideAllButton"));
    public AutomationElement? PrvButton => Uia.ById(Window, Loc("guidePrvButton"));
    public AutomationElement? ResetButton => Uia.ById(Window, Loc("guideResetButton"));

    /// <summary>
    /// Nút có ĐANG HIỆN không.
    ///
    /// <para><c>Visible = false</c> bên WinForms ⇒ control biến mất khỏi cây UIA, nên
    /// 「không tìm thấy」 chính là 「đang ẩn」. Nhưng có bản Windows vẫn phơi phần tử ra
    /// với <c>IsOffscreen</c>, nên kiểm cả hai — đọc nhầm chỗ này thì hai testcase
    /// parity 「前回/リセット phải ẩn」 sẽ xanh sai.</para>
    /// </summary>
    public bool IsButtonShown(AutomationElement? button)
    {
        if (button is null) return false;
        try { return Uia.IsOnScreen(button); }
        catch { return false; }
    }

    // ── Trạng thái đọc được ─────────────────────────────────────────────────

    /// <summary>Giá trị ô 選択№.</summary>
    public string SelNo()
    {
        var box = SelNoBoxOrNull;
        return box is null ? "(không thấy txtGuid1Sel)" : Txt.N(Uia.ValueOf(box));
    }

    /// <summary>
    /// Các dòng CÓ DỮ LIỆU của lưới ガイド.
    ///
    /// <para>⚠️ Tự lọc dòng tiêu đề, KHÔNG tin <c>WinFormsGrid.RowElements</c>:
    /// <c>IsHeaderRow</c> ở đó nhận diện theo <c>ControlType.HeaderItem</c>, mà cầu
    /// MSAA→UIA của lưới này dựng dòng tiêu đề bằng ô kiểu khác. ĐO ĐƯỢC 2026-08-27:
    /// dòng index 0 đọc ra 「No | 名称」 và bị đếm thành dòng dữ liệu — đúng cái bẫy
    /// PROBE-GUIDELINE 3.2. Lọc theo GIÁ TRỊ ô 「№」 (phải parse ra số) chứ không theo
    /// chỉ số, vì lưới còn cuộn.</para>
    /// </summary>
    public IReadOnlyList<DgvRow> Rows(int limit = 200)
    {
        var grid = GridElement;
        if (grid is null) return [];
        return new WinFormsGrid(grid)
            .Rows(limit)
            .Where(r => !r.IsEmpty && Txt.Int(r.At(Col.No)) is not null)
            .ToList();
    }

    /// <summary>
    /// Đếm dòng KHÔNG đọc ô — chỉ đếm phần tử con của lưới (kể cả dòng tiêu đề).
    ///
    /// <para>Dùng cho dòng trạng thái in ra mỗi bước probe: <see cref="Rows"/> đọc giá trị
    /// TỪNG Ô của 86 dòng, mỗi lần gọi tốn hàng chục giây qua cầu MSAA — in nó hai lần cho
    /// mỗi bước đã làm một lượt probe chạy 15 phút và bị runner kill giữa chừng (2026-08-27).</para>
    /// </summary>
    public int RawRowCount()
    {
        var grid = GridElement;
        if (grid is null) return 0;
        try { return new WinFormsGrid(grid).RowElements().Count; }
        catch { return -1; }
    }

    /// <summary>Dòng tiêu đề đọc theo GIÁ TRỊ ô — mốc duy nhất để biết header thật là gì.</summary>
    public IReadOnlyList<string> HeaderRowCells()
    {
        var grid = GridElement;
        if (grid is null) return [];
        var first = new WinFormsGrid(grid).Rows(1).FirstOrDefault();
        if (first is null) return [];
        return Txt.Int(first.At(Col.No)) is null ? first.Cells : [];
    }

    /// <summary>Cột 「名称」 của các dòng đang nhìn thấy — mốc để so hai lần nạp list.</summary>
    public IReadOnlyList<string> VisibleNames(int limit = 200) =>
        Rows(limit).Select(r => r.At(Col.Name)).ToList();

    /// <summary>Cột 「№」 của các dòng đang nhìn thấy.</summary>
    public IReadOnlyList<string> VisibleNos(int limit = 200) =>
        Rows(limit).Select(r => r.At(Col.No)).ToList();

    /// <summary>
    /// AutomationId của phần tử đang giữ con trỏ. 「Yes」/「No」/「OK」 ⇒ có hộp thoại chắn
    /// (PROBE-GUIDELINE 3.4), không phải app sai.
    /// </summary>
    public string FocusedId()
    {
        try
        {
            var el = _app.Automation.FocusedElement();
            var id = Uia.AutomationIdOf(el);
            return id.Length > 0 ? id : $"(name=「{Uia.NameOf(el)}」)";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    // ── Mở tab ──────────────────────────────────────────────────────────────

    /// <summary>Đưa cửa sổ 診療入力 lên foreground — SendInput bắn vào cửa sổ ĐANG focus.</summary>
    public void FocusScreen()
    {
        try
        {
            Uia.ForceForeground(Window.Properties.NativeWindowHandle.Value);
            Window.Focus();
        }
        catch { /* cửa sổ vừa đổi trạng thái; bước sau sẽ lộ ra */ }
        Waits.Step();
    }

    /// <summary>Cửa sổ đang foreground — SendInput chỉ tới được cửa sổ này.</summary>
    public string ForegroundInfo()
    {
        try
        {
            var fg = GetForegroundWindow();
            var app = Window.Properties.NativeWindowHandle.Value;
            var sb = new System.Text.StringBuilder(256);
            GetWindowText(fg, sb, sb.Capacity);
            return $"hwnd={fg} 「{sb}」 {(fg == app ? "= 診療入力 ✔" : "≠ 診療入力 ✘ (phím sẽ rơi vào cửa sổ này)")}";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

    /// <summary>Nút 「Ｆ４ ガイド」 trên thanh phím (lớp thường).</summary>
    public AutomationElement? F4Button => Uia.ById(Window, "btnF4");

    /// <summary>
    /// F4 通常 — <c>KeyFunc(F4)</c> (frm203002.cs:4698): SSTab1.SelectedIndex = 1,
    /// <c>getGuidNyuryokuInfo2(bolStepPass: true)</c> ⇒ ẨN 前回/リセット, rồi
    /// <c>txtGuid1Sel.Focus()</c>.
    ///
    /// <para>ĐO ĐƯỢC 2026-08-27: đường này <b>ăn</b> — từ trạng thái tab ガイド đang đóng
    /// (lưới vắng mặt, con trỏ nằm trong lưới 処置), một phím F4 mở tab, nạp 86 dòng và
    /// đưa con trỏ về <c>txtGuid1Sel</c> với № = 1.</para>
    ///
    /// <para>⚠️ Lượt đo ĐẦU TIÊN kết luận ngược lại — 「F4 không ăn, phải bấm nút btnF4」.
    /// Đó là <b>lỗi của bộ test</b>, không phải của app: <c>Uia.SendKey</c> khai sai layout
    /// <c>INPUT</c> nên <c>SendInput</c> trả 0 và KHÔNG gửi gì cả. Sửa ở
    /// <c>Infrastructure/Uia.cs</c>. Bài học: phím 「không ăn」 thì kiểm giá trị trả về của
    /// <c>SendKey</c> TRƯỚC khi ghi vào README rằng WinForm nuốt phím.</para>
    /// </summary>
    public void OpenRegular()
    {
        FocusScreen();
        Uia.SendKey(Vk.F4);
        SettleAfterGuideLoad();
    }

    /// <summary>
    /// F4 通常 — đi bằng NÚT 「Ｆ４ ガイド」 trên thanh phím thay vì phím.
    ///
    /// <para>Cùng đích đến: <c>btnF_Click</c> → <c>btnF4_Click</c> (BaseForm.cs:707),
    /// đúng hàm mà phím F4 gọi. Khác ở chỗ không phụ thuộc cửa sổ nào đang foreground.</para>
    /// </summary>
    public bool OpenRegularByButton()
    {
        var btn = F4Button;
        if (btn is null) return false;
        Uia.Click(btn);
        SettleAfterGuideLoad();
        return true;
    }

    /// <summary>F4 通常 — click CHUỘT THẬT lên nút 「Ｆ４ ガイド」 (app không nhận InvokePattern).</summary>
    public bool OpenRegularByPhysicalClick()
    {
        var btn = F4Button;
        if (btn is null) return false;
        var rect = Uia.RectOf(btn);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0) return false;
        var (x, y) = Uia.Center(btn);
        Uia.LeftClickPhysical(x, y);
        SettleAfterGuideLoad();
        return true;
    }

    /// <summary>
    /// Chọn thẳng tab 「ガイド」 trên <c>SSTab1</c>.
    ///
    /// <para>⚠️ ĐÂY LÀ ĐƯỜNG KHÁC: <c>SSTab1_SelectedIndexChanged</c> (frm203002.cs:7071)
    /// gọi <c>getGuidNyuryokuInfo</c> — hàm KHÔNG có tham số chế độ, luôn ẩn
    /// 前回/リセット và đánh số lại từ <c>ImpMstTrt.getInpGuidNyuryokuData</c>. F4 thì
    /// gọi <c>getGuidNyuryokuInfo2</c>. Dùng đường này chỉ để MỞ TAB xem cấu trúc, đừng
    /// dùng nó thay F4 khi đang đo chế độ.</para>
    /// </summary>
    public bool OpenTabByTabItem()
    {
        var tab = Waits.TryFor(
            () => Window.FindFirstDescendant(cf =>
                      cf.ByControlType(ControlType.TabItem).And(cf.ByName(Loc("guideTabItem")))),
            TimeSpan.FromSeconds(3));
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
        SettleAfterGuideLoad();
        return true;
    }

    /// <summary>Tab ガイド đã mở chưa — mốc là lưới hfgGuid1 có mặt trong cây UIA.</summary>
    public bool TabOpen() => GridElement is not null;

    /// <summary>
    /// Rời khỏi tab ガイド (chọn tab 病検) để phép đo 「đường nào mở được tab」 có nghĩa.
    ///
    /// <para>Bắt buộc gọi trước khi thử các đường mở: app giữ nguyên tab đang chọn giữa hai
    /// lượt chạy, nên nếu tab ガイド đã mở sẵn thì đường ĐẦU TIÊN thử luôn được ghi là
    /// 「ăn」 — kể cả khi nó không làm gì cả. Đã đọc nhầm đúng một lượt vì chuyện này
    /// (2026-08-27).</para>
    ///
    /// <para>⚠️ Đi sang 病検 chứ TUYỆT ĐỐI KHÔNG sang 個別: lưới 個別 giữ nguyên master
    /// ~1.7k dòng, và cầu MSAA dựng phần tử cho từng dòng ⇒ mọi
    /// <c>FindFirstDescendant</c> sau đó quét cả ngần ấy node và <b>timeout</b>. Đã vấp
    /// thật 2026-08-27: testcase đỏ với <c>COMException: Operation timed out</c> ngay ở
    /// câu hỏi đầu tiên, trong khi ảnh chụp cho thấy app hoàn toàn khoẻ.</para>
    /// </summary>
    public bool LeaveGuideTab()
    {
        var tab = Waits.TryFor(
            () => Window.FindFirstDescendant(cf =>
                      cf.ByControlType(ControlType.TabItem).And(cf.ByName(Loc("byoukenTabItem")))),
            TimeSpan.FromSeconds(3));
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
        Thread.Sleep(500);
        return !TabOpen();
    }

    /// <summary>
    /// STEP đường CHẮC CHẮN: lật lớp phím bằng <c>btnShift</c> rồi bấm <c>btnF4_S</c>.
    /// Cả hai đều đi vào <c>btnF4_Click</c> với <c>ShiftFlg == true</c>.
    /// </summary>
    public bool OpenStepByShiftButton()
    {
        var shiftBtn = Uia.ById(Window, "btnShift");
        var f4S = Uia.ById(Window, "btnF4_S");

        // Lớp shift chưa hiện thì btnF4_S không có trong cây UIA — lật lớp trước.
        if (f4S is null || !IsButtonShown(f4S))
        {
            if (shiftBtn is null) return false;
            Uia.Click(shiftBtn);
            Waits.Step();
            f4S = Waits.TryFor(() => Uia.ById(Window, "btnF4_S"), TimeSpan.FromSeconds(3));
        }
        if (f4S is null) return false;

        Uia.Click(f4S);
        SettleAfterGuideLoad();
        return true;
    }

    /// <summary>
    /// STEP đường NGƯỜI DÙNG: giữ Shift (KeyDown ShiftKey → <c>editButtonPanel(true)</c>,
    /// BaseForm.cs:613) rồi gõ F4, thả Shift.
    /// </summary>
    public void OpenStepByShiftChord()
    {
        FocusScreen();
        FlaUI.Core.Input.Keyboard.Pressing(FlaUI.Core.WindowsAPI.VirtualKeyShort.SHIFT);
        try
        {
            Uia.SendKey(Vk.F4);
            Thread.Sleep(400);
        }
        finally
        {
            FlaUI.Core.Input.Keyboard.Release(FlaUI.Core.WindowsAPI.VirtualKeyShort.SHIFT);
        }
        SettleAfterGuideLoad();
    }

    /// <summary>Trả lớp phím về lớp thường (nếu đang ở lớp shift).</summary>
    public void ResetShiftLayer()
    {
        var f4S = Uia.ById(Window, "btnF4_S");
        if (f4S is null || !IsButtonShown(f4S)) return;
        var shiftBtn = Uia.ById(Window, "btnShift");
        if (shiftBtn is null) return;
        Uia.Click(shiftBtn);
        Waits.Step();
    }

    /// <summary>Bấm 「全て表示」 — <c>getGuidNyuryokuInfo2(true, false, true)</c>.</summary>
    public bool ClickAll() => ClickIfShown(AllButton);

    /// <summary>Bấm 「前回」 — <c>getGuidNyuryokuInfo2(false, true, false)</c>.</summary>
    public bool ClickPrv() => ClickIfShown(PrvButton);

    /// <summary>
    /// Bấm 「リセット」 — chỉ để ĐỌC câu Q00100. Trả lời 「はい」 là GHI DB
    /// (<c>StepReset</c>), nên người gọi phải dẹp hộp thoại bằng キャンセル/いいえ.
    /// </summary>
    public bool ClickReset() => ClickIfShown(ResetButton);

    /// <summary>
    /// Bấm một nút của tab ガイド bằng CHUỘT THẬT.
    ///
    /// <para>⚠️ KHÔNG dùng <see cref="Uia.Click"/> (Invoke) cho ba nút này. Invoke là lời
    /// gọi ĐỒNG BỘ: nó chờ handler chạy xong, mà handler của 「リセット」 mở
    /// <c>MsgDialog.ShowOKCancelMsg</c> — một MessageBox modal — nên Invoke KHÔNG BAO GIỜ
    /// trả về và lời gọi COM chết với <c>TimeoutException: UIA Timeout</c>. Đã vấp thật
    /// 2026-08-27: probe đỏ ở bước bấm リセット, đọc log thì tưởng nút hỏng, xem ảnh mới
    /// thấy hộp thoại 「該当部位の治療進行状態をリセットします。よろしいですか？」 đang mở
    /// rành rành. Sự kiện chuột thì bơm vào hàng đợi rồi trả về ngay.</para>
    /// </summary>
    private bool ClickIfShown(AutomationElement? button)
    {
        if (!IsButtonShown(button)) return false;
        var rect = Uia.RectOf(button!);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0) return false;
        var (x, y) = Uia.Center(button!);
        Uia.LeftClickPhysical(x, y);
        SettleAfterGuideLoad();
        return true;
    }

    /// <summary>
    /// Nghỉ sau một lần nạp list ガイド.
    ///
    /// <para><c>getGuidNyuryokuInfo2</c> chạy đồng bộ trên luồng UI (mở kết nối, query,
    /// gán DataSource) nên không có mốc bất đồng bộ nào để chờ; nhưng list rỗng thì nó
    /// bung MessageBox E00024 và MessageBox CHẶN luồng UI ⇒ mọi phép đọc UIA sau đó
    /// treo tới khi hộp thoại được dẹp. Vì vậy chỉ nghỉ một nhịp cố định ở đây và để
    /// người gọi tự quyết định đọc hộp thoại hay đọc lưới.</para>
    /// </summary>
    private void SettleAfterGuideLoad()
    {
        Thread.Sleep(700);
        Waits.Step();
    }

    // ── Ô 選択№ ─────────────────────────────────────────────────────────────

    /// <summary>Đặt con trỏ vào ô 選択№ (click chuột — app không nhận InvokePattern).</summary>
    public void FocusSelNo()
    {
        var box = SelNoBoxOrNull;
        if (box is null) return;
        var rect = Uia.RectOf(box);
        if (rect is null || rect.Value.Width <= 0) return;
        var (x, y) = Uia.Center(box);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    /// <summary>
    /// Gõ vào ô 選択№ bằng PHÍM THẬT.
    ///
    /// <para>KHÔNG dùng <c>ValuePattern.SetValue</c>: <c>txtGuid1Sel</c> là
    /// <c>CustomTextBox</c> và mọi hành vi cần đo (lọc ký tự, ↑/↓, Enter) treo ở
    /// <c>KeyDown</c>/<c>KeyPress</c> — SetValue không sinh phím nào cả.</para>
    /// </summary>
    public void TypeSelNo(string text)
    {
        FocusSelNo();
        ClearSelNo();
        FlaUI.Core.Input.Keyboard.Type(text);
        Waits.Step();
    }

    /// <summary>Xoá sạch ô 選択№ bằng Ctrl+A + Delete (vẫn là phím thật).</summary>
    public void ClearSelNo()
    {
        FlaUI.Core.Input.Keyboard.TypeSimultaneously(
            FlaUI.Core.WindowsAPI.VirtualKeyShort.CONTROL,
            FlaUI.Core.WindowsAPI.VirtualKeyShort.KEY_A);
        FlaUI.Core.Input.Keyboard.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.DELETE);
        Waits.Step();
    }

    /// <summary>
    /// Gửi một phím và trả lời được câu 「có gửi đi thật không」.
    ///
    /// <para><see cref="Uia.SendKey"/> trả false khi <c>SendInput</c> không chèn được sự
    /// kiện nào. Phân biệt 「không gửi được」 với 「app không phản ứng」 là bắt buộc —
    /// nhầm hai cái đó đã tốn một lượt probe (xem <c>Uia.Win32.INPUT</c>).</para>
    /// </summary>
    public static bool SendKey(ushort vk) => Uia.SendKey(vk);

    /// <summary>Enter trên ô 選択№ — <c>txtGuid1Sel_KeyDown</c> (frm203002.cs:6726).</summary>
    public bool PressEnterOnSelNo()
    {
        var sent = Uia.SendKey(Vk.Enter);
        Thread.Sleep(900);
        return sent;
    }

    /// <summary>↑ / ↓ trên ô 選択№ — ScrollRowUp / ScrollRowDown.</summary>
    public bool PressArrowOnSelNo(bool down)
    {
        var sent = Uia.SendKey(down ? Vk.Down : Vk.Up);
        Thread.Sleep(400);
        return sent;
    }

    // ── Lưới ガイド ─────────────────────────────────────────────────────────

    /// <summary>
    /// Click MỘT LẦN vào một dòng ガイド.
    ///
    /// <para>Một cú click là đủ: <c>hfgGuid1_Click</c> (frm203002.cs:6570) tự chuyển
    /// focus sang <c>txtGuid1Sel</c> rồi gọi <c>grdGuid_KeyDown(Return)</c> →
    /// <c>hfgGuid1_CellDoubleClick</c>. Khác tab パック, nơi WinForm đòi double-click.</para>
    /// </summary>
    public bool ClickRow(int index)
    {
        var rows = Rows();
        if (index < 0 || index >= rows.Count) return false;

        var cells = Uia.Children(rows[index].Element).ToList();
        var target = cells.Count > Col.Name ? cells[Col.Name] : rows[index].Element;
        var rect = Uia.RectOf(target);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0) return false;

        var (x, y) = Uia.Center(target);
        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(900);
        return true;
    }

    // ── Dialog frm203017 「ガイド処置選択」 ───────────────────────────────────

    /// <summary>
    /// Cửa sổ 「ガイド処置選択」 nếu đang mở.
    ///
    /// <para>⚠️ KHÔNG dùng <c>OchaApp.Window(id)</c>: hàm đó lọc <c>Uia.IsOnScreen</c>
    /// trên TỪNG cửa sổ, mà lúc frm203017 đang modal thì luồng UI của frm203002 bị chặn
    /// ⇒ đọc thuộc tính của nó ném, <c>try/catch</c> bọc cả vòng lặp nuốt lỗi và trả về
    /// DANH SÁCH RỖNG. ĐO ĐƯỢC 2026-08-27: dialog hiện rành rành trong ảnh, focus đang
    /// nằm ở ô 「回数 Row 0」 CỦA NÓ, mà <c>Dialog()</c> vẫn trả null. Đây đúng là cái bẫy
    /// đã ghi ở <see cref="ModalDialogs"/>.</para>
    ///
    /// <para>Đi hai đường: <c>Window.ModalWindows</c> của chính cửa sổ chủ (API dành đúng
    /// cho việc này), rồi <c>GetAllTopLevelWindows</c> KHÔNG kèm lọc IsOnScreen. Nhận
    /// dạng theo AutomationId <c>frm203017</c> HOẶC tiêu đề 「ガイド処置選択」 — trên máy
    /// thật tiêu đề là mốc chắc hơn.</para>
    /// </summary>
    public Window? Dialog()
    {
        foreach (var w in DialogCandidates())
        {
            try
            {
                if (Uia.AutomationIdOf(w) == Loc("guideDialog")) return w;
                if (Txt.Has(Uia.NameOf(w), DialogTitle)) return w;
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return null;
    }

    /// <summary>Tiêu đề dialog — <c>frm203017._title</c> (frm203017.cs:77).</summary>
    public const string DialogTitle = "ガイド処置選択";

    private IEnumerable<Window> DialogCandidates()
    {
        Window[] modal;
        try { modal = Window.ModalWindows; } catch { modal = []; }
        foreach (var w in modal) yield return w;

        Window[] top;
        try { top = _app.Application.GetAllTopLevelWindows(_app.Automation); } catch { top = []; }
        foreach (var w in top) yield return w;
    }

    /// <summary>Chờ dialog mở; hết giờ trả null (KHÔNG ném — nhánh rỗng tự đóng là hợp lệ).</summary>
    public Window? WaitDialog(TimeSpan? timeout = null) =>
        Waits.TryFor(() => Dialog(), timeout ?? TimeSpan.FromSeconds(8));

    /// <summary>Dialog có đang mở không.</summary>
    public bool DialogOpen()
    {
        var d = Dialog();
        try { return d is not null && Uia.IsOnScreen(d); }
        catch { return false; }
    }

    /// <summary>「ガイド番号」 trên header dialog — <c>txtGuidNo</c> (frm203017.cs:428).</summary>
    public string DialogGuidNo(Window dialog) => ReadBox(dialog, Loc("guideDialogNo"));

    /// <summary>Tên ガイド trên header dialog — <c>txtGuidNm</c>.</summary>
    public string DialogGuidNm(Window dialog) => ReadBox(dialog, Loc("guideDialogNm"));

    /// <summary>Nhãn 「ガイド番号」 — <c>lblName</c> (frm203017.Designer.cs:110).</summary>
    public string DialogNameLabel(Window dialog)
    {
        var el = Uia.ById(dialog, Loc("guideDialogNameLabel"));
        return el is null ? "(không thấy lblName)" : Txt.N(Uia.NameOf(el));
    }

    /// <summary>Lưới 処置 của dialog.</summary>
    public WinFormsGrid? DialogGrid(Window dialog)
    {
        var el = Uia.ById(dialog, Loc("guideDialogGrid"));
        return el is null ? null : new WinFormsGrid(el);
    }

    /// <summary>
    /// ĐÓNG DIALOG BẰNG F10 戻る. TUYỆT ĐỐI KHÔNG Escape — trên frm203017 Escape gọi
    /// <c>btnF9_Click</c>, tức 確定 (frm203017.cs:180-182).
    /// </summary>
    /// <param name="byKey">
    /// true = gửi PHÍM F10; false (mặc định) = bấm NÚT 「Ｆ１０ 戻る」.
    ///
    /// <para>⚠️ Mặc định là NÚT, có lý do đo được: phím F10 của Windows còn kích hoạt
    /// <b>thanh menu</b> của cửa sổ đứng sau. ĐO ĐƯỢC 2026-08-27 — đóng dialog bằng phím
    /// F10 xong thì con trỏ đọc ra <c>MenuBar</c>, còn đóng bằng nút thì đọc ra
    /// <c>txtGuid1Sel</c> đúng như <c>hfgGuid1_CellDoubleClick</c> hứa. Testcase nào đo
    /// 「con trỏ quay về ô 選択№」 mà đóng bằng phím sẽ đỏ vì chính cái phím nó gửi.</para>
    /// </param>
    public bool CloseDialogWithF10(bool byKey = false)
    {
        var dialog = Dialog();
        if (dialog is null) return true;

        if (byKey)
        {
            try { dialog.Focus(); } catch { /* dialog vừa đóng */ }
            Uia.SendKey(Vk.F10);
            Thread.Sleep(600);
            if (!DialogOpen()) return true;
        }

        var btn = Uia.ByIdOrName(dialog, "btnF10", "戻る", ControlType.Button);
        if (btn is not null)
        {
            Uia.Click(btn);
            Thread.Sleep(600);
            if (!DialogOpen()) return true;
        }

        // Còn mở thì mới tới phím — F10 làm bẩn focus nên để cuối cùng.
        try { dialog.Focus(); } catch { }
        Uia.SendKey(Vk.F10);
        Thread.Sleep(600);
        return !DialogOpen();
    }

    private static string ReadBox(Window dialog, string id)
    {
        var el = Uia.ById(dialog, id);
        return el is null ? $"(không thấy {id})" : Txt.N(Uia.ValueOf(el));
    }

    private static string Loc(string key) => TestSettings.Current.Locator(key);
}
