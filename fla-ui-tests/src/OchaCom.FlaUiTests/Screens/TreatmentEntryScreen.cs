using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Screens;

/// <summary>
/// Màn 診療入力 — <c>INP.Forms.frm203002</c>, tiêu đề 「　診療入力 - 07年08月」 (có
/// khoảng trắng ĐỦ CHIỀU RỘNG ở đầu, phần tháng đổi theo dữ liệu) nên luôn bắt cửa sổ
/// theo AutomationId <c>frm203002</c>.
///
/// ⚠️ Bộ test này KHÔNG BAO GIỜ bấm F9 登録. Mọi thứ nó làm chỉ nằm trong lưới trên bộ
///    nhớ; không bấm 登録 thì không có gì rơi xuống DB, và app đóng lại là sạch. Đây là
///    lý do các testcase không cần dọn dẹp.
/// </summary>
public sealed class TreatmentEntryScreen
{
    public TreatmentEntryScreen(Window window, AutomationBase automation)
    {
        Window = window;
        Automation = automation;
        Kobetu = new KobetuTab(window);
    }

    public Window Window { get; }
    public AutomationBase Automation { get; }
    public KobetuTab Kobetu { get; }

    public RegiGrid Regi => new(Uia.RequireById(Window, TestSettings.Current.Locator("regiGrid")), Automation);

    /// <summary>Số bệnh nhân đang mở (ô hiển thị <c>lbPatid</c>) — để khẳng định đúng bệnh nhân.</summary>
    public string PatientNo()
    {
        var box = Uia.ById(Window, "lbPatid");
        return box is null ? "" : Txt.N(Uia.ValueOf(box));
    }

    /// <summary>Chuỗi 年月 trên đầu màn (<c>lbDate</c>), dạng 「07年08月」.</summary>
    public string YearMonth()
    {
        var box = Uia.ById(Window, "lbDate");
        return box is null ? "" : Txt.N(Uia.ValueOf(box));
    }

    /// <summary>Chờ lưới đăng ký nạp xong (có ít nhất một dòng).</summary>
    public void WaitUntilReady()
    {
        Waits.Until(() => Regi.Grid.RowElements(limit: 1).Count > 0,
                   "lưới đăng ký của 診療入力 nạp xong",
                   TestSettings.Current.Run.GridLoadTimeout);
    }
}
