using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.TreatmentHeaderStaff;

/// <summary>
/// Truy vấn <b>CHỈ ĐỌC</b> cho luồng header 「Ｄｒ」 — nguồn đối chiếu cho nhãn
/// <c>lbDr</c> (担当医 của DÒNG) và combo <c>cboDr</c> (担当医 cho dòng thêm mới).
/// </summary>
public sealed class HeaderStaffDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private HeaderStaffDb(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static HeaderStaffDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new HeaderStaffDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    private SqlConnection Open()
    {
        var con = new SqlConnection(_connectionString);
        con.Open();
        return con;
    }

    private SqlCommand Cmd(SqlConnection con, string sql)
    {
        var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = _commandTimeout;
        return cmd;
    }

    private static int ToInt(object v) => v is DBNull or null ? 0 : Convert.ToInt32(v);

    /// <summary><c>person.att_dr</c> — thứ mà combo <c>cboDr</c> nhận khi mở màn.</summary>
    public int AttDr(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT TOP 1 att_dr FROM person WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return ToInt(cmd.ExecuteScalar()!);
    }

    /// <summary>
    /// Các dòng 処置 của tháng: NGÀY (số ngày) + <c>dr_no</c> đã lưu.
    ///
    /// <para>Đây là thứ <c>ModMain.Chg_DrName</c> đọc ra để ghi vào nhãn <c>lbDr</c>:
    /// nó lấy cột 69 (<c>dr_no</c>) CỦA DÒNG con trỏ đang đứng (modMain.cs:2125-2138).
    /// Cột 69 là cột ẨN nên UI không đọc được — phải hỏi DB.</para>
    /// </summary>
    public IReadOnlyList<TrnRow> RowsInMonth(int patNo, DateTime month)
    {
        var from = new DateTime(month.Year, month.Month, 1);
        var to = from.AddMonths(1).AddDays(-1);

        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT trt_dt, dr_no, COUNT(*) AS cnt
              FROM TRNTRN
             WHERE pat_no = @p AND trt_dt BETWEEN @from AND @to
             GROUP BY trt_dt, dr_no
             ORDER BY trt_dt
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;

        var list = new List<TrnRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var dt = Convert.ToDateTime(reader["trt_dt"]);
            list.Add(new TrnRow(dt.Day, ToInt(reader["dr_no"]), ToInt(reader["cnt"])));
        }
        return list;
    }

    /// <summary>
    /// TOÀN BỘ <c>IINMST2</c> — không lọc gì, để thấy đúng thứ mà combo có thể chứa.
    ///
    /// <para>Đây là mốc cho TC-MST-1. Bản web hỏi 「dropdown có lọt user_no = 0 không」;
    /// bên WinForm câu trả lời có hai phần: master có dòng <c>USER_NO = 0</c> nào không,
    /// và <c>makeIinMstCombo</c> có TỰ CHÈN một dòng trống <c>USER_NO = 0</c> không
    /// (frm203002.cs:597 truyền <c>spcFlg = true</c> ⇒ CÓ).</para>
    /// </summary>
    public IReadOnlyList<IinRow> AllStaff()
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT user_no, user_kbn, LTRIM(RTRIM(user_nm)) AS user_nm
              FROM iinmst2
             ORDER BY user_kbn, user_no
            """);

        var list = new List<IinRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            list.Add(new IinRow(
                ToInt(reader["user_no"]),
                ToInt(reader["user_kbn"]),
                Txt.N(reader["user_nm"]?.ToString() ?? "")));
        return list;
    }

    /// <summary>Tên hiển thị của một <c>user_no</c> trong nhóm Ｄｒ．(<c>user_kbn = 0</c>).</summary>
    public string? DoctorName(int userNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT TOP 1 LTRIM(RTRIM(user_nm)) FROM iinmst2 WHERE user_kbn = 0 AND user_no = @u");
        cmd.Parameters.Add("@u", SqlDbType.Int).Value = userNo;
        return cmd.ExecuteScalar() as string;
    }
}

/// <summary>Một nhóm dòng 処置 cùng ngày + cùng <c>dr_no</c>.</summary>
public sealed record TrnRow(int Day, int DrNo, int Count);

/// <summary>Một dòng <c>IINMST2</c>, kèm <c>user_kbn</c> để thấy nhóm 区分 lạ.</summary>
public sealed record IinRow(int UserNo, int UserKbn, string UserNm)
{
    public override string ToString() => $"{UserNo}/kbn{UserKbn}「{UserNm}」";
}
