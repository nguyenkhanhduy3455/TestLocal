using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// Bảng <c>MSGTBL</c> của SQL Server <c>SIM2000</c> — <b>nguồn chân lý DUY NHẤT</b> cho
/// mọi câu thông báo có mã (<c>E#####</c> / <c>Q#####</c> / <c>I#####</c>) của WinForm.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO LỚP NÀY TỒN TẠI
/// ═══════════════════════════════════════════════════════════════════════════════
/// Một mã chỉ có MỘT câu chữ cho toàn app: <c>MsgDialog.Show*Msg(id, para)</c> luôn đi
/// qua <c>MsgTbl.getMsg</c> → <c>SELECT MSG FROM MSGTBL WHERE ID=@id</c>
/// (COMMON/Lib/MsgDialog.cs:184-211). Câu chữ KHÔNG nằm trong code, nên
/// <b>đọc source legacy không bao giờ đủ</b> — nhiều nhất chỉ tìm được comment mà người
/// viết chép lại, và comment thì đã sai ít nhất một lần (xem <see cref="MsgTblParityTests"/>
/// phần Q00012).
///
/// <para>Bản web dựng lại 40 mã đó thành literal trong
/// <c>apps/web-tenant/src/shared/locales/ja-msgtbl.ts</c> (xem <see cref="WebMsgSnapshot"/>).
/// Lớp này đọc bảng THẬT để đối chiếu — đó là toàn bộ việc mà bộ
/// <c>Tests/MsgTblParity/</c> làm.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BA NHÁNH CỦA getMsg — KHÔNG ĐƯỢC RÚT GỌN CÒN MỘT
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   strMsg = MsgTbl.getMsg(con, id);
///   if (strMsg != "")
///   {
///       if (strMsg.IndexOf("{0}") >= 0) strMsg = strMsg.Replace("{0}", para); // 1. THAY
///       else                            strMsg = strMsg + para;               // 2. NỐI đuôi
///   }
///   else                                strMsg = para;                        // 3. para LÀ câu
/// </code>
///
/// <para>Nhánh 2 là nhánh hay bị bỏ sót: tham số KHÔNG bị vứt đi mà ghép thẳng vào cuối
/// câu. Nhánh 3 là lý do <c>E00101</c> hiện đúng nội dung người gọi truyền vào dù
/// <b>không có row nào</b> trong bảng.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ TUYỆT ĐỐI KHÔNG SO CHUỖI QUA <see cref="Txt.N"/>
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>Txt.N</c> chuẩn hoá NFKC, mà NFKC biến 「１６歳」 (số TOÀN GIÁC, đúng như row DB
/// E00016/E00017 đang lưu) thành 「16歳」 — tức là xoá đúng cái khác biệt đang đo. Mọi so
/// sánh ở bộ này dùng <c>StringComparison.Ordinal</c>, và mọi lần IN RA đều đi qua
/// <see cref="Txt.Vis"/> để 全角/半角 phân biệt được trên log.
/// </summary>
public sealed class MsgTblOracle
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private MsgTblOracle(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    /// <summary>Trả null khi <c>db.enabled=false</c> hoặc thiếu chuỗi kết nối — fixture sẽ Ignore.</summary>
    public static MsgTblOracle? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new MsgTblOracle(db.ConnectionString, db.CommandTimeoutSeconds);
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

    private Dictionary<string, string>? _all;

    /// <summary>
    /// Toàn bộ bảng, đọc MỘT lần cho cả fixture (bảng có ~140 row, vài KB).
    ///
    /// <para><c>MSG</c> là <c>varchar</c> chứ không phải <c>nvarchar</c> ⇒ chữ Nhật nằm ở
    /// code page của collation (CP932). <c>Microsoft.Data.SqlClient</c> giải mã theo đúng
    /// collation của cột, nên chuỗi trả về đã là Unicode — KHÔNG được tự ép
    /// <c>Encoding</c> thêm lần nữa.</para>
    /// </summary>
    public IReadOnlyDictionary<string, string> All()
    {
        if (_all is not null) return _all;

        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        using var con = Open();
        using var cmd = Command(con, "SELECT ID, MSG FROM MSGTBL");
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var id = reader["ID"].ToString() ?? "";
            if (id.Length == 0) continue;
            map[id.Trim()] = reader["MSG"].ToString() ?? "";
        }

        _all = map;
        return _all;
    }

    /// <summary>Khuôn của một mã, <c>{0}</c> CHƯA thay. Không có row → null (nhánh 3 của getMsg).</summary>
    public string? Template(string id) => All().TryGetValue(id, out var m) ? m : null;

    /// <summary>
    /// Câu mà <c>MsgDialog</c> sẽ hiện — dựng theo đúng ba nhánh của
    /// <c>getMsg</c> (MsgDialog.cs:184-211).
    /// </summary>
    public string Render(string id, string para = "")
    {
        var template = Template(id);
        if (string.IsNullOrEmpty(template)) return para;                    // 3. para LÀ câu
        if (template.Contains("{0}", StringComparison.Ordinal))
            return template.Replace("{0}", para, StringComparison.Ordinal); // 1. THAY
        return template + para;                                             // 2. NỐI đuôi
    }

    /// <summary>Số row — dùng để khẳng định đang nói chuyện với đúng bảng, không phải bảng rỗng.</summary>
    public int RowCount() => All().Count;
}
