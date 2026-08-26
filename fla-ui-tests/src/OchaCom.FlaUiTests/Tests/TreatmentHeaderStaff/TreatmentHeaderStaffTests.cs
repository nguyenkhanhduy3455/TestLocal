using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.TreatmentHeaderStaff;

/// <summary>
/// <b>Vùng 「Ｄｒ」 trên header 処置入力 — BA control, BA câu trả lời.</b>
/// Nửa WinForm của <c>../web-tenant-tests/tests/treatment-header-staff.spec.ts</c>,
/// CÙNG SỐ HIỆU TC.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐÂY LÀ BÊN ĐO ĐÁP ÁN
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// frm203002.cs:597   makeIinMstCombo(con, cboDr, KBN_DR, true)  ← spcFlg = TRUE
///           :2478    cboDr.Visible = false
///           :425-427 cboDr.SelectedValue = formParam.UserNo; lbDr.Text = cboDr.Text
///           :8087    lbDr_Click        → cboDr.Visible = true
///           :8093    cboDr_SelectedValueChanged → ModCommon.pintDrNo
///           :8105    lblDrLabel_Click  → 一括変更 CẢ NGÀY
///           :8115    strMsg = {日} + "日診療分の担当ドクターを" + vbCrLf
///                             + cboDr.Text + " に変更します。" + vbCrLf + vbCrLf
///                             + "よろしいですか？"
///           :8117    Interaction.MsgBox(strMsg, Question|YesNo, "ドクター変更")
///           :8121-8127 Yes ⇒ mọi dòng có hFG1[0] == 日 hiện hành nhận hFG1[69] = Index
/// modMain.cs:2125-2138 Chg_DrName: lbDr lấy hFG1[69] CỦA DÒNG, rỗng mới về pintDrNo
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ CHẠY PROBE TRƯỚC
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-bulk-change-dr.ps1 -Diagnostics    ← LÀM CÁI NÀY TRƯỚC
///   .\run-bulk-change-dr.ps1
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Không bấm F9 登録. 一括変更 chỉ sửa lưới trong bộ nhớ, rời màn hình là mất —
/// đúng như bản Playwright. TC-BULK-2 CÓ bấm 「はい」 nhưng vẫn không xuống DB.
/// </summary>
[TestFixture]
[Category("header-staff")]
public sealed class TreatmentHeaderStaffTests : UiTestBase
{
    private HeaderStaffFlow _flow = null!;
    private HeaderStaffDb _db = null!;

    private int _attDr;
    private IReadOnlyList<TrnRow> _rows = [];

    /// <summary>
    /// TẮT watcher hộp thoại nhiễu: fixture này đo CHÍNH nội dung hộp thoại 一括変更
    /// và tự quyết định bấm はい hay いいえ. Để watcher trả lời hộ thì TC-BULK-1
    /// <b>xanh sai</b> — nó kết luận 「app không hỏi」 trong khi app có hỏi
    /// (PROBE-GUIDELINE 3.4).
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        var settings = TestSettings.Current;
        if (!settings.Db.Enabled || string.IsNullOrWhiteSpace(settings.Db.ConnectionString))
            return "cần db.enabled + db.connectionString: cột dr_no (hFG1[69]) là cột ẨN, " +
                   "UI không đọc được, nên mọi kỳ vọng về nhãn đều phải đối chiếu với DB.";
        return null;
    }

    [OneTimeSetUp]
    public void FlowOneTimeSetUp()
    {
        _flow = new HeaderStaffFlow(App, Screen);

        var db = HeaderStaffDb.CreateOrNull(Settings);
        if (db is null)
        {
            IgnoreWithReason("không dựng được HeaderStaffDb dù db.enabled đang bật");
            return;
        }
        _db = db;

        _attDr = _db.AttDr(PatNo);
        _rows = _db.RowsInMonth(PatNo, TrtDate);

        TestContext.Out.WriteLine(
            $"dữ liệu: 患者{PatNo} att_dr={_attDr}「{_db.DoctorName(_attDr) ?? "?"}」 · " +
            $"TRNTRN tháng {TrtDate:yyyy-MM}: " +
            (_rows.Count == 0
                ? "KHÔNG có dòng nào"
                : string.Join(" / ", _rows.Select(r => $"{r.Day}日→dr_no={r.DrNo}×{r.Count}"))));
    }

    private static void Kq(string tag, string line)
    {
        var s = $"=== KQ-{tag} === {line}";
        TestContext.Out.WriteLine(s);
        try { TestContext.Progress.WriteLine(s); } catch { /* không có console */ }
    }

    /// <summary>
    /// Đứng lên một dòng DỮ LIỆU có 日 đúng bằng <paramref name="day"/>.
    ///
    /// <para>Đi qua <see cref="HeaderStaffFlow.DataRows"/> chứ không qua danh sách dòng
    /// thô: dòng tiêu đề 「日」 và dòng trống lọt vào cây UIA (PROBE-GUIDELINE 3.2) và ô
    /// của chúng đọc ra rect rỗng — click vào là bắn chuột ra desktop.</para>
    /// </summary>
    private int FocusRowWithDay(string day)
    {
        foreach (var row in _flow.DataRows())
        {
            if (row.Day != day) continue;
            if (_flow.FocusRow(row.Index) == day) return row.Index;
        }
        return -1;
    }

    /// <summary>
    /// Tách tên Ｄｒ．ra khỏi câu hỏi 一括変更.
    ///
    /// <para>Khuôn: <c>{日}日診療分の担当ドクターを\r\n{氏名} に変更します。…</c>
    /// (frm203002.cs:8115). Sau <c>Txt.N</c> thì xuống dòng thành khoảng trắng, nên cắt
    /// giữa 「を」 và 「に変更します。」 rồi trim là ra tên.</para>
    /// </summary>
    private static string ExtractDoctorFromPrompt(string prompt)
    {
        var text = Txt.N(prompt);
        var start = text.IndexOf("担当ドクターを", StringComparison.Ordinal);
        var end = text.IndexOf("に変更します。", StringComparison.Ordinal);
        if (start < 0 || end < 0 || end <= start) return "";

        start += "担当ドクターを".Length;
        return text[start..end].Trim();
    }

    // ── TC-MST-1 ────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("TC-MST-1 — nguồn của combo 担当医: master có user_no = 0 không, và combo có tự chèn dòng 0 không")]
    public void Tc1_ComboSourceHasNoSentinelDoctor()
    {
        var staff = _db.AllStaff();
        var zero = staff.Where(x => x.UserNo == 0).ToList();
        var oddKbn = staff.Where(x => x.UserKbn is not (0 or 1)).ToList();

        Kq("MST-1", $"IINMST2 {staff.Count} dòng · user_no=0: " +
                    (zero.Count == 0 ? "KHÔNG CÓ" : string.Join(" / ", zero.Select(x => x.ToString()))) +
                    " · user_kbn ngoài {0,1}: " +
                    (oddKbn.Count == 0 ? "KHÔNG CÓ" : string.Join(" / ", oddKbn.Select(x => x.ToString()))));

        // Vế đo được chắc chắn: MASTER không được có một 「bác sĩ」 mang chính số sentinel.
        // 0 là 未選択 ở khắp defData (frm203001.cs:705, :721) nên một dòng thật mang
        // user_no = 0 sẽ không phân biệt được với 「chưa chọn」.
        Assert.That(zero, Is.Empty,
            "IINMST2 có dòng user_no = 0 — trùng đúng sentinel 未選択 mà defData dùng " +
            "(frm203001.cs:705). Chọn đúng người đó thì app coi như CHƯA chọn ai. " +
            "Dòng gặp phải: " + string.Join(" / ", zero.Select(x => x.ToString())));

        // ★ LỆCH với bản web, ghi lại chứ KHÔNG assert: bên web TC-MST-1 đòi dropdown
        //   担当医 tuyệt đối không chứa user_no = 0. Bên WinForm combo cboDr được dựng
        //   bằng makeIinMstCombo(..., spcFlg: TRUE) (frm203002.cs:597) nên nó LUÔN có
        //   một dòng trống USER_NO = 0 chèn ở index 0 (EditControl.cs:660-676) — đó là
        //   dòng 未選択 CỐ Ý, không phải một bác sĩ lọt lưới.
        Kq("MST-1b", "★ LỆCH: combo cboDr của WinForm LUÔN có dòng trống USER_NO=0 ở index 0 " +
                     "(makeIinMstCombo spcFlg=true, frm203002.cs:597). Bản web TC-MST-1 đòi " +
                     "dropdown KHÔNG chứa user_no=0 — hai bên khác nhau về Ý NGHĨA của số 0: " +
                     "WinForm dùng nó làm dòng 未選択, web coi nó là dữ liệu bẩn.");

        if (oddKbn.Count > 0)
            Kq("MST-1c", "IINMST2 có 区分 ngoài {0,1} — đây chính là nhóm mà bản web sợ lọt " +
                         "vào dropdown khi feed không lọc 区分 (TC-MST-2).");
    }

    // ── TC-LBL-1 ────────────────────────────────────────────────────────────

    [Test, Order(2)]
    [Description("TC-LBL-1 — nhãn lbDr hiện 担当医 CỦA DÒNG, không phải giá trị của combo")]
    public void Tc2_LabelFollowsRowNotCombo()
    {
        var withDr = _rows.Where(r => r.DrNo > 0).ToList();
        if (withDr.Count == 0)
            IgnoreWithReason(
                $"患者{PatNo} không có dòng 処置 nào mang dr_no > 0 trong tháng {TrtDate:yyyy-MM} — " +
                "không dựng được trạng thái mà Chg_DrName lộ ra. Đổi patient.patNo / patient.trtDate.");

        // Dòng nào có dr_no KHÁC att_dr thì mới tách được nhãn khỏi combo: combo mang
        // formParam.UserNo, mà mở màn bằng AppNavigator (combo 患者選択 để trống) thì
        // UserNo = att_dr (frm203001.cs:694).
        var target = withDr.FirstOrDefault(r => r.DrNo != _attDr);
        if (target is null)
            IgnoreWithReason(
                $"mọi dòng trong tháng đều mang dr_no = att_dr ({_attDr}) — nhãn và combo sẽ " +
                "trùng nhau nên testcase xanh cả khi cả hai đọc chung một nguồn.");

        var day = target!.Day.ToString();
        var index = FocusRowWithDay(day);
        if (index < 0)
            IgnoreWithReason(
                $"không đứng được lên dòng có 日 = {day}. UIA chỉ phơi ra dòng ĐANG NHÌN THẤY " +
                $"(PROBE-GUIDELINE 3.1); 日 đọc được: {string.Join(",", _flow.VisibleDays().Take(20))}");

        var label = _flow.LabelText();
        var combo = _flow.ComboText();
        var rowNm = _db.DoctorName(target.DrNo);
        var attNm = _db.DoctorName(_attDr);
        Kq("LBL-1", $"đứng dòng 日={day} (dr_no={target.DrNo}「{rowNm ?? "?"}」) → " +
                    $"lbDr = 「{label}」 · cboDr = 「{combo}」 · att_dr={_attDr}「{attNm ?? "?"}」");

        Assert.That(rowNm, Is.Not.Null.And.Not.Empty,
            $"dr_no={target.DrNo} của dòng không có tên trong IINMST2 (user_kbn=0) — " +
            "dữ liệu hỏng, không phải app sai.");

        Assert.That(label, Is.EqualTo(rowNm),
            $"nhãn lbDr đang hiện 「{label}」 thay vì 担当医 của DÒNG là 「{rowNm}」." +
            (label == attNm
                ? " Nó đang hiện att_dr — tức là đọc từ combo/pintDrNo chứ không phải hFG1[69] " +
                  "của dòng. Chg_DrName (modMain.cs:2125-2138) chưa chạy hoặc đã bị gộp vào combo."
                : ""));

        Assert.That(label, Is.Not.EqualTo(combo),
            "nhãn và combo đang ra CÙNG một giá trị. Chúng phải trả lời hai câu khác nhau: " +
            "nhãn = 担当医 của dòng con trỏ (hFG1[69]), combo = 担当医 cho dòng THÊM MỚI " +
            "(pintDrNo). Trùng nhau nghĩa là hai control đã bị gộp làm một.");
    }

    // ── TC-LBL-2 ────────────────────────────────────────────────────────────

    [Test, Order(3)]
    [Description("TC-LBL-2 — cboDr ẩn cho tới khi click nhãn; hiện rồi thì nó giữ 担当医 cho dòng thêm mới")]
    public void Tc3_ComboHiddenUntilLabelClicked()
    {
        // Mở lại màn để chắc chắn chưa ai click nhãn (TC trước có thể đã lộ combo).
        ReopenTreatmentScreen();
        _flow = new HeaderStaffFlow(App, Screen);

        var before = _flow.ComboVisible();
        Kq("LBL-2", $"cboDr lúc mới mở màn: {(before ? "HIỆN" : "ẩn")}");

        Assert.That(before, Is.False,
            "cboDr đang HIỆN ngay khi mở màn. frm203002.cs:2478 đặt Visible = false; " +
            "nó chỉ được bật khi click nhãn (lbDr_Click, :8087) hoặc click caption " +
            "(lblDrLabel_Click, :8107). Hiện sẵn nghĩa là bản port đã bỏ mất trạng thái ẩn.");

        _flow.RevealCombo();
        var after = _flow.ComboVisible();
        var combo = _flow.ComboText();
        Kq("LBL-2b", $"sau khi click nhãn: {(after ? "HIỆN" : "vẫn ẩn")} · giá trị = 「{combo}」");

        Assert.That(after, Is.True,
            "click nhãn lbDr mà cboDr không hiện ra — lbDr_Click (frm203002.cs:8087) " +
            "phải đặt cboDr.Visible = true.");

        var attNm = _db.DoctorName(_attDr);
        if (attNm is not null)
            Assert.That(combo, Is.EqualTo(attNm),
                $"combo đang mang 「{combo}」 thay vì 担当医 mà 患者確定 chốt được " +
                $"({_attDr}「{attNm}」). Mở màn qua AppNavigator thì combo 患者選択 để trống " +
                "nên formParam.UserNo = person.att_dr (frm203001.cs:694), và frm203002.cs:425 " +
                "gán thẳng số đó vào cboDr.SelectedValue.");
    }

    // ── TC-BULK-1 ───────────────────────────────────────────────────────────

    [Test, Order(4)]
    [Description("TC-BULK-1 — click caption 「Ｄｒ」 hỏi đúng văn bản; bấm いいえ thì nhãn không đổi")]
    public void Tc4_BulkPromptWordingAndCancel()
    {
        // Đứng lại lên một dòng DỮ LIỆU trước: TC trước vừa click nhãn để lộ combo, và
        // lúc đó lưới mất focus nên CurrentDay() đọc ra rỗng (đo 2026-08-26).
        var rows = _flow.DataRows();
        if (rows.Count == 0)
            IgnoreWithReason(
                "lưới không có dòng DỮ LIỆU nào bấm được (đã lọc dòng tiêu đề, dòng trống " +
                "và dòng ngoài khung nhìn) — không đặt được con trỏ để hỏi 一括変更");
        _flow.FocusRow(rows[0].Index);

        var day = _flow.CurrentDay();
        if (day.Length == 0)
            IgnoreWithReason(
                $"đã đứng lên dòng #{rows[0].Index} (日={rows[0].Day}) mà CurrentDay() vẫn rỗng — " +
                "con trỏ lưới không nhận click, đọc ảnh trong artifacts\\screenshots trước khi kết luận");

        var labelBefore = _flow.LabelText();
        var comboBefore = _flow.ComboText();

        var prompt = _flow.ClickCaption();
        Kq("BULK-1", $"click caption 「Ｄｒ」 (日={day}) → " +
                     (prompt.Appeared ? $"「{prompt.Text}」" : "KHÔNG có hộp thoại"));

        Assert.That(prompt.Appeared, Is.True,
            "click caption 「Ｄｒ」 không bung hộp thoại nào. lblDrLabel_Click " +
            "(frm203002.cs:8105-8117) phải gọi Interaction.MsgBox 「ドクター変更」. " +
            "Nếu bản port bỏ chức năng 一括変更 thì đây là MẤT tính năng.");

        var text = Txt.N(prompt.Text);

        // Văn bản dựng THẲNG trong source, KHÔNG qua MSGTBL, nên khớp được từng chữ.
        Assert.That(text, Does.StartWith($"{day}日診療分の担当ドクターを"),
            $"câu hỏi phải mở đầu bằng 日 của DÒNG con trỏ ({day}). Đang là 「{text}」. " +
            "frm203002.cs:8115 dựng nó từ hFG1[0, CurrentCellAddress.Y].");
        Assert.That(text, Does.Contain("に変更します。"),
            $"thiếu 「に変更します。」 — 「{text}」");
        Assert.That(text, Does.Contain("よろしいですか？"),
            $"thiếu 「よろしいですか？」 — 「{text}」");

        // ★ Chi tiết dễ port sai: có MỘT DẤU CÁCH giữa tên Ｄｒ．và 「に変更します。」,
        //   và xuống dòng nằm TRƯỚC tên chứ không phải sau (`... + vbCrLf + cboDr.Text
        //   + " に変更します。"`). Doc của bản web ghi 「{氏名}に変更します。」 — không cách.
        Kq("BULK-1b", text.Contains(" に変更します。")
            ? "có DẤU CÁCH trước 「に変更します。」 — đúng frm203002.cs:8115"
            : "★ KHÔNG có dấu cách trước 「に変更します。」 — khác source WinForm, đối chiếu bản web");

        Assert.That(_flow.Answer(prompt.Dialog!, yes: false), Is.True,
            $"không tìm được nút 「いいえ」 trên hộp thoại 「{text}」. " +
            "Interaction.MsgBox với MsgBoxStyle.YesNo phải có はい/いいえ.");
        Waits.Step();

        Assert.That(_flow.LabelText(), Is.EqualTo(labelBefore),
            $"bấm 「いいえ」 mà nhãn đổi từ 「{labelBefore}」 sang 「{_flow.LabelText()}」 — " +
            "nhánh Yes (frm203002.cs:8121-8127) đã chạy dù người dùng từ chối.");
        Assert.That(_flow.ComboText(), Is.EqualTo(comboBefore),
            "bấm 「いいえ」 mà combo cũng đổi.");
    }

    // ── TC-BULK-2 ───────────────────────────────────────────────────────────

    [Test, Order(5)]
    [Description("TC-BULK-2 — bấm はい: MỌI dòng CÙNG NGÀY đổi theo combo, ngày khác giữ nguyên")]
    public void Tc5_BulkAppliesToWholeDayOnly()
    {
        var data = _flow.DataRows();
        var grouped = data.GroupBy(r => r.Day).ToList();

        var sameDayGroup = grouped.FirstOrDefault(g => g.Count() >= 2);
        if (sameDayGroup is null)
            IgnoreWithReason(
                "lưới không có NGÀY nào đọc được từ 2 dòng DỮ LIỆU trở lên nên không thấy được " +
                $"「mọi dòng cùng ngày đổi theo」. Đọc được: " +
                string.Join(",", data.Select(r => r.Day).Distinct()) +
                ". LƯU Ý UIA chỉ phơi ra dòng đang nhìn thấy (PROBE-GUIDELINE 3.1).");

        var sameDay = sameDayGroup!.Key;
        var indices = sameDayGroup.Select(r => r.Index).ToList();
        var otherRow = data.FirstOrDefault(r => r.Day != sameDay);

        // Ghi lại nhãn của dòng THỨ HAI cùng ngày và của một dòng ngày KHÁC.
        _flow.FocusRow(indices[1]);
        var secondBefore = _flow.LabelText();

        var otherBefore = "";
        if (otherRow is not null)
        {
            _flow.FocusRow(otherRow.Index);
            otherBefore = _flow.LabelText();
        }

        _flow.FocusRow(indices[0]);
        Kq("BULK-2", $"日={sameDay} có {indices.Count} dòng đọc được · " +
                     $"nhãn dòng thứ hai trước khi đổi = 「{secondBefore}」" +
                     (otherRow is null ? "" : $" · ngày khác {otherRow.Day} = 「{otherBefore}」"));

        var prompt = _flow.ClickCaption();
        Assert.That(prompt.Appeared, Is.True, "click caption không bung hộp thoại 一括変更");

        // Tên Ｄｒ．sắp áp lấy TỪ CHÍNH câu hỏi, không đọc ComboText().
        //
        // cboDr chỉ nằm trong cây UIA khi Visible = true (đo 2026-08-26: ẩn thì
        // Uia.ById trả null và ComboText() ra rỗng), mà đứng lên một dòng lưới lại làm
        // nó ẩn trở lại. Câu hỏi thì luôn mang đúng `cboDr.Text` mà nhánh Yes sắp ghi
        // (frm203002.cs:8115 dựng chuỗi từ chính nó), nên đây là nguồn chắc chắn hơn.
        var expectedNm = ExtractDoctorFromPrompt(prompt.Text);
        Assert.That(expectedNm, Is.Not.Empty,
            $"không tách được tên Ｄｒ．khỏi câu hỏi 「{prompt.Text}」 — khuôn phải là " +
            "「{日}日診療分の担当ドクターを…{氏名} に変更します。」 (frm203002.cs:8115)");
        Kq("BULK-2b", $"Ｄｒ．sắp áp (lấy từ câu hỏi) = 「{expectedNm}」");

        // Ｄｒ．sắp áp mà TRÙNG với nhãn sẵn có thì testcase không chứng minh được gì:
        // nó xanh y hệt nhau dù 一括変更 có chạy hay không. Thà Ignore còn hơn xanh rỗng.
        if (expectedNm == secondBefore)
        {
            _flow.Answer(prompt.Dialog!, yes: false);
            Waits.Step();
            IgnoreWithReason(
                $"Ｄｒ．sắp áp 「{expectedNm}」 TRÙNG với nhãn sẵn có của dòng thứ hai — " +
                "không phân biệt được 「一括変更 đã chạy」 với 「không làm gì」. Cần combo mang " +
                "một Ｄｒ．KHÁC: chọn Ｄｒ．khác ở 患者選択 trước khi mở màn, hoặc đổi " +
                "patient.patNo sang bệnh nhân có att_dr khác dr_no của các dòng.");
        }

        Assert.That(_flow.Answer(prompt.Dialog!, yes: true), Is.True,
            $"không tìm được nút 「はい」 trên hộp thoại 「{prompt.Text}」");
        Waits.Step();

        var comboNm = expectedNm;

        // Dời con trỏ sang dòng THỨ HAI cùng ngày — cột 69 là cột ẩn nên chỉ đọc được
        // gián tiếp qua nhãn, đúng cách mà bản Playwright cũng làm.
        _flow.FocusRow(indices[1]);
        var secondAfter = _flow.LabelText();
        Kq("BULK-2c", $"sau 「はい」: nhãn dòng thứ hai cùng ngày = 「{secondAfter}」 " +
                      $"(trước = 「{secondBefore}」, kỳ vọng = 「{comboNm}」)");

        Assert.That(secondAfter, Is.EqualTo(comboNm),
            $"dòng THỨ HAI của ngày {sameDay} vẫn hiện 「{secondAfter}」 thay vì 「{comboNm}」. " +
            "frm203002.cs:8121-8127 duyệt MỌI dòng có hFG1[0] bằng 日 hiện hành và ghi " +
            "hFG1[69] = cboDr.SelectedValue — không chỉ dòng con trỏ.");

        if (otherRow is not null && otherBefore.Length > 0)
        {
            _flow.FocusRow(otherRow.Index);
            var otherAfter = _flow.LabelText();
            Kq("BULK-2d", $"ngày khác {otherRow.Day}: trước = 「{otherBefore}」, sau = 「{otherAfter}」");
            Assert.That(otherAfter, Is.EqualTo(otherBefore),
                $"一括変更 của ngày {sameDay} đã đụng sang ngày {otherRow.Day} — vòng lặp phải lọc " +
                "theo hFG1[0] (frm203002.cs:8123).");
        }

        TestContext.Out.WriteLine(
            "LƯU Ý: 一括変更 chỉ sửa LƯỚI TRONG BỘ NHỚ. Fixture không bấm F9 nên KHÔNG có " +
            "dòng nào xuống TRNTRN; đóng màn hình mà không lưu là sạch.");
    }
}
