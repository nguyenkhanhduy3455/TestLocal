using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.PatientRegistration;

/// <summary>
/// PROBE — 患者登録 (<c>frm201001</c>): đo phía WinForm cho những chỗ spec web
/// <c>web-tenant-tests/tests/patient-select/patient-registration-*.spec.ts</c> còn ĐỌC SOURCE
/// mà chưa đo. Không assert (F1): mỗi bước chụp ảnh, ghi nguyên văn hộp thoại + nút + nút
/// mặc định, in <c>=== KQ-xx ===</c>.
///
/// <code>
///   Lô A (-Case PrA)  編集: Shift+F6/F9 khi chưa sửa · Shift+F6 khi đã sửa · F12 · F10→はい
///   Lô B (-Case PrB)  編集: 削除 1 tab · Q00200 · nhãn tab · hỏi copy · 削除 tab đã lưu khi
///                     có NEW · 担当医 trống · F8 có 処置
///   Lô C (-Case PrC)  新規: F10 khi chưa sửa · lớp Shift · F7→F10 · F1 コピー → 担当医
/// </code>
///
/// <para>GHI DB: một bệnh nhân test (clone từ <see cref="TemplatePatNo"/>), xoá ở
/// OneTimeTearDown. Chỉ KQ-A5 bấm 「はい」 (lưu số điện thoại của chính bệnh nhân test). Ở
/// 新規 KHÔNG BAO GIỜ trả lời はい/OK cho câu hỏi lưu/đăng ký.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("patient-registration")]
[CancelAfter(840_000)]
public sealed class PatientRegistrationProbeTests : SeededPatientTestBase
{
    /// <summary>社保 本人, 30%, 1981 — một 枝番, không 公費 ⇒ chuỗi F9 ít hộp thoại nhất.</summary>
    private const int TemplatePatNo = 11515;

    private const string PatEntryId = "frm201001";
    private const string PatSelectId = "frm203001";
    private const string PatListId = "frm201008";
    private const string Tel = "099-0000-0901";
    /// <summary>
    /// Gõ vào 紹介者 (<c>txtRefeNm</c>, OtherInfo — MỘT bản cho cả form). 電話番号 nằm trong
    /// từng tab 枝番 nên có nhiều <c>txtTel1</c>; lượt 10:22 click trúng bản ẩn, phím không vào.
    /// </summary>
    private const string TypedRefe = "テスト紹介";

    private PatientRegistrationDb? _db;

    protected override bool NavigatesToTreatmentEntry => false;

    protected override string[] NuisanceDialogPatterns => [];

    protected override string? SeededFixtureSkipReason() =>
        Settings.TestPatient.TemplatePatNo == TemplatePatNo
            ? null
            : $"Cần OCHA_TEST_PATIENT_TEMPLATE={TemplatePatNo} (run-register-patient.ps1 đặt sẵn).";

    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
        if (SeededPatient is null) return;
        _db = PatientRegistrationDb.CreateOrNull(Settings, SeededPatient.PatNo);
        _db?.Normalize(Tel);
        Log($"bệnh nhân test sau chuẩn hoá: {_db?.Describe()}");
    }

    /// <summary>
    /// Không dựng được bệnh nhân test ⇒ DỪNG cả fixture. Lượt 10:15 base bỏ qua việc
    /// dựng (DB không tới được) và probe chạy thẳng trên bệnh nhân THẬT số 4.
    /// </summary>
    [OneTimeSetUp]
    public void RequireSeededPatient()
    {
        if (SeededPatient is null || _db is null || PatNo < TestPatientDb.TestPatNoBase)
            Assert.Fail($"KHÔNG dựng được bệnh nhân test (PatNo hiện là {PatNo}) — dừng, không đụng bệnh nhân thật.");
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string no, string line) => Log($"=== KQ-{no} === {line}");

    // ═════════════════════════════════════════════════════════════════════════
    // Lô A — 編集, câu hỏi lưu
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    public void PrA1_ShiftF6_ChuaSua() => Probe("A1", "Shift+F6 カルテ khi CHƯA sửa", t =>
    {
        var w = OpenEdit(t);
        PressShift(t, w, "btnF6_S", "カルテ");
        Dialogs("A1", t, SaveCancel);
        Kq("A1", $"sau cùng: {Where()}");
    });

    [Test, Order(2)]
    public void PrA2_ShiftF9_ChuaSua() => Probe("A2", "Shift+F9 会計 khi CHƯA sửa", t =>
    {
        var w = OpenEdit(t);
        PressShift(t, w, "btnF9_S", "会計");
        Dialogs("A2", t, SaveCancel);
        Kq("A2", $"sau cùng: {Where()}");
    });

    [Test, Order(3)]
    public void PrA3_ShiftF6_DaSua() => Probe("A3", "Shift+F6 khi ĐÃ sửa 紹介者", t =>
    {
        var w = OpenEdit(t);
        TypeInto(t, w, "txtRefeNm", TypedRefe);
        PressShift(t, w, "btnF6_S", "カルテ");
        Dialogs("A3", t, SaveCancel);
        Kq("A3", $"sau cùng: {Where()}");
    });

    [Test, Order(4)]
    public void PrA4_F12_DaSua() => Probe("A4", "F12 メニュー khi ĐÃ sửa (tiếp A3)", t =>
    {
        var w = Entry() ?? OpenEdit(t);
        ShiftOff(w);
        Bar(t, w, "btnF12", "メニュー");
        Kq("A4", $"ngay sau F12 (trước khi trả lời): {Where()}");
        Dialogs("A4", t, SaveCancel);
        Kq("A4", $"sau cùng: {Where()}");
    });

    [Test, Order(5)]
    public void PrA5_F10_DaSua_Hai() => Probe("A5", "F10 khi ĐÃ sửa → はい: có hỏi lần hai không?", t =>
    {
        var w = Entry() ?? OpenEdit(t);
        ShiftOff(w);
        Bar(t, w, "btnF10", "戻る");
        var first = true;
        Dialogs("A5", t, d =>
        {
            if (Txt.Has(d.Raw, "保存しますか"))
            {
                if (first) { first = false; return ["はい", "Yes"]; }
                Kq("A5", "⚠ HỎI LƯU LẦN HAI: " + Txt.Vis(d.Raw));
                return ["いいえ", "No"];
            }
            return ["OK", "はい", "Yes"];
        });
        Kq("A5", $"sau cùng: {Where()} · DB: {_db?.Describe()}");
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Lô B — 編集, tab / 削除 / 担当医 / F8
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(11)]
    public void PrB1_Xoa1Tab() => Probe("B1", "削除 khi chỉ có MỘT tab", t =>
    {
        _db?.DropBranch2();
        var w = OpenEdit(t);
        Kq("B1", "tab: " + string.Join(" / ", TabNames(w)));
        Click(t, w, "btnDel", "削除");
        Dialogs("B1", t, d => ["OK", "はい", "Yes"]);
        CloseNoSave(t);
    });

    [Test, Order(12)]
    public void PrB2_Q00200() => Probe("B2", "F9 với 負担割合 = 0 → Q00200", t =>
    {
        _db?.SetBurRate(0);
        try
        {
            var w = OpenEdit(t);
            Bar(t, w, "btnF9", "登録");
            Dialogs("B2", t, d => ["キャンセル", "Cancel", "いいえ", "No", "OK"]);
            CloseNoSave(t);
        }
        finally { _db?.SetBurRate(30); }
    });

    [Test, Order(13)]
    public void PrB3_NhanTab_HoiCopy() => Probe("B3", "nhãn tab với 2 枝番 + câu hỏi copy của 追加", t =>
    {
        _db?.AddBranch2(new DateTime(2010, 1, 1));
        Log("DB: " + _db?.Describe());
        var w = OpenEdit(t);
        Kq("B3", "tab: " + string.Join(" / ", TabNames(w).Select(n => $"「{n}」")));
        Click(t, w, "btnAdd", "追加");
        Dialogs("B3", t, d => ["いいえ", "No"]);
        Kq("B3", "tab sau 追加→いいえ: " + string.Join(" / ", TabNames(w).Select(n => $"「{n}」")));
        CloseNoSave(t);
    });

    [Test, Order(14)]
    public void PrB4_XoaTabDaLuu_KhiCoNew() => Probe("B4", "1 枝番 đã lưu + NEW: 削除 tab ĐÃ LƯU", t =>
    {
        _db?.DropBranch2();
        var w = OpenEdit(t);
        Click(t, w, "btnAdd", "追加");
        Dialogs("B4", t, d => ["いいえ", "No"]);
        var names = TabNames(w);
        Kq("B4", "tab: " + string.Join(" / ", names.Select(n => $"「{n}」")));
        var saved = Tabs(w).FirstOrDefault(i => Txt.N(i.Name).StartsWith("1"));
        if (saved is null) { Kq("B4", "không thấy tab 枝番 1"); return; }
        t.Step("chon tab da luu " + Txt.N(saved.Name));
        Uia.MouseClick(saved);
        Waits.Step();
        Click(t, w, "btnDel", "削除");
        Dialogs("B4", t, d => ["キャンセル", "Cancel", "OK"]);
        Kq("B4", "tab sau cùng: " + string.Join(" / ", TabNames(w).Select(n => $"「{n}」")));
        CloseNoSave(t);
    });

    [Test, Order(15)]
    public void PrB5_DamTrong() => Probe("B5", "担当医 trống (ATT_DR 0) rồi F10", t =>
    {
        _db?.SetAttDr(0);
        try
        {
            var w = OpenEdit(t);
            var dr = Visible(w, "cboDr");
            Kq("B5", $"担当医 hiển thị: 「{(dr is null ? "(không thấy cboDr)" : Txt.N(Uia.ValueOf(dr)))}」");
            t.Shot("B5_dantoui");
            Bar(t, w, "btnF10", "戻る");
            var seen = Dialogs("B5", t, d => ["いいえ", "No", "キャンセル", "Cancel"]);
            Kq("B5", seen == 0 ? "F10 KHÔNG hỏi gì" : $"F10 bung {seen} hộp thoại");
            Kq("B5", $"sau cùng: {Where()} · DB: {_db?.Describe()}");
        }
        finally { _db?.SetAttDr(1); }
    });

    [Test, Order(16)]
    public void PrB6_F8_CoXuLy() => Probe("B6", "F8 khi có 処置 (TRNTRN)", t =>
    {
        var n = _db?.SeedOneTrntrn(TemplatePatNo) ?? 0;
        Log($"seed TRNTRN: {n} dòng · DB: {_db?.Describe()}");
        var w = OpenEdit(t);
        Bar(t, w, "btnF8", "削除");
        Dialogs("B6", t, d => ["OK", "キャンセル", "Cancel"]);
        CloseNoSave(t);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Lô C — 新規 (frm201008 「F1 新患」)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(21)]
    public void PrC1_New_F10_ChuaSua() => Probe("C1", "新規: lớp Shift + F10 khi CHƯA sửa", t =>
    {
        var w = OpenNew(t, "C1");
        Kq("C1", "nút thường: " + ButtonStates(w, "btnF1", "btnF2", "btnF5", "btnF6", "btnF7", "btnF8", "btnF9"));
        ShiftOn(t, w);
        Kq("C1", "nút Shift: " + ButtonStates(w, "btnF1_S", "btnF2_S", "btnF3_S", "btnF6_S", "btnF7_S", "btnF8_S", "btnF9_S"));
        t.Shot("C1_shift_layer");
        ShiftOff(w);
        Bar(t, w, "btnF10", "戻る");
        var seen = Dialogs("C1", t, NewNever);
        Kq("C1", seen == 0 ? "F10 KHÔNG hỏi gì" : $"F10 bung {seen} hộp thoại");
        Kq("C1", $"sau cùng: {Where()}");
    });

    [Test, Order(22)]
    public void PrC2_New_ShiftF9_F6() => Probe("C2", "新規: Shift+F9 rồi Shift+F6 (form trống)", t =>
    {
        var w = OpenNew(t, "C2");
        PressShift(t, w, "btnF9_S", "会計");
        Kq("C2", $"Shift+F9: {Dialogs("C2", t, NewNever)} hộp thoại · {Where()}");
        w = Entry() ?? throw new InvalidOperationException("mất frm201001 sau Shift+F9 — " + Where());
        PressShift(t, w, "btnF6_S", "カルテ");
        Kq("C2", $"Shift+F6: {Dialogs("C2", t, NewNever)} hộp thoại · {Where()}");
        if (Entry() is { } still) { ShiftOff(still); CloseNoSave(t); }
    });

    [Test, Order(23)]
    public void PrC3_New_F7_F10() => Probe("C3", "新規: gõ 氏名 → F7 介護保険 → F10 quay về", t =>
    {
        var w = OpenNew(t, "C3");
        var before = PatNoLabel(w);
        TypeInto(t, w, "txtName", "テスト　カイゴ");
        Keyboard.Press(VirtualKeyShort.TAB);
        Waits.Step();
        Dialogs("C3", t, NewNever);
        AutomationElement? care = null;
        for (var i = 1; i <= 2 && care is null; i++)
        {
            Bar(t, w, "btnF7", "介護保険");
            Dialogs("C3", t, NewNever);
            care = Waits.TryFor(() => App.Windows().FirstOrDefault(x => Uia.AutomationIdOf(x) != PatEntryId &&
                                                                       Uia.AutomationIdOf(x) != PatListId),
                                TimeSpan.FromSeconds(8));
            Kq("C3", $"F7 lần {i}: {Where()}");
        }
        Kq("C3", $"sau F7: {Where()}");
        if (care is null) return;
        t.Shot("C3_kaigo");
        Bar(t, care, "btnF10", "戻る");
        var seen = Dialogs("C3", t, NewNever);
        var back = Waits.TryFor(Entry, TimeSpan.FromSeconds(15));
        Kq("C3", $"F10 ở 介護保険: {seen} hộp thoại · {Where()}");
        if (back is null) return;
        t.Shot("C3_back");
        Kq("C3", $"患者番号 trước 「{before}」 / sau 「{PatNoLabel(back)}」 · OQS/Q00037 hiện lại: " +
                 (App.Window("frm201041") is null ? "không" : "CÓ (frm201041)"));
        CloseNoSave(t);
    });

    [Test, Order(24)]
    public void PrC4_New_Copy_DamTrong() => Probe("C4", "新規: F1 コピー từ bệnh nhân test → 担当医", t =>
    {
        var w = OpenNew(t, "C4");
        Bar(t, w, "btnF1", "コピー");
        var copy = Waits.TryFor(() => Form("frm201009"), TimeSpan.FromSeconds(10));
        if (copy is null) { Kq("C4", "frm201009 không mở — " + Where()); return; }
        Dump("C4", copy);
        TypeInto(t, copy, "txtPatTel", Tel);
        Keyboard.Press(VirtualKeyShort.ENTER);
        Waits.Step();
        var search = copy.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                         .FirstOrDefault(b => Txt.Has(Uia.NameOf(b), "検索"));
        if (search is not null) { t.Step("bam 検索"); Uia.MouseClick(search); Waits.Step(); }
        Dialogs("C4", t, d => ["OK"]);
        t.Shot("C4_ket_qua_tim");
        Bar(t, copy, "btnF9", "選択");
        Dialogs("C4", t, d => ["OK"]);
        w = Waits.TryFor(Entry, TimeSpan.FromSeconds(10)) ?? w;
        var dr = Visible(w, "cboDr");
        var st = Visible(w, "cboSt");
        Kq("C4", $"sau コピー: 担当医 「{(dr is null ? "?" : Txt.N(Uia.ValueOf(dr)))}」 " +
                 $"衛生士 「{(st is null ? "?" : Txt.N(Uia.ValueOf(st)))}」");
        t.Shot("C4_sau_copy");
        CloseNoSave(t);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Lô D — 編集, hộp con (cặp web patient-registration-subdialogs.spec.ts P-1…P-12)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(31)]
    public void PrD1_F5_ShuSo() => Probe("D1", "F5 主訴: nhãn, chọn mục → F9 lưu gì, ESC", t =>
    {
        _db!.SetupSubdialogs(TemplatePatNo);
        var w = OpenEdit(t);
        Bar(t, w, "btnF5", "主訴");
        var d = Waits.TryFor(() => Form("frm201004"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("D1", "frm201004 không mở — " + Where()); return; }
        t.Shot("D1_mo");
        Kq("D1", $"nhãn: {Labels(d)}");
        var cbo = Uia.ById(d, "cboPatCc1") ?? throw new InvalidOperationException("không thấy cboPatCc1");
        var combo = cbo.AsComboBox();
        Kq("D1", $"cboPatCc1 items[0..3]: {string.Join(" / ", combo.Items.Take(4).Select(i => $"「{Txt.N(i.Name)}」"))}");
        combo.Select(1);
        Waits.Step();
        Kq("D1", $"sau chọn mục 1: cboPatCc1 hiện 「{Txt.N(Uia.ValueOf(cbo))}」");
        t.Shot("D1_chon");
        Bar(t, d, "btnF9", "登録");
        Dialogs("D1", t, _ => ["OK"]);
        Waits.TryUntil(() => Form("frm201004") is null, TimeSpan.FromSeconds(10));
        Kq("D1", $"F9 xong: PERSON.PAT_CC1 = 「{_db.Scalar("SELECT PAT_CC1 FROM PERSON WHERE PAT_NO = @p")}」 · {Where()}");

        // ESC = F9 (BaseDialog.cs:320-325)?
        Bar(t, w, "btnF5", "主訴");
        d = Waits.TryFor(() => Form("frm201004"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("D1", "mở lại frm201004 không được — " + Where()); return; }
        TypeInto(t, d, "cboPatCc3", "ESC主訴");
        Keyboard.Press(VirtualKeyShort.ESCAPE);
        Waits.Step();
        Dialogs("D1", t, _ => ["OK"]);
        var closed = Waits.TryUntil(() => Form("frm201004") is null, TimeSpan.FromSeconds(5));
        Kq("D1", $"ESC: hộp đóng={closed} · PAT_CC3 = 「{_db.Scalar("SELECT PAT_CC3 FROM PERSON WHERE PAT_NO = @p")}」");
        if (Form("frm201004") is { } still) Bar(t, still, "btnF10", "戻る");
        CloseNoSave(t);
    });

    [Test, Order(32)]
    public void PrD2_F6_KaikeiJoho() => Probe("D2", "F6 会計情報: nhãn + gõ 12 chữ số", t =>
    {
        var w = OpenEdit(t);
        Bar(t, w, "btnF6", "会計情報");
        var d = Waits.TryFor(() => Form("frm201005"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("D2", "frm201005 không mở — " + Where()); return; }
        Kq("D2", $"nhãn: {Labels(d)}");
        var box = Uia.ById(d, "txtOwnTotal") ?? throw new InvalidOperationException("không thấy txtOwnTotal");
        var (x, y) = Uia.Center(box);
        Uia.LeftClickPhysical(x, y);
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Keyboard.Type("123456789012");
        Waits.Step();
        Kq("D2", $"自由診療累計 sau khi gõ 123456789012: 「{Txt.N(Uia.ValueOf(box))}」");
        Keyboard.Type("ab");
        Kq("D2", $"gõ thêm 'ab': 「{Txt.N(Uia.ValueOf(box))}」");
        t.Shot("D2_go");
        Bar(t, d, "btnF10", "戻る");
        Dialogs("D2", t, _ => ["いいえ", "No", "OK"]);
        CloseNoSave(t);
    });

    [Test, Order(33)]
    public void PrD3_ShiftF1_ShinryoKaishi() => Probe("D3", "Shift+F1 診療開始日: lưới + F1 保存 không sửa", t =>
    {
        _db!.SetupSubdialogs(TemplatePatNo);
        var w = OpenEdit(t);
        PressShift(t, w, "btnF1_S", "診療開始日");
        var d = Waits.TryFor(() => Form("frm201011"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("D3", "frm201011 không mở — " + Where()); return; }
        t.Shot("D3_mo");
        Kq("D3", $"患者番号 「{Txt.N(Uia.ValueOf(Uia.ById(d, "txtPatNo")!))}」 · lưới: {GridDump(d)}");
        Kq("D3", $"trước F1: INSURANCE MED_ST/ED = {_db.Scalar("SELECT CONVERT(varchar(10), MED_ST_DT, 23) + ' / ' + ISNULL(CONVERT(varchar(10), MED_ED_DT, 23), '(null)') FROM INSURANCE WHERE PAT_NO = @p AND PAT_BR = 1")}");
        Bar(t, d, "btnF1", "保存");
        Dialogs("D3", t, _ => ["OK", "はい", "Yes"]);
        Waits.TryUntil(() => Form("frm201011") is null, TimeSpan.FromSeconds(10));
        Kq("D3", $"sau F1 (không sửa dòng nào): INSURANCE MED_ST/ED = {_db.Scalar("SELECT CONVERT(varchar(10), MED_ST_DT, 23) + ' / ' + ISNULL(CONVERT(varchar(10), MED_ED_DT, 23), '(null)') FROM INSURANCE WHERE PAT_NO = @p AND PAT_BR = 1")} · {Where()}");
        if (Entry() is { } e) ShiftOff(e);
        CloseNoSave(t);
    });

    [Test, Order(34)]
    public void PrD4_ShiftF2_Henko() => Probe("D4", "Shift+F2 変更: ngày sai → F9", t =>
    {
        var w = OpenEdit(t);
        PressShift(t, w, "btnF2_S", "変更");
        var d = Waits.TryFor(() => Form("frm201013"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("D4", "frm201013 không mở — " + Where()); return; }
        Dump("D4", d);
        t.Shot("D4_mo");
        var dt = Uia.ById(d, "dtBirth") ?? throw new InvalidOperationException("không thấy dtBirth");
        var edits = dt.FindAllDescendants(cf => cf.ByControlType(ControlType.Edit));
        Kq("D4", $"dtBirth có {edits.Length} ô: {string.Join(" / ", edits.Select(e => $"{Uia.AutomationIdOf(e)}=「{Txt.N(Uia.ValueOf(e))}」"))}");
        var day = edits.LastOrDefault() ?? dt;
        var (x, y) = Uia.Center(day);
        Uia.LeftClickPhysical(x, y);
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Keyboard.Type("32");
        Keyboard.Press(VirtualKeyShort.TAB);
        Waits.Step();
        Kq("D4", $"sau gõ 日=32: {string.Join(" / ", edits.Select(e => $"「{Txt.N(Uia.ValueOf(e))}」"))}");
        t.Shot("D4_go");
        Bar(t, d, "btnF9", "確定");
        Dialogs("D4", t, _ => ["OK"]);
        Kq("D4", $"sau F9: {Where()}");
        if (Form("frm201013") is { } still) Bar(t, still, "btnF10", "戻る");
        if (Entry() is { } e) ShiftOff(e);
        CloseNoSave(t);
    });

    [Test, Order(35)]
    public void PrD5_ShiftF3_Scanner() => Probe("D5", "Shift+F3 スキャナ取込: bật/tắt, nhãn trang, F8 khi chưa tick", t =>
    {
        var w = OpenEdit(t);
        ShiftOn(t, w);
        Kq("D5", ButtonStates(w, "btnF3_S", "btnF4_S", "btnF2"));
        var b = Uia.ById(w, "btnF3_S");
        if (b is null || !SafeEnabled(b)) { Kq("D5", "Shift+F3 TẮT (TwainInfo.ScannerSetting = false) — không đo được"); ShiftOff(w); CloseNoSave(t); return; }
        Click(t, w, "btnF3_S", "スキャナ取込");
        Dialogs("D5", t, _ => ["OK"]);
        var d = Waits.TryFor(() => Form("frm201012"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("D5", "frm201012 không mở — " + Where()); ShiftOff(w); CloseNoSave(t); return; }
        t.Shot("D5_mo");
        Kq("D5", $"lblPageG = 「{(Uia.ById(d, "lblPageG") is { } l ? Txt.N(l.Name) : "?")}」");
        Bar(t, d, "btnF8", "削除");
        var n = Dialogs("D5", t, _ => ["いいえ", "No", "キャンセル", "Cancel", "OK"]);
        Kq("D5", $"F8 khi chưa tick: {n} hộp thoại");
        Bar(t, d, "btnF10", "戻る");
        if (Entry() is { } e) ShiftOff(e);
        CloseNoSave(t);
    });

    [Test, Order(36)]
    public void PrD6_ShiftF4_Fukushi() => Probe("D6", "Shift+F4 福祉医療: thứ tự lưới mặc định", t =>
    {
        var w = OpenEdit(t);
        PressShift(t, w, "btnF4_S", "福祉医療");
        var d = Waits.TryFor(() => Form("frm506006"), TimeSpan.FromSeconds(15));
        if (d is null) { Kq("D6", "frm506006 không mở — " + Where()); return; }
        Waits.Step();
        t.Shot("D6_mo");
        Kq("D6", $"lưới (5 dòng đầu): {GridDump(d, 6)}");
        Bar(t, d, "btnF10", "戻る");
        if (Entry() is { } e) ShiftOff(e);
        CloseNoSave(t);
    });

    [Test, Order(37)]
    public void PrD7_F2_Shikaku() => Probe("D7", "F2 資格確認 ở 編集: 記号 + F10", t =>
    {
        _db!.SetupSubdialogs(TemplatePatNo);
        var w = OpenEdit(t);
        Kq("D7", ButtonStates(w, "btnF2"));
        Bar(t, w, "btnF2", "資格確認");
        // Máy test thiếu thư mục face ⇒ có thể bung システムエラー trước (xem OpenNew).
        Dialogs("D7", t, _ => ["OK"]);
        var d = Waits.TryFor(() => Form("frm201041"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("D7", "frm201041 không mở — " + Where()); CloseNoSave(t); return; }
        t.Shot("D7_mo");
        string V(string id) => Uia.ById(d, id) is { } e ? $"「{Txt.N(Uia.ValueOf(e))}」" : "?";
        Kq("D7", $"保険者番号 {V("txtInsurerNumber")} 記号 {V("cboInsuredCardSymbol")} 番号 {V("txtInsuredIdentificationNumber")} " +
                 $"開示 {V("cboLimitApplicationCertificateRelatedConsFlg")} · nhãn {Labels(d)}");
        Bar(t, d, "btnF10", "戻る");
        var n = Dialogs("D7", t, _ => ["いいえ", "No", "OK"]);
        Kq("D7", $"F10: {n} hộp thoại · {Where()}");
        CloseNoSave(t);
    });

    // Lô E — đo lại D1/D2/D4 (lượt 16:4x: Select(1) không đổi chữ, gõ không vào ô, gõ nhầm ô năm).

    [Test, Order(41)]
    public void PrE1_F5_ChonMuc() => Probe("E1", "F5 主訴: chọn mục bằng phím ↓ → F9 lưu gì; nhãn nguyên văn", t =>
    {
        _db!.SetupSubdialogs(TemplatePatNo);
        var w = OpenEdit(t);
        Bar(t, w, "btnF5", "主訴");
        var d = Waits.TryFor(() => Form("frm201004"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("E1", "frm201004 không mở — " + Where()); return; }
        Kq("E1", "nhãn NGUYÊN VĂN: " + string.Join(" ", d.FindAllDescendants(cf => cf.ByControlType(ControlType.Text))
            .Select(e => e.Name).Where(s => s.StartsWith("主訴")).Select(s => $"「{s}」(U+{(int)s[^1]:X4})")));
        var cbo = Uia.ById(d, "cboPatCc1") ?? throw new InvalidOperationException("không thấy cboPatCc1");
        Uia.ForceForeground(d.Properties.NativeWindowHandle);
        var (x, y) = Uia.Center(cbo);
        Uia.LeftClickPhysical(x - 20, y);
        Thread.Sleep(200);
        Keyboard.Press(VirtualKeyShort.DOWN);
        Waits.Step();
        Kq("E1", $"sau ↓: cboPatCc1 value 「{Uia.ValueOf(cbo)}」 name 「{cbo.Name}」");
        t.Shot("E1_chon");
        Bar(t, d, "btnF9", "登録");
        Dialogs("E1", t, _ => ["OK"]);
        Waits.TryUntil(() => Form("frm201004") is null, TimeSpan.FromSeconds(10));
        Kq("E1", $"F9 xong: PERSON.PAT_CC1 = 「{_db.Scalar("SELECT PAT_CC1 FROM PERSON WHERE PAT_NO = @p")}」");
        CloseNoSave(t);
    });

    [Test, Order(42)]
    public void PrE2_F6_MaxLength() => Probe("E2", "F6 会計情報: gõ 12 chữ số, gõ chữ", t =>
    {
        var w = OpenEdit(t);
        Bar(t, w, "btnF6", "会計情報");
        var d = Waits.TryFor(() => Form("frm201005"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("E2", "frm201005 không mở — " + Where()); return; }
        var box = Uia.ById(d, "txtOwnTotal") ?? throw new InvalidOperationException("không thấy txtOwnTotal");
        Uia.ForceForeground(d.Properties.NativeWindowHandle);
        box.Focus();
        var (x, y) = Uia.Center(box);
        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(200);
        Keyboard.Press(VirtualKeyShort.END);
        for (var i = 0; i < 12; i++) Keyboard.Press(VirtualKeyShort.BACK);
        Keyboard.Type("123456789012");
        Waits.Step();
        Kq("E2", $"自由診療累計 sau gõ 123456789012: 「{Uia.ValueOf(box)}」 · focus 「{Uia.AutomationIdOf(App.Automation.FocusedElement())}」");
        Keyboard.Type("ab-");
        Kq("E2", $"gõ thêm 'ab-': 「{Uia.ValueOf(box)}」");
        t.Shot("E2_go");
        Bar(t, d, "btnF10", "戻る");
        Dialogs("E2", t, _ => ["いいえ", "No", "OK"]);
        CloseNoSave(t);
    });

    [Test, Order(43)]
    public void PrE3_ShiftF2_NgaySai() => Probe("E3", "Shift+F2 変更: 日 = 32 → F9", t =>
    {
        var w = OpenEdit(t);
        PressShift(t, w, "btnF2_S", "変更");
        var d = Waits.TryFor(() => Form("frm201013"), TimeSpan.FromSeconds(10));
        if (d is null) { Kq("E3", "frm201013 không mở — " + Where()); return; }
        var day = Uia.ById(d, "txtDay") ?? throw new InvalidOperationException("không thấy txtDay");
        Uia.ForceForeground(d.Properties.NativeWindowHandle);
        var (x, y) = Uia.Center(day);
        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(200);
        // KHÔNG bấm END: BaseDialog2 coi End = F9 確定 (BaseDialog2.cs:190-195) — lượt 16:4x hộp đóng ngay.
        for (var i = 0; i < 3; i++) { Keyboard.Press(VirtualKeyShort.BACK); Keyboard.Press(VirtualKeyShort.DELETE); }
        Keyboard.Type("32");
        Keyboard.Press(VirtualKeyShort.TAB);
        Waits.Step();
        Kq("E3", $"sau gõ: 年「{Uia.ValueOf(Uia.ById(d, "txtYear")!)}」月「{Uia.ValueOf(Uia.ById(d, "txtMonth")!)}」日「{Uia.ValueOf(day)}」");
        t.Shot("E3_go");
        Bar(t, d, "btnF9", "確定");
        Dialogs("E3", t, _ => ["OK"]);
        Kq("E3", $"sau F9: {Where()}");
        if (Form("frm201013") is { } still) Bar(t, still, "btnF10", "戻る");
        if (Entry() is { } e) ShiftOff(e);
        CloseNoSave(t);
    });

    private static string Labels(AutomationElement form) =>
        string.Join(" ", form.FindAllDescendants(cf => cf.ByControlType(ControlType.Text))
            .Select(e => Txt.N(e.Name)).Where(s => s.Length > 0).Take(40).Select(s => $"「{s}」"));

    /// <summary>Các dòng của <c>dgvView</c>: giá trị ô nối bằng |.</summary>
    private static string GridDump(AutomationElement form, int max = 10)
    {
        if (Uia.ById(form, "dgvView") is not { } grid) return "(không thấy dgvView)";
        return string.Join(" ‖ ", Uia.Children(grid)
            .Where(r => Uia.ControlTypeOf(r) is not ControlType.ScrollBar)
            .Take(max)
            .Select(r => string.Join("|", Uia.Children(r).Select(c => Txt.N(Uia.ValueOf(c)) is { Length: > 0 } v ? v : Txt.N(c.Name)))));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Hạ tầng
    // ═════════════════════════════════════════════════════════════════════════

    private void Probe(string no, string what, Action<TestTrace> body)
    {
        using var trace = TestTrace.Begin($"PatReg_{no}");
        Kq(no, $"── {what}");
        try { body(trace); }
        catch (Exception e)
        {
            trace.Fail(no, e);
            Kq(no, $"NGOẠI LỆ {e.GetType().Name}: {e.Message} · {Where()}");
        }
    }

    /// <summary>Câu hỏi lưu ⇒ キャンセル (ở lại); hộp validate có OK/キャンセル ⇒ OK để đi tiếp.</summary>
    private static string[] SaveCancel(MsgBoxWin32.Found d) =>
        Txt.Has(d.Raw, "保存しますか") ? ["キャンセル", "Cancel"] : ["OK", "はい", "Yes"];

    /// <summary>新規: KHÔNG BAO GIỜ đồng ý lưu/đăng ký. Hộp một nút (lỗi) thì OK.</summary>
    private static string[] NewNever(MsgBoxWin32.Found d) =>
        ["いいえ", "No", "キャンセル", "Cancel", "OK"];

    /// <summary>
    /// Ghi + chụp + trả lời từng hộp thoại tới khi yên. Trả số hộp đã gặp.
    /// Hộp ĐẦU TIÊN chờ 6s (đang đo xem có hay không — F2), các hộp sau 4s.
    /// </summary>
    private int Dialogs(string no, TestTrace t, Func<MsgBoxWin32.Found, string[]> answer, int max = 6)
    {
        var count = 0;
        for (var i = 0; i < max; i++)
        {
            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId),
                                   TimeSpan.FromSeconds(i == 0 ? 6 : 4));
            if (box is null) break;
            count++;
            var focused = Txt.N(App.Automation.FocusedElement()?.Name);
            var buttons = MsgBoxWin32.ButtonCaptions(box.Hwnd);
            var shot = MsgEvidence.CaptureAuto(box, $"PatReg {no} #{count}", focused);
            t.Shot($"{no}_hop{count}");
            // Chọn theo THỨ TỰ ƯU TIÊN của mình: ClickButton duyệt theo thứ tự nút của hộp
            // thoại, nên truyền cả danh sách thì hộp [OK/Cancel] luôn ăn OK (lượt 10:24, B2).
            var pick = answer(box).FirstOrDefault(p => buttons.Contains(p));
            Kq(no, $"hộp #{count}: 「{Txt.Vis(box.Raw)}」 tiêu đề 「{box.Title}」 nút [{string.Join("/", buttons)}] " +
                   $"mặc định 「{focused}」 → bấm {pick ?? "(không có nút hợp)"} · ảnh {shot ?? "-"}");
            if (pick is null || !MsgBoxWin32.ClickButton(box.Hwnd, pick))
            {
                Kq(no, "⚠ không bấm được nút nào — dừng");
                break;
            }
            Waits.TryUntil(() => MsgBoxWin32.All(App.ProcessId).All(x => x.Hwnd != box.Hwnd),
                           TimeSpan.FromSeconds(10));
            Waits.Step();
        }
        return count;
    }

    private Window? Entry() => App.Window(PatEntryId);

    private Window? Form(string id)
    {
        if (App.Window(id) is { } top) return top;
        foreach (var parent in new[] { App.Window(PatEntryId), App.Window(PatListId), App.Window(PatSelectId) })
        {
            if (parent is null) continue;
            if (KarteAutoCalcDialog.FindDialogWindow(App, id, id, parent) is { } nested) return nested;
        }
        return null;
    }

    private string Where()
    {
        try
        {
            var wins = App.Windows().Select(w => $"{Uia.AutomationIdOf(w)}「{Txt.N(w.Title)}」");
            var boxes = MsgBoxWin32.All(App.ProcessId).Select(b => $"#32770「{Txt.Vis(b.Raw)}」");
            return "cửa sổ: " + string.Join(", ", wins.Concat(boxes));
        }
        catch (Exception e) { return $"(không liệt kê được: {e.Message})"; }
    }

    /// <summary>Đóng frm201001 đang mở (F10, trả lời không lưu) — KHÔNG ghi.</summary>
    private void CloseNoSave(TestTrace t)
    {
        // Cú click đầu có thể chỉ làm ô đang gõ mất focus (lượt C3/C4 10:52) ⇒ thử hai lần.
        for (var i = 0; i < 2 && Entry() is { } w; i++)
        {
            ShiftOff(w);
            Bar(t, w, "btnF10", "戻る");
            Dialogs("dong", t, d => ["いいえ", "No", "OK"]);
            Waits.TryUntil(() => Entry() is null, TimeSpan.FromSeconds(10));
        }
    }

    /// <summary>Mở 編集 từ 患者選択 bằng 「F2 患者情報」 (frm203001.cs:331 — InpKbn = Update).</summary>
    private Window OpenEdit(TestTrace t)
    {
        CloseNoSave(t);
        var sel = AppNavigator.OpenPatientSelect(App, Settings);
        var patNoBox = Uia.ById(sel, Settings.Locator("patSelPatNo"))
                       ?? throw new InvalidOperationException("không thấy ô 患者番号 trên 患者選択.");
        Uia.SetText(patNoBox, PatNo.ToString());
        Bar(t, sel, "btnF2", "患者情報");
        var w = Waits.TryFor(Entry, TimeSpan.FromSeconds(20))
                ?? throw new TimeoutException("F2 患者情報 rồi mà frm201001 không mở — " + Where());
        Waits.Step();
        t.Shot("mo_edit");
        Log($"   mở 編集 bệnh nhân {PatNo}: {PatNoLabel(w)}");
        return w;
    }

    /// <summary>
    /// Mở 新規: メインメニュー → 日常業務 → 患者登録 (frm201008) → 「F1 新患」
    /// (frm201008.cs:426 — InpKbn = Insert). Dẹp オンライン資格確認 (frm201041) nếu bung,
    /// trả lời 「いいえ」 cho Q00037 (wizard).
    /// </summary>
    private Window OpenNew(TestTrace t, string no)
    {
        CloseNoSave(t);
        var list = App.Window(PatListId);
        if (list is null)
        {
            var menu = Waits.TryFor(() => App.Window("MainMenu") ?? App.WindowByTitle("メインメニュー"),
                                    TimeSpan.FromSeconds(20))
                       ?? throw new InvalidOperationException("không thấy メインメニュー — " + Where());
            t.Step("menu 日常業務 → 患者登録");
            Uia.MouseClick(Waits.For(() => Uia.ById(menu, "pnlBtn1"), "pnlBtn1"));
            Waits.Step();
            Uia.MouseClick(Waits.For(() => Uia.ById(menu, "pnlMenu1"), "pnlMenu1"));
            list = Waits.TryFor(() => App.Window(PatListId), TimeSpan.FromSeconds(20))
                   ?? throw new InvalidOperationException("frm201008 không mở — " + Where());
        }
        Bar(t, list, "btnF1", "新患");

        // Hộp thoại TRƯỚC, frm201041 sau. Licensure = true mà máy test thiếu
        // C:\hpkicardless-clientadapter-server\face ⇒ frm201041 bung 2 hộp システムエラー ngay
        // lúc mở (lượt 10:27); bấm F10 khi hộp lỗi còn chắn thì không đi đâu cả.
        for (var i = 0; i < 12; i++)
        {
            if (Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(4)) is { } box)
            {
                var caps = MsgBoxWin32.ButtonCaptions(box.Hwnd);
                var pick = new[] { "いいえ", "No", "キャンセル", "Cancel", "OK" }.First(p => caps.Contains(p) || p == "OK");
                Kq(no, $"lúc mở 新規: 「{Txt.Vis(box.Raw)}」 [{string.Join("/", caps)}] → {pick}");
                MsgBoxWin32.ClickButton(box.Hwnd, pick);
                Waits.TryUntil(() => MsgBoxWin32.All(App.ProcessId).All(x => x.Hwnd != box.Hwnd), TimeSpan.FromSeconds(10));
                continue;
            }
            if (Form("frm201041") is { } oqs)
            {
                Kq(no, "オンライン資格確認 (frm201041) — đóng bằng F10");
                t.Shot($"{no}_oqs");
                Bar(t, oqs, "btnF10", "戻る");
                Waits.TryUntil(() => Form("frm201041") is null, TimeSpan.FromSeconds(10));
                continue;
            }
            if (Entry() is { } ready)
            {
                t.Shot($"{no}_new_ready");
                Kq(no, $"新規 mở: {PatNoLabel(ready)}");
                return ready;
            }
        }
        return Entry() ?? throw new TimeoutException("新規 không mở được frm201001 — " + Where());
    }

    private static string PatNoLabel(AutomationElement w) =>
        Uia.ById(w, "lblPatNo") is { } l ? Txt.N(l.Name) : "(không thấy lblPatNo)";

    private static AutomationElement? Visible(AutomationElement root, string id) =>
        root.FindAllDescendants(cf => cf.ByAutomationId(id)).FirstOrDefault(Uia.IsOnScreen)
        ?? Uia.ById(root, id);

    private static IReadOnlyList<AutomationElement> Tabs(AutomationElement w) =>
        Uia.ById(w, "tabMain") is { } tab
            ? tab.FindAllChildren(cf => cf.ByControlType(ControlType.TabItem))
            : [];

    private static IReadOnlyList<string> TabNames(AutomationElement w) => Tabs(w).Select(i => Txt.N(i.Name)).ToList();

    private static string ButtonStates(AutomationElement w, params string[] ids) =>
        string.Join(" ", ids.Select(id => Uia.ById(w, id) is { } b
            ? $"{id}「{Txt.N(b.Name)}」={(SafeEnabled(b) ? "ON" : "off")}{(Uia.IsOnScreen(b) ? "" : "(ẩn)")}"
            : $"{id}=(không có)"));

    private static bool SafeEnabled(AutomationElement b)
    {
        try { return b.IsEnabled; } catch { return false; }
    }

    private void ShiftOn(TestTrace t, Window w)
    {
        if (Uia.ById(w, "btnF9_S") is { } s && Uia.IsOnScreen(s)) return;
        var shift = Uia.ById(w, "btnShift") ?? throw new InvalidOperationException("không thấy btnShift");
        t.Step("bat lop Shift");
        Uia.Click(shift);
        Waits.Step();
    }

    private static void ShiftOff(Window w)
    {
        if (Uia.ById(w, "btnF9_S") is not { } s || !Uia.IsOnScreen(s)) return;
        if (Uia.ById(w, "btnShift") is { } shift) { Uia.Click(shift); Waits.Step(); }
    }

    private void PressShift(TestTrace t, Window w, string id, string caption)
    {
        ShiftOn(t, w);
        var b = Waits.TryFor(() => Uia.ById(w, id), TimeSpan.FromSeconds(3))
                ?? throw new InvalidOperationException($"không thấy {id} sau khi bật Shift");
        Log($"   {id}「{Txt.N(b.Name)}」 enabled={SafeEnabled(b)}");
        Click(t, w, id, caption);
    }

    private static void Bar(TestTrace t, AutomationElement form, string id, string caption) => Click(t, form, id, caption);

    private static void Click(TestTrace t, AutomationElement form, string id, string caption)
    {
        var b = Uia.ByIdOrName(form, id, caption)
                ?? throw new InvalidOperationException($"không thấy nút 「{caption}」 ({id})");
        var (x, y) = Uia.Center(b);
        if (x <= 0 && y <= 0) throw new InvalidOperationException($"nút 「{caption}」 không có toạ độ");
        t.Step($"bam {caption}");
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    /// <summary>Gõ phím thật (F13) vào một ô ĐANG TRỐNG, ĐANG HIỆN (mỗi tab 枝番 có một bản cùng id).</summary>
    private static void TypeInto(TestTrace t, AutomationElement root, string id, string value)
    {
        var box = Visible(root, id) ?? throw new InvalidOperationException($"không thấy ô {id}");
        t.Step($"go {id} = {value}");
        // Click chuột thật vào ô. Lượt 10:16: Focus() + TAB thì phím KHÔNG tới ô 電話番号
        // (vẫn là số cũ) và F9Proc bung 「変更されていません」 giữa chừng.
        var (x, y) = Uia.Center(box);
        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(150);
        // KHÔNG bấm END để dọn ô: END là phím tắt 登録 của form ⇒ F9Proc bung
        // 「変更されていません」 (lượt 10:22 và 10:38). Chỉ gõ vào ô ĐANG TRỐNG.
        Keyboard.Type(value);
        Waits.Step();
        Log($"   {id} đọc lại: 「{Txt.N(Uia.ValueOf(box))}」");
        t.Shot($"sau_go_{id}");
    }

    private static void Dump(string no, AutomationElement form)
    {
        foreach (var e in form.FindAllDescendants()
                     .Where(e => Uia.ControlTypeOf(e) is ControlType.Edit or ControlType.ComboBox or ControlType.Button)
                     .Take(40))
            Log($"   [{no}] {Uia.ControlTypeOf(e),-8} id=「{Uia.AutomationIdOf(e)}」 name=「{Uia.NameOf(e)}」");
    }
}
