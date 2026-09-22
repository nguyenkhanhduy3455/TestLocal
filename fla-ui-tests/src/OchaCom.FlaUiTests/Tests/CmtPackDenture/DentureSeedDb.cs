using System.Data;
using System.Text;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.CmtPackDenture;

/// <summary>
/// Đọc master + seed <b>một dòng 歯周病検査</b> vào <c>TRNTRN</c> để dựng/gỡ tiền đề
/// 「còn 現存歯」 của pack <c>B000-4</c> (歯管-有床義歯), rồi dọn lại ở
/// <c>OneTimeTearDown</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO DÒNG SEED PHẢI MANG 病名 Ｐ VÀ 部位 KHÁC 0
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>CmtAuto.getPlaqueTeeth</c> (CmtAuto.cs:1978-2035) KHÔNG nhận mọi dòng 歯周病検査.
/// Nó gọi:
/// <code>
///   CommonChk.getTreatDataTeethDis(ModSave.trtDataList, getMainDt(),
///                                  kvPlaqueTest, null, new int[]{103, 104}, ...)
///                                                          ↑ Ｐ, 単Ｇ
/// </code>
/// tức dòng phải thoả <b>cả ba</b>:
/// <list type="number">
///   <item><c>trt_cd/trt_sb</c> nằm trong <c>kvPlaqueTest</c> (CmtAuto.cs:1981-2021) —
///     mặc định luồng này dùng <b>121/4</b> Ｐ精検（２０歯以上）;</item>
///   <item><b>một trong <c>dis_cd1..10</c> phải là 103 (Ｐ) hoặc 104 (単Ｇ)</b> —
///     CommonChk.cs (vòng <c>duplication</c>); dòng seed KHÔNG mang 病名 thì hàm trả
///     <c>null</c> và pack sẽ HIỆN, tức là đo được kết quả <b>ngược</b> mà vẫn xanh;</item>
///   <item><b>ít nhất một <c>bui</c> khác 0</b>, và răng đó <b>không</b> bị <c>SIGA</c>
///     đánh 欠損 — <c>UpdMissingTooth</c> (CmtAuto.cs:2048-2100) xoá trắng mọi ô 部位 mà
///     <c>se&lt;n&gt; = 4</c> TRƯỚC khi vòng 「có 現存歯 không」 chạy.</item>
/// </list>
///
/// <para>⚠️ Vì điểm 3, <b>chọn răng theo SIGA của chính bệnh nhân</b>, đừng hard-code.
/// Bệnh nhân 10 có <c>se4 = se5 = se6 = 4</c> — seed 部位 vào đúng ba răng đó thì
/// <c>UpdMissingTooth</c> xoá sạch, <c>bui</c> toàn 0, và pack vẫn HIỆN: ca 「có 現存歯」
/// biến thành ca 「không có」 mà không có dấu hiệu gì. <see cref="MissingTeethSlots"/>
/// có sẵn để testcase tự tránh.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// AN TOÀN (F20, F22)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>Cờ riêng</b> <c>cmtPackDenture.allowSeed</c>, mặc định tắt ⇒ fixture tự
///     <c>Ignore</c> TRƯỚC khi mở app.</item>
///   <item><b>Dải <c>disp_no</c> riêng 9200..9299</b> — tách khỏi 9100..9199 của
///     <c>CmtPackExitFlg</c> và khỏi dòng 再初診 cố định ở <c>disp_no = 9001</c>.
///     <c>DELETE</c> chặn cứng trong dải.</item>
///   <item><b>Chụp — IN RA STDOUT — trả lại.</b></item>
///   <item><b>Không bấm F9 登録.</b> Dòng testcase gõ chỉ nằm trong lưới đang mở.</item>
/// </list>
/// </summary>
public sealed class DentureSeedDb
{
    /// <summary>Đầu dải <c>disp_no</c> của luồng này — xem mục AN TOÀN điểm 2.</summary>
    public const int SeedDispBase = 9200;

    /// <summary>Cuối dải — <c>DELETE</c> không bao giờ ra ngoài <c>[9200, 9299]</c>.</summary>
    public const int SeedDispMax = 9299;

    /// <summary>Ｐ — <c>dis_cd</c> mà <c>getPlaqueTeeth</c> hard-code (CmtAuto.cs:2025).</summary>
    public const int DisCdP = 103;

    /// <summary>Ｐ精検（２０歯以上） — dòng 歯周病検査 mặc định của luồng.</summary>
    public const int PlaqueTrtCd = 121;

    /// <inheritdoc cref="PlaqueTrtCd"/>
    public const int PlaqueTrtSb = 4;

    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowSeed;
    private int _next = SeedDispBase;

    private DentureSeedDb(string connectionString, int commandTimeout, bool allowSeed)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
        _allowSeed = allowSeed;
    }

    public static DentureSeedDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new DentureSeedDb(db.ConnectionString, db.CommandTimeoutSeconds,
                                 settings.CmtPackDenture.AllowSeed);
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
                $"{what}: cần cmtPackDenture.allowSeed = true trong testsettings(.local).json. " +
                "Fixture đáng lẽ đã tự Ignore TRƯỚC khi mở app — đỏ ở đây là lỗi HARNESS.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Master — đọc, để ca đo khoá được tiền đề mà không phải mở app
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Bảng 病名 đang hiệu lực cho <paramref name="on"/> (<c>DIS_SEL</c>).</summary>
    public string DiseaseTable(DateTime on)
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT TOP 1 TBL_NM FROM DIS_SEL WHERE ST_DT <= @d AND ED_DT >= @d");
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = on.Date;
        return cmd.ExecuteScalar() as string is { } s && s.StartsWith("MST") ? s.Trim() : "MST_DIS991";
    }

    /// <summary>Một 病名 của master: <c>dis_cd</c> → <c>dis_kbn</c> + tên.</summary>
    public sealed record DiseaseRow(int DisCd, int DisKbn, string DisNm)
    {
        public override string ToString() => $"dis_cd {DisCd} 「{DisNm}」 dis_kbn = {DisKbn}";
    }

    /// <summary><c>dis_kbn</c> + tên của một <c>dis_cd</c> trên bảng đang hiệu lực.</summary>
    public DiseaseRow? Disease(int disCd, DateTime on)
    {
        var tbl = DiseaseTable(on);
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT TOP 1 DIS_CD, DIS_KBN, DIS_NM FROM {tbl} WHERE DIS_CD = @c AND DIS_SB = 0");
        cmd.Parameters.Add("@c", SqlDbType.Int).Value = disCd;
        using var r = cmd.ExecuteReader();
        return r.Read()
            ? new DiseaseRow(Convert.ToInt32(r["DIS_CD"]), Convert.ToInt32(r["DIS_KBN"]),
                             (r["DIS_NM"] as string ?? "").Trim())
            : null;
    }

    /// <summary>Số 病名 <c>dis_sb = 0</c> mang từng <c>dis_kbn</c> trong dải 51..60.</summary>
    public IReadOnlyDictionary<int, int> DiseaseKbnCounts(DateTime on)
    {
        var tbl = DiseaseTable(on);
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT DIS_KBN, COUNT(*) n FROM {tbl} WHERE DIS_SB = 0 " +
            "AND DIS_KBN BETWEEN 51 AND 60 GROUP BY DIS_KBN");
        var map = new Dictionary<int, int>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) map[Convert.ToInt32(r["DIS_KBN"])] = Convert.ToInt32(r["n"]);
        return map;
    }

    /// <summary>
    /// Số dòng 歯周病検査 <b>đủ tư cách</b> (mã trong <c>kvPlaqueTest</c> + mang 病名
    /// 103/104 + có 部位) mà bệnh nhân đã có, <b>ngoài dải seed</b>.
    ///
    /// <para>Đây là tiền đề của mọi ca 「không có 現存歯」: khác 0 thì bệnh nhân đã tự có
    /// 現存歯 và ca đo sẽ kết luận NGƯỢC mà vẫn xanh.</para>
    /// </summary>
    public int QualifyingPlaqueRows(int patNo)
    {
        var bui = string.Join(" OR ", Enumerable.Range(1, 32).Select(i => $"BUI{i} <> 0"));
        var dis = string.Join(" OR ", Enumerable.Range(1, 10).Select(i => $"DIS_CD{i} IN (103, 104)"));
        using var con = Open();
        using var cmd = Command(con,
            $"""
             SELECT COUNT(*) FROM TRNTRN
              WHERE PAT_NO = @p AND DEL_FLG = 0
                AND DISP_NO NOT BETWEEN {SeedDispBase} AND {SeedDispMax}
                AND ( (TRT_CD = 120 AND TRT_SB IN (6,7))
                   OR (TRT_CD = 121 AND TRT_SB BETWEEN 2 AND 7)
                   OR (TRT_CD = 124 AND TRT_SB BETWEEN 1 AND 6)
                   OR (TRT_CD = 167 AND TRT_SB IN (1,2,3,8,9,10))
                   OR (TRT_CD = 597 AND TRT_SB = 0)
                   OR (TRT_CD = 598 AND TRT_SB IN (8,9,10))
                   OR (TRT_CD = 135 AND TRT_SB IN (3,11))
                   OR (TRT_CD = 137 AND TRT_SB BETWEEN 0 AND 11)
                   OR (TRT_CD = 138 AND TRT_SB = 0)
                   OR (TRT_CD = 140 AND TRT_SB IN (0,1)) )
                AND ({dis})
                AND ({bui})
             """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>
    /// Các ô 部位 (1..32) mà <c>SIGA</c> đánh <b>欠損</b> (<c>se&lt;n&gt; = 4</c>) —
    /// testcase phải TRÁNH chúng khi seed 部位, xem phần đầu lớp.
    /// </summary>
    public IReadOnlyList<int> MissingTeethSlots(int patNo)
    {
        var cols = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"SE{i}"));
        using var con = Open();
        using var cmd = Command(con, $"SELECT TOP 1 {cols} FROM SIGA WHERE PAT_NO = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return [];
        var slots = new List<int>();
        for (var i = 1; i <= 32; i++)
        {
            var v = r[$"SE{i}"];
            if (v != DBNull.Value && Convert.ToInt32(v) == 4) slots.Add(i);
        }
        return slots;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Chụp nguyên trạng
    // ═════════════════════════════════════════════════════════════════════════

    public sealed record Row(int Seq, DateTime TrtDt, int DispNo, int TrtCd, int TrtSb,
                             int TrtPt, string DspTrt)
    {
        public override string ToString() =>
            $"seq {Seq} · {TrtDt:yyyy-MM-dd} disp {DispNo} · {TrtCd}/{TrtSb} {TrtPt}点 「{DspTrt}」";
    }

    /// <summary>Mọi dòng của bệnh nhân trong tháng của <paramref name="anyDayOfMonth"/>.</summary>
    public IReadOnlyList<Row> MonthRows(int patNo, DateTime anyDayOfMonth)
    {
        var first = new DateTime(anyDayOfMonth.Year, anyDayOfMonth.Month, 1);
        var last = first.AddMonths(1).AddDays(-1);

        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT SEQ, TRT_DT, DISP_NO, TRT_CD, TRT_SB, TRT_PT, ISNULL(DSP_TRT,'') DSP_TRT
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
                Convert.ToInt32(reader["TRT_SB"]), Convert.ToInt32(reader["TRT_PT"]),
                (reader["DSP_TRT"] as string ?? "").Trim()));
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
    /// Chèn MỘT dòng 歯周病検査 mang <c>DIS_CD1 = </c><paramref name="disCd"/> và 部位 sáng ở
    /// <paramref name="slots"/> (1..32).
    ///
    /// <para><b>Kế thừa từ một dòng THẬT của chính bệnh nhân, đừng hard-code.</b> Đã trả giá
    /// ở luồng <c>AutoSanteiChkAuto</c> (2026-09-08): bản đầu đặt tay nên <c>MED_ST_DT</c>
    /// rơi vào NULL, app không dựng nổi lưới và cả fixture đỏ ở <c>OneTimeSetUp</c> với
    /// 「không thấy grdRegi」 — nhìn y như app hỏng. Chỉ ĐÈ những cột testcase thật sự định
    /// nghĩa; mọi cột khác lấy nguyên từ dòng mẫu. <c>SEQ</c> là identity nên KHÔNG liệt kê.</para>
    /// </summary>
    /// <returns><c>disp_no</c> đã dùng.</returns>
    public int SeedPlaqueRow(int patNo, DateTime trtDt, IReadOnlyList<int> livingSlots,
                             int trtCd = PlaqueTrtCd, int trtSb = PlaqueTrtSb,
                             int disCd = DisCdP, int trtPt = 200)
    {
        RequireWrite($"seed 歯周病検査 {trtCd}/{trtSb} vào {trtDt:yyyy-MM-dd}");
        if (livingSlots.Count == 0)
            throw new ArgumentException(
                "Seed 歯周病検査 mà không có ô 部位 nào trên răng CHƯA 欠損 ⇒ UpdMissingTooth " +
                "xoá sạch bui, vòng 「có 現存歯」 không chạy lần nào và pack vẫn HIỆN — ca đo " +
                "kết luận NGƯỢC.", nameof(livingSlots));

        var disp = _next++;
        if (disp > SeedDispMax)
            throw new InvalidOperationException(
                $"Hết dải disp_no seed ({SeedDispBase}..{SeedDispMax}) — xem lại thiết kế ca đo.");

        // ⚠️ CLONE BUI + DSP_BUI TỪ MỘT DÒNG THẬT — cùng lý do như SeedCarrierRow.
        //
        // Đo được 2026-09-21: bản đầu đặt BUI<n> = 1 nhưng DSP_BUI = '' ⇒ dòng lên lưới với
        // ô 部位 RỖNG:
        //     [77] 11 | (null) | Ｐ精検 | 200 | 1        ← không có 部位病名行
        // `CommonChk.getTreatDataTeethDis` tìm trong lưới THÁNG HIỆN TẠI trước
        // (`_tblRegiInp`) và dựng mảng `bui` từ chính các ô đó ⇒ bui toàn 0 ⇒
        // `getPlaqueTeeth` trả về dòng KHÔNG có 現存歯 ⇒ pack vẫn HIỆN. Tiền đề 「còn 現存歯」
        // im lặng không thành, và ca đối chứng đo ra kết quả NGƯỢC.
        //
        // Dòng mẫu phải có 部位 trên ÍT NHẤT một răng chưa bị SIGA đánh 欠損 — nếu không,
        // `UpdMissingTooth` (CmtAuto.cs:2048-2100) xoá trắng hết và ta quay lại đúng chỗ cũ.
        var livingOr = string.Join(" OR ", livingSlots.Select(i => $"BUI{i} <> 0"));
        var buiCols = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"BUI{i}"));
        var disCdCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_CD{i}"));
        var disSbCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_SB{i}"));
        var disCdVals = string.Join(", ", Enumerable.Range(1, 10).Select(i => i == 1 ? "@dis" : "0"));
        var zeros10 = string.Join(", ", Enumerable.Repeat("0", 10));

        var sql = new StringBuilder()
            .Append("INSERT INTO TRNTRN (DEL_FLG, PAT_NO, PAT_BR, INSU_CD, TRT_DT, RAIIN_CNT, DISP_NO, ")
            .Append($"{buiCols}, {disCdCols}, {disSbCols}, ")
            .Append("TRT_CD, TRT_SB, TRT_CNT, TRT_PT, ISL, PRICE, JIHI_FLG, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, MED_ST_DT, DSP_BUI, DSP_TRT, DSP_DIS) ")
            .Append("SELECT TOP 1 0, PAT_NO, PAT_BR, INSU_CD, @dt, RAIIN_CNT, @disp, ")
            .Append($"{buiCols}, {disCdVals}, {zeros10}, ")
            .Append("@cd, @sb, 1, @pt, 0, 0, 0, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, ISNULL(MED_ST_DT, @dt), DSP_BUI, @dsp, @dspdis ")
            .Append("FROM TRNTRN WHERE PAT_NO = @p AND DEL_FLG = 0 ")
            .Append($"AND DISP_NO NOT BETWEEN {SeedDispBase} AND {SeedDispMax} ")
            .Append("AND LTRIM(RTRIM(ISNULL(DSP_BUI, ''))) <> '' ")
            .Append($"AND ({livingOr}) ")
            .Append("ORDER BY TRT_DT DESC, DISP_NO DESC")
            .ToString();

        using var con = Open();
        using var cmd = Command(con, sql);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;
        cmd.Parameters.Add("@disp", SqlDbType.Int).Value = disp;
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;
        cmd.Parameters.Add("@pt", SqlDbType.Int).Value = trtPt;
        cmd.Parameters.Add("@dis", SqlDbType.Int).Value = disCd;
        cmd.Parameters.Add("@dsp", SqlDbType.VarChar).Value = "Ｐ精検";
        cmd.Parameters.Add("@dspdis", SqlDbType.VarChar).Value = "Ｐ";

        var n = cmd.ExecuteNonQuery();
        if (n != 1)
            throw new InvalidOperationException(
                $"Seed 歯周病検査 không chèn được — bệnh nhân {patNo} có dòng THẬT nào vừa có " +
                $"DSP_BUI khác rỗng, vừa có 部位 trên một trong các răng chưa 欠損 " +
                $"[{string.Join(",", livingSlots)}] không? Không có thì tiền đề 「còn 現存歯」 " +
                "không dựng được trên bệnh nhân này.");
        return disp;
    }

    /// <summary>
    /// Các ô 部位 (1..32) mà <c>SIGA</c> <b>KHÔNG</b> đánh 欠損 — tức răng còn sống. Seed
    /// 歯周病検査 phải rơi vào một trong số này, xem <see cref="SeedPlaqueRow"/>.
    /// </summary>
    public IReadOnlyList<int> LivingTeethSlots(int patNo)
    {
        var missing = MissingTeethSlots(patNo).ToHashSet();
        return Enumerable.Range(1, 32).Where(i => !missing.Contains(i)).ToList();
    }

    /// <summary>Chèn một dòng <c>TRNTRN</c> trong dải seed — lõi chung của mọi hàm seed.</summary>
    private int InsertRow(int patNo, DateTime trtDt, int trtCd, int trtSb, int trtPt,
                          int disCd, IReadOnlyList<int> slots, string dspTrt)
    {
        if (slots.Count == 0)
            throw new ArgumentException(
                "Seed 歯周病検査 mà không có 部位 nào ⇒ getPlaqueTeeth trả về dòng có bui toàn 0, " +
                "vòng 「có 現存歯」 không bao giờ chạy và pack vẫn HIỆN — ca đo sẽ kết luận NGƯỢC. " +
                "Truyền ít nhất một ô, và tránh các ô trong MissingTeethSlots().", nameof(slots));
        foreach (var s in slots)
            if (s is < 1 or > 32) throw new ArgumentOutOfRangeException(nameof(slots), s, "部位 phải trong 1..32.");

        var disp = _next++;
        if (disp > SeedDispMax)
            throw new InvalidOperationException(
                $"Hết dải disp_no seed ({SeedDispBase}..{SeedDispMax}) — xem lại thiết kế ca đo.");

        var buiCols = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"BUI{i}"));
        var disCdCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_CD{i}"));
        var disSbCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_SB{i}"));
        // 部位 sáng = 1 (永久歯); UpdMissingTooth xét `bui % 100` nên 1..9 đều là vĩnh viễn.
        var buiVals = string.Join(", ", Enumerable.Range(1, 32).Select(i => slots.Contains(i) ? "1" : "0"));
        var disCdVals = string.Join(", ", Enumerable.Range(1, 10).Select(i => i == 1 ? "@dis" : "0"));
        var zeros10 = string.Join(", ", Enumerable.Repeat("0", 10));

        var sql = new StringBuilder()
            .Append("INSERT INTO TRNTRN (DEL_FLG, PAT_NO, PAT_BR, INSU_CD, TRT_DT, RAIIN_CNT, DISP_NO, ")
            .Append($"{buiCols}, {disCdCols}, {disSbCols}, ")
            .Append("TRT_CD, TRT_SB, TRT_CNT, TRT_PT, ISL, PRICE, JIHI_FLG, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, MED_ST_DT, DSP_BUI, DSP_TRT, DSP_DIS) ")
            .Append("SELECT TOP 1 0, PAT_NO, PAT_BR, INSU_CD, @dt, RAIIN_CNT, @disp, ")
            .Append($"{buiVals}, {disCdVals}, {zeros10}, ")
            .Append("@cd, @sb, 1, @pt, 0, 0, 0, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, ISNULL(MED_ST_DT, @dt), '', @dsp, '' ")
            .Append("FROM TRNTRN WHERE PAT_NO = @p AND DEL_FLG = 0 ")
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
        cmd.Parameters.Add("@dis", SqlDbType.Int).Value = disCd;
        cmd.Parameters.Add("@dsp", SqlDbType.VarChar).Value = dspTrt;

        var n = cmd.ExecuteNonQuery();
        if (n != 1)
            throw new InvalidOperationException(
                $"Seed {trtCd}/{trtSb} không chèn được dòng nào — bệnh nhân {patNo} có dòng TRNTRN " +
                "nào ngoài dải seed để làm mẫu không?");
        return disp;
    }

    /// <summary>処置 dùng làm DÒNG MANG 病名 — 口腔内外科後処置, không kích hoạt pack nào.</summary>
    public const int CarrierTrtCd = 211;

    /// <inheritdoc cref="CarrierTrtCd"/>
    public const int CarrierTrtSb = 0;

    /// <summary>
    /// Chèn một <b>DÒNG MANG 病名</b>: một 処置 vô hại mang sẵn <paramref name="disCd"/> và
    /// 部位, để dòng 歯管 gõ NGAY DƯỚI nó thừa kế 病名 qua <c>ModMain.AutoBui</c>.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO SEED 病名 THAY VÌ ĐI QUA 病名選択
    /// ═══════════════════════════════════════════════════════════════════════════
    /// <para><b>Trong <c>TRNTRN</c> KHÔNG có dòng 部位病名行 riêng.</b> 部位/病名 nằm trên
    /// <b>chính từng dòng 処置</b> (<c>DIS_CD1..10</c>, <c>BUI1..32</c>, <c>DSP_BUI</c>,
    /// <c>DSP_DIS</c>); cái 「部位病名行」 nhìn thấy trên lưới chỉ là cách <b>vẽ</b> khi
    /// 部位/病名 đổi giữa hai dòng liên tiếp. Nên seed 病名 = seed đúng thứ mà
    /// <c>prgCmtAuto</c> sẽ đọc.</para>
    ///
    /// <para><b>Và đi qua 病名選択 thì không đo được.</b> Chọn xong 病名, app chuyển panel
    /// phải sang tab 「ガイド」 và cướp tiêu điểm bàn phím vào ô 選択番号 của tab ấy
    /// (<c>txtGuid1Sel</c>). Cú click vào ô 点 của lưới KHÔNG giành lại được, nên cả chuỗi
    /// 「gõ 116 → Enter」 rơi vào ô đó và Enter = chọn dòng ガイド số 116 ⇒ app mở
    /// 「ガイド処置選択」 (frm203002.cs:6543). Đo được 2026-09-21 qua 5 lượt chạy; ảnh
    /// <c>11x_khong-mo-duoc-処置選択.png</c> cho thấy 「選択 No. [116]」 ở góc dưới phải.
    /// Chuyển tab sang 病検 cũng KHÔNG cứu được.</para>
    ///
    /// <para><b>F21 không cấm cái này</b>: dòng seed là <b>trạng thái xuất phát</b>, không
    /// phải thứ đang đo. Thứ đang đo — <c>Chk_CmtAuto</c> → <c>prgCmtAuto</c> → nhánh
    /// 歯管-有床義歯 — vẫn chạy trọn đường giao diện: gõ mã → 処置選択 → Enter ô 回. Và
    /// <c>AutoBui</c> vẫn chạy thật lúc nhập, chép 病名 từ dòng seed xuống dòng 歯管.</para>
    ///
    /// <para>⚠️ <paramref name="tag"/> ghi vào <c>DSP_TRT</c> để ca đo tìm lại đúng dòng của
    /// mình trên lưới. Đặt chuỗi ASCII, dễ nhận, và KHÁC nhau giữa các 病名.</para>
    /// </summary>
    /// <returns><c>disp_no</c> đã dùng.</returns>
    public int SeedCarrierRow(int patNo, DateTime trtDt, int disCd, string disNm, string tag)
    {
        RequireWrite($"seed dong mang 病名 {disCd} vao {trtDt:yyyy-MM-dd}");

        var disp = _next++;
        if (disp > SeedDispMax)
            throw new InvalidOperationException(
                $"Hết dải disp_no seed ({SeedDispBase}..{SeedDispMax}) — xem lại thiết kế ca đo.");

        // ⚠️ CLONE 部位 + DSP_BUI TỪ MỘT DÒNG THẬT, đừng tự dựng.
        //
        // Đo được 2026-09-21: bản đầu đặt BUI<n> = 1 nhưng để DSP_BUI = '' — dòng seed lên
        // lưới với ô 部位 RỖNG và app KHÔNG vẽ 部位病名行 nào cho nó:
        //     [78] 11 | (null) | TESTDIS100 | 22 | 1        ← 部位 rỗng
        // so với một dòng thật:
        //     [31]  2 | 7654321|1234567 … (28) | MT | - | - ← có 部位病名行
        // ⇒ hFG1[8..49] của dòng đó về 0, `ModMain.AutoBui` chép xuống số 0, và MỌI ca đo
        // rơi về nhánh 「không có 病名」 — cả ba lượt TCD_11/20/21 đều giải thích được bằng
        // đúng một câu đó, tức phép đo mất sạch ý nghĩa mà vẫn có ca xanh.
        //
        // Dòng mẫu: bất kỳ dòng THẬT nào của chính bệnh nhân có DSP_BUI khác rỗng.
        var buiCols = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"BUI{i}"));
        var disCdCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_CD{i}"));
        var disSbCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_SB{i}"));
        var disCdVals = string.Join(", ", Enumerable.Range(1, 10).Select(i => i == 1 ? "@dis" : "0"));
        var zeros10 = string.Join(", ", Enumerable.Repeat("0", 10));

        var sql = new StringBuilder()
            .Append("INSERT INTO TRNTRN (DEL_FLG, PAT_NO, PAT_BR, INSU_CD, TRT_DT, RAIIN_CNT, DISP_NO, ")
            .Append($"{buiCols}, {disCdCols}, {disSbCols}, ")
            .Append("TRT_CD, TRT_SB, TRT_CNT, TRT_PT, ISL, PRICE, JIHI_FLG, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, MED_ST_DT, DSP_BUI, DSP_TRT, DSP_DIS) ")
            .Append("SELECT TOP 1 0, PAT_NO, PAT_BR, INSU_CD, @dt, RAIIN_CNT, @disp, ")
            .Append($"{buiCols}, {disCdVals}, {zeros10}, ")      // ← BUI lấy NGUYÊN từ dòng mẫu
            .Append("@cd, @sb, 1, @pt, 0, 0, 0, DR_NO, SYOSIN_FLG, ")
            .Append("CHK_FLG, STAFF_NO, ISNULL(MED_ST_DT, @dt), DSP_BUI, @dsp, @dspdis ")
            .Append("FROM TRNTRN WHERE PAT_NO = @p AND DEL_FLG = 0 ")
            .Append($"AND DISP_NO NOT BETWEEN {SeedDispBase} AND {SeedDispMax} ")
            .Append("AND LTRIM(RTRIM(ISNULL(DSP_BUI, ''))) <> '' ")
            .Append("ORDER BY TRT_DT DESC, DISP_NO DESC")
            .ToString();

        using var con = Open();
        using var cmd = Command(con, sql);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;
        cmd.Parameters.Add("@disp", SqlDbType.Int).Value = disp;
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = CarrierTrtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = CarrierTrtSb;
        cmd.Parameters.Add("@pt", SqlDbType.Int).Value = 22;
        cmd.Parameters.Add("@dis", SqlDbType.Int).Value = disCd;
        cmd.Parameters.Add("@dsp", SqlDbType.VarChar).Value = tag;
        cmd.Parameters.Add("@dspdis", SqlDbType.VarChar).Value = disNm;

        var n = cmd.ExecuteNonQuery();
        if (n != 1)
            throw new InvalidOperationException(
                $"Seed dòng mang 病名 {disCd} không chèn được — bệnh nhân {patNo} có dòng TRNTRN " +
                "nào mang DSP_BUI khác rỗng để làm mẫu không? Không có thì 部位 không lên được " +
                "lưới và AutoBui sẽ chép số 0.");
        return disp;
    }

    /// <summary>
    /// Số dòng THẬT của bệnh nhân có <c>DSP_BUI</c> khác rỗng — tức có thể làm dòng mẫu cho
    /// <see cref="SeedCarrierRow"/>. Bằng 0 ⇒ luồng này không dựng được tiền đề 病名.
    /// </summary>
    public int BuiTemplateRows(int patNo)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO = @p AND DEL_FLG = 0 " +
            $"AND DISP_NO NOT BETWEEN {SeedDispBase} AND {SeedDispMax} " +
            "AND LTRIM(RTRIM(ISNULL(DSP_BUI, ''))) <> ''");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>
    /// Xoá MỌI dòng trong dải seed của bệnh nhân — <b>mọi ngày</b>.
    ///
    /// <para>⛔ Điều kiện <c>DISP_NO BETWEEN 9200 AND 9299</c> là hàng rào <b>duy nhất</b>
    /// đứng giữa lệnh này và dữ liệu thật (kể cả dòng 再初診 ở <c>disp_no = 9001</c> và
    /// vùng 9100..9199 của luồng <c>CmtPackExitFlg</c>). Đừng nới nó ra.</para>
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
