using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.UnpaidRaiinCnt;

/// <summary>
/// Dựng <b>một ngày có HAI lượt khám</b> rồi mô tả nó đủ chi tiết để cả probe lẫn
/// testcase dùng chung — không bên nào phải tự đoán con số.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI SEED
/// ═══════════════════════════════════════════════════════════════════════════
/// Ngày có 2 lượt khám gần như không tồn tại sẵn trong DB, mà đó lại chính là kịch bản
/// DUY NHẤT phân biệt bản đúng với bản hỏng: bản bỏ qua 来院回数 chỉ lộ ra khi có lượt
/// thứ hai để mà ghi đè lên lượt thứ nhất. Spec web
/// (<c>unpaid-raiin-cnt-parity.spec.ts</c>) cũng tự dựng lấy vì đúng lý do đó.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HÌNH DẠNG NGÀY TEST — và vì sao chỉ thêm BA dòng
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   [những dòng CÓ SẴN của ngày]   ← 初診 (100) mở lượt 1
///   disp_no 9101 「処置A-来院回数テスト」  ← 処置 trung tính, ĐỨNG TRƯỚC 再診 ⇒ vẫn lượt 1
///   disp_no 9102 「再診-来院回数テスト」   ← 110, MỞ lượt 2
///   disp_no 9103 「処置B-来院回数テスト」  ← 処置 trung tính, sau 再診 ⇒ lượt 2
/// </code>
///
/// <para>Thứ tự trên lưới là <c>order by trt_dt, disp_no</c> (Trntrn.cs:2372), nên
/// <c>disp_no</c> 9101-9103 luôn xếp SAU mọi dòng thật của ngày (dải thật 1..13) —
/// đó là toàn bộ cơ chế đảm bảo 初診 mở lượt 1 trước, 再診 mở lượt 2 sau.</para>
///
/// <para><b>Hai dòng 処置A/処置B là để đo, không phải trang trí.</b> Chúng chứng minh
/// 処置 KHÔNG mở lượt thì chỉ ĐI THEO lượt đứng trước nó — vế mà một bản port kiểu
/// group-by rất dễ làm sai. Và chúng cho mỗi lượt một dòng mang TÊN RIÊNG để đặt con
/// trỏ vào, thay vì phải đếm dòng trên lưới (PROBE-GUIDELINE 3.1: chỉ số dòng đọc từ
/// UIA trôi theo vị trí cuộn).</para>
///
/// ⚠️ Lớp này GHI <c>TRNTRN</c>. Fixture gọi nó phải gỡ ở <c>[OneTimeTearDown]</c> bằng
/// <see cref="RaiinCntDb.RemoveSeedRows"/> — dải <c>disp_no</c> riêng làm việc đó an toàn.
/// </summary>
public static class TwoVisitDay
{
    /// <summary>Tên hiển thị của ba dòng seed. Đổi tên ở đây là đổi cả chỗ tìm dòng.</summary>
    public static class Nm
    {
        public const string PlainA = "処置A-来院回数テスト";
        public const string Saisin = "再診-来院回数テスト";
        public const string PlainB = "処置B-来院回数テスト";
    }

    /// <summary>歯科再診料 — 処置 đem mở lượt thứ hai (modAcc.cs:1208).</summary>
    public const int SaisinTrtCd = 110;

    public const int DispNoPlainA = RaiinCntDb.SeedDispNoBase;      // 9101
    public const int DispNoSaisin = RaiinCntDb.SeedDispNoBase + 1;  // 9102
    public const int DispNoPlainB = RaiinCntDb.SeedDispNoBase + 2;  // 9103

    /// <summary>来院回数 kỳ vọng — <c>hfgRaiinCnt</c> không bao giờ trả 0 (modAcc.cs:1215-1220).</summary>
    public const int Visit1 = 1;
    public const int Visit2 = 2;

    /// <summary>Ngày test sau khi đã dựng xong, kèm mọi con số ORACLE suy ra từ DB.</summary>
    /// <param name="Blocker">
    /// Lý do KHÔNG dùng được ngày này (null = dùng được). Fixture đọc trường này để
    /// Ignore kèm lý do thật, thay vì chạy tiếp rồi đỏ ở một chỗ chẳng liên quan.
    /// </param>
    public sealed record Plan(
        DateTime Date,
        IReadOnlyList<RaiinCntDb.TrtRow> RowsBefore,
        IReadOnlyList<RaiinCntDb.SeedResult> Seeds,
        IReadOnlyList<RaiinCntDb.RowVisit> RowsAfter,
        IReadOnlyDictionary<int, int> ExpectedScore,
        int ExpectedSflg,
        int PastSyosinCount,
        bool DayHasAccData,
        string? Blocker)
    {
        public int ScoreVisit1 => ExpectedScore.GetValueOrDefault(Visit1);
        public int ScoreVisit2 => ExpectedScore.GetValueOrDefault(Visit2);

        /// <summary>Con số của CẢ NGÀY — chính là giá trị mà bản bỏ qua 来院回数 ghi cho TỪNG lượt.</summary>
        public int ScoreWholeDay => ExpectedScore.Values.Sum();

        public IEnumerable<string> Describe()
        {
            yield return $"ngày test {Date:yyyy-MM-dd}: {RowsBefore.Count} dòng có sẵn + " +
                         $"{Seeds.Count(s => s.Inserted > 0)}/{Seeds.Count} dòng seed";
            foreach (var s in Seeds) yield return "    seed " + s;
            yield return $"    ⇒ lưới sau khi seed ({RowsAfter.Count} dòng, theo thứ tự hiển thị):";
            foreach (var rv in RowsAfter) yield return "        " + rv;
            yield return $"    ⇒ ORACLE điểm: 来院1 = {ScoreVisit1}, 来院2 = {ScoreVisit2}, " +
                         $"CẢ NGÀY = {ScoreWholeDay}";
            yield return $"    ⇒ ORACLE sflg = {ExpectedSflg} " +
                         $"(初診 quá khứ trước đầu tháng = {PastSyosinCount}; " +
                         "0 ⇒ 1 初診, >0 ⇒ 3 再初診, ngày không có 初診 ⇒ 2 再診)";
            yield return $"    ⇒ ngày đã có ACCDAT: {DayHasAccData} " +
                         "(có ⇒ F8 hỏi thêm 「既に…未清算データ…作成してよろしいですか?」 → はい)";
        }
    }

    /// <summary>
    /// Dựng ngày test. Gọi TRƯỚC khi app mở (<c>PrepareDataBeforeApp</c>) — lưới chỉ nạp
    /// một lần lúc vào màn hình, seed sau đó thì app không thấy.
    ///
    /// <para>Tự dọn dải seed trước khi chèn, nên chạy lại nhiều lần không cộng dồn.</para>
    /// </summary>
    public static Plan Build(RaiinCntDb db, int patNo, DateTime date)
    {
        db.RemoveSeedRows(patNo);

        var before = db.ReadDayRows(patNo, date);
        var firstOfMonth = new DateTime(date.Year, date.Month, 1);
        var past = db.PastSyosinCount(patNo, firstOfMonth);
        var hasAcc = db.DayHasAccData(patNo, date);

        var blocker = PreflightBlocker(db, patNo, date, before);
        if (blocker is not null)
            return new Plan(date, before, [], RaiinCntDb.AssignVisits(before),
                            RaiinCntDb.ExpectedScoreByVisit(before),
                            ExpectedSflg(before, past), past, hasAcc, blocker);

        var opener = db.FindOpenerTemplate(patNo, SaisinTrtCd);
        var plains = db.FindPlainTemplates(patNo, date, 2);

        var seeds = new List<RaiinCntDb.SeedResult>();
        if (opener is null)
        {
            seeds.Add(new RaiinCntDb.SeedResult(DispNoSaisin, null, 0,
                $"bệnh nhân {patNo} không có dòng 処置 nào trt_cd = {SaisinTrtCd} (歯科再診料) " +
                "với 回数 > 0 để nhân bản"));
        }
        else if (plains.Count < 2)
        {
            seeds.Add(new RaiinCntDb.SeedResult(DispNoPlainA, null, 0,
                $"chỉ tìm được {plains.Count}/2 dòng 処置 trung tính dùng được làm khuôn " +
                "(không mở lượt, có điểm, chưa có trên ngày test)"));
        }
        else
        {
            // Thứ tự chèn = thứ tự disp_no = thứ tự hiển thị. 処置A phải nằm TRƯỚC 再診.
            seeds.Add(db.CloneRowOnto(date, DispNoPlainA, plains[0], Nm.PlainA));
            seeds.Add(db.CloneRowOnto(date, DispNoSaisin, opener, Nm.Saisin));
            seeds.Add(db.CloneRowOnto(date, DispNoPlainB, plains[1], Nm.PlainB));
        }

        var after = db.ReadDayRows(patNo, date);
        var visits = RaiinCntDb.AssignVisits(after);

        return new Plan(
            date, before, seeds, visits,
            RaiinCntDb.ExpectedScoreByVisit(after),
            ExpectedSflg(after, past), past, hasAcc,
            SeedBlocker(seeds, visits));
    }

    /// <summary>
    /// Ngày test có đủ tiền đề để dựng lượt thứ hai không — kiểm TRƯỚC khi ghi gì.
    ///
    /// <para>Mọi điều kiện ở đây đều đã ĐO ĐƯỢC bằng DB, nên fixture bỏ qua kèm lý do
    /// thật thay vì đỏ ở giữa chuỗi F8 với một thông báo chẳng liên quan.</para>
    /// </summary>
    private static string? PreflightBlocker(
        RaiinCntDb db, int patNo, DateTime date, IReadOnlyList<RaiinCntDb.TrtRow> before)
    {
        if (before.Count == 0)
            return $"ngày {date:yyyy-MM-dd} KHÔNG có dòng 処置 nào. F8 trên ngày trống thì " +
                   "日計 toàn 0 và chuỗi 会計 kết thúc sớm — trỏ patient.trtDate vào ngày CÓ 処置.";

        // 枝番 hết hiệu lực ⇒ buiPrice bỏ qua mọi dòng (buiPrice.cs:232 lọc
        // trtData.pat_br == patInfoData.ins.pat_br) ⇒ điểm ra 0, không đo được gì.
        if (db.ValidInsuranceBranch(patNo, date) is not { } br)
            return $"bệnh nhân {patNo} KHÔNG có 枝番 bảo hiểm nào phủ ngày {date:yyyy-MM-dd} " +
                   "(INSURANCE.med_st_dt/med_ed_dt). buiPrice lọc theo 枝番 nên mọi điểm sẽ ra 0.";

        if (before.All(r => r.PatBr != br))
            return $"ngày {date:yyyy-MM-dd} không có dòng nào mang 枝番 {br} — 枝番 còn hiệu lực " +
                   "và 枝番 của 処置行 lệch nhau thì buiPrice bỏ qua hết.";

        var openers = before.Count(r => r.OpensVisit);
        if (openers == 0)
            return $"ngày {date:yyyy-MM-dd} không có 処置 nào MỞ lượt " +
                   $"({string.Join("/", RaiinCntDb.VisitOpeningTrtCds)}) ⇒ mọi dòng ra 来院1 và " +
                   "dòng seed sẽ thành lượt 1 chứ không phải lượt 2.";
        if (openers > 1)
            return $"ngày {date:yyyy-MM-dd} ĐÃ có {openers} 処置 mở lượt ⇒ ngày này vốn đã nhiều " +
                   "lượt, thêm seed nữa thì số lượt kỳ vọng không còn là 1/2. Chọn ngày khác.";

        return null;
    }

    /// <summary>Seed xong rồi mà hình dạng không như mong đợi thì nói ngay, đừng để F8 chạy.</summary>
    private static string? SeedBlocker(
        IReadOnlyList<RaiinCntDb.SeedResult> seeds, IReadOnlyList<RaiinCntDb.RowVisit> visits)
    {
        if (seeds.Count == 0 || seeds.Any(s => s.Inserted == 0))
            return "không seed đủ dòng: " + string.Join(" | ", seeds.Select(s => s.Explain));

        var maxVisit = visits.Count == 0 ? 0 : visits.Max(v => v.Visit);
        if (maxVisit != Visit2)
            return $"sau khi seed, ORACLE vẫn tính ra {maxVisit} lượt chứ không phải 2 — " +
                   "xem lại thứ tự disp_no hoặc 回数 của dòng 再診 vừa chèn.";

        if (!visits.Any(v => v.Visit == Visit1 && Txt.Has(v.Row.DspTrt, Nm.PlainA)))
            return $"dòng 「{Nm.PlainA}」 không rơi vào lượt 1 — nó phải đứng TRƯỚC dòng 再診.";
        if (!visits.Any(v => v.Visit == Visit2 && Txt.Has(v.Row.DspTrt, Nm.Saisin)))
            return $"dòng 「{Nm.Saisin}」 không mở được lượt 2.";
        if (!visits.Any(v => v.Visit == Visit2 && Txt.Has(v.Row.DspTrt, Nm.PlainB)))
            return $"dòng 「{Nm.PlainB}」 không rơi vào lượt 2.";

        return null;
    }

    /// <summary>
    /// ORACLE cho <c>UNPAID.SFLG</c> — <c>modAcc.cs:431-476</c>.
    ///
    /// <para>Vòng quét 初診判定 <b>break ngay ở dòng khớp ĐẦU TIÊN</b> (modAcc.cs:459) và
    /// KHÔNG lọc theo 来院回数 ⇒ cả hai lượt của cùng một ngày phải ra CÙNG một giá trị.
    /// Đó chính là điều TC-3 khoá lại.</para>
    ///
    /// <para>Xấp xỉ có chủ ý: nhánh 「再診 + dòng ghi chú 健診より/検診より/自費より/
    /// 健康診断の結果に基づき治療開始 cùng ngày cũng tính là 初診」 (modAcc.cs:437-455) KHÔNG
    /// được dựng lại ở đây — nó dò theo CHỮ trên lưới. Ngày test không có dòng nào như
    /// vậy thì oracle đúng; có thì probe in ra để người đọc nhận ra, chứ testcase không
    /// âm thầm đổ tội cho app.</para>
    /// </summary>
    private static int ExpectedSflg(IReadOnlyList<RaiinCntDb.TrtRow> dayRows, int pastSyosinCount)
    {
        // Check.IsFirstVisitTreatCode (Check.cs:12456) — RỘNG hơn tập đếm quá khứ.
        var hasSyosin = dayRows.Any(r =>
            (r.TrtCd == 100 && r.TrtSb is 0 or 1) ||
            (r.TrtCd == 107 && r.TrtSb == 0) ||
            (r.TrtCd == 333 && r.TrtSb is 50 or 55));

        if (!hasSyosin) return 2;                       // 再診
        return pastSyosinCount == 0 ? 1 : 3;            // 初診 / 再初診
    }

    // ── Tìm dòng trên LƯỚI ───────────────────────────────────────────────────

    /// <summary>
    /// Dòng lưới đang in <paramref name="dspTrt"/> ở cột 療法・処置.
    ///
    /// <para>Tìm theo TÊN chứ không theo chỉ số: UIA của <c>DataGridView</c> chỉ phơi ra
    /// dòng ĐANG NHÌN THẤY nên chỉ số trôi theo vị trí cuộn (PROBE-GUIDELINE 3.1). Tên
    /// thì do chính lớp này đặt lúc seed, không trùng với bất kỳ 処置 thật nào.</para>
    /// </summary>
    public static RegiRow? RowNamed(AccountingDayFlow flow, string dspTrt) =>
        flow.Grid.Snapshot().FirstOrDefault(r => Txt.Has(r.Ryo, dspTrt));

    /// <summary>
    /// Dòng ĐẦU TIÊN của ngày — dòng mở lượt 1.
    ///
    /// <para>Không dùng <c>AccountingDayFlow.RowForDay</c>: hàm đó lấy dòng <b>CUỐI</b>
    /// khớp ngày (để né khối 過去月), mà dòng cuối của ngày lại là 日計 — và con trỏ ở
    /// 日計 thì <c>hfgRaiinCnt</c> trả về số lượt CUỐI của ngày (2), không phải 1.</para>
    ///
    /// <para>Vẫn phải né khối 過去月: chỉ nhận dòng nằm TRƯỚC dòng seed đầu tiên. Khối
    /// tháng cũ luôn đứng trên khối tháng hiện hành, nên nếu tháng cũ có trùng số ngày
    /// thì mốc 「trước 処置A」 vẫn không đủ — vì vậy hàm nhận thêm
    /// <paramref name="anchor"/>: dòng lượt 1 phải là dòng gần nhất PHÍA TRÊN nó.</para>
    /// </summary>
    public static RegiRow? FirstRowOfDay(AccountingDayFlow flow, int day, RegiRow anchor)
    {
        var rows = flow.Grid.Snapshot();

        var anchorAt = -1;
        for (var i = 0; i < rows.Count; i++)
            if (rows[i].Index == anchor.Index) { anchorAt = i; break; }
        if (anchorAt < 0) return null;

        RegiRow? found = null;
        for (var i = anchorAt; i >= 0; i--)
        {
            if (Txt.Int(rows[i].Day) != day) break;
            found = rows[i];
        }
        return found;
    }
}
