using System.Data;
using System.Text;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackExitFlg;

/// <summary>
/// Seed <b>lịch sử 算定</b> vào <c>TRNTRN</c> để dựng tiền đề cho các pack chỉ chạy khi
/// bệnh nhân đã có một 処置 nào đó — rồi dọn sạch ở <c>OneTimeTearDown</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI SEED (và vì sao ở đây seed là ĐÚNG, không phạm F21)
/// ═══════════════════════════════════════════════════════════════════════════════
/// Bốn handler còn nợ đều hỏi CÙNG một câu — 「bệnh nhân đã算定 mã X trong cửa sổ ngày
/// này chưa?」 — qua <c>CommonChk.getTreatData</c> (CommonChk.cs:601):
/// <code>
///   cmtKouKanKyo_KonC  116/23  [初診日, 算定日]        → I030-2-1 (type 10) + I030-2-2 (type 90)
///   cmtKouKanKyo_Ce    116/20  [初診日, 算定日]        → I030-2-3 (type 10)
///   cmtPrevDate        108/2   [初診日, 算定日-1]      → I030    「歯清前回実施年月」
///   cmtSPT             167/x   [初診日, 算定日-1]      → I011-2-1-1
/// </code>
/// Không có lịch sử thì các nhánh đó <b>im lặng</b>, và 「im lặng vì bị cắt」 không phân
/// biệt được với 「im lặng vì điều kiện không thoả」 — phép đo mất sạch ý nghĩa.
///
/// <para><b>F21 không cấm cái này.</b> F21 nói về đường ghi chạy LÚC NHẬP
/// (<c>SigaChg</c>, <c>IregCodChk</c>) — chúng đọc bộ nhớ phiên chạy nên dòng seed không đi
/// qua. Ở đây dòng seed KHÔNG phải thứ đang đo: nó là <b>trạng thái xuất phát</b>, được
/// <c>ModSave.trtDataList</c> nạp lúc mở 診療入力 và được <c>getTreatData</c> đọc y như mọi
/// dòng thật. Thứ đang đo — <c>Chk_CmtAuto</c> → <c>prgCmtAuto</c> — vẫn chạy trọn đường
/// giao diện: gõ mã → 処置選択 → Enter ô 回.</para>
///
/// <para>⚠️ <b>Vì thế phải seed TRƯỚC KHI APP MỞ</b> (<c>UiTestBase.PrepareDataBeforeApp</c>,
/// F20): <c>trtDataList</c> nạp một lần lúc mở màn, ghi sau đó thì app không bao giờ thấy.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// AN TOÀN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>Cờ riêng</b> <c>cmtPack.allowSeed</c>, mặc định tắt ⇒ fixture tự
///     <c>Ignore</c> trước khi mở app (F20).</item>
///   <item><b>Vùng <c>disp_no</c> riêng 9100..9199.</b> CỐ Ý tách khỏi vùng 9000+ của
///     <c>ChkAutoDb</c>: bệnh nhân test có dòng <b>再初診 seed cố định ở
///     <c>disp_no = 9001</c></b> (100/0 歯科初診料, 2026-07-20) mà không luồng nào được xoá.
///     <c>DELETE</c> ở đây chặn cứng trong dải 9100..9199.</item>
///   <item><b>Chụp — IN RA STDOUT — trả lại.</b> In nguyên trạng trước khi seed, để bị
///     Ctrl+C giữa chừng thì còn dựng lại bằng tay.</item>
///   <item><b>Không bấm F9 登録.</b> Dòng do testcase gõ chỉ nằm trong lưới; chỉ các dòng
///     SEED mới chạm DB, và chúng nằm trọn trong dải 9100+.</item>
/// </list>
/// </summary>
public sealed class CmtPackSeedDb
{
    /// <summary>Đầu dải <c>disp_no</c> của luồng này. Xem mục AN TOÀN điểm 2.</summary>
    public const int SeedDispBase = 9100;

    /// <summary>Cuối dải — <c>DELETE</c> không bao giờ ra ngoài <c>[9100, 9199]</c>.</summary>
    public const int SeedDispMax = 9199;

    /// <summary><c>disp_no</c> của dòng 再初診 seed cố định — <b>KHÔNG ĐƯỢC XOÁ</b>.</summary>
    public const int ProtectedDispNo = 9001;

    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowSeed;
    private int _next = SeedDispBase;

    private CmtPackSeedDb(string connectionString, int commandTimeout, bool allowSeed)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
        _allowSeed = allowSeed;
    }

    public static CmtPackSeedDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new CmtPackSeedDb(db.ConnectionString, db.CommandTimeoutSeconds, settings.CmtPack.AllowSeed);
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

    private void RequireWrite(string what)
    {
        if (!_allowSeed)
            throw new InvalidOperationException(
                $"{what}: cần cmtPack.allowSeed = true trong testsettings(.local).json. " +
                "Fixture đáng lẽ đã tự Ignore TRƯỚC khi mở app — đỏ ở đây là lỗi HARNESS.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Chụp nguyên trạng
    // ═════════════════════════════════════════════════════════════════════════

    public sealed record Row(int Seq, DateTime TrtDt, int DispNo, int TrtCd, int TrtSb, int TrtCnt,
                             int TrtPt, string DspTrt)
    {
        public override string ToString() =>
            $"seq {Seq} · {TrtDt:yyyy-MM-dd} disp {DispNo} · {TrtCd}/{TrtSb} ×{TrtCnt} " +
            $"{TrtPt}点 「{DspTrt}」";
    }

    /// <summary>Mọi dòng của bệnh nhân trong tháng của <paramref name="anyDayOfMonth"/>.</summary>
    public IReadOnlyList<Row> MonthRows(int patNo, DateTime anyDayOfMonth)
    {
        var first = new DateTime(anyDayOfMonth.Year, anyDayOfMonth.Month, 1);
        var last = first.AddMonths(1).AddDays(-1);

        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT SEQ, TRT_DT, DISP_NO, TRT_CD, TRT_SB, TRT_CNT, TRT_PT, ISNULL(DSP_TRT,'') DSP_TRT
              FROM TRNTRN
             WHERE PAT_NO = @p AND TRT_DT BETWEEN @a AND @b AND DEL_FLG = 0
             ORDER BY TRT_DT, DISP_NO
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@a", SqlDbType.DateTime).Value = first;
        cmd.Parameters.Add("@b", SqlDbType.DateTime).Value = last;

        var rows = new List<Row>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new Row(
                Convert.ToInt32(reader["SEQ"]), Convert.ToDateTime(reader["TRT_DT"]),
                Convert.ToInt32(reader["DISP_NO"]), Convert.ToInt32(reader["TRT_CD"]),
                Convert.ToInt32(reader["TRT_SB"]), Convert.ToInt32(reader["TRT_CNT"]),
                Convert.ToInt32(reader["TRT_PT"]), (reader["DSP_TRT"] as string ?? "").Trim()));
        return rows;
    }

    /// <summary>Số dòng còn sót trong dải seed — gọi ở teardown để KHẲNG ĐỊNH đã dọn sạch.</summary>
    public int CountSeeded(int patNo)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO = @p " +
            $"AND DISP_NO BETWEEN {SeedDispBase} AND {SeedDispMax}");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Seed
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Chèn MỘT dòng 処置 đã tính điểm vào <paramref name="trtDt"/>, <c>disp_no</c> lấy tiếp
    /// trong dải seed.
    ///
    /// <para><b>Kế thừa từ một dòng THẬT của chính bệnh nhân, đừng hard-code.</b> Đã trả giá
    /// ở luồng <c>AutoSanteiChkAuto</c> (2026-09-08): bản đầu đặt tay nên <c>MED_ST_DT</c>
    /// rơi vào NULL, app không dựng nổi lưới và cả fixture đỏ ở <c>OneTimeSetUp</c> với
    /// 「không thấy grdRegi」 — nhìn y như app hỏng. Vì thế chỉ ĐÈ những cột testcase thật sự
    /// định nghĩa; mọi cột khác lấy nguyên từ dòng mẫu. <c>SEQ</c> là identity nên KHÔNG
    /// liệt kê.</para>
    ///
    /// <para>Dòng mẫu ưu tiên CÙNG NGÀY seed (bảo hiểm khi đó chắc chắn còn hiệu lực), không
    /// có thì lấy dòng gần nhất — và luôn lấy ngoài dải seed để không tự nhân bản.</para>
    /// </summary>
    /// <returns><c>disp_no</c> đã dùng.</returns>
    public int SeedTreatmentRow(int patNo, DateTime trtDt, int trtCd, int trtSb, int trtPt, string dspTrt)
    {
        RequireWrite($"seed {trtCd}/{trtSb} vào {trtDt:yyyy-MM-dd}");

        var disp = _next++;
        if (disp > SeedDispMax)
            throw new InvalidOperationException(
                $"Hết dải disp_no seed ({SeedDispBase}..{SeedDispMax}) — một fixture không nên " +
                "seed tới 100 dòng; xem lại thiết kế ca đo.");

        var buiCols = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"BUI{i}"));
        var disCdCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_CD{i}"));
        var disSbCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_SB{i}"));
        var zeros32 = string.Join(", ", Enumerable.Repeat("0", 32));
        var zeros10 = string.Join(", ", Enumerable.Repeat("0", 10));

        var sql = new StringBuilder()
            .Append("INSERT INTO TRNTRN (DEL_FLG, PAT_NO, PAT_BR, INSU_CD, TRT_DT, RAIIN_CNT, DISP_NO, ")
            .Append($"{buiCols}, {disCdCols}, {disSbCols}, ")
            .Append("TRT_CD, TRT_SB, TRT_CNT, TRT_PT, ISL, PRICE, JIHI_FLG, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, MED_ST_DT, DSP_BUI, DSP_TRT, DSP_DIS) ")
            .Append("SELECT TOP 1 0, PAT_NO, PAT_BR, INSU_CD, @dt, RAIIN_CNT, @disp, ")
            .Append($"{zeros32}, {zeros10}, {zeros10}, ")
            .Append("@cd, @sb, 1, @pt, 0, 0, 0, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, ISNULL(MED_ST_DT, @dt), '', @dsp, '' ")
            .Append($"FROM TRNTRN WHERE PAT_NO = @p AND DEL_FLG = 0 ")
            .Append($"AND DISP_NO NOT BETWEEN {SeedDispBase} AND {SeedDispMax} ")
            .Append("ORDER BY CASE WHEN TRT_DT = @dt THEN 0 ELSE 1 END, TRT_DT DESC")
            .ToString();

        using var con = Open();
        using var cmd = Command(con, sql);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;
        cmd.Parameters.Add("@disp", SqlDbType.Int).Value = disp;
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;
        cmd.Parameters.Add("@pt", SqlDbType.Int).Value = trtPt;
        cmd.Parameters.Add("@dsp", SqlDbType.VarChar).Value = dspTrt;

        var n = cmd.ExecuteNonQuery();
        if (n != 1)
            throw new InvalidOperationException(
                $"Seed {trtCd}/{trtSb} không chèn được dòng nào — bệnh nhân {patNo} có dòng TRNTRN " +
                "nào ngoài dải seed để làm mẫu không?");
        return disp;
    }

    /// <summary>
    /// Xoá MỌI dòng trong dải seed của bệnh nhân — <b>mọi ngày</b>, vì có ca seed sang ngày khác.
    ///
    /// <para>⛔ Điều kiện <c>DISP_NO BETWEEN 9100 AND 9199</c> là hàng rào <b>duy nhất</b>
    /// đứng giữa lệnh này và dữ liệu thật (kể cả dòng 再初診 ở <c>disp_no = 9001</c>).
    /// Đừng nới nó ra.</para>
    /// </summary>
    public int DeleteSeeded(int patNo)
    {
        RequireWrite("dọn vùng seed");
        using var con = Open();
        using var cmd = Command(con,
            $"DELETE FROM TRNTRN WHERE PAT_NO = @p " +
            $"AND DISP_NO BETWEEN {SeedDispBase} AND {SeedDispMax}");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return cmd.ExecuteNonQuery();
    }
}
