using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

// Xem chú thích cùng dòng này ở StepEditDialog.cs — UseWindowsForms làm `ComboBox` nhập nhằng.
using ComboBox = FlaUI.Core.AutomationElements.ComboBox;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// <c>frm203044</c>「チェック項目設定」 — 19 combo, cấu hình TOÀN PHÒNG KHÁM (bảng <c>chkprm</c>
/// một dòng duy nhất, không theo bệnh nhân).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// NGUỒN (frm203044.cs)
/// ═══════════════════════════════════════════════════════════════════════════
///  · <c>_param = new ComboBox[19]</c> (:25) — <b>19</b>, không phải 20.
///    <c>ChkPrmData</c> có tới <c>param20</c> (ChkPrm.cs:39) nhưng màn hình không có ô cho nó.
///  · <c>setItemData</c> (:134-158) — mục 7 → CODMST 63; mục 17/18 → 64; còn lại → 62.
///  · <c>dspData</c> (:163-201) — có dòng <c>chkprm</c> thì lấy <c>param{i}</c>
///    (giá trị <c>"0"</c> quy về 1); KHÔNG có dòng nào thì mặc định 1, RIÊNG mục
///    14/15/16 mặc định 9 (:190-193).
///  · <c>chkInputData</c> (:207-220) — combo chưa chọn → E00021「チェック項目」.
///  · <c>updateProc</c> (:226-256) — <c>deleteChkPrm</c> + <c>insertChkPrm</c> trong MỘT
///    transaction ⇒ sau khi lưu phải còn ĐÚNG một dòng <c>chkprm</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// TÊN CONTROL (frm203044.Designer.cs)
/// ═══════════════════════════════════════════════════════════════════════════
/// Combo: <c>cboParam01</c>..<c>cboParam09</c> có <b>số 0 đệm</b>, còn <c>cboParam10</c>..
/// <c>cboParam19</c> thì không. Nhãn: <c>customLabel1</c>..<c>customLabel19</c>, KHÔNG đệm 0.
/// Đây là chỗ dễ sai nhất khi viết locator bằng chuỗi nội suy.
/// </summary>
public static class CheckItemDialog
{
    public const string DialogId = "frm203044";
    public const string TitleFragment = "チェック項目設定";

    /// <summary>19 — <c>_param = new ComboBox[19]</c> (frm203044.cs:25).</summary>
    public const int ItemCount = 19;

    /// <summary>Mục cuối của CỘT TRÁI theo bố cục Designer (1-10 trái, 11-19 phải).</summary>
    public const int LeftColumnLastItem = 10;

    /// <summary>Mục duy nhất lấy combo từ CODMST 63 — <c>i == 6</c> (0-based) trong setItemData.</summary>
    public const int SecondOnwardsItemNo = 7;

    /// <summary>cd_val của CODMST 63 「２回目以降」.</summary>
    public const int SecondOnwardsValue = 2;

    /// <summary>cd_val 「しない」 — mặc định của mục 14/15/16 khi chưa từng lưu (frm203044.cs:192).</summary>
    public const int NoCheckValue = 9;

    /// <summary>Mục dùng mặc định 「しない」 khi <c>chkprm</c> chưa có dòng nào (:190).</summary>
    public static readonly int[] DefaultOffItemNos = [14, 15, 16];

    /// <summary>
    /// 19 mục: số thứ tự, nhãn, và cd_type của combo.
    ///
    /// <para>Nhãn chép từ <c>frm203044.Designer.cs</c> (<c>customLabel{n}.Text</c>), đã bỏ
    /// tiền tố số vì Designer viết 「  9 調Ａの算定漏れ」 còn hợp đồng BE↔FE của bản web
    /// (<c>Domain/Constants/CheckItemSettings.cs</c>) tách số ra một cột riêng. So sánh
    /// bằng <c>Txt.N</c> nên nửa/đủ chiều rộng không thành vấn đề.</para>
    ///
    /// <para>Đây là <b>đáp án</b> mà <c>GET /tenant/chk-prm</c> của bản web phải khớp:
    /// testcase bên Playwright khoá cùng danh sách này (TC-CHK-ROWS-1).</para>
    /// </summary>
    public static readonly ChkItem[] Items =
    [
        new(1, "歯種チェック１", 62),
        new(2, "歯種チェック２", 62),
        new(3, "歯数・ブロック数チェック", 62),
        new(4, "病名チェック", 62),
        new(5, "部位・病名繰越し", 62),
        new(6, "歯周基本指導の算定漏れ", 62),
        new(7, "歯科疾患管理料の算定漏れ", 63),
        new(8, "Ｐ基処の算定漏れ", 62),
        new(9, "調Ａの算定漏れ", 62),
        new(10, "調Ｂの算定漏れ", 62),
        new(11, "調Ｃの算定漏れ", 62),
        new(12, "ＤⅠの算定漏れ", 62),
        new(13, "ＤⅡの算定漏れ", 62),
        new(14, "調剤料と薬剤の算定漏れ", 62),
        new(15, "調剤料と処方の算定漏れ", 62),
        new(16, "処方と薬剤の算定漏れ", 62),
        new(17, "Ｐ部位分割", 64),
        new(18, "Ｇ部位分割", 64),
        new(19, "歯清の算定漏れ", 62),
    ];

    public sealed record ChkItem(int No, string Label, int CdType)
    {
        /// <summary><c>cboParam01</c>..<c>cboParam09</c> đệm 0; từ 10 trở đi thì không.</summary>
        public string ComboId => No <= 9 ? $"cboParam0{No}" : $"cboParam{No}";

        public string LabelId => $"customLabel{No}";

        /// <summary>Nguyên văn Designer: số thứ tự + khoảng trắng + nhãn.</summary>
        public string ExpectedLabelText => $"{No} {Label}";
    }

    public static ChkItem Item(int no) =>
        Items.FirstOrDefault(i => i.No == no)
        ?? throw new ArgumentOutOfRangeException(nameof(no), no, $"chi co muc 1..{ItemCount}");

    public static Window Open(OchaApp app, Window screen, TestTrace? trace = null) =>
        InpP1MenuFlow.Open(app, screen, InpP1MenuFlow.CheckItem, trace);

    public static void Close(OchaApp app, Window dialog, TestTrace? trace = null) =>
        InpP1MenuFlow.CloseByBack(app, dialog, DialogId, trace);

    // ── Nhãn ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Nhãn của một mục. Ưu tiên AutomationId <c>customLabel{n}</c>; máy nào cầu MSAA→UIA
    /// không gắn AutomationId cho <c>CustomLabel</c> thì lui về dò theo CHỮ — không có
    /// nhãn thì testcase nhãn sẽ đỏ với thông báo đúng chỗ, chứ không đỏ vì "không thấy control".
    /// </summary>
    public static AutomationElement? LabelElement(Window dialog, int no)
    {
        var item = Item(no);
        var byId = Uia.ById(dialog, item.LabelId);
        if (byId is not null) return byId;

        return Uia.Descendants(dialog)
                  .FirstOrDefault(e => Txt.Has(Uia.NameOf(e), item.Label));
    }

    public static string LabelText(Window dialog, int no)
    {
        var el = LabelElement(dialog, no);
        return el is null ? "" : Txt.N(Uia.ValueOf(el));
    }

    // ── Combo ───────────────────────────────────────────────────────────────

    public static ComboBox Combo(Window dialog, int no) =>
        Uia.ById(dialog, Item(no).ComboId)?.AsComboBox()
        ?? throw new InvalidOperationException(
            $"Dialog {DialogId} khong co 「{Item(no).ComboId}」 — kiem lai quy tac dem so 0 " +
            "cua Designer (cboParam01..cboParam09, roi cboParam10..cboParam19).");

    public static IReadOnlyList<string> ComboItems(Window dialog, int no) =>
        Combo(dialog, no).Items.Select(i => Txt.N(i.Text)).ToList();

    public static string SelectedText(Window dialog, int no)
    {
        var combo = Combo(dialog, no);
        var value = Txt.N(Uia.ValueOf(combo));
        if (value.Length > 0) return value;

        try { return Txt.N(combo.SelectedItem?.Text); }
        catch { return ""; }
    }

    /// <summary>Chọn mục có nhãn CHỨA <paramref name="text"/>; không có mục nào khớp → false.</summary>
    public static bool SelectByText(Window dialog, int no, string text)
    {
        var combo = Combo(dialog, no);
        var items = combo.Items;
        for (var i = 0; i < items.Length; i++)
        {
            if (!Txt.Has(items[i].Text, text)) continue;
            combo.Select(i);
            Waits.Step();
            return true;
        }
        return false;
    }

    /// <summary>Chọn mục ĐẦU TIÊN khác mục đang chọn; combo chỉ có 1 mục → false.</summary>
    public static bool SelectAnyOther(Window dialog, int no)
    {
        var combo = Combo(dialog, no);
        var current = SelectedText(dialog, no);
        var items = combo.Items;
        for (var i = 0; i < items.Length; i++)
        {
            if (Txt.Same(items[i].Text, current)) continue;
            combo.Select(i);
            Waits.Step();
            return true;
        }
        return false;
    }

    /// <summary>Bấm F9 登録 bằng phím (xem <see cref="StepEditDialog.PressF9"/>).</summary>
    public static void PressF9(Window dialog)
    {
        InpP1MenuFlow.Focus(dialog);
        Uia.SendKey(Vk.F9);
        Waits.Step();
    }
}
