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

    /// <summary>
    /// HAI kiểu hỏng, hai câu E00100 khác hẳn nhau — xem README của luồng mục 2.
    /// </summary>
    public enum SeedMode
    {
        /// <summary>
        /// <c>LFLG</c> trỏ vào mã không có trong <c>LOCALFLG</c> ⇒ buiPrice.cs:1734 bật
        /// 「福祉医療設定データが存在しません」. <b>KHÔNG ném</b>: app vá <c>localFlg</c> mặc
        /// định (buiPrice.cs:1866-1872) rồi tính tiếp, nên số trên màn hình KHÔNG về 0.
        /// </summary>
        LocalFlgMissing,

        /// <summary>
        /// Ép <c>getLimitApplicationCertificateRelatedInfo</c> ném, ⇒ nhánh <c>catch</c>
        /// của buiPrice.cs:196-203 bật 「患者登録データを確認してください」 — <b>đúng hộp mà
        /// spec Playwright mô phỏng</b>, kèm <c>内容[]</c> và <c>場所[stack trace]</c>.
        ///
        /// <para>Chỗ ném: buiPrice.cs:998 gọi <c>BeneficiaryNumber.Substring(0, 2)</c>
        /// trong khi guard chỉ kiểm <c>PublicExpenseNumber.Length == 8</c> — HAI FIELD
        /// KHÁC NHAU. 受給者番号 rỗng ⇒ <c>ArgumentOutOfRangeException</c>. Đây là một lỗi
        /// THẬT của WinForm, không phải chỗ test tự bịa.</para>
        ///
        /// <para>Nhánh đó chỉ tới được với bệnh nhân <b>70歳以上 医保</b>, nên seed phải
        /// đổi thêm <c>INS_KBN</c> → 2 (国保) và <c>OLD_FLG</c> → 4 (前期高齢者). Hai cột đó
        /// nằm trong ảnh chụp và được trả lại nguyên vẹn.</para>
        ///
        /// <para>Ném xảy ra ở buiPrice.cs:334, TRƯỚC <c>_rtnData.insPayDatas = payDatas</c>
        /// (:649) ⇒ <c>buiPriceData2</c> trả về giữ nguyên giá trị khởi tạo <b>toàn 0</b> —
        /// đúng cảnh mà spec web dựng.</para>
        /// </summary>
        CalcException,

        /// <summary>
        /// <b>ĐỐI CHỨNG.</b> Đổi ĐÚNG hai cột mà <see cref="CalcException"/> phải đổi
        /// (<c>INS_KBN</c> → 2, <c>OLD_FLG</c> → 4) và <b>KHÔNG</b> chèn dòng 公費 nào.
        ///
        /// <para>Không có 公費 ⇒ <c>pubexpInfs</c> rỗng ⇒ guard
        /// <c>pubexpInfs.Count &gt; 0</c> ở buiPrice.cs:997 chặn ngay, cú
        /// <c>Substring</c> không bao giờ chạy ⇒ <b>KHÔNG có E00100 nào</b>.</para>
        ///
        /// <para>Dùng để trả lời một câu hỏi mà không có nó thì mọi kết luận đều lung
        /// lay: lượt <see cref="CalcException"/> kết thúc bằng 「システムエラーです。」 và
        /// KHÔNG sang 窓口精算 — đó là do E00100, hay chỉ vì bệnh nhân test bị đổi thành
        /// 国保 前期高齢者 mà 保険者番号 của họ không hợp lệ với 国保? Chạy mode này rồi so
        /// chuỗi F8: giống nhau ⇒ thủ phạm là <c>INS_KBN</c>, khác nhau ⇒ là E00100.</para>
        /// </summary>
        InsKbnControl,
    }

    /// <summary>Một dòng <c>UNPAID</c> — chỉ để chụp ảnh và trả lại.</summary>
    public sealed record UnpaidRow(string TrtDt, int TrtCnt, int KmCd, int PatBr, int Lflg,
                                   int Score, int ClaimAmt)
    {
        public override string ToString() =>
            $"{TrtDt} 来院{TrtCnt} 科目{KmCd} 枝番{PatBr} lflg{Lflg} {Score}点 {ClaimAmt}円";
    }

    /// <summary>
    /// <c>UNPAID</c> của MỘT ngày.
    ///
    /// <para>Cần vì <c>LetAccData2</c> gọi <c>UnPaid.deleteTrtDtUnPaid</c> ở
    /// <b>modAcc.cs:427</b> — TRƯỚC mọi hộp thoại 「…作成してよろしいですか?」 (:560). Nghĩa
    /// là chuỗi F8 đi qua được cổng ngày là dòng 未精算 của ngày đó BAY, bất kể sau đó trả
    /// lời gì. Không có transaction nào để lui.</para>
    /// </summary>
    public IReadOnlyList<UnpaidRow> ReadUnpaid(int patNo, DateTime day)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT TRT_DT, TRT_CNT, KM_CD, PAT_BR, LFLG, SCORE, CLAIM_AMT FROM UNPAID " +
            "WHERE PAT_NO = @pat AND TRT_DT = @d ORDER BY TRT_CNT, KM_CD");
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@d", SqlDbType.VarChar, 10).Value = day.ToString("yyyy/MM/dd");

        var rows = new List<UnpaidRow>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
            rows.Add(new UnpaidRow(S(r["TRT_DT"]), I(r["TRT_CNT"]), I(r["KM_CD"]), I(r["PAT_BR"]),
                                   I(r["LFLG"]), I(r["SCORE"]), I(r["CLAIM_AMT"])));
        return rows;
    }

    /// <summary>Ảnh chụp trước khi seed — đủ để đưa DB về đúng như cũ.</summary>
    /// <param name="Insurance">Toàn bộ dòng <c>INSURANCE</c> (cần PUBEXPINF_NO, INS_KBN, OLD_FLG cũ).</param>
    /// <param name="Pubexp">Toàn bộ dòng <c>PUBEXPINF</c> của bệnh nhân trước khi seed.</param>
    /// <param name="Unpaid">
    /// <c>UNPAID</c> của ngày test. Chỉ nhóm chạy chuỗi F8 mới đụng tới; các nhóm khác chụp
    /// cho có để lỡ có gì lệch thì còn biết mà so.
    /// </param>
    public sealed record Snapshot(int PatNo,
                                  IReadOnlyList<InsuranceRow> Insurance,
                                  IReadOnlyList<PubexpRow> Pubexp,
                                  IReadOnlyList<UnpaidRow> Unpaid);

    public Snapshot TakeSnapshot(int patNo, DateTime day) =>
        new(patNo, ReadInsurance(patNo), ReadPubexp(patNo), ReadUnpaid(patNo, day));

    /// <summary>Kết quả của một lượt seed — in ra log để đối chiếu với hộp thoại đọc được.</summary>
    /// <param name="Blocker">Khác null ⇒ KHÔNG seed được, testcase phải Ignore kèm lý do này.</param>
    public sealed record Seed(SeedMode Mode, int PatNo, int PatBr, int PubexpinfNo, string Lflg,
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
    public Seed SeedBrokenPubexp(SeedMode mode, int patNo, string lflg, int pubexpinfNo, DateTime month)
    {
        var insurance = ReadInsurance(patNo);
        if (insurance.Count == 0)
            return Blocked($"bệnh nhân {patNo} không có dòng INSURANCE nào");

        if (pubexpinfNo == 0)
            return Blocked("buiPrice.seedPubexpinfNo = 0 — PatInfoList.cs:678 bỏ hẳn dòng 公費 " +
                           "khi ins.pubexpinf_no = 0, seed sẽ không có tác dụng");

        // 福祉医療番号: mode LocalFlgMissing SỐNG nhờ nó vắng mặt; mode CalcException thì
        // ngược lại — phải để RỖNG, vì lflg khác rỗng sẽ bật hộp (B) TRƯỚC và probe không
        // còn phân biệt được hai nhánh nữa.
        var seedLflg = mode == SeedMode.LocalFlgMissing ? lflg : "";

        if (mode == SeedMode.InsKbnControl)
        {
            // ĐỐI CHỨNG: KHÔNG đụng PUBEXPINF, KHÔNG đụng PUBEXPINF_NO — chỉ hai cột
            // 保険 mà mode CalcException buộc phải đổi.
            var brc = insurance.Min(i => i.PatBr);
            using var conC = Open();
            using var txC = conC.BeginTransaction();
            Exec(conC, txC,
                 "UPDATE INSURANCE SET INS_KBN = 2, OLD_FLG = 4 WHERE PAT_NO = @pat AND PAT_BR = @br",
                 ("@pat", patNo), ("@br", brc));
            txC.Commit();
            return new Seed(mode, patNo, brc, pubexpinfNo, "", default, default, null);
        }

        if (mode == SeedMode.LocalFlgMissing && CountLocalFlg(lflg) != 0)
            return Blocked($"福祉医療番号 「{lflg}」 CÓ THẬT trong LOCALFLG ⇒ getLocalFlg không trả " +
                           "null và E00100 không bật. Đổi buiPrice.missingLflg sang mã khác.");

        // 受給者番号 RỖNG là cả mấu chốt của mode CalcException (buiPrice.cs:998), và phải
        // KHÁC rỗng ở mode kia để dòng 公費 trông như dữ liệu thật.
        var cerNo = mode == SeedMode.CalcException ? "" : "7777777";

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
             // 負担者番号 phải ĐÚNG 8 ký tự: guard buiPrice.cs:997 kiểm Length == 8 rồi mới
             // chạy tới cú Substring hỏng ở dòng ngay dưới.
             ("@def", "88888888"), ("@cer", cerNo),
             ("@q", qualification), ("@e", expiry),
             ("@lflg", seedLflg), ("@office", "FLAUI-SEED"));

        if (mode == SeedMode.CalcException)
            // 70歳以上 医保: điều kiện để buiPrice.cs:990-998 chạy tới. ins_kbn 7 (公費単独)
            // rơi vào nhánh rỗng ngay ở :989 nên KHÔNG bao giờ tới được cú Substring.
            Exec(con, tx,
                 "UPDATE INSURANCE SET PUBEXPINF_NO = @no, INS_KBN = 2, OLD_FLG = 4 " +
                 "WHERE PAT_NO = @pat AND PAT_BR = @br",
                 ("@no", pubexpinfNo), ("@pat", patNo), ("@br", br));
        else
            Exec(con, tx, "UPDATE INSURANCE SET PUBEXPINF_NO = @no WHERE PAT_NO = @pat AND PAT_BR = @br",
                 ("@no", pubexpinfNo), ("@pat", patNo), ("@br", br));

        tx.Commit();
        return new Seed(mode, patNo, br, pubexpinfNo, seedLflg, qualification, expiry, null);

        Seed Blocked(string why) =>
            new(mode, patNo, 0, pubexpinfNo, lflg, default, default, why);
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

        // Đặt lại CẢ BA cột mà seed có thể đã đụng — mode CalcException còn sửa
        // INS_KBN/OLD_FLG, và quên chúng thì bệnh nhân test ở lại dạng 国保 前期高齢者
        // vĩnh viễn: mọi luồng khác sau đó đo trên một bệnh nhân KHÁC hẳn mà không ai hay.
        foreach (var ins in snap.Insurance)
            Exec(con, tx,
                 "UPDATE INSURANCE SET PUBEXPINF_NO = @no, INS_KBN = @kbn, OLD_FLG = @old " +
                 "WHERE PAT_NO = @pat AND PAT_BR = @br",
                 ("@no", ins.PubexpinfNo), ("@kbn", ins.InsKbn), ("@old", ins.OldFlg),
                 ("@pat", snap.PatNo), ("@br", ins.PatBr));

        tx.Commit();
        return $"PUBEXPINF: xoá {deleted}, chèn lại {restored}; " +
               $"INSURANCE (PUBEXPINF_NO/INS_KBN/OLD_FLG): đặt lại {snap.Insurance.Count} 枝番";
    }

    /// <summary>
    /// Trả <c>UNPAID</c> của ngày test về đúng ảnh chụp.
    ///
    /// <para>Tách khỏi <see cref="Restore"/> vì chỉ nhóm chạy chuỗi F8 mới cần: F8 đi qua
    /// cổng ngày là <c>deleteTrtDtUnPaid</c> chạy (modAcc.cs:427) bất kể sau đó trả lời gì.
    /// Nhóm nào không bấm F8 thì gọi hàm này chỉ tốn một truy vấn.</para>
    ///
    /// <para>Xoá sạch rồi chèn lại theo ảnh: dòng do F8 sinh ra mang khoá khác với dòng
    /// cũ nên "xoá cái mới" không đủ.</para>
    /// </summary>
    public string RestoreUnpaidForDay(int patNo, DateTime day, IReadOnlyList<UnpaidRow> snap)
    {
        using var con = Open();
        using var tx = con.BeginTransaction();

        var removed = Exec(con, tx, "DELETE FROM UNPAID WHERE PAT_NO = @pat AND TRT_DT = @d",
                           ("@pat", patNo), ("@d", day.ToString("yyyy/MM/dd")));

        foreach (var u in snap)
            Exec(con, tx,
                 "INSERT INTO UNPAID (PAT_NO, TRT_DT, TRT_CNT, KM_CD, PAT_BR, LFLG, SCORE, CLAIM_AMT) " +
                 "VALUES (@pat, @d, @cnt, @km, @br, @lflg, @sc, @amt)",
                 ("@pat", patNo), ("@d", u.TrtDt), ("@cnt", u.TrtCnt), ("@km", u.KmCd),
                 ("@br", u.PatBr), ("@lflg", u.Lflg), ("@sc", u.Score), ("@amt", u.ClaimAmt));

        tx.Commit();
        return $"UNPAID ngày {day:yyyy-MM-dd}: xoá {removed}, chèn lại {snap.Count}";
    }

    // ── ORACLE: 日計 tính lại từ TRNTRN ──────────────────────────────────────

    /// <summary>
    /// 日計点数 của từng ngày trong tháng, tính lại từ <c>TRNTRN</c> — <b>mốc ĐỘC LẬP</b>
    /// với con số app đang vẽ.
    ///
    /// <code>
    /// buiPrice.cs:286-291  (getInsInfo2, nhánh jihi_flg = 0 「医療保険」)
    ///     int trt_cnt = trtData.trt_cd == 50 ? 1 : trtData.trt_cnt;
    ///     payDataCur.score += trtData.trt_pt * trt_cnt;      // gom theo (trt_dt, raiin_cnt)
    /// modAcc.cs:190-192     (DispDayPoint)
    ///     insScore += payData.score;                          // cộng mọi 枝番 của NGÀY đó
    ///     hFG1[2, targetRow] = "[負担金 …円]  [日計 " + insScore + "点]"
    /// </code>
    ///
    /// <para>Đo rồi chép con số vào assert thì testcase chỉ còn so app với chính nó —
    /// đổi bệnh nhân hay đổi tháng là kỳ vọng phải tự đổi theo.</para>
    /// </summary>
    public IReadOnlyDictionary<int, int> DayPointOracle(int patNo, DateTime month)
    {
        var first = new DateTime(month.Year, month.Month, 1);
        var last = first.AddMonths(1).AddDays(-1);

        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT DAY(trt_dt) AS d, " +
            "       SUM(trt_pt * CASE WHEN trt_cd = 50 THEN 1 ELSE trt_cnt END) AS pt " +
            "FROM TRNTRN " +
            "WHERE pat_no = @pat AND del_flg = '0' AND jihi_flg = 0 " +
            "  AND trt_dt BETWEEN @a AND @b " +
            "GROUP BY DAY(trt_dt)");
        cmd.Parameters.Add("@pat", SqlDbType.Int).Value = patNo;
        cmd.Parameters.Add("@a", SqlDbType.Date).Value = first;
        cmd.Parameters.Add("@b", SqlDbType.Date).Value = last;

        var map = new Dictionary<int, int>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) map[I(r["d"])] = I(r["pt"]);
        return map;
    }

    /// <summary>
    /// Số lần <c>getBuiPrice2</c> chạy khi mở 当日来患 của một ngày = số cặp
    /// (患者番号, 枝番) mà <c>Trntrn.getInpTrntrnData(con, dteTrtDt)</c> trả về
    /// (Trntrn.cs:2132-2140), tức là số hộp E00100 tối đa có thể bung ra.
    ///
    /// <para>Chép lại ĐÚNG mệnh đề lọc của app — kể cả <c>TRN_STATUS.miraiin_kbn = 0</c>
    /// và nhánh <c>UNION</c> từ <c>ACCDAT</c>. Bỏ sót một vế là kỳ vọng lệch mà log
    /// trông y hệt 「WinForm bật thừa/thiếu hộp thoại」.</para>
    /// </summary>
    public IReadOnlyList<(int PatNo, int PatBr)> TodayViewKeys(DateTime day)
    {
        using var con = Open();
        using var cmd = Cmd(con,
            "SELECT DISTINCT trn.PAT_NO, trn.PAT_BR FROM TRNTRN AS trn " +
            "INNER JOIN TRN_STATUS AS trn_s ON trn_s.PAT_NO = trn.PAT_NO " +
            "  AND trn_s.SINRYO_YM = @ym AND trn_s.miraiin_kbn = 0 " +
            "WHERE trn.TRT_DT = @d AND trn.JIHI_FLG = 0 " +
            "UNION " +
            "SELECT DISTINCT PAT_NO, PAT_BR FROM ACCDAT " +
            "WHERE TRT_DT = @d AND SCORE <> 0 AND LFLG = 0 AND DEL_FLG = 0");
        cmd.Parameters.Add("@d", SqlDbType.VarChar, 10).Value = day.ToString("yyyy/MM/dd");
        cmd.Parameters.Add("@ym", SqlDbType.VarChar, 6).Value = day.ToString("yyyyMM");

        var rows = new List<(int, int)>();
        using var r = cmd.ExecuteReader();
        while (r.Read()) rows.Add((I(r["PAT_NO"]), I(r["PAT_BR"])));
        return rows;
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
    /// Phần ĐOÁN TRƯỚC ĐƯỢC của thân hộp thoại nhánh ngoại lệ — buiPrice.cs:197-201:
    ///
    /// <code>
    /// string.Format("一部負担金計算に失敗しました。患者登録データを確認してください。\r\n" +
    ///               "　患者番号[{0}] 枝番[{1}] 診療年月[{2}]\r\n\r\n内容[{3}]\r\n場所[{4}]",
    ///               patNo, patBr, editDateToString(trtStDt, "gggy年M月"), ex.Message, ex.StackTrace);
    /// </code>
    ///
    /// <para>Chỉ trả về tới hết dòng 2. <c>内容[]</c> mang <c>ex.Message</c> và
    /// <c>場所[]</c> mang <c>ex.StackTrace</c> — hai thứ đổi theo phiên bản .NET và theo
    /// bản build, viết cứng vào assert là tự chuốc lấy một testcase vỡ mỗi lần rebuild.
    /// Testcase kiểm phần này bằng <c>StartsWith</c> rồi kiểm RIÊNG sự CÓ MẶT của
    /// <c>内容[</c> và <c>場所[</c> — vì chính sự có mặt của <c>場所[stack trace]</c> mới là
    /// điểm lệch đã chốt với bản web.</para>
    /// </summary>
    public static string CalcFailedPrefix(int patNo, int patBr, DateTime trtMonth) =>
        CalcFailedHead + "\r\n" +
        $"　患者番号[{patNo}] 枝番[{patBr}] 診療年月[{Wareki(trtMonth)}]";

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
