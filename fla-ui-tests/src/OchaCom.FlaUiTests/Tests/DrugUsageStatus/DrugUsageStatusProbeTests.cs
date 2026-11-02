using System.Text;
using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugUsageStatus;

/// <summary>
/// PROBE 医薬品使用状況 (frm506011): đo đáp án WinForm cho nhiều 届出年月 trong MỘT phiên app,
/// để so từng ô với bản web (GET /tenant/drug-usage-status trên cùng dữ liệu đã migrate).
///
/// <para>CHỈ ĐỌC: frm506011 không ghi DB. Dữ liệu ca biên (bệnh nhân 990900) do người chạy
/// seed/dọn từ phía Mac, đối xứng với Postgres — không nằm trong fixture.</para>
///
/// <para>Tháng lấy từ env <c>OCHA_DUS_MONTHS</c> (yyyyMM, phẩy ngăn cách). Mỗi tháng in
/// <c>=== KQ === yyyyMM | r{n} | ô…</c> và ghi <c>artifacts\drug-usage-status.tsv</c>.</para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("drug-usage-status")]
public sealed class DrugUsageStatusProbeTests : UiTestBase
{
    private DrugUsageStatusScreen? _screen;

    protected override bool NavigatesToTreatmentEntry => false;

    protected override AutomationElement? UiaDumpRoot => _screen?.Window;

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    [Test]
    [CancelAfter(840_000)]
    public void Tc0_SumReportMonths()
    {
        var months = (Environment.GetEnvironmentVariable("OCHA_DUS_MONTHS") ?? "202605")
                     .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Log($"=== KQ === tháng: {string.Join(",", months)}");

        using var trace = TestTrace.Begin();
        try
        {
            _screen = DrugUsageStatusScreen.Open(App, Settings, trace);
        }
        catch (Exception e)
        {
            trace.Fail("mở frm506011", e);
            Log($"=== KQ === MỞ MÀN HỎNG: {e.Message}");
            return;
        }

        var tsv = new StringBuilder();
        foreach (var ym in months)
        {
            try
            {
                var run = _screen.Run(ym, TimeSpan.FromMinutes(4), trace);
                trace.Shot($"sau 集計 {ym}");
                Log($"=== KQ === {ym} | {run.Elapsed.TotalSeconds:0.0}s | timeout={run.TimedOut} | " +
                    $"dialogs=[{string.Join(" / ", run.Dialogs)}]");
                for (var i = 0; i < run.Rows.Count; i++)
                {
                    var cells = string.Join(" | ", run.Rows[i]);
                    Log($"=== KQ === {ym} | r{i} | {cells}");
                    tsv.AppendLine($"{ym}\t{i}\t{string.Join("\t", run.Rows[i])}");
                }
                tsv.AppendLine($"{ym}\tdialogs\t{string.Join(" / ", run.Dialogs)}");
            }
            catch (Exception e)
            {
                trace.Fail($"集計 {ym}", e);
                Log($"=== KQ === {ym} | LỖI: {e.Message}");
            }
        }

        var dir = Path.Combine(TestContext.CurrentContext.TestDirectory, "artifacts");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "drug-usage-status.tsv"), tsv.ToString(), new UTF8Encoding(false));
    }
}
