using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

/// <summary>
/// Truy vấn cho luồng <c>UNPAID.SFLG</c> (初診フラグ) — và <b>ORACLE</b> tính lại
/// <c>intSyosin</c> đúng như <c>modAcc.LetAccData2</c> làm.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HỆ MÃ 1 / 2 / 3 — và chỗ dễ nhầm
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// modAcc.cs:465-476
///   if (flgSyosin) {
///       dtBufDate = 年/月/01                                  ← ĐẦU THÁNG đang mở
///       cnt = Trntrn.getKaikeiPastSyosinCnt(con, patId, dtBufDate)
///       intSyosin = (cnt == 0) ? 1 : 3     // 1 = 初診, 3 = 再初診
///   } else {
///       intSyosin = 2                      // 2 = 再診
///   }
/// </code>
/// <c>getKaikeiPastSyosinCnt</c> (Trntrn.cs:1274):
/// <code>
///   SELECT COUNT(*) FROM TRNTRN
///    WHERE PAT_NO = @p
///      AND ( TRT_CD = 100 OR (TRT_CD = 107 AND PAT_BR = 0) )
///      AND TRT_DT &lt; @dauThang
/// </code>
///
/// <para><b>Hai bộ mã KHÁC NHAU, đừng lẫn.</b> Bộ quyết định <c>flgSyosin</c> là
/// <c>Check.IsFirstVisitTreatCode</c> (Check.cs:12456) — rộng hơn: 100/0, 100/1, 107/0,
/// 333/50, 333/55. Còn bộ đếm quá khứ thì HẸP: chỉ 100 (mọi 枝番) và 107 với
/// <c>PAT_BR = 0</c> — và <c>PAT_BR</c> ở đây là <b>枝番 bảo hiểm</b>, KHÔNG phải
/// <c>TRT_SB</c>. Dùng nhầm một trong hai bộ là ra sai 1 ↔ 3.</para>
///
/// <para><b>Và <c>sflg</c> KHÔNG đến từ buiPrice.</b> <c>modAcc</c> tự tính
/// <c>intSyosin</c> rồi ghi thẳng vào UNPAID (modAcc.cs:639/686/710/751), thậm chí còn
/// đè ngược lên <c>cur_buiPriceData2.syosin_flg</c>. Hệ mã của buiPrice là
/// 1=初診 / 2=再診 / <b>4=訪問診療</b> — không có 3, và 4 thì WinForm KHÔNG BAO GIỜ ghi
/// vào <c>UNPAID.SFLG</c>.</para>
///
/// ⚠️ Lớp này CÓ GHI: <see cref="RestoreUnpaid"/> trả UNPAID về nguyên trạng sau khi
/// F8 đã chạy thật. Tách khỏi <c>Data/OchaDb.cs</c> (lớp chỉ-đọc) vì lý do đó.
/// </summary>
public sealed class UnpaidSyosinDb
{
    /// <summary>初診 — chưa từng 初診 trước tháng đang mở (modAcc.cs:470).</summary>
    public const int SyosinFirstVisit = 1;

    /// <summary>再診 (modAcc.cs:475).</summary>
    public const int SyosinRevisit = 2;

    /// <summary>再初診 — đã từng 初診 trước tháng đang mở (modAcc.cs:473).</summary>
    public const int SyosinReFirstVisit = 3;

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private UnpaidSyosinDb(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static UnpaidSyosinDb? CreateOrNull(TestSettings s)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new UnpaidSyosinDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    private SqlConnection Open()
    {
        var c = new SqlConnection(_connectionString);
        c.Open();
        return c;
    }

    private SqlCommand Cmd(SqlConnection con, string sql)
    {
        var c = con.CreateCommand();
        c.CommandText = sql;
        c.CommandTimeout = _commandTimeout;
        return c;
    }

    // ── ORACLE ───────────────────────────────────────────────────────────────

    /// <summary>Một ngày 処置 của bệnh nhân, kèm <c>intSyosin</c> mà WinForm PHẢI tính ra.</summary>
    /// <param name="Day">Ngày trong tháng.</param>
    /// <param name="HasFirstVisitTreat">Ngày đó có 処置 nằm trong <c>Check.IsFirstVisitTreatCode</c>.</param>
    /// <param name="PastSyosinCount">Số dòng 初診 TRƯỚC đầu tháng (getKaikeiPastSyosinCnt).</param>
    /// <param name="ExpectedSflg">1 / 2 / 3 theo modAcc.cs:465-476.</param>
    public sealed record DayOracle(
        DateTime Date, int Day, bool HasFirstVisitTreat, int PastSyosinCount, int ExpectedSflg)
    {
        public string Why => HasFirstVisitTreat
            ? $"ngày có 初診 + {PastSyosinCount} dòng 初診 trước tháng ⇒ " +
              (PastSyosinCount == 0 ? "1 (初診)" : "3 (再初診)")
            : "ngày KHÔNG có 初診 ⇒ 2 (再診)";

        public override string ToString() =>
            $"ngày {Day,2} ({Date:yyyy-MM-dd}): sflg kỳ vọng = {ExpectedSflg}  — {Why}";
    }

    /// <summary>
    /// Tính <c>intSyosin</c> cho MỌI ngày 処置 của bệnh nhân trong tháng của
    /// <paramref name="anyDateInMonth"/>.
    ///
    /// <para>Đây là ORACLE — chép lại đúng phép tính của <c>modAcc</c>, KHÔNG đọc kết
    /// quả của app. Nhờ vậy testcase so được 「app tính ra gì」 với 「đáng lẽ phải là gì」,
    /// thay vì chỉ so app với chính nó.</para>
    ///
    /// <para><b>Xấp xỉ có chủ ý:</b> <c>flgSyosin</c> bên WinForm còn một nhánh phụ —
    /// dòng 再診 (110, hoặc 107/1) mà cùng ngày có dòng ghi chú 「健診より」/「検診より」/
    /// 「自費より」/「健康診断の結果に基づき治療開始」 thì cũng tính là 初診
    /// (modAcc.cs:437-455). Oracle ở đây KHÔNG dựng lại nhánh đó vì nó dò theo CHỮ trên
    /// lưới. Ngày nào rơi vào nhánh đó thì oracle nói 2 còn app nói 1/3 — probe in cả
    /// hai để người đọc nhận ra, chứ không âm thầm coi là app sai.</para>
    /// </summary>
    public IReadOnlyList<DayOracle> DayOracles(int patNo, DateTime anyDateInMonth)
    {
        var firstOfMonth = new DateTime(anyDateInMonth.Year, anyDateInMonth.Month, 1);
        var past = PastSyosinCount(patNo, firstOfMonth);

        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT CAST(trt_dt AS date) AS d,
                   SUM(CASE WHEN (trt_cd = 100 AND trt_sb IN (0, 1))
                             OR (trt_cd = 107 AND trt_sb = 0)
                             OR (trt_cd = 333 AND trt_sb IN (50, 55))
                            THEN 1 ELSE 0 END) AS shoshin_rows
              FROM TRNTRN
             WHERE pat_no = @p
               AND ISNULL(del_flg, 0) = 0
               AND trt_dt >= @from
               AND trt_dt <  DATEADD(month, 1, @from)
             GROUP BY CAST(trt_dt AS date)
             ORDER BY CAST(trt_dt AS date)
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = firstOfMonth;

        var rows = new List<DayOracle>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var d = Convert.ToDateTime(reader["d"]);
            var hasFirst = Convert.ToInt32(reader["shoshin_rows"]) > 0;
            var expected = hasFirst
                ? (past == 0 ? SyosinFirstVisit : SyosinReFirstVisit)
                : SyosinRevisit;
            rows.Add(new DayOracle(d, d.Day, hasFirst, past, expected));
        }
        return rows;
    }

    /// <summary>
    /// <c>Trntrn.getKaikeiPastSyosinCnt</c> — chép NGUYÊN câu SQL của WinForm
    /// (Trntrn.cs:1274-1290), kể cả chỗ dùng <c>PAT_BR</c> chứ không phải <c>TRT_SB</c>.
    /// </summary>
    public int PastSyosinCount(int patNo, DateTime firstOfMonth)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT COUNT(*) AS record_cnt
              FROM TRNTRN
             WHERE PAT_NO = @patNo
               AND ( TRT_CD = 100 OR (TRT_CD = 107 AND PAT_BR = 0) )
               AND TRT_DT < @trtDt
            """);
        cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@trtDt", SqlDbType.DateTime).Value = firstOfMonth;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ── SEED: dựng ca 再初診 (sflg = 3) ──────────────────────────────────────

    /// <summary>
    /// <c>DISP_NO</c> đánh dấu dòng do TEST seed. Dải thật của bệnh nhân test là 1..13
    /// (đo 2026-08-26), nên 9001 nằm ngoài hẳn — xoá theo mốc này thì không thể chạm
    /// nhầm dòng thật.
    /// </summary>
    public const int SeedDispNo = 9001;

    /// <summary>
    /// Dựng ca <b>再初診</b>: chèn MỘT dòng 初診 vào QUÁ KHỨ (trước đầu tháng đang mở).
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// VÌ SAO PHẢI SEED, VÀ VÌ SAO SEED KIỂU NÀY
    /// ═══════════════════════════════════════════════════════════════════════
    /// <c>sflg = 3</c> đòi HAI điều cùng lúc: ngày đang xét CÓ 初診, VÀ bệnh nhân đã
    /// từng 初診 TRƯỚC tháng này. Dữ liệu SIM2000 không bệnh nhân nào thoả cả hai (đo
    /// 2026-08-26: bệnh nhân 10 có vế đầu, 9/12138 có vế sau) — mà 3 lại đúng là giá
    /// trị bug của tester.
    ///
    /// <para>Chỉ thêm <b>lịch sử quá khứ</b>, KHÔNG đụng ngày đang test. Nhờ vậy cùng
    /// một bệnh nhân, cùng một ngày, chỉ khác mỗi dòng quá khứ này mà
    /// <c>sflg</c> lật <b>1 ↔ 3</b> — đó chính là phép đo cô lập đúng
    /// <c>getKaikeiPastSyosinCnt</c>, chỗ mà bản web đang thiếu.</para>
    ///
    /// <para><b>Nhân bản một dòng 初診 CÓ THẬT</b> của chính bệnh nhân thay vì tự dựng
    /// dòng mới: <c>TRNTRN</c> có 84 cột, phần lớn NOT NULL, và tự điền tay là mời gọi
    /// sai kiểu / thiếu cột. Chép rồi chỉ đè <c>TRT_DT</c> + <c>DISP_NO</c> thì mọi cột
    /// khác chắc chắn hợp lệ vì chúng đã hợp lệ ở dòng gốc.</para>
    ///
    /// <para>Ngày mặc định là <b>ngày 20 tháng trước</b> — cố ý tránh trùng NGÀY với các
    /// ngày đang có trên lưới (3, 14): dòng tháng cũ vẫn hiện trên <c>grdRegi</c> dưới
    /// dạng <c>linekbn 99</c>, và nếu trùng số ngày thì <c>RowForDay</c> có thể tóm nhầm
    /// dòng tháng cũ — bấm F8 ở đó chỉ nhận 「当月以外の操作はできません」.</para>
    /// </summary>
    /// <returns>Số dòng đã chèn (0 = bệnh nhân không có dòng 初診 nào để nhân bản).</returns>
    public int SeedPastSyosin(int patNo, DateTime pastDate)
    {
        // Danh sách cột lấy từ schema chứ không viết cứng: TRNTRN có 84 cột và bảng này
        // khác nhau giữa các bản cài.
        var columns = new List<string>();
        using (var con = Open())
        using (var cmd = Cmd(con,
            """
            SELECT c.name
              FROM sys.columns c
             WHERE c.object_id = OBJECT_ID('TRNTRN')
             ORDER BY c.column_id
            """))
        using (var reader = cmd.ExecuteReader())
        {
            while (reader.Read()) columns.Add(reader.GetString(0));
        }
        if (columns.Count == 0) return 0;

        var target = string.Join(", ", columns.Select(c => $"[{c}]"));
        var source = string.Join(", ", columns.Select(c =>
            c.Equals("TRT_DT", StringComparison.OrdinalIgnoreCase) ? "@newDt"
            : c.Equals("DISP_NO", StringComparison.OrdinalIgnoreCase) ? "@newDisp"
            : $"[{c}]"));

        using (var con = Open())
        using (var ins = Cmd(con,
            $"""
             INSERT INTO TRNTRN ({target})
             SELECT TOP 1 {source}
               FROM TRNTRN
              WHERE pat_no = @p
                AND trt_cd = 100
                AND ISNULL(del_flg, 0) = 0
              ORDER BY trt_dt
             """))
        {
            ins.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            ins.Parameters.Add("@newDt", SqlDbType.DateTime).Value = pastDate.Date;
            ins.Parameters.Add("@newDisp", SqlDbType.Int).Value = SeedDispNo;
            return ins.ExecuteNonQuery();
        }
    }

    /// <summary>Ngày seed mặc định — ngày 20 tháng TRƯỚC tháng đang mở.</summary>
    public static DateTime DefaultSeedDate(DateTime monthInView) =>
        new DateTime(monthInView.Year, monthInView.Month, 1).AddMonths(-1).AddDays(19);

    /// <summary>Gỡ dòng seed. Chỉ chạm dòng mang <see cref="SeedDispNo"/>.</summary>
    public int RemovePastSyosinSeed(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "DELETE FROM TRNTRN WHERE pat_no = @p AND disp_no = @d");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.Int).Value = SeedDispNo;
        return cmd.ExecuteNonQuery();
    }

    /// <summary>Số dòng seed còn sót — kiểm sau teardown.</summary>
    public int CountSeedRows(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT COUNT(*) FROM TRNTRN WHERE pat_no = @p AND disp_no = @d");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.Int).Value = SeedDispNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ── UNPAID ───────────────────────────────────────────────────────────────

    /// <summary>Một dòng <c>UNPAID</c>, chỉ các cột luồng này quan tâm.</summary>
    public sealed record UnpaidRow(
        DateTime TrtDt, int TrtCnt, int KmCd, int Score, int ClaimAmt, int Sflg, int AttDr)
    {
        public override string ToString() =>
            $"{TrtDt:yyyy-MM-dd} 回{TrtCnt} 科目{KmCd}: score={Score} claim={ClaimAmt} " +
            $"SFLG={Sflg} ATT_DR={AttDr}";
    }

    /// <summary>Mọi dòng UNPAID của một bệnh nhân (mọi ngày) — dùng làm ảnh chụp.</summary>
    public IReadOnlyList<UnpaidRow> ReadUnpaid(int patNo, DateTime? trtDt = null)
    {
        using var con = Open();
        var where = trtDt is null ? "" : " AND trt_dt = @d";
        using var cmd = Cmd(con,
            $"""
             SELECT trt_dt, trt_cnt, km_cd, score, claim_amt, sflg, att_dr
               FROM UNPAID
              WHERE pat_no = @p{where}
              ORDER BY trt_dt, trt_cnt, km_cd
             """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        if (trtDt is not null) cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Value.Date;

        var rows = new List<UnpaidRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new UnpaidRow(
                Convert.ToDateTime(reader["trt_dt"]),
                Convert.ToInt32(reader["trt_cnt"]),
                Convert.ToInt32(reader["km_cd"]),
                Convert.ToInt32(reader["score"]),
                Convert.ToInt32(reader["claim_amt"]),
                reader["sflg"] is DBNull ? -1 : Convert.ToInt32(reader["sflg"]),
                reader["att_dr"] is DBNull ? -1 : Convert.ToInt32(reader["att_dr"])));
        }
        return rows;
    }

    /// <summary>
    /// Xoá MỌI dòng UNPAID của bệnh nhân rồi chèn lại đúng ảnh chụp.
    ///
    /// <para>F8 tạo 未精算 thật, nên fixture phải trả lại nguyên trạng. Chèn lại chỉ
    /// khôi phục các cột luồng này đọc — đủ cho một bệnh nhân TEST, KHÔNG đủ cho dữ
    /// liệu thật. Đó là lý do fixture đòi <c>parity.allowSave</c> và README bắt trỏ
    /// <c>patient.patNo</c> vào bệnh nhân test.</para>
    /// </summary>
    public void RestoreUnpaid(int patNo, IReadOnlyList<UnpaidRow> snapshot)
    {
        using var con = Open();

        using (var del = Cmd(con, "DELETE FROM UNPAID WHERE pat_no = @p"))
        {
            del.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            del.ExecuteNonQuery();
        }

        foreach (var r in snapshot)
        {
            using var ins = Cmd(con,
                """
                INSERT INTO UNPAID (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, sflg, att_dr)
                VALUES (@d, @cnt, @p, @km, @sc, @cl, @sf, @dr)
                """);
            ins.Parameters.Add("@d", SqlDbType.DateTime).Value = r.TrtDt;
            ins.Parameters.Add("@cnt", SqlDbType.TinyInt).Value = r.TrtCnt;
            ins.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            ins.Parameters.Add("@km", SqlDbType.SmallInt).Value = r.KmCd;
            ins.Parameters.Add("@sc", SqlDbType.Int).Value = r.Score;
            ins.Parameters.Add("@cl", SqlDbType.Int).Value = r.ClaimAmt;
            ins.Parameters.Add("@sf", SqlDbType.TinyInt).Value = Math.Max(r.Sflg, 0);
            ins.Parameters.Add("@dr", SqlDbType.TinyInt).Value = Math.Max(r.AttDr, 0);
            ins.ExecuteNonQuery();
        }
    }
}
