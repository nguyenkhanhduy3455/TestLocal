using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.DrugPathB;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.DrugRowReload;

/// <summary>
/// Thông luồng <b>G3 — dựng lại dòng thuốc khi LOAD lưới</b>: đọc một dòng 薬剤 <b>đã có
/// sẵn trong <c>TRNTRN</c></b> và xem lưới hiện ra cái gì.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÁC HẲN G1/G2: Ở ĐÂY KHÔNG NHẬP GÌ CẢ
/// ═══════════════════════════════════════════════════════════════════════════
/// G1/G2 đo <b>đường nhập</b> (gõ mã / chọn ở hộp thoại). G3 đo <b>đường LOAD</b>:
/// dữ liệu phải nằm sẵn trong DB TRƯỚC khi màn hình mở, rồi ta chỉ ĐỌC.
///
/// <para>Hệ quả về cách viết: seed phải xong trước <c>OchaApp.LaunchOrAttach</c> —
/// tức trong <c>PrepareDataBeforeApp</c>. Seed sau khi 診療入力 đã mở thì
/// <c>ModSave.GetTrnRs</c> đã chạy rồi và app không bao giờ thấy (đúng họ với bẫy F21,
/// chỉ khác là ở đây thứ nạp một lần là cả cái lưới).</para>
///
/// <para>Muốn đọc lại sau khi đổi DB giữa chừng thì phải <b>mở lại màn hình</b> —
/// <see cref="UiTestBase.ReopenTreatmentScreen"/>. Luồng này không cần, nhưng ghi ra để
/// người sau khỏi seed rồi ngồi đợi lưới tự đổi.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ ĐỌC Ô 療法・処置 PHẢI ĐỌC NGUYÊN VĂN
/// ═══════════════════════════════════════════════════════════════════════════
/// Dòng dựng lại có thể nhiều dòng (薬剤名 + 用法), nối bằng <c>Environment.NewLine</c>.
/// <c>TreatmentGridOps.Snapshot</c> đọc qua <c>Txt.N</c> — hàm này đổi mọi <c>\r\n</c>
/// thành dấu cách (Txt.cs:17-25) ⇒ đếm dòng trên bản đã phẳng là <b>xanh giả</b> (F23).
/// Dùng <see cref="DrugPathBFlow.RawRyo"/>.
/// </summary>
public sealed class DrugRowReloadFlow
{
    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly TreatmentGridOps _grid;
    private readonly SigaToothFlow _base;

    public DrugRowReloadFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _base = new SigaToothFlow(app, screen);
        _grid = _base.Grid;
    }

    public TreatmentGridOps Grid => _grid;
    public SigaToothFlow Base => _base;

    // ─────────────────────────────────────────────────────────────────────────

    /// <param name="Row">Dòng đọc được trên lưới; null = không tìm thấy.</param>
    /// <param name="RawRyo">Ô 療法・処置 NGUYÊN VĂN (còn <c>\r\n</c>).</param>
    /// <param name="ReadOnly">
    /// Ô 療法・処置 có bị khoá không — đo bằng cách THỬ MỞ EDITOR, không đọc thuộc tính.
    /// Xem <see cref="ProbeReadOnly"/>.
    /// </param>
    public sealed record LoadedRow(RegiRow? Row, string RawRyo, bool? ReadOnly)
    {
        /// <inheritdoc cref="DrugPathBFlow.PathBResult.SplitLines"/>
        public IReadOnlyList<string> Lines => DrugPathBFlow.PathBResult.SplitLines(RawRyo);

        public override string ToString() =>
            $"dòng=「{Row?.ToString() ?? "KHÔNG THẤY"}」 · {Lines.Count} dòng text " +
            $"[{string.Join(" ⏎ ", Lines)}] · ReadOnly=" +
            (ReadOnly is null ? "chưa đo" : ReadOnly.Value ? "CÓ" : "không");
    }

    /// <summary>
    /// Dòng của ngày <paramref name="day"/> mang đúng 点 = <paramref name="trtPt"/>.
    ///
    /// <para>Dò theo <b>点</b> chứ không theo tên là có chủ ý: cái đang đo CHÍNH LÀ chuỗi
    /// tên, nên lấy tên làm mốc tìm là vòng luẩn quẩn — không tìm thấy thì không phân biệt
    /// được 「app dựng tên khác」 với 「dòng không có trên lưới」. 点 do seed đặt, một con
    /// số không đụng dòng nào khác trong ngày.</para>
    /// </summary>
    public RegiRow? FindByPoint(int day, int trtPt, int limit = 200) =>
        _grid.Snapshot(limit)
             .FirstOrDefault(r => Txt.Int(r.Day) == day && Txt.Int(r.Ten) == trtPt);

    /// <summary>Đọc dòng seed: text nguyên văn + có khoá ô hay không.</summary>
    public LoadedRow Read(int day, int trtPt, bool probeReadOnly, TestTrace? trace = null)
    {
        var row = FindByPoint(day, trtPt);
        if (row is null)
        {
            trace?.Note($"KHONG thay dong nao cua ngay {day} co 点 = {trtPt}. Luoi:\n  " +
                        string.Join("\n  ", _base.DescribeGrid(40)));
            trace?.Shot($"khong-thay-dong-{trtPt}");
            return new LoadedRow(null, "", null);
        }

        var raw = DrugPathBFlow.RawRyo(row);
        bool? ro = probeReadOnly ? ProbeReadOnly(row, trace) : null;

        var result = new LoadedRow(row, raw, ro);
        trace?.Note($"doc dong 点={trtPt}: {result}");
        trace?.Note("nguyen van o 療法・処置: 「" + Txt.Vis(raw) + "」");
        return result;
    }

    /// <summary>
    /// Ô 療法・処置 có ReadOnly không — <b>đo bằng cách thử mở editor</b>, không đọc thuộc
    /// tính UIA.
    ///
    /// <para>Vì sao không đọc thuộc tính: <c>DataGridViewCell.ReadOnly</c> không được cầu
    /// MSAA→UIA phơi ra thành một cờ đọc được tin cậy; thứ gần nhất là
    /// <c>ValuePattern.IsReadOnly</c> mà ô lưới WinForms hay không hỗ trợ. Đo bằng hành
    /// vi thì đúng thứ người dùng gặp: đặt con trỏ vào ô rồi bấm Enter — ô mở được
    /// editor nghĩa là sửa được.</para>
    ///
    /// <para>⚠️ Mở được editor thì <b>phải đóng lại</b>, và đóng bằng <c>Escape</c>
    /// KHÔNG được: F14 — <c>GradientDataGridView.ProcessDialogKey</c> trả false nên
    /// Escape rơi xuống form thành 戻る và bung dirty gate 「保存しますか」. Đóng bằng
    /// Enter (chốt lại đúng giá trị cũ, vì ta không gõ gì).</para>
    /// </summary>
    public bool ProbeReadOnly(RegiRow row, TestTrace? trace = null)
    {
        trace?.Step($"thu mo editor o 療法・処置 cua dong 「{row}」 de do ReadOnly " +
                    "(⛔ dong lai bang Enter, KHONG bang Escape — F14)");
        _grid.FocusCell(row, RegiGrid.Col.Ryo);
        Thread.Sleep(250);

        var wasEditing = _grid.IsEditing();
        if (wasEditing)
        {
            trace?.Note("editor da mo san truoc khi bam Enter — dong lai");
            _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(300);
            return false;
        }

        _grid.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(400);

        var editing = _grid.IsEditing();
        if (editing)
        {
            trace?.Note($"o MO duoc editor (noi dung 「{_grid.EditorText()}」) ⇒ KHONG ReadOnly");
            _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(300);
        }
        else trace?.Note("o KHONG mo duoc editor ⇒ ReadOnly");

        // Enter trên lưới có thể đã đẩy con trỏ xuống dòng dưới; không sao, mọi phép đọc
        // sau đó đều dò lại dòng theo 点 chứ không dựa vào con trỏ.
        _base.DismissAll(trace: trace);
        return !editing;
    }

    /// <summary>
    /// Mọi cụm 「số + đơn vị」 trong ô — dùng để hỏi 「lưới đang hiện 数量 nào」.
    /// Nhận cả 単位 đầy đủ lẫn rút gọn (「錠」 in ra là 「T」).
    /// </summary>
    public static IReadOnlyList<string> AmountsIn(string? text, string unitNm) =>
        DrugAmountSelect.DrugAmountFlow.AmountsInRowText(text, unitNm);

    /// <summary>Mô tả lưới quanh dòng đó — in khi một bước không diễn ra như mong đợi.</summary>
    public IReadOnlyList<string> DescribeDay(int day, int limit = 200) =>
        _grid.Snapshot(limit)
             .Where(r => Txt.Int(r.Day) == day)
             .Select(r => r.ToString())
             .ToList();
}
