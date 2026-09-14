using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Phần DB RIÊNG của luồng <see cref="ChkAutoCascadeTests"/> — những câu hỏi mà
/// <see cref="ChkAutoDb"/> chưa hỏi, vì luồng cũ chỉ đo MỘT tầng (chốt 処置 → mã đi kèm),
/// còn luồng này đo <b>cái đuôi của cái đuôi</b> và đo cả những nhánh mà bản đánh giá
/// parity nói là 「web thiếu」.
///
/// <para>Ba nhóm câu hỏi:</para>
/// <list type="number">
///   <item><b>装着料</b> — bảng <c>MST_SET*</c> mà <c>ModMain.Chk_ChkAuto_soutyaku</c>
///     (modMain.cs:1056) tra, chọn theo <c>SET_SEL</c> đúng như
///     <c>ModCommon.Get_strSet</c> (modCommon.cs:714). Cột <c>MFLG</c> quyết định hàm đó
///     chèn dòng hay thoát ngay (<c>if (mflg == 1) return</c>, modMain.cs:1121).</item>
///   <item><b>Quét TOÀN BỘ ô đi kèm</b> của bảng <c>chkauto</c> — để trả lời câu
///     「nhánh <c>case 202</c> / <c>case 549</c> / <c>case 179</c> / 面入力 của
///     <c>Chk_ChkAuto</c> có BAO GIỜ chạy trên master này không」. Không có dữ liệu rơi vào
///     nhánh nào thì nhánh ấy là <b>code chết</b>, và 「web thiếu port」 không quan sát
///     được ở runtime.</item>
///   <item><b>Độ dài カルテコメント</b> — <c>frm203012.fixProc</c> cắt theo
///     <c>CommonInp.COLUMN_LENGTH_DSP_TRT = 300</c> byte (frm203012.cs:1360). Master không
///     có chuỗi nào dài tới đó thì nhánh cắt cũng là code chết trên đường 自動適用.</item>
/// </list>
/// </summary>
public sealed class ChkAutoCascadeDb
{
    /// <summary>
    /// Trần <c>TRNTRN.DSP_TRT</c> mà <c>fixProc</c> cắt theo — bản sao của
    /// <c>Lib.CommonInp.COLUMN_LENGTH_DSP_TRT</c> (CommonInp.cs:40). Để ở đây để assert
    /// dẫn được ĐÚNG con số mà WinForm dùng, thay vì một 300 viết tay không nguồn.
    /// </summary>
    public const int ColumnLengthDspTrt = 300;

    /// <summary>
    /// Các mã mà <c>Chk_ChkAuto</c> xử lý bằng nhánh RIÊNG chứ không phải
    /// <c>default:</c> (modMain.cs:995-1026). Bản đánh giá parity nói web thiếu ba nhánh
    /// đầu; luồng này hỏi thẳng DB xem chúng có bao giờ được chạm tới không.
    /// </summary>
    public static readonly int[] SpecialCaseCodes = [202, 549, 179, 333];

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private ChkAutoCascadeDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static ChkAutoCascadeDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new ChkAutoCascadeDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    // ─────────────────────────────────────────────────────────────────────────
    // 装着料 — MST_SET* qua SET_SEL (↔ ModCommon.Get_strSet)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Tên bảng 装着料マスタ hiệu lực tại <paramref name="date"/>.
    ///
    /// <para>Chép đúng vòng lặp của <c>Get_strSet</c> (modCommon.cs:719-724): duyệt
    /// <c>SET_SEL</c> theo <c>ST_DT</c> tăng dần, dòng nào có <c>ST_DT &lt;= date</c> thì
    /// GHI ĐÈ kết quả — tức lấy dòng CUỐI CÙNG còn thoả, và <b>KHÔNG xét <c>ED_DT</c></b>.
    /// Viết lại bằng SQL cho rẻ, nhưng giữ nguyên phép chọn đó.</para>
    /// </summary>
    public string? ActiveSetTable(DateTime date)
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT TOP 1 TBL_NM FROM SET_SEL WHERE ST_DT <= @dt ORDER BY ST_DT DESC");
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = date.Date;
        return (cmd.ExecuteScalar() as string)?.Trim();
    }

    /// <summary>
    /// Dòng 装着料 của một 処置; null khi bảng không có ⇒ <c>Chk_ChkAuto_soutyaku</c>
    /// thoát ngay ở <c>tblChkAuto.Rows.Count == 0</c> (modMain.cs:1091).
    /// </summary>
    public SoutyakuRow? ReadSoutyaku(DateTime date, int trtCd, int trtSb)
    {
        var table = ActiveSetTable(date);
        if (table is null) return null;

        using var con = Open();
        using var cmd = Command(con,
            $"SELECT score1, score2, score3, mflg FROM {table} WHERE trt_cd = @cd AND trt_sb = @sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;
        return new SoutyakuRow(
            trtCd, trtSb, table,
            Convert.ToInt32(reader["score1"]),
            Convert.ToInt32(reader["score2"]),
            Convert.ToInt32(reader["score3"]),
            reader["mflg"] is DBNull ? 0 : Convert.ToInt32(reader["mflg"]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Quét toàn bộ ô đi kèm của chkauto
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Mọi ô <c>(cd_i, sb_i)</c> khác 0 của bảng <c>chkauto</c>, kèm 処置 nào kéo ra nó.
    ///
    /// <para>Đây là TẬP HỢP ĐẦY ĐỦ những mã mà <c>Chk_ChkAuto</c> có thể chèn trên master
    /// hiện tại. Mọi câu 「nhánh X của Chk_ChkAuto có chạy không」 đều quy về 「tập này có
    /// phần tử nào rơi vào X không」.</para>
    /// </summary>
    public IReadOnlyList<CompanionSlot> ScanCompanions()
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT trt_cd t, trt_sb s, cd1 cd, sb1 sb, 1 i FROM chkauto WHERE cd1 <> 0
            UNION ALL SELECT trt_cd, trt_sb, cd2, sb2, 2 FROM chkauto WHERE cd2 <> 0
            UNION ALL SELECT trt_cd, trt_sb, cd3, sb3, 3 FROM chkauto WHERE cd3 <> 0
            UNION ALL SELECT trt_cd, trt_sb, cd4, sb4, 4 FROM chkauto WHERE cd4 <> 0
            UNION ALL SELECT trt_cd, trt_sb, cd5, sb5, 5 FROM chkauto WHERE cd5 <> 0
            """);

        var rows = new List<CompanionSlot>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new CompanionSlot(
                Convert.ToInt32(reader["t"]), Convert.ToInt32(reader["s"]),
                Convert.ToInt32(reader["i"]),
                Convert.ToInt32(reader["cd"]), Convert.ToInt32(reader["sb"])));
        return rows;
    }

    /// <summary>
    /// Các ô đi kèm mà master của tháng đặt <c>men &lt;&gt; 0</c> ⇒ nếu có, đường
    /// <c>frm203016_Hide_Let_Trt_Data</c> sẽ mở tiếp 面入力 (<c>frm203035</c> khi
    /// <c>men = 1</c>) hoặc 部位入力 (<c>frm902003</c> khi <c>men = 2</c>) —
    /// frm203016.cs:1563 và :1588.
    /// </summary>
    public IReadOnlyList<(CompanionSlot Slot, int Men)> CompanionsNeedingMen(DateTime date, string trtTable)
    {
        var all = ScanCompanions();
        if (all.Count == 0) return [];

        var men = new Dictionary<string, int>();
        using (var con = Open())
        using (var cmd = Command(con, $"SELECT trt_cd, trt_sb, men FROM {trtTable} WHERE men <> 0"))
        using (var reader = cmd.ExecuteReader())
            while (reader.Read())
                men[$"{reader["trt_cd"]}/{reader["trt_sb"]}"] =
                    reader["men"] is DBNull ? 0 : Convert.ToInt32(reader["men"]);

        return all.Where(s => men.ContainsKey(s.Key))
                  .Select(s => (s, men[s.Key]))
                  .ToList();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // カルテコメント — độ dài + dấu *
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Chuỗi カルテコメント DÀI NHẤT của <c>MST_CMT2</c>, tính bằng BYTE — cùng đơn vị mà
    /// <c>ComLibrary.LeftB</c> dùng để cắt trong <c>fixProc</c> (frm203012.cs:1360).
    /// </summary>
    public int MaxCmt2ByteLength()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT ISNULL(MAX(DATALENGTH(cmt_nm)), 0) FROM MST_CMT2");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>
    /// Sức chứa khai báo của cột <c>MST_CMT2.cmt_nm</c>.
    ///
    /// <para>Đây là mốc MẠNH HƠN <see cref="MaxCmt2ByteLength"/>: dữ liệu hôm nay ngắn thì
    /// mai có thể dài, nhưng cột <c>varchar(n)</c> với <c>n &lt;
    /// <see cref="ColumnLengthDspTrt"/></c> thì <b>không bao giờ</b> chứa nổi chuỗi chạm
    /// ngưỡng cắt. Mà đường 自動適用 lấy chữ CHÍNH TỪ CỘT NÀY: <c>CmtAuto.getCmtAuto</c>
    /// trả <c>b.cmt_nm</c> của <c>MST_CMT2</c> qua <c>INNER JOIN</c>
    /// (COMMON/DBAccess/CmtAuto.cs:79-84), rồi <c>frm203012</c> nối các dòng lại và đưa
    /// thẳng vào <c>fixProc</c> (frm203012.cs:535-546).</para>
    /// </summary>
    public int Cmt2ColumnSize()
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS " +
            "WHERE TABLE_NAME = 'MST_CMT2' AND COLUMN_NAME = 'CMT_NM'");
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? 0 : Convert.ToInt32(v);
    }

    /// <summary>
    /// Các dòng <c>CMTAUTO</c> mà chuỗi trong <c>MST_CMT2</c> còn dấu <c>*</c> ⇒ đường
    /// 自動適用 sẽ mở パラメータダイアログ <c>frm203048</c> (frm203002.cs:10056).
    ///
    /// <para>Trả về danh sách 「処置 nào → comment nào」 để testcase nói được 「nhánh này
    /// CÓ dữ liệu chạm tới」 kèm ví dụ cụ thể, thay vì một con số trần trụi.</para>
    /// </summary>
    public IReadOnlyList<string> CmtAutoRowsWithAsterisk(int limit = 10)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"""
             SELECT TOP {limit} a.trt_cd, a.trt_sb, a.cmt_cd, a.cmt_sb, a.disp_no, a.no_chk, m.cmt_nm
               FROM CMTAUTO a
               JOIN MST_CMT2 m ON m.cmt_cd = a.cmt_cd AND m.cmt_sb = a.cmt_sb
              WHERE m.cmt_nm LIKE '%[*]%'
              ORDER BY a.trt_cd, a.trt_sb
             """);

        var lines = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            lines.Add($"{reader["trt_cd"]}/{reader["trt_sb"]} → {reader["cmt_cd"]}/{reader["cmt_sb"]} " +
                      $"disp_no={reader["disp_no"]} no_chk={reader["no_chk"]} 「{reader["cmt_nm"]}」");
        return lines;
    }

    /// <summary>Số dòng <c>CMTAUTO</c> mà chuỗi hiển thị còn dấu <c>*</c>.</summary>
    public int CountCmtAutoWithAsterisk()
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT COUNT(*) FROM CMTAUTO a
              JOIN MST_CMT2 m ON m.cmt_cd = a.cmt_cd AND m.cmt_sb = a.cmt_sb
             WHERE m.cmt_nm LIKE '%[*]%'
            """);
        return Convert.ToInt32(cmd.ExecuteScalar());
    }
}

/// <summary>Một ô đi kèm của <c>chkauto</c>: 処置 <c>Trigger*</c> kéo theo mã <c>Cd/Sb</c>.</summary>
/// <param name="SlotIndex">Ô thứ mấy (1..5) — đúng thứ tự vòng <c>for</c> ở modMain.cs:861.</param>
public sealed record CompanionSlot(int TriggerCd, int TriggerSb, int SlotIndex, int Cd, int Sb)
{
    public string Key => $"{Cd}/{Sb}";

    public override string ToString() =>
        $"chkauto({TriggerCd},{TriggerSb}).cd{SlotIndex} = {Cd}/{Sb}";
}

/// <summary>
/// Một dòng 装着料マスタ. <paramref name="Mflg"/> = 1 ⇒ <c>Chk_ChkAuto_soutyaku</c> thoát
/// ngay (modMain.cs:1121) và KHÔNG có dòng 装着料 nào được chèn; = 0 ⇒ chèn 270/0 khi
/// <paramref name="Score1"/> = 45, ngược lại 267/0 (modMain.cs:1147-1156).
/// </summary>
public sealed record SoutyakuRow(int TrtCd, int TrtSb, string Table, int Score1, int Score2, int Score3, int Mflg)
{
    /// <summary>Hàm có chèn dòng 装着料 không.</summary>
    public bool InsertsRow => Mflg != 1;

    /// <summary>Mã 処置 của dòng 装着料 sẽ được chèn (chỉ có nghĩa khi <see cref="InsertsRow"/>).</summary>
    public int InsertedTrtCd => Score1 == 45 ? 270 : 267;

    public override string ToString() =>
        $"{Table}({TrtCd},{TrtSb}) score1={Score1} mflg={Mflg} ⇒ " +
        (InsertsRow ? $"chèn 装着料 {InsertedTrtCd}/0" : "KHÔNG chèn (thoát ở mflg == 1)");
}
