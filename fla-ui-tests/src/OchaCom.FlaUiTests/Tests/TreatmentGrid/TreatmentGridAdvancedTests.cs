using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentGrid;

/// <summary>
/// <b>Lưới 処置 của 診療入力 — LUẬT NÂNG CAO.</b>
///
/// <para>Tiếp sau <see cref="TreatmentGridBasicTests"/> (bảy thao tác cơ bản, đã
/// khớp parity hoàn toàn). Bộ này đo những luật mà đọc source KHÔNG kết luận chắc
/// được — chúng phụ thuộc <c>linekbn</c> của dòng đang đứng, thứ mà giao diện không
/// hiện ra.</para>
///
/// <para>Bên kia: <c>web-tenant-tests/tests/treatment-grid-advanced.spec.ts</c>, cùng
/// số hiệu TC-A1…TC-A5.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐO THẬT 2026-08-25 — bệnh nhân 10, ngày 2026-08-03, 合計 409 点
/// ═══════════════════════════════════════════════════════════════════════════
/// Toàn bộ con số dưới đây lấy từ <see cref="TreatmentGridProbeTests.Probe_AdvancedGridRules"/>
/// chứ KHÔNG suy từ source. Muốn đo lại: <c>.\run-edit-treatment-rows.ps1 -Case Probe_Advanced</c>.
///
///  A1  Delete trên 日計行            → TỪ CHỐI, im lặng   (16 dòng → 16, 409 → 409)
///  A2  Delete trên 部位病名行        → hỏi 「同一部位の処置を全て削除します。よろしいですか?」
///  A3  Insert trên 日計行            → CHÈN ĐƯỢC          (16 dòng → 17)
///  A4  → từ ô 日                     → sang ô 部位 (MỘT ô)
///  A5  Enter trên ô 部位             → mở 部位選択
///
/// ═══════════════════════════════════════════════════════════════════════════
/// PHÁT HIỆN ĐÁNG CHÚ Ý: A1 và A3 BẤT ĐỐI XỨNG
/// ═══════════════════════════════════════════════════════════════════════════
/// Cùng một dòng 日計, Delete thì bị chặn mà Insert lại chạy. Không phải lỗi — hai
/// hàm kiểm hai thứ khác nhau:
///   · <c>DeleteRow</c> (frm203002.cs:3843-3846) từ chối khi con trỏ đứng ĐÚNG trên
///     日計行 của ngày đó (<c>ModCommon.pNikkei[day] == CurrentCellAddress.Y</c>);
///   · <c>AddRow</c> (:3714) CHỈ từ chối <c>linekbn == "99"</c> (dòng tháng cũ), không
///     xét 日計行 — nó chèn dòng mới TẠI vị trí con trỏ và đẩy 日計行 xuống, rồi
///     <c>:3737-3745</c> dời chỉ số <c>pNikkei</c> theo.
/// Bản web rất dễ "chuẩn hoá" hai đường này về một luật — làm vậy là lệch.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Không testcase nào bấm F9 登録. A2 trả lời 「いいえ」 nên không xoá gì; A3 chèn một
/// dòng trống trên bộ nhớ rồi dọn lại.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-edit-treatment-rows.ps1 -Case Advanced
/// </summary>
[TestFixture]
[Category("treatment-grid")]
public sealed class TreatmentGridAdvancedTests : UiTestBase
{
    private TreatmentGridOps _grid = null!;

    [OneTimeSetUp]
    public void AdvancedOneTimeSetUp() => _grid = new TreatmentGridOps(Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void LogKq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>
    /// 部位病名行 (<c>linekbn = "1"</c>) — nhận ra qua ô 点 là dấu gạch ngang.
    ///
    /// <para>⚠️ WinForm ghi 「－」 (U+FF0D, ĐỦ chiều rộng) nhưng <see cref="Txt.N"/> chuẩn
    /// hoá NFKC nên tới đây đã thành 「-」. So với 「－」 là KHÔNG BAO GIỜ khớp — probe đã
    /// vấp đúng chỗ này và báo nhầm "lưới không có 部位病名行 nào".</para>
    /// </summary>
    private static bool IsBuiRow(RegiRow r) => Txt.N(r.Ten) is "-" or "－";

    /// <summary>日計行 — <c>modAcc.DispDayPoint</c> ghi 「[負担金 n円]  [日計 n点]」 vào cột 2.</summary>
    private static bool IsNikkeiRow(RegiRow r) => Txt.Has(r.Ryo, "日計");

    /// <summary>
    /// Hộp thoại THẬT đang mở của app.
    ///
    /// <para>KHÔNG dùng <see cref="Dialogs.Open"/>: nó lọc <c>ClassName == "#32770"</c>
    /// nên BỎ SÓT các <c>Interaction.MsgBox</c> của VB — 「同一部位の処置を全て削除します」 và
    /// 「保存しますか」 đều lọt lưới. Đã vấp thật 2026-08-25 hai lần: TC-A2 timeout 10s trong
    /// khi hộp thoại đang hiện rành rành trên màn hình, và một assert 「không có hộp thoại
    /// nào」 thì XANH VÔ NGHĨA vì nó chẳng bao giờ thấy gì.</para>
    ///
    /// <para><see cref="ModalDialogs.All"/> quét rộng hơn nên kéo về cả cửa sổ con không
    /// phải hộp thoại (đã gặp một cửa sổ tên 「item2」) ⇒ lọc thêm "phải có nút bấm được".</para>
    /// </summary>
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

    /// <summary>Chờ hộp thoại có nội dung chứa <paramref name="contains"/>; hết giờ → null.</summary>
    private FlaUI.Core.AutomationElements.Window? WaitForDialog(string contains, int seconds = 10)
    {
        FlaUI.Core.AutomationElements.Window? hit = null;
        Waits.TryUntil(() =>
        {
            hit = RealDialogs().FirstOrDefault(d => Txt.Has(Dialogs.TextOf(d), contains));
            return hit is not null;
        }, TimeSpan.FromSeconds(seconds));
        return hit;
    }

    /// <summary>Mô tả gọn các hộp thoại đang mở — để thông điệp assert nói được thực trạng.</summary>
    private string DescribeDialogs()
    {
        var all = RealDialogs()
            .Select(d => "「" + Txt.N(Dialogs.TextOf(d)).Replace("\n", " ") + "」")
            .ToList();
        return all.Count == 0 ? "(không có hộp thoại nào)" : string.Join(" / ", all);
    }

    /// <summary>Dòng đầu tiên thoả điều kiện; không có thì Ignore kèm lý do dữ liệu.</summary>
    private RegiRow Require(Func<RegiRow, bool> match, string what)
    {
        var row = _grid.Snapshot().FirstOrDefault(match);
        if (row is null)
            IgnoreWithReason(
                $"lưới của bệnh nhân/ngày đang test không có {what} ⇒ không đo được. " +
                "Đổi patient.trtDate sang ngày CÓ loại dòng đó trong testsettings.local.json.");
        return row!;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A1 — Delete bị TỪ CHỐI trên 日計行
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-A1 — Delete trên 日計行 bị TỪ CHỐI, im lặng (frm203002.cs:3843-3846)")]
    public void TcA1_Delete_OnDayTotalRow_IsRefused()
    {
        using var trace = TestTrace.Begin();
        var nikkei = Require(IsNikkeiRow, "dòng 日計");
        LogKq("A1", $"dòng 日計 đem test: {nikkei}");

        var rowsBefore = _grid.RowCount();
        var pointsBefore = _grid.AllPointValue();
        LogKq("A1", $"trước: {rowsBefore} dòng, 合計 = {pointsBefore}");

        trace.Do("dat con tro vao dong 日計 roi Delete", () =>
        {
            _grid.FocusCell(nikkei, RegiGrid.Col.Ryo);
            _grid.Press(VirtualKeyShort.DELETE);
        });

        var rowsAfter = _grid.RowCount();
        var pointsAfter = _grid.AllPointValue();
        LogKq("A1", $"sau: {rowsAfter} dòng, 合計 = {pointsAfter}");

        // DeleteRow trả về ngay khi con trỏ đứng đúng trên 日計行 của ngày đó
        // (ModCommon.pNikkei[day] == CurrentCellAddress.Y). KHÔNG có hộp thoại, KHÔNG có
        // thông báo — im lặng tuyệt đối. Bản web dễ "cải tiến" bằng cách bung một cảnh
        // báo; làm vậy là thêm tính năng, không phải giữ nguyên hành vi.
        Assert.Multiple(() =>
        {
            Assert.That(rowsAfter, Is.EqualTo(rowsBefore),
                $"Delete trên 日計行 phải bị TỪ CHỐI (frm203002.cs:3843-3846), lưới không được " +
                $"đổi số dòng: {rowsBefore} → {rowsAfter}");

            Assert.That(pointsAfter, Is.EqualTo(pointsBefore),
                $"…và 合計点数 phải y nguyên: {pointsBefore} → {pointsAfter}");

            Assert.That(RealDialogs(), Is.Empty,
                "…và KHÔNG được bung hộp thoại nào — DeleteRow từ chối IM LẶNG, không cảnh " +
                $"báo gì cả. Đang thấy: {DescribeDialogs()}");
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A2 — Delete trên 部位病名行 hỏi xoá CẢ CỤM
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC-A2 — Delete trên 部位病名行 hỏi 「同一部位の処置を全て削除します」 (frm203002.cs:3853-3862)")]
    public void TcA2_Delete_OnBuiRow_AsksToDeleteWholeGroup()
    {
        using var trace = TestTrace.Begin();
        var bui = Require(IsBuiRow, "部位病名行 (ô 点 là 「－」)");
        LogKq("A2", $"dòng 部位 đem test: {bui}");

        var rowsBefore = _grid.RowCount();
        var pointsBefore = _grid.AllPointValue();

        trace.Do("dat con tro vao dong 部位 roi Delete", () =>
        {
            _grid.FocusCell(bui, RegiGrid.Col.Ryo);
            _grid.Press(VirtualKeyShort.DELETE);
        });

        // Đây là đường DUY NHẤT xoá theo cụm trong cả màn hình: chỉ khi linekbn == "1"
        // thì DeleteRow mới hỏi rồi bật flgBui, và vòng xoá mới chạy quá một dòng.
        var dialog = WaitForDialog("同一部位の処置を全て削除");
        Assert.That(dialog, Is.Not.Null,
            "Delete trên 部位病名行 phải hỏi 「同一部位の処置を全て削除します。よろしいですか?」 " +
            $"(frm203002.cs:3853-3862) — đây là đường DUY NHẤT xoá theo cụm. Đang thấy: {DescribeDialogs()}");

        var text = Txt.N(Dialogs.TextOf(dialog!)).Replace("\n", " ");
        LogKq("A2", $"hộp thoại: 「{text}」");

        Assert.That(text, Does.Contain(Txt.N("よろしいですか")),
            "hộp thoại phải là câu hỏi xác nhận có 「よろしいですか」, không phải cảnh báo suông");

        // Trả lời いいえ ⇒ HUỶ SẠCH, không xoá dòng nào. Testcase cố ý KHÔNG chọn はい:
        // xoá cả cụm 部位 sẽ phá lưới cho các TC sau, mà giá trị đo được thì không hơn.
        trace.Do("tra loi 「いいえ」", () => Dialogs.ClickButton(dialog!, "いいえ", "No"));
        Waits.TryUntil(() => RealDialogs().Count == 0);

        var rowsAfter = _grid.RowCount();
        var pointsAfter = _grid.AllPointValue();
        LogKq("A2", $"sau khi trả lời 「いいえ」: {rowsBefore} → {rowsAfter} dòng, " +
                    $"合計 {pointsBefore} → {pointsAfter}");

        Assert.Multiple(() =>
        {
            Assert.That(rowsAfter, Is.EqualTo(rowsBefore),
                $"trả lời 「いいえ」 phải HUỶ SẠCH, không xoá dòng nào: {rowsBefore} → {rowsAfter}");
            Assert.That(pointsAfter, Is.EqualTo(pointsBefore),
                $"…và 合計点数 y nguyên: {pointsBefore} → {pointsAfter}");
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A3 — Insert LẠI CHÈN ĐƯỢC trên 日計行
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC-A3 — Insert trên 日計行 CHÈN ĐƯỢC (AddRow chỉ chặn linekbn 99, frm203002.cs:3714)")]
    public void TcA3_Insert_OnDayTotalRow_IsAllowed()
    {
        using var trace = TestTrace.Begin();
        var nikkei = Require(IsNikkeiRow, "dòng 日計");

        var rowsBefore = _grid.RowCount();
        LogKq("A3", $"trước: {rowsBefore} dòng");

        trace.Do("dat con tro vao dong 日計 roi Insert", () =>
        {
            _grid.FocusCell(nikkei, RegiGrid.Col.Ryo);
            _grid.Press(VirtualKeyShort.INSERT);
        });

        var grew = Waits.TryUntil(() => _grid.RowCount() == rowsBefore + 1);
        var rowsAfter = _grid.RowCount();
        LogKq("A3", $"sau: {rowsAfter} dòng ({rowsAfter - rowsBefore:+#;-#;0})");

        // ĐÂY LÀ CHỖ BẤT ĐỐI XỨNG — xem doc-comment đầu file. TC-A1 vừa chứng minh Delete
        // bị chặn trên ĐÚNG dòng này, còn Insert thì không. AddRow chỉ xét linekbn == "99";
        // nó chèn dòng mới TẠI vị trí con trỏ, đẩy 日計行 xuống, rồi dời chỉ số pNikkei
        // theo (frm203002.cs:3737-3745).
        Assert.That(grew, Is.True,
            $"Insert trên 日計行 phải CHÈN ĐƯỢC (AddRow chỉ chặn linekbn 99, " +
            $"frm203002.cs:3714), đang là {rowsBefore} → {rowsAfter}. Nếu bản web chặn ở đây " +
            "thì nó đã gộp luật của DeleteRow và AddRow làm một — hai hàm kiểm hai thứ khác nhau.");

        // Dọn: Delete ngay trên dòng trống vừa chèn (con trỏ đang ở đó).
        trace.Do("Delete de don dong trong vua chen", () => _grid.Press(VirtualKeyShort.DELETE));
        LogKq("A3", $"sau bước dọn: {_grid.RowCount()} dòng (mong đợi {rowsBefore})");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A4 — mũi tên → đi MỘT ô
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC-A4 — → từ ô 日 sang ô 部位 (một ô), KHÔNG nhảy thẳng sang 点")]
    public void TcA4_RightArrow_MovesOneCell_NotJumping()
    {
        using var trace = TestTrace.Begin();
        var row = Require(r => !IsBuiRow(r) && !IsNikkeiRow(r) && r.Day.Length > 0 && r.Ryo.Length > 0,
                          "một 処置行 có ô 日 khác rỗng");

        trace.Do("dat con tro vao o 日", () => _grid.FocusCell(row, RegiGrid.Col.Day));
        var before = _grid.FocusedCellName();
        LogKq("A4", $"trước: 「{before}」");

        if (before.Length == 0 || Txt.Has(before, "Editing"))
            IgnoreWithReason($"không đặt được con trỏ vào ô 日 (đang là 「{before}」)");

        trace.Do("bam mui ten phai", () => _grid.Press(VirtualKeyShort.RIGHT));
        var after = _grid.FocusedCellName();
        LogKq("A4", $"sau: 「{after}」");

        // ĐO THẬT 2026-08-25: 「日 Row n」 → 「部位 Row n」, tức đi ĐÚNG MỘT Ô.
        //
        // Đừng nhầm với Move_Cell(eMovePoint.Right) ở frm203002.cs:5877, chỗ có
        // `case 0: X + 3` (từ cột 日 nhảy thẳng sang cột 点). Nhánh đó là đường LẬP TRÌNH
        // — app gọi sau khi chốt xong một ô — chứ không phải hành vi của phím mũi tên.
        // Phím mũi tên đi theo mặc định của DataGridView.
        Assert.That(Txt.Has(after, "部位"), Is.True,
            $"→ từ ô 日 phải sang ô 部位 (đi MỘT ô, mặc định của DataGridView). Đang ở " +
            $"「{after}」. Ra 「点 …」 nghĩa là bản web đem nhánh Move_Cell(Right) " +
            "(frm203002.cs:5877, `case 0: X + 3`) gán nhầm cho phím mũi tên — nhánh đó là " +
            "đường lập trình sau khi chốt ô, không phải phím.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A5 — Enter trên ô 部位 mở 部位選択.  ĐẶT CUỐI CÙNG.
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC-A5 — Enter trên ô 部位 mở 部位選択 (frm203002.cs:3551-3558)")]
    public void TcA5_Enter_OnBuiCell_OpensBuiPicker()
    {
        using var trace = TestTrace.Begin();
        var row = Require(r => !IsNikkeiRow(r) && r.Ryo.Length > 0, "một dòng có 療法・処置");

        var windowsBefore = App.Windows().Count;
        LogKq("A5", $"số cửa sổ trước: {windowsBefore}");

        trace.Do("dat con tro vao o 部位 roi Enter", () =>
        {
            _grid.FocusCell(row, RegiGrid.Col.Bui);
            _grid.Press(VirtualKeyShort.RETURN);
        });

        // 部位選択 là bảng chọn răng: chữ đặc trưng 「歯番クリック」 + danh sách số răng.
        // Nó là cửa sổ CON của frm203002 nên KHÔNG hiện trong App.Windows(); dò theo NỘI
        // DUNG là đường chắc chắn nhất.
        var found = WaitForDialog("歯番クリック") is not null;
        var seen = DescribeDialogs();
        LogKq("A5", $"hộp thoại đang mở: {seen}");
        trace.Shot("A5-sau-enter-o-bui");

        Assert.That(found, Is.True,
            "Enter trên ô 部位 phải mở bảng chọn 部位 (frm203002.cs:3551-3558 → " +
            $"OpenDialogBuiAndByou). Không thấy hộp thoại nào có 「歯番クリック」. Đang thấy: {seen}");

        // ⚠️ KHÔNG dọn hộp thoại này. Probe 2026-08-25 thử いいえ/No/OK/F10/ESC đều trượt —
        // nó là cửa sổ con với bảng răng, nút đóng nằm ở đâu thì chưa biết. Vì thế TC-A5
        // xếp CUỐI fixture: runner-task.ps1 kill MENU.exe sau mỗi lượt chạy nên trạng thái
        // này không ảnh hưởng lượt sau. Ngày nào cần thao tác tiếp trong 部位選択 thì phải
        // dò cách đóng nó trước — đó là việc của luồng 部位選択 riêng.
        LogKq("A5", "để nguyên hộp thoại — xem ghi chú trong code; app sẽ bị kill sau lượt chạy");
    }
}
