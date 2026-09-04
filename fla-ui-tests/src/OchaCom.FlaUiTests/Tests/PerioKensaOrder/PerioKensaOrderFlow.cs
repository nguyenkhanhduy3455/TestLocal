using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.PerioKensaOrder;

/// <summary>
/// Lái ba thứ mà luồng 検査順 cần, KHÔNG assert gì cả:
/// <code>
///   ① đổi 検査順      F11 選択 → ９ オプション → ２ 処置入力設定 → cboKensaOrder → F9 登録
///   ② dựng 部位病名行  click ô 部位 → 部位選択 F7 全顎 → End → 病名選択 → End
///   ③ mở màn kiểm tra  F6 コメント → frm203011 → F1 基本検査 / F2 精密検査
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ① VÌ SAO ĐỔI SETTING THẬT (KHÁC HẲN BẢN PLAYWRIGHT)
/// ═══════════════════════════════════════════════════════════════════════════════
/// Spec web đè <c>GET /tenant/settings/inp</c> để không phải ghi <c>tenant_config</c>.
/// Ở WinForm KHÔNG có đường tương đương: <c>pInpOpt[36]</c> đọc từ
/// <c>XmlControl.OchaXml.InpInfo.KensaOrder</c> (modCommon.cs:597) — một số trong
/// <b><c>C:\NEW_SIM2000\Ocha.xml</c></b>, tức cấu hình CỦA MÁY, nạp trong static ctor
/// của <c>XmlControl</c>. Sửa file rồi thì phải khởi động lại app mới ăn.
///
/// <para>Đường DUY NHẤT đổi được trong một phiên là đi qua 処置入力設定: <c>btnF9_Click</c>
/// gọi <c>setItemToXmlData()</c> → <c>XmlControl.setOchaXml()</c> rồi
/// <b><c>ModCommon.pGetInpOpt()</c></b> (frm203003.cs:113-118, :270-273). Chính lời gọi
/// cuối đó nạp lại <c>pInpOpt</c> ngay lập tức — không cần mở lại 診療入力.</para>
///
/// <para>⚠️ Vì thế luồng này <b>GHI vào cấu hình máy</b>. Nó nằm sau cờ riêng
/// <c>perioKensa.allowSettingChange</c>, chụp giá trị cũ ở <c>OneTimeSetUp</c> và trả lại
/// ở <c>OneTimeTearDown</c> — kể cả khi fixture đỏ giữa chừng.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// 4点法 / 6点法 (<c>pInpOpt[32]</c>) THÌ KHÔNG ĐỔI ĐƯỢC — VÀ ĐÓ LÀ MỘT KHÁC BIỆT THẬT
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>pGetInpOpt()</c> chỉ đọc lại XML; <c>_inpConfigData</c> (bảng <c>INPCONFIG</c>) được
/// nạp MỘT LẦN ở <c>getConfigDataToItem</c> lúc app khởi động (modCommon.cs:299) và
/// <c>pInpOpt[32] = _inpConfigData.seimitu_mode</c> (:581) không bao giờ được nạp lại.
/// Nghĩa là <b>một phiên app chỉ ứng được MỘT chế độ</b>; đổi nó là việc của màn 初期設定
/// <c>frm506008</c> rồi khởi động lại.
///
/// <para>Fixture vì thế ĐO chế độ hiện hành từ chính giao diện (4点法 khoá hai điểm 口蓋
/// ngoài cùng, frm203029.cs:826-834) rồi <c>Ignore</c> nhóm testcase không khớp, kèm lý do.
/// Bản Playwright đè được cả hai chế độ trong một lượt vì bên đó nó là một response JSON.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// DÙNG LẠI, KHÔNG CHÉP (README mục 8b)
/// ═══════════════════════════════════════════════════════════════════════════════
/// · <see cref="ToothSelectDialog"/> — 部位選択 (F7 全顎, End 確定).
/// · <see cref="SigaToothFlow"/> — chặng 病名選択 sau 部位選択 (<c>PickDisease</c> /
///   <c>ConfirmDiseaseDialog</c>) và <c>DismissAll</c>. Đây là driver DUY NHẤT đã chạy thật
///   cho chuỗi đó; chép lại là chép cả những chỗ nó đã trả giá để biết.
/// · <see cref="KarteAutoCalcMenu"/> — menu F11 選択 →「９ オプション」→ mục con. Nó tìm
///   <c>btnF11</c> theo BỀ RỘNG vì <c>frm203002</c> có lưới hàng nghìn dòng; dùng
///   <c>Uia.ByIdOrName</c> ở đây là mỗi lần tìm mất 10-20s.
/// · <see cref="TreatmentGridOps"/> — chọn dòng lưới, kiểm rect trước khi click.
/// </summary>
internal sealed class PerioKensaOrderFlow
{
    /// <summary><c>mst_cod</c> cd_type 68, cd_val 1 — 「左上から」.</summary>
    public const int UpperLeftFirst = 1;

    /// <summary><c>mst_cod</c> cd_type 68, cd_val 2 — 「右上から」.</summary>
    public const int UpperRightFirst = 2;

    /// <summary>
    /// Giá trị 0 = máy CHƯA từng cấu hình. Không phải cd_val, và WinForm chỉ kiểm
    /// <c>== 1</c> nên 0 chạy y hệt nhánh 右上.
    /// </summary>
    public const int NeverConfigured = 0;

    /// <summary><c>inp_config.seimitu_mode</c> — 1 = 4点法, khác = 6点法 (modCommon.cs:581).</summary>
    public const int FourPoint = 1;
    public const int SixPoint = 2;

    public const string SettingsDialogId = "frm203003";
    public const string SettingsTitle = "診療入力設定";

    /// <summary>Combo 「基本･精密検査」 — <c>makeCodMstCombo(con, cboKensaOrder, 68, …)</c> (frm203003.cs:160).</summary>
    public const string KensaOrderComboId = "cboKensaOrder";

    /// <summary>
    /// Tab chứa combo 検査順 — <c>tabPage2</c> 「入力形態・動作1」
    /// (frm203003.Designer.cs:315-321, <c>customGroupBox1</c> :329).
    ///
    /// <para>⚠️ Dialog mở mặc định ở <c>tabPage1</c> 「表示設定」. <c>TabControl</c> của
    /// WinForms chỉ dựng control của TAB ĐANG CHỌN, nên <c>cboKensaOrder</c> KHÔNG có
    /// trong cây UIA cho tới khi chuyển tab. Đo thật 2026-09-04: đọc ra đúng ba combo của
    /// tab 表示設定 (<c>cboPicLink</c> / <c>cboMedicalSupportLink</c> / <c>cboAccButton</c>)
    /// và kết luận nhầm là 「không thấy control」.</para>
    /// </summary>
    public const string KensaOrderTabId = "tabPage2";
    public const string KensaOrderTabText = "入力形態・動作1";

    /// <summary>Mục menu 「２ 処置入力設定」 (frm203002.Designer.cs:2849-2851).</summary>
    public const string SettingsMenuItemId = "IDM_InpOpt";
    public const string SettingsMenuItemText = "処置入力設定";

    public const string KarteSelectId = "frm203011";
    public const string KarteSelectTitle = "カルテ記載選択";

    /// <summary>歯周炎 — <c>dis_cd</c> 103, nhánh 「Ｐ」 của <c>initProc</c> (frm203028.cs:290).</summary>
    public const int PerioDisCd = 103;

    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly TreatmentGridOps _grid;
    private readonly SigaToothFlow _siga;

    public PerioKensaOrderFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _grid = new TreatmentGridOps(screen);
        _siga = new SigaToothFlow(app, screen);
    }

    public TreatmentGridOps Grid => _grid;
    public SigaToothFlow Siga => _siga;

    /// <summary>AutomationId của ô đang giữ con trỏ — xem <see cref="PerioExamDialog.FocusedId"/>.</summary>
    public string FocusedId() => PerioExamDialog.FocusedId(_screen.Automation);

    public string WaitFocus(string expectedId, TimeSpan? timeout = null) =>
        PerioExamDialog.WaitFocus(_screen.Automation, expectedId, timeout);

    // ═════════════════════════════════════════════════════════════════════════
    // ① 検査順
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Kết cục một lượt đụng vào 処置入力設定. <see cref="Reason"/> luôn nói được vì sao.</summary>
    public sealed record SettingResult(bool Ok, string Reason, string ComboTextBefore, string ComboTextAfter,
                                       IReadOnlyList<string> Items)
    {
        public override string ToString() =>
            $"ok={Ok} 「{ComboTextBefore}」 → 「{ComboTextAfter}」 ({Reason})";
    }

    /// <summary>
    /// Mở 処置入力設定 (frm203003) qua F11 選択 → 「９ オプション」 → 「２ 処置入力設定」.
    /// Trả null kèm lý do thay vì ném — probe cần đi tiếp để in nốt các câu hỏi khác.
    /// </summary>
    /// <summary>frm203003 — cũng là form CON của frm203002, phải lục bên trong.</summary>
    public Window? Settings() =>
        KarteAutoCalcDialog.FindDialogWindow(_app, SettingsDialogId, SettingsTitle, _screen.Window);

    public Window? OpenSettings(out string reason, TestTrace? trace = null)
    {
        // ☠ PHẢI kiểm bằng Settings() (có searchInside). Bản đầu dùng FindDialogWindow
        // KHÔNG truyền searchInside nên KHÔNG BAO GIỜ thấy frm203003 đang mở, luôn tưởng
        // là chưa mở, rồi đi mở lần nữa — và đó là thứ LÀM SẬP APP:
        //
        //   formControl.showDialogFromDLL:  form = Instance;  form.ShowDialog();
        //   frm203003.Instance:             _instance còn sống và ĐANG VISIBLE
        //   ⇒ InvalidOperationException 「Form that is already visible cannot be displayed
        //     as a modal dialog box」 → app không bắt → hộp thoại crash Continue/Quit.
        //
        // Đo thật 2026-09-04. Lỗi là của BỘ TEST (nó lách qua modal bằng ForceForeground
        // rồi gọi lại), KHÔNG phải đường mà người dùng đi được — frm203003 chỉ mở từ
        // IDM_InpOpt_Click bằng showDialog (modal).
        var already = Settings();
        if (already is not null) { reason = "da mo san"; return already; }

        var popup = OpenSentakuPopup(out var menuWhy, trace);
        if (popup is null) { reason = $"khong mo duoc menu F11 選択: {menuWhy}"; return null; }

        var option = KarteAutoCalcMenu.FindMenuItem(popup, OptionMenuId, OptionMenuText);
        if (option is null)
        {
            reason = $"popup F11 da mo nhung khong thay muc 「{OptionMenuText}」. " +
                     "Muc menu doc duoc: " + DescribeMenuItems(_app);
            return null;
        }

        var target = ExpandOptionSubMenu(option, trace);
        if (target is null)
        {
            // Dump MỌI mục menu đang mở. Không có nó thì 「không thấy mục X」 là ngõ cụt:
            // không phân biệt được 「submenu chưa bung」, 「mục đổi AutomationId」 và
            // 「mục bị disable nên nằm ngoài màn hình」.
            reason = $"bung submenu 「{OptionMenuText}」 xong van khong thay muc " +
                     $"「{SettingsMenuItemText}」 ({SettingsMenuItemId}). " +
                     "Muc menu DOC DUOC luc do: " + DescribeMenuItems(_app);
            return null;
        }

        var (tx, ty) = Uia.Center(target);
        Uia.LeftClickPhysical(tx, ty);
        Waits.Step();

        var dialog = Waits.TryFor(Settings, TimeSpan.FromSeconds(15));
        if (dialog is not null) SelectKensaOrderTab(dialog, trace);
        reason = dialog is null ? "bam muc menu xong nhung frm203003 khong hien ra trong 15s" : "ok";
        return dialog;
    }

    /// <summary>
    /// Bấm <c>btnF11 選択</c> của frm203002 để bung <c>contextMenuStripSentaku</c>.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO KHÔNG DÙNG <c>KarteAutoCalcMenu.OpenSentakuMenu</c>
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Hàm đó bấm bằng <c>Uia.Click</c> (InvokePattern → LegacyIAccessible.DoDefaultAction).
    /// Đo thật 2026-09-04 trên luồng này: nó <b>NÉM</b>, và ngoại lệ có <c>Message</c>
    /// RỖNG nên log chỉ ra 「click btnF11 loi: 」 — không nói được gì.
    ///
    /// <para>Đúng bài học đã ghi ở README mục 8b: <b>app này không nhận InvokePattern ở
    /// bất kỳ control nào</b> (nút là <c>GradientButton</c> tự vẽ). Phải click chuột VẬT LÝ,
    /// và phải kiểm <c>BoundingRectangle</c> trước — rect rỗng thì <c>Uia.Center</c> trả
    /// (0,0) và cú click rơi vào góc trái trên DESKTOP chứ không vào app
    /// (xem <c>TreatmentGridOps.FocusCell</c>).</para>
    /// </summary>
    private AutomationElement? OpenSentakuPopup(out string reason, TestTrace? trace)
    {
        // Bề RỘNG, không phải Uia.ByIdOrName: frm203002 có lưới hàng nghìn dòng, duyệt sâu
        // lún vào đó mất 10-20s mỗi lần gọi.
        var btn = KarteAutoCalcDialog.FindChromeIdOrName(_screen.Window, "btnF11", "選択");
        if (btn is null) { reason = "khong thay btnF11 (選択) tren frm203002"; return null; }

        try
        {
            var hwnd = _screen.Window.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero) Uia.ForceForeground(hwnd);
        }
        catch (Exception e) { trace?.Note($"canh bao khi dua frm203002 len foreground: {e.Message}"); }

        try { _screen.Window.Focus(); } catch { /* */ }
        Thread.Sleep(150);

        var rect = Uia.RectOf(btn);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
        {
            reason = $"btnF11 doc ra rect RONG ({rect?.ToString() ?? "null"}) — click vao do la " +
                     "ban chuot ra (0,0) tuc goc trai tren DESKTOP";
            return null;
        }

        // Đường 1: PHÍM F11. frm203002 kế thừa BaseForm (KeyPreview) và formBase_KeyDown
        // ánh xạ F11 → btnF11_Click, đúng cùng handler mà cú click gọi tới. Rẻ hơn và
        // không phụ thuộc vị trí con trỏ.
        trace?.Step("gui phim F11 (選択) toi frm203002");
        Uia.SendKey(Uia.VK_F11);
        var popup = Waits.TryFor(RealPopup, TimeSpan.FromSeconds(5));
        if (popup is not null) { reason = "ok"; return popup; }

        // Đường 2: click chuột VẬT LÝ. Nút là GradientButton tự vẽ nên KHÔNG dùng
        // Uia.Click (InvokePattern) — nó ném với Message rỗng, đo 2026-09-04.
        var (x, y) = Uia.Center(btn);
        trace?.Step($"F11 khong an — click VAT LY btnF11 選択 tai ({x},{y})");
        Uia.LeftClickPhysical(x, y);

        popup = Waits.TryFor(RealPopup, TimeSpan.FromSeconds(6));
        reason = popup is null
            ? "ca phim F11 lan click vat ly deu khong bung ContextMenuStrip. " +
              "Popup doc duoc: " + DescribeMenuItems(_app)
            : "ok";
        return popup;

        // ⚠️ KHÔNG lấy AllPopups().FirstOrDefault(): AllPopups còn nhận CẢ cửa sổ app khi
        // nó có MenuItem con — và mọi cửa sổ Win32 đều có MENU HỆ THỐNG. Đo 2026-09-04:
        // dump ra đúng một mục 「System」, tức là đã vớ nhầm menu hệ thống của frm203002
        // rồi đi tìm 「オプション」 trong đó. Ưu tiên lớp popup thật #32768.
        AutomationElement? RealPopup()
        {
            var all = KarteAutoCalcMenu.AllPopups(_app).ToList();
            return all.FirstOrDefault(w => Uia.ClassNameOf(w).Contains("32768"))
                ?? all.FirstOrDefault(w => KarteAutoCalcMenu.FindMenuItem(w, OptionMenuId, OptionMenuText) is not null);
        }
    }

    /// <summary>AutomationId / chữ của mục cha 「９ オプション」 (frm203002.Designer.cs:248).</summary>
    private const string OptionMenuId = "IDM_Option";
    private const string OptionMenuText = "オプション";

    /// <summary>
    /// Bung submenu 「オプション」 rồi trả về mục 「２ 処置入力設定」.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO KHÔNG DÙNG <c>KarteAutoCalcMenu.ClickOptionSubItem</c>
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Hàm đó <b>CLICK TRÁI</b> lên mục cha rồi mới bấm Right. Đo thật 2026-09-04 trên
    /// luồng này: sau cú click đó menu <b>ĐÓNG SẠCH</b> — dump ngay sau chỉ còn đúng
    /// <c>「System」</c> (menu hệ thống của cửa sổ), tức không còn popup nào. Right vì thế
    /// bay vào hư không và 8s chờ luôn hết giờ.
    ///
    /// <para><c>ContextMenuStrip</c> của WinForms <b>tự bung submenu khi RÊ CHUỘT</b> qua
    /// mục cha; click là thao tác TOGGLE nên nó đóng lại cái vừa mở. Ở đây vì thế thử theo
    /// thứ tự: hover → ExpandCollapsePattern → phím Right, và chỉ click vào mục CON.</para>
    ///
    /// <para>Không sửa <c>KarteAutoCalcMenu</c> vì luồng カルテ自動算定 đang chạy được với
    /// nó — đổi chung là đặt cược một luồng đã xanh vào thay đổi chưa kiểm.</para>
    /// </summary>
    private AutomationElement? ExpandOptionSubMenu(AutomationElement option, TestTrace? trace)
    {
        AutomationElement? Look() =>
            KarteAutoCalcMenu.FindMenuItemAnywhere(_app, SettingsMenuItemId, SettingsMenuItemText);

        var (ox, oy) = Uia.Center(option);

        trace?.Step($"re chuot qua 「{OptionMenuText}」 (KHONG click — click la dong menu)");
        Uia.MoveCursorTo(ox, oy);
        var hit = Waits.TryFor(Look, TimeSpan.FromSeconds(4));
        if (hit is not null) return hit;

        trace?.Step("hover khong bung — thu ExpandCollapsePattern");
        try { option.Patterns.ExpandCollapse.PatternOrDefault?.Expand(); }
        catch { /* mục không có pattern này */ }
        hit = Waits.TryFor(Look, TimeSpan.FromSeconds(4));
        if (hit is not null) return hit;

        trace?.Step("van chua bung — thu phim Right");
        Uia.MoveCursorTo(ox, oy);
        Thread.Sleep(200);
        Uia.SendKey(Vk.Right);
        return Waits.TryFor(Look, TimeSpan.FromSeconds(6));
    }

    /// <summary>
    /// Mọi mục menu đang mở, dạng 「id=nhãn」 — công cụ CHẨN ĐOÁN cho
    /// <see cref="OpenSettings"/>. Submenu là cửa sổ <c>#32768</c> RIÊNG nên phải quét
    /// từng popup một (xem chú thích của <c>KarteAutoCalcMenu.AllPopups</c>).
    /// </summary>
    public static string DescribeMenuItems(OchaApp app)
    {
        var seen = new List<string>();
        try
        {
            foreach (var popup in KarteAutoCalcMenu.AllPopups(app))
            {
                try
                {
                    foreach (var item in popup.FindAllDescendants(
                                 cf => cf.ByControlType(FlaUI.Core.Definitions.ControlType.MenuItem)))
                    {
                        var id = Uia.AutomationIdOf(item);
                        var nm = Txt.N(Uia.NameOf(item).Replace("&", ""));
                        seen.Add($"{(id.Length == 0 ? "(khong co id)" : id)}=「{nm}」");
                    }
                }
                catch { /* popup vừa đóng */ }
            }
        }
        catch { /* app bận */ }
        return seen.Count == 0 ? "(khong doc duoc muc menu nao)" : string.Join(" · ", seen);
    }

    /// <summary>
    /// Chuyển sang tab 「入力形態・動作1」 để <c>cboKensaOrder</c> xuất hiện trong cây UIA.
    /// Trả về true nếu sau đó thấy được combo.
    /// </summary>
    public static bool SelectKensaOrderTab(Window settings, TestTrace? trace = null)
    {
        if (Uia.ById(settings, KensaOrderComboId) is not null) return true;

        var tab = Uia.Descendants(settings, maxDepth: 6).FirstOrDefault(
            e => Uia.ControlTypeOf(e) == FlaUI.Core.Definitions.ControlType.TabItem &&
                 (Txt.Same(Uia.AutomationIdOf(e), KensaOrderTabId) ||
                  Txt.Has(Uia.NameOf(e), KensaOrderTabText)));

        if (tab is null)
        {
            trace?.Note($"khong thay tab 「{KensaOrderTabText}」 trong frm203003");
            return false;
        }

        trace?.Step($"chuyen sang tab 「{KensaOrderTabText}」 (cboKensaOrder nam o day)");
        try { tab.Patterns.SelectionItem.PatternOrDefault?.Select(); }
        catch { /* thử chuột bên dưới */ }

        if (Waits.TryUntil(() => Uia.ById(settings, KensaOrderComboId) is not null,
                           TimeSpan.FromSeconds(3)))
            return true;

        var rect = Uia.RectOf(tab);
        if (rect is { Width: > 0, Height: > 0 })
        {
            var (x, y) = Uia.Center(tab);
            Uia.LeftClickPhysical(x, y);
        }
        return Waits.TryUntil(() => Uia.ById(settings, KensaOrderComboId) is not null,
                              TimeSpan.FromSeconds(3));
    }

    /// <summary>
    /// Mọi mục của combo 基本･精密検査, theo đúng thứ tự — cd_type 68 của <c>mst_cod</c>.
    ///
    /// <para><b>Phải BUNG combo ra trước.</b> Với <c>ComboBox</c> của WinForms, cầu MSAA→UIA
    /// chỉ dựng <c>ListItem</c> cho danh sách khi nó ĐANG MỞ; hỏi lúc combo còn đóng thì
    /// <c>Items</c> trả rỗng. FlaUI tự <c>Expand()</c> cho vài FrameworkType nhưng không
    /// chắc nhận ra đúng framework của app .NET 3.5 này, nên bung tay cho chắc rồi thu lại.</para>
    /// </summary>
    public static IReadOnlyList<string> ComboItems(Window settings)
    {
        var combo = Uia.ById(settings, KensaOrderComboId);
        if (combo is null) return [];

        var box = combo.AsComboBox();
        try { box.Expand(); Thread.Sleep(200); } catch { /* không có ExpandCollapsePattern */ }

        List<string> items;
        try { items = box.Items.Select(i => Txt.N(Uia.NameOf(i))).Where(s => s.Length > 0).ToList(); }
        catch { items = []; }

        try { box.Collapse(); Thread.Sleep(150); } catch { /* nt */ }
        return items;
    }

    /// <summary>
    /// Mọi combo đọc được trong <c>frm203003</c>, dạng 「id=chữ」 — chỉ dùng để CHẨN ĐOÁN
    /// khi không tìm thấy <c>cboKensaOrder</c>: in ra là biết ngay control đổi tên hay
    /// dialog mở nhầm màn.
    /// </summary>
    public static IReadOnlyList<string> DescribeCombos(Window settings)
    {
        try
        {
            return Uia.Descendants(settings, maxDepth: 8)
                      .Where(e => Uia.ControlTypeOf(e) == FlaUI.Core.Definitions.ControlType.ComboBox)
                      .Select(e => $"{Uia.AutomationIdOf(e)}=「{Txt.N(Uia.ValueOf(e))}」")
                      .ToList();
        }
        catch { return []; }
    }

    /// <summary>Mục đang chọn của combo; rỗng = không đọc được.</summary>
    public static string ComboText(Window settings)
    {
        var combo = Uia.ById(settings, KensaOrderComboId);
        if (combo is null) return "";
        try
        {
            var box = combo.AsComboBox();
            var selected = box.SelectedItem;
            if (selected is not null) return Txt.N(Uia.NameOf(selected));
            return Txt.N(box.EditableText);
        }
        catch { return Txt.N(Uia.ValueOf(combo)); }
    }

    /// <summary>
    /// Nhãn hiển thị của một cd_val. Nhãn THẬT nằm trong <c>mst_cod</c> nên không hard-code
    /// được — nhận ra bằng mảnh 「左上」/「右上」, và probe <c>Tc0</c> in nguyên văn cả danh
    /// sách để sửa ở đây nếu khách đổi chữ.
    /// </summary>
    public static string? ItemFor(IReadOnlyList<string> items, int cdVal)
    {
        var mark = cdVal == UpperLeftFirst ? "左上" : "右上";
        return items.FirstOrDefault(i => Txt.Has(i, mark));
    }

    /// <summary>
    /// Đặt 検査順 = <paramref name="cdVal"/> rồi <b>F9 登録</b> (ghi Ocha.xml + gọi
    /// <c>pGetInpOpt</c>). Dialog tự đóng sau F9 (frm203003.cs:117).
    /// </summary>
    public SettingResult SetKensaOrder(int cdVal, TestTrace? trace = null) =>
        Apply(items => ItemFor(items, cdVal), cdVal - 1, $"cd_val {cdVal}", trace);

    /// <summary>
    /// Đặt lại combo về ĐÚNG nhãn đã chụp lúc đầu — đường khôi phục của
    /// <c>OneTimeTearDown</c>. Dùng nhãn chứ không dùng cd_val vì nhãn là thứ đọc được
    /// chắc chắn, còn cd_val phải suy ngược từ chữ.
    /// </summary>
    public SettingResult RestoreKensaOrder(string label, TestTrace? trace = null) =>
        Apply(items => items.FirstOrDefault(i => Txt.Same(i, label)), -1, $"「{label}」", trace);

    private SettingResult Apply(Func<IReadOnlyList<string>, string?> pick, int fallbackIndex,
                                string what, TestTrace? trace)
    {
        var settings = OpenSettings(out var why, trace);
        if (settings is null) return new(false, why, "", "", []);

        var items = ComboItems(settings);
        var before = ComboText(settings);
        var combo = Uia.ById(settings, KensaOrderComboId);
        if (combo is null)
        {
            CloseSettingsWithoutSaving(settings, trace);
            return new(false, $"khong thay combo {KensaOrderComboId} trong frm203003", before, "", items);
        }

        var wanted = pick(items);
        if (wanted is null && fallbackIndex < 0)
        {
            CloseSettingsWithoutSaving(settings, trace);
            return new(false,
                       $"khong tim thay muc {what} trong combo. Danh sach that: " +
                       (items.Count == 0 ? "(doc khong ra)" : string.Join(" / ", items)),
                       before, "", items);
        }

        try
        {
            var box = combo.AsComboBox();
            if (wanted is not null) box.Select(wanted);
            else box.Select(fallbackIndex);   // đường lui: mst_cod xếp theo cd_val
        }
        catch (Exception e)
        {
            CloseSettingsWithoutSaving(settings, trace);
            return new(false, $"khong chon duoc muc combo ({what}): {e.Message}", before, "", items);
        }

        Thread.Sleep(200);
        var after = ComboText(settings);
        if (wanted is not null && !Txt.Same(after, wanted))
        {
            CloseSettingsWithoutSaving(settings, trace);
            return new(false, $"chon 「{wanted}」 nhung combo dang hien 「{after}」", before, after, items);
        }

        trace?.Step($"F9 登録 (frm203003) — ghi Ocha.xml KensaOrder = {what} 「{after}」");
        ToothSelectDialog.FocusWindow(settings);
        Uia.SendKey(Vk.F9);

        var closed = Waits.TryUntil(() => !Uia.IsOnScreen(settings), TimeSpan.FromSeconds(15));
        if (!closed)
        {
            var seen = _siga.DismissAll(trace: trace);
            return new(false,
                       "bam F9 xong ma frm203003 khong dong. Hop thoai gap phai: " +
                       (seen.Count == 0 ? "(khong co)" : string.Join(" / ", seen)),
                       before, after, items);
        }

        return new(true, "ok", before, after, items);
    }

    /// <summary>
    /// Đóng 処置入力設定 bằng <b>F10 戻る</b> — KHÔNG ghi gì.
    ///
    /// <para>frm203003 kế thừa <c>BaseDialog</c>, mà ở đó <c>Escape</c> và <c>End</c> đều gọi
    /// <c>btnF9_Click</c> (BaseDialog.cs:314-324) tức là 登録. Dùng Escape để 「thoát cho
    /// nhanh」 là ghi luôn cấu hình máy.</para>
    /// </summary>
    public bool CloseSettingsWithoutSaving(Window settings, TestTrace? trace = null)
    {
        if (!Uia.IsOnScreen(settings)) return true;

        // ⚠️ BẤM NÚT, đừng gửi VK_F10. Windows dành riêng F10 để kích hoạt thanh menu của
        // cửa sổ, nên SendInput(VK_F10) thường bị hệ thống nuốt trước khi tới form — hộp
        // thoại KHÔNG đóng, và vì nó là modal nên mọi thao tác sau đó lên frm203002 đều
        // trượt (menu F11 không bung). Đo thật 2026-09-04: đúng chuỗi đó làm Tc1/Tc2 đỏ
        // với lý do sai địa chỉ 「không mở được menu F11」.
        trace?.Step("bam nut F10 戻る cua frm203003 — thoat KHONG ghi");
        ToothSelectDialog.FocusWindow(settings);

        var btn = KarteAutoCalcDialog.FindChromeIdOrName(settings, "btnF10", "戻る");
        var rect = btn is null ? null : Uia.RectOf(btn);
        if (rect is { Width: > 0, Height: > 0 })
        {
            var (x, y) = Uia.Center(btn!);
            Uia.LeftClickPhysical(x, y);
        }
        else
        {
            trace?.Note("khong thay nut btnF10 — lui ve gui phim F10");
            Uia.SendKey(Vk.F10);
        }

        return Waits.TryUntil(() => !Uia.IsOnScreen(settings), TimeSpan.FromSeconds(10));
    }

    /// <summary>
    /// Nhãn 検査順 đang đặt trên máy, đọc rồi ĐÓNG KHÔNG GHI. Rỗng = không đọc được, và
    /// <paramref name="reason"/> nói vì sao — <b>bắt buộc in ra</b>: 「combo rỗng」 có thể
    /// là menu không mở, dialog không hiện, HOẶC control đổi tên, ba chuyện khác hẳn nhau.
    /// </summary>
    public string ReadKensaOrderLabel(out IReadOnlyList<string> items, out string reason,
                                      TestTrace? trace = null)
    {
        items = [];
        var settings = OpenSettings(out var why, trace);
        if (settings is null)
        {
            // Không thấy cửa sổ KHÔNG có nghĩa là nó không mở. Dọn phòng hờ: để sót một
            // frm203003 đang visible là lần gọi sau sẽ làm SẬP APP (xem OpenSettings).
            reason = why;
            return "";
        }

        items = ComboItems(settings);
        var text = ComboText(settings);

        reason = Uia.ById(settings, KensaOrderComboId) is null
            ? $"frm203003 đã mở nhưng KHÔNG thấy control {KensaOrderComboId}. Combo đọc được " +
              "trong dialog: " + Describe(DescribeCombos(settings))
            : items.Count == 0
                ? $"thấy {KensaOrderComboId} nhưng bung ra không đọc được mục nào. Combo trong " +
                  "dialog: " + Describe(DescribeCombos(settings))
                : "ok";

        CloseSettingsWithoutSaving(settings, trace);
        return text;

        static string Describe(IReadOnlyList<string> c) =>
            c.Count == 0 ? "(không có combo nào)" : string.Join(" / ", c);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ② 部位病名行 đủ 32 răng
    // ═════════════════════════════════════════════════════════════════════════

    public sealed record ArchRowResult(bool DialogOpened, int MarkedSlots, bool DiseaseOpened,
                                       IReadOnlyList<string> Dialogs)
    {
        /// <summary>Mở được hộp thoại và bật được ít nhất một răng. <b>KHÔNG</b> đòi đủ 32 —
        /// <c>F7 全顎</c> chỉ bật răng CÒN TỒN TẠI (frm902003.cs:841-895).</summary>
        public bool Ok => DialogOpened && MarkedSlots > 0;

        public override string ToString() =>
            $"部位選択 mở={DialogOpened} ô sáng={MarkedSlots}/{PerioExamDialog.ToothCount} " +
            $"病名選択 mở={DiseaseOpened}" +
            (Dialogs.Count == 0 ? "" : " · hộp thoại: " + string.Join(" / ", Dialogs));
    }

    /// <summary>
    /// Dựng một 部位病名行 mang <b>đủ 32 răng</b>: mở 部位選択 từ lưới, <b>F7 全顎</b>,
    /// End 確定, rồi chọn 病名 <paramref name="disCd"/> ở 病名選択 và End 登録.
    ///
    /// <para><b>Vì sao phải đủ 32.</b> <c>initProc</c> của cả hai màn đặt
    /// <c>tyToothInf[i].flg = bui[i] != 0</c> và khoá ／ mọi ô có <c>bui = 0</c>
    /// (frm203028.cs:413-455). Răng bị khoá thì <c>getMoveIndex</c> nhảy qua nó, nên với
    /// một 部位 lẻ tẻ thì mọi assert 「Enter đi tới răng N」 chỉ phản ánh dữ liệu của máy
    /// chứ không phản ánh luật 検査順. Đây đúng là lý do spec Playwright seed một dòng
    /// <c>bui</c> toàn 1 thay vì mượn dòng có sẵn.</para>
    ///
    /// <para>KHÔNG ghi DB: cả 部位選択 lẫn 病名選択 chỉ sửa lưới trong bộ nhớ, và luồng
    /// này không bao giờ bấm F9 登録 của 診療入力.</para>
    /// </summary>
    public ArchRowResult BuildWholeArchRow(int disCd = PerioDisCd, TestTrace? trace = null)
    {
        var seen = new List<string>();

        // ⚠️ KHÔNG dùng ToothSelectDialog.OpenFromGrid: nó thử LẦN LƯỢT 12 dòng đầu, mà
        // dòng [0] là tiêu đề cột và dòng [1] là tiêu đề THÁNG 「R 08年07月」 — cả hai đọc
        // ra rect RỖNG. Đo thật 2026-09-04 (lượt probe đầu): nó ném
        // NoClickablePointException ngay ở dòng thứ hai và không bao giờ tới được dòng
        // 処置 thật. Đường đúng là SigaToothFlow.InputRow() — nó lọc tiêu đề tháng /
        // 日計 / 合計 / 部位病名行 rồi lấy dòng CUỐI (chắc chắn thuộc tháng đang mở), rồi
        // FocusCell (có kiểm rect trước khi bắn chuột). Đây đúng là cặp bẫy mà
        // PROBE-GUIDELINE 3.2 mô tả.
        var target = _siga.InputRow();
        if (target is null)
        {
            trace?.Note("khong tim duoc dong 処置 THAT nao trong luoi: " +
                        string.Join(" · ", _grid.Snapshot().Select(r => r.ToString())));
            seen.AddRange(_siga.DismissAll(trace: trace));
            return new(false, 0, false, seen);
        }

        trace?.Step($"click o 部位 cua dong 「{target}」 de mo 部位選択");
        _grid.FocusCell(target, RegiGrid.Col.Bui);

        var tooth = ToothSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(8));
        if (tooth is null)
        {
            // Click không mở được thì thử Enter — grdRegi_KeyDown cũng gọi
            // OpenDialogBuiAndByou khi con trỏ đang ở cột 部位 (frm203002.cs:3552-3558).
            trace?.Note("click khong mo 部位選択 — thu Enter tren o 部位");
            _grid.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.RETURN);
            tooth = ToothSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(8));
        }

        if (tooth is null)
        {
            seen.AddRange(_siga.DismissAll(trace: trace));
            return new(false, 0, false, seen);
        }

        ToothSelectDialog.SelectWholeArch(tooth, trace);
        var marked = ToothSelectDialog.MarkedSlots(tooth);
        trace?.Note($"sau F7 全顎: {marked.Count} o dang sang = [{string.Join(",", marked)}]");
        trace?.Shot("bui-toan-ham");

        ToothSelectDialog.Confirm(tooth, trace);

        var disease = Waits.TryFor(_siga.DiseaseDialog, TimeSpan.FromSeconds(12));
        var diseaseOpened = disease is not null;
        if (diseaseOpened)
        {
            if (!_siga.PickDisease(disease!, disCd, trace))
                trace?.Note($"KHONG chon duoc 病名 dis_cd = {disCd} — danh sach dang hien: " +
                            string.Join(" · ", _siga.DiseaseRows(disease!)));
            _siga.ConfirmDiseaseDialog(trace);
        }

        seen.AddRange(_siga.DismissAll(trace: trace));
        return new(true, marked.Count, diseaseOpened, seen);
    }

    /// <summary>
    /// Dòng lưới có 部位 「全顎」 — chỗ phải đứng lên trước khi bấm F6.
    ///
    /// <para>F6 lấy <c>BUI1..32</c> của <b>DÒNG ĐANG CÓ CON TRỎ</b> (frm203002.cs:4719-4732).
    /// Đứng nhầm dòng thì <c>paramData.bui</c> toàn 0, mọi ô của hai màn kiểm tra bị khoá ／
    /// và con trỏ không đi đâu cả — testcase xanh giả chứ không đỏ.</para>
    /// </summary>
    /// <remarks>
    /// ⚠️ Nhận ra 部位病名行 bằng <b>ô 点 KHÔNG phải số</b> (nó là 「-」) cộng với ô 部位 có
    /// chữ — KHÔNG phải bằng chuỗi 「全顎」.
    ///
    /// <para>Đo thật 2026-09-04: sau <c>F7 全顎</c> ô 部位 in ra <b>danh sách răng</b> chứ
    /// không phải chữ 「全顎」, vì <c>setBui</c> chỉ bật những răng CÒN TỒN TẠI (nó bỏ qua
    /// răng có <c>_sigaData.bui* == 4</c> = 欠損歯, frm902003.cs:841-895). Bệnh nhân test
    /// thiếu 7 răng nên 全顎 ra 25 ô — bản đầu tìm theo chuỗi 「全顎」 nên không bao giờ
    /// thấy dòng vừa dựng.</para>
    /// </remarks>
    public RegiRow? WholeArchRow() =>
        _grid.Snapshot().LastOrDefault(
            r => !SigaToothFlow.IsBlank(r.Bui) && Txt.Int(r.Ten) is null);

    // ═════════════════════════════════════════════════════════════════════════
    // ③ F6 → frm203011 → F1 / F2
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// <c>frm203011</c> — LUÔN phải lục bên trong <c>frm203002</c>: nó là form con
    /// (<c>TopLevel = false</c> + <c>Controls.Add</c>) nên không nằm trong danh sách cửa sổ
    /// top-level. Xem chú thích của <see cref="PerioExamDialog.FindKihon"/>.
    /// </summary>
    public Window? KarteSelect() =>
        KarteAutoCalcDialog.FindDialogWindow(_app, KarteSelectId, KarteSelectTitle, _screen.Window);

    /// <summary>
    /// Đặt con trỏ lên <paramref name="row"/> rồi bấm <b>F6 コメント</b> để mở
    /// カルテ記載選択. Trả null kèm lý do.
    /// </summary>
    public Window? OpenKarteSelect(RegiRow row, out string reason, TestTrace? trace = null)
    {
        var already = KarteSelect();
        if (already is not null) { reason = "da mo san"; return already; }

        // Click cột 療法・処置, KHÔNG phải cột 部位: `grdRegi_CellClick` mở 部位選択 khi và
        // CHỈ KHI cột được click là `RegiCol.bui` (frm203002.cs:1686-1697). F6 chỉ cần con
        // trỏ ĐỨNG ĐÚNG DÒNG (nó đọc `grdRegi.CurrentCellAddress.Y`, :4719), nên click cột
        // khác vừa đủ việc vừa không bung hộp thoại phải dọn.
        trace?.Step($"dat con tro len dong 「{row}」 (cot 療法・処置) roi bam F6");
        _grid.FocusCell(row, RegiGrid.Col.Ryo);

        // Vẫn phòng hờ: nếu vì lý do gì đó 部位選択 bung ra thì dọn trước khi bấm F6.
        var stray = ToothSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(3));
        if (stray is not null)
        {
            trace?.Note("click o 部位 lam bung 部位選択 — dong bang F12 戻る roi di tiep");
            ToothSelectDialog.Close(_app, stray, trace);
        }

        ToothSelectDialog.FocusWindow(_screen.Window);
        if (!Uia.SendKey(Vk.F6))
        {
            // SendInput không chèn được thì thử nút F6 trên thanh phím của frm203002.
            var btn = KarteAutoCalcDialog.FindChromeIdOrName(_screen.Window, "btnF6", "コメント");
            if (btn is null) { reason = "SendInput hong ma cung khong thay nut btnF6 (コメント)"; return null; }
            Uia.MouseClick(btn);
        }

        var dialog = Waits.TryFor(KarteSelect, TimeSpan.FromSeconds(15));
        reason = dialog is null
            ? "bam F6 xong ma frm203011 khong hien ra. Dong dang focus co thuoc thang hien hanh khong?"
            : "ok";
        return dialog;
    }

    /// <summary>F1 基本検査 của frm203011 (frm203011.cs:95-110).</summary>
    public Window? OpenKihon(Window karteSelect, TestTrace? trace = null) =>
        OpenExam(karteSelect, Vk.F1, "基本検査", PerioExamDialog.FindKihon, trace);

    /// <summary>F2 精密検査 của frm203011 (frm203011.cs:114-129).</summary>
    public Window? OpenSeimitu(Window karteSelect, TestTrace? trace = null) =>
        OpenExam(karteSelect, Vk.F2, "精密検査", PerioExamDialog.FindSeimitu, trace);

    /// <summary>Chỗ phải lục để thấy hai màn kiểm tra: bên trong frm203011, rồi frm203002.</summary>
    private Window? FindExam(Func<OchaApp, AutomationElement?, Window?> find, Window karteSelect) =>
        find(_app, karteSelect) ?? find(_app, _screen.Window) ?? find(_app, null);

    private Window? OpenExam(Window karteSelect, ushort key, string label,
                             Func<OchaApp, AutomationElement?, Window?> find, TestTrace? trace)
    {
        trace?.Step($"F{(key == Vk.F1 ? 1 : 2)} {label} (frm203011)");
        ToothSelectDialog.FocusWindow(karteSelect);
        if (!Uia.SendKey(key))
        {
            var btn = KarteAutoCalcDialog.FindChromeIdOrName(
                karteSelect, key == Vk.F1 ? "btnF1" : "btnF2", label);
            if (btn is null) return null;
            Uia.MouseClick(btn);
        }

        return Waits.TryFor(() => FindExam(find, karteSelect), TimeSpan.FromSeconds(20));
    }

    /// <summary>Đóng cả 基本/精密検査 lẫn frm203011 bằng F10, về lại 診療入力.</summary>
    public void CloseBackToTreatment(TestTrace? trace = null)
    {
        var karteForClose = KarteSelect();
        foreach (var find in new Func<OchaApp, AutomationElement?, Window?>[]
                 { PerioExamDialog.FindKihon, PerioExamDialog.FindSeimitu })
        {
            var exam = find(_app, karteForClose) ?? find(_app, _screen.Window) ?? find(_app, null);
            if (exam is not null) PerioExamDialog.Close(_app, exam, trace);
        }

        // Dọn cả 処置入力設定 còn sót: để nó visible là lần OpenSettings sau gọi ShowDialog
        // trên một form đang hiện ⇒ SẬP APP (xem OpenSettings).
        if (Settings() is { } strandedSettings)
        {
            trace?.Note("con sot frm203003 dang mo — dong bang F10 truoc khi di tiep");
            CloseSettingsWithoutSaving(strandedSettings, trace);
        }

        if (KarteSelect() is { } karte)
        {
            trace?.Step("F10 戻る — dong カルテ記載選択");
            ToothSelectDialog.FocusWindow(karte);
            Uia.SendKey(Vk.F10);
            Waits.TryUntil(() => KarteSelect() is null, TimeSpan.FromSeconds(10));
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Đo chế độ 4点法 / 6点法 từ CHÍNH giao diện
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Chế độ đang chạy của <c>frm203029</c>, đo bằng hai điểm 口蓋 ngoài cùng của
    /// <paramref name="tooth"/>: 4点法 khoá cả hai (frm203029.cs:826-834), 6点法 mở cả ba.
    ///
    /// <para>Đọc từ UI chứ không từ <c>INPCONFIG</c>: cái đang chi phối là
    /// <c>pInpOpt[32]</c> trong RAM của app, mà giá trị đó được nạp lúc app khởi động — DB
    /// có thể đã đổi sau đó và khi ấy DB nói một đằng, app chạy một nẻo.</para>
    /// </summary>
    /// <returns><see cref="FourPoint"/>, <see cref="SixPoint"/>, hoặc null nếu không đọc được.</returns>
    public static int? MeasureSeimituMode(Window seimitu, bool[] present)
    {
        // PHẢI đo trên một răng CÒN TỒN TẠI. Răng vắng thì CẢ BA điểm 口蓋 của nó đều bị
        // khoá ／ vì bui = 0 (frm203029.cs:812-824), nên đọc ở đó luôn ra 「hai điểm ngoài
        // cùng bị khoá」 = 4点法 — SAI, bất kể chế độ thật.
        //
        // Đã dính thật 2026-09-04: bản đầu đo cứng ở răng 15, mà bệnh nhân test mất đúng
        // răng 15 ⇒ probe báo 4点法 trong khi chưa có gì chứng minh. (Lần đó chế độ thật
        // ĐÚNG là 4点法 — con trỏ vào điểm giữa txtKou05 — nhưng đó là trùng hợp, không
        // phải phép đo.)
        for (var t = 0; t < PerioExamDialog.ToothCount; t++)
        {
            if (!present[t]) continue;

            var first = PerioExamDialog.IsCellDisabled(seimitu, PerioExamDialog.Kou(t * 3));
            var mid = PerioExamDialog.IsCellDisabled(seimitu, PerioExamDialog.Kou(t * 3 + 1));
            var last = PerioExamDialog.IsCellDisabled(seimitu, PerioExamDialog.Kou(t * 3 + 2));
            if (first is null || mid is null || last is null) continue;

            // Điểm giữa luôn mở ở cả hai chế độ; hai điểm ngoài cùng mới là thứ phân biệt.
            if (mid.Value) continue;
            if (first.Value && last.Value) return FourPoint;
            if (!first.Value && !last.Value) return SixPoint;
        }
        return null;
    }

    public static string ModeName(int? mode) => mode switch
    {
        FourPoint => "4点法",
        SixPoint => "6点法",
        _ => "(không đo được)",
    };
}
