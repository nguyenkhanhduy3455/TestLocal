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
    private readonly DrugAmountFlow _entry;

    public DrugPathBFlow(OchaApp app, TreatmentEntryScreen screen)
        => _entry = new DrugAmountFlow(app, screen);

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
        public IReadOnlyList<string> Lines =>
            RawRyo.Split(["\r\n", "\n"], StringSplitOptions.None)
                  .Select(l => l.TrimEnd())
                  .Where(l => l.Trim().Length > 0)
                  .Select(l => l.StartsWith(Pad, StringComparison.Ordinal) ? l[Pad.Length..] : l.TrimStart())
                  .ToList();

        public const string Pad = "  ";

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

        var row = _entry.WaitForAddedDrugRow(before, c.TrtNm, TimeSpan.FromSeconds(15), trace);
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

    /// <summary>Dọn mọi cửa sổ còn mở — gọi ở <c>[TearDown]</c> để testcase sau không đỏ oan.</summary>
    public void CancelAll(TestTrace? trace = null) => _entry.CancelAll(trace);
}
