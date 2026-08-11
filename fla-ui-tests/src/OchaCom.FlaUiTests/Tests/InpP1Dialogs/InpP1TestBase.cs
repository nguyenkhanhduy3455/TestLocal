using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// Nền chung cho ba fixture của luồng InpP1Dialogs: thêm <see cref="InpDb"/> (truy vấn
/// chỉ đọc TRTSTATE / chkprm / CODMST) và cờ <c>inpP1.allowSave</c> lên trên
/// <see cref="UiTestBase"/>.
///
/// <para>Ba dialog nằm ở BA fixture riêng chứ không gộp một: <c>run.stopOnFirstFailure</c>
/// tính theo từng fixture, nên Ｂｒサンプル hỏng vì dữ liệu <c>BrSample</c> của máy
/// không kéo theo Ｓｔｅｐ編集 và チェック項目設定 bị Ignore. Đây là chỗ KHÁC bản
/// Playwright: bên đó gộp một file để tiết kiệm lượt đăng nhập (app web chặn ~10 lần
/// login/giờ), còn ở đây mở app không tốn quota gì.</para>
/// </summary>
public abstract class InpP1TestBase : UiTestBase
{
    /// <summary>Null khi tắt DB hoặc không kết nối được — lý do ở <see cref="InpDbUnavailableReason"/>.</summary>
    protected InpP1Db? InpDb { get; private set; }

    protected string? InpDbUnavailableReason { get; private set; }

    /// <summary>Cho phép bấm F9 ghi thật (<c>inpP1.allowSave</c>).</summary>
    protected bool AllowSave => Settings.InpP1.AllowSave;

    [OneTimeSetUp]
    public void InpP1OneTimeSetUp()
    {
        // Chạy SAU UiTestBaseOneTimeSetUp (NUnit gọi OneTimeSetUp từ lớp gốc xuống),
        // nên Settings đã có sẵn.
        InpDb = InpP1Db.CreateOrNull(Settings);
        if (InpDb is null)
        {
            InpDbUnavailableReason =
                "db.enabled = false hoặc thiếu db.connectionString trong testsettings(.local).json";
            return;
        }

        var error = InpDb.ProbeError();
        if (error is null) return;

        InpDbUnavailableReason = $"không kết nối được SQL Server: {error}";
        InpDb = null;
    }

    /// <summary>DB không dùng được thì Ignore kèm lý do; có thì trả về.</summary>
    protected InpP1Db RequireInpDb(string why)
    {
        if (InpDb is null) IgnoreWithReason($"{why} — {InpDbUnavailableReason}");
        return InpDb!;
    }

    /// <summary>Chưa bật <c>inpP1.allowSave</c> thì Ignore — bản sao của TEST_ALLOW_SAVE=1.</summary>
    protected void RequireAllowSave(string what)
    {
        if (AllowSave) return;
        IgnoreWithReason(
            $"{what} — đặt \"inpP1\": {{ \"allowSave\": true }} trong testsettings.local.json " +
            "hoặc biến môi trường OCHA_INP_P1_ALLOW_SAVE=1 để chạy. " + TestSettings.LocalFileHint());
    }

    /// <summary>Ghi một dòng vào báo cáo NUnit (hiện ngay trên console).</summary>
    protected static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); }
        catch { /* không có console */ }
    }
}
