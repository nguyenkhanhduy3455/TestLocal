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
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ NÓ DỰNG TIỀN ĐỀ Y HỆT TESTCASE
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản đầu không dựng gì, chỉ bấm F8 rồi ghi. Nghe thì "trung lập" nhưng hoá ra là
/// hỏng: thiếu dòng 会計 đã chốt thì <c>LetAccData2</c> rẽ sang nhánh tạo 未精算データ,
/// nên nó khảo sát một cây quyết định <b>khác</b> cây mà testcase sẽ gặp, và mọi luật
/// rút ra từ đó đều lệch địa chỉ. Lượt 2026-08-11 mất trọn một vòng vì chuyện này.
///
/// <para>Vì có <see cref="AccountingPreconditions"/> nên nó GHI vào ACCDAT ⇒ đòi
/// <c>parity.allowSave</c> như testcase thật, và teardown xoá phần đã seed.</para>
///
/// <code>
///   .\run-fix-accounting-data.ps1 -Diagnostics
/// </code>
/// </summary>
[TestFixture]
[Category("diagnostics")]
[Explicit("Cong cu chan doan, chay tay")]
public sealed class AccountingFlowDiagnosticsTests : UiTestBase
{
    private OchaDbAccounting? _db;
    private bool _seededAccounting;
    private IReadOnlyCollection<OchaDbAccounting.UnpaidKey> _unpaidBefore = [];

    protected override string? FixturePreflightSkipReason()
    {
        var s = TestSettings.Current;

        if (!s.Db.Enabled || string.IsNullOrWhiteSpace(s.Db.ConnectionString))
            return "Cần db.connectionString: công cụ này phải ĐỌC ACCDAT / accconfig mới " +
                   "biết chuỗi F8 rẽ nhánh nào.\n\n  " + TestSettings.LocalFileHint();

        if (!s.Parity.AllowSave)
            return "Cần parity.allowSave: để khảo sát ĐÚNG cây quyết định, công cụ phải dựng " +
                   "sẵn một dòng 会計 đã chốt cho ngày test (nó tự xoá khi xong).\n\n  " +
                   TestSettings.LocalFileHint();

        return null;
    }

    [OneTimeTearDown]
    public void DiagnosticsTearDown()
    {
        if (_db is null) return;
        try
        {
            if (_seededAccounting)
            {
                var n = _db.DeleteAccDat(PatNo, TrtDate);
                TestContext.Progress.WriteLine($"Don: xoa {n} dong ACCDAT do cong cu chan doan tao");
            }

            // Chuỗi F8 đi nhầm sang nhánh F thì WinForm đã kịp ghi 未精算データ.
            // Bảng UNPAID không nằm trong ảnh chụp ACCDAT nên phải dọn riêng.
            var u = _db.DeleteUnpaidNotIn(PatNo, TrtDate, _unpaidBefore);
            if (u > 0) TestContext.Progress.WriteLine($"Don: xoa {u} dong UNPAID phat sinh trong luot chay");
        }
        catch (Exception e)
        {
            TestContext.Progress.WriteLine(
                $"⚠️ KHONG don duoc ({e.Message}). Xoa tay:\n" +
                $"  DELETE FROM ACCDAT WHERE pat_no = {PatNo} AND trt_dt = '{TrtDate:yyyy-MM-dd}';\n" +
                $"  DELETE FROM UNPAID WHERE pat_no = {PatNo} AND trt_dt = '{TrtDate:yyyy-MM-dd}';");
        }
    }

    [Test]
    [Description("Đổ chuỗi hộp thoại của F8 会計 để biết cây quyết định thật")]
    public void DumpAccountingDialogChain()
    {
        using var trace = TestTrace.Begin();

        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts");
        Directory.CreateDirectory(dir);

        _db = OchaDbAccounting.CreateOrNull(Settings)
              ?? throw new InvalidOperationException("Không dựng được OchaDbAccounting.");

        var pre = AccountingPreconditions.Ensure(_db, PatNo, TrtDate, trace);
        _seededAccounting = pre.SeededAccounting;
        _unpaidBefore = pre.UnpaidBefore;

        var report = new System.Text.StringBuilder();
        report.AppendLine($"F8 会計 — chuoi hop thoai thuc te, {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        report.AppendLine($"benh nhan={Settings.Patient.PatNo}  ngay={TrtDate:yyyy-MM-dd}");

        if (!pre.Ok)
        {
            // Bấm F8 lúc này chỉ tốn một vòng nữa để khảo sát nhánh KHÔNG quan tâm.
            report.AppendLine("tien de CHUA DU — khong bam F8.");
            report.AppendLine();
            report.AppendLine(pre.Blocker);
            WriteReport(dir, report.ToString());
            IgnoreWithReason(pre.Blocker!);
            return;
        }

        var walk = AccountingFlow.WalkToChgAccData(App, Screen.Window, trace);

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
            report.AppendLine("KHONG toi duoc hop thoai dich.");
            report.AppendLine(walk.Diagnosis ?? "(khong co chan doan)");
            report.AppendLine();
            report.AppendLine("Chi them luat vao AccountingFlow.Rules khi cua so o tren THAT SU la");
            report.AppendLine("MessageBox cua cay quyet dinh 会計 — tra source truoc, dung doan.");
        }

        WriteReport(dir, report.ToString());
    }

    private static void WriteReport(string dir, string content)
    {
        var path = Path.Combine(dir, $"accounting-dialog-chain-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
        File.WriteAllText(path, content);
        TestContext.AddTestAttachment(path, "Chuoi hop thoai F8 会計");
        TestContext.Progress.WriteLine(content);
        TestContext.Progress.WriteLine($"Da ghi: {path}");
    }
}
