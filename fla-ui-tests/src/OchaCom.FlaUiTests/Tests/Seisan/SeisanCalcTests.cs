using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>G3 — phép tính trên frm204002 (không F9).</b> Mỗi ca: đặt UNPAID / PERSON_EXP /
/// 負担率 của bệnh nhân test → mở 204002 → thao tác → so các ô → F10 「登録せずに」 OK.
///
/// <para>Dữ liệu nền mỗi ca (trừ khi ca tự đổi): 保険 300点 (50 + 250) / 900円, 自費 5000 +
/// thuế 500, PERSON_EXP = 0, 負担率 0. Cấu hình máy đo: J/B_TAX_KBN = 1 (外税), J/B_CALC_KBN
/// = 3 (四捨五入), thuế 10% / 軽減 8%. Kỳ vọng từ công thức WinForm (dẫn dòng) và đã khớp
/// probe <c>SeisanCalcProbeTests</c> 2026-10-20.</para>
///
/// <para>Ghi DB: chỉ bệnh nhân test 990000+.</para>
/// </summary>
[TestFixture]
[Category("seisan")]
public sealed class SeisanCalcTests : SeisanTestBase
{
    [OneTimeSetUp]
    public void OpenCounter() => Current = SeisanNav.OpenCounter(App, Settings);

    // ── A: giá trị lúc mở theo dữ liệu ────────────────────────────────────────

    [Test, Order(1)]
    public void Tc3a_MiShuKaishu()
    {
        var w = Open(() => Db2.SetPersonExp(TestPatNo, insDueBal: 100, ownDueBal: 200, ownDueExc: 20, gdsDueBal: 300, gdsDueExc: 30));
        AssertValues(w, "getPatInfo frm204002.cs:711-714 + dspTotal :529-546",
            ("txtAccrH", "100"), ("txtAccrJ", "220"), ("txtAccrB", "330"),
            ("txtClaimTotal", "7050"), ("txtShortageTotal", "7050"));
    }

    [Test, Order(2)]
    public void Tc3b_NyukinShitei()
    {
        var w = Open(() => Db2.ReplaceUnpaid(TestPatNo,
        [
            new(TrtDate, KmCd: 40, Score: 300, ClaimAmt: 900, ScoreD1: 50, ScoreD9: 250, ReceAmt: 3000),
            new(TrtDate, KmCd: 50, Score: 0, ClaimAmt: 5000, Tax: 500),
        ]));
        AssertValues(w, "RECE_RCV_FLG = 1 + rece_amt ≠ -1 ⇒ txtRece = Σ rece_amt + rece_tax, dspChange (frm204002.cs:404-414, 487-488)",
            ("txtRece", "3000"), ("txtShortageTotal", "3400"), ("txtReceChange", "0"));
        Assert.That(Uia.ById(w, "lblRece2") is { } l && Uia.IsOnScreen(l), Is.False, "claim > rece ⇒ lblRece2.Visible = false (dspChange :556-561)");
    }

    [Test, Order(3)]
    public void Tc3c_Kaigo()
    {
        var w = Open(() => Db2.ReplaceUnpaid(TestPatNo,
            [.. BaseRows(), new(TrtDate, KmCd: 40, Score: 100, ClaimAmt: 300, Lflg: 1, TrtCnt: 101)]));
        AssertValues(w, "介護 = lflg 1 (getUnPaidList care), txtAmountTotalH = 保険 + 介護 (frm204002.cs:459-463)",
            ("txtScoreTotal", "300"), ("txtCareScore", "100"), ("txtCareAmount", "300"),
            ("txtAmountTotalH", "1200"), ("txtClaimH", "1200"), ("txtClaimTotal", "6700"));
    }

    [Test, Order(4)]
    public void Tc3d_FutanRitsuKhongTinhLaiLucMo()
    {
        var w = Open(() => Db2.SetAccRate(TestPatNo, 30));
        AssertValues(w, "負担率 chỉ hiện (getPatInfo :701), 金額 lấy nguyên UNPAID — không calcHokenAmount lúc mở",
            ("txtAccRate", "30"), ("txtAmountTotalH", "900"), ("txtClaimH", "900"));
    }

    // ── B: F7 với 預り金 ──────────────────────────────────────────────────────

    [Test, Order(5)]
    public void Tc3e_AzukariNhoHonSeikyu()
    {
        var w = Open(() => Db2.SetPersonExp(TestPatNo, depDue: 5000));
        Key(w, Vk.F7);
        AssertValues(w, "changeF7: 0 < 預り金 5000 < 請求 6400 ⇒ appr = dep, rece = claim − dep (frm204002.cs:2087-2094)",
            ("txtAppr", "5000"), ("txtRece", "1400"), ("txtShortageTotal", "0"), ("txtApprChange", "0"));

        SeisanNav.TypeAndEnter(w, "txtAppr", "9000");
        AssertValues(w, "txtAppr_KeyDown: appr > 預り金 ⇒ chặn về 預り金 (frm204002.cs:1477-1480)",
            ("txtAppr", "5000"), ("txtRece", "1400"));
    }

    [Test, Order(6)]
    public void Tc3f_AzukariLonHonSeikyu()
    {
        var w = Open(() => Db2.SetPersonExp(TestPatNo, depDue: 10000));
        Key(w, Vk.F7);
        AssertValues(w, "changeF7: 預り金 ≥ 請求 ⇒ appr = claim, rece = 0 (frm204002.cs:2095-2100)",
            ("txtAppr", "6400"), ("txtRece", "0"), ("txtShortageTotal", "0"));
    }

    // ── C: 点数 / 負担率 ─────────────────────────────────────────────────────

    [Test, Order(7)]
    public void Tc3g_TenMeisai_LamTron10En()
    {
        var w = Open(() => Db2.SetAccRate(TestPatNo, 30));
        SeisanNav.TypeAndEnter(w, "txtSc9", "283");
        // 333 × 10 × 30 / 100 = 999 ⇒ 999/10×10 + (9 ≥ 5 ? 10 : 0) = 1000 (calcHokenAmount :2342-2355)
        AssertValues(w, "calcScore Σ txtSc1-14 (frm204002.cs:2188-2221) → calcHokenAmount 10円未満四捨五入",
            ("txtScoreTotal", "333"), ("txtAmountTotalH", "1000"), ("txtClaimH", "1000"), ("txtClaimTotal", "6500"));
    }

    [Test, Order(8)]
    public void Tc3h_TenCongDon_VaPhimTru()
    {
        var w = Open(() => Db2.SetAccRate(TestPatNo, 30));
        SeisanNav.TypeAndEnter(w, "txtScore", "100");
        AssertValues(w, "txtScore Enter ⇒ calcTotal(Ten) cộng dồn (frm204002.cs:1551-1561, 2315-2322)",
            ("txtScoreTotal", "400"), ("txtAmountTotalH", "1200"), ("txtClaimTotal", "6700"));

        PressSubtract(w, "txtScore");
        AssertValues(w, "phím − ⇒ trừ lại lần cộng cuối (_bkScore, frm204002.cs:2323-2335)",
            ("txtScoreTotal", "300"), ("txtAmountTotalH", "900"), ("txtClaimTotal", "6400"));
    }

    [Test, Order(9)]
    public void Tc3i_FutanRitsuEnter()
    {
        var w = Open(() => { });
        SeisanNav.TypeAndEnter(w, "txtAccRate", "20");
        AssertValues(w, "txtAccRate_KeyDown Enter ⇒ calcHokenAmount: 300 × 10 × 20 / 100 = 600 (frm204002.cs:1450-1459)",
            ("txtAccRate", "20"), ("txtAmountTotalH", "600"), ("txtClaimH", "600"), ("txtClaimTotal", "6100"));
    }

    // ── D/E: 金額 / 値引 / 消費税 ───────────────────────────────────────────────

    [Test, Order(10)]
    public void Tc3j_KinGakuHoken_CongDon_VaPhimTru()
    {
        var w = Open(() => { });
        SeisanNav.TypeAndEnter(w, "txtAmountH", "500");
        AssertValues(w, "txtAmountH Enter ⇒ calcTotal(Hoken) cộng dồn (frm204002.cs:1663-1677)",
            ("txtAmountTotalH", "1400"), ("txtClaimH", "1400"), ("txtClaimTotal", "6900"));
        PressSubtract(w, "txtAmountH");
        AssertValues(w, "phím − ⇒ trừ lại _bkAmountH", ("txtAmountTotalH", "900"), ("txtClaimTotal", "6400"));
    }

    [Test, Order(11)]
    public void Tc3k_KinGakuJihi_ThueNgoai()
    {
        var w = Open(() => { });
        SeisanNav.TypeAndEnter(w, "txtAmountJ", "1234");
        // (5000 + 1234) × 0.1 = 623.4 ⇒ 四捨五入 623 (calcTax :2497-2540, J_CALC_KBN 3)
        AssertValues(w, "txtAmountJ Enter ⇒ calcTotal(Jihi) + calcTax(外税) + calcClaim (frm204002.cs:1695-1712)",
            ("txtAmountTotalJ", "6234"), ("txtTaxJ", "623"), ("txtClaimJ", "6857"), ("txtClaimTotal", "7757"));
    }

    [Test, Order(12)]
    public void Tc3l_NebikiJihi()
    {
        var w = Open(() => { });
        SeisanNav.TypeAndEnter(w, "txtDiscountJ", "99999");
        AssertValues(w, "値引 > 金額 ⇒ trả về giá trị trước (_bkDiscountJ = 0), không tính lại (frm204002.cs:1785-1789)",
            ("txtDiscountJ", "0"), ("txtTaxJ", "500"), ("txtClaimJ", "5500"));

        SeisanNav.TypeAndEnter(w, "txtDiscountJ", "234");
        // (5000 − 234) × 0.1 = 476.6 ⇒ 477; 請求 = 5000 − 234 + 477
        AssertValues(w, "値引 hợp lệ ⇒ calcTax(flg=false) + calcClaim (frm204002.cs:1790-1793)",
            ("txtDiscountJ", "234"), ("txtTaxJ", "477"), ("txtClaimJ", "5243"), ("txtClaimTotal", "6143"));
    }

    [Test, Order(13)]
    public void Tc3m_NebikiHoken()
    {
        var w = Open(() => { });
        SeisanNav.TypeAndEnter(w, "txtDiscountH", "100");
        AssertValues(w, "txtDiscountH Enter ⇒ calcClaim: 900 − 100 (frm204002.cs:1755-1768)",
            ("txtDiscountH", "100"), ("txtClaimH", "800"), ("txtClaimTotal", "6300"));
    }

    [Test, Order(14)]
    public void Tc3n_Buppin_KeigenZeiritsu()
    {
        var w = Open(() => { });
        AnswerKeigen(w, "1000", yes: false);
        AssertValues(w, "物品 金額 Enter, 軽減税率 「いいえ」 ⇒ 標準 10%: 100 (calcTotal(Buppin) frm204002.cs:2252-2286)",
            ("txtAmountTotalB", "1000"), ("txtTaxB", "100"), ("txtClaimB", "1100"), ("txtClaimTotal", "7500"));

        AnswerKeigen(w, "1000", yes: true);
        AssertValues(w, "lần hai 「はい」 ⇒ 軽減 8%: +80",
            ("txtAmountTotalB", "2000"), ("txtTaxB", "180"), ("txtClaimB", "2180"), ("txtClaimTotal", "8580"));
    }

    // ── G: 返金 ───────────────────────────────────────────────────────────────

    [Test, Order(15)]
    public void Tc3o_Henkin_KhongCapNhatTong()
    {
        var w = Open(() => { });
        Key(w, Vk.F6);
        SeisanNav.TypeAndEnter(w, "txtRepayJ", "1100");
        // 内税 tách thuế: 1100 − 1100 / 1.1 = 100 (txtRepayJ_KeyDown :1895-1909, calcTax(2, J_CALC_KBN))
        AssertValues(w, "txtRepayJ Enter ⇒ tách thuế 内税",
            ("txtRepayJ", "1000"), ("txtRepayJTax", "100"));

        SeisanNav.TypeAndEnter(w, "txtRepayH", "500");
        // ⛔ Quirk WinForm, đo 2026-10-20: không handler 返金 nào gọi dspTotal ⇒ 請求合計 KHÔNG
        // giảm khi nhập 返金 (chỉ được tính ở dspTotal lần sau). Đừng "sửa" assert này.
        AssertValues(w, "txtRepayJ/txtRepayH Enter KHÔNG gọi dspTotal ⇒ 請求合計 giữ nguyên",
            ("txtRepayH", "500"), ("txtClaimTotal", "6400"), ("txtShortageTotal", "6400"));
    }

    // ── I: calcClaim trong 入金 mode ─────────────────────────────────────────

    [Test, Order(16)]
    public void Tc3p_CalcClaim_DaoVeSeikyu()
    {
        var w = Open(() => { });
        Key(w, Vk.F7);
        AssertValues(w, "F7 ⇒ 入金 mode, 本日入金 = 請求合計", ("txtRece", "6400"));

        SeisanNav.TypeAndEnter(w, "txtAmountJ", "100");
        AssertValues(w, "calcClaim khi _inpMode = 2 ⇒ về 請求, 本日入金 = 0 (frm204002.cs:2572-2583)",
            ("txtAmountTotalJ", "5100"), ("txtTaxJ", "510"), ("txtClaimJ", "5610"),
            ("txtClaimTotal", "6510"), ("txtShortageTotal", "6510"), ("txtRece", "0"));
        Assert.That(FKeys(w), Is.EqualTo(Fk204002Seikyu), "nhãn F3/F4/F5/F7 về bộ 請求 (btnChgText :2574-2577)");
    }

    // ─────────────────────────────────────────────────────────────────────────

    private static void PressSubtract(Window w, string id)
    {
        Uia.ForceForeground(w.Properties.NativeWindowHandle);
        Uia.RequireById(w, id).Focus();
        Keyboard.Press(VirtualKeyShort.SUBTRACT);
        Thread.Sleep(500);
    }

    /// <summary>Gõ 金額 物品 + Enter rồi trả lời 「軽減税率を適用しますか？」 (calcTotal(Buppin) :2261).</summary>
    private void AnswerKeigen(Window w, string amount, bool yes)
    {
        SeisanNav.TypeAndEnter(w, "txtAmountB", amount);
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(6))
                  ?? throw new AssertionException("標準 ≠ 軽減 mà không hỏi 「軽減税率を適用しますか？」 (frm204002.cs:2261)");
        Assert.That(SeisanNav.OneLine(box.Text), Is.EqualTo("軽減税率を適用しますか？"));
        Assert.That(MsgBoxWin32.ClickButton(box.Hwnd, yes ? ["はい", "Yes"] : ["いいえ", "No"]), Is.True);
        Thread.Sleep(600);
    }
}
