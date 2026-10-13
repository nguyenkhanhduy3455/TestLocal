using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.InpP1Dialogs;
using OchaCom.FlaUiTests.Tests.MasterAutoLists;
using OchaCom.FlaUiTests.Tests.PatientGuidance;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.ToothInfo;

/// <summary>
/// <b>PROBE — nhóm C: các dialog sơ đồ răng / ảnh mở từ 診療入力. KHÔNG assert, không ném.</b>
///
/// <code>
///  imgPCond (Ｐ)   → frm203032 歯周情報
///  imgTCond (Ｔ)   → frm203031 治療情報
///  btnHotetu 補管  → frm203045 補綴管理
///  btnGazou  画像  → frm203024 画像 (nút chỉ hiện theo cấu hình)
///  F6 → カルテ記載選択 (frm203011) → F3 → frm203030 ＰＣＲ
/// </code>
///
/// Cùng khuôn với <see cref="PatientGuidanceProbeTests"/>: F-key, control có id, focus lúc mở,
/// Tab, ESC / End / Enter, F8. KHÔNG ghi DB, KHÔNG bấm F9 (in/ghi).
///
/// <para>Chạy: <c>.\run-edit-tooth-info.ps1 -Diagnostics [-Case Tc5a]</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("tooth-info")]
public sealed class ToothInfoProbeTests : GuidanceProbeBase
{
    [Test, Order(1)] public void Tc5a_PerioInfo() => MeasureDiff("歯周情報", () => ClickMain("imgPCond"), 12);
    [Test, Order(2)] public void Tc5b_TreatInfo() => MeasureDiff("治療情報", () => ClickMain("imgTCond"), 12);
    [Test, Order(3)] public void Tc5c_Hotetsu() => MeasureDiff("補綴管理", () => ClickMain("btnHotetu"), 20);
    [Test, Order(4)] public void Tc5d_Gazou() => MeasureDiff("画像", () => ClickMain("btnGazou"), 20);
    [Test, Order(5)] public void Tc5e_Pcr() => MeasureDiff("PCR", OpenPcr, 20);
    [Test, Order(6)] public void Tc5f_PcrKeys() => MeasurePcrKeys();
    [Test, Order(7)] public void Tc5g_KessonConfirm() => MeasureKessonConfirm();
    [Test, Order(8)] public void Tc5h_HotetsuDateKeys() => MeasureHotetsuDateKeys();
    // frm203047 患者注意情報 (nhóm A còn lại): Ｉ (imgPI) → modal. F9 trống = E00001 nên ESC/End không ghi.
    [Test, Order(10)] public void Tc6a_InpSettings() => MeasureInpSettings();
    [Test, Order(9)] public void Tc5i_PatientNotice() => MeasureModal("患者注意情報", "患者注意情報", openFrom: () => ClickMain("imgPI"), parent: null, withEnter: false);

    /// <summary>
    /// 補綴管理: Enter / Click trên ô ngày, gõ ký tự, Leave với ngày sai (frm203045 txtDt_*).
    /// KHÔNG F9 / ESC / End (= 登録 ghi PATINFO). Đóng bằng F10.
    /// </summary>
    private void MeasureHotetsuDateKeys()
    {
        using var trace = TestTrace.Begin("Tc5h_HotetsuDateKeys");
        const string tag = "補綴日付";
        try
        {
            ClickMain("btnHotetu");
            var win = Waits.TryFor(() => FindModal("補綴管理"), TimeSpan.FromSeconds(15));
            if (win is null) { Log($"=== KQ-C1 [{tag}] === 補綴管理 không mở"); return; }
            Log($"=== KQ-C6 [{tag}] === focus lúc mở: {FocusInfo()}");

            string Titles() => string.Join(" / ", Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible && w.Title.Length > 0).Select(w => w.Title));
            void CloseExtra()
            {
                var pick = Win32Windows.OfProcess(App.ProcessId).LastOrDefault(w => w.Visible && w.Title.Length > 0 && w.Title != "補綴管理" && !w.Title.StartsWith("　診療入力", StringComparison.Ordinal));
                if (pick is not null) { Uia.ForceForeground(pick.Hwnd); Uia.SendKey(Vk.F10); Thread.Sleep(1000); }
            }

            // (a) Enter trên txtDt11 (có 2015/02/06).
            InpP1MenuFlow.Focus(win);
            Uia.SendKey(0x0D);
            Thread.Sleep(1500);
            Log($"=== KQ-C7 [{tag}] === (a) Enter trên ô có ngày → cửa sổ: {Titles()}; focus: {FocusInfo()}");
            CloseExtra();
            win = FindModal("補綴管理") ?? win;

            // (b) Tab sang ô trống kế tiếp rồi Enter.
            InpP1MenuFlow.Focus(win);
            Uia.SendKey(Vk.Tab);
            Thread.Sleep(300);
            var empty = FocusInfo();
            Uia.SendKey(0x0D);
            Thread.Sleep(1500);
            Log($"=== KQ-C7 [{tag}] === (b) ô trống {empty}; sau Enter → cửa sổ: {Titles()}; focus: {FocusInfo()}");
            CloseExtra();
            win = FindModal("補綴管理") ?? win;

            // (c) gõ chữ + số + '/' vào ô trống: ký tự nào lọt vào.
            InpP1MenuFlow.Focus(win);
            Keyboard.Type("ab1/2c3-4");
            Thread.Sleep(400);
            var f = App.Automation.FocusedElement();
            Log($"=== KQ-C7 [{tag}] === (c) gõ 「ab1/2c3-4」 → ô=「{(f is null ? "?" : Txt.N(Uia.ValueOf(f)))}」");

            // (d) ngày sai + rời ô (Tab) ⇒ E00002 「日付」?
            Uia.SendKey(Vk.Tab);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(5));
            Log($"=== KQ-C7 [{tag}] === (d) rời ô với 「1/23」: " + (box is null ? "KHÔNG có hộp thoại" : $"「{box.Text}」 nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]; focus sau: {FocusInfo()}"));
            if (box is not null) { MsgBoxWin32.ClickButton(box.Hwnd, "OK"); Thread.Sleep(500); }

            // (e) 8 chữ số → tự thành yyyy/MM/dd khi rời ô.
            var cur = App.Automation.FocusedElement();
            if (cur is not null)
            {
                Uia.MouseClick(cur);
                Keyboard.TypeSimultaneously(FlaUI.Core.WindowsAPI.VirtualKeyShort.CONTROL, FlaUI.Core.WindowsAPI.VirtualKeyShort.KEY_A);
                Keyboard.Type("20260115");
                Uia.SendKey(Vk.Tab);
                Thread.Sleep(600);
                var prev = Win32Windows.OfProcess(App.ProcessId).Count();
                Log($"=== KQ-C7 [{tag}] === (e) gõ 20260115 + Tab → ô vừa gõ = 「{Txt.N(Uia.ValueOf(cur))}」; hộp thoại: {MsgBoxWin32.TextOfAll(App.ProcessId)}");
            }
        }
        catch (Exception e) { Log($"=== KQ-C1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "OK");
            for (var i = 0; i < 3; i++)
            {
                var top = Win32Windows.OfProcess(App.ProcessId).LastOrDefault(w => w.Visible && w.Title.Length > 0 && !w.Title.StartsWith("　診療入力", StringComparison.Ordinal));
                if (top is null) break;
                Uia.ForceForeground(top.Hwnd);
                Uia.SendKey(Vk.F10);
                Thread.Sleep(1200);
                foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "OK", "はい", "Yes");
            }
        }
    }

    /// <summary>
    /// frm203034 欠損確認: nhập 部位 chứa răng mà SIGA ghi 欠損 (se6 = 4 — SET TRƯỚC khi chạy, xem
    /// run-edit-tooth-info.ps1) ⇒ sau End của 病名選択 app bung dialog này (frm203002.cs:8540).
    /// F9 はい chỉ bỏ ô 欠損 khỏi dòng lưới trong bộ nhớ (không ghi DB nếu không F9 ở 診療入力).
    /// </summary>
    private void MeasureKessonConfirm()
    {
        using var trace = TestTrace.Begin("Tc5g_KessonConfirm");
        const string tag = "欠損確認";
        try
        {
            var flow = new SigaToothFlow(App, Screen);
            var row = flow.InputRow();
            if (row is null) { Log($"=== KQ-C1 [{tag}] === không có dòng nhập"); return; }
            // 病名 thuộc nhóm cần 現存歯 (dis_kbn 41 ダツリ, vd 156 ｲﾝﾚｰﾀﾞﾂﾘC) + 部位 chứa răng 欠損 ⇒ ChkDisMissingTheeth.
            var r = flow.SetBuiOnRow(row, 5, false, 156, trace, beforePick: d =>
            {
                ToothSelectDialog.FocusWindow(d);
                Uia.SendKey(Vk.F4);   // F4 ダツリ・ハソン — thu hẹp danh sách về dis_kbn 41..43
                Thread.Sleep(800);
            });
            Log($"=== KQ-C1 [{tag}] === SetBuiOnRow: 部位選択={r.ToothDialogOpened} 病名選択={r.DiseaseDialogOpened} hộp thoại gặp: {string.Join(" / ", r.Dialogs)}");
            var win = Waits.TryFor(() => FindModal("欠損確認") ?? FindModal("欠損指定"), TimeSpan.FromSeconds(12));
            Log($"=== KQ-C1 [{tag}] === dialog 欠損: {(win is null ? "KHÔNG mở. Cửa sổ: " + string.Join(" / ", Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible).Select(w => w.Title)) : "mở: " + Uia.NameOf(win))}");
            if (win is null) return;
            Log($"=== KQ-C6 [{tag}] === focus lúc MỞ: {FocusInfo()}");
            FKeys(win, tag);
            Controls(win, tag, "c-kesson");
            trace.Shot("mo");
            TabOrder(tag, 6);
            // Enter / ESC: BaseDialog2 — ESC và End = F9 はい.
            foreach (var (name, vk) in new[] { ("Enter", (ushort)0x0D), ("Escape", Vk.Escape) })
            {
                if (FindModal("欠損確認") is null && FindModal("欠損指定") is null) break;
                var w = FindModal("欠損確認") ?? FindModal("欠損指定")!;
                InpP1MenuFlow.Focus(w);
                Uia.SendKey(vk);
                Thread.Sleep(1500);
                var box = MsgBoxWin32.First(App.ProcessId);
                var gone = FindModal("欠損確認") is null && FindModal("欠損指定") is null;
                Log($"=== KQ-C7 [{tag}] === {name}: dialog {(gone ? "ĐÃ ĐÓNG" : "còn")}, hộp thoại={(box is null ? "không" : box.Text)}; ô 部位 của dòng nhập sau đó: {string.Join(" // ", flow.DescribeGrid(8))}");
                if (box is not null) MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "OK");
            }
        }
        catch (Exception e) { Log($"=== KQ-C1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "OK");
            for (var i = 0; i < 3; i++)
            {
                var top = Win32Windows.OfProcess(App.ProcessId).LastOrDefault(w => w.Visible && w.Title.Length > 0 && !w.Title.StartsWith("　診療入力", StringComparison.Ordinal));
                if (top is null) break;
                Uia.ForceForeground(top.Hwnd);
                Uia.SendKey(Vk.F10);
                Thread.Sleep(1200);
            }
        }
    }

    /// <summary>F6 → カルテ記載選択 → F3 → ＰＣＲ. Dừng sau khi PCR mở; đóng cả hai bằng F10.</summary>
    private void OpenPcr()
    {
        InpP1MenuFlow.Focus(Screen.Window);
        Uia.SendKey(Vk.F6);
        var karte = Waits.TryFor(() => FindModal("カルテ記載選択"), TimeSpan.FromSeconds(15));
        Log($"=== KQ-C1 [PCR] === カルテ記載選択: {(karte is null ? "KHÔNG mở" : "mở")}");
        if (karte is null) return;
        InpP1MenuFlow.Focus(karte);
        Uia.SendKey(Vk.F3);
    }

    /// <summary>ＰＣＲ: điểm プラークスコア sau F2/F3/F8, F1 (Q00002 → Cancel), rồi End (= F9 確定?).</summary>
    private void MeasurePcrKeys()
    {
        using var trace = TestTrace.Begin("Tc5f_PcrKeys");
        const string tag = "PCR-keys";
        try
        {
            OpenPcr();
            var pcr = Waits.TryFor(() => FindModal("ＰＣＲ"), TimeSpan.FromSeconds(15));
            if (pcr is null) { Log($"=== KQ-C1 [{tag}] === PCR không mở"); return; }
            string Score() { var l = Find(pcr, "lblPercent"); return l is null ? "(không có lblPercent)" : Txt.N(Uia.NameOf(l)); }
            Log($"=== KQ-C7 [{tag}] === điểm lúc mở = {Score()}");
            foreach (var (name, vk) in new[] { ("F2 反転", Vk.F2), ("F8 クリア", Vk.F8), ("F3 隣接面", Vk.F3), ("F2 反転", Vk.F2), ("F8 クリア", Vk.F8) })
            {
                InpP1MenuFlow.Focus(pcr);
                Uia.SendKey(vk);
                Thread.Sleep(900);
                var box = MsgBoxWin32.First(App.ProcessId);
                Log($"=== KQ-C7 [{tag}] === {name} → điểm = {Score()}" + (box is null ? "" : $"; hộp thoại 「{box.Text}」"));
                if (box is not null) MsgBoxWin32.ClickButton(box.Hwnd, "OK");
            }
            InpP1MenuFlow.Focus(pcr);
            Uia.SendKey(Vk.F1);
            var q = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
            Log($"=== KQ-C7 [{tag}] === F1 → " + (q is null ? "KHÔNG có hộp thoại" : $"「{q.Text}」 nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(q.Hwnd))}]"));
            if (q is not null) MsgBoxWin32.ClickButton(q.Hwnd, "Cancel", "キャンセル");   // KHÔNG OK: OK ghi PCR_DEF
            Thread.Sleep(600);

            InpP1MenuFlow.Focus(pcr);
            Uia.SendKey(Vk.End);
            Thread.Sleep(1500);
            var box2 = MsgBoxWin32.First(App.ProcessId);
            Log($"=== KQ-C7 [{tag}] === End → PCR {(FindModal("ＰＣＲ") is null ? "ĐÃ ĐÓNG" : "còn")}, カルテ記載選択 {(FindModal("カルテ記載選択") is null ? "đã đóng" : "còn")}, hộp thoại={(box2 is null ? "không" : box2.Text)}");
            if (box2 is not null) MsgBoxWin32.ClickButton(box2.Hwnd, "Cancel", "OK");
        }
        catch (Exception e) { Log($"=== KQ-C1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "OK");
            for (var i = 0; i < 3; i++)
            {
                var top = Win32Windows.OfProcess(App.ProcessId).LastOrDefault(w => w.Visible && w.Title.Length > 0 && !w.Title.StartsWith("　診療入力", StringComparison.Ordinal));
                if (top is null) break;
                Uia.ForceForeground(top.Hwnd);
                Uia.SendKey(Vk.F10);
                Thread.Sleep(1200);
            }
        }
    }

    /// <summary>
    /// frm203003 処置入力設定 (F11 → 9 → 2). F9 / ESC / End GHI Ocha.xml NGAY, không hỏi lại ⇒ probe này chỉ
    /// chạy khi đã sao lưu Ocha.xml (xem run-edit-tooth-info.ps1 / ghi chú); các nút リセット luôn Cancel.
    /// </summary>
    private void MeasureInpSettings()
    {
        using var trace = TestTrace.Begin("Tc6a_InpSettings");
        const string tag = "診療入力設定";
        try
        {
            InpP1MenuFlow.OpenMenuByF11(App, Screen.Window, trace);
            Thread.Sleep(500);
            Uia.SendKey(Vk.D9);
            Thread.Sleep(500);
            Uia.SendKey(0x32);
            var win = Waits.TryFor(() => FindModal("診療入力設定"), TimeSpan.FromSeconds(15));
            if (win is null) { Log($"=== KQ-S1 [{tag}] === không mở. Cửa sổ: {string.Join(" / ", Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible).Select(w => w.Title))}"); return; }
            Thread.Sleep(800);
            Log($"=== KQ-S1 [{tag}] === tiêu đề=「{Uia.NameOf(win)}」");
            Log($"=== KQ-S6 [{tag}] === focus lúc MỞ: {FocusInfo()}");
            FKeys(win, tag);

            // Mỗi tab: chọn tab (chuột thật) rồi liệt kê checkbox / combo / nút.
            var tabs = Uia.Descendants(win, 8).Where(e => Uia.ControlTypeOf(e) == FlaUI.Core.Definitions.ControlType.TabItem).ToList();
            Log($"=== KQ-S2 [{tag}] === {tabs.Count} tab: {string.Join(" | ", tabs.Select(t => Txt.N(Uia.NameOf(t))))}");
            var seen = new HashSet<string>();
            foreach (var t in tabs)
            {
                var name = Txt.N(Uia.NameOf(t));
                var (x, y) = Uia.Center(t);
                Uia.LeftClickPhysical(x, y);
                Thread.Sleep(600);
                Log($"=== KQ-S2 [{tag}] === ── tab 「{name}」");
                foreach (var e in Uia.Descendants(win, 10))
                {
                    var id = Uia.AutomationIdOf(e);
                    if (id.Length == 0 || !(id.StartsWith("chk") || id.StartsWith("cbo") || id.StartsWith("btn") || id.StartsWith("rdo") || id.StartsWith("txt"))) continue;
                    if (id.StartsWith("btnF") || !Uia.IsOnScreen(e) || !seen.Add($"{name}|{id}")) continue;
                    var toggle = "";
                    try { toggle = e.Patterns.Toggle.PatternOrDefault?.ToggleState.ValueOrDefault.ToString() ?? ""; } catch { }
                    var line = $"{id} [{Uia.ControlTypeOf(e)}] 「{Txt.N(Uia.NameOf(e))}」 value=「{Txt.N(Uia.ValueOf(e))}」 toggle={toggle} enabled={SafeEnabled(e)}";
                    if (id.StartsWith("cbo"))
                    {
                        try { var cb = e.AsComboBox(); var items = cb.Items.Select(i => Txt.N(i.Text)).ToList(); cb.Collapse(); line += $" items=[{string.Join(" | ", items)}]"; }
                        catch { line += " items=?"; }
                    }
                    Log($"=== KQ-S2 [{tag}] ===   {line}");
                }
            }

            // Loại trừ nhau: tick 過去データを表示する ⇒ 過去データ１画面表示 bỏ tick (và ngược lại).
            void ClickCheck(string id)
            {
                var c = Find(win, id);
                if (c is null) return;
                var (cx, cy) = Uia.Center(c);
                Uia.LeftClickPhysical(cx, cy);
                Thread.Sleep(300);
            }
            string State(string id) { var c = Find(win, id); try { return c?.Patterns.Toggle.PatternOrDefault?.ToggleState.ValueOrDefault.ToString() ?? "?"; } catch { return "?"; } }
            foreach (var tabName in new[] { "入力形態・動作1", "表示設定" })
            {
                var tb = tabs.FirstOrDefault(t => Txt.N(Uia.NameOf(t)) == tabName);
                if (tb is null) continue;
                var (tx, ty) = Uia.Center(tb); Uia.LeftClickPhysical(tx, ty); Thread.Sleep(500);
            }
            Log($"=== KQ-S7 [{tag}] === trước: chkFirstDispMode={State("chkFirstDispMode")} chkOldDataSingleDsp={State("chkOldDataSingleDsp")}");

            // Nút リセット → hộp xác nhận (luôn Cancel).
            foreach (var tb in tabs.Where(t => Txt.N(Uia.NameOf(t)).Contains("学習")))
            {
                var (tx, ty) = Uia.Center(tb); Uia.LeftClickPhysical(tx, ty); Thread.Sleep(500);
            }
            var reset = Find(win, "btnResetIntelliAll");
            if (reset is not null)
            {
                var (rx, ry) = Uia.Center(reset);
                Uia.LeftClickPhysical(rx, ry);
                var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
                Log($"=== KQ-S8 [{tag}] === 全て(リセット) → " + (box is null ? "KHÔNG có hộp thoại" : $"「{box.Text}」 (tiêu đề 「{box.Title}」) nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]"));
                if (box is not null) MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "キャンセル");
                Thread.Sleep(500);
            }

            TabOrder(tag, 20);
            // ESC / End = F9 登録 ⇒ ghi Ocha.xml rồi đóng (không hỏi).
            InpP1MenuFlow.Focus(win);
            Uia.SendKey(Vk.Escape);
            Thread.Sleep(1500);
            var gone = FindModal("診療入力設定") is null;
            Log($"=== KQ-S7 [{tag}] === Escape → form {(gone ? "ĐÃ ĐÓNG" : "còn")}; hộp thoại={MsgBoxWin32.TextOfAll(App.ProcessId)}");
        }
        catch (Exception e) { Log($"=== KQ-S1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "OK");
            for (var i = 0; i < 3; i++)
            {
                var top = Win32Windows.OfProcess(App.ProcessId).LastOrDefault(w => w.Visible && w.Title.Length > 0 && !w.Title.StartsWith("　診療入力", StringComparison.Ordinal));
                if (top is null) break;
                Uia.ForceForeground(top.Hwnd);
                Uia.SendKey(Vk.F10);
                Thread.Sleep(1200);
            }
        }
    }

    private static readonly string[] Ignored = ["Minimize", "Maximize", "Close"];

    private void MeasureDiff(string tag, Action open, int tabs)
    {
        using var trace = TestTrace.Begin($"Tc5_{tag}");
        string? title = null;
        try
        {
            var before = Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible).Select(w => w.Title).ToHashSet();
            open();
            Thread.Sleep(4000);
            var all = Win32Windows.OfProcess(App.ProcessId).Where(w => w.Visible && w.Title.Length > 0).Select(w => w.Title).ToList();
            Log($"=== KQ-C1 [{tag}] === cửa sổ sau khi mở: {string.Join(" / ", all)} (trước: {string.Join(" / ", before)})");
            // PCR đứng sau カルテ記載選択: cửa sổ mới nhất là cái cần đo.
            title = all.LastOrDefault(t => !before.Contains(t) && t != "カルテ記載選択") ?? all.FirstOrDefault(t => !before.Contains(t));
            if (title is null) { Log($"=== KQ-C1 [{tag}] === không có cửa sổ mới (nút ẩn / không mở)"); return; }
            // Hộp thoại đi kèm lúc mở (vd 画像: báo thiếu thư mục) — đọc rồi bấm OK để đo được form phía sau.
            foreach (var m in MsgBoxWin32.All(App.ProcessId))
            {
                Log($"=== KQ-C1 [{tag}] === hộp thoại lúc mở: 「{m.Text}」 nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(m.Hwnd))}]");
                MsgBoxWin32.ClickButton(m.Hwnd, "OK");
            }
            Thread.Sleep(800);
            var win = FindModal(title);
            if (win is null) { Log($"=== KQ-C1 [{tag}] === không FromHandle được 「{title}」"); return; }

            Log($"=== KQ-C1 [{tag}] === tiêu đề=「{Uia.NameOf(win)}」");
            Log($"=== KQ-C6 [{tag}] === focus lúc MỞ: {FocusInfo()}");
            FKeys(win, tag);
            Controls(win, tag, $"c-{tag}");
            trace.Shot("mo");
            TabOrder(tag, tabs);
            Keys(win, tag, trace);
            F8(win, tag, trace);
        }
        catch (Exception e) { Log($"=== KQ-C1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}"); }
        finally
        {
            try
            {
                foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "いいえ", "No", "OK");
                for (var i = 0; i < 4; i++)
                {
                    var top = Win32Windows.OfProcess(App.ProcessId).LastOrDefault(w => w.Visible && w.Title.Length > 0 && !w.Title.StartsWith("　診療入力", StringComparison.Ordinal));
                    if (top is null) break;
                    Uia.ForceForeground(top.Hwnd);
                    Uia.SendKey(Vk.F10);
                    Thread.Sleep(1200);
                    foreach (var m in MsgBoxWin32.All(App.ProcessId)) MsgBoxWin32.ClickButton(m.Hwnd, "OK", "はい", "Yes");
                    Thread.Sleep(500);
                }
            }
            catch (Exception e) { Log($"=== KQ-C1 [{tag}] === không đóng được: {e.Message}"); }
        }
    }
}
