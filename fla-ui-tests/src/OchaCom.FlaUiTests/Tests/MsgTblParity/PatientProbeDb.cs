using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// Truy vấn CHỈ ĐỌC để dựng tiền đề cho mấy ca ở màn 患者選択.
///
/// <para>Không hard-code số bệnh nhân: 「bệnh nhân nào không có 担当医」 là chuyện của
/// dataset từng máy. Hỏi DB thì ca test chạy được ở mọi máy, và khi dataset đổi thì nó
/// tự Ignore kèm lý do thay vì đỏ mù mờ.</para>
/// </summary>
public sealed class PatientProbeDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private PatientProbeDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static PatientProbeDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new PatientProbeDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    /// <summary>
    /// Một bệnh nhân THẬT có <c>att_dr ≤ 0</c> — nguồn fallback 担当医 rỗng, đúng tiền đề
    /// của nhánh E00027 (frm203001.cs:694 → :705).
    ///
    /// <para>Loại vùng test (<c>pat_no ≥ 900000</c>): bệnh nhân seed có thể bị xoá giữa
    /// chừng bởi luồng khác.</para>
    /// </summary>
    public int? FindPatientWithoutDoctor()
    {
        using var con = new SqlConnection(_connectionString);
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandTimeout = _commandTimeout;
        cmd.CommandText =
            """
            SELECT TOP 1 pat_no
              FROM person
             WHERE (att_dr IS NULL OR att_dr <= 0)
               AND pat_no < 900000
             ORDER BY pat_no
            """;
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToInt32(v);
    }
}
