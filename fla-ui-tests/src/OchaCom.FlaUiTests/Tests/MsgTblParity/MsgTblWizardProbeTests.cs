using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// PROBE — wizard 新規患者登録 (<c>frm201021 → frm201022 → frm201023</c>).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI QUA WIZARD
/// ═══════════════════════════════════════════════════════════════════════════════
/// Bốn mã của <c>msgtbl-register-wizard-parity.spec.ts</c> chỉ sống ở bước 3
/// (<c>frm201023</c> 受診者情報), và ở <c>frm201001</c> hai trong số đó <b>đã bị
/// comment out</b>:
///
/// <code>
///   E00052  frm201001.cs:2216  //ShowErrorMsg("E00052")   ⇒ CHẾT
///           frm201023.cs:403   ShowErrorMsg("E00052")     ⇐ nơi duy nhất còn sống
///   E00013  frm201001.cs:2376  //ShowErrorMsg("E00013")   ⇒ CHẾT
///           frm201023.cs:488   ShowErrorMsg("E00013")     ⇐ nơi duy nhất còn sống
///   E00018  frm201023.cs:414   — chỉ có ở đây
///   E00019  frm201023.cs:425   — chỉ có ở đây
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG VÀO
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>frm201001</c> gọi <c>CommonPat.dspWizard()</c> khi <c>patData == null</c> — tức
/// khi số bệnh nhân nhập vào CHƯA TỒN TẠI (frm201001.cs:211-231). Trước đó, nếu
/// <c>Ocha.xml PatWizard == 0</c> thì app hỏi <c>Q00037</c> trước.
///
/// <para>⚠️ Dùng số trong vùng test (<c>PAT_NO ≥ 990000</c>) chứ KHÔNG dùng số bừa:
/// lỡ tay đi hết wizard là tạo bệnh nhân thật, và số trong vùng test thì
/// <c>TestPatientDb</c> dọn được.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI GÌ
/// ═══════════════════════════════════════════════════════════════════════════════
/// Cả bốn ca đều làm <c>chkInputDataMain</c> trả <c>false</c> ⇒ <c>btnF9_Click</c>
/// (frm201023.cs:116-126) KHÔNG chạy tới <c>pKbn = Next</c>, wizard đứng yên tại bước 3.
/// Probe kết thúc bằng cách huỷ wizard, nên không có <c>INSERT</c> nào.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// THỨ TỰ CỔNG — chọn 保険種別 nào thì bung mã nào
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>chkInputDataMain</c> kiểm theo thứ tự, dừng ở lỗi ĐẦU TIÊN (frm201023.cs:395-492):
/// <code>
///   E00052  insKbn ∈ {8 社退, 9 国退}  VÀ  oldFlg ≥ 1
///   E00018  insKbn ∈ {1 社保, 2 国保, 8, 9, 10 後期高齢者}  VÀ  chưa có 医療保険情報
///   E00019  insKbn == 7 公・単  VÀ  chưa có 公費情報
///   E00013  初回来院日 > 診療開始日
/// </code>
/// ⇒ muốn tới được E00013 thì phải chọn <b>6 自費</b>: nó rơi ra ngoài cả ba tập trên.
/// </summary>
[TestFixture]
[NonParallelizable]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("msgtbl-parity")]
[CancelAfter(900_000)]
public sealed class MsgTblWizardProbeTests : UiTestBase
{
    protected override bool NavigatesToTreatmentEntry => false;

    private const string PatEntryId = "frm201001";

    /// <summary>患者登録（患者検索） — メインメニュー 日常業務 ⇒ nút số 1 (MainMenu.cs:821).</summary>
    private const string PatListId = "frm201008";
    private const string Step1Id = "frm201021";
    private const string Step2Id = "frm201022";
    private const string Step3Id = "frm201023";

    /// <summary>Số bệnh nhân CHƯA tồn tại, nằm trong vùng test của <see cref="TestPatientDb"/>.</summary>
    private const string UnusedPatNo = "990001";

    private MsgTblOracle? _msg;


    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    [OneTimeSetUp]
    public void WizardProbeOneTimeSetUp()
    {
        // KHÔNG gọi OpenPatientSelect: hàm đó đi từ メインメニュー sang 患者選択, mà probe
        // này cần ĐỨNG LẠI ở menu để vào nhánh 患者登録. Đo lượt 15:47: setup điều hướng
        // trước, tới bước 1 thì menu đã biến mất và probe báo 「không thấy メインメニュー」.
        _msg = MsgTblOracle.CreateOrNull(TestSettings.Current);
    }

    [Test]
    [Description("TCW0 — PROBE: mở wizard 新規登録 và đổ ra ba bước + thử bốn mã của bước 3")]
    public void TCW0_Probe_RegistrationWizard()
    {
        using var trace = TestTrace.Begin();

        Step(trace, 0, "don hop thoai dang chan", () => Drain());

        // Wizard CHỈ chạy ở nhánh InpKbn == Insert (frm201001.cs:164). Đường F2 患者情報 từ
        // 患者選択 đặt Update (frm203001.cs:346) nên KHÔNG bao giờ tới wizard — đã đo lượt
        // 15:41: frm201001 mở thẳng, không hỏi Q00037.
        //
        // Đường đúng: メインメニュー → 日常業務 → 患者登録 (frm201008) → gõ số CHƯA TỒN TẠI
        // → 確定. frm201008.defData thấy getPersonData trả null thì đặt Insert
        // (frm201008.cs:410-413) rồi mới mở frm201001.
        Step(trace, 1, "menu 日常業務 → 患者登録 (frm201008)", () =>
        {
            var menu = Waits.TryFor(() => App.Window("MainMenu") ?? App.WindowByTitle("メインメニュー"),
                                    TimeSpan.FromSeconds(20));
            if (menu is null)
                return "KHÔNG thấy メインメニュー — app đang ở màn khác: " + DescribeWindows();

            ClickPane(menu, "pnlBtn1", "業務 日常業務");
            ClickPane(menu, "pnlMenu1", "メニュー 患者登録");

            var list = Waits.TryFor(() => App.Window(PatListId), TimeSpan.FromSeconds(20));
            return list is null
                ? "KHÔNG mở được frm201008 — " + DescribeWindows()
                : $"frm201008 đang mở 「{Txt.N(list.Title)}」";
        });

        Step(trace, 11, "bam 「F1 新患」 tren frm201008", () =>
        {
            var list = App.Window(PatListId);
            if (list is null) return "không thấy frm201008";
            DumpForm(list, PatListId);

            // Ảnh chụp lượt 16:04 chỉ ra: dải nút của frm201008 là
            //   F1 新患 | F2 患者検索 | F4 医療扶助 | F5 訪問診療 | F9 選択 | F10 戻る | F12 メニュー
            //
            // 「F1 新患」 mới là cửa vào bệnh nhân MỚI: nó gọi getNewPatNo() rồi đặt
            // InpKbn = Insert (frm201008.cs:426-427). Gõ một số chưa tồn tại vào ô 患者番号
            // rồi Enter thì KHÔNG đi đường đó — hai lượt trước đều rơi vào 患者登録 ở chế độ
            // Update và wizard không bao giờ chạy.
            ClickBarButton(list, "btnF1", "新患");
            Waits.Step();

            // Có thể bung nhiều hộp thoại liên tiếp; 「ウィザード」 là Q00037 cần trả lời CÓ.
            var seen = new List<string>();
            for (var i = 0; i < 6; i++)
            {
                var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(10));
                if (box is null) break;

                var isWizard = Txt.Has(box.Raw, "ウィザード");
                seen.Add($"{Txt.Vis(box.Raw)} [{string.Join("/", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]" +
                         (isWizard ? " ← Q00037, trả lời CÓ" : " ← dẹp"));

                MsgBoxWin32.ClickButton(box.Hwnd, isWizard ? "はい" : "OK", "はい", "Yes", "OK");
                WaitClosed(box);
                if (isWizard) break;
            }

            return seen.Count == 0 ? "không có hộp thoại nào sau 「F1 新患」" : string.Join("  |  ", seen);
        });

        Step(trace, 2, "cho wizard buoc 1 (frm201021)", () =>
        {
            var w = Waits.TryFor(() => FindForm(Step1Id), TimeSpan.FromSeconds(15));
            if (w is null) return "KHÔNG thấy frm201021 — cửa sổ đang mở: " + DescribeWindows();
            DumpForm(w, Step1Id);
            return $"frm201021 đang mở 「{Txt.N(w.Name)}」";
        });

        Step(trace, 3, "bam F9 de sang buoc 2", () => Advance(Step1Id, Step2Id));
        Step(trace, 4, "bam F9 de sang buoc 3", () => Advance(Step2Id, Step3Id));

        var step3 = FindForm(Step3Id);
        if (step3 is null)
        {
            LogKq(9, "không tới được bước 3 (frm201023) — đọc các KQ trên và ảnh trong " +
                     "artifacts/screenshots để biết bước nào chặn.");
            return;
        }

        DumpForm(step3, Step3Id);

        // ── Bốn ca của bước 3 ────────────────────────────────────────────────
        TryCase(trace, 5, step3, "E00052", "社退", "1");
        TryCase(trace, 6, step3, "E00018", "社保", "");
        TryCase(trace, 7, step3, "E00019", "公・単", "");
        TryCase(trace, 8, step3, "E00013", "自費", "");

        LogKq(9, "xong. Bốn ca trên: đặt 保険種別 (+高齢者 cho E00052) rồi F9; " +
                 "chkInputDataMain hỏng ⇒ wizard đứng yên, không INSERT gì.");
    }

    /// <summary>Đặt 保険種別 / 高齢者 rồi bấm F9, ghi lại mã bung ra.</summary>
    private void TryCase(TestTrace trace, int no, AutomationElement form,
                         string expectedCode, string patType, string oldFlg)
    {
        Step(trace, no, $"{expectedCode}: 保険種別=「{patType}」 oldFlg=「{oldFlg}」 roi F9", () =>
        {
            if (!SelectCombo(form, "cboPatType", patType, out var why)) return $"không chọn được 保険種別: {why}";
            if (oldFlg.Length > 0 && !SelectCombo(form, "cboOldFlg", oldFlg, out var why2))
                Log($"      (không chọn được 高齢者 「{oldFlg}」: {why2})");

            ClickBarButton(form, "btnF9", "次へ");

            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null)
                return "KHÔNG có hộp thoại — coi chừng chkInputDataMain đã QUA và wizard sang bước sau";

            var template = _msg?.Template(expectedCode);
            var shot = MsgEvidence.Capture(box, $"{expectedCode} frm201023 wizard {patType}", template,
                                           Txt.N(App.Automation.FocusedElement()?.Name));
            Log($"      nguyên văn : {Txt.Vis(box.Raw)}");
            if (template is not null) Log($"      row MSGTBL : {Txt.Vis(template)}");
            Log($"      nút        : {string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}");
            Log($"      ảnh        : {shot ?? "(không chụp được)"}");

            MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes");
            WaitClosed(box);
            return Txt.Vis(box.Raw);
        });
    }

    // ── Hạ tầng ─────────────────────────────────────────────────────────────

    private string Advance(string fromId, string toId)
    {
        var from = FindForm(fromId);
        if (from is null) return $"không thấy {fromId}";

        ClickBarButton(from, "btnF9", "次へ");
        Waits.Step();

        // F9 có thể bung lỗi validate của chính bước đó — ghi lại rồi dẹp.
        for (var i = 0; i < 4; i++)
        {
            var box = MsgBoxWin32.First(App.ProcessId);
            if (box is null) break;
            Log($"      {fromId} chặn: {Txt.Vis(box.Raw)}");
            MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes");
            WaitClosed(box);
        }

        var to = Waits.TryFor(() => FindForm(toId), TimeSpan.FromSeconds(10));
        return to is null
            ? $"KHÔNG sang được {toId} — {fromId} còn đang chặn (xem dòng trên)"
            : $"đã sang {toId}";
    }

    /// <summary>
    /// Wizard là <c>showDialog</c> nên các bước có thể là form CON, không phải top-level
    /// (cùng bẫy đã gặp ở frm203046 và frm203043). Lục cả hai đường.
    /// </summary>
    private Window? FindForm(string id)
    {
        var top = App.Window(id);
        if (top is not null) return top;

        foreach (var parent in new[] { App.Window(PatEntryId), App.Window(PatListId) })
        {
            if (parent is null) continue;
            var nested = KarteAutoCalc.KarteAutoCalcDialog.FindDialogWindow(App, id, id, parent);
            if (nested is not null) return nested;
        }
        return null;
    }

    /// <summary>
    /// Đổ ô + nút của một form.
    ///
    /// <para>MỌI lần đọc thuộc tính đều bọc try/catch: vài phần tử của WinForms không phơi
    /// <c>ControlType</c> lẫn <c>AutomationId</c> và ném <c>PropertyNotSupportedException</c>
    /// (đã vấp hai lần: 13:20 với AutomationId, 15:50 với ControlType). Probe mà chết vì
    /// đọc thuộc tính thì mất luôn mọi câu trả lời sau nó.</para>
    /// </summary>
    private void DumpForm(AutomationElement form, string id)
    {
        static ControlType? TypeOf(AutomationElement e)
        {
            try { return e.ControlType; } catch { return null; }
        }

        static string IdOf(AutomationElement e)
        {
            try { return e.AutomationId; } catch { return "(không có)"; }
        }

        var fields = form.FindAllDescendants()
            .Where(e => TypeOf(e) is ControlType.Edit or ControlType.ComboBox or ControlType.CheckBox)
            .ToList();
        Log($"   {id}: {fields.Count} ô");
        foreach (var e in fields.Take(70))
            Log($"      {TypeOf(e),-9} id=「{IdOf(e)}」 name=「{Txt.N(e.Name)}」 value=「{Txt.N(Uia.ValueOf(e))}」");

        foreach (var b in form.FindAllDescendants().Where(e => TypeOf(e) == ControlType.Button).Take(20))
            Log($"      Button id=「{IdOf(b)}」 name=「{Txt.N(b.Name)}」");
    }

    /// <summary>Chọn mục của combo bằng BÀN PHÍM (F13 + bài học của TCR4: UIA Select không đổi SelectedValue).</summary>
    private bool SelectCombo(AutomationElement form, string automationId, string wanted, out string why)
    {
        why = "";
        var combo = Uia.ById(form, automationId);
        if (combo is null) { why = $"không thấy 「{automationId}」"; return false; }

        var (x, y) = Uia.Center(combo);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
        FlaUI.Core.Input.Keyboard.TypeSimultaneously(
            FlaUI.Core.WindowsAPI.VirtualKeyShort.ALT, FlaUI.Core.WindowsAPI.VirtualKeyShort.DOWN);
        Thread.Sleep(300);
        FlaUI.Core.Input.Keyboard.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.HOME);
        Thread.Sleep(150);

        for (var i = 0; i < 30; i++)
        {
            if (Txt.Has(Txt.N(Uia.ValueOf(combo)), wanted))
            {
                FlaUI.Core.Input.Keyboard.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.ENTER);
                Waits.Step();
                return true;
            }
            FlaUI.Core.Input.Keyboard.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.DOWN);
            Thread.Sleep(110);
        }

        FlaUI.Core.Input.Keyboard.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.ESCAPE);
        why = $"dò 30 nhịp không thấy 「{wanted}」; combo đang giữ 「{Txt.N(Uia.ValueOf(combo))}」";
        return false;
    }

    private string Drain()
    {
        var seen = new List<string>();
        for (var i = 0; i < 5; i++)
        {
            var box = MsgBoxWin32.First(App.ProcessId);
            if (box is null) break;
            seen.Add(Txt.Vis(box.Raw));
            if (!MsgBoxWin32.ClickButton(box.Hwnd, "いいえ", "No", "キャンセル", "Cancel", "OK")) break;
            WaitClosed(box);
        }
        return seen.Count == 0 ? "không có hộp thoại nào" : string.Join(" + ", seen);
    }

    private void WaitClosed(MsgBoxWin32.Found box) =>
        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));

    private string DescribeWindows()
    {
        try
        {
            return string.Join(", ", OchaApp.SharedAutomation.GetDesktop().FindAllChildren()
                .Where(w => w.Properties.ProcessId.ValueOrDefault == App.ProcessId)
                .Select(w => $"「{Txt.N(w.Name)}」({w.AutomationId})"));
        }
        catch (Exception e) { return $"(không liệt kê được: {e.Message})"; }
    }

    /// <summary>Menu chính không có Button nào — toàn Panel nghe MouseClick (xem AppNavigator).</summary>
    private static void ClickPane(Window window, string automationId, string what)
    {
        var pane = Waits.For(() => Uia.ById(window, automationId), $"{what} (pane 「{automationId}」)");
        Uia.MouseClick(pane);
        Waits.Step();
    }

    private static void ClickBarButton(AutomationElement form, string automationId, string caption)
    {
        var button = Uia.ByIdOrName(form, automationId, caption)
                     ?? throw new InvalidOperationException($"không thấy nút 「{caption}」 ({automationId})");
        var (x, y) = Uia.Center(button);
        if (x <= 0 && y <= 0) throw new InvalidOperationException($"nút 「{caption}」 không có toạ độ");
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    private static void Step(TestTrace trace, int no, string what, Func<string> action)
    {
        try
        {
            var result = action();
            LogKq(no, $"{what} → {result}");
            trace.Step(what);
        }
        catch (Exception e)
        {
            LogKq(no, $"{what} → NGOẠI LỆ {e.GetType().Name}: {e.Message}");
            trace.Shot($"{no}-loi");
        }
    }
}
