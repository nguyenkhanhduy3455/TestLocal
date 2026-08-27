using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// Tab 「ガイド」 của 診療入力 (frm203002) — <b>ĐÁP ÁN</b> mà bản web phải khớp.
///
/// <para>Nửa WinForm của <c>../web-tenant-tests/tests/guide-sidepanel-handler.spec.ts</c>.
/// Bảng tương ứng từng testcase + 3 điểm ĐO ĐƯỢC là LỆCH nằm ở <c>README.md</c> mục 3-4.</para>
///
/// <para>Mọi con số dưới đây <b>đã đo trên máy thật 2026-08-27</b> bằng fixture PROBE
/// (<see cref="GuideSidePanelProbeTests"/>) — không có assert nào viết theo phỏng đoán.
/// Sửa assert thì chạy lại PROBE trước, đừng đoán (PROBE-GUIDELINE mục 2).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY TUẦN TỰ, CHUNG MỘT PHIÊN APP
/// ═══════════════════════════════════════════════════════════════════════════
/// Thứ tự có nghĩa và được ghim bằng <c>[Order]</c>: TC-G1…G11 đo chế độ 通常, TC-G12
/// chuyển sang STEP (mới có 前回/リセット để đo), TC-G13 đọc câu hỏi của リセット,
/// TC-G14 bấm 全て表示 trả list về dải 通常. Chạy lẻ một testcase ở giữa vẫn được vì mỗi
/// cái tự dựng lại chế độ nó cần (<see cref="EnsureRegularTab"/>), chỉ tốn thêm thời gian.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Không bấm F9 登録 của frm203002, không bấm F9 確定 của frm203017, và câu hỏi của
/// 「リセット」 luôn trả lời <b>Cancel</b> — nhánh OK chạy <c>StepReset</c>, UPDATE thật
/// vào <c>TRTSTATE</c> (frm203002.cs:6649).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-select-guide-treatment.ps1
///   .\run-select-guide-treatment.ps1 -Case Tc07
/// </summary>
[TestFixture]
[Category("guide-sidepanel")]
public sealed class GuideSidePanelTests : UiTestBase
{
    private GuideTabFlow _guide = null!;

    /// <summary>
    /// Khởi động + dời side panel khỏi tab 個別 bằng PHÍM F4.
    ///
    /// <para>Lượt chạy trước có thể để lại tab 個別 (lưới master ~1.7k dòng): mọi
    /// <c>FindFirstDescendant</c> sau đó timeout. Phím không đi qua cây UIA nên không dính.</para>
    /// </summary>
    [OneTimeSetUp]
    public void GuideOneTimeSetUp()
    {
        _guide = new GuideTabFlow(App, Screen);
        try
        {
            _guide.FocusScreen();
            GuideTabFlow.SendKey(GuideTabFlow.Vk.F4);
            Thread.Sleep(1200);
        }
        catch (Exception e) { TestContext.Out.WriteLine("khởi động: " + e.Message); }
    }

    /// <summary>Đóng frm203017 và dẹp hộp thoại — cả fixture dùng chung một phiên app.</summary>
    [TearDown]
    public void GuideTearDown()
    {
        try
        {
            if (_guide.DialogOpen()) _guide.CloseDialogWithF10();
            DismissDialogs();
        }
        catch (Exception e) { TestContext.Out.WriteLine("dọn cuối testcase: " + e.Message); }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-G1 … TC-G4 — mở tab, cấu trúc lưới, hai nút bị ẩn
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-G1 — F4 mở tab ガイド và nạp list; lưới có ĐÚNG 2 cột 「№」/「名称」")]
    public void Tc01_F4OpensGuideTab_TwoColumnGrid()
    {
        EnsureRegularTab();

        Assert.That(_guide.TabOpen(), Is.True,
            "F4 phải mở tab ガイド (KeyFunc → SSTab1.SelectedIndex = 1, frm203002.cs:4699). " +
            "Phím không ăn thì kiểm giá trị trả về của Uia.SendKey TRƯỚC khi đổ cho app.");

        var rows = _guide.Rows(limit: 30);
        Assert.That(rows, Is.Not.Empty,
            "getGuidNyuryokuInfo2 phải nạp được ít nhất một dòng ガイド cho 部位/病名 đang chọn " +
            "(frm203002.cs:1991). Rỗng thì app đã bung E00024 chứ không im lặng.");

        var header = _guide.HeaderRowCells();
        Assert.That(header, Has.Count.EqualTo(2),
            "Lưới ガイド chỉ có 2 cột hiển thị: GuidNum + GuidSyo (frm203002.Designer.cs:1592). " +
            $"Đọc ra: [{string.Join(" | ", header)}]");

        // 「№」 (U+2116) qua NFKC của Txt.N thành "No" — nên so với "No", KHÔNG so với "№".
        // Bản web ghi 「No.」 (có dấu chấm) nên vẫn phân biệt được hai bên.
        Assert.That(Txt.N(header[0]), Is.EqualTo("No"),
            "Tiêu đề cột đầu là 「№」 (Designer :1618), NFKC hoá thành \"No\". " +
            "Bản web ghi 「No.」 — CÓ dấu chấm, đó là một khác biệt về chữ, xem README mục 4.");
        Assert.That(Txt.N(header[1]), Is.EqualTo("名称"),
            "Tiêu đề cột hai là 「名称」 (Designer :1626).");
    }

    [Test, Order(2)]
    [Description("TC-G2 — cột 「№」 là số thứ tự 1..N (GuidNum = cnt + 1), KHÔNG phải guid_cd")]
    public void Tc02_NoColumnIsSequential()
    {
        EnsureRegularTab();

        var nos = _guide.Rows(limit: 20).Select(r => Txt.Int(r.At(GuideTabFlow.Col.No))).ToList();
        Assert.That(nos, Is.Not.Empty, "cần ít nhất một dòng ガイド để đo");

        for (var i = 0; i < nos.Count; i++)
            Assert.That(nos[i], Is.EqualTo(i + 1),
                $"Dòng thứ {i} phải mang № = {i + 1}: modGuid1.pSet_Guid1 đánh lại số sau khi lọc " +
                "trùng GUID_CD (`GuidNum = cnt + 1`, modGuid1.cs:37) — đây là SỐ THỨ TỰ HIỂN THỊ, " +
                "không phải guid_cd.");
    }

    [Test, Order(3)]
    [Description("TC-G3 — vừa mở tab: ô 選択№ = 「1」 và con trỏ nằm ở chính ô đó")]
    public void Tc03_SelNoIsOneAndFocused()
    {
        EnsureRegularTab();

        Assert.That(_guide.SelNo(), Is.EqualTo("1"),
            "hfgGuid1_RowEnter đặt txtGuid1Sel.Text = rowIndex + 1 (frm203002.cs:2238); " +
            "dòng sáng lúc nạp xong là dòng đầu ⇒ ô phải là 「1」.");
        Assert.That(_guide.FocusedId(), Is.EqualTo("txtGuid1Sel"),
            "KeyFunc(F4) kết thúc bằng txtGuid1Sel.Focus() (frm203002.cs:4706).");
    }

    [Test, Order(4)]
    [Description("TC-G4 — chế độ 通常: 「全て表示」 hiện, 「前回」/「リセット」 phải ẨN (web parity 2)")]
    public void Tc04_RegularModeHidesPrvAndReset()
    {
        EnsureRegularTab();

        Assert.Multiple(() =>
        {
            Assert.That(_guide.IsButtonShown(_guide.AllButton), Is.True,
                "「全て表示」 luôn hiện — getGuidNyuryokuInfo2 không đụng tới nó.");
            Assert.That(_guide.IsButtonShown(_guide.PrvButton), Is.False,
                "F4 通常 gọi getGuidNyuryokuInfo2(bolStepPass: true) ⇒ cmdGuidPrv.Visible = false " +
                "(frm203002.cs:1994).");
            Assert.That(_guide.IsButtonShown(_guide.ResetButton), Is.False,
                "cùng chỗ đó: cmdGuidReset.Visible = false (frm203002.cs:1995).");
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-G5 … TC-G6 — dialog frm203017
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC-G5 — click ĐƠN một dòng → mở 「ガイド処置選択」 của đúng dòng đó, lưới 5 cột")]
    public void Tc05_SingleClickOpensGuideDialog()
    {
        EnsureRegularTab();

        var firstName = _guide.Rows(limit: 2).First().At(GuideTabFlow.Col.Name);
        Assert.That(_guide.ClickRow(0), Is.True, "phải click được dòng đầu của lưới ガイド");

        var dialog = _guide.WaitDialog();
        Assert.That(dialog, Is.Not.Null,
            "CLICK ĐƠN đã tương đương Enter ở tab này: hfgGuid1_Click → grdGuid_KeyDown(Return) → " +
            "hfgGuid1_CellDoubleClick → showDialog(ID203017) (frm203002.cs:6570). " +
            "Khác tab パック, nơi WinForm đòi double-click.");

        Assert.Multiple(() =>
        {
            Assert.That(Txt.N(_guide.DialogNameLabel(dialog!)), Is.EqualTo("ガイド番号"),
                "nhãn header của frm203017 là 「ガイド番号」 (frm203017.Designer.cs:110).");
            Assert.That(Txt.Int(_guide.DialogGuidNo(dialog!)), Is.Not.Null,
                "txtGuidNo mang guid_cd của dòng vừa chọn (frm203017.cs:428).");
            Assert.That(Txt.N(_guide.DialogGuidNm(dialog!)), Is.EqualTo(Txt.N(firstName)),
                "txtGuidNm phải là 「名称」 của ĐÚNG dòng vừa click (param.guidNm ← GuidSyo, " +
                "frm203002.cs:6537).");
        });

        var grid = _guide.DialogGrid(dialog!);
        Assert.That(grid, Is.Not.Null, "dialog phải có lưới dgvView");

        var row = grid!.Rows(1).FirstOrDefault();
        Assert.That(row, Is.Not.Null, "TC này chọn dòng ガイド CÓ 処置 nên lưới không được rỗng");
        Assert.That(row!.Cells, Has.Count.EqualTo(GuideTabFlow.ExpectedDialogHeaders.Length),
            "_viewItem để width = 0 cho 4 cột cuối (jihi_flg/men/unit/acc_unit) nên chỉ 5 cột ra " +
            $"tới UIA: {string.Join("/", GuideTabFlow.ExpectedDialogHeaders)} (frm203017.cs:96-104). " +
            $"Đọc ra: [{row}]");
    }

    [Test, Order(6)]
    [Description("TC-G6 — đóng dialog kiểu huỷ (nút 戻る) → con trỏ quay lại ô 選択№")]
    public void Tc06_CancelClosingReturnsFocusToSelNo()
    {
        EnsureRegularTab();
        Assert.That(_guide.ClickRow(0), Is.True);
        Assert.That(_guide.WaitDialog(), Is.Not.Null, "cần dialog đang mở để đo lúc đóng");

        // ĐÓNG BẰNG NÚT, không bằng phím F10: phím F10 của Windows còn kích hoạt thanh menu
        // của cửa sổ đứng sau, và con trỏ đọc ra 「MenuBar」 — đỏ vì chính cái phím test gửi.
        Assert.That(_guide.CloseDialogWithF10(byKey: false), Is.True, "nút 戻る phải đóng được dialog");

        Assert.That(_guide.FocusedId(), Is.EqualTo("txtGuid1Sel"),
            "ComParam == null (đóng kiểu huỷ) ⇒ txtGuid1Sel.Focus() rồi return " +
            "(frm203002.cs:6551-6555) — KHÔNG nhường focus cho lưới đăng ký.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-G7 … TC-G11 — ô 選択№
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(7)]
    [Description("TC-G7 — ↑/↓ trên ô 選択№ dời dòng sáng và kéo theo ô №, clamp ở đầu list")]
    public void Tc07_ArrowsMoveSelectionAndClamp()
    {
        EnsureRegularTab();
        _guide.FocusSelNo();
        Assert.That(_guide.SelNo(), Is.EqualTo("1"), "điểm xuất phát phải là dòng 1");

        for (var expected = 2; expected <= 4; expected++)
        {
            Assert.That(_guide.PressArrowOnSelNo(down: true), Is.True, "SendInput phải gửi được phím ↓");
            Assert.That(_guide.SelNo(), Is.EqualTo(expected.ToString()),
                $"↓ gọi hfgGuid1.ScrollRowDown() (frm203002.cs:6734); RowEnter kéo ô № theo ⇒ {expected}.");
        }

        for (var expected = 3; expected >= 1; expected--)
        {
            Assert.That(_guide.PressArrowOnSelNo(down: false), Is.True, "SendInput phải gửi được phím ↑");
            Assert.That(_guide.SelNo(), Is.EqualTo(expected.ToString()),
                $"↑ gọi ScrollRowUp() (frm203002.cs:6730) ⇒ {expected}.");
        }

        _guide.PressArrowOnSelNo(down: false);
        _guide.PressArrowOnSelNo(down: false);
        Assert.That(_guide.SelNo(), Is.EqualTo("1"),
            "↑ quá đầu list KHÔNG được đi âm — ScrollRowUp tự dừng ở dòng 0.");
    }

    [Test, Order(8)]
    [Description("TC-G8 — ô 選択№ KHÔNG lọc ký tự: gõ 「1a2」 thì ô giữ nguyên 「1a2」 (LỆCH bản web)")]
    public void Tc08_SelNoDoesNotFilterCharacters()
    {
        EnsureRegularTab();
        _guide.TypeSelNo("1a2");

        Assert.That(_guide.SelNo(), Is.EqualTo("1a2"),
            "ĐO ĐƯỢC trên WinForm: txtGuid1Sel là CustomTextBox nhưng KHÔNG gắn bộ lọc chữ số nào — " +
            "Designer chỉ nối PreviewKeyDown + KeyDown (frm203002.Designer.cs:1497-1498), và " +
            "txtGuid1Sel_KeyDown chỉ xử lý ↑/↓/PageUp/PageDown/Enter. Chữ rác nằm lại trong ô, " +
            "chỉ tới lúc Enter mới bị int.TryParse loại. " +
            "⚠ Bản web lọc bằng sanitizeDigits nên ô không bao giờ chứa chữ — đây là LỆCH THẬT, " +
            "xem README mục 4.");

        _guide.ClearSelNo();
    }

    [Test, Order(9)]
    [Description("TC-G9 — № hợp lệ + Enter → mở dialog của ĐÚNG dòng đó (không off-by-one)")]
    public void Tc09_EnterWithValidNoOpensThatRow()
    {
        EnsureRegularTab();

        var rows = _guide.Rows(limit: 3);
        Assert.That(rows, Has.Count.GreaterThanOrEqualTo(2), "cần ít nhất 2 dòng để đo off-by-one");
        var secondName = rows[1].At(GuideTabFlow.Col.Name);

        _guide.TypeSelNo("2");
        Assert.That(_guide.PressEnterOnSelNo(), Is.True, "SendInput phải gửi được phím Enter");

        var dialog = _guide.WaitDialog();
        Assert.That(dialog, Is.Not.Null,
            "Enter trên ô № có số hợp lệ phải mở dialog: int.TryParse thành công → CurrentCell nhảy " +
            "tới dòng (số − 1) → grdGuid_KeyDown(Return) (frm203002.cs:6744-6764).");
        Assert.That(Txt.N(_guide.DialogGuidNm(dialog!)), Is.EqualTo(Txt.N(secondName)),
            "№ 2 phải mở dòng THỨ HAI của list — `intRow--` rồi mới dùng làm chỉ số, " +
            "nên ô № là 1-based còn lưới là 0-based (frm203002.cs:6746).");
    }

    [Test, Order(10)]
    [Description("TC-G10 — № NGOÀI phạm vi (999) + Enter → VẪN mở dialog của dòng đang sáng (web parity 3)")]
    public void Tc10_EnterWithOutOfRangeNoStillOpensCurrentRow()
    {
        EnsureRegularTab();

        var firstName = _guide.Rows(limit: 2).First().At(GuideTabFlow.Col.Name);
        _guide.TypeSelNo("999");
        Assert.That(_guide.PressEnterOnSelNo(), Is.True);

        var dialog = _guide.WaitDialog();
        Assert.That(dialog, Is.Not.Null,
            "grdGuid_KeyDown(Return) được gọi NGOÀI nhánh kiểm phạm vi (frm203002.cs:6748-6763): " +
            "số ngoài phạm vi chỉ làm CurrentCell không nhảy, chứ KHÔNG chặn việc chốt dòng.");
        Assert.That(Txt.N(_guide.DialogGuidNm(dialog!)), Is.EqualTo(Txt.N(firstName)),
            "dòng sáng không đổi ⇒ dialog vẫn là của dòng đang sáng.");

        _guide.CloseDialogWithF10(byKey: false);
        _guide.ClearSelNo();
    }

    [Test, Order(11)]
    [Description("TC-G11 — ô № RỖNG + Enter → không mở gì (int.TryParse(\"\") thất bại) (web parity 4)")]
    public void Tc11_EnterWithEmptyNoOpensNothing()
    {
        EnsureRegularTab();
        _guide.FocusSelNo();
        _guide.ClearSelNo();
        Assert.That(_guide.SelNo(), Is.Empty, "ô № phải rỗng trước khi gõ Enter");

        Assert.That(_guide.PressEnterOnSelNo(), Is.True);

        Assert.That(_guide.DialogOpen(), Is.False,
            "int.TryParse(\"\") trả false ⇒ TOÀN BỘ nhánh Enter bị bỏ, kể cả lời gọi " +
            "grdGuid_KeyDown (frm203002.cs:6744).");
        Assert.That(DialogTexts(), Is.Empty, "và cũng không có hộp thoại nào bung ra");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-G12 … TC-G15 — ba chế độ nạp list
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(12)]
    [Description("TC-G12 — Shift+F4 (STEP) → 「前回」/「リセット」 HIỆN ra")]
    public void Tc12_StepModeShowsPrvAndReset()
    {
        EnsureRegularTab();
        _guide.OpenStepByShiftChord();
        DismissDialogs();

        Assert.Multiple(() =>
        {
            Assert.That(_guide.IsButtonShown(_guide.PrvButton), Is.True,
                "Shift+F4 → KeyFunc(F4, 1) → getGuidNyuryokuInfo2(bolStepPass: false) ⇒ " +
                "cmdGuidPrv.Visible = true (frm203002.cs:1999). " +
                "⚠ WinForm rẽ theo cờ ShiftFlg của LỚP PHÍM (BaseForm.cs:613), không phải theo " +
                "phím bổ trợ của lần bấm — giữ Shift rồi gõ F4 mới bật được cờ đó.");
            Assert.That(_guide.IsButtonShown(_guide.ResetButton), Is.True,
                "cùng chỗ: cmdGuidReset.Visible = true (frm203002.cs:2000).");
        });
    }

    [Test, Order(13)]
    [Description("TC-G13 — 「リセット」 hỏi Q00100 nguyên văn; trả lời Cancel thì KHÔNG ghi gì")]
    public void Tc13_ResetAsksBeforeWriting()
    {
        EnsureStepTab();

        var before = _guide.RawRowCount();
        Assert.That(_guide.ClickReset(), Is.True, "nút 「リセット」 phải bấm được ở chế độ STEP");

        var text = DialogTexts();
        Assert.That(text, Does.Contain("該当部位の治療進行状態をリセットします"),
            "MsgDialog.ShowOKCancelMsg(\"Q00100\", …) (frm203002.cs:6636). " +
            $"Đọc ra: 「{text}」");
        Assert.That(text, Does.Contain("よろしいですか"),
            "Q00100 nối thêm câu hỏi xác nhận — ĐO ĐƯỢC nguyên văn " +
            "「該当部位の治療進行状態をリセットします。よろしいですか？」, nút là OK / Cancel " +
            "(KHÔNG phải はい/いいえ).");

        DismissDialogs();
        Assert.That(_guide.RawRowCount(), Is.EqualTo(before),
            "trả lời Cancel ⇒ StepReset KHÔNG chạy ⇒ list giữ nguyên và TRTSTATE không bị đụng.");
    }

    [Test, Order(14)]
    [Description("TC-G14 — 「全て表示」 → list dài ra và 「前回」/「リセット」 ẩn trở lại")]
    public void Tc14_ShowAllWidensListAndHidesButtons()
    {
        EnsureStepTab();
        var stepRows = _guide.RawRowCount();

        Assert.That(_guide.ClickAll(), Is.True, "nút 「全て表示」 phải bấm được");
        DismissDialogs();

        Assert.That(_guide.RawRowCount(), Is.GreaterThan(stepRows),
            "全て表示 → getGuidNyuryokuInfo2(bolStepPass: true, AllGuid: true) (frm203002.cs:6610); " +
            "pSet_Guid1 bỏ điều kiện STEP nên list phải RỘNG HƠN dải 1000-1999. " +
            "⚠ Đếm bằng SỐ PHẦN TỬ DÒNG chứ không so tập tên: cầu MSAA chỉ dựng phần tử cho dòng " +
            "ĐANG NHÌN THẤY, đọc tên cả list dài sẽ thiếu (PROBE-GUIDELINE 3.1).");

        Assert.Multiple(() =>
        {
            Assert.That(_guide.IsButtonShown(_guide.PrvButton), Is.False,
                "bolStepPass = true ⇒ 前回 ẩn lại (frm203002.cs:1994).");
            Assert.That(_guide.IsButtonShown(_guide.ResetButton), Is.False,
                "và リセット cũng vậy (frm203002.cs:1995).");
        });
    }

    [Test, Order(15)]
    [Description("TC-G15 — dòng ガイド CÓ 処置 tính được: dialog Ở LẠI, không tự đóng, không alert")]
    public void Tc15_GuideWithTreatmentsKeepsDialogOpen()
    {
        EnsureRegularTab();
        Assert.That(_guide.ClickRow(0), Is.True);

        var dialog = _guide.WaitDialog();
        Assert.That(dialog, Is.Not.Null, "dòng đầu của list 通常 có 処置 nên dialog phải mở");

        // Ở LẠI, không phải "mở rồi tắt": chờ thêm rồi đọc lại.
        Thread.Sleep(1500);
        Assert.That(_guide.DialogOpen(), Is.True,
            "getViewData chỉ this.Close() khi dspDt.Rows.Count == 0 (frm203017.cs:1001-1019). " +
            "Có 処置 thì dialog phải ở lại chờ người dùng nhập 回数.");
        Assert.That(DialogTexts(), Is.Empty,
            "và KHÔNG bung Q00100 「算定できる処置がありません。」 cũng như E00024.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tiền đề dùng chung
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Đưa tab ガイド về chế độ 通常 (F4), bất kể testcase trước để lại chế độ nào.
    ///
    /// <para>Luôn rời tab trước rồi mới bấm F4: đang ở chế độ STEP mà bấm F4 thì list đổi
    /// nhưng cờ lớp phím có thể chưa đổi, và phép đo 「hai nút có ẩn không」 sẽ đọc trạng
    /// thái nửa vời.</para>
    /// </summary>
    private void EnsureRegularTab()
    {
        _guide.ResetShiftLayer();
        _guide.FocusScreen();
        if (_guide.TabOpen()) _guide.LeaveGuideTab();

        _guide.FocusScreen();
        Assert.That(GuideTabFlow.SendKey(GuideTabFlow.Vk.F4), Is.True,
            "SendInput không gửi được phím F4 — lỗi của bộ test, không phải của app " +
            "(xem Uia.Win32.INPUT).");
        Thread.Sleep(1200);
        DismissDialogs();

        Assert.That(_guide.TabOpen(), Is.True, "không mở được tab ガイド ở chế độ 通常");
    }

    /// <summary>Đưa tab ガイド về chế độ STEP (giữ Shift + F4).</summary>
    private void EnsureStepTab()
    {
        if (_guide.IsButtonShown(_guide.PrvButton) && _guide.IsButtonShown(_guide.ResetButton)) return;

        EnsureRegularTab();
        _guide.OpenStepByShiftChord();
        DismissDialogs();

        if (!_guide.IsButtonShown(_guide.ResetButton))
            IgnoreWithReason(
                "Không vào được chế độ STEP: 部位/病名 đang chọn không có ガイド nào trong dải " +
                "1000-1999 nên getGuidNyuryokuInfo2 bung E00024 và hai nút không hiện. " +
                "Đây là dữ liệu của máy, không phải lỗi app.");
    }

    /// <summary>
    /// Nguyên văn mọi MessageBox đang mở (rỗng nếu không có) — đọc bằng <b>Win32 thuần</b>.
    ///
    /// <para>KHÔNG dùng <c>ModalDialogs.All</c>: khi không có hộp thoại nào, hai đường đầu
    /// của nó trả rỗng nên lần nào cũng rơi xuống đường quét TOÀN BỘ desktop qua UIA. Đo
    /// được 2026-08-27: một testcase gọi nó vài lần treo hơn 20 phút. Xem
    /// <see cref="MsgBoxWin32"/>.</para>
    /// </summary>
    private string DialogTexts() => MsgBoxWin32.TextOfAll(App.ProcessId);

    /// <summary>
    /// Dẹp MessageBox đang mở. Câu 「リセットします」 LUÔN trả lời <b>Cancel</b> — nhánh OK
    /// chạy <c>StepReset</c> và UPDATE thật vào <c>TRTSTATE</c>.
    /// </summary>
    private void DismissDialogs()
    {
        for (var i = 0; i < 5; i++)
        {
            var open = MsgBoxWin32.All(App.ProcessId);
            if (open.Count == 0) return;

            foreach (var d in open)
            {
                var clicked = MsgBoxWin32.ClickButton(d.Hwnd, "キャンセル", "Cancel", "いいえ", "No", "OK");
                TestContext.Out.WriteLine(
                    $"dẹp hộp thoại {d} → {(clicked ? "đã bấm" : "KHÔNG có nút nào khớp; nút thấy được: " + string.Join(" / ", MsgBoxWin32.ButtonCaptions(d.Hwnd)))}");
            }
            Thread.Sleep(500);
        }
    }
}
