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

            // Lưới LUÔN kết thúc bằng MỘT dòng trống, và đó là dòng do CHÍNH APP giữ chứ
            // không phải "new row" của DataGridView (AllowUserToAddRows = false,
            // Designer.cs:1088). Nguồn gốc là VB6: lúc dựng lưới app thêm HAI dòng rỗng
            // (frm203002.cs:3043-3044) rồi giấu dòng 0 đi (:3063-3066) để giữ nguyên logic
            // "dòng đầu là dòng tiêu đề"; dòng còn lại nằm ở cuối và là chỗ để gõ 処置 tiếp.
            // Move_Cell(Down) ở dòng cuối lại nối thêm một dòng nữa (:5856-5870) — nên
            // "trống ở cuối" là BẤT BIẾN, không phải rác.
            //
            // Bản web dễ port hụt đúng chỗ này: thấy AllowUserToAddRows = false rồi kết
            // luận "không có dòng trống", thế là mất luôn chỗ nhập tay.
            var rows = _grid.Snapshot();
            Assert.That(rows, Is.Not.Empty, "grdRegi phải có ít nhất một dòng sau khi nạp xong");
            var last = rows[^1];
            Assert.That(last.Ryo, Is.Empty,
                "dòng CUỐI của lưới phải là dòng TRỐNG để còn gõ 処置 tiếp — di sản VB6, app tự " +
                $"giữ (frm203002.cs:3043-3044 + :3063-3066). Dòng cuối đang đọc được: {last}");
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

        var snapBefore = _grid.Snapshot();
        var before = snapBefore.Count;
        var pointBefore = _grid.AllPoint();
        LogKq(2, $"trước khi chèn: {before} dòng, lbAllPoint = 「{pointBefore}」");

        var kobetu = trace.Do("mo tab 個別", () => Screen.Kobetu.Open());
        trace.Do("don 3 o 検索", kobetu.ResetSearchBoxes);

        var kobetuRow = trace.Do($"tim 処置 {SimpleTrtCd} o tab 個別",
            () => kobetu.SearchByCode(SimpleTrtCd)[0]);
        var kobetuName = kobetuRow.At(KobetuTab.Col.Name);
        LogKq(2, $"処置 đem test: ｺｰﾄﾞ {SimpleTrtCd} 「{kobetuName}」");

        // MỘT cú click là đã chèn: hfgKobetu_Click (frm203002.cs:6928) tự gọi tiếp
        // Enter → CellDoubleClick → pKobetu_Let_Trt_Data. Không cần double-click.
        trace.Do("chon dong 個別 (chen xuong luoi dang ky)", () => kobetu.SelectRow(kobetuRow));

        Waits.Until(() => _grid.RowCount() > before,
            $"chọn dòng 個別 「{kobetuName}」 mà lưới đăng ký không thêm dòng nào " +
            "(pKobetu_Let_Trt_Data, modKobetu.cs:255-265)");

        var snapAfter = _grid.Snapshot();
        var after = snapAfter.Count;
        LogKq(2, $"sau khi chèn: {after} dòng (+{after - before})");

        // ĐIỂM MẤU CHỐT — frm203002.cs:6919-6925 đặt CurrentCell sang CỘT 回 của dòng
        // vừa thêm rồi BeginEdit. Đây là thứ quyết định "gõ tiếp là ra số lần", và là
        // chỗ bản web rất dễ bỏ sót (để con trỏ ở lại panel 個別).
        var focused = _grid.FocusedCellName();
        var editing = _grid.IsEditing();
        LogKq(2, $"ô đang giữ con trỏ ngay sau khi chèn: 「{focused}」 (đang mở editor: {editing})");

        // Dò dòng mới bằng cách SO HAI LƯỢT CHỤP chứ không dò theo tên: tên trên lưới
        // đăng ký là cct_nm hay trt_nm tuỳ ModCommon.pCultTrt, có thể khác hẳn tên vừa
        // đọc ở tab 個別 — dò theo tên là tự chuốc một lần đỏ oan.
        var added = TreatmentGridOps.FirstDifference(snapBefore, snapAfter);
        Assert.That(added, Is.Not.Null,
            $"lưới báo có thêm dòng nhưng hai lượt chụp không khác nhau ở đâu cả " +
            $"(処置 vừa chọn: 「{kobetuName}」)");
        Assert.That(added!.Ryo, Is.Not.Empty,
            $"dòng vừa thêm không có 療法・処置 nào: {added}");
        _addedRowText = added.Ryo;
        LogKq(2, $"dòng vừa thêm: {added}");

        Assert.Multiple(() =>
        {
            Assert.That(after - before, Is.EqualTo(1),
                $"một lần chọn 処置 phải thêm ĐÚNG 1 dòng, đang thêm {after - before}. " +
                "Nhiều hơn 1 nghĩa là app còn chèn kèm 部位行 / 日計行 — nếu vậy phải ghi rõ " +
                "ở đây rồi mới so được với bản web.");

            // Con trỏ đứng ở cột 回: mô tả ô của DataGridView có KÈM TÊN CỘT, nên chỉ
            // cần tìm chữ 回 trong đó. Editor đang mở thì phần tử focus là TextBox con
            // của lưới và mô tả rỗng — khi đó bỏ qua vế này, IsEditing đã nói đủ.
            if (!editing && focused.Length > 0)
            {
                Assert.That(Txt.Has(focused, "回"), Is.True,
                    $"chèn xong con trỏ phải nằm ở cột 回 của dòng mới (grdRegi[4, y], " +
                    $"frm203002.cs:6919-6925), đang ở 「{focused}」");
            }
        });

        // Chốt 回数 bằng Enter — đường mà người dùng đi, và là chỗ WinForm mới tính lại
        // 合計点数 (frm203002.cs:5657 + 5779-5783). Hộp thoại 「〜を算定しますか？」 nếu bung
        // ra đã có NuisanceDialogWatcher tự bấm 「いいえ」.
        if (editing) trace.Do("Enter chot 回数", () => _grid.Press(VirtualKeyShort.RETURN));

        var pointAfter = _grid.AllPoint();
        LogKq(2, $"lbAllPoint: 「{pointBefore}」 → 「{pointAfter}」 (点 dòng mới = {added.Ten}, 回 = {added.Kai})");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-3 — Enter mở editor TẠI CHỖ
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC-3 — Enter trên ô ≠ 部位 mở editor tại chỗ, KHÔNG nhảy xuống dòng dưới (frm203002.cs:3560-3564)")]
    public void Tc3_Enter_OpensEditorInPlace_DoesNotMoveDown()
    {
        using var trace = TestTrace.Begin();
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

        // Escape huỷ editor — testcase KHÔNG được làm bẩn lưới cho các TC sau.
        trace.Do("Escape huy editor", () => _grid.Press(VirtualKeyShort.ESCAPE));
        Assert.That(_grid.IsEditing(), Is.False, "Escape phải đóng editor lại");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-4 — Tab bị nuốt
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC-4 — Tab bị nuốt, con trỏ ĐỨNG YÊN (frm203002.cs:3566-3569)")]
    public void Tc4_Tab_IsSwallowed_CursorStaysPut()
    {
        using var trace = TestTrace.Begin();
        var row = RequireAddedRow();

        trace.Do("dat con tro vao o 点", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        var before = _grid.FocusedCellName();
        LogKq(4, $"ô đang giữ con trỏ trước khi gõ Tab: 「{before}」");

        if (before.Length == 0)
            IgnoreWithReason(
                "không đọc được mô tả ô đang giữ con trỏ ⇒ không có cách nào chứng minh " +
                "con trỏ đứng yên. Chạy -Diagnostics để xem cây UIA của grdRegi.");

        trace.Do("go Tab", () => _grid.Press(VirtualKeyShort.TAB));

        var after = _grid.FocusedCellName();
        LogKq(4, $"ô đang giữ con trỏ sau khi gõ Tab: 「{after}」");

        // grdRegi_KeyDown đặt e.Handled = true cho Tab (frm203002.cs:3566-3569) nên cả
        // hành vi mặc định của DataGridView (sang ô phải) LẪN StandardTab = true
        // (Designer.cs:1121, sang control kế tiếp) đều không xảy ra. Bản web để trình
        // duyệt xử lý Tab thì con trỏ bay ra khỏi lưới — lệch hẳn.
        Assert.That(after, Is.EqualTo(before),
            $"Tab phải bị NUỐT và con trỏ đứng yên (e.Handled = true, frm203002.cs:3566-3569). " +
            $"Con trỏ đã dời 「{before}」 → 「{after}」. Dời sang ô bên phải = hành vi mặc định của " +
            "DataGridView chưa bị chặn; ra khỏi lưới hẳn = Tab đang được trả cho thứ tự tab của form.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-5 — ô 点 chỉ ăn chữ số
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC-5 — ô 点 chỉ nhận '0'..'9', chữ cái bị chặn (grdRegi_TextBox_KeyPress, frm203002.cs:3599-3640)")]
    public void Tc5_TenCell_AcceptsDigitsOnly()
    {
        using var trace = TestTrace.Begin();
        var row = RequireAddedRow();
        var original = row.Ten;
        LogKq(5, $"ô 点 của dòng test trước khi gõ: 「{original}」");

        trace.Do("dat con tro vao o 点", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        trace.Do("go Enter de mo editor", () => _grid.Press(VirtualKeyShort.RETURN));

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

        Assert.That(editorText, Does.Not.Contain("a").IgnoreCase,
            $"ô 点 chỉ được nhận chữ số (grdRegi_TextBox_KeyPress, frm203002.cs:3599-3640) — " +
            $"chữ 「a」 phải bị nuốt, nhưng editor đang là 「{editorText}」. Bản web dùng " +
            "<input> thường mà không lọc phím thì mọi ký tự đều lọt.");

        // Escape trả ô về nguyên trạng — TC-7 còn cần dòng này với đúng số điểm cũ.
        trace.Do("Escape huy editor", () => _grid.Press(VirtualKeyShort.ESCAPE));

        var restored = _grid.LastRowMatching(_addedRowText!);
        LogKq(5, $"ô 点 sau khi Escape: 「{restored?.Ten}」 (trước khi gõ: 「{original}」)");
        Assert.That(restored?.Ten, Is.EqualTo(original),
            "Escape phải huỷ sửa và trả ô 点 về giá trị cũ");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-6 — Insert = 行追加
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("TC-6 — Insert chèn ĐÚNG 1 dòng tại con trỏ (frm203002.cs:3570-3572 → AddRow :3703)")]
    public void Tc6_InsertKey_AddsExactlyOneRow()
    {
        using var trace = TestTrace.Begin();
        var row = RequireAddedRow();

        trace.Do("dat con tro vao o 療法・処置", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));
        var before = _grid.RowCount();
        LogKq(6, $"số dòng trước khi gõ Insert: {before}");

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
        var row = RequireAddedRow();

        var marker = _addedRowText!;
        var before = _grid.RowCount();
        var pointBefore = _grid.AllPointValue();
        LogKq(7, $"trước khi xoá: {before} dòng, lbAllPoint = 「{_grid.AllPoint()}」, " +
                 $"dòng sắp xoá 点={row.Ten} 回={row.Kai}");

        trace.Do("dat con tro vao o 療法・処置 cua dong test", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));
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

        var gone = Waits.TryUntil(() => _grid.LastRowMatching(marker) is null);
        var after = _grid.RowCount();
        var pointAfter = _grid.AllPointValue();
        LogKq(7, $"sau khi xoá: {after} dòng ({after - before:+#;-#;0}), lbAllPoint = 「{_grid.AllPoint()}」");

        Assert.Multiple(() =>
        {
            Assert.That(gone, Is.True,
                $"Delete phải xoá dòng ĐANG ĐỨNG 「{marker}」 " +
                "(grdRegi_KeyDown :3574-3583 → DeleteRow :3814). Dòng vẫn còn tức là phím Delete " +
                "chưa được nối vào 行削除, hoặc DeleteRow đã từ chối ở một trong ba cổng đầu " +
                "(ô 日 rỗng :3840 / linekbn 99 :3841 / 日計行 :3843).");

            Assert.That(after, Is.LessThan(before),
                $"xoá xong lưới phải ít dòng hơn, đang là {before} → {after}");

            // Xoá xong DeleteRow gọi modAcc.Calc_MDPoint rồi ghi lại lbAllPoint
            // (frm203002.cs:3960-3966). Chỉ chốt CHIỀU chứ không chốt con số: 合計 của
            // tháng còn cộng cả 加算 mà app tự tính, nên một con số tuyệt đối ở đây sẽ
            // đỏ oan trên máy có dữ liệu khác.
            if (pointBefore is not null && pointAfter is not null && Txt.Int(row.Ten) > 0)
            {
                Assert.That(pointAfter, Is.LessThan(pointBefore),
                    $"xoá một dòng có 点={row.Ten} thì 合計点数 phải GIẢM " +
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
