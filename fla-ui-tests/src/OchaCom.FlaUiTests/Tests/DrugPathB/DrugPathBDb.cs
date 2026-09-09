using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugPathB;

/// <summary>
/// Dữ liệu cho luồng <b>G2 — Path B (<c>mst_med</c>)</b>: nhánh dự phòng của
/// <c>EditControl.editDrugName</c> khi <b>không tìm thấy</b> dòng <c>MST_DRUG_RX</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HAI NHÁNH CỦA editDrugName — VÀ CHỖ BẢN WEB DỪNG LẠI
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// if (mstDrugRXGroupData != null && dg_nm[0] != "") {   ← PATH A (đã port)
///     … tên thuốc + 数量 + 単位 + 用法 + 用量 …            EditControl.cs:1048-1135
/// } else {                                              ← PATH B (CHƯA port)
///     trt_nm  ← MstTrt.getMstTrtDataYaku(tbl, cd, sb)     EditControl.cs:1137-1140
///     usage   ← SyoPac.getMstMed(cd, sb)   (bảng MST_MED) EditControl.cs:1142-1148
/// }
/// </code>
///
/// Bản web KHÔNG có path B: <c>ResolveDrugHandler</c> trả <c>found = false</c> khi
/// <c>joined is null</c>, và <c>commitDrugPick</c> dừng lại ở
/// <c>alertDialog(「この薬剤コードは現在未対応です。」)</c>
/// (treatment-entry-detail.tsx:5077-5079) — <b>không dòng nào rơi xuống lưới</b>.
/// WinForm thì vẫn chèn dòng, mang 処置名 + 用法.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ DỮ LIỆU DEV KHÔNG CÓ CA NÀO RƠI VÀO PATH B — PHẢI SEED
/// ═══════════════════════════════════════════════════════════════════════════
/// Đo 2026-09-09 trên <c>SIM2000</c>: cả <b>63/63</b> mã 600–699 của
/// <c>MST_TRT266</c> đều có <c>MST_DRUG_RX</c> phủ ngày test ⇒ path B không bao giờ
/// chạy. (<c>MST_MED</c> có 53 dòng, trong đó <b>620/0</b> và <b>647/1</b> là dòng
/// MỒ CÔI — không có 処置 tương ứng trong master, nên gõ mã đó chỉ ra
/// 「該当処置はありません」 chứ không tới được path B.)
///
/// ⇒ Luồng phải <b>giấu tạm</b> dòng <c>MST_DRUG_RX</c> của mã đem thử: chụp — in ra —
/// trả lại (F20), nằm sau cờ riêng <c>drugPathB.allowSeed</c> (mặc định TẮT).
/// <b>Thứ bị sửa là bảng 処置変換 dùng chung cả phòng khám</b>, không phải dữ liệu bệnh
/// nhân test — nên KHÔNG dùng chung <c>parity.allowSave</c> hay
/// <c>drugAmount.allowSeed</c>.
///
/// <para>Lớp này CHỈ đụng <c>MST_DRUG_RX</c>. <c>MST_MED</c> và bảng master
/// (<c>MST_TRT…</c>) chỉ được ĐỌC.</para>
/// </summary>
public sealed class DrugPathBDb
{
    /// <summary>Khoảng ngày đem "cất" dòng 処置変換 vào — xa hẳn mọi ngày test.</summary>
    public const string ParkedStDt = "29990101";
    public const string ParkedEdDt = "29991231";

    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private DrugPathBDb(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static DrugPathBDb? CreateOrNull(TestSettings s)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new DrugPathBDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    public string? ProbeError()
    {
        try { using var _ = Open(); return null; }
        catch (Exception e) { return e.Message; }
    }

    private SqlConnection Open()
    {
        var c = new SqlConnection(_connectionString);
        c.Open();
        return c;
    }

    private SqlCommand Cmd(SqlConnection con, string sql, SqlTransaction? tx = null)
    {
        var c = con.CreateCommand();
        c.CommandText = sql;
        c.CommandTimeout = _commandTimeout;
        if (tx is not null) c.Transaction = tx;
        return c;
    }

    /// <summary>
    /// Bảng master áp dụng cho ngày đó, lấy từ <c>TRT_SEL</c> — đúng bảng mà
    /// <c>TrtSel.getTrtSel</c> trả cho <c>getMstTrtDataYaku</c> (EditControl.cs:1137-1138).
    /// </summary>
    /// <remarks>
    /// Bản sao thứ ba của phép tra này (đã có ở <c>OchaDb</c> và <c>DrugAmountDb</c>).
    /// Giữ nguyên theo quy ước của repo: mỗi luồng có helper DB tự chứa, để đọc thư mục
    /// là biết luồng chạm vào đâu — xem <c>BuiPriceE00100Db</c>, <c>SigaKonDb</c>,
    /// <c>ChkAutoDb</c>. Gom lại thì phải sửa cả ba luồng đang xanh.
    /// </remarks>
    public string ActiveTrtTable(DateTime date)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT TOP 1 MTBL_NM FROM TRT_SEL
             WHERE START_DT <= @d AND (END_DT >= @d OR END_DT IS NULL)
             ORDER BY START_DT DESC
            """);
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = date.Date;

        var name = cmd.ExecuteScalar() as string;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException(
                $"TRT_SEL không có bản master nào phủ ngày {date:yyyy-MM-dd}.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, "^MST[A-Za-z0-9_]*$"))
            throw new InvalidOperationException($"Tên bảng master lạ trong TRT_SEL: 「{name}」");
        return name;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ① Ứng viên
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một dòng <c>MST_DRUG_RX</c> — chỉ để chụp ảnh và trả lại.</summary>
    public sealed record RxRow(int TrtCd, int TrtSb, string AppStDt, string AppEdDt,
                               string DgCd1, string DgCd2, string DgCd3)
    {
        public bool Covers(DateTime d)
        {
            var s = d.ToString("yyyyMMdd");
            return string.CompareOrdinal(AppStDt, s) <= 0 && string.CompareOrdinal(s, AppEdDt) <= 0;
        }

        public override string ToString() =>
            $"{TrtCd}/{TrtSb} {AppStDt}–{AppEdDt} dg_cd=[{DgCd1}|{DgCd2}|{DgCd3}]";
    }

    /// <summary>
    /// Một mã 薬剤 đem thử path B.
    /// </summary>
    /// <param name="TrtNm">
    /// <c>trt_nm</c> của master — <b>dòng thứ nhất</b> mà path B in ra
    /// (<c>getMstTrtDataYaku</c> trả cả bản ghi nhưng editDrugName chỉ lấy <c>trt_nm</c>,
    /// EditControl.cs:1139-1140). Chú ý: KHÔNG phải <c>cct_nm</c>, và cũng không phải
    /// chuỗi <c>dsp_trt</c> mà frm203016 truyền vào — path B bỏ qua tham số đó.
    /// </param>
    /// <param name="Usage">
    /// <c>MST_MED.usage</c> — <b>dòng thứ hai</b>, chỉ có khi bảng đó có dòng cho
    /// đúng cặp <c>trt_cd</c>/<c>trt_sb</c> (SyoPac.cs:242-266). Rỗng ⇒ path B chỉ ra
    /// MỘT dòng.
    /// </param>
    /// <param name="ActiveFlg">
    /// <c>getMstTrtDataYaku</c> lọc <c>active_flg = 1</c> AND <c>right(trt_nm,1) &lt;&gt; '!'</c>
    /// (MstTrt.cs:957-958). Không thoả ⇒ trả null ⇒ path B mất luôn dòng tên.
    /// </param>
    /// <param name="SbCount">Số 枝番 — &gt; 1 thì 処置選択 sẽ hiện (modMain.cs:485).</param>
    public sealed record PathBCandidate(int TrtCd, int TrtSb, string TrtNm, int Score1,
                                        int GCnt, int ActiveFlg, int SbCount,
                                        string Usage, IReadOnlyList<RxRow> RxRows)
    {
        public bool HasUsage => Usage.Length > 0;

        /// <summary>Có dòng 処置変換 phủ ngày test không — có ⇒ đang ở path A, phải seed.</summary>
        public RxRow? RxCovering(DateTime d) => RxRows.FirstOrDefault(r => r.Covers(d));

        /// <summary><c>getMstTrtDataYaku</c> có trả về bản ghi không (MstTrt.cs:957-958).</summary>
        public bool YakuRowVisible =>
            ActiveFlg == 1 && !TrtNm.EndsWith("!", StringComparison.Ordinal);

        /// <summary>Các dòng mà path B sẽ dựng, theo đúng thứ tự (EditControl.cs:1137-1148).</summary>
        public IReadOnlyList<string> ExpectedLines
        {
            get
            {
                var lines = new List<string>();
                if (YakuRowVisible) lines.Add(TrtNm);
                if (HasUsage) lines.Add(Usage);
                return lines;
            }
        }

        public override string ToString() =>
            $"{TrtCd}/{TrtSb} 「{TrtNm}」 score1={Score1} g_cnt={GCnt} active={ActiveFlg} " +
            $"枝番×{SbCount} · 用法={(HasUsage ? $"「{Usage}」" : "KHÔNG CÓ")} · " +
            $"{RxRows.Count} dòng mst_drug_rx";
    }

    /// <summary>
    /// Đọc một ứng viên: master + <c>MST_MED</c> + toàn bộ dòng <c>MST_DRUG_RX</c> của mã đó.
    ///
    /// <para>Lấy <b>MỌI</b> dòng rx chứ không chỉ dòng phủ ngày test: 605/0 có hai dòng
    /// (2009–2016 và 2016–9999), nên "giấu" phải biết mình đang giấu dòng nào và trả lại
    /// đúng dòng đó.</para>
    /// </summary>
    public PathBCandidate? Candidate(DateTime date, int trtCd, int trtSb)
    {
        var table = ActiveTrtTable(date);
        using var con = Open();

        using var cmd = Cmd(con, $"""
            SELECT t.TRT_NM, t.SCORE1, t.G_CNT, t.ACTIVE_FLG,
                   (SELECT COUNT(*) FROM {table} s WHERE s.TRT_CD = t.TRT_CD) AS SB_COUNT,
                   ISNULL((SELECT TOP 1 m.USAGE FROM MST_MED m
                            WHERE m.TRT_CD = t.TRT_CD AND m.TRT_SB = t.TRT_SB), '') AS USAGE
              FROM {table} t
             WHERE t.TRT_CD = @cd AND t.TRT_SB = @sb
            """);
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = trtSb;

        string trtNm; int score1, gCnt, activeFlg, sbCount; string usage;
        using (var r = cmd.ExecuteReader())
        {
            if (!r.Read()) return null;
            trtNm = Str(r, 0);
            score1 = Convert.ToInt32(r.GetValue(1));
            gCnt = Convert.ToInt32(r.GetValue(2));
            activeFlg = Convert.ToInt32(r.GetValue(3));
            sbCount = Convert.ToInt32(r.GetValue(4));
            usage = Str(r, 5);
        }

        return new PathBCandidate(trtCd, trtSb, trtNm, score1, gCnt, activeFlg, sbCount,
                                  usage, ReadRx(con, trtCd, trtSb));
    }

    private IReadOnlyList<RxRow> ReadRx(SqlConnection con, int trtCd, int trtSb)
    {
        using var cmd = Cmd(con,
            """
            SELECT trt_cd, trt_sb, app_st_dt, app_ed_dt,
                   ISNULL(dg_cd1,''), ISNULL(dg_cd2,''), ISNULL(dg_cd3,'')
              FROM MST_DRUG_RX
             WHERE trt_cd = @cd AND trt_sb = @sb
             ORDER BY app_st_dt
            """);
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = trtSb;

        var list = new List<RxRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new RxRow(Convert.ToInt32(r.GetValue(0)), Convert.ToInt32(r.GetValue(1)),
                               Str(r, 2), Str(r, 3), Str(r, 4), Str(r, 5), Str(r, 6)));
        return list;
    }

    /// <summary>Số mã 600–699 ĐANG rơi vào path B (không có 処置変換 phủ ngày) — hàng rào.</summary>
    public int CountPathBCodes(DateTime date)
    {
        var table = ActiveTrtTable(date);
        using var con = Open();
        using var cmd = Cmd(con, $"""
            SELECT COUNT(*) FROM {table} t
             WHERE t.TRT_CD BETWEEN 600 AND 699
               AND NOT EXISTS (SELECT 1 FROM MST_DRUG_RX rx
                                WHERE rx.trt_cd = t.TRT_CD AND rx.trt_sb = t.TRT_SB
                                  AND @app BETWEEN rx.app_st_dt AND rx.app_ed_dt)
            """);
        cmd.Parameters.Add("@app", SqlDbType.VarChar, 8).Value = date.ToString("yyyyMMdd");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Dòng <c>MST_MED</c> MỒ CÔI — có 用法 nhưng master không có 処置 tương ứng.</summary>
    public IReadOnlyList<string> OrphanMstMed(DateTime date)
    {
        var table = ActiveTrtTable(date);
        using var con = Open();
        using var cmd = Cmd(con, $"""
            SELECT m.TRT_CD, m.TRT_SB, m.USAGE FROM MST_MED m
             WHERE NOT EXISTS (SELECT 1 FROM {table} t
                                WHERE t.TRT_CD = m.TRT_CD AND t.TRT_SB = m.TRT_SB)
             ORDER BY m.TRT_CD, m.TRT_SB
            """);
        var list = new List<string>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add($"{r.GetValue(0)}/{r.GetValue(1)} 「{Str(r, 2)}」");
        return list;
    }

    public int CountMstMed()
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT COUNT(*) FROM MST_MED");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ② Seed — hai đường vào path B, và chúng KHÁC nhau
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Hai cách ép một mã rơi vào path B. Điều kiện rẽ nhánh ở EditControl.cs:1048.</summary>
    public enum SeedMode
    {
        /// <summary>
        /// <b>Giấu dòng 処置変換 khỏi ngày test</b> — dời <c>app_st_dt</c>/<c>app_ed_dt</c> ra
        /// <see cref="ParkedStDt"/>–<see cref="ParkedEdDt"/>.
        ///
        /// <para>⇒ <c>getMstDrugRXListJoinMstDrug</c> trả về <b>null</b>
        /// (MstDrugRX.cs:214-219) ⇒ path B với <c>drugRxData = null</c>. Đây là hình dạng
        /// THẬT của ca 「phòng khám tự đăng ký thuốc riêng」: có dòng master, không có dòng
        /// 処置変換.</para>
        ///
        /// <para>⚠️ Hai cột này nằm trong KHOÁ CHÍNH của <c>MST_DRUG_RX</c>
        /// (trt_cd, trt_sb, app_st_dt, app_ed_dt). Update vẫn hợp lệ vì khoá đích không
        /// đụng dòng nào — nhưng vì thế mà phải có hàng rào <see cref="ParkedRowExists"/>.</para>
        /// </summary>
        HideByDate,

        /// <summary>
        /// <b>Bỏ trống <c>dg_cd1..3</c></b> ⇒ phép nối sang <c>mst_drug</c> không ra tên ⇒
        /// <c>dg_nm[0] == ""</c> ⇒ vẫn vào path B, nhưng <c>drugRxData</c> <b>KHÁC null</b>.
        ///
        /// <para>Đây là <b>ĐỐI CHỨNG của chính cách seed</b>: nếu hai chế độ cho ra cùng ô
        /// 療法・処置 thì kết luận 「path B in ra thế này」 không phụ thuộc cách ta ép nó
        /// vào path B. Nếu khác nhau thì chính chỗ khác đó là thứ phải soi — nhánh
        /// <c>drugInfStr.drugRxData != null</c> ở frm203016.cs:1470 chỉ chạy ở chế độ này.</para>
        ///
        /// <para>Không đụng cột khoá.</para>
        /// </summary>
        BlankDgCd,
    }

    /// <summary>Ảnh chụp mọi dòng <c>MST_DRUG_RX</c> của các mã luồng này đụng tới.</summary>
    public sealed record RxSnapshot(IReadOnlyList<RxRow> Rows)
    {
        public override string ToString() =>
            Rows.Count == 0 ? "(không có dòng nào)" : string.Join(" · ", Rows);
    }

    /// <summary>
    /// Chụp TRƯỚC mọi lệnh ghi (F20). Chụp sau là chụp phải chính cái mốc mình vừa đặt.
    /// </summary>
    public RxSnapshot TakeSnapshot(params (int TrtCd, int TrtSb)[] keys)
    {
        using var con = Open();
        var rows = new List<RxRow>();
        foreach (var (cd, sb) in keys) rows.AddRange(ReadRx(con, cd, sb));
        return new RxSnapshot(rows);
    }

    /// <summary>
    /// HÀNG RÀO — đã có sẵn dòng nằm ở khoảng 「cất tạm」 chưa.
    ///
    /// <para>Có ⇒ một lượt chạy trước đã chết giữa chừng và chưa trả lại. Seed tiếp là
    /// chồng lên rác cũ, còn teardown thì sẽ "khôi phục" về đúng cái rác đó. Fixture
    /// phải DỪNG và bắt người chạy dọn tay.</para>
    /// </summary>
    public bool ParkedRowExists(int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT COUNT(*) FROM MST_DRUG_RX
             WHERE trt_cd = @cd AND trt_sb = @sb AND app_st_dt = @st AND app_ed_dt = @ed
            """);
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = trtSb;
        cmd.Parameters.Add("@st", SqlDbType.VarChar, 8).Value = ParkedStDt;
        cmd.Parameters.Add("@ed", SqlDbType.VarChar, 8).Value = ParkedEdDt;
        return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
    }

    /// <param name="Blocker">Khác null ⇒ KHÔNG seed được; testcase phải Ignore kèm lý do này.</param>
    public sealed record Seed(SeedMode Mode, int TrtCd, int TrtSb, RxRow? Hidden, string? Blocker)
    {
        public override string ToString() =>
            Blocker is not null
                ? $"KHÔNG seed được: {Blocker}"
                : $"{Mode} trên {TrtCd}/{TrtSb} — dòng bị đụng: {Hidden?.ToString() ?? "(không có)"}";
    }

    /// <summary>Ép <paramref name="c"/> rơi vào path B cho ngày <paramref name="date"/>.</summary>
    public Seed SeedPathB(PathBCandidate c, DateTime date, SeedMode mode)
    {
        var covering = c.RxCovering(date);
        if (covering is null)
            return new Seed(mode, c.TrtCd, c.TrtSb, null,
                $"{c.TrtCd}/{c.TrtSb} vốn KHÔNG có dòng 処置変換 phủ ngày {date:yyyy-MM-dd} — " +
                "nó đã ở path B sẵn, không cần seed (và cũng nghĩa là dữ liệu đã đổi so với " +
                "lúc đo 2026-09-09).");

        if (mode == SeedMode.HideByDate && ParkedRowExists(c.TrtCd, c.TrtSb))
            return new Seed(mode, c.TrtCd, c.TrtSb, covering,
                $"đã có sẵn dòng {c.TrtCd}/{c.TrtSb} ở khoảng cất tạm " +
                $"{ParkedStDt}–{ParkedEdDt} — một lượt chạy trước chết giữa chừng. DỌN TAY: " +
                $"UPDATE MST_DRUG_RX SET app_st_dt='<gốc>', app_ed_dt='<gốc>' WHERE trt_cd={c.TrtCd} " +
                $"AND trt_sb={c.TrtSb} AND app_st_dt='{ParkedStDt}';");

        using var con = Open();
        var sql = mode == SeedMode.HideByDate
            ? """
              UPDATE MST_DRUG_RX SET app_st_dt = @newSt, app_ed_dt = @newEd
               WHERE trt_cd = @cd AND trt_sb = @sb AND app_st_dt = @st AND app_ed_dt = @ed
              """
            : """
              UPDATE MST_DRUG_RX SET dg_cd1 = '', dg_cd2 = '', dg_cd3 = ''
               WHERE trt_cd = @cd AND trt_sb = @sb AND app_st_dt = @st AND app_ed_dt = @ed
              """;

        using var cmd = Cmd(con, sql);
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = c.TrtCd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = c.TrtSb;
        cmd.Parameters.Add("@st", SqlDbType.VarChar, 8).Value = covering.AppStDt;
        cmd.Parameters.Add("@ed", SqlDbType.VarChar, 8).Value = covering.AppEdDt;
        if (mode == SeedMode.HideByDate)
        {
            cmd.Parameters.Add("@newSt", SqlDbType.VarChar, 8).Value = ParkedStDt;
            cmd.Parameters.Add("@newEd", SqlDbType.VarChar, 8).Value = ParkedEdDt;
        }

        var n = cmd.ExecuteNonQuery();
        return n == 1
            ? new Seed(mode, c.TrtCd, c.TrtSb, covering, null)
            : new Seed(mode, c.TrtCd, c.TrtSb, covering, $"UPDATE đụng {n} dòng (mong đợi 1)");
    }

    /// <summary>
    /// Trả <c>MST_DRUG_RX</c> về đúng ảnh chụp: đưa dòng đã cất tạm về lại khoảng ngày cũ
    /// và đặt lại <c>dg_cd1..3</c> cho MỌI dòng trong ảnh.
    ///
    /// <para>Không chỉ "hoàn tác cái vừa làm": lượt chạy có thể chết sau chế độ seed thứ
    /// hai, hoặc chết giữa hai chế độ. So với ảnh chụp là cách duy nhất chắc chắn.</para>
    /// </summary>
    public string Restore(RxSnapshot snap)
    {
        if (snap.Rows.Count == 0) return "ảnh chụp rỗng — không có gì để trả lại.";

        var done = new List<string>();
        using var con = Open();
        using var tx = con.BeginTransaction();
        try
        {
            foreach (var row in snap.Rows)
            {
                // ① Dòng đang bị cất tạm → đưa khoảng ngày về chỗ cũ.
                using (var back = Cmd(con,
                    """
                    UPDATE MST_DRUG_RX SET app_st_dt = @st, app_ed_dt = @ed
                     WHERE trt_cd = @cd AND trt_sb = @sb
                       AND app_st_dt = @pst AND app_ed_dt = @ped
                    """, tx))
                {
                    back.Parameters.Add("@st", SqlDbType.VarChar, 8).Value = row.AppStDt;
                    back.Parameters.Add("@ed", SqlDbType.VarChar, 8).Value = row.AppEdDt;
                    back.Parameters.Add("@cd", SqlDbType.SmallInt).Value = row.TrtCd;
                    back.Parameters.Add("@sb", SqlDbType.TinyInt).Value = row.TrtSb;
                    back.Parameters.Add("@pst", SqlDbType.VarChar, 8).Value = ParkedStDt;
                    back.Parameters.Add("@ped", SqlDbType.VarChar, 8).Value = ParkedEdDt;
                    if (back.ExecuteNonQuery() > 0) done.Add($"{row.TrtCd}/{row.TrtSb} ngày → {row.AppStDt}–{row.AppEdDt}");
                }

                // ② dg_cd về đúng ảnh chụp (no-op nếu chưa từng bị bỏ trống).
                using var cd = Cmd(con,
                    """
                    UPDATE MST_DRUG_RX SET dg_cd1 = @c1, dg_cd2 = @c2, dg_cd3 = @c3
                     WHERE trt_cd = @cd AND trt_sb = @sb AND app_st_dt = @st AND app_ed_dt = @ed
                    """, tx);
                cd.Parameters.Add("@c1", SqlDbType.VarChar, 12).Value = row.DgCd1;
                cd.Parameters.Add("@c2", SqlDbType.VarChar, 12).Value = row.DgCd2;
                cd.Parameters.Add("@c3", SqlDbType.VarChar, 12).Value = row.DgCd3;
                cd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = row.TrtCd;
                cd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = row.TrtSb;
                cd.Parameters.Add("@st", SqlDbType.VarChar, 8).Value = row.AppStDt;
                cd.Parameters.Add("@ed", SqlDbType.VarChar, 8).Value = row.AppEdDt;
                cd.ExecuteNonQuery();
            }
            tx.Commit();
        }
        catch (Exception e)
        {
            try { tx.Rollback(); } catch { /* */ }
            return $"⛔ KHÔNG trả lại được MST_DRUG_RX — SỬA TAY theo ảnh chụp: {snap}. Lỗi: {e.Message}";
        }
        return $"đã trả lại MST_DRUG_RX ({snap.Rows.Count} dòng trong ảnh)" +
               (done.Count > 0 ? ": " + string.Join(" · ", done) : " — không dòng nào còn bị cất tạm.");
    }

    private static string Str(SqlDataReader r, int i) =>
        r.IsDBNull(i) ? "" : (r.GetValue(i)?.ToString() ?? "").Trim();
}
