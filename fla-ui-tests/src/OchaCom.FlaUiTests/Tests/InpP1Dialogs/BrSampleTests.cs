using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// <b>C. Ｂｒサンプル (frm203049)</b> — bản WinForm của nhóm TC-BR-* trong
/// <c>web-tenant-tests/tests/inp-p1-ported-dialogs.spec.ts</c>.
///
/// <para>Fixture này <b>KHÔNG ghi DB</b>: <c>frm203049</c> chỉ ĐỌC bảng <c>BrSample</c> rồi
/// ghi kết quả vào tham số giữa hai màn (<c>frm902003Param.bui</c>, frm203049.cs:300-311).
/// Thứ có thể rơi xuống DB là F9 登録 của 診療入力 — và luồng này KHÔNG bao giờ bấm nó,
/// nó đóng 部位選択 bằng <b>F12 戻る</b>.</para>
///
/// <para><b>Phụ thuộc dữ liệu.</b> Nhánh 「có mẫu khớp」 tuỳ bảng <c>BrSample</c> của từng
/// máy. Không có mẫu nào cho cặp răng đang chọn thì testcase <c>Ignore</c> kèm lý do và
/// gợi ý đổi <c>inpP1.brTeeth</c> — đỏ oan ở đây chỉ làm người chạy đi sửa nhầm chỗ.</para>
/// </summary>
[TestFixture]
[Category("inp-p1")]
[Category("br-sample")]
public sealed class BrSampleTests : InpP1TestBase
{
    private Window? _tooth;
    private Window? _br;

    private int[] BrTeeth => Settings.InpP1.BrTeeth;
    private int[] NoMatchTeeth => Settings.InpP1.BrNoMatchTeeth;

    [OneTimeTearDown]
    public void CloseDialogsIfLeftOpen()
    {
        try
        {
            var br = App?.Window(BrSampleFlow.BrDialogId);
            if (br is not null) BrSampleFlow.CloseBrSample(App!, br);
        }
        catch (Exception e) { Log($"khong dong duoc {BrSampleFlow.BrDialogId}: {e.Message}"); }

        try
        {
            var tooth = App?.Window(BrSampleFlow.ToothDialogId);
            if (tooth is not null) BrSampleFlow.CloseToothDialog(App!, tooth);
        }
        catch (Exception e) { Log($"khong dong duoc {BrSampleFlow.ToothDialogId}: {e.Message}"); }
    }

    /// <summary>部位選択 phải đang mở; không mở được thì Ignore chứ đừng đỏ (dữ liệu của máy).</summary>
    private Window RequireTooth()
    {
        if (_tooth is not null && Uia.IsOnScreen(_tooth)) return _tooth;
        IgnoreWithReason(
            "khong co 部位選択 dang mo — Tc1 da Ignore truoc do (xem ly do o testcase Tc1).");
        return _tooth!;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 — TC-BR-OPEN-1 + TC-BR-LIST-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — 部位選択 → F9 Br例: lưới mẫu có cột 番号 + 部位 (歯式 hai dòng)")]
    public void Tc1_OpenAndList()
    {
        using var trace = TestTrace.Begin();

        _tooth = BrSampleFlow.OpenToothDialog(App, Screen, trace);
        if (_tooth is null)
        {
            InpP1MenuFlow.WriteArtifact("inp-p1-no-bui-dialog.uia.txt",
                InpP1MenuFlow.DumpAllTopLevelWindows(App));
            IgnoreWithReason(
                $"khong mo duoc 部位選択 tu luoi dang ky cua benh nhan {PatNo}. " +
                "Moi dong deu co cot an 51 (BuiDispFlg) = 99 (dong 日計/合計) hoac luoi rong — " +
                "doi patient.patNo sang ho so co it nhat mot 処置 CAN chon 部位. " +
                "Xem artifact inp-p1-no-bui-dialog.uia.txt.");
        }

        BrSampleFlow.DumpElements(_tooth!, "inp-p1-frm902003-elements.txt");

        // Chọn hai răng của HÀM TRÊN BÊN TRÁI bằng bàn phím (xem chú thích đầu BrSampleFlow).
        BrSampleFlow.SelectUpperLeftTeeth(_tooth!, BrTeeth, trace);

        var marked = BrSampleFlow.MarkedTeeth(_tooth!);
        Log($"o rang dang co chu: {string.Join(" ", marked)}");
        trace.Note($"{marked.Count} o rang co chu");

        Assert.That(marked, Has.Count.EqualTo(BrTeeth.Length),
            $"bam Delete, →, {string.Join(",", BrTeeth)} ma so o rang co chu la {marked.Count}, " +
            $"cho doi {BrTeeth.Length}. Phim so khong toi duoc BuiInfo.ProcessCmdKey " +
            "(BuiInfo.cs:400) — kiem lai tieu diem co nam trong buiInfo1 khong.");
        Assert.That(marked.All(m => m.StartsWith($"{BrSampleFlow.PosUpperLeft}-", StringComparison.Ordinal)),
            Is.True,
            $"rang da chon phai nam het o vung 左上 (pos {BrSampleFlow.PosUpperLeft}), dang la: " +
            $"{string.Join(" ", marked)}. Mot lan → tu RU (pos 2) phai sang LU (pos 1) — BuiInfo.cs:601-607.");

        var opened = BrSampleFlow.OpenBrSample(App, _tooth!, trace);
        var br = opened.Dialog;
        _br = br;

        var title = Uia.NameOf(br);
        Assert.That(Txt.Has(title, BrSampleFlow.BrTitleFragment), Is.True,
            $"dialog phai co title chua 「{BrSampleFlow.BrTitleFragment}」 (frm203049.cs:33), " +
            $"dang la 「{title}」.");

        // Nhánh phụ thuộc DỮ LIỆU: máy nào BrSample khác đi thì Ignore, không đỏ oan.
        if (opened.HasError)
        {
            BrSampleFlow.DumpElements(br, "inp-p1-frm203049-elements.txt");
            BrSampleFlow.CloseBrSample(App, br, trace);
            _br = null;
            IgnoreWithReason(
                $"BrSample cua may nay khong co mau nao khop 2 rang {string.Join("/", BrTeeth)} " +
                $"cua ham tren — app bao 「{opened.ErrorMessage}」. Doi inpP1.brTeeth sang cap rang " +
                "co mau (hoac bien moi truong OCHA_BR_TEETH=5,6).");
        }

        var headers = BrSampleFlow.BrHeaders(br);
        Log($"header luoi Ｂｒサンプル: {string.Join(" | ", headers)}");
        Assert.That(headers.Any(h => Txt.Has(h, BrSampleFlow.BrColumnNo)), Is.True,
            $"thieu cot 「{BrSampleFlow.BrColumnNo}」 (_viewItem, frm203049.cs:53).");
        Assert.That(headers.Any(h => Txt.Has(h, BrSampleFlow.BrColumnBui)), Is.True,
            $"thieu cot 「{BrSampleFlow.BrColumnBui}」 (_viewItem, frm203049.cs:54).");

        var rows = Waits.Poll(() => BrSampleFlow.BrRows(br), r => r.Count > 0,
                              "luoi Ｂｒサンプル dung xong it nhat mot dong",
                              Settings.Run.DefaultTimeout);
        Log($"Ｂｒサンプル: {rows.Count} mau khop");
        trace.Note($"{rows.Count} mau khop");

        // Cột 部位 là 歯式 HAI DÒNG (hàm trên \n hàm dưới) — WrapMode = True trong
        // dgvView_CellFormatting (frm203049.cs:126-134). Bản web thay đường kẻ ngang mà
        // WinForm vẽ tay (DrawGridCrossLine) bằng đúng hai dòng chữ này.
        var lines = BrSampleFlow.BuiCellLineCount(rows[0]);
        Assert.That(lines, Is.GreaterThanOrEqualTo(2),
            $"cot 部位 phai la 歯式 2 dong, dong dau doc duoc {lines} dong: 「{rows[0]}」");

        Assert.That(BrSampleFlow.BrConfirmEnabled(br), Is.True,
            "co mau khop ma nut F9 確定 lai bi tat — errorProc (frm203049.cs:290-294) " +
            "chi duoc tat F9 o hai nhanh loi.");
        trace.Step("luoi mau dung xong, F9 con dung duoc");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc2 — TC-BR-CONFIRM-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc2 — F9 確定 ghi ĐÈ lựa chọn của 部位選択 rồi đóng")]
    public void Tc2_ConfirmAppliesSample()
    {
        var tooth = RequireTooth();
        if (_br is null || !Uia.IsOnScreen(_br))
            IgnoreWithReason("Tc1 da Ignore (khong co mau Br nao) — khong co gi de 確定.");

        using var trace = TestTrace.Begin();

        var before = BrSampleFlow.MarkedTeeth(tooth);
        BrSampleFlow.ConfirmFirstSample(App, _br!, trace);
        _br = null;

        Assert.That(App.Window(BrSampleFlow.ToothDialogId), Is.Not.Null,
            "確定 xong thi 部位選択 ben duoi phai CON MO — defData chi Close() frm203049 " +
            "(frm203049.cs:310).");

        // defData GHI ĐÈ toàn bộ bui[32] bằng mẫu, rồi frm902003 chia lại về 4 vùng
        // (divisionBui, frm902003.cs:317-324) ⇒ số ô răng CÓ CHỮ phải NHIỀU HƠN lúc đầu:
        // một mẫu Br gồm cả răng trụ lẫn nhịp cầu, không chỉ 2 răng ta đã bấm.
        var after = Waits.Poll(() => BrSampleFlow.MarkedTeeth(tooth),
                               m => m.Count > before.Count,
                               "so o rang co chu tang len sau khi ap mau Br",
                               Settings.Run.DefaultTimeout);
        Log($"truoc khi ap mau: {string.Join(" ", before)}");
        Log($"sau khi ap mau : {string.Join(" ", after)}");

        Assert.That(after.Count, Is.GreaterThan(before.Count),
            "ap mau Br xong ma lua chon khong doi gi — defData (frm203049.cs:300-311) " +
            "khong toi duoc 部位選択.");
        trace.Step($"ap mau Br: {before.Count} → {after.Count} o rang");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc3 — TC-BR-ERR-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — chọn CẢ hai hàm thì báo 上下顎同時 và TẮT nút F9 確定")]
    public void Tc3_MixedJawError()
    {
        var tooth = RequireTooth();
        using var trace = TestTrace.Begin();

        // F7 全顎 chọn toàn bộ 32 răng ⇒ chắc chắn dính cả hai hàm, không phụ thuộc dữ liệu.
        BrSampleFlow.SelectWholeArch(tooth, trace);
        // Một hàm có 16 răng ⇒ chọn được nhiều hơn 16 ô nghĩa là đã dính CẢ HAI hàm —
        // đúng tiền đề mà nhánh 上下顎同時 cần (frm203049.cs:230-233).
        const int oneJawToothCount = 16;
        var marked = BrSampleFlow.MarkedToothCount(tooth);
        Log($"sau F7 全顎: {marked} o rang co chu");
        Assert.That(marked, Is.GreaterThan(oneJawToothCount),
            $"F7 全顎 phai chon ca ham tren lan ham duoi (frm902003.cs:272-278), " +
            $"dang chi co {marked} o co chu.");

        var opened = BrSampleFlow.OpenBrSample(App, tooth, trace);
        _br = opened.Dialog;

        Assert.That(opened.ErrorMessage, Is.Not.Null,
            "chon ca hai ham ma khong bao gi — getViewData phai goi errorProc " +
            "(frm203049.cs:234-238).");
        Assert.That(Txt.Has(opened.ErrorMessage, "上下顎同時の処理はできません。"), Is.True,
            $"sai cau canh bao. Nhan duoc: 「{opened.ErrorMessage}」");

        // ⚠️ WinForm TẮT nút (btnChgEnable), bản web KHÔNG RENDER nút — cùng ý nghĩa,
        //    hai cách thể hiện. Xem README muc 5.
        Assert.That(BrSampleFlow.BrConfirmEnabled(_br), Is.False,
            "errorProc phai TAT F9 (frm203049.cs:293) — con bam duoc la moi nguoi dung " +
            "ap mot mau khong ton tai.");

        BrSampleFlow.CloseBrSample(App, _br, trace);
        _br = null;
        trace.Step("dong Ｂｒサンプル bang F10 戻る");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc4 — TC-BR-ERR-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("Tc4 — không có mẫu khớp thì báo Brに使用できません và TẮT nút F9")]
    public void Tc4_NoMatchError()
    {
        var tooth = RequireTooth();
        using var trace = TestTrace.Begin();

        // Cầu răng nối răng cửa giữa (1) với răng khôn (8) là vô lý về nha khoa nên
        // BrSample không có mẫu nào cho cặp này: WHERE bui9 = 1 AND bui16 = 1 AND cnt = 2
        // (frm203049.cs:242-252) trả 0 dòng.
        BrSampleFlow.SelectUpperLeftTeeth(tooth, NoMatchTeeth, trace);
        var marked = BrSampleFlow.MarkedTeeth(tooth);
        Log($"o rang dang co chu: {string.Join(" ", marked)}");
        Assert.That(marked, Has.Count.EqualTo(NoMatchTeeth.Length),
            $"phai chon dung {NoMatchTeeth.Length} rang, dang co {marked.Count}.");

        var opened = BrSampleFlow.OpenBrSample(App, tooth, trace);
        var br = opened.Dialog;
        _br = br;

        if (opened.ErrorMessage is null)
        {
            BrSampleFlow.CloseBrSample(App, br, trace);
            _br = null;
            IgnoreWithReason(
                $"BrSample cua may nay CO mau khop cap rang {string.Join("+", NoMatchTeeth)} " +
                "ham tren — doi inpP1.brNoMatchTeeth sang cap khong co mau " +
                "(hoac OCHA_BR_NO_MATCH_TEETH=1,8).");
        }

        Assert.That(Txt.Has(opened.ErrorMessage, "Brに使用できません。"), Is.True,
            $"sai cau canh bao cua nhanh 該当なし (frm203049.cs:259). " +
            $"Nhan duoc: 「{opened.ErrorMessage}」");
        Assert.That(BrSampleFlow.BrConfirmEnabled(br), Is.False,
            "errorProc TAT F9 o ca nhanh 該当なし (frm203049.cs:293).");
        Assert.That(BrSampleFlow.BrRows(br), Is.Empty,
            "nhanh loi thi khong duoc bind DataSource — getViewData return truoc dspData " +
            "(frm203049.cs:257-261).");

        BrSampleFlow.CloseBrSample(App, br, trace);
        _br = null;

        // Dọn: đóng 部位選択 bằng F12 戻る. KHÔNG dùng End/Escape — chúng gọi btnEntry_Click
        // (frm902003.cs:192-197), tức là xác nhận lựa chọn và đi tiếp sang 病名選択.
        BrSampleFlow.CloseToothDialog(App, tooth, trace);
        _tooth = null;
        trace.Step("dong 部位選択 bang F12 戻る");
    }
}
