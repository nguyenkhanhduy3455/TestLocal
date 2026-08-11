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

    /// <summary>Một hộp thoại đã gặp trên đường đi.</summary>
    public sealed record Seen(string Text, string Answered, string[] Buttons);

    /// <param name="Reached">Có tới được hộp thoại 「…計上しますか？」 không.</param>
    /// <param name="Trail">Mọi hộp thoại đã gặp, theo thứ tự — đây là chuỗi THẬT.</param>
    public sealed record Walk(bool Reached, IReadOnlyList<Seen> Trail, Window? Target);

    /// <summary>
    /// Luật trả lời cho các hộp thoại TRUNG GIAN.
    ///
    /// <para>Mục tiêu là đi tới nhánh G (会計データ修正): 会計 cũ phải GIỮ NGUYÊN, nên
    /// hộp thoại 「既に…会計処理…されています」 phải trả lời <b>いいえ</b> (modAcc.cs:567) —
    /// trả lời はい là tạo 会計 mới và không bao giờ tới được ChgAccData.</para>
    ///
    /// <para>Khớp theo thứ tự trong mảng; cái nào khớp trước dùng cái đó.</para>
    /// </summary>
    private static readonly (string Contains, string[] Buttons, string Why)[] Rules =
    [
        ("会計処理",   ["いいえ", "No"],  "giữ 会計 cũ ⇒ mới rẽ được sang nhánh G"),
        ("既に",       ["いいえ", "No"],  "cùng ý trên, phòng khi câu chữ khác"),
        ("増えています", ["いいえ", "No"], "không tạo dòng 差額 — nhánh F, không phải G"),
        ("差額",       ["いいえ", "No"],  "cùng lý do"),
    ];

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
                return new Walk(false, trail, null);
            }

            var text = Txt.N(Dialogs.TextOf(any));
            var buttons = ButtonNames(any);
            var rule = Rules.FirstOrDefault(r => Txt.Has(text, r.Contains));

            var answer = rule.Buttons ?? ["いいえ", "No", "キャンセル", "Cancel"];
            var why = rule.Why ?? "khong khop luat nao — tra loi phu dinh cho an toan";

            trace?.Note($"hop thoai [{trail.Count + 1}]: 「{text}」 nut={string.Join("/", buttons)}");
            trace?.Note($"  -> tra loi 「{answer[0]}」 ({why})");
            trace?.Shot($"hop-thoai-{trail.Count + 1}");

            if (!Dialogs.ClickButton(any, answer))
            {
                trail.Add(new Seen(text, "(KHONG BAM DUOC)", buttons));
                trace?.Note($"  !! khong co nut nao trong {string.Join("/", answer)} — dung lai");
                return new Walk(false, trail, null);
            }

            trail.Add(new Seen(text, answer[0], buttons));
            Waits.Step();
        }

        trace?.Note("cham tran 8 hop thoai — nghi vong lap, dung lai");
        return new Walk(false, trail, null);
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
