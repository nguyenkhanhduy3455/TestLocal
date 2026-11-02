using System.Data;
using System.Text;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// Dữ liệu của luồng 窓口精算 (SEISAN): seed <c>UNPAID</c> cho bệnh nhân test, đọc cấu
/// hình (<c>ACCCONFIG</c>…) và chụp 7 bảng mà SEISAN ghi để so trước/sau.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO SEED THẲNG DB DÙNG ĐƯỢC Ở ĐÂY (khác F21)
/// ═══════════════════════════════════════════════════════════════════════════
/// frm204002 đọc 未精算 lại từ DB mỗi lần mở: <c>initProc → getUnpaid</c> gọi
/// <c>UnPaid.getUnPaidList(con, _patNo, …)</c> (frm204002.cs:400-447, UnPaid.cs:129/192).
/// Không có mảng nào giữ trong RAM từ màn trước, nên dòng chèn trước khi mở màn là
/// dòng app thấy.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HÀNG RÀO
/// ═══════════════════════════════════════════════════════════════════════════
/// Mọi lệnh GHI chặn ở <c>PAT_NO &gt;= TestPatientDb.TestPatNoBase</c>. Bệnh nhân test
/// bị <c>SeededPatientTestBase</c> xoá sạch cuối lượt (UNPAID/ACCDAT/YOYAKU nằm trong
/// <c>TestPatientDb.GeneratedTables</c>), nên lớp này không tự dọn những bảng đó.
/// </summary>
public sealed class SeisanDb
{
    /// <summary>
    /// Bảng mà SEISAN GHI (đếm từ frm204002/204004/204005/204001):
    /// AccDat.insert/update/delete, PersonExp.update, UnPaid.delete, PrtRct.insert,
    /// Yoyaku.updateResSts, MstGoods.insertGoodsStockHistory, AccConfig.updateAccConfigReceType.
    /// </summary>
    public static readonly string[] PatientTables = ["UNPAID", "ACCDAT", "PERSON_EXP", "PRT_RCT", "YOYAKU"];

    /// <summary>Một dòng 未精算 seed — các cột còn lại lấy mặc định của <c>UnPaidData.InitDefault</c>.</summary>
    public sealed record UnpaidSeed(DateTime TrtDt, int KmCd, int Score, int ClaimAmt,
                                    int Discount = 0, int Tax = 0, int ReceAmt = -1, int ScoreD1 = 0,
                                    int ScoreD9 = 0, int Lflg = 0, int ReceTax = 0, int TrtCnt = 1);

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private SeisanDb(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static SeisanDb? CreateOrNull(TestSettings s)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new SeisanDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    private SqlConnection Open()
    {
        var con = new SqlConnection(_connectionString);
        con.Open();
        return con;
    }

    private SqlCommand Command(SqlConnection con, string sql)
    {
        var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = _commandTimeout;
        return cmd;
    }

    private static void RequireTestRange(int patNo)
    {
        if (patNo < TestPatientDb.TestPatNoBase)
            throw new InvalidOperationException(
                $"PAT_NO {patNo} nằm NGOÀI vùng bệnh nhân test (>= {TestPatientDb.TestPatNoBase}). " +
                "SeisanDb chỉ được ghi vào bệnh nhân do SeededPatientTestBase dựng ra.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Seed
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Chèn các dòng <c>UNPAID</c> — đúng 40 cột mà <c>UnPaid.insertUnPaid</c> ghi
    /// (UnPaid.cs:373-450), mặc định theo <c>InitDefault</c> (UnPaid.cs:77-120).
    /// </summary>
    public int SeedUnpaid(int patNo, int patBr, IEnumerable<UnpaidSeed> rows)
    {
        RequireTestRange(patNo);

        using var con = Open();
        var n = 0;
        foreach (var r in rows)
        {
            using var cmd = Command(con,
                """
                INSERT INTO UNPAID (TRT_DT, TRT_CNT, PAT_NO, KM_CD, SCORE, CLAIM_AMT, DISCOUNT, TAX,
                    ACCR_AMT, ACCR_TAX, APPR_AMT, APPR_TAX, RECE_AMT, RECE_TAX, RECE_KBN, PFLG, SFLG,
                    GDS_CD, GDS_CNT, ATT_DR, ACC_TM, MEDS, TFLG, NTE,
                    SCORE_D1, SCORE_D2, SCORE_D3, SCORE_D4, SCORE_D5, SCORE_D6, SCORE_D7,
                    SCORE_D8, SCORE_D9, SCORE_D10, SCORE_D11, SCORE_D12, SCORE_D13, SCORE_D14,
                    PAT_BR, LFLG)
                VALUES (@dt, @cnt, @p, @km, @score, @claim, @disc, @tax,
                    0, 0, 0, 0, @rece, @receTax, 1, 0, 1,
                    0, 0, 1, '', 0, 0, '',
                    @d1, 0, 0, 0, 0, 0, 0,
                    0, @d9, 0, 0, 0, 0, 0,
                    @br, @lflg)
                """);
            cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = r.TrtDt.Date;
            cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            cmd.Parameters.Add("@cnt", SqlDbType.Int).Value = r.TrtCnt;
            cmd.Parameters.Add("@km", SqlDbType.Int).Value = r.KmCd;
            cmd.Parameters.Add("@score", SqlDbType.Int).Value = r.Score;
            cmd.Parameters.Add("@claim", SqlDbType.Int).Value = r.ClaimAmt;
            cmd.Parameters.Add("@disc", SqlDbType.Int).Value = r.Discount;
            cmd.Parameters.Add("@tax", SqlDbType.Int).Value = r.Tax;
            cmd.Parameters.Add("@rece", SqlDbType.Int).Value = r.ReceAmt;
            cmd.Parameters.Add("@receTax", SqlDbType.Int).Value = r.ReceTax;
            cmd.Parameters.Add("@d1", SqlDbType.Int).Value = r.ScoreD1;
            cmd.Parameters.Add("@d9", SqlDbType.Int).Value = r.ScoreD9;
            cmd.Parameters.Add("@br", SqlDbType.Int).Value = patBr;
            cmd.Parameters.Add("@lflg", SqlDbType.Int).Value = r.Lflg;
            n += cmd.ExecuteNonQuery();
        }
        return n;
    }

    /// <summary>Xoá hết UNPAID của bệnh nhân test rồi seed lại — mỗi ca G3 bắt đầu từ trạng thái riêng.</summary>
    public int ReplaceUnpaid(int patNo, IEnumerable<UnpaidSeed> rows)
    {
        RequireTestRange(patNo);
        using (var con = Open())
        using (var cmd = Command(con, "DELETE FROM UNPAID WHERE PAT_NO = @p"))
        {
            cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            cmd.ExecuteNonQuery();
        }
        return SeedUnpaid(patNo, FirstPatBr(patNo), rows);
    }

    /// <summary>
    /// Số dư của bệnh nhân test: 未収 (→ txtAccrH/J/B) và 預り金 (→ txtDeposit), đọc ở
    /// <c>getPatInfo</c> mỗi lần mở frm204002 (frm204002.cs:710-714).
    /// </summary>
    public void SetPersonExp(int patNo, int insDueBal = 0, int ownDueBal = 0, int ownDueExc = 0,
                             int gdsDueBal = 0, int gdsDueExc = 0, int depDue = 0)
    {
        RequireTestRange(patNo);
        using var con = Open();
        using var cmd = Command(con,
            """
            UPDATE PERSON_EXP SET INS_DUE_BAL = @i, OWN_DUE_BAL = @o, OWN_DUE_EXC = @oe,
                                  GDS_DUE_BAL = @g, GDS_DUE_EXC = @ge, DEP_DUE = @d
             WHERE PAT_NO = @p
            """);
        cmd.Parameters.Add("@i", SqlDbType.Int).Value = insDueBal;
        cmd.Parameters.Add("@o", SqlDbType.Int).Value = ownDueBal;
        cmd.Parameters.Add("@oe", SqlDbType.Int).Value = ownDueExc;
        cmd.Parameters.Add("@g", SqlDbType.Int).Value = gdsDueBal;
        cmd.Parameters.Add("@ge", SqlDbType.Int).Value = gdsDueExc;
        cmd.Parameters.Add("@d", SqlDbType.Int).Value = depDue;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
    }

    /// <summary>負担率 hiện ở txtAccRate (gakushi = 1 ⇒ luôn 0, frm204002.cs:696-702).</summary>
    public void SetAccRate(int patNo, int accRate, int gakushi = 0)
    {
        RequireTestRange(patNo);
        using var con = Open();
        using var cmd = Command(con, "UPDATE INSURANCE SET ACC_RATE = @r, GAKUSHI = @g WHERE PAT_NO = @p");
        cmd.Parameters.Add("@r", SqlDbType.Int).Value = accRate;
        cmd.Parameters.Add("@g", SqlDbType.Int).Value = gakushi;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// <c>ACCCONFIG.J_TAX_KBN</c> / <c>J_CALC_KBN</c> — dòng DUY NHẤT, áp cho TOÀN app. Chỉ
    /// fixture ma trận thuế gọi, và nó phải trả lại giá trị cũ ở OneTimeTearDown.
    /// frm204002 đọc lại mỗi lần mở (initProc → getIniConstData, frm204002.cs:312-327).
    /// </summary>
    public (int TaxKbn, int CalcKbn) GetJihiTaxConfig()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT J_TAX_KBN, J_CALC_KBN FROM ACCCONFIG");
        using var r = cmd.ExecuteReader();
        r.Read();
        return (Convert.ToInt32(r.GetValue(0)), Convert.ToInt32(r.GetValue(1)));
    }

    public void SetJihiTaxConfig(int taxKbn, int calcKbn)
    {
        using var con = Open();
        using var cmd = Command(con, "UPDATE ACCCONFIG SET J_TAX_KBN = @t, J_CALC_KBN = @c");
        cmd.Parameters.Add("@t", SqlDbType.Int).Value = taxKbn;
        cmd.Parameters.Add("@c", SqlDbType.Int).Value = calcKbn;
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Đặt カナ riêng cho bệnh nhân test để tìm 患者検索 ra đúng MỘT dòng — カナ clone từ
    /// bệnh nhân mẫu trùng với hàng chục bệnh nhân thật.
    /// </summary>
    public void SetPatientKana(int patNo, string kana)
    {
        RequireTestRange(patNo);
        using var con = Open();
        using var cmd = Command(con, "UPDATE INSURANCE SET PAT_KN = @kn WHERE PAT_NO = @p");
        cmd.Parameters.Add("@kn", SqlDbType.NVarChar, 60).Value = kana;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
    }

    /// <summary><c>PAT_BR</c> mà <c>getPatInfo</c> của frm204001 sẽ chọn — 枝番 nhỏ nhất của bệnh nhân.</summary>
    public int FirstPatBr(int patNo)
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT ISNULL(MIN(PAT_BR), 1) FROM INSURANCE WHERE PAT_NO = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Đọc — dạng 「cột=giá trị」 để probe in nguyên ra KQ
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Mọi dòng của một câu SELECT, mỗi dòng thành 「COL=val COL=val …」.</summary>
    public IReadOnlyList<string> Rows(string sql, int? patNo = null)
    {
        using var con = Open();
        using var cmd = Command(con, sql);
        if (patNo is { } p) cmd.Parameters.Add("@p", SqlDbType.Int).Value = p;

        var result = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var sb = new StringBuilder();
            for (var i = 0; i < reader.FieldCount; i++)
            {
                var v = reader.IsDBNull(i) ? "NULL" : Convert.ToString(reader.GetValue(i))?.Trim();
                sb.Append(reader.GetName(i)).Append('=').Append(v).Append(' ');
            }
            result.Add(sb.ToString().TrimEnd());
        }
        return result;
    }

    /// <summary>Ô đầu tiên của câu SELECT, đã Trim; null nếu không có dòng hoặc NULL.</summary>
    public string? Scalar(string sql)
    {
        using var con = Open();
        using var cmd = Command(con, sql);
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToString(v)?.Trim();
    }

    /// <summary>Số dòng của bệnh nhân trên từng bảng SEISAN ghi — mốc 「probe không ghi gì」.</summary>
    public IReadOnlyDictionary<string, int> CountPatientRows(int patNo)
    {
        var counts = new Dictionary<string, int>();
        using var con = Open();
        foreach (var t in PatientTables)
        {
            try
            {
                using var cmd = Command(con, $"SELECT COUNT(*) FROM [{t}] WHERE PAT_NO = @p");
                cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
                counts[t] = Convert.ToInt32(cmd.ExecuteScalar());
            }
            catch (SqlException) { counts[t] = -1; }
        }
        return counts;
    }

    /// <summary>Số dòng <c>GOODS_STOCK_HISTORY</c> — bảng không mang PAT_NO nên đếm cả bảng.</summary>
    public int? CountGoodsStockHistory()
    {
        try
        {
            using var con = Open();
            using var cmd = Command(con, "SELECT COUNT(*) FROM GOODS_STOCK_HISTORY");
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
        catch (SqlException) { return null; }
    }
}
