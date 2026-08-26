using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

/// <summary>
/// <b>Nhóm B — dis_flg = 3: app PHẢI hỏi, và câu trả lời phải rơi đúng ô.</b>
///
/// Đây là nửa WinForm của <c>auto-santei-high-needs-freewd.spec.ts</c> nhóm H/I —
/// nhưng đo trên nhánh <c>frm203016.IregCodChk</c> chứ không phải nhánh 自動算定.
/// Lý do ở mục 「VÌ SAO KHÔNG ĐO NHÁNH 自動算定」 dưới đây.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// PHẢI VÁ DB — và vá TRƯỚC KHI APP MỞ
/// ═══════════════════════════════════════════════════════════════════════════
/// Đo ngày 2026-08-26 trên chính SIM2000 mà máy test trỏ tới: <b>không có bệnh nhân
/// nào dis_flg = 3</b> (0: 16.322 bn · 1: 2 bn · 2: 14 bn · 3: 0 bn). Câu hỏi so BẰNG
/// 3 nên nhánh này không tự nhiên tới được. Cách xử lý lấy theo bộ Playwright:
/// vá tạm rồi trả lại (<c>TEST_ALLOW_DIS_FLG_PATCH</c>).
///
/// <para><b>Vá TRƯỚC khi app mở, không phải giữa chừng.</b>
/// <c>CommonInp.getCommonPatInfo</c> nạp <c>_patInfoList</c> ở màn CHỌN BỆNH NHÂN
/// (frm203001.cs:739); từ đó <c>getPatInfo()</c> chỉ đọc lại mảng trong RAM
/// (CommonInp.cs:160-172). UPDATE lúc frm203002 đã mở thì app không bao giờ thấy, và
/// testcase sẽ đỏ với thông điệp 「WinForm không hỏi」 — đổ oan cho app. Vì thế việc vá
/// nằm ở <see cref="PrepareDataBeforeApp"/>, chạy trước cả
/// <c>OchaApp.LaunchOrAttach</c>.</para>
///
/// <para>Và vá HẾT mọi 枝番: app đọc 枝番 còn hiệu lực tại 診療日
/// (<c>modPat.GetValidSubCode2</c>), vá trúng cái app không đọc là đỏ oan. Bên
/// Playwright đã dính đúng bẫy này.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG ĐO NHÁNH 自動算定
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>modSave.AutoSantei</c> chỉ có MỘT call site (frm203002.cs:5345) và cần bốn điều
/// kiện cùng đúng: Enter + con trỏ ở cột 0 + dòng CUỐI + ngày khác dòng trên
/// (:5241/:5260/:5288/:5296). Nhưng trước đó nó còn <b>thoát sớm với -2 khi ngày đang
/// xét đã có 処置行</b> (modSave.cs:2917-2951) — mà bệnh nhân test luôn có sẵn dòng ở
/// <c>patient.trtDate</c> (đó là lý do ngày đó được chọn). Probe Tc0 ngày 2026-08-26
/// xác nhận: kích bằng tay không ra câu hỏi nào.
///
/// <para>Dựng testcase cho nhánh không tới được chỉ đẻ ra một test đỏ vĩnh viễn — cùng
/// lập luận mà spec Playwright dùng để bỏ nhánh <c>kv.index == 0</c>. Muốn phủ nhánh
/// 自動算定 thì cần một bệnh nhân KHÔNG có 処置 trong ngày test và đã quá 1 tháng kể từ
/// 最終診療日; đó là một tiền đề khác, nên là một fixture khác.</para>
///
/// <para>Cái đang đo ở đây <b>không phải nhánh phụ</b>: cùng câu chữ, cùng ghi
/// <c>grdRegi[72]</c>, cùng chảy xuống <c>TRNTRN.FREEWD</c> qua <c>modSave.cs:2073</c>.
/// Khác duy nhất là chỗ châm ngòi.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐÂY LÀ BÊN ĐO ĐÁP ÁN
/// ═══════════════════════════════════════════════════════════════════════════
/// Mọi con số ở đây là hành vi CỦA WINFORM, đo trên máy thật. Bản port phải khớp
/// theo chiều này — testcase đỏ nghĩa là bản port lệch, KHÔNG phải testcase viết sai.
/// Bảng số hiệu TC tương ứng nằm ở README mục 4.
///
/// <para>Chạy: <c>.\run-high-needs-freewd.ps1 -AllowDisFlgPatch -Case Asked</c></para>
/// </summary>
[TestFixture]
[Category("high-needs-freewd")]
public sealed class HighNeedsAskedTests : UiTestBase
{
    /// <summary>枝番 mà <c>IregCodChk</c> BẪY cho mã 105 (frm203016.cs:1096).</summary>
    private static readonly int[] TokuTrapped = [0, 1, 2, 3, 6, 7];

    /// <summary>枝番 mà <c>IregCodChk</c> BẪY cho mã 508 (frm203016.cs:1109).</summary>
    private static readonly int[] HoumonTrapped = [0, 1, 6];

    private HighNeedsFlow _flow = null!;
    private HighNeedsDb? _hnDb;
    private IReadOnlyList<HighNeedsDb.InsuranceBranch>? _snapshot;
    private int _patchedPatNo = -1;

    protected override string[] NuisanceDialogPatterns => [];

    private int BorrowPatNo =>
        int.TryParse(Settings.HighNeeds.BorrowPatNo, out var n) ? n : PatNo;

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.HighNeeds.AllowDisFlgPatch)
            return "chưa bật highNeeds.allowDisFlgPatch. Dữ liệu KHÔNG có bệnh nhân " +
                   "dis_flg = 3 (đo 2026-08-26: chỉ 0/1/2) nên nhánh 困難者加算 chỉ tới được " +
                   "khi cho phép vá tạm insurance.dis_flg rồi trả lại. " +
                   "Chạy: .\\run-high-needs-freewd.ps1 -AllowDisFlgPatch";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString để vá và khôi phục insurance.dis_flg";

        return null;
    }

    /// <summary>Vá <c>dis_flg</c> = 3 TRƯỚC khi app mở — xem chú thích đầu lớp.</summary>
    protected override void PrepareDataBeforeApp()
    {
        _hnDb = HighNeedsDb.CreateOrNull(Settings);
        if (_hnDb is null) return;

        var patNo = BorrowPatNo;
        _snapshot = _hnDb.Branches(patNo);
        if (_snapshot.Count == 0)
        {
            TestContext.Out.WriteLine($"bệnh nhân {patNo} không có dòng INSURANCE nào — không vá.");
            _snapshot = null;
            return;
        }

        var changed = _hnDb.PatchDisFlg(patNo, HighNeedsDb.DisFlgHighNeeds);
        _patchedPatNo = patNo;
        TestContext.Out.WriteLine(
            $"VÁ dis_flg = 3 cho bệnh nhân {patNo}, {changed} dòng. " +
            $"Nguyên trạng sẽ trả lại: {string.Join(", ", _snapshot)}");
    }

    [OneTimeSetUp]
    public void AskedOneTimeSetUp() => _flow = new HighNeedsFlow(App, Screen);

    /// <summary>
    /// Trả <c>dis_flg</c> về nguyên trạng. Chạy kể cả khi fixture đỏ giữa chừng —
    /// để sót dis_flg = 3 trên DB dùng chung là làm hỏng mọi lượt chạy sau, và làm
    /// sai điểm của chính bệnh nhân đó nếu ai đó mở app thật.
    /// </summary>
    [OneTimeTearDown]
    public void RestoreDisFlg()
    {
        if (_hnDb is null || _snapshot is null || _patchedPatNo < 0) return;
        try
        {
            _hnDb.RestoreDisFlg(_patchedPatNo, _snapshot);
            var now = _hnDb.Branches(_patchedPatNo);
            TestContext.Out.WriteLine(
                $"ĐÃ TRẢ LẠI dis_flg cho bệnh nhân {_patchedPatNo}: {string.Join(", ", now)}");

            var stillPatched = now.Where(b => b.DisFlg == HighNeedsDb.DisFlgHighNeeds)
                                  .Select(b => b.PatBr).ToList();
            var expected = _snapshot.Where(b => b.DisFlg == HighNeedsDb.DisFlgHighNeeds)
                                    .Select(b => b.PatBr).ToList();
            if (stillPatched.Except(expected).Any())
                TestContext.Error.WriteLine(
                    $"!! CHƯA TRẢ HẾT: 枝番 {string.Join(",", stillPatched.Except(expected))} " +
                    "vẫn đang dis_flg = 3. SỬA TAY NGAY.");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG TRẢ LẠI ĐƯỢC dis_flg cho bệnh nhân {_patchedPatNo}: {e.Message}. " +
                $"Nguyên trạng cần khôi phục: {string.Join(", ", _snapshot)}. SỬA TAY NGAY.");
        }
    }

    /// <summary>Bật cột ẩn một lần cho cả fixture — mọi TC đọc freewd đều cần.</summary>
    private void EnsureFreewdReadable(TestTrace trace)
    {
        if (_flow.HiddenColumnsVisible()) return;
        if (!_flow.RevealHiddenColumns(trace))
            IgnoreWithReason(
                "không bật được cột ẩn nên không đọc được ô freewd. Xem TC-N1 của " +
                "HighNeedsNotAskedTests — nó khoá riêng đường này.");
    }

    /// <summary>
    /// Chèn một 処置 qua 処置選択 rồi trả về hộp thoại 困難者加算 (null nếu app im lặng).
    /// </summary>
    private (HighNeedsFlow.PickRow Row, FlaUI.Core.AutomationElements.Window? Dialog) Insert(
        TestTrace trace, int trtCd, int trtSb)
    {
        Assert.That(_flow.EnterCode(trace, trtCd.ToString()), Is.True,
            "không gõ được mã vào ô 点 ở コードモード");

        var picker = _flow.WaitForPicker();
        Assert.That(picker, Is.Not.Null,
            $"mã {trtCd} phải mở 処置選択 (KasanCode chỉ bẫy 101/102/103, modMain.cs:533). " +
            $"Hộp thoại: {_flow.DescribeDialogs()}");

        var rows = _flow.ReadPicker(picker!);
        var target = rows.FirstOrDefault(r => Txt.Int(r.Sub) == trtSb);
        if (target is null)
        {
            _flow.ClosePicker(picker!);
            IgnoreWithReason(
                $"master của ngày {TrtDate:yyyy-MM-dd} không có 処置 {trtCd}-{trtSb}. " +
                $"Picker đang có 枝番: {string.Join(", ", rows.Select(r => r.Sub))}");
        }

        Assert.That(_flow.CommitPick(picker!, target!.Index, trace), Is.True,
            $"không chốt được dòng {target} trong 処置選択");

        return (target, _flow.WaitForHighNeedsDialog(seconds: 10));
    }

    /// <summary>Dòng vừa chèn trên lưới, kèm giá trị ô FREEWD (cột 72).</summary>
    private HighNeedsFlow.FreewdRow InsertedRow(HighNeedsFlow.PickRow pick)
    {
        var row = _flow.RowNamed(pick.Name.Trim());
        Assert.That(row, Is.Not.Null,
            $"chốt 処置選択 rồi thì dòng 「{pick.Name.Trim()}」 phải có trên lưới " +
            "(IregCodChk chạy SAU khi frmTrtSel_Let_Trt_Data ghi xong dòng, frm203016.cs:1629)");
        return row!;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A1 — ⇔ web H-3 (nội dung câu hỏi)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-A1 — dis_flg = 3 + 105-0: HỎI, đúng nguyên văn, caption 特別対応加算, 2 nút")]
    public void TcA1_AsksWithExactWording()
    {
        using var trace = TestTrace.Begin();
        EnsureFreewdReadable(trace);

        var (pick, dialog) = Insert(trace, HighNeedsFlow.TrtCdToku, trtSb: 0);
        trace.Shot("hop-thoai-kho-nan");

        Assert.That(dialog, Is.Not.Null,
            $"dis_flg = 3 + 処置 105-0 (枝番 nằm trong [{string.Join(",", TokuTrapped)}]) thì " +
            "frm203016.cs:1096-1102 PHẢI hỏi. Không hỏi ⇒ hoặc bản vá dis_flg chưa tới được " +
            "app (app nạp _patInfoList một lần ở frm203001.cs:739), hoặc watcher đã trả lời " +
            $"hộ. Hộp thoại đang mở: {_flow.DescribeDialogs()}");

        var text = Txt.N(Dialogs.TextOf(dialog!));
        var caption = Txt.N(Uia.NameOf(dialog!));
        var buttons = HighNeedsFlow.ButtonNames(dialog!);

        Assert.Multiple(() =>
        {
            Assert.That(text, Does.Contain(HighNeedsFlow.Question),
                $"chuỗi hard-code trong C# (frm203016.cs:1100), không qua MSGTBL nên phải khớp " +
                $"nguyên chữ. Đọc ra: 「{text}」");

            Assert.That(caption, Is.EqualTo(HighNeedsFlow.QuestionCaption),
                $"tiêu đề là tham số thứ ba của Interaction.MsgBox — 「特別対応加算」, " +
                $"KHÔNG phải 「お茶コン」 như các MsgDialog.* khác. Đọc ra 「{caption}」");

            Assert.That(buttons, Has.Count.EqualTo(2),
                $"MsgBoxStyle.YesNo ⇒ đúng 2 nút. Đang có: [{string.Join(", ", buttons)}]");
        });

        TestContext.Out.WriteLine(
            $"=== KQ-A1 === 「{text}」 caption 「{caption}」 nút [{string.Join(", ", buttons)}]");

        _flow.Answer(dialog!, yes: false);
        _flow.DismissAll();
        _ = pick;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A2 — ⇔ web I-1 (「はい」 → freewd 「1」 đúng dòng)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC-A2 — 「はい」 ghi freewd 「1」 lên ĐÚNG dòng 105, không lem sang dòng khác")]
    public void TcA2_YesWritesFreewdOnThatRowOnly()
    {
        using var trace = TestTrace.Begin();
        EnsureFreewdReadable(trace);

        var before = _flow.ScanRows()
                          .Where(r => !HighNeedsFlow.IsFreewdEmpty(r.Freewd))
                          .Select(r => $"{r.Name}={r.Freewd}")
                          .ToList();

        var (pick, dialog) = Insert(trace, HighNeedsFlow.TrtCdToku, trtSb: 0);
        Assert.That(dialog, Is.Not.Null, $"phải hỏi. Hộp thoại: {_flow.DescribeDialogs()}");

        Assert.That(_flow.Answer(dialog!, yes: true), Is.True, "không bấm được 「はい」");
        Thread.Sleep(600);
        trace.Shot("sau-khi-tra-loi-hai");

        var row = InsertedRow(pick);
        Assert.That(row.Freewd, Is.EqualTo(HighNeedsDb.FreewdDifficult),
            $"「はい」 phải ghi 「1」 vào grdRegi[72] của CHÍNH dòng vừa chèn " +
            $"(frm203016.cs:1101). Đang là: {row}");

        // Không dòng nào KHÁC được dính thêm freewd. getTensu quét NGƯỢC và lấy dòng
        // 特別対応加算 đầu tiên khớp (CommonChk.chkHighNeedsAdd) nên một giá trị lạc chỗ
        // đổi luôn kết quả tính điểm.
        var newlyMarked = _flow.ScanRows()
                               .Where(r => !HighNeedsFlow.IsFreewdEmpty(r.Freewd))
                               .Select(r => $"{r.Name}={r.Freewd}")
                               .Except(before)
                               .Where(x => !Txt.Has(x, pick.Name.Trim()))
                               .ToList();

        Assert.That(newlyMarked, Is.Empty,
            "freewd lem sang dòng không phải 特別対応加算: " + string.Join(" / ", newlyMarked));

        TestContext.Out.WriteLine($"=== KQ-A2 === {row}");
        _flow.DismissAll();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A3 — ⇔ web I-2 (「いいえ」 ≠ vắng dòng)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC-A3 — 「いいえ」: dòng VẪN được chèn, freewd để trống (≠ vắng dòng)")]
    public void TcA3_NoLeavesRowWithEmptyFreewd()
    {
        using var trace = TestTrace.Begin();
        EnsureFreewdReadable(trace);

        var (pick, dialog) = Insert(trace, HighNeedsFlow.TrtCdToku, trtSb: 1);
        Assert.That(dialog, Is.Not.Null, $"phải hỏi. Hộp thoại: {_flow.DescribeDialogs()}");

        Assert.That(_flow.Answer(dialog!, yes: false), Is.True, "không bấm được 「いいえ」");
        Thread.Sleep(600);
        trace.Shot("sau-khi-tra-loi-khong");

        var row = InsertedRow(pick);

        Assert.That(HighNeedsFlow.IsFreewdEmpty(row.Freewd), Is.True,
            $"「いいえ」 KHÔNG ghi gì cả — chỉ nhánh Yes mới gán 「1」 (frm203016.cs:1100-1102). " +
            $"Đang là: {row}");

        // Vì sao 「có dòng + freewd trống」 phải khác 「không có dòng」:
        // CommonChk.cs:100-111 phân giải BA trạng thái — không có dòng 特別対応加算
        // cùng ngày → disFlg 0 (加算なし); có dòng, freewd 「1」 → disFlg 1; có dòng,
        // freewd khác 「1」 → disFlg 2. Bỏ dòng đi khi người dùng trả lời 「いいえ」 sẽ
        // âm thầm biến 加算2 thành 加算なし, và điểm sai mà không ai thấy.
        TestContext.Out.WriteLine(
            $"=== KQ-A3 === 「いいえ」 → dòng vẫn còn: {row} ⇒ getTensu sẽ phân giải disFlg = 2 " +
            "(CommonChk.cs:109), KHÁC hẳn 0 của trường hợp không có dòng nào.");

        _flow.DismissAll();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A4 — whitelist 枝番: chỉ cửa IregCodChk mới lọc
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    // Tên method CỐ Ý không chứa chuỗi 「NotAsked」: runner lọc bằng
    // `FullyQualifiedName~<Case>`, nên `-Case NotAsked` sẽ vớt luôn testcase này của
    // fixture kia. Đã dính thật 2026-08-26.
    [Description("TC-A4 — 枝番 ngoài whitelist (105-4) KHÔNG được hỏi, dù dis_flg = 3")]
    public void TcA4_SubCodeOutsideWhitelistStaysSilent()
    {
        using var trace = TestTrace.Begin();
        EnsureFreewdReadable(trace);

        // 105-4 「歯科診療特別対応連携加算」 — có thật trong master (probe đo 2026-08-26:
        // picker của 105 có 枝番 0,1,2,3,4,5,6,7,10,20,21) nhưng KHÔNG nằm trong
        // [0,1,2,3,6,7] mà frm203016.cs:1096 bẫy, và cũng không nằm trong danh sách
        // 特別対応加算 của CommonChk.cs:1225-1230.
        const int outsideSb = 4;
        Assert.That(TokuTrapped, Does.Not.Contain(outsideSb),
            "testcase này chỉ có nghĩa khi 枝番 đem thử nằm NGOÀI whitelist");

        var (pick, dialog) = Insert(trace, HighNeedsFlow.TrtCdToku, outsideSb);
        trace.Shot("ma-105-4");

        Assert.That(dialog, Is.Null,
            $"処置 105-{outsideSb} 「{pick.Name.Trim()}」 KHÔNG nằm trong " +
            $"[{string.Join(",", TokuTrapped)}] nên frm203016.cs:1096 không bẫy ⇒ phải im lặng " +
            $"dù dis_flg = 3. Hộp thoại: {_flow.DescribeDialogs()}");

        var row = InsertedRow(pick);
        Assert.That(HighNeedsFlow.IsFreewdEmpty(row.Freewd), Is.True,
            $"không hỏi thì không ghi. Đang là: {row}");

        TestContext.Out.WriteLine(
            $"=== KQ-A4 === 105-{outsideSb} 「{pick.Name.Trim()}」 → không hỏi (đúng whitelist)");
        _flow.DismissAll();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A5 — mã 508: chỉ cửa IregCodChk mới bẫy
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TC-A5 — mã 508 (歯訪) CŨNG được hỏi — cửa mà nhánh 自動算定 không có")]
    public void TcA5_HomeVisitCodeIsAlsoAsked()
    {
        using var trace = TestTrace.Begin();
        EnsureFreewdReadable(trace);

        var (pick, dialog) = Insert(trace, HighNeedsFlow.TrtCdTokuHoumon, trtSb: 0);
        trace.Shot("ma-508-0");

        Assert.That(dialog, Is.Not.Null,
            $"処置 508-0 (歯科診療特別対応加算１(歯訪)) nằm trong [{string.Join(",", HoumonTrapped)}] " +
            "mà frm203016.cs:1107-1118 bẫy ⇒ dis_flg = 3 thì PHẢI hỏi. " +
            $"Hộp thoại: {_flow.DescribeDialogs()}");

        Assert.That(_flow.Answer(dialog!, yes: true), Is.True, "không bấm được 「はい」");
        Thread.Sleep(600);

        var row = InsertedRow(pick);
        Assert.That(row.Freewd, Is.EqualTo(HighNeedsDb.FreewdDifficult),
            $"「はい」 trên nhánh 508 ghi vào cùng ô grdRegi[72] (frm203016.cs:1114). " +
            $"Đang là: {row}");

        TestContext.Out.WriteLine($"=== KQ-A5 === 508-0 CÓ hỏi và ghi freewd 「{row.Freewd}」.");
        TestContext.Out.WriteLine(
            "=== KQ-A5 === Đây là điều mà nhánh 自動算定 KHÔNG làm: modSave.cs:3450 chỉ so " +
            "`Key == 105` nên 508 không bao giờ được hỏi ở cửa đó. Chỉ cửa IregCodChk mới " +
            "có `case 508` (frm203016.cs:1107). Hai cửa lệch nhau THẬT — đừng gộp làm một.");

        _flow.DismissAll();
    }
}
