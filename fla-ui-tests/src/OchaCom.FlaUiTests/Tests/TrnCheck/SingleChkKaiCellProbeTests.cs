using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.HighNeedsFreewd;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.TrnCheck;

/// <summary>
/// <b>PROBE</b> — sau cú 「F9 確定」 của 処置選択 thì con trỏ đáp xuống ô nào, ô đó có ở
/// <b>chế độ nhập</b> (có editor) hay chỉ bôi vàng, và <b>W00100 bung lúc nào</b>.
///
/// <para>Fixture <b>KHÔNG assert</b>: bắt hết ngoại lệ, chụp ảnh sau mỗi bước, in mọi số
/// đo thành dòng <c>=== KQ-… ===</c> (F1).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BA CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="table">
/// <item><term>2.1</term><description>Ngay sau 確定: con trỏ ở ô nào? ô đó có editor
///   (caret) hay chỉ bôi vàng? giá trị trong ô là gì?</description></item>
/// <item><term>2.2</term><description>Ở bước 確定 có MsgBox W00100 nào bung TRƯỚC khi tới
///   ô 回 không?</description></item>
/// <item><term>2.3</term><description>Enter ở ô 回: W00100 bung MẤY LẦN, nội dung
///   gì?</description></item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM — vì sao ba câu này có câu trả lời KHÁC NHAU
/// ═══════════════════════════════════════════════════════════════════════════════
/// Cả hai bước nằm trong CÙNG một hàm <c>grdRegi_TextBox_PreviewKeyDown</c>, nhưng ở
/// HAI <c>case</c> khác nhau của <c>switch</c> theo cột đang chốt:
/// <code>
/// case 3 (点列)   frm203002.cs:5570-5618
///     ret = GetTrtmasCod(...)  → mở 処置選択, và khi nó trả dòng về:
///         txtInp.Text = hFG1[3, y]
///         Move_Cell(eMovePoint.Right)      ← 点 → 回
///         grdRegi.Focus()
///         grdRegi.BeginEdit(true)          ← MỞ EDITOR ở ô 回  (:5601-5604)
///     ⇒ KHÔNG có `new SingleChk` nào trên đường này
///
/// case 4 (回列)   frm203002.cs:5619+
///     …
///     new SingleChk(con, …, (DataTable)grdRegi.DataSource, curRow, 1)   (:5667)
///         → Check.getCheckAnswerSingle  (Check.cs:1322-1467)
///             → MỘT MessageBox W00100 cho MỖI phần tử Chk_list (SingleChk.cs:43-46)
///               KHÔNG gộp trùng
/// </code>
/// <para>Trong cả <c>frm203002.cs</c> chỉ có 5 chỗ <c>new SingleChk</c> đang hoạt động —
/// <c>:5667</c> (chốt ô 回), <c>:8807</c> (danh sách 薬剤), <c>:9056</c> (パック),
/// <c>:9537</c> (ガイド, đúng 1 lần), <c>:9998</c> (薬剤選択) — và <b>không chỗ nào</b> nằm
/// trên đường 処置選択. Đó là cái câu 2.2 đi xác nhận trên máy thật, và cũng là lý do
/// 確定 PHẢI để lại ô 回 ở chế độ nhập: có W00100 bung ngay lúc đó thì hộp thoại cướp mất
/// editor vừa mở.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// MỘT LỆCH VỀ 「CỬA GÕ MÃ」 GIỮA HAI VẾ — ghi ra để đừng so nhầm
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>single-check-w00100.spec.ts</c> gõ mã vào <c>footerTen</c> — ô 点 của <b>dòng 日計</b>
/// (bản web có một dòng chân lưới nhận mã). WinForm không có ô đó: <c>flgInpMode</c> đổi
/// ý nghĩa của ô 点 trên <b>chính dòng 処置</b> đang có con trỏ. Nên ở đây gõ vào ô 点 của
/// một dòng 処置 thật (<see cref="HighNeedsFlow.TargetRow"/>) — cùng cửa
/// <c>IregCodChk</c>, khác chỗ đặt con trỏ. Phần đang đo (con trỏ đáp đâu, W00100 bung
/// mấy lượt) không phụ thuộc chỗ gõ.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// AN TOÀN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <b>KHÔNG ghi DB.</b> Không bấm F9 登録 của frm203002. Dòng 処置 vừa chốt chỉ nằm trong
/// lưới đang mở; đóng màn hình mà trả lời 「いいえ」 cho 「保存しますか」 là sạch.
///
/// <para>⚠️ <b>KHÔNG để <see cref="NuisanceDialogWatcher"/> chạy</b>: SỐ LƯỢNG hộp thoại
/// chính là số đo (F19). Watcher bấm hộ là lượt đo ra 0 và kết luận ngược hẳn sự thật.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY — mỗi ca MỘT LÔ (F7)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
/// .\run-trn-check.ps1 -Case TcK1   # mốc: mã 108, chốt dòng đầu. Trả lời 2.1 + 2.2
/// .\run-trn-check.ps1 -Case TcK2   # mồi CÓ gate: 100-0 歯科初診料. Trả lời 2.3
/// </code>
/// <para>⚠️ Chạy TcK2 trên phiên app SẠCH. <c>app.attachIfRunning = true</c> nên ca thứ
/// hai bám vào app mà ca thứ nhất để lại — mà ca thứ nhất đã gõ đè một dòng 処置, nên
/// 「dòng CUỐI gõ được」 của TcK2 sẽ là dòng khác. Runner tự kill <c>MENU.exe</c> cả
/// trước lẫn sau mỗi lượt (F24), nên chạy hai lệnh riêng là đủ.</para>
/// </summary>
[TestFixture]
[Category("trn-check")]
[Explicit("Probe — chạy tay; không nằm trong lô hồi quy.")]
[NonParallelizable]
[CancelAfter(720_000)]
public sealed class SingleChkKaiCellProbeTests : UiTestBase
{
    /// <summary>
    /// Mã đem gõ — cùng mã mà <c>single-check-w00100.spec.ts</c> dùng (<c>IJYO_TRT_CD</c>).
    /// Master <c>MST_TRT266</c> có 22 枝番 cho mã này nên 処置選択 chắc chắn mở (mã một
    /// 枝番 thì <c>IregCodChk</c> chèn thẳng, không mở picker).
    /// </summary>
    private const string TrtCode = "108";

    /// <summary>
    /// 初診 — mồi của <c>TcK2</c>. Nằm trong danh sách <c>kvFirst_visit</c> của
    /// <c>ChkFirst_visit_date</c> (Check.cs:7207-7213) cùng với 100-1 / 107-0 / 333-50 /
    /// 333-55; 枝番 0 là 歯科初診料.
    ///
    /// <para>100 KHÔNG bị <c>KasanCode</c> chặn — hàm đó chỉ bẫy 101/102/103
    /// (modMain.cs:533) — nên nó đi đường thường và mở 処置選択.</para>
    /// </summary>
    private const string FirstVisitCode = "100";

    private TrnCheckFlow _flow = null!;
    private HighNeedsFlow _entry = null!;
    private TreatmentGridOps _grid = null!;
    private TestTrace _trace = null!;

    protected override string[] NuisanceDialogPatterns => [];

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>
    /// Nhãn của ca đang chạy — đi vào tiền tố <c>=== KQ-… ===</c> của mọi dòng số đo.
    ///
    /// <para>Hai ca dùng CHUNG một thân đo (<see cref="RunProbe"/>) nhưng phải ra hai
    /// nhóm dòng KQ tách biệt: trộn chúng lại thì không còn biết con số nào của mồi nào,
    /// mà mồi CHÍNH LÀ biến độc lập của phép đo (F4).</para>
    /// </summary>
    private string _tag = "K?";

    /// <summary>Mọi dòng số đo mang tiền tố <c>=== KQ-… ===</c> — runner lọc file KQ theo đúng chuỗi đó.</summary>
    private void Kq(string line) => Log($"=== KQ-{_tag} === {line}");

    [SetUp]
    public void ProbeSetUp()
    {
        _flow = new TrnCheckFlow(App, Screen);
        _entry = _flow.Entry;
        _grid = _flow.Grid;
    }

    [TearDown]
    public void ProbeTearDown()
    {
        try
        {
            // Dẹp CUỐI LƯỢT thôi — dẹp sớm là xoá mất số đo.
            var left = MsgBoxWin32.All(App.ProcessId);
            if (left.Count > 0)
                Log("=== KQ-cleanup === hộp thoại còn sót: " + string.Join(" + ", left.Select(d => d.ToString())));
            _entry.DismissAll();
            if (_entry.Picker() is { } p) _entry.ClosePicker(p);
        }
        catch (Exception e) { Log("dọn cuối testcase KHÔNG xong: " + e.Message); }
    }

    /// <summary>Chạy một bước, KHÔNG BAO GIỜ ném (F1).</summary>
    private void Step(string what, Action action)
    {
        Kq("── " + what);
        try { action(); }
        catch (Exception e)
        {
            Kq($"   NÉM: {e.GetType().Name}: {e.Message}");
            try { _trace.Fail(what, e); } catch { /* ảnh hỏng không được làm hỏng probe */ }
        }
    }

    /// <summary>
    /// Ba phép đọc của câu 2.1, gom lại vì chúng chỉ có nghĩa khi đọc CÙNG LÚC.
    ///
    /// <para><c>FocusedCellName</c> rỗng KHÔNG có nghĩa 「không có con trỏ」: ô đang ở chế
    /// độ sửa thì phần tử đang focus là <c>Edit</c> con của CHÍNH LƯỚI, không phải ô —
    /// nên 「tên ô rỗng + IsEditing = true」 chính là chữ ký của 編集モード.</para>
    /// </summary>
    private void DescribeCursor(string when)
    {
        var name = _grid.FocusedCellName();
        var editing = _grid.IsEditing();
        var text = _grid.EditorText();
        Kq($"{when}: ô đang giữ con trỏ = 「{name}」");
        Kq($"{when}: 編集モード (có editor) = {editing}");
        Kq($"{when}: giá trị đọc được    = 「{text}」");
        Kq($"{when}: phần tử focus        = {FocusedDescription()}");
    }

    private string FocusedDescription()
    {
        try
        {
            var focused = App.Automation.FocusedElement();
            if (focused is null) return "(không đọc được)";
            return $"type={Uia.ControlTypeOf(focused)} id=「{Uia.AutomationIdOf(focused)}」 " +
                   $"name=「{Uia.NameOf(focused)}」 legacy=「{Uia.LegacyNameOf(focused)}」 " +
                   $"con={Uia.Children(focused).Take(2).Count()}";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Chọn dòng đem gõ mã — TỰ ĐỌC, không dùng HighNeedsFlow.TargetRow
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Một dòng <c>grdRegi</c> kèm bề rộng ô 点 — thứ quyết định click được hay không.</summary>
    private sealed record GridRow(
        int Index, AutomationElement Element,
        string Day, string Bui, string Ryo, string Ten, string Kai,
        string LineKbn, bool TenCellClickable)
    {
        /// <summary>
        /// Dòng gõ mã được: là 処置行 thật, có ô 点 click được, và không phải dòng tổng.
        ///
        /// <para>Nhận dạng dòng tổng bằng CẢ HAI đường — <c>linekbn</c> 10-15/99 <b>và</b>
        /// nội dung ô 療法・処置 — vì cột ẩn có thể chưa bật, khi đó <c>linekbn</c> đọc ra
        /// rỗng và chỉ còn chữ để bám.</para>
        /// </summary>
        public bool Usable =>
            TenCellClickable
            && Txt.Int(Day) is not null
            && Txt.Int(LineKbn) is not (99 or (>= 10 and <= 15))
            && Ryo.Length > 0 && Ryo != "(null)"
            && !Txt.Has(Ryo, "日計") && !Txt.Has(Ryo, "合計")
            && !Txt.Has(Ryo, "負担金") && !Txt.Has(Ryo, "実日数");

        public override string ToString() =>
            $"[{Index,2}] 日=「{Day}」 部位=「{Bui}」 療法・処置=「{Ryo}」 点=「{Ten}」 回=「{Kai}」 " +
            $"linekbn=「{LineKbn}」 ô点 click được = {TenCellClickable}" +
            (Usable ? "  ⇐ GÕ ĐƯỢC" : "");
    }

    /// <summary>
    /// Quét lưới và <b>kiểm bề rộng ô 点 ngay lúc đọc</b>.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// 🔥 VÌ SAO KHÔNG DÙNG <see cref="HighNeedsFlow.TargetRow"/> — đã đỏ 2026-09-18
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Hàm đó lọc theo <c>r.Name.Length > 0 &amp;&amp; r.Ten is not ("-" or "－")</c>. Nhưng
    /// <c>Uia.ValueOf</c> của một ô <c>DataGridView</c> RỖNG trả về chuỗi <b>「(null)」</b> —
    /// bốn ký tự thật, không phải null — nên một dòng "ma" mà cầu MSAA→UIA dựng ra ở
    /// index 0 đi qua ĐỦ CẢ HAI bộ lọc. Lượt chạy đầu của ca này đọc ra:
    /// <code>
    /// DÒNG đem gõ mã = [0]  |  | (null) | (null) |
    /// NÉM: ô cột 3 của dòng đó đọc ra rect RỖNG {0,0,0,0}
    /// </code>
    /// Đúng dòng ma mà <c>TrnCheck/README.md</c> mục 5 (PROBE 2 Tc2, 2026-08-26) đã ghi —
    /// lần đó nó click ra (0,0) tức góc trái trên Desktop, gõ 「165」 rơi vào type-ahead
    /// của Explorer và mở <c>1.pdf</c> trong Edge, rồi báo 「処置選択 không mở」. Lần này
    /// <c>TreatmentGridOps.FocusCell</c> ném sớm nên hỏng ở đúng chỗ hỏng.
    ///
    /// <para><b>Cách đúng</b>: đọc rect của ô 点 NGAY trong lượt quét và biến nó thành một
    /// điều kiện chọn dòng, thay vì để nó nổ ở bước click. README của luồng này kết luận
    /// 「đường コードモード không dùng được, đi tab 個別」 — nhưng tab 個別 <b>không đi qua
    /// 処置選択</b> nên nó không trả lời được câu 2.1 chút nào. Câu trả lời thật là: lọc
    /// dòng cho đúng.</para>
    ///
    /// <para>Ưu tiên dòng CUỐI trong số dòng gõ được: dòng đầu tháng là 初診料 + một chuỗi
    /// 加算, gõ đè lên chúng làm 自動算定 tính lại cả ngày và bung thêm hộp thoại chẳng liên
    /// quan gì tới phép đo (cùng lý do <c>MenInputFlow.TargetRow</c> ghi).</para>
    /// </summary>
    private IReadOnlyList<GridRow> ReadGrid(int limit = 40)
    {
        var rows = new List<GridRow>();
        var index = 0;

        foreach (var element in Screen.Regi.Grid.RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();
            if (cells.Count <= RegiGrid.Col.Kai) continue;
            if (Uia.ControlTypeOf(cells[0]) is ControlType.Header or ControlType.HeaderItem) continue;

            var rect = Uia.RectOf(cells[RegiGrid.Col.Ten]);
            var clickable = rect is { Width: > 0, Height: > 0 };

            rows.Add(new GridRow(
                index++, element,
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Day])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Bui])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ryo])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ten])),
                Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Kai])),
                cells.Count > ColLineKbn ? Txt.N(Uia.ValueOf(cells[ColLineKbn])) : "",
                clickable));
        }
        return rows;
    }

    /// <summary>Cột <c>BUI_DISP_FLG</c> = 行区分; chỉ đọc được khi cột ẩn đang bật.</summary>
    private const int ColLineKbn = 51;

    /// <summary>
    /// Mọi <b>FORM</b> modal của app đang mở, ngoài 診療入力 và ngoài MessageBox — ĐỌC,
    /// rồi trả về danh sách để người gọi tự quyết định dẹp.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// 🔥 VÌ SAO PHẢI CÓ HÀM NÀY — đã đo sai hai lượt liền, 2026-09-18
    /// ═══════════════════════════════════════════════════════════════════════════
    /// <see cref="DescribeDialogs"/> chỉ quét lớp Win32 <c>#32770</c>, tức CHỈ MessageBox.
    /// Nhưng cú chốt một 処置 có <c>CMTAUTO</c> mở <b>「カルテ記載選択」</b> — đo được
    /// <c>AutomationId = frm203012</c>, nút <c>[… 歯科初診料, F1 部位, F9 確定, F10 戻る …]</c> —
    /// một <c>Form</c> WinForms, <b>không</b> phải MessageBox. Với mã <c>100-0</c> nó bung
    /// ra ngay sau cú Enter ở ô 回, và <see cref="TrnCheckFlow.DrainW00100"/> — cũng chỉ
    /// nhìn <c>#32770</c> — chờ 3s, thấy rỗng, trả về <b>0</b>.
    ///
    /// <para>Con số 0 đó trông y hệt 「luật không bắn」 nhưng thật ra là 「có một cửa sổ
    /// chắn mà phép đo không nhìn thấy」 — đúng bẫy F19, chỉ khác là ở mức <b>FORM</b> chứ
    /// không phải MessageBox. Ảnh chụp cho thấy nó rành rành; log thì không có một dấu
    /// vết nào. Vì thế hàm này in NGUYÊN VĂN mọi form lạ, và người gọi phải gọi nó
    /// TRƯỚC khi kết luận bất cứ điều gì về số lượng W00100.</para>
    /// </summary>
    private IReadOnlyList<Window> DescribeModalForms(string when)
    {
        var forms = new List<Window>();
        try
        {
            foreach (var d in _entry.OpenDialogs())
            {
                // MessageBox đã do DescribeDialogs lo; ở đây chỉ quan tâm FORM.
                if (Uia.ClassNameOf(d) == Dialogs.Win32DialogClass) continue;
                forms.Add(d);
            }
        }
        catch (Exception e) { Kq($"{when}: không quét được form modal — {e.Message}"); }

        if (forms.Count == 0)
        {
            Kq($"{when}: KHÔNG có FORM modal nào (ngoài 診療入力)");
            return forms;
        }

        foreach (var f in forms)
            Kq($"{when}: FORM modal 「{Uia.NameOf(f)}」 id=「{Uia.AutomationIdOf(f)}」 " +
               $"nút [{string.Join(", ", HighNeedsFlow.ButtonNames(f))}]");
        return forms;
    }

    /// <summary>
    /// Đóng các form modal bằng <b>戻る</b> — trên frm203018/frm203019/frm203048 nút đó là
    /// HUỶ (xem chú thích của <c>run-cmt-pack-exit-flg.ps1</c>), nên nó không chốt thêm gì.
    ///
    /// <para>Ghi rõ vào log mỗi lần dẹp: một cửa sổ bị dẹp âm thầm là một biến số biến mất
    /// khỏi phép đo.</para>
    /// </summary>
    private void DismissModalForms(IReadOnlyList<Window> forms)
    {
        foreach (var f in forms)
        {
            var name = Uia.NameOf(f);
            var closed = Dialogs.ClickButtonContaining(f, "戻る", "F10");
            Kq($"   dẹp FORM 「{name}」 bằng 戻る → {(closed ? "đã bấm" : "KHÔNG thấy nút 戻る")}");
            Waits.TryUntil(() => !Dialogs.IsAlive(f), TimeSpan.FromSeconds(10));
        }
    }

    /// <summary>Nguyên văn mọi MessageBox đang mở — ĐỌC, không dẹp (F17).</summary>
    private void DescribeDialogs(string when)
    {
        var open = MsgBoxWin32.All(App.ProcessId);
        if (open.Count == 0)
        {
            Kq($"{when}: KHÔNG có MessageBox nào (quét Win32 #32770 của pid {App.ProcessId})");
            return;
        }
        foreach (var d in open)
        {
            Kq($"{when}: 「{d.Text}」 tiêu đề 「{d.Title}」");
            Kq($"{when}: bộ nút = [{string.Join(" | ", MsgBoxWin32.ButtonCaptions(d.Hwnd))}]");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Hai ca, hai MỒI — và mồi là biến độc lập của phép đo
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// TcK1 — mốc: mã <c>108</c>, chốt dòng ĐẦU của picker (<c>108-0</c>).
    ///
    /// <para>Trả lời câu 2.1 và 2.2. KHÔNG trả lời được 2.3 bằng một con số có ý nghĩa:
    /// đo 2026-09-18 ra <b>0 lượt</b> W00100, mà 0 ở đây nghĩa là 「engine chạy nhưng
    /// <c>Chk_list</c> rỗng cho đúng 処置 này」, không phải 「đường không chạy」. Bằng chứng
    /// engine ĐÃ chạy: 合計 đổi 413 → 405 (dòng OA+オーラ注 11点 bị gõ đè thành 108-0 3点)
    /// và con trỏ rời editor sang ô 点 dòng kế — tức cú Enter đã chốt ĐÚNG cột 回.</para>
    /// </summary>
    [Test]
    [Description("TcK1 — mốc: gõ 108, chốt 108-0. Đo con trỏ + editor sau 確定, và W00100 ở ô 回.")]
    public void TcK1_ProbeConfirmThenKaiCell() => RunProbe("K1", TrtCode, wantSub: null);

    /// <summary>
    /// TcK2 — MỒI CÓ GATE ĐỌC ĐƯỢC: mã <c>100</c> 枝番 <c>0</c> (歯科初診料) trên một dòng
    /// mà <c>trt_dt</c> <b>khác</b> 診療開始日.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO MỒI NÀY, VÀ VÌ SAO 108 KHÔNG ĐỦ
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Trong <c>getCheckAnswerSingle</c> (Check.cs:1322-1467) hầu hết phép kiểm nằm sau
    /// một cờ của <c>INPCONFIG</c> — <c>CHK4_Cmn</c> sau <c>sisu_chk_flg == 0</c>,
    /// <c>CHK5_Cmn</c> sau <c>santei_chk_flg == 0</c>, <c>CHK8_Cmn</c> sau
    /// <c>set_chk_flg == 0</c>. Tenant nào tắt chúng là mọi mồi dựa vào đó im lặng, và
    /// lượt đo ra 0 mà không ai biết vì sao.
    ///
    /// <para><c>ChkFirst_visit_date</c> (Check.cs:7202-7242) <b>KHÔNG có cờ nào</b>, và
    /// điều kiện bắn đọc được trọn vẹn:</para>
    /// <code>
    /// trt_cd/trt_sb ∈ { 100-0, 100-1, 107-0, 333-50, 333-55 }   ← danh sách 初診コード
    ///   &amp;&amp; trt_dt != med_st_dt
    ///     → Errmsg_cmt = "MM/dd {cd}-{sb} {dsp_trt}を算定していますが、" +
    ///                    "診療開始日(MM/dd)と異なります。確認してください。"
    ///     → return false → SetErrorMsg(7, idx)
    /// </code>
    /// <para>Bệnh nhân 10 có 診療開始日 = <b>08/03</b> và có 処置 ở ngày <b>14</b>; ca này
    /// gõ vào dòng CUỐI (ngày 14) nên điều kiện thoả <b>bằng dữ liệu sẵn có, không seed</b>.
    /// Số lượng W00100 đọc được vì thế là số đo THẬT, không phải 0 vì thiếu mồi.</para>
    ///
    /// <para>⚠️ <c>ChkCalcPossible</c>/<c>ChkCalcWarn</c> ở cuối vòng lặp (:1455-1461) có
    /// thể thêm câu nữa (「…が算定可能です。」). Nên con số đọc được là <b>tổng</b>, và danh
    /// sách nguyên văn ở dưới mới nói rõ câu nào của luật nào.</para>
    /// </summary>
    [Test]
    [Description("TcK2 — mồi CÓ gate: gõ 100, chốt 100-0 歯科初診料 trên ngày ≠ 診療開始日 " +
                 "(ChkFirst_visit_date, Check.cs:7202) ⇒ đếm được W00100 thật.")]
    public void TcK2_ProbeKaiCellWithFiringRule() => RunProbe("K2", FirstVisitCode, wantSub: 0);

    /// <summary>
    /// Thân đo dùng chung.
    /// </summary>
    /// <param name="tag">Nhãn nhóm dòng KQ của ca.</param>
    /// <param name="code">Mã 処置 gõ vào ô 点.</param>
    /// <param name="wantSub">
    /// 枝番 phải chốt. <c>null</c> = lấy dòng ĐẦU của picker (mốc TcK1, không quan tâm 枝番);
    /// có giá trị = chốt ĐÚNG 枝番 đó, vì gate của mồi xét tới <c>trt_sb</c>.
    /// </param>
    private void RunProbe(string tag, string code, int? wantSub)
    {
        _tag = tag;
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        Kq($"bệnh nhân {PatNo} · 診療日 {TrtDate:yyyy-MM-dd} · mã đem gõ = {code}" +
           (wantSub is null ? " · chốt dòng ĐẦU của picker" : $" · chốt 枝番 {wantSub}"));

        // ── bước 1: コードモード ──────────────────────────────────────────────
        GridRow? target = null;
        Step("chuyển sang コードモード rồi chọn dòng 処置 để gõ mã", () =>
        {
            Kq($"   入力モード trước = 「{_entry.InpMode()}」");
            var ok = _entry.EnsureCodeMode();
            Kq($"   EnsureCodeMode → {ok}; 入力モード giờ = 「{_entry.InpMode()}」");

            // Bật cột ẩn để đọc được linekbn (cột 51) — không có nó thì 「dòng này là
            // 処置行 hay 日計行」 chỉ suy được từ CHỮ trong ô 療法・処置.
            var revealed = _entry.RevealHiddenColumns(trace);
            Kq($"   bật cột ẩn → {revealed}; đang hiện = {_entry.HiddenColumnsVisible()}");

            var rows = ReadGrid();
            Kq($"   lưới đọc được {rows.Count} dòng:");
            foreach (var r in rows) Kq("      " + r);

            target = rows.LastOrDefault(r => r.Usable);
            Kq("   DÒNG đem gõ mã = " + (target?.ToString() ?? "KHÔNG tìm được dòng nào"));
        });

        if (target is null)
        {
            Kq("DỪNG: không có dòng 処置 nào gõ được (ô 点 phải có rect khác rỗng). " +
                     "Thiếu DỮ LIỆU hoặc lưới đang bị tab khác che — xem ảnh, đừng kết luận về app.");
            return;
        }

        Kq($"合計 trước khi chèn = 「{_grid.AllPoint()}」 " +
                 "(mốc PHỤ — dòng vừa chèn chưa có 回数 nên 合計 có thể KHÔNG đổi; " +
                 "mốc chính là con trỏ + số hộp thoại)");

        // ── bước 2: gõ mã → 処置選択 ─────────────────────────────────────────
        Window? picker = null;
        Step($"gõ 「{code}」 vào ô 点 rồi Enter", () =>
        {
            // KHÔNG dùng HighNeedsFlow.EnterCode: nó gọi lại TargetRow() bên trong và sẽ
            // lấy đúng dòng ma mà ReadGrid vừa loại ra. Gõ vào ĐÚNG dòng đã chọn.
            TypeCodeInto(target, code);
            picker = _entry.WaitForPicker(15);
            Kq("   処置選択 mở = " + (picker is not null));
            if (picker is null)
            {
                DescribeDialogs("khi picker KHÔNG mở");
                Kq("   hộp thoại/cửa sổ đang thấy: " + _entry.DescribeDialogs());
                return;
            }
            foreach (var r in _entry.ReadPicker(picker)) Kq("   picker " + r);
        });
        trace.Shot("02-picker-mo");

        if (picker is null)
        {
            Kq("DỪNG: 処置選択 không mở nên không tới được câu 2.1/2.2/2.3.");
            return;
        }

        // ── bước 3: chọn dòng cần chốt rồi bấm nút F9 確定 CỦA PICKER ────────
        // 枝番 là phần của MỒI, không phải chi tiết kỹ thuật: gate của
        // ChkFirst_visit_date xét CẶP (trt_cd, trt_sb), nên chốt trượt 枝番 là đo một
        // nhánh khác mà vẫn ra một con số trông hợp lý.
        var rowsInPicker = _entry.ReadPicker(picker);
        var pickIndex = 0;
        if (wantSub is { } sub)
        {
            pickIndex = rowsInPicker.FindIndex(
                r => Txt.Int(r.Code) == Txt.Int(code) && Txt.Int(r.Sub) == sub);
            if (pickIndex < 0)
            {
                Kq($"DỪNG: 処置選択 của mã {code} KHÔNG có 枝番 {sub}. Master máy này khác dữ " +
                   "liệu mà ca này dựa vào — đây là thiếu DỮ LIỆU, không phải kết luận về app.");
                return;
            }
            Kq($"   枝番 {sub} nằm ở dòng {pickIndex} của picker: {rowsInPicker[pickIndex]}");
        }

        Kq($"CÂU 2.1/2.2 — chọn dòng {pickIndex} của picker rồi bấm nút 「F9 確定」 CỦA CHÍNH PICKER");
        Step($"click dòng {pickIndex} rồi bấm nút F9 確定 (frm203016.btnF9, :174)", () =>
        {
            ClickPickerRow(picker, pickIndex);

            // Bấm THẲNG NÚT của form cần nhắm, không gửi phím F9: phím tới form đang giữ
            // tiêu điểm, mà 処置選択 / 病名選択 / một hộp thoại lỗi đều có nút F-số riêng
            // (F15 — đã trả giá 2026-09-08 ở TcGAP12).
            var btn = FindF9(picker);
            if (btn is null)
            {
                Kq("   KHÔNG thấy nút F9 của picker; các nút đọc được: " +
                         string.Join(" / ", Uia.Descendants(picker)
                             .Where(e => Uia.ControlTypeOf(e) == ControlType.Button)
                             .Select(e => $"id=「{Uia.AutomationIdOf(e)}」 name=「{Uia.NameOf(e)}」")
                             .Take(20)));
                return;
            }
            Kq($"   nút F9 = id=「{Uia.AutomationIdOf(btn)}」 name=「{Uia.NameOf(btn)}」");

            // GradientButton tự vẽ, KHÔNG có InvokePattern dùng được — phải click chuột
            // thật (F13). Và click chuột trả về NGAY, không chờ handler như Invoke (F18).
            var (x, y) = Uia.Center(btn);
            Uia.LeftClickPhysical(x, y);
        });

        // Hạn NGẮN cố ý (F2): đang đo 「picker đóng chưa」, chờ lâu không mua thêm gì.
        var closed = Waits.TryUntil(() => _entry.Picker() is null, TimeSpan.FromSeconds(15));
        Kq($"処置選択 đã đóng sau 確定 = {closed}");
        trace.Shot("03-ngay-sau-F9-confirm");

        // ── CÂU 2.1 + 2.2, đo NGAY, trước khi chạm bất cứ thứ gì ────────────
        DescribeCursor("CÂU 2.1 · ngay sau 確定");
        DescribeDialogs("CÂU 2.2 · ngay sau 確定");

        // Chờ thêm một nhịp NGẮN rồi đo lại: một hộp thoại lỡ bung vẫn kịp về, mà không
        // đổi 5 giây thành vài phút. 8s là hạn của 「hộp thoại mình tin là KHÔNG tồn tại」.
        var late = Waits.TryUntil(() => MsgBoxWin32.All(App.ProcessId).Count > 0,
                                  TimeSpan.FromSeconds(8));
        Kq($"CÂU 2.2 — chờ thêm 8s: có hộp thoại nào bung muộn = {late}");
        DescribeDialogs("CÂU 2.2 · sau khi chờ thêm 8s");
        DescribeCursor("CÂU 2.1 · sau khi chờ thêm 8s");

        // FORM modal, không chỉ MessageBox — xem DescribeModalForms.
        var formsAfterConfirm = DescribeModalForms("CÂU 2.2 · ngay sau 確定");
        if (formsAfterConfirm.Count > 0)
        {
            Kq("⚠️ có FORM modal chắn SAU cú 確定 (thường là 「カルテ記載選択」/「摘要選択」 của " +
               "CMTAUTO / パック). Dẹp bằng 戻る rồi mới đo tiếp — nếu không thì cú Enter ở " +
               "bước sau rơi vào LƯỚI CỦA FORM ĐÓ, và con số W00100 đọc được là vô nghĩa.");
            DismissModalForms(formsAfterConfirm);
            _trace.Shot("03b-sau-khi-dep-form-modal");
            DescribeCursor("CÂU 2.1 · sau khi dẹp form modal");
        }

        var rowAfterConfirm = _grid.Snapshot().LastOrDefault();
        Kq("dòng CUỐI của lưới sau 確定 = " + (rowAfterConfirm?.ToString() ?? "(không đọc được)"));
        Kq($"合計 sau 確定 = 「{_grid.AllPoint()}」");

        // Có hộp thoại ở đây là chuyện KHÁC HẲN — dẹp nó đi rồi đo tiếp thì câu 2.3 mất
        // nghĩa, nên ghi rõ rồi DỪNG (F15: thấy hộp thoại lạ thì dừng, đừng đi tiếp).
        if (MsgBoxWin32.All(App.ProcessId).Count > 0)
        {
            Kq("⚠️ DỪNG ở đây: có hộp thoại đang mở SAU cú 確定. Câu 2.3 đo 「Enter ở ô 回 " +
                     "bung mấy lượt」 — gõ Enter khi đang có hộp thoại là gửi Enter vào HỘP THOẠI, " +
                     "không vào lưới, và con số đếm được sẽ vô nghĩa. Đọc nguyên văn ở dòng " +
                     "CÂU 2.2 trên đây: đó là W00100 thật, hay là 困難者加算/lỗi khác?");
            Kq("   " + string.Join(" + ", MsgBoxWin32.All(App.ProcessId).Select(d => d.ToString())));
            return;
        }

        // ── bước 4: Enter ở ô 回 ────────────────────────────────────────────
        Kq("CÂU 2.3 — Enter ở ô 回 (KHÔNG click lại: click sẽ đóng editor mà 確定 vừa mở)");
        Step("gửi Enter vào lưới", () =>
        {
            Keyboard.Press(VirtualKeyShort.RETURN);
            Waits.Step();
        });

        // DrainW00100 đọc RỒI bấm OK cho TỪNG hộp thoại và trả về danh sách theo đúng
        // thứ tự bung ra. Phải dùng nó để ĐẾM: MessageBox.Show chặn luồng UI nên tại mỗi
        // thời điểm chỉ có ĐÚNG MỘT cái trên màn hình — đếm bằng một lượt quét thì mọi
        // tình huống đều ra 1.
        var warnings = _flow.DrainW00100(trace);
        Kq($"CÂU 2.3 — W00100 bung {warnings.Count} lượt:");
        // Đọc FORM modal NGAY sau khi drain: 0 lượt W00100 + có form đang chắn = phép đo
        // KHÔNG kết luận được gì, và phải nói ra thay vì để con số 0 đứng một mình.
        var formsAfterKai = DescribeModalForms("CÂU 2.3 · sau Enter ở ô 回");
        if (formsAfterKai.Count > 0)
            Kq("⚠️ CÓ FORM modal chắn ngay sau cú Enter ⇒ con số W00100 ở trên KHÔNG kết " +
               "luận được: W00100 có thể còn đứng sau form này. Chọn mồi 処置 KHÔNG có " +
               "CMTAUTO/パック, hoặc trả lời form rồi drain lần nữa.");
        for (var i = 0; i < warnings.Count; i++) Kq($"   #{i + 1}: 「{warnings[i]}」");
        if (warnings.Count == 0)
            Kq("   (0 lượt — xem lại ảnh: Enter có tới lưới không, ô 回 có đang là ô hiện hành " +
                     "không. `SingleChk` ở :5667 chỉ chạy khi chốt ĐÚNG cột 4)");

        trace.Shot("04-sau-Enter-o-kai");
        DescribeCursor("sau Enter ở ô 回");
        DescribeDialogs("sau Enter ở ô 回");
        Kq("trạng thái lưới: " + _flow.Describe());

        Assert.Pass($"PROBE — đọc các dòng === KQ-{tag} === và ảnh trong artifacts/screenshots/");
    }

    /// <summary>
    /// Đặt con trỏ vào ô 点 của <paramref name="row"/> rồi gõ mã + Enter.
    ///
    /// <para>Click CHUỘT THẬT: <c>DataGridView</c> chỉ dời <c>CurrentCell</c> khi có sự
    /// kiện chuột thật (F13). Rồi Enter để mở editor nếu chưa mở — <c>IregCodChk</c> treo
    /// ở <c>KeyDown</c>/<c>KeyPress</c> nên <c>ValuePattern.SetValue</c> không đi qua nó.</para>
    ///
    /// <para>⚠️ KHÔNG dùng Escape để dọn nếu gõ sai: trên lưới 処置, Escape rơi xuống form
    /// thành 戻る và bung 「保存しますか？」 (F14).</para>
    /// </summary>
    private void TypeCodeInto(GridRow row, string code)
    {
        var cells = Uia.Children(row.Element).ToList();
        var cell = cells[RegiGrid.Col.Ten];
        var rect = Uia.RectOf(cell);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
            throw new InvalidOperationException(
                $"ô 点 của dòng {row} đọc ra rect RỖNG — ReadGrid đã lọc chuyện này, thấy ở đây " +
                "nghĩa là lưới vừa cuộn giữa lượt quét và lượt click.");

        var (x, y) = Uia.Center(cell);
        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(400);
        Kq($"   ô đang giữ con trỏ sau click = 「{_grid.FocusedCellName()}」 " +
                 $"(đang sửa = {_grid.IsEditing()})");

        if (!_grid.IsEditing())
        {
            Keyboard.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(300);
            Kq($"   sau Enter mở editor: đang sửa = {_grid.IsEditing()}");
        }

        Keyboard.Type(code);
        Waits.Step();
        Kq($"   đã gõ 「{code}」, editor đang mang 「{_grid.EditorText()}」");
        Keyboard.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(1200);
    }

    /// <summary>
    /// Nút 「確定」 của 処置選択 — <c>btnF9</c> theo AutomationId, hoặc theo NHÃN 「確定」
    /// (frm203016.cs:71 khai <c>_btnInfo</c> với nhãn đó).
    /// </summary>
    private static AutomationElement? FindF9(Window picker) =>
        Uia.ById(picker, "btnF9")
        ?? Uia.Descendants(picker).FirstOrDefault(
            e => Uia.ControlTypeOf(e) == ControlType.Button && Txt.Has(Uia.NameOf(e), "確定"));

    /// <summary>
    /// Click ĐƠN lên ô 名称 của một dòng <c>dgvView</c> — chỉ để CHỌN dòng, không chốt.
    ///
    /// <para>Lọc dòng tiêu đề theo NỘI DUNG ô đầu (phải là số), không theo chỉ số: 「Top
    /// Row」 lọt vào danh sách dòng dữ liệu ở mọi lưới của app (F11).</para>
    /// </summary>
    private void ClickPickerRow(Window picker, int rowIndex)
    {
        var grid = Uia.ById(picker, "dgvView")
                   ?? throw new InvalidOperationException("処置選択 không có lưới dgvView");

        var dataRows = new WinFormsGrid(grid).RowElements(limit: 60)
            .Where(r =>
            {
                var first = Uia.Children(r).FirstOrDefault();
                return first is not null && Txt.Int(Uia.ValueOf(first)) is not null;
            })
            .ToList();

        if (rowIndex >= dataRows.Count)
            throw new InvalidOperationException(
                $"picker chỉ đọc được {dataRows.Count} dòng dữ liệu, không có dòng {rowIndex}");

        var cells = Uia.Children(dataRows[rowIndex]).ToList();
        var cell = cells[Math.Min(2, cells.Count - 1)];
        var rect = Uia.RectOf(cell);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
            throw new InvalidOperationException(
                $"ô 名称 của dòng {rowIndex} đọc ra rect RỖNG — click vào đó bắn chuột ra (0,0) " +
                "tức góc trái trên DESKTOP, không vào app (xem TreatmentGridOps.FocusCell).");

        var (x, y) = Uia.Center(cell);
        Uia.LeftClickPhysical(x, y);
        Thread.Sleep(400);
        Kq($"   đã click dòng {rowIndex}: " +
                 string.Join(" | ", cells.Take(4).Select(c => Txt.N(Uia.ValueOf(c)))));
    }
}
