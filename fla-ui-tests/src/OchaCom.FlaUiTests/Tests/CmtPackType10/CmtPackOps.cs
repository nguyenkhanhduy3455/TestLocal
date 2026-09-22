using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.CmtPackType10;

/// <summary>
/// Nhập một 処置 KHÔNG CẦN 部位 rồi đo cái đuôi 摘要コメント của nó.
///
/// <para>Khác <see cref="AutoSanteiOps.CommitOnSeededRow"/> ở đúng một chỗ: luồng kia đo
/// <c>Chk_ChkAuto</c> nên phải dựng sẵn 部位病名行 (mã 抜歯 bắt buộc có 部位). Mọi mã của
/// luồng này — 歯清 108/2, 特 105/x, 口管強 116/x, ＳＰＴ 167/x — đều có
/// <c>KOUKU/CHISI/KESSON = 0</c> trong bản master, tức <b>không mở 部位選択</b>, nên chỉ cần
/// một dòng trống là gõ được.</para>
///
/// <para><b>Vì sao KHÔNG cần ép ô 回 về 1</b> (khác hẳn <c>AutoSanteiOps.EnsureTrtCount</c>):
/// <c>ModMain.Chk_CmtAuto</c> được gọi <b>TRƯỚC</b> hàng rào <c>if (trtCnt >= 1)</c>, và
/// WinForm ghi hẳn lý do vào comment: 「回数が０の場合、コメント自動入力（歯在管を算定した
/// ものとみなす場合への対応）」 (frm203002.cs:5731-5741). Ép ô 回 tốn thêm một vòng phím và
/// mở đường cho <c>Chk_ChkAuto</c> chèn thêm dòng — đúng thứ làm nhiễu phép đếm ở đây.</para>
///
/// <para><b>Dòng comment nhận ra bằng 点 = 0.</b> <c>chkCmtAuto_Chk_SikanDay</c>
/// (modMain.cs:2159-2183) chèn dòng mới với <c>点 = "0"</c>, <c>回 = "1"</c>, chữ ở ô
/// 療法・処置 và tô màu 0xff80ff. Màu không ra tới UIA, nên mốc là 点 = 0 + nội dung ô.</para>
/// </summary>
public sealed class CmtPackOps
{
    private readonly SigaToothFlow _flow;
    private readonly TreatmentGridOps _grid;

    public CmtPackOps(SigaToothFlow flow)
    {
        _flow = flow;
        _grid = flow.Grid;
    }

    public SigaToothFlow Flow => _flow;
    public TreatmentGridOps Grid => _grid;

    /// <summary>Các dòng DỮ LIỆU của lưới (đã loại 日計/合計/tiêu đề tháng).</summary>
    public IReadOnlyList<RegiRow> DataRows(int limit = 120) =>
        _grid.Snapshot(limit).Where(AutoSanteiOps.EntryMeasure.IsData).ToList();

    /// <summary>
    /// Dòng cuối cùng của ngày <paramref name="day"/>; không có ngày đó thì dòng dữ liệu
    /// cuối cùng của lưới (và trace ghi lại là đã lui).
    ///
    /// <para>Chọn theo Ô 日 chứ không theo chỉ số: <c>grdRegi</c> mở CẢ THÁNG (F10/F12).</para>
    /// </summary>
    public RegiRow? LastRowOfDay(int day, TestTrace? trace = null)
    {
        var rows = DataRows();
        var sameDay = rows.Where(r => Txt.Int(r.Day) == day).ToList();
        if (sameDay.Count > 0) return sameDay[^1];

        trace?.Note($"luoi khong co dong nao cua ngay {day} — lui ve dong du lieu cuoi cung " +
                    $"({rows.Count} dong). ModMain.AutoDate se chep o 日 tu dong ben tren.");
        return rows.Count > 0 ? rows[^1] : null;
    }

    /// <summary>
    /// Dòng CUỐI của ngày <paramref name="day"/>, <b>đã cuộn vào khung nhìn</b> — dùng thay
    /// <c>SigaToothFlow.InputRow()</c> khi lưới đang hiện <b>過去データ inline</b>.
    ///
    /// <para>⚠️ <b>Vì sao không dùng <c>InputRow()</c></b> (đã trả giá 2026-09-21, probe
    /// <c>TcDP0</c>). Khi tuỳ chọn 過去データ１画面表示 bật, <c>GetTrnRsOld</c> chèn thẳng các
    /// tháng trước vào chính <c>hFG1</c> (modSave.cs:4817), nên lưới có dạng:</para>
    /// <code>
    ///   [0]  (null) | R 08年04月            ← dòng tiêu đề THÁNG
    ///   [1]  7      | 歯科初診料 …           ← dữ liệu THÁNG QUÁ KHỨ
    ///   [8]  7      | R 08年04月 合計 …      ← dòng 合計
    ///   …
    ///   [58] 1      | …                     ← vẫn là tháng quá khứ
    /// </code>
    /// <c>InputRow()</c> trả về dòng 処置 CUỐI của cả lưới — rơi đúng vào một tháng quá khứ,
    /// mà những dòng đó mang <c>linekbn = 99</c> nên <c>AddRow</c> <b>từ chối chèn</b>:
    /// 「Insert không chèn được dòng trống」. Nhìn y như harness hỏng, thật ra là chọn nhầm dòng.
    ///
    /// <para>Cuộn bằng <b>Page Down</b> chứ không bằng thanh cuộn: cầu MSAA→UIA của
    /// <c>DataGridView</c> không phơi ra <c>ScrollBar</c> nào để mà kéo (F10). Và phải cuộn
    /// thật, vì UIA vẫn phơi ra một số dòng vừa ra khỏi khung với <c>BoundingRectangle</c>
    /// RỖNG — click vào đó là bắn chuột ra <c>(0,0)</c>, tức góc trái trên DESKTOP.</para>
    ///
    /// <para>Luồng <c>CmtPackExitFlg</c> có một bản tương đương trong
    /// <c>CmtPackUiTestBase.ScrollToLastRowOfDay</c>; hai bản cùng thuật toán.</para>
    /// </summary>
    public RegiRow? ScrollToLastRowOfDay(int day, TestTrace trace, int maxPageDowns = 8)
    {
        for (var attempt = 0; attempt <= maxPageDowns; attempt++)
        {
            var target = LastRowOfDay(day, trace);
            if (target is not null && Txt.Int(target.Day) == day && HasRect(target))
            {
                if (attempt > 0) trace.Note($"cuon {attempt} lan thi dong cua ngay {day} vao khung nhin");
                return target;
            }

            var anchorRow = _grid.Snapshot().LastOrDefault(HasRect);
            if (anchorRow is null)
            {
                trace.Note("⛔ khong con dong nao co rect that de bam Page Down — luoi dang bi che? " +
                           "Doc anh truoc khi ket luan.");
                trace.Shot("khong-cuon-duoc-luoi");
                return target;
            }

            trace.Do($"cuon luoi: Page Down tu dong 「{anchorRow}」 (lan {attempt + 1})", () =>
            {
                _grid.FocusCell(anchorRow, RegiGrid.Col.Day);
                // Click vào ô 日 có thể mở editor; Enter đóng lại mà KHÔNG đổi giá trị.
                // ⛔ Đừng dùng ESC — trên lưới 処置 nó là 戻る và bung dirty gate (F14).
                if (_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
                _grid.Press(VirtualKeyShort.NEXT);
            });
        }

        trace.Note($"⛔ cuon {maxPageDowns} lan van khong dua duoc dong cua ngay {day} vao khung nhin.");
        trace.Shot($"khong-cuon-toi-ngay-{day}");
        return LastRowOfDay(day, trace);
    }

    /// <summary>Dòng có ô thật trên màn hình (rect khác rỗng) — xem <see cref="ScrollToLastRowOfDay"/>.</summary>
    public static bool HasRect(RegiRow row)
    {
        var cells = Uia.Children(row.Element).ToList();
        if (cells.Count == 0) return false;
        var rect = Uia.RectOf(cells[0]);
        return rect is { Width: > 0, Height: > 0 };
    }

    /// <summary>Kết quả một lượt nhập, kèm các dòng comment tách riêng.</summary>
    /// <param name="Measure">Lưới trước/sau + 月計 — dùng lại nguyên bộ đếm của luồng AutoSantei.</param>
    /// <param name="EnteredDay">Ô 日 của dòng vừa gõ, đọc từ lưới (KHÔNG suy từ cấu hình).</param>
    public sealed record CommitMeasure(
        AutoSanteiOps.EntryMeasure Measure,
        string EnteredDay,
        IReadOnlyList<string> DialogsSeen)
    {
        /// <summary>
        /// Các dòng do 摘要コメント sinh ra: có thêm sau lượt chốt, 点 = 0, ô 療法・処置 có chữ.
        ///
        /// <para>Lọc <c>点 = 0</c> loại được chính dòng 処置 vừa gõ (nó có điểm), nhưng KHÔNG
        /// loại được dòng do <c>Chk_ChkAuto</c> kéo theo nếu mã đó 0 điểm. Các mã của luồng
        /// này không có mã đi kèm nào trong <c>chkauto</c> — TC10-4 in cả danh sách thô ra
        /// để người đọc tự kiểm.</para>
        /// </summary>
        public IReadOnlyList<RegiRow> CommentRows =>
            Measure.AddedRows.Where(r => Txt.Int(r.Ten) == 0 && !SigaToothFlow.IsBlank(r.Ryo)).ToList();

        /// <summary>Nội dung ô 療法・処置 của các dòng comment, đã chuẩn hoá NFKC.</summary>
        public IReadOnlyList<string> CommentTexts =>
            CommentRows.Select(r => AutoSanteiOps.Norm(r.Ryo)).ToList();

        /// <summary>Có đúng bao nhiêu dòng comment mang chuỗi <paramref name="fragment"/>.</summary>
        public int CountComments(string fragment)
        {
            var needle = AutoSanteiOps.Norm(fragment);
            return needle.Length == 0 ? 0 : CommentTexts.Count(t => t.Contains(needle));
        }

        /// <summary>
        /// Lượt chốt có THẬT SỰ đẩy được dòng 処置 xuống lưới không.
        ///
        /// <para>⚠️ <b>Đừng gác bằng <c>Enter.Committed</c>.</b> <c>CommitPick</c> trả
        /// <b>true</b> ngay khi nó tìm thấy phần tử UIA của dòng 枝番 và bắn double-click —
        /// nhưng UIA của <c>DataGridView</c> phơi ra cả những dòng NGOÀI KHUNG NHÌN (F10) và
        /// cú click vật lý vào một dòng như thế rơi vào hư không.</para>
        ///
        /// <para><b>Đã trả giá 2026-09-16 (probe TcCP2):</b> chốt 116/23 口管強(根Ｃ管) — 枝番 23
        /// nằm dưới đáy danh sách 18 dòng, khung nhìn chỉ có tới 枝番 17. Trace in
        /// 「double-click dong 枝番 23 … xong」, <c>Committed = true</c>, nhưng 月計 không nhúc
        /// nhích (Δ 0) và dòng thêm vào lưới RỖNG. Nếu ca đo kết luận từ đó thì nó trả lời
        /// 「WinForm không tính dòng chưa lưu」 trong khi thật ra <b>chưa có dòng nào cả</b> —
        /// xanh sai, không dấu hiệu. Vì thế: chọn mã có 枝番 nằm trong khung nhìn, và luôn
        /// kiểm mốc này trước khi đọc <see cref="CommentRows"/>.</para>
        /// </summary>
        public bool InsertedTreatmentRow => Measure.AddedRows.Any(r => Txt.Int(r.Ten) is > 0);

        public bool Ok => Measure.Enter.Ok;

        public override string ToString() =>
            $"ngày 「{EnteredDay}」 · {Measure} · comment {CommentRows.Count} dòng " +
            $"[{string.Join(" / ", CommentTexts)}]" +
            (DialogsSeen.Count > 0 ? $" · hộp thoại [{string.Join(" / ", DialogsSeen)}]" : "");
    }

    /// <summary>
    /// Chèn một dòng trống dưới <paramref name="below"/> rồi gõ <paramref name="trtCd"/>/
    /// <paramref name="trtSb"/> vào đó, đo lưới trước/sau. Null = chưa gõ được mã.
    ///
    /// <para>Mọi hộp thoại bung ra sau khi chốt đều được GHI NGUYÊN VĂN rồi mới dẹp (F17):
    /// cụm 歯清 có pack type 1 (I030-3 リスト選択) và type 90 (I030-2-2) nên hộp thoại là
    /// chuyện BÌNH THƯỜNG ở đây, không phải sự cố — nhưng nếu không ghi lại thì ca sau sẽ
    /// đo trên một màn hình đã lệch mà không ai biết.</para>
    /// </summary>
    public CommitMeasure? Commit(RegiRow below, int trtCd, int trtSb, TestTrace trace)
    {
        if (!_flow.EnsureCodeMode())
        {
            trace.Note($"KHONG dua duoc o 点 ve コードモード — dang la 「{_flow.InpMode()}」. " +
                       "Do la loi HARNESS, khong phai app thieu chuc nang.");
            return null;
        }

        var target = _flow.InsertBlankRow(below, trace);
        if (target is null)
        {
            trace.Note("Insert khong chen duoc dong trong. Luoi:\n  " +
                       string.Join("\n  ", _flow.DescribeGrid()));
            return null;
        }

        var before = _grid.Snapshot();
        var pointBefore = _grid.AllPointValue();
        trace.Note($"moc truoc khi go ma {trtCd}/{trtSb}: {before.Count} dong, " +
                   $"月計 = {pointBefore?.ToString() ?? "?"}");

        var enter = _flow.EnterTreatment(target, trtCd, trtSb, answerYes: null, trace);

        // Deadline NGẮN có chủ ý (F2): cái đang chờ là Chk_CmtAuto — thuần bộ nhớ + vài câu
        // SQL. Chờ lâu hơn không cho thêm thông tin nào.
        var dialogs = new List<string>(enter.Dialogs);
        if (!Waits.TryUntil(() => _flow.Picker() is null && _flow.OpenDialogs().Count == 0,
                            TimeSpan.FromSeconds(8)))
        {
            trace.Note("van con cua so chong len luoi: " + _flow.DescribeDialogs());
            trace.Shot("con-hop-thoai");
            dialogs.AddRange(_flow.DismissAll(trace: trace));
        }

        var after = _grid.Snapshot();
        var pointAfter = _grid.AllPointValue();
        var measure = new AutoSanteiOps.EntryMeasure(enter, before, after, pointBefore, pointAfter);

        var typed = measure.AddedRows.FirstOrDefault(r => Txt.Int(r.Ten) is > 0);
        var result = new CommitMeasure(measure, typed?.Day ?? target.Day, dialogs);

        trace.Note($"do duoc: {result}");
        foreach (var row in measure.AddedRows) trace.Note("  + " + row);
        if (!result.InsertedTreatmentRow)
            trace.Note($"⛔ KHONG co dong 処置 nao vao luoi cho {trtCd}/{trtSb} — dung doc " +
                       "comment cua luot nay, tien de chua thanh (xem CommitMeasure.InsertedTreatmentRow). " +
                       "Hop thoai dang mo: " + _flow.DescribeDialogs());
        trace.Shot($"sau-khi-chot-{trtCd}-{trtSb}");
        return result;
    }
}
