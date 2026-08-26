using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

/// <summary>
/// Thao tác của luồng 歯科診療困難者加算 trên <c>frm203002</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HAI CHỖ HỎI — điều kiện KHÁC NHAU
/// ═══════════════════════════════════════════════════════════════════════════
/// Cùng một câu chữ, cùng ghi vào <c>hFG1[72]</c>, nhưng WinForm có <b>hai</b> chỗ
/// bung nó ra, và bản web mới port MỘT:
///
/// <code>
///  A. 自動算定  modSave.cs:3450   else if (kv.item.Key == 105 &amp;&amp; intSins == 3)
///       · CHỈ mã 105, KHÔNG lọc 枝番
///       · nằm trong nhánh `else` của `kv.index == 0` ⇒ pick ĐẦU BỘ không bao giờ hỏi
///       · dis_flg lấy MỘT LẦN cho cả lượt (modSave.cs:3041)
///
///  B. 処置選択  frm203016.cs:1093-1118   IregCodChk(con, trtCd, trtSb)
///       · mã 105 với 枝番 {0,1,2,3,6,7}  ⇒ có lọc 枝番
///       · mã 508 với 枝番 {0,1,6}        ⇒ 歯訪, mà nhánh A KHÔNG hỏi bao giờ
///       · dis_flg đọc lại theo 処置日 CỦA CHÍNH DÒNG (`dt.Rows[idx][78]`)
/// </code>
///
/// Nhánh B là nhánh <b>dễ tới nhất từ giao diện</b>: gõ mã vào ô 点 ở コードモード là
/// tới, không phụ thuộc bệnh nhân đang ở kỳ 初診 hay 再診. Nhánh A cần đúng thời điểm
/// 初再診 nên mong manh hơn nhiều — xem <see cref="TriggerAutoSantei"/>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐỌC ĐƯỢC <c>freewd</c> MÀ KHÔNG CẦN GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Cột 72 là cột ẩn (<c>RegiCol.hideStart = 5</c>, frm203002.cs:161 — mọi cột ≥ 5 đều
/// <c>Visible = false</c>). Nhưng app có sẵn một <b>cửa hậu</b> để bật chúng lên, xem
/// <see cref="RevealHiddenColumns"/>. Nhờ nó luồng này KHÔNG phải bấm F9 登録 và KHÔNG
/// ghi gì xuống DB — giữ đúng nguyên tắc của <see cref="TreatmentEntryScreen"/>.
/// </summary>
public sealed class HighNeedsFlow
{
    /// <summary>歯科診療特別対応加算 (初診/再診) — CommonChk.cs:1225-1230.</summary>
    public const int TrtCdToku = 105;

    /// <summary>歯科診療特別対応加算 (歯科訪問診療) — CommonChk.cs:1231-1233.</summary>
    public const int TrtCdTokuHoumon = 508;

    /// <summary>Chỉ số cột <c>FREEWD</c> trong <c>grdRegi</c> — frm203002.cs:188.</summary>
    public const int ColFreewd = 72;

    /// <summary>Cột đầu tiên bị ẩn — frm203002.cs:161.</summary>
    public const int ColHideStart = 5;

    /// <summary>
    /// Nguyên văn câu hỏi. Đây là chuỗi HARD-CODE trong C# (modSave.cs:3453 và
    /// frm203016.cs:1100 dùng chung y hệt), KHÔNG đi qua <c>MSGTBL</c> — nên so khớp
    /// nguyên chữ được, không cần tra DB như các cảnh báo E000xx.
    /// </summary>
    public const string Question = "著しく歯科診療が困難な患者に対する加算を算定しますか？";

    /// <summary>Tiêu đề hộp thoại — tham số thứ ba của <c>Interaction.MsgBox</c>.</summary>
    public const string QuestionCaption = "特別対応加算";

    /// <summary>
    /// Câu hỏi 特１/特２ — bung ra TRƯỚC, ở khâu dựng bộ pick (modSave.cs:3097 初診 /
    /// :3170 再診). Chuỗi là <c>trt_nm + "を算定しますか？"</c> nên chỉ khớp được phần đuôi.
    /// </summary>
    public const string AddonQuestionTail = "を算定しますか？";

    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly TreatmentGridOps _grid;

    public HighNeedsFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _grid = new TreatmentGridOps(screen);
    }

    public TreatmentGridOps Grid => _grid;

    // ── Hộp thoại ────────────────────────────────────────────────────────────

    /// <summary>Mọi hộp thoại đang mở CÓ NÚT (loại bỏ cửa sổ rỗng lọt lưới).</summary>
    public IReadOnlyList<Window> OpenDialogs()
    {
        var result = new List<Window>();
        foreach (var d in ModalDialogs.All(_app, _screen.Window))
        {
            try
            {
                if (d.FindAllDescendants(cf => cf.ByControlType(ControlType.Button)).Length > 0)
                    result.Add(d);
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return result;
    }

    /// <summary>Mô tả mọi hộp thoại đang mở — luôn in ra khi một khẳng định về dialog đổ.</summary>
    public string DescribeDialogs()
    {
        var parts = new List<string>();
        foreach (var d in OpenDialogs())
        {
            try
            {
                parts.Add($"「{Uia.NameOf(d)}」 nội dung 「{Txt.N(Dialogs.TextOf(d))}」 " +
                          $"nút [{string.Join(", ", ButtonNames(d))}]");
            }
            catch { /* vừa đóng */ }
        }
        return parts.Count == 0 ? "(không có hộp thoại nào)" : string.Join(" | ", parts);
    }

    public static IReadOnlyList<string> ButtonNames(Window dialog)
    {
        try
        {
            return dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                         .Select(b => Txt.N(Uia.NameOf(b)).Replace("&", ""))
                         .Where(n => n.Length > 0)
                         .ToList();
        }
        catch { return []; }
    }

    /// <summary>
    /// Mọi MessageBox (<c>#32770</c>) đang mở của app — kể cả cái NẰM LỒNG trong một
    /// cửa sổ khác.
    ///
    /// <para><b>Vì sao không chỉ quét top-level.</b> Đo thật 2026-08-26: MsgBox mà
    /// <c>IregCodChk</c> bung ra có chủ là <c>frm203016</c> (処置選択), và cầu MSAA→UIA
    /// dựng nó thành CON của cửa sổ chủ. Hệ quả: <c>ModalDialogs.All</c> trả về
    /// frm203016, còn <c>Dialogs.TextOf(frm203016)</c> gom cả chữ của MsgBox vì hàm đó
    /// duyệt <c>FindAllDescendants</c>. Tìm 「cửa sổ nào có chứa câu hỏi」 sẽ trúng
    /// frm203016 — đọc ra tiêu đề 「処置選択」 và 8 nút
    /// <c>[Yes, No, Close, F9 選択, F10 戻る, …]</c>, tức là hợp của hai cửa sổ.</para>
    ///
    /// <para>Nên ở đây lọc theo ClassName <c>#32770</c>, và quét cả hai tầng.</para>
    /// </summary>
    private IEnumerable<Window> MessageBoxes()
    {
        var seen = new HashSet<string>();

        foreach (var w in Candidates())
        {
            string key;
            try { key = string.Join("/", w.Properties.RuntimeId.ValueOrDefault ?? []); }
            catch { continue; }
            if (key.Length > 0 && !seen.Add(key)) continue;
            yield return w;
        }

        IEnumerable<Window> Candidates()
        {
            foreach (var owner in ModalDialogs.All(_app, _screen.Window))
            {
                if (IsMsgBox(owner)) yield return owner;

                AutomationElement[] nested;
                try
                {
                    nested = owner.FindAllDescendants(cf => cf.ByControlType(ControlType.Window));
                }
                catch { continue; }

                foreach (var d in nested)
                    if (IsMsgBox(d)) yield return d.AsWindow();
            }
        }

        static bool IsMsgBox(AutomationElement e)
        {
            try { return Uia.ClassNameOf(e) == Dialogs.Win32DialogClass && Uia.IsOnScreen(e); }
            catch { return false; }
        }
    }

    /// <summary>Hộp thoại 困難者加算 nếu đang mở; null nếu không.</summary>
    public Window? HighNeedsDialog() =>
        MessageBoxes().FirstOrDefault(d => Txt.Has(Txt.N(Dialogs.TextOf(d)), Question));

    /// <summary>Chờ tối đa <paramref name="seconds"/> cho câu hỏi 困難者加算.</summary>
    public Window? WaitForHighNeedsDialog(int seconds = 12)
    {
        Window? hit = null;
        Waits.TryUntil(() => (hit = HighNeedsDialog()) is not null, TimeSpan.FromSeconds(seconds));
        return hit;
    }

    /// <summary>
    /// KHẲNG ĐỊNH câu hỏi KHÔNG bung ra — phải chờ đủ lâu rồi mới kết luận.
    ///
    /// <para>Đây là loại khẳng định dễ xanh sai nhất của cả luồng: hỏi ngay lập tức thì
    /// bao giờ cũng "chưa thấy". Chờ trọn <paramref name="seconds"/> giây, không thoát
    /// sớm.</para>
    /// </summary>
    public bool StaysSilent(int seconds = 6)
    {
        var deadline = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < deadline)
        {
            if (HighNeedsDialog() is not null) return false;
            Thread.Sleep(250);
        }
        return true;
    }

    /// <summary>
    /// Trả lời hộp thoại 困難者加算 và chờ nó đóng.
    ///
    /// <para><b>Tìm LẠI hộp thoại mỗi lượt thay vì tin vào tham chiếu truyền vào.</b>
    /// <c>Dialogs.ClickButton</c> bọc <c>try/catch</c> quanh cả thân hàm, nên một lượt
    /// gọi UIA bị quá hạn cũng trả về <c>false</c> y như 「không có nút nào tên đó」 —
    /// hai chuyện khác hẳn nhau. Máy chạy chậm (đo 2026-08-26: có testcase mất 5m35s
    /// thay vì 2m, riêng một lần chụp màn hình mất 20s) thì lượt click đầu rất dễ trượt,
    /// và TC-A5 đã đỏ đúng vì vậy dù app đang hiện hộp thoại rành rành.</para>
    ///
    /// <para>Nhãn nút lấy theo NGÔN NGỮ WINDOWS chứ không theo UI app — máy đo được
    /// 「Yes」/「No」 tiếng Anh — nên thử cả hai thứ tiếng.</para>
    /// </summary>
    public bool Answer(Window dialog, bool yes)
    {
        string[] names = yes ? ["はい", "Yes"] : ["いいえ", "No"];

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            // Hộp thoại đã tự đóng (ai đó trả lời hộ, hoặc lượt click trước ĐÃ ăn mà
            // ta không kịp thấy) ⇒ coi như xong, đừng bấm thêm vào form phía sau.
            var target = Dialogs.IsAlive(dialog) ? dialog : HighNeedsDialog();
            if (target is null) return true;

            if (Dialogs.ClickButton(target, names))
                return Waits.TryUntil(() => HighNeedsDialog() is null, TimeSpan.FromSeconds(8));

            Thread.Sleep(400);
        }
        return false;
    }

    /// <summary>Nút của hộp thoại 困難者加算 đang mở — để thông điệp assert nói được vì sao hỏng.</summary>
    public string DescribeHighNeedsButtons()
    {
        var d = HighNeedsDialog();
        return d is null
            ? "(hộp thoại không còn mở)"
            : $"[{string.Join(", ", ButtonNames(d))}]";
    }

    /// <summary>Dẹp mọi hộp thoại đang chắn — bấm 「いいえ」 / OK / 戻る.</summary>
    public void DismissAll()
    {
        for (var i = 0; i < 5; i++)
        {
            var open = OpenDialogs();
            if (open.Count == 0) return;
            foreach (var d in open)
            {
                if (Dialogs.ClickButton(d, "いいえ", "No", "OK", "キャンセル", "Cancel")) continue;
                if (!ClosePicker(d)) { try { d.Close(); } catch { /* đã đóng */ } }
            }
            Waits.TryUntil(() => OpenDialogs().Count == 0, TimeSpan.FromSeconds(3));
        }
    }

    // ── 入力モード + gõ mã ────────────────────────────────────────────────────

    public string InpMode()
    {
        var l = Uia.ById(_screen.Window, "lbInpMode");
        return l is null ? "?" : Txt.N(Uia.ValueOf(l));
    }

    /// <summary>Đưa ô 点 về コードモード bằng cách click chính cái nhãn (frm203002.cs:7126).</summary>
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

    /// <summary>
    /// Một dòng 処置 dùng làm chỗ gõ mã — bỏ dòng 日計 và dòng trống.
    ///
    /// <para>Đi qua <see cref="ScanRows"/> chứ KHÔNG qua <c>TreatmentGridOps.Snapshot</c>:
    /// Snapshot đọc TOÀN BỘ ô của tối đa 400 dòng, mà luồng này đã bật cột ẩn nên mỗi
    /// dòng là 81 ô. Đó là chỗ tốn thời gian nhất của cả fixture — đo 2026-08-26, cùng
    /// một testcase chạy 2m11s ở lượt này rồi 5m35s ở lượt sau khi lưới đã dài thêm vài
    /// dòng. Chỉ cần 20 dòng đầu là đủ tìm chỗ đứng.</para>
    /// </summary>
    public RegiRow? TargetRow() =>
        ScanRows(limit: 20)
            .FirstOrDefault(r => r.Ten is not ("-" or "－") && !Txt.Has(r.Name, "日計") && r.Name.Length > 0)
            ?.Row;

    /// <summary>
    /// Gõ một 処置コード vào ô 点 ở コードモード rồi Enter.
    ///
    /// <para>105 và 508 KHÔNG bị <c>KasanCode</c> chặn (modMain.cs:533 chỉ bẫy
    /// 101/102/103) và cũng không nằm trong các nhánh đặc biệt 50/999/333… nên chúng
    /// đi đường thường: mở 処置選択 <c>frm203016</c>.</para>
    /// </summary>
    public bool EnterCode(TestTrace trace, string code)
    {
        DismissAll();
        if (!EnsureCodeMode()) return false;

        var row = TargetRow();
        if (row is null) return false;

        trace.Do($"go ma 「{code}」 vao o 点 roi Enter", () =>
        {
            _grid.FocusCell(row, RegiGrid.Col.Ten);
            if (!_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _grid.Type(code);
            _grid.Press(VirtualKeyShort.RETURN);
        });
        Thread.Sleep(1200);
        return true;
    }

    // ── 処置選択 (frm203016) ─────────────────────────────────────────────────

    /// <summary>Một dòng của <c>dgvView</c>: コード / 枝番 / 名称 / 点数.</summary>
    public sealed record PickRow(int Index, string Code, string Sub, string Name, string Point)
    {
        public override string ToString() => $"[{Index}] {Code}-{Sub} 「{Name}」 {Point}点";
    }

    /// <summary>Hộp thoại 処置選択 đang mở (có lưới <c>dgvView</c>); null nếu không.</summary>
    public Window? Picker() =>
        OpenDialogs().FirstOrDefault(d => Uia.ById(d, "dgvView") is not null);

    public Window? WaitForPicker(int seconds = 12)
    {
        Window? hit = null;
        Waits.TryUntil(() => (hit = Picker()) is not null, TimeSpan.FromSeconds(seconds));
        return hit;
    }

    /// <summary>Đọc nội dung lưới <c>dgvView</c> (frm203016.Designer.cs:126).</summary>
    public List<PickRow> ReadPicker(Window dialog, int limit = 40)
    {
        var rows = new List<PickRow>();
        var grid = Uia.ById(dialog, "dgvView");
        if (grid is null) return rows;

        var index = 0;
        foreach (var r in new WinFormsGrid(grid).Rows(limit))
        {
            var c = r.Cells;
            if (c.Count < 4) continue;
            // Dòng tiêu đề lọt vào thì cột đầu là chữ 「コード」, không phải số.
            if (Txt.Int(c[0]) is null) continue;
            rows.Add(new PickRow(index++, c[0], c[1], c[2], c[3]));
        }
        return rows;
    }

    /// <summary>
    /// Chọn một dòng trong 処置選択 rồi CHỐT — đây là bước làm <c>IregCodChk</c> chạy
    /// (frm203016.cs:1629, trong <c>frmTrtSel_Let_Trt_Data</c>).
    ///
    /// <para>Chốt bằng double-click vào dòng (<c>dgvView_CellDoubleClick</c>,
    /// frm203016.cs:238). Có hai đường khác — Enter trên lưới
    /// (<c>dgvView_KeyDown</c>, :219) và nút F9 選択 (<c>btnF9_Click</c>, :174) — dùng
    /// làm đường lui khi double-click không ăn.</para>
    /// </summary>
    public bool CommitPick(Window picker, int rowIndex, TestTrace? trace = null)
    {
        var grid = Uia.ById(picker, "dgvView");
        if (grid is null) return false;

        var rows = new WinFormsGrid(grid).RowElements(limit: 60)
                                         .Where(r => Uia.Children(r).Take(2).Count() >= 2)
                                         .ToList();

        // Dòng tiêu đề 「Top Row」 nằm lẫn trong danh sách y như ở grdRegi — lọc theo
        // NỘI DUNG ô đầu (phải là số) chứ không tin vào chỉ số.
        var dataRows = rows.Where(r =>
        {
            var first = Uia.Children(r).FirstOrDefault();
            return first is not null && Txt.Int(Uia.ValueOf(first)) is not null;
        }).ToList();

        if (rowIndex >= dataRows.Count) return false;

        var cells = Uia.Children(dataRows[rowIndex]).ToList();
        if (cells.Count == 0) return false;

        var (x, y) = Uia.Center(cells[Math.Min(2, cells.Count - 1)]);
        trace?.Do($"double-click dong {rowIndex} cua 処置選択", () =>
        {
            Uia.DoubleClickPhysical(x, y);
        });

        if (WaitUntilCommitted()) return true;

        // ⚠️ CHỐT CHẶN TRƯỚC KHI ĐI ĐƯỜNG LUI.
        //
        // WaitUntilCommitted trả false có HAI nghĩa: 「chốt hụt thật」 và 「chốt xong rồi
        // nhưng vòng chờ quá chậm nên hết giờ」. Mỗi lượt poll gọi ModalDialogs.All +
        // MessageBoxes, và trên máy đang tải nặng một lượt có thể tốn vài giây — đo
        // 2026-08-26: hạn 10s trôi mất 54s thực, trong khi picker đã đóng từ lâu.
        //
        // Đi đường lui khi picker đã đóng là gõ Enter vào LƯỚI, không phải vào picker:
        // dòng vừa chèn bị xê dịch và testcase đỏ ở một chỗ chẳng liên quan. TC-A4 đã
        // đỏ đúng vì vậy, sau khi đã xanh hai lượt liền.
        if (Picker() is null) return true;

        // Đường lui: chọn dòng bằng click đơn rồi Enter.
        trace?.Do("double-click khong an — click don roi Enter", () =>
        {
            Uia.LeftClickPhysical(x, y);
            Thread.Sleep(250);
            Keyboard.Press(VirtualKeyShort.RETURN);
        });
        return WaitUntilCommitted();
    }

    /// <summary>
    /// Đã chốt xong chưa — 処置選択 đóng lại, HOẶC câu hỏi 困難者加算 đã bung ra.
    ///
    /// <para><b>Phải nhận cả vế thứ hai.</b> <c>IregCodChk</c> được gọi ở dòng cuối của
    /// <c>frmTrtSel_Let_Trt_Data</c> (frm203016.cs:1629), tức là VẪN NẰM TRONG hàm xử lý
    /// của form; <c>MsgBox</c> mà nó bung ra chặn luồng UI nên <c>frm203016</c> chưa kịp
    /// đóng chừng nào câu hỏi còn đó. Chỉ nhìn 「picker đã đóng chưa」 thì với bệnh nhân
    /// <c>dis_flg = 3</c> sẽ luôn kết luận 「chốt hụt」 rồi đi click đường lui — cú click
    /// đó rơi vào form đang bị modal chặn, không ăn gì, và testcase đỏ ở một chỗ chẳng
    /// liên quan. Đã dính thật 2026-08-26 ở TC-A1.</para>
    /// </summary>
    private bool WaitUntilCommitted(int seconds = 20) =>
        Waits.TryUntil(() => Picker() is null || HighNeedsDialog() is not null,
                       TimeSpan.FromSeconds(seconds));

    /// <summary>Đóng 処置選択 bằng nút 戻る mà KHÔNG chọn gì.</summary>
    public bool ClosePicker(Window dialog)
    {
        try
        {
            var btn = Uia.Descendants(dialog).FirstOrDefault(
                e => Uia.ControlTypeOf(e) == ControlType.Button && Txt.Has(Uia.NameOf(e), "戻る"));
            if (btn is not null) Uia.Click(btn);
        }
        catch { /* vừa đóng */ }
        return Waits.TryUntil(() => Picker() is null, TimeSpan.FromSeconds(5));
    }

    // ── Đường tab 個別 ───────────────────────────────────────────────────────

    /// <summary>
    /// Chèn một 処置 từ tab 個別 — LỐI VÀO THỨ HAI của cùng cửa <c>IregCodChk</c>.
    ///
    /// <para><c>pKobetu_Let_Trt_Data</c> (modKobetu.cs:307-343) rẽ theo 処置コード, và 105
    /// rơi vào nhánh <c>default</c> ⇒ gọi thẳng
    /// <c>frm203016.Instance.frm203016_Hide_Let_Trt_Data(0)</c> (:341) — cùng hàm mà
    /// 処置選択 gọi, nên cũng chạy tới <c>IregCodChk</c> ở dòng cuối (frm203016.cs:1629).</para>
    ///
    /// <para><b>Khác một điểm quan trọng:</b> đường này <b>KHÔNG mở 処置選択</b>. Form
    /// frm203016 được dùng ở dạng ẩn (<c>Hide_</c>), nên không có picker để chờ và cũng
    /// không có picker để đóng — chỉ có hộp thoại câu hỏi (nếu đủ điều kiện) bung ra.
    /// Vì vậy không dùng lại được <see cref="CommitPick"/>.</para>
    ///
    /// <para>Một cú click chuột là đủ: <c>hfgKobetu_Click</c> (frm203002.cs:6928) tự đẩy
    /// focus rồi gọi tiếp chuỗi Enter → CellDoubleClick — xem <see cref="KobetuTab.SelectRow"/>.</para>
    /// </summary>
    /// <returns>Tên 処置 đọc được từ lưới 個別, để còn dò dòng vừa chèn trên grdRegi.</returns>
    public string? InsertFromKobetu(int trtCd, int trtSb, TestTrace? trace = null)
    {
        DismissAll();

        var kobetu = _screen.Kobetu;
        string? name = null;

        trace?.Do($"tab 個別: tim {trtCd}-{trtSb} roi chon", () =>
        {
            kobetu.Open();
            kobetu.ResetSearchBoxes();
            var row = kobetu.RequireRow(trtCd, trtSb);
            name = Txt.N(row.At(KobetuTab.Col.Name));
            kobetu.SelectRow(row);
        });

        // Không có picker để chờ đóng; chờ tới khi câu hỏi bung ra, hoặc hết giờ (=
        // app im lặng, cũng là một câu trả lời hợp lệ).
        Waits.TryUntil(() => HighNeedsDialog() is not null, TimeSpan.FromSeconds(8));
        return name;
    }

    // ── Cột ẩn ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Bật các cột ẩn của <c>grdRegi</c> lên — cửa hậu có sẵn trong app.
    ///
    /// <para>Cơ chế (frm203002.cs:2645-2718), phải đi ĐÚNG hai bước và ĐÚNG thứ tự:</para>
    /// <code>
    /// customLabel1_Click   (click nhãn 患者番号)   → mbolHideClickFlg = !mbolHideClickFlg
    /// customLabel3_DoubleClick (double-click nhãn 氏名)
    ///     if (mbolHideClickFlg == false) mbolHideRowFlg = false;   ← CHỐT
    ///     ChangeGridColmunsHide();                                  ← Visible = mbolHideRowFlg
    ///                                                                 rồi lật cờ ở cuối
    /// </code>
    /// <para>Sau khi form khởi tạo, <c>ChangeGridColmunsHide()</c> đã chạy một lần
    /// (frm203002.cs:475) nên <c>mbolHideRowFlg</c> đang là <b>true</b>. Nếu double-click
    /// ngay mà chưa click nhãn 患者番号 thì dòng CHỐT ép nó về false và cột vẫn ẩn —
    /// double-click bao nhiêu lần cũng vô ích. Phải click nhãn 患者番号 TRƯỚC để bỏ qua
    /// dòng chốt đó.</para>
    /// </summary>
    public bool RevealHiddenColumns(TestTrace? trace = null)
    {
        var patLabel = Uia.ById(_screen.Window, "customLabel1");
        var nameLabel = Uia.ById(_screen.Window, "customLabel3");
        if (patLabel is null || nameLabel is null) return false;

        trace?.Do("click nhan 患者番号 (mo khoa cot an)", () =>
        {
            var (px, py) = Uia.Center(patLabel);
            Uia.LeftClickPhysical(px, py);
        });
        Thread.Sleep(300);

        trace?.Do("double-click nhan 氏名 (bat cot an)", () =>
        {
            var (nx, ny) = Uia.Center(nameLabel);
            Uia.DoubleClickPhysical(nx, ny);
        });
        Thread.Sleep(900);

        return HiddenColumnsVisible();
    }

    /// <summary>Cột ẩn đang hiện chưa — đo bằng SỐ Ô của một dòng dữ liệu.</summary>
    public bool HiddenColumnsVisible() => VisibleCellCount() > ColHideStart;

    /// <summary>Số ô đọc được trên một dòng dữ liệu của <c>grdRegi</c>.</summary>
    public int VisibleCellCount()
    {
        var row = _grid.Snapshot(limit: 6).FirstOrDefault();
        if (row is null) return 0;
        return Uia.Children(row.Element).Count();
    }

    /// <summary>Tiêu đề mọi cột đang hiện — khi bật cột ẩn, tiêu đề là TÊN CỘT DB.</summary>
    public IReadOnlyList<string> AllHeaders() => _grid.Headers();

    /// <summary>
    /// Giá trị ô <c>FREEWD</c> của một dòng, đọc THẲNG từ lưới (cần bật cột ẩn trước).
    ///
    /// <para>Trả về null khi không đọc được — dòng không đủ ô, hoặc cột ẩn chưa bật.
    /// Null KHÁC chuỗi rỗng: rỗng = ô có thật và đang trống (「いいえ」), null = không
    /// đo được.</para>
    /// </summary>
    public string? FreewdOf(RegiRow row)
    {
        var cells = Uia.Children(row.Element).ToList();
        if (cells.Count <= ColFreewd) return null;
        return Txt.N(Uia.ValueOf(cells[ColFreewd]));
    }

    /// <summary>
    /// Chuỗi mà một ô lưới TRỐNG đọc ra qua UIA — <b>đo thật 2026-08-26</b>, không phải
    /// suy từ source.
    ///
    /// <para><c>Uia.ValueOf</c> thử ValuePattern rồi LegacyIAccessible.Value, cả hai
    /// rỗng thì rơi xuống <c>NameOf</c>; với ô <c>DataGridView</c> mang giá trị null,
    /// chuỗi đọc ra là đúng bốn chữ 「(null)」. Nếu coi nó là "có giá trị" thì mọi
    /// khẳng định 「freewd trống」 đều đỏ oan.</para>
    /// </summary>
    public const string EmptyCellText = "(null)";

    /// <summary>Ô <c>freewd</c> coi như CHƯA có giá trị: null, rỗng, hoặc 「(null)」.</summary>
    public static bool IsFreewdEmpty(string? value) =>
        value is null || Txt.N(value).Length == 0 || Txt.N(value) == EmptyCellText;

    /// <summary>Hiển thị giá trị freewd cho thông điệp assert, phân biệt rõ ba trạng thái.</summary>
    public static string DescribeFreewd(string? value) =>
        value is null ? "(không đọc được ô — cột ẩn chưa bật?)"
        : IsFreewdEmpty(value) ? $"(trống, đọc ra 「{Txt.N(value)}」)"
        : $"「{Txt.N(value)}」";

    /// <summary>Một dòng lưới đã đọc RIÊNG ba ô cần thiết — xem <see cref="ScanRows"/>.</summary>
    public sealed record FreewdRow(RegiRow Row, string Name, string Ten, string? Freewd)
    {
        public override string ToString() =>
            $"「{Name}」 freewd = {DescribeFreewd(Freewd)}";
    }

    /// <summary>
    /// Quét lưới đọc ĐÚNG BA ô mỗi dòng: 療法・処置 (2), 点 (3) và FREEWD (72).
    ///
    /// <para>KHÔNG dùng <c>TreatmentGridOps.Snapshot</c> ở đây. Lớp đó đọc TOÀN BỘ ô của
    /// mỗi dòng — bình thường là 5 ô, nhưng luồng này đã bật cột ẩn nên thành <b>81 ô</b>
    /// (đo 2026-08-26). Mỗi <c>Uia.ValueOf</c> là vài lượt gọi COM xuyên tiến trình, nên
    /// quét 20 dòng sẽ nhảy từ ~100 lên ~1.600 lượt và testcase hết giờ trước khi đọc
    /// xong. Đọc đích danh hai ô thì chi phí không đổi theo số cột.</para>
    /// </summary>
    public IReadOnlyList<FreewdRow> ScanRows(int limit = 60)
    {
        var rows = new List<FreewdRow>();
        var index = 0;

        foreach (var element in _screen.Regi.Grid.RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();

            // Dòng tiêu đề 「Top Row」 lọt vào danh sách y như ở mọi lưới khác của app;
            // ô con của nó là Header chứ không phải DataItem.
            if (cells.Count <= RegiGrid.Col.Ryo) continue;
            if (Uia.ControlTypeOf(cells[0]) is ControlType.Header or ControlType.HeaderItem) continue;

            var name = Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ryo]));
            var ten = cells.Count > RegiGrid.Col.Ten ? Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ten])) : "";
            var freewd = cells.Count > ColFreewd ? Txt.N(Uia.ValueOf(cells[ColFreewd])) : null;

            rows.Add(new FreewdRow(
                new RegiRow(index++, element, "", "", name, ten, ""),
                name,
                ten,
                freewd));
        }
        return rows;
    }

    /// <summary>Dòng CUỐI có 療法・処置 chứa <paramref name="name"/>; null nếu không có.</summary>
    public FreewdRow? RowNamed(string name, int limit = 60) =>
        ScanRows(limit).LastOrDefault(r => Txt.Has(r.Name, name));

    // ── 自動算定 ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Kích 自動算定 — <c>modSave.AutoSantei</c> (modSave.cs:2893).
    ///
    /// <para>Chỉ có ĐÚNG MỘT call site: <c>grdRegi_TextBox_PreviewKeyDown</c>
    /// (frm203002.cs:5345). Để tới được nó, cả bốn điều kiện phải cùng đúng:</para>
    /// <code>
    ///   :5241  phím là Enter
    ///   :5260  con trỏ đang ở CỘT 0 (日)
    ///   :5288  ngày vừa gõ KHÁC ngày của dòng ngay trên
    ///   :5296  đang ở DÒNG CUỐI của lưới
    /// </code>
    /// <para>App cũng tự gọi nó khi mở màn hình, nhưng chỉ khi
    /// <c>InpKbn == Insert</c> VÀ <c>syotibimode == 9</c> (tức
    /// <c>inp_config.dt_rsv_flg = 0</c>) — frm203002.cs:3260-3270. Bộ test mở màn bằng
    /// <c>patient.openMode = update</c> (F8) nên <b>không</b> rơi vào nhánh đó; phải tự
    /// gõ như dưới đây.</para>
    /// </summary>
    public bool TriggerAutoSantei(int day, TestTrace? trace = null)
    {
        DismissAll();

        var rows = _grid.Snapshot();
        if (rows.Count == 0) return false;
        var last = rows[^1];

        trace?.Do($"go ngay {day} vao cot 日 cua dong CUOI roi Enter", () =>
        {
            _grid.FocusCell(last, RegiGrid.Col.Day);
            if (!_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _grid.Type(day.ToString());
            _grid.Press(VirtualKeyShort.RETURN);
        });
        Thread.Sleep(1500);
        return true;
    }
}
