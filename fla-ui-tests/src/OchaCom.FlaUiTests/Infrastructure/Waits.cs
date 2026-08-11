using System.Diagnostics;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Chờ có điều kiện. Tương đương auto-wait của Playwright `expect`: KHÔNG bao giờ
/// Thread.Sleep một con số phỏng đoán để "app kịp phản hồi" — luôn hỏi lại UI cho tới
/// khi điều kiện đúng hoặc hết hạn.
///
/// (<see cref="Step"/> là ngoại lệ có chủ đích: nhịp cho mắt người nhìn khi chạy
/// demo, mặc định 0 ms — giống tests/step.ts của bộ Playwright.)
/// </summary>
public static class Waits
{
    public static TimeSpan PollInterval { get; set; } = TimeSpan.FromMilliseconds(150);

    /// <summary>Chờ tới khi <paramref name="condition"/> đúng; hết hạn thì ném kèm <paramref name="what"/>.</summary>
    public static void Until(Func<bool> condition, string what, TimeSpan? timeout = null)
    {
        if (!TryUntil(condition, timeout))
            throw new TimeoutException($"Quá {Resolve(timeout).TotalSeconds:0.#}s mà chưa: {what}");
    }

    public static bool TryUntil(Func<bool> condition, TimeSpan? timeout = null)
    {
        var limit = Resolve(timeout);
        var sw = Stopwatch.StartNew();
        do
        {
            if (SafeBool(condition)) return true;
            Thread.Sleep(PollInterval);
        } while (sw.Elapsed < limit);

        return SafeBool(condition);
    }

    /// <summary>Chờ tới khi hàm trả về khác null; hết hạn thì ném.</summary>
    public static T For<T>(Func<T?> get, string what, TimeSpan? timeout = null) where T : class
    {
        var found = TryFor(get, timeout);
        return found ?? throw new TimeoutException($"Quá {Resolve(timeout).TotalSeconds:0.#}s mà không thấy: {what}");
    }

    public static T? TryFor<T>(Func<T?> get, TimeSpan? timeout = null) where T : class
    {
        var limit = Resolve(timeout);
        var sw = Stopwatch.StartNew();
        do
        {
            var v = SafeGet(get);
            if (v is not null) return v;
            Thread.Sleep(PollInterval);
        } while (sw.Elapsed < limit);

        return SafeGet(get);
    }

    /// <summary>
    /// Poll một giá trị cho tới khi thoả điều kiện, rồi trả về giá trị đó. Dùng cho
    /// kiểu assert "số dòng phải &gt; 0" mà không muốn ngủ cứng.
    /// </summary>
    public static T Poll<T>(Func<T> get, Func<T, bool> ok, string what, TimeSpan? timeout = null)
    {
        var limit = Resolve(timeout);
        var sw = Stopwatch.StartNew();
        T last = default!;
        do
        {
            last = get();
            if (ok(last)) return last;
            Thread.Sleep(PollInterval);
        } while (sw.Elapsed < limit);

        last = get();
        if (ok(last)) return last;
        throw new TimeoutException($"Quá {limit.TotalSeconds:0.#}s mà chưa: {what} (giá trị cuối: {last})");
    }

    /// <summary>Nhịp quan sát khi ngồi xem chạy; 0 ms khi chạy nền (run.stepMs).</summary>
    public static void Step()
    {
        var ms = TestSettings.Current.Run.StepMs;
        if (ms > 0) Thread.Sleep(ms);
    }

    private static TimeSpan Resolve(TimeSpan? timeout) => timeout ?? TestSettings.Current.Run.DefaultTimeout;

    // UIA hay ném COMException khi phần tử biến mất giữa chừng (element not available).
    // Trong vòng chờ thì đó là "chưa xong", không phải lỗi.
    private static bool SafeBool(Func<bool> f)
    {
        try { return f(); }
        catch (Exception e) when (IsTransient(e)) { return false; }
    }

    private static T? SafeGet<T>(Func<T?> f) where T : class
    {
        try { return f(); }
        catch (Exception e) when (IsTransient(e)) { return null; }
    }

    private static bool IsTransient(Exception e) =>
        e is System.Runtime.InteropServices.COMException
            or UnauthorizedAccessException
            or InvalidOperationException
            or NullReferenceException;
}
