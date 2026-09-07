using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.KarteCmtBuiCaret;

/// <summary>
/// Lái cặp <c>frm203011</c> → <c>frm203012</c> → <c>frm902003</c> để đo đúng MỘT hàm:
/// <c>frm203012.btnF1_Click</c> (frm203012.cs:187-215).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HÀM ĐANG ĐO, CHÉP NGUYÊN VĂN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   string msg = txtValue.Text;
///   int idx = txtValue.SelectionStart;
///   if (idx == txtValue.Text.Length - 2 &amp;&amp; msg.Substring(idx, 2) == Environment.NewLine)
///       msg = msg.Substring(0, idx + 2) + pData.strBui1 + msg.Substring(idx + 2);   // +2
///   else
///       msg = msg.Substring(0, idx) + pData.strBui1 + msg.Substring(idx);
///   txtValue.Text = msg;
///   txtValue.Focus();
///   txtValue.SelectionStart = idx + (pData.strBui1 != null ? pData.strBui1.Length : 0);  // ← không bù 2
/// </code>
/// Nhánh trên dời ĐIỂM CHÈN đi 2 ký tự (CRLF) nhưng dòng tính caret dùng CHUNG cho cả hai
/// nhánh và không cộng bù. Suy ra: ở nhánh newline caret WinForm lùi đúng 2 ký tự so với
/// cuối chuỗi 部位 vừa chèn, tức nằm GIỮA cụm glyph.
///
/// <b>「Suy ra」 — và đó chính là lý do có luồng này.</b> Cả hai kỳ vọng trong spec
/// Playwright <c>bui-caret-newline-branch.spec.ts</c> đều là chuỗi do TypeScript dựng từ
/// công thức đọc trong C#, chưa đo lần nào trên app thật. Luồng này đo.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐO OUTPUT, KHÔNG ĐO CARET
/// ═══════════════════════════════════════════════════════════════════════════════
/// Không có chỗ nào ở đây đọc <c>SelectionStart</c>. Hai lý do:
/// <list type="number">
/// <item>Cả repo chưa dùng <c>TextPattern</c> lần nào và trình cung cấp text của
///   WinForms <c>TextBox</c> qua cầu MSAA→UIA không đáng tin — một phép đo trả về 0 vì
///   pattern vắng mặt trông y hệt một phép đo trả về 0 vì caret thật ở 0.</item>
/// <item>Câu hỏi cần trả lời là <b>「có port cái lệch này sang web không」</b>, mà cái
///   quyết định điều đó là CHUỖI ĐẦU RA, không phải vị trí con trỏ. Caret chỉ lộ ra
///   thành output ở hai chỗ: gõ thêm một ký tự, hoặc bấm F1 部位 lần nữa — và đó đúng là
///   hai phép đo của luồng này.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// DỰNG TRẠNG THÁI MÀ KHÔNG ĐƯỢC BẤM ENTER
/// ═══════════════════════════════════════════════════════════════════════════════
/// Trên WinForm, cách làm tay là 「gõ ABC → Enter → bấm ← một lần」. Bộ test KHÔNG đi
/// đường đó: Enter trong <c>txtValue</c> có thể rơi vào <c>txtValue_KeyDown</c> →
/// <c>fixProc</c> → <b>ghi <c>mst_cmt2.use_cnt</c> và đóng form</b> (xem
/// <see cref="KarteCmtDialog"/>). Thay bằng:
/// <code>
///   1. ValuePattern.SetValue("ABC\r\n")     ← không sinh phím nào
///   2. đọc lại để chắc chuỗi đã vào đúng    ← SetValue có thể bị control từ chối
///   3. Ctrl+Home  → caret 0                 ← Home KHÔNG nằm trong switch của formBase_KeyDown
///   4. → × 3      → caret 3                 ← ngay TRƯỚC \r\n
/// </code>
/// Bước 3-4 dùng mũi tên chứ không dùng End: <b>End là 確定</b> ở màn này.
/// Riêng <see cref="TryArmAtBlankLine"/> (mốc đối chứng) đi Ctrl+Home rồi ↓ — cũng không End.
/// </summary>
public sealed class KarteCmtBuiFlow
{
    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;

    public KarteCmtBuiFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
    }

    /// <summary>Chữ mồi trước dấu xuống dòng (<c>karteCmt.probeText</c>, mặc định 「ABC」).</summary>
    public static string BaseText => TestSettings.Current.KarteCmt.ProbeText;

    /// <summary>Nội dung ô テキスト ở trạng thái kích hoạt: chữ mồi + CRLF.</summary>
    public static string ArmedText => BaseText + "\r\n";

    // ═════════════════════════════════════════════════════════════════════════
    // Tìm cửa sổ
    // ═════════════════════════════════════════════════════════════════════════

    public Window? GroupGrid() =>
        KarteCmtDialog.Find(_app, _screen.Window, KarteCmtDialog.IsGroupGrid);

    public Window? CmtList() =>
        KarteCmtDialog.Find(_app, _screen.Window, KarteCmtDialog.IsCmtList);

    // ═════════════════════════════════════════════════════════════════════════
    // Điều hướng
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// F6 コメント từ 診療入力 → <c>frm203011</c> (frm203002.cs:4716-4734).
    ///
    /// <para>F6 chỉ cần con trỏ ĐANG ĐỨNG TRÊN MỘT DÒNG: nó đọc
    /// <c>grdRegi.CurrentCellAddress.Y</c> để lấy 32 ô 部位 của dòng đó (:4720-4731).
    /// Vì thế phải click một ô trước — và click cột <b>療法・処置</b> chứ không phải cột
    /// 部位: <c>grdRegi_CellClick</c> bung 部位選択 khi cột được click là <c>RegiCol.bui</c>
    /// (:1686-1697).</para>
    ///
    /// <para>Trả null kèm lý do thay vì ném — probe cần đi tiếp để in nốt các câu hỏi sau.
    /// (Bước F6 này trùng việc với <c>PerioKensaOrderFlow.OpenKarteSelect</c>, viết trước
    /// và mang theo <c>TreatmentGridOps</c>/<c>RegiRow</c> để chọn ĐÚNG dòng 処置 mà luồng
    /// đó cần. Ở đây dòng nào cũng được, nên bản này tự đi bằng lưới trần thay vì kéo cả
    /// hạ tầng kia sang.)</para>
    /// </summary>
    public Window? OpenGroupGrid(out string reason, TestTrace? trace = null)
    {
        var already = GroupGrid();
        if (already is not null) { reason = "da mo san"; return already; }

        if (!FocusAnyGridRow(out var focusWhy, trace))
        {
            reason = $"khong dat duoc con tro len dong nao cua grdRegi: {focusWhy}";
            return null;
        }

        // Phòng hờ: click trượt sang cột 部位 thì 部位選択 bung ra và chắn mất F6.
        var stray = ToothSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(2));
        if (stray is not null)
        {
            trace?.Note("click lam bung 部位選択 — dong bang F12 戻る roi di tiep");
            ToothSelectDialog.Close(_app, stray, trace);
        }

        trace?.Step("F6 コメント (frm203002) → frm203011");
        ToothSelectDialog.FocusWindow(_screen.Window);
        if (!Uia.SendKey(Vk.F6))
        {
            var btn = KarteAutoCalc.KarteAutoCalcDialog.FindChromeIdOrName(_screen.Window, "btnF6", "コメント");
            if (btn is null) { reason = "SendInput hong ma cung khong thay nut btnF6 (コメント)"; return null; }
            Uia.MouseClick(btn);
        }

        var dialog = Waits.TryFor(GroupGrid, TimeSpan.FromSeconds(15));
        reason = dialog is null
            ? "bam F6 xong ma frm203011 khong hien ra. Cua so dang mo: " + KarteCmtDialog.DescribeWindows(_app)
            : "ok";
        return dialog;
    }

    /// <summary>
    /// Click nút group thứ <paramref name="groupNo"/> của <c>frm203011</c> →
    /// <c>frm203012</c> (<c>btn01_Click</c>, frm203011.cs:249-269).
    ///
    /// <para>Nút vượt quá số dòng <c>mst_cmt2_grp</c> bị <c>Visible = false</c> nên KHÔNG
    /// có trong cây UIA — không thấy thì đổi <c>karteCmt.groupNo</c>, đừng đỏ.</para>
    /// </summary>
    public Window? OpenCmtList(Window groupGrid, int groupNo, out string reason, TestTrace? trace = null)
    {
        var already = CmtList();
        if (already is not null) { reason = "da mo san"; return already; }

        var id = KarteCmtDialog.GroupButtonId(groupNo);
        var button = Uia.ById(groupGrid, id);
        if (button is null)
        {
            reason = $"khong thay nut group 「{id}」 tren frm203011 — nhieu kha nang mst_cmt2_grp " +
                     $"co it hon {groupNo} dong nen nut do Visible=false (frm203011.cs:200-207). " +
                     "Doi karteCmt.groupNo.";
            return null;
        }

        trace?.Step($"click nut group {id} 「{Txt.N(Uia.NameOf(button))}」 → frm203012");
        // App này KHÔNG nhận InvokePattern ở bất kỳ control nào (README mục 8b) — phải
        // bắn chuột thật, và phải kiểm rect trước, kẻo cú click rơi ra (0,0) tức DESKTOP.
        var rect = Uia.RectOf(button);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
        {
            reason = $"nut {id} doc ra rect RONG ({rect?.ToString() ?? "null"}) — click vao do se ban " +
                     "chuot ra goc trai tren DESKTOP chu khong vao app";
            return null;
        }
        var (x, y) = Uia.Center(button);
        Uia.LeftClickPhysical(x, y);

        var dialog = Waits.TryFor(CmtList, TimeSpan.FromSeconds(15));
        reason = dialog is null
            ? $"click {id} xong ma frm203012 khong hien ra. Cua so dang mo: " + KarteCmtDialog.DescribeWindows(_app)
            : "ok";
        return dialog;
    }

    /// <summary>
    /// Đóng về 診療入力 bằng <b>F10 戻る</b> cho cả hai form.
    ///
    /// <para>KHÔNG dùng Escape/End/F9: cả ba đều là 確定 ở <c>frm203012</c> và đều ghi
    /// <c>mst_cmt2.use_cnt</c>. Đây là lý do luồng này không cần cờ ghi DB nào.</para>
    /// </summary>
    public void CloseAll(TestTrace? trace = null)
    {
        ClosePerioExamIfOpen(trace);

        var cmt = CmtList();
        if (cmt is not null)
        {
            PressFKey(cmt, "btnF10", "戻る", Vk.F10, "F10 戻る (frm203012)", trace);
            Waits.TryUntil(() => CmtList() is null, TimeSpan.FromSeconds(10));
        }

        var grp = GroupGrid();
        if (grp is not null)
        {
            PressFKey(grp, "btnF10", "戻る", Vk.F10, "F10 戻る (frm203011)", trace);
            Waits.TryUntil(() => GroupGrid() is null, TimeSpan.FromSeconds(10));
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Ô テキスト
    // ═════════════════════════════════════════════════════════════════════════

    public AutomationElement TextBox(Window cmtList) =>
        Uia.RequireById(cmtList, KarteCmtDialog.TextBoxId);

    /// <summary>
    /// Nội dung ô テキスト, <b>NGUYÊN VĂN</b>.
    ///
    /// <para>KHÔNG dùng <c>Uia.ValueOf</c>: khi ô rỗng nó rơi xuống <c>NameOf</c> và trả về
    /// nhãn/tên control — 「ô rỗng」 sẽ đọc ra một chuỗi khác rỗng. Và tuyệt đối không đi
    /// qua <c>Txt.N</c>: NFKC + biến <c>\r\n</c> thành dấu cách, tức xoá sạch đúng cái
    /// bằng chứng đang đo.</para>
    /// </summary>
    public string ReadText(Window cmtList)
    {
        var e = TextBox(cmtList);

        try
        {
            var value = e.Patterns.Value.PatternOrDefault;
            if (value is not null) return value.Value.ValueOrDefault ?? "";
        }
        catch { /* pattern vắng mặt → thử đường dưới */ }

        try
        {
            var legacy = e.Patterns.LegacyIAccessible.PatternOrDefault;
            if (legacy is not null) return legacy.Value.ValueOrDefault ?? "";
        }
        catch { /* nt */ }

        throw new InvalidOperationException(
            $"khong doc duoc {KarteCmtDialog.TextBoxId}: khong co ValuePattern lan LegacyIAccessible.Value");
    }

    /// <summary>
    /// Ghi thẳng nội dung ô テキスト bằng <c>ValuePattern.SetValue</c> — <b>không sinh phím
    /// nào</b>, nên không có đường nào chạm tới Enter/確定.
    ///
    /// <para>Trả về false khi control từ chối (đọc lại không khớp). Đây KHÔNG phải chuyện
    /// lý thuyết: <c>Uia.SetText</c> của nền chung cố tình gõ phím vì mấy ô của
    /// <c>frm203002</c> treo logic ở <c>KeyDown</c>; ở đây thì ngược lại — <b>gõ phím mới
    /// là cái nguy hiểm</b>. Không SetValue được thì testcase phải Ignore chứ đừng đi
    /// đường Enter.</para>
    /// </summary>
    public bool TrySetText(Window cmtList, string text, TestTrace? trace = null)
    {
        var e = TextBox(cmtList);
        try
        {
            var value = e.Patterns.Value.PatternOrDefault;
            if (value is null)
            {
                trace?.Note("txtValue KHONG co ValuePattern");
                return false;
            }
            value.SetValue(text);
        }
        catch (Exception ex)
        {
            trace?.Note($"ValuePattern.SetValue nem: {ex.GetType().Name}: {ex.Message}");
            return false;
        }

        Thread.Sleep(120);
        var actual = ReadText(cmtList);
        var ok = actual == text;
        trace?.Note($"SetValue {Txt.Vis(text)} → doc lai {Txt.Vis(actual)} — {(ok ? "khop" : "KHONG khop")}");
        return ok;
    }

    /// <summary>
    /// Dựng trạng thái kích hoạt: ô テキスト = <see cref="ArmedText"/>, caret ở
    /// <c>BaseText.Length</c> — tức <b>ngay trước</b> <c>\r\n</c> cuối, đúng điều kiện
    /// <c>idx == Text.Length - 2</c> của nhánh đang đo.
    ///
    /// <para>Caret đặt bằng Ctrl+Home rồi → đúng <c>BaseText.Length</c> lần. Không dùng
    /// End (= 確定) và không dùng chuột (click chỉ đặt caret gần chỗ bấm).</para>
    ///
    /// <para><b>Không tự khẳng định caret đã đúng</b> — không có cách đọc caret đáng tin.
    /// Việc kiểm là của <see cref="VerifyCaretByTyping"/>, và testcase phải gọi nó TRƯỚC
    /// khi tin vào bất cứ phép đo nào sau đây.</para>
    /// </summary>
    public bool TryArmBeforeNewLine(Window cmtList, TestTrace? trace = null)
    {
        if (!TrySetText(cmtList, ArmedText, trace)) return false;

        trace?.Step($"Ctrl+Home roi → x{BaseText.Length} — caret ve ngay TRUOC \\r\\n cuoi");
        FocusTextBox(cmtList);
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.HOME);
        Thread.Sleep(80);
        for (var i = 0; i < BaseText.Length; i++)
        {
            Uia.SendKey(Vk.Right);
            Thread.Sleep(60);
        }
        return true;
    }

    /// <summary>
    /// Mốc ĐỐI CHỨNG: cùng ô テキスト <see cref="ArmedText"/> nhưng caret ở DÒNG TRỐNG bên
    /// dưới (cuối chuỗi) ⇒ <c>idx == Text.Length</c> ⇒ rơi vào nhánh <c>else</c>, nơi công
    /// thức caret của WinForm là ĐÚNG.
    ///
    /// <para>Không có mốc này thì không loại trừ được giả thuyết 「app chèn 部位 kiểu đó ở
    /// mọi trường hợp」 — quan sát sẽ không thành kết luận. Ctrl+Home rồi ↓ (không End).</para>
    /// </summary>
    public bool TryArmAtBlankLine(Window cmtList, TestTrace? trace = null)
    {
        if (!TrySetText(cmtList, ArmedText, trace)) return false;

        trace?.Step("Ctrl+Home roi ↓ — caret xuong dong TRONG (cuoi chuoi)");
        FocusTextBox(cmtList);
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.HOME);
        Thread.Sleep(80);
        Uia.SendKey(Vk.Down);
        Thread.Sleep(80);
        return true;
    }

    /// <summary>
    /// Kiểm caret bằng cách GÕ MỘT KÝ TỰ rồi đọc chuỗi ra — cách duy nhất ở đây không
    /// phụ thuộc <c>TextPattern</c>.
    ///
    /// <para>Với ô 「ABC\r\n」: caret ở 3 cho ra 「ABCZ\r\n」, caret ở cuối cho ra
    /// 「ABC\r\nZ」 — phân biệt được. Trả về chuỗi đọc lại; người gọi so với kỳ vọng.</para>
    ///
    /// <para>Hàm này LÀM BẨN ô text, nên gọi xong phải dựng lại trạng thái.</para>
    /// </summary>
    public string VerifyCaretByTyping(Window cmtList, string probeChar = "Z", TestTrace? trace = null)
    {
        FocusTextBox(cmtList);
        trace?.Step($"go 「{probeChar}」 de lo ra vi tri caret");
        Keyboard.Type(probeChar);
        Thread.Sleep(150);
        var text = ReadText(cmtList);
        trace?.Note($"sau khi go: {Txt.Vis(text)}");
        return text;
    }

    /// <summary>
    /// Gõ thêm ký tự vào ô テキスト tại đúng chỗ caret đang đứng.
    ///
    /// <para><b>Không click, không bấm mũi tên trước.</b> <c>btnF1_Click</c> kết thúc bằng
    /// <c>txtValue.Focus()</c> (frm203012.cs:209) nên con trỏ THẬT đang ở chỗ nó vừa đặt;
    /// đụng vào là mất luôn thứ đang đo.</para>
    /// </summary>
    public string TypeAtCaret(Window cmtList, string text, TestTrace? trace = null)
    {
        trace?.Step($"go 「{text}」 tai cho caret dang dung");
        Keyboard.Type(text);
        Thread.Sleep(150);
        var value = ReadText(cmtList);
        trace?.Note($"sau khi go: {Txt.Vis(value)}");
        return value;
    }

    /// <summary>
    /// Đặt con trỏ lưới lên một dòng bất kỳ của <c>grdRegi</c>, cột <b>療法・処置</b>.
    ///
    /// <para>Thử lần lượt từ dòng đầu vì hai lý do: dòng ngoài khung nhìn đọc ra rect RỖNG
    /// (cầu MSAA→UIA chỉ dựng phần tử cho dòng ĐANG NHÌN THẤY — PROBE-GUIDELINE 3.1), và
    /// dòng 日計/合計 tuy click được nhưng không phải dòng 処置. F6 không kén dòng nên
    /// dòng nào bám được là đủ.</para>
    /// </summary>
    private bool FocusAnyGridRow(out string reason, TestTrace? trace)
    {
        var rows = _screen.Regi.Grid.RowElements(limit: 12);
        if (rows.Count == 0) { reason = "grdRegi khong doc duoc dong nao"; return false; }

        for (var i = 0; i < rows.Count; i++)
        {
            var cells = Uia.Children(rows[i]).ToList();
            if (cells.Count <= RegiGrid.Col.Ryo) continue;

            var cell = cells[RegiGrid.Col.Ryo];
            var rect = Uia.RectOf(cell);
            if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0) continue;

            var (x, y) = Uia.Center(cell);
            trace?.Step($"dat con tro len dong {i} cua grdRegi (cot 療法・処置)");
            Uia.LeftClickPhysical(x, y);
            Waits.Step();
            reason = "ok";
            return true;
        }

        reason = $"ca {rows.Count} dong doc duoc deu cho rect RONG o cot 療法・処置 — luoi dang bi tab " +
                 "khac che, hoac moi dong deu nam ngoai khung nhin";
        return false;
    }

    /// <summary>
    /// Bấm một phím F <b>của đúng form muốn nhắm</b>.
    ///
    /// <para>☠ <b>Đừng gửi phím F bằng <c>FocusWindow</c> + <c>SendKey</c> ở luồng này.</b>
    /// <c>frm203011</c> và <c>frm203012</c> chồng lên nhau trong CÙNG một cửa sổ top-level,
    /// và <c>ForceForeground</c> lên 「cửa sổ」 con không quyết định được form nào nhận
    /// phím. Đo thật 2026-09-07: <c>FocusWindow(cmtList)</c> rồi <c>SendKey(F1)</c> làm
    /// phím rơi vào <b>frm203011</b>, nơi F1 là 「病検」 ⇒ app mở 歯周基本検査 (frm203028)
    /// chứ không mở 部位選択. Log lúc đó báo 「F1 không mở được 部位選択」 — đổ oan cho app,
    /// đúng bẫy PROBE-GUIDELINE 3.4; chỉ có tấm ảnh mới nói ra sự thật.</para>
    ///
    /// <para>Và hậu quả không dừng ở một phép đo hỏng: bấm F1 lần nữa làm
    /// <c>frm203011</c> gọi <c>showDialog</c> lên một form ĐANG VISIBLE, app không bắt và
    /// bung hộp thoại crash 「Form that is already visible cannot be displayed as a modal
    /// dialog box」 (cùng lỗi đã ghi ở <c>PerioKensaOrderFlow.OpenSettings</c>).</para>
    ///
    /// <para>Nên: <b>click thẳng vào nút trên thanh phím của chính form đó</b> — nút nằm
    /// trong cây con của form nên không thể nhầm. Chỉ khi không thấy nút mới quay về
    /// đường phím, và khi đó phải focus một CONTROL BÊN TRONG form (không phải cửa sổ):
    /// đúng cách mà <see cref="FocusTextBox"/> làm, và đó là lý do các bước gõ chữ chạy
    /// đúng trong khi các bước gửi phím F thì không.</para>
    /// </summary>
    private bool PressFKey(Window form, string buttonId, string nameFragment, ushort vk,
                           string what, TestTrace? trace)
    {
        trace?.Step(what);

        var btn = KarteAutoCalc.KarteAutoCalcDialog.FindChromeIdOrName(form, buttonId, nameFragment);
        if (btn is not null)
        {
            // App này KHÔNG nhận InvokePattern ở bất kỳ control nào (README mục 8b) —
            // phải bắn chuột thật, và luôn kiểm rect kẻo click rơi ra (0,0) tức DESKTOP.
            var rect = Uia.RectOf(btn);
            if (rect is not null && rect.Value.Width > 0 && rect.Value.Height > 0)
            {
                var (x, y) = Uia.Center(btn);
                trace?.Note($"click nut 「{buttonId}」 cua {Uia.AutomationIdOf(form)} tai ({x},{y})");
                Uia.LeftClickPhysical(x, y);
                Waits.Step();
                return true;
            }
            trace?.Note($"nut 「{buttonId}」 co rect RONG — quay ve duong phim");
        }

        trace?.Note($"khong thay nut 「{buttonId}」 — focus control BEN TRONG form roi gui phim");
        FocusInside(form);
        return Uia.SendKey(vk);
    }

    /// <summary>Đưa tiêu điểm vào một control BÊN TRONG form (không phải cửa sổ).</summary>
    private void FocusInside(Window form)
    {
        ToothSelectDialog.FocusWindow(form);
        try
        {
            var inner = Uia.ById(form, KarteCmtDialog.TextBoxId)
                        ?? Uia.ById(form, KarteCmtDialog.GroupButtonId(1));
            inner?.Focus();
        }
        catch { /* WinForms có lúc không nhận Focus qua UIA */ }
        Thread.Sleep(120);
    }

    /// <summary>
    /// 歯周基本検査 (<c>frm203028</c>) có đang mở không — nếu có thì đóng bằng F10 戻る và
    /// trả về true.
    ///
    /// <para>Nó chỉ mở ra khi phím F1 đi lạc sang <c>frm203011</c>. Phải đóng NGAY và
    /// KHÔNG được bấm F1 thêm lần nào (xem <see cref="PressFKey"/>). ⚠️ F1 của chính
    /// <c>frm203028</c> là 「デフォルト設定」 — <c>btnF1_Click</c> hỏi Q00002 rồi
    /// <c>setDefalut()</c> GHI <c>kihon_def</c> (frm203028.cs) — tuyệt đối không gửi F1
    /// vào đây.</para>
    /// </summary>
    private bool ClosePerioExamIfOpen(TestTrace? trace)
    {
        var perio = KarteAutoCalc.KarteAutoCalcDialog.FindDialogWindow(
                        _app, PerioExamId, PerioExamTitle, _screen.Window)
                    ?? KarteAutoCalc.KarteAutoCalcDialog
                        .FindNested(_screen.Window, PerioExamId, PerioExamTitle)?.AsWindow();
        if (perio is null) return false;

        trace?.Note("PHAT HIEN 歯周基本検査 (frm203028) dang mo — F1 da di lac sang frm203011");
        PressFKey(perio, "btnF10", "戻る", Vk.F10, "F10 戻る (frm203028 — dong form mo nham)", trace);
        Waits.TryUntil(
            () => KarteAutoCalc.KarteAutoCalcDialog.FindNested(_screen.Window, PerioExamId, PerioExamTitle) is null,
            TimeSpan.FromSeconds(8));
        return true;
    }

    /// <summary>歯周基本検査 — mở ra khi F1 đi lạc sang <c>frm203011</c> (frm203011.cs:95).</summary>
    private const string PerioExamId = "frm203028";
    private const string PerioExamTitle = "歯周基本検査";

    /// <summary>
    /// Ô テキスト còn thao tác được không.
    ///
    /// <para><b>Cách rẻ nhất phát hiện 「có modal đang chắn」.</b> WinForms vô hiệu hoá form
    /// cha khi một hộp thoại modal mở ra, nên <c>IsEnabled = false</c> ở đây đồng nghĩa
    /// 「hộp thoại CÓ mở, chỉ là chưa tìm ra」 — khác hẳn 「phím không tới nơi」, và hai
    /// chuyện đó phải chữa ở hai chỗ khác nhau.</para>
    /// </summary>
    public bool TextBoxEnabled(Window cmtList)
    {
        try { return TextBox(cmtList).Properties.IsEnabled.ValueOrDefault; }
        catch { return false; }
    }

    /// <summary>
    /// Đưa tiêu điểm vào ô テキスト.
    ///
    /// <para>Bắt buộc trước khi gõ ký tự hoặc gửi Enter: <c>txtValue_KeyDown</c> chỉ chạy
    /// khi CHÍNH ô đó đang giữ tiêu điểm. Cửa sổ active mà tiêu điểm nằm ở lưới thì phím
    /// đi đường khác hẳn — và với Enter thì đó là hai kết cục ngược nhau (chèn xuống dòng
    /// so với 確定 + ghi DB).</para>
    /// </summary>
    public void FocusTextBox(Window cmtList)
    {
        ToothSelectDialog.FocusWindow(cmtList);
        try { TextBox(cmtList).Focus(); } catch { /* WinForms có lúc không nhận Focus qua UIA */ }
        Thread.Sleep(120);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // F1 部位
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Preset dùng để sinh 省略表示 — hai nhãn trên thanh phím của <c>frm902003</c>.</summary>
    public enum BuiPreset
    {
        /// <summary>F3 ３～３ — <c>setBui(1, 3, pos, 0)</c>, CHỈ trên vùng đang chọn (frm902003.cs:231).</summary>
        Incisors,

        /// <summary>F7 全顎 — cả 32 răng (frm902003.cs:272-278).</summary>
        WholeArch,
    }

    /// <summary>Kết cục một lần bấm F1 部位. <see cref="Reason"/> luôn nói được vì sao.</summary>
    public sealed record BuiInsert(bool Ok, string Reason, string TextBefore, string TextAfter)
    {
        /// <summary>Phần chuỗi mà app vừa chèn thêm, khi và chỉ khi nó NỐI vào đuôi chuỗi cũ.</summary>
        public string AppendedTail =>
            TextAfter.StartsWith(TextBefore, StringComparison.Ordinal)
                ? TextAfter[TextBefore.Length..]
                : "";

        public override string ToString() =>
            $"ok={Ok} {Txt.Vis(TextBefore)} → {Txt.Vis(TextAfter)} ({Reason})";
    }

    /// <summary>
    /// F1 部位 → <c>frm902003</c> → F11 全消去 → preset → End 確定, rồi đọc lại ô テキスト.
    ///
    /// <para><b>全消去 là bắt buộc mỗi lần.</b> <c>formControl.showDialog</c> dùng lại
    /// <c>Instance</c> của form, và bản Playwright đã đo được rằng lựa chọn răng của lần
    /// trước còn nguyên (「bẫy 3」) — không xoá thì lần thứ hai ra chuỗi cộng dồn của cả
    /// hai preset và mọi phép so sau đó vô nghĩa. Ở đây còn có
    /// <see cref="MeasureToothDialogRemembers"/> để kiểm chính điều đó trên WinForm.</para>
    ///
    /// <para>⚠️ End trong <see cref="ToothSelectDialog.Confirm"/> là 確定 của
    /// <c>frm902003</c> — nhưng nếu hộp thoại đó đã đóng mất thì cùng phím End rơi xuống
    /// <c>frm203012</c> và thành 確定 GHI DB. Vì vậy hàm này kiểm hộp thoại còn trên màn
    /// hình NGAY TRƯỚC khi gửi End.</para>
    /// </summary>
    public BuiInsert PickBui(Window cmtList, BuiPreset preset, TestTrace? trace = null)
    {
        var before = ReadText(cmtList);

        if (!PressFKey(cmtList, "btnF1", "部位", Vk.F1, $"F1 部位 (frm203012) — preset {preset}", trace))
            return new BuiInsert(false, "khong bam duoc F1 部位 cua frm203012", before, before);

        var tooth = KarteCmtDialog.WaitForToothDialog(_app, _screen.Window, cmtList, TimeSpan.FromSeconds(15));
        if (tooth is null)
        {
            // ĐỪNG kết luận 「F1 không mở được」 khi chưa hỏi: hộp thoại CÓ THỂ đang mở mà
            // chỉ là không tìm ra, và hai chuyện đó phải chữa ở hai chỗ khác hẳn nhau.
            // Ô text bị khoá = có modal đang chắn (PROBE-GUIDELINE 3.4).
            // Hỏi 「thật ra cái gì đã mở」 trước khi kết luận. Lần đo 17:10 báo 「F1 không mở
            // được 部位選択」 trong khi ảnh cho thấy 歯周基本検査 đang chềnh ềnh giữa màn —
            // tức phím đã tới frm203011 (F1 = 病検) chứ không tới frm203012.
            var perio = ClosePerioExamIfOpen(trace);
            var blocked = !TextBoxEnabled(cmtList);

            return new BuiInsert(false,
                (perio
                    ? "F1 mở nhầm 歯周基本検査 (frm203028) ⇒ phím đã tới frm203011 (F1 = 病検) chứ " +
                      "KHÔNG tới frm203012. Đã đóng lại bằng F10 戻る. TUYỆT ĐỐI đừng bấm F1 lần nữa: " +
                      "frm203011 sẽ showDialog một form ĐANG VISIBLE và app bung hộp thoại crash " +
                      "「Form that is already visible cannot be displayed as a modal dialog box」."
                    : blocked
                        ? "F1 CO mo mot modal nhung khong tim ra 部位選択 (frm902003) — txtValue bi khoa."
                        : "F1 khong mo duoc gi ca.") +
                " Cua so top-level dang mo: " + KarteCmtDialog.DescribeWindows(_app),
                before, before);
        }

        ToothSelectDialog.ClearAll(tooth, trace);
        switch (preset)
        {
            case BuiPreset.Incisors: ToothSelectDialog.SelectIncisors(tooth, trace); break;
            case BuiPreset.WholeArch: ToothSelectDialog.SelectWholeArch(tooth, trace); break;
        }

        if (!Uia.IsOnScreen(tooth))
            return new BuiInsert(false,
                "部位選択 bien mat TRUOC khi kip bam 確定 — KHONG gui End nua: phim do se roi xuong " +
                "frm203012 va thanh 確定 (fixProc → ghi mst_cmt2.use_cnt)",
                before, ReadText(cmtList));

        ToothSelectDialog.Confirm(tooth, trace);
        if (!Waits.TryUntil(() => !Uia.IsOnScreen(tooth), TimeSpan.FromSeconds(10)))
            return new BuiInsert(false, "bam End 確定 ma 部位選択 khong dong lai", before, ReadText(cmtList));

        // 省略表示 do buiData.getBui đọc thẳng SQL Server (frm902003.cs:939) nên phải chờ.
        var changed = Waits.TryUntil(() => ReadText(cmtList) != before, TimeSpan.FromSeconds(15));
        var after = ReadText(cmtList);
        trace?.Note($"sau khi chen 部位: {Txt.Vis(after)}");

        return changed
            ? new BuiInsert(true, "ok", before, after)
            : new BuiInsert(false,
                $"preset {preset} khong chen duoc gi vao o text — nhieu kha nang 歯牙情報 cua benh nhan " +
                "loai het rang cua preset nay (getBui tra chuoi rong ⇒ app chen chuoi rong)",
                before, after);
    }

    /// <summary>
    /// 部位選択 có nhớ lựa chọn của lần mở trước không — trả về số răng còn đánh dấu NGAY
    /// SAU khi mở, TRƯỚC khi xoá.
    ///
    /// <para>Câu hỏi này quyết định <see cref="PickBui"/> có bắt buộc phải 全消去 hay không.
    /// Bản Playwright đo được là CÓ nhớ; phía WinForm chưa ai đo. Hàm đóng hộp thoại bằng
    /// <b>F12 戻る</b> (không phải End) nên nó không chèn gì vào ô テキスト.</para>
    /// </summary>
    public (bool Ok, string Reason, int MarkedTeeth) MeasureToothDialogRemembers(
        Window cmtList, TestTrace? trace = null)
    {
        if (!PressFKey(cmtList, "btnF1", "部位", Vk.F1,
                       "F1 部位 lan nua — dem rang con danh dau TRUOC khi 全消去", trace))
            return (false, "khong bam duoc F1 部位", 0);

        var tooth = KarteCmtDialog.WaitForToothDialog(_app, _screen.Window, cmtList, TimeSpan.FromSeconds(15));
        if (tooth is null)
        {
            var perio = ClosePerioExamIfOpen(trace);
            return (false, perio
                ? "F1 mở nhầm 歯周基本検査 (đã đóng) — phím tới frm203011 chứ không tới frm203012"
                : "F1 khong mo duoc 部位選択 (hoac mo ma khong tim ra — xem PickBui)", 0);
        }

        int marked;
        try { marked = ToothSelectDialog.MarkedToothCount(tooth); }
        catch (Exception e) { ToothSelectDialog.Close(_app, tooth, trace); return (false, $"doc so rang loi: {e.Message}", 0); }

        // F12 戻る — KHÔNG End: End là 確定 và sẽ chèn thêm một chuỗi 部位 vào ô text.
        ToothSelectDialog.Close(_app, tooth, trace);
        return (true, "ok", marked);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hai công thức đang tranh nhau
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Chuỗi kỳ vọng khi gõ <paramref name="typed"/> ngay sau lần chèn 部位 đầu tiên, theo
    /// từng giả thuyết.
    ///
    /// <list type="bullet">
    /// <item><b>Web</b> — <c>pos = at + insert.length</c> (<c>lib/karte-cmt-text.ts</c>)
    ///   ⇒ caret ở CUỐI chuỗi 部位 ⇒ ký tự gõ tiếp nằm sau cùng.</item>
    /// <item><b>WinForm</b> — <c>SelectionStart = idx + strBui1.Length</c> KHÔNG bù 2
    ///   (frm203012.cs:211) ⇒ caret lùi 2 ⇒ ký tự gõ tiếp CHEN VÀO GIỮA cụm glyph, cách
    ///   đuôi đúng 2 ký tự.</item>
    /// </list>
    ///
    /// <para>Hai công thức chỉ phân biệt được khi <paramref name="bui"/> dài ≥ 2 — người
    /// gọi phải kiểm điều kiện đó trước.</para>
    /// </summary>
    public static string ExpectAfterTyping(string armed, string bui, string typed, bool winFormFormula) =>
        winFormFormula
            ? armed + bui[..^KarteCmtDialog.NewLineLength] + typed + bui[^KarteCmtDialog.NewLineLength..]
            : armed + bui + typed;

    /// <summary>
    /// Chuỗi kỳ vọng khi bấm F1 部位 LẦN THỨ HAI, theo từng giả thuyết.
    ///
    /// <para>Nhánh WinForm ở lần hai đi qua một chỗ đáng ghi lại: caret đang ở
    /// <c>idx = base + bui1.Length</c> còn chuỗi dài <c>base + 2 + bui1.Length</c>, nên vế
    /// đầu <c>idx == Text.Length - 2</c> <b>VẪN ĐÚNG</b> — chỉ có phép so
    /// <c>Substring(idx, 2) == NewLine</c> mới đẩy nó xuống <c>else</c>. Tức lần chèn thứ
    /// hai rơi vào nhánh thường <b>do hai ký tự cuối của cụm 部位 tình cờ không phải
    /// CRLF</b>, chứ không phải vì <c>idx</c> hết khớp. (Chú thích ở dòng 507-508 của spec
    /// Playwright nói nhẹ hơn thực tế chỗ này.)</para>
    /// </summary>
    public static string ExpectAfterSecondBui(string armed, string bui1, string bui2, bool winFormFormula) =>
        winFormFormula
            ? armed + bui1[..^KarteCmtDialog.NewLineLength] + bui2 + bui1[^KarteCmtDialog.NewLineLength..]
            : armed + bui1 + bui2;
}
