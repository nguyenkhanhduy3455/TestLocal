using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.RxDuplicate;

/// <summary>
/// <b>PROBE — 処方箋 (frm210001 → frm210002). KHÔNG assert, không bao giờ ném.</b>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÂU HỎI ĐANG ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>RxUsage.getListRxUsage</c> (RxUsage.cs:349-358) LEFT JOIN <c>RX_DETAIL</c> KHÔNG có
/// điều kiện <c>DeleteDate</c>. Đơn bị huỷ (取消) rồi phát hành lại cùng
/// (pat_no, rx_type, trt_dt, seq_no) để lại dòng RX_DETAIL đã huỷ cạnh dòng sống ⇒ nghi
/// mỗi dòng RX_USAGE sống nhân đôi khi mở đơn.
///
/// Dữ liệu có sẵn (SIM2000, đo SQL 2026-10-09), bệnh nhân 4031, rx_type 2, seq_no 1:
///   2025-10-08: 1 usage sống, 1 detail sống + 1 detail huỷ ⇒ SQL join trả 2 dòng (đúng ra 1)
///   2025-03-25: 2 usage sống, 2 detail sống (trùng nhau, bảng không có PK) ⇒ join trả 4
///   2025-01-24: 4 usage sống, 4 detail sống ⇒ join trả 16
///
/// <code>
///  KQ-1  Menu 処方箋 có mở frm210001 không? Control nào có AutomationId?
///  KQ-2  Nhập 4031 + 交付日 2025-10-08 + 検索: lưới có mấy dòng, cột 調剤結果 ra gì
///        (dòng huỷ phải ra 「取消」)?
///  KQ-3  Mở đơn SỐNG (cee4fc79…) bằng F9: frm210002 hiện bao nhiêu dòng thuốc?
///        DB có 1 usage sống + 1 detail sống ⇒ đúng ra 1 dòng; join lỗi ⇒ 2.
///  KQ-4  Mở đơn ĐÃ HUỶ (81fd12f4…): cùng câu hỏi.
///  KQ-5  Các đơn còn lại có dòng RX_DETAIL/RX_USAGE sống TRÙNG trong DB (2025-01-24, 2025-03-25):
///        màn hình hiện bao nhiêu dòng thuốc so với số dòng DB?
/// </code>
///
/// <para><b>CHỈ ĐỌC.</b> Không seed, không ghi DB.</para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("rx-duplicate")]
public sealed class RxDuplicateProbeTests : UiTestBase
{
    private Window? _list;

    protected override bool NavigatesToTreatmentEntry => false;
    protected override AutomationElement? UiaDumpRoot => _list;
    protected override string[] NuisanceDialogPatterns => [];

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    [Test, Order(1)]
    public void Tc0a_MoManHinhDonThuoc()
    {
        Log("=== KQ-1 === mở メインメニュー → 日常業務 → 処方箋");
        try
        {
            var timeout = TimeSpan.FromSeconds(Settings.App.LaunchTimeoutSeconds);
            var menu = Waits.TryFor(() => App.Window("MainMenu") ?? App.WindowByTitle("メインメニュー"), timeout);
            if (menu is null) { Log("=== KQ-1 === KHÔNG thấy MainMenu"); return; }

            Uia.MouseClick(Waits.For(() => Uia.ById(menu, "pnlBtn1"), "pnlBtn1")); Waits.Step();
            Uia.MouseClick(Waits.For(() => Uia.ById(menu, "pnlMenu5"), "pnlMenu5")); Waits.Step();

            _list = Waits.TryFor(() => App.Window("frm210001"), timeout);
            Log(_list is null
                ? "=== KQ-1 === frm210001 KHÔNG mở. Cửa sổ: " +
                  string.Join(", ", App.Windows().Select(w => Uia.AutomationIdOf(w) + "/" + Uia.NameOf(w)))
                : "=== KQ-1 === frm210001 đã mở");

            var dir = Path.Combine(AppContext.BaseDirectory, "artifacts", "rx-duplicate");
            Directory.CreateDirectory(dir);
            ScreenCapture.CaptureToFile(dir, "01_frm210001");
            if (_list is not null)
                File.WriteAllText(Path.Combine(dir, "frm210001.uia.txt"), Uia.DumpTree(_list, 10, 60));
            Log("=== KQ-1 === ảnh + cây UIA ở " + dir);
        }
        catch (Exception e) { Log("=== KQ-1 === NGOẠI LỆ: " + e.Message); }
    }

    private const string LivePrescriptionId = "cee4fc79-373d-43f5-91a8-0e76777b7fae";
    private const string CancelledPrescriptionId = "81fd12f4-1379-46bd-a05a-ee3694eaa194";


    private static readonly TimeSpan StepLimit = TimeSpan.FromSeconds(60);

    /// <summary>
    /// Chạy một bước TRÊN LUỒNG TEST (STA) với đồng hồ canh 60 giây. Quá giờ thì timer chụp
    /// MÀN HÌNH ngay lúc đó và ghi log — không ngồi chờ treo (FLA-UI-GUIDELINE F2).
    ///
    /// <para>Không chạy thao tác trên luồng khác: lượt 09:49 dùng <c>Task.Run</c> thì
    /// <c>Focus()</c>/gõ phím của UIA rơi sai ô ("8" lọt vào ô 患者番号 thành 「84031」).</para>
    /// </summary>
    private T Guard<T>(string kq, string step, Func<T> action)
    {
        var fired = false;
        using var watchdog = new System.Threading.Timer(_ =>
        {
            fired = true;
            Log($"=== {kq} === QUÁ {StepLimit.TotalSeconds:0}s ở bước 「{step}」 — chụp màn hình");
            try { ScreenCapture.CaptureToFile(ArtifactDir(), $"x_{kq}_qua-60s_{Safe(step)}"); } catch { /* ignore */ }
        }, null, StepLimit, Timeout.InfiniteTimeSpan);

        var result = action();
        if (fired) throw new TimeoutException($"{kq}: bước 「{step}」 chạy quá 60s (đã chụp ảnh)");
        return result;
    }

    private void Guard(string kq, string step, Action action) => Guard<object?>(kq, step, () => { action(); return null; });

    private static string Safe(string s) => new string(s.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray());


    /// <summary>
    /// Tìm control của frm210001 theo từng cấp CON (pnlBase → control), không quét hậu duệ.
    /// Sau F10 lưới nạp MỌI bệnh nhân (hàng nghìn dòng × 8 ô); <c>FindFirstDescendant</c> bò vào
    /// lưới đó và hết giờ dù control có mặt (cây UIA vẫn có cboPatNo — lượt 10:08). Đó cũng là lý
    /// do các lượt trước nhìn như "treo".
    /// </summary>
    private static AutomationElement Quick(AutomationElement root, params string[] path)
    {
        var cur = root;
        foreach (var id in path)
        {
            var parent = cur;
            cur = Waits.For(() => parent.FindFirstChild(cf => cf.ByAutomationId(id)), $"{id} (con của {Uia.AutomationIdOf(parent)})", TimeSpan.FromSeconds(20));
        }
        return cur;
    }

    private static string ArtifactDir()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts", "rx-duplicate");
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>
    /// Gõ ĐÈ từng ô 年/月/日 (Ctrl+A rồi gõ, KHÔNG Delete). Xoá trắng một ô làm 交付日 dở dang, rời
    /// focus là app bung 「交付日が間違っています」 (E-box chặn, lượt 09:51 2026-10-09).
    /// </summary>
    private static void SetDate(AutomationElement control, int eraYear, int month, int day)
    {
        TypeOver(Waits.For(() => Uia.ById(control, "txtYear"), "txtYear"), eraYear.ToString("00"));
        TypeOver(Waits.For(() => Uia.ById(control, "txtMonth"), "txtMonth"), month.ToString("00"));
        TypeOver(Waits.For(() => Uia.ById(control, "txtDay"), "txtDay"), day.ToString("00"));
    }

    private static void TypeOver(AutomationElement box, string text)
    {
        box.Focus();
        Thread.Sleep(80);
        FlaUI.Core.Input.Keyboard.TypeSimultaneously(FlaUI.Core.WindowsAPI.VirtualKeyShort.CONTROL, FlaUI.Core.WindowsAPI.VirtualKeyShort.KEY_A);
        FlaUI.Core.Input.Keyboard.Type(text);
    }

    /// <summary>Có hộp thoại đang mở thì ghi nội dung + chụp ảnh rồi ném — đừng gõ tiếp vào màn bị chặn.</summary>
    private void FailIfDialog(string kq, string where)
    {
        var texts = Dialogs.Open(App.Automation, App.ProcessId).Select(d => Txt.N(Dialogs.TextOf(d))).ToList();
        if (texts.Count == 0) return;
        Log($"=== {kq} === HỘP THOẠI sau 「{where}」: " + string.Join(" / ", texts.Select(t => $"「{t}」")));
        ScreenCapture.CaptureToFile(ArtifactDir(), $"x_{kq}_hop-thoai_{Safe(where)}");
        throw new InvalidOperationException($"{kq}: có hộp thoại sau 「{where}」");
    }

    /// <summary>
    /// Nhập 4031 + 交付日 từ-đến rồi 検索. Bệnh nhân nhập SAU CÙNG và được đọc lại: ô trống thì
    /// 検索 liệt kê mọi bệnh nhân (hàng nghìn dòng) và UIA đọc từng dòng rất chậm — lượt chạy
    /// 2026-10-09 09:32 treo ở đó. Trả false nếu ô không nhận 4031.
    /// </summary>
    private bool SearchPatient4031(string kq, (int Era, int M, int D) from, (int Era, int M, int D)? to)
    {
        Guard(kq, "foreground", () => Uia.ForceForeground(_list!.Properties.NativeWindowHandle));

        // Bệnh nhân TRƯỚC, ngày SAU: đổi 交付日 làm lưới tự nạp lại toàn CSDL và xoá ô 患者番号
        // nếu nó được nhập sau (lượt 09:57, ảnh x_KQ-2_patno-khong-nhan.png). Đây cũng là thứ tự
        // của lượt đầu tiên chạy đúng.
        var edit = Guard(kq, "tìm ô 患者番号", () => Uia.EditInside(Quick(_list!, "pnlBase", "cboPatNo")));
        Guard(kq, "nhập 患者番号", () => TypeOver(edit, "4031"));
        FailIfDialog(kq, "nhập 患者番号");

        // CHỈ đổi 交付日 đầu; ô đến giữ nguyên (hôm nay) nên from <= to ở MỌI bước gõ.
        Guard(kq, "nhập 交付日 từ", () => SetDate(Quick(_list!, "pnlBase", "dtIssueDate1"), from.Era, from.M, from.D));
        FailIfDialog(kq, "nhập 交付日");
        Guard(kq, "đưa focus về 患者番号", () => { try { edit.Focus(); } catch { /* ignore */ } });
        Waits.Step();

        var shown = Guard(kq, "đọc lại 患者番号", () => Uia.ValueOf(edit));
        if (shown != "4031")
        {
            Log($"=== {kq} === ô 患者番号 không giữ 4031 (đang là 「{shown}」) — DỪNG, không 検索");
            ScreenCapture.CaptureToFile(ArtifactDir(), $"x_{kq}_patno-khong-nhan");
            return false;
        }
        Guard(kq, "bấm 検索", () => Uia.MouseClick(Quick(_list!, "pnlBase", "btnSearch")));
        Waits.Step(); Waits.Step();
        FailIfDialog(kq, "検索");
        return true;
    }

    private void DumpRow(string kq, IReadOnlyList<DgvRow> rows)
    {
        for (var i = 0; i < rows.Count; i++) Log($"=== {kq} ===   [{i}] {rows[i]}");
    }

    /// <summary>Chọn dòng có 処方箋ID = id rồi bấm F9; trả frm210002 hoặc null.</summary>
    private Window? OpenPrescription(string id, string kq)
    {
        var row = Guard("KQ-open", "tìm dòng "+id[..8], () => new WinFormsGrid(Quick(_list!, "pnlBase", "pnlView", "dgvView")).Rows(40).FirstOrDefault(r => r.Cells.Any(c => c.Contains(id))));
        if (row is null) { Log($"=== {kq} === KHÔNG thấy dòng 処方箋ID={id} trong lưới"); return null; }

        Uia.ForceForeground(_list!.Properties.NativeWindowHandle);
        Guard(kq, "chọn dòng + F9", () => { Uia.MouseClick(row.Element); Waits.Step(); Uia.SendKey(Vk.F9); Waits.Step(); });

        var detail = Waits.TryFor(() => App.Window("frm210002"), TimeSpan.FromSeconds(10));
        Log(detail is null
            ? $"=== {kq} === F9 xong mà frm210002 KHÔNG mở. Cửa sổ: " +
              string.Join(", ", App.Windows().Select(w => Uia.AutomationIdOf(w) + "/" + Uia.NameOf(w)))
            : $"=== {kq} === frm210002 đã mở cho {id}");
        return detail;
    }

    [Test, Order(2)]
    public void Tc0b_TimDonCuaBenhNhan4031()
    {
        Log("=== KQ-2 === 患者 4031, 交付日 令和7年10月8日, 検索");
        try
        {
            if (_list is null) { Log("=== KQ-2 === BỎ QUA: Tc0a chưa mở được frm210001"); return; }
            if (!SearchPatient4031("KQ-2", (7, 10, 8), null)) return;

            var grid = new WinFormsGrid(Quick(_list, "pnlBase", "pnlView", "dgvView"));
            var rows = Guard("KQ-2", "đọc lưới danh sách", () => grid.Rows(40));
            Log($"=== KQ-2 === lưới có {rows.Count} dòng (đọc tối đa 40); header = {string.Join(" | ", grid.Headers())}");
            DumpRow("KQ-2", rows);
            ScreenCapture.CaptureToFile(ArtifactDir(), "02_list_4031_20251008");
        }
        catch (Exception e) { Log("=== KQ-2 === NGOẠI LỆ: " + e.Message); }
    }

    // (nhãn, 処方箋ID, số dòng RX_USAGE sống, số dòng RX_DETAIL sống, số dòng RX_DETAIL huỷ) — đo SQL 2026-10-09
    private static readonly (string Label, string Id, int UsageLive, int DetailLive, int DetailCancelled)[] Cases =
    [
        ("2025-10-08 sống",  "cee4fc79-373d-43f5-91a8-0e76777b7fae", 1, 1, 1),
        ("2025-10-08 huỷ",   "81fd12f4-1379-46bd-a05a-ee3694eaa194", 1, 1, 1),
        ("2025-03-25 sống",  "070ea6e3-f011-454c-a16e-838ba7ba163a", 2, 2, 0),
        ("2025-03-25 huỷ",   "2ffe4f85-9088-4011-80ad-e7ee562f910a", 0, 0, 0),
        ("2025-01-24 sống",  "51b1d0ba-3d52-4546-ade0-90b4bdf16e5a", 4, 4, 0),
    ];

    private bool ReturnToList(string kq)
    {
        if (App.Window("frm210002") is { } open)
        {
            Uia.ForceForeground(open.Properties.NativeWindowHandle);
            Uia.SendKey(Vk.F10);
            Waits.TryFor(() => App.Window("frm210001"), TimeSpan.FromSeconds(8));
        }
        _list = App.Window("frm210001");
        if (_list is not null)
        {
            // Sau F10 danh sách nạp lại; chờ control hiện đủ (4s mặc định là ngắn) rồi chụp trạng thái.
            var found = Waits.TryFor(() => _list.FindFirstChild(cf => cf.ByAutomationId("pnlBase"))?.FindFirstChild(cf => cf.ByAutomationId("cboPatNo")), TimeSpan.FromSeconds(15));
            Log($"=== {kq} === sau F10: cboPatNo {(found is null ? "KHÔNG" : "có")} trong cây UIA của frm210001 (hwnd {_list.Properties.NativeWindowHandle.ValueOrDefault})");
            File.WriteAllText(Path.Combine(ArtifactDir(), $"frm210001_sau-F10_{DateTime.Now:HHmmss}.uia.txt"), Uia.DumpTree(_list, 6, 40));
            ScreenCapture.CaptureToFile(ArtifactDir(), $"x_{kq}_ve-danh-sach_{DateTime.Now:HHmmss}");
            return true;
        }

        var dialogs = Dialogs.Open(App.Automation, App.ProcessId).Select(d => Txt.N(Dialogs.TextOf(d))).ToList();
        Log($"=== {kq} === không quay lại được frm210001. Hộp thoại: " + string.Join(" / ", dialogs.Select(t => $"「{t}」")));
        ScreenCapture.CaptureToFile(ArtifactDir(), $"x_{kq}_khong-ve-duoc-danh-sach");
        return false;
    }

    [Test, Order(3)]
    public void Tc0c_MoTungDonVaDemDongThuoc()
    {
        Log("=== KQ-3 === mở từng đơn của 4031, đếm dòng thuốc trên lưới 薬剤 (dgvView)");
        try
        {
            if (_list is null) { Log("=== KQ-3 === BỎ QUA"); return; }

            // 交付日 từ 令和6年1月1日 (date2 giữ nguyên) để lưới liệt kê đủ các đơn của 4031.
            if (!SearchPatient4031("KQ-3", (6, 1, 1), null)) return;
            var listRows = new WinFormsGrid(Quick(_list, "pnlBase", "pnlView", "dgvView")).Rows(40);
            Log($"=== KQ-3 === danh sách 4031 từ 令和6年: {listRows.Count - 1} dòng (không tính header, đọc tối đa 40)");

            foreach (var c in Cases)
            {
                // Sau F10 danh sách nạp lại và xoá ô 患者番号 ⇒ tìm lại 4031 trước MỖI đơn (trừ đơn đầu, vừa tìm).
                if (c != Cases[0] && !SearchPatient4031("KQ-3", (6, 1, 1), null)) return;
                var detail = OpenPrescription(c.Id, "KQ-3");
                if (detail is null) { if (!ReturnToList("KQ-3")) return; continue; }
                Waits.Step(); Waits.Step();

                var rows = Guard("KQ-3", "đọc lưới 薬剤 "+c.Label, () => new WinFormsGrid(Uia.RequireById(detail, "dgvView")).Rows(40).Where(r => !r.IsEmpty && r.At(0) != "剤形").ToList());
                Log($"=== KQ-3 === [{c.Label}] DB: usage sống={c.UsageLive} detail sống={c.DetailLive} detail huỷ={c.DetailCancelled}" +
                    $" ⇒ MÀN HÌNH: {rows.Count} dòng thuốc");
                foreach (var r in rows) Log($"=== KQ-3 ===     {r}");
                ScreenCapture.CaptureToFile(ArtifactDir(), $"03_{c.Label.Replace(' ', '_')}");

                if (!ReturnToList("KQ-3")) return;
            }
        }
        catch (Exception e) { Log("=== KQ-3 === NGOẠI LỆ: " + e.Message); }
    }
}
