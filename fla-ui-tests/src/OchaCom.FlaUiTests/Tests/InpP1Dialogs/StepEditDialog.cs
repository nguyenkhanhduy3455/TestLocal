using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

// Project bật UseWindowsForms (cần System.Drawing để chụp màn hình) nên `ComboBox` trùng
// tên với System.Windows.Forms.ComboBox. Ở đây luôn là ComboBox của UIA.
using ComboBox = FlaUI.Core.AutomationElements.ComboBox;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// <c>frm203050</c>「Ｓｔｅｐ編集」 — 15 種別 × 32 部位, mỗi lần chỉ hiện 32 ô của một 種別.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MÔ HÌNH DỮ LIỆU (frm203050.cs)
/// ═══════════════════════════════════════════════════════════════════════════
///  · <c>_stsBui = new int[15 * 32]</c> (:31) — bộ đệm PHẲNG, nạp MỘT LẦN trong
///    <c>initProc</c> bằng <c>TrtState.getTrtState</c> (:205) rồi <c>setStsBui</c> (:219).
///  · <c>dspData(idx)</c> (:244) chỉ ĐỔ LẠI 32 ô trên màn từ bộ đệm — KHÔNG hỏi DB.
///  · <c>saveData(idx)</c> (:255) chép 32 ô ngược vào bộ đệm; ô &gt; 30000 → E00100 rồi
///    focus lại đúng ô sai và trả false.
///  · <c>cboKind_SelectedValueChanged</c> (:130) đổi 種別 = <c>saveData(_bkIdx)</c> TRƯỚC;
///    sai thì KHÔNG gọi <c>dspData</c> và KHÔNG cập nhật <c>_bkIdx</c>.
///  · <c>btnF9_Click</c> (:119) → <c>updateProc</c> (:276) ghi CẢ 15 hàng trong một
///    transaction (<c>UPDATE TRTSTATE SET bui1_1…bui15_32 WHERE pat_no</c>).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BA LỚP CHẶN GIÁ TRỊ &gt; 30000 — KHÁC BẢN WEB
/// ═══════════════════════════════════════════════════════════════════════════
/// WinForm chặn ở <b>ba</b> chỗ, bản web chỉ port lớp thứ ba:
///   1. <c>txtEpp_KeyPress</c> (:171) — ép focus lại ngay khi đang gõ.
///   2. <c>txtEpp_Leave</c> (:179)   — rời ô là bị kéo về, KHÔNG có thông báo nào.
///   3. <c>saveData</c> (:259)       — E00100 「STEPの値が正しくありません。」.
/// Hệ quả cho test: <b>đừng dùng chuột</b> để rời ô đang mang giá trị sai — lớp 2 sẽ
/// nuốt cú click và test đỏ ở chỗ chẳng liên quan. Mọi thao tác đi bằng phím (KeyPreview
/// của BaseDialog nhận F9/F10 bất kể focus đang ở đâu).
/// </summary>
public static class StepEditDialog
{
    public const string DialogId = "frm203050";
    public const string TitleFragment = "Ｓｔｅｐ編集";
    public const string KindComboId = "cboKind";

    /// <summary>Số 種別 — <c>_stsBui = new int[15 * 32]</c> (frm203050.cs:31).</summary>
    public const int KindCount = 15;

    /// <summary>Số 部位 trên một 種別 — <c>_epp = new CustomTextBoxNum[32]</c> (:32).</summary>
    public const int BuiCount = 32;

    /// <summary>Ranh giới hàm trên / hàm dưới — <c>idx &lt; 16</c> (:158).</summary>
    public const int HalfArch = BuiCount / 2;

    /// <summary>Ngưỡng hợp lệ — <c>&gt; 30000</c> (:259).</summary>
    public const int ValueMax = 30_000;

    /// <summary>cd_type của combo 種別 — <c>makeCodMstCombo(con, cboKind, 70, …)</c> (:204).</summary>
    public const int KindCdType = 70;

    public static Window Open(OchaApp app, Window screen, TestTrace? trace = null) =>
        InpP1MenuFlow.Open(app, screen, InpP1MenuFlow.StepEdit, trace);

    public static void Close(OchaApp app, Window dialog, TestTrace? trace = null) =>
        InpP1MenuFlow.CloseByBack(app, dialog, DialogId, trace);

    // ── 32 ô nhập ────────────────────────────────────────────────────────────

    /// <summary>Ô 部位 thứ <paramref name="no"/> (1..32) — <c>txtEpp{no}</c>.</summary>
    public static AutomationElement Cell(Window dialog, int no) =>
        Uia.ById(dialog, CellId(no))
        ?? throw new InvalidOperationException(
            $"Dialog {DialogId} khong co control 「{CellId(no)}」 — Designer da doi? " +
            "(frm203050.Designer.cs dat ten txtEpp1..txtEpp32)");

    public static string CellId(int no) => $"txtEpp{no}";

    /// <summary>Số ô hiện có (đếm txtEpp1..txtEpp32 mà UIA thấy).</summary>
    public static IReadOnlyList<int> PresentCellNumbers(Window dialog) =>
        Enumerable.Range(1, BuiCount).Where(i => Uia.ById(dialog, CellId(i)) is not null).ToList();

    public static string CellText(Window dialog, int no) => Txt.N(Uia.ValueOf(Cell(dialog, no)));

    /// <summary>Giá trị ô như <c>EditControl.editStringToInt</c> hiểu: rỗng = 0.</summary>
    public static int CellValue(Window dialog, int no) => Txt.Int(CellText(dialog, no)) ?? 0;

    /// <summary>32 ô đang hiện, theo thứ tự 部位 1..32.</summary>
    public static int[] VisibleRow(Window dialog) =>
        Enumerable.Range(1, BuiCount).Select(i => CellValue(dialog, i)).ToArray();

    /// <summary>
    /// Gõ giá trị vào một ô. Gõ PHÍM chứ không <c>ValuePattern.SetValue</c>:
    /// <c>CustomTextBoxNum</c> lọc ký tự trong <c>KeyPress</c>, và <c>txtEpp_KeyPress</c>
    /// (:171) là một trong ba lớp chặn — SetValue đi vòng qua cả hai.
    /// </summary>
    public static void SetCell(Window dialog, int no, int value)
    {
        var cell = Cell(dialog, no);
        Uia.SetText(cell, value.ToString());
        Waits.Step();
    }

    /// <summary>Số thứ tự ô đang giữ tiêu điểm bàn phím; không ô nào → null.</summary>
    public static int? FocusedCellNumber(Window dialog)
    {
        for (var i = 1; i <= BuiCount; i++)
        {
            var cell = Uia.ById(dialog, CellId(i));
            if (cell is null) continue;
            try
            {
                if (cell.Properties.HasKeyboardFocus.ValueOrDefault) return i;
            }
            catch { /* phần tử bận */ }
        }
        return null;
    }

    /// <summary>Đặt tiêu điểm vào một ô rồi xác nhận nó nhận được (điều kiện tiên quyết của TC điều hướng).</summary>
    public static void FocusCell(Window dialog, int no)
    {
        InpP1MenuFlow.Focus(dialog);
        Cell(dialog, no).Focus();
        Waits.Until(() => FocusedCellNumber(dialog) == no,
                    $"o {CellId(no)} nhan duoc tieu diem ban phim",
                    TimeSpan.FromSeconds(5));
    }

    /// <summary>Ô mà <c>txtEpp_KeyDown</c> (:149-170) sẽ nhảy tới khi bấm phím mũi tên.</summary>
    public static int ExpectedNeighbour(int no, ushort arrow)
    {
        var idx = no - 1;
        return arrow switch
        {
            // Up/Down: cùng CỘT, đổi hàm (± 16).
            Vk.Up or Vk.Down => (idx < HalfArch ? idx + HalfArch : idx - HalfArch) + 1,
            // Right/Left: đi hết 32 ô rồi VÒNG LẠI.
            Vk.Right => (idx == BuiCount - 1 ? 0 : idx + 1) + 1,
            Vk.Left => (idx == 0 ? BuiCount - 1 : idx - 1) + 1,
            _ => throw new ArgumentOutOfRangeException(nameof(arrow), arrow, "chi nhan phim mui ten"),
        };
    }

    // ── Combo 種別 ───────────────────────────────────────────────────────────

    public static ComboBox KindCombo(Window dialog) =>
        Uia.ById(dialog, KindComboId)?.AsComboBox()
        ?? throw new InvalidOperationException(
            $"Dialog {DialogId} khong co 「{KindComboId}」 (frm203050.Designer.cs:664).");

    /// <summary>Nhãn mọi mục của combo 種別, theo đúng thứ tự đang hiện.</summary>
    public static IReadOnlyList<string> KindItems(Window dialog)
    {
        var combo = KindCombo(dialog);
        return combo.Items.Select(i => Txt.N(i.Text)).ToList();
    }

    /// <summary>Nhãn đang chọn. Đọc <c>Value</c> trước, rồi tới mục đang chọn.</summary>
    public static string SelectedKind(Window dialog)
    {
        var combo = KindCombo(dialog);
        var value = Txt.N(Uia.ValueOf(combo));
        if (value.Length > 0) return value;

        try { return Txt.N(combo.SelectedItem?.Text); }
        catch { return ""; }
    }

    /// <summary>
    /// Chọn mục thứ <paramref name="index"/> (0-based).
    ///
    /// <para>Trả về false khi thao tác ném lỗi — trường hợp đó xảy ra khi
    /// <c>cboKind_SelectedValueChanged</c> bung MessageBox E00100 ngay giữa lúc FlaUI
    /// còn đang đóng danh sách: luồng UI của app bị chặn nên lời gọi UIA hết giờ. Đó là
    /// một KẾT QUẢ hợp lệ của testcase 「giá trị sai」, không phải lỗi hạ tầng.</para>
    /// </summary>
    public static bool TrySelectKind(Window dialog, int index)
    {
        try
        {
            KindCombo(dialog).Select(index);
            Waits.Step();
            return true;
        }
        catch (Exception e)
        {
            TestContextNote($"chon 種別 index={index} nem loi ({e.GetType().Name}: {e.Message}) — " +
                            "nhieu kha nang MessageBox dang chan luong UI cua app.");
            return false;
        }
    }

    public static void SelectKind(Window dialog, int index)
    {
        if (!TrySelectKind(dialog, index))
            throw new InvalidOperationException($"Khong chon duoc 種別 index={index} cua {KindComboId}.");
    }

    // ── F-key ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Bấm F9 確定 bằng PHÍM. <c>BaseDialog.KeyPreview</c> đưa F9 tới
    /// <c>formBase_KeyDown</c> → <c>btnF9_Click</c> (BaseDialog.cs:300-306) mà không cần
    /// rời focus khỏi ô — tránh hẳn lớp chặn <c>txtEpp_Leave</c>.
    /// </summary>
    public static void PressF9(Window dialog)
    {
        InpP1MenuFlow.Focus(dialog);
        Uia.SendKey(Vk.F9);
        Waits.Step();
    }

    private static void TestContextNote(string line)
    {
        try { NUnit.Framework.TestContext.Out.WriteLine("      · " + line); }
        catch { /* ngoài phiên NUnit */ }
    }
}
