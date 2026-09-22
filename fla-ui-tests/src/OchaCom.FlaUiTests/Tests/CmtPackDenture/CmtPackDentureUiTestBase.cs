using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.CmtPackExitFlg;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.CmtPackDenture;

/// <summary>
/// Nền chung cho các fixture UI của luồng 歯管-有床義歯 (pack <c>B000-4-1</c>).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// PHÉP ĐO: HAI MỐC ĐỘC LẬP, PHẢI ĐỒNG Ý
/// ═══════════════════════════════════════════════════════════════════════════════
/// Trên DB mà <c>MENU.exe</c> thật sự đọc (cổng <b>1434</b>, xem README §1), pack có
/// <b>2 候補</b> nên <c>frm203018</c> <b>ĐỨNG LẠI</b> chờ chọn:
/// <list type="number">
///   <item><see cref="DentureMeasure.PackAsked"/> — frm203018 bung ra và mang dòng
///     「有床義歯に係る口腔管理のみ」;</item>
///   <item><see cref="DentureMeasure.CommentLanded"/> — sau khi chọn 番号 1, dòng comment
///     rơi xuống lưới (<c>点 = 0</c>).</item>
/// </list>
/// Lệch nhau ⇒ <see cref="DentureMeasure.MocLechNhau"/> bật và phải đọc ảnh trước khi kết luận.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// 病名 ĐƯỢC SEED, KHÔNG ĐI QUA 病名選択 — VÀ VÌ SAO
/// ═══════════════════════════════════════════════════════════════════════════════
/// Nhánh 歯管-有床義歯 đọc <c>dis_cd[]</c> của <b>dòng đang đứng</b>
/// (frm203002.cs:9900-9906 → CmtAuto.cs:196), mà mảng đó do <c>ModMain.AutoBui</c> chép
/// xuống từ <b>đúng một dòng ngay trên</b> lúc nhập (modMain.cs:139-156).
///
/// <para>Trong <c>TRNTRN</c> <b>không có dòng 部位病名行 riêng</b>: 部位/病名 nằm trên chính
/// từng dòng 処置. Nên chỉ cần seed một 処置 vô hại (<c>211/0</c>, không kích hoạt pack nào)
/// mang sẵn 病名 + 部位, rồi gõ 歯管 vào dòng NGAY DƯỚI nó — <c>AutoBui</c> chép y như khi
/// người dùng tự đặt 病名.</para>
///
/// <para>🔥 <b>Đi qua 病名選択 thì KHÔNG đo được</b> — đã trả giá 5 lượt chạy 2026-09-21:
/// chọn xong 病名, app chuyển panel phải sang tab 「ガイド」 và cướp tiêu điểm bàn phím vào ô
/// 選択番号 của tab ấy (<c>txtGuid1Sel</c>). Click vào ô 点 của lưới KHÔNG giành lại được,
/// nên 「gõ 116 → Enter」 rơi vào ô đó, và Enter = chọn dòng ガイド số 116 ⇒ app mở
/// 「ガイド処置選択」 (frm203002.cs:6543 — chỗ DUY NHẤT mở ID203017). Log chỉ nói 「処置選択
/// KHÔNG mở」, tức đổ oan cho app. Chuyển tab sang 病検 cũng không cứu được. Ảnh:
/// <c>11x_khong-mo-duoc-処置選択.png</c>, góc dưới phải 「選択 No. [116]」.</para>
///
/// <para><b>F21 không cấm cái này.</b> Dòng seed là <b>trạng thái xuất phát</b>. Thứ đang đo
/// — <c>Chk_CmtAuto</c> → <c>prgCmtAuto</c> — vẫn chạy trọn đường giao diện: gõ mã →
/// 処置選択 → Enter ô 回; và <c>AutoBui</c> vẫn chạy thật lúc nhập.</para>
///
/// <para>Vế 現存歯 (<c>getPlaqueTeeth</c>) đọc <c>ModSave.trtDataList</c>, nạp MỘT LẦN lúc mở
/// 診療入力 từ 1900-01-01 (frm203004.cs:855) ⇒ cũng phải seed TRƯỚC KHI APP MỞ (F20).</para>
/// </summary>
public abstract class CmtPackDentureUiTestBase : UiTestBase
{
    protected DentureSeedDb? Seeder { get; private set; }
    protected CmtPackDb? Master { get; private set; }
    protected SigaToothFlow Flow { get; private set; } = null!;
    protected CmtPackCascade Cascade { get; private set; } = null!;

    /// <summary>Ô 部位 ca đo dùng — chọn ở <see cref="PrepareDataBeforeApp"/>, tránh răng 欠損.</summary>
    protected int BuiSlot { get; private set; } = 1;

    /// <summary>Các ô SIGA đánh 欠損 của bệnh nhân — đọc trước khi app mở.</summary>
    protected IReadOnlyList<int> MissingSlots { get; private set; } = [];

    /// <summary>
    /// Fixture này cần bệnh nhân <b>CÒN 現存歯</b> (true) hay <b>CHƯA TỪNG có 歯周病検査</b>
    /// (false).
    ///
    /// <para>⚠️ Tiền đề này <b>KHÔNG seed</b> — nó là thuộc tính của BỆNH NHÂN, kiểm bằng dữ
    /// liệu thật và <c>Ignore</c> nếu không thoả. Đã thử seed và <b>thất bại hai lần</b>
    /// (2026-09-21): dòng 歯周病検査 seed lên lưới với ô 部位 RỖNG, nên
    /// <c>getTreatDataTeethDis</c> dựng mảng <c>bui</c> toàn 0 và 現存歯 không bao giờ được
    /// phát hiện. Dùng bệnh nhân có sẵn là bỏ được cả lớp bất định đó.</para>
    /// </summary>
    protected abstract bool RequiresExistingTeeth { get; }

    /// <summary>
    /// Các <c>dis_cd</c> mà fixture cần — mỗi mã một DÒNG MANG 病名 được seed sẵn ở ngày test.
    ///
    /// <para>Seed <b>tất cả</b> ngay từ <c>OneTimeSetUp</c> vì <c>trtDataList</c> chỉ nạp một
    /// lần lúc mở màn; không seed thêm được giữa chừng.</para>
    /// </summary>
    protected abstract IReadOnlyList<int> CarrierDiseases { get; }

    /// <summary>Nhãn ghi vào <c>DSP_TRT</c> của dòng mang 病名, để ca đo tìm lại trên lưới.</summary>
    protected static string CarrierTag(int disCd) => $"TESTDIS{disCd}";

    /// <summary>Nhãn của dòng XEN GIỮA (không mang 病名) dùng cho §C4.</summary>
    public const string GapTag = "TESTGAP";

    protected int TrtCd => Settings.CmtPackDenture.TrtCd;
    protected int TrtSb => Settings.CmtPackDenture.TrtSb;

    protected static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>Ca này ĐANG ĐO chuỗi hộp thoại — không để watcher trả lời hộ (F19).</summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason() =>
        Settings.CmtPackDenture.AllowSeed
            ? null
            : "Fixture này cần seed DÒNG MANG 病名 (và có ca cần cả 歯周病検査) vào TRNTRN, " +
              "dải disp_no 9200..9299 — bật cmtPackDenture.allowSeed = true trong " +
              "testsettings.local.json. Không seed được thì dòng 歯管 không có 病名 nào, và " +
              "mọi ca về 欠損病名 sẽ đo ra kết quả của 「không có 病名」 mà vẫn xanh.";

    protected override void PrepareDataBeforeApp()
    {
        Seeder = DentureSeedDb.CreateOrNull(Settings);
        if (Seeder is null) Assert.Ignore("Cần db.enabled = true + connectionString để seed.");
        if (Seeder!.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} " +
                          "(container ochacom_sql2022 — CỔNG 1434 — trên máy Mac còn chạy không?)");

        var day = Settings.Patient.ResolvedTrtDate;

        // ── ① chụp nguyên trạng, IN RA, TRƯỚC khi đụng vào (F20) ────────────
        Log($"=== NGUYÊN TRẠNG TRNTRN của bệnh nhân {PatNo}, tháng {day:yyyy-MM} " +
            "(chụp TRƯỚC khi seed) ===");
        foreach (var r in Seeder.MonthRows(PatNo, day)) Log("   " + r);

        MissingSlots = Seeder.MissingTeethSlots(PatNo);
        BuiSlot = Enumerable.Range(1, 32).First(s => !MissingSlots.Contains(s));
        Log($"SIGA đánh 欠損 ở ô [{string.Join(",", MissingSlots)}] ⇒ ca đo dùng 部位 ô {BuiSlot}.");
        Log($"歯周病検査 đủ tư cách sẵn có (ngoài dải seed): {Seeder.QualifyingPlaqueRows(PatNo)} dòng.");

        // ── TIỀN ĐỀ 現存歯 — kiểm trên DỮ LIỆU THẬT, không seed ────────────
        var plaque = Seeder.QualifyingPlaqueRows(PatNo);
        var living = Seeder.LivingTeethSlots(PatNo);
        Log($"歯周病検査 đủ tư cách: {plaque} dòng · răng chưa 欠損: {living.Count}/32 " +
            $"[{string.Join(",", living)}]");

        if (RequiresExistingTeeth)
        {
            if (plaque == 0 || living.Count == 0)
                Assert.Ignore(
                    $"Fixture này cần bệnh nhân CÒN 現存歯, nhưng bệnh nhân {PatNo} có " +
                    $"{plaque} dòng 歯周病検査 đủ tư cách và {living.Count} răng chưa 欠損. " +
                    "getPlaqueTeeth sẽ trả null (hoặc bui toàn 0) ⇒ nhánh 現存歯 không chạy, " +
                    "và mọi ca đều ra HIỆN — tức đo ra kết quả của §C3 chứ không phải §C1/§C2. " +
                    "Đổi patient.patNo sang bệnh nhân có sẵn 歯周病検査 mang 病名 Ｐ/単Ｇ.");
        }
        else
        {
            if (plaque > 0)
                Assert.Ignore(
                    $"Fixture này cần bệnh nhân CHƯA TỪNG có 歯周病検査, nhưng bệnh nhân {PatNo} " +
                    $"có {plaque} dòng đủ tư cách ⇒ đo ra kết quả của §C1/§C2 chứ không phải §C3.");
        }

        var leftover = Seeder.CountSeeded(PatNo);
        if (leftover > 0)
        {
            Log($"⚠️ còn {leftover} dòng SÓT trong dải seed từ lượt trước — dọn trước khi seed mới.");
            Seeder.DeleteSeeded(PatNo);
        }

        // ── ② seed, TRƯỚC KHI APP MỞ ────────────────────────────────────────
        Log("=== SEED ===");


        var templates = Seeder.BuiTemplateRows(PatNo);
        Log($"dòng mẫu có DSP_BUI khác rỗng: {templates}");
        Assert.That(templates, Is.GreaterThan(0),
            $"Bệnh nhân {PatNo} không có dòng THẬT nào mang DSP_BUI khác rỗng để làm mẫu ⇒ " +
            "không seed được 部位 lên lưới, AutoBui sẽ chép số 0 và mọi ca đo rơi về nhánh " +
            "「không có 病名」. Đổi sang bệnh nhân khác.");

        foreach (var disCd in CarrierDiseases)
        {
            var d = Seeder.Disease(disCd, day);
            var disp = Seeder.SeedCarrierRow(PatNo, day, disCd, d?.DisNm ?? "", CarrierTag(disCd));
            Log($"   + disp {disp} · DÒNG MANG 病名 「{CarrierTag(disCd)}」 · {d}");

            // §C4: chèn MỘT dòng KHÔNG mang 病名 ngay sau dòng mang 病名. Dòng 歯管 sẽ nằm
            // dưới dòng này, nên AutoBui (chép từ ĐÚNG một dòng ngay trên) sẽ chép số 0.
            if (Settings.CmtPackDenture.GapRow)
            {
                var gap = Seeder.SeedCarrierRow(PatNo, day, 0, "", GapTag);
                Log($"   + disp {gap} · DÒNG XEN GIỮA 「{GapTag}」 (KHÔNG 病名) — §C4");
            }
        }

        // Dòng chốt đuôi: ca đo chèn dòng trống TẠI vị trí của dòng NGAY SAU dòng mang 病名,
        // nên dòng mang 病名 cuối cùng cũng phải có một dòng đứng sau nó.
        var tail = Seeder.SeedCarrierRow(PatNo, day, 0, "", "TESTTAIL");
        Log($"   + disp {tail} · dòng chốt đuôi 「TESTTAIL」 (không 病名) — chỗ để Insert dòng cuối.");
    }

    [OneTimeTearDown]
    public void DentureSeedTearDown()
    {
        if (Seeder is null) return;
        try
        {
            var deleted = Seeder.DeleteSeeded(PatNo);
            var left = Seeder.CountSeeded(PatNo);
            Log($"=== DỌN === xoá {deleted} dòng seed; còn lại trong dải " +
                $"{DentureSeedDb.SeedDispBase}..{DentureSeedDb.SeedDispMax}: {left}");
            if (left > 0)
                Log($"⛔ CÒN SÓT {left} dòng — dọn tay: " +
                    $"DELETE FROM TRNTRN WHERE PAT_NO = {PatNo} AND DISP_NO BETWEEN " +
                    $"{DentureSeedDb.SeedDispBase} AND {DentureSeedDb.SeedDispMax}");
            Log("(dòng 再初診 disp_no = 9001 và vùng 9100..9199 của CmtPackExitFlg KHÔNG nằm " +
                "trong dải seed nên không bị đụng tới.)");
        }
        catch (Exception e)
        {
            Log($"⛔ DỌN HỎNG: {e.Message} — dọn tay theo câu DELETE ở trên TRƯỚC khi chạy lượt sau.");
        }
    }

    [SetUp]
    public void DentureUiSetUp()
    {
        Master ??= CmtPackDb.CreateOrNull(Settings);
        Flow = new SigaToothFlow(App, Screen);
        Cascade = new CmtPackCascade(App, Flow);
    }

    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>Kết quả một lượt đo.</summary>
    protected sealed record DentureMeasure(int DisCd, CmtPackCascade.CascadeMeasure Cascade)
    {
        /// <summary>frm203018 có bung ra và mang dòng 「有床義歯に係る口腔管理のみ」 không.</summary>
        public bool PackAsked =>
            Cascade.AnyDialogMentions(CmtPackDentureMasterTests.PackCommentText);

        /// <summary>Sau khi chọn 番号 1, dòng comment có rơi xuống lưới không.</summary>
        public bool CommentLanded =>
            Cascade.CountComments(CmtPackDentureMasterTests.PackCommentText) > 0;

        /// <summary>Pack có HIỆN không — hai mốc độc lập, phải đồng ý.</summary>
        public bool PackShown => PackAsked || CommentLanded;

        /// <summary>Hai mốc KHÔNG đồng ý — lượt chạy đáng ngờ, đừng kết luận vội.</summary>
        public bool MocLechNhau => PackAsked != CommentLanded;

        public override string ToString() =>
            $"病名 {DisCd} · pack {(PackShown ? "HIỆN" : "ẨN")} " +
            $"(hộp thoại hỏi = {PackAsked}, comment rơi xuống lưới = {CommentLanded}" +
            $"{(MocLechNhau ? " ⚠️ HAI MỐC LỆCH NHAU" : "")}) · {Cascade}";
    }

    /// <summary>
    /// Một lượt đo trọn vẹn: chèn dòng trống NGAY DƯỚI dòng mang <paramref name="disCd"/>,
    /// gõ 歯管 vào đó, rồi ghi lại pack có xuất comment không.
    /// </summary>
    protected DentureMeasure MeasureDenture(int disCd, TestTrace trace)
    {
        Assert.That(CarrierDiseases, Does.Contain(disCd),
            $"Ca đo hỏi 病名 {disCd} nhưng fixture không seed dòng mang nó " +
            $"(CarrierDiseases = [{string.Join(",", CarrierDiseases)}]) ⇒ lỗi HARNESS.");

        // §C4: khi có dòng xen giữa, MỐC để chèn là dòng XEN GIỮA — dòng 歯管 phải nằm
        // ngay dưới NÓ, để AutoBui chép từ nó (dis_cd = 0) chứ không từ dòng mang 病名.
        var gap = Settings.CmtPackDenture.GapRow;
        var tag = gap ? GapTag : CarrierTag(disCd);
        var rows = Flow.Grid.Snapshot(200).ToList();
        var idx = rows.FindLastIndex(r => Txt.Has(r.Ryo, tag));

        Assert.That(idx, Is.GreaterThanOrEqualTo(0),
            $"Không thấy DÒNG MANG 病名 「{tag}」 trên lưới ⇒ seed không tới được app.\n" +
            "  Kiểm theo thứ tự: (1) seed có chạy TRƯỚC khi app mở không — trtDataList nạp một " +
            "lần ở frm203004.cs:855; (2) app có đang đọc ĐÚNG DB không (cổng 1434, xem " +
            "C:\\NEW_SIM2000\\Ocha.xml) — bộ test và app từng trỏ hai instance khác nhau.\n" +
            "  Lưới:\n  " + string.Join("\n  ", Flow.DescribeGrid(200)));

        Assert.That(idx + 1, Is.LessThan(rows.Count),
            $"Dòng mang 病名 「{tag}」 là dòng CUỐI lưới — không có chỗ để chèn dòng trống DƯỚI " +
            "nó. Dòng chốt đuôi 「TESTTAIL」 đáng lẽ phải đứng sau mọi dòng mang 病名.");

        var carrier = rows[idx];
        var after = rows[idx + 1];
        trace.Note($"dong mang 病名 {disCd}: 「{carrier}」");
        trace.Note($"dong dung ngay sau no: 「{after}」");

        // In nguyên khối quanh dòng mang 病名 — để lượt đỏ sau này đọc được ngay 部位病名行
        // có tồn tại không, thay vì phải chạy lại.
        trace.Note("luoi quanh dong mang 病名:");
        for (var i = Math.Max(0, idx - 3); i < Math.Min(rows.Count, idx + 3); i++)
            trace.Note($"    [{i}] {rows[i]}");

        // ── TIỀN ĐỀ: 病名 phải THẬT SỰ lên tới lưới ─────────────────────────
        //
        // 🔥 Không có hàng rào này thì luồng cho XANH SAI. Đo được 2026-09-21: bản seed đầu
        // đặt BUI<n> = 1 nhưng DSP_BUI = '' ⇒ app không vẽ 部位病名行 nào, hFG1[8..49] về 0,
        // AutoBui chép số 0, và MỌI ca rơi về nhánh 「không có 病名」. Khi đó:
        //     · TCD_20 (Ｃ + 現存歯)  → ẨN  ✔ xanh — nhưng vì LÝ DO SAI
        //     · TCD_21 (MT + 現存歯) → ẨN  ✘ đỏ
        // tức ca đối chứng KHÔNG phát hiện được, vì 「không có 病名」 và 「有 Ｃ」 cho cùng
        // kết quả. Chỉ có mốc dưới đây phân biệt được hai thứ đó.
        var disNm = Seeder?.Disease(disCd, TrtDate)?.DisNm ?? "";
        if (!gap && disCd > 0 && disNm.Length > 0)
        {
            var buiLineAbove = rows.Take(idx).Reverse()
                .TakeWhile(r => Txt.N(r.Ten) is "-" or "－" || Txt.Has(r.Ryo, "TESTDIS"))
                .Any(r => Txt.Has(r.Ryo, disNm));

            Assert.That(buiLineAbove, Is.True,
                $"KHÔNG thấy 部位病名行 mang 病名 「{disNm}」 ngay trên dòng 「{tag}」 ⇒ 部位/病名 " +
                "của dòng seed KHÔNG lên được lưới.\n" +
                "  Khi đó hFG1[8..49] của nó về 0, ModMain.AutoBui chép số 0 xuống dòng 歯管, và " +
                "cả ca đo trở thành ca 「không có 病名」 — mà kết quả của ca đó TRÙNG với kết quả " +
                "mong đợi của một số ca, nên sẽ có ca XANH SAI.\n" +
                "  Nguyên nhân đã gặp: seed đặt BUI<n> nhưng để DSP_BUI rỗng. DentureSeedDb." +
                "SeedCarrierRow phải CLONE DSP_BUI + BUI* từ một dòng THẬT của bệnh nhân.\n" +
                "  Lưới quanh dòng seed:\n    " +
                string.Join("\n    ", rows.Skip(Math.Max(0, idx - 4)).Take(8).Select(r => r.ToString())));
        }

        Assert.That(Flow.EnsureCodeMode(), Is.True,
            $"Không đưa được ô 点 về コードモード — đang là 「{Flow.InpMode()}」. Gõ mã khi đang " +
            "ở 点数モード thì app hiểu con số là SỐ ĐIỂM ⇒ HARNESS hỏng, KHÔNG phải app.");

        // InsertBlankRow chèn TẠI vị trí dòng mốc và đẩy dòng đó xuống ⇒ chèn tại `after` thì
        // dòng trống nằm ĐÚNG giữa carrier và after, tức ngay dưới dòng mang 病名 (AutoBui
        // chỉ chép từ ĐÚNG một dòng ngay trên, modMain.cs:139-156).
        // ── chèn HAI dòng trống, KHÔNG phải một ────────────────────────────
        //
        // 🔥 Đo được 2026-09-22. `ModMain.Chk_CmtAuto` → `prgCmtAuto` đọc `dis_cd[]` từ
        // `hFG1[i+40, CurrentCellAddress.Y]` (frm203002.cs:9900-9906) — tức **vị trí con trỏ
        // SAU khi nhập**, mà Enter ở ô 回 đã dời con trỏ xuống DÒNG KẾ.
        //
        // Với người dùng thật điều đó vô hại: dòng kế là dòng TRỐNG mới, và `ModMain.AutoBui`
        // vừa chép cùng 部位/病名 xuống đó, nên đọc dòng nào cũng ra cùng 病名. Nhưng nếu dòng
        // kế ĐÃ CÓ nội dung thì AutoBui KHÔNG chép (nó chỉ chép khi dòng trống hoàn toàn ở
        // cột 8..49, modMain.cs:139-156) ⇒ `dis_cd` về 0 ⇒ MỌI ca rơi về nhánh 「không có
        // 病名」 và cho ra ẨN.
        //
        // Ba số đo sai trước đó đều giải thích được bằng đúng câu này:
        //     nhiều carrier, dòng kế mang 病名 KHÁC  → đo nhầm sang 病名 đó
        //     một carrier,  dòng kế là 「TESTTAIL」   → đo ra 「không có 病名」
        //
        // ⇒ Phải có MỘT DÒNG TRỐNG nữa ngay dưới dòng 歯管, để AutoBui chép 病名 xuống đó.
        var inserted = Flow.InsertBlankRow(after, trace);
        Assert.That(inserted, Is.Not.Null,
            $"Insert không chèn được dòng trống tại 「{after}」 ⇒ HARNESS hỏng.\n" +
            "  Nguyên nhân hay gặp: dòng mốc thuộc THÁNG QUÁ KHỨ (過去データ hiển thị inline) — " +
            "những dòng đó mang linekbn = 99 và AddRow từ chối.");

        var inserted2 = Flow.InsertBlankRow(after, trace);
        Assert.That(inserted2, Is.Not.Null,
            "Insert không chèn được dòng trống THỨ HAI ⇒ HARNESS hỏng. Thiếu nó thì con trỏ " +
            "sau Enter ô 回 rơi vào một dòng ĐÃ CÓ nội dung, AutoBui không chép 病名, và " +
            "prgCmtAuto đọc ra dis_cd = 0 — ca đo lặng lẽ đổi thành ca 「không có 病名」.");

        // Đọc lại từ bản chụp TƯƠI: RegiRow là ẢNH CHỤP, không phải con trỏ sống — dùng lại
        // record cũ sau khi lưới vẽ lại là click vào TOẠ ĐỘ CŨ (F10).
        var fresh = Flow.Grid.Snapshot(200).ToList();
        var cIdx = fresh.FindLastIndex(r => Txt.Has(r.Ryo, tag));
        Assert.That(cIdx, Is.GreaterThanOrEqualTo(0), $"Mất dấu dòng mang 病名 「{tag}」 sau Insert.");
        Assert.That(cIdx + 1, Is.LessThan(fresh.Count), "Không còn dòng nào sau dòng mang 病名.");

        var typeInto = fresh[cIdx + 1];
        Assert.That(SigaToothFlow.IsBlank(typeInto.Ryo), Is.True,
            $"Dòng ngay dưới 「{tag}」 KHÔNG trống — đang mang 「{typeInto.Ryo}」. Gõ vào đó là " +
            "GHI ĐÈ lên một 処置 thật, và AutoBui cũng sẽ không chép 病名 xuống.\n  Lưới:\n  " +
            string.Join("\n  ", Flow.DescribeGrid(200)));
        trace.Note($"dong se mang 歯管: 「{typeInto}」");

        // 番号 1 = 候補 「有床義歯に係る口腔管理のみ」 (MST_CMT_PACK_DETAIL.seq_no = 1).
        // Chọn nó thay vì huỷ, để lượt đo có ĐỦ CẢ HAI mốc.
        var m = Cascade.RunOnRow(typeInto, TrtCd, TrtSb, new CmtPackCascade.Plan(PickSeqNo: 1), trace);
        Assert.That(m, Is.Not.Null,
            $"Không gõ được {TrtCd}/{TrtSb} ⇒ HARNESS hỏng (đọc _trace.log và ảnh), KHÔNG phải " +
            "app thiếu chức năng.");

        Log($"— gõ {TrtCd}/{TrtSb} dưới 病名 {disCd}: {m}");
        Log("  chuỗi hộp thoại:");
        foreach (var d in m!.Dialogs) Log($"     {d}");
        Log("  dòng comment rơi xuống lưới:");
        foreach (var t in m.CommentTexts) Log($"     「{t}」");

        Assert.That(m.InsertedTreatmentRow, Is.True,
            $"Dòng {TrtCd}/{TrtSb} KHÔNG vào được lưới ⇒ TIỀN ĐỀ chưa thành, đừng đọc phần " +
            "comment.\n  Hộp thoại: " + string.Join(" | ", m.Dialogs));

        // ── TIỀN ĐỀ CUỐI: dòng 歯管 đã thừa kế ĐÚNG 病名 chưa ───────────────
        //
        // 🔥 Hàng rào QUAN TRỌNG NHẤT của luồng. Đo được 2026-09-22: ba ca đầu cho kết quả
        // khớp hoàn hảo với giả thuyết 「dòng 歯管 thừa kế 病名 của carrier KẾ TIẾP」:
        //     nhắm 100 Ｃ  → thực tế 393 (51) → HIỆN
        //     nhắm 393 MT  → thực tế 369 (53) → ẨN
        //     nhắm 369     → thực tế 302 (54) → ẨN
        // Tức source ĐÚNG, harness lệch một dòng — mà không mốc nào phát hiện được, vì cả ba
        // ca vẫn 「chạy trơn tru」 và cho ra số đo trông hợp lý.
        //
        // App gom các dòng cùng 部位/病名 dưới MỘT 部位病名行, nên 病名 mà dòng 歯管 thật sự
        // mang chính là 病名 của 部位病名行 gần nhất PHÍA TRÊN nó. Đọc lại từ bản chụp TƯƠI.
        if (disNm.Length > 0)
        {
            var after2 = Flow.Grid.Snapshot(200).ToList();
            var typedIdx = after2.FindLastIndex(r => Txt.Has(r.Ryo, "歯科疾患管理料"));
            if (typedIdx > 0)
            {
                var ownerIdx = -1;
                for (var i = typedIdx - 1; i >= 0; i--)
                    if (Txt.N(after2[i].Ten) is "-" or "－") { ownerIdx = i; break; }

                var owner = ownerIdx >= 0 ? after2[ownerIdx].Ryo : "(không thấy 部位病名行 nào)";
                trace.Note($"部位病名行 chi phoi dong 歯管 vua go: 「{owner}」 (mong doi 「{disNm}」)");

                if (gap)
                {
                    // §C4 — CỐ Ý: dòng 歯管 nằm dưới dòng XEN GIỮA (không 病名), nên nó phải
                    // KHÔNG thừa kế 病名 của dòng mang 病名 ở trên nữa.
                    Log($"=== KQ-C4 === dòng 歯管 nằm dưới 部位病名行 「{owner}」 " +
                        $"(dòng mang 病名 là 「{disNm}」, giữa chúng có 「{GapTag}」)");
                    Assert.That(Txt.Has(owner, disNm), Is.False,
                        $"§C4 — có dòng 「{GapTag}」 xen giữa mà dòng 歯管 VẪN nằm dưới 部位病名行 " +
                        $"「{owner}」 mang 病名 「{disNm}」 ⇒ nó vẫn thừa kế được 病名 từ dòng " +
                        "CÁCH MỘT DÒNG.\n" +
                        "  Theo ModMain.AutoBui (modMain.cs:139-156) nó chỉ chép từ ĐÚNG MỘT " +
                        "DÒNG NGAY TRÊN, mà dòng đó là 「" + GapTag + "」 (dis_cd = 0) ⇒ phải " +
                        "KHÔNG có 病名.\n" +
                        "  Đỏ ở đây ⇒ WinForm thật sự đi ngược lên dòng 部位病名 chi phối, tức " +
                        "GIỐNG cách vế web làm (governingBuiLineOf) — và §C4 không còn là rủi ro.");
                }
                else
                Assert.That(Txt.Has(owner, disNm), Is.True,
                    $"Dòng 歯管 vừa gõ nằm dưới 部位病名行 「{owner}」, KHÔNG phải 「{disNm}」 ⇒ " +
                    $"nó đã thừa kế NHẦM 病名 và số đo của ca này nói về 病名 KHÁC.\n" +
                    "  ⛔ Đây là lỗi HARNESS, không phải app: dòng trống bị chèn sai chỗ nên " +
                    "ModMain.AutoBui (modMain.cs:139-156) chép từ dòng khác. Kiểm lại vị trí " +
                    "Insert so với dòng mang 病名.\n" +
                    "  Lưới quanh dòng vừa gõ:\n    " +
                    string.Join("\n    ", after2.Skip(Math.Max(0, typedIdx - 4)).Take(7)
                                                 .Select(r => r.ToString())));
            }
        }

        // 「カルテ記載選択」 bung ra SAU cascade; để nguyên thì lượt sau vướng.
        DismissDialogsTitled(trace, "カルテ記載選択", "ガイド");

        var result = new DentureMeasure(disCd, m);
        Log($"=== KQ === {result}");
        if (result.MocLechNhau)
            Log("⚠️ HAI MỐC LỆCH NHAU (hộp thoại hỏi ≠ comment rơi xuống lưới) — đọc ảnh trong " +
                "artifacts\\screenshots\\ TRƯỚC khi kết luận.");
        return result;
    }

    /// <summary>
    /// Đóng mọi hộp thoại đang mở có tiêu đề chứa một trong <paramref name="fragments"/>,
    /// bằng nút <c>F10 戻る</c> (huỷ).
    ///
    /// <para>Chỉ dùng cho hộp thoại <b>không thuộc phép đo</b> — <c>ガイド処置選択</c>,
    /// <c>カルテ記載選択</c>. KHÔNG dùng cho <c>frm203018</c>: ở đó 「戻る」 = HUỶ lựa chọn,
    /// tức xoá mất chính cái đang đo.</para>
    /// </summary>
    protected void DismissDialogsTitled(TestTrace trace, params string[] fragments)
    {
        for (var round = 0; round < 4; round++)
        {
            var dlg = Flow.OpenDialogs()
                .FirstOrDefault(w => fragments.Any(f => Txt.Has(Txt.N(Uia.NameOf(w)), f)));
            if (dlg is null) return;

            var title = Txt.N(Uia.NameOf(dlg));
            var closed = Dialogs.ClickButtonContaining(dlg, "戻る", "F10");
            trace.Note($"dep hop thoai ngoai le 「{title}」 bang 戻る: {closed}");
            Thread.Sleep(900);
            if (!closed)
            {
                trace.Shot("khong-dep-duoc-hop-thoai-ngoai-le");
                return;
            }
        }
    }

    /// <summary>In master của 処置 kích hoạt ra log — để lượt đỏ sau này biết đang đo cái gì.</summary>
    protected void LogMaster()
    {
        if (Master is null) return;
        Log($"master: {TrtCd}/{TrtSb} ngày {TrtDate:yyyy-MM-dd} kích hoạt:");
        foreach (var p in Master.PacksFor(TrtCd, TrtSb, TrtDate))
        {
            Log($"   {p}");
            foreach (var d in Master.Details(p.PackCd, TrtDate)) Log($"        {d}");
        }
    }
}
