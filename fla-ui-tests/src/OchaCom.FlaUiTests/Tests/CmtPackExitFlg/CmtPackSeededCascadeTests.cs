using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.CmtPackType10;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>Chuỗi comment dùng chung cho cụm 歯清 — mẩu NGẮN, xem §3.7 của README.</summary>
internal static class SiseiText
{
    /// <summary>pack <c>I030</c> nhánh 「chưa từng算定」 — <c>com_cd2 820190346</c>.</summary>
    public const string FirstTime = "初回";

    /// <summary>pack <c>I030</c> nhánh 「đã算定」 — <c>com_cd1 850100346</c>, pattern 50 ⇒ ĐỦ NGÀY.</summary>
    public const string PrevDate = "歯清前回実施年月";

    /// <summary>pack <c>I030-2</c> — <c>com_cd 820100779</c>.</summary>
    public const string Toku = "特別対応加算算定後";

    /// <summary>pack <c>I030-2-1</c> VÀ <c>I030-2-3</c> — CÙNG <c>com_cd 820101304</c>.</summary>
    public const string KouKanKyo = "口管強";

    /// <summary>機械的歯面清掃処置.</summary>
    public const int TrtCd = 108;
    public const int TrtSb = 2;
}

/// <summary>
/// §B1 + §B3 — <b>có seed lịch sử 口管強</b>. Ba ca, mỗi ca một lượt chạy riêng.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CASCADE ĐANG ĐO (108/2 歯清, 6 pack, TCX-3 đã khoá thứ tự)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   seq 1  I030      type 10  前回実施年月        exit f
///   seq 3  I030-2    type 10  歯清-特            exit t   ← §B1 cắt ở đây
///   seq 4  I030-2-1  type 10  歯清-口管強(根C)    exit f   ← cần 116/23
///   seq 5  I030-2-2  type 90  歯清-口管強(根C)    exit t   ← cần 116/23; §B3 cắt ở đây
///   seq 6  I030-2-3  type 10  歯清-口管強(Ce)     exit t   ← cần 116/20
///   seq 7  I030-3    type 1   歯清-月１回         exit f
/// </code>
///
/// <para><b>Fixture này seed CẢ 116/23 lẫn 116/20</b> ⇒ nếu cascade KHÔNG bị cắt thì phải ra
/// <b>HAI</b> dòng 「口管強（歯清）」 (một của <c>I030-2-1</c>, một của <c>I030-2-3</c> — cùng
/// <c>com_cd 820101304</c>). Đếm được <b>một</b> ⇒ đã bị cắt ở <c>I030-2-2</c>.</para>
///
/// <para><b>Vế đối chứng nằm ở fixture khác</b>: <see cref="CmtPackCeOnlySeedTests"/> seed
/// <b>chỉ</b> 116/20 ⇒ <c>I030-2-1/2-2</c> im lặng, <c>I030-2-3</c> chạy và ra đúng một dòng
/// 口管強 — chứng minh dòng thứ hai <b>là dòng có thật</b>, không phải thứ không bao giờ tồn tại.
/// Không có ca đối chứng ấy thì 「đếm được 1」 chẳng chứng minh được gì (F20 — seed đổi nhiều
/// cột thì cần seed ĐỐI CHỨNG).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY RIÊNG TỪNG CA (F7)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-cmt-pack-exit-flg.ps1 -Seed -Case TCX_11   §B3 — huỷ frm203019 mà VẪN bị cắt
///   .\run-cmt-pack-exit-flg.ps1 -Seed -Case TCX_12   §B3 — xác nhận frm203019, vẫn bị cắt
///   .\run-cmt-pack-exit-flg.ps1 -Seed -Case TCX_13   §B1 — 歯清-特 cắt từ seq 4 trở đi
///   .\run-cmt-pack-exit-flg.ps1 -SeedCe -Case TCX_14 ĐỐI CHỨNG — I030-2-3 ra được dòng 口管強
/// </code>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(780_000)]
public sealed class CmtPackKonCSeedTests : CmtPackUiTestBase
{
    /// <summary>口管強(根Ｃ管) — kv cứng của <c>cmtKouKanKyo_KonC</c> (CmtAuto.cs:3562).</summary>
    public const int KouKanKyoTrtCd = 116;
    public const int KonCSb = 23;

    /// <summary>口管強(Ｃｅ管) — kv cứng của <c>cmtKouKanKyo_Ce</c> (CmtAuto.cs:3587).</summary>
    public const int CeSb = 20;

    /// <summary>歯科診療特別対応加算２(初診) — một phần tử của <c>kvToku</c> (CmtAuto.cs:3527).</summary>
    public const int TokuTrtCd = 105;
    public const int TokuSb = 2;

    /// <summary>
    /// Seed CẢ HAI mã 口管強 vào đúng ngày test.
    ///
    /// <para>Cửa sổ của cả <c>cmtKouKanKyo_KonC</c> lẫn <c>cmtKouKanKyo_Ce</c> là
    /// <c>[初診日, 算定日]</c> — <b>bao gồm chính ngày算定</b> (CmtAuto.cs:3570, :3596), nên
    /// seed vào đúng ngày test là hợp lệ.</para>
    ///
    /// <para>Hai mã này <b>không gõ tay được</b>: 枝番 20/23 nằm dưới đáy danh sách 処置選択,
    /// ngoài khung nhìn, và cú double-click rơi vào hư không (F10, xem
    /// <c>../CmtPackType10/README.md</c> §3.1). Seed là đường DUY NHẤT hiện có.</para>
    /// </summary>
    protected override IReadOnlyList<SeedRow> SeedRows
    {
        get
        {
            var day = TestSettings.Current.Patient.ResolvedTrtDate.Day;
            return
            [
                new SeedRow(day, KouKanKyoTrtCd, KonCSb, 48, "口管強(根Ｃ管)"),
                new SeedRow(day, KouKanKyoTrtCd, CeSb, 48, "口管強(Ｃｅ管)"),
            ];
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-11 — §B3: huỷ hộp thoại của pack type 90 KHÔNG gỡ được exit_flg
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(11)]
    [Description("TCX-11 (§B3) — 歯清 với lịch sử 口管強: HUỶ frm203019 mà cascade VẪN bị cắt")]
    public void TCX_11_Type90_Sets_ExitFlg_Before_Dialog()
    {
        using var trace = TestTrace.Begin();
        LogMaster(SiseiText.TrtCd, SiseiText.TrtSb);

        // Huỷ mọi hộp thoại — đúng thao tác mà §B3 hỏi.
        var m = RunOn(TrtDate.Day, SiseiText.TrtCd, SiseiText.TrtSb,
                      CmtPackCascade.Plan.CancelAll, trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.CountDialogs(PackDialogs.UserCommentFormId), Is.EqualTo(1),
                "Pack I030-2-2 (type 90, 歯清-口管強(根C)) PHẢI mở frm203019 — lịch sử 116/23 đã " +
                "được seed. Không mở ⇒ seed không tới được app (seed SAU khi app mở? xem F20/F21), " +
                "và cả ca này vô nghĩa.\n  Chuỗi hộp thoại:\n    " + string.Join("\n    ", m.Dialogs));

            Assert.That(m.CountComments(CmtPackCascade.UserCommentFill), Is.Zero,
                "Đã bấm 戻る nên KHÔNG được có dòng nào của I030-2-2 trong lưới " +
                "(frm203019.fixProc chỉ gán ComParam khi outList.Count > 0, frm203019.cs:180-188).");

            // ⛔ ĐÂY LÀ PHÉP ĐO CỦA §B3. Đừng sửa cho 「hợp trực giác」.
            //
            //    exit_flg của pack type 90 được đặt ở CmtAuto.cs:838-841 — TRƯỚC khi
            //    showDialog(ID203019) ở :880. Nên huỷ hộp thoại KHÔNG gỡ được cờ, và
            //    I030-2-3 (歯清-口管強(Ce), đã seed 116/20) không bao giờ chạy.
            //
            //    Số 2 ở đây ⇒ cờ được đặt SAU khi hộp thoại trả về ⇒ đọc lại CmtAuto.cs và
            //    sửa vế web theo, chứ không sửa con số này.
            Assert.That(m.CountComments(SiseiText.KouKanKyo), Is.EqualTo(1),
                $"Phải có ĐÚNG MỘT dòng 「{SiseiText.KouKanKyo}」 — của I030-2-1 (seq 4).\n" +
                "  · HAI dòng ⇒ I030-2-3 (seq 6) cũng chạy ⇒ exit_flg của pack type 90 KHÔNG " +
                "được đặt trước khi mở hộp thoại, tức §B3 sai.\n" +
                "  · KHÔNG dòng nào ⇒ seed 116/23 chưa tới được app — đọc phần 「=== SEED ===」 " +
                "ở đầu log.\n" +
                $"  · Đối chứng TCX-14 (chỉ seed 116/20) chứng minh I030-2-3 CÓ ra được dòng này.\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");

            Assert.That(m.CountDialogs(PackDialogs.SelectFormId), Is.Zero,
                "I030-3 (seq 7, type 1 歯清-月１回) nằm sau điểm cắt ⇒ frm203018 KHÔNG được mở.\n" +
                "  Chuỗi hộp thoại:\n    " + string.Join("\n    ", m.Dialogs));
        });

        Log("");
        Log("KẾT LUẬN §B3: exit_flg của pack type 90 được đặt TRƯỚC khi mở hộp thoại " +
            "(CmtAuto.cs:838-841 → showDialog ở :880) ⇒ người dùng bấm 戻る cũng KHÔNG làm " +
            "cascade chạy tiếp. Vế web: đừng suy cờ dừng từ KẾT QUẢ hộp thoại của pack type 90.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-12 — cùng ca, nhưng XÁC NHẬN hộp thoại
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(12)]
    [Description("TCX-12 (§B3, đối chứng thao tác) — xác nhận frm203019: vẫn đúng MỘT dòng 口管強")]
    public void TCX_12_Type90_Confirmed_Still_Cuts()
    {
        using var trace = TestTrace.Begin();

        var m = RunOn(TrtDate.Day, SiseiText.TrtCd, SiseiText.TrtSb,
                      new CmtPackCascade.Plan(PickSeqNo: null), trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.CountDialogs(PackDialogs.UserCommentFormId), Is.EqualTo(1),
                "I030-2-2 PHẢI mở frm203019 — lịch sử 116/23 đã seed.");

            Assert.That(m.CountComments(CmtPackCascade.UserCommentFill), Is.EqualTo(1),
                $"Lần này bấm 確定 nên dòng 「{CmtPackCascade.UserCommentFill}」 PHẢI vào lưới.");

            Assert.That(m.CountComments(SiseiText.KouKanKyo), Is.EqualTo(1),
                $"Vẫn phải là ĐÚNG MỘT dòng 「{SiseiText.KouKanKyo}」. Cặp TCX-11/TCX-12 khác nhau " +
                "đúng MỘT thao tác (戻る hay 確定) và cả hai phải cho cùng một kết quả — đó chính là " +
                "nghĩa của 「cờ đặt TRƯỚC khi mở hộp thoại」 (F4).\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-13 — §B1: 歯清-特 cắt từ seq 4 trở đi
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(13)]
    [Description("TCX-13 (§B1) — 105/2 (chưa F9) rồi 歯清: 歯清-特 cắt sạch seq 4..7")]
    public void TCX_13_Toku_Cuts_Everything_After()
    {
        using var trace = TestTrace.Begin();

        // ── tiền đề: ngày đó chưa có 加算 nào ĐÃ LƯU ────────────────────────
        // Nếu có thì câu 歯清-特 có hai cách giải thích và ca mất ý nghĩa (F21).
        if (Master is not null)
        {
            var saved = Master.SavedRows(PatNo,
                [(TokuTrtCd, 0), (TokuTrtCd, 1), (TokuTrtCd, 2), (TokuTrtCd, 3),
                 (TokuTrtCd, 6), (TokuTrtCd, 7), (508, 0), (508, 1), (508, 6)],
                TrtDate, TrtDate);
            Log($"dòng 105/508 ĐÃ LƯU của ngày {TrtDate:yyyy-MM-dd}: {saved.Count}");
            foreach (var r in saved) Log("   " + r);
            Assert.That(saved, Is.Empty,
                $"TRNTRN đã có sẵn {saved.Count} dòng 加算 của đúng ngày test ⇒ đổi patient/trtDate, " +
                "đừng sửa assert.");
        }

        // ── vòng 1: 加算, KHÔNG F9 ──────────────────────────────────────────
        var toku = RunOn(TrtDate.Day, TokuTrtCd, TokuSb, CmtPackCascade.Plan.CancelAll, trace);
        Assert.That(toku.InsertedTreatmentRow, Is.True,
            $"Dòng {TokuTrtCd}/{TokuSb} 特２(初診) KHÔNG vào được lưới ⇒ TIỀN ĐỀ chưa thành.");

        // ── vòng 2: 歯清 ───────────────────────────────────────────────────
        var m = RunOn(TrtDate.Day, SiseiText.TrtCd, SiseiText.TrtSb,
                      CmtPackCascade.Plan.CancelAll, trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.CountComments(SiseiText.Toku), Is.EqualTo(1),
                $"Phải có ĐÚNG MỘT dòng 「{SiseiText.Toku}」 (pack I030-2, cmtToku CmtAuto.cs:3521-3546, " +
                "cửa sổ [算定日, 算定日]). Không có ⇒ cả cascade chưa chạy tới điểm cắt, đừng đọc tiếp.");

            // ⛔ PHÉP ĐO CỦA §B1.
            Assert.That(m.CountComments(SiseiText.KouKanKyo), Is.Zero,
                $"Cùng ngày có 加算 ⇒ I030-2 (seq 3) ra câu VÀ mang exit_flg ⇒ `break` " +
                "(CmtAuto.cs:917-919) ⇒ seq 4..7 KHÔNG chạy ⇒ KHÔNG được có dòng " +
                $"「{SiseiText.KouKanKyo}」, dù lịch sử 116/23 và 116/20 đều đã được seed.\n" +
                $"  · TCX-11 (cùng seed, KHÔNG có 加算) đo được 1 dòng — đó là đối chứng.\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");

            // ⚠️ Đếm hộp thoại CỦA PACK, đừng đếm tất. Gõ 歯清 cho bệnh nhân test LUÔN bung
            //    MessageBox nghiệp vụ 「8/3 108-2 …歯管、特疾管、歯在管、周III、周IVまたは回管の
            //    算定がありません。算定不可です。」 (#32770) — nó KHÔNG thuộc cascade và không
            //    chặn dòng nào (đo 2026-09-16, CmtPackType10/README.md mục 2). Lượt TCX-13 đầu
            //    tiên đỏ đúng vì assert cũ đếm cả nó — đỏ OAN cho app.
            var packDialogs = m.Dialogs.Where(d => d.Form != "#32770").ToList();
            Assert.That(packDialogs, Is.Empty,
                "Cắt ở seq 3 ⇒ KHÔNG hộp thoại nào CỦA CỤM 歯清 được mở (I030-2-2 type 90 ở seq 5, " +
                "I030-3 type 1 ở seq 7 đều nằm sau).\n" +
                "  Chuỗi hộp thoại (gồm cả MessageBox nghiệp vụ):\n    " +
                string.Join("\n    ", m.Dialogs));
        });

        Log("");
        Log("KẾT LUẬN §B1: 歯清-特 cắt sạch bốn pack phía sau. ⇒ vế web KHÔNG port exit_flg thì " +
            "chính lô 歯清 vừa làm sẽ đẻ thêm dòng 口管強 thừa cho mọi bệnh nhân có " +
            "歯科診療特別対応加算 cùng ngày.");
    }
}

/// <summary>
/// ĐỐI CHỨNG cho <see cref="CmtPackKonCSeedTests"/> — seed <b>chỉ</b> 116/20.
///
/// <para>Không có ca này thì 「TCX-11 đếm được 1 dòng 口管強」 chẳng chứng minh gì: biết đâu
/// <c>I030-2-3</c> vốn không bao giờ ra dòng nào. Ở đây <c>I030-2-1</c>/<c>I030-2-2</c> im
/// lặng (thiếu 116/23) nên <c>I030-2-3</c> là pack DUY NHẤT còn xuất câu — đúng một dòng
/// 「口管強（歯清）」, và <b>không hộp thoại nào</b>.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(600_000)]
public sealed class CmtPackCeOnlySeedTests : CmtPackUiTestBase
{
    protected override IReadOnlyList<SeedRow> SeedRows =>
    [
        new SeedRow(TestSettings.Current.Patient.ResolvedTrtDate.Day,
                    CmtPackKonCSeedTests.KouKanKyoTrtCd, CmtPackKonCSeedTests.CeSb, 48, "口管強(Ｃｅ管)")
    ];

    [Test, Order(14)]
    [Description("TCX-14 (đối chứng §B3) — chỉ seed 116/20: I030-2-3 ra ĐÚNG MỘT dòng 口管強, 0 hộp thoại")]
    public void TCX_14_Ce_Only_Produces_The_Second_KouKanKyo_Line()
    {
        using var trace = TestTrace.Begin();
        LogMaster(SiseiText.TrtCd, SiseiText.TrtSb);

        var m = RunOn(TrtDate.Day, SiseiText.TrtCd, SiseiText.TrtSb,
                      CmtPackCascade.Plan.CancelAll, trace);

        Assert.Multiple(() =>
        {
            Assert.That(m.CountComments(SiseiText.KouKanKyo), Is.EqualTo(1),
                $"Phải có ĐÚNG MỘT dòng 「{SiseiText.KouKanKyo}」 — của I030-2-3 (seq 6, " +
                "cmtKouKanKyo_Ce CmtAuto.cs:3587). Đây là dòng mà TCX-11 chứng minh là BỊ CẮT; " +
                "không có nó ở đây thì phép đo bên kia vô nghĩa.\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");

            Assert.That(m.CountDialogs(PackDialogs.UserCommentFormId), Is.Zero,
                "Thiếu 116/23 ⇒ I030-2-2 (type 90) trả về null ⇒ KHÔNG mở frm203019. Có hộp thoại " +
                "⇒ dải seed còn sót 116/23 của lượt trước; đọc phần 「=== DỌN ===」 của lượt đó.\n" +
                "  Chuỗi hộp thoại:\n    " + string.Join("\n    ", m.Dialogs));
        });
    }
}
