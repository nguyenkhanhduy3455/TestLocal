using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteAutoCalc;

/// <summary>
/// <c>frm203042</c>「カルテ自動算定一覧」 và <c>frm203043</c>「カルテ自動算定登録」 —
/// cặp màn master của <c>cmtauto</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CÓ LUỒNG NÀY
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web vừa port cặp này (<c>GET/PUT /tenant/cmt-autos/masters|defs</c>). Có SÁU
/// điểm mà <b>đọc source không kết luận chắc được</b>, phải xem WinForm thật chạy ra
/// gì. Mỗi testcase dưới đây tương ứng một điểm; xem doc-comment của từng
/// <c>Tc*</c> trong <see cref="KarteAutoCalcTests"/>.
///
/// Luồng này <b>không</b> khẳng định bản web đúng hay sai — nó chỉ ghi lại hành vi
/// thật của WinForm để đối chiếu. Vì thế phần lớn testcase là <b>ghi log</b> chứ
/// không assert cứng: cái ta chưa biết thì không thể assert.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>frm203002</c> F11 → 「９ オプション」 → 「６ コメント自動入力登録」
/// (<c>IDM_CmtAuto</c>) mở <c>frm203042</c>. Từ đó F9 選択 mở <c>frm203043</c>.
///
/// Menu do <see cref="KarteAutoCalcMenu"/> lo — bản riêng của luồng này, KHÔNG
/// dời cửa sổ về (0,0) và trả lý do thay vì ném. Xem doc-comment của lớp đó.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// TÊN CONTROL
/// ═══════════════════════════════════════════════════════════════════════════
/// Chưa xác minh trên máy thật. <see cref="KarteAutoCalcTests.Tc0_DumpUiaTree"/>
/// đổ cây UIA của cả hai form ra artifact — <b>chạy nó TRƯỚC</b>, rồi sửa các hằng
/// dưới đây nếu lệch. Suy đoán hiện tại lấy từ Designer của các form anh em:
/// lưới của <c>frm901003</c> là <c>dgvView</c>, ô tìm kiếm là <c>txtTrtCd</c> /
/// <c>txtTrtNm</c>, nhãn đếm là <c>lblCount</c>.
/// </summary>
public static class KarteAutoCalcDialog
{
    // ── frm203042 一覧 ───────────────────────────────────────────────────────

    public const string ListId = "frm203042";
    public const string ListTitleFragment = "カルテ自動算定一覧";

    /// <summary>Lưới của <c>frm901003</c> (lớp cha của frm203042).</summary>
    public const string ListGridId = "dgvView";

    /// <summary>Ô 処置コード của thanh 検索.</summary>
    public const string ListTrtCdBoxId = "txtTrtCd";

    /// <summary>Ô 処置名 của thanh 検索.</summary>
    public const string ListTrtNmBoxId = "txtTrtNm";

    /// <summary>Nhãn 該当件数.</summary>
    public const string ListCountLabelId = "lblCount";

    /// <summary>Nút 検索.</summary>
    public const string ListSearchButtonId = "btnSearch";

    /// <summary>Cột của lưới 一覧 (frm203042.cs:46-53).</summary>
    public static readonly string[] ListColumns =
        ["dsp_trt_cd", "trt_nm", "dsp_cmt_cd", "cmt_nm", "disp_no", "valid"];

    // ── frm203043 登録 ───────────────────────────────────────────────────────

    public const string RegisterId = "frm203043";
    public const string RegisterTitleFragment = "カルテ自動算定登録";

    /// <summary>Lưới sửa của <c>frm203043</c>.</summary>
    public const string RegisterGridId = "dgvView";

    /// <summary>Checkbox 確認画面不要 (frm203043.cs:402 <c>chkNoChk</c>).</summary>
    public const string NoChkCheckBoxId = "chkNoChk";

    /// <summary>Cột của lưới 登録 (frm203043.cs:61-65). <c>no_chk</c> bị ẩn (:417).</summary>
    public static readonly string[] RegisterColumns =
        ["cmt_cd", "cmt_sb", "cmt_nm", "disp_no", "valid"];

    // ── Hằng nghiệp vụ ──────────────────────────────────────────────────────

    /// <summary>Dải カルテコメントマスタ — <c>DbLibrary.codeRange[karte]</c> (DbLibrary.cs:31).</summary>
    public const int KarteCodeMin = 7000;
    public const int KarteCodeMax = 8999;

    /// <summary>Biên 表示順 — frm203043.cs:511.</summary>
    public const int DispNoMin = -256;
    public const int DispNoMax = 255;

    /// <summary>cd_type của combo 使用 (可 / 否).</summary>
    public const int ValidCdType = 60;

    /// <summary>Số byte tối đa WinForm cắt bằng <c>ComLibrary.LeftB</c> (frm203043.cs:585/588).</summary>
    public const int TrtNmMaxBytes = 50;
    public const int CmtNmMaxBytes = 60;

    // ── Tìm control mà KHÔNG chui vào lưới ──────────────────────────────────

    /// <summary>
    /// Tìm control theo AutomationId bằng duyệt THEO BỀ RỘNG, bỏ qua cây con của
    /// lưới.
    ///
    /// <para><b>Vì sao không dùng <see cref="Uia.ById"/>.</b> Nó gọi
    /// <c>FindFirstDescendant</c> — duyệt SÂU toàn cây. Lưới 一覧 có 1.764 dòng
    /// (該当件数 đo được trên máy thật), và cầu MSAA→UIA của WinForms dựng phần tử
    /// cho MỌI dòng chứ không ảo hoá như web. Duyệt sâu vào đó thì hết giờ UIA —
    /// đúng triệu chứng 「Operation timed out (0x80131505)」 của lần chạy
    /// 2026-08-11. Repo đã ghi cảnh báo y hệt cho lưới 個別
    /// (Infrastructure/WinFormsGrid.cs).</para>
    ///
    /// <para>Các control của khung (ô 検索, nút F9/F10, nhãn 該当件数) đều nằm NÔNG,
    /// nên bề rộng chạm chúng sau vài chục nút — trong khi bề sâu có thể lún vào
    /// hàng nghìn ô lưới trước.</para>
    /// </summary>
    /// <param name="root">Cửa sổ dialog.</param>
    /// <param name="automationId">AutomationId cần tìm.</param>
    /// <param name="skipId">AutomationId của cây con bỏ qua (thường là lưới).</param>
    /// <param name="maxNodes">Trần số nút đã duyệt — chặn trường hợp cây lạ.</param>
    public static AutomationElement? FindChrome(
        AutomationElement root, string automationId, string? skipId = null, int maxNodes = 400)
    {
        var queue = new Queue<AutomationElement>();
        queue.Enqueue(root);
        var seen = 0;

        while (queue.Count > 0 && seen < maxNodes)
        {
            var node = queue.Dequeue();
            seen++;

            string id;
            try { id = Uia.AutomationIdOf(node); } catch { continue; }

            if (!string.IsNullOrEmpty(skipId) && Txt.Same(id, skipId)) continue; // đừng chui vào lưới
            if (Txt.Same(id, automationId)) return node;

            try { foreach (var c in Uia.Children(node)) queue.Enqueue(c); }
            catch { /* nút vừa biến mất */ }
        }
        return null;
    }

    /// <summary>Như <see cref="FindChrome"/> nhưng chờ tới khi thấy.</summary>
    public static AutomationElement RequireChrome(
        AutomationElement root, string automationId, string? skipId = null, TimeSpan? timeout = null) =>
        Waits.For(() => FindChrome(root, automationId, skipId),
                  $"control AutomationId=「{automationId}」", timeout);

    // ── Tìm cửa sổ dialog ───────────────────────────────────────────────────

    /// <summary>
    /// Tìm cửa sổ dialog theo AutomationId, có đường dự phòng theo TIÊU ĐỀ và
    /// theo processId.
    ///
    /// <para><b>Ghi chú sửa sai (2026-08-11).</b> Hàm này ra đời từ một chẩn đoán
    /// SAI: rằng <c>app.Window(id)</c> bỏ sót modal-lồng-modal. Không phải —
    /// <c>GetAllTopLevelWindows</c> chính là "con của desktop lọc theo processId",
    /// mà modal của WinForms vẫn là cửa sổ top-level, nên nó thấy được
    /// <c>frm203043</c>. Thủ phạm thật là <see cref="ClickModalOpener"/> (xem đó).
    /// Giữ lại vì ba đường tìm vẫn rẻ và làm luồng đỡ giòn, nhưng ĐỪNG đọc nó như
    /// bằng chứng về hành vi của UIA.</para>
    /// </summary>
    public static Window? FindDialogWindow(OchaApp app, string automationId, string titleFragment)
    {
        // 1) Đường chuẩn.
        var w = app.Window(automationId);
        if (w is not null) return w;

        // 2) Theo tiêu đề, vẫn trong danh sách top-level.
        w = app.WindowByTitle(titleFragment);
        if (w is not null) return w;

        // 3) Quét desktop theo processId — bắt được modal lồng modal mà
        //    GetAllTopLevelWindows bỏ sót.
        try
        {
            var pid = app.ProcessId;
            foreach (var child in OchaApp.SharedAutomation.GetDesktop().FindAllChildren())
            {
                try
                {
                    if (child.Properties.ProcessId.ValueOrDefault != pid) continue;
                    if (!Uia.IsOnScreen(child)) continue;
                    if (!Txt.Same(Uia.AutomationIdOf(child), automationId) &&
                        !Txt.Has(Uia.NameOf(child), titleFragment)) continue;
                    return child.AsWindow();
                }
                catch { /* cửa sổ vừa đóng */ }
            }
        }
        catch { /* desktop bận */ }

        return null;
    }

    /// <summary>Mọi cửa sổ đang hiện của app — dùng khi <see cref="FindDialogWindow"/> trượt.</summary>
    public static string DescribeVisibleWindows(OchaApp app)
    {
        var lines = new List<string>();
        try
        {
            foreach (var w in app.Windows())
                lines.Add($"   top-level id='{Uia.AutomationIdOf(w)}' name='{Uia.NameOf(w)}'");
        }
        catch (Exception e) { lines.Add($"   (loi liet ke top-level: {e.Message})"); }

        try
        {
            var pid = app.ProcessId;
            foreach (var c in OchaApp.SharedAutomation.GetDesktop().FindAllChildren())
            {
                try
                {
                    if (c.Properties.ProcessId.ValueOrDefault != pid || !Uia.IsOnScreen(c)) continue;
                    lines.Add($"   desktop-child id='{Uia.AutomationIdOf(c)}' name='{Uia.NameOf(c)}'");
                }
                catch { }
            }
        }
        catch (Exception e) { lines.Add($"   (loi quet desktop: {e.Message})"); }

        return lines.Count == 0 ? "   (khong thay cua so nao)" : string.Join("\n", lines);
    }

    // ── Bấm nút mở hộp thoại MODAL ──────────────────────────────────────────

    /// <summary>
    /// Bấm một nút mà trình xử lý của nó gọi <c>ShowDialog()</c>.
    ///
    /// <para><b>Phải là chuột VẬT LÝ, không được dùng <see cref="Uia.Click"/>.</b>
    /// Uia.Click ưu tiên <c>InvokePattern.Invoke()</c>, và provider UIA của WinForms
    /// thực thi Invoke ĐỒNG BỘ trên luồng UI của app: lời gọi chỉ trả về khi
    /// <c>btnF9_Click</c> chạy xong. Mà <c>btnF9_Click</c> gọi <c>ShowDialog()</c> —
    /// nó chỉ xong khi NGƯỜI DÙNG đóng hộp thoại. Kết quả: bên test đứng chờ tới
    /// khi UIA hết giờ rồi ném 「UIA Timeout」, trong khi hộp thoại đã mở ngon lành
    /// từ giây đầu. Đo được ngày 2026-08-11: mất đúng 20s (run.defaultTimeout) rồi
    /// ném, ảnh chụp cho thấy frm203043 đang mở.</para>
    ///
    /// <para>Chuột vật lý (<c>mouse_event</c>) chỉ đẩy sự kiện vào hàng đợi thông
    /// điệp của Windows rồi trả về ngay — không có lời gọi chéo tiến trình nào để
    /// mà treo. Đây cũng là lý do F11 (mở <c>ContextMenuStrip</c> bằng
    /// <c>Show()</c>, không chặn) thì Uia.Click lại chạy tốt: khác nhau ở
    /// <c>Show()</c> hay <c>ShowDialog()</c>, không phải ở nút nào.</para>
    /// </summary>
    public static void ClickModalOpener(AutomationElement button, TestTrace? trace = null)
    {
        var (x, y) = Uia.Center(button);
        if (x <= 0 && y <= 0)
        {
            // Không có toạ độ dùng được (nút bị che / chưa vẽ) — đành chịu rủi ro
            // treo còn hơn click trượt ra nền màn hình.
            trace?.Note("nut khong co toa do man hinh — dung Uia.Click (co the treo)");
            Uia.Click(button);
            return;
        }
        Uia.LeftClickPhysical(x, y);
    }

    // ── Mở / đóng ───────────────────────────────────────────────────────────

    /// <summary>
    /// AutomationId của mục submenu mở <c>frm203042</c> (frm203002.Designer.cs).
    ///
    /// <para><b>Thực tế không bao giờ khớp.</b> Đo ngày 2026-08-11: MỌI
    /// <c>ToolStripMenuItem</c> của form này đều có AutomationId RỖNG trong cây UIA
    /// (cầu MSAA→UIA của WinForms không đẩy <c>Name</c> của designer sang). Nên
    /// <see cref="MenuItemText"/> mới là đường đi thật, còn hằng này chỉ là đường
    /// thử đầu tiên cho rẻ.</para>
    /// </summary>
    public const string MenuItemId = "IDM_CmtAuto";

    /// <summary>
    /// Chữ trên mục menu. Đây là cách nhận diện DUY NHẤT chạy được — xem
    /// <see cref="MenuItemId"/>. Khớp theo "chứa" nên tiền tố số của WinForms
    /// (「６ コメント自動入力登録」) không làm hỏng.
    /// </summary>
    public const string MenuItemText = "コメント自動入力登録";

    /// <summary>
    /// F11 → オプション → コメント自動入力登録.
    ///
    /// <para>Dialog đang mở sẵn thì trả về luôn — các testcase nối tiếp nhau trong
    /// một fixture, testcase trước có thể đã để nó mở.</para>
    /// </summary>
    public static Window OpenList(OchaApp app, Window screen, TestTrace? trace = null)
    {
        var already = FindDialogWindow(app, ListId, ListTitleFragment);
        if (already is not null)
        {
            trace?.Note($"dialog {ListId} da mo san — dung lai");
            return already;
        }

        var opened = KarteAutoCalcMenu.OpenSentakuMenu(app, screen, trace);
        if (opened.Popup is null)
            throw new InvalidOperationException(
                $"Khong mo duoc menu 選択: {opened.Reason}. Chay Tc0 (-Diagnostics) de co " +
                "danh sach cua so + MenuItem dang hien.");

        if (!KarteAutoCalcMenu.ClickOptionSubItem(
                app, opened.Popup, MenuItemId, MenuItemText, out var why, trace))
            throw new InvalidOperationException(
                $"Khong click duoc muc menu: {why}. Chay Tc0 (-Diagnostics) de xem ten thuc te.");

        var dialog = Waits.TryFor(() => FindDialogWindow(app, ListId, ListTitleFragment),
                                  TestSettings.Current.Run.DefaultTimeout)
            ?? throw new InvalidOperationException(
                $"Click 「{MenuItemText}」 xong nhung khong thay {ListId}. Cua so dang hien:\n" +
                DescribeVisibleWindows(app));

        // initProc() nạp lưới xong chưa. Tìm bằng bề rộng — lưới nằm nông, còn
        // duyệt sâu sẽ lún vào 1.764 dòng của chính nó.
        RequireChrome(dialog, ListGridId, skipId: null, TestSettings.Current.Run.DefaultTimeout);
        return dialog;
    }

    /// <summary>
    /// F9 選択 trên 一覧 → <c>frm203043</c>.
    ///
    /// <para>Bấm bằng nút F9 thật của thanh phím chứ không gửi VK_F9: form dùng
    /// <c>btnF9_Click</c> (frm203042.cs:117-124) và nút luôn có mặt, còn phím chỉ tới
    /// được khi tiêu điểm nằm đúng chỗ.</para>
    ///
    /// <para>Và bấm bằng CHUỘT VẬT LÝ — xem <see cref="ClickModalOpener"/> giải
    /// thích vì sao Invoke sẽ treo ở đây.</para>
    /// </summary>
    public static Window OpenRegister(OchaApp app, Window list, TestTrace? trace = null)
    {
        var already = FindDialogWindow(app, RegisterId, RegisterTitleFragment);
        if (already is not null)
        {
            trace?.Note($"dialog {RegisterId} da mo san — dung lai");
            return already;
        }

        trace?.Step("F9 選択 tren 一覧");
        // FindChrome, KHÔNG Uia.ById: lưới 1.764 dòng làm duyệt sâu hết giờ UIA.
        var f9 = FindChrome(list, "btnF9", ListGridId)
            ?? throw new InvalidOperationException(
                $"Khong thay btnF9 tren {ListId}. Chay Tc0 (-Diagnostics) roi sua ten nut.");

        // Chuột vật lý cần đúng cửa sổ nằm trên: 一覧 phải đang là foreground.
        try
        {
            var hwnd = list.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero) Uia.ForceForeground(hwnd);
        }
        catch (Exception ex) { trace?.Note($"canh bao khi dua 一覧 len foreground: {ex.Message}"); }

        ClickModalOpener(f9, trace);
        Waits.Step();

        return Waits.TryFor(() => FindDialogWindow(app, RegisterId, RegisterTitleFragment),
                            TestSettings.Current.Run.DefaultTimeout)
            ?? throw new InvalidOperationException(
                $"F9 選択 xong nhung khong thay {RegisterId}. Cua so dang hien:\n" +
                DescribeVisibleWindows(app));
    }

    /// <summary>F10 戻る — đóng mà không ghi gì.</summary>
    public static void Close(OchaApp app, Window dialog)
    {
        // Cũng chuột vật lý: 戻る có thể hỏi 「破棄しますか？」 khi lưới đang bẩn, và
        // lúc đó Invoke lại treo y như F9.
        var f10 = FindChrome(dialog, "btnF10", ListGridId);
        if (f10 is not null) { ClickModalOpener(f10); }
        else { Uia.SendKey(InpP1Dialogs.Vk.F10); }
        Waits.Step();
    }
}
