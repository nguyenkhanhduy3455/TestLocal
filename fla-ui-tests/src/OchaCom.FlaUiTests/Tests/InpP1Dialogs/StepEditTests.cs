using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// <b>Ｓｔｅｐ編集 (frm203050)</b> — bản WinForm của nhóm TC-STEP-* trong
/// <c>web-tenant-tests/tests/step-edit-dialog.spec.ts</c> (tách khỏi
/// <c>inp-p1-ported-dialogs.spec.ts</c> ngày 2026-08-14).
///
/// <para>Bộ này đo <b>đáp án</b>: bản web phải khớp cái mà WinForm làm ở đây. Mỗi
/// testcase ghi rõ nó ứng với TC nào bên Playwright để hai bên còn đối chiếu được.</para>
///
/// <para>Cả fixture dùng CHUNG một lần mở dialog (giống <c>mode:'serial'</c>): TC trước
/// để lại gì thì TC sau thấy nguyên như vậy, và thứ tự <c>Order</c> có Ý NGHĨA.</para>
///
/// <para><b>Ghi DB</b>: chỉ <c>Tc8</c>, và chỉ khi <c>inpP1.allowSave = true</c>. Nó tự
/// trả lại giá trị gốc; <c>OneTimeTearDown</c> cảnh báo nếu trả không xong.</para>
/// </summary>
[TestFixture]
[Category("inp-p1")]
[Category("step-edit")]
public sealed class StepEditTests : InpP1TestBase
{
    /// <summary>種別 và 部位 đem gõ thử. Không đụng ô nào khác (frm203050 ghi CẢ 15×32 một lần).</summary>
    private const int ProbeKind = 1;
    private const int ProbeBui = 1;

    /// <summary>Ô để trống, kiểm 「rỗng = 0」 (<c>EditControl.editStringToInt</c>).</summary>
    private const int BlankBui = 2;

    /// <summary>Giá trị thử: hợp lệ, khác 0, khác mọi giá trị mặc định.</summary>
    private const int ProbeValue = 7;

    /// <summary>種別 thứ hai (index 1 trong combo) — dùng để kiểm bộ đệm 15 種別.</summary>
    private const int OtherKindIndex = 1;

    private Window? _dialog;

    /// <summary>Giá trị gốc của ô thử, chốt ở Tc1 để Tc8 trả lại.</summary>
    private int? _probeBefore;

    private Window Dialog => _dialog ??= StepEditDialog.Open(App, Screen.Window);

    [OneTimeTearDown]
    public void CloseDialogIfLeftOpen()
    {
        // Bám vào app đang chạy (app.attachIfRunning) thì dialog còn mở sẽ CHẶN lượt chạy
        // sau — và người chạy chỉ thấy 「không mở được menu」 ở một testcase chẳng liên quan.
        var open = App?.Window(StepEditDialog.DialogId);
        if (open is null) return;
        try { StepEditDialog.Close(App!, open); }
        catch (Exception e) { Log($"khong dong duoc {StepEditDialog.DialogId}: {e.Message}"); }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 — TC-STEP-OPEN-1 + TC-STEP-LOAD-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — mở dialog: title, đủ 32 ô txtEpp, và 32 ô khớp TRTSTATE của 種別 1")]
    public void Tc1_OpenAndLoad()
    {
        using var trace = TestTrace.Begin();

        _dialog = StepEditDialog.Open(App, Screen.Window, trace);

        var title = Uia.NameOf(_dialog);
        trace.Note($"title: 「{title}」");
        Assert.That(Txt.Has(title, StepEditDialog.TitleFragment), Is.True,
            $"Dialog {StepEditDialog.DialogId} phai co title chua 「{StepEditDialog.TitleFragment}」 " +
            "(_title, frm203050.cs:37).");

        // 32 ô, ĐÚNG TÊN và ĐÚNG THỨ TỰ — Designer đặt txtEpp1..txtEpp32, và
        // txtEpp_KeyDown (:153) tách chỉ số từ chính cái tên đó.
        var present = StepEditDialog.PresentCellNumbers(_dialog);
        trace.Note($"tim thay {present.Count}/{StepEditDialog.BuiCount} o txtEpp");
        Assert.That(present, Is.EqualTo(Enumerable.Range(1, StepEditDialog.BuiCount).ToList()),
            $"frm203050 phai co du {StepEditDialog.BuiCount} o txtEpp1..txtEpp{StepEditDialog.BuiCount} " +
            "(frm203050.Designer.cs). Thieu o nao la Designer da doi.");

        var shown = StepEditDialog.VisibleRow(_dialog);
        _probeBefore = shown[ProbeBui - 1];
        trace.Note($"32 o dang hien (種別 {ProbeKind}): {string.Join(" ", shown)}");
        LogKq(2, $"TRTSTATE 種別 {ProbeKind} tren man hinh: {string.Join(" ", shown)}");

        // ── Đối chiếu với DB: đây là chỗ chứng minh initProc nạp ĐÚNG dữ liệu ──
        // initProc gọi TrtState.getTrtState(con, _patNo) rồi setStsBui (:205-208), và
        // dspData(1) đổ 32 ô đầu (:210). Không có DB thì chỉ kiểm được cấu trúc.
        if (InpDb is null)
        {
            Log($"BO QUA phan doi chieu DB — {InpDbUnavailableReason}");
            return;
        }

        var fromDb = InpDb.ReadTrtStateRow(PatNo, ProbeKind);
        if (fromDb is null)
        {
            // getTrtState tự chèn dòng mặc định khi không có (TrtState.cs:1030) — nếu
            // vẫn không thấy thì đọc sai bảng, phải báo chứ đừng lặng lẽ bỏ qua.
            Assert.Fail(
                $"Benh nhan {PatNo} khong co dong TRTSTATE nao du dialog da mo — " +
                "TrtState.getTrtState (TrtState.cs:1030) le ra tu chen dong mac dinh. " +
                "Kiem lai db.connectionString co tro dung CSDL ma app dang dung khong.");
            return;
        }

        Assert.That(shown, Is.EqualTo(fromDb),
            $"32 o cua 種別 {ProbeKind} phai khop cot bui{ProbeKind}_1..bui{ProbeKind}_32 " +
            $"cua TRTSTATE (pat_no = {PatNo}). Lech nghia la dspData do sai o hoac sai thu tu 部位.");
        trace.Step("32 o khop TRTSTATE");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc2 — TC-STEP-OPEN-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc2 — combo 種別 đủ 15 mục của CODMST 70 và hiện theo đúng thứ tự 1..15")]
    public void Tc2_KindCombo()
    {
        using var trace = TestTrace.Begin();

        var items = StepEditDialog.KindItems(Dialog);
        trace.Note($"cboKind co {items.Count} muc: {string.Join(" / ", items)}");
        LogKq(1, $"cboKind hien theo thu tu: {string.Join(" / ", items)}");

        Assert.That(items, Has.Count.EqualTo(StepEditDialog.KindCount),
            $"cboKind phai do tu CODMST cd_type {StepEditDialog.KindCdType} " +
            $"(makeCodMstCombo, frm203050.cs:204) va co dung {StepEditDialog.KindCount} muc.");

        // Nhãn CODMST 70 có dạng 「{số}-{tên}」 (「 1-Ｃ関連」 … 「15-」). Soi theo SỐ đầu
        // dòng: phải đủ 1..15 và phải hiện ĐÚNG THỨ TỰ đó.
        var numbers = items.Select(LeadingNumber).ToList();
        Assert.That(numbers, Does.Not.Contain(null),
            $"co muc khong bat dau bang so: {string.Join(" / ", items)}");

        var expected = Enumerable.Range(1, StepEditDialog.KindCount).ToList();
        Assert.That(numbers.OrderBy(n => n).ToList(), Is.EqualTo(expected),
            $"nhan 種別 phai la 1..{StepEditDialog.KindCount}, dang co: {string.Join(" / ", items)}");

        // ⚠️ Đây chính là chỗ bản web đã lộ lỗi (2026-08-11): combo web mở ra với 「12-」
        //    đứng đầu vì `GetMstCodHandler` chỉ ORDER BY sort_order, mà cd_type 70 có
        //    sort_order = 0 trên MỌI dòng. WinForm cũng chỉ ORDER BY SORT_ORDER
        //    (CodMst.cs:41) nhưng clustered PK (CD_TYPE, CD_VAL) của SQL Server phá hoà
        //    bằng cd_val. Testcase này chốt lại "đáp án" đó.
        Assert.That(numbers, Is.EqualTo(expected),
            $"種別 phai hien theo dung thu tu 1..{StepEditDialog.KindCount}, dang la: " +
            $"{string.Join(" / ", items)}. Neu WinForm cung xao tron thi ban web KHONG " +
            "duoc phep tu sap xep — luc do phai sua ky vong o ca hai ben.");

        // Mở màn phải đứng ở 種別 1 — dspData(1); _bkIdx = 1 (frm203050.cs:210-211).
        var selected = StepEditDialog.SelectedKind(Dialog);
        trace.Note($"muc dang chon: 「{selected}」");
        Assert.That(Txt.Same(selected, items[0]), Is.True,
            $"mo man phai dung o 種別 1 (「{items[0]}」), dang o 「{selected}」 " +
            "(frm203050.cs:210 dspData(1)).");

        if (InpDb is null) return;

        // Nhãn combo lấy nguyên từ CODMST.ANY_VAL1 — so từng mục để bắt trường hợp
        // app hiển thị cột khác (ANY_VAL2) hoặc cắt chuỗi.
        var codItems = InpDb.ComboItems(StepEditDialog.KindCdType);
        LogKq(1, "CODMST 70 (ORDER BY SORT_ORDER — dung cau app chay): " +
            string.Join(" / ", codItems.Select(c => $"cd_val={c.CdVal} sort={c.SortOrder} 「{c.Label}」")));

        Assert.That(items.Select(Txt.N).ToList(),
            Is.EqualTo(codItems.Select(c => Txt.N(c.Label)).ToList()),
            "nhan tren cboKind phai la CODMST.ANY_VAL1 cua cd_type 70, dung thu tu ma " +
            "CodMst.getComboData tra ve (CodMst.cs:34-51).");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc3 — TC-STEP-BUFFER-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — đổi 種別 rồi quay lại: số vừa gõ VẪN CÒN (bộ đệm 15×32 trong bộ nhớ)")]
    public void Tc3_BufferKeepsEdits()
    {
        using var trace = TestTrace.Begin();

        // Đây là lý do frm203050 nạp CẢ 15 種別 trong MỘT lần (initProc → getTrtState):
        // dspData chỉ đổ lại màn hình từ _stsBui, không hỏi DB (frm203050.cs:244-250).
        // Bản web port đúng chỗ này thì mới giữ được chỉnh sửa khi đổi 種別.
        StepEditDialog.SetCell(Dialog, ProbeBui, ProbeValue);
        Assert.That(StepEditDialog.CellValue(Dialog, ProbeBui), Is.EqualTo(ProbeValue),
            $"go {ProbeValue} vao txtEpp{ProbeBui} ma o khong nhan gia tri.");
        trace.Step($"go {ProbeValue} vao 種別 {ProbeKind} / 部位 {ProbeBui}");

        // Sang 種別 khác: 32 ô phải đổi sang dữ liệu của 種別 MỚI.
        StepEditDialog.SelectKind(Dialog, OtherKindIndex);
        var otherShown = StepEditDialog.VisibleRow(Dialog);
        trace.Note($"種別 index {OtherKindIndex}: {string.Join(" ", otherShown)}");

        if (InpDb is not null)
        {
            var otherFromDb = InpDb.ReadTrtStateRow(PatNo, OtherKindIndex + 1);
            if (otherFromDb is not null)
            {
                Assert.That(otherShown, Is.EqualTo(otherFromDb),
                    $"doi sang 種別 {OtherKindIndex + 1} ma 32 o khong khop " +
                    $"bui{OtherKindIndex + 1}_* cua TRTSTATE — dspData do sai lat cat cua _stsBui.");
            }
        }
        else
        {
            Log($"BO QUA phan doi chieu DB cua 種別 {OtherKindIndex + 1} — {InpDbUnavailableReason}");
        }

        // Quay lại 種別 đầu: số vừa gõ phải còn nguyên.
        StepEditDialog.SelectKind(Dialog, 0);
        Assert.That(StepEditDialog.CellValue(Dialog, ProbeBui), Is.EqualTo(ProbeValue),
            $"quay lai 種別 {ProbeKind} ma mat so vua go — bo dem 15 種別 (_stsBui) khong duoc giu. " +
            "Neu ban web di theo huong 「moi 種別 mot request」 thi cung dut o day.");
        trace.Step("quay lai 種別 1, so vua go van con");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc4 — TC-STEP-NAV-1 + TC-STEP-NAV-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("Tc4 — ↑/↓ nhảy giữa hai hàm CÙNG CỘT; →/← đi hết 32 ô và VÒNG LẠI")]
    public void Tc4_ArrowNavigation()
    {
        using var trace = TestTrace.Begin();

        // ↓ từ ô 部位 1 (hàm trên) phải xuống ô 17 (hàm dưới, CÙNG CỘT): idx < 16 ⇒ idx+16
        // (frm203050.cs:156-160).
        StepEditDialog.FocusCell(Dialog, ProbeBui);
        var valueBefore = StepEditDialog.CellText(Dialog, ProbeBui);

        Uia.SendKey(Vk.Down);
        var lower = StepEditDialog.ExpectedNeighbour(ProbeBui, Vk.Down);
        AssertFocus(lower, "↓ phai nhay xuong ham duoi CUNG COT (frm203050.cs:158)");

        // Ô cũ không được đổi giá trị. Trên WinForm điều này hiển nhiên (TextBox không
        // spin theo phím mũi tên) — nhưng bản web dùng <input type="number"> nên phải
        // preventDefault; giữ khẳng định ở đây để hai bên đối chiếu được cùng một câu.
        Assert.That(StepEditDialog.CellText(Dialog, ProbeBui), Is.EqualTo(valueBefore),
            "↓ khong duoc tang/giam gia tri o cu.");

        Uia.SendKey(Vk.Up);
        AssertFocus(ProbeBui, "↑ phai quay lai ham tren CUNG COT (frm203050.cs:159)");
        trace.Step("↑/↓ nhay dung ±16");

        // → ở ô CUỐI vòng về ô ĐẦU; ← ở ô ĐẦU vòng về ô CUỐI (:161-168).
        StepEditDialog.FocusCell(Dialog, StepEditDialog.BuiCount);
        Uia.SendKey(Vk.Right);
        AssertFocus(1, "→ o o CUOI phai vong ve o DAU (frm203050.cs:162)");

        Uia.SendKey(Vk.Left);
        AssertFocus(StepEditDialog.BuiCount, "← o o DAU phai vong ve o CUOI (frm203050.cs:166)");
        trace.Step("→/← vong lai o hai dau");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc5 — TC-STEP-VALID-1 (ghi nhận hành vi, xem README §5)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("Tc5 — giá trị > 30000 thì KHÔNG được đổi dữ liệu sang 種別 khác")]
    public void Tc5_OverMaxBlocksKindChange()
    {
        using var trace = TestTrace.Begin();

        var kindBefore = StepEditDialog.SelectedKind(Dialog);
        var rowBefore = StepEditDialog.VisibleRow(Dialog);

        StepEditDialog.SetCell(Dialog, ProbeBui, StepEditDialog.ValueMax + 1);
        trace.Step($"go {StepEditDialog.ValueMax + 1} (qua nguong) vao 部位 {ProbeBui}");

        // WinForm chặn ở BA lớp (xem chú thích đầu StepEditDialog):
        //   · txtEpp_Leave (:179) kéo focus về ngay khi rời ô — KHÔNG có thông báo;
        //   · saveData (:259) mới bung E00100.
        // Tuỳ lớp nào bắt được trước mà kết quả nhìn thấy khác nhau, nên testcase ghi
        // nhận cả hai đường và chỉ khẳng định thứ BẤT BIẾN: dspData KHÔNG chạy, tức là
        // 32 ô vẫn là dữ liệu của 種別 cũ.
        var changed = StepEditDialog.TrySelectKind(Dialog, OtherKindIndex);
        var alert = InpP1MenuFlow.ReadAndDismissError(App, Dialog, TimeSpan.FromSeconds(5));

        LogKq(3, $"doi 種別 khi o sai: thao tac {(changed ? "chay xong" : "bi chan giua chung")}; " +
            $"hop canh bao = {(alert is null ? "KHONG CO" : $"「{alert}」")}");
        trace.Note($"kindBefore=「{kindBefore}」 kindAfter=「{StepEditDialog.SelectedKind(Dialog)}」");

        if (alert is not null)
        {
            Assert.That(Txt.Has(alert, "STEPの値が正しくありません。"), Is.True,
                $"thieu cau dau cua E00100 (frm203050.cs:261). Nhan duoc: 「{alert}」");
            Assert.That(Txt.Has(alert, $"{StepEditDialog.ValueMax}以下の値を入力して下さい。"), Is.True,
                $"thieu nguong trong thong bao. Nhan duoc: 「{alert}」");
        }
        else
        {
            LogKq(3, "KHONG co E00100 — nghia la txtEpp_Leave (frm203050.cs:179) da keo focus ve " +
                "TRUOC khi cboKind kip doi. Ban web KHONG co lop chan nay; xem README muc 5.");
        }

        // Bất biến: dữ liệu trên màn vẫn là của 種別 cũ (trừ đúng ô vừa gõ sai).
        var rowAfter = StepEditDialog.VisibleRow(Dialog);
        for (var bui = 1; bui <= StepEditDialog.BuiCount; bui++)
        {
            if (bui == ProbeBui) continue;
            Assert.That(rowAfter[bui - 1], Is.EqualTo(rowBefore[bui - 1]),
                $"部位 {bui} da doi gia tri — nghia la dspData DA chay du saveData that bai " +
                "(frm203050.cs:136-140 chi goi dspData khi saveData tra true).");
        }
        trace.Step("32 o van la du lieu 種別 cu");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc6 — TC-STEP-VALID-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("Tc6 — giá trị > 30000 thì F9 báo E00100 và KHÔNG đóng dialog")]
    public void Tc6_OverMaxBlocksSave()
    {
        using var trace = TestTrace.Begin();

        // Ô vẫn mang giá trị sai từ Tc5. Bấm F9 bằng PHÍM: KeyPreview đưa thẳng tới
        // btnF9_Click nên không phải rời focus khỏi ô — tránh hẳn lớp txtEpp_Leave.
        Assert.That(StepEditDialog.CellValue(Dialog, ProbeBui), Is.GreaterThan(StepEditDialog.ValueMax),
            "Tc5 le ra de lai gia tri sai o o thu — chay ca file, dung chay le mot testcase.");

        StepEditDialog.PressF9(Dialog);
        var alert = InpP1MenuFlow.ReadAndDismissError(App, Dialog, TimeSpan.FromSeconds(15));
        trace.Note($"hop canh bao sau F9: {(alert is null ? "KHONG CO" : $"「{alert}」")}");

        Assert.That(alert, Is.Not.Null,
            "F9 voi gia tri > 30000 phai bung E00100 (frm203050.cs:121 → saveData :259). " +
            "Khong co hop nao nghia la validate khong chay.");
        Assert.That(Txt.Has(alert, "STEPの値が正しくありません。"), Is.True,
            $"thieu cau dau cua E00100. Nhan duoc: 「{alert}」");
        Assert.That(Txt.Has(alert, $"{StepEditDialog.ValueMax}以下の値を入力して下さい。"), Is.True,
            $"thieu nguong trong thong bao. Nhan duoc: 「{alert}」");

        Assert.That(App.Window(StepEditDialog.DialogId), Is.Not.Null,
            "luu hong ma dong dialog thi mat het chinh sua — updateProc chi Close() khi " +
            "saveData VA updateProc deu thanh cong (frm203050.cs:121-123).");

        // Focus phải quay về ĐÚNG ô sai (:262).
        var focused = StepEditDialog.FocusedCellNumber(Dialog);
        trace.Note($"o dang focus sau E00100: {(focused?.ToString() ?? "khong o nao")}");
        Assert.That(focused, Is.EqualTo(ProbeBui),
            $"phai focus lai dung o sai (txtEpp{ProbeBui}) — frm203050.cs:262.");

        // Trả ô về giá trị hợp lệ cho các testcase sau.
        StepEditDialog.SetCell(Dialog, ProbeBui, ProbeValue);
        trace.Step($"tra o ve gia tri hop le {ProbeValue}");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc7 — TC-STEP-CLOSE-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(7)]
    [Description("Tc7 — F10 戻る không lưu; mở lại thì bỏ hết chỉnh sửa dở")]
    public void Tc7_BackDiscardsEdits()
    {
        using var trace = TestTrace.Begin();

        var seeded = _probeBefore
            ?? throw new InvalidOperationException("Tc1 chua chot duoc gia tri goc cua o thu.");

        // Ô đang mang ProbeValue (Tc6 vừa đặt lại). F10 戻る = btnF10_Click → this.Close()
        // (BaseDialog.cs:347-350), KHÔNG đụng gì tới DB.
        Assert.That(StepEditDialog.CellValue(Dialog, ProbeBui), Is.EqualTo(ProbeValue),
            "trang thai vao Tc7 khong nhu mong doi — chay ca file theo thu tu.");

        StepEditDialog.Close(App, Dialog, trace);
        _dialog = null;

        if (InpDb is not null)
        {
            var afterClose = InpDb.ReadTrtStateCell(PatNo, ProbeKind, ProbeBui);
            Assert.That(afterClose, Is.EqualTo(seeded),
                $"F10 戻る ma TRTSTATE doi tu {seeded} thanh {afterClose} — 戻る khong duoc ghi gi.");
        }

        _dialog = StepEditDialog.Open(App, Screen.Window, trace);
        Assert.That(StepEditDialog.CellValue(_dialog, ProbeBui), Is.EqualTo(seeded),
            "mo lai phai nap lai tu TRTSTATE (initProc chay moi lan Shown), khong giu chinh sua do.");
        trace.Step("mo lai: o thu ve gia tri goc");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc8 — TC-STEP-SAVE-1 + TC-STEP-SAVE-2 (GHI THẬT)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(8)]
    [Description("Tc8 — F9 確定 ghi CẢ 15×32 vào TRTSTATE, ô để trống ghi 0 (inpP1.allowSave)")]
    public void Tc8_SaveWritesTrtState()
    {
        RequireAllowSave($"ghi that TRTSTATE cua benh nhan {PatNo}");
        var db = RequireInpDb("can doc lai TRTSTATE de biet F9 co ghi that khong");

        using var trace = TestTrace.Begin();

        var before = db.ReadTrtStateRow(PatNo, ProbeKind)
            ?? throw new InvalidOperationException($"benh nhan {PatNo} khong co dong TRTSTATE.");
        var probeBefore = before[ProbeBui - 1];
        var blankBefore = before[BlankBui - 1];
        LogKq(2, $"truoc khi ghi: bui{ProbeKind}_{ProbeBui} = {probeBefore}, " +
            $"bui{ProbeKind}_{BlankBui} = {blankBefore}");

        try
        {
            StepEditDialog.SetCell(Dialog, ProbeBui, ProbeValue);

            // Ô để TRỐNG phải đi xuống DB thành 0: saveData dùng
            // EditControl.editStringToInt (chuỗi rỗng → 0) rồi updateProc UPDATE cả 15×32
            // (frm203050.cs:268, :281-298). Đây đúng là điều bản web phải làm khi gửi PUT —
            // bỏ ô đó khỏi payload thì giá trị cũ nằm lại trong DB.
            Uia.Clear(StepEditDialog.Cell(Dialog, BlankBui));
            trace.Step($"o {BlankBui} de trong, o {ProbeBui} = {ProbeValue}");

            StepEditDialog.PressF9(Dialog);
            var alert = InpP1MenuFlow.ReadAndDismissError(App, Dialog, TimeSpan.FromSeconds(5));
            Assert.That(alert, Is.Null,
                $"F9 voi du lieu hop le ma van bung canh bao: 「{alert}」 " +
                "(E00026 nghia la transaction cua updateProc rollback — frm203050.cs:316).");

            Waits.Until(() => App.Window(StepEditDialog.DialogId) is null,
                        "dialog dong lai sau khi F9 確定 thanh cong",
                        Settings.Run.DefaultTimeout);
            _dialog = null;
            trace.Step("F9 確定 xong, dialog dong");

            var after = db.ReadTrtStateRow(PatNo, ProbeKind)
                ?? throw new InvalidOperationException("mat dong TRTSTATE sau khi ghi.");
            Assert.That(after[ProbeBui - 1], Is.EqualTo(ProbeValue),
                $"bui{ProbeKind}_{ProbeBui} phai bang {ProbeValue} sau khi F9 — " +
                "updateProc (frm203050.cs:276-321) khong toi duoc bang.");
            Assert.That(after[BlankBui - 1], Is.EqualTo(0),
                $"o de trong phai ghi 0 vao bui{ProbeKind}_{BlankBui} " +
                "(editStringToInt: chuoi rong → 0). Ban web bo o do khoi payload la sai.");

            // Mở lại: initProc đọc lại DB nên phải thấy giá trị vừa ghi.
            _dialog = StepEditDialog.Open(App, Screen.Window, trace);
            Assert.That(StepEditDialog.CellValue(_dialog, ProbeBui), Is.EqualTo(ProbeValue),
                "luu xong mo lai phai thay gia tri vua ghi.");
            trace.Step("mo lai: thay gia tri vua ghi");
        }
        finally
        {
            RestoreProbeCells(db, probeBefore, blankBefore);
        }
    }

    /// <summary>
    /// Trả hai ô thử về giá trị gốc bằng chính giao diện (F9), rồi xác nhận trên DB.
    /// Không sửa DB trực tiếp: <see cref="InpP1Db"/> là lớp CHỈ ĐỌC, và ghi tay thì
    /// test không còn chứng minh được đường ghi của app.
    /// </summary>
    private void RestoreProbeCells(InpP1Db db, int probeBefore, int blankBefore)
    {
        try
        {
            var dialog = App.Window(StepEditDialog.DialogId)
                         ?? StepEditDialog.Open(App, Screen.Window);
            StepEditDialog.SetCell(dialog, ProbeBui, probeBefore);
            StepEditDialog.SetCell(dialog, BlankBui, blankBefore);
            StepEditDialog.PressF9(dialog);
            InpP1MenuFlow.ReadAndDismissError(App, dialog, TimeSpan.FromSeconds(3));
            Waits.TryUntil(() => App.Window(StepEditDialog.DialogId) is null, Settings.Run.DefaultTimeout);
            _dialog = null;

            var now = db.ReadTrtStateRow(PatNo, ProbeKind);
            if (now is not null && now[ProbeBui - 1] == probeBefore && now[BlankBui - 1] == blankBefore)
            {
                Log("da tra TRTSTATE ve gia tri goc.");
                return;
            }

            Log($"CANH BAO — chua tra duoc TRTSTATE ve goc. " +
                $"bui{ProbeKind}_{ProbeBui}: hien {now?[ProbeBui - 1]}, goc {probeBefore}; " +
                $"bui{ProbeKind}_{BlankBui}: hien {now?[BlankBui - 1]}, goc {blankBefore}. " +
                "KHOI PHUC THU CONG.");
        }
        catch (Exception e)
        {
            Log($"CANH BAO — khoi phuc TRTSTATE that bai: {e.Message}. " +
                $"Gia tri goc: bui{ProbeKind}_{ProbeBui} = {probeBefore}, " +
                $"bui{ProbeKind}_{BlankBui} = {blankBefore}. KHOI PHUC THU CONG.");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    private void AssertFocus(int expectedCell, string because)
    {
        // Tiêu điểm chuyển trong sự kiện KeyDown của app nên có độ trễ — chờ có điều kiện
        // rồi mới đọc, đừng Thread.Sleep một con số phỏng đoán.
        Waits.TryUntil(() => StepEditDialog.FocusedCellNumber(Dialog) == expectedCell,
                       TimeSpan.FromSeconds(3));
        var actual = StepEditDialog.FocusedCellNumber(Dialog);
        Assert.That(actual, Is.EqualTo(expectedCell),
            $"{because} — dang focus o {(actual?.ToString() ?? "khong xac dinh")}, " +
            $"cho doi txtEpp{expectedCell}.");
    }

    /// <summary>Số đứng đầu nhãn 「 1-Ｃ関連」 → 1. Không có số → null.</summary>
    private static int? LeadingNumber(string label)
    {
        var digits = new string(Txt.N(label).TakeWhile(char.IsDigit).ToArray());
        return digits.Length == 0 ? null : int.Parse(digits);
    }
}
