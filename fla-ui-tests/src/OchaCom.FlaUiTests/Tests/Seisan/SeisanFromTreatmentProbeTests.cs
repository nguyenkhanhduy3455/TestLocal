using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;
using OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>PROBE G8 — 診療入力 F8 会計 → 窓口精算 (2026-10-27). KHÔNG assert.</b>
///
/// <code>
///  KQ-8   F8 (frm203002.cs:7725-7755) mở 204002: điểm từng cột, UNPAID vừa ghi
///  KQ-9   204002 F10 + Q00004 OK ⇒ về form nào (lịch sử ID203001, frm204002.cs:1350-1358)
///  KQ-10  mở lại 診療入力, F8 lần hai, ESC = 登録 (btnEndEsc_Click :1104-1115) ⇒ về form nào
/// </code>
///
/// <para>Ghi DB: bệnh nhân test 990000+ (TRNTRN 2 dòng hôm nay, UNPAID/ACCDAT do F8/ESC ghi),
/// base xoá sạch cuối lượt. Chạy: <c>.\run-seisan.ps1 -Case SeisanFromTreatmentProbe -TrtDate yyyy-MM-dd(hôm nay)</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("seisan")]
public sealed class SeisanFromTreatmentProbeTests : SeededPatientTestBase
{
    private SeisanDb? _db;

    protected override string[] NuisanceDialogPatterns => [];

    // Tự mở 診療入力 trong testcase để chụp được ảnh khi mở hỏng (OneTimeSetUp của base thì không chụp).
    protected override bool NavigatesToTreatmentEntry => false;

    private void OpenEntry(int kq)
    {
        try { ReopenTreatmentScreen(); }
        catch
        {
            Kq(kq, $"mở 診療入力 hỏng: forms = [{SeisanNav.DescribeForms(App)}] {SeisanNav.DescribeDialogs(App)}");
            Snapshot($"kq{kq}-mo-203002-hong");
            throw;
        }
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(int n, string line) => Log($"=== KQ-{n} === {line}");

    private void Snapshot(string label)
    {
        try
        {
            var dir = Settings.Run.ScreenshotDir;
            var root = Path.IsPathRooted(dir) ? dir : Path.Combine(AppContext.BaseDirectory, dir);
            var path = ScreenCapture.CaptureToFile(root, $"seisan-g8_{label}_{DateTime.Now:HHmmss}");
            Log($"=== ANH === {label}: {path}");
        }
        catch (Exception e) { Log($"khong chup duoc man hinh ({label}): {e.Message}"); }
    }

    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
        if (SeededPatient is null) return;
        _db = SeisanDb.CreateOrNull(Settings);
        if (_db is null) return;

        var cols = _db.Rows(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TRNTRN' " +
                "AND COLUMNPROPERTY(OBJECT_ID('TRNTRN'), COLUMN_NAME, 'IsIdentity') = 0 ORDER BY ORDINAL_POSITION")
            .Select(r => r["COLUMN_NAME=".Length..])
            .ToList();
        // Bản clone có nhiều 枝番 (đo 2026-10-27: 枝番 5 後期高齢 hiệu lực hôm nay) ⇒ 「診療入力枝番確認」 chặn
        // mở màn. Giữ 枝番 1 (社保・本人) cho khớp bệnh nhân bên web.
        _db.Rows("DELETE FROM INSURANCE WHERE PAT_NO = @p AND PAT_BR > 1", SeededPatient.PatNo);
        var patBr = _db.FirstPatBr(SeededPatient.PatNo);
        foreach (var (disp, cd, pt, name) in new[] { (9101, 110, 59, "再診"), (9102, 209, 40, "処置-G8") })
        {
            var source = string.Join(", ", cols.Select(c => c.ToUpperInvariant() switch
            {
                "PAT_NO" => "@p",
                "PAT_BR" => patBr.ToString(),
                "DEL_FLG" => "0",
                "TRT_DT" => $"'{TrtDate:yyyy-MM-dd}'",
                "RAIIN_CNT" => "1",
                "DISP_NO" => disp.ToString(),
                "TRT_CD" => cd.ToString(),
                "TRT_SB" => "0",
                "TRT_CNT" => "1",
                "TRT_PT" => pt.ToString(),
                // Đồng bộ với seedTreatmentRows bên web (db.ts:661): price = trt_pt, dr_no 1, syosin_flg 3.
                // PRICE = 点数×回数 là nguồn của Get_AccUnit (modAcc.cs:856) — để 0 thì UNPAID.SCORE_D* đều 0.
                "PRICE" => pt.ToString(),
                "DR_NO" => "1",
                "SYOSIN_FLG" => "3",
                "ISL" or "JIHI_FLG" => "0",
                "DSP_TRT" => $"'{name}'",
                "DSP_BUI" or "DSP_DIS" => "''",
                var u when u.StartsWith("BUI") || u.StartsWith("DIS_CD") || u.StartsWith("DIS_SB") => "0",
                _ => $"[{c}]",
            }));
            _db.Rows($"INSERT INTO TRNTRN ({string.Join(", ", cols.Select(c => $"[{c}]"))}) " +
                     $"SELECT TOP 1 {source} FROM TRNTRN WHERE PAT_NO = {SeededPatient.TemplatePatNo} AND DEL_FLG = 0 " +
                     "ORDER BY TRT_DT DESC", SeededPatient.PatNo);
        }
        foreach (var r in _db.Rows("SELECT TRT_DT, DISP_NO, TRT_CD, TRT_PT, DSP_TRT, INSU_CD FROM TRNTRN WHERE PAT_NO = @p", SeededPatient.PatNo))
            Log("seed TRNTRN: " + r);
        foreach (var r in _db.Rows("SELECT i.PAT_BR, i.INS_KBN, i.OLD_FLG, i.BUR_RATE, i.ACC_RATE, m.FM_TYPE FROM INSURANCE i LEFT JOIN MEDINSINF m ON m.PAT_NO = i.PAT_NO AND m.MEDINSINF_NO = i.MEDINSINF_NO WHERE i.PAT_NO = @p", SeededPatient.PatNo))
            Log("bảo hiểm: " + r);
    }

    private void F8ToSeisan(int kq)
    {
        var flow = new AccountingDayFlow(App, Screen);
        var row = flow.RowForDay(TrtDate.Day) ?? throw new InvalidOperationException($"lưới không có dòng 日 {TrtDate.Day}");
        flow.FocusRow(row);
        Snapshot($"kq{kq}-203002");
        var walk = UnpaidCreationFlow.PressF8AndCreateUnpaid(App, Screen.Window);
        foreach (var s in walk.Trail) Kq(kq, $"F8 hộp: {s}");
        var seisan = Waits.TryFor(() => SeisanNav.Form(App, SeisanNav.Seisan), TimeSpan.FromSeconds(30));
        Kq(kq, $"sau F8: forms = [{SeisanNav.DescribeForms(App)}] — 204002 {(seisan is null ? "KHÔNG mở" : "mở")}");
        if (seisan is null) return;
        Thread.Sleep(1500);
        Snapshot($"kq{kq}-204002");
        foreach (var e in seisan.FindAllDescendants(cf => cf.ByControlType(FlaUI.Core.Definitions.ControlType.Edit)))
        {
            var v = Uia.ValueOf(e).Trim();
            if (v.Length > 0) Kq(kq, $"204002 ô {Uia.AutomationIdOf(e)} = 「{v}」");
        }
        foreach (var r in _db!.Rows("SELECT TRT_DT, TRT_CNT, KM_CD, SCORE, CLAIM_AMT, TAX, SFLG, SCORE_D1, SCORE_D9, SCORE_D10 FROM UNPAID WHERE PAT_NO = @p", SeededPatient!.PatNo))
            Kq(kq, "UNPAID: " + r);
    }

    private void ReportDestination(int kq, string what)
    {
        var closed = Waits.TryUntil(() => SeisanNav.Form(App, SeisanNav.Seisan) is null, TimeSpan.FromSeconds(20));
        Kq(kq, $"{what}: 204002 {(closed ? "đã đóng" : "VẪN MỞ sau 20s")}");
        foreach (var b in MsgBoxWin32.All(App.ProcessId))
            Kq(kq, $"{what}: hộp Win32 còn mở 「{b.Title}」 「{SeisanNav.OneLine(b.Text)}」");
        Thread.Sleep(1500);
        Kq(kq, $"{what}: forms = [{SeisanNav.DescribeForms(App)}]");
        foreach (var id in new[] { "frm203001", "frm203002", SeisanNav.Counter, SeisanNav.Seisan, "MainMenu", "frm204007" })
            if (SeisanNav.Form(App, id) is { } w) Kq(kq, $"{what}: đang hiện {id} 「{Uia.NameOf(w)}」");
        Snapshot($"kq{kq}-dich");
    }

    [Test, Order(1)]
    public void Kq8_9_F8RoiF10()
    {
        using var trace = TestTrace.Begin("SeisanG8_Kq8");
        try
        {
            OpenEntry(8);
            F8ToSeisan(8);
            var s = SeisanNav.Form(App, SeisanNav.Seisan) ?? throw new InvalidOperationException("204002 không mở");
            SeisanNav.Press(s, Vk.F10);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is not null)
            {
                Kq(9, $"F10 hộp 「{SeisanNav.OneLine(box.Text)}」 nút [{string.Join("|", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]");
                Kq(9, $"bấm OK = {MsgBoxWin32.ClickButton(box.Hwnd, "OK")}");
            }
            ReportDestination(9, "sau F10+OK");
        }
        catch (Exception e) { trace.Fail("Kq8", e); Kq(8, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(2)]
    public void Kq10_F8RoiEsc()
    {
        using var trace = TestTrace.Begin("SeisanG8_Kq10");
        try
        {
            OpenEntry(10);
            F8ToSeisan(10);
            var s = SeisanNav.Form(App, SeisanNav.Seisan) ?? throw new InvalidOperationException("204002 không mở");
            // 領収書印刷 「なし」: WinForm mặc định 「あり(領収書+明細書)」 ⇒ F9Proc in thật và có thể treo (lượt 14:50).
            if (Uia.ById(s, "rdoPrintOff") is { } off) { Uia.MouseClick(off); Kq(10, "chọn 領収書印刷 なし"); }
            else Kq(10, "không thấy rdoPrintOff");
            Uia.ForceForeground(s.Properties.NativeWindowHandle);
            Uia.SendKey(Vk.Escape);
            // ESC = F9Proc: Q00100/Q00001 ⇒ はい (đăng ký thật cho bệnh nhân test), rồi 予約登録 (nếu có) ⇒ F10.
            for (var i = 0; i < 4; i++)
            {
                var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6));
                if (box is null) break;
                Kq(10, $"ESC hộp 「{SeisanNav.OneLine(box.Text)}」 nút [{string.Join("|", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]");
                Snapshot($"kq10-hop-{i}");
                Kq(10, $"bấm = {MsgBoxWin32.ClickButton(box.Hwnd, "はい", "Yes", "OK")}");
                Thread.Sleep(800);
            }
            if (Waits.TryFor(() => SeisanNav.Form(App, "frm204007"), TimeSpan.FromSeconds(5)) is { } yoyaku)
            {
                // F10 của 予約 = 予約情報印刷 rồi Close (frm204007.cs:165-170) — đóng bằng × để khỏi in.
                Kq(10, "予約登録 (frm204007) hiện — đóng bằng ×");
                Snapshot("kq10-yoyaku");
                yoyaku.Close();
            }
            ReportDestination(10, "sau ESC 登録");
            foreach (var r in _db!.Rows("SELECT ACC_DT, KM_CD, SCORE, RECE_AMT FROM ACCDAT WHERE PAT_NO = @p", SeededPatient!.PatNo))
                Kq(10, "ACCDAT: " + r);
            Kq(10, $"UNPAID còn {_db.Rows("SELECT 1 AS X FROM UNPAID WHERE PAT_NO = @p", SeededPatient.PatNo).Count} dòng");
        }
        catch (Exception e) { trace.Fail("Kq10", e); Kq(10, "NGOẠI LỆ: " + e.Message); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // G9 — cặp web counter-payment-receipt-shift.spec.ts Q-1…Q-5. Chạy: -Case G9
    // ═════════════════════════════════════════════════════════════════════════

    private Window Seisan(int kq)
    {
        OpenEntry(kq);
        F8ToSeisan(kq);
        return SeisanNav.Form(App, SeisanNav.Seisan) ?? throw new InvalidOperationException("204002 không mở");
    }

    private void Leave(int kq, Window s)
    {
        SeisanNav.Press(s, Vk.F10);
        foreach (var d in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(6))) Kq(kq, $"rời 204002: {d}");
        Waits.TryUntil(() => SeisanNav.Form(App, SeisanNav.Seisan) is null, TimeSpan.FromSeconds(15));
    }

    private void ShiftKey(Window w, FlaUI.Core.WindowsAPI.VirtualKeyShort key)
    {
        Uia.ForceForeground(w.Properties.NativeWindowHandle);
        using (FlaUI.Core.Input.Keyboard.Pressing(FlaUI.Core.WindowsAPI.VirtualKeyShort.SHIFT)) FlaUI.Core.Input.Keyboard.Press(key);
    }

    /// <summary>Quirk Tc2h: quay về 204002 sau Shift+Fn thì nút Shift kẹt 「ON」 — click để gỡ.</summary>
    private static void Unstick(Window s)
    {
        if (Uia.ById(s, "btnShift") is { } b && Uia.NameOf(b) == "ON") { Uia.MouseClick(b); Thread.Sleep(500); }
    }

    private static string Val(Window s, string id) => Uia.ById(s, id) is { } e ? $"「{Uia.ValueOf(e)}」" : "(không thấy)";

    [Test, Order(11)]
    public void G9a_HokenshoMikakunin_Moshiokuri()
    {
        using var trace = TestTrace.Begin("SeisanG9_a");
        try
        {
            var p = SeededPatient!.PatNo;
            _db!.Rows("UPDATE INSURANCE SET CONF_DT1 = NULL, CONF_DT2 = NULL, CONF_DT3 = NULL, CONF_DT4 = NULL, CONF_DT5 = NULL, CONF_DT6 = NULL WHERE PAT_NO = @p", p);
            _db.Rows("DELETE FROM PATMSG WHERE PAT_NO = @p", p);
            _db.Rows($"INSERT INTO PATMSG (PAT_NO, MSG1, MSG2, MSG3, MSG4, MSG5, MSG6, MSG7, MSG8, MSG9, MSG10, UPDATE_DT) " +
                     $"VALUES (@p, N'申送り一', N'申送り二', N' ', '', '', '', '', '', '', '', '{TrtDate:yyyy-MM-dd}')", p);
            var s = Seisan(11);
            Kq(11, $"保険証確認 txtMsg = {Val(s, "txtMsg")}");
            if (Uia.ById(s, "lstInfo") is { } lst)
            {
                var items = lst.FindAllChildren(cf => cf.ByControlType(FlaUI.Core.Definitions.ControlType.ListItem));
                Kq(11, $"申し送り lstInfo hiện={Uia.IsOnScreen(lst)} · {items.Length} dòng: {string.Join(" / ", items.Select(i => $"「{i.Name}」"))}");
            }
            else Kq(11, "không thấy lstInfo");
            Snapshot("g9a-204002");
            Leave(11, s);
        }
        catch (Exception e) { trace.Fail("G9a", e); Kq(11, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(12)]
    public void G9b_HokenshoNgay_ShiftF6_ShiftF5()
    {
        using var trace = TestTrace.Begin("SeisanG9_b");
        try
        {
            _db!.Rows("UPDATE INSURANCE SET CONF_DT1 = '2026-10-01' WHERE PAT_NO = @p", SeededPatient!.PatNo);
            var s = Seisan(12);
            Kq(12, $"保険証確認 (CONF_DT1 2026-10-01) txtMsg = {Val(s, "txtMsg")}");

            // Q-5: gõ 本日入金 500 → Shift+F6 カルテ → F10 ⇒ 204002 còn 500 không?
            SeisanNav.TypeAndEnter(s, "txtRece", "500");
            Kq(12, $"sau gõ: txtRece = {Val(s, "txtRece")}");
            Snapshot("g9b-go-500");
            ShiftKey(s, FlaUI.Core.WindowsAPI.VirtualKeyShort.F6);
            var karte = Waits.TryFor(() => App.Window("frm205002"), TimeSpan.FromSeconds(30));
            Kq(12, $"Shift+F6: frm205002 {(karte is null ? "KHÔNG mở" : "mở")} · forms [{SeisanNav.DescribeForms(App)}]");
            if (karte is not null)
            {
                Snapshot("g9b-karte");
                Uia.ForceForeground(karte.Properties.NativeWindowHandle);
                Uia.SendKey(Vk.F10);
                foreach (var d in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(6))) Kq(12, $"カルテ F10: {d}");
            }
            s = Waits.TryFor(() => SeisanNav.Form(App, SeisanNav.Seisan), TimeSpan.FromSeconds(20))
                ?? throw new InvalidOperationException("không về 204002 sau カルテ F10 — " + SeisanNav.DescribeForms(App));
            foreach (var d in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3))) Kq(12, $"về 204002: {d}");
            Unstick(s);
            Kq(12, $"về 204002: txtRece = {Val(s, "txtRece")}");
            Snapshot("g9b-ve-204002");

            // Q-4: Shift+F5 患者登録 → F11 患者選択 ⇒ về đâu?
            ShiftKey(s, FlaUI.Core.WindowsAPI.VirtualKeyShort.F5);
            var pat = Waits.TryFor(() => App.Window("frm201001"), TimeSpan.FromSeconds(30));
            Kq(12, $"Shift+F5: frm201001 {(pat is null ? "KHÔNG mở" : "mở")} {(pat is not null && Uia.ById(pat, "lblPatNo") is { } l ? $"「{l.Name}」" : "")}");
            if (pat is null) return;
            Snapshot("g9b-pat");
            Uia.ForceForeground(pat.Properties.NativeWindowHandle);
            Uia.SendKey(Vk.F11);
            foreach (var d in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(6))) Kq(12, $"患者登録 F11: {d}");
            Thread.Sleep(2000);
            Kq(12, $"sau F11: forms [{SeisanNav.DescribeForms(App)}] · 204002 {(SeisanNav.Form(App, SeisanNav.Seisan) is null ? "không hiện" : "ĐANG hiện")} · " +
                   $"frm201008 {(SeisanNav.Form(App, "frm201008") is null ? "không" : "CÓ")}");
            Snapshot("g9b-sau-f11");
        }
        catch (Exception e) { trace.Fail("G9b", e); Kq(12, "NGOẠI LỆ: " + e.Message); }
    }
}
