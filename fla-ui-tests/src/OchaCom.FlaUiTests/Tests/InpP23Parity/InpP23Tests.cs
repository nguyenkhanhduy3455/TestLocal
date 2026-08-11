using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.InpP23Parity;

/// <summary>
/// <b>自動算定 (frm203038/039) + 必要病名 (frm203036/037)</b> — luồng ĐIỀU TRA cho
/// cặp 2 và cặp 3, không phải luồng hồi quy.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CHỈ CÒN NHỮNG CÂU NÀY
/// ═══════════════════════════════════════════════════════════════════════════
/// Phần lớn hành vi của hai cặp đã đọc thẳng ra được từ source và KHÔNG cần đo:
///
///   · số cột 一覧          — <c>_viewItem</c>: frm203038 có 12 cột, frm203036 có 42
///   · tra tên 2 nhánh      — <c>getTrtNm</c> / <c>getDisNm</c>
///   · dồn slot khi lưu     — <c>setInputData</c> 「空行は詰める」
///   · xoá khi rỗng         — <c>updateProc</c> 「1件も存在しない場合、登録しない」
///   · 算定内容             — nhãn TĨNH ở frm203039.Designer.cs:460, không bind dữ liệu
///
/// Còn lại đúng bảy câu, và tất cả đều rơi vào một trong hai loại:
/// <list type="bullet">
///   <item>nằm trong <c>OchaFramework.dll</c> — KHÔNG có source trong repo (phím);</item>
///   <item>là hành vi tương tác chỉ thấy khi chạy (Leave, popup, con trỏ lưới).</item>
/// </list>
///
/// <para><b>Cách đọc kết quả</b>: chạy xong lấy toàn bộ dòng <c>=== KQ-</c> gửi lại.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BẢY CÂU
/// ═══════════════════════════════════════════════════════════════════════════
///  KQ-1 Bàn phím trên form 登録: ESC làm gì? Enter làm gì?
///        → Repo có luật 「ESC = phím End (登録/確定), KHÔNG phải cancel」. Nhưng
///          frm203039/frm203037 kế thừa <c>OchaFramework.Forms.BaseDialog</c> — DLL
///          ngoài, không có source. Nếu ESC thật sự là 登録 mà bản web đang đóng
///          dialog thì người dùng bấm ESC là MẤT dữ liệu vừa nhập.
///  KQ-2 Rời ô 枝番 (Leave) có tra tên NGAY không?
///        → source nói có (<c>txtSb_Leave</c>, frm203039.cs:186-200). Bản web hiện
///          chỉ biết đúng/sai lúc bấm F9 ⇒ gõ xong không thấy tên. Cần xác nhận
///          để biết phải thêm endpoint tra tên theo (cd, sb).
///  KQ-3 Rời ô コード với mã &lt; 100 có XOÁ TRẮNG 3 ô không?
///        → <c>txtCd_Leave</c> (frm203039.cs:177-185) nói có, và im lặng không báo lỗi.
///  KQ-4 CLICK vào NHÃN 算定処置コード có mở 処置検索 (frm902011) không?
///        → nhãn chứ không phải nút — hiếm, dễ bỏ sót. Tương tự 病名コード → frm902010.
///  KQ-5 Đóng dialog xong, 一覧 có giữ nguyên dòng đang chọn không?
///        → frm203038.defData gọi lại <c>getViewData()</c>, phần giữ vị trí dòng bị
///          COMMENT OUT (frm203038.cs:233-238). Nếu con trỏ nhảy về đầu thì bản web
///          cũng phải nhảy về đầu.
///  KQ-6 一覧 hiện ĐỦ 5 算定処置 / 20 病名 chứ? Cuộn ngang thế nào?
///        → source nói 12 và 42 cột. Bản web đang hiện 2 và 3 — SAI, sẽ sửa; đo để
///          biết WinForm có freeze cột 処置コード khi cuộn hay không.
///  KQ-7 Lưu một 処置 có tham chiếu CHẾT thì tham chiếu đó biến mất thật chứ?
///        → 100-0 trỏ tới 108-15, mã này không còn trong version hôm nay. dspData xoá
///          trắng slot đó khi mở ⇒ F9 ghi đè là MẤT. Đây là hành vi phá dữ liệu nên
///          phải nhìn tận mắt. GHI DB — chỉ chạy khi bật inpP1.allowSave.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-inp-p23-parity.ps1 -Diagnostics   ← CHẠY CÁI NÀY TRƯỚC TIÊN
///   .\run-inp-p23-parity.ps1
///   .\run-inp-p23-parity.ps1 -Case Tc4
///
/// Tên control (<c>txtCd1</c>, <c>lblDisCd1</c>…) mới là SUY ĐOÁN từ
/// <c>INP.Lib.GetControl</c>; Tc0 đổ cây UIA thật để sửa lại trước.
/// </summary>
[TestFixture]
[Category("inp-p23-parity")]
public sealed class InpP23Tests : InpP1Dialogs.InpP1TestBase
{
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
    // Tc0 — chẩn đoán: mở đủ 4 form, đổ cây UIA
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("Tc0 — mở cả 4 form và đổ cây UIA để chốt tên control")]
    public void Tc0_DumpUiaTree()
    {
        using var trace = TestTrace.Begin();
        var screen = Screen.Window;
        Log($"=== KQ-0 === man dang mo: '{Uia.AutomationIdOf(screen)}' / '{Uia.NameOf(screen)}'");

        // Không ném ở bất kỳ bước nào: một lần chạy phải ra đủ bức tranh dù hỏng
        // giữa chừng. Bài học từ luồng KarteAutoCalc — mỗi lần ném là mất một vòng
        // gửi log qua lại.
        DumpPair("chk", () => InpP23Dialog.OpenChkList(App, screen, trace),
                 InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);
        DumpPair("dis", () => InpP23Dialog.OpenDisList(App, screen, trace),
                 InpP23Dialog.DisRegisterId, InpP23Dialog.DisRegisterTitle, trace);

        Log("=== KQ-0 === Gui lai: moi dong '=== KQ-' + cac file artifacts\\p23-*.uia.txt");
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
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
                $"p23-{tag}-list.uia.txt", Uia.DumpTree(list, maxDepth: 6, maxChildrenPerNode: 60));

            step = $"loc 一覧 ({tag}) ve 処置コード=100";
            Search(list, "100");

            step = $"F9 選択 ({tag})";
            var reg = InpP23Dialog.OpenRegister(App, list, registerId, registerTitle, trace);
            Log($"=== KQ-0 === MO DUOC 登録 {tag}: 「{Uia.NameOf(reg)}」");
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
                $"p23-{tag}-register.uia.txt", Uia.DumpTree(reg, maxDepth: 6, maxChildrenPerNode: 80));

            step = $"F10 dong 登録 ({tag})";
            InpP23Dialog.Close(reg);
        }
        catch (Exception e)
        {
            Log($"=== KQ-0 === dung o buoc 「{step}」: {e.GetType().Name}: {e.Message}");
            Log(KarteAutoCalcDialog.DescribeVisibleWindows(App));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 — KQ-6 số cột của hai 一覧
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — KQ-6: 一覧 hiện đủ 5 算定処置 / 20 病名 chứ?")]
    public void Tc1_ListColumnCount()
    {
        using var trace = TestTrace.Begin();

        ReportColumns("自動算定一覧", InpP23Dialog.OpenChkList(App, Screen.Window, trace), 12);
        ReportColumns("必要病名一覧", InpP23Dialog.OpenDisList(App, Screen.Window, trace), 42);

        Log("   Ban web dang hien 6 cot (2 算定処置) va 8 cot (3 病名) — neu so tren la");
        Log("   12/42 thi ban web THIEU cot va phai sua.");
        trace.Step("dem cot");
    }

    private void ReportColumns(string what, Window list, int expected)
    {
        var grid = KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListGridId);
        if (grid is null) { Log($"=== KQ-6 === {what}: khong thay luoi"); return; }

        var headers = new WinFormsGrid(grid).Headers();
        // Lưới này không dựng ô tiêu đề bằng HeaderItem (đo được ở luồng
        // KarteAutoCalc), nên Headers() có thể rỗng — khi đó đọc dòng 0.
        if (headers.Count == 0)
        {
            var rows = new WinFormsGrid(grid).Rows(limit: 1);
            if (rows.Count > 0) headers = rows[0].Cells;
        }

        Log($"=== KQ-6 === {what}: {headers.Count} cot (ky vong {expected})");
        Log("   " + string.Join(" | ", headers.Take(45)));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc2 — KQ-1 bàn phím trên form 登録
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc2 — KQ-1: ESC và Enter làm gì trên 自動算定登録")]
    public void Tc2_KeyBehaviourOnRegister()
    {
        using var trace = TestTrace.Begin();
        var list = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        Search(list, "100");
        var reg = InpP23Dialog.OpenRegister(
            App, list, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);

        // ── Enter ────────────────────────────────────────────────────────
        FocusBox(reg, InpP23Dialog.ChkCdBox(1));
        Log($"=== KQ-1 === truoc Enter, focus = {FocusedId()}");
        Uia.SendKey(InpP23Dialog.VkEnter);
        Waits.Step();
        Log($"=== KQ-1 === sau Enter,  focus = {FocusedId()}");
        Log("   doi sang o ke tiep ⇒ Enter = di chuyen (web phai bat chuoc)");
        Log("   khong doi / dialog dong ⇒ Enter = 確定 hoac khong lam gi");

        // ── ESC ──────────────────────────────────────────────────────────
        // KHÔNG sửa gì trước khi bấm, để nếu ESC = 登録 thì cũng chỉ ghi lại
        // đúng dữ liệu cũ.
        var stillOpenBefore = KarteAutoCalcDialog.FindDialogWindow(
            App, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, list) is not null;
        Log($"=== KQ-1 === truoc ESC: dialog dang mo = {stillOpenBefore}");

        Uia.SendKey(InpP23Dialog.VkEscape);
        Waits.Step();
        Thread.Sleep(400);

        var dialogs = ModalDialogs.All(App, list).ToList();
        foreach (var d in dialogs) Log($"=== KQ-1 === sau ESC, hop thoai: 「{Uia.NameOf(d)}」 {Trim(Txt.N(Dialogs.TextOf(d)), 80)}");

        var stillOpenAfter = KarteAutoCalcDialog.FindDialogWindow(
            App, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, list) is not null;
        Log($"=== KQ-1 === sau ESC:  dialog dang mo = {stillOpenAfter}");
        Log("   van mo + co hop thoai Q00002 ⇒ ESC = 登録 (bản web đang ĐÓNG ⇒ SAI, mat du lieu)");
        Log("   dong han, khong hoi gi        ⇒ ESC = 戻る (bản web đúng)");
        Log("   khong doi gi                  ⇒ ESC bi nuot");

        // Dọn: đóng hộp xác nhận nếu ESC bung ra, rồi đóng dialog.
        foreach (var d in ModalDialogs.All(App, list))
        {
            // Chỉ có DismissOk trong Infrastructure; hộp Q00002 mà ESC bung ra sẽ
            // được OK — tức là GHI. Không mong muốn, nên chỉ log rồi để người chạy
            // tự quyết; test này không được tự ý ghi DB.
            Log($"   ⚠️ hop thoai dang mo: 「{Uia.NameOf(d)}」 — DONG BANG TAY (Cancel) roi chay tiep");
        }
        var reg2 = KarteAutoCalcDialog.FindDialogWindow(
            App, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, list);
        if (reg2 is not null) InpP23Dialog.Close(reg2);

        trace.Step("do phim");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc3 — KQ-3 rời ô コード với mã < 100
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — KQ-3: gõ mã < 100 rồi rời ô có xoá trắng 3 ô không")]
    public void Tc3_LeaveClearsCodeBelowHundred()
    {
        using var trace = TestTrace.Begin();
        var reg = OpenChkRegister(trace);

        SetBox(reg, InpP23Dialog.ChkCdBox(1), "99");
        // Tab = rời ô, đúng cách người dùng gây ra Leave.
        Uia.SendKey(InpP23Dialog.VkTab);
        Waits.Step();
        Thread.Sleep(300);

        Log("=== KQ-3 === sau khi go 99 roi Tab:");
        Log($"   コード = 「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(1))}」");
        Log($"   枝番   = 「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkSbBox(1))}」");
        Log($"   名称   = 「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(1))}」");
        Log("   ca ba RONG ⇒ dung nhu source (txtCd_Leave) — ban web phai lam theo");
        Log("   con 99     ⇒ chi kiem luc F9, ban web hien tai dang dung");

        foreach (var d in ModalDialogs.All(App, reg)) { try { Dialogs.DismissOk(d); } catch { } }
        InpP23Dialog.Close(reg);
        trace.Step("do Leave < 100");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc4 — KQ-2 rời ô 枝番 có tra tên ngay không
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("Tc4 — KQ-2: gõ コード+枝番 hợp lệ rồi Tab, tên có hiện NGAY không")]
    public void Tc4_LeaveResolvesNameImmediately()
    {
        using var trace = TestTrace.Begin();
        var reg = OpenChkRegister(trace);

        // 108-7 = 外安全１(初診), đo được là có thật trong version hôm nay.
        SetBox(reg, InpP23Dialog.ChkCdBox(2), "108");
        Uia.SendKey(InpP23Dialog.VkTab);
        Waits.Step();
        SetBox(reg, InpP23Dialog.ChkSbBox(2), "7");
        Uia.SendKey(InpP23Dialog.VkTab);
        Waits.Step();
        Thread.Sleep(400);

        var nm = InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(2));
        Log($"=== KQ-2 === sau khi go 108 / 7 roi Tab: 名称 = 「{nm}」");
        Log("   co ten ngay ⇒ WinForm tra master khi Leave. Ban web PHAI them endpoint");
        Log("                 tra ten theo (cd, sb), khong the doi toi F9");
        Log("   van rong    ⇒ ten chi hien sau khi luu + mo lai, ban web dang dung");

        // Thử luôn mã KHÔNG tồn tại để xem có bị xoá trắng không.
        SetBox(reg, InpP23Dialog.ChkCdBox(3), "999");
        Uia.SendKey(InpP23Dialog.VkTab);
        Waits.Step();
        SetBox(reg, InpP23Dialog.ChkSbBox(3), "9");
        Uia.SendKey(InpP23Dialog.VkTab);
        Waits.Step();
        Thread.Sleep(400);
        Log($"=== KQ-2 === ma khong ton tai 999/9: コード=「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(3))}」 " +
            $"名称=「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(3))}」");

        foreach (var d in ModalDialogs.All(App, reg)) { try { Dialogs.DismissOk(d); } catch { } }
        InpP23Dialog.Close(reg);
        trace.Step("do Leave tra ten");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc5 — KQ-4 click NHÃN mở popup tìm kiếm
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("Tc5 — KQ-4: click nhãn 算定処置コード / 病名コード có mở popup tìm kiếm không")]
    public void Tc5_LabelClickOpensSearchDialog()
    {
        using var trace = TestTrace.Begin();
        var reg = OpenChkRegister(trace);

        ProbeLabel(reg, InpP23Dialog.ChkCdLabel(1), InpP23Dialog.TrtSearchId, "処置検索");
        InpP23Dialog.Close(reg);

        var disList = InpP23Dialog.OpenDisList(App, Screen.Window, trace);
        Search(disList, "121");
        var disReg = InpP23Dialog.OpenRegister(
            App, disList, InpP23Dialog.DisRegisterId, InpP23Dialog.DisRegisterTitle, trace);
        ProbeLabel(disReg, InpP23Dialog.DisCdLabel(1), InpP23Dialog.DisSearchId, "病名検索");
        InpP23Dialog.Close(disReg);

        trace.Step("do popup tim kiem");
    }

    private void ProbeLabel(Window reg, string labelId, string expectedId, string what)
    {
        var label = KarteAutoCalcDialog.FindChrome(reg, labelId, InpP23Dialog.ListGridId);
        if (label is null)
        {
            Log($"=== KQ-4 === khong thay nhan 「{labelId}」 — xem p23-*-register.uia.txt roi sua ten");
            return;
        }

        // Nhãn mở form bằng showDialog ⇒ MODAL ⇒ phải chuột vật lý, Invoke sẽ treo.
        KarteAutoCalcDialog.ClickModalOpener(label);
        Waits.Step();
        Thread.Sleep(600);

        var found = KarteAutoCalcDialog.FindDialogWindow(App, expectedId, what, reg);
        Log($"=== KQ-4 === click nhan 「{labelId}」 → {what} ({expectedId}) mo? {found is not null}");
        if (found is not null)
        {
            Log($"   title = 「{Uia.NameOf(found)}」");
            InpP23Dialog.Close(found);
        }
        else
        {
            Log("   khong mo ⇒ hoac nhan khong click duoc, hoac ten form khac suy doan.");
            Log(KarteAutoCalcDialog.DescribeVisibleWindows(App));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc6 — KQ-5 con trỏ dòng của 一覧 sau khi đóng dialog
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("Tc6 — KQ-5: đóng dialog xong 一覧 có giữ dòng đang chọn không")]
    public void Tc6_ListKeepsSelectedRow()
    {
        using var trace = TestTrace.Begin();
        var list = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        // Bỏ lọc để có nhiều dòng, rồi chọn một dòng ở GIỮA — nếu con trỏ nhảy về
        // đầu thì mới thấy được.
        Search(list, "");

        var grid = KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListGridId);
        if (grid is null) { Log("=== KQ-5 === khong thay luoi"); Assert.Pass(); return; }

        var rows = new WinFormsGrid(grid).Rows(limit: 12);
        if (rows.Count < 6) { Log($"=== KQ-5 === chi co {rows.Count} dong, khong du de do"); Assert.Pass(); return; }

        var target = rows[5];
        var (x, y) = Uia.Center(target.Element);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
        Log($"=== KQ-5 === da chon dong 6: {string.Join(" | ", target.Cells.Take(2))}");

        var reg = InpP23Dialog.OpenRegister(
            App, list, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);
        InpP23Dialog.Close(reg);
        Thread.Sleep(600);

        var focused = new WinFormsGrid(
            KarteAutoCalcDialog.FindChrome(list, InpP23Dialog.ListGridId)!).FocusedRow(App.Automation);
        Log($"=== KQ-5 === sau khi dong dialog, dong dang focus: " +
            (focused is null ? "(khong doc duoc)" : string.Join(" | ", focused.Cells.Take(2))));
        Log("   van la dong 6 ⇒ WinForm giu con tro, ban web phai giu theo");
        Log("   ve dong 1     ⇒ WinForm nap lai tu dau, ban web dang dung");

        trace.Step("do con tro dong");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc7 — KQ-7 lưu 処置 có tham chiếu chết (GHI DB)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(7)]
    [Description("Tc7 — KQ-7: F9 trên 処置 có tham chiếu chết có làm MẤT nó không (GHI DB)")]
    public void Tc7_SavingDropsDanglingReference()
    {
        RequireAllowSave("F9 tren 100-0 se ghi that vao chkauto (master TOAN PHONG KHAM)");
        using var trace = TestTrace.Begin();

        Log("=== KQ-7 === 処置 100-0 co chkauto = (108-7, 108-15); 108-15 KHONG con trong");
        Log("   version hom nay. Neu dspData xoa trang slot 2 va F9 ghi de thi 108-15 MAT.");
        Log("   ⚠️ KHOI PHUC thu cong sau khi chay:");
        Log("   UPDATE chkauto SET cd_2=108, sb_2=15 WHERE trt_cd=100 AND trt_sb=0;");

        var list = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        Search(list, "100");
        var reg = InpP23Dialog.OpenRegister(
            App, list, InpP23Dialog.ChkRegisterId, InpP23Dialog.ChkRegisterTitle, trace);

        for (var i = 1; i <= InpP23Dialog.ChkSlotCount; i++)
        {
            Log($"=== KQ-7 === luc MO: slot{i} = 「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkCdBox(i))}」-" +
                $"「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkSbBox(i))}」 " +
                $"「{InpP23Dialog.ReadBox(reg, InpP23Dialog.ChkNmBox(i))}」");
        }
        Log("   slot2 RONG ⇒ dspData da xoa trang tham chieu chet (dung nhu ban web)");

        var f9 = KarteAutoCalcDialog.FindChrome(reg, "btnF9", InpP23Dialog.ListGridId);
        if (f9 is null) { Log("=== KQ-7 === khong thay btnF9"); Assert.Pass(); return; }
        KarteAutoCalcDialog.ClickModalOpener(f9);
        Waits.Step();
        foreach (var d in ModalDialogs.All(App, list)) { try { Dialogs.DismissOk(d); } catch { } }
        Waits.Step();

        Log("=== KQ-7 === da bam F9. Chay lai truy van nay va gui ket qua:");
        Log("   SELECT cd_1,sb_1,cd_2,sb_2 FROM chkauto WHERE trt_cd=100 AND trt_sb=0;");
        Log("   cd_2 = 0/NULL ⇒ tham chieu chet BI MAT — ban web lam giong, khong phai bug");

        trace.Step("F9 tren 処置 co tham chieu chet");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helper
    // ═══════════════════════════════════════════════════════════════════════

    private Window OpenChkRegister(TestTrace trace)
    {
        var list = InpP23Dialog.OpenChkList(App, Screen.Window, trace);
        Search(list, "100");
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
        if (el is null) { Log($"   (khong thay o 「{automationId}」)"); return; }
        try { el.Focus(); } catch { /* */ }
        Uia.SetText(el, value);
    }

    private void FocusBox(Window root, string automationId)
    {
        var el = KarteAutoCalcDialog.FindChrome(root, automationId, InpP23Dialog.ListGridId);
        if (el is null) { Log($"   (khong thay o 「{automationId}」)"); return; }
        var (x, y) = Uia.Center(el);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    private string FocusedId()
    {
        try
        {
            var el = App.Automation.FocusedElement();
            return $"id='{Uia.AutomationIdOf(el)}' name='{Uia.NameOf(el)}'";
        }
        catch (Exception e) { return $"(khong doc duoc: {e.Message})"; }
    }

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..max] + "…";
}
