using System.Text;
using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.InpP1Dialogs;
using OchaCom.FlaUiTests.Tests.MasterAutoLists;

namespace OchaCom.FlaUiTests.Tests.PatientGuidance;

/// <summary>
/// <b>PROBE — nhóm B: ba màn BaseForm mở từ hàng nút dưới lưới 診療入力. KHÔNG assert, không ném.</b>
///
/// <code>
///  btnSikan  歯管       → frm203021 歯科疾患管理
///  btnSidou  指導文書   → frm203022 実地指導1・訪問衛生指導
///  btnHokan  補管・義歯 → frm203023 クラウン・ブリッジ維持管理・義歯管理
/// </code>
///
/// Mỗi màn đo: nhãn F-key, MỌI control có AutomationId (loại, nhãn, giá trị, trạng thái tick,
/// bật/tắt), ô giữ focus lúc mở, thứ tự Tab, ESC / End / Enter, F8 (hỏi xác nhận rồi bấm
/// Cancel). KHÔNG ghi DB (F8 luôn Cancel), KHÔNG bấm F9 (in).
///
/// <para>Chạy: <c>.\run-edit-patient-guidance.ps1 -Diagnostics [-Case Tc1a]</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("patient-guidance")]
public sealed class PatientGuidanceProbeTests : UiTestBase
{
    protected override string[] NuisanceDialogPatterns => [];

    private const int TabSteps = 95;

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    [Test, Order(1)] public void Tc1a_Sikan() => Measure("btnSikan", "frm203021", "歯科疾患管理", "歯管");
    [Test, Order(2)] public void Tc1b_Sidou() => Measure("btnSidou", "frm203022", "指導", "指導文書");
    [Test, Order(3)] public void Tc1c_Hokan() => Measure("btnHokan", "frm203023", "義歯", "補管義歯");

    // ── 申し送り: nhãn 「Ｍ」 trên header 診療入力 → frm203025 (modal) → F2 → frm203026 (modal) ──
    [Test, Order(4)] public void Tc2a_Mousiokuri() => MeasureModal("申し送り", "申し送り事項", openFrom: () => ClickMain("imgMsg"), parent: null);
    [Test, Order(5)] public void Tc2b_MousiokuriTouroku() => MeasureModal("申し送り登録", "申し送り事項登録", openFrom: () => ClickMain("imgMsg"), parent: "申し送り事項", viaKey: Vk.F2);

    // ── 歯周疾患治療履歴 (frm203033): 「Ｐ」 (imgPCond) → frm203032 歯周情報 (modal) → F2 ──
    [Test, Order(6)]
    public void Tc3a_PerioHistory()
    {
        using var trace = TestTrace.Begin("Tc3a_PerioHistory");
        const string tag = "歯周履歴";
        try
        {
            var before = Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible).Select(w => w.Title).ToHashSet();
            ClickMain("imgPCond");
            Thread.Sleep(4000);
            var all = Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible && w.Title.Length > 0).Select(w => w.Title).ToList();
            Log($"=== KQ-B1 [{tag}] === cửa sổ sau khi click Ｐ: {string.Join(" / ", all)} (trước: {string.Join(" / ", before)})");
            var gate = all.FirstOrDefault(t => !before.Contains(t));
            if (gate is null) { Log($"=== KQ-B1 [{tag}] === không có cửa sổ mới"); return; }
            var g = FindModal(gate);
            if (g is null) return;
            FKeys(g, "歯周情報");
            InpP1MenuFlow.Focus(g);
            Uia.SendKey(Vk.F2);
            var win = Waits.TryFor(() => FindModal("歯周疾患治療履歴"), TimeSpan.FromSeconds(8));
            if (win is null)
            {
                Log($"=== KQ-B1 [{tag}] === F2 (phím) không mở; cửa sổ: {string.Join(" / ", Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible && w.Title.Length > 0).Select(w => w.Title))}; hộp thoại: {MsgBoxWin32.TextOfAll(App.ProcessId)}");
                var f2 = Find(g, "btnF2");
                if (f2 is not null) { var (bx, by) = Uia.Center(f2); Uia.LeftClickPhysical(bx, by); }
                win = Waits.TryFor(() => FindModal("歯周疾患治療履歴"), TimeSpan.FromSeconds(10));
                Log($"=== KQ-B1 [{tag}] === sau click chuột lên F2: {(win is null ? "vẫn không mở" : "mở")}; hộp thoại: {MsgBoxWin32.TextOfAll(App.ProcessId)}");
            }
            if (win is null) { Log($"=== KQ-B1 [{tag}] === không mở 歯周疾患治療履歴"); }
            else
            {
                Log($"=== KQ-B1 [{tag}] === tiêu đề=「{Uia.NameOf(win)}」");
                Log($"=== KQ-B6 [{tag}] === focus lúc MỞ: {FocusInfo()}");
                FKeys(win, tag);
                Controls(win, tag, "frm203033");
                TabOrder(tag, 8);
                Keys(win, tag, trace);
                F8(win, tag, trace);
                if (FindModal("歯周疾患治療履歴") is { } still) { InpP1MenuFlow.Focus(still); Uia.SendKey(Vk.F10); Thread.Sleep(1200); }
            }
            if (FindModal(gate) is { } gw) { Uia.ForceForeground(Win32Windows.OfProcess(App.ProcessId).First(w => w.Title == gate).Hwnd); Uia.SendKey(Vk.F10); Thread.Sleep(1200); }
        }
        catch (Exception e) { Log($"=== KQ-B1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "OK", "はい", "Yes", "Cancel");
        }
    }

    // ── kintoneファイル取込 (frm203004): frm203002 F10 → frm203001 → F6. Làm CUỐI vì rời 診療入力. ──
    [Test, Order(9)]
    public void Tc4a_KintoneImport()
    {
        using var trace = TestTrace.Begin("Tc4a_KintoneImport");
        const string tag = "kintone";
        try
        {
            InpP1MenuFlow.Focus(Screen.Window);
            Uia.SendKey(Vk.F10);
            Thread.Sleep(2500);
            foreach (var m in MsgBoxWin32.All(App.ProcessId))
            {
                Log($"=== KQ-B1 [{tag}] === F10 trên 診療入力 hiện hộp thoại: {m} nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(m.Hwnd))}]");
                MsgBoxWin32.ClickButton(m.Hwnd, "OK", "はい", "Yes");
            }
            var list = Waits.TryFor(() => App.Window("frm203001"), TimeSpan.FromSeconds(20));
            Log($"=== KQ-B1 [{tag}] === frm203001: {(list is null ? "KHÔNG thấy" : "thấy")}");
            if (list is null) return;
            FKeys(list, "frm203001");
            var f6 = Find(list, "btnF6");
            Log($"=== KQ-B1 [{tag}] === frm203001.btnF6: {(f6 is null ? "KHÔNG CÓ" : $"「{Txt.N(Uia.NameOf(f6))}」 enabled={SafeEnabled(f6)} onScreen={Uia.IsOnScreen(f6)}")}");
            if (f6 is null || !SafeEnabled(f6) || Txt.N(Uia.NameOf(f6)).Length == 0) { Log($"=== KQ-B1 [{tag}] === F6 kintone取込 TẮT trên máy này (iin_mst) — không đo được"); return; }
            InpP1MenuFlow.Focus(list);
            Uia.SendKey(Vk.F6);
            var win = Waits.TryFor(() => App.Window("frm203004"), TimeSpan.FromSeconds(15));
            if (win is null) { Log($"=== KQ-B1 [{tag}] === F6 không mở frm203004"); return; }
            Log($"=== KQ-B1 [{tag}] === tiêu đề=「{Uia.NameOf(win)}」");
            Log($"=== KQ-B6 [{tag}] === focus lúc MỞ: {FocusInfo()}");
            FKeys(win, tag);
            Controls(win, tag, "frm203004");
            TabOrder(tag, 10);
            Keys(win, tag, trace);
            F8(win, tag, trace);
            if (App.Window("frm203004") is { } still) { InpP1MenuFlow.Focus(still); Uia.SendKey(Vk.F10); Thread.Sleep(2000); }
        }
        catch (Exception e) { Log($"=== KQ-B1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "OK");
            try { ReopenTreatmentScreen(); } catch (Exception e) { Log($"=== KQ-B1 [{tag}] === không mở lại được 診療入力: {e.Message}"); }
        }
    }

    private void ClickMain(string id)
    {
        var el = Find(Screen.Window, id);
        if (el is null)
        {
            foreach (var d in Uia.Descendants(Screen.Window, 6))
            {
                var n = Uia.NameOf(d);
                if (n is "Ｍ" or "M" or "Ｐ" or "P" or "Ｉ" or "I" || Uia.AutomationIdOf(d).Contains("Mousi", StringComparison.OrdinalIgnoreCase))
                    Log($"=== KQ-B1 === ứng viên: id=「{Uia.AutomationIdOf(d)}」 name=「{n}」 type={Uia.ControlTypeOf(d)} rect={Uia.RectOf(d)}");
            }
            Log($"=== KQ-B1 === không thấy {id} trên frm203002");
            return;
        }
        var (x, y) = Uia.Center(el);
        Uia.LeftClickPhysical(x, y);
    }

    private Window? FindModal(string title)
    {
        var w32 = Win32Windows.OfProcess(App.ProcessId).FirstOrDefault(i => i.Visible && i.Title == title);
        if (w32 is null) return null;
        try { return App.Automation.FromHandle(w32.Hwnd).AsWindow(); } catch { return null; }
    }

    private void MeasureModal(string tag, string title, Action openFrom, string? parent, ushort viaKey = 0)
    {
        using var trace = TestTrace.Begin($"Tc2_{tag}");
        Window? win = null, par = null;
        try
        {
            openFrom();
            par = Waits.TryFor(() => FindModal(parent ?? title), TimeSpan.FromSeconds(15));
            if (par is null) { Log($"=== KQ-B1 [{tag}] === KHÔNG mở được {(parent ?? title)}"); return; }
            if (parent is not null)
            {
                InpP1MenuFlow.Focus(par);
                Uia.SendKey(viaKey);
                win = Waits.TryFor(() => FindModal(title), TimeSpan.FromSeconds(15));
            }
            else win = par;
            if (win is null) { Log($"=== KQ-B1 [{tag}] === KHÔNG mở được {title}"); return; }

            Log($"=== KQ-B1 [{tag}] === tiêu đề=「{Uia.NameOf(win)}」");
            Log($"=== KQ-B6 [{tag}] === focus lúc MỞ: {FocusInfo()}");
            FKeys(win, tag);
            Controls(win, tag, title);
            trace.Shot("mo");
            TabOrder(tag, 14);
            Keys(win, tag, trace);
            F8(win, tag, trace);   // F8 tắt ở màn này: ghi nhận hành vi
            InpP1MenuFlow.Focus(win);
            Uia.SendKey(Vk.F9);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
            Log($"=== KQ-B8 [{tag}] === F9: " + (box is null ? "KHÔNG có hộp thoại" : $"「{box.Text}」 nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]"));
            if (box is not null && !MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "キャンセル", "いいえ", "No")) MsgBoxWin32.ClickButton(box.Hwnd, "OK");
            Waits.Step();
        }
        catch (Exception e) { Log($"=== KQ-B1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            try
            {
                foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "いいえ", "No", "OK");
                for (var i = 0; i < 3; i++)
                {
                    var top = Win32Windows.OfProcess(App.ProcessId).FirstOrDefault(w => w.Visible && (w.Title == title || w.Title == parent));
                    if (top is null) break;
                    Uia.ForceForeground(top.Hwnd);
                    Uia.SendKey(Vk.F10);
                    Thread.Sleep(1200);
                    foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "OK", "はい", "Yes");   // Q00004 「登録せずに」
                    Thread.Sleep(600);
                }
            }
            catch (Exception e) { Log($"=== KQ-B1 [{tag}] === không đóng được: {e.Message}"); }
        }
    }

    private void Measure(string buttonId, string formId, string titleHint, string tag)
    {
        using var trace = TestTrace.Begin($"Tc1_{formId}");
        Window? win = null;
        try
        {
            win = Open(buttonId, formId, trace);
            if (win is null) { Log($"=== KQ-B1 [{tag}] === KHÔNG MỞ ĐƯỢC {formId}"); return; }

            Log($"=== KQ-B1 [{tag}] === {formId}: tiêu đề=「{Uia.NameOf(win)}」");
            Log($"=== KQ-B6 [{tag}] === focus lúc MỞ: {FocusInfo()}");
            FKeys(win, tag);
            Controls(win, tag, formId);
            trace.Shot("mo");

            TabOrder(tag, TabSteps);
            Keys(win, tag, trace);
            F8(win, tag, trace);
        }
        catch (Exception e)
        {
            Log($"=== KQ-B1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}");
        }
        finally
        {
            try
            {
                foreach (var m in MsgBoxWin32.All(App.ProcessId))
                {
                    Log($"=== KQ-B1 [{tag}] === dẹp hộp thoại còn sót: {m}");
                    MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "いいえ", "No", "OK");
                }
                if (App.Window(formId) is { } still) { InpP1MenuFlow.Focus(still); Uia.SendKey(Vk.F10); Thread.Sleep(1500); }
            }
            catch (Exception e) { Log($"=== KQ-B1 [{tag}] === không đóng được: {e.Message}"); }
        }
    }

    private Window? Open(string buttonId, string formId, TestTrace trace)
    {
        if (App.Window(formId) is { } already) return already;
        var main = Screen.Window;
        var btn = Find(main, buttonId);
        if (btn is null) { Log($"=== KQ-B1 === không thấy nút {buttonId} trên frm203002"); return null; }
        trace.Step($"click {buttonId}");
        var (x, y) = Uia.Center(btn);
        Uia.LeftClickPhysical(x, y);
        return Waits.TryFor(() => App.Window(formId), TimeSpan.FromSeconds(20));
    }

    private void FKeys(Window win, string tag)
    {
        for (var i = 1; i <= 12; i++)
        {
            var b = Find(win, $"btnF{i}");
            if (b is null) continue;
            var name = Txt.N(Uia.NameOf(b));
            var en = SafeEnabled(b);
            if (name.Length == 0 && !en) continue;
            Log($"=== KQ-B1 [{tag}] === btnF{i}: 「{name}」 enabled={en}");
        }
    }

    private void Controls(Window win, string tag, string formId)
    {
        var sb = new StringBuilder();
        var n = 0;
        foreach (var e in Uia.Descendants(win, 10))
        {
            var id = Uia.AutomationIdOf(e);
            if (id.Length == 0 || id.StartsWith("btnF", StringComparison.Ordinal)) continue;
            var type = Uia.ControlTypeOf(e)?.ToString() ?? "?";
            if (type is "Pane" or "Group" or "Custom" or "Window" or "TitleBar" or "Text" && Txt.N(Uia.NameOf(e)).Length == 0) continue;
            var toggle = "";
            try { toggle = e.Patterns.Toggle.PatternOrDefault?.ToggleState.ValueOrDefault.ToString() ?? ""; } catch { }
            var line = $"{id} [{type}] name=「{Txt.N(Uia.NameOf(e))}」 value=「{Txt.N(Uia.ValueOf(e))}」 toggle={toggle} enabled={SafeEnabled(e)} onScreen={Uia.IsOnScreen(e)}";
            Log($"=== KQ-B2 [{tag}] === {line}");
            sb.AppendLine(line);
            n++;
        }
        Log($"=== KQ-B2 [{tag}] === tổng {n} control có id");
        InpP1MenuFlow.WriteArtifact($"guidance-{formId}.controls.txt", sb.ToString());
        InpP1MenuFlow.WriteArtifact($"guidance-{formId}.uia.txt", Uia.DumpTree(win, maxDepth: 8, maxChildrenPerNode: 120));
    }

    private void TabOrder(string tag, int n)
    {
        for (var i = 1; i <= n; i++)
        {
            Uia.SendKey(Vk.Tab);
            Thread.Sleep(200);
            Log($"=== KQ-B6 [{tag}] === Tab#{i} → {FocusInfo()}");
        }
    }

    /// <summary>ESC / End / Enter: có hộp thoại? form còn? (BaseForm chỉ ánh xạ khi cờ bật).</summary>
    private void Keys(Window win, string tag, TestTrace trace)
    {
        foreach (var (name, vk) in new[] { ("Escape", Vk.Escape), ("End", Vk.End), ("Enter", (ushort)0x0D) })
        {
            InpP1MenuFlow.Focus(win);
            Uia.SendKey(vk);
            Thread.Sleep(1500);
            var box = MsgBoxWin32.First(App.ProcessId);
            var alive = Uia.IsOnScreen(win);
            Log($"=== KQ-B7 [{tag}] === {name}: form {(alive ? "còn" : "ĐÃ ĐÓNG")}, hộp thoại={(box is null ? "không" : $"{box} nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]")}, focus: {FocusInfo()}");
            if (box is not null) { MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "キャンセル", "いいえ", "No", "OK"); Waits.Step(); }
            if (!alive) { Log($"=== KQ-B7 [{tag}] === {name} đóng màn ⇒ dừng"); return; }
        }
    }

    /// <summary>F8 登録: hỏi Q00001 (OK/Cancel) hoặc lỗi — luôn Cancel/OK, không ghi.</summary>
    private void F8(Window win, string tag, TestTrace trace)
    {
        InpP1MenuFlow.Focus(win);
        Uia.SendKey(Vk.F8);
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
        if (box is null) { Log($"=== KQ-B8 [{tag}] === F8: KHÔNG có hộp thoại; form {(Uia.IsOnScreen(win) ? "còn" : "ĐÃ ĐÓNG")}"); return; }
        Log($"=== KQ-B8 [{tag}] === F8: 「{box.Text}」 nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]");
        trace.Shot("f8-hop");
        if (!MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "キャンセル", "いいえ", "No")) MsgBoxWin32.ClickButton(box.Hwnd, "OK");
        Waits.Step();
    }

    // ── tiện ích ────────────────────────────────────────────────────────────

    private static bool SafeEnabled(AutomationElement e)
    {
        try { return e.Properties.IsEnabled.ValueOrDefault; } catch { return false; }
    }

    private string FocusInfo()
    {
        try
        {
            var f = App.Automation.FocusedElement();
            if (f is null) return "(không có)";
            var sel = "n/a";
            try
            {
                var ranges = f.Patterns.Text.PatternOrDefault?.GetSelection();
                if (ranges is not null) sel = string.Join("|", ranges.Select(r => r.GetText(200)));
            }
            catch { }
            var toggle = "";
            try { toggle = f.Patterns.Toggle.PatternOrDefault?.ToggleState.ValueOrDefault.ToString() ?? ""; } catch { }
            return $"{Uia.AutomationIdOf(f)} [{Uia.ControlTypeOf(f)}] name=「{Txt.N(Uia.NameOf(f))}」 value=「{Txt.N(Uia.ValueOf(f))}」 toggle={toggle} bôiĐen=「{sel}」";
        }
        catch (Exception e) { return "? " + e.Message; }
    }

    private static AutomationElement? Find(AutomationElement root, string id)
    {
        var queue = new Queue<(AutomationElement El, int Depth)>();
        queue.Enqueue((root, 0));
        while (queue.Count > 0)
        {
            var (el, depth) = queue.Dequeue();
            if (Uia.AutomationIdOf(el) == id) return el;
            if (depth >= 8) continue;
            foreach (var c in Uia.Children(el)) queue.Enqueue((c, depth + 1));
        }
        return null;
    }
}
