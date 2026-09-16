using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackType10;

/// <summary>
/// Bộ ba bảng master của 摘要コメントパック — <c>MST_CMT_PACK_DEF</c> (định nghĩa pack),
/// <c>MST_CMT_PACK</c> (mã 処置 nào KÍCH HOẠT pack) và <c>MST_CMT_PACK_DETAIL</c> (các câu
/// comment mà pack xuất ra). CHỈ ĐỌC.
///
/// <para>Ba câu truy vấn dưới đây là bản sao <b>từng chữ</b> của
/// <c>COMMON/DBAccess/MstCmtPack.cs</c>:</para>
/// <code>
///   getMstCmtPack(trt_cd, trt_sb, appDt)  MstCmtPack.cs:66-105   → PacksFor
///   getMstCmtPackTrtCd(pack_cd, appDt)    MstCmtPack.cs:228-259  → Triggers
///   getMstCmtPackDetail(pack_cd, appDt)   MstCmtPack.cs:272-300  → Details
/// </code>
///
/// <para>⚠️ <b>Cột ngày là CHUỖI <c>yyyyMMdd</c>, không phải kiểu ngày.</b> App truyền
/// <c>appDt.Replace("/", "")</c> rồi so <c>BETWEEN</c> trên chuỗi (MstCmtPack.cs:93). Mọi
/// truy vấn ở đây phải so đúng kiểu ấy — đổi sang <c>DATETIME</c> là đo một cái khác.</para>
///
/// <para>⚠️ <b>Cửa sổ ngày của pack là thứ QUYẾT ĐỊNH nhánh nào còn sống.</b> Đo được
/// 2026-09-16: 12/30 pack type 10 chưa port đã HẾT hiệu lực (歯CAD hết 2026-05-31 vì
/// 令和８年６月改定; Denture/SPT2 hết từ 2020-03-31; 歯清-特導 hết 2024-05-31). Với một
/// 算定日 sau các mốc đó, <c>getMstCmtPack</c> không trả về pack nào ⇒ handler không bao giờ
/// chạy. Xem <see cref="CmtPackMasterTests"/>.</para>
/// </summary>
public sealed class CmtPackDb
{
    /// <summary>Kiểu pack 「自動選択」 — <c>prgCmtAuto case 10</c> (CmtAuto.cs:411-535).</summary>
    public const int PackTypeAuto = 10;

    /// <summary>令和８年６月改定 — <c>ComConst.MedicalFeeRevision_202606</c>.</summary>
    public static readonly DateTime MedicalFeeRevision202606 = new(2026, 6, 1);

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private CmtPackDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static CmtPackDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new CmtPackDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    /// <summary>Chuỗi ngày mà app truyền vào SQL — <c>appDt.Replace("/", "")</c>.</summary>
    public static string AppDt(DateTime date) => date.ToString("yyyyMMdd");

    // ═════════════════════════════════════════════════════════════════════════
    // Kiểu dữ liệu
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Một dòng <c>MST_CMT_PACK_DEF</c>.</summary>
    public sealed record PackDef(
        string PackCd,
        string AppStDt,
        string AppEdDt,
        string PackNm,
        int PackType,
        string Condition,
        string ComCd1,
        bool OnceDay,
        bool OnceMonth)
    {
        /// <summary>Cửa sổ ngày của pack có phủ <paramref name="date"/> không — đúng phép so của app.</summary>
        public bool Covers(DateTime date)
        {
            var d = AppDt(date);
            return string.CompareOrdinal(AppStDt, d) <= 0 && string.CompareOrdinal(d, AppEdDt) <= 0;
        }

        public string Window => $"{AppStDt}..{AppEdDt}";

        public override string ToString() =>
            $"{PackCd} [{Window}] type {PackType} 「{Condition}」 {PackNm}";
    }

    /// <summary>Một mã 処置 kích hoạt pack — dòng <c>MST_CMT_PACK</c>.</summary>
    public sealed record Trigger(string PackCd, int TrtCd, int TrtSb, int SeqNo, string TrtNm)
    {
        public override string ToString() => $"{TrtCd}/{TrtSb} 「{TrtNm}」";
    }

    /// <summary>Một câu comment mà pack có thể xuất — dòng <c>MST_CMT_PACK_DETAIL</c>.</summary>
    public sealed record PackDetail(
        string PackCd,
        int SeqNo,
        int DspSeqNo,
        string ComCd,
        string ComNm,
        string FmtStr,
        bool DspFlg,
        bool ExitFlg)
    {
        /// <summary>
        /// Chuỗi mà lưới 処置 sẽ in ra cho detail này.
        ///
        /// <para><c>setPacData</c> (CmtAuto.cs:3605-3660) lấy <c>com_nm</c> khi nó khác rỗng,
        /// ngược lại mới dùng <c>fmt_str</c>. Pattern nằm ở 2 ký tự giữa của <c>com_cd</c>
        /// (<c>com_cd.Substring(1, 2)</c>): 20 = text thuần, 50 = text + 和暦年月日.</para>
        /// </summary>
        public string DisplayText => ComNm.Length > 0 ? ComNm : FmtStr;

        /// <summary>Hai chữ số pattern của <c>com_cd</c> — 20/50/51/53/90…</summary>
        public int Pattern =>
            ComCd.Length >= 3 && int.TryParse(ComCd.Substring(1, 2), out var p) ? p : -1;

        public override string ToString() =>
            $"seq {SeqNo} (dsp {DspSeqNo}) com_cd {ComCd} pattern {Pattern} " +
            $"「{DisplayText}」{(DspFlg ? " [dsp_flg]" : "")}{(ExitFlg ? " [exit_flg]" : "")}";
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Truy vấn
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// MỌI dòng <c>MST_CMT_PACK_DEF</c> có <c>pack_type = 10</c>, <b>không lọc theo ngày</b> —
    /// chính vì cần nhìn thấy cả những pack đã hết hiệu lực.
    /// </summary>
    public IReadOnlyList<PackDef> Type10Defs()
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT pack_cd, app_st_dt, app_ed_dt, pack_nm, pack_type, condition,
                   com_cd1, once_day, once_month
              FROM MST_CMT_PACK_DEF
             WHERE pack_type = @t
             ORDER BY condition, pack_cd, app_st_dt
            """);
        cmd.Parameters.Add("@t", SqlDbType.Int).Value = PackTypeAuto;
        return ReadDefs(cmd);
    }

    /// <summary>
    /// Các pack mà <paramref name="trtCd"/>/<paramref name="trtSb"/> kích hoạt trong ngày
    /// <paramref name="date"/> — bản sao <c>getMstCmtPack</c>, GIỮ NGUYÊN <c>ORDER BY a.seq_no</c>.
    ///
    /// <para>Thứ tự này là thứ tự <c>prgCmtAuto</c> chạy các pack, và nó quyết định thứ tự
    /// các dòng comment rơi xuống lưới. Đừng sắp lại.</para>
    /// </summary>
    public IReadOnlyList<PackDef> PacksFor(int trtCd, int trtSb, DateTime date)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT b.pack_cd, b.app_st_dt, b.app_ed_dt, b.pack_nm, b.pack_type, b.condition,
                   b.com_cd1, b.once_day, b.once_month
              FROM MST_CMT_PACK a
              LEFT OUTER JOIN MST_CMT_PACK_DEF b
                ON b.pack_cd = a.pack_cd
               AND @d BETWEEN b.app_st_dt AND b.app_ed_dt
             WHERE a.trt_cd = @cd
               AND a.trt_sb = @sb
               AND @d BETWEEN a.app_st_dt AND a.app_ed_dt
             ORDER BY a.seq_no
            """);
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;
        cmd.Parameters.Add("@d", SqlDbType.VarChar, 8).Value = AppDt(date);
        // LEFT JOIN ⇒ dòng nào pack_cd hết hiệu lực sẽ ra pack_cd rỗng; loại chúng ở đây,
        // y như app (setData đọc row["pack_type"] = "" → 0 → không rơi vào case nào).
        return ReadDefs(cmd).Where(d => d.PackCd.Length > 0).ToList();
    }

    /// <summary>
    /// Mã 処置 kích hoạt một pack — bản sao <c>getMstCmtPackTrtCd</c>, thêm tên 処置 lấy từ
    /// bản master đang áp dụng để log đọc được.
    /// </summary>
    public IReadOnlyList<Trigger> Triggers(string packCd, DateTime date, string? trtTable = null)
    {
        var table = trtTable ?? ActiveTrtTable(date);

        using var con = Open();
        using var cmd = Command(con,
            $"""
             SELECT a.pack_cd, a.trt_cd, a.trt_sb, a.seq_no,
                    ISNULL(t.trt_nm, '') AS trt_nm
               FROM MST_CMT_PACK a
               LEFT OUTER JOIN {table} t ON t.trt_cd = a.trt_cd AND t.trt_sb = a.trt_sb
              WHERE a.pack_cd = @p
                AND @d BETWEEN a.app_st_dt AND a.app_ed_dt
              ORDER BY a.trt_cd, a.trt_sb
             """);
        cmd.Parameters.Add("@p", SqlDbType.VarChar, 32).Value = packCd;
        cmd.Parameters.Add("@d", SqlDbType.VarChar, 8).Value = AppDt(date);

        var rows = new List<Trigger>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new Trigger(
                Str(reader["pack_cd"]), Int(reader["trt_cd"]), Int(reader["trt_sb"]),
                Int(reader["seq_no"]), Str(reader["trt_nm"])));
        return rows;
    }

    /// <summary>Các câu comment của một pack — bản sao <c>getMstCmtPackDetail</c>.</summary>
    public IReadOnlyList<PackDetail> Details(string packCd, DateTime date)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT a.pack_cd, a.seq_no, a.dsp_seq_no, a.com_cd, a.fmt_str, a.dsp_flg, a.exit_flg,
                   ISNULL(b.com_nm, '') AS com_nm
              FROM MST_CMT_PACK_DETAIL a
              LEFT OUTER JOIN MST_COMMENT b
                ON b.com_cd = a.com_cd AND @d BETWEEN b.app_st_dt AND b.app_ed_dt
             WHERE a.pack_cd = @p
               AND @d BETWEEN a.app_st_dt AND a.app_ed_dt
             ORDER BY a.dsp_seq_no, a.seq_no
            """);
        cmd.Parameters.Add("@p", SqlDbType.VarChar, 32).Value = packCd;
        cmd.Parameters.Add("@d", SqlDbType.VarChar, 8).Value = AppDt(date);

        var rows = new List<PackDetail>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new PackDetail(
                Str(reader["pack_cd"]), Int(reader["seq_no"]), Int(reader["dsp_seq_no"]),
                Str(reader["com_cd"]),
                // com_nm bị TrimEnd('；') trong setDataDetail (MstCmtPack.cs:320) — lưới in ra
                // đã bỏ dấu đó, nên cắt luôn ở đây để so chuỗi khỏi trượt.
                Str(reader["com_nm"]).TrimEnd('；'),
                Str(reader["fmt_str"]),
                Bool(reader["dsp_flg"]), Bool(reader["exit_flg"])));
        return rows;
    }

    /// <summary>Bảng 処置マスタ đang áp dụng cho ngày đó (<c>TRT_SEL</c>) — giống OchaDb.ActiveTrtTable.</summary>
    public string ActiveTrtTable(DateTime date)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT TOP 1 MTBL_NM
              FROM TRT_SEL
             WHERE START_DT <= @d AND (END_DT >= @d OR END_DT IS NULL)
             ORDER BY START_DT DESC
            """);
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;
        var name = cmd.ExecuteScalar() as string;
        if (string.IsNullOrWhiteSpace(name) ||
            !System.Text.RegularExpressions.Regex.IsMatch(name, "^MST[A-Za-z0-9_]*$"))
            throw new InvalidOperationException(
                $"TRT_SEL không có bản master hợp lệ cho ngày {date:yyyy-MM-dd} (đọc ra 「{name}」).");
        return name;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Lịch sử 処置 của bệnh nhân — vế 「đã lưu」 mà getTreatData đọc
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Một dòng <c>TRNTRN</c> đã lưu.</summary>
    public sealed record TrnRow(DateTime TrtDt, int DispNo, int TrtCd, int TrtSb, string DspTrt, int TrtPt)
    {
        public override string ToString() =>
            $"{TrtDt:yyyy-MM-dd} disp {DispNo} · {TrtCd}/{TrtSb} 「{DspTrt}」 {TrtPt}点";
    }

    /// <summary>
    /// Các dòng 処置 ĐÃ LƯU của bệnh nhân trong <c>[from, to]</c>, lọc theo danh sách
    /// <c>(trt_cd, trt_sb)</c> — vế mà <c>CommonChk.getTreatData</c> tra khi lưới hiện tại
    /// không có dòng nào khớp (CommonChk.cs:756-808).
    ///
    /// <para>⚠️ Đây <b>KHÔNG</b> phải toàn bộ cái mà app nhìn thấy: app tra
    /// <c>_tblRegiInp</c> (lưới ĐANG MỞ, gồm cả dòng chưa F9) TRƯỚC — xem
    /// <see cref="CmtPackType10UiTests"/> TC10-3.</para>
    /// </summary>
    public IReadOnlyList<TrnRow> SavedRows(int patNo, IEnumerable<(int Cd, int Sb)> codes,
                                           DateTime from, DateTime to)
    {
        var pairs = codes.ToList();
        if (pairs.Count == 0) return [];

        var where = string.Join(" OR ", pairs.Select((_, i) => $"(trt_cd = @c{i} AND trt_sb = @s{i})"));

        using var con = Open();
        using var cmd = Command(con,
            $"""
             SELECT trt_dt, disp_no, trt_cd, trt_sb, dsp_trt, trt_pt
               FROM TRNTRN
              WHERE pat_no = @pat
                AND trt_dt BETWEEN @from AND @to
                AND ({where})
              ORDER BY trt_dt, disp_no
             """);
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from.Date;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to.Date;
        for (var i = 0; i < pairs.Count; i++)
        {
            cmd.Parameters.Add($"@c{i}", SqlDbType.Int).Value = pairs[i].Cd;
            cmd.Parameters.Add($"@s{i}", SqlDbType.Int).Value = pairs[i].Sb;
        }

        var rows = new List<TrnRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new TrnRow(
                Convert.ToDateTime(reader["trt_dt"]), Int(reader["disp_no"]),
                Int(reader["trt_cd"]), Int(reader["trt_sb"]),
                Str(reader["dsp_trt"]), Int(reader["trt_pt"])));
        return rows;
    }

    /// <summary>Mọi dòng 処置 đã lưu của một ngày — mốc để biết lưới sẽ mở ra với cái gì.</summary>
    public IReadOnlyList<TrnRow> DayRows(int patNo, DateTime date)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT trt_dt, disp_no, trt_cd, trt_sb, dsp_trt, trt_pt
              FROM TRNTRN
             WHERE pat_no = @pat AND trt_dt = @d
             ORDER BY disp_no
            """);
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;

        var rows = new List<TrnRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new TrnRow(
                Convert.ToDateTime(reader["trt_dt"]), Int(reader["disp_no"]),
                Int(reader["trt_cd"]), Int(reader["trt_sb"]),
                Str(reader["dsp_trt"]), Int(reader["trt_pt"])));
        return rows;
    }

    // ═════════════════════════════════════════════════════════════════════════

    private static List<PackDef> ReadDefs(SqlCommand cmd)
    {
        var rows = new List<PackDef>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new PackDef(
                Str(reader["pack_cd"]), Str(reader["app_st_dt"]), Str(reader["app_ed_dt"]),
                Str(reader["pack_nm"]), Int(reader["pack_type"]), Str(reader["condition"]),
                Str(reader["com_cd1"]), Bool(reader["once_day"]), Bool(reader["once_month"])));
        return rows;
    }

    private static string Str(object v) => v is DBNull ? "" : (v.ToString() ?? "").Trim();
    private static int Int(object v) => v is DBNull ? 0 : Convert.ToInt32(v);
    private static bool Bool(object v) => v is not DBNull && Convert.ToBoolean(v);
}
