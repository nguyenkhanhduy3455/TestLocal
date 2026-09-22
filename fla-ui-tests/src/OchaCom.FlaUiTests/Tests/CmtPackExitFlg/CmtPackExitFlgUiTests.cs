using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// <c>exit_flg</c> — <b>số đo trên giao diện thật</b>. Sáu ca, mỗi ca MỘT lượt chạy riêng.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÂU HỎI — §A1 / §A2 của <c>userapp/fla-ui-todo-cmt-pack.md</c>
/// ═══════════════════════════════════════════════════════════════════════════════
/// <b>Một 候補 có <c>exit_flg</c> trên hộp thoại 摘要選択 có cắt được các pack phía sau không,
/// và cắt theo ĐÚNG dòng người dùng chọn?</b>
///
/// <para>WinForm nói CÓ: <c>frm203018.defData</c> đặt <c>data.cnt = exit_flg ? "1" : "0"</c>
/// cho <b>dòng được chọn</b> (frm203018.cs:488); <c>prgCmtAuto</c> đọc nó
/// (<c>if (data.cnt == "1") exit_flg = true</c>, CmtAuto.cs:295-299) rồi
/// <c>if (exit_flg) break</c> (CmtAuto.cs:917-919).</para>
///
/// <para><b>Vế web hiện tại</b> (đọc trên <c>ochacom-saas</c> nhánh
/// <c>fix/inp-pack-tekiyou-dialog</c>): <c>cascadePackAlwaysExits</c> chỉ dừng khi <b>MỌI</b>
/// 候補 đều <c>exit_flg</c>. <c>I017</c> có 8/12 ⇒ điều kiện đó không bao giờ đúng ⇒ web hỏi
/// tiếp cả ba pack đuôi kể cả khi người dùng chọn 番号 1. Sáu ca dưới đây là số đo để chốt
/// việc sửa — <b>đo trước, sửa sau</b> (F1), vì bản sửa là một thay đổi cấu trúc: vòng lặp
/// cascade phải ĐỢI người dùng chọn xong hộp thoại rồi mới quyết có chạy pack sau.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// SÁU CA — CHẠY RIÊNG TỪNG CA (F7)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_5    195/0 chọn 番号 1  (イ, exit=t)  → PHẢI dừng
///   .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_6    195/0 chọn 番号 7  (ト, exit=f)  → chạy tiếp
///   .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_7    195/0 chọn 番号 10 (ヌ, exit=f)  → chạy tiếp
///   .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_8    195/0 bấm 戻る               → chạy tiếp
///   .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_9    108/4 chọn 番号 1  (１回目,t)   → PHẢI dừng
///   .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_10   108/4 bấm 戻る               → chạy tiếp
/// </code>
///
/// <para><b>Chạy chung một lượt là hỏng tiền đề</b>: hai ca cùng gõ 195/0 vào cùng một ngày,
/// và <c>once_day</c>/<c>once_month</c> của pack (<c>getTreatDataPackCd</c>, CmtAuto.cs:80-96)
/// đọc cả lưới đang mở — lượt thứ hai có thể bị BỎ QUA hoàn toàn mà không báo gì. Mọi ca đều
/// tự kiểm tiền đề nên chạy chung cho <c>Inconclusive</c> chứ không cho kết quả sai, nhưng
/// đừng mất một lượt vì chuyện đó.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// Không ca nào bấm <b>F9 登録</b>, không ca nào seed. Mọi dòng chỉ nằm trong lưới đang mở và
/// biến mất khi <c>runner-task.ps1</c> kill <c>MENU.exe</c>. Vì thế luồng này KHÔNG có cờ
/// <c>allowSave</c>.
///
/// <para>⚠️ Dọn tay thì <b>đừng bấm 「はい」</b> ở 「処置データは、変更されています。保存しますか？」
/// — <c>modSave.SaveData</c> xoá sạch rồi chèn lại TOÀN BỘ 処置行 của tháng.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐO ĐƯỢC 2026-09-17 · bệnh nhân 10 · 診療月 08年08月 · ngày 3 · 6/6 xanh
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TCX-5  195/0 chọn 番号 1 (イ)    → 1 hộp thoại. Lưới: 「イ 顎関節治療用装置」
///                                       KHÔNG frm203048, KHÔNG frm203019     ⇒ CASCADE BỊ CẮT
///
///   TCX-6  195/0 chọn 番号 7 (ト)    → 4 hộp thoại: frm203018 → frm203048(手術予定年月日)
///                                       → frm203019(保険医療機関名) → frm203048(外傷受傷年月日)
///                                       Lưới: 「ト 気管内挿管…」 · 「口腔内装置手術予定年月日 令和08年09月17日」
///                                             · 「TESTCMT」 · 「外傷受傷年月日 令和08年09月17日」
///
///   TCX-7  195/0 chọn 番号 10 (ヌ)   → GIỐNG HỆT TCX-6 (4 hộp thoại, cùng thứ tự)
///                                       ⇒ I017-1/2/3 KHÔNG có điều kiện riêng theo 候補
///
///   TCX-8  195/0 bấm 戻る            → VẪN 4 hộp thoại, chỉ mất dòng comment của I017
///                                       ⇒ HUỶ KHÔNG PHẢI LÀ DỪNG
///
///   TCX-9  108/5 chọn 番号 1 (１回目) → 2 hộp thoại: frm203019(患者が入院している保険医療機関名)
///                                       → frm203018. B014-3 該当する病名 KHÔNG mở ⇒ CẮT
///
///   TCX-10 108/5 bấm 戻る            → 3 hộp thoại, B014-3 該当する病名 CÓ mở
/// </code>
///
/// <para><b>Ba thứ đo được mà ghi chú gốc chưa có:</b></para>
/// <list type="number">
///   <item><b>Chọn ト (番号 7) VẪN ra 外傷受傷年月日.</b> Câu hỏi bỏ ngỏ ở §A1 mục 2 đã có đáp
///     án: <c>I017-1/2/3</c> không gắn với 候補 nào cả, chúng chỉ chạy-hay-không theo
///     <c>exit_flg</c>. TCX-6 và TCX-7 cho ra <b>cùng một chuỗi bốn hộp thoại</b>.</item>
///   <item><b>Dòng của pack type 90 KHÔNG có tiền tố <c>com_nm</c></b> — nó mang đúng chuỗi
///     người dùng gõ (<c>frm203019.cs:199-213</c>). Chuỗi 「…保険医療機関名；」 chỉ hiện ở nhãn
///     hướng dẫn. Vế web đừng ghép tiền tố vào dòng lưới.</item>
///   <item><b>frm203048 chốt NGÀY HÔM NAY</b>, không phải 算定日: lưới ra
///     「…令和08年09月17日」 trong khi 算定日 là 08年08月03日 (<c>frm203048.cs:148</c>
///     <c>dtUpdate.setDate(DateTime.Today)</c>).</item>
/// </list>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(720_000)]
public sealed class CmtPackExitFlgUiTests : UiTestBase
{
    private CmtPackDb? _db;
    private SigaToothFlow _flow = null!;
    private CmtPackCascade _cascade = null!;

    // ── Chuỗi mà từng pack xuất ra (MST_COMMENT, đọc 2026-09-17) ────────────

    /// <summary>候補 番号 1 của I017 — <c>com_cd 820100339</c>.</summary>
    private const string OralRow1Comment = "顎関節治療用装置";

    /// <summary>候補 番号 7 — <c>com_cd 820100345</c>, dòng DUY NHẤT dẫn tới 手術予定年月日.</summary>
    private const string OralRow7Comment = "気管内挿管時の歯の保護";

    /// <summary>
    /// 候補 番号 10 — <c>com_cd 820101234</c>, phân biệt với 番号 11 (運動時).
    ///
    /// <para>⚠️ <b>Chỉ lấy MẨU NGẮN, đừng lấy nguyên văn.</b> Đo được 2026-09-17 (TCX-7 lượt
    /// đầu): ô lưới đọc ra 「ヌ 外傷歯の保護…口腔内装置(日常生活時<b> </b>の外傷歯の保護を目的と
    /// するもの)」 — có một <b>khoảng trắng chen vào</b> giữa 「日常生活時」 và 「の外傷歯」 mà
    /// master không có. Assert 「nguyên văn」 trên chuỗi đã qua tay UI là xanh giả theo chiều
    /// này và đỏ oan theo chiều kia.</para>
    /// </summary>
    private const string OralRow10Comment = "日常生活時";

    /// <summary>pack I017-1 (type 50) — <c>com_cd1 850100394</c>.</summary>
    private const string SurgeryDateComment = "口腔内装置手術予定年月日";

    /// <summary>
    /// pack I017-2 (type 90) — <c>com_cd1 830100462</c> 「口腔内装置手術を行う保険医療機関名；」.
    ///
    /// <para>⚠️ <b>Chuỗi này chỉ hiện trên NHÃN HƯỚNG DẪN của hộp thoại, KHÔNG vào lưới.</b>
    /// Đo được 2026-09-17 (TCX-6): dòng rơi xuống lưới là <b>đúng cái người dùng gõ</b>,
    /// không có tiền tố <c>com_nm</c> nào. <c>frm203019.setPacData</c> đặt
    /// <c>data.trtNm = _strBui + trtNm</c> với <c>trtNm</c> = <c>txtChiryo.Text.Trim()</c>
    /// (frm203019.cs:199-213) — <c>_param.com_cd</c> chỉ đi vào <c>freeWd</c>, không vào chữ.</para>
    ///
    /// <para>Vì thế mốc kiểm của pack type 90 là <see cref="CmtPackCascade.UserCommentFill"/>,
    /// còn chuỗi này dùng để nhận ra ĐÚNG hộp thoại qua <c>DialogStep.Guidance</c>.</para>
    /// </summary>
    private const string HospitalNameGuidance = "保険医療機関名";

    /// <summary>pack I017-3 (type 50) — <c>com_cd1 850190274</c>.</summary>
    private const string TraumaDateComment = "外傷受傷年月日";

    /// <summary>
    /// Nhãn hướng dẫn (<c>remarks</c>) của pack B014-1 (type 90).
    ///
    /// <para>⚠️ B014-1 và B014-3 <b>đều là type 90</b> ⇒ dòng cả hai đẩy xuống lưới là ĐÚNG
    /// chuỗi người dùng gõ (frm203019.cs:199-213), tức <b>giống hệt nhau</b>. Không phân biệt
    /// được bằng nội dung dòng — phải phân biệt bằng <b>nhãn hướng dẫn của hộp thoại</b>.</para>
    /// </summary>
    private const string DischargeHospitalGuidance = "患者が入院している保険医療機関名";

    /// <summary>候補 番号 1 của B014-2 — <c>com_cd 820100303</c>, MANG exit_flg.</summary>
    private const string DischargeFirstTimeComment = "１回目";

    /// <summary>Nhãn hướng dẫn của pack B014-3 — hộp thoại PHẢI biến mất ở TCX-9.</summary>
    private const string DischargeDiseaseGuidance = "該当する病名";

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>
    /// Không để <see cref="NuisanceDialogWatcher"/> trả lời hộ bất cứ câu nào.
    ///
    /// <para>Ca này ĐANG ĐO chính chuỗi hộp thoại. Watcher bấm 「いいえ」 sau lưng là ca kết
    /// luận ngược — xanh sai, không dấu hiệu (F19).</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void ExitFlgOneTimeSetUp()
    {
        _db = CmtPackDb.CreateOrNull(Settings);
        if (_db?.ProbeError() is { } err)
        {
            Log($"⚠️ không đọc được SQL Server ({err}) — vẫn chạy, chỉ thiếu phần tự kiểm master.");
            _db = null;
        }
    }

    [SetUp]
    public void ExitFlgSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _cascade = new CmtPackCascade(App, _flow);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-5 … TCX-8 — I017 口腔内装置 (195/0)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TCX-5 — 195/0 chọn 番号 1 (イ 顎関節治療用装置, exit_flg=t): cascade PHẢI dừng ngay")]
    public void TCX_5_OralAppliance_ExitRow_Stops_Cascade()
    {
        using var trace = TestTrace.Begin();
        var m = RunOralAppliance(new CmtPackCascade.Plan(PickSeqNo: 1), trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.CountComments(OralRow1Comment), Is.EqualTo(1),
                $"Phải có đúng MỘT dòng 「{OralRow1Comment}」 — đó là 候補 vừa chọn, và nó chứng minh " +
                "frm203018 đã chốt thật chứ không phải bị huỷ. Số 0 ⇒ cú double-click không ăn " +
                "(F10 — dòng ngoài khung nhìn), đọc _trace.log trước khi đọc tiếp.");

            // ⛔ ĐÂY LÀ PHÉP ĐO. Đừng sửa cho 「hợp trực giác」.
            Assert.That(m.CountDialogs(PackDialogs.ParamFormId), Is.Zero,
                $"Chọn 候補 有 exit_flg (TCX-1 khoá: 番号 1 exit_flg = t) thì prgCmtAuto phải " +
                "`break` NGAY (CmtAuto.cs:917-919) ⇒ pack I017-1 (手術予定年月日, type 50) KHÔNG " +
                $"được mở frm203048. Đang mở {m.CountDialogs(PackDialogs.ParamFormId)} lần.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.CountDialogs(PackDialogs.UserCommentFormId), Is.Zero,
                "Pack I017-2 (保険医療機関名, type 90) cũng nằm sau điểm cắt ⇒ frm203019 KHÔNG " +
                "được mở.\n  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.CountComments(SurgeryDateComment), Is.Zero,
                $"Không được có dòng 「{SurgeryDateComment}」 trong lưới.");
            Assert.That(m.CountComments(CmtPackCascade.UserCommentFill), Is.Zero,
                $"Không được có dòng nào của I017-2 (type 90) — dòng đó mang ĐÚNG chuỗi người " +
                $"dùng gõ 「{CmtPackCascade.UserCommentFill}」 (frm203019.cs:199-213).");
            Assert.That(m.CountComments(TraumaDateComment), Is.Zero,
                $"Không được có dòng 「{TraumaDateComment}」 trong lưới.");
        });

        Log("");
        Log("KẾT LUẬN: exit_flg của 候補 ĐƯỢC CHỌN cắt cascade. ⇒ vế web phải ĐỢI lựa chọn của " +
            "người dùng rồi mới quyết chạy pack sau — `cascadePackAlwaysExits` (chỉ dừng khi MỌI " +
            "候補 đều exit) là SAI với I017 (8/12 候補 exit).");
    }

    [Test, Order(6)]
    [Description("TCX-6 — 195/0 chọn 番号 7 (ト 気管内挿管時, exit_flg=f): ba pack đuôi PHẢI chạy")]
    public void TCX_6_OralAppliance_ContinueRow_Runs_Tail_Packs()
    {
        using var trace = TestTrace.Begin();
        var m = RunOralAppliance(new CmtPackCascade.Plan(PickSeqNo: 7), trace);
        AssertTailPacksRan(m, OralRow7Comment, "番号 7 (ト)");
    }

    [Test, Order(7)]
    [Description("TCX-7 — 195/0 chọn 番号 10 (ヌ 日常生活時, exit_flg=f): đo xem pack I017-3 có điều kiện riêng không")]
    public void TCX_7_OralAppliance_TraumaRow_Runs_Tail_Packs()
    {
        using var trace = TestTrace.Begin();
        var m = RunOralAppliance(new CmtPackCascade.Plan(PickSeqNo: 10), trace);

        // Câu hỏi RIÊNG của ca này (§A1 mục 2 của fla-ui-todo-cmt-pack.md): master KHÔNG có
        // cột nào gắn pack I017-1/2/3 với một 候補 cụ thể — chỉ có exit_flg. Nếu đúng vậy thì
        // 番号 10 (ヌ) và 番号 7 (ト) cho ra CÙNG một bộ ba pack đuôi. So hai ca là câu trả lời.
        AssertTailPacksRan(m, OralRow10Comment, "番号 10 (ヌ 日常生活時)");

        Log("");
        Log("⇒ So TCX-6 (ト) với TCX-7 (ヌ): giống nhau ⇒ pack I017-1/2/3 KHÔNG có điều kiện riêng " +
            "theo 候補, chúng chỉ chạy-hay-không theo exit_flg. Khác nhau ⇒ có một tầng lọc nữa mà " +
            "master không nói — dừng lại, đọc ảnh, đừng port theo suy đoán.");
    }

    [Test, Order(8)]
    [Description("TCX-8 — 195/0 bấm 戻る trên 摘要選択: HUỶ KHÔNG bật exit_flg ⇒ ba pack đuôi VẪN chạy")]
    public void TCX_8_OralAppliance_Cancel_Does_Not_Stop_Cascade()
    {
        using var trace = TestTrace.Begin();
        var m = RunOralAppliance(new CmtPackCascade.Plan(PickSeqNo: null), trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.CountComments(OralRow1Comment), Is.Zero,
                "Bấm 戻る thì frm203018 trả về ComParam = null (fixProc chỉ gán khi outList.Count > 0, " +
                "frm203018.cs:458-466) ⇒ KHÔNG có dòng comment nào của I017 rơi xuống lưới.");

            Assert.That(m.CountDialogs(PackDialogs.ParamFormId) +
                        m.CountDialogs(PackDialogs.UserCommentFormId), Is.GreaterThan(0),
                "Huỷ hộp thoại KHÔNG được coi là 「dừng cascade」: exit_flg chỉ bật bên trong nhánh " +
                "`if (formControl.formParam.ComParam != null)` (CmtAuto.cs:276-299), mà nhánh đó " +
                "không chạy khi người dùng bấm 戻る. Vì thế I017-1/2/3 vẫn phải chạy.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));
        });

        Log("");
        Log("⇒ Đối chứng quan trọng cho vế web: 「người dùng huỷ」 và 「người dùng chọn dòng có " +
            "exit_flg」 là HAI kết quả NGƯỢC NHAU. Bản port nào gộp chúng lại (vd: không chọn gì " +
            "thì bỏ qua luôn phần đuôi) là sai theo chiều còn lại.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-9, TCX-10 — B014 退院時共同指導料 (108/4)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(9)]
    [Description("TCX-9 — 108/4 chọn 番号 1 (１回目, exit_flg=t): B014-3 (該当する病名) KHÔNG được mở")]
    public void TCX_9_DischargeGuidance_ExitRow_Stops_Cascade()
    {
        using var trace = TestTrace.Begin();
        var m = RunDischargeGuidance(new CmtPackCascade.Plan(PickSeqNo: 1), trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.Dialogs.Any(d => d.Form == PackDialogs.UserCommentFormId &&
                                           Txt.Has(d.Guidance, DischargeHospitalGuidance)), Is.True,
                $"Pack B014-1 (seq 1, type 90) chạy TRƯỚC điểm cắt nên hộp thoại 「{DischargeHospitalGuidance}」 " +
                "PHẢI bung. Không có ⇒ cả cascade chưa chạy, đừng đọc tiếp.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.CountComments(DischargeFirstTimeComment), Is.EqualTo(1),
                $"Phải có đúng MỘT dòng 「{DischargeFirstTimeComment}」 — 候補 vừa chọn trên B014-2.");

            // ⛔ PHÉP ĐO — §A2.
            Assert.That(m.Dialogs.Any(d => Txt.Has(d.Guidance, DischargeDiseaseGuidance)), Is.False,
                $"Chọn 候補 「１回目」 (exit_flg = t, TCX-2 khoá) ⇒ `break` (CmtAuto.cs:917-919) ⇒ pack " +
                $"B014-3 KHÔNG chạy ⇒ hộp thoại 「{DischargeDiseaseGuidance}」 KHÔNG được bung.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.CountDialogs(PackDialogs.UserCommentFormId), Is.EqualTo(1),
                "frm203019 chỉ được mở ĐÚNG MỘT lần (B014-1). Hai lần ⇒ B014-3 vẫn chạy ⇒ exit_flg " +
                "không cắt được, và vế web đang làm đúng còn ghi chú §A2 sai.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));
        });
    }

    [Test, Order(10)]
    [Description("TCX-10 — 108/4 bấm 戻る trên B014-2 (đối chứng): B014-3 PHẢI mở")]
    public void TCX_10_DischargeGuidance_Cancel_Runs_Tail_Pack()
    {
        using var trace = TestTrace.Begin();
        var m = RunDischargeGuidance(new CmtPackCascade.Plan(PickSeqNo: null), trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.Dialogs.Any(d => d.Form == PackDialogs.UserCommentFormId &&
                                           Txt.Has(d.Guidance, DischargeHospitalGuidance)), Is.True,
                "B014-1 vẫn phải chạy — nó đứng TRƯỚC hộp thoại bị huỷ.");

            Assert.That(m.CountDialogs(PackDialogs.UserCommentFormId), Is.EqualTo(2),
                "Huỷ B014-2 thì exit_flg không bật ⇒ B014-3 (該当する病名) PHẢI mở ⇒ frm203019 bung " +
                "ĐÚNG HAI lần (B014-1 rồi B014-3). Một lần ⇒ có thứ khác đang cắt cascade mà master " +
                "không nói; đọc ảnh trước khi kết luận.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.Dialogs.Any(d => Txt.Has(d.Guidance, DischargeDiseaseGuidance)), Is.True,
                $"Và hộp thoại 「{DischargeDiseaseGuidance}」 (B014-3) phải bung.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            // Cả B014-1 lẫn B014-3 đều type 90 ⇒ hai dòng giống hệt nhau trên lưới; đếm là đủ.
            Assert.That(m.CountComments(CmtPackCascade.UserCommentFill), Is.EqualTo(2),
                $"Hai pack type 90 ⇒ hai dòng 「{CmtPackCascade.UserCommentFill}」 trong lưới.");
        });

        Log("");
        Log("⇒ Cặp TCX-9 / TCX-10 là phép đo ĐÚNG-SAI của §A2: cùng một 処置, khác nhau đúng " +
            "MỘT thao tác trên hộp thoại, mà phần đuôi cascade thì ngược nhau (F4).");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Khung dùng chung
    // ═════════════════════════════════════════════════════════════════════════

    private CmtPackCascade.CascadeMeasure RunOralAppliance(CmtPackCascade.Plan plan, TestTrace trace) =>
        RunOne(CmtPackExitFlgMasterTests.OralApplianceTrtCd,
               CmtPackExitFlgMasterTests.OralApplianceTrtSb,
               CmtPackExitFlgMasterTests.OralAppliancePackCd, plan, trace);

    private CmtPackCascade.CascadeMeasure RunDischargeGuidance(CmtPackCascade.Plan plan, TestTrace trace) =>
        RunOne(CmtPackExitFlgMasterTests.DischargeGuidanceTrtCd,
               CmtPackExitFlgMasterTests.DischargeGuidanceTrtSb,
               CmtPackExitFlgMasterTests.DischargeListPackCd, plan, trace);

    /// <summary>
    /// Tự kiểm tiền đề → gõ 処置 → trả lời chuỗi hộp thoại → in số đo. Mọi thứ trước
    /// <c>return</c> đều là 「harness/dữ liệu」, không phải kết luận về app.
    /// </summary>
    private CmtPackCascade.CascadeMeasure RunOne(int trtCd, int trtSb, string packCd,
                                                 CmtPackCascade.Plan plan, TestTrace trace)
    {
        // ── tiền đề 1: master ở máy này đúng là cái ta đang đo ──────────────
        if (_db is not null)
        {
            var packs = _db.PacksFor(trtCd, trtSb, TrtDate);
            Log($"master: {trtCd}/{trtSb} ngày {TrtDate:yyyy-MM-dd} kích hoạt {packs.Count} pack");
            foreach (var p in packs) Log($"   {p}");

            Assert.That(packs.Any(p => p.PackCd == packCd), Is.True,
                $"Master của máy này KHÔNG có pack {packCd} cho {trtCd}/{trtSb} ở ngày " +
                $"{TrtDate:yyyy-MM-dd} ⇒ ca này không đo được gì. Chạy fixture master trước " +
                "(.\\run-cmt-pack-exit-flg.ps1) rồi đọc KQ-1.");

            if (plan.PickSeqNo is { } seq)
            {
                var details = _db.Details(packCd, TrtDate);
                var row = details.FirstOrDefault(d => d.SeqNo == seq);
                Assert.That(row, Is.Not.Null,
                    $"{packCd} không có 候補 seq_no = {seq} ⇒ ca này đang chọn một dòng không tồn tại.");
                Log($"候補 sẽ chọn: {row}");
            }
        }

        // ── tiền đề 2: lưới có dòng của ngày test để chèn xuống dưới ────────
        var below = new CmtPackOps(_flow).LastRowOfDay(TrtDate.Day, trace);
        Assert.That(below, Is.Not.Null,
            $"Lưới không có dòng nào của ngày {TrtDate:yyyy-MM-dd} để chèn xuống dưới ⇒ HARNESS/DỮ " +
            "LIỆU hỏng, không phải app: đổi patient.trtDate sang một ngày CÓ 処置 đã lưu.");

        // ── tiền đề 3: ngày đó chưa có sẵn chính mã này trong lưới ──────────
        // once_day / once_month của pack đọc cả lưới đang mở (CmtAuto.cs:80-96): gõ lần hai
        // trong cùng ngày thì pack bị BỎ QUA và ca kết luận 「không có hộp thoại nào」 — đúng
        // cái kết luận mà TCX-5 muốn, nhưng vì lý do hoàn toàn khác. Xanh sai.
        var already = _cascade.Flow.Grid.Snapshot()
            .Count(r => Txt.Int(r.Day) == TrtDate.Day && Txt.Int(r.Ten) is > 0 &&
                        Txt.Has(r.Ryo, TrtNameFragment(trtCd)));
        Log($"lưới đã có {already} dòng mang 「{TrtNameFragment(trtCd)}」 trong ngày {TrtDate.Day}");
        if (already > 0)
            Assert.Inconclusive(
                $"Ngày {TrtDate:yyyy-MM-dd} đã có sẵn {already} dòng của mã {trtCd} ⇒ pack có thể bị " +
                "once_day/once_month bỏ qua và ca này sẽ kết luận NGƯỢC. Kill MENU.exe rồi chạy ca " +
                "này MỘT MÌNH.");

        var m = _cascade.Run(below!, trtCd, trtSb, plan, trace);
        Assert.That(m, Is.Not.Null,
            "Không đưa được ô 点 về コードモード, hoặc Insert không chèn được dòng trống ⇒ HARNESS " +
            "hỏng (đọc _trace.log), KHÔNG phải app thiếu chức năng.");

        Log("đo được: " + m);
        Log("chuỗi hộp thoại:");
        foreach (var d in m!.Dialogs) Log($"   {d}");
        Log("dòng comment rơi xuống lưới:");
        foreach (var t in m.CommentTexts) Log($"   「{t}」");

        Assert.That(m.InsertedTreatmentRow, Is.True,
            $"Dòng {trtCd}/{trtSb} KHÔNG vào được lưới ⇒ TIỀN ĐỀ chưa thành, đừng đọc phần hộp " +
            "thoại/comment. Thường là cú double-click rơi vào dòng 処置選択 ngoài khung nhìn (F10) " +
            "hoặc còn hộp thoại chắn.\n  Hộp thoại: " + string.Join(" | ", m.Dialogs));

        return m;
    }

    /// <summary>Ba pack đuôi của I017 phải chạy đủ — dùng chung cho TCX-6 và TCX-7.</summary>
    private static void AssertTailPacksRan(CmtPackCascade.CascadeMeasure m, string pickedComment, string what)
    {
        Assert.Multiple(() =>
        {
            Assert.That(m.CountComments(pickedComment), Is.EqualTo(1),
                $"Phải có đúng MỘT dòng 「{pickedComment}」 — 候補 vừa chọn. Số 0 ⇒ cú chọn không ăn " +
                "(F10), đừng đọc tiếp.");

            // I017-1 (type 50) và I017-3 (type 50) đều có 「ggg」 ⇒ mỗi cái một frm203048
            // (CmtAuto.cs:701-717 + setPacData case 50, CmtAuto.cs:3705-3713).
            Assert.That(m.CountDialogs(PackDialogs.ParamFormId), Is.EqualTo(2),
                $"Chọn {what} (exit_flg = f, TCX-1 khoá) thì vòng lặp KHÔNG break ⇒ cả I017-1 " +
                "(手術予定年月日) lẫn I017-3 (外傷受傷年月日) đều là pack type 50 có 「ggg」 ⇒ frm203048 " +
                $"phải bung ĐÚNG HAI lần. Đang là {m.CountDialogs(PackDialogs.ParamFormId)}.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.CountDialogs(PackDialogs.UserCommentFormId), Is.EqualTo(1),
                "I017-2 (保険医療機関名, type 90, condition rỗng ⇒ nhánh default trả về " +
                "`new TrtSelOutData()` CmtAuto.cs:825-827) phải mở frm203019 đúng một lần.\n" +
                "  Chuỗi hộp thoại đo được:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.CountComments(SurgeryDateComment), Is.EqualTo(1),
                $"Dòng 「{SurgeryDateComment}」 (I017-1) phải rơi xuống lưới.");
            // ⛔ ĐỪNG đổi lại thành 「口腔内装置手術を行う保険医療機関名」. Đo được 2026-09-17:
            //    dòng của pack type 90 mang ĐÚNG chuỗi người dùng gõ, KHÔNG có tiền tố com_nm
            //    (frm203019.cs:199-213 — com_cd chỉ đi vào freeWd). Lần đỏ đầu tiên của TCX-6
            //    chính là vì kỳ vọng sai ở đây, không phải vì app.
            Assert.That(m.CountComments(CmtPackCascade.UserCommentFill), Is.EqualTo(1),
                $"Dòng của I017-2 (type 90) phải rơi xuống lưới, và nội dung phải là ĐÚNG chuỗi " +
                $"vừa gõ 「{CmtPackCascade.UserCommentFill}」.");
            Assert.That(m.Dialogs.Any(d => d.Form == PackDialogs.UserCommentFormId &&
                                           Txt.Has(d.Guidance, HospitalNameGuidance)), Is.True,
                $"Hộp thoại frm203019 phải là cái của I017-2 — nhận ra bằng nhãn hướng dẫn chứa " +
                $"「{HospitalNameGuidance}」 (remarks của pack, MST_CMT_PACK_DEF).");
            Assert.That(m.CountComments(TraumaDateComment), Is.EqualTo(1),
                $"Dòng 「{TraumaDateComment}」 (I017-3) phải rơi xuống lưới.\n" +
                "⚠️ ĐÂY là câu §A1 mục 2 hỏi: master KHÔNG gắn I017-3 với riêng 候補 ヌ/ル, nên theo " +
                "source thì chọn ト cũng ra 外傷受傷年月日. Đỏ ở đây ⇒ có một tầng lọc nữa; ghi lại " +
                "vào README rồi mới port.");
        });
    }

    /// <summary>Mẩu tên 処置 dùng để đếm dòng đã có sẵn trong lưới — đọc từ MST_TRT266.</summary>
    private static string TrtNameFragment(int trtCd) => trtCd switch
    {
        CmtPackExitFlgMasterTests.OralApplianceTrtCd => "ＯＡｐ",
        CmtPackExitFlgMasterTests.DischargeGuidanceTrtCd => "退院時共同指導料",
        _ => trtCd.ToString(),
    };
}
