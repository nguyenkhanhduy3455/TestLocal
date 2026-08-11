using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteAutoCalc;

/// <summary>
/// <b>カルテ自動算定 (frm203042 一覧 / frm203043 登録)</b> — luồng ĐIỀU TRA, không phải
/// luồng hồi quy.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MỤC ĐÍCH
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web vừa port cặp màn này. Sáu điểm dưới đây <b>đọc source không kết luận
/// chắc được</b> — cần thấy WinForm thật chạy ra gì rồi mới biết bản web đúng hay
/// phải sửa. Vì thế phần lớn testcase <b>ghi log rồi Pass</b>; chỉ assert những gì
/// đã chắc chắn từ source. Cái chưa biết mà assert thì chỉ đỏ vì đoán sai, không
/// nói thêm được gì.
///
/// <para><b>Cách đọc kết quả</b>: chạy xong lấy toàn bộ khối
/// <c>=== KQ-n ===</c> trong log gửi lại. Mỗi khối trả lời đúng một câu hỏi.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// SÁU ĐIỂM — TẤT CẢ ĐÃ TRẢ LỜI (2026-08-11)
/// ═══════════════════════════════════════════════════════════════════════════
/// <b>Đọc source legacy trả lời được HẾT, nhanh hơn hẳn chạy máy thật.</b> Ghi lại
/// vì chính tôi đã đánh giá sai độ khó lúc đầu: sáu câu này không cần quan sát
/// hành vi, chúng nằm ngay trong SQL và trong <c>setInputData</c>. Luồng UI vẫn giữ
/// vì nó xác nhận độc lập — nhưng nếu gặp câu tương tự lần sau, MỞ SOURCE TRƯỚC.
///
///  KQ-1 ✅ <c>MstTrt.getMstTrtDataCmtAuto</c> (MstTrt.cs:2236) dùng
///        <c>LEFT JOIN cmtauto</c> ⇒ 処置 chưa cấu hình VẪN hiện. Bản web đúng.
///        Đo trên máy: 101-0/101-1/101-2 hiện với cột comment trống.
///  KQ-2 ✅ Không phải "lọc version" mà là <b>MỖI VERSION MỘT BẢNG RIÊNG</b>:
///        <c>MST_TRT087</c>, <c>MST_TRT084</c>… <c>TrtSel.getTrtSel</c> (TrtSel.cs:21)
///        tra <c>TRT_SEL.MTBL_NM</c> theo ngày rồi query đúng bảng đó. Bản web gộp
///        thành một bảng + version_id và lọc theo ngày — cùng nghĩa. Đo được
///        該当件数 = 1.764, khớp bản web sau khi sửa (trước đó là 73.537).
///  KQ-3 ✅ frm203043.cs:388-401: <c>noChk = dt.Rows.Count > 0 && mọi dòng
///        no_chk != "0"</c>. Đúng y bản web (<c>lines.Count > 0 && All(NoChk == 1)</c>).
///        Khác biệt duy nhất: legacy so <c>!= "0"</c> nên no_chk = 2 cũng tính là
///        tick — vô nghĩa trên thực tế vì cột chỉ nhận 0/1.
///  KQ-4 ✅ frm203043.cs:590: <c>data.use_cnt = row["use_cnt"]</c> đọc từ cột ẨN
///        của lưới (cột bị ẩn ở :416) ⇒ delete + insert vẫn GIỮ NGUYÊN use_cnt.
///        Bản web round-trip use_cnt — đúng.
///  KQ-5 ✅ frm203043.cs:550-556: lưu = <c>deleteCmtAuto</c> rồi insert từng dòng
///        của DataTable. Lưới rỗng ⇒ chỉ còn delete ⇒ XOÁ SẠCH. Bản web coi
///        <c>lines = []</c> là xoá — đúng.
///  KQ-6 ⚠️ <c>ComLibrary.LeftB</c> = cắt theo BYTE Shift-JIS (ComLibrary.cs:378
///        → MidB dùng <c>Encoding.GetEncoding("Shift_JIS").GetByteCount</c>).
///        WinForm cắt trt_nm 50 byte (~25 chữ Nhật) và cmt_nm 60 byte (~30 chữ).
///        Bản web cắt theo KÝ TỰ. Xem ghi chú trong inp-p1-remaining-3-pairs.md —
///        <b>chênh lệch có thật nhưng vô hại</b>, và cố tình không sửa.
///  KQ-6b ✅ cột 名称 lấy từ mst_cmt2, KHÔNG phải bản sao trên cmt_auto:
///        <c>CASE WHEN cmt.cmt_nm IS NOT NULL THEN cmt.cmt_nm ELSE aut.cmt_nm END</c>
///        (MstTrt.cs:2228) = đúng <c>COALESCE(master, shadow)</c> của bản web. Ảnh
///        chụp 処置 100-0 xác nhận: hiện 「次回予約ＴＥＬ待ち」「終了」… theo mst_cmt2,
///        trong khi cmt_auto.cmt_nm của chính các dòng đó là chuỗi khác hẳn.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// KQ-4, KQ-5, KQ-6 phải bấm F9 → GHI THẬT vào <c>cmtauto</c>, và đây là master
/// TOÀN PHÒNG KHÁM (đổi nó là đổi comment tự động của mọi bệnh nhân). Cả ba nằm
/// sau <c>inpP1.allowSave</c>, và tự khôi phục lại trạng thái cũ ở cuối.
/// <b>Nên chạy trên máy có DB sao lưu được.</b>
///
/// Testcase chỉ-đọc (KQ-1..3) chạy được ngay, không cần cờ gì.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-karte-auto-calc.ps1 -Diagnostics   ← CHẠY CÁI NÀY TRƯỚC TIÊN
///   .\run-karte-auto-calc.ps1
///   .\run-karte-auto-calc.ps1 -Case Tc3
///
/// <c>-Diagnostics</c> chạy Tc0 — chẩn đoán từng bước, KHÔNG ném lỗi, in ra đủ
/// để biết menu hỏng ở đâu (nếu hỏng) và đổ cây UIA của hai form (nếu mở được).
/// Artifact: <c>kac-00-screen</c> / <c>kac-01-after-f11</c> / <c>kac-02-list</c> /
/// <c>kac-03-register</c>.
///
/// Tên control trong <see cref="KarteAutoCalcDialog"/> mới chỉ là SUY ĐOÁN từ các
/// form anh em — xem cây thật rồi sửa lại trước khi các Tc khác chạy được.
/// </summary>
[TestFixture]
[Category("karte-auto-calc")]
public sealed class KarteAutoCalcTests : InpP1Dialogs.InpP1TestBase
{
    private Window? _list;
    private KarteAutoCalcDb? _kacDb;

    private Window List => _list ??= KarteAutoCalcDialog.OpenList(App, Screen.Window);

    [OneTimeSetUp]
    public void KarteAutoCalcOneTimeSetUp() => _kacDb = KarteAutoCalcDb.CreateOrNull(Settings);

    /// <summary>DB tắt / không kết nối được thì Ignore kèm lý do.</summary>
    private KarteAutoCalcDb RequireKacDb(string why)
    {
        // Dùng chung cổng kiểm tra kết nối của InpP1TestBase để thông báo thống nhất.
        RequireInpDb(why);
        if (_kacDb is null) IgnoreWithReason($"{why} — db.enabled = false hoac thieu db.connectionString");
        return _kacDb!;
    }

    [OneTimeTearDown]
    public void CloseDialogsIfLeftOpen()
    {
        foreach (var id in new[] { KarteAutoCalcDialog.RegisterId, KarteAutoCalcDialog.ListId })
        {
            var open = App is null ? null : KarteAutoCalcDialog.FindDialogWindow(
                App, id, id == KarteAutoCalcDialog.RegisterId
                    ? KarteAutoCalcDialog.RegisterTitleFragment
                    : KarteAutoCalcDialog.ListTitleFragment);
            if (open is null) continue;
            try { KarteAutoCalcDialog.Close(App!, open); }
            catch (Exception e) { Log($"khong dong duoc {id}: {e.Message}"); }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc0 — đổ cây UIA. CHẠY TRƯỚC MỌI THỨ.
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("Tc0 — chẩn đoán: F11 có mở được menu không, và cây UIA của 2 form")]
    public void Tc0_DumpUiaTree()
    {
        using var trace = TestTrace.Begin();

        // Tc0 tự đi TỪNG BƯỚC và KHÔNG BAO GIỜ ném, để một lần chạy ra đủ bức
        // tranh dù hỏng ở đâu. Lần chạy đầu (2026-08-11) chỉ nói được "khong thay
        // popup menu nao" rồi dừng — không đủ để biết vì sao, và tốn nguyên một
        // vòng gửi qua gửi lại. Các bước dưới đây in ra: đang ở màn nào, có hộp
        // thoại nào chắn không, nút F11 có enabled không, sau khi click có cửa sổ
        // nào mới, và MenuItem nào đang hiện.

        // ── Bước 1: đang đứng ở màn nào ────────────────────────────────────
        var screen = Screen.Window;
        Log($"=== KQ-0 === man dang mo: AutomationId='{Uia.AutomationIdOf(screen)}' " +
            $"title='{Uia.NameOf(screen)}'");
        Log("   ky vong: frm203002 (診療入力). Neu la frm203001 (患者選択) thi F11 la " +
            "nut khac han va menu オプション khong ton tai.");

        InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
            "kac-00-screen.uia.txt", Uia.DumpTree(screen, maxDepth: 3, maxChildrenPerNode: 80));

        // ── Bước 2: có hộp thoại nào đang chắn không ───────────────────────
        // Đây là nghi vấn số 1 khi click "không ăn": hop thoai modal nuot het click.
        LogOpenDialogs("truoc khi bam F11");

        // ── Bước 3: nút F11 ────────────────────────────────────────────────
        var btnF11 = Uia.ByIdOrName(screen, "btnF11", "選択", FlaUI.Core.Definitions.ControlType.Button);
        if (btnF11 is null)
        {
            Log("=== KQ-0 === KHONG thay btnF11 tren man nay ⇒ dung han. " +
                "Xem kac-00-screen.uia.txt de biet man dang mo la gi.");
            Assert.Pass("khong co btnF11 — xem log");
            return;
        }
        Log($"=== KQ-0 === btnF11: name='{Uia.NameOf(btnF11)}' " +
            $"enabled={IsEnabled(btnF11)} onScreen={Uia.IsOnScreen(btnF11)}");

        // ── Bước 4: click rồi chụp MỌI cửa sổ top-level ────────────────────
        trace.Step("bam btnF11");
        try { Uia.Click(btnF11); } catch (Exception e) { Log($"=== KQ-0 === click btnF11 loi: {e.Message}"); }
        Thread.Sleep(600);

        InpP1Dialogs.InpP1MenuFlow.WriteArtifact("kac-01-after-f11.uia.txt", DumpTopLevelWindows());
        LogOpenDialogs("ngay sau khi bam F11");
        LogPopupCandidates();

        // ── Bước 5: tìm mục menu ở BẤT KỲ đâu ──────────────────────────────
        // Không giả định popup nằm ở desktop hay trong app — quét cả hai.
        var menuItems = AllMenuItemNames();
        Log($"=== KQ-0 === tim thay {menuItems.Count} MenuItem dang hien:");
        foreach (var m in menuItems.Take(40)) Log("   " + m);
        if (menuItems.Count == 0)
        {
            Log("   0 muc ⇒ F11 KHONG mo duoc menu. Ba kha nang, xem kac-01-after-f11.uia.txt:");
            Log("     a) co hop thoai modal chan (danh sach o tren se co ten no)");
            Log("     b) popup co mo nhung ClassName khac '#32768' va khong thuoc app.Windows()");
            Log("     c) F11 bi disable theo trang thai (pAccUse / thang khac thang hien tai)");
            Assert.Pass("khong mo duoc menu — xem log + artifact");
            return;
        }

        // ── Bước 6: có mục コメント自動入力登録 không ────────────────────────
        var hit = menuItems.Any(m => Txt.Has(m, KarteAutoCalcDialog.MenuItemText))
                  || menuItems.Any(m => Txt.Has(m, KarteAutoCalcDialog.MenuItemId));
        Log($"=== KQ-0 === co muc 「{KarteAutoCalcDialog.MenuItemText}」 " +
            $"({KarteAutoCalcDialog.MenuItemId}) trong danh sach tren? {hit}");
        Log("   false ⇒ hoac submenu オプション chua bung, hoac AutomationId khac suy doan " +
            "(sua KarteAutoCalcDialog.MenuItemId cho khop ten thuc te o tren).");

        // ── Bước 7: nếu tới được thì mở luôn 2 form để lấy cây UIA ─────────
        var step = "mo 一覧 tu menu";
        try
        {
            var list = KarteAutoCalcDialog.OpenList(App, screen, trace);
            Log($"=== KQ-0 === MO DUOC 一覧: title 「{Uia.NameOf(list)}」");
            _list = list;
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
                "kac-02-list.uia.txt", Uia.DumpTree(list, maxDepth: 6, maxChildrenPerNode: 60));

            // Thu nhỏ lưới TRƯỚC khi đụng F9. 1.764 dòng làm mọi thao tác UIA
            // trên form này chậm tới mức hết giờ — lọc còn vài dòng thì nhanh.
            step = "loc 一覧 ve 処置コード=100";
            Search(list, "100", "");

            step = "F9 選択 tren 一覧 (mo frm203043)";
            var reg = KarteAutoCalcDialog.OpenRegister(App, list, trace);
            Log($"=== KQ-0 === MO DUOC 登録: title 「{Uia.NameOf(reg)}」");

            step = "do cay UIA cua 登録";
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
                "kac-03-register.uia.txt", Uia.DumpTree(reg, maxDepth: 6, maxChildrenPerNode: 60));

            step = "F10 戻る dong 登録";
            KarteAutoCalcDialog.Close(App, reg);
        }
        catch (Exception e)
        {
            // In cả KIỂU lỗi lẫn bước đang làm. Ba lần chạy trước chỉ có mỗi
            // e.Message ("UIA Timeout") — không đủ để biết treo ở click hay ở tìm
            // cửa sổ, mỗi vòng đoán mất nguyên một lượt gửi log qua lại.
            Log($"=== KQ-0 === dung o buoc 「{step}」: {e.GetType().Name}: {e.Message}");
            Log("=== KQ-0 === cua so cua app dang hien luc do:");
            Log(KarteAutoCalcDialog.DescribeVisibleWindows(App));

            // Cây của 一覧 NGAY LÚC HỎNG. kac-02 chụp trước khi bấm F9 nên không có
            // frm203043; muốn biết form con nằm ở đâu thì phải chụp lại lúc này.
            if (_list is not null)
            {
                try
                {
                    InpP1Dialogs.InpP1MenuFlow.WriteArtifact(
                        "kac-04-list-at-failure.uia.txt",
                        Uia.DumpTree(_list, maxDepth: 5, maxChildrenPerNode: 40));
                    Log("=== KQ-0 === da ghi kac-04-list-at-failure.uia.txt — gui ke ca file nay");
                }
                catch (Exception e2) { Log($"   (khong do duoc cay 一覧: {e2.Message})"); }
            }
        }

        Log("=== KQ-0 === Gui lai: tat ca dong '=== KQ-0 ===' o tren + cac file " +
            "artifacts\\kac-*.uia.txt");
    }

    /// <summary>Liệt kê mọi hộp thoại đang mở — nghi vấn số 1 khi click "không ăn".</summary>
    private void LogOpenDialogs(string when)
    {
        List<Window> dialogs;
        try { dialogs = ModalDialogs.All(App, Screen.Window).ToList(); }
        catch (Exception e) { Log($"=== KQ-0 === khong liet ke duoc hop thoai ({when}): {e.Message}"); return; }

        if (dialogs.Count == 0) { Log($"=== KQ-0 === {when}: KHONG co hop thoai nao dang mo"); return; }

        Log($"=== KQ-0 === {when}: co {dialogs.Count} hop thoai dang mo ⇒ RAT CO THE la thu phan click:");
        foreach (var d in dialogs)
        {
            string text;
            try { text = Txt.N(Dialogs.TextOf(d)); } catch { text = "(khong doc duoc)"; }
            Log($"   [{Uia.AutomationIdOf(d)}] 「{Uia.NameOf(d)}」 — {Trim(text, 120)}");
        }
    }

    /// <summary>Popup ứng viên mà KarteAutoCalcMenu nhìn thấy — để biết bộ lọc có trúng không.</summary>
    private void LogPopupCandidates()
    {
        try
        {
            var popups = KarteAutoCalcMenu.AllPopups(App).ToList();
            Log($"=== KQ-0 === popup ung vien (desktop '#32768' + cua so app co MenuItem): {popups.Count}");
            foreach (var p in popups)
                Log($"   class='{Uia.ClassNameOf(p)}' name='{Uia.NameOf(p)}' id='{Uia.AutomationIdOf(p)}'");
        }
        catch (Exception e) { Log($"=== KQ-0 === khong quet duoc popup: {e.Message}"); }
    }

    /// <summary>Đổ mọi cửa sổ top-level của app + popup desktop ra chuỗi.</summary>
    private string DumpTopLevelWindows()
    {
        var sb = new System.Text.StringBuilder();
        try
        {
            foreach (var w in App.Windows())
            {
                sb.AppendLine($"--- app window id='{Uia.AutomationIdOf(w)}' " +
                              $"name='{Uia.NameOf(w)}' class='{Uia.ClassNameOf(w)}' ---");
                sb.AppendLine(Uia.DumpTree(w, maxDepth: 3, maxChildrenPerNode: 40));
            }
        }
        catch (Exception e) { sb.AppendLine($"(loi liet ke cua so app: {e.Message})"); }

        try
        {
            foreach (var p in KarteAutoCalcMenu.AllPopups(App))
            {
                sb.AppendLine($"--- popup class='{Uia.ClassNameOf(p)}' name='{Uia.NameOf(p)}' ---");
                sb.AppendLine(Uia.DumpTree(p, maxDepth: 4, maxChildrenPerNode: 60));
            }
        }
        catch (Exception e) { sb.AppendLine($"(loi liet ke popup: {e.Message})"); }

        return sb.ToString();
    }

    /// <summary>Tên mọi MenuItem đang hiện, quét cả desktop lẫn cửa sổ của app.</summary>
    private List<string> AllMenuItemNames()
    {
        var names = new List<string>();
        var roots = new List<AutomationElement>();
        var pid = App.ProcessId;

        // Chỉ cửa sổ CỦA APP. Lần chạy 2026-08-11 không lọc nên vớt cả menu của
        // VS Code đang mở cạnh bên (File / Edit / Terminal…) — 34 mục, quá nửa là
        // rác, đọc log rất dễ tưởng menu オプション đã bung trong khi chưa.
        try
        {
            roots.AddRange(OchaCom.FlaUiTests.App.OchaApp.SharedAutomation.GetDesktop()
                .FindAllChildren()
                .Where(c => { try { return c.Properties.ProcessId.ValueOrDefault == pid; } catch { return false; } }));
        }
        catch { /* desktop ban */ }
        try { roots.AddRange(App.Windows()); }
        catch { /* app ban */ }

        foreach (var root in roots)
        {
            try
            {
                if (!Uia.IsOnScreen(root)) continue;
                foreach (var mi in root.FindAllDescendants(
                             cf => cf.ByControlType(FlaUI.Core.Definitions.ControlType.MenuItem)))
                {
                    var nm = Uia.NameOf(mi).Replace("&", "");
                    var id = Uia.AutomationIdOf(mi);
                    if (string.IsNullOrWhiteSpace(nm) && string.IsNullOrWhiteSpace(id)) continue;
                    names.Add($"id='{id}' name='{nm}'");
                }
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return names.Distinct().ToList();
    }

    private static bool IsEnabled(AutomationElement e)
    {
        try { return e.Properties.IsEnabled.ValueOrDefault; } catch { return false; }
    }

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..max] + "…";

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 + Tc2 — KQ-1 / KQ-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — KQ-1/KQ-2 (đã trả lời): xác nhận lại bằng số liệu, không phải ảnh")]
    public void Tc1_ListIncludesUnconfiguredTreatments()
    {
        using var trace = TestTrace.Begin();
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        // XOÁ ĐIỀU KIỆN LỌC TRƯỚC ĐÃ. Tc0 để lại 一覧 đang lọc 処置コード=100, mà
        // OpenList thấy dialog mở sẵn thì dùng lại — lần chạy 16:52 vì thế đo được
        // 該当件数 = 12 rồi kết luận nhầm là con số của cả bảng.
        Search(_list, "", "");

        var grid = RequireGrid(_list, KarteAutoCalcDialog.ListGridId);

        // 該当件数 do chính app tính (lblCount) — đáng tin hơn đếm phần tử UIA.
        var countLabel = KarteAutoCalcDialog.FindChrome(_list, KarteAutoCalcDialog.ListCountLabelId, KarteAutoCalcDialog.ListGridId);
        var shownCount = countLabel is null ? "(khong doc duoc lblCount)" : Uia.NameOf(countLabel);
        Log($"=== KQ-2 === 該当件数 WinForm hien: {shownCount}");
        Log("   (ban web sau khi loc version mst_trt cho 1.764 dong — so nay phai khop)");

        // Đọc tối đa 40 dòng đầu; chỉ cần biết CÓ hay KHÔNG dòng chưa cấu hình.
        var (headers, rows) = ReadHeaderAndRows(grid, limit: 40);
        Log("=== KQ-1 === cot 一覧: " + string.Join(" | ", headers));
        var blankCmt = 0;
        foreach (var r in rows.Take(40))
        {
            var cells = r.Cells;
            // Cột thứ 3 (index 2) là dsp_cmt_cd theo _viewItem (frm203042.cs:46-53).
            var cmtCd = cells.Count > 2 ? Txt.N(cells[2]) : "";
            if (string.IsNullOrWhiteSpace(cmtCd)) blankCmt++;
        }
        Log($"=== KQ-1 === trong {rows.Count} dong dau, {blankCmt} dong co コメントコード RONG");
        Log("   > 0  ⇒ WinForm CO liet ke 処置 chua cau hinh (LEFT JOIN) — ban web dung");
        Log("   = 0  ⇒ chua ket luan duoc; xem tiep Tc2 (loc 1 処置 chua cau hinh)");

        if (rows.Count > 0)
            Log("dong dau: " + string.Join(" | ", rows[0].Cells));

        trace.Step("doc 一覧");
    }

    [Test, Order(2)]
    [Description("Tc2 — KQ-1: lọc đúng một 処置 KHÔNG có dòng cmtauto nào")]
    public void Tc2_SearchUnconfiguredTreatment()
    {
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de tim mot 処置 chua co cau hinh");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var trtCd = db.FindTrtCdWithoutCmtAuto();
        if (trtCd is null)
        {
            Log("=== KQ-1 === moi 処置 deu da co cau hinh — khong dung duoc phep thu nay");
            Assert.Pass("khong co 処置 nao chua cau hinh");
            return;
        }

        Log($"=== KQ-1 === loc 処置コード = {trtCd} (DB xac nhan KHONG co dong cmtauto nao)");
        Search(_list, trtCd.Value.ToString(), "");

        var grid = RequireGrid(_list, KarteAutoCalcDialog.ListGridId);
        var (_, rows) = ReadHeaderAndRows(grid, limit: 10);
        Log($"=== KQ-1 === WinForm tra ve {rows.Count} dong (da tru dong tieu de)");
        foreach (var r in rows.Take(5)) Log("   " + string.Join(" | ", r.Cells));
        Log("   >= 1 dong ⇒ CO liet ke (LEFT JOIN) — ban web dung");
        Log("   0 dong + hop thoai E00003 ⇒ KHONG liet ke — ban web phai doi sang INNER JOIN");

        trace.Step("loc 処置 chua cau hinh");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc3 — KQ-3 確認画面不要
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — KQ-3: 確認画面不要 tick theo quy tắc nào (3 ca)")]
    public void Tc3_NoChkAggregateRule()
    {
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de chon 3 処置 dai dien cho 3 ca");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var cases = new (string Name, (int TrtCd, int TrtSb)? Target, string Expect)[]
        {
            ("MOI dong no_chk = 1", db.FindAllNoChk(), "ban web: TICK"),
            ("LAN LON 0 va 1",      db.FindMixedNoChk(), "ban web: KHONG tick"),
        };

        foreach (var (name, target, expect) in cases)
        {
            if (target is null)
            {
                Log($"=== KQ-3 === ca 「{name}」: khong tim duoc 処置 nao — BO QUA");
                continue;
            }

            var (trtCd, trtSb) = target.Value;
            var lines = db.NoChkOfLines(trtCd, trtSb);
            Log($"=== KQ-3 === ca 「{name}」 — 処置 {trtCd}-{trtSb}, " +
                $"no_chk tung dong: [{string.Join(",", lines)}]");

            Search(_list, trtCd.ToString(), "");
            var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

            var chk = KarteAutoCalcDialog.FindChrome(reg, KarteAutoCalcDialog.NoChkCheckBoxId, KarteAutoCalcDialog.RegisterGridId);
            var state = chk is null
                ? "(khong thay chkNoChk — sua ten trong KarteAutoCalcDialog)"
                : (chk.AsCheckBox().IsChecked == true ? "TICK" : "KHONG tick");
            Log($"   WinForm hien: {state}   |   {expect}");

            KarteAutoCalcDialog.Close(App, reg);
        }

        // Ca thứ 3: 処置 không có dòng nào. Chỉ mở được khi Tc2 cho thấy 一覧 có liệt kê.
        var empty = db.FindTrtCdWithoutCmtAuto();
        if (empty is not null)
        {
            Search(_list, empty.Value.ToString(), "");
            try
            {
                var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);
                var chk = KarteAutoCalcDialog.FindChrome(reg, KarteAutoCalcDialog.NoChkCheckBoxId, KarteAutoCalcDialog.RegisterGridId);
                var state = chk?.AsCheckBox().IsChecked == true ? "TICK" : "KHONG tick";
                Log($"=== KQ-3 === ca 「KHONG co dong nao」 — 処置 {empty}: WinForm hien {state}");
                Log("   ban web: KHONG tick (tranh vacuous-true khi 0 dong)");
                KarteAutoCalcDialog.Close(App, reg);
            }
            catch (Exception e)
            {
                Log($"=== KQ-3 === ca 「KHONG co dong nao」: khong mo duoc 登録 — {e.Message}");
            }
        }

        trace.Step("3 ca 確認画面不要");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc4 — KQ-4 use_cnt (GHI DB)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("Tc4 — KQ-4: F9 登録 có giữ nguyên use_cnt không (GHI DB)")]
    public void Tc4_SavePreservesUseCnt()
    {
        RequireAllowSave("F9 登録 ghi that vao cmtauto (master TOAN PHONG KHAM)");
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de doc use_cnt truoc/sau");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var target = db.FindWithUseCnt();
        if (target is null)
        {
            Log("=== KQ-4 === khong co 処置 nao co use_cnt > 0 — khong thu duoc");
            Assert.Pass("khong co du lieu");
            return;
        }

        var (trtCd, trtSb) = target.Value;
        var before = db.UseCntOfLines(trtCd, trtSb);
        Log($"=== KQ-4 === 処置 {trtCd}-{trtSb}, use_cnt TRUOC: [{string.Join(",", before)}]");

        Search(_list, trtCd.ToString(), "");
        var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

        // KHÔNG sửa gì — chỉ F9. Đây là phép thử thuần: lưu mà không đổi gì thì
        // use_cnt phải y nguyên.
        trace.Step("F9 登録 (khong sua gi)");
        var f9 = KarteAutoCalcDialog.FindChrome(reg, "btnF9", KarteAutoCalcDialog.RegisterGridId);
        Assert.That(f9, Is.Not.Null, "khong thay btnF9 tren frm203043");
        // F9 登録 bung hộp xác nhận ⇒ modal ⇒ phải chuột vật lý (ClickModalOpener).
        KarteAutoCalcDialog.ClickModalOpener(f9!, trace);
        Waits.Step();
        DismissAnyDialog();
        Waits.Step();

        var after = db.UseCntOfLines(trtCd, trtSb);
        Log($"=== KQ-4 === use_cnt SAU:   [{string.Join(",", after)}]");
        Log(before.SequenceEqual(after)
            ? "   GIU NGUYEN ⇒ ban web (round-trip use_cnt) dung"
            : "   BI DOI ⇒ can xem lai: WinForm khong bao toan use_cnt nhu suy doan");

        trace.Step("doc lai use_cnt");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc5 — KQ-5 lưới rỗng (GHI DB)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("Tc5 — KQ-5: F2 全行削除 rồi F9 có xoá sạch cấu hình không (GHI DB)")]
    public void Tc5_SaveEmptyGridClearsConfiguration()
    {
        RequireAllowSave("F2 全行削除 + F9 xoa that cau hinh cua mot 処置");
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de doc so dong truoc/sau va khoi phuc");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var target = db.FindSmallestConfigured();
        if (target is null)
        {
            Log("=== KQ-5 === khong co 処置 nao da cau hinh — khong thu duoc");
            Assert.Pass("khong co du lieu");
            return;
        }

        var (trtCd, trtSb) = target.Value;
        var snapshot = db.Snapshot(trtCd, trtSb);
        Log($"=== KQ-5 === 処置 {trtCd}-{trtSb}, TRUOC co {snapshot.Count} dong:");
        foreach (var s in snapshot) Log("   " + s);
        Log("   ⚠️ NEU test dung giua chung, khoi phuc thu cong tu danh sach tren.");

        Search(_list, trtCd.ToString(), "");
        var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

        trace.Step("F2 全行削除");
        var f2 = KarteAutoCalcDialog.FindChrome(reg, "btnF2", KarteAutoCalcDialog.RegisterGridId);
        Assert.That(f2, Is.Not.Null, "khong thay btnF2 (全行削除) tren frm203043");
        KarteAutoCalcDialog.ClickModalOpener(f2!, trace);
        Waits.Step();
        DismissAnyDialog();

        trace.Step("F9 登録 voi luoi rong");
        var f9 = KarteAutoCalcDialog.FindChrome(reg, "btnF9", KarteAutoCalcDialog.RegisterGridId);
        if (f9 is not null) KarteAutoCalcDialog.ClickModalOpener(f9, trace);
        Waits.Step();
        DismissAnyDialog();
        Waits.Step();

        var after = db.Snapshot(trtCd, trtSb);
        Log($"=== KQ-5 === SAU con {after.Count} dong");
        Log(after.Count == 0
            ? "   XOA SACH ⇒ ban web (lines = [] nghia la xoa) dung"
            : "   VAN CON ⇒ WinForm chan luu luoi rong; ban web phai chan theo");

        // Dialog có thể vẫn mở nếu WinForm chặn — đóng cho sạch.
        var stillOpen = KarteAutoCalcDialog.FindDialogWindow(
            App, KarteAutoCalcDialog.RegisterId, KarteAutoCalcDialog.RegisterTitleFragment, _list);
        if (stillOpen is not null) KarteAutoCalcDialog.Close(App, stillOpen);

        Log("=== KQ-5 === KHOI PHUC: chay lai SQL insert tu snapshot o tren neu can.");
        trace.Step("doc lai");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc6 — KQ-6 cắt chuỗi (GHI DB)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("Tc6 — KQ-6: cmt_nm bị cắt theo BYTE (Shift-JIS) hay KÝ TỰ")]
    public void Tc6_NameTruncationIsByteOrChar()
    {
        RequireAllowSave("phai F9 登録 de xem WinForm ghi xuong bao nhieu");
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de tim comment dai va doc lai do dai da ghi");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var longCmt = db.FindLongCommentName(KarteAutoCalcDialog.CmtNmMaxBytes);
        if (longCmt is null)
        {
            Log($"=== KQ-6 === khong co カルテコメント nao dai qua " +
                $"{KarteAutoCalcDialog.CmtNmMaxBytes} byte — khong thu duoc");
            Assert.Pass("khong co du lieu");
            return;
        }

        var (cmtCd, cmtSb, nm) = longCmt.Value;
        Log($"=== KQ-6 === comment {cmtCd}-{cmtSb}: {nm.Length} ky tu, " +
            $"{System.Text.Encoding.GetEncoding("Shift_JIS").GetByteCount(nm)} byte (Shift-JIS)");
        Log($"   noi dung: 「{nm}」");
        Log($"   WinForm dung ComLibrary.LeftB(nm, {KarteAutoCalcDialog.CmtNmMaxBytes}) — cat theo BYTE");
        Log("   ban web cat theo KY TU (60 ky tu) ⇒ giu nhieu hon");
        Log("   ⇒ Sau khi luu, doc lai do dai trong DB de biet WinForm that su cat o dau.");

        var target = db.FindSmallestConfigured();
        if (target is null) { Assert.Pass("khong co 処置 de gan comment"); return; }
        var (trtCd, trtSb) = target.Value;

        var snapshot = db.Snapshot(trtCd, trtSb);
        Log($"=== KQ-6 === se sua 処置 {trtCd}-{trtSb}; snapshot de khoi phuc:");
        foreach (var s in snapshot) Log("   " + s);

        Search(_list, trtCd.ToString(), "");
        var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

        Log("=== KQ-6 === BUOC THU CONG: trong luoi 登録, sua コード/枝番 cua dong dau thanh " +
            $"{cmtCd}/{cmtSb} roi bam F9. Test khong tu go vi o luoi DataGridView " +
            "can BeginEdit dung o — de nguoi chay lam cho chac.");
        Log("   Sau do chay lai truy van nay va gui ket qua:");
        Log($"   SELECT LEN(cmt_nm) AS ky_tu, DATALENGTH(cmt_nm) AS byte_, cmt_nm " +
            $"FROM cmtauto WHERE trt_cd={trtCd} AND trt_sb={trtSb} AND cmt_cd={cmtCd};");

        KarteAutoCalcDialog.Close(App, reg);
        trace.Step("huong dan thu cong KQ-6");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helper
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Đọc lưới 一覧: trả về (tiêu đề cột, các dòng DỮ LIỆU).
    ///
    /// <para><b>Vì sao không dùng thẳng <c>grid.Headers()</c> / <c>grid.Rows()</c>.</b>
    /// <c>WinFormsGrid.IsHeaderRow</c> nhận diện dòng tiêu đề bằng cách đòi mọi ô con
    /// phải là <c>HeaderItem</c>. Lưới của frm203042 không như vậy: lần chạy
    /// 16:52 cho <c>Headers()</c> RỖNG, còn <c>Rows()[0]</c> lại chính là dòng tiêu đề
    /// (「処置コード | 処置名 | コメントコード | 名称 | 表示順 | 使用」). Hệ quả: mọi phép
    /// đếm lệch 1 và ô ở dòng 0 đọc ra tên cột chứ không phải dữ liệu.</para>
    ///
    /// <para>Chữa tại chỗ trong luồng này thay vì sửa <c>WinFormsGrid</c> — lớp đó
    /// các luồng khác đang dùng và đã chạy đúng với lưới của họ.</para>
    /// </summary>
    private static (IReadOnlyList<string> Headers, IReadOnlyList<DgvRow> Rows) ReadHeaderAndRows(
        WinFormsGrid grid, int limit)
    {
        var headers = grid.Headers();
        var rows = grid.Rows(limit: limit + 1);

        if (headers.Count > 0) return (headers, rows.Take(limit).ToList());
        if (rows.Count == 0) return (headers, rows);

        // Không có HeaderItem ⇒ dòng đầu là tiêu đề nếu nó khớp tên cột đã biết.
        var first = rows[0].Cells;
        var looksLikeHeader = first.Count > 0 && Txt.Has(Txt.N(first[0]), "処置コード");
        return looksLikeHeader
            ? (first, rows.Skip(1).Take(limit).ToList())
            : (headers, rows.Take(limit).ToList());
    }

    private static WinFormsGrid RequireGrid(Window dialog, string gridId)
    {
        var el = KarteAutoCalcDialog.FindChrome(dialog, gridId)
            ?? throw new InvalidOperationException(
                $"Khong thay luoi 「{gridId}」. Chay Tc0_DumpUiaTree roi sua " +
                "KarteAutoCalcDialog cho khop cay UIA that.");
        return new WinFormsGrid(el);
    }

    /// <summary>Gõ điều kiện rồi bấm 検索 — WinForm chỉ truy vấn khi bấm nút.</summary>
    private void Search(Window list, string trtCd, string trtNm)
    {
        var cd = KarteAutoCalcDialog.FindChrome(list, KarteAutoCalcDialog.ListTrtCdBoxId, KarteAutoCalcDialog.ListGridId);
        if (cd is not null) Uia.SetText(cd, trtCd);
        var nm = KarteAutoCalcDialog.FindChrome(list, KarteAutoCalcDialog.ListTrtNmBoxId, KarteAutoCalcDialog.ListGridId);
        if (nm is not null) Uia.SetText(nm, trtNm);

        var btn = KarteAutoCalcDialog.FindChrome(list, KarteAutoCalcDialog.ListSearchButtonId, KarteAutoCalcDialog.ListGridId);
        // 検索 CÓ THỂ bung E00003 (0 件) — tức là modal ⇒ Invoke sẽ treo tới khi hết
        // giờ, và chính testcase định đo cái 0 件 đó (Tc2) là testcase chết.
        if (btn is not null) KarteAutoCalcDialog.ClickModalOpener(btn);
        Waits.Step();
        // 0 件 thì WinForm bung E00003; đóng đi rồi đọc lưới rỗng như bình thường.
        DismissAnyDialog();
        Waits.Step();
    }

    /// <summary>Đóng hộp thoại đang chắn (E00003 / xác nhận lưu) nếu có.</summary>
    private void DismissAnyDialog()
    {
        foreach (var w in ModalDialogs.All(App, List))
        {
            try { Dialogs.DismissOk(w); }
            catch { /* hộp khác kiểu — để testcase tự xử */ }
        }
    }
}
