using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.CodeEntryFailPaths;

/// <summary>
/// Hai nhánh THẤT BẠI của <c>ModMain.GetTrtmasCod</c> mà §B2 cố ý chưa sửa — đo xem ô 点
/// giữ số hay bị xoá trắng.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHỐT TỪ SOURCE TRƯỚC (đọc rồi mới đo — F1)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>GetTrtmasCod</c> khởi tạo <c>bool functionReturnValue = false</c> (modMain.cs:503), và
/// caller xử lý <c>ret == false</c> bằng:
/// <code>
///   grdRegi.EndEdit();
///   hFG1.CurrentCell.Value = "";        // ← XOÁ Ô ĐANG ĐỨNG  (frm203002.cs:5605-5607)
/// </code>
///
/// <para><b>① Mã 50 (笑気/IS)</b> — modMain.cs:542-552 mở <c>frm203016</c> rồi
/// <c>return functionReturnValue</c> mà <b>chưa bao giờ gán</b> ⇒ luôn <c>false</c> ⇒ caller
/// luôn xoá. NHƯNG <c>frm203016</c> ở chế độ <c>_flg50</c> (frm203016.cs:373-377) làm:</para>
/// <code>
///   frmInpMain.AddRow();                                    // chèn dòng MỚI
///   grdRegi[3, CurrentCellAddress.Y].Value = n2oScore;      // ghi 点 vào dòng mới
///   grdRegi.CurrentCell = grdRegi[X, CurrentCellAddress.Y + 1];   // DỜI con trỏ XUỐNG
/// </code>
/// …lặp cho O2 (frm203016.cs:831-884). Tức lúc caller xoá, <c>CurrentCell</c> đã KHÔNG còn là
/// ô mà dialog vừa ghi. <b>Câu hỏi đo:</b> ô nào cuối cùng bị trống — dòng N2O/O2 có giữ được
/// 点数 không, và dòng gốc (đã có 点数 từ trước) có bị xoá oan không?
///
/// <para><b>② Huỷ 処置選択</b> — modMain.cs:584 đặt <c>functionReturnValue = true</c> sau khi
/// tra master xong; rồi sau picker:</para>
/// <code>
///   if (string.IsNullOrEmpty(hFG1[6, CurrentCellAddress.Y].Value.ToString()))
///       functionReturnValue = false;                        // modMain.cs:688-690
/// </code>
/// Cột 6 là <c>TRT_CD</c> của dòng đang đứng ⇒ <b>kết cục phụ thuộc dòng đó đã có 処置 chưa</b>:
/// <list type="table">
///   <item><term>dòng ĐÃ CÓ 処置</term><description><c>hFG1[6]</c> khác rỗng ⇒ ret <b>true</b>
///     ⇒ caller KHÔNG xoá, chỉ <c>Move_Cell(Right)</c>. <b>ĐO ĐƯỢC 2026-09-22: ô 点 thành
///     CHÍNH MÃ VỪA GÕ</b> (150 → 116), không giữ số cũ — vì text của editor thắng giá trị ô
///     sau <c>Move_Cell</c>, đúng như comment ở frm203002.cs:5597-5599 thú nhận.</description></item>
///   <item><term>dòng TRỐNG</term><description><c>hFG1[6]</c> rỗng ⇒ ret <b>false</b> ⇒
///     <b>xoá</b> (mã vừa gõ bị wipe)</description></item>
/// </list>
/// Chính cặp này là phép đo: cùng một thao tác, hai dòng khác nhau, hai kết cục khác nhau.
///
/// <para><b>CHỈ ĐỌC</b> — không seed, không bấm F9 登録.</para>
/// </summary>
[TestFixture]
[CancelAfter(900_000)]
public sealed class CodeEntryFailTests : UiTestBase
{
    /// <summary>Mã có NHIỀU 候補 ⇒ 処置選択 chắc chắn bung (116/7..116/18 — 18 dòng).</summary>
    public const int MultiCandidateCode = 116;

    /// <summary>笑気 (IS) — mã ẢO, KHÔNG có trong <c>MST_TRT266</c>; frm203016 tự dựng 2 dòng.</summary>
    public const int IsCode = 50;

    /// <summary>Ô nhập Ｎ２Ｏ使用リッター数 (frm203016.Designer.cs).</summary>
    public const string N2OBoxId = "txtVal";

    /// <summary>Ô nhập Ｏ２使用リッター数.</summary>
    public const string O2BoxId = "txtVal2";

    private SigaToothFlow _flow = null!;

    private static void Log(string l) => TestContext.Out.WriteLine(l);

    /// <summary>Ca này ĐANG ĐO chuỗi hộp thoại — không để watcher trả lời hộ (F19).</summary>
    protected override string[] NuisanceDialogPatterns => [];

    [SetUp]
    public void Init() => _flow = new SigaToothFlow(App, Screen);

    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Dòng của ngày test <b>đã có 点数 &gt; 0</b> (tức đã mang một 処置).</summary>
    private RegiRow RequireScoredRow(TestTrace trace)
    {
        var day = TrtDate.Day;
        new CmtPackOps(_flow).ScrollToLastRowOfDay(day, trace);
        var row = _flow.Grid.Snapshot(200)
            .LastOrDefault(r => Txt.Int(r.Day) == day && Txt.Int(r.Ten) is > 0);
        Assert.That(row, Is.Not.Null,
            $"Ngày {day} không có dòng nào mang 点数 > 0 ⇒ không dựng được vế 「dòng ĐÃ CÓ 処置」. " +
            "Lưới:\n  " + string.Join("\n  ", _flow.DescribeGrid(60)));
        return row!;
    }

    /// <summary>Gõ <paramref name="code"/> vào ô 点 của <paramref name="row"/> ở コードモード.</summary>
    private void EnterCode(RegiRow row, int code, TestTrace trace)
    {
        Assert.That(_flow.EnsureCodeMode(), Is.True,
            $"Không đưa được ô 点 về コードモード — đang là 「{_flow.InpMode()}」 ⇒ HARNESS hỏng.");

        trace.Do($"go {code} vao o 点 cua dong 「{row}」 roi Enter", () =>
        {
            _flow.Grid.FocusCell(row, RegiGrid.Col.Ten);
            if (!_flow.Grid.IsEditing()) _flow.Grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _flow.Grid.Type(code.ToString());
            _flow.Grid.Press(VirtualKeyShort.RETURN);
        });
    }

    /// <summary>Đọc lại một dòng theo ô 療法・処置 (chỉ số trôi sau mỗi lần app chèn dòng).</summary>
    private RegiRow? FindByRyo(string ryo) =>
        _flow.Grid.Snapshot(200).FirstOrDefault(r => Txt.N(r.Ryo) == Txt.N(ryo));

    // ═════════════════════════════════════════════════════════════════════════
    // ② Huỷ 処置選択
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCF_10 — huỷ 処置選択 trên dòng ĐÃ CÓ 処置 ⇒ ô 点 thành CHÍNH MÃ VỪA GÕ")]
    public void TCF_10_CancelPicker_OnOccupiedRow_KeepsTypedCode()
    {
        using var trace = TestTrace.Begin();

        var row = RequireScoredRow(trace);
        var tenBefore = row.Ten;
        var ryo = row.Ryo;
        Log($"=== DÒNG ĐEM THỬ (đã có 処置) === 「{row}」 · 点 TRƯỚC = 「{tenBefore}」");

        EnterCode(row, MultiCandidateCode, trace);

        var picker = Waits.TryFor(_flow.Picker, TimeSpan.FromSeconds(15));
        Assert.That(picker, Is.Not.Null,
            $"Gõ {MultiCandidateCode} mà 処置選択 KHÔNG bung ⇒ tiền đề hỏng (mã này phải có nhiều " +
            "候補). Hộp thoại đang mở: " + _flow.DescribeDialogs());
        Log($"処置選択 có {_flow.PickerRows(picker!).Count} dòng — huỷ bằng 戻る");
        trace.Shot("picker-truoc-khi-huy");

        Assert.That(_flow.ClosePicker(picker!), Is.True, "Không huỷ được 処置選択.");
        Thread.Sleep(1200);
        trace.Shot("sau-khi-huy-picker-dong-co-処置");

        var after = FindByRyo(ryo);
        Assert.That(after, Is.Not.Null,
            $"Mất dấu dòng 「{ryo}」 sau khi huỷ picker — đọc ảnh trước khi kết luận.");
        Log($"=== KQ-TCF10 === 点 TRƯỚC = 「{tenBefore}」 · 点 SAU = 「{after!.Ten}」");

        Assert.That(Txt.Int(after.Ten), Is.EqualTo(MultiCandidateCode),
            $"Huỷ 処置選択 trên dòng ĐÃ CÓ 処置: ô 点 đang là 「{after.Ten}」, mong đợi " +
            $"「{MultiCandidateCode}」 — tức CHÍNH MÃ VỪA GÕ.\n" +
            "  ⛔ ĐÂY LÀ HÀNH VI THẬT CỦA WINFORM, ĐỪNG SỬA ASSERT CHO 「HỢP TRỰC GIÁC」.\n" +
            $"  Đo được 2026-09-22: dòng 「ペリオクリン 0.5g(3シリンジ)」 có 点 = 150, gõ " +
            $"{MultiCandidateCode} rồi HUỶ picker ⇒ 点 thành {MultiCandidateCode}. Không giữ 150, " +
            "cũng không bị xoá.\n" +
            "  Cơ chế: cột 6 (TRT_CD) của dòng này KHÁC RỖNG nên functionReturnValue giữ true " +
            "(modMain.cs:584, :688-690) ⇒ caller KHÔNG chạy nhánh xoá mà đi nhánh true:\n" +
            "      txtInp.Text = hFG1[3, Y].Value;  Move_Cell(Right);   (frm203002.cs:5597-5600)\n" +
            "  Chính comment ở đó thú nhận 「Move_Cell 呼出した後、txtInp.Text の値に戻ってしまう」 — " +
            "text của editor THẮNG giá trị ô sau khi dời con trỏ, và khi picker bị huỷ thì text " +
            "đó vẫn là mã vừa gõ.\n" +
            "  ⚠️ HỆ QUẢ: người dùng gõ nhầm mã rồi huỷ picker là 点数 của dòng cũ bị thay bằng " +
            "con số mã. Chưa lưu (cần F9), nhưng nếu bấm F9 thì thành dữ liệu sai. Vế web cần " +
            "đối chiếu riêng — ghi chú gốc §B2 giả định web 「giữ 点数 cũ」, tức LỆCH cả với " +
            "WinForm lẫn với giả định ban đầu.");
    }

    [Test, Order(2)]
    [Description("TCF_11 — huỷ 処置選択 trên dòng TRỐNG ⇒ ô 点 bị XOÁ (ret = false)")]
    public void TCF_11_CancelPicker_OnBlankRow_ClearsPoint()
    {
        using var trace = TestTrace.Begin();

        var seat = RequireScoredRow(trace);
        var blank = _flow.InsertBlankRow(seat, trace);
        Assert.That(blank, Is.Not.Null, "Insert không chèn được dòng trống ⇒ HARNESS hỏng.");
        Log($"=== DÒNG ĐEM THỬ (trống) === 「{blank}」");

        // Đọc lại từ bản chụp TƯƠI: RegiRow là ẢNH CHỤP, dùng lại sau khi lưới vẽ lại là
        // click vào toạ độ cũ (F10).
        var fresh = _flow.Grid.Snapshot(200).ToList();
        var target = fresh.FirstOrDefault(r => r.Index == blank!.Index);
        Assert.That(target, Is.Not.Null, "Mất dấu dòng trống vừa chèn.");

        EnterCode(target!, MultiCandidateCode, trace);

        var picker = Waits.TryFor(_flow.Picker, TimeSpan.FromSeconds(15));
        Assert.That(picker, Is.Not.Null,
            $"Gõ {MultiCandidateCode} mà 処置選択 KHÔNG bung. Hộp thoại: " + _flow.DescribeDialogs());
        trace.Shot("picker-truoc-khi-huy-dong-trong");

        Assert.That(_flow.ClosePicker(picker!), Is.True, "Không huỷ được 処置選択.");
        Thread.Sleep(1200);
        trace.Shot("sau-khi-huy-picker-dong-trong");

        var after = _flow.Grid.Snapshot(200).FirstOrDefault(r => r.Index == target!.Index);
        Assert.That(after, Is.Not.Null, "Mất dấu dòng trống sau khi huỷ picker.");
        Log($"=== KQ-TCF11 === dòng trống sau khi huỷ: 「{after}」 · 点 = 「{after!.Ten}」");

        Assert.That(SigaToothFlow.IsBlank(after.Ten), Is.True,
            $"Huỷ 処置選択 trên dòng TRỐNG: ô 点 đang giữ 「{after.Ten}」 thay vì trống.\n" +
            "  Theo modMain.cs:688-690, cột 6 của dòng trống là RỖNG nên functionReturnValue " +
            "về false ⇒ caller chạy nhánh xoá (frm203002.cs:5605-5607) và mã vừa gõ " +
            $"({MultiCandidateCode}) phải bị wipe.\n" +
            "  ⚠️ Cặp TCF_10 / TCF_11 là phép đo: CÙNG thao tác, khác nhau ở chỗ dòng đã có " +
            "処置 hay chưa. Nếu cả hai cùng kết quả thì một trong hai tiền đề đã hỏng.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ① Mã 50 (笑気/IS)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCF_20 — mã 50 (IS): N2O/O2 GIỮ 点数, còn DÒNG GỐC bị xoá trắng 点数")]
    public void TCF_20_IsCode50_ClearsOriginalRowNotTheNewOnes()
    {
        using var trace = TestTrace.Begin();

        var row = RequireScoredRow(trace);
        var tenBefore = row.Ten;
        var ryo = row.Ryo;
        Log($"=== DÒNG ĐEM THỬ === 「{row}」 · 点 TRƯỚC = 「{tenBefore}」");
        Log("lưới TRƯỚC:\n  " + string.Join("\n  ", _flow.DescribeGrid(200)
            .Skip(Math.Max(0, row.Index - 3)).Take(8)));

        EnterCode(row, IsCode, trace);

        var dlg = Waits.TryFor(_flow.Picker, TimeSpan.FromSeconds(15));
        Assert.That(dlg, Is.Not.Null,
            $"Gõ {IsCode} mà frm203016 KHÔNG bung. Theo modMain.cs:542-551 nó phải mở ở chế độ " +
            "_flg50 (2 dòng N2O/O2 + ô nhập lít). Hộp thoại: " + _flow.DescribeDialogs());
        trace.Shot("frm203016-che-do-IS");
        Log($"frm203016 có {_flow.PickerRows(dlg!).Count} dòng: " +
            string.Join(" · ", _flow.PickerRows(dlg!).Select(p => p.ToString())));

        // ── nhập lít: txtVal (N2O) → Enter → txtVal2 (O2) → Enter ──────────
        // App đọc thẳng .Text ở KeyDown (frm203016.cs:266, :332) nên ghi bằng ValuePattern
        // rồi bắn Enter là đủ — cùng ngoại lệ có chủ ý của F13 mà PackDialogs đã ghi.
        var n2o = Uia.ById(dlg!, N2OBoxId);
        var o2 = Uia.ById(dlg!, O2BoxId);
        Assert.That(n2o, Is.Not.Null,
            $"Không thấy ô 「{N2OBoxId}」 trên frm203016 ⇒ app đổi tên control (F23) hoặc dialog " +
            "không ở chế độ _flg50. Đọc ảnh 「frm203016-che-do-IS」.");
        Assert.That(o2, Is.Not.Null, $"Không thấy ô 「{O2BoxId}」.");

        trace.Do("go 5 lit N2O roi Enter", () =>
        {
            n2o!.Focus(); Uia.SetText(n2o, "5"); Thread.Sleep(200);
            Keyboard.Press(VirtualKeyShort.RETURN);
        });
        Thread.Sleep(800);
        trace.Do("go 5 lit O2 roi Enter", () =>
        {
            o2!.Focus(); Uia.SetText(o2, "5"); Thread.Sleep(200);
            Keyboard.Press(VirtualKeyShort.RETURN);
        });
        Thread.Sleep(2000);
        trace.Shot("sau-khi-nhap-lit");

        // dialog tự đóng sau setIS; nếu còn mở thì ghi lại (đừng đoán)
        if (_flow.Picker() is { } still)
        {
            trace.Note("frm203016 VAN con mo sau hai cu Enter — ghi lai roi huy.");
            trace.Shot("frm203016-van-mo");
            _flow.ClosePicker(still);
        }
        Thread.Sleep(1200);

        // ── ĐO: lưới quanh dòng gốc, ô nào trống ───────────────────────────
        var after = _flow.Grid.Snapshot(200).ToList();
        var origIdx = after.FindIndex(r => Txt.N(r.Ryo) == Txt.N(ryo));

        Log("=== KQ-TCF20 === lưới SAU (quanh dòng gốc):");
        var from = origIdx >= 0 ? Math.Max(0, origIdx - 2) : 0;
        foreach (var r in after.Skip(from).Take(9)) Log($"   {r}");

        var n2oRow = after.FirstOrDefault(r => Txt.Has(r.Ryo, "N2O"));
        var o2Row = after.FirstOrDefault(r => Txt.Has(r.Ryo, "O2"));
        Log($"   dòng N2O: {(n2oRow?.ToString() ?? "KHÔNG THẤY")}");
        Log($"   dòng O2 : {(o2Row?.ToString() ?? "KHÔNG THẤY")}");
        Log($"   dòng gốc 「{ryo}」: 点 TRƯỚC = 「{tenBefore}」 · " +
            $"点 SAU = 「{(origIdx >= 0 ? after[origIdx].Ten : "MẤT DẤU")}」");

        Assert.That(n2oRow, Is.Not.Null,
            "frm203016 không đẩy được dòng N2O xuống lưới ⇒ chưa tới được cái đang đo (có thể ô " +
            "nhập lít không nhận giá trị). Đọc ảnh 「sau-khi-nhap-lit」.\n  Lưới:\n  " +
            string.Join("\n  ", _flow.DescribeGrid(200).Skip(from).Take(10)));
        Assert.That(o2Row, Is.Not.Null, "Không thấy dòng O2 trên lưới.");

        // ── SỐ ĐO (đo được 2026-09-22) ─────────────────────────────────────
        //
        // ⛔ ĐÂY LÀ HÀNH VI THẬT CỦA WINFORM, ĐỪNG SỬA ASSERT CHO 「HỢP TRỰC GIÁC」.
        //
        // Cú `hFG1.CurrentCell.Value = ""` của caller KHÔNG đè lên số mà dialog vừa ghi —
        // nó xoá 点数 của DÒNG GỐC. `frmInpMain.AddRow()` chèn hai dòng IS vào vị trí hiện
        // tại và đẩy dòng gốc XUỐNG; con trỏ dừng lại đúng dòng gốc, rồi caller xoá ô 点 ở đó.
        //
        //   TRƯỚC:  [34] ペリオクリン… | 150 | 1
        //   SAU  :  [34] N2O 0.6288  |   3 | 5     ← giữ 点数
        //           [35] O2  0.3068  |   2 | 5     ← giữ 点数
        //           [36] ペリオクリン… | (rỗng) | 1  ← 150 BỊ XOÁ
        Assert.That(Txt.Int(n2oRow!.Ten), Is.GreaterThan(0),
            $"Dòng N2O 「{n2oRow}」 mất 点数 ⇒ cú xoá của caller ĐÃ đè lên số dialog vừa ghi. " +
            "Đo được 2026-09-22 thì nó KHÔNG đè (N2O = 3点, O2 = 2点).");
        Assert.That(Txt.Int(o2Row!.Ten), Is.GreaterThan(0),
            $"Dòng O2 「{o2Row}」 mất 点数 — xem ghi chú ở dòng N2O.");

        Assert.That(origIdx, Is.GreaterThanOrEqualTo(0),
            $"Mất dấu dòng gốc 「{ryo}」 sau khi nhập mã 50.");
        Assert.That(SigaToothFlow.IsBlank(after[origIdx].Ten), Is.True,
            $"Dòng gốc 「{ryo}」 giữ 点 = 「{after[origIdx].Ten}」, mong đợi TRỐNG " +
            $"(trước khi gõ là 「{tenBefore}」).\n" +
            "  ⛔ HÀNH VI THẬT: mã 50 luôn trả false (modMain.cs:542-552 không gán " +
            "functionReturnValue) ⇒ caller chạy hFG1.CurrentCell.Value = \"\" " +
            "(frm203002.cs:5605-5607). Sau khi frm203016 AddRow() hai lần, con trỏ nằm trên " +
            "DÒNG GỐC (đã bị đẩy xuống 2 bậc) ⇒ chính nó bị xoá 点数.\n" +
            "  ⚠️ HỆ QUẢ: nhập 笑気 khi con trỏ đang đứng trên một dòng ĐÃ CÓ 点数 thì dòng đó " +
            "MẤT TRẮNG 点数. Chưa lưu (cần F9), nhưng bấm F9 là thành mất dữ liệu thật.");
    }
}
