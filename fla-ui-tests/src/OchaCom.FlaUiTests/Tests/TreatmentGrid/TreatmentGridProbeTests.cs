using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentGrid;

/// <summary>
/// <b>PROBE</b> cho lưới 処置 — dò hành vi, KHÔNG assert.
///
/// <para>Đọc <c>fla-ui-tests/PROBE-GUIDELINE.md</c> trước. Đây là hiện thân của luật
/// số một ở đó: chưa biết app hành xử ra sao thì <b>chụp màn hình → đọc ảnh → rồi mới
/// viết assert</b>. Fixture này KHÔNG BAO GIỜ ném và KHÔNG BAO GIỜ assert — mỗi bước
/// đều bắt hết ngoại lệ, ghi lại rồi đi tiếp, để MỘT lần chạy ra đủ bức tranh.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// SÁU CÂU HỎI NÓ TRẢ LỜI
/// ═══════════════════════════════════════════════════════════════════════════
///  P1  Đóng editor CÁCH NÀO mà không đóng luôn màn hình? (click sang ô khác?)
///  P2  ESC thật sự làm gì — có đúng là 戻る + 「保存しますか？」 không?
///  P3  Tab làm gì khi KHÔNG có hộp thoại chắn?
///  P4  Ô 点 có lọc ký tự không — gõ 「9a8」 ra gì?
///  P5  Insert chèn dòng ở đâu, lưới/合計 đổi thế nào?
///  P6  Delete xoá dòng nào, có hỏi gì không, 合計 đổi thế nào?
///
/// <para>Mỗi câu in ra các dòng <c>=== KQ-n ===</c> và chụp ảnh riêng. Chạy xong lấy
/// TOÀN BỘ dòng KQ + thư mục ảnh của testcase này ra đọc.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// AN TOÀN
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG bấm F9 登録. Nếu gặp 「処置データは、変更されています。保存しますか？」 thì luôn
/// trả lời <b>キャンセル</b> — đó là nhánh DUY NHẤT ở lại màn hình mà không ghi gì
/// (「はい」 = ghi DB, 「いいえ」 = bỏ thay đổi NHƯNG VẪN đóng màn hình,
/// modSave.cs:100-132).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-edit-treatment-rows.ps1 -Case Probe
/// </summary>
[TestFixture]
[Category("treatment-grid")]
[Explicit]
public sealed class TreatmentGridProbeTests : UiTestBase
{
    /// <summary>Winuser.h VK_F10 = 0x79 — phím đóng của mọi dialog nghiệp vụ (戻る).</summary>
    private const ushort VK_F10 = 0x79;
    /// <summary>Winuser.h VK_ESCAPE = 0x1B.</summary>
    private const ushort VK_ESCAPE = 0x1B;

    private TreatmentGridOps _grid = null!;
    private TestTrace _trace = null!;

    private int SimpleTrtCd => Settings.Parity.SimpleTrtCd;

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp() => _grid = new TreatmentGridOps(Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); }
        catch { /* không có console */ }
    }

    private static void LogKq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>Ảnh chụp trạng thái hiện tại của lưới, gọn trong một dòng.</summary>
    private string State()
    {
        try
        {
            // ModalDialogs.All chứ KHÔNG phải Dialogs.Open: Dialogs.Open lọc theo
            // ClassName == "#32770" nên BỎ SÓT hộp thoại 「保存しますか」 của MsgBox VB —
            // đã vấp thật 2026-08-25 (focus ra 「Yes」 mà 「hộp thoại=(không)」).
            var dialogs = RealDialogs()
                .Select(d => "「" + Txt.N(Dialogs.TextOf(d)).Replace("\n", " ") + "」")
                .ToList();
            return $"focus=「{_grid.FocusedCellName()}」 editing={_grid.IsEditing()} " +
                   $"dòng={_grid.RowCount()} 合計={_grid.AllPointValue()} " +
                   $"hộp thoại={(dialogs.Count == 0 ? "(không)" : string.Join(" + ", dialogs))}";
        }
        catch (Exception e) { return $"(không đọc được trạng thái: {e.Message})"; }
    }


    /// <summary>
    /// Hộp thoại THẬT — phải có ít nhất một nút bấm được.
    ///
    /// <para><see cref="ModalDialogs.All"/> quét rộng nên kéo về cả những cửa sổ con
    /// không phải hộp thoại. Đã vấp thật 2026-08-25: một cửa sổ tên 「item2」 (ToolStrip
    /// của app) bị nhận nhầm, <c>ClearDialogs</c> thử bấm 「いいえ」 5 lần đều trượt, và
    /// mọi phép đo từ đó về sau đều vô nghĩa vì probe tưởng đang có hộp thoại chắn.</para>
    /// </summary>
    private IReadOnlyList<FlaUI.Core.AutomationElements.Window> RealDialogs()
    {
        var result = new List<FlaUI.Core.AutomationElements.Window>();
        foreach (var d in ModalDialogs.All(App, Screen.Window))
        {
            try
            {
                var buttons = d.FindAllDescendants(cf =>
                    cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button));
                if (buttons.Length > 0) result.Add(d);
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return result;
    }

    /// <summary>
    /// Rời khỏi editor mà KHÔNG đóng màn hình.
    ///
    /// <para>P1 đã đo: click sang MỘT Ô KHÁC là cách duy nhất an toàn — ESC là 戻る
    /// (P2), còn click lại CHÍNH ô đang đứng thì DataGridView hiểu là "click lần hai"
    /// và MỞ editor thay vì đóng. Vì thế luôn click sang cột khác cột đang đứng.</para>
    /// </summary>
    private void LeaveEditor(RegiRow row, int awayFromColumn)
    {
        var target = awayFromColumn == RegiGrid.Col.Ryo ? RegiGrid.Col.Day : RegiGrid.Col.Ryo;
        try { _grid.FocusCell(row, target); } catch { /* probe không được ném */ }
    }

    /// <summary>Chạy một bước, KHÔNG BAO GIỜ ném — ghi lại rồi đi tiếp.</summary>
    private void Probe(string tag, string what, Action action)
    {
        LogKq(tag, $"── {what}");
        LogKq(tag, "   trước: " + State());
        try
        {
            action();
            Waits.Step();
        }
        catch (Exception e)
        {
            LogKq(tag, $"   NÉM: {e.GetType().Name}: {e.Message}");
        }
        LogKq(tag, "   sau  : " + State());
        try { _trace.Shot($"{tag}-{what}"); } catch { /* ảnh hỏng không được làm hỏng probe */ }
    }

    /// <summary>
    /// Dẹp hộp thoại đang mở. Với câu 「保存しますか？」 luôn bấm キャンセル để Ở LẠI màn
    /// hình; câu khác thì いいえ/No/OK.
    /// </summary>
    private void ClearDialogs(string tag)
    {
        for (var i = 0; i < 5; i++)
        {
            var open = RealDialogs();
            if (open.Count == 0) return;

            foreach (var d in open)
            {
                var text = Txt.N(Dialogs.TextOf(d)).Replace("\n", " ");
                var isSave = Txt.Has(text, "保存しますか");
                var button = isSave ? "キャンセル" : "いいえ";
                var ok = isSave
                    ? Dialogs.ClickButton(d, "キャンセル", "Cancel")
                    : Dialogs.ClickButton(d, "いいえ", "No", "OK", "N");

                // Dialog nghiệp vụ (部位選択, 処置選択…) KHÔNG có nút はい/いいえ — chúng
                // đóng bằng F10 戻る. Đã vấp thật 2026-08-25: 部位選択 kẹt lại, ClearDialogs
                // thử 「いいえ」 5 lần đều trượt, và mọi phép đo sau đó đều vô nghĩa.
                if (!ok)
                {
                    ok = Dialogs.ClickButton(d, "戻る", "F10 戻る", "閉じる", "キャンセル", "Cancel");
                    if (!ok)
                    {
                        try { d.Focus(); } catch { }
                        Uia.SendKey(VK_F10);
                        Thread.Sleep(500);
                        ok = RealDialogs().Count == 0;
                        if (!ok) { Uia.SendKey(VK_ESCAPE); Thread.Sleep(500); ok = RealDialogs().Count == 0; }
                    }
                }
                LogKq(tag, $"   dẹp hộp thoại 「{text}」 bằng 「{button}」 → {(ok ? "ok" : "KHÔNG bấm được")}");
            }
            Waits.TryUntil(() => RealDialogs().Count == 0, TimeSpan.FromSeconds(3));
        }
    }

    [Test]
    [Description("Probe — dò hành vi phím trên lưới 処置; KHÔNG assert, chỉ ghi log + ảnh")]
    public void Probe_GridKeyBehaviour()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        LogKq("0", "trạng thái mở màn: " + State());
        trace.Shot("00-mo-man");

        // ── Tiền đề: có một dòng 処置 để đứng lên ────────────────────────────────
        RegiRow? row = null;
        try
        {
            var kobetu = Screen.Kobetu.Open();
            kobetu.ResetSearchBoxes();
            var found = kobetu.SearchByCode(SimpleTrtCd);
            var pick = found.FirstOrDefault(r => Txt.Int(r.At(KobetuTab.Col.Code)) == SimpleTrtCd);
            if (pick is null)
            {
                LogKq("0", $"KHÔNG tìm được 処置 {SimpleTrtCd} ở tab 個別 — dừng probe");
                Assert.Pass("xem log");
                return;
            }

            var name = pick.At(KobetuTab.Col.Name);
            LogKq("0", $"処置 đem test: {SimpleTrtCd} 「{name}」");

            var before = _grid.AllPointValue();
            kobetu.SelectRow(pick);
            LogKq("0", "sau khi chọn dòng 個別: " + State());

            // Chốt 回数 — chỗ WinForm tính lại 合計 (frm203002.cs:5779-5783).
            _grid.Press(VirtualKeyShort.RETURN);
            Waits.TryUntil(() => _grid.AllPointValue() > before, TimeSpan.FromSeconds(10));
            LogKq("0", $"sau khi Enter chốt 回数: 合計 {before} → {_grid.AllPointValue()}");
            ClearDialogs("0");

            row = _grid.LastRowMatching(name);
            LogKq("0", row is null ? "KHÔNG đọc lại được dòng vừa chèn" : $"dòng test: {row}");
            trace.Shot("01-da-chen-xong");
        }
        catch (Exception e)
        {
            LogKq("0", $"dựng tiền đề hỏng: {e.GetType().Name}: {e.Message}");
        }

        if (row is null)
        {
            LogKq("0", "không có dòng test ⇒ dừng, xem ảnh 01 để biết màn hình đang ra sao");
            Assert.Pass("xem log");
            return;
        }

        // ── P1: đóng editor bằng cách CLICK SANG Ô KHÁC ─────────────────────────
        LogKq("1", "CÂU HỎI: đóng editor cách nào mà KHÔNG đóng màn hình?");
        Probe("1", "dat con tro o o 回", () => _grid.FocusCell(row, RegiGrid.Col.Kai));
        Probe("1", "Enter (mo editor)", () => _grid.Press(VirtualKeyShort.RETURN));
        Probe("1", "click sang o 点 cung dong", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        LogKq("1", "KẾT LUẬN cần đọc ở dòng 「sau」 ngay trên: editing phải = False và " +
                   "hộp thoại phải = (không). Nếu vậy thì CLICK SANG Ô KHÁC là cách dọn editor.");
        LeaveEditor(row, RegiGrid.Col.Ten);
        ClearDialogs("1");

        // ── P3: Tab ─────────────────────────────────────────────────────────────
        LogKq("3", "CÂU HỎI: Tab dời con trỏ hay bị nuốt?");
        // PHẢI ở trạng thái KHÔNG edit: grdRegi_KeyDown (nơi Tab bị nuốt) chỉ chạy khi
        // LƯỚI giữ phím. Đang mở editor thì phím vào TextBox con và đi đường khác hẳn
        // (grdRegi_TextBox_PreviewKeyDown) — đo lúc đó là đo nhầm hàm.
        Probe("3", "dat con tro o o 点", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        Probe("3", "roi editor neu dang mo", () => LeaveEditor(row, RegiGrid.Col.Ten));
        Probe("3", "dat lai con tro o o 点 (KHONG dang edit)", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        Probe("3", "Tab", () => _grid.Press(VirtualKeyShort.TAB));
        LogKq("3", "KẾT LUẬN: so hai chuỗi focus 「trước」/「sau」. Giống nhau = bị nuốt " +
                   "(đúng frm203002.cs:3566-3569). Ra 「Yes」/「No」 = có hộp thoại chắn, phép đo hỏng.");
        LeaveEditor(row, RegiGrid.Col.Ten);
        ClearDialogs("3");

        // ── P4: bộ lọc ký tự ô 点 ───────────────────────────────────────────────
        LogKq("4", "CÂU HỎI: ô 点 có chặn chữ cái không?");
        Probe("4", "dat con tro o o 点", () => _grid.FocusCell(row, RegiGrid.Col.Ten));
        Probe("4", "Enter (mo editor)", () => _grid.Press(VirtualKeyShort.RETURN));
        Probe("4", "go 「9a8」", () => _grid.Type("9a8"));
        LogKq("4", $"NỘI DUNG EDITOR sau khi gõ 「9a8」: 「{_grid.EditorText()}」 " +
                   "— ra 「98」 nghĩa là chữ 「a」 bị nuốt (frm203002.cs:3601-3639).");
        trace.Shot("04-o-ten-sau-khi-go");
        // Dọn bằng cách click sang ô khác (KHÔNG dùng ESC — xem P2).
        Probe("4", "click sang o 療法 de roi o", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));
        LeaveEditor(row, RegiGrid.Col.Ryo);
        ClearDialogs("4");
        LogKq("4", $"ô 点 sau khi rời: 「{_grid.LastRowMatching(row.Ryo)?.Ten}」 " +
                   "— đổi so với trước nghĩa là rời ô = CHỐT giá trị, không phải huỷ.");

        // ── P5: Insert ──────────────────────────────────────────────────────────
        LogKq("5", "CÂU HỎI: Insert chèn dòng ở đâu?");
        Probe("5", "dat con tro o o 療法", () => _grid.FocusCell(row, RegiGrid.Col.Ryo));
        Probe("5", "Insert", () => _grid.Press(VirtualKeyShort.INSERT));
        LogKq("5", "KẾT LUẬN: so 「dòng=」 trước/sau. Lưu ý số dòng đọc được PHỤ THUỘC VỊ TRÍ " +
                   "CUỘN (PROBE-GUIDELINE mục 3.1) nên chỉ tham khảo — ẢNH mới là bằng chứng.");
        trace.Shot("05-sau-insert");
        LeaveEditor(row, RegiGrid.Col.Ryo);
        ClearDialogs("5");

        // ── P6: Delete ──────────────────────────────────────────────────────────
        LogKq("6", "CÂU HỎI: Delete xoá dòng nào, có hỏi gì không?");
        Probe("6", "Delete (tren dong vua Insert)", () => _grid.Press(VirtualKeyShort.DELETE));
        LogKq("6", "KẾT LUẬN: xem 「hộp thoại=」. Có 「同一部位の処置を全て削除」 nghĩa là con trỏ " +
                   "đang đứng trên 部位病名行 (linekbn 1). 合計 giảm = đã xoá một dòng có điểm.");
        trace.Shot("06-sau-delete");
        LeaveEditor(row, RegiGrid.Col.Ryo);
        ClearDialogs("6");

        // ── P2: ESC thật sự làm gì ──────────────────────────────────────────────
        LogKq("2", "CÂU HỎI: ESC = huỷ editor hay = 戻る (đóng màn hình)?");
        Probe("2", "dat con tro o o 回", () => _grid.FocusCell(row, RegiGrid.Col.Kai));
        Probe("2", "Enter (mo editor)", () => _grid.Press(VirtualKeyShort.RETURN));
        Probe("2", "ESC", () => _grid.Press(VirtualKeyShort.ESCAPE));
        LogKq("2", "KẾT LUẬN: nếu 「sau」 có hộp thoại 「保存しますか」 ⇒ ESC là 戻る, " +
                   "TUYỆT ĐỐI không dùng ESC để dọn editor.");
        ClearDialogs("2");
        LogKq("2", "sau khi bấm キャンセル: " + State());
        trace.Shot("02-sau-esc");

        LogKq("2", $"màn hình 診療入力 còn sống sau ESC? {TreatmentScreenAlive()} " +
                   "(false = ESC đã đóng hẳn màn hình — chính là câu trả lời cho P2)");


        LogKq("9", "TRẠNG THÁI CUỐI: " + State());
        LogKq("9", "Gửi lại: mọi dòng 「=== KQ-」 ở trên + thư mục ảnh của testcase này.");
        Assert.Pass("probe xong — xem log + ảnh, KHÔNG có assert nào ở đây");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROBE NÂNG CAO — luật từ chối của DeleteRow/AddRow, điều hướng, dialog
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Mở các CỘT ẨN của lưới (linekbn, trt_cd, trt_dt…) bằng lối tắt có sẵn của app.
    ///
    /// <para>frm203002.cs:2646-2660 + :2718 — phải đi ĐÚNG hai bước:
    /// click nhãn 患者番号 (<c>customLabel1</c>) để bật <c>mbolHideClickFlg</c>, RỒI
    /// double-click nhãn 氏名 (<c>customLabel3</c>). Chỉ double-click không thôi thì
    /// nhánh <c>if (mbolHideClickFlg == false)</c> ép <c>mbolHideRowFlg = false</c> và
    /// cột ẩn không bao giờ hiện.</para>
    ///
    /// <para>Đáng giá vì <c>linekbn</c> (cột 51) là thứ quyết định MỌI luật của lưới —
    /// 1 = 部位病名行, 2 = 処置行, 10..15 = 負担金/日計行, 30 = 介護, 99 = 履歴(当月外) —
    /// mà bình thường UI không đọc được.</para>
    /// </summary>
    private bool TryRevealHiddenColumns()
    {
        try
        {
            var patNoLabel = Uia.ById(Screen.Window, "customLabel1");
            var nameLabel = Uia.ById(Screen.Window, "customLabel3");
            if (patNoLabel is null || nameLabel is null)
            {
                LogKq("A", $"không thấy nhãn customLabel1={patNoLabel is not null} " +
                           $"customLabel3={nameLabel is not null} ⇒ bỏ qua bước mở cột ẩn");
                return false;
            }

            var (px, py) = Uia.Center(patNoLabel);
            Uia.LeftClickPhysical(px, py);
            Thread.Sleep(300);

            var (nx, ny) = Uia.Center(nameLabel);
            Uia.LeftClickPhysical(nx, ny);
            Thread.Sleep(80);
            Uia.LeftClickPhysical(nx, ny);
            Thread.Sleep(800);

            var cols = _grid.Headers().Count;
            LogKq("A", $"sau khi mở cột ẩn: đọc được {cols} cột (5 = chưa mở được)");
            return cols > 5;
        }
        catch (Exception e)
        {
            LogKq("A", $"mở cột ẩn lỗi: {e.GetType().Name}: {e.Message}");
            return false;
        }
    }

    /// <summary>
    /// 部位病名行 (linekbn = "1") — nhận ra qua ô 点 là dấu gạch ngang.
    ///
    /// <para>⚠️ WinForm ghi 「－」 (U+FF0D, ĐỦ chiều rộng) nhưng <c>Txt.N</c> chuẩn hoá
    /// NFKC nên tới đây nó đã thành 「-」 nửa chiều rộng. So với 「－」 là KHÔNG BAO GIỜ
    /// khớp — đã vấp thật 2026-08-25: probe báo 「lưới không có dòng nào 点 = 「－」」
    /// trong khi dòng [0] chính là 部位病名行.</para>
    /// </summary>
    private static bool IsBuiRow(RegiRow r) => Txt.N(r.Ten) is "-" or "－";

    /// <summary>Một dòng lưới kèm phán đoán loại dòng, đọc từ nội dung nhìn thấy được.</summary>
    private string Describe(RegiRow r)
    {
        var kind =
            Txt.Has(r.Ryo, "日計") || Txt.Has(r.Ryo, "負担金") ? "日計/負担金" :
            IsBuiRow(r) ? "部位病名行" :
            r.Ryo.Length == 0 ? "trống" : "処置行";
        return $"[{r.Index,2}] 日={r.Day,-3} 点={r.Ten,-5} 回={r.Kai,-3} {kind,-14} 「{r.Ryo}」";
    }

    [Test]
    [Description("Probe nâng cao — luật từ chối Delete/Insert, điều hướng mũi tên, dialog từ lưới")]
    public void Probe_AdvancedGridRules()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        LogKq("A", "trạng thái mở màn: " + State());

        // ── P-A: kiểm kê lưới ────────────────────────────────────────────────
        var revealed = TryRevealHiddenColumns();
        LogKq("A", $"đọc được cột ẩn: {revealed}");
        if (revealed)
        {
            var hdr = _grid.Headers();
            LogKq("A", "tiêu đề đầy đủ: " + string.Join(" | ", hdr.Take(20)));
        }

        var rows = _grid.Snapshot();
        LogKq("A", $"KIỂM KÊ {rows.Count} dòng:");
        foreach (var r in rows) Log("        " + Describe(r));
        trace.Shot("A-kiem-ke");

        // Nếu mở được cột ẩn thì đóng lại — các phép đo sau giả định 5 cột.
        if (revealed) { TryRevealHiddenColumns(); LogKq("A", "đã đóng cột ẩn lại"); }

        // ── P-B: Delete trên 日計行 ──────────────────────────────────────────
        LogKq("B", "CÂU HỎI: Delete trên 日計行 có bị từ chối không? (frm203002.cs:3843-3846)");
        var nikkei = _grid.Snapshot().FirstOrDefault(r => Txt.Has(r.Ryo, "日計"));
        if (nikkei is null) LogKq("B", "lưới không có 日計行 ⇒ bỏ qua");
        else
        {
            var n0 = _grid.RowCount(); var p0 = _grid.AllPointValue();
            Probe("B", "dat con tro vao 日計行 roi Delete", () =>
            {
                _grid.FocusCell(nikkei, RegiGrid.Col.Ryo);
                _grid.Press(VirtualKeyShort.DELETE);
            });
            LogKq("B", $"số dòng {n0} → {_grid.RowCount()}, 合計 {p0} → {_grid.AllPointValue()} " +
                       "(KHÔNG đổi = đã từ chối, đúng WinForm)");
            ClearDialogs("B");
        }

        // ── P-C: Delete trên 部位病名行 ─────────────────────────────────────
        LogKq("C", "CÂU HỎI: Delete trên 部位病名行 có hỏi 「同一部位の処置を全て削除」 và xoá cả cụm?");
        var bui = _grid.Snapshot().FirstOrDefault(IsBuiRow);
        if (bui is null) LogKq("C", "lưới không có dòng nào 点 = 「－」 ⇒ bỏ qua");
        else
        {
            LogKq("C", "dòng 部位 đem thử: " + Describe(bui));
            var n0 = _grid.RowCount(); var p0 = _grid.AllPointValue();
            Probe("C", "dat con tro vao dong 部位 roi Delete", () =>
            {
                _grid.FocusCell(bui, RegiGrid.Col.Ryo);
                _grid.Press(VirtualKeyShort.DELETE);
            });
            var dlg = RealDialogs();
            LogKq("C", dlg.Count == 0
                ? "KHÔNG có hộp thoại nào bung ra"
                : "hộp thoại: 「" + Txt.N(Dialogs.TextOf(dlg[0])).Replace("\n", " ") + "」");
            // Trả lời いいえ để KHÔNG xoá — probe không được phá lưới của bước sau.
            ClearDialogs("C");
            LogKq("C", $"sau khi trả lời 「いいえ」: số dòng {n0} → {_grid.RowCount()}, " +
                       $"合計 {p0} → {_grid.AllPointValue()} (không đổi = huỷ đúng)");
        }

        // ── P-D: Insert trên 日計行 ─────────────────────────────────────────
        LogKq("D", "CÂU HỎI: Insert trên 日計行 làm gì?");
        var nikkei2 = _grid.Snapshot().FirstOrDefault(r => Txt.Has(r.Ryo, "日計"));
        if (nikkei2 is not null)
        {
            var n0 = _grid.RowCount();
            Probe("D", "dat con tro vao 日計行 roi Insert", () =>
            {
                _grid.FocusCell(nikkei2, RegiGrid.Col.Ryo);
                _grid.Press(VirtualKeyShort.INSERT);
            });
            LogKq("D", $"số dòng {n0} → {_grid.RowCount()}");
            ClearDialogs("D");
        }

        // ── P-G: → trên ô 日 ────────────────────────────────────────────────
        LogKq("G", "CÂU HỎI: → từ ô 日 nhảy sang cột nào? (Move_Cell :5877 nói nhảy thẳng sang 点)");
        var trt3 = _grid.Snapshot().FirstOrDefault(r => !IsBuiRow(r) && r.Day.Length > 0 && r.Ryo.Length > 0);
        if (trt3 is not null)
        {
            Probe("G", "dat con tro vao o 日 roi bam mui ten phai", () =>
            {
                _grid.FocusCell(trt3, RegiGrid.Col.Day);
                _grid.Press(VirtualKeyShort.RIGHT);
            });
            LogKq("G", $"ô đang giữ con trỏ: 「{_grid.FocusedCellName()}」 " +
                       "(mong đợi 「点 …」 nếu Move_Cell nhảy 0→3; ra 「部位 …」 là đi từng ô)");
            ClearDialogs("G");
        }

        // ── P-E / P-F ĐẶT CUỐI CÙNG ────────────────────────────────────────────
        // Cả hai đều MỞ hộp thoại 部位選択, và hộp thoại đó KHÔNG đóng được bằng
        // いいえ/No/OK/F10/ESC — nó là cửa sổ CON của frm203002 với bảng răng, nút đóng
        // nằm ở đâu thì chưa biết. Đã vấp thật 2026-08-25 hai lần: để P-E ở giữa thì nó
        // kẹt lại và mọi bước sau đọc lưới đều timeout.
        //
        // Nên xếp xuống cuối và CHẤP NHẬN để app ở trạng thái đó — runner-task.ps1 kill
        // MENU.exe sau mỗi lượt chạy nên không ảnh hưởng lượt sau.
        // ── P-E: Enter trên ô 部位 ──────────────────────────────────────────
        LogKq("E", "CÂU HỎI: Enter trên ô 部位 mở hộp thoại gì? (frm203002.cs:3551-3558)");
        var trt = _grid.Snapshot().FirstOrDefault(r => !IsBuiRow(r) && r.Ten.Length > 0 && r.Ryo.Length > 0);
        if (trt is null) LogKq("E", "không tìm được 処置行 nào ⇒ bỏ qua");
        else
        {
            Probe("E", "dat con tro vao o 部位 roi Enter", () =>
            {
                _grid.FocusCell(trt, RegiGrid.Col.Bui);
                _grid.Press(VirtualKeyShort.RETURN);
            });
            LogKq("E", "cửa sổ đang hiện: " + KarteAutoCalc.KarteAutoCalcDialog.DescribeVisibleWindows(App));
            trace.Shot("E-sau-enter-o-bui");
            ClearDialogs("E");
            LogKq("E", "sau khi dẹp: " + State());
        }

        // ── P-F: ← trên ô 点 ────────────────────────────────────────────────
        LogKq("F", "CÂU HỎI: ← trên ô 点 mở 部位＆病名 hay chỉ dời ô? (frm203002.cs:3583-3593)");
        var trt2 = _grid.Snapshot().FirstOrDefault(r => !IsBuiRow(r) && r.Ten.Length > 0 && r.Ryo.Length > 0);
        if (trt2 is not null)
        {
            Probe("F", "dat con tro vao o 点 roi bam mui ten trai", () =>
            {
                _grid.FocusCell(trt2, RegiGrid.Col.Ten);
                _grid.Press(VirtualKeyShort.LEFT);
            });
            LogKq("F", "cửa sổ đang hiện: " + KarteAutoCalc.KarteAutoCalcDialog.DescribeVisibleWindows(App));
            trace.Shot("F-sau-mui-ten-trai");
            ClearDialogs("F");
        }

        LogKq("Z", "TRẠNG THÁI CUỐI: " + State());
        Assert.Pass("probe nâng cao xong — đọc log + ảnh, KHÔNG có assert nào");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROBE 点数/コード — 入力モード và tra cứu 処置 từ ô 点
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Nhãn 入力モード — <c>lbInpMode</c>, hiện 「点数」 hoặc 「コード」.</summary>
    private string InpModeLabel()
    {
        var box = Uia.ById(Screen.Window, "lbInpMode");
        return box is null ? "(khong thay lbInpMode)" : Txt.N(Uia.ValueOf(box));
    }

    /// <summary>
    /// Bấm một nút của LỚP ON (hậu tố <c>_S</c>).
    ///
    /// <para>Thanh phím có hai lớp: OFF thì F9 = 登録, ON thì F9 = 点数. Hai lớp là hai
    /// BỘ CONTROL khác nhau — <c>btnF9</c> và <c>btnF9_S</c> (frm203002.cs:4571/:4604).
    /// Bấm thẳng <c>btnF9_S</c> thì khỏi phải bật/tắt lớp.</para>
    /// </summary>
    private bool PressShiftKey(string id)
    {
        var btn = Uia.ById(Screen.Window, id);
        if (btn is null) { LogKq("P", $"KHÔNG thấy nút {id}"); return false; }
        Uia.Click(btn);
        Thread.Sleep(600);
        return true;
    }

    [Test]
    [Description("Probe 点数/コード — 入力モード, tra cứu từ ô 点, mã đặc biệt; KHÔNG assert")]
    public void Probe_PointCodeMode()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        // ── P1: mode mặc định ────────────────────────────────────────────────
        LogKq("P1", $"nhãn 入力モード lúc mở màn: 「{InpModeLabel()}」 (mong đợi 「点数」 — " +
                    "flgInpMode khởi tạo ePoint, frm203002.cs:3024)");

        // ── P2: đổi mode bằng nút lớp ON ────────────────────────────────────
        LogKq("P2", "CÂU HỎI: btnF10_S / btnF9_S có đổi 入力モード không?");
        if (PressShiftKey("btnF10_S")) LogKq("P2", $"sau btnF10_S: 「{InpModeLabel()}」 (mong đợi 「コード」)");
        if (PressShiftKey("btnF9_S")) LogKq("P2", $"sau btnF9_S : 「{InpModeLabel()}」 (mong đợi 「点数」)");
        trace.Shot("P2-doi-mode");

        // ── P3: click chính cái nhãn ────────────────────────────────────────
        LogKq("P3", "CÂU HỎI: click nhãn lbInpMode có đổi mode? (frm203002.cs:7126)");
        var label = Uia.ById(Screen.Window, "lbInpMode");
        if (label is null) LogKq("P3", "không thấy lbInpMode ⇒ bỏ qua");
        else
        {
            var before = InpModeLabel();
            var (lx, ly) = Uia.Center(label);
            Uia.LeftClickPhysical(lx, ly);
            Thread.Sleep(600);
            LogKq("P3", $"click nhãn: 「{before}」 → 「{InpModeLabel()}」");
        }
        ClearDialogs("P3");

        // ── Tiền đề cho P4..P6: một ô 点 gõ được ────────────────────────────
        var row = _grid.Snapshot().FirstOrDefault(r => Txt.N(r.Ten) is not ("-" or "－")
                                                       && !Txt.Has(r.Ryo, "日計")
                                                       && r.Ryo.Length > 0);
        if (row is null)
        {
            LogKq("P4", "không tìm được 処置行 nào để gõ vào ô 点 ⇒ dừng");
            Assert.Pass("xem log");
            return;
        }
        LogKq("P4", "dòng đem test: " + Describe(row));

        // Gõ một giá trị vào ô 点 rồi Enter, ghi lại app phản ứng gì.
        void TryTen(string tag, string what, string typed)
        {
            LogKq(tag, $"── gõ 「{typed}」 vào ô 点 rồi Enter ({what})");
            try
            {
                _grid.FocusCell(row!, RegiGrid.Col.Ten);
                if (!_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
                Thread.Sleep(300);
                _grid.Type(typed);
                LogKq(tag, $"   editor trước Enter: 「{_grid.EditorText()}」");
                _grid.Press(VirtualKeyShort.RETURN);
                Thread.Sleep(1200);
            }
            catch (Exception e) { LogKq(tag, $"   NÉM: {e.GetType().Name}: {e.Message}"); }

            var dlgs = RealDialogs();
            LogKq(tag, dlgs.Count == 0
                ? "   hộp thoại: (không có)"
                : "   hộp thoại: 「" + Txt.N(Dialogs.TextOf(dlgs[0])).Replace("\n", " ") + "」");
            LogKq(tag, "   " + State());
            try { _trace.Shot($"{tag}-{what}"); } catch { }
            ClearDialogs(tag);
        }

        // ── P4: mã KHÔNG tồn tại (コードモード) ─────────────────────────────
        PressShiftKey("btnF10_S");
        LogKq("P4", $"đã chuyển sang 「{InpModeLabel()}」");
        TryTen("P4", "ma-khong-ton-tai", "99999");

        // ── P5: cú pháp 「コード-枝番」 ──────────────────────────────────────
        LogKq("P5", "CÂU HỎI: 「116-5」 có bị Conversion.Val cắt thành 116 không?");
        TryTen("P5", "116-5", "116-5");

        // ── P6: mã 17 (自費金額) — có LUÔN mở dialog không? ─────────────────
        LogKq("P6", "CÂU HỎI: mã 17 có LUÔN mở 処置選択 kể cả khi master chỉ 1 dòng? " +
                    "(modMain.cs: intRowCnt == 1 && trt_cd != 17)");
        TryTen("P6", "ma-17", "17");

        LogKq("PZ", "TRẠNG THÁI CUỐI: " + State());
        Assert.Pass("probe 点数/コード xong — đọc log + ảnh");
    }
}
