using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Truy vấn CHỈ ĐỌC vào bảng <c>chkauto</c> (自動算定テーブル) của SQL Server.
///
/// <para>Đây là bảng mà <c>ModMain.Chk_ChkAuto</c> tra ngay khi người dùng Enter ô 回:
/// mỗi dòng ghép một 処置 với TỐI ĐA NĂM mã đi kèm <c>(cd1,sb1) … (cd5,sb5)</c>, và app
/// tự chèn từng mã đó xuống lưới (modMain.cs:812-1050). Tên cột lấy nguyên từ câu SQL
/// của app — <c>COMMON/DBAccess/ChkAuto.cs:26-43</c>; ⚠️ bảng tên <c>chkauto</c> KHÔNG
/// gạch dưới, khác hẳn <c>chk_auto</c> của bản Postgres bên web.</para>
///
/// <para>Lớp này KHÔNG BAO GIỜ ghi. Việc đặt 歯式 về 現存 (tiền đề của 抜歯) mượn
/// <see cref="SigaToothStatus.SigaKonDb"/> và nằm sau <c>autoSantei.allowSave</c>.</para>
/// </summary>
public sealed class ChkAutoDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private ChkAutoDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    /// <summary>Null khi <c>db.enabled = false</c> hoặc thiếu chuỗi kết nối.</summary>
    public static ChkAutoDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new ChkAutoDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    public string? ProbeError()
    {
        try
        {
            using var con = Open();
            using var cmd = Command(con, "SELECT 1");
            cmd.ExecuteScalar();
            return null;
        }
        catch (Exception e) { return e.Message; }
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
    /// Dòng <c>chkauto</c> của một 処置; null khi mã đó KHÔNG có 自動算定 nào —
    /// đúng nhánh <c>if (ChkAutoData == null) return</c> (modMain.cs:843).
    /// </summary>
    public ChkAutoRow? ReadChkAuto(int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT trt_cd, trt_sb, cd1, sb1, cd2, sb2, cd3, sb3, cd4, sb4, cd5, sb5
              FROM chkauto
             WHERE trt_cd = @cd AND trt_sb = @sb
            """);
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var pairs = new List<(int Cd, int Sb)>();
        for (var i = 1; i <= 5; i++)
        {
            // App đọc DBNull thành -1 (ChkAuto.cs:77-90); ô trống thật trong dữ liệu là 0.
            var cd = reader[$"cd{i}"] is DBNull ? -1 : Convert.ToInt32(reader[$"cd{i}"]);
            var sb = reader[$"sb{i}"] is DBNull ? -1 : Convert.ToInt32(reader[$"sb{i}"]);
            pairs.Add((cd, sb));
        }
        return new ChkAutoRow(trtCd, trtSb, pairs);
    }

    /// <summary>Tổng số dòng của bảng — con số này in ra log để biết phạm vi lệch parity.</summary>
    public int CountRows()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM chkauto");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Số dòng có TỪ HAI mã đi kèm trở lên — phần mà vòng lặp 5 lượt mới phủ hết.</summary>
    public int CountRowsWithSecondCode()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM chkauto WHERE cd2 > 100");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Vài dòng đầu của bảng, để log nói được 「lệch này rộng tới đâu」.</summary>
    public IReadOnlyList<string> Describe(int limit = 12)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT TOP {limit} trt_cd, trt_sb, cd1, sb1, cd2, sb2 FROM chkauto ORDER BY trt_cd, trt_sb");
        var lines = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            lines.Add($"{reader["trt_cd"]}/{reader["trt_sb"]} → {reader["cd1"]}/{reader["sb1"]}" +
                      (Convert.ToInt32(reader["cd2"]) > 100 ? $" + {reader["cd2"]}/{reader["sb2"]}" : ""));
        return lines;
    }
}

/// <summary>Một dòng <c>chkauto</c> đã đọc xong.</summary>
/// <param name="Pairs">Năm ô <c>(cd_i, sb_i)</c> theo ĐÚNG thứ tự app duyệt.</param>
public sealed record ChkAutoRow(int TrtCd, int TrtSb, IReadOnlyList<(int Cd, int Sb)> Pairs)
{
    /// <summary>Dải 摘要マスタ — <c>codeRange[receipt]</c> = 700..899 (DbLibrary.cs:29).</summary>
    public const int ReceiptCodeMin = 700;
    public const int ReceiptCodeMax = 899;

    /// <summary>
    /// Ô đi nhánh 摘要 (chèn một dòng コメント 0 点, modMain.cs:864-908). App xét nhánh này
    /// TRƯỚC, nên nó phải bị loại khỏi <see cref="TreatmentPairs"/>.
    /// </summary>
    public IReadOnlyList<(int Cd, int Sb)> CommentPairs =>
        Pairs.Where(p => p.Cd is >= ReceiptCodeMin and <= ReceiptCodeMax).ToList();

    /// <summary>
    /// Những ô thật sự dẫn tới một 処置 — nhánh <c>else if (ChkAutoData.cd[i] &gt; 100)</c>
    /// (modMain.cs:914). Ô 0 và ô -1 (NULL) rơi hết ở đây, dải 摘要 700..899 cũng vậy vì
    /// nó đã bị nhánh trên bắt mất.
    /// </summary>
    public IReadOnlyList<(int Cd, int Sb)> TreatmentPairs =>
        Pairs.Where(p => p.Cd > 100 && p.Cd is < ReceiptCodeMin or > ReceiptCodeMax).ToList();

    public override string ToString() =>
        $"chkauto({TrtCd},{TrtSb}) → [" +
        string.Join(", ", Pairs.Where(p => p.Cd > 0).Select(p => $"{p.Cd}/{p.Sb}")) + "]";
}
