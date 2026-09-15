using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// Bảng <c>SHOUKAI_TMP</c> — template 紹介状 mà <c>frm203053</c> F2 ghi / F3 xoá.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN VÉT BẰNG SQL CHỨ KHÔNG CHỈ XOÁ BẰNG GIAO DIỆN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>TCR4</c> đo chính cú F3 削除 của app, nên nó KHÔNG được quyền coi F3 là đường dọn:
/// ca đó đỏ đúng vào lúc F3 không xoá được thì dòng rác nằm lại vĩnh viễn. Lớp này là
/// hàng rào thứ hai (F22), chạy ở <c>OneTimeTearDown</c> bất kể ca xanh hay đỏ.
///
/// <para>⚠️ <b>Chỉ đụng đúng một tên</b> <see cref="TestTemplateName"/>. Bảng này có dữ
/// liệu thật của phòng khám và của bộ Playwright (đo 2026-09-15: 3 dòng 「Templane son
/// …」). Một câu <c>DELETE</c> rộng tay ở đây là xoá công việc của người khác.</para>
///
/// <para>Đã trả giá 2026-09-15: probe bấm F2 với 宛名 dài 201 ký tự ASCII, tưởng sẽ bị
/// <c>chkInputData</c> chặn — nhưng <c>textBox3</c> có <c>MaxLength = 200</c> nên chuỗi
/// bị CẮT còn đúng 200 byte, kiểm tra QUA, và app ghi thật một dòng (ID 6) phải xoá tay
/// bằng SQL. Từ đó mọi ca chạm F2 đều đi kèm lớp dọn này.</para>
/// </summary>
public sealed class ReferralTemplateDb
{
    /// <summary>
    /// Tên template dành riêng cho test. Tiền tố <c>ZZ-</c> để nó luôn nằm cuối danh sách
    /// combo, không chen vào giữa template thật của người dùng.
    /// </summary>
    public const string TestTemplateName = "ZZ-PARITY-TEST";

    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowWrite;

    private ReferralTemplateDb(string connectionString, int commandTimeout, bool allowWrite)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
        _allowWrite = allowWrite;
    }

    public static ReferralTemplateDb? CreateOrNull(TestSettings settings, bool allowWrite)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new ReferralTemplateDb(db.ConnectionString, db.CommandTimeoutSeconds, allowWrite);
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

    /// <summary>Số dòng mang tên test — 0 là sạch.</summary>
    public int CountTestRows()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM SHOUKAI_TMP WHERE テンプレート名 = @n");
        cmd.Parameters.Add("@n", SqlDbType.NVarChar, 100).Value = TestTemplateName;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Tổng số dòng — để khẳng định ca test không đụng vào dòng của ai khác.</summary>
    public int CountAllRows()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM SHOUKAI_TMP");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>
    /// Vét mọi dòng mang tên test. Trả về số dòng đã xoá.
    ///
    /// <para>Ném khi chưa bật cờ ghi — để một lượt chạy vô tình không sửa được gì.</para>
    /// </summary>
    public int DropTestRows()
    {
        if (!_allowWrite)
            throw new InvalidOperationException(
                "ReferralTemplateDb.DropTestRows cần referral.allowSave = true " +
                "(hoặc OCHA_REFERRAL_ALLOW_SAVE=1).");

        using var con = Open();
        using var cmd = Command(con, "DELETE FROM SHOUKAI_TMP WHERE テンプレート名 = @n");
        cmd.Parameters.Add("@n", SqlDbType.NVarChar, 100).Value = TestTemplateName;
        return cmd.ExecuteNonQuery();
    }
}
