using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentGrid;

/// <summary>
/// <b>入力モード (点数 ↔ コード) và TRA CỨU 処置 từ ô 点.</b>
///
/// <para>Ô 点 KHÔNG phải ô nhập số thuần: Enter ở đó là một LẦN TRA CỨU 処置
/// (frm203002.cs:5560-5628 「case 3://点列」). Tra theo ĐIỂM khi đang 点数モード
/// (<c>ModMain.GetTrtmas</c>), theo MÃ khi đang コードモード
/// (<c>ModMain.GetTrtmasCod</c>).</para>
///
/// <para>Bên kia: <c>web-tenant-tests/tests/point-code-mode-code-enter-value.spec.ts</c>
/// (20 testcase, có sẵn từ trước) — nhưng spec đó đo ô 点 của DÒNG FOOTER 日計 và nhập
/// bằng <c>fill()</c>. Bộ này đo ô 点 CỦA MỘT DÒNG 処置 và gõ bằng BÀN PHÍM THẬT, tức
/// đúng đường mà người dùng đi và đúng đường mà <c>grdRegi_TextBox_KeyPress</c> nằm
/// trên đó. Hai bộ BỔ SUNG cho nhau, không thay thế nhau.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐO THẬT 2026-08-25 — bệnh nhân 10, ngày 2026-08-03
/// ═══════════════════════════════════════════════════════════════════════════
///  P1  nhãn 入力モード lúc mở màn        → 「点数」
///  P2  click nhãn lbInpMode              → 「点数」 ↔ 「コード」
///  P3  コードモード, gõ 「99999」          → 「該当処置はありません。」
///  P4  コードモード, gõ 「116-5」          → editor thành 「1165」 → 「該当処置はありません。」
///  P5  コードモード, gõ 「17」             → 処置選択 mở KÈM ô nhập 「自費金額」
///
/// ═══════════════════════════════════════════════════════════════════════════
/// P4 — CHỖ NHIỀU NGƯỜI HIỂU SAI NHẤT
/// ═══════════════════════════════════════════════════════════════════════════
/// Ai đọc source cũng nghĩ 「116-5」 đi qua <c>Conversion.Val</c> nên thành <b>116</b>
/// rồi tra ra 処置 116. SAI. Bộ lọc phím chạy TRƯỚC: <c>grdRegi_TextBox_KeyPress</c>
/// (frm203002.cs:3601-3639) chỉ cho '0'..'9' đi qua trên cột 点, nên dấu 「-」 bị NUỐT
/// ngay lúc gõ — chuỗi trong editor là <b>1165</b>, và <c>Val("1165")</c> = 1165.
/// Kết quả: KHÔNG tra ra gì, bung 「該当処置はありません。」.
///
/// Đo cả hai bên 2026-08-25, GÕ BẰNG BÀN PHÍM vào ô 点 CỦA MỘT DÒNG 処置:
/// <b>WinForm và bản web CÙNG ra 「1165」 → 「該当処置はありません。」</b> ⇒ KHỚP NHAU.
///
/// <para>⚠️ Đừng đem so thẳng với testcase 「コード-枝番」 của
/// <c>point-code-mode-code-enter-value.spec.ts</c>: nó đo một thứ KHÁC. Nó gõ vào ô 点
/// của DÒNG FOOTER 日計 (<c>data-footer-cell</c>), và dùng <c>locator.fill()</c> — hàm
/// này GÁN THẲNG giá trị, KHÔNG sinh sự kiện phím, nên bộ lọc ký tự không bao giờ chạy
/// và chuỗi 「116-5」 vào ô nguyên vẹn rồi mới qua <c>conversionVal</c>. Khác cả PHẦN TỬ
/// lẫn ĐƯỜNG NHẬP. (Tôi đã suýt "sửa" spec đó theo số đo của bộ này — sai, vì hai bên
/// không đo cùng một thứ.)</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// P5 — LỆCH PARITY ĐÃ XÁC NHẬN BẰNG ẢNH
/// ═══════════════════════════════════════════════════════════════════════════
/// WinForm: 処置選択 hiện hai dòng 17-0 自費(税なし) / 17-1 自費(税あり), và ngay TRONG
/// dialog đó có ô nhập 「自費金額」 kèm câu 「自費金額を入力してください。」 (nút F9 確定 /
/// F10 戻る).
///
/// Bản web: mở đúng 処置選択 với đúng hai dòng đó, nhưng KHÔNG có ô nhập 自費金額.
/// Chính spec web đã tự ghi nhận: 「commitPick chưa route mã cần form nhập của
/// frm203016 — 17 自費金額 / 179-5 残根数 / 202・203 IS」. Nay điều đó được ĐO, không
/// còn là suy đoán.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Không bấm F9 登録. P3/P4 chỉ bung thông báo lỗi rồi ô 点 bị xoá trắng
/// (frm203002.cs:5618-5620) — không dòng nào vào lưới. P5 mở dialog rồi để nguyên.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-edit-treatment-rows.ps1 -Case PointCode
/// </summary>
[TestFixture]
[Category("treatment-grid")]
public sealed class TreatmentGridPointCodeTests : UiTestBase
{
    /// <summary>Thông báo 0 kết quả — modMain.cs:280/:480/:597, MsgBox title 「エラー」.</summary>
    private const string NoMatchMessage = "該当処置はありません。";

    private TreatmentGridOps _grid = null!;

    [OneTimeSetUp]
    public void PointCodeOneTimeSetUp() => _grid = new TreatmentGridOps(Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void LogKq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>Nhãn 入力モード — <c>lbInpMode</c> (frm203002.Designer.cs:894-900).</summary>
    private string InpMode()
    {
        var box = Uia.ById(Screen.Window, "lbInpMode");
        if (box is null) IgnoreWithReason("không thấy nhãn 入力モード (lbInpMode) trên màn hình");
        return Txt.N(Uia.ValueOf(box!));
    }

    /// <summary>
    /// Đổi 入力モード bằng cách CLICK CHÍNH CÁI NHÃN (<c>lbInpMode_Click</c>,
    /// frm203002.cs:7126).
    ///
    /// <para>Không dùng nút F9/F10 của lớp ON: probe 2026-08-25 cho thấy KHÔNG có control
    /// nào mang AutomationId <c>btnF9_S</c>/<c>btnF10_S</c> — hai lớp phím dùng chung một
    /// bộ nút, chỉ đổi nhãn. Click nhãn là đường ngắn và chắc chắn nhất.</para>
    /// </summary>
    private void ToggleInpMode()
    {
        var label = Uia.ById(Screen.Window, "lbInpMode");
        if (label is null) IgnoreWithReason("không thấy nhãn 入力モード (lbInpMode)");
        var (x, y) = Uia.Center(label!);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
        Thread.Sleep(400);
    }

    /// <summary>Đưa màn hình về đúng mode cần đo.</summary>
    private void EnsureMode(string want)
    {
        for (var i = 0; i < 3 && !Txt.Same(InpMode(), want); i++) ToggleInpMode();
        Assert.That(InpMode(), Is.EqualTo(want),
            $"không chuyển được 入力モード sang 「{want}」 (đang là 「{InpMode()}」)");
    }

    /// <summary>Hộp thoại THẬT — xem giải thích ở <see cref="TreatmentGridAdvancedTests"/>.</summary>
    private IReadOnlyList<FlaUI.Core.AutomationElements.Window> RealDialogs()
    {
        var result = new List<FlaUI.Core.AutomationElements.Window>();
        foreach (var d in ModalDialogs.All(App, Screen.Window))
        {
            try
            {
                if (d.FindAllDescendants(cf =>
                        cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button)).Length > 0)
                    result.Add(d);
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return result;
    }

    private FlaUI.Core.AutomationElements.Window? WaitForDialog(string contains, int seconds = 12)
    {
        FlaUI.Core.AutomationElements.Window? hit = null;
        Waits.TryUntil(() =>
        {
            hit = RealDialogs().FirstOrDefault(d => Txt.Has(Dialogs.TextOf(d), contains));
            return hit is not null;
        }, TimeSpan.FromSeconds(seconds));
        return hit;
    }

    private string DescribeDialogs()
    {
        var all = RealDialogs().Select(d => "「" + Txt.N(Dialogs.TextOf(d)).Replace("\n", " ") + "」").ToList();
        return all.Count == 0 ? "(không có hộp thoại nào)" : string.Join(" / ", all);
    }

    private void DismissAll()
    {
        for (var i = 0; i < 4; i++)
        {
            var open = RealDialogs();
            if (open.Count == 0) return;
            foreach (var d in open)
                if (!Dialogs.ClickButton(d, "OK", "いいえ", "No"))
                    Dialogs.ClickButton(d, "戻る", "キャンセル", "Cancel");
            Waits.TryUntil(() => RealDialogs().Count == 0, TimeSpan.FromSeconds(3));
        }
    }

    /// <summary>Một 処置行 gõ được vào ô 点 (không phải 部位行, không phải 日計行).</summary>
    private RegiRow TargetRow()
    {
        var row = _grid.Snapshot().FirstOrDefault(
            r => Txt.N(r.Ten) is not ("-" or "－") && !Txt.Has(r.Ryo, "日計") && r.Ryo.Length > 0);
        if (row is null)
            IgnoreWithReason("lưới không có 処置行 nào để gõ vào ô 点 — đổi patient.trtDate " +
                             "sang ngày CÓ 処置 trong testsettings.local.json");
        return row!;
    }

    /// <summary>Gõ một chuỗi vào ô 点 rồi Enter; trả về nội dung editor NGAY TRƯỚC Enter.</summary>
    private string TypeIntoTenAndEnter(TestTrace trace, RegiRow row, string typed)
    {
        trace.Do($"dat con tro vao o 点 roi go 「{typed}」", () =>
        {
            _grid.FocusCell(row, RegiGrid.Col.Ten);
            if (!_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(300);
            _grid.Type(typed);
        });

        var editor = _grid.EditorText();
        LogKq("x", $"editor NGAY TRƯỚC Enter: 「{editor}」");
        trace.Do("Enter", () => _grid.Press(VirtualKeyShort.RETURN));
        Thread.Sleep(800);
        return editor;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-P1 / TC-P2 — 入力モード
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-P1 — 入力モード mặc định là 「点数」 (flgInpMode = ePoint, frm203002.cs:3024)")]
    public void TcP1_DefaultInputMode_IsPoint()
    {
        using var trace = TestTrace.Begin();
        var mode = InpMode();
        LogKq("P1", $"nhãn 入力モード lúc mở màn: 「{mode}」");

        Assert.That(mode, Is.EqualTo("点数"),
            "màn 診療入力 phải mở ở 点数モード — `flgInpMode = eInpMode.ePoint` lúc khởi tạo " +
            $"(frm203002.cs:3024). Đang là 「{mode}」.");
    }

    [Test, Order(2)]
    [Description("TC-P2 — click nhãn 入力モード đổi 点数 ↔ コード (lbInpMode_Click, frm203002.cs:7126)")]
    public void TcP2_ClickingModeLabel_TogglesMode()
    {
        using var trace = TestTrace.Begin();
        EnsureMode("点数");

        trace.Do("click nhan 入力モード", ToggleInpMode);
        var afterFirst = InpMode();
        LogKq("P2", $"click lần 1: 「点数」 → 「{afterFirst}」");

        trace.Do("click nhan 入力モード lan hai", ToggleInpMode);
        var afterSecond = InpMode();
        LogKq("P2", $"click lần 2: 「{afterFirst}」 → 「{afterSecond}」");

        // lbInpMode_Click: đang eCod thì gọi KeyFunc(F9) (→点数), ngược lại KeyFunc(F10).
        // Tức chính cái NHÃN là một nút bấm được — dễ bỏ sót khi port.
        Assert.Multiple(() =>
        {
            Assert.That(afterFirst, Is.EqualTo("コード"),
                "click nhãn lần 1 phải đổi 「点数」 → 「コード」 (frm203002.cs:7126)");
            Assert.That(afterSecond, Is.EqualTo("点数"),
                "click nhãn lần 2 phải đổi ngược về 「点数」");
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-P3 — mã không tồn tại
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC-P3 — コードモード, mã không tồn tại → 「該当処置はありません。」 (modMain.cs:597)")]
    public void TcP3_CodeMode_UnknownCode_ShowsNoMatchMessage()
    {
        using var trace = TestTrace.Begin();
        DismissAll();
        EnsureMode("コード");
        var row = TargetRow();

        var rowsBefore = _grid.RowCount();
        TypeIntoTenAndEnter(trace, row, "99999");

        var dialog = WaitForDialog(NoMatchMessage);
        LogKq("P3", $"hộp thoại: {DescribeDialogs()}");

        Assert.That(dialog, Is.Not.Null,
            $"mã không tồn tại phải bung 「{NoMatchMessage}」 (modMain.cs:597, MsgBox title 「エラー」). " +
            $"Đang thấy: {DescribeDialogs()}");

        DismissAll();

        // Tra hụt thì EndEdit + CurrentCell.Value = "" (frm203002.cs:5618-5620) — KHÔNG
        // dòng nào được thêm vào lưới.
        Assert.That(_grid.RowCount(), Is.EqualTo(rowsBefore),
            $"tra cứu hụt KHÔNG được thêm dòng nào: {rowsBefore} → {_grid.RowCount()}");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-P4 — 「116-5」 bị bộ lọc phím nuốt dấu gạch ngang
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC-P4 — 「116-5」: dấu 「-」 bị bộ lọc phím nuốt ⇒ editor thành 「1165」, không tra ra")]
    public void TcP4_CodeMode_HyphenIsSwallowed_NotParsedAsSubCode()
    {
        using var trace = TestTrace.Begin();
        DismissAll();
        EnsureMode("コード");
        var row = TargetRow();

        var editor = TypeIntoTenAndEnter(trace, row, "116-5");
        LogKq("P4", $"gõ 「116-5」 → editor 「{editor}」");

        // ĐÂY LÀ CHỖ DỄ HIỂU SAI NHẤT CỦA CẢ MÀN HÌNH.
        //
        // Đọc source thì thấy ô 点 đi qua Conversion.Val, nên ai cũng suy ra 「116-5」 → 116
        // rồi tra ra 処置 116. SAI: bộ lọc phím chạy TRƯỚC. grdRegi_TextBox_KeyPress
        // (frm203002.cs:3601-3639) chỉ cho '0'..'9' đi qua trên cột 点 ⇒ dấu 「-」 bị nuốt
        // NGAY LÚC GÕ, chuỗi thành 「1165」, và Val("1165") = 1165 — một mã không tồn tại.
        //
        // Đo 2026-08-25: WinForm và bản web CÙNG ra 「1165」 ⇒ hai bên KHỚP. Spec Playwright
        // trước đó assert phải mở 処置選択 theo mã 116 — kỳ vọng sai với cả hai bản.
        Assert.That(editor, Is.EqualTo("1165"),
            $"gõ 「116-5」 vào ô 点 phải ra 「1165」: dấu 「-」 bị grdRegi_TextBox_KeyPress nuốt " +
            $"(frm203002.cs:3601-3639) TRƯỚC khi Conversion.Val chạy. Editor đang là 「{editor}」. " +
            "Ra 「116-5」 nghĩa là bộ lọc phím chưa được port; ra 「116」 nghĩa là đã cắt tại dấu " +
            "gạch ngang — cả hai đều KHÁC WinForm.");

        var dialog = WaitForDialog(NoMatchMessage);
        LogKq("P4", $"hộp thoại: {DescribeDialogs()}");
        Assert.That(dialog, Is.Not.Null,
            $"mã 1165 không có trong master nên phải bung 「{NoMatchMessage}」. " +
            $"Đang thấy: {DescribeDialogs()}");

        DismissAll();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-P5 — mã 17: 処置選択 KÈM ô nhập 自費金額.  ĐẶT CUỐI CÙNG.
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC-P5 — mã 17 mở 処置選択 KÈM ô nhập 自費金額 (chỗ bản web còn thiếu)")]
    public void TcP5_Code17_OpensPickerWithJihiAmountInput()
    {
        using var trace = TestTrace.Begin();
        DismissAll();
        EnsureMode("コード");
        var row = TargetRow();

        TypeIntoTenAndEnter(trace, row, "17");

        var picker = WaitForDialog("処置選択") ?? WaitForDialog("自費金額");
        LogKq("P5", $"hộp thoại: {DescribeDialogs()}");
        trace.Shot("P5-ma-17");

        Assert.That(picker, Is.Not.Null,
            $"mã 17 phải mở 処置選択. Đang thấy: {DescribeDialogs()}");

        var text = Txt.N(Dialogs.TextOf(picker!)).Replace("\n", " ");

        // ĐO THẬT 2026-08-25 (có ảnh): dialog hiện hai dòng 17-0 自費(税なし) / 17-1
        // 自費(税あり), VÀ ngay trong chính dialog đó có ô nhập 「自費金額」 kèm câu
        // 「自費金額を入力してください。」.
        //
        // ⚠️ ĐÂY LÀ CHỖ LỆCH: bản web mở đúng 処置選択 với đúng hai dòng đó nhưng KHÔNG có
        // ô nhập 自費金額. Chính spec web đã tự ghi 「commitPick chưa route mã cần form nhập
        // của frm203016 — 17 自費金額 / 179-5 残根数 / 202・203 IS」; nay điều đó được ĐO chứ
        // không còn là suy đoán.
        Assert.Multiple(() =>
        {
            Assert.That(text, Does.Contain(Txt.N("自費")),
                $"処置選択 của mã 17 phải liệt kê các dòng 自費. Nội dung: 「{text}」");

            Assert.That(text, Does.Contain(Txt.N("自費金額")),
                "処置選択 của mã 17 phải có Ô NHẬP 「自費金額」 ngay trong dialog " +
                "(câu 「自費金額を入力してください。」 + F9 確定 / F10 戻る). Thiếu nó nghĩa là " +
                $"mã cần form nhập chưa được nối. Nội dung: 「{text}」");
        });

        // ⚠️ KHÔNG dọn: dialog này đóng bằng F10 戻る của chính nó, mà probe 2026-08-25 thử
        // đủ đường đều trượt. Vì thế TC-P5 xếp CUỐI fixture — runner kill MENU.exe sau mỗi
        // lượt chạy nên trạng thái này không ảnh hưởng lượt sau.
        LogKq("P5", "để nguyên dialog — xem ghi chú trong code");
    }
}
