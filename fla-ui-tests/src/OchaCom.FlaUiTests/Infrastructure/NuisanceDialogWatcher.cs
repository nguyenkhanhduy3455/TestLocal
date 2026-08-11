using FlaUI.UIA3;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Luồng nền tự bấm 「いいえ」 cho các hộp thoại NHIỄU — bản WinForm của
/// <c>page.addLocatorHandler</c> bên Playwright (GUIDELINE Rule 14/14.1).
///
/// Cần vì sau khi lưới nạp xong hoặc sau mỗi lần chèn 処置, app có thể bung
/// 「〜を算定しますか？」 (modSave.cs:3048/3083/3155) hoặc 「著しく歯科診療が困難な患者に
/// 対する加算を算定しますか？」 (frm203016.cs:1100). Chúng là hộp thoại MODAL: không trả lời
/// thì mọi thao tác sau đứng hình, mà trả lời 「はい」 lại làm thay đổi dữ liệu đang test.
///
/// Chỉ bấm khi nội dung khớp mẫu trong <c>run.nuisanceDialogs</c>. Cảnh báo E00002 —
/// thứ mà TC-3 CHỜ ĐỢI — không khớp mẫu nào nên watcher không đụng vào.
/// </summary>
public sealed class NuisanceDialogWatcher : IDisposable
{
    private readonly int _processId;
    private readonly string[] _patterns;
    private readonly string[] _buttons;
    private readonly CancellationTokenSource _cts = new();
    private readonly List<string> _dismissed = [];
    private readonly object _lock = new();
    private Thread? _thread;

    public NuisanceDialogWatcher(int processId, string[] patterns, string[] buttons)
    {
        _processId = processId;
        _patterns = patterns;
        _buttons = buttons;
    }

    /// <summary>Danh sách hộp thoại đã tự đóng — in ra cuối test để biết app đã hỏi gì.</summary>
    public IReadOnlyList<string> Dismissed
    {
        get { lock (_lock) return _dismissed.ToList(); }
    }

    public void Start()
    {
        if (_patterns.Length == 0 || _thread is not null) return;

        _thread = new Thread(Loop)
        {
            IsBackground = true,
            Name = nameof(NuisanceDialogWatcher),
        };
        _thread.SetApartmentState(ApartmentState.MTA);
        _thread.Start();
    }

    private void Loop()
    {
        // Automation RIÊNG cho luồng này: đối tượng UIA là COM, dùng chung một instance
        // giữa hai luồng là chuốc lấy lỗi ngẫu nhiên.
        using var automation = new UIA3Automation();

        while (!_cts.IsCancellationRequested)
        {
            try
            {
                foreach (var dialog in Dialogs.Open(automation, _processId))
                {
                    var text = Txt.N(Dialogs.TextOf(dialog));
                    if (!_patterns.Any(p => Txt.Has(text, p))) continue;
                    if (!Dialogs.ClickButton(dialog, _buttons)) continue;

                    lock (_lock) _dismissed.Add(text);
                }
            }
            catch { /* app đang bận / cửa sổ vừa đóng — thử lại vòng sau */ }

            _cts.Token.WaitHandle.WaitOne(TimeSpan.FromMilliseconds(300));
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _thread?.Join(TimeSpan.FromSeconds(3));
        _cts.Dispose();
    }
}
