using System.Text;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.InpP1Dialogs;
using OchaCom.FlaUiTests.Tests.ParitySnapshot;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.MasterAutoLists;

/// <summary>
/// <b>PROBE — nhóm A: ba màn 一覧 master mở từ menu F11 「９ オプション」 của 診療入力 và
/// dialog 日付変更. KHÔNG assert, không bao giờ ném.</b>
///
/// <code>
///  frm203036 必要病名一覧     (IDM_RestrictDis)  → F9 → frm203037 必要病名登録
///  frm203038 自動算定一覧     (IDM_CHKAUTO)      → F9 → frm203039 自動算定登録
///  frm203040 処置自動入力一覧 (IDM_Auto)         → F9/F1 → frm203041 処置自動入力登録
///  frm203051 日付変更        (IDM_DateChg: chuột phải cột 日 của lưới 処置)
///
///  KQ-1  tiêu đề, nhãn/bật-tắt F1..F12, ô 検索, nhãn cột, số dòng khi vừa mở
///  KQ-2  F9 trên dòng đầu: dialog đăng ký nào mở, nhãn F-key của nó
///  KQ-3  検索 không ra gì → hộp thoại gì (E00003?), F9 trên lưới rỗng
///  KQ-4  F1 của từng màn (追加 / 出力 → Q00047)
///  KQ-5  日付変更: 日 hiện tại, F9 để trống / ngày không tồn tại / ngày hợp lệ
/// </code>
///
/// <para>Không bấm F9 của dialog đăng ký, không chọn はい ở Q00100 ⇒ <b>không ghi DB</b>.
/// Đóng mọi dialog bằng F10 (ESC = F9 = GHI, xem <see cref="Vk.Escape"/>).</para>
///
/// <para>Chạy: <c>.\run-edit-master-auto-lists.ps1 -Diagnostics</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("master-auto-lists")]
public sealed class MasterAutoListsProbeTests : UiTestBase
{
    protected override string[] NuisanceDialogPatterns => [];

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    internal static readonly InpP1MenuFlow.OptionItem RestrictDis =
        new("IDM_RestrictDis", "必要病名登録", "frm203036", "必要病名一覧", "");

    internal static readonly InpP1MenuFlow.OptionItem ChkAuto =
        new("IDM_CHKAUTO", "自動算定登録", "frm203038", "自動算定一覧", "");

    internal static readonly InpP1MenuFlow.OptionItem TrtAuto =
        new("IDM_Auto", "処置自動入力登録", "frm203040", "処置自動入力一覧", "");

    [Test, Order(1)] public void Tc0a_RestrictDis() => MeasureList(RestrictDis, "必要病名", Vk.D3, "frm203037");
    [Test, Order(2)] public void Tc0b_ChkAuto() => MeasureList(ChkAuto, "自動算定", Vk.D4, "frm203039");
    [Test, Order(3)] public void Tc0c_TrtAuto() => MeasureList(TrtAuto, "処置自動入力", Vk.D5, "frm203041");
    [Test, Order(4)] public void Tc0d_DateChange() => MeasureDateChange();

    /// <summary>Probe NGẮN: chỉ đo cách nhận ra dialog modal frm203037 (UIA vs Win32).</summary>
    [Test, Order(9)]
    public void Tc0z_ModalDetection()
    {
        using var trace = TestTrace.Begin("Tc0z_ModalDetection");
        var win = OpenList(RestrictDis, Vk.D3, trace);
        try
        {
            var grid = Find(win, "dgvView")!;
            var first = DataRows(grid, 1).First();
            var cell = FirstChildren(first, 3).First(c => Uia.IsOnScreen(c));
            var (cx, cy) = Uia.Center(cell);
            Uia.LeftClickPhysical(cx, cy);
            Waits.Step();
            InpP1MenuFlow.Focus(win);
            Uia.SendKey(Vk.F9);
            Thread.Sleep(4000);
            trace.Shot("sau-f9");

            var w32 = Win32Windows.OfProcess(App.ProcessId).FirstOrDefault(i => i.Visible && i.Title.Contains("必要病名登録"));
            Log($"=== KQ-Z === Win32 thấy dialog: {(w32 is null ? "KHÔNG" : $"hwnd={w32.Hwnd} class={w32.Class}")}");
            if (w32 is null) return;

            var sw = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                var el = App.Automation.FromHandle(w32.Hwnd);
                Log($"=== KQ-Z === FromHandle OK sau {sw.ElapsedMilliseconds}ms: id=「{Uia.AutomationIdOf(el)}」 name=「{Uia.NameOf(el)}」 type={Uia.ControlTypeOf(el)}");
                var kids = Uia.Children(el).Take(8).Select(c => $"{Uia.ControlTypeOf(c)}:{Uia.AutomationIdOf(c)}:{Txt.N(Uia.NameOf(c))}");
                Log("=== KQ-Z === con trực tiếp: " + string.Join(" | ", kids));
            }
            catch (Exception e) { Log($"=== KQ-Z === FromHandle NGOẠI LỆ sau {sw.ElapsedMilliseconds}ms: {e.GetType().Name}: {e.Message}"); }

            // Đường khác: tìm theo desktop + tên.
            try
            {
                var d = OchaApp.SharedAutomation.GetDesktop().FindFirstChild(cf => cf.ByName("必要病名登録"));
                Log($"=== KQ-Z === desktop.FindFirstChild(ByName) = {(d is null ? "null" : $"id={Uia.AutomationIdOf(d)}")}");
            }
            catch (Exception e) { Log($"=== KQ-Z === desktop.FindFirstChild NGOẠI LỆ: {e.Message}"); }

            Uia.SendKey(Vk.F10);   // đóng dialog đăng ký (戻る), KHÔNG F9/ESC
            Thread.Sleep(1500);
        }
        finally
        {
            try { InpP1MenuFlow.Focus(win); Uia.SendKey(Vk.F10); Thread.Sleep(1500); } catch { /* */ }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3 màn 一覧
    // ═════════════════════════════════════════════════════════════════════════

    private void MeasureList(InpP1MenuFlow.OptionItem item, string tag, ushort mnemonic, string registerId)
    {
        using var trace = TestTrace.Begin($"Tc0_{item.DialogId}");

        Window win;
        try
        {
            win = OpenList(item, mnemonic, trace);
        }
        catch (Exception e)
        {
            Log($"=== KQ-1 [{tag}] === KHÔNG MỞ ĐƯỢC {item.DialogId}: {e.Message}");
            return;
        }

        try
        {
            ReadScreen(win, tag, item.DialogId);

            // KQ-2: F9 trên dòng đầu (nếu có dòng).
            if (!OpenRegisterFromFirstRow(win, tag, registerId, trace))
            {
                // Dialog đăng ký còn mở và ta chưa nhận ra nó: đóng bằng F10 (không ESC/F9) rồi dừng,
                // đừng gõ tiếp vào đó như lần chạy 2026-10-13 11:03 (gõ nhầm 999 vào 病名コード 1).
                InpP1MenuFlow.Focus(win);
                Uia.SendKey(Vk.F10);
                Waits.Step();
                return;
            }

            // KQ-4: F1.
            MeasureF1(win, tag, registerId, trace);

            // KQ-7: ESC / End trên màn 一覧 (BaseForm ánh xạ chúng tới F9/F10?). Làm TRƯỚC 検索 rỗng.
            MeasureEscEnd(win, tag, registerId, trace);

            // KQ-3: 検索 không ra gì. Làm SAU F9/F1 vì nó làm rỗng lưới.
            MeasureEmptySearch(win, tag, trace);
        }
        catch (Exception e)
        {
            Log($"=== KQ-1 [{tag}] === NGOẠI LỆ: {e.GetType().Name}: {e.Message}");
        }
        finally
        {
            try
            {
                // Dẹp hộp thoại còn sót TRƯỚC khi gửi F10 (phím vào MessageBox modal không tới form).
                foreach (var m in MsgBoxWin32.All(App.ProcessId))
                {
                    Log($"=== KQ-1 [{tag}] === dẹp hộp thoại còn sót: {m}");
                    MsgBoxWin32.ClickButton(m.Hwnd, "Cancel", "キャンセル", "いいえ", "No", "OK");
                }
                InpP1MenuFlow.CloseByBack(App, win, item.DialogId, trace);
            }
            catch (Exception e) { Log($"=== KQ-1 [{tag}] === không đóng được bằng F10: {e.Message}"); }
        }
    }

    /// <summary>
    /// F11 → phím 「9」 (mở submenu オプション) → phím 「3/4/5」 (mục con). Nhãn menu là
    /// 「&amp;9 オプション」, 「&amp;3 必要病名登録」… nên mnemonic chạy mục đó thẳng, không phụ
    /// thuộc toạ độ chuột. Click chuột vào 「オプション」 rồi mũi tên phải làm menu ĐÓNG
    /// (đo 2026-10-13), nên đường chuột của <c>InpP1MenuFlow.Open</c> không dùng ở đây.
    /// </summary>
    private Window OpenList(InpP1MenuFlow.OptionItem item, ushort mnemonic, TestTrace trace)
    {
        var already = App.Window(item.DialogId);
        if (already is not null) return already;

        trace.Step($"F11 → 9 オプション → 「{item.MenuItemText}」 (phím tắt)");
        InpP1MenuFlow.OpenMenuByF11(App, Screen.Window, trace);
        Thread.Sleep(500);
        Uia.SendKey(Vk.D9);
        Thread.Sleep(500);
        trace.Shot("submenu-sau-phim-9");
        Uia.SendKey(mnemonic);

        return Waits.For(() => App.Window(item.DialogId),
                         $"{item.DialogId} hiện ra sau phím tắt menu", TimeSpan.FromSeconds(15));
    }

    private void ReadScreen(Window win, string tag, string id)
    {
        Log($"=== KQ-6 [{tag}] === focus lúc MỞ 一覧: {FocusInfo()}");
        TabOrder("KQ-6", tag, 6);
        Log($"=== KQ-6 [{tag}] === (sau 6 Tab) — quay lại ô đầu bằng Shift+Tab không đo, chỉ ghi thứ tự");
        Log($"=== KQ-1 [{tag}] === {id}: tiêu đề cửa sổ=「{Uia.NameOf(win)}」");

        for (var i = 1; i <= 12; i++)
        {
            var b = Find(win, $"btnF{i}");
            if (b is null) { Log($"=== KQ-1 [{tag}] === btnF{i}: KHÔNG CÓ control"); continue; }
            var enabled = SafeEnabled(b);
            var shown = Uia.IsOnScreen(b);
            var name = Txt.N(Uia.NameOf(b));
            if (name.Length == 0 && !enabled) continue; // F-key tắt (OCHA_OFF) — không in cho đỡ rối
            Log($"=== KQ-1 [{tag}] === btnF{i}: 「{name}」 enabled={enabled} onScreen={shown}");
        }

        foreach (var cid in new[] { "txtTrtCd", "txtTrtNm", "lblTrtCd", "lblTrtNm", "btnSearch", "lblCount", "lblCntTitle", "lblCntTani" })
        {
            var e = Find(win, cid);
            Log(e is null
                ? $"=== KQ-1 [{tag}] === {cid}: KHÔNG CÓ"
                : $"=== KQ-1 [{tag}] === {cid}: name=「{Txt.N(Uia.NameOf(e))}」 value=「{Txt.N(Uia.ValueOf(e))}」");
        }

        var grid = Find(win, "dgvView");
        if (grid is null) { Log($"=== KQ-1 [{tag}] === dgvView: KHÔNG CÓ"); return; }

        var headers = HeaderNames(grid);
        Log($"=== KQ-1 [{tag}] === {headers.Count} nhãn cột đang HIỂN THỊ: " +
            string.Join(" | ", headers.Select(h => $"「{h}」")));

        var rows = DataRows(grid, 6);
        Log($"=== KQ-1 [{tag}] === {rows.Count} dòng đầu đọc được từ UIA (lblCount=「{Txt.N(Uia.NameOf(Find(win, "lblCount")!))}」)");
        foreach (var r in rows)
            Log($"=== KQ-1 [{tag}] ===   " + string.Join(" | ", FirstChildren(r, 12).Select(c => Txt.N(Uia.ValueOf(c)))));

        InpP1MenuFlow.WriteArtifact($"master-{id}.uia.txt", DumpSkippingGrid(win, 5));
    }

    private bool OpenRegisterFromFirstRow(Window win, string tag, string registerId, TestTrace trace)
    {
        var grid = Find(win, "dgvView");
        var first = grid is null ? null : DataRows(grid, 1).FirstOrDefault();
        if (first is null) { Log($"=== KQ-2 [{tag}] === BỎ QUA: lưới rỗng, không có dòng để F9"); return true; }

        var cells = FirstChildren(first, 6);
        var cell = cells.FirstOrDefault(c => Uia.IsOnScreen(c));
        if (cell is null) { Log($"=== KQ-2 [{tag}] === BỎ QUA: dòng đầu không có ô nào trên màn hình"); return true; }

        trace.Step($"[{tag}] click dòng đầu rồi F9 選択");
        var (cx, cy) = Uia.Center(cell);
        Uia.LeftClickPhysical(cx, cy);          // chuột thật; cell.Click() của FlaUI chậm trên lưới 1699 dòng
        Waits.Step();
        InpP1MenuFlow.Focus(win);
        Uia.SendKey(Vk.F9);
        var f9At = DateTime.UtcNow;
        Thread.Sleep(3000);
        trace.Shot("sau-f9-3s");

        // Dialog đăng ký là modal: UIA có thể phơi nó như cửa sổ con của lưới 一覧 chứ không phải
        // top-level của app, nên dò theo id VÀ theo tiêu đề ở cả ba nơi.
        var title = RegisterTitles[registerId];
        var dlg = Waits.TryFor(() => FindDialog(win, registerId, title), TimeSpan.FromSeconds(12));
        Log($"=== KQ-2 [{tag}] === dialog {registerId} 「{title}」 " +
            (dlg is null ? "KHÔNG nhận ra sau 15s" : $"nhận ra sau {(DateTime.UtcNow - f9At).TotalSeconds:0.0}s") +
            (MsgBoxWin32.TextOfAll(App.ProcessId) is { Length: > 0 } mb ? $"; MessageBox: {mb}" : ""));
        if (dlg is null)
        {
            trace.Shot("khong-thay-dialog");
            InpP1MenuFlow.WriteArtifact($"master-{registerId}-windows.txt",
                InpP1MenuFlow.DumpAllTopLevelWindows(App) + "\n== app top-level ==\n" +
                string.Join("\n", SafeTopLevel().Select(w => $"id='{Uia.AutomationIdOf(w)}' name='{Uia.NameOf(w)}' onScreen={Uia.IsOnScreen(w)}")) +
                "\n== Win32 EnumWindows ==\n" +
                string.Join("\n", Win32Windows.OfProcess(App.ProcessId).Select(i => $"hwnd={i.Hwnd} class='{i.Class}' title='{i.Title}' visible={i.Visible}")) +
                "\n== children Window of 一覧 ==\n" +
                string.Join("\n", SafeChildWindows(win).Select(w => $"id='{Uia.AutomationIdOf(w)}' name='{Uia.NameOf(w)}' onScreen={Uia.IsOnScreen(w)}")));
            return false;
        }

        var did = Uia.AutomationIdOf(dlg);
        Log($"=== KQ-2 [{tag}] === F9 mở dialog id=「{did}」 tiêu đề=「{Txt.N(Uia.NameOf(dlg))}」");
        trace.Shot($"{did}-mo");
        Log($"=== KQ-6 [{tag}] === focus lúc MỞ {did}: {FocusInfo()}");
        TabOrder("KQ-6", tag, 6);
        for (var i = 1; i <= 12; i++)
        {
            var b = Find(dlg, $"btnF{i}");
            if (b is null) continue;
            var name = Txt.N(Uia.NameOf(b));
            if (name.Length == 0 && !SafeEnabled(b)) continue;
            Log($"=== KQ-2 [{tag}] ===   {did}.btnF{i}: 「{name}」 enabled={SafeEnabled(b)}");
        }
        foreach (var e in Uia.Descendants(dlg, 6))
        {
            var eid = Uia.AutomationIdOf(e);
            if (eid.Length == 0 || eid.StartsWith("btnF", StringComparison.Ordinal)) continue;
            var t = Uia.ControlTypeOf(e)?.ToString() ?? "?";
            if (t is "Pane" or "Group" or "Custom") continue;
            Log($"=== KQ-2 [{tag}] ===   {did}.{eid} [{t}] name=「{Txt.N(Uia.NameOf(e))}」 value=「{Txt.N(Uia.ValueOf(e))}」");
        }
        InpP1MenuFlow.WriteArtifact($"master-{did}.uia.txt", Uia.DumpTree(dlg, maxDepth: 6, maxChildrenPerNode: 60));

        MeasureDialogKeys(dlg, tag, did, trace);

        // Đóng bằng F10 — KHÔNG ESC/End/F9 (= 確定 = ghi).
        InpP1MenuFlow.CloseByBack(App, dlg, did, trace);
        Log($"=== KQ-2 [{tag}] === đã F10 đóng {did}; lưới 一覧 còn: {Uia.IsOnScreen(win)}");
        return true;
    }

    /// <summary>
    /// KQ-8: F9 / ESC / End / F8 BÊN TRONG dialog đăng ký. Cả bốn phím đều đi qua hộp xác nhận
    /// OK/Cancel (Q00002 / Q00003) TRƯỚC khi ghi hoặc xoá (frm203037.cs:106-131,
    /// frm203039.cs:106-131, frm203041.cs:113-132) — nên luôn bấm Cancel thì không ghi gì.
    /// Hộp lỗi E0000x (validate) chỉ có nút OK: bấm OK. Hộp nào lạ (có Yes/No) → bấm Cancel/No.
    /// </summary>
    private void MeasureDialogKeys(Window dlg, string tag, string did, TestTrace trace)
    {
        foreach (var (name, vk) in new[] { ("F9", Vk.F9), ("Escape", Vk.Escape), ("End", Vk.End), ("F8", Vk.F8) })
        {
            trace.Step($"[{tag}] {did}: phím {name} (xác nhận sẽ bị Cancel)");
            InpP1MenuFlow.Focus(dlg);
            Uia.SendKey(vk);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
            if (box is null)
            {
                var gone = FindDialog(dlg, did, RegisterTitles[did]) is null;
                Log($"=== KQ-8 [{tag}] === {did} phím {name}: KHÔNG có hộp thoại; dialog {(gone ? "ĐÃ ĐÓNG" : "còn mở")}");
                if (gone) return;
                continue;
            }
            var caps = MsgBoxWin32.ButtonCaptions(box.Hwnd);
            Log($"=== KQ-8 [{tag}] === {did} phím {name}: hộp thoại 「{box.Text}」 nút=[{string.Join(", ", caps)}]");
            trace.Shot($"{did}-{name}-hop");
            var ok = MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "キャンセル", "いいえ", "No");
            if (!ok) ok = MsgBoxWin32.ClickButton(box.Hwnd, "OK");   // hộp lỗi chỉ có OK
            Thread.Sleep(800);
        }
    }

    private static readonly Dictionary<string, string> RegisterTitles = new()
    {
        ["frm203037"] = "必要病名登録",
        ["frm203039"] = "自動算定登録",
        ["frm203041"] = "処置自動入力登録",
        ["frm203051"] = "日付変更",
    };

    /// <summary>
    /// Nhận ra dialog modal. Win32 TRƯỚC: khi modal đang mở, <c>GetAllTopLevelWindows</c> /
    /// <c>ModalWindows</c> của FlaUI vừa trả rỗng vừa chậm hàng chục giây (đo 2026-10-13), còn
    /// <c>EnumWindows</c> + <c>FromHandle</c> mất ~10ms.
    /// </summary>
    private Window? FindDialog(Window owner, string id, string title)
    {
        var w32 = Win32Windows.OfProcess(App.ProcessId)
            .FirstOrDefault(i => i.Visible && i.Title.Contains(title, StringComparison.Ordinal));
        if (w32 is null) return null;
        try { return App.Automation.FromHandle(w32.Hwnd).AsWindow(); }
        catch { return null; }
    }

    private IEnumerable<Window> SafeTopLevel()
    {
        try { return App.Application.GetAllTopLevelWindows(App.Automation); } catch { return []; }
    }

    private static IEnumerable<Window> SafeChildWindows(Window owner)
    {
        try { return owner.FindAllChildren(cf => cf.ByControlType(FlaUI.Core.Definitions.ControlType.Window)).Select(e => e.AsWindow()); }
        catch { return []; }
    }

    private void MeasureF1(Window win, string tag, string id, TestTrace trace)
    {
        var f1 = Find(win, "btnF1");
        if (f1 is null || !SafeEnabled(f1) || Txt.N(Uia.NameOf(f1)).Length == 0)
        {
            Log($"=== KQ-4 [{tag}] === F1 TẮT/không có nhãn — bỏ qua");
            return;
        }

        trace.Step($"[{tag}] F1 「{Txt.N(Uia.NameOf(f1))}」");
        ActivateList(win);
        Uia.SendKey(Vk.F1);

        // 処置自動入力一覧: F1 追加 mở dialog đăng ký. 必要病名一覧: F1 出力 hỏi Q00047 (OK/Cancel).
        var viaKey = Waits.TryUntil(() => FindDialog(win, id, RegisterTitles[id]) is not null || MsgBoxWin32.First(App.ProcessId) is not null,
                                    TimeSpan.FromSeconds(4));
        if (!viaKey)
        {
            Log($"=== KQ-4 [{tag}] === phím F1 KHÔNG có tác dụng trong 4s ⇒ thử click chuột thật lên nút F1");
            var (bx, by) = Uia.Center(f1);
            Uia.LeftClickPhysical(bx, by);
            Thread.Sleep(1500);
        }
        else Log($"=== KQ-4 [{tag}] === phím F1 có tác dụng");
        var dlg = Waits.TryFor(() => FindDialog(win, id, RegisterTitles[id]), TimeSpan.FromSeconds(6));
        if (dlg is not null)
        {
            var did = Uia.AutomationIdOf(dlg);
            Log($"=== KQ-4 [{tag}] === F1 mở dialog 「{did}」 tiêu đề=「{Txt.N(Uia.NameOf(dlg))}」");
            trace.Shot($"{did}-f1");
            foreach (var cid in new[] { "txtSeq", "txtLimitCnt", "cboJiki", "btnF8", "btnF9" })
            {
                var e = Find(dlg, cid);
                if (e is not null)
                    Log($"=== KQ-4 [{tag}] ===   {cid}: name=「{Txt.N(Uia.NameOf(e))}」 value=「{Txt.N(Uia.ValueOf(e))}」 enabled={SafeEnabled(e)}");
            }
            InpP1MenuFlow.CloseByBack(App, dlg, did, trace);
            return;
        }

        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
        if (box is null) { Log($"=== KQ-4 [{tag}] === F1 không mở dialog cũng không có hộp thoại"); return; }

        Log($"=== KQ-4 [{tag}] === F1 hiện hộp thoại: {box} nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]");
        trace.Shot("f1-msgbox");
        // Cancel — KHÔNG bấm OK: OK mở hộp thoại lưu file CSV.
        var ok = MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "キャンセル");
        Log($"=== KQ-4 [{tag}] === bấm Cancel: {ok}");
        Waits.Step();
    }

    /// <summary>
    /// Đưa 一覧 về trạng thái người dùng thật có: click chuột thật vào ô đầu của lưới. Sau khi
    /// dialog đăng ký đóng, phím F1/ESC/End KHÔNG tới form cho tới khi có một cú click (đo
    /// 2026-10-13: F1 im lặng, ESC/End inert) — bỏ bước này thì KQ-4/KQ-7 đo nhầm "mất focus".
    /// </summary>
    private void ActivateList(Window win)
    {
        Thread.Sleep(1200);
        var grid = Find(win, "dgvView");
        var first = grid is null ? null : DataRows(grid, 1).FirstOrDefault();
        var cell = first is null ? null : FirstChildren(first, 4).FirstOrDefault(c => Uia.IsOnScreen(c));
        if (cell is not null)
        {
            var (x, y) = Uia.Center(cell);
            Uia.LeftClickPhysical(x, y);
            Thread.Sleep(400);
        }
        InpP1MenuFlow.Focus(win);
    }

    private void MeasureEscEnd(Window win, string tag, string registerId, TestTrace trace)
    {
        var title = RegisterTitles[registerId];
        foreach (var (name, vk) in new[] { ("Escape", Vk.Escape), ("End", Vk.End) })
        {
            // Chọn một dòng trước để F9 (nếu phím = F9) có dòng mà mở.
            trace.Step($"[{tag}] phím {name} trên 一覧");
            ActivateList(win);
            Uia.SendKey(vk);
            Thread.Sleep(3500);
            trace.Shot($"sau-{name}");

            var all = Win32Windows.OfProcess(App.ProcessId).Where(i => i.Visible && i.Title.Length > 0).ToList();
            var reg = all.FirstOrDefault(i => i.Title.Contains(title, StringComparison.Ordinal));
            var listAlive = Uia.IsOnScreen(win);
            var box = MsgBoxWin32.First(App.ProcessId);
            Log($"=== KQ-7 [{tag}] === {name}: dialog đăng ký {(reg is null ? "KHÔNG mở" : "MỞ")}, 一覧 {(listAlive ? "còn" : "ĐÃ ĐÓNG")}, " +
                $"hộp thoại={(box is null ? "không" : box.ToString())}; cửa sổ thấy: {string.Join(" / ", all.Select(i => i.Title))}");
            if (box is not null) { MsgBoxWin32.ClickButton(box.Hwnd, "Cancel", "キャンセル", "いいえ", "No", "OK"); Waits.Step(); }
            if (reg is not null)
            {
                Uia.SendKey(Vk.F10);          // đóng dialog đăng ký bằng 戻る
                Thread.Sleep(1500);
            }
            if (!listAlive)
            {
                Log($"=== KQ-7 [{tag}] === {name} đóng 一覧 ⇒ dừng đo các phím còn lại (cần mở lại)");
                return;
            }
        }
    }

    private void MeasureEmptySearch(Window win, string tag, TestTrace trace)
    {
        var code = Find(win, "txtTrtCd");
        var btn = Find(win, "btnSearch");
        if (code is null || btn is null) { Log($"=== KQ-3 [{tag}] === BỎ QUA: thiếu txtTrtCd/btnSearch"); return; }

        trace.Step($"[{tag}] 検索 với 処置コード=106 (không có trong MST_TRT269)");
        InpP1MenuFlow.Focus(win);
        Uia.MouseClick(code);
        Keyboard.TypeSimultaneously(FlaUI.Core.WindowsAPI.VirtualKeyShort.CONTROL, FlaUI.Core.WindowsAPI.VirtualKeyShort.KEY_A);
        Keyboard.Type("106");
        Waits.Step();
        Log($"=== KQ-3 [{tag}] === sau khi gõ: txtTrtCd=「{Txt.N(Uia.ValueOf(code))}」");

        Uia.MouseClick(btn);
        var text = ReadAndDismissMsg(TimeSpan.FromSeconds(8));
        Log($"=== KQ-3 [{tag}] === 検索 không ra → hộp thoại: " + (text is null ? "KHÔNG CÓ" : $"「{text}」"));

        var grid = Find(win, "dgvView");
        Log($"=== KQ-3 [{tag}] === lblCount sau 検索 = 「{Txt.N(Uia.NameOf(Find(win, "lblCount")!))}」, " +
            $"dòng đọc được = {(grid is null ? -1 : DataRows(grid, 3).Count)}");

        // F9 trên lưới rỗng.
        InpP1MenuFlow.Focus(win);
        Uia.SendKey(Vk.F9);
        var t2 = ReadAndDismissMsg(TimeSpan.FromSeconds(8));
        Log($"=== KQ-3 [{tag}] === F9 trên lưới rỗng → " + (t2 is null ? "KHÔNG CÓ hộp thoại" : $"「{t2}」"));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 日付変更
    // ═════════════════════════════════════════════════════════════════════════

    private void MeasureDateChange()
    {
        using var trace = TestTrace.Begin("Tc0d_DateChange");

        try
        {
            if (App.Window("frm203002") is null)
            {
                Log("=== KQ-5 === frm203002 không còn trên màn hình (list trước chưa đóng?) — dừng");
                return;
            }

            var ops = new TreatmentGridOps(Screen);
            var rows = ops.Snapshot();
            // Dòng có 日 VÀ ô 日 đang hiện trên màn hình (UIA trả rect rỗng cho dòng cuộn khuất — F10).
            var dayCell = rows.Where(r => r.Day.Length > 0)
                .Select(r => Uia.Children(r.Element).ElementAtOrDefault(RegiGrid.Col.Day))
                .FirstOrDefault(c => c is not null && c.BoundingRectangle.Width > 0 && c.BoundingRectangle.Height > 0);
            var target = rows.FirstOrDefault(r => r.Day.Length > 0 && Uia.Children(r.Element).ElementAtOrDefault(RegiGrid.Col.Day) == dayCell);
            Log($"=== KQ-5 === lưới có {rows.Count} dòng; dòng thấy được có 日: " + (target is null ? "KHÔNG" : target.ToString()));
            if (dayCell is null) return;

            trace.Step("click ô 日 rồi chuột phải → 日付変更");
            var (lx, ly) = Uia.Center(dayCell);
            Uia.LeftClickPhysical(lx, ly);      // IDM_DateChg đọc dòng của ô HIỆN HÀNH
            Thread.Sleep(500);
            var (x, y) = Uia.Center(dayCell);
            Uia.RightClickPhysical(x, y);
            Thread.Sleep(600);
            InpSnapshot.ClickMenuPath(App, "日付変更");

            var dlg = Waits.TryFor(() => FindDialog(Screen.Window, "frm203051", "日付変更"), TimeSpan.FromSeconds(10));
            if (dlg is null)
            {
                Log("=== KQ-5 === 日付変更 KHÔNG mở dialog. MessageBox: " + MsgBoxWin32.TextOfAll(App.ProcessId));
                return;
            }

            var did = Uia.AutomationIdOf(dlg);
            Log($"=== KQ-5 === dialog id=「{did}」 tiêu đề=「{Txt.N(Uia.NameOf(dlg))}」");
            trace.Shot("datechg-mo");
            foreach (var e in Uia.Descendants(dlg, 6))
            {
                var eid = Uia.AutomationIdOf(e);
                if (eid.Length == 0) continue;
                var t = Uia.ControlTypeOf(e)?.ToString() ?? "?";
                if (t is "Pane" or "Group" or "Custom") continue;
                Log($"=== KQ-5 ===   {eid} [{t}] name=「{Txt.N(Uia.NameOf(e))}」 value=「{Txt.N(Uia.ValueOf(e))}」 enabled={SafeEnabled(e)}");
            }
            var focused = SafeFocusedId();
            Log($"=== KQ-5 === phần tử đang giữ focus lúc mở: 「{focused}」 (Shown → txtDate.Focus())");
            InpP1MenuFlow.WriteArtifact("master-frm203051.uia.txt", Uia.DumpTree(dlg, maxDepth: 6, maxChildrenPerNode: 60));

            var txt = Find(dlg, "txtDate");
            if (txt is null) { Log("=== KQ-5 === không thấy txtDate — dừng"); InpP1MenuFlow.CloseByBack(App, dlg, did, trace); return; }

            // (a) để trống + F9 → E00001
            InpP1MenuFlow.Focus(dlg);
            Uia.SendKey(Vk.F9);
            var a = ReadAndDismissMsg(TimeSpan.FromSeconds(8));
            Log("=== KQ-5 === (a) F9 khi 新しい日付 trống → " + (a is null ? "KHÔNG CÓ hộp thoại" : $"「{a}」"));

            // (b) 31 — tháng 30 ngày (tháng đang mở là 2026-06) → E00002
            TypeInto(txt, "31");
            Uia.SendKey(Vk.F9);
            var b = ReadAndDismissMsg(TimeSpan.FromSeconds(8));
            Log("=== KQ-5 === (b) gõ 31 + F9 (ngày không tồn tại) → " + (b is null ? "KHÔNG CÓ hộp thoại" : $"「{b}」"));

            // (c) 27 → Q00100 (はい/いいえ). Trả lời いいえ ⇒ dialog ở lại, không đổi gì.
            TypeInto(txt, "27");
            Uia.SendKey(Vk.F9);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null) Log("=== KQ-5 === (c) gõ 27 + F9 → KHÔNG CÓ hộp xác nhận");
            else
            {
                Log($"=== KQ-5 === (c) gõ 27 + F9 → {box} nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]");
                trace.Shot("datechg-q00100");
                MsgBoxWin32.ClickButton(box.Hwnd, "いいえ", "No");
                Waits.Step();
                Log($"=== KQ-5 === (c) sau いいえ: dialog còn mở = {Uia.IsOnScreen(dlg)}, txtDate=「{Txt.N(Uia.ValueOf(txt))}」");
            }

            // (d)(e) ESC / End (BaseDialog2 → btnF9) với txtDate=27 → phải ra cùng Q00100.
            foreach (var (name, vk) in new[] { ("Escape", Vk.Escape), ("End", Vk.End) })
            {
                InpP1MenuFlow.Focus(dlg);
                Uia.SendKey(vk);
                var b2 = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
                Log($"=== KQ-5 === (d) phím {name} → " + (b2 is null ? "KHÔNG CÓ hộp thoại" : $"「{b2.Text}」 nút=[{string.Join(", ", MsgBoxWin32.ButtonCaptions(b2.Hwnd))}]"));
                if (b2 is not null) { MsgBoxWin32.ClickButton(b2.Hwnd, "いいえ", "No"); Waits.Step(); }
            }

            // (f) maxlength của txtDate + Enter có chuyển ô không.
            TypeInto(txt, "12345");
            Log($"=== KQ-5 === (f) gõ 12345 → txtDate=「{Txt.N(Uia.ValueOf(txt))}」 (độ dài tối đa)");
            Uia.SendKey(0x0D);   // Enter
            Thread.Sleep(400);
            Log($"=== KQ-5 === (f) sau Enter, focus: {FocusInfo()}");
            trace.Shot("datechg-sau-enter");

            InpP1MenuFlow.CloseByBack(App, dlg, did, trace);
        }
        catch (Exception e)
        {
            Log($"=== KQ-5 === NGOẠI LỆ: {e.GetType().Name}: {e.Message}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tiện ích
    // ═════════════════════════════════════════════════════════════════════════

    private static void TypeInto(AutomationElement box, string text)
    {
        Uia.MouseClick(box);
        Keyboard.TypeSimultaneously(FlaUI.Core.WindowsAPI.VirtualKeyShort.CONTROL, FlaUI.Core.WindowsAPI.VirtualKeyShort.KEY_A);
        Keyboard.Type(text);
        Waits.Step();
    }

    /// <summary>Phần tử đang giữ focus + vùng chữ đang BÔI ĐEN (TextPattern) nếu control phơi ra.</summary>
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
            catch { /* control không phơi TextPattern */ }
            return $"{Uia.AutomationIdOf(f)} [{Uia.ControlTypeOf(f)}] name=「{Txt.N(Uia.NameOf(f))}」 value=「{Txt.N(Uia.ValueOf(f))}」 bôiĐen=「{sel}」";
        }
        catch (Exception e) { return "? " + e.Message; }
    }

    /// <summary>Bấm Tab <paramref name="n"/> lần và ghi ô giữ focus sau mỗi lần (thứ tự Tab).</summary>
    private void TabOrder(string kq, string tag, int n)
    {
        for (var i = 1; i <= n; i++)
        {
            Uia.SendKey(Vk.Tab);
            Thread.Sleep(250);
            Log($"=== {kq} [{tag}] === Tab#{i} → {FocusInfo()}");
        }
    }

    /// <summary>
    /// Đọc rồi đóng MessageBox bằng Win32 (F17/F18): UIA mù khi modal đang mở nên bản
    /// <c>InpP1MenuFlow.ReadAndDismissError</c> bỏ sót hộp thoại và probe đứng im
    /// (đo 2026-10-13, E00003 「該当データがありません。」 nằm đó mãi).
    /// </summary>
    private string? ReadAndDismissMsg(TimeSpan timeout)
    {
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), timeout);
        if (box is null) return null;
        var text = $"{box.Text} [nút: {string.Join(", ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]";
        MsgBoxWin32.ClickButton(box.Hwnd, "OK");
        Waits.Until(() => MsgBoxWin32.First(App.ProcessId) is null, "hộp thoại đóng sau khi bấm OK", TimeSpan.FromSeconds(10));
        return text;
    }

    private static bool SafeEnabled(AutomationElement e)
    {
        try { return e.Properties.IsEnabled.ValueOrDefault; } catch { return false; }
    }

    private string SafeFocusedId()
    {
        try
        {
            var f = App.Automation.FocusedElement();
            return f is null ? "" : $"{Uia.AutomationIdOf(f)}/{Uia.NameOf(f)}";
        }
        catch { return "?"; }
    }

    /// <summary>
    /// Tìm control theo AutomationId bằng BFS và KHÔNG chui vào <c>dgvView</c>: lưới có hàng
    /// nghìn dòng × 40 cột và cầu MSAA dựng phần tử cho MỌI ô, nên <c>FindFirstDescendant</c>
    /// đi qua nó là hết giờ (<c>COMException: Operation timed out</c>, đo 2026-10-13).
    /// </summary>
    private static AutomationElement? Find(AutomationElement root, string id)
    {
        var queue = new Queue<(AutomationElement El, int Depth)>();
        queue.Enqueue((root, 0));
        while (queue.Count > 0)
        {
            var (el, depth) = queue.Dequeue();
            var eid = Uia.AutomationIdOf(el);
            if (eid == id) return el;
            if (eid == "dgvView" || depth >= 8) continue;
            foreach (var c in Uia.Children(el)) queue.Enqueue((c, depth + 1));
        }
        return null;
    }

    private static string DumpSkippingGrid(AutomationElement root, int maxDepth)
    {
        var sb = new StringBuilder();
        void Walk(AutomationElement el, int depth)
        {
            var eid = Uia.AutomationIdOf(el);
            sb.AppendLine($"{new string(' ', depth * 2)}[{Uia.ControlTypeOf(el)}] id='{eid}' name='{Txt.N(Uia.NameOf(el))}'");
            if (eid == "dgvView" || depth >= maxDepth) return;
            foreach (var c in Uia.Children(el)) Walk(c, depth + 1);
        }
        Walk(root, 0);
        return sb.ToString();
    }

    /// <summary>Tối đa <paramref name="n"/> con đầu tiên, đi bằng TreeWalker (không dựng cả danh sách).</summary>
    private static List<AutomationElement> FirstChildren(AutomationElement e, int n)
    {
        var list = new List<AutomationElement>();
        var walker = e.Automation.TreeWalkerFactory.GetControlViewWalker();
        var c = walker.GetFirstChild(e);
        while (c is not null && list.Count < n)
        {
            list.Add(c);
            c = walker.GetNextSibling(c);
        }
        return list;
    }

    private static bool IsHeaderCell(AutomationElement c) =>
        Uia.ControlTypeOf(c) is FlaUI.Core.Definitions.ControlType.Header or FlaUI.Core.Definitions.ControlType.HeaderItem;

    /// <summary>Nhãn cột đang hiển thị: dòng tiêu đề (「Top Row」) là dòng đầu, con là Header.</summary>
    private static List<string> HeaderNames(AutomationElement grid)
    {
        foreach (var child in FirstChildren(grid, 3))
        {
            var kids = FirstChildren(child, 3);
            if (kids.Count == 0 || !kids.All(IsHeaderCell)) continue;
            return Uia.Children(child).Select(c => Txt.N(Uia.NameOf(c))).ToList();
        }
        return [];
    }

    /// <summary>Các dòng DỮ LIỆU đầu tiên (bỏ dòng tiêu đề, thanh cuộn, ô editor) — tối đa <paramref name="limit"/>.</summary>
    private static List<AutomationElement> DataRows(AutomationElement grid, int limit)
    {
        var rows = new List<AutomationElement>();
        foreach (var child in FirstChildren(grid, limit + 4))
        {
            if (Uia.ControlTypeOf(child) is FlaUI.Core.Definitions.ControlType.ScrollBar or FlaUI.Core.Definitions.ControlType.Header) continue;
            var kids = FirstChildren(child, 2);
            if (kids.Count < 2 || kids.All(IsHeaderCell)) continue;
            rows.Add(child);
            if (rows.Count >= limit) break;
        }
        return rows;
    }
}
