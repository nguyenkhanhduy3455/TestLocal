using System.Text;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// Đi lại giữa các form của 窓口精算 (SEISAN) và trả lời hộp thoại theo một luật AN TOÀN.
///
/// ─── Lộ trình ────────────────────────────────────────────────────────────────
///   MainMenu ── pnlBtn1 (日常業務) ── pnlMenu4 (窓口精算, MainMenu.cs:824)
///   frm204001 「窓口精算（患者選択）」   F1 患者検索⇄未精算患者 · F2 入力一覧 · F3 来患一覧
///     └─ cboPatNo + F9 (frm204001.cs:270 → defData inpTxt)
///   frm204002 「窓口精算」               F1 領収書発行 · F2 物品 · F3 負担/明細 · F7 入金⇄請求
///                                        F8 訂正 · F10 戻る · F11 患者選択
///
/// ─── ⛔ KHÔNG BAO GIỜ bấm ESC / End trên frm204002 ─────────────────────────────
/// <c>btnEndEsc_Click</c> chạy <c>F9Proc()</c> — tức là 登録 thật (frm204002.cs:1102),
/// ghi ACCDAT/PERSON_EXP và xoá UNPAID. Lớp này không có hàm nào gửi hai phím đó.
/// </summary>
public static class SeisanNav
{
    public const string Counter = "frm204001";
    public const string Seisan = "frm204002";
    public const string Goods = "frm204003";
    public const string ReceiptList = "frm204004";
    public const string AccKind = "frm204005";
    public const string ReceDetail = "frm204006";
    public const string Yoyaku = "frm204007";
    public const string VisitList = "frm204008";
    public const string GoodsHistory = "frm204009";

    /// <summary>VK_END — BaseForm coi nó như ESC: <c>btnEndEsc_Click</c> (BaseForm.cs:616).</summary>
    private const ushort VkEnd = 0x23;

    /// <summary>Mở frm204001 từ menu chính; đang mở sẵn thì dùng luôn.</summary>
    public static Window OpenCounter(OchaApp app, TestSettings settings)
    {
        var timeout = TimeSpan.FromSeconds(settings.App.LaunchTimeoutSeconds);
        if (app.Window(Counter) is { } already) return already;

        var menu = Waits.TryFor(() => app.Window("MainMenu") ?? app.WindowByTitle("メインメニュー"), timeout)
                   ?? throw new TimeoutException("Không thấy cửa sổ メインメニュー. " + DescribeDialogs(app));

        ClickPane(menu, "pnlBtn1", "業務 日常業務");
        ClickPane(menu, "pnlMenu4", "メニュー 窓口精算");
        return app.RequireWindow(Counter, timeout);
    }

    /// <summary>
    /// Gõ 患者番号 vào <c>cboPatNo</c> rồi F9 — <c>defData(inpTxt)</c> (frm204001.cs:366).
    /// Không chờ frm204002: lúc mở nó có thể bung Q00017 (frm204002.cs:298-304) và bên
    /// gọi phải tự quyết trả lời ra sao.
    /// </summary>
    public static void EnterPatient(Window counter, int patNo)
    {
        var combo = Waits.For(() => Uia.ById(counter, "cboPatNo"), "ô 患者番号 「cboPatNo」");
        var edit = Uia.EditInside(combo);
        // Đo 2026-10-20: phím gõ vào đây thỉnh thoảng MẤT (bẫy #8), và F9 với ô rỗng thì
        // btnF9_Click mở DÒNG ĐANG CHỌN của lưới (frm204001.cs:270-279) — tức mở nhầm bệnh nhân.
        // btnF9 chỉ đọc cboPatNo.Text, không cần KeyDown ⇒ gõ không vào thì đặt qua
        // ValuePattern; luôn KIỂM giá trị trước khi F9.
        Uia.ForceForeground(counter.Properties.NativeWindowHandle);
        ClearByKeys(edit);
        Keyboard.Type(patNo.ToString());
        bool Holds() => Uia.ValueOf(edit).Trim() == patNo.ToString();
        if (!Waits.TryUntil(Holds, TimeSpan.FromSeconds(2)))
        {
            try { edit.Patterns.Value.Pattern.SetValue(patNo.ToString()); } catch { /* kiểm ngay dưới */ }
            if (!Waits.TryUntil(Holds, TimeSpan.FromSeconds(2)))
                throw new InvalidOperationException(
                    $"Harness: cboPatNo đọc ra 「{Uia.ValueOf(edit)}」 thay vì {patNo} — không bấm F9.");
        }
        Press(counter, Vk.F9);
    }

    /// <summary>
    /// Form theo AutomationId — tìm cả form MODAL.
    ///
    /// <para><c>OchaApp.Window</c> chỉ duyệt cửa sổ top-level, nhưng form mở bằng
    /// <c>formControl.showDialog</c> (204003/204006/204009/204005/204007) nằm làm CON
    /// trong cây UIA của form gọi nó. Đo 2026-10-20: F2 物品 mở frm204003 ngay, nhưng
    /// <c>App.Window("frm204003")</c> trả null suốt 10s.</para>
    /// </summary>
    public static Window? Form(OchaApp app, string automationId)
    {
        foreach (var top in app.Windows())
        {
            if (Uia.AutomationIdOf(top) == automationId) return top;
            var child = ChildForms(top).FirstOrDefault(f => Uia.AutomationIdOf(f) == automationId);
            if (child is not null) return child;
        }
        return null;
    }

    /// <summary>Form con (modal) đang hiện bên trong <paramref name="owner"/>.</summary>
    public static IReadOnlyList<Window> ChildForms(AutomationElement owner)
    {
        try
        {
            return owner.FindAllDescendants(cf => cf.ByControlType(FlaUI.Core.Definitions.ControlType.Window))
                        .Where(e => Uia.AutomationIdOf(e).StartsWith("frm", StringComparison.Ordinal) && Uia.IsOnScreen(e))
                        .Select(e => e.AsWindow())
                        .ToList();
        }
        catch { return []; }
    }

    /// <summary>Mọi form đang hiện, kể cả modal — để log 「đang đứng ở đâu」.</summary>
    public static string DescribeForms(OchaApp app) =>
        string.Join(", ", app.Windows().Select(w =>
        {
            var kids = ChildForms(w).Select(Uia.AutomationIdOf).ToList();
            var id = Uia.AutomationIdOf(w);
            return kids.Count == 0 ? id : $"{id}>{string.Join(">", kids)}";
        }));

    /// <summary>
    /// Đưa cửa sổ lên trước rồi gửi một phím F (BaseForm.KeyPreview định tuyến về nút).
    ///
    /// <para>Ném nếu có form modal đang đè lên <paramref name="window"/>: đo 2026-10-20,
    /// F6 gửi vào frm204002 trong lúc frm204003 vẫn mở VẪN chạy <c>btnF6_Click</c> của
    /// frm204002, rồi F1 mở frm204004 chồng lên cả hai — trạng thái không người dùng nào
    /// tạo ra được.</para>
    /// </summary>
    public static void Press(Window window, ushort vk)
    {
        if (vk is Vk.Escape or VkEnd)
            throw new InvalidOperationException("ESC/End trên form SEISAN = btnEndEsc_Click = 登録 thật. Không gửi.");
        var modal = ChildForms(window).Select(Uia.AutomationIdOf).ToList();
        if (modal.Count > 0)
            throw new InvalidOperationException(
                $"{Uia.AutomationIdOf(window)} đang bị form modal [{string.Join(", ", modal)}] đè — không gửi phím.");
        Uia.ForceForeground(window.Properties.NativeWindowHandle);
        if (!Uia.SendKey(vk))
            throw new InvalidOperationException($"SendInput không chèn được phím 0x{vk:X2} (phiên desktop?).");
        Waits.Step();
    }

    /// <summary>
    /// Gõ đè giá trị vào một ô rồi Enter — gõ phím thật (F13), vì các phép tính của
    /// frm204002 chạy trong <c>KeyDown</c> Enter (vd <c>txtRece_KeyDown</c>, frm204002.cs:1503).
    ///
    /// <para>⛔ KHÔNG dùng Shift+End để bôi đen: BaseForm bắt
    /// <c>Keys.End</c> ở KeyDown bất kể đang đứng ô nào (BaseForm.cs:616) ⇒
    /// <c>btnEndEsc_Click</c> ⇒ <c>F9Proc</c> = 登録 thật. Đã trả giá 2026-10-20: lượt
    /// probe thứ hai ghi 2 dòng ACCDAT, xoá UNPAID và bung frm204007 予約登録.</para>
    /// </summary>
    public static void TypeAndEnter(Window window, string automationId, string text)
    {
        var box = Waits.For(() => Uia.ById(window, automationId), $"ô 「{automationId}」");
        Uia.ForceForeground(window.Properties.NativeWindowHandle);
        box.Focus();
        ClearByKeys(box);
        Keyboard.Type(text);
        // Phím gõ có lúc mất (bẫy #8): giá trị chưa vào thì đặt qua ValuePattern — các handler
        // ở đây chỉ đọc .Text lúc Enter, nên Enter mới cần là phím thật.
        if (!Waits.TryUntil(() => Uia.ValueOf(box).Trim() == text, TimeSpan.FromSeconds(2)))
        {
            try { box.Patterns.Value.Pattern.SetValue(text); } catch { /* kiểm ngay dưới */ }
            if (!Waits.TryUntil(() => Uia.ValueOf(box).Trim() == text, TimeSpan.FromSeconds(2)))
                throw new InvalidOperationException($"Harness: 「{automationId}」 đọc ra 「{Uia.ValueOf(box)}」 thay vì 「{text}」 — không Enter.");
            box.Focus();
        }
        Keyboard.Press(VirtualKeyShort.RETURN);
        Waits.Step();
    }

    /// <summary>
    /// Xoá sạch một ô bằng Backspace + Delete — con trỏ đứng đâu cũng hết chữ.
    ///
    /// <para>Không dùng Ctrl+A: TextBox của .NET Framework bỏ qua nó. <c>Uia.SetText</c>
    /// (Ctrl+A, Delete, gõ) chỉ chạy được khi ô vừa NHẬN focus và tự <c>SelectAll()</c>
    /// (<c>CustomTextBoxNum_Enter</c>); ô đang có focus sẵn thì chữ mới bị nối vào chữ cũ
    /// (đo 2026-10-20: trả 「0」 vào 「111」 vẫn ra 「111」). Không dùng Shift+End: End = 登録.</para>
    /// </summary>
    public static void ClearByKeys(AutomationElement box)
    {
        box.Focus();
        for (var i = 0; i < 25; i++) Keyboard.Press(VirtualKeyShort.BACK);
        for (var i = 0; i < 25; i++) Keyboard.Press(VirtualKeyShort.DELETE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hộp thoại
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một hộp thoại đã gặp và đã trả lời.</summary>
    public sealed record Answered(string Text, IReadOnlyList<string> Buttons, string Clicked)
    {
        public override string ToString() =>
            $"「{Text}」 [{string.Join("|", Buttons)}] → {Clicked}";
    }

    /// <summary>
    /// Trả lời mọi MessageBox đang mở theo luật AN TOÀN, lặp tới khi hết hoặc hết giờ.
    ///
    /// <para>Luật: hộp nói 「登録せずに」 (Q00004 — rời màn KHÔNG lưu) thì OK; mọi hộp khác
    /// thì nhánh huỷ (キャンセル/いいえ) trước, hộp một nút thì OK. Mỗi nhánh một lời gọi
    /// riêng — <c>MsgBoxWin32.ClickButton</c> bấm nút đầu tiên khớp TẬP nhãn, không theo
    /// thứ tự ưu tiên (bẫy 2026-09-18).</para>
    /// </summary>
    public static IReadOnlyList<Answered> AnswerDialogs(OchaApp app, TimeSpan budget)
    {
        var answered = new List<Answered>();
        var clock = System.Diagnostics.Stopwatch.StartNew();
        var quietSince = TimeSpan.Zero;

        while (clock.Elapsed < budget)
        {
            var box = MsgBoxWin32.First(app.ProcessId);
            if (box is null)
            {
                // Hộp kế tiếp có thể bung ngay sau khi hộp trước đóng — chờ một nhịp yên.
                if (clock.Elapsed - quietSince > TimeSpan.FromMilliseconds(1200)) break;
                Thread.Sleep(150);
                continue;
            }

            var buttons = MsgBoxWin32.ButtonCaptions(box.Hwnd);
            string clicked;
            if (Txt.Has(box.Text, "登録せずに") && MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes"))
                clicked = "OK (rời màn không lưu)";
            else if (MsgBoxWin32.ClickButton(box.Hwnd, "キャンセル", "Cancel", "いいえ", "No"))
                clicked = "huỷ/いいえ";
            else if (MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes"))
                clicked = "OK (hộp một nút)";
            else
                clicked = "KHÔNG bấm được nút nào";

            answered.Add(new Answered(OneLine(box.Text), buttons, clicked));
            Thread.Sleep(300);
            quietSince = clock.Elapsed;
        }
        return answered;
    }

    public static string DescribeDialogs(OchaApp app)
    {
        var texts = MsgBoxWin32.All(app.ProcessId).Select(d => OneLine(d.ToString())).Where(t => t.Length > 0).ToList();
        return texts.Count == 0 ? "Không có hộp thoại nào đang mở." : "Hộp thoại đang mở: " + string.Join(" / ", texts) + ".";
    }

    public static string OneLine(string s) => s.Replace("\r", " ").Replace("\n", " ").Trim();

    // ─────────────────────────────────────────────────────────────────────────
    // Bảng control — đầu vào của G1
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Mọi control có AutomationId của một cửa sổ, một dòng mỗi control:
    /// <c>id \t type \t name \t value \t enabled \t offscreen \t rect</c>.
    ///
    /// <para>Dừng ở độ sâu 6: lưới (dgv*) bên dưới chỉ phơi dòng đang nhìn thấy (F10) và
    /// không phải thứ G1 so.</para>
    /// </summary>
    public static string ControlTable(AutomationElement root)
    {
        var sb = new StringBuilder();
        sb.AppendLine("id\ttype\tname\tvalue\tenabled\toffscreen\trect");
        foreach (var el in Uia.Descendants(root, maxDepth: 6))
        {
            string id;
            try { id = Uia.AutomationIdOf(el); } catch { continue; }
            if (string.IsNullOrEmpty(id) || int.TryParse(id, out _)) continue;

            string Safe(Func<string> f) { try { return f(); } catch { return "?"; } }
            sb.Append(id).Append('\t')
              .Append(Safe(() => Uia.ControlTypeOf(el)?.ToString() ?? "?")).Append('\t')
              .Append(Safe(() => OneLine(Uia.NameOf(el)))).Append('\t')
              .Append(Safe(() => OneLine(Uia.ValueOf(el)))).Append('\t')
              .Append(Safe(() => el.Properties.IsEnabled.ValueOrDefault ? "1" : "0")).Append('\t')
              .Append(Safe(() => el.Properties.IsOffscreen.ValueOrDefault ? "1" : "0")).Append('\t')
              .Append(Safe(() =>
              {
                  var r = el.Properties.BoundingRectangle.ValueOrDefault;
                  return $"{r.X},{r.Y},{r.Width}x{r.Height}";
              }))
              .AppendLine();
        }
        return sb.ToString();
    }

    private static void ClickPane(Window window, string automationId, string what)
    {
        var pane = Waits.For(() => Uia.ById(window, automationId), $"{what} (pane 「{automationId}」)");
        Uia.MouseClick(pane);
        Waits.Step();
    }
}
