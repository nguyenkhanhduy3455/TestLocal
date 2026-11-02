using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>G3 — ma trận thuế 自費</b>: <c>J_TAX_KBN</c> (1 外税 / 2 内税) × <c>J_CALC_KBN</c> (1..6) ×
/// số tiền, và 返金 (luôn 内税). Oracle = <see cref="WfCalcTax"/>, CHÉP NGUYÊN VĂN
/// <c>frm204002.calcTax(int, int, int, int, int, float)</c> (frm204002.cs:2497-2545), kể cả
/// kiểu <c>float</c> và phép ép <c>(decimal)</c>.
///
/// <para>Vì sao chép nguyên kiểu dữ liệu: thuế suất là <c>float</c>; <c>(decimal)(float)</c>
/// giữ ~7 chữ số có nghĩa nên 1100 内税 10% ra ĐÚNG 100, trong khi phép tính <c>double</c>
/// (vd JS) ra 100.00000000000011 ⇒ 切り上げ thành 101. Ca 1100 × (2, 5) là để bắt đúng chỗ đó.
/// WinForm chạy x86 / .NET Framework còn test chạy .NET 8 — nếu khác nhau về số thực thì
/// assert ở đây đỏ, và giá trị ĐO ĐƯỢC mới là đáp án.</para>
///
/// <para>⚠️ <b>Đổi ACCCONFIG dùng chung</b> (dòng duy nhất, áp cho toàn app). Giá trị cũ chụp ở
/// OneTimeSetUp, trả lại ở OneTimeTearDown. Lượt bị cắt giữa chừng thì trả tay:
/// <c>UPDATE ACCCONFIG SET J_TAX_KBN = 1, J_CALC_KBN = 3</c> (giá trị đo 2026-10-20).</para>
/// </summary>
[TestFixture]
[Category("seisan")]
public sealed class SeisanTaxMatrixTests : SeisanTestBase
{
    private (int TaxKbn, int CalcKbn)? _saved;
    private float _rate;

    [OneTimeSetUp]
    public void SaveConfig()
    {
        _saved = Db2.GetJihiTaxConfig();
        TestContext.Out.WriteLine($"ACCCONFIG gốc: J_TAX_KBN={_saved.Value.TaxKbn} J_CALC_KBN={_saved.Value.CalcKbn}");
        // _icData.standardTaxRate = CODMST 900 hiệu lực hôm nay (AccConfig.getTaxRate, frm204002.cs:358)
        _rate = float.Parse(Db2.Scalar(
            "SELECT TOP 1 ANY_VAL2 FROM CODMST WHERE CD_TYPE = 900 AND GETDATE() BETWEEN START_DT AND END_DT") ?? "0.1",
            System.Globalization.CultureInfo.InvariantCulture);
        Current = SeisanNav.OpenCounter(App, Settings);
    }

    [OneTimeTearDown]
    public void RestoreConfig()
    {
        if (_saved is { } s) Db2.SetJihiTaxConfig(s.TaxKbn, s.CalcKbn);
        LeaveSeisan();
    }

    private static IEnumerable<TestCaseData> JihiCases()
    {
        foreach (var calc in new[] { 1, 2, 3, 4, 5, 6 })
            yield return new TestCaseData(1, calc, 1234).SetName($"外税 calc{calc} 1234");
        yield return new TestCaseData(1, 3, 1235).SetName("外税 calc3 1235 (123.5)");
        yield return new TestCaseData(1, 6, 1250).SetName("外税 calc6 1250 (125)");
        foreach (var calc in new[] { 1, 2, 3, 4, 5, 6 })
            yield return new TestCaseData(2, calc, 1234).SetName($"内税 calc{calc} 1234");
        yield return new TestCaseData(2, 2, 1100).SetName("内税 calc2 1100 (float ⇒ đúng 100)");
        yield return new TestCaseData(2, 5, 1100).SetName("内税 calc5 1100 (float ⇒ đúng 100)");
    }

    /// <summary>
    /// 自費 金額 seed (thuế 0) → 値引 0 Enter để chạy calcTax(flg = false) trên đúng số đó
    /// (txtDiscountJ_KeyDown frm204002.cs:1783-1795).
    /// </summary>
    [TestCaseSource(nameof(JihiCases)), Order(1)]
    public void Tc3x_ThueJihi(int taxKbn, int calcKbn, int amount)
    {
        Db2.SetJihiTaxConfig(taxKbn, calcKbn);
        var w = Open(() => Db2.ReplaceUnpaid(TestPatNo, [new(TrtDate, KmCd: 50, Score: 0, ClaimAmt: amount)]));
        SeisanNav.TypeAndEnter(w, "txtDiscountJ", "0");

        var tax = (int)WfCalcTax(taxKbn, calcKbn, amount, 0, 0, _rate);
        // 内税: amount = 金額 + 税(0) − 値引(0); txtAmountTotalJ = amount − tax (calcTax(type) :2393-2412)
        var net = taxKbn == 2 ? amount - tax : amount;
        AssertValues(w, $"J_TAX_KBN={taxKbn} J_CALC_KBN={calcKbn} 金額 {amount} 税率 {_rate} — calcTax frm204002.cs:2497-2545",
            ("txtTaxJ", tax.ToString()), ("txtAmountTotalJ", net.ToString()), ("txtClaimJ", (net + tax).ToString()));
    }

    /// <summary>返金 自費 luôn tách thuế kiểu 内税 với J_CALC_KBN (txtRepayJ_KeyDown frm204002.cs:1895-1909).</summary>
    [TestCase(2, 1100), TestCase(5, 1100), TestCase(3, 1234), Order(2)]
    public void Tc3y_HenkinJihi(int calcKbn, int amount)
    {
        Db2.SetJihiTaxConfig(1, calcKbn);
        var w = Open(() => { });
        Key(w, Vk.F6);
        SeisanNav.TypeAndEnter(w, "txtRepayJ", amount.ToString());

        var tax = (int)WfCalcTax(2, calcKbn, amount, 0, 0, _rate);
        AssertValues(w, $"返金 {amount}, J_CALC_KBN={calcKbn} — calcTax(2, …) frm204002.cs:1901",
            ("txtRepayJTax", tax.ToString()), ("txtRepayJ", (amount - tax).ToString()));
    }

    /// <summary>Chép NGUYÊN VĂN frm204002.calcTax (frm204002.cs:2497-2545) — giữ cả float và (decimal).</summary>
    private static decimal WfCalcTax(int taxKbn, int calcKbn, int amount, int discount, int inTax, float taxRate)
    {
        int claim = 0;
        decimal val;
        decimal tax = 0;
        claim = amount - discount + inTax;
        if (taxKbn == 1)
        {
            val = (decimal)((amount - discount) * taxRate);
        }
        else
        {
            val = (decimal)(claim - (claim / (1 + taxRate)));
        }
        switch (calcKbn)
        {
            case 0: tax = 0; break;
            case 1: tax = Math.Floor(val); break;
            case 2: tax = Math.Ceiling(val); break;
            case 3: tax = Math.Round(val, 0, MidpointRounding.AwayFromZero); break;
            case 4: tax = Math.Floor(val / 10) * 10; break;
            case 5: tax = Math.Ceiling(val / 10) * 10; break;
            case 6: tax = Math.Round(val / 10, 0, MidpointRounding.AwayFromZero) * 10; break;
            default: tax = 0; break;
        }
        return tax;
    }
}
