using FlaUI.Core.AutomationElements;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.DrugAmountSelect;

/// <summary>
/// Thông luồng <b>G1 — 薬剤使用量選択</b>: từ lưới 診療入力 gõ một mã thuốc, đi qua (hoặc
/// không qua) 処置選択, mở <c>frm203020</c>, đổi 数量, 確定, rồi đọc lại lưới.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI THẬT — VÀ CHỖ NÓ KHÁC MỌI LUỒNG ĐÃ CÓ
/// ═══════════════════════════════════════════════════════════════════════════
/// <b>① 処置選択 THƯỜNG KHÔNG HIỆN.</b> <c>modMain.GetTrtmasCod</c> đếm số dòng master
/// khớp mã vừa gõ; <c>intRowCnt == 1</c> thì nhánh <c>default</c> gọi thẳng
/// <c>frm203016_Hide_Let_Trt_Data(0, true)</c> (modMain.cs:474-477) — form được nạp,
/// chạy trọn <c>frmTrtSel_Let_Trt_Data</c>, rồi <c>Close()</c> mà <b>chưa từng hiện ra</b>
/// (frm203016.cs:107-127). Phần lớn mã thuốc chỉ có một 枝番, nên
/// <c>SigaToothFlow.EnterTreatment</c> — vốn chờ 処置選択 20 giây rồi kết luận
/// 「KHONG mo」 — sẽ báo sai ở đây. Vì thế luồng này chờ <b>một trong hai</b>: 処置選択
/// hoặc thẳng 薬剤使用量選択.
///
/// <b>② Hai hộp thoại CHỒNG LÊN NHAU khi có nhiều 枝番.</b>
/// <c>showDialog(ID203020)</c> nằm bên trong <c>frmTrtSel_Let_Trt_Data</c>
/// (frm203016.cs:1439) nên 処置選択 vẫn đang mở phía dưới. Cả hai form đều có lưới tên
/// <c>dgvView</c> ⇒ mọi hàm dò 「modal nào có dgvView」 đều lẫn. Xem
/// <see cref="DrugAmountDialog.Find"/>.
///
/// <b>③ Cờ <c>dataLineSource</c> KHÔNG BAO GIỜ ĐƯỢC ĐẶT LẠI.</b> Nó là field của
/// <b>singleton</b> <c>frm203016.Instance</c> (frm203016.cs:55) và chỉ có đúng một chỗ
/// gán, là đường 処方箋 <c>ID210002</c> (frm203002.cs:8804). Không có chỗ nào gán ngược
/// về. Nếu instance sống sót qua <c>Close()</c> thì mọi lượt nhập thuốc SAU đó trong
/// cùng phiên app sẽ rơi vào <c>if (dataLineSource != ID210002)</c> = false ⇒
/// <b>hộp thoại không bao giờ mở lại</b>. Đây là câu hỏi <c>KQ-9</c> của probe, và cũng
/// là lý do fixture phải đo 薬剤使用量選択 <b>trước</b> mọi thao tác 処方箋.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB — trừ khi testcase bấm F9 登録
/// ═══════════════════════════════════════════════════════════════════════════
/// 確定 của <c>frm203020</c> chỉ chạy <c>setPacData</c> (frm203020.cs:467-484): 点数 và
/// <c>free_wd</c> đi vào <b>ô ẩn cột 72 của lưới trong bộ nhớ</b>. Xuống
/// <c>TRNTRN.FREEWD</c> là việc của F9 登録 ở màn 診療入力, và luồng này KHÔNG bấm F9.
/// Cái phải trả lại là <c>mst_trt.F2</c> — xem <see cref="DrugAmountDb"/>.
/// </summary>
public sealed class DrugAmountFlow
{
    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly SigaToothFlow _flow;
    private readonly TreatmentGridOps _grid;

    public DrugAmountFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _flow = new SigaToothFlow(app, screen);
        _grid = _flow.Grid;
    }

    public SigaToothFlow Base => _flow;
    public TreatmentGridOps Grid => _grid;

    /// <summary>Hộp thoại 薬剤使用量選択 đang mở, hay null.</summary>
    public DrugAmountDialog? Dialog() => DrugAmountDialog.Find(_app, _screen.Window);

    /// <summary>処置選択 đang mở, hay null — <b>đã loại</b> 薬剤使用量選択 khỏi kết quả.</summary>
    /// <remarks>
    /// <c>SigaToothFlow.Picker()</c> lui về 「modal nào có <c>dgvView</c> mà không phải
    /// 病名選択」, và <c>frm203020</c> thoả đúng mô tả đó. Không lọc thì mọi vòng
    /// 「chờ 処置選択 đóng」 sẽ đứng chờ chính hộp thoại mình vừa mở.
    /// </remarks>
    public Window? Picker()
    {
        var picker = _flow.Picker();
        if (picker is null) return null;

        try
        {
            if (Uia.ById(picker, DrugAmountDialog.CostSumId) is not null) return null;
        }
        catch { /* vừa đóng */ }
        return picker;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ① Chọn chỗ để gõ mã
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Một dòng TRỐNG trong ĐÚNG ngày test, sẵn sàng để gõ mã thuốc lên đó.
    ///
    /// <para>Thuốc không cần 部位 hay 病名: <c>GetTrtmasCod</c> rẽ riêng cho dải 600–699
    /// và lấy 回数 mặc định từ <c>g_cnt</c> thay vì gọi <c>CalcCnt.getCalcCnt</c>
    /// (modMain.cs:410-416). Nên khác luồng AutoSantei, ở đây <b>không</b> phải seed
    /// 部位病名行 trước.</para>
    ///
    /// <para>⚠️ Vẫn phải khoá theo NGÀY (bài học 2026-09-08 của AutoSantei): lưới mở CẢ
    /// THÁNG và dòng trống của ngày khác trông y hệt.</para>
    /// </summary>
    public RegiRow? BlankRowOn(int day, TestTrace? trace = null)
    {
        var sameDay = _grid.Snapshot()
                           .Where(r => Txt.Int(r.Day) == day)
                           .ToList();
        if (sameDay.Count == 0)
        {
            trace?.Note($"luoi khong co dong nao cua ngay {day} — kiem lai 診療日 / benh nhan test");
            return null;
        }

        var blank = sameDay.FirstOrDefault(
            r => SigaToothFlow.IsBlank(r.Ryo) && SigaToothFlow.IsBlank(r.Ten));
        if (blank is not null)
        {
            trace?.Note($"da co san dong trong trong ngay {day}: 「{blank}」");
            return blank;
        }

        var last = sameDay[^1];
        trace?.Note($"ngay {day} chua co dong trong — chen mot dong duoi 「{last}」");
        return _flow.InsertBlankRow(last, trace);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ② Gõ mã thuốc → mở hộp thoại
    // ─────────────────────────────────────────────────────────────────────────

    /// <param name="CodeTyped">Đã gõ được mã vào ô 点 chưa.</param>
    /// <param name="PickerShown">
    /// 処置選択 CÓ hiện ra không. false + <see cref="DialogOpened"/> true = đường
    /// <c>intRowCnt == 1</c> (modMain.cs:474) — <b>đúng như dự kiến</b> với mã một 枝番,
    /// không phải lỗi.
    /// </param>
    /// <param name="DialogOpened">薬剤使用量選択 có bung ra không.</param>
    /// <param name="Dialogs">Mọi hộp thoại lạ gặp trên đường, GHI NGUYÊN VĂN (F17/F19).</param>
    public sealed record OpenResult(bool CodeTyped, bool PickerShown, bool DialogOpened,
                                    DrugAmountDialog? Dialog, IReadOnlyList<string> Dialogs)
    {
        public override string ToString() =>
            $"gõ mã={CodeTyped} 処置選択={(PickerShown ? "hiện" : "KHÔNG hiện")} " +
            $"薬剤使用量選択={(DialogOpened ? "mở" : "KHÔNG mở")} " +
            $"hộp thoại=[{string.Join(" / ", Dialogs)}]";
    }

    /// <summary>
    /// Gõ <paramref name="trtCd"/> vào ô 点 của <paramref name="row"/> rồi đưa luồng tới
    /// lúc 薬剤使用量選択 mở ra (hoặc kết luận là nó không mở).
    ///
    /// <para>Deadline NGẮN có chủ ý (F2): cả hai cửa sổ đều là thao tác thuần bộ nhớ +
    /// một câu SQL. Chờ lâu hơn không cho thêm thông tin nào, nó chỉ đổi 8 giây thành
    /// 15 phút.</para>
    /// </summary>
    /// <param name="trtSb">枝番 cần chốt KHI 処置選択 hiện ra. Không hiện thì không dùng tới.</param>
    public OpenResult OpenDialog(RegiRow row, int trtCd, int trtSb, TestTrace? trace = null)
    {
        var seen = new List<string>();

        if (!_flow.EnsureCodeMode())
        {
            trace?.Note($"KHONG dua duoc o 点 ve コードモード — dang la 「{_flow.InpMode()}」");
            return new OpenResult(false, false, false, null, seen);
        }

        if (!_flow.EnterCodeOnRow(row, trtCd, trace))
            return new OpenResult(false, false, false, null, seen);

        // Chờ MỘT TRONG HAI. Không chờ riêng 処置選択 rồi mới chờ hộp thoại: với mã một
        // 枝番 thì 処置選択 không bao giờ tới, và vòng chờ đầu tiên sẽ ăn trọn deadline.
        var appeared = Waits.TryUntil(
            () => Dialog() is not null || Picker() is not null || Crashed(),
            TimeSpan.FromSeconds(12));

        if (!appeared)
        {
            trace?.Note("sau khi go ma: KHONG thay 処置選択 lan 薬剤使用量選択. " +
                        "Hop thoai dang mo: " + _flow.DescribeDialogs());
            trace?.Shot("go-ma-khong-mo-gi");
            seen.AddRange(_flow.DismissAll(trace: trace));
            return new OpenResult(true, false, false, null, seen);
        }

        var pickerShown = false;
        if (Picker() is { } picker)
        {
            pickerShown = true;
            trace?.Shot("処置選択-mo");
            trace?.Note($"処置選択 CO hien — ma {trtCd} co nhieu 枝番, phai chot {trtSb} " +
                        "(modMain.cs:485 nhanh intRowCnt > 1)");
            _flow.CommitPick(picker, trtSb, trace, trtCd);
        }
        else
        {
            trace?.Note($"処置選択 KHONG hien — dung nhu du kien voi ma mot 枝番 " +
                        "(modMain.cs:474 goi thang frm203016_Hide_Let_Trt_Data)");
        }

        var dialog = DrugAmountDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(10));
        if (dialog is null)
        {
            // Đây là chỗ dễ ĐỔ OAN cho app nhất: có thể app đúng là không mở (F2 chưa
            // bật, hoặc dataLineSource đã dính ID210002), mà cũng có thể một hộp thoại
            // lạ đang chắn. Ghi nguyên văn rồi để testcase tự phân xử.
            trace?.Note("薬剤使用量選択 KHONG mo. Hop thoai dang mo: " + _flow.DescribeDialogs());
            trace?.Note("Win32 thay: " + MsgBoxWin32.TextOfAll(_app.ProcessId));
            trace?.Shot("khong-mo-203020");
            return new OpenResult(true, pickerShown, false, null, seen);
        }

        trace?.Shot("薬剤使用量選択-mo");
        trace?.Note("薬剤使用量選択 mo: " + dialog.Describe());
        return new OpenResult(true, pickerShown, true, dialog, seen);
    }

    /// <summary>App đã bung hộp .NET 「Unhandled exception」 chưa (F19 — nút Continue/Quit).</summary>
    private bool Crashed() =>
        MsgBoxWin32.All(_app.ProcessId)
                   .Any(d => Txt.Has(d.Text, SigaToothFlow.CrashDialogFragment) ||
                             Txt.Has(d.Title, SigaToothFlow.CrashDialogFragment));

    // ─────────────────────────────────────────────────────────────────────────
    // ③ Đo một lượt đổi 数量
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Ảnh chụp hộp thoại tại một thời điểm — mọi số testcase cần để kết luận.</summary>
    public sealed record DialogState(IReadOnlyList<float> Counts, string CostSum, string PointSum,
                                     IReadOnlyList<string> RowTexts)
    {
        public float? Point => float.TryParse(Txt.N(PointSum), out var f) ? f : null;

        public override string ToString() =>
            $"使用量=[{string.Join(",", Counts.Select(c => c.ToString("0.####")))}] " +
            $"薬価合計=「{CostSum}」 点数=「{PointSum}」";
    }

    public static DialogState Capture(DrugAmountDialog dialog)
    {
        var rows = dialog.Rows();
        return new DialogState(
            rows.Select(r => r.CountF).ToList(),
            dialog.CostSumText(),
            dialog.PointSumText(),
            rows.Select(r => r.ToString()).ToList());
    }

    /// <summary>Trước / sau một thao tác trên hộp thoại.</summary>
    public sealed record AmountChange(DialogState Before, DialogState After)
    {
        public float? PointDelta => Before.Point is { } b && After.Point is { } a ? a - b : null;

        public IReadOnlyList<float> CountDeltas =>
            Enumerable.Range(0, Math.Min(Before.Counts.Count, After.Counts.Count))
                      .Select(i => After.Counts[i] - Before.Counts[i])
                      .ToList();

        public override string ToString() =>
            $"{Before}  →  {After}  (Δ点 {PointDelta?.ToString("0.####") ?? "?"})";
    }

    /// <summary>Click một dòng đúng <paramref name="times"/> lần rồi chụp lại trước/sau.</summary>
    public AmountChange ClickTimes(DrugAmountDialog dialog, int rowIndex, int times,
                                   TestTrace? trace = null)
    {
        var before = Capture(dialog);
        trace?.Note($"truoc khi click: {before}");

        for (var i = 0; i < times; i++)
        {
            var rows = dialog.Rows();
            if (rowIndex >= rows.Count)
            {
                trace?.Note($"luoi chi con {rows.Count} dong — khong click duoc dong {rowIndex}");
                break;
            }
            dialog.ClickRow(rows[rowIndex], trace);
        }

        var after = Capture(dialog);
        trace?.Note($"sau {times} cu click: {after}");
        trace?.Shot($"sau-{times}-click");
        return new AmountChange(before, after);
    }

    /// <summary>Gõ một 使用量 cụ thể vào một dòng rồi chụp lại trước/sau.</summary>
    public AmountChange TypeCount(DrugAmountDialog dialog, int rowIndex, string value,
                                  TestTrace? trace = null)
    {
        var before = Capture(dialog);
        trace?.Note($"truoc khi go: {before}");

        var rows = dialog.Rows();
        if (rowIndex < rows.Count)
            dialog.TypeCount(rows[rowIndex], value, trace);
        else
            trace?.Note($"luoi chi co {rows.Count} dong — khong go duoc vao dong {rowIndex}");

        var after = Capture(dialog);
        trace?.Note($"sau khi go 「{value}」: {after}");
        trace?.Shot($"sau-khi-go-{value}");
        return new AmountChange(before, after);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ④ Chốt và đọc lại lưới
    // ─────────────────────────────────────────────────────────────────────────

    /// <param name="Confirmed">Hộp thoại đã đóng sau khi bấm 確定 chưa.</param>
    /// <param name="Row">Dòng thuốc trên <c>grdRegi</c> sau khi chốt; null = không tìm ra.</param>
    /// <param name="PointBefore">月計点数 trước lượt chốt (mốc NGOÀI lưới — F12).</param>
    public sealed record CommitResult(bool Confirmed, RegiRow? Row, int? PointBefore, int? PointAfter,
                                      IReadOnlyList<string> Dialogs)
    {
        public int? PointDelta => PointBefore is { } b && PointAfter is { } a ? a - b : null;

        public override string ToString() =>
            $"確定={Confirmed} dòng=「{Row?.ToString() ?? "KHÔNG THẤY"}」 " +
            $"月計 {PointBefore?.ToString() ?? "?"} → {PointAfter?.ToString() ?? "?"} " +
            $"(Δ {PointDelta?.ToString() ?? "?"})";
    }

    /// <summary>
    /// Bấm 「F9 確定」 của hộp thoại, chờ mọi cửa sổ đóng, rồi đọc lại dòng thuốc trên lưới.
    ///
    /// <para>Sau 確定, <c>frmTrtSel_Let_Trt_Data</c> đi tiếp: ghi <c>free_wd</c> vào ô ẩn
    /// cột 72 (frm203016.cs:1451) rồi gọi <c>ModSave.getDrugName</c> với chính chuỗi đó
    /// (:1462). <c>editDrugName</c> ghi đè <c>cnt[i]</c> bằng các số trong <c>free_wd</c>
    /// (EditControl.cs:1049-1055), nên <b>数量 mới hiện ra ngay trong ô 療法・処置</b> —
    /// đó là mốc đọc được từ giao diện, khỏi phải đọc cột ẩn.</para>
    /// </summary>
    public CommitResult Confirm(DrugAmountDialog dialog, string drugNameFragment,
                                TestTrace? trace = null)
    {
        var pointBefore = _grid.AllPointValue();
        var confirmed = dialog.Confirm(trace);
        if (!confirmed)
            trace?.Note("bam 確定 xong ma hop thoai chua dong: " + _flow.DescribeDialogs());

        // 処置選択 (nếu có) đóng ngay sau đó, rồi tới lượt IregCodChk / 診療チェック.
        Waits.TryUntil(() => Dialog() is null && Picker() is null, TimeSpan.FromSeconds(10));

        var seen = new List<string>();
        var stray = Waits.TryFor(() => _flow.OpenDialogs().FirstOrDefault(), TimeSpan.FromSeconds(4));
        if (stray is not null)
        {
            var text = Txt.N(Dialogs.TextOf(stray));
            seen.Add(text);
            trace?.Note($"hop thoai sau 確定: 「{text}」");
            trace?.Shot("hop-thoai-sau-confirm");
            seen.AddRange(_flow.DismissAll(trace: trace));
        }

        // Chốt xong app mở editor ô 回 — Enter để đóng, nếu không phím sau rơi vào editor.
        if (_grid.IsEditing())
        {
            trace?.Note($"editor dang mo voi 「{_grid.EditorText()}」 — Enter de dong");
            _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(500);
        }

        var row = FindDrugRow(drugNameFragment);
        var pointAfter = _grid.AllPointValue();

        var result = new CommitResult(confirmed, row, pointBefore, pointAfter, seen);
        trace?.Note("sau 確定: " + result);
        trace?.Shot("sau-confirm");
        return result;
    }

    /// <summary>
    /// Dòng thuốc trên <c>grdRegi</c>, nhận theo TÊN đã chuẩn hoá.
    ///
    /// <para>Nhận theo tên vì <c>trt_cd</c> là cột ẩn (RegiGrid.cs:11-14). Chuẩn hoá cả
    /// hai vế bằng <c>AutoSanteiOps.Norm</c>: lưới in 半角 「ｵｾﾞｯｸｽ」 còn master giữ 全角
    /// 「オゼックス」 — không chuẩn hoá thì mọi phép so đều trượt và testcase đỏ oan.</para>
    /// </summary>
    public RegiRow? FindDrugRow(string nameFragment, int limit = 200) =>
        AutoSanteiChkAuto.AutoSanteiOps.RowByName(_grid.Snapshot(limit), nameFragment);

    /// <summary>
    /// 単位 <b>đã rút gọn</b> — bản chép <c>EditControl.editDrugUnitToShortUnit</c>
    /// (EditControl.cs:1160-1190).
    ///
    /// <para>⚠️ <b>Bắt buộc phải qua bảng này.</b> Ô 療法・処置 in ra 単位 RÚT GỌN, không
    /// phải 単位 trong <c>mst_drug</c>: 「錠」 hiện ra là <b>「T」</b>. Đo được 2026-09-09
    /// (Tc1, KQ-11): lưới in 「オゼックス錠150 150mg 3T … 3日分」. Dò 数量 bằng 「錠」 thì
    /// không khớp gì cả, và testcase sẽ kết luận 「free_wd không tới nơi」 — đổ oan hoàn
    /// toàn cho app.</para>
    /// </summary>
    public static string ShortUnit(string? unitNm) => Txt.N(unitNm) switch
    {
        "" => "",
        "カートリッジ" => "Ct",
        "カプセル" => "C",
        "錠" => "T",
        "管" => "A",
        "瓶" => "V",
        var other => other,     // default: editZenToHan — với 「ｇ」/「mL」 thì giữ nguyên
    };

    /// <summary>
    /// 数量 đọc được từ ô 療法・処置 của dòng thuốc — chuỗi mà <c>editDrugName</c> dựng.
    ///
    /// <para>Định dạng: <c>&lt;tên thuốc&gt;&lt;dấu cách căn cột&gt;&lt;数量&gt;&lt;単位 rút gọn&gt;</c>
    /// (EditControl.cs:1101-1111). Trả về mọi cụm 「số + đơn vị」 tìm được, theo thứ tự —
    /// một 処置 nhiều thành phần thì mỗi thành phần một dòng.</para>
    ///
    /// <para>Nhận <b>cả hai</b> dạng đơn vị (đầy đủ và rút gọn) để dòng 用量 kiểu
    /// 「3日分」 không làm trượt phép dò khi hai chuỗi tình cờ giống nhau.</para>
    /// </summary>
    public static IReadOnlyList<string> AmountsInRowText(string? ryoText, string unitNm)
    {
        var text = Txt.N(ryoText);
        var units = new[] { ShortUnit(unitNm), Txt.N(unitNm) }
                    .Where(u => u.Length > 0)
                    .Distinct()
                    .ToList();
        if (text.Length == 0 || units.Count == 0) return [];

        var pattern = @"(\d+(?:\.\d+)?)\s*(?:" +
                      string.Join("|", units.Select(System.Text.RegularExpressions.Regex.Escape)) + ")";
        return System.Text.RegularExpressions.Regex.Matches(text, pattern)
                     .Select(m => m.Groups[1].Value)
                     .ToList();
    }

    /// <summary>
    /// Chờ dòng thuốc rơi xuống lưới. Cần cho đường KHÔNG qua hộp thoại (mã đối chứng
    /// <c>F2 = 0</c>): ở đó không có cửa sổ nào để chờ đóng, nên phải chờ chính cái dòng.
    ///
    /// <para>Deadline vừa phải: <c>frmTrtSel_Let_Trt_Data</c> còn chạy <c>getDrugName</c>
    /// (một câu SQL) rồi <c>SingleChk</c> trước khi lưới vẽ lại.</para>
    /// </summary>
    public RegiRow? WaitForDrugRow(string nameFragment, TimeSpan? timeout = null) =>
        Waits.TryFor(() => FindDrugRow(nameFragment), timeout ?? TimeSpan.FromSeconds(20));

    /// <summary>Đóng hộp thoại + 処置選択 mà KHÔNG chốt gì — dùng ở dọn dẹp giữa các testcase.</summary>
    public void CancelAll(TestTrace? trace = null)
    {
        if (Dialog() is { } d)
        {
            trace?.Note("dong 薬剤使用量選択 bang 「F10 戻る」 (⛔ KHONG dung Escape — Escape la 確定)");
            d.Cancel(trace);
        }
        if (Picker() is { } p)
        {
            trace?.Note("dong 処置選択 bang 「F10 戻る」");
            _flow.ClosePicker(p);
        }
        _flow.DismissAll(trace: trace);
    }
}
