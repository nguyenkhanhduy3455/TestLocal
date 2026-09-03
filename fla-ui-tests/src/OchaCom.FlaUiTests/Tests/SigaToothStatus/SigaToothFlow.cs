using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.SigaToothStatus;

/// <summary>
/// Lái BA đường ghi 歯式/根数 của 診療入力, KHÔNG assert gì cả.
///
/// <code>
///   ① nhập 処置    → frm203016.IregCodChk → SigaChg          → update Siga/Kon NGAY, BẬT pSiga_chg
///   ② xoá dòng 抜歯 → frm203002.DeleteRow  → DelExtRec        → update Siga NGAY, KHÔNG bật cờ
///   ③ 病検 Ｐ変更   → ChkBuiDisChg(はい)   → Chk_PModeKesson  → update Siga NGAY, KHÔNG bật cờ
///   ④ F9 登録      → modSave.Save_Data    → SigaChg_Save     → dựng lại 歯式 từ TẬP 処置 đã lưu
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ ĐIỀU KIỆN SỐNG CÒN: <c>ModCommon.pbui</c> ĐỌC TỪ DÒNG ĐANG CÓ CON TRỎ
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>SigaChg</c> KHÔNG nhìn 部位 của 処置 vừa chọn — nó duyệt <c>ModCommon.pbui[0..31]</c>
/// (frm203016.cs:1145-1265), mảng được nạp bởi <c>CommonInp.getGridBuiDisInf()</c> từ
/// <b>cột 8..39 của DÒNG ĐANG CÓ CON TRỎ</b> (CommonInp.cs:594-600), gọi ngay trước khi mở
/// 処置選択 (modMain.cs:286 / :605).
///
/// ⇒ Thứ tự BẮT BUỘC: <b>đặt 部位 cho dòng TRƯỚC, gõ mã 処置 SAU</b>. Làm ngược lại thì
/// <c>pbui</c> toàn 0, không ô nào lọt hai điều kiện <c>0 &lt; v &lt; 10</c> / <c>10 &lt; v &lt; 20</c>,
/// câu <c>update Siga</c> rỗng và KHÔNG BAO GIỜ được phát — testcase đỏ với thông điệp
/// 「WinForm không ghi 歯式」 trong khi WinForm hoàn toàn đúng.
///
/// Đây cũng là chỗ bản web KHÔNG thể giống: bên đó 部位 đi kèm payload của từng dòng, còn
/// ở đây nó là TRẠNG THÁI TOÀN CỤC của phiên chạy. Xem README mục 4.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// DÙNG LẠI, KHÔNG CHÉP
/// ═══════════════════════════════════════════════════════════════════════════════
/// · <see cref="ToothSelectDialog"/> (Infrastructure) — mọi thứ về frm902003「部位選択」.
/// · <see cref="TreatmentGridOps"/> (Tests/TreatmentGrid) — thao tác lưới grdRegi; đã là
///   thứ dùng chung từ khi <c>HighNeedsFlow</c> mượn nó, đây là consumer thứ ba.
/// · <see cref="ParitySaveData.SaveFlow"/> — chuỗi hộp thoại F9 登録.
/// </summary>
public sealed class SigaToothFlow
{
    /// <summary>抜歯 — WinForm hard-code 179 (frm203002.cs:3944, frm203016.cs:1033).</summary>
    public const int ExtractionTrtCd = 179;

    /// <summary>ＥＭＲ — hard-code 122 (frm203016.cs:1024, modSave.cs:770).</summary>
    public const int EmrTrtCd = 122;

    /// <summary>枝番 3 = ＥＭＲ(４根) — đúng điều kiện <c>intN == 3</c>.</summary>
    public const int EmrFourRootSb = 3;

    /// <summary>枝番 0 = ＥＭＲ(１根) — ĐỐI CHỨNG, WinForm KHÔNG ghi 根数 cho nó.</summary>
    public const int EmrOneRootSb = 0;

    /// <summary>歯根嚢胞摘出手術 — hard-code 185 (frm203016.cs:1045, modSave.cs:1031).</summary>
    public const int CystTrtCd = 185;

    /// <summary>枝番 5 = 分割抜歯 — <c>DelExtRec</c> CỐ Ý loại (nó ghi 半歯欠損 SE=2).</summary>
    public const int SplitExtractionSb = 5;

    /// <summary>Hộp thoại của case 185 (frm203016.cs:1047, Q00200).</summary>
    public const string CystConfirmFragment = "歯根嚢胞摘出手術と同時に抜歯手術";

    /// <summary>Xác nhận khi xoá một 部位病名行 (frm203002.cs:3826).</summary>
    public const string DeleteBuiConfirmFragment = "同一部位の処置を全て削除";

    /// <summary>Q00100 của <c>ChkBuiDisChg</c> (frm203002.cs:7241).</summary>
    public const string ApplyChangeFragment = "変更を適用しますか";

    /// <summary>Hộp thoại dirty gate của F9 / F10 戻る (modSave.cs:100-132).</summary>
    public const string DirtyGateFragment = "保存しますか";

    /// <summary>Chặn thao tác lên dòng ngoài tháng đang mở (frm203002.cs:6445).</summary>
    public const string OutOfMonthFragment = "当月以外の操作はできません";

    /// <summary>frm902007「病名選択」 — End = 登録 (frm902007.cs:203).</summary>
    public const string DiseaseDialogId = "frm902007";
    public const string DiseaseTitleFragment = "病名選択";

    /// <summary>frm203016「処置選択」.</summary>
    public const string PickerDialogId = "frm203016";
    public const string PickerGridId = "dgvView";

    /// <summary>Tab 病検 và nút Ｐ変更 (frm203002.Designer.cs:1235 / :1327).</summary>
    public const string ByoukenTabText = "病検";
    public const string PChangeButtonId = "cmdByokenP";
    public const string ByoukenSelId = "txtByokenSel";
    public const string ByoukenGridId = "grdByou";

    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly TreatmentGridOps _grid;

    public SigaToothFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _grid = new TreatmentGridOps(screen);
    }

    public TreatmentGridOps Grid => _grid;
    public TreatmentEntryScreen Screen => _screen;

    // ─────────────────────────────────────────────────────────────────────────
    // Hộp thoại
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Mọi hộp thoại đang mở CÓ NÚT (loại cửa sổ rỗng lọt lưới).</summary>
    public IReadOnlyList<Window> OpenDialogs()
    {
        var list = new List<Window>();
        try
        {
            foreach (var d in ModalDialogs.All(_app, _screen.Window))
            {
                try
                {
                    if (d.FindAllDescendants(cf => cf.ByControlType(ControlType.Button)).Length > 0)
                        list.Add(d);
                }
                catch { /* vừa đóng */ }
            }
        }
        catch { /* */ }
        return list;
    }

    /// <summary>Mô tả mọi hộp thoại đang mở — LUÔN in ra khi một bước không diễn ra như mong đợi.</summary>
    public string DescribeDialogs()
    {
        var dialogs = OpenDialogs();
        if (dialogs.Count == 0) return "(không có hộp thoại nào đang mở)";
        return string.Join(" | ", dialogs.Select(d =>
        {
            try
            {
                var buttons = d.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                               .Select(b => Txt.N(Uia.NameOf(b)))
                               .Where(n => n.Length > 0);
                return $"「{Txt.N(Dialogs.TextOf(d))}」 nút[{string.Join(",", buttons)}]";
            }
            catch { return "(đọc hỏng)"; }
        }));
    }

    /// <summary>Hộp thoại đầu tiên có nội dung chứa <paramref name="fragment"/>; null nếu không có.</summary>
    public Window? Dialog(string fragment) =>
        OpenDialogs().FirstOrDefault(d =>
        {
            try { return Txt.Has(Dialogs.TextOf(d), fragment); }
            catch { return false; }
        });

    /// <summary>Chờ một hộp thoại; null nếu hết giờ.</summary>
    public Window? WaitForDialog(string fragment, TimeSpan timeout) =>
        Waits.TryFor(() => Dialog(fragment), timeout);

    /// <summary>Bấm một nút của hộp thoại rồi chờ nó đóng. false = không có nút nào khớp.</summary>
    public bool Answer(Window dialog, params string[] buttonNames)
    {
        if (!Dialogs.ClickButton(dialog, buttonNames)) return false;
        Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(10));
        return true;
    }

    /// <summary>
    /// Dẹp mọi hộp thoại đang chắn và GHI LẠI NGUYÊN VĂN từng câu.
    ///
    /// <para>PROBE-GUIDELINE 3.4: hộp thoại lạ chắn màn hình thì mọi assert sau đó đổ oan
    /// cho app. Trả về danh sách đã dẹp để testcase in ra thay vì im lặng.</para>
    /// </summary>
    public IReadOnlyList<string> DismissAll(int maxRounds = 6)
    {
        var seen = new List<string>();
        for (var round = 0; round < maxRounds; round++)
        {
            var dialogs = OpenDialogs();
            if (dialogs.Count == 0) break;

            foreach (var d in dialogs)
            {
                string text;
                try { text = Txt.N(Dialogs.TextOf(d)); }
                catch { continue; }

                seen.Add(text);
                if (!Dialogs.ClickButton(d, "いいえ", "No", "キャンセル", "Cancel", "OK", "はい", "Yes"))
                    Dialogs.ClickButtonContaining(d, "戻る");
                Waits.TryUntil(() => !Uia.IsOnScreen(d), TimeSpan.FromSeconds(5));
            }
        }
        return seen;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Chọn dòng để thao tác
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Ô lưới coi như RỖNG: chuỗi trống, hoặc <c>「(null)」</c>.
    ///
    /// <para><c>Uia.ValueOf</c> lui về <c>NameOf</c> khi ô không có giá trị, và cầu MSAA của
    /// <c>DataGridView</c> trả về đúng chữ <c>「(null)」</c> cho ô trống. Đo thật 2026-09-03
    /// (probe Tc0, KQ-2): mọi ô 部位 của 処置行 đọc ra <c>「(null)」</c>. Không lọc chuỗi này
    /// thì mọi phép thử 「ô có rỗng không」 đều trả false và bộ lọc dòng chọn nhầm dòng
    /// tiêu đề tháng — lượt probe đầu tiên đã chọn đúng dòng đó rồi ném vì rect rỗng.</para>
    /// </summary>
    public static bool IsBlank(string? cell) =>
        Txt.N(cell) is "" or "(null)";

    /// <summary>Dòng lưới KHÔNG phải dòng dữ liệu: tiêu đề tháng, 日計, 合計.</summary>
    private static bool IsSummaryRow(RegiRow r) =>
        Txt.Has(r.Ryo, "日計") || Txt.Has(r.Ryo, "合計") ||
        Txt.Has(r.Ryo, "負担金") || Txt.Has(r.Ryo, "実日数");

    /// <summary>
    /// Dòng 処置 THẬT cuối cùng của lưới — chỗ đứng để chèn dòng mới.
    ///
    /// <para>Đo được 2026-09-03 (probe Tc0, KQ-2), hình dạng thật của <c>grdRegi</c> khi
    /// 診療入力設定 bật 過去データ１画面表示:</para>
    /// <code>
    ///   [0]  (null) | R 08年07月 | (null) | (null) | (null)      ← tiêu đề THÁNG, rect RỖNG
    ///   [1]  20 | 54321|…|(5) | C | - | -                        ← 部位病名行 (点 = 「-」)
    ///   [2]  20 | (null) | 歯科初診料 | 272 | 1                   ← 処置行
    ///   [3]  20 | R 08年07月 合計 | 実日数: 1日 272 点 | …        ← 合計 THÁNG
    ///   …
    ///   [14] 3 | (null) | [負担金 0円]  [日計 339点] | …          ← 日計行
    /// </code>
    /// Ba loại phải loại bỏ, mỗi loại vì một lý do khác nhau:
    /// <list type="bullet">
    ///   <item>tiêu đề tháng — <b>rect rỗng</b>, click vào nó bắn chuột ra (0,0) tức góc
    ///     trái trên DESKTOP (xem <c>TreatmentGridOps.FocusCell</c>);</item>
    ///   <item>日計/合計 — <c>linekbn</c> 10..15 / 99, <c>DeleteRow</c> và <c>AddRow</c>
    ///     đều từ chối (frm203002.cs:3714 / :3843);</item>
    ///   <item>部位病名行 — ô 点 là 「-」, gõ số vào đó bị <c>grdRegi_TextBox_KeyPress</c>
    ///     chặn sạch (frm203002.cs:3599-3640).</item>
    /// </list>
    ///
    /// <para>Lấy dòng <b>CUỐI</b> chứ không phải dòng đầu: lưới xếp tháng cũ trước, tháng
    /// đang mở sau, nên dòng 処置 cuối cùng chắc chắn thuộc tháng đang mở. Dòng của tháng
    /// khác mang <c>linekbn = 99</c> và mọi thao tác lên nó chỉ bung 「当月以外の操作は
    /// できません」.</para>
    /// </summary>
    public RegiRow? InputRow(int limit = 60) =>
        _grid.Snapshot(limit)
             .LastOrDefault(r => Txt.Int(r.Day) is not null
                                 && Txt.Int(r.Ten) is not null
                                 && !IsBlank(r.Ryo)
                                 && !IsSummaryRow(r));

    /// <summary>
    /// Chèn MỘT dòng trống tại con trỏ bằng phím <c>Insert</c> (frm203002.cs:3570 →
    /// <c>AddRow</c> :3703) rồi trả về dòng trống đó.
    ///
    /// <para><b>Vì sao phải chèn thay vì gõ đè lên dòng có sẵn.</b> Lưới khai
    /// <c>AllowUserToAddRows = false</c> nên KHÔNG có dòng trống mời nhập ở cuối; gõ mã
    /// vào ô 点 của một dòng đang có 処置 là SỬA chính dòng đó. Với fixture có bấm F9 thì
    /// đó là ghi đè dữ liệu thật của bệnh nhân — chèn dòng mới thì dữ liệu cũ nguyên vẹn
    /// và phần dọn dẹp chỉ việc xoá theo <c>trt_cd</c>.</para>
    ///
    /// <para>Đặt con trỏ vào ô <b>療法・処置</b>: ô 部位 sẽ MỞ 部位選択 khi click, và phím
    /// Insert khi đó rơi vào hộp thoại chứ không vào lưới.</para>
    /// </summary>
    public RegiRow? InsertBlankRow(RegiRow at, TestTrace? trace = null)
    {
        trace?.Step($"dat con tro vao 「{at}」 roi bam Insert (行追加)");
        _grid.FocusCell(at, RegiGrid.Col.Ryo);

        // Editor còn mở thì Insert đi vào TextBox chứ không vào lưới.
        if (_grid.IsEditing()) _grid.Press(VirtualKeyShort.ESCAPE);
        _grid.Press(VirtualKeyShort.INSERT);
        Waits.Step();

        var rows = _grid.Snapshot();
        var blank = rows.FirstOrDefault(r => r.Index == at.Index && IsBlank(r.Ryo))
                    ?? rows.LastOrDefault(r => Txt.Int(r.Day) is not null && IsBlank(r.Ryo) && !IsSummaryRow(r));

        trace?.Note("dong trong sau Insert = " + (blank?.ToString() ?? "KHONG THAY"));
        return blank;
    }

    /// <summary>Dòng CUỐI có 療法・処置 chứa một trong các chuỗi; null nếu không có.</summary>
    public RegiRow? LastRowMatching(params string[] anyOf) => _grid.LastRowMatching(anyOf);

    /// <summary>In cả lưới ra nhật ký — bước đầu tiên của mọi lần đi tìm nguyên nhân.</summary>
    public IReadOnlyList<string> DescribeGrid(int limit = 30) =>
        _grid.Snapshot(limit).Select(r => r.ToString()).ToList();

    // ─────────────────────────────────────────────────────────────────────────
    // ① Đặt 部位 cho một dòng  (部位選択 → 病名選択)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Kết quả một lượt đặt 部位 — đủ để testcase biết chuyện gì thực sự xảy ra.</summary>
    /// <param name="ToothDialogOpened">frm902003 có mở ra không.</param>
    /// <param name="MarkedSlots">Các ô 部位 đang sáng NGAY TRƯỚC khi bấm End.</param>
    /// <param name="DiseaseDialogOpened">frm902007 có mở tiếp không.</param>
    /// <param name="Dialogs">Nguyên văn mọi hộp thoại gặp trên đường.</param>
    public sealed record BuiSetResult(
        bool ToothDialogOpened,
        IReadOnlyList<int> MarkedSlots,
        bool DiseaseDialogOpened,
        IReadOnlyList<string> Dialogs)
    {
        public override string ToString() =>
            $"部位選択={ToothDialogOpened} ô sáng=[{string.Join(",", MarkedSlots)}] " +
            $"病名選択={DiseaseDialogOpened} hộp thoại=[{string.Join(" / ", Dialogs)}]";
    }

    /// <summary>frm902007「病名選択」 đang mở; null nếu không.</summary>
    public Window? DiseaseDialog()
    {
        var byId = _app.Window(DiseaseDialogId);
        if (byId is not null) return byId;
        try
        {
            foreach (var w in _screen.Window.ModalWindows)
                if (Txt.Has(Uia.NameOf(w), DiseaseTitleFragment)) return w;
        }
        catch { /* */ }
        return null;
    }

    /// <summary>End 登録 của 病名選択 (frm902007.cs:203 → <c>btnEndEntry_Click</c>).</summary>
    public bool ConfirmDiseaseDialog(TestTrace? trace = null)
    {
        var dialog = DiseaseDialog();
        if (dialog is null) return false;

        trace?.Step("End 登録 (病名選択)");
        ToothSelectDialog.FocusWindow(dialog);
        Uia.SendKey(Vk.End);
        return Waits.TryUntil(() => DiseaseDialog() is null, TimeSpan.FromSeconds(15));
    }

    /// <summary>
    /// Đặt 部位 của một dòng lưới về ĐÚNG một ô, đi trọn 部位選択 → 病名選択.
    ///
    /// <para><paramref name="milk"/> = true dùng phím A..E (乳歯, giá trị ô 11+). Gõ phím
    /// SỐ cho răng sữa là biến nó thành 永久歯 và nhánh SN/NKon không bao giờ chạy.</para>
    /// </summary>
    public BuiSetResult SetBuiOnRow(RegiRow row, int slot, bool milk, TestTrace? trace = null)
    {
        var seen = new List<string>();

        trace?.Step($"click o 部位 cua dong 「{row}」 de mo 部位選択");
        _grid.FocusCell(row, RegiGrid.Col.Bui);

        var tooth = ToothSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(8));
        if (tooth is null)
        {
            // Click không mở được thì thử Enter — grdRegi_KeyDown cũng gọi OpenDialogBuiAndByou
            // khi con trỏ đang ở cột 部位 (frm203002.cs:3552-3558).
            trace?.Note("click khong mo 部位選択 — thu Enter tren o 部位");
            _grid.Press(VirtualKeyShort.RETURN);
            tooth = ToothSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(8));
        }

        if (tooth is null)
        {
            seen.AddRange(DismissAll());
            return new BuiSetResult(false, [], false, seen);
        }

        ToothSelectDialog.SelectOnlySlot(tooth, slot, milk, trace);
        var marked = ToothSelectDialog.MarkedSlots(tooth);
        trace?.Note($"truoc khi End: o dang sang = [{string.Join(",", marked)}] " +
                    $"(mong doi {slot} = {ToothSelectDialog.DescribeSlot(slot)})");
        trace?.Shot("bui-da-chon");

        ToothSelectDialog.Confirm(tooth, trace);

        var disease = Waits.TryFor(DiseaseDialog, TimeSpan.FromSeconds(12));
        var diseaseOpened = disease is not null;
        if (diseaseOpened)
        {
            trace?.Shot("byoumei-dialog");
            ConfirmDiseaseDialog(trace);
        }

        seen.AddRange(DismissAll());
        return new BuiSetResult(true, marked, diseaseOpened, seen);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ② Nhập 処置 bằng コードモード → 処置選択
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Chế độ nhập hiện tại — nhãn <c>lbInpMode</c> (frm203002.cs:7126).</summary>
    public string InpMode()
    {
        var label = Uia.ById(_screen.Window, "lbInpMode");
        return label is null ? "" : Txt.N(Uia.ValueOf(label));
    }

    /// <summary>Đưa ô 点 về コードモード bằng cách click chính cái nhãn.</summary>
    public bool EnsureCodeMode()
    {
        var label = Uia.ById(_screen.Window, "lbInpMode");
        if (label is null) return false;
        for (var i = 0; i < 3 && !Txt.Same(InpMode(), "コード"); i++)
        {
            var (x, y) = Uia.Center(label);
            Uia.LeftClickPhysical(x, y);
            Thread.Sleep(450);
        }
        return Txt.Same(InpMode(), "コード");
    }

    /// <summary>Gõ một 処置コード vào ô 点 của <paramref name="row"/> rồi Enter.</summary>
    public bool EnterCodeOnRow(RegiRow row, int trtCd, TestTrace? trace = null)
    {
        if (!EnsureCodeMode())
        {
            trace?.Note($"KHONG dua ve duoc コードモード — dang la 「{InpMode()}」");
            return false;
        }

        trace?.Step($"go ma 「{trtCd}」 vao o 点 cua dong 「{row}」 roi Enter");
        _grid.FocusCell(row, RegiGrid.Col.Ten);
        if (!_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(250);
        _grid.Type(trtCd.ToString());
        _grid.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(1200);
        return true;
    }

    /// <summary>Hộp thoại 処置選択 đang mở (nhận ra bằng lưới <c>dgvView</c>); null nếu không.</summary>
    public Window? Picker()
    {
        var byId = _app.Window(PickerDialogId);
        if (byId is not null) return byId;
        try
        {
            foreach (var w in _screen.Window.ModalWindows)
                if (Uia.ById(w, PickerGridId) is not null && !Txt.Has(Uia.NameOf(w), DiseaseTitleFragment))
                    return w;
        }
        catch { /* */ }
        return null;
    }

    /// <summary>Một dòng của 処置選択: コード / 枝番 / 名称 / 点数.</summary>
    public sealed record PickRow(int Index, AutomationElement Element, string Code, string Sub, string Name, string Point)
    {
        public override string ToString() => $"[{Index}] {Code}/{Sub} 「{Name}」 {Point}点";
    }

    /// <summary>Nội dung lưới <c>dgvView</c> của 処置選択 — đã lọc dòng tiêu đề 「Top Row」.</summary>
    public IReadOnlyList<PickRow> PickerRows(Window picker, int limit = 60)
    {
        var grid = Uia.ById(picker, PickerGridId);
        if (grid is null) return [];

        var rows = new List<PickRow>();
        var index = 0;
        foreach (var element in new WinFormsGrid(grid).RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();
            if (cells.Count < 2) continue;

            // Dòng tiêu đề lọt vào danh sách y như ở grdRegi — lọc theo NỘI DUNG ô đầu.
            var code = Txt.N(Uia.ValueOf(cells[0]));
            if (Txt.Int(code) is null) continue;

            rows.Add(new PickRow(
                index++,
                element,
                code,
                cells.Count > 1 ? Txt.N(Uia.ValueOf(cells[1])) : "",
                cells.Count > 2 ? Txt.N(Uia.ValueOf(cells[2])) : "",
                cells.Count > 3 ? Txt.N(Uia.ValueOf(cells[3])) : ""));
        }
        return rows;
    }

    /// <summary>
    /// Chốt dòng có 枝番 đúng bằng <paramref name="trtSb"/> — double-click, đường lui là
    /// click đơn + Enter.
    ///
    /// <para>Chốt theo 枝番 chứ KHÔNG theo chỉ số dòng: thứ tự 枝番 trong master không
    /// bảo đảm, và 179 có tận 10 枝番 mà chỉ vài cái đi vào nhánh <c>DelExtRec</c>.</para>
    /// </summary>
    public bool CommitPick(Window picker, int trtSb, TestTrace? trace = null)
    {
        var rows = PickerRows(picker);
        trace?.Note($"処置選択 co {rows.Count} dong: " + string.Join(" · ", rows.Take(12)));

        var target = rows.FirstOrDefault(r => Txt.Int(r.Sub) == trtSb);
        if (target is null)
        {
            trace?.Note($"KHONG thay dong 枝番 = {trtSb} trong 処置選択");
            return false;
        }

        var cells = Uia.Children(target.Element).ToList();
        if (cells.Count == 0) return false;

        var (x, y) = Uia.Center(cells[Math.Min(2, cells.Count - 1)]);
        trace?.Do($"double-click dong 枝番 {trtSb} 「{target.Name}」", () => Uia.DoubleClickPhysical(x, y));

        if (WaitUntilPickerCommitted()) return true;

        // ⚠️ Picker đã đóng nhưng vòng chờ quá chậm ⇒ đi đường lui là gõ Enter vào LƯỚI.
        if (Picker() is null) return true;

        trace?.Do("double-click khong an — click don roi Enter", () =>
        {
            Uia.LeftClickPhysical(x, y);
            Thread.Sleep(250);
            Keyboard.Press(VirtualKeyShort.RETURN);
        });
        return WaitUntilPickerCommitted();
    }

    /// <summary>
    /// Đã chốt xong chưa — 処置選択 đóng lại HOẶC một hộp thoại đã bung ra.
    ///
    /// <para>Phải nhận cả vế thứ hai: <c>IregCodChk</c> chạy ở dòng cuối của
    /// <c>frmTrtSel_Let_Trt_Data</c> (frm203016.cs:1629), tức VẪN TRONG hàm xử lý của form;
    /// <c>MsgBox</c> nó bung ra chặn luồng UI nên frm203016 chưa kịp đóng chừng nào câu hỏi
    /// còn đó. Case 185 luôn rơi vào nhánh này.</para>
    /// </summary>
    private bool WaitUntilPickerCommitted(int seconds = 25) =>
        Waits.TryUntil(() => Picker() is null || OpenDialogs().Count > 0, TimeSpan.FromSeconds(seconds));

    /// <summary>Đóng 処置選択 mà KHÔNG chọn gì.</summary>
    public bool ClosePicker(Window picker)
    {
        try
        {
            var btn = Uia.Descendants(picker).FirstOrDefault(
                e => Uia.ControlTypeOf(e) == ControlType.Button && Txt.Has(Uia.NameOf(e), "戻る"));
            if (btn is not null) Uia.Click(btn);
        }
        catch { /* vừa đóng */ }
        return Waits.TryUntil(() => Picker() is null, TimeSpan.FromSeconds(6));
    }

    /// <summary>Kết quả một lượt nhập 処置 — mọi thứ testcase cần để kết luận đúng địa chỉ.</summary>
    public sealed record EnterResult(
        bool CodeTyped,
        bool PickerOpened,
        bool Committed,
        IReadOnlyList<string> Dialogs)
    {
        public bool Ok => CodeTyped && PickerOpened && Committed;

        public override string ToString() =>
            $"gõ mã={CodeTyped} 処置選択={PickerOpened} chốt={Committed} " +
            $"hộp thoại=[{string.Join(" / ", Dialogs)}]";
    }

    /// <summary>
    /// Nhập trọn một 処置: gõ mã → 処置選択 → chốt 枝番 → trả lời các hộp thoại.
    ///
    /// <para><paramref name="answerYes"/> là câu trả lời cho hộp thoại nghiệp vụ bung ra
    /// SAU khi chốt (case 185 「…同時に抜歯手術…」). null = dẹp bằng 「いいえ」.</para>
    /// </summary>
    public EnterResult EnterTreatment(RegiRow row, int trtCd, int trtSb, bool? answerYes = null,
                                      TestTrace? trace = null)
    {
        var seen = new List<string>();

        if (!EnterCodeOnRow(row, trtCd, trace))
            return new EnterResult(false, false, false, seen);

        var picker = Waits.TryFor(Picker, TimeSpan.FromSeconds(20));
        if (picker is null)
        {
            trace?.Note("処置選択 KHONG mo — hop thoai dang mo: " + DescribeDialogs());
            seen.AddRange(DismissAll());
            return new EnterResult(true, false, false, seen);
        }

        trace?.Shot("処置選択-mo");
        var committed = CommitPick(picker, trtSb, trace);

        // Hộp thoại nghiệp vụ của IregCodChk (185, 困難者加算…) — trả lời rồi ghi lại.
        var dialog = Waits.TryFor(() => OpenDialogs().FirstOrDefault(), TimeSpan.FromSeconds(4));
        while (dialog is not null)
        {
            string text;
            try { text = Txt.N(Dialogs.TextOf(dialog)); }
            catch { break; }
            seen.Add(text);
            trace?.Note($"hop thoai sau khi chot: 「{text}」");
            trace?.Shot("hop-thoai-sau-chot");

            var yes = answerYes == true && Txt.Has(text, CystConfirmFragment);
            if (!Dialogs.ClickButton(dialog, yes ? ["はい", "Yes"] : ["いいえ", "No", "OK"]))
                Dialogs.ClickButtonContaining(dialog, "戻る");
            Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(10));

            dialog = Waits.TryFor(() => OpenDialogs().FirstOrDefault(), TimeSpan.FromSeconds(3));
        }

        // Sau khi chốt, app mở editor ô 回 — Enter để đóng, nếu không phím sau rơi vào editor.
        if (_grid.IsEditing())
        {
            trace?.Note($"editor dang mo voi 「{_grid.EditorText()}」 — Enter de dong");
            _grid.Press(VirtualKeyShort.RETURN);
        }

        return new EnterResult(true, true, committed || Picker() is null, seen);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ③ Xoá dòng — DeleteRow → DelExtRec
    // ─────────────────────────────────────────────────────────────────────────

    /// <param name="ConfirmAsked">Có bung 「同一部位の処置を全て削除します」 không.</param>
    /// <param name="RowGone">Dòng đã rời lưới chưa.</param>
    public sealed record DeleteResult(bool ConfirmAsked, bool RowGone, IReadOnlyList<string> Dialogs)
    {
        public override string ToString() =>
            $"confirm={ConfirmAsked} dòng biến mất={RowGone} hộp thoại=[{string.Join(" / ", Dialogs)}]";
    }

    /// <summary>
    /// Đặt con trỏ vào dòng rồi bấm <c>Delete</c> (frm203002.cs:3570-3578 → <c>DeleteRow</c>).
    ///
    /// <para>Bấm 「はい」 cho 同一部位 confirm nếu nó bung; dòng 部位病名行 mới hỏi câu này
    /// (cột ẩn 51 = 1), dòng thường thì xoá thẳng.</para>
    ///
    /// <para>⚠️ Đặt con trỏ vào ô <b>療法・処置</b> chứ không phải ô 部位: click vào ô 部位 sẽ
    /// MỞ 部位選択 (frm203002.cs:1686-1697) và phím Delete rơi vào hộp thoại đó, xoá sạch
    /// 32 ô răng thay vì xoá dòng.</para>
    /// </summary>
    public DeleteResult DeleteRow(RegiRow row, TestTrace? trace = null)
    {
        var seen = new List<string>();
        var marker = row.Ryo;

        trace?.Step($"dat con tro vao o 療法 cua dong 「{row}」 roi bam Delete");
        _grid.FocusCell(row, RegiGrid.Col.Ryo);
        _grid.Press(VirtualKeyShort.DELETE);

        var confirm = WaitForDialog(DeleteBuiConfirmFragment, TimeSpan.FromSeconds(6));
        var asked = confirm is not null;
        if (asked)
        {
            var text = Txt.N(Dialogs.TextOf(confirm!));
            seen.Add(text);
            trace?.Note($"confirm xoa: 「{text}」 → bam はい");
            trace?.Shot("confirm-xoa-dong");
            Answer(confirm!, "はい", "Yes");
        }

        var gone = Waits.TryUntil(
            () => marker.Length == 0 || _grid.CountRyoContaining(marker) == 0,
            TimeSpan.FromSeconds(10));

        seen.AddRange(DismissAll());
        return new DeleteResult(asked, gone, seen);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ④ Tab 病検 → Ｐ変更 → Chk_PModeKesson
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Chuyển sang tab 病検 của panel bên phải.</summary>
    public bool OpenByoukenTab(TestTrace? trace = null)
    {
        var tab = Uia.ByIdOrName(_screen.Window, "tabPageByou", ByoukenTabText, ControlType.TabItem)
                  ?? Uia.Descendants(_screen.Window, maxDepth: 10).FirstOrDefault(
                      e => Uia.ControlTypeOf(e) == ControlType.TabItem && Txt.Has(Uia.NameOf(e), ByoukenTabText));
        if (tab is null)
        {
            trace?.Note($"khong thay tab 「{ByoukenTabText}」");
            return false;
        }

        trace?.Step($"chuyen sang tab 「{ByoukenTabText}」");
        Uia.MouseClick(tab);
        Waits.Step();
        return Waits.TryUntil(() => Uia.ById(_screen.Window, PChangeButtonId) is not null,
                              TimeSpan.FromSeconds(6));
    }

    /// <summary>Nút Ｐ変更 của tab 病検; null nếu tab chưa mở.</summary>
    public AutomationElement? PChangeButton() => Uia.ById(_screen.Window, PChangeButtonId);

    /// <summary>Các dòng 病検 đang có (lưới <c>grdByou</c>) — để biết MonthP gom được gì.</summary>
    public IReadOnlyList<string> ByoukenRows(int limit = 20)
    {
        var grid = Uia.ById(_screen.Window, ByoukenGridId);
        if (grid is null) return [];
        return new WinFormsGrid(grid).Rows(limit).Select(r => r.ToString()).ToList();
    }

    /// <summary>Kết quả một lượt bấm Ｐ変更.</summary>
    /// <param name="ToothDialogOpened">
    /// 部位選択 có mở không. KHÔNG mở nghĩa là <c>MonthP</c> không gom được dòng nào mang
    /// 病名 Ｐ(103) / Ｇ(104) — WinForm khi đó IM LẶNG không làm gì (frm203002.cs:6365-6383),
    /// KHÔNG có câu 「当月にＰ／Ｇの病名がありません。」 như bản web.
    /// </param>
    public sealed record PChangeResult(bool ButtonFound, bool ToothDialogOpened, Window? ToothDialog,
                                       IReadOnlyList<string> Dialogs);

    /// <summary>Bấm Ｐ変更 rồi chờ 部位選択.</summary>
    public PChangeResult PressPChange(TestTrace? trace = null)
    {
        var seen = new List<string>();
        var button = PChangeButton();
        if (button is null) return new PChangeResult(false, false, null, seen);

        trace?.Step("bam nut Ｐ変更 (cmdByokenP)");
        Uia.MouseClick(button);
        Waits.Step();

        var tooth = ToothSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(15));
        if (tooth is null)
        {
            trace?.Note("Ｐ変更 KHONG mo 部位選択 — hop thoai dang mo: " + DescribeDialogs());
            seen.AddRange(DismissAll());
        }
        else
        {
            trace?.Shot("pchange-buidialog");
        }
        return new PChangeResult(true, tooth is not null, tooth, seen);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ⑤ F10 戻る — dirty gate
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Bấm F10 戻る và trả lời dirty gate.
    ///
    /// <para>「いいえ」 gọi <c>RestoreData</c> → <c>Restore_SK</c> (modSave.cs:453-462) —
    /// tức là đường HOÀN TÁC 歯式, nhưng chỉ chạy cho những cột có cờ <c>pSiga_chg</c> /
    /// <c>pKon_chg</c>. Đó chính là chỗ ba đường ghi khác nhau (SigaChg bật cờ; DelExtRec
    /// và Chk_PModeKesson thì không).</para>
    ///
    /// <para>⚠️ Trả lời 「いいえ」 làm màn hình 診療入力 ĐÓNG LẠI — testcase sau phải
    /// <c>ReopenTreatmentScreen</c>.</para>
    /// </summary>
    /// <param name="answer">「はい」 = Yes (LƯU THẬT), 「いいえ」 = No, 「キャンセル」 = Cancel.</param>
    public sealed record BackResult(bool GateAsked, string GateText, string DefaultButton, bool ScreenClosed);

    public BackResult PressBack(string answer, TestTrace? trace = null)
    {
        trace?.Step("bam F10 戻る");
        var btn = Uia.ById(_screen.Window, "btnF10");
        if (btn is not null) Uia.MouseClick(btn);
        else Uia.SendKey(Vk.F10);
        Waits.Step();

        var gate = WaitForDialog(DirtyGateFragment, TestSettings.Current.Parity.DialogTimeout);
        if (gate is null)
        {
            trace?.Note("F10 KHONG bung dirty gate — hop thoai dang mo: " + DescribeDialogs());
            return new BackResult(false, "", "", !Uia.IsOnScreen(_screen.Window));
        }

        var text = Txt.N(Dialogs.TextOf(gate));
        var defaultButton = FocusedButtonName();
        trace?.Note($"dirty gate: 「{text}」 — nut mac dinh 「{defaultButton}」 → tra loi 「{answer}」");
        trace?.Shot("dirty-gate");

        Dialogs.ClickButton(gate, answer);
        Waits.TryUntil(() => !Uia.IsOnScreen(gate), TimeSpan.FromSeconds(20));

        var closed = Waits.TryUntil(() => !Uia.IsOnScreen(_screen.Window), TimeSpan.FromSeconds(10));
        return new BackResult(true, text, defaultButton, closed);
    }

    /// <summary>
    /// Tên nút đang giữ con trỏ — cách DUY NHẤT đọc được <c>MessageBoxDefaultButton</c>
    /// (UIA không phơi nó ra; Win32 thì giao con trỏ cho nút mặc định).
    /// Phải gọi NGAY khi hộp thoại vừa mở, trước khi bấm gì.
    /// </summary>
    public string FocusedButtonName()
    {
        try
        {
            var focused = _screen.Automation.FocusedElement();
            return focused is null ? "" : Txt.N(Uia.NameOf(focused));
        }
        catch { return ""; }
    }
}
