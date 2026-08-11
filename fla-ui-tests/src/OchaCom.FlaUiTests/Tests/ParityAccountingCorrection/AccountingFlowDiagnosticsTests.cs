using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

/// <summary>
/// Công cụ chẩn đoán cho luồng 会計データ修正 — KHÔNG phải testcase, có
/// <c>[Explicit]</c> nên chạy cả bộ sẽ bỏ qua.
///
/// <para>Bấm F8 会計 rồi ghi lại <b>toàn bộ chuỗi hộp thoại</b> gặp phải (nguyên văn +
/// tên nút), nhưng <b>không trả lời hộp thoại đích</b> và không ghi gì xuống sổ tiền.</para>
///
/// <para>Dùng khi <see cref="ChgAccDataTests"/> báo Inconclusive: chuỗi
/// <c>LetAccData2</c> rẽ theo dữ liệu bệnh nhân và <c>tre_acc_link</c>, nên chuỗi
/// trên máy bạn có thể khác giả định trong <c>AccountingFlow.Rules</c>. File sinh ra
/// nói rõ phải thêm luật nào.</para>
///
/// <code>
///   .\run-parity-accounting.ps1 -Diagnostics
/// </code>
/// </summary>
[TestFixture]
[Category("diagnostics")]
[Explicit("Cong cu chan doan, chay tay")]
public sealed class AccountingFlowDiagnosticsTests : UiTestBase
{
    [Test]
    [Description("Đổ chuỗi hộp thoại của F8 会計 để biết cây quyết định thật")]
    public void DumpAccountingDialogChain()
    {
        using var trace = TestTrace.Begin();

        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts");
        Directory.CreateDirectory(dir);

        var walk = AccountingFlow.WalkToChgAccData(App, Screen.Window, trace);

        var report = new System.Text.StringBuilder();
        report.AppendLine($"F8 会計 — chuoi hop thoai thuc te, {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        report.AppendLine($"benh nhan={Settings.Patient.PatNo}  ngay={TrtDate:yyyy-MM-dd}");
        report.AppendLine($"toi duoc 会計データ修正: {walk.Reached}");
        report.AppendLine();

        for (var i = 0; i < walk.Trail.Count; i++)
        {
            var s = walk.Trail[i];
            report.AppendLine($"[{i + 1}] 「{s.Text}」");
            report.AppendLine($"    nut      : {string.Join(" / ", s.Buttons)}");
            report.AppendLine($"    da bam   : 「{s.Answered}」");
        }

        if (walk.Reached)
        {
            report.AppendLine();
            report.AppendLine("DICH: 「" + Txt.N(Dialogs.TextOf(walk.Target!)) + "」");
            // Đóng bằng いいえ — công cụ chẩn đoán KHÔNG được ghi vào sổ tiền.
            AccountingFlow.Answer(walk.Target!, yes: false, trace);
            report.AppendLine("(da tra loi いいえ — cong cu chan doan khong ghi DB)");
        }
        else
        {
            report.AppendLine();
            report.AppendLine("KHONG toi duoc hop thoai dich. Doi chieu danh sach tren voi");
            report.AppendLine("AccountingFlow.Rules — hop thoai nao chua co luat thi them vao do.");
        }

        var path = Path.Combine(dir, $"accounting-dialog-chain-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
        File.WriteAllText(path, report.ToString());
        TestContext.AddTestAttachment(path, "Chuoi hop thoai F8 会計");
        TestContext.Out.WriteLine(report.ToString());
        TestContext.Out.WriteLine($"Da ghi: {path}");
    }
}
