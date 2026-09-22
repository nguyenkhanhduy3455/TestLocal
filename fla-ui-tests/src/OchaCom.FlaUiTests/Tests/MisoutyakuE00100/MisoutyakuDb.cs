using System.Data;
using System.Text;
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

    // ═════════════════════════════════════════════════════════════════════════
    // Seed cho §B4 — CÓ cờ riêng, dải disp_no riêng, dọn ở teardown (F20/F22)
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Đầu dải <c>disp_no</c> của luồng này — tách khỏi 9100/9200 của luồng khác.</summary>
    public const int SeedDispBase = 9300;

    /// <summary>Cuối dải — <c>DELETE</c> không bao giờ ra ngoài <c>[9300, 9399]</c>.</summary>
    public const int SeedDispMax = 9399;

    private int _next = SeedDispBase;

    /// <summary>
    /// Mã này có được <c>Misoutyaku</c> coi là <b>印象</b> không — đúng phép so ở
    /// <c>modMain.cs:1807-1810</c>.
    ///
    /// <para>Lưu ý: <c>240</c> và <c>247</c> khớp <b>bất kể 枝番</b>; còn <c>325</c> chỉ với
    /// 枝番 5/8 và <c>530</c> chỉ với 枝番 2.</para>
    /// </summary>
    public static bool IsImpressionCode(int trtCd, int trtSb) =>
        trtCd == 240 || trtCd == 247 ||
        (trtCd == 325 && (trtSb == 5 || trtSb == 8)) ||
        (trtCd == 530 && trtSb == 2);

    /// <summary>Số dòng còn trong dải seed — gọi ở teardown để KHẲNG ĐỊNH đã sạch.</summary>
    public int CountSeeded(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            $"SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO = @p " +
            $"AND DISP_NO BETWEEN {SeedDispBase} AND {SeedDispMax}");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>
    /// Chèn MỘT dòng 処置 mang <paramref name="trtCd"/>/<paramref name="trtSb"/> vào ngày
    /// <paramref name="day"/>, để nó hiện trên lưới cho vòng quét của <c>Misoutyaku</c>.
    ///
    /// <para><b>Kế thừa từ một dòng THẬT của chính bệnh nhân</b> — chỉ đè mã, 点数 và
    /// <c>DSP_TRT</c>; mọi cột khác (kể cả <c>MED_ST_DT</c>, <c>DSP_BUI</c>, <c>BUI*</c>)
    /// lấy nguyên. Đặt tay thì <c>MED_ST_DT</c> dễ rơi vào NULL và app không dựng nổi lưới,
    /// nhìn y như app hỏng (đã trả giá ở luồng AutoSanteiChkAuto 2026-09-08).</para>
    /// </summary>
    /// <param name="tag">Ghi vào <c>DSP_TRT</c> để ca đo tìm lại dòng của mình trên lưới.</param>
    /// <returns><c>disp_no</c> đã dùng.</returns>
    public int SeedTreatmentRow(int patNo, DateTime day, int trtCd, int trtSb, string tag)
    {
        var disp = _next++;
        if (disp > SeedDispMax)
            throw new InvalidOperationException(
                $"Hết dải disp_no seed ({SeedDispBase}..{SeedDispMax}).");

        var buiCols = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"BUI{i}"));
        var disCdCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_CD{i}"));
        var disSbCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_SB{i}"));

        var sql = new StringBuilder()
            .Append("INSERT INTO TRNTRN (DEL_FLG, PAT_NO, PAT_BR, INSU_CD, TRT_DT, RAIIN_CNT, DISP_NO, ")
            .Append($"{buiCols}, {disCdCols}, {disSbCols}, ")
            .Append("TRT_CD, TRT_SB, TRT_CNT, TRT_PT, ISL, PRICE, JIHI_FLG, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, MED_ST_DT, DSP_BUI, DSP_TRT, DSP_DIS) ")
            .Append("SELECT TOP 1 0, PAT_NO, PAT_BR, INSU_CD, @dt, RAIIN_CNT, @disp, ")
            .Append($"{buiCols}, {disCdCols}, {disSbCols}, ")
            .Append("@cd, @sb, 1, @pt, 0, 0, 0, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, ISNULL(MED_ST_DT, @dt), DSP_BUI, @dsp, DSP_DIS ")
            .Append("FROM TRNTRN WHERE PAT_NO = @p AND DEL_FLG = 0 AND TRT_DT = @dt ")
            .Append($"AND DISP_NO NOT BETWEEN {SeedDispBase} AND {SeedDispMax} ")
            .Append("ORDER BY DISP_NO DESC")
            .ToString();

        using var con = Open();
        using var cmd = Cmd(con, sql);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = day.Date;
        cmd.Parameters.Add("@disp", SqlDbType.Int).Value = disp;
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;
        cmd.Parameters.Add("@pt", SqlDbType.Int).Value = 0;
        cmd.Parameters.Add("@dsp", SqlDbType.VarChar).Value = tag;

        if (cmd.ExecuteNonQuery() != 1)
            throw new InvalidOperationException(
                $"Seed {trtCd}/{trtSb} không chèn được — ngày {day:yyyy-MM-dd} của bệnh nhân " +
                $"{patNo} có dòng THẬT nào để làm mẫu không?");
        return disp;
    }

    /// <summary>
    /// Xoá MỌI dòng trong dải seed của bệnh nhân.
    ///
    /// <para>⛔ <c>DISP_NO BETWEEN 9300 AND 9399</c> là hàng rào <b>duy nhất</b> đứng giữa
    /// lệnh này và dữ liệu thật. Đừng nới nó ra.</para>
    /// </summary>
    public int DeleteSeeded(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            $"DELETE FROM TRNTRN WHERE PAT_NO = @p " +
            $"AND DISP_NO BETWEEN {SeedDispBase} AND {SeedDispMax}");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return cmd.ExecuteNonQuery();
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
