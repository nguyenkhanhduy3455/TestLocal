using System.Diagnostics;
using System.Text;
using NUnit.Framework;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Nhật ký từng bước + ảnh màn hình từng bước cho một testcase.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>UiTestBase.TearDown</c> đã chụp một ảnh sau mỗi testcase. Đủ để biết "lúc kết thúc
/// màn hình trông thế nào", nhưng KHÔNG đủ để biết <b>hỏng ở bước nào</b>: một testcase
/// parity đi qua chục thao tác (mở tab, chèn 処置, bấm F9, trả lời 2 hộp thoại), và ảnh
/// cuối cùng thường chỉ là một màn hình trống trơn sau khi app đã đóng cửa sổ.
///
/// Lớp này ghi lại từng bước kèm mốc thời gian, chụp màn hình ngay tại bước đó, và khi
/// một bước ném lỗi thì chụp thêm một ảnh 「FAIL」 rồi mới để lỗi bay lên. Người chạy trên
/// máy khác chỉ cần gửi thư mục ảnh + file .log là đủ để lần ra chỗ sai, không phải
/// ngồi kể lại.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// DÙNG
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// using var trace = TestTrace.Begin("Tc2d1");
/// trace.Step("mở tab 個別");
/// trace.Do("chèn 処置 110", () => AddSimpleTreatment());
/// var r = trace.Do("bấm F9 và trả lời いいえ", () => SaveFlow.PressF9(...));
/// trace.Note($"màn hình đóng = {r.ScreenClosedAfterwards}");
/// </code>
///
/// Ảnh: <c>artifacts\screenshots\&lt;test&gt;\01_mo-tab-kobetu.png</c>
/// Log : <c>artifacts\screenshots\&lt;test&gt;\_trace.log</c> (cũng in ra stdout)
/// </summary>
public sealed class TestTrace : IDisposable
{
    private readonly string _dir;
    private readonly string _logPath;
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly StringBuilder _buffer = new();
    private readonly bool _captureSteps;
    private int _step;
    private bool _disposed;

    private TestTrace(string name, bool captureSteps)
    {
        _captureSteps = captureSteps;

        var root = TestSettings.Current.Run.ScreenshotDir;
        var baseDir = Path.IsPathRooted(root) ? root : Path.Combine(AppContext.BaseDirectory, root);
        _dir = Path.Combine(baseDir, Safe(name));
        Directory.CreateDirectory(_dir);
        _logPath = Path.Combine(_dir, "_trace.log");
        // Xoá log của lượt trước: Write nối thêm từng dòng nên không tự cắt.
        try { File.Delete(_logPath); } catch { /* chưa có, hoặc đang bị giữ */ }

        Write($"=== {name} - bat dau {DateTime.Now:yyyy-MM-dd HH:mm:ss} ===");
        Write($"    anh + log: {_dir}");
    }

    /// <summary>Mở nhật ký cho testcase đang chạy.</summary>
    public static TestTrace Begin(string? name = null)
    {
        var testName = name ?? TestContext.CurrentContext.Test.Name;
        return new TestTrace(testName, TestSettings.Current.Run.TraceScreenshots);
    }

    /// <summary>Ghi một bước: đánh số, đóng dấu thời gian, chụp màn hình.</summary>
    public void Step(string what)
    {
        _step++;
        Write($"[{_step:00}] {_clock.Elapsed.TotalSeconds,6:0.0}s  {what}");
        if (_captureSteps) Capture($"{_step:00}_{what}");
    }

    /// <summary>Ghi chú, KHÔNG chụp — dùng cho giá trị đọc được, không phải thao tác.</summary>
    public void Note(string what) => Write($"      {_clock.Elapsed.TotalSeconds,6:0.0}s  · {what}");

    /// <summary>Chụp thêm một ảnh có nhãn, ngoài nhịp từng bước.</summary>
    public void Shot(string what)
    {
        Write($"      {_clock.Elapsed.TotalSeconds,6:0.0}s  [SHOT] {what}");
        Capture($"{_step:00}x_{what}");
    }

    /// <summary>
    /// Chạy một thao tác trong khung nhật ký. Ném lỗi thì chụp ảnh 「FAIL」 + ghi nguyên
    /// văn lỗi rồi mới để lỗi bay lên — thứ tự này quan trọng, vì sau khi lỗi bay lên
    /// thì màn hình có thể đã kịp đổi.
    /// </summary>
    public T Do<T>(string what, Func<T> action)
    {
        Step(what);
        try
        {
            var result = action();
            Note($"xong: {what}");
            return result;
        }
        catch (Exception e)
        {
            Fail(what, e);
            throw;
        }
    }

    public void Do(string what, Action action) => Do<object?>(what, () => { action(); return null; });

    /// <summary>Ghi + chụp cho một bước đã hỏng (khi tự bắt lỗi thay vì để nó bay lên).</summary>
    public void Fail(string what, Exception e)
    {
        Write($"      [X] HONG o buoc 「{what}」: {e.GetType().Name}: {e.Message}");
        Capture($"{_step:00}_FAIL_{what}");
    }

    private void Capture(string label)
    {
        try
        {
            var path = ScreenCapture.CaptureToFile(_dir, label);
            TestContext.AddTestAttachment(path, label);
        }
        catch (Exception e)
        {
            Write($"      (khong chup duoc man hinh: {e.Message})");
        }
    }

    /// <summary>
    /// Ghi một dòng ra <b>ba</b> chỗ, và lý do cần cả ba:
    ///
    /// <list type="bullet">
    ///   <item><c>TestContext.Out</c> — vào báo cáo NUnit, nhưng NUnit <b>giữ lại</b> tới
    ///     khi testcase kết thúc.</item>
    ///   <item><c>TestContext.Progress</c> — <b>hiện NGAY</b> trên console.</item>
    ///   <item>File <c>_trace.log</c> — ghi ngay từng dòng.</item>
    /// </list>
    ///
    /// <para>Hai chỗ sau là bài học từ 2026-08-11: một testcase treo giữa chừng và console
    /// <b>không in ra một dòng nào</b> của nó — chỉ thấy testcase trước đó xanh rồi im
    /// lặng. Nhật ký đầy đủ nhưng chỉ xuất hiện khi testcase kết thúc thì vô dụng đúng
    /// vào lúc cần nhất. Treo là lúc phải biết nó dừng ở bước nào, nên mỗi dòng phải ra
    /// khỏi bộ đệm ngay.</para>
    /// </summary>
    private void Write(string line)
    {
        _buffer.AppendLine(line);
        TestContext.Out.WriteLine(line);

        try { TestContext.Progress.WriteLine(line); }
        catch { /* không có console (chạy trong IDE) */ }

        try { File.AppendAllText(_logPath, line + Environment.NewLine); }
        catch { /* ghi log hỏng thì cũng không được làm hỏng testcase */ }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        Write($"=== ket thuc sau {_clock.Elapsed.TotalSeconds:0.0}s ===");
        try
        {
            File.WriteAllText(_logPath, _buffer.ToString());
            TestContext.AddTestAttachment(_logPath, "Nhat ky tung buoc");
        }
        catch { /* ghi log hỏng thì cũng không được làm hỏng testcase */ }
    }

    private static string Safe(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var s = new string(name.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).Trim();
        s = s.Replace(' ', '-');
        return s.Length <= 60 ? s : s[..60];
    }
}
