using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>G2 — điều hướng + danh sách của 窓口精算.</b> Lưới 未精算患者一覧, F8 削除 (E00021 /
/// Q00003), 患者番号 không tồn tại (E00005), 患者検索 (kết quả / E00003), F11 / F12 trên
/// 204002 (Q00004), lớp phím Shift và bốn màn Shift+F5–F8 mở ra.
///
/// <para>Kỳ vọng từ source WinForm + probe <c>SeisanNavProbeTests</c> (2026-10-20).</para>
///
/// <para><b>Ghi DB:</b> ca cuối (Tc2j) bấm F8 削除 → OK thật, xoá UNPAID của CHÍNH bệnh nhân
/// test (990000+, chỉ dòng đó được tick). Các ca khác chỉ đọc.</para>
/// </summary>
[TestFixture]
[Category("seisan")]
public sealed class SeisanNavigationTests : SeisanTestBase
{
    /// <summary>カナ riêng của bệnh nhân test — 患者検索 so khớp 「pat_kn like @PATKN + '%'」 (PatInfoList.cs).</summary>
    private const string UniqueKana = "ｾｲｻﾝｹﾝｻｸ";

    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
        if (SeededPatient is not null) Db2.SetPatientKana(SeededPatient.PatNo, UniqueKana);
    }

    // ── 未精算患者一覧 ────────────────────────────────────────────────────────

    [Test, Order(1)]
    public void Tc2a_LuoiChuaThanhToan()
    {
        Current = SeisanNav.OpenCounter(App, Settings);
        var grid = new WinFormsGrid(Uia.RequireById(Current, "dgvView"));
        var rows = grid.Rows(50);

        // Dòng đầu UIA trả là dòng tiêu đề (F11).
        Assert.That(rows.FirstOrDefault()?.Cells.Select(Txt.N).Where(c => c.Length > 0),
            Is.EqualTo(new[] { "患者番号", "氏名", "性別", "生年月日", "点数", "請求金額", "未収金" }),
            "_unPaidViewItem frm204001.cs:107-117 (cột flg không tiêu đề, cột pat_br rộng 0)");

        var mine = rows.Skip(1).FirstOrDefault(r => r.Cells.Any(c => c.Trim() == TestPatNo.ToString()))
                   ?? throw new AssertionException($"không có dòng của bệnh nhân {TestPatNo} trong 未精算患者一覧");

        // Oracle: y nguyên các cột của PatInfoList.getUnPaidPatInfo cho riêng bệnh nhân test,
        // định dạng như dgvView_CellFormatting (frm204001.cs:166-178: N0 cho 点数/請求金額/未収金).
        var want = Db2.Rows(
            $"""
             SELECT i.PAT_NM,
                    c.ANY_VAL1 AS SEX,
                    LEFT(e.ERA_NAME, 1) + RIGHT('00' + CONVERT(varchar, YEAR(p.PAT_BIRTH_DT) - YEAR(e.ERA_START) + 1), 2) + '年'
                      + RIGHT('00' + CONVERT(varchar, MONTH(p.PAT_BIRTH_DT)), 2) + '月'
                      + RIGHT('00' + CONVERT(varchar, DAY(p.PAT_BIRTH_DT)), 2) + '日' AS BIRTH,
                    (SELECT SUM(SCORE) FROM UNPAID WHERE PAT_NO = p.PAT_NO) AS SCORE,
                    (SELECT SUM(CLAIM_AMT + TAX) FROM UNPAID WHERE PAT_NO = p.PAT_NO) AS CLAIM,
                    x.INS_DUE_BAL + x.OWN_DUE_BAL + x.OWN_DUE_EXC + x.GDS_DUE_BAL + x.GDS_DUE_EXC AS UNPAID
               FROM PERSON p
               JOIN INSURANCE i ON i.PAT_NO = p.PAT_NO
                AND i.PAT_BR = (SELECT MAX(PAT_BR) FROM INSURANCE WHERE PAT_NO = p.PAT_NO AND ISNULL(BR_DT, '1900/01/01') <= GETDATE())
               JOIN CODMST c ON c.CD_TYPE = 12 AND c.CD_VAL = p.PAT_SEX
               JOIN PERSON_EXP x ON x.PAT_NO = p.PAT_NO
               JOIN ERA_TBL e ON ISNULL(p.PAT_BIRTH_DT, '1900/01/01') BETWEEN e.ERA_START AND e.ERA_END
              WHERE p.PAT_NO = {TestPatNo}
             """).Single();
        string Col(string name) => System.Text.RegularExpressions.Regex.Match(want, $@"\b{name}=(.*?)(?= [A-Z_]+=|$)").Groups[1].Value;
        string N0(string v) => int.Parse(v).ToString("#,0");

        Assert.Multiple(() =>
        {
            Assert.That(Txt.N(mine.ByHeader("氏名") ?? ""), Is.EqualTo(Txt.N(Col("PAT_NM"))), "氏名 — insurance.pat_nm (枝番 lớn nhất đã hiệu lực)");
            Assert.That(Txt.N(mine.ByHeader("性別") ?? ""), Is.EqualTo(Col("SEX")), "性別 — CODMST 12");
            Assert.That(Txt.N(mine.ByHeader("生年月日") ?? ""), Is.EqualTo(Col("BIRTH")), "生年月日 — 元号1字+年月日");
            Assert.That(Txt.N(mine.ByHeader("点数") ?? ""), Is.EqualTo(N0(Col("SCORE"))), "点数 = Σ UNPAID.score, N0");
            Assert.That(Txt.N(mine.ByHeader("請求金額") ?? ""), Is.EqualTo(N0(Col("CLAIM"))),
                        "請求金額 = Σ (claim_amt + tax), N0 — 900 + (5000 + 500) = 「6,400」 CÓ dấu phẩy");
            Assert.That(Txt.N(mine.ByHeader("未収金") ?? ""), Is.EqualTo(N0(Col("UNPAID"))), "未収金 = Σ *_due_* của PERSON_EXP, N0");
        });
    }

    [Test, Order(2)]
    public void Tc2b_F8ChuaTick_E00021()
    {
        var w = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(5));
        SeisanNav.Press(w, Vk.F8);
        AssertSingleDialog("削除対象が選択されていません。", ["OK"], "OK",
            "delUnPaid: không dòng nào flg ⇒ E00021(\"削除対象\") frm204001.cs:552");
        Assert.That(SeisanNav.Form(App, SeisanNav.Counter), Is.Not.Null, "vẫn ở 204001");
    }

    [Test, Order(3)]
    public void Tc2c_BenhNhanKhongTonTai_E00005()
    {
        var w = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(5));
        var missing = 989999;
        while (Db2.Scalar($"SELECT COUNT(*) FROM PERSON WHERE PAT_NO = {missing}") != "0") missing--;

        SeisanNav.EnterPatient(w, missing);
        AssertSingleDialog("患者情報が登録されていません。", ["OK"], "OK",
            $"defData(inpTxt) không có 患者 {missing} ⇒ ShowWarningMsg(E00005, 患者情報) frm204001.cs:376");

        Assert.Multiple(() =>
        {
            Assert.That(SeisanNav.Form(App, SeisanNav.Seisan), Is.Null, "KHÔNG sang 204002");
            Assert.That(Uia.ValueOf(Uia.EditInside(Uia.RequireById(w, "cboPatNo"))).Trim(), Is.EqualTo(missing.ToString()),
                        "cboPatNo giữ nguyên số vừa gõ (chỉ Focus lại, frm204001.cs:377)");
        });
        SeisanNav.ClearByKeys(Uia.EditInside(Uia.RequireById(w, "cboPatNo")));
    }

    [Test, Order(4)]
    public void Tc2d_TimBenhNhan()
    {
        var w = Go(Vk.F1, SeisanNav.Counter);
        var kn = Uia.RequireById(w, "txtPatKn");

        Uia.SetText(kn, UniqueKana);
        Uia.MouseClick(Uia.RequireById(w, "btnSearch"));
        Assert.That(SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3)), Is.Empty, "có kết quả ⇒ không hộp thoại");

        var grid = new WinFormsGrid(Uia.RequireById(w, "dgvView"));
        var rows = grid.Rows(20);
        Assert.Multiple(() =>
        {
            Assert.That(rows.FirstOrDefault()?.Cells.Select(Txt.N).Where(c => c.Length > 0),
                Is.EqualTo(new[] { "患者番号", "氏名", "性別", "生年月日", "電話番号", "携帯番号", "最終診療日" }),
                "_patInfoViewItem frm204001.cs:96-104");
            Assert.That(rows.Skip(1).Select(r => r.At(0).Trim()), Is.EqualTo(new[] { TestPatNo.ToString() }),
                $"カナ 「{UniqueKana}」 chỉ khớp bệnh nhân test (like @PATKN + '%', PatInfoList.getSearchPatInf)");
        });

        Uia.SetText(kn, "ﾝﾝﾝﾝﾝﾝ");
        Uia.MouseClick(Uia.RequireById(w, "btnSearch"));
        AssertSingleDialog("該当データがありません。", ["OK"], "OK", "getPatInf: 0 dòng ⇒ ShowInfoMsg(E00003) frm901001.cs");
        Uia.SetText(kn, "");

        Go(Vk.F1, SeisanNav.Counter);
    }

    // ── 204002: F11 / F12 / Shift ─────────────────────────────────────────────

    [Test, Order(5)]
    public void Tc2e_F11_Q00004_VeChonBenhNhan()
    {
        var s = OpenSeisan();
        SeisanNav.Press(s, Vk.F11);
        AssertSingleDialog("登録せずに終了してよろしいですか？", ["OK", "Cancel"], "OK",
            "btnF11_Click: Q00004(\"登録せずに\") frm204002.cs:1374");

        var c = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(10));
        AssertScreen(c, "窓口精算（患者選択）", Fk204001Unpaid,
            "OK ⇒ showForm(ID204001) frm204002.cs:1378 — mở lại ở viewType.unPaid");
    }

    [Test, Order(6)]
    public void Tc2f_F12_Q00004_CancelOLai()
    {
        var s = OpenSeisan();
        SeisanNav.Press(s, Vk.F12);
        AssertSingleDialog("登録せずに終了してよろしいですか？", ["OK", "Cancel"], "Cancel",
            "btnF12_Click không Shift: Q00004(\"登録せずに\") frm204002.cs:1401");
        Assert.That(Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(5)), Is.Not.Null, "Cancel ⇒ ở lại 204002");
    }

    [Test, Order(7)]
    public void Tc2g_LopPhimShift()
    {
        var s = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(5));
        Uia.ForceForeground(s.Properties.NativeWindowHandle);
        string shiftKeys;
        using (Keyboard.Pressing(VirtualKeyShort.SHIFT))
        {
            Thread.Sleep(700);
            shiftKeys = string.Join("|", Uia.Descendants(s, 6)
                .Where(e => Uia.AutomationIdOf(e) is var id && id.StartsWith("btnF") && id.EndsWith("_S") && Uia.IsOnScreen(e))
                .Select(e => (N: int.Parse(Uia.AutomationIdOf(e)[4..^2]), L: Txt.N(Uia.NameOf(e))))
                .OrderBy(x => x.N)
                .Select(x => System.Text.RegularExpressions.Regex.Replace(x.L, @"^F\d+\s*", $"F{x.N} ")));
        }
        Assert.That(shiftKeys, Is.EqualTo("F5 患者登録|F6 カルテ|F7 処置|F8 口腔|F12 終了"),
            "_btnInfo2 frm204002.cs:148-161 — giữ Shift ⇒ editButtonPanel(true) hiện pnlShiftButton (BaseForm.cs:498-509)");
    }

    [TestCase(VirtualKeyShort.F5, "frm201001", "患者登録", "callProj(ID201001) frm204002.cs:990")]
    [TestCase(VirtualKeyShort.F6, "frm205002", "カルテ(１号用紙)印刷", "callProj(ID205002) frm204002.cs:1014")]
    [TestCase(VirtualKeyShort.F7, "frm203002", "診療入力", "callProj(ID203002), TrtDt = Today frm204002.cs:1037/1121")]
    [TestCase(VirtualKeyShort.F8, "frm202002", "口腔内情報", "callProj(ID202002) frm204002.cs:1062")]
    [Order(8)]
    public void Tc2h_ShiftMoManKhac_F10QuayVe(VirtualKeyShort key, string formId, string title, string source)
    {
        var s = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(5));
        Uia.ForceForeground(s.Properties.NativeWindowHandle);
        using (Keyboard.Pressing(VirtualKeyShort.SHIFT)) Keyboard.Press(key);

        var other = Waits.TryFor(() => App.Window(formId), TimeSpan.FromSeconds(30))
                    ?? throw new AssertionException($"Shift+{key} không mở {formId} — {source}. Đang hiện: [{SeisanNav.DescribeForms(App)}]");
        Current = other;
        Assert.That(Uia.NameOf(other), Does.Contain(title), $"tiêu đề màn Shift+{key} — {source}");

        // F10 của màn đích về lại 204002 theo CommonHistory (callProj ghi GAMEN_HIDE, frm204002.cs:1122).
        // Hộp thoại lúc rời là việc RIÊNG của màn đích (口腔 hỏi Q00004; 患者登録 hỏi
        // 「保存しますか」 khi thấy dữ liệu khác — đo 2026-10-20 sau khi đổi カナ ở INSURANCE),
        // không thuộc hợp đồng SEISAN: trả lời an toàn (いいえ / Cancel / 「登録せずに」 OK) và chỉ ghi lại.
        Uia.ForceForeground(other.Properties.NativeWindowHandle);
        Uia.SendKey(Vk.F10);
        foreach (var d in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(5)))
            TestContext.Out.WriteLine($"{formId} F10: {d}");

        var back = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(20));

        // Quirk WinForm (đo 2026-10-20): KeyUp của Shift rơi vào màn đích, nên khi quay về
        // 204002 vẫn giữ _shiftFlg = true — dải phím kẹt ở lớp Shift (nút 「ON」), F10 thường
        // không chạy (BaseForm.cs:498-519, 646). Ghi lại rồi click nút 「ON」 để gỡ —
        // nhấn-nhả Shift bằng phím ngay lúc này bị mất (đo 2026-10-20, README bẫy #8).
        var shiftButton = Uia.RequireById(back, "btnShift");
        TestContext.Out.WriteLine($"quay về 204002 sau Shift+{key}: btnShift = 「{Uia.NameOf(shiftButton)}」");
        if (Uia.NameOf(shiftButton) == "ON") Uia.MouseClick(shiftButton);
        Waits.TryUntil(() => FKeys(back) == Fk204002Seikyu, TimeSpan.FromSeconds(3));
        Assert.That(FKeys(back), Is.EqualTo(Fk204002Seikyu), "btnShift_Click khi 「ON」 ⇒ editButtonPanel(false), dải phím thường trở lại");
    }

    // ── F8 削除 thật (GHI DB: UNPAID của bệnh nhân test) ──────────────────────

    [Test, Order(9)]
    public void Tc2j_F8XoaChuaThanhToan()
    {
        var s = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(5));
        SeisanNav.Press(s, Vk.F10);
        SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(5));   // Q00004 「登録せずに」 ⇒ OK
        var w = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(10));

        var grid = new WinFormsGrid(Uia.RequireById(w, "dgvView"));
        var row = grid.RowElements(50).FirstOrDefault(r => grid.Row(r).Cells.Any(c => c.Trim() == TestPatNo.ToString()))
                  ?? throw new AssertionException($"không có dòng {TestPatNo} để tick");
        var flg = Uia.Children(row).First();
        Uia.MouseClick(flg);
        Waits.TryUntil(() => Uia.ValueOf(flg) == "True", TimeSpan.FromSeconds(3));
        Assert.That(Uia.ValueOf(flg), Is.EqualTo("True"), "tick ô flg của dòng bệnh nhân test");

        SeisanNav.Press(w, Vk.F8);
        AssertSingleDialog("削除してよろしいですか？", ["OK", "Cancel"], "OK", "delUnPaid: Q00003 frm204001.cs:547");

        Assert.Multiple(() =>
        {
            Assert.That(Db2.Scalar($"SELECT COUNT(*) FROM UNPAID WHERE PAT_NO = {TestPatNo}"), Is.EqualTo("0"),
                        "OK ⇒ UnPaid.deleteUnPaid(pat_no) cho dòng đã tick (frm204001.cs:563-567)");
            Assert.That(Waits.TryUntil(() => new WinFormsGrid(Uia.RequireById(w, "dgvView")).Rows(50)
                            .All(r => r.Cells.All(c => c.Trim() != TestPatNo.ToString())), TimeSpan.FromSeconds(5)),
                        Is.True, "getUnPaidViewData chạy lại ⇒ dòng biến mất khỏi lưới (frm204001.cs:580)");
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    private Window OpenSeisan()
    {
        var c = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(10));
        SeisanNav.EnterPatient(c, TestPatNo);
        Assert.That(SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3)), Is.Empty, "mở 204002 không có hộp thoại");
        return Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(20));
    }

    /// <summary>Đúng MỘT MessageBox với nội dung + nút cho trước; bấm <paramref name="click"/>.</summary>
    private void AssertSingleDialog(string text, string[] buttons, string click, string source)
    {
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(8))
                  ?? throw new AssertionException($"không thấy hộp thoại 「{text}」 — {source}");
        var got = SeisanNav.OneLine(box.Text);
        var gotButtons = MsgBoxWin32.ButtonCaptions(box.Hwnd).Select(b => b.Replace("&", "")).ToArray();
        var clicked = MsgBoxWin32.ClickButton(box.Hwnd, click);
        Thread.Sleep(400);
        Assert.Multiple(() =>
        {
            Assert.That(got, Is.EqualTo(text), source);
            Assert.That(gotButtons, Is.EqualTo(buttons), $"nút — {source}");
            Assert.That(clicked, Is.True, $"bấm {click}");
            Assert.That(MsgBoxWin32.First(App.ProcessId), Is.Null, "không còn hộp thoại nào sau khi bấm");
        });
    }
}
