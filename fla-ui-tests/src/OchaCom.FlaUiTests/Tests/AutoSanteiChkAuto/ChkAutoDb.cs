using System.Data;
using System.Text;
using Microsoft.Data.SqlClient;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Master + seed cho luồng 自動算定 — nửa SQL Server của
/// <c>../web-tenant-tests/tests/_shared/db.ts</c>, dựng lại đúng những hàm mà spec
/// <c>auto-santei/chk-auto-after-commit.spec.ts</c> dùng:
///
/// <code>
///   findChkAutoSlots        → ReadChkAuto        (bảng chkauto  ↔ chk_auto)
///   findCmtAutos            → FindCmtAutos       (bảng CMTAUTO  ↔ cmt_auto)
///   findMstTrt              → SigaKonDb.FindMasterRows
///   seedTreatmentRows       → SeedBuiDisRow      (TRNTRN        ↔ trn_trn)
///   deleteTreatmentRows     → DeleteSeededRows
///   deleteChkAutoCompanionRows → DeleteCompanionRows
/// </code>
///
/// <para>⚠️ <b>Tên bảng/cột KHÁC bên web.</b> WinForm: <c>chkauto</c> (không gạch dưới,
/// cột <c>cd1..cd5</c>/<c>sb1..sb5</c>), <c>CMTAUTO</c>, <c>TRNTRN</c>; Postgres:
/// <c>chk_auto</c> (<c>cd_1..cd_5</c>), <c>cmt_auto</c>, <c>trn_trn</c>. Nguồn:
/// <c>COMMON/DBAccess/ChkAuto.cs:26-43</c>.</para>
///
/// <para>Phần ĐỌC luôn chạy. Phần GHI (seed 部位病名行 + dọn) nằm sau cờ RIÊNG
/// <c>autoSantei.allowSave</c> — xem <see cref="CreateOrNull"/>.</para>
/// </summary>
public sealed class ChkAutoDb
{
    /// <summary>
    /// Vùng <c>DISP_NO</c> của test — bản sao của <c>SEED_DISP_BASE = 9000</c> bên
    /// <c>db.ts:330</c> để hai bên seed vào cùng một vùng.
    ///
    /// <para>⚠️ Mọi lệnh xoá đều khoá thêm <c>TRT_DT = ngày test</c>. Bệnh nhân 10 đang có
    /// một dòng seed CỐ ĐỊNH ở <c>disp_no 9001, trt_dt 2026-07-20</c> (再初診) mà các luồng
    /// khác chỉ ĐỌC — xoá theo mỗi <c>disp_no >= 9000</c> là cuốn luôn dòng đó.</para>
    /// </summary>
    public const int SeedDispBase = 9000;

    private readonly string _connectionString;
    private readonly int _commandTimeout;
    private readonly bool _allowWrite;

    private ChkAutoDb(string connectionString, int commandTimeout, bool allowWrite)
    {
        _connectionString = connectionString;
        _commandTimeout = commandTimeout;
        _allowWrite = allowWrite;
    }

    /// <summary>Null khi <c>db.enabled = false</c> hoặc thiếu chuỗi kết nối.</summary>
    public static ChkAutoDb? CreateOrNull(TestSettings settings)
    {
        var db = settings.Db;
        if (!db.Enabled || string.IsNullOrWhiteSpace(db.ConnectionString)) return null;
        return new ChkAutoDb(db.ConnectionString, db.CommandTimeoutSeconds, settings.AutoSantei.AllowSave);
    }

    public bool CanWrite => _allowWrite;

    private void RequireWrite(string what)
    {
        if (!_allowWrite)
            throw new InvalidOperationException(
                $"「{what}」 GHI vào TRNTRN nhưng autoSantei.allowSave = false. " +
                "Bật trong testsettings.local.json hoặc OCHA_AUTO_SANTEI_ALLOW_SAVE=1.");
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

    // ─────────────────────────────────────────────────────────────────────────
    // chkauto — 自動算定 (↔ findChkAutoSlots)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Dòng <c>chkauto</c> của một 処置; null khi mã đó KHÔNG có 自動算定 nào —
    /// đúng nhánh <c>if (ChkAutoData == null) return</c> (modMain.cs:843).
    /// </summary>
    public ChkAutoRow? ReadChkAuto(int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT trt_cd, trt_sb, cd1, sb1, cd2, sb2, cd3, sb3, cd4, sb4, cd5, sb5
              FROM chkauto
             WHERE trt_cd = @cd AND trt_sb = @sb
            """);
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;

        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return null;

        var pairs = new List<(int Cd, int Sb)>();
        for (var i = 1; i <= 5; i++)
        {
            // App đọc DBNull thành -1 (ChkAuto.cs:77-90); ô trống thật trong dữ liệu là 0.
            var cd = reader[$"cd{i}"] is DBNull ? -1 : Convert.ToInt32(reader[$"cd{i}"]);
            var sb = reader[$"sb{i}"] is DBNull ? -1 : Convert.ToInt32(reader[$"sb{i}"]);
            pairs.Add((cd, sb));
        }
        return new ChkAutoRow(trtCd, trtSb, pairs);
    }

    /// <summary>Tổng số dòng của bảng — con số này in ra log để biết phạm vi lệch parity.</summary>
    public int CountRows()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM chkauto");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Số dòng có TỪ HAI mã đi kèm trở lên — phần mà vòng lặp 5 lượt mới phủ hết.</summary>
    public int CountRowsWithSecondCode()
    {
        using var con = Open();
        using var cmd = Command(con, "SELECT COUNT(*) FROM chkauto WHERE cd2 > 100");
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Vài dòng đầu của bảng, để log nói được 「lệch này rộng tới đâu」.</summary>
    public IReadOnlyList<string> Describe(int limit = 12)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT TOP {limit} trt_cd, trt_sb, cd1, sb1, cd2, sb2 FROM chkauto ORDER BY trt_cd, trt_sb");
        var lines = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            lines.Add($"{reader["trt_cd"]}/{reader["trt_sb"]} → {reader["cd1"]}/{reader["sb1"]}" +
                      (Convert.ToInt32(reader["cd2"]) > 100 ? $" + {reader["cd2"]}/{reader["sb2"]}" : ""));
        return lines;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CMTAUTO — コメント自動入力 (↔ findCmtAutos)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Các カルテコメント gắn với một 処置, theo thứ tự <c>DISP_NO</c> — đúng thứ tự mà
    /// <c>ModMain.Chk_CmtAuto</c> (modMain.cs:738) duyệt.
    /// </summary>
    public IReadOnlyList<CmtAutoRow> FindCmtAutos(int trtCd, int trtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            """
            SELECT cmt_cd, cmt_sb, cmt_nm, disp_no, valid, no_chk
              FROM CMTAUTO
             WHERE trt_cd = @cd AND trt_sb = @sb
             ORDER BY disp_no
            """);
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = trtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = trtSb;

        var rows = new List<CmtAutoRow>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            rows.Add(new CmtAutoRow(
                Convert.ToInt32(reader["cmt_cd"]),
                Convert.ToInt32(reader["cmt_sb"]),
                reader["cmt_nm"]?.ToString()?.Trim() ?? "",
                Convert.ToInt32(reader["disp_no"]),
                reader["valid"] is DBNull ? 1 : Convert.ToInt32(reader["valid"]),
                reader["no_chk"] is DBNull ? 0 : Convert.ToInt32(reader["no_chk"])));
        return rows;
    }

    /// <summary>
    /// Tên カルテコメント mà LƯỚI thật sự in ra — lấy từ <c>MST_CMT2</c> theo
    /// <c>(cmt_cd, cmt_sb)</c>, null khi master không có dòng đó.
    ///
    /// <para>⚠️ <b>KHÔNG assert theo <c>CMTAUTO.CMT_NM</c>.</b> Cột đó là bản chép
    /// phi chuẩn hoá và trên DB dev nó ĐÃ LỆCH: <c>CMTAUTO(179,2)</c> ghi
    /// 「…ｵｸﾀﾌﾟﾚｼﾝCt1.8ml」 trong khi <c>MST_CMT2(7321,1)</c> — thứ app thật sự hiển thị —
    /// là 「…ｵｰﾗ注Ct1.8ml」. Đo được 2026-09-08; assert theo cột kia sẽ đỏ oan.
    /// Đây cũng là một điểm cần soi khi so parity: spec Playwright đang lấy kỳ vọng từ
    /// <c>cmt_auto.cmt_nm</c>.</para>
    /// </summary>
    public string? ResolveCmtName(int cmtCd, int cmtSb)
    {
        using var con = Open();
        using var cmd = Command(con,
            "SELECT cmt_nm FROM MST_CMT2 WHERE cmt_cd = @cd AND cmt_sb = @sb");
        cmd.Parameters.Add("@cd", SqlDbType.Int).Value = cmtCd;
        cmd.Parameters.Add("@sb", SqlDbType.Int).Value = cmtSb;
        return (cmd.ExecuteScalar() as string)?.Trim();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRNTRN — seed 部位病名行 + dọn (↔ seedTreatmentRows / delete*)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Seed MỘT 部位病名行 (<c>trt_cd = 0</c>) vào vùng test của đúng ngày đó, y như
    /// <c>seedTreatmentRows</c> bên Playwright (db.ts:416).
    ///
    /// <para><b>Vì sao seed được ở đây mà F21 lại cấm seed?</b> F21 nói về đường ghi chạy
    /// LÚC NHẬP (<c>SigaChg</c>, <c>DelExtRec</c>): chúng đọc <c>ModCommon.pbui</c> — bộ nhớ
    /// phiên chạy — nên dòng seed không đi qua <c>IregCodChk</c> thì cả nhánh biến mất.
    /// Ở đây dòng seed KHÔNG phải thứ đang đo: nó chỉ là <b>trạng thái xuất phát</b>, được
    /// nạp vào lưới lúc mở màn, và <c>CommonInp.getGridBuiDisInf()</c> đọc
    /// <c>pbui</c>/<c>dis_cd</c> từ <b>dòng đang có con trỏ</b> (CommonInp.cs:594) — dòng nào
    /// cũng vậy, seed hay không. Thứ đang đo là <c>Chk_ChkAuto</c>, và nó vẫn chạy trọn
    /// đường giao diện: gõ mã → 処置選択 → Enter ô 回.</para>
    ///
    /// <para>Trước 2026-09-08 luồng này dựng 部位病名行 bằng chính 部位選択 + 病名選択. Bốn
    /// lượt chạy đều chết vì <c>AutoBui</c> không chép được 部位 xuống dòng 処置
    /// (modMain.cs:139-146 bỏ qua dòng đã có dữ liệu) ⇒ 「算定可能な部位がありません」 ⇒
    /// 回 = 0 ⇒ <c>Chk_ChkAuto</c> không chạy. Seed đúng cái mà spec Playwright seed vừa
    /// gỡ được nút đó, vừa làm hai bên xuất phát từ CÙNG một trạng thái.</para>
    /// </summary>
    /// <param name="buiSlot">Ô 部位 0-based (0..31) ⇒ cột <c>BUI{slot+1}</c>.</param>
    /// <param name="buiVal">Giá trị ô 部位; 1 = 永久歯 đang chọn.</param>
    public int SeedBuiDisRow(int patNo, DateTime trtDt, int buiSlot, int buiVal,
                             int disCd, int disSb, string dspBui, string dspDis)
    {
        RequireWrite("seed 部位病名行");
        DeleteSeededRows(patNo, trtDt);

        var buiCols = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"BUI{i}"));
        var buiVals = string.Join(", ", Enumerable.Range(1, 32).Select(i => $"@b{i}"));
        var disCdCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_CD{i}"));
        var disCdVals = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"@dc{i}"));
        var disSbCols = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"DIS_SB{i}"));
        var disSbVals = string.Join(", ", Enumerable.Range(1, 10).Select(i => $"@ds{i}"));

        // PAT_BR / INSU_CD phải hợp lệ với đăng ký của bệnh nhân ⇒ kế thừa từ một dòng
        // THẬT, y như bản Playwright. SEQ là identity nên KHÔNG được liệt kê.
        var sql = new StringBuilder()
            .Append($"INSERT INTO TRNTRN (DEL_FLG, PAT_NO, PAT_BR, INSU_CD, TRT_DT, RAIIN_CNT, DISP_NO, ")
            .Append($"{buiCols}, {disCdCols}, {disSbCols}, ")
            .Append("TRT_CD, TRT_SB, TRT_CNT, TRT_PT, ISL, PRICE, JIHI_FLG, DR_NO, SYOSIN_FLG, ")
            .Append("DSP_BUI, DSP_TRT, DSP_DIS) ")
            .Append("SELECT TOP 1 0, PAT_NO, PAT_BR, INSU_CD, @dt, 1, @disp, ")
            .Append($"{buiVals}, {disCdVals}, {disSbVals}, ")
            .Append("0, 0, 0, 0, 0, 0, 0, 1, 3, @dspBui, '', @dspDis ")
            .Append($"FROM TRNTRN WHERE PAT_NO = @p AND DISP_NO < {SeedDispBase} ORDER BY TRT_DT DESC")
            .ToString();

        using var con = Open();
        using var cmd = Command(con, sql);
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;
        cmd.Parameters.Add("@disp", SqlDbType.Int).Value = SeedDispBase + 1;
        cmd.Parameters.Add("@dspBui", SqlDbType.VarChar).Value = dspBui;
        cmd.Parameters.Add("@dspDis", SqlDbType.VarChar).Value = dspDis;
        for (var i = 1; i <= 32; i++)
            cmd.Parameters.Add($"@b{i}", SqlDbType.TinyInt).Value = i == buiSlot + 1 ? buiVal : 0;
        for (var i = 1; i <= 10; i++)
        {
            cmd.Parameters.Add($"@dc{i}", SqlDbType.SmallInt).Value = i == 1 ? disCd : 0;
            cmd.Parameters.Add($"@ds{i}", SqlDbType.TinyInt).Value = i == 1 ? disSb : 0;
        }
        return cmd.ExecuteNonQuery();
    }

    /// <summary>Xoá vùng seed của ĐÚNG ngày test (↔ <c>deleteTreatmentRows</c>).</summary>
    public int DeleteSeededRows(int patNo, DateTime trtDt)
    {
        RequireWrite("dọn vùng seed");
        using var con = Open();
        using var cmd = Command(con,
            $"DELETE FROM TRNTRN WHERE PAT_NO = @p AND TRT_DT = @dt AND DISP_NO >= {SeedDispBase}");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;
        return cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Xoá các dòng mà 自動算定 / コメント自動入力 kéo theo <paramref name="trtCd"/>, cùng
    /// chính dòng đó (↔ <c>deleteChkAutoCompanionRows</c> + <c>deleteTreatmentRowsByTrtCd</c>).
    ///
    /// <para>Cần vì các dòng đi kèm mang MÃ KHÁC và KHÔNG mang <c>DSP_TRT</c> của 処置 gốc,
    /// nên mọi đường dọn theo tên đều trượt.</para>
    ///
    /// <para>⚠️ Xoá theo MÃ nên nó cuốn luôn dòng THẬT cùng mã trong đúng ngày đó — chỉ gọi
    /// khi <c>autoSantei.allowRowCleanup</c> bật VÀ ngày test không có sẵn dòng nào mang các
    /// mã ấy (fixture kiểm bằng <see cref="CountRowsWithTrtCds"/> trước lượt chạy).</para>
    /// </summary>
    public int DeleteCompanionRows(int patNo, DateTime trtDt, int trtCd, int trtSb)
    {
        RequireWrite("dọn dòng đi kèm");
        var codes = CompanionCodes(trtCd, trtSb);
        if (codes.Count == 0) return 0;

        using var con = Open();
        var list = string.Join(",", codes);
        using var cmd = Command(con,
            $"DELETE FROM TRNTRN WHERE PAT_NO = @p AND TRT_DT = @dt AND TRT_CD IN ({list})");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;
        return cmd.ExecuteNonQuery();
    }

    /// <summary>Mọi mã mà một cú chốt <paramref name="trtCd"/>/<paramref name="trtSb"/> để lại.</summary>
    public IReadOnlyList<int> CompanionCodes(int trtCd, int trtSb)
    {
        var codes = new List<int> { trtCd };
        codes.AddRange(ReadChkAuto(trtCd, trtSb)?.TreatmentPairs.Select(p => p.Cd) ?? []);
        codes.AddRange(FindCmtAutos(trtCd, trtSb).Select(c => c.CmtCd));
        return codes.Distinct().ToList();
    }

    /// <summary>Số dòng của ngày test mang một trong các mã — HÀNG RÀO cho tầng dọn.</summary>
    public int CountRowsWithTrtCds(int patNo, DateTime trtDt, IReadOnlyList<int> trtCds)
    {
        if (trtCds.Count == 0) return 0;
        using var con = Open();
        var list = string.Join(",", trtCds);
        using var cmd = Command(con,
            $"SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO = @p AND TRT_DT = @dt AND TRT_CD IN ({list}) " +
            $"AND DISP_NO < {SeedDispBase}");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    /// <summary>Nội dung các dòng 処置 của ngày test — in ra khi cần dựng tay.</summary>
    public IReadOnlyList<string> DescribeDayRows(int patNo, DateTime trtDt, int limit = 40)
    {
        using var con = Open();
        using var cmd = Command(con,
            $"SELECT TOP {limit} DISP_NO, TRT_CD, TRT_SB, TRT_CNT, TRT_PT, DSP_TRT " +
            "FROM TRNTRN WHERE PAT_NO = @p AND TRT_DT = @dt ORDER BY DISP_NO");
        cmd.Parameters.Add("@p", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@dt", SqlDbType.DateTime).Value = trtDt.Date;

        var lines = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            lines.Add($"disp {reader["DISP_NO"]}: {reader["TRT_CD"]}/{reader["TRT_SB"]} " +
                      $"×{reader["TRT_CNT"]} {reader["TRT_PT"]}点 「{reader["DSP_TRT"]}」");
        return lines;
    }
}

/// <summary>Một dòng <c>chkauto</c> đã đọc xong (↔ <c>ChkAutoSlot[]</c> bên web).</summary>
/// <param name="Pairs">Năm ô <c>(cd_i, sb_i)</c> theo ĐÚNG thứ tự app duyệt.</param>
public sealed record ChkAutoRow(int TrtCd, int TrtSb, IReadOnlyList<(int Cd, int Sb)> Pairs)
{
    /// <summary>Dải 摘要マスタ — <c>codeRange[receipt]</c> = 700..899 (DbLibrary.cs:29).</summary>
    public const int ReceiptCodeMin = 700;
    public const int ReceiptCodeMax = 899;

    /// <summary>
    /// Ô đi nhánh 摘要 (chèn một dòng コメント 0 点, modMain.cs:864-908). App xét nhánh này
    /// TRƯỚC, nên nó phải bị loại khỏi <see cref="TreatmentPairs"/>.
    /// </summary>
    public IReadOnlyList<(int Cd, int Sb)> CommentPairs =>
        Pairs.Where(p => p.Cd is >= ReceiptCodeMin and <= ReceiptCodeMax).ToList();

    /// <summary>
    /// Những ô thật sự dẫn tới một 処置 — nhánh <c>else if (ChkAutoData.cd[i] &gt; 100)</c>
    /// (modMain.cs:914). Ô 0 và ô -1 (NULL) rơi hết ở đây, dải 摘要 700..899 cũng vậy vì
    /// nó đã bị nhánh trên bắt mất.
    ///
    /// <para>Tương ứng 1-1 với <c>findChkAutoSlots</c> bên Playwright (db.ts:1840) — bên đó
    /// chỉ lọc <c>cd !== 0</c>, tức KHÔNG tách nhánh 摘要. Nếu một tenant có slot rơi vào dải
    /// 700..899 thì hai bên sẽ tính kỳ vọng khác nhau; ghi lại ở đây để lần sau soi.</para>
    /// </summary>
    public IReadOnlyList<(int Cd, int Sb)> TreatmentPairs =>
        Pairs.Where(p => p.Cd > 100 && p.Cd is < ReceiptCodeMin or > ReceiptCodeMax).ToList();

    public override string ToString() =>
        $"chkauto({TrtCd},{TrtSb}) → [" +
        string.Join(", ", Pairs.Where(p => p.Cd > 0).Select(p => $"{p.Cd}/{p.Sb}")) + "]";
}

/// <summary>Một dòng <c>CMTAUTO</c> (↔ <c>CmtAutoRow</c> bên web).</summary>
/// <param name="DispNo">
/// Quyết định CHỖ chèn (frm203002.cs:10085-10111): &lt; 0 → dòng TRÊN 処置, = 0 → nối vào
/// cuối ô 療法 của chính 処置 (KHÔNG thêm dòng), &gt; 0 → dòng DƯỚI.
/// </param>
/// <param name="NoChk">
/// 0 nghĩa là dòng này cần người chọn. Một batch chỉ bung カルテ記載選択 khi có ≥ 2 dòng
/// VÀ có ít nhất một dòng <c>no_chk = 0</c> (frm203012.cs:536); ngược lại app tự áp dụng.
/// </param>
public sealed record CmtAutoRow(int CmtCd, int CmtSb, string CmtNm, int DispNo, int Valid, int NoChk)
{
    /// <summary>Dòng này có sinh ra một DÒNG RIÊNG trên lưới không (<c>disp_no ≠ 0</c>).</summary>
    public bool MakesOwnRow => DispNo != 0;

    public override string ToString() =>
        $"{CmtCd}/{CmtSb} 「{CmtNm}」 disp_no={DispNo} no_chk={NoChk}";
}
