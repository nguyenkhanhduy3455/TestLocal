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
    public const string ToothDialogId = ToothSelectDialog.DialogId;
    public const string ToothTitleFragment = ToothSelectDialog.TitleFragment;

    public const string BrDialogId = "frm203049";
    public const string BrTitleFragment = "Ｂｒサンプル";

    /// <summary>Lưới mẫu của frm203049 — <c>dgvView</c> (frm203049.Designer.cs:58).</summary>
    public const string BrGridId = "dgvView";

    /// <summary>Hai cột của lưới — <c>_viewItem</c> (frm203049.cs:52-55).</summary>
    public const string BrColumnNo = "番号";
    public const string BrColumnBui = "部位";

    /// <summary>Vùng 左上 (LU) — <c>_pos</c> sau khi bấm <c>→</c> một lần từ RU.</summary>
    public const int PosUpperLeft = ToothSelectDialog.PosUpperLeft;

    /// <summary>Vùng 右上 (RU) — <c>_pos = 2</c> lúc BuiInfo_Load (BuiInfo.cs:352).</summary>
    public const int PosUpperRight = ToothSelectDialog.PosUpperRight;

    /// <summary>Chỉ ba giá trị này tính là "đã chọn" (frm203049.cs:227).</summary>
    public static readonly int[] BridgeBuiValues = [1, 4, 6];

    public sealed record BrOpen(Window Dialog, string? ErrorMessage)
    {
        public bool HasError => ErrorMessage is { Length: > 0 };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 部位選択 — nay do Infrastructure/ToothSelectDialog giữ
    //
    // Hiểu biết về frm902003 (bốn vùng, ánh xạ ô 部位, phím F, End = 確定) đã được
    // NÂNG LÊN `Infrastructure/ToothSelectDialog` ngày 2026-09-03, khi luồng thứ hai
    // (`Tests/SigaToothStatus`) cần chính hộp thoại này. README mục 8b: dùng chung thì
    // nâng lên Infrastructure, KHÔNG chép đôi. Các hàm dưới đây giữ nguyên chữ ký cũ
    // để `BrSampleTests` không phải sửa gì.
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Xem <see cref="ToothSelectDialog.OpenFromGrid"/>.</summary>
    public static Window? OpenToothDialog(OchaApp app, TreatmentEntryScreen screen, TestTrace? trace = null) =>
        ToothSelectDialog.OpenFromGrid(app, screen, trace);

    /// <summary>Xem <see cref="ToothSelectDialog.Find"/>.</summary>
    public static Window? FindToothDialog(OchaApp app, TreatmentEntryScreen screen) =>
        ToothSelectDialog.Find(app, screen.Window);

    /// <summary>Xem <see cref="ToothSelectDialog.SelectUpperLeftTeeth"/>.</summary>
    public static void SelectUpperLeftTeeth(Window toothDialog, IReadOnlyList<int> teeth, TestTrace? trace = null) =>
        ToothSelectDialog.SelectUpperLeftTeeth(toothDialog, teeth, trace);

    /// <summary>Xem <see cref="ToothSelectDialog.FocusToothMap"/>.</summary>
    public static void FocusToothMap(Window toothDialog) => ToothSelectDialog.FocusToothMap(toothDialog);

    /// <summary>F7 全顎 — xem <see cref="ToothSelectDialog.SelectWholeArch"/>.</summary>
    public static void SelectWholeArch(Window toothDialog, TestTrace? trace = null) =>
        ToothSelectDialog.SelectWholeArch(toothDialog, trace);

    /// <summary>Xem <see cref="ToothSelectDialog.ToothId"/>.</summary>
    public static string ToothId(int pos, int idx) => ToothSelectDialog.ToothId(pos, idx);

    /// <summary>Xem <see cref="ToothSelectDialog.ToothText"/>.</summary>
    public static string? ToothText(Window toothDialog, int pos, int idx) =>
        ToothSelectDialog.ToothText(toothDialog, pos, idx);

    /// <summary>Xem <see cref="ToothSelectDialog.MarkedTeeth"/>.</summary>
    public static IReadOnlyList<string> MarkedTeeth(Window toothDialog) =>
        ToothSelectDialog.MarkedTeeth(toothDialog);

    public static int MarkedToothCount(Window toothDialog) => ToothSelectDialog.MarkedToothCount(toothDialog);

    /// <summary>Xem <see cref="ToothSelectDialog.Close"/> — F12 戻る, TUYỆT ĐỐI không Escape.</summary>
    public static void CloseToothDialog(OchaApp app, Window toothDialog, TestTrace? trace = null) =>
        ToothSelectDialog.Close(app, toothDialog, trace);

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
