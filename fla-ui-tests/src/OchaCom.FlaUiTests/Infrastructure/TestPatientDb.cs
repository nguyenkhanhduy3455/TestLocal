using System.Data;
using System.Text;
using Microsoft.Data.SqlClient;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Dựng một BỆNH NHÂN TEST MỚI HOÀN TOÀN rồi xoá sạch sau lượt chạy.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CÓ LỚP NÀY
/// ═══════════════════════════════════════════════════════════════════════════════
/// Trước đây mọi luồng bám vào bệnh nhân CÓ SẴN (10, 12138, 5…) và chọn ngày theo
/// dữ liệu sẵn có của họ. Cái giá phải trả, đã vấp thật nhiều lần:
///
/// <list type="bullet">
///   <item>Hai luồng chạy cùng bệnh nhân thì dọn dẹp của luồng này cuốn mất dữ liệu
///     của luồng kia — <c>ChkAutoDb.DeleteSeededRows</c> phải khoá thêm <c>TRT_DT</c>
///     chỉ vì dòng 再初診 cố định của bệnh nhân 10 nằm ở ngày khác.</item>
///   <item>Kỳ vọng phụ thuộc lịch sử: 「月計 413」 đúng đến khi ai đó thêm một dòng
///     処置 cho bệnh nhân ấy.</item>
///   <item>Ca biên không dựng được vì bệnh nhân thật không có trạng thái đó
///     (răng 欠損 toàn hàm, tháng trống, 初診月…).</item>
/// </list>
///
/// <para>Bệnh nhân riêng cho từng lượt chạy gỡ cả ba: trạng thái xuất phát do test
/// quyết định hoàn toàn, và dọn dẹp không thể chạm vào ai khác.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÁCH DỰNG: CLONE, KHÔNG PHẢI DỰNG TAY
/// ═══════════════════════════════════════════════════════════════════════════════
/// Hồ sơ bệnh nhân trải trên <b>mười ba</b> bảng (đo 2026-09-14 trên bệnh nhân 10),
/// mỗi bảng vài chục cột, và app đọc những cột mà không ai nhớ hết. Dựng tay từng
/// cột là con đường chắc chắn dẫn tới 「mở màn 診療入力 mà lưới không bao giờ hiện」
/// — đúng cái bẫy mà <c>ChkAutoDb.SeedBuiDisRow</c> đã trả giá với một cột
/// <c>MED_ST_DT</c> bị bỏ NULL.
///
/// <para>Vì thế: <b>CLONE nguyên một bệnh nhân mẫu</b>, chỉ đổi <c>PAT_NO</c> và
/// những cột mà test thật sự định nghĩa. Cột nào không hiểu thì cứ để nguyên giá
/// trị của dòng mẫu — đó là giá trị app vẫn đang chạy được.</para>
///
/// <code>
///   PERSON  PERSON_EXP  INSURANCE  MEDINSINF  BNOW  MISOU
///   SIGA    KON         TRN_STATUS TRTSTATE   NCULT
/// </code>
///
/// <para><c>TRNTRN</c> (処置) và <c>ACCDAT</c> (kế toán) CỐ Ý không clone: bệnh nhân
/// mới phải bắt đầu với lịch sử TRỐNG, còn 処置 nào cần thì chính test seed lấy.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÙNG SỐ VÀ HÀNG RÀO
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>PAT_NO</c> cấp trong vùng <see cref="TestPatNoBase"/> trở lên. Dữ liệu thật
/// của dev DB có <c>max(PAT_NO) = 18282</c> (16331 bệnh nhân, đo 2026-09-14) nên
/// vùng 990000+ nằm cách rất xa — vừa dễ nhận ra khi soi DB, vừa cho phép dọn theo
/// dải mà không bao giờ chạm vào bệnh nhân thật.
///
/// <para><b>Mọi lệnh xoá đều chặn ở <c>PAT_NO &gt;= TestPatNoBase</c>.</b>
/// <see cref="Drop"/> ném ngay nếu bị gọi với số ngoài vùng — không có đường nào
/// để một lỗi đánh máy xoá mất bệnh nhân thật.</para>
/// </summary>
public sealed class TestPatientDb
{
    /// <summary>
    /// Mốc dưới của vùng bệnh nhân test. Mọi <c>PAT_NO</c> từ đây trở lên là của
    /// test và có thể xoá; dưới mốc này là dữ liệu thật, TUYỆT ĐỐI không đụng.
    /// </summary>
    public const int TestPatNoBase = 990000;

    /// <summary>
    /// Các bảng hợp thành một hồ sơ bệnh nhân, theo thứ tự clone.
    ///
    /// <para><c>PERSON</c> đứng đầu vì màn chọn bệnh nhân tra nó trước; các bảng sau
    /// chỉ là trạng thái ăn theo. Thứ tự XOÁ là thứ tự ngược lại.</para>
    /// </summary>
    public static readonly string[] ProfileTables =
    [
        "PERSON", "PERSON_EXP", "INSURANCE", "MEDINSINF",
        "BNOW", "MISOU", "SIGA", "KON", "TRN_STATUS", "TRTSTATE", "NCULT",
    ];

    /// <summary>
    /// Bảng mang dữ liệu PHÁT SINH của bệnh nhân — KHÔNG clone, nhưng PHẢI dọn.
    ///
    /// <para>Một lượt chạy có thể để lại 処置 (<c>TRNTRN</c>), tiền (<c>ACCDAT</c>),
    /// hàng chờ (<c>WAIT</c>)… Chúng không có ở bệnh nhân mới lúc sinh ra, nhưng có
    /// thể sinh ra trong lúc test nên <see cref="Drop"/> phải quét cả.</para>
    /// </summary>
    public static readonly string[] GeneratedTables =
    [
        "TRNTRN", "ACCDAT", "ACCDAT_BILL", "UNPAID", "WAIT", "YOYAKU",
        "CHIRYOKANRI", "GISIKANRI", "SIDOU", "PATMSG", "PCONDITION",
        "RCP_STATUSINF", "SUM_TSK", "PUBEXPINF", "PATINFO", "PERSONAL_INFO",
    ];

    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowWrite;

    private TestPatientDb(string connectionString, int commandTimeout, bool allowWrite)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
        _allowWrite = allowWrite;
    }

    public static TestPatientDb? CreateOrNull(TestSettings settings, bool allowWrite)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new TestPatientDb(db.ConnectionString, db.CommandTimeoutSeconds, allowWrite);
    }

    public bool CanWrite => _allowWrite;

    private void RequireWrite(string what)
    {
        if (!_allowWrite)
            throw new InvalidOperationException(
                $"「{what}」 GHI vào DB nhưng cờ seed của luồng đang tắt. " +
                "Bật cờ tương ứng trong testsettings.local.json.");
    }

    /// <summary>Chặn mọi thao tác ghi/xoá rơi ra ngoài vùng test.</summary>
    private static void RequireTestRange(int patNo)
    {
        if (patNo < TestPatNoBase)
            throw new InvalidOperationException(
                $"PAT_NO {patNo} nằm NGOÀI vùng bệnh nhân test (>= {TestPatNoBase}). " +
                "Lớp này chỉ được phép đụng vào bệnh nhân do chính nó dựng ra — " +
                "dữ liệu thật của phòng khám không bao giờ đi qua đây.");
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

    // ─────────────────────────────────────────────────────────────────────────
    // Cấp số
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Cấp một <c>PAT_NO</c> chưa ai dùng trong vùng test.
    ///
    /// <para>Lấy <c>max + 1</c> của vùng test chứ không phải một số cố định: hai
    /// lượt chạy chồng nhau (hoặc một lượt bị Ctrl+C chưa kịp dọn) vẫn không đụng
    /// số của nhau.</para>
    /// </summary>
    public int NextPatNo()
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT ISNULL(MAX(PAT_NO), {TestPatNoBase - 1}) + 1 FROM PERSON WHERE PAT_NO >= {TestPatNoBase}");
        var next = Convert.ToInt32(cmd.ExecuteScalar());
        return next < TestPatNoBase ? TestPatNoBase : next;
    }

    /// <summary>
    /// Bệnh nhân MẪU để clone: bệnh nhân thật có hồ sơ đầy đủ nhất.
    ///
    /// <para>Chọn theo tiêu chí 「có mặt ở nhiều bảng hồ sơ nhất」 chứ không hardcode
    /// một số: dev DB của tenant khác không chắc có bệnh nhân 10.</para>
    /// </summary>
    public int? FindTemplatePatNo()
    {
        using var con = Open();

        // EXISTS + TOP 1, KHÔNG tính điểm.
        //
        // ⚠️ Bản đầu xếp hạng bằng 11 subquery COUNT(*) rồi ORDER BY — trên dev DB
        //    (16331 bệnh nhân) nó chạy quá 3 phút và bị cắt (đo 2026-09-14, vế
        //    Postgres). Câu hỏi thật sự chỉ là 「bệnh nhân nào có ĐỦ hồ sơ」, mà EXISTS
        //    dừng ngay ở dòng đầu khớp — không cần biết ai đầy đủ NHẤT.
        var exists = string.Join(" AND ", ProfileTables
            .Where(t => !t.Equals("PERSON", StringComparison.OrdinalIgnoreCase))
            .Select(t => $"EXISTS (SELECT 1 FROM [{t}] x WHERE x.PAT_NO = p.PAT_NO)"));

        using (var cmd = Command(con,
            $"SELECT TOP 1 p.PAT_NO FROM PERSON p " +
            $"WHERE p.PAT_NO < {TestPatNoBase} AND {exists} ORDER BY p.PAT_NO"))
        {
            if (cmd.ExecuteScalar() is { } v and not DBNull) return Convert.ToInt32(v);
        }

        // Không ai có ĐỦ 11 bảng thì hạ yêu cầu xuống mức tối thiểu app cần để mở màn.
        using (var cmd = Command(con,
            $"SELECT TOP 1 p.PAT_NO FROM PERSON p " +
            $"WHERE p.PAT_NO < {TestPatNoBase} " +
            "AND EXISTS (SELECT 1 FROM INSURANCE i WHERE i.PAT_NO = p.PAT_NO) ORDER BY p.PAT_NO"))
        {
            var v = cmd.ExecuteScalar();
            return v is null or DBNull ? null : Convert.ToInt32(v);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dựng
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Kết quả một lần dựng — giữ để log ra và để <see cref="Drop"/> dọn.</summary>
    public sealed record Created(int PatNo, int TemplatePatNo, IReadOnlyDictionary<string, int> RowsPerTable)
    {
        public override string ToString() =>
            $"bệnh nhân test {PatNo} (clone từ {TemplatePatNo}) — " +
            string.Join(", ", RowsPerTable.Where(kv => kv.Value > 0).Select(kv => $"{kv.Key}:{kv.Value}"));
    }

    /// <summary>
    /// Dựng bệnh nhân mới bằng cách clone <paramref name="templatePatNo"/>.
    ///
    /// <para>Sau khi clone, bảo hiểm được kéo dài để chắc chắn bao ngày test:
    /// <c>MED_ST_DT</c> lùi về đầu tháng trước <paramref name="coverFrom"/> và
    /// <c>MED_ED_DT</c> đẩy tới <c>9999-12-31</c>. Không làm thế thì bệnh nhân mới
    /// thừa hưởng đúng khoảng hiệu lực của người mẫu, và màn 診療入力 từ chối mở ở
    /// ngày test.</para>
    /// </summary>
    public Created Create(int patNo, int templatePatNo, DateTime coverFrom)
    {
        RequireWrite("dựng bệnh nhân test");
        RequireTestRange(patNo);

        // Dựng lại từ đầu cho chắc: lượt trước bị cắt giữa chừng có thể để sót.
        Drop(patNo);

        var rows = new Dictionary<string, int>();
        using var con = Open();
        foreach (var table in ProfileTables)
            rows[table] = CloneTable(con, table, templatePatNo, patNo);

        ExtendInsurance(con, patNo, coverFrom);
        return new Created(patNo, templatePatNo, rows);
    }

    /// <summary>
    /// <c>INSERT … SELECT</c> đủ mọi cột của một bảng, chỉ thay <c>PAT_NO</c>.
    ///
    /// <para>Danh sách cột lấy động từ <c>INFORMATION_SCHEMA</c> và loại cột
    /// <c>IDENTITY</c> — chép cứng danh sách cột là đúng cái sai mà lớp này sinh ra
    /// để tránh.</para>
    /// </summary>
    private int CloneTable(SqlConnection con, string table, int fromPatNo, int toPatNo)
    {
        var cols = ColumnsOf(con, table);
        if (cols.Count == 0) return 0;

        var target = string.Join(", ", cols.Select(c => $"[{c}]"));
        var source = string.Join(", ", cols.Select(c =>
            c.Equals("PAT_NO", StringComparison.OrdinalIgnoreCase) ? "@to" : $"[{c}]"));

        using var cmd = Command(con,
            $"INSERT INTO [{table}] ({target}) SELECT {source} FROM [{table}] WHERE PAT_NO = @from");
        cmd.Parameters.Add("@to", SqlDbType.Int).Value = toPatNo;
        cmd.Parameters.Add("@from", SqlDbType.Int).Value = fromPatNo;
        return cmd.ExecuteNonQuery();
    }

    /// <summary>Cột của một bảng, đã loại cột IDENTITY (không được phép ghi thẳng).</summary>
    private List<string> ColumnsOf(SqlConnection con, string table)
    {
        using var cmd = Command(con,
            """
            SELECT c.name
              FROM sys.columns c
              JOIN sys.tables t ON t.object_id = c.object_id
             WHERE t.name = @t AND c.is_identity = 0 AND c.is_computed = 0
             ORDER BY c.column_id
            """);
        cmd.Parameters.Add("@t", SqlDbType.NVarChar, 128).Value = table;

        var cols = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read()) cols.Add(reader.GetString(0));
        return cols;
    }

    /// <summary>Kéo dài hiệu lực bảo hiểm để chắc chắn bao ngày test.</summary>
    private void ExtendInsurance(SqlConnection con, int patNo, DateTime coverFrom)
    {
        using var cmd = Command(con,
            "UPDATE INSURANCE SET MED_ST_DT = @st, MED_ED_DT = '9999-12-31' WHERE PAT_NO = @p");
        cmd.Parameters.Add("@st", SqlDbType.DateTime).Value =
            new DateTime(coverFrom.Year, coverFrom.Month, 1).AddMonths(-1);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dọn
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Xoá SẠCH một bệnh nhân test khỏi mọi bảng — cả hồ sơ lẫn dữ liệu phát sinh.
    ///
    /// <para>Chỉ chạy trong vùng test (<see cref="RequireTestRange"/>). Bảng nào
    /// không tồn tại thì bỏ qua chứ không làm hỏng cả lượt dọn: schema tenant khác
    /// có thể thiếu vài bảng phụ.</para>
    /// </summary>
    public IReadOnlyDictionary<string, int> Drop(int patNo)
    {
        RequireWrite("xoá bệnh nhân test");
        RequireTestRange(patNo);

        var deleted = new Dictionary<string, int>();
        using var con = Open();
        foreach (var table in GeneratedTables.Concat(ProfileTables.AsEnumerable().Reverse()))
        {
            try
            {
                using var cmd = Command(con, $"DELETE FROM [{table}] WHERE PAT_NO = @p");
                cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
                var n = cmd.ExecuteNonQuery();
                if (n > 0) deleted[table] = n;
            }
            catch (SqlException)
            {
                // Bảng không có / không có cột PAT_NO ở tenant này — không phải lỗi.
            }
        }
        return deleted;
    }

    /// <summary>
    /// Dọn MỌI bệnh nhân còn sót trong vùng test — lưới an toàn cho những lượt chạy
    /// bị Ctrl+C trước khi kịp <see cref="Drop"/>.
    ///
    /// <para>Gọi ở đầu lượt chạy, không phải cuối: nếu một lượt khác đang chạy song
    /// song thì dọn ở cuối sẽ giật mất bệnh nhân của nó.</para>
    /// </summary>
    public IReadOnlyList<int> DropLeftovers()
    {
        RequireWrite("dọn bệnh nhân test còn sót");

        var ids = new List<int>();
        using (var con = Open())
        using (var cmd = Command(con, $"SELECT PAT_NO FROM PERSON WHERE PAT_NO >= {TestPatNoBase}"))
        using (var reader = cmd.ExecuteReader())
            while (reader.Read()) ids.Add(reader.GetInt32(0));

        foreach (var id in ids) Drop(id);
        return ids;
    }

    /// <summary>Bệnh nhân test có tồn tại không — mốc để khẳng định <see cref="Drop"/> đã sạch.</summary>
    public bool Exists(int patNo)
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM PERSON WHERE PAT_NO = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
    }

    /// <summary>Số bản ghi còn lại của bệnh nhân trên mọi bảng — dùng để kiểm dọn sạch.</summary>
    public string DescribeRemaining(int patNo)
    {
        var sb = new StringBuilder();
        using var con = Open();
        foreach (var table in ProfileTables.Concat(GeneratedTables))
        {
            try
            {
                using var cmd = Command(con, $"SELECT COUNT(*) FROM [{table}] WHERE PAT_NO = @p");
                cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
                var n = Convert.ToInt32(cmd.ExecuteScalar());
                if (n > 0) sb.Append($"{table}:{n} ");
            }
            catch (SqlException) { /* bảng không có ở tenant này */ }
        }
        return sb.Length == 0 ? "(sạch)" : sb.ToString().TrimEnd();
    }
}
