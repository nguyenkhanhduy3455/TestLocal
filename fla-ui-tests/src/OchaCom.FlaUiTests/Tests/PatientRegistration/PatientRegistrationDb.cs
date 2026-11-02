using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientRegistration;

/// <summary>
/// Đặt trạng thái cho bệnh nhân test của luồng 患者登録. Mọi câu đều khoá
/// <c>PAT_NO &gt;= <see cref="TestPatientDb.TestPatNoBase"/></c> — dữ liệu thật không đi qua đây.
///
/// <para>frm201001 đọc DB lúc MỞ (getPatInfoList) nên ghi trước khi mở lại màn là đủ —
/// khác đường nhập 処置 (F21).</para>
/// </summary>
public sealed class PatientRegistrationDb
{
    private readonly string _cs;
    private readonly int _timeout;
    private readonly int _patNo;

    private PatientRegistrationDb(string cs, int timeout, int patNo)
    {
        if (patNo < TestPatientDb.TestPatNoBase)
            throw new InvalidOperationException($"PAT_NO {patNo} nằm ngoài vùng test.");
        _cs = cs;
        _timeout = timeout;
        _patNo = patNo;
    }

    public static PatientRegistrationDb? CreateOrNull(TestSettings s, int patNo)
    {
        var db = s.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new PatientRegistrationDb(db.ConnectionString, db.CommandTimeoutSeconds, patNo);
    }

    /// <summary>
    /// Một 枝番 duy nhất (PAT_BR 1), tên test, 担当医 1 / 衛生士 100, 負担割合 30.
    /// Clone của người mẫu giữ nguyên 生年月日 / 資格取得日 / 患者情報有効日 để chuỗi
    /// kiểm tra của F9 (chkInputDataMain) không vấp lỗi ngày.
    /// </summary>
    public void Normalize(string tel)
    {
        Exec("DELETE FROM INSURANCE WHERE PAT_NO = @p AND PAT_BR <> 1");
        Exec("UPDATE INSURANCE SET PAT_NM = N'テスト　トウロク', PAT_KN = N'ﾃｽﾄ ﾄｳﾛｸ', " +
             "BUR_RATE = 30, Tel1 = @t WHERE PAT_NO = @p", ("@t", tel));
        Exec("UPDATE PERSON SET ATT_DR = 1, ATT_ST = 100, PAT_TEL1 = @t, REFE_NM = '' WHERE PAT_NO = @p", ("@t", tel));
    }

    /// <summary>Chép 枝番 1 thành 枝番 2 với 患者情報有効日 = <paramref name="brDt"/>.</summary>
    public void AddBranch2(DateTime brDt)
    {
        Exec("DELETE FROM INSURANCE WHERE PAT_NO = @p AND PAT_BR = 2");
        var cols = Columns("INSURANCE");
        var target = string.Join(", ", cols.Select(c => $"[{c}]"));
        var source = string.Join(", ", cols.Select(c => c.ToUpperInvariant() switch
        {
            "PAT_BR" => "2",
            "BR_DT" => "@d",
            _ => $"[{c}]",
        }));
        Exec($"INSERT INTO INSURANCE ({target}) SELECT {source} FROM INSURANCE WHERE PAT_NO = @p AND PAT_BR = 1",
             ("@d", brDt));
    }

    public void DropBranch2() => Exec("DELETE FROM INSURANCE WHERE PAT_NO = @p AND PAT_BR = 2");

    public void SetAttDr(int dr) => Exec("UPDATE PERSON SET ATT_DR = @v WHERE PAT_NO = @p", ("@v", dr));

    public void SetBurRate(int rate) => Exec("UPDATE INSURANCE SET BUR_RATE = @v WHERE PAT_NO = @p", ("@v", rate));

    /// <summary>Chép MỘT dòng TRNTRN của người mẫu sang bệnh nhân test, 枝番 1.</summary>
    public int SeedOneTrntrn(int templatePatNo)
    {
        var cols = Columns("TRNTRN");
        var target = string.Join(", ", cols.Select(c => $"[{c}]"));
        var source = string.Join(", ", cols.Select(c => c.ToUpperInvariant() switch
        {
            "PAT_NO" => "@p",
            "PAT_BR" => "1",
            _ => $"[{c}]",
        }));
        return Exec($"INSERT INTO TRNTRN ({target}) SELECT TOP 1 {source} FROM TRNTRN WHERE PAT_NO = @tpl",
                    ("@tpl", templatePatNo));
    }

    /// <summary>
    /// Dữ liệu cho Lô D (hộp con) — cùng dữ liệu với web patient-registration-subdialogs.spec.ts:
    /// 保険者番号 03010204 / 記号 てしお / 番号 123; 主訴 trống; TRNTRN 2026-09-10 và 2026-10-01
    /// (MED_ST_DT 2026-09-10); INSURANCE MED_ST_DT 2026-09-10, MED_ED_DT NULL.
    /// </summary>
    public void SetupSubdialogs(int templatePatNo)
    {
        Exec("UPDATE MEDINSINF SET INS_NO = '03010204', INS_MK = N'てしお', INS_SEQ = '123' WHERE PAT_NO = @p");
        Exec("UPDATE PERSON SET PAT_CC1 = '', PAT_CC2 = '', PAT_CC3 = '', PAT_CC4 = '', PAT_CC5 = '', PAT_CC6 = '', PAT_CC7 = '' WHERE PAT_NO = @p");
        Exec("DELETE FROM TRNTRN WHERE PAT_NO = @p");
        var cols = Columns("TRNTRN");
        var target = string.Join(", ", cols.Select(c => $"[{c}]"));
        var source = string.Join(", ", cols.Select(c => c.ToUpperInvariant() switch
        {
            "PAT_NO" => "@p",
            "PAT_BR" => "1",
            "TRT_DT" => "@d",
            "BT_DT1" => "YEAR(@d)",
            "BT_DT2" => "MONTH(@d)",
            "MED_ST_DT" => "'2026-09-10'",
            "DEL_FLG" => "0",
            _ => $"[{c}]",
        }));
        foreach (var d in new[] { new DateTime(2026, 9, 10), new DateTime(2026, 10, 1) })
            Exec($"INSERT INTO TRNTRN ({target}) SELECT TOP 1 {source} FROM TRNTRN WHERE PAT_NO = @tpl",
                 ("@tpl", templatePatNo), ("@d", d));
        Exec("UPDATE INSURANCE SET MED_ST_DT = '2026-09-10', MED_ED_DT = NULL WHERE PAT_NO = @p");
    }

    /// <summary>Một giá trị (cột đầu, dòng đầu) dạng chuỗi; NULL ⇒ "(null)".</summary>
    public string Scalar(string sql)
    {
        using var con = new SqlConnection(_cs);
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = _timeout;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = _patNo;
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? "(null)" : v is DateTime dt ? dt.ToString("yyyy-MM-dd") : v.ToString() ?? "";
    }

    public string Describe() =>
        string.Join(" | ", Rows(
            "SELECT 'BR' + CAST(PAT_BR AS varchar) + ' ' + CONVERT(varchar(10), BR_DT, 23) + " +
            "' kbn=' + CAST(INS_KBN AS varchar) + ' bur=' + CAST(BUR_RATE AS varchar) + ' tel=' + ISNULL(Tel1, '') " +
            "FROM INSURANCE WHERE PAT_NO = @p ORDER BY PAT_BR")
            .Concat(Rows("SELECT 'dr=' + CAST(ATT_DR AS varchar) + ' st=' + CAST(ATT_ST AS varchar) + " +
                         "' tel=' + ISNULL(PAT_TEL1, '') + ' 紹介者=' + ISNULL(REFE_NM, '') FROM PERSON WHERE PAT_NO = @p"))
            .Concat(Rows("SELECT 'TRNTRN=' + CAST(COUNT(*) AS varchar) FROM TRNTRN WHERE PAT_NO = @p")));

    private int Exec(string sql, params (string Name, object Value)[] args)
    {
        using var con = new SqlConnection(_cs);
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = _timeout;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = _patNo;
        foreach (var (name, value) in args) cmd.Parameters.AddWithValue(name, value);
        return cmd.ExecuteNonQuery();
    }

    private List<string> Rows(string sql)
    {
        using var con = new SqlConnection(_cs);
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = _timeout;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = _patNo;
        var rows = new List<string>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) rows.Add(r.IsDBNull(0) ? "" : r.GetString(0));
        return rows;
    }

    private List<string> Columns(string table)
    {
        using var con = new SqlConnection(_cs);
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText =
            "SELECT c.name FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id " +
            "WHERE t.name = @t AND c.is_identity = 0 AND c.is_computed = 0 ORDER BY c.column_id";
        cmd.Parameters.AddWithValue("@t", table);
        var cols = new List<string>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) cols.Add(r.GetString(0));
        return cols;
    }
}
