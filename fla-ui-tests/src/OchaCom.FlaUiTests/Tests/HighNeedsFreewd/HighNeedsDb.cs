using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

/// <summary>
/// Truy vấn cho luồng 歯科診療困難者加算 — tách khỏi <see cref="Data.OchaDb"/> vì lớp đó
/// tuyên bố CHỈ ĐỌC, còn ở đây có <see cref="PatchDisFlg"/> GHI vào <c>INSURANCE</c>.
///
/// <para>Cùng lý do <c>ParitySaveData/OchaDbParity.cs</c> đứng riêng: một lớp mà nửa
/// đọc nửa ghi thì lời hứa "không đụng dữ liệu" của lớp kia mất giá trị.</para>
///
/// ─── Vì sao phải vá <c>dis_flg</c> ───────────────────────────────────────────
/// Câu hỏi 「著しく歯科診療が困難な患者に対する加算を算定しますか？」 chỉ bung ra khi
/// <c>dis_flg == 3</c> (modSave.cs:3450, frm203016.cs:1098 / :1111). Đo trên chính DB
/// mà máy test đang trỏ tới (SIM2000, 2026-08-26):
/// <code>
///   dis_flg | số dòng | số bệnh nhân
///         0 |  21.756 |       16.322
///         1 |       3 |            2
///         2 |      25 |           14
///         3 |       0 |            0     ← KHÔNG CÓ
/// </code>
/// ⇒ chạy trên dữ liệu thật thì nhánh này KHÔNG BAO GIỜ tới được. Đây đúng tình trạng
/// bên bản web (xem <c>treatment-score-gettensu-parity.spec.ts:97-99</c>), và cách xử
/// lý cũng lấy y bên đó: vá tạm rồi trả lại nguyên trạng trong <c>finally</c>.
///
/// ─── Vá THEO BỆNH NHÂN, không theo 枝番 ─────────────────────────────────────
/// App đọc <c>dis_flg</c> của 枝番 còn hiệu lực tại 診療日
/// (<c>modPat.GetValidSubCode2</c> → <c>CommonInp._patInfoList[InsuIndex].ins</c>,
/// modSave.cs:3037-3041). Một bệnh nhân có nhiều 枝番, vá trúng cái app KHÔNG đọc thì
/// testcase đỏ oan mà log trông y hệt 「WinForm không hỏi」. Bên Playwright đã dính đúng
/// bẫy này. Nên: vá HẾT 枝番, và khôi phục từng cái theo ảnh chụp trước khi vá.
/// </summary>
public sealed class HighNeedsDb
{
    /// <summary>Giá trị <c>dis_flg</c> mở ra câu hỏi 困難者加算 (modSave.cs:3450).</summary>
    public const int DisFlgHighNeeds = 3;

    /// <summary>Giá trị <c>FREEWD</c> mà 「はい」 ghi xuống (modSave.cs:3455, frm203016.cs:1101).</summary>
    public const string FreewdDifficult = "1";

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private HighNeedsDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static HighNeedsDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new HighNeedsDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    /// <summary>Một 枝番 bảo hiểm và <c>dis_flg</c> của nó.</summary>
    public sealed record InsuranceBranch(int PatBr, int DisFlg)
    {
        public override string ToString() => $"枝番{PatBr}=dis_flg {DisFlg}";
    }

    /// <summary>Mọi 枝番 của một bệnh nhân, kèm <c>dis_flg</c> hiện tại.</summary>
    public IReadOnlyList<InsuranceBranch> Branches(int patNo)
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT pat_br, dis_flg FROM INSURANCE WHERE pat_no = @patNo ORDER BY pat_br");
        cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;

        var rows = new List<InsuranceBranch>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new InsuranceBranch(
                Convert.ToInt32(reader["pat_br"]),
                reader["dis_flg"] is DBNull ? 0 : Convert.ToInt32(reader["dis_flg"])));
        }
        return rows;
    }

    /// <summary>Phân bố <c>dis_flg</c> toàn bảng — in ra để biết dữ liệu máy này có gì.</summary>
    public IReadOnlyList<(int DisFlg, int Rows, int Patients)> DisFlgHistogram()
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT dis_flg, COUNT(*) AS n, COUNT(DISTINCT pat_no) AS pats
              FROM INSURANCE
             GROUP BY dis_flg
             ORDER BY dis_flg
            """);

        var rows = new List<(int, int, int)>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            rows.Add((
                reader["dis_flg"] is DBNull ? 0 : Convert.ToInt32(reader["dis_flg"]),
                Convert.ToInt32(reader["n"]),
                Convert.ToInt32(reader["pats"])));
        }
        return rows;
    }

    /// <summary>Đặt <c>dis_flg</c> cho MỌI 枝番 của bệnh nhân; trả về số dòng đã sửa.</summary>
    public int PatchDisFlg(int patNo, int disFlg)
    {
        using var con = Open();
        using var cmd = Command(con, "UPDATE INSURANCE SET dis_flg = @f WHERE pat_no = @patNo");
        cmd.Parameters.Add("@f", SqlDbType.Int).Value = disFlg;
        cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;
        return cmd.ExecuteNonQuery();
    }

    /// <summary>Trả <c>dis_flg</c> về đúng như ảnh chụp trước khi vá.</summary>
    public void RestoreDisFlg(int patNo, IReadOnlyList<InsuranceBranch> snapshot)
    {
        using var con = Open();
        foreach (var b in snapshot)
        {
            using var cmd = Command(con,
                "UPDATE INSURANCE SET dis_flg = @f WHERE pat_no = @patNo AND pat_br = @br");
            cmd.Parameters.Add("@f", SqlDbType.Int).Value = b.DisFlg;
            cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;
            cmd.Parameters.Add("@br", SqlDbType.Int).Value = b.PatBr;
            cmd.ExecuteNonQuery();
        }
    }

    /// <summary>Một dòng 処置 đã lưu, chỉ các cột luồng này quan tâm.</summary>
    public sealed record SavedRow(int TrtCd, int TrtSb, string Freewd, string DspTrt)
    {
        public override string ToString() => $"{TrtCd}-{TrtSb} freewd=[{Freewd}] 「{DspTrt.Trim()}」";
    }

    /// <summary>
    /// Các dòng <c>TRNTRN</c> của một bệnh nhân trong một ngày — đường đọc <c>FREEWD</c>
    /// sau khi bấm F9 (modSave.cs:2073 ghi từ <c>ArrTrntrn[i, 72]</c>).
    /// </summary>
    public IReadOnlyList<SavedRow> SavedRows(int patNo, DateTime trtDt)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT trt_cd, trt_sb, ISNULL(freewd, '') AS freewd, ISNULL(dsp_trt, '') AS dsp_trt
              FROM TRNTRN
             WHERE pat_no = @patNo
               AND trt_dt = @d
               AND ISNULL(del_flg, 0) = 0
             ORDER BY disp_no
            """);
        cmd.Parameters.Add("@patNo", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Date;

        var rows = new List<SavedRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new SavedRow(
                Convert.ToInt32(reader["trt_cd"]),
                Convert.ToInt32(reader["trt_sb"]),
                reader["freewd"].ToString() ?? "",
                reader["dsp_trt"].ToString() ?? ""));
        }
        return rows;
    }

    /// <summary>Tên 処置 của một cặp mã/枝番 trong bản master áp dụng cho ngày đó.</summary>
    public string? TrtName(string masterTable, int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT TOP 1 trt_nm FROM {masterTable} WHERE trt_cd = @cd AND trt_sb = @sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;
        return cmd.ExecuteScalar() as string;
    }

    /// <summary>Các 枝番 của một 処置コード có thật trong master — để biết picker phải liệt kê gì.</summary>
    public IReadOnlyList<int> SubCodes(string masterTable, int trtCd)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT trt_sb FROM {masterTable} WHERE trt_cd = @cd ORDER BY trt_sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;

        var rows = new List<int>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read()) rows.Add(Convert.ToInt32(reader["trt_sb"]));
        return rows;
    }
}
