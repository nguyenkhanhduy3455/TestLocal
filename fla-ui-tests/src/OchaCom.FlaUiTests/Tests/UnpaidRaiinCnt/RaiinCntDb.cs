using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.UnpaidRaiinCnt;

/// <summary>
/// Dữ liệu cho luồng <b>当日来院回数</b> (<c>UNPAID.TRT_CNT</c>): dựng ngày 2 lượt khám,
/// ORACLE tính lại <c>hfgRaiinCnt</c> + điểm từng lượt, và ảnh chụp/khôi phục
/// <c>UNPAID</c> của ĐÚNG ngày test.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ORACLE — cả ba con số đều SUY RA ĐƯỢC TỪ DB, không phải đo rồi chép lại
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// modAcc.hfgRaiinCnt (modAcc.cs:1188-1222) — quét lưới THEO THỨ TỰ HIỂN THỊ
///   ("order by trt_dt, disp_no", Trntrn.cs:2372):
///     visit_day = 0; visit_cnt_of_day = 0
///     foreach 行 (bỏ 過去月 linekbn = "99"):
///         if 行.日 != visit_day → visit_day = 行.日; visit_cnt_of_day = 0
///         if 行.trt_cd ∈ {100,107,110,111,333} và 行.回数 > 0 → visit_cnt_of_day++
///         行[71] = visit_cnt_of_day > 1 ? visit_cnt_of_day : 1
///
/// buiPrice.calcBuiPriceData2 (buiPrice.cs:288-291) — ĐIỂM lấy từ Ô LƯỚI, không tra master:
///     int score = trtData.trt_pt * trt_cnt;      // trt_cnt = 回数 (trt_cd 50 thì = 1)
///     payDataCur.score += score;                 // gom theo (trt_dt, visits_no)
///
/// modAcc.GetDayPoint (modAcc.cs:238-240) — CHỈ cộng lượt đang xét:
///     if (opIntRaiinCnt == -1 || payData.visits_no == opIntRaiinCnt) intDayPoint += payData.score;
///     → cur_buiPriceData2.insScore = retDayPoint → unPaidData.score (modAcc.cs:542/636)
/// </code>
///
/// <para>Ghép ba mảnh đó lại: <b><c>UNPAID.SCORE</c> của lượt N = Σ (trt_pt × trt_cnt)
/// trên các dòng của ngày mang <c>raiin_cnt = N</c></b> — tính thẳng từ
/// <c>TRNTRN</c>, không cần chạy app. Nhánh 入金指定 (<c>pNYUKIN</c>) đè
/// <c>insScore = unit.Sum()</c> (modAcc.cs:620) nhưng <c>Get_AccUnit</c> cũng chỉ cộng
/// <c>grdRegi[54] = 点数×回数</c> của các dòng có <c>grdRegi[71] == 来院回数</c>
/// (modAcc.cs:821-856) ⇒ RA CÙNG MỘT SỐ. Đó là lý do oracle này dùng được cho cả hai
/// nhánh mà không cần biết máy có bật 入金指定 hay không.</para>
///
/// ⚠️ Lớp này CÓ GHI: seed 処置行 và khôi phục <c>UNPAID</c>. Tách khỏi
/// <c>Data/OchaDb.cs</c> (chỉ-đọc) vì lý do đó.
/// </summary>
public sealed class RaiinCntDb
{
    /// <summary>
    /// Tập 処置 MỞ một lượt khám mới — <c>modAcc.hfgRaiinCnt</c> (modAcc.cs:1208).
    ///
    /// <para>KHÁC tập <c>Check.IsFirstVisitTreatCode</c> (quyết định <c>sflg</c>) và
    /// KHÁC tập <c>getKaikeiPastSyosinCnt</c> (đếm 初診 quá khứ). Ba tập, ba việc —
    /// lẫn là sai.</para>
    /// </summary>
    public static readonly int[] VisitOpeningTrtCds = [100, 107, 110, 111, 333];

    /// <summary>介護保険行 lấy <c>trt_cnt = 来院回数 + 100</c> (modAcc.cs:673).</summary>
    public const int CareTrtCntOffset = 100;

    /// <summary>
    /// <c>DISP_NO</c> của dòng do luồng NÀY seed. Dải thật của bệnh nhân test là 1..13
    /// và luồng <c>UnpaidSyosinFlag</c> đã giữ 9001/9002, nên 9101+ không đụng ai.
    /// </summary>
    public const int SeedDispNoBase = 9101;

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private RaiinCntDb(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static RaiinCntDb? CreateOrNull(TestSettings s)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new RaiinCntDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    // ── 処置行 của một ngày ──────────────────────────────────────────────────

    /// <summary>Một dòng <c>TRNTRN</c>, theo đúng thứ tự lưới sẽ hiển thị.</summary>
    /// <param name="RaiinCnt">
    /// Cột <c>RAIIN_CNT</c> đang lưu trong DB — <b>KHÔNG phải</b> thứ F8 dùng.
    /// <c>LetAccData2</c> gọi <c>hfgRaiinCnt()</c> tính lại vào ô lưới 71 rồi mới đọc
    /// (modAcc.cs:396/415), nên cột này chỉ để đối chiếu 「F9 đã đánh số ra sao」.
    /// </param>
    public sealed record TrtRow(
        int DispNo, int Seq, int TrtCd, int TrtSb, int TrtCnt, int TrtPt,
        int PatBr, int JihiFlg, string DspTrt, int RaiinCnt)
    {
        /// <summary>Điểm dòng này đóng góp — <c>buiPrice.cs:288</c>.</summary>
        public int Score => TrtPt * (TrtCd == 50 ? 1 : TrtCnt);

        /// <summary>Dòng này có MỞ một lượt khám mới không (modAcc.cs:1208-1212).</summary>
        public bool OpensVisit => VisitOpeningTrtCds.Contains(TrtCd) && TrtCnt > 0;

        public override string ToString() =>
            $"disp_no {DispNo,5} trt {TrtCd}/{TrtSb} 回{TrtCnt} {TrtPt,4}点 " +
            $"(=> {Score,4}) 枝番{PatBr} 自費{JihiFlg} 「{DspTrt}」 raiin_cnt(DB)={RaiinCnt}";
    }

    /// <summary>Mọi dòng 処置 CÒN SỐNG của một ngày, THEO THỨ TỰ LƯỚI.</summary>
    public IReadOnlyList<TrtRow> ReadDayRows(int patNo, DateTime date) =>
        QueryRows(
            // "order by trt_dt, disp_no" — chép nguyên thứ tự app nạp lưới
            // (Trntrn.cs:2372). Thứ tự này CHÍNH LÀ đầu vào của hfgRaiinCnt, nên sai
            // thứ tự là oracle sai theo.
            $"""
             SELECT {RowColumns}
               FROM TRNTRN
              WHERE pat_no = @p
                AND ISNULL(del_flg, 0) = 0
                AND trt_dt >= @d AND trt_dt < DATEADD(day, 1, @d)
              ORDER BY disp_no, seq
             """,
            cmd =>
            {
                cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
                cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;
            });

    /// <summary>Một dòng đã được ORACLE gán 来院回数.</summary>
    public sealed record RowVisit(TrtRow Row, int Visit)
    {
        public override string ToString() => $"来院{Visit} ← {Row}";
    }

    /// <summary>
    /// ORACLE — chạy lại <c>hfgRaiinCnt</c> trên các dòng CỦA MỘT NGÀY.
    ///
    /// <para>Vì mọi dòng cùng một ngày nên nhánh 「đổi ngày thì reset」 không dùng tới;
    /// phần còn lại chép nguyên: chỉ 処置 trong <see cref="VisitOpeningTrtCds"/> và có
    /// <c>回数 &gt; 0</c> mới tăng bộ đếm, và bộ đếm 0 vẫn ghi ra <b>1</b> chứ không phải
    /// 0 (modAcc.cs:1215-1220) — đó là lý do dòng đứng TRƯỚC 初診 vẫn thuộc lượt 1.</para>
    /// </summary>
    public static IReadOnlyList<RowVisit> AssignVisits(IReadOnlyList<TrtRow> dayRows)
    {
        var result = new List<RowVisit>();
        var visitCnt = 0;
        foreach (var row in dayRows)
        {
            if (row.OpensVisit) visitCnt++;
            result.Add(new RowVisit(row, visitCnt > 1 ? visitCnt : 1));
        }
        return result;
    }

    /// <summary>
    /// ORACLE — <c>UNPAID.SCORE</c> kỳ vọng của TỪNG lượt: Σ (trt_pt × 回数).
    ///
    /// <para>Bỏ dòng 自費 (<c>jihi_flg != 0</c>): điểm 自費 đi vào <c>jihiPrice</c>, và
    /// dòng 未精算 自費 luôn <c>score = 0</c> (modAcc.cs:706). Bệnh nhân test không có
    /// dòng nào như vậy — lọc ở đây để nếu có thì oracle vẫn đúng chứ không lặng lẽ
    /// cộng nhầm.</para>
    /// </summary>
    public static IReadOnlyDictionary<int, int> ExpectedScoreByVisit(IReadOnlyList<TrtRow> dayRows)
    {
        var byVisit = new Dictionary<int, int>();
        foreach (var rv in AssignVisits(dayRows))
        {
            if (rv.Row.JihiFlg != 0) continue;
            byVisit[rv.Visit] = byVisit.GetValueOrDefault(rv.Visit) + rv.Row.Score;
        }
        return byVisit;
    }

    // ── SEED: biến một ngày 1 lượt thành ngày 2 lượt ─────────────────────────

    /// <summary>Kết quả một lần nhân bản dòng.</summary>
    /// <param name="Source">Dòng gốc đã nhân bản (null = không tìm được dòng nào hợp lệ).</param>
    public sealed record SeedResult(int DispNo, TrtRow? Source, int Inserted, string Explain)
    {
        public override string ToString() =>
            $"disp_no {DispNo}: {(Inserted > 0 ? "OK" : "HỎNG")} — {Explain}" +
            (Source is null ? "" : $" | nguồn: {Source}");
    }

    /// <summary>
    /// Nhân bản MỘT dòng 処置 CÓ THẬT của chính bệnh nhân sang <paramref name="date"/>.
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// VÌ SAO NHÂN BẢN CHỨ KHÔNG TỰ DỰNG DÒNG MỚI
    /// ═══════════════════════════════════════════════════════════════════════
    /// <c>TRNTRN</c> có 84 cột, phần lớn <c>NOT NULL</c>, và <c>buiPrice</c> đọc tới
    /// <c>pat_br</c> / <c>jihi_flg</c> / <c>burden_type</c> chứ không chỉ 処置コード. Chép
    /// một dòng đã hợp lệ rồi chỉ đè <c>TRT_DT</c> / <c>DISP_NO</c> / <c>DSP_TRT</c> thì
    /// mọi cột còn lại chắc chắn hợp lệ vì chúng vốn đã hợp lệ ở dòng gốc.
    ///
    /// <para><b>Không đè <c>TRT_CD</c>.</b> Đè mã mà giữ nguyên <c>TRT_PT</c> là dựng ra
    /// dòng mà 点数 không khớp master — sai ngay chỗ đang đo. Nên dòng nguồn được CHỌN
    /// theo mã cần, và không có mã đó thì hàm báo hỏng để fixture tự Ignore, chứ không
    /// bịa ra một dòng.</para>
    ///
    /// <para><c>SEQ</c> bị loại khỏi danh sách cột vì nó là IDENTITY (và nằm trong khoá
    /// chính <c>PAT_NO/TRT_DT/DISP_NO/SEQ</c>): liệt kê nó là SQL Server từ chối thẳng
    /// 「Cannot insert explicit value for identity column」.</para>
    /// </summary>
    /// <param name="source">Dòng khuôn — lấy từ <see cref="FindOpenerTemplate"/> / <see cref="FindPlainTemplates"/>.</param>
    public SeedResult CloneRowOnto(DateTime date, int dispNo, TrtRow source, string dspTrt)
    {
        var columns = InsertableColumns();
        if (columns.Count == 0)
            return new SeedResult(dispNo, source, 0, "không đọc được danh sách cột của TRNTRN");

        var target = string.Join(", ", columns.Select(c => $"[{c}]"));
        var select = string.Join(", ", columns.Select(c =>
            c.Equals("TRT_DT", StringComparison.OrdinalIgnoreCase) ? "@newDt"
            : c.Equals("DISP_NO", StringComparison.OrdinalIgnoreCase) ? "@newDisp"
            : c.Equals("DSP_TRT", StringComparison.OrdinalIgnoreCase) ? "@newNm"
            : $"[{c}]"));

        using var con = Open();
        using var ins = Cmd(con,
            $"""
             INSERT INTO TRNTRN ({target})
             SELECT {select} FROM TRNTRN WHERE seq = @seq
             """);
        ins.Parameters.Add("@seq", SqlDbType.Int).Value = source.Seq;
        ins.Parameters.Add("@newDt", SqlDbType.DateTime).Value = date.Date;
        ins.Parameters.Add("@newDisp", SqlDbType.Int).Value = dispNo;
        ins.Parameters.Add("@newNm", SqlDbType.NVarChar, 200).Value = dspTrt;

        var n = ins.ExecuteNonQuery();
        return new SeedResult(dispNo, source, n,
            n > 0 ? $"đã chèn 1 dòng {source.TrtCd}/{source.TrtSb} {source.TrtPt}点 「{dspTrt}」"
                  : "INSERT không chèn được dòng nào");
    }

    /// <summary>
    /// Dòng khuôn cho 処置 <b>MỞ lượt</b> (mặc định 110 = 歯科再診料): phải cùng bệnh
    /// nhân, cùng 枝番 dùng được, và <c>回数 &gt; 0</c> — <c>hfgRaiinCnt</c> chỉ đếm dòng
    /// có 回数 &gt; 0 (modAcc.cs:1210).
    /// </summary>
    /// <returns>null = bệnh nhân không có dòng nào mang mã đó ⇒ fixture phải Ignore.</returns>
    public TrtRow? FindOpenerTemplate(int patNo, int trtCd) =>
        QueryRows(
            $"""
             SELECT TOP 1 {RowColumns}
               FROM TRNTRN
              WHERE pat_no = @p AND ISNULL(del_flg, 0) = 0
                AND trt_cd = @cd AND trt_cnt > 0
                AND disp_no < @seedBase
              ORDER BY trt_dt, disp_no
             """,
            cmd =>
            {
                cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
                cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
                // Không lấy chính dòng seed làm khuôn cho lượt sau: một lượt chạy hỏng
                // nửa chừng để lại rác, lượt sau nhân bản rác thì lỗi tự nhân đôi.
                cmd.Parameters.Add("@seedBase", SqlDbType.Int).Value = SeedDispNoBase;
            })
        .FirstOrDefault();

    /// <summary>
    /// Các dòng khuôn cho 処置 <b>TRUNG TÍNH</b> — KHÔNG mở lượt mới, để chứng minh
    /// chúng chỉ ĐI THEO lượt đứng trước.
    ///
    /// <para>Ba bộ lọc, mỗi cái chặn một cách hỏng đã lường trước:</para>
    /// <list type="bullet">
    /// <item><c>trt_cd NOT IN {100,107,110,111,333}</c> — dòng mở lượt thì mất ý nghĩa phép đo.</item>
    /// <item><c>trt_pt &gt; 0</c> và <c>jihi_flg = 0</c> — phải cộng được vào 点数 医療保険,
    ///       dòng 0 điểm không phân biệt được 「lượt」 với 「cả ngày」.</item>
    /// <item><b>(trt_cd, trt_sb) CHƯA có trên ngày test</b> — nhân bản một 処置 đã nằm sẵn
    ///       trong ngày là mời 処置チェック bung hộp thoại 「重複」 lạ, mà luật trả lời của
    ///       <c>UnpaidCreationFlow</c> gặp câu lạ thì phủ định và BỎ CUỘC giữa chuỗi F8.</item>
    /// </list>
    /// </summary>
    public IReadOnlyList<TrtRow> FindPlainTemplates(int patNo, DateTime dayToAvoid, int take) =>
        QueryRows(
            $"""
             SELECT TOP (@take) {RowColumns}
               FROM TRNTRN t
              WHERE t.pat_no = @p AND ISNULL(t.del_flg, 0) = 0
                AND t.trt_cd NOT IN (100, 107, 110, 111, 333)
                AND t.trt_pt > 0 AND t.trt_cnt > 0 AND ISNULL(t.jihi_flg, 0) = 0
                AND t.disp_no < @seedBase
                AND NOT EXISTS (SELECT 1 FROM TRNTRN d
                                 WHERE d.pat_no = t.pat_no AND ISNULL(d.del_flg, 0) = 0
                                   AND d.trt_dt >= @day AND d.trt_dt < DATEADD(day, 1, @day)
                                   AND d.trt_cd = t.trt_cd AND d.trt_sb = t.trt_sb)
              ORDER BY t.trt_dt, t.disp_no
             """,
            cmd =>
            {
                cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
                cmd.Parameters.Add("@take", SqlDbType.Int).Value = take;
                cmd.Parameters.Add("@day", SqlDbType.DateTime).Value = dayToAvoid.Date;
                cmd.Parameters.Add("@seedBase", SqlDbType.Int).Value = SeedDispNoBase;
            });

    private const string RowColumns =
        "disp_no, seq, trt_cd, trt_sb, trt_cnt, trt_pt, ISNULL(pat_br, 0) AS pat_br, " +
        "ISNULL(jihi_flg, 0) AS jihi_flg, ISNULL(dsp_trt, '') AS dsp_trt, " +
        "ISNULL(raiin_cnt, 0) AS raiin_cnt";

    private IReadOnlyList<TrtRow> QueryRows(string sql, Action<SqlCommand> bind)
    {
        using var con = Open();
        using var cmd = Cmd(con, sql);
        bind(cmd);

        var rows = new List<TrtRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new TrtRow(
                Convert.ToInt32(reader["disp_no"]),
                Convert.ToInt32(reader["seq"]),
                Convert.ToInt32(reader["trt_cd"]),
                Convert.ToInt32(reader["trt_sb"]),
                Convert.ToInt32(reader["trt_cnt"]),
                Convert.ToInt32(reader["trt_pt"]),
                Convert.ToInt32(reader["pat_br"]),
                Convert.ToInt32(reader["jihi_flg"]),
                Convert.ToString(reader["dsp_trt"]) ?? "",
                Convert.ToInt32(reader["raiin_cnt"])));
        }
        return rows;
    }

    /// <summary>Cột được phép liệt kê trong INSERT — bỏ IDENTITY và cột tính toán.</summary>
    private List<string> InsertableColumns()
    {
        var columns = new List<string>();
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT c.name
              FROM sys.columns c
             WHERE c.object_id = OBJECT_ID('TRNTRN')
               AND c.is_identity = 0
               AND c.is_computed = 0
             ORDER BY c.column_id
            """);
        using var reader = cmd.ExecuteReader();
        while (reader.Read()) columns.Add(reader.GetString(0));
        return columns;
    }

    /// <summary>Gỡ mọi dòng seed của luồng này. Chỉ chạm <c>disp_no &gt;= 9101</c>.</summary>
    public int RemoveSeedRows(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "DELETE FROM TRNTRN WHERE pat_no = @p AND disp_no >= @from AND disp_no < @to");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.Int).Value = SeedDispNoBase;
        cmd.Parameters.Add("@to", SqlDbType.Int).Value = SeedDispNoBase + 100;
        return cmd.ExecuteNonQuery();
    }

    // ── Tiền đề của ngày test ────────────────────────────────────────────────

    /// <summary>枝番 bảo hiểm còn hiệu lực tại ngày đó — <c>modPat.GetValidSubCode2</c>.</summary>
    /// <returns>null = KHÔNG có 枝番 nào phủ ngày đó ⇒ F8 không tính được tiền.</returns>
    public int? ValidInsuranceBranch(int patNo, DateTime date)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT TOP 1 pat_br FROM INSURANCE
             WHERE pat_no = @p
               AND med_st_dt <= @d
               AND (med_ed_dt IS NULL OR med_ed_dt >= @d)
             ORDER BY pat_br DESC
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;
        var v = cmd.ExecuteScalar();
        return v is null || v is DBNull ? null : Convert.ToInt32(v);
    }

    /// <summary>
    /// <c>Trntrn.getKaikeiPastSyosinCnt</c> (Trntrn.cs:1274) — số dòng 初診 TRƯỚC đầu
    /// tháng. Quyết định <c>sflg</c> ra <b>1</b> (chưa từng) hay <b>3</b> (再初診).
    /// </summary>
    public int PastSyosinCount(int patNo, DateTime firstOfMonth)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT COUNT(*) FROM TRNTRN
             WHERE PAT_NO = @patNo
               AND ( TRT_CD = 100 OR (TRT_CD = 107 AND PAT_BR = 0) )
               AND TRT_DT < @trtDt
            """);
        cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@trtDt", SqlDbType.DateTime).Value = firstOfMonth;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Ngày đã có 会計データ (<c>ACCDAT</c>) chưa — quyết định F8 có hỏi 「既に…」 không.</summary>
    public bool DayHasAccData(int patNo, DateTime date)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT COUNT(*) FROM ACCDAT
             WHERE pat_no = @p AND trt_dt >= @d AND trt_dt < DATEADD(day, 1, @d)
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;
        return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
    }

    // ── UNPAID ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Một dòng <c>UNPAID</c>. Có <c>LFLG</c> — luồng này bắt buộc phải phân biệt
    /// 医療保険 (<c>lflg = 0</c>) với 介護保険 (<c>lflg = 1</c>, <c>trt_cnt = 来院回数 + 100</c>).
    /// </summary>
    public sealed record UnpaidRow(
        DateTime TrtDt, int TrtCnt, int KmCd, int PatBr, int Score, int ClaimAmt,
        int Tax, int Sflg, int AttDr, int Lflg)
    {
        /// <summary>来院回数 thật của dòng — <c>trt_cnt % 100</c> (UnPaid.cs:357).</summary>
        public int Visit => TrtCnt % CareTrtCntOffset;

        public override string ToString() =>
            $"{TrtDt:yyyy-MM-dd} trt_cnt={TrtCnt,3} (来院{Visit}) 科目{KmCd} lflg={Lflg} " +
            $"score={Score,5} claim={ClaimAmt,6} tax={Tax} SFLG={Sflg} ATT_DR={AttDr}";
    }

    /// <summary>Dòng UNPAID của một ngày (hoặc của cả bệnh nhân khi <paramref name="date"/> null).</summary>
    public IReadOnlyList<UnpaidRow> ReadUnpaid(int patNo, DateTime? date)
    {
        using var con = Open();
        var where = date is null ? "" : " AND trt_dt >= @d AND trt_dt < DATEADD(day, 1, @d)";
        using var cmd = Cmd(con,
            $"""
             SELECT trt_dt, trt_cnt, km_cd, ISNULL(pat_br, 0) AS pat_br, score, claim_amt,
                    ISNULL(tax, 0) AS tax, sflg, att_dr, ISNULL(lflg, 0) AS lflg
               FROM UNPAID
              WHERE pat_no = @p{where}
              ORDER BY trt_dt, trt_cnt, km_cd
             """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        if (date is not null) cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Value.Date;

        var rows = new List<UnpaidRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new UnpaidRow(
                Convert.ToDateTime(reader["trt_dt"]),
                Convert.ToInt32(reader["trt_cnt"]),
                Convert.ToInt32(reader["km_cd"]),
                Convert.ToInt32(reader["pat_br"]),
                Convert.ToInt32(reader["score"]),
                Convert.ToInt32(reader["claim_amt"]),
                Convert.ToInt32(reader["tax"]),
                reader["sflg"] is DBNull ? -1 : Convert.ToInt32(reader["sflg"]),
                reader["att_dr"] is DBNull ? -1 : Convert.ToInt32(reader["att_dr"]),
                Convert.ToInt32(reader["lflg"])));
        }
        return rows;
    }

    /// <summary>
    /// Trả <c>UNPAID</c> của ĐÚNG ngày test về nguyên trạng.
    ///
    /// <para>Chỉ xoá dòng của NGÀY TEST chứ không xoá hết của bệnh nhân: F8 cũng chỉ
    /// đụng tới ngày đó (<c>deleteTrtDtUnPaid</c> lọc <c>trt_dt</c>), nên xoá rộng hơn
    /// là tự chuốc lấy rủi ro không cần thiết.</para>
    ///
    /// <para>Chèn lại có <c>lflg</c> và <c>tax</c> — thiếu <c>lflg</c> thì dòng 介護 sống
    /// dậy thành dòng 医療保険 và 窓口精算 đọc sai.</para>
    /// </summary>
    public void RestoreUnpaidForDay(int patNo, DateTime date, IReadOnlyList<UnpaidRow> snapshot)
    {
        using var con = Open();

        using (var del = Cmd(con,
            "DELETE FROM UNPAID WHERE pat_no = @p AND trt_dt >= @d AND trt_dt < DATEADD(day, 1, @d)"))
        {
            del.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            del.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;
            del.ExecuteNonQuery();
        }

        foreach (var r in snapshot)
        {
            using var ins = Cmd(con,
                """
                INSERT INTO UNPAID
                       (trt_dt, trt_cnt, pat_no, km_cd, pat_br, score, claim_amt, tax, sflg, att_dr, lflg)
                VALUES (@d, @cnt, @p, @km, @br, @sc, @cl, @tx, @sf, @dr, @lf)
                """);
            ins.Parameters.Add("@d", SqlDbType.DateTime).Value = r.TrtDt;
            ins.Parameters.Add("@cnt", SqlDbType.TinyInt).Value = r.TrtCnt;
            ins.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            ins.Parameters.Add("@km", SqlDbType.SmallInt).Value = r.KmCd;
            ins.Parameters.Add("@br", SqlDbType.SmallInt).Value = r.PatBr;
            ins.Parameters.Add("@sc", SqlDbType.Int).Value = r.Score;
            ins.Parameters.Add("@cl", SqlDbType.Int).Value = r.ClaimAmt;
            ins.Parameters.Add("@tx", SqlDbType.Int).Value = r.Tax;
            ins.Parameters.Add("@sf", SqlDbType.TinyInt).Value = Math.Max(r.Sflg, 0);
            ins.Parameters.Add("@dr", SqlDbType.TinyInt).Value = Math.Max(r.AttDr, 0);
            ins.Parameters.Add("@lf", SqlDbType.TinyInt).Value = r.Lflg;
            ins.ExecuteNonQuery();
        }
    }
}
