using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientSelectAssign;

/// <summary>
/// Lái 患者確定 của <c>frm203001</c> và ĐỌC KẾT QUẢ — không assert gì ở đây.
///
/// <para>Mỗi lần 患者確定 chỉ có ba kết cục, và cả ba đều phải phân biệt được bằng
/// quan sát chứ không bằng suy đoán:</para>
/// <list type="number">
///   <item><description>bung MessageBox cảnh báo (E00002 / E00005 / E00027) và Ở LẠI 患者選択;</description></item>
///   <item><description>mở được màn 処置入力 <c>frm203002</c>;</description></item>
///   <item><description>không xảy ra gì cả (ô rỗng ⇒ <c>defData</c> <c>return</c> ngay, frm203001.cs:651).</description></item>
/// </list>
///
/// <para><b>Vì sao phải chờ CẢ HAI mốc cùng lúc.</b> Chờ hộp thoại trước rồi mới chờ
/// cửa sổ thì nhánh 「mở được màn」 phải đợi hết timeout của nhánh hộp thoại — mỗi
/// testcase xanh tốn thêm hàng chục giây. Và ngược lại, chờ cửa sổ trước thì nhánh
/// bị chặn cũng vậy. <see cref="ConfirmAndObserve"/> quay một vòng poll DUY NHẤT hỏi
/// cả hai.</para>
/// </summary>
public sealed class PatientSelectFlow
{
    private readonly OchaApp _app;
    private readonly TestSettings _settings;

    public PatientSelectFlow(OchaApp app, TestSettings settings)
    {
        _app = app;
        _settings = settings;
    }

    public PatientSelectScreen Screen { get; private set; } = null!;

    /// <summary>Mở (hoặc bám lại) màn 患者選択 và dựng screen object.</summary>
    public PatientSelectScreen Open()
    {
        var window = AppNavigator.OpenPatientSelect(_app, _settings);
        Screen = new PatientSelectScreen(window, _app.Automation);
        return Screen;
    }

    // ── 患者確定 ─────────────────────────────────────────────────────────────

    /// <summary>Kết cục của một lần 患者確定.</summary>
    public sealed record ConfirmResult(
        string? DialogText,
        Window? DialogWindow,
        Window? DetailWindow)
    {
        /// <summary>Bị chặn — có hộp thoại cảnh báo và KHÔNG sang màn chi tiết.</summary>
        public bool Blocked => DialogWindow is not null && DetailWindow is null;

        /// <summary>Mở được 処置入力.</summary>
        public bool Opened => DetailWindow is not null;

        /// <summary>Không hộp thoại, không điều hướng — <c>defData</c> đã <c>return</c> im lặng.</summary>
        public bool Silent => DialogWindow is null && DetailWindow is null;

        public override string ToString() =>
            Opened ? "MỞ ĐƯỢC 処置入力"
            : Blocked ? $"BỊ CHẶN 「{Txt.N(DialogText ?? "")}」"
            : "IM LẶNG (không hộp thoại, không điều hướng)";
    }

    /// <summary>
    /// Bấm phím 確定 rồi chờ tới khi một trong hai mốc xuất hiện.
    ///
    /// <para><paramref name="confirm"/> là thao tác 確定 (End / F9 / Enter trên lưới) —
    /// truyền vào để cùng một vòng quan sát dùng lại được cho mọi cửa vào.</para>
    /// </summary>
    public ConfirmResult ConfirmAndObserve(Action confirm, TimeSpan? timeout = null)
    {
        // DỌN SẠCH hộp thoại còn sót TRƯỚC KHI bấm.
        //
        // Không có bước này thì vòng quan sát bên dưới có thể bắt được hộp thoại của
        // testcase TRƯỚC và báo cáo nội dung của nó. Đã vấp thật 2026-08-26 (probe lượt
        // 4): KQ-7 để lại E00005, thế là KQ-8 và KQ-5 cùng báo 「患者情報が登録されて
        // いません。」 — cả hai đều SAI, mà log thì trông y như app đang chặn nhầm chỗ.
        var stale = DrainDialogs();
        if (stale.Count > 0)
            throw new InvalidOperationException(
                "Còn hộp thoại đang mở TRƯỚC khi 患者確定, đã đóng chúng nhưng testcase " +
                "trước đã để lại trạng thái bẩn: " + string.Join(" / ", stale.Select(t => $"「{t}」")) +
                ". Mỗi testcase phải tự dọn hộp thoại của mình.");

        confirm();

        var deadline = DateTime.UtcNow +
            (timeout ?? TimeSpan.FromSeconds(Math.Max(_settings.Run.DefaultTimeoutSeconds, 20)));

        while (DateTime.UtcNow < deadline)
        {
            var detail = _app.Window("frm203002");
            if (detail is not null)
                return new ConfirmResult(null, null, detail);

            var dialog = FirstDialog();
            if (dialog is not null)
                return new ConfirmResult(Dialogs.TextOf(dialog), dialog, null);

            Thread.Sleep(Waits.PollInterval);
        }

        // Hết giờ mà không thấy gì: đây là nhánh 「im lặng」 hợp lệ (ô 患者番号 rỗng),
        // NHƯNG cũng là hình dạng của một app đang treo. Người đọc log cần biết cả hai.
        return new ConfirmResult(null, null, null);
    }

    /// <summary>
    /// Hộp thoại cảnh báo đang mở, nếu có.
    ///
    /// <para>Dùng <see cref="ModalDialogs"/> chứ không <see cref="Dialogs.Open"/>: hộp
    /// thoại của <c>MsgDialog.ShowWarningMsg</c> là MODAL và chặn luôn message pump của
    /// frm203001, lúc đó phép quét theo desktop có thể trả về rỗng.</para>
    /// </summary>
    public Window? FirstDialog()
    {
        // Quét theo tiến trình — ĐÚNG đường mà các luồng khác trong repo đã dùng chạy
        // được (TrnCheck đọc W00100 kiểu này). ModalDialogs chỉ là đường dự phòng.
        //
        // KHÔNG nuốt ngoại lệ thành null: bản trước làm vậy và phép kiểm 「đã đóng
        // chưa」 thành ra XANH SAI mỗi khi UIA hiccup dưới hộp thoại modal — hộp thoại
        // vẫn nằm đó, còn testcase sau thì đọc phải nội dung của nó (probe lượt 7).
        var open = Dialogs.Open(_app.Automation, _app.ProcessId);
        if (open.Count > 0) return open[0];

        var owner = Screen?.IsShowing() == true ? Screen.Window : null;
        var modal = ModalDialogs.All(_app, owner);
        return modal.Count > 0 ? modal[0] : null;
    }

    /// <summary>Đóng mọi hộp thoại đang mở bằng OK; trả về nguyên văn từng câu đã đóng.</summary>
    public IReadOnlyList<string> DrainDialogs(int max = 5)
    {
        var seen = new List<string>();
        for (var i = 0; i < max; i++)
        {
            var dialog = FirstDialog();
            if (dialog is null) break;

            var text = Txt.N(Dialogs.TextOf(dialog));
            seen.Add(text);

            // Hộp thoại CLR 「Unhandled exception…」 có nút Continue / Quit chứ không có
            // OK — bấm Quit là đóng cả app. Xem ghi chú ở ReturnToPatientSelect.
            if (text.Contains("Unhandled exception") || text.Contains("Continue"))
            {
                if (!Dialogs.ClickButtonContaining(dialog, "Continue", "続行"))
                    Dialogs.ClickButton(dialog, "Continue", "続行");
                Waits.Step();
                continue;
            }

            // Hộp thoại của MsgDialog là MessageBox 「お茶コン」 một nút OK (đã xem ảnh
            // 2026-08-26). DismissOk tự bấm OK, không được thì Close(), rồi CHỜ tới khi
            // nó thật sự biến mất — ném nếu không.
            try
            {
                Dialogs.DismissOk(dialog, TimeSpan.FromSeconds(10));
            }
            catch (Exception e)
            {
                DismissByKeyboard(dialog);
                if (Dialogs.IsAlive(dialog)) ClickOkByCoordinates(dialog);
                if (Dialogs.IsAlive(dialog))
                    throw new InvalidOperationException(
                        $"Không đóng được hộp thoại 「{text}」 ({e.GetType().Name}). Nó chắn mọi " +
                        "thao tác sau đó và mọi phép đọc tiếp theo sẽ lấy phải nội dung của " +
                        "chính nó (PROBE-GUIDELINE 3.4). Mở ảnh trong artifacts\\screenshots ra xem.", e);
            }
            Waits.Step();
        }
        return seen;
    }

    /// <summary>
    /// Bấm OK bằng CLICK CHUỘT THEO TOẠ ĐỘ — đường cuối cùng.
    ///
    /// <para>Đo 2026-08-26 (probe lượt 8): MessageBox 「お茶コン」 của
    /// <c>MsgDialog.ShowWarningMsg</c> KHÔNG đóng được bằng <c>Dialogs.ClickButton</c>
    /// (InvokePattern), <c>Window.Close()</c>, lẫn Enter/Esc — dù ảnh chụp cho thấy nó
    /// là MessageBox một nút OK hoàn toàn bình thường. Cùng họ với cái bẫy
    /// GradientButton mà repo đã gặp: control vẽ tay không nhận Invoke, phải click thật.</para>
    ///
    /// <para>Ưu tiên toạ độ CỦA CHÍNH nút nếu đọc được; không thì suy từ khung hộp
    /// thoại — nút OK của MessageBox nằm giữa theo chiều ngang, cách đáy ~18%.</para>
    /// </summary>
    private static void ClickOkByCoordinates(Window dialog)
    {
        try
        {
            var button = dialog.FindAllDescendants()
                .FirstOrDefault(e => Uia.ControlTypeOf(e) == FlaUI.Core.Definitions.ControlType.Button);
            if (button is not null && Uia.RectOf(button) is { Width: > 0 })
            {
                var (bx, by) = Uia.Center(button);
                Uia.LeftClickPhysical(bx, by);
                Waits.Step();
                if (!Dialogs.IsAlive(dialog)) return;
            }

            var rect = Uia.RectOf(dialog);
            if (rect is not { Width: > 0, Height: > 0 }) return;

            var x = rect.Value.Left + rect.Value.Width / 2;
            var y = rect.Value.Top + (int)(rect.Value.Height * 0.82);
            Uia.LeftClickPhysical(x, y);
            Waits.Step();
        }
        catch { /* đây đã là đường cuối; hỏng thì để lời than ở DrainDialogs nói tiếp */ }
    }

    /// <summary>
    /// Đóng hộp thoại bằng BÀN PHÍM khi không click được nút.
    ///
    /// <para>Đo 2026-08-26 (probe lượt 5-9): hộp thoại của <c>MsgDialog.ShowWarningMsg</c>
    /// không đóng được bằng <c>Dialogs.ClickButton</c> (InvokePattern) lẫn
    /// <c>Window.Close()</c>, nên nó nằm lại và mọi lần đọc SAU đó lấy phải nội dung CŨ.
    /// Đúng cái bẫy PROBE-GUIDELINE 3.4, chỉ khác là thứ chắn màn hình là hộp thoại của
    /// chính testcase trước.</para>
    ///
    /// <para>ĐÃ GỠ ĐƯỢC ở luồng TreatmentHeaderStaff: bấm bằng CHUỘT THẬT
    /// (<c>ClickButtonContaining</c>) thì đóng ngay. App không nhận InvokePattern ở bất
    /// kỳ control nào. Bàn phím giữ lại làm đường lùi cho hộp thoại không có nút đọc
    /// được.</para>
    ///
    /// <para>MessageBox một nút OK nhận cả <c>Enter</c> lẫn <c>Esc</c>; gửi lần lượt
    /// cả hai sau khi đã kéo hộp thoại lên foreground.</para>
    /// </summary>
    private static void DismissByKeyboard(Window dialog)
    {
        try { Uia.ForceForeground(dialog.Properties.NativeWindowHandle.ValueOrDefault); }
        catch { /* không lấy được handle thì phím vẫn đi vào cửa sổ đang focus */ }
        Waits.Step();

        Keyboard.Press(VirtualKeyShort.RETURN);
        Waits.Step();
        if (!Dialogs.IsAlive(dialog)) return;

        Keyboard.Press(VirtualKeyShort.ESCAPE);
        Waits.Step();
    }

    // ── Màn 処置入力 ─────────────────────────────────────────────────────────

    /// <summary>
    /// Nhãn Ｄｒ．trên header 処置入力.
    ///
    /// <para><b>Đọc NHÃN <c>lbDr</c>, không đọc combo.</b> <c>cboDr</c> trên frm203002
    /// bị ẩn (frm203002.cs:2478) và chỉ hiện ra khi click vào nhãn
    /// (<c>lbDr_Click</c>, frm203002.cs:8087); thứ người dùng nhìn thấy là
    /// <c>lbDr.Text = cboDr.Text</c> (frm203002.cs:427). Đây là chỗ WinForm khác hẳn
    /// bản web — bên đó header là một combobox luôn hiện.</para>
    /// </summary>
    public string DetailDoctorLabel(Window detail)
        => Txt.N(Uia.ValueOf(Uia.RequireById(detail, TestSettings.Current.Locator("detailDrLabel"))));

    public string DetailHygienistLabel(Window detail)
        => Txt.N(Uia.ValueOf(Uia.RequireById(detail, TestSettings.Current.Locator("detailStaffLabel"))));

    /// <summary>
    /// Ｄｒ．trong COMBO <c>cboDr</c> của header 処置入力 — KHÁC nhãn
    /// <see cref="DetailDoctorLabel"/>, và hai cái này CÓ THỂ ra hai người khác nhau.
    ///
    /// <para>WinForm để hai control chồng chỗ: <c>lbDr</c> hiện 担当医 CỦA DÒNG con trỏ
    /// đang đứng (<c>Chg_DrName</c> đọc cột 69 của dòng, modMain.cs:2125-2138), còn
    /// <c>cboDr</c> giữ 担当医 cho DÒNG THÊM MỚI và <c>Visible = false</c> cho tới khi
    /// người dùng click vào nhãn (<c>lbDr_Click</c>, frm203002.cs:8087). Muốn đọc combo
    /// thì phải click nhãn trước — y hệt bản web sau khi port Chg_DrName.</para>
    ///
    /// <para>Đây mới là con số bị đóng dấu xuống <c>TRNTRN.dr_no</c> khi F9 登録
    /// (<c>cboDr_SelectedValueChanged</c> → <c>ModCommon.pintDrNo</c>, frm203002.cs:8095),
    /// nên nó là mốc đáng so nhất giữa hai bản.</para>
    /// </summary>
    public string DetailDoctorCombo(Window detail)
    {
        var label = Uia.RequireById(detail, TestSettings.Current.Locator("detailDrLabel"));
        Uia.Click(label);
        Waits.Step();

        var combo = Uia.RequireById(detail, TestSettings.Current.Locator("detailDrCombo"));
        return Txt.N(Uia.ValueOf(combo));
    }

    /// <summary>
    /// Từ 処置入力 quay lại 患者選択 bằng <b>F10 戻る</b> (frm203002.cs:122).
    ///
    /// <para>Luồng này KHÔNG sửa gì trên lưới nên F10 lẽ ra đi thẳng. Nếu vẫn bung
    /// 「処置データは、変更されています。保存しますか？」 thì trả lời <b>いいえ</b> — trả lời
    /// はい là GHI THẬT xuống TRNTRN, thứ luồng này tuyệt đối không làm. Mọi câu gặp
    /// phải đều được trả về để testcase in ra log.</para>
    /// </summary>
    public IReadOnlyList<string> ReturnToPatientSelect(Window detail, TimeSpan? timeout = null)
    {
        var answered = new List<string>();

        try { Uia.ForceForeground(detail.Properties.NativeWindowHandle.ValueOrDefault); }
        catch { /* bỏ qua */ }

        Keyboard.Press(VirtualKeyShort.F10);
        Waits.Step();

        var deadline = DateTime.UtcNow +
            (timeout ?? TimeSpan.FromSeconds(Math.Max(_settings.Run.DefaultTimeoutSeconds, 30)));

        while (DateTime.UtcNow < deadline)
        {
            var back = _app.Window("frm203001");
            if (back is not null)
            {
                Screen = new PatientSelectScreen(back, _app.Automation);
                return answered;
            }

            var dialog = FirstDialog();
            if (dialog is not null)
            {
                var text = Txt.N(Dialogs.TextOf(dialog));
                answered.Add(text);

                // Hộp thoại CLR 「Unhandled exception has occurred…」 có nút Continue /
                // Quit chứ KHÔNG có はい/いいえ. Đo được 2026-08-26 (PROBE KQ-10): F10 戻る
                // của frm203002 ném 「Index was out of range」 và bung đúng hộp này. Bấm
                // Quit là đóng cả app; phải bấm Continue thì phiên mới sống tiếp.
                var isClrCrash = text.Contains("Unhandled exception") || text.Contains("Continue");
                var clicked = isClrCrash
                    ? Dialogs.ClickButtonContaining(dialog, "Continue", "続行") ||
                      Dialogs.ClickButton(dialog, "Continue", "続行")
                    // いいえ TRƯỚC — không bao giờ để rơi vào nhánh 保存.
                    : Dialogs.ClickButtonContaining(dialog, "いいえ", "No") ||
                      Dialogs.ClickButton(dialog, "いいえ", "No", "N");

                if (!clicked)
                    Dialogs.ClickButton(dialog, "OK", "はい", "Yes");
                Waits.Step();
            }

            Thread.Sleep(Waits.PollInterval);
        }

        throw new TimeoutException(
            "Bấm F10 戻る mà không quay được về 患者選択 (frm203001). " +
            (answered.Count == 0
                ? "Không có hộp thoại nào."
                : "Hộp thoại đã trả lời いいえ: " + string.Join(" / ", answered.Select(a => $"「{a}」"))));
    }
}
