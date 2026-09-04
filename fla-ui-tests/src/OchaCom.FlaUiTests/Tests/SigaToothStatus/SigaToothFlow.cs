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

    /// <summary>
    /// Hộp thoại .NET 「Unhandled exception has occurred in your application」 — app CHẾT,
    /// không phải app HỎI.
    ///
    /// <para>Nút của nó là <b>Continue / Quit</b>, không phải はい/いいえ/OK, nên mọi vòng
    /// 「dẹp hộp thoại」 thông thường đều trượt và LẶP VÔ HẠN. Đo được 2026-09-04: probe
    /// Tc1e gặp nó rồi quay vòng 13 giây một lượt cho tới khi wrapper cắt ở phút thứ 15 —
    /// đốt trọn một lượt chạy từ xa mà không thu thêm được gì.</para>
    /// </summary>
    public const string CrashDialogFragment = "Unhandled exception has occurred";

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
    public IReadOnlyList<string> DismissAll(int maxRounds = 6, TestTrace? trace = null)
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

                // App chết thì bấm Continue rồi thôi — xem CrashDialogFragment.
                if (Txt.Has(text, CrashDialogFragment))
                {
                    trace?.Note("⛔ APP BUNG UNHANDLED EXCEPTION trong luc dep hop thoai.");
                    Dialogs.ClickButton(d, "Continue");
                    return seen;
                }

                // ⛔ KHÔNG BAO GIỜ có 「はい」/「Yes」 trong danh sách này.
                //
                // Hộp thoại hay chắn màn hình nhất ở đây là dirty gate
                // 「処置データは、変更されています。保存しますか？」, và 「はい」 của nó là
                // modSave.SaveData — XOÁ SẠCH rồi chèn lại TOÀN BỘ 処置行 của tháng. Một
                // hàm mang tên 「dẹp hộp thoại」 mà lỡ tay bấm はい là ghi đè cả tháng dữ
                // liệu bệnh nhân, và không có gì trong log nói cho biết điều đó vừa xảy ra.
                //
                // Không nút nào khớp thì để NGUYÊN hộp thoại và ghi lại nguyên văn:
                // testcase đọc `seen` rồi tự quyết, còn hơn là bấm liều.
                if (!Dialogs.ClickButton(d, "いいえ", "No", "キャンセル", "Cancel", "OK"))
                {
                    if (!Dialogs.ClickButtonContaining(d, "戻る"))
                    {
                        trace?.Note($"KHONG co nut an toan nao de dep hop thoai 「{text}」 — de nguyen.");
                        return seen;
                    }
                }
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

        // ⛔ Editor còn mở thì Insert đi vào TextBox chứ không vào lưới — nhưng TUYỆT ĐỐI
        // KHÔNG dùng ESC để đóng nó.
        //
        // `GradientDataGridView.ProcessDialogKey` trả false khi
        // `RegularOperationEnterKeyDisable = true` (GradientDataGridView.cs:645-668, cờ đặt ở
        // frm203002.Designer.cs:1116) ⇒ ESC KHÔNG được lưới xử lý, nó rơi xuống form thành
        // 戻る và bung 「処置データは、変更されています。保存しますか？」. PROBE-GUIDELINE mục 3.3
        // đã ghi đúng cái bẫy này, và probe Tc1 (2026-09-03) vẫn dính: hộp thoại đó chắn màn
        // hình, cú click sau đó không mở được 部位選択, InpMode đọc ra rỗng, rồi cả testcase
        // chết với 「không thấy control grdRegi」 — ba triệu chứng, không cái nào chỉ đúng
        // nguyên nhân.
        //
        // Cách đóng editor đúng là DỜI CON TRỎ sang ô khác, y như `TreatmentGridBasicTests.LeaveEditor`.
        if (_grid.IsEditing())
        {
            trace?.Note("editor con sot lai — doi con tro sang o 日 de roi khoi editor (KHONG dung ESC)");
            _grid.FocusCell(at, RegiGrid.Col.Day);
            _grid.FocusCell(at, RegiGrid.Col.Ryo);
        }

        // AddRow chèn MỘT DataRow rồi Move_Txt() — không chạm DB, nhưng lưới vẫn cần một
        // nhịp để dựng lại. `Waits.Step()` KHÔNG đủ: nó là `run.stepMs`, mặc định 0 ⇒ lượt
        // chụp ngay sau đó có thể đọc lưới CŨ và kết luận 「Insert không chèn được」.
        // Đo được 2026-09-03 (probe Tc1 bước 16): đúng cái đó, và nó chỉ lộ ra ở lượt nhập
        // thứ ba khi lưới đã dài thêm. Chờ CÓ ĐIỀU KIỆN theo số dòng, y như
        // `TreatmentGridBasicTests.Tc6`.
        var countBefore = _grid.RowCount();
        _grid.Press(VirtualKeyShort.INSERT);
        var grew = Waits.TryUntil(() => _grid.RowCount() == countBefore + 1, TimeSpan.FromSeconds(10));
        trace?.Note($"so dong: {countBefore} → {_grid.RowCount()} (Insert an? {grew})");

        // ⚠️ 「療法 rỗng」 KHÔNG đủ để nhận ra dòng trống: 部位病名行 cũng có ô 療法 rỗng
        // (nó in 病名 ở ô đó chỉ khi có 病名). Đo được 2026-09-03 (probe Tc1, bước 12):
        // fallback cũ vớ đúng dòng 部位病名行 「Ｂ」 rồi mở lại 部位選択 CỦA NÓ — tức là
        // sửa dòng đang có thay vì tạo dòng mới. Dòng trống thật thì ô 点 cũng rỗng,
        // còn 部位病名行 mang 「-」 (frm203002.Designer.cs — RegiTen ReadOnly cho dòng đó).
        static bool IsEmptyRow(RegiRow r) => IsBlank(r.Ryo) && IsBlank(r.Ten);

        var rows = _grid.Snapshot();
        var blank = rows.FirstOrDefault(r => r.Index == at.Index && IsEmptyRow(r))
                    ?? rows.LastOrDefault(r => Txt.Int(r.Day) is not null && IsEmptyRow(r) && !IsSummaryRow(r));

        trace?.Note("dong trong sau Insert = " + (blank?.ToString() ?? "KHONG THAY"));
        return blank;
    }

    /// <summary>Dòng CUỐI có 療法・処置 chứa một trong các chuỗi; null nếu không có.</summary>
    public RegiRow? LastRowMatching(params string[] anyOf) => _grid.LastRowMatching(anyOf);

    /// <summary>
    /// Dòng ĐẦU TIÊN có 療法・処置 chứa một trong các chuỗi; null nếu không có.
    ///
    /// <para>Cần cho phép đo 「<c>DelExtRec</c> lấy 部位 ở đâu」: phải xoá dòng 抜歯 NHẬP
    /// TRƯỚC trong khi <c>ModCommon.pbui</c> đang giữ 部位 của dòng nhập SAU. Dùng
    /// <see cref="LastRowMatching"/> ở đó là xoá đúng dòng mà pbui đang giữ, và hai nguồn
    /// trùng nhau ⇒ phép đo không phân biệt được gì.</para>
    /// </summary>
    public RegiRow? FirstRowMatching(params string[] anyOf) =>
        _grid.Snapshot().FirstOrDefault(r => anyOf.Any(w => Txt.Has(r.Ryo, w)));

    /// <summary>
    /// 部位病名行 CUỐI CÙNG trên lưới — nhận ra bằng ô 点 mang 「-」.
    ///
    /// <para>Đây là dòng mà <c>frmDis_Let_Data</c> vừa ghi 部位/病名 vào, và 処置 nhập ngay
    /// sau đó sẽ thừa kế 部位 của nó (<c>ModMain.AutoBui</c>, frm203002.cs:8654).</para>
    /// </summary>
    public RegiRow? LastBuiLineRow(int limit = 60) =>
        _grid.Snapshot(limit)
             .LastOrDefault(r => Txt.Int(r.Day) is not null && Txt.N(r.Ten) is "-" or "－");

    /// <summary>Dòng ngay SAU <paramref name="row"/> trong lượt quét hiện tại.</summary>
    public RegiRow? RowAfter(RegiRow row, int limit = 60) =>
        _grid.Snapshot(limit).FirstOrDefault(r => r.Index == row.Index + 1);

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

    /// <summary>Ô nhập số/mã của 病名選択 và nhãn cho biết nó đang ở chế độ nào.</summary>
    public const string DiseaseNoBoxId = "txtNo";
    public const string DiseaseNoLabelId = "lblNo";

    /// <summary>
    /// Xác nhận khi bấm End 登録 mà chưa chọn 病名 nào — ĐO ĐƯỢC 2026-09-03 (probe Tc0, KQ-3).
    ///
    /// <para>Trả lời 「いいえ」 ⇒ <c>ComParam</c> về null ⇒ <c>OpenDialogBuiAndByou</c> thoát
    /// sớm và <b>部位 KHÔNG được ghi vào lưới</b>. Lượt probe đầu tiên đã dính đúng bẫy này:
    /// 部位選択 chọn đúng ô 10 nhưng dòng lưới vẫn trắng, và 抜歯 sau đó lấy 部位 của
    /// 部位病名行 CÓ SẴN phía trên (54321) — se4..se8 đổi thay vì se11.</para>
    /// </summary>
    public const string NoDiseaseConfirmFragment = "病名が選択されていません";

    /// <summary>
    /// Chọn một 病名 theo <c>dis_cd</c> trong 病名選択.
    ///
    /// <para>Ô nhập mặc định ở chế độ 「選択番号」 — Enter khi đó so với <c>dsp_cd</c>, tức
    /// SỐ THỨ TỰ trong danh sách, thứ phụ thuộc dữ liệu. Bấm <c>Insert</c> đổi sang
    /// 「コード」 (frm902007.cs:229-232), khi đó Enter so với <c>dis_cd</c> — con số ổn định
    /// mà WinForm hard-code ở nơi khác (Ｐ = 103, Ｇ = 104).</para>
    ///
    /// <para>Không khớp mã nào thì app bung E00024 「該当病名…」 — hàm trả false và để
    /// nguyên hộp thoại cho testcase quyết định.</para>
    /// </summary>
    public bool PickDisease(Window dialog, int disCd, TestTrace? trace = null)
    {
        // ⚠️ ĐƯỜNG NÀY LÀ ĐƯỜNG ĐO ĐƯỢC, đừng đổi lại sang gõ mã vào ô txtNo.
        //
        // Lượt probe Tc1 (2026-09-03) đã thử đúng cách kia: bấm Insert để đổi ô nhập sang
        // 「コード」 (nhãn ĐỔI THẬT, đọc được), gõ 100 rồi Enter — và 病名 vẫn KHÔNG được
        // chọn: End 登録 ngay sau đó bung 「病名が選択されていませんが、よろしいですか?」.
        //
        // Trong khi `dgvView_CellDoubleClick` (frm902007.cs:480-487) gọi thẳng
        // `chkDisSb(e.RowIndex)` — đúng hàm mà nhánh Enter cũng gọi, nhưng không phụ thuộc
        // ô nhập đang ở chế độ nào. Đây cũng là cách 処置選択 được chốt, nên hai hộp thoại
        // dùng chung một kiểu thao tác.
        var rows = DiseaseRowElements(dialog);
        trace?.Note($"病名選択 co {rows.Count} dong: " +
                    string.Join(" · ", rows.Take(12).Select(r => $"{r.Code}={r.Name}")));

        var target = rows.FirstOrDefault(r => Txt.Int(r.Code) == disCd);
        if (target is null)
        {
            trace?.Note($"KHONG thay 病名 dis_cd = {disCd} trong danh sach");
            return false;
        }

        trace?.Step($"病名選択: double-click dong 「{target.Code} {target.Name}」");
        DoubleClickRow(target);
        Thread.Sleep(800);

        var chosen = DiseaseNameText(dialog);
        if (chosen.Length > 0)
        {
            trace?.Note($"病名 da chon: 「{chosen}」");
            return true;
        }

        // Mã có 病名サブコード thì `chkDisSb` ĐỔI lưới sang danh sách サブ và đợi chọn lần
        // nữa (frm902007.cs:787-801) — chỉ mã KHÔNG có サブ mới đi thẳng `defData`.
        //
        // ⚠️ Nhận ra danh sách サブ bằng 「MỌI dòng đều mang cùng một コード」, KHÔNG phải
        // 「dòng đầu đổi」. Đo được 2026-09-03 (probe Tc1): sau khi double-click 「100 Ｃ」,
        // lưới đổi sang 4 cột 選択番号|コード|枝番|病名 với 8 dòng — mà dòng đầu VẪN mang
        // コード 100, đúng bằng dòng đầu của danh sách trước đó. So dòng đầu vì thế luôn
        // kết luận 「không đổi」 và cả bước chọn サブ bị bỏ qua.
        var subRows = DiseaseRowElements(dialog);
        var looksLikeSubList = subRows.Count > 0 && subRows.All(r => Txt.Int(r.Code) == disCd);
        trace?.Note($"chua thay 病名; dang o danh sach サブ? {looksLikeSubList} — " +
                    string.Join(" · ", subRows.Take(8).Select(r => $"{r.Code}/{r.Name}")));
        trace?.Shot("byoumei-sub");

        if (!looksLikeSubList) return false;

        trace?.Step($"病名サブコード: double-click dong dau 「{subRows[0].Code} {subRows[0].Name}」");
        DoubleClickRow(subRows[0]);
        Thread.Sleep(800);

        chosen = DiseaseNameText(dialog);
        trace?.Note($"病名 sau khi chon サブ: 「{chosen}」");
        return chosen.Length > 0;
    }

    /// <summary>Một dòng của lưới 病名選択: 選択番号 / コード / 病名.</summary>
    public sealed record DiseaseRow(int Index, AutomationElement Element, string No, string Code, string Name);

    /// <summary>Các dòng DỮ LIỆU của <c>dgvView</c> trong 病名選択 (đã loại 「Top Row」).</summary>
    public IReadOnlyList<DiseaseRow> DiseaseRowElements(Window dialog, int limit = 60)
    {
        var grid = Uia.ById(dialog, "dgvView");
        if (grid is null) return [];

        var list = new List<DiseaseRow>();
        var index = 0;
        foreach (var element in new WinFormsGrid(grid).RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();
            if (cells.Count < 2) continue;

            var no = Txt.N(Uia.ValueOf(cells[0]));
            if (Txt.Int(no) is null) continue;   // dòng tiêu đề

            // Danh sách chính có 3 cột (選択番号|コード|病名); danh sách サブ có 4
            // (選択番号|コード|枝番|病名). Tên luôn nằm ở ô CUỐI.
            list.Add(new DiseaseRow(
                index++, element, no,
                cells.Count > 1 ? Txt.N(Uia.ValueOf(cells[1])) : "",
                Txt.N(Uia.ValueOf(cells[^1]))));
        }
        return list;
    }

    private static void DoubleClickRow(DiseaseRow row)
    {
        var cells = Uia.Children(row.Element).ToList();
        if (cells.Count == 0) return;
        var (x, y) = Uia.Center(cells[Math.Min(2, cells.Count - 1)]);
        Uia.DoubleClickPhysical(x, y);
    }

    /// <summary>Nội dung lưới <c>dgvView</c> của 病名選択 — để nhật ký cho biết đang thấy danh sách nào.</summary>
    public IReadOnlyList<string> DiseaseRows(Window dialog, int limit = 12)
    {
        var grid = Uia.ById(dialog, "dgvView");
        if (grid is null) return [];
        return new WinFormsGrid(grid).Rows(limit).Select(r => r.ToString()).ToList();
    }

    /// <summary>Chuỗi 病名 đang được dựng trong 病名選択 (ô chữ trên cùng); rỗng = chưa chọn gì.</summary>
    public string DiseaseNameText(Window dialog)
    {
        foreach (var id in new[] { "txtDisNm", "txtDis", "txtName" })
        {
            var box = Uia.ById(dialog, id);
            if (box is not null) return Txt.N(Uia.ValueOf(box));
        }
        // Không biết AutomationId thì lấy Edit ĐẦU TIÊN của dialog — ô 病名 nằm trên cùng.
        var edit = Uia.Descendants(dialog, maxDepth: 6)
                      .FirstOrDefault(e => Uia.ControlTypeOf(e) == ControlType.Edit);
        return edit is null ? "" : Txt.N(Uia.ValueOf(edit));
    }

    /// <summary>
    /// End 登録 của 病名選択 (frm902007.cs:203 → <c>btnEndEntry_Click</c>), có xử lý câu
    /// xác nhận 「病名が選択されていませんが、よろしいですか?」.
    /// </summary>
    /// <param name="acceptNoDisease">
    /// Gặp câu xác nhận thì trả lời 「はい」 (true) hay 「いいえ」 (false). Trả lời いいえ là
    /// HUỶ cả lượt đặt 部位 — xem <see cref="NoDiseaseConfirmFragment"/>.
    /// </param>
    public bool ConfirmDiseaseDialog(TestTrace? trace = null, bool acceptNoDisease = true)
    {
        var dialog = DiseaseDialog();
        if (dialog is null) return false;

        trace?.Step("End 登録 (病名選択)");
        ToothSelectDialog.FocusWindow(dialog);
        Uia.SendKey(Vk.End);

        var confirm = WaitForDialog(NoDiseaseConfirmFragment, TimeSpan.FromSeconds(6));
        if (confirm is not null)
        {
            var answer = acceptNoDisease ? "はい" : "いいえ";
            trace?.Note($"bung 「{Txt.N(Dialogs.TextOf(confirm))}」 → tra loi 「{answer}」");
            trace?.Shot("khong-chon-benh-danh");
            if (!Dialogs.ClickButton(confirm, answer, acceptNoDisease ? "Yes" : "No"))
                Dialogs.ClickButton(confirm, "OK");
            Waits.TryUntil(() => !Uia.IsOnScreen(confirm), TimeSpan.FromSeconds(10));
        }

        return Waits.TryUntil(() => DiseaseDialog() is null, TimeSpan.FromSeconds(15));
    }

    /// <summary>
    /// Đặt 部位 + 病名 cho một dòng lưới, đi trọn 部位選択 → 病名選択.
    ///
    /// <para><paramref name="milk"/> = true dùng phím A..E (乳歯, giá trị ô 11+). Gõ phím
    /// SỐ cho răng sữa là biến nó thành 永久歯 và nhánh SN/NKon không bao giờ chạy.</para>
    ///
    /// <para><paramref name="disCd"/> là <c>dis_cd</c> đem chọn ở 病名選択. <b>Nên luôn
    /// truyền.</b> Bỏ trống thì End 登録 bung 「病名が選択されていませんが、よろしいですか?」
    /// và — kể cả khi trả lời はい — dòng lưới không có 病名, nên nó KHÔNG trở thành
    /// 部位病名行 đúng nghĩa. Với Ｐ変更 thì bắt buộc phải là 103 (Ｐ) hoặc 104 (Ｇ), vì
    /// <c>MonthP</c> chỉ gom hai mã đó (frm203002.cs:7358/:7370).</para>
    ///
    /// <para><b>Sau khi hàm này trả về, con trỏ đã nằm ở ô 点 của một dòng MỚI, đang mở
    /// editor</b> — <c>fDis_Move_Cell</c> (frm203002.cs:8621-8670) dời con trỏ sang dòng
    /// kế rồi <c>CurrentCell = hFG1[3, y]</c>, và <c>frmDis_KeyFunc_EndKey_Method</c>
    /// (:8395-8399) gọi <c>BeginEdit(true)</c>. Đó chính là chỗ gõ mã 処置 tiếp theo, xem
    /// <see cref="EnterTreatmentAtCursor"/>.</para>
    /// </summary>
    public BuiSetResult SetBuiOnRow(RegiRow row, int slot, bool milk, int? disCd = null,
                                    TestTrace? trace = null)
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
            trace?.Note("danh sach 病名: " + string.Join(" · ", DiseaseRows(disease!)));
            if (disCd is { } cd && !PickDisease(disease!, cd, trace))
                trace?.Note($"KHONG chon duoc 病名 dis_cd = {cd} — danh sach dang hien: " +
                            string.Join(" · ", DiseaseRows(disease!)));
            ConfirmDiseaseDialog(trace);
        }

        return new BuiSetResult(true, marked, diseaseOpened, seen);
    }

    /// <summary>
    /// Gõ mã 処置 vào ĐÚNG chỗ con trỏ mà app vừa đặt, KHÔNG click lại ô nào.
    ///
    /// <para>Dùng ngay sau <see cref="SetBuiOnRow"/>: <c>fDis_Move_Cell</c> đã đưa con trỏ
    /// tới ô 点 của dòng mới và mở editor, còn <c>ModMain.AutoBui</c> đã chép 部位 sang dòng
    /// đó. Click lại là tự phá: mỗi cú click có thể rơi vào ô 部位 (mở lại 部位選択), và
    /// chỉ số dòng thì đã xê dịch vì app vừa chèn thêm dòng.</para>
    ///
    /// <para>⚠️ <see cref="EnsureCodeMode"/> phải chạy TRƯỚC cả chuỗi 部位選択: nó click vào
    /// nhãn <c>lbInpMode</c>, mà click là dời tiêu điểm ra khỏi lưới.</para>
    /// </summary>
    public bool EnterCodeAtCursor(int trtCd, TestTrace? trace = null)
    {
        if (!Txt.Same(InpMode(), "コード"))
        {
            trace?.Note($"CANH BAO — InpMode dang la 「{InpMode()}」, o 点 se hieu {trtCd} la SO DIEM");
            return false;
        }

        trace?.Step($"go ma 「{trtCd}」 tai cho con tro (o 点 cua dong moi) roi Enter");

        // ⚠️ Con trỏ CHỈ nằm sẵn trong editor của lưới khi 病名選択 đăng ký mà KHÔNG có 病名 nào.
        //
        // Đo được 2026-09-03 (probe Tc1): đăng ký CÓ 病名 thì `frmDis_KeyFunc_EndKey_Method`
        // rẽ nhánh 「病名入力あり」 và — với `pInpOpt[9] == 1` như máy test — bắn F4 rồi
        // `txtGuid1Sel.Focus()` (frm203002.cs:8376-8384): panel bên phải nhảy sang tab ガイド
        // và tiêu điểm rời khỏi lưới. Gõ tiếp lúc đó là gõ vào ô 選択№ của ガイド.
        // Nhánh 「病名入力なし」 (:8393-8398) mới `grdRegi.Focus()` + `BeginEdit(true)`.
        //
        // Vì thế: không thấy editor thì tự đưa con trỏ về ô 点 của dòng NGAY DƯỚI 部位病名行
        // vừa dựng — đúng chỗ `fDis_Move_Cell` đã đặt (frm203002.cs:8656 `CurrentCell = hFG1[3, y]`).
        if (!_grid.IsEditing())
        {
            var buiLine = LastBuiLineRow();
            var target = buiLine is null ? null : RowAfter(buiLine);
            trace?.Note($"con tro KHONG o editor cua luoi (app da nhay sang tab ガイド?) — " +
                        $"dua ve o 点 cua dong duoi 部位病名行: {target?.ToString() ?? "KHONG THAY"}");

            if (target is null)
            {
                trace?.Note("khong tim duoc dong de go ma. Luoi:\n  " + string.Join("\n  ", DescribeGrid()));
                return false;
            }

            _grid.FocusCell(target, RegiGrid.Col.Ten);
            if (!_grid.IsEditing())
            {
                _grid.Press(VirtualKeyShort.RETURN);
                Thread.Sleep(250);
            }
        }
        _grid.Type(trtCd.ToString());
        _grid.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(1200);
        return true;
    }

    /// <summary>
    /// Nhập trọn một 処置 từ chỗ con trỏ đang đứng: gõ mã → 処置選択 → chốt 枝番 → trả lời
    /// hộp thoại. Xem <see cref="EnterCodeAtCursor"/> về việc vì sao không click lại.
    /// </summary>
    public EnterResult EnterTreatmentAtCursor(int trtCd, int trtSb, bool? answerYes = null,
                                              TestTrace? trace = null)
    {
        if (!EnterCodeAtCursor(trtCd, trace))
            return new EnterResult(false, false, false, []);
        return FinishTreatmentEntry(trtSb, answerYes, trace);
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
        if (!EnterCodeOnRow(row, trtCd, trace))
            return new EnterResult(false, false, false, []);
        return FinishTreatmentEntry(trtSb, answerYes, trace);
    }

    /// <summary>
    /// Nửa sau của một lượt nhập: chờ 処置選択, chốt 枝番, trả lời hộp thoại nghiệp vụ,
    /// đóng editor ô 回. Dùng chung cho cả hai lối vào (click ô hay gõ tại con trỏ).
    /// </summary>
    private EnterResult FinishTreatmentEntry(int trtSb, bool? answerYes, TestTrace? trace)
    {
        var seen = new List<string>();

        var picker = Waits.TryFor(Picker, TimeSpan.FromSeconds(20));
        if (picker is null)
        {
            trace?.Note("処置選択 KHONG mo — hop thoai dang mo: " + DescribeDialogs());
            seen.AddRange(DismissAll());
            return new EnterResult(true, false, false, seen);
        }

        trace?.Shot("処置選択-mo");
        var committed = CommitPick(picker, trtSb, trace);

        // Hộp thoại nghiệp vụ của IregCodChk (185 抜歯同時, 困難者加算…) — trả lời rồi ghi lại.
        var dialog = Waits.TryFor(() => OpenDialogs().FirstOrDefault(), TimeSpan.FromSeconds(4));
        while (dialog is not null)
        {
            string text;
            try { text = Txt.N(Dialogs.TextOf(dialog)); }
            catch { break; }
            seen.Add(text);
            trace?.Note($"hop thoai sau khi chot: 「{text}」");
            trace?.Shot("hop-thoai-sau-chot");

            // ⛔ App CHẾT thì DỪNG NGAY, đừng cố dẹp: hộp thoại .NET có nút Continue/Quit,
            // không khớp bất cứ tên nào ở đây, nên vòng lặp sẽ quay mãi (đo 2026-09-04).
            if (Txt.Has(text, CrashDialogFragment))
            {
                trace?.Note("⛔ APP BUNG UNHANDLED EXCEPTION — dung vong lap, tra ket qua ve testcase.");
                trace?.Shot("app-crash");
                // Continue = bảo app bỏ qua lỗi và đi tiếp; giữ app sống để còn chụp/đọc tiếp.
                if (!Dialogs.ClickButton(dialog, "Continue"))
                    trace?.Note("khong bam duoc 「Continue」 — de nguyen hop thoai.");
                seen.Add(text);
                return new EnterResult(true, true, committed || Picker() is null, seen);
            }

            // ⛔ CHỐT CỨNG: không đường nào ở đây được phép bấm 「はい」 cho dirty gate.
            // 「はい」 của 「処置データは、変更されています。保存しますか？」 là modSave.SaveData —
            // xoá sạch rồi chèn lại TOÀN BỘ 処置行 của tháng. Chỉ `PressBack` mới được trả
            // lời câu đó, và chỉ khi testcase nói rõ trả lời gì.
            var isDirtyGate = Txt.Has(text, DirtyGateFragment);
            if (isDirtyGate)
                trace?.Note("⛔ gap dirty gate 「保存しますか」 giua luong nhap 処置 — tra loi 「いいえ」. " +
                            "Dung nghia la co mot phim da roi xuong form (ESC? F10? F12?) truoc do.");

            var yes = !isDirtyGate && answerYes == true && Txt.Has(text, CystConfirmFragment);
            if (!Dialogs.ClickButton(dialog, yes ? ["はい", "Yes"] : ["いいえ", "No", "OK"]))
                Dialogs.ClickButtonContaining(dialog, "戻る");
            Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(10));

            dialog = Waits.TryFor(() => OpenDialogs().FirstOrDefault(), TimeSpan.FromSeconds(3));
        }

        // Chốt xong app mở editor ô 回 — Enter để đóng, nếu không phím sau rơi vào editor.
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
    /// <param name="GateAsked">Dirty gate có bung không.</param>
    /// <param name="GateText">Nguyên văn câu hỏi.</param>
    /// <param name="DefaultButton">Nút đang giữ con trỏ lúc hộp thoại vừa mở.</param>
    /// <param name="Buttons">TÊN THẬT của các nút — đọc để biết vì sao một cú bấm trượt.</param>
    /// <param name="Answered">
    /// Cú bấm có TRÚNG nút không. <b>Phải kiểm cái này.</b> Bản đầu chỉ bấm rồi đi tiếp, nên
    /// khi tên nút không khớp tuyệt đối thì hộp thoại nằm lại mà testcase vẫn đọc DB và kết
    /// luận như thể đã trả lời — 「歯式 không đổi」 khi ấy có thể chỉ là 「chưa ai trả lời」.
    /// </param>
    /// <param name="GateClosed">Hộp thoại đã đóng chưa.</param>
    /// <param name="ScreenClosed">Màn hình 診療入力 có đóng theo không.</param>
    public sealed record BackResult(bool GateAsked, string GateText, string DefaultButton,
                                    IReadOnlyList<string> Buttons, bool Answered,
                                    bool GateClosed, bool ScreenClosed)
    {
        public override string ToString() =>
            $"gate={GateAsked} 「{GateText}」 nút=[{string.Join(",", Buttons)}] mặc định=「{DefaultButton}」 " +
            $"bấm trúng={Answered} gate đóng={GateClosed} màn hình đóng={ScreenClosed}";
    }

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
            return new BackResult(false, "", "", [], false, true, !Uia.IsOnScreen(_screen.Window));
        }

        var text = Txt.N(Dialogs.TextOf(gate));
        var defaultButton = FocusedButtonName();
        var buttons = ButtonNames(gate);
        trace?.Note($"dirty gate: 「{text}」 — nut [{string.Join(",", buttons)}], mac dinh 「{defaultButton}」 " +
                    $"→ tra loi 「{answer}」");
        trace?.Shot("dirty-gate");

        // ⚠️ NÚT CỦA MESSAGEBOX MANG TÊN THEO NGÔN NGỮ CỦA WINDOWS, KHÔNG THEO NGÔN NGỮ APP.
        //
        // Đo được 2026-09-03 trên máy test (Windows tiếng Anh): dirty gate có nút
        // [Yes, No, Cancel, Close] — KHÔNG phải [はい, いいえ, キャンセル]. `Dialogs.ClickButton`
        // so khớp TUYỆT ĐỐI nên 「いいえ」 không bao giờ trúng, và nó lặng lẽ trả false.
        //
        // Hậu quả nếu bỏ qua giá trị trả về: hộp thoại nằm lại, testcase vẫn đi tiếp đọc DB,
        // và 「歯式 không đổi」 chỉ nghĩa là 「chưa ai trả lời câu hỏi」. TcGAP6 đã XANH SAI
        // đúng một lượt vì thế. `SaveFlow.PressF9` né được vì nó có sẵn `EnglishOf`.
        var names = answer switch
        {
            "はい" => new[] { "はい", "Yes", "Y" },
            "いいえ" => ["いいえ", "No", "N"],
            _ => ["キャンセル", "Cancel"],
        };
        var answered = Dialogs.ClickButton(gate, names);
        if (!answered)
        {
            trace?.Note($"khong co nut nao ten chinh xac [{string.Join(",", names)}] — thu so khop CHUA chuoi");
            answered = Dialogs.ClickButtonContaining(gate, names);
        }
        if (!answered)
            trace?.Note($"⛔ KHONG BAM DUOC [{string.Join(",", names)}]. Nut that su co: [{string.Join(",", buttons)}]");

        // Hỏi 「còn hộp thoại dirty gate nào đang mở không」 thay vì soi CHÍNH phần tử cũ:
        // trả lời 「いいえ」 làm app đóng luôn màn 診療入力, và khi cửa sổ chủ biến mất thì
        // phần tử MessageBox đã cache thành rác — `IsOnScreen` trên nó không còn nói lên
        // điều gì (đo 2026-09-03: bấm trúng, màn hình ĐÃ đóng, mà nó vẫn báo 「chưa đóng」).
        var gateClosed = Waits.TryUntil(() => Dialog(DirtyGateFragment) is null,
                                        TimeSpan.FromSeconds(20));
        var closed = Waits.TryUntil(() => !Uia.IsOnScreen(_screen.Window), TimeSpan.FromSeconds(10));
        trace?.Note($"gate dong? {gateClosed}   man hinh dong? {closed}");
        return new BackResult(true, text, defaultButton, buttons, answered, gateClosed, closed);
    }

    /// <summary>Tên THẬT của mọi nút trên một hộp thoại — để biết vì sao một cú bấm trượt.</summary>
    public static IReadOnlyList<string> ButtonNames(Window dialog)
    {
        try
        {
            return dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                         .Select(b => Txt.N(Uia.NameOf(b)))
                         .Where(n => n.Length > 0)
                         .ToList();
        }
        catch { return []; }
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
