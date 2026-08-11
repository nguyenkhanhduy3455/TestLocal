using System.Data;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Data;

/// <summary>
/// Truy vấn CHỈ ĐỌC vào SQL Server của app (mặc định <c>SIM2000</c>, xem
/// <c>INP/Call/Ocha.xml</c>).
///
/// ─── Vì sao test cần DB ──────────────────────────────────────────────────────
/// Ba cột điểm của tab 個別 chỉ có nghĩa khi biết score1/score2/score3 THẬT của 処置 đó,
/// và nhánh <c>getTensu</c> còn rẽ theo <c>acc_unit</c>/<c>f1</c> — mà cả ba thứ này đều
/// nằm ở CỘT ẨN, không đọc được từ giao diện (modKobetu.cs:96-131). Không có DB thì
/// testcase chỉ còn so ô này với ô kia, tức là chẳng kiểm được gì.
///
/// 処置 đem test KHÔNG hard-code: <see cref="FindScoreCandidate"/> hỏi thẳng bản master
/// ĐANG ÁP DỤNG cho ngày test (đúng bảng mà <c>ModCommon.Get_strTrt</c> chọn) để lấy một
/// dòng có score1/2/3 khác nhau ĐÔI MỘT — điều kiện cần để phân biệt được cột nào đang
/// lấy nhầm cột nào.
///
/// ⚠️ Lớp này KHÔNG BAO GIỜ ghi. Test cũng không seed gì cả: tiền đề 「ngày 訪問診療」 của
///    TC-2 được dựng bằng chính giao diện (chọn 歯科訪問診療 mã 333 ở tab 個別, làm
///    <c>ModCommon.pHoumon[ngày] = true</c> — modKobetu.cs:337-338).
/// </summary>
public sealed class OchaDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private OchaDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    /// <summary>Trả về null khi <c>db.enabled=false</c> hoặc thiếu chuỗi kết nối — test sẽ Ignore.</summary>
    public static OchaDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new OchaDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    /// <summary>Thử kết nối; hỏng thì trả về câu lỗi để testcase Ignore có lý do rõ ràng.</summary>
    public string? ProbeError()
    {
        try
        {
            using var con = Open();
            return null;
        }
        catch (Exception e)
        {
            return e.Message;
        }
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

    /// <summary>
    /// Tên bảng master áp dụng cho ngày đó (<c>MST_TRT087</c>…), lấy từ <c>TRT_SEL</c> —
    /// đúng bảng mà app đọc (TrtSel.cs:21-51, ModCommon.Get_strTrt).
    /// </summary>
    public string ActiveTrtTable(DateTime date)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT TOP 1 MTBL_NM
              FROM TRT_SEL
             WHERE START_DT <= @d
               AND (END_DT >= @d OR END_DT IS NULL)
             ORDER BY START_DT DESC
            """);
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;

        var name = cmd.ExecuteScalar() as string;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException(
                $"TRT_SEL không có bản master nào phủ ngày {date:yyyy-MM-dd} — app cũng sẽ không " +
                "nạp được lưới 個別.");

        // Tên bảng phải nối chuỗi vào SQL (không tham số hoá được), nên chặn ở đây.
        if (!Regex.IsMatch(name, "^MST[A-Za-z0-9_]*$"))
            throw new InvalidOperationException($"Tên bảng master lạ trong TRT_SEL: 「{name}」");

        return name;
    }

    /// <summary>
    /// Một 処置 đủ điều kiện phân biệt ba cột điểm:
    ///   · score1/score2/score3 khác nhau ĐÔI MỘT và đều &gt; 0 — hai cột trùng giá trị thì
    ///     lấy nhầm cột vẫn "đúng" và testcase mất tác dụng;
    ///   · <c>f1 = 0</c> + <c>acc_unit</c> 9..12 (処置・手術・麻酔・歯冠修復) — nhánh 訪問診療 của
    ///     getTensu trả score3, không dính 特別対応加算 (f1 10/11) hay 訪問で算定不可 (f1 2);
    ///   · loại các mã mà 個別 mở hộp thoại nhập liệu trước khi chèn (17 自費, 179-5 分割抜歯,
    ///     50/202/203 IS・全身麻酔, 549) và dải 薬剤 600-699 — chúng rẽ sang đường khác
    ///     (modKobetu.cs:307-341);
    ///   · <c>RIGHT(trt_nm,1) &lt;&gt; '!'</c> — đúng điều kiện app dùng khi nạp lưới
    ///     (modKobetu.cs:181-185), nếu không sẽ chọn phải dòng không bao giờ hiện.
    /// </summary>
    public MstTrtCandidate? FindScoreCandidate(DateTime date)
    {
        var table = ActiveTrtTable(date);

        using var con = Open();
        using var cmd = Command(con,
            $"""
             SELECT TOP 1 trt_cd, trt_sb, trt_nm, cct_nm, score1, score2, score3, f1, acc_unit
               FROM {table}
              WHERE f1 = 0
                AND acc_unit BETWEEN 9 AND 12
                AND score1 > 0 AND score2 > 0 AND score3 > 0
                AND score1 <> score2
                AND score2 <> score3
                AND score1 <> score3
                AND RIGHT(trt_nm, 1) <> '!'
                AND trt_cd NOT IN (17, 50, 179, 202, 203, 333, 549, 999)
                AND trt_cd NOT BETWEEN 600 AND 699
              ORDER BY trt_cd, trt_sb
             """);

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        return new MstTrtCandidate(
            TrtCd: Convert.ToInt32(reader["trt_cd"]),
            TrtSb: Convert.ToInt32(reader["trt_sb"]),
            TrtNm: reader["trt_nm"].ToString() ?? "",
            CctNm: reader["cct_nm"].ToString() ?? "",
            Score1: Convert.ToInt32(reader["score1"]),
            Score2: Convert.ToInt32(reader["score2"]),
            Score3: Convert.ToInt32(reader["score3"]),
            F1: Convert.ToInt32(reader["f1"]),
            AccUnit: Convert.ToInt32(reader["acc_unit"]),
            MasterTable: table);
    }

    /// <summary>
    /// Tên của một 処置 trong bản master đang áp dụng — để dò dòng trên lưới đăng ký.
    /// Lấy 枝番 nhỏ nhất: chỉ cần một cái tên để so chuỗi, không cần đúng 枝番.
    /// </summary>
    public (string TrtNm, string CctNm)? FindTrtName(DateTime date, int trtCd)
    {
        var table = ActiveTrtTable(date);

        using var con = Open();
        using var cmd = Command(con,
            $"SELECT TOP 1 trt_nm, cct_nm FROM {table} WHERE trt_cd = @cd ORDER BY trt_sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;
        return (reader["trt_nm"].ToString() ?? "", reader["cct_nm"].ToString() ?? "");
    }

    /// <summary>
    /// Tuổi (tính tới ngày test) và <c>dis_flg</c> của bệnh nhân — hai tham số rẽ nhánh của
    /// <c>getTensu</c> (CommonChk.cs:89-99).
    ///
    /// Chọn 枝番 bảo hiểm còn hiệu lực trong ngày; không có dòng nào phủ ngày đó thì lấy
    /// 枝番 lớn nhất — xấp xỉ <c>modPat.GetValidSubCode2</c> mà app dùng.
    /// </summary>
    public PatientScoreContext? GetPatientContext(int patNo, DateTime date)
    {
        using var con = Open();

        using (var cmd = Command(con,
            """
            SELECT TOP 1 per.pat_birth_dt AS birth, ins.dis_flg AS dis_flg
              FROM person per
             INNER JOIN insurance ins ON ins.pat_no = per.pat_no
             WHERE per.pat_no = @patNo
               AND (ins.med_st_dt IS NULL OR ins.med_st_dt <= @d)
               AND (ins.med_ed_dt IS NULL OR ins.med_ed_dt >= @d)
             ORDER BY ins.pat_br DESC
            """))
        {
            cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;
            cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;
            var hit = ReadContext(cmd, date);
            if (hit is not null) return hit;
        }

        using (var cmd = Command(con,
            """
            SELECT TOP 1 per.pat_birth_dt AS birth, ins.dis_flg AS dis_flg
              FROM person per
             INNER JOIN insurance ins ON ins.pat_no = per.pat_no
             WHERE per.pat_no = @patNo
             ORDER BY ins.pat_br DESC
            """))
        {
            cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;
            return ReadContext(cmd, date);
        }
    }

    private static PatientScoreContext? ReadContext(SqlCommand cmd, DateTime date)
    {
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var birth = ToDate(reader["birth"]);
        if (birth is null) return null;

        var disFlg = reader["dis_flg"] is DBNull ? 0 : Convert.ToInt32(reader["dis_flg"]);
        return new PatientScoreContext(birth.Value, AgeAt(birth.Value, date), disFlg);
    }

    /// <summary>Câu thông báo trong bảng <c>MSGTBL</c> (MsgTbl.cs:getMsg), <c>{0}</c> chưa thay.</summary>
    public string? GetMessage(string id)
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT TOP 1 MSG FROM MSGTBL WHERE ID = @id");
        cmd.Parameters.Add("@id", SqlDbType.NVarChar, 16).Value = id;
        return cmd.ExecuteScalar() as string;
    }

    /// <summary>
    /// Chuỗi cảnh báo mà app sẽ hiện: lấy khuôn từ MSGTBL rồi thay <c>{0}</c> bằng nhãn —
    /// đúng như <c>MsgDialog.getMsg</c> (MsgDialog.cs:184-213). MSGTBL không có ID đó thì
    /// dựng theo mẫu quen thuộc để test vẫn chạy được.
    /// </summary>
    public string ExpectedMessage(string id, string label)
    {
        var template = GetMessage(id);
        if (string.IsNullOrEmpty(template)) return label + "が間違っています。";
        return template.Contains("{0}") ? template.Replace("{0}", label) : template + label;
    }

    /// <summary>Tuổi tròn tính tới ngày chỉ định (ComLibrary.getAge).</summary>
    public static int AgeAt(DateTime birth, DateTime on)
    {
        var age = on.Year - birth.Year;
        if (on.Month < birth.Month || (on.Month == birth.Month && on.Day < birth.Day)) age--;
        return age;
    }

    private static DateTime? ToDate(object value) => value switch
    {
        DBNull or null => null,
        DateTime d => d,
        string s when DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) => d,
        string s when DateTime.TryParseExact(s, ["yyyyMMdd", "yyyy/MM/dd"], CultureInfo.InvariantCulture,
                                             DateTimeStyles.None, out var d) => d,
        _ => null,
    };
}

/// <summary>Một dòng master đủ điều kiện làm 処置 đem test.</summary>
public sealed record MstTrtCandidate(
    int TrtCd,
    int TrtSb,
    string TrtNm,
    string CctNm,
    int Score1,
    int Score2,
    int Score3,
    int F1,
    int AccUnit,
    string MasterTable)
{
    /// <summary>
    /// Tên hiện trên lưới là <c>cct_nm</c> hay <c>trt_nm</c> tuỳ <c>ModCommon.pCultTrt</c>
    /// (modKobetu.cs:205-209) ⇒ dò dòng phải chấp nhận CẢ HAI.
    /// </summary>
    public string[] DisplayNames => new[] { TrtNm, CctNm }.Where(s => s.Length > 0).ToArray();

    public override string ToString() =>
        $"{TrtCd}-{TrtSb} 「{TrtNm}」 score1={Score1} score2={Score2} score3={Score3} " +
        $"acc_unit={AccUnit} f1={F1} ({MasterTable})";
}

/// <summary>Thông tin bệnh nhân mà getTensu rẽ nhánh theo.</summary>
public sealed record PatientScoreContext(DateTime Birth, int Age, int DisFlg);
