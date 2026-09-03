using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

namespace OchaCom.FlaUiTests.Tests.MenInput;

/// <summary>
/// 面入力 (<c>frm203035</c>) — nửa WinForm của
/// <c>../web-tenant-tests/tests/men-input-dialog.spec.ts</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BỘ NÀY ĐO GÌ
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web vừa port <c>frm203035</c>. Bộ này đo <b>đáp án</b> trên chính WinForm để bên
/// kia có cái mà khớp vào: cổng mở hộp thoại, bảng nhãn 5 mặt, phím 8/4/5/6/2, thứ tự
/// phát chữ M→O→I→D→B→P→L, vòng lặp <c>算定回数 ÷ 部位数</c>, ESC = 確定, và chỗ mà
/// chuỗi 面 thật sự đáp xuống: <b>cột 2 (療法・処置) VÀ cột 72 (FREEWD)</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Không bấm F9 登録. Cột 72 đọc thẳng từ lưới sau khi bật cột ẩn bằng cửa hậu có sẵn của
/// app (<see cref="MenInputFlow"/>). Bên Playwright phải bấm 登録 rồi query
/// <c>trn_trn.freewd</c> (TC-M8, sau cờ <c>TEST_ALLOW_SAVE</c>) — ở đây không cần, nên
/// TC-M8 bên kia gộp vào <see cref="TcM5_ConfirmWritesBothColumns"/> ở đây.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG VỚI SPEC PLAYWRIGHT
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  WinForm (đây)                        Playwright (men-input-dialog.spec.ts)
///  ─────────────────────────────────    ────────────────────────────────────────
///  TcM0  tiền đề: MENINPUT_FLG = 1      (spec chỉ ghi chú, không có testcase)
///  TcM1  lưới có dòng mang 部位         TC-M1  dòng seed mang 部位
///  TcM2  men=1 mở 面入力 + nhãn         TC-M2  men=1 mở + glyph 歯 + tên 処置
///  TcM3  con trỏ nằm ở btnF9  ⚠️LỆCH    TC-M3  focus nằm trong dialog, không cuộn
///  TcM4  phím 5/4 tô 2 mặt              TC-M4 (nửa đầu)
///  TcM5  F9 → token vào CẢ hai cột      TC-M4 (nửa sau) + TC-M8 (freewd)
///  TcM6  còn 部位 ⇒ hỏi răng kế, reset  TC-M5  mở lại thì lựa chọn reset sạch
///  TcM7  ESC cũng là 確定               TC-M6  ESC = 確定 chứ không phải huỷ
///  TcM8  F10 trả cột 72, KHÔNG trả cột 2   (spec ghi ở parity-notes mục 2.1)
///  TcM9  men=0 KHÔNG mở                 TC-M7  đối chứng âm
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐO THẬT 2026-09-03 trên bệnh nhân 10 / 2026-08-03 (xem PROBE)
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   INPCONFIG.MENINPUT_FLG = 1                    ⇒ cổng MỞ
///   master MST_TRT266: 26 dòng men=1, 0 dòng men=2
///   cặp A/B: mã 326 — 326-2 光ＣＲ充(単純) men=1 / 326-0 充填１(複雑) men=0
///   dòng lưới mang 部位: BUI4..BUI8 = 1 (右上5..右上1) ⇒ slot đầu = 3, 部位数 = 5
///   ⇒ chkBui nhánh idx<=4: 上B 左D 中央O 右M 下P     (Y HỆT bản web)
///   ⇒ lblBui = U+E092 (gaiji 右上5), sang răng kế đổi thành U+E098
///   ⇒ 回数 1 ÷ 部位数 5 = 0  ⇒ MỖI răng hỏi ĐÚNG MỘT lần, hộp thoại hỏi 5 lượt
///   phím 5 → lblNumCenter RGB(211,211,211); phím 4 → lblNumLeft cũng vậy
///   F9 → cột 2 = 「光重合型CR充填(単純) &lt;U+E092 OD&gt;」, cột 72 = 「&lt;U+E092 OD&gt;」
///   F10 → cột 2 GIỮ NGUYÊN token, cột 72 VỀ RỖNG
/// </code>
///
/// ⚠️ <b>Testcase NỐI TIẾP TRẠNG THÁI</b> (cùng một phiên app, cùng một dòng lưới) —
/// chạy lẻ một testcase ở giữa sẽ đỏ giả. Chạy CẢ FIXTURE.
///
/// <para>Cách chạy: <c>.\run-input-tooth-surfaces.ps1</c> · dò lại hành vi:
/// <c>.\run-input-tooth-surfaces.ps1 -Diagnostics</c></para>
/// </summary>
[TestFixture]
public sealed class MenInputTests : UiTestBase
{
    private MenInputFlow _flow = null!;
    private MenInputDb? _db;

    /// <summary>Cặp 枝番 A/B của lượt chạy này — TcM0 hỏi DB rồi cất vào đây.</summary>
    private static MenInputDb.MenPair? _pair;

    /// <summary>Tên 処置 của dòng đang thao tác. Bám theo TÊN chứ không theo chỉ số dòng —
    /// xem <see cref="MenInputFlow.RowNamed"/>.</summary>
    private static string _rowName = "";

    /// <summary>Số ô 部位 khác 0 của dòng đó — mẫu số của <c>算定回数 ÷ 部位数</c>.</summary>
    private static int _buiCount;

    /// <summary>Ô 部位 khác 0 đầu tiên — quyết định bảng nhãn 5 mặt (<c>chkBui</c>).</summary>
    private static int _firstBuiSlot = -1;

    /// <summary>Chuỗi 面 mà TcM4/TcM5 kỳ vọng — tính từ nhãn thật, đặt trong TcM5.</summary>
    private static string _surfaces = "";

    [SetUp]
    public void MenSetUp()
    {
        _flow = new MenInputFlow(App, Screen);
        _db = MenInputDb.CreateOrNull(Settings);
    }

    /// <summary>Hộp thoại 面入力 phải đang mở; không thì Ignore (testcase trước đã đỏ/Ignore).</summary>
    private Window RequireOpenDialog()
    {
        var dialog = MenInputDialog.Find(App, Screen);
        if (dialog is null)
            IgnoreWithReason(
                "面入力 không còn mở — testcase này nối tiếp trạng thái của testcase trước. " +
                "Chạy CẢ fixture, đừng chạy lẻ.");
        return dialog!;
    }

    // ── TcM0 ─────────────────────────────────────────────────────────────────

    [Test, Order(0)]
    [Description("TcM0 — tiền đề: INPCONFIG.MENINPUT_FLG = 1 và master có cặp 枝番 men=1 / men=0")]
    public void TcM0_Preconditions()
    {
        if (_db is null)
            IgnoreWithReason(
                "Cần DB để đọc INPCONFIG.MENINPUT_FLG và cột `men` của master — cả hai là CỔNG " +
                $"quyết định 面入力 có mở hay không, UI không nói ra được. {DbUnavailableReason}");

        var flg = _db!.MenInputFlg();
        TestContext.Out.WriteLine($"INPCONFIG.MENINPUT_FLG = {flg?.ToString() ?? "(null)"}");
        foreach (var line in _db.MenHistogram(TrtDate)) TestContext.Out.WriteLine("  " + line);

        if (flg != 1)
            IgnoreWithReason(
                $"INPCONFIG.MENINPUT_FLG = {flg?.ToString() ?? "(không có dòng KEY_ID=1)"} ≠ 1 ⇒ " +
                "診療入力設定「面入力する」 đang TẮT trên máy này. frm203016.cs:1567 đọc cờ này qua " +
                "ModCommon.pInpOpt[6] (modCommon.cs:473) nên 面入力 sẽ KHÔNG BAO GIỜ mở — cả fixture " +
                "vô nghĩa. Đây là cấu hình của máy, KHÔNG phải lỗi app.");

        _pair = _db.FindMenPair(TrtDate);
        if (_pair is null)
            IgnoreWithReason(
                $"master áp dụng cho {TrtDate:yyyy-MM-dd} không có trt_cd nào chứa CẢ 枝番 men=1 " +
                "LẪN men=0. Không có cặp A/B thì không đối chứng âm được trong cùng một 処置選択.");

        TestContext.Out.WriteLine("cặp A/B = " + _pair);
    }

    // ── TcM1 ─────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("TcM1 — lưới có dòng 処置 mang 部位 (điều kiện để 面入力 mở được)")]
    public void TcM1_GridHasRowWithBui()
    {
        using var trace = TestTrace.Begin();

        Assert.That(_flow.RevealHiddenColumns(trace), Is.True,
            "không bật được cột ẩn của grdRegi. Cửa hậu là click nhãn 患者番号 (customLabel1) " +
            "RỒI double-click nhãn 氏名 (customLabel3) — đúng thứ tự đó, xem " +
            "HighNeedsFlow.RevealHiddenColumns (frm203002.cs:2645-2718). Không có cột ẩn thì " +
            "không đọc được BUI1..32 lẫn FREEWD.");

        var headers = _flow.AllHeaders();
        Assert.That(headers.Count, Is.GreaterThan(MenInputFlow.ColFreewd),
            $"grdRegi chỉ đọc được {headers.Count} cột, cần > {MenInputFlow.ColFreewd} để chạm cột FREEWD.");
        Assert.That(headers[MenInputFlow.ColBui1], Does.Contain("BUI1"),
            $"cột {MenInputFlow.ColBui1} phải là BUI1 (InpDBAccess.getInpTrntrnData: 8..39 = BUI1..32). " +
            $"Đang là 「{headers[MenInputFlow.ColBui1]}」 — thứ tự cột của DataTable đã đổi, mọi chỉ số " +
            "trong MenInputFlow phải sửa theo.");
        Assert.That(headers[MenInputFlow.ColFreewd], Does.Contain("FREEWD"),
            $"cột {MenInputFlow.ColFreewd} phải là FREEWD (frm203002.cs:188). " +
            $"Đang là 「{headers[MenInputFlow.ColFreewd]}」.");

        var rows = _flow.Rows(limit: 16, withBui: true, countAllBui: true);
        foreach (var r in rows) TestContext.Out.WriteLine("  " + r);

        var target = _flow.TargetRow(limit: 16);
        if (target is null)
            IgnoreWithReason(
                $"bệnh nhân {PatNo} ngày {TrtDate:yyyy-MM-dd} không có dòng 処置 nào mang 部位 " +
                "(BUI1..32 đều 0). frm203035_Activated đóng NGAY khi _buiCnt == 0 (:136) nên 面入力 " +
                "không thể mở. Đây là dữ liệu của máy — đổi patient.patNo / patient.trtDate sang hồ sơ " +
                "có 部位病名行, hoặc nhập 部位 cho một dòng rồi chạy lại.");

        _rowName = target!.Ryo;
        _buiCount = target.BuiCount;
        _firstBuiSlot = target.FirstBuiSlot;

        TestContext.Out.WriteLine(
            $"DÒNG ĐEM GÕ MÃ = {target}; ô 部位 đầu tiên = slot {_firstBuiSlot}, tổng {_buiCount} 部位 " +
            $"⇒ fixProc sẽ hỏi 「算定回数 ÷ {_buiCount}」 lần cho MỖI răng (frm203035.cs:449).");
        trace.Shot("TcM1-dong-mang-bui");
    }

    // ── TcM2 ─────────────────────────────────────────────────────────────────

    [Test, Order(2)]
    [Description("TcM2 — chọn 枝番 men=1 MỞ 面入力, hiện glyph 歯 + tên 処置 + 5 nhãn mặt + gợi ý phím")]
    public void TcM2_MenOneOpensDialog()
    {
        if (_pair is null || _rowName.Length == 0)
            IgnoreWithReason("TcM0/TcM1 chưa chốt được tiền đề — xem lý do ở hai testcase đó.");

        using var trace = TestTrace.Begin();

        var row = _flow.RequireRowNamed(_rowName, withBui: true, countAllBui: true);
        var picked = _flow.PickVariant(row, _pair!.TrtCd, _pair.WithMen.TrtSb, trace);
        var dialog = picked.Dialog;

        Assert.That(dialog, Is.Not.Null,
            $"{_pair.TrtCd}-{_pair.WithMen.TrtSb} có mst_trt.men = 1 nên PHẢI mở 面入力 ngay sau khi " +
            "dòng đáp xuống lưới (frm203016.cs:1565-1573). Không mở ⇒ hoặc dòng không mang 部位 " +
            "(frm203035_Activated đóng ngay), hoặc ModCommon.pInpOpt[6] khác 1. " +
            $"Đang thấy: {_flow.DescribeDialogs()}");

        // Bám theo TÊN HIỆN TRÊN LƯỚI, không phải trt_nm của master — xem PickResult.GridName.
        _rowName = picked.GridName;
        TestContext.Out.WriteLine(
            $"dòng đang thao tác đổi tên: master 「{_pair.WithMen.Name}」 → lưới 「{_rowName}」");
        trace.Shot("TcM2-men-input-mo");

        // ⚠️ ĐIỂM KHÁC BẢN WEB: frm203016 mở 面入力 bằng showDialog MODAL ngay giữa
        // frmTrtSel_Let_Trt_Data (:1573) nên 処置選択 VẪN CÒN MỞ phía sau. Bản web đóng
        // 処置選択 trước rồi mới mở 面入力. Ghi lại chứ KHÔNG assert: đây là chi tiết dựng
        // hình của WinForm, không phải luật nghiệp vụ bản web phải chép.
        TestContext.Out.WriteLine(
            $"処置選択 còn mở phía sau 面入力 = {_flow.Picker() is not null} " +
            "(WinForm dùng showDialog MODAL lồng nhau; bản web đóng picker trước)");

        // lblBui — glyph răng, là GAIJI vùng PUA (đo: U+E092 = 右上5) nên chỉ kiểm KHÁC RỖNG.
        var bui = MenInputDialog.Bui(dialog!);
        Assert.That(bui, Is.Not.Empty,
            "lblBui phải mang glyph răng đang hỏi — lblBuiShow tra CNV_TOOTH_TEXT theo " +
            $"(tooth_kbn=0, pos1, reg1, type1) từ slot {_firstBuiSlot} (frm203035.cs:374-419). " +
            "Rỗng = không tra được bảng, hoặc _bufBui rỗng.");
        TestContext.Out.WriteLine($"lblBui = {CodePoints(bui)}  lblTrt = 「{MenInputDialog.Trt(dialog!)}」");

        Assert.That(Txt.N(MenInputDialog.Trt(dialog!)), Is.Not.Empty,
            "lblTrt phải hiện tên 処置 đang chạy — frm203035.cs:421 gán nó bằng CỘT 2 của dòng lưới.");

        // Bảng nhãn 5 mặt theo vị trí răng (chkBui, :301-364). Tính kỳ vọng từ slot đo được
        // chứ không hard-code — đổi bệnh nhân là đổi răng, đổi răng là đổi bảng nhãn.
        var expected = ExpectedFaceLabels(_firstBuiSlot);
        TestContext.Out.WriteLine("nhãn đang hiện: " + MenInputDialog.DescribeFaces(dialog!));
        foreach (var (face, letter) in expected)
            Assert.That(Txt.N(MenInputDialog.MenLabel(dialog!, face)), Is.EqualTo(letter),
                $"nhãn mặt {face} của răng ở slot {_firstBuiSlot} phải là 「{letter}」 " +
                $"(chkBui nhánh {SlotBranchName(_firstBuiSlot)}, frm203035.cs:301-364)");

        // Gợi ý phím — lblNum* của Designer (:73-119), cố định không phụ thuộc răng.
        foreach (var face in MenInputDialog.AllFaces)
            Assert.That(Txt.N(MenInputDialog.NumLabel(dialog!, face)),
                Is.EqualTo(MenInputDialog.HintOf(face)),
                $"gợi ý phím của mặt {face} phải là 「{MenInputDialog.HintOf(face)}」 " +
                "(frm203035.Designer.cs:73-119)");
    }

    // ── TcM3 ─────────────────────────────────────────────────────────────────

    [Test, Order(3)]
    [Description("TcM3 — con trỏ nằm ở nút F9, KHÔNG ở ô nhập nào (frm203035 không có TextBox)")]
    public void TcM3_InitialFocus()
    {
        RequireOpenDialog();

        var focused = App.Automation.FocusedElement();
        Assert.That(focused, Is.Not.Null, "không đọc được phần tử đang giữ con trỏ");

        var id = Uia.AutomationIdOf(focused!);
        TestContext.Out.WriteLine(
            $"focus: id=「{id}」 name=「{Txt.N(Uia.NameOf(focused!))}」 type={Uia.ControlTypeOf(focused!)}");

        // ⚠️ ĐO THẬT 2026-09-03: WinForm để con trỏ ở btnF9, KHÔNG phải tthSn dù tthSn có
        // TabIndex 0 (Designer :214). frm203035.initProc không gọi .Focus() nào, nên đây là
        // hành vi mặc định của BaseDialog2 — con trỏ về nút chức năng.
        //
        // Bản web assert 「focus nằm TRONG dialog」 (TC-M3) — CÙNG ý nghĩa nghiệp vụ (phím
        // 8/4/5/6/2 phải tới được hộp thoại, không bị màn hình 診療入力 nuốt), KHÁC cách thể
        // hiện. Đừng "sửa" bên nào cho giống bên nào.
        Assert.That(id, Is.EqualTo("btnF9"),
            "con trỏ lúc 面入力 vừa mở phải nằm ở nút F9 確定 — đo được 2026-09-03. Nó rơi ra chỗ " +
            "khác nghĩa là phím 8/4/5/6/2 có thể không tới được form (formBase_KeyDown chỉ chạy " +
            $"khi hộp thoại giữ bàn phím). Đang ở 「{id}」.");

        Assert.That(
            focused!.Patterns.Value.IsSupported && !string.IsNullOrEmpty(Uia.ValueOf(focused)) &&
            Uia.ControlTypeOf(focused) == FlaUI.Core.Definitions.ControlType.Edit,
            Is.False,
            "frm203035 KHÔNG có ô nhập nào (Designer chỉ có Label + tthSn + nút F-key) — " +
            "con trỏ không được rơi vào một Edit.");
    }

    // ── TcM4 ─────────────────────────────────────────────────────────────────

    [Test, Order(4)]
    [Description("TcM4 — mới mở: 0 mặt được chọn; phím 5 (中央) rồi 4 (左) tô nền LightGray đúng 2 mặt")]
    public void TcM4_KeysToggleFaces()
    {
        var dialog = RequireOpenDialog();
        using var trace = TestTrace.Begin();

        TestContext.Out.WriteLine("màu lúc vừa mở: " + MenInputDialog.DescribeColors(dialog));
        Assert.That(MenInputDialog.SelectedCount(dialog), Is.EqualTo(0),
            "面入力 vừa mở mà đã có mặt được tô — frm203035_Activated gọi chkBkColorAll() với " +
            $"tthSn.Select* đều false (:136-139). Màu đang đọc: {MenInputDialog.DescribeColors(dialog)}");

        Assert.That(MenInputDialog.ToggleFace(dialog, MenInputDialog.Face.Center, trace), Is.True,
            "SendInput không chèn được phím 5 nào — không phải lỗi WinForm.");
        Assert.That(MenInputDialog.IsSelected(dialog, MenInputDialog.Face.Center), Is.True,
            "phím 5 phải bật mặt 中央 (formBase_KeyDown case Keys.D5, frm203035.cs:210-214) — " +
            $"nền lblNumCenter phải thành LightGray. Đang là: {MenInputDialog.DescribeColors(dialog)}");

        Assert.That(MenInputDialog.ToggleFace(dialog, MenInputDialog.Face.Left, trace), Is.True,
            "SendInput không chèn được phím 4 nào.");
        Assert.That(MenInputDialog.IsSelected(dialog, MenInputDialog.Face.Left), Is.True,
            "phím 4 phải bật mặt 左 (case Keys.D4, :205-209). " +
            $"Đang là: {MenInputDialog.DescribeColors(dialog)}");

        Assert.That(MenInputDialog.SelectedCount(dialog), Is.EqualTo(2),
            "đúng 2 mặt được chọn, không hơn không kém. " +
            $"Đang là: {MenInputDialog.DescribeColors(dialog)}");
        trace.Shot("TcM4-da-chon-2-mat");
    }

    // ── TcM5 ─────────────────────────────────────────────────────────────────

    [Test, Order(5)]
    [Description("TcM5 — F9 確定 nối token 「<歯OD>」 vào CẢ cột 2 (療法・処置) LẪN cột 72 (FREEWD)")]
    public void TcM5_ConfirmWritesBothColumns()
    {
        var dialog = RequireOpenDialog();
        using var trace = TestTrace.Begin();

        // Thứ tự phát chữ là M→O→I→D→B→P→L (makeMenStr), KHÔNG phải thứ tự bấm phím.
        // Tính từ nhãn ĐANG HIỆN nên đổi bệnh nhân / đổi răng vẫn đúng.
        _surfaces = MenInputDialog.ExpectedSurfaces(
            dialog, MenInputDialog.Face.Center, MenInputDialog.Face.Left);
        Assert.That(_surfaces, Is.Not.Empty, "không tính được chuỗi 面 kỳ vọng từ nhãn đang hiện");
        TestContext.Out.WriteLine($"chuỗi 面 kỳ vọng (makeMenStr M→O→I→D→B→P→L) = 「{_surfaces}」");

        var before = _flow.RequireRowNamed(_rowName);
        TestContext.Out.WriteLine($"TRƯỚC: cột 2 = 「{before.Ryo}」 cột 72 = {HighNeedsFlow.DescribeFreewd(before.Freewd)}");
        Assert.That(HighNeedsFlow.IsFreewdEmpty(before.Freewd), Is.True,
            "cột 72 phải còn trống trước lần 確定 đầu — frm203035_Load cất nó vào " +
            $"prvStrBuffFreeWord rồi XOÁ (:129-130). Đang là {HighNeedsFlow.DescribeFreewd(before.Freewd)}");

        MenInputDialog.Confirm(dialog, trace);
        Thread.Sleep(800);

        var after = _flow.RequireRowNamed(_rowName);
        TestContext.Out.WriteLine($"SAU  : cột 2 = 「{after.Ryo}」");
        TestContext.Out.WriteLine($"       cột 72 = {CodePoints(after.Freewd)}");
        trace.Shot("TcM5-sau-F9");

        var token = MenInputDialog.TokenRegex(_surfaces);
        Assert.That(token.IsMatch(after.Ryo), Is.True,
            $"cột 2 (療法・処置) phải được nối token 「<歯{_surfaces}>」 — fixProc ghi " +
            $"`_dtRegiData[2] + \" \" + strMen` (frm203035.cs:434). Đang là 「{after.Ryo}」");

        Assert.That(after.Freewd, Is.Not.Null,
            "không đọc được cột 72 — cột ẩn đã tắt lại?");
        Assert.That(token.IsMatch(Txt.N(after.Freewd!)), Is.True,
            $"cột 72 (FREEWD) CŨNG phải mang token 「<歯{_surfaces}>」 — fixProc ghi cả hai cột " +
            "(:434-435), và đây chính là chỗ mà bản web trước đây bỏ trống: freewd rỗng vì " +
            $"không producer nào ghi nó. Đang là {CodePoints(after.Freewd)}");
    }

    // ── TcM6 ─────────────────────────────────────────────────────────────────

    [Test, Order(6)]
    [Description("TcM6 — 算定回数 ÷ 部位数 = 0 ⇒ 確定 xong KHÔNG đóng mà hỏi răng KẾ, lựa chọn reset sạch")]
    public void TcM6_MovesToNextToothAndResets()
    {
        if (_buiCount <= 1)
            IgnoreWithReason(
                $"dòng test chỉ có {_buiCount} 部位 nên 確定 đầu tiên đã đóng hộp thoại — " +
                "không có răng kế để đo. Cần hồ sơ có 部位病名行 nhiều răng.");

        var dialog = MenInputDialog.Find(App, Screen);
        Assert.That(dialog, Is.Not.Null,
            $"dòng có {_buiCount} 部位 và 回数 = 1 ⇒ `算定回数 ÷ 部位数` = 0 ≤ _menCnt, nên fixProc " +
            "xoá răng vừa xong rồi gọi chkBui() cho răng KẾ — hộp thoại phải Ở LẠI, chỉ đóng khi " +
            "_buiCnt về 0 (frm203035.cs:449-478). Nó đóng sớm = vòng lặp 部位 sai.");

        TestContext.Out.WriteLine("lblBui răng hiện tại = " + CodePoints(MenInputDialog.Bui(dialog!)));
        TestContext.Out.WriteLine("màu sau 確定 = " + MenInputDialog.DescribeColors(dialog!));

        Assert.That(MenInputDialog.SelectedCount(dialog!), Is.EqualTo(0),
            "sang răng kế thì lựa chọn mặt phải reset SẠCH — fixProc gọi ResetTThSn() (:465, :482) " +
            $"đặt cả 5 Select* về false. Đang là: {MenInputDialog.DescribeColors(dialog!)}");
    }

    // ── TcM7 ─────────────────────────────────────────────────────────────────

    [Test, Order(7)]
    [Description("TcM7 — ESC là 確定 chứ KHÔNG phải huỷ (BaseDialog2.formBase_KeyDown Escape → btnF9_Click)")]
    public void TcM7_EscapeConfirms()
    {
        var dialog = RequireOpenDialog();
        using var trace = TestTrace.Begin();

        var before = _flow.RequireRowNamed(_rowName);
        var expected = MenInputDialog.ExpectedSurfaces(dialog, MenInputDialog.Face.Center);

        MenInputDialog.ToggleFace(dialog, MenInputDialog.Face.Center, trace);
        Assert.That(MenInputDialog.IsSelected(dialog, MenInputDialog.Face.Center), Is.True,
            "chưa bật được mặt 中央 thì ESC không chứng minh được gì");

        MenInputDialog.ConfirmByEscape(dialog, trace);
        Thread.Sleep(800);

        var after = _flow.RequireRowNamed(_rowName);
        TestContext.Out.WriteLine($"trước = 「{before.Ryo}」");
        TestContext.Out.WriteLine($"sau   = 「{after.Ryo}」");
        trace.Shot("TcM7-sau-ESC");

        Assert.That(after.Ryo.Length, Is.GreaterThan(before.Ryo.Length),
            "ESC map sang btnF9_Click (BaseDialog2.cs:196-201) nên PHẢI 確定 — cột 2 dài thêm một " +
            $"token. Không đổi = ESC đang huỷ, tức LỆCH với bản web (spec Rule 10.4). " +
            $"trước 「{before.Ryo}」 → sau 「{after.Ryo}」");
        Assert.That(MenInputDialog.TokenRegex(expected).IsMatch(after.Ryo), Is.True,
            $"ESC 確定 với mỗi mặt 中央 phải sinh token 「<歯{expected}>」. Đang là 「{after.Ryo}」");
    }

    // ── TcM8 ─────────────────────────────────────────────────────────────────

    [Test, Order(8)]
    [Description("TcM8 — F10 戻り trả LẠI cột 72 nhưng KHÔNG trả cột 2 (bug WinForm, bản web đã chép nguyên)")]
    public void TcM8_BackRestoresFreewdOnly()
    {
        var dialog = RequireOpenDialog();
        using var trace = TestTrace.Begin();

        var before = _flow.RequireRowNamed(_rowName);
        TestContext.Out.WriteLine($"TRƯỚC F10: cột 2 = 「{before.Ryo}」 cột 72 = {CodePoints(before.Freewd)}");
        Assert.That(HighNeedsFlow.IsFreewdEmpty(before.Freewd), Is.False,
            "cột 72 phải đang MANG token thì mới đo được việc F10 trả nó về. " +
            $"Đang là {HighNeedsFlow.DescribeFreewd(before.Freewd)}");

        MenInputDialog.Back(dialog, trace);
        Waits.TryUntil(() => MenInputDialog.Find(App, Screen) is null, TimeSpan.FromSeconds(10));

        Assert.That(MenInputDialog.Find(App, Screen), Is.Null,
            "F10 戻り phải đóng 面入力 (BaseDialog2.btnF10_Click → Close), kể cả khi còn 部位 chưa hỏi.");

        var after = _flow.RequireRowNamed(_rowName);
        TestContext.Out.WriteLine($"SAU   F10: cột 2 = 「{after.Ryo}」 cột 72 = {CodePoints(after.Freewd)}");
        trace.Shot("TcM8-sau-F10");

        // ⚠️ ĐÂY LÀ MỘT BUG CỦA WINFORM, ĐƯỢC CHỐT LẠI CÓ CHỦ Ý.
        // btnF10_Click chỉ khôi phục prvStrBuffFreeWord cho CỘT 72 (frm203035.cs:158-164);
        // cột 2 giữ nguyên mọi token đã cộng vào. Bản web đã chép y hệt (parity-notes-men-input
        // mục 2.1: onCancel trả { dspTrt: mutated, freewd: original }). Ai "sửa" một trong hai
        // bên cho sạch hơn là làm LỆCH parity — testcase này để chặn đúng chuyện đó.
        Assert.That(HighNeedsFlow.IsFreewdEmpty(after.Freewd), Is.True,
            "F10 戻り PHẢI trả cột 72 về giá trị lúc Load (rỗng) — btnF10_Click gán " +
            $"`_dtRegiData[72] = prvStrBuffFreeWord` (:161). Đang là {CodePoints(after.Freewd)}");
        Assert.That(after.Ryo, Is.EqualTo(before.Ryo),
            "F10 戻り KHÔNG được đụng tới cột 2 — btnF10_Click không khôi phục nó. Đây là BUG của " +
            "WinForm (hai cột lệch nhau sau khi 戻り) và bản web đã chép nguyên; sửa một bên là " +
            $"phá parity. trước 「{before.Ryo}」 → sau 「{after.Ryo}」");
    }

    // ── TcM9 ─────────────────────────────────────────────────────────────────

    [Test, Order(9)]
    [Description("TcM9 — đối chứng âm: 枝番 men=0 KHÔNG mở 面入力")]
    public void TcM9_MenZeroDoesNotOpen()
    {
        if (_pair is null) IgnoreWithReason("TcM0 chưa tìm được cặp A/B.");

        using var trace = TestTrace.Begin();
        MenInputDialog.CloseIfOpen(App, Screen, trace);
        _flow.ClosePicker();
        _flow.DismissAll();

        var row = _flow.RequireRowNamed(_rowName, withBui: true, countAllBui: true);
        var picked = _flow.PickVariant(row, _pair!.TrtCd, _pair.WithoutMen.TrtSb, trace);
        _rowName = picked.GridName;
        trace.Shot("TcM9-men0");

        Assert.That(picked.Dialog, Is.Null,
            $"{_pair.TrtCd}-{_pair.WithoutMen.TrtSb} có mst_trt.men = 0 nên frm203016.cs:1567 KHÔNG " +
            "được mở 面入力. Mở ra = cổng `men` bị bỏ qua, và mọi 処置 sẽ hỏi mặt răng.");

        // `toBeHidden` của Playwright auto-wait nên không bắt được "mở muộn"; ở đây cũng vậy —
        // phải chờ trọn rồi mới kết luận (xem MenInputDialog.StaysClosed).
        Assert.That(MenInputDialog.StaysClosed(App, Screen), Is.True,
            $"{_pair.TrtCd}-{_pair.WithoutMen.TrtSb} (men=0) mở 面入力 MUỘN — vẫn là lệch, chỉ khó thấy hơn.");
    }

    [OneTimeTearDown]
    public void MenOneTimeTearDown()
    {
        // Không bấm F9 登録 nên lưới bẩn chỉ nằm trong bộ nhớ; vẫn dọn hộp thoại để phiên app
        // sau (fixture khác, hoặc người ngồi xem) không gặp một cái modal treo giữa màn hình.
        try
        {
            if (TreatmentScreenAlive())
            {
                MenInputDialog.CloseIfOpen(App, Screen);
                _flow?.ClosePicker();
                _flow?.DismissAll();
            }
        }
        catch (Exception e)
        {
            TestContext.Out.WriteLine($"dọn hộp thoại cuối fixture không xong: {e.Message}");
        }
    }

    // ── Tiện ích ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Bảng nhãn 5 mặt mà <c>chkBui</c> phát ra cho một slot 部位 (frm203035.cs:301-364).
    /// Chép nguyên tám nhánh <c>if</c> — kỳ vọng phải suy từ LUẬT, không từ một lần đo.
    /// </summary>
    private static IReadOnlyList<(MenInputDialog.Face Face, string Letter)> ExpectedFaceLabels(int slot)
    {
        var (top, left, center, right, bottom) = slot switch
        {
            <= 4 => ("B", "D", "O", "M", "P"),
            <= 7 => ("B", "D", "I", "M", "P"),
            <= 10 => ("B", "M", "I", "D", "P"),
            <= 15 => ("B", "M", "O", "D", "P"),
            <= 20 => ("L", "D", "O", "M", "B"),
            <= 23 => ("L", "D", "I", "M", "B"),
            <= 26 => ("L", "M", "I", "D", "B"),
            _ => ("L", "M", "O", "D", "B"),
        };
        return
        [
            (MenInputDialog.Face.Top, top),
            (MenInputDialog.Face.Left, left),
            (MenInputDialog.Face.Center, center),
            (MenInputDialog.Face.Right, right),
            (MenInputDialog.Face.Bottom, bottom),
        ];
    }

    private static string SlotBranchName(int slot) => slot switch
    {
        <= 4 => "idx <= 4",
        <= 7 => "idx 5-7",
        <= 10 => "idx 8-10",
        <= 15 => "idx 11-15",
        <= 20 => "idx 16-20",
        <= 23 => "idx 21-23",
        <= 26 => "idx 24-26",
        _ => "idx 27-31",
    };

    /// <summary>
    /// In chuỗi kèm điểm mã từng ký tự.
    ///
    /// <para>Bắt buộc cho <c>lblBui</c> và cột 72: glyph răng là GAIJI vùng PUA (đo được:
    /// <c>U+E092</c> = 右上5). Console không vẽ được nó — in thẳng thì trông y như thiếu
    /// chữ và người đọc log sẽ tưởng là lỗi.</para>
    /// </summary>
    private static string CodePoints(string? s)
    {
        if (s is null) return "(null)";
        var parts = s.Select(c => c < 0x20 || c > 0x7E ? $"U+{(int)c:X4}" : c.ToString());
        return $"「{s}」 = [{string.Join(" ", parts)}]";
    }
}
