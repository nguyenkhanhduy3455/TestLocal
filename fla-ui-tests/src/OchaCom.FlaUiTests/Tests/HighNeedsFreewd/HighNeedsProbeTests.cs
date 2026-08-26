using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

/// <summary>
/// <b>PROBE — dò hành vi, KHÔNG assert.</b>
///
/// Đây là bước 2 của vòng làm việc bắt buộc trong
/// <c>fla-ui-tests/PROBE-GUIDELINE.md</c>: chưa biết app thật hành xử ra sao thì
/// <b>chụp màn hình → đọc ảnh → rồi mới viết assert</b>. Fixture này đi từng bước,
/// <b>không bao giờ ném</b>, và in ra đủ để một lượt chạy trả lời hết các câu hỏi mà
/// đọc source không kết luận được.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// SÁU CÂU HỎI CẦN ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  KQ-1  Dữ liệu máy này có bệnh nhân dis_flg = 3 không? (đọc source không biết được)
///  KQ-2  Cửa hậu bật cột ẩn có thật không, và cột 72 đọc ra ở ô thứ mấy?
///  KQ-3  Gõ 105 ở コードモード có mở 処置選択 không? Trong đó có những 枝番 nào?
///  KQ-4  Chốt một dòng 105 khi dis_flg ≠ 3 → app có im lặng đúng như source hứa không?
///  KQ-5  Mã 508 (歯訪) đi đường nào?
///  KQ-6  自動算定 kích bằng tay được không, và nó bung ra chuỗi hộp thoại gì?
/// </code>
///
/// <para>Chỉ KQ-4/KQ-5/KQ-6 phần 「vá dis_flg = 3」 cần
/// <c>highNeeds.allowDisFlgPatch</c>; phần còn lại chạy được ngay.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   .\run-high-needs-freewd.ps1 -Diagnostics
/// </code>
/// Runner lọc sẵn mọi dòng <c>=== KQ-</c> ra <c>high-needs-freewd-KQ.txt</c>.
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, không nằm trong lượt chạy đủ")]
[Category("high-needs-freewd")]
public sealed class HighNeedsProbeTests : UiTestBase
{
    private HighNeedsFlow _flow = null!;
    private HighNeedsDb? _hnDb;

    /// <summary>
    /// TẮT HẲN watcher hộp thoại nhiễu.
    ///
    /// <para><c>run.nuisanceDialogs</c> mặc định chứa 「を算定しますか？」 và
    /// 「加算を算定しますか」 — tức là ĐÚNG hai câu mà luồng này đang đo. Để nguyên thì
    /// watcher bấm 「いいえ」 hộ trước khi probe kịp nhìn thấy, và log sẽ nói 「app không
    /// hỏi」 trong khi app có hỏi. Probe tự dẹp hộp thoại bằng
    /// <see cref="HighNeedsFlow.DismissAll"/> ở chỗ nào cần.</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _flow = new HighNeedsFlow(App, Screen);
        _hnDb = HighNeedsDb.CreateOrNull(Settings);
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>Chạy một bước, nuốt mọi ngoại lệ, ghi lại rồi đi tiếp.</summary>
    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    [Test, Order(0)]
    [Description("Tc0 — PROBE: đo hết sáu câu hỏi trong một lượt chạy")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ PROBE 歯科診療困難者加算 / freewd — KHÔNG assert, chỉ đo         ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
        Log($"bệnh nhân {PatNo}, ngày {TrtDate:yyyy-MM-dd}, 入力モード hiện tại 「{_flow.InpMode()}」");
        trace.Shot("00-man-hinh-ban-dau");

        ProbeDisFlgData();
        ProbeHiddenColumns(trace);
        ProbePicker(trace, HighNeedsFlow.TrtCdToku, "3");
        ProbePicker(trace, HighNeedsFlow.TrtCdTokuHoumon, "5");
        ProbeCommitWithRealDisFlg(trace);
        ProbeAutoSantei(trace);

        Log("");
        Log("=== KQ-END === Gửi lại: mọi dòng '=== KQ-' ở trên + thư mục artifacts\\screenshots");
        Assert.Pass("PROBE xong — đọc các dòng KQ, không có assert nào ở đây");
    }

    // ── KQ-1 ─────────────────────────────────────────────────────────────────

    private void ProbeDisFlgData()
    {
        Log("");
        if (_hnDb is null)
        {
            Kq("1", $"KHÔNG đọc được DB ({DbUnavailableReason}) ⇒ không biết máy này có " +
                    "bệnh nhân dis_flg = 3 hay không.");
            return;
        }

        Safe("đọc phân bố dis_flg", () =>
        {
            var hist = _hnDb!.DisFlgHistogram();
            Kq("1", "phân bố dis_flg trên bảng INSURANCE:");
            foreach (var (flg, rows, pats) in hist)
                Log($"        dis_flg={flg}  {rows,7} dòng  {pats,7} bệnh nhân");

            var has3 = hist.Any(h => h.DisFlg == HighNeedsDb.DisFlgHighNeeds && h.Patients > 0);
            Kq("1", has3
                ? "CÓ bệnh nhân dis_flg = 3 ⇒ đo được nhánh 困難者加算 mà KHÔNG cần vá DB."
                : "KHÔNG có bệnh nhân dis_flg = 3 ⇒ nhánh 困難者加算 chỉ tới được khi bật " +
                  "highNeeds.allowDisFlgPatch (modSave.cs:3450 / frm203016.cs:1098 so BẰNG 3).");
        });

        Safe("đọc 枝番 của bệnh nhân đang test", () =>
        {
            var branches = _hnDb!.Branches(PatNo);
            Kq("1b", $"bệnh nhân {PatNo} có {branches.Count} 枝番: " +
                     string.Join(", ", branches.Select(b => b.ToString())));
            Log("        app đọc 枝番 còn hiệu lực tại 診療日 (modPat.GetValidSubCode2) — vá " +
                "phải vá HẾT, không chỉ 枝番 đầu.");
        });
    }

    // ── KQ-2 ─────────────────────────────────────────────────────────────────

    private void ProbeHiddenColumns(TestTrace trace)
    {
        Log("");
        Safe("bật cột ẩn", () =>
        {
            var before = _flow.VisibleCellCount();
            Kq("2", $"TRƯỚC khi bật: một dòng lưới đọc ra {before} ô " +
                    $"(kỳ vọng 5 — RegiCol.hideStart = 5, frm203002.cs:161).");

            var ok = _flow.RevealHiddenColumns(trace);
            var after = _flow.VisibleCellCount();
            trace.Shot("01-sau-khi-bat-cot-an");

            Kq("2", $"SAU khi click nhãn 患者番号 + double-click nhãn 氏名: {after} ô " +
                    $"(RevealHiddenColumns trả {ok}).");

            if (after <= before)
            {
                Kq("2", "CỬA HẬU KHÔNG ĂN. Ba khả năng, xem ảnh 01-sau-khi-bat-cot-an:");
                Log("        a) AutomationId của hai nhãn khác 'customLabel1'/'customLabel3'");
                Log("        b) double-click không tới (hai cặp down/up quá xa nhau)");
                Log("        c) cầu MSAA→UIA không dựng phần tử cho cột vừa hiện");
                Log("        ⇒ nếu vậy thì đường đọc freewd DUY NHẤT là F9 登録 + đọc TRNTRN.FREEWD");
                return;
            }

            var headers = _flow.AllHeaders();
            Kq("2", $"đọc được {headers.Count} tiêu đề cột. Từ cột {HighNeedsFlow.ColHideStart} " +
                    "trở đi là TÊN CỘT DB (frm203002.cs:2712 đổi sang canh trái để hiện tên).");
            for (var i = 0; i < headers.Count; i++)
                if (i < 6 || Math.Abs(i - HighNeedsFlow.ColFreewd) <= 3)
                    Log($"        [{i,2}] 「{headers[i]}」");

            var idx = headers.ToList().FindIndex(h => Txt.Has(h, "FREEWD") || Txt.Has(h, "freewd"));
            Kq("2", idx >= 0
                ? $"cột FREEWD nằm ở ô thứ {idx} (hằng số trong source là 72 — " +
                  $"{(idx == HighNeedsFlow.ColFreewd ? "KHỚP" : "LỆCH, sửa HighNeedsFlow.ColFreewd")})"
                : "KHÔNG thấy tiêu đề nào tên FREEWD — đọc bảng tiêu đề ở trên rồi chốt lại chỉ số.");

            var row = _flow.TargetRow();
            if (row is not null)
                Kq("2b", $"dòng mẫu 「{row.Ryo.Trim()}」 có freewd = " +
                         $"{(_flow.FreewdOf(row) is { } f ? $"[{f}]" : "(không đọc được)")}");
        });
    }

    // ── KQ-3 / KQ-5 ──────────────────────────────────────────────────────────

    private void ProbePicker(TestTrace trace, int trtCd, string tag)
    {
        Log("");
        Safe($"gõ mã {trtCd}", () =>
        {
            if (!_flow.EnterCode(trace, trtCd.ToString()))
            {
                Kq(tag, $"không gõ được mã {trtCd} (không về được コードモード hoặc lưới " +
                        "không có dòng 処置 nào để đứng). 入力モード đang là " +
                        $"「{_flow.InpMode()}」.");
                return;
            }

            var picker = _flow.WaitForPicker();
            trace.Shot($"02-ma-{trtCd}");

            if (picker is null)
            {
                Kq(tag, $"mã {trtCd} KHÔNG mở 処置選択. Hộp thoại đang mở: {_flow.DescribeDialogs()}");
                Log($"        source nói 105/508 không bị KasanCode chặn (modMain.cs:533 chỉ bẫy " +
                    "101/102/103) nên PHẢI mở picker — khác đi là đo được một điều source không nói.");
                _flow.DismissAll();
                return;
            }

            var rows = _flow.ReadPicker(picker);
            Kq(tag, $"mã {trtCd} MỞ 処置選択, có {rows.Count} dòng:");
            foreach (var r in rows.Take(12)) Log("        · " + r);

            // Danh sách 枝番 mà CommonChk.chkHighNeedsAdd coi là 特別対応加算.
            var wanted = trtCd == HighNeedsFlow.TrtCdToku
                ? new[] { 0, 1, 2, 3, 6, 7 }
                : [0, 1, 6];
            var present = rows.Select(r => Txt.Int(r.Sub)).Where(n => n is not null).Select(n => n!.Value).ToList();
            Kq(tag, $"枝番 có trong picker: [{string.Join(",", present)}]; " +
                    $"枝番 mà IregCodChk bẫy: [{string.Join(",", wanted)}]; " +
                    $"giao nhau: [{string.Join(",", present.Intersect(wanted))}]");

            _flow.ClosePicker(picker);
            _flow.DismissAll();
        });
    }

    // ── KQ-4 ─────────────────────────────────────────────────────────────────

    private void ProbeCommitWithRealDisFlg(TestTrace trace)
    {
        Log("");
        Safe("chốt một dòng 105 với dis_flg thật", () =>
        {
            var disFlg = _hnDb is null
                ? -1
                : _hnDb.Branches(PatNo).Select(b => (int?)b.DisFlg).FirstOrDefault() ?? -1;

            if (!_flow.EnterCode(trace, HighNeedsFlow.TrtCdToku.ToString())) return;
            var picker = _flow.WaitForPicker();
            if (picker is null)
            {
                Kq("4", "không mở được picker ⇒ bỏ qua bước chốt.");
                _flow.DismissAll();
                return;
            }

            var rows = _flow.ReadPicker(picker);
            var target = rows.FirstOrDefault(r => Txt.Int(r.Sub) is 0 or 1) ?? rows.FirstOrDefault();
            if (target is null)
            {
                Kq("4", "picker rỗng ⇒ không chốt được.");
                _flow.ClosePicker(picker);
                return;
            }

            Kq("4", $"đang chốt dòng {target} với dis_flg thật của bệnh nhân = {disFlg}");
            _flow.CommitPick(picker, target.Index, trace);

            var q = _flow.WaitForHighNeedsDialog(6);
            trace.Shot("03-sau-khi-chot-105");

            if (q is null)
            {
                Kq("4", $"KHÔNG hỏi 困難者加算 — đúng như frm203016.cs:1098 (`dis_flg == 3`) " +
                        $"với dis_flg = {disFlg}. Hộp thoại khác đang mở: {_flow.DescribeDialogs()}");
            }
            else
            {
                Kq("4", $"CÓ hỏi dù dis_flg = {disFlg}! Nguyên văn: 「{Txt.N(Dialogs.TextOf(q))}」 " +
                        $"tiêu đề 「{Uia.NameOf(q)}」 nút [{string.Join(", ", HighNeedsFlow.ButtonNames(q))}]");
                Log("        ⇒ điều này TRÁI với source; đo lại cho chắc trước khi kết luận.");
                _flow.Answer(q, yes: false);
            }

            // Dòng vừa chèn: freewd phải trống vì chưa ai trả lời 「はい」.
            var name = target.Name.Trim();
            var inserted = name.Length > 0 ? _flow.RowNamed(name) : null;
            if (inserted is not null)
                Kq("4b", $"dòng vừa chèn 「{inserted.Ryo.Trim()}」 freewd = " +
                         $"{(_flow.FreewdOf(inserted) is { } f ? $"[{f}]" : "(không đọc được — cột ẩn chưa bật?)")}");

            _flow.DismissAll();
        });
    }

    // ── KQ-6 ─────────────────────────────────────────────────────────────────

    private void ProbeAutoSantei(TestTrace trace)
    {
        Log("");
        Safe("kích 自動算定", () =>
        {
            Kq("6", "自動算定 chỉ có MỘT call site: grdRegi_TextBox_PreviewKeyDown " +
                    "(frm203002.cs:5345). Cần: Enter + con trỏ ở CỘT 0 + dòng CUỐI + ngày khác " +
                    "dòng trên (:5241/:5260/:5288/:5296).");

            var before = _flow.Grid.RowCount();
            _flow.TriggerAutoSantei(TrtDate.Day, trace);
            trace.Shot("04-sau-khi-kich-auto-santei");

            var dialogs = _flow.DescribeDialogs();
            Kq("6", $"sau khi gõ ngày + Enter: {_flow.Grid.RowCount()} dòng (trước {before}). " +
                    $"Hộp thoại: {dialogs}");

            if (Txt.Has(dialogs, HighNeedsFlow.AddonQuestionTail))
                Log("        ⇒ có câu 「〜を算定しますか？」 ⇒ AutoSantei ĐÃ chạy (modSave.cs:3069).");
            else
                Log("        ⇒ KHÔNG có câu 算定 nào. Hoặc AutoSantei trả -2 (ngày này đã có 処置, " +
                    "modSave.cs:2917-2951), hoặc bốn điều kiện ở trên chưa đủ. Xem ảnh 04.");

            _flow.DismissAll();
        });
    }
}
