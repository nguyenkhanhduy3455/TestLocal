using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientSelectAssign;

/// <summary>
/// Truy vấn <b>CHỈ ĐỌC</b> cho luồng 患者確定 — dò sẵn bệnh nhân / Ｄｒ．dựng được
/// từng nhánh của <c>frm203001.defData</c> (frm203001.cs:632-749).
///
/// <para>Tách khỏi <c>Data/OchaDb.cs</c> theo đúng lệ của
/// <c>Tests/ParitySaveData/OchaDbParity.cs</c>: bảng mà luồng này đụng tới
/// (<c>person</c>, <c>wait</c>, <c>IINMST2</c>, <c>TRNTRN</c>) không liên quan gì tới
/// phần master 処置 của <c>OchaDb</c>, gộp vào chỉ làm cái chung phình ra.</para>
///
/// <para><b>KHÔNG có một câu INSERT/UPDATE/DELETE nào ở đây.</b> Khác hẳn spec
/// Playwright cùng cặp: bên đó <c>ensureWaitRow</c> tự chèn một dòng 受付 rồi xoá ở
/// <c>afterAll</c>. Bên này không làm vậy — DB của WinForm là DB **thật** của phòng
/// khám (SIM2000), và <c>wait</c> có ràng buộc duy nhất theo <c>pat_no</c> nên chèn
/// nhầm là đụng vào hàng đợi tiếp nhận đang chạy. Nhánh nào cần dòng 受付 mà máy
/// không có sẵn thì testcase <c>IgnoreWithReason</c>, chứ không tự dựng.</para>
/// </summary>
public sealed class PatientSelectAssignDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private PatientSelectAssignDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static PatientSelectAssignDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new PatientSelectAssignDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    // ── 患者マスタ ───────────────────────────────────────────────────────────

    /// <summary>
    /// <c>person.att_dr</c> / <c>person.att_st</c> của một bệnh nhân — chính là
    /// <c>data.person.dr</c> / <c>.staff</c> mà <c>defData</c> lấy làm fallback
    /// (Person.cs:265-266).
    /// </summary>
    public PersonAttending? Attending(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT TOP 1 att_dr, att_st FROM person WHERE pat_no = @p
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;
        return new PersonAttending(ToInt(reader["att_dr"]), ToInt(reader["att_st"]));
    }

    /// <summary>Một bệnh nhân CÓ <c>att_dr &gt; 0</c> — dựng nhánh fallback 患者マスタ.</summary>
    public int? PatientWithAttDr()
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT TOP 1 per.pat_no
              FROM person per
             WHERE per.att_dr > 0
               AND EXISTS (SELECT 1 FROM insurance ins WHERE ins.pat_no = per.pat_no)
             ORDER BY per.pat_no
            """);
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToInt32(v);
    }

    /// <summary>
    /// Một bệnh nhân KHÔNG có 担当医 — dựng nhánh chặn E00027「ドクター」.
    ///
    /// <para><c>att_dr</c> NULL hoặc 0 đều tính là chưa gán: <c>defData</c> chỉ xét
    /// <c>UserNo &gt; 0</c> (frm203001.cs:705), và <c>editStringToInt</c> biến NULL
    /// thành 0.</para>
    /// </summary>
    public int? PatientWithoutAttDr()
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT TOP 1 per.pat_no
              FROM person per
             WHERE (per.att_dr IS NULL OR per.att_dr <= 0)
               AND EXISTS (SELECT 1 FROM insurance ins WHERE ins.pat_no = per.pat_no)
             ORDER BY per.pat_no
            """);
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToInt32(v);
    }

    /// <summary>
    /// Bệnh nhân CÓ 担当医 nhưng THIẾU 衛生士 — nhánh chặn E00027「衛生士」.
    ///
    /// <para>Phải có <c>att_dr &gt; 0</c>, nếu không thì <c>defData</c> chặn ở bước
    /// Ｄｒ．trước và testcase đo nhầm câu.</para>
    /// </summary>
    public int? PatientWithAttDrWithoutAttSt()
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT TOP 1 per.pat_no
              FROM person per
             WHERE per.att_dr > 0
               AND (per.att_st IS NULL OR per.att_st <= 0)
               AND EXISTS (SELECT 1 FROM insurance ins WHERE ins.pat_no = per.pat_no)
             ORDER BY per.pat_no
            """);
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToInt32(v);
    }

    /// <summary>
    /// 患者番号 chắc chắn KHÔNG tồn tại — nhánh E00005.
    ///
    /// <para>Dò từ DB thay vì hằng số 99999999: <c>defData</c> làm
    /// <c>int.Parse</c> nên số phải nằm gọn trong int32, mà máy nào cũng có thể đã
    /// có sẵn đúng con số mình bịa.</para>
    /// </summary>
    public int UnusedPatNo()
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT ISNULL(MAX(pat_no), 0) FROM person");
        var max = ToInt(cmd.ExecuteScalar()!);
        // Chừa một khoảng để không đụng dòng vừa được tạo giữa lúc chạy.
        var candidate = max + 1000;
        return candidate > 0 ? candidate : 99999999;
    }

    // ── IINMST2 ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Danh sách Ｄｒ．(<c>USER_KBN = 0</c>) hoặc 衛生士 (<c>=1</c>).
    ///
    /// <para>Câu này chép ĐÚNG <c>Iinmst2.getComboData(con, kbn)</c> — không thêm bộ lọc
    /// nào — để roster và combo nói về cùng một tập. (Combo còn được chèn thêm một dòng
    /// TRỐNG ở đầu, xem <c>EditControl.makeIinMstCombo</c>:660-676.)</para>
    /// </summary>
    public IReadOnlyList<StaffMember> Staff(int userKbn)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT user_no, LTRIM(RTRIM(user_nm)) AS user_nm
              FROM iinmst2
             WHERE user_kbn = @k
             ORDER BY user_no
            """);
        cmd.Parameters.Add("@k", SqlDbType.Int).Value = userKbn;

        var list = new List<StaffMember>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            list.Add(new StaffMember(ToInt(reader["user_no"]), Txt.N(reader["user_nm"]?.ToString() ?? "")));
        return list;
    }

    public IReadOnlyList<StaffMember> Doctors() => Staff(0);

    public IReadOnlyList<StaffMember> Hygienists() => Staff(1);

    // ── 受付一覧 (bảng wait) ─────────────────────────────────────────────────

    /// <summary>
    /// Các dòng 受付 đang có, kèm <c>user_no</c> — đúng cột mà
    /// <c>PatInfoList.getWaitPatInf</c> đổ vào lưới (PatInfoList.cs:177) và
    /// <c>defData</c> đọc lại ở nhánh <c>selRow</c> (frm203001.cs:698-699).
    /// </summary>
    public IReadOnlyList<WaitRow> WaitRows()
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT w.pat_no, w.user_no, w.rdate
              FROM wait AS w
             INNER JOIN person p ON p.pat_no = w.pat_no
             ORDER BY w.rdate
            """);

        var list = new List<WaitRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var userNoRaw = reader["user_no"];
            list.Add(new WaitRow(
                ToInt(reader["pat_no"]),
                userNoRaw is DBNull or null ? null : Convert.ToInt32(userNoRaw)));
        }
        return list;
    }

    // ── TRNTRN — 処置 đã lưu ─────────────────────────────────────────────────

    /// <summary>
    /// Các <c>dr_no</c> KHÁC NHAU đã lưu trong tháng của một bệnh nhân
    /// (<c>TRNTRN.dr_no</c>, TrnTrn.cs:2343).
    ///
    /// <para>Đây là nguồn mà <c>ModMain.Chg_DrName</c> đọc để ghi đè nhãn
    /// <c>lbDr</c> trên màn 処置入力: có dòng thì lấy cột 69 của chính dòng đó,
    /// không có mới rơi về <c>ModCommon.pintDrNo</c> (modMain.cs:2125-2138).</para>
    /// </summary>
    public IReadOnlyList<int> TrnDoctorsInMonth(int patNo, DateTime month)
    {
        var from = new DateTime(month.Year, month.Month, 1);
        var to = from.AddMonths(1).AddDays(-1);

        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT DISTINCT dr_no
              FROM TRNTRN
             WHERE pat_no = @p AND trt_dt BETWEEN @from AND @to AND dr_no > 0
             ORDER BY dr_no
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;

        var list = new List<int>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read()) list.Add(ToInt(reader["dr_no"]));
        return list;
    }

    /// <summary>Bệnh nhân CÓ 処置 mang <c>dr_no &gt; 0</c> trong tháng — dựng nhánh TC-SEED-1.</summary>
    public int? PatientWithTrnInMonth(DateTime month)
    {
        var from = new DateTime(month.Year, month.Month, 1);
        var to = from.AddMonths(1).AddDays(-1);

        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT TOP 1 pat_no
              FROM TRNTRN
             WHERE trt_dt BETWEEN @from AND @to AND dr_no > 0
             GROUP BY pat_no
             ORDER BY pat_no
            """);
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToInt32(v);
    }
}

/// <summary>担当医 / 衛生士 ghi ở 患者マスタ (<c>person.att_dr</c> / <c>att_st</c>).</summary>
public sealed record PersonAttending(int AttDr, int AttSt);

/// <summary>Một dòng <c>IINMST2</c>.</summary>
public sealed record StaffMember(int UserNo, string UserNm)
{
    public override string ToString() => $"{UserNo}「{UserNm}」";
}

/// <summary>Một dòng 受付. <c>UserNo</c> null = cột để trống trong DB.</summary>
public sealed record WaitRow(int PatNo, int? UserNo);
