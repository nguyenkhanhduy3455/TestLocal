using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Luồng nền GHI LẠI mọi cửa sổ top-level mà app mở ra — <b>không đụng vào chúng</b>.
///
/// <para>Khác <see cref="NuisanceDialogWatcher"/>: cái kia BẤM nút để dẹp hộp thoại nhiễu,
/// cái này chỉ NHÌN. Cần vì có những câu hỏi mà đáp án là chính sự TỒN TẠI của một cửa sổ,
/// và cửa sổ đó có thể <b>tự đóng trong chớp mắt</b>:</para>
///
/// <list type="bullet">
///   <item><c>frm203016</c> 処置選択 — <c>Chk_ChkAuto</c> mở nó cho <c>case 202</c> /
///     <c>case 549</c> / <c>case 179</c> (modMain.cs:995-1020). Lưới một dòng thì
///     <c>getViewData</c> tự <c>defData(0)</c> rồi đóng luôn (frm203016.cs:390-394) ⇒ hỏi
///     「giờ nó có đang mở không」 sau khi thao tác xong là luôn nhận 「không」, bất kể app
///     có mở hay không.</item>
///   <item><c>frm203035</c> 面入力 / <c>frm902003</c> 部位入力 — mở từ
///     <c>frmTrtSel_Let_Trt_Data</c> khi master đặt <c>men = 1</c> / <c>= 2</c>
///     (frm203016.cs:1563, :1588).</item>
///   <item><c>frm203048</c> パラメータダイアログ — mở cho mỗi dấu <c>*</c> còn sót
///     (frm203002.cs:10056).</item>
/// </list>
///
/// <para>Nhịp poll 150ms: hộp thoại tự đóng của WinForms vẫn tồn tại vài trăm ms vì nó
/// phải qua Load + Shown, nhưng đừng poll dày hơn — mỗi vòng là một lượt duyệt desktop
/// bằng COM và nó tranh chấp với luồng chính.</para>
///
/// <para>⚠️ Đây là bằng chứng <b>một chiều</b>: thấy cửa sổ ⇒ chắc chắn app có mở. KHÔNG
/// thấy ⇒ rất có thể app không mở, nhưng cũng có thể cửa sổ sống ngắn hơn một nhịp poll.
/// Vì thế mọi assert 「KHÔNG mở」 phải đi kèm một mốc THỨ HAI (ví dụ: dòng vẫn rơi xuống
/// lưới ⇒ nhánh đã chạy tới cuối mà không hỏi ai).</para>
/// </summary>
public sealed class WindowRecorder : IDisposable
{
    /// <summary>Một cửa sổ đã nhìn thấy, ghi đúng một lần theo khoá <see cref="Key"/>.</summary>
    /// <param name="FirstSeen">Mốc thời gian tính từ lúc <see cref="Start"/>.</param>
    public sealed record Seen(string ClassName, string AutomationId, string Name, TimeSpan FirstSeen)
    {
        public string Key => $"{ClassName}|{AutomationId}|{Name}";

        /// <summary>Cửa sổ này có phải form <paramref name="formId"/> không (vd 「frm203016」).</summary>
        public bool Is(string formId) =>
            Txt.Has(AutomationId, formId) || Txt.Has(ClassName, formId) || Txt.Has(Name, formId);

        public override string ToString() =>
            $"+{FirstSeen.TotalMilliseconds:F0}ms  class=「{ClassName}」 id=「{AutomationId}」 name=「{Name}」";
    }

    private readonly int _processId;
    private readonly CancellationTokenSource _cts = new();
    private readonly Dictionary<string, Seen> _seen = [];
    private readonly object _lock = new();
    private readonly System.Diagnostics.Stopwatch _clock = new();
    private Thread? _thread;

    public WindowRecorder(int processId) => _processId = processId;

    /// <summary>Mọi cửa sổ đã nhìn thấy, theo thứ tự xuất hiện.</summary>
    public IReadOnlyList<Seen> Windows
    {
        get { lock (_lock) return _seen.Values.OrderBy(s => s.FirstSeen).ToList(); }
    }

    /// <summary>Có nhìn thấy form nào mang <paramref name="formId"/> không.</summary>
    public bool Saw(string formId) => Windows.Any(w => w.Is(formId));

    /// <summary>Mô tả gọn để nhét vào thông điệp assert.</summary>
    public string Describe() =>
        Windows.Count == 0
            ? "(không thấy cửa sổ top-level nào ngoài màn chính)"
            : string.Join("\n    ", Windows.Select(w => w.ToString()));

    public void Start()
    {
        if (_thread is not null) return;
        _clock.Restart();
        _thread = new Thread(Loop) { IsBackground = true, Name = nameof(WindowRecorder) };
        _thread.SetApartmentState(ApartmentState.MTA);
        _thread.Start();
    }

    private void Loop()
    {
        // Automation RIÊNG cho luồng này — đối tượng UIA là COM, dùng chung giữa hai luồng
        // là chuốc lấy lỗi ngẫu nhiên (cùng lý do với NuisanceDialogWatcher).
        using var automation = new UIA3Automation();

        while (!_cts.IsCancellationRequested)
        {
            try
            {
                foreach (var w in automation.GetDesktop()
                                            .FindAllChildren(cf => cf.ByControlType(ControlType.Window)))
                    Record(w);
            }
            catch { /* desktop bận / cửa sổ vừa đóng — thử lại vòng sau */ }

            _cts.Token.WaitHandle.WaitOne(TimeSpan.FromMilliseconds(150));
        }
    }

    private void Record(AutomationElement w)
    {
        try
        {
            if (w.Properties.ProcessId.ValueOrDefault != _processId) return;
            if (!Uia.IsOnScreen(w)) return;

            var seen = new Seen(Uia.ClassNameOf(w), Uia.AutomationIdOf(w), Uia.NameOf(w), _clock.Elapsed);
            lock (_lock) _seen.TryAdd(seen.Key, seen);
        }
        catch { /* cửa sổ vừa đóng giữa chừng */ }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _thread?.Join(TimeSpan.FromSeconds(3));
        _cts.Dispose();
    }
}
