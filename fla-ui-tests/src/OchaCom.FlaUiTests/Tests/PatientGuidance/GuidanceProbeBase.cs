using System.Text;
using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.InpP1Dialogs;
using OchaCom.FlaUiTests.Tests.MasterAutoLists;

namespace OchaCom.FlaUiTests.Tests.PatientGuidance;

/// <summary>
/// Công cụ đo dùng chung cho các probe nhóm B / C (form BaseForm và dialog modal mở từ 診療入力):
/// nhãn F-key, mọi control có AutomationId, focus lúc mở, thứ tự Tab, ESC / End / Enter, F8.
/// KHÔNG assert, không ghi DB.
/// </summary>
public abstract class GuidanceProbeBase : UiTestBase
{
    protected override string[] NuisanceDialogPatterns => [];

    protected const int TabSteps = 95;

    protected static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    protected void ClickMain(string id)
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

    protected Window? FindModal(string title)
    {
        var w32 = Win32Windows.OfProcess(App.ProcessId).FirstOrDefault(i => i.Visible && i.Title == title);
        if (w32 is null) return null;
        try { return App.Automation.FromHandle(w32.Hwnd).AsWindow(); } catch { return null; }
    }

    protected void MeasureModal(string tag, string title, Action openFrom, string? parent, ushort viaKey = 0, bool withEnter = true)
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
            Keys(win, tag, trace, withEnter);
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

    protected void FKeys(Window win, string tag)
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

    protected void Controls(Window win, string tag, string formId)
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

    protected void TabOrder(string tag, int n)
    {
        for (var i = 1; i <= n; i++)
        {
            Uia.SendKey(Vk.Tab);
            Thread.Sleep(200);
            Log($"=== KQ-B6 [{tag}] === Tab#{i} → {FocusInfo()}");
        }
    }

    /// <summary>ESC / End / Enter: có hộp thoại? form còn? (BaseForm chỉ ánh xạ khi cờ bật).</summary>
    protected void Keys(Window win, string tag, TestTrace trace, bool withEnter = true)
    {
        foreach (var (name, vk) in new[] { ("Escape", Vk.Escape), ("End", Vk.End), ("Enter", (ushort)0x0D) }.Where(k => withEnter || k.Item1 != "Enter"))
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
    protected void F8(Window win, string tag, TestTrace trace)
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

    protected static bool SafeEnabled(AutomationElement e)
    {
        try { return e.Properties.IsEnabled.ValueOrDefault; } catch { return false; }
    }

    protected string FocusInfo()
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

    protected static AutomationElement? Find(AutomationElement root, string id)
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
