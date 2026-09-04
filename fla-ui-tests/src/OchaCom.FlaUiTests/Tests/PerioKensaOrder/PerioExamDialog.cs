using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PerioKensaOrder;

/// <summary>
/// Hai màn 歯周基本検査 (<c>frm203028</c>) và 歯周精密検査 (<c>frm203029</c>) — tên control,
/// cách đọc ô đang giữ con trỏ, cách gửi phím.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// TÊN CONTROL — ĐƠN VỊ CỦA CHỈ SỐ KHÁC NHAU GIỮA CÁC HÀNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>INP/Lib/GetControl.getControl</c> ghép tên bằng <c>string.Format("{0:D2}", idx)</c>
/// với <c>idx</c> là <b>1-based</b> (GetControl.cs:80-100). Còn code nghiệp vụ thì đánh
/// số 0-based, và <b>đơn vị khác nhau theo hàng</b>:
/// <code>
///   txtEpp{t+1:D2}    txtDouyo{t+1:D2}    txtBop{t+1:D2}    t = SỐ RĂNG   0..31
///   txtHoho{p+1:D2}   txtKou{p+1:D2}                        p = ĐIỂM ĐO   0..95  (p = t*3 + k)
/// </code>
/// Tức 左上8 (răng 15) là <c>txtEpp16</c>, nhưng điểm 口蓋 ngoài cùng của chính răng đó là
/// <c>txtKou48</c> (15*3+2 = 47 ⇒ +1). Đây đúng là chỗ mà spec Playwright phải ghi hẳn một
/// mục BẪY (「index là số răng cho epp/douyou/bop, là chỉ số điểm cho hoho/kou」) — bên web
/// nó nằm ở thuộc tính <c>data-perio-cell</c>, bên này nằm ở AutomationId.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// PHÍM: Enter ĐI QUA HAI ĐƯỜNG, VÀ KẾT CỤC LÀ ĐƯỜNG THỨ HAI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>BaseDialog</c> bật <c>KeyPreview</c> (BaseDialog.cs:139) và <c>formBase_KeyDown</c>
/// ánh xạ <c>Keys.Enter → ProcessTabKey</c> (:325-327) mà KHÔNG đặt <c>e.Handled</c>.
/// Trong khi đó ô nhập lại xử lý Enter ở <c>KeyPress</c> (<c>txtEpp_KeyPress</c>,
/// frm203028.cs:184). Một lần bấm Enter vì thế chạy CẢ HAI:
/// <code>
///   WM_KEYDOWN  → formBase_KeyDown → ProcessTabKey   (dời focus theo TabIndex)
///   WM_CHAR     → txtEpp_KeyPress  → getMoveIndex    (dời focus theo 検査順)
/// </code>
/// <c>WM_CHAR</c> tới SAU, và nó được gửi tới ô ĐANG FOCUS lúc <c>TranslateMessage</c> chạy
/// (tức ô gốc), nên <b>kết cục quan sát được là đích của <c>getMoveIndex</c></b>. Hệ quả
/// thực dụng: đừng đọc focus ngay lập tức — luôn poll (xem <see cref="WaitFocus"/>), vì có
/// một khoảnh khắc focus đang nằm ở ô mà TabIndex chỉ tới.
///
/// <para>⚠️ <b>Phải gửi phím bằng <see cref="Uia.SendKey"/></b>, không phải
/// <c>Keyboard.Type</c>: mũi tên đọc ở <c>KeyDown</c> nên cần <c>WM_KEYDOWN</c> thật —
/// xem chú thích đầu <see cref="Vk"/>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// PHÍM CỦA CHÍNH HAI MÀN NÀY
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   F1 ﾃﾞﾌｫﾙﾄ設定  → Q00002 → setDefalut() ⇒ GHI kihon_def / seimitu_def   ☠ ĐỪNG BẤM
///   F9 確定        → fixProc() ⇒ đổ kết quả vào lưới 処置 của 診療入力
///   F10 戻る       → đóng, không để lại gì
///   End / Escape   → BaseDialog gọi btnF9_Click ⇒ CŨNG LÀ 確定, KHÔNG phải huỷ
/// </code>
/// Vì End/Escape = 確定 nên <b>đóng bằng F10</b> (<see cref="Close"/>). Đây là biến thể của
/// đúng cái bẫy mà <c>ToothSelectDialog</c> đã ghi cho 部位選択.
/// </summary>
internal static class PerioExamDialog
{
    public const string KihonId = "frm203028";
    public const string SeimituId = "frm203029";

    /// <summary>Tiêu đề do <c>_title</c> đặt (frm203028.cs:41 / frm203029.cs:40).</summary>
    public const string KihonTitle = "歯周基本検査";
    public const string SeimituTitle = "歯周精密検査";

    /// <summary>Số răng của một cung — <c>_txtEpp.Length</c> (frm203028.cs:37).</summary>
    public const int ToothCount = 32;

    /// <summary>Số điểm đo — <c>_txtKou.Length</c> (frm203029.cs:34) = 32 răng × 3 điểm.</summary>
    public const int PointCount = 96;

    /// <summary>Răng cuối của 上顎 = 左上8. Mốc xuất phát của nhánh 左上から.</summary>
    public const int UpperLeftLastTooth = 15;

    // ── Tên control ──────────────────────────────────────────────────────────

    public static string Epp(int tooth) => Named("txtEpp", tooth, ToothCount);
    public static string Douyo(int tooth) => Named("txtDouyo", tooth, ToothCount);
    public static string Bop(int tooth) => Named("txtBop", tooth, ToothCount);
    public static string Hoho(int point) => Named("txtHoho", point, PointCount);
    public static string Kou(int point) => Named("txtKou", point, PointCount);

    private static string Named(string prefix, int zeroBased, int count)
    {
        if (zeroBased < 0 || zeroBased >= count)
            throw new ArgumentOutOfRangeException(
                nameof(zeroBased), zeroBased, $"{prefix} chỉ có {count} ô (0..{count - 1})");
        return $"{prefix}{zeroBased + 1:D2}";
    }

    /// <summary>Tên người đọc được của một ô, để đưa vào thông điệp assert.</summary>
    public static string Describe(string automationId)
    {
        if (automationId.StartsWith("txtEpp", StringComparison.Ordinal))
            return $"{automationId} = EPP răng {Zero(automationId, "txtEpp")}";
        if (automationId.StartsWith("txtDouyo", StringComparison.Ordinal))
            return $"{automationId} = 動揺度 răng {Zero(automationId, "txtDouyo")}";
        if (automationId.StartsWith("txtBop", StringComparison.Ordinal))
            return $"{automationId} = BOP răng {Zero(automationId, "txtBop")}";
        if (automationId.StartsWith("txtHoho", StringComparison.Ordinal))
            return Point(automationId, "txtHoho", "頬側");
        if (automationId.StartsWith("txtKou", StringComparison.Ordinal))
            return Point(automationId, "txtKou", "口蓋");
        return automationId.Length == 0 ? "(không đọc được focus)" : automationId;

        static int Zero(string id, string prefix) =>
            int.TryParse(id[prefix.Length..], out var n) ? n - 1 : -1;

        static string Point(string id, string prefix, string row)
        {
            var p = Zero(id, prefix);
            return p < 0 ? id : $"{id} = {row} răng {p / 3} điểm {p % 3} (chỉ số điểm {p})";
        }
    }

    // ── Tìm cửa sổ ───────────────────────────────────────────────────────────

    /// <summary>
    /// <paramref name="searchInside"/> là <b>bắt buộc trên thực tế</b>, không phải tuỳ chọn.
    ///
    /// <para>Đo thật 2026-09-04: <c>frm203011</c> hiện rành rành trên màn hình mà cả
    /// <c>GetAllTopLevelWindows</c> lẫn quét desktop-child đều KHÔNG liệt kê nó — vì
    /// <c>formControl.showDialog</c> dựng form con <c>TopLevel = false</c> rồi
    /// <c>Controls.Add</c> vào form cha, nên nó nằm TRONG cây UIA của cha chứ không phải
    /// cửa sổ top-level. Đúng chuyện mà <c>KarteAutoCalcDialog.FindDialogWindow</c> đã ghi
    /// lại cho cặp frm203042/frm203043; ba đường đầu của hàm đó chỉ là quét top-level nên
    /// đều trượt, phải có đường thứ tư.</para>
    ///
    /// <para>Triệu chứng khi quên: 「bấm F1 xong mà frm203028 không hiện ra trong 20s」 —
    /// nghe như app không mở, trong khi ảnh chụp cho thấy nó đang mở.</para>
    /// </summary>
    public static Window? FindKihon(OchaApp app, AutomationElement? searchInside = null) =>
        Find(app, KihonId, KihonTitle, searchInside);

    public static Window? FindSeimitu(OchaApp app, AutomationElement? searchInside = null) =>
        Find(app, SeimituId, SeimituTitle, searchInside);

    private static Window? Find(OchaApp app, string id, string title, AutomationElement? searchInside) =>
        KarteAutoCalc.KarteAutoCalcDialog.FindDialogWindow(app, id, title, searchInside);

    // ── Đọc con trỏ ──────────────────────────────────────────────────────────

    /// <summary>
    /// AutomationId của ô ĐANG GIỮ CON TRỎ; rỗng khi không đọc được.
    ///
    /// <para>WinForms gán <c>AutomationId</c> từ <c>Control.Name</c> nên giá trị trả về
    /// chính là <c>txtEpp16</c> / <c>txtKou48</c> — cùng ngôn ngữ với code nghiệp vụ.
    /// Không có AutomationId (một số bản Windows với control .NET cũ) thì lui về
    /// <c>Name</c>, và probe <c>Tc0</c> in cả hai để biết đường nào đang ăn.</para>
    /// </summary>
    public static string FocusedId(AutomationBase automation)
    {
        try
        {
            var focused = automation.FocusedElement();
            if (focused is null) return "";
            var id = Uia.AutomationIdOf(focused);
            return id.Length > 0 ? id : Txt.N(Uia.NameOf(focused));
        }
        catch { return ""; }
    }

    /// <summary>Chờ con trỏ về đúng ô; trả về AutomationId ĐỌC ĐƯỢC CUỐI CÙNG (khớp hay không).</summary>
    public static string WaitFocus(AutomationBase automation, string expectedId, TimeSpan? timeout = null)
    {
        var last = "";
        Waits.TryUntil(() => Txt.Same(last = FocusedId(automation), expectedId),
                       timeout ?? TimeSpan.FromSeconds(8));
        return last;
    }

    /// <summary>Ô có đang bị khoá ／ không. Không tìm thấy control → null.</summary>
    public static bool? IsCellDisabled(Window dialog, string automationId)
    {
        var cell = Uia.ById(dialog, automationId);
        if (cell is null) return null;
        try { return !cell.Properties.IsEnabled.ValueOrDefault; }
        catch { return null; }
    }

    /// <summary>Chữ đang hiện trong một ô (「/」 = ô bị khoá).</summary>
    public static string CellText(Window dialog, string automationId)
    {
        var cell = Uia.ById(dialog, automationId);
        return cell is null ? "" : Txt.N(Uia.ValueOf(cell));
    }

    // ── Gửi phím ─────────────────────────────────────────────────────────────

    public static void FocusWindow(Window dialog) => ToothSelectDialog.FocusWindow(dialog);

    public static void PressEnter() { Uia.SendKey(Vk.Return); Thread.Sleep(120); }
    public static void PressRight() { Uia.SendKey(Vk.Right); Thread.Sleep(120); }
    public static void PressLeft() { Uia.SendKey(Vk.Left); Thread.Sleep(120); }

    /// <summary>
    /// Đóng bằng <b>F10 戻る</b>. KHÔNG dùng End/Escape — <c>BaseDialog</c> ánh xạ cả hai
    /// phím đó sang <c>btnF9_Click</c> tức 確定 (BaseDialog.cs:314-324).
    /// </summary>
    public static bool Close(OchaApp app, Window dialog, TestTrace? trace = null)
    {
        if (!Uia.IsOnScreen(dialog)) return true;
        trace?.Step("F10 戻る — dong man kiem tra");
        FocusWindow(dialog);
        Uia.SendKey(Vk.F10);
        return Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(10));
    }
}
