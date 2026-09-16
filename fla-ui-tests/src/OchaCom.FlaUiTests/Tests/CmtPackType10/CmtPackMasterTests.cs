using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackType10;

/// <summary>
/// 摘要コメントパック <b>type 10（自動選択）</b> — vòng ĐO BẰNG DB, <b>KHÔNG mở app</b>.
///
/// <para>Trả lời một câu duy nhất, và trả lời nó trước khi ai đó bỏ công port:
/// <b>trong 21 condition còn lại, cái nào còn có thể chạy với 算定日 của hôm nay?</b></para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CÂU HỎI ĐÓ ĐỨNG TRƯỚC
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>prgCmtAuto</c> chỉ nhìn thấy pack nào mà <c>getMstCmtPack</c> trả về, và câu SQL đó
/// lọc <b>hai lần</b> theo ngày (MstCmtPack.cs:84-86):
/// <code>
///   MST_CMT_PACK      a : @app_dt BETWEEN a.app_st_dt AND a.app_ed_dt   ← mã 処置 kích hoạt
///   MST_CMT_PACK_DEF  b : @app_dt BETWEEN b.app_st_dt AND b.app_ed_dt   ← định nghĩa pack
/// </code>
/// Pack hết hiệu lực ⇒ handler của nó là <b>code chết</b> với mọi 算定日 sau mốc. Port một
/// handler 177 dòng cho một nhánh không bao giờ chạy là công toi; mà bỏ qua nhầm một nhánh
/// còn sống thì レセプト in thiếu. Chỉ có master trả lời được, không phải code.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐO ĐƯỢC 2026-09-16 (SIM2000, 算定日 = 2026-09-16)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   CÒN SỐNG (17 condition)  hokan · HomonEisei · hosin2 · insurrance · IssueNumber ·
///                            Kankonsyo · koucyo · RCF · RCT-6-monthly · sosyaku · SPT ·
///                            TFix-PO · 歯在管 · 歯清-口管強(Ce) · 歯清-口管強(根C) ·
///                            歯清-特 · 未来院装着予定日
///                            (+ 前回実施年月 / 前回実施年月-F局 / condition rỗng: ĐÃ PORT)
///
///   ĐÃ CHẾT (4 condition = 12 pack)
///     歯CAD        8 pack  hết 2026-05-31  ← 令和８年６月改定 bỏ hẳn, KHÔNG có pack thay thế
///     Denture      2 pack  hết 2020-03-31
///     SPT2         1 pack  hết 2020-03-31
///     歯清-特導    1 pack  hết 2024-05-31
/// </code>
///
/// <para><b>Hệ quả cho vế web</b> — đây là chỗ đáng đọc nhất của cả file:</para>
/// <list type="bullet">
///   <item><b>歯CAD</b> (8 pack, handler 54 dòng + <c>chkTeethOcclusion</c> 107 dòng) và
///     <b>Denture</b> (177 dòng, handler dài nhất) — hai khối to nhất trong 30 pack còn lại —
///     <b>không chạy được với 算定日 hiện hành</b>. Chúng chỉ sống lại khi nhập/sửa 処置 cho
///     một ngày ≤ 2026-05-31 (歯CAD) hay ≤ 2020-03-31 (Denture).</item>
///   <item><b>SPT2</b> — cái bẫy 「lấy bản ghi CŨ NHẤT」 (§4.1 của
///     <c>cmt-pack-type10-remaining.md</c>) nằm trên pack đã chết từ 2020-03-31. Không đo
///     được trên giao diện, và cũng không ảnh hưởng ai. Xem TC10-0 để biết vì sao đừng
///     tốn thêm thời gian xác minh 「chủ ý hay bug」.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÁC CA
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TC10-0  bảng tra: mỗi condition → cửa sổ ngày, còn sống không, mã 処置 nào kích hoạt
///   TC10-1  bốn họ 歯CAD / Denture / SPT2 / 歯清-特導 phải KHÔNG kích hoạt được
///   TC10-2  歯清 (108/2) kích hoạt ĐÚNG 6 pack, ĐÚNG thứ tự seq_no — nền của mọi ca UI
///   TC10-3  cùng một pack_cd đổi condition theo ngày (I031: 前回実施年月 → 前回実施年月-F局)
/// </code>
///
/// <para>Chạy: <c>.\run-cmt-pack-type10.ps1 -Case TC10_0</c> (vài giây, không mở app).</para>
/// </summary>
[TestFixture]
[NonParallelizable]
public sealed class CmtPackMasterTests
{
    private TestSettings _settings = null!;
    private CmtPackDb _db = null!;
    private DateTime _date;
    private IReadOnlyList<CmtPackDb.PackDef> _defs = [];

    /// <summary>Bốn họ đã hết hiệu lực — đo 2026-09-16, xem phần tóm tắt ở đầu file.</summary>
    private static readonly string[] RetiredConditions = ["歯CAD", "Denture", "SPT2", "歯清-特導"];

    /// <summary>機械的歯面清掃処置 — mã dùng cho mọi ca UI của luồng này.</summary>
    public const int SiseiTrtCd = 108;
    public const int SiseiTrtSb = 2;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    [OneTimeSetUp]
    public void MasterOneTimeSetUp()
    {
        _settings = TestSettings.Current;
        _date = _settings.Patient.ResolvedTrtDate;

        var db = CmtPackDb.CreateOrNull(_settings);
        if (db is null)
            Assert.Ignore("Cần db.enabled = true + connectionString — luồng này chỉ đọc master.");
        if (db!.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} " +
                          "(container OCHASQLEXPRESS trên máy Mac còn chạy không?)");
        _db = db;
        _defs = _db.Type10Defs();

        Log($"算定日 đem tra = {_date:yyyy-MM-dd} (patient.trtDate) · app truyền vào SQL chuỗi " +
            $"「{CmtPackDb.AppDt(_date)}」");
        Log($"MST_CMT_PACK_DEF có {_defs.Count} dòng pack_type = 10 " +
            $"({_defs.Select(d => d.Condition).Distinct().Count()} condition khác nhau).");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC10-0 — bảng tra
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TC10-0 (chỉ DB) — mỗi condition type 10: cửa sổ ngày, còn sống không, mã 処置 kích hoạt")]
    public void TC10_0_Which_Conditions_Are_Still_Reachable()
    {
        var table = _db.ActiveTrtTable(_date);
        Log($"bản 処置マスタ đang áp dụng: {table}");
        Log("");

        var byCondition = _defs.GroupBy(d => d.Condition).OrderBy(g => g.Key, StringComparer.Ordinal);
        var alive = new List<string>();
        var dead = new List<string>();

        foreach (var group in byCondition)
        {
            var name = group.Key.Length == 0 ? "(rỗng → cmtPrevDate)" : group.Key;
            var live = group.Where(d => d.Covers(_date)).ToList();

            Log($"── {name}  ({group.Count()} dòng def, {live.Count} còn hiệu lực)");
            foreach (var def in group)
            {
                var triggers = _db.Triggers(def.PackCd, _date, table);
                var mark = def.Covers(_date) ? "SỐNG" : "chết";
                Log($"   [{mark}] {def.PackCd} [{def.Window}] 「{def.PackNm}」" +
                    (def.OnceDay ? " once_day" : "") + (def.OnceMonth ? " once_month" : ""));

                // Mã kích hoạt cũng có cửa sổ ngày RIÊNG — pack còn sống mà không mã nào
                // kích hoạt thì handler vẫn không bao giờ chạy.
                if (def.Covers(_date))
                {
                    Log(triggers.Count == 0
                        ? "          ⚠️ KHÔNG mã 処置 nào kích hoạt trong ngày này"
                        : "          ← " + string.Join(" · ", triggers.Take(8)) +
                          (triggers.Count > 8 ? $" … (+{triggers.Count - 8})" : ""));

                    foreach (var detail in _db.Details(def.PackCd, _date))
                        Log($"          → {detail}");
                }
            }

            if (live.Count > 0) alive.Add(name); else dead.Add(name);
        }

        Log("");
        Log($"CÒN SỐNG ({alive.Count}): " + string.Join(" · ", alive));
        Log($"ĐÃ CHẾT  ({dead.Count}): " + string.Join(" · ", dead));

        Assert.That(_defs, Is.Not.Empty,
            "MST_CMT_PACK_DEF không có dòng pack_type = 10 nào ⇒ hoặc sai DB, hoặc master chưa nạp. " +
            "Đỏ ở đây là HARNESS/DỮ LIỆU hỏng, không phải app.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC10-1 — bốn họ đã hết hiệu lực
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC10-1 (chỉ DB) — 歯CAD / Denture / SPT2 / 歯清-特導 không kích hoạt được với 算定日 này")]
    public void TC10_1_Retired_Families_Cannot_Fire()
    {
        if (_date < CmtPackDb.MedicalFeeRevision202606)
            Assert.Ignore($"算定日 {_date:yyyy-MM-dd} nằm TRƯỚC 令和８年６月改定 " +
                          $"({CmtPackDb.MedicalFeeRevision202606:yyyy-MM-dd}) ⇒ 歯CAD còn hiệu lực, " +
                          "ca này đo một tình huống khác. Đổi patient.trtDate rồi chạy lại.");

        var table = _db.ActiveTrtTable(_date);

        Assert.Multiple(() =>
        {
            foreach (var condition in RetiredConditions)
            {
                var group = _defs.Where(d => d.Condition == condition).ToList();
                Assert.That(group, Is.Not.Empty,
                    $"master không còn dòng nào mang condition 「{condition}」 — " +
                    "bảng đã đổi hẳn, đọc lại TC10-0 trước khi tin bất cứ kết luận cũ nào.");

                var live = group.Where(d => d.Covers(_date)).ToList();
                var lastDay = group.Max(d => d.AppEdDt);

                Log($"{condition}: {group.Count} pack, cửa sổ muộn nhất kết thúc {lastDay}");

                // ⛔ ĐỪNG SỬA assert này cho 「hợp trực giác」. Nó cố ý khẳng định
                //    「nhánh này là CODE CHẾT với 算定日 hiện hành」. Đỏ ở đây KHÔNG phải app
                //    hỏng — nó nghĩa là master vừa mở lại nhánh đó, và khi ấy vế web BẮT BUỘC
                //    phải port handler tương ứng (歯CAD cần chkTeethOcclusion 107 dòng,
                //    Denture 177 dòng). Đọc cmt-pack-type10-remaining.md §3 rồi làm.
                Assert.That(live, Is.Empty,
                    $"MASTER ĐÃ ĐỔI: condition 「{condition}」 lại có pack còn hiệu lực ngày " +
                    $"{_date:yyyy-MM-dd} ({string.Join(", ", live.Select(d => d.PackCd + " " + d.Window))}). " +
                    "Trước đây cả họ đã hết hạn nên handler là code chết ⇒ vế web bỏ qua có chủ ý. " +
                    "Giờ nó chạy được ⇒ PHẢI port (CmtAuto.cs: cmtTeethCAD:3911 / cmtDenture:1793 / " +
                    "cmtSPT2:2388 / cmtTokuDou:3492).");

                // Mã kích hoạt cũng phải im — nếu còn mã sống mà def chết thì app gọi
                // getMstCmtPack ra pack_cd rỗng và rơi vào 「không pack nào」, vẫn không chạy,
                // nhưng đó là tín hiệu master đang dở dang nên ghi lại.
                foreach (var def in group)
                {
                    var triggers = _db.Triggers(def.PackCd, _date, table);
                    if (triggers.Count > 0)
                        Log($"   ⚠️ {def.PackCd} đã hết hạn nhưng vẫn còn {triggers.Count} mã kích hoạt " +
                            $"sống: {string.Join(" · ", triggers.Take(5))} — master dở dang, không đổi kết luận.");
                }
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC10-2 — 歯清 kích hoạt những gì
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC10-2 (chỉ DB) — 歯清 108/2 kích hoạt 6 pack, đúng thứ tự seq_no")]
    public void TC10_2_Sisei_Fires_Six_Packs_In_SeqOrder()
    {
        var packs = _db.PacksFor(SiseiTrtCd, SiseiTrtSb, _date);

        Log($"{SiseiTrtCd}/{SiseiTrtSb} 機械的歯面清掃処置 kích hoạt {packs.Count} pack " +
            "(thứ tự = ORDER BY a.seq_no của getMstCmtPack — cũng là thứ tự prgCmtAuto chạy):");
        foreach (var p in packs)
        {
            Log($"   {p}");
            foreach (var d in _db.Details(p.PackCd, _date)) Log($"      → {d}");
        }

        var codes = packs.Select(p => p.PackCd).ToList();

        Assert.Multiple(() =>
        {
            // Nền của mọi ca UI: một cú gõ 108 sinh ra NHIỀU pack, trong đó 3 pack type 10
            // chưa port và 1 pack type 90 (mở hộp thoại 摘要選択) DÙNG CHUNG handler với
            // một trong ba cái kia.
            Assert.That(codes, Is.EqualTo(new[] { "I030", "I030-2", "I030-2-1", "I030-2-2", "I030-2-3", "I030-3" }),
                "Danh sách pack của 歯清 đã đổi. Mọi ca UI của luồng này (TC10-4..TC10-6) dựng trên " +
                "đúng danh sách đó — đọc lại log ở trên rồi sửa kỳ vọng của các ca UI TRƯỚC khi " +
                "kết luận app sai.");

            Assert.That(packs.Count(p => p.PackType == CmtPackDb.PackTypeAuto), Is.EqualTo(4),
                "Số pack type 10 trong cụm 歯清 đã đổi (trước: I030 前回実施年月 đã port + " +
                "I030-2 歯清-特 + I030-2-1 歯清-口管強(根C) + I030-2-3 歯清-口管強(Ce) chưa port).");

            // ⚠️ Đây chính là §4.5 của cmt-pack-type10-remaining.md, nhưng ở một chỗ KHÁC
            //    (ghi chú kia chỉ nói về koucyo): cmtKouKanKyo_KonC được gọi TỪ HAI CHỖ —
            //    CmtAuto.cs:512 (case 10, pack I030-2-1 → xuất comment cố định) và
            //    CmtAuto.cs:817 (case 90, pack I030-2-2 → MỞ frm203019 để người dùng nhập).
            //    Cùng một điều kiện, hai tác dụng khác hẳn nhau. Port thiếu một trong hai là
            //    lệch, port nhầm chỗ cũng là lệch.
            var konC = packs.Where(p => p.Condition == "歯清-口管強(根C)").ToList();
            Assert.That(konC.Select(p => p.PackType), Is.EquivalentTo(new[] { 10, 90 }),
                "condition 「歯清-口管強(根C)」 phải xuất hiện ở CẢ type 10 (I030-2-1) LẪN type 90 " +
                "(I030-2-2). Cùng hàm cmtKouKanKyo_KonC (CmtAuto.cs:3557) nhưng type 10 xuất " +
                "comment cố định còn type 90 mở hộp thoại nhập — vế web phải làm cả hai.");
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC10-3 — một pack_cd, hai condition, tách nhau bằng NGÀY
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC10-3 (chỉ DB) — I031 đổi condition theo ngày: 前回実施年月 → 前回実施年月-F局")]
    public void TC10_3_Same_PackCd_Changes_Condition_By_Date()
    {
        var i031 = _defs.Where(d => d.PackCd == "I031").OrderBy(d => d.AppStDt, StringComparer.Ordinal).ToList();
        foreach (var d in i031) Log($"   {d}");

        Assert.Multiple(() =>
        {
            Assert.That(i031.Select(d => d.Condition).Distinct().Count(), Is.GreaterThan(1),
                "I031 phải mang NHIỀU condition khác nhau theo từng cửa sổ ngày — nếu chỉ còn một " +
                "thì master đã dọn lại và cái bẫy dưới đây không còn.");

            // Bẫy: tra pack theo pack_cd mà QUÊN cửa sổ ngày sẽ lấy phải condition của thời kỳ
            // khác. Bên BE web, CascadeCmtAutoQueries phải lọc app_st_dt/app_ed_dt y hệt app.
            var live = i031.Where(d => d.Covers(_date)).ToList();
            Assert.That(live, Has.Count.EqualTo(1),
                $"Ngày {_date:yyyy-MM-dd} phải có ĐÚNG MỘT dòng I031 còn hiệu lực; đọc ra {live.Count}. " +
                "Nhiều hơn một ⇒ cửa sổ ngày trong master chồng nhau và app sẽ lấy dòng cuối cùng " +
                "của DataTable một cách tình cờ (MstCmtPack.cs:140-142 gán đè trong vòng foreach).");
        });
    }
}
