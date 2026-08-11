using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// <c>frm902003</c>「部位選択」 → F9「Br例」 → <c>frm203049</c>「Ｂｒサンプル」.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG TỚI 部位選択
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>grdRegi_CellClick</c> (frm203002.cs:1686-1697): MỘT click vào ô cột 部位 là đủ,
/// miễn cột ẩn 51 (<c>BuiDispFlg</c>) của dòng đó khác <c>"99"</c> — dòng 日計/合計 thì
/// bằng 99 nên không mở được. Vì thế phải THỬ NHIỀU DÒNG chứ không đóng cứng dòng 0.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHỌN RĂNG BẰNG BÀN PHÍM (COMMON/UserControls/BuiInfo.cs:368-440)
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>BuiInfo.ProcessCmdKey</c> nghe phím ở tầng UserControl, KHÔNG cần click vào ô răng:
///   · <c>Delete</c>      → <c>clearBuiData()</c> xoá sạch 32 ô (:375-379)
///   · <c>← ↑ → ↓</c>     → <c>moveAreaUDRL</c> đổi VÙNG đang chọn (:385)
///   · <c>1..8</c>        → <c>lbl.BuiVal = lbl.BuiVal + 1</c> của răng đó, VÙNG hiện tại (:400-410)
/// <c>_pos</c> khởi tạo bằng <b>2 = 右上 (RU)</b> (:352); <c>→</c> từ RU sang <b>1 = 左上 (LU)</b>
/// (:601-607). Vì thế 「Delete, →, 5, 6」 = xoá sạch rồi chọn răng 5 và 6 của hàm TRÊN BÊN TRÁI.
///
/// <c>buiData.unionBui</c> (COMMON/Lib/buiData.cs:485-496) ghép 4 vùng thành mảng 32:
/// <c>bui[i] = buiRU[7-i]</c>, <c>bui[i+8] = buiLU[i]</c>, <c>bui[i+16] = buiRD[7-i]</c>,
/// <c>bui[i+24] = buiLD[i]</c> ⇒ <b>LU răng N nằm ở bui index 8+(N-1)</b>, tức vị trí
/// 1-based 9+(N-1). Đúng con số mà spec Playwright dùng (BR_TEETH 5/6 → vị trí 13/14).
///
/// <b>Chọn xong thì răng có chữ.</b> <c>BuiLabel.BuiVal</c> đặt Text qua
/// <c>BuiInfo.getToothText</c> (BuiInfo.cs:764-771), hàm này trả CHUỖI RỖNG khi giá trị là
/// 0 hoặc 10 và trả 歯式 cho mọi giá trị khác. Nên 「ô răng có chữ」 ⟺ 「giá trị khác 0」 —
/// đó là cách duy nhất đọc được lựa chọn từ UIA mà không cần biết bảng <c>cnv_tooth_cd</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HAI NHÁNH LỖI (frm203049.cs:219-264)
/// ═══════════════════════════════════════════════════════════════════════════
/// Chỉ ô mang <b>1 / 4 / 6</b> mới tính là "đã chọn" (:227). Chọn cả hàm trên lẫn hàm dưới
/// → 「上下顎同時の処理はできません。」 (:234-238); không có mẫu nào khớp →
/// 「Brに使用できません。」 (:257-261). Cả hai đi qua <c>errorProc</c> (:290-294):
/// <c>MsgDialog.ShowErrorMsg("E00100", …)</c> rồi <c>btnChgEnable(btnF9, false)</c>.
///
/// ⚠️ <b>WinForm TẮT nút F9, bản web thì KHÔNG RENDER nút.</b> Testcase Playwright assert
/// <c>toHaveCount(0)</c>; ở đây phải assert <c>IsEnabled == false</c>. Cùng một ý nghĩa
/// nghiệp vụ, hai cách thể hiện — đừng "sửa" bên nào cho giống bên nào.
///
/// ⚠️ MessageBox là MODAL: khi nó đang mở, luồng UI của app bị chặn trong
/// <c>MessageBox.Show</c> nên mọi truy vấn UIA lên form phía sau đều treo tới hết timeout.
/// Luôn đọc + đóng hộp thoại TRƯỚC rồi mới hỏi tới cửa sổ.
/// </summary>
public static class BrSampleFlow
{
    public const string ToothDialogId = "frm902003";
    public const string ToothTitleFragment = "部位選択";

    public const string BrDialogId = "frm203049";
    public const string BrTitleFragment = "Ｂｒサンプル";

    /// <summary>Lưới mẫu của frm203049 — <c>dgvView</c> (frm203049.Designer.cs:58).</summary>
    public const string BrGridId = "dgvView";

    /// <summary>Hai cột của lưới — <c>_viewItem</c> (frm203049.cs:52-55).</summary>
    public const string BrColumnNo = "番号";
    public const string BrColumnBui = "部位";

    /// <summary>Vùng 左上 (LU) — <c>_pos</c> sau khi bấm <c>→</c> một lần từ RU.</summary>
    public const int PosUpperLeft = 1;

    /// <summary>Vùng 右上 (RU) — <c>_pos = 2</c> lúc BuiInfo_Load (BuiInfo.cs:352).</summary>
    public const int PosUpperRight = 2;

    /// <summary>Chỉ ba giá trị này tính là "đã chọn" (frm203049.cs:227).</summary>
    public static readonly int[] BridgeBuiValues = [1, 4, 6];

    public sealed record BrOpen(Window Dialog, string? ErrorMessage)
    {
        public bool HasError => ErrorMessage is { Length: > 0 };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 部位選択
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Mở 部位選択 bằng cách click ô cột 部位 của lưới đăng ký.
    ///
    /// <para>Trả về <c>null</c> khi không dòng nào mở được — hồ sơ test toàn dòng
    /// 日計/合計 (BuiDispFlg = 99) hoặc lưới rỗng. Testcase gọi hàm này phải
    /// <c>IgnoreWithReason</c> chứ đừng đỏ: đó là chuyện dữ liệu của máy, không phải lỗi app.</para>
    /// </summary>
    public static Window? OpenToothDialog(OchaApp app, TreatmentEntryScreen screen, TestTrace? trace = null)
    {
        var already = FindToothDialog(app, screen);
        if (already is not null)
        {
            trace?.Note($"{ToothDialogId} da mo san — dung lai");
            return already;
        }

        var rows = screen.Regi.Grid.Rows(limit: 12);
        trace?.Note($"luoi dang ky co {rows.Count} dong (da cat con 12)");
        if (rows.Count == 0) return null;

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            var row = rows[rowIndex];
            var cells = Uia.Children(row.Element).ToList();

            // Ô 部位: ưu tiên ô có MÔ TẢ chứa 部位 (Name của ô kèm tiêu đề cột),
            // không có thì lui về chỉ số cột hiển thị.
            var idx = -1;
            var descs = row.CellDescriptions;
            for (var c = 0; c < descs.Count && c < cells.Count; c++)
                if (Txt.Has(descs[c], "部位")) { idx = c; break; }
            if (idx < 0 && cells.Count > RegiGrid.Col.Bui) idx = RegiGrid.Col.Bui;
            if (idx < 0) continue;

            trace?.Note($"thu mo 部位選択: dong {rowIndex}, o {idx} — 「{row}」");
            Uia.MouseClick(cells[idx]);
            Waits.Step();

            var dialog = Waits.TryFor(() => FindToothDialog(app, screen), TimeSpan.FromSeconds(4));
            if (dialog is not null)
            {
                trace?.Note($"mo duoc 部位選択 tu dong {rowIndex}");
                trace?.Shot("bui-dialog-mo");
                return dialog;
            }
        }

        trace?.Note("khong dong nao mo duoc 部位選択");
        return null;
    }

    /// <summary>
    /// Tìm cửa sổ 部位選択.
    ///
    /// <para><c>ModalWindows</c> của cửa sổ CHỦ đi trước: frm902003 là dialog modal thuộc
    /// sở hữu frm203002, mà <c>GetAllTopLevelWindows</c> không phải lúc nào cũng trả về
    /// cửa sổ dạng đó — bẫy đã từng làm việc tìm MessageBox mù hẳn.</para>
    /// </summary>
    public static Window? FindToothDialog(OchaApp app, TreatmentEntryScreen screen)
    {
        try
        {
            foreach (var w in screen.Window.ModalWindows)
                if (IsToothDialog(w)) return w;
        }
        catch { /* cửa sổ chủ đang bận */ }

        var byId = app.Window(ToothDialogId);
        if (byId is not null) return byId;

        try
        {
            foreach (var w in app.Windows())
                if (IsToothDialog(w)) return w;
        }
        catch { /* */ }

        return null;
    }

    private static bool IsToothDialog(Window w)
    {
        try
        {
            return Txt.Same(Uia.AutomationIdOf(w), ToothDialogId)
                || Txt.Has(Uia.NameOf(w), ToothTitleFragment);
        }
        catch { return false; }
    }

    /// <summary>
    /// Xoá sạch rồi chọn đúng các răng của vùng <b>左上 (LU)</b> bằng bàn phím.
    /// Xem chú thích đầu lớp về Delete / → / phím số.
    /// </summary>
    public static void SelectUpperLeftTeeth(Window toothDialog, IReadOnlyList<int> teeth, TestTrace? trace = null)
    {
        FocusToothMap(toothDialog);

        trace?.Step($"Delete (xoa 32 o) → → (RU sang LU) → {string.Join(",", teeth)}");
        Uia.SendKey(Vk.Delete);
        Thread.Sleep(150);
        Uia.SendKey(Vk.Right);
        Thread.Sleep(150);
        foreach (var t in teeth)
        {
            Uia.SendKey(Vk.Digit(t));
            Thread.Sleep(150);
        }
        Waits.Step();
    }

    /// <summary>
    /// Đưa tiêu điểm vào sơ đồ răng <c>buiInfo1</c> (frm902003.Designer.cs:991).
    ///
    /// <para><b>Bắt buộc trước khi gửi Delete / mũi tên / phím số.</b> WinForms chuyển
    /// <c>ProcessCmdKey</c> đi LÊN theo chuỗi cha của control ĐANG FOCUS. Focus nằm ngoài
    /// <c>buiInfo1</c> (ví dụ trên một nút F-key) thì <c>BuiInfo.ProcessCmdKey</c>
    /// (BuiInfo.cs:368) không bao giờ được gọi — phím bay vào hư không, ô răng không đổi,
    /// và testcase đỏ ở bước sau với thông báo hoàn toàn sai địa chỉ.</para>
    /// </summary>
    public static void FocusToothMap(Window toothDialog)
    {
        InpP1MenuFlow.Focus(toothDialog);

        var map = Uia.ById(toothDialog, "buiInfo1");
        if (map is null) return;

        try { map.Focus(); }
        catch { /* UserControl không nhận Focus qua UIA — TabIndex 0 nên thường đã có sẵn */ }
        Thread.Sleep(120);
    }

    /// <summary>F7 全顎 — chọn CẢ 32 răng ⇒ chắc chắn dính cả hai hàm (frm902003.cs:272-278).</summary>
    public static void SelectWholeArch(Window toothDialog, TestTrace? trace = null)
    {
        InpP1MenuFlow.Focus(toothDialog);
        trace?.Step("F7 全顎");
        Uia.SendKey(Vk.F7);
        Waits.Step();
    }

    /// <summary>AutomationId của một ô răng: <c>buiLabel{pos}{idx}</c> (BuiInfo.cs:799).</summary>
    public static string ToothId(int pos, int idx) => $"buiLabel{pos}{idx}";

    /// <summary>
    /// Chữ đang hiện trên một ô răng. Rỗng ⟺ giá trị 0 hoặc 10
    /// (<c>getToothText</c>, BuiInfo.cs:767). Không tìm thấy control → null.
    /// </summary>
    public static string? ToothText(Window toothDialog, int pos, int idx)
    {
        var holder = Uia.ById(toothDialog, ToothId(pos, idx));
        if (holder is null) return null;

        var inner = Uia.ById(holder, "lblBui");
        return Txt.N(inner is null ? Uia.NameOf(holder) : Uia.ValueOf(inner));
    }

    /// <summary>Mọi ô răng ĐANG CÓ CHỮ, dạng 「pos-idx=chữ」 — để in vào nhật ký.</summary>
    public static IReadOnlyList<string> MarkedTeeth(Window toothDialog)
    {
        var marked = new List<string>();
        for (var pos = 1; pos <= 4; pos++)
        {
            for (var idx = 1; idx <= 8; idx++)
            {
                var text = ToothText(toothDialog, pos, idx);
                if (text is { Length: > 0 }) marked.Add($"{pos}-{idx}={text}");
            }
        }
        return marked;
    }

    public static int MarkedToothCount(Window toothDialog) => MarkedTeeth(toothDialog).Count;

    /// <summary>
    /// Đóng 部位選択 bằng <b>F12 戻る</b> (frm902003.cs:189-191 → <c>this.Close()</c>).
    ///
    /// <para>⚠️ Ở màn này F9 là 「Br例」 chứ không phải 登録, còn <c>End</c>/<c>Escape</c> gọi
    /// <c>btnEntry_Click</c> (:192-197) — tức là XÁC NHẬN lựa chọn và đi tiếp sang 病名選択.
    /// Bấm nhầm là ghi vào lưới 処置.</para>
    /// </summary>
    public static void CloseToothDialog(OchaApp app, Window toothDialog, TestTrace? trace = null)
    {
        if (!Uia.IsOnScreen(toothDialog)) return;

        trace?.Step("dong 部位選択 bang F12 戻る");
        InpP1MenuFlow.Focus(toothDialog);
        Uia.SendKey(Vk.F12);

        Waits.Until(() => app.Window(ToothDialogId) is null,
                    "dialog frm902003 dong lai sau khi bam F12 戻る",
                    TestSettings.Current.Run.DefaultTimeout);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ｂｒサンプル
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// F9 「Br例」 rồi chờ frm203049.
    ///
    /// <para>Trả về cả hộp cảnh báo (nếu có) vì <c>initProc</c> chạy trong sự kiện
    /// <c>Shown</c>: cửa sổ đã hiện RỒI mới bung E00100. Hai thứ này tới gần như đồng thời
    /// nên phải dò cả hai, và phải ĐÓNG hộp thoại trước khi hỏi tới cửa sổ.</para>
    /// </summary>
    public static BrOpen OpenBrSample(OchaApp app, Window toothDialog, TestTrace? trace = null)
    {
        trace?.Step("F9 Br例");
        InpP1MenuFlow.Focus(toothDialog);
        Uia.SendKey(Vk.F9);

        var timeout = TimeSpan.FromSeconds(
            Math.Max(TestSettings.Current.Run.DefaultTimeoutSeconds, 30));
        var deadline = DateTime.UtcNow + timeout;

        string? error = null;
        var windowSeen = false;

        while (DateTime.UtcNow < deadline)
        {
            // Hỏi hộp thoại TRƯỚC: nó chặn luồng UI nên mọi truy vấn khác sẽ treo.
            error = InpP1MenuFlow.PeekError(app, toothDialog);
            if (error is not null) break;

            if (app.Window(BrDialogId) is not null) { windowSeen = true; break; }
            Thread.Sleep(200);
        }

        // Cửa sổ hiện trước hộp thoại là chuyện bình thường — cho initProc một nhịp nữa.
        if (error is null && windowSeen)
            error = Waits.TryFor(() => InpP1MenuFlow.PeekError(app, toothDialog), TimeSpan.FromSeconds(3));

        if (error is not null)
        {
            trace?.Note($"hop canh bao: 「{error}」");
            InpP1MenuFlow.ReadAndDismissError(app, toothDialog, TimeSpan.FromSeconds(5));
        }

        var dialog = Waits.For(() => app.Window(BrDialogId),
                               $"dialog {BrDialogId}「{BrTitleFragment}」 hien len sau khi bam F9 Br例",
                               timeout);
        trace?.Shot("br-sample-mo");
        return new BrOpen(dialog, error);
    }

    /// <summary>Lưới mẫu của frm203049 — rỗng khi rơi vào nhánh lỗi (không bind DataSource).</summary>
    public static IReadOnlyList<DgvRow> BrRows(Window brDialog)
    {
        var grid = Uia.ById(brDialog, BrGridId);
        return grid is null ? [] : new WinFormsGrid(grid).Rows();
    }

    public static IReadOnlyList<string> BrHeaders(Window brDialog)
    {
        var grid = Uia.ById(brDialog, BrGridId);
        return grid is null ? [] : new WinFormsGrid(grid).Headers();
    }

    /// <summary>Nút F9 確定 còn dùng được không — <c>errorProc</c> TẮT nó, không ẩn nó.</summary>
    public static bool BrConfirmEnabled(Window brDialog)
    {
        var btn = InpP1MenuFlow.FButton(brDialog, "btnF9");
        if (btn is null) return false;
        try { return btn.IsEnabled; }
        catch { return false; }
    }

    /// <summary>
    /// Chọn dòng mẫu đầu tiên rồi F9 確定 → <c>defData</c> (frm203049.cs:300-311) GHI ĐÈ
    /// <c>_param.bui</c> bằng bui[32] của mẫu và đóng màn.
    /// </summary>
    public static void ConfirmFirstSample(OchaApp app, Window brDialog, TestTrace? trace = null)
    {
        var rows = BrRows(brDialog);
        if (rows.Count == 0)
            throw new InvalidOperationException(
                $"{BrDialogId} khong co dong mau nao de 確定 — goi ConfirmFirstSample sai luc.");

        var firstCell = Uia.Children(rows[0].Element).FirstOrDefault();
        if (firstCell is not null) Uia.MouseClick(firstCell);
        Waits.Step();

        trace?.Step("F9 確定 (ap mau Br)");
        InpP1MenuFlow.Focus(brDialog);
        Uia.SendKey(Vk.F9);

        Waits.Until(() => app.Window(BrDialogId) is null,
                    $"dialog {BrDialogId} dong lai sau khi bam F9 確定",
                    TestSettings.Current.Run.DefaultTimeout);
    }

    /// <summary>Đóng Ｂｒサンプル bằng F10 戻る — không đụng tới 部位選択 bên dưới.</summary>
    public static void CloseBrSample(OchaApp app, Window brDialog, TestTrace? trace = null) =>
        InpP1MenuFlow.CloseByBack(app, brDialog, BrDialogId, trace);

    /// <summary>Cột 部位 là 歯式 HAI DÒNG (trên/dưới) — WinForm còn vẽ thêm đường kẻ ngang
    /// bằng tay trong <c>DrawGridCrossLine</c> (frm203049.cs:318-346), thứ mà UIA không thấy.
    /// Cái ĐỌC ĐƯỢC là hai dòng chữ, và đó cũng là thứ bản web thay đường kẻ bằng.</summary>
    public static int BuiCellLineCount(DgvRow row)
    {
        var text = row.ByHeader(BrColumnBui) ?? row.At(1);
        // Txt.N gộp xuống dòng thành khoảng trắng ⇒ phải đọc lại nguyên văn.
        var raw = RawBuiCell(row);
        var value = raw ?? text;
        return value.Split('\n', '\r').Count(s => s.Trim().Length > 0);
    }

    private static string? RawBuiCell(DgvRow row)
    {
        var cells = Uia.Children(row.Element).ToList();
        for (var i = 0; i < cells.Count; i++)
        {
            var header = Uia.LegacyNameOf(cells[i]);
            if (Txt.Has(header, BrColumnBui)) return Uia.ValueOf(cells[i]);
        }
        return cells.Count > 1 ? Uia.ValueOf(cells[1]) : null;
    }

    /// <summary>Đổ cây UIA của một cửa sổ ra artifact — dùng trong nhánh Ignore/đỏ để còn lần.</summary>
    public static void DumpWindow(Window window, string fileName) =>
        InpP1MenuFlow.WriteArtifact(fileName, Uia.DumpTree(window, maxDepth: 12, maxChildrenPerNode: 200));

    /// <summary>Danh sách phẳng phần tử có AutomationId — dễ đọc hơn cây lồng nhau.</summary>
    public static void DumpElements(Window window, string fileName)
    {
        var lines = Uia.Descendants(window, maxDepth: 12)
            .Select(e => new
            {
                Id = Uia.AutomationIdOf(e),
                Name = Uia.NameOf(e),
                Type = Uia.ControlTypeOf(e)?.ToString() ?? "",
            })
            .Where(x => x.Id.Length > 0 || x.Name.Length > 0)
            .Select(x => $"{x.Type,-14} id=「{x.Id}」 name=「{x.Name}」");
        InpP1MenuFlow.WriteArtifact(fileName, string.Join(Environment.NewLine, lines));
    }

    /// <summary>Nút F-key theo nhãn — chỉ dùng cho chẩn đoán, thao tác thật thì gửi phím.</summary>
    public static AutomationElement? FButtonByName(Window dialog, string fragment) =>
        dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
              .FirstOrDefault(b => Txt.Has(Uia.NameOf(b).Replace("&", ""), fragment));
}
