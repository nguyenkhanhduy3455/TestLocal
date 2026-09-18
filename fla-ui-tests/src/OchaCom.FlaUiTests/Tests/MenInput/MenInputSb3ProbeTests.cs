using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

namespace OchaCom.FlaUiTests.Tests.MenInput;

/// <summary>
/// <b>PROBE</b> — 面入力 với ĐÚNG 枝番 <c>326-3</c>: sau 「F9 確定」 thì ô 療法・処置 hiện
/// NGUYÊN VĂN cái gì, và cột ẩn <c>FREEWD</c> mang token gì.
///
/// <para>Fixture <b>KHÔNG assert</b> (F1). Mọi số đo in thành dòng <c>=== KQ-… ===</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN MỘT CA RIÊNG THAY VÌ CHẠY <see cref="MenInputProbeTests"/>.Tc0
/// ═══════════════════════════════════════════════════════════════════════════════
/// Tc0 chọn 枝番 bằng <c>MenInputDb.FindMenPair</c> — nó lấy dòng <c>men = 1</c> ĐẦU TIÊN
/// của mã 326, và trên master <c>MST_TRT266</c> của máy test đó là <b>326-2</b>:
/// <code>
/// 326-0  充填１(複雑)                men=0
/// 326-1  充填１(単純)                men=0     ← 枝番 mà spec web dùng làm ĐỐI CHỨNG ÂM
/// 326-2  光ＣＲ充(単純)              men=1     ← FindMenPair chọn cái này
/// 326-3  光ＣＲ充(複雑)              men=1     ← spec web (men-input-dialog.spec.ts:102) dùng cái này
/// </code>
/// Hai 枝番 đều <c>men = 1</c> nên cùng mở 面入力, nhưng <b>tên hiển thị khác nhau</b> —
/// và tên chính là thứ ca TC-M4 bên Playwright assert. Số đo cũ trong
/// <c>README.md</c> mục 3 (「光重合型CR充填(単純) &lt;歯OD&gt;」) là của <b>326-2</b>; đem
/// đối chiếu với TC-M4 là so hai dòng khác nhau.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
/// frm203016.frmTrtSel_Let_Trt_Data   :1565-1585
///     if (vieTrtSel[i]["men"] == "1" &amp;&amp; ModCommon.pInpOpt[6] == 1)
///         showDialog(ID203035)            ← MODAL, LỒNG trong 処置選択
///
/// frm203035.makeMenStr               :510      dựng chuỗi 「&lt;歯 + mặt&gt;」
/// frm203035.fixProc                  :427-485
///     _dtRegiData[ 2] = _dtRegiData[ 2] + " " + strMen;   ← 療法・処置, cột NHÌN THẤY
///     _dtRegiData[72] = _dtRegiData[72] + " " + strMen;   ← FREEWD,    cột ẨN
///         ↑ có DẤU CÁCH đứng trước token, và là phép NỐI — không thay thế
/// </code>
/// <para>Ký tự 歯 trong token là <b>gaiji vùng PUA</b> (đo được: 右上5 = <c>U+E092</c>),
/// console không vẽ được nó. Vì thế mọi chuỗi ở đây in KÈM điểm mã — không có bản điểm
/// mã thì log đọc ra y như thiếu chữ và người đọc sẽ tưởng là lỗi.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// AN TOÀN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <b>KHÔNG ghi DB.</b> Không bấm F9 登録. Cột 72 đọc thẳng từ lưới qua cửa hậu bật cột
/// ẩn của app. Lưới có bẩn (một dòng bị gõ đè) nhưng chỉ trong bộ nhớ phiên app.
///
/// <para>⚠️ <b>Không Escape để "dọn"</b>: trên frm203035, <c>BaseDialog2.formBase_KeyDown</c>
/// map CẢ <c>End</c> LẪN <c>Escape</c> sang <c>btnF9_Click</c> (BaseDialog2.cs:172-201) —
/// ESC ở đây là 確定, tức nối thêm một token. Bỏ ngang thì bấm <b>F10 戻り</b>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>.\run-input-tooth-surfaces.ps1 -Case TcS3</code>
/// </summary>
[TestFixture]
[Category("men-input")]
[Explicit("Probe — chạy tay; không nằm trong lô hồi quy.")]
[NonParallelizable]
[CancelAfter(720_000)]
public sealed class MenInputSb3ProbeTests : UiTestBase
{
    /// <summary>Mã + 枝番 mà <c>men-input-dialog.spec.ts</c> dùng (dòng 100/102).</summary>
    private const int TrtCd = 326;

    private const int TrtSb = 3;

    private MenInputFlow _flow = null!;
    private MenInputDb? _db;
    private TestTrace _trace = null!;

    /// <summary>
    /// Probe KHÔNG để watcher trả lời hộ (F19) — và ở luồng này còn một lý do riêng:
    /// hộp thoại mà 面入力 sinh ra là <c>showDialog</c> MODAL, không phải MessageBox, nên
    /// một cú bấm hộ đi lạc vào đó là chạm vào chính thứ đang đo.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    private static void Log(string line) => TestContext.Out.WriteLine(line);

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    [SetUp]
    public void ProbeSetUp()
    {
        _flow = new MenInputFlow(App, Screen);
        _db = MenInputDb.CreateOrNull(Settings);
    }

    [TearDown]
    public void ProbeTearDown()
    {
        try
        {
            // F10 戻り, KHÔNG Escape — xem khối AN TOÀN.
            MenInputDialog.CloseIfOpen(App, Screen, _trace);
            _flow.ClosePicker();
            _flow.DismissAll();
        }
        catch (Exception e) { Log("dọn cuối testcase KHÔNG xong: " + e.Message); }
    }

    private void Step(string tag, string what, Action action)
    {
        Kq(tag, "── " + what);
        try { action(); }
        catch (Exception e)
        {
            Kq(tag, $"   NÉM: {e.GetType().Name}: {e.Message}");
            try { _trace.Fail(what, e); } catch { /* ảnh hỏng không được làm hỏng probe */ }
        }
    }

    /// <summary>Chuỗi kèm điểm mã từng ký tự — bắt buộc cho token có gaiji.</summary>
    private static string CodePoints(string? s)
    {
        if (s is null) return "(null)";
        return "[" + string.Join(" ",
            s.Select(c => c is >= ' ' and <= '~' ? c.ToString() : $"U+{(int)c:X4}")) + "]";
    }

    [Test]
    [Description("TcS3 — 326-3 (men=1): phím 5 + 4 rồi F9 確定, đọc NGUYÊN VĂN cột 2 và cột 72.")]
    public void TcS3_ProbeMen326Sb3()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;
        trace.Shot("00-mo-man");

        Kq("S3", $"bệnh nhân {PatNo} · 診療日 {TrtDate:yyyy-MM-dd} · 処置 {TrtCd}-{TrtSb}");

        // ── tiền đề: cổng MENINPUT_FLG + master ─────────────────────────────
        Step("S3", "hỏi DB: MENINPUT_FLG và cột men của mọi 枝番 mã 326", () =>
        {
            if (_db is null)
            {
                Kq("S3", $"   không có DB ({DbUnavailableReason}) — probe vẫn chạy, thiếu vế master");
                return;
            }
            Kq("S3", $"   MENINPUT_FLG = {_db.MenInputFlg()?.ToString() ?? "(không có dòng KEY_ID=1)"} " +
                     "(0 ⇒ frm203016.cs:1567 KHÔNG mở 面入力, và mọi số dưới đây vô nghĩa)");
            Kq("S3", $"   master áp dụng {TrtDate:yyyy-MM-dd} = {_db.ActiveTrtTable(TrtDate)}");
            var pair = _db.FindMenPair(TrtDate, TrtCd);
            Kq("S3", "   cặp A/B mà FindMenPair chọn = " + (pair?.ToString() ?? "KHÔNG tìm được"));
            Kq("S3", $"   ⚠️ ca này CỐ Ý ghim {TrtCd}-{TrtSb}, KHÔNG dùng cặp trên — xem doc-comment");
        });

        // ── bật cột ẩn + chọn dòng mang 部位 ────────────────────────────────
        MenInputFlow.MenRow? target = null;
        Step("S3", "bật cột ẩn rồi tìm dòng mang 部位", () =>
        {
            var ok = _flow.RevealHiddenColumns(trace);
            Kq("S3", $"   RevealHiddenColumns → {ok}; đang hiện = {_flow.HiddenColumnsVisible()}");
            Kq("S3", $"   tổng {_flow.AllHeaders().Count} cột " +
                     $"(cần > {MenInputFlow.ColFreewd} mới đọc được FREEWD)");

            foreach (var r in _flow.Rows(limit: 14, withBui: true, countAllBui: true))
                Kq("S3", "   " + r);

            target = _flow.TargetRow(limit: 14);
            Kq("S3", "   DÒNG ĐEM GÕ MÃ = " + (target?.ToString() ?? "KHÔNG có dòng nào mang 部位"));
        });

        if (target is null)
        {
            Kq("S3", "DỪNG: không có dòng nào mang 部位 ⇒ 面入力 đóng ngay khi vừa mở " +
                     "(frm203035_Activated, :136, khi _buiCnt == 0). Thiếu DỮ LIỆU, không phải " +
                     "kết luận về app.");
            return;
        }

        // ── gõ mã → 処置選択 → chốt 326-3 ──────────────────────────────────
        MenInputFlow.PickResult? picked = null;
        Step("S3", $"gõ {TrtCd} ở コードモード rồi chốt 枝番 {TrtSb}", () =>
        {
            Kq("S3", $"   入力モード trước = 「{_flow.InpMode()}」");
            picked = _flow.PickVariant(target, TrtCd, TrtSb, trace);
            Kq("S3", $"   tên đọc từ ô 名称 của picker = 「{picked.GridName}」 " +
                     $"{CodePoints(picked.GridName)}");
            Kq("S3", $"   面入力 mở = {picked.Dialog is not null}; " +
                     $"処置選択 còn mở = {_flow.Picker() is not null} " +
                     "(còn mở là ĐÚNG — showDialog modal lồng nhau, README mục 4.2)");
        });
        trace.Shot("02-sau-khi-chot-326-3");

        var men = picked?.Dialog ?? MenInputDialog.Find(App, Screen);
        if (men is null)
        {
            Kq("S3", $"DỪNG: 面入力 KHÔNG mở cho {TrtCd}-{TrtSb}. Hộp thoại đang thấy: " +
                     _flow.DescribeDialogs());
            return;
        }

        // ── đọc hộp thoại + bấm 5 rồi 4 ────────────────────────────────────
        Step("S3", "đọc nhãn của 面入力 rồi bấm phím 5 (中央) và 4 (左)", () =>
        {
            Kq("S3", $"   lblBui = 「{MenInputDialog.Bui(men)}」 {CodePoints(MenInputDialog.Bui(men))}");
            Kq("S3", $"   lblTrt = 「{MenInputDialog.Trt(men)}」");
            Kq("S3", "   " + MenInputDialog.DescribeFaces(men));
            Kq("S3", $"   số mặt đang chọn LÚC VỪA MỞ = {MenInputDialog.SelectedCount(men)} " +
                     "(kỳ vọng 0)");

            Kq("S3", $"   phím 5 → {MenInputDialog.ToggleFace(men, MenInputDialog.Face.Center, trace)}");
            Kq("S3", $"   phím 4 → {MenInputDialog.ToggleFace(men, MenInputDialog.Face.Left, trace)}");
            Kq("S3", "   màu nền sau hai phím: " + MenInputDialog.DescribeColors(men));
            Kq("S3", $"   số mặt đang chọn = {MenInputDialog.SelectedCount(men)} (kỳ vọng 2)");

            var expect = MenInputDialog.ExpectedSurfaces(men, MenInputDialog.Face.Center,
                                                              MenInputDialog.Face.Left);
            Kq("S3", $"   chuỗi mặt mà bảng nhãn của dòng này sinh ra = 「{expect}」 " +
                     "(thứ tự phát theo MenInputDialog.EmitOrder, không theo thứ tự bấm)");
        });
        trace.Shot("03-da-chon-trung-tam-va-trai");

        // ── CÂU CHÍNH: F9 確定 nối gì vào cột 2 và cột 72 ───────────────────
        Kq("S3", "CÂU CHÍNH — F9 確定: ô 療法・処置 và cột 72 nhận token gì");
        Step("S3", "đọc cột 2 / cột 72 TRƯỚC khi 確定", () =>
        {
            var before = _flow.RowAt(target.Index);
            Kq("S3", $"   TRƯỚC: cột 2  = 「{before?.Ryo}」 {CodePoints(before?.Ryo)}");
            Kq("S3", $"   TRƯỚC: cột 72 = {HighNeedsFlow.DescribeFreewd(before?.Freewd)} " +
                     CodePoints(before?.Freewd));
        });

        Step("S3", "bấm F9 確定", () =>
        {
            var buiBefore = MenInputDialog.Bui(men);
            MenInputDialog.Confirm(men, trace);
            Thread.Sleep(1200);

            var still = MenInputDialog.Find(App, Screen);
            Kq("S3", $"   面入力 còn mở = {still is not null} " +
                     "(còn mở ⇒ 算定回数 ÷ 部位数 = 0 nên nó hỏi tiếp răng kế, README mục 3)");
            if (still is not null)
                Kq("S3", $"   lblBui: 「{buiBefore}」 {CodePoints(buiBefore)} → " +
                         $"「{MenInputDialog.Bui(still)}」 {CodePoints(MenInputDialog.Bui(still))}");
        });
        trace.Shot("04-sau-F9-confirm");

        Step("S3", "đọc cột 2 / cột 72 SAU khi 確定 — ĐÂY là câu trả lời", () =>
        {
            var after = _flow.RowAt(target.Index);
            Kq("S3", $"   SAU: cột 2  NGUYÊN VĂN = 「{after?.Ryo}」");
            Kq("S3", $"   SAU: cột 2  điểm mã    = {CodePoints(after?.Ryo)}");
            Kq("S3", $"   SAU: cột 72 NGUYÊN VĂN = {HighNeedsFlow.DescribeFreewd(after?.Freewd)}");
            Kq("S3", $"   SAU: cột 72 điểm mã    = {CodePoints(after?.Freewd)}");
            Kq("S3", "   (fixProc NỐI 「 」 + token vào CẢ HAI cột, frm203035.cs:470-476 — " +
                     "cột 2 mang thêm TÊN 処置 ở đầu, cột 72 chỉ có token)");
        });

        // Dọn: F10 戻り. Ghi lại hệ quả đã biết để người đọc log không tưởng là lỗi mới.
        Step("S3", "F10 戻り để dọn (ghi nhận: nó trả cột 72 nhưng KHÔNG trả cột 2)", () =>
        {
            var open = MenInputDialog.Find(App, Screen);
            if (open is null) { Kq("S3", "   面入力 đã đóng từ trước"); return; }

            MenInputDialog.Back(open, trace);
            Thread.Sleep(1000);
            var row = _flow.RowAt(target.Index);
            Kq("S3", $"   sau F10: cột 2  = 「{row?.Ryo}」 {CodePoints(row?.Ryo)}");
            Kq("S3", $"   sau F10: cột 72 = {HighNeedsFlow.DescribeFreewd(row?.Freewd)} " +
                     CodePoints(row?.Freewd));
            Kq("S3", "   (btnF10_Click chỉ khôi phục prvStrBuffFreeWord cho cột 72, " +
                     "frm203035.cs:158-164 — hai cột LỆCH nhau là bug đã được port có chủ ý, " +
                     "xem README mục 6)");
        });
        trace.Shot("05-sau-F10");

        Assert.Pass("PROBE — đọc các dòng === KQ-S3 === và ảnh trong artifacts/screenshots/");
    }
}
