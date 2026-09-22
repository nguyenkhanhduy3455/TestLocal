using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.MisoutyakuE00100;

/// <summary>
/// §B — gõ mã <b>999 (未装着)</b> ở コードモード lên ô 点 của một dòng <b>đã có 点数</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   ô 点, コードモード, gõ 999 → Enter        (frm203002.cs:5587-5590)
///     └─ ModMain.GetTrtmasCod(con, "999")     (modMain.cs:501)
///          └─ trt_cd == 999 → Misoutyaku(con) (modMain.cs:556-558)
///               ① quét hFG1 tìm 印象 240/247/325-5/325-8/530-2  (modMain.cs:1805-1817)
///               ② không thấy → Trntrn.getInpTrnImpDt (CẢ lịch sử, tới cuối tháng)
///               ③ vẫn không thấy → E00100, return false        (modMain.cs:1822-1826)
///     └─ ret == false → grdRegi.EndEdit(); hFG1.CurrentCell.Value = "";
///                                                               (frm203002.cs:5605-5607)
/// </code>
///
/// <para><b>Luồng này CHỈ ĐỌC.</b> Không seed, không bấm F9 登録. Ô 点 bị app xoá trắng chỉ
/// nằm trong lưới đang mở và mất khi <c>runner-task.ps1</c> kill <c>MENU.exe</c>.</para>
///
/// <para>⚠️ Tiền đề do <see cref="MisoutyakuMasterTests"/> khoá: bệnh nhân phải <b>chưa từng</b>
/// có 印象 tới cuối tháng — nếu còn một dòng cũ (kể cả đã xoá mềm) thì bước ② tìm ra ngày và
/// E00100 <b>không</b> bung.</para>
/// </summary>
[TestFixture]
[CancelAfter(900_000)]
public sealed class MisoutyakuUiTests : UiTestBase
{
    /// <summary>Mã 未装着 — modMain.cs:556.</summary>
    public const int MisoutyakuCode = 999;

    private MisoutyakuDb? _db;
    private SigaToothFlow _flow = null!;

    private static void Log(string l) => TestContext.Out.WriteLine(l);

    /// <summary>Ca này ĐANG ĐO hộp thoại — không để watcher trả lời hộ (F19).</summary>
    protected override string[] NuisanceDialogPatterns => [];

    [SetUp]
    public void Init()
    {
        _db ??= MisoutyakuDb.CreateOrNull(Settings);
        _flow = new SigaToothFlow(App, Screen);
    }

    [Test]
    [Description("TCM_10 ← §B2/§B3 — 999 trên dòng đã có 点数: E00100 bung, và ô 点 bị XOÁ TRẮNG")]
    public void TCM_10_Code999_Shows_E00100_And_Clears_Point_Cell()
    {
        using var trace = TestTrace.Begin();

        // ── tiền đề DB, kiểm lại ngay trước khi gõ ──────────────────────────
        if (_db is not null)
        {
            var imp = _db.ImpressionRows(PatNo, TrtDate);
            Log($"印象 tới cuối tháng {TrtDate:yyyy-MM}: {imp.Count} dòng");
            foreach (var r in imp) Log("   " + r);
            Assert.That(imp, Is.Empty,
                $"Bệnh nhân {PatNo} còn {imp.Count} dòng 印象 ⇒ bước ② của Misoutyaku tìm ra ngày " +
                "và E00100 KHÔNG bung. TIỀN ĐỀ hỏng — xem MisoutyakuMasterTests.TCM_0.");
        }

        // ── chọn dòng ĐÃ CÓ 点数 của ngày test ──────────────────────────────
        var day = TrtDate.Day;
        var seat = new CmtPackOps(_flow).ScrollToLastRowOfDay(day, trace);
        Assert.That(seat, Is.Not.Null,
            $"Lưới không có dòng nào của ngày {day} ⇒ DỮ LIỆU/HARNESS hỏng.\n  Lưới:\n  " +
            string.Join("\n  ", _flow.DescribeGrid(60)));

        var rows = _flow.Grid.Snapshot(200).ToList();
        var target = rows.LastOrDefault(r => Txt.Int(r.Day) == day && Txt.Int(r.Ten) is > 0);
        Assert.That(target, Is.Not.Null,
            $"Ngày {day} không có dòng nào mang 点数 > 0. §B2 hỏi 「gõ đè 999 lên dòng ĐÃ CÓ " +
            "点数 thì ô 点 có bị xoá trắng không」 — dòng trống thì hai vế đều trống và ca đo mất " +
            "nghĩa (xem ghi chú gốc §B2).\n  Lưới:\n  " +
            string.Join("\n  ", _flow.DescribeGrid(60)));

        var tenBefore = target!.Ten;
        var ryoBefore = target.Ryo;
        Log($"=== DÒNG ĐEM THỬ === 「{target}」 · 点 TRƯỚC khi gõ = 「{tenBefore}」");

        // ── gõ 999 ở コードモード ───────────────────────────────────────────
        Assert.That(_flow.EnsureCodeMode(), Is.True,
            $"Không đưa được ô 点 về コードモード — đang là 「{_flow.InpMode()}」. Ở 点数モード " +
            "thì 999 bị hiểu là SỐ ĐIỂM và cả ca đo mất nghĩa ⇒ HARNESS hỏng, KHÔNG phải app.");

        trace.Do($"go {MisoutyakuCode} vao o 点 cua dong 「{target}」 roi Enter", () =>
        {
            _flow.Grid.FocusCell(target, RegiGrid.Col.Ten);
            if (!_flow.Grid.IsEditing()) _flow.Grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _flow.Grid.Type(MisoutyakuCode.ToString());
            _flow.Grid.Press(VirtualKeyShort.RETURN);
        });

        // ── bắt hộp thoại bằng Win32, KHÔNG chỉ tin UIA (F17) ───────────────
        var found = Waits.TryFor(() => MsgBoxWin32.All(App.ProcessId).FirstOrDefault(),
                                 TimeSpan.FromSeconds(10));
        trace.Shot("sau-khi-go-999");

        Assert.That(found, Is.Not.Null,
            $"Gõ {MisoutyakuCode} mà KHÔNG có hộp thoại nào bung ra trong 10s.\n" +
            "  Theo modMain.cs:1822-1826, bệnh nhân không có 印象 (đã kiểm ở trên) thì phải ra " +
            "E00100. Không ra ⇒ hoặc mã chưa tới được ô 点 (đọc ảnh), hoặc bước ② đã tìm ra " +
            "một dòng 印象 mà truy vấn tiền đề không thấy.");

        var caption = MsgBoxWin32.ButtonCaptions(found!.Hwnd);
        Log($"=== KQ-B3 === hộp thoại: tiêu đề 「{found.Title}」");
        Log($"   thân (nguyên văn): 「{found.Raw}」");
        Log($"   nút thật: [{string.Join(", ", caption)}]");

        Assert.That(Txt.Has(found.Text, MisoutyakuMasterTests.E00100Text), Is.True,
            $"Hộp thoại bung ra KHÔNG phải E00100.\n" +
            $"  mong đợi chứa: 「{MisoutyakuMasterTests.E00100Text}」 (modMain.cs:1824)\n" +
            $"  thực tế       : 「{found.Text}」 (tiêu đề 「{found.Title}」)");

        // ── đóng bằng Win32 (F18) ──────────────────────────────────────────
        var closed = MsgBoxWin32.ClickButton(found.Hwnd, "OK", "はい", "Yes");
        Assert.That(closed, Is.True,
            $"Không bấm được nút nào của E00100. Nút thật: [{string.Join(", ", caption)}] — " +
            "truyền đúng bộ đồng nghĩa của nhánh mình muốn (F16).");
        Thread.Sleep(1200);
        trace.Shot("sau-khi-dong-E00100");

        // ── §B2: ô 点 có bị xoá trắng không ─────────────────────────────────
        var after = _flow.Grid.Snapshot(200).ToList();
        var same = after.FirstOrDefault(r => Txt.Int(r.Day) == day && Txt.N(r.Ryo) == Txt.N(ryoBefore));
        Assert.That(same, Is.Not.Null,
            $"Mất dấu dòng 「{ryoBefore}」 sau khi đóng E00100 — đọc ảnh trước khi kết luận.\n" +
            "  Lưới:\n  " + string.Join("\n  ", _flow.DescribeGrid(60)));

        Log($"=== KQ-B2 === 点 TRƯỚC = 「{tenBefore}」 · 点 SAU = 「{same!.Ten}」");

        Assert.That(SigaToothFlow.IsBlank(same.Ten), Is.True,
            $"§B2 — sau khi OK trên E00100, ô 点 của dòng 「{ryoBefore}」 vẫn mang 「{same.Ten}」, " +
            $"KHÔNG bị xoá trắng (trước khi gõ là 「{tenBefore}」).\n" +
            "  Theo frm203002.cs:5605-5607, nhánh ret == false làm grdRegi.EndEdit() rồi " +
            "hFG1.CurrentCell.Value = \"\" ⇒ ô 点 phải TRỐNG.\n" +
            "  ⚠️ Nếu WinForm thật sự xoá trắng thì vế web đang LỆCH: commitCellEdit với " +
            "RegiCol.ten + Enter không ghi giá trị gõ vào dòng, nên ô 点 giữ 点数 CŨ. Đó là " +
            "lệch có sẵn cho MỌI đường thất bại, không riêng 999 — xử lý như task riêng " +
            "(ghi chú gốc §B2).");
    }
}
