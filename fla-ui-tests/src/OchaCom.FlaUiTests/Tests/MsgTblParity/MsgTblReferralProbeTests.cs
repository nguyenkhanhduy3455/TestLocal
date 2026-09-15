using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.KarteAutoCalc;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// PROBE — <b>đo, KHÔNG assert</b>, cho màn <b>紹介状</b> (<c>frm203053</c>, Shift+F3).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐỌC SOURCE TRƯỚC ĐÃ — VÀ NÓ ĐẢO NGƯỢC CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════════
/// Spec <c>dialogs-management/referral-letter-msgtbl-parity.spec.ts</c> phủ 5 mã:
/// <c>Q00002</c> → <c>I00001</c> (lưu), <c>Q00003</c> → <c>I00003</c> (xoá), và
/// <c>E00001</c>. Nhưng <c>frm203053</c> chỉ gọi <b>ba</b> mã:
///
/// <code>
///   E00001  :157 / :177  ShowErrorMsg("E00001", "発行済呼出し")   — combo rỗng khi F2/F3
///   E00022  :663..:699   ShowErrorMsg("E00022", &lt;tên trường&gt;)   — 7 chỗ, trong chkInputData
///   Q00019  :192         ShowOKCancelMsg("Q00019")               — xác nhận IN
///   E00026  :556         ShowErrorMsg("E00026", "印刷")           — in hỏng
/// </code>
///
/// <para><b>F2 lưu và F3 xoá của WinForm KHÔNG hỏi gì và KHÔNG báo gì</b> — chúng gọi
/// thẳng <c>insertTemplatedata</c> / <c>deleteTemplatedata</c> rồi dựng lại combo
/// (:148-155, :168-174). Tức là <c>Q00002/I00001/Q00003/I00003</c> ở bản web là <b>bốn
/// hộp thoại WinForm không có</b>, chứ không phải bốn hộp thoại sai chữ.</para>
///
/// <para>Đó là phát hiện cần ĐO chứ không chỉ đọc: "không có hộp thoại" là một khẳng
/// định phủ định, và phủ định thì phải nhìn mới tin. Probe này làm đúng việc đó, cộng
/// thêm chụp hai mã WinForm THẬT SỰ có.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// HAI MÃ CHỤP ĐƯỢC MÀ KHÔNG GHI GÌ
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   E00001  bấm F3 削除 khi ô 発行済呼出し RỖNG → dừng ngay, không chạm DB
///   E00022  đặt 宛名 (textBox3) &gt; 200 byte rồi F2: chkInputData CHẠY TRƯỚC
///           insertTemplatedata (:148) ⇒ hỏng kiểm tra là KHÔNG có dòng nào được ghi
/// </code>
///
/// <para>Chỉ làm PHỒNG một trường (宛名) chứ không phồng cả bảy: mỗi trường hỏng là một
/// hộp thoại, bảy cái chồng lên nhau thì đọc trace không ra cái nào của cái gì.</para>
///
/// Chạy: <c>.\run-msgtbl-parity.ps1 -Referral</c>
/// </summary>
[TestFixture]
[NonParallelizable]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("msgtbl-parity")]
[CancelAfter(600_000)]
public sealed class MsgTblReferralProbeTests : UiTestBase
{
    private const string ReferralId = "frm203053";
    private const string ReferralTitle = "紹介状";

    /// <summary>Nút bật/tắt dải phím Shift (BaseForm.Designer) — xem DrugPathBFlow.</summary>
    private const string ShiftToggleId = "btnShift";

    /// <summary>Ô 発行済呼出し — tên template đã lưu (frm203053.cs:146).</summary>
    private const string TemplateComboId = "comboBox2";

    /// <summary>Ô 宛名, giới hạn 200 byte (frm203053.cs:661).</summary>
    private const string AtenaBoxId = "textBox3";

    private MsgTblOracle? _msg;

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    [OneTimeSetUp]
    public void ReferralProbeOneTimeSetUp() => _msg = MsgTblOracle.CreateOrNull(TestSettings.Current);

    [Test]
    [Description("TCR0 — PROBE 紹介状: E00001 + E00022 nguyên văn, và bản đồ màn hình")]
    public void TCR0_Probe_ReferralLetter()
    {
        using var trace = TestTrace.Begin();

        Window? referral = null;

        // ── Bước 0: DỌN hộp thoại đang chắn ─────────────────────────────────
        //
        // Đã vấp ở lượt 13:17: 「歯科初診料を算定しますか？」 (Yes/No/Cancel) đang mở từ
        // lúc màn 診療入力 vừa nạp, nên cú bấm btnShift rơi vào cửa sổ bị modal chặn —
        // dải Shift không bật, và thông điệp lỗi lại đổ cho 「không thấy nút 紹介状」.
        // Đúng cái kiểu đổ oan mà F19 nói tới.
        //
        // Trả lời 「いいえ」, KHÔNG phải OK/Yes: đây là câu hỏi 「có tính 歯科初診料 không」,
        // trả lời có là app CHÈN dòng 処置 thật (F16 — đừng để OK làm fallback).
        Step(trace, 0, "don hop thoai dang chan", () =>
        {
            var seen = new List<string>();
            for (var i = 0; i < 5; i++)
            {
                var box = MsgBoxWin32.First(App.ProcessId);
                if (box is null) break;

                seen.Add(Txt.Vis(box.Raw));
                if (!MsgBoxWin32.ClickButton(box.Hwnd, "いいえ", "No", "キャンセル", "Cancel"))
                {
                    seen.Add("(KHÔNG bấm được nút từ chối; nút thật: " +
                             string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd)) + ")");
                    break;
                }
                Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
                    "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
            }
            return seen.Count == 0 ? "không có hộp thoại nào" : string.Join(" + ", seen);
        });

        Step(trace, 1, "bat dai phim Shift roi bam 「紹介状」", () =>
        {
            var toggle = Uia.ById(Screen.Window, ShiftToggleId);
            if (toggle is null) return $"KHÔNG thấy 「{ShiftToggleId}」 — không bật được dải Shift";

            var label = Txt.N(Uia.NameOf(toggle));
            if (!Txt.Has(label, "ON"))
            {
                Uia.MouseClick(toggle);
                Thread.Sleep(600);
            }

            var button = Uia.Descendants(Screen.Window).FirstOrDefault(
                e => Uia.ControlTypeOf(e) == ControlType.Button && Txt.Has(Uia.NameOf(e), ReferralTitle));
            if (button is null)
                return "KHÔNG thấy nút 「紹介状」 trên dải Shift. Nút đọc được: " + VisibleButtons();

            Uia.MouseClick(button);
            referral = Waits.TryFor(
                () => App.Window(ReferralId)
                      ?? KarteAutoCalcDialog.FindDialogWindow(App, ReferralId, ReferralTitle, Screen.Window),
                TimeSpan.FromSeconds(15));

            return referral is null
                ? "bấm rồi nhưng KHÔNG thấy frm203053 sau 15s — cửa sổ đang mở: " + DescribeWindows()
                : $"frm203053 đang mở, tiêu đề 「{referral.Title}」";
        });

        if (referral is null)
        {
            LogKq(9, "không mở được 紹介状 — dừng probe, xem ảnh trong artifacts/screenshots.");
            return;
        }

        Step(trace, 2, "liet ke o nhap", () =>
        {
            var fields = referral.FindAllDescendants()
                .Where(e => e.ControlType is ControlType.Edit or ControlType.ComboBox or ControlType.Document)
                .ToList();
            foreach (var e in fields.Take(60))
                Log($"      {e.ControlType,-9} id=「{e.AutomationId}」 name=「{Txt.N(e.Name)}」 " +
                    $"value=「{Trunc(Txt.N(Uia.ValueOf(e)))}」");
            return $"{fields.Count} ô";
        });

        Step(trace, 3, "liet ke nut", () =>
        {
            var buttons = referral.FindAllDescendants()
                .Where(e => e.ControlType == ControlType.Button).ToList();
            foreach (var b in buttons.Take(40))
            {
                // Vài phần tử của WinForms KHÔNG phơi AutomationId và ném
                // PropertyNotSupportedException khi đọc — đã vấp ở lượt 13:20.
                string id;
                try { id = b.AutomationId; } catch { id = "(không có)"; }
                Log($"      Button id=「{id}」 name=「{Txt.N(b.Name)}」");
            }
            return $"{buttons.Count} nút";
        });

        // ── E00001: F3 削除 khi ô 発行済呼出し rỗng ────────────────────────────
        Step(trace, 4, "F3 削除 voi o 発行済呼出し RONG → E00001", () =>
        {
            var combo = Uia.ById(referral!, TemplateComboId);
            if (combo is not null) Uia.SetText(combo, "");

            ClickBarButton(referral!, "btnF3", "削除");

            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null) return "KHÔNG có hộp thoại nào — xem ảnh bước này";

            var report = Describe(box, "E00001");
            Dismiss(box);
            return report;
        });

        // ── E00022: 宛名 quá 200 BYTE rồi F9 印刷 ─────────────────────────────
        //
        // Đi qua F9 chứ KHÔNG qua F2, vì hai lý do đã trả giá ở lượt 13:24:
        //
        //  1. F2 đòi ô 発行済呼出し khác rỗng (:146) rồi mới gọi chkInputData, và nếu
        //     kiểm tra QUA thì nó GHI THẬT một dòng SHOUKAI_TMP. Lượt đó ghi mất một
        //     dòng (ID 6) và phải xoá tay bằng SQL.
        //  2. F9 gọi chkInputData TRƯỚC mọi thứ khác (:190) và chỉ in sau khi người dùng
        //     đồng ý Q00019 ⇒ kiểm tra hỏng là dừng hẳn, không chạm DB, không chạm máy in.
        //
        // ⚠️ Và phải dùng chữ TOÀN GIÁC. textBox3 có MaxLength = 200 KÝ TỰ nên 201 chữ
        //    'A' bị cắt còn đúng 200 ⇒ LenB = 200, KHÔNG vượt trần 200 ⇒ chkInputData
        //    QUA — đó chính là lý do lượt 13:24 ghi nhầm một dòng. 101 chữ 「あ」 thì chỉ
        //    101 ký tự (lọt MaxLength) nhưng 202 byte theo CP932 ⇒ vượt trần thật.
        Step(trace, 5, "宛名 = 101 chu toan giac (202 byte) roi F9 印刷 → E00022", () =>
        {
            var atena = Uia.ById(referral!, AtenaBoxId);
            if (atena is null) return $"KHÔNG thấy ô 「{AtenaBoxId}」 (宛名)";

            var before = Uia.ValueOf(atena);
            Uia.SetText(atena, new string('あ', 101));
            Log($"      宛名 trước 「{Trunc(Txt.N(before))}」, nay {Txt.N(Uia.ValueOf(atena)).Length} ký tự");

            ClickBarButton(referral!, "btnF9", "印刷");

            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null)
                return "KHÔNG có hộp thoại — chkInputData đã QUA, tức 宛名 chưa vượt được trần byte";

            var report = Describe(box, "E00022");
            Dismiss(box);

            // Trả 宛名 về nguyên trạng TRƯỚC bước sau: bước Q00019 cần chkInputData QUA.
            Uia.SetText(atena, before);
            return report;
        });

        // ── Q00019: F9 印刷 với dữ liệu hợp lệ ────────────────────────────────
        //
        // Trả lời 「キャンセル」 ⇒ printProc() KHÔNG chạy (:192-196). Không có lệnh in nào.
        Step(trace, 6, "F9 印刷 voi du lieu hop le → Q00019 roi HUY", () =>
        {
            ClickBarButton(referral!, "btnF9", "印刷");

            var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
            if (box is null) return "F9 không bung hộp thoại nào — chkInputData có thể đang hỏng ở trường khác";

            var report = Describe(box, "Q00019");

            // KHÔNG dùng OK làm fallback: ở đây OK = IN THẬT (F16).
            if (!MsgBoxWin32.ClickButton(box.Hwnd, "キャンセル", "Cancel", "いいえ", "No"))
                return report + " ⚠ KHÔNG bấm được nút huỷ — nút thật: " +
                       string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd));

            Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
                "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
            return report;
        });

        Step(trace, 7, "hop thoai con sot", () =>
        {
            var boxes = MsgBoxWin32.All(App.ProcessId);
            foreach (var b in boxes)
                Log($"      {Txt.Vis(b.Raw)} nút: {string.Join(" / ", MsgBoxWin32.ButtonCaptions(b.Hwnd))}");
            return boxes.Count == 0 ? "sạch" : $"{boxes.Count} hộp thoại còn mở";
        });

        LogKq(9, "xong. Nhớ: F2 lưu / F3 xoá của WinForm KHÔNG hỏi và KHÔNG báo gì — " +
                 "Q00002/I00001/Q00003/I00003 là bốn hộp thoại chỉ bản web mới có.");
    }

    private string Describe(MsgBoxWin32.Found box, string expectedCode)
    {
        var template = _msg?.Template(expectedCode);
        var shot = MsgEvidence.Capture(box, $"{expectedCode} frm203053 probe", template);

        Log($"      nguyên văn : {Txt.Vis(box.Raw)}");
        Log($"      nút        : {string.Join(" / ", MsgBoxWin32.ButtonCaptions(box.Hwnd))}");
        if (template is not null) Log($"      row MSGTBL {expectedCode} : {Txt.Vis(template)}");
        Log($"      ảnh        : {shot ?? "(không chụp được)"}");
        return $"{expectedCode}: {Txt.Vis(box.Raw)}";
    }

    private void Dismiss(MsgBoxWin32.Found box)
    {
        MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes");
        Waits.Until(() => MsgBoxWin32.All(App.ProcessId).All(d => d.Hwnd != box.Hwnd),
            "hộp thoại đóng lại", TimeSpan.FromSeconds(10));
    }

    private string VisibleButtons() =>
        string.Join(", ", Uia.Descendants(Screen.Window)
            .Where(e => Uia.ControlTypeOf(e) == ControlType.Button)
            .Select(e => Txt.N(Uia.NameOf(e)))
            .Where(n => n.Length > 0)
            .Take(30));

    private string DescribeWindows()
    {
        try
        {
            return string.Join(", ", OchaApp.SharedAutomation.GetDesktop().FindAllChildren()
                .Where(w => w.Properties.ProcessId.ValueOrDefault == App.ProcessId)
                .Select(w => $"「{Txt.N(w.Name)}」({w.AutomationId})"));
        }
        catch (Exception e) { return $"(không liệt kê được: {e.Message})"; }
    }

    private static string Trunc(string s) => s.Length <= 40 ? s : s[..40] + "…";

    private static void ClickBarButton(AutomationElement form, string automationId, string caption)
    {
        var button = Uia.ByIdOrName(form, automationId, caption)
                     ?? throw new InvalidOperationException(
                            $"không thấy nút 「{caption}」 ({automationId})");
        var (x, y) = Uia.Center(button);
        if (x <= 0 && y <= 0) throw new InvalidOperationException($"nút 「{caption}」 không có toạ độ");
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
    }

    private static void Step(TestTrace trace, int no, string what, Func<string> action)
    {
        try
        {
            var result = action();
            LogKq(no, $"{what} → {result}");
            trace.Step(what);
        }
        catch (Exception e)
        {
            LogKq(no, $"{what} → NGOẠI LỆ {e.GetType().Name}: {e.Message}");
            trace.Shot($"{no}-loi");
        }
    }
}
