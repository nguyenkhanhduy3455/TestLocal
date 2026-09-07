using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteCmtBuiCaret;

/// <summary>
/// <c>frm203011</c>「カルテ記載選択」(lưới nút group) và <c>frm203012</c>「カルテ記載選択」
/// (lưới comment + ô テキスト) — mọi hằng số và mọi cái bẫy của cặp màn này, gom MỘT chỗ.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ☠ BỐN ĐƯỜNG GHI DB / ĐÓNG MÀN — ĐỌC TRƯỚC KHI GỬI BẤT KỲ PHÍM NÀO
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>frm203012.fixProc</c> (frm203012.cs:1348-1387) gọi <c>fixCmt2()</c> — cập nhật
/// <c>use_cnt</c> của <c>mst_cmt2</c> — rồi <c>this.Close()</c>. Bốn phím dẫn tới đó:
/// <code>
///   F9        formBase_KeyDown → btnF9_Click → fixProc      (frm203012.cs:164-166)
///   End       formBase_KeyDown → btnF9_Click → fixProc      (:167-169)  ⚠️ KHÔNG phải 「về cuối dòng」
///   Escape    formBase_KeyDown → btnF9_Click → fixProc      (:170-172)  ⚠️ KHÔNG phải 「huỷ」
///   Enter     txtValue_KeyDown → fixProc  (khi chuỗi hết dấu *)         (:339-342)
/// </code>
/// Ba phím đầu do <c>formBase_KeyDown</c> bắt ở tầng FORM (<c>KeyPreview = true</c>,
/// BaseDialog.cs:139) nên chúng ăn <b>bất kể control nào đang giữ tiêu điểm</b>, và
/// <c>switch (e.KeyCode)</c> không nhìn phím bổ trợ ⇒ <b>Ctrl+End cũng là 確定</b>.
///
/// <para>Đóng màn này CHỈ bằng <see cref="Vk.F10"/> 戻る (BaseDialog.cs:308).</para>
///
/// <para>Phím Enter là câu hỏi RIÊNG, không phải bước chuẩn bị: <c>AcceptButton</c> của
/// form được đặt bằng <c>btnDummy</c> (frm203012.cs:399/409/419) và
/// <c>btnDummy_Click</c> thì CHÈN XUỐNG DÒNG (:369-377) — ngược hẳn với
/// <c>txtValue_KeyDown</c>. Cái nào thắng phụ thuộc <c>AcceptsReturn</c> của
/// <c>CustomTextBox</c> và thứ tự dialog-key của WinForms; đọc source không kết luận
/// được, nên nó nằm sau cờ <c>karteCmt.allowConfirm</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HAI FORM TRÙNG TIÊU ĐỀ — ĐỪNG BAO GIỜ NHẬN DIỆN BẰNG TITLE
/// ═══════════════════════════════════════════════════════════════════════════════
/// Cả <c>frm203011</c> lẫn <c>frm203012</c> (gType <c>Cult</c>) đều mang tiêu đề
/// 「カルテ記載選択」 (frm203012.cs:54 <c>_title</c>). <c>KarteAutoCalcDialog.FindDialogWindow</c>
/// thử <c>app.WindowByTitle(titleFragment)</c> ở ĐƯỜNG THỨ HAI, nên truyền tiêu đề đó vào
/// là có ngày bắt nhầm form cha. Vì vậy hai hàm tìm ở
/// <see cref="KarteCmtBuiFlow"/> khớp theo AutomationId, và khi phải rơi xuống tiêu đề thì
/// còn kiểm thêm <b>đặc điểm phân biệt</b>:
/// <code>
///   frm203011  ⇒ CÓ nút group btn01, KHÔNG có txtValue
///   frm203012  ⇒ CÓ txtValue
/// </code>
/// (Bản Playwright vấp đúng chỗ này — xem 「bẫy 1」 trong doc-comment của
/// <c>bui-caret-newline-branch.spec.ts</c>.)
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// THANH PHÍM CỦA frm203012 (_btnInfo, frm203012.cs:57-70)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   F1 部位     F9 確定 (⚠️ GHI DB)     F10 戻る     — các phím khác tắt
/// </code>
/// </summary>
public static class KarteCmtDialog
{
    // ── frm203011 — lưới nút group ───────────────────────────────────────────

    public const string GroupGridId = "frm203011";

    /// <summary>Tiêu đề — <b>dùng chung với frm203012</b>, xem cảnh báo ở đầu lớp.</summary>
    public const string SharedTitle = "カルテ記載選択";

    /// <summary>
    /// Nút group thứ <paramref name="no"/>: <c>btn01</c>…<c>btn30</c>, nhãn
    /// <c>"{no}  {grp_nm}"</c> (frm203011.cs:193-197). Nút vượt quá số dòng
    /// <c>mst_cmt2_grp</c> bị <c>Visible = false</c> (:200-207) ⇒ KHÔNG có trong cây UIA.
    /// </summary>
    public static string GroupButtonId(int no) => "btn" + no.ToString("00");

    // ── frm203012 — lưới comment + ô テキスト ────────────────────────────────

    public const string CmtListId = "frm203012";

    /// <summary>
    /// Ô テキスト — <c>CustomTextBox</c>, <c>Multiline = true</c>
    /// (frm203012.Designer.cs:112-120). Đây là control DUY NHẤT mà luồng này đo.
    /// </summary>
    public const string TextBoxId = "txtValue";

    /// <summary>
    /// Ô テキスト của tab 「摘要記載事項一覧」 — <c>Enabled = false</c>
    /// (frm203012.Designer.cs:223). Có tên rất giống <see cref="TextBoxId"/>; đọc nhầm
    /// nó thì mọi phép đo ra chuỗi rỗng bất biến.
    /// </summary>
    public const string PackTextBoxId = "txtValuePack";

    /// <summary>Lưới カルテコメント一覧 — không dùng, liệt kê để khỏi ai đi tìm lại.</summary>
    public const string CmtGridId = "dgvView";

    /// <summary>
    /// Dài <c>Environment.NewLine</c> của app: WinForms <c>TextBox</c> trả <c>Text</c> có
    /// <c>\r\n</c> và <c>SelectionStart</c> đếm nó là <b>2</b> ký tự — chính tác giả app
    /// khẳng định điều đó ở <c>btnDummy_Click</c>: chèn <c>Environment.NewLine</c> rồi
    /// <c>SelectionStart = idx + 2</c> (frm203012.cs:372-374).
    ///
    /// <para>Bản web là <c>\n</c> (1 ký tự) nên điều kiện của nhánh bên đó viết
    /// <c>idx === text.length - 1</c>. Hai con số khác nhau nhưng CÙNG nghĩa
    /// 「caret ngay trước dấu xuống dòng cuối cùng」.</para>
    /// </summary>
    public const int NewLineLength = 2;

    // ── Nhận diện ────────────────────────────────────────────────────────────

    /// <summary>Cửa sổ này có phải <c>frm203012</c> không — id trước, rồi đặc điểm txtValue.</summary>
    public static bool IsCmtList(AutomationElement w)
    {
        try
        {
            if (Txt.Same(Uia.AutomationIdOf(w), CmtListId)) return true;
            // Rơi xuống tiêu đề thì PHẢI kiểm thêm: frm203011 cũng mang đúng tiêu đề đó.
            return Txt.Has(Uia.NameOf(w), SharedTitle) && Uia.ById(w, TextBoxId) is not null;
        }
        catch { return false; }
    }

    /// <summary>Cửa sổ này có phải <c>frm203011</c> không — id trước, rồi 「có btn01, không có txtValue」.</summary>
    public static bool IsGroupGrid(AutomationElement w)
    {
        try
        {
            if (Txt.Same(Uia.AutomationIdOf(w), GroupGridId)) return true;
            return Txt.Has(Uia.NameOf(w), SharedTitle)
                   && Uia.ById(w, TextBoxId) is null
                   && Uia.ById(w, GroupButtonId(1)) is not null;
        }
        catch { return false; }
    }

    /// <summary>
    /// Quét cửa sổ của tiến trình app tìm form thoả <paramref name="match"/>.
    ///
    /// <para>Cùng thứ tự với <c>ToothSelectDialog.Find</c>: <c>ModalWindows</c> của cửa sổ
    /// chủ trước (dialog modal không phải lúc nào cũng là top-level), rồi
    /// <c>app.Windows()</c>, rồi lục trong cây của <paramref name="owner"/> (WinForms
    /// <c>ShowDialog</c> có lúc để form con nằm hẳn trong cây cha).</para>
    /// </summary>
    public static Window? Find(OchaApp app, AutomationElement? owner, Func<AutomationElement, bool> match)
    {
        if (owner is not null)
        {
            try
            {
                if (owner is Window ownerWindow)
                    foreach (var w in ownerWindow.ModalWindows)
                        if (match(w)) return w;
            }
            catch { /* cửa sổ chủ đang bận */ }
        }

        try
        {
            foreach (var w in app.Windows())
                if (match(w)) return w;
        }
        catch { /* danh sách cửa sổ đang đổi */ }

        if (owner is not null)
        {
            try
            {
                foreach (var e in Uia.Descendants(owner, maxDepth: 3))
                    if (match(e)) return e.AsWindow();
            }
            catch { /* nt */ }
        }

        return null;
    }

    /// <summary>Liệt kê cửa sổ đang mở — để thông điệp lỗi nói được 「thấy gì thay vì」.</summary>
    public static string DescribeWindows(OchaApp app)
    {
        try
        {
            var lines = app.Windows()
                .Select(w => $"id='{Uia.AutomationIdOf(w)}' name='{Uia.NameOf(w)}'")
                .ToList();
            return lines.Count == 0 ? "(không cửa sổ nào)" : string.Join(" · ", lines);
        }
        catch (Exception e) { return $"(không liệt kê được: {e.Message})"; }
    }
}
