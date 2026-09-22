using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// §B2 — <b>「前回実施年月」 có tính dòng CHƯA F9 của một ngày KHÁC trong cùng tháng không?</b>
/// Fixture này <b>KHÔNG seed gì</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHỖ ĐO
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>cmtPrevDate</c> (CmtAuto.cs:3160) gọi <c>getTreatData</c> với cửa sổ
/// <c>[初診日, 算定日 - 1 ngày]</c> — <b>không có</b> 「trừ hôm nay」 nào khác, và
/// <c>getTreatDataTeethDis</c> quét <c>_tblRegiInp</c> = <b>LƯỚI ĐANG MỞ</b> TRƯỚC
/// (CommonChk.cs:653-753), chỉ khi không thấy mới tra <c>ModSave.trtDataList</c> (dữ liệu đã lưu).
///
/// <para>Ra câu gì thì <c>setPacData</c> quyết theo <c>com_cd</c> (CmtAuto.cs:3168-3181):</para>
/// <code>
///   có lần trước  → com_cd1 850100346 pattern 50 → 「歯清前回実施年月 令和○年○月○日」  ĐỦ NGÀY
///   chưa có       → com_cd2 820190346 pattern 20 → 「初回（歯清）」
/// </code>
/// Hai nhánh ra hai chuỗi <b>khác hẳn nhau</b>, nên phép đo không thể nhập nhằng.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHỌN NGÀY MÀ KHÔNG CẦN HELPER
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>ModMain.AutoDate</c> chép ô 日 từ dòng bên trên, nên chèn dưới dòng cuối của ngày X là
/// gõ được vào ngày X — <b>miễn là ngày đó đã có sẵn ít nhất một dòng trong lưới</b>.
/// Bệnh nhân test có 処置 đã lưu ở <b>ngày 3</b> và <b>ngày 14</b> của 08年08月, nên hai ca
/// dưới đây chạy được mà không cần đụng vào <c>TreatmentGridOps</c>.
/// Ngày sau lấy từ <c>cmtPack.laterDay</c> (mặc định 14).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY RIÊNG TỪNG CA (F7) — mỗi ca đúng HAI vòng giao diện
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-cmt-pack-exit-flg.ps1 -PrevDate -Case TCX_15   ngày 3 → ngày 14 (thuận)
///   .\run-cmt-pack-exit-flg.ps1 -PrevDate -Case TCX_16   ngày 14 → ngày 3 (đảo)
/// </code>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(780_000)]
public sealed class CmtPackPrevDateTests : CmtPackUiTestBase
{
    // KHÔNG seed — SeedRows để rỗng (mặc định của lớp nền).

    private int LaterDay => Settings.CmtPack.LaterDay;

    /// <summary>Chuỗi 和暦 của một ngày trong tháng test — 「令和08年08月03日」.</summary>
    private string Wareki(int day)
    {
        var d = new DateTime(TrtDate.Year, TrtDate.Month, day);
        // 令和 bắt đầu 2019-05-01; app in bằng EditControl.editDateToString(…, "gggyy年MM月dd日").
        var reiwaYear = d.Year - 2018;
        return $"令和{reiwaYear:00}年{d.Month:00}月{d.Day:00}日";
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-15 — thuận: ngày sớm trước, ngày muộn sau
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(15)]
    [Description("TCX-15 (§B2) — 歯清 ngày 3 (CHƯA F9) rồi 歯清 ngày 14: phải ra 前回実施年月 令和08年08月03日")]
    public void TCX_15_Unsaved_Row_Of_Earlier_Day_Counts()
    {
        using var trace = TestTrace.Begin();
        LogMaster(SiseiText.TrtCd, SiseiText.TrtSb);

        var earlyDay = TrtDate.Day;
        Assert.That(LaterDay, Is.GreaterThan(earlyDay),
            $"cmtPack.laterDay = {LaterDay} phải LỚN HƠN ngày test ({earlyDay}) — cửa sổ của " +
            "cmtPrevDate là [初診日, 算定日-1], ngày sau phải nằm sau ngày trước thì mới lọt vào.");

        // ── vòng 1: ngày sớm — mốc 「máy chạy thật」 ────────────────────────
        var first = RunOn(earlyDay, SiseiText.TrtCd, SiseiText.TrtSb,
                          CmtPackCascade.Plan.CancelAll, trace);

        Assert.That(first.CountComments(SiseiText.FirstTime), Is.EqualTo(1),
            $"Lượt 1 (ngày {earlyDay}) phải ra 「初回（歯清）」 — bệnh nhân test chưa từng算定 歯清. " +
            "Không có ⇒ cả đường Chk_CmtAuto không chạy và lượt 2 vô nghĩa.\n" +
            "  Đọc được: [" + string.Join(" / ", first.CommentTexts) + "]");

        Assert.That(first.CountComments(SiseiText.PrevDate), Is.Zero,
            "Lượt 1 KHÔNG được ra 前回実施年月 — nếu có thì bệnh nhân đã có lịch sử 歯清 sẵn và " +
            "phép đo mất đối chứng. Đổi patient/trtDate, đừng sửa assert.");

        // ── vòng 2: ngày muộn ──────────────────────────────────────────────
        var second = RunOn(LaterDay, SiseiText.TrtCd, SiseiText.TrtSb,
                           CmtPackCascade.Plan.CancelAll, trace);

        var expected = $"{SiseiText.PrevDate} {Wareki(earlyDay)}";

        Assert.Multiple(() =>
        {
            // ⛔ ĐỪNG SỬA cho 「hợp trực giác」. Đây là SỐ ĐO: dòng 歯清 DUY NHẤT trước ngày
            //    {LaterDay} là dòng lượt 1 vừa gõ và CHƯA F9. WinForm vẫn xuất 前回実施年月
            //    ⇒ getTreatData đọc tham số _tblRegiInp (lưới đang mở), đúng CommonChk.cs:653-753.
            //    Ra 「初回」 ⇒ WinForm KHÔNG tính dòng chưa lưu ⇒ phải revert phần grid của
            //    commit e4cd80abd bên web.
            Assert.That(second.CountComments(SiseiText.PrevDate), Is.EqualTo(1),
                $"Lượt 2 (ngày {LaterDay}) phải ra ĐÚNG MỘT dòng 「{SiseiText.PrevDate}」.\n" +
                $"  · Ra 「初回」 thay vào đó ⇒ WinForm KHÔNG tính dòng chưa F9 của ngày khác " +
                "trong cùng tháng ⇒ vế web phải revert phần grid của commit e4cd80abd.\n" +
                "  Đọc được: [" + string.Join(" / ", second.CommentTexts) + "]");

            Assert.That(second.CountComments(SiseiText.FirstTime), Is.Zero,
                "Và lượt 2 KHÔNG được ra 「初回（歯清）」 nữa — hai nhánh loại trừ nhau " +
                "(CmtAuto.cs:3168-3181).");

            // Pattern 50 ⇒ ĐỦ NGÀY, không phải chỉ 年月. Đây là nửa thứ hai của §B2, và là
            // chỗ dễ port sai: fmt_str của master chỉ có 年月, nhưng com_cd pattern 50 làm
            // setPacData BỎ QUA fmt_str và tự ghép gggyy年MM月dd日 (CmtAuto.cs:3620-3627).
            Assert.That(second.CountComments(expected), Is.EqualTo(1),
                $"Chuỗi phải chứa 「{expected}」 — ĐỦ NGÀY, không phải chỉ 年月.\n" +
                "  Đọc được: [" + string.Join(" / ", second.CommentTexts) + "]");
        });

        Log("");
        Log($"KẾT LUẬN §B2: WinForm TÍNH dòng chưa F9 của ngày {earlyDay} khi gõ ở ngày {LaterDay} " +
            "(cùng tháng). ⇒ vế web: FE phải gửi kèm các dòng chưa lưu của CẢ THÁNG, không chỉ " +
            "của ngày đang nhập.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-16 — đảo: ngày muộn trước, ngày sớm sau
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(16)]
    [Description("TCX-16 (§B2, đảo) — 歯清 ngày 14 trước rồi ngày 3: cửa sổ [初診日, 算定日-1] loại ngày 14")]
    public void TCX_16_Later_Day_Does_Not_Leak_Backwards()
    {
        using var trace = TestTrace.Begin();

        var earlyDay = TrtDate.Day;

        var first = RunOn(LaterDay, SiseiText.TrtCd, SiseiText.TrtSb,
                          CmtPackCascade.Plan.CancelAll, trace);
        Assert.That(first.CountComments(SiseiText.FirstTime), Is.EqualTo(1),
            $"Lượt 1 (ngày {LaterDay}) phải ra 「初回（歯清）」.");

        var second = RunOn(earlyDay, SiseiText.TrtCd, SiseiText.TrtSb,
                           CmtPackCascade.Plan.CancelAll, trace);

        // ⛔ Đây là phép đo về CỬA SỔ NGÀY, không phải về thứ tự dòng trong lưới.
        //    getTreatDataTeethDis quét lưới TỪ DƯỚI LÊN và lấy dòng ĐẦU TIÊN khớp, nhưng
        //    trước đó còn một hàng rào: `trt_dt >= _stDt && trt_dt <= _endDt` với
        //    _endDt = 算定日 - 1 (CommonChk.cs:663-666). Dòng ngày 14 nằm NGOÀI cửa sổ của
        //    ngày 3 nên không được tính, dù nó ở ngay trong lưới.
        Assert.Multiple(() =>
        {
            Assert.That(second.CountComments(SiseiText.PrevDate), Is.Zero,
                $"Lượt 2 (ngày {earlyDay}) KHÔNG được ra 前回実施年月: dòng 歯清 duy nhất trong lưới " +
                $"nằm ở ngày {LaterDay}, mà cửa sổ của cmtPrevDate là [初診日, {earlyDay - 1}] " +
                "(CmtAuto.cs:3165). Ra dòng đó ⇒ cửa sổ rộng hơn ta tưởng, và vế web đang lọc " +
                "ngày sai chiều.\n  Đọc được: [" + string.Join(" / ", second.CommentTexts) + "]");

            Assert.That(second.CountComments(SiseiText.FirstTime), Is.EqualTo(1),
                $"⇒ lượt 2 vẫn phải ra 「初回（歯清）」.");
        });

        Log("");
        Log("KẾT LUẬN §B2 (đảo): cửa sổ ngày lọc TRƯỚC, thứ tự quét lưới chỉ quyết định " +
            "「lấy dòng nào trong số các dòng HỢP LỆ」. Vế web đừng chỉ lấy 「dòng muộn nhất trong " +
            "tháng」 mà bỏ qua vế 「phải trước 算定日」.");
    }
}

/// <summary>
/// §B2, nửa thứ hai — <b>trong nhiều ứng viên hợp lệ thì lấy cái nào?</b>
///
/// <para>Fixture này seed <b>một dòng 歯清 ĐÃ LƯU ở ngày test</b> và <b>một dòng mồi ở ngày
/// muộn</b> (để lưới có dòng mà chèn xuống dưới), rồi gõ 歯清 ở hai ngày nữa. Kết quả phân
/// biệt được ba giả thuyết cùng lúc:</para>
/// <list type="bullet">
///   <item>lấy dòng ĐÃ LƯU (ngày test) hay dòng CHƯA LƯU (ngày giữa)?</item>
///   <item>lấy ngày SỚM NHẤT hay MUỘN NHẤT trong số hợp lệ?</item>
/// </list>
///
/// <para><c>getTreatDataTeethDis</c> quét <c>_tblRegiInp</c> <b>từ dưới lên</b> và
/// <c>break</c> ở dòng đầu tiên khớp (CommonChk.cs:655), rồi mới tới vòng dữ liệu đã lưu
/// ⇒ dự đoán: <b>dòng chưa lưu của ngày muộn hơn thắng</b>.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(780_000)]
public sealed class CmtPackPrevDateLatestTests : CmtPackUiTestBase
{
    /// <summary>歯科再診料 — dòng MỒI, chỉ để ngày cuối có sẵn một dòng trong lưới.</summary>
    private const int FillerTrtCd = 110;
    private const int FillerTrtSb = 0;

    /// <summary>Ngày cuối — sau <c>cmtPack.laterDay</c>.</summary>
    private static int FinalDay => TestSettings.Current.CmtPack.LaterDay + 6;

    protected override IReadOnlyList<SeedRow> SeedRows =>
    [
        // ĐÃ LƯU, ngày test — ứng viên 「cũ nhất」.
        new SeedRow(TestSettings.Current.Patient.ResolvedTrtDate.Day,
                    SiseiText.TrtCd, SiseiText.TrtSb, 72, "歯清"),
        // Dòng mồi cho ngày cuối — KHÔNG phải 歯清, không ảnh hưởng phép đo.
        new SeedRow(FinalDay, FillerTrtCd, FillerTrtSb, 59, "歯科再診料"),
    ];

    [Test, Order(17)]
    [Description("TCX-17 (§B2) — dòng CHƯA LƯU của ngày muộn thắng dòng ĐÃ LƯU của ngày sớm")]
    public void TCX_17_Unsaved_Later_Row_Wins_Over_Saved_Earlier_Row()
    {
        using var trace = TestTrace.Begin();

        var savedDay = TrtDate.Day;
        var midDay = Settings.CmtPack.LaterDay;
        var finalDay = FinalDay;
        Log($"ngày ĐÃ LƯU = {savedDay} (seed) · ngày giữa = {midDay} (gõ, chưa F9) · " +
            $"ngày cuối = {finalDay} (gõ, chưa F9)");

        // ── vòng 1: ngày giữa. Ứng viên duy nhất là dòng ĐÃ LƯU của ngày test ──
        var mid = RunOn(midDay, SiseiText.TrtCd, SiseiText.TrtSb,
                        CmtPackCascade.Plan.CancelAll, trace);

        var fromSaved = $"{SiseiText.PrevDate} {WarekiOf(savedDay)}";
        Assert.That(mid.CountComments(fromSaved), Is.EqualTo(1),
            $"Lượt 1 (ngày {midDay}) phải lấy dòng ĐÃ LƯU của ngày {savedDay} ⇒ 「{fromSaved}」. " +
            "Không có ⇒ seed chưa tới được app (đọc 「=== SEED ===」 ở đầu log).\n" +
            "  Đọc được: [" + string.Join(" / ", mid.CommentTexts) + "]");

        // ── vòng 2: ngày cuối. Giờ có HAI ứng viên hợp lệ ──────────────────
        var last = RunOn(finalDay, SiseiText.TrtCd, SiseiText.TrtSb,
                         CmtPackCascade.Plan.CancelAll, trace);

        var fromUnsaved = $"{SiseiText.PrevDate} {WarekiOf(midDay)}";

        Assert.Multiple(() =>
        {
            Assert.That(last.CountComments(fromUnsaved), Is.EqualTo(1),
                $"Lượt 2 (ngày {finalDay}) phải lấy dòng CHƯA LƯU của ngày {midDay} ⇒ 「{fromUnsaved}」.\n" +
                $"  · Ra 「{fromSaved}」 ⇒ WinForm ưu tiên dữ liệu ĐÃ LƯU, hoặc lấy ngày SỚM nhất — " +
                "cả hai đều ngược với CommonChk.cs:655 (quét lưới TỪ DƯỚI LÊN, break ở dòng đầu " +
                "tiên khớp, rồi mới tra trtDataList). Ghi lại vào README rồi sửa vế web theo.\n" +
                "  Đọc được: [" + string.Join(" / ", last.CommentTexts) + "]");

            Assert.That(last.CountComments(fromSaved), Is.Zero,
                $"Và KHÔNG được ra 「{fromSaved}」 — chỉ MỘT dòng 前回実施年月 cho mỗi lượt.");
        });

        Log("");
        Log("KẾT LUẬN §B2 (ứng viên): lưới ĐANG MỞ được tra TRƯỚC dữ liệu đã lưu, và trong lưới " +
            "thì dòng DƯỚI CÙNG khớp được lấy — tức 「ngày muộn nhất」 khi lưới xếp theo ngày. " +
            "⇒ vế web: gộp dòng chưa lưu vào TRƯỚC rồi mới rơi về DB, đừng làm ngược.");
    }

    private string WarekiOf(int day)
    {
        var d = new DateTime(TrtDate.Year, TrtDate.Month, day);
        return $"令和{d.Year - 2018:00}年{d.Month:00}月{d.Day:00}日";
    }
}
