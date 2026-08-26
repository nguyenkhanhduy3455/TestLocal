using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.TreatmentHeaderStaff;

/// <summary>
/// <b>PROBE — dò vùng 「Ｄｒ」 trên header 処置入力, KHÔNG assert.</b>
///
/// Nửa WinForm của <c>../web-tenant-tests/tests/treatment-header-staff.spec.ts</c>.
/// PROBE-GUIDELINE mục 2: chưa biết app hành xử ra sao thì đo trước, đừng viết assert
/// theo phỏng đoán rồi chạy cả fixture để xem nó đỏ ở đâu.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// TÁM CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  KQ-1  Ba control lblDrLabel / lbDr / cboDr đọc được không? Cái nào đang HIỆN?
///  KQ-2  Lúc mới mở màn: lbDr = gì, cboDr = gì? Chúng có KHÁC nhau không?
///  KQ-3  DB nói gì: att_dr của bệnh nhân, và dr_no của các dòng trong tháng?
///  KQ-4  IINMST2 có dòng user_no = 0 không? Có user_kbn nào ngoài {0,1} không?
///  KQ-5  Dời con trỏ sang dòng khác NGÀY thì lbDr có đổi theo dr_no của dòng không?
///  KQ-6  Click nhãn lbDr có làm cboDr hiện ra không? Hiện rồi thì nó mang giá trị gì?
///  KQ-7  Click caption 「Ｄｒ」 bung hộp thoại gì? NGUYÊN VĂN từng chữ.
///  KQ-8  Bấm いいえ có đóng được không, và lưới có giữ nguyên không?
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Không bấm F9 登録. 一括変更 chỉ sửa lưới trong bộ nhớ, rời màn hình là mất —
/// đúng như bản Playwright («KHÔNG cần TEST_ALLOW_SAVE»). Probe CHỈ bấm 「いいえ」,
/// không bao giờ 「はい」.
///
/// <para>Chạy: <c>.\run-bulk-change-dr.ps1 -Diagnostics</c>.</para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, không nằm trong lượt chạy đủ")]
[Category("header-staff")]
public sealed class TreatmentHeaderStaffProbeTests : UiTestBase
{
    private HeaderStaffFlow _flow = null!;
    private HeaderStaffDb? _db;

    /// <summary>
    /// TẮT watcher hộp thoại nhiễu — probe đang đo NGUYÊN VĂN hộp thoại 一括変更.
    /// Để watcher bấm 「いいえ」 hộ thì phép đọc ra rỗng và log sẽ nói 「app không hỏi」,
    /// ngược hẳn sự thật (PROBE-GUIDELINE 3.4).
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _flow = new HeaderStaffFlow(App, Screen);
        _db = HeaderStaffDb.CreateOrNull(Settings);
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    [Test, Order(0)]
    [Description("Tc0 — PROBE: đo tám câu hỏi của vùng 「Ｄｒ」 trên header")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ PROBE header 「Ｄｒ」 (lblDrLabel / lbDr / cboDr) — KHÔNG assert  ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
        Log($"bệnh nhân {PatNo}, ngày {TrtDate:yyyy-MM-dd}");
        trace.Shot("00-man-chi-tiet");

        // ── KQ-1 ────────────────────────────────────────────────────────────
        Safe("KQ-1 doc ba control", () =>
        {
            string D(string what, Func<FlaUI.Core.AutomationElements.AutomationElement?> get)
            {
                try
                {
                    var e = get();
                    return e is null ? $"{what}=KHÔNG THẤY"
                        : $"{what}={(Uia.IsOnScreen(e) ? "HIỆN" : "ẩn")}";
                }
                catch (Exception ex) { return $"{what}=LỖI({ex.GetType().Name})"; }
            }

            Kq("1", string.Join(" · ",
                D("lblDrLabel", () => _flow.CaptionElement),
                D("lbDr", () => _flow.LabelElement),
                D("cboDr", () => _flow.ComboElement)));
            Log("    → kỳ vọng theo source: lblDrLabel HIỆN, lbDr HIỆN, cboDr ẨN (frm203002.cs:2478).");
        });

        // ── KQ-2 ────────────────────────────────────────────────────────────
        Safe("KQ-2 gia tri ban dau", () =>
        {
            var lbl = _flow.LabelText();
            var cbo = _flow.ComboText();
            Kq("2", $"lbDr = 「{lbl}」 · cboDr = 「{cbo}」 · " +
                    (lbl == cbo ? "TRÙNG NHAU" : "KHÁC NHAU (đúng như thiết kế ba-control)"));
            Kq("2b", $"日 của dòng con trỏ đang đứng = 「{_flow.CurrentDay()}」");
        });

        // ── KQ-3 + KQ-4 ─────────────────────────────────────────────────────
        IReadOnlyList<TrnRow> rows = [];
        var attDr = 0;
        Safe("KQ-3/4 doc DB", () =>
        {
            if (_db is null)
            {
                Kq("3", $"KHÔNG đọc được DB — {DbUnavailableReason ?? "db.enabled = false"}");
                return;
            }

            attDr = _db.AttDr(PatNo);
            rows = _db.RowsInMonth(PatNo, TrtDate);
            Kq("3", $"att_dr của 患者{PatNo} = {attDr} 「{_db.DoctorName(attDr) ?? "?"}」");
            Kq("3b", rows.Count == 0
                ? $"TRNTRN tháng {TrtDate:yyyy-MM}: KHÔNG có dòng nào ⇒ không dựng được TC-LBL-1"
                : "TRNTRN tháng này: " + string.Join(" / ", rows.Select(r =>
                    $"{r.Day}日→dr_no={r.DrNo}「{_db.DoctorName(r.DrNo) ?? "?"}」×{r.Count}")));

            var staff = _db.AllStaff();
            var zero = staff.Where(x => x.UserNo == 0).ToList();
            var oddKbn = staff.Where(x => x.UserKbn is not (0 or 1)).ToList();
            Kq("4", $"IINMST2 có {staff.Count} dòng · user_no=0: " +
                    (zero.Count == 0 ? "KHÔNG CÓ" : string.Join(" / ", zero.Select(x => x.ToString()))) +
                    " · user_kbn ngoài {0,1}: " +
                    (oddKbn.Count == 0 ? "KHÔNG CÓ" : string.Join(" / ", oddKbn.Select(x => x.ToString()))));
            Log("    ★ LƯU Ý parity: dù master KHÔNG có user_no = 0 thì combo cboDr VẪN có một " +
                "dòng trống USER_NO = 0 — makeIinMstCombo được gọi với spcFlg = true " +
                "(frm203002.cs:597). Bản web (TC-MST-1) đòi dropdown KHÔNG chứa user_no = 0.");
        });

        // ── KQ-5 ────────────────────────────────────────────────────────────
        Safe("KQ-5 doi con tro sang dong khac", () =>
        {
            var days = _flow.VisibleDays();
            Kq("5", $"đọc được {days.Count} dòng, 日 = " +
                    string.Join(",", days.Take(20).Select(d => d.Length == 0 ? "_" : d)));

            // Chỉ đi trên DÒNG DỮ LIỆU: dòng tiêu đề 「日」 và dòng trống lọt vào danh
            // sách dòng của UIA (PROBE-GUIDELINE 3.2), và ô của chúng đọc ra rect rỗng.
            var data = _flow.DataRows();
            Kq("5c", $"sau khi lọc còn {data.Count} dòng DỮ LIỆU: " +
                     string.Join(",", data.Take(20).Select(r => $"#{r.Index}:{r.Day}")));

            var firstPerDay = data.GroupBy(r => r.Day).Select(g => g.First()).Take(6).ToList();
            foreach (var row in firstPerDay)
            {
                var got = _flow.FocusRow(row.Index);
                Kq("5b", $"đứng dòng #{row.Index} (日={row.Day}, đọc lại = 「{got}」) → lbDr = " +
                         $"「{_flow.LabelText()}」 · cboDr = 「{_flow.ComboText()}」");
            }
            trace.Shot("01-sau-khi-doi-dong");
        });

        // ── KQ-6 ────────────────────────────────────────────────────────────
        Safe("KQ-6 click nhan de lo combo", () =>
        {
            var before = _flow.ComboVisible();
            _flow.RevealCombo();
            var after = _flow.ComboVisible();
            Kq("6", $"cboDr trước khi click nhãn: {(before ? "HIỆN" : "ẩn")} → sau khi click: " +
                    $"{(after ? "HIỆN" : "vẫn ẩn")} · giá trị = 「{_flow.ComboText()}」");
            trace.Shot("02-sau-khi-click-nhan");
        });

        // ── KQ-7 + KQ-8 ─────────────────────────────────────────────────────
        Safe("KQ-7/8 mot括変更", () =>
        {
            // Đứng lại lên một dòng dữ liệu TRƯỚC: KQ-6 vừa click nhãn để lộ combo, và
            // lúc đó lưới mất focus nên CurrentDay() đọc ra rỗng (đo 2026-08-26, KQ-7b).
            var data2 = _flow.DataRows();
            if (data2.Count > 0) _flow.FocusRow(data2[0].Index);

            var dayBefore = _flow.CurrentDay();
            var labelBefore = _flow.LabelText();

            var prompt = _flow.ClickCaption();
            trace.Shot("03-sau-khi-click-caption");

            if (!prompt.Appeared)
            {
                Kq("7", "click caption 「Ｄｒ」 KHÔNG bung hộp thoại nào — " +
                        "kỳ vọng Interaction.MsgBox 「ドクター変更」 (frm203002.cs:8117)");
                return;
            }

            Kq("7", $"NGUYÊN VĂN hộp thoại: 「{prompt.Text}」");
            Log("    LƯU Ý ĐỌC LOG: chuỗi đi qua Txt.N (NFKC + trim) nên xuống dòng thành " +
                "khoảng trắng và 「？」 nửa-rộng-hoá thành 「?」. Đừng kết luận lệch dấu chấm " +
                "hỏi từ dòng này — so bằng chuỗi đã chuẩn hoá ở CẢ HAI bên.");
            Log("    → kỳ vọng theo source (frm203002.cs:8115): " +
                "「{日}日診療分の担当ドクターを\\r\\n{cboDr.Text} に変更します。\\r\\n\\r\\nよろしいですか？」 " +
                "— CHÚ Ý có MỘT DẤU CÁCH trước 「に変更します。」, và xuống dòng nằm TRƯỚC tên Ｄｒ．. " +
                "Doc của bản web ghi 「{氏名}に変更します。」 (không dấu cách) — đối chiếu kỹ chỗ này.");
            Kq("7b", $"日 lúc bấm = 「{dayBefore}」 (câu hỏi phải bắt đầu bằng đúng số này)");

            // CHỈ bấm いいえ. はい sẽ đổi mọi dòng cùng ngày trong lưới.
            var answered = _flow.Answer(prompt.Dialog!, yes: false);
            Waits.Step();
            var stillOpen = _flow.FirstDialog() is not null;
            Kq("8", $"bấm 「いいえ」: {(answered ? "click được" : "KHÔNG tìm thấy nút")} · " +
                    $"hộp thoại {(stillOpen ? "VẪN CÒN" : "đã đóng")} · " +
                    $"lbDr sau đó = 「{_flow.LabelText()}」 (trước = 「{labelBefore}」)");
            trace.Shot("04-sau-khi-bam-iie");

            if (stillOpen)
                Log("    ⚠ Không đóng được hộp thoại — cùng triệu chứng với luồng " +
                    "PatientSelectAssign (xem README mục 4b của luồng đó). Mọi thao tác sau " +
                    "sẽ rơi vào hộp thoại chứ không vào lưới (PROBE-GUIDELINE 3.4).");
        });

        Safe("don dep", () =>
        {
            for (var i = 0; i < 3 && _flow.FirstDialog() is { } d; i++)
            {
                if (!_flow.Answer(d, yes: false)) break;
                Waits.Step();
            }
        });

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ HẾT PROBE — đọc bulk-change-dr-KQ.txt và ảnh trong artifacts      ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
    }
}
