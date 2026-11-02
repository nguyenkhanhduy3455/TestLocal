using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// <b>PROBE G3 — phép tính trên frm204002 (không F9). KHÔNG assert, không ném.</b>
///
/// <para>Mỗi ca: đặt UNPAID / PERSON_EXP / 負担率 của bệnh nhân test → mở 204002 → thao tác →
/// in snapshot các ô → F10 「登録せずに」 OK. frm204002 đọc lại các bảng đó mỗi lần mở
/// (initProc → getUnpaid / getPatInfo) nên không cần khởi động lại app.</para>
///
/// <para>Ghi DB: chỉ bệnh nhân test 990000+. KHÔNG đụng ACCCONFIG (ma trận thuế để sau).</para>
/// <para>Chạy: <c>.\run-seisan.ps1 -Case SeisanCalcProbe</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh")]
[Category("seisan")]
public sealed class SeisanCalcProbeTests : SeisanTestBase
{
    private static readonly string[] SnapshotIds =
    [
        "txtAccRate", "txtScoreTotal", "txtSc1", "txtSc9", "txtCareScore", "txtCareAmount",
        "txtAmountTotalH", "txtDiscountH", "txtClaimH", "txtAccrH", "txtRepayH",
        "txtAmountTotalJ", "txtDiscountJ", "txtTaxJ", "txtClaimJ", "txtAccrJ", "txtRepayJ", "txtRepayJTax",
        "txtAmountTotalB", "txtDiscountB", "txtTaxB", "txtClaimB", "txtAccrB", "txtRepayB", "txtRepayBTax", "txtRepayA",
        "txtClaimTotal", "txtShortageTotal", "txtDeposit", "txtAppr", "txtApprChange", "txtRece", "txtReceChange",
    ];

    private int _origAccRate;

    private SeisanDb.UnpaidSeed[] Base() =>
    [
        new(TrtDate, KmCd: 40, Score: 300, ClaimAmt: 900, ScoreD1: 50, ScoreD9: 250),
        new(TrtDate, KmCd: 50, Score: 0, ClaimAmt: 5000, Tax: 500),
    ];

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string c, string line) => Log($"=== KQ-{c} === {line}");

    [Test, Order(1)]
    public void Tc0_Calc()
    {
        _origAccRate = int.Parse(Db2.Scalar($"SELECT TOP 1 ACC_RATE FROM INSURANCE WHERE PAT_NO = {TestPatNo}") ?? "0");
        Kq("0", $"負担率 gốc của bệnh nhân test: {_origAccRate}; thuế 自費: J_TAX_KBN/J_CALC_KBN = " +
                Db2.Scalar("SELECT CONCAT(J_TAX_KBN, '/', J_CALC_KBN, ' B ', B_TAX_KBN, '/', B_CALC_KBN, ' RCV ', RECE_RCV_FLG) FROM ACCCONFIG"));
        Current = SeisanNav.OpenCounter(App, Settings);

        Case("C0", "mặc định", () => { }, _ => { });

        Case("A1", "PERSON_EXP 未収 ins 100 / own 200+20 / gds 300+30",
             () => Db2.SetPersonExp(TestPatNo, 100, 200, 20, 300, 30), _ => { });

        Case("B1", "預り金 5000 nhỏ hơn 請求 ⇒ F7; rồi txtAppr 9000 Enter (vượt 預り金)",
             () => Db2.SetPersonExp(TestPatNo, depDue: 5000), w =>
             {
                 Key(w, Vk.F7); Snap("B1", "sau F7", w);
                 SeisanNav.TypeAndEnter(w, "txtAppr", "9000");
             });

        Case("B2", "預り金 10000 lớn hơn 請求 ⇒ F7", () => Db2.SetPersonExp(TestPatNo, depDue: 10000), w => Key(w, Vk.F7));

        Case("A2", "入金指定: UNPAID 保険 rece_amt 3000 + rece_tax 0",
             () => Db2.ReplaceUnpaid(TestPatNo,
             [
                 new(TrtDate, KmCd: 40, Score: 300, ClaimAmt: 900, ScoreD1: 50, ScoreD9: 250, ReceAmt: 3000),
                 new(TrtDate, KmCd: 50, Score: 0, ClaimAmt: 5000, Tax: 500),
             ]), _ => { });

        Case("A3", "介護 dòng lflg = 1 (km 40, 100点, 300円, trt_cnt 101 — modAcc.cs:673) thêm vào",
             () => Db2.ReplaceUnpaid(TestPatNo, [.. Base(), new(TrtDate, KmCd: 40, Score: 100, ClaimAmt: 300, Lflg: 1, TrtCnt: 101)]), _ => { });

        Case("A5", "負担率 30 — mở màn có tính lại 保険 không?", () => Db2.SetAccRate(TestPatNo, 30), _ => { });

        Case("C1", "負担率 30; txtSc9 283 Enter ⇒ 点数 333 ⇒ 999円 ⇒ làm tròn 10円",
             () => Db2.SetAccRate(TestPatNo, 30), w => SeisanNav.TypeAndEnter(w, "txtSc9", "283"));

        Case("C2", "負担率 30; txtScore 100 Enter rồi phím − (huỷ lần cuối)",
             () => Db2.SetAccRate(TestPatNo, 30), w =>
             {
                 SeisanNav.TypeAndEnter(w, "txtScore", "100"); Snap("C2", "sau 100 Enter", w);
                 Uia.RequireById(w, "txtScore").Focus(); Keyboard.Press(VirtualKeyShort.SUBTRACT); Thread.Sleep(500);
             });

        Case("C3", "負担率 0 rồi txtAccRate 20 Enter (300点 ⇒ 600円)", () => { }, w => SeisanNav.TypeAndEnter(w, "txtAccRate", "20"));

        Case("D1", "txtAmountH 500 Enter rồi −",
             () => { }, w =>
             {
                 SeisanNav.TypeAndEnter(w, "txtAmountH", "500"); Snap("D1", "sau 500 Enter", w);
                 Uia.RequireById(w, "txtAmountH").Focus(); Keyboard.Press(VirtualKeyShort.SUBTRACT); Thread.Sleep(500);
             });

    }

    [Test, Order(2)]
    public void Tc0b_Calc()
    {
        Current = App.Window(SeisanNav.Counter) ?? SeisanNav.OpenCounter(App, Settings);

        Case("D2", "txtAmountJ 1234 Enter (外税 10%, 四捨五入)", () => { }, w => SeisanNav.TypeAndEnter(w, "txtAmountJ", "1234"));

        Case("E1", "txtDiscountJ 99999 Enter (> 金額) rồi 234 Enter",
             () => { }, w =>
             {
                 SeisanNav.TypeAndEnter(w, "txtDiscountJ", "99999"); Snap("E1", "sau 99999", w);
                 SeisanNav.TypeAndEnter(w, "txtDiscountJ", "234");
             });

        Case("E2", "txtDiscountH 100 Enter", () => { }, w => SeisanNav.TypeAndEnter(w, "txtDiscountH", "100"));

        Case("F1", "txtAmountB 1000 Enter → 軽減税率? いいえ; rồi 1000 Enter → はい",
             () => { }, w =>
             {
                 TypeEnterAnswer(w, "txtAmountB", "1000", "いいえ", "No"); Snap("F1", "sau いいえ", w);
                 TypeEnterAnswer(w, "txtAmountB", "1000", "はい", "Yes");
             });

        Case("G1", "F6 返金; txtRepayJ 1100 Enter; txtRepayH 500 Enter",
             () => { }, w =>
             {
                 Key(w, Vk.F6);
                 SeisanNav.TypeAndEnter(w, "txtRepayJ", "1100"); Snap("G1", "sau RepayJ", w);
                 SeisanNav.TypeAndEnter(w, "txtRepayH", "500");
             });

        Case("I1", "F7 入金 rồi txtAmountJ 100 Enter ⇒ calcClaim đảo về 請求?",
             () => { }, w =>
             {
                 Key(w, Vk.F7); Snap("I1", "sau F7", w);
                 SeisanNav.TypeAndEnter(w, "txtAmountJ", "100");
             });
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Một ca: trả DB về mặc định, áp <paramref name="setup"/>, mở 204002, chạy, snapshot, rời màn.</summary>
    private void Case(string id, string what, Action setup, Action<Window> act)
    {
        using var trace = TestTrace.Begin("SeisanCalc_" + id);
        try
        {
            Db2.ReplaceUnpaid(TestPatNo, Base());
            Db2.SetPersonExp(TestPatNo);
            Db2.SetAccRate(TestPatNo, 0);
            setup();

            var c = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(15));
            SeisanNav.EnterPatient(c, TestPatNo);
            foreach (var d in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3))) Kq(id, "hộp thoại lúc mở: " + d);
            var w = Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(20));
            Snap(id, $"{what} — LÚC MỞ", w);

            trace.Step(what);
            act(w);
            foreach (var d in SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(2))) Kq(id, "hộp thoại: " + d);
            Snap(id, $"{what} — SAU", w);
            trace.Shot(id);
        }
        catch (Exception e) { trace.Fail(id, e); Kq(id, "NGOẠI LỆ: " + e.Message); }
        finally { Leave(id); }
    }

    private void Leave(string id)
    {
        try
        {
            if (App.Window(SeisanNav.Seisan) is not { } s) return;
            if (Uia.ById(s, "btnShift") is { } sh && Uia.NameOf(sh) == "ON") Uia.MouseClick(sh);
            SeisanNav.Press(s, Vk.F10);
            SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(4));
            if (Waits.TryFor(() => App.Window(SeisanNav.Counter), TimeSpan.FromSeconds(5)) is null
                && App.Window(SeisanNav.Seisan) is { } still && Uia.ById(still, "btnF10") is { } b)
            {
                Uia.MouseClick(b);
                SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(4));
            }
        }
        catch (Exception e) { Kq(id, "rời màn hỏng: " + e.Message); }
    }

    private void Snap(string id, string label, Window w)
    {
        // MỘT lượt duyệt cây — Uia.ById từng ô (33 lần) làm mỗi ca mất ~100s, vượt trần 15 phút.
        var byId = new Dictionary<string, AutomationElement>();
        foreach (var e in Uia.Descendants(w, 6))
        {
            string eid;
            try { eid = Uia.AutomationIdOf(e); } catch { continue; }
            if (eid.Length > 0 && !byId.ContainsKey(eid)) byId[eid] = e;
        }
        var cells = SnapshotIds.Select(x =>
        {
            var el = byId.GetValueOrDefault(x);
            if (el is null) return $"{x}=∅";
            var v = RawValue(el).Trim();
            var vis = Uia.IsOnScreen(el) ? "" : "(ẩn)";
            var en = el.Properties.IsEnabled.ValueOrDefault ? "" : "(tắt)";
            return $"{x[3..]}={v}{vis}{en}";
        });
        var lbl = byId.GetValueOrDefault("lblRece2") is { } l && Uia.IsOnScreen(l) ? Uia.NameOf(l) : "(ẩn)";
        var f7 = byId.GetValueOrDefault("btnF7") is { } b ? Txt.N(Uia.NameOf(b)) : "?";
        Kq(id, $"[{label}] {string.Join(" ", cells)} lblRece2={lbl} F7={f7}");
    }

    private void TypeEnterAnswer(Window w, string id, string text, params string[] answer)
    {
        SeisanNav.TypeAndEnter(w, id, text);
        var box = Waits.TryFor(() => MsgBoxWin32.First(App.ProcessId), TimeSpan.FromSeconds(5));
        if (box is null) { Kq("F1", $"{id} {text}: KHÔNG hỏi gì"); return; }
        Kq("F1", $"{id} {text}: 「{SeisanNav.OneLine(box.Text)}」 [{string.Join("|", MsgBoxWin32.ButtonCaptions(box.Hwnd))}] → {answer[0]}");
        MsgBoxWin32.ClickButton(box.Hwnd, answer);
        Thread.Sleep(600);
    }
}
