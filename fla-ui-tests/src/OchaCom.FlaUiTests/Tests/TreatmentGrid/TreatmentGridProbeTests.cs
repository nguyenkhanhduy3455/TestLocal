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
}
