using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

/// <summary>
/// Lái chuỗi hộp thoại F8 会計 tới 会計データ修正 (<c>modAcc.LetAccData2</c> →
/// <c>ChgAccData</c>).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG VIẾT CỨNG CHUỖI HỘP THOẠI
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>LetAccData2</c> (modAcc.cs:541-784) là một cây quyết định: 「既に…会計処理…」,
/// 「請求金額が増えています」, 「差額」, 「医療保険差額」 … cái nào hiện ra phụ thuộc
/// dữ liệu của bệnh nhân và <c>tre_acc_link</c>. Viết cứng "bấm はい, rồi いいえ, rồi
/// はい" là đóng đinh vào MỘT tổ hợp dữ liệu; đổi bệnh nhân test là hỏng, mà thông
/// báo lỗi sẽ chỉ nói "không thấy nút", không nói vì sao.
///
/// <para>Nên: <b>đi theo luật</b>. Gặp hộp thoại nào thì tra bảng luật để biết bấm gì,
/// ghi lại từng cái đã gặp, và dừng khi thấy hộp thoại đích. Chuỗi thật xuất hiện
/// trong nhật ký — vừa chạy được, vừa tự tài liệu hoá.</para>
///
/// <para>⚠️ 会計 (F8) cũng như 登録 (F9): 「F8」 chỉ là NHÃN. Handler là
/// <c>btnF8_Click</c>. Bấm phím không chắc ăn khi ô lưới đang ở chế độ soạn thảo,
/// nên click NÚT.</para>
/// </summary>
public static class AccountingFlow
{
    /// <summary>Hộp thoại đích — 会計データ修正 (modAcc.cs:931-942).</summary>
    public const string ChgAccDataFragment = "計上しますか";

    /// <summary>
    /// Cửa sổ 入金指定 (frm203027) — <b>bằng chứng đã đi nhầm sang nhánh F</b>, không phải
    /// một hộp thoại cần thêm luật.
    ///
    /// <para>Nó chỉ được mở ở modAcc.cs:602, tức là BÊN TRONG nhánh
    /// 「会計データが存在しない」. Thấy nó ⇒ <c>past_billing_amount == 0</c> hoặc
    /// <c>pAccLink == false</c> ngay từ modAcc.cs:598, và <c>ChgAccData</c> nằm ở nhánh
    /// else nên không còn đường quay lại. Xem <see cref="AccountingPreconditions"/>.</para>
    /// </summary>
    public const string BranchFMarker = "入金指定額";

    /// <summary>Một hộp thoại đã gặp trên đường đi.</summary>
    public sealed record Seen(string Text, string Answered, string[] Buttons);

    /// <param name="Reached">Có tới được hộp thoại 「…計上しますか？」 không.</param>
    /// <param name="Trail">Mọi hộp thoại đã gặp, theo thứ tự — đây là chuỗi THẬT.</param>
    /// <param name="Diagnosis">Khi không tới đích: vì sao, nói bằng ngôn ngữ của modAcc.</param>
    public sealed record Walk(
        bool Reached, IReadOnlyList<Seen> Trail, Window? Target, string? Diagnosis = null);

    /// <summary>
    /// Luật trả lời cho các hộp thoại TRUNG GIAN.
    ///
    /// <para>Mục tiêu là đi tới nhánh G (会計データ修正): 会計 cũ phải GIỮ NGUYÊN, nên
    /// hộp thoại 「既に…会計処理…されています」 phải trả lời <b>いいえ</b> (modAcc.cs:567) —
    /// trả lời はい là tạo 会計 mới và không bao giờ tới được ChgAccData.</para>
    ///
    /// <para>Khớp theo thứ tự trong mảng; cái nào khớp trước dùng cái đó. Mỗi luật liệt
    /// kê NHIỀU tên nút vì nhãn phụ thuộc ngôn ngữ giao diện Windows và kiểu MessageBox
    /// (YesNo hay OKCancel) — đo thật: hộp thoại đầu chuỗi dùng <b>OK/Cancel</b>.</para>
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// CHUỖI THẬT, đo bằng -Diagnostics ngày 2026-08-11
    /// ═══════════════════════════════════════════════════════════════════════
    /// <code>
    /// [1] 「処置データチェックでエラーがありました。このまま続けますか?」        OK / Cancel
    /// [2] 「会計処理を行う日が本日でありません。よろしいですか。」               OK / Cancel
    /// [3] 「既に、¥N の会計処理がされていますが、未清算データ(¥M)を…?」        Yes / No
    /// [4] 「処置点数が …。¥N を 預り金/未収金 に計上しますか？」  ← ĐÍCH (ChgAccData)
    /// </code>
    /// Nút của [1][2] là <b>OK/Cancel</b>, của [3] là <b>Yes/No</b> — trên Windows tiếng
    /// Anh nhãn ra tiếng Anh, nên mọi luật đều liệt kê cả hai thứ tiếng.
    /// F8 chạy 処置データチェック TRƯỚC khi vào cây quyết định 会計 của LetAccData2.
    /// Bệnh nhân test không có 部位・病名 nên luôn dính cảnh báo
    /// 「当月に部位・病名がない可能性があります」.
    ///
    /// <para><b>⚠️ Không phải cửa sổ nào chặn đường cũng cần thêm luật.</b> Bước [3] trông
    /// hệt một hộp thoại lạ, và phản xạ đầu tiên là viết luật bấm 「F1 指定なし」 cho nó đi
    /// tiếp. Sai: 入金指定 nằm TRONG nhánh 「会計データが存在しない」, nên tới được đó nghĩa
    /// là 会計データ修正 đã bị bỏ qua từ modAcc.cs:598 rồi. Việc phải làm là dựng tiền đề
    /// TRƯỚC khi bấm F8 (<see cref="AccountingPreconditions"/>), không phải bấm thêm nút.
    /// Trước khi thêm bất kỳ luật nào: tra xem cửa sổ đó nằm ở nhánh nào của source.</para>
    ///
    /// <para><b>Cả hai đều phải đáp OK (tiếp tục).</b> Lượt chạy đầu rơi vào luật mặc
    /// định "phủ định cho an toàn" → bấm Cancel → huỷ cả chuỗi F8. Với hộp thoại dạng
    /// 「…続けますか？」/「…よろしいですか。」 thì phủ định = bỏ cuộc, không phải an toàn.</para>
    ///
    /// <para><b>⚠️ Luật phải HẸP.</b> Bản đầu khớp trên 「会計処理」 và vô tình bắt luôn
    /// hộp thoại [2] (cảnh báo NGÀY), rồi trả lời いいえ. Hộp thoại 既存会計 mà ta thật sự
    /// muốn bắt có dạng 「既に…会計処理…されています」 — nên luật của nó đòi cả 「既に」.</para>
    /// </summary>
    private static readonly (string Contains, string[] Buttons, string Why)[] Rules =
    [
        // ══════════════════════════════════════════════════════════════════════
        // ⚠️ THỨ TỰ LÀ MỘT PHẦN CỦA LUẬT — CỤ THỂ TRƯỚC, CHUNG CHUNG SAU
        // ══════════════════════════════════════════════════════════════════════
        // Khớp là first-wins. Câu chữ của WinForm chồng lấn nhau rất nhiều, nên một
        // luật chung đặt sai chỗ sẽ NUỐT hộp thoại mà luật cụ thể đang chờ.
        //
        // Đã vấp thật (2026-08-11 11:36): hộp thoại
        //   「既に、¥1,020 の会計処理がされていますが、未清算データ(¥0)を作成してよろしいですか?」
        // chứa CẢ 「既に」 lẫn 「よろしいですか」. Luật 「よろしいですか」 đứng trước nên
        // trúng nó và trả lời はい — mà はい chính là 「tạo 未精算データ mới」
        // (modAcc.cs:566 đặt past_billing_amount = 0), tức tự tay rẽ sang nhánh F.
        // Chuỗi đi đúng tới cửa ngõ nhánh G rồi bị luật của chính mình đẩy ra.

        // ── 1. Cây quyết định của LetAccData2 — CỤ THỂ, phải đứng trước ────────
        // 「既に…会計処理…されていますが、未清算データ…作成してよろしいですか?」
        // いいえ = giữ 会計 cũ ⇒ đường DUY NHẤT còn lại dẫn tới ChgAccData.
        ("既に",         ["いいえ", "No", "Cancel"], "giu 会計 cu => moi re duoc sang nhanh G"),
        ("されています", ["いいえ", "No", "Cancel"], "cung y tren, phong khi cau chu khac"),
        // 「会計処理後、請求金額が増えています。差額分の未精算データ…作成しますか?」
        ("増えています", ["いいえ", "No", "Cancel"], "khong tao dong 差額 — nhanh F, khong phai G"),
        ("差額",         ["いいえ", "No", "Cancel"], "cung ly do"),

        // ── 2. Cảnh báo TRƯỚC cây quyết định — CHUNG CHUNG, đứng sau ───────────
        // Đều phải TIẾP TỤC. Xem ghi chú 「phủ định = bỏ cuộc」 ở phần tóm tắt trên.
        ("続けますか",       ["OK", "はい", "Yes"], "canh bao 処置データチェック — tiep tuc"),
        ("チェックで",       ["OK", "はい", "Yes"], "cung y tren, phong khi cau chu khac"),
        ("本日でありません", ["OK", "はい", "Yes"], "ngay 会計 khac hom nay — van tiep tuc"),
        // ⚠️ Luật RỘNG NHẤT, chốt cuối: 「よろしいですか」 có trong rất nhiều câu.
        // Thêm luật mới thì đặt TRÊN nó, đừng đặt dưới.
        ("よろしいですか",   ["OK", "はい", "Yes"], "xac nhan chung chung — tiep tuc"),
    ];

    private const string BranchFDiagnosis =
        "Chuỗi F8 mở cửa sổ 入金指定 (frm203027). Cửa sổ đó chỉ tồn tại ở modAcc.cs:602, " +
        "tức BÊN TRONG nhánh 「会計データが存在しない」 — nên 会計データ修正 đã bị bỏ qua " +
        "ngay ở modAcc.cs:598, trước mọi hộp thoại.\n\n" +
        "  Điều kiện rẽ: past_billing_amount == 0 || pAccLink == false. Kiểm hai thứ:\n" +
        "    1. ACCDAT của (患者, 診療日) có dòng km_cd 40-49/57/58, lflg = 0, claim_amt > 0 chưa?\n" +
        "    2. accconfig.tre_acc_link có = 1 không? (đổi rồi phải KHỞI ĐỘNG LẠI app)\n\n" +
        "  AccountingPreconditions.Ensure lo cả hai — nếu bạn thấy dòng này thì nó đã " +
        "chạy mà vẫn không đủ, hãy đọc lại nhật ký ở phần đầu.";

    /// <summary>
    /// Bấm F8 会計 rồi đi theo luật cho tới khi gặp 「…計上しますか？」.
    /// KHÔNG trả lời hộp thoại đích — người gọi tự quyết はい/いいえ.
    /// </summary>
    public static Walk WalkToChgAccData(OchaApp app, Window screen, TestTrace? trace = null)
    {
        var timeout = TestSettings.Current.Parity.DialogTimeout;
        var trail = new List<Seen>();

        trace?.Step("bam F8 会計");
        TriggerAccounting(screen, trace);
        Waits.Step();

        // Trần 8 vòng: cây quyết định của LetAccData2 sâu nhất khoảng 4 hộp thoại.
        // Chạm trần nghĩa là gặp vòng lặp, và bỏ chạy còn hơn bấm mãi vào sổ tiền.
        for (var i = 0; i < 8; i++)
        {
            var hit = Waits.TryFor(
                () => ModalDialogs.Find(app, screen, ChgAccDataFragment),
                TimeSpan.FromSeconds(3));
            if (hit is not null)
            {
                trace?.Note($"TOI DICH sau {trail.Count} hop thoai trung gian (duong {hit.Route})");
                return new Walk(true, trail, hit.Dialog);
            }

            var any = Waits.TryFor(() => ModalDialogs.All(app, screen).FirstOrDefault(),
                                   i == 0 ? timeout : TimeSpan.FromSeconds(5));
            if (any is null)
            {
                trace?.Note("khong con hop thoai nao — chuoi F8 da ket thuc ma khong toi 会計データ修正");
                return new Walk(false, trail, null,
                    trail.Count == 0
                        ? "F8 không mở hộp thoại nào. Thường là 処置 hiện tại KHỚP HỆT 会計 " +
                          "đã chốt (modAcc.cs:571 trả về ngay), hoặc ngày đang xem không có 処置."
                        : "Chuỗi F8 kết thúc mà không tới 「…計上しますか？」 — xem hộp thoại cuối " +
                          "trong danh sách trên để biết đã rẽ đi đâu.");
            }

            var text = Txt.N(Dialogs.TextOf(any));
            var buttons = ButtonNames(any);

            // Nhận ra nhánh SAI trước khi tra luật: 入金指定 không phải hộp thoại hỏi
            // đáp, và trả lời nó kiểu gì cũng không kéo về được nhánh G.
            if (Txt.Has(text, BranchFMarker))
            {
                trace?.Note($"hop thoai [{trail.Count + 1}]: cua so 入金指定 (frm203027) — DAU HIEU NHANH F");
                trace?.Shot($"hop-thoai-{trail.Count + 1}-nhanh-F");
                // 戻る: nút lui của chính cửa sổ đó. Nhãn là 「F10\n戻る」 nên phải so CHỨA.
                var backed = Dialogs.ClickButtonContaining(any, "戻る", "Cancel", "Close");
                trail.Add(new Seen(text, backed ? "F10 戻る (lui)" : "(KHONG BAM DUOC)", buttons));
                return new Walk(false, trail, null, BranchFDiagnosis);
            }

            var rule = Rules.FirstOrDefault(r => Txt.Has(text, r.Contains));

            // Mặc định phủ định cho hộp thoại LẠ: an toàn với hộp thoại kiểu "có ghi
            // không?", nhưng SAI với kiểu "có tiếp tục không?" — nên mọi hộp thoại
            // 「…続けますか」 phải có luật riêng ở trên. Lượt chạy đầu đã vấp đúng chỗ này.
            var answer = rule.Buttons ?? ["いいえ", "No", "キャンセル", "Cancel"];
            var why = rule.Why ?? "KHONG KHOP LUAT NAO — tra loi phu dinh; neu day la hop " +
                                  "thoai kieu 「…続けますか」 thi PHAI them luat rieng";

            trace?.Note($"hop thoai [{trail.Count + 1}]: 「{text}」 nut={string.Join("/", buttons)}");
            trace?.Note($"  -> tra loi 「{answer[0]}」 ({why})");
            trace?.Shot($"hop-thoai-{trail.Count + 1}");

            if (!Dialogs.ClickButton(any, answer))
            {
                trail.Add(new Seen(text, "(KHONG BAM DUOC)", buttons));
                trace?.Note($"  !! khong co nut nao trong {string.Join("/", answer)} — dung lai");
                return new Walk(false, trail, null,
                    $"Cửa sổ cuối không có nút nào trong {string.Join("/", answer)}. Nếu nó là " +
                    "FORM chứ không phải MessageBox thì đừng thêm luật — hãy hỏi vì sao chuỗi " +
                    "lại đi qua đó (xem BranchFMarker).");
            }

            trail.Add(new Seen(text, answer[0], buttons));
            Waits.Step();
        }

        trace?.Note("cham tran 8 hop thoai — nghi vong lap, dung lai");
        return new Walk(false, trail, null, "Chạm trần 8 hộp thoại — nghi vòng lặp.");
    }

    /// <summary>
    /// Trả lời hộp thoại 「…計上しますか？」 và trả về nguyên văn để đối chiếu.
    /// </summary>
    public static string Answer(Window dialog, bool yes, TestTrace? trace = null)
    {
        var text = Txt.N(Dialogs.TextOf(dialog));
        var names = yes ? new[] { "はい", "Yes" } : ["いいえ", "No"];

        trace?.Note($"hop thoai dich: 「{text}」");
        trace?.Shot("hop-thoai-chgaccdata");
        trace?.Step($"tra loi 「{names[0]}」 cho 会計データ修正");

        if (!Dialogs.ClickButton(dialog, names))
            throw new InvalidOperationException(
                $"Hộp thoại 「{ChgAccDataFragment}」 không có nút 「{names[0]}」. " +
                $"Các nút đang có: {string.Join("/", ButtonNames(dialog))}.");

        Waits.Step();
        return text;
    }

    /// <summary>
    /// Đóng màn 窓口精算 (frm204002) nếu F8 đã mở nó, trả app về chỗ mở lại 診療入力 được.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO CẦN
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Sau khi <c>LetAccData2</c> trả true, handler F8 <b>ĐÓNG 診療入力</b> rồi mở
    /// 窓口精算 (frm203002.cs:7741-7742: <c>showForm(ID204002); this.Close();</c>).
    /// Testcase sau đó không còn cửa sổ nào để thao tác, mà lỗi báo ra sẽ là
    /// 「không thấy tab 個別」 — chỉ người đọc đi sửa locator, hoàn toàn sai địa chỉ.
    ///
    /// <para><c>AppNavigator.OpenTreatmentEntry</c> tự nó không cứu được: 診療入力 đã
    /// đóng, 患者選択 đang ẩn (<c>GAMEN_HIDE</c>) nên bộ lọc IsOnScreen không thấy, còn
    /// メインメニュー thì bị 窓口精算 che. Phải đóng 窓口精算 trước đã.</para>
    ///
    /// <para>Bấm 「F10 戻る」 — nút lui chuẩn của màn đó. Không dùng nút X: BaseForm bật
    /// <c>CS_NOCLOSE</c> (BaseForm.cs:43-57).</para>
    /// </summary>
    /// <returns>true nếu vừa đóng 窓口精算; false nếu nó không mở.</returns>
    public static bool LeaveCounterPayment(OchaApp app, TestTrace? trace = null)
    {
        var seisan = app.Window("frm204002");
        if (seisan is null) return false;

        trace?.Note("F8 da dong 診療入力 va mo 窓口精算 — bam 「F10 戻る」 de lui");
        if (!Dialogs.ClickButtonContaining(seisan, "戻る", "Back"))
            throw new InvalidOperationException(
                "Màn 窓口精算 đang mở nhưng không thấy nút 「F10 戻る」 để lui. " +
                "Không đóng được thì testcase sau không mở lại được 診療入力.");

        Waits.Step();
        return true;
    }

    /// <summary>
    /// Kích hoạt 会計. Click nút <c>btnF8</c> — cùng lý do với 登録 ở luồng
    /// ParitySaveData: nhãn F8 không đồng nghĩa với phím F8, và ô lưới đang soạn
    /// thảo sẽ nuốt phím.
    /// </summary>
    private static void TriggerAccounting(Window screen, TestTrace? trace)
    {
        screen.Focus();
        var btn = Uia.ByIdOrName(screen, "btnF8", "会計", FlaUI.Core.Definitions.ControlType.Button);
        if (btn is not null)
        {
            trace?.Note($"kich hoat 会計 bang CLICK nut 「{Uia.NameOf(btn)}」 (btnF8)");
            Uia.MouseClick(btn);
            return;
        }

        trace?.Note("KHONG thay nut btnF8 — lui ve gui phim F8");
        Keyboard.Press(VirtualKeyShort.F8);
    }

    private static string[] ButtonNames(Window d)
    {
        try
        {
            return d.FindAllDescendants(cf =>
                    cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button))
                .Select(b => Uia.NameOf(b).Replace("&", ""))
                .Where(n => n.Length > 0)
                .ToArray();
        }
        catch { return []; }
    }
}
