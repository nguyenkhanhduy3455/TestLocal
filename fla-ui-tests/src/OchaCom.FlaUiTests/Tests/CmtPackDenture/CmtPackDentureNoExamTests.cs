using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackDenture;

/// <summary>
/// §C3 — bệnh nhân <b>CHƯA TỪNG</b> có 歯周病検査 thì pack 歯管-有床義歯 <b>HIỆN</b>, kể cả
/// khi 病名 là Ｃ.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CA NÀY QUAN TRỌNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// Logic <b>cũ</b> (web đang chạy trên <c>demo1</c>) dùng một danh sách cứng
/// <c>{100 Ｃ, 101 Ｐul, 102 Ｐer, 111 Ｐerico, 112 Ｃ4, 158 Ｃ3処置歯}</c> để <b>ẩn</b> pack
/// khi bệnh nhân không có 歯周病検査. Bản 2026-09-07 của <c>CmtAuto.cs</c> <b>bỏ hẳn</b> danh
/// sách đó: chỉ còn 2 bước, và bước 2 chỉ ẩn khi <c>getPlaqueTeeth</c> trả về dòng
/// <b>có 部位 khác 0</b>:
/// <code>
///   pack_detail_dsp_flg = true;                         // CmtAuto.cs:224
///   trtData = getPlaqueTeeth(con, 1900-01-01, strDt);
///   if (trtData != null)                                 // ← chốt DUY NHẤT
///       for (bui[j] != 0) pack_detail_dsp_flg = false;
/// </code>
/// Không có 歯周病検査 ⇒ <c>trtData == null</c> ⇒ cờ giữ <b>true</b> ⇒ pack HIỆN.
/// Đây là cú <b>đảo ngược</b> so với bản cũ, và là thứ người dùng nhìn thấy ngay.
///
/// <para>⚠️ Tiền đề: bệnh nhân test phải <b>không</b> có dòng 歯周病検査 đủ tư cách nào —
/// <see cref="CmtPackDentureMasterTests.TCD_5_Patient_Has_No_Qualifying_Plaque_Row"/> khoá
/// điều đó, và <see cref="TCD_10_Precondition_No_Plaque_Row"/> kiểm lại ngay trước khi gõ.
/// Không có hàng rào này thì cả hai ca dưới xanh vì <b>lý do sai</b>.</para>
///
/// <para>Nguồn yêu cầu: <c>fla-ui-todo-inp-legacy-sync-20260921.md</c> §C3.</para>
/// </summary>
[TestFixture]
[CancelAfter(900_000)]
public sealed class CmtPackDentureNoExamTests : CmtPackDentureUiTestBase
{
    /// <summary>Fixture này CỐ Ý không seed 歯周病検査 — nó đo trạng thái 「chưa từng có 検査」.</summary>
    protected override bool RequiresExistingTeeth => false;

    /// <summary>Ｃ (đối chứng ngoài nhóm 欠損) và MT (dis_kbn 51, trong bộ 7).</summary>
    protected override IReadOnlyList<int> CarrierDiseases => [100, 393];

    [Test, Order(0)]
    [Description("TCD_10 — TIỀN ĐỀ: bệnh nhân không có dòng 歯周病検査 đủ tư cách nào")]
    public void TCD_10_Precondition_No_Plaque_Row()
    {
        Assert.That(Seeder, Is.Not.Null, "Cần db.enabled = true để kiểm tiền đề.");
        var n = Seeder!.QualifyingPlaqueRows(PatNo);
        Log($"=== KQ-10 === bệnh nhân {PatNo}: {n} dòng 歯周病検査 đủ tư cách");

        Assert.That(n, Is.EqualTo(0),
            $"Bệnh nhân {PatNo} đã có {n} dòng 歯周病検査 mang 病名 Ｐ/単Ｇ và có 部位. " +
            "getPlaqueTeeth sẽ KHÔNG trả null, nhánh 「còn 現存歯」 chạy, và hai ca dưới đo ra " +
            "kết quả của §C2 chứ không phải §C3. ⇒ TIỀN ĐỀ hỏng, đừng đọc kết quả bên dưới.");

        LogMaster();
    }

    [Test, Order(1)]
    [Description("TCD_11 ← §C3 — 病名 Ｃ(100), không có 歯周病検査 ⇒ pack PHẢI HIỆN (đảo so với logic cũ)")]
    public void TCD_11_CariesDisease_NoExam_Pack_Is_Shown()
    {
        using var trace = TestTrace.Begin();

        var m = MeasureDenture(disCd: 100, trace);

        Assert.That(m.PackShown, Is.True,
            $"§C3 — 病名 Ｃ (dis_cd 100, dis_kbn 1) và bệnh nhân CHƯA TỪNG có 歯周病検査, nhưng " +
            $"pack {CmtPackDentureMasterTests.PackCd} KHÔNG xuất dòng " +
            $"「{CmtPackDentureMasterTests.PackCommentText}」.\n" +
            "  Theo CmtAuto.cs:222-236 thì nó PHẢI hiện: bước 1 không khớp 欠損 ⇒ cờ về true, " +
            "getPlaqueTeeth trả null ⇒ vòng 現存歯 không chạy ⇒ cờ GIỮ true.\n" +
            "  Đỏ ở đây nghĩa là đọc nhầm source — đọc lại CmtAuto.cs:222-236, đặc biệt xem " +
            "getPlaqueTeeth trả null hay trả object RỖNG khi không có 検査, vì `if (trtData != null)` " +
            "là chốt duy nhất giữ pack_detail_dsp_flg = true.\n" +
            $"  Dòng comment đo được: [{string.Join(" / ", m.Cascade.CommentTexts)}]\n" +
            $"  Hộp thoại: [{string.Join(" | ", m.Cascade.Dialogs)}]");
    }

    [Test, Order(2)]
    [Description("TCD_12 — 病名 MT(100→393, dis_kbn 51 欠損), không có 歯周病検査 ⇒ pack HIỆN (bước 1)")]
    public void TCD_12_DentureDisease_NoExam_Pack_Is_Shown()
    {
        using var trace = TestTrace.Begin();

        var m = MeasureDenture(disCd: 393, trace);

        Assert.That(m.PackShown, Is.True,
            "病名 MT (dis_cd 393, dis_kbn 51 欠損) phải bật cờ ngay ở BƯỚC 1 " +
            "(CmtAuto.cs:206-220: case 51 ⇒ pack_detail_dsp_flg = true, rồi break) nên pack HIỆN " +
            "bất kể 現存歯.\n" +
            "  Đỏ ở đây, trong khi TCD_11 xanh, nghĩa là 病名 KHÔNG tới được dòng 歯管 — xem " +
            "AutoBui (modMain.cs:139-156) có chép 部位/病名 xuống dòng dưới không, và đọc ảnh " +
            "「byoumei-dialog」 xem 病名選択 có thật sự chọn được dis_cd 393.\n" +
            $"  Dòng comment đo được: [{string.Join(" / ", m.Cascade.CommentTexts)}]");
    }
}
