using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackDenture;

/// <summary>
/// §C2 + §C1 — bệnh nhân <b>CÒN 現存歯</b> (có seed một dòng 歯周病検査 mang 病名 Ｐ và 部位):
/// <list type="bullet">
///   <item><b>§C2</b> — 欠損病名 (<c>dis_kbn</c> 51) <b>VÀ</b> còn 現存歯 ⇒ pack vẫn phải
///     <b>HIỆN</b>. Đây là cú đảo ngược dễ nhận thấy nhất: logic cũ <b>ẩn</b> trong đúng tình
///     huống này.</item>
///   <item><b>§C1</b> — <c>dis_kbn</c> 53 / 54 / 60 thuộc nhóm F5 欠損補綴 (51..60) nhưng
///     <b>NGOÀI</b> bộ 7 giá trị mà <c>CmtAuto.cs:206-220</c> liệt kê ⇒ rơi xuống bước 2,
///     gặp 現存歯 ⇒ pack <b>ẨN</b>.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI ĐO CHUNG MỘT PHIÊN, VÀ VÌ SAO CÓ CA ĐỐI CHỨNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// Hai kết luận của fixture này chỉ có nghĩa khi đặt CẠNH nhau trên <b>cùng một bệnh nhân,
/// cùng một trạng thái 現存歯</b>:
/// <code>
///   dis_kbn 51 → HIỆN      ← bước 1 bật cờ, 現存歯 không kịp tắt
///   dis_kbn 53 → ẨN        ← KHÔNG được bước 1 nhận ⇒ 現存歯 tắt cờ
/// </code>
/// Chính cặp 「51 hiện / 53 ẩn」 là bằng chứng cho §C1: nếu WinForm coi 53 là 欠損 thì hai ca
/// phải cho cùng kết quả. Đo riêng lẻ trên hai lượt chạy khác nhau thì 「ẩn」 còn có thể do
/// seed trượt, nên <see cref="TCD_20_Control_CariesDisease_With_Teeth_Pack_Hidden"/> chạy
/// <b>TRƯỚC</b> làm đối chứng: nó khẳng định seed đã ăn (F20 — 「seed đổi nhiều cột thì cần
/// seed ĐỐI CHỨNG」).
///
/// <para>⚠️ Fixture GHI DB — sau cờ riêng <c>cmtPackDenture.allowSeed</c>, dải
/// <c>disp_no</c> 9200..9299, chụp/in/trả lại đủ ba bước. Không ca nào bấm F9 登録.</para>
///
/// <para>Nguồn yêu cầu: <c>fla-ui-todo-inp-legacy-sync-20260921.md</c> §C1, §C2.</para>
/// </summary>
[TestFixture]
[CancelAfter(900_000)]
public sealed class CmtPackDenturePlaqueTests : CmtPackDentureUiTestBase
{
    protected override bool RequiresExistingTeeth => true;

    /// <summary>
    /// ĐÚNG MỘT 病名 mỗi lượt — xem <c>TestSettings.CmtPackDentureSection.DisCd</c>. Seed
    /// nhiều 病名 sát nhau thì lệch một dòng là đo nhầm mà không mốc nào bắt được.
    /// </summary>
    protected override IReadOnlyList<int> CarrierDiseases => [Settings.CmtPackDenture.DisCd];

    [Test]
    [Description("TCD_30 — ĐO: 病名 (theo cmtPackDenture.disCd) + CÒN 現存歯 ⇒ pack HIỆN hay ẨN?")]
    public void TCD_30_Measure_Pack_With_Existing_Teeth()
    {
        using var trace = TestTrace.Begin();
        LogMaster();

        var disCd = Settings.CmtPackDenture.DisCd;
        var d = Seeder!.Disease(disCd, TrtDate);
        Log($"=== ĐANG ĐO === 病名 {d} · bệnh nhân {PatNo} CÒN 現存歯");

        var m = MeasureDenture(disCd, trace);

        // ⚠️ Ca này ĐANG KHÁM PHÁ hành vi, chưa phải ca hồi quy — nó KHÔNG assert chiều
        // HIỆN/ẨN. Mọi tiền đề đã được gác trong MeasureDenture (病名 lên lưới, dòng 歯管
        // thừa kế đúng 病名, dòng 処置 vào được lưới). Số đo nằm ở dòng 「=== KQ ===」.
        Log($"=== KẾT LUẬN === dis_cd {disCd} (dis_kbn {d?.DisKbn}) + 現存歯 ⇒ pack " +
            $"{(m.PackShown ? "HIỆN" : "ẨN")}");

        Assert.That(m.MocLechNhau, Is.False,
            "Hai mốc (hộp thoại hỏi / comment rơi xuống lưới) KHÔNG đồng ý ⇒ lượt chạy đứt " +
            $"giữa chừng, đừng dùng số đo này. {m}");
    }
}
