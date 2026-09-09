using FlaUI.Core.Definitions;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.DrugAmountSelect;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.DrugPathB;

/// <summary>
/// Thông luồng <b>G2 — Path B (<c>mst_med</c>)</b>: gõ một mã 薬剤 <b>không có</b> dòng
/// <c>MST_DRUG_RX</c>, rồi đọc chính xác cái mà <c>editDrugName</c> nhánh <c>else</c>
/// dựng ra trong ô 療法・処置.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// DÙNG LẠI ĐƯỜNG NHẬP CỦA G1
/// ═══════════════════════════════════════════════════════════════════════════
/// Đường tới đích giống hệt G1 (chèn dòng trống của ngày test → コードモード → gõ mã →
/// chờ), nên lớp này <b>bọc</b> <see cref="DrugAmountFlow"/> chứ không chép lại. Ba cái
/// bẫy đã trả giá ở G1 vì thế có sẵn: 処置選択 thường KHÔNG hiện với mã một 枝番
/// (modMain.cs:474), hai form cùng có lưới <c>dgvView</c>, và dò dòng mới phải bằng
/// PHẦN CHÊNH chứ không bằng tên.
///
/// <para>Khác biệt DUY NHẤT: ở đây ta tin chắc <b>không</b> hộp thoại nào bung ra
/// (mã đem thử để <c>F2 = 0</c>), nên gọi <c>OpenDialog(expectDialog: false)</c> để
/// deadline rút xuống 6s (F2).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ ĐỌC Ô 療法・処置 PHẢI ĐỌC NGUYÊN VĂN
/// ═══════════════════════════════════════════════════════════════════════════
/// Path B dựng <b>tối đa hai dòng</b> (処置名 + 用法) nối bằng <c>Environment.NewLine</c>
/// (modSave.cs:2227-2233). Nhưng <c>TreatmentGridOps.Snapshot</c> đọc ô qua
/// <c>Txt.N</c>, và <c>Txt.N</c> <b>đổi mọi <c>\r\n</c> thành dấu cách</b>
/// (Txt.cs:17-25) ⇒ hai dòng đọc ra thành một chuỗi phẳng. Đếm số dòng trên bản đã
/// phẳng là <b>xanh giả</b> (F23). <see cref="RawRyo"/> đọc thẳng
/// <c>Uia.ValueOf</c> để giữ nguyên dấu xuống dòng.
/// </summary>
public sealed class DrugPathBFlow
{
    private readonly OchaApp _app;
    private readonly TreatmentEntryScreen _screen;
    private readonly DrugAmountFlow _entry;

    public DrugPathBFlow(OchaApp app, TreatmentEntryScreen screen)
    {
        _app = app;
        _screen = screen;
        _entry = new DrugAmountFlow(app, screen);
    }

    /// <summary>Đường nhập dùng chung với G1 — chèn dòng trống, gõ mã, dò dòng mới.</summary>
    public DrugAmountFlow Entry => _entry;

    public TreatmentGridOps Grid => _entry.Grid;

    // ─────────────────────────────────────────────────────────────────────────

    /// <param name="CodeTyped">Đã gõ được mã vào ô 点 chưa.</param>
    /// <param name="DialogAppeared">
    /// Có cửa sổ nào bung ra không (処置選択 hoặc 薬剤使用量選択). Với luồng này mong đợi
    /// <b>false</b>: mã để <c>F2 = 0</c> và chỉ một 枝番.
    /// </param>
    /// <param name="Row">Dòng vừa rơi xuống lưới; null = KHÔNG có dòng nào.</param>
    /// <param name="RawRyo">
    /// Ô 療法・処置 <b>nguyên văn</b>, còn nguyên <c>\r\n</c> — thứ duy nhất đếm được số dòng.
    /// </param>
    /// <param name="Dialogs">Mọi hộp thoại gặp trên đường, ghi NGUYÊN VĂN (F17/F19).</param>
    public sealed record PathBResult(bool CodeTyped, bool DialogAppeared, RegiRow? Row,
                                     string RawRyo, IReadOnlyList<string> Dialogs)
    {
        /// <summary>Các dòng của ô 療法・処置, đã bỏ 2 dấu cách đệm mà app chèn vào đầu mỗi dòng.</summary>
        /// <remarks><c>CommonInp.REGIRYO_PADLEFT = "  "</c> (CommonInp.cs:35).</remarks>
        public IReadOnlyList<string> Lines => SplitLines(RawRyo);

        public const string Pad = "  ";

        /// <summary>Tách ô 療法・処置 NGUYÊN VĂN thành các dòng, đã gỡ phần đệm trái.</summary>
        public static IReadOnlyList<string> SplitLines(string raw) =>
            raw.Split(["\r\n", "\n"], StringSplitOptions.None)
               .Select(l => l.TrimEnd())
               .Where(l => l.Trim().Length > 0)
               .Select(l => l.StartsWith(Pad, StringComparison.Ordinal) ? l[Pad.Length..] : l.TrimStart())
               .ToList();

        public override string ToString() =>
            $"gõ mã={CodeTyped} hộp thoại={(DialogAppeared ? "CÓ" : "không")} " +
            $"dòng=「{Row?.ToString() ?? "KHÔNG CÓ"}」 · {Lines.Count} dòng text " +
            $"[{string.Join(" ⏎ ", Lines)}]" +
            (Dialogs.Count > 0 ? $" · hộp thoại=[{string.Join(" / ", Dialogs)}]" : "");
    }

    /// <summary>
    /// Gõ mã lên một dòng trống của ngày test rồi đọc dòng vừa rơi xuống.
    ///
    /// <para>Nhận dòng mới bằng <b>phần chênh</b> so với ảnh chụp trước khi gõ — nhiều
    /// testcase trong một fixture thì mỗi lượt để lại một dòng cùng tên, và bài học
    /// 2026-09-09 của G1 là dò theo tên sẽ vớ phải dòng của lượt TRƯỚC.</para>
    ///
    /// <para>Trả về <c>Row = null</c> là một KẾT QUẢ HỢP LỆ, không phải lỗi harness: nếu
    /// WinForm cũng từ chối chèn dòng như bản web thì đó chính là thứ cần đo.</para>
    /// </summary>
    public PathBResult EnterCode(DrugPathBDb.PathBCandidate c, int day, TestTrace? trace = null)
    {
        var blank = _entry.BlankRowOn(day, trace);
        if (blank is null)
        {
            trace?.Note("khong co dong trong de go ma. Luoi:\n  " +
                        string.Join("\n  ", _entry.Base.DescribeGrid()));
            return new PathBResult(false, false, null, "", []);
        }

        var before = _entry.RowsNow();
        var open = _entry.OpenDialog(blank, c.TrtCd, c.TrtSb, trace, expectDialog: false);
        var appeared = open.PickerShown || open.DialogOpened;

        if (appeared)
        {
            // Không mong đợi, nhưng phải dẹp trước khi đọc lưới — hộp thoại còn mở thì
            // dòng chưa chốt và mọi phép đọc sau đó đều nói về trạng thái dở dang.
            trace?.Note("⚠️ CO cua so bung ra trong khi luong nay mong doi KHONG co: " +
                        _entry.Base.DescribeDialogs());
            trace?.Shot("bat-ngo-co-hop-thoai");
            _entry.CancelAll(trace);
        }

        var seen = new List<string>(open.Dialogs);

        // Câu 「該当処置はありません」 (modMain.cs:487) nghĩa là mã không có trong master —
        // chưa tới được editDrugName. Ghi nguyên văn để không nhầm với 「path B ra rỗng」.
        var stray = Waits.TryFor(() => _entry.Base.OpenDialogs().FirstOrDefault(),
                                 TimeSpan.FromSeconds(4));
        if (stray is not null)
        {
            try
            {
                var text = Txt.N(Dialogs.TextOf(stray));
                seen.Add(text);
                trace?.Note($"hop thoai sau khi go ma: 「{text}」");
                trace?.Shot("hop-thoai-sau-go-ma");
            }
            catch { /* vừa đóng */ }
            seen.AddRange(_entry.Base.DismissAll(trace: trace));
        }

        var row = _entry.WaitForAddedDrugRow(before, c.RowNeedle, TimeSpan.FromSeconds(15), trace);
        var raw = row is null ? "" : RawRyo(row);

        var result = new PathBResult(open.CodeTyped, appeared, row, raw, seen);
        trace?.Note("do duoc: " + result);
        trace?.Note("nguyen van o 療法・処置: 「" + Txt.Vis(raw) + "」");
        trace?.Shot($"sau-khi-go-{c.TrtCd}");
        return result;
    }

    /// <summary>
    /// Ô 療法・処置 <b>nguyên văn</b> — KHÔNG qua <c>Txt.N</c>, nên giữ nguyên
    /// <c>\r\n</c> giữa các dòng của <c>combineDrugNms</c>.
    /// </summary>
    public static string RawRyo(RegiRow row)
    {
        try
        {
            var cells = Uia.Children(row.Element).ToList();
            return cells.Count > RegiGrid.Col.Ryo
                ? Uia.ValueOf(cells[RegiGrid.Col.Ryo])
                : "";
        }
        catch { return ""; }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // LỐI VÀO THỨ HAI — 薬剤選択 (Shift+F6, frm203013)
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>AutomationId của nút bật/tắt dải phím Shift (BaseForm.Designer).</summary>
    public const string ShiftToggleId = "btnShift";

    /// <summary>Nhãn nút Shift khi dải Shift ĐANG BẬT (<c>CommonOcha.BTN_ON</c>).</summary>
    public const string ShiftOnText = "ON";

    /// <summary>
    /// Mở 薬剤選択 bằng <b>dải phím Shift</b> chứ không bằng tổ hợp phím.
    ///
    /// <para><c>frm203002.btnF6_Click</c> rẽ theo <c>ShiftFlg</c> (:826-838): tắt thì ra
    /// コメント, bật mới ra 薬剤. Mà <c>ShiftFlg</c> chỉ được đặt trong
    /// <c>BaseForm.editButtonPanel</c> — hoặc do <c>btnShift</c>, hoặc do
    /// <c>Keys.ShiftKey</c> ở KeyDown/KeyUp (BaseForm.cs:613/:646).</para>
    ///
    /// <para>Chọn đường NÚT vì hai lẽ: phím F rơi vào form đang giữ tiêu điểm (F15), và
    /// gửi tổ hợp Shift+F6 thì thứ tự KeyDown giữa hai phím là chuyện của bộ gõ — sai
    /// nhịp một cái là mở nhầm コメント mà không có dấu hiệu gì. Bấm <c>btnShift</c> rồi
    /// bấm nút mang chữ 「薬剤」 thì không có chỗ cho nhầm lẫn.</para>
    /// </summary>
    public MedicineSelectDialog? OpenMedicineSelect(TestTrace? trace = null)
    {
        var toggle = Uia.ById(_screen.Window, ShiftToggleId);
        if (toggle is null)
        {
            trace?.Note($"KHONG thay nut 「{ShiftToggleId}」 tren 診療入力 — khong bat duoc dai phim Shift.");
            return null;
        }

        var label = Txt.N(Uia.NameOf(toggle));
        if (!Txt.Has(label, ShiftOnText))
        {
            trace?.Do($"bam 「{ShiftToggleId}」 de BAT dai phim Shift (dang la 「{label}」)",
                      () => Uia.MouseClick(toggle));
            Thread.Sleep(600);
        }
        else trace?.Note($"dai phim Shift da BAT san (nhan 「{label}」)");

        var med = Uia.Descendants(_screen.Window).FirstOrDefault(
            e => Uia.ControlTypeOf(e) == ControlType.Button && Txt.Has(Uia.NameOf(e), "薬剤"));
        if (med is null)
        {
            trace?.Note("KHONG thay nut 「薬剤」 tren dai phim Shift. Nut doc duoc: " +
                        string.Join(", ", VisibleButtonNames()));
            trace?.Shot("khong-thay-nut-yakuzai");
            return null;
        }

        trace?.Do("bam nut 「薬剤」 (= Shift+F6)", () => Uia.MouseClick(med));
        var dialog = MedicineSelectDialog.WaitFor(_app, _screen.Window, TimeSpan.FromSeconds(20));
        if (dialog is null)
        {
            trace?.Note("薬剤選択 KHONG mo. Hop thoai dang mo: " + _entry.Base.DescribeDialogs());
            trace?.Shot("khong-mo-203013");
        }
        else trace?.Shot("yakuzai-sentaku-mo");
        return dialog;
    }

    /// <param name="Opened">薬剤選択 có mở ra không.</param>
    /// <param name="Picked">Đã double-click được dòng của mã cần chọn chưa.</param>
    /// <param name="Selected">Nội dung lưới PHẢI ngay trước khi 確定 — bằng chứng đã chọn đúng.</param>
    public sealed record MedicineResult(bool Opened, bool Picked, bool Confirmed,
                                        IReadOnlyList<string> Selected, RegiRow? Row,
                                        string RawRyo, IReadOnlyList<string> Dialogs)
    {
        /// <inheritdoc cref="PathBResult.SplitLines"/>
        public IReadOnlyList<string> Lines => PathBResult.SplitLines(RawRyo);

        public override string ToString() =>
            $"mở={Opened} chọn={Picked} 確定={Confirmed} · đã chọn=[{string.Join(" ; ", Selected)}] · " +
            $"dòng=「{Row?.ToString() ?? "KHÔNG CÓ"}」 · {Lines.Count} dòng text " +
            $"[{string.Join(" ⏎ ", Lines)}]" +
            (Dialogs.Count > 0 ? $" · hộp thoại=[{string.Join(" / ", Dialogs)}]" : "");
    }

    /// <summary>
    /// Trọn một lượt qua 薬剤選択: Shift+F6 → tab theo <c>grp</c> → double-click dòng →
    /// 「F9 確定」 → đọc dòng vừa rơi xuống lưới.
    ///
    /// <para>Nhận dòng mới bằng PHẦN CHÊNH so với ảnh chụp trước khi mở hộp thoại — cùng
    /// lý do như lối gõ mã.</para>
    /// </summary>
    public MedicineResult PickViaMedicineSelect(DrugPathBDb.PathBCandidate c, int grp,
                                                TestTrace? trace = null)
    {
        var before = _entry.RowsNow();

        var dialog = OpenMedicineSelect(trace);
        if (dialog is null) return new MedicineResult(false, false, false, [], null, "", []);

        if (!dialog.SelectTab(grp, trace))
            trace?.Note($"khong chuyen duoc sang tab grp {grp} — van thu doc luoi hien tai. " +
                        $"Tab doc duoc: [{string.Join(", ", dialog.TabNames())}]");

        var row = dialog.FindRow(grp, c.TrtCd, c.TrtSb);
        if (row is null)
        {
            var rows = dialog.SourceRows(grp);
            trace?.Note($"KHONG thay {c.TrtCd}/{c.TrtSb} trong tab grp {grp} ({rows.Count} dong): " +
                        string.Join(" · ", rows.Take(12)));
            trace?.Shot("khong-thay-dong-thuoc");
            dialog.Cancel(trace);
            return new MedicineResult(true, false, false, [], null, "", []);
        }

        dialog.Pick(row, trace);
        var selected = dialog.SelectedRows();
        trace?.Note($"luoi PHAI sau khi double-click: [{string.Join(" ; ", selected)}]");

        var confirmed = dialog.Confirm(trace);
        if (!confirmed)
            trace?.Note("bam 確定 xong ma hop thoai chua dong: " + _entry.Base.DescribeDialogs());

        // frmMed_LetData chạy vòng theo TỪNG dòng đã chọn, mỗi vòng đi qua
        // frm203016_Hide_Let_Trt_Data ⇒ 診療チェック có thể bung ra giữa chừng.
        var seen = new List<string>();
        var stray = Waits.TryFor(() => _entry.Base.OpenDialogs().FirstOrDefault(),
                                 TimeSpan.FromSeconds(5));
        if (stray is not null)
        {
            try
            {
                var text = Txt.N(Dialogs.TextOf(stray));
                seen.Add(text);
                trace?.Note($"hop thoai sau 確定: 「{text}」");
                trace?.Shot("hop-thoai-sau-confirm-med");
            }
            catch { /* vừa đóng */ }
            seen.AddRange(_entry.Base.DismissAll(trace: trace));
        }

        if (_entry.Grid.IsEditing())
        {
            trace?.Note($"editor dang mo voi 「{_entry.Grid.EditorText()}」 — Enter de dong");
            _entry.Grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(500);
        }

        var landed = _entry.WaitForAddedDrugRow(before, c.RowNeedle, TimeSpan.FromSeconds(25), trace);
        var raw = landed is null ? "" : RawRyo(landed);

        var result = new MedicineResult(true, true, confirmed, selected, landed, raw, seen);
        trace?.Note("do duoc (yakuzai-sentaku): " + result);
        trace?.Note("nguyen van o 療法・処置: 「" + Txt.Vis(raw) + "」");
        trace?.Shot($"sau-confirm-med-{c.TrtCd}");
        return result;
    }

    private IReadOnlyList<string> VisibleButtonNames()
    {
        try
        {
            return _screen.Window
                          .FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                          .Select(b => Txt.N(Uia.NameOf(b)))
                          .Where(n => n.Length > 0)
                          .ToList();
        }
        catch { return []; }
    }

    /// <summary>Dọn mọi cửa sổ còn mở — gọi ở <c>[TearDown]</c> để testcase sau không đỏ oan.</summary>
    public void CancelAll(TestTrace? trace = null)
    {
        if (MedicineSelectDialog.Find(_app, _screen.Window) is { } med)
        {
            trace?.Note("dong 薬剤選択 bang 「F10 戻る」 (⛔ KHONG dung Escape — Escape la 確定)");
            med.Cancel(trace);
        }
        _entry.CancelAll(trace);
    }
}
