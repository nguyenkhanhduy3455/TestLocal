using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.TrnCheck;

/// <summary>
/// <b>PROBE 2 — hai chỗ mà PROBE 1 (2026-08-26 15:42) đo ra 「hỏng」 nhưng KHÔNG nói
/// được vì sao.</b>
///
/// Lượt chạy đầu trả lời xong 7/9 câu, và đúng hai chỗ còn lại thì thông điệp lỗi
/// không đủ để đi sửa:
///
/// <code>
/// KQ-3  lbChk nói 3 lỗi, đọc grdChek ra 4 dòng nhưng nội dung là 「Row 0」…「Row 3」
///       ⇒ đọc TRÚNG dòng, TRẬT ô. Uia.ValueOf rơi hết ba tầng (ValuePattern →
///         LegacyIAccessible.Value → NameOf) nên trả về Name của phần tử.
///         Cùng hàm đó đọc grdRegi thì ra giá trị. ⇒ grdChek phơi ra khác.
///         KHÔNG đoán tiếp — ĐỔ CÂY UIA ra rồi đọc (PROBE-GUIDELINE 3.2).
///
/// KQ-7  Gõ 165 vào ô 点 ở コードモード → 処置選択 không mở, 合計点数 KHÔNG đổi,
///       và ảnh 03x_04-sau-khi-chen-165.png cho thấy cửa sổ trước mặt là
///       MICROSOFT EDGE đang mở C:\Users\HOANGSONPC\Desktop\1.pdf — tức là loạt
///       phím/chuột rơi vào Edge chứ không vào app (PROBE-GUIDELINE 3.4 nhưng ở
///       mức cửa sổ: không phải hộp thoại chắn, mà là app MẤT foreground).
///       Nội dung PDF là 「歯と口の健康のために（治療のお知らせ）」 = văn bản mà chính
///       app xuất ra từ nút 「指導文書」 nằm ở đáy lưới (604, 823) — nghi vấn: một cú
///       LeftClickPhysical đi lạc toạ độ và bấm trúng nút đó.
/// </code>
///
/// Probe này KHÔNG assert, KHÔNG bao giờ ném, và tách làm hai testcase để chạy
/// riêng từng cái cho nhanh:
///
/// <code>
///   .\run-trn-check.ps1 -Case ProbeTree     (Tc1 — cây UIA của panel)
///   .\run-trn-check.ps1 -Case ProbeInsert   (Tc2 — đường chèn 165, từng bước)
/// </code>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, không nằm trong lượt chạy đủ")]
[Category("trn-check")]
public sealed class TrnCheckProbe2Tests : UiTestBase
{
    private TrnCheckFlow _flow = null!;

    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void Probe2OneTimeSetUp() => _flow = new TrnCheckFlow(App, Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    /// <summary>
    /// Cửa sổ đang ở TRƯỚC MẶT có phải app không.
    ///
    /// <para>Câu hỏi này phải hỏi TRƯỚC mỗi cú click chuột vật lý. Lượt chạy đầu mất
    /// KQ-7/8/9 chỉ vì không ai hỏi nó: Edge nhảy lên trước, mọi thao tác sau đó rơi
    /// vào Edge, và thông điệp lỗi lại nói 「処置選択 không mở」 — nghe như app sai.</para>
    /// </summary>
    private string ForegroundDescription()
    {
        try
        {
            var fg = Win32Fg.GetForegroundWindow();
            var app = Screen.Window.Properties.NativeWindowHandle.ValueOrDefault;
            var title = new System.Text.StringBuilder(512);
            Win32Fg.GetWindowText(fg, title, title.Capacity);
            var same = fg == app;
            return $"{(same ? "APP" : "KHÁC APP")} — hwnd={fg} 「{Txt.N(title.ToString())}」 " +
                   $"(app hwnd={app})";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    private static class Win32Fg
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc1 — CÂY UIA của panel 処置データチェック
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — PROBE: đổ cây UIA của PnlChek/grdChek để biết ô lỗi nằm ở thuộc tính nào")]
    public void Tc1_ProbePanelTree()
    {
        using var trace = TestTrace.Begin();
        Log($"foreground lúc bắt đầu: {ForegroundDescription()}");

        var sweep = _flow.PressF3(trace);
        trace.Shot("01-panel-dang-mo");
        Kq("A", $"panelOpened={sweep.PanelOpened} · lbChk=「{_flow.PanelCountText()}」 · {sweep.Note}");

        if (!sweep.PanelOpened)
        {
            if (sweep.NoErrorDialog is not null)
                Dialogs.ClickButton(sweep.NoErrorDialog, "OK", "はい", "Yes");
            Kq("B", "bỏ qua — không có panel để đổ cây. Tháng này không có lỗi nào.");
            return;
        }

        Safe("do cay UIA cua panel", () =>
        {
            var panel = Uia.ById(Screen.Window, "PnlChek");
            if (panel is null)
            {
                Kq("B", "KHÔNG thấy PnlChek dù panel đang hiện — locator sai.");
                return;
            }

            var dump = Uia.DumpTree(panel, maxDepth: 8, maxChildrenPerNode: 60);
            var path = Path.Combine(AppContext.BaseDirectory, "artifacts", "pnlchek.uia.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, dump);
            Kq("B", $"đã đổ cây UIA của PnlChek ra {path} ({dump.Length} ký tự)");
            foreach (var line in dump.Split('\n').Take(60)) Log("    " + line.TrimEnd());
        });

        Safe("doc TUNG thuoc tinh cua tung o", () =>
        {
            var grid = Uia.ById(Screen.Window, "grdChek");
            if (grid is null) { Kq("C", "KHÔNG thấy grdChek."); return; }

            Kq("C", "bảng thuộc tính của từng ô — cột nào có chữ thật thì dùng cột đó mà đọc");
            var rowIndex = 0;
            foreach (var row in new WinFormsGrid(grid).RowElements(limit: 30))
            {
                Log($"    ── dòng #{rowIndex++}: type={Uia.ControlTypeOf(row)} " +
                    $"name=「{Txt.N(Uia.NameOf(row))}」 id=「{Uia.AutomationIdOf(row)}」");

                var cellIndex = 0;
                foreach (var cell in Uia.Children(row))
                {
                    Log($"        ô #{cellIndex++}: type={Uia.ControlTypeOf(cell)}");
                    Log($"           Name          = 「{Txt.N(Uia.NameOf(cell))}」");
                    Log($"           AutomationId  = 「{Uia.AutomationIdOf(cell)}」");
                    Log($"           ValuePattern  = 「{Raw(() => cell.Patterns.Value.PatternOrDefault?.Value.ValueOrDefault)}」");
                    Log($"           LegacyValue   = 「{Raw(() => cell.Patterns.LegacyIAccessible.PatternOrDefault?.Value.ValueOrDefault)}」");
                    Log($"           LegacyName    = 「{Raw(() => cell.Patterns.LegacyIAccessible.PatternOrDefault?.Name.ValueOrDefault)}」");
                    Log($"           LegacyDescr   = 「{Raw(() => cell.Patterns.LegacyIAccessible.PatternOrDefault?.Description.ValueOrDefault)}」");
                    Log($"           HelpText      = 「{Raw(() => cell.Properties.HelpText.ValueOrDefault)}」");
                }

                // Không có ô con nào ⇒ chữ phải nằm trên CHÍNH dòng.
                if (!Uia.Children(row).Any())
                {
                    Log($"        (dòng KHÔNG có ô con) Value=「{Raw(() => row.Patterns.Value.PatternOrDefault?.Value.ValueOrDefault)}」 " +
                        $"LegacyValue=「{Raw(() => row.Patterns.LegacyIAccessible.PatternOrDefault?.Value.ValueOrDefault)}」");
                }
            }
        });

        Safe("dong panel", () => _flow.ClosePanel());
        trace.Shot("02-ket-thuc");

        static string Raw(Func<string?> get)
        {
            try { return Txt.N(get()); }
            catch (Exception e) { return $"<{e.GetType().Name}>"; }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc2 — đường chèn 165 スケーリング, từng bước một
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc2 — PROBE: vì sao chèn 165 hụt, và đường tab 個別 có khá hơn không")]
    public void Tc2_ProbeInsert()
    {
        using var trace = TestTrace.Begin();

        Log($"foreground lúc bắt đầu: {ForegroundDescription()}");
        Log($"合計 = {_flow.Grid.AllPoint()} · {_flow.CountScalingRows()} dòng スケーリング");
        trace.Shot("01-truoc-khi-lam-gi");

        // ── KQ-D: app có đang ở trước mặt không, và ép lên được không ────────
        Safe("KQ-D ep app len truoc mat", () =>
        {
            var before = ForegroundDescription();
            var hwnd = Screen.Window.Properties.NativeWindowHandle.ValueOrDefault;
            var forced = Uia.ForceForeground(hwnd);
            Thread.Sleep(500);
            Kq("D", $"trước: {before} · ForceForeground={forced} · sau: {ForegroundDescription()}");
        });

        // ── KQ-E: lbInpMode — nghi phạm số một của cú click đi lạc ───────────
        Safe("KQ-E soi lbInpMode", () =>
        {
            var label = Uia.ById(Screen.Window, "lbInpMode");
            if (label is null)
            {
                Kq("E", "KHÔNG thấy lbInpMode ⇒ EnsureCodeMode() lẽ ra phải trả false. " +
                        "Nếu nó trả true thì đó là lỗi của HighNeedsFlow, không phải của app.");
                return;
            }

            var onScreen = Uia.IsOnScreen(label);
            var (cx, cy) = Uia.Center(label);
            var winRect = Raw(() => Screen.Window.BoundingRectangle.ToString());
            Kq("E", $"lbInpMode: onScreen={onScreen} · text=「{Txt.N(Uia.ValueOf(label))}」 · " +
                    $"tâm=({cx},{cy}) · rect={Raw(() => label.BoundingRectangle.ToString())} · " +
                    $"cửa sổ app rect={winRect}");

            if (!onScreen)
                Log("    ⚠ Nhãn KHÔNG on-screen mà Center() vẫn trả toạ độ ⇒ click sẽ rơi ra ngoài app. " +
                    "Đây là ứng viên số một cho cú click bấm trúng nút 「指導文書」 (604,823) làm Edge mở PDF.");
        });

        // ── KQ-F: đường tab 個別 (không cần コードモード, không click toạ độ lạ) ─
        Safe("KQ-F chen 165-1 qua tab 個別", () =>
        {
            var before = _flow.Grid.AllPointValue();
            var beforeRows = _flow.CountScalingRows();

            string? name = null;
            try
            {
                name = _flow.Entry.InsertFromKobetu(TrnCheckFlow.ScalingCd, TrnCheckFlow.ScalingSb, trace);
            }
            catch (Exception e)
            {
                Log($"    InsertFromKobetu ném: {e.GetType().Name}: {e.Message}");
            }

            trace.Shot("02-sau-khi-chen-qua-個別");
            var warnings = _flow.DrainW00100(trace);
            var after = _flow.Grid.AllPointValue();

            Kq("F", $"tab 個別 chèn 165-1: tên đọc được 「{name ?? "(null)"}」 · " +
                    $"合計 {before?.ToString() ?? "?"} → {after?.ToString() ?? "?"} · " +
                    $"スケーリング {beforeRows} → {_flow.CountScalingRows()} dòng · " +
                    $"W00100 bung {warnings.Count} câu · foreground: {ForegroundDescription()}");
            for (var i = 0; i < warnings.Count; i++) Log($"    W00100 [{i + 1}] {warnings[i]}");

            if (after == before)
                Log("    ⚠ 合計 KHÔNG đổi ⇒ chưa chèn được gì. Xem ảnh 02-sau-khi-chen-個別: " +
                    "có phải lưới 個別 không tìm ra 165, hay cú click không tới?");
        });

        // ── KQ-G: 個別 có những 枝番 nào cho mã 165 ──────────────────────────
        Safe("KQ-G liet ke 枝番 cua 165 tren tab 個別", () =>
        {
            var kobetu = Screen.Kobetu;
            kobetu.Open();
            kobetu.ResetSearchBoxes();
            var rows = kobetu.SearchByCode(TrnCheckFlow.ScalingCd, expectAtLeast: 0);
            Kq("G", $"mã 165 trên tab 個別 có {rows.Count} dòng:");
            foreach (var r in rows.Take(20))
                Log($"    ｺｰﾄﾞ={r.At(KobetuTab.Col.Code)}-{r.At(KobetuTab.Col.Sub)} " +
                    $"「{r.At(KobetuTab.Col.Name)}」 一般={r.At(KobetuTab.Col.Ippan)}");

            if (rows.Count == 0)
                Log("    ⚠ Master tháng này KHÔNG có 165 ⇒ không dựng được tình huống Chkrol999 " +
                    "bằng giao diện. Phải đổi 処置 khác, hoặc đổi ngày test sang tháng có 165.");
        });

        // ── KQ-H: đường コードモード, đo từng bước ────────────────────────────
        Safe("KQ-H go ma o コードモード, tung buoc", () =>
        {
            Uia.ForceForeground(Screen.Window.Properties.NativeWindowHandle.ValueOrDefault);
            Thread.Sleep(400);

            var modeOk = _flow.Entry.EnsureCodeMode();
            Log($"    EnsureCodeMode() = {modeOk} · lbInpMode = 「{_flow.Entry.InpMode()}」 · " +
                $"foreground: {ForegroundDescription()}");
            trace.Shot("03-sau-EnsureCodeMode");

            var row = _flow.Entry.TargetRow();
            if (row is null) { Kq("H", "TargetRow() = null ⇒ không có dòng nào để đứng gõ."); return; }
            Log($"    TargetRow = {row}");

            var cells = Uia.Children(row.Element).ToList();
            if (cells.Count > RegiGrid.Col.Ten)
            {
                var (x, y) = Uia.Center(cells[RegiGrid.Col.Ten]);
                Log($"    ô 点 của dòng đó: tâm=({x},{y}) rect={Raw(() => cells[RegiGrid.Col.Ten].BoundingRectangle.ToString())}");
            }

            _flow.Grid.FocusCell(row, RegiGrid.Col.Ten);
            trace.Shot("04-sau-khi-click-o-点");
            Log($"    sau click: ô đang giữ con trỏ = 「{_flow.Grid.FocusedCellName()}」 · " +
                $"IsEditing={_flow.Grid.IsEditing()} · foreground: {ForegroundDescription()}");

            if (!_flow.Grid.IsEditing()) _flow.Grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _flow.Grid.Type(TrnCheckFlow.ScalingCd.ToString());
            trace.Shot("05-sau-khi-go-165-chua-Enter");
            Log($"    nội dung editor trước Enter = 「{_flow.Grid.EditorText()}」");

            _flow.Grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(1500);
            trace.Shot("06-sau-Enter");

            var picker = _flow.Entry.Picker();
            Kq("H", $"sau Enter: 処置選択 {(picker is null ? "KHÔNG mở" : "ĐÃ mở")} · " +
                    $"hộp thoại đang có: {_flow.Entry.DescribeDialogs()} · " +
                    $"合計={_flow.Grid.AllPoint()} · foreground: {ForegroundDescription()}");

            if (picker is not null)
            {
                var rows = _flow.Entry.ReadPicker(picker);
                foreach (var r in rows.Take(20)) Log($"    picker: {r}");
                _flow.Entry.ClosePicker(picker);
            }
        });

        Safe("don dep", () => _flow.Entry.DismissAll());
        trace.Shot("07-ket-thuc");

        static string Raw(Func<string?> get)
        {
            try { return get() ?? ""; }
            catch (Exception e) { return $"<{e.GetType().Name}>"; }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Tc3 — 行単位 W00100: mồi nào bung được cảnh báo, và bung MẤY câu
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 医学管理料 併算定 — mồi mà spec web dùng cho 「WinForm parity 3」.
    ///
    /// <para><c>ChkCalcPossible_medical_care_fee</c> (Check.cs:8107) coi 特疾管 (113-0) và
    /// 歯在管 (598-3) là <b>hai 医学管理料 KHÁC NHAU</b>, nên cái thứ hai trong cùng tháng
    /// luôn báo 同月算定不可 — message KHÔNG phụ thuộc dữ liệu sẵn có của ngày test. Đó là
    /// lý do spec web chọn đúng cặp này sau khi đã loại hai mồi khác (108 và 医管 334-8).</para>
    /// </summary>
    private const int MedCare1Cd = 113, MedCare1Sb = 0;

    private const int MedCare2Cd = 598, MedCare2Sb = 3;

    [Test, Order(3)]
    [Description("Tc3 — PROBE: mồi nào bung W00100, bung mấy câu, có câu nào TRÙNG không")]
    public void Tc3_ProbeW00100()
    {
        using var trace = TestTrace.Begin();

        Log($"foreground: {ForegroundDescription()}");
        trace.Shot("01-truoc-khi-lam-gi");

        // ── KQ-I: chèn スケーリング có bung cảnh báo nào không ────────────────
        //
        // PROBE 2 Tc2 KQ-F đã đo: 0 câu. Ghi lại ở đây thành một mốc rõ ràng —
        // một 処置 「vô hại」 KHÔNG sinh W00100, nên mọi câu đo được ở KQ-J/KQ-K là do
        // chính cặp 医学管理料 sinh ra chứ không phải nhiễu nền.
        Safe("KQ-I chen 165-1 (mo vo hai)", () =>
        {
            var r = _flow.InsertFromKobetu(trace, TrnCheckFlow.ScalingCd, TrnCheckFlow.ScalingSb,
                                           "ｽｹｰﾘﾝｸﾞ", "スケーリング");
            Kq("I", $"165-1 スケーリング: inserted={r.Inserted} · W00100 {r.Warnings.Count} câu · {r.Note}");
            foreach (var w in r.Warnings) Log($"    W00100: {w}");
        });

        // ── KQ-J: 医学管理料 thứ nhất ───────────────────────────────────────
        Safe("KQ-J chen 113-0 特疾管", () =>
        {
            var r = _flow.InsertFromKobetu(trace, MedCare1Cd, MedCare1Sb, "特疾管", "特定疾患");
            trace.Shot("02-sau-113-0");
            Kq("J", $"113-0 特疾管: inserted={r.Inserted} · W00100 {r.Warnings.Count} câu · {r.Note}");
            foreach (var w in r.Warnings) Log($"    W00100: {w}");
        });

        // ── KQ-K: 医学管理料 thứ hai — chỗ PHẢI bung 同月算定不可 ────────────
        Safe("KQ-K chen 598-3 歯在管", () =>
        {
            var r = _flow.InsertFromKobetu(trace, MedCare2Cd, MedCare2Sb, "歯在管", "在宅療養");
            trace.Shot("03-sau-598-3");

            var dupes = r.Warnings.Count - r.Warnings.Distinct().Count();
            Kq("K", $"598-3 歯在管: inserted={r.Inserted} · W00100 {r.Warnings.Count} câu " +
                    $"({dupes} câu TRÙNG) · {r.Note}");
            for (var i = 0; i < r.Warnings.Count; i++) Log($"    W00100 [{i + 1}] {r.Warnings[i]}");

            Log(r.Warnings.Count switch
            {
                0 => "    ⇒ KHÔNG có câu nào. Mồi này không dùng được trên dữ liệu máy này " +
                     "(master tháng này thiếu 113-0 hoặc 598-3, hoặc ngày test đã có sẵn một trong hai). " +
                     "Đọc lại KQ-J: nếu 113-0 cũng inserted=False thì là chuyện master, không phải luật.",
                _ when dupes > 0 =>
                    $"    ⇒ CÓ {dupes} câu TRÙNG NHAU mà WinForm vẫn bung riêng từng hộp thoại. " +
                    "Đây chính là chứng cứ cho 「WinForm parity 3」: SingleChk.cs:43 lặp trọn Chk_list " +
                    "và KHÔNG gộp, trong khi bản web gộp bằng Set (treatment-entry-detail.tsx:2685) " +
                    $"⇒ người dùng web bấm OK {r.Warnings.Distinct().Count()} lần thay vì {r.Warnings.Count}.",
                _ => "    ⇒ Có câu nhưng không câu nào trùng. Con số này vẫn là ĐÁP ÁN mà bản web " +
                     "phải khớp, nhưng chưa chứng minh được chuyện 「không gộp trùng」 — cần một mồi " +
                     "sinh ra Chk_list có phần tử lặp (Check.cs:1443/1458/1463 dùng Chk_data[intPos] " +
                     "trong vòng lặp intRec dòng, nên đường ガイド nhiều dòng dễ ra trùng hơn).",
            });
        });

        // ── KQ-L: 個別 có những 枝番 nào cho hai mã mồi ─────────────────────
        Safe("KQ-L liet ke 枝番 cua hai ma moi", () =>
        {
            foreach (var cd in new[] { MedCare1Cd, MedCare2Cd })
            {
                var kobetu = Screen.Kobetu;
                kobetu.Open();
                kobetu.ResetSearchBoxes();
                var rows = kobetu.SearchByCode(cd, expectAtLeast: 0);
                Kq("L", $"mã {cd} trên tab 個別 có {rows.Count} dòng:");
                foreach (var r in rows.Take(20))
                    Log($"    {r.At(Screens.KobetuTab.Col.Code)}-{r.At(Screens.KobetuTab.Col.Sub)} " +
                        $"「{r.At(Screens.KobetuTab.Col.Name)}」 一般={r.At(Screens.KobetuTab.Col.Ippan)}");
            }
        });

        Safe("don dep", () => _flow.Entry.DismissAll());
        trace.Shot("04-ket-thuc");
    }
}
