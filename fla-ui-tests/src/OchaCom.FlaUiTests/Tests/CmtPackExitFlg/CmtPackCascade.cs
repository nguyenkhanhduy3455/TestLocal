using FlaUI.Core.AutomationElements;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// Nhập một 処置 rồi <b>đi trọn chuỗi hộp thoại</b> của <c>prgCmtAuto</c>, ghi lại thứ tự
/// và nội dung từng hộp — đó chính là số đo của luồng <c>exit_flg</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI (CmtAuto.cs:77-919)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   grdRegi — Enter ở ô 回          (frm203002.cs:5733-5738)
///     └─ ModMain.Chk_CmtAuto
///          └─ CmtAuto.prgCmtAuto
///               for (i = 0; i &lt; MstCmtPackData.Count; i++)   ← ORDER BY a.seq_no
///                   switch (pack_type) { case 1 / 10 / 50 / 90 … }
///                   if (exit_flg) break;                       ← CmtAuto.cs:917-919
/// </code>
///
/// <para><b><c>exit_flg</c> đến từ đâu</b> — ba nguồn khác nhau, và đó là cả vấn đề:</para>
/// <list type="number">
///   <item>pack <c>type 1</c>: từ <b>dòng NGƯỜI DÙNG CHỌN</b> trên frm203018
///     (<c>data.cnt = exit_flg ? "1" : "0"</c>, frm203018.cs:488) — nên cùng một 処置,
///     chọn dòng khác nhau thì phần đuôi cascade khác nhau.</item>
///   <item>pack <c>type 10</c>: từ <c>MST_CMT_PACK_DETAIL[0].exit_flg</c> của nhánh
///     handler trả về (<c>setPacData</c>, CmtAuto.cs:3659).</item>
///   <item>pack <c>type 90</c>: <b>ĐẶT TRƯỚC KHI MỞ hộp thoại</b> (CmtAuto.cs:838-841 rồi
///     mới <c>showDialog(ID203019)</c> ở :880) — huỷ hộp thoại KHÔNG gỡ được cờ.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG DÙNG <c>SigaToothFlow.EnterTreatment</c>
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>FinishTreatmentEntry</c> gặp hộp thoại lạ thì bấm 「いいえ/No/OK」, không khớp thì lui
/// về <c>ClickButtonContaining("戻る")</c>. Trên frm203018/19/48 thì 「戻る」 = <b>HUỶ</b>.
/// Huỷ frm203018 ⇒ <c>outList</c> rỗng ⇒ không có dòng comment nào VÀ <c>exit_flg</c> không
/// bao giờ bật ⇒ cascade chạy tiếp — <b>ngược hẳn</b> với ca 「chọn dòng có exit_flg」, mà
/// cả hai đều xanh. Vì thế luồng này tự cầm lái từ <c>EnterCodeOnRow</c> trở đi.
/// </summary>
public sealed class CmtPackCascade
{
    private readonly OchaApp _app;
    private readonly SigaToothFlow _flow;
    private readonly TreatmentGridOps _grid;

    public CmtPackCascade(OchaApp app, SigaToothFlow flow)
    {
        _app = app;
        _flow = flow;
        _grid = flow.Grid;
    }

    public SigaToothFlow Flow => _flow;

    /// <summary>Trần số hộp thoại trong MỘT cú nhập — để lượt hỏng thoát ra chứ không quay mãi.</summary>
    public const int MaxDialogs = 12;

    /// <summary>Chuỗi điền vào <c>txtChiryo</c> của frm203019 — cố ý ASCII để đọc log khỏi lệch.</summary>
    public const string UserCommentFill = "TESTCMT";

    // ═════════════════════════════════════════════════════════════════════════
    // Kế hoạch trả lời
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Trả lời chuỗi hộp thoại thế nào.
    /// </summary>
    /// <param name="PickSeqNo">
    /// <c>seq_no</c> của dòng cần chọn trên frm203018 <b>ĐẦU TIÊN</b>. null = bấm 戻る (huỷ).
    /// Các frm203018 sau đó (nếu có) luôn bị huỷ và được ghi lại — ca nào cần nhiều hơn một
    /// lựa chọn thì mở rộng chỗ này, đừng lẳng lặng chọn bừa.
    /// </param>
    /// <param name="UserComment">
    /// Chuỗi gõ vào frm203019. null = bấm 戻る — <b>dùng đúng cho phép đo B3</b>
    /// (「type 90 bật exit_flg TRƯỚC khi mở hộp thoại thì huỷ có gỡ được cờ không」).
    /// </param>
    /// <param name="ConfirmParam">
    /// true = bấm 確定 trên frm203048 (nhận ngày hôm nay); false = 戻る.
    /// </param>
    public sealed record Plan(int? PickSeqNo, string? UserComment = UserCommentFill, bool ConfirmParam = true)
    {
        /// <summary>Huỷ tất cả — ca 「chỉ xem có những hộp thoại nào」.</summary>
        public static Plan CancelAll => new(null, null, false);

        public override string ToString() =>
            $"chọn 番号 {PickSeqNo?.ToString() ?? "(huỷ)"} · frm203019 " +
            $"{(UserComment is null ? "(huỷ)" : $"「{UserComment}」")} · frm203048 " +
            $"{(ConfirmParam ? "確定" : "戻る")}";
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Số đo
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Một hộp thoại đã gặp, theo đúng thứ tự bung ra.</summary>
    /// <param name="Form">
    /// <c>frm203018</c> / <c>frm203019</c> / <c>frm203048</c>, hoặc <c>"#32770"</c> cho
    /// MessageBox nghiệp vụ, hoặc <c>"?"</c> khi không nhận ra.
    /// </param>
    /// <param name="Answered">Đã làm gì với nó — nguyên văn, để đọc log là dựng lại được lượt chạy.</param>
    public sealed record DialogStep(
        int Order, string Form, string Title, string Guidance,
        IReadOnlyList<string> Rows, string Answered)
    {
        public override string ToString() =>
            $"#{Order} {Form} 「{Title}」" +
            (Guidance.Length > 0 ? $" hướng dẫn 「{Guidance}」" : "") +
            (Rows.Count > 0 ? $" dòng[{string.Join(" / ", Rows)}]" : "") +
            $" → {Answered}";
    }

    /// <summary>Kết quả trọn một cú nhập.</summary>
    public sealed record CascadeMeasure(
        AutoSanteiOps.EntryMeasure Measure,
        string EnteredDay,
        IReadOnlyList<DialogStep> Dialogs)
    {
        /// <summary>
        /// Dòng do 摘要コメント sinh ra — cùng mốc với luồng <c>CmtPackType10</c>:
        /// <c>点 = 0</c> và ô 療法・処置 có chữ (<c>chkCmtAuto_Chk_SikanDay</c>,
        /// modMain.cs:2159-2183 chèn dòng 点 = 0 / 回 = 1). Màu <c>0xff80ff</c> KHÔNG ra tới
        /// UIA nên không dùng được làm mốc.
        /// </summary>
        public IReadOnlyList<RegiRow> CommentRows =>
            Measure.AddedRows.Where(r => Txt.Int(r.Ten) == 0 && !SigaToothFlow.IsBlank(r.Ryo)).ToList();

        public IReadOnlyList<string> CommentTexts =>
            CommentRows.Select(r => AutoSanteiOps.Norm(r.Ryo)).ToList();

        public int CountComments(string fragment)
        {
            var needle = AutoSanteiOps.Norm(fragment);
            return needle.Length == 0 ? 0 : CommentTexts.Count(t => t.Contains(needle));
        }

        /// <summary>Số lần một form bung ra trong lượt này.</summary>
        public int CountDialogs(string form) => Dialogs.Count(d => d.Form == form);

        /// <summary>Hộp thoại đầu tiên của form đó; null nếu không có.</summary>
        public DialogStep? FirstDialog(string form) => Dialogs.FirstOrDefault(d => d.Form == form);

        /// <summary>Có hộp thoại nào mang chuỗi <paramref name="fragment"/> trong tiêu đề/hướng dẫn/dòng không.</summary>
        public bool AnyDialogMentions(string fragment) =>
            Dialogs.Any(d => Txt.Has(d.Title, fragment) || Txt.Has(d.Guidance, fragment) ||
                             d.Rows.Any(r => Txt.Has(r, fragment)));

        /// <summary>
        /// Lượt nhập có THẬT SỰ đẩy được dòng 処置 xuống lưới không.
        ///
        /// <para>⛔ Gác bằng mốc này TRƯỚC KHI đọc <see cref="CommentTexts"/>. <c>Committed</c>
        /// của <c>CommitPick</c> trả true ngay khi nó bắn double-click, kể cả khi dòng 枝番
        /// nằm ngoài khung nhìn và cú click rơi vào hư không (F10) — xem
        /// <c>CmtPackType10/README.md</c> §3.1.</para>
        /// </summary>
        public bool InsertedTreatmentRow => Measure.AddedRows.Any(r => Txt.Int(r.Ten) is > 0);

        public override string ToString() =>
            $"ngày 「{EnteredDay}」 · {Measure} · comment {CommentRows.Count} dòng " +
            $"[{string.Join(" / ", CommentTexts)}] · hộp thoại {Dialogs.Count}";
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Lượt nhập
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Chèn một dòng trống dưới <paramref name="below"/>, gõ <paramref name="trtCd"/>/
    /// <paramref name="trtSb"/>, rồi trả lời trọn chuỗi hộp thoại theo <paramref name="plan"/>.
    /// Null = chưa gõ được mã (HARNESS hỏng, không phải app).
    /// </summary>
    public CascadeMeasure? Run(RegiRow below, int trtCd, int trtSb, Plan plan, TestTrace trace)
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
                   $"月計 = {pointBefore?.ToString() ?? "?"} · ke hoach: {plan}");

        if (!_flow.EnterCodeOnRow(target, trtCd, trace))
            return null;

        return Finish(trtCd, trtSb, plan, before, pointBefore, target.Day, trace);
    }

    /// <summary>
    /// Như <see cref="Run"/>, nhưng gõ mã vào <b>ĐÚNG chỗ con trỏ mà app vừa đặt</b> thay vì
    /// tự chèn dòng trống — dùng ngay sau <c>SigaToothFlow.SetBuiOnRow</c>.
    ///
    /// <para><b>Vì sao cần đường riêng.</b> <c>fDis_Move_Cell</c> (frm203002.cs:8621-8670) đã
    /// dời con trỏ sang dòng kế và mở editor ô 点, còn <c>ModMain.AutoBui</c> (modMain.cs:139-156)
    /// đã chép 部位/病名 từ <b>đúng một dòng ngay trên</b> xuống dòng đó. Gọi
    /// <see cref="Run"/> ở đây là chèn THÊM một dòng trống nữa, nên dòng mang 処置 sẽ nằm dưới
    /// một dòng RỖNG — <c>AutoBui</c> chép từ dòng rỗng ấy và <c>dis_cd</c> về 0. Mọi pack
    /// phụ thuộc 病名 (vd <c>B000-4</c> 歯管-有床義歯) khi đó đo ra kết quả của 「không có
    /// 病名」 mà vẫn xanh.</para>
    ///
    /// <para>⚠️ <c>EnsureCodeMode</c> KHÔNG chạy ở đây — nó click vào nhãn <c>lbInpMode</c>,
    /// tức dời tiêu điểm ra khỏi lưới và mất luôn chỗ con trỏ. Gọi nó TRƯỚC cả chuỗi
    /// 部位選択, xem <c>SigaToothFlow.EnterCodeAtCursor</c>.</para>
    /// </summary>
    /// <param name="dayHint">Ngày ghi vào số đo khi lượt nhập không đẩy được dòng nào xuống lưới.</param>
    public CascadeMeasure? RunAtCursor(int trtCd, int trtSb, Plan plan, TestTrace trace, string dayHint)
    {
        var before = _grid.Snapshot();
        var pointBefore = _grid.AllPointValue();
        trace.Note($"moc truoc khi go ma {trtCd}/{trtSb} TAI CON TRO: {before.Count} dong, " +
                   $"月計 = {pointBefore?.ToString() ?? "?"} · ke hoach: {plan}");

        if (!_flow.EnterCodeAtCursor(trtCd, trace))
        {
            trace.Note("KHONG go duoc ma tai con tro — o 点 co dang mo editor khong? " +
                       "Doc anh truoc khi ket luan (F1).");
            trace.Shot("khong-go-duoc-tai-con-tro");
            return null;
        }

        return Finish(trtCd, trtSb, plan, before, pointBefore, dayHint, trace);
    }

    /// <summary>
    /// Như <see cref="Run"/>, nhưng gõ mã vào <b>một dòng ĐÃ CÓ SẴN</b> thay vì tự chèn dòng
    /// trống, và <b>click thẳng vào ô 点</b> của dòng đó thay vì tin vào vị trí con trỏ.
    ///
    /// <para><b>Vì sao cần đường thứ ba.</b> Sau khi 病名選択 đóng, app có thể <b>nhảy tiêu
    /// điểm sang tab ガイド</b> ở panel phải — lúc đó con trỏ KHÔNG còn trong lưới và
    /// <see cref="RunAtCursor"/> không gõ được. Đường lui của
    /// <c>SigaToothFlow.EnterCodeAtCursor</c> là tìm 部位病名行 CUỐI bằng
    /// <c>LastBuiLineRow(limit: 60)</c> — mà lưới có 過去データ inline thì dài hơn 60 dòng,
    /// nên nó trả về một 部位病名行 của THÁNG QUÁ KHỨ. Đo được 2026-09-21 (TCD_11): nó lui về
    /// 「[44] ngày 2 | 残根上義歯」 trong khi dòng cần gõ ở ngày 11.</para>
    ///
    /// <para>⇒ Ca đo tự xác định dòng đích theo NỘI DUNG (ngày + ô trống) rồi truyền vào đây;
    /// <c>EnterCodeOnRow</c> click đúng ô 点 của nó nên không phụ thuộc tiêu điểm đang ở đâu.</para>
    /// </summary>
    public CascadeMeasure? RunOnRow(RegiRow target, int trtCd, int trtSb, Plan plan, TestTrace trace)
    {
        if (!_flow.EnsureCodeMode())
        {
            trace.Note($"KHONG dua duoc o 点 ve コードモード — dang la 「{_flow.InpMode()}」. " +
                       "Do la loi HARNESS, khong phai app thieu chuc nang.");
            return null;
        }

        var before = _grid.Snapshot();
        var pointBefore = _grid.AllPointValue();
        trace.Note($"moc truoc khi go ma {trtCd}/{trtSb} vao dong 「{target}」: {before.Count} dong, " +
                   $"月計 = {pointBefore?.ToString() ?? "?"} · ke hoach: {plan}");

        if (!_flow.EnterCodeOnRow(target, trtCd, trace))
            return null;

        return Finish(trtCd, trtSb, plan, before, pointBefore, target.Day, trace);
    }

    /// <summary>
    /// Phần chung của <see cref="Run"/> và <see cref="RunAtCursor"/>: chốt 処置選択, bấm Enter
    /// ở ô 回 (cú gọi <c>Chk_CmtAuto</c>), rồi vét trọn chuỗi hộp thoại của <c>prgCmtAuto</c>.
    /// </summary>
    private CascadeMeasure? Finish(int trtCd, int trtSb, Plan plan,
                                   IReadOnlyList<RegiRow> before, int? pointBefore,
                                   string dayHint, TestTrace trace)
    {
        // ── dẹp 「ガイド処置選択」 nếu nó chen vào trước ────────────────────
        //
        // Với 病名 欠損 (vd MT), app bung hộp GỢI Ý này ngay sau khi gõ mã. Nó cũng có lưới
        // dgvView nên từng lọt qua Picker() (đo được 2026-09-21) ⇒ CommitPick tìm 枝番 trong
        // danh sách 義歯連合印象/咬合採得… không thấy, và cả lượt đo kẹt. Huỷ bằng 戻る:
        // nó chỉ gợi ý, bỏ qua không đụng gì tới dòng đang nhập.
        if (Waits.TryFor(_flow.GuidePicker, TimeSpan.FromSeconds(4)) is { } guide)
        {
            var closed = Dialogs.ClickButtonContaining(guide, "戻る", "F10");
            trace.Note($"「ガイド処置選択」 chen vao truoc 処置選択 — huy bang 戻る: {closed}");
            trace.Shot("guide-picker-chen-vao");
            Thread.Sleep(1000);
        }

        // ── 処置選択 ────────────────────────────────────────────────────────
        var picker = Waits.TryFor(_flow.Picker, TimeSpan.FromSeconds(20));
        var steps = new List<DialogStep>();
        var committed = false;

        if (picker is null)
        {
            trace.Note("処置選択 KHONG mo — hop thoai dang mo: " + _flow.DescribeDialogs());
            trace.Shot("khong-mo-duoc-処置選択");
        }
        else
        {
            trace.Shot("処置選択-mo");
            committed = _flow.CommitPick(picker, trtSb, trace, trtCd);
        }

        // ── hộp thoại nghiệp vụ của IregCodChk (bung NGAY sau khi chốt) ─────
        // Deadline ngắn có chủ ý (F2): cái đang đợi là một MsgBox đồng bộ ngay trong hàm
        // xử lý của frm203016 — có thì nó đã có rồi.
        DrainDialogs(steps, plan, TimeSpan.FromSeconds(6), TimeSpan.FromSeconds(4), trace);

        // ── Enter ô 回 — CHÍNH CÚ NÀY gọi Chk_CmtAuto ───────────────────────
        // frm203002.cs:5733-5738. Không bấm là cả cascade không chạy, và ca đo sẽ kết luận
        // 「pack không ra gì」 trong khi thật ra chưa ai gọi nó.
        if (_grid.IsEditing())
        {
            trace.Do($"editor o 回 dang mo voi 「{_grid.EditorText()}」 — Enter de chay Chk_CmtAuto",
                     () => _grid.Press(VirtualKeyShort.RETURN));
        }
        else
        {
            trace.Note("⚠ editor o 回 KHONG mo sau khi chot — Chk_CmtAuto co the da chay roi " +
                       "(hoac chua bao gio chay). Doc anh truoc khi ket luan.");
            trace.Shot("khong-thay-editor-o-kai");
        }

        // ── chuỗi hộp thoại của prgCmtAuto ─────────────────────────────────
        DrainDialogs(steps, plan, TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(6), trace);

        var after = _grid.Snapshot();
        var pointAfter = _grid.AllPointValue();
        var enter = new SigaToothFlow.EnterResult(true, picker is not null, committed,
                                                  steps.Select(s => s.ToString()).ToList());
        var measure = new AutoSanteiOps.EntryMeasure(enter, before, after, pointBefore, pointAfter);

        var typed = measure.AddedRows.FirstOrDefault(r => Txt.Int(r.Ten) is > 0);
        var result = new CascadeMeasure(measure, typed?.Day ?? dayHint, steps);

        trace.Note($"do duoc: {result}");
        foreach (var step in steps) trace.Note("  » " + step);
        foreach (var row in measure.AddedRows) trace.Note("  + " + row);
        if (!result.InsertedTreatmentRow)
            trace.Note($"⛔ KHONG co dong 処置 nao vao luoi cho {trtCd}/{trtSb} — dung doc " +
                       "comment cua luot nay, tien de chua thanh " +
                       "(xem CascadeMeasure.InsertedTreatmentRow). Hop thoai dang mo: " +
                       _flow.DescribeDialogs());
        trace.Shot($"sau-khi-chot-{trtCd}-{trtSb}");
        return result;
    }

    /// <summary>
    /// Trả lời mọi hộp thoại đang xếp hàng cho tới khi im lặng <paramref name="nextTimeout"/>.
    ///
    /// <para>Deadline NGẮN theo F2. Nhịp đầu dài hơn vì hộp thoại còn phải bung; các nhịp sau
    /// ngắn vì câu trả lời 「không còn hộp nào nữa」 cũng cần đến sớm — mà đó thường CHÍNH LÀ
    /// kết luận của ca đo (「exit_flg đã cắt phần đuôi」).</para>
    /// </summary>
    private void DrainDialogs(List<DialogStep> steps, Plan plan,
                              TimeSpan firstTimeout, TimeSpan nextTimeout, TestTrace trace)
    {
        for (var i = 0; steps.Count < MaxDialogs; i++)
        {
            var dialog = Waits.TryFor(() => _flow.OpenDialogs().FirstOrDefault(),
                                      i == 0 ? firstTimeout : nextTimeout);
            if (dialog is null) return;

            var step = Answer(dialog, steps.Count + 1, plan, trace);
            steps.Add(step);
            trace.Note("  » " + step);

            // Không đóng được thì DỪNG HẲN — đi tiếp là mọi assert sau đó đổ oan cho app (F19).
            //
            // ⚠️ Đừng tin một mình `Uia.IsOnScreen`: nó đọc `BoundingRectangle` của một con trỏ
            // cửa sổ có thể đã chết, và với MessageBox vừa bị PostMessage(BM_CLICK) đóng thì con
            // trỏ đó còn "sống" thêm một nhịp. Hỏi lại danh sách hộp thoại ĐANG MỞ, và chỉ dừng
            // khi hộp thoại đứng đầu vẫn mang ĐÚNG nội dung vừa trả lời — nếu là hộp thoại KHÁC
            // thì đó là bước tiếp theo của cascade, phải đi tiếp.
            var stillThere = Waits.TryFor(
                () => _flow.OpenDialogs().FirstOrDefault(w => SameDialog(step, w)),
                TimeSpan.FromSeconds(3));

            if (stillThere is not null)
            {
                trace.Note($"⛔ hop thoai {step.Form} KHONG dong sau khi tra loi — DUNG vong lap. " +
                           $"Nut that: [{PackDialogs.ButtonNames(stillThere)}]");
                trace.Shot($"hop-thoai-{step.Form}-khong-dong");
                return;
            }
        }

        trace.Note($"⛔ da cham tran {MaxDialogs} hop thoai trong MOT cu nhap — dung lai. " +
                   "Rat co the mot hop thoai bung di bung lai; doc anh.");
    }

    /// <summary>
    /// Cửa sổ đang mở có đúng là cái vừa trả lời không — so bằng <b>nội dung</b>, không bằng
    /// con trỏ cửa sổ.
    ///
    /// <para>Ba form pack nhận ra bằng <c>AutomationId</c> + nhãn hướng dẫn: cùng một
    /// <c>frm203048</c> nhưng hướng dẫn khác nhau là <b>hai pack khác nhau</b> (I017-1 và
    /// I017-3), phải đi tiếp chứ không được coi là 「chưa đóng」. MessageBox thì so nguyên văn
    /// thân hộp thoại.</para>
    /// </summary>
    private static bool SameDialog(DialogStep step, Window open)
    {
        try
        {
            var form = PackDialogs.Identify(open);
            if (form.Length > 0)
                return form == step.Form && Txt.Same(PackDialogs.Guidance(open), step.Guidance);

            return step.Rows.Count > 0 && step.Rows[0].Length > 0 &&
                   Txt.Same(Dialogs.TextOf(open), step.Rows[0]);
        }
        catch { return false; }   // cửa sổ vừa đóng giữa chừng ⇒ không phải 「chưa đóng」
    }

    /// <summary>Đọc rồi trả lời MỘT hộp thoại — ghi nguyên văn trước khi đụng vào (F17).</summary>
    private DialogStep Answer(Window dialog, int order, Plan plan, TestTrace trace)
    {
        var form = PackDialogs.Identify(dialog);
        var title = Txt.N(Uia.NameOf(dialog));
        var guidance = form.Length > 0 ? PackDialogs.Guidance(dialog) : "";
        var rows = new List<string>();
        string answered;

        trace.Shot($"hop-thoai-{order}-{(form.Length > 0 ? form : "msgbox")}");

        switch (form)
        {
            case PackDialogs.SelectFormId:
            {
                var selectRows = PackDialogs.SelectRows(dialog);
                rows.AddRange(selectRows.Select(r => $"番号{r.SeqNo}:{r.Text}"));

                // Chỉ frm203018 ĐẦU TIÊN được chọn theo kế hoạch; cái sau huỷ và ghi lại.
                var alreadyPicked = plan.PickSeqNo is null;
                if (!alreadyPicked && plan.PickSeqNo is { } seq)
                {
                    answered = PackDialogs.PickSeq(dialog, seq, trace)
                        ? $"chọn 番号 {seq}"
                        : $"KHÔNG chọn được 番号 {seq} (xem trace)";
                }
                else
                {
                    answered = PackDialogs.Back(dialog, trace) ? "戻る (huỷ)" : "戻る KHÔNG ăn";
                }
                break;
            }

            case PackDialogs.UserCommentFormId:
                answered = plan.UserComment is { } text
                    ? (PackDialogs.TypeAndConfirm(dialog, text, trace) ? $"gõ 「{text}」 + 確定" : "確定 KHÔNG ăn")
                    : (PackDialogs.Back(dialog, trace) ? "戻る (huỷ)" : "戻る KHÔNG ăn");
                break;

            case PackDialogs.ParamFormId:
                answered = plan.ConfirmParam
                    ? (PackDialogs.ConfirmParam(dialog, trace) ? "確定 (ngày hôm nay)" : "確定 KHÔNG ăn")
                    : (PackDialogs.Back(dialog, trace) ? "戻る (huỷ)" : "戻る KHÔNG ăn");
                break;

            default:
            {
                // MessageBox nghiệp vụ. GHI NGUYÊN VĂN rồi mới dẹp, và ĐỌC BẰNG WIN32 (F17):
                // Dialogs.Open (đường UIA) có lúc mù hẳn với hộp thoại shell.
                string body;
                try { body = Txt.N(Dialogs.TextOf(dialog)); }
                catch { body = ""; }
                if (body.Length == 0) body = MsgBoxWin32.TextOfAll(_app.ProcessId);
                rows.Add(body);
                form = "#32770";

                if (Txt.Has(body, SigaToothFlow.CrashDialogFragment))
                {
                    // ⛔ App chết thì bấm Continue để giữ app sống mà chụp tiếp, rồi thôi.
                    trace.Note("⛔ APP BUNG UNHANDLED EXCEPTION — giu app song de chup, dung di tiep.");
                    Dialogs.ClickButton(dialog, "Continue");
                    answered = "Continue (app crash)";
                    break;
                }

                // ⛔ KHÔNG BAO GIỜ 「はい」 ở đây: dirty gate 「保存しますか」 có はい =
                // modSave.SaveData — xoá sạch rồi chèn lại TOÀN BỘ 処置行 của tháng.
                if (Txt.Has(body, SigaToothFlow.DirtyGateFragment))
                    trace.Note("⛔ gap dirty gate 「保存しますか」 GIUA luot nhap — tra loi 「いいえ」. " +
                               "Nghia la co mot phim da roi xuong form truoc do (ESC? F10?).");

                var hwnd = dialog.Properties.NativeWindowHandle.ValueOrDefault;
                // F18: PostMessage(BM_CLICK) trả về NGAY; InvokePattern có thể không bao giờ
                // trả về khi MessageBox nằm trong một form modal.
                var clicked = hwnd != IntPtr.Zero &&
                              MsgBoxWin32.ClickButton(hwnd, "いいえ", "No", "OK", "キャンセル", "Cancel");
                if (!clicked) clicked = Dialogs.ClickButton(dialog, "いいえ", "No", "OK", "キャンセル", "Cancel");
                if (!clicked)
                {
                    var captions = hwnd != IntPtr.Zero
                        ? string.Join(",", MsgBoxWin32.ButtonCaptions(hwnd))
                        : PackDialogs.ButtonNames(dialog);
                    trace.Note($"KHONG co nut an toan nao de dep hop thoai 「{body}」 — de nguyen. " +
                               $"Nut that: [{captions}]");
                    answered = $"KHÔNG dẹp được (nút thật: {captions})";
                    break;
                }
                Waits.TryUntil(() => !Uia.IsOnScreen(dialog), TimeSpan.FromSeconds(6));
                answered = "いいえ/No/OK";
                break;
            }
        }

        return new DialogStep(order, form.Length > 0 ? form : "?", title, guidance, rows, answered);
    }
}
