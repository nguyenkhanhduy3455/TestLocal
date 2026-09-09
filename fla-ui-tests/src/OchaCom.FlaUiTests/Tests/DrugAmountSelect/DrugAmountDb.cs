using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugAmountSelect;

/// <summary>
/// Dữ liệu cho luồng <b>G1 — 薬剤使用量選択 (frm203020)</b>: tìm mã thuốc đem thử, bật cờ
/// mở hộp thoại, và dựng lại BẰNG SỐ cái mà WinForm sẽ in ra trên hộp thoại đó.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI SEED — DỮ LIỆU DEV CHE MẤT CẢ MÀN HÌNH
/// ═══════════════════════════════════════════════════════════════════════════
/// Cửa duy nhất mở 薬剤使用量選択 là <c>mst_trt.F2 == 1</c> (数量変更可,
/// frm203016.cs:1426). Trên SIM2000 của máy dev, bảng master đang áp dụng
/// (<c>MST_TRT266</c>) có <b>0 dòng nào F2 = 1</b> — đo 2026-09-09:
/// <code>
/// SELECT COUNT(*) FROM MST_TRT266 WHERE F2 = 1   -->  0
/// </code>
/// 63 mã thuốc dải 600–699 đều F2 = 0. Nghĩa là <b>không thao tác nào trên giao diện
/// mở được hộp thoại này</b>, và mọi lượt chạy "thử xem sao" đều xanh vì chẳng có gì
/// xảy ra. Muốn đo thì phải bật cờ đó lên — đúng một cột, đúng một dòng.
///
/// ⚠️ Cột F2 nằm ở <b>bảng master dùng chung cả phòng khám</b>, không phải dữ liệu của
/// bệnh nhân test. Vì thế: cờ riêng <c>drugAmount.allowSeed</c> mặc định TẮT, chụp
/// nguyên trạng TRƯỚC khi ghi, IN RA STDOUT, và trả lại ở <c>OneTimeTearDown</c> (F20).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ORACLE — 点数 THẬT của hộp thoại, tính bằng chính công thức của WinForm
/// ═══════════════════════════════════════════════════════════════════════════
/// <see cref="Point"/> là bản chép NGUYÊN VĂN <c>frm203020.getPoint</c>
/// (frm203020.cs:492-518), <see cref="CostSum"/> chép <c>setTable</c> + <c>getSum</c>
/// (:402-419, :523-561). Kiểm chứng trên dữ liệu thật 2026-09-09: với 使用量 MẶC ĐỊNH
/// (<c>mst_drug_rx.cnt</c>), công thức trả về ĐÚNG BẰNG <c>MST_TRT266.SCORE1</c> cho cả
/// 12 mã thuốc một thành phần đang còn hiệu lực — xem <see cref="ScoreOracleMismatches"/>.
///
/// <b>Chính chỗ trùng khít đó là cái làm lệch parity ẩn đi.</b> Bản web lấy điểm thẳng từ
/// <c>mst_trt.score1</c> (ResolveDrugHandler.cs:33) nên nó đúng — nhưng chỉ đúng ở
/// 使用量 mặc định. Đổi 数量 một cái là WinForm tính lại còn web thì không.
/// </summary>
public sealed class DrugAmountDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private DrugAmountDb(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static DrugAmountDb? CreateOrNull(TestSettings s)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new DrugAmountDb(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    /// <summary>Thử kết nối; hỏng thì trả về câu lỗi để fixture Ignore có lý do rõ ràng.</summary>
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
    // ① Bảng master đang áp dụng
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Tên bảng master áp dụng cho ngày đó (<c>MST_TRT266</c>…), lấy từ <c>TRT_SEL</c> —
    /// đúng bảng mà <c>ModCommon.Get_strTrt</c> chọn, và cũng là bảng mà
    /// <c>frmTrtSel_Let_Trt_Data</c> đọc <c>F2</c>/<c>F3</c> ra (frm203016.cs:1402, :1413).
    ///
    /// <para>Bản sao có chủ ý của <c>OchaDb.ActiveTrtTable</c>: lớp này phải GHI được,
    /// còn <c>OchaDb</c> tự nhận là chỉ đọc và không nên mở cửa cho ai ghi qua nó.</para>
    /// </summary>
    public string ActiveTrtTable(DateTime date)
    {
        using var con = Open();
        using var cmd = Cmd(con,
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
                $"TRT_SEL không có bản master nào phủ ngày {date:yyyy-MM-dd} — app cũng sẽ không nạp được lưới.");

        // Tên bảng phải nối chuỗi vào SQL (không tham số hoá được), nên chặn ở đây.
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, "^MST[A-Za-z0-9_]*$"))
            throw new InvalidOperationException($"Tên bảng master lạ trong TRT_SEL: 「{name}」");

        return name;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ② Ứng viên: một mã thuốc + các thành phần của nó
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một thành phần thuốc = một dòng của lưới 薬剤使用量選択.</summary>
    /// <param name="DgCd">Mã thuốc (<c>mst_drug_rx.dg_cd{i}</c>) — cột ẨN của lưới.</param>
    /// <param name="Cnt">使用量 MẶC ĐỊNH (<c>cnt{i}</c>), tức <c>med_cnt_base</c>.</param>
    /// <param name="DgNm">薬剤名称 (<c>mst_drug.dg_nm</c>).</param>
    /// <param name="UnitNm">単位.</param>
    /// <param name="CostType">
    /// 単位タイプ. <b>「3」 là dòng KHÔNG đổi được</b>: <c>CellClick</c> bỏ qua (:321) và
    /// <c>CellValidating</c> huỷ luôn phép sửa (:279-284), và 薬価計 của nó = 薬価 chứ
    /// không nhân 使用量 (:409-414).
    /// </param>
    /// <param name="Cost">薬価 (<c>mst_drug.cost</c>).</param>
    public sealed record Component(string DgCd, string Cnt, string DgNm, string UnitNm,
                                   string CostType, decimal Cost)
    {
        public float CntF => float.TryParse(Cnt, out var f) ? f : 0f;
        public bool Fixed => CostType == "3";

        public override string ToString() =>
            $"{DgCd} 「{DgNm}」 薬価 {Cost} × {Cnt}{UnitNm} (cost_type={CostType})";
    }

    /// <summary>
    /// Một mã 処置 dải 薬剤 600–699 có bản 処置変換 (<c>mst_drug_rx</c>) còn hiệu lực —
    /// tức là hộp thoại sẽ có dòng để hiện.
    /// </summary>
    /// <param name="SbCount">
    /// Số 枝番 của <b>cùng</b> <c>trt_cd</c> trong master. <b>Quyết định đường đi của UI</b>:
    /// <c>intRowCnt == 1</c> ⇒ modMain.cs:475 gọi thẳng
    /// <c>frm203016_Hide_Let_Trt_Data(0)</c> ⇒ <b>処置選択 KHÔNG hiện</b>, hộp thoại
    /// 薬剤使用量選択 bung ra ngay sau khi gõ mã. &gt; 1 ⇒ 処置選択 hiện như thường lệ
    /// (modMain.cs:485).
    /// </param>
    public sealed record DrugCandidate(int TrtCd, int TrtSb, string TrtNm, int Score1,
                                       int F2, int F3, int GCnt, int SbCount,
                                       IReadOnlyList<Component> Components)
    {
        /// <summary>Có mấy dòng sẽ hiện trên lưới hộp thoại (dg_cd rỗng thì dừng, :438-449).</summary>
        public int RowCount => Components.Count;

        /// <summary>Dòng nào SỬA ĐƯỢC 使用量 — cost_type khác 「3」.</summary>
        public IReadOnlyList<Component> Editable => Components.Where(c => !c.Fixed).ToList();

        /// <summary>使用量 mặc định của từng dòng, theo đúng thứ tự lưới.</summary>
        public IReadOnlyList<float> BaseCounts => Components.Select(c => c.CntF).ToList();

        public override string ToString() =>
            $"{TrtCd}/{TrtSb} 「{TrtNm}」 score1={Score1} F2={F2} F3={F3} g_cnt={GCnt} " +
            $"枝番×{SbCount} · {RowCount} thành phần";
    }

    /// <summary>
    /// Mọi mã thuốc 600–699 có <c>mst_drug_rx</c> phủ ngày <paramref name="date"/>, kèm
    /// thành phần đã nối sang <c>mst_drug</c> — đúng phép nối mà
    /// <c>MstDrugRX.getMstDrugRXListJoinMstDrug</c> làm (MstDrugRX.cs:120-192): khoá
    /// <c>dg_cd</c> chỉ khớp khi <c>LEN(dg_cd) = 9</c>, và <c>mst_drug</c> phải còn hiệu
    /// lực CÙNG ngày.
    ///
    /// <para>Chỉ lấy tối đa <c>dg_cd1..dg_cd3</c>: hộp thoại đọc tới 10 nhưng dữ liệu thật
    /// không có dòng nào quá 2 thành phần, và mở rộng chỉ làm câu SQL dài ra.</para>
    /// </summary>
    public IReadOnlyList<DrugCandidate> Candidates(DateTime date)
    {
        var table = ActiveTrtTable(date);
        var appDt = date.ToString("yyyyMMdd");

        var sql = $"""
            SELECT t.TRT_CD, t.TRT_SB, t.TRT_NM, t.SCORE1, t.F2, t.F3, t.G_CNT,
                   (SELECT COUNT(*) FROM {table} s WHERE s.TRT_CD = t.TRT_CD) AS SB_COUNT,
                   rx.dg_cd1, rx.cnt1, rx.dg_cd2, rx.cnt2, rx.dg_cd3, rx.cnt3,
                   d1.DG_NM, d1.UNIT_NM, d1.COST_TYPE, d1.COST,
                   d2.DG_NM, d2.UNIT_NM, d2.COST_TYPE, d2.COST,
                   d3.DG_NM, d3.UNIT_NM, d3.COST_TYPE, d3.COST
              FROM {table} t
              JOIN MST_DRUG_RX rx
                ON rx.trt_cd = t.TRT_CD AND rx.trt_sb = t.TRT_SB
               AND @app BETWEEN rx.app_st_dt AND rx.app_ed_dt
              LEFT JOIN MST_DRUG d1 ON LEN(rx.dg_cd1) = 9 AND d1.DG_CD = rx.dg_cd1
                                   AND @app BETWEEN d1.APP_ST_DT AND d1.APP_ED_DT
              LEFT JOIN MST_DRUG d2 ON LEN(rx.dg_cd2) = 9 AND d2.DG_CD = rx.dg_cd2
                                   AND @app BETWEEN d2.APP_ST_DT AND d2.APP_ED_DT
              LEFT JOIN MST_DRUG d3 ON LEN(rx.dg_cd3) = 9 AND d3.DG_CD = rx.dg_cd3
                                   AND @app BETWEEN d3.APP_ST_DT AND d3.APP_ED_DT
             WHERE t.TRT_CD BETWEEN 600 AND 699
             ORDER BY t.TRT_CD, t.TRT_SB
            """;

        using var con = Open();
        using var cmd = Cmd(con, sql);
        cmd.Parameters.Add("@app", SqlDbType.VarChar, 8).Value = appDt;

        var list = new List<DrugCandidate>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var parts = new List<Component>();
            for (var i = 0; i < 3; i++)
            {
                var dgCd = Str(r, 8 + i * 2);
                if (dgCd.Length == 0) break;                 // :439 「dg_cd rỗng thì dừng」

                // ⚠️ Nối KHÔNG ra mst_drug thì VẪN tính là một dòng. `getViewData` chỉ
                // kiểm `dg_cd != ""` rồi gọi `setTable` (frm203020.cs:439-448), và
                // `setTable` cho 薬価 null đi qua `editStringToFloat("") = 0` (:413).
                // Bỏ dòng đó đi là lệch cả số dòng lẫn thứ tự của `free_wd`.
                var b = 14 + i * 4;
                parts.Add(new Component(
                    dgCd, Str(r, 9 + i * 2), Str(r, b), Str(r, b + 1), Str(r, b + 2),
                    r.IsDBNull(b + 3) ? 0m : r.GetDecimal(b + 3)));
            }

            list.Add(new DrugCandidate(
                Convert.ToInt32(r.GetValue(0)), Convert.ToInt32(r.GetValue(1)), Str(r, 2),
                Convert.ToInt32(r.GetValue(3)), Convert.ToInt32(r.GetValue(4)),
                Convert.ToInt32(r.GetValue(5)), Convert.ToInt32(r.GetValue(6)),
                Convert.ToInt32(r.GetValue(7)), parts));
        }
        return list;
    }

    /// <summary>Một ứng viên cụ thể; null khi mã đó không có bản 処置変換 phủ ngày đó.</summary>
    public DrugCandidate? Candidate(DateTime date, int trtCd, int trtSb) =>
        Candidates(date).FirstOrDefault(c => c.TrtCd == trtCd && c.TrtSb == trtSb);

    /// <summary>
    /// Ứng viên MẶC ĐỊNH khi cấu hình để trống: mã đơn giản nhất mà vẫn đo được.
    ///
    /// <list type="bullet">
    /// <item>đúng MỘT 枝番 ⇒ 処置選択 không hiện, lượt chạy ngắn đi một cửa sổ (F7);</item>
    /// <item>đúng MỘT thành phần ⇒ <c>free_wd</c> chỉ có một số, dễ đọc lại;</item>
    /// <item><c>cost_type != 「3」</c> ⇒ 使用量 sửa được, nếu không thì chẳng có gì để đo;</item>
    /// <item><c>F3 != 2</c> ⇒ điểm khác 0, mới nhìn thấy được nó đổi (:494-497);</item>
    /// <item>薬価 × 使用量 &gt;= 15 ⇒ đang ở NHÁNH TÍNH chứ không phải nhánh trả cứng 1 điểm
    ///       (:505). Nhánh 1 điểm nuốt mất mọi thay đổi nhỏ.</item>
    /// </list>
    /// </summary>
    public DrugCandidate? DefaultCandidate(DateTime date) =>
        Candidates(date)
            .Where(c => c.SbCount == 1 && c.RowCount == 1 && c.F3 != 2)
            .Where(c => !c.Components[0].Fixed)
            .Where(c => CostSum(c, c.BaseCounts) >= 15f)
            .OrderBy(c => c.TrtCd)
            .FirstOrDefault();

    // ─────────────────────────────────────────────────────────────────────────
    // ③ Oracle — chép nguyên văn công thức của frm203020
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// 薬価計 của MỘT dòng — <c>setTable</c> (frm203020.cs:409-414) và
    /// <c>CellValidating</c>/<c>CellClick</c> (:296, :327) đều tính đúng thế này.
    ///
    /// <para><c>cost_type == 「3」</c> ⇒ 薬価計 = 薬価, <b>KHÔNG nhân 使用量</b>.</para>
    /// </summary>
    public static float RowCost(Component c, float count) =>
        c.Fixed ? (float)c.Cost : (float)c.Cost * count;

    /// <summary>
    /// 薬価合計 = tổng cột 薬価計 (<c>getSum</c>, :529-549).
    ///
    /// <para><paramref name="counts"/> phải cùng thứ tự với
    /// <see cref="DrugCandidate.Components"/>; thiếu phần tử nào thì lấy 使用量 mặc định.</para>
    /// </summary>
    /// <remarks>
    /// Tính bằng <c>float</c> chứ không <c>decimal</c> là CÓ CHỦ Ý: app dùng <c>float</c>
    /// và đi qua chuỗi (<c>editFloatToString</c> → <c>editStringToFloat</c>,
    /// EditControl.cs:294-299, :71-77), nên dùng kiểu rộng hơn sẽ cho ra số KHÁC app ở
    /// những giá trị mà float làm tròn.
    /// </remarks>
    public static float CostSum(DrugCandidate c, IReadOnlyList<float>? counts = null)
    {
        var sum = 0f;
        for (var i = 0; i < c.Components.Count; i++)
        {
            var n = counts is not null && i < counts.Count ? counts[i] : c.Components[i].CntF;
            sum += RowCost(c.Components[i], n);
        }
        return sum;
    }

    /// <summary>
    /// 点数 từ 薬価 — bản chép NGUYÊN VĂN <c>frm203020.getPoint</c> (frm203020.cs:492-518).
    /// Đừng "gọn lại" thành <c>ceil((cost-15)/10)+1</c>: hai nhánh đầu và phép cắt
    /// <c>(int)</c> trên <c>float</c> mới là thứ quyết định ở các giá trị biên.
    ///
    /// <para>⚠️ <b>Chú thích trong source TỰ MÂU THUẪN, và ta bám theo CODE.</b>
    /// <c>ParamData.F3</c> khai 「1:院内処方 2:院外処方」 (:31) còn <c>getPoint</c> lại chú
    /// nhánh <c>F3 == 2</c> là 「院内処方の場合」 (:494-495). Dữ liệu thật đứng về phía
    /// khai báo: 4 mã đang có <c>F3 = 2</c> (603, 622/1, 651, 660) đều mang
    /// <c>SCORE1 = 0</c> — tức 院外処方 thì phòng khám không tính điểm thuốc. Đo
    /// 2026-09-09 trên MST_TRT266.</para>
    /// </summary>
    public static float Point(float cost, float cnt, int f3)
    {
        if (f3 == 2) return 0;                       // :494-497

        const int basePoint = 15;
        const int basePoint2 = 1;
        var point = cost * cnt;

        if (point == 0) return 0;                    // :503
        if (point < basePoint) return basePoint2;    // :505

        var point2 = point - basePoint;
        var point3 = point2 / 10 + basePoint2;
        var point4 = (float)(int)point3;
        if (point4 > point3) point4 -= 1;
        return point3 - point4 > 0 ? point4 + 1 : point3;
    }

    /// <summary>点数合計 mà hộp thoại sẽ in ra ở <c>txtPointSum</c> — <c>getPoint(sum, 1)</c> (:555).</summary>
    public static float ExpectedPoint(DrugCandidate c, IReadOnlyList<float>? counts = null) =>
        Point(CostSum(c, counts), 1f, c.F3);

    /// <summary>薬価合計 mà hộp thoại in ra ở <c>txtCostSum</c> — <c>sum.ToString("0.00")</c> (:551).</summary>
    public static string ExpectedCostText(DrugCandidate c, IReadOnlyList<float>? counts = null) =>
        CostSum(c, counts).ToString("0.00");

    /// <summary>
    /// <c>free_wd</c> mà <c>setPacData</c> ghi xuống ô ẩn cột 72 của <c>grdRegi</c>
    /// (frm203020.cs:474-483 → frm203016.cs:1451): 使用量 của TỪNG dòng, ngăn bằng dấu phẩy,
    /// theo đúng thứ tự lưới. Đó chính là <c>trn_trn.freewd</c> sau khi F9 登録.
    /// </summary>
    public static string ExpectedFreeWd(DrugCandidate c, IReadOnlyList<float> counts) =>
        string.Join(",", Enumerable.Range(0, c.Components.Count)
                                   .Select(i => Fmt(i < counts.Count ? counts[i] : c.Components[i].CntF)));

    /// <summary>
    /// Số như WinForm in ra: <c>float.ToString()</c> chứ không phải <c>"0.00"</c>
    /// (EditControl.editFloatToString, EditControl.cs:294-299). 4 ⇒ 「4」, không phải 「4.00」.
    /// </summary>
    public static string Fmt(float f) => f.ToString("0.####");

    /// <summary>
    /// Những mã mà <see cref="ExpectedPoint"/> ở 使用量 MẶC ĐỊNH <b>không</b> bằng
    /// <c>SCORE1</c> — tức những chỗ oracle và master đã lệch sẵn từ đầu.
    ///
    /// <para>Danh sách này phải RỖNG thì hai vế parity mới nói được cùng một thứ: bản web
    /// trả <c>score1</c>, bản WinForm trả <c>getPoint</c>. Rỗng ⇒ ở 数量 mặc định hai bên
    /// trùng khít, và mọi khác biệt quan sát được sau đó là do 数量, không do master.</para>
    /// </summary>
    public IReadOnlyList<string> ScoreOracleMismatches(DateTime date) =>
        Candidates(date)
            .Where(c => c.RowCount > 0)
            .Select(c => (c, expected: ExpectedPoint(c)))
            .Where(x => Math.Abs(x.expected - x.c.Score1) > 0.001f)
            .Select(x => $"{x.c.TrtCd}/{x.c.TrtSb} 「{x.c.TrtNm}」 " +
                         $"score1={x.c.Score1} nhưng getPoint({CostSum(x.c):0.##}) = {x.expected:0.##}")
            .ToList();

    // ─────────────────────────────────────────────────────────────────────────
    // ④ Seed cờ F2 — chụp, in ra, trả lại (F20)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Ảnh chụp cờ <c>F2</c> của những dòng luồng này đụng tới.</summary>
    /// <param name="Table">Bảng master đang áp dụng — ghi lại vì tháng khác là bảng khác.</param>
    public sealed record F2Snapshot(string Table, IReadOnlyList<(int TrtCd, int TrtSb, int F2)> Rows)
    {
        public override string ToString() =>
            $"{Table}: " + string.Join(" · ", Rows.Select(r => $"{r.TrtCd}/{r.TrtSb} F2={r.F2}"));
    }

    /// <summary>
    /// Chụp <c>F2</c> của các cặp mã cho trước. <b>Gọi TRƯỚC mọi lệnh ghi</b> — chụp sau
    /// là chụp phải chính cái mốc mình vừa đặt, và teardown sẽ "khôi phục" về mốc đó (F20).
    /// </summary>
    public F2Snapshot TakeF2Snapshot(DateTime date, params (int TrtCd, int TrtSb)[] keys)
    {
        var table = ActiveTrtTable(date);
        var rows = new List<(int, int, int)>();

        using var con = Open();
        foreach (var (cd, sb) in keys)
        {
            using var cmd = Cmd(con, $"SELECT F2 FROM {table} WHERE TRT_CD = @cd AND TRT_SB = @sb");
            cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = cd;
            cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = sb;
            var v = cmd.ExecuteScalar();
            if (v is null || v == DBNull.Value)
                throw new InvalidOperationException(
                    $"{table} không có dòng {cd}/{sb} — mã đem thử phải có trong master ĐANG ÁP DỤNG.");
            rows.Add((cd, sb, Convert.ToInt32(v)));
        }
        return new F2Snapshot(table, rows);
    }

    /// <summary>Bật <c>F2 = 1</c> (数量変更可) cho một dòng master. Trả về số dòng đã đổi.</summary>
    public int SetF2(string table, int trtCd, int trtSb, int value)
    {
        using var con = Open();
        using var cmd = Cmd(con, $"UPDATE {table} SET F2 = @v WHERE TRT_CD = @cd AND TRT_SB = @sb");
        cmd.Parameters.Add("@v", SqlDbType.TinyInt).Value = value;
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = trtSb;
        return cmd.ExecuteNonQuery();
    }

    /// <summary>Trả <c>F2</c> về đúng ảnh chụp. Trả về câu mô tả để fixture in ra log.</summary>
    public string RestoreF2(F2Snapshot snap)
    {
        var done = new List<string>();
        using var con = Open();
        using var tx = con.BeginTransaction();
        try
        {
            foreach (var (cd, sb, f2) in snap.Rows)
            {
                using var cmd = Cmd(con,
                    $"UPDATE {snap.Table} SET F2 = @v WHERE TRT_CD = @cd AND TRT_SB = @sb", tx);
                cmd.Parameters.Add("@v", SqlDbType.TinyInt).Value = f2;
                cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = cd;
                cmd.Parameters.Add("@sb", SqlDbType.TinyInt).Value = sb;
                done.Add($"{cd}/{sb} → F2={f2} ({cmd.ExecuteNonQuery()} dòng)");
            }
            tx.Commit();
        }
        catch (Exception e)
        {
            try { tx.Rollback(); } catch { /* */ }
            return $"⛔ KHÔNG trả lại được F2 — SỬA TAY: {snap}. Lỗi: {e.Message}";
        }
        return $"đã trả lại F2 trên {snap.Table}: " + string.Join(" · ", done);
    }

    /// <summary>
    /// Đếm số dòng <c>F2 = 1</c> của cả bảng master — <b>hàng rào</b> trước khi seed.
    ///
    /// <para>Khác 0 nghĩa là bảng này VỐN đã có dòng 数量変更可 (dữ liệu thật, hoặc một
    /// lượt chạy trước chết giữa chừng chưa trả lại). Fixture phải in ra và tự quyết,
    /// chứ không được lặng lẽ ghi đè.</para>
    /// </summary>
    public int CountF2Enabled(string table)
    {
        using var con = Open();
        using var cmd = Cmd(con, $"SELECT COUNT(*) FROM {table} WHERE F2 = 1");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ⑤ Đọc kết quả sau F9 登録 (chỉ dùng khi allowSave bật)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// <c>freewd</c> + 点数 của các dòng <c>TRNTRN</c> mang mã <paramref name="trtCd"/>
    /// trong ngày — mốc DUY NHẤT chứng minh 数量 đã rơi xuống DB thật.
    ///
    /// <para>Chỉ có nghĩa SAU F9 登録: trước đó lưới đang vẽ trạng thái trong bộ nhớ,
    /// không phải trạng thái DB (F12).</para>
    /// </summary>
    /// <param name="TrtPt">
    /// 点数 đã lưu (<c>TRNTRN.TRT_PT</c>) — chính là <c>selRec.intPoint</c> mà
    /// frm203016.cs:1450 vừa ghi đè bằng <c>data.score</c> của hộp thoại.
    /// </param>
    /// <param name="DspTrt">
    /// 療法・処置 đã lưu — chuỗi mà <c>editDrugName</c> dựng lại TỪ <c>free_wd</c>
    /// (EditControl.cs:1049-1055), tức 数量 nhìn thấy được trên lưới.
    /// </param>
    public sealed record TrnDrugRow(int Seq, string FreeWd, int TrtPt, int TrtCnt, string DspTrt)
    {
        public override string ToString() =>
            $"seq {Seq}: freewd=「{FreeWd}」 trt_pt={TrtPt} trt_cnt={TrtCnt} dsp_trt=「{DspTrt}」";
    }

    public IReadOnlyList<TrnDrugRow> ReadTrnFreeWd(int patNo, DateTime day, int trtCd)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            """
            SELECT SEQ, ISNULL(FREEWD, ''), TRT_PT, TRT_CNT, ISNULL(DSP_TRT, '')
              FROM TRNTRN
             WHERE PAT_NO = @pat AND TRT_DT = @d AND TRT_CD = @cd AND DEL_FLG = 0
             ORDER BY SEQ
            """);
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = day.Date;
        cmd.Parameters.Add("@cd", SqlDbType.SmallInt).Value = trtCd;

        var list = new List<TrnDrugRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new TrnDrugRow(Convert.ToInt32(r.GetValue(0)), Str(r, 1),
                                    Convert.ToInt32(r.GetValue(2)), Convert.ToInt32(r.GetValue(3)),
                                    Str(r, 4)));
        return list;
    }

    private static string Str(SqlDataReader r, int i) =>
        r.IsDBNull(i) ? "" : (r.GetValue(i)?.ToString() ?? "").Trim();
}
