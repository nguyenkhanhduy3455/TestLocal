using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.CmtPackType10;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// <c>exit_flg</c> — vòng ĐO BẰNG DB, <b>KHÔNG mở app</b>, vài giây. Chạy cái này TRƯỚC
/// mọi ca giao diện: nó khoá lại <b>tiền đề</b> mà tất cả các ca UI đứng lên.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>prgCmtAuto</c> chạy MỌI pack của một 処置 trong một vòng lặp theo <c>seq_no</c>, và
/// <b>một dòng <c>exit_flg</c> cắt sạch phần còn lại</b>:
/// <code>
///   for (i = 0; i &lt; MstCmtPackData.Count; i++) {   // ORDER BY a.seq_no
///       …
///       if (exit_flg == true) break;                  // CmtAuto.cs:917-919
///   }
/// </code>
/// Cờ đó đến từ <b>master</b>, và với pack <c>type 1</c> thì từ <b>đúng cái dòng người dùng
/// chọn</b> (frm203018.cs:488). Nên trước khi đo giao diện phải biết chắc master đang nói gì
/// — nếu không thì một ca UI đỏ chẳng phân biệt được 「app sai」 với 「master ở máy này khác」.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÁC CA
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TCX-0  bảng tra: mọi pack type 1 còn sống có 候補 exit_flg TRỘN (t lẫn f)
///          → đây là danh sách chỗ web CHẮC CHẮN lệch nếu chỉ xét 「mọi 候補 đều exit」
///   TCX-1  I017 口腔内装置 (195/0) — 4 pack, 12 候補, exit_flg đúng 8 t / 4 f
///   TCX-2  B014 退院時共同指導料 (108/4, 108/5) — 3 pack, 候補 「１回目」 exit_flg = t
///   TCX-3  I030 歯清 (108/2) — 6 pack, 歯清-特 (seq 3) exit_flg = t ⇒ cắt seq 4..7
///   TCX-4  I011-2-1-1 ＳＰＴ (167/1-3) — 初回 exit_flg = t, và com_cd pattern 50 (ĐỦ NGÀY)
/// </code>
///
/// <para>Chạy: <c>.\run-cmt-pack-exit-flg.ps1</c> (không mở app).</para>
/// </summary>
[TestFixture]
[NonParallelizable]
public sealed class CmtPackExitFlgMasterTests
{
    private CmtPackDb _db = null!;
    private DateTime _date;

    // ── Mã 処置 của luồng ────────────────────────────────────────────────────

    /// <summary>口腔内装置 ＯＡｐ３ — 680点, <c>KOUKU/CHISI/KESSON = 0</c> ⇒ KHÔNG mở 部位選択.</summary>
    public const int OralApplianceTrtCd = 195;
    public const int OralApplianceTrtSb = 0;

    /// <summary>
    /// 退院時共同指導料１<b>(１以外)</b> — 500点, không cần 部位.
    ///
    /// <para>⚠️ <b>Cố ý là 枝番 5, KHÔNG phải 4.</b> Đo được 2026-09-17 (TCX-9 lượt đầu):
    /// gõ <c>108/4</c> 「退院時共同指導料1(歯援診1/歯援診2)」 trên máy test thì app bung
    /// 「08/03 108-4 …を算定していますが、歯援診1、歯援診2、歯援病の届出が必要です。」, 月計 <b>Δ 0</b>
    /// và <b>không pack nào chạy</b> — phòng khám test không có 施設基準届出 đó. Đấy là giới hạn
    /// của DỮ LIỆU máy test, không phải của cascade. <c>108/5</c> là đúng biến thể dành cho
    /// phòng khám không có 届出, và TCX-2 đã khoá rằng nó kích hoạt CÙNG ba pack
    /// <c>B014-1/2/3</c>.</para>
    /// </summary>
    public const int DischargeGuidanceTrtCd = 108;
    public const int DischargeGuidanceTrtSb = 5;

    /// <summary>機械的歯面清掃処置 歯清 — 72点.</summary>
    public const int SiseiTrtCd = 108;
    public const int SiseiTrtSb = 2;

    /// <summary>ＳＰＴ(1～9歯) — ⚠️ <c>KESSON = 9</c>, khác hẳn ba mã trên (xem TCX-4).</summary>
    public const int SptTrtCd = 167;
    public const int SptTrtSb = 1;

    // ── pack_cd ──────────────────────────────────────────────────────────────

    public const string OralAppliancePackCd = "I017";
    public const string DischargeListPackCd = "B014-2";
    public const string SiseiTokuPackCd = "I030-2";
    public const string SptPackCd = "I011-2-1-1";

    /// <summary>
    /// 候補 của <c>I017</c> KHÔNG dừng cascade — <c>exit_flg = false</c>.
    /// <c>seq_no</c> của <c>MST_CMT_PACK_DETAIL</c>, chính là ô 番号 trên frm203018.
    /// </summary>
    public static readonly int[] OralApplianceContinueSeqs = [7, 10, 11, 12];

    /// <summary>候補 dừng cascade — 8 dòng còn lại.</summary>
    public static readonly int[] OralApplianceExitSeqs = [1, 2, 3, 4, 5, 6, 8, 9];

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    [OneTimeSetUp]
    public void MasterOneTimeSetUp()
    {
        var settings = TestSettings.Current;
        _date = settings.Patient.ResolvedTrtDate;

        var db = CmtPackDb.CreateOrNull(settings);
        if (db is null)
            Assert.Ignore("Cần db.enabled = true + connectionString — luồng này chỉ đọc master.");
        if (db!.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} " +
                          "(container OCHASQLEXPRESS trên máy Mac còn chạy không?)");
        _db = db;

        Log($"算定日 đem tra = {_date:yyyy-MM-dd} (patient.trtDate) · chuỗi app truyền vào SQL " +
            $"「{CmtPackDb.AppDt(_date)}」");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-0 — bảng tra
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TCX-0 (chỉ DB) — mọi pack type 1 có 候補 exit_flg TRỘN: chỗ web chắc chắn lệch")]
    public void TCX_0_Which_Type1_Packs_Have_Mixed_Exit_Flags()
    {
        // Quét theo pack_cd của bốn cụm đang đo + mọi pack type 1 mà chúng dẫn tới.
        var packCds = new[]
        {
            (Trt: $"{OralApplianceTrtCd}/{OralApplianceTrtSb}", Cd: OralApplianceTrtCd, Sb: OralApplianceTrtSb),
            (Trt: $"{DischargeGuidanceTrtCd}/{DischargeGuidanceTrtSb}", Cd: DischargeGuidanceTrtCd, Sb: DischargeGuidanceTrtSb),
            (Trt: $"{SiseiTrtCd}/{SiseiTrtSb}", Cd: SiseiTrtCd, Sb: SiseiTrtSb),
            (Trt: $"{SptTrtCd}/{SptTrtSb}", Cd: SptTrtCd, Sb: SptTrtSb),
        };

        var mixed = new List<string>();

        Log("=== KQ-1 === cascade của từng 処置 (thứ tự = thứ tự prgCmtAuto chạy)");
        foreach (var (trt, cd, sb) in packCds)
        {
            var packs = _db.PacksFor(cd, sb, _date);
            Log($"");
            Log($"処置 {trt} → {packs.Count} pack:");
            foreach (var p in packs)
            {
                var details = _db.Details(p.PackCd, _date);
                var exits = details.Count(d => d.ExitFlg);
                var note = details.Count == 0
                    ? "(không có MST_CMT_PACK_DETAIL — câu comment lấy từ com_cd1/com_cd2 của PACK_DEF)"
                    : $"{details.Count} 候補, {exits} có exit_flg";
                Log($"   {p} — {note}");
                foreach (var d in details) Log($"        {d}");

                if (details.Count > 1 && exits > 0 && exits < details.Count)
                    mixed.Add($"{p.PackCd} (type {p.PackType}, {exits}/{details.Count} 候補 exit)");
            }
        }

        Log("");
        Log("=== KQ-2 === pack có 候補 TRỘN exit_flg — cascade phụ thuộc DÒNG NGƯỜI DÙNG CHỌN");
        foreach (var m in mixed) Log($"   · {m}");

        // ⛔ Đây KHÔNG phải assert về app; nó khoá lại tiền đề của mọi ca UI phía sau.
        // Rỗng ⇒ master ở máy này khác hẳn máy đã khảo sát, và mọi ca UI dưới đây vô nghĩa.
        Assert.That(mixed, Is.Not.Empty,
            "Không pack type 1 nào có 候補 TRỘN exit_flg ⇒ tiền đề của cả luồng này không thành " +
            "trên master của máy này. Đọc lại KQ-1 rồi mới chạy ca UI — đừng sửa assert.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-1 — I017 口腔内装置
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCX-1 (chỉ DB) — 195/0 kích hoạt 4 pack; I017 có 12 候補, exit_flg 8 t / 4 f")]
    public void TCX_1_OralAppliance_Master_Has_Mixed_Exit_Flags()
    {
        var packs = _db.PacksFor(OralApplianceTrtCd, OralApplianceTrtSb, _date);
        Log($"=== KQ-3 === 処置 {OralApplianceTrtCd}/{OralApplianceTrtSb} → {packs.Count} pack");
        foreach (var p in packs) Log($"   {p}");

        var details = _db.Details(OralAppliancePackCd, _date);
        Log("");
        Log($"=== KQ-4 === {OralAppliancePackCd} có {details.Count} 候補");
        foreach (var d in details)
            Log($"   番号 {d.SeqNo,2} exit_flg={(d.ExitFlg ? "t" : "f")} 「{d.DisplayText}」");

        var continues = details.Where(d => !d.ExitFlg).Select(d => d.SeqNo).OrderBy(x => x).ToArray();
        var exits = details.Where(d => d.ExitFlg).Select(d => d.SeqNo).OrderBy(x => x).ToArray();

        Assert.Multiple(() =>
        {
            Assert.That(packs.Select(p => p.PackCd), Is.EqualTo(new[] { "I017", "I017-1", "I017-2", "I017-3" }),
                $"Thứ tự pack của {OralApplianceTrtCd}/{OralApplianceTrtSb} phải đúng ORDER BY a.seq_no " +
                "(MstCmtPack.cs:87) — đó cũng là thứ tự prgCmtAuto chạy và là thứ tự các hộp thoại bung ra. " +
                "Lệch ⇒ mọi ca UI của luồng này đang đo một cascade khác.");

            Assert.That(details, Has.Count.EqualTo(12),
                $"{OralAppliancePackCd} phải có 12 候補 — bảng ở userapp/fla-ui-todo-cmt-pack.md §A1.");

            Assert.That(continues, Is.EqualTo(OralApplianceContinueSeqs),
                "候補 KHÔNG dừng cascade phải đúng 4 dòng ト/ヌ日常/ヌ運動/ル. Đây là tiền đề của TCX-6/TCX-7: " +
                "chọn một trong bốn dòng này thì I017-1/2/3 mới chạy. Lệch ⇒ đổi số hiệu trong ca UI, " +
                "đừng sửa assert cho khớp.");

            Assert.That(exits, Is.EqualTo(OralApplianceExitSeqs),
                "候補 DỪNG cascade phải đúng 8 dòng còn lại (イ..ヘ, チ, リ).");
        });

        Log("");
        Log("⇒ Vế web: cascadePackAlwaysExits chỉ dừng khi MỌI 候補 đều exit_flg. Với I017 thì " +
            $"{exits.Length}/{details.Count} 候補 exit ⇒ điều kiện đó KHÔNG BAO GIỜ đúng ⇒ web chạy tiếp " +
            "cả ba pack đuôi kể cả khi người dùng chọn 番号 1. Đo TCX-5 để chốt.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-2 — B014 退院時共同指導料
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCX-2 (chỉ DB) — 108/4 và 108/5 cùng 3 pack; B014-2 có 2 候補, 「１回目」 exit_flg = t")]
    public void TCX_2_DischargeGuidance_Master()
    {
        foreach (var sb in new[] { 4, 5 })
        {
            var packs = _db.PacksFor(DischargeGuidanceTrtCd, sb, _date);
            Log($"=== KQ-5 === 処置 {DischargeGuidanceTrtCd}/{sb} → {packs.Count} pack");
            foreach (var p in packs) Log($"   {p}");

            Assert.That(packs.Select(p => p.PackCd), Is.EqualTo(new[] { "B014-1", "B014-2", "B014-3" }),
                $"{DischargeGuidanceTrtCd}/{sb} phải kích hoạt đúng 3 pack theo thứ tự — " +
                "B014-1 (90, 保険医療機関名) → B014-2 (1, danh sách) → B014-3 (90, 該当する病名).");
        }

        var details = _db.Details(DischargeListPackCd, _date);
        Log("");
        Log($"=== KQ-6 === {DischargeListPackCd} có {details.Count} 候補");
        foreach (var d in details)
            Log($"   番号 {d.SeqNo,2} exit_flg={(d.ExitFlg ? "t" : "f")} 「{d.DisplayText}」");

        var first = details.FirstOrDefault(d => Txt.Has(d.DisplayText, "１回目"));
        Assert.Multiple(() =>
        {
            Assert.That(details, Has.Count.EqualTo(2),
                $"{DischargeListPackCd} phải có đúng 2 候補: 「１回目（退院時共同指導料１）」 và dòng " +
                "hướng dẫn 「※上記に該当しない場合、[F10戻る]ﾎﾞﾀﾝを押下してください」.");

            Assert.That(first, Is.Not.Null,
                "Không thấy 候補 「１回目」 — đó là dòng MANG exit_flg, không có nó thì TCX-8 vô nghĩa.");

            Assert.That(first!.ExitFlg, Is.True,
                "候補 「１回目（退院時共同指導料１）」 phải có exit_flg = true ⇒ chọn nó thì B014-3 " +
                "(該当する病名) KHÔNG được mở. Đó chính là phép đo TCX-8.");

            Assert.That(details.Count(d => d.ExitFlg), Is.EqualTo(1),
                "Chỉ MỘT trong hai 候補 được mang exit_flg — nếu cả hai cùng mang thì B014-3 là " +
                "code chết và ca đối chứng TCX-9 không dựng được.");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-3 — I030 歯清
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCX-3 (chỉ DB) — 108/2 kích hoạt 6 pack; 歯清-特 (seq 3) exit_flg = t ⇒ cắt seq 4..7")]
    public void TCX_3_Sisei_Cascade_Is_Cut_By_Toku()
    {
        var packs = _db.PacksFor(SiseiTrtCd, SiseiTrtSb, _date);
        Log($"=== KQ-7 === 処置 {SiseiTrtCd}/{SiseiTrtSb} → {packs.Count} pack (thứ tự = seq_no)");

        var cutAt = -1;
        for (var i = 0; i < packs.Count; i++)
        {
            var details = _db.Details(packs[i].PackCd, _date);
            var exits = details.Count(d => d.ExitFlg);
            Log($"   [{i}] {packs[i]} — {details.Count} 候補, {exits} exit_flg");
            foreach (var d in details) Log($"        {d}");

            // type 10 lấy exit_flg của DETAIL[0] (setPacData, CmtAuto.cs:3659) — không phải
            // 「có dòng nào exit」 mà là ĐÚNG DÒNG ĐẦU.
            if (cutAt < 0 && packs[i].PackType == 10 && details.Count > 0 && details[0].ExitFlg)
                cutAt = i;
        }

        Assert.Multiple(() =>
        {
            Assert.That(packs.Select(p => p.PackCd),
                Is.EqualTo(new[] { "I030", "I030-2", "I030-2-1", "I030-2-2", "I030-2-3", "I030-3" }),
                "Cụm 歯清 phải là đúng 6 pack theo thứ tự này — nền của mọi ca 歯清 ở cả hai luồng " +
                "(xem CmtPackType10/README.md mục 2).");

            Assert.That(cutAt, Is.GreaterThanOrEqualTo(0),
                "Không pack type 10 nào của cụm 歯清 mang exit_flg ở 候補 ĐẦU ⇒ không có điểm cắt, " +
                "và phép đo B1 (userapp/fla-ui-todo-cmt-pack.md §B1) không còn gì để đo.");

            Assert.That(packs[cutAt].PackCd, Is.EqualTo(SiseiTokuPackCd),
                $"Điểm cắt đầu tiên phải là {SiseiTokuPackCd} (歯清-特). Đang là 「{packs[cutAt].PackCd}」 " +
                "⇒ thứ tự seq_no trong master đã đổi, đọc KQ-7 trước khi sửa vế web.");
        });

        var cut = packs.Skip(cutAt + 1).Select(p => $"{p.PackCd} ({p.Condition})").ToList();
        Log("");
        Log($"⇒ Khi 歯清-特 ra câu (tức cùng ngày có 歯科診療特別対応加算), {cut.Count} pack phía sau " +
            $"KHÔNG chạy: {string.Join(" · ", cut)}");
        Log("   Trong đó I030-3 là pack type 1 ⇒ hộp thoại 歯清-月１回 cũng KHÔNG mở.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCX-4 — ＳＰＴ
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TCX-4 (chỉ DB) — I011-2-1-1: 初回 exit_flg = t, và com_cd pattern 50 ⇒ in ĐỦ NGÀY")]
    public void TCX_4_Spt_Master()
    {
        var packs = _db.PacksFor(SptTrtCd, SptTrtSb, _date);
        Log($"=== KQ-8 === 処置 {SptTrtCd}/{SptTrtSb} → {packs.Count} pack");
        foreach (var p in packs) Log($"   {p}");

        var details = _db.Details(SptPackCd, _date);
        Log("");
        Log($"=== KQ-9 === {SptPackCd} có {details.Count} 候補");
        foreach (var d in details)
            Log($"   番号 {d.SeqNo,2} exit_flg={(d.ExitFlg ? "t" : "f")} com_cd {d.ComCd} " +
                $"pattern {d.Pattern} 「{d.DisplayText}」 fmt_str 「{d.FmtStr}」");

        var firstTime = details.FirstOrDefault(d => Txt.Has(d.DisplayText, "初回"));
        var lastTime = details.FirstOrDefault(d => Txt.Has(d.DisplayText, "前回実施年月"));

        Assert.Multiple(() =>
        {
            Assert.That(packs.Select(p => p.PackCd), Is.EqualTo(new[] { "I011-2-1-1", "I011-2-1-2" }),
                "ＳＰＴ phải kích hoạt I011-2-1-1 (type 10, 前回実施年月) rồi I011-2-1-2 (type 1, ３ヶ月以内). " +
                "⚠️ Ghi chú gốc từng viết nhầm pack sống là I011-2-3 — cái đó hết hạn 2026-05-31.");

            Assert.That(firstTime, Is.Not.Null, "Không thấy 候補 「初回（ＳＰＴ）」.");
            Assert.That(firstTime!.ExitFlg, Is.True,
                "候補 「初回（ＳＰＴ）」 phải có exit_flg = true ⇒ khi bệnh nhân CHƯA từng算定 ＳＰＴ thì " +
                "pack seq 2 (I011-2-1-2, hộp thoại ３ヶ月以内) KHÔNG mở. Đây là §B4 điểm 3.");

            Assert.That(lastTime, Is.Not.Null, "Không thấy 候補 「ＳＰＴ又はＰ重防前回実施年月」.");
            Assert.That(lastTime!.ExitFlg, Is.False,
                "Nhánh 「2回目以降」 KHÔNG được mang exit_flg — nếu mang thì hộp thoại ３ヶ月以内 " +
                "không bao giờ mở được cho ai cả.");

            // §B4 điểm 1 — chỗ dễ port sai nhất của ＳＰＴ.
            Assert.That(lastTime.Pattern, Is.EqualTo(50),
                $"com_cd của 「前回実施年月」 là 「{lastTime.ComCd}」 ⇒ pattern {lastTime.Pattern}. " +
                "Pattern PHẢI là 50: setPacData (CmtAuto.cs:3616-3627) rẽ theo hai ký tự giữa của " +
                "com_cd, và case 50 ghép 「com_nm + ' ' + gggyy年MM月dd日」 — tức ĐỦ NGÀY, và fmt_str " +
                "của dòng bị BỎ QUA hoàn toàn. Pattern khác ⇒ chuỗi ra khác hẳn, vế web port sai.");
        });

        Log("");
        Log("⇒ §B4 điểm 1 (chỉ master): 「ＳＰＴ又はＰ重防前回実施年月」 in ra ĐỦ NGÀY 令和○年○月○日, " +
            "KHÔNG phải chỉ 年月 — vì com_cd pattern 50 và fmt_str bị bỏ qua. Vẫn cần một lượt UI để " +
            "xác nhận chuỗi thật trên lưới (xem README mục 「Còn nợ」).");
        Log("⚠️ 167/1-3 có KESSON = 9 trong MST_TRT266, khác ba mã kia (đều = 0) ⇒ rất có thể mở " +
            "部位選択. Đừng viết ca UI cho ＳＰＴ theo khuôn của 195/0 trước khi probe.");
    }
}
