using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>PROBE G2 — điều hướng + danh sách của 窓口精算. KHÔNG assert, không bao giờ ném.</b>
///
/// <code>
///  KQ-1  Lưới 未精算患者一覧: tiêu đề cột, dòng của bệnh nhân test (oracle getUnPaidPatInfo)
///  KQ-2  F8 khi chưa tick ⇒ E00021?
///  KQ-3  Tick dòng bệnh nhân test → F8 ⇒ Q00003 → Cancel (KHÔNG xoá)
///  KQ-4  患者番号 không tồn tại + F9 ⇒ E00005?
///  KQ-5  F1 患者検索: tìm theo カナ của bệnh nhân test; カナ vô nghĩa ⇒ E00003?
///  KQ-6  204002 → F11 患者選択 ⇒ Q00004 → OK ⇒ về 204001 ở chế độ nào?
///  KQ-7  204002 → F12 メニュー ⇒ Q00004 → Cancel ⇒ ở lại
///  KQ-8  Giữ Shift: nhãn lớp phím Shift (pnlShiftButton)
///  KQ-9  Shift+F5/F6/F7/F8 mở màn nào, F10 có quay về 204002 không
///  KQ-10 Số dòng UNPAID/ACCDAT/... trước = sau
/// </code>
///
/// <para>Ghi DB: chỉ bệnh nhân test 990000+ và 2 dòng UNPAID của nó (xoá cuối lượt).
/// Không F9 trên 204002, không ESC/End, Q00003 luôn trả Cancel.</para>
/// <para>Chạy: <c>.\run-seisan.ps1 -Case SeisanNavProbe</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("seisan")]
public sealed class SeisanNavProbeTests : SeededPatientTestBase
{
    private SeisanDb? _db;
    private Window? _current;
    private IReadOnlyDictionary<string, int> _countsBefore = new Dictionary<string, int>();

    protected override bool NavigatesToTreatmentEntry => false;
    protected override AutomationElement? UiaDumpRoot => _current;
    protected override string[] NuisanceDialogPatterns => [];

    private int TestPatNo => int.Parse(Settings.Patient.PatNo);

    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
        if (SeededPatient is null) return;
        _db = SeisanDb.CreateOrNull(Settings);
        if (_db is null) return;
        _db.SeedUnpaid(SeededPatient.PatNo, _db.FirstPatBr(SeededPatient.PatNo),
        [
            new SeisanDb.UnpaidSeed(TrtDate, KmCd: 40, Score: 300, ClaimAmt: 900, ScoreD1: 50, ScoreD9: 250),
            new SeisanDb.UnpaidSeed(TrtDate, KmCd: 50, Score: 0, ClaimAmt: 5000, Tax: 500),
        ]);
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(int n, string line) => Log($"=== KQ-{n} === {line}");

    [Test, Order(1)]
    public void Tc0a_LuoiChuaThanhToan()
    {
        using var trace = TestTrace.Begin("SeisanNav_Tc0a_Grid");
        try
        {
            if (_db is not null && SeededPatient is not null)
            {
                _countsBefore = _db.CountPatientRows(SeededPatient.PatNo);
                foreach (var r in _db.Rows(
                             "SELECT p.PAT_NO, p.PAT_SEX, p.PAT_BIRTH_DT, e.INS_DUE_BAL, e.OWN_DUE_BAL, e.OWN_DUE_EXC, " +
                             "e.GDS_DUE_BAL, e.GDS_DUE_EXC FROM PERSON p JOIN PERSON_EXP e ON e.PAT_NO = p.PAT_NO WHERE p.PAT_NO = @p",
                             SeededPatient.PatNo))
                    Kq(1, "oracle PERSON/PERSON_EXP: " + r);
                Kq(1, "số bệnh nhân có UNPAID: " + _db.Scalar("SELECT COUNT(DISTINCT PAT_NO) FROM UNPAID"));
            }

            trace.Step("mở 窓口精算");
            _current = SeisanNav.OpenCounter(App, Settings);
            Answer(1, "sau khi mở");
            var grid = new WinFormsGrid(Uia.RequireById(_current, "dgvView"));
            Kq(1, "tiêu đề cột: " + string.Join(" | ", grid.Headers()));
            var rows = grid.Rows(50);
            Kq(1, $"{rows.Count} dòng UIA thấy (F10: chỉ dòng đang hiện)");
            foreach (var row in rows.Take(8)) Kq(1, "  dòng: " + row);
            var mine = rows.FirstOrDefault(r => r.Cells.Any(c => c.Trim() == TestPatNo.ToString()));
            Kq(1, mine is null ? "KHÔNG thấy dòng bệnh nhân test" : $"dòng bệnh nhân test: {mine} — mô tả ô: {string.Join(" | ", mine.CellDescriptions)}");
            Kq(1, "thứ tự PAT_NO trên lưới: " + string.Join(",", rows.Select(r => r.Cells.FirstOrDefault(c => int.TryParse(c.Trim(), out _))?.Trim() ?? "?")));
        }
        catch (Exception e) { trace.Fail("Tc0a", e); Kq(1, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(2)]
    public void Tc0b_XoaChuaThanhToan()
    {
        using var trace = TestTrace.Begin("SeisanNav_Tc0b_F8");
        try
        {
            var w = Counter();
            if (w is null) return;
            trace.Step("F8 khi chưa tick");
            SeisanNav.Press(w, Vk.F8);
            Answer(2, "F8 chưa tick");

            var grid = new WinFormsGrid(Uia.RequireById(w, "dgvView"));
            var mine = grid.RowElements(50).FirstOrDefault(r => grid.Row(r).Cells.Any(c => c.Trim() == TestPatNo.ToString()));
            if (mine is null) { Kq(3, "BỎ QUA: không thấy dòng bệnh nhân test để tick"); return; }
            var cells = Uia.Children(mine).ToList();
            Kq(3, "các ô của dòng: " + string.Join(" | ", cells.Select(c => $"{Uia.ControlTypeOf(c)}:{Uia.NameOf(c)}={Uia.ValueOf(c)}")));
            var flgCell = cells.FirstOrDefault(c => Txt.Has(Uia.NameOf(c), "flg") || Uia.ControlTypeOf(c) == FlaUI.Core.Definitions.ControlType.CheckBox)
                          ?? cells.Skip(cells.Count > 9 ? 1 : 0).FirstOrDefault();
            if (flgCell is null) { Kq(3, "BỎ QUA: không tìm được ô checkbox"); return; }
            trace.Step("click ô checkbox của dòng bệnh nhân test");
            Uia.MouseClick(flgCell);
            Waits.Step();
            Thread.Sleep(500);
            Kq(3, $"sau click: ô = 「{Uia.ValueOf(flgCell)}」");

            trace.Step("F8 sau khi tick");
            SeisanNav.Press(w, Vk.F8);
            Answer(3, "F8 đã tick (luật: Cancel)");
            Kq(3, "UNPAID bệnh nhân test sau Cancel: " + _db?.Scalar($"SELECT COUNT(*) FROM UNPAID WHERE PAT_NO = {TestPatNo}"));

            trace.Step("bỏ tick");
            Uia.MouseClick(flgCell);
            Thread.Sleep(500);
            Kq(3, $"sau bỏ tick: ô = 「{Uia.ValueOf(flgCell)}」");
        }
        catch (Exception e) { trace.Fail("Tc0b", e); Kq(3, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(3)]
    public void Tc0c_BenhNhanKhongTonTai()
    {
        using var trace = TestTrace.Begin("SeisanNav_Tc0c_E00005");
        try
        {
            var w = Counter();
            if (w is null || _db is null) return;
            var missing = 989999;
            while (_db.Scalar($"SELECT COUNT(*) FROM PERSON WHERE PAT_NO = {missing}") != "0") missing--;
            Kq(4, $"患者番号 không tồn tại dùng để thử: {missing}");
            trace.Step($"gõ {missing} + F9");
            SeisanNav.EnterPatient(w, missing);
            Answer(4, "F9 với bệnh nhân không tồn tại");
            Kq(4, "form đang hiện: " + SeisanNav.DescribeForms(App));
            Kq(4, "cboPatNo sau đó: 「" + Uia.ValueOf(Uia.EditInside(Uia.RequireById(w, "cboPatNo"))) + "」");
            Uia.SetText(Uia.EditInside(Uia.RequireById(w, "cboPatNo")), "");
        }
        catch (Exception e) { trace.Fail("Tc0c", e); Kq(4, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(4)]
    public void Tc0d_TimBenhNhan()
    {
        using var trace = TestTrace.Begin("SeisanNav_Tc0d_Search");
        try
        {
            var w = Counter();
            if (w is null || _db is null) return;
            var kana = _db.Scalar($"SELECT TOP 1 PAT_KN FROM INSURANCE WHERE PAT_NO = {TestPatNo}") ?? "";
            Kq(5, $"カナ của bệnh nhân test: 「{kana}」");

            trace.Step("F1 → 患者検索");
            SeisanNav.Press(w, Vk.F1);
            Answer(5, "F1");
            var kn = Uia.RequireById(w, "txtPatKn");
            Kq(5, "ô điều kiện hiện: " + string.Join(", ",
                new[] { "txtPatKn", "cboPatSex", "dtPatBirthDt", "txtPatTel", "dtMedEdDt", "txtPatFoldNo", "txtPatTyp1", "txtPatTyp2", "btnSearch" }
                    .Select(id => $"{id}={(Uia.ById(w, id) is { } e && Uia.IsOnScreen(e) ? "hiện" : "ẩn")}")));

            trace.Step($"tìm カナ 「{kana}」");
            Uia.SetText(kn, kana);
            Uia.MouseClick(Uia.RequireById(w, "btnSearch"));
            Answer(5, "検索 theo カナ của bệnh nhân test");
            var grid = new WinFormsGrid(Uia.RequireById(w, "dgvView"));
            Kq(5, "tiêu đề cột: " + string.Join(" | ", grid.Headers()));
            foreach (var row in grid.Rows(10)) Kq(5, "  dòng: " + row);

            trace.Step("tìm カナ vô nghĩa");
            Uia.SetText(kn, "ﾝﾝﾝﾝﾝﾝ");
            Uia.MouseClick(Uia.RequireById(w, "btnSearch"));
            Answer(5, "検索 カナ vô nghĩa");
            Kq(5, $"số dòng sau tìm vô nghĩa: {grid.RowCount()}");
            Uia.SetText(kn, "");

            trace.Step("F1 → về 未精算患者");
            SeisanNav.Press(w, Vk.F1);
            Answer(5, "F1 về");
        }
        catch (Exception e) { trace.Fail("Tc0d", e); Kq(5, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(5)]
    public void Tc0e_F11VaF12()
    {
        using var trace = TestTrace.Begin("SeisanNav_Tc0e_F11F12");
        try
        {
            if (OpenSeisan(6, trace) is not { } s) return;
            trace.Step("F11 患者選択");
            SeisanNav.Press(s, Vk.F11);
            Answer(6, "F11 (luật: 「登録せずに」 ⇒ OK)");
            var c = Waits.TryFor(() => App.Window(SeisanNav.Counter), TimeSpan.FromSeconds(10));
            Kq(6, $"sau F11: [{SeisanNav.DescribeForms(App)}]");
            if (c is not null)
            {
                _current = c;
                var fk = string.Join(" ", Uia.Descendants(c, 6).Where(e => Uia.AutomationIdOf(e) is var id && id.StartsWith("btnF") && !id.EndsWith("_S") && Uia.IsOnScreen(e)).Select(Uia.NameOf));
                Kq(6, "phím F của 204001 sau F11: " + fk);
            }

            if (OpenSeisan(7, trace) is not { } s2) return;
            trace.Step("F12 メニュー — trả Cancel");
            SeisanNav.Press(s2, Vk.F12);
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null) { Kq(7, "F12: KHÔNG có hộp thoại. Form: " + SeisanNav.DescribeForms(App)); return; }
            Kq(7, $"F12 hộp thoại: 「{SeisanNav.OneLine(box.Text)}」 [{string.Join("|", MsgBoxWin32.ButtonCaptions(box.Hwnd))}]");
            MsgBoxWin32.ClickButton(box.Hwnd, "キャンセル", "Cancel");
            Thread.Sleep(800);
            Kq(7, "sau Cancel: " + SeisanNav.DescribeForms(App));
        }
        catch (Exception e) { trace.Fail("Tc0e", e); Kq(6, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(6)]
    public void Tc0f_LopPhimShift()
    {
        using var trace = TestTrace.Begin("SeisanNav_Tc0f_Shift");
        try
        {
            var s = App.Window(SeisanNav.Seisan) ?? OpenSeisan(8, trace);
            if (s is null) return;
            _current = s;
            Uia.ForceForeground(s.Properties.NativeWindowHandle);
            using (Keyboard.Pressing(VirtualKeyShort.SHIFT))
            {
                Thread.Sleep(700);
                var shiftKeys = Uia.Descendants(s, 6)
                    .Where(e => Uia.AutomationIdOf(e) is var id && id.StartsWith("btnF") && Uia.IsOnScreen(e))
                    .Select(e => $"{Uia.AutomationIdOf(e)}=「{Uia.NameOf(e)}」{(e.Properties.IsEnabled.ValueOrDefault ? "" : "(tắt)")}");
                Kq(8, "phím F khi giữ Shift: " + string.Join(" ", shiftKeys));
                trace.Shot("giu-shift");
            }
        }
        catch (Exception e) { trace.Fail("Tc0f", e); Kq(8, "NGOẠI LỆ: " + e.Message); }
    }

    [TestCase(VirtualKeyShort.F5, "患者登録"), Order(7)]
    [TestCase(VirtualKeyShort.F6, "カルテ")]
    [TestCase(VirtualKeyShort.F7, "処置")]
    [TestCase(VirtualKeyShort.F8, "口腔")]
    public void Tc0g_ShiftMoManKhac(VirtualKeyShort key, string label)
    {
        using var trace = TestTrace.Begin($"SeisanNav_Tc0g_Shift{key}");
        try
        {
            var s = App.Window(SeisanNav.Seisan) ?? OpenSeisan(9, trace);
            if (s is null || SeisanNav.ChildForms(s).Count > 0) { Kq(9, $"Shift+{key}: BỎ QUA — 204002 không đứng trên cùng: {SeisanNav.DescribeForms(App)}"); return; }
            _current = s;
            Uia.ForceForeground(s.Properties.NativeWindowHandle);
            trace.Step($"Shift+{key} ({label})");
            using (Keyboard.Pressing(VirtualKeyShort.SHIFT)) Keyboard.Press(key);
            Answer(9, $"Shift+{key}");
            Thread.Sleep(3000);
            Answer(9, $"Shift+{key} (đợt 2)");
            var other = App.Windows().Where(w => Uia.AutomationIdOf(w) != SeisanNav.Seisan).ToList();
            Kq(9, $"Shift+{key} {label}: form đang hiện [{SeisanNav.DescribeForms(App)}] — tiêu đề: " +
                  string.Join(" / ", other.Select(w => $"{Uia.AutomationIdOf(w)}「{Uia.NameOf(w)}」")));
            trace.Shot($"shift-{key}");

            var target = other.FirstOrDefault();
            if (target is null) return;
            _current = target;
            trace.Step($"F10 trên {Uia.AutomationIdOf(target)}");
            Uia.ForceForeground(target.Properties.NativeWindowHandle);
            Uia.SendKey(Vk.F10);
            Answer(9, $"F10 trên {Uia.AutomationIdOf(target)}");
            var back = Waits.TryFor(() => App.Window(SeisanNav.Seisan), TimeSpan.FromSeconds(20));
            Kq(9, $"sau F10: [{SeisanNav.DescribeForms(App)}] — {(back is null ? "KHÔNG về 204002" : "về 204002")}");
            if (back is not null) _current = back;
        }
        catch (Exception e) { trace.Fail($"Shift{key}", e); Kq(9, "NGOẠI LỆ: " + e.Message); }
    }

    [Test, Order(8)]
    public void Tc0z_KhongGhiGi()
    {
        try
        {
            // Rời 204002 không lưu (F10 → Q00004 OK) để lượt sau không bám vào màn dở.
            if (App.Window(SeisanNav.Seisan) is { } s && SeisanNav.ChildForms(s).Count == 0)
            {
                SeisanNav.Press(s, Vk.F10);
                foreach (var a in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(5))) Kq(10, "rời 204002: " + a);
            }
            if (_db is null || SeededPatient is null) { Kq(10, "BỎ QUA: không có DB"); return; }
            var after = _db.CountPatientRows(SeededPatient.PatNo);
            Kq(10, "SAU: " + string.Join(", ", after.Select(kv => $"{kv.Key}={kv.Value}")));
            var changed = after.Where(kv => _countsBefore.TryGetValue(kv.Key, out var b) && b != kv.Value)
                               .Select(kv => $"{kv.Key} {_countsBefore[kv.Key]}→{kv.Value}").ToList();
            Kq(10, changed.Count == 0 ? "KHÔNG đổi — probe không ghi gì" : "⚠ ĐÃ ĐỔI: " + string.Join(", ", changed));
        }
        catch (Exception e) { Kq(10, "NGOẠI LỆ: " + e.Message); }
    }

    // ─────────────────────────────────────────────────────────────────────────

    private Window? Counter()
    {
        var w = App.Window(SeisanNav.Counter);
        if (w is null) Log("BỎ QUA bước: không đứng ở 204001 — " + SeisanNav.DescribeForms(App) + " " + SeisanNav.DescribeDialogs(App));
        else _current = w;
        return w;
    }

    private Window? OpenSeisan(int kq, TestTrace trace)
    {
        var c = App.Window(SeisanNav.Counter) ?? SeisanNav.OpenCounter(App, Settings);
        _current = c;
        trace.Step($"mở 204002 cho {TestPatNo}");
        SeisanNav.EnterPatient(c, TestPatNo);
        Answer(kq, "mở 204002");
        var s = Waits.TryFor(() => App.Window(SeisanNav.Seisan), TimeSpan.FromSeconds(20));
        if (s is null) Kq(kq, "KHÔNG mở được 204002: " + SeisanNav.DescribeForms(App));
        else _current = s;
        return s;
    }

    private void Answer(int kq, string when)
    {
        foreach (var a in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(5))) Kq(kq, $"hộp thoại {when}: {a}");
    }
}
