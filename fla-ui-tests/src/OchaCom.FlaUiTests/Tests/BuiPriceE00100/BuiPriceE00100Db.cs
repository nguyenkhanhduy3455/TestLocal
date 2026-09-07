using System.Data;
using System.Globalization;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.BuiPriceE00100;

/// <summary>
/// Dữ liệu cho luồng <b>E00100 一部負担金計算失敗</b>: dựng một ca 公費 hỏng, chụp ảnh +
/// trả lại nguyên trạng, và dựng lại NGUYÊN VĂN câu mà WinForm sẽ in ra.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI SEED — KHÔNG CÓ ĐƯỜNG NÀO KHÁC
/// ═══════════════════════════════════════════════════════════════════════════
/// Spec Playwright chèn <c>warnings</c> vào response bằng <c>page.route</c>. Bên WinForm
/// không có lớp nào chen vào giữa được: <c>buiPrice.getBuiPrice2</c> đọc thẳng SQL Server
/// trong tiến trình app. Muốn thấy E00100 thì dữ liệu phải hỏng thật.
///
/// <para>Đã dò hết các cột có thể phá, và <b>ba trong bốn ý tưởng chết vì kiểu cột</b>
/// (đo trên SIM2000 thật, 2026-09-07):</para>
/// <code>
/// buiPrice.cs:1652  DateTime.Parse(pubexp.QualificationDate)        PUBEXPINF.QualificationDate  = date    ⇒ không nhét rác được
/// buiPrice.cs:976   DateTime.Parse(…ValidStartDate)                 MEDINSINF.…ValidStartDate    = date    ⇒ như trên
/// buiPrice.cs:921   int.Parse(careInsData.bur_rate[j])              CARE_INSURANCE.bur_rate_1    = tinyint ⇒ như trên
/// buiPrice.cs:1734  getLocalFlg(lflg) == null                       PUBEXPINF.LFLG               = varchar(8)  ⇒ ĐƯỜNG DUY NHẤT
/// </code>
///
/// <para>Còn một đường thứ hai — <c>buiPrice.cs:998</c> gọi
/// <c>BeneficiaryNumber.Substring(0, 2)</c> trong khi guard chỉ kiểm
/// <c>PublicExpenseNumber.Length == 8</c> (hai field KHÁC nhau) ⇒ 受給者番号 rỗng là
/// <c>ArgumentOutOfRangeException</c> ⇒ đúng hộp E00100 「患者登録データを確認してください」
/// mà spec web mô phỏng. Nhưng nhánh đó chỉ tới được với bệnh nhân <b>70歳以上 医保</b>
/// (<c>ins_kbn ∈ {1,2,8,9} + old_flg = 4</c>, hoặc <c>ins_kbn = 10 + old_flg = 5</c>), mà
/// trong DB demo chỉ mỗi 12138 có 処置 ở tháng test — và nó có 2876 dòng, app mở hơn một
/// phút. Chưa làm; ghi lại ở README mục 5 để ai cần thì biết đường.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HAI PHÉP GHI, VÀ VÌ SAO CẢ HAI ĐỀU CẦN
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// UPDATE INSURANCE SET PUBEXPINF_NO = @no WHERE PAT_NO = @pat AND PAT_BR = @br
/// INSERT INTO PUBEXPINF (PAT_NO, PUBEXPINF_NO, PUB_NO, …, LFLG) VALUES (…)
/// </code>
/// Chỉ INSERT là chưa đủ: câu SELECT của <c>PatInfoList</c> nối
/// <c>pub.pubexpinf_no = ins.pubexpinf_no</c> (PatInfoList.cs:486-488) và
/// <c>setData</c> còn chặn thêm <c>if (data.ins.pubexpinf_no != 0 …)</c>
/// (PatInfoList.cs:678). Bệnh nhân test đang để <c>PUBEXPINF_NO = 0</c> nên dòng seed sẽ
/// bị bỏ qua im lặng — seed xong mà app vẫn chạy trơn, và testcase XANH SAI.
///
/// ⚠️ Lớp này CÓ GHI. Tách khỏi <c>Data/OchaDb.cs</c> (chỉ-đọc) vì lý do đó, đúng như
///    <c>UnpaidRaiinCnt/RaiinCntDb.cs</c> đã làm.
/// </summary>
public sealed class BuiPriceE00100Db
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private BuiPriceE00100Db(string cs, int timeout)
    {
        _connectionString = cs;
        _commandTimeout = timeout;
    }

    public static BuiPriceE00100Db? CreateOrNull(TestSettings s)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new BuiPriceE00100Db(db.ConnectionString, db.CommandTimeoutSeconds);
    }

    private SqlConnection Open()
    {
        var c = new SqlConnection(_connectionString);
        c.Open();
        return c;
    }

    private SqlCommand Cmd(SqlConnection con, string sql)
    {
        var c = con.CreateCommand();
        c.CommandText = sql;
        c.CommandTimeout = _commandTimeout;
        return c;
    }

    // ── Đọc: bối cảnh bệnh nhân ──────────────────────────────────────────────

    /// <summary>Một dòng <c>INSURANCE</c> — 枝番 và những cột chi phối nhánh của buiPrice.</summary>
    /// <param name="PubexpinfNo">Khoá nối sang <c>PUBEXPINF</c>; 0 = app bỏ qua mọi dòng 公費.</param>
    public sealed record InsuranceRow(int PatBr, int InsKbn, int OldFlg, int BurRate, int AccRate,
                                      int CombiKbn, int PubexpinfNo)
    {
        public override string ToString() =>
            $"枝番 {PatBr}: ins_kbn={InsKbn} old_flg={OldFlg} bur_rate={BurRate} " +
            $"acc_rate={AccRate} combi_kbn={CombiKbn} pubexpinf_no={PubexpinfNo}";
    }

    public IReadOnlyList<InsuranceRow> ReadInsurance(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT PAT_BR, INS_KBN, OLD_FLG, BUR_RATE, ACC_RATE, COMBI_KBN, PUBEXPINF_NO " +
            "FROM INSURANCE WHERE PAT_NO = @pat ORDER BY PAT_BR");
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;

        var rows = new List<InsuranceRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            rows.Add(new InsuranceRow(I(r["PAT_BR"]), I(r["INS_KBN"]), I(r["OLD_FLG"]),
                                      I(r["BUR_RATE"]), I(r["ACC_RATE"]), I(r["COMBI_KBN"]),
                                      I(r["PUBEXPINF_NO"])));
        return rows;
    }

    /// <summary>Một dòng <c>PUBEXPINF</c> — dùng cho ảnh chụp và cho việc gỡ dòng seed.</summary>
    public sealed record PubexpRow(int PubexpinfNo, int PubNo, string DefNo, string CerNo,
                                   DateTime? Qualification, DateTime? Expiry, string Lflg, string Office)
    {
        public override string ToString() =>
            $"pubexpinf_no={PubexpinfNo} pub_no={PubNo} 負担者番号「{DefNo}」 受給者番号「{CerNo}」 " +
            $"資格取得 {Qualification:yyyy-MM-dd} 有効期限 {Expiry:yyyy-MM-dd} lflg「{Lflg}」";
    }

    public IReadOnlyList<PubexpRow> ReadPubexp(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT PUBEXPINF_NO, PUB_NO, PUBEXP_DEF_NO, PUBEXP_CER_NO, QualificationDate, " +
            "       PUBEXP_EXP_DT, LFLG, WelfareOfficeName " +
            "FROM PUBEXPINF WHERE PAT_NO = @pat ORDER BY PUBEXPINF_NO, PUB_NO");
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;

        var rows = new List<PubexpRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            rows.Add(new PubexpRow(I(r["PUBEXPINF_NO"]), I(r["PUB_NO"]),
                                   S(r["PUBEXP_DEF_NO"]), S(r["PUBEXP_CER_NO"]),
                                   D(r["QualificationDate"]), D(r["PUBEXP_EXP_DT"]),
                                   S(r["LFLG"]), S(r["WelfareOfficeName"])));
        return rows;
    }

    /// <summary>
    /// Số bệnh nhân KHÁC có 処置 trong ngày — quyết định 来患一覧/当日来患 đo được gì.
    ///
    /// <para><c>frm203001.getTodayViewData</c> gọi <c>getBuiPrice2</c> cho TỪNG dòng của
    /// ngày (frm203001.cs:910-926), nên số dòng của ngày = số lần hộp thoại có thể bật.</para>
    /// </summary>
    public IReadOnlyList<(int PatNo, int Rows)> PatientsTreatedOn(DateTime day)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT pat_no, COUNT(1) AS n FROM TRNTRN " +
            "WHERE trt_dt = @d AND del_flg = '0' GROUP BY pat_no ORDER BY pat_no");
        cmd.Parameters.Add("@d", SqlDbType.Date).Value = day.Date;

        var rows = new List<(int, int)>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) rows.Add((I(r["pat_no"]), I(r["n"])));
        return rows;
    }

    /// <summary>Khuôn câu E00100 trong <c>MSGTBL</c> (MsgDialog.getMsg, MsgDialog.cs:184-213).</summary>
    public string? MessageTemplate(string id = "E00100")
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT TOP 1 MSG FROM MSGTBL WHERE ID = @id");
        cmd.Parameters.Add("@id", SqlDbType.NVarChar, 16).Value = id;
        return cmd.ExecuteScalar() as string;
    }

    /// <summary>Số dòng <c>LOCALFLG</c> mang mã đó — phải là 0 thì seed mới có tác dụng.</summary>
    public int CountLocalFlg(string insurerNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT COUNT(1) FROM LOCALFLG WHERE insurer_no = @no");
        cmd.Parameters.Add("@no", SqlDbType.VarChar, 16).Value = insurerNo;
        return Convert.ToInt32(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    // ── Ghi: seed + khôi phục ────────────────────────────────────────────────

    /// <summary>Ảnh chụp trước khi seed — đủ để đưa DB về đúng như cũ.</summary>
    /// <param name="Insurance">Toàn bộ dòng <c>INSURANCE</c> của bệnh nhân (cần cột PUBEXPINF_NO cũ).</param>
    /// <param name="Pubexp">Toàn bộ dòng <c>PUBEXPINF</c> của bệnh nhân trước khi seed.</param>
    public sealed record Snapshot(int PatNo,
                                  IReadOnlyList<InsuranceRow> Insurance,
                                  IReadOnlyList<PubexpRow> Pubexp);

    public Snapshot TakeSnapshot(int patNo) =>
        new(patNo, ReadInsurance(patNo), ReadPubexp(patNo));

    /// <summary>Kết quả của một lượt seed — in ra log để đối chiếu với hộp thoại đọc được.</summary>
    /// <param name="Blocker">Khác null ⇒ KHÔNG seed được, testcase phải Ignore kèm lý do này.</param>
    public sealed record Seed(int PatNo, int PatBr, int PubexpinfNo, string Lflg,
                              DateTime Qualification, DateTime Expiry, string? Blocker);

    /// <summary>
    /// Dựng ca 公費 hỏng cho 枝番 <b>nhỏ nhất</b> của bệnh nhân.
    ///
    /// <para>Hai điều kiện phải đúng, kiểm TRƯỚC khi ghi vì sai cái nào cũng cho ra một
    /// lượt chạy xanh mà chẳng đo gì:</para>
    /// <list type="number">
    /// <item><c>lflg</c> không có trong <c>LOCALFLG</c> ⇒ <c>getLocalFlg</c> trả null.</item>
    /// <item><c>pubexpinfNo != 0</c> ⇒ <c>PatInfoList.setData</c> mới nạp dòng 公費.</item>
    /// </list>
    ///
    /// <para>資格取得年月日 / 有効期限 đặt trùm cả tháng test: <c>setBurdenType</c> bỏ qua
    /// 公費 ngoài hạn (buiPrice.cs:1664-1670) và khi đó nhánh E00100 không tới được.</para>
    ///
    /// <para>Tự dọn dòng seed cũ trước khi chèn — chạy lại nhiều lượt không cộng dồn.</para>
    /// </summary>
    public Seed SeedBrokenPubexp(int patNo, string lflg, int pubexpinfNo, DateTime month)
    {
        var insurance = ReadInsurance(patNo);
        if (insurance.Count == 0)
            return Blocked($"bệnh nhân {patNo} không có dòng INSURANCE nào");

        if (pubexpinfNo == 0)
            return Blocked("buiPrice.seedPubexpinfNo = 0 — PatInfoList.cs:678 bỏ hẳn dòng 公費 " +
                           "khi ins.pubexpinf_no = 0, seed sẽ không có tác dụng");

        if (CountLocalFlg(lflg) != 0)
            return Blocked($"福祉医療番号 「{lflg}」 CÓ THẬT trong LOCALFLG ⇒ getLocalFlg không trả " +
                           "null và E00100 không bật. Đổi buiPrice.missingLflg sang mã khác.");

        var br = insurance.Min(i => i.PatBr);
        var qualification = new DateTime(month.Year, month.Month, 1).AddYears(-1);
        var expiry = new DateTime(month.Year, month.Month, 1).AddYears(1);

        using var con = Open();
        using var tx = con.BeginTransaction();

        Exec(con, tx, "DELETE FROM PUBEXPINF WHERE PAT_NO = @pat AND PUBEXPINF_NO = @no",
             ("@pat", patNo), ("@no", pubexpinfNo));

        Exec(con, tx,
             "INSERT INTO PUBEXPINF (PAT_NO, PUBEXPINF_NO, PUB_NO, PUBEXP_DEF_NO, PUBEXP_CER_NO, " +
             "                       QualificationDate, PUBEXP_EXP_DT, LFLG, WelfareOfficeName) " +
             "VALUES (@pat, @no, 1, @def, @cer, @q, @e, @lflg, @office)",
             ("@pat", patNo), ("@no", pubexpinfNo),
             ("@def", "88888888"), ("@cer", "7777777"),
             ("@q", qualification), ("@e", expiry),
             ("@lflg", lflg), ("@office", "FLAUI-SEED"));

        Exec(con, tx, "UPDATE INSURANCE SET PUBEXPINF_NO = @no WHERE PAT_NO = @pat AND PAT_BR = @br",
             ("@no", pubexpinfNo), ("@pat", patNo), ("@br", br));

        tx.Commit();
        return new Seed(patNo, br, pubexpinfNo, lflg, qualification, expiry, null);

        Seed Blocked(string why) =>
            new(patNo, 0, pubexpinfNo, lflg, default, default, why);
    }

    /// <summary>
    /// Trả DB về đúng ảnh chụp: xoá mọi dòng <c>PUBEXPINF</c> không có trong ảnh, chèn
    /// lại dòng đã mất, và đặt lại <c>INSURANCE.PUBEXPINF_NO</c> của TỪNG 枝番.
    ///
    /// <para>Không chỉ "xoá dòng seed": nếu một lượt chạy trước đó chết giữa chừng thì
    /// dòng thừa có thể mang số khác. So với ảnh chụp là cách duy nhất chắc chắn.</para>
    /// </summary>
    public string Restore(Snapshot snap)
    {
        using var con = Open();
        using var tx = con.BeginTransaction();

        var keep = snap.Pubexp.Select(p => p.PubexpinfNo).Distinct().ToList();
        var deleted = keep.Count == 0
            ? Exec(con, tx, "DELETE FROM PUBEXPINF WHERE PAT_NO = @pat", ("@pat", snap.PatNo))
            : Exec(con, tx,
                   "DELETE FROM PUBEXPINF WHERE PAT_NO = @pat AND PUBEXPINF_NO NOT IN (" +
                   string.Join(",", keep) + ")",
                   ("@pat", snap.PatNo));

        var restored = 0;
        foreach (var p in snap.Pubexp)
        {
            var exists = Convert.ToInt32(Scalar(con, tx,
                "SELECT COUNT(1) FROM PUBEXPINF WHERE PAT_NO = @pat AND PUBEXPINF_NO = @no AND PUB_NO = @pub",
                ("@pat", snap.PatNo), ("@no", p.PubexpinfNo), ("@pub", p.PubNo)), CultureInfo.InvariantCulture);
            if (exists > 0) continue;

            Exec(con, tx,
                 "INSERT INTO PUBEXPINF (PAT_NO, PUBEXPINF_NO, PUB_NO, PUBEXP_DEF_NO, PUBEXP_CER_NO, " +
                 "                       QualificationDate, PUBEXP_EXP_DT, LFLG, WelfareOfficeName) " +
                 "VALUES (@pat, @no, @pub, @def, @cer, @q, @e, @lflg, @office)",
                 ("@pat", snap.PatNo), ("@no", p.PubexpinfNo), ("@pub", p.PubNo),
                 ("@def", p.DefNo), ("@cer", p.CerNo),
                 ("@q", (object?)p.Qualification ?? DBNull.Value),
                 ("@e", (object?)p.Expiry ?? DBNull.Value),
                 ("@lflg", p.Lflg), ("@office", p.Office));
            restored++;
        }

        foreach (var ins in snap.Insurance)
            Exec(con, tx, "UPDATE INSURANCE SET PUBEXPINF_NO = @no WHERE PAT_NO = @pat AND PAT_BR = @br",
                 ("@no", ins.PubexpinfNo), ("@pat", snap.PatNo), ("@br", ins.PatBr));

        tx.Commit();
        return $"PUBEXPINF: xoá {deleted}, chèn lại {restored}; " +
               $"INSURANCE.PUBEXPINF_NO: đặt lại {snap.Insurance.Count} 枝番";
    }

    // ── ORACLE: dựng lại NGUYÊN VĂN câu mà WinForm sẽ in ─────────────────────

    /// <summary>
    /// Thân hộp thoại của nhánh 「福祉医療設定データが存在しません」 — buiPrice.cs:1734-1737.
    ///
    /// <code>
    /// string.Format("一部負担金計算に失敗しました。福祉医療設定データが存在しません。\r\n" +
    ///               "　患者番号[{0}] 枝番[{1}] 診療年月[{2}] 福祉医療フラグ[{3}]",
    ///               patNo, patBr, editDateToString(trtStDt, "gggy年M月"), lflg);
    /// </code>
    ///
    /// <para>Hai chi tiết dễ mất khi port, ghi rõ ở đây để không ai "làm sạch" mất:
    /// dấu cách đầu dòng 2 là <b>全角 U+3000</b>, và 年/月 <b>KHÔNG đệm 0</b>
    /// (<c>gggy年M月</c>).</para>
    ///
    /// <para><c>MSGTBL['E00100']</c> đo được là đúng chuỗi <c>{0}</c>, nên
    /// <c>MsgDialog.getMsg</c> trả về thân này NGUYÊN VẸN, không thêm tiền tố nào —
    /// fixture vẫn đọc lại MSGTBL và bọc theo đúng luật của <c>getMsg</c> phòng khi máy
    /// khác có khuôn khác.</para>
    /// </summary>
    public static string LocalFlgMissingBody(int patNo, int patBr, DateTime trtMonth, string lflg) =>
        "一部負担金計算に失敗しました。福祉医療設定データが存在しません。\r\n" +
        $"　患者番号[{patNo}] 枝番[{patBr}] 診療年月[{Wareki(trtMonth)}] 福祉医療フラグ[{lflg}]";

    /// <summary>
    /// Đầu thân hộp thoại của nhánh NGOẠI LỆ — buiPrice.cs:196-203. Bên web là
    /// <c>ja.buiPriceFailed</c>.
    ///
    /// <para>Chỉ giữ phần đầu: đuôi có <c>内容[ex.Message]</c> + <c>場所[ex.StackTrace]</c>
    /// mà bản web CỐ Ý bỏ <c>場所[]</c> (xem parity-notes mục 「意図的に WinForm と変えた点」).</para>
    /// </summary>
    public const string CalcFailedHead = "一部負担金計算に失敗しました。患者登録データを確認してください。";

    /// <summary>
    /// Bọc thân theo đúng <c>MsgDialog.getMsg</c> (MsgDialog.cs:184-213): khuôn có
    /// <c>{0}</c> thì thay, không có thì NỐI vào sau, MSGTBL không có ID thì trả nguyên thân.
    /// </summary>
    public static string ApplyTemplate(string? template, string body)
    {
        if (string.IsNullOrEmpty(template)) return body;
        return template.Contains("{0}", StringComparison.Ordinal)
            ? template.Replace("{0}", body, StringComparison.Ordinal)
            : template + body;
    }

    /// <summary>
    /// <c>gggy年M月</c> của <c>EditControl.editDateToString</c> — 令和/平成/昭和, KHÔNG đệm 0.
    ///
    /// <para>Ranh giới là NGÀY chứ không phải năm (令和 bắt đầu 2019-05-01) — cùng luật mà
    /// spec Playwright dùng, để hai bên không lệch nhau ở tháng giao thời.</para>
    /// </summary>
    public static string Wareki(DateTime d)
    {
        var (name, baseYear) = d >= new DateTime(2019, 5, 1) ? ("令和", 2018)
                             : d >= new DateTime(1989, 1, 8) ? ("平成", 1988)
                             : ("昭和", 1925);
        return $"{name}{d.Year - baseYear}年{d.Month}月";
    }

    // ── vặt ──────────────────────────────────────────────────────────────────

    private int Exec(SqlConnection con, SqlTransaction tx, string sql,
                     params (string Name, object Value)[] args)
    {
        using var cmd = Cmd(con, sql);
        cmd.Transaction = tx;
        foreach (var (n, v) in args) cmd.Parameters.AddWithValue(n, v);
        return cmd.ExecuteNonQuery();
    }

    private object? Scalar(SqlConnection con, SqlTransaction tx, string sql,
                           params (string Name, object Value)[] args)
    {
        using var cmd = Cmd(con, sql);
        cmd.Transaction = tx;
        foreach (var (n, v) in args) cmd.Parameters.AddWithValue(n, v);
        return cmd.ExecuteScalar();
    }

    private static int I(object v) => v is DBNull or null ? 0 : Convert.ToInt32(v, CultureInfo.InvariantCulture);
    private static string S(object v) => v is DBNull or null ? "" : v.ToString() ?? "";
    private static DateTime? D(object v) => v is DBNull or null ? null : Convert.ToDateTime(v, CultureInfo.InvariantCulture);
}
