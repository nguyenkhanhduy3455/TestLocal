using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// §B4 — ＳＰＴ (<c>I011-2-1-1</c>). Ba điểm của ghi chú gốc, đo trên giao diện.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BA CÂU
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>Nhánh 「2回目以降」 in ĐỦ NGÀY hay chỉ 年月?</b> Master đã trả lời (TCX-4):
///     <c>com_cd 850100337</c> ⇒ pattern <b>50</b> ⇒ <c>setPacData</c> ghép
///     <c>com_nm + " " + gggyy年MM月dd日</c> và <b>BỎ QUA <c>fmt_str</c></b>
///     (CmtAuto.cs:3620-3627) — mặc dù chính <c>cmtSPT</c> vừa nối 年月 vào <c>fmt_str</c>
///     ở CmtAuto.cs:2370. Đây là chỗ dễ port sai nhất; <c>TCX_18</c> đo chuỗi THẬT trên lưới.</item>
///   <item><b>Ｐ重防 (167/8-10) có được tính là 「lần trước」 không?</b> Với
///     算定日 ≥ 2026-06-01, <c>cmtSPT</c> nối thêm mã của <c>I011-2-3-1</c> —
///     và nó đọc master ở <b>2026-05-31</b> (<c>MedicalFeeRevision_202606.AddDays(-1)</c>,
///     CmtAuto.cs:2332), tức CỐ Ý tra bản master TRƯỚC改定. Pack đó hết hạn 2026-05-31 nên
///     tra theo ngày hôm nay sẽ ra RỖNG — dễ port thành 「bỏ qua Ｐ重防」. <c>TCX_19</c> đo.</item>
///   <item><b>初回 mang <c>exit_flg</c> ⇒ <c>I011-2-1-2</c> không mở.</b> Master đã khoá
///     (TCX-4). <b>Không đo được trên máy này</b> — xem mục ⚠️ dưới.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ ĐIỂM 3 KHÔNG ĐO ĐƯỢC TRÊN MÁY NÀY — VÀ ĐÓ LÀ MỘT PHÁT HIỆN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>I011-2-1-2</c> có <c>condition = "SPT1-3-monthly"</c>, và nhánh đó kiểm
/// <b>施設基準届出</b> TRƯỚC mọi thứ khác (CmtAuto.cs:133-151): có
/// <c>IINMST3(1346 か強診)</c> hoặc <c>(1375 口管強)</c> còn hiệu lực ⇒
/// <c>pack_detail_dsp_flg = false</c> ⇒ hộp thoại <b>không bao giờ mở</b>.
///
/// <para>Đo được 2026-09-17 trên DB test: <c>IINMST3</c> có <c>1346 [2017-02-01, 9999-12-31]</c>
/// và <c>1375 [2024-06-01, 9999-12-31]</c> ⇒ cửa đóng vĩnh viễn. Probe <c>TcXP4</c> xác nhận:
/// gõ 167/1 KHÔNG bung frm203018 nào.</para>
///
/// <para>⇒ 「hộp thoại không mở」 ở đây <b>không phân biệt được</b> giữa 「exit_flg cắt」 và
/// 「施設基準 chặn」. Vì thế các ca dưới đây <b>không</b> assert điểm 3; chúng chỉ GHI LẠI,
/// còn điểm 3 đứng ở mức master (TCX-4). Muốn đo thật thì phải sửa <c>IINMST3</c> — một
/// bảng cấu hình TOÀN PHÒNG KHÁM, ảnh hưởng mọi luồng khác — nên luồng này cố tình KHÔNG làm.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY RIÊNG TỪNG CA (F7)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-cmt-pack-exit-flg.ps1 -Spt   -Case TCX_18   lịch sử ＳＰＴ 167/1
///   .\run-cmt-pack-exit-flg.ps1 -SptP  -Case TCX_19   lịch sử Ｐ重防 167/9
/// </code>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(600_000)]
public sealed class CmtPackSptTests : CmtPackUiTestBase
{
    /// <summary>ＳＰＴ(1～9歯) — 170点. Probe TcXP4 đo được: KHÔNG mở 部位選択 dù <c>KESSON = 9</c>.</summary>
    public const int SptTrtCd = 167;
    public const int SptTrtSb = 1;

    /// <summary>「初回（ＳＰＴ）」 — lưới in ra 「初回(SPT)」 (đo TcXP4).</summary>
    public const string FirstTime = "初回";

    /// <summary>「ＳＰＴ又はＰ重防前回実施年月」 — mẩu ngắn, so sau khi chuẩn hoá NFKC.</summary>
    public const string PrevDate = "前回実施年月";

    private int LaterDay => Settings.CmtPack.LaterDay;

    protected override IReadOnlyList<SeedRow> SeedRows =>
    [
        new SeedRow(TestSettings.Current.Patient.ResolvedTrtDate.Day,
                    SptTrtCd, SptTrtSb, 170, "歯周病継続支援治療(1～9歯)")
    ];

    [Test, Order(18)]
    [Description("TCX-18 (§B4 điểm 1) — có lịch sử ＳＰＴ: nhánh 2回目以降 in ĐỦ NGÀY, không phải chỉ 年月")]
    public void TCX_18_Spt_Prev_Date_Is_Full_Date()
    {
        using var trace = TestTrace.Begin();
        LogMaster(SptTrtCd, SptTrtSb);

        var seededDay = TrtDate.Day;
        Assert.That(LaterDay, Is.GreaterThan(seededDay),
            $"cmtPack.laterDay = {LaterDay} phải LỚN HƠN ngày seed ({seededDay}): cửa sổ của " +
            "cmtSPT là [初診日, 算定日-1] (CmtAuto.cs:2359).");

        var m = RunOn(LaterDay, SptTrtCd, SptTrtSb, CmtPackCascade.Plan.CancelAll, trace);

        var expected = $"ＳＰＴ又はＰ重防{PrevDate} {Wareki(seededDay)}";

        Assert.Multiple(() =>
        {
            Assert.That(m.CountComments(FirstTime), Is.Zero,
                $"Đã seed lịch sử ＳＰＴ ở ngày {seededDay} nên KHÔNG được ra 「初回（ＳＰＴ）」 nữa. " +
                "Còn ra ⇒ seed chưa tới được app (đọc 「=== SEED ===」 ở đầu log) hoặc 初診日 nằm " +
                $"SAU ngày {seededDay} nên dòng seed rơi ngoài cửa sổ.\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");

            // ⛔ ĐÂY LÀ PHÉP ĐO CỦA §B4 ĐIỂM 1. Đừng đổi sang 年月 cho 「khớp fmt_str」.
            //    cmtSPT nối 年月 vào fmt_str (CmtAuto.cs:2370) NHƯNG setPacData rẽ theo
            //    com_cd pattern 50 và dùng com_nm + gggyy年MM月dd日, fmt_str bị BỎ QUA
            //    (CmtAuto.cs:3616-3627). Đỏ ở đây với chuỗi chỉ có 年月 ⇒ suy luận sai, sửa
            //    vế web theo số đo chứ đừng sửa assert.
            Assert.That(m.CountComments(expected), Is.EqualTo(1),
                $"Phải có ĐÚNG MỘT dòng 「{expected}」 — ĐỦ NGÀY 令和○年○月○日.\n" +
                "  · Ra chuỗi chỉ có 年月 (không có 「日」) ⇒ fmt_str THẮNG com_cd pattern, " +
                "ngược với setPacData; ghi lại vào README rồi mới port.\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");

            // KHÔNG assert — chỉ ghi lại. Xem mục ⚠️ ở đầu file: hộp thoại I011-2-1-2 bị
            // 施設基準 1346 chặn sẵn, nên con số này không nói gì về exit_flg.
            Log($"(ghi nhận, KHÔNG assert) frm203018 mở {m.CountDialogs(PackDialogs.SelectFormId)} lần — " +
                "I011-2-1-2 bị IINMST3(1346) chặn từ trước, xem mục ⚠️ đầu file.");
        });

        Log("");
        Log("KẾT LUẬN §B4 điểm 1: 「ＳＰＴ又はＰ重防前回実施年月」 in ĐỦ NGÀY. ⇒ vế web dùng " +
            "com_cd pattern để quyết định định dạng, KHÔNG dùng fmt_str của MST_CMT_PACK_DETAIL.");
    }

    private string Wareki(int day)
    {
        var d = new DateTime(TrtDate.Year, TrtDate.Month, day);
        return $"令和{d.Year - 2018:00}年{d.Month:00}月{d.Day:00}日";
    }
}

/// <summary>
/// §B4 điểm 2 — <b>Ｐ重防 (167/9) có được tính là 「lần trước」 của ＳＰＴ không?</b>
///
/// <para><c>cmtSPT</c> nối thêm mã của <c>I011-2-3-1</c> vào <c>kvTreat</c> khi
/// 算定日 ≥ 2026-06-01, và nó tra master ở <b>2026-05-31</b> — ngày TRƯỚC改定
/// (<c>ComConst.MedicalFeeRevision_202606.AddDays(-1)</c>, CmtAuto.cs:2331-2333).</para>
///
/// <para>Đo được ở master 2026-09-17: <c>I011-2-3-1</c> có cửa sổ
/// <c>[20240601, 20260531]</c> và 3 mã kích hoạt <c>167/8</c>, <c>167/9</c>, <c>167/10</c>;
/// tra theo <b>ngày hôm nay</b> thì ra RỖNG. Ba mã đó cũng <b>không còn trong
/// <c>MST_TRT266</c></b> ⇒ không gõ tay được, chỉ seed được — mà đó cũng đúng tình huống
/// thật: bệnh nhân đã算定 Ｐ重防 trước 2026-06 rồi nay chuyển sang ＳＰＴ.</para>
///
/// <para>⇒ Port sai ở đây (tra <c>I011-2-3-1</c> theo 算定日 thay vì theo 2026-05-31) sẽ làm
/// web ra 「初回（ＳＰＴ）」 trong khi WinForm ra 「前回実施年月」 — <b>sai hẳn nội dung
/// レセプト</b>, và không testcase nào bên web bắt được nếu không có ca này.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(600_000)]
public sealed class CmtPackSptJyubouTests : CmtPackUiTestBase
{
    /// <summary>Ｐ重防 — mã của <c>I011-2-3-1</c>, đã rời <c>MST_TRT266</c> sau 令和８年６月改定.</summary>
    public const int JyubouTrtSb = 9;

    private int LaterDay => Settings.CmtPack.LaterDay;

    protected override IReadOnlyList<SeedRow> SeedRows =>
    [
        new SeedRow(TestSettings.Current.Patient.ResolvedTrtDate.Day,
                    CmtPackSptTests.SptTrtCd, JyubouTrtSb, 150, "Ｐ重防")
    ];

    [Test, Order(19)]
    [Description("TCX-19 (§B4 điểm 2) — lịch sử Ｐ重防 167/9 vẫn được tính là 「lần trước」 của ＳＰＴ")]
    public void TCX_19_Jyubou_Counts_As_Previous_Spt()
    {
        using var trace = TestTrace.Begin();
        LogMaster(CmtPackSptTests.SptTrtCd, CmtPackSptTests.SptTrtSb);

        var seededDay = TrtDate.Day;
        var m = RunOn(LaterDay, CmtPackSptTests.SptTrtCd, CmtPackSptTests.SptTrtSb,
                      CmtPackCascade.Plan.CancelAll, trace);

        var expected = $"ＳＰＴ又はＰ重防{CmtPackSptTests.PrevDate} {Wareki(seededDay)}";

        Assert.Multiple(() =>
        {
            // ⛔ PHÉP ĐO. Ra 「初回」 ⇒ Ｐ重防 KHÔNG được tính ⇒ đọc lại CmtAuto.cs:2331-2333
            //    (nó tra I011-2-3-1 theo 2026-05-31, không theo 算定日) trước khi sửa gì.
            Assert.That(m.CountComments(CmtPackSptTests.FirstTime), Is.Zero,
                $"Đã seed Ｐ重防 167/{JyubouTrtSb} ở ngày {seededDay} mà vẫn ra 「初回（ＳＰＴ）」 ⇒ " +
                "Ｐ重防 KHÔNG được tính là lần trước. Nếu đúng vậy thì cả nhánh " +
                "`kvTreat.Concat(getMstCmtPackTrtCd(\"I011-2-3-1\", 2026/05/31))` là code chết — " +
                "ghi vào README rồi mới bỏ nó khỏi vế web.\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");

            Assert.That(m.CountComments(expected), Is.EqualTo(1),
                $"Phải ra 「{expected}」 — ngày của dòng Ｐ重防 đã seed.\n" +
                "  Đọc được: [" + string.Join(" / ", m.CommentTexts) + "]");
        });

        Log("");
        Log("KẾT LUẬN §B4 điểm 2: Ｐ重防 (167/8-10) TÍNH là 「lần trước」 của ＳＰＴ, dù pack " +
            "I011-2-3-1 đã hết hạn 2026-05-31 — vì cmtSPT cố ý tra master ở ĐÚNG ngày 2026-05-31. " +
            "⇒ vế web phải tra bằng ngày cố định đó, KHÔNG phải 算定日.");
    }

    private string Wareki(int day)
    {
        var d = new DateTime(TrtDate.Year, TrtDate.Month, day);
        return $"令和{d.Year - 2018:00}年{d.Month:00}月{d.Day:00}日";
    }
}
