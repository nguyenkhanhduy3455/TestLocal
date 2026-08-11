using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.App;

/// <summary>
/// Đưa app từ lúc vừa mở tới màn 診療入力 của một bệnh nhân + một ngày.
///
/// ─── Lộ trình (không có đường tắt, xem OchaApp) ──────────────────────────────
///   MainMenu 「メインメニュー」
///     └─ click pane <c>pnlBtn1</c>  → 日常業務            (MainMenu.cs:343)
///     └─ click pane <c>pnlMenu3</c> → formId.ID203001     (MainMenu.cs:823)
///   frm203001 「診療入力（患者選択）」
///     └─ 診療日 = user control <c>dtTrtDt</c> (cboEra/txtYear/txtMonth/txtDay),
///        postInit đã điền sẵn HÔM NAY (frm203001.cs:566)
///     └─ 患者番号 = <c>cboPatNo</c>; Enter → defData(inpTxt) ⇒ InpKbn = Insert
///        (frm901001.cs:88-94, frm203001.cs:645), F8 → Update, F9 → Insert
///   frm203002 「　診療入力 - 07年08月」
///
/// Hai cái bẫy của app:
///   · Chuyển màn là <c>showForm()</c> + <c>Hide()</c> chứ không đóng form ⇒ cửa sổ cũ
///     vẫn còn trong cây UIA, phải lọc theo AutomationId + IsOffscreen.
///   · Menu chính không có Button nào, toàn Panel nghe <c>MouseClick</c> ⇒ phải click
///     chuột thật, InvokePattern không có tác dụng.
/// </summary>
public static class AppNavigator
{
    /// <summary>Mở 診療入力 và trả về cửa sổ frm203002.</summary>
    public static Window OpenTreatmentEntry(OchaApp app, TestSettings settings)
    {
        var launchTimeout = TimeSpan.FromSeconds(settings.App.LaunchTimeoutSeconds);

        // Đang mở sẵn màn 診療入力 (chạy lại lần hai trên cùng tiến trình) → dùng luôn.
        var already = app.Window("frm203002");
        if (already is not null) return already;

        if (app.Window("frm203001") is null)
        {
            var menu = WaitForMainMenu(app, launchTimeout);
            ClickPane(menu, "pnlBtn1", "業務 日常業務");
            ClickPane(menu, "pnlMenu3", "メニュー 診療入力");
        }

        var patSelect = app.RequireWindow("frm203001", launchTimeout);
        Waits.Step();

        SetTreatmentDate(patSelect, settings.Patient.ResolvedTrtDate);
        EnterPatient(app, patSelect, settings);

        return WaitForTreatmentWindow(app, settings, launchTimeout);
    }

    private static Window WaitForMainMenu(OchaApp app, TimeSpan timeout)
    {
        var menu = Waits.TryFor(() => app.Window("MainMenu") ?? app.WindowByTitle("メインメニュー"), timeout);
        if (menu is not null) return menu;

        throw new TimeoutException(
            "Không thấy cửa sổ メインメニュー. " + DescribeOpenDialogs(app) +
            " Kiểm tra C:\\NEW_SIM2000\\Ocha.xml và kết nối SQL Server — lỗi hai thứ này " +
            "app dừng ở hộp thoại ngay lúc khởi động (XmlControl.cs:235, ComLibrary.chkExcellent).");
    }

    private static void ClickPane(Window window, string automationId, string what)
    {
        var pane = Waits.For(() => Uia.ById(window, automationId), $"{what} (pane 「{automationId}」)");
        Uia.MouseClick(pane);
        Waits.Step();
    }

    /// <summary>
    /// Đặt 診療日 trên control <c>dtTrtDt</c>.
    ///
    /// Ngày mặc định đã là HÔM NAY nên trường hợp thường gặp không phải gõ gì. Khi cần
    /// ngày khác: ô 年 nhận NĂM HOÀNG LỊCH (令和), không phải năm dương — 2026 → 08.
    /// </summary>
    public static void SetTreatmentDate(Window patSelect, DateTime date)
    {
        if (date.Date == DateTime.Today) return;

        if (date < new DateTime(2019, 5, 1))
            throw new NotSupportedException(
                $"Ngày {date:yyyy-MM-dd} nằm trước 令和. Ô 年 của CustomDate là năm hoàng lịch và " +
                "test này chỉ đổi số năm chứ không đổi 元号 — chọn ngày trong 令和, hoặc đặt " +
                "patient.trtDate rỗng để dùng hôm nay.");

        var dateControl = Waits.For(() => Uia.ById(patSelect, "dtTrtDt"), "control 診療日 「dtTrtDt」");

        var era = date.Year - 2018;              // 2019 = 令和1
        Set("txtYear", era.ToString("00"));
        Set("txtMonth", date.Month.ToString("00"));
        Set("txtDay", date.Day.ToString("00"));
        Waits.Step();

        void Set(string id, string value)
        {
            var box = Waits.For(() => Uia.ById(dateControl, id), $"ô 「{id}」 của 診療日");
            Uia.SetText(box, value);
        }
    }

    private static void EnterPatient(OchaApp app, Window patSelect, TestSettings settings)
    {
        var combo = Waits.For(() => Uia.ById(patSelect, "cboPatNo"), "ô 患者番号 「cboPatNo」");
        Uia.SetText(Uia.EditInside(combo), settings.Patient.PatNo);
        Waits.Step();

        switch (settings.Patient.OpenMode.Trim().ToLowerInvariant())
        {
            case "insert":
                // Enter trong cboPatNo = defData(inpTxt) ⇒ InpKbn mặc định Insert.
                Keyboard.Press(VirtualKeyShort.ENTER);
                break;
            case "update":
                // F8 「閲覧/変更」. BaseForm bật KeyPreview và định tuyến phím F về đúng
                // handler của nút, nên bấm phím chắc ăn hơn click nút gradient.
                Keyboard.Press(VirtualKeyShort.F8);
                break;
            default:
                throw new ArgumentException(
                    $"patient.openMode = 「{settings.Patient.OpenMode}」 không hợp lệ; chỉ nhận insert / update.");
        }
        Waits.Step();
    }

    private static Window WaitForTreatmentWindow(OchaApp app, TestSettings settings, TimeSpan timeout)
    {
        var window = Waits.TryFor(
            () => app.Window("frm203002")
                  ?? app.WindowByTitle(settings.App.TreatmentWindowTitleContains),
            timeout);

        if (window is not null) return window;

        throw new TimeoutException(
            $"Bấm chọn bệnh nhân {settings.Patient.PatNo} rồi mà màn 診療入力 (frm203002) không mở. " +
            DescribeOpenDialogs(app) +
            " Hay gặp: E00005 患者情報 (không có bệnh nhân đó), E00027 ドクター (IINMST2 rỗng), " +
            "E00002 診療日 (ngày không hợp lệ).");
    }

    private static string DescribeOpenDialogs(OchaApp app)
    {
        var texts = Dialogs.Open(app.Automation, app.ProcessId)
                           .Select(d => Txt.N(Dialogs.TextOf(d)))
                           .Where(t => t.Length > 0)
                           .ToList();
        return texts.Count == 0
            ? "Không có hộp thoại nào đang mở."
            : "Hộp thoại đang mở: " + string.Join(" / ", texts.Select(t => $"「{t}」")) + ".";
    }
}
