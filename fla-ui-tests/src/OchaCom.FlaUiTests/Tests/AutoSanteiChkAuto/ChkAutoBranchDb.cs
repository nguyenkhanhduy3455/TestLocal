using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Sửa TẠM master để ép <c>ModMain.Chk_ChkAuto</c> đi vào những nhánh mà dữ liệu thật
/// KHÔNG BAO GIỜ chạm tới — rồi trả lại nguyên trạng.
///
/// <para><b>Vì sao phải sửa master.</b> <see cref="ChkAutoCascadeTests.TCC0_Master_Decides_Which_Branches_Are_Reachable"/>
/// đo được: trên master hiện tại KHÔNG có ô <c>chkauto</c> nào dẫn tới 202 / 549 / 179, và
/// không mã đi kèm nào mang <c>men &lt;&gt; 0</c>. Nghĩa là bốn nhánh riêng của
/// <c>Chk_ChkAuto</c> (modMain.cs:995-1026) cùng nhánh 面入力 (frm203016.cs:1563) là code
/// CHẾT với dữ liệu thật. Muốn biết WinForm thật sự làm gì ở đó thì chỉ còn một đường:
/// tạm trỏ một ô <c>chkauto</c> vào mã cần đo.</para>
///
/// <para><b>Sửa được an toàn vì <c>chkauto</c> KHÔNG được cache.</b>
/// <c>ChkAuto.getChkAutoData</c> chạy một câu <c>select</c> mới mỗi lần Enter ô 回
/// (COMMON/DBAccess/ChkAuto.cs:24-66) — khác hẳn <c>ModCommon._inpConfigData</c> vốn chỉ
/// nạp một lần lúc app khởi động. Nhờ vậy một phiên app chạy được NHIỀU ca, mỗi ca một
/// lần vá, không phải mở lại màn hình.</para>
///
/// <para><b>F20 — mọi thao tác ghi ở đây đi theo đúng ba nhịp: chụp → IN RA STDOUT →
/// trả lại.</b> Bảng bị đụng là master DÙNG CHUNG CẢ PHÒNG KHÁM (<c>CHKAUTO</c>,
/// <c>MST_CMT2</c>), không phải dữ liệu bệnh nhân, nên khối 「NGUYÊN TRẠNG」 in ra stdout
/// là đường cứu duy nhất khi lượt chạy bị Ctrl+C giữa chừng.</para>
/// </summary>
public sealed class ChkAutoBranchDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowSeed;

    private ChkAutoBranchDb(string connectionString, int commandTimeout, bool allowSeed)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
        _allowSeed = allowSeed;
    }

    public static ChkAutoBranchDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new ChkAutoBranchDb(db.ConnectionString, db.CommandTimeoutSeconds,
                                   settings.ChkAutoCascade.AllowBranchSeed);
    }

    public bool CanSeed => _allowSeed;

    private void RequireSeed(string what)
    {
        if (!_allowSeed)
            throw new InvalidOperationException(
                $"「{what}」 SỬA MASTER DÙNG CHUNG nhưng chkAutoCascade.allowBranchSeed = false. " +
                "Bật trong testsettings.local.json hoặc OCHA_CHK_AUTO_BRANCH_SEED=1.");
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
    // CHKAUTO — trỏ ô cd1/sb1 của 処置 chủ nhà sang mã cần đo
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Mười ô <c>cd1..cd5 / sb1..sb5</c> của một dòng <c>chkauto</c>, để trả lại y nguyên.</summary>
    public sealed record ChkAutoSnapshot(int TrtCd, int TrtSb, IReadOnlyList<int> Cd, IReadOnlyList<int> Sb)
    {
        public override string ToString() =>
            $"CHKAUTO({TrtCd},{TrtSb}) = [" +
            string.Join(", ", Cd.Select((c, i) => $"{c}/{Sb[i]}")) + "]";
    }

    public ChkAutoSnapshot? CaptureChkAuto(int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT cd1,sb1,cd2,sb2,cd3,sb3,cd4,sb4,cd5,sb5 FROM chkauto WHERE trt_cd=@cd AND trt_sb=@sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var cd = new List<int>();
        var sb = new List<int>();
        for (var i = 1; i <= 5; i++)
        {
            cd.Add(reader[$"cd{i}"] is DBNull ? 0 : Convert.ToInt32(reader[$"cd{i}"]));
            sb.Add(reader[$"sb{i}"] is DBNull ? 0 : Convert.ToInt32(reader[$"sb{i}"]));
        }
        return new ChkAutoSnapshot(trtCd, trtSb, cd, sb);
    }

    /// <summary>
    /// Đặt 処置 <paramref name="hostCd"/>/<paramref name="hostSb"/> chỉ còn ĐÚNG MỘT ô đi
    /// kèm là <paramref name="cd"/>/<paramref name="sb"/>, bốn ô còn lại về 0.
    ///
    /// <para>Dọn sạch bốn ô kia là CỐ Ý: vòng lặp <c>for (i = 0; i &lt; 5; i++)</c>
    /// (modMain.cs:861) chạy cả năm ô, nên để sót ô cũ thì lưới có thêm dòng lạ và mọi
    /// assert về VỊ TRÍ đều lệch một bậc — đúng kiểu đỏ oan mà F4 cảnh báo.</para>
    /// </summary>
    public void PatchCompanion(int hostCd, int hostSb, int cd, int sb)
    {
        RequireSeed($"trỏ chkauto({hostCd},{hostSb}) sang {cd}/{sb}");
        using var con = Open();
        using var cmd = Command(con,
            """
            UPDATE chkauto
               SET cd1=@cd, sb1=@sb, cd2=0, sb2=0, cd3=0, sb3=0, cd4=0, sb4=0, cd5=0, sb5=0
             WHERE trt_cd=@host AND trt_sb=@hostSb
            """);
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = cd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = sb;
        cmd.Parameters.Add("@host", SqlDbType.Int).Value = hostCd;
        cmd.Parameters.Add("@hostSb", SqlDbType.Int).Value = hostSb;
        cmd.ExecuteNonQuery();
    }

    public void RestoreChkAuto(ChkAutoSnapshot s)
    {
        RequireSeed("trả CHKAUTO về nguyên trạng");
        using var con = Open();
        using var cmd = Command(con,
            """
            UPDATE chkauto
               SET cd1=@c1, sb1=@s1, cd2=@c2, sb2=@s2, cd3=@c3, sb3=@s3,
                   cd4=@c4, sb4=@s4, cd5=@c5, sb5=@s5
             WHERE trt_cd=@host AND trt_sb=@hostSb
            """);
        for (var i = 0; i < 5; i++)
        {
            cmd.Parameters.Add($"@c{i + 1}", SqlDbType.SmallInt).Value = s.Cd[i];
            cmd.Parameters.Add($"@s{i + 1}", SqlDbType.TinyInt).Value = s.Sb[i];
        }
        cmd.Parameters.Add("@host", SqlDbType.Int).Value = s.TrtCd;
        cmd.Parameters.Add("@hostSb", SqlDbType.Int).Value = s.TrtSb;
        cmd.ExecuteNonQuery();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MST_CMT2 — kéo dài một カルテコメント để chạm ngưỡng cắt của fixProc
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Nội dung hiện tại của một dòng <c>MST_CMT2</c>; null khi không có dòng.</summary>
    public string? CaptureCmt2(int cmtCd, int cmtSb)
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT cmt_nm FROM MST_CMT2 WHERE cmt_cd=@cd AND cmt_sb=@sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = cmtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = cmtSb;
        return cmd.ExecuteScalar() as string;
    }

    /// <summary>
    /// Ghi đè nội dung một dòng <c>MST_CMT2</c>.
    ///
    /// <para>Đây là chuỗi mà LƯỚI in ra (<c>MstCmt2.getMstCmt2Data</c> trong
    /// <c>frmCmt3_Set_Data2</c>, frm203002.cs:10151) — cũng là chuỗi mà
    /// <c>frm203012.fixProc</c> cắt theo <c>COLUMN_LENGTH_DSP_TRT = 300</c> byte
    /// (frm203012.cs:1360).</para>
    /// </summary>
    public void PatchCmt2(int cmtCd, int cmtSb, string text)
    {
        RequireSeed($"ghi đè MST_CMT2({cmtCd},{cmtSb})");
        using var con = Open();
        using var cmd = Command(con,
            "UPDATE MST_CMT2 SET cmt_nm=@nm WHERE cmt_cd=@cd AND cmt_sb=@sb");
        cmd.Parameters.Add("@nm", SqlDbType.VarChar).Value = text;
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = cmtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = cmtSb;
        cmd.ExecuteNonQuery();
    }

}
