using System.Data;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

/// <summary>
/// Truy vấn <b>CÓ GHI</b> vào <c>ACCDAT</c> / <c>PERSON_EXP</c> cho luồng
/// 会計データ修正 (lô 8).
///
/// <para>Tách khỏi <c>Data/OchaDb.cs</c> (lớp đó tự nhận là chỉ đọc) và khỏi
/// <c>ParitySaveData/OchaDbParity.cs</c> (lớp đó lo <c>TRNTRN</c>). Mỗi luồng giữ
/// helper của riêng nó — mở thư mục là thấy đủ luồng gồm những gì.</para>
///
/// <para>Chỉ dựng được khi <c>parity.allowSave = true</c>. Luồng này ghi vào SỔ TIỀN
/// (会計 + 預り金/未収金), nên mặc định tắt và phải trỏ vào bệnh nhân TEST.</para>
/// </summary>
public sealed class OchaDbAccounting
{
    private readonly string _cs;
    private readonly int _timeout;

    private OchaDbAccounting(string cs, int timeout) { _cs = cs; _timeout = timeout; }

    public static OchaDbAccounting? CreateOrNull(TestSettings s)
    {
        if (!s.Parity.AllowSave) return null;
        if (!s.Db.Enabled || string.IsNullOrWhiteSpace(s.Db.ConnectionString)) return null;
        return new OchaDbAccounting(s.Db.ConnectionString, s.Db.CommandTimeoutSeconds);
    }

    private SqlConnection Open() { var c = new SqlConnection(_cs); c.Open(); return c; }

    private SqlCommand Cmd(SqlConnection c, string sql)
    {
        var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = _timeout;
        return cmd;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACCDAT
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Một dòng 会計 của ngày, đủ các cột mà ChgAccData đụng tới.</summary>
    public sealed record AccRow(
        DateTime AccDt, int AccCnt, int TrtCnt, int KmCd,
        int Score, int ClaimAmt, int ReceAmt, int Pflg, int Lflg, int[] ScoreD);

    /// <summary>
    /// Mọi dòng 会計 của (患者, 診療日), theo đúng thứ tự WinForm dùng để chọn
    /// <c>Rows[0]</c>: <c>ORDER BY acc_dt, acc_cnt, trt_cnt</c> (modAcc.cs:968).
    /// </summary>
    public List<AccRow> ReadAccDat(int patNo, DateTime trtDt)
    {
        var cols = string.Join(", ", Enumerable.Range(1, 14).Select(i => $"score_d{i}"));
        using var con = Open();
        using var cmd = Cmd(con,
            $"""
             SELECT acc_dt, acc_cnt, trt_cnt, km_cd, score, claim_amt, rece_amt, pflg, lflg, {cols}
               FROM ACCDAT
              WHERE pat_no = @p AND trt_dt = @d AND del_flg = 0
              ORDER BY acc_dt, acc_cnt, trt_cnt
             """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Date;

        var rows = new List<AccRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var sd = new int[14];
            for (var i = 0; i < 14; i++) sd[i] = ToInt(r[$"score_d{i + 1}"]);
            rows.Add(new AccRow(
                Convert.ToDateTime(r["acc_dt"]), ToInt(r["acc_cnt"]), ToInt(r["trt_cnt"]),
                ToInt(r["km_cd"]), ToInt(r["score"]), ToInt(r["claim_amt"]),
                ToInt(r["rece_amt"]), ToInt(r["pflg"]), ToInt(r["lflg"]), sd));
        }
        return rows;
    }

    /// <summary>
    /// Dòng mà <c>ChgAccData</c> sẽ sửa: 医療保険 (km_cd 40-49 / 57 / 58), lflg = 0,
    /// đầu tiên theo thứ tự trên (modAcc.cs:963-969).
    /// </summary>
    public AccRow? FindTargetRow(int patNo, DateTime trtDt) =>
        ReadAccDat(patNo, trtDt)
            .FirstOrDefault(a => a.Lflg == 0 && ((a.KmCd >= 40 && a.KmCd <= 49) || a.KmCd is 57 or 58));

    /// <summary>Dòng hoàn tiền mà nhánh GIẢM sinh thêm (km_cd 85, pflg 1).</summary>
    public List<AccRow> FindRefundRows(int patNo, DateTime trtDt) =>
        ReadAccDat(patNo, trtDt).Where(a => a.KmCd == 85).ToList();

    // ═══════════════════════════════════════════════════════════════════════
    // PERSON_EXP
    // ═══════════════════════════════════════════════════════════════════════

    public (int DepDue, int InsDueBal)? ReadBalances(int patNo)
    {
        using var con = Open();
        using var cmd = Cmd(con, "SELECT TOP 1 dep_due, ins_due_bal FROM PERSON_EXP WHERE pat_no = @p");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        using var r = cmd.ExecuteReader();
        return r.Read() ? (ToInt(r["dep_due"]), ToInt(r["ins_due_bal"])) : null;
    }

    /// <summary>
    /// Dựng số dư đầu vào cho kịch bản ISSUE-1.
    ///
    /// <para>Nhánh mang bug chỉ chạy khi có ĐỒNG THỜI cả hai số dư và số dư bị trừ
    /// NHỎ HƠN mức chênh. Không dựng đúng tổ hợp thì testcase đi nhánh ngoài (vốn
    /// cộng dồn đúng) và không chứng minh được gì.</para>
    /// </summary>
    public void SetBalances(int patNo, int depDue, int insDueBal)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "UPDATE PERSON_EXP SET dep_due = @dep, ins_due_bal = @ins WHERE pat_no = @p");
        cmd.Parameters.Add("@dep", SqlDbType.Int).Value = depDue;
        cmd.Parameters.Add("@ins", SqlDbType.Int).Value = insDueBal;
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        if (cmd.ExecuteNonQuery() == 0)
            throw new InvalidOperationException(
                $"PERSON_EXP không có dòng nào cho pat_no {patNo} — chọn bệnh nhân test khác.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Dựng tiền đề — 会計 đã chốt cho ngày test
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Bảo đảm ngày test có một dòng 会計 医療保険 đã chốt. Chưa có thì TẠO.
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// VÌ SAO PHẢI SEED, KHÔNG DÙNG DỮ LIỆU CÓ SẴN
    /// ═══════════════════════════════════════════════════════════════════════
    /// Đã tra DB (2026-08-10): <b>toàn bộ SIM2000 không có dòng ACCDAT nào trong
    /// tháng test</b> — mới nhất là 2026-07-31. Có bệnh nhân đã 窓口精算 nhưng đều ở
    /// tháng 1/2026, mà 診療入力 chỉ sửa được 処置月 hiện hành nên không mở ra đổi
    /// 処置 được. Seed không phải đường tắt — đó là đường duy nhất.
    ///
    /// <para>Cột dựng ĐỘNG từ <c>INFORMATION_SCHEMA</c> (ACCDAT có 44 cột, liệt kê tay
    /// thì dài và vỡ ngay khi schema đổi), nhưng giá trị của mọi cột <b>không liên quan
    /// tới testcase được SAO CHÉP TỪ MỘT DÒNG THẬT</b>, không điền hằng số.</para>
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// ⚠️ VÌ SAO PHẢI CHÉP, KHÔNG ĐƯỢC ĐIỀN 0 / ''
    /// ═══════════════════════════════════════════════════════════════════════
    /// Bản đầu điền hằng số cho mọi cột "vô nghĩa". Cùng cách làm đó áp lên TRNTRN đã
    /// làm <b>app WinForm crash</b> khi mở 診療入力:
    /// <list type="bullet">
    ///   <item><c>CHK_FLG</c> là <c>char(10)</c>; đặt <c>''</c> thì SQL Server đệm thành
    ///     10 dấu cách, và <c>editStringToInt</c> gọi <c>int.Parse("          ")</c> →
    ///     FormatException (Trntrn.cs:431).</item>
    ///   <item>Cột nullable bị bỏ qua hoàn toàn ⇒ <c>MED_ST_DT</c> / <c>SUM_DT</c> NULL,
    ///     mà <c>setTrtData</c> ép <c>(DateTime)</c> thẳng.</item>
    ///   <item><c>BT_DT1/2</c> nghe như ngày nhưng là <c>smallint</c> năm/tháng.</item>
    /// </list>
    ///
    /// <para>Chép từ dòng thật thì mọi cột như <c>rece_kbn</c>, <c>sflg</c>, <c>tflg</c>,
    /// <c>nte</c> nhận đúng giá trị app quen đọc — không phải đoán từng cột một.</para>
    /// </summary>
    /// <returns>true nếu VỪA TẠO (teardown phải xoá); false nếu đã có sẵn.</returns>
    public bool EnsureSettledAccounting(int patNo, DateTime trtDt, int score, int claimAmt, short patBr)
    {
        if (FindTargetRow(patNo, trtDt) is not null) return false;

        using var con = Open();
        using var cmd = Cmd(con,
            """
            DECLARE @cols nvarchar(max)='', @sel nvarchar(max)='';

            SELECT @cols = @cols + CASE WHEN @cols='' THEN '' ELSE ', ' END + QUOTENAME(COLUMN_NAME),
                   @sel  = @sel  + CASE WHEN @sel ='' THEN '' ELSE ', ' END +
                     CASE COLUMN_NAME
                       WHEN 'ACC_DT'    THEN '@d'  WHEN 'ACC_CNT'   THEN '1'
                       WHEN 'TRT_DT'    THEN '@d'  WHEN 'TRT_CNT'   THEN '1'
                       WHEN 'PAT_NO'    THEN '@p'  WHEN 'KM_CD'     THEN '40'
                       WHEN 'SCORE'     THEN '@sc' WHEN 'CLAIM_AMT' THEN '@ca'
                       WHEN 'RECE_AMT'  THEN '@ca' WHEN 'PFLG'      THEN '1'
                       WHEN 'LFLG'      THEN '0'   WHEN 'DEL_FLG'   THEN '0'
                       WHEN 'SCORE_D1'  THEN '@sc' WHEN 'PAT_BR'    THEN '@br'
                       WHEN 'ACC_TM'    THEN 'GETDATE()'
                       WHEN 'SCORE_D2'  THEN '0'   WHEN 'SCORE_D3'  THEN '0'
                       WHEN 'SCORE_D4'  THEN '0'   WHEN 'SCORE_D5'  THEN '0'
                       WHEN 'SCORE_D6'  THEN '0'   WHEN 'SCORE_D7'  THEN '0'
                       WHEN 'SCORE_D8'  THEN '0'   WHEN 'SCORE_D9'  THEN '0'
                       WHEN 'SCORE_D10' THEN '0'   WHEN 'SCORE_D11' THEN '0'
                       WHEN 'SCORE_D12' THEN '0'   WHEN 'SCORE_D13' THEN '0'
                       WHEN 'SCORE_D14' THEN '0'
                       ELSE 't.' + QUOTENAME(COLUMN_NAME)   -- moi cot con lai: LAY TU DONG THAT
                     END
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME='ACCDAT'
              AND COLUMNPROPERTY(OBJECT_ID('ACCDAT'),COLUMN_NAME,'IsIdentity')=0
            ORDER BY ORDINAL_POSITION;

            DECLARE @sql nvarchar(max) =
              'INSERT INTO ACCDAT (' + @cols + ') SELECT ' + @sel +
              ' FROM (SELECT TOP 1 * FROM ACCDAT WHERE del_flg=0 AND lflg=0' +
              ' AND km_cd BETWEEN 40 AND 49 ORDER BY acc_dt DESC) t';

            IF NOT EXISTS (SELECT 1 FROM ACCDAT WHERE del_flg=0 AND lflg=0 AND km_cd BETWEEN 40 AND 49)
                THROW 50001, 'Khong tim thay dong ACCDAT mau (km_cd 40-49, lflg 0) de sao chep.', 1;

            EXEC sp_executesql @sql, N'@p int,@d datetime,@sc int,@ca int,@br smallint',
                 @p=@p,@d=@d,@sc=@sc,@ca=@ca,@br=@br;
            """);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Date;
        cmd.Parameters.Add("@sc", SqlDbType.Int).Value = score;
        cmd.Parameters.Add("@ca", SqlDbType.Int).Value = claimAmt;
        cmd.Parameters.Add("@br", SqlDbType.SmallInt).Value = patBr;
        cmd.ExecuteNonQuery();
        return true;
    }

    /// <summary>枝番 của 処置 trong ngày — để dòng 会計 seed khớp với dữ liệu thật.</summary>
    public short ResolvePatBr(int patNo, DateTime trtDt)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT TOP 1 pat_br FROM TRNTRN WHERE pat_no = @p AND trt_dt = @d ORDER BY disp_no");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Date;
        var v = cmd.ExecuteScalar();
        return v is null or DBNull ? (short)1 : Convert.ToInt16(v);
    }

    /// <summary>Xoá mọi dòng 会計 của (患者, 診療日) — dùng khi teardown dọn phần đã seed.</summary>
    public int DeleteAccDat(int patNo, DateTime trtDt)
    {
        using var con = Open();
        using var cmd = Cmd(con, "DELETE FROM ACCDAT WHERE pat_no = @p AND trt_dt = @d");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Date;
        return cmd.ExecuteNonQuery();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Dọn dẹp
    // ═══════════════════════════════════════════════════════════════════════

    /// <summary>Ảnh chụp toàn bộ 会計 của ngày, để teardown so và khôi phục.</summary>
    public sealed record AccSnapshot(List<AccRow> Rows, int DepDue, int InsDueBal);

    public AccSnapshot Snapshot(int patNo, DateTime trtDt)
    {
        var b = ReadBalances(patNo) ?? (0, 0);
        return new AccSnapshot(ReadAccDat(patNo, trtDt), b.Item1, b.Item2);
    }

    /// <summary>
    /// Khôi phục về ảnh chụp: trả lại các cột đã bị sửa và xoá dòng phát sinh thêm.
    ///
    /// <para>Khoá theo (acc_dt, acc_cnt, trt_cnt) — bộ khoá tự nhiên mà WinForm dùng
    /// trong mệnh đề WHERE của câu UPDATE (modAcc.cs:989-995).</para>
    /// </summary>
    public int Restore(int patNo, DateTime trtDt, AccSnapshot snap)
    {
        using var con = Open();
        var touched = 0;

        foreach (var row in snap.Rows)
        {
            var sets = string.Join(", ", Enumerable.Range(1, 14).Select(i => $"score_d{i} = @sd{i}"));
            using var cmd = Cmd(con,
                $"""
                 UPDATE ACCDAT
                    SET km_cd = @km, score = @sc, claim_amt = @ca, rece_amt = @ra, {sets}
                  WHERE pat_no = @p AND trt_dt = @d
                    AND acc_dt = @ad AND acc_cnt = @ac AND trt_cnt = @tc
                 """);
            cmd.Parameters.Add("@km", SqlDbType.Int).Value = row.KmCd;
            cmd.Parameters.Add("@sc", SqlDbType.Int).Value = row.Score;
            cmd.Parameters.Add("@ca", SqlDbType.Int).Value = row.ClaimAmt;
            cmd.Parameters.Add("@ra", SqlDbType.Int).Value = row.ReceAmt;
            for (var i = 0; i < 14; i++)
                cmd.Parameters.Add($"@sd{i + 1}", SqlDbType.Int).Value = row.ScoreD[i];
            cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            cmd.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Date;
            cmd.Parameters.Add("@ad", SqlDbType.DateTime).Value = row.AccDt;
            cmd.Parameters.Add("@ac", SqlDbType.Int).Value = row.AccCnt;
            cmd.Parameters.Add("@tc", SqlDbType.Int).Value = row.TrtCnt;
            touched += cmd.ExecuteNonQuery();
        }

        // Dòng phát sinh thêm (điển hình là dòng hoàn tiền km_cd 85).
        var keep = snap.Rows.Select(r => (r.AccDt.Date, r.AccCnt, r.TrtCnt)).ToHashSet();
        foreach (var now in ReadAccDat(patNo, trtDt))
        {
            if (keep.Contains((now.AccDt.Date, now.AccCnt, now.TrtCnt))) continue;
            using var del = Cmd(con,
                "DELETE FROM ACCDAT WHERE pat_no = @p AND trt_dt = @d AND acc_dt = @ad AND acc_cnt = @ac AND trt_cnt = @tc");
            del.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
            del.Parameters.Add("@d", SqlDbType.DateTime).Value = trtDt.Date;
            del.Parameters.Add("@ad", SqlDbType.DateTime).Value = now.AccDt;
            del.Parameters.Add("@ac", SqlDbType.Int).Value = now.AccCnt;
            del.Parameters.Add("@tc", SqlDbType.Int).Value = now.TrtCnt;
            touched += del.ExecuteNonQuery();
        }

        SetBalances(patNo, snap.DepDue, snap.InsDueBal);
        return touched;
    }

    private static int ToInt(object v) => v is DBNull or null ? 0 : Convert.ToInt32(v);
}
