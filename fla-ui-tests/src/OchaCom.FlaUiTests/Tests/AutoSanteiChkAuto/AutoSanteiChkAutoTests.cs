using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// 自動算定 — <c>ModMain.Chk_ChkAuto</c>: nửa WinForm của lệch parity 「bảng
/// <c>chk_auto</c> chưa được port ở runtime」.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// LỆCH ĐANG ĐO
/// ═══════════════════════════════════════════════════════════════════════════════
/// Nhập 抜歯 179/2 lên một răng, rồi so hai bên:
/// <code>
///                                              WinForm      Web
///   6 (1) Ｃ₂                                    có          có
///   OA（ｺｰﾊﾟﾛﾝ）浸麻（…）              0 点      có          KHÔNG
///   抜歯手術(臼歯)                    270 点      có          có
///   OA+ｵｰﾗ注歯科用ｶｰﾄﾘｯｼﾞ 料1.8mL      11 点      có          KHÔNG
///   日計                                        443 点      432 点
/// </code>
/// Lệch 11 điểm cho MỘT ca 抜歯 ⇒ sai cả tiền thu lẫn レセプト.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CƠ CHẾ — ba lệnh gọi ngay sau khi Enter ô 回
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>frm203002.cs:5738-5752</c>, case 4 (ô 回), điều kiện DUY NHẤT là <c>trtCnt >= 1</c>:
/// <code>
///   ModMain.Chk_CmtAuto(con, intCod, intNo, trtCnt);   ← web CÓ (runCmtAutoCascade)
///   ModMain.Chk_ChkAuto_soutyaku(con, intCod, intNo);  ← 装着料自動算定
///   ModMain.Chk_ChkAuto(con, intCod, intNo);           ← 自動算定  ★ chỗ đang đo
/// </code>
/// <c>Chk_ChkAuto</c> (modMain.cs:812) đọc bảng <c>chkauto</c>, lấy TỐI ĐA 5 mã đi kèm,
/// và chèn từng mã qua <c>frm203016.frm203016_Hide_Let_Trt_Data</c> — sau khi cho mã đó
/// đi qua 診療チェック (<c>Check.getCheckAnswerGuide</c>, modMain.cs:914-940).
/// Dữ liệu khớp đúng ảnh trên: <c>chkauto(179,2) → cd1 = 310 / sb1 = 2</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TcAUTO1  (mốc)        chkauto có dòng cho mã đem thử, master có đủ mã đi kèm
///   TcAUTO2  (lệch chính) nhập 179/2 ⇒ app TỰ CHÈN 310/2 và 月計 tăng thêm đúng điểm của nó
///   TcAUTO3  (đối chứng)  mã KHÔNG có trong chkauto ⇒ KHÔNG có dòng nào được tự chèn
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI ĐI QUA GIAO DIỆN, KHÔNG SEED DB (F21)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>Chk_ChkAuto</c> chạy NGAY LÚC NHẬP và đọc trạng thái TRONG BỘ NHỚ của phiên chạy
/// (<c>ModCommon.pbui</c>, <c>ModCommon.pHoumon</c>, <c>ModCommon.dis_cd</c> —
/// modMain.cs:855-940). Dòng seed thẳng vào <c>TRNTRN</c> không bao giờ đi qua
/// <c>frm203002</c> case 4, nên cả nhánh này biến mất và phép đo thành vô nghĩa.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// KHÔNG bấm F9 ⇒ <c>TRNTRN</c> không bị đụng: mọi dòng ở đây chỉ nằm trong bộ nhớ lưới.
/// Nhưng 抜歯 đi qua <c>frm203016.IregCodChk → SigaChg</c> nên nó GHI THẲNG vào <c>SIGA</c>
/// ngay lúc chốt (frm203016.cs:1032-1035) — và răng phải là 現存 thì <c>ChkSiga</c> mới
/// cho 抜歯 đi qua. Vì thế fixture nằm sau cờ RIÊNG <c>autoSantei.allowSave</c>: nó chụp
/// SIGA ở <see cref="PrepareDataBeforeApp"/>, IN RA STDOUT, và trả lại ở OneTimeTearDown.
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class AutoSanteiChkAutoTests : UiTestBase
{
    private ChkAutoDb _chk = null!;
    private SigaKonDb _siga = null!;
    private SigaToothFlow _flow = null!;
    private AutoSanteiOps _ops = null!;

    private SigaSnapshot? _sigaBefore;

    private int TrtCd => Settings.AutoSantei.TrtCd;
    private int TrtSb => Settings.AutoSantei.TrtSb;
    private int ControlCd => Settings.AutoSantei.ControlTrtCd;
    private int ControlSb => Settings.AutoSantei.ControlTrtSb;
    private int BuiSlot => Settings.AutoSantei.BuiSlot;
    private int DisCd => Settings.AutoSantei.DisCd;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    protected override string? FixturePreflightSkipReason() =>
        Settings.AutoSantei.AllowSave
            ? null
            : "Cần autoSantei.allowSave = true (hoặc OCHA_AUTO_SANTEI_ALLOW_SAVE=1). Fixture " +
              $"nhập {Settings.AutoSantei.TrtCd} (抜歯) qua giao diện, mà mã đó đi qua " +
              "frm203016.SigaChg nên mỗi lượt chốt là một 「update Siga」 thật " +
              "(frm203016.cs:1032-1035); và răng phải được đặt về 現存 TRƯỚC KHI APP MỞ thì " +
              "ChkSiga mới cho 抜歯 đi qua. KHÔNG bấm F9 ⇒ TRNTRN không bị đụng.";

    /// <summary>
    /// Đặt răng đem thử về 現存 TRƯỚC KHI APP MỞ.
    ///
    /// <para>Hai lý do, cả hai đều bắt buộc: <c>ChkSiga</c> loại 抜歯 trên răng đã 欠損 (nên
    /// không đặt thì TcAUTO2 đo phải một cái không xảy ra), và <c>pSiga_old</c> — ảnh chụp
    /// mà <c>Restore_SK</c> lùi về — chỉ được nạp ĐÚNG MỘT LẦN lúc mở 診療入力
    /// (modKonSiga.cs:70-84), nên ghi sau khi màn hình đã mở là app không bao giờ thấy.</para>
    ///
    /// <para>⚠️ CHỤP NGUYÊN TRẠNG TRƯỚC KHI ĐẶT MỐC (F20). Chụp sau là chụp phải chính cái
    /// mốc mình vừa ghi đè, và teardown sẽ 「khôi phục」 về mốc chứ không về nguyên trạng.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        var db = SigaKonDb.CreateOrNull(Settings, Settings.AutoSantei.AllowSave);
        if (db is null || !db.CanWrite || db.ProbeError() is not null) return;

        db.EnsureSigaRow(PatNo);
        _sigaBefore = db.ReadSiga(PatNo);
        Log($"nguyên trạng SIGA (chụp TRƯỚC khi đặt mốc): {_sigaBefore}");
        db.ResetSigaToVital(PatNo);
        Log($"đặt mốc TRƯỚC khi mở app: mọi se* = {SigaKonDb.SeVital} (現存) ⇒ ChkSiga cho 抜歯 đi qua.");
    }

    [OneTimeSetUp]
    public void AutoSanteiOneTimeSetUp()
    {
        var chk = ChkAutoDb.CreateOrNull(Settings);
        if (chk is null) IgnoreWithReason("Cần DB để đọc chkauto — " + (DbUnavailableReason ?? "db.enabled = false"));
        var error = chk!.ProbeError();
        if (error is not null) IgnoreWithReason($"không kết nối được SQL Server: {error}");
        _chk = chk;
        _siga = SigaKonDb.CreateOrNull(Settings, Settings.AutoSantei.AllowSave)!;

        Log("╔══ NGUYÊN TRẠNG TRƯỚC LƯỢT CHẠY (chép lại nếu cần dựng tay) ══");
        Log($"║ SIGA: {_sigaBefore?.ToString() ?? "(KHÔNG có dòng nào)"}");
        Log($"║ bệnh nhân {PatNo}, 診療日 {TrtDate:yyyy-MM-dd}");
        Log("╚══════════════════════════════════════════════════════════════");
    }

    [SetUp]
    public void AutoSanteiSetUp()
    {
        _flow = new SigaToothFlow(App, Screen);
        _ops = new AutoSanteiOps(_flow);
    }

    [OneTimeTearDown]
    public void AutoSanteiOneTimeTearDown()
    {
        if (_siga is null || !_siga.CanWrite || _sigaBefore is null) return;
        try
        {
            _siga.EnsureSigaRow(PatNo);
            _siga.RestoreSiga(PatNo, _sigaBefore);
            Log("dọn: SIGA trả về nguyên trạng.");
        }
        catch (Exception e)
        {
            Log($"dọn HỎNG: {e.Message} — dựng tay theo khối 「NGUYÊN TRẠNG」 ở trên.");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcAUTO1 (mốc) — chỉ hỏi DB, không đụng giao diện
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TcAUTO1 (mốc) — chkauto có dòng cho mã đem thử, và master của tháng có đủ mã đi kèm")]
    public void TcAUTO1_ChkAuto_Row_And_Master_Exist()
    {
        Log($"chkauto: {_chk.CountRows()} dòng, {_chk.CountRowsWithSecondCode()} dòng có từ 2 mã đi kèm.");

        var row = _chk.ReadChkAuto(TrtCd, TrtSb);
        Assert.That(row, Is.Not.Null,
            $"Bảng chkauto KHÔNG có dòng ({TrtCd},{TrtSb}). Đây là điều kiện CẦN của cả luồng: " +
            "Chk_ChkAuto trả về ngay khi getChkAutoData = null (modMain.cs:841-844), nên không có " +
            "dòng này thì TcAUTO2 chẳng đo được gì. ⇒ HARNESS/DATA hỏng, không phải app thiếu " +
            "chức năng — đổi autoSantei.trtCd/trtSb sang một mã CÓ trong bảng.");

        Log($"  {row}");
        Assert.That(row!.TreatmentPairs, Is.Not.Empty,
            $"{row} không có ô nào rơi vào nhánh 処置 (điều kiện cd > 100 và ngoài dải 摘要 " +
            $"{ChkAutoRow.ReceiptCodeMin}..{ChkAutoRow.ReceiptCodeMax} — modMain.cs:862/:914). " +
            "Mã này chỉ tự chèn コメント, không đo được lệch điểm số.");

        var table = _siga.ActiveTrtTable(TrtDate);
        Log($"master áp dụng cho {TrtDate:yyyy-MM-dd} = {table}");

        var typed = _siga.FindMasterRow(TrtDate, TrtCd, TrtSb);
        Assert.That(typed, Is.Not.Null,
            $"{table} không có {TrtCd}/{TrtSb} — không gõ được mã thì không có gì để đo.");
        Log($"  mã gõ vào : {typed}");

        Assert.Multiple(() =>
        {
            foreach (var (cd, sb) in row.TreatmentPairs)
            {
                var master = _siga.FindMasterRow(TrtDate, cd, sb);
                Log($"  mã đi kèm : {master?.ToString() ?? $"{cd}/{sb} KHÔNG có trong {table}"}");
                Assert.That(master, Is.Not.Null,
                    $"{table} không có mã đi kèm {cd}/{sb}. Chk_ChkAuto tra chính bảng này " +
                    "(modMain.cs:942-948) và bỏ qua khi không thấy — thiếu nó thì TcAUTO2 đỏ vì " +
                    "DỮ LIỆU, không phải vì app.");
            }
        });

        var control = _chk.ReadChkAuto(ControlCd, ControlSb);
        Assert.That(control, Is.Null,
            $"Mã ĐỐI CHỨNG {ControlCd}/{ControlSb} lại CÓ trong chkauto ({control}) — nó không còn " +
            "đối chứng được nữa. Đổi autoSantei.controlTrtCd sang một mã KHÔNG có trong bảng.");
        Log($"đối chứng {ControlCd}/{ControlSb}: không có trong chkauto ✔");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcAUTO2 (lệch chính) — 抜歯 179/2 phải kéo theo 310/2
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TcAUTO2 — nhập 179/2 抜歯 ⇒ WinForm TỰ CHÈN mã đi kèm của chkauto và cộng điểm nó vào 月計")]
    public void TcAUTO2_Entering_Code_Auto_Inserts_Companion()
    {
        using var trace = TestTrace.Begin();

        var chkRow = _chk.ReadChkAuto(TrtCd, TrtSb);
        Assert.That(chkRow, Is.Not.Null, "TcAUTO1 phải xanh trước — chkauto không có dòng cho mã đem thử.");
        Log($"{chkRow}");

        var measure = _ops.EnterAndMeasure(TrtCd, TrtSb, BuiSlot, trace, DisCd);
        Assert.That(measure, Is.Not.Null,
            "Không dựng được dòng để gõ mã (Insert / 部位選択 hỏng) ⇒ HARNESS hỏng, sửa trước. " +
            "Đọc _trace.log và ảnh chụp bước cuối trong artifacts\\screenshots.");

        Assert.That(measure!.Enter.PickerOpened, Is.True,
            $"Gõ 「{TrtCd}」 ở コードモード phải mở 処置選択. {measure.Enter}");
        Assert.That(measure.Enter.Committed, Is.True,
            $"Không chốt được 枝番 {TrtSb} trong 処置選択. {measure.Enter}");

        Log($"đo được: {measure}");
        foreach (var r in measure.AddedRows) Log($"  + {r}");

        var typedMaster = _siga.FindMasterRow(TrtDate, TrtCd, TrtSb)!;
        var typedRow = AutoSanteiOps.RowOf(measure.AddedRows, typedMaster);
        Assert.That(typedRow, Is.Not.Null,
            $"Chính dòng vừa gõ ({typedMaster}) cũng không có trên lưới ⇒ HARNESS hỏng, đừng đọc " +
            "tiếp phần 自動算定. Các dòng thêm được: [" +
            string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");

        // ── Đây là chỗ lệch ──────────────────────────────────────────────────
        Assert.Multiple(() =>
        {
            foreach (var (cd, sb) in chkRow!.TreatmentPairs)
            {
                var master = _siga.FindMasterRow(TrtDate, cd, sb)!;
                var auto = AutoSanteiOps.RowOf(measure.AddedRows, master);

                Assert.That(auto, Is.Not.Null,
                    $"⛔ LỆCH: nhập {TrtCd}/{TrtSb} xong, WinForm phải TỰ CHÈN mã đi kèm {cd}/{sb} " +
                    $"「{master.CctNm}」 — chkauto({TrtCd},{TrtSb}).cd = {cd}, và ModMain.Chk_ChkAuto " +
                    "chèn nó qua frm203016_Hide_Let_Trt_Data (modMain.cs:812-1010), được gọi ngay " +
                    "sau khi Enter ô 回 (frm203002.cs:5752).\n" +
                    "Các dòng thêm được: [" + string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]\n" +
                    "ĐỎ Ở ĐÂY nghĩa là gì: (a) nếu chạy trên WinForm THẬT thì gần như chắc chắn " +
                    "診療チェック đã loại mã đi kèm (modMain.cs:936-940 `blCalcPossible == false`) — " +
                    "kiểm xem tháng test đã có sẵn mã đó chưa; (b) nếu chạy trên bản đã port thì " +
                    "đúng là cả nhánh 自動算定 chưa được gọi lúc nhập.");

                if (auto is null) continue;

                Assert.That(Txt.Int(auto.Ten), Is.EqualTo(master.Score1),
                    $"Dòng tự chèn {cd}/{sb} 「{auto.Ryo}」 phải mang {master.Score1} 点 — score1 của " +
                    $"{master.Table}. Đang là 「{auto.Ten}」. Lệch ở đây KHÔNG phải lệch 自動算定 mà là " +
                    "lệch getTensu (CommonChk.getTensu chọn score1/2/3 theo acc_unit + f1 + ngày): " +
                    "ngày test có phải ngày 訪問診療 không?");
            }
        });

        // ── Mốc NGOÀI lưới (F12): 月計点数 phải cộng đúng điểm của mọi dòng vừa thêm ──
        Assert.That(measure.PointDelta, Is.Not.Null,
            "Không đọc được nhãn lbAllPoint (月計点数) ⇒ HARNESS hỏng — kiểm locators.regiAllPoint.");
        Assert.That(measure.PointDelta, Is.EqualTo(measure.AddedPointSum),
            $"月計点数 tăng {measure.PointDelta} nhưng tổng 点×回 của các dòng vừa thêm là " +
            $"{measure.AddedPointSum}. Hai số này do modAcc.Calc_MDPoint tính từ CÙNG một tập dòng " +
            "(frm203002.cs:5768-5772), lệch nhau nghĩa là có dòng được chèn mà KHÔNG vào 月計 — " +
            "hoặc ngược lại. Các dòng thêm được: [" +
            string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");

        var companionPoints = chkRow!.TreatmentPairs
            .Select(p => _siga.FindMasterRow(TrtDate, p.Cd, p.Sb)?.Score1 ?? 0).Sum();
        Assert.That(measure.PointDelta, Is.EqualTo(typedMaster.Score1 + companionPoints),
            $"月計点数 phải tăng {typedMaster.Score1} (mã gõ vào) + {companionPoints} (mã tự chèn) = " +
            $"{typedMaster.Score1 + companionPoints}, đang tăng {measure.PointDelta}. Đúng bằng số " +
            "điểm mà bản web đang thiếu ở ảnh so sánh 443 / 432.");

        _ops.DeleteAdded(measure, trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TcAUTO3 (đối chứng) — mã KHÔNG có trong chkauto
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TcAUTO3 (đối chứng) — mã KHÔNG có trong chkauto thì lưới chỉ dài thêm ĐÚNG dòng vừa gõ")]
    public void TcAUTO3_Code_Without_ChkAuto_Row_Inserts_Nothing_Extra()
    {
        using var trace = TestTrace.Begin();

        Assert.That(_chk.ReadChkAuto(ControlCd, ControlSb), Is.Null,
            $"{ControlCd}/{ControlSb} có trong chkauto ⇒ không đối chứng được. Xem TcAUTO1.");

        var measure = _ops.EnterAndMeasure(ControlCd, ControlSb, BuiSlot, trace, DisCd);
        Assert.That(measure, Is.Not.Null, "Không dựng được dòng để gõ mã ⇒ HARNESS hỏng, sửa trước.");
        Assert.That(measure!.Enter.Committed, Is.True,
            $"Không chốt được 枝番 {ControlSb} của mã đối chứng. {measure.Enter}");

        Log($"đo được: {measure}");
        foreach (var r in measure.AddedRows) Log($"  + {r}");

        var master = _siga.FindMasterRow(TrtDate, ControlCd, ControlSb)!;
        var typedRow = AutoSanteiOps.RowOf(measure.AddedRows, master);
        Assert.That(typedRow, Is.Not.Null, $"Không thấy chính dòng vừa gõ ({master}) ⇒ HARNESS hỏng.");

        // Không dùng 「đúng 1 dòng」: Chk_CmtAuto (bảng CMTAUTO — đường ĐÃ port) cũng chèn
        // được một dòng コメント 0 点 cho mã này, và đó không phải thứ đang đo. Mốc đúng là
        // ĐIỂM SỐ: không có 自動算定 thì 月計 chỉ được tăng đúng điểm của mã vừa gõ.
        Assert.That(measure.PointDelta, Is.EqualTo(master.Score1),
            $"Mã {ControlCd}/{ControlSb} KHÔNG có dòng chkauto nên 月計点数 chỉ được tăng đúng " +
            $"{master.Score1} 点 của chính nó, đang tăng {measure.PointDelta}. Tăng nhiều hơn nghĩa " +
            "là có một đường khác cũng đang tự chèn 処置 (Chk_ChkAuto_soutyaku? 診療チェック của " +
            "màn hình?) — và khi đó TcAUTO2 không còn quy được cho chkauto nữa. " +
            "Các dòng thêm được: [" +
            string.Join(" / ", measure.AddedRows.Select(r => r.ToString())) + "]");

        _ops.DeleteAdded(measure, trace);
    }
}
