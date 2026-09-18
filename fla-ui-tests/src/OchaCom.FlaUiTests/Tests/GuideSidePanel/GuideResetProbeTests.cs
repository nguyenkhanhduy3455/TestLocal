using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.HighNeedsFreewd;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// <b>PROBE</b> — nút 「リセット」 của tab ガイド bung Q00100 khi con trỏ đứng ở dòng
/// <b>KHÔNG có 病名</b> hay không, và cú OK ở đó để lại gì.
///
/// <para>Đây là nửa WinForm của câu hỏi mà bản web đang phải suy từ source
/// (<c>frm203002.cs:6629-6641</c>). Fixture <b>KHÔNG assert</b>: mỗi bước bắt hết ngoại
/// lệ, ghi lại rồi đi tiếp (F1), và in mọi số đo thành dòng <c>=== KQ-… ===</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG ĐO LẠI BẰNG <see cref="GuideSidePanelProbeTests"/> (P17)
/// ═══════════════════════════════════════════════════════════════════════════════
/// P17 đã đo được NGUYÊN VĂN câu hỏi (README mục 4.3, 2026-08-27) nhưng nó bấm リセット
/// ở <b>dòng nào đang có con trỏ lúc ấy</b> — và nó luôn trả lời キャンセル. Ba thứ nó
/// KHÔNG trả lời được, và cả ba đều là thứ đang cần:
/// <list type="number">
///   <item>Dòng KHÔNG có 病名 thì hộp thoại CÓ bung không (source nói cú
///     <c>ShowOKCancelMsg</c> nằm TRƯỚC mọi phép kiểm — nhưng đó là đọc, không phải đo).</item>
///   <item>Nút nào đang giữ con trỏ lúc hộp thoại vừa mở, và ESC làm gì. Nút <b>mặc
///     định</b> UIA không phơi ra, phải đọc <c>FocusedElement()</c> ngay lúc mở (F16).</item>
///   <item>Bấm OK ở dòng không có 病名 thì lưới STEP nạp lại / rỗng đi / y nguyên, và có
///     thêm thông điệp nào nữa không.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM — ba hàm, đọc theo thứ tự này
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
/// cmdGuidReset_Click        frm203002.cs:6629-6641
///     MsgDialog.ShowOKCancelMsg("Q00100", "該当部位の治療進行状態をリセットします。")
///         ← KHÔNG có phép kiểm nào đứng trước. Bung vô điều kiện.
///     == OK → StepReset() ; getGuidNyuryokuInfo2(con, false, false, false)
///
/// StepReset                 frm203002.cs:6646-6677
///     val = editStringToInt(hFG1[40, CurrentCellAddress.Y])   ← DIS_CD1 của CHÍNH dòng
///     for i 0..31: nếu hFG1[8+i] != "0" → setResetData(val, i, ref data)
///     setResetData: switch(val){ 100/390→bui1 · 101→bui2 · … · default: break; }
///         ← val = 0 rơi vào default ⇒ data KHÔNG đổi ⇒ UPDATE ghi lại y nguyên
///
/// getGuidNyuryokuInfo2      frm203002.cs:1991-2017
///     hai nút 前回/リセット đặt Visible TRƯỚC khi truy vấn ⇒ list rỗng KHÔNG làm chúng ẩn
///     dt.Rows.Count == 0 → E00024 「該当ガイド」 và KHÔNG gán lại DataSource
///         ← nên 「lưới giữ nguyên list cũ」 là hành vi có chủ ý, không phải quên
/// </code>
///
/// <para><b>Chỗ dễ port sai nhất</b>: 病名 mà <c>getGuidNyuryokuInfo2</c> dùng KHÔNG phải
/// 病名 của dòng đang có con trỏ — <c>getFocusDis</c> (:2373) <b>quét NGƯỢC LÊN</b> tìm
/// 部位病名行 gần nhất cùng ngày (<c>linekbn == "1"</c>). Còn <c>StepReset</c> thì đọc
/// ĐÚNG dòng đang có con trỏ. Hai hàm chạy liền nhau trong cùng một cú OK mà lấy 病名 từ
/// hai chỗ khác nhau — đó chính là lý do kịch bản B có thể 「hộp thoại bung, OK không ghi
/// gì, mà list vẫn nạp lại bình thường」.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// AN TOÀN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>KHÔNG bấm F9 登録</b>, không Escape khi frm203017 mở.</item>
///   <item><b>Kịch bản A (dòng CÓ 病名) KHÔNG BAO GIỜ bấm OK</b> — kể cả khi bật cờ. Ở
///     đó <c>setResetData</c> vào đúng nhánh và <c>bui{n}[idx] = 0</c> xoá thật tiến
///     trình STEP của bệnh nhân.</item>
///   <item>Kịch bản B bấm OK chỉ khi có <c>OCHA_GUIDE_RESET_ALLOW_OK=1</c>; chụp / in /
///     trả lại <c>TRTSTATE</c> quanh cú bấm (<see cref="GuideResetDb"/>, F20).</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY — mỗi ca MỘT LÔ (F7)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
/// .\run-select-guide-treatment.ps1 -Reset -Case TcR0     # dump lưới: dòng nào A, dòng nào B
/// .\run-select-guide-treatment.ps1 -Reset -Case TcR1A    # mốc đối chiếu — dòng CÓ 病名
/// .\run-select-guide-treatment.ps1 -Reset -Case TcR1B    # câu hỏi chính — dòng KHÔNG có 病名
/// $env:OCHA_GUIDE_RESET_ALLOW_OK = "1"                   # rồi chạy lại TcR1B để bấm OK
/// </code>
/// </summary>
[TestFixture]
[Category("guide-sidepanel")]
[Explicit("Probe — chạy tay; không nằm trong lô hồi quy.")]
[NonParallelizable]
[CancelAfter(720_000)]
public sealed class GuideResetProbeTests : UiTestBase
{
    /// <summary>Cột <c>DIS_CD1</c> của <c>grdRegi</c> — 病名 của CHÍNH dòng (RegiCol, frm203002.cs:158+).</summary>
    private const int ColDisCd1 = 40;

    /// <summary>Cột <c>BUI_DISP_FLG</c> = 行区分 (1 = 部位病名行, 2 = 処置行, 99 = 過去月, 10-15 = 日計).</summary>
    private const int ColLineKbn = 51;

    /// <summary>Virtual-key của ESC — đo câu 1.3 「ESC làm gì」.</summary>
    private const ushort VkEscape = 0x1B;

    private GuideTabFlow _guide = null!;
    private HighNeedsFlow _regi = null!;
    private TreatmentGridOps _grid = null!;
    private GuideResetDb? _db;
    private TestTrace _trace = null!;

    /// <summary>
    /// Nguyên trạng <c>TRTSTATE</c> chụp <b>trước khi app mở màn</b> — mốc duy nhất để
    /// trả lại ở <c>OneTimeTearDown</c>.
    ///
    /// <para>⚠️ Chụp ở <c>OneTimeSetUp</c> chứ không trong testcase: chụp SAU khi đã bấm
    /// OK là chụp phải chính cái mình vừa ghi đè, và teardown sẽ "khôi phục" về mốc đó
    /// chứ không về nguyên trạng. Đã mất dữ liệu thật của bệnh nhân test một lần vì đúng
    /// thứ tự này (F20, 2026-09-03).</para>
    /// </summary>
    private GuideResetDb.Snapshot? _trtStateAtStart;

    /// <summary>
    /// Probe KHÔNG để <see cref="NuisanceDialogWatcher"/> trả lời hộ: nội dung và SỐ
    /// LƯỢNG hộp thoại chính là số đo (F19). Watcher chạy thì E00024 hay Q00100 có thể
    /// bị bấm mất trước khi đọc, và lượt đo ra 「không có hộp thoại nào」 — kết luận
    /// ngược hẳn sự thật.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>
    /// Ghi ra CẢ BA chỗ: <c>TestContext.Out</c> (vào <c>.trx</c>), <c>TestContext.Progress</c>
    /// (vào <c>logs\run-stdout.log</c>) và một file artifact UTF-8.
    ///
    /// <para>Cần cả ba vì <c>OneTimeSetUp</c>/<c>OneTimeTearDown</c> <b>không</b> nằm trong
    /// node kết quả của testcase: đo 2026-09-18, mọi dòng <c>=== KQ-snap ===</c> và
    /// <c>=== KQ-cleanup ===</c> biến mất khỏi <c>.trx</c>. Mà đó lại đúng là hai dòng
    /// quan trọng nhất của cả lượt chạy — bản chụp nguyên trạng <c>TRTSTATE</c> và kết quả
    /// trả lại (F20). Không thấy chúng thì không biết lượt chạy có để lại dấu vết hay
    /// không.</para>
    /// </summary>
    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
        try
        {
            var dir = Path.Combine(AppContext.BaseDirectory, "artifacts");
            Directory.CreateDirectory(dir);
            File.AppendAllText(Path.Combine(dir, "guide-reset-trtstate.log"),
                               $"{DateTime.Now:HH:mm:ss}  {line}{Environment.NewLine}");
        }
        catch { /* ghi file hỏng không được làm hỏng probe */ }
    }

    /// <summary>
    /// Mọi dòng số đo đều mang tiền tố <c>=== KQ-… ===</c>.
    ///
    /// <para>Runner lọc file KQ bằng <c>Select-String "=== KQ-"</c> — dòng nào không có
    /// tiền tố thì chỉ còn trong <c>.trx</c>. Các probe cũ in tiêu đề có tiền tố rồi in
    /// thân không có, nên file KQ của chúng đọc ra một nửa.</para>
    /// </summary>
    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    [OneTimeSetUp]
    public void ResetProbeOneTimeSetUp()
    {
        _db = GuideResetDb.CreateOrNull(Settings);
        if (_db?.ProbeError() is { } err)
        {
            Log($"⚠️ không đọc được SQL Server ({err}) — probe vẫn chạy, chỉ thiếu vế TRTSTATE.");
            _db = null;
        }

        if (_db is null) return;
        try
        {
            _trtStateAtStart = _db.Capture(PatNo);
            // IN RA STDOUT ngay: bị Ctrl+C giữa lượt thì đây là bản duy nhất còn dựng
            // lại được bằng tay (F20).
            Log($"=== KQ-snap === TRTSTATE(pat {PatNo}) NGUYÊN TRẠNG đầu lượt, có dòng = " +
                $"{_trtStateAtStart.Exists}");
            Log($"=== KQ-snap === các ô KHÁC 0: {_trtStateAtStart.Describe()}");
        }
        catch (Exception e) { Log("⚠️ không chụp được TRTSTATE đầu lượt: " + e.Message); }
    }

    [SetUp]
    public void ResetProbeSetUp()
    {
        _guide = new GuideTabFlow(App, Screen);
        _regi = new HighNeedsFlow(App, Screen);
        _grid = new TreatmentGridOps(Screen);
    }

    /// <summary>
    /// Trả màn hình về trạng thái dùng được cho lượt sau: đóng frm203017 bằng F10, dẹp
    /// hộp thoại (luôn trả lời キャンセル), hạ lớp phím Shift.
    /// </summary>
    [TearDown]
    public void ResetProbeTearDown()
    {
        try
        {
            if (_guide.DialogOpen()) _guide.CloseDialogWithF10();
            Dismiss("dọn");
            _guide.ResetShiftLayer();
        }
        catch (Exception e) { Log("dọn cuối testcase KHÔNG xong: " + e.Message); }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Đọc lưới grdRegi — ĐỦ để biết dòng nào là A, dòng nào là B
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Một dòng <c>grdRegi</c> đã đọc đúng bảy ô cần cho phép đo này.</summary>
    /// <param name="DisCd1">
    /// Ô cột 40. <c>StepReset</c> đọc ĐÚNG ô này của dòng đang có con trỏ, nên nó — chứ
    /// không phải 病名 nhìn thấy trên màn hình — là thứ quyết định kịch bản A hay B.
    /// Chuỗi rỗng / 「0」 ⇒ kịch bản B.
    /// </param>
    private sealed record ProbeRow(
        int Index,
        AutomationElement Element,
        string Day,
        string Bui,
        string Ryo,
        string Ten,
        string Kai,
        string DisCd1,
        string LineKbn,
        int CellCount)
    {
        /// <summary>Dòng này có 病名 trong ô cột 40 của CHÍNH nó hay không.</summary>
        public bool HasByomei => Txt.Int(DisCd1) is > 0;

        /// <summary>日計/合計 (10-15) và dòng tháng cũ (99) — không đem ra đo.</summary>
        public bool IsFooterOrPast =>
            Txt.Int(LineKbn) is 99 or (>= 10 and <= 15) || Txt.Has(Ryo, "日計") || Txt.Has(Ryo, "合計");

        public override string ToString() =>
            $"[{Index,2}] 日=「{Day}」 部位=「{Bui}」 療法・処置=「{Ryo}」 点=「{Ten}」 回=「{Kai}」 " +
            $"| DIS_CD1=「{DisCd1}」 linekbn=「{LineKbn}」 ({CellCount} ô) " +
            $"⇒ {(HasByomei ? "kịch bản A (CÓ 病名)" : "kịch bản B (KHÔNG có 病名)")}";
    }

    /// <summary>
    /// Quét lưới, đọc đích danh 7 ô mỗi dòng.
    ///
    /// <para>KHÔNG dùng <c>TreatmentGridOps.Snapshot</c>: bật cột ẩn rồi thì mỗi dòng có
    /// 81 ô và Snapshot đọc HẾT — mỗi <c>ValueOf</c> là vài lượt gọi COM xuyên tiến
    /// trình nên quét đủ ngốn hàng phút (đã đo ở <c>HighNeedsFlow.ScanRows</c>). Ở đây
    /// <c>Uia.Children</c> gọi MỘT lần rồi chỉ đọc giá trị của 7 ô.</para>
    /// </summary>
    private IReadOnlyList<ProbeRow> ReadGrid(int limit = 40)
    {
        var rows = new List<ProbeRow>();
        var index = 0;

        foreach (var element in Screen.Regi.Grid.RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();
            if (cells.Count <= RegiGrid.Col.Kai) continue;

            // 「Top Row」 lọt vào danh sách dòng dữ liệu ở MỌI lưới của app (F11).
            if (Uia.ControlTypeOf(cells[0]) is ControlType.Header or ControlType.HeaderItem) continue;

            rows.Add(new ProbeRow(
                index++,
                element,
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Day])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Bui])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ryo])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ten])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Kai])),
                cells.Count > ColDisCd1 ? Txt.N(Uia.ValueOf(cells[ColDisCd1])) : "(cột ẩn chưa bật)",
                cells.Count > ColLineKbn ? Txt.N(Uia.ValueOf(cells[ColLineKbn])) : "(cột ẩn chưa bật)",
                cells.Count));
        }
        return rows;
    }

    /// <summary>
    /// Dòng đem đo cho một kịch bản — <b>ưu tiên 部位病名行</b> (<c>linekbn == "1"</c>).
    ///
    /// ─── Vì sao ưu tiên 部位病名行, và vì sao 処置行 vẫn dùng được ──────────────
    /// Đo được 2026-09-18 trên bệnh nhân 10 / 08年08月, lưới có đúng hai khối:
    /// <code>
    /// [ 5] 日 3  部位「54321(5)」 療法・処置「C」  DIS_CD1=100  linekbn=1   ← A: 部位病名行 CÓ 病名
    /// [ 6..13]   日 3  処置行                     DIS_CD1=100  linekbn=2   ← A: 処置行 THỪA HƯỞNG 病名
    /// [15..17]   日 14 処置行, không 部位          DIS_CD1=0    linekbn=2
    /// [18] 日 14 部位「3(1)」 療法・処置 RỖNG      DIS_CD1=0    linekbn=1   ← B MẠNH NHẤT
    /// [19..20]   日 14 処置行                     DIS_CD1=0    linekbn=2   ← B
    /// </code>
    /// Dòng [18] là ca <b>mạnh nhất</b> cho kịch bản B: nó CÓ ô 部位 khác 0 (nên vòng lặp
    /// của <c>StepReset</c> thật sự gọi <c>setResetData</c>, không bỏ qua) nhưng
    /// <c>DIS_CD1 = 0</c> nên <c>val = 0</c> rơi vào <c>default: break;</c>. Chọn một dòng
    /// không có 部位 thì <c>setResetData</c> không được gọi lần nào, và lượt đo không phân
    /// biệt được 「rơi vào default」 với 「vòng lặp chạy 0 lần」 — hai lý do khác nhau cho
    /// cùng một kết quả 「không ghi gì」.
    ///
    /// <para>Loại 過去月 (<c>linekbn = 99</c>): khối 07月 phía trên cũng có 部位病名行 mang
    /// 病名, nhưng <c>getFocusBui</c>/<c>getFocusDis</c> <b>dừng ngay</b> khi gặp
    /// <c>linekbn == "99"</c> (frm203002.cs:2294 / :2390) nên đo ở đó là đo một nhánh
    /// khác hẳn.</para>
    /// </summary>
    private static ProbeRow? PickRow(IReadOnlyList<ProbeRow> rows, bool wantByomei)
    {
        var usable = rows.Where(r => !r.IsFooterOrPast && r.DisCd1 != "(cột ẩn chưa bật)"
                                     && r.HasByomei == wantByomei).ToList();
        return usable.FirstOrDefault(r => Txt.Int(r.LineKbn) == 1)
               ?? usable.LastOrDefault();
    }

    /// <summary>
    /// Bật cột ẩn của <c>grdRegi</c> bằng cửa hậu có sẵn của app (click nhãn 患者番号 rồi
    /// double-click nhãn 氏名, frm203002.cs:2645-2718) — không có nó thì cột 40/51 không
    /// đọc được và cả phép đo mất mốc.
    /// </summary>
    private bool RevealColumns(string tag)
    {
        var ok = _regi.RevealHiddenColumns(_trace);
        Kq(tag, $"bật cột ẩn → {ok}; đang hiện = {_regi.HiddenColumnsVisible()}");
        return ok;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Hộp thoại — đọc bằng Win32, bấm bằng PostMessage (F17 + F18)
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Mô tả ĐẦY ĐỦ mọi MessageBox đang mở: nguyên văn, tiêu đề, danh sách nút, và nút
    /// đang giữ con trỏ.
    ///
    /// <para>Nút <b>mặc định</b> của một <c>MessageBox</c> không có thuộc tính UIA nào —
    /// nhưng Win32 giao con trỏ cho đúng nó lúc mở, nên <c>FocusedElement()</c> đọc ngay
    /// lúc đó chính là câu trả lời (F16).</para>
    /// </summary>
    private void DescribeDialogs(string tag, string when)
    {
        var open = MsgBoxWin32.All(App.ProcessId);
        if (open.Count == 0)
        {
            Kq(tag, $"{when}: KHÔNG có hộp thoại nào (quét Win32 #32770 của pid {App.ProcessId})");
            return;
        }

        foreach (var d in open)
        {
            Kq(tag, $"{when}: NGUYÊN VĂN = 「{d.Text}」");
            Kq(tag, $"{when}: tiêu đề    = 「{d.Title}」");
            Kq(tag, $"{when}: chuỗi thô  = 「{d.Raw}」");
            Kq(tag, $"{when}: mã điểm mã = {CodePoints(d.Text)}");
            Kq(tag, $"{when}: bộ nút     = [{string.Join(" | ", MsgBoxWin32.ButtonCaptions(d.Hwnd))}]");
        }
        Kq(tag, $"{when}: nút ĐANG GIỮ CON TRỎ = {FocusedDescription()}");
    }

    private string FocusedDescription()
    {
        try
        {
            var focused = App.Automation.FocusedElement();
            if (focused is null) return "(không đọc được)";
            return $"name=「{Uia.NameOf(focused)}」 id=「{Uia.AutomationIdOf(focused)}」 " +
                   $"type={Uia.ControlTypeOf(focused)}";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    /// <summary>Nhãn của nhánh HUỶ — bộ duy nhất được phép bấm khi hộp thoại có ≥ 2 nút.</summary>
    private static readonly string[] CancelCaptions = ["キャンセル", "Cancel", "いいえ", "No"];

    /// <summary>
    /// Dẹp hộp thoại đang mở — <b>luôn</b> trả lời キャンセル/いいえ, và chỉ rơi xuống
    /// 「OK」 khi hộp thoại <b>KHÔNG CÓ</b> nút huỷ nào.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// 🔥 ĐÃ TRẢ GIÁ 2026-09-18, ngay ở lượt đo đầu của chính fixture này
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Bản đầu truyền MỘT danh sách <c>["キャンセル","Cancel","いいえ","No","OK"]</c> cho
    /// <see cref="MsgBoxWin32.ClickButton"/> và tưởng rằng thứ tự trong danh sách là thứ
    /// tự ưu tiên. <b>Không phải.</b> Hàm đó <c>EnumChildWindows</c> — nó duyệt theo
    /// <b>thứ tự NÚT trên hộp thoại</b> và bấm nút ĐẦU TIÊN có nhãn nằm trong danh sách
    /// (MsgBoxWin32.cs:94-118). Hộp Q00100 có bộ <c>[OK | Cancel]</c>, OK đứng trước ⇒
    /// nó bấm <b>OK</b>.
    ///
    /// <para>Hệ quả đo được: <c>TcR1A</c> ghi vào log 「đã bấm キャンセル」 trong khi thật
    /// ra đã trả lời OK, <c>StepReset</c> chạy và <c>TRTSTATE</c> của bệnh nhân 10 đi từ
    /// <c>BUI1_4..BUI1_8 = 1081</c> về <b>0 hết</b>. Chỉ có bản chụp ở
    /// <c>OneTimeSetUp</c> + <c>Restore</c> ở <c>OneTimeTearDown</c> (F20) cứu lại được.
    /// Đây đúng là cái bẫy F16 đã ghi — 「đừng để OK làm fallback chung cho cả hai
    /// nhánh, đáp ngược ý mà không để lại dấu vết nào」 — chỉ là nó không nói rõ rằng
    /// <b>thứ tự danh sách không có tác dụng gì</b>.</para>
    ///
    /// <para>Vì thế ở đây là HAI LƯỢT tách hẳn nhau: lượt một chỉ truyền
    /// <see cref="CancelCaptions"/>; chỉ khi lượt đó không trúng nút nào — hộp một nút
    /// như E00024 — mới bấm OK, và khi đó log nói rõ là đã rơi xuống OK.</para>
    /// </summary>
    private void Dismiss(string tag)
    {
        for (var i = 0; i < 6; i++)
        {
            var open = MsgBoxWin32.All(App.ProcessId);
            if (open.Count == 0) return;

            foreach (var d in open)
            {
                var buttons = MsgBoxWin32.ButtonCaptions(d.Hwnd);

                if (MsgBoxWin32.ClickButton(d.Hwnd, CancelCaptions))
                {
                    Kq(tag, $"dẹp {d} → đã bấm nhánh HUỶ (nút thật: [{string.Join(" | ", buttons)}])");
                    continue;
                }

                // Không có nút huỷ nào ⇒ hộp một nút (E00024/I00100). OK ở đây KHÔNG
                // phải 「đồng ý」, nó là cách duy nhất đóng hộp thoại.
                if (MsgBoxWin32.ClickButton(d.Hwnd, "OK", "はい", "Yes"))
                {
                    Kq(tag, $"dẹp {d} → KHÔNG có nút huỷ nên bấm OK (nút thật: " +
                            $"[{string.Join(" | ", buttons)}]) — hộp MỘT NÚT, không phải đồng ý");
                    continue;
                }

                Kq(tag, $"dẹp {d} → KHÔNG bấm được nút nào; nút thật: [{string.Join(" | ", buttons)}]");
            }
            Thread.Sleep(500);
        }
    }

    /// <summary>In chuỗi kèm mã điểm mã — cần để phân biệt 「。」/「.」 và thấy được ký tự ẩn.</summary>
    private static string CodePoints(string? s)
    {
        if (s is null) return "(null)";
        return "[" + string.Join(" ",
            s.Select(c => c is >= ' ' and <= '~' ? c.ToString() : $"U+{(int)c:X4}")) + "]";
    }

    /// <summary>Một dòng tóm tắt trạng thái tab ガイド — dán trước/sau mỗi bước.</summary>
    private string GuideState()
    {
        try
        {
            return $"dòng(thô)={_guide.RawRowCount()} №=「{_guide.SelNo()}」 " +
                   $"focus={_guide.FocusedId()} " +
                   $"全て表示={Shown(_guide.AllButton)} 前回={Shown(_guide.PrvButton)} " +
                   $"リセット={Shown(_guide.ResetButton)}";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    private string Shown(AutomationElement? b) => _guide.IsButtonShown(b) ? "hiện" : "ẨN";

    /// <summary>Chạy một bước, KHÔNG BAO GIỜ ném — ghi lại rồi đi tiếp (F1).</summary>
    private void Step(string tag, string what, Action action)
    {
        Kq(tag, "── " + what);
        try { action(); }
        catch (Exception e)
        {
            Kq(tag, $"   NÉM: {e.GetType().Name}: {e.Message}");
            try { _trace.Fail(what, e); } catch { /* ảnh hỏng không được làm hỏng probe */ }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Vào chế độ STEP
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Đưa side panel vào tab ガイド chế độ <b>STEP</b> và trả về mô tả đường đã ăn.
    ///
    /// <para>Hai đường vì WinForm rẽ theo <b>cờ lớp phím</b> <c>ShiftFlg</c>
    /// (BaseForm.cs:613) chứ không theo phím bổ trợ của cú bấm: giữ Shift + F4, hoặc lật
    /// lớp phím bằng <c>btnShift</c> rồi bấm <c>btnF4_S</c>. Đường nào ăn thì tuỳ máy —
    /// nên đo cả hai và GHI LẠI đường nào đã ăn, đừng chọn sẵn một đường.</para>
    ///
    /// <para>Mốc 「đã vào STEP」 là <b>nút 前回/リセット hiện ra</b>, không phải 「list đổi」:
    /// <c>getGuidNyuryokuInfo2</c> đặt <c>Visible</c> cho hai nút TRƯỚC khi truy vấn
    /// (frm203002.cs:1994-2004), nên chúng hiện ra kể cả khi list rỗng và E00024 bung.</para>
    /// </summary>
    private string EnterStepMode(string tag)
    {
        Kq(tag, "trước khi vào STEP: " + GuideState());

        Step(tag, "đường A: GIỮ Shift + F4", () => _guide.OpenStepByShiftChord());
        DescribeDialogs(tag, "sau đường A");
        var dialogsA = MsgBoxWin32.All(App.ProcessId).Count;
        Dismiss(tag);

        if (_guide.IsButtonShown(_guide.PrvButton) || dialogsA > 0)
        {
            Kq(tag, "đường A ĂN (nút 前回 hiện ra, hoặc có hộp thoại bung) — " + GuideState());
            return "A: giữ Shift + F4";
        }

        Step(tag, "đường B: lật lớp phím rồi bấm btnF4_S", () =>
        {
            var ok = _guide.OpenStepByShiftButton();
            Kq(tag, $"   OpenStepByShiftButton → {(ok ? "bấm được" : "KHÔNG thấy btnShift/btnF4_S")}");
        });
        DescribeDialogs(tag, "sau đường B");
        Dismiss(tag);
        Kq(tag, "sau đường B: " + GuideState());

        return _guide.IsButtonShown(_guide.ResetButton)
            ? "B: lật lớp phím + btnF4_S"
            : "KHÔNG vào được STEP bằng đường nào — nút リセット vẫn ẨN";
    }

    /// <summary>
    /// Đặt con trỏ <c>grdRegi</c> vào một dòng bằng CLICK CHUỘT VẬT LÝ lên ô 療法・処置.
    ///
    /// <para>Ô 療法・処置 chứ không phải ô 点/回: hai ô kia là ô NHẬP LIỆU, và mọi cú Enter
    /// sau đó rơi vào <c>grdRegi_TextBox_PreviewKeyDown</c> → chốt ô → có thể gọi
    /// <c>SingleChk</c> (frm203002.cs:5667) và bung W00100 không liên quan gì tới phép đo
    /// này.</para>
    ///
    /// <para><c>DataGridView</c> chỉ dời <c>CurrentCell</c> khi có sự kiện chuột THẬT —
    /// <c>Invoke</c> sẽ "thành công" mà ô vàng không nhúc nhích (F13). Và
    /// <c>getFocusBui</c>/<c>getFocusDis</c> đọc <c>grdRegi.SelectedCells</c>, tức là
    /// đúng ô vừa click.</para>
    /// </summary>
    private void FocusRow(string tag, ProbeRow row)
    {
        Step(tag, $"click ô 療法・処置 của dòng {row.Index} để dời con trỏ", () =>
        {
            var cells = Uia.Children(row.Element).ToList();
            var cell = cells[RegiGrid.Col.Ryo];
            var rect = Uia.RectOf(cell);
            if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
                throw new InvalidOperationException(
                    $"ô 療法・処置 của dòng {row.Index} đọc ra rect RỖNG — click vào đó bắn chuột " +
                    "ra (0,0) tức góc trái trên DESKTOP, không vào app. Dòng đang nằm ngoài khung " +
                    "nhìn, hoặc tab 個別/ガイド đang che lưới.");

            var (x, y) = Uia.Center(cell);
            Uia.LeftClickPhysical(x, y);
            Thread.Sleep(600);

            Kq(tag, $"   ô đang giữ con trỏ sau click = 「{_grid.FocusedCellName()}」 " +
                    $"(đang sửa = {_grid.IsEditing()})");
        });
        _trace.Shot($"{tag}-da-dat-con-tro-dong-{row.Index}");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TcR0 — dump lưới: dòng nào là A, dòng nào là B
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TcR0 — dump grdRegi kèm cột ẩn 40/51 + TRTSTATE. Chạy cái này TRƯỚC.")]
    public void TcR0_DumpGridAndTrtState()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        Kq("R0", $"bệnh nhân {PatNo} · 診療日 {TrtDate:yyyy-MM-dd} · " +
                 $"入力モード = 「{_regi.InpMode()}」");

        Step("R0", "bật cột ẩn rồi dump toàn bộ lưới", () =>
        {
            RevealColumns("R0");
            var rows = ReadGrid();
            Kq("R0", $"đọc được {rows.Count} dòng:");
            foreach (var r in rows) Kq("R0", "   " + r);

            var candA = PickRow(rows, wantByomei: true);
            var candB = PickRow(rows, wantByomei: false);
            Kq("R0", "dòng sẽ dùng cho KỊCH BẢN A = " + (candA?.ToString() ?? "KHÔNG có dòng nào CÓ 病名"));
            Kq("R0", "dòng sẽ dùng cho KỊCH BẢN B = " + (candB?.ToString() ?? "KHÔNG có dòng nào KHÔNG có 病名"));
            if (candB is null)
                Kq("R0", "   ⇒ kịch bản B chưa dựng được bằng dữ liệu sẵn có. Cần một ngày trong " +
                         "tháng test có 処置 mà DIS_CD1 = 0 (bệnh nhân 10 có ngày 14 của 08年08月).");
        });

        Step("R0", "chụp TRTSTATE (mốc để so sau mỗi cú OK)", () =>
        {
            if (_db is null)
            {
                Kq("R0", $"   không có DB ({DbUnavailableReason}) — bỏ qua");
                return;
            }
            var snap = _db.Capture(PatNo);
            Kq("R0", $"   TRTSTATE(pat {PatNo}) có dòng = {snap.Exists}");
            Kq("R0", "   các ô KHÁC 0: " + snap.Describe());
        });

        Kq("R0", $"cờ bấm OK ({GuideResetDb.AllowOkEnvVar}) = " +
                 (GuideResetDb.AllowOk ? "BẬT" : "TẮT ⇒ TcR1B chỉ đọc câu hỏi rồi キャンセル"));

        Assert.Pass("PROBE — đọc các dòng === KQ-R0 === và ảnh trong artifacts/screenshots/");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TcR1A — mốc đối chiếu: dòng CÓ 病名
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TcR1A — リセット ở dòng CÓ 病名: nguyên văn Q00100, bộ nút, nút mặc định, ESC. " +
                 "KHÔNG BAO GIỜ bấm OK ở ca này.")]
    public void TcR1A_ResetOnRowWithByomei()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        RunOneScenario("R1A", wantByomei: true, mayPressOk: false);
        Assert.Pass("PROBE — đọc các dòng === KQ-R1A ===");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TcR1B — câu hỏi chính: dòng KHÔNG có 病名
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TcR1B — リセット ở dòng KHÔNG có 病名: hộp thoại CÓ bung không? " +
                 "OK (nếu bật cờ) để lại gì trên màn hình và trong TRTSTATE?")]
    public void TcR1B_ResetOnRowWithoutByomei()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        RunOneScenario("R1B", wantByomei: false, mayPressOk: true);
        Assert.Pass("PROBE — đọc các dòng === KQ-R1B ===");
    }

    /// <summary>
    /// Một lượt đo: chọn dòng → vào STEP → bấm リセット → đọc hộp thoại → ESC → bấm lại →
    /// (OK hoặc キャンセル) → đọc lại màn hình + TRTSTATE.
    /// </summary>
    /// <param name="wantByomei">true = kịch bản A (dòng CÓ 病名); false = kịch bản B.</param>
    /// <param name="mayPressOk">
    /// Chỉ kịch bản B được phép bấm OK, và cũng chỉ khi
    /// <c>OCHA_GUIDE_RESET_ALLOW_OK=1</c>. Kịch bản A truyền false CỐ ĐỊNH: ở đó
    /// <c>setResetData</c> vào đúng nhánh và xoá thật tiến trình STEP.
    /// </param>
    private void RunOneScenario(string tag, bool wantByomei, bool mayPressOk)
    {
        _trace.Shot("00-mo-man");
        var scenario = wantByomei ? "A (dòng CÓ 病名)" : "B (dòng KHÔNG có 病名)";
        Kq(tag, $"KỊCH BẢN {scenario} · bệnh nhân {PatNo} · 診療日 {TrtDate:yyyy-MM-dd}");

        // ── chọn dòng ────────────────────────────────────────────────────────
        ProbeRow? row = null;
        Step(tag, "bật cột ẩn rồi tìm dòng đúng kịch bản", () =>
        {
            RevealColumns(tag);
            var rows = ReadGrid();
            foreach (var r in rows) Kq(tag, "   " + r);

            row = PickRow(rows, wantByomei);
            Kq(tag, "DÒNG ĐEM ĐO = " + (row?.ToString() ?? "KHÔNG tìm được"));
        });

        if (row is null)
        {
            Kq(tag, "DỪNG: không có dòng nào thuộc kịch bản này trong lưới. Đây là thiếu DỮ LIỆU, " +
                    "không phải kết luận về app — xem dòng 「dòng sẽ dùng cho KỊCH BẢN …」 của TcR0.");
            return;
        }

        FocusRow(tag, row);

        // ── vào STEP ─────────────────────────────────────────────────────────
        var how = EnterStepMode(tag);
        Kq(tag, "đường vào STEP đã ăn = " + how);
        var stepNamesBefore = _guide.VisibleNames();
        Kq(tag, $"list STEP trước khi bấm リセット: {stepNamesBefore.Count} dòng " +
                $"[{string.Join(" / ", stepNamesBefore.Take(8))}]");
        Kq(tag, "trạng thái: " + GuideState());
        _trace.Shot($"{tag}-02-step-mode");

        if (!_guide.IsButtonShown(_guide.ResetButton))
        {
            Kq(tag, "DỪNG: nút 「リセット」 đang ẨN nên không bấm được. Không vào được nhánh " +
                    "bolStepPass = false ⇒ không đo được gì. Xem ảnh: side panel đang ở tab nào?");
            return;
        }

        // ── câu 1.1 + 1.2 + 1.3: bấm リセット rồi ĐỌC ────────────────────────
        Kq(tag, "CÂU 1.1/1.2/1.3 — bấm リセット (KHÔNG trả lời ngay) rồi đọc hộp thoại");
        Step(tag, "bấm リセット", () =>
        {
            // Nút mở MessageBox thì KHÔNG bấm bằng Uia.Click: Invoke là lời gọi ĐỒNG BỘ,
            // nó chờ handler chạy xong, mà handler đang chờ người bấm hộp thoại
            // ⇒ TimeoutException, và đọc log thì tưởng nút hỏng (README mục 4.1b).
            var clicked = _guide.ClickReset();
            Kq(tag, $"   ClickReset → {(clicked ? "đã bấm" : "nút đang ẨN")}");
        });

        var appeared = Waits.TryUntil(() => MsgBoxWin32.All(App.ProcessId).Count > 0,
                                      TimeSpan.FromSeconds(8));
        // Hạn 8s là CỐ Ý NGẮN (F2): ở kịch bản B ta đang đo xem hộp thoại có tồn tại hay
        // không, và chờ lâu hơn không mua thêm thông tin nào — chỉ đổi 8 giây thành vài phút.
        Kq(tag, $"CÂU 1.1 — hộp thoại có bung không (hạn 8s) = {(appeared ? "CÓ" : "KHÔNG")}");
        DescribeDialogs(tag, "ngay sau cú bấm リセット");
        _trace.Shot($"{tag}-03-hop-thoai-reset");

        if (!appeared)
        {
            Kq(tag, "⇒ KẾT QUẢ: ở kịch bản này WinForm KHÔNG hỏi gì. Nếu đây là kịch bản B thì " +
                    "bản sửa của web phải revert — nhưng CHỈ khi ảnh cho thấy nút đã thật sự " +
                    "được bấm và không có cửa sổ nào chắn.");
            Kq(tag, "trạng thái: " + GuideState());
            return;
        }

        // ── câu 1.3: ESC ─────────────────────────────────────────────────────
        Step(tag, "gửi ESC vào hộp thoại", () =>
        {
            var sent = Uia.SendKey(VkEscape);
            Kq(tag, $"   SendKey(ESC) → {(sent ? "phím đã gửi" : "⚠ SendInput KHÔNG gửi được")}");
            Thread.Sleep(900);
            var stillOpen = MsgBoxWin32.All(App.ProcessId);
            Kq(tag, $"CÂU 1.3 — ESC: hộp thoại còn mở = {stillOpen.Count > 0}" +
                    (stillOpen.Count > 0 ? " · " + string.Join(" + ", stillOpen.Select(d => d.ToString())) : ""));
        });
        DescribeDialogs(tag, "sau ESC");
        _trace.Shot($"{tag}-04-sau-ESC");

        var afterEsc = _guide.VisibleNames();
        Kq(tag, $"sau ESC: list STEP {stepNamesBefore.Count} → {afterEsc.Count} dòng · " +
                $"giống hệt = {stepNamesBefore.SequenceEqual(afterEsc)}");

        if (_db is not null)
        {
            var snap = _db.Capture(PatNo);
            Kq(tag, "TRTSTATE sau ESC (phải Y NGUYÊN): " + snap.Describe());
        }

        Dismiss(tag);

        // ── câu 1.4: bấm lại rồi trả lời ─────────────────────────────────────
        var pressOk = mayPressOk && !wantByomei && GuideResetDb.AllowOk;
        if (!pressOk)
        {
            Kq(tag, "CÂU 1.4 — KHÔNG bấm OK lượt này. Lý do: " + (wantByomei
                ? "kịch bản A bấm OK là XOÁ THẬT tiến trình STEP (setResetData vào đúng nhánh, " +
                  "bui{n}[idx] = 0) — ca này cố định KHÔNG bấm, kể cả khi bật cờ."
                : $"cờ {GuideResetDb.AllowOkEnvVar} đang TẮT. Bật rồi chạy lại TcR1B: " +
                  $"$env:{GuideResetDb.AllowOkEnvVar} = \"1\""));
            Step(tag, "bấm リセット lần nữa rồi trả lời キャンセル (chốt: キャンセル không ghi gì)", () =>
            {
                _guide.ClickReset();
                Waits.TryUntil(() => MsgBoxWin32.All(App.ProcessId).Count > 0, TimeSpan.FromSeconds(8));
                DescribeDialogs(tag, "lượt hai");
                Dismiss(tag);
                Thread.Sleep(800);
                var after = _guide.VisibleNames();
                Kq(tag, $"sau キャンセル: list STEP {after.Count} dòng · " +
                        $"giống trước = {stepNamesBefore.SequenceEqual(after)}");
                if (_db is not null)
                    Kq(tag, "TRTSTATE sau キャンセル (phải Y NGUYÊN): " + _db.Capture(PatNo).Describe());
            });
            _trace.Shot($"{tag}-05-sau-cancel");
            return;
        }

        // ── nhánh CÓ GHI: chụp → bấm OK → in → so → trả lại ──────────────────
        GuideResetDb.Snapshot? before = null;
        Step(tag, "chụp TRTSTATE TRƯỚC khi bấm OK (F20: chụp trước, không chụp sau)", () =>
        {
            before = _db?.Capture(PatNo);
            Kq(tag, "TRTSTATE TRƯỚC: " + (before?.Describe() ?? "(không có DB)"));
        });

        Step(tag, "bấm リセット rồi trả lời OK", () =>
        {
            _guide.ClickReset();
            var ok = Waits.TryUntil(() => MsgBoxWin32.All(App.ProcessId).Count > 0,
                                    TimeSpan.FromSeconds(8));
            Kq(tag, $"   hộp thoại lượt hai bung = {ok}");
            DescribeDialogs(tag, "lượt hai, trước khi bấm OK");

            var dialog = MsgBoxWin32.First(App.ProcessId);
            if (dialog is null) { Kq(tag, "   không có hộp thoại để bấm OK"); return; }

            // PostMessage(BM_CLICK), KHÔNG InvokePattern: Invoke đồng bộ trên một
            // MessageBox modal có thể KHÔNG BAO GIỜ trả về và làm mọi deadline bên dưới
            // thành vô dụng (F18).
            var clicked = MsgBoxWin32.ClickButton(dialog.Hwnd, "OK", "はい", "Yes");
            Kq(tag, "CÂU 1.4 — bấm 「OK」 → " + (clicked
                ? "đã bấm"
                : "KHÔNG trúng; nút thật: " +
                  string.Join(" / ", MsgBoxWin32.ButtonCaptions(dialog.Hwnd))));
        });

        Thread.Sleep(1500);
        _trace.Shot($"{tag}-06-ngay-sau-OK");

        Step(tag, "đọc màn hình NGAY SAU cú OK", () =>
        {
            DescribeDialogs(tag, "sau OK (có thêm E00024 nào không?)");
            var after = _guide.VisibleNames();
            Kq(tag, $"CÂU 1.4 — list STEP: {stepNamesBefore.Count} → {after.Count} dòng");
            Kq(tag, $"   trước: [{string.Join(" / ", stepNamesBefore.Take(8))}]");
            Kq(tag, $"   sau  : [{string.Join(" / ", after.Take(8))}]");
            Kq(tag, $"   giống hệt = {stepNamesBefore.SequenceEqual(after)}");
            Kq(tag, "   trạng thái: " + GuideState());
            Kq(tag, "   (list rỗng ⇒ getGuidNyuryokuInfo2 bung E00024 và KHÔNG gán lại DataSource " +
                    "⇒ lưới GIỮ NGUYÊN list cũ, frm203002.cs:2013)");
        });

        Step(tag, "so TRTSTATE trước/sau cú OK", () =>
        {
            if (_db is null || before is null) { Kq(tag, "   không có DB — bỏ qua"); return; }

            var after = _db.Capture(PatNo);
            Kq(tag, "TRTSTATE SAU : " + after.Describe());
            var diff = GuideResetDb.Diff(before, after);
            Kq(tag, diff.Count == 0
                ? "⇒ cú OK KHÔNG ghi gì (đúng như setResetData rơi vào default: break khi val = 0)"
                : $"⇒ cú OK ĐÃ GHI {diff.Count} ô: " + string.Join(" · ", diff));
        });

        Dismiss(tag);
    }

    /// <summary>
    /// Trả <c>TRTSTATE</c> về nguyên trạng nếu nhánh OK đã kịp ghi gì.
    ///
    /// <para>Chụp lại ở đây chứ không giữ mốc từ testcase: fixture có thể bị
    /// <c>[CancelAfter]</c> cắt giữa <c>RunOneScenario</c>, và khi đó cái duy nhất còn
    /// đáng tin là bản chụp đầu lượt đã IN RA STDOUT (F20).</para>
    /// </summary>
    [OneTimeTearDown]
    public void ResetProbeOneTimeTearDown()
    {
        if (_db is null || _trtStateAtStart is null) return;
        try
        {
            var now = _db.Capture(PatNo);
            Log($"=== KQ-cleanup === TRTSTATE lúc kết thúc: {now.Describe()}");
            Log("=== KQ-cleanup === " + _db.Restore(_trtStateAtStart));
        }
        catch (Exception e) { Log("=== KQ-cleanup === KHÔNG trả lại được TRTSTATE: " + e.Message); }
    }
}
