using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Chốt một 処置 rồi đo cái ĐUÔI của nó — nửa WinForm của <c>commitTrigger()</c> +
/// <c>waitForFollowUpRows()</c> trong
/// <c>../web-tenant-tests/tests/auto-santei/chk-auto-after-commit.spec.ts</c>.
///
/// <para>Đường đi phải GIỐNG bên kia từng bước, nếu không hai vế parity đo hai thứ khác
/// nhau: đặt con trỏ lên 部位病名行 đã seed → コードモード → gõ mã vào ô 点 → 処置選択 →
/// chốt 枝番 → <b>Enter ở ô 回</b> (chính cú Enter đó mở nhánh
/// <c>Chk_CmtAuto</c> + <c>Chk_ChkAuto</c>, frm203002.cs:5738-5752).</para>
///
/// <para><b>Mốc là <c>lbAllPoint</c>, không phải số dòng lưới</b> (F12): UIA của
/// <c>DataGridView</c> chỉ phơi ra dòng ĐANG NHÌN THẤY, mà chèn xong app lại cuộn.
/// 月計点数 nằm NGOÀI lưới (frm203002.Designer.cs:1062-1084).</para>
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
    public TreatmentGridOps Grid => _grid;

    /// <summary>Kết quả một lượt chốt — mọi thứ testcase cần để kết luận đúng địa chỉ.</summary>
    /// <param name="Enter">Kết quả thô của đường nhập (có mở 処置選択 không, chốt được không).</param>
    /// <param name="Before">Lưới TRƯỚC khi gõ mã.</param>
    /// <param name="After">Lưới SAU khi Enter ô 回 — tức sau khi cái đuôi đã chạy xong.</param>
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
        /// Các dòng CÓ THÊM sau lượt chốt, so theo NỘI DUNG chứ không theo chỉ số.
        ///
        /// <para>So theo chỉ số là sai ngay từ đầu: <c>frmInpMain.AddRow</c> chèn vào giữa
        /// lưới (ngay dưới con trỏ), nên mọi dòng phía dưới đều dịch chỉ số.</para>
        ///
        /// <para>⚠️ <b>Phải loại 日計行 / 合計行.</b> Hai dòng đó IN CHÍNH SỐ ĐIỂM
        /// (「[日計 339点]」) nên mỗi lượt nhập làm nội dung chúng đổi — so theo nội dung sẽ
        /// thấy 「dòng cũ biến mất, dòng mới xuất hiện」 và đếm chúng thành dòng app tự chèn.</para>
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
                    if (i >= 0) pool.RemoveAt(i);   // dòng cũ — bỏ đúng MỘT bản
                    else added.Add(row);
                }
                return added;
            }
        }

        private static string Key(RegiRow r) => $"{r.Day}|{r.Bui}|{r.Ryo}|{r.Ten}|{r.Kai}";

        /// <summary>
        /// Dòng DỮ LIỆU — loại 日計 / 合計 / 負担金 / 実日数 và dòng tiêu đề tháng (ô 日 rỗng).
        /// Bản sao có chủ ý của <c>SigaToothFlow.IsSummaryRow</c>: hàm bên đó là private và
        /// đang phục vụ việc khác.
        /// </summary>
        public static bool IsData(RegiRow r) =>
            !Txt.Has(r.Ryo, "日計") && !Txt.Has(r.Ryo, "合計") &&
            !Txt.Has(r.Ryo, "負担金") && !Txt.Has(r.Ryo, "実日数") &&
            !Txt.Has(r.Bui, "合計") && Txt.Int(r.Day) is not null;

        /// <summary>Tổng 点 × 回 của các dòng vừa thêm — đối chiếu với <see cref="PointDelta"/>.</summary>
        public int AddedPointSum =>
            AddedRows.Sum(r => (Txt.Int(r.Ten) ?? 0) * (Txt.Int(r.Kai) ?? 1));

        public override string ToString() =>
            $"{Enter} · 月計 {PointBefore?.ToString() ?? "?"} → {PointAfter?.ToString() ?? "?"} " +
            $"(Δ {PointDelta?.ToString() ?? "?"}) · thêm {AddedRows.Count} dòng";
    }

    /// <summary>
    /// Dòng đã seed, tìm trong ĐÚNG NGÀY test.
    ///
    /// <para>⚠️ <b>Phải khoá theo ngày.</b> Lưới <c>grdRegi</c> mở CẢ THÁNG, và tháng test
    /// thường có sẵn 部位病名行 của những ngày khác mang cùng 病名 「Ｃ」. Đo được
    /// 2026-09-08: bản đầu chỉ dò 「ô 点 = 「-」 và có chứa Ｃ」 rồi lấy dòng CUỐI ⇒ vớ đúng
    /// một dòng của ngày <b>14</b> (dòng コメント còn lại từ dữ liệu thật) và cả lượt chạy
    /// nhập 処置 vào nhầm ngày.</para>
    ///
    /// <para>Nhận theo <c>DSP_BUI</c> mà seed ghi (vd 「右上6」) — đó là chuỗi CHỈ dòng seed
    /// mới có; nếu không thấy thì lui về 病名 <paramref name="disMark"/>, vẫn trong ngày đó.</para>
    /// </summary>
    /// <param name="day">Ngày trong tháng của <c>patient.trtDate</c> — cột 日 của lưới.</param>
    public RegiRow? SeededBuiRow(int day, string buiMark, string disMark, int limit = 120)
    {
        var sameDay = _grid.Snapshot(limit)
                           .Where(r => Txt.Int(r.Day) == day)
                           .ToList();
        return sameDay.FirstOrDefault(r => Txt.Has(r.Bui, buiMark) || Txt.Has(r.Ryo, buiMark))
               ?? sameDay.FirstOrDefault(r => Txt.Has(r.Bui, disMark) || Txt.Has(r.Ryo, disMark));
    }

    /// <summary>
    /// Chốt <paramref name="trtCd"/>/<paramref name="trtSb"/> ngay trên 部位病名行 đã seed,
    /// rồi đo lưới trước/sau. Trả về null khi chưa gõ được mã.
    ///
    /// <para>Đối ứng 1-1 với <c>commitTrigger()</c> bên Playwright. Khác biệt DUY NHẤT là
    /// bên này phải chèn một dòng trống dưới 部位病名行 trước khi gõ: WinForm không có
    /// 「dòng mời nhập」 ở cuối (<c>AllowUserToAddRows = false</c>), và
    /// <c>ModMain.AutoBui</c> chỉ chép 部位/病名 xuống dòng đích khi dòng đó CÒN TRỐNG
    /// (modMain.cs:139-146 「すでに入っていれば何もしない」).</para>
    /// </summary>
    public EntryMeasure? CommitOnSeededRow(RegiRow seededBuiRow, int trtCd, int trtSb, TestTrace trace)
    {
        if (!_flow.EnsureCodeMode())
        {
            trace.Note($"KHONG dua duoc o 点 ve コードモード — dang la 「{_flow.InpMode()}」");
            return null;
        }

        // Dòng trống NGAY DƯỚI 部位病名行 — chỗ mà AutoBui chép 部位/病名 sang.
        var below = _flow.RowAfter(seededBuiRow);
        RegiRow? target;
        if (below is not null && SigaToothFlow.IsBlank(below.Ryo) && SigaToothFlow.IsBlank(below.Ten))
        {
            trace.Note($"duoi 部位病名行 da san co dong trong: 「{below}」");
            target = below;
        }
        else
        {
            trace.Note($"duoi 部位病名行 la 「{below?.ToString() ?? "KHONG CO"}」 — chen mot dong trong");
            var blank = _flow.InsertBlankRow(below ?? seededBuiRow, trace);
            if (blank is null)
            {
                trace.Note("Insert khong chen duoc dong trong. Luoi:\n  " +
                           string.Join("\n  ", _flow.DescribeGrid()));
                return null;
            }
            // Insert đẩy mọi thứ xuống ⇒ đọc lại lưới. KHÔNG dùng `LastBuiLineRow()` ở đây:
            // nó quét CẢ THÁNG và sẽ trả về 部位病名行 của một ngày khác (đo 2026-09-08).
            // Dòng trống mà `InsertBlankRow` vừa trả về đã là đúng chỗ rồi.
            target = blank;
        }

        var before = _grid.Snapshot();
        var pointBefore = _grid.AllPointValue();
        trace.Note($"moc truoc khi go ma: {before.Count} dong, 月計 = {pointBefore?.ToString() ?? "?"}");

        // ⚠️ Gõ vào ô 点 của MỘT DÒNG CỤ THỂ, đừng 「gõ tại chỗ con trỏ」: sau 病名選択 app
        // có thể đã nhảy sang tab ガイド và tiêu điểm rời khỏi lưới (frm203002.cs:8376-8384).
        var enter = _flow.EnterTreatment(target!, trtCd, trtSb, answerYes: null, trace);

        Settle(trace);
        EnsureTrtCount(before, trace);

        var after = _grid.Snapshot();
        var pointAfter = _grid.AllPointValue();
        var measure = new EntryMeasure(enter, before, after, pointBefore, pointAfter);

        trace.Note($"do duoc: {measure}");
        foreach (var row in measure.AddedRows) trace.Note("  + " + row);
        trace.Shot($"sau-khi-chot-{trtCd}-{trtSb}");
        return measure;
    }

    /// <summary>
    /// Chờ cho tới khi không còn cửa sổ nào chồng lên lưới.
    ///
    /// <para>Deadline NGẮN có chủ ý (F2): thao tác đang chờ là thuần bộ nhớ.
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
    /// <para><b>Đo được 2026-09-08:</b> chốt xong 処置選択, app mở editor ô 回 nhưng editor
    /// <b>RỖNG</b>, nên cú Enter đóng editor ghi luôn <c>回 = 0</c> và <c>Chk_ChkAuto</c>
    /// KHÔNG BAO GIỜ được gọi. Testcase khi đó đỏ với thông điệp 「app không tự chèn mã đi
    /// kèm」 — <b>đổ oan cho app</b>, trong khi lỗi nằm ở harness.</para>
    ///
    /// <para>Bên Playwright không cần bước này: sau 確定 ô 回 của web đã sẵn 「1」 và spec
    /// assert đúng điều đó (<c>toHaveValue('1')</c>). <b>Chính chỗ này là một điểm lệch
    /// đáng soi</b> — WinForm để editor rỗng, web điền sẵn 1.</para>
    /// </summary>
    private void EnsureTrtCount(IReadOnlyList<RegiRow> before, TestTrace trace)
    {
        var mid = new EntryMeasure(default!, before, _grid.Snapshot(), null, null);

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
        if (!_grid.IsEditing()) { _grid.Press(VirtualKeyShort.RETURN); Thread.Sleep(250); }
        _grid.Type("1");
        _grid.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(1500);
        Settle(trace);
        trace.Shot("sau-khi-go-o-kai");
    }

    // ── Đọc kết quả ──────────────────────────────────────────────────────────

    /// <summary>NFKC + gộp khoảng trắng — bản sao của <c>norm()</c> bên spec Playwright.</summary>
    /// <remarks>
    /// BẪY: lưới in 半角 「ｵｰﾗ」 còn master giữ 全角 「オーラ」. Phải chuẩn hoá CẢ HAI VẾ,
    /// nếu không mọi phép so tên đều trượt và testcase đỏ oan.
    /// </remarks>
    public static string Norm(string? s) =>
        (s ?? "").Normalize(System.Text.NormalizationForm.FormKC)
                 .Replace('　', ' ')
                 .Trim() is var t && t.Length > 0
            ? System.Text.RegularExpressions.Regex.Replace(t, @"\s+", " ")
            : "";

    /// <summary>Dòng đầu tiên trong <paramref name="rows"/> có ô 療法・処置 chứa tên đã chuẩn hoá.</summary>
    public static RegiRow? RowByName(IReadOnlyList<RegiRow> rows, string name)
    {
        var needle = Norm(name);
        return needle.Length == 0 ? null : rows.FirstOrDefault(r => Norm(r.Ryo).Contains(needle));
    }

    /// <summary>
    /// Dòng nào trong <paramref name="rows"/> là 処置 của <paramref name="master"/>.
    ///
    /// <para>Nhận theo TÊN, vì cột <c>trt_cd</c> là cột ẩn — không ra tới UIA
    /// (RegiGrid.cs:11-14). Chấp nhận CẢ HAI tên của master: lưới in <c>cct_nm</c> hay
    /// <c>trt_nm</c> tuỳ cờ <c>ModCommon.pCultTrt</c>, và cờ đó là cấu hình của MÁY.</para>
    /// </summary>
    public static RegiRow? RowOf(IReadOnlyList<RegiRow> rows, MstTrtRow master) =>
        master.DisplayNames.Select(n => RowByName(rows, n)).FirstOrDefault(r => r is not null);

    /// <summary>Chỉ số của dòng khớp tên trong danh sách đã chuẩn hoá; -1 nếu không có.</summary>
    public static int IndexByName(IReadOnlyList<RegiRow> rows, string name)
    {
        var needle = Norm(name);
        if (needle.Length == 0) return -1;
        for (var i = 0; i < rows.Count; i++)
            if (Norm(rows[i].Ryo).Contains(needle)) return i;
        return -1;
    }

    /// <summary>Chỉ số của dòng 処置 <paramref name="master"/>; -1 nếu không có.</summary>
    public static int IndexOf(IReadOnlyList<RegiRow> rows, MstTrtRow master)
    {
        foreach (var n in master.DisplayNames)
        {
            var i = IndexByName(rows, n);
            if (i >= 0) return i;
        }
        return -1;
    }

    /// <summary>Chụp lại lưới (chỉ dòng dữ liệu) — dùng cho các assert về THỨ TỰ.</summary>
    public IReadOnlyList<RegiRow> DataRows(int limit = 80) =>
        _grid.Snapshot(limit).Where(EntryMeasure.IsData).ToList();
}
