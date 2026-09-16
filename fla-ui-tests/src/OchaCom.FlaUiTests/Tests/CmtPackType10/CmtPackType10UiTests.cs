using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.CmtPackType10;

/// <summary>
/// 摘要コメントパック type 10 — <b>số đo trên giao diện thật</b>, viết SAU khi
/// <see cref="CmtPackProbeTests"/> đã chụp ảnh và chốt hành vi (F1).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÂU HỎI ĐANG ĐO — §4.6 của <c>cmt-pack-type10-remaining.md</c>
/// ═══════════════════════════════════════════════════════════════════════════════
/// <b>WinForm có tính những dòng CHƯA F9 登録 khi tra lịch sử 算定 không?</b>
///
/// <para>Câu trả lời quyết định cả hợp đồng API của vế web: BE hiện chỉ có
/// <c>GetLastTrtDtAsync</c> — đọc <b>dữ liệu đã lưu</b>. Nếu WinForm cũng đọc cả lưới đang
/// mở thì mọi condition tra trong CÙNG NGÀY/CÙNG THÁNG sẽ lệch, và FE phải gửi kèm các
/// dòng chưa lưu (đã có tiền lệ: <c>dayPlagueTreats</c> của cổng P処).</para>
///
/// <para><b>Chỗ đo:</b> <c>cmtToku</c> (CmtAuto.cs:3521-3546) — điều kiện 「歯清-特」 của pack
/// <c>I030-2</c>. Nó gọi:</para>
/// <code>
///   CommonChk.getTreatData(ModSave.trtDataList,   ← dữ liệu ĐÃ LƯU
///                          CommonInp.getMainDt(), ← LƯỚI ĐANG MỞ (gồm dòng chưa F9)
///                          kvToku,                ← 105/0,1,2,3,6,7 + 508/0,1,6
///                          DateTime.Parse(strDt), ← từ 算定日
///                          DateTime.Parse(strDt)) ← tới 算定日  ⇒ ĐÚNG MỘT NGÀY
/// </code>
/// Cửa sổ một ngày là thứ làm phép đo <b>không thể chối cãi</b>: chỉ có đúng một cách để
/// một dòng 105 của ngày đó tồn tại mà chưa nằm trong DB — chính là dòng testcase vừa gõ.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐO ĐƯỢC 2026-09-16 · bệnh nhân 10 · 診療日 2026-08-03 · patched MENU.exe
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TC10-4 (đối chứng)  gõ 歯清 khi lưới KHÔNG có 105 nào
///                       → 2 dòng comment: 「初回(歯清)」, 「ポリッシングブラシ+研磨用ペースト」
///                       → KHÔNG có 「歯科診療特別対応加算算定後」
///
///   TC10-5              gõ 105/2 (月計 +250, KHÔNG F9) rồi gõ 歯清
///                       → 3 dòng comment, THÊM ĐÚNG 「歯科診療特別対応加算算定後」
/// </code>
/// <b>⇒ WinForm ĐỌC CẢ DÒNG CHƯA LƯU.</b> Vế web phải gửi kèm chúng cho mọi condition có
/// cửa sổ chạm tới ngày/tháng hiện tại.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB — và vì sao ở đây KHÔNG CẦN CỜ
/// ═══════════════════════════════════════════════════════════════════════════════
/// Cả hai ca đều <b>không bấm F9 登録</b>, không seed, không đụng <c>SIGA</c>. Mọi dòng chỉ
/// nằm trong lưới đang mở; <c>runner-task.ps1</c> kill <c>MENU.exe</c> sau mỗi lượt nên
/// chúng biến mất cùng tiến trình.
///
/// <para>⚠️ Dọn tay thì <b>đừng bấm 「はい」</b> ở 「処置データは、変更されています。保存
/// しますか？」 — <c>modSave.SaveData</c> xoá sạch rồi chèn lại TOÀN BỘ 処置行 của tháng.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY TỪNG LÔ
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-cmt-pack-type10.ps1 -Ui -Case TC10_4      ← đối chứng, app sạch
///   .\run-cmt-pack-type10.ps1 -Ui -Case TC10_5      ← phép đo, app sạch
/// </code>
/// <b>Chạy RIÊNG từng ca</b> (F7). Chạy chung một lượt thì TC10-5 gõ 歯清 lần thứ hai trong
/// cùng ngày — app có thể chặn, và khi đó tiền đề của phép đo không thành. Hai ca đều tự
/// kiểm tiền đề trước khi kết luận nên chạy chung cũng không cho kết quả sai, chỉ cho
/// <c>Inconclusive</c>.
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(720_000)]
public sealed class CmtPackType10UiTests : UiTestBase
{
    private CmtPackDb? _db;
    private SigaToothFlow _flow = null!;
    private CmtPackOps _ops = null!;

    /// <summary>Câu mà pack I030-2 xuất ra (<c>MST_COMMENT</c> 820100779).</summary>
    private const string TokuComment = "歯科診療特別対応加算算定後";

    /// <summary>Câu của pack I030 (前回実施年月) khi CHƯA từng算定 — mốc 「máy chạy thật」.</summary>
    private const string SiseiFirstTimeComment = "初回（歯清）";

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>
    /// Không để <see cref="NuisanceDialogWatcher"/> trả lời hộ bất cứ câu nào.
    ///
    /// <para>Ca này ĐANG ĐO chính chuỗi hộp thoại sinh ra quanh cú chốt; watcher bấm
    /// 「いいえ」 sau lưng thì 加算 không vào lưới và testcase kết luận ngược — xanh sai,
    /// không dấu hiệu (F19).</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void UiOneTimeSetUp()
    {
        _db = CmtPackDb.CreateOrNull(Settings);
        if (_db?.ProbeError() is { } err)
        {
            Log($"⚠️ không đọc được SQL Server ({err}) — vẫn chạy, chỉ thiếu phần in master.");
            _db = null;
        }
    }

    [SetUp]
    public void UiSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new CmtPackOps(_flow);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC10-4 — ĐỐI CHỨNG
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TC10-4 — 歯清 khi lưới KHÔNG có 加算 nào: pack chạy, nhưng KHÔNG ra câu 歯清-特")]
    public void TC10_4_Sisei_Without_Toku_Row_Has_No_Toku_Comment()
    {
        using var trace = TestTrace.Begin();

        var before = _ops.DataRows();
        var existingToku = before.Count(r => AutoSanteiOps.Norm(r.Ryo).Contains("歯科診療特別対応加算"));
        Log($"lưới lúc mở màn: {before.Count} dòng dữ liệu, trong đó {existingToku} dòng 特別対応加算.");

        if (existingToku > 0)
            Assert.Inconclusive(
                $"Lưới đã sẵn {existingToku} dòng 歯科診療特別対応加算 ⇒ ca ĐỐI CHỨNG không còn là " +
                "đối chứng. Kill MENU.exe rồi chạy lại ca này MỘT MÌNH " +
                "(.\\run-cmt-pack-type10.ps1 -Ui -Case TC10_4).");

        var below = _ops.LastRowOfDay(TrtDate.Day, trace);
        Assert.That(below, Is.Not.Null,
            $"Lưới không có dòng nào của ngày {TrtDate:yyyy-MM-dd} để chèn xuống dưới ⇒ HARNESS/DỮ " +
            "LIỆU hỏng, không phải app: đổi patient.trtDate sang một ngày CÓ 処置 đã lưu.");

        var m = _ops.Commit(below!, CmtPackMasterTests.SiseiTrtCd, CmtPackMasterTests.SiseiTrtSb, trace);

        Assert.That(m, Is.Not.Null, "Không đưa được ô 点 về コードモード ⇒ HARNESS hỏng (xem _trace.log).");
        Log("đo được: " + m);
        foreach (var t in m!.CommentTexts) Log($"   comment 「{t}」");
        Log("hộp thoại gặp phải: " +
            (m.DialogsSeen.Count == 0 ? "(không)" : string.Join(" / ", m.DialogsSeen)));

        Assert.Multiple(() =>
        {
            Assert.That(m.InsertedTreatmentRow, Is.True,
                "Dòng 歯清 KHÔNG vào được lưới ⇒ tiền đề chưa thành, đừng đọc phần comment. " +
                "Thường là cú double-click rơi vào dòng 処置選択 ngoài khung nhìn (F10) hoặc còn " +
                "hộp thoại chắn: " + string.Join(" / ", m.DialogsSeen));

            // Mốc 「máy chạy thật」: pack type 10 I030 (前回実施年月, ĐÃ port) phải ra câu 初回.
            // Không có dòng này thì con số 0 ở assert dưới vô nghĩa — im lặng vì máy không chạy
            // khác hẳn im lặng vì điều kiện không thoả.
            Assert.That(m.CountComments(SiseiFirstTimeComment), Is.EqualTo(1),
                $"Không thấy câu 「{SiseiFirstTimeComment}」 của pack I030 (前回実施年月, CmtAuto.cs:3150). " +
                "Bệnh nhân test chưa từng算定 歯清 nên nhánh 「chưa có lần trước」 PHẢI chạy. Thiếu nó " +
                "⇒ cả đường Chk_CmtAuto không chạy, và mọi phép đếm khác của ca này vô nghĩa. " +
                "Comment đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");

            Assert.That(m.CountComments(TokuComment), Is.Zero,
                $"Lưới KHÔNG có dòng 105/508 nào trong ngày mà câu 「{TokuComment}」 vẫn hiện ⇒ " +
                "cmtToku (CmtAuto.cs:3521-3546) đang khớp với thứ gì đó ngoài danh sách kvToku, " +
                "hoặc cửa sổ [算定日, 算定日] rộng hơn ta tưởng. Đọc lại _trace.log + ảnh trước khi " +
                "sửa vế web.");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC10-5 — PHÉP ĐO
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC10-5 — 加算 CHƯA F9 vẫn được tính: gõ 105/2 rồi 歯清 ⇒ ra câu 歯清-特")]
    public void TC10_5_Unsaved_Row_Is_Counted_By_GetTreatData()
    {
        using var trace = TestTrace.Begin();

        if (_db is not null)
        {
            // Vế 「đã lưu」 phải RỖNG trong ngày đó, nếu không thì comment có hai cách giải
            // thích và phép đo không phân biệt được (F21, và 「seed đối chứng」).
            var saved = _db.SavedRows(PatNo,
                [(CmtPackProbeTests.TokuTrtCd, 0), (CmtPackProbeTests.TokuTrtCd, 1),
                 (CmtPackProbeTests.TokuTrtCd, 2), (CmtPackProbeTests.TokuTrtCd, 3),
                 (CmtPackProbeTests.TokuTrtCd, 6), (CmtPackProbeTests.TokuTrtCd, 7),
                 (508, 0), (508, 1), (508, 6)],
                TrtDate, TrtDate);
            Log($"dòng 105/508 ĐÃ LƯU của ngày {TrtDate:yyyy-MM-dd}: {saved.Count}");
            foreach (var r in saved) Log("   " + r);

            Assert.That(saved, Is.Empty,
                $"TRNTRN đã có sẵn {saved.Count} dòng 加算 của đúng ngày test ⇒ câu 「{TokuComment}」 " +
                "có thể đến từ DB chứ không từ dòng chưa lưu, và phép đo mất ý nghĩa. " +
                "Chọn patient/trtDate khác, đừng sửa assert.");
        }

        // ── vòng 1: gõ 加算, KHÔNG F9 ────────────────────────────────────────
        var below = _ops.LastRowOfDay(TrtDate.Day, trace);
        Assert.That(below, Is.Not.Null,
            $"Lưới không có dòng nào của ngày {TrtDate:yyyy-MM-dd} ⇒ HARNESS/DỮ LIỆU hỏng.");

        var toku = _ops.Commit(below!, CmtPackProbeTests.TokuTrtCd, CmtPackProbeTests.TokuSyosinSb, trace);
        Assert.That(toku, Is.Not.Null, "Không đưa được ô 点 về コードモード ⇒ HARNESS hỏng.");
        Log("vòng 1 (105/2): " + toku);

        Assert.That(toku!.InsertedTreatmentRow, Is.True,
            $"Dòng {CmtPackProbeTests.TokuTrtCd}/{CmtPackProbeTests.TokuSyosinSb} 特２(初診) KHÔNG vào " +
            "được lưới ⇒ TIỀN ĐỀ chưa thành. Đỏ ở đây là HARNESS/app chặn cú nhập, KHÔNG phải câu " +
            "trả lời cho câu hỏi 「dòng chưa lưu có được tính không」 — đừng đọc tiếp. " +
            "Hộp thoại: " + string.Join(" / ", toku.DialogsSeen));

        // ── vòng 2: gõ 歯清 ──────────────────────────────────────────────────
        var below2 = _ops.LastRowOfDay(TrtDate.Day, trace);
        Assert.That(below2, Is.Not.Null, "Mất dòng mốc sau vòng 1 ⇒ HARNESS hỏng, đọc ảnh.");

        var sisei = _ops.Commit(below2!, CmtPackMasterTests.SiseiTrtCd, CmtPackMasterTests.SiseiTrtSb, trace);
        Assert.That(sisei, Is.Not.Null, "Không gõ được 歯清 ⇒ HARNESS hỏng.");
        Log("vòng 2 (108/2): " + sisei);
        foreach (var t in sisei!.CommentTexts) Log($"   comment 「{t}」");
        Log("hộp thoại gặp phải: " +
            (sisei.DialogsSeen.Count == 0 ? "(không)" : string.Join(" / ", sisei.DialogsSeen)));

        Assert.That(sisei.InsertedTreatmentRow, Is.True,
            "Dòng 歯清 KHÔNG vào được lưới ⇒ TIỀN ĐỀ chưa thành (rất có thể app chặn vì ngày này " +
            "đã có 歯清 từ ca TC10-4 — chạy RIÊNG từng ca, xem phần đầu file). " +
            "Hộp thoại: " + string.Join(" / ", sisei.DialogsSeen));

        // ── kết luận ────────────────────────────────────────────────────────
        // ⛔ ĐỪNG SỬA assert này cho 「hợp trực giác」. Đây là SỐ ĐO, không phải suy luận:
        //    dòng 105 duy nhất của ngày đó nằm trong lưới và CHƯA F9, mà WinForm vẫn xuất
        //    câu 摘要コメント ⇒ getTreatData đọc tham số _tblRegiInp (lưới đang mở), đúng như
        //    CommonChk.cs:653-753. Đỏ ở đây nghĩa là WinForm ĐÃ ĐỔI HÀNH VI — và khi đó vế
        //    web phải đổi theo, chứ không phải sửa con số ở đây.
        Assert.That(sisei.CountComments(TokuComment), Is.EqualTo(1),
            $"Sau khi gõ 105/2 (CHƯA F9) rồi gõ 歯清, phải có ĐÚNG MỘT dòng 「{TokuComment}」 " +
            $"(pack I030-2, cmtToku CmtAuto.cs:3521-3546, cửa sổ [算定日, 算定日]).\n" +
            $"  · đối chứng TC10-4 (không có 105): 0 dòng — đo 2026-09-16\n" +
            $"  · lần này đọc được: [{string.Join(" / ", sisei.CommentTexts)}]\n" +
            "Số 0 ở đây ⇒ WinForm KHÔNG còn tính dòng chưa lưu ⇒ hợp đồng API của vế web đổi " +
            "hẳn (GetLastTrtDtAsync một mình là đủ). Số > 1 ⇒ pack chạy hai lần, xem thứ tự " +
            "seq_no ở TC10-2.");

        Log("");
        Log("KẾT LUẬN (đo, không suy luận): WinForm tính CẢ dòng chưa F9 khi tra lịch sử 算定. " +
            "⇒ vế web: mọi condition type 10 có cửa sổ chạm tới ngày/tháng hiện tại phải nhận " +
            "thêm các dòng chưa lưu từ FE — GetLastTrtDtAsync (chỉ đọc DB) là THIẾU. " +
            "Tiền lệ đã có: dayPlagueTreats của cổng P処.");
    }
}
