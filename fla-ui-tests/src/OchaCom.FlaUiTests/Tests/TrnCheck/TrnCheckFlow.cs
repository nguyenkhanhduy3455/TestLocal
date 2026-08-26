using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.HighNeedsFreewd;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.TrnCheck;

/// <summary>
/// Lái 診療チェック của 診療入力 — CẢ HAI cửa, vì chúng là hai lối vào của cùng một
/// engine <c>COMMON/Lib/Check.cs</c> và bản web port chúng thành hai endpoint khác nhau:
///
/// <list type="table">
/// <item>
///   <term>一括 (F3)</term>
///   <description><c>frm203002.cs:4679</c> → <c>TrnChk(con)</c> (:5158) →
///   <c>Check.getCheckAnswer</c> → đổ vào lưới <c>grdChek</c> trong panel <c>PnlChek</c>.
///   Web: <c>POST /tenant/treatment/check</c> → panel 「処置データチェック エラー一覧」.</description>
/// </item>
/// <item>
///   <term>行単位</term>
///   <description><c>INP/Lib/SingleChk.cs:26</c> → <c>Check.getCheckAnswerSingle</c> →
///   bung <b>một MessageBox W00100 cho MỖI phần tử</b> của <c>Chk_list</c> (:43-46).
///   Web: <c>POST /tenant/treatment/check-single</c> → alert.</description>
/// </item>
/// </list>
///
/// ─── Vì sao lớp này KHÔNG tự bấm 「OK」 hộ ────────────────────────────────────
/// Số lượng hộp thoại W00100 CHÍNH LÀ thứ cần đo (SingleChk.cs:43 lặp trọn
/// <c>list.Count</c> lần, không hề gộp trùng — trong khi bản web gộp bằng một
/// <c>Set</c> ở <c>treatment-entry-detail.tsx:2685</c>). Mọi hàm ở đây tách bạch
/// <b>đọc</b> (<see cref="W00100Texts"/>) khỏi <b>đọc-rồi-dẹp</b> (<see cref="DrainW00100"/>);
/// fixture nào lỡ để <see cref="NuisanceDialogWatcher"/> hoặc
/// <c>HighNeedsFlow.DismissAll</c> chạy trước sẽ đo ra 0 và kết luận ngược hẳn sự thật.
///
/// ─── Dùng lại <see cref="HighNeedsFlow"/> ────────────────────────────────────
/// Phần 「gõ mã vào ô 点 ở コードモード → 処置選択 (frm203016) → chốt dòng」 đã có sẵn ở
/// đó và là mã đã chạy thật trên máy Windows (đã trả giá cho 3 cái bẫy: double-click
/// không ăn, picker đóng trước khi vòng chờ kịp thấy, và MsgBox chặn luồng làm picker
/// chưa đóng). Chép lại là chép cả ba cái bẫy. Chỗ khác biệt duy nhất — không được tự
/// dẹp hộp thoại — nằm ở <see cref="InsertByCode"/>, viết riêng ở đây.
/// </summary>
public sealed class TrnCheckFlow
{
    // ── Văn bản WinForm, NGUYÊN VĂN ──────────────────────────────────────────
    // Check.cs SetErrorMsg — 5 câu 月次 chạy MỘT LẦN mỗi 処置月 sau vòng lặp từng dòng.

    /// <summary>case 10 — スケーリング全ブロック終了 (Check.cs:1235 → :6589).</summary>
    public const string MsgScalingBlocks = "スケーリングが全ブロック終了していません。";

    /// <summary>case 11 — 当月部位病名 (Check.cs:1241 → :6593). Bắn thì <b>return ngay</b> (:1246).</summary>
    public const string MsgBuidis = "当月に部位・病名がない可能性があります。確認してください。";

    /// <summary>case 15 — Ｐ病名Ｇ病名重複 (Check.cs:1253 → :6609).</summary>
    public const string MsgPgOverlap = "P病名とG病名が重複しています。";

    /// <summary>case 16 — 欠損病名とＰ病名重複 (Check.cs:1261 → :6613).</summary>
    public const string MsgMissingTooth = "欠損病名とP病名が重複しています。";

    /// <summary>case 19 — 1初診内スケーリング回数超過 (Check.cs:1269 → :6625).</summary>
    public const string MsgRol999 = "1初診内でｽｹｰﾘﾝｸﾞの回数がﾌﾞﾛｯｸ数を超えています。";

    /// <summary>Cả 5 câu 月次 — dùng chốt mốc 「dữ liệu nền sạch」 ở TC-BASE.</summary>
    public static readonly string[] MonthlyMessages =
    [
        MsgScalingBlocks, MsgBuidis, MsgPgOverlap, MsgMissingTooth, MsgRol999,
    ];

    /// <summary>Dòng cuối mà <c>TrnChk</c> tự thêm vào lưới (frm203002.cs:5214) — KHÔNG phải lỗi.</summary>
    public const string PanelTerminator = "----- 以上 -----";

    /// <summary>
    /// スケーリング 165-1 — cổng của <c>Chkrol999_Cmn</c> là <c>trt_cd 165 &amp;&amp; trt_sb ∈ {0,1}</c>
    /// (Check.cs:1441). Cùng bộ mã mà <c>trn-chk-sweep.spec.ts</c> seed.
    /// </summary>
    public const int ScalingCd = 165;

    public const int ScalingSb = 1;

    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly HighNeedsFlow _entry;
    private readonly TreatmentGridOps _grid;

    public TrnCheckFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _entry = new HighNeedsFlow(app, screen);
        _grid = new TreatmentGridOps(screen);
    }

    public HighNeedsFlow Entry => _entry;
    public TreatmentGridOps Grid => _grid;

    // ── Panel 処置データチェック (一括, F3) ───────────────────────────────────

    /// <summary>Panel <c>PnlChek</c> có đang hiện không (frm203002.Designer.cs:2593).</summary>
    public bool PanelVisible()
    {
        var panel = Uia.ById(_screen.Window, TestSettings.Current.Locator("chkPanel"));
        return panel is not null && Uia.IsOnScreen(panel);
    }

    /// <summary>
    /// 件数 đọc từ nhãn <c>lbChk</c> — <c>TrnChk</c> ghi <c>list.Count + "件"</c>
    /// (frm203002.cs:5219). Đây là mốc ĐỘC LẬP với việc đọc lưới, nên khi hai con số
    /// lệch nhau thì biết ngay là lỗi ĐỌC chứ không phải lỗi app.
    /// </summary>
    public string PanelCountText()
    {
        var l = Uia.ById(_screen.Window, TestSettings.Current.Locator("chkCount"));
        return l is null ? "" : Txt.N(Uia.ValueOf(l));
    }

    /// <summary>Phần SỐ của <see cref="PanelCountText"/>; đọc không ra → null.</summary>
    public int? PanelCount()
    {
        var digits = new string(PanelCountText().Where(char.IsDigit).ToArray());
        return int.TryParse(digits, out var v) ? v : null;
    }

    /// <summary>
    /// Các dòng lỗi trên <c>grdChek</c>, ĐÚNG thứ tự <c>Check.getCheckAnswer</c> trả về,
    /// đã bỏ dòng chốt <see cref="PanelTerminator"/>.
    ///
    /// <para>Lưới này chỉ có MỘT cột (<c>ColumnHeadersVisible = false</c>,
    /// frm203002.Designer.cs:2615) nên không dính bẫy 「Top Row」 của <c>grdRegi</c> —
    /// nhưng vẫn lọc phòng khi cầu MSAA dựng ra dòng tiêu đề: dòng nào mọi ô con là
    /// <c>Header</c>/<c>HeaderItem</c> thì bỏ.</para>
    ///
    /// <para>⚠️ UIA của <c>DataGridView</c> chỉ phơi ra dòng ĐANG NHÌN THẤY
    /// (PROBE-GUIDELINE 3.1) — panel cao 43px nên chỉ vừa vài dòng. Vì vậy
    /// <b>đừng bao giờ</b> mốc vào 「số dòng đọc được」; mốc vào <see cref="PanelCount"/>
    /// (lbChk, nằm NGOÀI lưới) rồi mới dùng danh sách này để biết nội dung. Hàm này tự
    /// cuộn hết lưới trước khi trả về.</para>
    /// </summary>
    public IReadOnlyList<string> PanelMessages()
    {
        var grid = Uia.ById(_screen.Window, TestSettings.Current.Locator("chkGrid"));
        if (grid is null) return [];

        var seen = new List<string>();
        var byIndex = new SortedDictionary<int, string>();

        // Cuộn từ đầu tới cuối, gom theo SỐ HÀNG đọc được ở mô tả ô (「… 行 12」 /
        // 「Row 12」) chứ không theo thứ tự quét — mỗi lượt cuộn chỉ thấy một cửa sổ nhỏ
        // và các cửa sổ đó chồng lấn nhau.
        for (var page = 0; page < 12; page++)
        {
            var before = byIndex.Count;
            foreach (var (index, text) in ReadVisibleRows(grid))
                byIndex[index] = text;

            if (byIndex.Count == before && page > 0) break;
            if (!ScrollPanel(grid, down: true)) break;
        }

        foreach (var text in byIndex.Values)
        {
            if (text.Length == 0) continue;
            if (Txt.Has(text, PanelTerminator)) continue;
            seen.Add(text);
        }
        return seen;
    }

    /// <summary>
    /// Các dòng ĐANG NHÌN THẤY của <c>grdChek</c>, kèm số hàng thật.
    ///
    /// ─── Hình dạng thật của một dòng (đo 2026-08-26, PROBE 2 Tc1) ────────────
    /// <code>
    /// Unknown   name="Row 2"                       ← DÒNG
    ///   Header   name="Row 2"          ValuePattern = ""            ← ô SỐ THỨ TỰ
    ///            HelpText="DataGridViewRowHeaderCell(DataGridViewHeaderCell)"
    ///   DataItem name="Column1 Row 2"  ValuePattern = "衛生士実地指導が算定可能です。"
    ///            HelpText="DataGridViewTextBoxCell(DataGridViewCell)"   ← ô NỘI DUNG
    /// </code>
    ///
    /// <para><b>Ô đầu tiên KHÔNG phải ô nội dung.</b> Bản đầu của hàm này đọc
    /// <c>cells[0]</c> nên trúng ô số thứ tự — <c>ValuePattern</c> rỗng, <c>Uia.ValueOf</c>
    /// rơi hết ba tầng và trả về <c>Name</c>, ra 「Row 0」…「Row 3」. PROBE 1 (15:42) đo ra
    /// đúng chuỗi đó và không ai đoán nổi vì sao cho tới khi đổ cây UIA. Lấy ô
    /// <c>DataItem</c> đầu tiên thay vì ô đầu tiên.</para>
    ///
    /// <para>Số hàng lấy từ chữ số cuối trong <c>Name</c> của DÒNG (「Row N」). Không đọc
    /// ra số thì rơi về thứ tự quét, cộng một mốc lớn để không đè lên dòng có số thật.</para>
    /// </summary>
    private IEnumerable<(int Index, string Text)> ReadVisibleRows(AutomationElement grid)
    {
        var fallback = 10_000;
        foreach (var row in new WinFormsGrid(grid).RowElements(limit: 200))
        {
            var cells = Uia.Children(row).ToList();
            if (cells.Count == 0) continue;

            var cell = cells.FirstOrDefault(c => Uia.ControlTypeOf(c)
                                                 is not (ControlType.Header or ControlType.HeaderItem));
            if (cell is null) continue;   // dòng toàn ô tiêu đề

            var text = Txt.N(Uia.ValueOf(cell));
            if (text.Length == 0) continue;

            var index = TrailingInt(Uia.NameOf(row)) ?? TrailingInt(Uia.NameOf(cell)) ?? fallback++;
            yield return (index, text);
        }
    }

    private static int? TrailingInt(string? s)
    {
        var n = Txt.N(s);
        var end = n.Length;
        while (end > 0 && !char.IsDigit(n[end - 1])) end--;
        if (end == 0) return null;
        var start = end;
        while (start > 0 && char.IsDigit(n[start - 1])) start--;
        return int.TryParse(n[start..end], out var v) ? v : null;
    }

    /// <summary>
    /// Cuộn lưới lỗi bằng ＋ / － — chính là cách app quảng cáo trên nhãn
    /// <c>customLabel29</c>: 「＋,－ キーで表示切替。もう一度F3キーを押すと戻ります。」
    /// (frm203002.Designer.cs:2674). Bên web hai phím đó port thành PageDown/PageUp
    /// (<c>treatment-table-handler.spec.ts</c> TC-10).
    /// </summary>
    private bool ScrollPanel(AutomationElement grid, bool down)
    {
        try
        {
            var (x, y) = Uia.Center(grid);
            Uia.LeftClickPhysical(x, y);
            Keyboard.Press(down ? VirtualKeyShort.NEXT : VirtualKeyShort.PRIOR);
            Waits.Step();
            return true;
        }
        catch { return false; }
    }

    /// <summary>Kết quả một lượt bấm F3.</summary>
    /// <param name="PanelOpened">Panel <c>PnlChek</c> đã hiện ra.</param>
    /// <param name="NoErrorDialog">Hộp thoại I00100 「エラーはありません」 (frm203002.cs:5225) nếu có.</param>
    /// <param name="Note">Mô tả để đọc log khi cả hai đều không xảy ra.</param>
    public sealed record SweepResult(bool PanelOpened, Window? NoErrorDialog, string Note)
    {
        public bool AnyErrors => PanelOpened;
    }

    /// <summary>
    /// Bấm F3 一括チェック và chờ tới khi biết kết quả.
    ///
    /// <para><c>TrnChk</c> có ĐÚNG hai kết cục (frm203002.cs:5209-5228):</para>
    /// <code>
    /// list.Count > 0  → đổ grdChek + PnlChek.Visible = !PnlChek.Visible + lbChk = "N件" + return false
    /// list.Count == 0 → MsgDialog.ShowWarningMsg("I00100")                            + return true
    /// </code>
    /// <para>Nên 「không thấy panel」 KHÔNG có nghĩa là F3 hỏng — rất có thể là tháng
    /// sạch. Hàm này phân biệt hai chuyện đó thay vì để testcase tự đoán.</para>
    ///
    /// <para>⚠️ F3 là PHÍM BẬT/TẮT (frm203002.cs:4679-4692): panel đang mở thì F3 chỉ
    /// đóng nó lại và <b>không chạy lại check</b>. Hàm tự đóng panel trước.</para>
    /// </summary>
    public SweepResult PressF3(TestTrace? trace = null, int seconds = 60)
    {
        if (PanelVisible())
        {
            trace?.Note("panel dang mo — bam F3 de dong truoc (F3 la phim bat/tat)");
            ClosePanel();
        }

        trace?.Step("bam F3 処置チェック（一括）");
        TriggerF3();

        Window? noError = null;
        var opened = Waits.TryUntil(
            () => PanelVisible() || (noError = FindNoErrorDialog()) is not null,
            TimeSpan.FromSeconds(seconds));

        if (!opened)
            return new SweepResult(false, null,
                $"F3 không mở panel và cũng không bung I00100 sau {seconds}s. Xem ảnh chụp: " +
                "thường là có hộp thoại khác đang chắn, hoặc focus không nằm trên frm203002.");

        if (noError is not null)
            return new SweepResult(false, noError,
                $"F3 chạy xong, KHÔNG có lỗi nào — I00100: 「{Txt.N(Dialogs.TextOf(noError))}」");

        return new SweepResult(true, null, $"F3 mở panel, lbChk = 「{PanelCountText()}」");
    }

    /// <summary>
    /// Kích hoạt F3. Ưu tiên CLICK nút trên thanh F-key nếu có; không có thì gửi phím.
    ///
    /// <para>Cùng lý do với <c>AccountingFlow.TriggerAccounting</c>: nút của app là
    /// <c>GradientButton</c> tự vẽ. Nhưng frm203002.Designer.cs KHÔNG khai báo
    /// <c>btnF3</c> (thanh F-key đến từ form nền của OchaFramework) nên đường phím mới
    /// là đường chính ở đây — <c>frm203002_KeyDown</c> (:3283) → <c>KeyFunc</c> →
    /// <c>pInpMainSendKey</c> (:4071).</para>
    /// </summary>
    private void TriggerF3()
    {
        try { _screen.Window.Focus(); } catch { /* vẫn thử gửi phím */ }

        var btn = Uia.ByIdOrName(_screen.Window, "btnF3", "チェック", ControlType.Button);
        if (btn is not null)
        {
            Uia.MouseClick(btn);
            return;
        }

        // Lưới phải đang giữ focus thì KeyDown mới tới form (KeyPreview).
        Keyboard.Press(VirtualKeyShort.F3);
        Waits.Step();
    }

    /// <summary>Bấm F3 lần nữa để đóng panel (frm203002.cs:4681-4684).</summary>
    public bool ClosePanel(int seconds = 15)
    {
        if (!PanelVisible()) return true;
        TriggerF3();
        return Waits.TryUntil(() => !PanelVisible(), TimeSpan.FromSeconds(seconds));
    }

    /// <summary>Hộp thoại I00100 「エラーはありません」 — MessageBox OK, không phải panel.</summary>
    public Window? FindNoErrorDialog() =>
        MessageBoxes().FirstOrDefault(d =>
        {
            var t = Txt.N(Dialogs.TextOf(d));
            return Txt.Has(t, "エラー") && !Txt.Has(t, "を算定");
        });

    public int CountContaining(IReadOnlyList<string> messages, string needle) =>
        messages.Count(m => Txt.Has(m, needle));

    // ── 行単位 W00100 (SingleChk) ────────────────────────────────────────────

    /// <summary>
    /// Mọi MessageBox đang mở của app — CHƯA dẹp cái nào.
    ///
    /// <para>Dùng lại <see cref="HighNeedsFlow.OpenDialogs"/> rồi lọc theo ClassName
    /// <c>#32770</c>: <c>MsgBox</c> mà app bung ra trong lúc một form modal đang mở
    /// được dựng thành CON của form đó, nên phải quét hai tầng — chi tiết ở chú thích
    /// <c>HighNeedsFlow.MessageBoxes</c>.</para>
    /// </summary>
    private IEnumerable<Window> MessageBoxes() =>
        _entry.OpenDialogs().Where(d =>
        {
            try { return Uia.ClassNameOf(d) == Dialogs.Win32DialogClass && Uia.IsOnScreen(d); }
            catch { return false; }
        });

    /// <summary>
    /// Nội dung các hộp thoại W00100 đang xếp hàng — <b>KHÔNG bấm OK</b>.
    ///
    /// <para>WinForm bung chúng TUẦN TỰ: <c>MessageBox.Show</c> chặn luồng UI nên tại
    /// mỗi thời điểm chỉ có ĐÚNG MỘT cái trên màn hình, cái sau chỉ xuất hiện khi cái
    /// trước đã đóng (SingleChk.cs:43-46). Vì vậy muốn ĐẾM thì phải dùng
    /// <see cref="DrainW00100"/> chứ không phải hàm này.</para>
    /// </summary>
    public IReadOnlyList<string> W00100Texts() =>
        MessageBoxes().Select(d => Txt.N(Dialogs.TextOf(d))).Where(t => t.Length > 0).ToList();

    /// <summary>
    /// Đọc rồi bấm OK cho TỪNG hộp thoại W00100 cho tới khi hết — trả về danh sách nội
    /// dung theo ĐÚNG thứ tự chúng bung ra.
    ///
    /// <para>Đây là phép đo trung tâm của nửa 行単位: <c>SingleChk.cs:43</c> lặp trọn
    /// <c>list.Count</c> lần và KHÔNG gộp trùng, nên hai phần tử giống hệt nhau trong
    /// <c>Chk_list</c> phải cho người dùng bấm OK <b>hai lần</b>. Bản web gộp bằng
    /// <c>Set</c> (<c>treatment-entry-detail.tsx:2685</c>) ⇒ chỗ này chính là điểm lệch
    /// mà <c>single-check-w00100.spec.ts</c> 「WinForm parity 3」 đang đo.</para>
    ///
    /// <para><paramref name="quietSeconds"/> — sau khi đóng cái cuối phải CHỜ THÊM
    /// chừng đó rồi mới kết luận 「hết」. Không chờ thì lượt đo dừng ngay sau hộp thoại
    /// đầu và ra kết quả 「1」 cho mọi tình huống, tức là xanh sai đúng ở testcase quan
    /// trọng nhất.</para>
    /// </summary>
    public IReadOnlyList<string> DrainW00100(TestTrace? trace = null,
                                             int maxDialogs = 20,
                                             double quietSeconds = 3.0)
    {
        var texts = new List<string>();

        for (var i = 0; i < maxDialogs; i++)
        {
            var dialog = WaitForMessageBox(quietSeconds);
            if (dialog is null) break;

            var text = Txt.N(Dialogs.TextOf(dialog));
            texts.Add(text);
            trace?.Note($"W00100 #{texts.Count}: 「{text}」");

            if (!Dialogs.ClickButton(dialog, "OK", "はい", "Yes"))
            {
                trace?.Note("KHONG bam duoc OK — dung lai de khong dem trung cai dang mo");
                break;
            }

            // Chờ chính cái vừa bấm biến mất; còn đó nghĩa là cú click trượt và vòng
            // sau sẽ đếm lại nó.
            Waits.TryUntil(() => !Dialogs.IsAlive(dialog), TimeSpan.FromSeconds(8));
        }

        return texts;
    }

    private Window? WaitForMessageBox(double seconds)
    {
        Window? hit = null;
        Waits.TryUntil(() => (hit = MessageBoxes().FirstOrDefault()) is not null,
                       TimeSpan.FromSeconds(seconds));
        return hit;
    }

    // ── Chèn 処置 ────────────────────────────────────────────────────────────

    /// <summary>Kết quả một lượt chèn 処置 bằng mã.</summary>
    /// <param name="Inserted">Đã chốt xong ở 処置選択.</param>
    /// <param name="Warnings">Các câu W00100 mà 行単位チェック bung ra ngay sau đó.</param>
    /// <param name="Note">Lý do khi <paramref name="Inserted"/> = false.</param>
    public sealed record InsertResult(bool Inserted, IReadOnlyList<string> Warnings, string Note);

    /// <summary>
    /// Chèn một 処置 qua <b>tab 個別</b> rồi ĐỌC HẾT các W00100 mà 行単位チェック bung ra.
    ///
    /// ─── Vì sao đường 個別 chứ không phải コードモード ────────────────────────
    /// Cả hai đều tới cùng một cửa <c>IregCodChk</c> (modKobetu.cs:341 gọi thẳng
    /// <c>frm203016_Hide_Let_Trt_Data</c>, cùng hàm mà 処置選択 gọi), nhưng đường 個別
    /// <b>không cần đặt con trỏ vào ô 点 bằng click toạ độ</b> — và chính cú click đó là
    /// chỗ hỏng. Đo được 2026-08-26 (PROBE 2 Tc2):
    /// <code>
    /// đường 個別          : スケーリング 0 → 1 dòng          ✔ chèn được
    /// đường コードモード  : TargetRow trả dòng ma rect {0,0,0,0}
    ///                       → click (0,0) = Desktop → gõ 「165」 → type-ahead mở 1.pdf
    /// </code>
    /// Cú click hỏng nay đã bị <c>TreatmentGridOps.FocusCell</c> chặn bằng ngoại lệ có
    /// lời giải thích, nhưng đường 個別 vẫn là đường chính vì nó không dựa vào toạ độ.
    ///
    /// <para><b>KHÔNG gọi <c>DismissAll</c></b> — đó là khác biệt duy nhất so với
    /// <see cref="HighNeedsFlow.InsertFromKobetu"/> khi dùng ở luồng kia, và là cả lý do
    /// hàm này tồn tại: các W00100 chính là số đo.</para>
    ///
    /// <para>⚠️ <b>Mốc là SỐ DÒNG, không phải 合計点数.</b> Dòng 処置 vừa chèn chưa có
    /// 部位/回数 nên chưa cộng điểm — PROBE 2 KQ-F đo được 合計 681 → 681 trong khi
    /// スケーリング 0 → 1 dòng. Mốc vào 合計 ở đây sẽ kết luận 「chưa chèn được gì」 trong
    /// khi đã chèn xong.</para>
    /// </summary>
    public InsertResult InsertFromKobetu(TestTrace trace, int trtCd, int trtSb, params string[] nameHints)
    {
        var before = CountRowsNamed(nameHints);

        string? name = null;
        try
        {
            name = _entry.InsertFromKobetu(trtCd, trtSb, trace);
        }
        catch (Exception e)
        {
            return new InsertResult(false, [],
                $"tab 個別 không chèn được {trtCd}-{trtSb}: {e.GetType().Name}: {e.Message}");
        }

        var warnings = DrainW00100(trace);
        var after = CountRowsNamed(nameHints.Length > 0 ? nameHints : [name ?? ""]);

        if (after <= before)
            return new InsertResult(false, warnings,
                $"tab 個別 đọc được tên 「{name ?? "(null)"}」 nhưng số dòng mang tên đó trên grdRegi " +
                $"KHÔNG tăng ({before} → {after}). Xem ảnh: lưới 個別 có tìm ra {trtCd}-{trtSb} không, " +
                $"và cú click có tới không. Hộp thoại đang có: {_entry.DescribeDialogs()}");

        return new InsertResult(true, warnings,
            $"đã chèn {trtCd}-{trtSb} 「{name}」 ({before} → {after} dòng), " +
            $"行単位チェック bung {warnings.Count} câu W00100.");
    }

    private int CountRowsNamed(params string[] anyOf)
    {
        var words = anyOf.Where(w => !string.IsNullOrEmpty(w)).ToArray();
        return words.Length == 0 ? 0 : _grid.CountRyoContaining(words);
    }

    /// <summary>Vị trí dòng 枝番 cần trong lưới <c>dgvView</c> của 処置選択; -1 = không có.</summary>
    public static int PickRowIndexOfSub(IReadOnlyList<HighNeedsFlow.PickRow> rows, int trtCd, int trtSb)
    {
        for (var i = 0; i < rows.Count; i++)
        {
            if (Txt.Int(rows[i].Code) == trtCd && Txt.Int(rows[i].Sub) == trtSb) return i;
        }
        return -1;
    }

    /// <summary>
    /// Đặt 算定回数 cho dòng vừa chèn — gõ vào ô 回 rồi Enter.
    ///
    /// <para>Chính chỗ này làm <c>SingleChk</c> chạy lần nữa: <c>frm203002.cs:5678</c>
    /// gọi <c>new SingleChk(…, curRow, 1)</c> ngay sau khi chốt ô 回数
    /// (「１処置チェック」). Bản web port thành <c>runSingleCheck</c> với
    /// <c>{ trtCd, trtSb, day }</c> — mất khái niệm 「vị trí dòng」, đó là 「WinForm
    /// parity 1」 của spec.</para>
    /// </summary>
    public InsertResult SetCount(TestTrace trace, RegiRow row, int count)
    {
        trace.Do($"go 回数 = {count} vao dong 「{row.Ryo}」", () =>
        {
            _grid.FocusCell(row, RegiGrid.Col.Kai);
            if (!_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _grid.Type(count.ToString());
            _grid.Press(VirtualKeyShort.RETURN);
        });

        var warnings = DrainW00100(trace);
        return new InsertResult(true, warnings,
            $"đặt 回数 = {count}, 行単位チェック bung {warnings.Count} câu W00100.");
    }

    /// <summary>Các dòng スケーリング đang có trên lưới — để biết đã chèn đủ chưa.</summary>
    public int CountScalingRows() => _grid.CountRyoContaining("ｽｹｰﾘﾝｸﾞ", "スケーリング");

    /// <summary>Mô tả ngắn trạng thái màn hình, để dán vào thông điệp assert.</summary>
    public string Describe() =>
        $"panel={(PanelVisible() ? "mở" : "đóng")} lbChk=「{PanelCountText()}」 " +
        $"合計={_grid.AllPoint()} スケーリング={CountScalingRows()}行";
}
