using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.HighNeedsFreewd;

/// <summary>
/// Nền cho fixture cần một giá trị <c>insurance.dis_flg</c> CỤ THỂ mà dữ liệu thật
/// không có.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO MỖI GIÁ TRỊ dis_flg PHẢI LÀ MỘT FIXTURE RIÊNG
/// ═══════════════════════════════════════════════════════════════════════════
/// App nạp <c>_patInfoList</c> đúng MỘT LẦN, ở màn CHỌN BỆNH NHÂN
/// (<c>CommonInp.getCommonPatInfo</c>, frm203001.cs:739); từ đó <c>getPatInfo()</c> chỉ
/// đọc lại mảng trong RAM (CommonInp.cs:160-172). Nghĩa là:
///
/// <list type="bullet">
/// <item>vá DB khi frm203002 đã mở thì app KHÔNG BAO GIỜ thấy — testcase đỏ với thông
///       điệp 「WinForm không hỏi」, đổ oan cho app;</item>
/// <item>một phiên app chỉ ứng được MỘT giá trị <c>dis_flg</c>. Muốn đo 0, 1 và 3 thì
///       phải ba lần mở màn chọn bệnh nhân, tức ba fixture.</item>
/// </list>
///
/// Vì thế việc vá nằm ở <see cref="UiTestBase.PrepareDataBeforeApp"/> — chạy trước cả
/// <c>OchaApp.LaunchOrAttach</c>.
///
/// <para>⚠️ <b>Đừng gộp các fixture này vào một lượt chạy chung.</b>
/// <c>app.attachIfRunning = true</c> nên fixture thứ hai sẽ BÁM VÀO app mà fixture thứ
/// nhất mở, và app đó còn giữ nguyên <c>dis_flg</c> cũ trong RAM dù DB đã được trả lại.
/// Runner có sẵn từng nhóm riêng — xem <c>run-high-needs-freewd.ps1 -Case</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// TRẢ LẠI NGUYÊN TRẠNG
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>[OneTimeTearDown]</c> khôi phục theo ảnh chụp trước khi vá, và chạy KỂ CẢ khi
/// fixture đỏ giữa chừng. Để sót một giá trị vá trên DB dùng chung là làm hỏng mọi lượt
/// chạy sau, và làm sai điểm của chính bệnh nhân đó nếu ai đó mở app thật.
/// </summary>
public abstract class HighNeedsPatchedTestBase : UiTestBase
{
    /// <summary>Giá trị <c>dis_flg</c> mà fixture con cần app nhìn thấy.</summary>
    protected abstract int PatchedDisFlg { get; }

    /// <summary>Mô tả ngắn để đưa vào lý do Ignore và log.</summary>
    protected abstract string PatchPurpose { get; }

    protected HighNeedsFlow Flow { get; private set; } = null!;
    protected HighNeedsDb? HnDb { get; private set; }

    private IReadOnlyList<HighNeedsDb.InsuranceBranch>? _snapshot;
    private int _patchedPatNo = -1;

    /// <summary>
    /// Tắt hẳn watcher hộp thoại nhiễu.
    ///
    /// <para><c>run.nuisanceDialogs</c> mặc định chứa 「を算定しますか？」 và
    /// 「加算を算定しますか」 — ĐÚNG hai câu mà luồng này đo. Để nguyên thì watcher bấm
    /// 「いいえ」 hộ trước khi testcase kịp nhìn thấy, và testcase không đỏ mà <b>xanh
    /// sai</b>: nó không phân biệt được 「app không hỏi」 với 「app có hỏi nhưng đã bị trả
    /// lời mất」.</para>
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    /// <summary>Bệnh nhân đem mượn để vá. Rỗng = dùng <c>patient.patNo</c>.</summary>
    protected int BorrowPatNo =>
        int.TryParse(Settings.HighNeeds.BorrowPatNo, out var n) ? n : PatNo;

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.HighNeeds.AllowDisFlgPatch)
            return $"chưa bật highNeeds.allowDisFlgPatch. Cần dis_flg = {PatchedDisFlg} " +
                   $"({PatchPurpose}) mà dữ liệu KHÔNG có bệnh nhân nào như vậy (đo 2026-08-26: " +
                   "chỉ 0/1/2, và 1 chỉ có 2 bệnh nhân). Chạy: " +
                   ".\\run-high-needs-freewd.ps1 -AllowDisFlgPatch";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString để vá và khôi phục insurance.dis_flg";

        return null;
    }

    /// <summary>Vá <c>dis_flg</c> TRƯỚC khi app mở — xem chú thích đầu lớp.</summary>
    protected override void PrepareDataBeforeApp()
    {
        HnDb = HighNeedsDb.CreateOrNull(Settings);
        if (HnDb is null) return;

        var patNo = BorrowPatNo;
        _snapshot = HnDb.Branches(patNo);
        if (_snapshot.Count == 0)
        {
            TestContext.Out.WriteLine($"bệnh nhân {patNo} không có dòng INSURANCE nào — không vá.");
            _snapshot = null;
            return;
        }

        // Vá HẾT mọi 枝番: app đọc 枝番 còn hiệu lực tại 診療日
        // (modPat.GetValidSubCode2), vá trúng cái app không đọc là đỏ oan.
        var changed = HnDb.PatchDisFlg(patNo, PatchedDisFlg);
        _patchedPatNo = patNo;
        TestContext.Out.WriteLine(
            $"VÁ dis_flg = {PatchedDisFlg} cho bệnh nhân {patNo}, {changed} dòng ({PatchPurpose}). " +
            $"Nguyên trạng sẽ trả lại: {string.Join(", ", _snapshot)}");
    }

    [OneTimeSetUp]
    public void PatchedBaseOneTimeSetUp() => Flow = new HighNeedsFlow(App, Screen);

    [OneTimeTearDown]
    public void RestoreDisFlg()
    {
        if (HnDb is null || _snapshot is null || _patchedPatNo < 0) return;
        try
        {
            HnDb.RestoreDisFlg(_patchedPatNo, _snapshot);
            var now = HnDb.Branches(_patchedPatNo);
            TestContext.Out.WriteLine(
                $"ĐÃ TRẢ LẠI dis_flg cho bệnh nhân {_patchedPatNo}: {string.Join(", ", now)}");

            var leftOver = now.Where(b => b.DisFlg == PatchedDisFlg).Select(b => b.PatBr)
                              .Except(_snapshot.Where(b => b.DisFlg == PatchedDisFlg).Select(b => b.PatBr))
                              .ToList();
            if (leftOver.Count > 0)
                TestContext.Error.WriteLine(
                    $"!! CHƯA TRẢ HẾT: 枝番 {string.Join(",", leftOver)} vẫn đang " +
                    $"dis_flg = {PatchedDisFlg}. SỬA TAY NGAY.");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG TRẢ LẠI ĐƯỢC dis_flg cho bệnh nhân {_patchedPatNo}: {e.Message}. " +
                $"Nguyên trạng cần khôi phục: {string.Join(", ", _snapshot)}. SỬA TAY NGAY.");
        }
    }

    /// <summary>Bật cột ẩn — mọi TC đọc <c>freewd</c> đều cần.</summary>
    protected void EnsureFreewdReadable(TestTrace trace)
    {
        if (Flow.HiddenColumnsVisible()) return;
        if (!Flow.RevealHiddenColumns(trace))
            IgnoreWithReason(
                "không bật được cột ẩn nên không đọc được ô freewd. Xem TC-N1 của " +
                "HighNeedsNotAskedTests — nó khoá riêng đường này.");
    }

    /// <summary>Nhãn nút MsgBox theo NGÔN NGỮ WINDOWS, không theo UI app (đo được 「Yes」/「No」).</summary>
    protected static bool IsYes(string n) => Txt.Same(n, "はい") || Txt.Same(n, "Yes");
    protected static bool IsNo(string n) => Txt.Same(n, "いいえ") || Txt.Same(n, "No");
    protected static bool IsCancel(string n) => Txt.Same(n, "キャンセル") || Txt.Same(n, "Cancel");
}
