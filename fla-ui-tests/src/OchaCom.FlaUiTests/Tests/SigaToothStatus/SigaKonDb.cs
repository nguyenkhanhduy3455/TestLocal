using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.SigaToothStatus;

/// <summary>
/// Truy vấn hai bảng 歯牙 của app legacy: <c>SIGA</c> (自歯状況) và <c>KON</c> (根数).
///
/// <para>Tách khỏi <see cref="Data.OchaDb"/> vì lớp đó tuyên bố CHỈ ĐỌC, còn ở đây có
/// <see cref="WriteSiga"/> / <see cref="RestoreSiga"/> / <see cref="DeleteSigaRow"/> —
/// cùng lý do <c>ParitySaveData/OchaDbParity.cs</c> và <c>HighNeedsFreewd/HighNeedsDb.cs</c>
/// đứng riêng.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// TÊN CỘT: LEGACY KHÁC BẢN WEB — ĐỪNG CHÉP TÊN TỪ SPEC PLAYWRIGHT SANG
/// ═══════════════════════════════════════════════════════════════════════════════
/// SQL Server (bảng app đang chạy) dùng <c>se1..se32</c> / <c>sn1..sn20</c> /
/// <c>ekon1..ekon32</c> / <c>nkon1..nkon20</c> — KHÔNG gạch dưới
/// (COMMON/DBAccess/Siga.cs:90-101, Kon.cs:94-105). Bản Postgres của web là
/// <c>se_1</c> / <c>sn_4</c>… Ba spec Playwright viết theo kiểu gạch dưới; ở đây phải
/// đổi, nếu không câu SQL chết với 「Invalid column name」.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// MIỀN GIÁ TRỊ (CommonChk.cs:497-580 — nguồn chân lý)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   永久歯 SE : 0 = 生活歯 · 1/2/3 = 失活歯 · 4 = 欠損歯      (cột se* DEFAULT 0)
///   乳歯   SN : 5 = 生活歯 · 6/7/8 = 失活歯 · 9 = 欠損歯      (cột sn* DEFAULT 5)
/// </code>
/// ⇒ 「健全歯」 của 乳歯 là <b>5</b>, KHÔNG phải 0. Đây chính là chỗ bản web từng ghi
/// nhầm 0 mà nhìn màu KHÔNG ra (cùng ra White) — xem chú thích đầu
/// <c>tooth-extraction-siga-restore.spec.ts</c>.
///
/// <para><c>KON</c> thì <b>nullable</b>: giá trị xuất phát là <c>NULL</c> chứ không phải 0,
/// nên mọi chỗ đọc phải phân biệt được ba trạng thái null / 0 / n.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHỐT AN TOÀN
/// ═══════════════════════════════════════════════════════════════════════════════
/// Mọi phép GHI chỉ chạy khi <c>sigaTooth.allowSave = true</c>; <see cref="RequireWrite"/>
/// ném ngay nếu quên bật. Bản sao của quy ước <c>TEST_ALLOW_SAVE=1</c> bên Playwright.
/// </summary>
public sealed class SigaKonDb
{
    // ── Miền giá trị, dùng chung cho cả ba fixture ────────────────────────────

    /// <summary>永久歯 生活歯 — cũng là DEFAULT của cột <c>se*</c>.</summary>
    public const int SeVital = 0;

    /// <summary>永久歯 失活歯 (抜髄 170/176 ghi giá trị này — frm203016.cs:1177).</summary>
    public const int SeDevital = 1;

    /// <summary>永久歯 半歯欠損 (分割抜歯 179/5 — frm203016.cs:1207).</summary>
    public const int SeHalfMissing = 2;

    /// <summary>永久歯 欠損歯 — 抜歯 và <c>Chk_PModeKesson</c> đều ghi giá trị này.</summary>
    public const int SeMissing = 4;

    /// <summary>乳歯 生活歯 — cũng là DEFAULT của cột <c>sn*</c>. KHÔNG phải 0.</summary>
    public const int SnVital = 5;

    /// <summary>乳歯 欠損歯.</summary>
    public const int SnMissing = 9;

    /// <summary>根数 mà ＥＭＲ(４根) 122/3 ghi — hằng "4" nằm thẳng trong chuỗi SQL (modSave.cs:790).</summary>
    public const int EmrRootCount = 4;

    /// <summary>Ba mã 処置 mà luồng này nhập vào lưới — cũng là tập đem dọn.</summary>
    public static readonly int[] TestTrtCds = [179, 122, 185];

    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowWrite;

    private SigaKonDb(string connectionString, int commandTimeout, bool allowWrite)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
        _allowWrite = allowWrite;
    }

    /// <summary>Null khi tắt DB hoặc thiếu chuỗi kết nối. Cờ ghi đọc từ <c>sigaTooth.allowSave</c>.</summary>
    public static SigaKonDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new SigaKonDb(db.ConnectionString, db.CommandTimeoutSeconds, settings.SigaTooth.AllowSave);
    }

    public bool CanWrite => _allowWrite;

    private void RequireWrite(string what)
    {
        if (!_allowWrite)
            throw new InvalidOperationException(
                $"「{what}」 GHI vào SIGA/KON nhưng sigaTooth.allowSave = false. " +
                "Bật trong testsettings.local.json hoặc OCHA_SIGA_ALLOW_SAVE=1.");
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

    /// <summary>Kết nối được không; trả về thông điệp lỗi nếu không.</summary>
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

    // ── SIGA ─────────────────────────────────────────────────────────────────

    /// <summary>Ảnh chụp <c>SIGA</c>; null khi bệnh nhân KHÔNG có dòng nào.</summary>
    public SigaSnapshot? ReadSiga(int patNo)
    {
        var cols = string.Join(",", Enumerable.Range(1, 32).Select(i => $"se{i}")) + "," +
                   string.Join(",", Enumerable.Range(1, 20).Select(i => $"sn{i}"));

        using var con = Open();
        using var cmd = Command(con, $"SELECT {cols} FROM SIGA WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var se = new int[32];
        var sn = new int[20];
        for (var i = 0; i < 32; i++) se[i] = reader.IsDBNull(i) ? 0 : Convert.ToInt32(reader.GetValue(i));
        for (var i = 0; i < 20; i++) sn[i] = reader.IsDBNull(32 + i) ? 0 : Convert.ToInt32(reader.GetValue(32 + i));
        return new SigaSnapshot(se, sn);
    }

    /// <summary>Có dòng <c>SIGA</c> chưa.</summary>
    public bool HasSigaRow(int patNo) => CountRows("SIGA", patNo) > 0;

    /// <summary>
    /// Bảo đảm có dòng <c>SIGA</c>; trả true khi CHÍNH hàm này vừa tạo ra nó.
    ///
    /// <para>Chèn đúng như <c>Siga.insertSiga</c> (Siga.cs:198-201): chỉ <c>pat_no</c>,
    /// mọi cột còn lại để DEFAULT (se = 0, sn = 5).</para>
    /// </summary>
    public bool EnsureSigaRow(int patNo)
    {
        if (HasSigaRow(patNo)) return false;
        RequireWrite("EnsureSigaRow");

        using var con = Open();
        using var cmd = Command(con, "INSERT SIGA (pat_no) VALUES (@p)");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
        return true;
    }

    /// <summary>Xoá hẳn dòng <c>SIGA</c> — dựng tiền đề cho TC-6 (「thiếu dòng siga」).</summary>
    public int DeleteSigaRow(int patNo)
    {
        RequireWrite("DeleteSigaRow");
        using var con = Open();
        using var cmd = Command(con, "DELETE FROM SIGA WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Ghi một số ô 歯式. Khoá của <paramref name="se"/> / <paramref name="sn"/> là
    /// SỐ CỘT 1-based (se 1..32, sn 1..20), không phải chỉ số ô 部位.
    /// </summary>
    public void WriteSiga(int patNo,
                          IReadOnlyDictionary<int, int>? se = null,
                          IReadOnlyDictionary<int, int>? sn = null)
    {
        RequireWrite("WriteSiga");
        var sets = new List<string>();
        if (se is not null) foreach (var (col, v) in se) sets.Add($"se{Col(col, 32)} = {v:D}");
        if (sn is not null) foreach (var (col, v) in sn) sets.Add($"sn{Col(col, 20)} = {v:D}");
        if (sets.Count == 0) return;

        using var con = Open();
        using var cmd = Command(con, $"UPDATE SIGA SET {string.Join(", ", sets)} WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
    }

    /// <summary>Đặt TOÀN BỘ 永久歯 về 生活歯 và TOÀN BỘ 乳歯 về 生活歯 — mốc xuất phát sạch.</summary>
    public void ResetSigaToVital(int patNo)
    {
        RequireWrite("ResetSigaToVital");
        WriteSiga(patNo,
                  Enumerable.Range(1, 32).ToDictionary(i => i, _ => SeVital),
                  Enumerable.Range(1, 20).ToDictionary(i => i, _ => SnVital));
    }

    /// <summary>Trả <c>SIGA</c> về đúng ảnh chụp (đủ 52 cột, y như <c>Restore_Siga</c>).</summary>
    public void RestoreSiga(int patNo, SigaSnapshot snap)
    {
        RequireWrite("RestoreSiga");
        WriteSiga(patNo,
                  Enumerable.Range(1, 32).ToDictionary(i => i, i => snap.Se[i - 1]),
                  Enumerable.Range(1, 20).ToDictionary(i => i, i => snap.Sn[i - 1]));
    }

    // ── KON ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Ảnh chụp <c>KON</c>; null khi bệnh nhân KHÔNG có dòng nào.
    /// Cột nullable ⇒ phần tử là <c>int?</c>, phải phân biệt null với 0.
    /// </summary>
    public KonSnapshot? ReadKon(int patNo)
    {
        var cols = string.Join(",", Enumerable.Range(1, 32).Select(i => $"ekon{i}")) + "," +
                   string.Join(",", Enumerable.Range(1, 20).Select(i => $"nkon{i}"));

        using var con = Open();
        using var cmd = Command(con, $"SELECT {cols} FROM KON WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var ekon = new int?[32];
        var nkon = new int?[20];
        for (var i = 0; i < 32; i++) ekon[i] = reader.IsDBNull(i) ? null : Convert.ToInt32(reader.GetValue(i));
        for (var i = 0; i < 20; i++) nkon[i] = reader.IsDBNull(32 + i) ? null : Convert.ToInt32(reader.GetValue(32 + i));
        return new KonSnapshot(ekon, nkon);
    }

    public bool HasKonRow(int patNo) => CountRows("KON", patNo) > 0;

    /// <summary>Ghi một số ô 根数; <c>null</c> nghĩa là đặt lại về <c>NULL</c>.</summary>
    public void WriteKon(int patNo,
                         IReadOnlyDictionary<int, int?>? ekon = null,
                         IReadOnlyDictionary<int, int?>? nkon = null)
    {
        RequireWrite("WriteKon");
        var sets = new List<string>();
        if (ekon is not null) foreach (var (col, v) in ekon) sets.Add($"ekon{Col(col, 32)} = {Lit(v)}");
        if (nkon is not null) foreach (var (col, v) in nkon) sets.Add($"nkon{Col(col, 20)} = {Lit(v)}");
        if (sets.Count == 0) return;

        using var con = Open();
        using var cmd = Command(con, $"UPDATE KON SET {string.Join(", ", sets)} WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();

        static string Lit(int? v) => v.HasValue ? v.Value.ToString() : "NULL";
    }

    /// <summary>Đặt các ô 根数 đem thử về <c>NULL</c> — mốc xuất phát phân biệt được 「chưa từng ghi」.</summary>
    public void ResetKonToNull(int patNo, IEnumerable<int> ekonCols, IEnumerable<int> nkonCols) =>
        WriteKon(patNo,
                 ekonCols.ToDictionary(c => c, _ => (int?)null),
                 nkonCols.ToDictionary(c => c, _ => (int?)null));

    /// <summary>Trả <c>KON</c> về đúng ảnh chụp.</summary>
    public void RestoreKon(int patNo, KonSnapshot snap)
    {
        RequireWrite("RestoreKon");
        WriteKon(patNo,
                 Enumerable.Range(1, 32).ToDictionary(i => i, i => snap.Ekon[i - 1]),
                 Enumerable.Range(1, 20).ToDictionary(i => i, i => snap.Nkon[i - 1]));
    }

    // ── TRNTRN: đọc để biết mình để lại gì ────────────────────────────────────

    /// <summary>Số dòng 処置 của (bệnh nhân, THÁNG của ngày truyền vào).</summary>
    public int CountTrnRowsInMonth(int patNo, DateTime month) =>
        Convert.ToInt32(ScalarInMonth(patNo, month, "SELECT COUNT(*) FROM TRNTRN"));

    /// <summary>Số dòng mang một trong các <c>trt_cd</c> — dùng để biết có được phép tự dọn không.</summary>
    public int CountTrnRowsWithTrtCd(int patNo, DateTime month, params int[] trtCds)
    {
        if (trtCds.Length == 0) return 0;
        var list = string.Join(",", trtCds);
        return Convert.ToInt32(ScalarInMonth(
            patNo, month, $"SELECT COUNT(*) FROM TRNTRN WHERE trt_cd IN ({list})", andMonth: true));
    }

    /// <summary>Mô tả từng dòng của tháng — in ra log để người đọc biết lượt chạy đụng vào gì.</summary>
    public IReadOnlyList<string> DescribeMonthRows(int patNo, DateTime month, int limit = 40)
    {
        var (from, to) = MonthRange(month);
        using var con = Open();
        using var cmd = Command(con,
            $"""
             SELECT TOP {limit} CONVERT(varchar(10), trt_dt, 120) AS d,
                    disp_no, trt_cd, trt_sb, trt_pt, trt_cnt, dsp_trt
               FROM TRNTRN
              WHERE pat_no = @p AND trt_dt >= @f AND trt_dt < @t
              ORDER BY trt_dt, disp_no
             """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@f", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@t", SqlDbType.DateTime).Value = to;

        var rows = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add($"{reader["d"]} disp_no={reader["disp_no"],-5} " +
                     $"{Convert.ToInt32(reader["trt_cd"]),4}/{Convert.ToInt32(reader["trt_sb"]),-3} " +
                     $"{Convert.ToInt32(reader["trt_pt"]),5}点 ×{reader["trt_cnt"]} 「{Txt.N(reader["dsp_trt"]?.ToString())}」");
        return rows;
    }

    /// <summary>
    /// Xoá các dòng do lượt chạy để lại (<see cref="TestTrtCds"/> trong tháng test).
    ///
    /// <para><b>Chỉ chạy khi tháng đó xuất phát KHÔNG có dòng nào mang các mã ấy</b> —
    /// tham số <paramref name="preexisting"/> là con số đo ĐƯỢC ở <c>OneTimeSetUp</c>.
    /// Khác 0 ⇒ hàm này KHÔNG xoá gì và trả về câu mô tả, vì không phân biệt nổi dòng
    /// của test với dòng thật.</para>
    ///
    /// <para>Đây là bài học đã trả giá ở <c>OchaDbParity.DescribeDrift</c>: đừng tự xoá
    /// trên bảng nghiệp vụ dựa vào một khoá mà chính hành vi đang test làm thay đổi.</para>
    /// </summary>
    public string CleanupTestRows(int patNo, DateTime month, int preexisting)
    {
        if (!_allowWrite) return "KHÔNG dọn: sigaTooth.allowSave = false.";
        if (preexisting > 0)
            return $"KHÔNG dọn: tháng {month:yyyy-MM} vốn đã có {preexisting} dòng mang " +
                   $"trt_cd ∈ [{string.Join(",", TestTrtCds)}] TỪ TRƯỚC lượt chạy — không phân biệt " +
                   "được dòng của test với dòng thật. Dọn tay nếu cần.";

        var (from, to) = MonthRange(month);
        var list = string.Join(",", TestTrtCds);
        using var con = Open();
        using var cmd = Command(con,
            $"DELETE FROM TRNTRN WHERE pat_no = @p AND trt_dt >= @f AND trt_dt < @t AND trt_cd IN ({list})");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@f", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@t", SqlDbType.DateTime).Value = to;
        var n = cmd.ExecuteNonQuery();
        return $"đã xoá {n} dòng 処置 mang trt_cd ∈ [{list}] của tháng {month:yyyy-MM}.";
    }

    // ── Master 処置 ───────────────────────────────────────────────────────────

    /// <summary>Bảng master áp dụng cho ngày (bản sao của <see cref="Data.OchaDb.ActiveTrtTable"/>).</summary>
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
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException($"TRT_SEL không có master nào phủ ngày {date:yyyy-MM-dd}.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, "^MST[A-Za-z0-9_]*$"))
            throw new InvalidOperationException($"Tên bảng master lạ trong TRT_SEL: 「{name}」");
        return name;
    }

    /// <summary>Mọi 枝番 của một <c>trt_cd</c> trong master đang áp dụng.</summary>
    public IReadOnlyList<MstTrtRow> FindMasterRows(DateTime date, int trtCd)
    {
        var table = ActiveTrtTable(date);
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT trt_cd, trt_sb, trt_nm, cct_nm, score1 FROM {table} WHERE trt_cd = @cd ORDER BY trt_sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;

        var rows = new List<MstTrtRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new MstTrtRow(
                Convert.ToInt32(reader["trt_cd"]),
                Convert.ToInt32(reader["trt_sb"]),
                reader["trt_nm"]?.ToString() ?? "",
                reader["cct_nm"]?.ToString() ?? "",
                reader["score1"] is DBNull ? 0 : Convert.ToInt32(reader["score1"]),
                table));
        return rows;
    }

    /// <summary>Một 枝番 cụ thể; null khi master không có.</summary>
    public MstTrtRow? FindMasterRow(DateTime date, int trtCd, int trtSb) =>
        FindMasterRows(date, trtCd).FirstOrDefault(r => r.TrtSb == trtSb);

    // ── Nội bộ ───────────────────────────────────────────────────────────────

    private int CountRows(string table, int patNo)
    {
        using var con = Open();
        using var cmd = Command(con, $"SELECT COUNT(*) FROM {table} WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    private object? ScalarInMonth(int patNo, DateTime month, string sql, bool andMonth = false)
    {
        var (from, to) = MonthRange(month);
        var where = andMonth
            ? " AND pat_no = @p AND trt_dt >= @f AND trt_dt < @t"
            : " WHERE pat_no = @p AND trt_dt >= @f AND trt_dt < @t";

        using var con = Open();
        using var cmd = Command(con, sql + where);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@f", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@t", SqlDbType.DateTime).Value = to;
        return cmd.ExecuteScalar();
    }

    private static (DateTime From, DateTime To) MonthRange(DateTime any)
    {
        var from = new DateTime(any.Year, any.Month, 1);
        return (from, from.AddMonths(1));
    }

    /// <summary>Số cột đưa thẳng vào chuỗi SQL nên phải chặn ở đây.</summary>
    private static int Col(int col, int max) =>
        col >= 1 && col <= max
            ? col
            : throw new ArgumentOutOfRangeException(nameof(col), col, $"số cột phải nằm trong 1..{max}");
}

/// <summary>Ảnh chụp <c>SIGA</c>. <c>Se[0]</c> = cột <c>se1</c>, <c>Sn[0]</c> = cột <c>sn1</c>.</summary>
public sealed record SigaSnapshot(int[] Se, int[] Sn)
{
    /// <summary>Giá trị của cột <c>se{col}</c> (col 1-based).</summary>
    public int SeCol(int col) => Se[col - 1];

    /// <summary>Giá trị của cột <c>sn{col}</c> (col 1-based).</summary>
    public int SnCol(int col) => Sn[col - 1];

    /// <summary>Các cột khác nhau giữa hai ảnh chụp, dạng 「se11: 0→4」.</summary>
    public IReadOnlyList<string> DiffFrom(SigaSnapshot other)
    {
        var d = new List<string>();
        for (var i = 0; i < 32; i++) if (other.Se[i] != Se[i]) d.Add($"se{i + 1}: {other.Se[i]}→{Se[i]}");
        for (var i = 0; i < 20; i++) if (other.Sn[i] != Sn[i]) d.Add($"sn{i + 1}: {other.Sn[i]}→{Sn[i]}");
        return d;
    }

    public override string ToString() =>
        $"se=[{string.Join(",", Se)}] sn=[{string.Join(",", Sn)}]";
}

/// <summary>Ảnh chụp <c>KON</c>. Cột nullable ⇒ null = 「chưa từng ghi」, khác hẳn 0.</summary>
public sealed record KonSnapshot(int?[] Ekon, int?[] Nkon)
{
    public int? EkonCol(int col) => Ekon[col - 1];
    public int? NkonCol(int col) => Nkon[col - 1];

    public IReadOnlyList<string> DiffFrom(KonSnapshot other)
    {
        var d = new List<string>();
        for (var i = 0; i < 32; i++) if (other.Ekon[i] != Ekon[i]) d.Add($"ekon{i + 1}: {S(other.Ekon[i])}→{S(Ekon[i])}");
        for (var i = 0; i < 20; i++) if (other.Nkon[i] != Nkon[i]) d.Add($"nkon{i + 1}: {S(other.Nkon[i])}→{S(Nkon[i])}");
        return d;
    }

    /// <summary>Hiển thị phân biệt rõ NULL với 0.</summary>
    public static string S(int? v) => v?.ToString() ?? "NULL";

    public override string ToString() =>
        $"ekon=[{string.Join(",", Ekon.Select(S))}] nkon=[{string.Join(",", Nkon.Select(S))}]";
}

/// <summary>Một dòng master 処置 — chỉ những cột luồng này cần.</summary>
public sealed record MstTrtRow(int TrtCd, int TrtSb, string TrtNm, string CctNm, int Score1, string Table)
{
    /// <summary>Tên có thể hiện trên lưới: app in <c>cct_nm</c> hay <c>trt_nm</c> tuỳ <c>pCultTrt</c>.</summary>
    public string[] DisplayNames => new[] { CctNm, TrtNm }.Where(s => s.Length > 0).ToArray();

    public override string ToString() => $"{TrtCd}/{TrtSb} 「{TrtNm}」 / 「{CctNm}」 {Score1}点";
}
