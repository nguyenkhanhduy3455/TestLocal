using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PackDialog;

/// <summary>
/// 処置パックマスタ <c>PACMST</c> — nguồn để TÍNH kỳ vọng của
/// <see cref="PackDialogTests"/>, thay vì hardcode 「pack 830 có 4 dòng」.
///
/// <para><b>Một pack = 20 ô</b> <c>(DIS_CD{nn}, DIS_SB{nn}, CNT{nn})</c>. Mỗi ô rơi vào
/// MỘT nhánh của <c>frm203014.getViewData</c> tuỳ dải mã (<c>DbLibrary.codeRange</c>,
/// COMMON/DBAccess/DbLibrary.cs:26-33):</para>
///
/// <code>
///   dis_cd == 0          → bỏ qua hẳn                      (frm203014.cs:415)
///   7000..8999  karte    → カルテコメント, getMstCmt2DataPac (:420) — MỘT ô có thể ra NHIỀU dòng
///    700.. 899  receipt  → 摘要コメント,  getMstCmtData     (:431) — null thì ô biến mất
///    600.. 699  drug     → 薬剤: 回数 = g_cnt, tên nối 用法  (:511, :532)
///   còn lại     treat    → 処置: qua BỐN cổng lọc           (:474-489)
/// </code>
///
/// <para><b>Bốn cổng lọc của nhánh 処置</b> — ô nào rớt một cổng là biến mất khỏi lưới:
/// <c>chkDis</c> (病名 bắt buộc) → <c>chk4</c> (乳歯/永久歯) → <c>chkSiga</c> (歯式) →
/// <c>pHoumon &amp;&amp; f1 == 2</c> (訪問診療 không tính được).</para>
///
/// <para>⚠️ <b>Thứ tự lưới <c>grdPack</c> KHÔNG phải theo <c>PAC_CD</c>.</b>
/// <c>getInpPackNyuryokuData</c> (INP/DBAccess/InpDBAccess.cs:564) sắp theo
/// <c>USE_CNT DESC, PAC_CD</c> khi <c>Ocha.xml</c> bật <c>IntelliPac</c>, ngược lại theo
/// <c>PAC_SB, PAC_CD</c>. <c>USE_CNT</c> TĂNG MỖI LẦN DÙNG ⇒ số thứ tự của một pack đổi
/// giữa hai lượt chạy. Test phải tìm pack theo <b>tên</b> hoặc theo cột mã, TUYỆT ĐỐI
/// không hardcode 「dòng số 3」.</para>
/// </summary>
public sealed class PackDb
{
    /// <summary>
    /// Số ô của một pack — <c>DIS_CD01..DIS_CD20</c>.
    ///
    /// <para>⚠️ <b>Phải quét đủ CẢ HAI MƯƠI.</b> Khảo sát ban đầu (2026-09-14) chỉ hỏi 4-8 ô
    /// đầu và kết luận 「không pack nào có ô 116/7」 — thực ra có <b>2</b>, và ô <c>252/0,2</c>
    /// thì có <b>3</b> pack chứ không phải 1. Chính <c>TCP0</c> bắt được sai số đó.</para>
    /// </summary>
    public const int SlotCount = 20;

    /// <summary>
    /// 令和８年６月改定 — <c>ComConst.MedicalFeeRevision_202606</c> (COMMON/Lib/ComConst.cs:28).
    ///
    /// <para>Nhánh đổi 歯管 <c>116/7 → 116/6</c> chỉ chạy khi 診療日 nằm trong
    /// <c>[2020-04-01, đây - 1 ngày]</c> (frm203014.cs:440). Từ mốc này trở đi nhánh ấy
    /// HẾT HIỆU LỰC — có pack mang ô <c>116/7</c> cũng không chạy.</para>
    /// </summary>
    public static readonly DateTime MedicalFeeRevision202606 = new(2026, 6, 1);

    // Dải mã, bản sao của DbLibrary.codeRange (COMMON/DBAccess/DbLibrary.cs:26-33).
    public const int TreatMin = 100, TreatMax = 599;
    public const int DrugMin = 600, DrugMax = 699;
    public const int ReceiptMin = 700, ReceiptMax = 899;
    public const int TreatEtcMin = 900, TreatEtcMax = 999;
    public const int KarteMin = 7000, KarteMax = 8999;

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private PackDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static PackDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new PackDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    /// <summary>Mọi ô khác 0 của mọi pack — dạng bảng phẳng, dùng cho các phép đếm của TCP0.</summary>
    private const string SlotsCte = """
        WITH slots AS (
            SELECT PAC_CD, PAC_SB, PAC_NM, 1 i, DIS_CD01 cd, DIS_SB01 sb, CNT01 c FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 2, DIS_CD02, DIS_SB02, CNT02 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 3, DIS_CD03, DIS_SB03, CNT03 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 4, DIS_CD04, DIS_SB04, CNT04 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 5, DIS_CD05, DIS_SB05, CNT05 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 6, DIS_CD06, DIS_SB06, CNT06 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 7, DIS_CD07, DIS_SB07, CNT07 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 8, DIS_CD08, DIS_SB08, CNT08 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 9, DIS_CD09, DIS_SB09, CNT09 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 10, DIS_CD10, DIS_SB10, CNT10 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 11, DIS_CD11, DIS_SB11, CNT11 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 12, DIS_CD12, DIS_SB12, CNT12 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 13, DIS_CD13, DIS_SB13, CNT13 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 14, DIS_CD14, DIS_SB14, CNT14 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 15, DIS_CD15, DIS_SB15, CNT15 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 16, DIS_CD16, DIS_SB16, CNT16 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 17, DIS_CD17, DIS_SB17, CNT17 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 18, DIS_CD18, DIS_SB18, CNT18 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 19, DIS_CD19, DIS_SB19, CNT19 FROM PACMST
            UNION ALL SELECT PAC_CD, PAC_SB, PAC_NM, 20, DIS_CD20, DIS_SB20, CNT20 FROM PACMST
        )
        """;

    /// <summary>Một pack với đủ 20 ô, theo ĐÚNG thứ tự vòng <c>for</c> ở frm203014.cs:411.</summary>
    public PackRow? ReadPack(int pacCd)
    {
        var cols = string.Join(", ", Enumerable.Range(1, SlotCount)
            .Select(i => $"DIS_CD{i:00}, DIS_SB{i:00}, CNT{i:00}"));

        using var con = Open();
        using var cmd = Command(con, $"SELECT PAC_CD, PAC_SB, PAC_NM, USE_CNT, {cols} FROM PACMST WHERE PAC_CD = @cd");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = pacCd;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var slots = new List<PackSlot>();
        for (var i = 1; i <= SlotCount; i++)
            slots.Add(new PackSlot(i,
                Convert.ToInt32(reader[$"DIS_CD{i:00}"]),
                Convert.ToInt32(reader[$"DIS_SB{i:00}"]),
                Convert.ToInt32(reader[$"CNT{i:00}"])));

        return new PackRow(
            Convert.ToInt32(reader["PAC_CD"]),
            Convert.ToInt32(reader["PAC_SB"]),
            reader["PAC_NM"]?.ToString()?.Trim() ?? "",
            reader["USE_CNT"] is DBNull ? 0 : Convert.ToInt32(reader["USE_CNT"]),
            slots);
    }

    /// <summary>Mọi pack, để log ra 「lưới sẽ có gì」 khi một testcase không tìm thấy dòng.</summary>
    public IReadOnlyList<(int PacCd, int PacSb, string PacNm)> ListPacks(int limit = 200)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT TOP {limit} PAC_CD, PAC_SB, PAC_NM FROM PACMST ORDER BY PAC_SB, PAC_CD");
        var rows = new List<(int, int, string)>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add((Convert.ToInt32(reader["PAC_CD"]), Convert.ToInt32(reader["PAC_SB"]),
                      reader["PAC_NM"]?.ToString()?.Trim() ?? ""));
        return rows;
    }

    public int CountPacks()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM PACMST");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Số pack CÓ ít nhất một ô rơi vào dải <paramref name="min"/>..<paramref name="max"/>.</summary>
    public int CountPacksWithSlotInRange(int min, int max)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"{SlotsCte} SELECT COUNT(DISTINCT PAC_CD) FROM slots WHERE cd BETWEEN @lo AND @hi");
        cmd.Parameters.Add("@lo", SqlDbType.Int).Value = min;
        cmd.Parameters.Add("@hi", SqlDbType.Int).Value = max;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Số pack có ô mang <c>CNT = <paramref name="cnt"/></c>.</summary>
    public int CountPacksWithCnt(int cnt)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"{SlotsCte} SELECT COUNT(DISTINCT PAC_CD) FROM slots WHERE c = @c AND cd <> 0");
        cmd.Parameters.Add("@c", SqlDbType.Int).Value = cnt;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Số pack có ô đúng <paramref name="cd"/>/<paramref name="sb"/>.</summary>
    public int CountPacksWithSlot(int cd, int sb)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"{SlotsCte} SELECT COUNT(DISTINCT PAC_CD) FROM slots WHERE cd = @cd AND sb = @sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = cd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = sb;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>
    /// Các pack có ô カルテコメント mà chuỗi còn dấu <c>*</c> — điều kiện DUY NHẤT bật
    /// <c>txtValue</c> trong <c>chkPacData</c> (frm203014.cs:640-655).
    /// </summary>
    public int CountPacksWithAsteriskKarteComment()
    {
        using var con = Open();
        using var cmd = Command(con,
            $"""
             {SlotsCte}
             SELECT COUNT(DISTINCT s.PAC_CD)
               FROM slots s
               JOIN MST_CMT2 m ON m.CMT_CD = s.cd AND m.CMT_SB = s.sb
              WHERE s.cd BETWEEN {KarteMin} AND {KarteMax} AND m.CMT_NM LIKE '%[*]%'
             """);
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Tên + 点数 mà lưới dialog sẽ in cho một ô 処置, tra từ master của tháng.</summary>
    public IReadOnlyList<MstTrtPackRow> FindTreatRows(string trtTable, int cd, int sb)
    {
        using var con = Open();
        // getMstTrtDataPac: một (cd, sb) có thể ra NHIỀU dòng — sb âm nghĩa là 「mọi 枝番」.
        var where = sb < 0 ? "trt_cd = @cd" : "trt_cd = @cd AND trt_sb = @sb";
        using var cmd = Command(con,
            $"SELECT trt_cd, trt_sb, trt_nm, cct_nm, score1, unit, men, own_kbn, f1 " +
            $"FROM {trtTable} WHERE {where} ORDER BY trt_sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = cd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = sb;

        var rows = new List<MstTrtPackRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new MstTrtPackRow(
                Convert.ToInt32(reader["trt_cd"]), Convert.ToInt32(reader["trt_sb"]),
                reader["trt_nm"]?.ToString()?.Trim() ?? "",
                reader["cct_nm"]?.ToString()?.Trim() ?? "",
                Convert.ToInt32(reader["score1"]),
                Convert.ToInt32(reader["unit"]),
                Convert.ToInt32(reader["men"])));
        return rows;
    }

    /// <summary>Chuỗi 摘要コメント mà lưới in cho một ô dải 700..899 (<c>MST_CMT</c>).</summary>
    public string? FindReceiptComment(int cmtCd, int cmtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT comment FROM MST_CMT WHERE cmt_cd = @cd AND cmt_sb = @sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = cmtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = cmtSb;
        return (cmd.ExecuteScalar() as string)?.Trim();
    }

    /// <summary>
    /// 用法 nối vào tên 薬剤 (<c>SyoPac.getMstMed</c>, frm203014.cs:533). Rỗng ⇒ không nối.
    /// </summary>
    public string? FindDrugUsage(int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT usage FROM MST_MED WHERE trt_cd = @cd AND trt_sb = @sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;
        return (cmd.ExecuteScalar() as string)?.Trim();
    }

    /// <summary>
    /// Cờ <c>tre_inp_flg</c> của 診療入力設定 — quyết định lưới in <c>cct_nm</c> hay
    /// <c>trt_nm</c> (frm203014.cs:529-530). Là cấu hình của MÁY, không phải của test.
    /// </summary>
    public int ReadTreInpFlg()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT TOP 1 tre_inp_flg FROM INPCONFIG");
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? 0 : Convert.ToInt32(v);
    }
}

/// <summary>Một ô của pack. <paramref name="Cnt"/> điều khiển 回数 — xem frm203014.cs:503-523.</summary>
public sealed record PackSlot(int Index, int Cd, int Sb, int Cnt)
{
    public bool Empty => Cd == 0;
    public bool IsKarteComment => Cd is >= PackDb.KarteMin and <= PackDb.KarteMax;
    public bool IsReceiptComment => Cd is >= PackDb.ReceiptMin and <= PackDb.ReceiptMax;
    public bool IsDrug => Cd is >= PackDb.DrugMin and <= PackDb.DrugMax;

    /// <summary>Ô đi nhánh 処置 — phần duy nhất phải qua bốn cổng lọc.</summary>
    public bool IsTreatment => !Empty && !IsKarteComment && !IsReceiptComment && !IsDrug;

    public override string ToString() =>
        $"ô{Index:00} {Cd}/{Sb} cnt={Cnt}" +
        (Empty ? " (rỗng ⇒ bỏ qua)"
               : IsKarteComment ? " カルテコメント"
               : IsReceiptComment ? " 摘要コメント"
               : IsDrug ? " 薬剤"
               : " 処置");
}

/// <summary>Một dòng <c>PACMST</c>.</summary>
public sealed record PackRow(int PacCd, int PacSb, string PacNm, int UseCnt, IReadOnlyList<PackSlot> Slots)
{
    public IReadOnlyList<PackSlot> Used => Slots.Where(s => !s.Empty).ToList();

    public override string ToString() =>
        $"pack {PacCd}/{PacSb} 「{PacNm}」 use_cnt={UseCnt} — {Used.Count}/{Slots.Count} ô có mã";
}

/// <summary>Dòng master mà một ô 処置 của pack nở ra.</summary>
public sealed record MstTrtPackRow(int TrtCd, int TrtSb, string TrtNm, string CctNm, int Score1, int Unit, int Men)
{
    /// <summary>Lưới in <c>cct_nm</c> khi <c>tre_inp_flg = 1</c>, ngược lại <c>trt_nm</c>.</summary>
    public string DisplayName(int treInpFlg) => treInpFlg == 1 ? CctNm : TrtNm;

    public override string ToString() => $"{TrtCd}/{TrtSb} 「{TrtNm}」/「{CctNm}」 {Score1}点 unit={Unit}";
}
