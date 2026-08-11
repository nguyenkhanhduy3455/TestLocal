using System.Diagnostics;
using FlaUI.Core.AutomationElements;
using FlaUI.UIA3;
using OchaCom.FlaUiTests.Infrastructure;
using FlaUIApplication = FlaUI.Core.Application;

namespace OchaCom.FlaUiTests.App;

/// <summary>
/// Phiên làm việc với app お茶コン: mở (hoặc bám vào) tiến trình, giữ đối tượng
/// automation, tìm cửa sổ theo AutomationId.
///
/// ─── Điều kiện tiên quyết trên máy Windows (không tự dựng được từ test) ──────
///  1. <c>C:\NEW_SIM2000\Ocha.xml</c> tồn tại và <c>&lt;DbConnectString&gt;</c> trỏ tới SQL
///     Server chạy được — XmlControl đọc file này trong static ctor, hỏng là app chết
///     ngay với E88888 (COMMON/Lib/XmlControl.cs:235).
///  2. SQL Server sống, có license hợp lệ, có ít nhất một bác sĩ trong IINMST2 và có
///     bệnh nhân <c>patient.patNo</c> — thiếu thì frm203001 dừng ở cảnh báo E00005/E00027.
///  3. MENU.exe KHÔNG nhận tham số dòng lệnh (MENU/Program.cs:17), nên không có đường
///     tắt nào để nhảy thẳng vào 診療入力: bắt buộc đi qua giao diện như người dùng.
/// </summary>
public sealed class OchaApp : IDisposable
{
    private OchaApp(FlaUIApplication application, UIA3Automation automation, bool ownsProcess)
    {
        Application = application;
        Automation = automation;
        OwnsProcess = ownsProcess;
    }

    public FlaUIApplication Application { get; }
    public UIA3Automation Automation { get; }

    /// <summary>
    /// UIA root độc lập tiến trình — dùng để duyệt cửa sổ mà Windows quản lý
    /// riêng (popup menu <c>#32768</c>, tooltip), vốn không nằm trong UI tree
    /// của tiến trình gốc. Lazy, dùng chung toàn app.
    /// </summary>
    private static UIA3Automation? _sharedAutomation;
    public static UIA3Automation SharedAutomation =>
        _sharedAutomation ??= new UIA3Automation();

    /// <summary>False khi bám vào app người dùng đang mở sẵn — lúc đó không được đóng nó.</summary>
    public bool OwnsProcess { get; }

    public int ProcessId => Application.ProcessId;

    /// <summary>
    /// Chờ tới khi tiến trình app bơm lại được message queue (thanh tiêu đề hết
    /// 「(Not Responding)」).
    ///
    /// <para><b>Vì sao bắt buộc.</b> UIAutomation hỏi qua chính message queue của app —
    /// app đang treo thì mọi truy vấn hoặc timeout hoặc trả về cây rỗng. Triệu chứng
    /// nhìn thấy là 「không tìm thấy control X」 trong khi ảnh chụp cho thấy control X
    /// đang nằm sờ sờ trên màn hình, dẫn người đọc đi sửa locator — sai địa chỉ hoàn toàn.</para>
    ///
    /// <para>Ở app này chuyện đó xảy ra ngay lúc mở 診療入力: khi 診療入力設定 bật
    /// <c>pInpOpt[41]</c> (過去データ１画面表示), <c>GetTrnRsOld</c> đổ TOÀN BỘ lịch sử vào
    /// lưới chính — máy test thật đo được 2864 dòng, app treo hơn một phút. Lưới có
    /// dòng đầu tiên từ rất sớm nên <c>WaitUntilReady</c> tưởng đã xong.</para>
    /// </summary>
    /// <returns>true nếu app phản hồi lại kịp; false nếu hết giờ (để bên gọi tự quyết).</returns>
    public bool WaitUntilResponsive(TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        using var process = Process.GetProcessById(ProcessId);

        while (DateTime.UtcNow < deadline)
        {
            process.Refresh();
            try
            {
                if (process.Responding) return true;
            }
            catch (InvalidOperationException)
            {
                return false; // tiến trình đã thoát
            }
            Thread.Sleep(500);
        }

        process.Refresh();
        return process.Responding;
    }

    public static OchaApp LaunchOrAttach(TestSettings settings)
    {
        var automation = new UIA3Automation();
        var exe = settings.App.ExePath;

        if (settings.App.AttachIfRunning)
        {
            var running = FindRunningProcess(exe);
            if (running is not null)
                return new OchaApp(FlaUIApplication.Attach(running), automation, ownsProcess: false);
        }

        if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe))
        {
            automation.Dispose();
            throw new FileNotFoundException(
                $"Không thấy exe của app: 「{exe}」. Đặt đường dẫn thật vào testsettings.local.json " +
                "(app.exePath) hoặc biến môi trường OCHA_EXE. Bản build sẵn thường ở " +
                @"src\OCHACOM\MENU\bin\x86\Debug\MENU.exe");
        }

        var psi = new ProcessStartInfo(exe)
        {
            // Main() tự ghim CurrentDirectory về thư mục exe, nhưng đặt sẵn cho chắc:
            // các form con nạp bằng Assembly.LoadFrom("INP.dll") theo đường dẫn tương đối.
            WorkingDirectory = string.IsNullOrWhiteSpace(settings.App.WorkingDirectory)
                ? Path.GetDirectoryName(exe)!
                : settings.App.WorkingDirectory,
            UseShellExecute = false,
        };
        foreach (var arg in settings.App.Arguments) psi.ArgumentList.Add(arg);

        return new OchaApp(FlaUIApplication.Launch(psi), automation, ownsProcess: true);
    }

    private static Process? FindRunningProcess(string exePath)
    {
        var name = string.IsNullOrWhiteSpace(exePath) ? "MENU" : Path.GetFileNameWithoutExtension(exePath);
        return Process.GetProcessesByName(name).FirstOrDefault(p => !p.HasExited);
    }

    /// <summary>Mọi cửa sổ top-level ĐANG HIỆN của app.</summary>
    public IReadOnlyList<Window> Windows()
    {
        try
        {
            return Application.GetAllTopLevelWindows(Automation)
                              .Where(Uia.IsOnScreen)
                              .ToList();
        }
        catch
        {
            return [];
        }
    }

    /// <summary>
    /// Cửa sổ theo AutomationId (= tên class form: <c>MainMenu</c>, <c>frm203001</c>,
    /// <c>frm203002</c>).
    ///
    /// Chuyển màn ở app này là <c>showForm()</c> + <c>this.Hide()</c> chứ không đóng
    /// form, nên các màn cũ VẪN nằm trong cây UIA dưới dạng cửa sổ ẩn — luôn lọc
    /// IsOffscreen, đừng bắt theo tiêu đề.
    /// </summary>
    public Window? Window(string automationId) =>
        Windows().FirstOrDefault(w => Uia.AutomationIdOf(w) == automationId);

    public Window RequireWindow(string automationId, TimeSpan? timeout = null) =>
        Waits.For(() => Window(automationId), $"cửa sổ 「{automationId}」", timeout);

    /// <summary>Cửa sổ có tiêu đề chứa chuỗi cho trước — đường dự phòng khi AutomationId trống.</summary>
    public Window? WindowByTitle(string contains) =>
        Windows().FirstOrDefault(w => Txt.Has(Uia.NameOf(w), contains));

    public void Dispose()
    {
        Dispose(forceKill: false);
    }

    private bool _disposed;

    /// <summary>
    /// Kill tiến trình <b>ngay lập tức</b>, kể cả khi <c>app.closeOnFinish = false</c>.
    /// Chỉ có tác dụng khi <see cref="OwnsProcess"/> = true (test tự mở app, không
    /// bám vào app người dùng đang chạy). Dùng từ <c>UiTestBase.TearDown</c> khi
    /// <c>run.killOnFail = true</c> và testcase vừa đỏ — tránh treo app ở trạng thái
    /// lệch chờ thao tác thật của người chạy.
    ///
    /// <para>Idempotent: gọi nhiều lần chỉ kill một lần. Dispose() sau đó an toàn.</para>
    /// </summary>
    public void ForceKill()
    {
        if (_disposed) return;
        if (!OwnsProcess) return;

        try { Application.Kill(); }
        catch { /* app đã tự chết */ }
    }

    private void Dispose(bool forceKill)
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            // forceKill ăn killOnFail và closeOnFinish; ngược lại thì tôn trọng
            // cấu hình người dùng như trước.
            var wantKill = forceKill || (OwnsProcess && TestSettings.Current.App.CloseOnFinish);
            if (wantKill)
            {
                // BaseForm bật CS_NOCLOSE nên nút X bị vô hiệu (BaseForm.cs:43-57);
                // đóng "lịch sự" không được, phải kill.
                Application.Kill();
            }
        }
        catch { /* app đã tự chết */ }

        Automation.Dispose();
        Application.Dispose();
    }
}
