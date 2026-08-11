using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.ParitySaveData;

/// <summary>
/// Truy vấn <b>CÓ GHI</b> phục vụ bộ test parity.
///
/// ─── Vì sao tách khỏi <see cref="OchaDb"/> ───────────────────────────────────
/// <see cref="OchaDb"/> tự nhận là "KHÔNG BAO GIỜ ghi" và cả bộ test cũ dựa vào lời hứa
/// đó (không cần dọn dẹp, app đóng là sạch). Bộ parity thì buộc phải ghi: nó bấm F9 登録
/// thật và còn phải giả lập "máy khác vừa lưu". Trộn hai thứ vào một lớp là xoá mất lời
/// hứa kia, nên để riêng — ai đọc tên lớp là biết ngay nó động vào dữ liệu.
///
/// ─── Chốt an toàn ───────────────────────────────────────────────────────────
/// Mọi thứ ở đây chỉ chạy khi <c>parity.allowSave = true</c>. Mặc định là false, và
/// <see cref="Require"/> ném ngay nếu quên bật. Đây là bản sao của quy ước
/// <c>TEST_ALLOW_SAVE=1</c> bên bộ Playwright.
///
/// ⚠️ CHỌN BỆNH NHÂN TEST, ĐỪNG TRỎ VÀO BỆNH NHÂN THẬT. F9 登録 ghi lại TOÀN BỘ 処置行
///    của tháng đó (xoá + chèn lại), và các hàm dưới đây còn sửa PERSON_EXP.
/// </summary>
public sealed class OchaDbParity
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private OchaDbParity(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    /// <summary>Null khi tắt DB, thiếu chuỗi kết nối, hoặc chưa bật <c>parity.allowSave</c>.</summary>
    public static OchaDbParity? CreateOrNull(TestSettings settings)
    {
        if (!settings.Parity.AllowSave) return null;
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new OchaDbParity(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    private SqlConnection Open()
    {
        var con = new SqlConnection(_connectionString);
        con.Open();
        return con;
    }

    private SqlCommand Cmd(SqlConnection con, string sql)
    {
        var c = con.CreateCommand();
        c.CommandText = sql;
        c.CommandTimeout = _commandTimeout;
        return c;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TRNTRN — đọc trạng thái tháng
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Số 処置行 của (患者, 診療月). Dùng để chứng minh "F9 bị từ chối thì DB không đổi".</summary>
    public int CountTrnRowsInMonth(int patNo, DateTime month)
    {
        var (from, to) = MonthRange(month);
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT COUNT(*) FROM TRNTRN WHERE pat_no = @p AND trt_dt BETWEEN @from AND @to");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>
    /// Vân tay của tháng: gộp mọi cột mà <c>CompareTrntrnData</c> đem ra so
    /// (modSave.cs:5213-5230). Đổi vân tay = DB đã đổi.
    /// </summary>
    public string FingerprintMonth(int patNo, DateTime month)
    {
        var (from, to) = MonthRange(month);
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT pat_br, insu_cd, trt_dt, disp_no, trt_cd, trt_sb, trt_cnt, trt_pt, price
              FROM TRNTRN
             WHERE pat_no = @p AND trt_dt BETWEEN @from AND @to
             ORDER BY trt_dt, disp_no, seq
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;

        var parts = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var cells = new object[reader.FieldCount];
            reader.GetValues(cells);
            parts.Add(string.Join(",", cells.Select(c => c?.ToString() ?? "")));
        }
        return string.Join(" | ", parts);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Giả lập "máy khác vừa lưu cùng tháng"
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Làm cho <c>CompareTrntrnData</c> thấy lệch, y như có máy thứ hai vừa bấm F9.
    ///
    /// <para>Cách làm: dời <c>disp_no</c> của dòng CÓ <c>disp_no</c> LỚN NHẤT lên +1000.
    /// <c>CompareTrntrnData</c> kiểm <c>disp_no</c> tường minh (modSave.cs:5227) nên phát
    /// hiện được ngay.</para>
    ///
    /// <para><b>⚠️ Phải là dòng CUỐI, không được là dòng đầu.</b> Lưới nạp theo
    /// <c>ORDER BY trt_dt, disp_no</c>, nên dời dòng ĐẦU lên +1000 sẽ đẩy nó xuống cuối
    /// lưới — và nếu sau đó có một lượt ghi đè (Tc2d2), thứ tự sai đó bị <b>đóng đinh
    /// vĩnh viễn</b> vào DB vì F9 lưu đúng thứ tự đang thấy trên lưới. Đã vấp thật:
    /// 「歯科初診料」 của bệnh nhân test nhảy từ disp_no 1 xuống 8 và phải sửa tay.
    /// Dời dòng cuối thì nó vẫn ở cuối ⇒ thứ tự không đổi.</para>
    ///
    /// <para>Vì sao không INSERT thêm dòng: TRNTRN có ~80 cột NOT NULL, dựng một dòng hợp lệ
    /// từ test là mong manh và dễ để lại rác nếu test chết giữa chừng. UPDATE một cột số
    /// nguyên thì hoàn tác được chính xác bằng <see cref="UndoSimulatedRemoteSave"/>.</para>
    /// </summary>
    /// <returns>Token để hoàn tác. Null nghĩa là tháng không có dòng nào để dời.</returns>
    public RemoteSaveSimulation? SimulateRemoteSave(int patNo, DateTime month)
    {
        var (from, to) = MonthRange(month);
        using var con = Open();

        int dispNo;
        DateTime trtDt;
        int seq;

        using (var pick = Cmd(con,
            """
            SELECT TOP 1 trt_dt, disp_no, seq
              FROM TRNTRN
             WHERE pat_no = @p AND trt_dt BETWEEN @from AND @to
             ORDER BY trt_dt DESC, disp_no DESC, seq DESC
            """))
        {
            pick.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            pick.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
            pick.Parameters.Add("@to", SqlDbType.DateTime).Value = to;

            using var reader = pick.ExecuteReader();
            if (!reader.Read()) return null;
            trtDt = Convert.ToDateTime(reader["trt_dt"]);
            dispNo = Convert.ToInt32(reader["disp_no"]);
            seq = Convert.ToInt32(reader["seq"]);
        }

        var shifted = dispNo + 1000;
        using (var upd = Cmd(con,
            "UPDATE TRNTRN SET disp_no = @new WHERE pat_no = @p AND trt_dt = @d AND disp_no = @old AND seq = @s"))
        {
            upd.Parameters.Add("@new", SqlDbType.Int).Value = shifted;
            upd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            upd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt;
            upd.Parameters.Add("@old", SqlDbType.Int).Value = dispNo;
            upd.Parameters.Add("@s", SqlDbType.Int).Value = seq;
            upd.ExecuteNonQuery();
        }

        return new RemoteSaveSimulation(patNo, trtDt, dispNo, shifted, seq);
    }

    /// <summary>Trả <c>disp_no</c> về giá trị cũ. Gọi trong teardown, kể cả khi test đỏ.</summary>
    public void UndoSimulatedRemoteSave(RemoteSaveSimulation sim)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "UPDATE TRNTRN SET disp_no = @old WHERE pat_no = @p AND trt_dt = @d AND disp_no = @new AND seq = @s");
        cmd.Parameters.Add("@old", SqlDbType.Int).Value = sim.OriginalDispNo;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = sim.PatNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = sim.TrtDt;
        cmd.Parameters.Add("@new", SqlDbType.Int).Value = sim.ShiftedDispNo;
        cmd.Parameters.Add("@s", SqlDbType.Int).Value = sim.Seq;
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Tập <c>seq</c> của mọi dòng trong tháng — ảnh chụp để nhận ra dòng nào do lượt
    /// chạy này sinh ra. <c>seq</c> là số tăng dần toàn cục nên dòng mới luôn có giá trị
    /// chưa từng thấy.
    /// </summary>
    public HashSet<int> SnapshotSeqs(int patNo, DateTime month)
    {
        var (from, to) = MonthRange(month);
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT seq FROM TRNTRN WHERE pat_no = @p AND trt_dt BETWEEN @from AND @to");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = to;

        var seqs = new HashSet<int>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) seqs.Add(Convert.ToInt32(r["seq"]));
        return seqs;
    }

    /// <summary>
    /// Xoá những dòng KHÔNG có trong ảnh chụp — tức các dòng do lượt chạy này thêm vào.
    ///
    /// <para>Không có bước này thì mỗi lần chạy lại cộng thêm một dòng 再診 vào tháng của
    /// bệnh nhân test, và sau chục lượt thì dữ liệu chẳng còn giống ban đầu nữa.</para>
    ///
    /// <para>⚠️ Chỉ xoá thêm-mới. Thứ tự <c>disp_no</c> bị F9 đánh số lại thì KHÔNG khôi
    /// phục được từ đây — đó là lý do <see cref="SimulateRemoteSave"/> phải dời dòng cuối
    /// chứ không phải dòng đầu.</para>
    /// </summary>
    /// <returns>Số dòng đã xoá.</returns>
    public int DeleteRowsAddedSince(int patNo, DateTime month, HashSet<int> snapshot)
    {
        var (from, to) = MonthRange(month);
        using var con = Open();

        var toDelete = new List<int>();
        using (var pick = Cmd(con,
            "SELECT seq FROM TRNTRN WHERE pat_no = @p AND trt_dt BETWEEN @from AND @to"))
        {
            pick.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            pick.Parameters.Add("@from", SqlDbType.DateTime).Value = from;
            pick.Parameters.Add("@to", SqlDbType.DateTime).Value = to;
            using var r = pick.ExecuteReader();
            while (r.Read())
            {
                var seq = Convert.ToInt32(r["seq"]);
                if (!snapshot.Contains(seq)) toDelete.Add(seq);
            }
        }

        if (toDelete.Count == 0) return 0;

        using var del = Cmd(con,
            $"DELETE FROM TRNTRN WHERE pat_no = @p AND seq IN ({string.Join(",", toDelete)})");
        del.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return del.ExecuteNonQuery();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BNOW / MISOU — cho BUG-2a, 2b, 2c
    // ═══════════════════════════════════════════════════════════════════════

    public int CountBnow(int patNo) => CountByPatNo("BNOW", patNo);

    public int CountMisou(int patNo) => CountByPatNo("MISOU", patNo);

    /// <summary>Xoá hẳn dòng BNOW của bệnh nhân — dựng tiền đề cho BUG-2c.</summary>
    public void DeleteBnow(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "DELETE FROM BNOW WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
    }

    /// <summary>Ô 42 của BNOW = cột <c>rn_11</c> — nơi hai nhánh răng sữa đụng nhau (BUG-2a).</summary>
    public string ReadBnowSlot42(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT TOP 1 rn11 FROM BNOW WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return cmd.ExecuteScalar()?.ToString() ?? "(khong co dong BNOW)";
    }

    private int CountByPatNo(string table, int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, $"SELECT COUNT(*) FROM {table} WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PERSON_EXP — cho ISSUE-1
    // ═══════════════════════════════════════════════════════════════════════

    public (int DepDue, int InsDueBal)? ReadPersonExp(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT TOP 1 dep_due, ins_due_bal FROM PERSON_EXP WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;
        return (ToInt(reader["dep_due"]), ToInt(reader["ins_due_bal"]));
    }

    /// <summary>Đặt số dư ban đầu cho kịch bản ISSUE-1.</summary>
    public void SetPersonExp(int patNo, int depDue, int insDueBal)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "UPDATE PERSON_EXP SET dep_due = @dep, ins_due_bal = @ins WHERE pat_no = @p");
        cmd.Parameters.Add("@dep", SqlDbType.Int).Value = depDue;
        cmd.Parameters.Add("@ins", SqlDbType.Int).Value = insDueBal;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.ExecuteNonQuery();
    }

    // ═══════════════════════════════════════════════════════════════════════

    private static (DateTime From, DateTime To) MonthRange(DateTime month)
    {
        var from = new DateTime(month.Year, month.Month, 1);
        return (from, from.AddMonths(1).AddDays(-1));
    }

    private static int ToInt(object v) => v is DBNull or null ? 0 : Convert.ToInt32(v);
}

/// <summary>Token hoàn tác của <see cref="OchaDbParity.SimulateRemoteSave"/>.</summary>
public sealed record RemoteSaveSimulation(
    int PatNo, DateTime TrtDt, int OriginalDispNo, int ShiftedDispNo, int Seq);
