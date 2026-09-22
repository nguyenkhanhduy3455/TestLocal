using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CodeEntryFailPaths;

/// <summary>
/// Đọc / đổi <c>INPCONFIG.IS_AUTO_FLG</c> — cờ 「IS 自動算定」 quyết định <c>frm203016</c> có
/// hiện ô nhập lít hay <c>return</c> sớm (<c>frm203016.cs:404-408</c>).
///
/// <para>⚠️ <b>Đây là CẤU HÌNH PHÒNG KHÁM, không phải dữ liệu test.</b> <c>INPCONFIG</c> chỉ
/// có <b>MỘT</b> dòng và áp cho toàn bộ app. Quên trả lại là mọi luồng khác — và người dùng
/// thật — chạy với cấu hình sai mà không ai biết. Vì thế:</para>
/// <list type="number">
///   <item>cờ riêng <c>codeEntryFail.allowConfigChange</c>, mặc định tắt;</item>
///   <item><b>chụp giá trị cũ và IN RA STDOUT</b> trước khi đổi — bị Ctrl+C giữa chừng thì
///     còn dựng lại bằng tay;</item>
///   <item>trả lại ở <c>OneTimeTearDown</c> rồi <b>ĐỌC LẠI</b> để khẳng định.</item>
/// </list>
/// </summary>
public sealed class InpConfigDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowChange;

    private InpConfigDb(string cs, int timeout, bool allow)
    {
        _connectionString = cs; _commandTimeout = timeout; _allowChange = allow;
    }

    public static InpConfigDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new InpConfigDb(db.ConnectionString, db.CommandTimeoutSeconds,
                               settings.CodeEntryFail.AllowConfigChange);
    }

    public string? ProbeError()
    {
        try { using var c = Open(); using var m = Cmd(c, "SELECT 1"); m.ExecuteScalar(); return null; }
        catch (Exception e) { return e.Message; }
    }

    private SqlConnection Open() { var c = new SqlConnection(_connectionString); c.Open(); return c; }

    private SqlCommand Cmd(SqlConnection con, string sql)
    {
        var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = _commandTimeout;
        return cmd;
    }

    /// <summary>Giá trị hiện tại của <c>IS_AUTO_FLG</c>; null nếu bảng rỗng.</summary>
    public int? IsAutoFlg()
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT TOP 1 IS_AUTO_FLG FROM INPCONFIG");
        var v = cmd.ExecuteScalar();
        return v is null || v == DBNull.Value ? null : Convert.ToInt32(v);
    }

    /// <summary>Đặt <c>IS_AUTO_FLG</c>; trả về số dòng đã đổi (phải là 1).</summary>
    public int SetIsAutoFlg(int value)
    {
        if (!_allowChange)
            throw new InvalidOperationException(
                "Đổi INPCONFIG.IS_AUTO_FLG cần codeEntryFail.allowConfigChange = true. " +
                "Fixture đáng lẽ đã tự Ignore TRƯỚC khi mở app — đỏ ở đây là lỗi HARNESS.");

        using var con = Open();
        using var cmd = Cmd(con, "UPDATE INPCONFIG SET IS_AUTO_FLG = @v");
        cmd.Parameters.Add("@v", SqlDbType.Int).Value = value;
        return cmd.ExecuteNonQuery();
    }
}
