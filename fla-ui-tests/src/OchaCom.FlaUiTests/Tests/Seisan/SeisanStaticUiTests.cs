using System.Text.RegularExpressions;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>G1 — UI tĩnh của 窓口精算.</b> Chỉ đọc màn hình: tiêu đề, bộ phím F theo từng chế độ,
/// ô nào bật/tắt, giá trị mở màn, MaxLength. Không bấm F9, không gửi ESC/End.
///
/// <para>Kỳ vọng lấy từ source WinForm (dẫn <c>file:dòng</c> trong thông điệp) và đã đối
/// chiếu với bảng control của probe G0 (2026-10-20). Đỏ ở đây = WinForm khác source đã
/// đọc, hoặc harness lệch trạng thái — xem ảnh trước khi kết luận.</para>
///
/// <para>Các testcase NỐI TIẾP trên một phiên app (UiTestBase): testcase sau đứng ở đúng
/// màn mà testcase trước để lại.</para>
///
/// <para>Chạy: <c>.\run-seisan.ps1</c> (hoặc <c>-Case Tc1e</c>).</para>
/// </summary>
[TestFixture]
[Category("seisan")]
public sealed class SeisanStaticUiTests : SeisanTestBase
{
    // ── frm204001 ────────────────────────────────────────────────────────────

    [Test, Order(1)]
    public void Tc1a_ChonBenhNhan_CheDoChuaThanhToan()
    {
        _ = Db2;
        Current = SeisanNav.OpenCounter(App, Settings);
        AssertScreen(Current, "窓口精算（患者選択）", Fk204001Unpaid,
                     "frm204001.cs:51 + _unPaidBtnInfo :70-83 (mở màn ở viewType.unPaid, :152)");
    }

    [Test, Order(2)]
    public void Tc1b_ChonBenhNhan_F1DoiCheDo()
    {
        var w = Go(Vk.F1, SeisanNav.Counter);
        AssertScreen(w, "窓口精算（患者選択）", Fk204001PatInfo, "frm204001.cs:211-222 → _patInfoBtnInfo :56-69");

        w = Go(Vk.F1, SeisanNav.Counter);
        AssertScreen(w, "窓口精算（患者選択）", Fk204001Unpaid, "F1 lần hai về _unPaidBtnInfo");
    }

    [Test, Order(3)]
    public void Tc1c_LaiKanIchiran()
    {
        var w = Go(Vk.F3, SeisanNav.VisitList);
        AssertScreen(w, "来患一覧", Fk204008, "frm204001.cs:243 → frm204008.cs:43-58");
        Go(Vk.F10, SeisanNav.Counter);
    }

    [Test, Order(4)]
    public void Tc1d_NyuryokuIchiran()
    {
        var w = Go(Vk.F2, SeisanNav.ReceiptList);
        AssertScreen(w, "入力一覧", Fk204004List, "frm204001.cs:227 (gType.List) → frm204004.cs:82 + _btnInfo3 :112-123");
        Go(Vk.F10, SeisanNav.Counter);
    }

    // ── frm204002 ────────────────────────────────────────────────────────────

    [Test, Order(5)]
    public void Tc1e_Seisan_GiaTriMoMan()
    {
        SeisanNav.EnterPatient(Current!, TestPatNo);
        var dialogs = SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(4));
        Assert.That(dialogs, Is.Empty,
            "FST_VISIT_FLG = 0 ⇒ không hỏi Q00017 (frm204002.cs:298-304). Hộp thoại: " + string.Join(" / ", dialogs));
        var w = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(20));
        AssertScreen(w, "窓口精算", Fk204002Seikyu, "frm204002.cs:132-147");

        // getUnpaid (frm204002.cs:458-485): 保険 = Σ km_cd 40-49/57/58, 自費 = Σ 50-56,
        // 請求 = 金額 - 値引 (+ 税 với 自費). dspTotal cộng ba cột.
        AssertValues(w, "getUnpaid frm204002.cs:458-485 + dspTotal :529",
            ("txtScoreTotal", "300"), ("txtSc1", "50"), ("txtSc9", "250"), ("txtSc2", "0"),
            ("txtAmountTotalH", "900"), ("txtDiscountH", "0"), ("txtClaimH", "900"),
            ("txtAmountTotalJ", "5000"), ("txtDiscountJ", "0"), ("txtTaxJ", "500"), ("txtClaimJ", "5500"),
            ("txtAmountTotalB", "0"), ("txtClaimB", "0"),
            ("txtClaimTotal", "6400"), ("txtShortageTotal", "6400"), ("txtRece", "0"),
            ("txtDeposit", "0"), ("txtAccRate", "0"));

        // initProc :246-248 — vùng 返金 tắt, vùng 点数/入金 bật; txtTaxB luôn tắt (receArea :1995).
        AssertEnabled(w, "repayArea(false) :246", false,
            "txtRepayH", "txtRepayJ", "txtRepayJTax", "txtRepayB", "txtRepayBTax", "txtRepayA", "txtTaxB");
        AssertEnabled(w, "scoreArea(true)/receArea(true) :247-248", true,
            "txtSc1", "txtSc14", "txtScore", "txtAmountH", "txtAmountJ", "txtAmountB",
            "txtDiscountH", "txtDiscountJ", "txtDiscountB", "txtTaxJ", "cboReceKbn");

        // 領収書印刷: frm204002.cs:229-238 theo ACCCONFIG.RECE_TYPE.
        var receType = int.Parse(Db2.Scalar("SELECT RECE_TYPE FROM ACCCONFIG") ?? "3");
        var on2Visible = Uia.ById(w, "rdoPrintOn2") is { } on2 && Uia.IsOnScreen(on2);
        var expectChecked = receType < 10 ? "rdoPrintOff"
                          : receType is > 10 and < 20 ? "rdoPrintOn"
                          : receType is > 20 and < 30 ? "rdoPrintOn2"
                          : "rdoPrintOn";
        Assert.That(CheckedRadio(w), Is.EqualTo(expectChecked),
            $"RECE_TYPE={receType} ⇒ {expectChecked} (frm204002.cs:232-235; rdoPrintOn2 hiện={on2Visible}, " +
            "ẩn khi !chkExcellent :229)");

        var receTypeName = Db2.Scalar(
            $"SELECT ANY_VAL1 FROM CODMST WHERE CD_TYPE = 24 AND CD_VAL = {receType % 10} AND DEL_FLG = 0");
        Assert.That(Value(w, "cboReceType"), Is.EqualTo(receTypeName),
            $"cboReceType.SelectedValue = RECE_TYPE % 10 = {receType % 10} (frm204002.cs:238, CODMST 24)");

        // Chạy Y NGUYÊN câu của CodMst.getComboData rồi lấy dòng đầu. Đo 2026-10-20: cả 5 dòng
        // CODMST 17 có SORT_ORDER = 0 ⇒ thứ tự do plan SQL Server quyết; 「TOP 1」 ra 口座１ còn
        // câu gốc ra 現金. ⚠ Rủi ro parity: Postgres bên web không bảo đảm cùng thứ tự hoà.
        var firstRow = Db2.Rows(
            "SELECT CD_VAL,ANY_VAL1,ANY_VAL2 FROM CODMST WHERE CD_TYPE=17 AND DEL_FLG = 0 ORDER BY SORT_ORDER")
            .FirstOrDefault() ?? "";
        var firstReceKbn = Regex.Match(firstRow, @"ANY_VAL1=(\S*)").Groups[1].Value;
        Assert.That(Value(w, "cboReceKbn"), Is.EqualTo(firstReceKbn),
            $"cboReceKbn = dòng đầu của CodMst.getComboData(17) (frm204002.cs:224) — dòng đó: 「{firstRow}」");
    }

    /// <summary>MaxLength chỉ chặn GÕ PHÍM ⇒ gõ dư một ký tự rồi đọc lại.</summary>
    [TestCase("txtAccRate", 3, "frm204002.designer.cs:1695")]
    [TestCase("txtAmountH", 7, "frm204002.designer.cs:594")]
    [TestCase("txtAmountJ", 7, "frm204002.designer.cs:1506")]
    [TestCase("txtDiscountH", 7, "frm204002.designer.cs:1705")]
    [TestCase("txtSc1", 7, "frm204002.designer.cs:1328")]
    [TestCase("txtComment1", 20, "frm204002.designer.cs:967")]
    [Order(6)]
    public void Tc1f_Seisan_MaxLength(string id, int maxLength, string source)
    {
        var w = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(5));
        var box = Uia.RequireById(w, id);
        var before = RawValue(box);

        Uia.ForceForeground(w.Properties.NativeWindowHandle);
        SeisanNav.ClearByKeys(box);
        Keyboard.Type(new string('1', maxLength + 1));
        // SendInput đi qua hàng đợi của app — đọc ngay thì còn giá trị cũ (đo 2026-10-20).
        Waits.TryUntil(() => RawValue(box).Length >= maxLength, TimeSpan.FromSeconds(3));
        var typed = RawValue(box);

        // Trả lại giá trị cũ (không Enter ⇒ không tính lại gì).
        SeisanNav.ClearByKeys(box);
        if (before.Length > 0) Keyboard.Type(before);

        Assert.That(typed.Length, Is.EqualTo(maxLength),
            $"{id}.MaxLength = {maxLength} ({source}); gõ {maxLength + 1} ký tự đọc lại 「{typed}」");
    }

    [Test, Order(7)]
    public void Tc1g_Seisan_F7NhanTien()
    {
        var w = Go(Vk.F7, SeisanNav.Seisan);
        AssertScreen(w, "窓口精算", Fk204002Nyukin, "changeF7 請求→入金 frm204002.cs:2071-2079");
        // 預り金 = 0 ⇒ 本日入金 = 請求合計 (:2096-2101), 不足 = 0 (:2103).
        AssertValues(w, "changeF7(true) frm204002.cs:2085-2104",
            ("txtRece", "6400"), ("txtReceChange", "0"), ("txtShortageTotal", "0"));

        w = Go(Vk.F7, SeisanNav.Seisan);
        AssertScreen(w, "窓口精算", Fk204002Seikyu, "changeF7 入金→請求 frm204002.cs:2111-2118");
        AssertValues(w, "changeF7 入金→請求 frm204002.cs:2119-2127",
            ("txtRece", "0"), ("txtReceChange", "0"), ("txtShortageTotal", "6400"));
    }

    [Test, Order(8)]
    public void Tc1h_Seisan_F6HoanTien()
    {
        var w = Go(Vk.F6, SeisanNav.Seisan);
        AssertScreen(w, "窓口精算", Fk204002Henkin, "btnF6_Click frm204002.cs:1009-1028 (btnChgEnable F2-F5 false)");
        AssertEnabled(w, "repayArea(true) :1019", true,
            "txtRepayH", "txtRepayJ", "txtRepayJTax", "txtRepayB", "txtRepayBTax", "txtRepayA");
        AssertEnabled(w, "scoreArea(false)/receArea(false) :1021-1022", false,
            "txtSc1", "txtSc14", "txtScore", "txtAmountH", "txtAmountJ", "txtAmountB",
            "txtDiscountH", "txtDiscountJ", "txtDiscountB", "txtTaxJ", "txtTaxB", "cboReceKbn");

        // F7 bật lại vùng 点数/入金 + F2-F5, tắt 返金 (:1032-1054) — và đảo sang 入金.
        w = Go(Vk.F7, SeisanNav.Seisan);
        AssertScreen(w, "窓口精算", Fk204002Nyukin, "btnF7_Click frm204002.cs:1040-1053 + changeF7(true)");
        AssertEnabled(w, "repayArea(false) :1045", false, "txtRepayH", "txtRepayA");
        AssertEnabled(w, "scoreArea(true)/receArea(true) :1042-1043", true, "txtSc1", "txtAmountJ", "cboReceKbn");

        w = Go(Vk.F7, SeisanNav.Seisan);
        AssertScreen(w, "窓口精算", Fk204002Seikyu, "F7 lần hai về 請求");
    }

    // ── Màn con ──────────────────────────────────────────────────────────────

    [Test, Order(9)]
    public void Tc1i_Buppin_VaLichSu()
    {
        // F2 mở frm204003 mất ~12s (đo G0) — lưới hàng hoá.
        var g = Go(Vk.F2, SeisanNav.Goods, TimeSpan.FromSeconds(25));
        AssertScreen(g, "物品登録", Fk204003, "frm204002.cs:861-885 → frm204003.cs:59-75");

        var h = Go(Vk.F1, SeisanNav.GoodsHistory, TimeSpan.FromSeconds(20));
        AssertScreen(h, "物品販売履歴", Fk204009, "frm204003.cs:292-295 → frm204009.cs:39-55");

        Go(Vk.F10, SeisanNav.Goods);
        Go(Vk.F10, SeisanNav.Seisan);
    }

    [Test, Order(10)]
    public void Tc1j_NyukinMeisai()
    {
        var w = Go(Vk.F7, SeisanNav.Seisan);
        // 本日入金 < 請求 thì F3 mới mở frm204006 (frm204002.cs:937-948), nếu không là I00004.
        SeisanNav.TypeAndEnter(w, "txtRece", "1000");
        AssertValues(w, "txtRece_KeyDown Enter frm204002.cs:1511-1534",
            ("txtRece", "1000"), ("txtShortageTotal", "5400"), ("txtReceChange", "0"));

        var d = Go(Vk.F3, SeisanNav.ReceDetail);
        AssertScreen(d, "入金明細", Fk204006, "frm204006.cs:24-37");

        Go(Vk.F10, SeisanNav.Seisan);
        w = Go(Vk.F7, SeisanNav.Seisan);
        AssertScreen(w, "窓口精算", Fk204002Seikyu, "F7 về 請求");
    }

    [Test, Order(11)]
    public void Tc1k_RyoshushoInsatsu()
    {
        var w = Go(Vk.F1, SeisanNav.ReceiptList);
        AssertScreen(w, "領収書印刷", Fk204004Print, "frm204002.cs:843-856 (gType.Print) → frm204004.cs:80 + _btnInfo1 :84-97");
        Go(Vk.F10, SeisanNav.Seisan);
    }

    [Test, Order(12)]
    public void Tc1l_SeisanDataTeisei()
    {
        var w = Go(Vk.F8, SeisanNav.ReceiptList);
        AssertScreen(w, "精算データ訂正", Fk204004Update, "frm204002.cs:1057-1073 (gType.Update) → frm204004.cs:81 + _btnInfo2 :98-110");
        Go(Vk.F10, SeisanNav.Seisan);
    }

    [Test, Order(13)]
    public void Tc1m_Seisan_F10HoiRoiManKhongLuu()
    {
        var w = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(5));
        SeisanNav.Press(w, Vk.F10);

        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8));
        Assert.That(box, Is.Not.Null, "F10 có thay đổi ⇒ Q00004 「登録せずに」 (frm204002.cs:1340-1360) — không thấy hộp thoại");
        var buttons = MsgBoxWin32.ButtonCaptions(box!.Hwnd);
        var text = SeisanNav.OneLine(box.Text);
        var clicked = MsgBoxWin32.ClickButton(box.Hwnd, "OK");

        Assert.Multiple(() =>
        {
            Assert.That(text, Is.EqualTo("登録せずに終了してよろしいですか？"), "Q00004(\"登録せずに\") frm204002.cs:1349");
            Assert.That(buttons.Select(b => b.Replace("&", "")), Is.EqualTo(new[] { "OK", "Cancel" }),
                        "ShowOKCancelMsg ⇒ [OK|Cancel]");
            Assert.That(clicked, Is.True, "bấm OK");
        });

        var c = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(10));
        AssertScreen(c, "窓口精算（患者選択）", Fk204001Unpaid, "OK ⇒ về màn trước theo history (frm204002.cs:1351-1357)");
    }

    private static string CheckedRadio(Window w)
    {
        foreach (var id in new[] { "rdoPrintOff", "rdoPrintOn", "rdoPrintOn2" })
            if (Uia.ById(w, id) is { } r && Uia.IsOnScreen(r) && r.AsRadioButton().IsChecked)
                return id;
        return "(không radio nào được chọn)";
    }
}
