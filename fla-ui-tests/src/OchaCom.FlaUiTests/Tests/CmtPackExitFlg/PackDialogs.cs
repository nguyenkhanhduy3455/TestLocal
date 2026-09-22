using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// Ba hộp thoại mà <c>prgCmtAuto</c> bung ra giữa chừng một cú nhập 処置 — gói lại thành
/// một chỗ vì luồng này ĐANG ĐO chính chuỗi hộp thoại đó, chứ không phải chỉ dẹp chúng đi.
///
/// <list type="table">
///   <item><term><c>frm203018</c> 「摘要選択」</term>
///     <description>pack <c>pack_type = 1</c> — danh sách 候補, mỗi dòng có
///     <c>exit_flg</c> RIÊNG (frm203018.cs:488 <c>data.cnt = exit_flg ? "1" : "0"</c>).
///     Đây là hộp thoại quyết định cả phần đuôi của cascade.</description></item>
///   <item><term><c>frm203019</c> 「ユーザー摘要コメント選択」</term>
///     <description>pack <c>pack_type = 90</c> (và pattern 30 bên trong type 1) — ô nhập
///     tự do <c>txtChiryo</c>.</description></item>
///   <item><term><c>frm203048</c> 「パラメータ」</term>
///     <description>pack <c>pack_type = 50</c> — chuỗi có <c>「ggg…」</c> nên form ẩn
///     <c>txtValue</c> và mở <c>dtUpdate</c> đặt sẵn <b>hôm nay</b> (frm203048.cs:140-151);
///     bấm 確定 là chốt ngày hôm nay.</description></item>
/// </list>
///
/// <para><b>Vì sao KHÔNG dùng <c>SigaToothFlow.DismissAll</c> ở đây.</b> Hàm đó không có
/// nút 「いいえ/No/Cancel/OK」 nào để bấm trên ba form này nên nó lui về
/// <c>ClickButtonContaining("戻る")</c> — tức là <b>HUỶ</b> lựa chọn. Với luồng
/// <c>exit_flg</c> thì huỷ và chọn cho ra hai kết quả NGƯỢC NHAU, mà cả hai đều xanh. Vì
/// thế mọi ca ở đây phải trả lời hộp thoại có chủ đích và GHI LẠI đã trả lời gì.</para>
/// </summary>
public static class PackDialogs
{
    // ═════════════════════════════════════════════════════════════════════════
    // Nhận dạng form
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>AutomationId (= <c>Control.Name</c>) và tiêu đề của ba form.</summary>
    public const string SelectFormId = "frm203018";

    /// <summary><c>frm203018.cs:52</c> — <c>Title = _title + "（" + pack_nm + "）"</c>.</summary>
    public const string SelectTitle = "摘要選択";

    public const string UserCommentFormId = "frm203019";

    /// <summary><c>frm203019.cs:49</c>.</summary>
    public const string UserCommentTitle = "ユーザー摘要コメント選択";

    public const string ParamFormId = "frm203048";

    /// <summary><c>frm203048.cs:49</c>.</summary>
    public const string ParamTitle = "パラメータ";

    /// <summary>Lưới của cả frm203018 lẫn frm203019 đều tên <c>dgvView</c>.</summary>
    public const string GridId = "dgvView";

    /// <summary>Ô nhập tự do của frm203019 (frm203019.Designer.cs:71).</summary>
    public const string UserCommentBoxId = "txtChiryo";

    /// <summary>Nhãn hướng dẫn của frm203018 — chính là <c>remarks</c> của pack.</summary>
    public const string RemarksLabelId = "lblRemarks";

    /// <summary>Nhãn hướng dẫn của frm203019 / frm203048.</summary>
    public const string GuidanceLabelId = "customLabel1";

    public const string ConfirmButton = "確定";
    public const string BackButton = "戻る";

    /// <summary>
    /// Form này là form nào — đọc AutomationId trước, không có thì tới tiêu đề.
    ///
    /// <para>Trả về chuỗi rỗng khi không nhận ra: đó KHÔNG phải lỗi, các hộp thoại nghiệp
    /// vụ (<c>#32770</c>) cũng đi qua đây.</para>
    /// </summary>
    public static string Identify(Window w)
    {
        var id = Uia.AutomationIdOf(w);
        var name = Uia.NameOf(w);

        if (Txt.Has(id, SelectFormId) || Txt.Has(name, SelectTitle)) return SelectFormId;
        if (Txt.Has(id, UserCommentFormId) || Txt.Has(name, UserCommentTitle)) return UserCommentFormId;
        if (Txt.Has(id, ParamFormId) || Txt.Has(name, ParamTitle)) return ParamFormId;
        return "";
    }

    /// <summary>Nhãn hướng dẫn của hộp thoại (<c>remarks</c> của pack) — để log đọc được.</summary>
    public static string Guidance(Window w)
    {
        foreach (var labelId in new[] { RemarksLabelId, GuidanceLabelId })
        {
            var label = Uia.ById(w, labelId);
            if (label is null) continue;
            var text = Txt.N(Uia.ValueOf(label));
            if (text.Length > 0) return text;
        }
        return "";
    }

    // ═════════════════════════════════════════════════════════════════════════
    // frm203018 「摘要選択」
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Một dòng của <c>dgvView</c> trên frm203018: 番号 / 摘要欄記載内容.</summary>
    /// <param name="SeqNo">
    /// Ô 番号 — <b>chính là <c>MST_CMT_PACK_DETAIL.seq_no</c></b> (frm203018.cs:296
    /// <c>row["seq_no"] = _MstCmtPackDetailData[i].seq_no</c>), KHÔNG phải chỉ số dòng.
    /// Thứ tự dòng theo <c>dsp_seq_no</c> nên hai con số này lệch nhau ở nhiều pack
    /// (ví dụ <c>I011-2-1-2</c>: dòng thứ 3 mang seq_no 5).
    /// </param>
    public sealed record SelectRow(int Index, AutomationElement Element, int? SeqNo, string Text)
    {
        public override string ToString() => $"[{Index}] 番号 {SeqNo?.ToString() ?? "?"} 「{Text}」";
    }

    /// <summary>
    /// Các dòng của frm203018 — đã lọc dòng tiêu đề 「Top Row」 theo F11 (lọc bằng NỘI DUNG
    /// ô 番号, y như <c>SigaToothFlow.PickerRows</c>).
    /// </summary>
    public static IReadOnlyList<SelectRow> SelectRows(Window dialog, int limit = 60)
    {
        var grid = Uia.ById(dialog, GridId);
        if (grid is null) return [];

        var rows = new List<SelectRow>();
        var index = 0;
        foreach (var element in new WinFormsGrid(grid).RowElements(limit))
        {
            var cells = Uia.Children(element).ToList();
            if (cells.Count < 2) continue;

            var seq = Txt.Int(Txt.N(Uia.ValueOf(cells[0])));
            if (seq is null) continue;   // dòng tiêu đề

            rows.Add(new SelectRow(index++, element, seq, Txt.N(Uia.ValueOf(cells[1]))));
        }
        return rows;
    }

    /// <summary>
    /// Chọn dòng mang <paramref name="seqNo"/> rồi chốt.
    ///
    /// <para>Double-click vào ô 摘要欄記載内容 — <c>dgvView_CellDoubleClick</c>
    /// (frm203018.cs:184) gọi thẳng <c>defData()</c>. Đường lui là click đơn rồi bấm nút
    /// 「確定」 (<c>btnF9_Click</c> → <c>defData()</c>, frm203018.cs:135).</para>
    ///
    /// <para>⚠️ <b>Kiểm rect trước khi click</b> (F10). UIA của <c>DataGridView</c> phơi ra
    /// cả dòng NGOÀI khung nhìn; click vào một dòng như thế rơi vào hư không và hộp thoại
    /// ở nguyên — đúng cái bẫy đã trả giá ở 処置選択 枝番 23 (README của
    /// <c>CmtPackType10</c> §3.1).</para>
    /// </summary>
    /// <returns>false = không thấy dòng, hoặc dòng nằm ngoài khung nhìn, hoặc hộp thoại không đóng.</returns>
    public static bool PickSeq(Window dialog, int seqNo, TestTrace trace)
    {
        var rows = SelectRows(dialog);
        trace.Note($"{SelectFormId} co {rows.Count} dong: " + string.Join(" · ", rows));

        var target = rows.FirstOrDefault(r => r.SeqNo == seqNo);
        if (target is null)
        {
            trace.Note($"⛔ KHONG thay dong 番号 = {seqNo} tren {SelectFormId}. " +
                       "Doi chieu MST_CMT_PACK_DETAIL.seq_no (khong phai chi so dong).");
            return false;
        }

        var cells = Uia.Children(target.Element).ToList();
        var cell = cells.Count > 1 ? cells[1] : target.Element;
        var rect = Uia.RectOf(cell);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0)
        {
            trace.Note($"⛔ dong 番号 {seqNo} co rect RONG ⇒ nam NGOAI khung nhin (F10). " +
                       "Cu click se roi vao goc trai tren DESKTOP. Day la HARNESS chua cuon " +
                       "duoc luoi, KHONG phai app thieu dong.");
            trace.Shot($"{SelectFormId}-dong-{seqNo}-ngoai-khung-nhin");
            return false;
        }

        var (x, y) = Uia.Center(cell);
        trace.Do($"double-click dong 番号 {seqNo} 「{target.Text}」", () => Uia.DoubleClickPhysical(x, y));
        if (Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(8))) return true;

        trace.Do("double-click khong an — click don roi bam 確定", () =>
        {
            Uia.LeftClickPhysical(x, y);
            Thread.Sleep(250);
            ClickNamed(dialog, ConfirmButton);
        });
        return Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(8));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // frm203019 「ユーザー摘要コメント選択」
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Gõ <paramref name="text"/> vào <c>txtChiryo</c> rồi 確定.
    ///
    /// <para><b>Ghi bằng <c>ValuePattern</c> chứ không gõ phím</b> — cùng ngoại lệ có chủ ý
    /// của F13 mà <c>ParamDialog</c> đã ghi: app đọc thẳng <c>txtChiryo.Text</c> ở
    /// <c>btnF9_Click</c> (frm203019.cs:164), còn gõ phím thì phải đi qua IME.</para>
    ///
    /// <para><c>btnF9_Click</c> chặn khi <b>cả</b> lưới lẫn ô nhập đều rỗng
    /// (frm203019.cs:164) — nên chuỗi rỗng là tự làm hỏng phép đo.</para>
    /// </summary>
    public static bool TypeAndConfirm(Window dialog, string text, TestTrace trace)
    {
        var box = Uia.ById(dialog, UserCommentBoxId);
        if (box is null)
        {
            trace.Note($"⛔ {UserCommentFormId} dang mo nhung khong thay o 「{UserCommentBoxId}」 — " +
                       "doc anh, co the app doi ten control (F23).");
            trace.Shot($"{UserCommentFormId}-khong-thay-o-nhap");
            return false;
        }

        Uia.SetText(box, text);
        var actual = Uia.ValueOf(box);
        if (!string.Equals(Txt.N(actual), Txt.N(text), StringComparison.Ordinal))
            trace.Note($"⚠ o nhap KHONG khop cai vua ghi: dinh 「{text}」 nhung dang giu 「{actual}」 — " +
                       "dong roi xuong luoi se theo cai SAU.");

        trace.Do($"{UserCommentFormId}: go 「{text}」 roi 確定", () => ClickNamed(dialog, ConfirmButton));
        return Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(8));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // frm203048 「パラメータ」
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Bấm 確定 trên frm203048.
    ///
    /// <para>Chuỗi vào đây luôn có <c>「ggg…」</c> (setPacData case 50, CmtAuto.cs:3705-3713)
    /// nên form ẩn <c>txtValue</c>, hiện <c>dtUpdate</c> đã <c>setDate(DateTime.Today)</c>
    /// (frm203048.cs:148-150). Không phải gõ gì: 確定 chốt ngày HÔM NAY — và đó cũng chính
    /// là thứ ca đo ghi lại, vì ngày rơi xuống lưới sẽ là ngày chạy test, không phải 算定日.</para>
    /// </summary>
    public static bool ConfirmParam(Window dialog, TestTrace trace)
    {
        trace.Do($"{ParamFormId}: bam 確定 (nhan ngay hom nay tu dtUpdate)",
                 () => ClickNamed(dialog, ConfirmButton));
        return Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(8));
    }

    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Bấm 戻る — HUỶ, không chọn gì.</summary>
    public static bool Back(Window dialog, TestTrace trace)
    {
        trace.Do($"bam 「{BackButton}」 (HUY)", () => ClickNamed(dialog, BackButton));
        return Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(8));
    }

    /// <summary>Bấm nút theo nhãn; các form này là WinForm thật nên <c>Uia.Click</c> đủ.</summary>
    private static bool ClickNamed(Window dialog, string caption)
    {
        try
        {
            var button = dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                               .FirstOrDefault(b => Txt.Has(Uia.NameOf(b), caption));
            if (button is null) return false;
            Uia.Click(button);
            return true;
        }
        catch { return false; }
    }

    /// <summary>Tên mọi nút của hộp thoại — in ra khi bấm trượt (F18).</summary>
    public static string ButtonNames(Window dialog)
    {
        try
        {
            var names = dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                              .Select(b => Txt.N(Uia.NameOf(b)))
                              .Where(n => n.Length > 0);
            return string.Join(",", names);
        }
        catch { return "(đọc hỏng)"; }
    }
}
