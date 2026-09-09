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
/// ⇒ Luồng phải <b>TẠO</b> mã 薬剤 riêng: clone một dòng master có sẵn ra mã mới rồi
/// chèn <c>MST_MED</c> cho nó. Mã mới thì <b>đương nhiên</b> không có
/// <c>MST_DRUG_RX</c> ⇒ rơi thẳng vào path B, không phải ép gì cả.
///
/// <para><b>Lượt chạy chỉ THÊM dòng rồi XOÁ — không sửa dòng nào đang có.</b> Một dòng
/// thêm vào không thể làm hỏng dữ liệu sẵn có, còn dọn dẹp chỉ là <c>DELETE</c> theo
/// đúng khoá vừa tạo. Vẫn nằm sau cờ riêng <c>drugPathB.allowSeed</c> (mặc định TẮT) vì
/// bảng bị thêm vào là <b>master dùng chung cả phòng khám</b> — và KHÔNG dùng chung
/// <c>drugAmount.allowSeed</c>, bên đó SỬA <c>mst_trt.F2</c> của một dòng thật.</para>
///
/// <para>Đây cũng là chiến lược của vế Playwright
/// (<c>../web-tenant-tests/tests/treatment-grid/drug-path-b-mst-med.spec.ts</c>:
/// <c>seedMstTrtRows</c> clone 602 ra 698/699). Hai bên seed <b>cùng mã, cùng tên, cùng
/// 用法</b> — điều kiện để số đo so thẳng được với nhau.</para>
/// </summary>
public sealed class DrugPathBDb
{
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

    /// <summary><c>grp</c> của một mã — 薬剤選択 xếp nó vào tab nào (1 内服 · 2 屯服 · 3 外用).</summary>
    public int GrpOf(DateTime date, int trtCd, int trtSb)
    {
        var table = ActiveTrtTable(date);
        using var con = Open();
        using var cmd = Cmd(con, $"SELECT GRP FROM {table} WHERE TRT_CD = @cd AND TRT_SB = @sb");
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = trtSb;
        var v = cmd.ExecuteScalar();
        return v is null || v == DBNull.Value ? 0 : Convert.ToInt32(v);
    }

    public int CountMstMed()
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT COUNT(*) FROM MST_MED");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }


    // ─────────────────────────────────────────────────────────────────────────
    // ② Seed — TẠO MÃ MỚI, không đụng dòng nào có sẵn
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một mã 薬剤 cần dựng cho lượt chạy.</summary>
    /// <param name="TrtCd">Mã mới — phải CHƯA có trong master (hàng rào kiểm trước).</param>
    /// <param name="TrtNm">
    /// 処置名称 — chính là <b>dòng thứ nhất</b> mà path B in ra. Cố ý KHÔNG chứa
    /// 「日分」/「回分」 để câu hỏi 「path B có gắn hậu tố 用量 không」 không bị chính dữ
    /// liệu seed làm nhiễu.
    /// </param>
    /// <param name="Usage">
    /// <c>MST_MED.usage</c> — <b>dòng thứ hai</b>. Chuỗi rỗng ⇒ KHÔNG chèn dòng
    /// <c>MST_MED</c> nào ⇒ path B chỉ ra một dòng (đó là mã ĐỐI CHỨNG).
    /// </param>
    public sealed record SeedSpec(int TrtCd, int TrtSb, string TrtNm, string Usage)
    {
        public bool WantsUsage => Usage.Length > 0;
    }

    /// <param name="Blocker">Khác null ⇒ KHÔNG seed được; testcase phải Ignore kèm lý do này.</param>
    public sealed record SeedResult(string Table, IReadOnlyList<SeedSpec> Created, string? Blocker)
    {
        public override string ToString() =>
            Blocker is not null
                ? $"KHÔNG seed được: {Blocker}"
                : $"{Table}: đã tạo " + string.Join(" · ",
                      Created.Select(c => $"{c.TrtCd}/{c.TrtSb} 「{c.TrtNm}」" +
                                          (c.WantsUsage ? $" + 用法「{c.Usage}」" : " (không 用法)")));
    }

    /// <summary>
    /// Dựng các mã đem thử bằng cách <b>CLONE</b> một dòng 薬剤 có sẵn rồi đổi
    /// <c>TRT_CD</c>/<c>TRT_NM</c>, và chèn <c>MST_MED</c> cho mã nào cần 用法.
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// VÌ SAO CLONE CHỨ KHÔNG SỬA DÒNG CÓ SẴN
    /// ═══════════════════════════════════════════════════════════════════════
    /// Mã mới thì <b>đương nhiên</b> không có dòng <c>MST_DRUG_RX</c> ⇒ rơi thẳng vào
    /// path B, không phải ép gì cả. Và quan trọng hơn: lượt chạy <b>KHÔNG SỬA</b> dòng
    /// nào đang có — nó chỉ THÊM rồi XOÁ. Một dòng thêm vào không thể làm hỏng dữ liệu
    /// sẵn có, còn dọn dẹp thì chỉ là <c>DELETE</c> theo đúng khoá mình vừa tạo.
    ///
    /// <para>Đây cũng là chiến lược của vế Playwright
    /// (<c>drug-path-b-mst-med.spec.ts</c>: <c>seedMstTrtRows</c> clone từ 602 ra
    /// 698/699), nên hai bên seed <b>cùng mã, cùng tên, cùng 用法</b> — điều kiện để số
    /// đo so thẳng được với nhau.</para>
    ///
    /// <para>Clone lấy đủ ~70 cột NOT NULL của bảng master bằng cách dựng danh sách cột
    /// từ <c>sys.columns</c> — viết tay 70 tên cột là chỗ chắc chắn sẽ sai khi master
    /// đổi phiên bản.</para>
    /// </summary>
    /// <param name="cloneFrom">
    /// Dòng nguồn. Phải là một 薬剤 600–699 <b>đang dùng được</b>: <c>active_flg = 1</c>,
    /// <c>F2 = 0</c> (không mở 薬剤使用量選択 — đó là luồng G1, không phải luồng này).
    /// </param>
    public SeedResult SeedCodes(DateTime date, (int TrtCd, int TrtSb) cloneFrom,
                                IReadOnlyList<SeedSpec> specs)
    {
        var table = ActiveTrtTable(date);

        // HÀNG RÀO (F22): mã đích đã tồn tại ⇒ hoặc master thật có mã đó, hoặc một lượt
        // chạy trước chết giữa chừng. Cả hai trường hợp đều KHÔNG được ghi đè.
        var clash = ExistingCodes(table, specs.Select(x => (x.TrtCd, x.TrtSb)).ToList());
        if (clash.Count > 0)
            return new SeedResult(table, [], 
                $"mã đích đã có sẵn trong {table}: {string.Join(", ", clash)}. " +
                "Hoặc master thật dùng mã đó (đổi drugPathB.pathBTrtCd/noMedTrtCd), hoặc một " +
                $"lượt chạy trước chưa dọn (DELETE FROM {table} WHERE TRT_CD IN (…); " +
                "DELETE FROM MST_MED WHERE TRT_CD IN (…)).");

        var cols = ColumnsOf(table);
        if (cols.Count == 0) return new SeedResult(table, [], $"không đọc được cột của {table}");

        var created = new List<SeedSpec>();
        using var con = Open();
        using var tx = con.BeginTransaction();
        try
        {
            foreach (var spec in specs)
            {
                // TRT_CD / TRT_SB / TRT_NM / CCT_NM lấy từ tham số, phần còn lại chép nguyên.
                var select = string.Join(", ", cols.Select(c => c.ToUpperInvariant() switch
                {
                    "TRT_CD" => "@cd",
                    "TRT_SB" => "@sb",
                    "TRT_NM" => "@nm",
                    "CCT_NM" => "@nm",
                    _ => "src." + c,
                }));

                using var ins = Cmd(con,
                    $"INSERT INTO {table} ({string.Join(", ", cols)}) " +
                    $"SELECT {select} FROM {table} src " +
                    "WHERE src.TRT_CD = @fromCd AND src.TRT_SB = @fromSb", tx);
                ins.Parameters.Add("@cd", SqlDbType.SmallInt).Value = spec.TrtCd;
                ins.Parameters.Add("@sb", SqlDbType.TinyInt).Value = spec.TrtSb;
                ins.Parameters.Add("@nm", SqlDbType.NVarChar, 80).Value = spec.TrtNm;
                ins.Parameters.Add("@fromCd", SqlDbType.SmallInt).Value = cloneFrom.TrtCd;
                ins.Parameters.Add("@fromSb", SqlDbType.TinyInt).Value = cloneFrom.TrtSb;

                if (ins.ExecuteNonQuery() != 1)
                {
                    tx.Rollback();
                    return new SeedResult(table, [],
                        $"clone {cloneFrom.TrtCd}/{cloneFrom.TrtSb} → {spec.TrtCd}/{spec.TrtSb} " +
                        "không chèn được đúng 1 dòng — dòng nguồn có tồn tại trong " + table + " không?");
                }

                if (spec.WantsUsage)
                {
                    // MST_MED: mọi cột NOT NULL, F1..F10 là varchar ⇒ phải đưa chuỗi rỗng.
                    using var med = Cmd(con,
                        """
                        INSERT INTO MST_MED (TRT_CD, TRT_SB, GRP, USAGE,
                                             F1, F2, F3, F4, F5, F6, F7, F8, F9, F10)
                        VALUES (@cd, @sb, @grp, @usage, '', '', '', '', '', '', '', '', '', '')
                        """, tx);
                    med.Parameters.Add("@cd", SqlDbType.SmallInt).Value = spec.TrtCd;
                    med.Parameters.Add("@sb", SqlDbType.TinyInt).Value = spec.TrtSb;
                    med.Parameters.Add("@grp", SqlDbType.SmallInt).Value = 1;
                    med.Parameters.Add("@usage", SqlDbType.VarChar, 100).Value = spec.Usage;
                    med.ExecuteNonQuery();
                }

                created.Add(spec);
            }
            tx.Commit();
        }
        catch (Exception e)
        {
            try { tx.Rollback(); } catch { /* */ }
            return new SeedResult(table, [], e.Message);
        }
        return new SeedResult(table, created, null);
    }

    /// <summary>
    /// Xoá HẲN các mã đã seed khỏi bảng master và <c>MST_MED</c>.
    ///
    /// <para>Xoá theo <b>khoá mình vừa tạo</b>, không theo ảnh chụp: lượt chạy này chỉ
    /// THÊM dòng, nên dọn là xoá đúng những dòng đó. Gọi được nhiều lần (idempotent) —
    /// cần thế vì nó chạy cả ở <c>TearDown</c> lẫn <c>OneTimeTearDown</c>.</para>
    /// </summary>
    public string Cleanup(DateTime date, IReadOnlyList<(int TrtCd, int TrtSb)> keys)
    {
        if (keys.Count == 0) return "không có mã nào để dọn.";
        var table = ActiveTrtTable(date);

        var done = new List<string>();
        using var con = Open();
        using var tx = con.BeginTransaction();
        try
        {
            foreach (var (cd, sb) in keys)
            {
                var n = 0;
                using (var d1 = Cmd(con, $"DELETE FROM {table} WHERE TRT_CD = @cd AND TRT_SB = @sb", tx))
                {
                    d1.Parameters.Add("@cd", SqlDbType.SmallInt).Value = cd;
                    d1.Parameters.Add("@sb", SqlDbType.TinyInt).Value = sb;
                    n += d1.ExecuteNonQuery();
                }
                using (var d2 = Cmd(con, "DELETE FROM MST_MED WHERE TRT_CD = @cd AND TRT_SB = @sb", tx))
                {
                    d2.Parameters.Add("@cd", SqlDbType.SmallInt).Value = cd;
                    d2.Parameters.Add("@sb", SqlDbType.TinyInt).Value = sb;
                    n += d2.ExecuteNonQuery();
                }
                if (n > 0) done.Add($"{cd}/{sb} ({n} dòng)");
            }
            tx.Commit();
        }
        catch (Exception e)
        {
            try { tx.Rollback(); } catch { /* */ }
            return $"⛔ KHÔNG dọn được — SỬA TAY: DELETE FROM {table} WHERE TRT_CD IN " +
                   $"({string.Join(",", keys.Select(k => k.TrtCd))}); và tương tự cho MST_MED. " +
                   $"Lỗi: {e.Message}";
        }
        return done.Count == 0
            ? "không còn dòng seed nào (đã dọn từ trước)."
            : "đã dọn: " + string.Join(" · ", done);
    }

    /// <summary>Những mã trong danh sách ĐÃ có sẵn trong bảng master — hàng rào trước khi seed.</summary>
    public IReadOnlyList<string> ExistingCodes(string table, IReadOnlyList<(int TrtCd, int TrtSb)> keys)
    {
        var found = new List<string>();
        using var con = Open();
        foreach (var (cd, sb) in keys)
        {
            using var cmd = Cmd(con, $"SELECT COUNT(*) FROM {table} WHERE TRT_CD = @cd AND TRT_SB = @sb");
            cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = cd;
            cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = sb;
            if (Convert.ToInt32(cmd.ExecuteScalar()) > 0) found.Add($"{cd}/{sb}");
        }
        return found;
    }

    /// <summary>Tên các cột của bảng master, đúng thứ tự khai báo.</summary>
    private IReadOnlyList<string> ColumnsOf(string table)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT c.name FROM sys.columns c
             WHERE c.object_id = OBJECT_ID(@t) AND c.is_computed = 0
             ORDER BY c.column_id
            """);
        cmd.Parameters.Add("@t", SqlDbType.NVarChar, 128).Value = table;
        var cols = new List<string>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) cols.Add(r.GetString(0));
        return cols;
    }

    private static string Str(SqlDataReader r, int i) =>
        r.IsDBNull(i) ? "" : (r.GetValue(i)?.ToString() ?? "").Trim();
}
