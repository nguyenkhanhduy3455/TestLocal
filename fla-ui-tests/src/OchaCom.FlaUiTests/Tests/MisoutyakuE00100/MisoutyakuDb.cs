using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MisoutyakuE00100;

/// <summary>
/// Đọc (CHỈ ĐỌC) những gì quyết định hộp thoại <c>E00100</c> của mã <b>999 (未装着)</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// E00100 CẦN <b>HAI</b> ĐIỀU KIỆN, KHÔNG PHẢI MỘT
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>ModMain.Misoutyaku</c> (modMain.cs:1800-1830) đi hai bước, và <b>chỉ bung E00100 khi
/// CẢ HAI đều trượt</b>:
/// <list type="number">
///   <item><b>Quét lưới</b> <c>hFG1</c> từ dưới lên tìm dòng 印象
///     (<c>240</c> / <c>247</c> / <c>325-5</c> / <c>325-8</c> / <c>530-2</c>) —
///     modMain.cs:1805-1817;</item>
///   <item>không thấy thì <b>hỏi DB</b> qua <c>Trntrn.getInpTrnImpDt</c> — tìm
///     <c>max(trt_dt)</c> của cùng bộ mã ấy với <c>trt_dt &lt;= cuối tháng</c>,
///     <b>TOÀN BỘ lịch sử</b> (Trntrn.cs).</item>
/// </list>
///
/// <para>⚠️ Ghi chú gốc (<c>fla-ui-todo-inp-legacy-sync-20260921.md</c> §B1) chỉ nói tới
/// bước 1. Bước 2 làm đổi hẳn tiền đề của ca đo: một bệnh nhân <b>không có 印象 nào trên
/// lưới</b> vẫn có thể <b>KHÔNG</b> ra E00100, nếu lịch sử DB còn một dòng 印象 cũ. Muốn
/// E00100 bung thì phải chọn bệnh nhân <b>chưa từng</b> có 印象 tính tới cuối tháng đó.</para>
///
/// <para>⚠️ Câu SQL của <c>getInpTrnImpDt</c> <b>KHÔNG lọc <c>DEL_FLG</c></b> — dòng đã xoá
/// mềm vẫn tính. Nên hàm <see cref="ImpressionRows"/> ở đây cũng cố ý không lọc, để tiền đề
/// khớp đúng cái app nhìn thấy.</para>
/// </summary>
public sealed class MisoutyakuDb
{
    /// <summary>Bộ mã 印象 mà <c>Misoutyaku</c> tìm — modMain.cs:1807-1810.</summary>
    public const string ImpressionWhere =
        "(TRT_CD = 240 OR TRT_CD = 247 OR (TRT_CD = 325 AND TRT_SB IN (5, 8)) " +
        "OR (TRT_CD = 530 AND TRT_SB = 2))";

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private MisoutyakuDb(string cs, int timeout) { _connectionString = cs; _commandTimeout = timeout; }

    public static MisoutyakuDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new MisoutyakuDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    public string? ProbeError()
    {
        try { using var c = Open(); using var cmd = Cmd(c, "SELECT 1"); cmd.ExecuteScalar(); return null; }
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

    /// <summary>Một dòng 印象 của bệnh nhân.</summary>
    public sealed record ImpressionRow(DateTime TrtDt, int TrtCd, int TrtSb, int DelFlg, string DspTrt)
    {
        public override string ToString() =>
            $"{TrtDt:yyyy-MM-dd} · {TrtCd}/{TrtSb} 「{DspTrt}」" + (DelFlg != 0 ? $" (del_flg {DelFlg})" : "");
    }

    /// <summary>
    /// Mọi dòng 印象 của bệnh nhân <b>tính tới cuối tháng</b> của <paramref name="anyDayOfMonth"/>
    /// — đúng phạm vi mà <c>getInpTrnImpDt</c> hỏi, kể cả dòng đã xoá mềm.
    /// </summary>
    public IReadOnlyList<ImpressionRow> ImpressionRows(int patNo, DateTime anyDayOfMonth)
    {
        var monthEnd = new DateTime(anyDayOfMonth.Year, anyDayOfMonth.Month,
                                    DateTime.DaysInMonth(anyDayOfMonth.Year, anyDayOfMonth.Month));
        using var con = Open();
        using var cmd = Cmd(con,
            $"SELECT TRT_DT, TRT_CD, TRT_SB, DEL_FLG, ISNULL(DSP_TRT,'') DSP_TRT " +
            $"FROM TRNTRN WHERE PAT_NO = @p AND TRT_DT <= @e AND {ImpressionWhere} " +
            "ORDER BY TRT_DT");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@e", SqlDbType.DateTime).Value = monthEnd;

        var rows = new List<ImpressionRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            rows.Add(new ImpressionRow(
                Convert.ToDateTime(r["TRT_DT"]), Convert.ToInt32(r["TRT_CD"]),
                Convert.ToInt32(r["TRT_SB"]), Convert.ToInt32(r["DEL_FLG"]),
                (r["DSP_TRT"] as string ?? "").Trim()));
        return rows;
    }

    /// <summary>
    /// Kết quả <c>getInpTrnImpDt</c> sẽ trả về: <c>max(trt_dt)</c> của các dòng 印象 tới cuối
    /// tháng; <c>null</c> ⇒ app sẽ bung <b>E00100</b> (khi lưới cũng không có 印象 nào).
    /// </summary>
    public DateTime? InpTrnImpDt(int patNo, DateTime anyDayOfMonth)
    {
        var rows = ImpressionRows(patNo, anyDayOfMonth);
        return rows.Count == 0 ? null : rows.Max(x => x.TrtDt);
    }

    /// <summary>Số 処置 của bệnh nhân trong ngày, có <c>点数 &gt; 0</c> — chỗ để gõ đè 999.</summary>
    public int ScoredRowsOnDay(int patNo, DateTime day)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO = @p AND DEL_FLG = 0 " +
            "AND TRT_DT = @d AND TRT_PT > 0");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = day.Date;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }
}
