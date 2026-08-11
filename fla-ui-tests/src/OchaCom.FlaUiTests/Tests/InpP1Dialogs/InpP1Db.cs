using System.Data;
using System.Text;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// Truy vấn <b>CHỈ ĐỌC</b> phục vụ luồng InpP1Dialogs: <c>TRTSTATE</c>, <c>chkprm</c>,
/// <c>CODMST</c>.
///
/// <para>Lớp này KHÔNG BAO GIỜ ghi. Việc ghi do chính WinForm làm khi test bấm F9; ở đây
/// chỉ đọc lại để xác nhận. Nhờ thế nó dùng được cả khi <c>inpP1.allowSave = false</c> —
/// các testcase chỉ-đọc (nạp dữ liệu, mặc định, nhãn combo) vẫn có đáp án để so.</para>
///
/// <para>Tách khỏi <see cref="Data.OchaDb"/> theo đúng lệ của luồng khác
/// (<c>Tests/ParitySaveData/OchaDbParity.cs</c>): truy vấn riêng của một luồng nằm cạnh
/// luồng đó, <c>Data/OchaDb.cs</c> chỉ giữ thứ nhiều luồng cùng dùng.</para>
/// </summary>
public sealed class InpP1Db
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private InpP1Db(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    /// <summary>Null khi <c>db.enabled = false</c> hoặc thiếu chuỗi kết nối.</summary>
    public static InpP1Db? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new InpP1Db(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    private SqlConnection Open()
    {
        var con = new SqlConnection(_connectionString);
        con.Open();
        return con;
    }

    private SqlCommand Cmd(SqlConnection con, string sql)
    {
        var c = con.CreateCommand();
        c.CommandText = sql;
        c.CommandTimeout = _commandTimeout;
        return c;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TRTSTATE — nguồn của Ｓｔｅｐ編集
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Bệnh nhân đã có dòng <c>TRTSTATE</c> chưa (TrtState.cs:1013).</summary>
    public bool HasTrtState(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT COUNT(*) FROM TRTSTATE WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
    }

    /// <summary>
    /// 32 giá trị của một 種別: cột <c>bui{kind}_1</c>..<c>bui{kind}_32</c>
    /// (TrtState.cs:1677-1690). Không có dòng nào → null.
    ///
    /// <para>Tên cột phải nối thẳng vào câu SQL (không tham số hoá được), nên
    /// <paramref name="kind"/> được chặn trong 1..15 trước khi dựng câu.</para>
    /// </summary>
    public int[]? ReadTrtStateRow(int patNo, int kind)
    {
        if (kind is < 1 or > StepEditDialog.KindCount)
            throw new ArgumentOutOfRangeException(nameof(kind), kind, "種別 chi tu 1 toi 15");

        var columns = new StringBuilder();
        for (var j = 1; j <= StepEditDialog.BuiCount; j++)
        {
            if (j > 1) columns.Append(", ");
            columns.Append("bui").Append(kind).Append('_').Append(j);
        }

        using var con = Open();
        using var cmd = Cmd(con, $"SELECT {columns} FROM TRTSTATE WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var row = new int[StepEditDialog.BuiCount];
        for (var j = 0; j < row.Length; j++) row[j] = ToInt(reader.GetValue(j));
        return row;
    }

    /// <summary>Một ô <c>bui{kind}_{bui}</c>. Không có dòng → null.</summary>
    public int? ReadTrtStateCell(int patNo, int kind, int bui)
    {
        var row = ReadTrtStateRow(patNo, kind);
        if (row is null) return null;
        if (bui is < 1 || bui > row.Length)
            throw new ArgumentOutOfRangeException(nameof(bui), bui, "部位 chi tu 1 toi 32");
        return row[bui - 1];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // chkprm — nguồn của チェック項目設定
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 19 giá trị <c>param1</c>..<c>param19</c>. Bảng chỉ được phép có MỘT dòng
    /// (<c>updateProc</c> = delete + insert, frm203044.cs:239-241); chưa lưu bao giờ → null.
    /// </summary>
    public int[]? ReadChkPrm()
    {
        var columns = string.Join(", ",
            Enumerable.Range(1, CheckItemDialog.ItemCount).Select(i => $"param{i}"));

        using var con = Open();
        using var cmd = Cmd(con, $"SELECT TOP 1 {columns} FROM chkprm");

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var values = new int[CheckItemDialog.ItemCount];
        for (var i = 0; i < values.Length; i++) values[i] = ToInt(reader.GetValue(i));
        return values;
    }

    /// <summary>Số dòng <c>chkprm</c> — phải là 0 (chưa từng lưu) hoặc 1.</summary>
    public int CountChkPrmRows()
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT COUNT(*) FROM chkprm");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CODMST — nguồn của mọi combo ở hai màn trên
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Một mục combo: <c>cd_val</c> + nhãn hiển thị (<c>ANY_VAL1</c>).</summary>
    public sealed record CodItem(int CdVal, string Label, int SortOrder);

    /// <summary>
    /// Các mục của một <c>cd_type</c>, theo <b>đúng câu mà app chạy</b>:
    /// <c>SELECT CD_VAL, ANY_VAL1, ANY_VAL2 FROM CODMST WHERE CD_TYPE=@id AND DEL_FLG=0
    /// ORDER BY SORT_ORDER</c> (CodMst.cs:34-51).
    ///
    /// <para>Trả kèm <c>SORT_ORDER</c> vì đây chính là chỗ bản web đã lộ lỗi: cd_type 70
    /// có <c>sort_order = 0</c> trên MỌI dòng, nên "ORDER BY SORT_ORDER" không quyết định
    /// được gì. SQL Server vẫn ra 1..15 nhờ clustered PK (CD_TYPE, CD_VAL) phá hoà, còn
    /// Postgres thì trả thứ tự tuỳ ý. Test đọc cả hai để nói rõ WinForm đang xếp theo cái gì.</para>
    /// </summary>
    public IReadOnlyList<CodItem> ComboItems(int cdType)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT CD_VAL, ANY_VAL1, SORT_ORDER
              FROM CODMST
             WHERE CD_TYPE = @id
               AND DEL_FLG = 0
             ORDER BY SORT_ORDER
            """);
        cmd.Parameters.Add("@id", SqlDbType.Int).Value = cdType;

        var items = new List<CodItem>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            items.Add(new CodItem(
                CdVal: ToInt(reader["CD_VAL"]),
                Label: reader["ANY_VAL1"]?.ToString() ?? "",
                SortOrder: ToInt(reader["SORT_ORDER"])));
        }
        return items;
    }

    /// <summary>Nhãn của một <c>cd_val</c> trong một <c>cd_type</c>; không có → null.</summary>
    public string? ComboLabel(int cdType, int cdVal) =>
        ComboItems(cdType).FirstOrDefault(i => i.CdVal == cdVal)?.Label;

    /// <summary>Thử kết nối; hỏng thì trả câu lỗi để testcase Ignore có lý do rõ ràng.</summary>
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

    /// <summary>
    /// Ô DB → số. Không dùng <c>Convert.ToInt32</c> thẳng vì <c>CODMST.CD_VAL</c> là
    /// CHUỖI (CodMst.cs:22 <c>public string cd_val</c>) và có thể đệm khoảng trắng;
    /// ô rỗng / NULL / không phải số đều quy về 0 đúng như <c>EditControl.editStringToInt</c>.
    /// </summary>
    private static int ToInt(object? value)
    {
        if (value is null or DBNull) return 0;
        var s = value.ToString()?.Trim() ?? "";
        return int.TryParse(s, out var v) ? v : 0;
    }
}
