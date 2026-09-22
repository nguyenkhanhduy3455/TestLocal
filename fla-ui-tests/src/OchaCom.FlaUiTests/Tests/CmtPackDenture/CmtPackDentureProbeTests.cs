using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackDenture;

/// <summary>
/// PROBE của luồng 歯管-有床義歯 — <b>không assert gì</b>, chỉ chụp ảnh và in ra app thật
/// làm gì (F1). Chạy cái này TRƯỚC khi tin bất cứ assert nào của
/// <see cref="CmtPackDentureNoExamTests"/> / <see cref="CmtPackDenturePlaqueTests"/>.
///
/// <para><b>Câu hỏi probe trả lời:</b></para>
/// <list type="number">
///   <item><c>KQ-P1</c> — gõ 歯管 dưới một 部位病名行 thì <b>có hộp thoại nào bung ra không</b>,
///     hay <c>frm203018</c> tự đóng ngay vì chỉ có 1 候補? Đây là thứ quyết định hình thức của
///     mọi ca đo; đoán sai là viết cả fixture theo hướng sai.</item>
///   <item><c>KQ-P2</c> — dòng comment rơi xuống lưới trông <b>nguyên văn</b> thế nào (để
///     hằng số <see cref="CmtPackDentureMasterTests.PackCommentText"/> khớp thật, không phải
///     khớp theo bản đã làm phẳng).</item>
///   <item><c>KQ-P3</c> — dòng 歯管 có <b>thật sự nhận được 病名</b> từ <c>AutoBui</c> không
///     (ô 病名 của dòng ngay trên và của chính dòng đó).</item>
/// </list>
///
/// <para>Probe <b>KHÔNG seed</b>: nó chạy trên trạng thái nguyên bản của bệnh nhân, nên kết
/// quả 「pack HIỆN」 là bình thường khi bệnh nhân chưa từng có 歯周病検査.</para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chạy tay để NHÌN app làm gì; không assert, không kết luận.")]
[CancelAfter(900_000)]
public sealed class CmtPackDentureProbeTests : CmtPackDentureUiTestBase
{
    protected override bool RequiresExistingTeeth => false;

    /// <inheritdoc/>
    protected override IReadOnlyList<int> CarrierDiseases => [393, 369];

    [Test]
    [Description("TcDP0 — gõ 歯管 dưới 部位病名行 mang Ｃ(100): có hộp thoại nào không, comment ra sao")]
    public void TcDP0_Enter_Shikan_Under_Disease_And_Watch()
    {
        using var trace = TestTrace.Begin();

        try { LogMaster(); }
        catch (Exception e) { Log($"(đọc master hỏng, đi tiếp): {e.Message}"); }

        Log("lưới TRƯỚC khi gõ:\n  " + string.Join("\n  ", Flow.DescribeGrid()));
        trace.Shot("luoi-truoc");

        foreach (var (disCd, kbn, why) in CmtPackDentureMasterTests.DentureProbeDiseases.Take(2))
        {
            Log($"───────── 病名 {disCd} (dis_kbn {kbn}) — {why}");
            try
            {
                var m = MeasureDenture(disCd, trace);

                Log($"=== KQ-P1 === 病名 {disCd}: {m.Cascade.Dialogs.Count} hộp thoại bung ra");
                foreach (var d in m.Cascade.Dialogs) Log($"   {d}");

                Log($"=== KQ-P2 === 病名 {disCd}: {m.Cascade.CommentRows.Count} dòng comment");
                foreach (var r in m.Cascade.CommentRows)
                    Log($"   nguyên văn 療法・処置 = 「{r.Ryo}」 · 点 = 「{r.Ten}」 · 回 = 「{r.Kai}」");

                Log($"=== KQ-P3 === 病名 {disCd}: pack {(m.PackShown ? "HIỆN" : "ẨN")}");
            }
            catch (Exception e)
            {
                // Probe KHÔNG BAO GIỜ ném — ghi lại rồi đi tiếp (F1).
                Log($"⚠️ 病名 {disCd} hỏng giữa chừng: {e.GetType().Name}: {e.Message}");
                trace.Shot($"hong-{disCd}");
                try { Log("dẹp hộp thoại: " + string.Join(" | ", Flow.DismissAll(4, trace))); }
                catch (Exception e2) { Log($"   dẹp cũng hỏng: {e2.Message}"); }
            }

            Log("lưới sau lượt này:\n  " + string.Join("\n  ", Flow.DescribeGrid()));
        }

        trace.Shot("luoi-sau");
        Log("⚠️ PROBE — không kết luận gì ở đây. Đọc ảnh trong artifacts\\screenshots\\ trước.");
    }
}
