using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

/// <summary>
/// <b>Nhóm D — <c>dis_flg = 1</c>: ca sát ranh, app vẫn phải IM LẶNG.</b>
///
/// Đối ứng của <c>auto-santei-high-needs-freewd.spec.ts</c> <b>J-3</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN RIÊNG MỘT NHÓM CHO dis_flg = 1
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>TC-N2</c> đã đo 「không hỏi」 nhưng với <c>dis_flg = 0</c> — bệnh nhân KHÔNG có
/// khuyết tật gì. Đó là ca dễ: gần như mọi cách viết sai điều kiện đều cho ra đúng kết
/// quả ở đó.
///
/// <para><c>dis_flg = 1</c> mới là ca phân biệt được. Ba giá trị mang ba nghĩa khác
/// nhau và <b>rất dễ lẫn</b> vì tên gọi gần giống nhau:</para>
/// <code>
///   dis_flg 1 = 歯科診療困難者      ← khuyết tật, nhưng KHÔNG mở câu hỏi
///   dis_flg 2 = (身障者 khác)
///   dis_flg 3 = 歯科診療特別対応    ← DUY NHẤT mở câu hỏi
/// </code>
/// Trớ trêu là <b>chính chữ 「困難者」 lại nằm trong tên của thứ mà câu hỏi sinh ra</b>:
/// trả lời 「はい」 ghi <c>freewd 「1」</c>, và <c>getTensu</c> đọc lại thành
/// 歯科診療困難者加算 (<c>CommonChk.cs:109</c>). Ai đọc lướt rất dễ nối 「困難者」 với
/// <c>dis_flg = 1</c> rồi viết điều kiện thành <c>&gt;= 1</c> hoặc <c>== 1</c>.
///
/// <para>Và nhầm kiểu đó KHÔNG bị các testcase khác bắt: <c>dis_flg &gt;= 1</c> vẫn cho
/// TC-A1…TC-A6 xanh (vì chúng chạy ở <c>dis_flg = 3</c>) và vẫn cho TC-N2 xanh (vì nó
/// chạy ở <c>dis_flg = 0</c>). Chỉ nhóm này bắt được.</para>
///
/// <para>Có cơ sở thật để lo: ngay trong cùng luồng 自動算定, câu hỏi 特１/特２ dùng
/// <c>intSins &gt;= 1</c> (modSave.cs:3097) trong khi câu 困難者 dùng <c>== 3</c>
/// (modSave.cs:3450). Hai phép so KHÁC NHAU nằm cách nhau vài trăm dòng trong cùng một
/// hàm.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// PHẢI VÁ DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Dữ liệu có <c>dis_flg = 1</c> nhưng chỉ ở <b>2 bệnh nhân</b> (đo 2026-08-26), và
/// không bệnh nhân nào trong số đó là bệnh nhân test. Nên vẫn phải vá — xem
/// <see cref="HighNeedsPatchedTestBase"/>.
///
/// <para>Chạy: <c>.\run-high-needs-freewd.ps1 -AllowDisFlgPatch -Case D</c></para>
/// </summary>
[TestFixture]
[Category("high-needs-freewd")]
public sealed class HighNeedsDisFlg1Tests : HighNeedsPatchedTestBase
{
    /// <summary>歯科診療困難者 — KHÁC 歯科診療特別対応 (3), và KHÔNG mở câu hỏi.</summary>
    private const int DisFlgHandicapped = 1;

    protected override int PatchedDisFlg => DisFlgHandicapped;
    protected override string PatchPurpose =>
        "歯科診療困難者 — ca sát ranh, phải KHÔNG mở câu hỏi";

    [Test, Order(1)]
    [Description("TC-D1 — dis_flg = 1 (困難者): chèn 105-0 mà KHÔNG hỏi — điều kiện là == 3, không phải >= 1")]
    public void TcD1_DisFlgOneStillDoesNotAsk()
    {
        using var trace = TestTrace.Begin();
        EnsureFreewdReadable(trace);

        Assert.That(Flow.EnterCode(trace, HighNeedsFlow.TrtCdToku.ToString()), Is.True,
            "không gõ được mã vào ô 点 ở コードモード");

        var picker = Flow.WaitForPicker();
        Assert.That(picker, Is.Not.Null,
            $"mã {HighNeedsFlow.TrtCdToku} phải mở 処置選択. Hộp thoại: {Flow.DescribeDialogs()}");

        var rows = Flow.ReadPicker(picker!);
        var target = rows.FirstOrDefault(r => Txt.Int(r.Sub) == 0);
        Assert.That(target, Is.Not.Null,
            $"picker của mã 105 phải có 枝番 0. Đang có: {string.Join(" / ", rows.Select(r => r.Sub))}");

        Assert.That(Flow.CommitPick(picker!, target!.Index, trace), Is.True,
            "không chốt được dòng trong 処置選択");

        var silent = Flow.StaysSilent(seconds: 8);
        trace.Shot("dis-flg-1-sau-khi-chot-105");

        Assert.That(silent, Is.True,
            $"dis_flg = {DisFlgHandicapped} (歯科診療困難者) mà app vẫn hỏi. frm203016.cs:1098 so " +
            "BẰNG 3 (`patData.ins.dis_flg == 3`), KHÔNG phải `>= 1`. Hỏi ở đây nghĩa là điều " +
            "kiện đang bị nới — rất dễ xảy ra vì cùng hàm 自動算定 có câu 特１/特２ dùng " +
            $"`intSins >= 1` (modSave.cs:3097). Hộp thoại: {Flow.DescribeDialogs()}");

        // Dòng vẫn phải được chèn, và freewd vẫn trống.
        var row = Flow.RowNamed(target.Name.Trim());
        Assert.That(row, Is.Not.Null,
            $"không hỏi KHÔNG có nghĩa là không chèn — dòng 「{target.Name.Trim()}」 phải trên lưới");
        Assert.That(HighNeedsFlow.IsFreewdEmpty(row!.Freewd), Is.True,
            $"không hỏi thì không ghi gì. Đang là: {row}");

        TestContext.Out.WriteLine(
            $"=== KQ-D1 === dis_flg={DisFlgHandicapped} → KHÔNG hỏi; {row}");
        TestContext.Out.WriteLine(
            "=== KQ-D1 === Chốt lại: 「困難者」 trong tên 歯科診療困難者加算 là KẾT QUẢ của " +
            "câu trả lời 「はい」 (freewd 「1」 → getTensu đọc thành 加算1, CommonChk.cs:109), " +
            "KHÔNG phải điều kiện để hỏi. Điều kiện là dis_flg == 3 (歯科診療特別対応).");

        Flow.DismissAll();
    }
}
