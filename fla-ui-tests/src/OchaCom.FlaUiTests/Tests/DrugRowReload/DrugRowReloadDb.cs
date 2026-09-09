using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugRowReload;

/// <summary>
/// Dữ liệu cho luồng <b>G3 — dựng lại dòng thuốc khi LOAD lưới</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// WINFORM KHÔNG HIỆN <c>dsp_trt</c> ĐÃ LƯU CHO DÒNG 薬剤
/// ═══════════════════════════════════════════════════════════════════════════
/// Mỗi lần nạp 診療入力, dòng có <c>trt_cd</c> 600–699 <b>không</b> lấy chuỗi
/// <c>trn_trn.dsp_trt</c> ra hiện. Nó <b>dựng lại</b> từ master + <c>freewd</c>:
/// <code>
/// modSave.cs:2627-2637   GetTrnRs — lưới THÁNG HIỆN HÀNH
///     if (isCodeRange(drug, trt_cd)) {
///         drugInfStr = getDrugName(con, null, raiin_cnt, trt_cd, trt_sb,
///                                  trt_cnt, trt_dt, dsp_trt, freewd, true);
///         hFG1[2] = drugInfStr.combineDrugNmsStr;          ← dsp_trt bị BỎ QUA
///         if (drugInfStr.drugRxData != null)
///             hFG1[2].ReadOnly = true;                     ← CHỈ khi path A
///     } else {
///         hFG1[2] = REGIRYO_PADLEFT + dsp_trt;             ← mã khác thì hiện nguyên
///     }
///
/// modSave.cs:4961-4974   lưới QUÁ KHỨ — y hệt, nhưng ReadOnly VÔ ĐIỀU KIỆN
/// </code>
///
/// <para>Chú ý cái tên <c>#region</c> ngay trên đoạn đó:
/// <c>"hFG1[ 2, intRow].Value = "\t" + rsTrn["dsp_trt"];"</c> — chính là dòng code CŨ
/// mà phép dựng lại đã thay thế. Nó còn nằm đó như một dấu vết.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHỖ BẢN WEB LỆCH
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>treatment-table-mapper.ts:160,234</c> đọc thẳng <c>name: dspTrt</c> cho MỌI dòng —
/// không có nhánh <c>isDrugCode</c> nào trong luồng load (<c>isDrugCode</c> chỉ tồn tại
/// ở <c>treatment-entry-shared.ts:426</c>, tức đường NHẬP).
///
/// ⇒ Hai bên chỉ giống nhau chừng nào <c>dsp_trt</c> đã lưu vẫn đúng bằng cái mà master
/// dựng lại. Lệch xuất hiện khi <b>master đổi</b> (đổi giá thuốc, đổi tên, hết hiệu lực)
/// hoặc khi <b>freewd khác mặc định</b> — mà freewd khác mặc định chính là thứ luồng G1
/// (薬剤使用量選択) sinh ra.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ LUỒNG NÀY GHI THẲNG <c>TRNTRN</c> — NẶNG NHẤT TỪ TRƯỚC TỚI NAY
/// ═══════════════════════════════════════════════════════════════════════════
/// Không có đường nào khác: thứ đang đo là <b>đường LOAD</b>, nên dữ liệu phải nằm sẵn
/// trong <c>TRNTRN</c> TRƯỚC khi màn hình mở. Và để phân biệt được 「hiện dsp_trt đã lưu」
/// với 「dựng lại từ master」 thì <c>dsp_trt</c> phải được đặt <b>KHÁC HẲN</b> cái mà
/// master sẽ dựng — tức phải là một chuỗi bịa.
///
/// <para>Ba hàng rào:</para>
/// <list type="number">
/// <item>Nằm sau cờ RIÊNG <c>drugRowReload.allowSeed</c> (mặc định TẮT).</item>
/// <item><b>CHỈ CHÈN</b> dòng mới mang <c>DISP_NO</c> riêng của luồng
///   (<see cref="TestSettings.DrugRowReloadSection.DispNo"/>) — không bao giờ sửa hay
///   xoá dòng có sẵn. Dọn là <c>DELETE</c> đúng <c>DISP_NO</c> đó.</item>
/// <item>Chèn bằng <b>clone</b> một dòng có sẵn của chính bệnh nhân test rồi ghi đè vài
///   cột, nên mọi cột NOT NULL (枝番, 保険, DrNo…) đều đúng bối cảnh — viết tay 80 cột
///   là chỗ chắc chắn sẽ sai.</item>
/// </list>
///
/// <para><c>SEQ</c> là IDENTITY nên không truyền; PK là
/// <c>(PAT_NO, TRT_DT, DISP_NO, SEQ)</c>.</para>
/// </summary>
public sealed class DrugRowReloadDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private DrugRowReloadDb(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static DrugRowReloadDb? CreateOrNull(TestSettings s)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new DrugRowReloadDb(db.ConnectionString, db.CommandTimeoutSeconds);
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

    // ─────────────────────────────────────────────────────────────────────────
    // ① Đọc bối cảnh
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một dòng <c>TRNTRN</c> — để in ra và để khẳng định seed đã vào.</summary>
    public sealed record TrnRow(int DispNo, int Seq, int TrtCd, int TrtSb, int TrtCnt,
                                int TrtPt, string FreeWd, string DspTrt)
    {
        public override string ToString() =>
            $"disp_no {DispNo} seq {Seq}: {TrtCd}/{TrtSb} 点={TrtPt} 回={TrtCnt} " +
            $"freewd=「{FreeWd}」 dsp_trt=「{DspTrt}」";
    }

    public IReadOnlyList<TrnRow> ReadDay(int patNo, DateTime day)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT DISP_NO, SEQ, TRT_CD, TRT_SB, TRT_CNT, TRT_PT,
                   ISNULL(FREEWD,''), ISNULL(DSP_TRT,'')
              FROM TRNTRN
             WHERE PAT_NO = @pat AND TRT_DT = @d AND DEL_FLG = 0
             ORDER BY DISP_NO, SEQ
            """);
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = day.Date;

        var list = new List<TrnRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new TrnRow(Convert.ToInt32(r.GetValue(0)), Convert.ToInt32(r.GetValue(1)),
                                Convert.ToInt32(r.GetValue(2)), Convert.ToInt32(r.GetValue(3)),
                                Convert.ToInt32(r.GetValue(4)), Convert.ToInt32(r.GetValue(5)),
                                Str(r, 6), Str(r, 7)));
        return list;
    }

    /// <summary>
    /// Thành phần thuốc mà master sẽ dùng để DỰNG LẠI dòng — 単位 và 使用量 mặc định.
    /// Rỗng ⇒ mã đó ở path B (không có 処置変換), khi đó phép dựng lại rẽ nhánh khác.
    /// </summary>
    /// <param name="UsageNm"><c>mst_drug_rx.usage_nm</c> — dòng 用法 của path A.</param>
    /// <param name="MedKbn">'21' → 「n日分」 · '22' → 「n回分」 · khác → không có hậu tố 用量.</param>
    public sealed record DrugMaster(string TrtNm, string DgNm, string UnitNm, string DefaultCnt,
                                    string UsageNm, string MedKbn, int GCnt, int Score1)
    {
        public bool HasRx => DgNm.Length > 0;

        /// <summary>単位 rút gọn — 「錠」 in ra lưới là 「T」 (EditControl.cs:1160-1190).</summary>
        public string ShortUnit => DrugAmountSelect.DrugAmountFlow.ShortUnit(UnitNm);

        public override string ToString() =>
            $"「{TrtNm}」 mst_drug「{DgNm}」 {DefaultCnt}{UnitNm} · 用法「{UsageNm}」 " +
            $"med_kbn={MedKbn} g_cnt={GCnt} score1={Score1}";
    }

    /// <summary>Master + 処置変換 của mã đem thử, cho ngày test.</summary>
    public DrugMaster? Master(DateTime date, int trtCd, int trtSb)
    {
        var table = ActiveTrtTable(date);
        var appDt = date.ToString("yyyyMMdd");

        using var con = Open();
        using var cmd = Cmd(con, $"""
            SELECT t.TRT_NM, t.G_CNT, t.SCORE1,
                   ISNULL(d.DG_NM,''), ISNULL(d.UNIT_NM,''), ISNULL(rx.cnt1,''),
                   ISNULL(rx.usage_nm,''), ISNULL(rx.med_kbn,'')
              FROM {table} t
              LEFT JOIN MST_DRUG_RX rx ON rx.trt_cd = t.TRT_CD AND rx.trt_sb = t.TRT_SB
                                      AND @app BETWEEN rx.app_st_dt AND rx.app_ed_dt
              LEFT JOIN MST_DRUG d ON d.DG_CD = rx.dg_cd1
                                  AND @app BETWEEN d.APP_ST_DT AND d.APP_ED_DT
             WHERE t.TRT_CD = @cd AND t.TRT_SB = @sb
            """);
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = trtSb;
        cmd.Parameters.Add("@app", SqlDbType.VarChar, 8).Value = appDt;

        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        return new DrugMaster(Str(r, 0), Str(r, 3), Str(r, 4), Str(r, 5), Str(r, 6), Str(r, 7),
                              Convert.ToInt32(r.GetValue(1)), Convert.ToInt32(r.GetValue(2)));
    }

    /// <summary>Bảng master áp dụng cho ngày đó (bản sao tự chứa — xem <c>DrugPathBDb</c>).</summary>
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
            throw new InvalidOperationException($"TRT_SEL không phủ ngày {date:yyyy-MM-dd}.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, "^MST[A-Za-z0-9_]*$"))
            throw new InvalidOperationException($"Tên bảng master lạ: 「{name}」");
        return name;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ② Seed — CHỈ CHÈN, và chỉ vào DISP_NO riêng của luồng
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một dòng <c>TRNTRN</c> cần dựng.</summary>
    /// <param name="DspTrt">
    /// Chuỗi 療法・処置 <b>đã lưu</b>. Với dòng 薬剤 thì đây cố ý là một chuỗi BỊA —
    /// nếu nó hiện ra trên lưới thì app đang đọc <c>dsp_trt</c>, còn nếu nó biến mất thì
    /// app đang dựng lại từ master. Đó là toàn bộ phép đo.
    /// </param>
    /// <param name="FreeWd">
    /// <c>freewd</c> — chuỗi 使用量 mà 薬剤使用量選択 ghi ra. Đặt KHÁC 使用量 mặc định
    /// của master thì mới thấy được phép dựng lại có đọc nó hay không.
    /// </param>
    public sealed record SeedRow(int DispNo, int TrtCd, int TrtSb, int TrtCnt, int TrtPt,
                                 string FreeWd, string DspTrt);

    /// <param name="Blocker">Khác null ⇒ KHÔNG seed được; testcase phải Ignore kèm lý do này.</param>
    public sealed record SeedResult(IReadOnlyList<SeedRow> Created, string? Blocker)
    {
        public override string ToString() =>
            Blocker is not null
                ? $"KHÔNG seed được: {Blocker}"
                : "đã chèn " + string.Join(" · ",
                      Created.Select(c => $"disp_no {c.DispNo} = {c.TrtCd}/{c.TrtSb} " +
                                          $"点 {c.TrtPt} freewd「{c.FreeWd}」 dsp_trt「{c.DspTrt}」"));
    }

    /// <summary>
    /// Chèn các dòng seed bằng cách <b>clone</b> một dòng có sẵn của chính bệnh nhân +
    /// ngày test rồi ghi đè các cột đang đo.
    ///
    /// <para>Clone mới lấy đủ bối cảnh: <c>PAT_BR</c>, <c>INSU_CD</c>, <c>DR_NO</c>,
    /// <c>SYOSIN_FLG</c>, 32 cột <c>BUI</c>, 20 cột <c>DIS_*</c>… Danh sách cột dựng từ
    /// <c>sys.columns</c> và bỏ <c>SEQ</c> (IDENTITY).</para>
    ///
    /// <para>Hàng rào: <c>DISP_NO</c> đích đã tồn tại ⇒ DỪNG, bắt dọn tay — không ghi đè
    /// dòng nào (F22).</para>
    /// </summary>
    public SeedResult Seed(int patNo, DateTime day, IReadOnlyList<SeedRow> rows)
    {
        if (rows.Count == 0) return new SeedResult([], "danh sách seed rỗng");

        var existing = ReadDay(patNo, day);
        if (existing.Count == 0)
            return new SeedResult([],
                $"bệnh nhân {patNo} không có dòng TRNTRN nào ngày {day:yyyy-MM-dd} — không có " +
                "dòng nguồn để clone. Chọn ngày mà bệnh nhân test đã có dữ liệu.");

        var clash = rows.Where(r => existing.Any(e => e.DispNo == r.DispNo))
                        .Select(r => r.DispNo).ToList();
        if (clash.Count > 0)
            return new SeedResult([],
                $"disp_no {string.Join(",", clash)} đã có sẵn trong ngày {day:yyyy-MM-dd}. " +
                "Hoặc dữ liệu thật dùng số đó (đổi drugRowReload.dispNo), hoặc một lượt chạy " +
                $"trước chưa dọn (DELETE FROM TRNTRN WHERE PAT_NO={patNo} AND " +
                $"TRT_DT='{day:yyyy-MM-dd}' AND DISP_NO IN ({string.Join(",", clash)})).");

        var cols = ColumnsOf("TRNTRN").Where(c => !c.Equals("SEQ", StringComparison.OrdinalIgnoreCase))
                                      .ToList();
        if (cols.Count == 0) return new SeedResult([], "không đọc được cột của TRNTRN");

        var srcSeq = existing[0].Seq;
        var created = new List<SeedRow>();

        using var con = Open();
        using var tx = con.BeginTransaction();
        try
        {
            foreach (var row in rows)
            {
                var select = string.Join(", ", cols.Select(c => c.ToUpperInvariant() switch
                {
                    "DISP_NO" => "@disp",
                    "TRT_CD" => "@cd",
                    "TRT_SB" => "@sb",
                    "TRT_CNT" => "@cnt",
                    "TRT_PT" => "@pt",
                    "FREEWD" => "@free",
                    "DSP_TRT" => "@dsp",
                    "DEL_FLG" => "0",
                    _ => "src." + c,
                }));

                using var ins = Cmd(con,
                    $"INSERT INTO TRNTRN ({string.Join(", ", cols)}) " +
                    $"SELECT {select} FROM TRNTRN src WHERE src.SEQ = @srcSeq", tx);
                ins.Parameters.Add("@disp", SqlDbType.Int).Value = row.DispNo;
                ins.Parameters.Add("@cd", SqlDbType.SmallInt).Value = row.TrtCd;
                ins.Parameters.Add("@sb", SqlDbType.TinyInt).Value = row.TrtSb;
                ins.Parameters.Add("@cnt", SqlDbType.TinyInt).Value = row.TrtCnt;
                ins.Parameters.Add("@pt", SqlDbType.Int).Value = row.TrtPt;
                ins.Parameters.Add("@free", SqlDbType.VarChar, 100).Value = row.FreeWd;
                ins.Parameters.Add("@dsp", SqlDbType.VarChar, 200).Value = row.DspTrt;
                ins.Parameters.Add("@srcSeq", SqlDbType.Int).Value = srcSeq;

                if (ins.ExecuteNonQuery() != 1)
                {
                    tx.Rollback();
                    return new SeedResult([], $"chèn disp_no {row.DispNo} không được đúng 1 dòng");
                }
                created.Add(row);
            }
            tx.Commit();
        }
        catch (Exception e)
        {
            try { tx.Rollback(); } catch { /* */ }
            return new SeedResult([], e.Message);
        }
        return new SeedResult(created, null);
    }

    /// <summary>
    /// Xoá HẲN các dòng seed theo <c>DISP_NO</c>. Gọi được nhiều lần (idempotent) — cần
    /// thế vì nó chạy cả trước khi seed lẫn ở <c>OneTimeTearDown</c>.
    /// </summary>
    public string Cleanup(int patNo, DateTime day, IReadOnlyList<int> dispNos)
    {
        if (dispNos.Count == 0) return "không có disp_no nào để dọn.";
        using var con = Open();
        using var cmd = Cmd(con,
            "DELETE FROM TRNTRN WHERE PAT_NO = @pat AND TRT_DT = @d AND DISP_NO IN (" +
            string.Join(",", dispNos) + ")");
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = day.Date;
        var n = cmd.ExecuteNonQuery();
        return n == 0 ? "không còn dòng seed nào (đã dọn từ trước)." : $"đã xoá {n} dòng seed.";
    }

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
