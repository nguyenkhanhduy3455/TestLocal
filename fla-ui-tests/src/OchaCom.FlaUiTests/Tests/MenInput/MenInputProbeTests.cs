using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MenInput;

/// <summary>
/// PROBE của luồng 面入力 — <b>đo, KHÔNG assert</b>.
///
/// <para>Theo <c>PROBE-GUIDELINE.md</c> mục 2: chưa biết app thật hành xử ra sao thì
/// chụp màn hình → đọc ảnh → rồi mới viết assert. Fixture này đi trọn một vòng
/// gõ mã → 処置選択 → 面入力 → phím 5/4 → F9 → F10, chụp ảnh SAU MỖI BƯỚC, bắt hết
/// ngoại lệ rồi đi tiếp, và in mọi con số ra dạng <c>=== KQ-n ===</c> để runner lọc.</para>
///
/// <para>Mang <c>[Explicit]</c> nên lần chạy đủ KHÔNG gọi tới. Chạy bằng:
/// <c>.\run-men-input.ps1 -Diagnostics</c></para>
///
/// <para>Câu hỏi nó phải trả lời:</para>
/// <list type="number">
///   <item>Cờ <c>MENINPUT_FLG</c> của máy này bằng mấy, master có bao nhiêu dòng
///     <c>men=1</c>, cặp A/B là mã nào?</item>
///   <item>Cửa hậu bật cột ẩn có chạy không, và <c>BUI1</c>/<c>FREEWD</c> có đúng nằm
///     ở cột 8 / 72 như <c>InpDBAccess.getInpTrntrnData</c> nói?</item>
///   <item>Dòng nào của lưới mang 部位, ô 部位 khác 0 ĐẦU TIÊN là slot mấy (⇒ biết
///     <c>chkBui</c> sẽ phát bảng nhãn nào)?</item>
///   <item>Chốt 枝番 <c>men=1</c> trong 処置選択 có mở 面入力 không? Lúc đó 処置選択 còn
///     mở không (nó là <c>showDialog</c> modal lồng nhau)?</item>
///   <item>Năm nhãn mặt đọc ra chữ gì, năm nhãn phím đọc ra gì, <c>lblBui</c>/<c>lblTrt</c>
///     ra gì?</item>
///   <item>Đo pixel có phân biệt được White / LightGray không — trước và sau khi bấm 5, 4?</item>
///   <item>Con trỏ nằm ở phần tử nào khi hộp thoại vừa mở?</item>
///   <item>F9 確定 xong: hộp thoại ĐÓNG hay ở lại hỏi răng kế (<c>算定回数 ÷ 部位数</c>)?
///     Cột 2 và cột 72 của dòng lưới đổi thành gì?</item>
///   <item>F10 戻り trả lại cột 72 nhưng KHÔNG trả cột 2 — đúng không?</item>
///   <item>枝番 <c>men=0</c> có im lặng thật không?</item>
/// </list>
/// </summary>
[TestFixture]
[Explicit]
public sealed class MenInputProbeTests : UiTestBase
{
    private TestTrace _trace = null!;
    private MenInputFlow _flow = null!;
    private MenInputDb? _db;

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    private static void LogKq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    [SetUp]
    public void ProbeSetUp()
    {
        _flow = new MenInputFlow(App, Screen);
        _db = MenInputDb.CreateOrNull(Settings);
    }

    /// <summary>Chạy một bước, nuốt mọi ngoại lệ — một lượt chạy phải ra ĐỦ bức tranh.</summary>
    private void Try(string tag, string what, Action action)
    {
        LogKq(tag, "── " + what);
        try
        {
            action();
        }
        catch (Exception e)
        {
            LogKq(tag, $"   NÉM: {e.GetType().Name}: {e.Message}");
            try { _trace.Fail(what, e); } catch { /* ảnh hỏng không được làm hỏng probe */ }
        }
    }

    [Test]
    [Description("Probe — đi trọn vòng 面入力, chụp từng bước, KHÔNG assert")]
    public void Tc0_Probe_MenInput()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        // ── KQ-1: hai cái cổng, hỏi thẳng DB ────────────────────────────────
        MenInputDb.MenPair? pair = null;
        Try("1", "DB: MENINPUT_FLG + phân bố cột men + cặp A/B", () =>
        {
            if (_db is null)
            {
                LogKq("1", $"   KHÔNG có DB ({DbUnavailableReason}) — bỏ qua phần này");
                return;
            }
            LogKq("1", $"   MENINPUT_FLG = {_db.MenInputFlg()?.ToString() ?? "(không có dòng KEY_ID=1)"}");
            LogKq("1", $"   master áp dụng {TrtDate:yyyy-MM-dd} = {_db.ActiveTrtTable(TrtDate)}");
            foreach (var line in _db.MenHistogram(TrtDate)) LogKq("1", "   " + line);
            pair = _db.FindMenPair(TrtDate);
            LogKq("1", "   cặp A/B = " + (pair?.ToString() ?? "KHÔNG tìm được"));
        });

        // ── KQ-2: cửa hậu bật cột ẩn ────────────────────────────────────────
        Try("2", "bật cột ẩn của grdRegi (customLabel1 click → customLabel3 double-click)", () =>
        {
            var ok = _flow.RevealHiddenColumns(trace);
            LogKq("2", $"   RevealHiddenColumns → {ok}, cột ẩn đang hiện = {_flow.HiddenColumnsVisible()}");

            var headers = _flow.AllHeaders();
            LogKq("2", $"   tổng {headers.Count} cột");
            foreach (var i in new[] { 0, 1, 2, 3, 4, 6, 7, MenInputFlow.ColBui1, MenInputFlow.ColBui1 + 31,
                                      MenInputFlow.ColLineKbn, MenInputFlow.ColFreewd })
                LogKq("2", $"   cột {i,2} = 「{(i < headers.Count ? headers[i] : "(ngoài tầm)")}」");
        });

        // ── KQ-3: dòng nào mang 部位 ────────────────────────────────────────
        MenInputFlow.MenRow? target = null;
        Try("3", "quét lưới: 療法・処置 / 点 / linekbn / freewd / ô 部位 khác 0 đầu tiên", () =>
        {
            foreach (var r in _flow.Rows(limit: 14, withBui: true, countAllBui: true))
                LogKq("3", "   " + r);

            target = _flow.TargetRow(limit: 14);
            LogKq("3", "   DÒNG ĐEM GÕ MÃ = " + (target?.ToString() ?? "KHÔNG có dòng nào mang 部位"));
            if (target is { HasBui: true })
                LogKq("3", $"   ⇒ chkBui sẽ dùng nhánh idx={target.FirstBuiSlot} " +
                           $"({SlotBranch(target.FirstBuiSlot)}), và fixProc sẽ hỏi " +
                           $"「算定回数 ÷ {target.BuiCount} 部位」 lần cho MỖI răng");
        });

        if (target is null)
        {
            LogKq("3", "   DỪNG: không có dòng nào mang 部位 nên 面入力 không thể mở " +
                       "(frm203035_Activated đóng ngay khi _buiCnt == 0).");
            return;
        }

        var trtCd = pair?.TrtCd ?? 326;
        var sbMen = pair?.WithMen.TrtSb ?? 3;
        var sbNoMen = pair?.WithoutMen.TrtSb ?? 1;

        // ── KQ-4: gõ mã → 処置選択 ──────────────────────────────────────────
        Window? picker = null;
        Try("4", $"gõ mã {trtCd} ở コードモード rồi đọc 処置選択", () =>
        {
            LogKq("4", $"   入力モード trước = 「{_flow.InpMode()}」");
            _flow.EnterCode(target, trtCd, trace);
            picker = _flow.WaitForPicker();
            LogKq("4", "   処置選択 mở = " + (picker is not null));
            if (picker is null)
            {
                LogKq("4", "   hộp thoại đang thấy: " + _flow.DescribeDialogs());
                return;
            }
            foreach (var p in _flow.PickerRows(picker)) LogKq("4", "   " + p);
        });

        // ── KQ-5: chốt 枝番 men=1 → 面入力 ─────────────────────────────────
        Window? men = null;
        Try("5", $"chốt {trtCd}-{sbMen} (men=1) → chờ 面入力", () =>
        {
            if (picker is null) { LogKq("5", "   không có picker để chốt"); return; }

            var pick = _flow.FindPick(picker, trtCd, sbMen);
            if (pick is null)
            {
                LogKq("5", $"   picker KHÔNG có dòng {trtCd}-{sbMen}");
                return;
            }

            var committed = _flow.CommitPick(picker, pick, trace);
            men = MenInputDialog.Find(App, Screen);
            LogKq("5", $"   CommitPick → {committed}; 面入力 mở = {men is not null}; " +
                       $"処置選択 còn mở = {_flow.Picker() is not null}");
            LogKq("5", "   hộp thoại đang thấy: " + _flow.DescribeDialogs());
            trace.Shot("05-sau-khi-chot");

            if (men is not null)
            {
                var dump = Uia.DumpTree(men, maxDepth: 10, maxChildrenPerNode: 100);
                WriteArtifact("men-input-frm203035.uia.txt", dump);
                LogKq("5", "   đã đổ cây UIA của frm203035 ra artifacts/men-input-frm203035.uia.txt");
            }
        });

        if (men is null)
        {
            LogKq("5", "   DỪNG: 面入力 không mở nên không đo được gì thêm.");
            Try("5b", "dẹp hộp thoại còn lại", () => { _flow.ClosePicker(); _flow.DismissAll(); });
            return;
        }

        // ── KQ-6: nội dung hộp thoại ────────────────────────────────────────
        Try("6", "đọc nhãn của 面入力", () =>
        {
            LogKq("6", $"   lblBui = 「{Escape(MenInputDialog.Bui(men))}」");
            LogKq("6", $"   lblTrt = 「{MenInputDialog.Trt(men)}」");
            LogKq("6", "   " + MenInputDialog.DescribeFaces(men));
            foreach (var f in MenInputDialog.AllFaces)
            {
                var e = Uia.ById(men, MenInputDialog.NumLabelId(f));
                LogKq("6", $"   rect {MenInputDialog.NumLabelId(f)} = " +
                           (e is null ? "(không thấy control)" : Uia.RectOf(e)?.ToString() ?? "(null)"));
            }
        });

        // ── KQ-7: pixel có phân biệt được không ─────────────────────────────
        Try("7", "màu nền 5 mặt LÚC VỪA MỞ (kỳ vọng: cả 5 đều White)", () =>
        {
            LogKq("7", "   " + MenInputDialog.DescribeColors(men));
            LogKq("7", $"   SelectedCount = {MenInputDialog.SelectedCount(men)}");
        });

        // ── KQ-8: con trỏ ───────────────────────────────────────────────────
        Try("8", "phần tử đang giữ con trỏ", () =>
        {
            var focused = App.Automation.FocusedElement();
            LogKq("8", focused is null
                ? "   (không đọc được)"
                : $"   id=「{Uia.AutomationIdOf(focused)}」 name=「{Uia.NameOf(focused)}」 " +
                  $"type={Uia.ControlTypeOf(focused)}");
        });

        // ── KQ-9: phím 5 rồi 4 ──────────────────────────────────────────────
        Try("9", "bấm phím 5 (中央) rồi 4 (左), đo màu sau mỗi phím", () =>
        {
            LogKq("9", $"   SendKey 5 → {MenInputDialog.ToggleFace(men, MenInputDialog.Face.Center, trace)}");
            LogKq("9", "   sau 5: " + MenInputDialog.DescribeColors(men));
            LogKq("9", $"   SendKey 4 → {MenInputDialog.ToggleFace(men, MenInputDialog.Face.Left, trace)}");
            LogKq("9", "   sau 4: " + MenInputDialog.DescribeColors(men));
            LogKq("9", $"   SelectedCount = {MenInputDialog.SelectedCount(men)}");
            trace.Shot("09-da-chon-2-mat");
        });

        // ── KQ-10: F9 確定 ──────────────────────────────────────────────────
        Try("10", "F9 確定 → hộp thoại đóng hay hỏi răng kế? cột 2 / cột 72 đổi thành gì?", () =>
        {
            var buiBefore = MenInputDialog.Bui(men);
            var rowBefore = _flow.RowAt(target.Index);
            LogKq("10", $"   TRƯỚC: cột 2 = 「{rowBefore?.Ryo}」 cột 72 = " +
                        HighNeedsFreewd.HighNeedsFlow.DescribeFreewd(rowBefore?.Freewd));

            MenInputDialog.Confirm(men, trace);
            Thread.Sleep(900);

            var stillOpen = MenInputDialog.Find(App, Screen);
            LogKq("10", $"   面入力 còn mở = {stillOpen is not null}");
            if (stillOpen is not null)
            {
                LogKq("10", $"   lblBui trước = 「{Escape(buiBefore)}」 → sau = 「{Escape(MenInputDialog.Bui(stillOpen))}」");
                LogKq("10", "   màu sau 確定 (kỳ vọng: reset hết về White): " +
                            MenInputDialog.DescribeColors(stillOpen));
                LogKq("10", "   " + MenInputDialog.DescribeFaces(stillOpen));
                men = stillOpen;
            }

            var rowAfter = _flow.RowAt(target.Index);
            LogKq("10", $"   SAU  : cột 2 = 「{rowAfter?.Ryo}」 cột 72 = " +
                        HighNeedsFreewd.HighNeedsFlow.DescribeFreewd(rowAfter?.Freewd));
            LogKq("10", "   cột 72 dạng mã: " + Escape(rowAfter?.Freewd));
            trace.Shot("10-sau-F9");
        });

        // ── KQ-11: F10 戻り ─────────────────────────────────────────────────
        Try("11", "F10 戻り → trả cột 72 nhưng KHÔNG trả cột 2?", () =>
        {
            var open = MenInputDialog.Find(App, Screen);
            if (open is null) { LogKq("11", "   面入力 đã đóng từ trước, bỏ qua"); return; }

            MenInputDialog.Back(open, trace);
            Thread.Sleep(900);
            LogKq("11", $"   面入力 còn mở = {MenInputDialog.Find(App, Screen) is not null}");
            LogKq("11", $"   処置選択 còn mở = {_flow.Picker() is not null}");

            var row = _flow.RowAt(target.Index);
            LogKq("11", $"   cột 2 = 「{row?.Ryo}」");
            LogKq("11", $"   cột 72 = {HighNeedsFreewd.HighNeedsFlow.DescribeFreewd(row?.Freewd)} " +
                        $"mã: {Escape(row?.Freewd)}");
            trace.Shot("11-sau-F10");
        });

        Try("11b", "dọn hộp thoại còn sót", () =>
        {
            MenInputDialog.CloseIfOpen(App, Screen, trace);
            _flow.ClosePicker();
            _flow.DismissAll();
            LogKq("11b", "   còn lại: " + _flow.DescribeDialogs());
        });

        // ── KQ-12: đối chứng âm ─────────────────────────────────────────────
        Try("12", $"chốt {trtCd}-{sbNoMen} (men=0) — 面入力 phải IM LẶNG", () =>
        {
            var row = _flow.TargetRow(limit: 14);
            if (row is null) { LogKq("12", "   không còn dòng nào mang 部位"); return; }

            var dialog = _flow.PickVariant(row, trtCd, sbNoMen, trace);
            LogKq("12", $"   面入力 mở = {dialog is not null}");
            LogKq("12", $"   chờ thêm 6s vẫn đóng = {MenInputDialog.StaysClosed(App, Screen)}");
            LogKq("12", "   hộp thoại đang thấy: " + _flow.DescribeDialogs());
            trace.Shot("12-men0");
        });

        Try("13", "dọn cuối", () =>
        {
            MenInputDialog.CloseIfOpen(App, Screen, trace);
            _flow.ClosePicker();
            _flow.DismissAll();
        });

        Assert.Pass("PROBE: xem các dòng === KQ-n === và ảnh trong artifacts/screenshots/");
    }

    /// <summary>Nhánh bảng nhãn mà <c>chkBui</c> chọn theo slot (frm203035.cs:301-364).</summary>
    private static string SlotBranch(int idx) => idx switch
    {
        <= 4 => "0-4 → 上B 左D 中央O 右M 下P",
        <= 7 => "5-7 → 上B 左D 中央I 右M 下P",
        <= 10 => "8-10 → 上B 左M 中央I 右D 下P",
        <= 15 => "11-15 → 上B 左M 中央O 右D 下P",
        <= 20 => "16-20 → 上L 左D 中央O 右M 下B",
        <= 23 => "21-23 → 上L 左D 中央I 右M 下B",
        <= 26 => "24-26 → 上L 左M 中央I 右D 下B",
        _ => "27-31 → 上L 左M 中央O 右D 下B",
    };

    /// <summary>
    /// In chuỗi kèm mã điểm mã của từng ký tự.
    ///
    /// <para>Bắt buộc cho <c>lblBui</c> và cột 72: glyph răng là ký tự GAIJI vùng PUA
    /// (đo được trên DB máy test: 右上6 = <c>U+E08C</c>). Console và log không vẽ được
    /// nó — in ra trông y như thiếu chữ, và người đọc log sẽ tưởng là lỗi.</para>
    /// </summary>
    private static string Escape(string? s)
    {
        if (s is null) return "(null)";
        var parts = s.Select(c => c < 0x20 || c > 0x7E ? $"U+{(int)c:X4}" : c.ToString());
        return $"[{string.Join(" ", parts)}]";
    }

    private static void WriteArtifact(string fileName, string content)
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, fileName);
        File.WriteAllText(path, content);
        TestContext.AddTestAttachment(path, fileName);
    }
}
