using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpAutoOpenCoexist;

/// <summary>
/// <b>PROBE — không assert.</b> Đo WinForm THẬT: khi 診療入力 mở ở chế độ Insert mà
/// <c>pInpOpt[51]</c> (Dcond, 治療情報 tự mở) và/hoặc <c>pInpOpt[16]</c> (PCond, 歯周情報 tự
/// mở) đang bật, thì 治療情報 / 歯周情報 / hộp 「〜を算定しますか？」 nằm thế nào so với nhau?
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÂU HỎI CẦN ĐO (bên web: 治療情報 che hẳn hộp 初診 và giữ focus)
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  KQ-1  Hai cờ lấy từ Ocha.xml (PCond / Dcond) có thật sự đang như scenario yêu cầu?
///  KQ-2  Cửa sổ nào hiện ra (lớp, tiêu đề, owner, TopMost, rect) và theo THỨ TỰ z nào?
///  KQ-3  Hộp 初診 (MessageBox) có bị 治療情報 / 歯周情報 che không? (rect giao nhau + z-order)
///  KQ-4  Ai đang là cửa sổ foreground khi hộp 初診 hiện?
///  KQ-5  Sau khi bấm Cancel (không tính gì) thì 治療情報 / 歯周情報 còn đó không?
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÁCH LÀM
/// ═══════════════════════════════════════════════════════════════════════════
/// · <c>OchaXml</c> được nạp MỘT lần lúc MENU.exe khởi động (XmlControl.cs:235), nên cờ
///   phải được vá vào <c>C:\NEW_SIM2000\Ocha.xml</c> TRƯỚC khi app mở và app phải là tiến
///   trình MỚI — vì vậy <see cref="PrepareDataBeforeApp"/> tắt MENU đang chạy, và mỗi
///   scenario là một lượt chạy riêng (xem run-inp-auto-open-coexist.ps1).
/// · File gốc được chép nguyên byte ra <c>logs\Ocha.xml.bak-*</c> và TRẢ LẠI ở teardown
///   (app có thể tự ghi lại Ocha.xml khi đóng 歯周情報 — PCondLocation — nên phải kill app
///   rồi mới trả).
/// · KHÔNG bấm F9, KHÔNG ghi DB: chỉ đọc DB để chọn bệnh nhân, hộp 初診 được trả lời
///   Cancel (modSave.cs:3058 → không tính gì).
/// · Cờ riêng: <c>OCHA_INP_AUTO_OPEN_ALLOW_XML_PATCH=1</c> (ghi vào file cấu hình của app).
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh qua run-inp-auto-open-coexist.ps1")]
[Category("inp-auto-open-coexist")]
public sealed class InpAutoOpenCoexistProbeTests : UiTestBase
{
    private const string OchaXmlPath = @"C:\NEW_SIM2000\Ocha.xml";
    private const string AllowEnv = "OCHA_INP_AUTO_OPEN_ALLOW_XML_PATCH";

    private string? _xmlBackupPath;
    private byte[]? _xmlOriginal;

    /// <summary>Phải để trống: watcher mặc định bấm 「いいえ」 hộ đúng hộp 初診 đang đo.</summary>
    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>Fixture tự điều hướng — màn 診療入力 mở ra kèm hộp modal nên nền chung không chờ nổi.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    protected override string? FixturePreflightSkipReason() =>
        Environment.GetEnvironmentVariable(AllowEnv) == "1"
            ? null
            : $"Cần {AllowEnv}=1 — probe này VÁ C:\\NEW_SIM2000\\Ocha.xml (rồi trả lại) và tắt MENU.exe đang chạy. " +
              "Chạy: .\\run-inp-auto-open-coexist.ps1 -Pcond 1 -Dcond 1";

    private static string Env(string name, string fallback) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } v ? v : fallback;

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    // ═════════════════════════════════════════════════════════════════════════
    // Chuẩn bị: tắt app cũ, vá Ocha.xml, chọn bệnh nhân
    // ═════════════════════════════════════════════════════════════════════════

    protected override void PrepareDataBeforeApp()
    {
        foreach (var p in Process.GetProcessesByName("MENU"))
        {
            try { p.Kill(); p.WaitForExit(10_000); Log($"đã tắt MENU.exe đang chạy (pid {p.Id}) để nạp lại Ocha.xml"); }
            catch (Exception e) { Log($"không tắt được MENU pid {p.Id}: {e.Message}"); }
        }

        _xmlOriginal = File.ReadAllBytes(OchaXmlPath);
        var logs = Path.Combine(AppContext.BaseDirectory, "artifacts");
        Directory.CreateDirectory(logs);
        _xmlBackupPath = Path.Combine(logs, $"Ocha.xml.bak-{DateTime.Now:yyyyMMdd-HHmmss}");
        File.WriteAllBytes(_xmlBackupPath, _xmlOriginal);
        Log($"đã sao lưu Ocha.xml → {_xmlBackupPath} ({_xmlOriginal.Length} byte)");

        var pcond = Env("OCHA_PCOND", "9");
        var dcond = Env("OCHA_DCOND", "9");
        var text = Encoding.UTF8.GetString(_xmlOriginal);
        var patched = Regex.Replace(text, @"<PCond>\s*\d+\s*</PCond>", $"<PCond>{pcond}</PCond>");
        patched = Regex.Replace(patched, @"<Dcond>\s*\d+\s*</Dcond>", $"<Dcond>{dcond}</Dcond>");
        if (patched == text && !(text.Contains($"<PCond>{pcond}</PCond>") && text.Contains($"<Dcond>{dcond}</Dcond>")))
            throw new InvalidOperationException("Không thấy <PCond>/<Dcond> trong Ocha.xml — không vá được.");
        // Giữ nguyên BOM nếu file gốc có.
        var hasBom = _xmlOriginal.Length >= 3 && _xmlOriginal[0] == 0xEF && _xmlOriginal[1] == 0xBB && _xmlOriginal[2] == 0xBF;
        File.WriteAllBytes(OchaXmlPath, new UTF8Encoding(hasBom).GetPreamble().Concat(Encoding.UTF8.GetBytes(patched)).ToArray());
        Log($"VÁ Ocha.xml: PCond={pcond}, Dcond={dcond} (BOM {(hasBom ? "có" : "không")})");

        Settings.Patient.OpenMode = "insert";
        var forced = Environment.GetEnvironmentVariable("OCHA_PROBE_PAT_NO");
        var pat = !string.IsNullOrWhiteSpace(forced) ? forced! : PickPatient() ?? Settings.Patient.PatNo;
        Settings.Patient.PatNo = pat;
        Log($"bệnh nhân dùng để đo: {pat} (ngày {TrtDate:yyyy-MM-dd}, openMode=insert)");
    }

    /// <summary>
    /// Bệnh nhân CÓ 歯周病検査 (120/121/124/125-0) và CHƯA có dòng nào ở ngày test —
    /// nên 歯周情報 có dữ liệu để mở, và AutoSantei không bị chặn bởi 「ngày đã có dữ liệu」.
    /// Chỉ ĐỌC.
    /// </summary>
    private string? PickPatient()
    {
        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString)) return null;
        try
        {
            using var con = new SqlConnection(Settings.Db.ConnectionString);
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandTimeout = Settings.Db.CommandTimeoutSeconds;
            cmd.CommandText =
                @"SELECT TOP 1 t.PAT_NO
                  FROM TRNTRN t
                  WHERE t.DEL_FLG = 0 AND t.PAT_NO < 990000
                    AND (t.TRT_CD IN (120, 121, 124) OR (t.TRT_CD = 125 AND t.TRT_SB = 0))
                    AND NOT EXISTS (SELECT 1 FROM TRNTRN x WHERE x.PAT_NO = t.PAT_NO AND x.TRT_DT = @d AND x.DEL_FLG = 0)
                  GROUP BY t.PAT_NO
                  ORDER BY MAX(t.TRT_DT) DESC OFFSET @o ROWS FETCH NEXT 1 ROWS ONLY";
            cmd.Parameters.AddWithValue("@d", TrtDate.Date);
            cmd.Parameters.AddWithValue("@o", int.Parse(Env("OCHA_PROBE_PICK_INDEX", "0")));
            return cmd.ExecuteScalar()?.ToString();
        }
        catch (Exception e)
        {
            Log($"không chọn được bệnh nhân từ DB: {e.Message}");
            return null;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Probe
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("Tc0 — PROBE: z-order / vị trí / foreground của 治療情報, 歯周情報 và hộp 初診")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();
        var wantP = Env("OCHA_PCOND", "9");
        var wantD = Env("OCHA_DCOND", "9");

        Kq("1", $"Ocha.xml đang chứa PCond={XmlValue("PCond")} Dcond={XmlValue("Dcond")} " +
                $"(scenario yêu cầu PCond={wantP} Dcond={wantD}); bệnh nhân {Settings.Patient.PatNo}");

        try
        {
            AppNavigator.OpenTreatmentEntry(App, Settings);
        }
        catch (Exception e)
        {
            Log($"    !! OpenTreatmentEntry: {e.GetType().Name}: {e.Message} — vẫn tiếp tục đo cửa sổ");
        }

        // Quan sát 25s: log MỖI LẦN danh sách cửa sổ đổi.
        string? last = null;
        var sw = Stopwatch.StartNew();
        var shotTaken = false;
        MsgBoxWin32.Found? santei = null;
        while (sw.Elapsed < TimeSpan.FromSeconds(25))
        {
            var snap = Snapshot(App.ProcessId);
            var key = string.Join("|", snap.Select(w => $"{w.Class}:{w.Title}:{w.Rect}"));
            if (key != last)
            {
                last = key;
                Log($"--- t={sw.Elapsed.TotalSeconds:0.0}s, foreground={Describe(ForegroundOf(App.ProcessId))} ---");
                for (var i = 0; i < snap.Count; i++) Log($"    z{i}  {snap[i]}");
            }
            santei ??= MsgBoxWin32.All(App.ProcessId).FirstOrDefault(m => Txt.Has(m.Text, "算定しますか"));
            if (santei is not null && !shotTaken && sw.Elapsed > TimeSpan.FromSeconds(3))
            {
                trace.Shot("hop-so-chan-dang-hien");
                shotTaken = true;
                break;
            }
            Thread.Sleep(500);
        }
        if (!shotTaken) trace.Shot("het-gio-khong-thay-hop-so");

        var final = Snapshot(App.ProcessId);
        Kq("2", "thứ tự z từ TRÊN xuống (cửa sổ ĐẦU TIÊN là lớp trên cùng):");
        for (var i = 0; i < final.Count; i++) Log($"        z{i}  {final[i]}");

        if (santei is null)
        {
            Kq("3", "KHÔNG thấy hộp 「〜を算定しますか？」 trong 25s (bệnh nhân có thể không đủ điều kiện 初診 → 再診, " +
                    "không hỏi) — xem ảnh và KQ-2.");
        }
        else
        {
            var boxRect = RectOf(santei.Hwnd);
            var zBox = final.FindIndex(w => w.Hwnd == santei.Hwnd);
            Kq("3", $"hộp 初診 「{santei.Text}」 rect={boxRect}, z={zBox}");
            for (var i = 0; i < final.Count; i++)
            {
                var w = final[i];
                if (w.Hwnd == santei.Hwnd || w.IsMain) continue;
                var overlap = Intersect(boxRect, w.RectValue);
                Kq("3", $"  so với 「{w.Title}」 ({w.Class}) z={i}: " +
                        $"{(i < zBox ? "NẰM TRÊN" : "nằm dưới")} hộp 初診, phần giao {overlap}, TopMost={w.TopMost}");
            }
            Kq("4", $"foreground = {Describe(ForegroundOf(App.ProcessId))}");

            var answer = Env("OCHA_PROBE_ANSWER", "Cancel");
            if (answer == "Yes")
            {
                // Yes = tính 初診 vào lưới (bộ nhớ) — KHÔNG F9 nên không ghi DB (modSave.cs:3048-3052).
                var yes = MsgBoxWin32.ClickButton(santei.Hwnd, "はい", "Yes");
                Log($"    bấm Yes: {yes}");
                string? lastAfter = null;
                var sw2 = Stopwatch.StartNew();
                var shot2 = 0;
                while (sw2.Elapsed < TimeSpan.FromSeconds(20))
                {
                    var snap = Snapshot(App.ProcessId);
                    var key = string.Join("|", snap.Select(w => $"{w.Class}:{w.Title}:{w.Rect}"));
                    if (key != lastAfter)
                    {
                        lastAfter = key;
                        Log($"--- sau Yes t={sw2.Elapsed.TotalSeconds:0.0}s, foreground={Describe(ForegroundOf(App.ProcessId))} ---");
                        for (var i = 0; i < snap.Count; i++) Log($"    z{i}  {snap[i]}");
                        foreach (var m in MsgBoxWin32.All(App.ProcessId))
                            Log($"    MessageBox: 「{m.Text}」 nút: {string.Join(",", MsgBoxWin32.ButtonCaptions(m.Hwnd))}");
                        if (shot2 < 3) trace.Shot($"sau-yes-{++shot2}");
                    }
                    Thread.Sleep(500);
                }
                var fin = Snapshot(App.ProcessId);
                Kq("6", "sau Yes (cuối 20s), z từ TRÊN xuống:");
                for (var i = 0; i < fin.Count; i++) Log($"        z{i}  {fin[i]}");
                var others = fin.Where(w => !w.IsMain).ToList();
                foreach (var top in others)
                    foreach (var below in others)
                        if (top.Hwnd != below.Hwnd && fin.IndexOf(top) < fin.IndexOf(below))
                        {
                            var ov = Intersect(below.RectValue, top.RectValue);
                            if (ov != "0%") Kq("6", $"  「{top.Title}」 (z{fin.IndexOf(top)}) CHE 「{below.Title}」 (z{fin.IndexOf(below)}): {ov.Replace("hộp 初診", "cửa sổ dưới")}");
                        }
                Kq("6", $"foreground cuối = {Describe(ForegroundOf(App.ProcessId))}");
            }
            else
            {
                // Trả lời Cancel (modSave.cs:3058 → không tính gì). Mỗi nhánh MỘT lời gọi (xem MsgBoxWin32.ClickButton).
                var clicked = MsgBoxWin32.ClickButton(santei.Hwnd, "キャンセル", "Cancel");
                Log($"    bấm Cancel: {clicked}; nút của hộp: {string.Join(",", MsgBoxWin32.ButtonCaptions(santei.Hwnd))}");
                Thread.Sleep(2000);
                trace.Shot("sau-cancel");
                var after = Snapshot(App.ProcessId);
                Kq("5", "sau Cancel còn các cửa sổ: " + string.Join(" / ", after.Select(w => $"「{w.Title}」{(w.IsMain ? "" : $"[{w.Rect}]")}")));
            }
        }

        Log("=== KQ-END === Gửi lại các dòng '=== KQ-' + thư mục artifacts\\screenshots");
        Assert.Pass("PROBE xong — đọc các dòng KQ, không có assert nào ở đây");
    }

    private static string XmlValue(string tag)
    {
        var m = Regex.Match(File.ReadAllText(OchaXmlPath), $@"<{tag}>\s*(\d+)\s*</{tag}>");
        return m.Success ? m.Groups[1].Value : "?";
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Trả lại cấu hình
    // ═════════════════════════════════════════════════════════════════════════

    [OneTimeTearDown]
    public void RestoreOchaXml()
    {
        // Kill app TRƯỚC: đóng 歯周情報 có thể khiến app ghi lại Ocha.xml (PCondLocation).
        foreach (var p in Process.GetProcessesByName("MENU"))
        {
            try { p.Kill(); p.WaitForExit(10_000); } catch { /* đã chết */ }
        }
        if (_xmlOriginal is null) return;
        try
        {
            File.WriteAllBytes(OchaXmlPath, _xmlOriginal);
            var same = File.ReadAllBytes(OchaXmlPath).SequenceEqual(_xmlOriginal);
            Log($"ĐÃ TRẢ LẠI Ocha.xml (khớp byte với bản gốc: {same}); PCond={XmlValue("PCond")} Dcond={XmlValue("Dcond")}");
            if (!same) TestContext.Error.WriteLine($"!! Ocha.xml KHÔNG khớp bản gốc. Sửa tay từ {_xmlBackupPath}");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine($"!! KHÔNG TRẢ LẠI ĐƯỢC Ocha.xml: {e.Message}. Chép tay từ {_xmlBackupPath}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Win32: liệt kê cửa sổ của tiến trình theo z-order
    // ═════════════════════════════════════════════════════════════════════════

    private sealed record Win(IntPtr Hwnd, string Class, string Title, string Rect, RECT RectValue, bool TopMost, IntPtr Owner, bool IsMain)
    {
        public override string ToString() =>
            $"{(IsMain ? "[chính] " : "")}class={Class} 「{Title}」 rect={Rect} topmost={TopMost} owner=0x{Owner.ToInt64():X}";
    }

    private static List<Win> Snapshot(int pid)
    {
        var list = new List<Win>();
        EnumWindows((h, _) =>
        {
            if (!IsWindowVisible(h)) return true;
            GetWindowThreadProcessId(h, out var p);
            if (p != pid) return true;
            var title = TextOf(h);
            var cls = ClassOf(h);
            GetWindowRect(h, out var r);
            var ex = GetWindowLong(h, GWL_EXSTYLE);
            var owner = GetWindow(h, GW_OWNER);
            // Cửa sổ chính của form lớn (không owner, không phải hộp thoại) — chỉ để đánh dấu.
            var isMain = owner == IntPtr.Zero && cls != "#32770" && (r.Right - r.Left) > 800;
            list.Add(new Win(h, cls, title, $"({r.Left},{r.Top},{r.Right},{r.Bottom})", r, (ex & WS_EX_TOPMOST) != 0, owner, isMain));
            return true;
        }, IntPtr.Zero);
        return list;
    }

    private static RECT RectOf(IntPtr h) { GetWindowRect(h, out var r); return r; }

    private static string Intersect(RECT a, RECT b)
    {
        var w = Math.Min(a.Right, b.Right) - Math.Max(a.Left, b.Left);
        var h = Math.Min(a.Bottom, b.Bottom) - Math.Max(a.Top, b.Top);
        if (w <= 0 || h <= 0) return "0%";
        var area = (long)w * h;
        var boxArea = Math.Max(1L, (long)(a.Right - a.Left) * (a.Bottom - a.Top));
        return $"{100.0 * area / boxArea:0}% hộp 初診";
    }

    private static IntPtr ForegroundOf(int pid)
    {
        var fg = GetForegroundWindow();
        GetWindowThreadProcessId(fg, out var p);
        return p == pid ? fg : IntPtr.Zero;
    }

    private static string Describe(IntPtr h) =>
        h == IntPtr.Zero ? "(không thuộc MENU.exe)" : $"0x{h.ToInt64():X} class={ClassOf(h)} 「{TextOf(h)}」";

    private static string TextOf(IntPtr h)
    {
        var sb = new StringBuilder(256);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    private static string ClassOf(IntPtr h)
    {
        var sb = new StringBuilder(128);
        GetClassName(h, sb, sb.Capacity);
        return sb.ToString();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; public override string ToString() => $"({Left},{Top},{Right},{Bottom})"; }

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TOPMOST = 0x8;
    private const uint GW_OWNER = 4;

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder sb, int max);
}
