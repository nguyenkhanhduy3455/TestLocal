using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentGrid;

/// <summary>
/// <b>Lưới 処置 của 診療入力 (grdRegi / hFG1) — THAO TÁC CƠ BẢN.</b>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// LUỒNG NÀY LÀ GÌ
/// ═══════════════════════════════════════════════════════════════════════════
/// Bảy thao tác cơ bản nhất mà người dùng làm trên lưới 処置: nhìn cột, chèn một
/// 処置 từ tab 個別, gõ Enter, gõ Tab, gõ số vào ô 点, Insert 行追加, Delete 行削除.
/// KHÔNG có gì nâng cao ở đây — không 部位選択, không 日計, không F9 登録.
///
/// <para>Đây là bên ĐO ĐÁP ÁN. Bên kia — <c>web-tenant-tests/tests/treatment-grid-basic.spec.ts</c>
/// — đo bản web port bằng ĐÚNG bảy testcase mang cùng số hiệu. Chạy hai bên rồi so
/// từng cặp TC-n là ra ngay chỗ bản web lệch.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM — mọi khẳng định dưới đây dẫn về đây
/// ═══════════════════════════════════════════════════════════════════════════
///  · <b>frm203002.cs:158-183</b> — <c>RegiCol</c>: 0 日, 1 部位, 2 療法・処置, 3 点,
///    4 回; từ cột 5 trở đi là cột ẨN (<c>hideStart</c>), trong đó 6 <c>trt_cd</c>,
///    7 <c>trt_sb</c>, 51 <c>linekbn</c>, 78 <c>trt_dt</c>. Bản web dùng ĐÚNG bộ chỉ
///    số này (<c>treatment-entry-shared.ts:140-151</c>) và phơi ra DOM thành
///    <c>data-grid-cell="&lt;rowKey&gt;|&lt;col&gt;"</c> — nhờ vậy hai bên so được theo cột.
///  · <b>frm203002.Designer.cs:1148-1206</b> — HeaderText 5 cột hiển thị:
///    日 / 部位 / 療法・処置 / 点 / 回. <c>RegiBui.ReadOnly = true</c> (:1169) ⇒ cột
///    部位 KHÔNG sửa trực tiếp được.
///  · <b>modAcc.cs:132</b> — <c>DispDayPoint</c> chèn 日計行 (<c>linekbn</c> 10..15) vào
///    CUỐI mỗi ngày, nội dung cột 療法・処置 là 「[負担金 n円]  [日計 n点]」 ⇒ dòng cuối
///    lưới là 日計行 của ngày cuối, KHÔNG phải dòng trống (đo thật 2026-08-25).
///  · <b>frm203002.Designer.cs:1088-1121</b> — tính chất của lưới:
///      <c>AllowUserToAddRows = false</c> (:1088) ⇒ KHÔNG có dòng trống mời nhập ở cuối;
///      <c>MultiSelect = false</c> + <c>SelectionMode = CellSelect</c> (:1114/:1119) ⇒
///      đúng MỘT ô vàng; <c>RegularOperationEnterKeyDisable = true</c> (:1116) và
///      <c>StandardTab = true</c> (:1121) ⇒ Enter/Tab KHÔNG cư xử như DataGridView mặc định.
///  · <b>frm203002.cs:3545-3594</b> — <c>grdRegi_KeyDown</c>, trái tim của luồng này:
///      Enter trên cột 部位   → mở 部位＆病名 (bỏ qua nếu linekbn = 99);
///      Enter trên cột khác  → <c>e.Handled = true</c> + <c>BeginEdit(true)</c>
///                             ⇒ MỞ EDITOR TẠI CHỖ, KHÔNG nhảy xuống dòng dưới;
///      Tab                  → <c>e.Handled = true</c> ⇒ NUỐT, con trỏ đứng yên;
///      Insert               → <c>AddRow()</c>;
///      Delete               → <c>DeleteRow(con)</c>;
///      ← trên cột 点        → mở 部位＆病名 (chưa đo ở đây, xem mục "để sau").
///  · <b>frm203002.cs:3599-3640</b> — <c>grdRegi_TextBox_KeyPress</c>: ô 点 (3) và 回 (4)
///    CHỈ nhận '0'..'9' và BackSpace; Ctrl+V bị chặn; và chặn sạch khi linekbn = 99
///    hoặc ô 点 đang là 「－」.
///  · <b>frm203002.cs:3703-3806</b> — <c>AddRow(intRowPos)</c>: từ chối khi linekbn = 99
///    (:3714), còn lại chèn MỘT <c>DataRow</c> mới tại dòng con trỏ.
///  · <b>frm203002.cs:3814-4064</b> — <c>DeleteRow(con)</c>: từ chối khi ô 日 rỗng
///    (:3840), khi linekbn = 99 (:3841) và khi con trỏ đứng trên 日計行 (:3843-3846);
///    chỉ 部位病名行 (linekbn = "1") mới hỏi 「同一部位の処置を全て削除します」 rồi xoá
///    cả cụm (:3853-3862). Xoá xong gọi <c>modAcc.Calc_MDPoint</c> và ghi lại
///    <c>lbAllPoint</c> / <c>lbDays</c> (:3960-3966).
///  · <b>frm203002.cs:6919-6925</b> — chèn xong một 処置 từ tab 個別 thì app đặt
///    <c>CurrentCell = grdRegi[4, y]</c> (cột 回) rồi <c>BeginEdit</c> ⇒ con trỏ nằm
///    ĐÚNG trên dòng vừa thêm. TC-2 đo chính điều đó.
///  · <b>frm203002.cs:5657 + 5779-5783</b> — chốt 回数 xong mới tính lại 合計点数 và
///    ghi vào <c>lbAllPoint</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Luồng này KHÔNG bấm F9 登録 — y như <see cref="Tests.KobetuSidePanelScoreTests"/> và
/// khác hẳn <c>Tests/ParitySaveData</c>. Mọi thứ nó làm nằm trong DataTable trên bộ
/// nhớ; app đóng lại là sạch, nên không có bước dọn dẹp nào và không cần cờ
/// <c>allowSave</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÁC TESTCASE NỐI TIẾP NHAU — CHẠY CẢ FIXTURE, ĐỪNG LỌC MỘT TC LẺ
/// ═══════════════════════════════════════════════════════════════════════════
/// TC-2 chèn dòng 処置 mà TC-3…TC-5 và TC-7 dùng làm chỗ đứng, TC-7 lại là chỗ dọn
/// dòng đó đi. Lọc <c>-Case Tc5</c> thì lưới chưa có dòng nào của luồng này ⇒ TC tự
/// Ignore kèm lý do chứ không đỏ oan. Đây là quy ước chung của repo
/// (<c>run.stopOnFirstFailure</c> = bản sao <c>mode:'serial'</c> bên Playwright).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐỂ SAU (cố ý KHÔNG có ở đây)
/// ═══════════════════════════════════════════════════════════════════════════
/// Enter trên cột 部位 và ← trên cột 点 đều mở 部位＆病名 (frm203002.cs:3551-3558 /
/// :3583-3593). Cả hai là thao tác MỞ HỘP THOẠI — chuỗi dialog riêng, tiền đề riêng,
/// và bản web đã có spec riêng cho 部位選択. Xếp vào đợt "nâng cao", không phải cơ bản.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-edit-treatment-rows.ps1 -Diagnostics   ← CHẠY CÁI NÀY TRƯỚC TIÊN
///   .\run-edit-treatment-rows.ps1
///   .\run-edit-treatment-rows.ps1 -StepMs 1500   (chậm lại để ngồi nhìn)
///
/// ⚠️ <b>Chưa chạy lần nào trên Windows.</b> Đọc README.md trong thư mục này trước.
/// </summary>
[TestFixture]
[Category("treatment-grid")]
public sealed class TreatmentGridBasicTests : UiTestBase
{
    /// <summary>Tiêu đề 5 cột hiển thị — frm203002.Designer.cs:1155/1167/1179/1191/1204.</summary>
    private static readonly string[] ExpectedHeaders = ["日", "部位", "療法・処置", "点", "回"];

    /// <summary>
    /// 処置 dùng để tạo MỘT dòng đơn giản, KHÔNG phải chọn 部位.
    ///
    /// <para>Mượn <c>parity.simpleTrtCd</c> (mặc định 110 = 再診) vì nó đã được chọn
    /// đúng theo tiêu chí đó. Luồng này KHÔNG bấm F9 nên không dính gì tới phần còn
    /// lại của mục <c>parity</c>.</para>
    /// </summary>
    private int SimpleTrtCd => Settings.Parity.SimpleTrtCd;

    private TreatmentGridOps _grid = null!;

    /// <summary>Chuỗi 療法・処置 của dòng TC-2 vừa chèn — mốc dò cho các TC sau.</summary>
    private string? _addedRowText;

    [OneTimeSetUp]
    public void TreatmentGridOneTimeSetUp() => _grid = new TreatmentGridOps(Screen);

    /// <summary>Ghi một dòng nhật ký, hiện NGAY trên console.</summary>
    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); }
        catch { /* chạy trong IDE, không có console */ }
    }

    /// <summary>Dòng ĐÁP ÁN — runner lọc riêng các dòng này ra file.</summary>
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    /// <summary>
    /// Dẹp hộp thoại modal đang chắn lưới, và GHI LẠI nguyên văn nó.
    ///
    /// <para>Vì sao cần: chốt 回数 ở TC-2 làm app bung các câu hỏi 算定 (SingleChk,
    /// 加算…). <see cref="NuisanceDialogWatcher"/> tự bấm 「いいえ」 cho những câu đã khai
    /// trong <c>run.nuisanceDialogs</c>, nhưng câu NÀO KHÁC thì nằm lại — và mọi thao
    /// tác bàn phím sau đó rơi vào hộp thoại chứ không vào lưới.</para>
    ///
    /// <para>Đã vấp thật 2026-08-25: TC-4 đọc ô đang giữ con trỏ ra 「Yes」 rồi 「No」 —
    /// đó là hai NÚT của hộp thoại, không phải ô lưới. Testcase đỏ với thông điệp
    /// 「Tab đã dời con trỏ」 trong khi Tab chưa bao giờ tới được lưới.</para>
    ///
    /// <para>Chỉ bấm 「いいえ」/「No」 — cùng chính sách với watcher: nhánh phủ định không
    /// kéo theo hộp thoại tiếp theo và không thêm 加算 vào lưới.</para>
    /// </summary>
    private bool DismissBlockingDialog()
    {
        var open = Dialogs.Open(App.Automation, App.ProcessId);
        if (open.Count == 0) return false;

        foreach (var dialog in open)
        {
            var text = Txt.N(Dialogs.TextOf(dialog));
            LogKq(0, $"HỘP THOẠI đang chắn lưới: 「{text}」");
            if (!Dialogs.ClickButton(dialog, "いいえ", "No", "OK", "N"))
                LogKq(0, "   → KHÔNG bấm được nút nào của hộp thoại này");
        }

        // Chờ tắt hẳn: hộp thoại còn đó thì phím vẫn rơi vào nó.
        Waits.TryUntil(() => Dialogs.Open(App.Automation, App.ProcessId).Count == 0);
        return true;
    }

    /// <summary>
    /// Rời khỏi editor mà KHÔNG đóng màn hình — click sang MỘT Ô KHÁC.
    ///
    /// <para>ĐO THẬT 2026-08-25 (probe P1/P2): đây là cách DUY NHẤT an toàn.
    /// <b>ESC là 戻る</b> — nó bung 「処置データは、変更されています。保存しますか？」 rồi đóng
    /// màn hình (<c>GradientDataGridView.ProcessDialogKey</c> trả false khi
    /// <c>RegularOperationEnterKeyDisable = true</c>, GradientDataGridView.cs:645-668).
    /// Còn click lại CHÍNH ô đang đứng thì DataGridView hiểu là click lần hai và MỞ
    /// editor. Rời ô kiểu này KHÔNG chốt giá trị gõ dở — ô quay về giá trị cũ.</para>
    /// </summary>
    private void LeaveEditor(RegiRow row, int awayFromColumn)
    {
        var target = awayFromColumn == RegiGrid.Col.Ryo ? RegiGrid.Col.Day : RegiGrid.Col.Ryo;
        _grid.FocusCell(row, target);
    }

    /// <summary>Dòng mà TC-2 chèn; chưa có thì Ignore chứ không đỏ oan.</summary>
    private RegiRow RequireAddedRow()
    {
        if (_addedRowText is null)
            IgnoreWithReason(
                "TC-2 chưa chèn được dòng 処置 nào nên testcase này không có chỗ đứng. " +
                "Chạy CẢ fixture (.\\run-edit-treatment-rows.ps1) thay vì lọc một TC lẻ.");

        var row = _grid.LastRowMatching(_addedRowText!);
        if (row is null)
            IgnoreWithReason(
                $"không còn thấy dòng 「{_addedRowText}」 trên lưới — một TC trước đã xoá mất nó");
        return row!;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc0 — chẩn đoán. [Explicit] nên KHÔNG chạy trong lần chạy đủ.
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(0), Explicit]
    [Description("Tc0 — đổ cây UIA của grdRegi + chụp lưới; chỉ chạy qua -Diagnostics")]
    public void Tc0_DumpGrid()
    {
        using var trace = TestTrace.Begin();

        // Testcase DUY NHẤT không ném: khi một TC khác đỏ vì đổi tên control, chạy
        // riêng cái này là có cây UIA thật để đối chiếu với mục "locators".
        LogKq(0, $"màn đang mở: id='{Uia.AutomationIdOf(Screen.Window)}' title='{Uia.NameOf(Screen.Window)}'");
        LogKq(0, $"患者番号={Screen.PatientNo()} 年月={Screen.YearMonth()} (ngày test {TrtDate:yyyy-MM-dd})");

        try
        {
            var headers = _grid.Headers();
            LogKq(0, $"tiêu đề cột đọc được ({headers.Count}): {string.Join(" | ", headers)}");
            LogKq(0, $"số dòng: {_grid.RowCount()}");
            LogKq(0, $"lbAllPoint = 「{_grid.AllPoint()}」  lbDays = 「{_grid.Days()}」");

            foreach (var row in _grid.Snapshot(limit: 30)) Log("   " + row);

            var dump = Uia.DumpTree(
                Uia.RequireById(Screen.Window, Settings.Locator("regiGrid")),
                maxDepth: 4, maxChildrenPerNode: 30);
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact("treatment-grid.uia.txt", dump);
            LogKq(0, "đã ghi artifacts\\treatment-grid.uia.txt");
        }
        catch (Exception e)
        {
            LogKq(0, $"đọc lưới lỗi: {e.GetType().Name}: {e.Message}");
        }

        trace.Step("do cay grdRegi");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-1 — cấu trúc lưới
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-1 — lưới có đúng 5 cột 日/部位/療法・処置/点/回 (Designer.cs:1148-1206)")]
    public void Tc1_GridShowsFiveColumns()
    {
        using var trace = TestTrace.Begin();

        var headers = _grid.Headers();
        LogKq(1, $"tiêu đề cột ({headers.Count}): {string.Join(" | ", headers)}");

        if (headers.Count == 0)
            IgnoreWithReason(
                "không đọc được dòng tiêu đề của grdRegi qua UIA (cầu MSAA không phơi HeaderItem). " +
                "Chạy -Diagnostics rồi đối chiếu cây UIA trước khi kết luận WinForm sai.");

        // Gộp vào Multiple: port nhầm thứ tự cột thường lệch CẢ CỤM, assert cứng từng
        // cái chỉ cho thấy cột đầu tiên rồi dừng.
        Assert.Multiple(() =>
        {
            Assert.That(headers, Is.EqualTo(ExpectedHeaders),
                $"5 cột hiển thị của grdRegi phải đúng thứ tự {string.Join("/", ExpectedHeaders)} " +
                "(Designer.cs:1148-1206 + RegiCol frm203002.cs:158-169). Lệch thứ tự tức là bản web " +
                "đang đánh số cột khác — mọi phép so theo data-grid-cell|n giữa hai bên sẽ vô nghĩa.");

            // ── Dòng CUỐI của lưới ───────────────────────────────────────────────
            // ĐO THẬT 2026-08-25: dòng cuối KHÔNG trống mà là 日計行 —
            //     [15] 14 | | [負担金 0円]  [日計 70点] | |
            //
            // Bản đầu của testcase này assert "dòng cuối phải TRỐNG", suy từ chỗ app thêm
            // HAI dòng rỗng lúc dựng lưới (frm203002.cs:3043-3044) rồi giấu dòng 0
            // (:3063-3066). Suy vậy là SAI với trạng thái ĐÃ NẠP DỮ LIỆU: hai dòng rỗng đó
            // bị dữ liệu của tháng lấp mất, và modAcc.DispDayPoint (modAcc.cs:132) chèn
            // 日計行 vào cuối mỗi ngày — nên dòng cuối lưới là 日計行 của NGÀY CUỐI.
            // (Dòng trống ở cuối chỉ xuất hiện khi Move_Cell(Down) nối thêm, :5856-5870.)
            //
            // Giữ lại phép đo này vì nó VẪN là hợp đồng parity thật: bản web cũng phải kết
            // thúc tháng bằng dòng 日計 (footer 【負担金 N円】【日計 M点】), không được kết
            // thúc bằng một 処置行 trần.
            var rows = _grid.Snapshot();
            Assert.That(rows, Is.Not.Empty, "grdRegi phải có ít nhất một dòng sau khi nạp xong");
            var last = rows[^1];
            LogKq(1, $"dòng cuối lưới: {last}");
            Assert.That(last.Ryo, Does.Contain("日計").Or.Empty,
                "dòng CUỐI của lưới phải là 日計行 của ngày cuối (modAcc.DispDayPoint, " +
                "modAcc.cs:132) — hoặc trống khi tháng chưa có 処置 nào. Đang là " +
                $"「{last.Ryo}」. Kết thúc bằng một 処置行 trần nghĩa là 日計行 chưa được dựng.");
        });

        LogKq(1, $"số dòng lúc bắt đầu: {_grid.RowCount()}; lbAllPoint = 「{_grid.AllPoint()}」");
        trace.Step("doc tieu de cot");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-2 — chèn một 処置 từ tab 個別
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC-2 — chọn 処置 ở tab 個別 thêm ĐÚNG 1 dòng, con trỏ nhảy sang cột 回 (frm203002.cs:6919-6925)")]
    public void Tc2_SelectingKobetuRow_AddsOneRow_AndParksCursorOnKai()
    {
        using var trace = TestTrace.Begin();

        var pointBefore = _grid.AllPoint();
        LogKq(2, $"trước khi chèn: {_grid.RowCount()} dòng đang thấy, lbAllPoint = 「{pointBefore}」");

        var kobetu = trace.Do("mo tab 個別", () => Screen.Kobetu.Open());
        trace.Do("don 3 o 検索", kobetu.ResetSearchBoxes);

        // KHÔNG lấy [0]: lưới 個別 cũng phơi dòng TIÊU ĐỀ ra UIA như grdRegi (ô kiểu
        // Header chứ không phải HeaderItem, xem TreatmentGridOps.Headers), mà
        // KobetuTab.DataRows() chỉ lọc "dòng rỗng" nên dòng tiêu đề LỌT vào vị trí [0].
        // Đã vấp thật 2026-08-25: 「処置 đem test: 処置名称」 — đó là tên CỘT, và cú click
        // rơi vào dòng tiêu đề. Lọc theo chính ô ｺｰﾄﾞ thì không thể nhầm.
        var kobetuRow = trace.Do($"tim 処置 {SimpleTrtCd} o tab 個別", () =>
        {
            var found = kobetu.SearchByCode(SimpleTrtCd);
            var real = found.FirstOrDefault(r => Txt.Int(r.At(KobetuTab.Col.Code)) == SimpleTrtCd);
            if (real is null)
                throw new InvalidOperationException(
                    $"tìm ｺｰﾄﾞ {SimpleTrtCd} ra {found.Count} dòng nhưng không dòng nào có ô ｺｰﾄﾞ " +
                    $"đúng bằng {SimpleTrtCd} (thấy: " +
                    string.Join(", ", found.Select(r => $"「{r.At(KobetuTab.Col.Code)}」")) + ")");
            return real;
        });
        var kobetuName = kobetuRow.At(KobetuTab.Col.Name);
        LogKq(2, $"処置 đem test: ｺｰﾄﾞ {SimpleTrtCd} 「{kobetuName}」");

        // MỘT cú click là đã chèn: hfgKobetu_Click (frm203002.cs:6928) tự gọi tiếp
        // Enter → CellDoubleClick → pKobetu_Let_Trt_Data. Không cần double-click.
        trace.Do("chon dong 個別 (chen xuong luoi dang ky)", () => kobetu.SelectRow(kobetuRow));

        // ── Nghiệm thu bằng 合計点数, KHÔNG bằng đếm dòng ────────────────────────
        //
        // UIA của DataGridView CHỈ phơi ra những dòng ĐANG NHÌN THẤY, mà chèn xong app
        // cuộn lưới xuống dòng mới. Mọi mốc dựa trên tập dòng đọc được đều trôi theo vị
        // trí cuộn — đã thử và hỏng CẢ BA cách (2026-08-25):
        //   · so hai lượt chụp theo chỉ số  → "khác nhau" ngay từ index 0;
        //   · đếm tổng số dòng             → đổi theo vị trí cuộn, không theo dữ liệu;
        //   · đếm số dòng mang cùng tên    → dòng mới hiện ra thì một dòng cũ trôi khỏi
        //                                     khung nhìn, tổng đứng yên.
        // Trong khi đó ẢNH CHỤP cho thấy 処置 đã được chèn đàng hoàng ⇒ lỗi ở phép đo.
        //
        // 合計点数 (lbAllPoint) nằm NGOÀI lưới nên miễn nhiễm với cuộn, và nó chính là
        // thứ nghiệp vụ mà việc chèn 処置 phải làm đổi. Đo cái đó vừa đúng vừa chắc.
        var pointsBefore = _grid.AllPointValue();
        LogKq(2, $"lbAllPoint trước khi chốt 回数: 「{_grid.AllPoint()}」");

        // ĐIỂM MẤU CHỐT — frm203002.cs:6920-6925 đặt CurrentCell sang CỘT 回 của dòng
        // vừa thêm rồi BeginEdit. Đây là thứ quyết định "gõ tiếp là ra số lần", và là
        // chỗ bản web rất dễ bỏ sót (để con trỏ ở lại panel 個別).
        var focused = _grid.FocusedCellName();
        var editing = _grid.IsEditing();
        LogKq(2, $"ô đang giữ con trỏ ngay sau khi chèn: 「{focused}」 (đang mở editor: {editing})");

        Assert.That(editing, Is.True,
            "chèn xong app phải MỞ EDITOR ngay ở ô 回 của dòng mới " +
            "(grdRegi.CurrentCell = grdRegi[4, y] rồi BeginEdit, frm203002.cs:6920-6925). " +
            $"Ô đang giữ con trỏ: 「{focused}」. Không mở editor nghĩa là con trỏ còn kẹt ở " +
            "panel 個別, chưa được trả về lưới. (Lúc editor đang mở, phần tử focus là " +
            "「Editing Control」 nên KHÔNG đọc được tên cột từ nó — IsEditing là mốc đo được.)");

        // Chốt 回数 bằng Enter — đường mà người dùng đi, và là chỗ WinForm mới tính lại
        // 合計点数 (frm203002.cs:5657 + 5779-5783). Trước khi chốt thì 合計 CHƯA đổi.
        // Hộp thoại 「〜を算定しますか？」 nếu bung ra đã có NuisanceDialogWatcher bấm 「いいえ」.
        trace.Do("Enter chot 回数", () => _grid.Press(VirtualKeyShort.RETURN));

        if (pointsBefore is null)
            IgnoreWithReason($"không đọc được số từ lbAllPoint 「{_grid.AllPoint()}」");

        Waits.Until(() => _grid.AllPointValue() > pointsBefore,
            $"chốt 回数 xong mà 合計点数 không tăng (đang là 「{_grid.AllPoint()}」, trước là " +
            $"{pointsBefore}) — nghĩa là 処置 「{kobetuName}」 chưa thực sự vào lưới " +
            "(pKobetu_Let_Trt_Data, modKobetu.cs:255-265 → modAcc.Calc_MDPoint)");

        var pointsAfter = _grid.AllPointValue();
        LogKq(2, $"lbAllPoint: {pointsBefore} → {pointsAfter} (+{pointsAfter - pointsBefore})");

        // Dòng vừa chèn đang nằm trong khung nhìn (app vừa cuộn tới nó) nên đọc lại được.
        var added = _grid.LastRowMatching(kobetuName);
        LogKq(2, added is null
            ? $"CẢNH BÁO: 合計 đã tăng nhưng không đọc lại được dòng 「{kobetuName}」 trong khung nhìn"
            : $"dòng vừa thêm: {added}");

        Assert.That(added, Is.Not.Null,
            $"合計点数 đã tăng nhưng không thấy dòng 「{kobetuName}」 nào trong khung nhìn — " +
            "app phải cuộn lưới tới dòng vừa chèn (CurrentCell được đặt vào chính dòng đó)");

        _addedRowText = added!.Ryo;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-3 — Enter mở editor TẠI CHỖ
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC-3 — Enter trên ô ≠ 部位 mở editor tại chỗ, KHÔNG nhảy xuống dòng dưới (frm203002.cs:3560-3564)")]
    public void Tc3_Enter_OpensEditorInPlace_DoesNotMoveDown()
    {
        using var trace = TestTrace.Begin();
        DismissBlockingDialog();
        var row = RequireAddedRow();

        trace.Do("dat con tro vao o 回", () => _grid.FocusCell(row, RegiGrid.Col.Kai));
        var before = _grid.FocusedCellName();
        LogKq(3, $"ô đang giữ con trỏ trước khi gõ Enter: 「{before}」");

        trace.Do("go Enter", () => _grid.Press(VirtualKeyShort.RETURN));

        var editing = _grid.IsEditing();
        var after = _grid.FocusedCellName();
        LogKq(3, $"sau Enter: đang mở editor = {editing}, ô giữ con trỏ = 「{after}」");

        // DataGridView mặc định: Enter = chốt ô rồi NHẢY XUỐNG dòng dưới. frm203002 tắt
        // hẳn hành vi đó (RegularOperationEnterKeyDisable = true, Designer.cs:1116) và
        // grdRegi_KeyDown thay bằng BeginEdit(true) — Enter là "mở ô để sửa", không phải
        // "đi tiếp". Bản web port thiếu chỗ này thì con trỏ trôi mất một dòng mỗi lần
        // người dùng gõ Enter.
        Assert.That(editing, Is.True,
            "Enter trên ô ≠ 部位 phải MỞ EDITOR tại chính ô đó (e.Handled = true; " +
            $"grdRegi.BeginEdit(true) — frm203002.cs:3560-3564). Đang không thấy editor nào; " +
            $"ô giữ con trỏ sau Enter: 「{after}」. Nếu con trỏ đã dời sang dòng khác tức là " +
            "hành vi mặc định của DataGridView chưa bị chặn.");

        // Dọn editor bằng CLICK SANG Ô KHÁC, TUYỆT ĐỐI không dùng ESC — ESC là 戻る, nó
        // bung 「保存しますか」 rồi đóng màn hình, làm mọi TC sau thao tác vào hộp thoại
        // thay vì vào lưới (đo thật 2026-08-25, xem LeaveEditor).
        trace.Do("click sang o khac de roi editor", () => LeaveEditor(row, RegiGrid.Col.Kai));
        Assert.That(_grid.IsEditing(), Is.False, "click sang ô khác phải đóng editor lại");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-4 — Tab bị nuốt
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC-4 — Tab RỜI khỏi lưới sang control kế tiếp (StandardTab = true, Designer.cs:1121)")]
    public void Tc4_Tab_MovesFocusOutOfGrid()
    {
        using var trace = TestTrace.Begin();
        DismissBlockingDialog();
        var row = RequireAddedRow();

        // PHẢI ở trạng thái KHÔNG edit: đang mở editor thì phím vào TextBox con và đi
        // đường khác hẳn (grdRegi_TextBox_PreviewKeyDown) — đo lúc đó là đo nhầm hàm.
        trace.Do("dat con tro vao o 点", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        if (_grid.IsEditing()) trace.Do("roi editor", () => LeaveEditor(row, RegiGrid.Col.Ten));
        trace.Do("dat lai con tro vao o 点", () => _grid.FocusCell(row, RegiGrid.Col.Ten));

        var before = _grid.FocusedCellName();
        LogKq(4, $"ô đang giữ con trỏ trước khi gõ Tab: 「{before}」 (editing={_grid.IsEditing()})");

        if (before.Length == 0 || Txt.Has(before, "Editing"))
            IgnoreWithReason(
                $"không đặt được con trỏ vào ô 点 ở trạng thái KHÔNG edit (đang là 「{before}」) " +
                "⇒ không đo được Tab của LƯỚI.");

        trace.Do("go Tab", () => _grid.Press(VirtualKeyShort.TAB));

        var after = _grid.FocusedCellName();
        LogKq(4, $"ô đang giữ con trỏ sau khi gõ Tab: 「{after}」");

        // ĐO THẬT 2026-08-25 (probe P3): 「点 Row 16」 --Tab--> 「患者情報」.
        //
        // Bản đầu của testcase này assert NGƯỢC LẠI — "Tab bị nuốt, con trỏ đứng yên" —
        // suy từ grdRegi_KeyDown đặt e.Handled = true cho Tab (frm203002.cs:3566-3569).
        // Suy vậy là SAI: Tab là phím điều hướng hộp thoại, WinForms xử qua
        // ProcessDialogKey TRƯỚC KeyDown, và grdRegi khai StandardTab = true
        // (Designer.cs:1121) nghĩa là "Tab sang CONTROL kế tiếp thay vì sang ô kế tiếp".
        // e.Handled ở KeyDown chỉ chặn được phần dời-ô mà StandardTab vốn đã tắt.
        //
        // Hợp đồng parity: bản web KHÔNG được giữ con trỏ lại trong lưới khi gõ Tab.
        Assert.Multiple(() =>
        {
            Assert.That(after, Is.Not.EqualTo(before),
                "Tab phải RỜI con trỏ khỏi ô hiện tại (StandardTab = true, Designer.cs:1121). " +
                $"Con trỏ vẫn ở 「{after}」 nghĩa là bản web đang NUỐT Tab, khác WinForm.");

            Assert.That(Txt.Has(after, "Row"), Is.False,
                $"Tab phải đưa con trỏ RA KHỎI lưới, nhưng nó đang ở một ô lưới khác 「{after}」 " +
                "— đó là hành vi mặc định 'sang ô bên phải' của DataGridView, thứ mà " +
                "StandardTab đã tắt.");
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-5 — ô 点 chỉ ăn chữ số
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC-5 — ô 点 chỉ nhận '0'..'9', chữ cái bị chặn (grdRegi_TextBox_KeyPress, frm203002.cs:3599-3640)")]
    public void Tc5_TenCell_AcceptsDigitsOnly()
    {
        using var trace = TestTrace.Begin();
        DismissBlockingDialog();
        var row = RequireAddedRow();
        var original = row.Ten;
        LogKq(5, $"ô 点 của dòng test trước khi gõ: 「{original}」");

        // TC-4 vừa đẩy focus RA KHỎI lưới (sang 患者情報) nên cú click đầu chỉ trả focus
        // về lưới, chưa chắc mở được editor — gõ Enter lại một nhịp nữa nếu cần.
        trace.Do("dat con tro vao o 点", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        trace.Do("go Enter de mo editor", () => _grid.Press(VirtualKeyShort.RETURN));
        if (!_grid.IsEditing())
        {
            trace.Do("chua mo duoc editor — dat lai con tro roi Enter lan nua", () =>
            {
                _grid.FocusCell(row, RegiGrid.Col.Ten);
                _grid.Press(VirtualKeyShort.RETURN);
            });
        }

        if (!_grid.IsEditing())
            IgnoreWithReason(
                "không mở được editor trên ô 点 nên không đo được bộ lọc ký tự. " +
                "TC-3 là chỗ chốt việc Enter có mở editor hay không — xem kết quả của nó trước.");

        // grdRegi_TextBox_KeyPress (frm203002.cs:3599-3640) chỉ cho '0'..'9' và BackSpace
        // đi qua trên cột 3/4; mọi ký tự khác bị e.Handled = true nuốt mất. Gõ xen kẽ
        // chữ và số: cái ra được phải là ĐÚNG phần số.
        trace.Do("go 「9a8」 vao o 点", () => _grid.Type("9a8"));

        var editorText = _grid.EditorText();
        LogKq(5, $"nội dung editor sau khi gõ 「9a8」: 「{editorText}」");

        Assert.That(editorText, Is.EqualTo("98"),
            $"ô 点 chỉ được nhận chữ số (grdRegi_TextBox_KeyPress, frm203002.cs:3601-3639) — " +
            $"gõ 「9a8」 phải ra 「98」. Editor đang là 「{editorText}」; ra 「9a8」 nghĩa là bản " +
            "web dùng <input> thường mà không lọc phím. (Đo thật 2026-08-25, probe P4.)");

        // Rời ô bằng CLICK (không ESC — ESC là 戻る). Đo thật 2026-08-25 (probe P4):
        // rời ô KHÔNG chốt giá trị gõ dở, ô 点 quay về giá trị cũ.
        trace.Do("click sang o khac de roi o 点", () => LeaveEditor(row, RegiGrid.Col.Ten));

        var restored = _grid.LastRowMatching(_addedRowText!);
        LogKq(5, $"ô 点 sau khi rời ô: 「{restored?.Ten}」 (trước khi gõ: 「{original}」)");
        Assert.That(restored?.Ten, Is.EqualTo(original),
            "rời ô phải HUỶ giá trị gõ dở và trả ô 点 về giá trị cũ (đo thật: 59 → gõ 98 → " +
            "rời ô → vẫn 59)");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-6 — Insert = 行追加
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("TC-6 — Insert chèn ĐÚNG 1 dòng tại con trỏ (frm203002.cs:3570-3572 → AddRow :3703)")]
    public void Tc6_InsertKey_AddsExactlyOneRow()
    {
        using var trace = TestTrace.Begin();
        DismissBlockingDialog();
        var row = RequireAddedRow();

        // Editor còn mở thì phím Insert vào TextBox chứ không vào lưới, VÀ số dòng đếm
        // được bị cộng thêm 1 (ô editor là con của lưới). Dọn trước khi đo.
        trace.Do("dat con tro vao o 療法・処置", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));
        if (_grid.IsEditing()) trace.Do("roi editor con sot lai", () => LeaveEditor(row, RegiGrid.Col.Ryo));
        trace.Do("dat lai con tro vao o 療法・処置", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));

        var before = _grid.RowCount();
        LogKq(6, $"số dòng trước khi gõ Insert: {before} (editing={_grid.IsEditing()})");

        trace.Do("go Insert", () => _grid.Press(VirtualKeyShort.INSERT));

        // AddRow chèn MỘT DataRow rồi Move_Txt() — không có bước nào chạm DB, nên chỉ
        // cần chờ lưới đếm lại. Chờ có điều kiện chứ không ngủ cứng (Waits, Rule 4).
        var grew = Waits.TryUntil(() => _grid.RowCount() == before + 1);
        var after = _grid.RowCount();
        LogKq(6, $"số dòng sau khi gõ Insert: {after} ({after - before:+#;-#;0})");

        Assert.That(grew, Is.True,
            $"Insert phải chèn ĐÚNG 1 dòng trống tại vị trí con trỏ " +
            $"(grdRegi_KeyDown :3570-3572 → AddRow :3703-3733), đang là {before} → {after}. " +
            "Không đổi tức là phím Insert chưa được nối vào 行追加; nhiều hơn 1 tức là " +
            "đang chèn kèm cả 部位行.");

        // Dọn lại bằng Delete để TC-7 xuất phát từ đúng lưới của TC-2. KHÔNG assert
        // bước dọn: DeleteRow từ chối dòng có ô 日 rỗng (:3840), mà dòng trống vừa chèn
        // có thể rơi đúng vào đó tuỳ vị trí con trỏ — dọn hụt thì cùng lắm là thừa một
        // dòng trống trên bộ nhớ, app đóng lại là hết, còn assert nhầm ở đây sẽ đổ lỗi
        // cho 行追加 vì một chuyện khác hẳn.
        trace.Do("go Delete de don dong trong vua chen", () => _grid.Press(VirtualKeyShort.DELETE));
        LogKq(6, $"số dòng sau bước dọn: {_grid.RowCount()} (mong đợi {before})");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-7 — Delete = 行削除 + 合計 tính lại
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(7)]
    [Description("TC-7 — Delete xoá dòng 処置 đang đứng và tính lại 合計 (frm203002.cs:3574-3583 → DeleteRow :3814, :3960-3966)")]
    public void Tc7_DeleteKey_RemovesFocusedRow_AndRecalculatesTotal()
    {
        using var trace = TestTrace.Begin();
        DismissBlockingDialog();
        var row = RequireAddedRow();

        var marker = _addedRowText!;
        var before = _grid.RowCount();
        var pointBefore = _grid.AllPointValue();
        LogKq(7, $"trước khi xoá: {before} dòng, lbAllPoint = 「{_grid.AllPoint()}」, " +
                 $"dòng sắp xoá 点={row.Ten} 回={row.Kai}");

        trace.Do("dat con tro vao o 療法・処置 cua dong test", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));
        if (_grid.IsEditing()) trace.Do("roi editor con sot lai", () => LeaveEditor(row, RegiGrid.Col.Ryo));
        trace.Do("dat lai con tro vao o 療法・処置", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));
        trace.Do("go Delete", () => _grid.Press(VirtualKeyShort.DELETE));

        // 処置 đem test KHÔNG phải 部位病名行 (linekbn = "1") nên KHÔNG được hỏi
        // 「同一部位の処置を全て削除します」 — đó là đường DUY NHẤT xoá theo cụm
        // (frm203002.cs:3853-3862).
        var confirm = Dialogs.Find(App.Automation, App.ProcessId, "同一部位の処置を全て削除");
        if (confirm is not null)
        {
            Dialogs.ClickButton(confirm, "いいえ", "No");
            Assert.Fail(
                "xoá một 処置行 thường mà app hỏi 「同一部位の処置を全て削除します」 — câu hỏi đó chỉ " +
                "dành cho 部位病名行 (linekbn = \"1\", frm203002.cs:3853-3862).");
        }

        // ĐẾM, không hỏi "còn hay hết": 処置 đem test có thể ĐÃ có sẵn trên lưới ở ngày
        // khác trong tháng (bệnh nhân test có sẵn một dòng 歯科再診料 ngày 14), nên sau
        // khi xoá dòng của TC-2 thì LastRowMatching VẪN tìm ra dòng cũ. Đã vấp thật
        // 2026-08-25: TC-7 đỏ với 「Delete chưa được nối vào 行削除」 trong khi log ngay
        // bên cạnh cho thấy 18→17 dòng và 合計 468→409.
        // MỐC LÀ 合計点数, KHÔNG phải số dòng.
        //
        // Đếm dòng đã hỏng HAI lần liên tiếp ở đúng testcase này (2026-08-25): UIA chỉ
        // phơi ra dòng ĐANG NHÌN THẤY, mà xoá xong lưới cuộn lại — lần thì thấy dòng
        // 歯科再診料 cũ của ngày khác nên tưởng chưa xoá, lần thì số dòng đứng yên.
        // 合計 nằm NGOÀI lưới nên miễn nhiễm, và nó chính là thứ nghiệp vụ phải đổi.
        // Xem PROBE-GUIDELINE.md mục 3.1.
        var matchBefore = _grid.CountRyoContaining(marker);
        var gone = Waits.TryUntil(() => _grid.AllPointValue() < pointBefore);
        var after = _grid.RowCount();
        var pointAfter = _grid.AllPointValue();
        LogKq(7, $"sau khi xoá: {after} dòng ({after - before:+#;-#;0}), lbAllPoint = 「{_grid.AllPoint()}」, " +
                 $"dòng cùng tên 「{marker}」: {matchBefore} → {_grid.CountRyoContaining(marker)} " +
                 "(số dòng chỉ để tham khảo — phụ thuộc vị trí cuộn)");

        Assert.Multiple(() =>
        {
            Assert.That(gone, Is.True,
                $"Delete phải xoá dòng ĐANG ĐỨNG 「{marker}」 và làm 合計点数 giảm " +
                "(grdRegi_KeyDown :3574-3583 → DeleteRow :3814 → modAcc.Calc_MDPoint :3960-3966). " +
                $"合計 vẫn là {pointBefore} nghĩa là phím Delete chưa được nối vào 行削除, hoặc " +
                "DeleteRow đã từ chối ở một trong ba cổng đầu (ô 日 rỗng :3840 / linekbn 99 " +
                ":3841 / 日計行 :3843).");

            // Xoá xong DeleteRow gọi modAcc.Calc_MDPoint rồi ghi lại lbAllPoint
            // (frm203002.cs:3960-3966). Chỉ chốt CHIỀU chứ không chốt con số: 合計 của
            // tháng còn cộng cả 加算 mà app tự tính, nên một con số tuyệt đối ở đây sẽ
            // đỏ oan trên máy có dữ liệu khác.
            if (pointBefore is not null && pointAfter is not null && Txt.Int(row.Ten) > 0)
            {
                Assert.That(pointBefore - pointAfter, Is.EqualTo(Txt.Int(row.Ten) * Math.Max(1, Txt.Int(row.Kai) ?? 1)),
                    $"xoá một dòng 点={row.Ten} × 回={row.Kai} thì 合計点数 phải giảm ĐÚNG chừng ấy " +
                    $"(modAcc.Calc_MDPoint → lbAllPoint, frm203002.cs:3960-3966), " +
                    $"đang là {pointBefore} → {pointAfter}. Không đổi tức là bản web chỉ bỏ dòng " +
                    "khỏi lưới mà quên tính lại tổng.");
            }
            else
            {
                LogKq(7, "bỏ qua vế 合計: không đọc được số từ lbAllPoint hoặc dòng test có 点 = 0");
            }
        });

        _addedRowText = null;
    }
}
