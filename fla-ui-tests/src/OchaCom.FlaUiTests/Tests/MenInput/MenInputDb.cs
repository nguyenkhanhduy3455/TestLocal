using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MenInput;

/// <summary>
/// Truy vấn CHỈ ĐỌC cho luồng 面入力 — hai cái cổng mà UI không nói ra được.
///
/// <list type="number">
///   <item><b>Cổng cấu hình:</b> <c>INPCONFIG.MENINPUT_FLG</c>. App nạp nó vào
///     <c>ModCommon.pInpOpt[6]</c> đúng một lần (modCommon.cs:473) và
///     <c>frm203016.cs:1567</c> đọc mảng trong RAM. Cờ tắt ⇒ 面入力 KHÔNG BAO GIỜ mở,
///     và testcase đỏ sẽ trông y hệt 「WinForm hỏng」. Hỏi DB là cách duy nhất phân biệt
///     「app sai」 với 「máy này tắt tính năng」.</item>
///   <item><b>Cổng master:</b> cột <c>men</c> của bảng <c>MST_TRTxxx</c> đang áp dụng.
///     <c>men = 1</c> mở 面入力, <c>men = 2</c> mở 部位選択 (frm902003, ngoài phạm vi),
///     <c>men = 0</c> không mở gì. Cặp 枝番 A/B đem đối chứng KHÔNG hard-code: hỏi thẳng
///     master để tìm một <c>trt_cd</c> chứa CẢ men=1 LẪN men=0 — hai phía nằm trong CÙNG
///     một hộp thoại 処置選択 nên chỉ tốn một lần gõ mã cho mỗi phía.</item>
/// </list>
///
/// <para>Đo trên SIM2000 của máy test ngày 2026-09-03 (master <c>MST_TRT266</c>):
/// <c>MENINPUT_FLG = 1</c>; 26 dòng <c>men = 1</c>, <b>không</b> dòng nào <c>men = 2</c>;
/// 7 mã có cả hai phía (250, 251, 254, 256, 258, 326, 342). Mã <b>326</b> giống hệt bên
/// bản web: <c>326-3</c> 光ＣＲ充(複雑) men=1 và <c>326-1</c> 充填１(単純) men=0.</para>
///
/// <para>⚠️ Lớp này KHÔNG BAO GIỜ ghi. Cả luồng 面入力 cũng không bấm F9 登録 — kết quả
/// đọc thẳng từ cột ẩn 72 của lưới (xem <see cref="MenInputFlow"/>).</para>
/// </summary>
public sealed class MenInputDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private MenInputDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static MenInputDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new MenInputDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    /// <summary>
    /// <c>INPCONFIG.MENINPUT_FLG</c> — 診療入力設定「面入力する」. null = không có dòng
    /// <c>KEY_ID = 1</c> (InpConfig.cs:87-88).
    /// </summary>
    public int? MenInputFlg()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT MENINPUT_FLG FROM INPCONFIG WHERE KEY_ID = 1");
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? null : Convert.ToInt32(v);
    }

    /// <summary>
    /// Tên bảng master áp dụng cho ngày đó, lấy từ <c>TRT_SEL</c> — đúng bảng mà app đọc
    /// (TrtSel.cs:21-51). Chép lại từ <see cref="Data.OchaDb.ActiveTrtTable"/> vì lớp kia
    /// không phơi ra <c>Open()</c>; cả hai đều chỉ đọc.
    /// </summary>
    public string ActiveTrtTable(DateTime date)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT TOP 1 MTBL_NM
              FROM TRT_SEL
             WHERE START_DT <= @d
               AND (END_DT >= @d OR END_DT IS NULL)
             ORDER BY START_DT DESC
            """);
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;

        var name = cmd.ExecuteScalar() as string;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException(
                $"TRT_SEL không có bản master nào phủ ngày {date:yyyy-MM-dd}.");

        // Tên bảng phải nối chuỗi vào SQL (không tham số hoá được), nên chặn ở đây.
        if (!Regex.IsMatch(name, "^MST[A-Za-z0-9_]*$"))
            throw new InvalidOperationException($"Tên bảng master lạ trong TRT_SEL: 「{name}」");

        return name;
    }

    /// <summary>Một dòng master mà luồng này quan tâm.</summary>
    public sealed record TrtVariant(int TrtCd, int TrtSb, int Men, string Name)
    {
        public override string ToString() => $"{TrtCd}-{TrtSb} men={Men} 「{Name}」";
    }

    /// <summary>Cặp A/B trong CÙNG một mã: một 枝番 <c>men=1</c> và một 枝番 <c>men=0</c>.</summary>
    public sealed record MenPair(string Table, TrtVariant WithMen, TrtVariant WithoutMen)
    {
        public int TrtCd => WithMen.TrtCd;

        public override string ToString() =>
            $"[{Table}] mã {TrtCd}: men=1 → {WithMen.TrtSb} 「{WithMen.Name}」, " +
            $"men=0 → {WithoutMen.TrtSb} 「{WithoutMen.Name}」";
    }

    /// <summary>
    /// Tìm cặp A/B để đối chứng. <paramref name="preferTrtCd"/> được ưu tiên nếu nó thoả
    /// (mặc định 326 — cùng mã mà spec Playwright dùng, để hai bên đối chiếu được).
    ///
    /// <para>Điều kiện <c>RIGHT(RTRIM(trt_nm),1) &lt;&gt; '!'</c> là đúng điều kiện app dùng
    /// khi nạp danh sách (modKobetu.cs:181-185) — bỏ nó thì có thể chọn phải dòng không
    /// bao giờ hiện trong 処置選択.</para>
    /// </summary>
    public MenPair? FindMenPair(DateTime date, int preferTrtCd = 326)
    {
        var table = ActiveTrtTable(date);

        using var con = Open();
        using var cmd = Command(con,
            $"""
             SELECT a.trt_cd, a.trt_sb, a.men, RTRIM(ISNULL(a.trt_nm, '')) AS nm
               FROM {table} a
              WHERE a.men IN (0, 1)
                AND RIGHT(RTRIM(ISNULL(a.trt_nm, ' ')), 1) <> '!'
                AND a.trt_cd IN (
                      SELECT b.trt_cd FROM {table} b
                       WHERE b.men = 1 AND RIGHT(RTRIM(ISNULL(b.trt_nm, ' ')), 1) <> '!'
                      INTERSECT
                      SELECT c.trt_cd FROM {table} c
                       WHERE c.men = 0 AND RIGHT(RTRIM(ISNULL(c.trt_nm, ' ')), 1) <> '!')
              ORDER BY a.trt_cd, a.men DESC, a.trt_sb
             """);

        var byCode = new Dictionary<int, List<TrtVariant>>();
        using (var reader = cmd.ExecuteReader())
        {
            while (reader.Read())
            {
                var v = new TrtVariant(Convert.ToInt32(reader["trt_cd"]),
                                       Convert.ToInt32(reader["trt_sb"]),
                                       Convert.ToInt32(reader["men"]),
                                       reader["nm"].ToString() ?? "");
                if (!byCode.TryGetValue(v.TrtCd, out var list)) byCode[v.TrtCd] = list = [];
                list.Add(v);
            }
        }

        var codes = byCode.Keys.OrderBy(c => c == preferTrtCd ? 0 : 1).ThenBy(c => c).ToList();
        foreach (var code in codes)
        {
            var list = byCode[code];
            var withMen = list.FirstOrDefault(v => v.Men == 1);
            var withoutMen = list.FirstOrDefault(v => v.Men == 0);
            if (withMen is not null && withoutMen is not null)
                return new MenPair(table, withMen, withoutMen);
        }
        return null;
    }

    /// <summary>Bao nhiêu dòng master mang từng giá trị <c>men</c> — để in vào nhật ký.</summary>
    public IReadOnlyList<string> MenHistogram(DateTime date)
    {
        var table = ActiveTrtTable(date);
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT men, COUNT(*) AS n FROM {table} GROUP BY men ORDER BY men");

        var lines = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            lines.Add($"men={reader["men"]} n={reader["n"]}");
        return lines;
    }
}
