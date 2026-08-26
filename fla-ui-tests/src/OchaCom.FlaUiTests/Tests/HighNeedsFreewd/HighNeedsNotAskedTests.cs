using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

/// <summary>
/// <b>Nhóm A — dis_flg ≠ 3: app phải IM LẶNG.</b>
///
/// Chạy trên dữ liệu THẬT, không vá gì cả, nên không cần cờ nào. Đây là nửa đối
/// chiếu của <c>auto-santei-high-needs-freewd.spec.ts</c> <b>H-1</b>: có dòng
/// 歯科診療特別対応加算 trên lưới KHÔNG đủ để kết luận phải hỏi — điều kiện là
/// <c>dis_flg == 3</c>, so BẰNG.
///
/// <para>Vì sao tách riêng khỏi <see cref="HighNeedsAskedTests"/>: app nạp
/// <c>dis_flg</c> đúng MỘT LẦN ở màn chọn bệnh nhân (<c>CommonInp.getCommonPatInfo</c>,
/// frm203001.cs:739) rồi giữ trong <c>_patInfoList</c> suốt phiên. Không thể vừa chạy
/// nhánh 「dis_flg thật」 vừa chạy nhánh 「dis_flg = 3」 trong cùng một lần mở app.</para>
///
/// ─── ĐO THẬT 2026-08-26 (probe Tc0, bệnh nhân 10, ngày 2026-08-03) ───────────
/// <code>
///   dis_flg của bệnh nhân đem test : 0   (1 枝番 duy nhất)
///   gõ 105 ở コードモード          : mở 処置選択, 11 dòng, 枝番 0,1,2,3,4,5,6,7,10,20,21
///   chốt 105-0                     : KHÔNG hỏi gì, dòng vẫn được chèn
///   cột ẩn bật lên                 : 5 ô → 81 ô, FREEWD ở ô 72 (khớp frm203002.cs:188)
///   ô freewd trống đọc ra          : 「(null)」  ← KHÔNG phải chuỗi rỗng
/// </code>
///
/// <para>Chạy: <c>.\run-high-needs-freewd.ps1 -Case NotAsked</c></para>
/// </summary>
[TestFixture]
[Category("high-needs-freewd")]
public sealed class HighNeedsNotAskedTests : UiTestBase
{
    private HighNeedsFlow _flow = null!;
    private HighNeedsDb? _hnDb;
    private int _disFlg = -1;

    /// <summary>
    /// Tắt hẳn watcher. <c>run.nuisanceDialogs</c> mặc định chứa 「加算を算定しますか」 —
    /// đúng câu fixture này đang khẳng định là KHÔNG xuất hiện. Để nguyên thì watcher
    /// bấm 「いいえ」 hộ và testcase XANH SAI: nó không thể phân biệt 「app không hỏi」 với
    /// 「app có hỏi nhưng đã bị trả lời mất」.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    [OneTimeSetUp]
    public void NotAskedOneTimeSetUp()
    {
        _flow = new HighNeedsFlow(App, Screen);
        _hnDb = HighNeedsDb.CreateOrNull(Settings);

        if (_hnDb is not null)
        {
            var branches = _hnDb.Branches(PatNo);
            _disFlg = branches.Count > 0 ? branches[0].DisFlg : -1;
            TestContext.Out.WriteLine(
                $"bệnh nhân {PatNo}: {branches.Count} 枝番 — " + string.Join(", ", branches));
        }
    }

    private void RequireNotHighNeeds()
    {
        if (_hnDb is null)
            IgnoreWithReason($"cần DB để biết dis_flg thật của bệnh nhân — {DbUnavailableReason}");
        if (_disFlg == HighNeedsDb.DisFlgHighNeeds)
            IgnoreWithReason(
                $"bệnh nhân {PatNo} đang có dis_flg = 3, mà nhóm này đo nhánh 「KHÁC 3」. " +
                "Đổi patient.patNo sang bệnh nhân dis_flg 0/1/2.");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-N1 — nền móng: đọc được ô freewd thì mọi TC sau mới có nghĩa
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-N1 — cửa hậu bật cột ẩn chạy được, và FREEWD nằm đúng ô 72")]
    public void TcN1_HiddenFreewdColumnIsReadable()
    {
        using var trace = TestTrace.Begin();

        var before = _flow.VisibleCellCount();
        Assert.That(before, Is.EqualTo(HighNeedsFlow.ColHideStart),
            $"lúc đầu lưới phải chỉ đọc ra {HighNeedsFlow.ColHideStart} ô — mọi cột ≥ 5 " +
            "đều Visible = false (frm203002.cs:2664-2671, RegiCol.hideStart = 5). " +
            $"Đang đọc ra {before} ô.");

        var revealed = _flow.RevealHiddenColumns(trace);
        trace.Shot("cot-an-da-bat");

        Assert.That(revealed, Is.True,
            "cửa hậu bật cột ẩn không chạy: click nhãn 患者番号 (customLabel1_Click, " +
            "frm203002.cs:2647) rồi double-click nhãn 氏名 (customLabel3_DoubleClick, :2652) " +
            $"phải làm mọi cột hiện ra. Vẫn đọc ra {_flow.VisibleCellCount()} ô. " +
            "Không bật được thì đường DUY NHẤT đọc freewd là F9 登録 rồi truy TRNTRN.");

        var headers = _flow.AllHeaders();
        var idx = headers.ToList().FindIndex(h => Txt.Has(h, "FREEWD") || Txt.Has(h, "freewd"));

        Assert.Multiple(() =>
        {
            Assert.That(_flow.VisibleCellCount(), Is.GreaterThan(HighNeedsFlow.ColFreewd),
                $"bật cột ẩn rồi mà một dòng vẫn chưa có tới ô thứ {HighNeedsFlow.ColFreewd}");

            Assert.That(idx, Is.EqualTo(HighNeedsFlow.ColFreewd),
                $"cột FREEWD phải là ô thứ {HighNeedsFlow.ColFreewd} — hằng số " +
                $"RegiCol.FREEWD = 72 (frm203002.cs:188), và thứ tự cột đúng bằng thứ tự " +
                $"SELECT của getInpTrntrnData (InpDBAccess.cs:73). Đang thấy ở ô {idx}. " +
                $"Lệch ⇒ mọi testcase đọc freewd phía dưới đang đọc nhầm cột.");
        });

        TestContext.Out.WriteLine($"=== KQ-N1 === {headers.Count} cột; FREEWD ở ô {idx}");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-N2 — ⇔ web H-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC-N2 — dis_flg ≠ 3: chèn 105 (特別対応加算) mà KHÔNG hỏi 困難者加算")]
    public void TcN2_NoQuestionWhenDisFlgIsNotThree()
    {
        RequireNotHighNeeds();
        using var trace = TestTrace.Begin();

        Assert.That(_flow.EnterCode(trace, HighNeedsFlow.TrtCdToku.ToString()), Is.True,
            "không gõ được mã vào ô 点 ở コードモード");

        var picker = _flow.WaitForPicker();
        Assert.That(picker, Is.Not.Null,
            $"mã {HighNeedsFlow.TrtCdToku} phải mở 処置選択. KasanCode chỉ bẫy 101/102/103 " +
            $"(modMain.cs:533) nên 105 đi đường thường. Hộp thoại: {_flow.DescribeDialogs()}");

        var rows = _flow.ReadPicker(picker!);
        var target = rows.FirstOrDefault(r => Txt.Int(r.Sub) == 0);
        Assert.That(target, Is.Not.Null,
            $"picker của mã 105 phải có 枝番 0 (歯科診療特別対応加算１(初診), CommonChk.cs:1225). " +
            $"Đang có: {string.Join(" / ", rows.Select(r => r.Sub))}");

        Assert.That(_flow.CommitPick(picker!, target!.Index, trace), Is.True,
            "không chốt được dòng trong 処置選択 (double-click lẫn Enter đều không đóng nó)");

        var silent = _flow.StaysSilent(seconds: 6);
        trace.Shot("sau-khi-chot-105");

        Assert.That(silent, Is.True,
            $"dis_flg = {_disFlg} (KHÁC 3) mà app vẫn hỏi 困難者加算. frm203016.cs:1098 so " +
            "BẰNG 3 (`patData.ins.dis_flg == 3`) nên đây phải im lặng. " +
            $"Hộp thoại đang mở: {_flow.DescribeDialogs()}");

        // Dòng VẪN phải được chèn — 「không hỏi」 khác hẳn 「không làm gì」.
        var inserted = _flow.RowNamed(target.Name.Trim());
        Assert.That(inserted, Is.Not.Null,
            $"chốt 処置選択 rồi thì dòng 「{target.Name.Trim()}」 phải nằm trên lưới. " +
            "Không hỏi KHÔNG có nghĩa là không chèn — IregCodChk chạy SAU khi " +
            "frmTrtSel_Let_Trt_Data đã ghi xong dòng (frm203016.cs:1629).");

        var freewd = _flow.FreewdOf(inserted!);
        Assert.That(HighNeedsFlow.IsFreewdEmpty(freewd), Is.True,
            $"không ai trả lời 「はい」 thì freewd phải trống. Đang là " +
            $"{HighNeedsFlow.DescribeFreewd(freewd)}. Chỉ nhánh Yes mới ghi 「1」 " +
            "(frm203016.cs:1100-1102).");

        TestContext.Out.WriteLine(
            $"=== KQ-N2 === dis_flg={_disFlg} → không hỏi; dòng 「{inserted!.Ryo.Trim()}」 " +
            $"freewd = {HighNeedsFlow.DescribeFreewd(freewd)}");

        _flow.DismissAll();
    }
}
