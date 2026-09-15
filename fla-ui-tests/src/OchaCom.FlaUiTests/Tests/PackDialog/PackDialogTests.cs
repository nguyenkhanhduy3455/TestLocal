using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.PackDialog;

/// <summary>
/// 診療入力 — tab <b>パック</b> của side panel: chốt một pack phải bung
/// <c>frm203014 パック処置選択</c> với ĐÚNG các item, và ở các ca biên phải hiện ĐÚNG
/// thông báo thay vì mở hộp thoại.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// LUỒNG ĐANG ĐO
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   grdPack_CellDoubleClick (frm203002.cs:6771)
///     ├─ hFG1[51,Y] == "99" → MsgBox「当月以外の操作はできません」/「操作不可」 rồi RETURN
///     ├─ e.RowIndex &lt; 0    → return, KHÔNG mở gì
///     ├─ getFocusDt / getFocusBui / getFocusDis  → frm203014.ParamData
///     └─ showDialog(ID203014)
///          frm203014_Load (:110) → initProc → getViewData (:373)
///            └─ Rows.Count == 0 → this.Close() TRƯỚC rồi MsgBox
///                                 「算定可能な処置はありません。」/「処置パック」 (:122-124)
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÁC CA
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TCP0  (chỉ DB)  master pack có gì; nhánh nào có dữ liệu chạm tới
///   TCP1  double-click một dòng pack  → dialog mở, items ĐÚNG như master tính ra
///   TCP2  ô 選択№ + Enter             → CÙNG dialog, CÙNG items (hai đường, một handler)
///   TCP3  click header (RowIndex < 0) → KHÔNG mở gì, KHÔNG thông báo
///   TCP4  dòng của THÁNG KHÁC          → MsgBox「当月以外の操作はできません」, KHÔNG mở dialog
///   TCP5  pack mà mọi item bị chkSiga loại → MsgBox「算定可能な処置はありません。」
///   TCP6  ô 薬剤: 回数 = g_cnt và tên NỐI 用法
///   TCP7  ô 摘要コメント: 点数 0, và có mặt trên lưới
///   TCP8  ô dis_cd = 0 bị bỏ qua — số item khớp số ô THỰC SỰ nở ra
/// </code>
///
/// <para><b>TCP1 chốt, TCP2 chốt lần hai, TCP5..TCP8 đọc lại lưới của TCP1.</b> Mỗi lần
/// mở dialog tốn một vòng giao diện, nên các câu hỏi về NỘI DUNG dùng chung một lần mở.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// GHI DB
/// ═══════════════════════════════════════════════════════════════════════════════
/// <b>Luồng này KHÔNG chốt item nào xuống lưới 処置</b> — mọi ca đều đóng
/// <c>frm203014</c> bằng 「F10 戻る」. Vì thế nó KHÔNG cần cờ ghi, KHÔNG bấm F9 登録, và
/// KHÔNG đụng <c>TRNTRN</c>/<c>SIGA</c>.
///
/// <para>⚠️ <b>Một tác dụng phụ KHÔNG khôi phục:</b> mở pack làm app tăng
/// <c>PACMST.USE_CNT</c> (học thói quen dùng). Nó chỉ đổi THỨ TỰ lưới khi
/// <c>Ocha.xml</c> bật <c>IntelliPac</c> — không ảnh hưởng điểm số hay hoá đơn. Đó cũng
/// chính là lý do <see cref="PackTabFlow.FindPackRow"/> không bao giờ tìm theo số dòng.</para>
///
/// <para>TCP5 cần đặt 歯式 để ép <c>chkSiga</c> loại hết item ⇒ ca đó (và CHỈ ca đó) nằm
/// sau cờ <c>packDialog.allowSigaSetup</c>, có chụp — in ra — trả lại (F20).</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[CancelAfter(900_000)]
public sealed class PackDialogTests : SeededPatientTestBase
{
    private PackDb _db = null!;
    private SigaKonDb? _siga;
    private PackTabFlow _tab = null!;
    private PackSelectDialog _dialog = null!;

    private PackRow? _pack;
    private int _treInpFlg;

    /// <summary>Item của lưới dialog NGAY SAU cú mở của TCP1 — TCP5..TCP8 đọc lại nó.</summary>
    private IReadOnlyList<PackSelectDialog.Item> _items = [];
    private bool _opened;

    private SigaSnapshot? _sigaBefore;

    private int PacCd => Settings.PackDialog.PacCd;
    private string PacNm => Settings.PackDialog.PacNm;

    /// <summary>Thông báo khi con trỏ ở dòng ngoài 処置月 (frm203002.cs:6775).</summary>
    private const string OtherMonthMessage = "当月以外の操作はできません";

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    /// <summary>
    /// Bệnh nhân test do <see cref="SeededPatientTestBase"/> dựng; luồng này không seed
    /// thêm gì — pack đọc master chứ không đọc lịch sử bệnh nhân.
    ///
    /// <para>Ngoại lệ: TCP5 đặt <c>SIGA</c> để ép <c>chkSiga</c> loại hết item, nhưng nó
    /// làm việc đó GIỮA lượt chạy (phải mở lại màn hình) nên không nằm ở đây.</para>
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
    }

    [OneTimeSetUp]
    public void PackOneTimeSetUp()
    {
        var db = PackDb.CreateOrNull(Settings);
        if (db is null) IgnoreWithReason("Cần DB để đọc PACMST — " + (DbUnavailableReason ?? "db.enabled = false"));
        if (db!.ProbeError() is { } err) IgnoreWithReason($"không kết nối được SQL Server: {err}");
        _db = db;
        _siga = SigaKonDb.CreateOrNull(Settings, Settings.PackDialog.AllowSigaSetup);

        _pack = _db.ReadPack(PacCd);
        _treInpFlg = _db.ReadTreInpFlg();

        Log($"╔══ PACK ĐEM THỬ ══  {_pack?.ToString() ?? $"(PACMST không có PAC_CD = {PacCd})"}");
        foreach (var s in _pack?.Used ?? []) Log($"║ {s}");
        Log($"║ tre_inp_flg = {_treInpFlg} ⇒ lưới in " + (_treInpFlg == 1 ? "cct_nm (カルテ名称)" : "trt_nm (処置名称)"));
        Log("╚═══════════════════════════════════════════════");
    }

    [SetUp]
    public void PackSetUp()
    {
        _tab = new PackTabFlow(App, Screen, Settings);
        _dialog = new PackSelectDialog(App, Screen.Window);
    }

    [OneTimeTearDown]
    public void PackOneTimeTearDown()
    {
        try
        {
            if (_siga is { CanWrite: true } && _sigaBefore is not null)
            {
                _siga.EnsureSigaRow(PatNo);
                _siga.RestoreSiga(PatNo, _sigaBefore);
                Log("dọn: SIGA trả về nguyên trạng.");
            }
        }
        catch (Exception e) { Log($"dọn SIGA HỎNG: {e.Message} — dựng tay theo khối 「NGUYÊN TRẠNG」."); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCP0 — chỉ hỏi DB. Nhánh nào của getViewData có dữ liệu chạm tới?
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TCP0 (chỉ DB) — master pack có gì, và nhánh nào của frm203014 có dữ liệu chạm tới")]
    public void TCP0_Master_Decides_Which_Branches_Are_Reachable()
    {
        var total = _db.CountPacks();
        var withKarte = _db.CountPacksWithSlotInRange(PackDb.KarteMin, PackDb.KarteMax);
        var withReceipt = _db.CountPacksWithSlotInRange(PackDb.ReceiptMin, PackDb.ReceiptMax);
        var withDrug = _db.CountPacksWithSlotInRange(PackDb.DrugMin, PackDb.DrugMax);
        var withCnt99 = _db.CountPacksWithCnt(99);
        var withSikan = _db.CountPacksWithSlot(116, 7);
        var withAsterisk = _db.CountPacksWithAsteriskKarteComment();

        Log($"PACMST: {total} pack.");
        Log($"  ô カルテコメント (7000-8999)  : {withKarte} pack  → nhánh getMstCmt2DataPac (frm203014.cs:420)");
        Log($"  ô 摘要コメント   (700-899)    : {withReceipt} pack  → nhánh getMstCmtData (:431)");
        Log($"  ô 薬剤          (600-699)    : {withDrug} pack  → 回数 = g_cnt, tên nối 用法 (:511, :532)");
        Log($"  ô CNT = 99                   : {withCnt99} pack  → 回数 ép về 0 (:521)");
        Log($"  ô 116/7 歯管                 : {withSikan} pack  → đổi sang 116/6 khi 初診月 (:441-454)");
        Log($"      cửa sổ ngày của nhánh đó   : [2020-04-01, {PackDb.MedicalFeeRevision202606.AddDays(-1):yyyy-MM-dd}]" +
            $" · 診療日 test = {TrtDate:yyyy-MM-dd} ⇒ " +
            (TrtDate < PackDb.MedicalFeeRevision202606 ? "CÒN hiệu lực" : "ĐÃ hết hiệu lực"));
        Log($"  ô カルテコメント còn dấu *    : {withAsterisk} pack  → bật txtValue trong chkPacData (:640-655)");
        Log("các pack đang có:\n  " + string.Join("\n  ",
            _db.ListPacks(40).Select(p => $"{p.PacCd}/{p.PacSb} 「{p.PacNm}」")));

        Assert.Multiple(() =>
        {
            Assert.That(_pack, Is.Not.Null,
                $"PACMST không có PAC_CD = {PacCd} ⇒ không có gì để chốt. Đổi packDialog.pacCd; " +
                "danh sách pack đã in ở trên.");

            Assert.That(_pack?.Used ?? [], Is.Not.Empty,
                $"Pack {PacCd} không có ô nào khác 0 ⇒ dialog sẽ rỗng và TCP1 đo nhầm ca của TCP5.");

            Assert.That(withDrug, Is.GreaterThan(0),
                "Không pack nào có ô 薬剤 ⇒ TCP6 (回数 = g_cnt, tên nối 用法) không đo được.");

            Assert.That(withReceipt, Is.GreaterThan(0),
                "Không pack nào có ô 摘要コメント ⇒ TCP7 không đo được.");
        });

        // ⛔ Hai assert dưới đây CỐ Ý khẳng định 「nhánh này là CODE CHẾT trên master hiện
        //    tại」. Đỏ ở đây KHÔNG phải app hỏng — nó nghĩa là master vừa đổi và nhánh ấy đã
        //    quan sát được, nên phải viết thêm ca UI cho nó.
        Assert.Multiple(() =>
        {
            Assert.That(withKarte, Is.Zero,
                $"MASTER ĐÃ ĐỔI: giờ có {withKarte} pack mang ô カルテコメント (7000-8999). Trước đây " +
                "không pack nào có ⇒ cả nhánh getMstCmt2DataPac (frm203014.cs:420) LẪN nhánh " +
                "chkPacData bật txtValue cho dấu `*` (:640-655) đều là code chết. Giờ chúng chạy " +
                "được ⇒ thêm ca UI: một ô có thể nở ra NHIỀU dòng, và dấu `*` chặn F9 không cho đóng.");

            Assert.That(withCnt99, Is.Zero,
                $"MASTER ĐÃ ĐỔI: giờ có {withCnt99} pack mang ô CNT = 99 ⇒ nhánh ép 回数 về 0 " +
                "(frm203014.cs:521) đã quan sát được. Thêm ca UI cho nó.");

            // 歯管 116/7 → 116/6: master CÓ pack mang ô đó (đo 2026-09-14: 2 pack), nhưng
            // nhánh còn bị chặn bởi NGÀY — chỉ chạy trong [2020-04-01, 2026-05-31]
            // (frm203014.cs:440). Vì thế điều kiện đúng để assert là NGÀY, không phải pack.
            var sikanWindowOpen = TrtDate < PackDb.MedicalFeeRevision202606;
            Assert.That(sikanWindowOpen && withSikan > 0, Is.False,
                $"Nhánh 歯管 116/7 → 116/6 ĐANG SỐNG: 診療日 {TrtDate:yyyy-MM-dd} nằm trong " +
                $"[2020-04-01, {PackDb.MedicalFeeRevision202606.AddDays(-1):yyyy-MM-dd}] và có " +
                $"{withSikan} pack mang ô 116/7 (frm203014.cs:440-454) ⇒ phải có ca UI đo nó: " +
                "chốt pack đó trong THÁNG có 初診 thì item phải hiện ra là 116/6 chứ không phải 116/7.");
        });

        Log("=== KQ-TCP0 === " +
            $"pack={total} karte={withKarte} receipt={withReceipt} drug={withDrug} " +
            $"cnt99={withCnt99} sikan117={withSikan} asterisk={withAsterisk}");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCP1 — double-click mở dialog, items đúng
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCP1 — double-click một dòng pack phải bung frm203014 với đúng các item")]
    public void TCP1_DoubleClick_Opens_Dialog_With_Expected_Items()
    {
        using var trace = TestTrace.Begin();
        RequirePack();

        Assert.That(_tab.OpenTab(), Is.True,
            "Không mở được tab パック — kiểm locators.packTabItem (mặc định 「パック」). " +
            "Cây UIA của side panel:\n  " + _tab.Describe());
        trace.Shot("tab-pack-da-mo");

        var row = _tab.FindPackRow(PacCd, PacNm);
        Assert.That(row, Is.Not.Null,
            $"Không thấy dòng pack {PacCd} 「{PacNm}」 trên lưới.\n" +
            "  ⚠️ Lưới chỉ phơi ra dòng ĐANG NHÌN THẤY (F10) và thứ tự phụ thuộc IntelliPac/USE_CNT " +
            "— pack có thể đang nằm ngoài tầm nhìn chứ không phải không tồn tại.\n" +
            "  lưới đang có:\n    " + _tab.Describe());

        _tab.CommitByDoubleClick(row!, trace);

        var dialog = _dialog.WaitOpen();
        Assert.That(dialog, Is.Not.Null,
            $"Double-click pack {PacCd} mà {PackSelectDialog.FormId} KHÔNG bung ra.\n" +
            "  WinForm: grdPack_CellDoubleClick → showDialog(ID203014) (frm203002.cs:6805).\n" +
            "  ĐỎ Ở ĐÂY nghĩa là gì: (a) dòng đang đứng ở lưới 処置 thuộc THÁNG KHÁC ⇒ app chặn " +
            "bằng MsgBox「当月以外の操作はできません」 (đó là ca TCP4, không phải ca này); " +
            "(b) hoặc pack rỗng nên form tự đóng ngay (ca TCP5). Đọc hộp thoại đang mở: " +
            Dialogs.Open(App.Automation, App.ProcessId).Count + " hộp.");
        trace.Shot("frm203014-da-mo");

        _items = _dialog.Items(dialog!);
        _opened = true;
        Log($"dialog có {_items.Count} item (dòng nhìn thấy):\n    " + PackSelectDialog.Describe(_items));

        Assert.That(_items, Is.Not.Empty,
            $"frm203014 mở nhưng lưới item RỖNG. Pack {PacCd} có {_pack!.Used.Count} ô mang mã — " +
            "nếu tất cả đều bị bốn cổng lọc loại thì WinForm đã đóng form và hiện thông báo " +
            "(ca TCP5), chứ không để lưới rỗng như thế này.");

        // Mỗi item phải truy được về một ô của pack — không có dòng nào từ trên trời rơi xuống.
        var slotCodes = _pack!.Used.Select(s => s.Cd).ToHashSet();
        Assert.Multiple(() =>
        {
            foreach (var item in _items)
            {
                Assert.That(item.CdNum, Is.Not.Null, $"Item 「{item}」 không đọc được mã.");
                if (item.CdNum is not { } cd) continue;
                Assert.That(slotCodes.Contains(cd), Is.True,
                    $"Item 「{item}」 mang mã {cd} KHÔNG thuộc ô nào của pack {PacCd}.\n" +
                    "  Các ô của pack: [" + string.Join(" / ", _pack.Used.Select(s => s.ToString())) + "]\n" +
                    "  ⚠️ Ngoại lệ hợp lệ DUY NHẤT: ô 116/7 được đổi sang 116/6 và ô 252/0,252/2 " +
                    "đổi sang 252/20,252/21 (frm203014.cs:441-467) — nhưng mã CHÍNH thì không đổi.");
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCP2 — ô 選択№ + Enter: cùng handler, cùng kết quả
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCP2 — gõ số vào ô 選択№ rồi Enter phải bung CÙNG dialog với CÙNG các item")]
    public void TCP2_SelNo_Enter_Opens_The_Same_Dialog()
    {
        using var trace = TestTrace.Begin();
        RequireOpened();

        // TCP1 để lại dialog đang mở — đóng KHÔNG CHỐT rồi mới thử đường thứ hai.
        CloseDialogIfOpen(trace);

        Assert.That(_tab.OpenTab(), Is.True, "Không mở lại được tab パック sau khi đóng dialog.");
        var row = _tab.FindPackRow(PacCd, PacNm);
        Assert.That(row, Is.Not.Null, "Không thấy lại dòng pack:\n    " + _tab.Describe());

        Assert.That(_tab.CommitBySelNo(row!, trace), Is.True,
            "Không gõ được vào ô 選択№ — kiểm locators.packSelNo (mặc định 「txtPackSentakuNo」).");

        var dialog = _dialog.WaitOpen();
        Assert.That(dialog, Is.Not.Null,
            "Gõ số vào ô 選択№ rồi Enter mà frm203014 KHÔNG bung ra.\n" +
            "  WinForm: txtPackSentakuNo_KeyDown → grdPack_KeyDown → grdPack_CellDoubleClick " +
            "(frm203002.cs:6844-6848) — CÙNG handler với double-click, nên hai đường phải cho " +
            "CÙNG kết quả. Một đường ăn mà đường kia không là lệch THẬT.");
        trace.Shot("frm203014-mo-bang-so-chon");

        var items = _dialog.Items(dialog!);
        Log($"dialog (đường ô 選択№) có {items.Count} item:\n    " + PackSelectDialog.Describe(items));

        Assert.That(items.Select(i => i.Name).ToList(), Is.EqualTo(_items.Select(i => i.Name).ToList()),
            "Hai đường chốt cho ra DANH SÁCH ITEM KHÁC NHAU, trong khi chúng đổ về cùng một " +
            "handler (frm203002.cs:6848).\n" +
            "  double-click : " + PackSelectDialog.Describe(_items) + "\n" +
            "  ô 選択№      : " + PackSelectDialog.Describe(items));

        CloseDialogIfOpen(trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCP3 — click header: KHÔNG mở gì
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCP3 — click vào header lưới pack (RowIndex < 0) phải KHÔNG mở gì, KHÔNG thông báo")]
    public void TCP3_Header_Click_Opens_Nothing()
    {
        using var trace = TestTrace.Begin();
        RequirePack();
        CloseDialogIfOpen(trace);

        Assert.That(_tab.OpenTab(), Is.True, "Không mở được tab パック.");
        if (!_tab.ClickHeader(trace))
            Assert.Ignore("Không tìm thấy header của grdPack trong cây UIA — không dựng được ca này.");

        // Deadline NGẮN có chủ ý (F2): đang đo thứ mình tin là KHÔNG tồn tại.
        var dialog = _dialog.WaitOpen(TimeSpan.FromSeconds(6));
        trace.Shot("sau-khi-click-header");

        Assert.That(dialog, Is.Null,
            "Click vào header (e.RowIndex < 0) mà app VẪN mở frm203014 — WinForm return ngay ở " +
            "frm203002.cs:6778-6781.");

        var boxes = Dialogs.Open(App.Automation, App.ProcessId);
        Assert.That(boxes, Is.Empty,
            "Click header không được sinh hộp thoại nào, nhưng đang có: [" +
            string.Join(" / ", boxes.Select(Dialogs.TextOf)) + "]");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCP4 — dòng của THÁNG KHÁC: thông báo, KHÔNG mở dialog
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TCP4 — con trỏ đang ở dòng tháng khác thì chốt pack phải hiện MsgBox, KHÔNG mở dialog")]
    public void TCP4_Row_From_Another_Month_Shows_Message_Instead_Of_Dialog()
    {
        using var trace = TestTrace.Begin();
        RequirePack();
        CloseDialogIfOpen(trace);

        // Cột ẩn 51 mang "99" cho dòng thuộc THÁNG KHÁC (frm203002.cs:6773). Cột đó không
        // ra tới UIA, nên mốc duy nhất nhìn thấy được là dòng 合計 của tháng trước — lưới
        // grdRegi mở CẢ THÁNG và đứng đầu là khối tổng kết tháng liền trước.
        var grid = new TreatmentGridOps(Screen);
        var rows = grid.Snapshot(60);
        var otherMonth = rows.FirstOrDefault(r => Txt.Int(r.Day) is null && Txt.Has(r.Bui, "合計"));
        if (otherMonth is null)
            Assert.Ignore(
                "Lưới 処置 không có khối 「R xx年xx月 合計」 của tháng khác.\n" +
                "  ⚠️ Đây là hệ quả TRỰC TIẾP của việc dùng bệnh nhân DỰNG MỚI: hồ sơ 処置 " +
                "trống hoàn toàn nên không có tháng nào trước tháng test. Muốn dựng ca này thì " +
                "phải seed một dòng TRNTRN ở THÁNG TRƯỚC rồi mới mở màn — chưa làm, ghi lại ở " +
                "đây để không ai tưởng app hỏng.\n" +
                "  lưới đang có:\n  " + string.Join("\n  ", rows.Take(6).Select(r => r.ToString())));

        trace.Step($"dat con tro len dong thang khac 「{otherMonth}」");
        grid.FocusCell(otherMonth, Screens.RegiGrid.Col.Ryo);

        Assert.That(_tab.OpenTab(), Is.True, "Không mở được tab パック.");
        var row = _tab.FindPackRow(PacCd, PacNm);
        Assert.That(row, Is.Not.Null, "Không thấy dòng pack:\n    " + _tab.Describe());

        _tab.CommitByDoubleClick(row!, trace);

        // Hộp thoại Win32 — bắt bằng Dialogs, KHÔNG phải UIA thường (F17).
        var box = Waits.TryFor(
            () => Dialogs.Find(App.Automation, App.ProcessId, OtherMonthMessage),
            TimeSpan.FromSeconds(8));
        trace.Shot("sau-khi-chot-pack-tren-dong-thang-khac");

        Assert.That(box, Is.Not.Null,
            $"Chốt pack khi con trỏ ở dòng THÁNG KHÁC phải hiện 「{OtherMonthMessage}」 " +
            "(frm203002.cs:6773-6777, title 「操作不可」) — không thấy hộp thoại nào như vậy.\n" +
            "  hộp thoại đang mở: [" + string.Join(" / ",
                Dialogs.Open(App.Automation, App.ProcessId).Select(Dialogs.TextOf)) + "]\n" +
            "  ĐỎ Ở ĐÂY nghĩa là gì: (a) app KHÔNG chặn nữa — lệch thật; (b) hoặc dòng vừa đặt " +
            "con trỏ lên KHÔNG mang cột ẩn 51 = \"99\" (harness chọn nhầm dòng) — đọc ảnh chụp.");

        // Và tuyệt đối KHÔNG được mở dialog: app `return` ngay sau MsgBox.
        Assert.That(_dialog.Open(), Is.Null,
            $"App vừa hiện 「{OtherMonthMessage}」 mà VẪN mở {PackSelectDialog.FormId} — " +
            "WinForm return ngay sau MsgBox (frm203002.cs:6776).");

        if (box is not null) Dialogs.ClickButton(box, "OK", "はい", "Yes");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCP5 — mọi item bị loại: Close() TRƯỚC rồi MsgBox
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("TCP5 — pack mà mọi item bị chkSiga loại: form tự đóng rồi hiện 「算定可能な処置はありません。」")]
    public void TCP5_All_Items_Filtered_Out_Shows_Message()
    {
        using var trace = TestTrace.Begin();
        if (!Settings.PackDialog.AllowSigaSetup)
            Assert.Ignore("Cần packDialog.allowSigaSetup = true (hoặc OCHA_PACK_ALLOW_SIGA_SETUP=1) — " +
                          "ca này đặt 歯式 để ép chkSiga loại hết item, rồi trả lại nguyên trạng.");
        if (_siga is null || !_siga.CanWrite)
            Assert.Ignore("Không dựng được SigaKonDb có quyền ghi.");

        var emptyPack = _db.ReadPack(Settings.PackDialog.EmptyPacCd);
        if (emptyPack is null)
            Assert.Ignore($"PACMST không có PAC_CD = {Settings.PackDialog.EmptyPacCd}.");

        CloseDialogIfOpen(trace);

        // F20 — chụp nguyên trạng, IN RA, rồi mới đặt mốc.
        _siga.EnsureSigaRow(PatNo);
        _sigaBefore = _siga.ReadSiga(PatNo);
        Log($"nguyên trạng SIGA (chụp TRƯỚC khi đặt mốc): {_sigaBefore}");

        // Mọi răng 欠損 ⇒ chkSiga loại sạch mã có kesson = 9 — đúng trường hợp 171/0
        // (感染根処) của pack mặc định. frm203014.cs:479-489.
        _siga.ResetSigaToMissing(PatNo);
        Log($"đặt mốc: mọi se* = {SigaKonDb.SeMissing} (欠損歯) ⇒ chkSiga loại hết item.");

        // ⚠️ 歯式 được nạp MỘT LẦN lúc mở 診療入力, nên phải mở lại màn hình thì app mới thấy.
        ReopenTreatmentScreen();
        _tab = new PackTabFlow(App, Screen, Settings);
        _dialog = new PackSelectDialog(App, Screen.Window);

        Assert.That(_tab.OpenTab(), Is.True, "Không mở được tab パック sau khi mở lại màn hình.");
        var row = _tab.FindPackRow(emptyPack.PacCd, emptyPack.PacNm);
        Assert.That(row, Is.Not.Null,
            $"Không thấy dòng pack {emptyPack.PacCd} 「{emptyPack.PacNm}」:\n    " + _tab.Describe());

        _tab.CommitByDoubleClick(row!, trace);

        var box = Waits.TryFor(
            () => Dialogs.Find(App.Automation, App.ProcessId, PackSelectDialog.EmptyMessage),
            TimeSpan.FromSeconds(10));
        trace.Shot("sau-khi-chot-pack-rong");

        Assert.That(box, Is.Not.Null,
            $"Mọi item của pack {emptyPack.PacCd} bị chkSiga loại nên phải hiện " +
            $"「{PackSelectDialog.EmptyMessage}。」 (title 「{PackSelectDialog.EmptyMessageCaption}」, " +
            "frm203014.cs:122-124).\n" +
            "  hộp thoại đang mở: [" + string.Join(" / ",
                Dialogs.Open(App.Automation, App.ProcessId).Select(Dialogs.TextOf)) + "]\n" +
            "  ĐỎ Ở ĐÂY nghĩa là gì: (a) chkSiga KHÔNG loại item (kiểm cột kesson của mã trong " +
            $"pack {emptyPack.PacCd} — chỉ mã có kesson = 9 mới bị 欠損歯 loại); (b) hoặc 歯式 chưa " +
            "được app nạp lại — màn hình phải mở LẠI sau khi ghi SIGA.");

        // ⚠️ Form ĐÃ ĐÓNG trước khi thông báo hiện (Close() đứng TRƯỚC MsgBox) — đừng đi tìm
        //    「form còn mở không」 để kết luận.
        Assert.That(_dialog.Open(), Is.Null,
            $"{PackSelectDialog.FormId} phải TỰ ĐÓNG trước khi thông báo hiện ra — " +
            "frm203014.cs:122 gọi this.Close() rồi mới MsgBox ở :124.");

        if (box is not null) Dialogs.ClickButton(box, "OK", "はい", "Yes");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCP6/TCP7/TCP8 — nội dung item, đọc lại lưới của TCP1
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("TCP6 — ô 薬剤: tên phải NỐI 用法 của MST_MED, 回数 lấy g_cnt")]
    public void TCP6_Drug_Slot_Appends_Usage_To_Name()
    {
        RequireOpened();

        var drugSlots = _pack!.Used.Where(s => s.IsDrug).ToList();
        if (drugSlots.Count == 0)
            Assert.Ignore($"Pack {PacCd} không có ô 薬剤 — đổi packDialog.pacCd sang pack có mã 600-699 " +
                          "(TCP0 in số pack có ô loại này).");

        Assert.Multiple(() =>
        {
            foreach (var slot in drugSlots)
            {
                var usage = _db.FindDrugUsage(slot.Cd, slot.Sb);
                if (string.IsNullOrWhiteSpace(usage))
                {
                    Log($"ô {slot.Cd}/{slot.Sb}: MST_MED không có 用法 ⇒ WinForm KHÔNG nối gì (frm203014.cs:534).");
                    continue;
                }

                var item = _items.FirstOrDefault(i => i.CdNum == slot.Cd && i.SbNum == slot.Sb);
                Assert.That(item, Is.Not.Null,
                    $"Không thấy item của ô 薬剤 {slot.Cd}/{slot.Sb} trên lưới dialog.\n    " +
                    PackSelectDialog.Describe(_items));
                if (item is null) continue;

                Assert.That(PackSelectDialog.Norm(item.Name), Does.Contain(PackSelectDialog.Norm(usage)),
                    $"Tên item 薬剤 「{item.Name}」 phải NỐI 用法 「{usage}」 vào sau tên 処置 " +
                    "(frm203014.cs:532-537: `nm += \" \" + usage`).");
            }
        });
    }

    [Test, Order(7)]
    [Description("TCP7 — ô 摘要コメント: hiện trên lưới với 点数 0")]
    public void TCP7_Receipt_Comment_Slot_Shows_With_Zero_Score()
    {
        RequireOpened();

        var cmtSlots = _pack!.Used.Where(s => s.IsReceiptComment).ToList();
        if (cmtSlots.Count == 0)
            Assert.Ignore($"Pack {PacCd} không có ô 摘要コメント (700-899) — đổi packDialog.pacCd.");

        Assert.Multiple(() =>
        {
            foreach (var slot in cmtSlots)
            {
                var text = _db.FindReceiptComment(slot.Cd, slot.Sb);
                if (string.IsNullOrWhiteSpace(text))
                {
                    Log($"ô {slot.Cd}/{slot.Sb}: MST_CMT không có dòng ⇒ WinForm bỏ qua ô này " +
                        "(frm203014.cs:432 `cmtData != null`). Không assert.");
                    continue;
                }

                var item = _items.FirstOrDefault(i => i.CdNum == slot.Cd && i.SbNum == slot.Sb);
                Assert.That(item, Is.Not.Null,
                    $"Không thấy item 摘要コメント {slot.Cd}/{slot.Sb} 「{text}」 trên lưới.\n    " +
                    PackSelectDialog.Describe(_items));
                if (item is null) continue;

                Assert.That(item.ScoreNum, Is.EqualTo(0),
                    $"Item 摘要コメント 「{item.Name}」 phải mang 点数 = 0 — setTable nhận cứng 0 cho " +
                    "nhánh comment (frm203014.cs:434).");
            }
        });
    }

    [Test, Order(8)]
    [Description("TCP8 — ô dis_cd = 0 bị bỏ qua: không item nào mang mã 0")]
    public void TCP8_Empty_Slots_Are_Skipped()
    {
        RequireOpened();

        var emptySlots = _pack!.Slots.Count(s => s.Empty);
        Log($"pack {PacCd}: {emptySlots}/{_pack.Slots.Count} ô rỗng (dis_cd = 0) ⇒ phải bị `continue` " +
            "ở frm203014.cs:415-417.");

        Assert.That(_items.Any(i => i.CdNum == 0), Is.False,
            "Lưới dialog có item mang mã 0 — ô rỗng phải bị bỏ qua hẳn.\n    " +
            PackSelectDialog.Describe(_items));
    }

    // ── Nội bộ ───────────────────────────────────────────────────────────────

    private void RequirePack()
    {
        if (_pack is null) Assert.Ignore($"PACMST không có PAC_CD = {PacCd} — TCP0 đã nói rõ.");
    }

    /// <summary>
    /// TCP2/TCP6/TCP7/TCP8 đọc lại chính lưới mà TCP1 mở ra. Mỗi lần mở dialog tốn một
    /// vòng giao diện; chạy riêng chúng là vô nghĩa.
    /// </summary>
    private void RequireOpened()
    {
        if (!_opened || _items.Count == 0)
            Assert.Ignore("TCP1 chưa mở được dialog — các TC sau đọc lại chính lưới đó. Sửa TCP1 trước.");
    }

    /// <summary>
    /// Đóng <c>frm203014</c> mà KHÔNG chốt item nào xuống lưới 処置.
    ///
    /// <para>⚠️ TUYỆT ĐỐI không gửi Escape: ở màn này Escape ánh xạ vào <c>btnF9_Click</c>
    /// tức 確定 (frm203014.cs:152-156). Phải bấm nút 「F10 戻る」.</para>
    /// </summary>
    private void CloseDialogIfOpen(TestTrace trace)
    {
        var open = _dialog.Open();
        if (open is null) return;
        if (!_dialog.CloseWithoutCommit(open, trace))
            trace.Note("KHONG dong duoc frm203014 bang 「戻る」 — cac ca sau se chay tren man bi chan.");
    }
}
