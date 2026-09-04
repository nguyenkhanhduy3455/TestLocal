using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.PerioKensaOrder;

/// <summary>
/// Nền chung cho luồng 検査順: dựng 部位病名行 (全顎 = mọi răng CÒN TỒN TẠI), biết máy đang chạy nhánh nào,
/// đổi 検査順 khi được phép, và <b>trả lại nguyên trạng</b> cấu hình máy.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ CÁI BẪY: COMBO 「基本･精密検査」 CÓ THỂ NÓI DỐI
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>frm203003.dspData</c> đặt combo như sau (frm203003.cs:200-202):
/// <code>
///   if (XmlControl.OchaXml.InpInfo.KensaOrder > 0) cboKensaOrder.SelectedValue = …;
///   else                                          cboKensaOrder.SelectedIndex  = 0;
/// </code>
/// Máy chưa từng cấu hình có <c>KensaOrder = 0</c> ⇒ combo hiện <b>mục đầu tiên</b>, tức
/// 「左上から」 (cd_val 1). Nhưng <c>pInpOpt[36] = 0</c>, mà cả hai form chỉ kiểm
/// <c>== 1</c> — nên app THỰC SỰ chạy nhánh 右上. Đọc combo rồi kết luận là sai.
///
/// <para>Vì thế khi <c>perioKensa.allowSettingChange</c> TẮT, nền này KHÔNG tin combo:
/// nó <b>đo nhánh đang chạy</b> bằng chính chỗ con trỏ rơi vào khi mở 歯周基本検査
/// (<see cref="DetectActiveBranch"/>), so với răng mà TỪNG nhánh sẽ chọn trên tập răng
/// còn thật — không so với số cứng 0/15. Cả
/// hai giá trị (nhãn combo và nhánh đo được) đều được in ra; lệch nhau chính là dấu hiệu
/// của <c>KensaOrder = 0</c>.</para>
///
/// <para>Khi cờ BẬT thì không cần đoán: fixture ghi thẳng giá trị nó cần trước mỗi nhóm
/// testcase, và <c>OneTimeTearDown</c> đặt lại đúng nhãn đã chụp ban đầu.</para>
/// </summary>
public abstract class PerioKensaTestBase : UiTestBase
{
    internal PerioKensaOrderFlow Flow { get; private set; } = null!;

    /// <summary>Nhãn combo lúc chưa ai đụng vào — mốc để khôi phục.</summary>
    protected string OriginalOrderLabel { get; private set; } = "";

    /// <summary>Danh sách mục thật của combo (cd_type 68) — in ra để sửa mảnh khớp nếu khách đổi chữ.</summary>
    protected IReadOnlyList<string> OrderComboItems { get; private set; } = [];

    /// <summary>Nhánh 検査順 mà app ĐANG chạy; null = chưa đo / không đo được.</summary>
    protected int? ActiveOrder { get; private set; }

    /// <summary>Vì sao đọc combo ra rỗng — 「menu không mở」 / 「control đổi tên」 khác hẳn nhau.</summary>
    protected string OrderReadReason { get; private set; } = "";

    /// <summary>
    /// Sàn số răng để đo được luật đi con trỏ. Ít hơn ngần này thì gần như bước Enter nào
    /// cũng rơi vào 「hết vòng」 và không tách được 「đi tới răng kế」 khỏi 「nhảy hàng」.
    /// </summary>
    protected const int MinTeeth = 6;

    private bool _settingChanged;
    private bool _archRowBuilt;

    protected bool CanChangeSetting => Settings.PerioKensa.AllowSettingChange;

    [OneTimeSetUp]
    public void PerioKensaBaseOneTimeSetUp()
    {
        Flow = new PerioKensaOrderFlow(App, Screen);

        OriginalOrderLabel = Flow.ReadKensaOrderLabel(out var items, out var reason);
        OrderComboItems = items;
        OrderReadReason = reason;

        TestContext.Out.WriteLine(
            $"検査順 — combo 「基本･精密検査」 đang hiện 「{OriginalOrderLabel}」. " +
            $"Mục của combo (mst_cod cd_type 68): " +
            (items.Count == 0 ? "(đọc không ra)" : string.Join(" / ", items)) +
            (Txt.Same(reason, "ok") ? "" : $"\n  ⚠️ {reason}"));
        TestContext.Out.WriteLine(
            CanChangeSetting
                ? "perioKensa.allowSettingChange BẬT — fixture sẽ GHI Ocha.xml và trả lại ở cuối."
                : "perioKensa.allowSettingChange TẮT — fixture chỉ chạy nhóm testcase khớp nhánh " +
                  "máy đang chạy; nhóm còn lại tự Ignore.");
    }

    [OneTimeTearDown]
    public void RestoreKensaOrder()
    {
        if (!_settingChanged || OriginalOrderLabel.Length == 0) return;
        try
        {
            var r = Flow.RestoreKensaOrder(OriginalOrderLabel);
            if (r.Ok)
                TestContext.Out.WriteLine($"ĐÃ TRẢ LẠI 検査順 = 「{OriginalOrderLabel}」.");
            else
                TestContext.Error.WriteLine(
                    $"!! CHƯA TRẢ LẠI ĐƯỢC 検査順. Cần đặt tay về 「{OriginalOrderLabel}」 ở " +
                    $"診療入力 → F11 選択 → ９ オプション → ２ 処置入力設定. Lý do: {r.Reason}");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! CHƯA TRẢ LẠI ĐƯỢC 検査順 ({e.Message}). Đặt tay về 「{OriginalOrderLabel}」.");
        }
    }

    /// <summary>
    /// Dọn hộp thoại còn sót của testcase trước.
    ///
    /// <para>Đặt ở <c>[SetUp]</c> chứ KHÔNG ở <c>[TearDown]</c> là có chủ ý: NUnit chạy
    /// TearDown của lớp con TRƯỚC lớp cha, mà <c>UiTestBase.TearDown</c> mới là chỗ chụp
    /// ảnh lúc đỏ. Dọn ở TearDown là tự xoá đúng bằng chứng cần nhìn nhất
    /// (PROBE-GUIDELINE mục 2).</para>
    /// </summary>
    [SetUp]
    public void PerioKensaBaseSetUp() => Flow.CloseBackToTreatment();

    // ── Tiền đề ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Dựng (một lần) 部位病名行 bằng F7 全顎 và trả về dòng đó. Không dựng được thì
    /// <c>Ignore</c> — đó là chuyện dữ liệu của máy, không phải WinForm sai.
    /// </summary>
    protected RegiRow RequireArchRow(TestTrace trace)
    {
        if (!_archRowBuilt)
        {
            var built = trace.Do("dung 部位病名行 全顎 (F7) + 病名",
                                 () => Flow.BuildWholeArchRow(Settings.PerioKensa.DisCd, trace));
            trace.Note(built.ToString());

            if (!built.DialogOpened)
                IgnoreWithReason(
                    "không mở được 部位選択 từ lưới 処置. Tháng của patient.trtDate phải có ít " +
                    "nhất một dòng 処置 THẬT để đứng lên — tháng trống thì không dòng nào mở " +
                    "được hộp thoại (BuiDispFlg = 99 ở dòng 日計/合計).");

            // KHÔNG đòi đủ 32. `F7 全顎` nghĩa là 「mọi răng CÒN TỒN TẠI」: `setBui` bỏ qua
            // răng có `_sigaData.bui* == 4` (欠損歯) và răng có `_plaqueData.bui* != 1`
            // (frm902003.cs:841-895). Đo thật 2026-09-04 trên bệnh nhân test: 25/32.
            // Vì thế kỳ vọng của testcase được TÍNH từ tập răng đọc lại được từ chính hộp
            // thoại (xem PerioNav), chứ không phải số cứng như spec Playwright.
            //
            // Vẫn cần một sàn: dưới ngần này thì mọi bước Enter đều rơi vào 「hết vòng」 và
            // không phân biệt nổi 「đi tới răng kế」 với 「nhảy hàng」.
            if (built.MarkedSlots < MinTeeth)
                IgnoreWithReason(
                    $"F7 全顎 chỉ làm sáng {built.MarkedSlots} ô 部位, cần ít nhất {MinTeeth}. " +
                    "Bệnh nhân này mất quá nhiều răng để đo được luật đi con trỏ — 全顎 chỉ bật " +
                    "răng còn tồn tại (frm902003.cs:841-895). Đổi patient.patNo, hoặc đặt lại " +
                    "歯式 của bệnh nhân test về 全部残存.");

            _archRowBuilt = true;
        }

        var row = Flow.WholeArchRow();
        if (row is null)
            IgnoreWithReason(
                "không tìm lại được 部位病名行 vừa dựng trong lưới. F6 lấy BUI của DÒNG ĐANG " +
                "CÓ CON TRỎ (frm203002.cs:4719), đứng nhầm dòng là mọi ô bị khoá ／ và testcase " +
                "sẽ XANH GIẢ chứ không đỏ.");
        return row!;
    }

    // ── 検査順 ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Bảo đảm app đang chạy nhánh <paramref name="cdVal"/>.
    ///
    /// <para>Cờ bật ⇒ ghi thẳng. Cờ tắt ⇒ đo nhánh đang chạy; khớp thì đi tiếp, không khớp
    /// thì <c>Ignore</c> kèm câu lệnh cần chạy.</para>
    /// </summary>
    protected void RequireOrder(int cdVal, TestTrace trace)
    {
        var want = OrderName(cdVal);

        if (CanChangeSetting)
        {
            if (ActiveOrder == cdVal) return;
            var r = trace.Do($"dat 検査順 = {want}", () => Flow.SetKensaOrder(cdVal, trace));
            trace.Note(r.ToString());
            if (!r.Ok)
                Assert.Fail(
                    $"không đặt được 検査順 = {want} qua 処置入力設定 (frm203003). {r.Reason}. " +
                    "Mục của combo: " +
                    (r.Items.Count == 0 ? "(đọc không ra)" : string.Join(" / ", r.Items)));
            _settingChanged = true;
            ActiveOrder = cdVal;
            return;
        }

        ActiveOrder ??= DetectActiveBranch(trace);
        if (ActiveOrder is null)
            IgnoreWithReason(
                "không đo được nhánh 検査順 đang chạy (mở 歯周基本検査 mà con trỏ không rơi vào " +
                "txtEpp01 lẫn txtEpp16). Chạy probe Tc0 để xem ảnh từng bước.");

        if (ActiveOrder != cdVal)
            IgnoreWithReason(
                $"máy đang chạy nhánh {OrderName(ActiveOrder!.Value)}, testcase này cần " +
                $"{want}. Bật cờ để fixture tự đổi (và tự trả lại):\n" +
                "    .\\run-move-perio-exam-cursor.ps1 -AllowSettingChange\n" +
                "  ⚠️ Cờ đó cho phép GHI C:\\NEW_SIM2000\\Ocha.xml — cấu hình CỦA MÁY, " +
                "không phải DB.");
    }

    /// <summary>
    /// Nhánh 検査順 mà app THỰC SỰ chạy, đo bằng chỗ con trỏ rơi vào khi mở 歯周基本検査.
    ///
    /// <para>Đây là mốc duy nhất đáng tin khi không được ghi setting — xem cái bẫy
    /// <c>KensaOrder = 0</c> ở đầu lớp.</para>
    /// </summary>
    protected int? DetectActiveBranch(TestTrace trace)
    {
        var row = RequireArchRow(trace);
        var kihon = OpenKihon(row, trace);
        try
        {
            // Mốc so sánh phải tính từ TẬP RĂNG CÒN THẬT, không phải răng 0 / răng 15:
            // 全顎 chỉ bật răng còn tồn tại, và bệnh nhân test đo được 2026-09-04 mất
            // đúng cả hai răng đó (0 và 15). So với số cứng là luôn ra 「không khớp
            // nhánh nào」 và cả fixture tự Ignore oan.
            var present = PerioNav.PresentFromKihon(kihon);
            var expectRight = PerioNav.FirstTooth(present, leftFirst: false);
            var expectLeft = PerioNav.FirstTooth(present, leftFirst: true);
            var focused = Txt.N(Flow.FocusedId());

            trace.Note($"do nhanh dang chay: {PerioNav.Describe(present)}; " +
                       $"右上 se vao rang {expectRight}, 左上 se vao rang {expectLeft}; " +
                       $"con tro dang o 「{PerioExamDialog.Describe(focused)}」");

            int? branch = null;
            if (expectRight != expectLeft)
            {
                if (expectRight >= 0 && Txt.Same(focused, PerioExamDialog.Epp(expectRight)))
                    branch = PerioKensaOrderFlow.UpperRightFirst;
                else if (expectLeft >= 0 && Txt.Same(focused, PerioExamDialog.Epp(expectLeft)))
                    branch = PerioKensaOrderFlow.UpperLeftFirst;
            }
            else
            {
                // Hai nhánh trỏ cùng một răng ⇒ con trỏ KHÔNG phân biệt được chúng.
                trace.Note($"CANH BAO: hai nhanh cung vao rang {expectRight} nen khong " +
                           "phan biet duoc bang con tro");
            }

            TestContext.Out.WriteLine(
                $"検査順 ĐANG CHẠY = {OrderName(branch ?? -1)} (đo từ con trỏ: {focused}; " +
                $"右上⇒răng {expectRight}, 左上⇒răng {expectLeft}); " +
                $"combo hiển thị 「{OriginalOrderLabel}」." +
                (branch == PerioKensaOrderFlow.UpperRightFirst && Txt.Has(OriginalOrderLabel, "左上")
                    ? "  ⚠️ LỆCH NHAU — gần như chắc chắn Ocha.xml đang có KensaOrder = 0: " +
                      "combo lấy SelectedIndex = 0 nên hiện 左上, còn pInpOpt[36] = 0 nên app chạy 右上."
                    : ""));

            return branch;
        }
        finally
        {
            if (kihon is not null) Flow.CloseBackToTreatment(trace);
        }
    }

    protected static string OrderName(int cdVal) => cdVal switch
    {
        PerioKensaOrderFlow.UpperLeftFirst => "左上から (cd_val 1)",
        PerioKensaOrderFlow.UpperRightFirst => "右上から (cd_val 2)",
        PerioKensaOrderFlow.NeverConfigured => "chưa cấu hình (0 — chạy như 右上)",
        _ => $"(không xác định: {cdVal})",
    };

    // ── Mở hai màn kiểm tra ──────────────────────────────────────────────────

    protected Window OpenKihon(RegiRow row, TestTrace trace)
    {
        var karte = trace.Do("F6 → カルテ記載選択", () =>
        {
            var w = Flow.OpenKarteSelect(row, out var why, trace);
            if (w is null) Assert.Fail($"F6 không mở được カルテ記載選択 (frm203011). {why}");
            return w!;
        });

        var kihon = trace.Do("F1 基本検査", () => Flow.OpenKihon(karte, trace));
        if (kihon is null)
            Assert.Fail("F1 của frm203011 không mở được 歯周基本検査 (frm203028) trong 20s.");
        return kihon!;
    }

    protected Window OpenSeimitu(RegiRow row, TestTrace trace)
    {
        var karte = trace.Do("F6 → カルテ記載選択", () =>
        {
            var w = Flow.OpenKarteSelect(row, out var why, trace);
            if (w is null) Assert.Fail($"F6 không mở được カルテ記載選択 (frm203011). {why}");
            return w!;
        });

        var seimitu = trace.Do("F2 精密検査", () => Flow.OpenSeimitu(karte, trace));
        if (seimitu is null)
            Assert.Fail("F2 của frm203011 không mở được 歯周精密検査 (frm203029) trong 20s.");
        return seimitu!;
    }

    /// <summary>
    /// Chế độ 4点法/6点法 mà phiên app này đang chạy — <c>pInpOpt[32]</c>, KHÔNG đổi được
    /// giữa chừng. Không khớp thì <c>Ignore</c> kèm cách đổi.
    /// </summary>
    protected void RequireSeimituMode(Window seimitu, int wanted, TestTrace trace)
    {
        var actual = PerioKensaOrderFlow.MeasureSeimituMode(
            seimitu, PerioNav.PresentFromSeimitu(seimitu));
        trace.Note($"che do do duoc tu giao dien: {PerioKensaOrderFlow.ModeName(actual)}");

        if (actual is null)
            IgnoreWithReason(
                "không đo được 4点法/6点法: không răng nào còn tồn tại cho ra được cặp ô 口蓋 " +
                "đọc được. Chạy probe Tc0 để xem ảnh + tập răng thật.");

        if (actual != wanted)
            IgnoreWithReason(
                $"phiên app này đang chạy {PerioKensaOrderFlow.ModeName(actual)}, testcase cần " +
                $"{PerioKensaOrderFlow.ModeName(wanted)}. KHÔNG đổi được giữa chừng: " +
                "pGetInpOpt() chỉ nạp lại Ocha.xml, còn pInpOpt[32] = _inpConfigData.seimitu_mode " +
                "(modCommon.cs:581) mà _inpConfigData chỉ nạp MỘT LẦN lúc app khởi động " +
                "(:299). Đổi ở màn 初期設定 frm506008 rồi khởi động lại app, hoặc bỏ qua " +
                "testcase này. (Bản Playwright đè được cả hai chế độ trong một lượt vì bên đó " +
                "nó chỉ là một field của response JSON.)");
    }

    // ── Assert ───────────────────────────────────────────────────────────────

    /// <summary>Khẳng định con trỏ đang ở ô <paramref name="expectedId"/>, kèm nguồn WinForm.</summary>
    protected void AssertFocus(string expectedId, string why, TestTrace? trace = null)
    {
        var actual = Txt.N(Flow.WaitFocus(expectedId));
        trace?.Note($"focus: cho 「{expectedId}」 — thay 「{actual}」");
        Assert.That(actual, Is.EqualTo(expectedId),
            $"{why}\n" +
            $"    chờ  : {PerioExamDialog.Describe(expectedId)}\n" +
            $"    thấy : {PerioExamDialog.Describe(actual)}");
    }

    /// <summary>Enter rồi khẳng định đích — đúng cặp <c>enterTo()</c> của spec Playwright.</summary>
    protected void EnterTo(string expectedId, string why, TestTrace? trace = null)
    {
        PerioExamDialog.PressEnter();
        AssertFocus(expectedId, why, trace);
    }
}
