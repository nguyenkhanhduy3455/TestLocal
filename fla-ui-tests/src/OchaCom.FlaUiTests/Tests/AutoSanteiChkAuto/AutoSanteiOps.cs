using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Đo MỘT lượt nhập 処置: lưới trước — lưới sau — 月計点数 trước/sau, rồi tách ra
/// 「dòng nào app TỰ CHÈN」.
///
/// <para>Đường nhập thì mượn nguyên <see cref="SigaToothFlow"/> (Insert → 部位選択 →
/// 病名選択 → gõ mã → 処置選択): nó đã gánh sẵn mọi cái bẫy của lưới <c>grdRegi</c>, và
/// viết lại là chép lại luôn cả bẫy. Lớp này CHỈ thêm phần đo.</para>
///
/// <para><b>Mốc chính là <c>lbAllPoint</c>, không phải số dòng của lưới</b> — F12: UIA của
/// <c>DataGridView</c> chỉ phơi ra dòng ĐANG NHÌN THẤY, mà chèn xong app lại cuộn lưới.
/// Số dòng đọc được vì thế trôi theo vị trí cuộn chứ không theo dữ liệu; 月計点数 thì nằm
/// NGOÀI lưới (frm203002.Designer.cs:1062-1084, do <c>modAcc.Calc_MDPoint</c> ghi).</para>
/// </summary>
public sealed class AutoSanteiOps
{
    private readonly SigaToothFlow _flow;
    private readonly TreatmentGridOps _grid;

    public AutoSanteiOps(SigaToothFlow flow)
    {
        _flow = flow;
        _grid = flow.Grid;
    }

    public SigaToothFlow Flow => _flow;

    /// <summary>Kết quả một lượt nhập — mọi thứ testcase cần để kết luận đúng địa chỉ.</summary>
    /// <param name="Enter">Kết quả thô của đường nhập (có mở 処置選択 không, chốt được không).</param>
    /// <param name="Before">Lưới TRƯỚC khi gõ mã.</param>
    /// <param name="After">Lưới SAU khi Enter ô 回 — tức sau khi <c>Chk_ChkAuto</c> đã chạy.</param>
    /// <param name="PointBefore">月計点数 trước; null = không đọc được nhãn.</param>
    /// <param name="PointAfter">月計点数 sau.</param>
    public sealed record EntryMeasure(
        SigaToothFlow.EnterResult Enter,
        IReadOnlyList<RegiRow> Before,
        IReadOnlyList<RegiRow> After,
        int? PointBefore,
        int? PointAfter)
    {
        /// <summary>月計点数 tăng bao nhiêu; null khi một trong hai lượt đọc hỏng.</summary>
        public int? PointDelta => PointBefore is { } b && PointAfter is { } a ? a - b : null;

        /// <summary>
        /// Các dòng CÓ THÊM sau lượt nhập, so theo NỘI DUNG chứ không theo chỉ số.
        ///
        /// <para>So theo chỉ số là sai ngay từ đầu: <c>frmInpMain.AddRow</c> chèn vào giữa
        /// lưới (ngay dưới con trỏ), nên mọi dòng phía dưới đều dịch chỉ số. So theo nội
        /// dung thì miễn nhiễm — và cũng miễn nhiễm với việc lưới bị cuộn.</para>
        ///
        /// <para>⚠️ <b>Phải loại 日計行 / 合計行 ra khỏi phép so.</b> Hai dòng đó IN CHÍNH
        /// SỐ ĐIỂM (「[日計 339点]」), nên mỗi lượt nhập làm nội dung chúng đổi — so theo nội
        /// dung sẽ thấy 「dòng cũ biến mất, dòng mới xuất hiện」 và đếm chúng thành dòng app
        /// tự chèn. Bỏ qua chuyện này là mọi phép đếm 「tự chèn mấy dòng」 dôi ra 1–2 dòng và
        /// cả ô ĐỐI CHỨNG cũng đỏ.</para>
        /// </summary>
        public IReadOnlyList<RegiRow> AddedRows
        {
            get
            {
                var pool = Before.Where(IsData).Select(Key).ToList();
                var added = new List<RegiRow>();
                foreach (var row in After.Where(IsData))
                {
                    var i = pool.IndexOf(Key(row));
                    if (i >= 0) pool.RemoveAt(i);   // dòng cũ — bỏ đúng MỘT bản, giữ được dòng trùng lặp
                    else added.Add(row);
                }
                return added;
            }
        }

        /// <summary>Khoá so sánh một dòng: 日 + 部位 + 療法・処置 + 点 + 回.</summary>
        private static string Key(RegiRow r) => $"{r.Day}|{r.Bui}|{r.Ryo}|{r.Ten}|{r.Kai}";

        /// <summary>
        /// Dòng DỮ LIỆU — loại 日計 / 合計 / 負担金 / 実日数 và dòng tiêu đề tháng (ô 日 rỗng).
        /// Bản sao có chủ ý của <c>SigaToothFlow.IsSummaryRow</c>: hàm bên đó là private và
        /// đang phục vụ việc khác (tìm chỗ đứng để Insert), sửa nó là đụng vào luồng khác.
        /// </summary>
        public static bool IsData(RegiRow r) =>
            !Txt.Has(r.Ryo, "日計") && !Txt.Has(r.Ryo, "合計") &&
            !Txt.Has(r.Ryo, "負担金") && !Txt.Has(r.Ryo, "実日数") &&
            !Txt.Has(r.Bui, "合計") && Txt.Int(r.Day) is not null;

        /// <summary>
        /// Tổng 点 × 回 của các dòng vừa thêm — đối chiếu với <see cref="PointDelta"/>.
        /// Dòng 部位病名行 mang 「-」 ở ô 点 và dòng コメント mang 0, cả hai trả về 0.
        /// </summary>
        public int AddedPointSum =>
            AddedRows.Sum(r => (Txt.Int(r.Ten) ?? 0) * (Txt.Int(r.Kai) ?? 1));

        public override string ToString() =>
            $"{Enter} · 月計 {PointBefore?.ToString() ?? "?"} → {PointAfter?.ToString() ?? "?"} " +
            $"(Δ {PointDelta?.ToString() ?? "?"}) · thêm {AddedRows.Count} dòng";
    }

    /// <summary>
    /// Nhập một 処置 lên ĐÚNG một răng rồi đo. Trả về null khi chưa kịp gõ mã (không có
    /// chỗ đứng / Insert hỏng) — testcase tự quyết định đó là đỏ hay Ignore.
    /// </summary>
    /// <param name="buiSlot">Ô 部位 (0-based); &lt; 0 = KHÔNG đi qua 部位選択.</param>
    /// <param name="disCd">
    /// 病名 đăng ký kèm 部位. <b>Đừng để null.</b> Không có 病名 thì dòng không thành
    /// 部位病名行 đúng nghĩa, app bung 「算定可能な部位がありません」 và ghi 回 = 0 — mà
    /// 回 = 0 đóng luôn cửa vào <c>Chk_ChkAuto</c> (đo 2026-09-08, xem
    /// <see cref="EnsureTrtCount"/>).
    /// </param>
    public EntryMeasure? EnterAndMeasure(int trtCd, int trtSb, int buiSlot, TestTrace trace,
                                         int? disCd = null)
    {
        if (!_flow.EnsureCodeMode())
        {
            trace.Note($"KHONG dua duoc o 点 ve コードモード — dang la 「{_flow.InpMode()}」");
            return null;
        }

        var seat = _flow.InputRow();
        if (seat is null)
        {
            trace.Note("luoi khong co dong 処置 nao cua thang dang mo. Luoi:\n  " +
                       string.Join("\n  ", _flow.DescribeGrid()));
            return null;
        }

        var blank = _flow.InsertBlankRow(seat, trace);
        if (blank is null)
        {
            trace.Note("Insert khong chen duoc dong trong. Luoi:\n  " +
                       string.Join("\n  ", _flow.DescribeGrid()));
            return null;
        }

        SigaToothFlow.EnterResult enter;
        IReadOnlyList<RegiRow> before;
        int? pointBefore;

        if (buiSlot >= 0)
        {
            var bui = _flow.SetBuiOnRow(blank, buiSlot, milk: false, disCd, trace);
            trace.Note($"dat 部位: {bui}");
            if (!bui.ToothDialogOpened)
            {
                trace.Note("KHONG mo duoc 部位選択 — dung o day, dung di tiep (F15).");
                return null;
            }

            // ⚠️ CHỤP MỐC Ở ĐÂY, SAU 部位選択 và TRƯỚC khi gõ mã.
            // 部位選択 + 病名選択 tự dựng thêm một 部位病名行; chụp trước chúng thì dòng đó
            // lọt vào AddedRows và mọi phép đếm 「app tự chèn mấy dòng」 lệch đúng một dòng.
            before = _grid.Snapshot();
            pointBefore = _grid.AllPointValue();
            trace.Note($"moc truoc khi go ma: {before.Count} dong, 月計 = {pointBefore?.ToString() ?? "?"}");

            enter = _flow.EnterTreatmentAtCursor(trtCd, trtSb, answerYes: null, trace);
        }
        else
        {
            before = _grid.Snapshot();
            pointBefore = _grid.AllPointValue();
            trace.Note($"moc truoc khi go ma: {before.Count} dong, 月計 = {pointBefore?.ToString() ?? "?"}");

            enter = _flow.EnterTreatment(blank, trtCd, trtSb, answerYes: null, trace);
        }

        Settle(trace);

        // ⚠️ 回 PHẢI >= 1, nếu không thì CẢ NHÁNH ĐANG ĐO KHÔNG BAO GIỜ CHẠY.
        // frm203002.cs:5745 `if (trtCnt >= 1)` là cửa duy nhất dẫn tới Chk_ChkAuto_soutyaku
        // và Chk_ChkAuto; 回 = 0 thì app chỉ gọi Chk_CmtAuto rồi thôi.
        EnsureTrtCount(before, trace);

        var after = _grid.Snapshot();
        var pointAfter = _grid.AllPointValue();
        var measure = new EntryMeasure(enter, before, after, pointBefore, pointAfter);

        trace.Note($"do duoc: {measure}");
        foreach (var row in measure.AddedRows) trace.Note("  + " + row);
        trace.Shot($"sau-khi-nhap-{trtCd}-{trtSb}");
        return measure;
    }

    /// <summary>
    /// Chờ cho tới khi không còn cửa sổ nào chồng lên lưới.
    ///
    /// <para>Deadline NGẮN có chủ ý (F2): thao tác đang chờ là thuần bộ nhớ, 8s đã là rộng
    /// rãi, và chờ lâu hơn không cho thêm thông tin nào — nó chỉ đổi 5 giây thành 15 phút.
    /// <c>Chk_ChkAuto</c> có thể mở 処置選択 lần nữa cho chính mã đi kèm (case 179 分割抜歯,
    /// case 202, case 549 — modMain.cs:990-1010), nên vẫn phải chờ.</para>
    /// </summary>
    private void Settle(TestTrace trace)
    {
        if (Waits.TryUntil(() => _flow.Picker() is null && _flow.OpenDialogs().Count == 0,
                           TimeSpan.FromSeconds(8)))
            return;
        trace.Note("van con cua so chong len luoi: " + _flow.DescribeDialogs());
        trace.Shot("con-hop-thoai");
    }

    /// <summary>
    /// Bảo đảm ô 回 của dòng vừa nhập mang giá trị &gt;= 1 — <b>điều kiện DUY NHẤT</b> mở
    /// nhánh 自動算定 (<c>frm203002.cs:5745</c>).
    ///
    /// <para><b>Đo được 2026-09-08 (lượt chạy đầu của TcAUTO2):</b> chốt xong 処置選択, app mở
    /// editor ô 回 nhưng editor <b>RỖNG</b> (trace: 「editor dang mo voi 「」」), nên cú Enter
    /// đóng editor ghi luôn <c>回 = 0</c>. Dòng lên lưới đúng 「抜歯手術(臼歯) | 270 | 0」 và
    /// <c>Chk_ChkAuto</c> KHÔNG BAO GIỜ được gọi. Testcase khi đó đỏ với thông điệp
    /// 「app không tự chèn mã đi kèm」 — <b>đổ oan cho app</b>, trong khi lỗi nằm ở harness.</para>
    ///
    /// <para>Gõ thẳng 「1」 vào ô 回 rồi Enter là đúng thao tác của người dùng thật, và nó đưa
    /// luồng qua lại case 4 một lần nữa — lần này với <c>trtCnt = 1</c>.</para>
    /// </summary>
    private void EnsureTrtCount(IReadOnlyList<RegiRow> before, TestTrace trace)
    {
        var mid = new EntryMeasure(default!, before, _grid.Snapshot(), null, null);

        // Dòng vừa gõ = dòng THÊM cuối cùng có ô 点 là số (loại 部位病名行 mang 「-」 và
        // dòng コメント của Chk_CmtAuto).
        var typed = mid.AddedRows.LastOrDefault(r => Txt.Int(r.Ten) is not null);
        if (typed is null)
        {
            trace.Note("khong tim ra dong vua go de kiem o 回 — bo qua, de testcase tu ket luan");
            return;
        }

        if (Txt.Int(typed.Kai) is >= 1)
        {
            trace.Note($"o 回 cua dong 「{typed}」 da la {typed.Kai} (>= 1) — khong can go lai");
            return;
        }

        trace.Step($"o 回 cua dong 「{typed}」 dang la 「{typed.Kai}」 — go 1 roi Enter " +
                   "de mo nhanh 自動算定 (frm203002.cs:5745 `trtCnt >= 1`)");
        _grid.FocusCell(typed, RegiGrid.Col.Kai);
        // Mở editor y như `SigaToothFlow.EnterCodeOnRow`: gõ khi ô mới chỉ được CHỌN thì phím
        // đầu tiên bị nuốt để mở edit, và ô 回 chỉ có một ký tự nên mất nó là mất tất.
        if (!_grid.IsEditing()) { _grid.Press(VirtualKeyShort.RETURN); Thread.Sleep(250); }
        _grid.Type("1");
        _grid.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(1500);
        Settle(trace);
        trace.Shot("sau-khi-go-o-kai");
    }

    /// <summary>
    /// Dòng nào trong <paramref name="rows"/> là 処置 <paramref name="cd"/>/<paramref name="sb"/>.
    ///
    /// <para>Nhận theo TÊN, vì cột <c>trt_cd</c> là cột ẩn — không ra tới UIA
    /// (RegiGrid.cs:11-14). Chấp nhận CẢ HAI tên của master: lưới in <c>cct_nm</c> hay
    /// <c>trt_nm</c> tuỳ cờ <c>ModCommon.pCultTrt</c>, và cờ đó là cấu hình của máy chứ
    /// không phải của testcase.</para>
    /// </summary>
    public static RegiRow? RowOf(IReadOnlyList<RegiRow> rows, MstTrtRow master) =>
        rows.FirstOrDefault(r => master.DisplayNames.Any(n => n.Length > 0 && Txt.Has(r.Ryo, n)));

    /// <summary>Dọn sạch những dòng một lượt đo vừa để lại (kể cả dòng app tự chèn).</summary>
    public void DeleteAdded(EntryMeasure measure, TestTrace trace)
    {
        // Xoá từ DƯỚI lên: DeleteRow làm mọi dòng phía dưới dịch chỉ số, còn dòng phía trên
        // thì không. Và đọc lại lưới mỗi vòng — phần tử UIA của lượt chụp cũ đã thành rác.
        foreach (var row in measure.AddedRows.Reverse())
        {
            var live = _grid.Snapshot().FirstOrDefault(r => r.Ryo == row.Ryo && r.Ten == row.Ten);
            if (live is null) continue;
            try { _flow.DeleteRow(live, trace); }
            catch (Exception e) { trace.Note($"khong xoa duoc dong 「{live}」: {e.Message}"); }
        }
        _flow.DismissAll(trace: trace);
    }
}
