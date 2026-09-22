using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.CmtPackType10;

namespace OchaCom.FlaUiTests.Tests.CmtPackDenture;

/// <summary>
/// Khoá <b>TIỀN ĐỀ</b> của mọi ca UI trong luồng 歯管-有床義歯 — <b>chỉ hỏi DB, KHÔNG mở
/// app</b>, chạy vài giây. <b>CHẠY CÁI NÀY TRƯỚC MỌI THỨ.</b>
///
/// <para>Mỗi ca ở đây trả lời một câu mà nếu sai thì ca UI tương ứng sẽ kết luận
/// <b>NGƯỢC mà vẫn xanh</b> — xem từng <c>Description</c>.</para>
///
/// <para>Nguồn yêu cầu: <c>userapp/fla-ui-todo-inp-legacy-sync-20260921.md</c> §C1.
/// Nguồn chân lý: <c>userapp/src_20260921/OCHACOM/INP/Lib/CmtAuto.cs:190-236</c>.</para>
/// </summary>
[TestFixture]
[Category("db-only")]
public sealed class CmtPackDentureMasterTests
{
    /// <summary>Pack 摘要コメント của nhánh 歯管-有床義歯 (<c>MST_CMT_PACK_DEF.condition</c>).</summary>
    public const string PackCd = "B000-4-1";

    /// <summary>Nguyên văn 候補 duy nhất của pack — <c>MST_COMMENT.com_nm</c> của 820101879.</summary>
    public const string PackCommentText = "有床義歯に係る口腔管理のみ";

    /// <summary>
    /// Bảy <c>dis_kbn</c> mà <c>CmtAuto.cs:206-220</c> coi là 欠損系 — <b>53, 54, 60 CỐ Ý
    /// không có mặt</b>, dù nhóm F5 欠損補綴 là 51..60.
    /// </summary>
    public static readonly int[] DentureDisKbns = [51, 52, 55, 56, 57, 58, 59];

    /// <summary>Ba <c>dis_kbn</c> thuộc 51..60 mà nhánh 欠損 KHÔNG nhận — cốt lõi của §C1.</summary>
    public static readonly int[] NonDentureDisKbns = [53, 54, 60];

    private DentureSeedDb _db = null!;
    private CmtPackDb _master = null!;
    private TestSettings _settings = null!;
    private DateTime _on;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    [OneTimeSetUp]
    public void SetUp()
    {
        _settings = TestSettings.Current;
        _on = _settings.Patient.ResolvedTrtDate;

        _db = DentureSeedDb.CreateOrNull(_settings)
              ?? throw new IgnoreException("Cần db.enabled = true + connectionString để hỏi master.");
        if (_db.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} " +
                          "(container OCHASQLEXPRESS trên máy Mac còn chạy không?)");

        _master = CmtPackDb.CreateOrNull(_settings)
                  ?? throw new IgnoreException("Cần db.enabled = true để đọc MST_CMT_PACK.");
        Log($"=== master hỏi cho ngày {_on:yyyy-MM-dd}, bảng 病名 = {_db.DiseaseTable(_on)} ===");
    }

    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCD_0 — 116/7 歯管 kích hoạt ĐÚNG MỘT pack, và đó là B000-4")]
    public void TCD_0_Trt116_7_Triggers_Only_B000_4()
    {
        var trtCd = _settings.CmtPackDenture.TrtCd;
        var trtSb = _settings.CmtPackDenture.TrtSb;

        var packs = _master.PacksFor(trtCd, trtSb, _on);
        Log($"=== KQ-0 === {trtCd}/{trtSb} kích hoạt {packs.Count} pack:");
        foreach (var p in packs) Log($"   {p}");

        Assert.That(packs.Select(p => p.PackCd), Does.Contain(PackCd),
            $"{trtCd}/{trtSb} KHÔNG còn kích hoạt pack {PackCd} trên master này " +
            "(MST_CMT_PACK, APP_ST_DT/APP_ED_DT). Mọi ca UI của luồng đo bằng cách gõ mã này, " +
            "nên đỏ ở đây = TIỀN ĐỀ hỏng, không phải app sai.");

        Assert.That(packs, Has.Count.EqualTo(1),
            $"{trtCd}/{trtSb} kích hoạt {packs.Count} pack chứ không phải 1. Ca UI đọc 「có dòng " +
            $"comment nào rơi xuống lưới không」 làm mốc cho riêng {PackCd}; thêm pack khác thì " +
            "mốc đó lẫn và kết luận về 欠損病名 mất nghĩa. Pack: " +
            string.Join(" / ", packs.Select(p => p.PackCd)));
    }

    [Test, Order(2)]
    [Description("TCD_1 — B000-4-1 có NHIỀU HƠN 1 候補 ⇒ frm203018 ĐỨNG LẠI chờ chọn")]
    public void TCD_1_Pack_Dialog_Stays_Open()
    {
        var details = _master.Details(PackCd, _on);
        Log($"=== KQ-1 === {PackCd} có {details.Count} 候補:");
        foreach (var d in details) Log($"   {d}");

        Assert.That(details, Has.Count.GreaterThan(1),
            $"{PackCd} chỉ có {details.Count} 候補. Con số này quyết định HÌNH THỨC của phép đo: " +
            "đúng 1 dòng thì frm203018 gọi thẳng defData() rồi ĐÓNG NGAY (frm203018.cs:322-324) — " +
            "hộp thoại chỉ loé qua, không bắt được, và ca UI phải chuyển sang đo 「dòng comment có " +
            "rơi xuống lưới không」. Nhiều hơn 1 thì hộp thoại ĐỨNG LẠI và ca UI đo được TRỰC TIẾP " +
            "— đó là điều bộ ca hiện tại đang giả định. Đỏ ở đây ⇒ sửa CÁCH ĐO, đừng sửa assert.\n" +
            "  ⚠️ Con số này KHÁC NHAU giữa hai instance SQL trên máy Mac: cổng 1433 có pack " +
            "「B000-4」 với 1 候補, cổng 1434 (DB mà MENU.exe thật sự đọc, theo " +
            "C:\\NEW_SIM2000\\Ocha.xml) có 「B000-4-1」 với 2 候補. Đo nhầm instance là kết luận " +
            "sai toàn tập — xem README §「Hai DB」.");
    }

    [Test, Order(3)]
    [Description("TCD_2 — 候補 duy nhất mang đúng chuỗi 「有床義歯に係る口腔管理のみ」")]
    public void TCD_2_Candidate_Text_Is_The_Denture_Comment()
    {
        var details = _master.Details(PackCd, _on);
        Assert.That(details, Is.Not.Empty, $"{PackCd} không có 候補 nào — xem TCD_1.");

        var shown = details.Select(d => d.DisplayText).ToList();
        Log($"=== KQ-2 === 候補 in ra lưới: {string.Join(" | ", shown)}");

        Assert.That(shown, Has.Some.Contains(PackCommentText),
            $"候補 của {PackCd} không mang chuỗi 「{PackCommentText}」 " +
            "(MST_COMMENT.com_nm của com_cd 820101879). Ca UI tìm ĐÚNG chuỗi này trong ô " +
            "療法・処置 của dòng comment; đổi chuỗi ở master mà không sửa hằng số này thì mọi " +
            "ca UI sẽ đỏ với lý do sai.");
    }

    [Test, Order(4)]
    [Description("TCD_3 — §C1: cả 51..60 ĐỀU có 病名 thật ⇒ câu hỏi 53/54/60 là đo được, không phải giả định")]
    public void TCD_3_All_DisKbn_51_60_Exist_In_Master()
    {
        var counts = _db.DiseaseKbnCounts(_on);
        Log("=== KQ-3 === số 病名 (dis_sb = 0) theo dis_kbn, bảng " + _db.DiseaseTable(_on) + ":");
        foreach (var kbn in Enumerable.Range(51, 10))
            Log($"   dis_kbn {kbn}: {(counts.TryGetValue(kbn, out var n) ? n : 0)} 病名" +
                (DentureDisKbns.Contains(kbn) ? "   ← 欠損系 theo CmtAuto.cs:206-220" : ""));

        var missing = NonDentureDisKbns.Where(k => !counts.ContainsKey(k) || counts[k] == 0).ToList();
        Assert.That(missing, Is.Empty,
            $"dis_kbn [{string.Join(",", missing)}] KHÔNG có 病名 nào trên master này. §C1 hỏi " +
            "「WinForm có coi 53/54/60 là 欠損 không」 — không có dữ liệu thì câu hỏi đó không đo " +
            "được bằng giao diện, và ca UI tương ứng phải Ignore chứ không được xanh.");

        var missingDenture = DentureDisKbns.Where(k => !counts.ContainsKey(k) || counts[k] == 0).ToList();
        Assert.That(missingDenture, Is.Empty,
            $"dis_kbn 欠損系 [{string.Join(",", missingDenture)}] không có 病名 nào — ca 「欠損病名 " +
            "⇒ HIỆN」 không dựng được.");
    }

    [Test, Order(5)]
    [Description("TCD_4 — các dis_cd mà ca UI sẽ gõ có đúng dis_kbn mong đợi")]
    public void TCD_4_Probe_Disease_Codes_Have_Expected_Kbn()
    {
        Log("=== KQ-4 === 病名 mà ca UI dùng:");
        foreach (var (disCd, wantKbn, why) in DentureProbeDiseases)
        {
            var row = _db.Disease(disCd, _on);
            Log($"   {(row?.ToString() ?? $"dis_cd {disCd}: KHÔNG CÓ")}   ← {why}");

            Assert.That(row, Is.Not.Null,
                $"dis_cd {disCd} không có trên bảng {_db.DiseaseTable(_on)}. Ca UI gõ mã này vào " +
                "病名選択; không có thì app bung E00024 và lượt đo mất trắng.");
            Assert.That(row!.DisKbn, Is.EqualTo(wantKbn),
                $"dis_cd {disCd} 「{row.DisNm}」 mang dis_kbn = {row.DisKbn}, ca UI lại đang giả " +
                $"định {wantKbn} ({why}). Kết luận của ca UI đọc theo dis_kbn, nên lệch ở đây là " +
                "ca UI đo NHẦM nhóm — sửa hằng số trong DentureProbeDiseases, đừng sửa assert.");
        }
    }

    [Test, Order(6)]
    [Description("TCD_5 — bệnh nhân test KHÔNG sẵn có 歯周病検査 đủ tư cách ⇒ ca 「không 現存歯」 dựng được")]
    public void TCD_5_Patient_Has_No_Qualifying_Plaque_Row()
    {
        var patNo = int.Parse(_settings.Patient.PatNo);
        var n = _db.QualifyingPlaqueRows(patNo);
        var missing = _db.MissingTeethSlots(patNo);

        Log($"=== KQ-5 === bệnh nhân {patNo}: {n} dòng 歯周病検査 đủ tư cách (ngoài dải seed); " +
            $"SIGA đánh 欠損 ở ô [{string.Join(",", missing)}]");

        Assert.That(n, Is.EqualTo(0),
            $"Bệnh nhân {patNo} đã sẵn có {n} dòng 歯周病検査 mang 病名 Ｐ/単Ｇ và có 部位. " +
            "getPlaqueTeeth sẽ trả về dòng đó ⇒ nhánh 「còn 現存歯」 luôn đúng ⇒ ca §C3 " +
            "(「chưa từng có 歯周病検査 thì pack HIỆN」) đo ra KẾT QUẢ NGƯỢC mà vẫn xanh. " +
            "Đổi sang bệnh nhân khác, hoặc chấp nhận bỏ ca §C3.");

        Assert.That(missing, Is.Not.Empty.Or.Empty, "chỉ để in ra — không phải điều kiện.");
    }

    /// <summary>
    /// 病名 mà các ca UI gõ vào 病名選択, kèm <c>dis_kbn</c> mong đợi và lý do chọn.
    /// <see cref="TCD_4_Probe_Disease_Codes_Have_Expected_Kbn"/> khoá lại bộ này.
    /// </summary>
    public static readonly (int DisCd, int DisKbn, string Why)[] DentureProbeDiseases =
    [
        (393, 51, "MT — 欠損, NẰM TRONG bộ 7 giá trị ⇒ bước 1 bật cờ, pack HIỆN"),
        (369, 53, "Brダツリ — 51..60 nhưng NGOÀI bộ 7 ⇒ rơi xuống bước 2 (現存歯)"),
        (302, 54, "Brハソン — 51..60 nhưng NGOÀI bộ 7 ⇒ rơi xuống bước 2"),
        (155, 60, "歯ぎしり — 51..60 nhưng NGOÀI bộ 7 ⇒ rơi xuống bước 2"),
        (100,  1, "Ｃ — đối chứng, ngoài hẳn nhóm 欠損補綴"),
    ];
}
