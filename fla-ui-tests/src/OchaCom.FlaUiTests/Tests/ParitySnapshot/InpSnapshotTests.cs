using FlaUI.Core.Input;
using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;
using FlaUI.Core.WindowsAPI;
using FlaUI.Core.Definitions;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.ParitySaveData;
using OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

namespace OchaCom.FlaUiTests.Tests.ParitySnapshot;

/// <summary>
/// <b>Parity 診療入力 — vế WinForm.</b> Mỗi [Test] là MỘT kịch bản: làm đúng một thao
/// tác rồi ghi snapshot (<see cref="InpSnapshot"/>). Vế web cùng tên kịch bản ở
/// <c>web-tenant-tests/tests/parity-snapshot/</c>; danh sách kịch bản + tiến độ ở
/// <c>tools/parity-snapshot/README.md</c>.
///
/// <para>Bệnh nhân / ngày: <c>OCHA_PAT_NO</c> / <c>OCHA_TRT_DT</c>. KHÔNG kịch bản nào ở
/// đây bấm F9 登録 ⇒ không ghi DB.</para>
///
/// <para>Chạy MỘT kịch bản mỗi lượt (app mở mới mỗi lượt — runner kill MENU.exe trước và
/// sau): <c>.\run-inp-snapshot.ps1 -PatNo 3948 -TrtDt 2026-06-28 -Case Open</c></para>
/// </summary>
[TestFixture]
[Category("parity-snapshot")]
public sealed class InpSnapshotTests : UiTestBase
{
    /// <summary>Tên kịch bản = tên method dạng kebab-case (Open → open, KobeSearch → kobe-search),
    /// trùng với test <c>case:&lt;tên&gt;</c> của vế web.</summary>
    private void Dump(IReadOnlyDictionary<string, object?>? extra = null)
    {
        var name = System.Text.RegularExpressions.Regex
            .Replace(TestContext.CurrentContext.Test.MethodName!, "([a-z0-9])([A-Z])", "$1-$2")
            .ToLowerInvariant();
        InpSnapshot.Write(Screen, PatNo, TrtDate, name, extra);
    }

    /// <summary>Mở màn, không làm gì.</summary>
    [Test]
    public void Open() => Dump();

    // ── A1 panel phải: chọn tab, đọc danh sách ─────────────────────────────

    private void PanelTab(string tab)
    {
        InpSnapshot.OpenPanelTab(Screen, tab);
        Dump(new Dictionary<string, object?> { ["panel"] = InpSnapshot.ReadPanel(Screen) });
    }

    [Test] public void PanelByou() => PanelTab("病検");
    [Test] public void PanelGuide() => PanelTab("ガイド");
    [Test] public void PanelPack() => PanelTab("パック");
    [Test] public void PanelKobe() => PanelTab("個別");

    // ── A2 nhập lưới ─────────────────────────────────────────────────────────

    /// <summary>コードモード, gõ 110 vào ô 点 của dòng 日計 + Enter ⇒ 処置選択 mở. Chụp danh sách.</summary>
    [Test]
    public void CodeEntryPicker()
    {
        InpSnapshot.EnsureMode(Screen, "コード");
        InpSnapshot.TypeIntoFooterTen(Screen, "110");
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(10));
        Dump(new Dictionary<string, object?> { ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window) });
    }

    /// <summary>
    /// Tiếp <see cref="CodeEntryPicker"/>: chọn 110-0 → 確定 → Enter ô 回. Chụp lưới + các hộp
    /// thoại bung ra NGAY SAU khi chốt (không trả lời — chúng chính là thứ đem so).
    /// </summary>
    [Test]
    public void CodeEntryCommit()
    {
        EnterCode110();
        Dump(new Dictionary<string, object?> { ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window) });
    }

    /// <summary>コードモード: 110 vào ô 点 dòng 日計 → 110-0 → 確定 → Enter ô 回.</summary>
    private void EnterCode110()
    {
        InpSnapshot.EnsureMode(Screen, "コード");
        InpSnapshot.TypeIntoFooterTen(Screen, "110");
        var picker = Waits.For(() => ModalDialogs.All(App, Screen.Window).FirstOrDefault(), "処置選択");
        var gridEl = picker.FindFirstDescendant(cf => cf.ByControlType(ControlType.DataGrid).Or(cf.ByControlType(ControlType.Table)));
        var row = new WinFormsGrid(gridEl!).Rows(10).FirstOrDefault(r => Txt.Int(r.At(1)) == 0 && Txt.Int(r.At(0)) == 110);
        Assert.That(row, Is.Not.Null, "処置選択 không có dòng 110-0");
        Uia.MouseClick(row!.Element);
        Assert.That(Dialogs.ClickButtonContaining(picker, "確定"), Is.True, "không bấm được 確定");

        var ops = new TreatmentGridOps(Screen);
        Waits.TryUntil(() => ops.IsEditing(), TimeSpan.FromSeconds(10));
        ops.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(2000);
    }

    private Dictionary<string, object?> Dialogs_() =>
        new() { ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window) };

    /// <summary>点数モード, gõ 59 vào ô 点 của dòng 日計 + Enter ⇒ 処置選択 theo 点数.</summary>
    [Test]
    public void PointEntryPicker()
    {
        InpSnapshot.EnsureMode(Screen, "点数");
        InpSnapshot.TypeIntoFooterTen(Screen, "59");
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(10));
        Dump(Dialogs_());
    }

    /// <summary>個別: 検索 ｺｰﾄﾞ 110 → 選択№ 1 (= 110-0) Enter ⇒ chèn xuống lưới.</summary>
    [Test]
    public void KobeSelect()
    {
        InpSnapshot.OpenPanelTab(Screen, "個別");
        Screen.Kobetu.SearchByCode(110);
        InpSnapshot.SelectNo(Screen, "個別", 1);
        Dump(Dialogs_());
    }

    /// <summary>パック: 選択№ 1 Enter ⇒ パック処置選択 (hoặc chèn thẳng).</summary>
    [Test]
    public void PackSelect()
    {
        InpSnapshot.OpenPanelTab(Screen, "パック");
        InpSnapshot.SelectNo(Screen, "パック", 1);
        Dump(Dialogs_());
    }

    /// <summary>ガイド: 選択№ 1 Enter ⇒ ガイド処置選択.</summary>
    [Test]
    public void GuideSelect()
    {
        InpSnapshot.OpenPanelTab(Screen, "ガイド");
        InpSnapshot.SelectNo(Screen, "ガイド", 1);
        Dump(Dialogs_());
    }

    /// <summary>Như <see cref="KobeSelect"/> rồi Enter ô 回 (chốt) — so trạng thái sau khi chốt.</summary>
    [Test]
    public void KobeCommit()
    {
        InpSnapshot.OpenPanelTab(Screen, "個別");
        Screen.Kobetu.SearchByCode(110);
        InpSnapshot.SelectNo(Screen, "個別", 1);
        var ops = new TreatmentGridOps(Screen);
        Waits.TryUntil(() => ops.IsEditing(), TimeSpan.FromSeconds(10));
        ops.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(2000);
        Dump(Dialogs_());
    }

    /// <summary>Ô 部位 của dòng 日計 + Enter ⇒ 部位選択 (frm203002 A5).</summary>
    [Test]
    public void BuiDialog()
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "日計"));
        Assert.That(row, Is.Not.Null, "lưới không có dòng 日計");
        ops.FocusCell(row!, RegiGrid.Col.Bui);
        ops.Press(VirtualKeyShort.RETURN);
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(10));
        Dump(Dialogs_());
    }

    // ── A3 thao tác dòng ─────────────────────────────────────────────────────

    /// <summary>
    /// Đặt con trỏ vào ô 療法・処置 của dòng CUỐI có chữ <paramref name="ryo"/> (tháng hiện hành
    /// nằm dưới cùng) rồi bấm <paramref name="key"/>. Chụp lưới + hộp thoại (không trả lời).
    /// </summary>
    private void KeyOnRow(string ryo, VirtualKeyShort key)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, ryo));
        Assert.That(row, Is.Not.Null, $"lưới không có dòng 「{ryo}」");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        ops.Press(key);
        Thread.Sleep(1500);
        Dump(Dialogs_());
    }

    [Test] public void RowInsert() => KeyOnRow("歯科疾患管理料", VirtualKeyShort.INSERT);
    [Test] public void RowDeleteTrt() => KeyOnRow("歯科疾患管理料", VirtualKeyShort.DELETE);
    [Test] public void RowDeleteBui() => KeyOnRow("MT(Br)", VirtualKeyShort.DELETE);
    [Test] public void RowDeleteNikkei() => KeyOnRow("日計", VirtualKeyShort.DELETE);
    [Test] public void RowInsertNikkei() => KeyOnRow("日計", VirtualKeyShort.INSERT);

    // ── A4 phím F (lớp thường) ───────────────────────────────────────────────

    /// <summary>
    /// Con trỏ ở ô 療法・処置 của 歯科疾患管理料 (dòng 処置 trung tính, để phím rơi vào form chính
    /// — FLA-UI-GUIDELINE F15) rồi bấm <paramref name="key"/>. Chụp lưới + panel + hộp thoại.
    /// </summary>
    private void FKey(VirtualKeyShort key)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "歯科疾患管理料"));
        Assert.That(row, Is.Not.Null, "lưới không có dòng 歯科疾患管理料");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        ops.Press(key);
        Thread.Sleep(2000);
        // Hộp thoại có thể bung muộn (tra cứu STEP ガイド…) — chờ thêm tối đa 6s.
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(6));
        Dump(new Dictionary<string, object?>
        {
            ["panel"] = InpSnapshot.ReadPanel(Screen),
            ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window),
        });
    }

    [Test] public void FKeyF1() => FKey(VirtualKeyShort.F1);
    [Test] public void FKeyF2() => FKey(VirtualKeyShort.F2);
    [Test] public void FKeyF4() => FKey(VirtualKeyShort.F4);
    [Test] public void FKeyF5() => FKey(VirtualKeyShort.F5);
    [Test] public void FKeyF6() => FKey(VirtualKeyShort.F6);
    [Test] public void FKeyF7() => FKey(VirtualKeyShort.F7);
    [Test] public void FKeyF12() => FKey(VirtualKeyShort.F12);

    /// <summary>F10 戻る ⇒ rời 診療入力 (không sửa gì nên không hỏi lưu). Chỉ so cửa sổ đang mở.</summary>
    [Test]
    public void FKeyF10()
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "歯科疾患管理料"));
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        ops.Press(VirtualKeyShort.F10);
        Thread.Sleep(4000);
        Dump(Dialogs_());
    }

    /// <summary>
    /// F3 チェック ⇒ panel 処置データチェック (PnlChek / grdChek / lbChk, frm203002.cs:5205-5222)
    /// hoặc I00100 「エラーはありません。」. Chụp số lỗi + từng câu (bỏ dòng 「----- 以上 -----」).
    /// </summary>
    [Test]
    public void FKeyF3()
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "歯科疾患管理料"));
        Assert.That(row, Is.Not.Null, "lưới không có dòng 歯科疾患管理料");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        ops.Press(VirtualKeyShort.F3);
        Thread.Sleep(4000);

        var lines = new List<string>();
        var grid = Uia.ById(Screen.Window, "grdChek");
        if (grid is not null)
            foreach (var r in InpSnapshot.ReadGrid(grid, 200).Rows)
            {
                var msg = r.LastOrDefault(c => c is not ("" or "(null)")) ?? "";
                if (msg != "" && !Txt.Has(msg, "以上")) lines.Add(msg);
            }
        var countBox = Uia.ById(Screen.Window, "lbChk");
        Dump(new Dictionary<string, object?>
        {
            ["check"] = new Dictionary<string, object?>
            {
                ["count"] = countBox is null ? "" : new string(Txt.N(Uia.ValueOf(countBox)).Where(char.IsDigit).ToArray()),
                ["lines"] = lines,
            },
            ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window),
        });
    }

    // ── A5 lớp Shift (chỉ các phím ở lại màn này) ─────────────────────────────

    private void ShiftKey(VirtualKeyShort key)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "歯科疾患管理料"));
        Assert.That(row, Is.Not.Null, "lưới không có dòng 歯科疾患管理料");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        Keyboard.TypeSimultaneously(VirtualKeyShort.SHIFT, key);
        Thread.Sleep(2000);
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(6));
        Dump(new Dictionary<string, object?>
        {
            ["inpMode"] = InpSnapshot.InpMode(Screen),
            ["panel"] = InpSnapshot.ReadPanel(Screen),
            ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window),
        });
    }

    [Test] public void ShiftF2() => ShiftKey(VirtualKeyShort.F2);
    [Test] public void ShiftF4() => ShiftKey(VirtualKeyShort.F4);
    [Test] public void ShiftF6() => ShiftKey(VirtualKeyShort.F6);
    [Test] public void ShiftF9() => ShiftKey(VirtualKeyShort.F9);
    [Test] public void ShiftF10() => ShiftKey(VirtualKeyShort.F10);
    // Các phím mở MÀN/HỘP THOẠI khác (snapshot chịu được màn chính bị che — mainHidden).
    [Test] public void ShiftF3() => ShiftKey(VirtualKeyShort.F3);
    [Test] public void ShiftF5() => ShiftKey(VirtualKeyShort.F5);
    [Test] public void ShiftF7() => ShiftKey(VirtualKeyShort.F7);
    [Test] public void ShiftF11() => ShiftKey(VirtualKeyShort.F11);

    // ── A6 nút dưới lưới ─────────────────────────────────────────────────────

    /// <summary>Con trỏ ở 歯科疾患管理料 rồi bấm nút <paramref name="buttonId"/> (click chuột thật).</summary>
    private void ButtonClick(string buttonId)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "歯科疾患管理料"));
        Assert.That(row, Is.Not.Null, "lưới không có dòng 歯科疾患管理料");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        Uia.MouseClick(Uia.RequireById(Screen.Window, buttonId));
        Thread.Sleep(2500);
        Dump(Dialogs_());
    }

    [Test] public void BtnJikangai() => ButtonClick("btnJikangai");
    [Test] public void BtnKyuujitu() => ButtonClick("btnKyuujitu");
    [Test] public void BtnSinya() => ButtonClick("btnSinya");
    [Test] public void BtnSikan() => ButtonClick("btnSikan");
    [Test] public void BtnSidou() => ButtonClick("btnSidou");
    [Test] public void BtnHokan() => ButtonClick("btnHokan");
    [Test] public void BtnReceipt() => ButtonClick("btnReceipt");
    [Test] public void BtnHotetu() => ButtonClick("btnHotetu");

    // ── A6 履歴 ───────────────────────────────────────────────────────────────

    private void History(params string[] menuPath)
    {
        Uia.MouseClick(Uia.RequireById(Screen.Window, "btnRireki"));
        Thread.Sleep(600);
        InpSnapshot.ClickMenuPath(App, menuPath);
        Thread.Sleep(2000);
        Dump(new Dictionary<string, object?>
        {
            ["history"] = InpSnapshot.ReadHistory(Screen),
            ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window),
        });
    }

    [Test] public void HistLast() => History("履歴を表示", "前回来院月");

    /// <summary>
    /// Như <see cref="History"/> nhưng chọn bằng phím tắt của menu (&amp;1 履歴を表示 → &amp;3 / &amp;6): dò
    /// mục 過去３ヶ月 / すべて表示 theo chữ không ra trong cây UIA dù menu đang hiện (đo 2026-10-05).
    /// </summary>
    private void HistoryByKeys(params VirtualKeyShort[] keys)
    {
        Uia.MouseClick(Uia.RequireById(Screen.Window, "btnRireki"));
        Thread.Sleep(600);
        foreach (var k in keys)
        {
            Keyboard.Press(k);
            Thread.Sleep(600);
        }
        Thread.Sleep(2000);
        Dump(new Dictionary<string, object?>
        {
            ["history"] = InpSnapshot.ReadHistory(Screen),
            ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window),
        });
    }

    [Test] public void Hist3Month() => HistoryByKeys(VirtualKeyShort.KEY_1, VirtualKeyShort.KEY_3);
    [Test] public void HistAll() => HistoryByKeys(VirtualKeyShort.KEY_1, VirtualKeyShort.KEY_6);
    [Test] public void Hist6Month() => HistoryByKeys(VirtualKeyShort.KEY_1, VirtualKeyShort.KEY_4);
    [Test] public void Hist1Year() => HistoryByKeys(VirtualKeyShort.KEY_1, VirtualKeyShort.KEY_5);
    /// <summary>&amp;1 履歴を表示 → &amp;2 日付を指定 ⇒ hộp chọn tháng (frm902004).</summary>
    [Test] public void HistSelect() => HistoryByKeys(VirtualKeyShort.KEY_1, VirtualKeyShort.KEY_2);

    /// <summary>Hiện 前回来院月 rồi &amp;2 履歴を隠す ⇒ panel 履歴 biến mất.</summary>
    [Test]
    public void HistHide()
    {
        Uia.MouseClick(Uia.RequireById(Screen.Window, "btnRireki"));
        Thread.Sleep(600);
        InpSnapshot.ClickMenuPath(App, "履歴を表示", "前回来院月");
        Thread.Sleep(1500);
        HistoryByKeys(VirtualKeyShort.KEY_2);
    }

    // ── A7 menu F11 (mở màn / hộp thoại, KHÔNG lưu) ──────────────────────────

    /// <summary>Con trỏ ở 歯科疾患管理料 → F11 → bấm lần lượt <paramref name="path"/>.</summary>
    private void F11Menu(params string[] path)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "歯科疾患管理料"));
        Assert.That(row, Is.Not.Null, "lưới không có dòng 歯科疾患管理料");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        ops.Press(VirtualKeyShort.F11);
        Thread.Sleep(600);
        InpSnapshot.ClickMenuPath(App, path);
        Thread.Sleep(2500);
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(6));
        Dump(Dialogs_());
    }

    [Test] public void F11Karte() => F11Menu("4 カルテ");
    [Test] public void F11Pat() => F11Menu("5 患者登録");
    [Test] public void F11Exa() => F11Menu("6 口腔内情報");
    [Test] public void F11PatInfo() => F11Menu("8 患者登録(患者選択)");
    [Test] public void F11OptChkPrm() => F11Menu("9 オプション", "1 チェック項目設定");
    [Test] public void F11OptInpOpt() => F11Menu("9 オプション", "2 処置入力設定");
    [Test] public void F11OptRestrictDis() => F11Menu("9 オプション", "3 必要病名登録");
    [Test] public void F11OptChkAuto() => F11Menu("9 オプション", "4 自動算定登録");
    [Test] public void F11OptAuto() => F11Menu("9 オプション", "5 処置自動入力登録");
    [Test] public void F11OptAutoCmt() => F11Menu("9 オプション", "6 コメント自動入力登録");
    [Test] public void F11OptChkRule() => F11Menu("9 オプション", "8 チェックルール登録");
    [Test] public void F11OptStep() => F11Menu("9 オプション", "Step");

    // ── A1/A6 bổ sung: ガイド 全て表示, nút M / P / I / T ─────────────────────

    /// <summary>Tab ガイド → 全て表示 (cmdGuidAll). 前回 / リセット chỉ hiện ở STEP (frm203002.cs:1995-2003).</summary>
    [Test]
    public void GuideAll()
    {
        InpSnapshot.OpenPanelTab(Screen, "ガイド");
        Uia.MouseClick(Uia.RequireById(Screen.Window, "cmdGuidAll"));
        Thread.Sleep(2000);
        Dump(new Dictionary<string, object?>
        {
            ["panel"] = InpSnapshot.ReadPanel(Screen),
            ["dialogs"] = InpSnapshot.ReadDialogs(App, Screen.Window),
        });
    }

    private void ClickImg(string id)
    {
        Uia.MouseClick(Uia.RequireById(Screen.Window, id));
        Thread.Sleep(2000);
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(5));
        Dump(Dialogs_());
    }

    [Test] public void ImgM() => ClickImg("imgMsg");
    [Test] public void ImgP() => ClickImg("imgPCond");
    [Test] public void ImgI() => ClickImg("imgPI");
    [Test] public void ImgT() => ClickImg("imgTCond");

    // ── A2 sửa ô của dòng có sẵn ─────────────────────────────────────────────

    /// <summary>Gõ <paramref name="typed"/> vào ô <paramref name="col"/> của dòng CUỐI có chữ <paramref name="ryo"/> rồi Enter.</summary>
    private void EditCell(string ryo, int col, string typed)
    {
        TypeIntoCell(ryo, col, typed);
        Dump(Dialogs_());
    }

    private void TypeIntoCell(string ryo, int col, string typed)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, ryo));
        Assert.That(row, Is.Not.Null, $"lưới không có dòng 「{ryo}」");
        FocusCellScrolling(ops, row!, col);
        Thread.Sleep(300);
        ops.Type(typed);
        ops.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(2000);
        Waits.TryUntil(() => InpSnapshot.ReadDialogs(App, Screen.Window).Count > 0, TimeSpan.FromSeconds(3));
    }

    /// <summary>
    /// Như <c>FocusCell</c>, nhưng dòng nằm NGOÀI khung nhìn (UIA trả rect rỗng — FLA-UI-GUIDELINE
    /// F10) thì click ô cùng cột của dòng 日計 cuối (luôn thấy) rồi bấm ↑ cho tới dòng đích.
    /// </summary>
    private static void FocusCellScrolling(TreatmentGridOps ops, RegiRow row, int col)
    {
        try { ops.FocusCell(row, col); return; }
        catch (InvalidOperationException) { /* ngoài khung nhìn */ }
        var rows = ops.Snapshot();
        var anchor = rows.Last(r => Txt.Has(r.Ryo, "日計"));
        ops.FocusCell(anchor, col);
        for (var i = 0; i < anchor.Index - row.Index; i++) { ops.Press(VirtualKeyShort.UP); Thread.Sleep(80); }
        Thread.Sleep(300);
    }

    [Test] public void EditKai() => EditCell("歯科疾患管理料", RegiGrid.Col.Kai, "2");
    [Test] public void EditTen() => EditCell("歯科疾患管理料", RegiGrid.Col.Ten, "100");
    /// <summary>日 của dòng đầu ngày 28 tháng 06 (歯科再診料) → 27: 日付変更 trên lưới.</summary>
    [Test] public void EditDay() => EditCell("歯科再診料", RegiGrid.Col.Day, "27");

    // ── A3 menu chuột phải: コピー / 貼り付け ─────────────────────────────────

    /// <summary>Chuột phải vào ô 療法・処置 của dòng CUỐI có chữ <paramref name="ryo"/> rồi chọn mục menu.</summary>
    private void RightClickRow(string ryo, string menuItem)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, ryo));
        Assert.That(row, Is.Not.Null, $"lưới không có dòng 「{ryo}」");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        var cell = Uia.Children(row!.Element).ElementAt(RegiGrid.Col.Ryo);
        var (x, y) = Uia.Center(cell);
        Uia.RightClickPhysical(x, y);
        Thread.Sleep(600);
        InpSnapshot.ClickMenuPath(App, menuItem);
        Thread.Sleep(1500);
    }

    /// <summary>Chuột phải vào dòng ⇒ chụp các mục menu (hiện / bấm được) — không bấm mục nào.</summary>
    private void RowMenu(string ryo)
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, ryo));
        Assert.That(row, Is.Not.Null, $"lưới không có dòng 「{ryo}」");
        ops.FocusCell(row!, RegiGrid.Col.Ryo);
        var cell = Uia.Children(row!.Element).ElementAt(RegiGrid.Col.Ryo);
        var (x, y) = Uia.Center(cell);
        Uia.RightClickPhysical(x, y);
        Thread.Sleep(1000);
        Dump(new Dictionary<string, object?> { ["menu"] = InpSnapshot.ReadMenuItems(App) });
    }

    [Test] public void RowMenuTrt() => RowMenu("歯科疾患管理料");
    [Test] public void RowMenuBui() => RowMenu("MT(Br)");
    [Test] public void RowMenuNikkei() => RowMenu("日計");

    // ── A2 部位選択 → 病名選択 ────────────────────────────────────────────────

    /// <summary>
    /// Ô 部位 dòng 日計 + Enter ⇒ 部位選択; bàn phím: Delete (xoá hết) → → (sang vùng 左上) → 1 →
    /// End (= 確定, frm902003.cs:196) ⇒ 病名選択 mở. Chụp hộp 病名選択.
    /// </summary>
    [Test]
    public void BuiToDisease()
    {
        var ops = new TreatmentGridOps(Screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "日計"));
        ops.FocusCell(row!, RegiGrid.Col.Bui);
        ops.Press(VirtualKeyShort.RETURN);
        var tooth = ToothSelectDialog.WaitFor(App, Screen.Window, TimeSpan.FromSeconds(10));
        Assert.That(tooth, Is.Not.Null, "部位選択 không mở");
        ToothSelectDialog.SelectUpperLeftTeeth(tooth!, [1]);
        Uia.SendKey(Vk.End);
        Thread.Sleep(2500);
        if (TestContext.CurrentContext.Test.MethodName == nameof(BuiCommit))
        {
            // 病名選択: 選択番号 1 (Ｃ) → Enter ⇒ danh sách 枝番 → 1 → Enter ⇒ chèn 部位病名行.
            for (var i = 0; i < 2; i++)
            {
                Keyboard.Type("1");
                Keyboard.Press(VirtualKeyShort.RETURN);
                Thread.Sleep(1500);
            }
            // 病名 ghép dần ở ô trên cùng (「C₂」); End = 登録 mới chốt.
            Uia.SendKey(Vk.End);
            Thread.Sleep(2500);
        }
        Dump(Dialogs_());
    }

    /// <summary>Như <see cref="BuiToDisease"/> rồi chọn 病名 №1 (Ｃ) ⇒ dòng 部位病名 mới.</summary>
    [Test] public void BuiCommit() => BuiToDisease();

    // ── B: thao tác GHI DB — CHỈ chạy trên bệnh nhân nhân bản (tools/parity-snapshot/clone-patient.sh) ──

    /// <summary>Chặn ghi nhầm vào bệnh nhân thật: Phase B chỉ nhận số >= 990000.</summary>
    private void RequireClonedPatient()
    {
        if (PatNo < 990000)
            Assert.Ignore($"Phase B ghi DB — chỉ chạy với bệnh nhân nhân bản (>= 990000), đang là {PatNo}");
    }

    /// <summary>F9 登録 → はい → màn đóng → mở lại → chụp (lưới SAU khi nạp lại từ DB).</summary>
    private void SaveAndReopen()
    {
        // Cảnh báo nghiệp vụ chỉ có OK (vd 「…当日算定不可です。」 sau 再診 trên ngày 初診) chặn F9 —
        // bấm OK và GHI LẠI chữ để so với web.
        var alerts = new List<string>();
        for (var i = 0; i < 5; i++)
        {
            var d = ModalDialogs.All(App, Screen.Window).FirstOrDefault();
            if (d is null) break;
            var text = Txt.N(Dialogs.TextOf(d)); // đọc TRƯỚC khi bấm — hộp đóng thì hết chữ
            if (!Dialogs.ClickButton(d, "OK")) break;
            alerts.Add(text);
            Thread.Sleep(800);
        }
        var r = SaveFlow.PressF9(App, Screen.Window, SaveFlow.SaveAnswer.Yes);
        ReopenTreatmentScreen();
        Dump(new Dictionary<string, object?> { ["saveQuestion"] = r.SaveQuestionText, ["preSaveAlerts"] = alerts });
    }

    /// <summary>B1 — nhập 110-0 歯科再診料 vào ngày 28 rồi lưu.</summary>
    [Test]
    public void SaveCodeEntry()
    {
        RequireClonedPatient();
        EnterCode110();
        SaveAndReopen();
    }

    /// <summary>B2 — sửa ô 日 dòng ĐẦU ngày 28 (歯科再診料) thành 27 rồi lưu (P-013 sau khi lưu).</summary>
    [Test]
    public void SaveEditDay()
    {
        RequireClonedPatient();
        TypeIntoCell("歯科再診料", RegiGrid.Col.Day, "27");
        SaveAndReopen();
    }

    /// <summary>B0 — không sửa gì, F9 はい (câu hỏi phải là 「変更されていません」; DB không đổi).</summary>
    [Test]
    public void SaveNoChange()
    {
        RequireClonedPatient();
        SaveAndReopen();
    }

    /// <summary>
    /// B3 — 日付変更 (IDM_DateChg): chuột phải cột 日 của dòng 歯科再診料 (ngày 28) → 「日付変更」
    /// → frm203051 nhập 27 → 確定 → Q00100 はい → F9 lưu. Đổi CẢ ngày 28 sang 27.
    /// </summary>
    [Test]
    public void SaveDateChange()
    {
        RequireClonedPatient();
        var ops = new TreatmentGridOps(Screen);
        var target = ops.Snapshot().Last(r => Txt.Has(r.Ryo, "歯科再診料"));
        FocusCellScrolling(ops, target, RegiGrid.Col.Day);
        // IDM_DateChg đọc hFG1[78, CurrentCellAddress.Y] — dòng của Ô HIỆN HÀNH, chuột phải không
        // dời ô hiện hành. Nên chuột phải vào ô 日 của bất kỳ dòng nào đang THẤY (dòng đích có
        // thể đã cuộn khuất: UIA trả rect rỗng — FLA-UI-GUIDELINE F10).
        var visible = new TreatmentGridOps(Screen).Snapshot()
            .Select(r => Uia.Children(r.Element).ElementAt(RegiGrid.Col.Day))
            .First(c => !c.BoundingRectangle.IsEmpty && c.BoundingRectangle.Width > 0);
        var (x, y) = Uia.Center(visible);
        Uia.RightClickPhysical(x, y);
        Thread.Sleep(600);
        InpSnapshot.ClickMenuPath(App, "日付変更");

        var dlg = Waits.For(() => ModalDialogs.All(App, Screen.Window).FirstOrDefault(), "日付変更 (frm203051)");
        var edit = dlg.FindFirstDescendant(cf => cf.ByControlType(ControlType.Edit));
        Assert.That(edit, Is.Not.Null, "frm203051 không có ô 新しい日付");
        edit!.AsTextBox().Text = "27";
        Assert.That(Dialogs.ClickButtonContaining(dlg, "確定"), Is.True, "không bấm được 確定");

        var q = Waits.For(() => ModalDialogs.Find(App, Screen.Window, "一括変更")?.Dialog, "Q00100 一括変更");
        Assert.That(Dialogs.ClickButton(q, "はい", "Yes"), Is.True, "không bấm được はい");
        Thread.Sleep(1500);
        SaveAndReopen();
    }

    /// <summary>B4 — F11 → 7 転帰 → 1 治癒: Set_Tenki ghi PERSON.pat_outcome NGAY (không qua F9).</summary>
    [Test]
    public void SaveTenki()
    {
        RequireClonedPatient();
        F11Menu("7 転帰", "1 治癒");
    }

    /// <summary>
    /// B5 — con trỏ ở dòng 処置 CUỐI của lưới (ngày test = ngày điều trị cuối tháng) → F11
    /// 「3 会計データ作成」 (LetAccData2) → đi hết
    /// chuỗi hộp thoại theo nhánh TẠO 未精算 (UnpaidCreationFlow). Chụp các hộp đã gặp.
    /// </summary>
    [Test]
    public void SaveAccData()
    {
        RequireClonedPatient();
        var ops = new TreatmentGridOps(Screen);
        // Dòng 処置 cuối: có 点 (dòng 日計 / 部位病名 / 合計 thì 点 rỗng hoặc 「－」).
        var row = ops.Snapshot().LastOrDefault(r => Txt.Int(r.Ten) > 0 || Txt.N(r.Ten) == "0");
        Assert.That(row, Is.Not.Null, "lưới không có dòng 処置 nào");
        FocusCellScrolling(ops, row!, RegiGrid.Col.Ryo);
        ops.Press(VirtualKeyShort.F11);
        Thread.Sleep(600);
        InpSnapshot.ClickMenuPath(App, "3 会計データ作成");
        var walk = UnpaidCreationFlow.WalkCreateUnpaid(App, Screen.Window);
        // 未精算 được ghi SAU khi 入金指定 đóng — chờ để runner không tắt MENU.exe giữa chừng.
        Thread.Sleep(5000);
        Dump(new Dictionary<string, object?>
        {
            ["accTrail"] = walk.Trail.Select(t => new { text = t.Text, answered = t.Answered }).ToList(),
        });
    }
}
