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
public sealed class PatientGuidanceProbeTests : GuidanceProbeBase
{
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

    /// <summary>
    /// Đối chiếu web TC-PDF-1 (report-text-length-guard.spec.ts): nhồi ĐÚNG cap mọi ô của 補管・義歯
    /// — 着脱方法 60 ký tự ×2 (Designer MaxLength = 60), その他情報 25 全角 ×6 — rồi F9 in
    /// (printProc frm203023.cs:367 → printControl.printReport RPT203003; Ocha.xml Preview=1 ⇒
    /// viewer frm902002). Đo: giá trị thật trong ô sau khi gõ, và SỐ TRANG viewer báo.
    /// Không ghi DB (F9 chỉ dựng bảng tạm in rồi đóng).
    /// </summary>
    [Test, Order(10)]
    public void Tc5_HokanPrintPages()
    {
        using var trace = TestTrace.Begin("Tc5_HokanPrintPages");
        const string tag = "補管印刷";
        try
        {
            var win = Open("btnHokan", "frm203023", trace);
            if (win is null) { Log($"=== KQ-P1 [{tag}] === KHÔNG MỞ ĐƯỢC frm203023"); return; }
            var inputs = new (string Id, string Text)[]
            {
                ("txtAttach1", new string('あ', 60)), ("txtAttach2", new string('い', 60)),
                ("cboOtherInfo1", new string('あ', 25)), ("cboOtherInfo2", new string('あ', 25)), ("cboOtherInfo3", new string('あ', 25)),
                ("cboOtherInfo4", new string('あ', 25)), ("cboOtherInfo5", new string('あ', 25)), ("cboOtherInfo6", new string('あ', 25)),
            };
            foreach (var (id, text) in inputs)
            {
                var el = Find(win, id);
                if (el is null) { Log($"=== KQ-P1 [{tag}] === không thấy {id}"); continue; }
                Uia.SetText(el, text);
                Thread.Sleep(150);
                var v = Uia.ValueOf(el);
                Log($"=== KQ-P1 [{tag}] === {id}: gõ {text.Length} → trong ô {v.Length} ký tự");
            }
            trace.Shot("da-go");

            var before = Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible).Select(w => w.Hwnd).ToHashSet();
            var f9 = Find(win, "btnF9");
            if (f9 is null) { Log($"=== KQ-P2 [{tag}] === không thấy btnF9"); return; }
            var (x, y) = Uia.Center(f9);
            Uia.LeftClickPhysical(x, y);
            var preview = Waits.TryFor(() => Win32Windows.OfProcess(App.ProcessId).FirstOrDefault(w => w.Visible && !before.Contains(w.Hwnd) && w.Title.Length > 0), TimeSpan.FromSeconds(30));
            Log($"=== KQ-P2 [{tag}] === sau F9: cửa sổ mới=「{preview?.Title ?? "(không có)"}」 hộp thoại: {MsgBoxWin32.TextOfAll(App.ProcessId)}");
            if (preview is null) return;
            Thread.Sleep(4000);   // Crystal dựng trang
            var pv = App.Automation.FromHandle(preview.Hwnd).AsWindow();
            trace.Shot("preview-trang1");
            InpP1MenuFlow.WriteArtifact("hokan-preview.uia.txt", Uia.DumpTree(pv, maxDepth: 10, maxChildrenPerNode: 120));
            foreach (var d in Uia.Descendants(pv, 10))
            {
                var n = Txt.N(Uia.NameOf(d));
                if (n.Length > 0 && (n.Contains('/') || n.Contains("ページ") || n.Contains("Page") || n.Contains("最後") || n.Contains("Last")))
                    Log($"=== KQ-P3 [{tag}] === viewer: id=「{Uia.AutomationIdOf(d)}」 [{Uia.ControlTypeOf(d)}] name=「{n}」");
            }
            var last = Uia.Descendants(pv, 10).FirstOrDefault(d => Txt.N(Uia.NameOf(d)) is var n && (n.Contains("最後") || n.Contains("Last")));
            if (last is not null)
            {
                var (lx, ly) = Uia.Center(last);
                Uia.LeftClickPhysical(lx, ly);
                Thread.Sleep(3000);
                trace.Shot("preview-trang-cuoi");
                foreach (var d in Uia.Descendants(pv, 10))
                {
                    var n = Txt.N(Uia.NameOf(d));
                    if (n.Contains('/') || n.Contains("ページ") || n.Contains("Page"))
                        Log($"=== KQ-P4 [{tag}] === sau 最後のページ: id=「{Uia.AutomationIdOf(d)}」 [{Uia.ControlTypeOf(d)}] name=「{n}」");
                }
            }
            Uia.ForceForeground(preview.Hwnd);
            Uia.SendKey(Vk.F10);
            Thread.Sleep(1500);
            if (Win32Windows.OfProcess(App.ProcessId).Any(w => w.Hwnd == preview.Hwnd && w.Visible)) { Uia.SendKey(Vk.Escape); Thread.Sleep(1500); }
        }
        catch (Exception e) { Log($"=== KQ-P1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            foreach (var m in MsgBoxWin32.All(App.ProcessId)) { Log($"=== KQ-P1 [{tag}] === hộp thoại còn sót: {m}"); MsgBoxWin32.ClickButton(m.Hwnd, "OK", "Cancel", "キャンセル"); }
            if (App.Window("frm203023") is { } still) { InpP1MenuFlow.Focus(still); Uia.SendKey(Vk.F10); Thread.Sleep(1500); }
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

}
