using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// PROBE — <b>đo, KHÔNG assert.</b> Mang <c>[Explicit]</c> nên lượt chạy đủ bỏ qua nó.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════════
/// 14 trong 16 mã còn lệch nằm ở <b>患者登録</b> (<c>frm201001</c> / <c>frm201021</c>) —
/// một màn hình mà bộ FlaUI này CHƯA từng lái bao giờ:
///
/// <code>
///   E00010 E00012      氏名 (khoảng trắng / độ dài)
///   E00013*            初回来院日 &gt; 診療開始日            (*đã khớp, để đối chiếu)
///   E00016 E00017      &lt;16 tuổi + 社保・本人 / 退職者・本人
///   E00018 E00019      保険種別 ↔ 保険情報 / 公費情報
///   E00052             高齢者 setting
///   Q00009 Q00010      ngày trống → lấy hôm nay / 診療開始日
///   Q00012 Q00013      ngưỡng tuổi → 後期高齢者 / 高齢者   (hộp 3 nút và 2 nút)
///   Q00014             有効期限 đã hết
/// </code>
///
/// <para>Muốn nâng chúng thành testcase thật thì phải biết TRƯỚC: màn hình có những ô
/// nào, AutomationId là gì, nút 登録 nằm đâu, và mỗi câu bung ra ở bước nào. Đúng F1:
/// <b>chụp ảnh → đọc ảnh → rồi mới viết assert.</b> Probe này chỉ làm vế đầu.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ PROBE NÀY KHÔNG BẤM 登録
/// ═══════════════════════════════════════════════════════════════════════════════
/// Mọi câu ở bảng trên đều bung TRONG <c>chkInputData</c>, tức là sau khi bấm 登録. Mà
/// nếu dữ liệu tình cờ HỢP LỆ thì cú bấm đó GHI THẬT vào hồ sơ bệnh nhân. Nên probe chỉ
/// MỞ và ĐỌC.
///
/// <para><b>Việc còn lại (đã biết cách, chưa làm):</b> ca thật phải chạy trên BỆNH NHÂN
/// TEST do <c>SeededPatientTestBase</c> dựng (<c>PAT_NO &gt;= 990000</c>, xoá sạch sau
/// lượt chạy) — khi đó mới được phép bấm 登録 để ép validation chạy. Xem
/// <c>Tests/PackDialog/</c> làm mẫu.</para>
///
/// Chạy:
/// <code>
///   .\run-msgtbl-parity.ps1 -Probe
/// </code>
/// </summary>
[TestFixture]
[NonParallelizable]
[Explicit("PROBE — chỉ chạy đích danh; nó mở 患者登録 của bệnh nhân THẬT (chỉ đọc)")]
[Category("msgtbl-parity")]
[CancelAfter(600_000)]
public sealed class MsgTblProbeTests : UiTestBase
{
    /// <summary>Probe đứng ở 患者選択 — 患者登録 mở TỪ đó bằng F2 (frm203001.cs:331-353).</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    /// <summary>AutomationId của 患者登録 (formControl.formId.ID201001).</summary>
    private const string PatEntryId = "frm201001";

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    [Test]
    [Description("TCM9 — PROBE: mở 患者登録 và đổ ra mọi thứ cần để viết ca cho 14 mã còn lại")]
    public void TCM9_Probe_PatientEntryScreen()
    {
        using var trace = TestTrace.Begin();

        // Probe KHÔNG BAO GIỜ ném: mỗi bước tự bắt ngoại lệ, ghi lại rồi đi tiếp. Một bước
        // hỏng không được phép cướp mất câu trả lời của các bước sau.
        Window? patSelect = null;
        Step(trace, 1, "mo man 患者選択", () =>
        {
            patSelect = AppNavigator.OpenPatientSelect(App, Settings);
            return $"frm203001 đang mở, tiêu đề 「{patSelect.Title}」";
        });

        Step(trace, 2, "go so benh nhan", () =>
        {
            var box = Uia.ById(patSelect!, Settings.Locator("patSelPatNo"));
            if (box is null) return "KHÔNG thấy ô 患者番号 — xem lại locator patSelPatNo";
            Uia.SetText(box, PatNo.ToString());
            return $"đã gõ 患者番号 = {PatNo}";
        });

        Step(trace, 3, "bam F2 → 患者登録", () =>
        {
            Uia.SendKey(Vk.F2);
            Waits.Step();
            var win = Waits.TryFor(() => App.Window(PatEntryId), TimeSpan.FromSeconds(15));
            return win is null
                ? "KHÔNG mở được frm201001 sau 15s — xem ảnh bước này"
                : $"frm201001 đang mở, tiêu đề 「{win.Title}」";
        });

        var patEntry = App.Window(PatEntryId);
        if (patEntry is null)
        {
            LogKq(9, "không mở được 患者登録 — dừng probe ở đây, xem ảnh trong artifacts\\screenshots.");
            return;
        }

        Step(trace, 4, "liet ke o nhap", () =>
        {
            var edits = patEntry.FindAllDescendants()
                .Where(e => e.ControlType is FlaUI.Core.Definitions.ControlType.Edit
                                          or FlaUI.Core.Definitions.ControlType.ComboBox
                                          or FlaUI.Core.Definitions.ControlType.CheckBox)
                .ToList();
            foreach (var e in edits.Take(120))
                Log($"      {e.ControlType,-9} id=「{e.AutomationId}」 name=「{Txt.N(e.Name)}」 " +
                    $"value=「{Txt.N(Uia.ValueOf(e))}」");
            return $"{edits.Count} ô nhập (in tối đa 120)";
        });

        Step(trace, 5, "liet ke nut", () =>
        {
            var buttons = patEntry.FindAllDescendants()
                .Where(e => e.ControlType == FlaUI.Core.Definitions.ControlType.Button)
                .ToList();
            foreach (var b in buttons.Take(60))
                Log($"      Button id=「{b.AutomationId}」 name=「{Txt.N(b.Name)}」");
            return $"{buttons.Count} nút — tìm 登録 / F9 trong danh sách này";
        });

        Step(trace, 6, "hop thoai dang mo (neu co)", () =>
        {
            var boxes = MsgBoxWin32.All(App.ProcessId);
            foreach (var b in boxes) Log($"      {Txt.Vis(b.Raw)}  nút: {string.Join(" / ", MsgBoxWin32.ButtonCaptions(b.Hwnd))}");
            return boxes.Count == 0 ? "không có hộp thoại nào" : $"{boxes.Count} hộp thoại đang mở";
        });

        LogKq(9, "xong. Bước tiếp: dựng bệnh nhân test (SeededPatientTestBase) rồi mới được bấm 登録 " +
                 "để ép validation bung E00010/E00012/E00016…; TUYỆT ĐỐI không làm trên bệnh nhân thật.");
    }

    /// <summary>Một bước probe: chụp ảnh, ghi kết quả, và KHÔNG ném dù có chuyện gì.</summary>
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
