using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientVisitList;

/// <summary>Bản 保険 mà <c>getReceiptType</c> đọc, cho MỘT cặp (pat_no, pat_br).</summary>
public sealed record VisitInsurance(
    int PatNo,
    int PatBr,
    int? InsKbn,
    int? CombiKbn,
    int? OldFlg,
    int? BurRate,
    DateTime? Birthdate,
    /// <summary><c>medinsinf.fm_type</c> — nhánh 本外/家外 cuối cùng (buiPrice.cs:1599).</summary>
    int? FmType,
    string PatNm);

/// <summary>Một dòng khám mà frm204008 PHẢI xét: bệnh nhân × ngày × 枝番.</summary>
public sealed record ExpectedVisit(int PatNo, DateTime TrtDt, int PatBr)
{
    /// <summary>Cột 診療日 của lưới là NGÀY trong tháng (<c>row2["day"] = trtStDt.Day</c>).</summary>
    public int Day => TrtDt.Day;
}

/// <summary>
/// Truy vấn CHỈ ĐỌC cho luồng 来患一覧 (frm204008).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Cột レセプト種別 là chuỗi do <c>buiPrice.getReceiptType</c> ghép từ 6 trường của
/// <c>insurance</c> + <c>medinsinf</c>, và KHÔNG trường nào trong số đó hiện trên màn
/// hình. Không có DB thì testcase chỉ còn so 「ô này giống ô kia」 — đúng cái bẫy mà
/// PROBE-GUIDELINE 3.1 nói: mốc phải nằm NGOÀI thứ đang đo.
///
/// Ba câu hỏi lớp này trả lời, đúng thứ tự frm204008 hỏi DB:
/// <list type="number">
/// <item><see cref="PatientsForMonth"/> ← <c>TrnStatus.getTrnStatusData</c>
///       (TrnStatus.cs:57): <c>select distinct pat_no from trn_status where sinryo_ym = @ym</c>.</item>
/// <item><see cref="ExpectedVisits"/> ← <c>Trntrn.getInpTrnSubcode</c> (Trntrn.cs:1307):
///       <c>group by trt_dt, pat_br</c> trong khoảng NGÀY 1 → ngày cuối tháng.</item>
/// <item><see cref="InsuranceFor"/> ← <c>PatInfoList.getPatInfoCopyData</c>
///       (PatInfoList.cs:399): <c>person ⋈ insurance ⟕ medinsinf</c> theo (pat_no, pat_br).</item>
/// </list>
///
/// <para>⚠️ KHÔNG BAO GIỜ ghi. Luồng 来患一覧 cũng không seed gì: nó đọc dữ liệu có sẵn
/// của một 診療年月 và đối chiếu, nên chạy được trên DB dùng chung.</para>
///
/// <para><b>Số dòng ≤ số <see cref="ExpectedVisits"/>.</b> frm204008 chỉ thêm dòng khi
/// <c>insScore != 0 || careScore != 0 || jihiPrice != 0</c> (frm204008.cs:733) và còn lọc
/// theo 3 checkbox 初診/再診/訪問診療 (:715). Cả hai điều kiện đó nằm trong
/// <c>getBuiPrice2</c> nên lớp này KHÔNG đoán — nó chỉ nói 「tối đa từng này dòng」.</para>
/// </summary>
public sealed class VisitListDb
{
    private readonly string _connectionString;
    private readonly int _commandTimeout;

    private VisitListDb(string connectionString, int commandTimeout)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
    }

    public static VisitListDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new VisitListDb(db.ConnectionString, db.CommandTimeoutSeconds);
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
    /// 診療年月 nào có dữ liệu, kèm số bệnh nhân — dùng để CHỌN tháng test và để probe in ra.
    ///
    /// <para>Số bệnh nhân là thứ quyết định luồng chạy bao lâu: frm204008 gọi
    /// <c>getBuiPrice2</c> cho TỪNG (bệnh nhân × ngày), mỗi lượt là vài truy vấn. Tháng
    /// 600 bệnh nhân của dataset demo chạy hàng chục phút — quá trần <c>TimeoutMinutes</c>
    /// của wrapper, và máy Windows treo cứng chứ không chỉ đỏ (xem PROBE-GUIDELINE).</para>
    /// </summary>
    public IReadOnlyList<(string Ym, int Patients)> MonthsWithData(int maxPatients = int.MaxValue)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT sinryo_ym, COUNT(DISTINCT pat_no) AS pats
              FROM trn_status
             GROUP BY sinryo_ym
            HAVING COUNT(DISTINCT pat_no) <= @max
             ORDER BY COUNT(DISTINCT pat_no) DESC, sinryo_ym DESC
            """);
        cmd.Parameters.Add("@max", SqlDbType.Int).Value = maxPatients;

        var list = new List<(string, int)>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add((r.GetValue(0).ToString()!.Trim(), Convert.ToInt32(r.GetValue(1))));
        return list;
    }

    /// <summary>Port <c>TrnStatus.getTrnStatusData</c> (TrnStatus.cs:57).</summary>
    public IReadOnlyList<int> PatientsForMonth(string sinryoYm)
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT DISTINCT pat_no FROM trn_status WHERE sinryo_ym = @ym");
        cmd.Parameters.Add("@ym", SqlDbType.VarChar, 6).Value = sinryoYm;

        var list = new List<int>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) list.Add(Convert.ToInt32(r.GetValue(0)));
        return list;
    }

    /// <summary>
    /// Port vòng lặp của <c>setViewData</c>: với mỗi bệnh nhân của tháng, gom
    /// <c>(trt_dt, pat_br)</c> trong khoảng ngày 1 → ngày cuối tháng
    /// (<c>Trntrn.getInpTrnSubcode</c>).
    /// </summary>
    public IReadOnlyList<ExpectedVisit> ExpectedVisits(string sinryoYm)
    {
        var (first, last) = MonthRange(sinryoYm);

        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT t.pat_no, t.trt_dt, t.pat_br
              FROM trntrn t
             WHERE t.pat_no IN (SELECT DISTINCT pat_no FROM trn_status WHERE sinryo_ym = @ym)
               AND t.trt_dt BETWEEN @st AND @ed
             GROUP BY t.pat_no, t.trt_dt, t.pat_br
             ORDER BY t.pat_no, t.trt_dt, t.pat_br
            """);
        cmd.Parameters.Add("@ym", SqlDbType.VarChar, 6).Value = sinryoYm;
        cmd.Parameters.Add("@st", SqlDbType.DateTime).Value = first;
        cmd.Parameters.Add("@ed", SqlDbType.DateTime).Value = last;

        var list = new List<ExpectedVisit>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            list.Add(new ExpectedVisit(Convert.ToInt32(r.GetValue(0)),
                                       Convert.ToDateTime(r.GetValue(1)).Date,
                                       Convert.ToInt32(r.GetValue(2))));
        return list;
    }

    /// <summary>
    /// Bản 保険 theo (pat_no, pat_br) — cùng phép nối mà
    /// <c>PatInfoList.getPatInfoCopyData</c> dùng.
    ///
    /// <para>Khoá là CẶP (pat_no, pat_br) chứ không phải riêng pat_no: WinForm lấy 枝番 từ
    /// chính dòng <c>trntrn</c> của ngày đó (frm204008.cs:709-713), nên một bệnh nhân
    /// nhiều 枝番 vẫn tra được chính xác. Bản web KHÔNG trả 枝番 nên spec Playwright phải
    /// bỏ qua các bệnh nhân đó — nửa WinForm thì không cần.</para>
    /// </summary>
    public IReadOnlyDictionary<(int PatNo, int PatBr), VisitInsurance> InsuranceFor(string sinryoYm)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT ins.pat_no, ins.pat_br, ins.ins_kbn, ins.combi_kbn, ins.old_flg,
                   ins.bur_rate, ins.Birthdate, med.fm_type, ins.pat_nm
              FROM insurance ins
              LEFT OUTER JOIN medinsinf med
                     ON med.pat_no = ins.pat_no
                    AND med.medinsinf_no = ins.medinsinf_no
             WHERE ins.pat_no IN (SELECT DISTINCT pat_no FROM trn_status WHERE sinryo_ym = @ym)
            """);
        cmd.Parameters.Add("@ym", SqlDbType.VarChar, 6).Value = sinryoYm;

        var map = new Dictionary<(int, int), VisitInsurance>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var patNo = Convert.ToInt32(r.GetValue(0));
            var patBr = Convert.ToInt32(r.GetValue(1));
            map[(patNo, patBr)] = new VisitInsurance(
                patNo, patBr,
                Int(r, 2), Int(r, 3), Int(r, 4), Int(r, 5),
                r.IsDBNull(6) ? null : Convert.ToDateTime(r.GetValue(6)).Date,
                Int(r, 7),
                r.IsDBNull(8) ? "" : r.GetValue(8).ToString()!.Trim());
        }
        return map;

        static int? Int(SqlDataReader r, int i) => r.IsDBNull(i) ? null : Convert.ToInt32(r.GetValue(i));
    }

    /// <summary>Ngày đầu / ngày cuối của 診療年月, đúng khoảng mà frm204008.cs:709 dựng.</summary>
    public static (DateTime First, DateTime Last) MonthRange(string sinryoYm)
    {
        var (y, m) = ParseYm(sinryoYm);
        var first = new DateTime(y, m, 1);
        return (first, new DateTime(y, m, DateTime.DaysInMonth(y, m)));
    }

    public static (int Year, int Month) ParseYm(string sinryoYm)
    {
        var s = sinryoYm.Trim();
        if (s.Length != 6 || !int.TryParse(s[..4], out var y) || !int.TryParse(s[4..], out var m)
            || m is < 1 or > 12)
            throw new ArgumentException($"診療年月 phải là yyyyMM, đang là 「{sinryoYm}」");
        return (y, m);
    }
}
