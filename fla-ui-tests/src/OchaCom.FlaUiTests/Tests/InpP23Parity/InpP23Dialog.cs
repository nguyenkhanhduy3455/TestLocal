using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.InpP23Parity;

/// <summary>
/// Hai cặp màn còn lại của 診療入力 オプション:
/// <list type="bullet">
///   <item><c>frm203038</c>「自動算定一覧」 → <c>frm203039</c>「自動算定登録」</item>
///   <item><c>frm203036</c>「必要病名一覧」 → <c>frm203037</c>「必要病名登録」</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// DÙNG LẠI HELPER CỦA LUỒNG KarteAutoCalc — CÓ CHỦ Ý
/// ═══════════════════════════════════════════════════════════════════════════
/// <see cref="KarteAutoCalcMenu"/> và các helper của <see cref="KarteAutoCalcDialog"/>
/// (<c>FindChrome</c> / <c>FindDialogWindow</c> / <c>ClickModalOpener</c> /
/// <c>DescribeVisibleWindows</c>) đã mất BỐN vòng chạy trên máy Windows mới đúng.
/// Chép lại là chép lại luôn cả bốn lỗi:
///
///  1. <c>Uia.ById</c> duyệt SÂU → lún vào lưới 1.664 dòng → hết giờ UIA.
///  2. <c>Uia.Click</c> dùng InvokePattern → bị <c>ShowDialog()</c> chặn 20s.
///  3. Form 登録 là form CON, không phải cửa sổ top-level → phải lục cây cha.
///  4. Popup <c>#32768</c> là lớp CHUNG của Windows → không lọc processId thì
///     vớt cả menu của app khác đang mở.
///
/// Chỉ có thứ KHÁC nhau mới khai báo lại ở đây: id/tiêu đề form và mục menu.
/// </summary>
public static class InpP23Dialog
{
    // ── 自動算定 (cặp 2) ─────────────────────────────────────────────────────

    public const string ChkListId = "frm203038";
    public const string ChkListTitle = "自動算定一覧";
    public const string ChkRegisterId = "frm203039";
    public const string ChkRegisterTitle = "自動算定登録";

    /// <summary>Mục 「４ 自動算定登録」 của submenu オプション.</summary>
    public const string ChkMenuItemId = "IDM_ChkAuto";
    public const string ChkMenuItemText = "自動算定登録";

    // ── 必要病名 (cặp 3) ─────────────────────────────────────────────────────

    public const string DisListId = "frm203036";
    public const string DisListTitle = "必要病名一覧";
    public const string DisRegisterId = "frm203037";
    public const string DisRegisterTitle = "必要病名登録";

    /// <summary>Mục 「３ 必要病名登録」 của submenu オプション.</summary>
    public const string DisMenuItemId = "IDM_InpChk10";
    public const string DisMenuItemText = "必要病名登録";

    // ── Control ─────────────────────────────────────────────────────────────

    /// <summary>Lưới của <c>frm901003</c> — lớp cha của cả frm203038 lẫn frm203036.</summary>
    public const string ListGridId = "dgvView";

    public const string ListTrtCdBoxId = "txtTrtCd";
    public const string ListTrtNmBoxId = "txtTrtNm";
    public const string ListCountLabelId = "lblCount";
    public const string ListSearchButtonId = "btnSearch";

    /// <summary>
    /// Ô 算定処置コード / 枝番 / 名称 thứ n của frm203039 (n từ 1).
    /// Suy từ <c>INP.Lib.GetControl.getControl(pnlCon, controlType.cd, i + 1)</c>
    /// (frm203039.cs:239-241) — Tc0 đổ cây UIA để xác nhận trước khi tin.
    /// </summary>
    public static string ChkCdBox(int n) => $"txtCd{n}";
    public static string ChkSbBox(int n) => $"txtSb{n}";
    public static string ChkNmBox(int n) => $"txtNm{n}";

    /// <summary>Nhãn 算定処置コード thứ n — CLICK vào nhãn mới mở 処置検索 (frm203039.cs:148).</summary>
    public static string ChkCdLabel(int n) => $"lblCd{n}";

    /// <summary>Ô 病名コード / 病名 thứ n của frm203037 (n từ 1..20).</summary>
    public static string DisCdBox(int n) => $"txtDisCd{n}";
    public static string DisNmBox(int n) => $"txtDisNm{n}";

    /// <summary>Nhãn 病名コード thứ n — click mở 病名検索 (frm203037.cs:148).</summary>
    public static string DisCdLabel(int n) => $"lblDisCd{n}";

    /// <summary>Số ô của mỗi form 登録.</summary>
    public const int ChkSlotCount = 5;
    public const int DisSlotCount = 20;

    /// <summary>Cửa sổ tìm kiếm mà click nhãn mở ra.</summary>
    public const string TrtSearchId = "frm902011";
    public const string DisSearchId = "frm902010";

    // ── Virtual-key ─────────────────────────────────────────────────────────

    /// <summary>
    /// Ba mã phím mà <c>InpP1Dialogs.Vk</c> chưa có.
    ///
    /// <para>Khai báo tại đây thay vì thêm vào <c>Vk</c>: lớp đó thuộc luồng khác và
    /// đang chạy đúng — luật của repo là không sửa file của luồng khác, chỉ tham
    /// khảo. Ba hằng này lấy thẳng từ Winuser.h.</para>
    /// </summary>
    public const ushort VkTab = 0x09;
    public const ushort VkEnter = 0x0D;
    public const ushort VkEscape = 0x1B;

    // ── Mở / đóng ───────────────────────────────────────────────────────────

    /// <summary>F11 → オプション → mục <paramref name="menuItemText"/>.</summary>
    public static Window OpenList(
        OchaApp app, Window screen, string listId, string listTitle,
        string menuItemId, string menuItemText, TestTrace? trace = null)
    {
        var already = KarteAutoCalcDialog.FindDialogWindow(app, listId, listTitle, screen);
        if (already is not null)
        {
            trace?.Note($"dialog {listId} da mo san — dung lai");
            return already;
        }

        var opened = KarteAutoCalcMenu.OpenSentakuMenu(app, screen, trace);
        if (opened.Popup is null)
            throw new InvalidOperationException($"Khong mo duoc menu 選択: {opened.Reason}");

        if (!KarteAutoCalcMenu.ClickOptionSubItem(
                app, opened.Popup, menuItemId, menuItemText, out var why, trace))
            throw new InvalidOperationException($"Khong click duoc muc menu: {why}");

        var dialog = Waits.TryFor(
                () => KarteAutoCalcDialog.FindDialogWindow(app, listId, listTitle, screen),
                TestSettings.Current.Run.DefaultTimeout)
            ?? throw new InvalidOperationException(
                $"Click 「{menuItemText}」 xong nhung khong thay {listId}. Cua so dang hien:\n" +
                KarteAutoCalcDialog.DescribeVisibleWindows(app));

        KarteAutoCalcDialog.RequireChrome(
            dialog, ListGridId, skipId: null, TestSettings.Current.Run.DefaultTimeout);
        return dialog;
    }

    public static Window OpenChkList(OchaApp app, Window screen, TestTrace? trace = null) =>
        OpenList(app, screen, ChkListId, ChkListTitle, ChkMenuItemId, ChkMenuItemText, trace);

    public static Window OpenDisList(OchaApp app, Window screen, TestTrace? trace = null) =>
        OpenList(app, screen, DisListId, DisListTitle, DisMenuItemId, DisMenuItemText, trace);

    /// <summary>F9 選択 trên 一覧 → form 登録 (là form CON của 一覧).</summary>
    public static Window OpenRegister(
        OchaApp app, Window list, string registerId, string registerTitle, TestTrace? trace = null)
    {
        var already = KarteAutoCalcDialog.FindDialogWindow(app, registerId, registerTitle, list);
        if (already is not null) return already;

        trace?.Step($"F9 選択 → {registerId}");
        var f9 = KarteAutoCalcDialog.FindChrome(list, "btnF9", ListGridId)
            ?? throw new InvalidOperationException($"Khong thay btnF9 tren cua so {registerId} cha");

        try
        {
            var hwnd = list.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero) Uia.ForceForeground(hwnd);
        }
        catch { /* foreground la best-effort */ }

        KarteAutoCalcDialog.ClickModalOpener(f9, trace);
        Waits.Step();

        return Waits.TryFor(
                () => KarteAutoCalcDialog.FindDialogWindow(app, registerId, registerTitle, list),
                TestSettings.Current.Run.DefaultTimeout)
            ?? throw new InvalidOperationException(
                $"F9 xong nhung khong thay {registerId}. Cua so dang hien:\n" +
                KarteAutoCalcDialog.DescribeVisibleWindows(app));
    }

    /// <summary>F10 戻る. Chuột vật lý vì 戻る có thể hỏi 「破棄しますか？」.</summary>
    public static void Close(Window dialog)
    {
        var f10 = KarteAutoCalcDialog.FindChrome(dialog, "btnF10", ListGridId);
        if (f10 is not null) KarteAutoCalcDialog.ClickModalOpener(f10);
        else Uia.SendKey(InpP1Dialogs.Vk.F10);
        Waits.Step();
    }

    /// <summary>Đọc text của một ô, trả chuỗi rỗng khi không tìm thấy.</summary>
    public static string ReadBox(AutomationElement root, string automationId)
    {
        var el = KarteAutoCalcDialog.FindChrome(root, automationId, ListGridId);
        if (el is null) return "(khong thay control)";
        try { return Txt.N(Uia.ValueOf(el)); }
        catch (Exception e) { return $"(loi doc: {e.Message})"; }
    }
}
