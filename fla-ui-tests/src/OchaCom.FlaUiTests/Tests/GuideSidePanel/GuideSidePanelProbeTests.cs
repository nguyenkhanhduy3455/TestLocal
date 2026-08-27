using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// <b>PROBE</b> cho tab 「ガイド」 của frm203002 — dò hành vi, KHÔNG assert.
///
/// <para>Đây là bước 2 của <c>fla-ui-tests/PROBE-GUIDELINE.md</c>: chưa biết app thật
/// hành xử ra sao thì <b>chụp màn hình → đọc ảnh → rồi mới viết assert</b>. Fixture này
/// KHÔNG BAO GIỜ ném: mỗi bước bắt hết ngoại lệ, ghi lại rồi đi tiếp, để MỘT lượt chạy
/// ra đủ bức tranh.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MƯỜI TÁM CÂU HỎI — đối chiếu với spec Playwright
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>../web-tenant-tests/tests/guide-sidepanel-handler.spec.ts</c>
///
/// <b>Tc0 — mở tab + cấu trúc</b>
///  P1  F4 có nhảy sang tab ガイド không, và ĐƯỜNG NÀO ăn (phím / click tab)?
///  P2  Header lưới đọc ra 「№」「名称」 hay 「No.」「名称」? Mấy cột?
///  P3  Vừa vào tab: ô 選択№ = 「1」 chưa, và con trỏ có nằm ở txtGuid1Sel không?
///  P4  Cột 「№」 là 1..N hay là guid_cd?
///  P5  Ở chế độ 通常 (F4), hai nút 前回/リセット CÓ ẩn thật không?
///  P6  Click MỘT LẦN vào một dòng có mở frm203017 không? Dialog gồm những gì?
///
/// <b>Tc1 — ô 選択№</b>
///  P7  F10 đóng dialog → con trỏ quay về txtGuid1Sel?
///  P8  ↑/↓ có dời dòng sáng và kéo theo ô №? Clamp ở hai đầu?
///  P9  Ô № có lọc ký tự không — gõ 「1a2」 còn lại gì?
///  P10 Enter với № hợp lệ → nhảy đúng dòng đó và mở dialog CỦA DÒNG ĐÓ?
///  P11 Enter với № NGOÀI phạm vi (999) → vẫn mở dialog của dòng đang sáng? (parity 3)
///  P12 Enter với ô № RỖNG → không mở gì? (parity 4)
///
/// <b>Tc2 — ba chế độ nạp list</b>
///  P13 「Shift+F4」 đi được đường nào: giữ Shift + F4, hay lật lớp phím + btnF4_S?
///  P14 Chế độ STEP: 前回/リセット có HIỆN ra không? list rỗng có bung E00024 không?
///  P15 「全て表示」 → list có phải SUPERSET của list F4 không?
///  P16 「前回」 rỗng → E00024 rồi lưới GIỮ NGUYÊN list cũ? (parity 1)
///  P17 「リセット」 hỏi nguyên văn câu gì? (KHÔNG bấm はい — nhánh đó GHI DB)
///  P18 ガイド không có 処置 tính được → dialog tự đóng kèm câu gì? (parity 5)
///
/// <para>Mỗi câu in ra các dòng <c>=== KQ-n ===</c>; runner tự lọc ra
/// <c>select-guide-treatment-KQ.txt</c>. Ảnh từng bước ở
/// <c>artifacts\screenshots\&lt;tên testcase&gt;\</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// AN TOÀN — ba việc TUYỆT ĐỐI KHÔNG LÀM
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item>KHÔNG Escape khi frm203017 đang mở — Escape = <c>btnF9_Click</c> = 確定
///     (frm203017.cs:180). Luôn đóng bằng F10.</item>
///   <item>KHÔNG bấm F9 登録 của frm203002.</item>
///   <item>「リセット」 chỉ bấm để ĐỌC câu Q00100 rồi trả lời キャンセル/いいえ —
///     「はい」 chạy <c>StepReset</c>, UPDATE thật vào <c>TRTSTATE</c>.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-select-guide-treatment.ps1 -Diagnostics
/// </summary>
[TestFixture]
[Category("guide-sidepanel")]
[Explicit]
public sealed class GuideSidePanelProbeTests : UiTestBase
{
    private GuideTabFlow _guide = null!;
    private TestTrace _trace = null!;

    /// <summary>
    /// Khởi động fixture + <b>dời side panel khỏi tab 個別</b> trước khi đụng UIA.
    ///
    /// <para>App giữ nguyên tab đang chọn giữa hai lượt chạy. Nếu lượt trước để lại tab
    /// 個別 (lưới master ~1.7k dòng) thì phép tìm control ĐẦU TIÊN của lượt này cũng
    /// timeout — đã vấp thật 2026-08-27. Dời bằng PHÍM F4: <c>SendInput</c> không đụng
    /// cây UIA nên không bị lưới lớn làm chậm, khác hẳn mọi đường đi qua
    /// <c>FindFirstDescendant</c>.</para>
    /// </summary>
    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _guide = new GuideTabFlow(App, Screen);
        try
        {
            _guide.FocusScreen();
            var sent = GuideTabFlow.SendKey(GuideTabFlow.Vk.F4);
            Thread.Sleep(1200);
            Log($"khởi động: gửi F4 để dời side panel khỏi tab 個別 " +
                $"({(sent ? "phím đã gửi" : "⚠ SendInput KHÔNG gửi được")})");
        }
        catch (Exception e) { Log("khởi động: không dời được tab — " + e.Message); }
    }

    /// <summary>
    /// Trả màn hình về trạng thái dùng được cho testcase sau: đóng frm203017 (BẰNG F10,
    /// không bao giờ Escape) và dẹp mọi hộp thoại.
    ///
    /// <para>Cả fixture dùng CHUNG một phiên app. Đã vấp thật 2026-08-27: Tc0 kết thúc mà
    /// để frm203017 mở, Tc1 vào đo với một dialog modal đang chắn nên mọi phép đọc đầu
    /// testcase đều sai — và câu 「F4 mở được tab」 hoá ra chỉ đúng vì tab đã mở sẵn.</para>
    /// </summary>
    [TearDown]
    public void ProbeTearDown()
    {
        try
        {
            if (_guide.DialogOpen()) _guide.CloseDialogWithF10();
            ClearDialogs("dọn");
            _guide.ResetShiftLayer();
        }
        catch (Exception e) { Log("dọn cuối testcase KHÔNG xong: " + e.Message); }
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); }
        catch { /* không có console */ }
    }

    private static void LogKq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>Một dòng tóm tắt trạng thái tab ガイド.</summary>
    private string State()
    {
        try
        {
            var rows = _guide.RawRowCount();
            var dialogs = MsgBoxWin32.All(App.ProcessId).Select(d => d.ToString()).ToList();
            return $"dòng(thô)={rows} №=「{_guide.SelNo()}」 focus={_guide.FocusedId()} " +
                   $"全て表示={Shown(_guide.AllButton)} 前回={Shown(_guide.PrvButton)} " +
                   $"リセット={Shown(_guide.ResetButton)} dialog={_guide.DialogOpen()} " +
                   $"hộp thoại={(dialogs.Count == 0 ? "(không)" : string.Join(" + ", dialogs))}";
        }
        catch (Exception e) { return $"(không đọc được trạng thái: {e.Message})"; }
    }

    private string Shown(AutomationElement? b) => _guide.IsButtonShown(b) ? "hiện" : "ẨN";

    /// <summary>
    /// Nguyên văn mọi MessageBox đang mở — đọc bằng <b>Win32 thuần</b>, không qua UIA.
    ///
    /// <para><c>ModalDialogs.All</c> rơi xuống đường quét toàn desktop mỗi khi KHÔNG có
    /// hộp thoại nào (hai đường đầu trả rỗng), và với một cửa sổ đang bị modal chặn thì
    /// mỗi lần quét tốn hàng phút. Đo được 2026-08-27 — xem <see cref="MsgBoxWin32"/>.</para>
    /// </summary>
    private string DialogTexts() => MsgBoxWin32.TextOfAll(App.ProcessId);

    /// <summary>
    /// Dẹp hộp thoại đang mở. Câu 「リセットします」 luôn trả lời キャンセル/Cancel —
    /// nhánh OK GHI DB.
    /// </summary>
    private void ClearDialogs(string tag)
    {
        for (var i = 0; i < 5; i++)
        {
            var open = MsgBoxWin32.All(App.ProcessId);
            if (open.Count == 0) return;

            foreach (var d in open)
            {
                var clicked = MsgBoxWin32.ClickButton(d.Hwnd, "キャンセル", "Cancel", "いいえ", "No", "OK");
                LogKq(tag, $"   dẹp hộp thoại {d} → " +
                           (clicked ? "đã bấm" : "KHÔNG có nút khớp; nút thấy được: " +
                                                 string.Join(" / ", MsgBoxWin32.ButtonCaptions(d.Hwnd))));
            }
            Thread.Sleep(500);
        }
    }

    /// <summary>Đóng frm203017 nếu còn mở — luôn bằng F10, không bao giờ Escape.</summary>
    private void CloseDialogIfOpen(string tag)
    {
        if (!_guide.DialogOpen()) return;
        var closed = _guide.CloseDialogWithF10();
        LogKq(tag, $"   đóng frm203017 bằng F10 → {(closed ? "đã đóng" : "VẪN MỞ")}");
        ClearDialogs(tag);
    }

    /// <summary>Chạy một bước, KHÔNG BAO GIỜ ném — ghi lại rồi đi tiếp.</summary>
    private void Probe(string tag, string what, Action action)
    {
        LogKq(tag, $"── {what}");
        LogKq(tag, "   trước: " + State());
        try { action(); }
        catch (Exception e) { LogKq(tag, $"   NÉM: {e.GetType().Name}: {e.Message}"); }
        LogKq(tag, "   sau  : " + State());
        try { _trace.Shot($"{tag}-{what}"); } catch { /* ảnh hỏng không được làm hỏng probe */ }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc0 — mở tab ガイド + cấu trúc lưới + dialog
    // ═══════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe P1-P6 — F4 mở tab ガイド, header lưới, dòng sáng đầu, dialog frm203017")]
    public void Tc0_ProbeOpenGuideTab()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        trace.Step("trang thai truoc khi lam gi");
        LogKq("P0", "trạng thái mở màn: " + State());

        // ── P1: F4 có mở tab ガイド không, và ĐƯỜNG NÀO ăn ──────────────────
        LogKq("P1", "CÂU HỎI: F4 có nhảy sang tab ガイド và nạp list không? Đường nào ăn?");
        LogKq("P1", "   nút F4 trên thanh phím: " +
                    (_guide.F4Button is null ? "KHÔNG thấy btnF4" : $"「{Uia.NameOf(_guide.F4Button!)}」"));

        OpenGuideTab("P1");

        // ── P2: header lưới ────────────────────────────────────────────────
        LogKq("P2", "CÂU HỎI: header lưới ガイド đọc ra gì? (Designer nói 「№」/「名称」)");
        try
        {
            var grid = _guide.GridElement;
            if (grid is null) LogKq("P2", "không có lưới ⇒ bỏ qua");
            else
            {
                var headers = new WinFormsGrid(grid).Headers();
                LogKq("P2", headers.Count == 0
                    ? "Headers() trả RỖNG (cầu MSAA không dựng HeaderItem — PROBE-GUIDELINE 3.2). " +
                      "Mô tả ô dòng đầu: " + FirstRowDescriptions()
                    : $"header = [{string.Join(" | ", headers)}] ({headers.Count} cột)");
            }
        }
        catch (Exception e) { LogKq("P2", "NÉM: " + e.Message); }

        // ── P3: dòng sáng đầu + ô 選択№ + focus ─────────────────────────────
        LogKq("P3", "CÂU HỎI: vừa vào tab thì ô 選択№ = ? và con trỏ ở đâu?");
        LogKq("P3", $"№ = 「{_guide.SelNo()}」 (WinForm: hfgGuid1_RowEnter đặt rowIndex+1, " +
                    $"frm203002.cs:2238) · focus = {_guide.FocusedId()} " +
                    "(KeyFunc gọi txtGuid1Sel.Focus(), frm203002.cs:4706)");

        // ── P4: cột 「№」 là số thứ tự hay guid_cd ──────────────────────────
        LogKq("P4", "CÂU HỎI: cột 「№」 là 1..N hay guid_cd?");
        var nos = _guide.VisibleNos(20);
        var names = _guide.VisibleNames(20);
        LogKq("P4", $"№ 10 dòng đầu = [{string.Join(", ", nos.Take(10))}]");
        for (var i = 0; i < Math.Min(6, names.Count); i++)
            LogKq("P4", $"   dòng {i}: №=「{nos.ElementAtOrDefault(i)}」 名称=「{names[i]}」");

        // ── P5: 前回/リセット ở chế độ 通常 ────────────────────────────────
        LogKq("P5", "CÂU HỎI: chế độ F4 通常 có ẩn 前回/リセット không? " +
                    "(getGuidNyuryokuInfo2 bolStepPass=true ⇒ Visible=false, frm203002.cs:1994)");
        LogKq("P5", $"全て表示={Shown(_guide.AllButton)} · 前回={Shown(_guide.PrvButton)} · " +
                    $"リセット={Shown(_guide.ResetButton)}");

        // ── P6: click 1 dòng → frm203017 ───────────────────────────────────
        LogKq("P6", "CÂU HỎI: CLICK ĐƠN lên một dòng có mở frm203017 không? Dialog gồm gì?");
        Probe("P6", "click dong 0", () => _guide.ClickRow(0));

        var dialog = _guide.WaitDialog();
        if (dialog is null)
        {
            LogKq("P6", "KHÔNG thấy frm203017 sau khi click. Hộp thoại đang mở: " +
                        (DialogTexts() is { Length: > 0 } t ? t : "(không có)") +
                        " — nhánh 「ガイド không có 処置」 tự đóng dialog là HỢP LỆ (frm203017.cs:1001).");
            ClearDialogs("P6");
        }
        else
        {
            LogKq("P6", $"frm203017 ĐÃ MỞ. lblName=「{_guide.DialogNameLabel(dialog)}」 " +
                        $"txtGuidNo=「{_guide.DialogGuidNo(dialog)}」 txtGuidNm=「{_guide.DialogGuidNm(dialog)}」");
            var dg = _guide.DialogGrid(dialog);
            if (dg is null) LogKq("P6", "   KHÔNG thấy dgvView trên dialog");
            else
            {
                var h = dg.Headers();
                LogKq("P6", h.Count == 0
                    ? "   Headers() rỗng; mô tả ô dòng đầu: " +
                      string.Join(" | ", dg.Rows(1).FirstOrDefault()?.CellDescriptions ?? [])
                    : $"   header dialog = [{string.Join(" | ", h)}] ({h.Count} cột; " +
                      $"mong đợi 5: {string.Join("/", GuideTabFlow.ExpectedDialogHeaders)})");
                foreach (var r in dg.Rows(4)) LogKq("P6", "   dòng: " + r);
            }
            trace.Shot("P6-dialog-frm203017");
            CloseDialogIfOpen("P6");
        }

        Assert.Pass("PROBE — đọc các dòng KQ + thư mục ảnh, không assert gì.");
    }

    /// <summary>
    /// Mở tab ガイド ở chế độ 通常 và GHI LẠI đường nào ăn.
    ///
    /// <para>Đo được 2026-08-27: gửi phím F4 bằng <c>SendInput</c> KHÔNG có tác dụng khi
    /// 診療入力 không phải cửa sổ foreground (lượt chạy qua Scheduled Task có cửa sổ
    /// console nằm trên). Vì thế thử lần lượt và in ra đường đã ăn — đọc log mà không
    /// biết đường nào thì mọi câu sau đều bị đổ oan cho WinForm.</para>
    ///
    /// <para>Đường 4 (chọn thẳng TabItem) là ĐƯỜNG KHÁC HẲN: nó gọi
    /// <c>getGuidNyuryokuInfo</c> chứ không phải <c>getGuidNyuryokuInfo2</c>, nên chỉ
    /// dùng để nhìn cấu trúc lưới, KHÔNG dùng để kết luận về chế độ.</para>
    /// </summary>
    private string OpenGuideTab(string tag)
    {
        LogKq(tag, "   foreground TRƯỚC: " + _guide.ForegroundInfo());

        // Rời tab ガイド trước, nếu không thì đường thử ĐẦU TIÊN luôn được ghi là 「ăn」
        // chỉ vì tab còn mở từ lượt trước (đã đọc nhầm một lượt vì chuyện này).
        var left = false;
        try { left = _guide.LeaveGuideTab(); }
        catch (Exception e) { LogKq(tag, "   rời tab ガイド NÉM: " + e.GetType().Name + ": " + e.Message); }
        LogKq(tag, $"   rời tab ガイド trước khi đo → {(left ? "đã rời (hfgGuid1 vắng mặt)" : "KHÔNG rời được — kết quả 「đường nào ăn」 dưới đây KHÔNG đáng tin")}");

        var routes = new (string Name, Func<bool> Go)[]
        {
            ("1. phím F4 (SendInput)", () => { _guide.OpenRegular(); return true; }),
            ("2. Uia.Click nút btnF4", () => _guide.OpenRegularByButton()),
            ("3. click chuột thật lên btnF4", () => _guide.OpenRegularByPhysicalClick()),
            ("4. chọn thẳng TabItem 「ガイド」 (⚠ getGuidNyuryokuInfo, KHÔNG phải …Info2)",
             () => _guide.OpenTabByTabItem()),
        };

        foreach (var (name, go) in routes)
        {
            var attempted = false;
            Probe(tag, "mo tab guide — " + name, () => attempted = go());
            LogKq(tag, $"   foreground SAU: {_guide.ForegroundInfo()}");
            ClearDialogs(tag);

            if (!attempted) { LogKq(tag, $"   đường 「{name}」: KHÔNG thực hiện được (không thấy control)"); continue; }
            if (_guide.TabOpen())
            {
                LogKq(tag, $"   ✔ ĐƯỜNG ĂN: 「{name}」 — lưới hfgGuid1 đã có, {_guide.Rows().Count} dòng");
                return name;
            }
            LogKq(tag, $"   ✘ đường 「{name}」 không mở được tab (hfgGuid1 vẫn vắng mặt)");
        }

        LogKq(tag, "   ✘✘ KHÔNG đường nào mở được tab ガイド — mọi câu sau đều vô nghĩa, xem ảnh.");
        return "(không đường nào)";
    }

    private string FirstRowDescriptions()
    {
        var row = _guide.Rows(1).FirstOrDefault();
        return row is null ? "(không có dòng nào)" : string.Join(" | ", row.CellDescriptions);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 — ô 選択№
    // ═══════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe P7-P12 — F10 trả focus, ↑/↓, lọc ký tự, Enter (hợp lệ / ngoài phạm vi / rỗng)")]
    public void Tc1_ProbeSelNoBox()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        OpenGuideTab("P7");

        // ── P7: F10 đóng dialog → focus quay về đâu ────────────────────────
        LogKq("P7", "CÂU HỎI: đóng frm203017 bằng F10 thì con trỏ quay về đâu? " +
                    "(WinForm: ComParam == null ⇒ txtGuid1Sel.Focus(), frm203002.cs:6552)");
        Probe("P7", "click dong 0 roi dong bang F10", () =>
        {
            _guide.ClickRow(0);
            var d = _guide.WaitDialog();
            LogKq("P7", d is null ? "   dialog KHÔNG mở (ガイド rỗng 処置?)" : "   dialog đã mở");
            if (d is not null)
            {
                var closed = _guide.CloseDialogWithF10();
                LogKq("P7", $"   F10 → {(closed ? "đã đóng" : "VẪN MỞ")}");
            }
        });
        ClearDialogs("P7");
        LogKq("P7", $"focus sau khi đóng = {_guide.FocusedId()} · № = 「{_guide.SelNo()}」");

        // ── P8: ↑/↓ ────────────────────────────────────────────────────────
        LogKq("P8", "CÂU HỎI: ↑/↓ trên ô 選択№ có dời dòng sáng và kéo theo ô № không? " +
                    "clamp ở hai đầu? (ScrollRowUp/Down, frm203002.cs:6728)");
        _guide.FocusSelNo();
        LogKq("P8", $"   bắt đầu: № = 「{_guide.SelNo()}」");
        for (var i = 0; i < 3; i++)
        {
            var sent = _guide.PressArrowOnSelNo(down: true);
            LogKq("P8", $"   sau ↓ lần {i + 1}: № = 「{_guide.SelNo()}」{(sent ? "" : "  ⚠ SendInput KHÔNG gửi được phím")}");
        }
        for (var i = 0; i < 5; i++)
        {
            var sent = _guide.PressArrowOnSelNo(down: false);
            LogKq("P8", $"   sau ↑ lần {i + 1}: № = 「{_guide.SelNo()}」{(sent ? "" : "  ⚠ SendInput KHÔNG gửi được phím")}" +
                        (i >= 3 ? " (đã quá đầu list — clamp?)" : ""));
        }
        trace.Shot("P8-arrows");
        ClearDialogs("P8");

        // ── P9: lọc ký tự ─────────────────────────────────────────────────
        LogKq("P9", "CÂU HỎI: ô 選択№ có lọc ký tự không? gõ 「1a2」 còn lại gì?");
        Probe("P9", "go 1a2 vao o so", () => _guide.TypeSelNo("1a2"));
        LogKq("P9", $"   ô № sau khi gõ 「1a2」 = 「{_guide.SelNo()}」");
        _guide.ClearSelNo();
        ClearDialogs("P9");

        // ── P10: Enter với № hợp lệ ───────────────────────────────────────
        var rowCount = _guide.Rows().Count;
        LogKq("P10", $"CÂU HỎI: Enter với № hợp lệ (list đang có {rowCount} dòng) → mở dialog của ĐÚNG dòng đó?");
        var names = _guide.VisibleNames();
        if (rowCount >= 2)
        {
            LogKq("P10", $"   dòng 2 của list tên là 「{names.ElementAtOrDefault(1)}」");
            Probe("P10", "go 2 roi Enter", () =>
            {
                _guide.TypeSelNo("2");
                var sent = _guide.PressEnterOnSelNo();
                LogKq("P10", $"   Enter {(sent ? "đã gửi đi" : "⚠ SendInput KHÔNG gửi được")}");
            });
            var d = _guide.WaitDialog();
            LogKq("P10", d is null
                ? "   KHÔNG mở dialog. Hộp thoại: " + (DialogTexts() is { Length: > 0 } s ? s : "(không)")
                : $"   dialog mở với txtGuidNm=「{_guide.DialogGuidNm(d)}」 txtGuidNo=「{_guide.DialogGuidNo(d)}」" +
                  " ⇒ so với tên dòng 2 ở trên là biết có off-by-one không");
            CloseDialogIfOpen("P10");
        }
        else LogKq("P10", "   list < 2 dòng ⇒ không đo được off-by-one");

        // ── P11: Enter với № ngoài phạm vi (parity 3) ─────────────────────
        LogKq("P11", "CÂU HỎI (parity 3): Enter với № = 999 (ngoài phạm vi) → có VẪN mở dialog " +
                     "của dòng đang sáng không? (grdGuid_KeyDown gọi NGOÀI nhánh kiểm phạm vi, " +
                     "frm203002.cs:6756-6764)");
        var noBefore = _guide.SelNo();
        Probe("P11", "go 999 roi Enter", () =>
        {
            _guide.TypeSelNo("999");
            _guide.PressEnterOnSelNo();
        });
        LogKq("P11", $"   № trước = 「{noBefore}」 · dialog mở = {_guide.DialogOpen()} · " +
                     $"hộp thoại = {(DialogTexts() is { Length: > 0 } s2 ? s2 : "(không)")}");
        if (_guide.Dialog() is { } d11)
            LogKq("P11", $"   dialog đang mở là của ガイド 「{_guide.DialogGuidNm(d11)}」");
        CloseDialogIfOpen("P11");
        _guide.ClearSelNo();

        // ── P12: Enter với ô rỗng (parity 4) ──────────────────────────────
        LogKq("P12", "CÂU HỎI (parity 4): Enter với ô № RỖNG → có mở gì không? " +
                     "(int.TryParse(\"\") thất bại ⇒ cả nhánh Enter bị bỏ)");
        Probe("P12", "xoa sach o so roi Enter", () =>
        {
            _guide.FocusSelNo();
            _guide.ClearSelNo();
            _guide.PressEnterOnSelNo();
        });
        LogKq("P12", $"   dialog mở = {_guide.DialogOpen()} · " +
                     $"hộp thoại = {(DialogTexts() is { Length: > 0 } s3 ? s3 : "(không)")}");
        CloseDialogIfOpen("P12");

        Assert.Pass("PROBE — đọc các dòng KQ + thư mục ảnh, không assert gì.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc2 — ba chế độ nạp list
    // ═══════════════════════════════════════════════════════════════════════

    [Test]
    [Description("Probe P13-P18 — STEP (Shift+F4), 全て表示, 前回 rỗng, リセット (chỉ đọc câu hỏi)")]
    public void Tc2_ProbeGuideModes()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        OpenGuideTab("P13");
        var regularNames = _guide.VisibleNames();
        LogKq("P13", $"list 通常 (F4) có {regularNames.Count} dòng: " +
                     $"[{string.Join(" / ", regularNames.Take(8))}]");

        // ── P13: đường vào STEP ────────────────────────────────────────────
        LogKq("P13", "CÂU HỎI: 「Shift+F4」 đi được đường nào? WinForm rẽ theo ShiftFlg — " +
                     "cờ chỉ bật khi GIỮ phím Shift (BaseForm.cs:613) hoặc lật lớp phím bằng btnShift.");
        Probe("P13", "duong A: giu Shift + F4", () => _guide.OpenStepByShiftChord());
        var stepDialogsA = DialogTexts();
        var namesAfterChord = _guide.VisibleNames();
        LogKq("P13", $"   sau chord: {namesAfterChord.Count} dòng · 前回={Shown(_guide.PrvButton)} · " +
                     $"リセット={Shown(_guide.ResetButton)} · hộp thoại={(stepDialogsA.Length > 0 ? stepDialogsA : "(không)")}");
        ClearDialogs("P13");

        var chordWorked = _guide.IsButtonShown(_guide.PrvButton) || stepDialogsA.Length > 0;
        if (!chordWorked)
        {
            Probe("P13", "duong B: lat lop phim roi bam btnF4_S", () =>
            {
                var ok = _guide.OpenStepByShiftButton();
                LogKq("P13", $"   OpenStepByShiftButton → {(ok ? "bấm được" : "KHÔNG thấy btnShift/btnF4_S")}");
            });
            LogKq("P13", $"   sau đường B: {_guide.Rows().Count} dòng · 前回={Shown(_guide.PrvButton)} · " +
                         $"リセット={Shown(_guide.ResetButton)} · " +
                         $"hộp thoại={(DialogTexts() is { Length: > 0 } sb ? sb : "(không)")}");
            ClearDialogs("P13");
        }

        // ── P14: chế độ STEP ──────────────────────────────────────────────
        LogKq("P14", "CÂU HỎI: ở chế độ STEP thì 前回/リセット có HIỆN không, list còn lại gì?");
        var stepNames = _guide.VisibleNames();
        LogKq("P14", $"   list STEP có {stepNames.Count} dòng: [{string.Join(" / ", stepNames.Take(8))}]");
        LogKq("P14", $"   前回={Shown(_guide.PrvButton)} リセット={Shown(_guide.ResetButton)} " +
                     $"全て表示={Shown(_guide.AllButton)}");
        LogKq("P14", "   (list rỗng thì getGuidNyuryokuInfo2 bung E00024 「該当ガイドがありません。」 " +
                     "và KHÔNG gán DataSource — frm203002.cs:2013)");
        trace.Shot("P14-step-mode");

        // ── P16: 前回 rỗng có giữ nguyên list cũ không (parity 1) ──────────
        LogKq("P16", "CÂU HỎI (parity 1): bấm 「前回」; nếu rỗng thì E00024 rồi lưới có GIỮ NGUYÊN list cũ?");
        var beforePrv = _guide.VisibleNames();
        Probe("P16", "bam 前回", () =>
        {
            var clicked = _guide.ClickPrv();
            LogKq("P16", $"   {(clicked ? "đã bấm 前回" : "nút 前回 đang ẨN ⇒ không bấm được")}");
        });
        var prvDialogText = DialogTexts();
        LogKq("P16", $"   hộp thoại sau 前回 = {(prvDialogText.Length > 0 ? prvDialogText : "(không)")}");
        ClearDialogs("P16");
        var afterPrv = _guide.VisibleNames();
        LogKq("P16", $"   list trước = {beforePrv.Count} dòng · sau = {afterPrv.Count} dòng · " +
                     $"giống hệt = {beforePrv.SequenceEqual(afterPrv)}");
        LogKq("P16", $"   sau: [{string.Join(" / ", afterPrv.Take(8))}]");

        // ── P17: リセット — CHỈ đọc câu hỏi ───────────────────────────────
        LogKq("P17", "CÂU HỎI: 「リセット」 hỏi nguyên văn câu gì? " +
                     "(chỉ ĐỌC — nhánh OK chạy StepReset, UPDATE thật vào TRTSTATE)");
        Probe("P17", "bam リセット roi doc cau hoi", () =>
        {
            var clicked = _guide.ClickReset();
            LogKq("P17", $"   {(clicked ? "đã bấm リセット" : "nút リセット đang ẨN ⇒ không bấm được")}");
        });
        var resetText = DialogTexts();
        LogKq("P17", $"   NGUYÊN VĂN = 「{(resetText.Length > 0 ? resetText : "(không có hộp thoại)")}」 " +
                     "(source: Q00100 + 「該当部位の治療進行状態をリセットします。」, frm203002.cs:6636)");
        trace.Shot("P17-reset-question");
        ClearDialogs("P17");
        LogKq("P17", $"   sau khi trả lời キャンセル/いいえ: {_guide.Rows().Count} dòng (không được ghi gì)");

        // ── P15: 全て表示 ─────────────────────────────────────────────────
        LogKq("P15", "CÂU HỎI: 「全て表示」 → list có phải SUPERSET của list F4 không, " +
                     "và hai nút 前回/リセット có ẩn lại không? (bolStepPass=true)");
        Probe("P15", "bam 全て表示", () =>
        {
            var clicked = _guide.ClickAll();
            LogKq("P15", $"   {(clicked ? "đã bấm 全て表示" : "nút 全て表示 đang ẨN ⇒ không bấm được")}");
        });
        ClearDialogs("P15");
        var allNames = _guide.VisibleNames();
        var missing = regularNames.Where(n => !allNames.Contains(n)).ToList();
        LogKq("P15", $"   list 全て表示 có {allNames.Count} dòng (list F4 có {regularNames.Count})");
        LogKq("P15", missing.Count == 0
            ? "   MỌI dòng của list F4 đều còn trong list 全て表示 ⇒ đúng superset"
            : $"   {missing.Count} dòng của list F4 KHÔNG còn: [{string.Join(" / ", missing.Take(5))}] " +
              "(chú ý: lưới chỉ phơi dòng ĐANG NHÌN THẤY — PROBE-GUIDELINE 3.1)");
        LogKq("P15", $"   前回={Shown(_guide.PrvButton)} リセット={Shown(_guide.ResetButton)}");

        // ── P18: ガイド không có 処置 → dialog tự đóng (parity 5) ──────────
        LogKq("P18", "CÂU HỎI (parity 5): mở lần lượt vài dòng ガイド — dòng nào không có 処置 " +
                     "tính được thì dialog TỰ ĐÓNG kèm câu gì? (frm203017.cs:1001-1019: " +
                     "guide_chk_flg=0 → Q00100 「算定できる処置がありません。…」; =1 → E00024)");
        var probeRows = Math.Min(4, _guide.Rows().Count);
        for (var i = 0; i < probeRows; i++)
        {
            var name = _guide.VisibleNames().ElementAtOrDefault(i) ?? "?";
            Probe("P18", $"mo dong {i}", () => _guide.ClickRow(i));
            var open = _guide.DialogOpen();
            var text = DialogTexts();
            LogKq("P18", $"   dòng {i} 「{name}」 → dialog {(open ? "MỞ và Ở LẠI" : "KHÔNG mở / tự đóng")}" +
                         $" · hộp thoại = {(text.Length > 0 ? text : "(không)")}");
            CloseDialogIfOpen("P18");
            ClearDialogs("P18");
        }

        // Trả lớp phím về lớp thường để testcase/lượt chạy sau không bị lệch.
        _guide.ResetShiftLayer();

        Assert.Pass("PROBE — đọc các dòng KQ + thư mục ảnh, không assert gì.");
    }
}
