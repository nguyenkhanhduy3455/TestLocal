using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.HighNeedsFreewd;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.MenInput;

/// <summary>
/// Lái luồng 面入力 trên <c>frm203002</c>: gõ mã ở コードモード → 処置選択 → chọn 枝番
/// → hộp thoại <see cref="MenInputDialog"/> bung ra → đọc lại cột 2 và cột 72 của dòng.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐỌC ĐƯỢC KẾT QUẢ MÀ KHÔNG BẤM F9 登録
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>fixProc</c> ghi vào HAI cột của DataRow đang bind với lưới (frm203035.cs:434-435):
/// <code>
///     _dtRegiData[ 2] = _dtRegiData[ 2] + " " + strMen;   // 療法・処置 — cột NHÌN THẤY
///     _dtRegiData[72] = _dtRegiData[72] + " " + strMen;   // FREEWD    — cột ẨN
/// </code>
/// Cột 72 bật lên được bằng cửa hậu có sẵn của app
/// (<see cref="HighNeedsFlow.RevealHiddenColumns"/>), nên luồng này KHÔNG cần bấm
/// F9 登録 và KHÔNG ghi gì xuống DB. Bên Playwright phải bấm 登録 rồi query
/// <c>trn_trn.freewd</c> (TC-M8, sau cờ <c>TEST_ALLOW_SAVE</c>); ở đây đọc thẳng.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO GỌI NHỜ <see cref="HighNeedsFlow"/>
/// ═══════════════════════════════════════════════════════════════════════════
/// Ba mảnh 「コードモード → gõ mã vào ô 点」, 「hộp thoại 処置選択 <c>dgvView</c>」 và
/// 「cửa hậu bật cột ẩn」 đã có sẵn ở đó, đã chạy thật và đã ghi lại đủ bẫy. Gọi nhờ
/// chứ KHÔNG chép lại (README mục 8b). Luồng thứ ba cần tới chúng thì nâng hẳn lên
/// <c>Infrastructure/</c>.
///
/// <para><b>Nhưng cách CHỐT dòng trong 処置選択 thì phải viết riêng</b> —
/// <see cref="HighNeedsFlow.CommitPick"/> coi 「chốt xong」 là 「picker đã đóng」, mà ở
/// luồng này frm203016 <b>vẫn mở</b> chừng nào 面入力 còn đó: nó gọi
/// <c>showDialog(ID203035)</c> MODAL ngay giữa <c>frmTrtSel_Let_Trt_Data</c>
/// (frm203016.cs:1573). Dùng nhầm hàm kia thì nó kết luận 「chốt hụt」 rồi bắn cú click
/// đường lui vào toạ độ của picker — mà chỗ đó giờ là hộp thoại 面入力 đang đè lên.
/// Xem <see cref="CommitPick"/>.</para>
/// </summary>
public sealed class MenInputFlow
{
    // ── Chỉ số cột của grdRegi ───────────────────────────────────────────────
    // Nguồn: InpDBAccess.getInpTrntrnData (INP/DBAccess/InpDBAccess.cs:30-80) — thứ tự
    // cột của DataTable chính là thứ tự SELECT.

    /// <summary>Cột 8 = <c>BUI1</c>; 32 ô 部位 nằm liên tiếp 8..39 (InpDBAccess.cs:40-45).</summary>
    public const int ColBui1 = 8;

    public const int BuiSlotCount = 32;

    /// <summary>51 = <c>BuiDispFlag</c> — 1:部位病名行, 2:療法処置行, 99:日計/合計 (frm203002.cs:174).</summary>
    public const int ColLineKbn = 51;

    /// <summary>72 = <c>FREEWD</c> (frm203002.cs:188).</summary>
    public const int ColFreewd = HighNeedsFlow.ColFreewd;

    public const int ColTrtCd = 6;
    public const int ColTrtSb = 7;

    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly HighNeedsFlow _regi;
    private readonly TreatmentGridOps _grid;

    public MenInputFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _regi = new HighNeedsFlow(app, screen);
        _grid = new TreatmentGridOps(screen);
    }

    public TreatmentGridOps Grid => _grid;

    // ── Chuẩn bị màn hình ────────────────────────────────────────────────────

    public bool RevealHiddenColumns(TestTrace? trace = null) => _regi.RevealHiddenColumns(trace);

    public bool HiddenColumnsVisible() => _regi.HiddenColumnsVisible();

    public bool EnsureCodeMode() => _regi.EnsureCodeMode();

    public string InpMode() => _regi.InpMode();

    public void DismissAll() => _regi.DismissAll();

    public string DescribeDialogs() => _regi.DescribeDialogs();

    /// <summary>Tiêu đề mọi cột đang hiện — bật cột ẩn rồi thì đây là TÊN CỘT DB.</summary>
    public IReadOnlyList<string> AllHeaders() => _grid.Headers();

    // ── Đọc lưới ─────────────────────────────────────────────────────────────

    /// <summary>Một dòng lưới đã đọc đúng những ô luồng này cần.</summary>
    /// <param name="FirstBuiSlot">Ô 部位 khác 0 ĐẦU TIÊN, 0-based — chính là <c>idx</c> mà
    /// <c>chkBui</c> dùng để chọn bảng nhãn 面 (frm203035.cs:288-299). -1 = dòng không có 部位
    /// ⇒ 面入力 sẽ đóng ngay khi vừa mở (<c>frm203035_Activated</c>, :136).</param>
    public sealed record MenRow(
        int Index,
        AutomationElement Element,
        string Ryo,
        string Ten,
        string LineKbn,
        string? Freewd,
        int FirstBuiSlot,
        int BuiCount)
    {
        public bool HasBui => FirstBuiSlot >= 0;

        public override string ToString() =>
            $"[{Index}] 「{Ryo}」 点={Ten} linekbn={LineKbn} " +
            $"部位: {(HasBui ? $"slot đầu {FirstBuiSlot}, tổng {BuiCount}" : "KHÔNG có")} " +
            $"freewd={HighNeedsFlow.DescribeFreewd(Freewd)}";
    }

    /// <summary>
    /// Quét lưới, đọc ĐÍCH DANH vài ô mỗi dòng.
    ///
    /// <para>KHÔNG dùng <c>TreatmentGridOps.Snapshot</c>: bật cột ẩn rồi thì mỗi dòng có
    /// 81 ô, mà mỗi <c>Uia.ValueOf</c> là vài lượt gọi COM xuyên tiến trình — quét đủ sẽ
    /// hết giờ trước khi đọc xong (đo 2026-08-26, xem <c>HighNeedsFlow.ScanRows</c>).</para>
    ///
    /// <para><paramref name="withBui"/> = false thì bỏ hẳn 32 ô 部位 (rẻ hơn nhiều); khi
    /// bật, vòng quét 部位 <b>dừng ngay ở ô khác 0 đầu tiên</b> nếu
    /// <paramref name="countAllBui"/> = false.</para>
    /// </summary>
    public IReadOnlyList<MenRow> Rows(int limit = 12, bool withBui = true, bool countAllBui = false)
    {
        var rows = new List<MenRow>();
        var index = 0;

        foreach (var element in _screen.Regi.Grid.RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();
            if (cells.Count <= RegiGrid.Col.Ryo) continue;

            // Dòng tiêu đề 「Top Row」 lọt vào danh sách ở MỌI lưới của app; ô con của nó
            // là Header chứ không phải DataItem (PROBE-GUIDELINE 3.2).
            if (Uia.ControlTypeOf(cells[0]) is ControlType.Header or ControlType.HeaderItem) continue;

            var ryo = Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ryo]));
            var ten = cells.Count > RegiGrid.Col.Ten ? Txt.N(Uia.ValueOf(cells[RegiGrid.Col.Ten])) : "";
            var kbn = cells.Count > ColLineKbn ? Txt.N(Uia.ValueOf(cells[ColLineKbn])) : "";
            var freewd = cells.Count > ColFreewd ? Txt.N(Uia.ValueOf(cells[ColFreewd])) : null;

            var first = -1;
            var count = 0;
            if (withBui && cells.Count > ColBui1 + BuiSlotCount - 1)
            {
                for (var slot = 0; slot < BuiSlotCount; slot++)
                {
                    var v = Txt.Int(Uia.ValueOf(cells[ColBui1 + slot]));
                    if (v is null or 0) continue;
                    if (first < 0) first = slot;
                    count++;
                    if (!countAllBui) break;
                }
            }

            rows.Add(new MenRow(index++, element, ryo, ten, kbn, freewd, first, count));
        }
        return rows;
    }

    /// <summary>Đọc lại ĐÚNG MỘT dòng theo chỉ số của lượt quét trước (rẻ hơn quét lại cả lưới).</summary>
    public MenRow? RowAt(int index, bool withBui = false, bool countAllBui = false) =>
        Rows(limit: Math.Max(index + 3, 6), withBui: withBui, countAllBui: countAllBui)
            .FirstOrDefault(r => r.Index == index);

    /// <summary>
    /// Dòng 処置 CUỐI có 療法・処置 chứa <paramref name="keyword"/> — mốc để bám lại dòng
    /// đang thao tác giữa các testcase.
    ///
    /// <para><b>KHÔNG bám theo chỉ số dòng.</b> UIA của <c>DataGridView</c> chỉ dựng phần
    /// tử cho dòng ĐANG NHÌN THẤY (PROBE-GUIDELINE 3.1), mà chèn xong app lại cuộn lưới —
    /// đo thật trong lượt probe 2026-09-03: dòng vừa gõ đọc ra chỉ số 12 ở lượt quét này
    /// rồi 11 ở lượt sau, dù dữ liệu không đổi. Bám theo TÊN thì miễn nhiễm với cuộn, và
    /// đây cũng đúng cách spec Playwright làm (<c>rowKeyOf</c>).</para>
    ///
    /// <para>Loại dòng 日計/合計 (<c>linekbn = 99</c>): khối lịch sử phía trên lưới lặp lại
    /// đúng những cái tên đó.</para>
    /// </summary>
    public MenRow? RowNamed(string keyword, int limit = 20, bool withBui = false, bool countAllBui = false) =>
        Rows(limit, withBui, countAllBui)
            .LastOrDefault(r => r.LineKbn != "99" && Txt.Has(r.Ryo, keyword));

    /// <summary>Như <see cref="RowNamed"/> nhưng ném lỗi kèm nguyên trạng lưới khi không thấy.</summary>
    public MenRow RequireRowNamed(string keyword, int limit = 20, bool withBui = false, bool countAllBui = false) =>
        RowNamed(keyword, limit, withBui, countAllBui)
        ?? throw new InvalidOperationException(
            $"không thấy dòng 処置 nào tên chứa 「{keyword}」 trên lưới. Đang có: " +
            string.Join(" / ", Rows(limit, withBui: false).Select(r => $"[{r.Index}] 「{r.Ryo}」")));

    /// <summary>
    /// Dòng đem ra gõ mã: có 部位 (điều kiện để 面入力 mở được), không phải 日計/合計
    /// (<c>linekbn = 99</c>), và có ô 点 gõ được.
    ///
    /// <para>Ưu tiên dòng CUỐI trong số đó: dòng đầu của ngày là 初診料 / 加算 — gõ đè lên
    /// chúng làm 自動算定 tính lại cả ngày và bung thêm hộp thoại không liên quan.</para>
    /// </summary>
    public MenRow? TargetRow(int limit = 12) =>
        Rows(limit, withBui: true, countAllBui: true)
            .LastOrDefault(r => r.HasBui
                                && r.LineKbn != "99"
                                && r.Ten is not ("-" or "－")
                                && r.Ryo.Length > 0
                                && !Txt.Has(r.Ryo, "日計"));

    // ── Gõ mã → 処置選択 ─────────────────────────────────────────────────────

    /// <summary>Gõ một 処置コード vào ô 点 của <paramref name="row"/> ở コードモード rồi Enter.</summary>
    public bool EnterCode(MenRow row, int trtCd, TestTrace? trace = null)
    {
        DismissAll();
        if (!EnsureCodeMode()) return false;

        trace?.Do($"go ma 「{trtCd}」 vao o 点 cua dong [{row.Index}] 「{row.Ryo}」 roi Enter", () =>
        {
            _grid.FocusCell(new RegiRow(row.Index, row.Element, "", "", row.Ryo, row.Ten, ""),
                            RegiGrid.Col.Ten);
            if (!_grid.IsEditing()) _grid.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _grid.Type(trtCd.ToString());
            _grid.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.RETURN);
        });
        Thread.Sleep(900);
        return true;
    }

    /// <summary>Một dòng của lưới <c>dgvView</c> trong 処置選択: コード / 枝番 / 名称 / 点数.</summary>
    public sealed record PickRow(int Index, AutomationElement Element, string Code, string Sub, string Name, string Point)
    {
        public override string ToString() => $"[{Index}] {Code}-{Sub} 「{Name}」 {Point}点";
    }

    public Window? Picker() => _regi.Picker();

    public Window? WaitForPicker(int seconds = 20) => _regi.WaitForPicker(seconds);

    /// <summary>
    /// Nội dung lưới <c>dgvView</c> của 処置選択 (frm203016.Designer.cs:126), kèm phần tử
    /// để còn double-click vào được.
    /// </summary>
    public IReadOnlyList<PickRow> PickerRows(Window picker, int limit = 60)
    {
        var result = new List<PickRow>();
        var grid = Uia.ById(picker, "dgvView");
        if (grid is null) return result;

        var index = 0;
        foreach (var element in new WinFormsGrid(grid).RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();
            if (cells.Count < 4) continue;

            var code = Txt.N(Uia.ValueOf(cells[0]));
            // Dòng tiêu đề 「Top Row」 lọt vào y như mọi lưới khác — ô đầu của nó là chữ
            // 「コード」 chứ không phải số.
            if (Txt.Int(code) is null) continue;

            result.Add(new PickRow(index++, element, code,
                                   Txt.N(Uia.ValueOf(cells[1])),
                                   Txt.N(Uia.ValueOf(cells[2])),
                                   Txt.N(Uia.ValueOf(cells[3]))));
        }
        return result;
    }

    public PickRow? FindPick(Window picker, int trtCd, int trtSb) =>
        PickerRows(picker).FirstOrDefault(
            r => Txt.Int(r.Code) == trtCd && Txt.Int(r.Sub) == trtSb);

    /// <summary>
    /// Chốt một dòng của 処置選択 bằng double-click (<c>dgvView_CellDoubleClick</c>,
    /// frm203016.cs:238) rồi chờ tới khi <b>một trong hai</b> chuyện xảy ra:
    /// 面入力 bung ra, hoặc 処置選択 đóng lại.
    ///
    /// <para>Phải nhận CẢ HAI vế. Với 枝番 có <c>men = 1</c>, frm203016 gọi
    /// <c>showDialog(ID203035)</c> MODAL ngay trong <c>frmTrtSel_Let_Trt_Data</c>
    /// (:1573) nên nó <b>chưa đóng</b> chừng nào 面入力 còn mở — chỉ nhìn 「picker đã
    /// đóng chưa」 thì luôn kết luận 「chốt hụt」 rồi đi bắn cú click đường lui vào đúng
    /// vùng mà 面入力 đang che. Đây chính là bẫy mà
    /// <c>HighNeedsFlow.WaitUntilCommitted</c> đã trả giá, chỉ khác cái modal.</para>
    /// </summary>
    public bool CommitPick(Window picker, PickRow pick, TestTrace? trace = null)
    {
        var cells = Uia.Children(pick.Element).ToList();
        if (cells.Count == 0) return false;

        var target = cells[Math.Min(2, cells.Count - 1)];
        var rect = Uia.RectOf(target);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
            throw new InvalidOperationException(
                $"ô 名称 của dòng {pick} trong 処置選択 đọc ra rect RỖNG — click vào đó sẽ bắn " +
                "chuột ra góc trái trên DESKTOP chứ không vào app (xem TreatmentGridOps.FocusCell).");

        var (x, y) = Uia.Center(target);
        trace?.Do($"double-click dong {pick} cua 処置選択", () => Uia.DoubleClickPhysical(x, y));

        return Waits.TryUntil(() => MenInputDialog.Find(_app, _screen) is not null || Picker() is null,
                              TimeSpan.FromSeconds(25));
    }

    /// <summary>
    /// Kết cục của một lượt chọn 処置.
    /// </summary>
    /// <param name="Dialog">Hộp thoại 面入力 nếu nó bung ra; null với nhánh <c>men = 0</c>.</param>
    /// <param name="GridName">
    /// Tên 処置 sẽ hiện ở CỘT 2 của lưới — lấy từ ô 名称 của <c>dgvView</c>.
    ///
    /// <para><b>KHÔNG dùng <c>trt_nm</c> của master làm mốc tìm lại dòng.</b> Lưới hiển thị
    /// <c>cct_nm</c> hay <c>trt_nm</c> tuỳ <c>ModCommon.pCultTrt</c>, và trên máy test hai
    /// chuỗi đó khác hẳn nhau: master ghi 「光ＣＲ充(単純)」 còn lưới (và 処置選択) hiện
    /// 「光重合型CR充填(単純)」. Đã đỏ thật vì chuyện này 2026-09-03 — cùng cái bẫy mà
    /// <c>TreatmentGridOps.FirstDifference</c> đã ghi lại.</para>
    /// </param>
    public sealed record PickResult(Window? Dialog, string GridName);

    /// <summary>Gõ mã → chờ 処置選択 → chốt đúng 枝番.</summary>
    public PickResult PickVariant(MenRow row, int trtCd, int trtSb, TestTrace? trace = null)
    {
        if (!EnterCode(row, trtCd, trace))
            throw new InvalidOperationException(
                $"không gõ được mã {trtCd} vào ô 点 — không chuyển được sang コードモード " +
                $"(đang là 「{InpMode()}」) hoặc không đặt được con trỏ vào dòng 「{row.Ryo}」.");

        var picker = WaitForPicker();
        if (picker is null)
            throw new InvalidOperationException(
                $"gõ mã {trtCd} ở コードモード phải mở 処置選択 (frm203016). Đang thấy: {DescribeDialogs()}");

        var pick = FindPick(picker, trtCd, trtSb)
                   ?? throw new InvalidOperationException(
                       $"処置選択 của mã {trtCd} không có dòng 枝番 {trtSb}. Master của máy này khác " +
                       $"dữ liệu ghi ở README của luồng. Đang có: " +
                       string.Join(" / ", PickerRows(picker).Select(r => r.ToString())));

        var gridName = pick.Name;
        CommitPick(picker, pick, trace);
        return new PickResult(MenInputDialog.Find(_app, _screen), gridName);
    }

    /// <summary>Đóng 処置選択 bằng nút 戻る mà không chọn gì.</summary>
    public bool ClosePicker()
    {
        var picker = Picker();
        return picker is null || _regi.ClosePicker(picker);
    }
}
