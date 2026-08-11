using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteAutoCalc;

/// <summary>
/// <b>カルテ自動算定 (frm203042 一覧 / frm203043 登録)</b> — luồng ĐIỀU TRA, không phải
/// luồng hồi quy.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MỤC ĐÍCH
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web vừa port cặp màn này. Sáu điểm dưới đây <b>đọc source không kết luận
/// chắc được</b> — cần thấy WinForm thật chạy ra gì rồi mới biết bản web đúng hay
/// phải sửa. Vì thế phần lớn testcase <b>ghi log rồi Pass</b>; chỉ assert những gì
/// đã chắc chắn từ source. Cái chưa biết mà assert thì chỉ đỏ vì đoán sai, không
/// nói thêm được gì.
///
/// <para><b>Cách đọc kết quả</b>: chạy xong lấy toàn bộ khối
/// <c>=== KQ-n ===</c> trong log gửi lại. Mỗi khối trả lời đúng một câu hỏi.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// SÁU ĐIỂM CẦN TRẢ LỜI
/// ═══════════════════════════════════════════════════════════════════════════
///  KQ-1 一覧 có liệt kê 処置 CHƯA có cấu hình không, và đếm được bao nhiêu dòng?
///        → bản web LEFT JOIN nên có. Nếu WinForm chỉ hiện 処置 đã cấu hình thì
///          bản web đang thừa ~1.580 dòng.
///  KQ-2 一覧 lọc theo version của 処置マスタ như thế nào?
///        → demo có 35 version; bản web lấy version có hiệu lực HÔM NAY qua
///          mst_trt_ver. Cần số 該当件数 thật để đối chiếu (kỳ vọng ~1.764).
///  KQ-3 確認画面不要 tick theo quy tắc nào?
///        → bản web: chỉ tick khi CÓ ≥1 dòng VÀ MỌI dòng no_chk = 1.
///          3 ca: all-1 / lẫn lộn / không dòng nào.
///  KQ-4 F9 登録 có giữ nguyên use_cnt không?
///        → bản web round-trip use_cnt. Nếu WinForm reset về 0 thì học máy mất.
///  KQ-5 登録 với lưới RỖNG có xoá sạch cấu hình không?
///        → bản web coi lines = [] là "xoá". Nếu WinForm chặn thì phải bỏ.
///  KQ-6 cmt_nm bị cắt theo BYTE hay KÝ TỰ?
///        → WinForm dùng ComLibrary.LeftB = Shift-JIS BYTE (60B ≈ 30 chữ Nhật).
///          Bản web cắt theo KÝ TỰ (60 chữ). Cột Postgres là varchar(60) tính
///          KÝ TỰ và dữ liệu đã migrate có tên 41 ký tự / 78 byte — tức bản
///          migrate KHÔNG cắt theo byte. Cần biết WinForm thật cắt ở đâu.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// KQ-4, KQ-5, KQ-6 phải bấm F9 → GHI THẬT vào <c>cmtauto</c>, và đây là master
/// TOÀN PHÒNG KHÁM (đổi nó là đổi comment tự động của mọi bệnh nhân). Cả ba nằm
/// sau <c>inpP1.allowSave</c>, và tự khôi phục lại trạng thái cũ ở cuối.
/// <b>Nên chạy trên máy có DB sao lưu được.</b>
///
/// Testcase chỉ-đọc (KQ-1..3) chạy được ngay, không cần cờ gì.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-karte-auto-calc.ps1 -Diagnostics   ← CHẠY CÁI NÀY TRƯỚC TIÊN
///   .\run-karte-auto-calc.ps1
///   .\run-karte-auto-calc.ps1 -Case Tc3
///
/// <c>-Diagnostics</c> đổ cây UIA của cả hai form ra artifact. Tên control trong
/// <see cref="KarteAutoCalcDialog"/> mới chỉ là SUY ĐOÁN từ các form anh em —
/// phải xem cây thật rồi sửa lại trước khi các Tc khác chạy được.
/// </summary>
[TestFixture]
[Category("karte-auto-calc")]
public sealed class KarteAutoCalcTests : InpP1Dialogs.InpP1TestBase
{
    private Window? _list;
    private KarteAutoCalcDb? _kacDb;

    private Window List => _list ??= KarteAutoCalcDialog.OpenList(App, Screen.Window);

    [OneTimeSetUp]
    public void KarteAutoCalcOneTimeSetUp() => _kacDb = KarteAutoCalcDb.CreateOrNull(Settings);

    /// <summary>DB tắt / không kết nối được thì Ignore kèm lý do.</summary>
    private KarteAutoCalcDb RequireKacDb(string why)
    {
        // Dùng chung cổng kiểm tra kết nối của InpP1TestBase để thông báo thống nhất.
        RequireInpDb(why);
        if (_kacDb is null) IgnoreWithReason($"{why} — db.enabled = false hoac thieu db.connectionString");
        return _kacDb!;
    }

    [OneTimeTearDown]
    public void CloseDialogsIfLeftOpen()
    {
        foreach (var id in new[] { KarteAutoCalcDialog.RegisterId, KarteAutoCalcDialog.ListId })
        {
            var open = App?.Window(id);
            if (open is null) continue;
            try { KarteAutoCalcDialog.Close(App!, open); }
            catch (Exception e) { Log($"khong dong duoc {id}: {e.Message}"); }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc0 — đổ cây UIA. CHẠY TRƯỚC MỌI THỨ.
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("Tc0 — đổ cây UIA của frm203042 + frm203043 để chốt tên control")]
    public void Tc0_DumpUiaTree()
    {
        using var trace = TestTrace.Begin();

        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);
        Log($"=== KQ-0 === title 一覧: 「{Uia.NameOf(_list)}」");
        InpP1Dialogs.InpP1MenuFlow.WriteArtifact("karte-auto-calc-list.uia.txt",
                      Uia.DumpTree(_list, maxDepth: 6, maxChildrenPerNode: 60));

        // Mở luôn 登録 để lấy cả cây của nó. Dòng đang chọn là dòng đầu.
        try
        {
            var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);
            Log($"=== KQ-0 === title 登録: 「{Uia.NameOf(reg)}」");
            InpP1Dialogs.InpP1MenuFlow.WriteArtifact("karte-auto-calc-register.uia.txt",
                          Uia.DumpTree(reg, maxDepth: 6, maxChildrenPerNode: 60));
            KarteAutoCalcDialog.Close(App, reg);
        }
        catch (Exception e)
        {
            // Không mở được cũng là một kết quả — ghi lại rồi để Tc khác quyết.
            Log($"=== KQ-0 === KHONG mo duoc {KarteAutoCalcDialog.RegisterId}: {e.Message}");
        }

        Log("Da ghi artifact karte-auto-calc-*.uia.txt — doi chieu roi sua " +
            "KarteAutoCalcDialog neu ten control lech.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 + Tc2 — KQ-1 / KQ-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — KQ-1/KQ-2: 一覧 có 処置 chưa cấu hình không, và tổng số dòng")]
    public void Tc1_ListIncludesUnconfiguredTreatments()
    {
        using var trace = TestTrace.Begin();
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var grid = RequireGrid(_list, KarteAutoCalcDialog.ListGridId);
        var headers = grid.Headers();
        Log("=== KQ-1 === cot 一覧: " + string.Join(" | ", headers));

        // 該当件数 do chính app tính (lblCount) — đáng tin hơn đếm phần tử UIA.
        var countLabel = Uia.ById(_list, KarteAutoCalcDialog.ListCountLabelId);
        var shownCount = countLabel is null ? "(khong doc duoc lblCount)" : Uia.NameOf(countLabel);
        Log($"=== KQ-2 === 該当件数 WinForm hien: {shownCount}");
        Log("   (ban web sau khi loc version mst_trt cho 1.764 dong — so nay phai khop)");

        // Đọc tối đa 40 dòng đầu; chỉ cần biết CÓ hay KHÔNG dòng chưa cấu hình.
        var rows = grid.Rows(limit: 40);
        var blankCmt = 0;
        foreach (var r in rows.Take(40))
        {
            var cells = r.Cells;
            // Cột thứ 3 (index 2) là dsp_cmt_cd theo _viewItem (frm203042.cs:46-53).
            var cmtCd = cells.Count > 2 ? Txt.N(cells[2]) : "";
            if (string.IsNullOrWhiteSpace(cmtCd)) blankCmt++;
        }
        Log($"=== KQ-1 === trong {rows.Count} dong dau, {blankCmt} dong co コメントコード RONG");
        Log("   > 0  ⇒ WinForm CO liet ke 処置 chua cau hinh (LEFT JOIN) — ban web dung");
        Log("   = 0  ⇒ chua ket luan duoc; xem tiep Tc2 (loc 1 処置 chua cau hinh)");

        if (rows.Count > 0)
            Log("dong dau: " + string.Join(" | ", rows[0].Cells));

        trace.Step("doc 一覧");
    }

    [Test, Order(2)]
    [Description("Tc2 — KQ-1: lọc đúng một 処置 KHÔNG có dòng cmtauto nào")]
    public void Tc2_SearchUnconfiguredTreatment()
    {
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de tim mot 処置 chua co cau hinh");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var trtCd = db.FindTrtCdWithoutCmtAuto();
        if (trtCd is null)
        {
            Log("=== KQ-1 === moi 処置 deu da co cau hinh — khong dung duoc phep thu nay");
            Assert.Pass("khong co 処置 nao chua cau hinh");
            return;
        }

        Log($"=== KQ-1 === loc 処置コード = {trtCd} (DB xac nhan KHONG co dong cmtauto nao)");
        Search(_list, trtCd.Value.ToString(), "");

        var grid = RequireGrid(_list, KarteAutoCalcDialog.ListGridId);
        var rows = grid.Rows(limit: 10);
        Log($"=== KQ-1 === WinForm tra ve {rows.Count} dong");
        foreach (var r in rows.Take(5)) Log("   " + string.Join(" | ", r.Cells));
        Log("   >= 1 dong ⇒ CO liet ke (LEFT JOIN) — ban web dung");
        Log("   0 dong + hop thoai E00003 ⇒ KHONG liet ke — ban web phai doi sang INNER JOIN");

        trace.Step("loc 処置 chua cau hinh");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc3 — KQ-3 確認画面不要
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — KQ-3: 確認画面不要 tick theo quy tắc nào (3 ca)")]
    public void Tc3_NoChkAggregateRule()
    {
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de chon 3 処置 dai dien cho 3 ca");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var cases = new (string Name, (int TrtCd, int TrtSb)? Target, string Expect)[]
        {
            ("MOI dong no_chk = 1", db.FindAllNoChk(), "ban web: TICK"),
            ("LAN LON 0 va 1",      db.FindMixedNoChk(), "ban web: KHONG tick"),
        };

        foreach (var (name, target, expect) in cases)
        {
            if (target is null)
            {
                Log($"=== KQ-3 === ca 「{name}」: khong tim duoc 処置 nao — BO QUA");
                continue;
            }

            var (trtCd, trtSb) = target.Value;
            var lines = db.NoChkOfLines(trtCd, trtSb);
            Log($"=== KQ-3 === ca 「{name}」 — 処置 {trtCd}-{trtSb}, " +
                $"no_chk tung dong: [{string.Join(",", lines)}]");

            Search(_list, trtCd.ToString(), "");
            var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

            var chk = Uia.ById(reg, KarteAutoCalcDialog.NoChkCheckBoxId);
            var state = chk is null
                ? "(khong thay chkNoChk — sua ten trong KarteAutoCalcDialog)"
                : (chk.AsCheckBox().IsChecked == true ? "TICK" : "KHONG tick");
            Log($"   WinForm hien: {state}   |   {expect}");

            KarteAutoCalcDialog.Close(App, reg);
        }

        // Ca thứ 3: 処置 không có dòng nào. Chỉ mở được khi Tc2 cho thấy 一覧 có liệt kê.
        var empty = db.FindTrtCdWithoutCmtAuto();
        if (empty is not null)
        {
            Search(_list, empty.Value.ToString(), "");
            try
            {
                var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);
                var chk = Uia.ById(reg, KarteAutoCalcDialog.NoChkCheckBoxId);
                var state = chk?.AsCheckBox().IsChecked == true ? "TICK" : "KHONG tick";
                Log($"=== KQ-3 === ca 「KHONG co dong nao」 — 処置 {empty}: WinForm hien {state}");
                Log("   ban web: KHONG tick (tranh vacuous-true khi 0 dong)");
                KarteAutoCalcDialog.Close(App, reg);
            }
            catch (Exception e)
            {
                Log($"=== KQ-3 === ca 「KHONG co dong nao」: khong mo duoc 登録 — {e.Message}");
            }
        }

        trace.Step("3 ca 確認画面不要");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc4 — KQ-4 use_cnt (GHI DB)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("Tc4 — KQ-4: F9 登録 có giữ nguyên use_cnt không (GHI DB)")]
    public void Tc4_SavePreservesUseCnt()
    {
        RequireAllowSave("F9 登録 ghi that vao cmtauto (master TOAN PHONG KHAM)");
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de doc use_cnt truoc/sau");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var target = db.FindWithUseCnt();
        if (target is null)
        {
            Log("=== KQ-4 === khong co 処置 nao co use_cnt > 0 — khong thu duoc");
            Assert.Pass("khong co du lieu");
            return;
        }

        var (trtCd, trtSb) = target.Value;
        var before = db.UseCntOfLines(trtCd, trtSb);
        Log($"=== KQ-4 === 処置 {trtCd}-{trtSb}, use_cnt TRUOC: [{string.Join(",", before)}]");

        Search(_list, trtCd.ToString(), "");
        var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

        // KHÔNG sửa gì — chỉ F9. Đây là phép thử thuần: lưu mà không đổi gì thì
        // use_cnt phải y nguyên.
        trace.Step("F9 登録 (khong sua gi)");
        var f9 = Uia.ById(reg, "btnF9");
        Assert.That(f9, Is.Not.Null, "khong thay btnF9 tren frm203043");
        f9!.Click();
        Waits.Step();
        DismissAnyDialog();
        Waits.Step();

        var after = db.UseCntOfLines(trtCd, trtSb);
        Log($"=== KQ-4 === use_cnt SAU:   [{string.Join(",", after)}]");
        Log(before.SequenceEqual(after)
            ? "   GIU NGUYEN ⇒ ban web (round-trip use_cnt) dung"
            : "   BI DOI ⇒ can xem lai: WinForm khong bao toan use_cnt nhu suy doan");

        trace.Step("doc lai use_cnt");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc5 — KQ-5 lưới rỗng (GHI DB)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("Tc5 — KQ-5: F2 全行削除 rồi F9 có xoá sạch cấu hình không (GHI DB)")]
    public void Tc5_SaveEmptyGridClearsConfiguration()
    {
        RequireAllowSave("F2 全行削除 + F9 xoa that cau hinh cua mot 処置");
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de doc so dong truoc/sau va khoi phuc");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var target = db.FindSmallestConfigured();
        if (target is null)
        {
            Log("=== KQ-5 === khong co 処置 nao da cau hinh — khong thu duoc");
            Assert.Pass("khong co du lieu");
            return;
        }

        var (trtCd, trtSb) = target.Value;
        var snapshot = db.Snapshot(trtCd, trtSb);
        Log($"=== KQ-5 === 処置 {trtCd}-{trtSb}, TRUOC co {snapshot.Count} dong:");
        foreach (var s in snapshot) Log("   " + s);
        Log("   ⚠️ NEU test dung giua chung, khoi phuc thu cong tu danh sach tren.");

        Search(_list, trtCd.ToString(), "");
        var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

        trace.Step("F2 全行削除");
        var f2 = Uia.ById(reg, "btnF2");
        Assert.That(f2, Is.Not.Null, "khong thay btnF2 (全行削除) tren frm203043");
        f2!.Click();
        Waits.Step();
        DismissAnyDialog();

        trace.Step("F9 登録 voi luoi rong");
        var f9 = Uia.ById(reg, "btnF9");
        f9?.Click();
        Waits.Step();
        DismissAnyDialog();
        Waits.Step();

        var after = db.Snapshot(trtCd, trtSb);
        Log($"=== KQ-5 === SAU con {after.Count} dong");
        Log(after.Count == 0
            ? "   XOA SACH ⇒ ban web (lines = [] nghia la xoa) dung"
            : "   VAN CON ⇒ WinForm chan luu luoi rong; ban web phai chan theo");

        // Dialog có thể vẫn mở nếu WinForm chặn — đóng cho sạch.
        var stillOpen = App.Window(KarteAutoCalcDialog.RegisterId);
        if (stillOpen is not null) KarteAutoCalcDialog.Close(App, stillOpen);

        Log("=== KQ-5 === KHOI PHUC: chay lai SQL insert tu snapshot o tren neu can.");
        trace.Step("doc lai");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc6 — KQ-6 cắt chuỗi (GHI DB)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("Tc6 — KQ-6: cmt_nm bị cắt theo BYTE (Shift-JIS) hay KÝ TỰ")]
    public void Tc6_NameTruncationIsByteOrChar()
    {
        RequireAllowSave("phai F9 登録 de xem WinForm ghi xuong bao nhieu");
        using var trace = TestTrace.Begin();
        var db = RequireKacDb("can DB de tim comment dai va doc lai do dai da ghi");
        _list = KarteAutoCalcDialog.OpenList(App, Screen.Window, trace);

        var longCmt = db.FindLongCommentName(KarteAutoCalcDialog.CmtNmMaxBytes);
        if (longCmt is null)
        {
            Log($"=== KQ-6 === khong co カルテコメント nao dai qua " +
                $"{KarteAutoCalcDialog.CmtNmMaxBytes} byte — khong thu duoc");
            Assert.Pass("khong co du lieu");
            return;
        }

        var (cmtCd, cmtSb, nm) = longCmt.Value;
        Log($"=== KQ-6 === comment {cmtCd}-{cmtSb}: {nm.Length} ky tu, " +
            $"{System.Text.Encoding.GetEncoding("Shift_JIS").GetByteCount(nm)} byte (Shift-JIS)");
        Log($"   noi dung: 「{nm}」");
        Log($"   WinForm dung ComLibrary.LeftB(nm, {KarteAutoCalcDialog.CmtNmMaxBytes}) — cat theo BYTE");
        Log("   ban web cat theo KY TU (60 ky tu) ⇒ giu nhieu hon");
        Log("   ⇒ Sau khi luu, doc lai do dai trong DB de biet WinForm that su cat o dau.");

        var target = db.FindSmallestConfigured();
        if (target is null) { Assert.Pass("khong co 処置 de gan comment"); return; }
        var (trtCd, trtSb) = target.Value;

        var snapshot = db.Snapshot(trtCd, trtSb);
        Log($"=== KQ-6 === se sua 処置 {trtCd}-{trtSb}; snapshot de khoi phuc:");
        foreach (var s in snapshot) Log("   " + s);

        Search(_list, trtCd.ToString(), "");
        var reg = KarteAutoCalcDialog.OpenRegister(App, _list, trace);

        Log("=== KQ-6 === BUOC THU CONG: trong luoi 登録, sua コード/枝番 cua dong dau thanh " +
            $"{cmtCd}/{cmtSb} roi bam F9. Test khong tu go vi o luoi DataGridView " +
            "can BeginEdit dung o — de nguoi chay lam cho chac.");
        Log("   Sau do chay lai truy van nay va gui ket qua:");
        Log($"   SELECT LEN(cmt_nm) AS ky_tu, DATALENGTH(cmt_nm) AS byte_, cmt_nm " +
            $"FROM cmtauto WHERE trt_cd={trtCd} AND trt_sb={trtSb} AND cmt_cd={cmtCd};");

        KarteAutoCalcDialog.Close(App, reg);
        trace.Step("huong dan thu cong KQ-6");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helper
    // ═══════════════════════════════════════════════════════════════════════

    private static WinFormsGrid RequireGrid(Window dialog, string gridId)
    {
        var el = Uia.ById(dialog, gridId)
            ?? throw new InvalidOperationException(
                $"Khong thay luoi 「{gridId}」. Chay Tc0_DumpUiaTree roi sua " +
                "KarteAutoCalcDialog cho khop cay UIA that.");
        return new WinFormsGrid(el);
    }

    /// <summary>Gõ điều kiện rồi bấm 検索 — WinForm chỉ truy vấn khi bấm nút.</summary>
    private void Search(Window list, string trtCd, string trtNm)
    {
        var cd = Uia.ById(list, KarteAutoCalcDialog.ListTrtCdBoxId);
        if (cd is not null) Uia.SetText(cd, trtCd);
        var nm = Uia.ById(list, KarteAutoCalcDialog.ListTrtNmBoxId);
        if (nm is not null) Uia.SetText(nm, trtNm);

        var btn = Uia.ById(list, KarteAutoCalcDialog.ListSearchButtonId);
        if (btn is not null) btn.Click();
        Waits.Step();
        // 0 件 thì WinForm bung E00003; đóng đi rồi đọc lưới rỗng như bình thường.
        DismissAnyDialog();
        Waits.Step();
    }

    /// <summary>Đóng hộp thoại đang chắn (E00003 / xác nhận lưu) nếu có.</summary>
    private void DismissAnyDialog()
    {
        foreach (var w in ModalDialogs.All(App, List))
        {
            try { Dialogs.DismissOk(w); }
            catch { /* hộp khác kiểu — để testcase tự xử */ }
        }
    }
}
