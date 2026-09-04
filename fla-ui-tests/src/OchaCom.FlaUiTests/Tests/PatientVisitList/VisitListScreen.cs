using System.Text;
using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using ComboBox = FlaUI.Core.AutomationElements.ComboBox;

namespace OchaCom.FlaUiTests.Tests.PatientVisitList;

/// <summary>Một dòng đọc được từ lưới <c>dgvViewS</c>, theo đúng thứ tự cột hiển thị.</summary>
public sealed record VisitGridRow(IReadOnlyList<string> Cells)
{
    /// <summary>
    /// Ô đã bỏ khoảng trắng mà <c>dgvView_CellFormatting</c> chèn thêm
    /// (frm204008.cs:141-158: cột canh trái thành 「 {0}」, canh phải thành 「{0} 」).
    ///
    /// <para>KHÔNG chuẩn hoá NFKC ở đây: レセプト種別 dùng 全角 có chủ ý
    /// (<c>editHanToZen</c> ở buiPrice.cs:1558 biến 「2」 thành 「２」), NFKC sẽ xoá đúng
    /// đặc điểm đang cần đo.</para>
    /// </summary>
    public string Cell(int i) => i < Cells.Count ? Cells[i].Trim(' ', '　') : "";

    // Thứ tự đúng _viewItem của frm204008 (frm204008.cs:63-78).
    public string PatNo => Cell(0);
    public string PatNm => Cell(1);
    public string RcpType => Cell(2);
    public string Day => Cell(3);
    public string SyosinFlg => Cell(4);
    public string PriceTotal => Cell(11);

    /// <summary>Dòng 合計 không có 患者番号 và 氏名 mở đầu bằng 「合計」 (frm204008.cs:807).</summary>
    public bool IsTotalRow => PatNo.Length == 0 && PatNm.StartsWith("合計", StringComparison.Ordinal);

    public override string ToString() =>
        string.Join(" | ", Enumerable.Range(0, Cells.Count).Select(Cell));
}

/// <summary>Kết cục của một lượt 検索.</summary>
public sealed record SearchRunResult(
    TimeSpan Elapsed,
    IReadOnlyList<string> Dialogs,
    bool ProgressDialogSeen,
    bool TimedOut)
{
    /// <summary>Các hộp thoại E00100 — mỗi hộp là MỘT dòng mà 一部負担金 tính hỏng.</summary>
    public IReadOnlyList<string> BuiPriceFailures =>
        Dialogs.Where(d => d.Contains(VisitListScreen.BuiPriceFailedHead, StringComparison.Ordinal)).ToList();
}

/// <summary>
/// Màn 来患一覧 <c>frm204008</c> — nửa WinForm của
/// <c>web-tenant-tests/tests/patient-visit-list-rcp-type.spec.ts</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG VÀO (không có đường tắt)
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   メインメニュー          pnlBtn1  → 日常業務          (MainMenu.cs:820)
///                           pnlMenu4 → ID204001 窓口精算 (MainMenu.cs:824)
///   frm204001 窓口精算（患者選択）
///                           F3 「来患一覧」 → ID204008   (frm204001.cs:243-251)
///   frm204008 来患一覧
/// </code>
/// <para>frm204001 mở ở chế độ 未精算患者一覧 và tìm ngay; không có 未精算 nào thì nó bung
/// E00003. Hộp thoại đó KHÔNG phải lỗi của luồng này — <see cref="Open"/> dẹp mọi hộp
/// thoại đang chắn rồi mới bấm F3, vì phím gửi vào một MessageBox đang modal thì không
/// bao giờ tới được form.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CONTROL (frm204008.Designer.cs)
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   dtSinryo    診療年月   CustomDate — cboEra / txtYear / txtMonth / (txtDay ĐÃ ẨN)
///   chkSyosin   初診       mặc định Checked
///   chkSaisin   再診       mặc định Checked
///   chkHoumon   訪問診療   mặc định Checked
///   btnTotal    検索       nhãn là 「検索」 dù id là btnTotal (Designer:123);
///                          END/ESC cũng vào cùng searchProc() (frm204008.cs:366)
///   dgvViewS    lưới 12 cột, mọi cột ReadOnly
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BA CÁI BẪY ĐỌC RA TỪ SOURCE — đừng vấp
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="number">
/// <item><b><c>SelDate</c> chỉ cập nhật khi <c>CustomDate</c> MẤT FOCUS.</b>
///       <c>CustomDate_Leave</c> (CustomDate.cs:693) là chỗ DUY NHẤT gọi
///       <c>setSelDate</c> sau khi người dùng gõ — <c>IsDate</c> thì không. Gõ 年/月 xong
///       bấm 検索 ngay mà chưa rời control thì <c>searchProc</c> chạy với THÁNG CŨ và
///       testcase đổ oan cho dữ liệu. <see cref="SetSinryoYm"/> luôn đẩy focus ra ngoài.</item>
/// <item><b>Lưới chỉ phơi ra dòng ĐANG NHÌN THẤY</b> (PROBE-GUIDELINE 3.1). 86 dòng của
///       200601 không đọc hết bằng một lượt. Toàn bộ dữ liệu lấy qua
///       <see cref="ExportCsv"/> — F4 ghi thẳng <c>DataTable</c> nguồn, KHÔNG qua
///       <c>CellFormatting</c> nên cũng không bị banding bỏ trắng. Lưới chỉ dùng cho thứ
///       CHỈ có ở lưới: nhãn cột, thứ tự cột, và ô bị bỏ trắng.</item>
/// <item><b>E00100 bung TỪ TRONG luồng nền</b> của thanh tiến trình (buiPrice.cs:201, gọi
///       trong <c>ProgressDialog_DoWork</c>). Mỗi dòng hỏng một hộp, và hộp đó CHẶN luồng
///       nền — không dẹp thì thanh tiến trình đứng mãi và testcase chỉ báo 「hết giờ」.
///       <see cref="RunSearch"/> vừa chờ vừa dẹp, và ghi lại nguyên văn từng câu.</item>
/// </list>
/// </summary>
public sealed class VisitListScreen
{
    /// <summary>Đầu câu E00100 mà <c>getBuiPrice2</c> dựng (buiPrice.cs:196-203).</summary>
    public const string BuiPriceFailedHead = "一部負担金計算に失敗しました。";

    public const string WindowId = "frm204008";

    /// <summary>Cửa sổ 窓口精算（患者選択） — trạm trung chuyển duy nhất tới 来患一覧.</summary>
    public const string CounterWindowId = "frm204001";

    /// <summary>Thanh tiến trình của <c>searchProc</c> (COMMON.Forms.frm902005).</summary>
    public const string ProgressWindowId = "frm902005";

    /// <summary>Nhãn 12 cột, đúng <c>_viewItem</c> của frm204008 (frm204008.cs:63-78).</summary>
    public static readonly string[] HeaderLabels =
    [
        "患者番号", "氏　　名", "レセプト種別", "診療日", "初/再診",
        "医療保険点数", "医療保険負担金", "介護保険点数", "介護保険負担金",
        "保険外負担金", "保険外消費税", "　 合計金額",
    ];

    /// <summary>
    /// Nhãn 12 cột của FILE CSV — <c>editCsvHeader</c> (frm204008.cs:1005-1039).
    ///
    /// <para>Giống <see cref="HeaderLabels"/> ở 11 cột đầu, KHÁC ở cột cuối: CSV ghi
    /// 「合計金額」 còn lưới hiện 「　 合計金額」 (có khoảng trắng độn để căn phải). Hai hằng
    /// riêng chứ không suy từ nhau — chúng đến từ hai đoạn code khác nhau của app.</para>
    /// </summary>
    public static readonly string[] CsvHeaderLabels =
    [
        "患者番号", "氏　　名", "レセプト種別", "診療日", "初/再診",
        "医療保険点数", "医療保険負担金", "介護保険点数", "介護保険負担金",
        "保険外負担金", "保険外消費税", "合計金額",
    ];

    /// <summary>Chỉ số cột レセプト種別 trong <c>_viewItem</c>.</summary>
    public const int RcpTypeColumn = 2;

    private readonly OchaApp _app;
    private readonly Window _window;

    private VisitListScreen(OchaApp app, Window window)
    {
        _app = app;
        _window = window;
    }

    public Window Window => _window;

    // ── Đường vào ────────────────────────────────────────────────────────────

    /// <summary>Đưa app tới 来患一覧 và trả screen object. Đang mở sẵn thì bám vào luôn.</summary>
    public static VisitListScreen Open(OchaApp app, TestSettings settings)
    {
        var timeout = TimeSpan.FromSeconds(settings.App.LaunchTimeoutSeconds);

        if (app.Window(WindowId) is { } already) return new VisitListScreen(app, already);

        var counter = app.Window(CounterWindowId);
        if (counter is null)
        {
            var menu = Waits.TryFor(() => app.Window("MainMenu") ?? app.WindowByTitle("メインメニュー"), timeout)
                       ?? throw new TimeoutException(
                           "Không thấy cửa sổ メインメニュー. " + DescribeDialogs(app) +
                           " Kiểm C:\\NEW_SIM2000\\Ocha.xml và SQL Server (XmlControl.cs:235).");

            ClickPane(menu, "pnlBtn1", "業務 日常業務");
            ClickPane(menu, "pnlMenu4", "メニュー 窓口精算");
            counter = app.RequireWindow(CounterWindowId, timeout);
        }

        DismissAllDialogs(app, TimeSpan.FromSeconds(5));

        Uia.ForceForeground(counter.Properties.NativeWindowHandle);
        Uia.SendKey(Vk.F3);
        Waits.Step();

        var window = Waits.TryFor(() => app.Window(WindowId), timeout)
                     ?? throw new TimeoutException(
                         "Bấm F3 「来患一覧」 ở frm204001 mà frm204008 không mở. " + DescribeDialogs(app));

        return new VisitListScreen(app, window);
    }

    private static void ClickPane(Window window, string automationId, string what)
    {
        var pane = Waits.For(() => Uia.ById(window, automationId), $"{what} (pane 「{automationId}」)");
        Uia.MouseClick(pane);
        Waits.Step();
    }

    // ── Control ──────────────────────────────────────────────────────────────

    public AutomationElement SinryoYm => Uia.RequireById(_window, "dtSinryo");
    public AutomationElement SearchButton => Uia.RequireById(_window, "btnTotal");
    public AutomationElement Grid => Uia.RequireById(_window, "dgvViewS");
    public AutomationElement? Syosin => Uia.ById(_window, "chkSyosin");
    public AutomationElement? Saisin => Uia.ById(_window, "chkSaisin");
    public AutomationElement? Houmon => Uia.ById(_window, "chkHoumon");

    /// <summary>Ba checkbox 初診/再診/訪問診療 đang tick hay không (null = không đọc được).</summary>
    public (bool? Syosin, bool? Saisin, bool? Houmon) CheckboxStates() =>
        (Toggle(Syosin), Toggle(Saisin), Toggle(Houmon));

    private static bool? Toggle(AutomationElement? e)
    {
        if (e is null) return null;
        try { return e.AsCheckBox().IsChecked; } catch { return null; }
    }

    // ── 診療年月 ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Đặt 診療年月 = <paramref name="sinryoYm"/> (yyyyMM) rồi ĐẨY FOCUS RA NGOÀI.
    ///
    /// <para>Ô 年 nhận năm HOÀNG LỊCH: 2006/01 → 平成18 → gõ 「18」. Ô 日 đã bị
    /// <c>delDay(false)</c> giấu đi (frm204008.cs:425) nên chỉ có 2 ô cần gõ — khác
    /// <c>AppNavigator.SetTreatmentDate</c> vốn gõ cả 3.</para>
    ///
    /// <para>Bước rời focus (click sang checkbox 初診) KHÔNG phải cho đẹp — xem bẫy số 1
    /// ở doc-comment của lớp. Click vào checkbox thì tick của nó không đổi (click rơi vào
    /// control nhưng <see cref="Uia.Click"/> dùng InvokePattern/toạ độ tâm; ở đây dùng
    /// <see cref="Uia.MouseClick"/> lên NHÃN 診療年月 để không chạm vào bất kỳ cờ nào).</para>
    /// </summary>
    public void SetSinryoYm(string sinryoYm)
    {
        var (year, month) = VisitListDb.ParseYm(sinryoYm);
        var era = EraOf(year, month);

        var control = SinryoYm;
        SelectEra(control, era.Name);

        Uia.SetText(Waits.For(() => Uia.ById(control, "txtYear"), "ô 年 của 診療年月"),
                    (year - era.StartYear).ToString());
        Uia.SetText(Waits.For(() => Uia.ById(control, "txtMonth"), "ô 月 của 診療年月"),
                    month.ToString());

        LeaveDateControl();
    }

    /// <summary>
    /// Đưa focus ra khỏi <c>dtSinryo</c> để <c>CustomDate_Leave</c> ghi <c>SelDate</c>.
    ///
    /// <para>Đặt focus vào LƯỚI chứ không phải một checkbox: lưới ReadOnly hoàn toàn nên
    /// focus vào đó không đổi trạng thái gì, còn chạm nhầm 初診/再診/訪問診療 là đổi luôn
    /// điều kiện tìm kiếm (mask ở frm204008.cs:677-682) và cả testcase mất nghĩa.</para>
    /// </summary>
    private void LeaveDateControl()
    {
        try { Grid.Focus(); }
        catch
        {
            // DataGridView đôi khi không nhận SetFocus qua UIA — lùi về Tab, phím này chỉ
            // chuyển focus chứ không kích hoạt gì trên màn 来患一覧.
            Uia.ForceForeground(_window.Properties.NativeWindowHandle);
            Uia.SendKey(0x09);
        }
        Waits.Step();
        Thread.Sleep(200);
    }

    /// <summary>
    /// 元号 chứa (năm, tháng) đó và năm gốc để trừ ra năm hoàng lịch.
    ///
    /// <para>Ranh giới là NGÀY chứ không phải năm (平成 bắt đầu 1989-01-08, 令和 bắt đầu
    /// 2019-05-01) nên phải xét cả tháng. Cùng bảng với hàm <c>eraOf</c> của spec
    /// Playwright — hai bên lệch nhau thì hai bên gõ hai tháng khác nhau và mọi so sánh
    /// sau đó vô nghĩa.</para>
    /// </summary>
    public static (string Name, int StartYear) EraOf(int year, int month)
    {
        if (year > 2019 || (year == 2019 && month >= 5)) return ("令和", 2018);
        if (year > 1989 || (year == 1989 && month >= 1)) return ("平成", 1988);
        if (year > 1926 || (year == 1926 && month >= 12)) return ("昭和", 1925);
        return ("大正", 1911);
    }

    /// <summary>
    /// Chọn 元号 trên <c>cboEra</c>.
    ///
    /// <para>Phải BUNG combo ra thì cầu MSAA→UIA mới dựng <c>ListItem</c> — hỏi lúc combo
    /// còn đóng thì <c>Items</c> trả rỗng (đã trả giá ở luồng PerioKensaOrder).</para>
    /// </summary>
    public void SelectEra(AutomationElement dateControl, string eraName)
    {
        var combo = Waits.For(() => Uia.ById(dateControl, "cboEra"), "combo 元号 「cboEra」").AsComboBox();

        if (Txt.N(ComboText(combo)).StartsWith(eraName, StringComparison.Ordinal)) return;

        try { combo.Expand(); Thread.Sleep(250); } catch { /* không có ExpandCollapsePattern */ }

        var items = SafeItems(combo);
        var hit = items.FirstOrDefault(i => Txt.N(Uia.NameOf(i)).StartsWith(eraName, StringComparison.Ordinal));
        if (hit is null)
        {
            try { combo.Collapse(); } catch { /* nt */ }
            throw new InvalidOperationException(
                $"cboEra không có 元号 「{eraName}」. Đang có: " +
                string.Join(" / ", items.Select(i => $"「{Txt.N(Uia.NameOf(i))}」")) +
                ". Danh sách 元号 đọc từ <EraInfo> trong C:\\NEW_SIM2000\\Ocha.xml (CustomDate.cs:297).");
        }

        try { hit.AsListBoxItem().Select(); }
        catch { Uia.MouseClick(hit); }
        Waits.Step();
        Thread.Sleep(200);
    }

    /// <summary>Mục đang chọn của một combo; đọc không được thì trả chuỗi rỗng.</summary>
    public static string ComboText(ComboBox combo)
    {
        try
        {
            if (combo.SelectedItem is { } sel) return Uia.NameOf(sel);
            return combo.EditableText;
        }
        catch { return Uia.ValueOf(combo); }
    }

    /// <summary>Mọi mục của combo 元号 — chỉ để CHẨN ĐOÁN khi không tìm ra 元号 cần dùng.</summary>
    public IReadOnlyList<string> EraItems()
    {
        var el = Uia.ById(SinryoYm, "cboEra");
        if (el is null) return [];
        var combo = el.AsComboBox();
        try { combo.Expand(); Thread.Sleep(250); } catch { /* nt */ }
        var items = SafeItems(combo).Select(i => Txt.N(Uia.NameOf(i))).ToList();
        try { combo.Collapse(); Thread.Sleep(150); } catch { /* nt */ }
        return items;
    }

    private static IReadOnlyList<AutomationElement> SafeItems(ComboBox combo)
    {
        try { return combo.Items; } catch { return []; }
    }

    // ── 検索 ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Bấm 検索 và chờ <c>searchProc</c> xong.
    ///
    /// <para>Vòng chờ phải vừa canh <c>frm902005</c> vừa canh MessageBox — xem bẫy số 3 ở
    /// doc-comment của lớp. Mọi câu đọc được đều được ghi lại nguyên văn.</para>
    ///
    /// <para>Một lượt 検索 gọi <c>getBuiPrice2</c> cho TỪNG (bệnh nhân × ngày) và mỗi lượt
    /// là vài truy vấn. Chọn tháng nhỏ, và cho <paramref name="budget"/> rộng tay.</para>
    /// </summary>
    public SearchRunResult RunSearch(TimeSpan budget, TestTrace? trace = null)
    {
        var clock = System.Diagnostics.Stopwatch.StartNew();
        var dialogs = new List<string>();

        Uia.ForceForeground(_window.Properties.NativeWindowHandle);
        Uia.Click(SearchButton);
        trace?.Note("đã bấm 検索");

        var progressSeen = false;
        System.Diagnostics.Stopwatch? quietSince = null;

        while (clock.Elapsed < budget)
        {
            foreach (var text in DrainDialogs(_app))
            {
                dialogs.Add(text);
                trace?.Note("hộp thoại: " + OneLine(text));
                quietSince = null;
            }

            if (_app.Window(ProgressWindowId) is not null)
            {
                progressSeen = true;
                quietSince = null;
                Thread.Sleep(250);
                continue;
            }

            // Hết thanh tiến trình và hết hộp thoại — chờ thêm một nhịp cho dspData kịp
            // gắn DataSource rồi mới kết luận là xong.
            quietSince ??= System.Diagnostics.Stopwatch.StartNew();
            if (quietSince.Elapsed > TimeSpan.FromSeconds(2)) break;
            Thread.Sleep(200);
        }

        clock.Stop();
        return new SearchRunResult(clock.Elapsed, dialogs, progressSeen, clock.Elapsed >= budget);
    }

    /// <summary>
    /// Đọc rồi bấm OK cho mọi MessageBox đang mở; trả nguyên văn từng câu.
    ///
    /// <para><b>Dùng Win32 thuần (<see cref="MsgBoxWin32"/>), KHÔNG dùng
    /// <c>Dialogs.Open</c>.</b> Đo được 2026-09-04: <c>Dialogs.Open</c> KHÔNG nhìn thấy
    /// hộp 「CSV出力が完了しました。」 dù ảnh chụp cho thấy nó đang chắn giữa màn hình —
    /// cả một lượt probe kết luận sai vì chuyện đó. Và nó còn quét toàn desktop qua UIA
    /// nên gọi trong vòng poll là tự chuốc lấy treo (đã trả giá 2026-08-27, hơn 20 phút).
    /// <c>EnumWindows</c> thì chạy trong vài mili-giây và không bao giờ chặn.</para>
    ///
    /// <para>Nút bấm theo NGÔN NGỮ WINDOWS chứ không theo ngôn ngữ app: máy test hiện
    /// 「OK」/「Yes」/「No」 chứ không phải 「はい」/「いいえ」 — nên thử cả hai bộ.</para>
    /// </summary>
    public static IReadOnlyList<string> DrainDialogs(OchaApp app)
    {
        var texts = new List<string>();
        foreach (var box in MsgBoxWin32.All(app.ProcessId))
        {
            texts.Add(box.Text.Length > 0 ? box.Text : box.Title);
            MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes");
        }
        return texts;
    }

    private static void DismissAllDialogs(OchaApp app, TimeSpan budget)
    {
        var clock = System.Diagnostics.Stopwatch.StartNew();
        while (clock.Elapsed < budget)
        {
            if (DrainDialogs(app).Count == 0) return;
            Thread.Sleep(200);
        }
    }

    private static string DescribeDialogs(OchaApp app)
    {
        var texts = MsgBoxWin32.All(app.ProcessId)
                               .Select(d => OneLine(d.ToString()))
                               .Where(t => t.Length > 0)
                               .ToList();
        return texts.Count == 0
            ? "Không có hộp thoại nào đang mở."
            : "Hộp thoại đang mở: " + string.Join(" / ", texts) + ".";
    }

    public static string OneLine(string s) => s.Replace("\r", " ").Replace("\n", " ").Trim();

    // ── Lưới ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Ô mà một cell của <c>DataGridView</c> trả về khi <c>FormattedValue</c> RỖNG.
    ///
    /// <para>Đo được 2026-09-04: <c>DataGridViewCellAccessibleObject.Value</c> của .NET
    /// Framework trả về chuỗi tài nguyên <c>DataGridView_AccNullValue</c> — trên máy test
    /// (Windows tiếng Anh) là 「(null)」 — chứ KHÔNG phải chuỗi rỗng. Đây chính là dấu
    /// hiệu đọc được của banding: <c>dgvView_CellFormatting</c> đặt <c>e.Value = ""</c>
    /// cho ô lặp lại (frm204008.cs:161-167).</para>
    ///
    /// <para>Đừng nhầm với ô SỐ không có giá trị (介護保険点数…): những ô đó qua
    /// <c>string.Format("{0:#,0} ", DBNull)</c> thành một dấu cách, tức FormattedValue
    /// KHÔNG rỗng, nên đọc ra chuỗi rỗng sau khi trim. Hai thứ khác nhau.</para>
    /// </summary>
    public const string AccNullValue = "(null)";

    /// <summary>Ô đó có đang bị banding bỏ trắng không (xem <see cref="AccNullValue"/>).</summary>
    public static bool IsBlanked(string cell) =>
        cell.Length == 0 || cell == AccNullValue;

    /// <summary>
    /// MỌI dòng của <c>dgvViewS</c>, kể cả DÒNG TIÊU ĐỀ (phần tử đầu) và dòng 合計 (cuối).
    ///
    /// <para><b>Đọc được cả lưới, không phải chỉ khung nhìn.</b> Đã đo 2026-09-04: 200601
    /// có 88 phần tử = 1 tiêu đề + 86 dòng khám + 1 dòng 合計, trong khi lưới chỉ cao
    /// ~23 dòng. Cầu MSAA→UIA của <c>dgvViewS</c> dựng phần tử cho mọi dòng — KHÁC
    /// <c>grdRegi</c> của 診療入力 (PROBE-GUIDELINE 3.1), nên ở màn này không phải cuộn.</para>
    ///
    /// <para><b>ĐẮT.</b> 88 dòng × 12 ô ≈ 1.000 lượt hỏi UIA, đo được ~50 giây một lượt
    /// đọc. Gọi MỘT LẦN rồi giữ lại, đừng gọi trong vòng lặp.</para>
    /// </summary>
    public IReadOnlyList<VisitGridRow> AllRows(int limit = int.MaxValue) =>
        new WinFormsGrid(Grid).Rows(limit).Select(r => new VisitGridRow(r.Cells)).ToList();

    /// <summary>
    /// Các ô của DÒNG TIÊU ĐỀ, để click vào mà thử sort.
    ///
    /// <para>Trả về phần tử con của dòng đầu — cùng chỗ mà <see cref="HeaderRow"/> đọc chữ
    /// ra. Click vào đây đi qua đúng <c>dgvView_CellMouseClick</c> với
    /// <c>e.RowIndex == -1</c> (frm204008.cs:228-266).</para>
    /// </summary>
    public IReadOnlyList<AutomationElement> HeaderCells()
    {
        var first = new WinFormsGrid(Grid).RowElements(1).FirstOrDefault();
        return first is null ? [] : Uia.Children(first).ToList();
    }

    /// <summary>
    /// Dấu vân tay 「患者番号/診療日」 của <paramref name="count"/> dòng dữ liệu đầu tiên —
    /// mốc RẺ để biết lưới có sắp lại hay không.
    ///
    /// <para>Đọc cả lưới tốn ~50 giây nên đừng dùng <see cref="AllRows()"/> cho việc này.
    /// Bỏ phần tử đầu vì đó là dòng tiêu đề.</para>
    /// </summary>
    public string Fingerprint(int count = 8) =>
        string.Join(",", AllRows(count + 1).Skip(1).Select(r => r.PatNo + "/" + r.Day));

    /// <summary>
    /// Nhãn 12 cột, đọc từ PHẦN TỬ ĐẦU của lưới.
    ///
    /// <para><c>WinFormsGrid.Headers()</c> trả RỖNG ở màn này (đo 2026-09-04): cầu
    /// MSAA→UIA không đánh dấu dòng tiêu đề bằng <c>HeaderItem</c>, nó về như một dòng
    /// thường mà các ô mang đúng chữ tiêu đề — đúng cái bẫy PROBE-GUIDELINE 3.2. Nên nhãn
    /// cột phải lấy từ đây, và mọi chỗ đọc dữ liệu phải BỎ phần tử đầu.</para>
    /// </summary>
    public IReadOnlyList<string> HeaderRow()
    {
        var first = AllRows(1).FirstOrDefault();
        return first is null ? [] : Enumerable.Range(0, first.Cells.Count).Select(first.Cell).ToList();
    }

    // ── F4 CSV出力 ───────────────────────────────────────────────────────────

    /// <summary>
    /// Xuất toàn bộ lưới ra CSV bằng <b>F4 CSV出力</b> rồi đọc lại file.
    ///
    /// <para>Đây là đường DUY NHẤT lấy được cả 86 dòng: <c>outputCsvFile</c> ghi thẳng
    /// <c>dgvViewS.DataSource</c> (frm204008.cs:980-1003) nên không qua
    /// <c>CellFormatting</c> — không có khoảng trắng độn, không có ô bị banding bỏ trắng,
    /// và có cả dòng 合計. Đúng nghĩa 「đáp án thô của WinForm」 để đối chiếu với payload
    /// <c>/tenant/settlement/visit-list</c> của bản web.</para>
    ///
    /// <para>File ghi bằng <b>Shift_JIS</b> (ExcelIO.cs:389) — .NET 8 không có sẵn
    /// code-page đó, xem <see cref="RegisterShiftJis"/>.</para>
    ///
    /// <para>Không bấm nút 「保存」 theo tên: hộp thoại này là hộp thoại của SHELL nên chữ
    /// trên nút chạy theo ngôn ngữ Windows chứ không theo app. Gõ đường dẫn rồi Enter đi
    /// đúng một đường cho mọi ngôn ngữ.</para>
    /// </summary>
    public IReadOnlyList<string> ExportCsv(string path, TestTrace? trace = null)
    {
        RegisterShiftJis();

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        if (File.Exists(path)) File.Delete(path);

        Uia.ForceForeground(_window.Properties.NativeWindowHandle);
        Uia.SendKey(Vk.F4);
        trace?.Note("đã bấm F4 CSV出力");

        var save = Waits.TryFor(
            () => _app.Windows().FirstOrDefault(w => Uia.ById(w, "1001") is not null
                                                     || Txt.Has(Uia.NameOf(w), "保存")
                                                     || Txt.Has(Uia.NameOf(w), "Save")),
            TimeSpan.FromSeconds(20));

        if (save is null)
            throw new TimeoutException(
                "Bấm F4 mà hộp thoại 「名前を付けて保存」 không hiện. " + DescribeDialogs(_app) +
                " F4 chỉ bật khi BaseForm2 định tuyến phím tới btnF4_Click — kiểm xem cửa sổ " +
                "frm204008 có đang là cửa sổ trước mặt không.");

        // Ô tên file của SaveFileDialog: ComboBox 「1148」 bọc một Edit, hoặc Edit 「1001」
        // tuỳ phiên bản shell. Tìm Edit đầu tiên là chắc nhất.
        var edit = Waits.For(
            () => Uia.Descendants(save, maxDepth: 6)
                     .FirstOrDefault(e => Uia.ControlTypeOf(e) == FlaUI.Core.Definitions.ControlType.Edit),
            "ô tên file của 「名前を付けて保存」");

        Uia.SetText(edit, path);
        Waits.Step();
        Uia.SendKey(Vk.Return);

        // ⚠️ CHỜ ĐÚNG HỘP THOẠI I00005, KHÔNG PHẢI 「có hộp thoại nào đó」, KHÔNG PHẢI FILE.
        //
        // 「CSV出力が完了しました。」 (I00005) bung SAU khi StreamWriter đóng file
        // (frm204008.cs:326), còn File.Exists thành true NGAY LÚC file được TẠO. Chờ theo
        // file thì thoát sớm, hộp thoại ở lại và MODAL: mọi thao tác sau đó rơi vào nó.
        // Đã trả giá 2026-09-04 — Tc0d kết luận 「bấm tiêu đề cột không sort」 cho cả ba cột
        // trong khi ba cú click đều rơi vào hộp thoại đang che lưới; chỉ ảnh chụp mới lộ ra.
        //
        // Rồi trả giá lần hai: chờ 「có hộp thoại rồi hết hộp thoại」 cũng sai, vì CHÍNH hộp
        // thoại 名前を付けて保存 cũng là lớp #32770 (Win32 đọc ra 「Namespace Tree Control」).
        // Nó đóng lại là điều kiện thoả NGAY, trước khi app kịp ghi xong file.
        //
        // Mốc đúng: một hộp thoại mà ta THẬT SỰ BẤM ĐƯỢC nút 「OK」. Hộp thoại của shell
        // không có nút nào tên OK (nó có 保存/Save + キャンセル/Cancel) nên ClickButton trả
        // false — phân biệt được mà không phải đoán tiêu đề hay HWND.
        var seen = new List<string>();
        var answered = false;
        var done = Waits.TryUntil(
            () =>
            {
                foreach (var box in MsgBoxWin32.All(_app.ProcessId))
                {
                    if (!MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes")) continue;
                    seen.Add(box.Text.Length > 0 ? box.Text : box.Title);
                    answered = true;
                }
                return answered && MsgBoxWin32.All(_app.ProcessId).Count == 0;
            },
            TimeSpan.FromSeconds(90));

        foreach (var text in seen) trace?.Note("hộp thoại sau CSV: " + OneLine(text));

        if (!done)
            throw new TimeoutException(
                "Không thấy (hoặc không dẹp được) hộp thoại 「CSV出力が完了しました。」 sau khi lưu. " +
                DescribeDialogs(_app) +
                " Còn hộp thoại nào đang mở thì mọi thao tác sau đó rơi vào nó, không vào màn hình.");

        if (!File.Exists(path))
            throw new FileNotFoundException(
                $"App đóng hộp thoại rồi mà không thấy file 「{path}」. Câu app vừa nói: " +
                string.Join(" / ", seen.Select(t => $"「{OneLine(t)}」")) +
                " — nếu đó là E99999 thì outputCsvFile đã ném (hay gặp nhất: lưới chưa 検索 " +
                "nên DataSource = null).", path);

        return File.ReadAllLines(path, Encoding.GetEncoding(932));
    }

    /// <summary>
    /// Bật code-page 932 cho .NET 8.
    ///
    /// <para>.NET Core trở đi chỉ mang theo Unicode + Latin1; Shift_JIS phải nạp thêm từ
    /// <c>System.Text.Encoding.CodePages</c>. Thiếu bước này thì
    /// <c>Encoding.GetEncoding(932)</c> ném <c>NotSupportedException</c> — và thông điệp
    /// của nó chẳng nói gì về CSV.</para>
    /// </summary>
    public static void RegisterShiftJis()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    }
}
