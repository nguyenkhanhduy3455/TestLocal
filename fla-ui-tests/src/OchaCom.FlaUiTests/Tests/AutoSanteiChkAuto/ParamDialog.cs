using System.Text.RegularExpressions;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// パラメータダイアログ <c>frm203048</c> — hộp thoại bung ra cho MỖI カルテコメント còn
/// dấu <c>*</c>, TRƯỚC khi comment được ghi xuống lưới.
///
/// <para>Nửa WinForm của <c>fillPendingParamDialogs()</c> trong
/// <c>../web-tenant-tests/tests/auto-santei/chk-auto-comment-order.spec.ts</c>. Hai bên
/// phải điền CÙNG một giá trị (<see cref="ParamFill"/>) và CÙNG một quy tắc (mỗi CỤM
/// <c>*</c> liền nhau là MỘT tham số), nếu không thì chuỗi trên lưới khác nhau và mọi
/// phép so tên đều trượt.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   Chk_CmtAuto → frm203012 (gType.Auto) → fixProc → outData
///     → frmCmt3_Cmt3_SetData (frm203002.cs:10034)
///         → frmCmt3_PrmChk   (:10036)  ← MỞ frm203048 khi outData còn '*'
///         → frmCmt3_Set_Data2 (:10038) ← rồi mới ghi xuống lưới
/// </code>
///
/// <para><c>btnF9_Click</c> của <c>frm203048</c> quét <c>getAsta(txtValue.Text, 0)</c> từ
/// index 0: <b>còn <c>*</c> thì nó chỉ BÔI ĐEN cụm đó rồi ở nguyên</b>, hết <c>*</c> mới
/// <c>fixProc</c> và đóng (frm203048.cs:159-166). Nên 「bấm F9 mà hộp thoại đóng」 tự nó
/// đã là một phép kiểm: chuỗi không còn dấu sao nào.</para>
///
/// <para><b>Ghi text bằng <c>ValuePattern</c> chứ không gõ phím</b> — ngoại lệ có chủ ý
/// của F13. Chuỗi cần điền là tiếng Nhật (「自発痛（9）冷水痛（9）打診痛（9）」); gửi nó qua
/// <c>SendKey</c> phải đi qua IME, mà IME là cửa sổ top-level riêng với trạng thái riêng —
/// đó là nguồn lỗi lớn hơn nhiều so với việc bỏ qua <c>KeyDown</c>. App đọc thẳng
/// <c>txtValue.Text</c> ở <c>btnF9_Click</c> nên <c>SetValue</c> là đủ.</para>
/// </summary>
public sealed class ParamDialog
{
    /// <summary>AutomationId của form.</summary>
    public const string FormId = "frm203048";

    /// <summary>Tiêu đề — <c>_title</c> của frm203048.cs:49.</summary>
    public const string Title = "パラメータ";

    /// <summary>Ô nhập (frm203048.Designer.cs:51).</summary>
    private const string ValueBoxId = "txtValue";

    private const string ConfirmButton = "確定";

    /// <summary>
    /// Giá trị điền thay cho MỖI cụm <c>*</c>. Phải TRÙNG <c>PARAM_FILL</c> của spec
    /// Playwright, và cố ý là ký tự thường không phải dấu sao — để phép kiểm 「lưới không
    /// còn <c>*</c>」 là phép kiểm thật chứ không tự thoả.
    /// </summary>
    public const string ParamFill = "9";

    /// <summary>
    /// Trần số hộp thoại chờ trong MỘT cú chốt. Trùng <c>MAX_PARAM_DIALOGS</c> bên web.
    /// Đặt trần để phase KHÔNG có <c>*</c> thoát sau đúng một nhịp chờ, không treo.
    /// </summary>
    public const int MaxDialogs = 8;

    private readonly OchaApp _app;
    private readonly Window _owner;

    public ParamDialog(OchaApp app, Window owner)
    {
        _app = app;
        _owner = owner;
    }

    /// <summary>
    /// Mỗi CỤM <c>*</c> liền nhau thành một <see cref="ParamFill"/> — đúng cách
    /// <c>getAsta</c> gom (frm203048.cs:222-246). Bản sao của <c>filledText()</c> bên web.
    /// </summary>
    public static string Filled(string s) => Regex.Replace(s, @"\*+", ParamFill);

    public static bool HasParam(string s) => s.Contains('*');

    /// <summary>Hộp thoại đang mở; null nếu không.</summary>
    public Window? Open() =>
        ModalDialogs.All(_app, _owner)
                    .FirstOrDefault(w => Txt.Has(Uia.AutomationIdOf(w), FormId) ||
                                         Txt.Has(Uia.NameOf(w), Title));

    /// <summary>
    /// Điền hết các <c>frm203048</c> đang xếp hàng. Trả về text đã xác nhận, THEO THỨ TỰ
    /// hộp thoại bung ra — đối ứng 1-1 với giá trị trả về của <c>fillPendingParamDialogs</c>
    /// bên web, để hai vế so được số lần bung.
    /// </summary>
    /// <remarks>
    /// Nhịp chờ đầu dài hơn (hộp thoại còn phải bung), các nhịp sau ngắn — F2: cái đang đợi
    /// ở nhịp sau là 「có thêm hộp nữa không」, mà câu trả lời 「không」 cũng cần đến sớm.
    /// </remarks>
    public IReadOnlyList<string> AnswerAll(TestTrace trace)
    {
        var confirmed = new List<string>();
        for (var i = 0; i < MaxDialogs; i++)
        {
            var dialog = Waits.TryFor(Open, TimeSpan.FromSeconds(i == 0 ? 20 : 8));
            if (dialog is null) break;

            var box = Uia.ById(dialog, ValueBoxId);
            if (box is null)
            {
                trace.Note($"{FormId} dang mo nhung khong thay o 「{ValueBoxId}」 — " +
                           "doc anh chup, co the app doi ten control.");
                trace.Shot($"param-dialog-{i + 1}-khong-thay-o-nhap");
                break;
            }

            var raw = Uia.ValueOf(box);
            var filled = Filled(raw);
            trace.Step($"frm203048 lan {i + 1}: 「{raw}」 → 「{filled}」 roi F9 確定");
            Uia.SetText(box, filled);

            var button = dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                               .FirstOrDefault(b => Txt.Has(Uia.NameOf(b), ConfirmButton));
            if (button is null)
            {
                trace.Note($"khong thay nut 「{ConfirmButton}」 tren {FormId}.");
                break;
            }
            Uia.Click(button);

            // Hộp thoại chỉ đóng khi chuỗi KHÔNG còn dấu sao nào (frm203048.cs:162) ⇒
            // 「đóng được」 chính là phép kiểm, không cần assert riêng.
            if (!Waits.TryUntil(() => Open() is null, TimeSpan.FromSeconds(10)))
            {
                trace.Note($"bam 確定 voi 「{filled}」 ma {FormId} khong dong — con sot cum '*'?");
                trace.Shot($"param-dialog-{i + 1}-khong-dong");
                break;
            }

            confirmed.Add(filled);
        }
        return confirmed;
    }
}
