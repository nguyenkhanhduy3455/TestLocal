using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.CodeEntryFailPaths;

/// <summary>
/// §B2, lỗ hổng cuối — mã <b>50 (笑気/IS)</b> khi <c>INPCONFIG.IS_AUTO_FLG = 0</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHỐT TỪ SOURCE TRƯỚC (F1)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>frm203016</c> ở chế độ <c>_flg50</c>:
/// <code>
///   if (_flg50) {
///       if (_inpConfig.is_auto_flg == 0) return;   // ← RETURN SỚM (frm203016.cs:407)
///       editInputArea(true); editInputItem(true);  // ô nhập lít N2O / O2
///       ...
///   }
/// </code>
/// Cờ <c>0</c> ⇒ <b>không hiện ô nhập lít</b>, nên <c>_is2[0]</c>/<c>_is2[1]</c> giữ rỗng ⇒
/// <c>setIS</c> bỏ qua cả khối N2O (<c>_flg50 &amp;&amp; _is2[0] != ""</c>, :831) lẫn khối O2
/// (:857) ⇒ <b>không</b> dòng IS nào được <c>AddRow()</c>, và con trỏ <b>không</b> bị dời.
///
/// <para>Nhưng <c>btnF9_Click</c> vẫn chạy: <c>chkInputArea()</c> chỉ chặn 179/5, 202/x,
/// 203/x, 17 — <b>mã 50 KHÔNG nằm trong đó</b> ⇒ trả <c>true</c> ⇒ <c>setPacData</c> +
/// <c>fixProc</c>, mà <c>fixProc</c> gọi <c>frmTrtSel_Let_Trt_Data</c> — tức đường ghi của
/// 処置選択 bình thường.</para>
///
/// <para>Rồi <c>GetTrtmasCod</c> vẫn <c>return functionReturnValue</c> = <b>false</b>
/// (modMain.cs:542-552 không bao giờ gán) ⇒ caller chạy
/// <c>hFG1.CurrentCell.Value = ""</c>.</para>
///
/// <para><b>Câu hỏi đo:</b> với cờ 0, dòng nào xuống lưới, và ô 点 nào bị xoá — vẫn là dòng
/// gốc như khi cờ = 1, hay khác? Khác biệt then chốt: cờ 1 thì <c>setIS</c> <c>AddRow()</c>
/// hai lần và DỜI con trỏ; cờ 0 thì không.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐỔI CẤU HÌNH — KHÔNG PHẢI SEED DỮ LIỆU
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>INPCONFIG</c> chỉ có <b>MỘT</b> dòng, áp cho toàn app. Cờ riêng
/// <c>codeEntryFail.allowConfigChange</c> (mặc định tắt), chụp/in/trả lại và <b>đọc lại để
/// khẳng định</b> ở <c>OneTimeTearDown</c>. Xem <see cref="InpConfigDb"/>.
/// </summary>
[TestFixture]
[CancelAfter(900_000)]
public sealed class IsAutoOffTests : UiTestBase
{
    private InpConfigDb? _cfg;
    private int? _savedFlag;
    private SigaToothFlow _flow = null!;

    private static void Log(string l) => TestContext.Out.WriteLine(l);

    /// <summary>Ca này ĐANG ĐO chuỗi hộp thoại — không để watcher trả lời hộ (F19).</summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason() =>
        Settings.CodeEntryFail.AllowConfigChange
            ? null
            : "Fixture này ĐỔI CẤU HÌNH PHÒNG KHÁM (INPCONFIG.IS_AUTO_FLG → 0) rồi trả lại — " +
              "bật codeEntryFail.allowConfigChange = true trong testsettings.local.json. " +
              "INPCONFIG chỉ có MỘT dòng và áp cho toàn app, nên cờ này cố ý tách khỏi mọi " +
              "cờ allowSeed khác.";

    protected override void PrepareDataBeforeApp()
    {
        _cfg = InpConfigDb.CreateOrNull(Settings);
        if (_cfg is null) Assert.Ignore("Cần db.enabled = true + connectionString.");
        if (_cfg!.ProbeError() is { } err)
            Assert.Ignore($"không kết nối được SQL Server: {err} (cổng 1434 còn chạy không?)");

        // ── ① chụp nguyên trạng, IN RA, TRƯỚC khi đổi (F20) ─────────────────
        _savedFlag = _cfg.IsAutoFlg();
        Log($"=== NGUYÊN TRẠNG === INPCONFIG.IS_AUTO_FLG = {_savedFlag?.ToString() ?? "NULL"}");
        Log($"⚠️ Nếu lượt chạy đứt giữa chừng, trả lại bằng tay: " +
            $"UPDATE INPCONFIG SET IS_AUTO_FLG = {_savedFlag?.ToString() ?? "1"}");

        Assert.That(_savedFlag, Is.Not.Null, "INPCONFIG rỗng — không đọc được IS_AUTO_FLG.");

        // ── ② đổi, TRƯỚC KHI APP MỞ (InpConfig nạp lúc mở màn) ──────────────
        var n = _cfg.SetIsAutoFlg(0);
        var now = _cfg.IsAutoFlg();
        Log($"=== ĐỔI === IS_AUTO_FLG → 0 ({n} dòng); đọc lại = {now}");
        Assert.That(now, Is.EqualTo(0), "Đổi IS_AUTO_FLG không ăn ⇒ ca đo sẽ chạy với cờ CŨ.");
    }

    [OneTimeTearDown]
    public void RestoreConfig()
    {
        if (_cfg is null || _savedFlag is null) return;
        try
        {
            _cfg.SetIsAutoFlg(_savedFlag.Value);
            var back = _cfg.IsAutoFlg();
            Log($"=== TRẢ LẠI === IS_AUTO_FLG = {back} (nguyên trạng {_savedFlag})");
            if (back != _savedFlag)
                Log($"⛔ TRẢ LẠI HỎNG — chạy tay NGAY: " +
                    $"UPDATE INPCONFIG SET IS_AUTO_FLG = {_savedFlag}");
        }
        catch (Exception e)
        {
            Log($"⛔ TRẢ LẠI HỎNG: {e.Message} — chạy tay NGAY: " +
                $"UPDATE INPCONFIG SET IS_AUTO_FLG = {_savedFlag}");
        }
    }

    [SetUp]
    public void Init() => _flow = new SigaToothFlow(App, Screen);

    [Test]
    [Description("TCF_30 — mã 50 với IS_AUTO_FLG = 0: không có ô nhập lít; dòng nào xuống lưới, ô 点 nào bị xoá")]
    public void TCF_30_IsCode50_WithAutoFlagOff()
    {
        using var trace = TestTrace.Begin();

        var day = TrtDate.Day;
        new CmtPackOps(_flow).ScrollToLastRowOfDay(day, trace);
        var row = _flow.Grid.Snapshot(200)
            .LastOrDefault(r => Txt.Int(r.Day) == day && Txt.Int(r.Ten) is > 0);
        Assert.That(row, Is.Not.Null,
            $"Ngày {day} không có dòng nào mang 点数 > 0 ⇒ không dựng được vế 「dòng đã có 点数」.");

        var tenBefore = row!.Ten;
        var ryo = row.Ryo;
        Log($"=== DÒNG ĐEM THỬ === 「{row}」 · 点 TRƯỚC = 「{tenBefore}」");

        Assert.That(_flow.EnsureCodeMode(), Is.True,
            $"Không đưa được ô 点 về コードモード — đang là 「{_flow.InpMode()}」 ⇒ HARNESS hỏng.");

        trace.Do($"go {CodeEntryFailTests.IsCode} vao o 点 cua dong 「{row}」 roi Enter", () =>
        {
            _flow.Grid.FocusCell(row, RegiGrid.Col.Ten);
            if (!_flow.Grid.IsEditing()) _flow.Grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _flow.Grid.Type(CodeEntryFailTests.IsCode.ToString());
            _flow.Grid.Press(VirtualKeyShort.RETURN);
        });

        var dlg = Waits.TryFor(_flow.Picker, TimeSpan.FromSeconds(15));
        Assert.That(dlg, Is.Not.Null,
            $"Gõ {CodeEntryFailTests.IsCode} mà frm203016 KHÔNG bung. Hộp thoại: " +
            _flow.DescribeDialogs());
        trace.Shot("frm203016-IS-AUTO-OFF");
        Log($"frm203016 có {_flow.PickerRows(dlg!).Count} dòng: " +
            string.Join(" · ", _flow.PickerRows(dlg!).Select(p => p.ToString())));

        // ── MỐC TRỰC TIẾP của cú return sớm: KHÔNG có ô nhập lít ────────────
        var n2oBox = Uia.ById(dlg!, CodeEntryFailTests.N2OBoxId);
        var visible = n2oBox is not null && Uia.IsOnScreen(n2oBox);
        Log($"=== KQ-B2-ISOFF-① === ô nhập lít 「{CodeEntryFailTests.N2OBoxId}」: " +
            $"{(n2oBox is null ? "KHÔNG CÓ" : visible ? "CÓ và ĐANG HIỆN" : "có nhưng ẨN")}");

        Assert.That(visible, Is.False,
            $"IS_AUTO_FLG = 0 mà ô nhập lít 「{CodeEntryFailTests.N2OBoxId}」 vẫn hiện ⇒ cú " +
            "return sớm ở frm203016.cs:407 KHÔNG chạy.\n" +
            "  Kiểm: (1) UPDATE có ăn không — PrepareDataBeforeApp đã đọc lại và khẳng định = 0; " +
            "(2) InpConfig có được nạp LẠI lúc mở màn không, hay app cache từ lần trước (nếu " +
            "cache thì phải kill MENU.exe trước khi đổi cờ).");

        // ── 確定 (F9) rồi xem lưới ──────────────────────────────────────────
        // chkInputArea() KHÔNG chặn mã 50 (frm203016.cs, danh sách 179/5, 202/x, 203/x, 17)
        // ⇒ F9 chạy setPacData + fixProc → frmTrtSel_Let_Trt_Data (đường ghi của 処置選択).
        Assert.That(PackDialogsClickF9(dlg!), Is.True,
            "Không bấm được 確定 trên frm203016.");
        Thread.Sleep(2000);
        trace.Shot("sau-khi-F9-IS-AUTO-OFF");

        if (_flow.Picker() is { } still)
        {
            trace.Note("frm203016 VAN con mo sau F9 — ghi lai roi huy.");
            trace.Shot("frm203016-van-mo");
            _flow.ClosePicker(still);
            Thread.Sleep(1000);
        }

        var after = _flow.Grid.Snapshot(200).ToList();
        var origIdx = after.FindIndex(r => Txt.N(r.Ryo) == Txt.N(ryo));
        var literRow = after.FirstOrDefault(r => Txt.Has(r.Ryo, "リッター"));

        // In quanh CHỖ CŨ của dòng gốc (không phải quanh origIdx — nó có thể đã biến mất).
        var anchor = literRow?.Index ?? (origIdx >= 0 ? origIdx : row.Index);
        var from = Math.Max(0, anchor - 3);
        Log("=== KQ-B2-ISOFF-② === lưới SAU (quanh chỗ cũ của dòng gốc):");
        foreach (var r in after.Skip(from).Take(8)) Log($"   {r}");
        Log($"   dòng 「…リッター数」 : {(literRow?.ToString() ?? "KHÔNG THẤY")}");
        Log($"   dòng gốc 「{ryo}」   : {(origIdx >= 0 ? $"còn, 点 = 「{after[origIdx].Ten}」" : "ĐÃ BIẾN MẤT")}" +
            $" (点 TRƯỚC = 「{tenBefore}」)");

        // ── SỐ ĐO (đo được 2026-09-22) ─────────────────────────────────────
        //
        // ⛔ HÀNH VI THẬT CỦA WINFORM — ĐỪNG SỬA ASSERT CHO 「HỢP TRỰC GIÁC」.
        //
        // Với IS_AUTO_FLG = 0, 確定 KHÔNG thêm dòng mới mà GHI ĐÈ CHÍNH DÒNG ĐANG ĐỨNG:
        //   TRƯỚC: [34] ペリオクリン 0.5g(3シリンジ) | 150 | 1
        //   SAU  : [34] N2O使用リッター数           | (rỗng) | 0
        // `fixProc` gọi `frmTrtSel_Let_Trt_Data` — đường ghi của 処置選択 bình thường, ghi
        // vào dòng hiện tại — rồi caller xoá nốt ô 点 (modMain.cs:542-552 luôn trả false).
        //
        // Khác hẳn nhánh cờ = 1: ở đó `setIS` AddRow() hai dòng IS MỚI, dòng gốc chỉ mất
        // 点数. Ở đây dòng gốc mất CẢ 処置.
        Assert.That(literRow, Is.Not.Null,
            "Không thấy dòng 「…リッター数」 trên lưới ⇒ 確定 chưa ghi được gì, chưa tới cái " +
            "đang đo. Đọc ảnh 「sau-khi-F9-IS-AUTO-OFF」.\n  Lưới:\n  " +
            string.Join("\n  ", _flow.DescribeGrid(200).Skip(from).Take(10)));

        Assert.That(SigaToothFlow.IsBlank(literRow!.Ten), Is.True,
            $"Dòng 「{literRow.Ryo}」 giữ 点 = 「{literRow.Ten}」, mong đợi TRỐNG — caller vẫn " +
            "chạy hFG1.CurrentCell.Value = \"\" vì mã 50 luôn trả false (modMain.cs:542-552).");

        Assert.That(origIdx, Is.LessThan(0),
            $"Dòng gốc 「{ryo}」 VẪN CÒN (点 = 「{after[Math.Max(origIdx,0)].Ten}」), nhưng đo được " +
            "2026-09-22 là nó BỊ GHI ĐÈ mất.\n" +
            "  ⛔ Đây là hành vi thật: với IS_AUTO_FLG = 0, 確定 đi qua fixProc → " +
            "frmTrtSel_Let_Trt_Data, tức GHI ĐÈ dòng đang đứng bằng dòng placeholder của " +
            "dialog (「N2O使用リッター数」, 0点), chứ KHÔNG AddRow như nhánh cờ = 1.\n" +
            "  ⚠️ HỆ QUẢ: nhập 笑気 khi cờ TẮT và con trỏ đang đứng trên một 処置 thật ⇒ 処置 đó " +
            "bị THAY THẾ hoàn toàn. Nặng hơn nhánh cờ = 1 (ở đó chỉ mất 点数). Chưa lưu (cần " +
            "F9 登録), nhưng bấm F9 là mất dữ liệu thật.");
    }

    /// <summary>Bấm nút 確定 trên frm203016 (nhãn có chứa 「確定」).</summary>
    private static bool PackDialogsClickF9(FlaUI.Core.AutomationElements.Window dialog)
    {
        try
        {
            var btn = dialog.FindAllDescendants(cf =>
                    cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button))
                .FirstOrDefault(b => Txt.Has(Uia.NameOf(b), "確定"));
            if (btn is null) return false;
            Uia.Click(btn);
            return true;
        }
        catch { return false; }
    }
}
