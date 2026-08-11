using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.StepsEdit;

/// <summary>
/// Luồng StepsEdit — mở dialog frm203050 「Ｓｔｅｐ編集」 từ menu Step của
/// 診療入力 (<c>frm203002</c>), xác minh cấu trúc, đóng bằng F10 戻る.
///
/// <para>Phạm vi hiện tại: <b>không ghi DB</b>. Xem README.md mục 2.</para>
///
/// <para>Đường tới dialog đi qua menu bar (MenuItem, không phải btnF*); xem
/// <see cref="StepsEditFlow.OpenStepsDialog"/> để biết vì sao click chuột
/// thay vì gửi phím.</para>
/// </summary>
[TestFixture]
[Category("steps-edit")]
public sealed class StepsEditTests : UiTestBase
{
    protected override string? FixturePreflightSkipReason()
    {
        // Mặc định: luôn chạy. Có thể bật thêm tuỳ chọn bỏ qua qua
        // run.stopOnFirstFailure tuỳ project — không phụ thuộc DB.
        return null;
    }

    [Test, Order(1)]
    [Description("Tc1 — mở frm203050 từ menu Step, đọc cấu trúc, đóng bằng F10")]
    public void Tc1_OpenDialog()
    {
        using var trace = TestTrace.Begin();

        var dialog = StepsEditFlow.OpenStepsDialog(App, Screen.Window, trace);

        // Tiêu đề — _title = "Ｓｔｅｐ編集" ở frm203050.cs:37, app đặt qua
        // Title property của BaseDialog. Đọc từ thuộc tính window — nếu sai,
        // testcase sẽ chỉ người đọc đi sửa ngay chỗ đặt.
        var title = Uia.NameOf(dialog);
        trace?.Note($"title dialog: 「{title}」");
        Assert.That(title, Does.Contain(StepsEditFlow.DialogTitleFragment),
            $"Dialog co AutomationId={StepsEditFlow.DialogAutomationId} " +
            $"phai co title chua 「{StepsEditFlow.DialogTitleFragment}」 (frm203050.cs:37).");

        // cboKind — initProc nạp từ cod_mst kind=70. Có DB là có ít nhất
        // 1 dòng (ComboBoxStyle.DropDownList nên rỗng = không chọn được).
        // Không có DB thì DB nullable trong UiTestBase rồi; nhưng testcase
        // này vẫn chạy vì chỉ cần dialog MỞ, không cần giá trị.
        var comboCount = StepsEditFlow.ComboCount(dialog);
        trace?.Note($"cboKind co {comboCount} muc");
        Assert.That(comboCount, Is.GreaterThanOrEqualTo(2),
            "cboKind phai co it nhat 2 muc (1..15 — frm203050.cs:204 " +
            "nap tu cod_mst kind=70). Neu may khong co cod_mst kind=70, " +
            "khoi dong lai app voi du lieu master day du.");

        // txtEpp1..txtEpp32 — đủ 32 phần tử theo Designer.
        var names = StepsEditFlow.TextBoxNames(dialog);
        trace?.Note($"tim thay {names.Count}/32 textbox (txtEpp1..txtEpp32)");
        foreach (var n in names) trace?.Note($"  - {n}");

        Assert.That(names, Has.Count.EqualTo(32),
            "Dialog frm203050 phai co du 32 control txtEpp1..txtEpp32 " +
            "(Designer frm203050.Designer.cs). So luong khac 32 dong nghia " +
            "la Designer da doi va can cap nhat StepsEditFlow.TextBoxNames.");

        // Tên phải đúng thứ tự — bắt "có nhưng không phải 32 phần tử".
        var expected = Enumerable.Range(1, 32).Select(i => $"txtEpp{i}").ToList();
        Assert.That(names, Is.EqualTo(expected),
            "Ten cac textbox phai dung thu tu txtEpp1..txtEpp32, khong duoc sap lon xon.");

        // Đóng bằng F10 戻る — KHÔNG ghi.
        StepsEditFlow.CloseByBack(dialog, trace);
    }
}
