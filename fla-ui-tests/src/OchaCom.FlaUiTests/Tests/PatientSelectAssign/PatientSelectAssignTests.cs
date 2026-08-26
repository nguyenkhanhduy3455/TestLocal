using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientSelectAssign;

/// <summary>
/// <b>患者確定 — 担当医 / 衛生士 phải chốt trước khi mở 処置入力.</b>
/// Nửa WinForm của <c>../web-tenant-tests/tests/patient-select-dr-staff-required.spec.ts</c>
/// và của spec đối chiếu <c>patient-select-assign-parity.spec.ts</c>, CÙNG SỐ HIỆU TC.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐÂY LÀ BÊN ĐO ĐÁP ÁN
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// frm203001.cs:632   defData(kbn, args)  — 患者確定
///           :636-641   診療日 sai        → E00002「診療日」 + focus _dtTrtDt
///           :669-675   患者情報 không có → E00005「患者情報」 + focus cboPatNo
///           :678       cboUserNm.SelectedIndex > 0 ⇒ combo THẮNG mọi nguồn khác
///           :696-701   nhánh selRow: dt.Columns.Contains("user_no") ? dòng : person.dr
///           :705-710   UserNo ≤ 0        → E00027「ドクター」 + focus cboUserNm
///           :713-717   衛生士: combo, không thì person.staff (att_st)
///           :721-726   StaffNo ≤ 0 VÀ DispEiseisi == 1 → E00027「衛生士」
///           :738       cboUserNm.SelectedValue = UserNo  ← combo bị GHI ĐÈ sau khi chốt
///           :1054      Let_Data_frmPatId: pintDrNo = att_dr (DrId_fixed luôn false)
/// frm203002.cs:425-427 cboDr.SelectedValue = formParam.UserNo; lbDr.Text = cboDr.Text
/// modMain.cs:2125-2138 Chg_DrName: lbDr lấy cột 69 CỦA DÒNG nếu dòng đã có dr_no
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ CHƯA CHẠY LẦN NÀO TRÊN WINDOWS — CHẠY PROBE TRƯỚC
/// ═══════════════════════════════════════════════════════════════════════════
/// Locator ở đây mới chỉ đọc ra từ Designer, và ba câu hỏi lớn (nguyên văn MSGTBL,
/// Ｄｒ．nào thắng trên header, double-click có mở màn không) phải ĐO mới biết.
/// PROBE-GUIDELINE mục 2 là luật:
/// <code>
///   .\run-confirm-patient.ps1 -Diagnostics      ← LÀM CÁI NÀY TRƯỚC
///   .\run-confirm-patient.ps1
/// </code>
/// Sai locator thì log trông y hệt 「WinForm sai」.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Không bấm F9 登録, không seed dòng <c>wait</c>. Đây là chỗ KHÁC bản Playwright:
/// bên đó <c>ensureWaitRow</c> chèn rồi xoá một dòng 受付, còn DB bên này là DB thật
/// của phòng khám nên nhánh nào cần dòng 受付 mà máy không có thì <c>Ignore</c>.
/// Mọi hộp thoại 「保存しますか？」 gặp phải đều trả lời <b>いいえ</b>.
/// </summary>
[TestFixture]
[Category("confirm-patient")]
public sealed class PatientSelectAssignTests : UiTestBase
{
    private PatientSelectFlow _flow = null!;
    private PatientSelectAssignDb _db = null!;

    private int _patWithDr;
    private PersonAttending _attOfPatWithDr = null!;
    private int? _patWithoutDr;
    private int? _patWithoutSt;
    private IReadOnlyList<StaffMember> _doctors = [];
    private IReadOnlyList<WaitRow> _waitRows = [];
    private StaffMember? _pickedDoctor;

    /// <summary>Đo CHÍNH màn 患者選択 nên nền chung không được đi qua nó.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    /// <summary>
    /// TẮT watcher hộp thoại nhiễu: thứ fixture này đo CHÍNH là nội dung từng
    /// MessageBox. Để watcher bấm hộ thì mọi phép đọc ra rỗng và testcase sẽ
    /// <b>xanh sai</b> — nó kết luận 「app không chặn」 trong khi app có chặn
    /// (PROBE-GUIDELINE 3.4).
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override AutomationElement? UiaDumpRoot
    {
        get
        {
            try { return _flow?.Screen?.Window ?? base.UiaDumpRoot; }
            catch { return null; }
        }
    }

    protected override string? FixturePreflightSkipReason()
    {
        var settings = TestSettings.Current;
        if (!settings.Db.Enabled || string.IsNullOrWhiteSpace(settings.Db.ConnectionString))
            return "cần db.enabled + db.connectionString: mọi 患者番号 / Ｄｒ．ở đây đều DÒ TỪ DB " +
                   "lúc chạy (không hard-code), và không có DB thì không dựng được nhánh nào.";
        return null;
    }

    [OneTimeSetUp]
    public void FlowOneTimeSetUp()
    {
        _flow = new PatientSelectFlow(App, Settings);

        var db = PatientSelectAssignDb.CreateOrNull(Settings);
        if (db is null)
        {
            IgnoreWithReason("không dựng được PatientSelectAssignDb dù db.enabled đang bật");
            return;
        }
        _db = db;

        _doctors = _db.Doctors();
        _waitRows = _db.WaitRows();
        _patWithoutDr = _db.PatientWithoutAttDr();
        _patWithoutSt = _db.PatientWithAttDrWithoutAttSt();

        var withDr = _db.PatientWithAttDr();
        if (withDr is null)
            IgnoreWithReason("dataset không có bệnh nhân nào có att_dr > 0 — không dựng được nhánh nào");
        _patWithDr = withDr!.Value;
        _attOfPatWithDr = _db.Attending(_patWithDr)!;

        // Ｄｒ．chọn tay PHẢI khác att_dr, nếu không thì assert 「combo thắng 患者マスタ」
        // xanh cả khi fallback chạy sai thứ tự.
        _pickedDoctor = _doctors.FirstOrDefault(d => d.UserNo != _attOfPatWithDr.AttDr);

        TestContext.Out.WriteLine(
            $"dữ liệu: patWithDr={_patWithDr} (att_dr={_attOfPatWithDr.AttDr}, att_st={_attOfPatWithDr.AttSt}) · " +
            $"patWithoutDr={_patWithoutDr?.ToString() ?? "KHÔNG CÓ"} · " +
            $"patWithoutSt={_patWithoutSt?.ToString() ?? "KHÔNG CÓ"} · " +
            $"Ｄｒ．chọn tay={_pickedDoctor?.ToString() ?? "KHÔNG CÓ"} · " +
            $"wait={_waitRows.Count} dòng");

        _flow.Open();
        // Combo Ｄｒ．KHÔNG phơi mục nào ra UIA (đo 2026-08-26, PROBE KQ-3) nên chọn
        // theo tên phải quy ra chỉ số qua roster đọc từ IINMST2.
        _flow.Screen.DoctorRoster = _doctors;
    }

    // ── Tiện ích dùng chung ─────────────────────────────────────────────────

    private PatientSelectScreen Screen0 => _flow.Screen;

    private static void Kq(string tag, string line)
    {
        var s = $"=== KQ-{tag} === {line}";
        TestContext.Out.WriteLine(s);
        try { TestContext.Progress.WriteLine(s); } catch { /* không có console */ }
    }

    /// <summary>Tên hiển thị của một <c>user_no</c> trong IINMST2, hoặc null.</summary>
    private string? DoctorName(int userNo) => _doctors.FirstOrDefault(d => d.UserNo == userNo)?.UserNm;

    /// <summary>
    /// Đưa màn về mốc sạch: đang ở 患者選択, combo Ｄｒ．TRỐNG, ô 患者番号 rỗng,
    /// không còn hộp thoại nào.
    ///
    /// <para>Cần vì cả fixture dùng CHUNG một phiên app (UiTestBase) — testcase trước
    /// để lại gì thì testcase sau thấy nguyên như vậy. Riêng ở màn này còn một cái bẫy
    /// nữa: 患者確定 thành công thì frm203001.cs:738 GHI ĐÈ
    /// <c>cboUserNm.SelectedValue = UserNo</c>, tức combo KHÔNG còn trống nữa dù
    /// testcase trước chưa hề chọn tay.</para>
    /// </summary>
    private void ResetToPatientSelect()
    {
        _flow.DrainDialogs();
        if (_flow.Screen is null || !_flow.Screen.IsShowing()) _flow.Open();
        Screen0.DoctorRoster = _doctors;
        Screen0.ClearPatNo();
        Screen0.ClearDoctor();
    }

    /// <summary>Sau khi một testcase đã mở được 処置入力: quay về 患者選択.</summary>
    private void ReturnFrom(Window detail)
    {
        var asked = _flow.ReturnToPatientSelect(detail);
        _flow.Screen.DoctorRoster = _doctors;
        if (asked.Count > 0)
            TestContext.Out.WriteLine(
                "F10 戻る đã trả lời いいえ cho: " + string.Join(" / ", asked.Select(a => $"「{a}」")));
    }

    // ── TC-MSG-1 — nguyên văn MSGTBL ────────────────────────────────────────

    [Test, Order(1)]
    [Description("TC-MSG-1 — MSGTBL có E00005 / E00027; ghi lại NGUYÊN VĂN để đối chiếu locales/ja.ts của bản web")]
    public void Tc1_MsgTblWording()
    {
        if (Db is null)
            IgnoreWithReason($"không đọc được MSGTBL — {DbUnavailableReason}");

        var e5 = Db!.GetMessage("E00005");
        var e27 = Db.GetMessage("E00027");

        Kq("MSG-E00005", e5 is null ? "KHÔNG CÓ DÒNG NÀY" : $"「{Txt.N(e5)}」");
        Kq("MSG-E00027", e27 is null ? "KHÔNG CÓ DÒNG NÀY" : $"「{Txt.N(e27)}」");
        Kq("MSG-applied", $"E00027+ドクター → 「{Db.ExpectedMessage("E00027", "ドクター")}」 · " +
                          $"E00005+患者情報 → 「{Db.ExpectedMessage("E00005", "患者情報")}」");

        // Đây là lý do chính của testcase: bản web tự khai là ĐANG ĐOÁN câu này
        // (web locales/ja.ts:63「MSGTBL は本リポジトリに無く E00027 の実文言は未確認」).
        // Thiếu dòng trong MSGTBL thì MsgDialog hiện chuỗi rỗng và không ai đối chiếu được.
        Assert.That(e27, Is.Not.Null.And.Not.Empty,
            "MSGTBL không có ID E00027. MsgDialog.ShowWarningMsg lấy câu từ bảng này " +
            "(MsgTbl.cs:15-33) nên hộp thoại 担当医/衛生士 sẽ hiện chuỗi rỗng, và bản web " +
            "không có gì để đối chiếu — locales/ja.ts:63 vẫn đang dùng câu ĐOÁN.");
        Assert.That(e5, Is.Not.Null.And.Not.Empty,
            "MSGTBL không có ID E00005 (frm203001.cs:672 dùng nó cho 患者情報).");
    }

    // ── TC-PAT-1 — 患者情報 ─────────────────────────────────────────────────

    [Test, Order(2)]
    [Description("TC-PAT-1 — 患者番号 không tồn tại: E00005「患者情報」, KHÔNG mở 処置入力 (frm203001.cs:669-675)")]
    public void Tc2_MissingPatientBlocks()
    {
        ResetToPatientSelect();

        var missing = _db.UnusedPatNo();
        Screen0.TypePatNo(missing.ToString());
        var r = _flow.ConfirmAndObserve(() => Screen0.ConfirmWithEnd());
        Kq("PAT-1", $"患者番号={missing} → {r}");

        Assert.That(r.Opened, Is.False,
            $"患者番号 {missing} không có trong bảng person mà 患者確定 vẫn mở được 処置入力. " +
            "frm203001.cs:669-675 phải chặn ở PatInfoList.getLastPatInfo == null.");
        Assert.That(r.Blocked, Is.True,
            $"患者番号 {missing} không tồn tại mà 患者確定 im lặng (không hộp thoại, không điều hướng). " +
            "Kỳ vọng E00005「患者情報」 — frm203001.cs:672.");
        Assert.That(Txt.N(r.DialogText ?? ""), Does.Contain("患者情報"),
            $"hộp thoại bung ra 「{Txt.N(r.DialogText ?? "")}」 nhưng không nhắc 患者情報. " +
            "frm203001.cs:672 gọi ShowWarningMsg(\"E00005\", \"患者情報\").");

        _flow.DrainDialogs();
        Assert.That(Screen0.IsShowing(), Is.True,
            "sau E00005 thì phải Ở LẠI 患者選択 (frm203001.cs:673 cboPatNo.Focus() rồi return).");
    }

    // ── TC-DR-1 — fallback 患者マスタ ───────────────────────────────────────

    [Test, Order(3)]
    [Description("TC-DR-1 — combo Ｄｒ．TRỐNG: 患者確定 lấy att_dr của 患者マスタ (frm203001.cs:694)")]
    public void Tc3_BlankComboFallsBackToPatientMaster()
    {
        ResetToPatientSelect();

        Screen0.TypePatNo(_patWithDr.ToString());
        var r = _flow.ConfirmAndObserve(() => Screen0.ConfirmWithEnd());
        Kq("DR-1", $"combo TRỐNG + 患者{_patWithDr} (att_dr={_attOfPatWithDr.AttDr}) → {r}");

        Assert.That(r.Opened, Is.True,
            $"bệnh nhân {_patWithDr} CÓ att_dr={_attOfPatWithDr.AttDr} mà 患者確定 không mở được 処置入力 " +
            $"({r}). Nhánh inpTxt phải rơi về person.dr — frm203001.cs:694.");

        var label = _flow.DetailDoctorLabel(r.DetailWindow!);
        var expected = DoctorName(_attOfPatWithDr.AttDr);
        Kq("DR-1b", $"header lbDr = 「{label}」 · att_dr={_attOfPatWithDr.AttDr} 「{expected ?? "?"}」");

        // Chg_DrName ghi đè lbDr bằng dr_no CỦA DÒNG khi ngày đó đã có 処置 (modMain.cs:2125).
        // Ngày sạch thì mốc mới rõ ràng; ngày đã có dòng thì để TC-SEED-1 lo.
        var trnDrs = _db.TrnDoctorsInMonth(_patWithDr, TrtDate);
        if (trnDrs.Count > 0)
        {
            Assert.That(label, Is.Not.Empty,
                "header lbDr rỗng — frm203002.cs:427 luôn gán lbDr.Text = cboDr.Text.");
            Kq("DR-1c", $"tháng này 患者{_patWithDr} đã có TRNTRN dr_no=[{string.Join(",", trnDrs)}] " +
                        "⇒ bỏ qua phép so tên: Chg_DrName (modMain.cs:2125) ưu tiên dr_no của DÒNG. " +
                        "Đối chiếu chính nằm ở TC-SEED-1.");
        }
        else if (expected is not null)
        {
            Assert.That(label, Is.EqualTo(expected),
                $"combo trống ⇒ kỳ vọng header mang att_dr={_attOfPatWithDr.AttDr} 「{expected}」, " +
                $"nhưng đang hiện 「{label}」. Tháng này bệnh nhân chưa có dòng TRNTRN nào nên " +
                "Chg_DrName không thể ghi đè — sai ở đây là sai chuỗi fallback frm203001.cs:694.");
        }

        ReturnFrom(r.DetailWindow!);
    }

    // ── TC-DR-2 — combo thắng 患者マスタ ────────────────────────────────────

    [Test, Order(4)]
    [Description("TC-DR-2 — combo Ｄｒ．CÓ CHỌN: giá trị combo thắng att_dr (frm203001.cs:678)")]
    public void Tc4_PickedComboBeatsPatientMaster()
    {
        if (_pickedDoctor is null)
            IgnoreWithReason(
                $"IINMST2 không có Ｄｒ．nào khác att_dr={_attOfPatWithDr.AttDr} — " +
                "không tách được hai nguồn, assert sẽ xanh cả khi fallback chạy sai thứ tự.");

        ResetToPatientSelect();

        Screen0.SelectDoctor(_pickedDoctor!.UserNm);
        Assert.That(Screen0.DrText(), Is.EqualTo(_pickedDoctor.UserNm),
            $"chọn 「{_pickedDoctor.UserNm}」 mà combo Ｄｒ．đang hiện 「{Screen0.DrText()}」 — " +
            "thao tác chọn chưa ăn, mọi assert sau đó vô nghĩa.");

        Screen0.TypePatNo(_patWithDr.ToString());
        var r = _flow.ConfirmAndObserve(() => Screen0.ConfirmWithEnd());
        Kq("DR-2", $"combo={_pickedDoctor} + 患者{_patWithDr} (att_dr={_attOfPatWithDr.AttDr}) → {r}");

        Assert.That(r.Opened, Is.True, $"chọn Ｄｒ．rồi mà 患者確定 không mở được 処置入力 ({r}).");

        var label = _flow.DetailDoctorLabel(r.DetailWindow!);
        var attNm = DoctorName(_attOfPatWithDr.AttDr);
        Kq("DR-2b", $"header lbDr = 「{label}」 · đã chọn 「{_pickedDoctor.UserNm}」 · att_dr 「{attNm ?? "?"}」");

        var trnDrs = _db.TrnDoctorsInMonth(_patWithDr, TrtDate);
        if (trnDrs.Count > 0)
        {
            Kq("DR-2c", $"tháng này đã có TRNTRN dr_no=[{string.Join(",", trnDrs)}] ⇒ bỏ qua phép so tên " +
                        "(Chg_DrName ưu tiên dr_no của DÒNG). Đối chiếu chính ở TC-SEED-1.");
            Assert.That(label, Is.Not.Empty, "header lbDr rỗng — frm203002.cs:427 luôn gán lbDr.Text.");
        }
        else
        {
            // Ngày sạch: chuỗi ghi là :678 → formParam.UserNo → :425 → :427, không ai chen vào.
            Assert.That(label, Is.EqualTo(_pickedDoctor.UserNm),
                $"đã chọn tay Ｄｒ．{_pickedDoctor} nhưng header 処置入力 hiện 「{label}」" +
                (label == attNm
                    ? $" — tức là att_dr={_attOfPatWithDr.AttDr} của 患者マスタ đã THẮNG combo. " +
                      "Nhánh này là Let_Data_frmPatId (frm203001.cs:1054, DrId_fixed không bao giờ true). " +
                      "Bản web GIỮ Ｄｒ．vừa chọn ⇒ WIN/WEB LỆCH."
                    : ". Tháng này chưa có dòng TRNTRN nào nên Chg_DrName không thể ghi đè."));
        }

        ReturnFrom(r.DetailWindow!);
    }

    // ── TC-DR-3 — chặn 担当医 ───────────────────────────────────────────────

    [Test, Order(5)]
    [Description("TC-DR-3 — không nguồn nào cho 担当医: E00027「ドクター」, KHÔNG mở màn (frm203001.cs:705-710)")]
    public void Tc5_NoDoctorBlocks()
    {
        if (_patWithoutDr is null)
            IgnoreWithReason("dataset không có bệnh nhân nào thiếu att_dr — không dựng được nhánh chặn");

        ResetToPatientSelect();

        Screen0.TypePatNo(_patWithoutDr!.Value.ToString());
        var r = _flow.ConfirmAndObserve(() => Screen0.ConfirmWithEnd());
        Kq("DR-3", $"患者{_patWithoutDr} (att_dr ≤ 0) + combo TRỐNG → {r}");

        Assert.That(r.Opened, Is.False,
            $"bệnh nhân {_patWithoutDr} không có 担当医 mà vẫn mở được 処置入力. " +
            "Mọi dòng lưu sau đó bị đóng dấu dr_no = 0 (TrnTrn.cs:4202) — frm203001.cs:705 phải chặn.");
        Assert.That(r.Blocked, Is.True,
            $"thiếu 担当医 mà 患者確定 im lặng ({r}). Kỳ vọng E00027「ドクター」.");
        Assert.That(Txt.N(r.DialogText ?? ""), Does.Contain("ドクター"),
            $"hộp thoại 「{Txt.N(r.DialogText ?? "")}」 không nhắc 「ドクター」. " +
            "frm203001.cs:707 gọi ShowWarningMsg(\"E00027\", \"ドクター\") — LƯU Ý là 「ドクター」 " +
            "chứ không phải 「Ｄｒ．」.");

        _flow.DrainDialogs();
        Assert.That(Screen0.IsShowing(), Is.True,
            "sau E00027「ドクター」 phải ở lại 患者選択 (frm203001.cs:708 cboUserNm.Focus() rồi return).");
    }

    // ── TC-ST-1 — 衛生士 ────────────────────────────────────────────────────

    [Test, Order(6)]
    [Description("TC-ST-1 — thiếu 衛生士: chặn hay không LÀ HÀM CỦA Ocha.xml DispEiseisi (frm203001.cs:721)")]
    public void Tc6_HygienistGateFollowsDispEiseisi()
    {
        if (_patWithoutSt is null)
            IgnoreWithReason(
                "dataset không có bệnh nhân nào CÓ att_dr mà THIẾU att_st — không dựng được nhánh này");

        ResetToPatientSelect();

        var rowVisible = Screen0.HygienistRowVisible();
        Screen0.TypePatNo(_patWithoutSt!.Value.ToString());
        var r = _flow.ConfirmAndObserve(() => Screen0.ConfirmWithEnd());
        Kq("ST-1", $"患者{_patWithoutSt} (att_st ≤ 0) · hàng 衛生士 {(rowVisible ? "HIỆN" : "ẨN")} → {r}");

        if (r.Blocked)
        {
            Assert.That(Txt.N(r.DialogText ?? ""), Does.Contain("衛生士"),
                $"bị chặn với 「{Txt.N(r.DialogText ?? "")}」 — nếu câu này nhắc 「ドクター」 thì " +
                $"bệnh nhân {_patWithoutSt} thực ra thiếu cả att_dr và testcase đang đo nhầm bước.");
            Kq("ST-1b", "⇒ DispEiseisi == 1 (bắt buộc nhập 衛生士).");
            _flow.DrainDialogs();
            Assert.That(Screen0.IsShowing(), Is.True,
                "sau E00027「衛生士」 phải ở lại 患者選択 (frm203001.cs:724).");
        }
        else if (r.Opened)
        {
            Kq("ST-1b", $"KHÔNG chặn dù thiếu att_st ⇒ Ocha.xml DispEiseisi ≠ 1 " +
                        $"(0 = ẩn hàng, 9 = HIỆN hàng mà vẫn không bắt buộc). Hàng 衛生士 đang " +
                        $"{(rowVisible ? "HIỆN" : "ẨN")}.");
            if (rowVisible)
                Kq("ST-1c", "★ LỆCH WIN/WEB: hàng 衛生士 HIỆN mà WinForm KHÔNG bắt buộc ⇒ DispEiseisi = 9 " +
                            "(frm203003.cs:264 ghi 9 khi bỏ tick, còn :542 chỉ ẩn hàng khi == 0). " +
                            "Bản web chỉ biết hai trạng thái {Hidden:0, Shown:1} và coi 「hiện」 ⇒ 「bắt buộc」, " +
                            "nên cùng cấu hình này web SẼ chặn E00027「衛生士」 còn WinForm thì không.");
            ReturnFrom(r.DetailWindow!);
        }
        else
        {
            Assert.Fail($"患者確定 im lặng ({r}) — không chặn mà cũng không mở màn. " +
                        "Đọc ảnh trong artifacts\\screenshots trước khi kết luận.");
        }
    }

    // ── TC-ROW-1 — double-click trên lưới ───────────────────────────────────

    [Test, Order(7)]
    [Description("TC-ROW-1 — double-click dòng lưới KHÔNG mở 処置入力: defData bị comment (frm203001.cs:303-309)")]
    public void Tc7_DoubleClickIsNoOp()
    {
        if (_waitRows.Count == 0)
            IgnoreWithReason("bảng wait rỗng nên lưới 受付患者一覧 không có dòng nào để double-click");

        ResetToPatientSelect();

        var target = _waitRows[0];
        if (!Screen0.SelectGridRowByPatNo(target.PatNo))
            IgnoreWithReason($"không thấy dòng 受付 của bệnh nhân {target.PatNo} trên lưới");

        var center = Uia.Center(Screen0.ViewGrid);
        var r = _flow.ConfirmAndObserve(
            () => Uia.DoubleClickPhysical(center.X, center.Y),
            TimeSpan.FromSeconds(8));
        Kq("ROW-1", $"double-click dòng 患者{target.PatNo} → {r}");

        Assert.That(r.Opened, Is.False,
            $"double-click mở được 処置入力, nhưng dgvView_CellDoubleClick có câu defData BỊ COMMENT " +
            "(frm203001.cs:303-309) nên nó phải là no-op. Nếu WinForm đã mở lại nhánh này thì đây là " +
            "THÊM TÍNH NĂNG, và bản web (vốn mở màn bằng double-click) mới là bên đúng.");
        Kq("ROW-1b", "★ LỆCH WIN/WEB: bản Playwright mở màn chi tiết bằng đúng cử chỉ double-click này " +
                     "(patient-select-dr-staff-required.spec.ts TC-DR-4). WinForm bắt dùng Enter/F9/End.");

        if (r.Opened) ReturnFrom(r.DetailWindow!);
        else _flow.DrainDialogs();
    }

    // ── TC-DR-4 — dòng 受付 thắng 患者マスタ ────────────────────────────────

    [Test, Order(8)]
    [Description("TC-DR-4 — Enter trên dòng 受付一覧: user_no CỦA DÒNG thắng att_dr (frm203001.cs:696-701)")]
    public void Tc8_WaitRowUserNoBeatsPatientMaster()
    {
        if (_waitRows.Count == 0)
            IgnoreWithReason(
                "bảng wait rỗng. Luồng WinForm KHÔNG tự seed dòng 受付 (DB này là DB thật của phòng " +
                "khám, wait là hàng đợi tiếp nhận đang chạy) — khác bản Playwright, nơi ensureWaitRow " +
                "chèn rồi xoá. Tiếp nhận một bệnh nhân trên app rồi chạy lại.");

        // Dòng phải mang user_no KHÁC att_dr của chính bệnh nhân đó, nếu không thì
        // không tách được hai nguồn.
        WaitRow? usable = null;
        foreach (var row in _waitRows)
        {
            if (row.UserNo is null or <= 0) continue;
            var rowAtt = _db.Attending(row.PatNo);
            if (rowAtt is not null && rowAtt.AttDr != row.UserNo) { usable = row; break; }
        }

        if (usable is null)
            IgnoreWithReason(
                "không có dòng 受付 nào mang user_no > 0 và KHÁC att_dr của chính bệnh nhân đó — " +
                "hai nguồn trùng nhau thì assert xanh cả khi fallback chạy sai thứ tự. " +
                "Dòng đang có: " + string.Join(" / ", _waitRows.Select(w =>
                    $"患者{w.PatNo}→user_no={w.UserNo?.ToString() ?? "NULL"}")));

        // IgnoreWithReason ném IgnoreException nhưng không mang [DoesNotReturn], nên
        // trình biên dịch vẫn coi `usable` là có thể null từ đây trở đi.
        var row0 = usable!;

        ResetToPatientSelect();

        // Ô 患者番号 PHẢI rỗng: btnEndEsc_Click đọc cboPatNo.Text TRƯỚC lưới
        // (frm203001.cs:500), và nhánh mang user_no của dòng là inpKbn.selRow.
        Assert.That(Screen0.PatNoText(), Is.Empty,
            "ô 患者番号 chưa rỗng — 患者確定 sẽ đi nhánh inpTxt (đọc att_dr) chứ không phải " +
            "selRow (đọc user_no của dòng), frm203001.cs:500.");

        if (!Screen0.SelectGridRowByPatNo(row0.PatNo))
            IgnoreWithReason($"không thấy dòng 受付 của bệnh nhân {row0.PatNo} trên lưới");

        var att = _db.Attending(row0.PatNo);
        Assert.That(att, Is.Not.Null,
            $"không đọc được person của bệnh nhân {row0.PatNo} dù bảng wait có dòng cho họ.");

        var r = _flow.ConfirmAndObserve(() => Screen0.ConfirmSelectedRowWithEnter());
        Kq("DR-4", $"Enter trên dòng 患者{row0.PatNo} (user_no={row0.UserNo}, att_dr={att!.AttDr}) → {r}");

        Assert.That(r.Opened, Is.True,
            $"Enter trên dòng 受付 của bệnh nhân {row0.PatNo} không mở được 処置入力 ({r}). " +
            "dgvView_KeyDown gọi defData(inpKbn.selRow, …) — frm203001.cs:287-296.");

        var label = _flow.DetailDoctorLabel(r.DetailWindow!);
        var rowNm = DoctorName(row0.UserNo!.Value);
        var attNm = DoctorName(att.AttDr);
        Kq("DR-4b", $"header lbDr = 「{label}」 · user_no dòng = {row0.UserNo} 「{rowNm ?? "?"}」 · " +
                    $"att_dr = {att.AttDr} 「{attNm ?? "?"}」");

        var trnDrs = _db.TrnDoctorsInMonth(row0.PatNo, DateTime.Today);
        if (trnDrs.Count > 0)
        {
            Kq("DR-4c", $"tháng này đã có TRNTRN dr_no=[{string.Join(",", trnDrs)}] ⇒ bỏ qua phép so tên " +
                        "(Chg_DrName ưu tiên dr_no của DÒNG).");
            Assert.That(label, Is.Not.Empty, "header lbDr rỗng — frm203002.cs:427 luôn gán lbDr.Text.");
        }
        else if (rowNm is not null)
        {
            Assert.That(label, Is.EqualTo(rowNm),
                $"mở từ 受付一覧 mà header hiện 「{label}」 thay vì user_no={row0.UserNo} 「{rowNm}」 của DÒNG" +
                (label == attNm ? $" — đang lấy nhầm att_dr={att.AttDr} của 患者マスタ." : ".") +
                " frm203001.cs:698-699: nhánh selRow đọc cột user_no của lưới.");
        }

        ReturnFrom(r.DetailWindow!);
    }

    // ── TC-SEED-1 — Ｄｒ．nào thắng khi tháng ĐÃ CÓ 処置 ────────────────────

    [Test, Order(9)]
    [Description("TC-SEED-1 — GHI LẠI: tháng đã có TRNTRN thì header 処置入力 lấy Ｄｒ．từ nguồn nào")]
    public void Tc9_RecordHeaderDoctorSourceWhenMonthHasRows()
    {
        if (_pickedDoctor is null)
            IgnoreWithReason($"IINMST2 không có Ｄｒ．nào khác att_dr={_attOfPatWithDr.AttDr}");

        var patNo = _db.PatientWithTrnInMonth(TrtDate);
        if (patNo is null)
            IgnoreWithReason(
                $"không có bệnh nhân nào có TRNTRN mang dr_no > 0 trong tháng {TrtDate:yyyy-MM} — " +
                "không dựng được trạng thái mà Chg_DrName (modMain.cs:2125) lộ ra");

        var trnDrs = _db.TrnDoctorsInMonth(patNo!.Value, TrtDate);
        var att = _db.Attending(patNo.Value);

        // Ｄｒ．dò phải khác MỌI dr_no của tháng VÀ khác att_dr, nếu không thì
        // không phân biệt được ba nguồn.
        var taken = new HashSet<int>(trnDrs) { att?.AttDr ?? -1 };
        var probe = _doctors.FirstOrDefault(d => !taken.Contains(d.UserNo));
        if (probe is null)
            IgnoreWithReason(
                $"mọi Ｄｒ．đều đã xuất hiện trong TRNTRN/att_dr của 患者{patNo} — " +
                "không còn giá trị nào để phân biệt ba nguồn");

        ResetToPatientSelect();

        Screen0.SelectDoctor(probe!.UserNm);
        Screen0.TypePatNo(patNo.Value.ToString());
        var r = _flow.ConfirmAndObserve(() => Screen0.ConfirmWithEnd());
        Kq("SEED-1", $"患者{patNo} (TRNTRN dr_no=[{string.Join(",", trnDrs)}], att_dr={att?.AttDr}) " +
                     $"+ combo chọn {probe} → {r}");

        Assert.That(r.Opened, Is.True, $"không mở được 処置入力 ({r}).");

        var label = _flow.DetailDoctorLabel(r.DetailWindow!);
        var attNm = att is null ? null : DoctorName(att.AttDr);
        var trnNms = trnDrs.Select(d => DoctorName(d)).Where(n => n is not null).ToList();

        Kq("SEED-1b", $"header lbDr = 「{label}」 · combo chọn 「{probe.UserNm}」 · " +
                      $"att_dr 「{attNm ?? "?"}」 · TRNTRN [{string.Join(",", trnNms)}]");

        var verdict =
            label == probe.UserNm ? "GIỮ Ｄｒ．vừa chọn — KHỚP bản web."
            : label == attNm ? "★ lấy att_dr của 患者マスタ (Let_Data_frmPatId :1054) — LỆCH bản web."
            : trnNms.Contains(label) ? "★ lấy dr_no của dòng TRNTRN cũ (Chg_DrName modMain.cs:2125) — LỆCH bản web."
            : "★ một nguồn THỨ TƯ không dự đoán được — đọc ảnh trong artifacts trước khi kết luận.";
        Kq("SEED-1c", verdict);

        // Testcase này GHI LẠI đáp án chứ không áp đặt: ba đoạn cùng tranh nhau ghi
        // lbDr và thứ tự thật chỉ đo mới biết (xem PROBE KQ-6). Thứ nó THỰC SỰ chặn
        // là trạng thái vô nghĩa — header trống, hoặc một cái tên không thuộc IINMST2.
        Assert.That(label, Is.Not.Empty,
            "header lbDr rỗng. frm203002.cs:427 luôn gán lbDr.Text = cboDr.Text, nên rỗng nghĩa là " +
            "cboDr chưa nhận được SelectedValue nào — formParam.UserNo không tới nơi.");
        Assert.That(_doctors.Any(d => d.UserNm == label), Is.True,
            $"header lbDr = 「{label}」 không khớp Ｄｒ．nào trong IINMST2 (user_kbn=0). " +
            "Danh sách: " + string.Join(" / ", _doctors.Select(d => d.ToString())));

        ReturnFrom(r.DetailWindow!);
    }
}
