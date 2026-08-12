using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.InpP23Parity;

/// <summary>
/// <b>自動算定 (frm203038/039) + 必要病名 (frm203036/037)</b> — luồng HỒI QUY.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO ĐỔI TỪ ĐIỀU TRA SANG HỒI QUY
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản đầu của file này ghi log rồi Pass, kèm mấy dòng 「nếu X thì kết luận Y」 để
/// người đọc tự luận. Bảy câu đó ĐÃ CÓ ĐÁP ÁN (đo 2026-08-11), nên giữ nguyên kiểu
/// ấy thì mỗi lần chạy chỉ in lại thứ đã biết — tốn 4 phút mà không phát hiện
/// được gì.
///
/// Giờ mỗi testcase ASSERT đúng con số đã đo. WinForm đổi (nâng cấp bản master,
/// sửa Designer) hoặc ai đó sửa harness làm phép đo lệch đi thì test đỏ ngay, thay
/// vì im lặng in ra một con số khác.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐÃ CHỐT — các testcase dưới đây GHIM lại, không hỏi lại nữa
/// ═══════════════════════════════════════════════════════════════════════════
///  Tc1  一覧 có 12 cột (自動算定) và 42 cột (必要病名) — đủ 5 算定処置 / 20 病名
///  Tc2  ESC và Enter KHÔNG làm gì trên form 登録
///  Tc3  Rời ô với mã &lt; 100 → xoá trắng CẢ BA ô, im lặng
///  Tc4  Rời ô với mã hợp lệ → điền 算定処置名 NGAY; mã không có → xoá trắng
///  Tc5  Click NHÃN コード mở 処置検索 (frm902011) / 病名検索 (frm902010)
///  Tc6  Đóng dialog → con trỏ 一覧 về DÒNG ĐẦU
///  Tc7  Mở 処置 có tham chiếu chết → slot đó hiện TRẮNG (nửa chỉ-đọc của KQ-7)
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÒN MỞ — chỉ còn một câu
/// ═══════════════════════════════════════════════════════════════════════════
///  Tc8  Lưới 42 cột cuộn ngang thế nào? Có ghim (freeze) cột 処置コード không?
///        Chuyện HIỂN THỊ, đọc source không ra, chỉ quan sát được. Đây là testcase
///        DUY NHẤT còn ở chế độ đo — không assert.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHI NÀO NÊN THÊM TESTCASE VÀO ĐÂY
/// ═══════════════════════════════════════════════════════════════════════════
/// Đếm lại cả đợt: 14 câu hỏi thì 13 câu đọc source hoặc query DB là ra, chỉ MỘT
/// câu bắt buộc phải chạy app — Tc2, vì <c>BaseDialog</c> nằm trong
/// <c>OchaFramework.dll</c> và repo không có source của DLL đó.
///
/// Nên mặc định là KHÔNG dựng testcase ở đây. Chỉ dựng khi:
///   · hành vi nằm trong DLL không có source (phím, focus, thứ tự Tab);
///   · source có nhánh bị comment-out hoặc phụ thuộc trạng thái runtime;
///   · cần nhìn tận mắt trước khi làm một thay đổi PHÁ DỮ LIỆU.
/// Còn lại thì mở <c>userapp/src/OCHACOM/</c> hoặc query thẳng Postgres — rẻ hơn
/// nhiều và cho cùng đáp án.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG còn testcase nào ghi, và cờ <c>inpP1.allowSave</c> không còn ý nghĩa với
/// luồng này. Bản trước có Tc7 bấm F9 để xem tham chiếu chết có mất khi lưu không
/// — đã đo xong (chkauto 100-0 còn (108-7, 0-0), 108-15 biến mất), nên giữ lại chỉ
/// là phá dữ liệu thêm một lần cho cùng một đáp án. Nửa chỉ-đọc của phép thử đó —
/// dialog hiện slot chết thành TRẮNG — vẫn được ghim ở Tc7.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-inp-p23-parity.ps1              ← chạy đủ, không cần cờ gì
///   .\run-inp-p23-parity.ps1 -Case Tc8
///   .\run-inp-p23-parity.ps1 -Diagnostics ← chỉ Tc0, khi một Tc khác đỏ
/// </summary>
[TestFixture]
[Category("inp-p23-parity")]
public sealed class InpP23Tests : InpP1Dialogs.InpP1TestBase
{
    /// <summary>
    /// 処置コード dùng để lọc 一覧. 100 = 初診: có cấu hình ở CẢ hai bảng nên một mã đủ
    /// cho cả hai cặp.
    ///
    /// <para><b>Luôn lọc trước khi đụng lưới.</b> Không lọc thì lưới giữ 1.664 dòng và
    /// mọi thao tác UIA trên nó đều phải liệt kê hết chừng ấy phần tử trước.</para>
    /// </summary>
    private const string ProbeTrtCd = "100";

    /// <summary>処置コード có nhiều 枝番 (116 = 18 dòng) — cho Tc6 và Tc8.</summary>
    private const string MultiRowTrtCd = "116";

    /// <summary>算定処置 có thật trong version hiện hành: 108-7 =「外安全1(初診)」.</summary>
    private const int KnownCd = 108;
    private const int KnownSb = 7;
    private const string KnownNm = "外安全1(初診)";

    private Window? _chkList;
    private Window? _disList;

    [OneTimeTearDown]
    public void CloseDialogsIfLeftOpen()
    {
        if (App is null) return;
        foreach (var (id, title) in new[]
                 {
                     (InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle),
                     (InpP23Dialog.DisRegisterId, InpP23Dialog.DisRegisterTitle),
                     (InpP23Dialog.ChkListId, InpP23Dialog.ChkListTitle),
                     (InpP23Dialog.DisListId, InpP23Dialog.DisListTitle),
                 })
        {
            var open = KarteAutoCalcDialog.FindDialogWindow(App, id, title, _chkList ?? _disList);
            if (open is null) continue;
            try { InpP23Dialog.Close(open); }
            catch (Exception e) { Log($"khong dong duoc {id}: {e.Message}"); }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc0 — chẩn đoán, KHÔNG assert
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("Tc0 — mở cả 4 form và đổ cây UIA; dùng khi Tc khác đỏ")]
    public void Tc0_DumpUiaTree()
    {
        using var trace = TestTrace.Begin();
        var screen = Screen.Window;
        Log($"=== KQ-0 === man dang mo: '{Uia.AutomationIdOf(screen)}' / '{Uia.NameOf(screen)}'");

        // Testcase DUY NHẤT không ném: khi một Tc khác đỏ vì đổi tên control, chạy
        // riêng cái này là có cây UIA thật để đối chiếu.
        DumpPair("chk", () => InpP23Dialog.OpenChkList(App, screen, trace),
                 InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);
        DumpPair("dis", () => InpP23Dialog.OpenDisList(App, screen, trace),
                 InpP23Dialog.DisRegisterId, InpP23Dialog.DisRegisterTitle, trace);

        Log("=== KQ-0 === artifact: p23-{chk,dis}-{list,register}.uia.txt");
    }

    private void DumpPair(
        string tag, Func<Window> openList, string registerId, string registerTitle, TestTrace trace)
    {
        var step = $"mo 一覧 ({tag})";
        try
        {
            var list = openList();
            Log($"=== KQ-0 === MO DUOC 一覧 {tag}: 「{Uia.NameOf(list)}」");
            if (tag == "chk") _chkList = list; else _disList = list;

            // LỌC TRƯỚC RỒI MỚI ĐỔ CÂY. Đổ cây lúc lưới còn 1.664 dòng là phần chậm
            // nhất của cả lần chạy (~90s cho 必要病名一覧 42 cột); lọc còn vài dòng thì
            // gần như tức thì.
            step = $"loc 一覧 ({tag})";
            Search(list, ProbeTrtCd);

            step = $"do cay 一覧 ({tag})";
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
                $"p23-{tag}-list.uia.txt", Uia.DumpTree(list, maxDepth: 6, maxChildrenPerNode: 60));

            step = $"F9 選択 ({tag})";
            var reg = InpP23Dialog.OpenRegister(App, list, registerId, registerTitle, trace);
            Log($"=== KQ-0 === MO DUOC 登録 {tag}: 「{Uia.NameOf(reg)}」");
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
                $"p23-{tag}-register.uia.txt", Uia.DumpTree(reg, maxDepth: 6, maxChildrenPerNode: 80));

            step = $"F10 dong 登録 ({tag})";
            InpP23Dialog.Close(reg);
            step = $"F10 dong 一覧 ({tag})";
            InpP23Dialog.Close(list);
        }
        catch (Exception e)
        {
            Log($"=== KQ-0 === dung o buoc 「{step}」: {e.GetType().Name}: {e.Message}");
            Log(KarteAutoCalcDialog.DescribeVisibleWindows(App));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 — số cột của hai 一覧
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — 一覧 phải có đủ 12 cột (5 算定処置) và 42 cột (20 病名)")]
    public void Tc1_ListShowsEverySlotColumn()
    {
        using var trace = TestTrace.Begin();

        var chk = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        Search(chk, ProbeTrtCd);
        var chkHeaders = ReadHeaders("自動算定一覧", chk);

        var dis = InpP23Dialog.OpenDisList(App, Screen.Window, trace);
        Search(dis, ProbeTrtCd);
        var disHeaders = ReadHeaders("必要病名一覧", dis);

        // 12 và 42 lấy từ _viewItem (frm203038.cs:47-58, frm203036.cs:49-90). Bản web
        // từng chỉ hiện 6 và 8 cột — giấu mất slot đã cấu hình.
        Assert.Multiple(() =>
        {
            Assert.That(chkHeaders, Has.Count.EqualTo(12), "自動算定一覧 phai co 12 cot");
            Assert.That(disHeaders, Has.Count.EqualTo(42), "必要病名一覧 phai co 42 cot");
            Assert.That(chkHeaders, Does.Contain("算定処置名5"), "phai co du 5 算定処置");
            Assert.That(disHeaders, Does.Contain("病名20"), "phai co du 20 病名");
        });

        trace.Step("dem cot");
    }

    private IReadOnlyList<string> ReadHeaders(string what, Window list)
    {
        var grid = KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListGridId);
        Assert.That(grid, Is.Not.Null, $"{what}: khong thay luoi 「{InpP23Dialog.ListGridId}」");

        var wf = new WinFormsGrid(grid!);
        var headers = wf.Headers();
        // Lưới này không dựng ô tiêu đề bằng HeaderItem nên Headers() trả rỗng —
        // dòng 0 CHÍNH LÀ tiêu đề.
        if (headers.Count == 0)
        {
            var rows = wf.Rows(limit: 1);
            if (rows.Count > 0) headers = rows[0].Cells;
        }

        Log($"=== KQ-6 === {what}: {headers.Count} cot");
        Log("   " + string.Join(" | ", headers));
        return headers;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc2 — bàn phím (câu DUY NHẤT không đọc được từ source)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc2 — ESC và Enter không làm gì trên 自動算定登録")]
    public void Tc2_EscapeAndEnterDoNothing()
    {
        using var trace = TestTrace.Begin();
        var list = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        Search(list, ProbeTrtCd);
        var reg = InpP23Dialog.OpenRegister(
            App, list, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);

        // ── Enter ────────────────────────────────────────────────────────
        FocusBox(reg, InpP23Dialog.ChkCdBox(1));
        var beforeEnter = FocusedId();
        Uia.SendKey(InpP23Dialog.VkEnter);
        Waits.Step();
        Thread.Sleep(300);
        var afterEnter = FocusedId();
        Log($"=== KQ-1 === Enter: focus {beforeEnter} → {afterEnter}");

        // ── ESC ──────────────────────────────────────────────────────────
        // Không sửa gì trước khi bấm: nếu hoá ra ESC = 登録 thì cũng chỉ ghi lại đúng
        // dữ liệu cũ.
        Uia.SendKey(InpP23Dialog.VkEscape);
        Waits.Step();
        Thread.Sleep(500);

        // Bỏ chính form 登録 khỏi danh sách: nó modal trên 一覧 nên ModalDialogs.All
        // luôn kể tên nó, trông y như một hộp Q00002 vừa bung.
        var newDialogs = ModalDialogs.All(App, list)
            .Where(d => !Txt.Same(Uia.AutomationIdOf(d), InpP23Dialog.ChkRegisterId))
            .ToList();
        foreach (var d in newDialogs) Log($"=== KQ-1 === sau ESC co hop thoai: 「{Uia.NameOf(d)}」");

        var stillOpen = KarteAutoCalcDialog.FindDialogWindow(
            App, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, list) is not null;
        Log($"=== KQ-1 === sau ESC: dialog con mo = {stillOpen}");

        Assert.Multiple(() =>
        {
            Assert.That(afterEnter, Is.EqualTo(beforeEnter), "Enter KHONG duoc doi focus");
            Assert.That(stillOpen, Is.True, "ESC KHONG duoc dong form 登録");
            Assert.That(newDialogs, Is.Empty, "ESC KHONG duoc bung hop thoai xac nhan");
        });

        InpP23Dialog.Close(reg);
        trace.Step("do phim");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc3 — rời ô với mã < 100
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — mã < 100 rồi rời ô → xoá trắng cả ba ô, im lặng")]
    public void Tc3_LeaveClearsCodeBelowHundred()
    {
        using var trace = TestTrace.Begin();
        var reg = OpenChkRegister(trace);

        SetBox(reg, InpP23Dialog.ChkCdBox(1), "99");

        // PHẢI rời ô bằng CHUỘT THẬT. Phím Tab bị form nuốt (đo 2026-08-11: focus
        // không đổi sau Tab), nên Leave không bao giờ bắn và số đọc ra sẽ là giá trị
        // GỐC của slot — trông hệt như 「WinForm không xoá」.
        FocusBox(reg, InpP23Dialog.ChkSbBox(1));
        Thread.Sleep(500);
        LogChkSlot("sau khi roi o", reg, 1);

        var cd = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(1));
        var sb = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkSbBox(1));
        var nm = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(1));
        var dialogs = ModalDialogs.All(App, reg).ToList();

        Assert.Multiple(() =>
        {
            Assert.That(cd, Is.Empty, "コード phai bi xoa trang");
            Assert.That(sb, Is.Empty, "枝番 phai bi xoa trang");
            Assert.That(nm, Is.Empty, "名称 phai bi xoa trang");
            Assert.That(dialogs, Is.Empty,
                "WinForm KHONG bao loi o buoc nay — chi toi F9 moi bung E00002");
        });

        InpP23Dialog.Close(reg);
        trace.Step("Leave < 100");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc4 — rời ô tra tên ngay
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("Tc4 — mã hợp lệ → 算定処置名 hiện NGAY; mã không có → xoá trắng")]
    public void Tc4_LeaveResolvesNameImmediately()
    {
        using var trace = TestTrace.Begin();
        var reg = OpenChkRegister(trace);

        SetBox(reg, InpP23Dialog.ChkCdBox(2), KnownCd.ToString());
        SetBox(reg, InpP23Dialog.ChkSbBox(2), KnownSb.ToString());
        FocusBox(reg, InpP23Dialog.ChkCdBox(3));
        Thread.Sleep(600);

        var resolved = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(2));
        Log($"=== KQ-2 === slot2 sau khi go {KnownCd}/{KnownSb}: 名称 =「{resolved}」");

        // Mã KHÔNG tồn tại: WinForm xoá trắng, cũng im lặng.
        SetBox(reg, InpP23Dialog.ChkCdBox(3), "999");
        SetBox(reg, InpP23Dialog.ChkSbBox(3), "9");
        FocusBox(reg, InpP23Dialog.ChkCdBox(4));
        Thread.Sleep(600);
        LogChkSlot("ma khong ton tai 999/9", reg, 3);

        var badCd = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(3));
        var badNm = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(3));

        Assert.Multiple(() =>
        {
            Assert.That(resolved, Is.EqualTo(KnownNm),
                "名称 phai hien NGAY khi roi o, khong doi toi F9");
            Assert.That(badCd, Is.Empty, "ma khong tra duoc thi コード bi xoa trang");
            Assert.That(badNm, Is.Empty, "ma khong tra duoc thi 名称 bi xoa trang");
        });

        InpP23Dialog.Close(reg);
        trace.Step("Leave tra ten");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc5 — click NHÃN mở popup tìm kiếm
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("Tc5 — click nhãn コード mở 処置検索 / 病名検索")]
    public void Tc5_LabelClickOpensSearchDialog()
    {
        using var trace = TestTrace.Begin();

        var reg = OpenChkRegister(trace);
        var trtSearch = ProbeLabel(
            reg, InpP23Dialog.ChkCdLabel(1), InpP23Dialog.TrtSearchId, "処置検索");
        InpP23Dialog.Close(reg);

        var disList = InpP23Dialog.OpenDisList(App, Screen.Window, trace);
        Search(disList, ProbeTrtCd);
        var disReg = InpP23Dialog.OpenRegister(
            App, disList, InpP23Dialog.DisRegisterId, InpP23Dialog.DisRegisterTitle, trace);
        var disSearch = ProbeLabel(
            disReg, InpP23Dialog.DisCdLabel(1), InpP23Dialog.DisSearchId, "病名検索");
        InpP23Dialog.Close(disReg);

        Assert.Multiple(() =>
        {
            Assert.That(trtSearch, Is.True, "click lblCd1 phai mo 処置検索 (frm902011)");
            Assert.That(disSearch, Is.True, "click lblDisCd1 phai mo 病名検索 (frm902010)");
        });

        trace.Step("popup tim kiem");
    }

    private bool ProbeLabel(Window reg, string labelId, string expectedId, string what)
    {
        var label = KarteAutoCalcDialog.FindChrome(reg, labelId, InpP23Dialog.ListGridId);
        if (label is null)
        {
            Log($"=== KQ-4 === khong thay nhan 「{labelId}」 — chay Tc0 roi doi chieu cay UIA");
            return false;
        }

        // Nhãn mở form bằng showDialog ⇒ MODAL ⇒ chuột vật lý, Invoke sẽ treo 20s.
        KarteAutoCalcDialog.ClickModalOpener(label);
        Waits.Step();
        Thread.Sleep(700);

        var found = KarteAutoCalcDialog.FindDialogWindow(App, expectedId, what, reg);
        Log($"=== KQ-4 === click 「{labelId}」 → {what} ({expectedId}): {found is not null}");
        if (found is null) { Log(KarteAutoCalcDialog.DescribeVisibleWindows(App)); return false; }

        InpP23Dialog.Close(found);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc6 — con trỏ dòng sau khi đóng dialog
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("Tc6 — đóng dialog → con trỏ 一覧 về DÒNG ĐẦU")]
    public void Tc6_ClosingDialogResetsCursorToFirstRow()
    {
        using var trace = TestTrace.Begin();
        var list = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        // 116 có 18 枝番 — đủ dòng để chọn một dòng ở giữa mà lưới vẫn nhỏ.
        Search(list, MultiRowTrtCd);

        var grid = KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListGridId);
        Assert.That(grid, Is.Not.Null, "khong thay luoi");

        // rows[0] là dòng TIÊU ĐỀ (lưới này không dùng HeaderItem), nên rows[1] mới là
        // dòng dữ liệu đầu tiên.
        var rows = new WinFormsGrid(grid!).Rows(limit: 12);
        Assert.That(rows, Has.Count.GreaterThanOrEqualTo(7), "can it nhat 6 dong du lieu");

        var firstDataRow = string.Join(" | ", rows[1].Cells.Take(2));
        var target = rows[5];
        var (x, y) = Uia.Center(target.Element);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
        Log($"=== KQ-5 === da chon: {string.Join(" | ", target.Cells.Take(2))}");

        var reg = InpP23Dialog.OpenRegister(
            App, list, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);
        InpP23Dialog.Close(reg);
        Thread.Sleep(800);

        var focused = new WinFormsGrid(
            KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListGridId)!).FocusedRow(App.Automation);
        var focusedText = focused is null
            ? "(khong doc duoc)"
            : string.Join(" | ", focused.Cells.Take(2));
        Log($"=== KQ-5 === sau khi dong dialog, dong focus: {focusedText}");
        Log($"=== KQ-5 === dong du lieu dau tien la: {firstDataRow}");

        // defData chỉ gọi lại getViewData; đoạn khôi phục vị trí dòng bị comment out
        // (frm203038.cs:233-238).
        Assert.That(focusedText, Is.EqualTo(firstDataRow),
            "con tro phai ve dong dau — ban web cung phai reset selectedIndex");

        trace.Step("con tro dong");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc7 — tham chiếu chết hiện trắng (CHỈ ĐỌC)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(7)]
    [Description("Tc7 — 処置 có tham chiếu chết mở ra với slot đó TRẮNG (chỉ đọc)")]
    public void Tc7_DanglingReferenceOpensBlank()
    {
        using var trace = TestTrace.Begin();

        // 100-0 có chkauto = (108-7, 108-15); 108-15 không còn trong version hôm nay.
        // Bản trước bấm F9 để xem nó có mất khi lưu không — ĐÃ ĐO XONG (mất thật,
        // chkauto còn (108-7, 0-0)), nên giờ chỉ giữ nửa CHỈ ĐỌC. Bấm F9 lần nữa chỉ
        // phá thêm dữ liệu cho cùng một đáp án.
        Log("=== KQ-7 === 100-0 co (108-7, 108-15); 108-15 khong con trong version hom nay");

        var reg = OpenChkRegister(trace);
        for (var i = 1; i <= InpP23Dialog.ChkSlotCount; i++) LogChkSlot("luc MO", reg, i);

        var slot1Cd = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(1));
        var slot1Nm = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(1));
        var slot2Cd = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(2));

        Assert.Multiple(() =>
        {
            Assert.That(slot1Cd, Is.EqualTo(KnownCd.ToString()), "slot1 phai giu 108");
            Assert.That(slot1Nm, Is.EqualTo(KnownNm), "slot1 phai co ten");
            Assert.That(slot2Cd, Is.Empty,
                "slot2 (108-15, khong con ton tai) phai hien TRANG — luu lai la mat han");
        });

        InpP23Dialog.Close(reg);
        trace.Step("tham chieu chet");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc8 — CÂU CÒN MỞ: lưới 42 cột cuộn ngang thế nào
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(8)]
    [Description("Tc8 — CÒN MỞ: 必要病名一覧 cuộn ngang, có ghim cột 処置コード không?")]
    public void Tc8_HorizontalScrollFreezesFirstColumns()
    {
        using var trace = TestTrace.Begin();
        var list = InpP23Dialog.OpenDisList(App, Screen.Window, trace);
        Search(list, MultiRowTrtCd);

        var grid = KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListGridId);
        if (grid is null) { Log("=== KQ-8 === khong thay luoi"); Assert.Pass(); return; }

        var scroll = grid.Patterns.Scroll.PatternOrDefault;
        if (scroll is null)
        {
            Log("=== KQ-8 === luoi khong co ScrollPattern — khong do duoc bang UIA");
            Assert.Pass("khong do duoc");
            return;
        }

        Log($"=== KQ-8 === cuon ngang duoc? {scroll.HorizontallyScrollable.ValueOrDefault}");

        // Toạ độ X của ô 処置コード trên dòng tiêu đề, trước và sau khi cuộn hết sang
        // phải. Giữ nguyên X ⇒ cột bị GHIM; trôi đi ⇒ cuộn bình thường.
        var beforeX = HeaderCellX(grid, 0);
        Log($"=== KQ-8 === truoc khi cuon: 処置コード o X = {beforeX}");

        try { scroll.SetScrollPercent(100, -1); }
        catch (Exception e) { Log($"=== KQ-8 === khong cuon duoc: {e.Message}"); }
        Waits.Step();
        Thread.Sleep(700);

        var afterX = HeaderCellX(grid, 0);
        Log($"=== KQ-8 === sau khi cuon het phai: 処置コード o X = {afterX}");
        Log("   X GIU NGUYEN ⇒ WinForm GHIM cot dau — ban web phai ghim theo");
        Log("   X doi nhieu / am ⇒ cuon binh thuong — ban web dang dung");

        // CÒN MỞ nên KHÔNG assert: lần chạy này chính là phép đo. Chốt được rồi thì
        // đổi thành assert như các Tc trên.
        trace.Step("cuon ngang");
    }

    /// <summary>Toạ độ X của ô thứ <paramref name="index"/> trên dòng tiêu đề.</summary>
    private static string HeaderCellX(AutomationElement grid, int index)
    {
        try
        {
            var header = new WinFormsGrid(grid).Rows(limit: 1).FirstOrDefault();
            if (header is null) return "(khong doc duoc dong tieu de)";
            var cells = Uia.Children(header.Element).ToList();
            if (index >= cells.Count) return "(khong du o)";
            return ((int)cells[index].BoundingRectangle.X).ToString();
        }
        catch (Exception e) { return $"(loi: {e.Message})"; }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helper
    // ═══════════════════════════════════════════════════════════════════════

    private void LogChkSlot(string when, Window reg, int slot) =>
        Log($"=== KQ === slot{slot} {when}: " +
            $"コード=「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(slot))}」 " +
            $"枝番=「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkSbBox(slot))}」 " +
            $"名称=「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(slot))}」");

    private Window OpenChkRegister(TestTrace trace)
    {
        var list = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        Search(list, ProbeTrtCd);
        return InpP23Dialog.OpenRegister(
            App, list, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);
    }

    /// <summary>Gõ điều kiện rồi bấm 検索 — 0 件 thì bung E00003 nên phải chuột vật lý.</summary>
    private void Search(Window list, string trtCd)
    {
        var cd = KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListTrtCdBoxId, InpP23Dialog.ListGridId);
        if (cd is not null) Uia.SetText(cd, trtCd);

        var btn = KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListSearchButtonId, InpP23Dialog.ListGridId);
        if (btn is not null) KarteAutoCalcDialog.ClickModalOpener(btn);
        Waits.Step();
        foreach (var d in ModalDialogs.All(App, list)) { try { Dialogs.DismissOk(d); } catch { } }
        Waits.Step();
    }

    private void SetBox(Window root, string automationId, string value)
    {
        var el = KarteAutoCalcDialog.FindChrome(root, automationId, InpP23Dialog.ListGridId);
        Assert.That(el, Is.Not.Null, $"khong thay o 「{automationId}」 — chay Tc0 roi doi chieu cay UIA");
        try { el!.Focus(); } catch { /* focus la best-effort */ }
        Uia.SetText(el!, value);
    }

    private void FocusBox(Window root, string automationId)
    {
        var el = KarteAutoCalcDialog.FindChrome(root, automationId, InpP23Dialog.ListGridId);
        Assert.That(el, Is.Not.Null, $"khong thay o 「{automationId}」");
        var (x, y) = Uia.Center(el!);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    private string FocusedId()
    {
        try
        {
            var el = App.Automation.FocusedElement();
            return $"id='{Uia.AutomationIdOf(el)}'";
        }
        catch (Exception e) { return $"(khong doc duoc: {e.Message})"; }
    }
}
