using System.Data;
using System.Text;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.GuideSidePanel;

/// <summary>
/// Chụp / in / trả lại bảng <c>TRTSTATE</c> — bảng DUY NHẤT mà nút 「リセット」 của tab
/// ガイド ghi vào (<c>frm203002.StepReset</c> → <c>TrtState.updateTrtState</c>,
/// frm203002.cs:6646-6677).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO LUỒNG PROBE NÀY CẦN GHI (và nó ghi ít tới mức nào)
/// ═══════════════════════════════════════════════════════════════════════════════
/// Câu hỏi 1.4 của lượt đo là 「bấm OK ở kịch bản KHÔNG có 病名 thì màn hình ra sao」 —
/// không bấm OK thì không trả lời được. Đường đi sau cú OK:
/// <code>
/// StepReset()
///   val = editStringToInt(hFG1[40, dòng ĐANG CÓ CON TRỎ])   ← DIS_CD1 của CHÍNH dòng đó
///   for i in 0..31: nếu hFG1[8+i] != "0" → setResetData(val, i, ref data)
///   setResetData: switch(val) { case 100/390 … ; default: break; }   ← val = 0 rơi vào default
///   updateTrtState(data)                                     ← UPDATE với data KHÔNG ĐỔI
/// </code>
/// Tức là ở kịch bản 「dòng không có 病名」 câu <c>UPDATE</c> vẫn chạy nhưng ghi lại
/// ĐÚNG những giá trị vừa đọc lên. Lớp này tồn tại để <b>chứng minh</b> điều đó bằng số
/// đo (chụp trước — chụp sau — so), chứ không phải để suy từ source.
///
/// <para>⚠️ Ở kịch bản CÓ 病名 thì cú OK xoá thật (<c>bui1[idx] = 0</c>). Vì thế
/// <see cref="GuideResetProbeTests"/> <b>không bao giờ</b> bấm OK ở kịch bản đó, dù có
/// bật cờ nào.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// AN TOÀN (F20)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>Cờ riêng</b> <c>OCHA_GUIDE_RESET_ALLOW_OK=1</c>, mặc định tắt ⇒ probe chỉ
///     ĐỌC câu hỏi rồi trả lời キャンセル. Cờ nằm ở biến môi trường chứ không ở
///     <c>testsettings.json</c> có chủ ý: máy Windows đang có bản <c>TestSettings.cs</c>
///     sửa dở của luồng khác, thêm mục mới vào đó là kéo theo một lần trộn file không
///     liên quan gì tới phép đo này.</item>
///   <item><b>Chụp — IN RA STDOUT — trả lại.</b> In nguyên trạng TRƯỚC khi bấm OK, để bị
///     Ctrl+C giữa chừng thì còn dựng lại bằng tay từ log.</item>
///   <item><b>Trả lại theo DIFF</b>, không ghi đè cả 480 cột: chỉ <c>UPDATE</c> đúng
///     những ô đã đổi. Một câu <c>UPDATE</c> 480 cột mà sai một ô là hỏng dữ liệu của
///     bệnh nhân test theo cách không ai truy ra được.</item>
///   <item><b>Chỉ đụng ĐÚNG MỘT <c>PAT_NO</c></b> — của <c>patient.patNo</c>.</item>
/// </list>
/// </summary>
public sealed class GuideResetDb
{
    /// <summary>Biến môi trường mở nhánh bấm OK. Xem mục AN TOÀN điểm 1.</summary>
    public const string AllowOkEnvVar = "OCHA_GUIDE_RESET_ALLOW_OK";

    /// <summary>15 nhóm × 32 slot — đúng hình dạng <c>TrtState.TrtStateData</c>.</summary>
    public const int GroupCount = 15;

    public const int SlotCount = 32;

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private GuideResetDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static GuideResetDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new GuideResetDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    /// <summary>Cờ cho phép bấm OK — đọc từ biến môi trường, mặc định TẮT.</summary>
    public static bool AllowOk =>
        (Environment.GetEnvironmentVariable(AllowOkEnvVar) ?? "").Trim() is "1" or "true" or "True";

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

    /// <summary>Tên cột thật của ô (nhóm 1-based, slot 1-based) — <c>BUI3_17</c>…</summary>
    public static string ColumnName(int group, int slot) => $"BUI{group}_{slot}";

    /// <summary>Mọi tên cột của <c>TRTSTATE</c> theo đúng thứ tự nhóm/slot.</summary>
    public static IEnumerable<string> AllColumns()
    {
        for (var g = 1; g <= GroupCount; g++)
            for (var s = 1; s <= SlotCount; s++)
                yield return ColumnName(g, s);
    }

    /// <summary>
    /// Một lượt chụp <c>TRTSTATE</c> của một bệnh nhân.
    /// </summary>
    /// <param name="Exists">
    /// Bệnh nhân có dòng trong <c>TRTSTATE</c> hay không. Ghi lại vì
    /// <c>TrtState.updateTrtState</c> (TrtState.cs:1677-1690) là <c>UPDATE</c> THUẦN —
    /// không có <c>INSERT</c> nào trên đường リセット. Bệnh nhân chưa có dòng thì cú OK
    /// sửa <b>0 dòng</b> và mọi phép so ở đây cũng phải ra 「không lệch」; đó là hai kết
    /// luận khác nhau và cột này là thứ phân biệt chúng.
    /// </param>
    public sealed record Snapshot(int PatNo, bool Exists, IReadOnlyDictionary<string, int> Cells)
    {
        /// <summary>Chỉ những ô KHÁC 0 — bản in gọn để dán vào log.</summary>
        public string Describe()
        {
            if (!Exists) return "(KHÔNG có dòng TRTSTATE nào cho bệnh nhân này)";
            var hot = Cells.Where(kv => kv.Value != 0).Select(kv => $"{kv.Key}={kv.Value}").ToList();
            return hot.Count == 0 ? "(có dòng, nhưng MỌI ô đều = 0)" : string.Join(" ", hot);
        }
    }

    public Snapshot Capture(int patNo)
    {
        var columns = AllColumns().ToList();
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT {string.Join(", ", columns)} FROM TRTSTATE WHERE PAT_NO = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return new Snapshot(patNo, false, new Dictionary<string, int>());

        var cells = new Dictionary<string, int>(columns.Count);
        for (var i = 0; i < columns.Count; i++)
            cells[columns[i]] = reader.IsDBNull(i) ? 0 : Convert.ToInt32(reader.GetValue(i));

        return new Snapshot(patNo, true, cells);
    }

    /// <summary>Các ô đã đổi giữa hai lượt chụp — rỗng nghĩa là cú OK không ghi gì.</summary>
    public static IReadOnlyList<string> Diff(Snapshot before, Snapshot after)
    {
        var lines = new List<string>();
        if (before.Exists != after.Exists)
            lines.Add($"DÒNG TRTSTATE: tồn tại {before.Exists} → {after.Exists}");

        foreach (var column in AllColumns())
        {
            before.Cells.TryGetValue(column, out var b);
            after.Cells.TryGetValue(column, out var a);
            if (b != a) lines.Add($"{column}: {b} → {a}");
        }
        return lines;
    }

    /// <summary>
    /// Trả <c>TRTSTATE</c> về đúng lượt chụp <paramref name="original"/> — chỉ
    /// <c>UPDATE</c> những ô đang lệch.
    ///
    /// <para>Trả về mô tả việc đã làm để in vào log. Không có gì lệch thì KHÔNG chạy câu
    /// nào — một lượt chạy sạch phải không để lại dấu vết nào cả, kể cả một
    /// <c>UPDATE</c> vô hại.</para>
    /// </summary>
    public string Restore(Snapshot original)
    {
        var now = Capture(original.PatNo);
        var diff = Diff(original, now);
        if (diff.Count == 0) return "TRTSTATE không lệch — không cần trả lại gì.";

        if (!original.Exists)
            return "⚠️ KHÔNG trả lại được: lúc chụp bệnh nhân CHƯA có dòng TRTSTATE, mà giờ đã có — " +
                   "nghĩa là có một đường GHI KHÁC ngoài StepReset (updateTrtState là UPDATE thuần, " +
                   "TrtState.cs:1677). Probe không xoá dòng nào; dọn bằng tay. " +
                   "Lệch: " + string.Join(" · ", diff);

        var changed = AllColumns()
            .Where(c =>
            {
                original.Cells.TryGetValue(c, out var o);
                now.Cells.TryGetValue(c, out var n);
                return o != n;
            })
            .ToList();

        var sql = new StringBuilder("UPDATE TRTSTATE SET ");
        sql.Append(string.Join(", ", changed.Select((c, i) => $"{c} = @v{i}")));
        sql.Append(" WHERE PAT_NO = @p");

        using var con = Open();
        using var cmd = Command(con, sql.ToString());
        for (var i = 0; i < changed.Count; i++)
            cmd.Parameters.Add($"@v{i}", SqlDbType.SmallInt).Value = (short)original.Cells[changed[i]];
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = original.PatNo;

        var rows = cmd.ExecuteNonQuery();
        return $"đã trả lại {changed.Count} ô ({rows} dòng): " + string.Join(" · ", diff);
    }
}
