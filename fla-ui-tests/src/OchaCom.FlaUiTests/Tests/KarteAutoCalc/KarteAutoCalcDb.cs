using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteAutoCalc;

/// <summary>
/// Truy vấn <b>CHỈ ĐỌC</b> trên <c>cmtauto</c> / <c>mst_cmt2</c> phục vụ luồng
/// カルテ自動算定.
///
/// <para>Không bao giờ ghi. Việc ghi do WinForm làm khi test bấm F9; ở đây chỉ
/// chọn dữ liệu thử và đọc lại để đối chiếu. Cùng lệ với
/// <see cref="InpP1Db"/> và <c>Tests/ParitySaveData/OchaDbParity.cs</c>: truy vấn
/// riêng của một luồng nằm cạnh luồng đó.</para>
///
/// <para>Tự mở kết nối từ <c>db.*</c> của testsettings thay vì mượn
/// <c>InpP1Db</c>: các thành viên mở kết nối của lớp đó là private, và luồng này
/// không được sửa file của luồng khác.</para>
/// </summary>
internal sealed class KarteAutoCalcDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private KarteAutoCalcDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    /// <summary>Null khi <c>db.enabled = false</c> hoặc thiếu chuỗi kết nối.</summary>
    public static KarteAutoCalcDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new KarteAutoCalcDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    // ── 処置マスタ: MỖI PHIÊN BẢN MỘT BẢNG ──────────────────────────────────

    /// <summary>Tên bảng dùng khi <c>TRT_SEL</c> không trả gì — y như legacy (TrtSel.cs:25).</summary>
    private const string DefaultTrtTable = "MST_TRT087";

    /// <summary>
    /// Tên bảng 処置マスタ đang hiệu lực hôm nay.
    ///
    /// <para><b>Không có bảng nào tên <c>mst_trt</c> trên SQL Server.</b> Legacy chứa
    /// MỖI PHIÊN BẢN MỘT BẢNG RIÊNG — <c>MST_TRT087</c>, <c>MST_TRT084</c>… — và
    /// <c>TRT_SEL</c> là bảng tra: cột <c>MTBL_NM</c> cho biết bảng nào hiệu lực
    /// trong khoảng <c>START_DT</c>–<c>END_DT</c> (TrtSel.cs:21-51). Bản web gộp tất
    /// cả vào một bảng <c>mst_trt</c> kèm <c>version_id</c>, nên tên bên đó KHÔNG
    /// dùng được ở đây. Lần chạy 2026-08-11 chết vì đúng chuyện này:
    /// 「Invalid object name 'mst_trt'」.</para>
    ///
    /// <para>Tên trả về bị nối thẳng vào câu SQL nên phải kiểm dạng — chỉ nhận đúng
    /// khuôn <c>MST_TRT</c> + chữ số.</para>
    /// </summary>
    public string ResolveTrtTableName(DateTime? asOf = null)
    {
        using var con = Open();
        using var cmd = Cmd(con, @"
            SELECT TOP 1 MTBL_NM
            FROM   TRT_SEL
            WHERE  START_DT <= @d
              AND  (END_DT >= @d OR END_DT IS NULL)");
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = (asOf ?? DateTime.Today).Date;

        var v = cmd.ExecuteScalar();
        var name = v is null or DBNull ? "" : (Convert.ToString(v) ?? "").Trim();
        return System.Text.RegularExpressions.Regex.IsMatch(name, @"^MST_TRT\d{1,4}$")
            ? name
            : DefaultTrtTable;
    }

    // ── Chọn dữ liệu thử ────────────────────────────────────────────────────

    /// <summary>
    /// Một 処置 (trt_cd &gt;= 100) KHÔNG có dòng <c>cmtauto</c> nào — dùng để hỏi
    /// 一覧 có LEFT JOIN thật không (KQ-1).
    /// </summary>
    public int? FindTrtCdWithoutCmtAuto()
    {
        var trtTable = ResolveTrtTableName();

        using var con = Open();
        using var cmd = Cmd(con, $@"
            SELECT TOP 1 t.trt_cd
            FROM   {trtTable} t
            WHERE  t.trt_cd >= 100
              AND  NOT EXISTS (SELECT 1 FROM cmtauto a WHERE a.trt_cd = t.trt_cd)
            ORDER BY t.trt_cd");
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToInt32(v);
    }

    /// <summary>処置 mà MỌI dòng đều <c>no_chk = 1</c> (KQ-3, ca "tick").</summary>
    public (int TrtCd, int TrtSb)? FindAllNoChk() => FindByNoChkShape(allFlagged: true);

    /// <summary>処置 có LẪN LỘN <c>no_chk</c> 0 và 1 (KQ-3, ca "không tick").</summary>
    public (int TrtCd, int TrtSb)? FindMixedNoChk() => FindByNoChkShape(allFlagged: false);

    private (int TrtCd, int TrtSb)? FindByNoChkShape(bool allFlagged)
    {
        using var con = Open();
        using var cmd = Cmd(con, string.Empty);
        var having = allFlagged
            ? "HAVING SUM(CAST(no_chk AS INT)) = COUNT(*)"
            : "HAVING SUM(CAST(no_chk AS INT)) <> COUNT(*) AND SUM(CAST(no_chk AS INT)) > 0";
        cmd.CommandText = $@"
            SELECT TOP 1 trt_cd, trt_sb
            FROM   cmtauto
            GROUP  BY trt_cd, trt_sb
            {having}
            ORDER  BY COUNT(*) DESC";
        using var r = cmd.ExecuteReader();
        return r.Read() ? (Convert.ToInt32(r[0]), Convert.ToInt32(r[1])) : null;
    }

    /// <summary>処置 có <c>use_cnt</c> lớn nhất — mất nó là mất nhiều nhất (KQ-4).</summary>
    public (int TrtCd, int TrtSb)? FindWithUseCnt()
    {
        using var con = Open();
        using var cmd = Cmd(con, string.Empty);
        cmd.CommandText = @"
            SELECT TOP 1 trt_cd, trt_sb
            FROM   cmtauto
            GROUP  BY trt_cd, trt_sb
            HAVING SUM(CAST(use_cnt AS BIGINT)) > 0
            ORDER  BY SUM(CAST(use_cnt AS BIGINT)) DESC";
        using var r = cmd.ExecuteReader();
        return r.Read() ? (Convert.ToInt32(r[0]), Convert.ToInt32(r[1])) : null;
    }

    /// <summary>
    /// 処置 đã cấu hình có ÍT dòng nhất — dùng cho phép thử phá huỷ (KQ-5, KQ-6)
    /// để nếu khôi phục hỏng thì thiệt hại nhỏ nhất.
    /// </summary>
    public (int TrtCd, int TrtSb)? FindSmallestConfigured()
    {
        using var con = Open();
        using var cmd = Cmd(con, string.Empty);
        cmd.CommandText = @"
            SELECT TOP 1 trt_cd, trt_sb
            FROM   cmtauto
            GROUP  BY trt_cd, trt_sb
            ORDER  BY COUNT(*), SUM(CAST(use_cnt AS BIGINT))";
        using var r = cmd.ExecuteReader();
        return r.Read() ? (Convert.ToInt32(r[0]), Convert.ToInt32(r[1])) : null;
    }

    /// <summary>
    /// Một カルテコメント dài hơn <paramref name="minBytes"/> byte Shift-JIS — để
    /// hỏi WinForm cắt theo byte hay ký tự (KQ-6).
    /// </summary>
    public (int CmtCd, int CmtSb, string CmtNm)? FindLongCommentName(int minBytes)
    {
        using var con = Open();
        using var cmd = Cmd(con, string.Empty);
        // DATALENGTH trên cột varchar của SQL Server = số BYTE ở collation Shift-JIS,
        // đúng đơn vị mà ComLibrary.LeftB đếm.
        cmd.CommandText = @"
            SELECT TOP 1 cmt_cd, cmt_sb, cmt_nm
            FROM   mst_cmt2
            WHERE  cmt_cd BETWEEN 7000 AND 8999
              AND  DATALENGTH(cmt_nm) > @minBytes
            ORDER  BY DATALENGTH(cmt_nm) DESC";
        cmd.Parameters.Add("@minBytes", SqlDbType.Int).Value = minBytes;
        using var r = cmd.ExecuteReader();
        return r.Read()
            ? (Convert.ToInt32(r[0]), Convert.ToInt32(r[1]), Convert.ToString(r[2]) ?? "")
            : null;
    }

    // ── Đọc lại để đối chiếu ────────────────────────────────────────────────

    /// <summary><c>no_chk</c> của từng dòng, theo thứ tự hiển thị của dialog.</summary>
    public IReadOnlyList<int> NoChkOfLines(int trtCd, int trtSb) => ReadInts("no_chk", trtCd, trtSb);

    /// <summary><c>use_cnt</c> của từng dòng, theo thứ tự hiển thị của dialog.</summary>
    public IReadOnlyList<int> UseCntOfLines(int trtCd, int trtSb) => ReadInts("use_cnt", trtCd, trtSb);

    private IReadOnlyList<int> ReadInts(string column, int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Cmd(con, string.Empty);
        // Cùng ORDER BY mà CmtAuto.getCmtAutoList dùng (CmtAuto.cs:151) nên thứ tự
        // khớp với lưới của dialog.
        cmd.CommandText = $@"
            SELECT {column}
            FROM   cmtauto
            WHERE  trt_cd = @cd AND trt_sb = @sb
            ORDER  BY disp_no, cmt_cd, cmt_sb";
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;

        var list = new List<int>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add(r.IsDBNull(0) ? 0 : Convert.ToInt32(r[0]));
        return list;
    }

    /// <summary>
    /// Ảnh chụp đủ để khôi phục bằng tay: mỗi dòng là một chuỗi đọc được, kèm câu
    /// INSERT tương ứng ở cuối log của testcase.
    /// </summary>
    public IReadOnlyList<string> Snapshot(int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Cmd(con, string.Empty);
        cmd.CommandText = @"
            SELECT cmt_cd, cmt_sb, cmt_nm, disp_no, valid, use_cnt, no_chk, trt_nm
            FROM   cmtauto
            WHERE  trt_cd = @cd AND trt_sb = @sb
            ORDER  BY disp_no, cmt_cd, cmt_sb";
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;

        var rows = new List<string>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            rows.Add(
                $"INSERT INTO cmtauto (trt_cd,trt_sb,trt_nm,cmt_cd,cmt_sb,cmt_nm,disp_no,valid,use_cnt,no_chk) " +
                $"VALUES ({trtCd},{trtSb},N'{Esc(r[7])}',{r[0]},{r[1]},N'{Esc(r[2])}',{r[3]},{r[4]},{r[5]},{r[6]});");
        }
        return rows;
    }

    private static string Esc(object v) => (Convert.ToString(v) ?? "").Replace("'", "''");
}
